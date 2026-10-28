// HELM — Stripe: traducir SU payload al pago normalizado de ./pagos.js.
//
// Lo comparten el webhook (tiempo real) y el sync manual de Ajustes, para que
// un pago se registre exactamente igual venga por donde venga.
//
// Aquí ya no vive la lógica de qué hacer con un cobro (venta, contacto,
// actividad, producto): eso es común a todas las pasarelas y está en
// ./pagos.js. Este fichero solo sabe leer JSON de Stripe.
import { stripeFor } from './stripe.js'
import { registrarPago } from './pagos.js'

const fechaDeUnix = (segundos) =>
  segundos ? new Date(segundos * 1000).toISOString().slice(0, 10) : undefined

/**
 * Registra un checkout pagado. Idempotente.
 * @returns {Promise<'created'|'duplicate'|'skipped'>}
 */
export async function registerStripePayment({ supabase, clientId, apiKey, session }) {
  if (session.payment_status !== 'paid') return 'skipped'

  const importe = (session.amount_total || 0) / 100

  // Nombre del producto: Stripe no lo trae en la sesión, hay que pedir los
  // line items aparte. Si falla, se sigue con el nombre genérico.
  let producto = null
  if (apiKey) {
    try {
      const items = await stripeFor(apiKey).checkoutSessions.lineItems(session.id)
      if (items?.data?.length) {
        producto = items.data.map(li => li.description || 'Producto').join(', ')
      }
    } catch { /* nos quedamos sin nombre: registrarPago pone uno genérico */ }
  }

  return registrarPago({
    supabase,
    clientId,
    pago: {
      provider: 'stripe',
      externalId: session.id,
      date: fechaDeUnix(session.created),
      email: session.customer_details?.email || session.customer_email || '',
      name: session.customer_details?.name || '',
      phone: session.customer_details?.phone || '',
      product: producto,
      amount: importe,
      currency: session.currency,
      paymentType: session.mode === 'subscription' ? 'Suscripción' : 'Pago único',
      paymentMethod: `Stripe (${session.payment_method_types?.[0] || 'card'})`,
      utms: session.metadata,
      note: `Stripe checkout ${session.id} · ${(session.currency || 'eur').toUpperCase()}`,
      activityBody: `Pago de ${importe} ${(session.currency || 'eur').toUpperCase()} vía Stripe Checkout. Sesión ${session.id}.`,
    },
  })
}

/**
 * Registra el cobro de una factura (suscripciones). Idempotente.
 * @returns {Promise<'created'|'duplicate'|'skipped'>}
 */
export async function registerStripeInvoice({ supabase, clientId, invoice }) {
  const importe = (invoice.amount_paid || 0) / 100
  const email = invoice.customer_email || ''
  if (!importe || !email) return 'skipped'

  const moneda = (invoice.currency || 'eur').toUpperCase()
  const producto = invoice.lines?.data?.[0]?.description || 'Suscripción Stripe'

  return registrarPago({
    supabase,
    clientId,
    pago: {
      // El prefijo `inv_` separa facturas de checkouts: sin él, una factura y
      // una sesión con el mismo id colisionarían al deduplicar.
      provider: 'stripe',
      externalId: `inv_${invoice.id}`,
      date: fechaDeUnix(invoice.status_transitions?.paid_at),
      email,
      name: invoice.customer_name || '',
      product: producto,
      amount: importe,
      currency: invoice.currency,
      paymentType: 'Suscripción',
      paymentMethod: 'Stripe (suscripción)',
      recurring: true,
      utms: invoice.metadata,
      note: `Stripe invoice ${invoice.id} · ${moneda}`,
      activityTitle: `Pago suscripción: ${producto}`,
      activityBody: `Pago recurrente de ${importe} ${moneda}. Factura ${invoice.id}.`,
    },
  })
}
