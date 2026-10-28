-- HELM — Diagnóstico operativo de Silvestre IA en el plugin Formularios.
--
-- GENERADO por scripts/gen-form-primermap-silvestre.mjs a partir de
-- src/pages/primermapa/preguntas.js. No lo edites a mano: cambia las preguntas
-- allí y vuelve a lanzar el script.
--
-- El lead magnet de helm.s4sf.net/primermap ya metía el contacto en el CRM de
-- Silvestre, pero las respuestas se quedaban en las notas de la ficha. Con esto
-- salen donde se leen: la pestaña del formulario, pregunta y respuesta una
-- debajo de otra, igual que las de Detrás de Cámara.
--
-- Los datos de contacto (nombre, email, teléfono) no van como campos: viven en
-- la ficha del contacto, que es a donde apunta la respuesta.

do $$
declare
  v_client uuid;
begin
  select id into v_client from clients where lower(slug) = 'silvestre' limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil silvestre. El formulario NO se ha creado.';
    return;
  end if;

  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'primermap',
    'Diagnóstico operativo',
    'Respuestas del lead magnet de helm.s4sf.net/primermap',
    $json$[
 {
  "key": "rol",
  "label": "Negocio · ¿Cuál es tu papel en el negocio?",
  "type": "select",
  "required": false,
  "options": [
   "Fundador o CEO",
   "Socio o director general",
   "Director de área",
   "Otro"
  ]
 },
 {
  "key": "vende",
  "label": "Negocio · ¿Qué vendes principalmente?",
  "type": "select",
  "required": false,
  "options": [
   "Producto físico",
   "Producto digital o formación",
   "Servicios",
   "Suscripción o membresía",
   "Software / SaaS"
  ]
 },
 {
  "key": "mercado",
  "label": "Negocio · ¿A quién le vendes?",
  "type": "select",
  "required": false,
  "options": [
   "A consumidor final (B2C)",
   "A empresas (B2B)",
   "A ambos por igual"
  ]
 },
 {
  "key": "equipo",
  "label": "Negocio · ¿Cuánta gente trabaja contigo?",
  "type": "select",
  "required": false,
  "options": [
   "Solo yo",
   "2 a 5 personas",
   "6 a 15",
   "16 a 50",
   "Más de 50"
  ]
 },
 {
  "key": "tendencia",
  "label": "Negocio · Comparado con hace un año, el negocio está…",
  "type": "select",
  "required": false,
  "options": [
   "Creciendo fuerte",
   "Creciendo despacio",
   "Plano",
   "Cayendo"
  ]
 },
 {
  "key": "factura",
  "label": "Números · ¿Cuánto facturasteis en los últimos 12 meses?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 100.000 €",
   "100.000 – 300.000 €",
   "300.000 – 700.000 €",
   "700.000 € – 2M €",
   "2M – 10M €",
   "Más de 10M €"
  ]
 },
 {
  "key": "ticket",
  "label": "Números · ¿Cuál es tu ticket medio?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 50 €",
   "50 – 200 €",
   "200 – 1.000 €",
   "1.000 – 5.000 €",
   "Más de 5.000 €"
  ]
 },
 {
  "key": "ventas",
  "label": "Números · ¿Cuántas ventas cierras al mes?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 10",
   "10 – 50",
   "50 – 250",
   "250 – 1.000",
   "Más de 1.000"
  ]
 },
 {
  "key": "margen",
  "label": "Números · ¿Cuál es tu margen bruto medio?",
  "type": "select",
  "required": false,
  "options": [
   "Menos del 20 %",
   "20 – 40 %",
   "40 – 60 %",
   "60 – 80 %",
   "Más del 80 %"
  ]
 },
 {
  "key": "costehora",
  "label": "Números · ¿Cuánto te cuesta una hora de trabajo de tu equipo?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 15 €",
   "15 – 25 €",
   "25 – 40 €",
   "40 – 70 €",
   "Más de 70 €"
  ]
 },
 {
  "key": "cac",
  "label": "Números · ¿Sabes ahora mismo cuánto te cuesta captar un cliente?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, lo miro cada semana",
   "Lo tengo aproximado",
   "No lo sé"
  ]
 },
 {
  "key": "ltv",
  "label": "Números · ¿Y cuánto te deja un cliente a lo largo del tiempo?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, lo tengo calculado",
   "Aproximado",
   "No lo sé"
  ]
 },
 {
  "key": "confianza",
  "label": "Números · ¿Cuánto te fías de los datos de tus informes?",
  "type": "scale",
  "required": false
 },
 {
  "key": "canales",
  "label": "Captación · ¿De dónde te llega la gente?",
  "type": "multi",
  "required": false,
  "options": [
   "Meta Ads",
   "Google Ads",
   "TikTok Ads",
   "SEO y contenido",
   "Email",
   "Orgánico en redes",
   "Afiliados o influencers",
   "Referidos y boca a boca",
   "Prospección en frío",
   "Marketplaces o directorios"
  ]
 },
 {
  "key": "adspend",
  "label": "Captación · ¿Cuánto inviertes en publicidad al mes?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 2.000 €",
   "2.000 – 10.000 €",
   "10.000 – 50.000 €",
   "Más de 50.000 €"
  ]
 },
 {
  "key": "leads",
  "label": "Captación · ¿Cuántos contactos nuevos entran al mes?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 20",
   "20 – 100",
   "100 – 500",
   "500 – 2.000",
   "Más de 2.000"
  ]
 },
 {
  "key": "respuesta",
  "label": "Captación · Cuando entra un contacto nuevo, ¿cuánto tardáis en responder?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 5 minutos, automático",
   "Menos de una hora",
   "El mismo día",
   "Uno a tres días",
   "Depende, a veces se nos pasan"
  ]
 },
 {
  "key": "seguimiento",
  "label": "Captación · Si alguien pide información y no compra, ¿cuántas veces le insistís?",
  "type": "select",
  "required": false,
  "options": [
   "Cinco o más, con secuencia definida",
   "Entre dos y cuatro veces",
   "Una vez y ya",
   "Ninguna, si no responde se pierde"
  ]
 },
 {
  "key": "convlead",
  "label": "Captación · De cada 100 contactos, ¿cuántos acaban comprando?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 5",
   "Entre 5 y 15",
   "Entre 15 y 30",
   "Más de 30",
   "No lo medimos"
  ]
 },
 {
  "key": "llamada",
  "label": "Venta · ¿Hay una conversación de venta antes de cobrar?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, siempre hablamos antes",
   "No, se compra solo desde la web",
   "Depende del producto"
  ]
 },
 {
  "key": "noshow",
  "label": "Venta · De las reuniones que agendáis, ¿cuántas se caen?",
  "type": "select",
  "required": false,
  "options": [
   "Menos del 10 %",
   "10 – 25 %",
   "25 – 40 %",
   "Más del 40 %",
   "No lo medimos"
  ]
 },
 {
  "key": "agenda",
  "label": "Venta · ¿Cómo se agenda esa reunión?",
  "type": "select",
  "required": false,
  "options": [
   "Calendario automático con recordatorios",
   "Calendario automático, sin recordatorios",
   "Cuadrando por mensajes, a mano"
  ]
 },
 {
  "key": "propuestas",
  "label": "Venta · ¿Cómo preparáis las propuestas o presupuestos?",
  "type": "select",
  "required": false,
  "options": [
   "Se generan solas desde una plantilla",
   "Plantilla que se rellena a mano",
   "Cada una se escribe desde cero",
   "No hacemos propuesta formal"
  ]
 },
 {
  "key": "firma",
  "label": "Venta · ¿Y la firma del contrato o el alta del cliente?",
  "type": "select",
  "required": false,
  "options": [
   "Firma digital, todo automático",
   "PDF por email, ida y vuelta",
   "No hay contrato formal"
  ]
 },
 {
  "key": "abandono",
  "label": "Venta · ¿Recuperáis a quien se queda a medias en el checkout?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, secuencia automática que revisamos",
   "Hay algo montado pero no lo tocamos",
   "Lo hacemos a mano cuando podemos",
   "No hacemos nada"
  ]
 },
 {
  "key": "upsell",
  "label": "Venta · ¿Ofrecéis algo más en el momento de comprar?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, y los optimizamos",
   "Sí, algo básico",
   "Lo tuvimos y lo quitamos",
   "No"
  ]
 },
 {
  "key": "entrega_serv",
  "label": "Operación · Cuando entra un cliente nuevo, ¿cómo arranca el trabajo?",
  "type": "select",
  "required": false,
  "options": [
   "Onboarding automático: accesos, tareas y bienvenida",
   "Tenemos checklist, pero se ejecuta a mano",
   "Cada uno lo hace a su manera"
  ]
 },
 {
  "key": "reporting_serv",
  "label": "Operación · ¿Cómo informas al cliente de lo que has hecho?",
  "type": "select",
  "required": false,
  "options": [
   "Panel o informe automático",
   "Alguien lo monta a mano cada mes",
   "Solo cuando lo piden",
   "No informamos de forma estructurada"
  ]
 },
 {
  "key": "stock",
  "label": "Operación · ¿Cómo se sincroniza el stock entre canales?",
  "type": "select",
  "required": false,
  "options": [
   "Automático en todos los canales",
   "Se actualiza a mano",
   "Vendemos en un solo canal"
  ]
 },
 {
  "key": "envios",
  "label": "Operación · ¿Cómo se generan las etiquetas y el seguimiento de envío?",
  "type": "select",
  "required": false,
  "options": [
   "Automático, el cliente recibe avisos solo",
   "Semi-manual",
   "Una a una, a mano"
  ]
 },
 {
  "key": "acceso",
  "label": "Operación · ¿Cómo recibe el cliente su acceso o su producto tras pagar?",
  "type": "select",
  "required": false,
  "options": [
   "Automático al instante",
   "Automático, pero se rompe a menudo",
   "Alguien lo da de alta a mano"
  ]
 },
 {
  "key": "impagos",
  "label": "Operación · ¿Qué pasa cuando falla un cobro recurrente?",
  "type": "select",
  "required": false,
  "options": [
   "Reintento y avisos automáticos",
   "Alguien lo persigue a mano",
   "No hay proceso definido"
  ]
 },
 {
  "key": "churn",
  "label": "Operación · ¿Sabes por qué se te van los clientes que se van?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, lo medimos y lo trabajamos",
   "Tenemos una intuición",
   "No lo sabemos"
  ]
 },
 {
  "key": "facturas",
  "label": "Operación · ¿Cómo se emiten las facturas?",
  "type": "select",
  "required": false,
  "options": [
   "Automáticas",
   "Semi-manuales",
   "Todas a mano"
  ]
 },
 {
  "key": "horasadmin",
  "label": "Operación · ¿Cuántas horas al mes se van en administración y tareas de gestión?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 5",
   "5 – 15",
   "15 – 40",
   "40 – 80",
   "Más de 80"
  ]
 },
 {
  "key": "copypaste",
  "label": "Operación · ¿Cuánto copiáis datos de una herramienta a otra a mano?",
  "type": "select",
  "required": false,
  "options": [
   "Casi nunca",
   "Unas pocas veces al día",
   "Constantemente",
   "No tengo ni idea"
  ]
 },
 {
  "key": "crm",
  "label": "Operación · ¿Dónde apuntáis a los clientes y los contactos?",
  "type": "select",
  "required": false,
  "options": [
   "Un CRM de verdad, actualizado",
   "Un CRM, pero está desfasado",
   "Hojas de cálculo",
   "No usamos nada concreto"
  ]
 },
 {
  "key": "donde",
  "label": "Operación · ¿En cuántos sitios distintos vive esa información?",
  "type": "multi",
  "required": false,
  "options": [
   "En el CRM",
   "En hojas de cálculo",
   "En la plataforma de venta",
   "En el email marketing",
   "En chats de WhatsApp",
   "En la cabeza de alguien",
   "En la herramienta de facturación"
  ]
 },
 {
  "key": "automat",
  "label": "Operación · ¿Usáis alguna herramienta para conectar cosas entre sí?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, con varios flujos activos",
   "Sí, un par de cosas sueltas",
   "Lo probamos y lo dejamos",
   "No"
  ]
 },
 {
  "key": "ia",
  "label": "Operación · ¿Usáis IA para algo concreto?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, metida dentro de procesos",
   "Solo ChatGPT suelto para escribir",
   "Lo probamos sin resultado",
   "No"
  ]
 },
 {
  "key": "stackcoste",
  "label": "Operación · ¿Cuánto pagáis al mes en software?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 200 €",
   "200 – 500 €",
   "500 – 1.500 €",
   "1.500 – 5.000 €",
   "Más de 5.000 €"
  ]
 },
 {
  "key": "sinusar",
  "label": "Operación · ¿Hay herramientas que pagáis y casi no usáis?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, seguro",
   "No",
   "Sinceramente, no lo sé"
  ]
 },
 {
  "key": "soporte_vol",
  "label": "Operación · ¿Cuántas consultas de clientes recibís al día?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 10",
   "10 – 30",
   "30 – 100",
   "100 – 300",
   "Más de 300"
  ]
 },
 {
  "key": "soporte_rep",
  "label": "Operación · ¿Qué parte de esas consultas son la misma pregunta de siempre?",
  "type": "select",
  "required": false,
  "options": [
   "Menos del 20 %",
   "20 – 50 %",
   "50 – 80 %",
   "Más del 80 %"
  ]
 },
 {
  "key": "soporte_centro",
  "label": "Operación · ¿Están todos los canales de atención en un solo sitio?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, todo entra en una herramienta",
   "Algunos sí, otros no",
   "Cada canal por su lado"
  ]
 },
 {
  "key": "retencion",
  "label": "Operación · ¿Qué hacéis para que un cliente vuelva?",
  "type": "multi",
  "required": false,
  "options": [
   "Secuencia post-compra automática",
   "Reactivación de clientes dormidos",
   "Petición automática de reseñas",
   "Programa de referidos",
   "Avisos de renovación o recompra",
   "Nada de esto"
  ]
 },
 {
  "key": "fundadorhoras",
  "label": "Equipo · ¿Cuántas horas a la semana dedicas a tareas repetitivas que no requieren tu criterio?",
  "type": "select",
  "required": false,
  "options": [
   "Menos de 2",
   "2 – 5",
   "5 – 10",
   "10 – 20",
   "Más de 20"
  ]
 },
 {
  "key": "busfactor",
  "label": "Equipo · Si mañana desapareciera la persona más clave del equipo, ¿qué pasaría?",
  "type": "select",
  "required": false,
  "options": [
   "Poco, está todo documentado",
   "Un mes malo y lo remontamos",
   "Se pararían cosas importantes",
   "Sería un desastre"
  ]
 },
 {
  "key": "saturado",
  "label": "Equipo · ¿Qué parte del equipo está más ahogada ahora mismo?",
  "type": "select",
  "required": false,
  "options": [
   "Ventas",
   "Marketing",
   "Operaciones o entrega",
   "Atención al cliente",
   "Administración",
   "Yo"
  ]
 },
 {
  "key": "documentacion",
  "label": "Equipo · ¿Qué parte de vuestros procesos está escrita en algún sitio?",
  "type": "select",
  "required": false,
  "options": [
   "Más del 70 %",
   "Entre el 30 y el 70 %",
   "Menos del 30 %",
   "Nada, está todo en las cabezas"
  ]
 },
 {
  "key": "triple",
  "label": "Equipo · ¿Aguantaría tu operativa el triple de clientes sin contratar a nadie?",
  "type": "select",
  "required": false,
  "options": [
   "Sí, sin despeinarnos",
   "Con esfuerzo, sí",
   "No, se rompería",
   "No lo sé"
  ]
 },
 {
  "key": "freno",
  "label": "Equipo · ¿Qué te frena más hoy?",
  "type": "select",
  "required": false,
  "options": [
   "No entra suficiente gente",
   "Entra, pero no convertimos",
   "Convertimos, pero la operativa no da abasto",
   "El equipo está saturado",
   "Estoy metido en todo y no puedo pensar"
  ]
 },
 {
  "key": "objetivo",
  "label": "Equipo · ¿Cuál es tu objetivo para los próximos doce meses?",
  "type": "select",
  "required": false,
  "options": [
   "Duplicar facturación",
   "Crecer sin ampliar equipo",
   "Recuperar mi tiempo",
   "Ordenar el caos antes de crecer"
  ]
 },
 {
  "key": "eliminar",
  "label": "Equipo · Si pudieras borrar una tarea de tu semana para siempre, ¿cuál sería?",
  "type": "long",
  "required": false
 },
 {
  "key": "urgencia",
  "label": "Equipo · ¿Con qué urgencia quieres resolver esto?",
  "type": "select",
  "required": false,
  "options": [
   "Ya, es la prioridad de este mes",
   "Este trimestre",
   "Este año",
   "Estoy explorando"
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

  raise notice '[HELM] Diagnóstico operativo listo (55 preguntas).';
end $$;
