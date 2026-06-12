import { randomUUID } from 'node:crypto';
import type { World, WorldNet } from './World.js';
import type { Player } from './Player.js';
import { saveEloResult } from '../db/supabase.js';

// Zona reservada como arena de duelo (se reutiliza el layout de la Base).
const DUEL_ARENA_ZONE = 0;

export interface Duel {
  id: string;
  a: Player; b: Player;
  startedAt: number;
}

// Matchmaking 1v1 + ciclo de vida de duelos, autoritativo en el servidor.
export class DuelManager {
  private queue: string[] = [];                 // userIds esperando 1v1
  private duels = new Map<string, Duel>();      // id → duelo

  constructor(private world: World, private net: WorldNet) {}

  list(): Duel[] { return [...this.duels.values()]; }

  enqueue(userId: string) {
    const p = this.world.getByUser(userId);
    if (!p || p.inDuel) return;
    if (this.queue.includes(userId)) return;
    this.queue.push(userId);
    this.net.emitToUser(userId, 'duel', { state: 'searching' });
    this.net.emitToUser(userId, 'log', { msg: '🔍 Buscando oponente 1v1…', color: '#88ddff' });
    this.tryMatch();
  }

  dequeue(userId: string) {
    if (!this.queue.includes(userId)) return;
    this.queue = this.queue.filter(id => id !== userId);
    this.net.emitToUser(userId, 'duel', { state: 'idle' });
    this.net.emitToUser(userId, 'log', { msg: 'Búsqueda de duelo cancelada.', color: '#8a7a60' });
  }

  private tryMatch() {
    while (this.queue.length >= 2) {
      const aId = this.queue.shift()!;
      const bId = this.queue.shift()!;
      const a = this.world.getByUser(aId);
      const b = this.world.getByUser(bId);
      if (!a || !b) { if (a) this.queue.unshift(aId); if (b) this.queue.unshift(bId); break; }
      this.start(a, b);
    }
  }

  private start(a: Player, b: Player) {
    const id = randomUUID().slice(0, 8);
    a.inDuel = id; b.inDuel = id;
    // Restaurar a tope para el duelo
    a.hp = a.maxHp; a.energy = a.maxEnergy; a.isGhost = false;
    b.hp = b.maxHp; b.energy = b.maxEnergy; b.isGhost = false;
    a.zoneIdx = DUEL_ARENA_ZONE; b.zoneIdx = DUEL_ARENA_ZONE;
    a.tx = 40; a.ty = 40; b.tx = 60; b.ty = 40;
    this.duels.set(id, { id, a, b, startedAt: Date.now() });

    for (const [me, foe] of [[a, b], [b, a]] as const) {
      this.net.emitToUser(me.userId, 'forceZone', { zoneIdx: DUEL_ARENA_ZONE, tx: me.tx, ty: me.ty });
      this.net.emitToUser(me.userId, 'you', { hp: me.hp, energy: me.energy, isGhost: false });
      this.net.emitToUser(me.userId, 'duel', { state: 'started', opponentId: foe.userId, opponent: foe.username });
      this.net.emitToUser(me.userId, 'log', { msg: `⚔ Duelo vs ${foe.username}. ¡A pelear!`, color: '#ff8844' });
    }
  }

  // Llamado por World cuando un jugador en duelo muere.
  reportDeath(userId: string) {
    for (const d of this.duels.values()) {
      if (d.a.userId === userId || d.b.userId === userId) {
        const loser = d.a.userId === userId ? d.a : d.b;
        const winner = loser === d.a ? d.b : d.a;
        this.end(d, winner, loser);
        return;
      }
    }
  }

  private end(d: Duel, winner: Player, loser: Player) {
    this.duels.delete(d.id);
    winner.inDuel = null; loser.inDuel = null;
    this.net.emitToUser(winner.userId, 'log', { msg: `🏆 Ganaste el duelo vs ${loser.username}!`, color: '#66e06a' });
    this.net.emitToUser(loser.userId, 'log', { msg: `💀 Perdiste el duelo vs ${winner.username}.`, color: '#ff4444' });
    this.net.emitToUser(winner.userId, 'duel', { state: 'ended', won: true });
    this.net.emitToUser(loser.userId, 'duel', { state: 'ended', won: false });
    void saveEloResult(winner.userId, loser.userId);
    // Revivir a ambos y devolverlos a la base (zona 0).
    for (const pl of [winner, loser]) {
      pl.isGhost = false; pl.ghostTimer = 0;
      pl.hp = pl.maxHp; pl.energy = pl.maxEnergy;
      pl.cc = null; pl.ccTimer = 0; pl.shield = 0;
      pl.zoneIdx = 0; pl.tx = 50; pl.ty = 70;
      this.net.emitToUser(pl.userId, 'forceZone', { zoneIdx: 0, tx: pl.tx, ty: pl.ty });
      this.net.emitToUser(pl.userId, 'you', { hp: pl.hp, energy: pl.energy, isGhost: false });
    }
  }

  // Si un jugador se desconecta, su oponente gana por abandono.
  handleDisconnect(userId: string) {
    this.dequeue(userId);
    for (const d of this.duels.values()) {
      if (d.a.userId === userId || d.b.userId === userId) {
        const winner = d.a.userId === userId ? d.b : d.a;
        const loser = d.a.userId === userId ? d.a : d.b;
        this.end(d, winner, loser);
        return;
      }
    }
  }
}
