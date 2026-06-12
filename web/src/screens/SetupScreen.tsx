import { useState } from 'react';
import { useStore } from '../store';
import { updateUsername, isUsernameTaken } from '../lib/db';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,18}$/;

export default function SetupScreen() {
  const profile    = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setScreen  = useStore((s) => s.setScreen);

  const [value,  setValue]  = useState(profile?.username ?? '');
  const [error,  setError]  = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    const u = value.trim();
    if (!USERNAME_RE.test(u)) {
      setError('3–18 caracteres: letras, números o _'); return;
    }
    setSaving(true);
    if (await isUsernameTaken(u)) {
      setError('Nombre de usuario ya existe'); setSaving(false); return;
    }
    const ok = await updateUsername(profile!.id, u);
    if (ok) {
      setProfile({ ...profile!, username: u });
      setScreen('menu');
    } else {
      setError('Error al guardar. Intentá de nuevo.');
    }
    setSaving(false);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="panel" style={{ width: 400, padding: 0 }}>
        <div className="panel__head"><h2>ELEGÍ TU NOMBRE</h2></div>
        <div className="hazard panel__hazard" />
        <div className="panel__body col" style={{ gap: 14 }}>
          <p className="dim" style={{ fontSize: 13 }}>Este es el nombre que verán los demás jugadores. Podés cambiarlo luego.</p>
          <input
            style={{
              width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--font-head)', fontSize: 20,
              letterSpacing: 2, padding: '10px 14px', outline: 'none',
            }}
            value={value}
            maxLength={18}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            placeholder="NombreEpico123"
            autoFocus
          />
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <button className="btn btn--primary" onClick={confirm} disabled={saving}>
            {saving ? 'Guardando…' : 'CONFIRMAR Y JUGAR →'}
          </button>
        </div>
      </div>
    </div>
  );
}
