// HELM — ¿Tiene web este negocio, y está al día?
//
// Para quien vende webs, el cliente perfecto es un negocio con reseñas (o sea,
// vivo y con clientes) que no tiene web, la tiene caída o la tiene de hace diez
// años. Esto mira la portada de un negocio y lo dice, con los motivos en
// castellano: es lo que el comercial va a decir al llamar («tu web no se ve
// bien en el móvil»), no «puntuación 4».
//
// Una sola petición a la portada, con la misma identidad que enriquecer.js y
// respetando su robots.txt. Nunca lanza: lo peor que devuelve es 'desconocido'.
//
// Ninguna señal sola condena a una web (hay webs nuevas con un © viejo en el
// pie), por eso se suman y hay un umbral. De más a menos fiables:
//   · no carga: dominio que ya no existe, servidor que no responde, dominio
//     aparcado, página por defecto del hosting, cuenta suspendida
//   · certificado caducado o mal puesto: el navegador avisa de que no es segura
//   · sin <meta viewport>: no está hecha para el móvil
//   · Flash, frames, <font>, <marquee>, <center>: HTML de los 2000
//   · sin https
//   · el © más reciente es de hace años
//   · generador viejo (FrontPage, Dreamweaver, Joomla 1–3, WordPress < 5)
//   · jQuery 1.x, doctype de HTML 4 / XHTML
import dns from 'node:dns/promises'
import { fetchPublico, esIpPrivada } from './web.js'
import { reglasRobots, permitida, UA } from './enriquecer.js'

const TIMEOUT_MS = 9000
const MAX_BYTES = 1_500_000

// A partir de aquí es «antigua». Con 3 hace falta o una señal fuerte (no es
// para el móvil, Flash, frames) o dos medianas juntas.
export const UMBRAL = 3

// Lo que Google Maps tiene como «web» y no es una web propia.
const NO_ES_WEB = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i, 'Facebook'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/i, 'WhatsApp'],
  [/(^|\.)(linktr\.ee|linkin\.bio|beacons\.ai)$/i, 'un enlace de Linktree'],
  [/(^|\.)business\.site$/i, 'la web gratuita de Google (ya cerrada)'],
  [/(^|\.)(etsy\.com|wallapop\.com|milanuncios\.com)$/i, 'una tienda en un marketplace'],
  [/(^|\.)(google\.com|goo\.gl|g\.page|maps\.app\.goo\.gl)$/i, 'su ficha de Google'],
]

// Dominios aparcados, hostings sin web y cuentas suspendidas. Se mira el texto
// de la portada, que en estos casos es una página genérica muy reconocible.
const APARCADO = [
  /domain (name )?(is )?for sale/i,
  /this domain (has been|is) (registered|parked)/i,
  /(este|el) dominio (est[aá]|ha sido|se encuentra) (en venta|registrado|aparcado|parkeado)/i,
  /dominio (registrado|aparcado|parkeado) (por|en|con)/i,
  /buy this domain/i,
  /(cuenta|account) (ha sido )?suspend(ida|ed)/i,
  /(web ?site|sitio web|p[aá]gina web|\bweb)\s+(en construcci[oó]n|under construction|en mantenimiento)/i,
  /^\s*(en construcci[oó]n|under construction|coming soon|pr[oó]ximamente)\s*$/i,
  /apache2? (ubuntu|debian)? ?default page/i,
  /welcome to nginx/i,
  /default (web site|server) page/i,
  /^\s*it works!?\s*$/i,
  /\bindex of \//i,
  /(plesk|cpanel|hostinger|ionos|1&1|arsys|dinahosting|nominalia|webempresa)[^.]{0,80}(p[aá]gina por defecto|default page|parked|aparcad|reci[eé]n creado|est[aá] listo)/i,
]

// Las protecciones antibots devuelven 403/429/503 con su propia página. Eso no
// dice nada de la web del negocio: se deja en 'desconocido'.
const ANTIBOT = /(cloudflare|captcha|ddos-guard|sucuri|incapsula|attention required|just a moment|access denied|checking your browser)/i

// Errores de red que significan «esta web ya no existe» y no «hoy va lenta».
const CERT = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|EPROTO/i

const limpia = (s) => String(s || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&copy;|&#169;|&#xa9;/gi, '©')
  .replace(/\s+/g, ' ')
  .trim()

/** La web propia, o el nombre de lo que hay en su lugar (Instagram, Facebook…). */
export function noEsWeb(url) {
  let host
  try { host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname } catch { return null }
  for (const [re, nombre] of NO_ES_WEB) if (re.test(host)) return nombre
  return null
}

/** El año del © más reciente que se lee en la página (o null). */
export function anioCopyright(html) {
  const texto = limpia(html)
  let max = null
  // «© 2014», «© 2009-2016», «Copyright 2015», «2016 © Joyería…», «Todos los
  // derechos reservados 2012». Se coge el año más alto que esté pegado a una
  // de esas marcas: un año suelto en el texto puede ser «desde 1952».
  const marcas = /(©|copyright|\(c\)|derechos reservados|all rights reserved)/gi
  for (const m of texto.matchAll(marcas)) {
    const desde = Math.max(0, m.index - 40)
    const trozo = texto.slice(desde, m.index + m[0].length + 60)
    for (const a of trozo.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)) {
      const n = Number(a[1])
      if (max === null || n > max) max = n
    }
  }
  return max
}

/** El generador declarado en <meta name="generator"> (o ''). */
export function generadorDe(html) {
  const m = String(html || '').match(/<meta[^>]+name=["']generator["'][^>]*>/i)
  if (!m) return ''
  const c = m[0].match(/content=["']([^"']{1,120})["']/i)
  return c ? c[1].trim() : ''
}

/**
 * Lo que dice el HTML de la portada. Puro: sin red, para poder probarlo.
 *
 * @param {string} html
 * @param {{ https?: boolean, anioActual: number, ultimaModificacion?: string|null }} ctx
 * @returns {{ puntos: number, motivos: string[], anioCopyright: number|null, generador: string }}
 */
export function puntuaHtml(html, { https = true, anioActual, ultimaModificacion = null }) {
  const h = String(html || '')
  const motivos = []
  let puntos = 0
  const suma = (n, motivo) => { puntos += n; motivos.push(motivo) }

  if (!/<meta[^>]+name=["']?viewport["']?/i.test(h)) suma(3, 'No se adapta al móvil')
  if (/\.swf\b|shockwave-flash|application\/x-shockwave/i.test(h)) suma(3, 'Usa Flash, que ya no funciona en ningún navegador')
  if (/<frameset\b/i.test(h)) suma(3, 'Está hecha con marcos (frames), de los años 2000')
  if (/<marquee\b/i.test(h)) suma(2, 'Tiene textos en movimiento (<marquee>) de los 2000')
  else if (/<font\b[^>]*(face|size|color)=|<center>/i.test(h)) suma(2, 'Maquetación HTML de hace más de 15 años')
  if ((h.match(/\bbgcolor=|<td[^>]+(width|height)=["']?\d/gi) || []).length >= 4) suma(1, 'Diseño hecho con tablas')
  if (!https) suma(2, 'Sin https: el navegador la marca como «no segura»')

  const anio = anioCopyright(h)
  if (anio !== null && anioActual) {
    const edad = anioActual - anio
    if (edad >= 5) suma(2, `El pie dice © ${anio}: lleva años sin tocarse`)
    else if (edad >= 3) suma(1, `El pie dice © ${anio}`)
  }

  const gen = generadorDe(h)
  if (/frontpage|dreamweaver|golive|iweb|netobjects|namo|web ?expression|publisher/i.test(gen)) {
    suma(3, `Hecha con ${gen.split(/\s+/).slice(0, 3).join(' ')}, un programa de hace más de 15 años`)
  } else if (/joomla!?\s*(1\.|2\.5)/i.test(gen)) {
    suma(2, `Hecha con ${gen.split(' - ')[0]}, sin soporte desde hace más de 10 años`)
  } else if (/joomla!?\s*3\./i.test(gen)) {
    suma(1, `Hecha con ${gen.split(' - ')[0]}, sin soporte desde 2023`)
  } else if (/wordpress\s*[1-4]\./i.test(gen)) {
    suma(2, `Hecha con ${gen}, de hace más de 7 años`)
  }

  if (/jquery[-.]?(1\.[0-8])(\.\d+)*(\.min)?\.js|jquery\/(1\.[0-8])(\.\d+)*\//i.test(h)) suma(1, 'Usa librerías de hace más de 10 años')
  if (/<!doctype html public "-\/\/w3c\/\/dtd (x?html 4|xhtml 1)/i.test(h)) suma(1, 'HTML anterior a 2014')

  if (ultimaModificacion && anioActual) {
    const t = Date.parse(ultimaModificacion)
    if (Number.isFinite(t) && anioActual - new Date(t).getUTCFullYear() >= 4) {
      suma(1, `El servidor dice que no cambia desde ${new Date(t).getUTCFullYear()}`)
    }
  }

  return { puntos, motivos, anioCopyright: anio, generador: gen }
}

// Lo que dice de sí misma la web de una cadena o una franquicia. Solo frases
// que un negocio de un solo local no escribe nunca: «tienda» suelta o
// «nuestras oficinas» aparecen en cualquier web pequeña.
const CADENA = [
  /\bfranquicia(s|do|dos)?\b/i,
  /abr(e|ir) (tu|una) (propia )?(tienda|oficina|franquicia|asesor[ií]a|joyer[ií]a)/i,
  /\b(m[aá]s de |m[aá]s de\s)?\d{2,}\s+(tiendas|oficinas|delegaciones|puntos de venta|despachos|sucursales)\b/i,
  /red de (oficinas|tiendas|franquicias|delegaciones|despachos)/i,
  /(buscador|localizador) de (tiendas|oficinas|delegaciones)|store ?locator/i,
  /presentes? en (toda|m[aá]s de \d+ (provincias|ciudades))/i,
]

/** Si la portada dice que es una cadena o una franquicia, la frase que lo dice. */
export function pareceCadena(html) {
  const texto = limpia(html)
  for (const re of CADENA) {
    const m = texto.match(re)
    if (m) return m[0]
  }
  return null
}

/** ¿Es la página de un dominio aparcado, de un hosting vacío o «en construcción»? */
export function esAparcada(html) {
  const texto = limpia(html)
  // Una web de verdad con «en construcción» en un rincón no es una web
  // aparcada: solo cuenta si la página entera es poco más que ese cartel.
  if (texto.length > 2500) return false
  return APARCADO.some(re => re.test(texto))
}

async function traerPortada(url) {
  const ctrl = new AbortController()
  const corta = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetchPublico(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    })
    if (!r) return { error: 'no-publica' }
    const tipo = r.headers.get('content-type') || ''
    const largo = Number(r.headers.get('content-length') || 0)
    let html = ''
    if (/html|text\/plain/i.test(tipo) && largo <= MAX_BYTES) {
      html = await r.text()
      if (html.length > MAX_BYTES) html = html.slice(0, MAX_BYTES)
    }
    return {
      status: r.status,
      url: r.url || url,
      html,
      tipo,
      ultimaModificacion: r.headers.get('last-modified'),
      servidor: `${r.headers.get('server') || ''} ${r.headers.get('cf-ray') ? 'cloudflare' : ''}`,
    }
  } catch (e) {
    const codigo = e?.cause?.code || e?.code || e?.name || ''
    return { error: String(codigo || e?.message || 'error') }
  } finally {
    clearTimeout(corta)
  }
}

/**
 * El diagnóstico de la web de un negocio.
 *
 * estado:
 *   sin_web     → no tiene, o lo que tiene es su Instagram/Facebook/ficha
 *   caida       → tiene dominio pero no carga, está aparcado o caducado
 *   antigua     → carga, pero suma UMBRAL puntos o más
 *   actual      → carga y está razonablemente al día
 *   desconocido → no se ha podido saber (antibots, robots.txt, no es HTML)
 *
 * @param {string} web  la web tal y como la da Google Maps
 * @param {{ anioActual: number }} opciones
 */
export async function diagnosticoWeb(web, { anioActual }) {
  const base = { estado: 'desconocido', puntos: 0, motivos: [], url: web || '', anioCopyright: null, generador: '', cadena: null }
  if (!String(web || '').trim()) return { ...base, estado: 'sin_web', motivos: ['No tiene web'] }

  const red = noEsWeb(web)
  if (red) return { ...base, estado: 'sin_web', motivos: [`No tiene web propia: en Google pone ${red}`] }

  let u
  try { u = new URL(/^https?:\/\//i.test(web) ? web : `http://${web}`) } catch {
    return { ...base, estado: 'sin_web', motivos: ['La web que pone en Google no es una dirección válida'] }
  }

  // El dominio, antes que nada: si ya no resuelve es que lo dejó caducar.
  // fetchPublico no distingue eso de una IP privada (devuelve null en los dos).
  try {
    const dirs = await dns.lookup(u.hostname, { all: true })
    if (!dirs.length) return { ...base, estado: 'caida', motivos: ['El dominio de su web ya no existe'] }
    if (dirs.some(d => esIpPrivada(d.address))) return { ...base, motivos: ['El dominio apunta a una red privada'] }
  } catch (e) {
    const c = e?.code || ''
    if (c === 'ENOTFOUND' || c === 'ENODATA') return { ...base, estado: 'caida', motivos: ['El dominio de su web ya no existe (caducado o mal escrito en Google)'] }
    return base
  }

  const reglas = await reglasRobots(u.origin)
  if (!permitida(u.pathname || '/', reglas)) return { ...base, motivos: ['Su robots.txt no deja entrar'] }

  // Dos intentos: un hosting compartido lento no es una web caída.
  let p = await traerPortada(u.toString())
  if (p.error && !CERT.test(p.error) && p.error !== 'no-publica') p = await traerPortada(u.toString())

  if (p.error) {
    if (CERT.test(p.error)) {
      // El https está mal puesto. Se mira la versión http para puntuar el
      // resto, pero el certificado ya es motivo de sobra para llamar.
      const http = await traerPortada(`http://${u.host}${u.pathname}${u.search}`)
      const extra = http.html ? puntuaHtml(http.html, { https: false, anioActual, ultimaModificacion: http.ultimaModificacion }) : { puntos: 0, motivos: [], anioCopyright: null, generador: '' }
      return {
        ...base, ...extra, url: http.url || u.toString(),
        estado: 'antigua',
        cadena: http.html ? pareceCadena(http.html) : null,
        puntos: extra.puntos + 3,
        motivos: ['El certificado de seguridad está caducado o mal puesto: el navegador avisa de que no es segura', ...extra.motivos.filter(m => !/https/.test(m))],
      }
    }
    if (p.error === 'no-publica') return { ...base, motivos: ['Redirige a una dirección que no es pública'] }
    return { ...base, estado: 'caida', motivos: ['Su web no carga (probado dos veces)'] }
  }

  if (p.status >= 400) {
    if ([401, 403, 429, 503].includes(p.status) && (ANTIBOT.test(p.html) || ANTIBOT.test(p.servidor))) {
      return { ...base, url: p.url, motivos: ['Tiene protección antibots: no se puede mirar'] }
    }
    if (p.status === 403 || p.status === 429) return { ...base, url: p.url, motivos: [`Responde ${p.status}`] }
    return { ...base, url: p.url, estado: 'caida', motivos: [`Su web da error (${p.status})`] }
  }

  if (!p.html) return { ...base, url: p.url, motivos: ['La portada no es una página HTML'] }
  if (esAparcada(p.html)) return { ...base, url: p.url, estado: 'caida', motivos: ['Su dominio está aparcado, suspendido o «en construcción»'] }

  const https = /^https:/i.test(p.url)
  const r = puntuaHtml(p.html, { https, anioActual, ultimaModificacion: p.ultimaModificacion })
  return {
    ...base, ...r, url: p.url,
    estado: r.puntos >= UMBRAL ? 'antigua' : 'actual',
    cadena: pareceCadena(p.html),
  }
}
