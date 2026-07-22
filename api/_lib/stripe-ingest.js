// HELM — qué pasa cuando entra un pago de Stripe.
//
// Lo comparten el webhook (tiempo real) y el sync manual de Ajustes, para que
// un pago se registre exactamente igual venga por donde venga:
//
//   1. Se registra la venta en `sales` (con sus UTMs si Stripe los trae)
//   2. Se busca o crea el contacto en el CRM y se marca como ganado
//   3. Se deja la actividad en su timeline
//   4. Se da de alta el producto si es nuevo
//
// La deduplicación va por `sales.source`, que guarda el id de Stripe:
// `stripe:cs_...` para checkouts y `stripe:inv_...` para facturas. Reimportar
// mil veces no duplica nada.
import { stripeFor } from './stripe.js'

const today = () => new Date().toISOString().slice(0, 10)

async function alreadyImported(supabase, clientId, source) {
  const { data } = await supabase
    .from('sales').select('id').eq('client_id', clientId).eq('source', source).limit(1)
  return Boolean(data?.length)
}

async function findOrCreateContact(supabase, clientId, { email, name, phone }) {
  if (!email) return null
  const { data: existing } = await supabase
    .from('crm_contacts').select('id, name, email')
    .eq('client_id', clientId).ilike('email', email).limit(1)
  if (existing?.length) return existing[0]

  const { data: created } = await supabase
    .from('crm_contacts').insert({
      client_id: clientId,
      name: name || email.split('@')[0],
      email,
      phone: phone || '',
      status: 'won',
      source: 'stripe',
    })
    .select('id, name, email').single()
  return created
}

async function logActivity(supabase, clientId, contactId, title, description) {
  if (!contactId) return
  await supabase.from('crm_activities').insert({
    client_id: clientId,
    contact_id: contactId,
    type: 'note',
    title,
    description,
    performed_by: 'Stripe',
    performed_at: new Date().toISOString(),
  })
}

async function ensureProduct(supabase, clientId, name, price) {
  if (!name) return
  const { data } = await supabase
    .from('products').select('id').eq('client_id', clientId).eq('name', name).limit(1)
  if (data?.length) return
  await supabase.from('products').insert({ client_id: clientId, name, price: price || 0, active: true })
}

// Stripe puede traer los UTMs en metadata si la landing los pasó al checkout.
function utmsFrom(metadata = {}) {
  return {
    utm_source: metadata.utm_source || '',
    utm_medium: metadata.utm_medium || '',
    utm_campaign: metadata.utm_campaign || '',
    utm_content: metadata.utm_content || '',
  }
}

/**
 * Registra un checkout pagado. Idempotente.
 * @returns {Promise<'created'|'duplicate'|'skipped'>}
 */
export async function registerStripePayment({ supabase, clientId, apiKey, session }) {
  if (session.payment_status !== 'paid') return 'skipped'

  const source = `stripe:${session.id}`
  if (await alreadyImported(supabase, clientId, source)) return 'duplicate'

  const email = session.customer_details?.email || session.customer_email || ''
  const name = session.customer_details?.name || ''
  const phone = session.customer_details?.phone || ''
  const amount = (session.amount_total || 0) / 100
  const currency = (session.currency || 'eur').toUpperCase()

  // Nombre del producto: hay que pedir los line items aparte.
  let product = 'Pago Stripe'
  if (apiKey) {
    try {
      const items = await stripeFor(apiKey).checkoutSessions.lineItems(session.id)
      if (items?.data?.length) {
        product = items.data.map(li => li.description || 'Producto').join(', ')
      }
    } catch { /* si falla, nos quedamos con el nombre genérico */ }
  }

  const { error } = await supabase.from('sales').insert({
    client_id: clientId,
    date: session.created ? new Date(session.created * 1000).toISOString().slice(0, 10) : today(),
    client_name: name || email,
    client_email: email,
    client_phone: phone,
    product,
    payment_type: session.mode === 'subscription' ? 'Suscripción' : 'Pago único',
    payment_method: `Stripe (${session.payment_method_types?.[0] || 'card'})`,
    revenue: amount,
    cash_collected: amount,
    status: 'Completada',
    source,
    notes: `Stripe checkout ${session.id} · ${currency}`,
    ...utmsFrom(session.metadata),
  })
  if (error) throw error

  const contact = await findOrCreateContact(supabase, clientId, { email, name, phone })
  if (contact) {
    await supabase.from('crm_contacts')
      .update({ status: 'won', deal_value: amount, updated_at: new Date().toISOString() })
      .eq('id', contact.id)
    await logActivity(
      supabase, clientId, contact.id,
      `Venta Stripe: ${product}`,
      `Pago de ${amount} ${currency} vía Stripe Checkout. Sesión ${session.id}.`,
    )
  }

  await ensureProduct(supabase, clientId, product, amount)
  return 'created'
}

/**
 * Registra el cobro de una factura (suscripciones). Idempotente.
 * @returns {Promise<'created'|'duplicate'|'skipped'>}
 */
export async function registerStripeInvoice({ supabase, clientId, invoice }) {
  const amount = (invoice.amount_paid || 0) / 100
  const email = invoice.customer_email || ''
  if (!amount || !email) return 'skipped'

  const source = `stripe:inv_${invoice.id}`
  if (await alreadyImported(supabase, clientId, source)) return 'duplicate'

  const name = invoice.customer_name || ''
  const currency = (invoice.currency || 'eur').toUpperCase()
  const product = invoice.lines?.data?.[0]?.description || 'Suscripción Stripe'
  const paidAt = invoice.status_transitions?.paid_at

  const { error } = await supabase.from('sales').insert({
    client_id: clientId,
    date: paidAt ? new Date(paidAt * 1000).toISOString().slice(0, 10) : today(),
    client_name: name || email,
    client_email: email,
    product,
    payment_type: 'Suscripción',
    payment_method: 'Stripe (suscripción)',
    revenue: amount,
    cash_collected: amount,
    status: 'Completada',
    source,
    notes: `Stripe invoice ${invoice.id} · ${currency}`,
    ...utmsFrom(invoice.metadata),
  })
  if (error) throw error

  const contact = await findOrCreateContact(supabase, clientId, { email, name })
  await logActivity(
    supabase, clientId, contact?.id,
    `Pago suscripción: ${product}`,
    `Pago recurrente de ${amount} ${currency}. Factura ${invoice.id}.`,
  )

  return 'created'
}
