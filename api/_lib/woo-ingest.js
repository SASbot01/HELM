// HELM — WooCommerce: traducir un pedido al pago normalizado de ./pagos.js.
//
// Un pedido de Woo es más rico que un checkout de Stripe (trae dirección,
// líneas con nombre y cantidad, cupones, meta_data), pero para HELM lo que
// importa es lo mismo: quién, cuánto, qué y cuándo.
//
// Solo cuentan los pedidos realmente cobrados. Woo tiene ocho estados y solo
// dos significan dinero en caja:
//   completed  → pagado y entregado
//   processing → pagado, pendiente de enviar (lo normal en digital)
// El resto (pending, on-hold, cancelled, refunded, failed, trash) NO son venta.
// Registrar un 'pending' como venta era el error clásico de estas
// integraciones: infla la facturación con carritos que nunca se pagaron.
import { registrarPago } from './pagos.js'

export const ESTADOS_PAGADOS = new Set(['completed', 'processing'])

// Woo devuelve la fecha ya en la zona de la tienda ('2026-07-24T10:33:12').
const fechaDe = (order) => {
  const raw = order.date_paid || order.date_completed || order.date_created
  return raw ? String(raw).slice(0, 10) : undefined
}

// Nombre del producto: las líneas del pedido, con cantidad si hay más de una.
function productoDe(order) {
  const lineas = Array.isArray(order.line_items) ? order.line_items : []
  if (!lineas.length) return null
  return lineas
    .map(li => (Number(li.quantity) > 1 ? `${li.name} ×${li.quantity}` : li.name))
    .join(', ')
}

// Las UTMs pueden llegar por dos vías: `meta_data` (lo que dejan los plugins de
// atribución) o los campos nativos de origen que Woo añadió en la 8.5.
function utmsDe(order) {
  const meta = {}
  for (const m of (order.meta_data || [])) {
    const k = String(m.key || '').replace(/^_+/, '').toLowerCase()
    if (k.startsWith('utm_')) meta[k] = String(m.value ?? '')
  }
  const attr = order._wc_order_attribution || {}
  return {
    utm_source: meta.utm_source || attr.utm_source || attr.source_type || '',
    utm_medium: meta.utm_medium || attr.utm_medium || '',
    utm_campaign: meta.utm_campaign || attr.utm_campaign || '',
    utm_content: meta.utm_content || attr.utm_content || '',
  }
}

const nombreDe = (order) => {
  const b = order.billing || {}
  return [b.first_name, b.last_name].filter(Boolean).join(' ').trim()
    || b.company
    || ''
}

/**
 * Registra un pedido pagado de WooCommerce. Idempotente.
 * @returns {Promise<'created'|'duplicate'|'skipped'>}
 */
export async function registerWooOrder({ supabase, clientId, order }) {
  if (!order || !ESTADOS_PAGADOS.has(String(order.status || '').toLowerCase())) return 'skipped'

  const importe = Number(order.total) || 0
  const moneda = (order.currency || 'eur').toUpperCase()
  const billing = order.billing || {}
  const producto = productoDe(order)
  // El número visible del pedido puede diferir del id interno si hay un plugin
  // de numeración; para deduplicar manda el id, que nunca cambia.
  const referencia = order.number || order.id

  return registrarPago({
    supabase,
    clientId,
    pago: {
      provider: 'woo',
      externalId: String(order.id),
      date: fechaDe(order),
      email: billing.email || '',
      name: nombreDe(order),
      phone: billing.phone || '',
      product: producto,
      amount: importe,
      currency: order.currency,
      // Woo marca las suscripciones con su propio tipo de pedido cuando está
      // el plugin de Subscriptions; si no, todo es pago único.
      paymentType: order.parent_id ? 'Suscripción' : 'Pago único',
      recurring: Boolean(order.parent_id),
      paymentMethod: `WooCommerce (${order.payment_method_title || order.payment_method || 'pedido'})`,
      utms: utmsDe(order),
      note: `WooCommerce pedido #${referencia} · ${moneda} · ${order.status}`,
      activityTitle: `Venta WooCommerce: ${producto || `pedido #${referencia}`}`,
      activityBody: `Pago de ${importe} ${moneda} en la tienda. Pedido #${referencia} (${order.payment_method_title || order.payment_method || 'sin método'}).`,
    },
  })
}
