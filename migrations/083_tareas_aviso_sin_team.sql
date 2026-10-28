-- 083 — Crear tareas volvía a fallar con «permission denied for table team».
--
-- Por qué: `team` guarda las credenciales y el navegador ya no tiene permisos
-- sobre ella (el alta de accesos va por api/equipo.js). Pero el trigger
-- trg_notify_task_assigned de crm_tasks la consulta para resolver al
-- responsable, y se ejecutaba con el rol del navegador. Además `assigned_to`
-- tiene '' por defecto, no NULL, así que el «si no hay responsable, salir»
-- nunca se cumplía: TODA tarea nueva pasaba por la consulta a `team`.
--
-- Arreglo:
--   1. '' cuenta como «sin responsable» y sale antes de tocar nada.
--   2. SECURITY DEFINER con search_path fijo: la función lee `team` y escribe
--      en `notifications` con los permisos de su dueño, sin devolverle al
--      navegador el acceso a la tabla de credenciales. Solo expone un id.
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  assignee_member_id UUID;
BEGIN
  IF NULLIF(NEW.assigned_to, '') IS NULL THEN RETURN NEW; END IF;
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
$function$;

-- Una función SECURITY DEFINER no se deja ejecutable para cualquiera: solo la
-- llama el trigger.
REVOKE ALL ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
