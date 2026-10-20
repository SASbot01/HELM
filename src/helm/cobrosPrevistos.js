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
//     `plan_end` (o, si no hay, la que toca desde `plan_start` o la fecha de
//     la venta). Las de en medio van el día en que empezó el plan cuando
//     `plan_end` solo está recortado a fin de mes (un plan del 31 cobra el 30
//     de noviembre, no el 28). Si lo que falta no cuadra con las cuotas (una
//     cuota con la reserva descontada, por ejemplo), la diferencia va en la
//     primera.
//   · Mensualidad (Suscripción sin nº de cuotas): la siguiente, al mes del
//     ÚLTIMO cobro (la lista de fechas de su nota; un mes saltado no la
//     descuadra) y el mismo día en que empezó; y así hasta el horizonte. Cada
//     una lleva su número (la 7ª mensualidad…) para saber por qué mes va. No
//     cuenta si lleva más de un mes sin cobrarse, ni si su suscripción está
//     cancelada, impagada o caducada y no ha vuelto a cobrar después (salvo que
//     la nota diga que sigue pagando, a mano o con el enlace suelto).

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
const dd = (n) => String(n).padStart(2, '0')
const diaDe = (iso) => Number(iso.slice(8, 10))
const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'

/** Las fechas de los cobros que lista la nota de una mensualidad (las escribe
 *  stripe-historico.js: «6 cuotas cobradas (05/05, 05/06, …)»), con su año:
 *  van en orden desde `inicio`, así que cada vez que el mes baja es otro año. */
export function cobrosDeLaNota(notas, inicio) {
  const m = String(notas || '').match(/cobradas?\s*\(([\d/,\s]+)\)/i)
  if (!m || !inicio) return []
  let ano = Number(inicio.slice(0, 4))
  let antes = Number(inicio.slice(5, 7))
  const out = []
  for (const trozo of m[1].split(',')) {
    const [d, mes] = trozo.trim().split('/').map(Number)
    if (!d || !mes) continue
    if (mes < antes) ano++
    antes = mes
    out.push(`${ano}-${dd(mes)}-${dd(d)}`)
  }
  return out
}

// ¿Se paró? Las notas las escribe stripe-historico.js («La suscripción sub_…
// está cancelada (último cobro el 04/09)… Desde entonces paga con el enlace
// suelto…») o alguien a mano («Sigue pagando la mensualidad…»). Una
// suscripción parada no para al cliente si ha vuelto a cobrar DESPUÉS de su
// último cobro (otra suscripción, un enlace).
function parada(notas, cobros) {
  const n = String(notas || '')
  if (/sigue pagando|paga con el enlace/i.test(n)) return false
  const avisos = [...n.matchAll(/suscripci[oó]n \S+ est[aá] (?:cancelada|impagada|caducada)(?: \(último cobro el (\d{2})\/(\d{2})\))?/gi)]
  if (!avisos.length) return false
  const ultimo = cobros.at(-1)
  if (!ultimo) return true
  const finales = avisos.filter(a => a[1]).map(a => cobros.find(c => c.slice(5) === `${a[2]}-${a[1]}`) || `${ultimo.slice(0, 4)}-${a[2]}-${a[1]}`)
  // Sin fecha (nunca llegó a cobrar) no dice nada del resto: decide la regla del mes.
  if (!finales.length) return false
  return ultimo <= finales.sort().at(-1)
}

// El día de cobro más cercano a un pago: uno con días de retraso o de adelanto
// sigue siendo la cuota de ese mes.
function mesDelCobro(fecha, dia) {
  const t = Date.parse(fecha)
  return [-1, 0, 1].map(k => sumaMeses(fecha, k, dia))
    .reduce((a, b) => (Math.abs(Date.parse(b) - t) < Math.abs(Date.parse(a) - t) ? b : a))
}

/**
 * Si `v` es una mensualidad que sigue viva: el mes de su último cobro (`base`)
 * y el día en que cobra (`dia`). Si no lo es, o se paró, null.
 */
function mensualidadViva(v, hoy) {
  const pagadas = Number(v.installments_paid) || 0
  if (v.payment_type !== 'Suscripción' || Number(v.installments_total) || !v.plan_start || pagadas < 1 || !(Number(v.installment_amount) > 0)) return null
  const cobros = cobrosDeLaNota(v.notes, v.plan_start)
  if (parada(v.notes, cobros)) return null
  const dia = diaDe(v.plan_start)
  // El mes del último cobro; sin la lista de la nota (una venta apuntada a
  // mano), el que toca contando desde el inicio.
  const base = cobros.length ? mesDelCobro(cobros.at(-1), dia) : sumaMeses(v.plan_start, pagadas - 1, dia)
  // Más de un mes sin cobrarse: ya no se da por hecho que siga.
  if (Date.parse(sumaMeses(base, 1, dia)) < Date.parse(hoy) - 31 * DIA) return null
  return { base, dia }
}

/**
 * Las mensualidades vivas (Informe → «Pagos fraccionados y mensualidades»):
 * cuántos pagos llevan y cuándo toca el siguiente (vencido si ya pasó).
 * @returns {{ venta, pagos, siguiente, n, vencida }[]}
 */
export function mensualidadesVivas(ventas, { hoy, esCancelada = cancelada } = {}) {
  const out = []
  for (const v of ventas || []) {
    if (esCancelada(v)) continue
    const viva = mensualidadViva(v, hoy)
    if (!viva) continue
    const pagos = Number(v.installments_paid) || 0
    const siguiente = sumaMeses(viva.base, 1, viva.dia)
    out.push({ venta: v, pagos, siguiente, n: pagos + 1, vencida: siguiente < hoy })
  }
  return out.sort((a, b) => a.siguiente.localeCompare(b.siguiente))
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
      const inicio = v.plan_start || v.date || null
      const ultima = v.plan_end || (inicio ? sumaMeses(inicio, total - 1) : null)
      if (!ultima) continue
      // Si plan_end es solo el día del inicio recortado a fin de mes, las de
      // en medio van el día del inicio; si no, el de plan_end.
      const recortado = inicio && diaDe(ultima) === diaDe(finDeMes(ultima)) && diaDe(inicio) > diaDe(ultima)
      const dia = recortado ? diaDe(inicio) : diaDe(ultima)
      // La diferencia (si es de verdad, no un céntimo de redondeo) va en la primera.
      const primera = r2(falta - cuota * (pend - 1))
      const ajusta = primera > 0 && Math.abs(primera - cuota) >= 1
      for (let i = 0; i < pend; i++) {
        const fecha = i === pend - 1 ? ultima : sumaMeses(ultima, -(pend - 1 - i), dia)
        pon(v, fecha, i === 0 && ajusta ? primera : (primera > 0 ? cuota : falta / pend), { tipo: 'cuota', n: pagadas + i + 1, de: total })
      }
      continue
    }

    const viva = mensualidadViva(v, hoy)
    if (viva) {
      for (let k = 1; k <= 24; k++) {
        const fecha = sumaMeses(viva.base, k, viva.dia)
        if (fecha > hasta) break
        pon(v, fecha, Number(v.installment_amount), { tipo: 'mensualidad', n: pagadas + k })
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
