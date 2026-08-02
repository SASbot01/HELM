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

function pagina({ titulo, descripcion, imagen, url }) {
  const tags = [
    `<title>${esc(titulo)}</title>`,
    `<meta name="description" content="${esc(descripcion)}">`,
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

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase()
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const url = `https://${host}/c/${encodeURIComponent(slug)}`

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, brand_name, brand_subtitle, logo_url, active')
    .eq('slug', slug).maybeSingle()

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Los bots reintentan a menudo y la marca no cambia cada minuto; cinco
  // minutos de caché ahorran una consulta por cada vez que se reenvía el enlace.
  res.setHeader('Cache-Control', 'public, max-age=300')

  if (!client || !client.active) {
    return res.status(404).send(pagina({
      titulo: 'Comunidad no encontrada',
      descripcion: 'Este enlace ya no está disponible.',
      imagen: null,
      url,
    }))
  }

  const { data: cfg } = await supabase
    .from('helm_community').select('name, welcome').eq('client_id', client.id).maybeSingle()

  const nombre = cfg?.name || client.brand_name || client.name
  const logo = client.logo_url && /^https?:\/\//.test(client.logo_url)
    ? client.logo_url
    : (client.logo_url ? `https://${host}${client.logo_url}` : null)

  return res.status(200).send(pagina({
    titulo: client.brand_subtitle ? `${nombre} — ${client.brand_subtitle}` : nombre,
    descripcion: resumen(cfg?.welcome, `Entra en la formación y la comunidad de ${nombre}.`),
    imagen: logo,
    url,
  }))
}
