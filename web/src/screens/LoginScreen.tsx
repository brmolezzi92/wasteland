import { useState } from 'react';
import { signInWithUsername, signUpWithUsername, isUsernameTaken, createProfile } from '../lib/db';
import { supabase } from '../lib/supabase';
import './LoginScreen.css';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode,     setMode]     = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const reset = (m: Mode) => { setMode(m); setError(null); };

  const validate = () => {
    if (!username.trim() || !password) return 'Completá todos los campos';
    if (!/^[a-zA-Z0-9_]{3,18}$/.test(username.trim())) return 'Usuario: 3-18 caracteres, solo letras, números y _';
    if (mode === 'register') {
      if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
      if (password !== confirm) return 'Las contraseñas no coinciden';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    const u = username.trim();

    if (mode === 'login') {
      const { error } = await signInWithUsername(u, password);
      if (error) {
        setError('Usuario o contraseña incorrectos');
        setLoading(false);
      }
      // On success → App.tsx onAuthStateChange handles routing
    } else {
      const taken = await isUsernameTaken(u);
      if (taken) { setError('Ese usuario ya está en uso'); setLoading(false); return; }

      const { data, error } = await signUpWithUsername(u, password);
      if (error) { setError(error.message); setLoading(false); return; }

      // Create profile immediately with the chosen username
      if (data.user) await createProfile(data.user.id, u);

      // Force session load since email confirmation is off
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // signInWithPassword right after signUp to ensure session
        await signInWithUsername(u, password);
      }
      // App.tsx onAuthStateChange will route to menu
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
              <label className="login__label dim">USUARIO</label>
              <input
                className="login__input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="tu_nombre"
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

            <button
              type="submit"
              className={`btn btn--primary login__btn ${loading ? 'login__btn--loading' : ''}`}
              disabled={loading}
            >
              {loading ? <span className="login__spinner" /> : mode === 'login' ? 'INGRESAR' : 'CREAR CUENTA'}
            </button>
          </form>
        </div>

        <div className="login__footer dim">v0.1 · ALPHA</div>
      </div>
    </div>
  );
}
