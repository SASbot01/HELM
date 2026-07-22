-- ============================================
-- Seed Pipelines for Portillo y Luco (slug: 'portillo')
-- Pipeline 1: Seguros en Suiza
-- Pipeline 2: Europeos a Suiza
-- ============================================
-- Idempotent: deletes the two named pipelines for this client and re-inserts.
-- Run as a whole in Supabase SQL editor.

DO $$
DECLARE
  portillo_id uuid;
BEGIN
  SELECT id INTO portillo_id FROM clients WHERE slug = 'portillo' LIMIT 1;
  IF portillo_id IS NULL THEN
    RAISE EXCEPTION 'Client with slug=portillo not found. Run insert_portillo.sql first.';
  END IF;

  -- Clear prior versions of these two pipelines so re-running is safe.
  DELETE FROM crm_pipelines
  WHERE client_id = portillo_id
    AND name IN ('Seguros en Suiza', 'Europeos a Suiza');

  -- ─── PIPELINE 1 — SEGUROS EN SUIZA ──────────────────────────────────────
  INSERT INTO crm_pipelines (client_id, name, is_default, stages)
  VALUES (
    portillo_id,
    'Seguros en Suiza',
    false,
    '[
      {"key":"lead_nuevo","label":"Lead nuevo","color":"#6366F1","description":"Fuente: CRM / Instagram / Referido. Campos: nombre, teléfono, fuente, fecha entrada, responsable."},
      {"key":"cualificacion_inicial","label":"Cualificación inicial","color":"#F59E0B","description":"¿Tiene seguro? ¿Tiene casa? ¿Tiene trabajo? Si no tiene casa ni trabajo → Descartar."},
      {"key":"con_seguro","label":"3A · Con seguro","color":"#8B5CF6","description":"¿Lleva ~2 años con ese seguro? Sí → mostrar pólizas de mejora, enviar a Lukas. Campos: proveedor actual, fecha renovación."},
      {"key":"sin_seguro_empadronado","label":"3B · Sin seguro + Empadronado","color":"#3B82F6","description":"Posible checkout directo → agendar llamada. Campo: fecha empadronamiento."},
      {"key":"sin_seguro_no_empadronado","label":"3C · Sin seguro + No empadronado","color":"#10B981","description":"Agendar llamada con link. Campo: situación administrativa."},
      {"key":"solo_casa","label":"3D · Solo casa","color":"#EC4899","description":"Guía → calentamiento 2 días (seguimiento del feed) → agendar llamada. Campos: tipo de vivienda, fecha prevista de llegada."},
      {"key":"llamada_realizada","label":"Llamada realizada","color":"#F97316","description":"Responsable: José Ferrer. Campos: fecha llamada, producto presentado, resultado."},
      {"key":"oferta_enviada","label":"Oferta enviada","color":"#FFB800","description":"Productos: Salud (Helsana/Sanitas/Assura/CSS), RC (Zurich), 3er pilar, seguro de inversión. Campos: producto ofertado, importe, proveedor."},
      {"key":"cerrado","label":"Cerrado / Cliente","color":"#22C55E","description":"Campos: producto contratado, fecha firma, importe, proveedor."},
      {"key":"descartado","label":"Descartado","color":"#71717A","description":"Estado transversal — no tiene casa ni trabajo, o descalificado."},
      {"key":"nurturing","label":"En nurturing","color":"#64748B","description":"Estado transversal — seguimiento activo hasta cierre."},
      {"key":"pausa","label":"En pausa","color":"#A1A1AA","description":"Estado transversal — suspendido temporalmente."},
      {"key":"perdido","label":"Perdido","color":"#EF4444","description":"Estado transversal — oportunidad perdida."}
    ]'::jsonb
  );

  -- ─── PIPELINE 2 — EUROPEOS A SUIZA ──────────────────────────────────────
  INSERT INTO crm_pipelines (client_id, name, is_default, stages)
  VALUES (
    portillo_id,
    'Europeos a Suiza',
    false,
    '[
      {"key":"nuevo_lead","label":"🔥 Nuevo Lead","color":"#EF4444","description":"Lead recién entrado. Pendiente de primer contacto."},
      {"key":"primer_contacto","label":"⏳ Primer Contacto (Máx 72h)","color":"#F59E0B","description":"Ventana de 72h para hacer el primer contacto antes de marcar como ghosting."},
      {"key":"en_conversacion","label":"💬 En Conversación (Interés Real)","color":"#3B82F6","description":"Lead respondió y hay interés real; se está cualificando."},
      {"key":"seguimiento_cierre","label":"🤔 Seguimiento de Cierre (Pensando)","color":"#8B5CF6","description":"Lead cualificado con oferta presentada; pensando la decisión."},
      {"key":"llamada_agendada","label":"📞 Llamada agendada","color":"#FFB800","description":"Llamada de diagnóstico/venta agendada en el calendario."},
      {"key":"ghosting","label":"👻 Ghosting (Sin Respuesta)","color":"#94A3B8","description":"Lead no responde tras varios intentos dentro de la ventana de 72h."},
      {"key":"descartado","label":"❌ Descartado / No Interesado","color":"#71717A","description":"Lead descartado: no le interesa el servicio o no encaja el timing."},
      {"key":"descalificado","label":"🚫 Descalificado (Hard Block)","color":"#DC2626","description":"Descalificación dura: no cumple requisitos mínimos (papeles, edad, país, etc.)."},
      {"key":"cliente","label":"✅ Cliente","color":"#22C55E","description":"Cerrado / pagó. Servicio contratado."},
      {"key":"en_suiza","label":"🇨🇭 En Suiza","color":"#DC2626","description":"Lead ya está físicamente en Suiza — derivar al pipeline de Seguros."},
      {"key":"poco_interes","label":"Poco interés / Descartado","color":"#A1A1AA","description":"Interés tibio; queda en base fría para nurturing futuro."}
    ]'::jsonb
  );

  RAISE NOTICE 'Portillo pipelines seeded for client_id=%', portillo_id;
END $$;

-- ─── CUSTOM FIELDS sugeridos (idempotente via UNIQUE(client_id, field_key)) ─
INSERT INTO crm_custom_fields (client_id, name, field_key, field_type, options, sort_order)
SELECT c.id, f.name, f.field_key, f.field_type, f.options, f.sort_order
FROM clients c,
     (VALUES
       ('Proveedor seguro actual', 'seguro_proveedor', 'select', '["Helsana","Sanitas","Assura","CSS","Otro"]'::jsonb, 1),
       ('Fecha renovación seguro', 'seguro_renovacion', 'date', NULL::jsonb, 2),
       ('Fecha empadronamiento', 'empadronamiento_fecha', 'date', NULL::jsonb, 3),
       ('Situación administrativa', 'situacion_admin', 'select', '["Pendiente","En proceso","Completada"]'::jsonb, 4),
       ('Tipo de vivienda', 'tipo_vivienda', 'select', '["Alquiler","Compra","Compartida","Otro"]'::jsonb, 5),
       ('Fecha prevista de llegada', 'llegada_fecha', 'date', NULL::jsonb, 6),
       ('Producto presentado', 'producto_presentado', 'select', '["Salud obligatorio","Responsabilidad civil","3er pilar","Seguro inversión"]'::jsonb, 7),
       ('Importe oferta (CHF)', 'oferta_importe_chf', 'currency', NULL::jsonb, 8),
       ('País de origen', 'pais_origen', 'text', NULL::jsonb, 9),
       ('Ciudad destino Suiza', 'ciudad_destino', 'text', NULL::jsonb, 10),
       ('Sector profesional', 'sector_profesional', 'text', NULL::jsonb, 11),
       ('Idiomas', 'idiomas', 'text', NULL::jsonb, 12),
       ('Estado en comunidad', 'estado_comunidad', 'select', '["Ya socio","En proceso","Prospecto"]'::jsonb, 13),
       ('Responsable cierre', 'responsable_cierre', 'text', NULL::jsonb, 14)
     ) AS f(name, field_key, field_type, options, sort_order)
WHERE c.slug = 'portillo'
ON CONFLICT (client_id, field_key) DO NOTHING;
