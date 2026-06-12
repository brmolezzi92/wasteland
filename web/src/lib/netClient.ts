// Cliente de red: conecta al servidor autoritativo por socket.io.
// Reemplaza el sistema peer-host basado en Supabase Realtime.
import { io, type Socket } from 'socket.io-client';
import type {
  ZoneSnapshot, FxEvent, YouUpdate, JoinedMsg, NetPlayer, CastIntent, DuelMsg,
} from './protocol';

// URL del servidor. En dev apunta a localhost; en prod/túnel se configura
// con VITE_SERVER_URL (la URL https del túnel ngrok/cloudflared).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';

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
}

export class NetClient {
  private socket: Socket | null = null;
  private handlers: NetHandlers;
  ping = 0;

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
  }

  connect(join: { userId: string; username: string; classId: string; charId: string }) {
    this.socket = io(`${SERVER_URL}/game`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 800,
    });

    const s = this.socket;
    s.on('connect', () => {
      this.handlers.onConnChange(true);
      s.emit('join', join);
    });
    s.on('disconnect', () => this.handlers.onConnChange(false));

    s.on('joined', (m: JoinedMsg) => this.handlers.onJoined(m));
    s.on('snapshot', (snap: ZoneSnapshot) => this.handlers.onSnapshot(snap));
    s.on('fx', (fx: FxEvent) => this.handlers.onFx(fx));
    s.on('you', (y: YouUpdate) => this.handlers.onYou(y));
    s.on('log', (l: { msg: string; color: string }) => this.handlers.onLog(l.msg, l.color));
    s.on('forceZone', (m: { zoneIdx: number; tx: number; ty: number }) =>
      this.handlers.onForceZone(m.zoneIdx, m.tx, m.ty));
    s.on('duel', (m: DuelMsg) => this.handlers.onDuel(m));

    // Ping: el server inicia, respondemos con el mismo timestamp.
    s.on('ping', (m: { t: number }) => {
      const now = Date.now();
      this.ping = now - m.t;       // aprox una vía; el RTT real lo mide el server
      s.emit('pong', { t: m.t });
      this.handlers.onPing(this.ping);
    });
  }

  // ── Intents salientes ──────────────────────────────────────────────────────
  move(tx: number, ty: number, facing: number, moving: boolean) {
    this.socket?.emit('move', { tx, ty, facing, moving });
  }
  zone(zoneIdx: number) { this.socket?.emit('zone', { zoneIdx }); }
  cast(intent: CastIntent) { this.socket?.emit('cast', intent); }
  pickup(tx: number, ty: number) { this.socket?.emit('pickup', { tx, ty }); }
  usePotion(slot: number) { this.socket?.emit('usePotion', { slot }); }
  matchmake() { this.socket?.emit('matchmake'); }
  matchmakeCancel() { this.socket?.emit('matchmake_cancel'); }

  disconnect() {
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
  }
}

export type { ZoneSnapshot, FxEvent, YouUpdate, JoinedMsg, NetPlayer, CastIntent };
