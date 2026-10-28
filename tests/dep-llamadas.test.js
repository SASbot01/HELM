// Tests del agente de Ventas · llamadas (api/_lib/departamentos/llamadas.js).
//
// Prueba el parte de las llamadas de HOY por Telegram (ctx.avisar) con la ficha
// de cada una (formulario, por dónde llegó, historial, setter, objeciones) y la
// propuesta de «apunta el resultado» de las pasadas sin cerrar. Base en memoria
// y un `proponer`/`avisar` simulados; fechas en Europe/Madrid.
import { describe, it, expect, vi } from 'vitest'
import agente from '../api/_lib/departamentos/llamadas.js'

const DIA = 86_400_000

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
      neq(c, v) { filtros.push(r => r[c] !== v); return q },
      in(c, vs) { filtros.push(r => vs.includes(r[c])); return q },
      is(c, v) { filtros.push(r => (r[c] ?? null) === v); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      lt(c, v) { filtros.push(r => r[c] < v); return q },
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

function hazCtx({ tablas = {}, config = {}, hoy = new Date('2026-07-16T07:00:00Z') } = {}) {
  const propuestas = []
  const proponer = vi.fn(async (p) => {
    if (propuestas.some(x => x.clave === p.clave)) return null
    const fila = { id: `prop-${propuestas.length + 1}`, ...p }
    propuestas.push(fila)
    return fila
  })
  const avisos = []
  const avisar = vi.fn(async (t) => { avisos.push(t); return 1 })
  const ctx = {
    supabase: fakeSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'x', name: 'X' }, agenciaId: 'casa',
    hoy, config, autonomia: 'proponer', proponer, avisar, log: async () => {},
  }
  return { ctx, propuestas, proponer, avisar, avisos }
}

const llamada = (extra = {}) => ({ id: 'll1', client_id: 'c1', title: 'Llamada', starts_at: '2026-07-16T10:00:00Z', status: 'agendada', outcome: null, contact_id: 'k1', ...extra })

describe('llamadas · parte de hoy', () => {
  it('manda un parte con la ficha: hora, formulario, por dónde llegó, historial, setter y objeciones', async () => {
    const tablas = {
      helm_calls: [llamada()],
      crm_contacts: [{ id: 'k1', client_id: 'c1', name: 'Ana Pérez', deal_value: 1200, source: 'Instagram', utm_content: 'reel-apis' }],
      helm_form_responses: [{ client_id: 'c1', contact_id: 'k1', answers: { objetivo: 'Captar clientes' }, submitted_at: '2026-07-10T10:00:00Z' }],
      crm_activities: [{ client_id: 'c1', contact_id: 'k1', type: 'note', title: 'Primer contacto', performed_at: '2026-07-12T10:00:00Z' }],
      helm_ig_conversaciones: [{ id: 'cv1', client_id: 'c1', contact_id: 'k1' }],
      helm_ig_mensajes: [
        { conversacion_id: 'cv1', client_id: 'c1', autor: 'lead', texto: '¿Cuánto cuesta?', created_at: '2026-07-11T10:00:00Z' },
        { conversacion_id: 'cv1', client_id: 'c1', autor: 'ia', texto: 'Te lo cuento en la llamada', created_at: '2026-07-11T10:01:00Z' },
      ],
    }
    const { ctx, avisos } = hazCtx({ tablas })
    const r = await agente.corre(ctx)
    expect(avisos).toHaveLength(1)
    const parte = avisos[0]
    expect(parte).toContain('Llamadas de hoy (2026-07-16)')
    expect(parte).toContain('12:00 · Ana Pérez') // 10:00 UTC = 12:00 Madrid (verano)
    expect(parte).toContain('reel-apis')
    expect(parte).toContain('Captar clientes')
    expect(parte).toContain('Primer contacto')
    expect(parte).toContain('¿Cuánto cuesta?')
    expect(parte).toContain('Objeciones probables')
    expect(r.resumen).toContain('1 llamada')
  })

  it('no manda parte si hoy no hay llamadas', async () => {
    const tablas = { helm_calls: [llamada({ starts_at: '2026-07-10T10:00:00Z', status: 'hecha', outcome: 'cerrada' })] }
    const { ctx, avisar } = hazCtx({ tablas })
    await agente.corre(ctx)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('una llamada a las 23:30 UTC entra en el parte del día siguiente (Europe/Madrid)', async () => {
    // hoy = 17 de julio; la llamada es 16T23:30 UTC = 17T01:30 Madrid → es de hoy.
    const tablas = { helm_calls: [llamada({ starts_at: '2026-07-16T23:30:00Z', contact_id: null, title: 'Tardía' })] }
    const { ctx, avisos } = hazCtx({ tablas, hoy: new Date('2026-07-17T07:00:00Z') })
    await agente.corre(ctx)
    expect(avisos[0]).toContain('01:30 · Tardía')
  })
})

describe('llamadas · apuntar el resultado', () => {
  it('propone apuntar el resultado de una llamada pasada sin outcome, con crm_nota', async () => {
    const tablas = {
      helm_calls: [llamada({ id: 'p1', starts_at: '2026-07-14T10:00:00Z', status: 'agendada', outcome: null })],
      crm_contacts: [{ id: 'k1', client_id: 'c1', name: 'Ana Pérez' }],
    }
    const { ctx, propuestas } = hazCtx({ tablas })
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(1)
    const p = propuestas[0]
    expect(p.clave).toBe('llamadas:resultado:p1')
    expect(p.titulo).toContain('Ana Pérez')
    expect(p.herramienta).toBe('crm_nota')
    expect(p.input).toMatchObject({ contacto: 'k1' })
    expect(p.mensaje).toBeUndefined() // apuntar resultado no es un mensaje al cliente
  })

  it('no propone si la llamada ya tiene resultado, está cancelada o es futura', async () => {
    const tablas = {
      helm_calls: [
        llamada({ id: 'a', starts_at: '2026-07-14T10:00:00Z', outcome: 'Cerrada' }),
        llamada({ id: 'b', starts_at: '2026-07-14T10:00:00Z', status: 'cancelada' }),
        llamada({ id: 'c', starts_at: '2026-07-20T10:00:00Z', status: 'agendada' }),
      ],
      crm_contacts: [{ id: 'k1', client_id: 'c1', name: 'Ana' }],
    }
    const { ctx, proponer } = hazCtx({ tablas })
    await agente.corre(ctx)
    expect(proponer).not.toHaveBeenCalled()
  })

  it('no propone apuntar el resultado si la llamada no tiene ficha en el CRM', async () => {
    const tablas = { helm_calls: [llamada({ id: 'p1', starts_at: '2026-07-14T10:00:00Z', contact_id: null })] }
    const { ctx, proponer } = hazCtx({ tablas })
    await agente.corre(ctx)
    expect(proponer).not.toHaveBeenCalled()
  })

  it('respeta el tope y no duplica entre pasadas', async () => {
    const calls = [0, 1, 2].map(i => llamada({ id: `p${i}`, starts_at: '2026-07-14T10:00:00Z', contact_id: `k${i}` }))
    const contacts = [0, 1, 2].map(i => ({ id: `k${i}`, client_id: 'c1', name: `C${i}` }))
    const { ctx, propuestas } = hazCtx({ tablas: { helm_calls: calls, crm_contacts: contacts }, config: { maximo: 2 } })
    const r1 = await agente.corre(ctx)
    expect(r1.propuestas).toBe(2)
    const r2 = await agente.corre(ctx) // mismas claves → nada nuevo
    expect(r2.propuestas).toBe(0)
    expect(propuestas).toHaveLength(2)
  })
})
