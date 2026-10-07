// HELM — IA por perfil: qué modelo atiende a este cliente y con qué clave.
//
// Cada perfil corre su IA por su cuenta. Si mete su clave de Anthropic, sus
// chats, sus Biblias y sus lecturas de facturas van contra Claude con SU clave
// y SU modelo; si no la mete, siguen con el modelo local del servidor. HELM y
// consultoría son perfiles distintos: uno puede estar en Claude Opus y el otro
// en el local, sin tocarse.
//
//   GET    ?action=status &clientId=            → proveedor activo y modelo
//   POST   ?action=link   { clientId, apiKey, model } → valida la clave y la guarda
//   POST   ?action=modelo { clientId, model }   → cambia de modelo, misma clave
//   DELETE ?action=unlink &clientId=            → vuelve al modelo local
//   GET    ?action=test   &clientId=            → prueba en vivo del modelo activo
//
// La clave nunca vuelve al navegador: `status` solo devuelve los cuatro
// últimos caracteres, que es lo justo para reconocerla.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import {
  MODELOS_CLAUDE, MODELO_POR_DEFECTO, modeloValido,
  verificarClave, getIaConfig, saveIaConfig, deleteIaConfig,
} from './_lib/anthropic.js'
import { llmHealth, llmInfo, olvidarProveedor } from './_lib/llm.js'

const catalogo = MODELOS_CLAUDE.map(({ id, label, desc }) => ({ id, label, desc }))

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)
  const gate = rateLimit({ key: `ia:${ip}`, max: 30, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  // ── GET ?action=status ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    const row = await getIaConfig(supabase, clientId)
    const cfg = row?.config || {}
    const enClaude = Boolean(row?.enabled && cfg.apiKey)
    return res.status(200).json({
      proveedor: enClaude ? 'claude' : 'local',
      model: enClaude ? (cfg.model || MODELO_POR_DEFECTO) : llmInfo.model,
      last4: enClaude ? (cfg.last4 || null) : null,
      updatedAt: row?.updated_at || null,
      local: llmInfo,
      modelos: catalogo,
    })
  }

  // ── POST ?action=link ────────────────────────────────────────────────────
  // Se valida contra Anthropic antes de guardar: una clave que no vale no
  // entra en la base de datos, así nadie se entera del fallo a mitad de un chat.
  if (req.method === 'POST' && action === 'link') {
    const apiKey = String(req.body?.apiKey || '').trim()
    const model = String(req.body?.model || MODELO_POR_DEFECTO)
    if (!apiKey) return res.status(400).json({ error: 'Falta la API key de Anthropic' })
    if (!modeloValido(model)) return res.status(400).json({ error: 'Ese modelo no está en la lista' })

    let info
    try {
      info = await verificarClave(apiKey, model)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    await saveIaConfig(supabase, clientId, {
      apiKey, model, displayName: info.displayName, last4: apiKey.slice(-4),
    })
    olvidarProveedor(clientId)
    await writeAudit({ clientId, action: 'ia.linked', req, metadata: { model } })

    return res.status(200).json({ proveedor: 'claude', model, last4: apiKey.slice(-4) })
  }

  // ── POST ?action=modelo ──────────────────────────────────────────────────
  // Cambiar de modelo no debería obligar a volver a pegar la clave.
  if (req.method === 'POST' && action === 'modelo') {
    const model = String(req.body?.model || '')
    if (!modeloValido(model)) return res.status(400).json({ error: 'Ese modelo no está en la lista' })

    const row = await getIaConfig(supabase, clientId)
    const cfg = row?.config || {}
    if (!cfg.apiKey) return res.status(400).json({ error: 'Este perfil no tiene clave de Anthropic guardada' })

    try {
      await verificarClave(cfg.apiKey, model)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    await saveIaConfig(supabase, clientId, { ...cfg, model })
    olvidarProveedor(clientId)
    await writeAudit({ clientId, action: 'ia.model_changed', req, metadata: { model } })

    return res.status(200).json({ proveedor: 'claude', model, last4: cfg.last4 || null })
  }

  // ── DELETE ?action=unlink ────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'unlink') {
    try {
      await deleteIaConfig(supabase, clientId)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
    olvidarProveedor(clientId)
    await writeAudit({ clientId, action: 'ia.unlinked', req })
    return res.status(200).json({ proveedor: 'local', model: llmInfo.model })
  }

  // ── GET ?action=test ─────────────────────────────────────────────────────
  // Una llamada real al modelo que atiende ahora mismo a este perfil.
  if (req.method === 'GET' && action === 'test') {
    return res.status(200).json(await llmHealth(clientId))
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
