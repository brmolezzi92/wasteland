// Test de duelo PvP: dos jugadores se encolan, el server los empareja, uno
// golpea al otro hasta matarlo y el duelo termina. Server arriba.
// npx tsx scripts/dueltest.ts
import { io, type Socket } from 'socket.io-client';
import { CONFIG } from '../src/config.js';

const base = `http://localhost:${CONFIG.port}/game`;
const mk = (userId: string, username: string) =>
  io(base, { transports: ['websocket'], query: {} }).on('connect', function (this: Socket) {
    this.emit('join', { userId, username, classId: 'cuchilla', charId: userId });
    setTimeout(() => this.emit('matchmake'), 400);
  });

const a = mk('duel-A', 'Atacante');
const b = mk('duel-B', 'Defensor');

let started = false, ended = false, aFoeId = '', bMinHp = 999, dmgEvents = 0;

a.on('duel', (m) => {
  if (m.state === 'started') { started = true; aFoeId = m.opponentId; console.log(`• A: duelo iniciado vs ${m.opponent}`); }
  if (m.state === 'ended') { ended = true; console.log(`• A: duelo terminado (won=${m.won})`); }
});
b.on('duel', (m) => {
  if (m.state === 'started') console.log(`• B: duelo iniciado vs ${m.opponent}`);
  if (m.state === 'ended') console.log(`• B: duelo terminado (won=${m.won})`);
});
// B observa su HP bajar via 'you' (rastreo el mínimo: el fin de duelo lo revive)
b.on('you', (y) => { if (typeof y.hp === 'number') bMinHp = Math.min(bMinHp, y.hp); });
a.on('fx', (fx) => { if (fx.kind === 'projectile' || fx.kind === 'hit') dmgEvents++; });

// A castea sobre B repetidamente una vez iniciado el duelo
const interval = setInterval(() => {
  if (started && aFoeId && !ended) {
    a.emit('cast', { spellId: 'tajo_codigo', targetUserId: aFoeId });
  }
}, 250);

setTimeout(() => {
  clearInterval(interval);
  console.log('\n── Resultado ──');
  console.log(`  duelo inició:        ${started ? '✓' : '✗'}`);
  console.log(`  HP de B bajó:        ${bMinHp < 180 ? '✓' : '✗'} (mín ${bMinHp})`);
  console.log(`  duelo terminó:       ${ended ? '✓' : '✗'}`);
  console.log(`  fx de combate:       ${dmgEvents > 0 ? '✓' : '✗'} (${dmgEvents})`);
  const ok = started && bMinHp < 180 && ended;
  console.log(`\n  ${ok ? '✓ DUELO FUNCIONAL' : '✗ FALLÓ'}`);
  a.close(); b.close();
  process.exit(ok ? 0 : 1);
}, 9000);
