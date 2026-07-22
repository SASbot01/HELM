-- 059_task_messages.sql
-- Conversaciones contextuales por tarea en Task Management.

CREATE TABLE IF NOT EXISTS task_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  sender_name text NOT NULL DEFAULT '',
  sender_role text NOT NULL DEFAULT 'member',
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_client ON task_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_task_created ON task_messages(task_id, created_at);

ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'task_messages'
      AND policyname = 'Service role full access on task_messages'
  ) THEN
    CREATE POLICY "Service role full access on task_messages"
      ON task_messages
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
