-- ============================================
-- 1. ADD client_type TO clients
-- ============================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type text DEFAULT 'growth';
UPDATE clients SET client_type = 'admin' WHERE slug = 'black-wolf';

-- ============================================
-- 2. FORMACION & COMUNIDAD TABLES
-- ============================================

-- Cursos de formacion
CREATE TABLE IF NOT EXISTS formacion_cursos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    category VARCHAR(50) DEFAULT 'general',
    position INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formacion_cursos_client ON formacion_cursos(client_id);

-- RLS
ALTER TABLE formacion_cursos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='formacion_cursos' AND policyname='Service role full access on formacion_cursos') THEN
    CREATE POLICY "Service role full access on formacion_cursos" ON formacion_cursos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Videos dentro de un curso
CREATE TABLE IF NOT EXISTS formacion_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curso_id UUID NOT NULL REFERENCES formacion_cursos(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    embed_url TEXT,
    position INT DEFAULT 0,
    duration_seconds INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formacion_videos_curso ON formacion_videos(curso_id);
CREATE INDEX IF NOT EXISTS idx_formacion_videos_client ON formacion_videos(client_id);

ALTER TABLE formacion_videos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='formacion_videos' AND policyname='Service role full access on formacion_videos') THEN
    CREATE POLICY "Service role full access on formacion_videos" ON formacion_videos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Canales de comunidad (estilo Discord)
CREATE TABLE IF NOT EXISTS comunidad_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) DEFAULT 'general',
    description TEXT,
    position INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comunidad_channels_client ON comunidad_channels(client_id);

ALTER TABLE comunidad_channels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunidad_channels' AND policyname='Service role full access on comunidad_channels') THEN
    CREATE POLICY "Service role full access on comunidad_channels" ON comunidad_channels FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Mensajes de comunidad
CREATE TABLE IF NOT EXISTS comunidad_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES comunidad_channels(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    author_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    is_announcement BOOLEAN DEFAULT FALSE,
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comunidad_messages_channel ON comunidad_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_comunidad_messages_created ON comunidad_messages(created_at DESC);

ALTER TABLE comunidad_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunidad_messages' AND policyname='Service role full access on comunidad_messages') THEN
    CREATE POLICY "Service role full access on comunidad_messages" ON comunidad_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for community messages
ALTER PUBLICATION supabase_realtime ADD TABLE comunidad_messages;
