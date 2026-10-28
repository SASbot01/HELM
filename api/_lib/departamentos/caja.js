// HELM — la previsión de caja del departamento de Finanzas.
//
// Mira 90 días por delante: lo que ENTRA (cuotas de planes fraccionados y
// renovaciones previstas) y lo que SALE (los gastos fijos/recurrentes de
// Finanzas), y semana a semana lleva el saldo previsto. Si en alguna semana ese
// saldo cae por debajo de 0 (o del mínimo de ctx.config.minimo), deja un aviso
// en la bandeja (propuesta informativa, sin herramienta: solo para que el dueño
// lo vea venir). Devuelve siempre un `resumen` corto para el parte del director.
//
// El saldo arranca del que diga el dueño en ctx.config.saldo_inicial (0 por
// defecto): HELM no conoce el banco, así que la previsión es de FLUJO. Esto va
// dicho en el resumen para no dar un número como si fuera el saldo real.
//
// Columnas reales:
//   · sales — installments_total/paid, installment_amount, plan_start, revenue,
//     cash_collected, status, service_end.
//   · ceo_finance_entries — recurring=true marca los gastos fijos (amount en
//     negativo). Se proyectan mes a mes sobre su día del mes.
import { masMeses, aISO } from '../renovaciones.js'

// ── Cálculo puro (el día es el de Madrid, como api/_lib/bot/comun.js) ────────
const fmtMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoyMadrid = (d = new Date()) => fmtMadrid.format(d)
const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100
const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(redondea(n))} €`
const masDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'
const cuotasPendientes = (v) => {
  const total = Number(v?.installments_total) || 0
  return total ? Math.max(0, total - (Number(v.installments_paid) || 0)) : null
}
const importeCuota = (v) => redondea(Number(v.installment_amount) || (Number(v.revenue) || 0) / (Number(v.installments_total) || 1))

// El lunes (de Madrid) de la semana de un 'AAAA-MM-DD'. Las semanas se anclan al
// lunes para que la clave del aviso no cambie según el día en que corra.
function lunesDe(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  const dow = d.getUTCDay()            // 0=domingo … 6=sábado
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7))
  return d.toISOString().slice(0, 10)
}
// En qué semana (0..n) cae una fecha, contando desde el lunes de la semana 0.
const semanaDe = (fechaISO, lunes0) => Math.floor((new Date(`${fechaISO}T12:00:00Z`) - new Date(`${lunes0}T12:00:00Z`)) / (7 * 86_400_000))

// Día del mes de un 'AAAA-MM-DD'.
const diaDelMes = (iso) => Number(iso.slice(8, 10))

export default {
  key: 'caja',
  departamento: 'finanzas',

  async corre(ctx) {
    const { supabase, clientId, config = {} } = ctx
    const hoy = hoyMadrid(ctx.hoy || new Date())
    const horizonteDias = Number.isFinite(config.horizonte_dias) ? config.horizonte_dias : 90
    const minimo = Number.isFinite(config.minimo) ? config.minimo : 0
    let saldo = redondea(config.saldo_inicial ?? config.saldo ?? 0)
    const lunes0 = lunesDe(hoy)
    const hasta = masDias(hoy, horizonteDias)
    // Cuántas semanas cubren el horizonte desde el lunes de la semana 0.
    const nSemanas = semanaDe(hasta, lunes0) + 1
    const semanas = Array.from({ length: nSemanas }, (_, i) => ({ lunes: masDias(lunes0, i * 7), entra: 0, sale: 0 }))
    const enSemana = (fechaISO, campo, importe) => {
      const i = semanaDe(fechaISO, lunes0)
      if (i >= 0 && i < nSemanas) semanas[i][campo] = redondea(semanas[i][campo] + importe)
    }

    const [{ data: ventas, error: eV }, { data: apuntes, error: eA }] = await Promise.all([
      supabase.from('sales')
        .select('id, date, revenue, cash_collected, status, installments_total, installments_paid, installment_amount, plan_start, service_end')
        .eq('client_id', clientId).limit(5000),
      supabase.from('ceo_finance_entries')
        .select('id, date, category, description, amount, recurring').eq('client_id', clientId).limit(5000),
    ])
    if (eV) throw eV
    if (eA) throw eA

    // ── Entra: cuotas pendientes de cada plan fraccionado ──────────────────
    for (const v of (ventas || [])) {
      if (cancelada(v)) continue
      const pend = cuotasPendientes(v)
      if (!pend) continue
      let falta = redondea((Number(v.revenue) || 0) - (Number(v.cash_collected) || 0))
      if (falta <= 0) continue
      const total = Number(v.installments_total) || 0
      const importe = importeCuota(v)
      const inicio = new Date(`${v.plan_start || v.date}T00:00:00Z`)
      const pagadas = Number(v.installments_paid) || 0
      for (let k = pagadas; k < total && falta > 0; k++) {
        const fecha = aISO(masMeses(inicio, k))
        const cuanto = Math.min(importe, falta)   // la última, lo que falte
        falta = redondea(falta - cuanto)
        if (fecha >= hoy && fecha <= hasta) enSemana(fecha, 'entra', cuanto)
      }
    }

    // ── Entra: renovaciones de pago único (service_end dentro del horizonte) ─
    for (const v of (ventas || [])) {
      if (cancelada(v) || cuotasPendientes(v) != null) continue
      const fin = v.service_end
      if (fin && fin >= hoy && fin <= hasta && Number(v.revenue) > 0) enSemana(fin, 'entra', Number(v.revenue))
    }

    // ── Sale: gastos fijos/recurrentes de Finanzas, proyectados mes a mes ───
    // Se queda la última versión de cada gasto fijo (por su concepto) para no
    // contar dos veces el mismo si aparece repetido en meses pasados.
    const fijos = new Map()
    for (const e of (apuntes || [])) {
      if (!e.recurring || !(Number(e.amount) < 0)) continue
      const k = norm(e.description) || `importe:${redondea(e.amount)}`
      const previo = fijos.get(k)
      if (!previo || String(e.date) > String(previo.date)) fijos.set(k, e)
    }
    for (const e of fijos.values()) {
      const cuanto = Math.abs(Number(e.amount) || 0)
      const dia = diaDelMes(e.date)
      // Una ocurrencia por cada mes que toca el horizonte.
      for (let m = 0; m <= Math.ceil(horizonteDias / 28) + 1; m++) {
        const base = new Date(`${hoy.slice(0, 7)}-01T00:00:00Z`)
        base.setUTCMonth(base.getUTCMonth() + m)
        const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
        const fecha = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
        if (fecha >= hoy && fecha <= hasta) enSemana(fecha, 'sale', cuanto)
      }
    }

    // ── Semana a semana: el saldo previsto y los descubiertos ──────────────
    let propuestas = 0
    let peor = { saldo: Infinity, lunes: null }
    const descubiertos = []
    for (const s of semanas) {
      saldo = redondea(saldo + s.entra - s.sale)
      s.saldo = saldo
      if (saldo < peor.saldo) peor = { saldo, lunes: s.lunes }
      if (saldo < minimo) descubiertos.push(s)
    }

    for (const s of descubiertos) {
      const r = await ctx.proponer({
        clave: `caja:deficit:${s.lunes}`,
        titulo: `Caja: la semana del ${s.lunes} el saldo previsto baja a ${euros(s.saldo)}`,
        porque: `Previsión de caja: esa semana entran ${euros(s.entra)} y salen ${euros(s.sale)}, y el saldo previsto queda en ${euros(s.saldo)} ` +
          `(por debajo del mínimo de ${euros(minimo)}). Arranca de un saldo inicial de ${euros(config.saldo_inicial ?? config.saldo ?? 0)}; ` +
          `es una previsión de flujo, ajústala con tu saldo real.`,
        datos: { tipo: 'deficit_caja', semana: s.lunes, entra: s.entra, sale: s.sale, saldo: s.saldo, minimo },
      })
      if (r) propuestas++
    }

    const resumen = descubiertos.length
      ? `Caja 90d: ${descubiertos.length} semana(s) por debajo del mínimo; lo más bajo, ${euros(peor.saldo)} la semana del ${peor.lunes} (desde un saldo de ${euros(config.saldo_inicial ?? config.saldo ?? 0)}).`
      : `Caja 90d: sin descubiertos; el saldo previsto no baja de ${euros(peor.saldo === Infinity ? (config.saldo_inicial ?? config.saldo ?? 0) : peor.saldo)} (desde ${euros(config.saldo_inicial ?? config.saldo ?? 0)}).`
    return { propuestas, resumen, descubiertos: descubiertos.length }
  },
}
