-- ═══════════════════════════════════════════════════════
--  WASTELAND — Schema completo
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- ── 1. Perfiles de usuario ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username   TEXT UNIQUE NOT NULL,
    elo_1v1    INTEGER DEFAULT 1500,
    elo_2v2    INTEGER DEFAULT 1500,
    elo_4v4    INTEGER DEFAULT 1500,
    wins       INTEGER DEFAULT 0,
    losses     INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Perfiles publicos"
    ON public.users FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Usuario edita su perfil"
    ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY IF NOT EXISTS "Usuario crea su perfil"
    ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- ── 2. Personajes (3 por cuenta) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.characters (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
    slot       INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
    name       TEXT NOT NULL,
    class_id   TEXT NOT NULL,
    level      INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slot)
);
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Ver propios personajes"
    ON public.characters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Gestionar propios personajes"
    ON public.characters FOR ALL USING (auth.uid() = user_id);

-- ── 3. Amigos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friends (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
    friend_id  UUID REFERENCES public.users(id) ON DELETE CASCADE,
    status     TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Ver amistades propias"
    ON public.friends FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY IF NOT EXISTS "Gestionar amistades"
    ON public.friends FOR ALL USING (auth.uid() = user_id);
-- Permitir al receptor aceptar/rechazar
CREATE POLICY IF NOT EXISTS "Receptor puede aceptar"
    ON public.friends FOR UPDATE
    USING (auth.uid() = friend_id);

-- ── 4. Salas de juego ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mode        TEXT NOT NULL,                     -- '1v1','2v2','4v4','practice'
    host_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status      TEXT DEFAULT 'waiting',            -- 'waiting','playing','finished'
    max_players INTEGER NOT NULL,
    players     JSONB DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Salas visibles" ON public.rooms FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Gestionar salas"  ON public.rooms FOR ALL USING (true);

-- ── 5. Cola de matchmaking ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
    mode       TEXT NOT NULL,
    elo        INTEGER NOT NULL,
    status     TEXT DEFAULT 'searching',           -- 'searching','matched','cancelled'
    room_id    UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Cola visible"    ON public.matchmaking_queue FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Gestionar cola"  ON public.matchmaking_queue FOR ALL USING (auth.uid() = user_id OR true);

-- ── 6. Chat ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
    username   TEXT NOT NULL,
    channel    TEXT NOT NULL DEFAULT 'world',      -- 'world', 'party', room_id
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Chat publico"
    ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enviar mensajes"
    ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Habilitar Realtime para chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- ── Índices de performance ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_characters_user   ON public.characters(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_user       ON public.friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend     ON public.friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_chat_channel       ON public.chat_messages(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_mode_status  ON public.matchmaking_queue(mode, status, elo);
