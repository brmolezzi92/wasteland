// Smoke test: simula un jugador conectándose al servidor y verifica que
// recibe joined + snapshots, y que la consola admin lo ve. Correr con el
// server levantado: npx tsx scripts/smoketest.ts
import { io } from 'socket.io-client';
import { CONFIG } from '../src/config.js';

const base = `http://localhost:${CONFIG.port}`;
let gotJoined = false, gotSnapshot = false, snapshotEnemies = 0, adminSawPlayer = false;

const game = io(`${base}/game`, { transports: ['websocket'] });
game.on('connect', () => {
  console.log('• /game conectado, enviando join…');
  game.emit('join', { userId: 'smoke-1', username: 'SmokeBot', classId: 'cuchilla', charId: 'c1' });
  setTimeout(() => game.emit('move', { tx: 50, ty: 70, facing: 1, moving: true }), 300);
  // Cambiar a zona 1 (Praderas) que sí tiene enemigos
  setTimeout(() => { console.log('• cambiando a zona 1 (Praderas)…'); game.emit('zone', { zoneIdx: 1 }); }, 800);
});
game.on('joined', (m) => { gotJoined = true; console.log(`• joined: hp=${m.you.hp} inv=${m.inventory.filter((x: unknown) => x).length} slots`); });
game.on('snapshot', (s) => { gotSnapshot = true; snapshotEnemies = s.enemies.length; });
game.on('log', (l) => console.log(`  log: ${l.msg}`));

const admin = io(`${base}/admin`, { auth: { token: CONFIG.adminToken }, transports: ['websocket'] });
admin.on('connect', () => console.log('• /admin conectado'));
admin.on('connect_error', (e) => console.error('✗ /admin rechazado:', e.message));
admin.on('metrics', (m) => { if (m.players.some((p: { userId: string }) => p.userId === 'smoke-1')) adminSawPlayer = true; });

setTimeout(() => {
  console.log('\n── Resultado ──');
  console.log(`  joined recibido:        ${gotJoined ? '✓' : '✗'}`);
  console.log(`  snapshot recibido:      ${gotSnapshot ? '✓' : '✗'} (${snapshotEnemies} enemigos)`);
  console.log(`  admin vio al jugador:   ${adminSawPlayer ? '✓' : '✗'}`);
  const ok = gotJoined && gotSnapshot && adminSawPlayer && snapshotEnemies > 0;
  console.log(`\n  ${ok ? '✓ TODO OK' : '✗ FALLÓ'}`);
  game.close(); admin.close();
  process.exit(ok ? 0 : 1);
}, 2500);
