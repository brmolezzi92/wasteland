// Consola TUI: se conecta al server por el namespace /admin y muestra una
// tabla viva de jugadores, duelos y zonas. Correr con: npm run tui
import { io } from 'socket.io-client';
import Table from 'cli-table3';
import pc from 'picocolors';
import { CONFIG } from '../config.js';
import type { AdminMetrics } from '../net/protocol.js';

const url = `http://localhost:${CONFIG.port}/admin`;
const socket = io(url, { auth: { token: CONFIG.adminToken } });

socket.on('connect_error', (e) => {
  console.error(pc.red(`No se pudo conectar a ${url}: ${e.message}`));
});

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

socket.on('metrics', (m: AdminMetrics) => {
  console.clear();
  console.log(pc.green(pc.bold('  WASTELAND — Consola del servidor')));
  console.log(pc.dim(`  uptime ${fmtUptime(m.uptimeSec)}  ·  tick ${m.serverTick}  ·  ${m.tickRate}Hz  ·  ${pc.cyan(m.playersOnline + ' online')}`));
  console.log('');

  if (m.players.length) {
    const t = new Table({ head: ['Jugador', 'Clase', 'Zona', 'Pos', 'HP', 'Ping', 'Duelo'].map(h => pc.cyan(h)) });
    for (const p of m.players) {
      const hp = `${p.hp}/${p.maxHp}`;
      const ping = p.ping < 100 ? pc.green(`${p.ping}ms`) : p.ping < 200 ? pc.yellow(`${p.ping}ms`) : pc.red(`${p.ping}ms`);
      t.push([pc.bold(p.username), p.classId, p.zoneName, `${p.tx},${p.ty}`, hp, ping, p.inDuel ?? '—']);
    }
    console.log(t.toString());
  } else {
    console.log(pc.dim('  (sin jugadores conectados)'));
  }

  if (m.duels.length) {
    console.log('');
    console.log(pc.magenta(pc.bold('  Duelos activos:')));
    for (const d of m.duels)
      console.log(`   ⚔ ${d.a.username} (${d.a.hp}hp) vs ${d.b.username} (${d.b.hp}hp)  [${d.id}]`);
  }

  if (m.zonePopulation.length) {
    console.log('');
    console.log(pc.dim('  Zonas activas: ' + m.zonePopulation.map(z => `${z.zoneName}(${z.players}p/${z.enemiesAlive}e)`).join('  ·  ')));
  }
});

console.log(pc.dim(`Conectando a ${url} …`));
