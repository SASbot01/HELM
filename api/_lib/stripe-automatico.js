// HELM — Stripe en los perfiles que lleva la tarea diaria (helm-automatico).
//
// En esos perfiles (Detrás de Cámara) los cobros de Stripe los apunta la tarea
// diaria leyendo SOLO sus enlaces de pago, y en una venta por cliente: su plan
// fraccionado o su mensualidad (stripe-historico.js). El webhook y
// «Sincronizar» de Ajustes, en cambio, apuntaban cada cobro como una venta
// suelta: el mismo pago contaba dos veces y, con un Stripe compartido entre
// negocios, entraban los cobros de los demás.
//
// En esos perfiles, el webhook y «Sincronizar» no apuntan nada por su cuenta:
// ponen al día lo de Stripe con la misma tarea (lo que haría a la mañana
// siguiente, pero ya). Los demás perfiles siguen como siempre.
import { SERVICIO } from './automatico.js'
import { historicoPorEnlaces } from './stripe-historico.js'

/** La configuración de la tarea diaria del perfil si lleva sus cobros de Stripe; si no, null. */
export async function configAutomatico(supabase, clientId) {
  const { data, error } = await supabase.from('user_integrations')
    .select('config').eq('client_id', clientId).eq('service', SERVICIO).eq('enabled', true).limit(1)
  if (error) throw error
  const config = data?.[0]?.config
  return config?.stripe?.enlaces?.length ? config : null
}

/** ¿Este evento puede tocar los cobros del perfil? Un checkout de un enlace que
 *  no es suyo (otro negocio del mismo Stripe) no. Una factura no se sabe sin
 *  preguntar a Stripe: por si es una cuota de sus suscripciones, sí. */
export function eventoDelPerfil(config, event) {
  const tipo = String(event?.type || '')
  if (tipo === 'invoice.paid') return true
  if (tipo === 'checkout.session.completed' || tipo === 'checkout.session.async_payment_succeeded') {
    const enlace = event?.data?.object?.payment_link
    return Boolean(enlace) && config.stripe.enlaces.some(e => e.id === enlace)
  }
  return false
}

/** Pone al día lo de Stripe del perfil con la tarea diaria. La clave es la de
 *  la tarea (por nombre de variable); si no está, la enlazada en Ajustes. */
export async function ponerStripeAlDia({ supabase, clientId, config, apiKeyEnlazada = null }) {
  const apiKey = process.env[config.stripe.clave || 'HELM_STRIPE_SECRET_KEY'] || apiKeyEnlazada
  if (!apiKey) throw new Error('No hay clave de Stripe para la tarea diaria')
  return historicoPorEnlaces({
    supabase, clientId, apiKey,
    enlaces: config.stripe.enlaces,
    mensualidad: config.stripe.mensualidad || null,
    alias: config.stripe.alias || {},
  })
}

// El webhook: un cobro trae varios avisos seguidos (el checkout, la factura…).
// Se espera un poco y se pone al día una sola vez; si ya hay una en marcha para
// ese perfil, la siguiente va detrás, nunca a la vez.
const enCola = new Map()      // clientId → temporizador
const enMarcha = new Map()    // clientId → promesa
export function programarPuestaAlDia({ supabase, clientId, config, apiKeyEnlazada = null, esperaMs = 20_000, alTerminar = null }) {
  clearTimeout(enCola.get(clientId))
  enCola.set(clientId, setTimeout(() => {
    enCola.delete(clientId)
    const antes = enMarcha.get(clientId) || Promise.resolve()
    const p = antes.catch(() => {})
      .then(() => ponerStripeAlDia({ supabase, clientId, config, apiKeyEnlazada }))
      .then(r => alTerminar?.(null, r), err => alTerminar?.(err, null))
      .finally(() => { if (enMarcha.get(clientId) === p) enMarcha.delete(clientId) })
    enMarcha.set(clientId, p)
  }, esperaMs))
}
