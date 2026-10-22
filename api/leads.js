// HELM — los leads de las landings propias (las que viven dentro de esta web).
//
//   POST ?action=masterclass   apuntarse a la masterclass de la página de inicio
//   GET  ?action=apuntados     cuántos hay apuntados a una sesión (solo el número)
//   POST ?action=socio         el formulario de cualificación de Socio IA
//   POST ?action=miembro       el alta de una comunidad (AI para todo, Filmmaking…)
//   POST ?action=puerta        primer paso del diagnóstico / formulario de valor
//   POST ?action=completar     último paso del diagnóstico / formulario de valor
//   POST ?action=nota          una línea fija en la ficha («entró en el Discord»…)
//
// Antes estas páginas escribían en el CRM directamente con la clave pública de
// Supabase, y eso obligaba a dejar las tablas abiertas a cualquiera que la
// copiara del HTML. Ahora la clave pública no toca ninguna tabla: pasan por
// aquí, que habla con la base con la clave de servicio.
//
// Es público a propósito (lo llama gente de la calle), así que la defensa es
// que solo se puede hacer lo que hacían esas páginas y nada más:
//
//   · Un único perfil, fijo aquí: las landings propias solo escriben en él.
//     Las comunidades (miembro, nota) escriben en el suyo, que sale de la
//     lista cerrada de api/_lib/comunidades.js: el navegador dice de qué
//     comunidad viene, nunca qué perfil.
//   · Los campos se eligen aquí, uno a uno y con tope de tamaño. Nada de lo que
//     manda el navegador llega a la base tal cual.
//   · Nunca se devuelve nada de un contacto. Lo que recibe el navegador como
//     «id» es una ficha firmada por HELM con el id del contacto dentro: sirve
//     para los pasos siguientes (completar, anotar) y solo para ese contacto.
//     Como va firmada, no se puede cambiar por la de otro: nadie escribe en
//     una ficha ajena probando ids.
//   · Límite por IP.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, verifyJwt } from './_lib/auth.js'
import { comunidadPorClave } from './_lib/comunidades.js'
import { notificar } from './_lib/notificar.js'

// El perfil de todas las landings propias (silvestre). Si mañana hay otra
// landing de otro perfil, se añade a mano: que el slug venga del navegador
// convertiría esto en una puerta a cualquier CRM de HELM.
const PERFIL_SLUG = 'silvestre'

const PIPELINE_INICIO = 'Página de inicio'
const PIPELINE_LEAD_MAGNET = 'Lead magnet'
const PIPELINE_SCHOOL = 'School'
const ETAPA_ENTRADA = 'lead_nuevo'

// Las líneas que el navegador puede pedir que se añadan a la ficha. Son fijas:
// si el texto viniera libre, cualquiera con su ficha podría escribir lo que
// quisiera en las notas que lee el comercial.
const NOTAS = {
  'Entró en la comunidad de Discord': {},
  // Vuelve de Cal.com con la llamada reservada: además pasa a esa etapa.
  'Socio IA: reservó la auditoría en el calendario': { status: 'llamada_agendada' },
  'AI para todo · descargó la guía Mis 8 no negociables (PDF)': {},
  'AI para todo · descargó la guía Los Mods de Claude (PDF)': {},
}

// Los dos formularios de dos pasos (puerta y completar): qué clave ocupan en
// custom_fields, qué formulario de HELM recibe la respuesta y quién firma la
// actividad. El formulario tiene que existir en el perfil: si no, la respuesta
// no se guarda en Formularios, pero el lead sí.
const DOS_PASOS = {
  primermapa: {
    clave: 'primermapa',
    form: /^primermap$/,
    por: 'Diagnóstico operativo',
    estados: ['lead', 'contactado'],
  },
  silvestreai: {
    clave: 'silvestreai_valor',
    form: /^valor-[a-z0-9_]{1,30}$/,
    por: 'Formulario de valor · Silvestre IA',
    estados: ['lead', 'contactado'],
  },
}

// Las etapas de Socio IA (ver src/pages/inicio/socio/crm.js para el porqué).
const ETAPA_ENCAJA = 'cualificado'
const ETAPA_NO_ENCAJA = 'nurturing'
// Las que un envío que encaja SÍ puede adelantar. Quien ya está en "Llamada
// agendada" o es "Cliente" no retrocede por rellenar otra vez el formulario.
const ADELANTABLES = new Set(['lead_nuevo', 'lead', 'recurso_entregado', 'nurturing', 'descartado', null, ''])

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const txt = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max)
const ahora = () => new Date().toISOString()

function fallo(status, mensaje) {
  const e = new Error(mensaje); e.statusCode = status; return e
}

// El correo, normalizado y seguro para buscarlo con ilike: `%` y `*` son
// comodines (y no hay forma de buscarlos literales), y `_` casa con cualquier
// letra. Sin esto, un correo con comodines encontraría la ficha de otra persona.
function correoDe(v) {
  const correo = txt(v, 200).toLowerCase()
  if (!correo) throw fallo(400, 'Falta el email')
  if (/[%*\\]/.test(correo) || !RE_EMAIL.test(correo)) throw fallo(400, 'Revisa el email')
  return correo
}

// De dónde vino, solo con las claves conocidas y cortas.
function origenDe(o) {
  const e = o && typeof o === 'object' ? o : {}
  const r = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'k']) {
    const v = txt(e[k], 200)
    if (v) r[k] = v
  }
  const ref = txt(e.referrer, 300)
  if (ref) r.referrer = ref
  return r
}

// Para guardar un objeto que viene del navegador (las respuestas de un
// cuestionario) sin dejar que nadie meta megas de basura en una ficha.
function jsonAcotado(v, max = 60_000) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const s = JSON.stringify(v)
  if (s.length > max) throw fallo(413, 'Demasiados datos')
  return JSON.parse(s)
}

async function perfil(slug = PERFIL_SLUG) {
  const { data } = await supabase
    .from('clients').select('id, active').eq('slug', slug).maybeSingle()
  if (!data || data.active === false) throw fallo(503, 'No he podido conectar con el CRM. Prueba en un minuto.')
  return data.id
}

async function embudo(clientId, nombre) {
  const { data } = await supabase
    .from('crm_pipelines').select('id, stages')
    .eq('client_id', clientId).eq('name', nombre).maybeSingle()
  return { id: data?.id || null, etapas: Array.isArray(data?.stages) ? data.stages : [] }
}

async function buscar(clientId, correo, columnas = 'id') {
  const { data } = await supabase
    .from('crm_contacts').select(columnas)
    .eq('client_id', clientId).ilike('email', correo.replace(/_/g, '\\_')).limit(1)
  return data?.[0] || null
}

async function crear(fila) {
  const { data, error } = await supabase.from('crm_contacts').insert(fila).select('id').single()
  if (error) { console.warn('[leads] alta', error.message); throw fallo(500, 'No he podido guardarte. Prueba en un minuto.') }
  return data.id
}

async function actualizar(id, cambios) {
  const { error } = await supabase.from('crm_contacts').update(cambios).eq('id', id)
  if (error) { console.warn('[leads] actualizar', error.message); throw fallo(500, 'No he podido guardarte. Prueba en un minuto.') }
}

// La ficha que se lleva el navegador. Noventa días: de sobra para terminar un
// cuestionario o volver de Cal.com, y no vale para siempre.
const ficha = (clientId, contactId) =>
  signJwt({ kind: 'lead', clientId, sub: contactId }, { expiresIn: 60 * 60 * 24 * 90 })

async function contactoDeLaFicha(token, clientId, columnas = 'id') {
  let p
  try { p = await verifyJwt(String(token || '')) } catch { throw fallo(401, 'Ficha no válida') }
  if (p.kind !== 'lead' || p.clientId !== clientId) throw fallo(403, 'Ficha no válida')
  const { data } = await supabase
    .from('crm_contacts').select(columnas).eq('id', p.sub).eq('client_id', clientId).maybeSingle()
  if (!data) throw fallo(404, 'Contacto no encontrado')
  return data
}

// Suma una línea a las notas sin repetirla.
const sumaNota = (previas, linea) => {
  const p = String(previas || '')
  if (!linea) return p || null
  return p.includes(linea) ? p : [p, linea].filter(Boolean).join('\n')
}

// ── La masterclass de la página de inicio ───────────────────────────────────
// Si el email ya existe se actualiza (sin moverle de etapa ni de embudo), y si
// el embudo no existe todavía el lead entra igual, sin embudo: perder un lead
// por una fila de configuración sería el peor intercambio posible.
async function masterclass(b) {
  const correo = correoDe(b.email)
  const clientId = await perfil()
  const pipeline = await embudo(clientId, PIPELINE_INICIO)
  const etapa = pipeline.etapas.find(s => s.key === ETAPA_ENTRADA)?.key || pipeline.etapas[0]?.key || 'lead'
  const o = origenDe(b.origen)
  const evento = txt(b.evento, 200)

  const fila = {
    client_id: clientId,
    name: txt(b.nombre, 80) || correo.split('@')[0],
    email: correo,
    source: 'Página de inicio',
    // A qué sesión se apuntó. Va en las notas y no en `source`: `source` dice
    // de dónde vino, y pisarlo con cada directo partiría la atribución.
    notes: evento ? `Se apuntó a: ${evento}` : null,
    pipeline_id: pipeline.id,
    status: etapa,
    utm_source: o.utm_source || 'pagina-inicio',
    utm_medium: o.utm_medium || 'bio',
    utm_campaign: o.utm_campaign || null,
    utm_content: o.utm_content || null,
    last_activity_at: ahora(),
    updated_at: ahora(),
  }

  const previo = await buscar(clientId, correo, 'id, notes')
  if (previo) {
    const { pipeline_id: _p, status: _s, ...sinMover } = fila
    // Las notas se SUMAN: quien vuelve para otra sesión tiene las dos.
    sinMover.notes = sumaNota(previo.notes, fila.notes)
    await actualizar(previo.id, sinMover)
    return { id: await ficha(clientId, previo.id), repetido: true }
  }
  return { id: await ficha(clientId, await crear(fila)), repetido: false }
}

// Solo el número: los nombres de otros leads no se enseñan a un desconocido.
async function apuntados(q) {
  const evento = txt(q.evento, 200)
  if (!evento || /[%*\\]/.test(evento)) throw fallo(400, 'Falta la sesión')
  const clientId = await perfil()
  const { count } = await supabase
    .from('crm_contacts').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).ilike('notes', `%${evento.replace(/_/g, '\\_')}%`)
  return { count: typeof count === 'number' ? count : null }
}

// ── Socio IA ─────────────────────────────────────────────────────────────────
// Se guardan TODOS los envíos, encajen o no.
async function socio(b) {
  const r = b.respuestas && typeof b.respuestas === 'object' ? b.respuestas : {}
  const correo = correoDe(r.email)
  const encaja = b.encaja === true
  const clientId = await perfil()
  const pipeline = await embudo(clientId, PIPELINE_INICIO)
  const claves = new Set(pipeline.etapas.map(s => s.key))
  const quiero = encaja ? ETAPA_ENCAJA : ETAPA_NO_ENCAJA
  const etapa = claves.size === 0 || claves.has(quiero) ? quiero : ETAPA_ENTRADA

  const o = origenDe(b.origen)
  const res = {
    que_vende: txt(r.que_vende, 300),
    precio: txt(r.precio, 60),
    facturacion: txt(r.facturacion, 60),
    resultados: txt(r.resultados, 300),
  }
  const momento = ahora()
  const datos = {
    ...res,
    encaja,
    // Qué porcentaje le tocaría: 35 % si empieza de cero, 15 % si ya factura.
    modalidad: res.facturacion === '0' ? '35% (desde cero)' : '15% (ya factura)',
    palabra_clave: o.k || null,
    utm_term: o.utm_term || null,
    titular: txt(b.titular, 200) || null,
    enviado: momento,
    // La prueba del consentimiento: qué casilla marcó, con qué texto y cuándo.
    // La fecha la pone el servidor.
    consentimiento: { aceptado: r.rgpd === true, texto: 'Acepto la política de privacidad', fecha: momento },
  }
  const nota = `Socio IA: ${encaja ? 'ENCAJA' : 'no encaja'} · vende "${res.que_vende}" · precio ${res.precio} · factura ${res.facturacion}/mes · resultados: ${res.resultados}${o.k ? ` · palabra: ${o.k}` : ''}`

  const fila = {
    client_id: clientId,
    name: txt(r.nombre, 80) || correo.split('@')[0],
    email: correo,
    instagram: txt(r.instagram, 80).replace(/^@/, '') || null,
    source: 'Socio IA · formulario',
    producto_interes: 'Socio IA',
    notes: nota,
    pipeline_id: pipeline.id,
    status: etapa,
    utm_source: o.utm_source || 'pagina-inicio',
    utm_medium: o.utm_medium || 'bio',
    utm_campaign: o.utm_campaign || null,
    utm_content: o.utm_content || null,
    custom_fields: { socio_ia: datos },
    last_activity_at: momento,
    updated_at: momento,
  }

  const previo = await buscar(clientId, correo, 'id, notes, status, custom_fields')
  if (previo) {
    const { pipeline_id: _p, status: _s, source: _src, ...cambios } = fila
    cambios.notes = [previo.notes, nota].filter(Boolean).join('\n')
    cambios.custom_fields = { ...(previo.custom_fields || {}), socio_ia: datos }
    // Solo se adelanta de etapa si encaja y venía de una etapa "fría".
    if (encaja && ADELANTABLES.has(previo.status ?? null)) {
      cambios.status = etapa
      if (pipeline.id) cambios.pipeline_id = pipeline.id
    }
    await actualizar(previo.id, cambios)
    return { id: await ficha(clientId, previo.id) }
  }
  return { id: await ficha(clientId, await crear(fila)) }
}

// ── Las comunidades (AI para todo, Filmmaking para todo…) ──────────────────
// Cada una escribe en su perfil, de la lista cerrada (api/_lib/comunidades.js);
// sin `comunidad`, AI para todo, como siempre. Quien entra por una guía en PDF
// va al embudo «Lead magnet»; el resto, a «Página de inicio». Al volver NUNCA
// se le cambia de embudo ni de etapa.
function comunidadDe(b) {
  const c = comunidadPorClave(b.comunidad ?? 'aiparatodo')
  if (!c) throw fallo(400, 'Comunidad desconocida')
  return c
}

// La nota del alta la pone la propia página (por dónde entró, qué leyó, qué
// guía pidió). Lo que no tenga esa forma no entra: esas notas las leen el
// equipo y los agentes, y no son sitio para texto libre de internet.
const NOTA_DE_ALTA = /^(entró por [a-z0-9-]+\/[a-z0-9-]+|leyó news\/[a-z0-9-]+|pidió la guía( [^\n]{1,60})?)$/

// Un tope de altas por hora y comunidad, además del de cada IP: frena que
// alguien rotando IPs llene el CRM de un cliente. En memoria, por proceso.
// Solo cuentan las altas NUEVAS: quien ya está en el CRM y vuelve (una puerta
// por cada «Copiar prompt», cada guía…) no llena nada, y si contara, cualquiera
// podría agotar el tope repitiendo su propio correo y dejar fuera a los demás.
// Las nuevas tienen además su tope por IP y comunidad.
const ALTAS_POR_HORA = Number(process.env.HELM_ALTAS_COMUNIDAD_HORA || 200)
const ALTAS_POR_IP_HORA = Number(process.env.HELM_ALTAS_COMUNIDAD_IP_HORA || 10)
const altasRecientes = new Map()   // clave de la comunidad → [instantes]
function cuentaAlta(clave) {
  const ahoraMs = Date.now()
  const lista = (altasRecientes.get(clave) || []).filter(t => ahoraMs - t < 3_600_000)
  if (lista.length >= ALTAS_POR_HORA) throw fallo(429, 'Ahora mismo hay muchas altas. Prueba en un rato.')
  lista.push(ahoraMs)
  altasRecientes.set(clave, lista)
}

async function miembro(b, { ip } = {}) {
  const c = comunidadDe(b)
  // El campo trampa: oculto en la página, solo lo rellena un bot.
  if (txt(b.website, 200)) throw fallo(400, 'No se ha podido enviar')
  const correo = correoDe(b.email)
  // Los ingresos, solo en las comunidades que los piden (c.ingresos); en las
  // demás no se guardan aunque lleguen.
  const ingresos = c.ingresos ? txt(b.ingresos, 40) : null
  if (c.ingresos && !Object.hasOwn(c.ingresos, ingresos)) throw fallo(400, 'Elige tus ingresos')
  // La profesión: texto libre, o una de las opciones de la comunidad si las da.
  const oficio = c.profesiones ? c.profesiones[Object.hasOwn(c.profesiones, String(b.profesion)) ? b.profesion : ''] : txt(b.profesion, 120)
  if (c.profesiones && !oficio) throw fallo(400, 'Elige a qué te dedicas')
  const nombreEmbudo = b.pipeline === PIPELINE_LEAD_MAGNET ? PIPELINE_LEAD_MAGNET : PIPELINE_INICIO

  const clientId = await perfil(c.perfil)
  const pipeline = await embudo(clientId, nombreEmbudo)
  const etapa = pipeline.etapas.find(s => s.key === ETAPA_ENTRADA)?.key || pipeline.etapas[0]?.key || ETAPA_ENTRADA

  const o = origenDe(b.origen)
  const nota = NOTA_DE_ALTA.test(txt(b.nota, 120)) ? txt(b.nota, 120) : ''
  // Las UTM de ESTA entrada quedan también aquí: si la persona ya estaba en el
  // CRM, sus columnas de UTM no se tocan (son las de su primera llegada).
  const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].filter(k => o[k]).map(k => [k, o[k]]))
  const datos = { profesion: oficio, ...(ingresos ? { ingresos } : {}), entrada: nota, enviado: ahora(), ...(Object.keys(utm).length ? { utm } : {}) }
  const linea = [c.nombre, nota, `profesión: ${oficio || '—'}`, ingresos && `ingresos: ${c.ingresos[ingresos]}`].filter(Boolean).join(' · ')

  const fila = {
    client_id: clientId,
    name: txt(b.nombre, 80) || correo.split('@')[0],
    email: correo,
    source: c.nombre,
    notes: linea,
    pipeline_id: pipeline.id,
    status: etapa,
    utm_source: o.utm_source || c.clave,
    utm_medium: o.utm_medium || 'comunidad',
    utm_campaign: o.utm_campaign || null,
    utm_content: o.utm_content || null,
    custom_fields: { [c.clave]: datos },
    last_activity_at: ahora(),
    updated_at: ahora(),
  }

  const previo = await buscar(clientId, correo, 'id, name, notes, custom_fields, utm_source, utm_medium, utm_campaign, utm_content')
  if (previo) {
    // Quien ya estaba (un lead del lanzamiento, un formulario…) no pierde nada:
    // como en formularios.js, solo se rellenan los huecos. Su nombre y sus UTM
    // son los de su primera llegada, y de esas UTM cuelga la atribución de los
    // anuncios (api/_lib/ads.js).
    const cambios = {
      notes: sumaNota(previo.notes, linea),
      // Lo que dejó en otra visita (p. ej. los ingresos de cuando se pedían)
      // se queda; lo de esta entrada lo pisa.
      custom_fields: { ...(previo.custom_fields || {}), [c.clave]: { ...(previo.custom_fields?.[c.clave] || {}), ...datos } },
      last_activity_at: ahora(), updated_at: ahora(),
    }
    if (!previo.name) cambios.name = fila.name
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      if (!previo[k] && fila[k]) cambios[k] = fila[k]
    }
    await actualizar(previo.id, cambios)
    return { id: await ficha(clientId, previo.id) }
  }
  if (!rateLimit({ key: `alta:${c.clave}:${ip || 'anon'}`, max: ALTAS_POR_IP_HORA, windowMs: 3_600_000 }).ok) {
    throw fallo(429, 'Ahora mismo hay muchas altas. Prueba en un rato.')
  }
  cuentaAlta(c.clave)
  return { id: await ficha(clientId, await crear(fila)) }
}

// ── HELM Academy (Skool): el formulario de entrada ──────────────────────────
// Antes de ir al Skool, la gente pasa por un formulario (nombre, correo, a qué
// se dedica, edad, dónde vive, teléfono). Se guarda en el CRM de silvestre, en
// el embudo «School», y después el navegador redirige al Skool. Así Alex sabe
// quién se ha apuntado y puede cruzarlo con las solicitudes de /accesos.
async function school(b, { ip } = {}) {
  if (txt(b.website, 200)) throw fallo(400, 'No se ha podido enviar')
  const correo = correoDe(b.email)
  const nombre = txt(b.nombre, 80)
  if (!nombre) throw fallo(400, 'Dinos cómo te llamas')
  const extra = {
    dedico: txt(b.dedico, 120),
    edad: txt(b.edad, 12),
    residencia: txt(b.residencia, 120),
    telefono: txt(b.telefono, 40),
    apuntado: ahora(),
  }
  const clientId = await perfil('silvestre')
  const linea = ['HELM Academy · se apuntó', extra.dedico && `dedica: ${extra.dedico}`, extra.residencia && `de ${extra.residencia}`, extra.edad && `${extra.edad} años`].filter(Boolean).join(' · ')
  const previo = await buscar(clientId, correo, 'id, name, notes, phone, custom_fields')

  if (previo) {
    await actualizar(previo.id, {
      ...(previo.name ? {} : { name: nombre }),
      ...(previo.phone || !extra.telefono ? {} : { phone: extra.telefono }),
      notes: sumaNota(previo.notes, linea),
      custom_fields: { ...(previo.custom_fields || {}), school: { ...(previo.custom_fields?.school || {}), ...extra } },
      last_activity_at: ahora(), updated_at: ahora(),
    })
    return { ok: true }
  }
  if (!rateLimit({ key: `school:${ip || 'anon'}`, max: ALTAS_POR_IP_HORA, windowMs: 3_600_000 }).ok) {
    throw fallo(429, 'Ahora mismo hay muchas altas. Prueba en un rato.')
  }
  cuentaAlta('school')
  const pipeline = await embudo(clientId, PIPELINE_SCHOOL)
  const etapa = pipeline.etapas[0]?.key || 'apuntado'
  await crear({
    client_id: clientId, name: nombre, email: correo,
    ...(extra.telefono ? { phone: extra.telefono } : {}),
    source: 'HELM Academy', notes: linea,
    pipeline_id: pipeline.id, status: etapa,
    utm_source: 'helm-academy', utm_medium: 'skool',
    custom_fields: { school: extra },
    last_activity_at: ahora(), updated_at: ahora(),
  })
  return { ok: true }
}

// ── AI para todo: acceso con aprobación ─────────────────────────────────────
// Desde el 22-10-2026 el acceso a AI para todo no es automático: se solicita
// (nombre y correo) y lo aprueba Alex a quien ya está en HELM Academy (el
// Skool). El estado vive en el propio contacto, en custom_fields.<clave>.acceso
// ('pendiente' | 'aprobado' | 'rechazado'): así el panel lo ve como un lead más
// y no hace falta otra tabla. Mientras no está aprobado no se devuelve ficha,
// así que la puerta del navegador no se abre.
const estadoAcceso = (contacto, clave) => contacto?.custom_fields?.[clave]?.acceso || null

async function solicitarAcceso(b, { ip } = {}) {
  // El campo trampa, como en las altas: oculto, solo lo rellena un bot.
  if (txt(b.website, 200)) throw fallo(400, 'No se ha podido enviar')
  const c = comunidadDe(b)
  const correo = correoDe(b.email)
  const nombre = txt(b.nombre, 80)
  if (!nombre) throw fallo(400, 'Dinos cómo te llamas')

  const clientId = await perfil(c.perfil)
  const previo = await buscar(clientId, correo, 'id, name, notes, custom_fields')
  // Si ya está aprobado, entra directo: volver a pedir acceso no lo echa.
  if (estadoAcceso(previo, c.clave) === 'aprobado') {
    return { estado: 'aprobado', id: await ficha(clientId, previo.id) }
  }

  const yaPendiente = estadoAcceso(previo, c.clave) === 'pendiente'
  const datos = { ...(previo?.custom_fields?.[c.clave] || {}), acceso: 'pendiente', solicitado: ahora() }
  const linea = `${c.nombre} · pidió acceso`

  if (previo) {
    await actualizar(previo.id, {
      custom_fields: { ...(previo.custom_fields || {}), [c.clave]: datos },
      notes: sumaNota(previo.notes, linea),
      last_activity_at: ahora(), updated_at: ahora(),
    })
  } else {
    if (!rateLimit({ key: `acceso:${c.clave}:${ip || 'anon'}`, max: ALTAS_POR_IP_HORA, windowMs: 3_600_000 }).ok) {
      throw fallo(429, 'Ahora mismo hay muchas solicitudes. Prueba en un rato.')
    }
    cuentaAlta(c.clave)
    const pipeline = await embudo(clientId, PIPELINE_INICIO)
    const etapa = pipeline.etapas.find(s => s.key === ETAPA_ENTRADA)?.key || pipeline.etapas[0]?.key || ETAPA_ENTRADA
    await crear({
      client_id: clientId, name: nombre || correo.split('@')[0], email: correo,
      source: `${c.nombre} · acceso`, notes: linea,
      pipeline_id: pipeline.id, status: etapa,
      utm_source: c.clave, utm_medium: 'acceso',
      custom_fields: { [c.clave]: datos },
      last_activity_at: ahora(), updated_at: ahora(),
    })
  }

  // Aviso a Alex (campana del panel + Telegram), solo cuando la solicitud es
  // nueva: si recarga o reintenta, no se repite.
  if (!yaPendiente) {
    await notificar(supabase, clientId, {
      tipo: 'lead', nivel: 'info',
      titulo: `Acceso a ${c.nombre}: ${nombre}`,
      cuerpo: `${nombre} (${correo}) pide acceso. Apruébalo en Perfiles → Accesos cuando se haya unido a HELM Academy.`,
      clave: `acceso:${c.clave}`,
    })
  }
  return { estado: 'pendiente' }
}

async function comprobarAcceso(b) {
  const c = comunidadDe(b)
  const correo = correoDe(b.email)
  const clientId = await perfil(c.perfil)
  const previo = await buscar(clientId, correo, 'id, custom_fields')
  if (estadoAcceso(previo, c.clave) === 'aprobado') return { estado: 'aprobado', id: await ficha(clientId, previo.id) }
  // No se distingue 'pendiente' de 'no lo pidió nunca': responder distinto
  // dejaría sondear qué correos están en el CRM. Mientras no esté aprobado, para
  // quien pregunta es 'pendiente'.
  return { estado: 'pendiente' }
}

// ── Primer paso del diagnóstico y del formulario de valor ───────────────────
// El lead existe en cuanto pasa la puerta, aunque abandone a la tercera
// pregunta. Si el email ya está, se reutiliza la ficha: quien repite es la
// misma persona, no un lead nuevo.
async function puerta(b) {
  const landing = DOS_PASOS[b.landing] ? b.landing : null
  if (!landing) throw fallo(400, 'Landing desconocida')
  const correo = correoDe(b.email)
  const nombre = txt(b.nombre, 120)
  const telefono = txt(b.telefono, 40)
  if (!nombre) throw fallo(400, 'Dinos cómo te llamas')
  const o = origenDe(b.origen)
  // El CRM tiene columnas propias para las UTM y la vista de Ventas filtra
  // por ellas: dejarlas solo dentro del jsonb las escondería.
  const utm = {
    utm_source: o.utm_source || null,
    utm_medium: o.utm_medium || null,
    utm_campaign: o.utm_campaign || null,
    utm_content: o.utm_content || null,
  }
  const clientId = await perfil()
  const previo = await buscar(clientId, correo)

  if (landing === 'primermapa') {
    if (previo) {
      await actualizar(previo.id, { name: nombre, phone: telefono, updated_at: ahora() })
      return { id: await ficha(clientId, previo.id) }
    }
    return {
      id: await ficha(clientId, await crear({
        client_id: clientId, name: nombre, email: correo, phone: telefono, whatsapp: telefono,
        source: 'Diagnóstico operativo', status: 'lead', tags: ['primermapa'],
        notes: 'Empezó el diagnóstico operativo. Aún sin terminar.', ...utm,
      })),
    }
  }

  // Silvestre IA · formulario de valor. La P5 pide "Instagram o web" en un
  // solo campo, pero el CRM tiene columna para cada cosa.
  const dato = txt(b.web, 300)
  const esInstagram = dato.startsWith('@') || /instagram\.com/i.test(dato)
  const base = {
    name: nombre,
    company: txt(b.empresa, 200),
    phone: telefono,
    whatsapp: telefono,
    country: txt(b.pais, 8) || null,
    website: esInstagram ? '' : dato,
    instagram: esInstagram ? dato : '',
    ...utm,
    updated_at: ahora(),
  }
  if (previo) {
    await actualizar(previo.id, base)
    return { id: await ficha(clientId, previo.id) }
  }
  return {
    id: await ficha(clientId, await crear({
      ...base, client_id: clientId, email: correo,
      source: 'Formulario de valor · Silvestre IA', status: 'lead', tags: ['silvestreai-valor'],
      notes: 'Empezó el formulario de valor. Aún sin terminar.',
    })),
  }
}

// ── Último paso: el informe, la respuesta en Formularios y la actividad ─────
// El informe y la calificación los calcula la página (son sus preguntas y su
// cálculo); aquí se acotan y se guardan, y solo en la ficha de quien pasó la
// puerta.
async function completar(b) {
  const cfg = DOS_PASOS[b.landing]
  if (!cfg) throw fallo(400, 'Landing desconocida')
  const clientId = await perfil()
  const datos = jsonAcotado(b.ficha)
  if (!datos) throw fallo(400, 'Faltan las respuestas')
  const contacto = await contactoDeLaFicha(b.id, clientId, 'id, custom_fields')

  const c = b.contacto && typeof b.contacto === 'object' ? b.contacto : {}
  const valor = c.deal_value == null ? NaN : Number(c.deal_value)
  const patch = {
    notes: txt(c.notes, 20_000) || null,
    deal_value: Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : null,
    status: cfg.estados.includes(c.status) ? c.status : 'lead',
    tags: (Array.isArray(c.tags) ? c.tags : []).slice(0, 8).map(t => txt(t, 60)).filter(Boolean),
    // Se suma a lo que ya tuviera la ficha: quien vino antes por otra landing
    // conserva lo suyo.
    custom_fields: { ...(contacto.custom_fields || {}), [cfg.clave]: datos },
    updated_at: ahora(),
    last_activity_at: ahora(),
  }
  if ('website' in c) patch.website = txt(c.website, 300)
  await actualizar(contacto.id, patch)

  // La respuesta en el plugin Formularios, que es donde el comercial la lee.
  // Si el formulario no existe en el perfil no se guarda aquí, pero el lead sí.
  const formSlug = txt(b.form, 60)
  const { data: form } = cfg.form.test(formSlug)
    ? await supabase.from('helm_forms').select('id, fields')
      .eq('client_id', clientId).eq('slug', formSlug).maybeSingle()
    : { data: null }
  if (form) {
    // Solo las claves que el formulario declara, como en api/formularios.js.
    const claves = new Set((form.fields || []).map(f => f.key))
    const entrada = b.respuestas && typeof b.respuestas === 'object' ? b.respuestas : {}
    const answers = {}
    for (const [k, v] of Object.entries(entrada)) if (claves.has(k)) answers[k] = txt(v, 1000)
    const { error } = await supabase.from('helm_form_responses').insert({
      client_id: clientId,
      form_id: form.id,
      contact_id: contacto.id,
      respondent: txt(b.respondent, 300),
      answers,
      meta: jsonAcotado(b.meta, 5_000) || {},
    })
    if (error) console.warn('[leads] respuesta', error.message)
  } else console.warn('[leads] falta el formulario', formSlug)

  // La actividad es lo que hace que el lead aparezca en el timeline. Que falle
  // no puede tirar abajo el guardado.
  const a = b.actividad && typeof b.actividad === 'object' ? b.actividad : {}
  const { error: errAct } = await supabase.from('crm_activities').insert({
    client_id: clientId,
    contact_id: contacto.id,
    type: 'note',
    title: txt(a.title, 200),
    description: txt(a.description, 2000),
    performed_by: cfg.por,
    performed_at: ahora(),
  })
  if (errAct) console.warn('[leads] actividad', errAct.message)
  return { ok: true }
}

// ── Una línea fija en la ficha ───────────────────────────────────────────────
async function nota(b) {
  const linea = txt(b.texto, 200)
  // Las líneas de las landings de silvestre (sin `comunidad`, o desde AI para
  // todo), o las de la comunidad que la pide, en su perfil.
  const c = b.comunidad == null ? null : comunidadDe(b)
  const enSilvestre = !c || c.perfil === PERFIL_SLUG
  const cfg = enSilvestre ? (Object.hasOwn(NOTAS, linea) ? NOTAS[linea] : null) : (c.notas.includes(linea) ? {} : null)
  if (!cfg) throw fallo(400, 'Nota no permitida')
  const clientId = await perfil(enSilvestre ? PERFIL_SLUG : c.perfil)
  const contacto = await contactoDeLaFicha(b.id, clientId, 'id, notes')
  const notas = sumaNota(contacto.notes, linea)
  if (notas === contacto.notes && !cfg.status) return { ok: true }
  await actualizar(contacto.id, {
    notes: notas,
    ...(cfg.status ? { status: cfg.status } : {}),
    last_activity_at: ahora(),
    updated_at: ahora(),
  })
  return { ok: true }
}

const ACCIONES = { masterclass, socio, miembro, puerta, completar, nota, school, 'solicitar-acceso': solicitarAcceso, 'comprobar-acceso': comprobarAcceso }

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `leads:${ip || 'anon'}`, max: 30, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter || 60))
    return res.status(429).json({ error: 'Demasiados envíos seguidos. Espera un minuto.' })
  }

  try {
    const action = req.query.action
    if (req.method === 'GET' && action === 'apuntados') return res.status(200).json(await apuntados(req.query))
    if (req.method === 'POST' && ACCIONES[action]) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      return res.status(200).json(await ACCIONES[action](body, { ip }))
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    console.error('[leads]', err)
    return res.status(500).json({ error: 'No he podido guardarte. Prueba en un minuto.' })
  }
}
