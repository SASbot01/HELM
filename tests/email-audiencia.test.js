// Email marketing · a quién le llega una campaña (api/_lib/email/audiencia.js):
// cualquier pipeline del perfil (el de por defecto se lleva también a los
// contactos sin pipeline o de uno borrado, como el tablero del CRM), las etapas
// leídas como en el CRM («won» es «Ganado»), solo correos válidos, uno por
// correo en minúsculas, sin las bajas del perfil, y TODO el CRM aunque pase de
// las 1000 filas que corta PostgREST. Base en memoria.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const base = vi.hoisted(() => ({ b: null }))
vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase } = await import('./ayudas/base-memoria.js')
  base.b = crearBase({})
  return { supabase: base.b.supabase }
})

const { construirAudiencia, limpiaEmail, leeAudiencia, MAX_DESTINATARIOS } = await import('../api/_lib/email/audiencia.js')

const P = 'c0000000-0000-4000-8000-000000000001'
const OTRO = 'c0000000-0000-4000-8000-000000000002'
const VENTAS = 'b0000000-0000-4000-8000-000000000001'
const SOCIOS = 'b0000000-0000-4000-8000-000000000002'
const t = () => base.b.tablas
let n = 0
const contacto = (c) => ({ id: `a0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, client_id: P, pipeline_id: null, status: 'lead', ...c })

beforeEach(() => {
  base.b.vaciar()
  n = 0
  t().crm_pipelines = [
    { id: VENTAS, client_id: P, name: 'Ventas', is_default: true, created_at: '2026-01-01', stages: [{ key: 'lead', label: 'Lead' }, { key: 'ganado', label: 'Ganado' }, { key: 'perdido', label: 'Perdido' }] },
    { id: SOCIOS, client_id: P, name: 'Socios', is_default: false, created_at: '2026-02-01', stages: [{ key: 'entrada', label: 'Entrada' }, { key: 'cerrado', label: 'Cerrado' }] },
  ]
})

describe('audiencia', () => {
  it('el de por defecto: con pipeline, sin pipeline y de uno borrado; nada de otros pipelines ni de otros perfiles', async () => {
    t().crm_contacts = [
      contacto({ name: 'Ana', email: 'ana@x.es', pipeline_id: VENTAS }),
      contacto({ name: 'Bea', email: 'bea@x.es', pipeline_id: null }),
      contacto({ name: 'Cris', email: 'cris@x.es', pipeline_id: 'b0000000-0000-4000-8000-0000000000ff' }),
      contacto({ name: 'Dani', email: 'dani@x.es', pipeline_id: SOCIOS }),
      contacto({ name: 'Eva', email: 'eva@x.es', client_id: OTRO }),
    ]
    const a = await construirAudiencia(P, { pipelineId: VENTAS, etapas: [] })
    expect(a.contactos.map(c => c.email)).toEqual(['ana@x.es', 'bea@x.es', 'cris@x.es'])
    expect(a.total).toBe(3)
    expect(a.descripcion).toBe('Ventas · todas las etapas')
    const s = await construirAudiencia(P, { pipelineId: SOCIOS, etapas: [] })
    expect(s.contactos.map(c => c.email)).toEqual(['dani@x.es'])
  })

  it('las etapas se leen como en el CRM (los alias en inglés cuentan)', async () => {
    t().crm_contacts = [
      contacto({ email: 'a@x.es', status: 'ganado' }),
      contacto({ email: 'b@x.es', status: 'won' }),
      contacto({ email: 'c@x.es', status: 'lead' }),
      contacto({ email: 'd@x.es', status: 'perdido' }),
      contacto({ email: 'e@x.es', status: 'etapa-borrada' }),   // cae en la primera, como en el tablero
    ]
    const a = await construirAudiencia(P, { pipelineId: VENTAS, etapas: ['ganado'] })
    expect(a.contactos.map(c => c.email)).toEqual(['a@x.es', 'b@x.es'])
    expect(a.descripcion).toBe('Ventas · Ganado')
    const b = await construirAudiencia(P, { pipelineId: VENTAS, etapas: ['lead', 'perdido'] })
    expect(b.contactos.map(c => c.email)).toEqual(['c@x.es', 'd@x.es', 'e@x.es'])
  })

  it('uno por correo (en minúsculas), sin los mal escritos, sin los vacíos y sin las bajas, y lo cuenta', async () => {
    t().crm_contacts = [
      contacto({ name: 'Ana', email: ' Ana@X.es ' }),
      contacto({ name: 'Ana otra vez', email: 'ana@x.es' }),
      contacto({ email: 'sin-arroba.es' }),
      contacto({ email: 'a@b' }),
      contacto({ email: '' }),
      contacto({ email: null }),
      contacto({ email: 'baja@x.es' }),
      contacto({ email: 'BAJA2@x.es' }),
    ]
    t().helm_email_bajas = [{ client_id: P, email: 'baja@x.es' }, { client_id: P, email: 'baja2@x.es' }, { client_id: OTRO, email: 'ana@x.es' }]
    const a = await construirAudiencia(P, { pipelineId: VENTAS, etapas: [] })
    expect(a.contactos).toEqual([expect.objectContaining({ email: 'ana@x.es', nombre: 'Ana' })])
    expect(a).toMatchObject({ total: 1, duplicados: 1, invalidos: 2, sinEmail: 2, deBaja: 2, excedido: false })
    expect(a.muestra).toEqual([{ nombre: 'Ana', email: 'ana@x.es' }])
  })

  it('lee el CRM entero por páginas (2.500 contactos) y las bajas también (1.200)', async () => {
    t().crm_contacts = Array.from({ length: 2500 }, (_, i) => contacto({ email: `p${i}@x.es` }))
    t().helm_email_bajas = Array.from({ length: 1200 }, (_, i) => ({ client_id: P, email: `p${i}@x.es` }))
    const a = await construirAudiencia(P, { pipelineId: VENTAS, etapas: [] })
    expect(a.total).toBe(1300)
    expect(a.deBaja).toBe(1200)
    expect(a.contactos[0].email).toBe('p1200@x.es')
    expect(a.contactos.at(-1).email).toBe('p2499@x.es')
    const paginas = base.b.ops.filter(o => o.tabla === 'crm_contacts').length
    expect(paginas).toBe(3)
  })

  it('el tope por campaña: se cuenta todo, pero se dice que se pasa', async () => {
    t().crm_contacts = Array.from({ length: 30 }, (_, i) => contacto({ email: `p${i}@x.es` }))
    const a = await construirAudiencia(P, { pipelineId: VENTAS, etapas: [] }, { tope: 10 })
    expect(a).toMatchObject({ total: 30, excedido: true, tope: 10 })
    expect(a.contactos).toHaveLength(10)
    expect(MAX_DESTINATARIOS).toBe(5000)
  })

  it('un pipeline o una etapa que no existen son un error que se entiende', async () => {
    await expect(construirAudiencia(P, { pipelineId: 'b0000000-0000-4000-8000-0000000000aa' })).rejects.toMatchObject({ statusCode: 400 })
    expect(() => leeAudiencia({ pipelineId: SOCIOS, etapas: ['ganado'] }, [{ id: SOCIOS, name: 'Socios', stages: [{ key: 'entrada' }] }])).toThrow(/no están en «Socios»: ganado/)
  })

  it('sin pipelines guardados, el virtual del CRM (id vacío) vale', async () => {
    t().crm_pipelines = []
    t().crm_contacts = [contacto({ email: 'a@x.es', status: 'won' })]
    const a = await construirAudiencia(P, { pipelineId: null, etapas: ['ganado'] })
    expect(a.contactos.map(c => c.email)).toEqual(['a@x.es'])
  })

  it('limpiaEmail', () => {
    expect(limpiaEmail(' Ana.Lopez+news@Mi-Dominio.ES ')).toBe('ana.lopez+news@mi-dominio.es')
    for (const malo of ['a@b', 'a..b@x.es', '.a@x.es', 'a.@x.es', 'a b@x.es', '<a@x.es>', 'a@x.es\nbcc:b@y.es', `${'a'.repeat(250)}@x.es`]) expect(limpiaEmail(malo)).toBeNull()
  })
})
