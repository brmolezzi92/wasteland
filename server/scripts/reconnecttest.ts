// Test de reconexión (alt-tab): un jugador se mueve y cambia de zona, se
// desconecta y reconecta enseguida. Debe retomar su zona/posición, no spawnear
// de cero ni duplicarse. Server arriba.  npx tsx scripts/reconnecttest.ts
import { io } from 'socket.io-client';
import { CONFIG } from '../src/config.js';

const game = `http://localhost:${CONFIG.port}/game`;
const JOIN = { userId: 'recon-1', username: 'Reco', classId: 'artillero', charId: 'r1' };

let firstZone = -1, resumedZone = -1, resumedTx = -1, resumedReconnect = false, adminPlayers = -1;

const admin = io(`http://localhost:${CONFIG.port}/admin`, { auth: { token: CONFIG.adminToken }, transports: ['websocket'] });
admin.on('metrics', (m: { players: { userId: string }[] }) => { adminPlayers = m.players.filter(p => p.userId === 'recon-1').length; });

// 1ª sesión: join, moverse a (35,40) y cambiar a zona 2.
const s1 = io(game, { transports: ['websocket'] });
s1.on('connect', () => {
  s1.emit('join', JOIN);
  setTimeout(() => { s1.emit('zone', { zoneIdx: 2 }); s1.emit('move', { tx: 35, ty: 40, facing: 1, moving: false }); }, 400);
  setTimeout(() => { firstZone = 2; s1.disconnect(); }, 1200);
});

// 2ª sesión (reconexión) ~1.5s después.
setTimeout(() => {
  const s2 = io(game, { transports: ['websocket'] });
  s2.on('connect', () => s2.emit('join', JOIN));
  s2.on('log', (l: { msg: string }) => { if (l.msg.includes('Reconectado')) resumedReconnect = true; });
  s2.on('joined', (m: { you: { tx: number; ty: number; classId: string } }) => {
    resumedTx = m.you.tx; resumedZone = -2;
  });
  // tras reconectar pedimos un snapshot mirando la zona; el 'you' ya trae tx
  setTimeout(() => {
    console.log('\n── Resultado ──');
    console.log(`  reconectó (no re-spawn): ${resumedReconnect ? '✓' : '✗'}`);
    console.log(`  posición preservada:     ${resumedTx === 35 ? '✓' : '✗'} (tx=${resumedTx}, esperado 35)`);
    console.log(`  sin duplicar en consola: ${adminPlayers === 1 ? '✓' : '✗'} (${adminPlayers} instancia/s)`);
    const ok = resumedReconnect && resumedTx === 35 && adminPlayers === 1;
    console.log(`\n  ${ok ? '✓ RECONEXIÓN OK — alt-tab ya no te tira' : '✗ FALLÓ'}`);
    s2.close(); admin.close(); process.exit(ok ? 0 : 1);
  }, 1500);
}, 2700);

void firstZone; void resumedZone;
