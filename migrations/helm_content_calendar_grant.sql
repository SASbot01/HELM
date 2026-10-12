-- helm_content_calendar lo lee el Roadmap desde el navegador (cliente anon de
-- Supabase). Tenía la política RLS `using(true)` pero NINGÚN grant de tabla, así
-- que la lectura devolvía «permission denied» y el roadmap nunca enseñaba los
-- guiones (solo la plantilla). Igual que helm_ads / helm_ig_media, se concede la
-- lectura a anon y authenticated (los writes siguen yendo por el servicio).
GRANT SELECT ON helm_content_calendar TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
