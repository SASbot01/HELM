// HELM — Instagram por perfil de negocio, sin SDK.
//
// Qué se conecta y qué NO. Esto usa la "Instagram API with Instagram Login"
// (graph.instagram.com): la cuenta entra con SU usuario de Instagram y no hace
// falta que tenga una página de Facebook enlazada, que es la parte que tumba a
// la mitad de la gente cuando se conecta por la vía de Facebook Login. Exige,
// eso sí, cuenta PROFESIONAL (empresa o creador): una cuenta personal no tiene
// métricas que dar, ni por la API ni en la propia app.
//
// Dos formas de enlazar, y las dos acaban en el mismo sitio:
//   · OAuth  — si el servidor tiene IG_APP_ID / IG_APP_SECRET (ver docs abajo).
//   · A mano — pegando un token de larga duración generado en el panel de Meta.
//     Es la salida para quien todavía no tiene la app de Meta revisada, que
//     tarda semanas: sin esto la sección no se puede probar hasta entonces.
//
// El token de larga duración dura 60 días y se renueva solo (`refresh_access_token`)
// mientras alguien entre en la sección de vez en cuando. Vive en
// `user_integrations` (service='instagram'), que tiene RLS negando al rol
// anónimo: el navegador nunca lo ve.

const API = 'https://graph.instagram.com'
const VERSION = 'v23.0'
const OAUTH_AUTH = 'https://www.instagram.com/oauth/authorize'
const OAUTH_TOKEN = 'https://api.instagram.com/oauth/access_token'
const TIMEOUT_MS = 20_000

// Lo mínimo para leer el perfil y las métricas de sus publicaciones. Nada de
// publicar ni de leer mensajes: esta sección solo mira.
export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights']

export const igCredsMissing = () => !process.env.IG_APP_ID || !process.env.IG_APP_SECRET

class IgError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

// La URL que Meta tiene registrada como redirect. Debe coincidir carácter a
// carácter con la del panel, así que manda la variable de entorno y lo demás es
// deducción para desarrollo.
//
// Ruta limpia, sin `?action=`, al revés que Google: el campo "URI de
// redireccionamiento válidos" del panel de Meta rechaza las URL con
// parámetros. De ahí que exista api/instagram/callback.js.
export function igRedirectUri(req) {
  const path = '/api/instagram/callback'
  if (process.env.HELM_PUBLIC_URL) {
    return `${process.env.HELM_PUBLIC_URL.replace(/\/$/, '')}${path}`
  }
  const fwdHost = req?.headers?.['x-forwarded-host']
  if (fwdHost) return `${req.headers['x-forwarded-proto'] || 'https'}://${fwdHost}${path}`
  try {
    const ref = req?.headers?.referer || req?.headers?.origin
    if (ref) return `${new URL(ref).origin}${path}`
  } catch { /* referer inválido: seguimos con host */ }
  return `${req?.headers?.['x-forwarded-proto'] || 'http'}://${req?.headers?.host || 'localhost:5173'}${path}`
}

export function igAuthUrl({ state, redirectUri }) {
  const q = new URLSearchParams({
    client_id: process.env.IG_APP_ID || '',
    redirect_uri: redirectUri,
    scope: IG_SCOPES.join(','),
    response_type: 'code',
    state,
  })
  return `${OAUTH_AUTH}?${q}`
}

async function pedir(url, opciones = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let r
  try {
    r = await fetch(url, { ...opciones, signal: ctrl.signal })
  } catch (err) {
    throw new IgError(err.name === 'AbortError' ? 'Instagram no responde' : `No se ha podido hablar con Instagram: ${err.message}`, 502)
  } finally {
    clearTimeout(t)
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    // Meta devuelve el motivo en error.message; el código dice si es cosa del
    // token (hay que volver a enlazar) o de la petición (es cosa nuestra).
    const msg = data?.error?.message || data?.error_message || `Error ${r.status}`
    const code = Number(data?.error?.code)
    const caducado = r.status === 401 || code === 190 || code === 102
    throw new IgError(msg, caducado ? 401 : (r.status || 502))
  }
  return data
}

const q = (params) => new URLSearchParams(params).toString()

// ── OAuth ──────────────────────────────────────────────────────────────────

// Code → token corto (1 hora). Va como formulario, no como JSON: la única de
// las llamadas de Meta que lo exige.
export async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.IG_APP_ID || '',
    client_secret: process.env.IG_APP_SECRET || '',
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  })
  return pedir(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

// Token corto → token de 60 días.
export async function exchangeLongLived(shortToken) {
  return pedir(`${API}/access_token?${q({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.IG_APP_SECRET || '',
    access_token: shortToken,
  })}`)
}

// Renueva el de 60 días por otros 60. Solo funciona con tokens de más de 24 h
// de vida, así que se llama cuando quedan menos de 10 días.
export async function refreshLongLived(token) {
  return pedir(`${API}/refresh_access_token?${q({ grant_type: 'ig_refresh_token', access_token: token })}`)
}

// ── Datos ──────────────────────────────────────────────────────────────────

const CAMPOS_PERFIL = 'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count'

export async function getPerfil(token) {
  return pedir(`${API}/${VERSION}/me?${q({ fields: CAMPOS_PERFIL, access_token: token })}`)
}

const CAMPOS_MEDIA = [
  'id', 'caption', 'media_type', 'media_product_type', 'media_url', 'thumbnail_url',
  'permalink', 'timestamp', 'like_count', 'comments_count',
].join(',')

/**
 * Las últimas publicaciones de la cuenta, paginando hasta `limite`.
 *
 * Se pide de 25 en 25 aunque la API admita más: con el límite alto Meta corta
 * la respuesta cuando alguna pieza no tiene todos los campos y devuelve un
 * error genérico imposible de depurar.
 */
export async function listMedia(token, limite = 60) {
  const salida = []
  let url = `${API}/${VERSION}/me/media?${q({ fields: CAMPOS_MEDIA, limit: 25, access_token: token })}`
  while (url && salida.length < limite) {
    const page = await pedir(url)
    salida.push(...(page.data || []))
    url = page.paging?.next || null
  }
  return salida.slice(0, limite)
}

// Qué métricas tiene cada tipo de pieza. No son intercambiables: pedirle
// `ig_reels_avg_watch_time` a una foto es un 400, y pedirle `views` a un
// carrusel antiguo también. Por eso hay lista por tipo y, si aun así falla,
// una segunda pasada con lo mínimo que existe siempre.
const METRICAS_REEL = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']
const METRICAS_FOTO = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'profile_visits', 'follows']
const METRICAS_MINIMAS = ['reach']

function metricasDe(media) {
  const producto = String(media.media_product_type || '').toUpperCase()
  const tipo = String(media.media_type || '').toUpperCase()
  if (producto === 'REELS' || tipo === 'VIDEO') return METRICAS_REEL
  return METRICAS_FOTO
}

/**
 * Métricas de UNA publicación, como objeto { metrica: valor }.
 *
 * Nunca lanza: una pieza sin métricas (recién publicada, o de antes de que la
 * cuenta fuera profesional) no puede tumbar la sincronización de las otras
 * cincuenta. Devuelve lo que haya, y {} si no hay nada.
 */
export async function getInsights(token, media) {
  const intentar = async (metricas) => {
    const data = await pedir(`${API}/${VERSION}/${media.id}/insights?${q({ metric: metricas.join(','), access_token: token })}`)
    const out = {}
    for (const m of data.data || []) {
      out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? 0
    }
    return out
  }
  try {
    return await intentar(metricasDe(media))
  } catch (err) {
    if (err.statusCode === 401) throw err   // token muerto: eso sí para la sync
    try { return await intentar(METRICAS_MINIMAS) } catch { return {} }
  }
}

// ── Config por perfil ──────────────────────────────────────────────────────
// config = { token, expiresAt, manual, userId, username, name, picture,
//            followers, mediaCount, lastSyncAt }

export async function getIgConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'instagram')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveIgConfig(supabase, clientId, config, enabled = true) {
  const existing = await getIgConfig(supabase, clientId)
  const row = {
    client_id: clientId,
    service: 'instagram',
    config,
    enabled,
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    const { error } = await supabase.from('user_integrations').update(row).eq('id', existing.id)
    if (error) throw error
    return { ...existing, ...row }
  }
  const { data, error } = await supabase.from('user_integrations').insert(row).select().single()
  if (error) throw error
  return data
}

const DIEZ_DIAS = 10 * 24 * 60 * 60 * 1000

/**
 * Token válido para este perfil, renovándolo si le quedan menos de diez días.
 *
 * @throws 400 si el perfil no tiene Instagram enlazado; 401 si Meta ya no
 *         acepta el token (hay que volver a conectar la cuenta).
 */
export async function getToken(supabase, clientId) {
  const row = await getIgConfig(supabase, clientId)
  const cfg = row?.config || {}
  if (!cfg.token) throw new IgError('Este perfil no tiene Instagram conectado', 400)

  const caduca = Number(cfg.expiresAt) || 0
  if (caduca && caduca - Date.now() < DIEZ_DIAS) {
    try {
      const fresco = await refreshLongLived(cfg.token)
      const next = {
        ...cfg,
        token: fresco.access_token || cfg.token,
        expiresAt: Date.now() + (Number(fresco.expires_in) || 5_184_000) * 1000,
      }
      await saveIgConfig(supabase, clientId, next)
      return { token: next.token, config: next, row }
    } catch {
      // Si la renovación falla pero el token aún vale, se sigue con el viejo:
      // ya avisará el propio Meta cuando de verdad haya caducado.
      if (caduca > Date.now()) return { token: cfg.token, config: cfg, row }
      throw new IgError('El permiso de Instagram ha caducado. Vuelve a conectar la cuenta.', 401)
    }
  }
  return { token: cfg.token, config: cfg, row }
}

// Un token no se enseña entero jamás, ni al dueño de la cuenta: los pega en
// sitios donde no debe (chats, capturas) y sirve para leer su Instagram.
export const maskToken = (t) => {
  const s = String(t || '')
  return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : null
}

export { IgError }
