// El catálogo de agentes por departamentos (28-oct-2026): seis departamentos,
// cada uno con su frase, y cada agente con la suya y un estado que existe.
// Lo que aún no funciona se enseña con su frase, pero no se abre.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AGENTES, DEPARTAMENTOS, ESTADOS } from '../src/agents/agentes.js'
import { MenuDepartamentos, MenuAgentes } from '../src/agents/Piezas.jsx'

const de = (k) => AGENTES.filter(a => a.departamento === k)

describe('catálogo de agentes', () => {
  it('seis departamentos, con frase, y todos con agentes', () => {
    expect(DEPARTAMENTOS.map(d => d.key)).toEqual(['contenido', 'ventas', 'atencion', 'operaciones', 'finanzas', 'webs'])
    for (const d of DEPARTAMENTOS) {
      expect(d.resumen.length, d.key).toBeGreaterThan(40)
      expect(de(d.key).length, d.key).toBeGreaterThan(2)
    }
  })

  it('cada agente: clave única, frase de una línea, estado que existe y departamento que existe', () => {
    expect(new Set(AGENTES.map(a => a.key)).size).toBe(AGENTES.length)
    const deps = new Set(DEPARTAMENTOS.map(d => d.key))
    for (const a of AGENTES) {
      expect(ESTADOS[a.estado], a.key).toBeTruthy()
      expect(a.resumen.length, a.key).toBeGreaterThan(30)
      expect(a.resumen.length, a.key).toBeLessThan(170)
      if (a.departamento) expect(deps.has(a.departamento), a.key).toBe(true)
      // Lo que se abre tiene dónde ir.
      if (a.estado === 'activo' || a.abrible) expect(a.ruta, a.key).toBeTruthy()
    }
    expect(AGENTES.find(a => a.key === 'setter-ig')).toMatchObject({ estado: 'espera', abrible: true })
  })

  it('el recuadro enseña cada departamento con su frase y sus agentes', () => {
    const departamentos = DEPARTAMENTOS.map(d => ({ ...d, agentes: de(d.key) }))
    const html = renderToStaticMarkup(<MenuDepartamentos departamentos={departamentos} onAbrir={() => {}} />)
    for (const d of DEPARTAMENTOS) {
      expect(html).toContain(d.nombre)
      expect(html).toContain(d.resumen)
    }
    expect(html).toContain('Media buyer')
    expect(html).toContain('Cobrador')
  })

  it('dentro de un departamento, «Próximamente» se ve con su frase pero no se abre', () => {
    const html = renderToStaticMarkup(<MemoryRouter><MenuAgentes agentes={de('finanzas')} onAbrir={() => {}} /></MemoryRouter>)
    expect(html).toContain('Te avisa de cada cuota y renovación que toca')
    expect(html).toContain('Próximamente')
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain('<button')
    // El setter espera a Meta, pero se abre.
    const ventas = renderToStaticMarkup(<MemoryRouter><MenuAgentes agentes={de('ventas')} onAbrir={() => {}} /></MemoryRouter>)
    expect(ventas).toContain('Esperando a Meta')
    expect(ventas).toMatch(/<button[^>]*>[\s\S]*Setter de Instagram/)
  })
})
