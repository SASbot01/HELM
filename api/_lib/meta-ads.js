// HELM — Meta Ads: el ÚNICO sitio de HELM que habla con la Marketing API de
// Meta (v26.0), sin SDK, como instagram.js.
//
// «Claude decide, el código manda y Meta pone el techo»: el Media buyer
// (departamentos/media-buyer.js) decide con reglas y PROPONE; lo que toca Meta
// pasa por aquí, y aquí están los frenos:
//   · los topes de cada cuenta (helm_ads_cuentas, migración 117), que solo pone
//     quien administra la agencia (api/meta-ads.js);
//   · una subida es como mucho del +20 %, solo en lo que ha salido del
//     aprendizaje (learning_stage_info = SUCCESS) y como mucho una cada 72 h
//     por conjunto (o campaña con presupuesto de campaña);
//   · antes de cambiar se vuelve a leer el valor ACTUAL en Meta: si no es el
//     «antes» que se propuso, no se hace (planPresupuesto);
//   · cada acción deja una fila 'intento' en helm_ads_acciones ANTES de llamar
//     a Meta (si no se puede escribir, no se llama) y otra con lo que contestó.
//
// La conexión: un token de USUARIO DEL SISTEMA (Business Manager → Usuarios del
// sistema, rol Empleado) con ads_read, ads_management y business_management.
// El de Instagram Login NO sirve: esa API no toca anuncios. Vive en
// user_integrations (service='meta_ads'), con RLS negando al navegador, igual
// que el de Instagram. Si el servidor tiene META_APP_SECRET, cada llamada va
// con appsecret_proof.
//
// Reintentos: los fallos de red, los 5xx y los errores transitorios de Meta se
// reintentan (hasta 3 veces, con espera creciente). Los límites de uso
// (#4, #17, #613, #80000-80014) se reintentan solo si Meta no pide esperar
// minutos. Reintentar un POST no duplica nada: poner un presupuesto o un estado
// es poner un valor, no sumarlo.
import crypto from 'node:crypto'
import { supabase } from '../lib/supabase.js'
import { maskToken } from './instagram.js'

export const VERSION = 'v26.0'
const API = 'https://graph.facebook.com'
const TIMEOUT_MS = 30_000
export const SERVICIO = 'meta_ads'
export const PERMISOS = ['ads_read', 'ads_management', 'business_management']

export const SUBIDA_MAX_PCT = 20
export const HORAS_ENTRE_SUBIDAS = 72
// Meta puede gastar en un día más que el presupuesto diario (hasta un 75 %
// según una de sus páginas): el tope duro por defecto es el peor caso.
export const FACTOR_TOPE_DURO = 1.75
// El presupuesto diario más bajo que se deja poner (en la moneda de la cuenta).
export const MINIMO_DIARIO = 1

export const ACCIONES = 'helm_ads_acciones'
export const CUENTAS = 'helm_ads_cuentas'
export const PARADAS = 'helm_ads_paradas'

export { maskToken }

// ── Errores ─────────────────────────────────────────────────────────────────

export class MetaError extends Error {
  constructor(message, { statusCode = 502, code = null, subcode = null, reintentable = false, caducado = false, limite = false, esperaMin = 0 } = {}) {
    super(message)
    Object.assign(this, { statusCode, code, subcode, reintentable, caducado, limite, esperaMin })
  }
}

/** Algo que, tal y como está pedido, no se hace (lo cuenta tal cual el bot o el panel). */
export function noSePuede(mensaje) {
  return new MetaError(mensaje, { statusCode: 400 })
}

const LIMITES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014])
const recorta = (t, n = 400) => {
  const s = String(t ?? '').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** La respuesta de error de Meta → un MetaError con un mensaje que se entiende. */
export function traduceError(status, err = {}, uso = {}) {
  const code = Number(err.code) || null
  const subcode = Number(err.error_subcode) || null
  const original = recorta(err.error_user_msg || err.message || `Error ${status}`)
  const base = { code, subcode, esperaMin: uso.esperaMin || 0 }
  if (code === 190 || code === 102 || status === 401) {
    return new MetaError('La conexión con Meta Ads ha caducado o se ha revocado. Genera un token nuevo del usuario del sistema y vuelve a conectarla en HELM → Ads.', { ...base, statusCode: 401, caducado: true })
  }
  if (LIMITES.has(code) || status === 429) {
    const espera = uso.esperaMin ? ` Meta pide esperar unos ${uso.esperaMin} min.` : ''
    return new MetaError(`Meta pide bajar el ritmo (límite de uso de la API).${espera} (${original})`, { ...base, statusCode: 429, limite: true })
  }
  if (code === 2635) {
    return new MetaError(`Meta ya no admite la versión ${VERSION} de la API: hay que actualizarla en api/_lib/meta-ads.js.`, { ...base, statusCode: 400 })
  }
  if (code === 10 || code === 3 || (code >= 200 && code <= 299)) {
    return new MetaError(`Al token de Meta le falta permiso para esto (ads_read / ads_management) o no tiene asignada esa cuenta. Meta dice: ${original}`, { ...base, statusCode: 403 })
  }
  if (code === 368) return new MetaError(`Meta ha bloqueado la acción por sus políticas: ${original}`, { ...base, statusCode: 403 })
  if (code === 100 && subcode === 33) return new MetaError('Eso no existe en Meta o el token no lo ve.', { ...base, statusCode: 404 })
  if (code === 1 || code === 2 || err.is_transient === true || status >= 500) {
    return new MetaError(`Meta no responde bien ahora mismo: ${original}`, { ...base, statusCode: 502, reintentable: true })
  }
  return new MetaError(`Meta dice: ${original}`, { ...base, statusCode: status >= 400 && status < 500 ? status : 400 })
}

// ── Uso de la API (las cabeceras de Meta) ───────────────────────────────────

/** Lo último que dijo Meta de cuánto llevamos gastado de su cupo. */
export const ultimoUso = { pct: 0, esperaMin: 0, nivel: null, en: null }

/** Las cabeceras de uso → { pct (lo más alto), esperaMin, nivel (ads_api_access_tier) }. */
export function usoDe(headers) {
  const lee = (n) => {
    try { return JSON.parse(headers?.get?.(n) || 'null') } catch { return null }
  }
  const buc = lee('x-business-use-case-usage')
  const cuenta = lee('x-ad-account-usage')
  const app = lee('x-app-usage')
  let pct = 0
  let esperaMin = 0
  const sube = (...v) => { for (const x of v) if (Number.isFinite(Number(x))) pct = Math.max(pct, Number(x)) }
  for (const lista of Object.values(buc && typeof buc === 'object' ? buc : {})) {
    for (const u of Array.isArray(lista) ? lista : []) {
      sube(u?.call_count, u?.total_cputime, u?.total_time)
      esperaMin = Math.max(esperaMin, Number(u?.estimated_time_to_regain_access) || 0)
    }
  }
  if (cuenta) sube(cuenta.acc_id_util_pct)
  if (app) sube(app.call_count, app.total_cputime, app.total_time)
  return { pct, esperaMin, nivel: cuenta?.ads_api_access_tier || null }
}

// ── Las llamadas ────────────────────────────────────────────────────────────

/** Para los tests: la espera entre reintentos. */
export const _espera = { ms: (n) => new Promise(r => setTimeout(r, n)) }

const appsecretProof = (token) => (process.env.META_APP_SECRET
  ? crypto.createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex')
  : null)

async function unaVez(url, metodo, cuerpo) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let r
  try {
    r = await fetch(url, {
      method: metodo,
      signal: ctrl.signal,
      ...(cuerpo ? { body: cuerpo.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {}),
    })
  } catch (e) {
    throw new MetaError(e?.name === 'AbortError' ? 'Meta no contesta (se ha agotado el tiempo).' : `No se ha podido hablar con Meta: ${recorta(e?.message || e, 200)}`, { statusCode: 502, reintentable: true })
  } finally {
    clearTimeout(t)
  }
  const uso = usoDe(r.headers)
  Object.assign(ultimoUso, uso, { en: new Date().toISOString() })
  const data = await r.json().catch(() => null)
  if (!r.ok || data?.error) throw traduceError(r.status, data?.error || {}, uso)
  if (data == null) throw new MetaError('Meta ha contestado algo que no se entiende.', { statusCode: 502, reintentable: true })
  return data
}

/**
 * Una llamada a la Graph API. `params` van en la URL (GET) o en el cuerpo
 * (POST); los objetos se mandan como JSON. El token nunca sale en un mensaje.
 */
export async function pedir(ruta, { token, metodo = 'GET', params = {}, intentos = 3 } = {}) {
  if (!token) throw new MetaError('Este perfil no tiene Meta Ads conectado.', { statusCode: 400 })
  const todo = { ...params, access_token: token }
  const prueba = appsecretProof(token)
  if (prueba) todo.appsecret_proof = prueba
  const cuerpo = new URLSearchParams(Object.entries(todo)
    .filter(([, v]) => v != null)
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]))
  const url = metodo === 'GET' ? `${API}/${VERSION}/${ruta}?${cuerpo}` : `${API}/${VERSION}/${ruta}`
  for (let i = 1; ; i++) {
    try {
      return await unaVez(url, metodo, metodo === 'GET' ? null : cuerpo)
    } catch (e) {
      const otraVez = i < intentos && (e.reintentable || (e.limite && !(e.esperaMin > 1)))
      if (!otraVez) throw e
      await _espera.ms(e.limite ? 2000 * i : 400 * 2 ** (i - 1))
    }
  }
}

/** Una lista con todas sus páginas (por el cursor `after`), hasta `paginas`. */
async function todas(ruta, { token, params = {}, paginas = 20 }) {
  const filas = []
  let after = null
  for (let p = 0; p < paginas; p++) {
    const r = await pedir(ruta, { token, params: { ...params, ...(after ? { after } : {}) } })
    filas.push(...(Array.isArray(r?.data) ? r.data : []))
    after = r?.paging?.next ? r?.paging?.cursors?.after || null : null
    if (!after) break
  }
  return filas
}

// ── Ids, dinero y días ──────────────────────────────────────────────────────

/** '123', 'act_123' → 'act_123'; lo que no sea una cuenta → null. */
export function normalizaCuenta(v) {
  const s = String(v ?? '').trim().replace(/^act_/i, '')
  return /^\d{3,25}$/.test(s) ? `act_${s}` : null
}
export const esIdMeta = (v) => /^\d{3,25}$/.test(String(v ?? ''))

// Meta da los presupuestos en la unidad mínima de la moneda (céntimos en euros);
// estas monedas no tienen decimales para Meta.
const SIN_DECIMALES = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])
export const factorMoneda = (m) => (SIN_DECIMALES.has(String(m || 'EUR').toUpperCase()) ? 1 : 100)
export const aMinimos = (valor, moneda) => Math.round(Number(valor) * factorMoneda(moneda))
export const deMinimos = (n, moneda) => (n == null || n === '' ? null : Number(n) / factorMoneda(moneda))
export const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100

const fmtNum = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
/** 48 → «48 €», 1.85 → «1,85 €». */
export const dinero = (n, moneda = 'EUR') => `${fmtNum.format(redondea(n))} ${String(moneda || 'EUR').toUpperCase() === 'EUR' ? '€' : moneda}`
export const porcentaje = (n) => `${fmtNum.format(Math.round(Number(n) * 10) / 10)} %`

const fmtDias = new Map()
/** El día (AAAA-MM-DD) en la zona horaria de la cuenta. */
export function diaEn(zona = 'Europe/Madrid', d = new Date()) {
  let f = fmtDias.get(zona)
  if (!f) {
    const opciones = { year: 'numeric', month: '2-digit', day: '2-digit' }
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'Europe/Madrid', ...opciones }) } catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', ...opciones }) }
    fmtDias.set(zona, f)
  }
  return f.format(d)
}
export function masDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Los días que quedan del mes, contando el de hoy (2026-10-28 → 4). */
export function diasQuedanMes(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1
}

// ── Lo que se lee de Meta ───────────────────────────────────────────────────

const CAMPOS_CUENTA = 'id,account_id,name,currency,timezone_name,account_status,spend_cap,amount_spent'
const CAMPOS_CAMPANA = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time'
const CAMPOS_CONJUNTO = 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,learning_stage_info,created_time,updated_time'
const CAMPOS_ANUNCIO = 'id,name,status,effective_status,adset_id,campaign_id,created_time'
const CAMPOS_INSIGHTS = 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,actions'
// Los campos de cada tipo llevan alguno que solo tiene ese tipo: si el id es
// de otra cosa (un anuncio pasado como conjunto), Meta da error y no se toca.
const CAMPOS_OBJETO = {
  ad: `${CAMPOS_ANUNCIO},account_id`,
  adset: `${CAMPOS_CONJUNTO},account_id`,
  campaign: `${CAMPOS_CAMPANA},account_id`,
}
export const TIPOS = Object.keys(CAMPOS_OBJETO)
export const NOMBRE_TIPO = { ad: 'el anuncio', adset: 'el conjunto', campaign: 'la campaña' }

/** Quién es el token (el usuario del sistema). */
export const yo = (token) => pedir('me', { token, params: { fields: 'id,name' } })
/** Las cuentas publicitarias que ve el token. */
export const cuentasDelToken = (token) => todas('me/adaccounts', { token, params: { fields: CAMPOS_CUENTA, limit: 100 } })
export const leerCuenta = (token, cuentaId) => pedir(cuentaId, { token, params: { fields: CAMPOS_CUENTA } })
export const campanas = (token, cuentaId) => todas(`${cuentaId}/campaigns`, { token, params: { fields: CAMPOS_CAMPANA, limit: 200 } })
/** Los conjuntos de anuncios con su presupuesto y su estado de aprendizaje. */
export const conjuntos = (token, cuentaId) => todas(`${cuentaId}/adsets`, { token, params: { fields: CAMPOS_CONJUNTO, limit: 200 } })
export const conjuntosDeCampana = (token, campanaId) => todas(`${campanaId}/adsets`, { token, params: { fields: CAMPOS_CONJUNTO, limit: 200 } })
export const anuncios = (token, cuentaId) => todas(`${cuentaId}/ads`, { token, params: { fields: CAMPOS_ANUNCIO, limit: 500 } })

/** Un anuncio, conjunto o campaña, con los campos de su tipo y su cuenta. */
export async function leerObjeto(token, id, tipo) {
  if (!CAMPOS_OBJETO[tipo]) throw noSePuede(`tipo: «${tipo}» no vale (ad, adset o campaign).`)
  if (!esIdMeta(id)) throw noSePuede(`«${id}» no es un id de Meta.`)
  return pedir(id, { token, params: { fields: CAMPOS_OBJETO[tipo] } })
}

const LEADS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']
const COMPRAS = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
function cuentaAcciones(actions, tipos) {
  for (const t of tipos) {
    const a = (Array.isArray(actions) ? actions : []).find(x => x?.action_type === t)
    if (a) return Number(a.value) || 0
  }
  return 0
}
const num = (v) => (v == null || v === '' ? null : Number(v))

/** Una fila de insights de Meta → la forma de helm_ads_metricas (sin el CRM). */
export function normalizaInsight(r) {
  return {
    dia: r.date_start,
    ad_id: String(r.ad_id),
    ad_nombre: r.ad_name || null,
    adset_id: r.adset_id ? String(r.adset_id) : null,
    adset_nombre: r.adset_name || null,
    campaign_id: r.campaign_id ? String(r.campaign_id) : null,
    campaign_nombre: r.campaign_name || null,
    gasto: redondea(num(r.spend) || 0),
    impresiones: Math.round(num(r.impressions) || 0),
    alcance: Math.round(num(r.reach) || 0),
    frecuencia: num(r.frequency),
    clics: Math.round(num(r.clicks) || 0),
    clics_enlace: Math.round(num(r.inline_link_clicks) || 0),
    // El CTR de enlace (clics en el enlace / impresiones), en %; si no, el general.
    ctr: num(r.inline_link_click_ctr) ?? num(r.ctr),
    leads_meta: Math.round(cuentaAcciones(r.actions, LEADS)),
    compras_meta: Math.round(cuentaAcciones(r.actions, COMPRAS)),
  }
}

/** Insights por anuncio y día entre dos fechas (incluidas), en la zona de la cuenta. */
export async function insightsPorAnuncioDia(token, cuentaId, { desde, hasta }) {
  const filas = await todas(`${cuentaId}/insights`, {
    token,
    params: { level: 'ad', time_increment: 1, time_range: { since: desde, until: hasta }, fields: CAMPOS_INSIGHTS, limit: 500 },
  })
  return filas.filter(r => r?.ad_id && r?.date_start).map(normalizaInsight)
}

/**
 * Insights por anuncio de un periodo entero (sin partir por días): la
 * frecuencia de 7 días no es la suma de las de cada día, hay que pedirla así.
 */
export async function insightsPorAnuncio(token, cuentaId, { desde, hasta }) {
  const filas = await todas(`${cuentaId}/insights`, {
    token,
    params: { level: 'ad', time_range: { since: desde, until: hasta }, fields: CAMPOS_INSIGHTS, limit: 500 },
  })
  return filas.filter(r => r?.ad_id).map(normalizaInsight)
}

/** Lo gastado en la cuenta: 'today' (hoy), 'this_month' (el mes)… en su moneda. */
export async function gastoDe(token, cuentaId, preset = 'today') {
  const r = await pedir(`${cuentaId}/insights`, { token, params: { level: 'account', date_preset: preset, fields: 'spend' } })
  return redondea((Array.isArray(r?.data) ? r.data : []).reduce((t, x) => t + (Number(x?.spend) || 0), 0))
}

// ── Lo que se escribe en Meta (solo desde los planes de abajo) ──────────────

/** Pone el presupuesto diario (en la unidad mínima de la moneda: céntimos). */
export async function cambiarPresupuestoDiario(token, id, minimos) {
  if (!esIdMeta(id)) throw noSePuede(`«${id}» no es un id de Meta.`)
  if (!Number.isInteger(minimos) || minimos <= 0) throw noSePuede('Ese presupuesto no vale.')
  return pedir(id, { token, metodo: 'POST', params: { daily_budget: String(minimos) } })
}

/** Pausa (PAUSED) o activa (ACTIVE) un anuncio, conjunto o campaña. Nada más. */
export async function cambiarEstado(token, id, estado) {
  if (!esIdMeta(id)) throw noSePuede(`«${id}» no es un id de Meta.`)
  if (estado !== 'PAUSED' && estado !== 'ACTIVE') throw noSePuede('Solo se puede pausar o activar.')
  return pedir(id, { token, metodo: 'POST', params: { status: estado } })
}

// ── La conexión por perfil (user_integrations, service='meta_ads') ─────────
// config = { token, usuario: { id, name }, cuentas: ['act_…'], conectado_en, conectado_por }

export async function getMetaConfig(db, clientId) {
  const { data, error } = await db.from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', SERVICIO)
    .is('member_id', null)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function saveMetaConfig(db, clientId, config, enabled = true) {
  const existente = await getMetaConfig(db, clientId)
  const fila = { client_id: clientId, service: SERVICIO, config, enabled, updated_at: new Date().toISOString() }
  if (existente) {
    const { error } = await db.from('user_integrations').update(fila).eq('id', existente.id)
    if (error) throw error
    return { ...existente, ...fila }
  }
  const { data, error } = await db.from('user_integrations').insert(fila).select().single()
  if (error) throw error
  return data
}

/** El token de Meta Ads del perfil, o un 400 claro si no lo tiene. */
export async function tokenDe(clientId, db = supabase) {
  const fila = await getMetaConfig(db, clientId)
  const cfg = fila?.enabled === false ? {} : fila?.config || {}
  if (!cfg.token) throw new MetaError('Este perfil no tiene Meta Ads conectado (HELM → Ads → Conectar).', { statusCode: 400 })
  return { token: cfg.token, config: cfg }
}

// ── El registro (helm_ads_acciones: solo se añade) ─────────────────────────

/** Apunta el intento ANTES de llamar a Meta. Si no se puede apuntar, lanza: no se llama. */
export async function registrarIntento(fila) {
  const { data, error } = await supabase.from(ACCIONES)
    .insert({ ...fila, estado: 'intento', porque: fila.porque ? recorta(fila.porque, 1500) : null })
    .select('id').single()
  if (error || !data?.id) {
    throw new MetaError(`No se ha podido escribir el registro de la acción, así que no se ha tocado Meta. (${recorta(error?.message || 'sin id', 200)})`, { statusCode: 500 })
  }
  return { id: data.id, ...fila }
}

/** Apunta lo que contestó Meta. Nunca lanza: lo hecho en Meta ya está hecho. */
export async function registrarResultado(intento, estado, respuesta = {}) {
  const { client_id, cuenta_id, objeto_tipo, objeto_id, objeto_nombre, accion, antes, despues, quien, origen, deshace } = intento
  const { error } = await supabase.from(ACCIONES).insert({
    client_id, cuenta_id, objeto_tipo, objeto_id, objeto_nombre, accion, antes, despues, quien, origen,
    deshace: deshace || null, estado, intento_id: intento.id, respuesta,
  })
  if (error) console.warn('[meta-ads] no se pudo apuntar el resultado:', error.message)
}

/** El registro de un perfil (o de una cuenta), lo último primero. */
export async function leerRegistro(clientId, { cuenta = null, limite = 100 } = {}) {
  let q = supabase.from(ACCIONES).select('*').eq('client_id', clientId)
  if (cuenta) q = q.eq('cuenta_id', cuenta)
  const { data, error } = await q.order('creada_en', { ascending: false }).limit(Math.min(Math.max(1, limite), 500))
  if (error) throw error
  return data || []
}

/** La última subida de presupuesto hecha (o sin confirmar) de un objeto en las últimas `horas`. */
export async function ultimaSubida(cuentaId, objetoId, horas = HORAS_ENTRE_SUBIDAS, ahora = new Date()) {
  const desde = new Date(ahora.getTime() - horas * 3_600_000).toISOString()
  const { data, error } = await supabase.from(ACCIONES).select('id, antes, despues, estado, creada_en')
    .eq('cuenta_id', cuentaId).eq('objeto_id', String(objetoId)).eq('accion', 'presupuesto')
    .in('estado', ['hecho', 'sin_confirmar']).gte('creada_en', desde)
    .order('creada_en', { ascending: false }).limit(20)
  if (error) throw error
  return (data || []).find(a => Number(a.despues?.valor) > Number(a.antes?.valor)) || null
}

// ── Las cuentas del perfil y sus topes ─────────────────────────────────────

/** La cuenta publicitaria tal y como está conectada a ESTE perfil, o un «no se puede». */
export async function cuentaDePerfil(clientId, cuenta) {
  const cuentaId = normalizaCuenta(cuenta)
  if (!cuentaId) throw noSePuede(`«${cuenta}» no es una cuenta publicitaria (act_…).`)
  const { data, error } = await supabase.from(CUENTAS).select('*').eq('client_id', clientId).eq('cuenta_id', cuentaId).maybeSingle()
  if (error) throw error
  if (!data) throw noSePuede(`La cuenta ${cuentaId} no está conectada a este perfil en HELM.`)
  if (data.activa === false) throw noSePuede(`La cuenta ${cuentaId} está desconectada en HELM.`)
  return data
}

/** El tope duro del día: el puesto o, si no, 1,75 × el presupuesto diario máximo. */
export function topeDuro(c) {
  if (Number(c?.tope_duro) > 0) return redondea(c.tope_duro)
  return Number(c?.tope_diario) > 0 ? redondea(Number(c.tope_diario) * FACTOR_TOPE_DURO) : null
}

const PARADOS = new Set(['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'DELETED', 'ARCHIVED', 'DISAPPROVED'])
/** ¿Puede gastar? (activo y sin nada por encima parado). Ante la duda, sí: así los topes cuentan de más. */
export const puedeGastar = (o) => Boolean(o) && o.status === 'ACTIVE' && !PARADOS.has(o.effective_status)

/** El aprendizaje de varios conjuntos: SUCCESS solo si todos los que gastan han salido. */
export function aprendizajeDe(lista) {
  const vivos = (lista || []).filter(puedeGastar)
  const estados = vivos.map(a => a?.learning_stage_info?.status || null)
  if (!estados.length) return null
  if (estados.every(s => s === 'SUCCESS')) return 'SUCCESS'
  if (estados.includes('LEARNING')) return 'LEARNING'
  if (estados.includes('FAIL')) return 'FAIL'
  return null
}
export const TEXTO_APRENDIZAJE = { LEARNING: 'aún aprendiendo', FAIL: 'aprendizaje limitado', SUCCESS: 'fuera del aprendizaje' }

/**
 * Dónde está el dinero: cada presupuesto DIARIO de la cuenta. Una campaña con
 * presupuesto de campaña (Advantage) es una unidad; si no, cada conjunto con
 * presupuesto diario. Los de presupuesto total no se tocan.
 * → [{ tipo, id, nombre, presupuesto, enciende, aprendizaje, conjuntos, campana, creada }]
 */
export function unidadesDePresupuesto({ campanas: cs = [], conjuntos: as = [], moneda = 'EUR' }) {
  const porCampana = new Map()
  for (const a of as) {
    const k = String(a.campaign_id)
    if (!porCampana.has(k)) porCampana.set(k, [])
    porCampana.get(k).push(a)
  }
  const unidades = []
  for (const c of cs) {
    const suyos = porCampana.get(String(c.id)) || []
    if (c.daily_budget != null && c.daily_budget !== '') {
      unidades.push({
        tipo: 'campaign', id: String(c.id), nombre: c.name, presupuesto: deMinimos(c.daily_budget, moneda),
        enciende: puedeGastar(c) && suyos.some(puedeGastar), aprendizaje: aprendizajeDe(suyos),
        conjuntos: suyos.map(a => String(a.id)), campana: String(c.id), creada: c.created_time || null,
      })
      continue
    }
    for (const a of suyos) {
      if (a.daily_budget == null || a.daily_budget === '') continue
      unidades.push({
        tipo: 'adset', id: String(a.id), nombre: a.name, presupuesto: deMinimos(a.daily_budget, moneda),
        enciende: puedeGastar(a) && puedeGastar(c), aprendizaje: a.learning_stage_info?.status || null,
        conjuntos: [String(a.id)], campana: String(c.id), creada: a.created_time || null,
      })
    }
  }
  return unidades
}

/** La suma de presupuestos diarios de lo que puede gastar. */
export const sumaDiaria = (unidades) => redondea((unidades || []).filter(u => u.enciende).reduce((t, u) => t + (Number(u.presupuesto) || 0), 0))

async function unidadesDeCuenta(token, cuentaId, moneda) {
  const [cs, as] = await Promise.all([campanas(token, cuentaId), conjuntos(token, cuentaId)])
  return unidadesDePresupuesto({ campanas: cs, conjuntos: as, moneda })
}

// ── Los planes: preparar (sin tocar nada) → { resumen, ya?, aplicar() } ─────
// Es la forma de las escrituras del bot (api/_lib/bot/escrituras.js): el
// resumen es lo que ve el dueño en la tarjeta y, al aprobar, se vuelve a
// preparar y solo se aplica si sale lo mismo. Por eso el resumen lleva solo lo
// que no cambia solo (nombres, antes → después, el tope); lo que cambia cada
// hora (lo gastado hoy) se comprueba, pero no se escribe en él.

const queEs = (tipo, nombre) => `${NOMBRE_TIPO[tipo]} «${recorta(nombre || 'sin nombre', 120)}»`
const enCuenta = (perfil, c) => `En ${perfil} (cuenta «${recorta(c.nombre || c.cuenta_id, 80)}»)`
const delObjeto = (tipo) => (tipo === 'campaign' ? 'de la campaña' : tipo === 'adset' ? 'del conjunto' : 'del anuncio')

function comprobarDeLaCuenta(o, c, tipo) {
  if (`act_${String(o?.account_id ?? '').replace(/^act_/, '')}` !== c.cuenta_id) {
    throw noSePuede(`Ese id no es ${{ ad: 'un anuncio', adset: 'un conjunto', campaign: 'una campaña' }[tipo]} de la cuenta ${c.cuenta_id}.`)
  }
}

/**
 * Cambiar el presupuesto diario de un conjunto (o de una campaña con
 * presupuesto de campaña). Comprueba, con lo que hay AHORA en Meta:
 *   · que el objeto es de la cuenta y la cuenta, de este perfil;
 *   · que el presupuesto sigue siendo `antes` (si se pasa);
 *   · al subir: que hay topes, como mucho +20 %, fuera del aprendizaje, sin
 *     otra subida en 72 h, que la suma de presupuestos diarios no pasa del tope
 *     y que el mes no acabaría por encima del tope mensual.
 */
export async function planPresupuesto({
  clientId, perfil = 'el perfil', cuenta, tipo, objeto, antes = null, despues,
  motivo = '', quien = 'HELM', origen = 'aprobado', deshace = null, ahora = new Date(),
}) {
  if (tipo !== 'adset' && tipo !== 'campaign') throw noSePuede('El presupuesto se cambia en un conjunto (adset) o en una campaña con presupuesto de campaña.')
  const valor = redondea(despues)
  if (!(valor > 0)) throw noSePuede('despues: tiene que ser un presupuesto diario mayor que 0.')
  if (antes != null && !(Number(antes) > 0)) throw noSePuede('antes: tiene que ser el presupuesto diario que había.')
  const c = await cuentaDePerfil(clientId, cuenta)
  const moneda = c.moneda || 'EUR'
  const $ = (n) => dinero(n, moneda)
  if (valor < MINIMO_DIARIO) throw noSePuede(`Meta no deja presupuestos diarios tan bajos: como poco ${$(MINIMO_DIARIO)}.`)
  const { token } = await tokenDe(clientId)
  const o = await leerObjeto(token, objeto, tipo)
  comprobarDeLaCuenta(o, c, tipo)
  if (o.daily_budget == null || o.daily_budget === '') {
    throw noSePuede(`${queEs(tipo, o.name)} no tiene presupuesto diario${tipo === 'adset' ? ' (lo lleva la campaña o es un presupuesto total)' : ''}.`)
  }
  const actual = deMinimos(o.daily_budget, moneda)
  if (antes != null && Math.abs(Number(antes) - actual) > 0.004) {
    throw noSePuede(`En Meta el presupuesto diario ${delObjeto(tipo)} «${o.name}» ya no es ${$(antes)} sino ${$(actual)}: alguien lo ha cambiado desde que se propuso. No lo toco.`)
  }
  const minimos = aMinimos(valor, moneda)
  if (minimos === Number(o.daily_budget)) {
    const hecho = `El presupuesto diario ${delObjeto(tipo)} «${o.name}» ya es ${$(actual)}.`
    return { resumen: hecho, ya: { ya_estaba: true, hecho } }
  }
  const sube = valor > actual
  const pct = ((valor - actual) / actual) * 100
  let extra = ''
  if (sube) {
    const tope = Number(c.tope_diario)
    const mensual = Number(c.tope_mensual)
    if (!(tope > 0) || !(mensual > 0)) throw noSePuede(`La cuenta «${c.nombre || c.cuenta_id}» no tiene topes (diario y mensual): sin topes no se sube nada. Los pone quien administra la agencia en HELM → Ads.`)
    const maxPct = Math.min(SUBIDA_MAX_PCT, Number(c.subida_max_pct) || SUBIDA_MAX_PCT)
    if (pct > maxPct + 1e-9) {
      throw noSePuede(`Subir de ${$(actual)} a ${$(valor)} es un +${porcentaje(pct)}: el tope es +${porcentaje(maxPct)} de una vez (como mucho ${$(Math.floor(actual * (1 + maxPct / 100) * 100) / 100)}). Para crecer más rápido, duplica el conjunto.`)
    }
    const aprendizaje = tipo === 'adset' ? o.learning_stage_info?.status || null : aprendizajeDe(await conjuntosDeCampana(token, objeto))
    if (aprendizaje !== 'SUCCESS') {
      throw noSePuede(`«${o.name}» no ha salido del aprendizaje (${TEXTO_APRENDIZAJE[aprendizaje] || 'Meta no da el dato'}): subirle el presupuesto lo reiniciaría.`)
    }
    const horas = Math.max(HORAS_ENTRE_SUBIDAS, Number(c.horas_entre_subidas) || 0)
    const ultima = await ultimaSubida(c.cuenta_id, objeto, horas, ahora)
    if (ultima) {
      throw noSePuede(`A «${o.name}» ya se le subió el presupuesto el ${new Date(ultima.creada_en).toLocaleString('es-ES', { timeZone: c.zona || 'Europe/Madrid', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}: hasta ${horas} h después no se vuelve a subir.`)
    }
    const unidades = await unidadesDeCuenta(token, c.cuenta_id, moneda)
    const suma = sumaDiaria(unidades)
    const esta = unidades.find(u => u.id === String(objeto))
    // Se cuenta como si fuera a gastar aunque ahora esté en pausa: los topes, de más.
    const sinEsta = redondea(suma - (esta?.enciende ? esta.presupuesto : 0))
    const nueva = redondea(sinEsta + valor)
    if (nueva > tope + 0.004) {
      throw noSePuede(`Con la subida, la suma de presupuestos diarios de la cuenta sería ${$(nueva)}, más que el tope de ${$(tope)}. Cabe como mucho ${$(Math.max(0, tope - sinEsta))}.`)
    }
    const gastadoMes = await gastoDe(token, c.cuenta_id, 'this_month')
    const quedan = diasQuedanMes(diaEn(c.zona, ahora))
    const prevision = redondea(gastadoMes + nueva * quedan)
    if (prevision > mensual + 0.004) {
      throw noSePuede(`Con la subida el mes acabaría en unos ${$(prevision)} (${$(gastadoMes)} gastados + ${$(nueva)} × ${quedan} días), más que el tope mensual de ${$(mensual)}.`)
    }
    extra = ` Tope de la cuenta: ${$(tope)}/día entre todos los presupuestos y ${$(mensual)} al mes.`
  }
  const resumen = `${enCuenta(perfil, c)}: ${sube ? 'subir' : 'bajar'} el presupuesto diario ${delObjeto(tipo)} «${recorta(o.name, 120)}» de ${$(actual)} a ${$(valor)} (${sube ? '+' : '−'}${porcentaje(Math.abs(pct))}).${extra}`
  return {
    resumen,
    async aplicar() {
      const intento = await registrarIntento({
        client_id: clientId, cuenta_id: c.cuenta_id, objeto_tipo: tipo, objeto_id: String(objeto), objeto_nombre: o.name || null,
        accion: 'presupuesto', antes: { daily_budget: Number(o.daily_budget), valor: actual, moneda },
        despues: { daily_budget: minimos, valor, moneda }, porque: motivo || null, quien, origen, deshace,
      })
      let r
      try {
        r = await cambiarPresupuestoDiario(token, String(objeto), minimos)
      } catch (e) {
        await registrarResultado(intento, 'fallido', { error: recorta(e?.message || e), code: e?.code ?? null })
        throw e
      }
      const comprobado = await leerObjeto(token, String(objeto), tipo).catch(() => null)
      if (!comprobado) {
        await registrarResultado(intento, 'sin_confirmar', { meta: r })
        return { hecho: `Presupuesto diario ${delObjeto(tipo)} «${o.name}»: ${$(actual)} → ${$(valor)}. Meta lo ha aceptado, pero no he podido volver a leerlo: míralo en Ads Manager.`, recurso: String(objeto), accion: intento.id }
      }
      if (Number(comprobado.daily_budget) !== minimos) {
        await registrarResultado(intento, 'fallido', { meta: r, comprobado: comprobado.daily_budget ?? null })
        throw new MetaError(`Meta ha contestado, pero el presupuesto diario ${delObjeto(tipo)} «${o.name}» sigue en ${$(deMinimos(comprobado.daily_budget, moneda))}. Revísalo en Ads Manager.`, { statusCode: 502 })
      }
      await registrarResultado(intento, 'hecho', { meta: r, comprobado: comprobado.daily_budget })
      return { hecho: `Presupuesto diario ${delObjeto(tipo)} «${o.name}»: ${$(actual)} → ${$(valor)}. Meta lo confirma.`, recurso: String(objeto), accion: intento.id }
    },
  }
}

/** Cambia el estado de un objeto ya leído, con su registro antes y la comprobación después. */
async function aplicarEstado({ token, clientId, c, tipo, o, estado, motivo, quien, origen, deshace }) {
  const accion = estado === 'PAUSED' ? 'pausar' : 'activar'
  const intento = await registrarIntento({
    client_id: clientId, cuenta_id: c.cuenta_id, objeto_tipo: tipo, objeto_id: String(o.id), objeto_nombre: o.name || null,
    accion, antes: { status: o.status, effective_status: o.effective_status || null }, despues: { status: estado },
    porque: motivo || null, quien, origen, deshace,
  })
  let r
  try {
    r = await cambiarEstado(token, String(o.id), estado)
  } catch (e) {
    await registrarResultado(intento, 'fallido', { error: recorta(e?.message || e), code: e?.code ?? null })
    throw e
  }
  const comprobado = await leerObjeto(token, String(o.id), tipo).catch(() => null)
  const ok = comprobado?.status === estado
  await registrarResultado(intento, comprobado ? (ok ? 'hecho' : 'fallido') : 'sin_confirmar', { meta: r, comprobado: comprobado?.status ?? null })
  if (comprobado && !ok) throw new MetaError(`Meta ha contestado, pero ${queEs(tipo, o.name)} sigue ${comprobado.status}. Revísalo en Ads Manager.`, { statusCode: 502 })
  const verbo = estado === 'PAUSED' ? 'en pausa' : 'activo'
  return {
    hecho: `${queEs(tipo, o.name).replace(/^./, (x) => x.toUpperCase())}: ${verbo}.${comprobado ? ' Meta lo confirma.' : ' Meta lo ha aceptado, pero no he podido volver a leerlo.'}`,
    recurso: String(o.id), accion: intento.id,
  }
}

/** Pausar un anuncio, un conjunto o una campaña. Pausar no gasta: no mira topes. */
export async function planPausa({ clientId, perfil = 'el perfil', cuenta, tipo, objeto, motivo = '', quien = 'HELM', origen = 'aprobado', deshace = null }) {
  const c = await cuentaDePerfil(clientId, cuenta)
  const { token } = await tokenDe(clientId)
  const o = await leerObjeto(token, objeto, tipo)
  comprobarDeLaCuenta(o, c, tipo)
  if (o.status === 'PAUSED') {
    const hecho = `${queEs(tipo, o.name).replace(/^./, (x) => x.toUpperCase())} ya estaba en pausa.`
    return { resumen: hecho, ya: { ya_estaba: true, hecho } }
  }
  if (o.status !== 'ACTIVE') throw noSePuede(`${queEs(tipo, o.name).replace(/^./, (x) => x.toUpperCase())} está ${o.status}: no se puede pausar.`)
  return {
    resumen: `${enCuenta(perfil, c)}: pausar ${queEs(tipo, o.name)}. Deja de gastar en cuanto Meta lo aplique; se puede reactivar.`,
    aplicar: () => aplicarEstado({ token, clientId, c, tipo, o: { ...o, id: String(objeto) }, estado: 'PAUSED', motivo, quien, origen, deshace }),
  }
}

/** ¿Se puede gastar más hoy en esta cuenta? Lanza un «no se puede» si no. */
async function comprobarGastoDeHoy(token, c) {
  const $ = (n) => dinero(n, c.moneda)
  const duro = topeDuro(c)
  if (duro) {
    const hoy = await gastoDe(token, c.cuenta_id, 'today')
    if (hoy >= duro) throw noSePuede(`Hoy ya van ${$(hoy)} gastados y el tope duro del día es ${$(duro)}: el vigilante lo volvería a parar. Mañana, o sube el tope.`)
  }
  if (Number(c.tope_mensual) > 0) {
    const mes = await gastoDe(token, c.cuenta_id, 'this_month')
    if (mes >= Number(c.tope_mensual)) throw noSePuede(`En el mes ya van ${$(mes)} y el tope mensual es ${$(c.tope_mensual)}.`)
  }
}

/**
 * Reactivar un anuncio, conjunto o campaña pausado (deshacer una pausa).
 * Activar gasta: pasa por los topes (hoy y el mes, y la suma de presupuestos
 * diarios si lo que se activa tiene presupuesto propio).
 */
export async function planActivar({ clientId, perfil = 'el perfil', cuenta, tipo, objeto, motivo = '', quien = 'HELM', origen = 'aprobado', deshace = null }) {
  const c = await cuentaDePerfil(clientId, cuenta)
  const $ = (n) => dinero(n, c.moneda)
  const { token } = await tokenDe(clientId)
  const o = await leerObjeto(token, objeto, tipo)
  comprobarDeLaCuenta(o, c, tipo)
  const Que = queEs(tipo, o.name).replace(/^./, (x) => x.toUpperCase())
  if (o.status === 'ACTIVE') return { resumen: `${Que} ya estaba activo.`, ya: { ya_estaba: true, hecho: `${Que} ya estaba activo.` } }
  if (o.status !== 'PAUSED') throw noSePuede(`${Que} está ${o.status}: no se puede activar desde HELM.`)
  if (!(Number(c.tope_diario) > 0)) throw noSePuede(`La cuenta «${c.nombre || c.cuenta_id}» no tiene topes: sin topes no se activa nada.`)
  await comprobarGastoDeHoy(token, c)
  let extra = ''
  if (tipo !== 'ad' && o.daily_budget != null && o.daily_budget !== '') {
    const unidades = await unidadesDeCuenta(token, c.cuenta_id, c.moneda)
    const esta = unidades.find(u => u.id === String(objeto))
    const nueva = redondea(sumaDiaria(unidades) - (esta?.enciende ? esta.presupuesto : 0) + deMinimos(o.daily_budget, c.moneda))
    if (nueva > Number(c.tope_diario) + 0.004) throw noSePuede(`Al activarlo, la suma de presupuestos diarios sería ${$(nueva)}, más que el tope de ${$(c.tope_diario)}.`)
    extra = ` Con su presupuesto de ${$(deMinimos(o.daily_budget, c.moneda))}/día (tope de la cuenta: ${$(c.tope_diario)}/día).`
  }
  return {
    resumen: `${enCuenta(perfil, c)}: reactivar ${queEs(tipo, o.name)}.${extra}`,
    aplicar: () => aplicarEstado({ token, clientId, c, tipo, o: { ...o, id: String(objeto) }, estado: 'ACTIVE', motivo, quien, origen, deshace }),
  }
}

// ── Parar los anuncios (y reanudar exactamente esos) ───────────────────────
// No pasa por la cola del worker: llama a Meta en el momento.

/**
 * Pausa TODAS las campañas activas de la cuenta y guarda la lista (helm_ads_paradas)
 * antes de tocar Meta. → { paradaId, pausadas: [{id,nombre}], fallidas: [{id,nombre,error}] }
 */
export async function pararTodo({ clientId, cuenta, quien = 'HELM', origen = 'panel', motivo = '' }) {
  const c = await cuentaDePerfil(clientId, cuenta)
  const { token } = await tokenDe(clientId)
  const activas = (await campanas(token, c.cuenta_id)).filter(x => x.status === 'ACTIVE').map(x => ({ id: String(x.id), nombre: x.name || null }))
  if (!activas.length) return { paradaId: null, pausadas: [], fallidas: [], ya: true }
  const { data: parada, error } = await supabase.from(PARADAS).insert({
    client_id: clientId, cuenta_id: c.cuenta_id, objetos: activas, motivo: motivo ? recorta(motivo, 1000) : null, quien, origen,
  }).select('id').single()
  if (error || !parada?.id) throw new MetaError(`No se ha podido guardar la lista de lo que se para, así que no se ha tocado Meta. (${recorta(error?.message || 'sin id', 200)})`, { statusCode: 500 })
  const intento = await registrarIntento({
    client_id: clientId, cuenta_id: c.cuenta_id, objeto_tipo: 'cuenta', objeto_id: c.cuenta_id, objeto_nombre: c.nombre || null,
    accion: 'parar_todo', antes: { activas: activas.map(x => x.id) }, despues: { status: 'PAUSED', parada: parada.id },
    porque: motivo || null, quien, origen,
  })
  const pausadas = []
  const fallidas = []
  for (const x of activas) {
    try {
      await cambiarEstado(token, x.id, 'PAUSED')
      pausadas.push(x)
    } catch (e) {
      fallidas.push({ ...x, error: recorta(e?.message || e, 300) })
    }
  }
  const resultado = { pausadas: pausadas.map(x => x.id), fallidas }
  await registrarResultado(intento, fallidas.length ? (pausadas.length ? 'parcial' : 'fallido') : 'hecho', resultado)
  const { error: e2 } = await supabase.from(PARADAS).update({ resultado }).eq('id', parada.id)
  if (e2) console.warn('[meta-ads] no se pudo apuntar el resultado de la parada:', e2.message)
  return { paradaId: parada.id, pausadas, fallidas }
}

/** La última parada sin reanudar de una cuenta (o la de ese id). */
export async function paradaPendiente(clientId, cuentaId, id = null) {
  let q = supabase.from(PARADAS).select('*').eq('client_id', clientId).eq('cuenta_id', cuentaId).is('reanudada_en', null)
  if (id) q = q.eq('id', id)
  const { data, error } = await q.order('creada_en', { ascending: false }).limit(1)
  if (error) throw error
  return data?.[0] || null
}

/**
 * Reactiva exactamente las campañas de una parada (las que siguen en pausa) si
 * hoy y el mes caben en los topes. → { reactivadas, fallidas, saltadas }
 */
export async function reanudarTodo({ clientId, cuenta, parada: paradaId = null, quien = 'HELM', origen = 'panel' }) {
  const c = await cuentaDePerfil(clientId, cuenta)
  const parada = await paradaPendiente(clientId, c.cuenta_id, paradaId)
  if (!parada) throw noSePuede('No hay nada parado que reanudar en esta cuenta.')
  const { token } = await tokenDe(clientId)
  await comprobarGastoDeHoy(token, c)
  const ahoraMismo = new Map((await campanas(token, c.cuenta_id)).map(x => [String(x.id), x]))
  const reactivar = []
  const saltadas = []
  for (const x of parada.objetos || []) {
    const actual = ahoraMismo.get(String(x.id))
    if (actual?.status === 'PAUSED') reactivar.push({ id: String(x.id), nombre: actual.name || x.nombre || null })
    else saltadas.push({ id: String(x.id), nombre: x.nombre || null, estado: actual?.status || 'ya no existe' })
  }
  const intento = await registrarIntento({
    client_id: clientId, cuenta_id: c.cuenta_id, objeto_tipo: 'cuenta', objeto_id: c.cuenta_id, objeto_nombre: c.nombre || null,
    accion: 'reanudar_todo', antes: { pausadas: reactivar.map(x => x.id), parada: parada.id }, despues: { status: 'ACTIVE' },
    porque: `Reanudar la parada del ${new Date(parada.creada_en).toISOString().slice(0, 16).replace('T', ' ')}`, quien, origen,
  })
  const reactivadas = []
  const fallidas = []
  for (const x of reactivar) {
    try {
      await cambiarEstado(token, x.id, 'ACTIVE')
      reactivadas.push(x)
    } catch (e) {
      fallidas.push({ ...x, error: recorta(e?.message || e, 300) })
    }
  }
  await registrarResultado(intento, fallidas.length ? (reactivadas.length ? 'parcial' : 'fallido') : 'hecho', { reactivadas: reactivadas.map(x => x.id), fallidas, saltadas })
  if (!fallidas.length) {
    const { error } = await supabase.from(PARADAS).update({ reanudada_en: new Date().toISOString(), reanudada_por: quien }).eq('id', parada.id)
    if (error) console.warn('[meta-ads] no se pudo marcar la parada como reanudada:', error.message)
  }
  return { reactivadas, fallidas, saltadas }
}
