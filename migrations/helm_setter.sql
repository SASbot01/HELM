-- HELM — memoria de setting.
--
-- `helm_knowledge.kind` nació con tres valores pensados para contenido (reel,
-- analisis, nota). El entrenamiento del setter es otra cosa: su oferta, sus
-- objeciones, su tono y las conversaciones que sí cerraron. Guardarlo como
-- 'nota' lo mezclaba con el conocimiento de copy y no se podía separar al
-- construir el prompt, así que se le da su propio tipo.

do $$
declare c record;
begin
  -- El check original se creó inline, así que su nombre depende de cómo lo
  -- bautizó Postgres. Se buscan todos los checks de la columna y se quitan.
  for c in
    select conname from pg_constraint
     where conrelid = 'helm_knowledge'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table helm_knowledge drop constraint %I', c.conname);
  end loop;
end $$;

alter table helm_knowledge
  add constraint helm_knowledge_kind_check
  check (kind in ('reel', 'analisis', 'nota', 'setter'));
