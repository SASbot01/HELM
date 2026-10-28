-- Agent OS — cada creador con su tipo de contenido (Filmmaking, Marca
-- personal, Ecommerce…). Texto libre y no tabla aparte: son un puñado y se
-- escriben a mano; /agents agrupa por él y el conector de Claude filtra.

ALTER TABLE public.agent_identities
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT '';
