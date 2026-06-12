import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DbProfile {
  id: string;
  username: string;
  elo_1v1: number;
  elo_2v2: number;
  elo_4v4: number;
  wins: number;
  losses: number;
}

export interface DbCharacter {
  id: string;
  user_id: string;
  slot: number;
  name: string;
  class_id: string;
  level: number;
}

export interface DbFriend {
  friendship_id: number;
  id: string;
  username: string;
  elo_1v1: number;
  elo_2v2: number;
  elo_4v4: number;
  status: 'online' | 'offline';
  activity: string;
}

export interface DbFriendRequest {
  friendship_id: number;
  from_id: string;
  from_username: string;
}

export interface DbChatMessage {
  id: number;
  user_id: string;
  username: string;
  channel: string;
  message: string;
  created_at: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export async function getProfile(userId: string): Promise<DbProfile | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return data ?? null;
}

export async function createProfile(userId: string, username: string): Promise<DbProfile | null> {
  const { data } = await supabase
    .from('users')
    .insert({ id: userId, username })
    .select()
    .single();
  return data ?? null;
}

export async function updateUsername(userId: string, username: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ username })
    .eq('id', userId);
  return !error;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .ilike('username', username)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ─── Characters ───────────────────────────────────────────────────────────────
export async function getCharacters(userId: string): Promise<DbCharacter[]> {
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .order('slot');
  return data ?? [];
}

export async function createCharacter(
  userId: string,
  slot: number,
  name: string,
  classId: string,
): Promise<DbCharacter | null> {
  const { data } = await supabase
    .from('characters')
    .insert({ user_id: userId, slot, name, class_id: classId, level: 1 })
    .select()
    .single();
  return data ?? null;
}

export async function deleteCharacter(charId: string): Promise<boolean> {
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', charId);
  return !error;
}

// ─── Friends ──────────────────────────────────────────────────────────────────
export async function getFriends(userId: string): Promise<DbFriend[]> {
  // Get accepted friendships where user is either side
  const { data } = await supabase
    .from('friends')
    .select('id, user_id, friend_id, status, users_sender:user_id(id,username,elo_1v1,elo_2v2,elo_4v4), users_receiver:friend_id(id,username,elo_1v1,elo_2v2,elo_4v4)')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (!data) return [];
  return data.map((row: any) => {
    const isRequester = row.user_id === userId;
    const friend = isRequester ? row.users_receiver : row.users_sender;
    const elo = Math.round(((friend?.elo_1v1 ?? 1500) + (friend?.elo_2v2 ?? 1500) + (friend?.elo_4v4 ?? 1500)) / 3);
    return {
      friendship_id: row.id,
      id: friend?.id ?? '',
      username: friend?.username ?? 'Desconocido',
      elo_1v1: friend?.elo_1v1 ?? 1500,
      elo_2v2: friend?.elo_2v2 ?? 1500,
      elo_4v4: friend?.elo_4v4 ?? 1500,
      status: 'offline' as const,
      activity: '',
      elo,
    };
  });
}

export async function getPendingRequests(userId: string): Promise<DbFriendRequest[]> {
  const { data } = await supabase
    .from('friends')
    .select('id, user_id, users_sender:user_id(username)')
    .eq('friend_id', userId)
    .eq('status', 'pending');

  if (!data) return [];
  return data.map((row: any) => ({
    friendship_id: row.id,
    from_id: row.user_id,
    from_username: row.users_sender?.username ?? 'Desconocido',
  }));
}

export async function sendFriendRequest(userId: string, targetUsername: string): Promise<{ ok: boolean; error?: string }> {
  // Find target by username
  const { data: target } = await supabase
    .from('users')
    .select('id')
    .ilike('username', targetUsername)
    .single();

  if (!target) return { ok: false, error: 'Usuario no encontrado' };
  if (target.id === userId) return { ok: false, error: 'No podés agregarte a vos mismo' };

  // Check if already friends or pending
  const { data: existing } = await supabase
    .from('friends')
    .select('id, status')
    .or(`and(user_id.eq.${userId},friend_id.eq.${target.id}),and(user_id.eq.${target.id},friend_id.eq.${userId})`)
    .limit(1);

  if (existing?.length) {
    const st = existing[0].status;
    return { ok: false, error: st === 'accepted' ? 'Ya son amigos' : 'Solicitud ya enviada' };
  }

  const { error } = await supabase
    .from('friends')
    .insert({ user_id: userId, friend_id: target.id, status: 'pending' });

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function acceptFriendRequest(friendshipId: number): Promise<boolean> {
  const { error } = await supabase
    .from('friends')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  return !error;
}

export async function removeFriend(friendshipId: number): Promise<boolean> {
  const { error } = await supabase
    .from('friends')
    .delete()
    .eq('id', friendshipId);
  return !error;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export async function getChatMessages(channel: string, limit = 40): Promise<DbChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).reverse();
}

export async function sendChatMessage(
  userId: string,
  username: string,
  channel: string,
  message: string,
): Promise<boolean> {
  const trimmed = message.trim().slice(0, 200);
  if (!trimmed) return false;
  const { error } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, username, channel, message: trimmed });
  return !error;
}

export function subscribeChatMessages(
  channel: string,
  onMessage: (msg: DbChatMessage) => void,
) {
  return supabase
    .channel(`chat:${channel}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel=eq.${channel}` },
      (payload) => onMessage(payload.new as DbChatMessage),
    )
    .subscribe();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}
