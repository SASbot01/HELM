-- 084 — Edición: el puesto del editor de vídeo dentro de HELM.
--
-- Tres tablas por perfil:
--   helm_edicion_clientes  para quién edita: canal o marca, contrato y tarifa
--   helm_edicion_pedidos   cada encargo, con su estado de flujo y, si sale de
--                          un guion del calendario, el guion enlazado
--   helm_edicion_cobros    lo que se cobra: pendiente, cobrado (y «atrasado»,
--                          que no se guarda: es pendiente con vencimiento pasado)
--
-- El flujo de un pedido: guion → bruto → edicion → revision → entregado.
-- Si el pedido sale de un guion, «bruto» y «entregado» los pone solo el Agente
-- Montador mirando el Drive (api/edicion.js → sincronizar): la pieza en
-- «1 · Sin editar» es bruto; en «2 · Editados» o «3 · Publicados», entregado.
--
-- Solo el servidor las toca (api/edicion.js exige acceso al perfil), como el
-- Agent OS: sin policy para anon.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_edicion_clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  canal       text NOT NULL DEFAULT '',
  contrato    text NOT NULL DEFAULT 'por_video'
                CHECK (contrato IN ('retainer', 'por_video', 'pack')),
  tarifa      numeric(10, 2) NOT NULL DEFAULT 0,
  estado      text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pausa', 'fin')),
  vip         boolean NOT NULL DEFAULT false,
  drive_url   text NOT NULL DEFAULT '',
  brief_url   text NOT NULL DEFAULT '',
  notas       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_edicion_clientes_client_idx ON public.helm_edicion_clientes (client_id);

CREATE TABLE IF NOT EXISTS public.helm_edicion_pedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cliente_id      uuid REFERENCES public.helm_edicion_clientes(id) ON DELETE SET NULL,
  guion_id        uuid REFERENCES public.helm_content_calendar(id) ON DELETE SET NULL,
  titulo          text NOT NULL,
  formato         text NOT NULL DEFAULT 'short' CHECK (formato IN ('short', 'largo', 'revision')),
  estado          text NOT NULL DEFAULT 'guion'
                    CHECK (estado IN ('guion', 'bruto', 'edicion', 'revision', 'entregado')),
  entrega         date,
  clips           integer NOT NULL DEFAULT 1,
  precio          numeric(10, 2) NOT NULL DEFAULT 0,
  notas_estilo    text NOT NULL DEFAULT '',
  editor_id       uuid REFERENCES public.helm_team(id) ON DELETE SET NULL,
  drive_url       text NOT NULL DEFAULT '',
  -- La hoja de montaje que escribe el Agente Montador a partir del guion.
  hoja            text NOT NULL DEFAULT '',
  hoja_at         timestamptz,
  entregado_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_edicion_pedidos_client_idx ON public.helm_edicion_pedidos (client_id, entrega);
-- Un guion, un pedido: es lo que deja al agente sincronizar sin duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS helm_edicion_pedidos_guion_uq
  ON public.helm_edicion_pedidos (guion_id) WHERE guion_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.helm_edicion_cobros (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cliente_id   uuid REFERENCES public.helm_edicion_clientes(id) ON DELETE SET NULL,
  pedido_id    uuid REFERENCES public.helm_edicion_pedidos(id) ON DELETE SET NULL,
  concepto     text NOT NULL,
  importe      numeric(10, 2) NOT NULL DEFAULT 0,
  vence        date,
  estado       text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'cobrado')),
  metodo       text NOT NULL DEFAULT 'transferencia'
                 CHECK (metodo IN ('stripe', 'bizum', 'transferencia', 'otro')),
  enlace       text NOT NULL DEFAULT '',
  cobrado_at   timestamptz,
  recordado_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_edicion_cobros_client_idx ON public.helm_edicion_cobros (client_id, vence);

ALTER TABLE public.helm_edicion_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helm_edicion_pedidos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helm_edicion_cobros   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_edicion_clientes_srv ON public.helm_edicion_clientes;
CREATE POLICY helm_edicion_clientes_srv ON public.helm_edicion_clientes TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS helm_edicion_pedidos_srv ON public.helm_edicion_pedidos;
CREATE POLICY helm_edicion_pedidos_srv ON public.helm_edicion_pedidos TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS helm_edicion_cobros_srv ON public.helm_edicion_cobros;
CREATE POLICY helm_edicion_cobros_srv ON public.helm_edicion_cobros TO service_role USING (true) WITH CHECK (true);

COMMIT;
