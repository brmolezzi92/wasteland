import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { GameEngine, type HudState } from '../engine/GameEngine';
import { TileMap, TILE_COLOR } from '../engine/tilemap';
import { getChatMessages, sendChatMessage, subscribeChatMessages } from '../lib/db';
import type { DbChatMessage } from '../lib/db';
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
  const selectedClass  = selectedChar?.class_id || 'baluarte';

  const hostRef        = useRef<HTMLDivElement>(null);
  const engineRef      = useRef<GameEngine | null>(null);
  const [hud, setHud]  = useState<HudState | null>(null);
  const [err, setErr]  = useState<string | null>(null);
  const [tab, setTab]  = useState<'spells' | 'inv'>('spells');
  const lastClick      = useRef<{ slot: number; t: number }>({ slot: -1, t: 0 });
  const tileCanvasRef  = useRef<HTMLCanvasElement | null>(null);

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
    engineRef.current = engine;
    engine.init(hostRef.current!)
      .then(() => {
        if (!alive) return;
        // build static minimap once
        tileCanvasRef.current = buildTileCanvas(engine.map);
        let last = 0;
        const loop = (t: number) => {
          if (!alive) return;
          if (t - last > 33) { setHud(engine.getHud()); last = t; }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((e) => { if (alive) setErr(String(e?.stack || e)); });
    return () => { alive = false; cancelAnimationFrame(raf); engine.destroy(); engineRef.current = null; };
  }, [selectedClass]);

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

      {err && (
        <pre className="game__error">INIT ERROR: {err}</pre>
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
