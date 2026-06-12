import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';

let _client: SupabaseClient | null = null;

// Cliente con service_role. Solo se crea si hay credenciales configuradas;
// el server funciona sin persistencia (modo prueba) si faltan.
export function db(): SupabaseClient | null {
  if (_client) return _client;
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseServiceKey) return null;
  _client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const hasDb = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseServiceKey);

// Guarda resultado de duelo (ELO). No-op si no hay DB.
export async function saveEloResult(winnerId: string, loserId: string) {
  const c = db();
  if (!c) return;
  try {
    await c.rpc('apply_duel_result', { winner: winnerId, loser: loserId });
  } catch {
    // RPC opcional; si no existe se ignora en modo prueba
  }
}
