import { TileMap, TILE } from '../shared/tilemap.js';
import { ITEMS } from '../shared/gameData.js';
import type { ServerEnemy, ServerGroundItem, CC } from './types.js';
import type { Player } from './Player.js';

export interface FxEvent {
  kind: 'hit' | 'heal' | 'explosion' | 'projectile' | 'cc' | 'death';
  wx: number; wy: number; wx2?: number; wy2?: number;
  amount?: number; color?: number; text?: string; targetUserId?: string;
}

interface PendingHit { t: number; targetUserId: string; dmg: number; wx: number; wy: number; }

// Una zona del mundo (100×80). El servidor corre su IA y posee enemigos+items.
export class Zone {
  readonly zoneIdx: number;
  map: TileMap;
  enemies: ServerEnemy[] = [];
  items: ServerGroundItem[] = [];
  private pendingHits: PendingHit[] = [];

  constructor(zoneIdx: number) {
    this.zoneIdx = zoneIdx;
    this.map = new TileMap(zoneIdx);
    this.spawnEnemies();
    this.spawnItems();
  }

  private spawnEnemies() {
    let idx = 0;
    for (const { tx, ty, name, hp } of this.map.enemies)
      this.enemies.push(this.mkEnemy(idx++, 'enemy', name, tx, ty, hp));
    if (this.map.boss) {
      const { tx, ty, name, hp } = this.map.boss;
      this.enemies.push(this.mkEnemy(idx++, 'boss', name, tx, ty, hp));
    }
  }

  private mkEnemy(idx: number, kind: 'enemy' | 'boss', name: string, tx: number, ty: number, hp: number): ServerEnemy {
    return { idx, name, kind, tx, ty, hp, maxHp: hp, alive: true, facing: 1, cc: null, ccTimer: 0, atkCd: 0, moveCd: 0 };
  }

  spawnItems() {
    const ids = this.map.groundItemIds;
    const count = this.map.groundItemCount;
    let placed = 0, attempts = 0;
    while (placed < count && attempts < 3000) {
      attempts++;
      const tx = Math.floor(Math.random() * this.map.width);
      const ty = Math.floor(Math.random() * this.map.height);
      if (this.map.isSolid(tx, ty)) continue;
      if (this.items.some(it => it.tx === tx && it.ty === ty)) continue;
      const itemId = ids[Math.floor(Math.random() * ids.length)];
      this.items.push({ itemId, qty: 1, tx, ty });
      placed++;
    }
  }

  private solidOrOccupied(tx: number, ty: number, players: Player[], self: ServerEnemy): boolean {
    if (this.map.isSolid(tx, ty)) return true;
    for (const e of this.enemies) if (e !== self && e.alive && e.tx === tx && e.ty === ty) return true;
    for (const p of players) if (!p.isGhost && p.tx === tx && p.ty === ty) return true;
    return false;
  }

  // Corre IA de la zona. `players` = jugadores en esta zona.
  // damage(userId, dmg) lo resuelve World (armadura/escudo/muerte). fx() difunde visuales.
  tick(dt: number, players: Player[], damage: (userId: string, dmg: number, wx: number, wy: number) => void, fx: (e: FxEvent) => void) {
    // Resolver golpes en vuelo (proyectiles de boss)
    const keep: PendingHit[] = [];
    for (const ph of this.pendingHits) {
      ph.t -= dt;
      if (ph.t <= 0) damage(ph.targetUserId, ph.dmg, ph.wx, ph.wy);
      else keep.push(ph);
    }
    this.pendingHits = keep;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.ccTimer > 0) { e.ccTimer -= dt; if (e.ccTimer <= 0) e.cc = null; }
      e.atkCd = Math.max(0, e.atkCd - dt);
      e.moveCd = Math.max(0, e.moveCd - dt);
      if (e.cc === 'stun') continue;

      // Jugador más cercano y visible
      let target: Player | null = null;
      let minDist = Infinity;
      for (const p of players) {
        if (p.isGhost) continue;
        const d = Math.hypot(e.tx - p.tx, e.ty - p.ty);
        const visible = !p.isInvisible || d <= 1.5;
        if (visible && d < minDist) { minDist = d; target = p; }
      }
      if (!target) continue;

      const dist = minDist;
      if (target.tx !== e.tx) e.facing = target.tx > e.tx ? 1 : -1;
      const melee  = e.kind === 'boss' ? 1.6 : 1.5;
      const detect = e.kind === 'boss' ? 18 : 9;
      const ewx = e.tx * TILE + TILE / 2, ewy = e.ty * TILE + TILE / 2;
      const twx = target.tx * TILE + TILE / 2, twy = target.ty * TILE + TILE / 2;

      // Melee
      if (dist <= melee && e.atkCd <= 0) {
        const dmg = e.kind === 'boss' ? 22 : 9;
        e.atkCd = e.kind === 'boss' ? 1.0 : 1.4;
        damage(target.userId, dmg, twx, twy);
      }
      // Boss ranged
      if (e.kind === 'boss' && dist <= 9 && dist > 1.6 && e.atkCd <= 0) {
        e.atkCd = 1.6;
        fx({ kind: 'projectile', wx: ewx, wy: ewy, wx2: twx, wy2: twy, color: 0xff5040 });
        const travel = Math.hypot(twx - ewx, twy - ewy) / 500;
        this.pendingHits.push({ t: travel, targetUserId: target.userId, dmg: 18, wx: twx, wy: twy });
      }

      // Movimiento hacia el objetivo
      const canMove = e.cc !== 'root';
      if (canMove && e.moveCd <= 0 && dist <= detect && dist > melee) {
        const sx = Math.sign(target.tx - e.tx), sy = Math.sign(target.ty - e.ty);
        const tries = Math.abs(target.tx - e.tx) >= Math.abs(target.ty - e.ty)
          ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
        for (const [mx, my] of tries) {
          if ((mx || my) && !this.solidOrOccupied(e.tx + mx, e.ty + my, players, e)) {
            e.tx += mx; e.ty += my; break;
          }
        }
        e.moveCd = e.cc === 'slow' ? 0.9 : 0.5;
      }
    }
  }

  // ── Acciones de jugador resueltas por el servidor ──────────────────────────
  enemyAt(tx: number, ty: number): ServerEnemy | null {
    for (const e of this.enemies) if (e.alive && e.tx === tx && e.ty === ty) return e;
    return null;
  }

  hitEnemy(e: ServerEnemy, dmg: number, cc: string | null, ccDur: number): boolean {
    if (!e.alive || dmg <= 0) return false;
    e.hp = Math.max(0, e.hp - dmg);
    // No sobrescribir un stun activo con un CC menor
    if (cc && !(e.cc === 'stun' && cc !== 'stun')) {
      e.cc = cc as CC; e.ccTimer = ccDur;
    }
    if (e.hp <= 0) { e.alive = false; return true; }
    return false;
  }

  // Daño en radio (AoE). Devuelve enemigos muertos.
  damageRadius(wx: number, wy: number, r: number, dmg: number, cc: string | null, ccDur: number): ServerEnemy[] {
    const dead: ServerEnemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = e.tx * TILE + TILE / 2, ey = e.ty * TILE + TILE / 2;
      if (Math.hypot(ex - wx, ey - wy) <= r) {
        if (this.hitEnemy(e, dmg, cc, ccDur)) dead.push(e);
      }
    }
    return dead;
  }

  pickupAt(tx: number, ty: number): ServerGroundItem | null {
    const i = this.items.findIndex(it => it.tx === tx && it.ty === ty);
    if (i === -1) return null;
    const [it] = this.items.splice(i, 1);
    return it;
  }

  itemName(itemId: string): string {
    return ITEMS[itemId]?.name ?? itemId;
  }
}
