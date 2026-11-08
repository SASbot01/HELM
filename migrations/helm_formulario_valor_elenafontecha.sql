-- HELM — Autodiagnóstico de la landing VSL de Elena Fontecha (/elenafontecha/valor).
--
-- GENERADO por scripts/gen-form-valor-elena.mjs a partir de
-- src/pages/elena/diagnostico.js. No lo edites a mano: cambia las preguntas
-- allí y vuelve a lanzar el script.
--
-- Dos formularios, uno por rama de la puerta («Para mí» / «Para mi equipo o
-- mi empresa»), cada uno a su embudo. La página manda {slug:'elenafontecha',
-- form:'valor' | 'valor-empresa', ...} a /api/formularios, que descarta toda
-- clave que el formulario no declare. Los datos de contacto (nombre, correo,
-- teléfono, empresa) no van como campos: viven en la ficha del contacto.
--
-- El despliegue del minipc reconstruye el frontend pero no corre migraciones:
-- estos formularios se aplicaron también en vivo con supabase.js.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
begin
  select id into v_client from clients
   where id = '1b17a1dc-e34a-4aaf-b55e-892e970550bc' or lower(slug) = 'elenafontecha' limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Elena Fontecha. Los formularios NO se han creado.';
    return;
  end if;

  -- ── Autodiagnóstico · Para ti (valor) → «Captación (leads)» / lead ──
  select id into v_pipeline from crm_pipelines
   where client_id = v_client and name = 'Captación (leads)' limit 1;
  if v_pipeline is null then
    raise notice '[HELM] Elena no tiene el embudo Captación (leads): valor queda sin embudo.';
  end if;
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client, 'valor', 'Autodiagnóstico · Para ti',
    'Landing VSL de Elena (/elenafontecha/valor), rama «Para mí». Preguntas que se adaptan al rol y a lo que quiere revisar; al enviar se calcula el perfil (Rodri, Laura o alta dirección) y la estación de entrada del recorrido. Entra en «Captación (leads)», etapa «Lead (autodiagnóstico)».',
    $json$[
  {
    "key": "tipo",
    "label": "Antes de empezar: ¿para quién buscas acompañamiento?",
    "type": "select",
    "required": true,
    "options": [
      "Para mí",
      "Para mi equipo o mi empresa"
    ]
  },
  {
    "key": "rol",
    "label": "¿Cuál es tu situación profesional hoy?",
    "type": "select",
    "required": true,
    "options": [
      "CEO, director/a general o consejero/a",
      "Miembro de un comité de dirección",
      "Dirijo un área o un equipo",
      "Acabo de asumir más responsabilidad",
      "Tengo un negocio o un proyecto propio",
      "Trabajo sin equipo a cargo",
      "Estoy entre etapas (salida, cambio o pausa)"
    ]
  },
  {
    "key": "equipo",
    "label": "¿Cuántas personas dependen de ti?",
    "type": "select",
    "required": false,
    "options": [
      "Ninguna, por ahora",
      "De 1 a 5",
      "De 6 a 20",
      "De 21 a 100",
      "Más de 100"
    ]
  },
  {
    "key": "revisar",
    "label": "¿Qué quieres revisar ahora?",
    "type": "select",
    "required": true,
    "options": [
      "Mi vida y mi rumbo",
      "Mi manera de dirigir y de liderar",
      "Las dos cosas, a la vez"
    ]
  },
  {
    "key": "momento",
    "label": "¿En qué punto te reconoces?",
    "type": "select",
    "required": true,
    "options": [
      "Quiero mirar con verdad dónde estoy",
      "No tengo claro qué quiero, ni para qué",
      "Me pesa mi lugar en mis relaciones (equipo, socios, familia)",
      "Sé lo que quiero, pero no cómo darle un lugar real",
      "Tengo una decisión delante y necesito tomarla",
      "Quiero revisar decisiones que ya tomé y ver si siguen teniendo sentido"
    ]
  },
  {
    "key": "retos_liderazgo",
    "label": "Lo que más le cuesta al dirigir",
    "type": "multi",
    "required": false,
    "options": [
      "Delegar decisiones, no solo tareas",
      "Las conversaciones difíciles y el feedback",
      "Decir que no y negociar plazos",
      "Que todo pase por mí",
      "Moverme con pares, superiores o el consejo",
      "Sostener resultados sin que lo pague mi salud o el equipo"
    ]
  },
  {
    "key": "peso_vida",
    "label": "Lo que más pesa en su vida",
    "type": "multi",
    "required": false,
    "options": [
      "No me da la vida: el tiempo y la energía",
      "Lo mío siempre queda para después",
      "He perdido la ilusión por lo que hago",
      "Mis relaciones (pareja, familia, amistades)",
      "Una etapa que se acaba y otra que no sé empezar",
      "Una decisión importante que tengo delante"
    ]
  },
  {
    "key": "dimension",
    "label": "¿Qué parte sientes más desatendida?",
    "type": "select",
    "required": true,
    "options": [
      "Lo físico (energía, cuerpo, descanso)",
      "Lo mental (claridad, foco, criterio)",
      "Lo emocional (cómo vivo lo que me pasa)",
      "Lo espiritual (sentido, valores, lo que importa)"
    ]
  },
  {
    "key": "energia",
    "label": "¿Cómo ha estado tu energía en los últimos meses?",
    "type": "select",
    "required": true,
    "options": [
      "Bien; quiero afinar",
      "Con altibajos",
      "Al límite, sosteniendo",
      "He tenido que parar en algún momento"
    ]
  },
  {
    "key": "inicio",
    "label": "¿Cuándo te gustaría empezar?",
    "type": "select",
    "required": true,
    "options": [
      "Ahora mismo",
      "En las próximas semanas",
      "En unos meses",
      "Solo estoy explorando"
    ]
  },
  {
    "key": "financia",
    "label": "Si decides hacerlo, ¿quién lo financiaría?",
    "type": "select",
    "required": false,
    "options": [
      "Yo",
      "Mi empresa",
      "Una parte cada uno",
      "Aún no lo sé"
    ]
  },
  {
    "key": "motivo",
    "label": "En una frase, ¿qué te ha traído hoy aquí?",
    "type": "textarea",
    "required": false
  },
  {
    "key": "perfil",
    "label": "Perfil (calculado)",
    "type": "text",
    "required": false
  },
  {
    "key": "punto_entrada",
    "label": "Estación de entrada (calculada)",
    "type": "text",
    "required": false
  }
]$json$::jsonb,
    true, v_pipeline, 'lead', null
  )
  on conflict (client_id, slug) do update
     set title = excluded.title, description = excluded.description, fields = excluded.fields,
         active = true, pipeline_id = excluded.pipeline_id, stage_key = excluded.stage_key,
         booked_stage_key = excluded.booked_stage_key, updated_at = now();

  -- ── Autodiagnóstico · Empresa (valor-empresa) → «Empresas y equipos» / contacto ──
  select id into v_pipeline from crm_pipelines
   where client_id = v_client and name = 'Empresas y equipos' limit 1;
  if v_pipeline is null then
    raise notice '[HELM] Elena no tiene el embudo Empresas y equipos: valor-empresa queda sin embudo.';
  end if;
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client, 'valor-empresa', 'Autodiagnóstico · Empresa',
    'Landing VSL de Elena (/elenafontecha/valor), rama «Para mi equipo o mi empresa»: sector, tamaño, momento, a quién va, necesidades, formato, plazo, presupuesto y quién decide. Al enviar se calcula el perfil de empresa y por dónde empezar. Entra en «Empresas y equipos», etapa «Contacto». El nombre de la empresa va a la ficha del contacto.',
    $json$[
  {
    "key": "tipo",
    "label": "Antes de empezar: ¿para quién buscas acompañamiento?",
    "type": "select",
    "required": true,
    "options": [
      "Para mí",
      "Para mi equipo o mi empresa"
    ]
  },
  {
    "key": "cargo",
    "label": "¿Cuál es tu papel en la empresa?",
    "type": "select",
    "required": true,
    "options": [
      "CEO o director/a general",
      "Dirección de Personas o RR. HH.",
      "Dirección de un área",
      "Propiedad, socio/a o consejero/a",
      "Otro"
    ]
  },
  {
    "key": "sector",
    "label": "¿En qué sector trabajáis?",
    "type": "select",
    "required": true,
    "options": [
      "Turismo, ocio y hostelería",
      "Inmobiliario y construcción",
      "Servicios profesionales (legal, consultoría, finanzas)",
      "Industria y distribución",
      "Tecnología",
      "Salud y bienestar",
      "Educación",
      "Sector público o tercer sector",
      "Otro"
    ]
  },
  {
    "key": "tamano",
    "label": "¿Cuántas personas sois en la empresa?",
    "type": "select",
    "required": true,
    "options": [
      "Menos de 10",
      "De 10 a 50",
      "De 51 a 250",
      "De 251 a 1.000",
      "Más de 1.000"
    ]
  },
  {
    "key": "tipo_empresa",
    "label": "¿Cómo describirías la empresa?",
    "type": "select",
    "required": true,
    "options": [
      "Empresa familiar",
      "Startup o scale-up",
      "Pyme consolidada",
      "Grupo o multinacional",
      "Institución u organización sin ánimo de lucro"
    ]
  },
  {
    "key": "momento_empresa",
    "label": "¿En qué momento está la empresa?",
    "type": "select",
    "required": true,
    "options": [
      "Creciendo más rápido que su organización",
      "Relevo generacional o sucesión",
      "Fusión, venta o reestructuración",
      "Cambio en el equipo de dirección",
      "Estable: queremos profesionalizar el liderazgo"
    ]
  },
  {
    "key": "a_quien",
    "label": "¿A quién iría dirigido?",
    "type": "multi",
    "required": true,
    "options": [
      "Al comité de dirección",
      "A mandos intermedios",
      "A personas que estrenan responsabilidad",
      "A una persona concreta (CEO, directivo/a)",
      "A un equipo concreto"
    ]
  },
  {
    "key": "participantes",
    "label": "¿Cuántas personas participarían?",
    "type": "select",
    "required": false,
    "options": [
      "De 2 a 5",
      "De 6 a 15",
      "De 16 a 40",
      "Más de 40"
    ]
  },
  {
    "key": "necesidades",
    "label": "Qué necesitan trabajar",
    "type": "multi",
    "required": true,
    "options": [
      "Delegar y dar autonomía",
      "Conversaciones difíciles y feedback",
      "Cohesión del equipo directivo",
      "Decidir juntos y con claridad de roles",
      "Gestionar la presión sin quemarse",
      "Liderar un cambio",
      "Conocer su estilo de liderazgo (evaluación LCP)",
      "Relación con el consejo y gobierno corporativo"
    ]
  },
  {
    "key": "sintoma",
    "label": "¿Qué está pasando ahora que os hace buscar esto?",
    "type": "multi",
    "required": true,
    "options": [
      "Desgaste o rotación de personas clave",
      "Decisiones que se atascan o se repiten",
      "Tensiones en el equipo directivo",
      "Todo depende de pocas personas",
      "Una nueva etapa que exige otra forma de dirigir",
      "Nada urgente: queremos prevenir"
    ]
  },
  {
    "key": "formato",
    "label": "¿Qué formato os encaja más?",
    "type": "select",
    "required": true,
    "options": [
      "Evaluación de liderazgo (LCP) con sesiones de devolución",
      "Programa para el equipo directivo",
      "Mentoría a una persona clave",
      "Un taller o una jornada",
      "Aún no lo sabemos; queremos orientación"
    ]
  },
  {
    "key": "plazo",
    "label": "¿Para cuándo lo necesitáis?",
    "type": "select",
    "required": true,
    "options": [
      "Este trimestre",
      "El próximo trimestre",
      "Este año",
      "Sin fecha todavía"
    ]
  },
  {
    "key": "presupuesto",
    "label": "¿Hay presupuesto para esto?",
    "type": "select",
    "required": true,
    "options": [
      "Sí, aprobado",
      "Se está definiendo",
      "Todavía no"
    ]
  },
  {
    "key": "decide",
    "label": "¿Quién toma la decisión?",
    "type": "select",
    "required": true,
    "options": [
      "Yo",
      "Yo, junto con dirección",
      "Personas o RR. HH.",
      "El consejo o la propiedad"
    ]
  },
  {
    "key": "tambien_yo",
    "label": "Y tú, ¿te gustaría trabajar también lo tuyo?",
    "type": "select",
    "required": true,
    "options": [
      "Sí, también lo mío",
      "Por ahora, solo el equipo"
    ]
  },
  {
    "key": "motivo",
    "label": "Si quieres, cuéntanos la situación en una frase.",
    "type": "textarea",
    "required": false
  },
  {
    "key": "perfil",
    "label": "Perfil (calculado)",
    "type": "text",
    "required": false
  },
  {
    "key": "recomendacion",
    "label": "Por dónde empezar (calculado)",
    "type": "text",
    "required": false
  }
]$json$::jsonb,
    true, v_pipeline, 'contacto', null
  )
  on conflict (client_id, slug) do update
     set title = excluded.title, description = excluded.description, fields = excluded.fields,
         active = true, pipeline_id = excluded.pipeline_id, stage_key = excluded.stage_key,
         booked_stage_key = excluded.booked_stage_key, updated_at = now();

  raise notice '[HELM] Autodiagnóstico de Elena Fontecha listo (valor + valor-empresa).';
end $$;
