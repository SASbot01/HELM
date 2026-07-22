-- ============================================
-- FORMACION & COMUNIDAD TABLES
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

-- Enable realtime for community messages
ALTER PUBLICATION supabase_realtime ADD TABLE comunidad_messages;
