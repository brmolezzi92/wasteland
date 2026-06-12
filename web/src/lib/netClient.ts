// Cliente de red: conecta al servidor autoritativo por socket.io.
// Reemplaza el sistema peer-host basado en Supabase Realtime.
import { io, type Socket } from 'socket.io-client';
import type {
  ZoneSnapshot, FxEvent, YouUpdate, JoinedMsg, NetPlayer, CastIntent, DuelMsg,
} from './protocol';

// URL del servidor resuelta en runtime, en este orden de prioridad:
//   1. ?server=<url> en la URL (se guarda para próximas visitas) — ideal para
//      compartir un link a tu amigo con tu túnel actual.
//   2. localStorage 'serverUrl' (lo que guardaste / pegaste en el menú).
//   3. VITE_SERVER_URL del build.
//   4. SOLO en dev local: localhost:8787.
// IMPORTANTE: en producción NUNCA cae a localhost. Si no hay nada configurado
// devuelve '' y el cliente avisa en vez de pegarle silenciosamente a la propia
// máquina del jugador (que es lo que rompía el multiplayer).
const clean = (u: string) => u.trim().replace(/\/+$/, '');

export function resolveServerUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q) { localStorage.setItem('serverUrl', clean(q)); return clean(q); }
    const ls = localStorage.getItem('serverUrl');
    if (ls) return clean(ls);
  } catch { /* SSR / sin window */ }
  if (import.meta.env.VITE_SERVER_URL) return clean(import.meta.env.VITE_SERVER_URL);
  // Dev local: vite (5173) y server (8787) son orígenes distintos → localhost:8787.
  if (import.meta.env.DEV) return 'http://localhost:8787';
  // Prod: por defecto el MISMO origen que sirvió la página. Cuando el server de
  // juego sirve el cliente (a través del túnel), esto apunta al túnel — nunca a
  // localhost. Si abrís el cliente desde otro lado (ej. Vercel), usá el chip 🖧.
  try { return clean(location.origin); } catch { return ''; }
}

export function setServerUrl(url: string) {
  const c = clean(url);
  if (c) localStorage.setItem('serverUrl', c);
  else localStorage.removeItem('serverUrl');
}

export function getServerUrl(): string { return resolveServerUrl(); }

export interface NetHandlers {
  onJoined: (m: JoinedMsg) => void;
  onSnapshot: (s: ZoneSnapshot) => void;
  onFx: (fx: FxEvent) => void;
  onYou: (y: YouUpdate) => void;
  onLog: (msg: string, color: string) => void;
  onForceZone: (zoneIdx: number, tx: number, ty: number) => void;
  onConnChange: (connected: boolean) => void;
  onPing: (ms: number) => void;
  onDuel: (m: DuelMsg) => void;
  onParty: (m: { leaderId: string; members: { userId: string; username: string }[] }) => void;
  onPartyInvited: (m: { fromUserId: string; fromUsername: string }) => void;
}

export class NetClient {
  private socket: Socket | null = null;
  private handlers: NetHandlers;
  ping = 0;

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
  }

  serverUrl = '';
  bytesUp = 0; bytesDown = 0;     // acumuladores de tráfico (aprox, por JSON)
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private approx(x: unknown): number { try { return JSON.stringify(x)?.length ?? 0; } catch { return 0; } }

  connect(join: { userId: string; username: string; classId: string; charId: string }) {
    this.serverUrl = resolveServerUrl();
    if (!this.serverUrl) {
      // Sin server configurado en producción: avisamos en vez de pegarle a localhost.
      this.handlers.onConnChange(false);
      this.handlers.onLog(
        '⚠ No hay servidor configurado. Abrí el menú y pegá la URL del túnel en el chip 🖧, o entrá con ?server=<url>.',
        '#ffb43c');
      return;
    }
    this.socket = io(`${this.serverUrl}/game`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 800,
    });

    const s = this.socket;
    // Conteo de tráfico entrante (aprox por tamaño JSON).
    s.onAny((_event, ...args) => { this.bytesDown += this.approx(args); });
    s.on('connect', () => {
      this.handlers.onConnChange(true);
      this.emit('join', join);
      // Medimos el RTT desde el cliente (un solo reloj → número real).
      if (this.pingTimer) clearInterval(this.pingTimer);
      const sendPing = () => { if (s.connected) this.emit('cping', { t: Date.now() }); };
      sendPing();
      this.pingTimer = setInterval(sendPing, 2000);
    });
    s.on('disconnect', () => this.handlers.onConnChange(false));
    s.on('connect_error', () => this.handlers.onConnChange(false));

    s.on('joined', (m: JoinedMsg) => this.handlers.onJoined(m));
    s.on('snapshot', (snap: ZoneSnapshot) => this.handlers.onSnapshot(snap));
    s.on('fx', (fx: FxEvent) => this.handlers.onFx(fx));
    s.on('you', (y: YouUpdate) => this.handlers.onYou(y));
    s.on('log', (l: { msg: string; color: string }) => this.handlers.onLog(l.msg, l.color));
    s.on('forceZone', (m: { zoneIdx: number; tx: number; ty: number }) =>
      this.handlers.onForceZone(m.zoneIdx, m.tx, m.ty));
    s.on('duel', (m: DuelMsg) => this.handlers.onDuel(m));
    s.on('party', (m: { leaderId: string; members: { userId: string; username: string }[] }) => this.handlers.onParty(m));
    s.on('party_invited', (m: { fromUserId: string; fromUsername: string }) => this.handlers.onPartyInvited(m));

    // Ping: el server hace eco de nuestro timestamp; calculamos RTT con NUESTRO reloj.
    s.on('cpong', (m: { t: number }) => {
      this.ping = Date.now() - m.t;          // RTT real (sin desfase de relojes)
      this.emit('rtt', { ms: this.ping });   // se lo reportamos al server para la consola
      this.handlers.onPing(this.ping);
    });
  }

  // ── Intents salientes ──────────────────────────────────────────────────────
  private emit(event: string, payload?: unknown) {
    this.bytesUp += this.approx([event, payload]);
    this.socket?.emit(event, payload);
  }
  move(tx: number, ty: number, facing: number, moving: boolean) {
    this.emit('move', { tx, ty, facing, moving });
  }
  zone(zoneIdx: number) { this.emit('zone', { zoneIdx }); }
  cast(intent: CastIntent) { this.emit('cast', intent); }
  pickup(tx: number, ty: number) { this.emit('pickup', { tx, ty }); }
  usePotion(slot: number) { this.emit('usePotion', { slot }); }
  matchmake() { this.emit('matchmake'); }
  matchmakeCancel() { this.emit('matchmake_cancel'); }
  partyInvite(targetUserId: string) { this.emit('party_invite', { targetUserId }); }
  partyAccept() { this.emit('party_accept'); }
  partyDecline() { this.emit('party_decline'); }
  partyKick(targetUserId: string) { this.emit('party_kick', { targetUserId }); }
  partyLeave() { this.emit('party_leave'); }

  disconnect() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
  }
}

export type { ZoneSnapshot, FxEvent, YouUpdate, JoinedMsg, NetPlayer, CastIntent };
