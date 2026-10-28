// POST /api/webhook/stripe?client=<slug> — receptor de eventos de Stripe.
//
// Cambio respecto al proyecto anterior: la URL lleva el slug del perfil. Antes
// se buscaba "alguna" config de Stripe en la tabla y con más de una cuenta
// enlazada los pagos podían acabar en el perfil equivocado. Ahora cada cuenta
// de Stripe apunta a SU propia URL y no hay ambigüedad posible.
//
// Eventos que procesa:
//   checkout.session.completed              → venta + contacto CRM + actividad + producto
//   checkout.session.async_payment_succeeded → el pago diferido que sí cuajó
//   invoice.paid                            → venta recurrente + actividad
//
// El async hace falta para métodos de pago que no confirman al instante (SEPA,
// transferencia, Bancontact…): ahí `completed` llega con payment_status
// 'unpaid' y el cobro real se confirma minutos u horas después. Sin este
// evento esas ventas se quedarían registradas como lead y nunca como venta.
//
// La firma es obligatoria: sin `webhookSecret` configurado, se rechaza.
//
// En los perfiles cuyos cobros lleva la tarea diaria (helm-automatico con sus
// enlaces de pago, p. ej. Detrás de Cámara) no se apunta nada aquí: se pone al
// día con esa misma tarea unos segundos después (_lib/stripe-automatico.js).
// Apuntarlo aquí también contaba el cobro dos veces y, en un Stripe compartido,
// metía los cobros de los otros negocios.
import { supabase } from '../lib/supabase.js'
import { writeAudit } from '../_lib/auth.js'
import { getStripeConfig } from '../_lib/stripe.js'
import { registerStripePayment, registerStripeInvoice } from '../_lib/stripe-ingest.js'
import { configAutomatico, eventoDelPerfil, programarPuestaAlDia } from '../_lib/stripe-automatico.js'

// Stripe firma el cuerpo crudo: nada de parsearlo antes de verificar.
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  // scripts/api-server.mjs guarda los bytes tal cual llegaron: es lo único
  // sobre lo que cuadra la firma (el JSON reescrito no es el mismo texto).
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
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
    const parts = sigHeader.split(',').reduce((acc, el) => {
      const [k, v] = el.split('=')
      acc[k] = v
      return acc
    }, {})
    const { t: timestamp, v1: signature } = parts
    if (!timestamp || !signature) return false
    // Anti-replay: nada de más de 5 minutos.
    const age = Date.now() / 1000 - Number(timestamp)
    if (!Number.isFinite(age) || age > 300 || age < -60) return false
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString()}`)
      .digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
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

  let rawBody, event
  try {
    rawBody = await getRawBody(req)
    event = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Cuerpo inválido' })
  }

  const { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('slug', slug).maybeSingle()
  if (!client) {
    await writeAudit({ action: 'stripe.webhook.unknown_client', req, statusCode: 404, metadata: { slug } })
    return res.status(404).json({ error: 'Perfil no encontrado' })
  }

  const row = await getStripeConfig(supabase, client.id)
  const cfg = row?.config || {}
  if (!row?.enabled || !cfg.apiKey) {
    await writeAudit({ clientId: client.id, action: 'stripe.webhook.not_linked', req, statusCode: 503 })
    return res.status(503).json({ error: 'Este perfil no tiene Stripe enlazado' })
  }
  if (!cfg.webhookSecret) {
    await writeAudit({ clientId: client.id, action: 'stripe.webhook.secret_missing', req, statusCode: 503 })
    return res.status(503).json({ error: 'Falta el secreto de firma del webhook' })
  }
  if (!(await verifySignature(rawBody, req.headers['stripe-signature'], cfg.webhookSecret))) {
    await writeAudit({ clientId: client.id, action: 'stripe.webhook.invalid_signature', req, statusCode: 400 })
    return res.status(400).json({ error: 'Firma inválida' })
  }

  // Perfil llevado por la tarea diaria: se le pasa a ella y listo. Si no se
  // puede saber si lo es (la base falla), 500 y que Stripe reintente: tomarlo
  // por «no» apuntaría el cobro suelto, quizá de otro negocio.
  let auto
  try {
    auto = await configAutomatico(supabase, client.id)
  } catch (err) {
    console.error(`[stripe webhook] ${client.slug}: no se pudo leer la tarea diaria —`, err.message)
    return res.status(500).json({ error: 'No se pudo leer la configuración del perfil' })
  }
  if (auto) {
    if (!eventoDelPerfil(auto, event)) return res.status(200).json({ received: true, outcome: `ignorado:${event?.type}` })
    programarPuestaAlDia({
      supabase, clientId: client.id, config: auto, apiKeyEnlazada: cfg.apiKey,
      alTerminar: (err, r, intento) => {
        if (err) {
          console.error(`[stripe webhook] ${client.slug}: no se pudo poner al día (intento ${intento}) —`, err.message)
          writeAudit({ clientId: client.id, action: 'stripe.webhook.error', statusCode: 500, errorMessage: err.message, metadata: { automatico: true, intento } }).catch(() => {})
        } else if (r?.ops?.length || r?.errores?.length) {
          writeAudit({ clientId: client.id, action: 'stripe.webhook.automatico', metadata: { ventas: r.ventas, finanzas: r.finanzas, ops: r.ops, errores: r.errores } }).catch(() => {})
        }
      },
    })
    return res.status(200).json({ received: true, outcome: 'automatico' })
  }

  // El mismo evento no se atiende dos veces: se apunta su id antes de
  // procesarlo y la clave única hace que la segunda entrega choque (ver
  // migrations/101_stripe_eventos.sql). Sin la tabla (migración sin aplicar)
  // se sigue como antes: pagos.js ya descarta la venta repetida que encuentra.
  const eventId = /^evt_[A-Za-z0-9_]+$/.test(String(event?.id || '')) ? event.id : null
  let apuntado = false
  if (eventId) {
    const { error } = await supabase.from('helm_stripe_eventos')
      .insert({ event_id: eventId, client_id: client.id, tipo: String(event.type || '').slice(0, 80) })
    if (error?.code === '23505') return res.status(200).json({ received: true, outcome: 'duplicate' })
    if (error) console.warn('[stripe webhook] no se pudo apuntar el evento:', error.message)
    else apuntado = true
  }

  try {
    if (event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded') {
      const outcome = await registerStripePayment({
        supabase, clientId: client.id, apiKey: cfg.apiKey, session: event.data.object,
      })
      return res.status(200).json({ received: true, outcome })
    }

    if (event.type === 'invoice.paid') {
      const outcome = await registerStripeInvoice({
        supabase, clientId: client.id, invoice: event.data.object,
      })
      return res.status(200).json({ received: true, outcome })
    }

    return res.status(200).json({ received: true, outcome: `ignorado:${event.type}` })
  } catch (err) {
    // Se suelta el apunte: si no, el reintento de Stripe se tomaría por
    // repetido y el pago no se registraría nunca.
    if (apuntado) await supabase.from('helm_stripe_eventos').delete().eq('event_id', eventId)
    await writeAudit({
      clientId: client.id, action: 'stripe.webhook.error', req,
      statusCode: 500, errorMessage: err.message, metadata: { eventType: event?.type },
    })
    // 500 → Stripe reintenta. Correcto si el fallo es transitorio.
    return res.status(500).json({ error: 'Error procesando el evento' })
  }
}
