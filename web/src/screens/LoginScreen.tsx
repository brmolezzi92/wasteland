import { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../lib/db';
import './LoginScreen.css';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode,     setMode]     = useState<Mode>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [info,     setInfo]     = useState<string | null>(null);

  const reset = (m: Mode) => { setMode(m); setError(null); setInfo(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);

    if (!email.trim() || !password) { setError('Completá todos los campos'); return; }
    if (mode === 'register') {
      if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
      if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await signInWithEmail(email.trim(), password);
      if (error) { setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message); setLoading(false); }
      // On success → App.tsx onAuthStateChange handles routing
    } else {
      const { error } = await signUpWithEmail(email.trim(), password);
      if (error) { setError(error.message); setLoading(false); }
      else { setInfo('¡Cuenta creada! Revisá tu email para confirmar y luego ingresá.'); setLoading(false); reset('login'); }
    }
  };

  return (
    <div className="login">
      <div className="login__bg" />

      <div className="login__panel panel">
        <div className="login__logo">
          <h1>WASTELAND</h1>
          <div className="hazard login__hazard" />
          <p className="login__tagline dim">SOBREVIVÍ · DOMINÁ · REMATERIALIZÁ</p>
        </div>

        <div className="login__body">
          <div className="login__tabs">
            <button className={`login__tab ${mode === 'login' ? 'login__tab--on' : ''}`} onClick={() => reset('login')}>INGRESAR</button>
            <button className={`login__tab ${mode === 'register' ? 'login__tab--on' : ''}`} onClick={() => reset('register')}>REGISTRARSE</button>
          </div>

          <form className="login__form" onSubmit={handleSubmit}>
            <div className="login__field">
              <label className="login__label dim">EMAIL</label>
              <input
                className="login__input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@email.com"
                disabled={loading}
              />
            </div>

            <div className="login__field">
              <label className="login__label dim">CONTRASEÑA</label>
              <input
                className="login__input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {mode === 'register' && (
              <div className="login__field">
                <label className="login__label dim">CONFIRMAR CONTRASEÑA</label>
                <input
                  className="login__input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>
            )}

            {error && <p className="login__error">{error}</p>}
            {info  && <p className="login__info">{info}</p>}

            <button
              type="submit"
              className={`btn btn--primary login__btn ${loading ? 'login__btn--loading' : ''}`}
              disabled={loading}
            >
              {loading ? <span className="login__spinner" /> : mode === 'login' ? 'INGRESAR' : 'CREAR CUENTA'}
            </button>
          </form>
        </div>

        <div className="login__footer dim">
          v0.1 · ALPHA · {mode === 'login' ? '¿No tenés cuenta? Registrate arriba' : 'Ya tenés cuenta? Ingresá arriba'}
        </div>
      </div>
    </div>
  );
}
