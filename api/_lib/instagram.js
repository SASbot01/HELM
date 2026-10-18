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
// El setter de Instagram (api/_lib/setter-ig.js) necesita además leer y
// contestar los DM. Solo se pide al encender el setter, no al conectar para
// métricas: es el permiso que más mira Meta en la revisión de la app.
export const IG_SCOPES_MENSAJES = [...IG_SCOPES, 'instagram_business_manage_messages']

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

export function igAuthUrl({ state, redirectUri, mensajes = false }) {
  const q = new URLSearchParams({
    client_id: process.env.IG_APP_ID || '',
    redirect_uri: redirectUri,
    scope: (mensajes ? IG_SCOPES_MENSAJES : IG_SCOPES).join(','),
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

/**
 * Las direcciones frescas del vídeo y la portada de UNA publicación.
 *
 * Las que guarda la sincronización (thumb_url) son del CDN de Meta y llevan
 * firma con caducidad: a los pocos días dan 403. Para componer una portada
 * hace falta la de ahora, así que se pide a la Graph API en el momento.
 */
export async function getMediaUrls(token, mediaId) {
  if (!/^\d{5,30}$/.test(String(mediaId || ''))) throw new IgError('Publicación no válida', 400)
  const d = await pedir(`${API}/${VERSION}/${mediaId}?${q({ fields: 'media_type,media_url,thumbnail_url', access_token: token })}`)
  return {
    tipo: d.media_type || '',
    video: d.media_type === 'VIDEO' ? d.media_url || '' : '',
    imagen: d.thumbnail_url || (d.media_type === 'IMAGE' ? d.media_url : '') || '',
  }
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

// ── Mensajes directos (setter) ─────────────────────────────────────────────
// Con la «Instagram API with Instagram Login» los DM van por graph.instagram.com
// con el mismo token de la cuenta. Dos reglas de Meta que no se negocian:
//   · solo se contesta a quien ha escrito antes (no hay mensajes en frío), y
//   · solo hasta 24 h después de su último mensaje.

/** Suscribe la cuenta al webhook de la app para que lleguen sus DM. */
export async function suscribirMensajes(token) {
  return pedir(`${API}/${VERSION}/me/subscribed_apps?${q({ subscribed_fields: 'messages', access_token: token })}`, { method: 'POST' })
}

/** Manda un DM de texto. Devuelve { recipient_id, message_id }. */
export async function enviarDm(token, igUsuarioId, texto) {
  if (!/^\d{5,40}$/.test(String(igUsuarioId || ''))) throw new IgError('Destinatario no válido', 400)
  const t = String(texto || '').slice(0, 1000)
  if (!t.trim()) throw new IgError('El mensaje está vacío', 400)
  return pedir(`${API}/${VERSION}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: String(igUsuarioId) }, message: { text: t } }),
  })
}

/**
 * Nombre y usuario de quien escribe. Meta solo lo da si esa persona ha escrito
 * a la cuenta; si no lo da, el hilo sigue igual, con su id.
 */
export async function perfilDeRemitente(token, igUsuarioId) {
  try {
    return await pedir(`${API}/${VERSION}/${igUsuarioId}?${q({ fields: 'name,username', access_token: token })}`)
  } catch {
    return {}
  }
}

// ── Informe ────────────────────────────────────────────────────────────────
// Lo que se enseña de las métricas guardadas: la lista de piezas, un resumen
// y un estudio de qué tienen las que funcionan. Es un cálculo, no una opinión:
// lo usan la sección «Informe de contenido» del panel y la herramienta
// "metricas" del conector de Claude, y las dos tienen que decir lo mismo.

const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
// El día de la semana en Madrid: un reel subido a las 00:30 de un martes es
// lunes en UTC, y la cuenta publica para gente de aquí.
const diaMadridDe = (iso) => {
  const corto = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso))
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(corto)
}

const mediana = (xs) => {
  const o = xs.filter(x => x != null).sort((a, b) => a - b)
  if (!o.length) return null
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : Math.round(((o[m - 1] + o[m]) / 2) * 10) / 10
}
// Por mil visitas: es lo que deja comparar un reel de 8.000 con uno de 800.
const porMil = (v, visitas) => (visitas > 0 ? Math.round((v / visitas) * 10_000) / 10 : null)
// La primera línea del texto es lo más parecido a un título que tiene un reel.
const tituloDe = (caption) => String(caption || '').split('\n')[0].trim().slice(0, 140) || '(sin texto)'

function estudioDe(lista, medianaVisitas) {
  const corta = (p) => ({
    url: p.url, fecha: p.fecha, titulo: p.titulo, visitas: p.visitas,
    retencion_media_s: p.retencion_media_s, guardados_por_mil: p.guardados_por_mil,
  })
  const porVisitas = [...lista].sort((a, b) => b.visitas - a.visitas)
  const mejores = porVisitas.slice(0, 5).map(corta)
  // La cuenta resube piezas: el mismo título dos veces en una propuesta no dice nada.
  const temas = [...new Set(mejores.map(p => p.titulo))].slice(0, 3)
  const peores = porVisitas.slice(-5).reverse().map(corta)

  // Las que más se guardan, solo entre las que ha visto gente suficiente: con
  // 16 visitas, un guardado son 62 por mil y no significa nada.
  const mas_guardadas = lista
    .filter(p => p.guardados_por_mil != null && p.visitas >= (medianaVisitas || 0))
    .sort((a, b) => b.guardados_por_mil - a.guardados_por_mil).slice(0, 3).map(corta)

  const dias = DIAS_SEMANA.map((dia, i) => {
    const suyas = lista.filter(p => p.dia_semana === i)
    return { dia, publicaciones: suyas.length, mediana_visitas: mediana(suyas.map(p => p.visitas)) }
  })

  // ¿Las más vistas retienen más? El tercio de arriba contra el de abajo.
  const conRet = porVisitas.filter(p => p.retencion_media_s != null)
  const tercio = Math.floor(conRet.length / 3)
  const retencion = tercio >= 3 ? {
    tercio_mas_visto_s: mediana(conRet.slice(0, tercio).map(p => p.retencion_media_s)),
    tercio_menos_visto_s: mediana(conRet.slice(-tercio).map(p => p.retencion_media_s)),
    piezas_por_tercio: tercio,
  } : null

  // Las conclusiones solo dicen lo que los números aguantan: con menos de
  // tres piezas en un día, ese día no se compara.
  const conclusiones = []
  const proxima_semana = []
  // `always`: en español 7308 sale sin punto por defecto, y al lado de 12.400 parece otro tipo de número.
  const n = (v) => Math.round(v).toLocaleString('es-ES', { useGrouping: 'always' })
  if (mejores.length && medianaVisitas) {
    const veces = Math.round((mejores[0].visitas / medianaVisitas) * 10) / 10
    conclusiones.push(`La pieza más vista («${mejores[0].titulo.slice(0, 70)}») tiene ${n(mejores[0].visitas)} visitas, ${String(veces).replace('.', ',')} veces la mediana de la cuenta (${n(medianaVisitas)}).`)
    proxima_semana.push(`Volver sobre los temas de las más vistas con otro ángulo: ${temas.map(t => `«${t.slice(0, 60)}»`).join(', ')}.`)
  }
  const diasFiables = dias.filter(d => d.publicaciones >= 3 && d.mediana_visitas != null)
  if (diasFiables.length >= 2) {
    const orden = [...diasFiables].sort((a, b) => b.mediana_visitas - a.mediana_visitas)
    const mejor = orden[0], peor = orden.at(-1)
    if (mejor.mediana_visitas > peor.mediana_visitas * 1.25) {
      conclusiones.push(`Por día de publicación, ${mejor.dia} es el que mejor mediana tiene (${n(mejor.mediana_visitas)} visitas en ${mejor.publicaciones} piezas) y ${peor.dia} el que peor (${n(peor.mediana_visitas)} en ${peor.publicaciones}).`)
      proxima_semana.push(`Guardar las piezas más fuertes para ${orden.slice(0, 2).map(d => d.dia).join(' y ')}.`)
    } else {
      conclusiones.push('El día de publicación apenas cambia las visitas: no hay un día claramente mejor que otro.')
    }
  }
  if (retencion && retencion.tercio_mas_visto_s != null && retencion.tercio_menos_visto_s != null) {
    const a = retencion.tercio_mas_visto_s, b = retencion.tercio_menos_visto_s
    const s1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',')
    if (a > b * 1.1) {
      conclusiones.push(`Las más vistas retienen más: ${s1(a)} s de media de visionado en el tercio de arriba frente a ${s1(b)} s en el de abajo.`)
      proxima_semana.push(`Cuidar los primeros segundos: las piezas que pasan de ${s1(a)} s de retención son las que llegan lejos.`)
    } else {
      conclusiones.push(`La retención no separa a las más vistas de las menos vistas (${s1(a)} s frente a ${s1(b)} s): lo que cambia el resultado es otra cosa, probablemente el tema o el gancho.`)
    }
  }
  if (mas_guardadas.length) {
    proxima_semana.push(`Hacer una pieza del tipo que más se guarda: «${mas_guardadas[0].titulo.slice(0, 60)}» (${String(mas_guardadas[0].guardados_por_mil).replace('.', ',')} guardados por mil visitas).`)
  }

  return { mejores, peores, mas_guardadas, por_dia_semana: dias, retencion, conclusiones, proxima_semana }
}

/**
 * El informe de un perfil con lo último sincronizado. No llama a Meta.
 *
 * @param {object} o
 * @param {number} [o.limite] cuántas piezas como mucho, de la más reciente atrás
 * @param {number} [o.dias]   solo las publicadas en los últimos N días
 * @returns {Promise<{conectado:boolean, cuenta?:object, resumen?:object, estudio?:object, publicaciones:object[]}>}
 */
export async function informeIg(supabase, clientId, { limite = 60, dias } = {}) {
  const cfg = (await getIgConfig(supabase, clientId))?.config || {}
  if (!cfg.token) return { conectado: false, publicaciones: [] }
  const cuenta = { usuario: cfg.username || null, seguidores: cfg.followers ?? null, sincronizado: cfg.lastSyncAt || null }

  let q = supabase.from('helm_ig_media')
    .select('permalink, caption, producto, tipo, thumb_url, publicado_en, visitas, alcance, likes, comentarios, guardados, compartidos, interacciones, retencion_media, visitas_perfil, seguidores_ganados')
    .eq('client_id', clientId).order('publicado_en', { ascending: false })
    .limit(Math.min(Math.max(Number(limite) || 60, 1), 200))
  const d = Number(dias)
  if (d > 0) q = q.gte('publicado_en', new Date(Date.now() - d * 86_400_000).toISOString())
  const { data, error } = await q
  if (error) throw error

  const lista = (data || []).map(p => ({
    url: p.permalink,
    fecha: p.publicado_en ? p.publicado_en.slice(0, 10) : null,
    dia_semana: p.publicado_en ? diaMadridDe(p.publicado_en) : null,
    formato: p.producto === 'REELS' ? 'reel' : p.tipo === 'CAROUSEL_ALBUM' ? 'carrusel' : p.tipo === 'VIDEO' ? 'vídeo' : 'foto',
    titulo: tituloDe(p.caption),
    texto: p.caption,
    visitas: p.visitas,
    alcance: p.alcance,
    likes: p.likes,
    comentarios: p.comentarios,
    guardados: p.guardados,
    compartidos: p.compartidos,
    interacciones: p.interacciones,
    retencion_media_s: p.retencion_media == null ? null : Number(p.retencion_media),
    visitas_perfil: p.visitas_perfil,
    seguidores_ganados: p.seguidores_ganados,
    guardados_por_mil: porMil(p.guardados, p.visitas),
    compartidos_por_mil: porMil(p.compartidos, p.visitas),
    interacciones_por_mil: porMil(p.interacciones, p.visitas),
  }))
  if (!lista.length) return { conectado: true, cuenta, publicaciones: [] }

  const resumen = {
    publicaciones: lista.length,
    desde: lista.at(-1).fecha,
    hasta: lista[0].fecha,
    visitas_totales: lista.reduce((t, p) => t + p.visitas, 0),
    mediana_visitas: mediana(lista.map(p => p.visitas)),
    mediana_retencion_s: mediana(lista.map(p => p.retencion_media_s)),
    mediana_guardados_por_mil: mediana(lista.map(p => p.guardados_por_mil)),
    mediana_compartidos_por_mil: mediana(lista.map(p => p.compartidos_por_mil)),
    mediana_interacciones_por_mil: mediana(lista.map(p => p.interacciones_por_mil)),
  }
  return { conectado: true, cuenta, resumen, estudio: estudioDe(lista, resumen.mediana_visitas), publicaciones: lista }
}

// Un token no se enseña entero jamás, ni al dueño de la cuenta: los pega en
// sitios donde no debe (chats, capturas) y sirve para leer su Instagram.
export const maskToken = (t) => {
  const s = String(t || '')
  return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : null
}

export { IgError }
