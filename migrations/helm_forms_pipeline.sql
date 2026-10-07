-- HELM — cada formulario decide a qué pipeline entra su lead.
--
-- Hasta aquí, todo el que rellenaba un formulario caía en el pipeline por
-- defecto y en la etapa 'lead'. Con un solo embudo eso valía; con varios no:
-- el que viene de la calculadora de Hugo y el que pide una auditoría no están
-- en el mismo punto ni los trabaja la misma persona, y mezclarlos obliga a
-- reordenarlos a mano cada mañana.
--
-- Las dos columnas admiten null a propósito, que es el comportamiento de
-- siempre: sin pipeline elegido va al por defecto, y sin etapa elegida entra
-- por la primera del pipeline.
alter table helm_forms
  add column if not exists pipeline_id uuid references crm_pipelines(id) on delete set null,
  add column if not exists stage_key   text;

comment on column helm_forms.pipeline_id is
  'Pipeline al que entra el lead de este formulario. Null = el por defecto del perfil.';
comment on column helm_forms.stage_key is
  'Etapa de entrada dentro de ese pipeline. Null = la primera. Se guarda la clave, '
  'no el índice: renombrar o reordenar etapas no debe cambiar dónde caen los leads.';
