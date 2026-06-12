import { useEffect, useState } from 'react';
import { useStore } from './store';
import { loadData } from './data';
import { supabase } from './lib/supabase';
import { getProfile, getCharacters, getFriends, getPendingRequests, joinLobbyChannel, leaveLobbyChannel } from './lib/db';
import LoginScreen from './screens/LoginScreen';
import SetupScreen from './screens/SetupScreen';
import MainMenu from './screens/MainMenu';
import CharSelect from './screens/CharSelect';
import Game from './screens/Game';

const GAME_W = 1600;
const GAME_H = 900;

function useGameScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

// Load profile + characters + friends for a logged-in user
async function loadUserData(userId: string, email: string) {
  const store = useStore.getState();
  store.setAuth(userId, email);

  const profile = await getProfile(userId);
  if (!profile) { store.setScreen('login'); return; }
  store.setScreen('menu');

  joinLobbyChannel(userId, (ids) => store.setOnlineUsers(ids));

  store.setProfile(profile);
  const [chars, friends, pending] = await Promise.all([
    getCharacters(userId),
    getFriends(userId),
    getPendingRequests(userId),
  ]);
  store.setCharacters(chars);
  store.setFriends(friends);
  store.setPending(pending);
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const scale  = useGameScale();

  useEffect(() => {
    loadData(); // static JSON assets

    // Check existing session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user.id, session.user.email ?? '');
      } else {
        useStore.getState().setScreen('login');
      }
    });

    // React to auth changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadUserData(session.user.id, session.user.email ?? '');
      }
      if (event === 'SIGNED_OUT') {
        leaveLobbyChannel();
        useStore.getState().clearAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'grid', placeItems: 'center',
      background: '#080604', overflow: 'hidden',
    }}>
      <div style={{
        width: GAME_W, height: GAME_H,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        overflow: 'hidden', position: 'relative', flexShrink: 0,
      }}>
        {screen === 'loading' && (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
            <h1 className="amber" style={{ letterSpacing: 4 }}>CARGANDO…</h1>
          </div>
        )}
        {screen === 'login'      && <LoginScreen />}
        {screen === 'setup'      && <SetupScreen />}
        {screen === 'menu'       && <MainMenu />}
        {screen === 'charselect' && <CharSelect />}
        {screen === 'game'       && <Game />}
      </div>
    </div>
  );
}
