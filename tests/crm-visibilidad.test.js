// Quién ve qué pipeline. El nombre del miembro (como sale en Equipo) se
// empareja con el nombre del pipeline: «~Ortega» y «Ortega» son el mismo,
// «Alex» no es «Alex Abellaneda».
import { describe, it, expect } from 'vitest'
import {
  nucleoNombre, nombresCoinciden, pipelinesDelMiembro, veTodosLosPipelines,
  esAccesoTotal, clausulasDeAlcance, pipelinePermitido, nombrePermitido,
  anadeClausula, contactoEnTablero,
} from '../src/helm/crm/visibilidad.js'

const PIPES = [
  { id: 'pipe-ortega', name: 'Ortega', is_default: false },
  { id: 'pipe-alex', name: 'Alex Abellaneda', is_default: true },
  { id: 'pipe-aron', name: 'aron', is_default: false },
]

describe('nombre del pipeline', () => {
  it('quita adornos, mayúsculas, tildes y espacios, y no parte un nombre compuesto', () => {
    expect(nombresCoinciden('~Ortega', 'Ortega')).toBe(true)
    expect(nombresCoinciden('Ortega', 'Ortega')).toBe(true)
    expect(nombresCoinciden('  ~  ortega ', 'Ortega')).toBe(true)
    expect(nombresCoinciden('aron', 'aron')).toBe(true)
    expect(nombresCoinciden('ARON', 'aron')).toBe(true)
    expect(nombresCoinciden('Alex Abellaneda', 'Alex Abellaneda')).toBe(true)
    expect(nombresCoinciden('Álex Abelláneda', 'Alex Abellaneda')).toBe(true)
    expect(nombresCoinciden('Muñoz', 'Munoz')).toBe(true)
    expect(nucleoNombre('Alex-Abellaneda')).toBe('alex abellaneda')

    expect(nombresCoinciden('Alex', 'Alex Abellaneda')).toBe(false)
    expect(nombresCoinciden('Alex Abellaneda', 'Alex')).toBe(false)
    expect(nombresCoinciden('Ana', 'Mariana')).toBe(false)
    expect(nombresCoinciden('Ortega', 'aron')).toBe(false)
    expect(nombresCoinciden('', 'Ortega')).toBe(false)
    expect(nombresCoinciden('~', 'Ortega')).toBe(false)
  })

  it('devuelve solo los pipelines de esa persona, y los contactos sueltos si el suyo es el por defecto', () => {
    expect(pipelinesDelMiembro(['~Ortega', 'Ortega'], PIPES)).toEqual({
      ids: ['pipe-ortega'], incluyeSinPipeline: false,
    })
    expect(pipelinesDelMiembro('aron', PIPES).ids).toEqual(['pipe-aron'])
    expect(pipelinesDelMiembro('Alex Abellaneda', PIPES)).toEqual({
      ids: ['pipe-alex'], incluyeSinPipeline: true,
    })
    expect(pipelinesDelMiembro('Nadie', PIPES)).toEqual({ ids: [], incluyeSinPipeline: false })
    expect(pipelinePermitido(null, { ids: ['pipe-alex'], incluyeSinPipeline: true })).toBe(true)
    expect(pipelinePermitido(null, { ids: ['pipe-ortega'], incluyeSinPipeline: false })).toBe(false)
    expect(pipelinePermitido('pipe-ortega', { ids: ['pipe-ortega'], incluyeSinPipeline: false })).toBe(true)
    expect(nombrePermitido('~Ortega', ['~Ortega'])).toBe(true)
    expect(nombrePermitido('Alex Abellaneda', ['~Ortega'])).toBe(false)
  })
})

describe('quién no se recorta', () => {
  const setter = [{ name: '~Ortega', role: 'setter' }]

  it('propietario, administrador, dueño y quien no tiene ficha ven todos los pipelines', () => {
    expect(esAccesoTotal('admin,ceo,director')).toBe(true)
    expect(esAccesoTotal('admin')).toBe(true)
    expect(esAccesoTotal('member')).toBe(false)
    expect(veTodosLosPipelines({ nivel: 'admin,ceo,director', userId: 'u', role: 'client' }, setter)).toBe(true)
    expect(veTodosLosPipelines({ nivel: 'admin', userId: 'u', role: 'client' }, setter)).toBe(true)
    expect(veTodosLosPipelines({ nivel: 'member', userId: 'u', role: 'client', superadmin: true }, setter)).toBe(true)
    expect(veTodosLosPipelines({ nivel: 'member', userId: 'u', role: 'client' }, [{ role: 'dueno', name: 'Ana' }])).toBe(true)
    expect(veTodosLosPipelines({ nivel: 'member', userId: 'u', role: 'client' }, [])).toBe(true)
    expect(veTodosLosPipelines({ nivel: 'member', role: 'client' }, setter)).toBe(true)
    expect(veTodosLosPipelines({ nivel: 'member', userId: 'u', role: 'client' }, setter)).toBe(false)
  })

  it('el filtro de lectura se suma al que ya traiga la petición', () => {
    const propio = { ids: ['pipe-ortega'], incluyeSinPipeline: false }
    expect(clausulasDeAlcance('crm_contacts', propio)).toEqual([
      { columna: 'pipeline_id', valor: 'in.(pipe-ortega)' },
    ])
    expect(clausulasDeAlcance('crm_pipelines', propio)).toEqual([
      { columna: 'id', valor: 'in.(pipe-ortega)' },
    ])
    expect(clausulasDeAlcance('crm_activities', propio, ['c-ortega'])).toEqual([
      { columna: 'contact_id', valor: 'in.(c-ortega)' },
    ])
    expect(clausulasDeAlcance('crm_contacts', { ids: [], incluyeSinPipeline: false })[0].valor)
      .toBe('in.(00000000-0000-0000-0000-000000000000)')
    expect(clausulasDeAlcance('crm_contacts', { ids: ['pipe-alex'], incluyeSinPipeline: true })).toEqual([
      { and: '(or(pipeline_id.in.(pipe-alex),pipeline_id.is.null))' },
    ])
    expect(clausulasDeAlcance('sales', propio)).toEqual([])
  })

  it('un and que ya viniera en la petición no pisa el recorte', () => {
    const q = new URLSearchParams('and=(name.eq.Ana)&or=(id.not.is.null)')
    anadeClausula(q, { and: '(or(pipeline_id.in.(pipe-alex),pipeline_id.is.null))' })
    expect(q.get('and')).toBe('(name.eq.Ana,or(pipeline_id.in.(pipe-alex),pipeline_id.is.null))')
    expect(q.get('or')).toBe('(id.not.is.null)')
  })

  it('en el tablero de un miembro, el trato de otro pipeline no cae en el suyo', () => {
    const pipes = [
      { id: 'pipe-ortega', name: 'Ortega', isDefault: false },
    ]
    expect(contactoEnTablero({ pipeline_id: 'pipe-ortega' }, pipes, { soloSuyo: true })).toBe(true)
    expect(contactoEnTablero({ pipeline_id: 'pipe-alex' }, pipes, { soloSuyo: true })).toBe(false)
    expect(contactoEnTablero({ pipeline_id: null }, pipes, { soloSuyo: true })).toBe(false)
    expect(contactoEnTablero({ pipeline_id: 'pipe-alex' }, pipes, { soloSuyo: false })).toBe(true)
    const conDefecto = [{ id: 'pipe-alex', isDefault: true }]
    expect(contactoEnTablero({ pipeline_id: null }, conDefecto, { soloSuyo: true })).toBe(true)
  })
})
