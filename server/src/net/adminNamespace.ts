import type { Namespace, Socket } from 'socket.io';
import { World } from '../world/World.js';
import { CONFIG } from '../config.js';

// Mapa socketId → zona que está spectando (para enviarle snapshots de esa zona).
const spectating = new Map<string, number>();

export function getSpectators() { return spectating; }

export function setupAdminNamespace(ns: Namespace, world: World) {
  // Auth por token en el handshake
  ns.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (token !== CONFIG.adminToken) return next(new Error('unauthorized'));
    next();
  });

  ns.on('connection', (socket: Socket) => {
    socket.emit('hello', { ok: true });

    socket.on('spectate', (m: { zoneIdx: number }) => {
      spectating.set(socket.id, m.zoneIdx);
    });
    socket.on('spectate_stop', () => { spectating.delete(socket.id); });

    // Kick: la consola puede expulsar a un jugador
    socket.on('kick', (m: { userId: string }) => {
      const p = world.getByUser(m.userId);
      if (p) ns.server.of('/game').to(p.socketId).disconnectSockets(true);
    });

    socket.on('disconnect', () => spectating.delete(socket.id));
  });
}
