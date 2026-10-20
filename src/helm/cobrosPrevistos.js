// HELM — los cobros que van a entrar (Ventas → «Próximos cobros»).
//
// No es una tabla: se calcula con las ventas que ya están en `sales`, así que
// no se puede descuadrar con lo que apunta la tarea diaria (api/_lib/
// automatico.js y stripe-historico.js). Cuando una cuota se cobra, esa tarea
// sube `installments_paid` (o suma la cuota a la mensualidad) y el cobro deja
// de salir aquí. Apuntar los previstos como ventas aparte los habría contado
// dos veces en cuanto llegara el pago de verdad.
//
//   · Plan fraccionado con cuotas pendientes: una por mes, la última en
//     `plan_end`. Si lo que falta no cuadra con las cuotas (una cuota con la
//     reserva descontada, por ejemplo), la diferencia va en la primera.
//   · Mensualidad (Suscripción sin nº de cuotas): la siguiente, al mes de la
//     última cobrada y el mismo día en que empezó; y así hasta el horizonte.
//     No cuenta si su nota dice que la suscripción está cancelada, impagada o
//     caducada (salvo que diga que sigue pagando, p. ej. con un enlace de pago
//     suelto), ni si lleva más de un mes sin cobrarse. Cada una lleva su número
//     (la 7ª mensualidad…) para saber por qué mes va.

const r2 = (n) => Math.round(Number(n) * 100) / 100
const DIA = 86_400_000

/** `iso` + `n` meses (n puede ser negativo), el día `dia` sin pasarse del último del mes. */
export function sumaMeses(iso, n, dia = Number(String(iso).slice(8, 10))) {
  const a = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + n
  const ano = a + Math.floor(m / 12)
  const mes = ((m % 12) + 12) % 12
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, '0')}`
}

const finDeMes = (iso) => sumaMeses(iso, 0, 31)
const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'
// Las notas las escribe stripe-historico.js («La suscripción sub_… está
// cancelada… Desde entonces paga con el enlace suelto…») o alguien a mano
// («Sigue pagando la mensualidad…»).
const parada = (notas) => {
  const n = String(notas || '')
  return /suscripci[oó]n \S+ est[aá] (cancelada|impagada|caducada)/i.test(n) && !/sigue pagando|paga con el enlace/i.test(n)
}

/**
 * Los cobros previstos desde los vencidos hasta el final del mes `meses`
 * contando el actual, por fecha.
 * @returns {{ fecha, cliente, concepto, importe, como, vencido, ventaId, tipo, n, de }[]}
 */
export function cobrosPrevistos(ventas, { hoy, meses = 6, esCancelada = cancelada } = {}) {
  const hasta = finDeMes(sumaMeses(`${hoy.slice(0, 7)}-01`, meses - 1, 1))
  const out = []
  const pon = (v, fecha, importe, extra) => {
    if (fecha > hasta || importe <= 0) return
    out.push({
      fecha, importe: r2(importe), vencido: fecha < hoy, ventaId: v.id,
      cliente: v.client_name || '—', concepto: v.product || '—', como: v.payment_method || '—', ...extra,
    })
  }

  for (const v of ventas || []) {
    if (esCancelada(v)) continue
    const total = Number(v.installments_total) || 0
    const pagadas = Number(v.installments_paid) || 0

    if (total) {
      const pend = total - pagadas
      const falta = r2((Number(v.revenue) || 0) - (Number(v.cash_collected) || 0))
      if (pend <= 0 || falta <= 0.01) continue
      const cuota = Number(v.installment_amount) || r2(falta / pend)
      const ultima = v.plan_end || (v.plan_start ? sumaMeses(v.plan_start, total - 1) : null)
      if (!ultima) continue
      // La diferencia (si es de verdad, no un céntimo de redondeo) va en la primera.
      const primera = r2(falta - cuota * (pend - 1))
      const ajusta = primera > 0 && Math.abs(primera - cuota) >= 1
      for (let i = 0; i < pend; i++) {
        const fecha = sumaMeses(ultima, -(pend - 1 - i))
        pon(v, fecha, i === 0 && ajusta ? primera : (primera > 0 ? cuota : falta / pend), { tipo: 'cuota', n: pagadas + i + 1, de: total })
      }
      continue
    }

    if (v.payment_type === 'Suscripción' && v.plan_start && pagadas >= 1 && Number(v.installment_amount) > 0 && !parada(v.notes)) {
      const dia = Number(v.plan_start.slice(8, 10))
      let fecha = sumaMeses(v.plan_start, pagadas, dia)
      // Más de un mes sin cobrarse: ya no se da por hecho que siga.
      if (Date.parse(fecha) < Date.parse(hoy) - 31 * DIA) continue
      for (let k = 0; fecha <= hasta && k < 24; k++) {
        pon(v, fecha, Number(v.installment_amount), { tipo: 'mensualidad', n: pagadas + k + 1 })
        fecha = sumaMeses(v.plan_start, pagadas + k + 1, dia)
      }
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cliente.localeCompare(b.cliente))
}

/** Los mismos cobros juntados por mes: [{ mes: 'AAAA-MM', total, cobros }]. */
export function porMes(cobros) {
  const meses = new Map()
  for (const c of cobros) {
    const k = c.fecha.slice(0, 7)
    if (!meses.has(k)) meses.set(k, { mes: k, total: 0, cobros: [] })
    const m = meses.get(k)
    m.total = r2(m.total + c.importe)
    m.cobros.push(c)
  }
  return [...meses.values()]
}
