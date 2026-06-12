// Verifica que el websocket del juego funcione a través de la URL pública del
// túnel (no solo HTTP). Pasá la URL como argumento.
//   npx tsx scripts/tuneltest.ts https://xxxx.trycloudflare.com
import { io } from 'socket.io-client';

const url = process.argv[2];
if (!url) { console.error('Falta la URL del túnel'); process.exit(1); }

let joined = false, snap = 0;
const s = io(`${url}/game`, { transports: ['websocket'] });
s.on('connect', () => { console.log('• websocket conectado por el túnel'); s.emit('join', { userId: 'tunnel-1', username: 'TunnelBot', classId: 'cuchilla', charId: 't1' }); });
s.on('connect_error', (e) => console.error('✗ connect_error:', e.message));
s.on('joined', () => { joined = true; });
s.on('snapshot', () => { snap++; });

setTimeout(() => {
  const ok = joined && snap > 0;
  console.log(`  joined: ${joined ? '✓' : '✗'}   snapshots: ${snap}`);
  console.log(ok ? '✓ WEBSOCKET OK por internet — un amigo puede jugar con esta URL' : '✗ el websocket no pasó por el túnel');
  s.close(); process.exit(ok ? 0 : 1);
}, 5000);
