import express from 'express';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import pc from 'picocolors';

import { CONFIG, TICK_MS, SNAPSHOT_MS, ADMIN_MS } from './config.js';
import { World, type WorldNet } from './world/World.js';
import { DuelManager } from './world/Duels.js';
import { setupGameNamespace } from './net/gameNamespace.js';
import { setupAdminNamespace, getSpectators } from './net/adminNamespace.js';
import { buildMetrics } from './admin/metrics.js';
import { hasDb } from './db/supabase.js';

const here = dirname(fileURLToPath(import.meta.url));

// ── HTTP + estáticos ─────────────────────────────────────────────────────────
const app = express();
const webDist = resolve(here, '../../web/dist');   // build del cliente (vite)

// Consola admin
app.use('/admin', express.static(resolve(here, '../public/admin')));
app.get('/health', (_req, res) => res.json({ ok: true, tick: world.serverTick, players: world.players.size }));

// El juego: el server también sirve el cliente buildeado. Así un amigo abre la
// URL del túnel y obtiene el juego + el websocket desde el mismo origen (tu PC).
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/socket.io') || req.path === '/health') return next();
  res.sendFile(resolve(webDist, 'index.html'), (err) => {
    if (err) res.status(503).send('El cliente no está buildeado. Corré: cd web && npm run build');
  });
});

const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

const gameNs = io.of('/game');
const adminNs = io.of('/admin');

// ── Red inyectada al mundo (resuelve userId→socket y rooms de zona) ──────────
const net: WorldNet = {
  emitToUser(userId, event, payload) {
    const p = world.getByUser(userId);
    if (p) gameNs.to(p.socketId).emit(event, payload);
  },
  emitToZone(zoneIdx, event, payload) {
    gameNs.to(`zone:${zoneIdx}`).emit(event, payload);
  },
};

const world = new World(net);
const duels = new DuelManager(world, net);
world.onPlayerDeath = (uid) => duels.reportDeath(uid);

setupGameNamespace(gameNs, world, duels);
setupAdminNamespace(adminNs, world);

// ── Bucles del servidor ──────────────────────────────────────────────────────
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  world.tick(dt);
}, TICK_MS);

setInterval(() => {
  const active = new Set<number>();
  for (const p of world.players.values()) active.add(p.zoneIdx);
  for (const zi of active) gameNs.to(`zone:${zi}`).emit('snapshot', world.snapshot(zi));
}, SNAPSHOT_MS);

setInterval(() => {
  const metrics = buildMetrics(world, duels);
  adminNs.emit('metrics', metrics);
  // Snapshots de spectate por consola
  const spectators = getSpectators();
  for (const [socketId, zoneIdx] of spectators) {
    adminNs.to(socketId).emit('spectate', {
      zoneIdx, zoneName: world.zoneName(zoneIdx), snapshot: world.snapshot(zoneIdx),
    });
  }
}, ADMIN_MS);

// ── Arranque ───────────────────────────────────────────────────────────────
http.listen(CONFIG.port, () => {
  console.log(pc.green('━'.repeat(56)));
  console.log(pc.green(pc.bold('  WASTELAND — Servidor autoritativo')));
  console.log(pc.green('━'.repeat(56)));
  console.log(`  ${pc.dim('Puerto:')}      ${pc.cyan(String(CONFIG.port))}`);
  console.log(`  ${pc.dim('Tick rate:')}   ${pc.cyan(String(CONFIG.tickRate))} Hz`);
  console.log(`  ${pc.dim('Juego:')}       ${pc.cyan(`http://localhost:${CONFIG.port}/`)}`);
  console.log(`  ${pc.dim('Consola web:')} ${pc.cyan(`http://localhost:${CONFIG.port}/admin`)}`);
  console.log(`  ${pc.dim('Admin token:')} ${pc.yellow(CONFIG.adminToken)}`);
  console.log(`  ${pc.dim('Persistencia:')} ${hasDb() ? pc.green('Supabase ON') : pc.yellow('OFF (modo prueba)')}`);
  console.log(pc.green('━'.repeat(56)));
  console.log(pc.dim('  TUI:    npm run tui   |   Túnel: npm run tunnel'));
});
