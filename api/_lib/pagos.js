// HELM — qué pasa cuando entra un pago, venga de donde venga.
//
// Antes esto vivía dentro de stripe-ingest.js y era, en la práctica, genérico:
// de los cinco pasos que da al cobrar, ninguno depende de Stripe. Al añadir una
// segunda pasarela habría que haberlo copiado entero, y a partir de ahí las dos
// copias se separan: se arregla un fallo en una y no en la otra.
//
// Ahora cada pasarela solo traduce SU payload a `Pago` (abajo) y llama aquí:
//
//   1. Descarta el pago si ya estaba importado
//   2. Registra la venta en `sales` con sus UTMs
//   3. Busca o crea el contacto en el CRM y lo marca como ganado
//   4. Deja la actividad en su timeline
//   5. Da de alta el producto si es nuevo
//
// La deduplicación va por `sales.source`, que guarda `<pasarela>:<id externo>`
// — `stripe:cs_...`, `woo:1042`. Reimportar mil veces no duplica nada, y el
// prefijo mantiene separados los orígenes aunque dos pasarelas usen el mismo
// número de pedido.

/**
 * @typedef {Object} Pago  Un cobro ya normalizado, listo para registrar.
 * @property {string}  provider     'stripe' | 'woo' | …
 * @property {string}  externalId   id del pago EN esa pasarela (para deduplicar)
 * @property {string}  [date]       'YYYY-MM-DD'. Si falta, hoy.
 * @property {string}  [email]
 * @property {string}  [name]
 * @property {string}  [phone]
 * @property {string}  [product]
 * @property {number}  amount       importe cobrado
 * @property {string}  [currency]
 * @property {string}  [paymentType]    'Pago único' | 'Suscripción' | …
 * @property {string}  [paymentMethod]
 * @property {Object}  [utms]       { utm_source, utm_medium, utm_campaign, utm_content }
 * @property {string}  [note]       para el campo notes de la venta
 * @property {boolean} [recurring]  cobro de una suscripción ya existente
 * @property {string}  [activityTitle]
 * @property {string}  [activityBody]
 * @property {string}  [actor]      quién lo registra en el timeline ('Stripe', 'WooCommerce')
 */

const hoy = () => new Date().toISOString().slice(0, 10)

// Nombre de la pasarela tal y como se lee en la interfaz.
const ETIQUETA = { stripe: 'Stripe', woo: 'WooCommerce' }
export const etiquetaDe = (provider) => ETIQUETA[provider] || provider

export const sourceDe = (provider, externalId) => `${provider}:${externalId}`

async function yaImportado(supabase, clientId, source) {
  const { data } = await supabase
    .from('sales').select('id').eq('client_id', clientId).eq('source', source).limit(1)
  return Boolean(data?.length)
}

// El contacto se busca por email sin distinguir mayúsculas: la misma persona
// comprando dos veces no puede acabar como dos leads.
export async function buscarOCrearContacto(supabase, clientId, { email, name, phone, provider }) {
  if (!email) return null
  const { data: existente } = await supabase
    .from('crm_contacts').select('id, name, email')
    .eq('client_id', clientId).ilike('email', email).limit(1)
  if (existente?.length) return existente[0]

  const { data: creado } = await supabase
    .from('crm_contacts').insert({
      client_id: clientId,
      name: name || email.split('@')[0],
      email,
      phone: phone || '',
      status: 'won',
      source: provider,
    })
    .select('id, name, email').single()
  return creado
}

// `fecha`: cuándo pasó, si no es ahora (al importar un histórico).
export async function registrarActividad(supabase, clientId, contactId, { title, description, actor, fecha }) {
  if (!contactId) return
  await supabase.from('crm_activities').insert({
    client_id: clientId,
    contact_id: contactId,
    type: 'note',
    title,
    description,
    performed_by: actor || '',
    performed_at: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
  })
}

export async function asegurarProducto(supabase, clientId, name, price) {
  if (!name) return
  const { data } = await supabase
    .from('products').select('id').eq('client_id', clientId).eq('name', name).limit(1)
  if (data?.length) return
  await supabase.from('products').insert({ client_id: clientId, name, price: price || 0, active: true })
}

// Solo las cuatro UTMs que guarda `sales`; cualquier otra cosa que traiga la
// pasarela en metadata se ignora.
export function utmsDe(metadata = {}) {
  return {
    utm_source: metadata.utm_source || '',
    utm_medium: metadata.utm_medium || '',
    utm_campaign: metadata.utm_campaign || '',
    utm_content: metadata.utm_content || '',
  }
}

/**
 * Registra un pago ya normalizado. Idempotente.
 * @param {{ supabase: any, clientId: string, pago: Pago }} args
 * @returns {Promise<'created'|'duplicate'|'skipped'>}
 */
export async function registrarPago({ supabase, clientId, pago }) {
  const importe = Number(pago.amount) || 0
  // Sin importe o sin id no hay nada que registrar: se descarta en vez de
  // meter una venta de 0 € que luego ensucia todos los informes.
  if (!importe || !pago.externalId) return 'skipped'

  const source = sourceDe(pago.provider, pago.externalId)
  if (await yaImportado(supabase, clientId, source)) return 'duplicate'

  const marca = etiquetaDe(pago.provider)
  const email = pago.email || ''
  const nombre = pago.name || ''
  const producto = pago.product || `Pago ${marca}`
  const moneda = (pago.currency || 'eur').toUpperCase()

  const { error } = await supabase.from('sales').insert({
    client_id: clientId,
    date: pago.date || hoy(),
    client_name: nombre || email,
    client_email: email,
    client_phone: pago.phone || '',
    product: producto,
    payment_type: pago.paymentType || 'Pago único',
    payment_method: pago.paymentMethod || marca,
    revenue: importe,
    cash_collected: importe,
    status: 'Completada',
    source,
    notes: pago.note || `${marca} ${pago.externalId} · ${moneda}`,
    ...utmsDe(pago.utms),
  })
  if (error) throw error

  const contacto = await buscarOCrearContacto(supabase, clientId, {
    email, name: nombre, phone: pago.phone, provider: pago.provider,
  })

  if (contacto) {
    // En un cobro recurrente NO se toca el valor del trato: la cuota de este
    // mes no es lo que vale el cliente, y sobrescribirlo convertiría una
    // suscripción anual de 2.400 € en un trato de 200 € al cobrar su mensualidad.
    const patch = { status: 'won', updated_at: new Date().toISOString() }
    if (!pago.recurring) patch.deal_value = importe

    // El error se mira a propósito. Esta llamada llevaba tiempo fallando en
    // silencio por un trigger roto en crm_contacts, y como nadie comprobaba el
    // resultado, los compradores nunca pasaban a "ganado" y no había ni rastro
    // de por qué. No se lanza excepción: la venta ya está registrada y hacer
    // fallar el webhook entero por esto la dejaría sin poder reintentarse.
    const { error: errContacto } = await supabase
      .from('crm_contacts').update(patch).eq('id', contacto.id)
    if (errContacto) {
      console.warn(`[helm] ${pago.provider}: no se pudo marcar el contacto como ganado —`, errContacto.message)
    }

    await registrarActividad(supabase, clientId, contacto.id, {
      title: pago.activityTitle || `Venta ${marca}: ${producto}`,
      description: pago.activityBody || `Pago de ${importe} ${moneda} vía ${marca}. Referencia ${pago.externalId}.`,
      actor: pago.actor || marca,
    })
  }

  await asegurarProducto(supabase, clientId, producto, importe)
  return 'created'
}
