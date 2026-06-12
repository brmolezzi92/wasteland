/* Consola web de Wasteland. Se conecta al namespace /admin por socket.io. */
const ZONE_W = 100, ZONE_H = 80;
let socket = null;
let specZone = null;     // zona que estamos spectando
let lastSpec = null;     // último snapshot de spectate

const $ = (id) => document.getElementById(id);
const tokenInput = $('token');
tokenInput.value = localStorage.getItem('adminToken') || '';

$('connectBtn').onclick = connect;
$('specStop').onclick = stopSpectate;

function connect() {
  const token = tokenInput.value.trim();
  localStorage.setItem('adminToken', token);
  if (socket) socket.disconnect();
  socket = io('/admin', { auth: { token } });

  socket.on('connect', () => setConn(true));
  socket.on('disconnect', () => setConn(false));
  socket.on('connect_error', (e) => { setConn(false); alert('Conexión rechazada: ' + e.message); });
  socket.on('metrics', renderMetrics);
  socket.on('spectate', (s) => { lastSpec = s; $('specHint').style.display = 'none'; });
}

function setConn(on) {
  $('connDot').classList.toggle('on', on);
}

function fmtUptime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function pingClass(p) { return p < 100 ? 'ping-ok' : p < 200 ? 'ping-warn' : 'ping-bad'; }

function renderMetrics(m) {
  $('uptime').textContent = fmtUptime(m.uptimeSec);
  $('tick').textContent = m.serverTick;
  $('online').textContent = m.playersOnline;

  // Jugadores
  const rows = $('playerRows');
  rows.innerHTML = '';
  $('playerEmpty').style.display = m.players.length ? 'none' : 'block';
  for (const p of m.players) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${esc(p.username)}</b></td>
      <td>${esc(p.classId)}</td>
      <td>${esc(p.zoneName)}</td>
      <td>${p.tx},${p.ty}</td>
      <td>${p.hp}/${p.maxHp}</td>
      <td class="${pingClass(p.ping)}">${p.ping}ms</td>
      <td>${p.inDuel ? '<span class="pill duel">duelo</span>' : '<span class="pill">mundo</span>'}</td>
      <td>
        <button class="ghost mini" data-spec="${p.zoneIdx}" title="Spectear zona">👁</button>
        <button class="ghost mini" data-kick="${esc(p.userId)}" title="Expulsar">⏏</button>
      </td>`;
    rows.appendChild(tr);
  }
  rows.querySelectorAll('[data-spec]').forEach(b =>
    b.onclick = () => startSpectate(Number(b.dataset.spec)));
  rows.querySelectorAll('[data-kick]').forEach(b =>
    b.onclick = () => { if (confirm('¿Expulsar a este jugador?')) socket.emit('kick', { userId: b.dataset.kick }); });

  // Duelos
  const dl = $('duelList');
  dl.innerHTML = '';
  $('duelEmpty').style.display = m.duels.length ? 'none' : 'block';
  for (const d of m.duels) {
    const div = document.createElement('div');
    div.className = 'duel-row';
    div.innerHTML = `⚔ <b>${esc(d.a.username)}</b> <span class="ping-ok">${d.a.hp}hp</span> vs <b>${esc(d.b.username)}</b> <span class="ping-ok">${d.b.hp}hp</span> <span class="pill">${d.id}</span>`;
    dl.appendChild(div);
  }

  // Zonas
  const zl = $('zoneList');
  zl.innerHTML = m.zonePopulation.length
    ? m.zonePopulation.map(z => `<span class="lg">${esc(z.zoneName)} <span class="pill">${z.players}p · ${z.enemiesAlive}e</span></span>`).join('')
    : '<span class="empty">Ninguna.</span>';
}

function startSpectate(zoneIdx) {
  specZone = zoneIdx;
  if (socket) socket.emit('spectate', { zoneIdx });
}
function stopSpectate() {
  specZone = null; lastSpec = null;
  if (socket) socket.emit('spectate_stop');
  $('specZone').textContent = '';
  $('specHint').style.display = 'block';
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ── Render del canvas de spectate ────────────────────────────────────────────
const canvas = $('spec');
const ctx = canvas.getContext('2d');

function drawSpectate() {
  requestAnimationFrame(drawSpectate);
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#08110a';
  ctx.fillRect(0, 0, W, H);
  if (!lastSpec) return;

  $('specZone').textContent = '· ' + lastSpec.zoneName;
  const sx = W / ZONE_W, sy = H / ZONE_H;

  // grilla tenue
  ctx.strokeStyle = 'rgba(80,70,40,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= ZONE_W; x += 10) { ctx.beginPath(); ctx.moveTo(x * sx, 0); ctx.lineTo(x * sx, H); ctx.stroke(); }
  for (let y = 0; y <= ZONE_H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y * sy); ctx.lineTo(W, y * sy); ctx.stroke(); }

  const snap = lastSpec.snapshot;
  // items
  ctx.fillStyle = '#ffe080';
  for (const it of snap.items) ctx.fillRect(it.tx * sx - 1, it.ty * sy - 1, 3, 3);
  // enemigos
  for (const e of snap.enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = e.kind === 'boss' ? '#ff4444' : '#e05050';
    const r = e.kind === 'boss' ? 5 : 3;
    ctx.beginPath(); ctx.arc(e.tx * sx, e.ty * sy, r, 0, 7); ctx.fill();
  }
  // jugadores
  for (const p of snap.players) {
    ctx.fillStyle = p.isGhost ? 'rgba(120,160,255,0.4)' : '#58a6ff';
    ctx.beginPath(); ctx.arc(p.tx * sx, p.ty * sy, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfe4ff';
    ctx.font = '11px Segoe UI';
    ctx.fillText(p.username, p.tx * sx + 7, p.ty * sy + 3);
    // barra de hp
    const bw = 22, hp = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = '#220a0a'; ctx.fillRect(p.tx * sx - bw / 2, p.ty * sy - 11, bw, 3);
    ctx.fillStyle = '#4caf50'; ctx.fillRect(p.tx * sx - bw / 2, p.ty * sy - 11, bw * hp, 3);
  }
}
drawSpectate();

// Auto-conectar si ya hay token guardado
if (tokenInput.value) connect();
