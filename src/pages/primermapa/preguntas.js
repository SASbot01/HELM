// Diagnóstico operativo — el cuestionario.
//
// Declarativo a propósito: la vista lo recorre sin saber nada del contenido, y
// tocar una pregunta es editar este fichero y nada más.
//
//   type   single (por defecto) · multi · scale · text
//   show   función que decide si la pregunta aparece. Es la ramificación: a
//          quien vende servicios no se le pregunta por stock.
//   d      dimensión del índice que puntúa esa respuesta
//   s      puntuación 0–3 de la opción dentro de esa dimensión
//   v      valor numérico que usa el cálculo de fugas

export const SECTIONS = ['Negocio', 'Números', 'Captación', 'Venta', 'Operación', 'Equipo']

export const Q = [
  /* ---- 0 · NEGOCIO ---- */
  { id: 'rol', sec: 0, q: '¿Cuál es tu papel en el negocio?', options: [
    { label: 'Fundador o CEO', value: 'fundador' }, { label: 'Socio o director general', value: 'socio' },
    { label: 'Director de área', value: 'director' }, { label: 'Otro', value: 'otro' }] },

  { id: 'vende', sec: 0, q: '¿Qué vendes principalmente?', help: 'Esto define el resto del cuestionario. Elige lo que más factura.', options: [
    { label: 'Producto físico', value: 'fisico' }, { label: 'Producto digital o formación', value: 'digital' },
    { label: 'Servicios', value: 'servicio' }, { label: 'Suscripción o membresía', value: 'suscripcion' },
    { label: 'Software / SaaS', value: 'software' }] },

  { id: 'mercado', sec: 0, q: '¿A quién le vendes?', options: [
    { label: 'A consumidor final (B2C)', value: 'b2c' }, { label: 'A empresas (B2B)', value: 'b2b' },
    { label: 'A ambos por igual', value: 'mixto' }] },

  { id: 'equipo', sec: 0, q: '¿Cuánta gente trabaja contigo?', help: 'Cuenta freelance y agencias.', options: [
    { label: 'Solo yo', value: 'solo', v: 1 }, { label: '2 a 5 personas', value: '2-5', v: 3.5 },
    { label: '6 a 15', value: '6-15', v: 10 }, { label: '16 a 50', value: '16-50', v: 30 },
    { label: 'Más de 50', value: '50+', v: 70 }] },

  { id: 'tendencia', sec: 0, q: 'Comparado con hace un año, el negocio está…', options: [
    { label: 'Creciendo fuerte', value: 'fuerte', s: 3, d: 'capacidad' }, { label: 'Creciendo despacio', value: 'despacio', s: 2, d: 'capacidad' },
    { label: 'Plano', value: 'plano', s: 1, d: 'capacidad' }, { label: 'Cayendo', value: 'cae', s: 0, d: 'capacidad' }] },

  /* ---- 1 · NÚMEROS ---- */
  { id: 'factura', sec: 1, q: '¿Cuánto facturasteis en los últimos 12 meses?', help: 'Aproximado. Nadie va a auditarte.', options: [
    { label: 'Menos de 100.000 €', value: 'a', v: 60000 }, { label: '100.000 – 300.000 €', value: 'b', v: 200000 },
    { label: '300.000 – 700.000 €', value: 'c', v: 500000 }, { label: '700.000 € – 2M €', value: 'd', v: 1300000 },
    { label: '2M – 10M €', value: 'e', v: 5000000 }, { label: 'Más de 10M €', value: 'f', v: 15000000 }] },

  { id: 'ticket', sec: 1, q: '¿Cuál es tu ticket medio?', help: 'Lo que deja una venta típica.', options: [
    { label: 'Menos de 50 €', value: 'a', v: 30 }, { label: '50 – 200 €', value: 'b', v: 110 },
    { label: '200 – 1.000 €', value: 'c', v: 520 }, { label: '1.000 – 5.000 €', value: 'd', v: 2400 },
    { label: 'Más de 5.000 €', value: 'e', v: 9000 }] },

  { id: 'ventas', sec: 1, q: (A) => (A.vende === 'servicio' ? '¿Cuántos clientes nuevos cierras al mes?' : '¿Cuántas ventas cierras al mes?'), options: [
    { label: 'Menos de 10', value: 'a', v: 5 }, { label: '10 – 50', value: 'b', v: 28 },
    { label: '50 – 250', value: 'c', v: 140 }, { label: '250 – 1.000', value: 'd', v: 580 },
    { label: 'Más de 1.000', value: 'e', v: 2200 }] },

  { id: 'margen', sec: 1, q: '¿Cuál es tu margen bruto medio?', help: 'Lo que queda después del coste directo de entregar.', options: [
    { label: 'Menos del 20 %', value: 'a', v: 0.15 }, { label: '20 – 40 %', value: 'b', v: 0.3 },
    { label: '40 – 60 %', value: 'c', v: 0.5 }, { label: '60 – 80 %', value: 'd', v: 0.7 },
    { label: 'Más del 80 %', value: 'e', v: 0.85 }] },

  { id: 'costehora', sec: 1, q: '¿Cuánto te cuesta una hora de trabajo de tu equipo?',
    help: 'Salario bruto más cargas, dividido entre horas. Si trabajas solo, valora tu propia hora.', options: [
      { label: 'Menos de 15 €', value: 'a', v: 12 }, { label: '15 – 25 €', value: 'b', v: 20 },
      { label: '25 – 40 €', value: 'c', v: 32 }, { label: '40 – 70 €', value: 'd', v: 55 },
      { label: 'Más de 70 €', value: 'e', v: 90 }] },

  { id: 'cac', sec: 1, q: '¿Sabes ahora mismo cuánto te cuesta captar un cliente?', options: [
    { label: 'Sí, lo miro cada semana', value: 'si', s: 3, d: 'datos' },
    { label: 'Lo tengo aproximado', value: 'aprox', s: 1, d: 'datos' },
    { label: 'No lo sé', value: 'no', s: 0, d: 'datos' }] },

  { id: 'ltv', sec: 1, q: '¿Y cuánto te deja un cliente a lo largo del tiempo?', options: [
    { label: 'Sí, lo tengo calculado', value: 'si', s: 3, d: 'datos' },
    { label: 'Aproximado', value: 'aprox', s: 1, d: 'datos' },
    { label: 'No lo sé', value: 'no', s: 0, d: 'datos' }] },

  { id: 'confianza', sec: 1, type: 'scale', q: '¿Cuánto te fías de los datos de tus informes?',
    ends: ['No me fío nada', 'Son mi fuente de verdad'], d: 'datos' },

  /* ---- 2 · CAPTACIÓN ---- */
  { id: 'canales', sec: 2, type: 'multi', q: '¿De dónde te llega la gente?', help: 'Marca todo lo que uses de verdad.', options: [
    { label: 'Meta Ads', value: 'meta' }, { label: 'Google Ads', value: 'google' }, { label: 'TikTok Ads', value: 'tiktok' },
    { label: 'SEO y contenido', value: 'seo' }, { label: 'Email', value: 'email' }, { label: 'Orgánico en redes', value: 'organico' },
    { label: 'Afiliados o influencers', value: 'afiliados' }, { label: 'Referidos y boca a boca', value: 'referidos' },
    { label: 'Prospección en frío', value: 'outbound' }, { label: 'Marketplaces o directorios', value: 'market' }] },

  { id: 'adspend', sec: 2, q: '¿Cuánto inviertes en publicidad al mes?',
    show: (A) => ['meta', 'google', 'tiktok'].some(c => (A.canales || []).includes(c)), options: [
      { label: 'Menos de 2.000 €', value: 'a', v: 1000 }, { label: '2.000 – 10.000 €', value: 'b', v: 5500 },
      { label: '10.000 – 50.000 €', value: 'c', v: 28000 }, { label: 'Más de 50.000 €', value: 'd', v: 80000 }] },

  { id: 'leads', sec: 2, q: '¿Cuántos contactos nuevos entran al mes?', help: 'Formularios, mensajes, solicitudes de información. Todo junto.', options: [
    { label: 'Menos de 20', value: 'a', v: 10 }, { label: '20 – 100', value: 'b', v: 55 },
    { label: '100 – 500', value: 'c', v: 280 }, { label: '500 – 2.000', value: 'd', v: 1100 },
    { label: 'Más de 2.000', value: 'e', v: 3500 }] },

  { id: 'respuesta', sec: 2, q: 'Cuando entra un contacto nuevo, ¿cuánto tardáis en responder?', options: [
    { label: 'Menos de 5 minutos, automático', value: 'auto', s: 3, d: 'velocidad', v: 0 },
    { label: 'Menos de una hora', value: 'hora', s: 2, d: 'velocidad', v: 1 },
    { label: 'El mismo día', value: 'dia', s: 1, d: 'velocidad', v: 2 },
    { label: 'Uno a tres días', value: 'dias', s: 0, d: 'velocidad', v: 3 },
    { label: 'Depende, a veces se nos pasan', value: 'pasan', s: 0, d: 'velocidad', v: 4 }] },

  { id: 'seguimiento', sec: 2, q: 'Si alguien pide información y no compra, ¿cuántas veces le insistís?', options: [
    { label: 'Cinco o más, con secuencia definida', value: 'muchos', s: 3, d: 'velocidad', v: 0 },
    { label: 'Entre dos y cuatro veces', value: 'algunos', s: 2, d: 'velocidad', v: 1 },
    { label: 'Una vez y ya', value: 'una', s: 1, d: 'velocidad', v: 2 },
    { label: 'Ninguna, si no responde se pierde', value: 'cero', s: 0, d: 'velocidad', v: 3 }] },

  { id: 'convlead', sec: 2, q: 'De cada 100 contactos, ¿cuántos acaban comprando?', options: [
    { label: 'Menos de 5', value: 'a', v: 0.03 }, { label: 'Entre 5 y 15', value: 'b', v: 0.1 },
    { label: 'Entre 15 y 30', value: 'c', v: 0.22 }, { label: 'Más de 30', value: 'd', v: 0.4 },
    { label: 'No lo medimos', value: 'e', v: 0.08, s: 0, d: 'datos' }] },

  /* ---- 3 · VENTA ---- */
  { id: 'llamada', sec: 3, q: '¿Hay una conversación de venta antes de cobrar?', options: [
    { label: 'Sí, siempre hablamos antes', value: 'si' },
    { label: 'No, se compra solo desde la web', value: 'no' },
    { label: 'Depende del producto', value: 'mixto' }] },

  { id: 'noshow', sec: 3, q: 'De las reuniones que agendáis, ¿cuántas se caen?',
    show: (A) => A.llamada !== 'no', options: [
      { label: 'Menos del 10 %', value: 'a', v: 0.07 }, { label: '10 – 25 %', value: 'b', v: 0.17 },
      { label: '25 – 40 %', value: 'c', v: 0.32 }, { label: 'Más del 40 %', value: 'd', v: 0.5 },
      { label: 'No lo medimos', value: 'e', v: 0.25, s: 0, d: 'datos' }] },

  { id: 'agenda', sec: 3, q: '¿Cómo se agenda esa reunión?', show: (A) => A.llamada !== 'no', options: [
    { label: 'Calendario automático con recordatorios', value: 'auto', s: 3, d: 'integracion' },
    { label: 'Calendario automático, sin recordatorios', value: 'semi', s: 1, d: 'integracion' },
    { label: 'Cuadrando por mensajes, a mano', value: 'mano', s: 0, d: 'integracion' }] },

  { id: 'propuestas', sec: 3, q: '¿Cómo preparáis las propuestas o presupuestos?',
    show: (A) => A.vende === 'servicio' || A.mercado !== 'b2c', options: [
      { label: 'Se generan solas desde una plantilla', value: 'auto', s: 3, d: 'manual', v: 0 },
      { label: 'Plantilla que se rellena a mano', value: 'semi', s: 1, d: 'manual', v: 1 },
      { label: 'Cada una se escribe desde cero', value: 'cero', s: 0, d: 'manual', v: 2 },
      { label: 'No hacemos propuesta formal', value: 'no', s: 1, d: 'manual', v: 0 }] },

  { id: 'firma', sec: 3, q: '¿Y la firma del contrato o el alta del cliente?',
    show: (A) => A.vende === 'servicio' || A.mercado === 'b2b', options: [
      { label: 'Firma digital, todo automático', value: 'auto', s: 3, d: 'integracion' },
      { label: 'PDF por email, ida y vuelta', value: 'pdf', s: 1, d: 'integracion' },
      { label: 'No hay contrato formal', value: 'no', s: 1, d: 'integracion' }] },

  { id: 'abandono', sec: 3, q: '¿Recuperáis a quien se queda a medias en el checkout?',
    show: (A) => A.llamada !== 'si' && ['fisico', 'digital', 'suscripcion', 'software'].includes(A.vende), options: [
      { label: 'Sí, secuencia automática que revisamos', value: 'auto', s: 3, d: 'velocidad', v: 0 },
      { label: 'Hay algo montado pero no lo tocamos', value: 'olvidado', s: 1, d: 'velocidad', v: 1 },
      { label: 'Lo hacemos a mano cuando podemos', value: 'mano', s: 1, d: 'velocidad', v: 2 },
      { label: 'No hacemos nada', value: 'no', s: 0, d: 'velocidad', v: 3 }] },

  { id: 'upsell', sec: 3, q: '¿Ofrecéis algo más en el momento de comprar?', help: 'Complementos, mejoras de plan, packs.', options: [
    { label: 'Sí, y los optimizamos', value: 'si', s: 3, d: 'capacidad' },
    { label: 'Sí, algo básico', value: 'basico', s: 2, d: 'capacidad' },
    { label: 'Lo tuvimos y lo quitamos', value: 'quitado', s: 1, d: 'capacidad' },
    { label: 'No', value: 'no', s: 0, d: 'capacidad' }] },

  /* ---- 4 · OPERACIÓN ---- */
  { id: 'entrega_serv', sec: 4, q: 'Cuando entra un cliente nuevo, ¿cómo arranca el trabajo?',
    show: (A) => A.vende === 'servicio', options: [
      { label: 'Onboarding automático: accesos, tareas y bienvenida', value: 'auto', s: 3, d: 'manual', v: 0 },
      { label: 'Tenemos checklist, pero se ejecuta a mano', value: 'check', s: 2, d: 'manual', v: 1 },
      { label: 'Cada uno lo hace a su manera', value: 'improv', s: 0, d: 'manual', v: 2 }] },

  { id: 'reporting_serv', sec: 4, q: '¿Cómo informas al cliente de lo que has hecho?',
    show: (A) => A.vende === 'servicio', options: [
      { label: 'Panel o informe automático', value: 'auto', s: 3, d: 'manual', v: 0 },
      { label: 'Alguien lo monta a mano cada mes', value: 'mano', s: 0, d: 'manual', v: 2 },
      { label: 'Solo cuando lo piden', value: 'piden', s: 1, d: 'manual', v: 1 },
      { label: 'No informamos de forma estructurada', value: 'no', s: 0, d: 'manual', v: 1 }] },

  { id: 'stock', sec: 4, q: '¿Cómo se sincroniza el stock entre canales?',
    show: (A) => A.vende === 'fisico', options: [
      { label: 'Automático en todos los canales', value: 'auto', s: 3, d: 'integracion', v: 0 },
      { label: 'Se actualiza a mano', value: 'mano', s: 0, d: 'integracion', v: 2 },
      { label: 'Vendemos en un solo canal', value: 'uno', s: 2, d: 'integracion', v: 0 }] },

  { id: 'envios', sec: 4, q: '¿Cómo se generan las etiquetas y el seguimiento de envío?',
    show: (A) => A.vende === 'fisico', options: [
      { label: 'Automático, el cliente recibe avisos solo', value: 'auto', s: 3, d: 'manual', v: 0 },
      { label: 'Semi-manual', value: 'semi', s: 1, d: 'manual', v: 1 },
      { label: 'Una a una, a mano', value: 'mano', s: 0, d: 'manual', v: 2 }] },

  { id: 'acceso', sec: 4, q: '¿Cómo recibe el cliente su acceso o su producto tras pagar?',
    show: (A) => A.vende === 'digital', options: [
      { label: 'Automático al instante', value: 'auto', s: 3, d: 'manual', v: 0 },
      { label: 'Automático, pero se rompe a menudo', value: 'roto', s: 1, d: 'manual', v: 1 },
      { label: 'Alguien lo da de alta a mano', value: 'mano', s: 0, d: 'manual', v: 2 }] },

  { id: 'impagos', sec: 4, q: '¿Qué pasa cuando falla un cobro recurrente?',
    show: (A) => ['suscripcion', 'software'].includes(A.vende), options: [
      { label: 'Reintento y avisos automáticos', value: 'auto', s: 3, d: 'manual', v: 0 },
      { label: 'Alguien lo persigue a mano', value: 'mano', s: 0, d: 'manual', v: 2 },
      { label: 'No hay proceso definido', value: 'no', s: 0, d: 'manual', v: 2 }] },

  { id: 'churn', sec: 4, q: '¿Sabes por qué se te van los clientes que se van?',
    show: (A) => ['suscripcion', 'software'].includes(A.vende), options: [
      { label: 'Sí, lo medimos y lo trabajamos', value: 'si', s: 3, d: 'datos' },
      { label: 'Tenemos una intuición', value: 'intuicion', s: 1, d: 'datos' },
      { label: 'No lo sabemos', value: 'no', s: 0, d: 'datos' }] },

  { id: 'facturas', sec: 4, q: '¿Cómo se emiten las facturas?', options: [
    { label: 'Automáticas', value: 'auto', s: 3, d: 'manual', v: 0 },
    { label: 'Semi-manuales', value: 'semi', s: 1, d: 'manual', v: 1 },
    { label: 'Todas a mano', value: 'mano', s: 0, d: 'manual', v: 2 }] },

  { id: 'horasadmin', sec: 4, q: '¿Cuántas horas al mes se van en administración y tareas de gestión?',
    help: 'Facturas, cuadres, informes internos, meter datos en sitios.', options: [
      { label: 'Menos de 5', value: 'a', v: 3 }, { label: '5 – 15', value: 'b', v: 10 },
      { label: '15 – 40', value: 'c', v: 27 }, { label: '40 – 80', value: 'd', v: 60 },
      { label: 'Más de 80', value: 'e', v: 110 }] },

  { id: 'copypaste', sec: 4, q: '¿Cuánto copiáis datos de una herramienta a otra a mano?', options: [
    { label: 'Casi nunca', value: 'nunca', s: 3, d: 'manual', v: 0 },
    { label: 'Unas pocas veces al día', value: 'poco', s: 2, d: 'manual', v: 0.4 },
    { label: 'Constantemente', value: 'mucho', s: 0, d: 'manual', v: 1.2 },
    { label: 'No tengo ni idea', value: 'nose', s: 0, d: 'manual', v: 0.6 }] },

  { id: 'crm', sec: 4, q: '¿Dónde apuntáis a los clientes y los contactos?', options: [
    { label: 'Un CRM de verdad, actualizado', value: 'crm', s: 3, d: 'integracion' },
    { label: 'Un CRM, pero está desfasado', value: 'viejo', s: 1, d: 'integracion' },
    { label: 'Hojas de cálculo', value: 'excel', s: 1, d: 'integracion' },
    { label: 'No usamos nada concreto', value: 'nada', s: 0, d: 'integracion' }] },

  { id: 'donde', sec: 4, type: 'multi', q: '¿En cuántos sitios distintos vive esa información?',
    help: 'Marca todos. Aquí es donde suele estar el problema de raíz.', options: [
      { label: 'En el CRM', value: 'crm' }, { label: 'En hojas de cálculo', value: 'excel' },
      { label: 'En la plataforma de venta', value: 'plataforma' }, { label: 'En el email marketing', value: 'email' },
      { label: 'En chats de WhatsApp', value: 'whatsapp' }, { label: 'En la cabeza de alguien', value: 'cabeza' },
      { label: 'En la herramienta de facturación', value: 'factura' }], d: 'integracion' },

  { id: 'automat', sec: 4, q: '¿Usáis alguna herramienta para conectar cosas entre sí?',
    help: 'Zapier, Make, n8n o similar.', options: [
      { label: 'Sí, con varios flujos activos', value: 'si', s: 3, d: 'integracion' },
      { label: 'Sí, un par de cosas sueltas', value: 'poco', s: 2, d: 'integracion' },
      { label: 'Lo probamos y lo dejamos', value: 'fallo', s: 1, d: 'integracion' },
      { label: 'No', value: 'no', s: 0, d: 'integracion' }] },

  { id: 'ia', sec: 4, q: '¿Usáis IA para algo concreto?', options: [
    { label: 'Sí, metida dentro de procesos', value: 'si', s: 3, d: 'integracion' },
    { label: 'Solo ChatGPT suelto para escribir', value: 'suelto', s: 1, d: 'integracion' },
    { label: 'Lo probamos sin resultado', value: 'fallo', s: 1, d: 'integracion' },
    { label: 'No', value: 'no', s: 0, d: 'integracion' }] },

  { id: 'stackcoste', sec: 4, q: '¿Cuánto pagáis al mes en software?', options: [
    { label: 'Menos de 200 €', value: 'a', v: 120 }, { label: '200 – 500 €', value: 'b', v: 340 },
    { label: '500 – 1.500 €', value: 'c', v: 950 }, { label: '1.500 – 5.000 €', value: 'd', v: 3000 },
    { label: 'Más de 5.000 €', value: 'e', v: 8000 }] },

  { id: 'sinusar', sec: 4, q: '¿Hay herramientas que pagáis y casi no usáis?', options: [
    { label: 'Sí, seguro', value: 'si', v: 1 }, { label: 'No', value: 'no', v: 0 },
    { label: 'Sinceramente, no lo sé', value: 'nose', v: 0.6, s: 0, d: 'datos' }] },

  { id: 'soporte_vol', sec: 4, q: '¿Cuántas consultas de clientes recibís al día?', options: [
    { label: 'Menos de 10', value: 'a', v: 5 }, { label: '10 – 30', value: 'b', v: 19 },
    { label: '30 – 100', value: 'c', v: 60 }, { label: '100 – 300', value: 'd', v: 190 },
    { label: 'Más de 300', value: 'e', v: 450 }] },

  { id: 'soporte_rep', sec: 4, q: '¿Qué parte de esas consultas son la misma pregunta de siempre?', options: [
    { label: 'Menos del 20 %', value: 'a', v: 0.15 }, { label: '20 – 50 %', value: 'b', v: 0.35 },
    { label: '50 – 80 %', value: 'c', v: 0.65 }, { label: 'Más del 80 %', value: 'd', v: 0.85 }] },

  { id: 'soporte_centro', sec: 4, q: '¿Están todos los canales de atención en un solo sitio?', options: [
    { label: 'Sí, todo entra en una herramienta', value: 'si', s: 3, d: 'integracion' },
    { label: 'Algunos sí, otros no', value: 'parcial', s: 1, d: 'integracion' },
    { label: 'Cada canal por su lado', value: 'no', s: 0, d: 'integracion' }] },

  { id: 'retencion', sec: 4, type: 'multi', q: '¿Qué hacéis para que un cliente vuelva?',
    help: 'Marca lo que esté funcionando de verdad hoy.', options: [
      { label: 'Secuencia post-compra automática', value: 'post' },
      { label: 'Reactivación de clientes dormidos', value: 'winback' },
      { label: 'Petición automática de reseñas', value: 'reseñas' },
      { label: 'Programa de referidos', value: 'referidos' },
      { label: 'Avisos de renovación o recompra', value: 'renovacion' },
      { label: 'Nada de esto', value: 'nada' }] },

  /* ---- 5 · EQUIPO ---- */
  { id: 'fundadorhoras', sec: 5, q: '¿Cuántas horas a la semana dedicas a tareas repetitivas que no requieren tu criterio?', options: [
    { label: 'Menos de 2', value: 'a', v: 1, s: 3, d: 'manual' }, { label: '2 – 5', value: 'b', v: 3.5, s: 2, d: 'manual' },
    { label: '5 – 10', value: 'c', v: 7.5, s: 1, d: 'manual' }, { label: '10 – 20', value: 'd', v: 15, s: 0, d: 'manual' },
    { label: 'Más de 20', value: 'e', v: 25, s: 0, d: 'manual' }] },

  { id: 'busfactor', sec: 5, q: 'Si mañana desapareciera la persona más clave del equipo, ¿qué pasaría?',
    show: (A) => A.equipo !== 'solo', options: [
      { label: 'Poco, está todo documentado', value: 'nada', s: 3, d: 'documentacion' },
      { label: 'Un mes malo y lo remontamos', value: 'mes', s: 2, d: 'documentacion' },
      { label: 'Se pararían cosas importantes', value: 'para', s: 1, d: 'documentacion' },
      { label: 'Sería un desastre', value: 'desastre', s: 0, d: 'documentacion' }] },

  { id: 'saturado', sec: 5, q: '¿Qué parte del equipo está más ahogada ahora mismo?',
    show: (A) => A.equipo !== 'solo', options: [
      { label: 'Ventas', value: 'ventas' }, { label: 'Marketing', value: 'marketing' },
      { label: 'Operaciones o entrega', value: 'ops' }, { label: 'Atención al cliente', value: 'soporte' },
      { label: 'Administración', value: 'admin' }, { label: 'Yo', value: 'yo' }] },

  { id: 'documentacion', sec: 5, q: '¿Qué parte de vuestros procesos está escrita en algún sitio?', options: [
    { label: 'Más del 70 %', value: 'a', s: 3, d: 'documentacion' },
    { label: 'Entre el 30 y el 70 %', value: 'b', s: 2, d: 'documentacion' },
    { label: 'Menos del 30 %', value: 'c', s: 1, d: 'documentacion' },
    { label: 'Nada, está todo en las cabezas', value: 'd', s: 0, d: 'documentacion' }] },

  { id: 'triple', sec: 5, q: '¿Aguantaría tu operativa el triple de clientes sin contratar a nadie?', options: [
    { label: 'Sí, sin despeinarnos', value: 'si', s: 3, d: 'capacidad' },
    { label: 'Con esfuerzo, sí', value: 'esfuerzo', s: 2, d: 'capacidad' },
    { label: 'No, se rompería', value: 'no', s: 0, d: 'capacidad' },
    { label: 'No lo sé', value: 'nose', s: 0, d: 'capacidad' }] },

  { id: 'freno', sec: 5, q: '¿Qué te frena más hoy?', options: [
    { label: 'No entra suficiente gente', value: 'trafico' },
    { label: 'Entra, pero no convertimos', value: 'conversion' },
    { label: 'Convertimos, pero la operativa no da abasto', value: 'operativa' },
    { label: 'El equipo está saturado', value: 'equipo' },
    { label: 'Estoy metido en todo y no puedo pensar', value: 'fundador' }] },

  { id: 'objetivo', sec: 5, q: '¿Cuál es tu objetivo para los próximos doce meses?', options: [
    { label: 'Duplicar facturación', value: 'duplicar' },
    { label: 'Crecer sin ampliar equipo', value: 'crecer' },
    { label: 'Recuperar mi tiempo', value: 'tiempo' },
    { label: 'Ordenar el caos antes de crecer', value: 'orden' }] },

  { id: 'eliminar', sec: 5, type: 'text', q: 'Si pudieras borrar una tarea de tu semana para siempre, ¿cuál sería?',
    help: 'Escribe lo primero que se te venga a la cabeza. Suele ser lo correcto.',
    placeholder: 'Por ejemplo: cuadrar los cobros con las facturas cada lunes…' },

  { id: 'urgencia', sec: 5, q: '¿Con qué urgencia quieres resolver esto?', options: [
    { label: 'Ya, es la prioridad de este mes', value: 'ya' },
    { label: 'Este trimestre', value: 'trimestre' },
    { label: 'Este año', value: 'año' },
    { label: 'Estoy explorando', value: 'explorando' }] },
]

// Preguntas que se ven con las respuestas dadas hasta ahora.
export const visibles = (A) => Q.filter(q => !q.show || q.show(A))

// El texto de una pregunta puede depender de respuestas anteriores.
export const textoDe = (q, A) => (typeof q.q === 'function' ? q.q(A) : q.q)

// Valor numérico de la opción elegida, para el cálculo.
export function valorDe(A, id) {
  const q = Q.find(x => x.id === id)
  if (!q || A[id] === undefined) return 0
  const o = (q.options || []).find(x => x.value === A[id])
  if (o && o.v !== undefined) return o.v
  return typeof A[id] === 'number' ? A[id] : 0
}

// Etiqueta legible de lo respondido. Se usa para el informe que va al CRM:
// guardar 'a' o 'mucho' no le dice nada a quien lo lea dentro de un mes.
export function etiquetaDe(A, id) {
  const q = Q.find(x => x.id === id)
  if (!q) return ''
  const v = A[id]
  if (v === undefined || v === '') return ''
  if (q.type === 'multi') {
    return (v || []).map(x => q.options.find(o => o.value === x)?.label || x).join(', ')
  }
  if (q.type === 'scale') return `${v} / 10`
  if (q.type === 'text') return String(v)
  return q.options?.find(o => o.value === v)?.label || String(v)
}
