// Bot de prueba: se conecta y deambula por una zona para ver vida en la
// consola. Útil para probar el dashboard/TUI sin abrir el juego.
// npx tsx scripts/bot.ts [nombre] [zona]
import { io } from 'socket.io-client';
import { CONFIG } from '../src/config.js';

const name = process.argv[2] ?? 'Wanderer';
const zone = Number(process.argv[3] ?? 1);
const s = io(`http://localhost:${CONFIG.port}/game`, { transports: ['websocket'] });

let tx = 50, ty = 60;
s.on('connect', () => {
  s.emit('join', { userId: `bot-${name}`, username: name, classId: 'artillero', charId: 'b1' });
  setTimeout(() => s.emit('zone', { zoneIdx: zone }), 500);
  setInterval(() => {
    tx += Math.round(Math.random() * 2 - 1);
    ty += Math.round(Math.random() * 2 - 1);
    tx = Math.max(2, Math.min(97, tx)); ty = Math.max(2, Math.min(77, ty));
    s.emit('move', { tx, ty, facing: Math.random() > 0.5 ? 1 : -1, moving: true });
  }, 400);
});
console.log(`Bot "${name}" deambulando en zona ${zone}. Ctrl+C para salir.`);
