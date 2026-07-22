-- 053_dcc_intake_rules_swap.sql
--
-- Corrige la lógica del intake form de Detrás de Cámara:
--   - "Lo tengo 100% claro"   → BLOCK con mensaje de Abel ("el equipo de
--                                admisiones te contactará en los próximos
--                                minutos"). NO agenda. Stage pendiente_admisiones.
--   - "Tengo dudas"            → ALLOW. Despliega situación / compromiso /
--                                experiencia / decisor → agenda con Elena.
--                                Stage agendados.
--
-- Además añade `show_if` a las preguntas Q6–Q9 para que solo se muestren
-- cuando el lead haya marcado "tengo dudas". Si marca "100% claro", el
-- form se queda en las preguntas básicas y al continuar va al block.
--
-- Idempotente.

DO $$
DECLARE
  v_client_id      uuid;
  v_form_slug      text := 'detrasdecamara_intake';
  v_block_message  text;
  v_questions      jsonb;
  v_rules          jsonb;
  v_show_if_dudas  jsonb;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE slug = 'detras-de-camara' LIMIT 1;
  IF v_client_id IS NULL THEN RETURN; END IF;

  v_block_message :=
    '<div style="font-family:''Inter'',sans-serif;line-height:1.7;color:#F5F6F7;max-width:560px;margin:0 auto;">'
    || '<h2 style="font-family:''Inter Tight'',sans-serif;font-weight:600;font-size:24px;color:#C9A84C;margin:0 0 18px;letter-spacing:-0.01em;">Solicitud recibida</h2>'
    || '<p style="margin:0 0 14px;font-size:15px;">Gracias por tu interés en invertir en <strong style="color:#C9A84C">Detrás de Cámara</strong>.</p>'
    || '<p style="margin:0 0 14px;font-size:15px;">El equipo de admisiones revisará tu solicitud en los próximos minutos. Si estás dentro de los perfiles que buscamos, se te contactará a lo largo de esta misma tarde.</p>'
    || '<p style="margin:0 0 24px;font-size:15px;">Por favor, valora el tiempo de nuestro equipo y estate pendiente.</p>'
    || '<p style="margin:0;font-size:15px;color:#E8D48B;font-style:italic;">Un abrazo.<br><strong style="color:#C9A84C;font-style:normal;">— Abel Casal</strong> <span style="color:#8A8F9E;font-style:normal;">(Detrás de Cámara)</span></p>'
    || '</div>';

  v_show_if_dudas := jsonb_build_object(
    'field', 'claridad',
    'op',    'equals',
    'value', 'tengo_dudas'
  );

  v_questions := jsonb_build_array(
    jsonb_build_object(
      'key', 'nombre', 'label', 'Nombre completo', 'type', 'text',
      'required', true, 'placeholder', 'Nombre y apellidos'
    ),
    jsonb_build_object(
      'key', 'email', 'label', 'Email', 'type', 'email',
      'required', true, 'placeholder', 'tu@email.com'
    ),
    jsonb_build_object(
      'key', 'telefono', 'label', 'Número de teléfono (WhatsApp)', 'type', 'phone',
      'required', true, 'placeholder', '+34 600 000 000'
    ),
    jsonb_build_object(
      'key', 'instagram', 'label', 'Instagram', 'type', 'text',
      'required', false, 'placeholder', '@tuusuario'
    ),
    -- Q5: condicional (gating)
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
    -- Q6: solo se muestra si claridad = tengo_dudas
    jsonb_build_object(
      'key', 'situacion',
      'label', '¿Cuál describe mejor tu situación actual?',
      'type', 'radio',
      'required', true,
      'show_if', v_show_if_dudas,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'estudiante', 'label', 'Estudiante'),
        jsonb_build_object('value', 'empleado',   'label', 'Empleado'),
        jsonb_build_object('value', 'autonomo',   'label', 'Autónomo'),
        jsonb_build_object('value', 'en_paro',    'label', 'En el paro'),
        jsonb_build_object('value', 'otro',       'label', 'Otro')
      )
    ),
    jsonb_build_object(
      'key', 'compromiso',
      'label', 'Debido a la demanda y al esfuerzo que ponemos en cada llamada, necesitamos saber al 100% que vas a asistir. ¿Te comprometes?',
      'type', 'radio',
      'required', true,
      'show_if', v_show_if_dudas,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'si_confirmo_100',   'label', 'Sí, confirmo 100%'),
        jsonb_build_object('value', 'probablemente_si',  'label', 'Probablemente sí, pero podría cambiar'),
        jsonb_build_object('value', 'no_estoy_seguro',   'label', 'No estoy seguro')
      )
    ),
    jsonb_build_object(
      'key', 'experiencia_filmmaking',
      'label', 'Del 1 al 5, ¿qué experiencia tienes en el mundo del filmmaking?',
      'type', 'scale_1_5',
      'required', true,
      'show_if', v_show_if_dudas,
      'min_label', 'Cero experiencia',
      'max_label', 'Llevo años trabajando'
    ),
    jsonb_build_object(
      'key', 'decisor',
      'label', '¿Eres tú quien toma la decisión final sobre esta inversión?',
      'type', 'radio',
      'required', true,
      'show_if', v_show_if_dudas,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'si_yo_decido',         'label', 'Sí, yo tomo la decisión'),
        jsonb_build_object('value', 'decisor_acompanando',  'label', 'No, pero la persona que decide estará conmigo en la reunión'),
        jsonb_build_object('value', 'consultar_despues',    'label', 'No, tendré que consultarlo después')
      )
    )
  );

  -- ⬇⬇ Reglas INVERTIDAS (vs. migration 052)
  v_rules := jsonb_build_array(
    -- Regla 1: "lo tengo 100% claro" → BLOCK con mensaje de Abel.
    -- El equipo de admisiones contacta directamente a estos leads (priority).
    jsonb_build_object(
      'conditions', jsonb_build_array(
        jsonb_build_object('field', 'claridad', 'op', 'equals', 'value', 'lo_tengo_100_claro')
      ),
      'action', jsonb_build_object(
        'type', 'block',
        'message_html', v_block_message,
        'pipeline_slug', 'lanzamiento',
        'stage_key', 'pendiente_admisiones'
      )
    ),
    -- Regla 2: "tengo dudas" → ALLOW. El lead despliega el resto del form
    -- y agenda con Elena después de elegir slot.
    jsonb_build_object(
      'conditions', jsonb_build_array(
        jsonb_build_object('field', 'claridad', 'op', 'equals', 'value', 'tengo_dudas')
      ),
      'action', jsonb_build_object(
        'type', 'allow',
        'host_slug', 'elena',
        'pipeline_slug', 'lanzamiento',
        'stage_key', 'agendados'
      )
    )
  );

  UPDATE booking_routing_forms
     SET questions = v_questions,
         rules = v_rules,
         updated_at = now()
   WHERE client_id = v_client_id
     AND slug = v_form_slug;
END $$;
