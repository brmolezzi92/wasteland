// ─── Protocolo de red Wasteland (socket.io) ─────────────────────────────────
// Este archivo define el contrato cliente↔servidor. Su gemelo vive en
// web/src/lib/protocol.ts — mantener ambos en sync.

// ── Cliente → Servidor (namespace /game) ────────────────────────────────────
export interface C2S {
  // Handshake inicial tras conectar
  join: {
    userId: string;
    username: string;
    classId: string;
    charId: string;
  };
  // El jugador se movió a un tile (movimiento client-reported, server valida)
  move: { tx: number; ty: number; facing: number; moving: boolean };
  // El jugador cambió de zona
  zone: { zoneIdx: number };
  // El jugador lanzó un hechizo. El server valida costo/cooldown y resuelve daño.
  cast: {
    spellId: string;
    // objetivo: índice de enemigo, o coordenada de mundo para AoE, o userId para aliado
    enemyIdx?: number;
    wx?: number;
    wy?: number;
    allyUserId?: string;
  };
  // El jugador intenta recoger el item del piso donde está parado
  pickup: { tx: number; ty: number };
  // El jugador usó una poción (server descuenta del inventario autoritativo)
  usePotion: { slot: number };
  // Latido para medir ping
  ping: { t: number };
}

// ── Servidor → Cliente (namespace /game) ────────────────────────────────────
export interface NetPlayer {
  userId: string;
  username: string;
  classId: string;
  tx: number; ty: number;
  hp: number; maxHp: number;
  energy: number; maxEnergy: number;
  facing: number; moving: boolean;
  isGhost: boolean;
}

export interface NetEnemy {
  idx: number;
  name: string;
  kind: 'enemy' | 'boss';
  tx: number; ty: number;
  hp: number; maxHp: number;
  alive: boolean;
  facing: number;
  cc: string | null;
}

export interface NetGroundItem {
  itemId: string; qty: number; tx: number; ty: number;
}

export interface ZoneSnapshot {
  zoneIdx: number;
  tick: number;
  enemies: NetEnemy[];
  items: NetGroundItem[];
  players: NetPlayer[];
}

export interface S2C {
  // Confirmación de join con estado inicial del jugador
  joined: {
    you: NetPlayer;
    inventory: ({ itemId: string; qty: number } | null)[];
    serverTickRate: number;
  };
  // Snapshot periódico de la zona del jugador
  snapshot: ZoneSnapshot;
  // Eventos puntuales de combate para feedback visual (float text, explosiones)
  fx: {
    kind: 'hit' | 'heal' | 'explosion' | 'projectile' | 'cc' | 'death';
    wx: number; wy: number;
    wx2?: number; wy2?: number;
    amount?: number;
    color?: number;
    text?: string;
    targetUserId?: string;
  };
  // El jugador recibió daño / cambió de HP (autoritativo)
  you: Partial<NetPlayer> & { inventory?: ({ itemId: string; qty: number } | null)[] };
  // Mensaje de log para el feed
  log: { msg: string; color: string };
  // Respuesta de ping
  pong: { t: number };
  // El server fuerza un cambio de zona (p.ej. al morir, o entrar a duelo)
  forceZone: { zoneIdx: number; tx: number; ty: number };
}

// ── Servidor → Consola (namespace /admin) ───────────────────────────────────
export interface AdminPlayerInfo {
  userId: string;
  username: string;
  classId: string;
  zoneIdx: number;
  zoneName: string;
  tx: number; ty: number;
  hp: number; maxHp: number;
  ping: number;
  connectedAt: number;
  socketId: string;
  inDuel: string | null;
}

export interface AdminDuelInfo {
  id: string;
  a: { userId: string; username: string; hp: number };
  b: { userId: string; username: string; hp: number };
  startedAt: number;
}

export interface AdminMetrics {
  uptimeSec: number;
  tickRate: number;
  serverTick: number;
  playersOnline: number;
  players: AdminPlayerInfo[];
  duels: AdminDuelInfo[];
  zonePopulation: { zoneIdx: number; zoneName: string; players: number; enemiesAlive: number }[];
}

export interface AdminSpectate {
  zoneIdx: number;
  zoneName: string;
  snapshot: ZoneSnapshot;
}
