-- Agent OS — el espacio de trabajo del operador, en /agents.
--
-- No es multi-perfil: no lleva client_id a propósito. Esto es el taller del
-- admin (sus identidades, su corpus, su memoria), no una sección más del panel
-- de un cliente. El acceso se comprueba en el servidor contra `superadmins`.
--
-- SEGURIDAD — y aquí se rompe con lo que hace el resto de la base:
-- estas tablas NO llevan policy para el rol `anon`. El resto de HELM tiene RLS
-- activada pero con políticas `using (true)` también para anon, así que
-- cualquiera con la clave anon del bundle público puede leerlas. Estas no: solo
-- entra `service_role`, es decir, solo el servidor. El navegador nunca habla
-- directamente con ellas.

BEGIN;

-- ── Identidades ────────────────────────────────────────────────────────────
-- Un estilo de creador estudiado a fondo (Alex Hormozi, y los que vengan).
-- `contexto` es el documento largo: cómo piensa, cómo estructura, qué hace y
-- qué no. Es lo que se le inyecta a la IA cuando escribe a su estilo.
CREATE TABLE IF NOT EXISTS public.agent_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  slug        text NOT NULL UNIQUE,
  descripcion text NOT NULL DEFAULT '',
  contexto    text NOT NULL DEFAULT '',
  -- Reglas cortas y accionables: {"siempre": [...], "nunca": [...]}
  reglas      jsonb NOT NULL DEFAULT '{}'::jsonb,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Corpus ─────────────────────────────────────────────────────────────────
-- Un reel estudiado, de principio a fin: el enlace que pegas, sus números, la
-- transcripción de Whisper y el etiquetado.
CREATE TABLE IF NOT EXISTS public.agent_reels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id  uuid REFERENCES public.agent_identities(id) ON DELETE SET NULL,

  url          text NOT NULL,
  -- Clave de idempotencia: pegar dos veces el mismo enlace no duplica el reel.
  url_hash     text NOT NULL UNIQUE,
  fuente       text NOT NULL DEFAULT 'instagram',
  cuenta       text NOT NULL DEFAULT '',
  publicado_en timestamptz,
  caption      text NOT NULL DEFAULT '',

  -- Los números, tal cual vengan. Se rellenan a mano o por importación; el
  -- paso de Apify queda para más adelante.
  -- {"vistas":n,"likes":n,"comentarios":n,"compartidos":n,"guardados":n}
  metricas     jsonb NOT NULL DEFAULT '{}'::jsonb,

  audio_path   text NOT NULL DEFAULT '',
  duracion_s   numeric,
  transcripcion text NOT NULL DEFAULT '',
  idioma       text NOT NULL DEFAULT '',

  -- El etiquetado de la pieza entera.
  -- {"tema":"...","tipo_gancho":"...","estructura":"...","cta":"..."}
  etiquetas    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- El etiquetado frase a frase, en orden:
  -- [{"texto":"...","rol":"gancho|planteamiento|remate|venta","inicio_s":0}]
  frases       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- pendiente → descargando → transcribiendo → transcrito → etiquetado
  -- y `error` en cualquier punto, con el motivo en `error`.
  estado       text NOT NULL DEFAULT 'pendiente',
  error        text NOT NULL DEFAULT '',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_reels_identity_idx ON public.agent_reels (identity_id);
CREATE INDEX IF NOT EXISTS agent_reels_estado_idx   ON public.agent_reels (estado);
-- La gráfica ordena por rendimiento y colorea por tipo de gancho: los dos
-- campos que más se van a consultar.
CREATE INDEX IF NOT EXISTS agent_reels_gancho_idx
  ON public.agent_reels ((etiquetas->>'tipo_gancho'));

-- ── Cola de trabajos ───────────────────────────────────────────────────────
-- El worker (scripts/agents-worker.mjs) come de aquí. Con reintentos, espera
-- entre intentos e idempotencia: un trabajo con la misma clave no entra dos
-- veces, que es lo que evita transcribir el mismo vídeo cinco veces.
CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,             -- descargar | transcribir | etiquetar
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave        text UNIQUE,               -- idempotencia
  estado       text NOT NULL DEFAULT 'pendiente',  -- pendiente|corriendo|hecho|error
  intentos     int  NOT NULL DEFAULT 0,
  max_intentos int  NOT NULL DEFAULT 3,
  error        text NOT NULL DEFAULT '',
  -- Para el reintento con espera: el worker solo coge lo que ya toca.
  correr_tras  timestamptz NOT NULL DEFAULT now(),
  empezado_en  timestamptz,
  acabado_en   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- El índice que usa el worker para coger el siguiente trabajo.
CREATE INDEX IF NOT EXISTS agent_jobs_cola_idx
  ON public.agent_jobs (estado, correr_tras)
  WHERE estado = 'pendiente';

-- ── Memoria a largo plazo ──────────────────────────────────────────────────
-- Lo que el Agent OS tiene que recordar entre sesiones. Sin embeddings: no hay
-- GPU en esta máquina y una búsqueda por texto y etiquetas resuelve el caso
-- real. Si algún día hace falta semántica, se añade una columna y ya.
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito      text NOT NULL DEFAULT 'global',   -- global | identidad
  identity_id uuid REFERENCES public.agent_identities(id) ON DELETE CASCADE,
  clave       text NOT NULL DEFAULT '',
  contenido   text NOT NULL,
  etiquetas   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memory_ambito_idx ON public.agent_memory (ambito, identity_id);
-- Búsqueda por texto en español sobre el contenido de la memoria.
CREATE INDEX IF NOT EXISTS agent_memory_texto_idx
  ON public.agent_memory USING gin (to_tsvector('spanish', contenido));

-- ── RLS: solo el servidor ──────────────────────────────────────────────────
ALTER TABLE public.agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_reels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory     ENABLE ROW LEVEL SECURITY;

-- Sin policy para anon: con RLS activada y ninguna política que le aplique, el
-- rol anónimo no ve ni una fila. service_role se salta RLS por definición, así
-- que el servidor entra igual y no hace falta darle una política.
DROP POLICY IF EXISTS agent_identities_srv ON public.agent_identities;
CREATE POLICY agent_identities_srv ON public.agent_identities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_reels_srv ON public.agent_reels;
CREATE POLICY agent_reels_srv ON public.agent_reels
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_jobs_srv ON public.agent_jobs;
CREATE POLICY agent_jobs_srv ON public.agent_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_memory_srv ON public.agent_memory;
CREATE POLICY agent_memory_srv ON public.agent_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ── CÓMO DESHACER ──────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TABLE IF EXISTS public.agent_memory     CASCADE;
-- DROP TABLE IF EXISTS public.agent_jobs       CASCADE;
-- DROP TABLE IF EXISTS public.agent_reels      CASCADE;
-- DROP TABLE IF EXISTS public.agent_identities CASCADE;
-- COMMIT;
