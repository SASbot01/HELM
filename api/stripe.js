// HELM — Stripe por perfil de negocio.
//
// Cada cuenta enlaza su propio Stripe desde Ajustes. La clave se guarda en
// `user_integrations` (RLS: el rol anónimo no puede leer esa tabla, así que la
// clave nunca llega al navegador) y solo se devuelve enmascarada.
//
// Acciones:
//   GET    ?action=status  &clientId=          → si está enlazado, cuenta y URL de webhook
//   POST   ?action=link    { clientId, apiKey, webhookSecret }
//   POST   ?action=sync    { clientId, days }  → importa pagos recientes a ventas + CRM
//   DELETE ?action=unlink  &clientId=
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { stripeFor, getStripeConfig, saveStripeConfig, maskKey } from './_lib/stripe.js'
import { registerStripePayment } from './_lib/stripe-ingest.js'

/**
 * ¿La SUPABASE_SERVICE_KEY del servidor es realmente de servicio?
 *
 * Importa porque `user_integrations` (donde viven las claves de Stripe) tiene
 * RLS que niega al rol anónimo: con una clave anon las consultas no fallan,
 * devuelven cero filas — y Stripe parece "sin enlazar" cuando sí lo está.
 * Esto lo detecta leyendo la propia clave, sin tocar la base.
 *
 * @returns {'service'|'anon'|'missing'|'unknown'}
 */
function serviceKeyKind() {
  const k = process.env.SUPABASE_SERVICE_KEY || ''
  if (!k) return 'missing'
  if (k.startsWith('sb_secret_')) return 'service'
  if (k.startsWith('sb_publishable_')) return 'anon'
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      if (payload.role === 'service_role') return 'service'
      if (payload.role === 'anon') return 'anon'
      return 'unknown'
    } catch { return 'unknown' }
  }
  return 'unknown'
}

// La URL pública que hay que pegar en Stripe. Detrás de un proxy (vite en
// local, Vercel en producción) `host` es el del backend, no el que ve el
// navegador — por eso miramos primero la config explícita y luego el referer.
function webhookUrl(req, slug) {
  const q = `/api/webhook/stripe?client=${encodeURIComponent(slug)}`
  if (process.env.HELM_PUBLIC_URL) {
    return `${process.env.HELM_PUBLIC_URL.replace(/\/$/, '')}${q}`
  }
  const fwdHost = req.headers['x-forwarded-host']
  if (fwdHost) {
    return `${req.headers['x-forwarded-proto'] || 'https'}://${fwdHost}${q}`
  }
  try {
    const ref = req.headers.referer || req.headers.origin
    if (ref) return `${new URL(ref).origin}${q}`
  } catch { /* referer inválido: seguimos con host */ }
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}${q}`
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)

  const gate = rateLimit({ key: `stripe:${ip}`, max: 40, windowMs: 60_000 })
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

  const { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('id', clientId).maybeSingle()
  if (!client) return res.status(404).json({ error: 'Perfil no encontrado' })

  // ── GET ?action=status ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    const row = await getStripeConfig(supabase, clientId)
    const cfg = row?.config || {}
    const keyKind = serviceKeyKind()
    return res.status(200).json({
      linked: Boolean(row?.enabled && cfg.apiKey),
      // Si el servidor no tiene clave de servicio, lo de arriba no es fiable:
      // el RLS devuelve cero filas y todo parece "sin enlazar".
      serverKeyOk: keyKind === 'service',
      serverKeyKind: keyKind,
      key: maskKey(cfg.apiKey),
      accountName: cfg.accountName || null,
      accountId: cfg.accountId || null,
      livemode: cfg.livemode ?? null,
      hasWebhookSecret: Boolean(cfg.webhookSecret),
      updatedAt: row?.updated_at || null,
      webhookUrl: webhookUrl(req, client.slug),
    })
  }

  // ── POST ?action=link ────────────────────────────────────────────────────
  // Valida la clave contra Stripe antes de guardarla: si no vale, no se guarda.
  if (req.method === 'POST' && action === 'link') {
    const { apiKey, webhookSecret } = req.body || {}
    if (!apiKey || !/^(sk|rk)_(live|test)_/.test(apiKey)) {
      return res.status(400).json({ error: 'La clave debe empezar por sk_live_, sk_test_, rk_live_ o rk_test_' })
    }

    let account
    try {
      account = await stripeFor(apiKey).account.retrieve()
    } catch (err) {
      return res.status(400).json({ error: `Stripe rechazó la clave: ${err.message}` })
    }

    // Conservamos el webhookSecret anterior si no mandan uno nuevo.
    const prev = (await getStripeConfig(supabase, clientId))?.config || {}
    await saveStripeConfig(supabase, clientId, {
      apiKey,
      webhookSecret: webhookSecret || prev.webhookSecret || null,
      accountId: account.id,
      accountName: account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || account.id,
      livemode: !apiKey.includes('_test_'),
    })

    await writeAudit({ clientId, action: 'stripe.linked', req, metadata: { accountId: account.id } })

    return res.status(200).json({
      linked: true,
      accountId: account.id,
      accountName: account.business_profile?.name || account.email || account.id,
      livemode: !apiKey.includes('_test_'),
      webhookUrl: webhookUrl(req, client.slug),
      hasWebhookSecret: Boolean(webhookSecret || prev.webhookSecret),
    })
  }

  // ── DELETE ?action=unlink ────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'unlink') {
    const row = await getStripeConfig(supabase, clientId)
    if (row) {
      const { error } = await supabase.from('user_integrations').delete().eq('id', row.id)
      if (error) return res.status(500).json({ error: error.message })
    }
    await writeAudit({ clientId, action: 'stripe.unlinked', req })
    return res.status(200).json({ linked: false })
  }

  // ── POST ?action=sync ────────────────────────────────────────────────────
  // Trae los checkouts pagados de los últimos N días y los registra igual que
  // haría el webhook. Sirve para recuperar lo de antes de enlazar el webhook.
  if (req.method === 'POST' && action === 'sync') {
    const row = await getStripeConfig(supabase, clientId)
    const apiKey = row?.config?.apiKey
    if (!apiKey) return res.status(400).json({ error: 'Esta cuenta no tiene Stripe enlazado' })

    const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 365)
    const since = Math.floor(Date.now() / 1000) - days * 86400
    const stripe = stripeFor(apiKey)

    let sessions
    try {
      sessions = await stripe.checkoutSessions.list({ limit: 100, created: { gte: since } })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: `Stripe: ${err.message}` })
    }

    const results = { imported: 0, duplicated: 0, skipped: 0 }
    for (const session of sessions.data || []) {
      if (session.payment_status !== 'paid') { results.skipped++; continue }
      const outcome = await registerStripePayment({
        supabase, clientId, apiKey, session, source: 'sync',
      })
      results[outcome === 'created' ? 'imported' : outcome === 'duplicate' ? 'duplicated' : 'skipped']++
    }

    await writeAudit({ clientId, action: 'stripe.sync', req, metadata: results })
    return res.status(200).json({ ...results, days })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
