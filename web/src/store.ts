import { create } from 'zustand';
import type { DbProfile, DbCharacter, DbFriend, DbFriendRequest } from './lib/db';

export type Screen = 'login' | 'loading' | 'setup' | 'menu' | 'charselect' | 'game';

interface State {
  screen: Screen;

  // Auth
  authUserId: string | null;
  authEmail:  string | null;

  // DB data
  profile:    DbProfile | null;
  characters: DbCharacter[];
  selectedChar: DbCharacter | null;
  friends:    DbFriend[];
  pendingRequests: DbFriendRequest[];

  // Game state
  gameMode: string | null;

  // Online presence
  onlineUserIds: Set<string>;

  // ── Actions ──────────────────────────────────────────────────────────────
  setScreen:    (s: Screen) => void;
  setAuth:      (id: string, email: string) => void;
  clearAuth:    () => void;
  setProfile:   (p: DbProfile) => void;
  setCharacters:(chars: DbCharacter[]) => void;
  setSelectedChar: (c: DbCharacter | null) => void;
  setFriends:   (f: DbFriend[]) => void;
  setPending:   (r: DbFriendRequest[]) => void;
  setOnlineUsers: (ids: Set<string>) => void;

  // Navigation
  startGame:    (mode: string) => void;   // seleccionar modo → va al juego
  backToMenu:   () => void;
}

export const useStore = create<State>((set) => ({
  screen: 'loading',
  authUserId: null,
  authEmail:  null,
  profile:    null,
  characters: [],
  selectedChar: null,
  friends:    [],
  pendingRequests: [],
  gameMode:   null,
  onlineUserIds: new Set<string>(),

  setScreen:    (screen)  => set({ screen }),
  setAuth:      (id, email) => set({ authUserId: id, authEmail: email }),
  clearAuth:    ()        => set({ authUserId: null, authEmail: null, profile: null, characters: [], selectedChar: null, friends: [], onlineUserIds: new Set(), screen: 'login' }),
  setProfile:   (profile) => set({ profile }),
  setCharacters:(chars)   => set({ characters: chars }),
  setSelectedChar: (c)    => set({ selectedChar: c }),
  setFriends:   (friends) => set({ friends }),
  setPending:   (r)       => set({ pendingRequests: r }),
  setOnlineUsers: (ids)   => set({ onlineUserIds: ids }),

  startGame: (mode) => set({ gameMode: mode, screen: 'game' }),
  backToMenu: ()    => set({ screen: 'menu', gameMode: null }),
}));

// ─── Convenience selectors ────────────────────────────────────────────────────
// ELO promedio del perfil actual
export function avgElo(profile: DbProfile | null): number {
  if (!profile) return 1500;
  return Math.round((profile.elo_1v1 + profile.elo_2v2 + profile.elo_4v4) / 3);
}
