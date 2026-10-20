// Las comunidades — el acceso guardado en el navegador (datos.js · accesoDe):
// el de la llave de la comunidad o, si no hay, el de una llave antigua, que se
// pasa a la nueva. Así quien dejó sus datos en una versión anterior de AI para
// todo no repite la puerta. Sin navegador: localStorage simulado.
import { describe, it, expect, beforeEach } from 'vitest'

const almacen = new Map()
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => { almacen.set(k, String(v)) },
  removeItem: (k) => { almacen.delete(k) },
}
const { accesoDe } = await import('../src/pages/comunidad/datos.js')
const AIPT = (await import('../src/pages/aiparatodo/config.jsx')).default
const FILM = (await import('../src/pages/filmmakingparatodo/config.jsx')).default

beforeEach(() => almacen.clear())

describe('accesoDe', () => {
  it('sin nada guardado no hay acceso', () => {
    expect(accesoDe(AIPT)).toBeNull()
  })

  it('el de la llave actual manda', () => {
    almacen.set('s4sf.aiparatodo.v3', JSON.stringify({ pago: true }))
    almacen.set('s4sf.aiparatodo.v2', JSON.stringify({ id: 'x', nombre: 'Viejo' }))
    expect(accesoDe(AIPT)).toEqual({ pago: true })
  })

  it('quien dejó sus datos con v2 (o sin versión) entra y pasa a v3', () => {
    almacen.set('s4sf.aiparatodo.v2', JSON.stringify({ id: 'f', nombre: 'Eva' }))
    expect(accesoDe(AIPT)).toEqual({ id: 'f', nombre: 'Eva' })
    expect(JSON.parse(almacen.get('s4sf.aiparatodo.v3'))).toEqual({ id: 'f', nombre: 'Eva' })
    almacen.clear()
    almacen.set('s4sf.aiparatodo', JSON.stringify({ nombre: 'Luis' }))
    expect(accesoDe(AIPT)).toEqual({ nombre: 'Luis' })
  })

  it('lo roto o lo que no es un objeto no abre nada', () => {
    almacen.set('s4sf.aiparatodo.v2', '{roto')
    almacen.set('s4sf.aiparatodo', JSON.stringify('si'))
    expect(accesoDe(AIPT)).toBeNull()
  })

  it('las llaves de AI para todo no abren Filmmaking para todo', () => {
    almacen.set('s4sf.aiparatodo.v2', JSON.stringify({ nombre: 'Eva' }))
    almacen.set('s4sf.aiparatodo.v3', JSON.stringify({ nombre: 'Eva' }))
    expect(accesoDe(FILM)).toBeNull()
  })
})
