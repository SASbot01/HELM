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

  it('el de la llave actual (v4) manda', () => {
    almacen.set('s4sf.aiparatodo.v4', JSON.stringify({ id: 'a', nombre: 'Ok' }))
    almacen.set('s4sf.aiparatodo.v3', JSON.stringify({ id: 'x', nombre: 'Viejo' }))
    expect(accesoDe(AIPT)).toEqual({ id: 'a', nombre: 'Ok' })
  })

  it('desde la aprobación (v4) las llaves antiguas YA NO abren: toda la audiencia vuelve a pedir acceso', () => {
    // Antes v2/v3/sin versión migraban a la nueva. Al activar la aprobación se
    // cortó (llavesAntiguas: []) para que todos pasen por la solicitud.
    almacen.set('s4sf.aiparatodo.v3', JSON.stringify({ pago: true }))
    almacen.set('s4sf.aiparatodo.v2', JSON.stringify({ id: 'f', nombre: 'Eva' }))
    almacen.set('s4sf.aiparatodo', JSON.stringify({ nombre: 'Luis' }))
    expect(accesoDe(AIPT)).toBeNull()
    expect(almacen.has('s4sf.aiparatodo.v4')).toBe(false)
  })

  it('la migración de llaves antiguas sigue viva para quien la use', () => {
    const cfg = { llave: 'x.new', llavesAntiguas: ['x.old'] }
    almacen.set('x.old', JSON.stringify({ id: 'f', nombre: 'Eva' }))
    expect(accesoDe(cfg)).toEqual({ id: 'f', nombre: 'Eva' })
    expect(JSON.parse(almacen.get('x.new'))).toEqual({ id: 'f', nombre: 'Eva' })
  })

  it('lo roto o lo que no es un objeto no abre nada', () => {
    almacen.set('s4sf.aiparatodo.v4', '{roto')
    expect(accesoDe(AIPT)).toBeNull()
  })

  it('las llaves de AI para todo no abren Filmmaking para todo', () => {
    almacen.set('s4sf.aiparatodo.v4', JSON.stringify({ nombre: 'Eva' }))
    expect(accesoDe(FILM)).toBeNull()
  })
})
