-- HELM — Formulario de valor de Silvestre IA en el plugin Formularios.
--
-- GENERADO por scripts/gen-form-valor-silvestre.mjs a partir de
-- src/pages/silvestreai/preguntas.js. No lo edites a mano: cambia las
-- preguntas allí y vuelve a lanzar el script.
--
-- Un formulario por rama. El visor de respuestas pinta todos los campos del
-- formulario, así que uno solo con la unión de las cinco ramas sacaría cada
-- respuesta con dieciséis contestadas y sesenta y cinco rayas. Además, así el
-- panel enseña de un vistazo cuántos leads llegan de cada tipo de empresa.
--
-- Los datos de contacto (nombre, empresa, email, teléfono, web) no van como
-- campos: viven en la ficha del contacto, que es a donde apunta la respuesta.

do $$
declare
  v_client uuid;
begin
  select id into v_client from clients where lower(slug) = 'silvestre' limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil silvestre. El formulario NO se ha creado.';
    return;
  end if;

  -- ── Consultora financiera ──
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'valor-financiera',
    'Formulario de valor · Consultora financiera',
    'Respuestas de quien elige "Consultora financiera / asesoría fiscal" en helm.s4sf.net/silvestreai/valor',
    $json$[
 {
  "key": "financiera_empleados",
  "label": "¿Cuántos empleados tiene tu empresa?",
  "type": "select",
  "required": true,
  "options": [
   "1-3",
   "4-10",
   "11-20",
   "21-50",
   "Más de 50"
  ]
 },
 {
  "key": "financiera_modalidad",
  "label": "¿Tu servicio es presencial, online o mixto?",
  "type": "select",
  "required": true,
  "options": [
   "Presencial",
   "Online",
   "Mixto"
  ]
 },
 {
  "key": "financiera_servicios",
  "label": "¿Qué servicios ofreces principalmente?",
  "type": "select",
  "required": true,
  "options": [
   "Asesoría fiscal y contable",
   "Planificación financiera",
   "Gestión patrimonial",
   "Auditoría",
   "Consultoría de inversiones",
   "Varios de los anteriores"
  ]
 },
 {
  "key": "financiera_clientes",
  "label": "¿Cuántos clientes activos gestionas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 20",
   "20-50",
   "50-100",
   "100-200",
   "Más de 200"
  ]
 },
 {
  "key": "financiera_captacion",
  "label": "¿Cómo captas clientes ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "Boca a boca",
   "Referidos",
   "Redes sociales",
   "Publicidad online",
   "No tengo un sistema claro",
   "Varias de las anteriores"
  ]
 },
 {
  "key": "financiera_crm",
  "label": "¿Tienes CRM o sistema de gestión de clientes?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, y lo uso bien",
   "Sí, pero apenas lo uso",
   "No tengo"
  ]
 },
 {
  "key": "financiera_herramientas",
  "label": "¿Qué herramientas usas en el día a día?",
  "type": "select",
  "required": true,
  "options": [
   "Excel / Google Sheets",
   "Software de contabilidad (A3, Sage, Holded, CONTASOL)",
   "CRM (Salesforce, HubSpot, Pipedrive)",
   "Herramientas de firma digital",
   "WhatsApp para todo",
   "Varias combinadas"
  ]
 },
 {
  "key": "financiera_repetitivas",
  "label": "¿Tu equipo dedica tiempo a tareas repetitivas?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, mucho",
   "Algo, pero es manejable",
   "No, tenemos todo automatizado"
  ]
 },
 {
  "key": "financiera_automatizar",
  "label": "¿Qué tareas te gustaría automatizar?",
  "type": "select",
  "required": true,
  "options": [
   "Entrada de datos y facturación",
   "Comunicación con clientes (emails, recordatorios)",
   "Generación de informes",
   "Seguimiento de expedientes",
   "Gestión documental",
   "Todo lo anterior"
  ]
 },
 {
  "key": "financiera_perdidos",
  "label": "¿Alguna vez has perdido un cliente por tardanza en responder?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, más de una vez",
   "Probablemente pero no lo sé seguro",
   "No, siempre respondemos rápido"
  ]
 },
 {
  "key": "financiera_nherramientas",
  "label": "¿Cuántas herramientas de pago usas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "1-3",
   "4-6",
   "7-10",
   "Más de 10",
   "No lo sé exactamente"
  ]
 },
 {
  "key": "financiera_gasto",
  "label": "¿Sabes cuánto gastas al mes en software y herramientas?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 100€",
   "100-300€",
   "300-500€",
   "500-1.000€",
   "Más de 1.000€",
   "No lo tengo controlado"
  ]
 },
 {
  "key": "financiera_dolor",
  "label": "¿Cuál es tu mayor dolor ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "No llego a todo con el equipo que tengo",
   "Gasto mucho en herramientas que no uso bien",
   "No tengo visibilidad de cómo va mi negocio en tiempo real",
   "Me cuesta captar clientes nuevos",
   "La comunicación interna es un caos",
   "Varios de estos"
  ]
 },
 {
  "key": "financiera_factura",
  "label": "¿Cuánto facturas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 5.000€",
   "5.000-15.000€",
   "15.000-30.000€",
   "30.000-60.000€",
   "Más de 60.000€"
  ]
 },
 {
  "key": "financiera_inversion",
  "label": "¿Has invertido antes en consultoría tecnológica o automatización?",
  "type": "select",
  "required": true,
  "options": [
   "Nunca",
   "Sí, menos de 1.000€",
   "Sí, entre 1.000-5.000€",
   "Sí, más de 5.000€"
  ]
 },
 {
  "key": "financiera_objetivo",
  "label": "¿Qué esperas conseguir en los próximos 6 meses?",
  "type": "select",
  "required": true,
  "options": [
   "Reducir costes operativos",
   "Captar más clientes",
   "Automatizar procesos para liberar tiempo",
   "Tener un dashboard con datos en tiempo real",
   "Escalar sin contratar más gente",
   "Todo lo anterior"
  ]
 }
]$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  -- ── Despacho legal ──
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'valor-legal',
    'Formulario de valor · Despacho legal',
    'Respuestas de quien elige "Consultora legal / despacho de abogados" en helm.s4sf.net/silvestreai/valor',
    $json$[
 {
  "key": "legal_empleados",
  "label": "¿Cuántos empleados tiene tu despacho?",
  "type": "select",
  "required": true,
  "options": [
   "1-3",
   "4-10",
   "11-20",
   "21-50",
   "Más de 50"
  ]
 },
 {
  "key": "legal_modalidad",
  "label": "¿Tu servicio es presencial, online o mixto?",
  "type": "select",
  "required": true,
  "options": [
   "Presencial",
   "Online",
   "Mixto"
  ]
 },
 {
  "key": "legal_area",
  "label": "¿En qué área del derecho os especializáis?",
  "type": "select",
  "required": true,
  "options": [
   "Derecho mercantil",
   "Derecho laboral",
   "Derecho fiscal",
   "Derecho civil",
   "Derecho penal",
   "Propiedad intelectual",
   "Varias áreas"
  ]
 },
 {
  "key": "legal_expedientes",
  "label": "¿Cuántos expedientes o casos gestionáis al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 10",
   "10-30",
   "30-60",
   "60-100",
   "Más de 100"
  ]
 },
 {
  "key": "legal_captacion",
  "label": "¿Cómo captáis clientes ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "Boca a boca",
   "Referidos de otros despachos",
   "Redes sociales",
   "Publicidad online",
   "Directorios legales",
   "No tenemos un sistema claro"
  ]
 },
 {
  "key": "legal_crm",
  "label": "¿Tenéis CRM o software de gestión de expedientes?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, y lo usamos bien",
   "Sí, pero apenas lo usamos",
   "No tenemos"
  ]
 },
 {
  "key": "legal_herramientas",
  "label": "¿Qué herramientas usáis en el día a día?",
  "type": "select",
  "required": true,
  "options": [
   "Word / Google Docs para todo",
   "Software jurídico (Lefebvre, Aranzadi, Lex-On)",
   "CRM (Salesforce, HubSpot)",
   "Firma digital",
   "WhatsApp para comunicación con clientes",
   "Varias combinadas"
  ]
 },
 {
  "key": "legal_repetitivas",
  "label": "¿Vuestro equipo dedica tiempo a tareas repetitivas?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, mucho (redacción de documentos tipo, búsqueda jurisprudencia)",
   "Algo, pero es manejable",
   "No, tenemos todo optimizado"
  ]
 },
 {
  "key": "legal_automatizar",
  "label": "¿Qué tareas os gustaría automatizar?",
  "type": "select",
  "required": true,
  "options": [
   "Redacción de documentos estándar",
   "Búsqueda de jurisprudencia y legislación",
   "Seguimiento de plazos procesales",
   "Comunicación con clientes (actualizaciones de estado)",
   "Facturación y control de horas",
   "Todo lo anterior"
  ]
 },
 {
  "key": "legal_errores",
  "label": "¿Alguna vez habéis perdido un plazo o cometido un error por falta de sistema?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, alguna vez",
   "Casi, hemos estado al límite",
   "No, lo controlamos bien"
  ]
 },
 {
  "key": "legal_nherramientas",
  "label": "¿Cuántas herramientas de pago usáis al mes?",
  "type": "select",
  "required": true,
  "options": [
   "1-3",
   "4-6",
   "7-10",
   "Más de 10",
   "No lo sabemos exactamente"
  ]
 },
 {
  "key": "legal_gasto",
  "label": "¿Sabéis cuánto gastáis al mes en software?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 200€",
   "200-500€",
   "500-1.000€",
   "Más de 1.000€",
   "No lo tenemos controlado"
  ]
 },
 {
  "key": "legal_dolor",
  "label": "¿Cuál es vuestro mayor dolor ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "Demasiado trabajo administrativo para los abogados",
   "No tenemos visibilidad del estado de los expedientes",
   "Perdemos tiempo buscando documentos e información",
   "Nos cuesta captar clientes nuevos",
   "La facturación no refleja las horas reales trabajadas",
   "Varios de estos"
  ]
 },
 {
  "key": "legal_factura",
  "label": "¿Cuánto factura el despacho al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 5.000€",
   "5.000-15.000€",
   "15.000-30.000€",
   "30.000-60.000€",
   "Más de 60.000€"
  ]
 },
 {
  "key": "legal_inversion",
  "label": "¿Habéis invertido antes en consultoría tecnológica?",
  "type": "select",
  "required": true,
  "options": [
   "Nunca",
   "Sí, menos de 1.000€",
   "Sí, entre 1.000-5.000€",
   "Sí, más de 5.000€"
  ]
 },
 {
  "key": "legal_objetivo",
  "label": "¿Qué queréis conseguir en los próximos 6 meses?",
  "type": "select",
  "required": true,
  "options": [
   "Reducir tiempo en tareas administrativas",
   "Automatizar documentos y comunicaciones",
   "Tener un sistema de gestión de expedientes real",
   "Captar más clientes con presencia online",
   "Escalar sin contratar más personal administrativo",
   "Todo lo anterior"
  ]
 }
]$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  -- ── Infoproducto / online ──
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'valor-online',
    'Formulario de valor · Infoproducto / online',
    'Respuestas de quien elige "Infoproducto / formación / servicio online" en helm.s4sf.net/silvestreai/valor',
    $json$[
 {
  "key": "online_equipo",
  "label": "¿Cuántas personas trabajan en tu proyecto?",
  "type": "select",
  "required": true,
  "options": [
   "Solo yo",
   "2-3",
   "4-10",
   "11-20",
   "Más de 20"
  ]
 },
 {
  "key": "online_producto",
  "label": "¿Qué tipo de producto o servicio vendes?",
  "type": "select",
  "required": true,
  "options": [
   "Curso online grabado",
   "Mentoría / consultoría 1 a 1",
   "Membresía o comunidad de pago",
   "Servicios done-for-you (lo haces tú para el cliente)",
   "Eventos o talleres en vivo",
   "Varios de los anteriores"
  ]
 },
 {
  "key": "online_nicho",
  "label": "¿En qué nicho estás?",
  "type": "select",
  "required": true,
  "options": [
   "Marketing / negocios",
   "Salud / fitness",
   "Desarrollo personal",
   "Finanzas personales",
   "Habilidades técnicas (diseño, programación, video)",
   "Educación académica",
   "Otro"
  ]
 },
 {
  "key": "online_factura",
  "label": "¿Cuánto facturas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Todavía no facturo",
   "Menos de 2.000€",
   "2.000-5.000€",
   "5.000-15.000€",
   "15.000-30.000€",
   "Más de 30.000€"
  ]
 },
 {
  "key": "online_origen",
  "label": "¿De dónde vienen tus clientes ahora?",
  "type": "select",
  "required": true,
  "options": [
   "Instagram orgánico",
   "YouTube",
   "TikTok",
   "Publicidad de pago (Meta Ads, Google Ads)",
   "Email marketing",
   "Boca a boca",
   "No tengo un sistema claro"
  ]
 },
 {
  "key": "online_funnel",
  "label": "¿Tienes funnel de ventas montado?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, y funciona bien",
   "Sí, pero no convierte como quiero",
   "Tengo algo básico",
   "No tengo funnel"
  ]
 },
 {
  "key": "online_email",
  "label": "¿Tienes email marketing?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, con secuencias automatizadas",
   "Sí, pero envío manualmente",
   "No uso email marketing"
  ]
 },
 {
  "key": "online_plataforma",
  "label": "¿Qué plataforma usas para tu producto?",
  "type": "select",
  "required": true,
  "options": [
   "Hotmart",
   "Teachable / Thinkific",
   "Kajabi",
   "Skool",
   "WordPress / web propia",
   "Nada estructurado todavía",
   "Otra"
  ]
 },
 {
  "key": "online_crm",
  "label": "¿Tienes CRM o sistema para gestionar leads?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, y lo uso",
   "Sí, pero no lo aprovecho",
   "No tengo"
  ]
 },
 {
  "key": "online_herramientas",
  "label": "¿Qué herramientas de pago usas?",
  "type": "select",
  "required": true,
  "options": [
   "Plataforma de cursos",
   "Email marketing (Mailchimp, ActiveCampaign, ConvertKit)",
   "Diseño (Canva Pro)",
   "Automatización (Zapier, Make)",
   "Calendario (Calendly, Cal.com)",
   "Pasarela de pago (Stripe, PayPal)",
   "Varias combinadas"
  ]
 },
 {
  "key": "online_gasto",
  "label": "¿Cuánto gastas al mes en herramientas?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 100€",
   "100-300€",
   "300-500€",
   "500-1.000€",
   "Más de 1.000€",
   "No lo tengo controlado"
  ]
 },
 {
  "key": "online_dolor",
  "label": "¿Cuál es tu mayor dolor ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "No consigo suficientes leads",
   "Tengo leads pero no convierten en ventas",
   "Hago todo yo y no doy abasto",
   "No sé qué automatizar ni por dónde empezar",
   "Mi contenido no genera ventas",
   "No tengo sistema, todo es manual",
   "Varios de estos"
  ]
 },
 {
  "key": "online_leads",
  "label": "¿Cuántos leads o contactos nuevos generas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 50",
   "50-200",
   "200-500",
   "500-1.000",
   "Más de 1.000"
  ]
 },
 {
  "key": "online_conversion",
  "label": "¿Cuál es tu tasa de conversión aproximada?",
  "type": "select",
  "required": true,
  "options": [
   "No lo sé",
   "Menos del 1%",
   "1-3%",
   "3-5%",
   "Más del 5%"
  ]
 },
 {
  "key": "online_inversion",
  "label": "¿Has invertido antes en consultoría o mentoría para tu negocio?",
  "type": "select",
  "required": true,
  "options": [
   "Nunca",
   "Sí, menos de 1.000€",
   "Sí, entre 1.000-5.000€",
   "Sí, más de 5.000€"
  ]
 },
 {
  "key": "online_objetivo",
  "label": "¿Qué quieres conseguir en los próximos 6 meses?",
  "type": "select",
  "required": true,
  "options": [
   "Montar un funnel que convierta",
   "Automatizar la captación y el seguimiento de leads",
   "Escalar sin trabajar más horas",
   "Tener un sistema donde todo esté conectado",
   "Lanzar un nuevo producto o servicio",
   "Todo lo anterior"
  ]
 }
]$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  -- ── Infraestructura / IA ──
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'valor-infra',
    'Formulario de valor · Infraestructura / IA',
    'Respuestas de quien elige "Empresa con infraestructura tecnológica y altos costes en IA o servidores" en helm.s4sf.net/silvestreai/valor',
    $json$[
 {
  "key": "infra_empleados",
  "label": "¿Cuántos empleados tiene tu empresa?",
  "type": "select",
  "required": true,
  "options": [
   "1-10",
   "11-50",
   "51-200",
   "Más de 200"
  ]
 },
 {
  "key": "infra_modalidad",
  "label": "¿Tu empresa es presencial, remota o mixta?",
  "type": "select",
  "required": true,
  "options": [
   "Presencial",
   "Remota",
   "Mixta"
  ]
 },
 {
  "key": "infra_sector",
  "label": "¿En qué sector opera tu empresa?",
  "type": "select",
  "required": true,
  "options": [
   "Tecnología / SaaS",
   "Finanzas / banca",
   "Salud",
   "Retail / ecommerce",
   "Logística",
   "Telecomunicaciones",
   "Otro"
  ]
 },
 {
  "key": "infra_ia",
  "label": "¿Qué herramientas de IA usáis actualmente?",
  "type": "select",
  "required": true,
  "options": [
   "ChatGPT / OpenAI API",
   "Google Gemini / Vertex AI",
   "Microsoft Copilot",
   "AWS Bedrock / SageMaker",
   "Modelos open source (Llama, Mistral, Qwen)",
   "No usamos IA todavía",
   "Varias combinadas"
  ]
 },
 {
  "key": "infra_gastoia",
  "label": "¿Cuánto gastáis al mes en APIs de IA o servicios cloud?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 500€",
   "500-2.000€",
   "2.000-5.000€",
   "5.000-15.000€",
   "Más de 15.000€",
   "No lo tenemos controlado"
  ]
 },
 {
  "key": "infra_cloud",
  "label": "¿Dónde corren vuestros servicios ahora?",
  "type": "select",
  "required": true,
  "options": [
   "AWS",
   "Google Cloud",
   "Azure",
   "Servidor propio on-premise",
   "Proveedor europeo (Hetzner, OVH, Scaleway)",
   "Combinación de varios"
  ]
 },
 {
  "key": "infra_gastocloud",
  "label": "¿Cuánto gastáis al mes en infraestructura cloud / servidores?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 500€",
   "500-2.000€",
   "2.000-5.000€",
   "5.000-10.000€",
   "Más de 10.000€"
  ]
 },
 {
  "key": "infra_privacidad",
  "label": "¿Os preocupa la privacidad de los datos con IA en la nube?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, mucho",
   "Algo, pero no es prioridad",
   "No nos preocupa",
   "No lo hemos pensado"
  ]
 },
 {
  "key": "infra_gdpr",
  "label": "¿Cumplís con GDPR en el uso de IA?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, al 100%",
   "Creemos que sí pero no lo hemos auditado",
   "No estamos seguros",
   "No lo hemos revisado"
  ]
 },
 {
  "key": "infra_automatizado",
  "label": "¿Qué procesos tenéis automatizados?",
  "type": "select",
  "required": true,
  "options": [
   "Atención al cliente (chatbots, FAQs)",
   "Generación de informes y análisis",
   "Procesamiento de documentos",
   "Marketing y comunicación",
   "Nada todavía",
   "Varios de los anteriores"
  ]
 },
 {
  "key": "infra_automatizar",
  "label": "¿Qué os gustaría automatizar o mejorar con IA?",
  "type": "select",
  "required": true,
  "options": [
   "Atención al cliente",
   "Análisis de datos internos",
   "Generación de contenido",
   "Procesamiento de documentos",
   "Predicción y toma de decisiones",
   "Reducir costes de infraestructura",
   "Todo lo anterior"
  ]
 },
 {
  "key": "infra_onpremise",
  "label": "¿Habéis considerado migrar a IA local / on-premise?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, lo estamos evaluando",
   "Nos interesa pero no sabemos cómo",
   "No lo hemos considerado",
   "Ya lo hacemos parcialmente"
  ]
 },
 {
  "key": "infra_dolor",
  "label": "¿Cuál es vuestro mayor dolor ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "Gastamos demasiado en APIs y cloud",
   "No sabemos si estamos usando la IA de forma eficiente",
   "Nos preocupa la dependencia de un solo proveedor",
   "No tenemos control sobre nuestros datos",
   "Queremos IA pero no sabemos por dónde empezar",
   "Varios de estos"
  ]
 },
 {
  "key": "infra_factura",
  "label": "¿Cuánto factura tu empresa al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 50.000€",
   "50.000-200.000€",
   "200.000-500.000€",
   "500.000-1M€",
   "Más de 1M€"
  ]
 },
 {
  "key": "infra_inversion",
  "label": "¿Habéis invertido antes en consultoría tecnológica o de IA?",
  "type": "select",
  "required": true,
  "options": [
   "Nunca",
   "Sí, menos de 5.000€",
   "Sí, entre 5.000-20.000€",
   "Sí, más de 20.000€"
  ]
 },
 {
  "key": "infra_objetivo",
  "label": "¿Qué queréis conseguir en los próximos 6 meses?",
  "type": "select",
  "required": true,
  "options": [
   "Reducir costes de IA y cloud un 30%+",
   "Migrar a infraestructura propia",
   "Tener IA local con datos protegidos",
   "Automatizar procesos clave",
   "Escalar sin multiplicar costes",
   "Todo lo anterior"
  ]
 }
]$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  -- ── Otro ──
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'valor-otro',
    'Formulario de valor · Otro',
    'Respuestas de quien elige "Otro tipo de empresa" en helm.s4sf.net/silvestreai/valor',
    $json$[
 {
  "key": "otro_actividad",
  "label": "¿A qué se dedica tu empresa?",
  "type": "long",
  "required": true
 },
 {
  "key": "otro_empleados",
  "label": "¿Cuántos empleados tiene tu empresa?",
  "type": "select",
  "required": true,
  "options": [
   "1-3",
   "4-10",
   "11-20",
   "21-50",
   "Más de 50"
  ]
 },
 {
  "key": "otro_modalidad",
  "label": "¿Tu servicio es presencial, online o mixto?",
  "type": "select",
  "required": true,
  "options": [
   "Presencial",
   "Online",
   "Mixto"
  ]
 },
 {
  "key": "otro_mercado",
  "label": "¿A quién le vendes?",
  "type": "select",
  "required": true,
  "options": [
   "A consumidor final (B2C)",
   "A empresas (B2B)",
   "A ambos por igual"
  ]
 },
 {
  "key": "otro_clientes",
  "label": "¿Cuántos clientes activos gestionas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 20",
   "20-50",
   "50-100",
   "100-200",
   "Más de 200"
  ]
 },
 {
  "key": "otro_captacion",
  "label": "¿Cómo captas clientes ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "Boca a boca",
   "Referidos",
   "Redes sociales",
   "Publicidad online",
   "Comercial o equipo de ventas",
   "No tengo un sistema claro",
   "Varias de las anteriores"
  ]
 },
 {
  "key": "otro_crm",
  "label": "¿Tienes CRM o sistema de gestión de clientes?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, y lo uso bien",
   "Sí, pero apenas lo uso",
   "No tengo"
  ]
 },
 {
  "key": "otro_herramientas",
  "label": "¿Qué herramientas usas en el día a día?",
  "type": "select",
  "required": true,
  "options": [
   "Excel / Google Sheets",
   "Un software específico de mi sector",
   "CRM (Salesforce, HubSpot, Pipedrive)",
   "WhatsApp para todo",
   "Papel y cabeza",
   "Varias combinadas"
  ]
 },
 {
  "key": "otro_repetitivas",
  "label": "¿Tu equipo dedica tiempo a tareas repetitivas?",
  "type": "select",
  "required": true,
  "options": [
   "Sí, mucho",
   "Algo, pero es manejable",
   "No, tenemos todo automatizado"
  ]
 },
 {
  "key": "otro_automatizar",
  "label": "¿Qué tareas te gustaría automatizar?",
  "type": "select",
  "required": true,
  "options": [
   "Entrada de datos y facturación",
   "Comunicación con clientes (emails, recordatorios)",
   "Generación de informes",
   "Seguimiento de clientes, pedidos o proyectos",
   "Gestión documental",
   "Todo lo anterior"
  ]
 },
 {
  "key": "otro_nherramientas",
  "label": "¿Cuántas herramientas de pago usas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "1-3",
   "4-6",
   "7-10",
   "Más de 10",
   "No lo sé exactamente"
  ]
 },
 {
  "key": "otro_gasto",
  "label": "¿Sabes cuánto gastas al mes en software y herramientas?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 100€",
   "100-300€",
   "300-500€",
   "500-1.000€",
   "Más de 1.000€",
   "No lo tengo controlado"
  ]
 },
 {
  "key": "otro_dolor",
  "label": "¿Cuál es tu mayor dolor ahora mismo?",
  "type": "select",
  "required": true,
  "options": [
   "No llego a todo con el equipo que tengo",
   "Gasto mucho en herramientas que no uso bien",
   "No tengo visibilidad de cómo va mi negocio en tiempo real",
   "Me cuesta captar clientes nuevos",
   "La comunicación interna es un caos",
   "Varios de estos"
  ]
 },
 {
  "key": "otro_factura",
  "label": "¿Cuánto facturas al mes?",
  "type": "select",
  "required": true,
  "options": [
   "Menos de 5.000€",
   "5.000-15.000€",
   "15.000-30.000€",
   "30.000-60.000€",
   "Más de 60.000€"
  ]
 },
 {
  "key": "otro_inversion",
  "label": "¿Has invertido antes en consultoría tecnológica o automatización?",
  "type": "select",
  "required": true,
  "options": [
   "Nunca",
   "Sí, menos de 1.000€",
   "Sí, entre 1.000-5.000€",
   "Sí, más de 5.000€"
  ]
 },
 {
  "key": "otro_objetivo",
  "label": "¿Qué esperas conseguir en los próximos 6 meses?",
  "type": "select",
  "required": true,
  "options": [
   "Reducir costes operativos",
   "Captar más clientes",
   "Automatizar procesos para liberar tiempo",
   "Tener un dashboard con datos en tiempo real",
   "Escalar sin contratar más gente",
   "Todo lo anterior"
  ]
 }
]$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  raise notice '[HELM] Formulario de valor de Silvestre IA listo (5 ramas).';
end $$;
