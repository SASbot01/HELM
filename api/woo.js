// HELM — WooCommerce por perfil de negocio.
//
// Cada cuenta enlaza su propia tienda desde Ajustes. Las claves se guardan en
// `user_integrations` (RLS: el rol anónimo no puede leer esa tabla, así que
// nunca llegan al navegador) y solo se devuelven enmascaradas.
//
// Acciones:
//   GET    ?action=status  &clientId=           → si está enlazada, tienda y URL de webhook
//   POST   ?action=link    { clientId, storeUrl, consumerKey, consumerSecret, webhookSecret }
//   POST   ?action=sync    { clientId, days }   → importa pedidos recientes a ventas + CRM
//   DELETE ?action=unlink  &clientId=
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { wooFor, getWooConfig, saveWooConfig, maskKey, validateStoreUrl } from './_lib/woo.js'
import { importWooWindow } from './_lib/woo-import.js'

// La URL pública que hay que pegar en WooCommerce. Misma lógica que en Stripe:
// detrás de un proxy, `host` es el del backend y no el que ve el navegador.
function webhookUrl(req, slug) {
  const q = `/api/webhook/woo?client=${encodeURIComponent(slug)}`
  if (process.env.HELM_PUBLIC_URL) {
    return `${process.env.HELM_PUBLIC_URL.replace(/\/$/, '')}${q}`
  }
  const fwdHost = req.headers['x-forwarded-host']
  if (fwdHost) return `${req.headers['x-forwarded-proto'] || 'https'}://${fwdHost}${q}`
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

  const gate = rateLimit({ key: `woo:${ip}`, max: 40, windowMs: 60_000 })
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

  const { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('id', clientId).maybeSingle()
  if (!client) return res.status(404).json({ error: 'Perfil no encontrado' })

  // ── GET ?action=status ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    const row = await getWooConfig(supabase, clientId)
    const cfg = row?.config || {}
    return res.status(200).json({
      linked: Boolean(row?.enabled && cfg.consumerKey && cfg.storeUrl),
      storeUrl: cfg.storeUrl || null,
      storeName: cfg.storeName || null,
      currency: cfg.currency || null,
      wooVersion: cfg.wooVersion || null,
      key: maskKey(cfg.consumerKey),
      hasWebhookSecret: Boolean(cfg.webhookSecret),
      updatedAt: row?.updated_at || null,
      webhookUrl: webhookUrl(req, client.slug),
    })
  }

  // ── POST ?action=link ────────────────────────────────────────────────────
  // Se valida contra la tienda ANTES de guardar: si las claves no valen o la
  // REST API no responde, no se guarda nada y se dice por qué.
  if (req.method === 'POST' && action === 'link') {
    const { storeUrl, consumerKey, consumerSecret, webhookSecret } = req.body || {}
    const prev = (await getWooConfig(supabase, clientId))?.config || {}

    // Caso aparte: la tienda ya está enlazada y solo se quiere cambiar el
    // secreto del webhook. Sin esto habría que volver a escribir las dos claves
    // —que el navegador ya no tiene, porque solo las ve enmascaradas— para
    // corregir una errata en el secreto.
    const soloSecreto = Boolean(webhookSecret) && !consumerKey && !consumerSecret && !storeUrl
    if (soloSecreto) {
      if (!prev.consumerKey) {
        return res.status(400).json({ error: 'Primero enlaza la tienda con sus claves' })
      }
      await saveWooConfig(supabase, clientId, { ...prev, webhookSecret })
      await writeAudit({ clientId, action: 'woo.webhook_secret_updated', req })
      return res.status(200).json({ linked: true, hasWebhookSecret: true, webhookUrl: webhookUrl(req, client.slug) })
    }

    const url = validateStoreUrl(storeUrl)
    if (!url.ok) return res.status(400).json({ error: url.error })

    if (!consumerKey || !/^ck_/.test(consumerKey)) {
      return res.status(400).json({ error: 'La consumer key de WooCommerce empieza por ck_' })
    }
    if (!consumerSecret || !/^cs_/.test(consumerSecret)) {
      return res.status(400).json({ error: 'El consumer secret de WooCommerce empieza por cs_' })
    }

    const cfg = { storeUrl: url.url, consumerKey, consumerSecret }

    let tienda
    try {
      tienda = await wooFor(cfg).check()
    } catch (err) {
      const pista = err.statusCode === 401
        ? 'Revisa que las claves tengan permiso de lectura y que la tienda no bloquee la cabecera Authorization.'
        : err.statusCode === 404
          ? 'Comprueba la URL y que los enlaces permanentes de WordPress no estén en "Simple".'
          : ''
      return res.status(400).json({ error: `WooCommerce rechazó la conexión: ${err.message}. ${pista}`.trim() })
    }

    // Conservamos el webhookSecret anterior si no mandan uno nuevo.
    await saveWooConfig(supabase, clientId, {
      ...cfg,
      webhookSecret: webhookSecret || prev.webhookSecret || null,
      storeName: tienda.name,
      currency: tienda.currency,
      wooVersion: tienda.wooVersion,
    })

    await writeAudit({ clientId, action: 'woo.linked', req, metadata: { storeUrl: url.url } })

    return res.status(200).json({
      linked: true,
      storeUrl: url.url,
      storeName: tienda.name,
      currency: tienda.currency,
      wooVersion: tienda.wooVersion,
      webhookUrl: webhookUrl(req, client.slug),
      hasWebhookSecret: Boolean(webhookSecret || prev.webhookSecret),
    })
  }

  // ── DELETE ?action=unlink ────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'unlink') {
    const row = await getWooConfig(supabase, clientId)
    if (row) {
      const { error } = await supabase.from('user_integrations').delete().eq('id', row.id)
      if (error) return res.status(500).json({ error: error.message })
    }
    await writeAudit({ clientId, action: 'woo.unlinked', req })
    return res.status(200).json({ linked: false })
  }

  // ── POST ?action=sync ────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'sync') {
    const row = await getWooConfig(supabase, clientId)
    const cfg = row?.config
    if (!cfg?.consumerKey) return res.status(400).json({ error: 'Esta cuenta no tiene WooCommerce enlazado' })

    const days = Math.min(Math.max(Number(req.body?.days) || 60, 1), 365)

    let resumen
    try {
      resumen = await importWooWindow({ supabase, clientId, cfg, days })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: `WooCommerce: ${err.message}` })
    }

    await writeAudit({ clientId, action: 'woo.sync', req, metadata: resumen })
    return res.status(200).json(resumen)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
