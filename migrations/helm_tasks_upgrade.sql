-- HELM — Tareas mejoradas: asignación a un miembro del equipo y checklist de
-- subtareas. El resto (status todo/in_progress/review/done, priority, due_date)
-- ya existía en crm_tasks tras task_management_v2.
--
--   assignee_id → miembro de `team` responsable de la tarea (null = sin asignar)
--   checklist   → array jsonb de subtareas: [{ "text": "...", "done": false }]

alter table crm_tasks
  add column if not exists assignee_id uuid references team(id) on delete set null,
  add column if not exists checklist   jsonb not null default '[]'::jsonb;

create index if not exists crm_tasks_assignee_idx on crm_tasks (assignee_id);
