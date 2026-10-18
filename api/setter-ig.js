// HELM — El setter de Instagram en el panel (Agentes → Setter de Instagram).
//
//   GET  ?action=estado         &clientId=          → config, cuenta, formularios
//   POST ?action=config         { clientId, config } → guardarla
//   GET  ?action=conectar       &clientId=          → URL de Instagram con permiso de mensajes
//   GET  ?action=conversaciones &clientId=          → la bandeja
//   GET  ?action=hilo           &clientId=&id=      → un hilo con sus mensajes
//   POST ?action=aprobar        { clientId, conversacionId, textos? } → manda los borradores
//   POST ?action=descartar      { clientId, conversacionId }           → los tira
//   POST ?action=enviar         { clientId, conversacionId, texto }    → escribe una persona
//   POST ?action=control        { clientId, conversacionId, estado }   → ia | humano | cerrada
//   POST ?action=responder      { clientId, conversacionId }           → que conteste ya
//   POST ?action=probar         { clientId, mensajes, config? }        → simulador (gasta créditos)
//
// El motor está en api/_lib/setter-ig.js; los DM llegan por api/ig-webhook.js.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit, signJwt } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { getIgConfig, igAuthUrl, igRedirectUri, igCredsMissing } from './_lib/instagram.js'
import {
  configDe, normalizaConfig, pensar, atender, enviarComo, dentroDeVentana, arrancaBarrido, AVISO_POR_DEFECTO, enlaceDe,
} from './_lib/setter-ig.js'

const RE_UUID = /^[0-9a-f-]{36}$/i
const recorta = (s, n) => String(s || '').slice(0, n)

async function hiloDelPerfil(clientId, id) {
  if (!RE_UUID.test(String(id || ''))) return null
  const { data } = await supabase.from('helm_ig_conversaciones').select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
  return data
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  arrancaBarrido()

  const action = req.query.action
  const gate = rateLimit({ key: `setter-ig:${getClientIp(req)}`, max: 90, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  let auth
  try {
    auth = await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }
  const quien = auth.email || auth.userId || 'panel'

  try {
    // ── GET ?action=estado ─────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'estado') {
      const [config, row, { data: client }, { data: forms }] = await Promise.all([
        configDe(clientId),
        getIgConfig(supabase, clientId),
        supabase.from('clients').select('name, brand_name, slug').eq('id', clientId).maybeSingle(),
        supabase.from('helm_forms').select('id, title, active, booked_stage_key').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50),
      ])
      const cfg = row?.config || {}
      return res.status(200).json({
        config,
        cuenta: {
          conectada: Boolean(cfg.token),
          usuario: cfg.username || null,
          mensajes: Boolean(cfg.mensajes),
          mensajesError: cfg.mensajesError || null,
        },
        servidor: {
          webhook: Boolean(process.env.IG_WEBHOOK_VERIFY_TOKEN && process.env.IG_APP_SECRET),
          oauth: !igCredsMissing(),
        },
        formularios: (forms || []).map(f => ({ id: f.id, titulo: f.title || 'Formulario', activo: f.active !== false, reserva: Boolean(f.booked_stage_key) })),
        avisoPorDefecto: AVISO_POR_DEFECTO(client?.brand_name || client?.name || 'la marca'),
        enlaceEjemplo: enlaceDe(config, null),
      })
    }

    // ── POST ?action=config ────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'config') {
      const nueva = normalizaConfig(req.body?.config || {})
      if (nueva.form_id) {
        const { data: f } = await supabase.from('helm_forms').select('id').eq('id', nueva.form_id).eq('client_id', clientId).maybeSingle()
        if (!f) nueva.form_id = null
      }
      const { error } = await supabase.from('helm_setter_ig')
        .upsert({ client_id: clientId, ...nueva, updated_at: new Date().toISOString(), updated_by: recorta(quien, 200) })
      if (error) return res.status(500).json({ error: 'No se pudo guardar: ' + error.message })
      await writeAudit({ clientId, action: 'setter-ig.config', req, metadata: { activo: nueva.activo, modo: nueva.modo, objetivo: nueva.objetivo } })
      return res.status(200).json({ ok: true, config: await configDe(clientId) })
    }

    // ── GET ?action=conectar ───────────────────────────────────────────────
    if (req.method === 'GET' && action === 'conectar') {
      if (igCredsMissing()) return res.status(400).json({ error: 'Al servidor le faltan IG_APP_ID e IG_APP_SECRET.' })
      const { data: client } = await supabase.from('clients').select('slug').eq('id', clientId).maybeSingle()
      const state = await signJwt({ kind: 'instagram-oauth', clientId, slug: client?.slug, mensajes: true }, { expiresIn: 600 })
      return res.status(200).json({ url: igAuthUrl({ state, redirectUri: igRedirectUri(req), mensajes: true }) })
    }

    // ── GET ?action=conversaciones ─────────────────────────────────────────
    if (req.method === 'GET' && action === 'conversaciones') {
      const { data: hilos, error } = await supabase.from('helm_ig_conversaciones')
        .select('id, usuario, nombre, contact_id, estado, motivo_humano, fase, resumen, ultimo_entrante_at, ultimo_mensaje_at, pendiente_desde')
        .eq('client_id', clientId).order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(100)
      if (error) return res.status(500).json({ error: error.message })
      const ids = (hilos || []).map(h => h.id)
      const borradores = new Map()
      const ultimos = new Map()
      if (ids.length) {
        const { data: ms } = await supabase.from('helm_ig_mensajes').select('conversacion_id, autor, texto, estado, created_at')
          .in('conversacion_id', ids).in('estado', ['borrador', 'recibido', 'enviado']).order('created_at', { ascending: false }).limit(1000)
        for (const m of ms || []) {
          if (m.estado === 'borrador') borradores.set(m.conversacion_id, (borradores.get(m.conversacion_id) || 0) + 1)
          else if (!ultimos.has(m.conversacion_id)) ultimos.set(m.conversacion_id, { autor: m.autor, texto: recorta(m.texto, 140) })
        }
      }
      return res.status(200).json({
        conversaciones: (hilos || []).map(h => ({
          ...h, borradores: borradores.get(h.id) || 0, ultimo: ultimos.get(h.id) || null, abierta: dentroDeVentana(h),
        })),
      })
    }

    // ── GET ?action=hilo ───────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'hilo') {
      const conv = await hiloDelPerfil(clientId, req.query.id)
      if (!conv) return res.status(404).json({ error: 'No encuentro esa conversación' })
      const { data: mensajes } = await supabase.from('helm_ig_mensajes')
        .select('id, direccion, autor, texto, adjuntos, estado, error, created_at')
        .eq('conversacion_id', conv.id).neq('estado', 'descartado').order('created_at', { ascending: true }).limit(300)
      return res.status(200).json({ conversacion: { ...conv, abierta: dentroDeVentana(conv) }, mensajes: mensajes || [] })
    }

    // Las acciones sobre un hilo.
    const conv = ['aprobar', 'descartar', 'enviar', 'control', 'responder'].includes(action)
      ? await hiloDelPerfil(clientId, req.body?.conversacionId) : null
    if (['aprobar', 'descartar', 'enviar', 'control', 'responder'].includes(action) && !conv) {
      return res.status(404).json({ error: 'No encuentro esa conversación' })
    }

    // ── POST ?action=aprobar ───────────────────────────────────────────────
    // Manda los borradores en orden, con lo que se haya corregido a mano.
    if (req.method === 'POST' && action === 'aprobar') {
      const { data: borradores } = await supabase.from('helm_ig_mensajes').select('id, texto')
        .eq('conversacion_id', conv.id).eq('estado', 'borrador').order('created_at', { ascending: true })
      if (!borradores?.length) return res.status(400).json({ error: 'No hay nada por aprobar en esta conversación' })
      if (!dentroDeVentana(conv)) return res.status(409).json({ error: 'Han pasado más de 24 h desde su último mensaje: Instagram ya no deja contestar.' })
      const editados = new Map((Array.isArray(req.body?.textos) ? req.body.textos : []).map(t => [t.id, recorta(t.texto, 1000)]))
      let enviados = 0
      for (const b of borradores) {
        const texto = (editados.get(b.id) ?? b.texto ?? '').trim()
        await supabase.from('helm_ig_mensajes').update({ estado: 'descartado' }).eq('id', b.id)
        if (!texto) continue
        const ok = await enviarComo(conv, texto, 'ia')
        if (!ok) break
        enviados++
      }
      if (enviados) await supabase.from('helm_ig_conversaciones').update({ aviso_dado: true }).eq('id', conv.id)
      return res.status(200).json({ ok: enviados > 0, enviados })
    }

    // ── POST ?action=descartar ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'descartar') {
      await supabase.from('helm_ig_mensajes').update({ estado: 'descartado' }).eq('conversacion_id', conv.id).eq('estado', 'borrador')
      return res.status(200).json({ ok: true })
    }

    // ── POST ?action=enviar ────────────────────────────────────────────────
    // Escribe una persona desde HELM: el hilo pasa a sus manos.
    if (req.method === 'POST' && action === 'enviar') {
      const texto = recorta(req.body?.texto, 1000).trim()
      if (!texto) return res.status(400).json({ error: 'El mensaje está vacío' })
      await supabase.from('helm_ig_mensajes').update({ estado: 'descartado' }).eq('conversacion_id', conv.id).eq('estado', 'borrador')
      const ok = await enviarComo(conv, texto, 'humano')
      await supabase.from('helm_ig_conversaciones').update({
        estado: conv.estado === 'cerrada' ? 'cerrada' : 'humano', motivo_humano: conv.motivo_humano || 'Lo lleva una persona del equipo',
        pendiente_desde: null, updated_at: new Date().toISOString(),
      }).eq('id', conv.id)
      if (!ok) return res.status(502).json({ error: 'Instagram no ha dejado mandar el mensaje. Míralo en la conversación.' })
      return res.status(200).json({ ok: true })
    }

    // ── POST ?action=control ───────────────────────────────────────────────
    if (req.method === 'POST' && action === 'control') {
      const estado = req.body?.estado
      if (!['ia', 'humano', 'cerrada'].includes(estado)) return res.status(400).json({ error: 'Estado no válido' })
      const cambios = { estado, updated_at: new Date().toISOString() }
      if (estado === 'ia') {
        cambios.motivo_humano = null
        // Si lo último es del lead, el setter lo retoma.
        const { data: ultimo } = await supabase.from('helm_ig_mensajes').select('autor')
          .eq('conversacion_id', conv.id).in('estado', ['recibido', 'enviado']).order('created_at', { ascending: false }).limit(1)
        if (ultimo?.[0]?.autor === 'lead') cambios.pendiente_desde = new Date().toISOString()
      } else {
        cambios.pendiente_desde = null
        if (estado === 'humano') cambios.motivo_humano = conv.motivo_humano || 'Lo lleva una persona del equipo'
        await supabase.from('helm_ig_mensajes').update({ estado: 'descartado' }).eq('conversacion_id', conv.id).eq('estado', 'borrador')
      }
      await supabase.from('helm_ig_conversaciones').update(cambios).eq('id', conv.id)
      return res.status(200).json({ ok: true })
    }

    // ── POST ?action=responder ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'responder') {
      if (conv.estado !== 'ia') return res.status(409).json({ error: 'Esta conversación la lleva una persona. Devuélvesela al setter primero.' })
      const r = await atender(conv.id, { forzar: true })
      return res.status(200).json({ ok: true, ...r })
    }

    // ── POST ?action=probar ────────────────────────────────────────────────
    // El simulador: contesta a una conversación inventada con la config
    // guardada (o la que se está editando), sin Instagram y sin guardar nada.
    if (req.method === 'POST' && action === 'probar') {
      const lista = (Array.isArray(req.body?.mensajes) ? req.body.mensajes : []).slice(-30)
        .map(m => ({ autor: m.autor === 'lead' ? 'lead' : 'ia', texto: recorta(m.texto, 1000), estado: 'enviado' }))
        .filter(m => m.texto.trim())
      if (!lista.some(m => m.autor === 'lead')) return res.status(400).json({ error: 'Escribe al menos un mensaje como si fueras el lead' })
      const cfg = req.body?.config ? { ...(await configDe(clientId)), ...normalizaConfig({ ...req.body.config, activo: true }) } : await configDe(clientId)
      const primero = !lista.some(m => m.autor === 'ia')
      const r = await pensar({ clientId, cfg, mensajes: lista, avisoPendiente: primero })
      const { data: client } = await supabase.from('clients').select('name, brand_name').eq('id', clientId).maybeSingle()
      const aviso = primero ? (cfg.aviso_ia || AVISO_POR_DEFECTO(client?.brand_name || client?.name || 'la marca')) : null
      return res.status(200).json({ ...r, aviso })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[setter-ig]', err)
    if (res.headersSent) return undefined
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
