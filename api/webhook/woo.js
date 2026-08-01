// POST /api/webhook/woo?client=<slug> — receptor de pedidos de WooCommerce.
//
// Como en Stripe, la URL lleva el slug del perfil: cada tienda apunta a SU
// propia URL y un pedido no puede acabar en el perfil equivocado.
//
// Eventos que procesa: `order.created` y `order.updated`. Hacen falta los dos.
// Un pedido nace casi siempre en `pending` (aún no se ha cobrado) y pasa a
// `processing` o `completed` cuando la pasarela confirma — eso llega como
// `updated`. Escuchando solo `created`, las ventas de transferencia o Bizum no
// se registrarían nunca. El filtro de estado vive en woo-ingest.js, así que un
// pedido que nunca se paga se descarta sin ensuciar nada.
//
// ── Diferencias con Stripe que importan ──────────────────────────────────
// 1. Woo firma con HMAC-SHA256 en base64 (Stripe usa hex y añade timestamp).
//    Al no llevar timestamp NO hay protección anti-replay en el propio
//    protocolo: quien capture un webhook válido puede reenviarlo. Lo que nos
//    protege es que el registro es idempotente — un pedido repetido se detecta
//    como duplicado y no se cobra dos veces.
// 2. Woo NO reintenta los webhooks fallidos. Si esto devuelve 500, ese pedido
//    se pierde: por eso existe el sync manual de Ajustes como red de seguridad.
// 3. WooCommerce manda un ping de verificación al crear el webhook, con un
//    cuerpo que no es un pedido. Hay que contestarle 200 o marca el webhook
//    como fallido y lo desactiva solo.
import { supabase } from '../lib/supabase.js'
import { writeAudit } from '../_lib/auth.js'
import { getWooConfig } from '../_lib/woo.js'
import { registerWooOrder } from '../_lib/woo-ingest.js'

// La firma se calcula sobre el cuerpo crudo: nada de parsearlo antes.
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  // El dev-server local ya deja el body parseado; en Vercel llega el stream.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Buffer.from(JSON.stringify(req.body))
  }
  if (Buffer.isBuffer(req.body)) return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function verifySignature(rawBody, sigHeader, secret) {
  if (!secret || !sigHeader) return false
  try {
    const crypto = await import('node:crypto')
    const esperada = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
    const a = Buffer.from(esperada)
    const b = Buffer.from(String(sigHeader))
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const slug = req.query.client
  if (!slug) {
    return res.status(400).json({ error: 'Falta ?client=<slug> en la URL del webhook' })
  }

  let rawBody, payload
  try {
    rawBody = await getRawBody(req)
    payload = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Cuerpo inválido' })
  }

  const { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('slug', slug).maybeSingle()
  if (!client) {
    await writeAudit({ action: 'woo.webhook.unknown_client', req, statusCode: 404, metadata: { slug } })
    return res.status(404).json({ error: 'Perfil no encontrado' })
  }

  const row = await getWooConfig(supabase, client.id)
  const cfg = row?.config || {}
  if (!row?.enabled || !cfg.consumerKey) {
    await writeAudit({ clientId: client.id, action: 'woo.webhook.not_linked', req, statusCode: 503 })
    return res.status(503).json({ error: 'Este perfil no tiene WooCommerce enlazado' })
  }
  if (!cfg.webhookSecret) {
    await writeAudit({ clientId: client.id, action: 'woo.webhook.secret_missing', req, statusCode: 503 })
    return res.status(503).json({ error: 'Falta el secreto de firma del webhook' })
  }

  const firmaOk = await verifySignature(rawBody, req.headers['x-wc-webhook-signature'], cfg.webhookSecret)
  if (!firmaOk) {
    await writeAudit({ clientId: client.id, action: 'woo.webhook.invalid_signature', req, statusCode: 401 })
    // 401 y no 400: el cuerpo puede ser perfectamente válido, lo que falla es
    // quién dice ser. Si esto salta con webhooks legítimos, casi siempre es que
    // el secreto de Ajustes y el de WooCommerce no coinciden.
    return res.status(401).json({ error: 'Firma inválida' })
  }

  // Ping de verificación de Woo: no trae pedido. Hay que devolverle 200 o
  // desactiva el webhook por su cuenta.
  const topic = req.headers['x-wc-webhook-topic'] || ''
  if (!payload?.id || req.headers['x-wc-webhook-event'] === 'ping') {
    return res.status(200).json({ received: true, outcome: 'ping' })
  }

  if (topic && !topic.startsWith('order.')) {
    return res.status(200).json({ received: true, outcome: `ignorado:${topic}` })
  }

  try {
    const outcome = await registerWooOrder({ supabase, clientId: client.id, order: payload })
    return res.status(200).json({ received: true, outcome })
  } catch (err) {
    await writeAudit({
      clientId: client.id, action: 'woo.webhook.error', req,
      statusCode: 500, errorMessage: err.message, metadata: { orderId: payload?.id, topic },
    })
    // Woo no reintenta: este pedido habrá que recuperarlo con el sync manual.
    return res.status(500).json({ error: 'Error procesando el pedido' })
  }
}
