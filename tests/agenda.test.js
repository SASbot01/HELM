// La plantilla de la agenda: qué huecos se ofrecen y qué horas se aceptan al
// reservar. Sin red ni base: solo las funciones puras de api/agenda.js.
import { describe, it, expect, vi } from 'vitest'

// api/agenda.js crea el cliente de la base al importarse; aquí no se usa.
vi.stubEnv('SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('SUPABASE_SERVICE_KEY', 'clave-de-prueba')
const { construirDias, dentroDeAgenda, franjasDe, AGENDA_DEFECTO } = await import('../api/agenda.js')

// Horario de En Forma con Hugo (16-nov-2026): de lunes a viernes, de 10 a 14 y de 16 a 20.
const HUGO = {
  dias: [1, 2, 3, 4, 5],
  franjas: [{ desde: '10:00', hasta: '14:00' }, { desde: '16:00', hasta: '20:00' }],
}

// Lunes 16-nov-2026 a medianoche en Madrid (UTC+1 en noviembre).
const LUNES = new Date('2026-11-15T23:00:00Z')
const media = (iso) => [iso, new Date(new Date(iso).getTime() + 30 * 60000).toISOString()]
const horas = (dia) => dia.slots.map(s => s.time)

describe('construirDias con horario partido', () => {
  const dias = construirDias(HUGO, [], LUNES)

  it('solo ofrece de lunes a viernes', () => {
    expect(dias.map(d => d.weekday)).toEqual(
      ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'lunes', 'martes', 'miércoles'])
    expect(dias.map(d => d.date)).not.toContain('2026-11-21')
    expect(dias.map(d => d.date)).not.toContain('2026-11-22')
  })

  it('de 10 a 14 y de 16 a 20, con la última llamada acabando a la hora de cierre', () => {
    expect(horas(dias[0])).toEqual([
      '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
      '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    ])
    expect(dias[0].slots[0]).toMatchObject({
      start: '2026-11-16T09:00:00.000Z', end: '2026-11-16T09:30:00.000Z', available: true,
    })
  })

  it('tacha lo ocupado en el calendario', () => {
    // Ocupado de 11:00 a 12:00 y de 17:15 a 17:45 (hora de Madrid) el lunes.
    const ocupado = [
      [Date.parse('2026-11-16T10:00:00Z'), Date.parse('2026-11-16T11:00:00Z')],
      [Date.parse('2026-11-16T16:15:00Z'), Date.parse('2026-11-16T16:45:00Z')],
    ]
    const lunes = construirDias(HUGO, ocupado, LUNES)[0]
    expect(horas(lunes)).not.toContain('11:00')
    expect(horas(lunes)).not.toContain('11:30')
    expect(horas(lunes)).not.toContain('17:00')
    expect(horas(lunes)).not.toContain('17:30')
    expect(horas(lunes)).toContain('12:00')
  })

  it('respeta el cambio de hora: en verano las 10:00 de Madrid son las 08:00 UTC', () => {
    const junio = construirDias(HUGO, [], new Date('2026-06-14T22:00:00Z'))[0]  // lunes 15-jun
    expect(junio.weekday).toBe('lunes')
    expect(junio.slots[0]).toMatchObject({ time: '10:00', start: '2026-06-15T08:00:00.000Z' })
    expect(junio.slots.at(-1)).toMatchObject({ time: '19:30', end: '2026-06-15T18:00:00.000Z' })
  })
})

describe('construirDias sin franjas (perfiles de antes)', () => {
  it('sigue usando desde–hasta', () => {
    const lunes = construirDias({}, [], LUNES)[0]
    expect(horas(lunes)[0]).toBe(AGENDA_DEFECTO.desde)
    expect(horas(lunes).at(-1)).toBe('18:30')
    expect(lunes.slots).toHaveLength(18)
  })

  it('franjas que se pisan no repiten hueco y salen en orden', () => {
    const cfg = { franjas: [{ desde: '12:00', hasta: '15:00' }, { desde: '10:00', hasta: '13:00' }] }
    expect(horas(construirDias(cfg, [], LUNES)[0])).toEqual(
      ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30'])
  })

  it('una franja mal escrita no ofrece nada en vez de romper', () => {
    expect(franjasDe({ franjas: [{ desde: 'diez', hasta: '14:00' }, null] })).toEqual([])
    expect(construirDias({ franjas: [{ desde: 'diez' }] }, [], LUNES)).toEqual([])
  })
})

describe('dentroDeAgenda: lo que se acepta al reservar', () => {
  const casos = [
    ['lunes 10:00', media('2026-11-16T09:00:00Z'), true],
    ['lunes 09:30', media('2026-11-16T08:30:00Z'), false],
    ['lunes 13:30, acaba a las 14:00', media('2026-11-16T12:30:00Z'), true],
    ['lunes 13:45, se sale de la franja', media('2026-11-16T12:45:00Z'), false],
    ['lunes 14:00', media('2026-11-16T13:00:00Z'), false],
    ['lunes 15:30', media('2026-11-16T14:30:00Z'), false],
    ['lunes 16:00', media('2026-11-16T15:00:00Z'), true],
    ['viernes 19:30, acaba a las 20:00', media('2026-11-20T18:30:00Z'), true],
    ['viernes 20:00', media('2026-11-20T19:00:00Z'), false],
    ['sábado 10:00', media('2026-11-21T09:00:00Z'), false],
    ['domingo 17:00', media('2026-11-22T16:00:00Z'), false],
    ['junio, miércoles 10:00 (08:00 UTC)', media('2026-06-10T08:00:00Z'), true],
    ['junio, miércoles 20:00 (18:00 UTC)', media('2026-06-10T18:00:00Z'), false],
    ['fecha que no es fecha', ['mañana', '2026-11-16T09:30:00Z'], false],
    ['fin antes que inicio', ['2026-11-16T09:30:00Z', '2026-11-16T09:00:00Z'], false],
  ]
  for (const [nombre, [inicio, fin], esperado] of casos) {
    it(nombre, () => expect(dentroDeAgenda(HUGO, inicio, fin)).toBe(esperado))
  }

  it('sin franjas usa la plantilla de siempre: de lunes a viernes, de 10 a 19', () => {
    expect(dentroDeAgenda({}, ...media('2026-11-16T17:30:00Z'))).toBe(true)   // 18:30
    expect(dentroDeAgenda({}, ...media('2026-11-16T18:00:00Z'))).toBe(false)  // 19:00
    expect(dentroDeAgenda({}, ...media('2026-11-21T10:00:00Z'))).toBe(false)  // sábado
  })
})
