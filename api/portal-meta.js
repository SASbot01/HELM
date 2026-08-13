// HELM — la tarjeta que sale al compartir el enlace de una comunidad.
//
// El portal /c/<slug> ya se pinta con la marca del perfil, pero eso pasa en el
// navegador. Cuando alguien pega el enlace en WhatsApp, Telegram o LinkedIn, el
// bot que genera la vista previa NO ejecuta JavaScript: se lleva el index.html
// tal cual, que es común a toda la app y dice "HELM — El puesto de mando de tu
// negocio", con el icono de HELM. Por eso el enlace del curso no respetaba la
// marca aunque la página sí.
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
  'c', 'f', 'd', 'assets', 'manifest.json', 'robots.txt', 'favicon.ico',
])

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase()
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  // `tipo=panel` → el enlace de entrada al panel (helm.s4sf.net/<slug>).
  // Sin él, el de la comunidad (/c/<slug>), que es como nació este endpoint.
  const esPanel = req.query.tipo === 'panel'
  const url = esPanel
    ? `https://${host}/${encodeURIComponent(slug)}`
    : `https://${host}/c/${encodeURIComponent(slug)}`

  const { data: client } = slug && !RESERVADAS.has(slug)
    ? await supabase
      .from('clients')
      .select('id, name, brand_name, brand_subtitle, logo_url, primary_color, active')
      .eq('slug', slug).maybeSingle()
    : { data: null }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Los bots reintentan a menudo y la marca no cambia cada minuto; cinco
  // minutos de caché ahorran una consulta por cada vez que se reenvía el enlace.
  res.setHeader('Cache-Control', 'public, max-age=300')

  if (!client || !client.active) {
    // El enlace del panel de un slug que no existe no es "comunidad no
    // encontrada": lo más probable es una ruta de la app que se coló.
    return res.status(404).send(pagina({
      titulo: esPanel ? 'Página no encontrada' : 'Comunidad no encontrada',
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
  if (esPanel) {
    const nombre = client.brand_name || client.name
    return res.status(200).send(pagina({
      titulo: client.brand_subtitle ? `${nombre} — ${client.brand_subtitle}` : nombre,
      descripcion: `Panel de ${nombre}. Hay que entrar con tu cuenta.`,
      imagen: logo,
      url,
      color,
    }))
  }

  const { data: cfg } = await supabase
    .from('helm_community').select('name, welcome').eq('client_id', client.id).maybeSingle()

  const nombre = cfg?.name || client.brand_name || client.name

  return res.status(200).send(pagina({
    titulo: client.brand_subtitle ? `${nombre} — ${client.brand_subtitle}` : nombre,
    descripcion: resumen(cfg?.welcome, `Entra en la formación y la comunidad de ${nombre}.`),
    imagen: logo,
    url,
    color,
  }))
}
