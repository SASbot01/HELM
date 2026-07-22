-- ============================================
-- Weekly Feedback — razones de "Sí" + resúmenes acumulados por IA
-- ============================================

-- 1. Añadir yesno_reasons a las respuestas existentes
--    Formato: { "bug": "descripción del bug", "missing_feature": "idea..." }
--    Solo se guarda cuando el usuario responde "Sí" y escribe un motivo.
ALTER TABLE weekly_feedback_responses
  ADD COLUMN IF NOT EXISTS yesno_reasons jsonb;

-- 2. Resúmenes generados por IA (cada ~5-6 respuestas nuevas)
CREATE TABLE IF NOT EXISTS weekly_feedback_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_text text NOT NULL,
  analyzed_count int NOT NULL,
  analyzed_response_ids jsonb NOT NULL,  -- array de uuids de respuestas incluidas
  model text,
  tokens_in int,
  tokens_out int,
  auto_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_feedback_summaries_created
  ON weekly_feedback_summaries (created_at DESC);

ALTER TABLE weekly_feedback_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role all" ON weekly_feedback_summaries;
CREATE POLICY "service_role all" ON weekly_feedback_summaries FOR ALL USING (true) WITH CHECK (true);
