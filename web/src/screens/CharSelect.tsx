import { useState } from 'react';
import { useStore } from '../store';
import { CLASSES } from '../data';
import { createCharacter, deleteCharacter } from '../lib/db';
import type { DbCharacter } from '../lib/db';

type Panel = 'list' | 'create';

const SLOT_LABELS = ['PERSONAJE I', 'PERSONAJE II', 'PERSONAJE III'];

export default function CharSelect() {
  const authUserId   = useStore((s) => s.authUserId)!;
  const characters   = useStore((s) => s.characters);
  const setCharacters = useStore((s) => s.setCharacters);
  const setSelectedChar = useStore((s) => s.setSelectedChar);
  const startGame    = useStore((s) => s.startGame);
  const backToMenu   = useStore((s) => s.backToMenu);
  const gameMode     = useStore((s) => s.gameMode);

  const [panel,     setPanel]     = useState<Panel>('list');
  const [editSlot,  setEditSlot]  = useState<number | null>(null);
  const [charName,  setCharName]  = useState('');
  const [classId,   setClassId]   = useState(Object.keys(CLASSES)[0] ?? '');
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [err,       setErr]       = useState<string | null>(null);

  const charInSlot = (slot: number): DbCharacter | undefined =>
    characters.find((c) => c.slot === slot);

  const openCreate = (slot: number) => {
    setEditSlot(slot); setCharName(''); setClassId(Object.keys(CLASSES)[0] ?? '');
    setErr(null); setPanel('create');
  };

  const handleCreate = async () => {
    const name = charName.trim();
    if (!name || name.length < 2 || name.length > 20) { setErr('Nombre: 2–20 caracteres'); return; }
    if (editSlot === null) return;
    setSaving(true);
    const created = await createCharacter(authUserId, editSlot, name, classId);
    if (created) {
      setCharacters([...characters.filter((c) => c.slot !== editSlot), created]);
      setPanel('list');
    } else {
      setErr('Error al crear personaje');
    }
    setSaving(false);
  };

  const handleDelete = async (char: DbCharacter) => {
    if (!confirm(`¿Eliminar a "${char.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(char.id);
    await deleteCharacter(char.id);
    setCharacters(characters.filter((c) => c.id !== char.id));
    setDeleting(null);
  };

  const handlePlay = (char: DbCharacter) => {
    setSelectedChar(char);
    startGame(gameMode ?? 'world');
  };

  if (panel === 'create') {
    const cls = CLASSES[classId];
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div className="panel" style={{ width: 520, padding: 0 }}>
          <div className="panel__head">
            <h2>NUEVO PERSONAJE — {SLOT_LABELS[editSlot ?? 0]}</h2>
          </div>
          <div className="hazard panel__hazard" />
          <div className="panel__body col" style={{ gap: 16 }}>
            {/* Nombre */}
            <div className="col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, letterSpacing: 2, color: 'var(--text-dim)' }}>NOMBRE</label>
              <input
                style={{
                  background: 'var(--panel-2)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontFamily: 'var(--font-head)', fontSize: 20,
                  letterSpacing: 2, padding: '10px 14px', outline: 'none', width: '100%',
                }}
                value={charName}
                maxLength={20}
                onChange={(e) => { setCharName(e.target.value); setErr(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="NombreDelPersonaje"
                autoFocus
              />
            </div>

            {/* Clase */}
            <div className="col" style={{ gap: 8 }}>
              <label style={{ fontSize: 12, letterSpacing: 2, color: 'var(--text-dim)' }}>CLASE</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {Object.entries(CLASSES).map(([id, c]) => (
                  <button
                    key={id}
                    onClick={() => setClassId(id)}
                    style={{
                      padding: '8px 4px', cursor: 'pointer', textAlign: 'center',
                      background: classId === id ? 'var(--panel-head)' : 'var(--panel-2)',
                      border: `1px solid ${classId === id ? 'var(--amber-hot)' : 'var(--border)'}`,
                      color: classId === id ? 'var(--amber-hot)' : 'var(--text-dim)',
                      fontFamily: 'var(--font-head)', fontSize: 12, letterSpacing: 1,
                    }}
                  >
                    <img src={`/assets/players/${id}.png`} alt="" style={{ height: 48, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
                    {c.name}
                  </button>
                ))}
              </div>
              {cls && <p className="dim" style={{ fontSize: 12 }}>{cls.role} — {cls.lore}</p>}
            </div>

            {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" onClick={() => setPanel('list')}>Cancelar</button>
              <button className="btn btn--primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creando…' : 'CREAR PERSONAJE'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 className="amber" style={{ textAlign: 'center', letterSpacing: 3 }}>MIS PERSONAJES</h1>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, alignItems: 'start' }}>
        {[0, 1, 2].map((slot) => {
          const char = charInSlot(slot);
          const cls  = char ? CLASSES[char.class_id] : null;
          return (
            <div key={slot} className="panel" style={{ padding: 0 }}>
              <div className="panel__head">
                <h2 style={{ fontSize: 14 }}>{SLOT_LABELS[slot]}</h2>
                {char && <span className="dim" style={{ fontSize: 12 }}>Nv {char.level}</span>}
              </div>
              <div className="hazard panel__hazard" />
              <div className="panel__body col" style={{ alignItems: 'center', gap: 12 }}>
                {char && cls ? (
                  <>
                    <img
                      src={`/assets/players/${char.class_id}.png`}
                      alt={cls.name}
                      style={{ height: 120, objectFit: 'contain' }}
                    />
                    <span style={{ fontFamily: 'var(--font-head)', fontSize: 20, color: 'var(--amber)' }}>
                      {char.name}
                    </span>
                    <span className="dim" style={{ fontSize: 13 }}>{cls.role}</span>

                    <div className="row" style={{ gap: 8, marginTop: 4 }}>
                      <button
                        className="btn btn--primary"
                        style={{ fontSize: 13, padding: '8px 14px' }}
                        onClick={() => handlePlay(char)}
                      >
                        ▶ JUGAR
                      </button>
                      <button
                        className="btn btn--danger"
                        style={{ fontSize: 13, padding: '8px 12px' }}
                        onClick={() => handleDelete(char)}
                        disabled={deleting === char.id}
                      >
                        {deleting === char.id ? '…' : '✕'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => openCreate(slot)}
                    style={{
                      width: '100%', padding: '28px 0', cursor: 'pointer',
                      background: 'none', border: 'none', color: 'var(--text-dim)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 36 }}>＋</span>
                    <span style={{ fontSize: 13, letterSpacing: 1 }}>Crear personaje</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn btn--ghost" style={{ alignSelf: 'center' }} onClick={backToMenu}>
        ← Volver al menú
      </button>
    </div>
  );
}
