// Verifica el ping nuevo: cliente mide RTT (cping→cpong) y lo reporta al
// server (rtt), que lo muestra en la consola. npx tsx scripts/pingcheck.ts
import { io } from 'socket.io-client';
import { CONFIG } from '../src/config.js';

const base = `http://localhost:${CONFIG.port}`;
const s = io(`${base}/game`, { transports: ['websocket'] });
let rtt = -1;
s.on('connect', () => {
  s.emit('join', { userId: 'ping-1', username: 'Pinger', classId: 'operador', charId: 'p1' });
  s.on('cpong', (m: { t: number }) => { rtt = Date.now() - m.t; s.emit('rtt', { ms: rtt }); });
  s.emit('cping', { t: Date.now() });
});

const admin = io(`${base}/admin`, { auth: { token: CONFIG.adminToken }, transports: ['websocket'] });
let adminPing = -1;
admin.on('metrics', (mm: { players: { userId: string; ping: number }[] }) => {
  const p = mm.players.find(x => x.userId === 'ping-1');
  if (p) adminPing = p.ping;
});

setTimeout(() => {
  console.log(`RTT medido por el cliente: ${rtt}ms  (localhost ~0 es correcto)`);
  console.log(`Ping que ve la consola:    ${adminPing}ms`);
  const ok = rtt >= 0 && adminPing >= 0;
  console.log(ok ? '✓ OK: el ping real fluye cliente → server → consola' : '✗ FALLÓ');
  s.close(); admin.close();
  process.exit(ok ? 0 : 1);
}, 2500);
