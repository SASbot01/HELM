-- 095 — Avatar: el estudio de los clientes de un perfil.
--
-- Una IA repasa los contactos del CRM de un perfil, uno a uno, y de lo que hay
-- en su ficha (nombre, país, teléfono, producto, situación, notas, lo que ha
-- facturado…) saca un perfil: género probable, rango de edad, dónde vive, qué
-- factura y quién es. Con todos, arma el avatar del cliente tipo del negocio.
--
-- No inventa: lo que no se puede deducir de la ficha queda como 'desconocido',
-- y el estudio dice qué datos faltan para afinarlo.
--
-- Dos tablas, solo de la clave de servicio: el estudio por perfil (helm_avatar)
-- y la ficha por contacto (helm_avatar_contactos). Se leen por api/avatar.js.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_avatar_contactos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  nombre        text NOT NULL DEFAULT '',
  genero        text NOT NULL DEFAULT 'desconocido' CHECK (genero IN ('hombre', 'mujer', 'desconocido')),
  genero_conf   text NOT NULL DEFAULT 'baja' CHECK (genero_conf IN ('alta', 'media', 'baja')),
  edad_rango    text NOT NULL DEFAULT 'desconocido',
  ubicacion     text NOT NULL DEFAULT 'desconocido',
  facturacion   text NOT NULL DEFAULT 'desconocido',
  perfil        text NOT NULL DEFAULT '',
  interes       text NOT NULL DEFAULT '',
  senales       jsonb NOT NULL DEFAULT '{}'::jsonb,
  analizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);
CREATE INDEX IF NOT EXISTS helm_avatar_contactos_idx ON public.helm_avatar_contactos (client_id);

CREATE TABLE IF NOT EXISTS public.helm_avatar (
  client_id     uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  resumen       jsonb NOT NULL DEFAULT '{}'::jsonb,
  n_contactos   integer NOT NULL DEFAULT 0,
  n_analizados  integer NOT NULL DEFAULT 0,
  tokens        integer NOT NULL DEFAULT 0,
  generado_en   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.helm_avatar_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helm_avatar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_avatar_contactos_srv ON public.helm_avatar_contactos;
DROP POLICY IF EXISTS helm_avatar_srv ON public.helm_avatar;
CREATE POLICY helm_avatar_contactos_srv ON public.helm_avatar_contactos TO service_role USING (true) WITH CHECK (true);
CREATE POLICY helm_avatar_srv ON public.helm_avatar TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.helm_avatar_contactos FROM anon, authenticated;
REVOKE ALL ON public.helm_avatar FROM anon, authenticated;

COMMIT;
