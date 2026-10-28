// El validador de argumentos de las herramientas (conector MCP y equipo de
// agentes) y el recorte de respuestas. Funciones puras: sin red ni base.
import { describe, it, expect } from 'vitest'
import { validaArgs, explicaErrores, esFecha, pagina, recorta, resumeArgs } from '../api/_lib/esquema.js'

const ESQ = {
  type: 'object',
  properties: {
    perfil: { type: 'string', description: 'Slug del perfil.' },
    limite: { type: 'integer', minimum: 1, maximum: 100 },
    detalle: { type: 'string', enum: ['resumen', 'completo'] },
    prueba: { type: 'boolean' },
    guiones: {
      type: 'array', minItems: 1, maxItems: 2,
      items: {
        type: 'object',
        properties: {
          fecha: { type: 'string', format: 'date' },
          titulo: { type: 'string' },
          tipo: { type: 'string', enum: ['viralidad', 'venta'] },
        },
        required: ['fecha', 'titulo', 'tipo'],
      },
    },
  },
  required: ['perfil'],
}

describe('validaArgs', () => {
  it('deja pasar lo que vale, tal cual', () => {
    const args = { perfil: 'hugo', limite: 10, detalle: 'resumen', guiones: [{ fecha: '2026-10-14', titulo: 'T', tipo: 'venta' }] }
    const r = validaArgs(ESQ, args)
    expect(r.errores).toEqual([])
    expect(r.args).toEqual(args)
  })

  it('dice qué obligatorio falta, con su descripción', () => {
    const { errores } = validaArgs(ESQ, {})
    expect(errores).toHaveLength(1)
    expect(errores[0]).toMatch(/^perfil: falta, y es obligatorio \(Slug del perfil\.\)/)
  })

  it('en un enum, dice los valores posibles', () => {
    const { errores } = validaArgs(ESQ, { perfil: 'x', detalle: 'todo' })
    expect(errores[0]).toBe('detalle: "todo" no vale. Valores posibles: "resumen", "completo".')
  })

  it('las fechas: formato y que existan', () => {
    const mal = (fecha) => validaArgs(ESQ, { perfil: 'x', guiones: [{ fecha, titulo: 'a', tipo: 'venta' }] }).errores
    expect(mal('2026-10-14')).toEqual([])
    expect(mal('14/10/2026')[0]).toMatch(/^guiones\[0\]\.fecha: .*AAAA-MM-DD/)
    expect(mal('2026-02-30')[0]).toMatch(/no es una fecha válida/)
    expect(esFecha('2028-02-29')).toBe(true)
    expect(esFecha('2026-13-01')).toBe(false)
  })

  it('los errores de dentro de una lista dicen en qué elemento', () => {
    const { errores } = validaArgs(ESQ, { perfil: 'x', guiones: [{ fecha: '2026-10-14', titulo: 'a', tipo: 'venta' }, { fecha: '2026-10-15', tipo: 'otro' }] })
    expect(errores).toContain('guiones[1].titulo: falta, y es obligatorio.')
    expect(errores.some(e => e.startsWith('guiones[1].tipo: "otro" no vale'))).toBe(true)
  })

  it('tipos, mínimos, máximos y tamaño de lista', () => {
    expect(validaArgs(ESQ, { perfil: 3 }).errores[0]).toBe('perfil: tiene que ser texto; ha llegado un número 3.')
    expect(validaArgs(ESQ, { perfil: 'x', limite: 0 }).errores[0]).toMatch(/menos del mínimo \(1\)/)
    expect(validaArgs(ESQ, { perfil: 'x', limite: 2.5 }).errores[0]).toMatch(/número entero/)
    expect(validaArgs(ESQ, { perfil: 'x', guiones: [] }).errores[0]).toMatch(/al menos 1 elemento/)
    const tres = Array.from({ length: 3 }, () => ({ fecha: '2026-10-14', titulo: 'a', tipo: 'venta' }))
    expect(validaArgs(ESQ, { perfil: 'x', guiones: tres }).errores[0]).toMatch(/como mucho 2 por llamada; han llegado 3/)
  })

  it('un campo que no existe no para la llamada: se ignora y se avisa, con los que hay', () => {
    const { errores, avisos, args } = validaArgs(ESQ, { perfil: 'x', perfl: 'y' })
    expect(errores).toEqual([])
    expect(args).toEqual({ perfil: 'x' })
    expect(avisos[0]).toBe('argumentos: "perfl" no es un campo de esta herramienta y se ignora. Los que hay: perfil, limite, detalle, prueba, guiones.')
  })

  it('a una herramienta sin argumentos se le dice así', () => {
    expect(validaArgs({ type: 'object', properties: {} }, { x: 1 }).avisos[0]).toMatch(/No lleva ninguno: llámala sin argumentos\.$/)
  })

  it('arregla lo casi bien: números y booleanos como texto, un elemento suelto', () => {
    const r = validaArgs({ type: 'object', properties: { n: { type: 'integer' }, b: { type: 'boolean' }, urls: { type: 'array', items: { type: 'string' } } } },
      { n: '60', b: 'true', urls: 'https://x' })
    expect(r.errores).toEqual([])
    expect(r.args).toEqual({ n: 60, b: true, urls: ['https://x'] })
  })

  it('sin esquema de propiedades no se mete con nada', () => {
    expect(validaArgs({ type: 'object' }, { lo: 'que sea' }).errores).toEqual([])
    expect(validaArgs(undefined, undefined).errores).toEqual([])
  })

  it('explicaErrores junta todo en un texto', () => {
    expect(explicaErrores('calendario', ['a: x.', 'b: y.'])).toBe('Argumentos no válidos para "calendario":\n- a: x.\n- b: y.')
  })
})

describe('pagina', () => {
  const lista = Array.from({ length: 25 }, (_, i) => i)

  it('la primera página y el cursor de la siguiente', () => {
    expect(pagina(lista, { limite: 10 })).toEqual({ items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], total: 25, hay_mas: true, siguiente: 10 })
  })
  it('la última página no tiene siguiente', () => {
    const p = pagina(lista, { cursor: 20, limite: 10 })
    expect(p.items).toEqual([20, 21, 22, 23, 24])
    expect(p.hay_mas).toBe(false)
    expect(p.siguiente).toBeNull()
  })
  it('justo al borde no hay más', () => {
    expect(pagina(lista, { cursor: 15, limite: 10 }).hay_mas).toBe(false)
  })
  it('un cursor fuera de rango da una página vacía, sin romper', () => {
    expect(pagina(lista, { cursor: 99, limite: 10 })).toEqual({ items: [], total: 25, hay_mas: false, siguiente: null })
  })
  it('sin límite, todo', () => {
    expect(pagina(lista).items).toHaveLength(25)
    expect(pagina([], { limite: 5 })).toEqual({ items: [], total: 0, hay_mas: false, siguiente: null })
  })
})

describe('recorta y resumeArgs', () => {
  it('recorta por palabra entera y marca el corte', () => {
    expect(recorta('corto', 10)).toBe('corto')
    expect(recorta('una frase bastante larga para cortar', 20)).toBe('una frase bastante…')
    expect(recorta(null, 5)).toBe('')
  })
  it('resume los argumentos sin textos largos', () => {
    const r = resumeArgs({ perfil: 'hugo', guiones: [{ guion: 'x'.repeat(5000) }, {}], prueba: false, vacio: '', obj: { a: 1 } })
    expect(r).toBe('perfil: hugo · guiones: 2 · prueba: false · obj: {…}')
    expect(resumeArgs({ contenido: 'y'.repeat(300) }).length).toBeLessThan(60)
  })
})
