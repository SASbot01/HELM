// HELM — cliente mínimo de Apify para rastrear Instagram (actor instagram-scraper).
// Solo LEE reels públicos con sus cifras; no sigue, no comenta, no publica.
// Necesita APIFY_TOKEN (y opcional APIFY_ACTOR) en el entorno del worker.
const API = 'https://api.apify.com/v2'
const TOKEN = () => process.env.APIFY_TOKEN || ''
const ACTOR = () => (process.env.APIFY_ACTOR || 'apify/instagram-scraper').replace('/', '~')
const DIA = 86_400_000

export const apifyListo = () => Boolean(TOKEN())

// Corre el actor de forma síncrona y devuelve los items del dataset.
async function correActor(input, { timeoutMs = 240_000 } = {}) {
  if (!TOKEN()) throw new Error('Falta APIFY_TOKEN')
  const url = `${API}/acts/${ACTOR()}/run-sync-get-dataset-items?token=${TOKEN()}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: ctrl.signal })
    if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } finally { clearTimeout(t) }
}

const esReel = (it) => String(it.type || '').toLowerCase() === 'video' || ['clips', 'igtv'].includes(String(it.productType || '').toLowerCase())
// «visualizaciones» = reproducciones del reel; videoViewCount como respaldo.
const vistasDe = (it) => Number(it.videoPlayCount) || Number(it.videoViewCount) || 0

function normaliza(it) {
  return {
    url: it.url || (it.shortCode ? `https://www.instagram.com/p/${it.shortCode}/` : null),
    cuenta: it.ownerUsername || null,
    fecha: it.timestamp ? String(it.timestamp).slice(0, 10) : null,
    ts: it.timestamp ? Date.parse(it.timestamp) : 0,
    vistas: vistasDe(it),
    likes: Number(it.likesCount) || 0,
    comentarios: Number(it.commentsCount) || 0,
    duracion: it.videoDuration != null ? Math.round(Number(it.videoDuration)) : null,
    texto: String(it.caption || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    es_ia: Boolean(it.isAiGenerated) || /\bhecho con ia\b|contenido generado con ia|#(ai|aivideo|aigenerated)\b/i.test(String(it.caption || '')),
  }
}

const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b)
  if (!o.length) return 0
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Rastrea los reels recientes de una lista de cuentas de Instagram y devuelve
 * los reels normalizados, cada uno con la mediana de su cuenta y su viralidad
 * relativa (visualizaciones ÷ mediana). Ordenados por visualizaciones.
 * @param {string[]} cuentas usuarios de IG (con o sin @)
 * @param {{dias?:number, porCuenta?:number}} o
 */
export async function rastreaCuentas(cuentas, { dias = 7, porCuenta = 12 } = {}) {
  const limpias = [...new Set((cuentas || []).map(c => String(c || '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean))]
  if (!limpias.length) return []
  const desde = new Date(Date.now() - dias * DIA).toISOString().slice(0, 10)
  const items = await correActor({
    directUrls: limpias.map(u => `https://www.instagram.com/${u}/`),
    resultsType: 'posts', resultsLimit: porCuenta,
    onlyPostsNewerThan: desde, addParentData: false,
  })
  const reels = items.filter(esReel).map(normaliza)
    .filter(r => r.url && r.vistas > 0 && r.ts >= Date.now() - dias * DIA)
  const porCuentaMap = {}
  for (const r of reels) (porCuentaMap[r.cuenta] ||= []).push(r.vistas)
  const medianas = Object.fromEntries(Object.entries(porCuentaMap).map(([c, xs]) => [c, mediana(xs)]))
  return reels
    .map(r => ({ ...r, mediana_cuenta: medianas[r.cuenta] || 0, viralidad: medianas[r.cuenta] ? Math.round((r.vistas / medianas[r.cuenta]) * 10) / 10 : null }))
    .sort((a, b) => b.vistas - a.vistas)
}
