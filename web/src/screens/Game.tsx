import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { GameEngine, type HudState } from '../engine/GameEngine';
import { TileMap, TILE_COLOR } from '../engine/tilemap';
import { getChatMessages, sendChatMessage, subscribeChatMessages } from '../lib/db';
import type { DbChatMessage } from '../lib/db';
import { NetClient } from '../lib/netClient';
import './GameHud.css';

// ─── Minimap ──────────────────────────────────────────────────────────────────
const MM_W = 176;
const MM_H = 120;

// Pre-render the static tile layer once into an offscreen canvas
function buildTileCanvas(map: TileMap): HTMLCanvasElement {
  const cvs = document.createElement('canvas');
  cvs.width = MM_W; cvs.height = MM_H;
  const ctx = cvs.getContext('2d')!;
  const scx = MM_W / map.width;
  const scy = MM_H / map.height;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = map.tiles[ty][tx];
      const hex = TILE_COLOR[tile] ?? 0x1a1a1a;
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8)  & 0xff;
      const b =  hex        & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(Math.round(tx * scx), Math.round(ty * scy), Math.max(1, Math.round(scx)), Math.max(1, Math.round(scy)));
    }
  }
  return cvs;
}

function Minimap({ hud, tileCanvas }: { hud: HudState; tileCanvas: HTMLCanvasElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || !tileCanvas) return;
    const ctx = cvs.getContext('2d')!;
    const { mapW, mapH, playerTx, playerTy, dots } = hud.minimap;
    const scx = MM_W / mapW;
    const scy = MM_H / mapH;

    ctx.clearRect(0, 0, MM_W, MM_H);
    ctx.drawImage(tileCanvas, 0, 0);

    // entity dots
    for (const d of dots) {
      ctx.fillStyle = d.color;
      ctx.fillRect(Math.round(d.tx * scx) - 1, Math.round(d.ty * scy) - 1, 3, 3);
    }
    // player dot (white, larger)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(playerTx * scx) - 2, Math.round(playerTy * scy) - 2, 5, 5);
    // border
    ctx.strokeStyle = '#6e5026';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MM_W - 1, MM_H - 1);
  }, [hud, tileCanvas]);

  return <canvas ref={canvasRef} width={MM_W} height={MM_H} className="minimap-canvas" />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Game() {
  const backToMenu     = useStore((s) => s.backToMenu);
  const selectedChar   = useStore((s) => s.selectedChar);
  const profile        = useStore((s) => s.profile);
  const authUserId     = useStore((s) => s.authUserId);
  const gameMode       = useStore((s) => s.gameMode);
  const selectedClass  = selectedChar?.class_id || 'baluarte';

  const hostRef        = useRef<HTMLDivElement>(null);
  const engineRef      = useRef<GameEngine | null>(null);
  const netRef         = useRef<NetClient | null>(null);
  const [hud, setHud]  = useState<HudState | null>(null);
  const [err, setErr]  = useState<string | null>(null);
  const [tab, setTab]  = useState<'spells' | 'inv'>('spells');
  const [partyInvite, setPartyInvite] = useState<{ fromUserId: string; fromUsername: string } | null>(null);
  const lastClick      = useRef<{ slot: number; t: number }>({ slot: -1, t: 0 });
  const tileCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const fpsRef         = useRef<number[]>([]);
  const lastFrameRef   = useRef<number>(0);
  const pingRef        = useRef<number>(0);

  // ── Chat ────────────────────────────────────────────────────────────────────
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatInput,   setChatInput]   = useState('');
  const [chatMessages, setChatMessages] = useState<DbChatMessage[]>([]);
  const chatEndRef    = useRef<HTMLDivElement>(null);
  const chatInputRef  = useRef<HTMLInputElement>(null);
  const CHANNEL = 'world';

  useEffect(() => {
    getChatMessages(CHANNEL, 40).then(setChatMessages);
    const sub = subscribeChatMessages(CHANNEL, (msg) => {
      setChatMessages((prev) => [...prev.slice(-99), msg]);
    });
    return () => { sub.unsubscribe(); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !chatOpen) { e.preventDefault(); setChatOpen(true); }
      if (e.key === 'Escape' && chatOpen)  { setChatOpen(false); setChatInput(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen) chatInputRef.current?.focus();
  }, [chatOpen]);

  const submitChat = async () => {
    const msg = chatInput.trim();
    if (!msg || !authUserId || !profile) return;
    setChatInput('');
    await sendChatMessage(authUserId, profile.username, CHANNEL, msg);
  };

  useEffect(() => {
    let alive = true, raf = 0;
    const engine = new GameEngine(selectedClass);
    engine.myUserId = authUserId!;
    engineRef.current = engine;

    // ── Cliente del servidor autoritativo (socket.io) ─────────────────────────
    const net = new NetClient({
      onJoined: (m) => {
        engine.applyServerYou({ hp: m.you.hp, energy: m.you.energy, inventory: m.inventory });
        // Si entré buscando duelo 1v1, encolo apenas conecto.
        if ((gameMode ?? '').startsWith('1v1')) engine.startMatchmake();
      },
      onSnapshot: (snap) => engine.applyServerSnapshot(snap as any),
      onFx: (fx) => engine.applyServerFx(fx),
      onYou: (y) => engine.applyServerYou(y),
      onLog: (msg, color) => engine.addLog(msg, color),
      onForceZone: (zoneIdx, tx, ty) => {
        engine.applyForceZone(zoneIdx, tx, ty);
        tileCanvasRef.current = buildTileCanvas(engine.map);
      },
      onConnChange: (connected) => {
        engine.connected = connected;
        engine.addLog(
          connected ? `🟢 Conectado al servidor (${net.serverUrl})` : '🔴 Sin conexión al servidor',
          connected ? '#66e06a' : '#ff4444');
      },
      onPing: (ms) => { pingRef.current = ms; engine.ping = ms; },
      onDuel: (m) => engine.applyDuel(m),
      onParty: (m) => engine.applyParty(m),
      onPartyInvited: (m) => setPartyInvite(m),
    });
    netRef.current = net;

    engine.init(hostRef.current!)
      .then(() => {
        if (!alive) return;
        tileCanvasRef.current = buildTileCanvas(engine.map);

        // ── Intents del engine → servidor ─────────────────────────────────────
        engine.onMove = (tx, ty, facing, moving) => net.move(tx, ty, facing, moving);
        engine.onCast = (intent) => net.cast(intent);
        engine.onZoneEnter = (z) => net.zone(z);
        engine.onPickupIntent = (tx, ty) => net.pickup(tx, ty);
        engine.onUsePotion = (slot) => net.usePotion(slot);
        engine.onMatchmake = () => net.matchmake();
        engine.onMatchmakeCancel = () => net.matchmakeCancel();
        engine.onPartyInvite = (targetUserId) => net.partyInvite(targetUserId);
        engine.onPartyKick = (targetUserId) => net.partyKick(targetUserId);
        engine.onPartyLeave = () => net.partyLeave();
        // Reconstruir minimap al cambiar de zona localmente
        engine.onZoneChange = () => { tileCanvasRef.current = buildTileCanvas(engine.map); };

        // Conectar al servidor con la identidad del jugador
        net.connect({
          userId: authUserId!,
          username: profile?.username ?? '?',
          classId: selectedClass,
          charId: selectedChar?.id ?? '',
        });

        let last = 0, netT = 0, lastDown = 0, lastUp = 0;
        const loop = (t: number) => {
          if (!alive) return;
          const dt = (t - lastFrameRef.current) / 1000;
          lastFrameRef.current = t;
          if (dt > 0 && dt < 0.5) {
            fpsRef.current.push(1 / dt);
            if (fpsRef.current.length > 30) fpsRef.current.shift();
            engine.fps = fpsRef.current.reduce((a, b) => a + b, 0) / fpsRef.current.length;
          }
          // Throughput (KB/s) calculado cada 1s a partir de los bytes acumulados.
          if (t - netT >= 1000) {
            const secs = (t - netT) / 1000;
            engine.netDown = Math.round((net.bytesDown - lastDown) / 1024 / secs * 10) / 10;
            engine.netUp = Math.round((net.bytesUp - lastUp) / 1024 / secs * 10) / 10;
            lastDown = net.bytesDown; lastUp = net.bytesUp; netT = t;
          }
          if (t - last > 33) { setHud({ ...engine.getHud() }); last = t; }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((e) => { if (alive) setErr(String(e?.stack || e)); });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      engine.destroy();
      engineRef.current = null;
      net.disconnect();
      netRef.current = null;
    };
  }, [selectedClass, authUserId, profile]);

  const eng = () => engineRef.current!;

  const clickSlot = useCallback((i: number) => {
    const now = performance.now();
    if (lastClick.current.slot === i && now - lastClick.current.t < 350) {
      eng().usePotionClick(i); lastClick.current = { slot: -1, t: 0 };
    } else { eng().selectSlot(i); lastClick.current = { slot: i, t: now }; }
  }, []);

  const hpPct  = hud ? hud.hp      / hud.maxHp      * 100 : 100;
  const enPct  = hud ? hud.energy  / hud.maxEnergy  * 100 : 100;

  return (
    <div className="game">
      {/* ── GAME CANVAS ── */}
      <div className="game__canvas" ref={hostRef} onContextMenu={(e) => e.preventDefault()} />

      {err && <pre className="game__error">INIT ERROR: {err}</pre>}

      {/* ── FPS / PING / CONEXIÓN / DATOS overlay ── */}
      {hud && (
        <div className="game__perf">
          <span className={hud.connected ? 'perf-ok' : 'perf-bad'}>{hud.connected ? '🟢' : '🔴'}</span>
          <span className="perf-sep">·</span>
          <span className={hud.fps >= 55 ? 'perf-ok' : hud.fps >= 30 ? 'perf-warn' : 'perf-bad'}>{hud.fps} FPS</span>
          <span className="perf-sep">·</span>
          <span className={!hud.connected ? 'perf-bad' : hud.ping < 100 ? 'perf-ok' : hud.ping < 200 ? 'perf-warn' : 'perf-bad'}>{hud.connected ? `${hud.ping} ms` : '—'}</span>
          <span className="perf-sep">·</span>
          <span className="perf-net" title="datos recibidos / enviados">▼ {hud.netDown} <span className="perf-sep">/</span> ▲ {hud.netUp} KB/s</span>
        </div>
      )}

      {/* ── INVITACIÓN A PARTY ── */}
      {partyInvite && (
        <div className="party-invite">
          <div className="party-invite__text"><b>{partyInvite.fromUsername}</b> te invitó a su grupo</div>
          <div className="party-invite__btns">
            <button className="btn btn--primary" onClick={() => { netRef.current?.partyAccept(); setPartyInvite(null); }}>Aceptar</button>
            <button className="btn btn--ghost" onClick={() => { netRef.current?.partyDecline(); setPartyInvite(null); }}>Rechazar</button>
          </div>
        </div>
      )}

      {/* ── RIGHT HUD ── */}
      {/* ── IN-GAME CHAT ── */}
      <div className={`chat-overlay ${chatOpen ? 'chat-overlay--open' : ''}`}>
        <div className="chat-log">
          {chatMessages.map((m) => (
            <div key={m.id} className="chat-line">
              <span className="chat-user" style={{ color: m.user_id === authUserId ? 'var(--amber-hot)' : 'var(--energy)' }}>
                {m.username}:
              </span>
              {' '}{m.message}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        {chatOpen && (
          <div className="chat-input-row">
            <input
              ref={chatInputRef}
              className="chat-input"
              value={chatInput}
              maxLength={200}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  { e.preventDefault(); submitChat(); }
                if (e.key === 'Escape') { setChatOpen(false); setChatInput(''); }
              }}
              placeholder="Escribí y presioná Enter…"
            />
          </div>
        )}
        {!chatOpen && (
          <div className="chat-hint dim">Enter = chat</div>
        )}
      </div>

      {hud && (
        <aside className="hud">

          {/* ── CONSOLE LOG ── */}
          <div className="hud-console">
            {hud.logs.map((entry, i) => (
              <div key={i} className="hud-console__line" style={{ color: entry.color }}>
                {entry.msg}
              </div>
            ))}
            {hud.logs.length === 0 && (
              <div className="hud-console__line dim">Clic en enemigos/NPCs para inspeccionar</div>
            )}
          </div>

          {/* ── CHARACTER INFO ── */}
          <div className="hud-charinfo">
            <div className="hud-charinfo__name">{hud.className}</div>
            <div className="hud-charinfo__role dim">{hud.role}</div>
          </div>

          {/* ── STATUS BARS ── */}
          <div className="hud-bars">
            <div className="hud-bar">
              <div className="hud-bar__label"><span className="hud-bar__icon hp-icon">♥</span>HP</div>
              <div className="hud-bar__track">
                <div className="hud-bar__trail" style={{ width: `${hpPct}%` }} />
                <div className="hud-bar__fill hp-fill" style={{ width: `${hpPct}%` }} />
                <span className="hud-bar__nums">{hud.hp}/{hud.maxHp}</span>
              </div>
            </div>
            <div className="hud-bar">
              <div className="hud-bar__label"><span className="hud-bar__icon en-icon">⚡</span>EN</div>
              <div className="hud-bar__track">
                <div className="hud-bar__fill en-fill" style={{ width: `${enPct}%` }} />
                <span className="hud-bar__nums">{hud.energy}/{hud.maxEnergy}</span>
              </div>
            </div>
          </div>

          {/* ── STATUS BANNERS ── */}
          {hud.isGhost    && <div className="status-banner ghost-banner">PROYECCIÓN CUÁNTICA · {Math.ceil(hud.ghostTimer)}s</div>}
          {hud.isInvisible && <div className="status-banner invis-banner">CAMUFLAJE ACTIVO</div>}
          {hud.cc         && <div className="status-banner cc-banner">{hud.cc.toUpperCase()} {hud.ccTimer.toFixed(1)}s</div>}

          {/* ── DUELO 1v1 ── */}
          <div className="duel-control">
            {hud.duelState === 'idle' && (
              <button className="btn btn--primary duel-btn" onClick={() => eng().startMatchmake()}>⚔ Buscar Duelo 1v1</button>
            )}
            {hud.duelState === 'searching' && (
              <div className="duel-status duel-status--searching">
                <span className="queue-dots"><i/><i/><i/></span> Buscando oponente…
                <button className="btn btn--ghost duel-cancel" onClick={() => eng().cancelMatchmake()}>✕</button>
              </div>
            )}
            {hud.duelState === 'in_duel' && (
              <div className="duel-status duel-status--active">⚔ DUELO vs {hud.duelOpponent}</div>
            )}
          </div>

          {/* ── PARTY ── */}
          <div className="party-control">
            {hud.party.length === 0 ? (
              <button
                className={`btn ${hud.partyTargeting ? 'btn--ghost' : 'btn--primary'} party-btn`}
                onClick={() => eng().togglePartyTargeting()}
              >
                {hud.partyTargeting ? '✖ Cancelá y clic en un jugador' : '👥 Party — invitar'}
              </button>
            ) : (
              <div className="party-panel">
                <div className="party-panel__head">
                  <span>👥 GRUPO ({hud.party.length})</span>
                  <div className="party-panel__actions">
                    {hud.isPartyLeader && (
                      <button className={`btn btn--ghost party-mini ${hud.partyTargeting ? 'on' : ''}`}
                        onClick={() => eng().togglePartyTargeting()} title="Invitar a otro jugador">＋</button>
                    )}
                    <button className="btn btn--ghost party-mini" onClick={() => eng().onPartyLeave?.()} title="Salir del grupo">⤬</button>
                  </div>
                </div>
                {hud.party.map(m => (
                  <div key={m.userId} className="party-member">
                    <span className="party-member__name">{m.leader ? '★ ' : ''}{m.username}</span>
                    <div className="party-hp"><div className="party-hp__fill" style={{ width: `${Math.max(0, m.hp / m.maxHp * 100)}%` }} /></div>
                    <span className="party-member__hp">{m.hp}</span>
                    {hud.isPartyLeader && !m.leader && (
                      <button className="party-kick" onClick={() => eng().onPartyKick?.(m.userId)} title="Expulsar">✕</button>
                    )}
                  </div>
                ))}
                {hud.partyTargeting && <div className="party-hint">Clic en un jugador del mundo para invitarlo…</div>}
              </div>
            )}
          </div>

          {/* ── TABS ── */}
          <div className="hud-tabs">
            <button
              className={`hud-tab ${tab === 'spells' ? 'hud-tab--on' : ''}`}
              onClick={() => setTab('spells')}
            >
              HECHIZOS
            </button>
            <button
              className={`hud-tab ${tab === 'inv' ? 'hud-tab--on' : ''}`}
              onClick={() => setTab('inv')}
            >
              INVENTARIO
              {(hud.potionKey > 0 || hud.potionClick > 0) && (
                <span className="hud-tab__cd">
                  {hud.potionKey > 0   && <span className="amber"> U {hud.potionKey.toFixed(1)}</span>}
                  {hud.potionClick > 0 && <span className="energy"> 2× {hud.potionClick.toFixed(1)}</span>}
                </span>
              )}
            </button>
          </div>

          {/* ── TAB CONTENT ── */}
          <div className="hud-content">
            {tab === 'spells' && (
              <div className="spells-list tab-anim">
                {hud.spells.map((s, i) => (
                  <button
                    key={i}
                    className={`spell-row ${hud.pending === i ? 'spell-row--pending' : ''} ${!s.ready ? 'spell-row--off' : ''}`}
                    onClick={() => eng().loadSpell(i)}
                  >
                    <span className="spell-dot" style={{ background: s.color }} />
                    <div className="spell-info">
                      <strong>{s.name}</strong>
                      <span className="dim">{s.aim} · {s.cost} EN · {s.cooldown}s</span>
                    </div>
                    {s.cd > 0 && (
                      <>
                        <div className="spell-cdfill" style={{ width: `${100 * s.cd / s.cooldown}%` }} />
                        <span className="spell-cd">{s.cd.toFixed(1)}</span>
                      </>
                    )}
                  </button>
                ))}
                {hud.pending !== null && (
                  <div className="spell-hint">▶ Clic en el mundo para lanzar</div>
                )}
              </div>
            )}

            {tab === 'inv' && (
              <div className="inv-grid tab-anim">
                {hud.inventory.map((it, i) => (
                  <button
                    key={i}
                    className={`inv-slot ${hud.selectedSlot === i ? 'inv-slot--sel' : ''}`}
                    onClick={() => clickSlot(i)}
                  >
                    <img src={`/assets/items/${it.itemId}.png`} alt="" />
                    <span className="inv-slot__qty">{it.qty}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── MINIMAP (bottom) ── */}
          <div className="hud-minimap">
            <div className="hud-minimap__label">MAPA</div>
            <Minimap hud={hud} tileCanvas={tileCanvasRef.current} />
          </div>

          {/* ── BOTTOM ACTIONS ── */}
          <div className="hud-actions">
            <button className="hud-action-btn hud-action-btn--exit" onClick={backToMenu}>
              ← SALIR
            </button>
          </div>

        </aside>
      )}
    </div>
  );
}
