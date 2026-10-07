-- HELM — el guion también como documento de Drive.
--
-- `/programar-guion` escribe el guion y lo agenda en el calendario de Contenido.
-- Ahora además lo deja como Google Doc en la carpeta del perfil, que es donde
-- lo va a buscar quien graba. Aquí se guarda el enlace para poder abrirlo desde
-- el calendario sin tener que ir a rebuscar en Drive.
--
-- Admite null a propósito: un perfil sin Google enlazado sigue programando
-- guiones igual, solo que sin documento. Perder el guion porque Drive falló
-- sería mucho peor que un guion sin doc.
alter table helm_content_calendar
  add column if not exists doc_url text;

comment on column helm_content_calendar.doc_url is
  'Enlace al Google Doc del guion, si el perfil tiene Drive enlazado con permiso '
  'de escritura (scope drive.file) y carpeta preparada en Ajustes.';
