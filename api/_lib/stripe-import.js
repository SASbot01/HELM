// HELM — importación completa de una ventana de Stripe (por defecto 60 días).
//
// No se limita a las ventas: reconstruye la foto entera de ese periodo.
//
//   1. Checkouts pagados  → venta en `sales` + apunte de ingreso en Finanzas
//                           + contacto ganado en el CRM + actividad
//   2. Checkouts sin pagar → leads en el CRM, en la etapa que les toca:
//                            los que siguen abiertos como "propuesta"
//                            (llegaron al checkout y no pagaron) y los
//                            caducados como "perdido"
//   3. Clientes de Stripe sin compra → leads
//   4. Productos activos  → catálogo de productos con su precio y recurrencia
//   5. Un análisis escrito por la IA local con lo que ha salido de todo eso
//
// Todo es idempotente: se puede reimportar sin duplicar nada.
import { stripeFor } from './stripe.js'
import { registerStripePayment } from './stripe-ingest.js'
import { llmChat } from './llm.js'

const money = (n, cur = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 0 })
    .format(Number(n) || 0)

// ── Finanzas ───────────────────────────────────────────────────────────────
async function addFinanceEntry(supabase, clientId, { date, category, description, amount, ref }) {
  const { data: dup } = await supabase
    .from('ceo_finance_entries').select('id')
    .eq('client_id', clientId).eq('notes', ref).limit(1)
  if (dup?.length) return false

  const { error } = await supabase.from('ceo_finance_entries').insert({
    client_id: clientId, date, category, description, amount, notes: ref,
  })
  if (error) throw error
  return true
}

// ── CRM ────────────────────────────────────────────────────────────────────
// Un lead no pisa nunca a un contacto que ya existe: si ya está en el CRM se
// respeta su etapa (puede estar más avanzado que lo que dice Stripe).
async function upsertLead(supabase, clientId, { email, name, phone, status, note }) {
  if (!email) return 'skipped'
  const { data: existing } = await supabase
    .from('crm_contacts').select('id, status')
    .eq('client_id', clientId).ilike('email', email).limit(1)
  if (existing?.length) return 'existing'

  const { error } = await supabase.from('crm_contacts').insert({
    client_id: clientId,
    name: name || email.split('@')[0],
    email,
    phone: phone || '',
    status,
    source: 'stripe',
    notes: note || '',
  })
  if (error) throw error
  return 'created'
}

// ── Productos ──────────────────────────────────────────────────────────────
async function syncProducts(supabase, clientId, stripe) {
  const out = { created: 0, updated: 0 }
  const [products, prices] = await Promise.all([
    stripe.products.list({ limit: 100, active: true }),
    stripe.prices.list({ limit: 100, active: true }),
  ])

  const priceByProduct = new Map()
  for (const p of prices.data || []) {
    if (!priceByProduct.has(p.product)) priceByProduct.set(p.product, p)
  }

  for (const prod of products.data || []) {
    const price = priceByProduct.get(prod.id)
    const row = {
      client_id: clientId,
      name: prod.name,
      price: price ? (price.unit_amount || 0) / 100 : 0,
      currency: (price?.currency || 'eur').toUpperCase(),
      billing_interval: price?.recurring?.interval || null,
      active: true,
      stripe_product_id: prod.id,
      stripe_price_id: price?.id || null,
    }

    const { data: existing } = await supabase
      .from('products').select('id')
      .eq('client_id', clientId).eq('stripe_product_id', prod.id).limit(1)

    if (existing?.length) {
      await supabase.from('products').update(row).eq('id', existing[0].id)
      out.updated++
    } else {
      // Puede existir dado de alta a mano con el mismo nombre: lo enlazamos.
      const { data: byName } = await supabase
        .from('products').select('id')
        .eq('client_id', clientId).eq('name', prod.name).limit(1)
      if (byName?.length) {
        await supabase.from('products').update(row).eq('id', byName[0].id)
        out.updated++
      } else {
        await supabase.from('products').insert(row)
        out.created++
      }
    }
  }
  return out
}

/**
 * Importa la ventana completa y devuelve el resumen.
 */
export async function importStripeWindow({ supabase, clientId, apiKey, days = 60 }) {
  const stripe = stripeFor(apiKey)
  const since = Math.floor(Date.now() / 1000) - days * 86400

  const summary = {
    days,
    ventas: { nuevas: 0, yaEstaban: 0 },
    finanzas: { apuntes: 0 },
    leads: { nuevos: 0, yaEstaban: 0 },
    productos: { nuevos: 0, actualizados: 0 },
    ingresos: 0,
    moneda: 'EUR',
    porProducto: {},
    errores: [],
  }

  // 1 + 2) Checkouts de la ventana
  let sessions = { data: [] }
  try {
    sessions = await stripe.checkoutSessions.list({ limit: 100, created: { gte: since } })
  } catch (err) {
    summary.errores.push(`No se pudieron leer los checkouts: ${err.message}`)
  }

  for (const session of sessions.data || []) {
    const email = session.customer_details?.email || session.customer_email || ''
    const name = session.customer_details?.name || ''
    const phone = session.customer_details?.phone || ''

    if (session.payment_status === 'paid') {
      let outcome
      try {
        outcome = await registerStripePayment({ supabase, clientId, apiKey, session })
      } catch (err) {
        summary.errores.push(`Checkout ${session.id}: ${err.message}`)
        continue
      }
      const amount = (session.amount_total || 0) / 100
      if (outcome === 'created') {
        summary.ventas.nuevas++
        summary.ingresos += amount
        summary.moneda = (session.currency || 'eur').toUpperCase()

        // Finanzas: el ingreso, con el id de Stripe como referencia anti-duplicado.
        try {
          const added = await addFinanceEntry(supabase, clientId, {
            date: new Date((session.created || Date.now() / 1000) * 1000).toISOString().slice(0, 10),
            category: 'Ventas Stripe',
            description: name || email || 'Pago Stripe',
            amount,
            ref: `stripe:${session.id}`,
          })
          if (added) summary.finanzas.apuntes++
        } catch (err) {
          summary.errores.push(`Finanzas ${session.id}: ${err.message}`)
        }
      } else {
        summary.ventas.yaEstaban++
      }
      continue
    }

    // No pagado: es un lead, y su etapa depende de si aún puede pagar.
    const expired = session.status === 'expired'
    const outcome = await upsertLead(supabase, clientId, {
      email, name, phone,
      status: expired ? 'lost' : 'proposal',
      note: expired
        ? `Checkout de Stripe caducado sin pagar (${session.id}).`
        : `Llegó al checkout de Stripe y no completó el pago (${session.id}).`,
    }).catch(err => { summary.errores.push(`Lead ${session.id}: ${err.message}`); return 'skipped' })
    if (outcome === 'created') summary.leads.nuevos++
    else if (outcome === 'existing') summary.leads.yaEstaban++
  }

  // 3) Clientes de Stripe de la ventana que no aparecen por checkout
  try {
    const customers = await stripe.customers.list({ limit: 100, created: { gte: since } })
    for (const c of customers.data || []) {
      const outcome = await upsertLead(supabase, clientId, {
        email: c.email, name: c.name, phone: c.phone,
        status: 'lead',
        note: 'Cliente creado en Stripe sin compra registrada en el periodo.',
      })
      if (outcome === 'created') summary.leads.nuevos++
      else if (outcome === 'existing') summary.leads.yaEstaban++
    }
  } catch (err) {
    summary.errores.push(`No se pudieron leer los clientes: ${err.message}`)
  }

  // 4) Catálogo de productos
  try {
    const prods = await syncProducts(supabase, clientId, stripe)
    summary.productos.nuevos = prods.created
    summary.productos.actualizados = prods.updated
  } catch (err) {
    summary.errores.push(`Productos: ${err.message}`)
  }

  // Qué se ha vendido en la ventana, por producto (para el análisis y Finanzas)
  const { data: ventas } = await supabase
    .from('sales').select('product, revenue, date')
    .eq('client_id', clientId)
    .gte('date', new Date(since * 1000).toISOString().slice(0, 10))
    .like('source', 'stripe:%')
  for (const v of ventas || []) {
    const key = v.product || 'Sin producto'
    summary.porProducto[key] = summary.porProducto[key] || { unidades: 0, importe: 0 }
    summary.porProducto[key].unidades++
    summary.porProducto[key].importe += Number(v.revenue) || 0
  }

  return summary
}

/**
 * Pide a la IA local un análisis del periodo importado.
 * Devuelve el texto (o null si el modelo no está disponible: el import no debe
 * fallar por esto).
 */
export async function analyzeStripeWindow({ clientName, summary, knowledge = [] }) {
  const porProducto = Object.entries(summary.porProducto)
    .sort((a, b) => b[1].importe - a[1].importe)
    .map(([name, d]) => `- ${name}: ${d.unidades} ventas, ${money(d.importe, summary.moneda)}`)
    .join('\n') || '- (ninguna venta en el periodo)'

  const contexto = knowledge.length
    ? knowledge.slice(0, 6).map(k => `### ${k.title}\n${k.content}`).join('\n\n')
    : '(sin contexto guardado de este negocio)'

  const system = `Eres el analista de negocio de ${clientName} dentro de HELM.
Hablas español de España, directo y sin relleno. Analizas datos reales de cobros
de Stripe. No inventes cifras: usa solo las que te den. Si algo no se puede
concluir con estos datos, dilo en una línea en vez de rellenar.

Contexto del negocio:
${contexto}`

  const prompt = `Estos son los datos importados de Stripe de los últimos ${summary.days} días de ${clientName}:

- Ventas nuevas registradas: ${summary.ventas.nuevas} (${summary.ventas.yaEstaban} ya estaban)
- Ingresos del periodo: ${money(summary.ingresos, summary.moneda)}
- Apuntes creados en Finanzas: ${summary.finanzas.apuntes}
- Leads nuevos en el CRM: ${summary.leads.nuevos} (${summary.leads.yaEstaban} ya existían)
- Productos sincronizados: ${summary.productos.nuevos} nuevos, ${summary.productos.actualizados} actualizados

Ventas por producto:
${porProducto}

Escribe el análisis con estos apartados y nada más:

**QUÉ HA PASADO** — 2 o 3 frases con la foto del periodo.
**PRODUCTO ESTRELLA** — cuál tira y cuál no, con las cifras.
**LEADS** — qué dice el número de gente que llegó al checkout y no pagó.
**QUÉ HARÍA AHORA** — 3 acciones concretas, en imperativo, ordenadas por impacto.`

  try {
    return await llmChat({
      system,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 1200,
    })
  } catch {
    return null
  }
}
