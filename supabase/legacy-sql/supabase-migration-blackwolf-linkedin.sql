-- ============================================
-- BlackWolf — LinkedIn Growth Tracker
-- Tracking manual diario del crecimiento del LinkedIn de Sir Alex.
-- Scoped por client_id (en producción solo se usa para black-wolf).
-- ============================================

-- =============================================
-- 1. linkedin_daily_reports
--    Un row por (client_id, date). Contadores agregados del día.
-- =============================================
CREATE TABLE IF NOT EXISTS linkedin_daily_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  requests_sent integer NOT NULL DEFAULT 0,   -- conexiones que YO solicité hoy
  accepted integer NOT NULL DEFAULT 0,        -- de las solicitadas (en cualquier momento), cuántas se han aceptado HOY
  profile_views integer NOT NULL DEFAULT 0,   -- visitas al perfil ese día (opcional)
  followers_total integer,                    -- snapshot del nº total de seguidores al final del día
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, date)
);

CREATE INDEX IF NOT EXISTS idx_li_daily_client_date ON linkedin_daily_reports(client_id, date DESC);
ALTER TABLE linkedin_daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on linkedin_daily_reports" ON linkedin_daily_reports;
CREATE POLICY "Service role full access on linkedin_daily_reports" ON linkedin_daily_reports
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================
-- 2. linkedin_posts
--    Un row por post publicado. Métricas de engagement por post.
-- =============================================
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date date NOT NULL,                         -- fecha de publicación
  title text NOT NULL DEFAULT '',             -- título / hook / primeras palabras
  url text DEFAULT '',                        -- link al post en LinkedIn
  post_type text NOT NULL DEFAULT 'text'
    CHECK (post_type IN ('text', 'image', 'video', 'article', 'poll', 'carousel', 'document')),
  impressions integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  reposts integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,          -- clics en links / "ver más"
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_li_posts_client_date ON linkedin_posts(client_id, date DESC);
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on linkedin_posts" ON linkedin_posts;
CREATE POLICY "Service role full access on linkedin_posts" ON linkedin_posts
  FOR ALL USING (true) WITH CHECK (true);
