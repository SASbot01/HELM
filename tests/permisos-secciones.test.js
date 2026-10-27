// Qué secciones nacen encendidas (src/helm/permisos.js). El Informe de
// contenido sale ya en todos los perfiles (y el editor lo ve de serie); el
// Avatar no tiene entrada en el menú, pero sí su clave en Permisos, porque no
// lo ve cualquiera que vea el Informe; y Noticias no promete una pasada diaria.
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/helm/lib', () => ({ supabase: {} }))
const { SECCIONES, SECCIONES_SECTOR, DEFAULT_VISIBLE, seccionEncendida, esOptIn, puedeVer } = await import('../src/helm/permisos.js')

describe('permisos · secciones', () => {
  it('el Informe de contenido nace encendido y se puede apagar', () => {
    expect(SECCIONES_SECTOR).not.toContain('metricas')
    expect(esOptIn('metricas')).toBe(false)
    expect(seccionEncendida({}, 'metricas')).toBe(true)
    expect(seccionEncendida({ metricas: true }, 'metricas')).toBe(true)   // quien ya lo había encendido
    expect(seccionEncendida({ metricas: false }, 'metricas')).toBe(false)
  })

  it('Fiscal y Noticias siguen naciendo apagadas', () => {
    expect(seccionEncendida({}, 'fiscal')).toBe(false)
    expect(seccionEncendida({}, 'noticias')).toBe(false)
  })

  it('el Avatar sigue en Permisos, detrás del Informe, como sección normal', () => {
    const claves = SECCIONES.map(s => s.key)
    expect(claves.indexOf('avatar')).toBe(claves.indexOf('informe') + 1)
    expect(claves).toContain('metricas')
    expect(esOptIn('avatar')).toBe(false)
    expect(seccionEncendida({}, 'avatar')).toBe(true)
    expect(seccionEncendida({ avatar: false }, 'avatar')).toBe(false)   // quien lo apagó cuando tenía menú
  })

  it('el Avatar no viene de serie con ningún rol: lo ven quien manda y a quien se le marque', () => {
    for (const lista of Object.values(DEFAULT_VISIBLE)) expect(lista).not.toContain('avatar')
    expect(puedeVer(DEFAULT_VISIBLE, 'closer', 'avatar')).toBe(false)
    expect(puedeVer({ closer: ['informe'] }, 'closer', 'avatar')).toBe(false)
    expect(puedeVer({ closer: ['informe', 'avatar'] }, 'closer', 'avatar')).toBe(true)
    expect(puedeVer(DEFAULT_VISIBLE, 'closer', 'avatar', 'admin')).toBe(true)
    expect(puedeVer(DEFAULT_VISIBLE, 'dueno', 'avatar')).toBe(true)
    expect(puedeVer(DEFAULT_VISIBLE, null, 'avatar')).toBe(true)
  })

  it('el editor ve de serie el Informe de contenido de lo que ejecuta', () => {
    expect(DEFAULT_VISIBLE.editor).toContain('metricas')
    expect(puedeVer(DEFAULT_VISIBLE, 'editor', 'metricas')).toBe(true)
  })

  it('Noticias no promete una pasada diaria, y dice que se puede buscar a mano', () => {
    const desc = SECCIONES.find(s => s.key === 'noticias').desc
    expect(desc).toBe('Las tres noticias del día de los temas del perfil; también cuando quieras con «Buscar ahora»')
    expect(desc).not.toMatch(/cada mañana|6:00/)
  })
})
