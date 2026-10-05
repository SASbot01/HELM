-- HELM — Vídeo de formación privado: bucket aparte, sin URL pública.
--
-- Hasta ahora un vídeo subido en una clase se guardaba en el bucket 'helm'
-- (público, ver migrations/helm_operativa.sql), así que su URL funcionaba
-- para siempre y para cualquiera que la tuviera, fuera alumno o no.
--
-- Este bucket es DISTINTO y privado: nadie con la anon key puede leerlo
-- directamente (política select solo para service_role). El dueño sigue
-- subiendo el archivo desde el navegador (insert sí abierto a anon, igual que
-- el resto de HELM), pero para VER el vídeo hace falta una URL firmada con
-- caducidad corta, y esa firma solo la genera el servidor — en
-- api/comunidad.js, acción "contenido", que ya exige sesión de miembro activo
-- antes de devolver nada.
insert into storage.buckets (id, name, public)
values ('helm-video', 'helm-video', false)
on conflict (id) do nothing;

do $$
begin
  drop policy if exists helm_video_write  on storage.objects;
  drop policy if exists helm_video_delete on storage.objects;
  drop policy if exists helm_video_select on storage.objects;

  create policy helm_video_write on storage.objects
    for insert with check (bucket_id = 'helm-video');
  create policy helm_video_delete on storage.objects
    for delete using (bucket_id = 'helm-video');
  -- Sin política select para anon/authenticated: solo el service_role (que
  -- ignora RLS) puede leer el objeto o generar una URL firmada sobre él.
  create policy helm_video_select on storage.objects
    for select to service_role using (bucket_id = 'helm-video');
end $$;
