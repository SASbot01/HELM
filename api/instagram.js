// HELM — Instagram: las métricas de lo que publica el perfil.
//
// Es la mitad que le faltaba a la sección de contenido. En Guiones se planifica
// y se escribe lo que se va a grabar; aquí se ve qué pasó después: cuántas
// visitas tiene cada vídeo, cuáles son los que funcionan y qué tienen en común.
//
// Las métricas NO se leen en vivo cada vez que alguien abre la sección: la API
// de Meta tiene cuota por hora y una cuenta con cien piezas serían cien
// llamadas por visita. Se sincronizan a una tabla propia (helm_ig_media) y la
// pantalla lee de ahí, que además deja histórico de lo que Instagram solo
// enseña de los últimos meses.
//
// Acciones:
//   GET    ?action=status   &clientId=              → si está conectada, y con quién
//   GET    ?action=auth-url &clientId=              → URL a la que mandar al usuario
//   GET    /api/instagram/callback?code=&state=     → vuelta de Meta (pública;
//                                                     ruta propia porque Meta no
//                                                     admite `?` en el redirect)
//   GET    ?action=informe  &clientId=&dias=        → métricas guardadas y su estudio
//   POST   ?action=link     { clientId, token }     → token de larga duración a mano
//   POST   ?action=sync     { clientId, limite }    → refresca perfil y métricas
//   DELETE ?action=unlink   &clientId=
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit, signJwt, verifyJwt } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import {
  igAuthUrl, igRedirectUri, igCredsMissing, exchangeCode, exchangeLongLived,
  getPerfil, listMedia, getInsights, getIgConfig, saveIgConfig, getToken, maskToken, informeIg, suscribirMensajes,
} from './_lib/instagram.js'

const TABLA = 'helm_ig_media'
const LIMITE_POR_DEFECTO = 60

// Origen público de la app, para volver del callback al panel del perfil.
function appOrigin(req) {
  if (process.env.HELM_PUBLIC_URL) return process.env.HELM_PUBLIC_URL.replace(/\/$/, '')
  const fwdHost = req.headers['x-forwarded-host']
  if (fwdHost) return `${req.headers['x-forwarded-proto'] || 'https'}://${fwdHost}`
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:5173'}`
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

// Lo que HELM guarda de una publicación. Solo campos que vienen de Instagram:
// las notas que alguien escriba sobre una pieza son suyas y la sync no las toca.
function filaDe(clientId, media, insights) {
  const visitas = num(insights.views)
  const alcance = num(insights.reach)
  return {
    client_id: clientId,
    media_id: String(media.id),
    tipo: media.media_type || '',
    producto: media.media_product_type || '',
    caption: media.caption ? String(media.caption).slice(0, 4000) : '',
    permalink: media.permalink || '',
    // Los reels traen `thumbnail_url`; las fotos, la imagen en `media_url`.
    thumb_url: media.thumbnail_url || media.media_url || '',
    publicado_en: media.timestamp ? new Date(media.timestamp).toISOString() : null,
    // Meta dejó de dar `views` en las piezas viejas de algunas cuentas. Cuando
    // no viene, el alcance es lo más parecido que hay: es preferible a un cero
    // que haría parecer que la pieza no la vio nadie.
    visitas: visitas || alcance,
    alcance,
    likes: num(insights.likes ?? media.like_count),
    comentarios: num(insights.comments ?? media.comments_count),
    guardados: num(insights.saved),
    compartidos: num(insights.shares),
    interacciones: num(insights.total_interactions),
    // Vienen en milisegundos; en segundos es como se lee un tiempo de visionado.
    retencion_media: insights.ig_reels_avg_watch_time ? Number(insights.ig_reels_avg_watch_time) / 1000 : null,
    tiempo_total: insights.ig_reels_video_view_total_time ? Number(insights.ig_reels_video_view_total_time) / 1000 : null,
    visitas_perfil: num(insights.profile_visits),
    seguidores_ganados: num(insights.follows),
    actualizado_en: new Date().toISOString(),
  }
}

// Las métricas se piden de cuatro en cuatro. En serie una cuenta con sesenta
// piezas tarda casi un minuto (y se pasa del límite de la función); de golpe,
// Meta responde con 429 y no se guarda nada.
async function enTandas(items, tam, fn) {
  const out = []
  for (let i = 0; i < items.length; i += tam) {
    out.push(...await Promise.all(items.slice(i, i + tam).map(fn)))
  }
  return out
}

// Trae las últimas publicaciones con sus métricas y las guarda. La usan el
// botón de sincronizar del panel y el analista del equipo de agentes
// (api/_lib/equipo.js), que la llama antes de comparar reels.
export async function sincronizar(clientId, limite = LIMITE_POR_DEFECTO) {
  const { token, config } = await getToken(supabase, clientId)

  const perfil = await getPerfil(token).catch(() => ({}))
  const medias = await listMedia(token, limite)
  const insights = await enTandas(medias, 4, (m) => getInsights(token, m).catch(() => ({})))
  const filas = medias.map((m, i) => filaDe(clientId, m, insights[i] || {}))

  if (filas.length) {
    const { error } = await supabase.from(TABLA).upsert(filas, { onConflict: 'client_id,media_id' })
    if (error) throw Object.assign(new Error(error.message), { code: error.code, tabla: true })
  }

  await saveIgConfig(supabase, clientId, {
    ...config,
    username: perfil.username || config.username || null,
    name: perfil.name || config.name || null,
    picture: perfil.profile_picture_url || config.picture || null,
    followers: perfil.followers_count ?? config.followers ?? null,
    mediaCount: perfil.media_count ?? config.mediaCount ?? null,
    lastSyncAt: new Date().toISOString(),
  })

  return {
    sincronizadas: filas.length,
    username: perfil.username || config.username || null,
    followers: perfil.followers_count ?? config.followers ?? null,
    lastSyncAt: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)
  const gate = rateLimit({ key: `instagram:${ip}`, max: 40, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  // ── GET ?action=callback ─────────────────────────────────────────────────
  // Pública a propósito: la abre Meta en el navegador del usuario, sin el JWT
  // de HELM. Quien manda es el `state` firmado que salió de auth-url.
  if (req.method === 'GET' && action === 'callback') {
    const origin = appOrigin(req)
    // writeHead y no res.redirect: el segundo solo existe en el runtime de
    // Vercel, y el servidor de desarrollo (scripts/api-server.mjs) no lo tiene.
    const volver = (slug, params) => {
      res.writeHead(302, { Location: `${origin}/${slug || 'admin'}?${new URLSearchParams(params)}` })
      return res.end()
    }

    const { code, state, error: oauthError } = req.query
    let payload = null
    try {
      payload = await verifyJwt(String(state || ''))
      if (payload.kind !== 'instagram-oauth') throw new Error('state inesperado')
    } catch {
      return volver('admin', { instagram: 'error', msg: 'La conexión ha caducado. Inténtalo otra vez desde Contenido.' })
    }
    if (oauthError || !code) {
      return volver(payload.slug, { instagram: 'error', msg: 'Has cancelado la conexión con Instagram.' })
    }

    try {
      // Meta añade "#_" al final del code cuando vuelve del navegador móvil.
      const corto = await exchangeCode(String(code).replace(/#_$/, ''), igRedirectUri(req))
      const largo = await exchangeLongLived(corto.access_token)
      const perfil = await getPerfil(largo.access_token).catch(() => ({}))
      const prev = (await getIgConfig(supabase, payload.clientId))?.config || {}

      await saveIgConfig(supabase, payload.clientId, {
        ...prev,
        token: largo.access_token,
        expiresAt: Date.now() + (Number(largo.expires_in) || 5_184_000) * 1000,
        manual: false,
        userId: perfil.user_id || corto.user_id || prev.userId || null,
        username: perfil.username || prev.username || null,
        name: perfil.name || prev.name || null,
        picture: perfil.profile_picture_url || prev.picture || null,
        followers: perfil.followers_count ?? prev.followers ?? null,
        mediaCount: perfil.media_count ?? prev.mediaCount ?? null,
        // Si esta conexión era para el setter, la cuenta se suscribe al webhook
        // de DM ahora mismo; si Meta no lo deja (app sin el permiso aprobado),
        // se apunta el motivo para enseñarlo en el setter.
        ...(payload.mensajes ? await suscribirMensajes(largo.access_token)
          .then(() => ({ mensajes: true, mensajesError: null, mensajesDesde: new Date().toISOString() }))
          .catch(e => ({ mensajes: false, mensajesError: e.message || 'Meta no ha dejado activar los mensajes' })) : {}),
      })
      await writeAudit({ clientId: payload.clientId, action: 'instagram.linked', req, metadata: { username: perfil.username || null, mensajes: Boolean(payload.mensajes) } })
      return volver(payload.slug, { instagram: 'ok' })
    } catch (err) {
      return volver(payload.slug, { instagram: 'error', msg: err.message || 'Instagram ha rechazado la conexión.' })
    }
  }

  const clientId = req.query.clientId || req.body?.clientId
  // Un solo perfil por petición: el que se comprueba es el que se usa. Si
  // vienen los dos (URL y cuerpo) y no coinciden, no se adivina cuál vale.
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  const { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('id', clientId).maybeSingle()
  if (!client) return res.status(404).json({ error: 'Perfil no encontrado' })

  try {
    // ── GET ?action=status ─────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'status') {
      const row = await getIgConfig(supabase, clientId)
      const cfg = row?.config || {}
      return res.status(200).json({
        linked: Boolean(row?.enabled && cfg.token),
        oauth: !igCredsMissing(),
        manual: Boolean(cfg.manual),
        username: cfg.username || null,
        name: cfg.name || null,
        picture: cfg.picture || null,
        followers: cfg.followers ?? null,
        mediaCount: cfg.mediaCount ?? null,
        token: maskToken(cfg.token),
        expiresAt: cfg.expiresAt || null,
        lastSyncAt: cfg.lastSyncAt || null,
      })
    }

    // ── GET ?action=informe ────────────────────────────────────────────────
    // Lee de la tabla, no de Meta: abrir la sección no gasta cuota.
    if (req.method === 'GET' && action === 'informe') {
      return res.status(200).json(await informeIg(supabase, clientId, { dias: req.query.dias, limite: 200 }))
    }

    // ── GET ?action=auth-url ───────────────────────────────────────────────
    if (req.method === 'GET' && action === 'auth-url') {
      if (igCredsMissing()) {
        return res.status(400).json({
          error: 'Al servidor le faltan IG_APP_ID e IG_APP_SECRET. Mientras tanto, conecta la cuenta pegando un token de larga duración.',
        })
      }
      // ?mensajes=1 lo pide el setter de Instagram: además de las métricas,
      // permiso para leer y contestar los DM de la cuenta.
      const mensajes = req.query.mensajes === '1'
      const state = await signJwt({ kind: 'instagram-oauth', clientId, slug: client.slug, mensajes }, { expiresIn: 600 })
      return res.status(200).json({ url: igAuthUrl({ state, redirectUri: igRedirectUri(req), mensajes }) })
    }

    // ── POST ?action=link ──────────────────────────────────────────────────
    // Token de larga duración pegado a mano. Se valida contra Instagram antes
    // de guardarlo: si no vale, no se guarda (mismo trato que la clave de Stripe).
    if (req.method === 'POST' && action === 'link') {
      const token = String(req.body?.token || '').trim()
      if (token.length < 20) return res.status(400).json({ error: 'Ese token no tiene pinta de serlo' })

      let perfil
      try {
        perfil = await getPerfil(token)
      } catch (err) {
        return res.status(400).json({ error: `Instagram rechazó el token: ${err.message}` })
      }

      const prev = (await getIgConfig(supabase, clientId))?.config || {}
      await saveIgConfig(supabase, clientId, {
        ...prev,
        token,
        // Un token pegado a mano ya viene con su vida hecha y no sabemos
        // cuánta le queda. Se le suponen 60 días y se renueva como el resto.
        expiresAt: Date.now() + 5_184_000 * 1000,
        manual: true,
        userId: perfil.user_id || null,
        username: perfil.username || null,
        name: perfil.name || null,
        picture: perfil.profile_picture_url || null,
        followers: perfil.followers_count ?? null,
        mediaCount: perfil.media_count ?? null,
      })
      await writeAudit({ clientId, action: 'instagram.linked', req, metadata: { username: perfil.username || null, manual: true } })
      return res.status(200).json({ linked: true, username: perfil.username || null, followers: perfil.followers_count ?? null })
    }

    // ── DELETE ?action=unlink ──────────────────────────────────────────────
    // Se borra la credencial, no las métricas: el histórico de lo que funcionó
    // es del negocio y no tiene por qué evaporarse por desconectar la cuenta.
    if (req.method === 'DELETE' && action === 'unlink') {
      const row = await getIgConfig(supabase, clientId)
      if (row) {
        const { error } = await supabase.from('user_integrations').delete().eq('id', row.id)
        if (error) return res.status(500).json({ error: error.message })
      }
      await writeAudit({ clientId, action: 'instagram.unlinked', req })
      return res.status(200).json({ linked: false })
    }

    // ── POST ?action=sync ──────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'sync') {
      const limite = Math.min(Math.max(Number(req.body?.limite) || LIMITE_POR_DEFECTO, 1), 200)
      try {
        return res.status(200).json(await sincronizar(clientId, limite))
      } catch (err) {
        if (!err.tabla) throw err
        // 42P01 = falta aplicar migrations/helm_instagram.sql. Es el único
        // fallo que el usuario puede arreglar, así que se dice con nombre.
        const falta = err.code === '42P01' || /does not exist|schema cache/i.test(err.message || '')
        return res.status(falta ? 400 : 500).json({
          error: falta ? 'Falta aplicar migrations/helm_instagram.sql en Supabase.' : err.message,
        })
      }
    }

    return res.status(400).json({ error: 'Acción no soportada' })
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error inesperado' })
  }
}
