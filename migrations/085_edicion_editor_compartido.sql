-- 085 — Edición: un editor compartido entre perfiles.
--
-- El editor tiene su propio perfil de HELM (y su cuenta para entrar). Ese
-- perfil se da de alta aquí como «mesa de edición»: desde la sección Edición
-- de cualquier otro perfil se le pueden enviar pedidos (con su guion), y él los
-- recibe todos en SU Edición.
--
-- El pedido sigue siendo del perfil que lo envía (client_id): sus clientes, sus
-- cobros y su Drive. `editor_client_id` dice a qué mesa se ha enviado. El
-- editor lo ve y lo mueve de estado; el perfil ve el avance.

BEGIN;

CREATE TABLE IF NOT EXISTS public.helm_edicion_editores (
  client_id   uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  nombre      text NOT NULL DEFAULT '',
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.helm_edicion_pedidos
  ADD COLUMN IF NOT EXISTS editor_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_at timestamptz,
  -- Cuándo lo abrió el editor por primera vez: null = le sale como nuevo.
  ADD COLUMN IF NOT EXISTS visto_at timestamptz;
CREATE INDEX IF NOT EXISTS helm_edicion_pedidos_editor_idx
  ON public.helm_edicion_pedidos (editor_client_id, entrega) WHERE editor_client_id IS NOT NULL;

ALTER TABLE public.helm_edicion_editores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helm_edicion_editores_srv ON public.helm_edicion_editores;
CREATE POLICY helm_edicion_editores_srv ON public.helm_edicion_editores TO service_role USING (true) WITH CHECK (true);

COMMIT;
