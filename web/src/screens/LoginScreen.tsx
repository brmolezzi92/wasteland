import { useState } from 'react';
import { signInWithGoogle } from '../lib/db';
import './LoginScreen.css';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) { setError(error.message); setLoading(false); }
    // On success, Supabase redirects → App.tsx onAuthStateChange handles it
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
          <p className="dim" style={{ fontSize: 13, textAlign: 'center', marginBottom: 20, letterSpacing: 1 }}>
            ACCESO EXCLUSIVO VÍA GMAIL
          </p>

          <button
            className={`btn btn--primary login__btn ${loading ? 'login__btn--loading' : ''}`}
            onClick={handleGoogle}
            disabled={loading}
          >
            {loading ? (
              <span className="login__spinner" />
            ) : (
              <>
                <svg className="login__google-icon" viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Ingresar con Google
              </>
            )}
          </button>

          {error && (
            <p className="login__error">{error}</p>
          )}
        </div>

        <div className="login__footer dim">
          v0.1 · ALPHA · Solo cuentas Gmail
        </div>
      </div>
    </div>
  );
}
