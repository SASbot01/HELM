// HELM — Metricool, solo lectura de métricas de anuncios.
//
// Meta, TikTok y Google Ads agregados por Metricool. No hay ninguna escritura:
// este módulo solo hace GET. Pausar y cambiar presupuestos sigue en
// api/_lib/meta-ads.js.
//
// Auth (doc pública, https://app.metricool.com/resources/apidocs/index.html):
// cabecera X-Mc-Auth = user token, y userId + blogId en la query. El token no
// se manda en la URL. Base: https://app.metricool.com/api
//
// Endpoints que usa la sincronización (swagger público y el catálogo de
// apis.io de Metricool). Un 400 o un 404 de una fuente se salta: no todas las
// marcas tienen las tres redes.
//   GET /datastudio/fbads/ads?start&end                         anuncios Meta
//   GET /datastudio/tiktokads/ads?start&end                     anuncios TikTok
//   GET /v2/advertising/ads?from&to&timezone&providers[]        anuncios
//   GET /stats/facebookads/campaigns?start&end                  campañas Meta (YYYYMMDD)
//   GET /stats/tiktokads/campaigns?start&end                    campañas TikTok
//   GET /stats/adwords/campaigns?start&end                      campañas Google
//   GET /v2/analytics/campaigns/tiktokads?from&to&timezone
//   GET /v2/analytics/campaigns/googleads?from&to&timezone      (catálogo apis.io)
//
// Si la respuesta trae un día por fila (o métricas anidadas por fecha), se
// guarda así. Si trae el total del periodo sin día, se vuelve a pedir día a
// día para no apuntar el total de dos semanas en un solo día.
//
// Configuración, por perfil (nunca en el repositorio):
//   · token y user id: user_integrations.config (service='metricool'), si no
//     agencias.metricool, si no METRICOOL_USER_TOKEN / METRICOOL_USER_ID.
//   · blog id de la marca: config.blog_id, si no METRICOOL_BRANDS
//     ({ "slug-o-id": "blogId" }).
//   · enabled=false en la integración apaga Metricool para ese perfil aunque
//     el entorno tenga token.
export const BASE = 'https://app.metricool.com/api'
export const TABLA = 'helm_metricool_ads'
export const SERVICIO = 'metricool'
export const MAX_DIAS = 31
export const REDES = ['meta', 'tiktok', 'google']

// Para las pruebas: sustituir el fetch sin tocar el global.
export const _http = {
  fetch: (url, opts) => globalThis.fetch(url, opts),
}

const RED_DE = {
  facebook: 'meta', facebookads: 'meta', meta: 'meta', instagram: 'meta', fb: 'meta',
  tiktok: 'tiktok', tiktokads: 'tiktok',
  google: 'google', googleads: 'google', adwords: 'google', gads: 'google',
}

const CAMPOS = {
  gasto: ['spent', 'spend', 'cost', 'gasto', 'amountspent', 'amount_spent'],
  impresiones: ['impressions', 'impresiones'],
  alcance: ['reach', 'alcance'],
  clics: ['clicks', 'clics', 'linkclicks', 'link_clicks', 'inline_link_clicks'],
  ctr: ['ctr', 'gadsctr'],
  cpm: ['cpm', 'averagecpm'],
  cpc: ['cpc', 'averagecpc', 'averagecost'],
  leads: ['leads', 'lead', 'results'],
  conversiones: ['conversions', 'conversion', 'allconversions', 'purchases'],
}

// Anuncios primero. Si una red ya trajo anuncios, no se piden sus campañas:
// sumarían el mismo gasto dos veces.
const FUENTES = [
  { red: 'meta', nivel: 'ad', path: '/datastudio/fbads/ads', params: (d, h) => ({ start: ymd(d), end: ymd(h) }) },
  { red: 'tiktok', nivel: 'ad', path: '/datastudio/tiktokads/ads', params: (d, h) => ({ start: ymd(d), end: ymd(h) }) },
  { red: 'meta', nivel: 'ad', path: '/v2/advertising/ads', params: (d, h) => ({ from: `${d}T00:00:00`, to: `${h}T23:59:59`, timezone: 'Europe/Madrid', 'providers[]': 'facebook' }) },
  { red: 'tiktok', nivel: 'ad', path: '/v2/advertising/ads', params: (d, h) => ({ from: `${d}T00:00:00`, to: `${h}T23:59:59`, timezone: 'Europe/Madrid', 'providers[]': 'tiktok' }) },
  { red: 'google', nivel: 'ad', path: '/v2/advertising/ads', params: (d, h) => ({ from: `${d}T00:00:00`, to: `${h}T23:59:59`, timezone: 'Europe/Madrid', 'providers[]': 'googleads' }) },
  { red: 'meta', nivel: 'campana', path: '/stats/facebookads/campaigns', params: (d, h) => ({ start: ymd(d), end: ymd(h) }) },
  { red: 'tiktok', nivel: 'campana', path: '/stats/tiktokads/campaigns', params: (d, h) => ({ start: ymd(d), end: ymd(h) }) },
  { red: 'google', nivel: 'campana', path: '/stats/adwords/campaigns', params: (d, h) => ({ start: ymd(d), end: ymd(h) }) },
  { red: 'tiktok', nivel: 'campana', path: '/v2/analytics/campaigns/tiktokads', params: (d, h) => ({ from: `${d}T00:00:00`, to: `${h}T23:59:59`, timezone: 'Europe/Madrid' }) },
  { red: 'google', nivel: 'campana', path: '/v2/analytics/campaigns/googleads', params: (d, h) => ({ from: `${d}T00:00:00`, to: `${h}T23:59:59`, timezone: 'Europe/Madrid' }) },
]

const texto = (v) => String(v ?? '').trim()
const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100
const entero = (v) => Math.min(2_000_000_000, Math.max(0, Math.round(Number(v) || 0)))

export function ymd(dia) {
  return String(dia).slice(0, 10).replace(/-/g, '')
}

export function sumaDia(dia, n) {
  const d = new Date(`${String(dia).slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** AAAA-MM-DD, o null. Acepta 20261027, "2026-10-27" y un ISO con hora. */
export function aDia(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return aDia(String(Math.trunc(v)))
  const s = String(v).trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function diasEntre(desde, hasta, tope = 800) {
  const out = []
  let d = aDia(desde)
  const fin = aDia(hasta)
  while (d && fin && d <= fin && out.length < tope) {
    out.push(d)
    d = sumaDia(d, 1)
  }
  return out
}

/** Como mucho MAX_DIAS, los últimos del rango (lo reciente es lo que se juzga). */
export function recortaRango(desde, hasta) {
  const todos = diasEntre(desde, hasta)
  if (!todos.length) return { desde, hasta, avisos: [] }
  if (todos.length <= MAX_DIAS) return { desde: todos[0], hasta: todos[todos.length - 1], avisos: [] }
  const corte = todos.slice(-MAX_DIAS)
  return { desde: corte[0], hasta: corte[corte.length - 1], avisos: [`Metricool: solo se sincronizan los últimos ${MAX_DIAS} días.`] }
}

function num(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function idNumerico(v) {
  const s = texto(v)
  return /^\d{1,18}$/.test(s) ? s : ''
}

function tokenValido(v) {
  const s = texto(v)
  return s.length >= 8 ? s : ''
}

function listaDe(body) {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== 'object') return []
  if (Array.isArray(body.data)) return body.data
  if (body.data && typeof body.data === 'object' && Array.isArray(body.data.items)) return body.data.items
  if (Array.isArray(body.items)) return body.items
  if (Array.isArray(body.campaigns)) return body.campaigns
  if (Array.isArray(body.ads)) return body.ads
  return []
}

function plano(obj) {
  const out = {}
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    const n = num(v)
    if (n == null) continue
    out[k.toLowerCase().replace(/\./g, '')] = n
  }
  return out
}

function toma(p, claves) {
  for (const k of claves) if (p[k] != null) return p[k]
  return null
}

function redDe(row, fija) {
  const p = texto(row?.provider || row?.network || row?.source).toLowerCase()
  return RED_DE[p] || fija || null
}

function filaDe(row, metricas, dia, { red, nivel }) {
  const p = { ...plano(row), ...plano(metricas), ...plano(row?.actions) }
  const adDicho = texto(row.adId || row.ad_id || row.providerAdId)
  const conjunto = texto(row.adGroupId || row.adgroupId || row.adset_id || row.adsetId || row.providerAdgroupId)
  let ad = adDicho
  if (!ad && nivel === 'ad') ad = texto(row.providerId || row.id)
  const campana = texto(row.campaignId || row.campaign_id || row.providerCampaignId || row.campId
    || (!ad && !conjunto ? (row.providerId || row.id) : ''))
  const r = redDe(row, red)
  if (!r || (!campana && !conjunto && !ad)) return null
  const gasto = toma(p, CAMPOS.gasto) ?? 0
  const impresiones = entero(toma(p, CAMPOS.impresiones) ?? 0)
  const clics = entero(toma(p, CAMPOS.clics) ?? 0)
  let ctr = toma(p, CAMPOS.ctr)
  let cpm = toma(p, CAMPOS.cpm)
  let cpc = toma(p, CAMPOS.cpc)
  if (ctr == null && impresiones > 0) ctr = (clics / impresiones) * 100
  if (cpm == null && impresiones > 0) cpm = (gasto / impresiones) * 1000
  if (cpc == null && clics > 0) cpc = gasto / clics
  const leads = toma(p, CAMPOS.leads)
  const conversiones = toma(p, CAMPOS.conversiones)
  const nivelReal = ad ? 'ad' : conjunto ? 'conjunto' : 'campana'
  const f = {
    red: r,
    dia: dia || aDia(row.date) || aDia(row.day) || null,
    nivel: nivelReal,
    campaign_id: campana,
    campaign_nombre: texto(row.campaignName || row.campaign_name || row.campName || (!ad && !conjunto ? row.name : '')) || null,
    adset_id: conjunto,
    adset_nombre: texto(row.adgroupName || row.adGroupName || row.adset_nombre || row.adsetName) || null,
    ad_id: ad,
    ad_nombre: texto(row.adName || row.ad_name || (ad ? row.name : '')) || null,
    gasto: redondea(gasto),
    impresiones,
    alcance: entero(toma(p, CAMPOS.alcance) ?? 0),
    clics,
    ctr: ctr == null ? null : Math.round(ctr * 10000) / 10000,
    cpm: cpm == null ? null : redondea(cpm),
    cpc: cpc == null ? null : Math.round(cpc * 10000) / 10000,
    leads: leads ?? 0,
    conversiones: conversiones ?? 0,
    moneda: texto(row.currency || row.moneda) || null,
  }
  if (!(f.gasto || f.impresiones || f.clics || f.alcance || f.leads || f.conversiones)) return null
  return f
}

function partir(row, opciones) {
  const metrics = row?.metrics
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    const f = filaDe(row, null, null, opciones)
    return f ? [f] : []
  }
  const claves = Object.keys(metrics)
  if (!claves.length) {
    const f = filaDe(row, null, null, opciones)
    return f ? [f] : []
  }
  if (claves.every(k => num(metrics[k]) != null)) {
    const f = filaDe(row, metrics, null, opciones)
    return f ? [f] : []
  }
  if (claves.every(k => aDia(k))) {
    return claves.flatMap(k => {
      const f = filaDe(row, metrics[k], aDia(k), opciones)
      return f ? [f] : []
    })
  }
  const dias = new Set()
  for (const v of Object.values(metrics)) {
    if (v && typeof v === 'object') for (const k of Object.keys(v)) if (aDia(k)) dias.add(aDia(k))
  }
  if (dias.size) {
    return [...dias].flatMap(dia => {
      const m = {}
      for (const [met, serie] of Object.entries(metrics)) {
        if (!serie || typeof serie !== 'object') continue
        for (const [k, val] of Object.entries(serie)) if (aDia(k) === dia) m[met] = val
      }
      const f = filaDe(row, m, dia, opciones)
      return f ? [f] : []
    })
  }
  const f = filaDe(row, null, null, opciones)
  return f ? [f] : []
}

/** La respuesta de Metricool → filas { red, dia, campaign_id, ad_id, gasto, … }. */
export function normaliza(payload, opciones = {}) {
  const lista = Array.isArray(payload) ? payload : listaDe(payload)
  return lista.flatMap(row => (row && typeof row === 'object' ? partir(row, opciones) : []))
}

/** Si un día ya tiene el anuncio, la fila de la campaña (el mismo gasto otra vez) sobra. */
export function sinDoble(filas) {
  const conAnuncio = new Set((filas || []).filter(f => f.ad_id).map(f => `${f.red}|${String(f.dia).slice(0, 10)}|${f.campaign_id}`))
  return (filas || []).filter(f => f.ad_id || !conAnuncio.has(`${f.red}|${String(f.dia).slice(0, 10)}|${f.campaign_id}`))
}

const CERO = () => ({ gasto: 0, impresiones: 0, clics: 0, leads: 0, conversiones: 0, leads_crm: 0, ventas_crm: 0, cobrado_crm: 0 })
function sumaEn(a, f) {
  a.gasto = redondea(a.gasto + (Number(f.gasto) || 0))
  a.impresiones += Number(f.impresiones) || 0
  a.clics += Number(f.clics) || 0
  a.leads = redondea(a.leads + (Number(f.leads) || 0))
  a.conversiones = redondea(a.conversiones + (Number(f.conversiones) || 0))
  a.leads_crm += Number(f.leads_crm) || 0
  a.ventas_crm += Number(f.ventas_crm) || 0
  a.cobrado_crm = redondea(a.cobrado_crm + (Number(f.cobrado_crm) || 0))
  return a
}

/** Totales de la ventana. No suma la campaña si ese día ya están sus anuncios. */
export function resumenDe(filas) {
  const porRed = {}
  const total = CERO()
  for (const f of sinDoble(filas)) {
    sumaEn(total, f)
    porRed[f.red] = sumaEn(porRed[f.red] || CERO(), f)
  }
  return { ...total, por_red: porRed }
}

/**
 * Gasto de Metricool de un anuncio del test de 5 días. Casa el utm con el id
 * del anuncio y, si no, con el de la campaña. null si no hay ninguna fila:
 * quien llama sigue con el gasto apuntado a mano.
 */
export function gastoDeAnuncio(ad, filas, { dias = 5 } = {}) {
  const utm = texto(ad?.utm).toLowerCase()
  const ini = String(ad?.publicado_en ?? '').slice(0, 10)
  if (!utm || !/^\d{4}-\d{2}-\d{2}$/.test(ini)) return null
  const fin = sumaDia(ini, dias)
  const dentro = (filas || []).filter(f => {
    const dia = String(f.dia ?? '').slice(0, 10)
    if (dia < ini || dia >= fin) return false
    const ids = [f.ad_id, f.campaign_id, f.adset_id].map(x => texto(x).toLowerCase()).filter(Boolean)
    return ids.includes(utm)
  })
  const deAnuncio = dentro.filter(f => texto(f.ad_id).toLowerCase() === utm)
  const lista = deAnuncio.length ? deAnuncio : dentro.filter(f => !texto(f.ad_id))
  if (!lista.length) return null
  return redondea(lista.reduce((t, f) => t + (Number(f.gasto) || 0), 0))
}

/** La fila guardada, en la forma que ya entiende el media buyer (insights de Meta). */
export function comoInsight(f) {
  const leads = Number(f.leads) || 0
  const conv = Number(f.conversiones) || 0
  return {
    dia: String(f.dia).slice(0, 10),
    ad_id: String(f.ad_id),
    ad_nombre: f.ad_nombre || null,
    adset_id: f.adset_id || null,
    adset_nombre: f.adset_nombre || null,
    campaign_id: f.campaign_id || null,
    campaign_nombre: f.campaign_nombre || null,
    gasto: redondea(f.gasto),
    impresiones: entero(f.impresiones),
    alcance: entero(f.alcance),
    frecuencia: null,
    clics: entero(f.clics),
    clics_enlace: entero(f.clics),
    ctr: f.ctr == null ? null : Number(f.ctr),
    leads_meta: Math.round(leads || conv),
    compras_meta: Math.round(conv),
  }
}

function marcasEntorno() {
  const raw = process.env.METRICOOL_BRANDS
  if (!raw || !texto(raw)) return {}
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    return o
  } catch {
    return {}
  }
}

async function credencialAgencia(db, clientId) {
  try {
    const { data: c, error } = await db.from('clients').select('agencia_id, slug').eq('id', clientId).maybeSingle()
    if (error || !c) return {}
    if (!c.agencia_id) return { slug: c.slug || '' }
    const { data: a, error: e2 } = await db.from('agencias').select('metricool').eq('id', c.agencia_id).maybeSingle()
    if (e2 || !a?.metricool || typeof a.metricool !== 'object') return { slug: c.slug || '' }
    return {
      slug: c.slug || '',
      token: tokenValido(a.metricool.user_token || a.metricool.token),
      userId: idNumerico(a.metricool.user_id || a.metricool.userId),
    }
  } catch {
    return {}
  }
}

/**
 * Token, user id y blog id del perfil, o null si falta algo (el llamador
 * sigue como si Metricool no existiera). No registra el token.
 */
export async function configDe(db, clientId, { slug } = {}) {
  if (!clientId || !db) return null
  const { data, error } = await db.from('user_integrations')
    .select('config, enabled, member_id')
    .eq('client_id', clientId)
    .eq('service', SERVICIO)
  if (error) {
    const e = new Error(error.message || 'No se pudo leer la configuración de Metricool')
    e.code = error.code
    throw e
  }
  const rows = Array.isArray(data) ? data : []
  const row = rows.find(r => r.member_id == null) || null
  if (row && row.enabled === false) return null
  const cfg = (row?.config && typeof row.config === 'object') ? row.config : {}
  let blogId = idNumerico(cfg.blog_id || cfg.blogId)
  let token = tokenValido(cfg.user_token || cfg.token)
  let userId = idNumerico(cfg.user_id || cfg.userId)
  let origenToken = token ? 'perfil' : ''
  let origenBlog = blogId ? 'perfil' : ''
  if (!token) {
    token = tokenValido(process.env.METRICOOL_USER_TOKEN)
    if (token) origenToken = 'entorno'
  }
  if (!userId) userId = idNumerico(process.env.METRICOOL_USER_ID)
  const brands = marcasEntorno()
  const falta = !blogId || !token || !userId
  if (falta && (Object.keys(brands).length || !token || !userId)) {
    // Sin blog en la ficha, el mapa del entorno necesita el slug. Sin token,
    // puede vivir en la agencia. Si no hay nada de eso, no se pregunta.
    const haceFaltaMirar = (!blogId && Object.keys(brands).length) || ((blogId || Object.keys(brands).length) && (!token || !userId))
    if (haceFaltaMirar) {
      const ag = await credencialAgencia(db, clientId)
      const s = slug || ag.slug || ''
      if (!blogId) {
        blogId = idNumerico(brands[clientId] || brands[s])
        if (blogId) origenBlog = 'entorno'
      }
      if (!token && ag.token) { token = ag.token; origenToken = 'agencia' }
      if (!userId && ag.userId) userId = ag.userId
    }
  }
  if (!token || !userId || !blogId) return null
  return { token, userId, blogId, origenToken, origenBlog }
}

async function pedir(path, { token, userId, blogId, params = {} }) {
  const url = new URL(BASE + path)
  url.searchParams.set('userId', String(userId))
  if (blogId) url.searchParams.set('blogId', String(blogId))
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) for (const x of v) url.searchParams.append(k, String(x))
    else url.searchParams.set(k, String(v))
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  let r
  try {
    r = await _http.fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { 'X-Mc-Auth': token, Accept: 'application/json' },
    })
  } catch (e) {
    const err = new Error(e?.name === 'AbortError' ? 'Metricool no contesta.' : `No se ha podido hablar con Metricool: ${texto(e?.message || e).slice(0, 180)}`)
    throw err
  } finally {
    clearTimeout(t)
  }
  const crudo = typeof r.text === 'function' ? await r.text() : ''
  const cuerpo = crudo.replaceAll(token, '…')
  if (r.status === 401 || r.status === 403) {
    const err = new Error('Metricool ha rechazado el token (cabecera X-Mc-Auth) o esa marca no está en la cuenta.')
    err.auth = true
    throw err
  }
  if (r.status === 429 || r.status >= 500) {
    throw new Error(`Metricool respondió ${r.status} en ${path}.`)
  }
  if (!r.ok) return { ausente: true, filas: [] }
  let body = null
  if (cuerpo) {
    try { body = JSON.parse(cuerpo) } catch { body = null }
  }
  return { ausente: false, filas: listaDe(body) }
}

async function traeFuente(cfg, fuente, desde, hasta, avisos) {
  const lee = async (d0, d1) => {
    try {
      return await pedir(fuente.path, { token: cfg.token, userId: cfg.userId, blogId: cfg.blogId, params: fuente.params(d0, d1) })
    } catch (e) {
      if (e.auth) throw e
      avisos.push(`${fuente.red} ${fuente.path}: ${e.message}`)
      return { ausente: true, filas: [] }
    }
  }
  const primero = await lee(desde, hasta)
  if (primero.ausente) return []
  const filas = normaliza(primero.filas, { red: fuente.red, nivel: fuente.nivel })
  if (!filas.length) return []
  if (desde === hasta) return filas.map(f => ({ ...f, dia: desde }))
  const dias = new Set(filas.map(f => f.dia).filter(Boolean))
  if (filas.every(f => f.dia) && dias.size > 1) return filas.filter(f => f.dia >= desde && f.dia <= hasta)
  const out = []
  for (const dia of diasEntre(desde, hasta).filter(d => d >= desde && d <= hasta).slice(-MAX_DIAS)) {
    const uno = await lee(dia, dia)
    if (uno.ausente) continue
    for (const f of normaliza(uno.filas, { red: fuente.red, nivel: fuente.nivel })) out.push({ ...f, dia })
  }
  // Si cada día vuelve el mismo total, la fuente no parte por días: guardarlo
  // catorce veces multiplicaría el gasto. Se deja una sola fila, en el último día.
  const porDia = new Map()
  for (const f of out) {
    const lista = porDia.get(f.dia) || []
    lista.push(`${f.campaign_id}|${f.adset_id}|${f.ad_id}|${f.gasto}|${f.impresiones}|${f.clics}`)
    porDia.set(f.dia, lista)
  }
  const firmas = [...porDia.values()].map(xs => xs.sort().join(';'))
  if (porDia.size >= 3 && firmas.every(f => f && f === firmas[0])) {
    avisos.push(`${fuente.red} ${fuente.path}: repite el mismo total cada día; se guarda una vez, el ${hasta}.`)
    return out.filter(f => f.dia === hasta)
  }
  return out
}

function claveFila(f) {
  return [f.red, f.dia, f.campaign_id, f.adset_id, f.ad_id].join('\u0001')
}

function combina(a, b) {
  const sa = (Number(a.impresiones) || 0) + (Number(a.gasto) || 0)
  const sb = (Number(b.impresiones) || 0) + (Number(b.gasto) || 0)
  return sb > sa ? b : a
}

function trozos(lista, n) {
  const out = []
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n))
  return out
}

function aGuardar(f, { clientId, blogId, crm, en }) {
  const c = crm.get(`${f.ad_id || f.campaign_id}|${f.dia}`) || { leads: 0, ventas: 0, cobrado: 0 }
  return {
    client_id: clientId,
    blog_id: blogId,
    red: f.red,
    dia: f.dia,
    nivel: f.nivel,
    campaign_id: f.campaign_id || '',
    campaign_nombre: f.campaign_nombre,
    adset_id: f.adset_id || '',
    adset_nombre: f.adset_nombre,
    ad_id: f.ad_id || '',
    ad_nombre: f.ad_nombre,
    gasto: f.gasto,
    impresiones: f.impresiones,
    alcance: f.alcance,
    clics: f.clics,
    ctr: f.ctr,
    cpm: f.cpm,
    cpc: f.cpc,
    leads: f.leads,
    conversiones: f.conversiones,
    moneda: f.moneda,
    leads_crm: c.leads || 0,
    ventas_crm: c.ventas || 0,
    cobrado_crm: c.cobrado || 0,
    actualizado_en: en,
  }
}

/**
 * Trae el rango y lo guarda (upsert). Cruza con el CRM por el id del anuncio.
 * → { filas, avisos, desde, hasta }.
 */
export async function sincronizaPerfil({ db, clientId, desde, hasta, cfg, zona = 'Europe/Madrid' }) {
  if (!db) db = (await import('../lib/supabase.js')).supabase
  if (!cfg?.token || !cfg.userId || !cfg.blogId) throw new Error('Metricool no está configurado para este perfil.')
  const rango = recortaRango(desde, hasta)
  const avisos = [...rango.avisos]
  const crudas = []
  const conAnuncio = new Set()
  const conCampana = new Set()
  for (const fuente of FUENTES) {
    if (fuente.nivel === 'ad' && conAnuncio.has(fuente.red)) continue
    if (fuente.nivel === 'campana' && (conAnuncio.has(fuente.red) || conCampana.has(fuente.red))) continue
    const filas = await traeFuente(cfg, fuente, rango.desde, rango.hasta, avisos)
    if (fuente.nivel === 'ad' && filas.some(f => f.ad_id)) conAnuncio.add(fuente.red)
    if (fuente.nivel === 'campana' && filas.length) conCampana.add(fuente.red)
    crudas.push(...filas)
  }
  const mapa = new Map()
  for (const f of sinDoble(crudas).filter(f => f.dia)) {
    const k = claveFila(f)
    mapa.set(k, mapa.has(k) ? combina(mapa.get(k), f) : f)
  }
  const base = [...mapa.values()]
  let crm = new Map()
  const ids = [...new Set(base.flatMap(f => [f.ad_id, f.ad_id ? '' : f.campaign_id]).filter(Boolean))]
  if (ids.length) {
    try {
      const { crmPorAnuncio } = await import('./departamentos/media-buyer.js')
      crm = await crmPorAnuncio(clientId, ids, { desde: rango.desde, hasta: rango.hasta, zona, db })
    } catch (e) {
      avisos.push(`No se ha podido cruzar con el CRM: ${e?.message || e}`)
    }
  }
  const en = new Date().toISOString()
  const filas = base.map(f => aGuardar(f, { clientId, blogId: cfg.blogId, crm, en }))
  for (const grupo of trozos(filas, 400)) {
    const { error } = await db.from(TABLA).upsert(grupo, { onConflict: 'client_id,blog_id,red,dia,campaign_id,adset_id,ad_id' })
    if (error) {
      const e = new Error(error.message || 'No se pudo guardar las métricas de Metricool')
      e.code = error.code
      throw e
    }
  }
  return { filas, avisos, desde: rango.desde, hasta: rango.hasta }
}

/** Lo ya guardado de un perfil, en [desde, hasta]. */
export async function filasGuardadas(db, clientId, { desde, hasta, red } = {}) {
  let q = db.from(TABLA).select('*').eq('client_id', clientId)
  if (desde) q = q.gte('dia', desde)
  if (hasta) q = q.lt('dia', sumaDia(hasta, 1))
  if (red) q = q.eq('red', red)
  const { data, error } = await q
  if (error) {
    const e = new Error(error.message || 'No se pudo leer las métricas de Metricool')
    e.code = error.code
    throw e
  }
  return data || []
}

/** Marcas de la cuenta (blogId). Sirve para rellenar el mapa perfil → marca. */
export async function marcas({ token, userId, blogId }) {
  const r = await pedir('/admin/simpleProfiles', { token, userId, blogId: blogId || userId, params: {} })
  return r.filas
}
