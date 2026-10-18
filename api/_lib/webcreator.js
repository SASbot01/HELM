// HELM — Web Creator: el estudio y el prompt para construir la web de un
// cliente del CRM.
//
// El disparo es mover el contacto a la etapa «En fabricación» (la clave de
// `helm_web_creator.etapa_key`). El worker mira cada minuto (miraFabricacion) y
// encola un trabajo 'web-estudio' por cada contacto nuevo en esa etapa; el
// trabajo (generaEstudioWeb):
//
//   1. reúne lo que HELM sabe del cliente: su ficha, la prospección de Maps de
//      la que salió, las notas y llamadas del CRM y sus formularios;
//   2. busca las webs mejor posicionadas de su sector — las primeras de Google
//      para «<sector> <ciudad>» y los negocios mejor valorados de Maps en su
//      ciudad y en Madrid — y las lee para ver qué tienen (reserva, WhatsApp,
//      precios, opiniones, secciones…);
//   3. si hay IA disponible, Claude convierte el estudio en dirección creativa;
//   4. deja el prompt listo para copiar y pegar en Claude Code, con el
//      protocolo de publicación (GitHub + Vercel) al final.
//
// Sin IA el estudio y el prompt salen igual: la parte de datos no depende del
// modelo. Nada de esto escribe al cliente ni publica nada.
import { supabase } from '../lib/supabase.js'
import { buscarWeb, urlPublica, fetchPublico, decodeEntidades } from './web.js'
import { buscarNegocios } from './places.js'
import { claudeTurno } from './anthropic.js'
import { proveedorDe } from './llm.js'
import { claveHelm } from './creditos.js'
import { notificar } from './notificar.js'

const recorta = (s, n) => String(s ?? '').slice(0, n)
const ahora = () => new Date().toISOString()
const MAX_HTML = 1_500_000
const MAX_COMPETIDORES = 7
const MODELO = process.env.HELM_WEBCREATOR_MODELO || 'claude-sonnet-5'

// ── Piezas puras (probadas en tests/web-creator.test.js) ───────────────────

export const dominioDe = (url) => String(url || '')
  .replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '').toLowerCase()

export const slugDe = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'web'

// Directorios, redes y plataformas: salen arriba en Google pero no son la web
// de un negocio, así que no sirven de referencia.
const RUIDO = [
  'doctoralia', 'treatwell', 'booksy', 'fresha', 'paginasamarillas', 'tripadvisor', 'facebook', 'instagram', 'tiktok',
  'youtube', 'wikipedia', 'google', 'yelp', 'groupon', 'milanuncios', 'idealista', 'linkedin', 'twitter', 'x.com',
  'cylex', 'infobel', 'einforma', 'axesor', 'habitissimo', 'cronoshare', 'top-rated', 'elcorteingles', 'amazon',
  'tuugo', 'guiaempresa', 'empresite', 'qdq', 'pinterest', 'eltenedor', 'thefork', 'justeat', 'glovo', 'ubereats',
]
export const esRuido = (url) => {
  const d = dominioDe(url)
  return !d || RUIDO.some(r => d.includes(r))
}

/** La ciudad de una dirección de Google Maps («C. Mayor, 12, 30800 Lorca, Murcia, España» → «Lorca»). */
export function ciudadDe(direccion) {
  const d = String(direccion || '')
  const cp = d.match(/\b\d{5}\s+([^,\d]+?)\s*(,|$)/)
  if (cp) return cp[1].trim()
  const partes = d.split(',').map(p => p.trim()).filter(p => p && !/^españa$/i.test(p) && !/\d/.test(p))
  return partes.length ? partes[partes.length - 1] : null
}

/** Lo que mejor posiciona en Maps: buena nota con muchas reseñas. */
export const puntuaMaps = (n) => (Number(n?.rating) || 0) * Math.log10(1 + (Number(n?.resenas) || 0))

const sinEtiquetas = (s) => decodeEntidades(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

const PLATAFORMAS_RESERVA = ['treatwell', 'booksy', 'fresha', 'doctoralia', 'calendly', 'reservio', 'timp', 'bewe', 'simplybook', 'setmore', 'squareup', 'koibox', 'flowww']
const CMS = [['wordpress', /wp-content|wp-includes/], ['wix', /wixstatic|wix\.com/], ['squarespace', /squarespace/], ['shopify', /cdn\.shopify/], ['webflow', /webflow/], ['joomla', /joomla/], ['prestashop', /prestashop/]]

// Las secciones que se buscan en los titulares de una web, por su nombre de
// siempre. El orden es el que suele funcionar en una web local.
export const SECCIONES = [
  ['servicios', /servicio|tratamiento|especialidad|qué hacemos|catálogo|colecci|productos|carta|menú/i],
  ['sobre nosotros', /nosotros|quiénes somos|quienes somos|historia|conóceme|sobre m/i],
  ['equipo', /equipo|profesionales|staff/i],
  ['resultados / galería', /galer|antes y después|trabajos|portfolio|resultados|proyectos/i],
  ['opiniones', /opinion|reseña|testimoni|clientes dicen|valoraci/i],
  ['precios', /precio|tarifa|bonos|packs|planes/i],
  ['preguntas frecuentes', /preguntas|faq|dudas/i],
  ['ofertas', /oferta|promoci|descuento/i],
  ['blog', /blog|noticias|consejos|artículos/i],
  ['contacto / cómo llegar', /contacto|cómo llegar|ubicaci|dónde estamos|horario/i],
]

/** Lo que tiene una web, leído de su HTML: titulares, menú, llamadas a la acción y señales. */
export function analizaHtml(html, url) {
  const h = String(html || '')
  const bajo = h.toLowerCase()
  const titulares = (n) => [...h.matchAll(new RegExp(`<h${n}[^>]*>([\\s\\S]*?)<\\/h${n}>`, 'gi'))]
    .map(m => sinEtiquetas(m[1])).filter(t => t && t.length < 140)
  const nav = h.match(/<nav[\s\S]*?<\/nav>/i)?.[0] || ''
  const menu = [...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m => sinEtiquetas(m[1])).filter(t => t && t.length < 40)
  const ctas = [...h.matchAll(/<(a|button)[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => sinEtiquetas(m[2]))
    .filter(t => t && t.length < 40 && /reserv|cita|pide|llam|whatsapp|presupuesto|contact|compra|comprar|visit|escr[ií]be|solicita|agenda/i.test(t))
  const h1 = titulares(1)
  const h2 = titulares(2)
  const h3 = titulares(3)
  const todos = [...h1, ...h2, ...h3, ...menu].join(' · ')
  const secciones = SECCIONES.filter(([, re]) => re.test(todos)).map(([s]) => s)
  const senales = {
    reserva_online: PLATAFORMAS_RESERVA.some(p => bajo.includes(p)) || /reserva (online|tu cita)|pide (tu )?cita|reservar cita|book now/i.test(h),
    whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(h),
    telefono_visible: /href="tel:/i.test(h),
    precios: /\d+[.,]?\d*\s?€|€\s?\d+/.test(h),
    opiniones: /opinion|reseña|testimoni|valoraci|google reviews/i.test(h),
    mapa: /google\.[a-z.]+\/maps|maps\.google|<iframe[^>]+maps/i.test(h),
    formulario: /<form/i.test(h),
    instagram: /instagram\.com\//i.test(h),
    blog: /\/blog|\/noticias/i.test(h),
    galeria: secciones.includes('resultados / galería'),
    faq: secciones.includes('preguntas frecuentes'),
  }
  const schema = [...new Set([...h.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)].map(m => m[1]))].slice(0, 8)
  return {
    url,
    dominio: dominioDe(url),
    titulo: sinEtiquetas(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0, 160),
    descripcion: sinEtiquetas(h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
      || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1]).slice(0, 300),
    h1: h1.slice(0, 3),
    h2: h2.slice(0, 12),
    menu: [...new Set(menu)].slice(0, 12),
    ctas: [...new Set(ctas)].slice(0, 6),
    secciones,
    senales,
    plataformas_reserva: PLATAFORMAS_RESERVA.filter(p => bajo.includes(p)),
    cms: CMS.find(([, re]) => re.test(bajo))?.[0] || null,
    schema,
    imagenes: (h.match(/<img\b/gi) || []).length,
  }
}

const NOMBRES_SENAL = {
  reserva_online: 'reserva online', whatsapp: 'WhatsApp', telefono_visible: 'teléfono pulsable', precios: 'precios a la vista',
  opiniones: 'opiniones', mapa: 'mapa', formulario: 'formulario', instagram: 'enlace a Instagram', blog: 'blog', galeria: 'galería', faq: 'preguntas frecuentes',
}

/** Qué hacen la mayoría y qué no hace casi nadie, sobre las webs que se han podido leer. */
export function patronesDe(analisis) {
  const n = analisis.length
  if (!n) return { leidas: 0, comunes: [], raros: [], secciones: [] }
  const cuenta = (k) => analisis.filter(a => a.senales[k]).length
  const senales = Object.keys(NOMBRES_SENAL).map(k => ({ k, nombre: NOMBRES_SENAL[k], n: cuenta(k) }))
  const secciones = SECCIONES.map(([s]) => ({ s, n: analisis.filter(a => a.secciones.includes(s)).length }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  return {
    leidas: n,
    comunes: senales.filter(x => x.n / n >= 0.5).sort((a, b) => b.n - a.n),
    raros: senales.filter(x => x.n / n < 0.34),
    secciones,
  }
}

/** Las secciones de la web, en orden: lo del sector primero, lo que diferencia después. */
export function seccionesRecomendadas(patrones, cliente) {
  const base = ['portada con propuesta clara y llamada a la acción', 'servicios']
  const deSector = patrones.secciones.map(x => x.s).filter(s => !['servicios', 'contacto / cómo llegar', 'blog'].includes(s))
  const siempre = ['opiniones', 'preguntas frecuentes']
  const lista = [...base, ...deSector, ...siempre.filter(s => !deSector.includes(s))]
  if (cliente?.resenas >= 10 && !lista.includes('opiniones')) lista.push('opiniones')
  lista.push('contacto / cómo llegar (mapa, horario, teléfono, WhatsApp)')
  return [...new Set(lista)]
}

const lineaCompetidor = (c) => {
  const porque = [
    c.posicion_google ? `${c.posicion_google}º en Google para «${c.consulta}»` : null,
    c.rating ? `${String(c.rating).replace('.', ',')}★ con ${c.resenas || 0} reseñas en Maps${c.zona ? ` (${c.zona})` : ''}` : null,
  ].filter(Boolean).join(' · ')
  const bien = Object.entries(c.analisis?.senales || {}).filter(([, v]) => v).map(([k]) => NOMBRES_SENAL[k])
  const extra = [
    c.analisis?.plataformas_reserva?.length ? `reserva con ${c.analisis.plataformas_reserva.join('/')}` : null,
    c.analisis?.cms ? `hecha en ${c.analisis.cms}` : null,
  ].filter(Boolean)
  return `- **${c.nombre || c.analisis?.dominio}** — ${c.url}\n  ${porque || 'referencia del sector'}\n  Tiene: ${[...bien, ...extra].join(', ') || 'poco destacable'}${c.analisis?.h1?.[0] ? `\n  Su titular: «${c.analisis.h1[0]}»` : ''}`
}

/** El prompt que se copia en Claude Code. */
export function construyePrompt({ id, cliente, sector, ciudad, competidores, patrones, ia, faltan }) {
  const slug = slugDe(`${cliente.nombre} ${ciudad || ''}`)
  const nombre = cliente.nombre || 'el cliente'
  const ctaPrincipal = patrones.comunes.some(x => x.k === 'reserva_online') ? 'reservas (cita online o WhatsApp)'
    : cliente.whatsapp || cliente.telefono ? 'llamadas y mensajes de WhatsApp' : 'contactos por el formulario'
  const seo = ia?.seo || {
    title: `${nombre} | ${sector ? sector[0].toUpperCase() + sector.slice(1) : 'Negocio'}${ciudad ? ` en ${ciudad}` : ''}`,
    description: `${sector || 'Negocio'}${ciudad ? ` en ${ciudad}` : ''}. ${cliente.rating ? `${String(cliente.rating).replace('.', ',')}★ en Google. ` : ''}Pide información o reserva por WhatsApp.`,
    keywords: [sector && ciudad ? `${sector} en ${ciudad}` : null, sector && ciudad ? `${sector} ${ciudad}` : null, sector ? `mejor ${sector}${ciudad ? ` ${ciudad}` : ''}` : null].filter(Boolean),
  }
  const secciones = ia?.secciones?.length
    ? ia.secciones.map((s, i) => `${i + 1}. **${s.nombre}** — ${s.contenido}`)
    : seccionesRecomendadas(patrones, cliente).map((s, i) => `${i + 1}. ${s[0].toUpperCase() + s.slice(1)}`)

  const datos = [
    ['Negocio', cliente.nombre], ['Sector', sector], ['Ciudad', ciudad], ['Dirección', cliente.direccion],
    ['Teléfono', cliente.telefono], ['WhatsApp', cliente.whatsapp], ['Email', cliente.email], ['Horario', cliente.horario],
    ['Instagram', cliente.instagram], ['Facebook', cliente.facebook], ['Web actual', cliente.web ? `${cliente.web} (es un rediseño: conserva el dominio y lo que funcione)` : 'no tiene'],
    ['Google Maps', cliente.rating ? `${String(cliente.rating).replace('.', ',')}★ con ${cliente.resenas || 0} reseñas${cliente.maps_url ? ` — ${cliente.maps_url}` : ''}` : cliente.maps_url],
    ['Titular legal', [cliente.titular, cliente.cif].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`)

  const comunes = patrones.comunes.map(x => `${x.nombre} (${x.n} de ${patrones.leidas})`).join(', ')
  const raros = patrones.raros.map(x => x.nombre).join(', ')

  return `# Web para ${nombre}${sector ? ` — ${sector}` : ''}${ciudad ? ` en ${ciudad}` : ''}

Construye la web de este cliente de web-seller siguiendo este encargo y, cuando esté bien, publícala con el protocolo del final. Ficha en HELM: Agentes → Web Creator → ${nombre} (id ${id}).

## 1. El cliente
${datos.join('\n')}
${cliente.contexto ? `\nLo que sabemos por el CRM (notas, llamadas, formularios):\n${cliente.contexto}\n` : ''}
Lo que falta y NO se inventa (se deja como [PENDIENTE: …] visible en el código y se apunta en el informe): ${faltan.length ? faltan.join(', ') : 'nada importante'}.

## 2. Estudio de las webs mejor posicionadas
${patrones.leidas ? `Se han leído ${patrones.leidas} webs de referencia del sector${ciudad ? ` (${ciudad} y referentes de España)` : ''}:\n\n${competidores.filter(c => c.analisis).map(lineaCompetidor).join('\n')}\n\nLo que tienen casi todas: ${comunes || '—'}.\nLo que casi nadie hace (oportunidad para destacar): ${raros || '—'}.` : 'No se ha podido leer ninguna web de referencia: diseña con las buenas prácticas del sector y dilo en el informe.'}
${ia?.resumen ? `\n### Dirección creativa\n${ia.resumen}\n${ia.propuesta_valor ? `\n- Propuesta de valor: ${ia.propuesta_valor}` : ''}${ia.tono ? `\n- Tono: ${ia.tono}` : ''}${ia.paleta?.length ? `\n- Paleta orientativa: ${ia.paleta.join(', ')}` : ''}${ia.tipografia ? `\n- Tipografía: ${ia.tipografia}` : ''}${ia.titulares?.length ? `\n- Titulares posibles: ${ia.titulares.map(t => `«${t}»`).join(' · ')}` : ''}${ia.diferenciacion?.length ? `\n- Para diferenciarse: ${ia.diferenciacion.join('; ')}` : ''}\n` : ''}
## 3. Qué construir
- Objetivo de la web: conseguir ${ctaPrincipal}. Botón de acción en la cabecera y fijo abajo en el móvil.
- Secciones, en este orden:
${secciones.map(s => `  ${s}`).join('\n')}
- SEO local:
  - title: «${seo.title}»
  - meta description: «${seo.description}»
  - Búsquedas objetivo: ${(seo.keywords || []).join(', ') || '—'}
  - H1 con el sector y la ciudad; datos de nombre, dirección y teléfono idénticos a Google Maps; schema.org LocalBusiness (o el subtipo del sector) con horario y reseñas; mapa de Google embebido; enlace a sus reseñas.
- Calidad: móvil primero (375 px), Lighthouse ≥ 90 en las cuatro categorías, imágenes optimizadas (WebP/AVIF, carga diferida), contraste AA, textos alternativos y foco visible.
- Textos en español de España, cercanos y concretos. Nada de precios, cifras, testimonios ni promesas que el cliente no haya dado.
- Legal: aviso legal, privacidad y cookies con los datos del titular (o [PENDIENTE]). Banner de cookies solo si hay cookies no técnicas.
- Imágenes: las del cliente (su Instagram o su ficha de Google) si hay permiso; si no, fotos libres de derechos (Unsplash, Pexels) marcadas para sustituir.

## 4. Cómo
Sitio estático y rápido, sin backend: Astro (o HTML/CSS/JS con Vite si es una sola página). El contacto, por WhatsApp, teléfono o mailto; si hace falta formulario, uno sin servidor (Formspree o similar, [PENDIENTE: clave]).

## 5. Protocolo de publicación (Claude Code, en el Mac)
1. Carpeta \`~/code/webs/${slug}\`.
2. Construir y revisar en el navegador a 375 px y en escritorio: sin errores en consola, enlaces y botones que funcionan, Lighthouse.
3. \`git init\` y primer commit.
4. GitHub: \`gh repo create SASbot01/web-${slug} --private --source . --push\`.
5. Vercel: \`vercel link --yes --project web-${slug}\`, \`vercel git connect\` y \`vercel --prod\`.
6. Comprobar que la URL de Vercel carga y se ve bien en el móvil.
7. Apuntarlo en HELM: \`ssh minipc "cd /home/s4sf/helm && set -a && . ./.env.server && set +a && node scripts/web-creator.mjs publicada ${id} --repo <url-del-repo> --web <url-de-vercel>"\`
8. Informe final: qué funciona, qué falta (todo lo [PENDIENTE]) y qué hay que pedirle al cliente.
`
}

// ── Recoger lo que se sabe del cliente ─────────────────────────────────────

async function recogeDatos(clientId, contactId) {
  const { data: c } = await supabase.from('crm_contacts')
    .select('id, name, email, phone, whatsapp, company, instagram, website, address, notes, custom_fields, tags, status, producto_interes, situacion_actual, source')
    .eq('id', contactId).eq('client_id', clientId).maybeSingle()
  if (!c) throw Object.assign(new Error('El contacto ya no existe'), { statusCode: 404 })

  let { data: p } = await supabase.from('helm_prospects').select('*').eq('client_id', clientId).eq('contact_id', contactId).limit(1).maybeSingle()
  if (!p && c.phone) ({ data: p } = await supabase.from('helm_prospects').select('*').eq('client_id', clientId).eq('telefono', c.phone).limit(1).maybeSingle())

  const [{ data: actividades }, { data: respuestas }] = await Promise.all([
    supabase.from('crm_activities').select('type, title, description, performed_at').eq('client_id', clientId).eq('contact_id', contactId)
      .order('performed_at', { ascending: false }).limit(25),
    supabase.from('helm_form_responses').select('answers, submitted_at').eq('client_id', clientId).eq('contact_id', contactId)
      .order('submitted_at', { ascending: false }).limit(5),
  ])

  const contexto = [
    c.notes ? `Notas de la ficha: ${recorta(c.notes, 1200)}` : null,
    c.situacion_actual ? `Situación: ${recorta(c.situacion_actual, 400)}` : null,
    c.producto_interes ? `Le interesa: ${recorta(c.producto_interes, 200)}` : null,
    ...(actividades || []).filter(a => a.description || a.title)
      .map(a => `- ${String(a.performed_at || '').slice(0, 10)} ${a.title || a.type}: ${recorta(a.description, 300)}`),
    ...(respuestas || []).map(r => `- Formulario (${String(r.submitted_at || '').slice(0, 10)}): ${recorta(JSON.stringify(r.answers), 600)}`),
  ].filter(Boolean).join('\n')

  const cliente = {
    nombre: c.company || p?.nombre || c.name,
    persona: c.name,
    email: c.email || p?.email || null,
    telefono: c.phone || p?.telefono || null,
    whatsapp: c.whatsapp || null,
    direccion: c.address || p?.direccion || null,
    web: c.website || p?.web || null,
    instagram: c.instagram || p?.instagram || null,
    facebook: p?.facebook || null,
    horario: horarioLegible(p?.horario),
    rating: p?.rating ?? null,
    resenas: p?.resenas ?? null,
    maps_url: p?.maps_url || null,
    categoria: p?.categoria || null,
    titular: p?.titular || null,
    cif: p?.cif || null,
    contexto: recorta(contexto, 4000),
  }
  const sector = (p?.categoria || c.custom_fields?.sector || c.producto_interes || '').toString().trim().toLowerCase() || null
  const ciudad = ciudadDe(cliente.direccion) || c.custom_fields?.ciudad || null
  const faltan = [
    !cliente.direccion && 'dirección', !cliente.telefono && 'teléfono', !cliente.horario && 'horario', 'logo',
    'fotos propias', !cliente.titular && 'titular legal (para el aviso legal)', 'precios (si quiere enseñarlos)',
  ].filter(Boolean)
  return { cliente, sector, ciudad, faltan, contactoNombre: c.name }
}

/** El horario de Maps (texto, lista de «lunes: 10:00–14:00» u objeto) en una línea; vacío → null. */
export function horarioLegible(h) {
  if (!h) return null
  if (typeof h === 'string') return h.trim() || null
  if (Array.isArray(h)) return h.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean).join('; ') || null
  if (typeof h === 'object') {
    if (Array.isArray(h.weekdayDescriptions)) return horarioLegible(h.weekdayDescriptions)
    const txt = Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('; ')
    return txt || null
  }
  return String(h)
}

/** La clave de Places del perfil o, si no tiene, la de otro perfil de la misma agencia. */
async function claveDePlaces(clientId) {
  const { data: propia } = await supabase.from('user_integrations').select('config, enabled')
    .eq('client_id', clientId).eq('service', 'google_places').is('member_id', null).maybeSingle()
  if (propia?.enabled && propia.config?.apiKey) return propia.config.apiKey
  const { data: perfil } = await supabase.from('clients').select('agencia_id').eq('id', clientId).maybeSingle()
  if (!perfil?.agencia_id) return null
  const { data: hermanos } = await supabase.from('clients').select('id').eq('agencia_id', perfil.agencia_id)
  const ids = (hermanos || []).map(h => h.id)
  if (!ids.length) return null
  const { data: otras } = await supabase.from('user_integrations').select('config, enabled')
    .in('client_id', ids).eq('service', 'google_places').is('member_id', null).eq('enabled', true).limit(1)
  return otras?.[0]?.config?.apiKey || null
}

async function leeWeb(url) {
  const seguro = await urlPublica(url)
  if (!seguro) return null
  try {
    const res = await fetchPublico(seguro, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36', Accept: 'text/html' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res?.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return null
    const html = (await res.text()).slice(0, MAX_HTML)
    return analizaHtml(html, res.url || seguro)
  } catch {
    return null
  }
}

async function buscaCompetidores({ clientId, sector, ciudad, dominioPropio }) {
  const candidatos = new Map()
  const anade = (c) => {
    const d = dominioDe(c.url)
    if (!d || d === dominioPropio || esRuido(c.url) || candidatos.has(d)) return
    candidatos.set(d, c)
  }
  const avisos = []

  // Las primeras de Google (buscador de HELM: Brave si hay clave, si no DuckDuckGo).
  if (sector) {
    for (const consulta of [`${sector} ${ciudad || ''}`.trim(), `${sector} España`]) {
      try {
        const res = await buscarWeb(consulta, { max: 10 })
        let pos = 0
        for (const r of res) {
          if (esRuido(r.url)) continue
          pos += 1
          anade({ nombre: r.title, url: r.url, consulta, posicion_google: pos })
          if (pos >= 4) break
        }
      } catch (err) {
        avisos.push(`No se pudo buscar «${consulta}»: ${err.message}`)
      }
    }
  }

  // Los mejor valorados de Maps, en su ciudad y en Madrid.
  const clave = await claveDePlaces(clientId)
  if (clave && sector) {
    for (const zona of [...new Set([ciudad, 'Madrid'].filter(Boolean))]) {
      try {
        const { negocios } = await buscarNegocios(clave, { tipo: sector, zona, limite: 15 })
        negocios.filter(n => n.web && !n.cerrado).sort((a, b) => puntuaMaps(b) - puntuaMaps(a)).slice(0, zona === ciudad ? 3 : 2)
          .forEach(n => anade({ nombre: n.nombre, url: n.web, rating: n.rating, resenas: n.resenas, zona }))
      } catch (err) {
        avisos.push(`Maps (${zona}): ${err.message}`)
      }
    }
  } else if (!clave) {
    avisos.push('Sin clave de Google Places en la agencia: solo se usan los resultados del buscador.')
  }

  const lista = [...candidatos.values()].slice(0, MAX_COMPETIDORES + 3)
  const leidos = await Promise.all(lista.map(async c => ({ ...c, analisis: await leeWeb(c.url) })))
  return { competidores: leidos.filter(c => c.analisis).slice(0, MAX_COMPETIDORES), avisos }
}

// ── La IA (opcional) ────────────────────────────────────────────────────────

const HERRAMIENTA_IA = {
  type: 'function',
  function: {
    name: 'direccion_web',
    description: 'La dirección creativa de la web del cliente a partir del estudio.',
    parameters: {
      type: 'object',
      properties: {
        resumen: { type: 'string', description: '3 a 5 frases: qué web necesita este negocio y por qué, a la vista de su competencia.' },
        propuesta_valor: { type: 'string' },
        tono: { type: 'string' },
        paleta: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Colores en hex.' },
        tipografia: { type: 'string' },
        titulares: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        secciones: {
          type: 'array', maxItems: 10,
          items: { type: 'object', properties: { nombre: { type: 'string' }, contenido: { type: 'string' } }, required: ['nombre', 'contenido'] },
        },
        seo: {
          type: 'object',
          properties: { title: { type: 'string' }, description: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' }, maxItems: 6 } },
        },
        diferenciacion: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
      required: ['resumen', 'secciones'],
    },
  },
}

async function direccionConIa({ clientId, cliente, sector, ciudad, competidores, patrones }) {
  const prov = await proveedorDe(clientId)
  const usarHelm = prov.tipo === 'local'
  if (usarHelm && !claveHelm()) return { ia: null, error: 'No hay IA disponible' }
  const resumenCompetencia = competidores.map(c => ({
    web: c.analisis.dominio, titulo: c.analisis.titulo, h1: c.analisis.h1[0], secciones: c.analisis.secciones,
    tiene: Object.entries(c.analisis.senales).filter(([, v]) => v).map(([k]) => k), maps: c.rating ? `${c.rating}★/${c.resenas}` : null,
    google: c.posicion_google ? `${c.posicion_google}º para ${c.consulta}` : null,
  }))
  const peticion = {
    clientId,
    system: 'Eres director de arte y estratega web para negocios locales en España. A partir del estudio de la competencia, propones la web que más clientes le va a traer a este negocio: concreta, en español de España, sin inventar datos del cliente (precios, años, premios). Contesta SIEMPRE con la herramienta direccion_web.',
    messages: [{ role: 'user', content: `CLIENTE: ${JSON.stringify({ ...cliente, contexto: recorta(cliente.contexto, 1500) })}\nSECTOR: ${sector || '?'} · CIUDAD: ${ciudad || '?'}\nCOMPETENCIA LEÍDA: ${JSON.stringify(resumenCompetencia)}\nPATRONES: ${JSON.stringify(patrones)}` }],
    tools: [HERRAMIENTA_IA],
    maxTokens: 2500,
  }
  try {
    const r = usarHelm
      ? await claudeTurno({ ...peticion, apiKey: claveHelm(), model: MODELO, esfuerzo: 'medium' })
      : await claudeTurno({ ...peticion, apiKey: prov.apiKey, model: prov.model })
    const args = r.toolCalls?.find(t => t.name === 'direccion_web')?.args
    return args?.resumen ? { ia: args, error: null } : { ia: null, error: 'La IA no devolvió la dirección creativa' }
  } catch (err) {
    return { ia: null, error: err.message || 'La IA ha fallado' }
  }
}

// ── El trabajo ──────────────────────────────────────────────────────────────

export async function estudiar(fabricacionId) {
  const { data: fila } = await supabase.from('helm_web_fabricacion').select('*').eq('id', fabricacionId).maybeSingle()
  if (!fila) return
  await supabase.from('helm_web_fabricacion').update({ estado: 'estudiando', error: null, updated_at: ahora() }).eq('id', fila.id)
  try {
    const { cliente, sector, ciudad, faltan } = await recogeDatos(fila.client_id, fila.contact_id)
    const { competidores, avisos } = await buscaCompetidores({ clientId: fila.client_id, sector, ciudad, dominioPropio: dominioDe(cliente.web) })
    const patrones = patronesDe(competidores.map(c => c.analisis))
    const { ia, error: errorIa } = await direccionConIa({ clientId: fila.client_id, cliente, sector, ciudad, competidores, patrones })
    const prompt = construyePrompt({ id: fila.id, cliente, sector, ciudad, competidores, patrones, ia, faltan })
    await supabase.from('helm_web_fabricacion').update({
      estado: 'listo', sector, ciudad, datos: cliente,
      estudio: { competidores, patrones, avisos, ia, ia_error: errorIa, faltan },
      prompt, prompt_con_ia: Boolean(ia), estudiado_en: ahora(), updated_at: ahora(),
    }).eq('id', fila.id)
    await notificar(supabase, fila.client_id, {
      tipo: 'estudio', titulo: `Estudio web listo: ${cliente.nombre}`,
      cuerpo: `${competidores.length} webs de referencia leídas${ia ? ' y dirección creativa con IA' : ''}. El prompt está en Agentes → Web Creator.`,
      destino: 'contenido',
    })
  } catch (err) {
    await supabase.from('helm_web_fabricacion').update({ estado: 'error', error: recorta(err.message, 500), updated_at: ahora() }).eq('id', fila.id)
    throw err
  }
}

/**
 * El estudio de un contacto sin guardar nada ni llamar a la IA: para probar
 * desde la terminal (scripts/web-creator.mjs ensayo <contactId>).
 */
export async function ensayo(clientId, contactId) {
  const { cliente, sector, ciudad, faltan } = await recogeDatos(clientId, contactId)
  const { competidores, avisos } = await buscaCompetidores({ clientId, sector, ciudad, dominioPropio: dominioDe(cliente.web) })
  const patrones = patronesDe(competidores.map(c => c.analisis))
  const prompt = construyePrompt({ id: 'ENSAYO', cliente, sector, ciudad, competidores, patrones, ia: null, faltan })
  return { sector, ciudad, competidores: competidores.map(c => ({ nombre: c.nombre, url: c.url, google: c.posicion_google, maps: c.rating })), avisos, patrones, prompt }
}

/** Paso del worker para los trabajos 'web-estudio'. */
export async function generaEstudioWeb(job) {
  const id = job?.payload?.fabricacionId
  if (!id) throw new Error('Trabajo web-estudio sin fabricacionId')
  await estudiar(id)
}

export async function encolaEstudio(clientId, fabricacionId) {
  const { error } = await supabase.from('agent_jobs').upsert({
    tipo: 'web-estudio', payload: { clientId, fabricacionId },
    clave: `web-estudio:${fabricacionId}:${Date.now()}`,
    estado: 'pendiente', max_intentos: 1, correr_tras: ahora(),
  }, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar el estudio: ${error.message}`)
}

/**
 * Los contactos que han entrado en la etapa y aún no tienen ficha: se les crea
 * y se encola su estudio. Lo llama el worker cada minuto y el panel al abrir.
 */
export async function miraFabricacion(soloClientId = null) {
  let q = supabase.from('helm_web_creator').select('client_id, etapa_key').eq('activo', true)
  if (soloClientId) q = q.eq('client_id', soloClientId)
  const { data: perfiles, error } = await q
  if (error) throw error
  let nuevos = 0
  for (const p of perfiles || []) {
    const { data: contactos } = await supabase.from('crm_contacts').select('id').eq('client_id', p.client_id).eq('status', p.etapa_key).limit(200)
    if (!contactos?.length) continue
    const { data: ya } = await supabase.from('helm_web_fabricacion').select('contact_id').eq('client_id', p.client_id)
      .in('contact_id', contactos.map(c => c.id))
    const tienen = new Set((ya || []).map(f => f.contact_id))
    for (const c of contactos.filter(x => !tienen.has(x.id))) {
      const { data: fila, error: e } = await supabase.from('helm_web_fabricacion')
        .insert({ client_id: p.client_id, contact_id: c.id }).select('id').single()
      if (e) continue // otro proceso la ha creado a la vez
      await encolaEstudio(p.client_id, fila.id)
      nuevos++
    }
  }
  return nuevos
}
