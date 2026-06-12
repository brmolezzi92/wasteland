// Expone el servidor local a internet con un túnel, para que un amigo se
// conecte a tu PC. Intenta cloudflared (sin cuenta) y cae a ngrok.
// Correr: npm run tunnel  (con el server ya levantado en otra terminal)
import { spawn } from 'node:child_process';
import { CONFIG } from '../src/config.js';

const target = `http://localhost:${CONFIG.port}`;

console.log(`Exponiendo ${target} a internet…`);
console.log('La URL pública (https://...) que aparezca abajo es la que tu amigo');
console.log('pone en el cliente como VITE_SERVER_URL.\n');

// cloudflared: tunnel rápido sin login
const cf = spawn('cloudflared', ['tunnel', '--url', target], { stdio: 'inherit', shell: true });
cf.on('error', () => {
  console.log('\ncloudflared no está instalado. Probando ngrok…\n');
  const ng = spawn('ngrok', ['http', String(CONFIG.port)], { stdio: 'inherit', shell: true });
  ng.on('error', () => {
    console.error('\nNi cloudflared ni ngrok están instalados.');
    console.error('Instalá uno:');
    console.error('  cloudflared:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    console.error('  ngrok:        https://ngrok.com/download');
  });
});
