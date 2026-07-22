-- ─────────────────────────────────────────────────────────────────────────────
-- Pipeline "Seguros Suiza" + custom fields para Asesoría Suiza (slug='asesorias-suiza')
-- Basado en la estructura real de Drive "clientes seguros-lukass":
--   root/
--   ├── Assura/       (aseguradora principal — clientes directos)
--   ├── Visana/
--   ├── Swica/
--   ├── Helsana/
--   │   └── Insurix Groupe/   (broker intermediario)
--   ├── Sanitas/
--   │   ├── Insurix/          (broker)
--   │   └── Callenium/        (broker)
--   └── <cliente>/            carpeta con PDFs de póliza
--                              sufijos en nombre: (Rechazado), (solo basico)
--
-- Decisiones de diseño:
-- - Aseguradora NO es stage — es campo custom (cliente puede cambiar de caja).
-- - Broker tampoco — campo custom opcional.
-- - Stages: modelo de Portillo validado + añadido "renovación anual".
-- - Pipeline NO es default (coexiste con los de Trabajo en asesorias-suiza).
-- - Algunos field_keys llevan sufijo `_crm` para evitar colisión con campos
--   existentes de la migration "trabajo_suiza" (pais_origen, idiomas, etc.).
-- Idempotente: DELETE del pipeline + ON CONFLICT en fields.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id FROM clients WHERE slug = 'asesorias-suiza' LIMIT 1;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Client with slug=asesorias-suiza not found.';
  END IF;

  -- Idempotente: quito el pipeline si ya existía
  DELETE FROM crm_pipelines WHERE client_id = target_id AND name = 'Seguros Suiza';

  INSERT INTO crm_pipelines (client_id, name, is_default, stages) VALUES (
    target_id,
    'Seguros Suiza',
    false,
    '[
      {"key":"lead_nuevo","label":"Lead nuevo","color":"#6366F1","description":"Fuente: CRM / Instagram / Referido / Broker. Campos: nombre, teléfono, fuente, fecha entrada, responsable."},
      {"key":"cualificacion_inicial","label":"Cualificación inicial","color":"#F59E0B","description":"¿Tiene seguro actual? ¿Empadronado? ¿Trabajo? Si no cumple mínimos → Descartar."},
      {"key":"con_seguro","label":"3A · Con seguro","color":"#8B5CF6","description":"¿Lleva +2 años con el proveedor actual? Ventana de cambio de caja (noviembre). Campos: proveedor actual, fecha renovación, nivel cobertura."},
      {"key":"sin_seguro_empadronado","label":"3B · Sin seguro + empadronado","color":"#3B82F6","description":"Posible checkout directo LAMal — obligación legal 3 meses desde empadronamiento. Campo: fecha empadronamiento."},
      {"key":"sin_seguro_no_empadronado","label":"3C · Sin seguro + no empadronado","color":"#10B981","description":"Agendar llamada para definir arrival + empadronamiento. Campo: situación administrativa."},
      {"key":"solo_casa","label":"3D · Solo casa confirmada","color":"#EC4899","description":"Ya tiene vivienda en Suiza pero sin contrato laboral ni póliza. Nurturing 2 días + llamada."},
      {"key":"llamada_realizada","label":"Llamada realizada","color":"#F97316","description":"Campos: fecha llamada, producto presentado, resultado, objeciones detectadas."},
      {"key":"oferta_enviada","label":"Oferta enviada","color":"#FFB800","description":"Productos: Salud (Helsana/Sanitas/Assura/CSS/Visana/Swica), RC, 3er pilar (3a/3b), vida. Campos: aseguradora ofertada, prima mensual CHF, franquicia, nivel."},
      {"key":"cerrado","label":"Cerrado · Cliente","color":"#22C55E","description":"Póliza firmada. Campos: aseguradora final, número póliza, prima, franquicia, fecha inicio cobertura, broker, comisión."},
      {"key":"renovacion","label":"En renovación anual","color":"#14B8A6","description":"Próxima ventana de renovación (típicamente Oct–Nov). Contactar 60d antes."},
      {"key":"descartado","label":"Descartado","color":"#71717A","description":"Transversal — no cumple mínimos (edad, papeles, situación)."},
      {"key":"nurturing","label":"En nurturing","color":"#64748B","description":"Transversal — seguimiento activo hasta cierre."},
      {"key":"pausa","label":"En pausa","color":"#A1A1AA","description":"Transversal — suspendido temporalmente (viaje, indecisión, etc.)."},
      {"key":"perdido","label":"Perdido","color":"#EF4444","description":"Transversal — oportunidad cerrada negativamente."}
    ]'::jsonb
  );

  -- Custom fields — batch INSERT directo dentro del DO (antes con VALUES AS f()
  -- fallaba silenciosamente por coerción de NULL::jsonb).
  INSERT INTO crm_custom_fields (client_id, name, field_key, field_type, options, position, required) VALUES
    -- Aseguradora + broker + nivel
    (target_id, 'Aseguradora actual', 'aseguradora', 'select',
      '["Assura","Visana","Swica","Helsana","Sanitas","CSS","Concordia","KPT","Groupe Mutuel","Otra","Ninguna"]'::jsonb, 1, false),
    (target_id, 'Broker / Intermediario', 'broker', 'select',
      '["Ninguno (directo)","Callenium","Insurix","Insurix Groupe","Otro"]'::jsonb, 2, false),
    (target_id, 'Nivel de cobertura', 'nivel_cobertura', 'select',
      '["Solo básico (LAMal)","Básico + complementaria","Completo","Premium"]'::jsonb, 3, false),
    -- Datos póliza
    (target_id, 'Número de póliza', 'numero_poliza', 'text', '[]'::jsonb, 10, false),
    (target_id, 'Prima mensual (CHF)', 'prima_mensual_chf', 'currency', '[]'::jsonb, 11, false),
    (target_id, 'Franquicia (CHF)', 'franquicia_chf', 'select',
      '["300","500","1000","1500","2000","2500"]'::jsonb, 12, false),
    (target_id, 'Fecha inicio cobertura', 'fecha_inicio_cobertura', 'date', '[]'::jsonb, 13, false),
    (target_id, 'Fecha renovación anual', 'fecha_renovacion', 'date', '[]'::jsonb, 14, false),
    (target_id, 'Producto contratado', 'producto_contratado', 'multiselect',
      '["LAMal (básico obligatorio)","Complementaria hospitalización","Complementaria dental","RC privada","3er pilar 3a","3er pilar 3b","Seguro vida","Seguro invalidez","Seguro hogar"]'::jsonb, 15, false),
    -- Personal / administrativo
    (target_id, 'DNI / Pasaporte', 'dni_pasaporte', 'text', '[]'::jsonb, 20, false),
    (target_id, 'Fecha de nacimiento', 'fecha_nacimiento', 'date', '[]'::jsonb, 21, false),
    (target_id, 'Estado civil', 'estado_civil', 'select',
      '["Soltero/a","Casado/a","Pareja de hecho","Divorciado/a","Viudo/a"]'::jsonb, 22, false),
    (target_id, 'Personas a cargo', 'personas_a_cargo', 'number', '[]'::jsonb, 23, false),
    (target_id, 'Cantón de residencia', 'canton_residencia', 'select',
      '["ZH Zürich","BE Berna","LU Lucerna","UR Uri","SZ Schwyz","OW Obwalden","NW Nidwalden","GL Glaris","ZG Zug","FR Friburgo","SO Solothurn","BS Basilea-Ciudad","BL Basilea-Campo","SH Schaffhausen","AR Appenzell Exterior","AI Appenzell Interior","SG St. Gallen","GR Grisones","AG Argovia","TG Turgovia","TI Ticino","VD Vaud","VS Valais","NE Neuchâtel","GE Ginebra","JU Jura"]'::jsonb, 24, false),
    (target_id, 'Ciudad / Comuna', 'ciudad_comuna', 'text', '[]'::jsonb, 25, false),
    (target_id, 'Fecha empadronamiento CRM', 'fecha_empadronamiento', 'date', '[]'::jsonb, 26, false),
    (target_id, 'País de origen CRM', 'pais_origen_crm', 'text', '[]'::jsonb, 27, false),
    -- Profesional
    (target_id, 'Empresa / Empleador', 'empresa_empleador', 'text', '[]'::jsonb, 30, false),
    (target_id, 'Sector profesional CRM', 'sector_profesional_crm', 'text', '[]'::jsonb, 31, false),
    (target_id, 'Ingresos anuales (CHF)', 'ingresos_anuales_chf', 'currency', '[]'::jsonb, 32, false),
    (target_id, 'Idiomas CRM', 'idiomas_crm', 'text', '[]'::jsonb, 33, false),
    -- Comercial
    (target_id, 'Proveedor anterior', 'proveedor_anterior', 'text', '[]'::jsonb, 41, false),
    (target_id, 'Motivo cambio', 'motivo_cambio', 'textarea', '[]'::jsonb, 42, false),
    (target_id, 'Drive folder URL', 'drive_folder_url', 'url', '[]'::jsonb, 43, false),
    (target_id, 'Carpeta origen (Drive)', 'drive_origen_folder', 'text', '[]'::jsonb, 44, false)
  ON CONFLICT (client_id, field_key) DO NOTHING;

  RAISE NOTICE 'Pipeline "Seguros Suiza" + 25 custom fields seeded for asesorias-suiza (id=%)', target_id;
END $$;
