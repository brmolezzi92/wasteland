import { TILE, ZONE_NAMES, ZONE_COUNT } from '../shared/tilemap.js';
import { SPELLS, ITEMS, CC_AOE_MULT } from '../shared/gameData.js';
import { Zone, type FxEvent } from './Zone.js';
import { Player } from './Player.js';
import { calcSpellDamage, applyDamageToPlayer } from './combat.js';
import type { NetPlayer, NetEnemy, NetGroundItem, ZoneSnapshot } from '../net/protocol.js';

// Interfaz de red inyectada (la implementa la capa socket.io con rooms).
export interface WorldNet {
  emitToUser(userId: string, event: string, payload: unknown): void;
  emitToZone(zoneIdx: number, event: string, payload: unknown): void;
}

function targetMode(dt: string): 'instant' | 'ground' | 'enemy' | 'ally' {
  if (['self', 'aoe_self', 'melee_area', 'aoe_heal'].includes(dt)) return 'instant';
  if (dt === 'resurrect' || dt === 'single_target_heal') return 'ally';
  if (dt === 'aoe_targeted') return 'ground';
  return 'enemy';
}

export class World {
  zones = new Map<number, Zone>();
  players = new Map<string, Player>();      // userId → Player
  bySocket = new Map<string, string>();     // socketId → userId
  serverTick = 0;
  onPlayerDeath: ((userId: string) => void) | null = null;
  // Resuelve compañeros de party (lo setea index.ts con el PartyManager).
  coMembers: ((userId: string) => string[]) | null = null;

  constructor(private net: WorldNet) {}

  zone(idx: number): Zone {
    let z = this.zones.get(idx);
    if (!z) { z = new Zone(idx); this.zones.set(idx, z); }
    return z;
  }

  playersInZone(idx: number): Player[] {
    const out: Player[] = [];
    for (const p of this.players.values()) if (p.zoneIdx === idx) out.push(p);
    return out;
  }

  // ── Ciclo de vida del jugador ──────────────────────────────────────────────
  addPlayer(p: Player) {
    const z = this.zone(p.zoneIdx);
    p.spawnTx = z.map.playerSpawn.tx; p.spawnTy = z.map.playerSpawn.ty;
    p.tx = z.map.playerSpawn.tx; p.ty = z.map.playerSpawn.ty;
    this.players.set(p.userId, p);
    this.bySocket.set(p.socketId, p.userId);
  }

  removePlayerBySocket(socketId: string) {
    const userId = this.bySocket.get(socketId);
    if (!userId) return;
    this.bySocket.delete(socketId);
    this.players.delete(userId);
  }

  // Reconexión: el mismo jugador vuelve con un socket nuevo. Conserva su estado
  // (posición, hp, zona, inventario) — no se crea un jugador nuevo.
  rebindSocket(p: Player, newSocketId: string) {
    this.bySocket.delete(p.socketId);
    p.socketId = newSocketId;
    this.bySocket.set(newSocketId, p.userId);
  }

  getByUser(userId: string) { return this.players.get(userId); }

  // ── Acciones entrantes ─────────────────────────────────────────────────────
  handleMove(userId: string, tx: number, ty: number, facing: number, moving: boolean) {
    const p = this.players.get(userId); if (!p) return;
    const z = this.zone(p.zoneIdx);
    // Validación anti-teleport: solo aceptar saltos de ≤2 tiles o dentro de la zona
    if (tx < 0 || tx >= z.map.width || ty < 0 || ty >= z.map.height) return;
    if (z.map.isSolid(tx, ty)) return;
    p.tx = tx; p.ty = ty; p.facing = facing; p.moving = moving;
  }

  handleZoneChange(userId: string, zoneIdx: number) {
    const p = this.players.get(userId); if (!p) return;
    if (zoneIdx < 0 || zoneIdx >= ZONE_COUNT) return;
    p.zoneIdx = zoneIdx;
    const z = this.zone(zoneIdx);
    p.spawnTx = z.map.playerSpawn.tx; p.spawnTy = z.map.playerSpawn.ty;
  }

  handlePickup(userId: string, tx: number, ty: number) {
    const p = this.players.get(userId); if (!p || p.isGhost) return;
    const z = this.zone(p.zoneIdx);
    if (p.tx !== tx || p.ty !== ty) return;
    const it = z.pickupAt(tx, ty);
    if (!it) return;
    p.addItem(it.itemId, it.qty);
    this.net.emitToUser(userId, 'you', { inventory: p.inventory });
    this.net.emitToUser(userId, 'log', { msg: `+${it.qty} ${z.itemName(it.itemId)}`, color: '#ffe080' });
  }

  handleUsePotion(userId: string, slot: number) {
    const p = this.players.get(userId); if (!p) return;
    if (p.potionCd > 0) return;
    const s = p.inventory[slot]; if (!s) return;
    const data = ITEMS[s.itemId];
    if (!data || data.type !== 'consumable') return;
    if (data.restore_hp) p.hp = Math.min(p.maxHp, p.hp + data.restore_hp);
    if (data.restore_mp) p.energy = Math.min(p.maxEnergy, p.energy + data.restore_mp);
    s.qty--; if (s.qty <= 0) p.inventory[slot] = null;
    p.potionCd = 0.5;
    this.net.emitToUser(userId, 'you', { hp: p.hp, energy: p.energy, inventory: p.inventory });
  }

  handleCast(userId: string, msg: { spellId: string; enemyIdx?: number; targetUserId?: string; wx?: number; wy?: number; allyUserId?: string }) {
    const p = this.players.get(userId); if (!p || p.isGhost) return;
    const idx = p.spellIds.indexOf(msg.spellId);
    if (idx === -1) return;
    const sp = SPELLS[msg.spellId]; if (!sp) return;
    const cost = sp.energy_cost || 0;
    if (p.spellCd[idx] > 0 || p.energy < cost) return;

    const z = this.zone(p.zoneIdx);
    const mode = targetMode(sp.damage_type);
    const color = (sp.color[0] << 16) | (sp.color[1] << 8) | sp.color[2];
    const pcx = p.tx * TILE + TILE / 2, pcy = p.ty * TILE + TILE / 2;
    const cc = sp.cc || null;

    if (mode === 'instant') {
      if (sp.damage_type === 'self') {
        if (sp.shield) { p.shield = sp.shield; p.shieldTimer = sp.shield_duration || 5; }
        if (sp.invisible_duration) { p.isInvisible = true; p.invisTimer = sp.invisible_duration; }
        if (sp.cleanse) { p.cc = null; p.ccTimer = 0; }
        this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'explosion', wx: pcx, wy: pcy, color, amount: sp.aoe_radius || 64 });
      } else if (sp.damage_type === 'aoe_heal') {
        // Cura a uno mismo + compañeros de party en el radio.
        const heal = Math.round((sp.heal_base || 0) * (sp.heal_multiplier || 0.55));
        const r = sp.aoe_radius || 140;
        this.healPlayer(p, heal);
        const mates = this.coMembers ? this.coMembers(userId) : [userId];
        for (const mid of mates) {
          if (mid === userId) continue;
          const m = this.players.get(mid);
          if (!m || m.zoneIdx !== p.zoneIdx || m.isGhost) continue;
          const mwx = m.tx * TILE + TILE / 2, mwy = m.ty * TILE + TILE / 2;
          if (Math.hypot(mwx - pcx, mwy - pcy) <= r) this.healPlayer(m, heal);
        }
        this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'explosion', wx: pcx, wy: pcy, color, amount: r });
      } else {
        // aoe_self / melee_area: daño alrededor del jugador (enemigos + oponente de duelo)
        const r = sp.aoe_radius || 64;
        const dmg = calcSpellDamage(sp, p.baseDamage);
        const dead = z.damageRadius(pcx, pcy, r, dmg, cc, (sp.cc_duration || 1.5) * CC_AOE_MULT);
        this.damageDuelOpponentsInRadius(p, pcx, pcy, r, dmg);
        this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'explosion', wx: pcx, wy: pcy, color, amount: r });
        for (const e of dead) this.net.emitToUser(userId, 'log', { msg: `${e.name} fue eliminado.`, color: '#ff4444' });
      }
    } else if (mode === 'ground') {
      const r = sp.aoe_radius || 96;
      const dmg = calcSpellDamage(sp, p.baseDamage);
      const wx = msg.wx ?? pcx, wy = msg.wy ?? pcy;
      const dead = z.damageRadius(wx, wy, r, dmg, cc, (sp.cc_duration || 1.5) * CC_AOE_MULT);
      this.damageDuelOpponentsInRadius(p, wx, wy, r, dmg);
      this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'explosion', wx, wy, color, amount: r });
      for (const e of dead) this.net.emitToUser(userId, 'log', { msg: `${e.name} fue eliminado.`, color: '#ff4444' });
    } else if (mode === 'enemy') {
      // PvP: objetivo es otro jugador (solo válido contra el oponente del duelo)
      if (msg.targetUserId) {
        const foe = this.players.get(msg.targetUserId);
        const sameduel = foe && p.inDuel && p.inDuel === foe.inDuel;
        if (foe && sameduel && !foe.isGhost) {
          const dmg = calcSpellDamage(sp, p.baseDamage);
          const fwx = foe.tx * TILE + TILE / 2, fwy = foe.ty * TILE + TILE / 2;
          if (sp.effect === 'projectile')
            this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'projectile', wx: pcx, wy: pcy, wx2: fwx, wy2: fwy, color });
          this.damagePlayer(foe.userId, dmg, fwx, fwy);
          this.net.emitToUser(userId, 'log', { msg: `Golpeaste a ${foe.username} por ${dmg}.`, color: '#ffb43c' });
        }
      } else {
        const e = msg.enemyIdx != null ? z.enemies[msg.enemyIdx] : null;
        if (e && e.alive) {
          const dmg = calcSpellDamage(sp, p.baseDamage);
          const ewx = e.tx * TILE + TILE / 2, ewy = e.ty * TILE + TILE / 2;
          const died = z.hitEnemy(e, dmg, cc, sp.cc_duration || 0);
          if (sp.effect === 'projectile') {
            this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'projectile', wx: pcx, wy: pcy, wx2: ewx, wy2: ewy, color });
          }
          this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'hit', wx: ewx, wy: ewy, amount: dmg, color: 0xff5050, text: `-${dmg}` });
          this.net.emitToUser(userId, 'log', { msg: `Atacaste a ${e.name} por ${dmg}. HP: ${Math.round(e.hp)}/${e.maxHp}`, color: '#ffb43c' });
          if (died) this.net.emitToUser(userId, 'log', { msg: `${e.name} fue eliminado.`, color: '#ff4444' });
        }
      }
    } else if (mode === 'ally') {
      // Curación single-target o resurrección sobre un aliado de party (o sobre uno mismo).
      const mates = this.coMembers ? this.coMembers(userId) : [userId];
      const targetId = msg.allyUserId && mates.includes(msg.allyUserId) ? msg.allyUserId : userId;
      const target = this.players.get(targetId);
      if (target && target.zoneIdx === p.zoneIdx) {
        const twx = target.tx * TILE + TILE / 2, twy = target.ty * TILE + TILE / 2;
        if (sp.damage_type === 'resurrect') {
          if (target.isGhost) {
            target.isGhost = false; target.ghostTimer = 0;
            target.hp = Math.round(target.maxHp * 0.4);
            this.net.emitToUser(targetId, 'forceZone', { zoneIdx: target.zoneIdx, tx: target.tx, ty: target.ty });
            this.net.emitToUser(targetId, 'you', { hp: target.hp, isGhost: false });
            this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'heal', wx: twx, wy: twy, amount: target.hp, color });
            this.net.emitToUser(userId, 'log', { msg: `Reviviste a ${target.username}.`, color: '#66e0c0' });
          } else {
            this.net.emitToUser(userId, 'log', { msg: `${target.username} no está caído.`, color: '#c8a050' });
          }
        } else {
          const heal = sp.heal_base || 0;
          this.healPlayer(target, heal);
          this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'heal', wx: twx, wy: twy, amount: heal, color });
          const who = targetId === userId ? 'te' : `a ${target.username}`;
          this.net.emitToUser(userId, 'log', { msg: `Curaste ${who} por ${heal}.`, color: '#66e0c0' });
        }
      }
    }

    p.energy -= cost;
    p.spellCd[idx] = sp.cooldown || 1.5;
    this.net.emitToUser(userId, 'you', { energy: p.energy });
  }

  // Cura a un jugador y le notifica su HP autoritativo.
  private healPlayer(target: Player, heal: number) {
    if (heal <= 0 || target.isGhost) return;
    target.hp = Math.min(target.maxHp, target.hp + heal);
    this.net.emitToUser(target.userId, 'you', { hp: target.hp });
  }

  // Daño AoE a oponentes de duelo dentro del radio (no toca jugadores neutrales).
  private damageDuelOpponentsInRadius(attacker: Player, wx: number, wy: number, r: number, dmg: number) {
    if (!attacker.inDuel) return;
    for (const foe of this.playersInZone(attacker.zoneIdx)) {
      if (foe === attacker || foe.isGhost) continue;
      if (foe.inDuel !== attacker.inDuel) continue;
      const fwx = foe.tx * TILE + TILE / 2, fwy = foe.ty * TILE + TILE / 2;
      if (Math.hypot(fwx - wx, fwy - wy) <= r) this.damagePlayer(foe.userId, dmg, fwx, fwy);
    }
  }

  // ── Tick principal ─────────────────────────────────────────────────────────
  tick(dt: number) {
    this.serverTick++;
    for (const p of this.players.values()) {
      const wasGhost = p.isGhost;
      p.tick(dt);
      if (wasGhost && !p.isGhost) {
        // respawneó
        this.net.emitToUser(p.userId, 'forceZone', { zoneIdx: p.zoneIdx, tx: p.tx, ty: p.ty });
        this.net.emitToUser(p.userId, 'you', { hp: p.hp, energy: p.energy, isGhost: false });
      }
    }

    // Solo tickear zonas con jugadores (ahorra CPU)
    const activeZones = new Set<number>();
    for (const p of this.players.values()) activeZones.add(p.zoneIdx);

    for (const zi of activeZones) {
      const z = this.zone(zi);
      const playersHere = this.playersInZone(zi);
      z.tick(dt, playersHere,
        (uid, dmg, wx, wy) => this.damagePlayer(uid, dmg, wx, wy),
        (fx: FxEvent) => this.net.emitToZone(zi, 'fx', fx),
      );
    }
  }

  private damagePlayer(userId: string, dmg: number, wx: number, wy: number) {
    const p = this.players.get(userId); if (!p) return;
    const red = applyDamageToPlayer(p, dmg);
    if (red <= 0) return;
    this.net.emitToUser(userId, 'you', { hp: p.hp, isInvisible: p.isInvisible });
    this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'hit', wx, wy, amount: red, color: 0xff5a5a, text: `-${red}`, targetUserId: userId });
    this.net.emitToUser(userId, 'log', { msg: `Recibiste ${red} de daño. HP: ${Math.round(p.hp)}/${p.maxHp}`, color: '#ff6060' });
    if (p.hp <= 0 && !p.isGhost) {
      p.die();
      this.net.emitToUser(userId, 'you', { hp: 0, isGhost: true });
      this.net.emitToUser(userId, 'log', { msg: 'Fuiste eliminado. Respawn en 18s…', color: '#ff4444' });
      this.net.emitToZone(p.zoneIdx, 'fx', { kind: 'death', wx, wy, targetUserId: userId });
      this.onPlayerDeath?.(userId);
    }
  }

  // ── Snapshots ──────────────────────────────────────────────────────────────
  netPlayer(p: Player): NetPlayer {
    return {
      userId: p.userId, username: p.username, classId: p.classId,
      tx: p.tx, ty: p.ty, hp: Math.round(p.hp), maxHp: p.maxHp,
      energy: Math.round(p.energy), maxEnergy: p.maxEnergy,
      facing: p.facing, moving: p.moving, isGhost: p.isGhost,
    };
  }

  snapshot(zoneIdx: number): ZoneSnapshot {
    const z = this.zone(zoneIdx);
    const enemies: NetEnemy[] = z.enemies.map(e => ({
      idx: e.idx, name: e.name, kind: e.kind, tx: e.tx, ty: e.ty,
      hp: Math.round(e.hp), maxHp: e.maxHp, alive: e.alive, facing: e.facing, cc: e.cc,
    }));
    const items: NetGroundItem[] = z.items.map(it => ({ itemId: it.itemId, qty: it.qty, tx: it.tx, ty: it.ty }));
    const players: NetPlayer[] = this.playersInZone(zoneIdx).map(p => this.netPlayer(p));
    return { zoneIdx, tick: this.serverTick, enemies, items, players };
  }

  zoneName(idx: number) { return ZONE_NAMES[idx] ?? `Zona ${idx}`; }
}
