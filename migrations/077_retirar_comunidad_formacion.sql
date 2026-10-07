-- Retirada de los módulos de comunidad y formación de HELM.
-- HELM se queda en el CRM: contactos, formularios, llamadas, ventas y contenido.
-- Todo lo de comunidad interna, cursos, lecciones, MID e infoproducto sale del sistema.
--
-- Datos afectados: 42 filas, todas del cliente Laurent (fe9ea07a-9f34-4900-bee9-9e911056593f).
-- Las otras 31 tablas estaban vacías. Ninguna tabla que se queda tenía clave ajena hacia estas.
--
-- helm_library NO se toca: son los documentos que alimentan a la IA (api/chat.js
-- los lee como contexto), no material de formación. Es la base del futuro
-- Cerebro de marca y se absorberá ahí, no se tira.
--
-- Copias previas (rule: no se borra nada sin copia):
--   /home/s4sf/helm-backups/db/helm-20260923-2320.sql.gz                  (base completa)
--   /home/s4sf/helm-backups/db/contenido-formacion-comunidad-20260923.json (solo estas tablas)

BEGIN;

DROP TABLE IF EXISTS public.comunidad_channels CASCADE;
DROP TABLE IF EXISTS public.comunidad_messages CASCADE;
DROP TABLE IF EXISTS public.formacion_cursos CASCADE;
DROP TABLE IF EXISTS public.formacion_videos CASCADE;
DROP TABLE IF EXISTS public.helm_community CASCADE;
DROP TABLE IF EXISTS public.helm_community_members CASCADE;
DROP TABLE IF EXISTS public.helm_community_messages CASCADE;
DROP TABLE IF EXISTS public.helm_community_wall CASCADE;
DROP TABLE IF EXISTS public.helm_courses CASCADE;
DROP TABLE IF EXISTS public.helm_lessons CASCADE;
DROP TABLE IF EXISTS public.helm_modules CASCADE;
DROP TABLE IF EXISTS public.infoproducto_about CASCADE;
DROP TABLE IF EXISTS public.infoproducto_announcements CASCADE;
DROP TABLE IF EXISTS public.infoproducto_config CASCADE;
DROP TABLE IF EXISTS public.infoproducto_group_members CASCADE;
DROP TABLE IF EXISTS public.infoproducto_group_posts CASCADE;
DROP TABLE IF EXISTS public.infoproducto_groups CASCADE;
DROP TABLE IF EXISTS public.infoproducto_photos CASCADE;
DROP TABLE IF EXISTS public.infoproducto_sessions CASCADE;
DROP TABLE IF EXISTS public.infoproducto_users CASCADE;
DROP TABLE IF EXISTS public.mid_channels CASCADE;
DROP TABLE IF EXISTS public.mid_communities CASCADE;
DROP TABLE IF EXISTS public.mid_community_members CASCADE;
DROP TABLE IF EXISTS public.mid_events CASCADE;
DROP TABLE IF EXISTS public.mid_gate_submissions CASCADE;
DROP TABLE IF EXISTS public.mid_lesson_grants CASCADE;
DROP TABLE IF EXISTS public.mid_lesson_progress CASCADE;
DROP TABLE IF EXISTS public.mid_messages CASCADE;
DROP TABLE IF EXISTS public.mid_posts CASCADE;
DROP TABLE IF EXISTS public.mid_route_subscriptions CASCADE;
DROP TABLE IF EXISTS public.mid_support_messages CASCADE;
DROP TABLE IF EXISTS public.mid_support_threads CASCADE;
DROP TABLE IF EXISTS public.training_formations CASCADE;
DROP TABLE IF EXISTS public.training_lessons CASCADE;
DROP TABLE IF EXISTS public.training_modules CASCADE;
DROP TABLE IF EXISTS public.training_progress CASCADE;
DROP TABLE IF EXISTS public.training_routes CASCADE;

COMMIT;

-- ── CÓMO DESHACER ──────────────────────────────────────────────────────────
-- Restaura solo estas tablas desde el dump completo, sin tocar el resto:
--   zcat /home/s4sf/helm-backups/db/helm-20260923-2320.sql.gz \
--     | psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
-- (el dump recrea la base entera; para una restauración parcial, extrae de él
--  los CREATE TABLE y COPY de las tablas listadas arriba)
