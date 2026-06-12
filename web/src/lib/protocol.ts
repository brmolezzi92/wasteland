// ─── Protocolo de red Wasteland (cliente) ───────────────────────────────────
// Espejo de server/src/net/protocol.ts — mantener en sync.

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

export interface FxEvent {
  kind: 'hit' | 'heal' | 'explosion' | 'projectile' | 'cc' | 'death';
  wx: number; wy: number;
  wx2?: number; wy2?: number;
  amount?: number;
  color?: number;
  text?: string;
  targetUserId?: string;
}

export interface YouUpdate {
  hp?: number; energy?: number; isGhost?: boolean; isInvisible?: boolean;
  inventory?: ({ itemId: string; qty: number } | null)[];
  tx?: number; ty?: number;
}

export interface JoinedMsg {
  you: NetPlayer;
  inventory: ({ itemId: string; qty: number } | null)[];
  serverTickRate: number;
}

export interface CastIntent {
  spellId: string;
  enemyIdx?: number;
  wx?: number;
  wy?: number;
  allyUserId?: string;
}
