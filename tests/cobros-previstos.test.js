// Ventas → «Próximos cobros» (src/helm/cobrosPrevistos.js): lo que va a
// entrar, calculado de los planes y las mensualidades. Con las ventas de
// Detrás de Cámara tal como quedaron el 20/10/2026.
import { describe, it, expect } from 'vitest'
import { cobrosPrevistos, porMes, sumaMeses } from '../src/helm/cobrosPrevistos.js'

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
