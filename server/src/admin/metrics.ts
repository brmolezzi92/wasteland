import { World } from '../world/World.js';
import { CONFIG } from '../config.js';
import type { AdminMetrics, AdminPlayerInfo, AdminDuelInfo } from '../net/protocol.js';
import type { DuelManager } from '../world/Duels.js';

const startedAt = Date.now();

export function buildMetrics(world: World, duels: DuelManager): AdminMetrics {
  const players: AdminPlayerInfo[] = [];
  for (const p of world.players.values()) {
    players.push({
      userId: p.userId, username: p.username, classId: p.classId,
      zoneIdx: p.zoneIdx, zoneName: world.zoneName(p.zoneIdx),
      tx: p.tx, ty: p.ty, hp: Math.round(p.hp), maxHp: p.maxHp,
      ping: Math.round(p.ping), connectedAt: p.connectedAt,
      socketId: p.socketId, inDuel: p.inDuel,
    });
  }
  players.sort((a, b) => a.username.localeCompare(b.username));

  const duelList: AdminDuelInfo[] = duels.list().map(d => ({
    id: d.id,
    a: { userId: d.a.userId, username: d.a.username, hp: Math.round(d.a.hp) },
    b: { userId: d.b.userId, username: d.b.username, hp: Math.round(d.b.hp) },
    startedAt: d.startedAt,
  }));

  // Población por zona (solo zonas activas)
  const zoneMap = new Map<number, { players: number; enemiesAlive: number }>();
  for (const p of world.players.values()) {
    const e = zoneMap.get(p.zoneIdx) ?? { players: 0, enemiesAlive: 0 };
    e.players++; zoneMap.set(p.zoneIdx, e);
  }
  for (const [zi, agg] of zoneMap) {
    const z = world.zones.get(zi);
    if (z) agg.enemiesAlive = z.enemies.filter(e => e.alive).length;
  }
  const zonePopulation = [...zoneMap.entries()]
    .map(([zoneIdx, agg]) => ({ zoneIdx, zoneName: world.zoneName(zoneIdx), players: agg.players, enemiesAlive: agg.enemiesAlive }))
    .sort((a, b) => a.zoneIdx - b.zoneIdx);

  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    tickRate: CONFIG.tickRate,
    serverTick: world.serverTick,
    playersOnline: world.players.size,
    players,
    duels: duelList,
    zonePopulation,
  };
}
