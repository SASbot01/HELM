// Ventas → «Próximos cobros» (src/helm/cobrosPrevistos.js): lo que va a
// entrar, calculado de los planes y las mensualidades. Con las ventas de
// Detrás de Cámara tal como quedaron el 20/10/2026.
import { describe, it, expect, vi } from 'vitest'
import { cobrosPrevistos, porMes, sumaMeses, cobrosDeLaNota, mensualidadesVivas, hoyLocal } from '../src/helm/cobrosPrevistos.js'

const VENTAS = [
  { id: 'david', client_name: 'David Villasmil', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', payment_method: 'Stripe',
    revenue: 985, cash_collected: 985, status: 'won', installments_total: null, installments_paid: 5, installment_amount: 197, plan_start: '2026-05-04',
    notes: 'Mensualidad de 197 €: 5 cuotas cobradas (04/05, 04/06, 04/07, 04/08, 04/09). La suscripción sub_1TTURl está impagada (último cobro el 04/09).' },
  { id: 'alexander', client_name: 'Alexander Salgado', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', payment_method: 'Stripe',
    revenue: 1182, cash_collected: 1182, status: 'won', installments_total: null, installments_paid: 6, installment_amount: 197, plan_start: '2026-05-05',
    notes: 'Mensualidad de 197 €: 6 cuotas cobradas (05/05, 05/06, 05/07, 08/08, 05/09, 05/10).' },
  { id: 'michele', client_name: 'Michele Toledo Jara', product: 'Año formativo', payment_type: 'Fraccionado', payment_method: 'Stripe (suscripción)',
    revenue: 1987, cash_collected: 331.17, status: 'won', installments_total: 6, installments_paid: 1, installment_amount: 331.17, plan_start: '2026-10-04', plan_end: '2027-03-04' },
  { id: 'michele-dup', client_name: 'Michele Toledo', product: 'Detrás de Cámara · Año formativo', payment_type: 'Suscripción', payment_method: 'Stripe (card)',
    revenue: 331.17, cash_collected: 331.17, status: 'cancelada', installments_paid: 0 },
  { id: 'nicolas-reserva', client_name: 'Nicolas salas', product: 'Reserva · Bolsa de trabajo', payment_type: 'Pago único', revenue: 115, cash_collected: 115, status: 'Completada', installments_paid: 0 },
  { id: 'alicia', client_name: 'Alicia Gil', product: 'Detrás de Cámara · mensualidad', payment_type: 'Suscripción', payment_method: 'Stripe',
    revenue: 197, cash_collected: 197, status: 'won', installments_total: null, installments_paid: 1, installment_amount: 197, plan_start: '2026-10-08',
    notes: 'Mensualidad de 197 €: 1 cuota cobrada (08/10).' },
  { id: 'gonzalo', client_name: 'Gonzalo fuselli gopar', product: 'Año formativo', payment_type: 'Fraccionado', payment_method: 'Efectivo',
    revenue: 2000, cash_collected: 1000, status: 'won', installments_total: 2, installments_paid: 1, installment_amount: 1000, plan_start: '2026-10-13', plan_end: '2026-11-26' },
  { id: 'nicolas', client_name: 'Nicolas Salas', product: 'Año formativo', payment_type: 'Fraccionado', payment_method: 'Stripe',
    revenue: 1872.02, cash_collected: 0, status: 'won', installments_total: 6, installments_paid: 0, installment_amount: 331.17, plan_start: '2026-10-07', plan_end: '2027-03-07' },
]

const de = (cobros, id) => cobros.filter(c => c.ventaId === id).map(c => [c.fecha, c.importe])

describe('sumaMeses', () => {
  it('suma y resta meses sin pasarse del último día', () => {
    expect(sumaMeses('2026-10-07', 1)).toBe('2026-11-07')
    expect(sumaMeses('2027-03-04', -4)).toBe('2026-11-04')
    expect(sumaMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumaMeses('2026-12-15', 1)).toBe('2027-01-15')
    expect(sumaMeses('2026-10-01', 0, 31)).toBe('2026-10-31')
  })
})

describe('cobrosPrevistos (Detrás de Cámara, 20/10/2026)', () => {
  const cobros = cobrosPrevistos(VENTAS, { hoy: '2026-10-20', meses: 6 })

  it('Michele: las 5 cuotas que le quedan, el día 4, de noviembre a marzo', () => {
    expect(de(cobros, 'michele')).toEqual([
      ['2026-11-04', 331.17], ['2026-12-04', 331.17], ['2027-01-04', 331.17], ['2027-02-04', 331.17], ['2027-03-04', 331.17],
    ])
  })

  it('Nicolás: octubre con la reserva descontada (vencida) y luego 331,17 € el día 7', () => {
    const n = cobros.filter(c => c.ventaId === 'nicolas')
    expect(n.map(c => [c.fecha, c.importe])).toEqual([
      ['2026-10-07', 216.17], ['2026-11-07', 331.17], ['2026-12-07', 331.17], ['2027-01-07', 331.17], ['2027-02-07', 331.17], ['2027-03-07', 331.17],
    ])
    expect(n[0].vencido).toBe(true)
    expect(n[1].vencido).toBe(false)
  })

  it('Gonzalo: los otros 1.000 € el 26 de noviembre', () => {
    expect(de(cobros, 'gonzalo')).toEqual([['2026-11-26', 1000]])
  })

  it('las mensualidades vivas siguen cada mes; la de David (impagada) no', () => {
    expect(de(cobros, 'alexander')).toEqual([['2026-11-05', 197], ['2026-12-05', 197], ['2027-01-05', 197], ['2027-02-05', 197], ['2027-03-05', 197]])
    expect(de(cobros, 'alicia')).toEqual([['2026-11-08', 197], ['2026-12-08', 197], ['2027-01-08', 197], ['2027-02-08', 197], ['2027-03-08', 197]])
    expect(de(cobros, 'david')).toEqual([])
  })

  it('ni las canceladas ni los pagos únicos', () => {
    expect(de(cobros, 'michele-dup')).toEqual([])
    expect(de(cobros, 'nicolas-reserva')).toEqual([])
  })

  it('por mes, en orden y con su total', () => {
    const m = porMes(cobros)
    expect(m.map(x => x.mes)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
    expect(m[0].total).toBe(216.17)
    // Noviembre: Michele 331,17 + Alexander 197 + Nicolás 331,17 + Alicia 197 + Gonzalo 1.000
    expect(m[1].total).toBe(2056.34)
  })

  it('cuando se cobra una cuota, deja de salir', () => {
    const tras = VENTAS.map(v => (v.id === 'michele' ? { ...v, installments_paid: 2, cash_collected: 662.34 } : v))
    expect(de(cobrosPrevistos(tras, { hoy: '2026-11-05' }), 'michele')[0]).toEqual(['2026-12-04', 331.17])
  })

  it('cada mensualidad lleva su número, para saber por qué mes va', () => {
    const a = cobros.filter(c => c.ventaId === 'alexander')
    expect(a.map(c => c.n)).toEqual([7, 8, 9, 10, 11])
  })

  it('David: la suscripción cayó, pero sigue pagando con un enlace → octubre vencido y luego el día 4', () => {
    const sigue = VENTAS.map(v => (v.id === 'david'
      ? { ...v, notes: `${v.notes}\n[20/10] Sigue pagando la mensualidad de 197 € con un enlace de pago.` } : v))
    const d = cobrosPrevistos(sigue, { hoy: '2026-10-20' }).filter(c => c.ventaId === 'david')
    expect(d.map(c => [c.fecha, c.importe, c.n, c.vencido])).toEqual([
      ['2026-10-04', 197, 6, true], ['2026-11-04', 197, 7, false], ['2026-12-04', 197, 8, false],
      ['2027-01-04', 197, 9, false], ['2027-02-04', 197, 10, false], ['2027-03-04', 197, 11, false],
    ])
    // Y con la nota que escribe la tarea diaria cuando paga con el enlace suelto.
    const conEnlace = VENTAS.map(v => (v.id === 'david'
      ? { ...v, installments_paid: 6, notes: 'Mensualidad de 197 €: 6 cuotas cobradas (…). La suscripción sub_1TTURl está cancelada (último cobro el 04/09). Desde entonces paga con el enlace suelto, que cuenta aquí igual.' } : v))
    expect(cobrosPrevistos(conEnlace, { hoy: '2026-10-25' }).filter(c => c.ventaId === 'david')[0]).toMatchObject({ fecha: '2026-11-04', n: 7 })
  })

  it('una mensualidad que lleva más de un mes sin cobrarse no se da por hecha', () => {
    const vieja = [{ ...VENTAS[1], id: 'vieja', installments_paid: 3, notes: '' }]   // siguiente: 05/08
    expect(cobrosPrevistos(vieja, { hoy: '2026-10-20' })).toEqual([])
  })
})

describe('casos de la revisión', () => {
  const mensual = (extra) => ({ id: 'm', client_name: 'X', product: 'Mensualidad', payment_type: 'Suscripción', payment_method: 'Stripe',
    status: 'won', installments_total: null, installment_amount: 197, ...extra })
  const fechas = (v, hoy) => cobrosPrevistos([v], { hoy }).map(c => c.fecha)

  it('la nota da las fechas de los cobros con su año', () => {
    expect(cobrosDeLaNota('3 cuotas cobradas (05/11, 05/12, 05/01).', '2026-11-05')).toEqual(['2026-11-05', '2026-12-05', '2027-01-05'])
    expect(cobrosDeLaNota('Mensualidad de 197 €: 1 cuota cobrada (08/10).', '2026-10-08')).toEqual(['2026-10-08'])
    expect(cobrosDeLaNota('sin lista', '2026-10-08')).toEqual([])
  })

  it('un mes saltado no da por pendiente lo ya cobrado (cuenta desde el último cobro)', () => {
    const v = mensual({ plan_start: '2026-05-08', installments_paid: 5, notes: '5 cuotas cobradas (08/05, 08/06, 08/08, 08/09, 08/10).' })
    const c = cobrosPrevistos([v], { hoy: '2026-10-20' })
    expect(c[0]).toMatchObject({ fecha: '2026-11-08', n: 6, vencido: false })
    expect(c.some(x => x.fecha.startsWith('2026-10'))).toBe(false)
  })

  it('ni hace desaparecer a quien pagó este mes tras saltarse dos', () => {
    const v = mensual({ plan_start: '2026-05-08', installments_paid: 4, notes: '4 cuotas cobradas (08/05, 08/06, 08/09, 08/10).' })
    expect(fechas(v, '2026-10-20')[0]).toBe('2026-11-08')
  })

  it('quien canceló y se volvió a suscribir sigue contando', () => {
    const v = mensual({ plan_start: '2026-05-05', installments_paid: 6,
      notes: 'Mensualidad de 197 €: 6 cuotas cobradas (05/05, 05/06, 05/07, 05/08, 05/09, 05/10). La suscripción sub_1OLD está cancelada (último cobro el 05/06).' })
    expect(fechas(v, '2026-10-20')[0]).toBe('2026-11-05')
  })

  it('un plan del día 31 cobra el último día de cada mes, no el 28', () => {
    const v = { id: 'p', client_name: 'Y', payment_type: 'Fraccionado', status: 'won', revenue: 500, cash_collected: 100,
      installments_total: 5, installments_paid: 1, installment_amount: 100, plan_start: '2026-10-31', plan_end: '2027-02-28' }
    const c = cobrosPrevistos([v], { hoy: '2026-11-29' })
    expect(c.map(x => x.fecha)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
    expect(c[0].vencido).toBe(false)
  })

  it('un plan con su propio día de cuota (no recortado) lo mantiene', () => {
    const v = { id: 'g', client_name: 'G', payment_type: 'Fraccionado', status: 'won', revenue: 3000, cash_collected: 1000,
      installments_total: 3, installments_paid: 1, installment_amount: 1000, plan_start: '2026-10-13', plan_end: '2026-12-26' }
    expect(fechas(v, '2026-10-20')).toEqual(['2026-11-26', '2026-12-26'])
  })

  it('un plan sin fechas cuenta desde la fecha de la venta', () => {
    const v = { id: 's', client_name: 'S', payment_type: 'Fraccionado', status: 'won', revenue: 1200, cash_collected: 400,
      installments_total: 3, installments_paid: 1, installment_amount: 400, date: '2026-10-10', plan_start: null, plan_end: null }
    expect(fechas(v, '2026-10-20')).toEqual(['2026-11-10', '2026-12-10'])
  })
})

describe('mensualidadesVivas (Informe)', () => {
  it('las de 197 €: cuántos pagos llevan y cuándo toca el siguiente', () => {
    const conDavid = VENTAS.map(v => (v.id === 'david' ? { ...v, notes: `${v.notes}\n[20/10] Sigue pagando la mensualidad de 197 €.` } : v))
    const m = mensualidadesVivas(conDavid, { hoy: '2026-10-20' })
    expect(m.map(x => [x.venta.id, x.pagos, x.siguiente, x.n, x.vencida])).toEqual([
      ['david', 5, '2026-10-04', 6, true],
      ['alexander', 6, '2026-11-05', 7, false],
      ['alicia', 1, '2026-11-08', 2, false],
    ])
  })

  it('sin la nota de que sigue, la de David (impagada) no sale', () => {
    expect(mensualidadesVivas(VENTAS, { hoy: '2026-10-20' }).map(x => x.venta.id)).toEqual(['alexander', 'alicia'])
  })
})

describe('más de un año de mensualidad', () => {
  it('una suscripción cancelada justo tras su cobro 13º no se sigue previendo', () => {
    const v = { id: 'x', client_name: 'X', product: 'M', payment_type: 'Suscripción', status: 'won', installments_total: null, installment_amount: 197,
      plan_start: '2025-10-05', installments_paid: 13,
      notes: 'Mensualidad de 197 €: 13 cuotas cobradas (05/10, 05/11, 05/12, 05/01, 05/02, 05/03, 05/04, 05/05, 05/06, 05/07, 05/08, 05/09, 05/10). La suscripción sub_1ABC está cancelada (último cobro el 05/10).' }
    expect(cobrosPrevistos([v], { hoy: '2026-10-20' })).toEqual([])
    expect(cobrosDeLaNota(v.notes, v.plan_start).at(-1)).toBe('2026-10-05')
  })
})

describe('verificación: retrasos, cambios de día y años', () => {
  const m = (extra) => ({ id: 'v', client_name: 'V', product: 'M', payment_type: 'Suscripción', status: 'won', installments_total: null, installment_amount: 197, ...extra })
  const primera = (v, hoy) => cobrosPrevistos([v], { hoy })[0]

  it('un cobro con 17 días de retraso sigue siendo de su mes: noviembre se debe', () => {
    expect(primera(m({ plan_start: '2026-05-05', installments_paid: 6, notes: '6 cuotas cobradas (05/05, 05/06, 05/07, 05/08, 05/09, 22/10).' }), '2026-10-25'))
      .toMatchObject({ fecha: '2026-11-05', n: 7 })
  })

  it('la cuota del 28 cobrada el 2 del mes siguiente es la del mes anterior', () => {
    expect(primera(m({ plan_start: '2026-10-28', installments_paid: 3, notes: '3 cuotas cobradas (28/10, 28/11, 02/01).' }), '2027-01-10'))
      .toMatchObject({ fecha: '2027-01-28', n: 4 })
  })

  it('si cambió el día de cobro (otra suscripción, o el enlace), manda el nuevo', () => {
    expect(primera(m({ plan_start: '2026-05-05', installments_paid: 6,
      notes: '6 cuotas cobradas (05/05, 05/06, 05/07, 22/08, 22/09, 22/10). La suscripción sub_OLD está cancelada (último cobro el 05/07).' }), '2026-10-25'))
      .toMatchObject({ fecha: '2026-11-22', n: 7 })
    expect(primera(m({ plan_start: '2026-05-25', installments_paid: 6, notes: '6 cuotas cobradas (25/05, 25/06, 10/07, 10/08, 10/09, 10/10).' }), '2026-10-20'))
      .toMatchObject({ fecha: '2026-11-10', n: 7 })
  })

  it('David: suscripción caída y octubre pagado con el enlace el 8 → la 7ª el 4 de noviembre', () => {
    expect(primera(m({ plan_start: '2026-05-04', installments_paid: 6,
      notes: 'Mensualidad de 197 €: 6 cuotas cobradas (04/05, 04/06, 04/07, 04/08, 04/09, 08/10). La suscripción sub_1TTURl está cancelada (último cobro el 04/09/2026). Desde entonces paga con el enlace suelto, que cuenta aquí igual.' }), '2026-10-20'))
      .toMatchObject({ fecha: '2026-11-04', n: 7, vencido: false })
  })

  it('con el año en el aviso, quien se volvió a suscribir el mismo día un año después sigue', () => {
    const v = m({ plan_start: '2026-05-05', installments_paid: 14,
      notes: '14 cuotas cobradas (05/05, 05/06, 05/07, 05/08, 05/09, 05/10, 05/11, 05/12, 05/01, 05/02, 05/03, 05/04, 05/05, 05/06). La suscripción sub_1OLD está cancelada (último cobro el 05/06/2026).' })
    expect(primera(v, '2027-06-10')).toMatchObject({ fecha: '2027-07-05', n: 15 })
  })

  it('hoyLocal es el día de quien mira, no el de UTC', () => {
    const antes = process.env.TZ
    process.env.TZ = 'America/Bogota'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T01:00:00Z'))   // 20:00 del 20 en Bogotá
    expect(hoyLocal()).toBe('2026-10-20')
    vi.useRealTimers()
    process.env.TZ = antes
  })
})

