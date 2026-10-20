// HELM — lo que se pone al día solo cada mañana (scripts/automatico-diario.mjs).
//
// Cada perfil que lo usa tiene su configuración en user_integrations, con
// service = 'helm-automatico' (solo la lee la service key):
//
//   {
//     stripe: { clave, enlaces, mensualidad, alias },  // cobros de sus enlaces de pago
//                                                // (alias: correos que pagan la
//                                                // mensualidad de otro cliente)
//                                                // en un Stripe compartido;
//                                                // `clave` es el NOMBRE de la
//                                                // variable de entorno, nunca
//                                                // la clave en sí
//     gastosFijos:   [{ descripcion, importe, dia }],  // el apunte de cada mes
//     cuotasSeguras: [{ venta, importe, dia }],        // cuotas de un plan que
//                                                      // se dan por cobradas
//   }
//
// Las cuotas seguras son las de clientes de confianza: el día que toca se
// apuntan como cobradas sin esperar a Stripe. Si luego llega el cobro de ese
// mes por el enlace, lo confirma (stripe-historico.js → cuotaDePlan) en vez de
// sumar otro. Si una no se cobra, se quita a mano.
//
// Todo es idempotente: correr dos veces el mismo día no apunta nada dos veces.
import { historicoPorEnlaces } from './stripe-historico.js'

export const SERVICIO = 'helm-automatico'

/** La fecha de hoy en Madrid, 'AAAA-MM-DD'. */
export const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

const redondea = (n) => Math.round(Number(n) * 100) / 100
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// El día `dia` del mes de `iso`, sin pasarse del último del mes.
function diaDelMes(iso, dia) {
  const [a, m] = iso.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(Math.min(Math.max(1, Number(dia) || 1), ultimo)).padStart(2, '0')}`
}
const clave = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function ponerAlDia({ supabase, clientId, config, hoy = hoyMadrid(), prueba = false }) {
  const r = { stripe: null, gastos: [], cuotas: [], errores: [] }

  if (config.stripe?.enlaces?.length) {
    const apiKey = process.env[config.stripe.clave || 'HELM_STRIPE_SECRET_KEY']
    if (!apiKey) r.errores.push(`Stripe: no hay clave en ${config.stripe.clave || 'HELM_STRIPE_SECRET_KEY'}`)
    else {
      try {
        r.stripe = await historicoPorEnlaces({
          supabase, clientId, apiKey, enlaces: config.stripe.enlaces, mensualidad: config.stripe.mensualidad || null,
          alias: config.stripe.alias || {}, prueba,
        })
        r.errores.push(...r.stripe.errores.map(e => `Stripe: ${e}`))
      } catch (e) { r.errores.push(`Stripe: ${e.message}`) }
    }
  }

  for (const g of config.gastosFijos || []) {
    try {
      const fecha = diaDelMes(hoy, g.dia)
      if (hoy < fecha) continue
      const mes = hoy.slice(0, 7)
      const ref = `gasto-fijo:${clave(g.descripcion)}:${mes}`
      // El del mes ya está si tiene su referencia o si alguien lo apuntó a mano.
      const { data: ya } = await supabase.from('ceo_finance_entries').select('id, notes')
        .eq('client_id', clientId).eq('category', 'Gasto fijo').eq('description', g.descripcion)
        .gte('date', `${mes}-01`).lte('date', `${mes}-31`).limit(1)
      if (ya?.length) continue
      r.gastos.push(`${g.descripcion} · −${g.importe} € (${fecha})`)
      if (prueba) continue
      const { error } = await supabase.from('ceo_finance_entries').insert({
        client_id: clientId, date: fecha, category: 'Gasto fijo', description: g.descripcion,
        amount: -Math.abs(Number(g.importe) || 0), recurring: true, person_name: '', person_role: '', notes: ref,
      })
      if (error) throw error
    } catch (e) { r.errores.push(`Gasto fijo ${g.descripcion}: ${e.message}`) }
  }

  for (const q of config.cuotasSeguras || []) {
    try {
      const fecha = diaDelMes(hoy, q.dia)
      if (hoy < fecha) continue
      const mes = hoy.slice(0, 7)
      const { data: v, error } = await supabase.from('sales')
        .select('id, client_name, product, notes, plan_start, installments_total, installments_paid, cash_collected')
        .eq('client_id', clientId).eq('id', q.venta).maybeSingle()
      if (error) throw error
      if (!v) { r.errores.push(`Cuota segura: no existe la venta ${q.venta}`); continue }
      // El mes en que empezó el plan ya tiene su pago (la entrada); y un plan
      // completo no suma más cuotas.
      if (mes <= String(v.plan_start || '').slice(0, 7)) continue
      if (Number(v.installments_paid) >= Number(v.installments_total)) continue
      const marca = `[cuota ${mes}]`
      if ((v.notes || '').split('\n').some(l => l.startsWith(marca))) continue
      const importe = redondea(q.importe)
      const pagadas = Number(v.installments_paid) + 1
      r.cuotas.push(`${v.client_name} · ${v.product} · ${importe} € (${fecha}) → ${pagadas}/${v.installments_total}`)
      if (prueba) continue
      const notas = [v.notes, `${marca} Cuota de ${importe} € del ${ddmm(fecha)}, apuntada automáticamente (pago seguro).`].filter(Boolean).join('\n')
      const { error: e1 } = await supabase.from('sales').update({
        installments_paid: pagadas, cash_collected: redondea(Number(v.cash_collected) + importe), notes: notas,
      }).eq('id', v.id)
      if (e1) throw e1
      const ref = `cuota-segura:${v.id}:${mes}`
      const { data: apunte } = await supabase.from('ceo_finance_entries').select('id').eq('client_id', clientId).eq('notes', ref).limit(1)
      if (apunte?.length) continue
      const { error: e2 } = await supabase.from('ceo_finance_entries').insert({
        client_id: clientId, date: fecha, category: 'Ingreso', description: `${v.product} · cuota · ${v.client_name}`,
        amount: importe, recurring: false, person_name: '', person_role: '', notes: ref,
      })
      if (e2) throw e2
    } catch (e) { r.errores.push(`Cuota segura ${q.venta}: ${e.message}`) }
  }
  return r
}
