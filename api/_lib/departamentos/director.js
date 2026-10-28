// HELM — Operaciones · el director (el parte del día).
//
// A primera hora manda UN mensaje por Telegram a la agencia con el estado del
// perfil en cinco bloques muy cortos y con cifras. No decide nada ni escribe a
// nadie: solo mira y cuenta. Corre el ÚLTIMO de la pasada de departamentos
// (CLAVES en index.js) para poder contar las propuestas que los demás han
// dejado pendientes de aprobación.
//
// Los cinco bloques:
//   📥 ENTRA hoy     cobros previstos, llamadas agendadas, leads de ayer
//   ⏳ VENCE         cuotas de la semana y tareas con plazo
//   🚧 ATASCADO      leads parados, piezas de contenido paradas, propuestas caducadas
//   ✅ HECHO ayer    ventas cobradas, piezas publicadas, propuestas aplicadas
//   🟡 ESPERA TU APROBACIÓN  las propuestas pendientes de este perfil, por agente
//
// Un bloque sin datos no sale. Si no hay nada que contar, no se manda nada.
// El texto se arma con `parteDelDia(datos)`, que es pura (no toca la base) y se
// puede probar sola; `corre` solo agrega los datos y la llama.
import { masMeses, aISO } from '../renovaciones.js'
import { todasLasFilas } from '../filas.js'

// El día en Madrid, y sumar días sobre un día (AAAA-MM-DD), como en equipo.js.
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
export const diaMadrid = (d = new Date()) => fmtDia.format(d)
const masDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Etapas que ya están cerradas: una ficha ahí no cuenta como «lead parado».
const CERRADAS = new Set(['won', 'lost', 'ganado', 'ganada', 'perdido', 'perdida', 'cliente', 'descartado', 'descartada', 'cancelada', 'baja', 'nurturing'])
const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'
const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const eur = (n) => `${numero.format(Math.round(Number(n) || 0))} €`
const plural = (n, uno, varios) => (n === 1 ? uno : (varios || `${uno}s`))

/**
 * Arma el texto del parte a partir de los datos ya agregados. Pura: ni base ni
 * red. Un bloque sin ningún dato no aparece; sin ningún bloque, devuelve ''.
 *
 * datos = {
 *   perfil, fecha,
 *   entra:    { cobros: { n, importe }, llamadas, leads },
 *   vence:    { cuotas: { n, importe }, tareas },
 *   atascado: { leads, piezas, propuestas },
 *   hecho:    { ventas: { n, importe }, piezas, propuestas },
 *   aprobacion: { total, porAgente: [{ agente, n }] },
 * }
 */
export function parteDelDia(datos = {}) {
  const d = datos || {}
  const bloques = []

  const entra = []
  if (d.entra?.cobros?.n) entra.push(`${d.entra.cobros.n} ${plural(d.entra.cobros.n, 'cobro previsto', 'cobros previstos')}${d.entra.cobros.importe ? ` (${eur(d.entra.cobros.importe)})` : ''}`)
  if (d.entra?.llamadas) entra.push(`${d.entra.llamadas} ${plural(d.entra.llamadas, 'llamada agendada', 'llamadas agendadas')}`)
  if (d.entra?.leads) entra.push(`${d.entra.leads} ${plural(d.entra.leads, 'lead nuevo', 'leads nuevos')} ayer`)
  if (entra.length) bloques.push(['📥 Entra hoy', entra])

  const vence = []
  if (d.vence?.cuotas?.n) vence.push(`${d.vence.cuotas.n} ${plural(d.vence.cuotas.n, 'cuota', 'cuotas')} esta semana${d.vence.cuotas.importe ? ` (${eur(d.vence.cuotas.importe)})` : ''}`)
  if (d.vence?.tareas) vence.push(`${d.vence.tareas} ${plural(d.vence.tareas, 'tarea con plazo', 'tareas con plazo')}`)
  if (vence.length) bloques.push(['⏳ Vence', vence])

  const atascado = []
  if (d.atascado?.leads) atascado.push(`${d.atascado.leads} ${plural(d.atascado.leads, 'lead parado', 'leads parados')} (7+ días sin tocar)`)
  if (d.atascado?.piezas) atascado.push(`${d.atascado.piezas} ${plural(d.atascado.piezas, 'pieza de contenido parada', 'piezas de contenido paradas')}`)
  if (d.atascado?.propuestas) atascado.push(`${d.atascado.propuestas} ${plural(d.atascado.propuestas, 'propuesta caducada', 'propuestas caducadas')}`)
  if (atascado.length) bloques.push(['🚧 Atascado', atascado])

  const hecho = []
  if (d.hecho?.ventas?.n) hecho.push(`${d.hecho.ventas.n} ${plural(d.hecho.ventas.n, 'venta cobrada', 'ventas cobradas')}${d.hecho.ventas.importe ? ` (${eur(d.hecho.ventas.importe)})` : ''}`)
  if (d.hecho?.piezas) hecho.push(`${d.hecho.piezas} ${plural(d.hecho.piezas, 'pieza publicada', 'piezas publicadas')}`)
  if (d.hecho?.propuestas) hecho.push(`${d.hecho.propuestas} ${plural(d.hecho.propuestas, 'propuesta aplicada', 'propuestas aplicadas')}`)
  if (hecho.length) bloques.push(['✅ Hecho ayer', hecho])

  if (d.aprobacion?.total) {
    const detalle = (d.aprobacion.porAgente || []).map((x) => `${x.agente} ${x.n}`).join(' · ')
    bloques.push([`🟡 Espera tu aprobación: ${d.aprobacion.total}`, detalle ? [detalle] : []])
  }

  if (!bloques.length) return ''
  const cabecera = `☀️ Parte del día · ${d.perfil || ''} · ${d.fecha || ''}`.replace(/ · $/, '').trim()
  const cuerpo = bloques.flatMap(([titulo, lineas]) => [titulo, ...lineas.map((l) => `• ${l}`), ''])
  return [cabecera, '', ...cuerpo].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export default {
  key: 'director',
  departamento: 'operaciones',
  async corre(ctx) {
    const { supabase, clientId, perfil, hoy: hoyDate = new Date(), avisar, log } = ctx
    const hoy = diaMadrid(hoyDate)
    const ayer = masDias(hoy, -1)
    const manana = masDias(hoy, 1)
    const dentro7 = masDias(hoy, 7)
    const dentro3 = masDias(hoy, 3)
    const hace7 = masDias(hoy, -7)
    const hace3 = masDias(hoy, -3)
    const ahoraISO = new Date(hoyDate).toISOString()

    // Cada lectura va por su cuenta: una tabla que falte (o un error puntual)
    // deja su bloque vacío, no tumba el parte entero.
    const sel = async (fn) => {
      try {
        const { data, error } = await fn()
        if (error) throw error
        return data || []
      } catch (e) {
        log?.('lectura del parte falló:', e?.message || e)
        return []
      }
    }
    // Lo mismo, por páginas: lo que pasa de 1000 filas (PostgREST corta ahí).
    const selTodas = async (fn) => {
      try {
        return await todasLasFilas(fn)
      } catch (e) {
        log?.('lectura del parte falló:', e?.message || e)
        return []
      }
    }

    const [
      ventasFrac, llamadas, leadsAyer, tareas, leadsParados, piezasParadas,
      propCaducadas, ventasAyer, piezasAyer, propAplicadas, propPendientes,
    ] = await Promise.all([
      selTodas(() => supabase.from('sales')
        .select('id, date, plan_start, revenue, cash_collected, status, installments_total, installments_paid, installment_amount')
        .eq('client_id', clientId).not('installments_total', 'is', null).order('id')),
      sel(() => supabase.from('helm_calls').select('id, starts_at, status')
        .eq('client_id', clientId).gte('starts_at', `${hoy}T00:00:00`).lt('starts_at', `${manana}T00:00:00`).limit(200)),
      sel(() => supabase.from('crm_contacts').select('id')
        .eq('client_id', clientId).gte('created_at', ayer).lt('created_at', hoy).limit(500)),
      sel(() => supabase.from('crm_tasks').select('id, due_date')
        .eq('client_id', clientId).eq('completed', false).not('due_date', 'is', null).lte('due_date', `${dentro3}T23:59:59Z`).limit(500)),
      selTodas(() => supabase.from('crm_contacts').select('id, status, last_activity_at')
        .eq('client_id', clientId).not('last_activity_at', 'is', null).lt('last_activity_at', hace7).order('id')),
      sel(() => supabase.from('helm_content_calendar').select('id')
        .eq('client_id', clientId).eq('status', 'planned').lt('date', hoy).limit(500)),
      sel(() => supabase.from('helm_propuestas').select('id')
        .eq('client_id', clientId).eq('estado', 'caducada').gte('caduca', hace3).limit(500)),
      selTodas(() => supabase.from('sales').select('id, date, cash_collected, status')
        .eq('client_id', clientId).eq('date', ayer).order('id')),
      sel(() => supabase.from('helm_content_calendar').select('id')
        .eq('client_id', clientId).eq('status', 'published').eq('date', ayer).limit(500)),
      sel(() => supabase.from('helm_propuestas').select('id')
        .eq('client_id', clientId).eq('estado', 'aplicada').gte('decidida_en', ayer).lt('decidida_en', hoy).limit(500)),
      sel(() => supabase.from('helm_propuestas').select('agente')
        .eq('client_id', clientId).eq('estado', 'pendiente').gt('caduca', ahoraISO).limit(500)),
    ])

    // Cobros de planes fraccionados: la cuota que toca hoy entra, las de los
    // próximos 7 días vencen. La fecha de cada cuota se saca como en el bot
    // (api/_lib/bot/lecturas.js): el día del plan, una al mes.
    const cobros = { n: 0, importe: 0 }
    const cuotas = { n: 0, importe: 0 }
    for (const v of ventasFrac) {
      if (cancelada(v)) continue
      const pend = (Number(v.installments_total) || 0) - (Number(v.installments_paid) || 0)
      if (pend <= 0) continue
      const base = String(v.plan_start || v.date || '').slice(0, 10)
      if (!base) continue
      const prox = aISO(masMeses(new Date(`${base}T00:00:00Z`), Number(v.installments_paid) || 0))
      const imp = Number(v.installment_amount) || (Number(v.revenue) || 0) / (Number(v.installments_total) || 1)
      if (prox === hoy) { cobros.n++; cobros.importe += imp }
      else if (prox > hoy && prox <= dentro7) { cuotas.n++; cuotas.importe += imp }
    }

    const ventasCobradas = ventasAyer.filter((v) => !cancelada(v) && Number(v.cash_collected) > 0)
    const porAgente = {}
    for (const p of propPendientes) {
      const a = p.agente || 'otros'
      porAgente[a] = (porAgente[a] || 0) + 1
    }
    const aprobLista = Object.entries(porAgente)
      .map(([agente, n]) => ({ agente, n }))
      .sort((a, b) => b.n - a.n || a.agente.localeCompare(b.agente))

    const datos = {
      perfil: perfil?.name || perfil?.slug || '',
      fecha: hoy,
      entra: {
        cobros: { n: cobros.n, importe: Math.round(cobros.importe) },
        llamadas: llamadas.filter((c) => String(c.status || '').toLowerCase() !== 'cancelada').length,
        leads: leadsAyer.length,
      },
      vence: {
        cuotas: { n: cuotas.n, importe: Math.round(cuotas.importe) },
        tareas: tareas.length,
      },
      atascado: {
        leads: leadsParados.filter((c) => !CERRADAS.has(String(c.status || '').toLowerCase().trim())).length,
        piezas: piezasParadas.length,
        propuestas: propCaducadas.length,
      },
      hecho: {
        ventas: { n: ventasCobradas.length, importe: Math.round(ventasCobradas.reduce((t, v) => t + (Number(v.cash_collected) || 0), 0)) },
        piezas: piezasAyer.length,
        propuestas: propAplicadas.length,
      },
      aprobacion: { total: propPendientes.length, porAgente: aprobLista },
    }

    const texto = parteDelDia(datos)
    if (texto) await avisar(texto)
    return { propuestas: 0, resumen: texto }
  },
}
