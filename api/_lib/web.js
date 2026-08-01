// HELM — buscar y leer páginas de internet.
//
// El chat corre contra un modelo LOCAL sin conexión: sabe escribir, pero no
// sabe nada que no le hayamos contado. Esto es lo que le trae hechos frescos
// para el comando /estudiar.
//
// Buscador: si hay BRAVE_API_KEY se usa su API (limpia, con condiciones de uso
// claras y sin depender de que no cambie el HTML de nadie). Si no la hay, se
// cae al HTML de DuckDuckGo, que no pide clave — suficiente para arrancar, pero
// se puede romper el día que cambien el marcado.

import dns from 'node:dns/promises'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'
// 8 s por página. Parece poco, pero /estudiar abre varias y luego el modelo
// tiene que digerirlas: con el túnel cortando a los 100 s, una web lenta no
// puede comerse el presupuesto de toda la petición.
const TIMEOUT_MS = 8_000

// ── Seguridad: nada de red interna ─────────────────────────────────────────
// El servidor tiene Supabase, Ollama y quién sabe qué más escuchando en local.
// Sin este filtro, un `/estudiar http://localhost:54321/rest/v1/...` convertiría
// el comando en una puerta para leer la base de datos desde el chat.
const esIpPrivada = (ip) =>
  /^(127\.|10\.|169\.254\.|0\.|192\.168\.)/.test(ip)
  || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  || /^(::1|fc|fd|fe80)/i.test(ip)

export async function urlPublica(raw) {
  let u
  try { u = new URL(String(raw)) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (/^\[?(localhost|127\.|::1)/i.test(u.hostname)) return null
  try {
    const dirs = await dns.lookup(u.hostname, { all: true })
    if (!dirs.length || dirs.some(d => esIpPrivada(d.address))) return null
  } catch { return null }
  return u.toString()
}

// ── HTML → texto ───────────────────────────────────────────────────────────
const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–',
  mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', aacute: 'á',
  iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü',
}
export const decodeEntidades = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m)

// Se tiran los bloques que nunca son contenido (menús, pies, formularios) antes
// de quitar etiquetas: si no, el texto sale sepultado en "Inicio Blog Contacto".
export function htmlATexto(html) {
  return decodeEntidades(
    String(html || '')
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

const tituloDe = (html) => decodeEntidades(
  (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim(),
)

/**
 * Descarga una página y devuelve su texto. Nunca lanza: un enlace roto entre
 * cuatro resultados no puede tumbar el comando entero.
 */
export async function leerPagina(url, { maxChars = 6000 } = {}) {
  const seguro = await urlPublica(url)
  if (!seguro) return { url, error: 'URL no válida o apunta a una red privada' }
  try {
    const res = await fetch(seguro, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { url: seguro, error: `HTTP ${res.status}` }
    // Tras los redirects se vuelve a comprobar: una redirección a 127.0.0.1 es
    // el truco de manual para saltarse el filtro de arriba.
    if (res.url && res.url !== seguro && !(await urlPublica(res.url))) {
      return { url: seguro, error: 'La página redirige a una red privada' }
    }
    const tipo = res.headers.get('content-type') || ''
    if (!/text\/html|text\/plain|application\/xhtml/i.test(tipo)) {
      return { url: seguro, error: `No es una página de texto (${tipo.split(';')[0] || 'desconocido'})` }
    }
    const html = await res.text()
    const texto = /text\/plain/i.test(tipo) ? html : htmlATexto(html)
    if (texto.length < 200) return { url: seguro, error: 'La página no tiene texto legible' }
    return {
      url: res.url || seguro,
      title: tituloDe(html) || seguro,
      text: texto.length > maxChars ? texto.slice(0, maxChars) + '\n[…recortado]' : texto,
    }
  } catch (err) {
    return { url: seguro, error: err.name === 'TimeoutError' ? 'La página tardó demasiado' : err.message }
  }
}

// ── Buscador ───────────────────────────────────────────────────────────────

async function buscarBrave(query, max) {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}&country=ES&search_lang=es`,
    {
      headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  )
  if (!res.ok) throw new Error(`Brave ${res.status}`)
  const json = await res.json()
  return (json.web?.results || []).slice(0, max).map(r => ({
    title: r.title, url: r.url, snippet: r.description || '',
  }))
}

async function buscarDuckDuckGo(query, max) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`)
  const html = await res.text()

  const limpia = (s) => decodeEntidades(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  // DDG envuelve los enlaces en su redirector: el destino real viaja en ?uddg=
  const destino = (href) => {
    const m = href.match(/[?&]uddg=([^&]+)/)
    const u = m ? decodeURIComponent(m[1]) : href
    return u.startsWith('//') ? 'https:' + u : u
  }

  const out = []
  const bloques = html.split('result__body').slice(1)
  for (const b of bloques) {
    const a = b.match(/result__a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!a) continue
    const url = destino(a[1])
    if (!/^https?:\/\//.test(url)) continue
    out.push({
      title: limpia(a[2]),
      url,
      snippet: limpia(b.match(/result__snippet[^>]*>([\s\S]*?)<\/a>/)?.[1] || ''),
    })
    if (out.length >= max) break
  }
  return out
}

export const buscadorEnUso = () => (process.env.BRAVE_API_KEY ? 'Brave Search' : 'DuckDuckGo')

export async function buscarWeb(query, { max = 4 } = {}) {
  if (process.env.BRAVE_API_KEY) {
    try { return await buscarBrave(query, max) } catch (err) {
      console.warn('[web] Brave falló, tiro de DuckDuckGo:', err.message)
    }
  }
  return buscarDuckDuckGo(query, max)
}

/**
 * Lo que consume /estudiar: busca, abre las páginas en paralelo y devuelve solo
 * las que traen texto de verdad.
 *
 * Si lo que te pasan ya es una URL, no se busca nada: se lee esa y punto.
 */
export async function investigar(consulta, { paginas = 4, maxChars = 6000 } = {}) {
  const esUrl = /^https?:\/\/\S+$/i.test(consulta.trim())

  const resultados = esUrl
    ? [{ title: consulta.trim(), url: consulta.trim(), snippet: '' }]
    : await buscarWeb(consulta, { max: paginas })

  if (!resultados.length) return { resultados: [], fuentes: [], fallos: [], esUrl }

  const leidas = await Promise.all(
    resultados.slice(0, paginas).map(r => leerPagina(r.url, { maxChars })
      .then(p => ({ ...r, ...p }))),
  )

  return {
    resultados,
    fuentes: leidas.filter(p => p.text),
    fallos: leidas.filter(p => !p.text).map(p => ({ url: p.url, error: p.error })),
    esUrl,
  }
}
