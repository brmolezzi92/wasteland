import type { Namespace, Socket } from 'socket.io';
import { World } from '../world/World.js';
import { DuelManager } from '../world/Duels.js';
import { PartyManager } from '../world/Parties.js';
import { Player } from '../world/Player.js';
import type { C2S } from './protocol.js';

const zoneRoom = (z: number) => `zone:${z}`;

// Período de gracia tras una desconexión (alt-tab, micro-corte de red): el
// jugador queda "en limbo" y si vuelve a conectar en esta ventana, retoma su
// estado intacto. Recién al expirar se lo saca del mundo de verdad.
const RECONNECT_GRACE_MS = 45_000;

export function setupGameNamespace(ns: Namespace, world: World, duels: DuelManager, parties: PartyManager) {
  // userId → timeout de remoción pendiente (cancelado si reconecta).
  const pendingRemoval = new Map<string, ReturnType<typeof setTimeout>>();

  ns.on('connection', (socket: Socket) => {
    let userId = '';

    socket.on('join', (msg: C2S['join']) => {
      userId = msg.userId;

      // Cancelar cualquier remoción pendiente de una sesión anterior.
      const pending = pendingRemoval.get(userId);
      if (pending) { clearTimeout(pending); pendingRemoval.delete(userId); }

      // Reconexión: si el jugador sigue en el mundo, retoma su estado.
      const existing = world.getByUser(userId);
      if (existing) {
        world.rebindSocket(existing, socket.id);
        socket.join(zoneRoom(existing.zoneIdx));
        socket.emit('joined', { you: world.netPlayer(existing), inventory: existing.inventory, serverTickRate: world.serverTick });
        socket.emit('log', { msg: `🔄 Reconectado — ${world.zoneName(existing.zoneIdx)}`, color: '#66e06a' });
        return;
      }

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

    // Party
    socket.on('party_invite', (m: { targetUserId: string }) => { if (userId) parties.invite(userId, m.targetUserId); });
    socket.on('party_accept', () => { if (userId) parties.accept(userId); });
    socket.on('party_decline', () => { if (userId) parties.decline(userId); });
    socket.on('party_kick', (m: { targetUserId: string }) => { if (userId) parties.kick(userId, m.targetUserId); });
    socket.on('party_leave', () => { if (userId) parties.leave(userId); });

    // Ping: el cliente inicia ('cping'), el server hace eco ('cpong') para que
    // el cliente calcule su RTT con un solo reloj. El cliente nos reporta el RTT
    // medido ('rtt') para mostrarlo en la consola admin.
    socket.on('cping', (m: { t: number }) => socket.emit('cpong', { t: m.t }));
    socket.on('rtt', (m: { ms: number }) => {
      const p = userId ? world.getByUser(userId) : null;
      if (p) p.ping = Math.max(0, Math.round(m.ms));
    });

    socket.on('disconnect', () => {
      if (!userId) return;
      const p = world.getByUser(userId);
      // Solo programamos la remoción si este socket sigue siendo el del jugador
      // (si ya reconectó con otro socket, no tocamos nada).
      if (!p || p.socketId !== socket.id) return;
      const uid = userId;
      const timer = setTimeout(() => {
        pendingRemoval.delete(uid);
        const still = world.getByUser(uid);
        if (still && still.socketId === socket.id) {
          duels.handleDisconnect(uid);
          parties.handleDisconnect(uid);
          world.removePlayerBySocket(socket.id);
        }
      }, RECONNECT_GRACE_MS);
      pendingRemoval.set(uid, timer);
    });
  });
}
