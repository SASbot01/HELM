// Tests del agente de Ventas · prospector (api/_lib/departamentos/prospector.js).
//
// Prueba que redacta el primer mensaje de cada negocio prospectado (estado
// 'nuevo') con lo que se sabe (sin web, buenas reseñas…), como PROPUESTA con su
// WhatsApp: ni envíos masivos ni correo (LSSI). Que solo toca los 'nuevo' con
// teléfono, el tope de 5, el orden por reseñas y que no duplica.
import { describe, it, expect, vi } from 'vitest'
import agente from '../api/_lib/departamentos/prospector.js'

function fakeSupabase(tablas) {
  function from(tabla) {
    const filtros = []
    let orden = null, tope = null
    const filas = () => tablas[tabla] || []
    const elegidas = () => {
      let out = filas().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    const run = (uno) => Promise.resolve({ data: uno ? (elegidas()[0] || null) : elegidas(), error: null })
    const q = {
      select() { return q },
      eq(c, v) { filtros.push(r => r[c] === v); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      maybeSingle() { return run(true) },
      single() { return run(true) },
      then(res, rej) { return run(false).then(res, rej) },
    }
    return q
  }
  return { from }
}

function hazCtx({ tablas = {}, config = {} } = {}) {
  const propuestas = []
  const proponer = vi.fn(async (p) => {
    if (propuestas.some(x => x.clave === p.clave)) return null
    const fila = { id: `prop-${propuestas.length + 1}`, ...p }
    propuestas.push(fila)
    return fila
  })
  const ctx = {
    supabase: fakeSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'x', name: 'X' }, agenciaId: 'casa',
    hoy: new Date('2026-07-16T07:00:00Z'), config, autonomia: 'proponer',
    proponer, avisar: vi.fn(async () => 1), log: async () => {},
  }
  return { ctx, propuestas, proponer }
}

const prospecto = (extra = {}) => ({
  id: 'n1', client_id: 'c1', nombre: 'Peluquería Luz', direccion: 'Calle Mayor 1, Lorca',
  telefono: '968111222', telefonos_web: [], web: '', categoria: 'Peluquería',
  rating: 4.7, resenas: 80, estado: 'nuevo', extra: {}, created_at: '2026-07-10T10:00:00Z', ...extra,
})

describe('prospector', () => {
  it('propone el primer mensaje con WhatsApp y SIN herramienta (lo manda el dueño)', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: { helm_prospects: [prospecto()] } })
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(1)
    const p = propuestas[0]
    expect(p.clave).toBe('prospector:n1')
    expect(p.telefono).toBe('968111222')
    expect(p.mensaje.length).toBeGreaterThan(20)
    expect(p.herramienta).toBeUndefined() // LSSI: no se escribe nada, solo se propone
    expect(p.datos).toMatchObject({ prospectId: 'n1' })
  })

  it('sin web → ofrece web; con buenas reseñas → las menciona', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: { helm_prospects: [prospecto()] } })
    await agente.corre(ctx)
    expect(propuestas[0].mensaje).toContain('web')
    expect(propuestas[0].mensaje).toContain('reseñas')
    expect(propuestas[0].datos.angulo).toBe('sin_web')
  })

  it('solo los negocios en estado "nuevo" (no importados ni descartados)', async () => {
    const tablas = { helm_prospects: [
      prospecto({ id: 'a', estado: 'importado' }),
      prospecto({ id: 'b', estado: 'descartado' }),
      prospecto({ id: 'c', estado: 'nuevo' }),
    ] }
    const { ctx, propuestas } = hazCtx({ tablas })
    await agente.corre(ctx)
    expect(propuestas.map(p => p.datos.prospectId)).toEqual(['c'])
  })

  it('deja fuera a los que no tienen teléfono (sin WhatsApp no hay propuesta útil; nada de correo)', async () => {
    const tablas = { helm_prospects: [
      prospecto({ id: 'sin', telefono: '', telefonos_web: [] }),
      prospecto({ id: 'con', telefono: '600999888' }),
    ] }
    const { ctx, propuestas } = hazCtx({ tablas })
    await agente.corre(ctx)
    expect(propuestas.map(p => p.datos.prospectId)).toEqual(['con'])
  })

  it('usa el teléfono de la web si no hay teléfono de Maps', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: { helm_prospects: [prospecto({ telefono: '', telefonos_web: ['968333444'] })] } })
    await agente.corre(ctx)
    expect(propuestas[0].telefono).toBe('968333444')
  })

  it('respeta el tope de 5 por pasada y prioriza por reseñas', async () => {
    const lista = [
      prospecto({ id: 'a', rating: 3.0, resenas: 5 }),
      prospecto({ id: 'b', rating: 5.0, resenas: 300 }),
      prospecto({ id: 'c', rating: 4.5, resenas: 100 }),
      prospecto({ id: 'd', rating: 4.9, resenas: 200 }),
      prospecto({ id: 'e', rating: 4.0, resenas: 10 }),
      prospecto({ id: 'f', rating: 4.8, resenas: 150 }),
    ]
    const { ctx, propuestas, proponer } = hazCtx({ tablas: { helm_prospects: lista } })
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(5)
    expect(proponer).toHaveBeenCalledTimes(5)
    // El peor valorado (a) se queda fuera; b es el primero.
    const ids = propuestas.map(p => p.datos.prospectId)
    expect(ids).not.toContain('a')
    expect(ids[0]).toBe('b')
  })

  it('no duplica entre pasadas (clave estable por negocio)', async () => {
    const tablas = { helm_prospects: [prospecto()] }
    const { ctx, propuestas } = hazCtx({ tablas })
    await agente.corre(ctx)
    const r2 = await agente.corre(ctx)
    expect(r2.propuestas).toBe(0)
    expect(propuestas).toHaveLength(1)
  })
})

describe('prospector · quién firma el mensaje', () => {
  it('firma con el remitente de su configuración o, si no, con el nombre del perfil; nunca «[tu nombre]»', async () => {
    const sinConfig = hazCtx({ tablas: { helm_prospects: [prospecto()] } })
    await agente.corre(sinConfig.ctx)
    expect(sinConfig.propuestas[0].mensaje).toMatch(/^Hola, soy X\./)
    const conRemitente = hazCtx({ tablas: { helm_prospects: [prospecto()] }, config: { remitente: 'Alex, de Ocean' } })
    await agente.corre(conRemitente.ctx)
    expect(conRemitente.propuestas[0].mensaje).toMatch(/^Hola, soy Alex, de Ocean\./)
    for (const p of [...sinConfig.propuestas, ...conRemitente.propuestas]) expect(p.mensaje).not.toContain('[')
  })
})
