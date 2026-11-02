// Email marketing · cuándo sale cada correo (api/_lib/email/calendario.js):
// en hora de Madrid, con las esperas sumadas al día del calendario (la semana
// del cambio de hora, «a las 10:00» siguen siendo las 10:00 de aquí) y la
// franja horaria empujando a su apertura siguiente lo que caiga fuera.
import { describe, it, expect } from 'vitest'
import {
  deMadrid, partesMadrid, leeLocalMadrid, localMadrid, enVentana, ajustaAVentana, primerEnvio, siguienteEnvio, ventanaDe,
} from '../api/_lib/email/calendario.js'

const iso = (d) => d.toISOString()

describe('calendario · hora de Madrid', () => {
  it('invierno UTC+1 y verano UTC+2, también el día del cambio', () => {
    expect(iso(deMadrid(2026, 11, 2, 9, 0))).toBe('2026-11-02T08:00:00.000Z')
    expect(iso(deMadrid(2026, 7, 15, 9, 0))).toBe('2026-07-15T07:00:00.000Z')
    // 29-mar-2026 se adelanta la hora; 25-oct-2026 se atrasa.
    expect(iso(deMadrid(2026, 3, 29, 9, 0))).toBe('2026-03-29T07:00:00.000Z')
    expect(iso(deMadrid(2026, 10, 25, 9, 0))).toBe('2026-10-25T08:00:00.000Z')
    expect(partesMadrid(new Date('2026-03-29T07:00:00Z'))).toMatchObject({ d: 29, h: 9, min: 0 })
  })

  it('lee y escribe lo del <input type="datetime-local"> como hora de Madrid', () => {
    expect(iso(leeLocalMadrid('2026-11-05T09:30'))).toBe('2026-11-05T08:30:00.000Z')
    expect(localMadrid('2026-11-05T08:30:00.000Z')).toBe('2026-11-05T09:30')
    expect(leeLocalMadrid('2026-02-31T10:00')).toBeNull()
    expect(leeLocalMadrid('mañana')).toBeNull()
    expect(localMadrid(null)).toBe('')
  })
})

describe('calendario · esperas', () => {
  it('N días después, a la misma hora del reloj de Madrid aunque cambie la hora', () => {
    const viernes = deMadrid(2026, 3, 27, 10, 0)   // UTC+1
    expect(iso(siguienteEnvio(viernes, 2))).toBe('2026-03-29T08:00:00.000Z')   // domingo 10:00, ya UTC+2
    expect(partesMadrid(siguienteEnvio(viernes, 2))).toMatchObject({ d: 29, h: 10, min: 0 })
    const otono = deMadrid(2026, 10, 24, 18, 15)
    expect(partesMadrid(siguienteEnvio(otono, 1))).toMatchObject({ m: 10, d: 25, h: 18, min: 15 })
  })

  it('cruza meses y años, y 0 días es enseguida', () => {
    expect(partesMadrid(siguienteEnvio(deMadrid(2026, 12, 30, 12, 0), 3))).toMatchObject({ y: 2027, m: 1, d: 2, h: 12 })
    const ya = deMadrid(2026, 11, 2, 12, 0)
    expect(iso(siguienteEnvio(ya, 0))).toBe(iso(ya))
  })

  it('el primero: al lanzar o a la fecha programada (nunca antes de ahora)', () => {
    const ahora = deMadrid(2026, 11, 2, 12, 0)
    expect(iso(primerEnvio({ ahora }))).toBe(iso(ahora))
    const luego = deMadrid(2026, 11, 10, 9, 0)
    expect(iso(primerEnvio({ ahora, inicioEn: luego }))).toBe(iso(luego))
    expect(iso(primerEnvio({ ahora, inicioEn: deMadrid(2026, 11, 1, 9, 0) }))).toBe(iso(ahora))
  })
})

describe('calendario · franja horaria', () => {
  const v = { desde: 9, hasta: 20 }

  it('dentro de la franja se queda; antes, a la apertura de ese día; después, a la del siguiente', () => {
    expect(enVentana(deMadrid(2026, 11, 2, 9, 0), v)).toBe(true)
    expect(enVentana(deMadrid(2026, 11, 2, 19, 59), v)).toBe(true)
    expect(enVentana(deMadrid(2026, 11, 2, 20, 0), v)).toBe(false)
    expect(iso(ajustaAVentana(deMadrid(2026, 11, 2, 7, 30), v))).toBe(iso(deMadrid(2026, 11, 2, 9, 0)))
    expect(iso(ajustaAVentana(deMadrid(2026, 11, 2, 21, 30), v))).toBe(iso(deMadrid(2026, 11, 3, 9, 0)))
    expect(iso(ajustaAVentana(deMadrid(2026, 11, 2, 12, 0), null))).toBe(iso(deMadrid(2026, 11, 2, 12, 0)))
  })

  it('las esperas y el primero respetan la franja', () => {
    expect(iso(siguienteEnvio(deMadrid(2026, 11, 2, 19, 50), 1, v))).toBe(iso(deMadrid(2026, 11, 3, 19, 50)))
    expect(iso(siguienteEnvio(deMadrid(2026, 11, 2, 22, 0), 2, v))).toBe(iso(deMadrid(2026, 11, 5, 9, 0)))
    expect(iso(primerEnvio({ ahora: deMadrid(2026, 11, 2, 23, 0), ventana: v }))).toBe(iso(deMadrid(2026, 11, 3, 9, 0)))
    // Programada a las 6:00 con franja de 9 a 20: sale a las 9:00 de ese día.
    expect(iso(primerEnvio({ ahora: deMadrid(2026, 11, 2, 12, 0), inicioEn: deMadrid(2026, 11, 4, 6, 0), ventana: v }))).toBe(iso(deMadrid(2026, 11, 4, 9, 0)))
  })

  it('la franja de una campaña sale de sus columnas (las dos o ninguna)', () => {
    expect(ventanaDe({ ventana_desde: 9, ventana_hasta: 20 })).toEqual({ desde: 9, hasta: 20 })
    expect(ventanaDe({ ventana_desde: null, ventana_hasta: null })).toBeNull()
    expect(ventanaDe({})).toBeNull()
  })
})
