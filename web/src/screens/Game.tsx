import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { GameEngine, type HudState } from '../engine/GameEngine';
import { TileMap, TILE_COLOR } from '../engine/tilemap';
import {
  getChatMessages, sendChatMessage, subscribeChatMessages,
  joinWorldChannel, broadcastPosition, broadcastEnemyState, broadcastEvent, leaveWorldChannel,
} from '../lib/db';
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
    engineRef.current = engine;

    // ── Realtime world positions + enemy sync ─────────────────────────────────
    const remoteLastSeen = new Map<string, number>();
    const presenceIds: string[] = [];

    const updateHost = () => {
      const sorted = [...presenceIds, authUserId!].sort();
      engine.isHost = sorted[0] === authUserId!;
    };

    joinWorldChannel(
      authUserId!,
      (data) => {
        engine.upsertRemotePlayer(data);
        remoteLastSeen.set(data.userId, Date.now());
      },
      (userId) => {
        engine.removeRemotePlayer(userId);
        remoteLastSeen.delete(userId);
        const i = presenceIds.indexOf(userId);
        if (i >= 0) presenceIds.splice(i, 1);
        updateHost();
      },
      (states, items) => {
        if (!engine.isHost) {
          engine.applyEnemyState(states as any);
          if (items) engine.applyGroundItemsState(items as any);
        }
      },
      (ids) => {
        presenceIds.length = 0;
        presenceIds.push(...ids.filter(id => id !== authUserId!));
        updateHost();
      },
      (evt) => {
        // Host: recibe golpe del no-host, lo aplica autoritativamente y difunde estado de inmediato
        if (evt.type === 'atk' && engine.isHost) {
          engine.applyRemoteAttack(
            evt.idx as number,
            evt.dmg as number,
            (evt.cc as any) ?? null,
            (evt.ccDur as number) ?? 0,
          );
          broadcastEnemyState(engine.getEnemyState(), engine.getGroundItemsState());
        }
        // Host: un jugador remoto recogió un item → eliminar del mundo autoritativo
        if (evt.type === 'pickup' && engine.isHost) {
          engine.applyRemotePickup(evt.tileX as number, evt.tileY as number);
        }
      },
    );

    // ── Broadcast own position every 50ms, enemies every 100ms ─────────────
    let broadcastTimer = 0;
    let enemyBroadcastTimer = 0;
    const BROADCAST_INTERVAL = 0.05;
    const ENEMY_BROADCAST_INTERVAL = 0.1;

    // ── Ping: measure Supabase roundtrip every 5s ─────────────────────────────
    let pingTimer = 0;
    const measurePing = () => {
      const t0 = performance.now();
      // lightweight read to measure latency
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
      }).then(() => { pingRef.current = performance.now() - t0; }).catch(() => {});
    };
    measurePing();

    engine.init(hostRef.current!)
      .then(() => {
        if (!alive) return;
        tileCanvasRef.current = buildTileCanvas(engine.map);

        // Non-host: relay golpes al host en vez de aplicarlos localmente
        engine.onHitEnemy = (idx, dmg, cc, ccDur) => {
          broadcastEvent({ type: 'atk', idx, dmg, cc, ccDur });
        };
        // Cualquier jugador: notifica pickup para que el host elimine del mundo
        engine.onPickup = (tileX, tileY) => {
          broadcastEvent({ type: 'pickup', tileX, tileY });
        };
        let last = 0;
        const loop = (t: number) => {
          if (!alive) return;
          // FPS
          const dt = (t - lastFrameRef.current) / 1000;
          lastFrameRef.current = t;
          if (dt > 0 && dt < 0.5) {
            fpsRef.current.push(1 / dt);
            if (fpsRef.current.length > 30) fpsRef.current.shift();
            engine.fps = fpsRef.current.reduce((a, b) => a + b, 0) / fpsRef.current.length;
          }
          engine.ping = pingRef.current;

          // Broadcast position
          broadcastTimer += dt;
          if (broadcastTimer >= BROADCAST_INTERVAL) {
            broadcastTimer = 0;
            const p = engine.player;
            broadcastPosition({
              userId: authUserId!,
              username: profile?.username ?? '?',
              classId: selectedClass,
              tx: p.tileX, ty: p.tileY,
              hp: Math.round(p.hp), maxHp: p.maxHp,
              facing: p.facing, moving: p.moving,
            });
          }

          // Enemy state broadcast (host only) — incluye ground items para sync
          enemyBroadcastTimer += dt;
          if (enemyBroadcastTimer >= ENEMY_BROADCAST_INTERVAL) {
            enemyBroadcastTimer = 0;
            if (engine.isHost) broadcastEnemyState(engine.getEnemyState(), engine.getGroundItemsState());
          }

          // Ping every 5s
          pingTimer += dt;
          if (pingTimer >= 5) { pingTimer = 0; measurePing(); }

          // Purge stale remote players (no update in 6s)
          const now = Date.now();
          for (const [uid, ts] of remoteLastSeen) {
            if (now - ts > 6000) { engine.removeRemotePlayer(uid); remoteLastSeen.delete(uid); }
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
      leaveWorldChannel();
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

      {/* ── FPS / PING overlay ── */}
      {hud && (
        <div className="game__perf">
          <span className={hud.fps >= 55 ? 'perf-ok' : hud.fps >= 30 ? 'perf-warn' : 'perf-bad'}>{hud.fps} FPS</span>
          <span className="perf-sep">·</span>
          <span className={hud.ping < 100 ? 'perf-ok' : hud.ping < 200 ? 'perf-warn' : 'perf-bad'}>{hud.ping} ms</span>
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
