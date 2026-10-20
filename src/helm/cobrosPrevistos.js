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

/** Hoy en la hora de quien mira (AAAA-MM-DD). toISOString() daría el de UTC,
 *  que en Latinoamérica ya es mañana por la noche. */
export const hoyLocal = () => new Intl.DateTimeFormat('en-CA').format(new Date())

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
// está cancelada (último cobro el 04/09/2026)… Desde entonces paga con el
// enlace suelto…») o alguien a mano («Sigue pagando la mensualidad…»). Una
// suscripción parada no para al cliente si ha vuelto a cobrar DESPUÉS de su
// último cobro (otra suscripción, un enlace).
function parada(notas, cobros) {
  const n = String(notas || '')
  if (/sigue pagando|paga con el enlace/i.test(n)) return false
  const avisos = [...n.matchAll(/suscripci[oó]n \S+ est[aá] (?:cancelada|impagada|caducada)(?: \(último cobro el (\d{2})\/(\d{2})(?:\/(\d{4}))?\))?/gi)]
  if (!avisos.length) return false
  const ultimo = cobros.at(-1)
  if (!ultimo) return true
  // Con año, la fecha exacta. Las notas viejas no lo llevan: entonces, el cobro
  // de la lista con ese día y mes más reciente (con más de un año de pagos el
  // mismo dd/mm sale dos veces).
  const finales = avisos.filter(a => a[1]).map(a => (a[3]
    ? `${a[3]}-${a[2]}-${a[1]}`
    : cobros.findLast(c => c.slice(5) === `${a[2]}-${a[1]}`) || `${ultimo.slice(0, 4)}-${a[2]}-${a[1]}`))
  // Sin fecha (nunca llegó a cobrar) no dice nada del resto: decide la regla del mes.
  if (!finales.length) return false
  return ultimo <= finales.sort().at(-1)
}

// El mes al que corresponde un cobro: el suyo del calendario, salvo que caiga
// pocos días (≤ 10) después del día de cobro del mes anterior y antes del de
// su mes, que es la cuota de ese mes anterior pagada tarde (la del 28 cobrada
// el 2). Nunca el mes siguiente: un cobro de octubre con 17 días de retraso
// sigue siendo octubre, y noviembre aún se debe.
function mesDelCobro(fecha, dia) {
  const suyo = sumaMeses(fecha, 0, dia)
  if (fecha >= suyo) return suyo
  const anterior = sumaMeses(fecha, -1, dia)
  return Date.parse(fecha) - Date.parse(anterior) <= 10 * DIA ? anterior : suyo
}

// El día en que cobra: el que más se repite en los tres últimos cobros (si
// cambió de suscripción o pasó al enlace en otro día, manda el nuevo; un
// retraso suelto no lo mueve). Sin lista, el del inicio.
function diaDeCobro(cobros, inicio) {
  const ultimos = cobros.slice(-3).map(diaDe)
  if (!ultimos.length) return diaDe(inicio)
  const veces = (d) => ultimos.filter(x => x === d).length
  return ultimos.reduceRight((a, d) => (veces(d) > veces(a) ? d : a), ultimos.at(-1))
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
  const dia = diaDeCobro(cobros, v.plan_start)
  // El mes del último cobro; sin la lista de la nota (una venta apuntada a
  // mano), el que toca contando desde el inicio.
  const base = cobros.length ? mesDelCobro(cobros.at(-1), dia) : sumaMeses(v.plan_start, pagadas - 1, dia)
  // Más de un mes sin cobrarse: ya no se da por hecho que siga.
  if (Date.parse(sumaMeses(base, 1, dia)) < Date.parse(hoy) - 31 * DIA) return null
  return { base, dia }
}

/**
 * El calendario de un plan fraccionado: k (1…total) → la fecha de su cuota.
 * La 1ª, el inicio (la entrada); la última, `plan_end`; las de en medio, una
 * por mes hacia atrás desde `plan_end`, el día del inicio si `plan_end` solo
 * está recortado a fin de mes (un plan del 31 cobra el 30 de noviembre, no el
 * 28) o el de `plan_end` si no. Sin fechas, cuenta desde la fecha de la venta.
 */
function calendarioPlan(v) {
  const total = Number(v.installments_total) || 0
  const inicio = v.plan_start || v.date || null
  const ultima = v.plan_end || (inicio ? sumaMeses(inicio, total - 1) : null)
  if (!total || !ultima) return null
  const recortado = inicio && diaDe(ultima) === diaDe(finDeMes(ultima)) && diaDe(inicio) > diaDe(ultima)
  const dia = recortado ? diaDe(inicio) : diaDe(ultima)
  return (k) => (k >= total ? ultima : k === 1 && inicio ? inicio : sumaMeses(ultima, -(total - k), dia))
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
      const fechaDe = calendarioPlan(v)
      if (!fechaDe) continue
      // La diferencia (si es de verdad, no un céntimo de redondeo) va en la primera.
      const primera = r2(falta - cuota * (pend - 1))
      const ajusta = primera > 0 && Math.abs(primera - cuota) >= 1
      for (let i = 0; i < pend; i++) {
        pon(v, fechaDe(pagadas + i + 1), i === 0 && ajusta ? primera : (primera > 0 ? cuota : falta / pend), { tipo: 'cuota', n: pagadas + i + 1, de: total })
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

/**
 * Para contar por fechas (Informe): cada venta partida en sus cobros, cada uno
 * en su día. La 1ª fila es la venta (`cuota` 1, o sin `cuota`); las demás son
 * cobros de esa misma venta: cuentan en lo facturado/cobrado de su mes, pero
 * no como ventas nuevas.
 *
 *   · Mensualidad: la tarea diaria la guarda como UNA venta fechada en su
 *     primer pago, y así la cuota de octubre contaba en mayo. Se parte con la
 *     lista de fechas de su nota, una cuota por cobro. Si no la trae (apuntada
 *     a mano), no cuadra con los pagos o las cuotas no fueron todas iguales
 *     (un cupón el primer mes), se queda como está: repartir a partes iguales
 *     mentiría.
 *   · Plan fraccionado: lo facturado sigue en la venta (es lo contratado), y
 *     lo cobrado va cuota a cuota en las fechas de su calendario.
 */
export function ventasPorCobro(ventas) {
  return (ventas || []).flatMap(v => {
    const total = Number(v.installments_total) || 0
    const pagadas = Number(v.installments_paid) || 0

    if (total) {
      const cobrado = Number(v.cash_collected) || 0
      const fechaDe = calendarioPlan(v)
      if (pagadas < 2 || cobrado <= 0 || !fechaDe) return [v]
      const cuota = Number(v.installment_amount) || r2(cobrado / pagadas)
      let primera = r2(cobrado - cuota * (pagadas - 1))
      const iguales = primera <= 0
      if (iguales) primera = r2(cobrado / pagadas)
      return Array.from({ length: Math.min(pagadas, total) }, (_, i) => (i === 0
        ? { ...v, cuota: 1, cash_collected: primera }
        : { ...v, id: `${v.id}#${i + 1}`, date: fechaDe(i + 1), cuota: i + 1, revenue: 0, cash_collected: iguales ? (i === pagadas - 1 ? r2(cobrado - primera * (pagadas - 1)) : primera) : cuota }))
    }

    if (v.payment_type !== 'Suscripción' || !v.plan_start) return [v]
    const cobros = cobrosDeLaNota(v.notes, v.plan_start)
    const n = cobros.length
    if (n < 2 || n !== pagadas) return [v]
    const importe = Number(v.installment_amount) || 0
    const casa = (x) => Math.abs((Number(x) || 0) - importe * n) <= 0.5
    if (!importe || !casa(v.revenue) || !casa(v.cash_collected)) return [v]
    return cobros.map((fecha, i) => ({
      ...v, id: i === 0 ? v.id : `${v.id}#${i + 1}`, date: fecha, cuota: i + 1, revenue: importe, cash_collected: importe,
    }))
  })
}

/** ¿Esta fila de ventasPorCobro es una venta (y no un cobro más de una)? */
export const esVentaNueva = (fila) => !fila.cuota || fila.cuota === 1

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
