// HELM — el histórico de un perfil que cobra en un Stripe compartido.
//
// Hay negocios que no tienen Stripe propio y cobran con el de otro (Detrás de
// Cámaras cobra en el Stripe de Silvestre). Enlazar esa cuenta entera al perfil
// le metería las ventas de todos los demás productos, así que aquí se importa
// SOLO lo que entró por sus enlaces de pago:
//
//   enlace de pago único       → una venta por checkout pagado
//   enlace de suscripción      → una venta por factura cobrada (como el webhook)
//   enlace de plan fraccionado → UNA venta «Fraccionado» por cliente, con sus
//                                cuotas cobradas, el importe de cada una y el
//                                inicio y fin del plan (como las de Ventas)
//   enlaces de mensualidad     → UNA venta «Suscripción» por cliente con todo
//                                lo que lleva pagado, venga de la suscripción o
//                                del enlace suelto con el que paga cada mes
//                                (para el negocio es lo mismo). Si ese cliente
//                                tiene un plan fraccionado abierto, sus pagos
//                                sueltos son cuotas de ese plan.
//
// Cada cobro deja además su apunte en Finanzas y su actividad en el CRM, con la
// fecha en que pasó. Si alguien ya había metido a mano la venta de un plan
// (mismo email y producto, fecha cercana), se vincula a Stripe en vez de
// duplicarla.
//
// Todo es idempotente (sales.source = stripe:<id>): se puede repetir para
// ponerse al día. Con `prueba: true` no escribe nada y devuelve lo que haría.
import crypto from 'node:crypto'
import { stripeRequest } from './stripe.js'
import { registrarPago, buscarOCrearContacto, registrarActividad, asegurarProducto } from './pagos.js'
import { addFinanceEntry, upsertLead } from './stripe-import.js'

const DIA = 86_400_000
// El nombre de pila sin tildes ni mayúsculas: para reconocer una venta manual
// que se metió sin email.
const pila = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/)[0] || ''
const dia = (seg) => new Date(seg * 1000).toISOString().slice(0, 10)
const redondea = (n) => Math.round(Number(n) * 100) / 100
// Un mes más en el calendario (31 ene + 1 → 28/29 feb, no 3 de marzo).
function masMeses(iso, n) {
  const f = new Date(`${iso}T12:00:00Z`)
  const d = f.getUTCDate()
  f.setUTCDate(1)
  f.setUTCMonth(f.getUTCMonth() + n)
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate()
  f.setUTCDate(Math.min(d, ultimo))
  return f.toISOString().slice(0, 10)
}

async function todas(apiKey, ruta, params = {}) {
  const out = []
  let tras = null
  for (;;) {
    const j = await stripeRequest(apiKey, ruta, { body: { ...params, limit: 100, ...(tras ? { starting_after: tras } : {}) } })
    out.push(...(j.data || []))
    if (!j.has_more || !j.data?.length) return out
    tras = j.data.at(-1).id
  }
}

/**
 * @param {Object}   o
 * @param {string}   o.clientId
 * @param {string}   o.apiKey      la clave de la cuenta de Stripe donde cobra
 * @param {Array<{id: string, cuotas?: number, total?: number, mensual?: boolean}>} o.enlaces
 *        sus enlaces de pago; `cuotas` (y opcionalmente `total`) marca los de
 *        un plan fraccionado de N cuotas y `mensual` los de la mensualidad
 * @param {string}   [o.mensualidad] nombre del producto de la mensualidad
 * @param {Object<string, string>} [o.alias] correos que son de otro cliente:
 *        { 'quien-paga@…': 'el-cliente@…' }. Para quien paga su mensualidad con
 *        el enlace suelto desde otro correo (otra persona, su tarjeta…): esos
 *        pagos van a SU mensualidad y no a una nueva a nombre de quien pagó.
 * @param {boolean}  [o.leads]     los checkouts sin pagar con email, al CRM
 * @param {boolean}  [o.prueba]    no escribe nada
 */
export async function historicoPorEnlaces({ supabase, clientId, apiKey, enlaces, mensualidad = null, alias = {}, leads = false, prueba = false }) {
  const deQuien = Object.fromEntries(Object.entries(alias || {}).map(([a, b]) => [String(a).toLowerCase().trim(), String(b).toLowerCase().trim()]))
  const r = {
    prueba, enlaces: [], ventas: { nuevas: 0, yaEstaban: 0, vinculadas: 0, actualizadas: 0 },
    finanzas: 0, leads: 0, enlacesGuardados: 0, cobrado: 0, ops: [], errores: [],
  }
  const op = (texto) => r.ops.push(texto)
  // Los pagos de la mensualidad se juntan por cliente y se escriben al final:
  // los de un mismo cliente pueden venir de dos enlaces distintos.
  const mensuales = new Map()
  let nombreMensualidad = mensualidad

  for (const e of enlaces) {
    const link = await stripeRequest(apiKey, `/payment_links/${e.id}`)
    const items = await stripeRequest(apiKey, `/payment_links/${e.id}/line_items`, { body: { limit: 10 } })
    const li = items.data?.[0]
    const producto = items.data?.map(i => i.description).join(' + ') || 'Pago Stripe'
    const recurrente = Boolean(li?.price?.recurring)
    const cuotas = Number(e.cuotas) || 0
    const tipo = e.mensual ? 'mensual' : cuotas >= 2 ? 'fraccionado' : (recurrente ? 'suscripcion' : 'unico')
    if (tipo === 'mensual' && !nombreMensualidad) nombreMensualidad = `${producto} · mensualidad`
    const sesiones = await todas(apiKey, '/checkout/sessions', { payment_link: e.id })
    const pagadas = sesiones.filter(s => s.payment_status === 'paid')
    r.enlaces.push({ id: e.id, producto, tipo, url: link.url, activo: link.active, sesiones: sesiones.length, pagadas: pagadas.length })

    // El enlace, a la sección Enlaces del perfil (si sigue activo y no estaba).
    if (link.active) {
      const { data: ya } = await supabase.from('helm_links').select('id').eq('client_id', clientId).eq('url', link.url).limit(1)
      if (!ya?.length) {
        op(`Enlace: ${producto} → ${link.url}`)
        if (!prueba) {
          const { error } = await supabase.from('helm_links').insert({
            client_id: clientId, title: `Pago · ${producto}`, url: link.url, category: 'Ventas',
            notes: `Enlace de pago de Stripe (${e.id})${tipo === 'fraccionado' ? ` · plan de ${cuotas} cuotas` : tipo === 'mensual' ? ' · mensualidad' : ''}`,
          })
          if (error) r.errores.push(`Enlace ${e.id}: ${error.message}`)
          else r.enlacesGuardados++
        } else r.enlacesGuardados++
      }
    }

    for (const s of pagadas) {
      const email = s.customer_details?.email || s.customer_email || ''
      const nombre = s.customer_details?.name || ''
      const telefono = s.customer_details?.phone || ''
      try {
        if (tipo === 'mensual') {
          // Con alias, el pago es del cliente al que apunta: su correo y, en
          // cuanto aparezca un pago suyo, su nombre (no el de quien pagó).
          const propio = email ? deQuien[email.toLowerCase()] : null
          const clave = propio || (email ? email.toLowerCase() : `nombre:${pila(nombre)}`)
          const g = mensuales.get(clave) || { email: propio || email, nombre: propio ? '' : nombre, telefono: propio ? '' : telefono, pagos: [], subs: [] }
          if (!propio) { g.nombre = g.nombre || nombre; g.telefono = g.telefono || telefono }
          if (s.mode === 'subscription' && s.subscription) {
            const sub = await stripeRequest(apiKey, `/subscriptions/${s.subscription}`)
            const facturas = (await todas(apiKey, '/invoices', { subscription: sub.id })).filter(i => i.status === 'paid' && i.amount_paid > 0)
            for (const f of facturas) g.pagos.push({ ref: `inv_${f.id}`, fecha: dia(f.status_transitions?.paid_at || f.created), importe: f.amount_paid / 100, suelto: false })
            g.subs.push({ id: sub.id, estado: sub.status, ultimo: facturas.length ? Math.max(...facturas.map(f => f.status_transitions?.paid_at || f.created)) : null })
          } else {
            g.pagos.push({ ref: s.id, fecha: dia(s.created), importe: (s.amount_total || 0) / 100, suelto: true })
          }
          mensuales.set(clave, g)
        } else if (s.mode === 'subscription' && s.subscription) {
          const sub = await stripeRequest(apiKey, `/subscriptions/${s.subscription}`)
          const facturas = (await todas(apiKey, '/invoices', { subscription: sub.id }))
            .filter(i => i.status === 'paid' && i.amount_paid > 0)
            .sort((a, b) => (a.status_transitions?.paid_at || a.created) - (b.status_transitions?.paid_at || b.created))
          if (tipo === 'fraccionado') await planFraccionado({ supabase, clientId, r, op, prueba, e, cuotas, producto, sub, facturas, email, nombre, telefono })
          else await suscripcion({ supabase, clientId, r, op, prueba, producto, sub, facturas, email, nombre, telefono })
        } else {
          await pagoUnico({ supabase, clientId, r, op, prueba, producto, s, email, nombre, telefono })
        }
      } catch (err) {
        r.errores.push(`${s.id}: ${err.message}`)
      }
    }

    if (leads) {
      for (const s of sesiones.filter(x => x.payment_status !== 'paid')) {
        const email = s.customer_details?.email || s.customer_email
        if (!email) continue
        // Si la misma persona acabó pagando por otro enlace, no es un lead perdido.
        if (await yaCompro(supabase, clientId, email)) continue
        op(`Lead (${s.status === 'expired' ? 'perdido' : 'propuesta'}): ${tapa(email)} · ${producto}`)
        if (prueba) { r.leads++; continue }
        const res = await upsertLead(supabase, clientId, {
          email, name: s.customer_details?.name, phone: s.customer_details?.phone,
          status: s.status === 'expired' ? 'lost' : 'proposal',
          note: `Llegó al pago de «${producto}» el ${dia(s.created)} y no lo completó (${s.id}).`,
        }).catch(err => { r.errores.push(`Lead ${s.id}: ${err.message}`); return null })
        if (res === 'created') r.leads++
      }
    }
  }

  for (const g of mensuales.values()) {
    try { await mensualidadDe({ supabase, clientId, r, op, prueba, producto: nombreMensualidad, g }) }
    catch (err) { r.errores.push(`Mensualidad de ${tapa(g.email) || g.nombre}: ${err.message}`) }
  }
  r.cobrado = redondea(r.cobrado)
  return r
}

// En lo que se enseña se tapa el email: basta para reconocerlo.
export const tapa = (email) => String(email || '').replace(/^(.)[^@]*(@.*)$/, '$1***$2') || 'sin email'

async function yaCompro(supabase, clientId, email) {
  const { data } = await supabase.from('sales').select('id').eq('client_id', clientId).ilike('client_email', email).limit(1)
  return Boolean(data?.length)
}

// Devuelve si el apunte es nuevo (o lo sería, en prueba).
async function finanzas({ supabase, clientId, r, prueba }, { fecha, descripcion, importe, ref }) {
  if (prueba) {
    const { data } = await supabase.from('ceo_finance_entries').select('id').eq('client_id', clientId).eq('notes', ref).limit(1)
    if (!data?.length) { r.finanzas++; return true }
    return false
  }
  const nuevo = await addFinanceEntry(supabase, clientId, { date: fecha, category: 'Ventas Stripe', description: descripcion, amount: importe, ref })
  if (nuevo) r.finanzas++
  return nuevo
}

async function pagoUnico(c) {
  const { supabase, clientId, r, op, prueba, producto, s, email, nombre, telefono } = c
  const importe = (s.amount_total || 0) / 100
  const fecha = dia(s.created)
  const source = `stripe:${s.id}`
  r.cobrado += importe
  const { data: ya } = await supabase.from('sales').select('id').eq('client_id', clientId).eq('source', source).limit(1)
  if (ya?.length) { r.ventas.yaEstaban++ } else {
    op(`Venta ${fecha}: ${producto} · ${importe} € · ${tapa(email)} (pago único)`)
    if (prueba) r.ventas.nuevas++
    else {
      const res = await registrarPago({
        supabase, clientId,
        pago: {
          provider: 'stripe', externalId: s.id, date: fecha, email, name: nombre, phone: telefono,
          product: producto, amount: importe, currency: s.currency, paymentType: 'Pago único',
          paymentMethod: `Stripe (${s.payment_method_types?.[0] || 'card'})`, utms: s.metadata,
          note: `Stripe · enlace de pago ${s.payment_link} · checkout ${s.id}`,
        },
      })
      if (res === 'created') r.ventas.nuevas++
      else r.ventas.yaEstaban++
    }
  }
  await finanzas(c, { fecha, descripcion: `${producto} · ${nombre || email}`, importe, ref: source })
}

// Suscripción sin fin: una venta por cada factura cobrada, como hace el webhook.
async function suscripcion(c) {
  const { supabase, clientId, r, op, prueba, producto, sub, facturas, email, nombre, telefono } = c
  for (const f of facturas) {
    const importe = f.amount_paid / 100
    const fecha = dia(f.status_transitions?.paid_at || f.created)
    const source = `stripe:inv_${f.id}`
    r.cobrado += importe
    const { data: ya } = await supabase.from('sales').select('id').eq('client_id', clientId).eq('source', source).limit(1)
    if (ya?.length) { r.ventas.yaEstaban++ } else {
      op(`Cuota ${fecha}: ${producto} · ${importe} € · ${tapa(email)} (suscripción ${sub.status})`)
      if (prueba) r.ventas.nuevas++
      else {
        const res = await registrarPago({
          supabase, clientId,
          pago: {
            provider: 'stripe', externalId: `inv_${f.id}`, date: fecha, email, name: nombre || f.customer_name, phone: telefono,
            product: producto, amount: importe, currency: f.currency, paymentType: 'Suscripción',
            paymentMethod: 'Stripe (suscripción)', recurring: true, utms: f.metadata,
            note: `Stripe · suscripción ${sub.id} (${sub.status}) · factura ${f.id}`,
            activityTitle: `Cuota cobrada: ${producto}`,
            activityBody: `Cuota de ${importe} € cobrada el ${fecha} (suscripción ${sub.id}, factura ${f.id}).`,
          },
        })
        if (res === 'created') r.ventas.nuevas++
        else r.ventas.yaEstaban++
      }
    }
    await finanzas(c, { fecha, descripcion: `${producto} · cuota · ${nombre || email}`, importe, ref: source })
  }
}

// Plan fraccionado: una sola venta con sus cuotas, que se pone al día cada vez.
async function planFraccionado(c) {
  const { supabase, clientId, r, op, prueba, e, cuotas, producto, sub, facturas, email, nombre, telefono } = c
  const cuota = redondea((sub.items?.data?.[0]?.price?.unit_amount ?? facturas[0]?.amount_paid ?? 0) / 100)
  const total = Number(e.total) || redondea(cuota * cuotas)
  const cobrado = redondea(facturas.reduce((a, f) => a + f.amount_paid, 0) / 100)
  const pagadas = Math.min(facturas.length, cuotas)
  const inicio = dia(facturas[0]?.status_transitions?.paid_at || sub.start_date || sub.created)
  const fin = masMeses(inicio, cuotas - 1)
  const source = `stripe:${sub.id}`
  const datos = {
    payment_type: 'Fraccionado', payment_method: 'Stripe (suscripción)',
    revenue: total, cash_collected: cobrado,
    installments_total: cuotas, installments_paid: pagadas, installment_amount: cuota,
    plan_start: inicio, plan_end: fin, source,
  }
  const nota = `Stripe · plan de ${cuotas} cuotas de ${cuota} € (suscripción ${sub.id}, ${sub.status}). Cobradas ${pagadas} de ${cuotas}.`

  const { data: ya } = await supabase.from('sales').select('id, installments_paid, cash_collected').eq('client_id', clientId).eq('source', source).limit(1)
  if (ya?.length) {
    if (Number(ya[0].installments_paid) !== pagadas || Number(ya[0].cash_collected) !== cobrado) {
      op(`Plan al día: ${producto} · ${tapa(email)} · ${pagadas}/${cuotas} cuotas, ${cobrado} €`)
      if (!prueba) await supabase.from('sales').update({ ...datos, notes: nota }).eq('id', ya[0].id)
      r.ventas.actualizadas++
    } else r.ventas.yaEstaban++
  } else {
    // ¿La metió alguien a mano? Fraccionada, con fecha cercana, y o el mismo
    // email o, si se apuntó sin email, el mismo nombre y el mismo nº de cuotas.
    const { data: manual } = await supabase.from('sales')
      .select('id, date, notes, product, client_email, client_name, client_phone, installments_total')
      .eq('client_id', clientId).eq('payment_type', 'Fraccionado').not('source', 'like', 'stripe:%')
    const pareja = (manual || []).find(m => Math.abs(Date.parse(m.date) - Date.parse(inicio)) <= 10 * DIA && (
      m.client_email
        ? m.client_email.toLowerCase() === email.toLowerCase()
        : Number(m.installments_total) === cuotas && pila(m.client_name) && pila(m.client_name) === pila(nombre)
    ))
    if (pareja) {
      op(`Vincula la venta manual del ${pareja.date} (${pareja.product}) a Stripe · ${tapa(email)} · ${pagadas}/${cuotas} cuotas, ${cobrado} €`)
      if (!prueba) {
        const { error } = await supabase.from('sales').update({
          ...datos,
          client_email: pareja.client_email || email,
          client_phone: pareja.client_phone || telefono,
          notes: [pareja.notes, nota].filter(Boolean).join('\n'),
        }).eq('id', pareja.id)
        if (error) throw error
      }
      r.ventas.vinculadas++
    } else {
      op(`Plan ${inicio}: ${producto} · ${tapa(email)} · ${cuotas} cuotas de ${cuota} € (${total} €), cobradas ${pagadas}`)
      if (!prueba) {
        const { error } = await supabase.from('sales').insert({
          client_id: clientId, date: inicio, client_name: nombre || email, client_email: email, client_phone: telefono,
          product: producto, status: 'won', notes: nota, ...datos,
        })
        if (error) throw error
        const contacto = await buscarOCrearContacto(supabase, clientId, { email, name: nombre, phone: telefono, provider: 'stripe' })
        if (contacto) {
          await supabase.from('crm_contacts').update({ status: 'won', deal_value: total, updated_at: new Date().toISOString() }).eq('id', contacto.id)
          await registrarActividad(supabase, clientId, contacto.id, {
            title: `Venta Stripe: ${producto} (fraccionado)`,
            description: `Plan de ${cuotas} cuotas de ${cuota} €, ${total} € en total. Suscripción ${sub.id}.`,
            actor: 'Stripe', fecha: inicio,
          })
        }
        await asegurarProducto(supabase, clientId, producto, total)
      }
      r.ventas.nuevas++
    }
  }
  // Cada cuota cobrada es dinero que entra: un apunte por factura.
  for (const f of facturas) {
    const importe = f.amount_paid / 100
    r.cobrado += importe
    await finanzas(c, {
      fecha: dia(f.status_transitions?.paid_at || f.created),
      descripcion: `${producto} · cuota · ${nombre || email}`, importe, ref: `stripe:inv_${f.id}`,
    })
  }
}

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// Con el año: con más de doce meses de cobros, el mismo dd/mm sale dos veces
// en la lista y Ventas → Próximos cobros no sabría cuál es (src/helm/cobrosPrevistos.js).
const ddmmaaaa = (iso) => `${ddmm(iso)}/${iso.slice(0, 4)}`
const ESTADO = { past_due: 'impagada', unpaid: 'impagada', canceled: 'cancelada', incomplete_expired: 'caducada' }

// El plan fraccionado abierto de un cliente: mismo email o, si se apuntó sin
// email, el mismo nombre de pila.
async function planAbiertoDe(supabase, clientId, g) {
  const { data } = await supabase.from('sales')
    .select('id, notes, client_email, client_name, installments_total, installments_paid, cash_collected')
    .eq('client_id', clientId).eq('payment_type', 'Fraccionado')
  return (data || []).find(p => Number(p.installments_paid) < Number(p.installments_total) && (
    p.client_email ? (g.email && p.client_email.toLowerCase() === g.email.toLowerCase()) : (pila(p.client_name) && pila(p.client_name) === pila(g.nombre))
  )) || null
}

// Un pago suelto que es la cuota de un plan: suma una cuota cobrada. La
// referencia de Stripe queda en la nota, y es lo que evita sumarla dos veces.
// Cada cuota lleva en la nota la marca «[cuota AAAA-MM]»: si la tarea diaria
// ya la apuntó como pago seguro (api/_lib/automatico.js), el cobro de Stripe de
// ese mes la confirma en vez de sumar otra.
async function cuotaDePlan(c, plan, p, producto) {
  const { supabase, op, prueba, g } = c
  if ((plan.notes || '').includes(p.ref)) return
  const marca = `[cuota ${p.fecha.slice(0, 7)}]`
  const lineas = (plan.notes || '').split('\n')
  const prevista = lineas.findIndex(l => l.startsWith(marca) && l.includes('automáticamente') && !l.includes('Stripe'))
  if (prevista >= 0) {
    lineas[prevista] += ` Confirmada en Stripe el ${ddmm(p.fecha)} (${p.ref}).`
    plan.notes = lineas.join('\n')
    op(`Cuota confirmada ${p.fecha}: ${g.nombre || tapa(g.email)} · ${p.importe} € (ya estaba apuntada)`)
    if (!prueba) {
      const { error } = await supabase.from('sales').update({ notes: plan.notes, client_email: plan.client_email || g.email || '' }).eq('id', plan.id)
      if (error) throw error
    }
    return
  }
  plan.installments_paid = Number(plan.installments_paid) + 1
  plan.cash_collected = redondea(Number(plan.cash_collected) + p.importe)
  plan.notes = [plan.notes, `${marca} Cuota de ${p.importe} € cobrada el ${ddmm(p.fecha)} con el enlace de pago (Stripe ${p.ref}).`].filter(Boolean).join('\n')
  op(`Cuota de plan ${p.fecha}: ${g.nombre || tapa(g.email)} · ${p.importe} € → ${plan.installments_paid}/${plan.installments_total} cuotas`)
  if (!prueba) {
    const { error } = await supabase.from('sales').update({
      installments_paid: plan.installments_paid, cash_collected: plan.cash_collected, notes: plan.notes,
      client_email: plan.client_email || g.email || '',
    }).eq('id', plan.id)
    if (error) throw error
  }
  await finanzas(c, { fecha: p.fecha, descripcion: `${producto} · cuota · ${g.nombre || g.email}`, importe: p.importe, ref: `stripe:${p.ref}` })
}

async function mensualidadDe(c) {
  const { supabase, clientId, r, op, prueba, producto, g } = c
  g.pagos.sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const p of g.pagos) r.cobrado += p.importe

  // Quien está pagando un plan fraccionado con el enlace suelto: esos pagos
  // son cuotas del plan, no mensualidades.
  let pagos = g.pagos
  const plan = await planAbiertoDe(supabase, clientId, g)
  if (plan) {
    for (const p of pagos.filter(x => x.suelto)) await cuotaDePlan(c, plan, p, producto)
    pagos = pagos.filter(x => !x.suelto)
  }
  if (!pagos.length) return

  const huella = crypto.createHash('sha256').update(g.email ? g.email.toLowerCase() : `nombre:${pila(g.nombre)}`).digest('hex').slice(0, 16)
  const source = `stripe:mensual:${huella}`
  const cobrado = redondea(pagos.reduce((a, p) => a + p.importe, 0))
  const cuota = pagos.at(-1).importe
  const avisos = g.subs.filter(s => ESTADO[s.estado]).map(s => {
    const sueltos = pagos.some(p => p.suelto) ? ' Desde entonces paga con el enlace suelto, que cuenta aquí igual.' : ''
    return `La suscripción ${s.id} está ${ESTADO[s.estado]}${s.ultimo ? ` (último cobro el ${ddmmaaaa(dia(s.ultimo))})` : ''}.${sueltos}`
  })
  const nota = [
    `Mensualidad de ${cuota} €: ${pagos.length} ${pagos.length === 1 ? 'cuota cobrada' : 'cuotas cobradas'} (${pagos.map(p => ddmm(p.fecha)).join(', ')}).`,
    ...avisos,
  ].join(' ')
  const datos = {
    date: pagos[0].fecha, client_name: g.nombre || g.email, client_email: g.email || '', client_phone: g.telefono || '',
    product: producto, payment_type: 'Suscripción', payment_method: 'Stripe',
    revenue: cobrado, cash_collected: cobrado,
    installments_total: null, installments_paid: pagos.length, installment_amount: cuota,
    plan_start: pagos[0].fecha, plan_end: null, status: 'won', source, notes: nota,
  }

  // La venta de la mensualidad (si ya está) y las sueltas que dejó una
  // importación anterior de estos mismos pagos, que pasan a ser esta.
  const { data: ya } = await supabase.from('sales').select('id, cash_collected, installments_paid').eq('client_id', clientId).eq('source', source).limit(1)
  const { data: sueltas } = await supabase.from('sales').select('id').eq('client_id', clientId).in('source', pagos.map(p => `stripe:${p.ref}`))
  const quien = g.nombre || tapa(g.email)
  if (ya?.length) {
    if (Number(ya[0].cash_collected) !== cobrado || Number(ya[0].installments_paid) !== pagos.length || sueltas?.length) {
      op(`Mensualidad al día: ${quien} · ${pagos.length} cuotas, ${cobrado} €`)
      if (!prueba) {
        const { error } = await supabase.from('sales').update(datos).eq('id', ya[0].id)
        if (error) throw error
      }
      r.ventas.actualizadas++
    } else r.ventas.yaEstaban++
  } else {
    op(`Mensualidad: ${quien} · ${pagos.length} ${pagos.length === 1 ? 'cuota' : 'cuotas'} de ${cuota} €, ${cobrado} €${sueltas?.length ? ` (junta ${sueltas.length} ${sueltas.length === 1 ? 'venta suelta' : 'ventas sueltas'})` : ''}`)
    if (!prueba) {
      const { error } = await supabase.from('sales').insert({ client_id: clientId, ...datos })
      if (error) throw error
    }
    r.ventas.nuevas++
  }
  if (sueltas?.length && !prueba) {
    const { error } = await supabase.from('sales').delete().in('id', sueltas.map(x => x.id))
    if (error) throw error
  }

  const contacto = prueba ? null : await buscarOCrearContacto(supabase, clientId, { email: g.email, name: g.nombre, phone: g.telefono, provider: 'stripe' })
  if (contacto) await supabase.from('crm_contacts').update({ status: 'won', updated_at: new Date().toISOString() }).eq('id', contacto.id)
  for (const p of pagos) {
    const nuevo = await finanzas(c, { fecha: p.fecha, descripcion: `${producto} · cuota · ${g.nombre || g.email}`, importe: p.importe, ref: `stripe:${p.ref}` })
    if (nuevo && contacto) {
      await registrarActividad(supabase, clientId, contacto.id, {
        title: `Cuota cobrada: ${producto}`,
        description: `Cuota de ${p.importe} € cobrada el ${ddmm(p.fecha)} (${p.suelto ? 'enlace de pago suelto' : 'suscripción'}, Stripe ${p.ref}).`,
        actor: 'Stripe', fecha: p.fecha,
      })
    }
  }
  if (!prueba) await asegurarProducto(supabase, clientId, producto, cuota)
}
