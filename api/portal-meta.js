// HELM — la tarjeta que sale al compartir el enlace de una comunidad, de un
// panel o de un formulario.
//
// Esas páginas ya se pintan con la marca del perfil, pero eso pasa en el
// navegador. Cuando alguien pega el enlace en WhatsApp, Telegram o LinkedIn, el
// bot que genera la vista previa NO ejecuta JavaScript: se lleva el index.html
// tal cual, que es común a toda la app y dice "HELM — El puesto de mando de tu
// negocio", con el icono de HELM. Por eso el enlace no respetaba la marca
// aunque la página sí.
//
// Aquí se sirve, solo para esos bots (el rewrite de vercel.json filtra por
// user-agent), un HTML mínimo con las etiquetas Open Graph del perfil. Las
// personas siguen entrando en la SPA de siempre.
import { supabase } from './lib/supabase.js'

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Una descripción de tarjeta es un párrafo corto: la bienvenida puede traer
// markdown y saltos de línea, y ahí dentro se ve fatal.
function resumen(texto, alternativa) {
  const limpio = String(texto || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  if (!limpio) return alternativa
  return limpio.length > 180 ? `${limpio.slice(0, 177)}…` : limpio
}

function pagina({ titulo, descripcion, imagen, url, color }) {
  const tags = [
    `<title>${esc(titulo)}</title>`,
    `<meta name="description" content="${esc(descripcion)}">`,
    // Algunas apps (Slack, Telegram) pintan una franja con este color al lado
    // de la tarjeta. Es lo único del preview que se puede teñir sin imagen.
    ...(color ? [`<meta name="theme-color" content="${esc(color)}">`] : []),
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(titulo)}">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(descripcion)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="${imagen ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(titulo)}">`,
    `<meta name="twitter:description" content="${esc(descripcion)}">`,
  ]
  if (imagen) {
    tags.push(`<meta property="og:image" content="${esc(imagen)}">`)
    tags.push(`<meta name="twitter:image" content="${esc(imagen)}">`)
    tags.push(`<link rel="icon" href="${esc(imagen)}">`)
  }
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${tags.join('\n')}
</head>
<body>
<h1>${esc(titulo)}</h1>
<p>${esc(descripcion)}</p>
<p><a href="${esc(url)}">Abrir</a></p>
</body>
</html>`
}

// Rutas que NO son el slug de un perfil aunque lo parezcan. El rewrite ya las
// deja fuera, pero esto es la segunda barrera: si alguien afloja el patrón, el
// peor caso es una tarjeta genérica y no una consulta rara a la base.
const RESERVADAS = new Set([
  'api', 'login', 'registro', 'admin', 'usersadmin', 'primermap', 'silvestreai',
  'agents', 'clase', 'gracias', 'privacidad', 'aviso-legal', 'paginainicio',
  'f', 'd', 'assets', 'manifest.json', 'robots.txt', 'favicon.ico',
])

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')

  // El enlace de un formulario (/f/<formId>) es otro caso aparte: el id es
  // global y no de un perfil por slug, así que se busca en helm_forms y de ahí
  // se saca el perfil. Es el mismo problema que el resto de este archivo: sin
  // esto, el enlace del lead magnet enseñaba "HELM — El puesto de mando de tu
  // negocio" con el icono verde de HELM, y quien lo recibía pensaba que era spam.
  if (req.query.tipo === 'formulario') {
    const formId = String(req.query.formId || '')
    const url = `https://${host}/f/${encodeURIComponent(formId)}`

    const { data: form } = formId
      ? await supabase.from('helm_forms')
        .select('client_id, title, description, active').eq('id', formId).maybeSingle()
      : { data: null }

    const { data: client } = form
      ? await supabase.from('clients')
        .select('name, brand_name, brand_subtitle, logo_url, primary_color, active')
        .eq('id', form.client_id).maybeSingle()
      : { data: null }

    if (!form || form.active === false || !client || !client.active) {
      return res.status(404).send(pagina({
        titulo: 'Formulario no encontrado',
        descripcion: 'Este enlace ya no está disponible.',
        imagen: null,
        url,
      }))
    }

    const logo = client.logo_url && /^https?:\/\//.test(client.logo_url)
      ? client.logo_url
      : (client.logo_url ? `https://${host}${client.logo_url}` : null)
    const color = /^#[0-9a-f]{3,8}$/i.test(client.primary_color || '') ? client.primary_color : null
    const nombre = client.brand_name || client.name

    return res.status(200).send(pagina({
      titulo: form.title ? `${form.title} — ${nombre}` : nombre,
      descripcion: resumen(form.description, `Formulario de ${nombre}.`),
      imagen: logo,
      url,
      color,
    }))
  }

  const slug = String(req.query.slug || '').toLowerCase()
  // El enlace de entrada al panel (helm.s4sf.net/<slug>). Este endpoint nació
  // para la comunidad interna (/c/<slug>); al retirarse esa sección solo queda
  // el panel, así que `tipo=panel` ya no distingue nada y se ignora.
  const url = `https://${host}/${encodeURIComponent(slug)}`

  const { data: client } = slug && !RESERVADAS.has(slug)
    ? await supabase
      .from('clients')
      .select('id, name, brand_name, brand_subtitle, logo_url, primary_color, active')
      .eq('slug', slug).maybeSingle()
    : { data: null }

  if (!client || !client.active) {
    // Un slug que no existe es, casi siempre, una ruta de la app que se coló.
    return res.status(404).send(pagina({
      titulo: 'Página no encontrada',
      descripcion: 'Este enlace ya no está disponible.',
      imagen: null,
      url,
    }))
  }

  const logo = client.logo_url && /^https?:\/\//.test(client.logo_url)
    ? client.logo_url
    : (client.logo_url ? `https://${host}${client.logo_url}` : null)
  const color = /^#[0-9a-f]{3,8}$/i.test(client.primary_color || '') ? client.primary_color : null

  // El enlace del panel. Es el que se pasa al equipo, y hasta ahora se llevaba
  // el HTML común de la app: salía "HELM — El puesto de mando de tu negocio"
  // con el icono de HELM, aunque el perfil tuviera su propia marca. Aquí sale
  // con el nombre, el logo y el color del negocio.
  //
  // La descripción no cuenta qué hay dentro a propósito: es un panel privado y
  // el enlace acaba en grupos de WhatsApp donde no todos tienen acceso.
  const nombre = client.brand_name || client.name
  return res.status(200).send(pagina({
    titulo: client.brand_subtitle ? `${nombre} — ${client.brand_subtitle}` : nombre,
    descripcion: `Panel de ${nombre}. Hay que entrar con tu cuenta.`,
    imagen: logo,
    url,
    color,
  }))
}
