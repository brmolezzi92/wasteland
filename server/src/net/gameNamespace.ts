import type { Namespace, Socket } from 'socket.io';
import { World } from '../world/World.js';
import { DuelManager } from '../world/Duels.js';
import { Player } from '../world/Player.js';
import type { C2S } from './protocol.js';

const zoneRoom = (z: number) => `zone:${z}`;

export function setupGameNamespace(ns: Namespace, world: World, duels: DuelManager) {
  ns.on('connection', (socket: Socket) => {
    let userId = '';

    socket.on('join', (msg: C2S['join']) => {
      userId = msg.userId;
      // Si ya había sesión vieja con ese userId, descartarla
      const prev = world.getByUser(userId);
      if (prev) world.removePlayerBySocket(prev.socketId);

      const p = new Player({ ...msg, socketId: socket.id });
      world.addPlayer(p);
      socket.join(zoneRoom(p.zoneIdx));

      socket.emit('joined', {
        you: world.netPlayer(p),
        inventory: p.inventory,
        serverTickRate: world.serverTick,
      });
      socket.emit('log', { msg: `▶ Conectado al servidor — ${world.zoneName(p.zoneIdx)}`, color: '#88ddff' });
    });

    socket.on('move', (m: C2S['move']) => {
      if (userId) world.handleMove(userId, m.tx, m.ty, m.facing, m.moving);
    });

    socket.on('zone', (m: C2S['zone']) => {
      if (!userId) return;
      const p = world.getByUser(userId); if (!p) return;
      socket.leave(zoneRoom(p.zoneIdx));
      world.handleZoneChange(userId, m.zoneIdx);
      socket.join(zoneRoom(m.zoneIdx));
    });

    socket.on('cast', (m: C2S['cast']) => { if (userId) world.handleCast(userId, m); });
    socket.on('pickup', (m: C2S['pickup']) => { if (userId) world.handlePickup(userId, m.tx, m.ty); });
    socket.on('usePotion', (m: C2S['usePotion']) => { if (userId) world.handleUsePotion(userId, m.slot); });

    socket.on('matchmake', () => { if (userId) duels.enqueue(userId); });
    socket.on('matchmake_cancel', () => { if (userId) duels.dequeue(userId); });

    // Ping: server-initiated cada 2s; el cliente responde 'pong' con el mismo t.
    socket.on('pong', (m: { t: number }) => {
      const p = userId ? world.getByUser(userId) : null;
      if (p) p.ping = Date.now() - m.t;
    });
    const pingTimer = setInterval(() => socket.emit('ping', { t: Date.now() }), 2000);

    socket.on('disconnect', () => {
      clearInterval(pingTimer);
      if (userId) { duels.handleDisconnect(userId); world.removePlayerBySocket(socket.id); }
    });
  });
}
