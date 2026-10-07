-- ============================================
-- Weekly User Feedback — mandatory every 7 days
-- Pop-up bloqueante con 4 preguntas escala 1-10, 3 sí/no, 1 texto opcional.
-- Preguntas editables desde el home de BlackWolf.
-- ============================================

-- Configuración del formulario (versionada — editable desde BW home)
CREATE TABLE IF NOT EXISTS feedback_form_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL,                  -- incrementa con cada edición
  title text NOT NULL,
  intro text NOT NULL,
  scale_questions jsonb NOT NULL,        -- [{key,label}] — 4 items
  yesno_questions jsonb NOT NULL,        -- [{key,label}] — 3 items
  text_question_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_form_config_active
  ON feedback_form_config (is_active, version DESC);

-- Respuestas semanales por usuario
CREATE TABLE IF NOT EXISTS weekly_feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  user_type text,                        -- 'team' | 'store_client' | 'superadmin' | 'contable' | ...
  client_slug text,                      -- cliente en el que estaba logueado al responder
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  form_version int NOT NULL,
  scale_answers jsonb NOT NULL,          -- { q1: 8, q2: 9, q3: 7, q4: 10 }
  yesno_answers jsonb NOT NULL,          -- { q1: true, q2: false, q3: true }
  text_answer text,                      -- opcional
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_feedback_user
  ON weekly_feedback_responses (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_feedback_created
  ON weekly_feedback_responses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_feedback_client
  ON weekly_feedback_responses (client_slug, created_at DESC);

-- RLS
ALTER TABLE feedback_form_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_feedback_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role all" ON feedback_form_config;
CREATE POLICY "service_role all" ON feedback_form_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role all" ON weekly_feedback_responses;
CREATE POLICY "service_role all" ON weekly_feedback_responses FOR ALL USING (true) WITH CHECK (true);

-- Seed configuración inicial (v1) con las 7 preguntas acordadas
INSERT INTO feedback_form_config (version, title, intro, scale_questions, yesno_questions, text_question_label, is_active, created_by)
SELECT
  1,
  'Feedback Semanal',
  'Tu feedback mueve la plataforma. Cada semana te pedimos 1 minuto para saber qué cambiar, añadir o mejorar. Gracias por ayudarnos a construirla.',
  '[
    {"key":"satisfaccion","label":"¿Cómo valoras la plataforma esta semana?"},
    {"key":"utilidad","label":"¿Cuánto te ayuda en tu trabajo diario?"},
    {"key":"performance","label":"¿Qué tan fluida y rápida te resulta?"},
    {"key":"nps","label":"¿Cuánto la recomendarías a un compañero?"}
  ]'::jsonb,
  '[
    {"key":"bug","label":"¿Has encontrado algún bug o error esta semana?"},
    {"key":"missing_feature","label":"¿Echas en falta alguna funcionalidad que necesitas?"},
    {"key":"ai_helps","label":"¿La IA te está ayudando de verdad en tus tareas?"}
  ]'::jsonb,
  'Ideas, mejoras, quejas — escribe lo que quieras (opcional)',
  true,
  'system'
WHERE NOT EXISTS (SELECT 1 FROM feedback_form_config);
