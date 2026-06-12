import { useState, useRef } from 'react';
import { useStore, avgElo } from '../store';
import { CLASSES, eloToRank, rgb } from '../data';
import { signOut, sendFriendRequest, acceptFriendRequest, removeFriend, getFriends, getPendingRequests, joinQueue, leaveQueue, subscribeQueueStatus, checkQueueMatch } from '../lib/db';
import type { DbCharacter, DbFriend, DbFriendRequest } from '../lib/db';
import { getServerUrl, setServerUrl } from '../lib/netClient';
import './MainMenu.css';

// ── static news mock (reemplazar con DB cuando haya tabla news) ────────────────
const NEWS = [{
  tag: 'TEMPORADA 1', title: 'El Wasteland Despierta',
  body: 'La primera temporada de rankeds comienza. Nuevos mapas, sistema de fortalezas y eventos de doble XP. ¿Sobrevivirás la clasificatoria?',
  accent: '#e8a030', date: '12 JUN 2026',
}];
const NEWS_SMALL = [
  { tag: 'UPDATE', title: 'Nuevo mapa: La Fortaleza Caída',         accent: '#5ab4e8' },
  { tag: 'EVENTO', title: '+10% XP en Dungeon este fin de semana',  accent: '#78d25a' },
  { tag: 'BALANCE', title: 'Parche 0.3 — ajustes al Artillero',    accent: '#c878e0' },
];

// ── sub-components ─────────────────────────────────────────────────────────────
function DiamondBadge({ elo, size = 48 }: { elo: number; size?: number }) {
  const r = eloToRank(elo);
  if (!r) return null;
  return (
    <div className="diamond-wrap" style={{ width: size, height: size }}>
      <div className="diamond-inner"
        style={{ background: rgb(r.color, 0.22), border: `2px solid ${rgb(r.color)}`, boxShadow: `0 0 18px ${rgb(r.color, 0.5)}` }}
      />
    </div>
  );
}

function CharSlot({ char, onSelect, onManage }: {
  char: DbCharacter | null;
  onSelect: () => void;
  onManage: () => void;
}) {
  const cls = char ? CLASSES[char.class_id] : null;
  return (
    <button className={`char-slot ${cls ? 'char-slot--filled' : 'char-slot--empty'}`} onClick={cls ? onSelect : onManage}>
      {cls ? (
        <>
          <div className="char-slot__art">
            <img src={`/assets/players/${char!.class_id}.png`} alt={cls.name} />
          </div>
          <div className="char-slot__foot">
            <span className="char-slot__name">{char!.name}</span>
            <span className="char-slot__role dim">{cls.role}</span>
          </div>
          <div className="char-slot__lv">Nv {char!.level}</div>
        </>
      ) : (
        <div className="char-slot__create">
          <span className="char-slot__plus">＋</span>
          <span className="dim">Crear personaje</span>
        </div>
      )}
    </button>
  );
}

// ── Add-friend modal ───────────────────────────────────────────────────────────
function AddFriendModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const authUserId = useStore((s) => s.authUserId)!;
  const [input,  setInput]  = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy,   setBusy]   = useState(false);

  const send = async () => {
    const u = input.trim();
    if (!u) return;
    setBusy(true); setStatus(null);
    const res = await sendFriendRequest(authUserId, u);
    if (res.ok) { setStatus('✓ Solicitud enviada'); onAdded(); }
    else        { setStatus(`✗ ${res.error}`); }
    setBusy(false);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)',
      display: 'grid', placeItems: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div className="panel" style={{ width: 360, padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="panel__head"><h2>AGREGAR AMIGO</h2></div>
        <div className="hazard panel__hazard" />
        <div className="panel__body col" style={{ gap: 12 }}>
          <p className="dim" style={{ fontSize: 13 }}>Ingresá el nombre de usuario exacto.</p>
          <input
            style={{
              width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--font-head)', fontSize: 16,
              letterSpacing: 1, padding: '9px 12px', outline: 'none',
            }}
            value={input}
            maxLength={18}
            onChange={(e) => { setInput(e.target.value); setStatus(null); }}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="NombreDelJugador"
            autoFocus
          />
          {status && (
            <p style={{ fontSize: 13, color: status.startsWith('✓') ? 'var(--green)' : 'var(--danger)' }}>
              {status}
            </p>
          )}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost" style={{ fontSize: 13, padding: '7px 12px' }} onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" style={{ fontSize: 13, padding: '7px 12px' }} onClick={send} disabled={busy}>
              {busy ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function MainMenu() {
  const authUserId     = useStore((s) => s.authUserId)!;
  const profile        = useStore((s) => s.profile);
  const characters     = useStore((s) => s.characters);
  const selectedChar   = useStore((s) => s.selectedChar);
  const friends        = useStore((s) => s.friends);
  const pendingReqs    = useStore((s) => s.pendingRequests);
  const onlineUserIds  = useStore((s) => s.onlineUserIds);
  const setSelectedChar = useStore((s) => s.setSelectedChar);
  const setFriends      = useStore((s) => s.setFriends);
  const setPending      = useStore((s) => s.setPending);
  const startGame      = useStore((s) => s.startGame);
  const setScreen      = useStore((s) => s.setScreen);

  const [activeMode,    setActiveMode]   = useState<string | null>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [queueMode,     setQueueMode]    = useState<string | null>(null);
  const [queueSec,      setQueueSec]     = useState(0);
  const [serverUrl,     setSrvUrl]       = useState(getServerUrl());

  const editServer = () => {
    const url = window.prompt(
      'URL del servidor de juego.\n\nEjemplo (túnel a tu PC): https://xxxx.trycloudflare.com\nVacío = localhost:8787 (solo tu PC).',
      serverUrl,
    );
    if (url === null) return;
    setServerUrl(url);
    setSrvUrl(getServerUrl());
  };
  const queueRef = useRef<ReturnType<typeof import('../lib/db').subscribeQueueStatus> | null>(null);
  const queueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const elo  = avgElo(profile);
  const rank = eloToRank(elo);
  const wr   = profile ? Math.round(profile.wins / Math.max(1, profile.wins + profile.losses) * 100) : 0;

  const charInSlot = (slot: number): DbCharacter | null =>
    characters.find((c) => c.slot === slot) ?? null;

  const handleSelectChar = (char: DbCharacter) => setSelectedChar(char);

  const handleEnterWorld = () => {
    const char = selectedChar ?? characters[0] ?? null;
    if (!char) { setScreen('charselect'); return; }
    setSelectedChar(char);
    startGame('world');
  };

  const handleQueueMode = async () => {
    if (!activeMode) return;
    const char = selectedChar ?? characters[0] ?? null;
    if (!char) { setScreen('charselect'); return; }
    setSelectedChar(char);

    // 1v1 va por el servidor autoritativo: entrás al mundo y el server te
    // empareja y teleporta a la arena. No usa la cola de Supabase.
    if (activeMode === '1v1') { startGame('1v1'); return; }

    const modeElo = activeMode === '2v2' ? (profile?.elo_2v2 ?? 1500)
      : (profile?.elo_4v4 ?? 1500);

    setQueueMode(activeMode); setQueueSec(0);
    const capturedMode = activeMode;

    // 1. Suscribir ANTES del INSERT para no perder el UPDATE del trigger
    queueRef.current = subscribeQueueStatus(authUserId, (roomId) => {
      cancelQueue();
      startGame(capturedMode + ':' + roomId);
    });

    // 2. Insertar en la cola (trigger empareja si hay rival)
    await joinQueue(authUserId, capturedMode, modeElo);

    // 3. Poll inmediato: si el trigger actuó antes de que el WS registrara la suscripción
    const roomId = await checkQueueMatch(authUserId);
    if (roomId) {
      cancelQueue();
      startGame(capturedMode + ':' + roomId);
      return;
    }

    queueTimerRef.current = setInterval(() => setQueueSec((s) => s + 1), 1000);
  };

  const cancelQueue = () => {
    leaveQueue(authUserId);
    setQueueMode(null); setQueueSec(0);
    if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
    if (queueRef.current) { queueRef.current.unsubscribe(); queueRef.current = null; }
  };

  const handleSignOut = async () => { await signOut(); };

  const refreshFriends = async () => {
    const [f, p] = await Promise.all([getFriends(authUserId), getPendingRequests(authUserId)]);
    setFriends(f); setPending(p);
  };

  const handleAccept = async (req: DbFriendRequest) => {
    await acceptFriendRequest(req.friendship_id);
    refreshFriends();
  };
  const handleRemoveFriend = async (f: DbFriend) => {
    await removeFriend(f.friendship_id);
    setFriends(friends.filter((fr) => fr.friendship_id !== f.friendship_id));
  };

  return (
    <div className="hub" style={{ position: 'relative' }}>

      {showAddFriend && (
        <AddFriendModal
          onClose={() => setShowAddFriend(false)}
          onAdded={() => { refreshFriends(); }}
        />
      )}

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <header className="hub-top">
        <div className="hub-logo">
          <h1>WASTELAND</h1>
          <span className="hub-logo__sub">SOBREVIVÍ · DOMINÁ · REMATERIALIZÁ</span>
        </div>

        <nav className="hub-nav">
          {['JUGAR', 'MUNDO', 'TIENDA', 'NOTICIAS'].map(t => (
            <button key={t} className={`hub-nav__tab ${t === 'JUGAR' ? 'hub-nav__tab--on' : ''}`}>{t}</button>
          ))}
        </nav>

        <div className="hub-user">
          <button className="server-chip" onClick={editServer} title="Configurar servidor de juego">
            🖧 {serverUrl.replace(/^https?:\/\//, '')}
          </button>
          <span className="online-chip"><i className="online-dot" /> ONLINE</span>
          {profile && rank && (
            <div className="hub-usercard">
              <DiamondBadge elo={elo} size={40} />
              <div className="hub-usercard__info">
                <strong>{profile.username}</strong>
                <span style={{ color: rgb(rank.color), fontSize: 13 }}>{rank.name}</span>
              </div>
              <div className="hub-usercard__elo">
                <b className="gold">{elo}</b>
                <span className="dim" style={{ fontSize: 12 }}> ELO</span>
              </div>
            </div>
          )}
        </div>
        <div className="hazard hub-top__hazard" />
      </header>

      {/* ── MAIN GRID ────────────────────────────────────────────────────── */}
      <div className="hub-grid">

        {/* ── LEFT ── */}
        <aside className="hub-left">
          <div className="panel hub-idcard">
            <div className="panel__head"><h2>Perfil</h2></div>
            <div className="hazard panel__hazard" />
            <div className="panel__body">
              <div className="idcard__avatar">
                <span>{profile?.username?.[0]?.toUpperCase() ?? '?'}</span>
              </div>
              <p className="idcard__name">{profile?.username ?? '…'}</p>
              <div className="idcard__stats">
                <div className="col"><span className="dim" style={{fontSize:11,letterSpacing:1}}>VICTORIAS</span><b className="green">{profile?.wins ?? 0}</b></div>
                <div className="col"><span className="dim" style={{fontSize:11,letterSpacing:1}}>DERROTAS</span><b className="danger">{profile?.losses ?? 0}</b></div>
                <div className="col"><span className="dim" style={{fontSize:11,letterSpacing:1}}>W/R</span><b className="gold">{wr}%</b></div>
              </div>
            </div>
          </div>

          <div className="panel hub-modes-panel">
            <div className="panel__head"><h2>Modalidades</h2></div>
            <div className="hazard panel__hazard" />
            <div className="panel__body">
              <div className="modes-btns">
                {['1v1','2v2','4v4'].map(m => (
                  <button key={m} className={`mode-btn ${activeMode === m ? 'mode-btn--on' : ''}`} onClick={() => setActiveMode(m)}>{m}</button>
                ))}
              </div>
              {queueMode ? (
                <div className="queue-searching">
                  <span className="queue-dots">
                    <span /><span /><span />
                  </span>
                  <span className="queue-label">
                    BUSCANDO {queueMode.toUpperCase()} · {Math.floor(queueSec / 60).toString().padStart(2,'0')}:{(queueSec % 60).toString().padStart(2,'0')}
                  </span>
                  <button className="btn btn--ghost queue-cancel" onClick={cancelQueue}>✕</button>
                </div>
              ) : activeMode && (
                <button className="btn btn--primary play-now-btn" onClick={handleQueueMode}>▶ BUSCAR PARTIDA</button>
              )}

              <div className="rank-section-label dim">RANGOS</div>
              <div className="rank-rows">
                {(['1v1','2v2','4v4'] as const).map(m => {
                  const mElo = profile ? (m === '1v1' ? profile.elo_1v1 : m === '2v2' ? profile.elo_2v2 : profile.elo_4v4) : 1500;
                  const r = eloToRank(mElo);
                  return (
                    <div key={m} className="rank-row">
                      <span className="rank-row__mode">{m}</span>
                      <DiamondBadge elo={mElo} size={22} />
                      <div className="rank-row__info">
                        <span style={{ color: r ? rgb(r.color) : 'var(--amber)', fontSize: 13 }}>{r?.name}</span>
                        <span className="dim" style={{ fontSize: 11 }}>{mElo} ELO</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* ── CENTER ── */}
        <main className="hub-center">
          <div className="hub-chars">
            {[0, 1, 2].map(slot => (
              <CharSlot
                key={slot}
                char={charInSlot(slot)}
                onSelect={() => handleSelectChar(charInSlot(slot)!)}
                onManage={() => setScreen('charselect')}
              />
            ))}
            <button className="enter-world-btn" onClick={handleEnterWorld}>
              <span className="enter-world-btn__icon">▶</span>
              <span>ENTRAR AL<br /><b>MUNDO</b></span>
            </button>
          </div>

          {selectedChar && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--amber)', letterSpacing: 1, marginTop: -4 }}>
              Personaje activo: <strong>{selectedChar.name}</strong> ({CLASSES[selectedChar.class_id]?.role})
              <button
                style={{ marginLeft: 10, fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setScreen('charselect')}
              >cambiar</button>
            </div>
          )}

          <div className="hub-news-row">
            <div className="panel news-main">
              <div className="panel__head">
                <h2>Noticias</h2>
                <span className="dim" style={{fontSize:12}}>{NEWS[0].date}</span>
              </div>
              <div className="hazard panel__hazard" />
              <div className="panel__body news-main__body">
                <span className="news-tag" style={{ background: NEWS[0].accent }}>{NEWS[0].tag}</span>
                <h3 className="news-main__title">{NEWS[0].title}</h3>
                <p className="dim news-main__text">{NEWS[0].body}</p>
                <button className="btn btn--ghost news-main__btn">Leer más →</button>
              </div>
            </div>
            <div className="panel store-preview">
              <div className="panel__head"><h2>Tienda</h2></div>
              <div className="hazard panel__hazard" />
              <div className="store-preview__img">
                <div className="store-preview__overlay">
                  <span className="store-preview__label">TEMPORADA 1</span>
                  <b className="store-preview__name">PACK WASTELAND<br />ORIGINAL</b>
                  <button className="btn btn--primary store-preview__cta">Ver tienda →</button>
                </div>
              </div>
            </div>
          </div>

          <div className="hub-news-small">
            {NEWS_SMALL.map((n, i) => (
              <button key={i} className="panel news-card">
                <div className="news-card__accent" style={{ background: n.accent }} />
                <div className="panel__body news-card__body">
                  <span className="news-tag" style={{ background: n.accent + '33', color: n.accent, border: `1px solid ${n.accent}55` }}>{n.tag}</span>
                  <p className="news-card__title">{n.title}</p>
                </div>
              </button>
            ))}
          </div>
        </main>

        {/* ── RIGHT ── */}
        <aside className="hub-right panel">
          <div className="panel__head"><h2>Sala</h2></div>
          <div className="hazard panel__hazard" />
          <div className="panel__body hub-right__body">

            <div className="party-slots">
              <div className="party-slot party-slot--me">
                <i className="party-dot" style={{ background: 'var(--green)' }} />
                <span>{profile?.username ?? '…'}</span>
                <span className="dim" style={{fontSize:11}}>TÚ</span>
              </div>
              {[0,1,2].map(i => (
                <div key={i} className="party-slot party-slot--empty">
                  <span className="dim">+ Invitar amigo</span>
                </div>
              ))}
            </div>

            <div className="hub-divider" />

            {/* Solicitudes pendientes */}
            {pendingReqs.length > 0 && (
              <>
                <div className="friends-head">
                  <span style={{fontSize:12,letterSpacing:1,color:'var(--amber)'}}>SOLICITUDES</span>
                  <span className="dim" style={{fontSize:11}}>{pendingReqs.length}</span>
                </div>
                <div className="friends-list" style={{ marginBottom: 6 }}>
                  {pendingReqs.map(req => (
                    <div key={req.friendship_id} className="friend-item" style={{ cursor: 'default' }}>
                      <div className="friend-avatar" style={{ borderColor: 'var(--amber)', fontSize: 13 }}>
                        <span>{req.from_username[0]}</span>
                      </div>
                      <div className="col" style={{gap:2}}>
                        <span style={{fontSize:13}}>{req.from_username}</span>
                        <span className="dim" style={{fontSize:11}}>quiere ser tu amigo</span>
                      </div>
                      <button
                        style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)' }}
                        title="Aceptar"
                        onClick={() => handleAccept(req)}
                      >✓</button>
                    </div>
                  ))}
                </div>
                <div className="hub-divider" />
              </>
            )}

            <div className="friends-head">
              <span className="dim" style={{fontSize:12,letterSpacing:1}}>AMIGOS</span>
              <span className="dim" style={{fontSize:11}}>{friends.length}</span>
            </div>

            <div className="friends-list">
              {friends.length === 0 && (
                <p className="dim" style={{ fontSize: 12, padding: '6px 0', textAlign: 'center' }}>
                  Sin amigos aún
                </p>
              )}
              {friends.map(f => {
                const online = onlineUserIds.has(f.id);
                return (
                  <button key={f.friendship_id} className="friend-item" style={{ cursor: 'default' }}>
                    <div className="friend-avatar" style={{ borderColor: online ? 'var(--green)' : 'var(--border)', position: 'relative' }}>
                      <span>{f.username[0]}</span>
                      <i style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: 8, height: 8, borderRadius: '50%',
                        background: online ? 'var(--green)' : '#555',
                        border: '1.5px solid var(--panel-2)',
                      }} />
                    </div>
                    <div className="col" style={{gap:2}}>
                      <span style={{fontSize:14}}>{f.username}</span>
                      <span style={{fontSize:11, color: online ? 'var(--green)' : 'var(--text-dim)'}}>
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <button
                      className="friend-invite dim"
                      title="Eliminar amigo"
                      onClick={(e) => { e.stopPropagation(); handleRemoveFriend(f); }}
                    >✕</button>
                  </button>
                );
              })}
            </div>

            <button className="btn btn--ghost add-friend-btn" onClick={() => setShowAddFriend(true)}>
              + Agregar amigo
            </button>

            <div className="hub-divider" />

            <div className="hub-actions">
              <button className="hub-action-btn" title="Gestionar personajes" onClick={() => setScreen('charselect')}>⚔</button>
              <button className="hub-action-btn" title="Configuración">⚙</button>
              <button className="hub-action-btn hub-action-btn--exit" title="Cerrar sesión" onClick={handleSignOut}>⏻</button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
