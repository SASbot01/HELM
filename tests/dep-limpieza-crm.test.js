// Operaciones · limpieza del CRM (api/_lib/departamentos/limpieza-crm.js).
// Probar: que agrupa duplicados por email y por teléfono (E.164 español), que
// la clave de la propuesta es estable (por el conjunto de ids, no por el orden
// de las filas), el tope de 10, y que las fichas sin etapa/dueño salen como
// tarea interna (autonomía 'interno') o como propuesta con crm_tarea.
import { describe, it, expect, vi } from 'vitest'
import limpieza, { gruposDuplicados, propuestaDuplicados, normTel, elegirConservar } from '../api/_lib/departamentos/limpieza-crm.js'

// Base simulada: devuelve los contactos del store al leer crm_contacts y apunta
// las inserciones/lecturas de crm_tasks.
function fakeSupabase({ contactos = [], tareas = [] } = {}) {
  const escrito = []
  const store = {
    crm_contacts: contactos.map((r) => ({ client_id: 'c1', ...r })),
    crm_tasks: tareas.map((r) => ({ client_id: 'c1', ...r })),
  }
  const api = {
    escrito,
    from(tabla) {
      const filtros = []
      const q = {
        select() { return q },
        limit() { return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        insert(fila) { escrito.push({ tabla, fila }); if (store[tabla]) store[tabla].push(fila); return Promise.resolve({ data: null, error: null }) },
        then(res, rej) {
          const out = (store[tabla] || []).filter((r) => filtros.every((f) => f(r)))
          return Promise.resolve({ data: out, error: null }).then(res, rej)
        },
      }
      return q
    },
  }
  return api
}

const ctxDe = (supabase, { autonomia = 'proponer' } = {}) => {
  const proponer = vi.fn(async (p) => ({ id: `prop-${p.clave}`, ...p }))
  return { ctx: { supabase, clientId: 'c1', autonomia, proponer, log: () => {} }, proponer }
}

describe('gruposDuplicados · por qué señal', () => {
  it('agrupa por email normalizado', () => {
    const cs = [
      { id: 'a', name: 'Ana', email: 'Ana@Mail.com ' },
      { id: 'b', name: 'Ana López', email: 'ana@mail.com' },
      { id: 'c', name: 'Otro', email: 'otro@mail.com' },
    ]
    const g = gruposDuplicados(cs)
    expect(g).toHaveLength(1)
    expect(g[0].map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('agrupa por teléfono aunque esté escrito distinto (E.164 español)', () => {
    expect(normTel('600 11 22 33')).toBe('34600112233')
    expect(normTel('+34 600112233')).toBe('34600112233')
    expect(normTel('0034600112233')).toBe('34600112233')
    const cs = [
      { id: 'a', name: 'Juan', phone: '600 11 22 33' },
      { id: 'b', name: 'Juan P', phone: '+34 600112233' },
      { id: 'c', name: 'Sola', phone: '611000000' },
    ]
    const g = gruposDuplicados(cs)
    expect(g).toHaveLength(1)
    expect(g[0].map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('conserva la ficha más completa y, a igualdad, la más antigua', () => {
    const grupo = [
      { id: 'a', name: 'Ana', email: 'a@x.com', created_at: '2026-01-10' },
      { id: 'b', name: 'Ana', email: 'a@x.com', phone: '600112233', company: 'ACME', created_at: '2026-02-01' },
    ]
    expect(elegirConservar(grupo).id).toBe('b') // más completa
    const empate = [
      { id: 'x', name: 'Ana', email: 'a@x.com', created_at: '2026-03-01' },
      { id: 'y', name: 'Ana', email: 'a@x.com', created_at: '2026-01-01' },
    ]
    expect(elegirConservar(empate).id).toBe('y') // más antigua
  })
})

describe('propuestaDuplicados · clave estable y porqué', () => {
  it('la clave no depende del orden de las filas', () => {
    const g1 = [{ id: 'b', email: 'a@x.com' }, { id: 'a', email: 'a@x.com' }]
    const g2 = [{ id: 'a', email: 'a@x.com' }, { id: 'b', email: 'a@x.com' }]
    expect(propuestaDuplicados(g1).clave).toBe(propuestaDuplicados(g2).clave)
    expect(propuestaDuplicados(g1).clave).toBe('limpieza-crm:dup:a+b')
  })

  it('el porqué nombra la señal y dice que se hace a mano', () => {
    const p = propuestaDuplicados([
      { id: 'a', name: 'Ana', email: 'ana@x.com', created_at: '2026-01-02' },
      { id: 'b', name: 'Ana', email: 'ana@x.com', created_at: '2026-05-02' },
    ])
    expect(p.titulo).toContain('2 fichas duplicadas: Ana')
    expect(p.porque).toContain('el email ana@x.com')
    expect(p.porque).toMatch(/no fusiona|a mano|ábrelas/i)
  })
})

describe('corre · propone duplicados y limpia fichas a medias', () => {
  it('una propuesta por grupo (sin herramienta) y respeta el tope de 10', async () => {
    // 12 parejas de duplicados por email → solo 10 propuestas.
    const contactos = []
    for (let i = 0; i < 12; i++) {
      contactos.push({ id: `a${i}`, name: `P${i}`, email: `p${i}@x.com`, status: 'lead', assigned_closer: 'Juan', created_at: '2026-01-01' })
      contactos.push({ id: `b${i}`, name: `P${i}`, email: `p${i}@x.com`, status: 'lead', assigned_closer: 'Juan', created_at: '2026-02-01' })
    }
    const { ctx, proponer } = ctxDe(fakeSupabase({ contactos }))
    const r = await limpieza.corre(ctx)
    expect(proponer).toHaveBeenCalledTimes(10)
    expect(proponer.mock.calls.every(([p]) => !p.herramienta)).toBe(true)
    expect(r.propuestas).toBe(10)
  })

  it('fichas sin etapa o sin dueño: en interno crea una tarea; si no, la propone con crm_tarea', async () => {
    const contactos = [
      { id: '1', name: 'Con todo', email: 'c@x.com', status: 'lead', assigned_closer: 'Juan', created_at: '2026-01-01' },
      { id: '2', name: 'Sin etapa', email: 's@x.com', status: '', assigned_setter: 'Ana', created_at: '2026-01-01' },
      { id: '3', name: 'Sin dueño', email: 'd@x.com', status: 'lead', created_at: '2026-01-01' },
    ]
    // Autonomía 'interno' → inserta en crm_tasks, sin proponer.
    const sb = fakeSupabase({ contactos })
    const { ctx, proponer } = ctxDe(sb, { autonomia: 'interno' })
    const r = await limpieza.corre(ctx)
    expect(proponer).not.toHaveBeenCalled()
    const tarea = sb.escrito.find((w) => w.tabla === 'crm_tasks')
    expect(tarea).toBeTruthy()
    expect(tarea.fila.title).toBe('Revisar fichas del CRM sin etapa o sin dueño')
    expect(tarea.fila.description).toContain('1 sin etapa y 1 sin responsable')
    expect(r.resumen).toContain('tarea de fichas sin etapa/dueño')

    // Autonomía por defecto → propuesta con la herramienta crm_tarea.
    const { ctx: ctx2, proponer: prop2 } = ctxDe(fakeSupabase({ contactos }))
    await limpieza.corre(ctx2)
    const conTarea = prop2.mock.calls.map(([p]) => p).find((p) => p.herramienta === 'crm_tarea')
    expect(conTarea).toBeTruthy()
    expect(conTarea.input.titulo).toBe('Revisar fichas del CRM sin etapa o sin dueño')
  })

  it('no crea la tarea interna dos veces si ya hay una abierta igual', async () => {
    const contactos = [{ id: '3', name: 'Sin dueño', email: 'd@x.com', status: 'lead', created_at: '2026-01-01' }]
    const tareas = [{ client_id: 'c1', title: 'Revisar fichas del CRM sin etapa o sin dueño', completed: false }]
    const sb = fakeSupabase({ contactos, tareas })
    const { ctx } = ctxDe(sb, { autonomia: 'interno' })
    const r = await limpieza.corre(ctx)
    expect(sb.escrito.some((w) => w.tabla === 'crm_tasks')).toBe(false)
    expect(r.resumen).toBe('')
  })
})
