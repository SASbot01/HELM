// Silvestre IA — formulario de valor. El cuestionario.
//
// Declarativo igual que el del diagnóstico: la vista lo recorre sin saber nada
// del contenido, y tocar una pregunta es editar este fichero y nada más.
//
// La forma la marca el bloque 2: la P6 elige rama (A a E) y a partir de ahí
// solo se ven las 16 preguntas de ESA rama, más las cinco comunes del final.
// Nadie contesta 80 preguntas — contesta 21 que le hablan de su negocio, que
// es lo que hace que se terminen.
//
//   rama    si está, la pregunta solo sale para esa rama
//   type    'text' para respuesta libre; sin poner, opción única
//   options una sola respuesta por pregunta (así viene el guion: cuando cabe
//           más de una, la propia lista trae "varias de las anteriores")
//
// No hay bloques con nombre a propósito. El orden del guion mezcla dolor,
// facturación y objetivos al final, y cada rama los mezcla distinto: cualquier
// raíl de secciones acababa retrocediendo a mitad del formulario. El progreso
// se cuenta en preguntas, que no puede desincronizarse.

// Bloque 2 — la pregunta que parte el formulario en cuatro.
export const RAMAS = [
  { value: 'financiera', label: 'Consultora financiera / asesoría fiscal', corto: 'Consultora financiera' },
  { value: 'legal', label: 'Consultora legal / despacho de abogados', corto: 'Despacho legal' },
  { value: 'online', label: 'Infoproducto / formación / servicio online', corto: 'Infoproducto / online' },
  { value: 'infra', label: 'Empresa con infraestructura tecnológica y altos costes en IA o servidores', corto: 'Infraestructura / IA' },
  // La salida para todo lo demás. Sin esta opción, quien no encaja en las
  // cuatro anteriores elige la que menos le desencaja y contesta dieciséis
  // preguntas que no van con su negocio: ese lead llega al CRM contaminado.
  { value: 'otro', label: 'Otro tipo de empresa', corto: 'Otro' },
]

export const ramaCorta = (v) => RAMAS.find(r => r.value === v)?.corto || ''

// Atajo para no repetir `rama: 'financiera'` dieciséis veces.
const de = (rama, preguntas) => preguntas.map(p => ({ ...p, rama, id: `${rama}_${p.id}` }))

export const Q = [
  /* ═══ BLOQUE 2 — segmentación ═══════════════════════════════════════════ */
  {
    id: 'tipo', q: '¿Qué tipo de empresa tienes?',
    help: 'Esto decide el resto del formulario: solo te preguntamos lo que aplica a tu caso.',
    options: RAMAS,
  },

  /* ═══ RAMA A — CONSULTORA FINANCIERA ════════════════════════════════════ */
  ...de('financiera', [
    { id: 'empleados', q: '¿Cuántos empleados tiene tu empresa?', options: [
      { label: '1-3', value: '1-3' }, { label: '4-10', value: '4-10' }, { label: '11-20', value: '11-20' },
      { label: '21-50', value: '21-50' }, { label: 'Más de 50', value: '50+' }] },

    { id: 'modalidad', q: '¿Tu servicio es presencial, online o mixto?', options: [
      { label: 'Presencial', value: 'presencial' }, { label: 'Online', value: 'online' }, { label: 'Mixto', value: 'mixto' }] },

    { id: 'servicios', q: '¿Qué servicios ofreces principalmente?', options: [
      { label: 'Asesoría fiscal y contable', value: 'fiscal' },
      { label: 'Planificación financiera', value: 'planificacion' },
      { label: 'Gestión patrimonial', value: 'patrimonial' },
      { label: 'Auditoría', value: 'auditoria' },
      { label: 'Consultoría de inversiones', value: 'inversiones' },
      { label: 'Varios de los anteriores', value: 'varios' }] },

    { id: 'clientes', q: '¿Cuántos clientes activos gestionas al mes?', options: [
      { label: 'Menos de 20', value: '-20' }, { label: '20-50', value: '20-50' }, { label: '50-100', value: '50-100' },
      { label: '100-200', value: '100-200' }, { label: 'Más de 200', value: '200+' }] },

    { id: 'captacion', q: '¿Cómo captas clientes ahora mismo?', options: [
      { label: 'Boca a boca', value: 'boca' }, { label: 'Referidos', value: 'referidos' },
      { label: 'Redes sociales', value: 'rrss' }, { label: 'Publicidad online', value: 'ads' },
      { label: 'No tengo un sistema claro', value: 'ninguno' },
      { label: 'Varias de las anteriores', value: 'varias' }] },

    { id: 'crm', q: '¿Tienes CRM o sistema de gestión de clientes?', options: [
      { label: 'Sí, y lo uso bien', value: 'si' }, { label: 'Sí, pero apenas lo uso', value: 'infrautilizado' },
      { label: 'No tengo', value: 'no' }] },

    { id: 'herramientas', q: '¿Qué herramientas usas en el día a día?', options: [
      { label: 'Excel / Google Sheets', value: 'excel' },
      { label: 'Software de contabilidad (A3, Sage, Holded, CONTASOL)', value: 'contabilidad' },
      { label: 'CRM (Salesforce, HubSpot, Pipedrive)', value: 'crm' },
      { label: 'Herramientas de firma digital', value: 'firma' },
      { label: 'WhatsApp para todo', value: 'whatsapp' },
      { label: 'Varias combinadas', value: 'varias' }] },

    { id: 'repetitivas', q: '¿Tu equipo dedica tiempo a tareas repetitivas?', options: [
      { label: 'Sí, mucho', value: 'mucho' }, { label: 'Algo, pero es manejable', value: 'algo' },
      { label: 'No, tenemos todo automatizado', value: 'no' }] },

    { id: 'automatizar', q: '¿Qué tareas te gustaría automatizar?', options: [
      { label: 'Entrada de datos y facturación', value: 'datos' },
      { label: 'Comunicación con clientes (emails, recordatorios)', value: 'comunicacion' },
      { label: 'Generación de informes', value: 'informes' },
      { label: 'Seguimiento de expedientes', value: 'expedientes' },
      { label: 'Gestión documental', value: 'documental' },
      { label: 'Todo lo anterior', value: 'todo' }] },

    { id: 'perdidos', q: '¿Alguna vez has perdido un cliente por tardanza en responder?', options: [
      { label: 'Sí, más de una vez', value: 'si' },
      { label: 'Probablemente pero no lo sé seguro', value: 'quiza' },
      { label: 'No, siempre respondemos rápido', value: 'no' }] },

    { id: 'nherramientas', q: '¿Cuántas herramientas de pago usas al mes?', options: [
      { label: '1-3', value: '1-3' }, { label: '4-6', value: '4-6' }, { label: '7-10', value: '7-10' },
      { label: 'Más de 10', value: '10+' }, { label: 'No lo sé exactamente', value: 'nose' }] },

    { id: 'gasto', q: '¿Sabes cuánto gastas al mes en software y herramientas?', options: [
      { label: 'Menos de 100€', value: '-100' }, { label: '100-300€', value: '100-300' },
      { label: '300-500€', value: '300-500' }, { label: '500-1.000€', value: '500-1000' },
      { label: 'Más de 1.000€', value: '1000+' }, { label: 'No lo tengo controlado', value: 'nose' }] },

    { id: 'dolor', q: '¿Cuál es tu mayor dolor ahora mismo?', options: [
      { label: 'No llego a todo con el equipo que tengo', value: 'capacidad' },
      { label: 'Gasto mucho en herramientas que no uso bien', value: 'gasto' },
      { label: 'No tengo visibilidad de cómo va mi negocio en tiempo real', value: 'visibilidad' },
      { label: 'Me cuesta captar clientes nuevos', value: 'captacion' },
      { label: 'La comunicación interna es un caos', value: 'comunicacion' },
      { label: 'Varios de estos', value: 'varios' }] },

    { id: 'factura', q: '¿Cuánto facturas al mes?', options: [
      { label: 'Menos de 5.000€', value: '-5k', v: 3000 }, { label: '5.000-15.000€', value: '5-15k', v: 10000 },
      { label: '15.000-30.000€', value: '15-30k', v: 22000 }, { label: '30.000-60.000€', value: '30-60k', v: 45000 },
      { label: 'Más de 60.000€', value: '60k+', v: 90000 }] },

    { id: 'inversion', q: '¿Has invertido antes en consultoría tecnológica o automatización?', options: [
      { label: 'Nunca', value: 'nunca', v: 0 }, { label: 'Sí, menos de 1.000€', value: '-1k', v: 500 },
      { label: 'Sí, entre 1.000-5.000€', value: '1-5k', v: 3000 }, { label: 'Sí, más de 5.000€', value: '5k+', v: 8000 }] },

    { id: 'objetivo', q: '¿Qué esperas conseguir en los próximos 6 meses?', options: [
      { label: 'Reducir costes operativos', value: 'costes' },
      { label: 'Captar más clientes', value: 'captar' },
      { label: 'Automatizar procesos para liberar tiempo', value: 'automatizar' },
      { label: 'Tener un dashboard con datos en tiempo real', value: 'dashboard' },
      { label: 'Escalar sin contratar más gente', value: 'escalar' },
      { label: 'Todo lo anterior', value: 'todo' }] },
  ]),

  /* ═══ RAMA B — CONSULTORA LEGAL ═════════════════════════════════════════ */
  ...de('legal', [
    { id: 'empleados', q: '¿Cuántos empleados tiene tu despacho?', options: [
      { label: '1-3', value: '1-3' }, { label: '4-10', value: '4-10' }, { label: '11-20', value: '11-20' },
      { label: '21-50', value: '21-50' }, { label: 'Más de 50', value: '50+' }] },

    { id: 'modalidad', q: '¿Tu servicio es presencial, online o mixto?', options: [
      { label: 'Presencial', value: 'presencial' }, { label: 'Online', value: 'online' }, { label: 'Mixto', value: 'mixto' }] },

    { id: 'area', q: '¿En qué área del derecho os especializáis?', options: [
      { label: 'Derecho mercantil', value: 'mercantil' }, { label: 'Derecho laboral', value: 'laboral' },
      { label: 'Derecho fiscal', value: 'fiscal' }, { label: 'Derecho civil', value: 'civil' },
      { label: 'Derecho penal', value: 'penal' }, { label: 'Propiedad intelectual', value: 'ip' },
      { label: 'Varias áreas', value: 'varias' }] },

    { id: 'expedientes', q: '¿Cuántos expedientes o casos gestionáis al mes?', options: [
      { label: 'Menos de 10', value: '-10' }, { label: '10-30', value: '10-30' }, { label: '30-60', value: '30-60' },
      { label: '60-100', value: '60-100' }, { label: 'Más de 100', value: '100+' }] },

    { id: 'captacion', q: '¿Cómo captáis clientes ahora mismo?', options: [
      { label: 'Boca a boca', value: 'boca' },
      { label: 'Referidos de otros despachos', value: 'referidos' },
      { label: 'Redes sociales', value: 'rrss' },
      { label: 'Publicidad online', value: 'ads' },
      { label: 'Directorios legales', value: 'directorios' },
      { label: 'No tenemos un sistema claro', value: 'ninguno' }] },

    { id: 'crm', q: '¿Tenéis CRM o software de gestión de expedientes?', options: [
      { label: 'Sí, y lo usamos bien', value: 'si' }, { label: 'Sí, pero apenas lo usamos', value: 'infrautilizado' },
      { label: 'No tenemos', value: 'no' }] },

    { id: 'herramientas', q: '¿Qué herramientas usáis en el día a día?', options: [
      { label: 'Word / Google Docs para todo', value: 'docs' },
      { label: 'Software jurídico (Lefebvre, Aranzadi, Lex-On)', value: 'juridico' },
      { label: 'CRM (Salesforce, HubSpot)', value: 'crm' },
      { label: 'Firma digital', value: 'firma' },
      { label: 'WhatsApp para comunicación con clientes', value: 'whatsapp' },
      { label: 'Varias combinadas', value: 'varias' }] },

    { id: 'repetitivas', q: '¿Vuestro equipo dedica tiempo a tareas repetitivas?', options: [
      { label: 'Sí, mucho (redacción de documentos tipo, búsqueda jurisprudencia)', value: 'mucho' },
      { label: 'Algo, pero es manejable', value: 'algo' },
      { label: 'No, tenemos todo optimizado', value: 'no' }] },

    { id: 'automatizar', q: '¿Qué tareas os gustaría automatizar?', options: [
      { label: 'Redacción de documentos estándar', value: 'documentos' },
      { label: 'Búsqueda de jurisprudencia y legislación', value: 'jurisprudencia' },
      { label: 'Seguimiento de plazos procesales', value: 'plazos' },
      { label: 'Comunicación con clientes (actualizaciones de estado)', value: 'comunicacion' },
      { label: 'Facturación y control de horas', value: 'facturacion' },
      { label: 'Todo lo anterior', value: 'todo' }] },

    { id: 'errores', q: '¿Alguna vez habéis perdido un plazo o cometido un error por falta de sistema?', options: [
      { label: 'Sí, alguna vez', value: 'si' },
      { label: 'Casi, hemos estado al límite', value: 'casi' },
      { label: 'No, lo controlamos bien', value: 'no' }] },

    { id: 'nherramientas', q: '¿Cuántas herramientas de pago usáis al mes?', options: [
      { label: '1-3', value: '1-3' }, { label: '4-6', value: '4-6' }, { label: '7-10', value: '7-10' },
      { label: 'Más de 10', value: '10+' }, { label: 'No lo sabemos exactamente', value: 'nose' }] },

    { id: 'gasto', q: '¿Sabéis cuánto gastáis al mes en software?', options: [
      { label: 'Menos de 200€', value: '-200' }, { label: '200-500€', value: '200-500' },
      { label: '500-1.000€', value: '500-1000' }, { label: 'Más de 1.000€', value: '1000+' },
      { label: 'No lo tenemos controlado', value: 'nose' }] },

    { id: 'dolor', q: '¿Cuál es vuestro mayor dolor ahora mismo?', options: [
      { label: 'Demasiado trabajo administrativo para los abogados', value: 'admin' },
      { label: 'No tenemos visibilidad del estado de los expedientes', value: 'visibilidad' },
      { label: 'Perdemos tiempo buscando documentos e información', value: 'busqueda' },
      { label: 'Nos cuesta captar clientes nuevos', value: 'captacion' },
      { label: 'La facturación no refleja las horas reales trabajadas', value: 'facturacion' },
      { label: 'Varios de estos', value: 'varios' }] },

    { id: 'factura', q: '¿Cuánto factura el despacho al mes?', options: [
      { label: 'Menos de 5.000€', value: '-5k', v: 3000 }, { label: '5.000-15.000€', value: '5-15k', v: 10000 },
      { label: '15.000-30.000€', value: '15-30k', v: 22000 }, { label: '30.000-60.000€', value: '30-60k', v: 45000 },
      { label: 'Más de 60.000€', value: '60k+', v: 90000 }] },

    { id: 'inversion', q: '¿Habéis invertido antes en consultoría tecnológica?', options: [
      { label: 'Nunca', value: 'nunca', v: 0 }, { label: 'Sí, menos de 1.000€', value: '-1k', v: 500 },
      { label: 'Sí, entre 1.000-5.000€', value: '1-5k', v: 3000 }, { label: 'Sí, más de 5.000€', value: '5k+', v: 8000 }] },

    { id: 'objetivo', q: '¿Qué queréis conseguir en los próximos 6 meses?', options: [
      { label: 'Reducir tiempo en tareas administrativas', value: 'tiempo' },
      { label: 'Automatizar documentos y comunicaciones', value: 'automatizar' },
      { label: 'Tener un sistema de gestión de expedientes real', value: 'sistema' },
      { label: 'Captar más clientes con presencia online', value: 'captar' },
      { label: 'Escalar sin contratar más personal administrativo', value: 'escalar' },
      { label: 'Todo lo anterior', value: 'todo' }] },
  ]),

  /* ═══ RAMA C — INFOPRODUCTOR / FORMACIÓN / SERVICIO ONLINE ══════════════ */
  ...de('online', [
    { id: 'equipo', q: '¿Cuántas personas trabajan en tu proyecto?', options: [
      { label: 'Solo yo', value: 'solo' }, { label: '2-3', value: '2-3' }, { label: '4-10', value: '4-10' },
      { label: '11-20', value: '11-20' }, { label: 'Más de 20', value: '20+' }] },

    { id: 'producto', q: '¿Qué tipo de producto o servicio vendes?', options: [
      { label: 'Curso online grabado', value: 'curso' },
      { label: 'Mentoría / consultoría 1 a 1', value: 'mentoria' },
      { label: 'Membresía o comunidad de pago', value: 'membresia' },
      { label: 'Servicios done-for-you (lo haces tú para el cliente)', value: 'dfy' },
      { label: 'Eventos o talleres en vivo', value: 'eventos' },
      { label: 'Varios de los anteriores', value: 'varios' }] },

    { id: 'nicho', q: '¿En qué nicho estás?', options: [
      { label: 'Marketing / negocios', value: 'marketing' }, { label: 'Salud / fitness', value: 'salud' },
      { label: 'Desarrollo personal', value: 'personal' }, { label: 'Finanzas personales', value: 'finanzas' },
      { label: 'Habilidades técnicas (diseño, programación, video)', value: 'tecnicas' },
      { label: 'Educación académica', value: 'academica' }, { label: 'Otro', value: 'otro' }] },

    { id: 'factura', q: '¿Cuánto facturas al mes?', options: [
      { label: 'Todavía no facturo', value: '0', v: 0 }, { label: 'Menos de 2.000€', value: '-2k', v: 1000 },
      { label: '2.000-5.000€', value: '2-5k', v: 3500 }, { label: '5.000-15.000€', value: '5-15k', v: 10000 },
      { label: '15.000-30.000€', value: '15-30k', v: 22000 }, { label: 'Más de 30.000€', value: '30k+', v: 45000 }] },

    { id: 'origen', q: '¿De dónde vienen tus clientes ahora?', options: [
      { label: 'Instagram orgánico', value: 'instagram' }, { label: 'YouTube', value: 'youtube' },
      { label: 'TikTok', value: 'tiktok' }, { label: 'Publicidad de pago (Meta Ads, Google Ads)', value: 'ads' },
      { label: 'Email marketing', value: 'email' }, { label: 'Boca a boca', value: 'boca' },
      { label: 'No tengo un sistema claro', value: 'ninguno' }] },

    { id: 'funnel', q: '¿Tienes funnel de ventas montado?', options: [
      { label: 'Sí, y funciona bien', value: 'si' },
      { label: 'Sí, pero no convierte como quiero', value: 'flojo' },
      { label: 'Tengo algo básico', value: 'basico' },
      { label: 'No tengo funnel', value: 'no' }] },

    { id: 'email', q: '¿Tienes email marketing?', options: [
      { label: 'Sí, con secuencias automatizadas', value: 'automatizado' },
      { label: 'Sí, pero envío manualmente', value: 'manual' },
      { label: 'No uso email marketing', value: 'no' }] },

    { id: 'plataforma', q: '¿Qué plataforma usas para tu producto?', options: [
      { label: 'Hotmart', value: 'hotmart' }, { label: 'Teachable / Thinkific', value: 'teachable' },
      { label: 'Kajabi', value: 'kajabi' }, { label: 'Skool', value: 'skool' },
      { label: 'WordPress / web propia', value: 'wordpress' },
      { label: 'Nada estructurado todavía', value: 'nada' }, { label: 'Otra', value: 'otra' }] },

    { id: 'crm', q: '¿Tienes CRM o sistema para gestionar leads?', options: [
      { label: 'Sí, y lo uso', value: 'si' }, { label: 'Sí, pero no lo aprovecho', value: 'infrautilizado' },
      { label: 'No tengo', value: 'no' }] },

    { id: 'herramientas', q: '¿Qué herramientas de pago usas?', options: [
      { label: 'Plataforma de cursos', value: 'cursos' },
      { label: 'Email marketing (Mailchimp, ActiveCampaign, ConvertKit)', value: 'email' },
      { label: 'Diseño (Canva Pro)', value: 'diseno' },
      { label: 'Automatización (Zapier, Make)', value: 'automatizacion' },
      { label: 'Calendario (Calendly, Cal.com)', value: 'calendario' },
      { label: 'Pasarela de pago (Stripe, PayPal)', value: 'pagos' },
      { label: 'Varias combinadas', value: 'varias' }] },

    { id: 'gasto', q: '¿Cuánto gastas al mes en herramientas?', options: [
      { label: 'Menos de 100€', value: '-100' }, { label: '100-300€', value: '100-300' },
      { label: '300-500€', value: '300-500' }, { label: '500-1.000€', value: '500-1000' },
      { label: 'Más de 1.000€', value: '1000+' }, { label: 'No lo tengo controlado', value: 'nose' }] },

    { id: 'dolor', q: '¿Cuál es tu mayor dolor ahora mismo?', options: [
      { label: 'No consigo suficientes leads', value: 'leads' },
      { label: 'Tengo leads pero no convierten en ventas', value: 'conversion' },
      { label: 'Hago todo yo y no doy abasto', value: 'capacidad' },
      { label: 'No sé qué automatizar ni por dónde empezar', value: 'rumbo' },
      { label: 'Mi contenido no genera ventas', value: 'contenido' },
      { label: 'No tengo sistema, todo es manual', value: 'manual' },
      { label: 'Varios de estos', value: 'varios' }] },

    { id: 'leads', q: '¿Cuántos leads o contactos nuevos generas al mes?', options: [
      { label: 'Menos de 50', value: '-50' }, { label: '50-200', value: '50-200' },
      { label: '200-500', value: '200-500' }, { label: '500-1.000', value: '500-1000' },
      { label: 'Más de 1.000', value: '1000+' }] },

    { id: 'conversion', q: '¿Cuál es tu tasa de conversión aproximada?', options: [
      { label: 'No lo sé', value: 'nose' }, { label: 'Menos del 1%', value: '-1' },
      { label: '1-3%', value: '1-3' }, { label: '3-5%', value: '3-5' }, { label: 'Más del 5%', value: '5+' }] },

    { id: 'inversion', q: '¿Has invertido antes en consultoría o mentoría para tu negocio?', options: [
      { label: 'Nunca', value: 'nunca', v: 0 }, { label: 'Sí, menos de 1.000€', value: '-1k', v: 500 },
      { label: 'Sí, entre 1.000-5.000€', value: '1-5k', v: 3000 }, { label: 'Sí, más de 5.000€', value: '5k+', v: 8000 }] },

    { id: 'objetivo', q: '¿Qué quieres conseguir en los próximos 6 meses?', options: [
      { label: 'Montar un funnel que convierta', value: 'funnel' },
      { label: 'Automatizar la captación y el seguimiento de leads', value: 'automatizar' },
      { label: 'Escalar sin trabajar más horas', value: 'escalar' },
      { label: 'Tener un sistema donde todo esté conectado', value: 'sistema' },
      { label: 'Lanzar un nuevo producto o servicio', value: 'lanzar' },
      { label: 'Todo lo anterior', value: 'todo' }] },
  ]),

  /* ═══ RAMA D — GRANDES GASTOS EN IA / SERVIDORES ════════════════════════ */
  ...de('infra', [
    { id: 'empleados', q: '¿Cuántos empleados tiene tu empresa?', options: [
      { label: '1-10', value: '1-10' }, { label: '11-50', value: '11-50' },
      { label: '51-200', value: '51-200' }, { label: 'Más de 200', value: '200+' }] },

    { id: 'modalidad', q: '¿Tu empresa es presencial, remota o mixta?', options: [
      { label: 'Presencial', value: 'presencial' }, { label: 'Remota', value: 'remota' }, { label: 'Mixta', value: 'mixta' }] },

    { id: 'sector', q: '¿En qué sector opera tu empresa?', options: [
      { label: 'Tecnología / SaaS', value: 'saas' }, { label: 'Finanzas / banca', value: 'finanzas' },
      { label: 'Salud', value: 'salud' }, { label: 'Retail / ecommerce', value: 'retail' },
      { label: 'Logística', value: 'logistica' }, { label: 'Telecomunicaciones', value: 'telco' },
      { label: 'Otro', value: 'otro' }] },

    { id: 'ia', q: '¿Qué herramientas de IA usáis actualmente?', options: [
      { label: 'ChatGPT / OpenAI API', value: 'openai' },
      { label: 'Google Gemini / Vertex AI', value: 'google' },
      { label: 'Microsoft Copilot', value: 'copilot' },
      { label: 'AWS Bedrock / SageMaker', value: 'aws' },
      { label: 'Modelos open source (Llama, Mistral, Qwen)', value: 'oss' },
      { label: 'No usamos IA todavía', value: 'ninguna' },
      { label: 'Varias combinadas', value: 'varias' }] },

    { id: 'gastoia', q: '¿Cuánto gastáis al mes en APIs de IA o servicios cloud?', options: [
      { label: 'Menos de 500€', value: '-500', v: 300 }, { label: '500-2.000€', value: '500-2k', v: 1200 },
      { label: '2.000-5.000€', value: '2-5k', v: 3500 }, { label: '5.000-15.000€', value: '5-15k', v: 10000 },
      { label: 'Más de 15.000€', value: '15k+', v: 22000 }, { label: 'No lo tenemos controlado', value: 'nose', v: 0 }] },

    { id: 'cloud', q: '¿Dónde corren vuestros servicios ahora?', options: [
      { label: 'AWS', value: 'aws' }, { label: 'Google Cloud', value: 'gcp' }, { label: 'Azure', value: 'azure' },
      { label: 'Servidor propio on-premise', value: 'onprem' },
      { label: 'Proveedor europeo (Hetzner, OVH, Scaleway)', value: 'eu' },
      { label: 'Combinación de varios', value: 'varios' }] },

    { id: 'gastocloud', q: '¿Cuánto gastáis al mes en infraestructura cloud / servidores?', options: [
      { label: 'Menos de 500€', value: '-500', v: 300 }, { label: '500-2.000€', value: '500-2k', v: 1200 },
      { label: '2.000-5.000€', value: '2-5k', v: 3500 }, { label: '5.000-10.000€', value: '5-10k', v: 7500 },
      { label: 'Más de 10.000€', value: '10k+', v: 15000 }] },

    { id: 'privacidad', q: '¿Os preocupa la privacidad de los datos con IA en la nube?', options: [
      { label: 'Sí, mucho', value: 'mucho' }, { label: 'Algo, pero no es prioridad', value: 'algo' },
      { label: 'No nos preocupa', value: 'no' }, { label: 'No lo hemos pensado', value: 'nunca' }] },

    { id: 'gdpr', q: '¿Cumplís con GDPR en el uso de IA?', options: [
      { label: 'Sí, al 100%', value: 'si' },
      { label: 'Creemos que sí pero no lo hemos auditado', value: 'sinauditar' },
      { label: 'No estamos seguros', value: 'dudas' },
      { label: 'No lo hemos revisado', value: 'no' }] },

    { id: 'automatizado', q: '¿Qué procesos tenéis automatizados?', options: [
      { label: 'Atención al cliente (chatbots, FAQs)', value: 'soporte' },
      { label: 'Generación de informes y análisis', value: 'informes' },
      { label: 'Procesamiento de documentos', value: 'documentos' },
      { label: 'Marketing y comunicación', value: 'marketing' },
      { label: 'Nada todavía', value: 'nada' },
      { label: 'Varios de los anteriores', value: 'varios' }] },

    { id: 'automatizar', q: '¿Qué os gustaría automatizar o mejorar con IA?', options: [
      { label: 'Atención al cliente', value: 'soporte' },
      { label: 'Análisis de datos internos', value: 'datos' },
      { label: 'Generación de contenido', value: 'contenido' },
      { label: 'Procesamiento de documentos', value: 'documentos' },
      { label: 'Predicción y toma de decisiones', value: 'prediccion' },
      { label: 'Reducir costes de infraestructura', value: 'costes' },
      { label: 'Todo lo anterior', value: 'todo' }] },

    { id: 'onpremise', q: '¿Habéis considerado migrar a IA local / on-premise?', options: [
      { label: 'Sí, lo estamos evaluando', value: 'evaluando' },
      { label: 'Nos interesa pero no sabemos cómo', value: 'interesa' },
      { label: 'No lo hemos considerado', value: 'no' },
      { label: 'Ya lo hacemos parcialmente', value: 'parcial' }] },

    { id: 'dolor', q: '¿Cuál es vuestro mayor dolor ahora mismo?', options: [
      { label: 'Gastamos demasiado en APIs y cloud', value: 'coste' },
      { label: 'No sabemos si estamos usando la IA de forma eficiente', value: 'eficiencia' },
      { label: 'Nos preocupa la dependencia de un solo proveedor', value: 'lockin' },
      { label: 'No tenemos control sobre nuestros datos', value: 'datos' },
      { label: 'Queremos IA pero no sabemos por dónde empezar', value: 'rumbo' },
      { label: 'Varios de estos', value: 'varios' }] },

    { id: 'factura', q: '¿Cuánto factura tu empresa al mes?', options: [
      { label: 'Menos de 50.000€', value: '-50k', v: 30000 },
      { label: '50.000-200.000€', value: '50-200k', v: 120000 },
      { label: '200.000-500.000€', value: '200-500k', v: 350000 },
      { label: '500.000-1M€', value: '500k-1m', v: 750000 },
      { label: 'Más de 1M€', value: '1m+', v: 1500000 }] },

    { id: 'inversion', q: '¿Habéis invertido antes en consultoría tecnológica o de IA?', options: [
      { label: 'Nunca', value: 'nunca', v: 0 }, { label: 'Sí, menos de 5.000€', value: '-5k', v: 2500 },
      { label: 'Sí, entre 5.000-20.000€', value: '5-20k', v: 12000 }, { label: 'Sí, más de 20.000€', value: '20k+', v: 30000 }] },

    { id: 'objetivo', q: '¿Qué queréis conseguir en los próximos 6 meses?', options: [
      { label: 'Reducir costes de IA y cloud un 30%+', value: 'costes' },
      { label: 'Migrar a infraestructura propia', value: 'migrar' },
      { label: 'Tener IA local con datos protegidos', value: 'local' },
      { label: 'Automatizar procesos clave', value: 'automatizar' },
      { label: 'Escalar sin multiplicar costes', value: 'escalar' },
      { label: 'Todo lo anterior', value: 'todo' }] },
  ]),

  /* ═══ RAMA E — OTRO TIPO DE EMPRESA ═════════════════════════════════════ */
  // Las mismas dieciséis, pero sin dar por hecho el sector. La primera es de
  // respuesta libre: es la única forma de saber a qué se dedica alguien que no
  // entra en ninguna de las cuatro ramas de arriba.
  ...de('otro', [
    { id: 'actividad', type: 'text', q: '¿A qué se dedica tu empresa?',
      help: 'Un par de líneas: qué vendéis y a quién. Con eso preparamos el resto.',
      placeholder: 'Vendemos… a…' },

    { id: 'empleados', q: '¿Cuántos empleados tiene tu empresa?', options: [
      { label: '1-3', value: '1-3' }, { label: '4-10', value: '4-10' }, { label: '11-20', value: '11-20' },
      { label: '21-50', value: '21-50' }, { label: 'Más de 50', value: '50+' }] },

    { id: 'modalidad', q: '¿Tu servicio es presencial, online o mixto?', options: [
      { label: 'Presencial', value: 'presencial' }, { label: 'Online', value: 'online' }, { label: 'Mixto', value: 'mixto' }] },

    { id: 'mercado', q: '¿A quién le vendes?', options: [
      { label: 'A consumidor final (B2C)', value: 'b2c' },
      { label: 'A empresas (B2B)', value: 'b2b' },
      { label: 'A ambos por igual', value: 'mixto' }] },

    { id: 'clientes', q: '¿Cuántos clientes activos gestionas al mes?', options: [
      { label: 'Menos de 20', value: '-20' }, { label: '20-50', value: '20-50' }, { label: '50-100', value: '50-100' },
      { label: '100-200', value: '100-200' }, { label: 'Más de 200', value: '200+' }] },

    { id: 'captacion', q: '¿Cómo captas clientes ahora mismo?', options: [
      { label: 'Boca a boca', value: 'boca' }, { label: 'Referidos', value: 'referidos' },
      { label: 'Redes sociales', value: 'rrss' }, { label: 'Publicidad online', value: 'ads' },
      { label: 'Comercial o equipo de ventas', value: 'comercial' },
      { label: 'No tengo un sistema claro', value: 'ninguno' },
      { label: 'Varias de las anteriores', value: 'varias' }] },

    { id: 'crm', q: '¿Tienes CRM o sistema de gestión de clientes?', options: [
      { label: 'Sí, y lo uso bien', value: 'si' }, { label: 'Sí, pero apenas lo uso', value: 'infrautilizado' },
      { label: 'No tengo', value: 'no' }] },

    { id: 'herramientas', q: '¿Qué herramientas usas en el día a día?', options: [
      { label: 'Excel / Google Sheets', value: 'excel' },
      { label: 'Un software específico de mi sector', value: 'sectorial' },
      { label: 'CRM (Salesforce, HubSpot, Pipedrive)', value: 'crm' },
      { label: 'WhatsApp para todo', value: 'whatsapp' },
      { label: 'Papel y cabeza', value: 'papel' },
      { label: 'Varias combinadas', value: 'varias' }] },

    { id: 'repetitivas', q: '¿Tu equipo dedica tiempo a tareas repetitivas?', options: [
      { label: 'Sí, mucho', value: 'mucho' }, { label: 'Algo, pero es manejable', value: 'algo' },
      { label: 'No, tenemos todo automatizado', value: 'no' }] },

    { id: 'automatizar', q: '¿Qué tareas te gustaría automatizar?', options: [
      { label: 'Entrada de datos y facturación', value: 'datos' },
      { label: 'Comunicación con clientes (emails, recordatorios)', value: 'comunicacion' },
      { label: 'Generación de informes', value: 'informes' },
      { label: 'Seguimiento de clientes, pedidos o proyectos', value: 'seguimiento' },
      { label: 'Gestión documental', value: 'documental' },
      { label: 'Todo lo anterior', value: 'todo' }] },

    { id: 'nherramientas', q: '¿Cuántas herramientas de pago usas al mes?', options: [
      { label: '1-3', value: '1-3' }, { label: '4-6', value: '4-6' }, { label: '7-10', value: '7-10' },
      { label: 'Más de 10', value: '10+' }, { label: 'No lo sé exactamente', value: 'nose' }] },

    { id: 'gasto', q: '¿Sabes cuánto gastas al mes en software y herramientas?', options: [
      { label: 'Menos de 100€', value: '-100' }, { label: '100-300€', value: '100-300' },
      { label: '300-500€', value: '300-500' }, { label: '500-1.000€', value: '500-1000' },
      { label: 'Más de 1.000€', value: '1000+' }, { label: 'No lo tengo controlado', value: 'nose' }] },

    { id: 'dolor', q: '¿Cuál es tu mayor dolor ahora mismo?', options: [
      { label: 'No llego a todo con el equipo que tengo', value: 'capacidad' },
      { label: 'Gasto mucho en herramientas que no uso bien', value: 'gasto' },
      { label: 'No tengo visibilidad de cómo va mi negocio en tiempo real', value: 'visibilidad' },
      { label: 'Me cuesta captar clientes nuevos', value: 'captacion' },
      { label: 'La comunicación interna es un caos', value: 'comunicacion' },
      { label: 'Varios de estos', value: 'varios' }] },

    { id: 'factura', q: '¿Cuánto facturas al mes?', options: [
      { label: 'Menos de 5.000€', value: '-5k', v: 3000 }, { label: '5.000-15.000€', value: '5-15k', v: 10000 },
      { label: '15.000-30.000€', value: '15-30k', v: 22000 }, { label: '30.000-60.000€', value: '30-60k', v: 45000 },
      { label: 'Más de 60.000€', value: '60k+', v: 90000 }] },

    { id: 'inversion', q: '¿Has invertido antes en consultoría tecnológica o automatización?', options: [
      { label: 'Nunca', value: 'nunca', v: 0 }, { label: 'Sí, menos de 1.000€', value: '-1k', v: 500 },
      { label: 'Sí, entre 1.000-5.000€', value: '1-5k', v: 3000 }, { label: 'Sí, más de 5.000€', value: '5k+', v: 8000 }] },

    { id: 'objetivo', q: '¿Qué esperas conseguir en los próximos 6 meses?', options: [
      { label: 'Reducir costes operativos', value: 'costes' },
      { label: 'Captar más clientes', value: 'captar' },
      { label: 'Automatizar procesos para liberar tiempo', value: 'automatizar' },
      { label: 'Tener un dashboard con datos en tiempo real', value: 'dashboard' },
      { label: 'Escalar sin contratar más gente', value: 'escalar' },
      { label: 'Todo lo anterior', value: 'todo' }] },
  ]),

  /* ═══ BLOQUE FINAL — COMÚN A TODAS LAS RAMAS ════════════════════════════
     Sin `rama`, así que las ve todo el mundo y salen al final, después de las
     de su tipo de empresa. Van aquí y no dentro de cada rama por dos motivos:
     la respuesta significa lo mismo en un despacho que en un infoproducto, y
     repetirlas cinco veces era garantizar que acabaran desincronizadas.
     Lo que miden es si el negocio YA vive de lo digital —facturación por
     internet, no seguidores—, que es la línea que separa a quien hay que
     ayudar a montar el sistema de quien solo necesita escalarlo. Van al final
     a propósito: se preguntan por dinero cuando ya se ha contestado todo lo
     demás, no antes de haberse ganado la confianza. */
  { id: 'digital_vive', q: '¿Vives ya de lo que facturas por internet?',
    help: 'Facturación, no seguidores. Aquí no hay respuesta mala.', options: [
    { label: 'Sí, es mi único ingreso', value: 'solo' },
    { label: 'Sí, pero lo combino con otra cosa', value: 'mixto' },
    { label: 'Saco algo, pero todavía no me da para vivir', value: 'algo' },
    { label: 'Todavía no facturo nada online', value: 'no' }] },

  { id: 'digital_parte', q: '¿Qué parte de lo que facturas es 100 % digital?',
    help: 'Digital = se cobra y se entrega sin que nadie se mueva de sitio.', options: [
    { label: 'Todo', value: 'todo' },
    { label: 'Más de la mitad', value: 'mayoria' },
    { label: 'Menos de la mitad', value: 'minoria' },
    { label: 'Casi nada, mi negocio es presencial', value: 'nada' }] },

  { id: 'digital_desde', q: '¿Cuánto tiempo llevas facturando por internet?', options: [
    { label: 'Todavía no he empezado', value: 'no' },
    { label: 'Menos de 6 meses', value: '-6m' },
    { label: 'Entre 6 meses y 2 años', value: '6m-2a' },
    { label: 'Entre 2 y 5 años', value: '2-5a' },
    { label: 'Más de 5 años', value: '5a+' }] },

  { id: 'digital_facturacion', q: '¿Cómo emites las facturas hoy?',
    help: 'Con VeriFactu encima, hacerlas a mano ha dejado de salir gratis.', options: [
    { label: 'Se emiten solas, conectadas a la pasarela de pago', value: 'automatico' },
    { label: 'Tengo programa de facturación, pero las meto yo', value: 'programa' },
    { label: 'Excel o plantillas de Word', value: 'excel' },
    { label: 'Las hace mi gestoría', value: 'gestoria' },
    { label: 'No tengo nada montado', value: 'nada' }] },

  { id: 'digital_meta', q: 'Si mañana pudieras, ¿dejarías lo presencial para vivir solo de lo digital?', options: [
    { label: 'Ya vivo solo de lo digital', value: 'ya' },
    { label: 'Sí, es exactamente lo que busco', value: 'si' },
    { label: 'Sí, pero no me veo listo todavía', value: 'nolisto' },
    { label: 'No, quiero mantener las dos patas', value: 'no' }] },
]

// Las preguntas que se ven con lo respondido hasta ahora: las comunes siempre y
// las de la rama elegida en la P6. Antes de contestar la P6 no se ve ninguna
// rama, así que el formulario empieza por esa pregunta y nada más.
export const visibles = (A) => Q.filter(q => !q.rama || q.rama === A.tipo)

export const textoDe = (q, A) => (typeof q.q === 'function' ? q.q(A) : q.q)

// Valor numérico de la opción elegida (facturación, gasto, inversión previa).
// Lo usa la calificación del lead, no el visitante: aquí no se le enseña ningún
// número calculado, esto no es un diagnóstico.
export function valorDe(A, id) {
  const q = Q.find(x => x.id === id)
  if (!q || A[id] === undefined) return 0
  return (q.options || []).find(x => x.value === A[id])?.v || 0
}

// Etiqueta legible de lo respondido. Es lo que va al informe del CRM: guardar
// '5-15k' no le dice nada a quien abra la ficha dentro de un mes.
export function etiquetaDe(A, id) {
  const q = Q.find(x => x.id === id)
  if (!q) return ''
  const v = A[id]
  if (v === undefined || v === '') return ''
  if (q.type === 'text') return String(v)
  return q.options?.find(o => o.value === v)?.label || String(v)
}
