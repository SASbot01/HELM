// HELM — Calendly por perfil. Disponible en los dos productos (HELM y
// consultoria): un infoproductor agenda llamadas de venta, un despacho agenda
// reuniones con clientes — el mismo enlace sirve para las dos cosas.
//
//   GET    ?action=status  &clientId=          → si está enlazado, cuenta y enlace
//   POST   ?action=link    { clientId, token }  → valida el token y lo guarda
//   DELETE ?action=unlink  &clientId=
//   GET    ?action=eventos &clientId=           → próximas reuniones agendadas
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { verificarToken, eventosProgramados, getCalendlyConfig, saveCalendlyConfig } from './_lib/calendly.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)
  const gate = rateLimit({ key: `calendly:${ip}`, max: 40, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
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

  // ── GET ?action=status ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    const row = await getCalendlyConfig(supabase, clientId)
    const cfg = row?.config || {}
    return res.status(200).json({
      linked: Boolean(row?.enabled && cfg.token),
      name: cfg.name || null,
      email: cfg.email || null,
      schedulingUrl: cfg.schedulingUrl || null,
      updatedAt: row?.updated_at || null,
    })
  }

  // ── POST ?action=link ────────────────────────────────────────────────────
  // Se valida el token contra Calendly antes de guardarlo: si no vale, no se guarda.
  if (req.method === 'POST' && action === 'link') {
    const token = String(req.body?.token || '').trim()
    if (!token) return res.status(400).json({ error: 'Falta el token de acceso personal' })

    let cuenta
    try {
      cuenta = await verificarToken(token)
    } catch (err) {
      return res.status(400).json({ error: `Calendly rechazó el token: ${err.message}` })
    }

    await saveCalendlyConfig(supabase, clientId, {
      token, uri: cuenta.uri, name: cuenta.name, slug: cuenta.slug,
      email: cuenta.email, schedulingUrl: cuenta.schedulingUrl, orgUri: cuenta.orgUri,
    })
    await writeAudit({ clientId, action: 'calendly.linked', req, metadata: { uri: cuenta.uri } })

    return res.status(200).json({
      linked: true, name: cuenta.name, email: cuenta.email, schedulingUrl: cuenta.schedulingUrl,
    })
  }

  // ── DELETE ?action=unlink ────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'unlink') {
    const row = await getCalendlyConfig(supabase, clientId)
    if (row) {
      const { error } = await supabase.from('user_integrations').delete().eq('id', row.id)
      if (error) return res.status(500).json({ error: error.message })
    }
    await writeAudit({ clientId, action: 'calendly.unlinked', req })
    return res.status(200).json({ linked: false })
  }

  // ── GET ?action=eventos ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'eventos') {
    const row = await getCalendlyConfig(supabase, clientId)
    const cfg = row?.config || {}
    if (!row?.enabled || !cfg.token) return res.status(200).json({ eventos: [] })
    try {
      const eventos = await eventosProgramados(cfg.token, cfg.orgUri, { count: 20 })
      return res.status(200).json({ eventos })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
