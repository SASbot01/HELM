-- 052_intake_form_host_pipeline.sql
--
-- Pre-call intake form en booking público: el lead rellena un cuestionario
-- ANTES de ver slots. Reglas deciden:
--   - allow  → ve slot picker, al confirmar agenda en GCal y entra al pipeline+stage
--   - block  → no ve slots, ve un mensaje custom y entra al CRM en stage de revisión
--
-- También permite por host:
--   - event_description    : texto que va al evento de Google Calendar al confirmar
--   - booking_window_days  : límite de días desde hoy donde mostrar slots (default 14)
--   - intake_form_slug     : qué routing form se le pinta antes de agendar
--
-- Y por form:
--   - header_html              : bloque branded encima de las preguntas
--   - default_pipeline_slug    : pipeline destino fallback
--   - default_stage_key        : stage destino fallback
--
-- Seed final: stage 'agendados' + 'pendiente_admisiones' en Lanzamiento (DdC),
-- host 'elena' (Detrás de Cámara) y routing form 'detrasdecamara_intake' completo.
--
-- Idempotente. Re-ejecutar es seguro.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) booking_hosts: nuevos campos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE booking_hosts
  ADD COLUMN IF NOT EXISTS event_description    text,
  ADD COLUMN IF NOT EXISTS booking_window_days   int  NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS intake_form_slug      text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) booking_routing_forms: branding + destino CRM por defecto
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE booking_routing_forms
  ADD COLUMN IF NOT EXISTS header_html            text,
  ADD COLUMN IF NOT EXISTS default_pipeline_slug  text,
  ADD COLUMN IF NOT EXISTS default_stage_key      text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) booking_routing_responses: auditoría extendida (qué se hizo y dónde fue)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE booking_routing_responses
  ADD COLUMN IF NOT EXISTS action_taken    text, -- 'allow' | 'block'
  ADD COLUMN IF NOT EXISTS pipeline_slug   text,
  ADD COLUMN IF NOT EXISTS stage_key       text,
  ADD COLUMN IF NOT EXISTS crm_contact_id  uuid REFERENCES crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brr_contact ON booking_routing_responses (crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_brr_action  ON booking_routing_responses (client_id, action_taken, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Pipeline Lanzamiento de DdC: añadir stages 'agendados' y 'pendiente_admisiones'
--    Mantiene el orden actual y solo concatena los nuevos al final si no existen.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_client_id   uuid;
  v_pipeline_id uuid;
  v_stages      jsonb;
  v_has_agendados             boolean;
  v_has_pendiente_admisiones  boolean;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE slug = 'detras-de-camara' LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE NOTICE 'cliente detras-de-camara no existe — saltando seed pipeline';
    RETURN;
  END IF;

  -- Pipeline default del cliente (Lanzamiento es is_default=true desde 2026-04-24)
  SELECT id, COALESCE(stages, '[]'::jsonb)
    INTO v_pipeline_id, v_stages
  FROM crm_pipelines
  WHERE client_id = v_client_id AND is_default = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RAISE NOTICE 'pipeline default de detras-de-camara no encontrado';
    RETURN;
  END IF;

  v_has_agendados := EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_stages) e WHERE e->>'key' = 'agendados'
  );
  v_has_pendiente_admisiones := EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_stages) e WHERE e->>'key' = 'pendiente_admisiones'
  );

  IF NOT v_has_pendiente_admisiones THEN
    v_stages := v_stages || jsonb_build_array(
      jsonb_build_object('key', 'pendiente_admisiones', 'label', 'Pendiente admisiones', 'color', '#F59E0B')
    );
  END IF;
  IF NOT v_has_agendados THEN
    v_stages := v_stages || jsonb_build_array(
      jsonb_build_object('key', 'agendados', 'label', 'Agendados', 'color', '#15A34A')
    );
  END IF;

  UPDATE crm_pipelines SET stages = v_stages WHERE id = v_pipeline_id;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Seed: host 'elena' + intake form 'detrasdecamara_intake' para DdC
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_client_id      uuid;
  v_form_id        uuid;
  v_form_slug      text := 'detrasdecamara_intake';
  v_event_desc     text;
  v_header_html    text;
  v_block_message  text;
  v_questions      jsonb;
  v_rules          jsonb;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE slug = 'detras-de-camara' LIMIT 1;
  IF v_client_id IS NULL THEN RETURN; END IF;

  v_event_desc := E'Gracias por reservar tu llamada con el equipo de Detrás de Cámara, el programa de Abel Casal.\n\n'
               || E'En esta reunión, Elena —nuestra responsable de admisiones— te explicará en detalle cómo funciona la formación, resolverá todas tus dudas y valorará si tu perfil encaja con lo que ofrecemos.\n\n'
               || E'Antes de la reunión, ten en cuenta lo siguiente:\n\n'
               || E'🕐 Puntualidad. Te pedimos que te conectes a la hora exacta. Debido al alto volumen de solicitudes que recibimos tras el webinar, la agenda de Elena está muy ajustada y no podemos garantizar la reprogramación de reuniones perdidas.\n\n'
               || E'📓 Trae libreta y bolígrafo. Durante la sesión compartiremos información importante sobre el programa, la metodología y las condiciones de acceso a la primera edición. Te recomendamos tener papel y boli a mano para tomar notas.\n\n'
               || E'✅ Confirma tu asistencia. Recibirás un recordatorio antes de la reunión. Si por cualquier motivo no puedes asistir, avísanos con antelación para poder ceder tu espacio a otra persona en lista de espera —las plazas de la primera edición son limitadas.\n\n'
               || E'Nos vemos pronto.\n— Equipo Detrás de Cámara';

  v_header_html :=
    '<div style="font-family:''Inter'',sans-serif;line-height:1.65;color:#F5F6F7;">'
    || '<p style="margin:0 0 14px;color:#E8D48B;font-family:''Inter Tight'',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Detrás de Cámara · Admisiones</p>'
    || '<p style="margin:0 0 12px;font-size:15px;">El tiempo de Abel es limitado y, por temas logísticos, las plazas de <strong style="color:#C9A84C">Detrás de Cámara</strong> también lo son.</p>'
    || '<p style="margin:0 0 12px;font-size:15px;">Si lo tienes <strong style="color:#C9A84C">100&nbsp;% claro</strong>, vamos a darte prioridad absoluta — premiamos a las personas decididas y recibirás un <strong style="color:#C9A84C">bono extra</strong>.</p>'
    || '<p style="margin:0;font-size:14px;color:#8A8F9E;">Responde con honestidad. Las respuestas determinan si pasas a agendar tu llamada con Elena o si tu solicitud entra en revisión por el equipo.</p>'
    || '</div>';

  v_block_message :=
    '<div style="font-family:''Inter'',sans-serif;line-height:1.7;color:#F5F6F7;max-width:560px;margin:0 auto;">'
    || '<h2 style="font-family:''Inter Tight'',sans-serif;font-weight:600;font-size:24px;color:#C9A84C;margin:0 0 18px;letter-spacing:-0.01em;">Solicitud recibida</h2>'
    || '<p style="margin:0 0 14px;font-size:15px;">Gracias por tu interés en invertir en <strong style="color:#C9A84C">Detrás de Cámara</strong>.</p>'
    || '<p style="margin:0 0 14px;font-size:15px;">El equipo de admisiones revisará tu solicitud en los próximos minutos. Si estás dentro de los perfiles que buscamos, se te contactará a lo largo de esta misma tarde.</p>'
    || '<p style="margin:0 0 24px;font-size:15px;">Por favor, valora el tiempo de nuestro equipo y estate pendiente.</p>'
    || '<p style="margin:0;font-size:15px;color:#E8D48B;font-style:italic;">Un abrazo.<br><strong style="color:#C9A84C;font-style:normal;">— Abel Casal</strong> <span style="color:#8A8F9E;font-style:normal;">(Detrás de Cámara)</span></p>'
    || '</div>';

  v_questions := jsonb_build_array(
    -- Datos básicos
    jsonb_build_object(
      'key', 'nombre',
      'label', 'Nombre completo',
      'type', 'text',
      'required', true,
      'placeholder', 'Nombre y apellidos'
    ),
    jsonb_build_object(
      'key', 'email',
      'label', 'Email',
      'type', 'email',
      'required', true,
      'placeholder', 'tu@email.com'
    ),
    jsonb_build_object(
      'key', 'telefono',
      'label', 'Número de teléfono (WhatsApp)',
      'type', 'phone',
      'required', true,
      'placeholder', '+34 600 000 000'
    ),
    jsonb_build_object(
      'key', 'instagram',
      'label', 'Instagram',
      'type', 'text',
      'required', false,
      'placeholder', '@tuusuario'
    ),
    -- Q1: condicional principal — si "tengo_dudas" → block
    jsonb_build_object(
      'key', 'claridad',
      'label', '¿Lo tienes 100% claro o tienes dudas?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'lo_tengo_100_claro', 'label', 'Lo tengo 100% claro'),
        jsonb_build_object('value', 'tengo_dudas',        'label', 'Tengo dudas')
      )
    ),
    -- Q2: situación actual
    jsonb_build_object(
      'key', 'situacion',
      'label', '¿Cuál describe mejor tu situación actual?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'estudiante', 'label', 'Estudiante'),
        jsonb_build_object('value', 'empleado',   'label', 'Empleado'),
        jsonb_build_object('value', 'autonomo',   'label', 'Autónomo'),
        jsonb_build_object('value', 'en_paro',    'label', 'En el paro'),
        jsonb_build_object('value', 'otro',       'label', 'Otro')
      )
    ),
    -- Q3: compromiso asistencia
    jsonb_build_object(
      'key', 'compromiso',
      'label', 'Debido a la demanda y al esfuerzo que ponemos en cada llamada, necesitamos saber al 100% que vas a asistir. ¿Te comprometes?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'si_confirmo_100',   'label', 'Sí, confirmo 100%'),
        jsonb_build_object('value', 'probablemente_si',  'label', 'Probablemente sí, pero podría cambiar'),
        jsonb_build_object('value', 'no_estoy_seguro',   'label', 'No estoy seguro')
      )
    ),
    -- Q4: experiencia filmmaking 1-5
    jsonb_build_object(
      'key', 'experiencia_filmmaking',
      'label', 'Del 1 al 5, ¿qué experiencia tienes en el mundo del filmmaking?',
      'type', 'scale_1_5',
      'required', true,
      'min_label', 'Cero experiencia',
      'max_label', 'Llevo años trabajando'
    ),
    -- Q5: decisión final
    jsonb_build_object(
      'key', 'decisor',
      'label', '¿Eres tú quien toma la decisión final sobre esta inversión?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'si_yo_decido',         'label', 'Sí, yo tomo la decisión'),
        jsonb_build_object('value', 'decisor_acompanando',  'label', 'No, pero la persona que decide estará conmigo en la reunión'),
        jsonb_build_object('value', 'consultar_despues',    'label', 'No, tendré que consultarlo después')
      )
    )
  );

  v_rules := jsonb_build_array(
    -- Regla 1: "tengo dudas" → BLOCK con mensaje de Abel + stage pendiente_admisiones
    jsonb_build_object(
      'conditions', jsonb_build_array(
        jsonb_build_object('field', 'claridad', 'op', 'equals', 'value', 'tengo_dudas')
      ),
      'action', jsonb_build_object(
        'type', 'block',
        'message_html', v_block_message,
        'pipeline_slug', 'lanzamiento',
        'stage_key', 'pendiente_admisiones'
      )
    ),
    -- Regla 2 (fallback explícito): permitir agendar con Elena
    jsonb_build_object(
      'conditions', jsonb_build_array(
        jsonb_build_object('field', 'claridad', 'op', 'equals', 'value', 'lo_tengo_100_claro')
      ),
      'action', jsonb_build_object(
        'type', 'allow',
        'host_slug', 'elena',
        'pipeline_slug', 'lanzamiento',
        'stage_key', 'agendados'
      )
    )
  );

  -- Upsert form (idempotente)
  INSERT INTO booking_routing_forms (
    client_id, slug, name, description, header_html,
    questions, rules, fallback_host_slug,
    default_pipeline_slug, default_stage_key, active
  ) VALUES (
    v_client_id, v_form_slug,
    'Detrás de Cámara · Admisiones',
    'Cuestionario previo a la reserva de llamada con el equipo de admisiones.',
    v_header_html, v_questions, v_rules,
    'elena', 'lanzamiento', 'agendados', true
  )
  ON CONFLICT (client_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    header_html = EXCLUDED.header_html,
    questions = EXCLUDED.questions,
    rules = EXCLUDED.rules,
    fallback_host_slug = EXCLUDED.fallback_host_slug,
    default_pipeline_slug = EXCLUDED.default_pipeline_slug,
    default_stage_key = EXCLUDED.default_stage_key,
    active = EXCLUDED.active,
    updated_at = now()
  RETURNING id INTO v_form_id;

  -- Upsert host Elena (idempotente). Email es placeholder — Alejandro lo
  -- reemplaza cuando tenga el real. google_account_index=1 = cuenta Abel.
  INSERT INTO booking_hosts (
    client_id, slug, name, role, description, email,
    duration_minutes, google_account_index, host_type, team_members,
    is_active, position,
    event_description, booking_window_days, intake_form_slug
  ) VALUES (
    v_client_id, 'elena', 'Elena', 'Admisiones · Detrás de Cámara',
    'Te llamará para entender tu perfil y explicarte cómo funciona la formación.',
    'elena@detrasdecamara.org',
    30, 1, 'individual', '[]'::jsonb,
    true, 1,
    v_event_desc, 14, v_form_slug
  )
  ON CONFLICT (client_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    description = EXCLUDED.description,
    duration_minutes = EXCLUDED.duration_minutes,
    host_type = EXCLUDED.host_type,
    team_members = EXCLUDED.team_members,
    is_active = EXCLUDED.is_active,
    event_description = EXCLUDED.event_description,
    booking_window_days = EXCLUDED.booking_window_days,
    intake_form_slug = EXCLUDED.intake_form_slug,
    updated_at = now();
    -- email + google_account_index NO se sobreescriben (Alejandro los puede ajustar manualmente)
END $$;
