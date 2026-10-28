// El estilo del Editor de reels (src/agents/editor/estilo.js): los parámetros
// de los recursos que sube el usuario (cómo entran las imágenes y clips, cuánto
// duran, la música y el logo) con sus valores por defecto, sus topes y lo que
// pasa con un valor raro o con un estilo guardado de antes, que no los traía.
import { describe, it, expect } from 'vitest'

const {
  normalizaEstilo, ESTILO_POR_DEFECTO, RANGOS_ESTILO, MODOS_RECURSOS, POSICIONES_LOGO,
} = await import('../src/agents/editor/estilo.js')

describe('estilo: recursos, música y logo', () => {
  it('los valores por defecto', () => {
    expect(ESTILO_POR_DEFECTO).toMatchObject({ recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.12, logoPosicion: 'arriba-der' })
    expect(normalizaEstilo({})).toMatchObject({ recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.12, logoPosicion: 'arriba-der' })
    expect(Object.keys(MODOS_RECURSOS)).toEqual(['corte', 'arriba'])
    expect(Object.keys(POSICIONES_LOGO)).toEqual(['arriba-izq', 'arriba-der', 'abajo-izq', 'abajo-der', 'ninguna'])
    expect(RANGOS_ESTILO.recursoDuracion).toMatchObject({ min: 1.5, max: 5 })
    expect(RANGOS_ESTILO.musicaVolumen).toMatchObject({ min: 0, max: 0.5 })
  })

  it('lo válido se queda; lo que se sale, al tope; lo que no es una opción, el de la base', () => {
    expect(normalizaEstilo({ recursosModo: 'arriba', recursoDuracion: 4, musicaVolumen: 0.3, logoPosicion: 'ninguna' }))
      .toMatchObject({ recursosModo: 'arriba', recursoDuracion: 4, musicaVolumen: 0.3, logoPosicion: 'ninguna' })
    expect(normalizaEstilo({ recursoDuracion: 0.2, musicaVolumen: 3 })).toMatchObject({ recursoDuracion: 1.5, musicaVolumen: 0.5 })
    expect(normalizaEstilo({ recursoDuracion: 99, musicaVolumen: -1 })).toMatchObject({ recursoDuracion: 5, musicaVolumen: 0 })
    // Al paso del deslizador (medio segundo), y los textos de un formulario valen.
    expect(normalizaEstilo({ recursoDuracion: '3.2', musicaVolumen: '0.123' })).toMatchObject({ recursoDuracion: 3, musicaVolumen: 0.12 })
    expect(normalizaEstilo({ recursosModo: 'lado', logoPosicion: 'centro' })).toMatchObject({ recursosModo: 'corte', logoPosicion: 'arriba-der' })
    expect(normalizaEstilo({ recursosModo: 'toString', logoPosicion: '__proto__' })).toMatchObject({ recursosModo: 'corte', logoPosicion: 'arriba-der' })
    expect(normalizaEstilo({ recursosModo: 3, musicaVolumen: 'mucho' })).toMatchObject({ recursosModo: 'corte', musicaVolumen: 0.12 })
  })

  it('un estilo guardado antes de los recursos sale con los de HELM; uno del perfil manda sobre la base', () => {
    const viejo = { ...ESTILO_POR_DEFECTO }
    delete viejo.recursosModo; delete viejo.recursoDuracion; delete viejo.musicaVolumen; delete viejo.logoPosicion
    expect(normalizaEstilo(viejo)).toEqual(normalizaEstilo(ESTILO_POR_DEFECTO))
    const base = { recursosModo: 'arriba', logoPosicion: 'abajo-izq', musicaVolumen: 0.2 }
    expect(normalizaEstilo({}, base)).toMatchObject(base)
    expect(normalizaEstilo({ logoPosicion: 'arriba-izq' }, base)).toMatchObject({ recursosModo: 'arriba', logoPosicion: 'arriba-izq' })
  })

  it('normalizar dos veces da lo mismo', () => {
    const una = normalizaEstilo({ recursosModo: 'arriba', recursoDuracion: 2.7, musicaVolumen: 0.07, logoPosicion: 'abajo-der' })
    expect(normalizaEstilo(una)).toEqual(una)
  })
})
