-- 2026-05-04 — Sistema de notificaciones por perfil.
--
-- Cada miembro recibe notificaciones cuando:
--   - Se le asigna una tarea (crm_tasks.assigned_to cambia)
--   - Se le asigna un ticket (ops_tickets.assigned_to cambia)
--   - (Más tipos se añaden en futuro: mention en mensajes, comentario en su tarea, etc)
--
-- Aislamiento: sólo el dueño ve sus notificaciones, vía endpoint backend
-- /api/notifications con identity check. RLS niega TODO a anon.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- 'task_assigned', 'ticket_assigned', 'mention', etc.
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                    -- ruta interna ej. '/asesorias-suiza/task-management'
  resource_type TEXT,           -- 'crm_tasks', 'ops_tickets', etc.
  resource_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_member_unread
  ON public.notifications(member_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notif_member_recent
  ON public.notifications(member_id, created_at DESC);

-- RLS estricta — patron user_integrations
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_deny_notifications" ON public.notifications;
DROP POLICY IF EXISTS "service_all_notifications" ON public.notifications;

CREATE POLICY "anon_deny_notifications" ON public.notifications
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "service_all_notifications" ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Trigger 1: notificación cuando se asigna una crm_task ────────
CREATE OR REPLACE FUNCTION public.notify_task_assigned() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  assignee_member_id UUID;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- assigned_to puede ser un member.id (uuid) o un email — resolvemos a member_id
  SELECT id INTO assignee_member_id FROM public.team
   WHERE client_id = NEW.client_id
     AND (id::text = NEW.assigned_to OR LOWER(email) = LOWER(NEW.assigned_to))
   LIMIT 1;

  IF assignee_member_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (client_id, member_id, type, title, body, link, resource_type, resource_id)
  VALUES (
    NEW.client_id, assignee_member_id, 'task_assigned',
    'Nueva tarea asignada',
    COALESCE(NEW.title, '(sin título)'),
    '/task-management',
    'crm_tasks', NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.crm_tasks;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- ── Trigger 2: notificación cuando se asigna un ops_ticket ────────
-- ops_tickets usa assigned_to_email (no uuid). Resolvemos a member_id por email.
CREATE OR REPLACE FUNCTION public.notify_ticket_assigned() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  assignee_member_id UUID;
  bw_client_id UUID;
BEGIN
  IF NEW.assigned_to_email IS NULL OR NEW.assigned_to_email = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to_email IS NOT DISTINCT FROM NEW.assigned_to_email THEN
    RETURN NEW;
  END IF;

  SELECT id INTO bw_client_id FROM public.clients WHERE slug='black-wolf' LIMIT 1;

  SELECT id INTO assignee_member_id FROM public.team
   WHERE LOWER(email) = LOWER(NEW.assigned_to_email)
     AND (client_id = NEW.client_id OR client_id = bw_client_id)
   LIMIT 1;

  IF assignee_member_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (client_id, member_id, type, title, body, link, resource_type, resource_id)
  VALUES (
    COALESCE(NEW.client_id, bw_client_id),
    assignee_member_id, 'ticket_assigned',
    'Nuevo ticket asignado',
    COALESCE(NEW.subject, '(sin asunto)'),
    '/ops/tickets/' || NEW.id::text,
    'ops_tickets', NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_assigned ON public.ops_tickets;
CREATE TRIGGER trg_notify_ticket_assigned
  AFTER INSERT OR UPDATE OF assigned_to_email ON public.ops_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_assigned();

COMMIT;
