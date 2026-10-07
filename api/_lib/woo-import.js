// HELM — importar una ventana de pedidos de WooCommerce.
//
// La red de seguridad de los webhooks. Woo no reintenta los webhooks fallidos
// como hace Stripe: si tu WordPress estaba caído, detrás de un caché o el
// plugin se desactivó un rato, esos pedidos se pierden para siempre. Por eso
// existe el botón "importar últimos N días": reconstruye la ventana entera y,
// como el registro es idempotente, lo que ya estaba no se duplica.
import { listAllOrders } from './woo.js'
import { registerWooOrder, ESTADOS_PAGADOS } from './woo-ingest.js'

const isoHaceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()

/**
 * @returns resumen con lo creado, lo que ya estaba y los errores por pedido.
 */
export async function importWooWindow({ supabase, clientId, cfg, days = 60 }) {
  const after = isoHaceDias(days)

  const pedidos = await listAllOrders(cfg, {
    after,
    status: [...ESTADOS_PAGADOS].join(','),
  })

  const resumen = {
    days,
    pedidos: { revisados: pedidos.length, nuevos: 0, yaEstaban: 0, descartados: 0 },
    errores: [],
    facturado: 0,
  }

  // En serie y no en paralelo: cada pedido hace varias escrituras encadenadas
  // (venta → contacto → actividad) y lanzarlas todas a la vez sobre Supabase
  // provocaba contactos duplicados cuando el mismo cliente tenía dos pedidos.
  for (const order of pedidos) {
    try {
      const outcome = await registerWooOrder({ supabase, clientId, order })
      if (outcome === 'created') {
        resumen.pedidos.nuevos++
        resumen.facturado += Number(order.total) || 0
      } else if (outcome === 'duplicate') {
        resumen.pedidos.yaEstaban++
      } else {
        resumen.pedidos.descartados++
      }
    } catch (err) {
      // Un pedido roto no puede tumbar la importación entera.
      resumen.errores.push(`Pedido #${order.number || order.id}: ${err.message}`)
    }
  }

  return resumen
}
