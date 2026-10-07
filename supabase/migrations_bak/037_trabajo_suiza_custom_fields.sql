-- Migration 037 — Custom fields para FormTrabajoPortillo / FormTrabajoLukas
-- Define 9 campos filtrables en crm_custom_fields (cliente asesorias-suiza) y
-- back-fillea los 99 contactos existentes parseando las notas estructuradas.

BEGIN;

-- ── 1. Definiciones de custom fields ────────────────────────────────────────
WITH c AS (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
INSERT INTO crm_custom_fields (client_id, name, field_key, field_type, options, position, active)
SELECT c.id, f.name, f.field_key, f.field_type, f.options, f.pos, true
FROM c, (VALUES
  ('Origen landing (trabajo)',       'trabajo_form_owner',    'select',
    '[{"value":"portillo","label":"Portillo"},{"value":"lukas","label":"Lukas"}]'::jsonb, 100),
  ('Experiencia construcción',       'trabajo_experiencia',   'select',
    '[{"value":"bastante","label":"Bastante experiencia"},{"value":"poco","label":"Un poco (básico)"},{"value":"ninguna","label":"Ninguna, pero aprendo"}]'::jsonb, 101),
  ('Habilidades',                    'trabajo_habilidades',   'textarea', NULL, 102),
  ('Actualmente en Suiza',           'trabajo_en_suiza',      'select',
    '[{"value":"si","label":"Sí"},{"value":"no","label":"No"}]'::jsonb, 103),
  ('Disponibilidad incorporación',   'trabajo_incorporacion', 'select',
    '[{"value":"inmediata","label":"Inmediata"},{"value":"menos_2s","label":"Menos de 2 semanas"},{"value":"mas_2s","label":"Más de 2 semanas"}]'::jsonb, 104),
  ('Puntual / buena salud',          'trabajo_puntual_salud', 'select',
    '[{"value":"si","label":"Sí"},{"value":"no","label":"No"}]'::jsonb, 105),
  ('Carné de conducir',              'trabajo_carnet',        'select',
    '[{"value":"si","label":"Sí"},{"value":"no","label":"No"}]'::jsonb, 106),
  ('Comentarios formulario',         'trabajo_comentarios',   'textarea', NULL, 107),
  ('CV (URL)',                       'trabajo_cv_url',        'url',      NULL, 108)
) AS f(name, field_key, field_type, options, pos)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_custom_fields cf
  WHERE cf.client_id = c.id AND cf.field_key = f.field_key
);

-- ── 2. Back-fill de los 99 contactos trabajo existentes ─────────────────────
DO $$
DECLARE
  r record;
  cf jsonb;
  m  text[];
  owner_raw text;
  exp_label text;
  inc_label text;
  exp_key   text;
  inc_key   text;
BEGIN
  FOR r IN
    SELECT id, notes, COALESCE(custom_fields, '{}'::jsonb) AS cfx
    FROM crm_contacts
    WHERE client_id = (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
      AND source LIKE 'landing-trabajo-%'
      AND notes ILIKE 'Form trabajo Suiza%'
  LOOP
    cf := r.cfx;

    -- Owner: "Form trabajo Suiza (Lukas)" → lukas
    m := regexp_match(r.notes, 'Form trabajo Suiza \((Portillo|Lukas)\)');
    IF m IS NOT NULL THEN
      owner_raw := lower(m[1]);
      cf := jsonb_set(cf, '{trabajo_form_owner}', to_jsonb(owner_raw));
    END IF;

    -- Experiencia
    m := regexp_match(r.notes, E'(?m)^Experiencia: (.+)$');
    IF m IS NOT NULL THEN
      exp_label := m[1];
      exp_key := CASE
        WHEN exp_label ILIKE 'Sí, bastante%' THEN 'bastante'
        WHEN exp_label ILIKE 'Sí, un poco%'   THEN 'poco'
        WHEN exp_label ILIKE 'No%'            THEN 'ninguna'
        ELSE exp_label
      END;
      cf := jsonb_set(cf, '{trabajo_experiencia}', to_jsonb(exp_key));
    END IF;

    -- Habilidades (una sola línea)
    m := regexp_match(r.notes, E'(?m)^Habilidades: (.+)$');
    IF m IS NOT NULL THEN cf := jsonb_set(cf, '{trabajo_habilidades}', to_jsonb(m[1])); END IF;

    -- En Suiza
    m := regexp_match(r.notes, E'(?m)^En Suiza: (Sí|No)$');
    IF m IS NOT NULL THEN
      cf := jsonb_set(cf, '{trabajo_en_suiza}', to_jsonb(CASE WHEN m[1]='Sí' THEN 'si' ELSE 'no' END));
    END IF;

    -- Incorporación
    m := regexp_match(r.notes, E'(?m)^Incorporación: (.+)$');
    IF m IS NOT NULL THEN
      inc_label := m[1];
      inc_key := CASE
        WHEN inc_label ILIKE 'Inmediata%'         THEN 'inmediata'
        WHEN inc_label ILIKE 'Menos de 2 semanas%' THEN 'menos_2s'
        WHEN inc_label ILIKE 'Más de 2 semanas%'   THEN 'mas_2s'
        ELSE inc_label
      END;
      cf := jsonb_set(cf, '{trabajo_incorporacion}', to_jsonb(inc_key));
    END IF;

    -- Puntual / buena salud
    m := regexp_match(r.notes, E'(?m)^Puntual y buena salud: (Sí|No)$');
    IF m IS NOT NULL THEN
      cf := jsonb_set(cf, '{trabajo_puntual_salud}', to_jsonb(CASE WHEN m[1]='Sí' THEN 'si' ELSE 'no' END));
    END IF;

    -- Carné
    m := regexp_match(r.notes, E'(?m)^Carné de conducir: (Sí|No)$');
    IF m IS NOT NULL THEN
      cf := jsonb_set(cf, '{trabajo_carnet}', to_jsonb(CASE WHEN m[1]='Sí' THEN 'si' ELSE 'no' END));
    END IF;

    -- Comentarios (multilinea hasta "\nCV: " o fin de notas)
    m := regexp_match(r.notes, E'Comentarios: ([\\s\\S]*?)(?=\\nCV:|$)');
    IF m IS NOT NULL AND length(trim(m[1])) > 0 THEN
      cf := jsonb_set(cf, '{trabajo_comentarios}', to_jsonb(trim(m[1])));
    END IF;

    -- CV URL
    m := regexp_match(r.notes, E'(?m)^CV: (https?://\\S+)$');
    IF m IS NOT NULL THEN cf := jsonb_set(cf, '{trabajo_cv_url}', to_jsonb(m[1])); END IF;

    -- Guardar custom_fields + limpiar notes (queda marca breve)
    UPDATE crm_contacts
       SET custom_fields = cf,
           notes = CASE
             WHEN owner_raw IS NOT NULL
               THEN '✓ Formulario trabajo Suiza (' || initcap(owner_raw) || ') — datos migrados a Campos'
             ELSE '✓ Formulario trabajo Suiza — datos migrados a Campos'
           END
     WHERE id = r.id;
  END LOOP;
END $$;

COMMIT;
