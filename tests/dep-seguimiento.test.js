// Tests del agente de Ventas · seguimiento (api/_lib/departamentos/seguimiento.js).
//
// El agente solo usa `ctx` (supabase, proponer, avisar, log…), así que no hace
// falta mockear módulos: se le pasa un ctx con una base en memoria y un
// `proponer` que deduplica por clave como el de verdad. Se prueba qué detecta
// (frío, no-show, formulario sin contestar), que respeta los cierres, el tope,
// que no duplica (claves estables) y que las fechas van en Europe/Madrid.
import { describe, it, expect, vi } from 'vitest'
import agente from '../api/_lib/departamentos/seguimiento.js'

const DIA = 86_400_000

// Una base en memoria con lo justo que lee el agente.
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
      not(c, _op, v) { filtros.push(r => (r[c] ?? null) !== (v ?? null)); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      gt(c, v) { filtros.push(r => r[c] > v); return q },
      lte(c, v) { filtros.push(r => r[c] <= v); return q },
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

function hazCtx({ tablas = {}, config = {}, hoy = new Date('2026-07-16T09:00:00Z'), autonomia = 'proponer' } = {}) {
  const propuestas = []
  const proponer = vi.fn(async (p) => {
    if (propuestas.some(x => x.clave === p.clave)) return null // dedup por clave, como el real
    const fila = { id: `prop-${propuestas.length + 1}`, ...p }
    propuestas.push(fila)
    return fila
  })
  const avisar = vi.fn(async () => 1)
  const ctx = {
    supabase: fakeSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'x', name: 'X' }, agenciaId: 'casa',
    hoy, config, autonomia, proponer, avisar, log: async () => {},
  }
  return { ctx, propuestas, proponer, avisar }
}

const AHORA = Date.parse('2026-07-16T12:00:00Z') // lo que calcula el agente con esa `hoy`
const haceDias = (n) => new Date(AHORA - n * DIA).toISOString()

function contacto(extra = {}) {
  return {
    id: 'k1', client_id: 'c1', name: 'Ana Pérez', email: 'ana@x.com', phone: '600111222', whatsapp: '',
    status: 'lead', stage_key: null, source: 'Instagram', deal_value: 0,
    last_activity_at: haceDias(6), created_at: haceDias(20),
    utm_source: null, utm_campaign: null, utm_content: null, pipeline_id: null, ...extra,
  }
}

describe('seguimiento · (a) leads en frío', () => {
  it('propone seguir a un lead abierto sin movimiento ≥ 5 días, con tarea, mensaje y WhatsApp', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: { crm_contacts: [contacto()] } })
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(1)
    const p = propuestas[0]
    expect(p.clave).toBe('seguimiento:frio:k1:2026-07-13')
    expect(p.herramienta).toBe('crm_tarea')
    expect(p.input).toMatchObject({ contacto: 'k1' })
    expect(p.telefono).toBe('600111222')
    expect(p.mensaje).toContain('Ana')
    expect(p.datos).toMatchObject({ motivo: 'frio', dias: 6 })
  })

  it('no toca a los ganados ni a los perdidos, ni a quien lleva < 5 días', async () => {
    const { ctx, proponer } = hazCtx({ tablas: { crm_contacts: [
      contacto({ id: 'g', status: 'ganado' }),
      contacto({ id: 'p', status: 'perdido' }),
      contacto({ id: 'r', status: 'lead', last_activity_at: haceDias(2) }),
    ] } })
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(proponer).not.toHaveBeenCalled()
  })

  it('el mensaje cambia según la etapa (cita vs propuesta)', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: { crm_contacts: [
      contacto({ id: 'c', status: 'cita agendada', deal_value: 500 }),
      contacto({ id: 'p', status: 'propuesta enviada', deal_value: 400 }),
    ] } })
    await agente.corre(ctx)
    const porId = Object.fromEntries(propuestas.map(p => [p.datos.contactId, p.mensaje]))
    expect(porId.c).toContain('llamada')
    expect(porId.p).toContain('propuesta')
  })
})

describe('seguimiento · (b) no-show', () => {
  const base = (extra = {}) => ({ crm_contacts: [contacto({ last_activity_at: haceDias(1) })], helm_calls: [{
    id: 'll1', client_id: 'c1', title: 'Llamada Ana', starts_at: haceDias(2), status: 'no_show', contact_id: 'k1', ...extra,
  }] })

  it('rescata una llamada no_show reciente sin reagendar', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: base() })
    await agente.corre(ctx)
    const p = propuestas.find(x => x.datos.motivo === 'noshow')
    expect(p).toBeTruthy()
    expect(p.clave).toBe('seguimiento:noshow:ll1:2026-07-13')
    expect(p.telefono).toBe('600111222')
    expect(p.herramienta).toBe('crm_tarea')
  })

  it('no rescata si ya hay otra llamada futura para ese contacto', async () => {
    const tablas = base()
    tablas.helm_calls.push({ id: 'll2', client_id: 'c1', title: 'Nueva', starts_at: new Date(AHORA + 2 * DIA).toISOString(), status: 'agendada', contact_id: 'k1' })
    const { ctx, propuestas } = hazCtx({ tablas })
    await agente.corre(ctx)
    expect(propuestas.some(x => x.datos.motivo === 'noshow')).toBe(false)
  })
})

describe('seguimiento · (c) formulario sin contestar', () => {
  const tablasForm = (overrides = {}) => ({
    crm_contacts: [contacto({ last_activity_at: haceDias(2) })],
    helm_form_responses: [{ id: 'f1', client_id: 'c1', contact_id: 'k1', answers: { objetivo: 'Quiero más clientes' }, submitted_at: haceDias(2) }],
    crm_activities: [{ client_id: 'c1', contact_id: 'k1', performed_at: haceDias(2), performed_by: 'Formulario web' }],
    ...overrides,
  })

  it('propone primer contacto si pasó 24 h y nadie (humano) ha contestado', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: tablasForm() })
    await agente.corre(ctx)
    const p = propuestas.find(x => x.datos.motivo === 'form')
    expect(p).toBeTruthy()
    expect(p.clave).toBe('seguimiento:form:f1')
    expect(p.mensaje).toContain('Quiero más clientes')
    expect(p.herramienta).toBe('crm_tarea')
  })

  it('no propone si ya hubo una respuesta humana posterior', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: tablasForm({
      crm_activities: [{ client_id: 'c1', contact_id: 'k1', performed_at: haceDias(1), performed_by: 'Álex' }],
    }) })
    await agente.corre(ctx)
    expect(propuestas.some(x => x.datos.motivo === 'form')).toBe(false)
  })

  it('no propone si el formulario llegó hace menos de 24 h', async () => {
    const { ctx, propuestas } = hazCtx({ tablas: tablasForm({
      helm_form_responses: [{ id: 'f1', client_id: 'c1', contact_id: 'k1', answers: { x: 'hola' }, submitted_at: new Date(AHORA - 3600_000).toISOString() }],
    }) })
    await agente.corre(ctx)
    expect(propuestas.some(x => x.datos.motivo === 'form')).toBe(false)
  })
})

describe('seguimiento · tope, duplicados y fechas', () => {
  it('respeta config.maximo y propone primero los más calientes (deal_value)', async () => {
    const contactos = [100, 900, 300, 50, 500].map((v, i) => contacto({ id: `k${i}`, deal_value: v }))
    const { ctx, proponer, propuestas } = hazCtx({ tablas: { crm_contacts: contactos }, config: { maximo: 2 } })
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(2)
    expect(proponer).toHaveBeenCalledTimes(2)
    expect(propuestas.map(p => p.datos.contactId).sort()).toEqual(['k1', 'k4']) // 900 y 500
  })

  it('no duplica en la misma semana y vuelve a insistir a la siguiente', async () => {
    const tablas = { crm_contacts: [contacto()] }
    const { ctx, propuestas } = hazCtx({ tablas })
    await agente.corre(ctx)
    await agente.corre(ctx) // misma `hoy` → misma clave → no duplica
    expect(propuestas).toHaveLength(1)

    // La semana siguiente: la clave cambia y vuelve a proponer.
    const ctx2 = { ...ctx, hoy: new Date('2026-07-23T09:00:00Z') }
    const r = await agente.corre(ctx2)
    expect(r.propuestas).toBe(1)
    expect(propuestas).toHaveLength(2)
    expect(propuestas[1].clave).toBe('seguimiento:frio:k1:2026-07-20')
  })

  it('las fechas van en Europe/Madrid (un no_show a las 23:30 UTC cuenta como el día siguiente)', async () => {
    const tablas = {
      crm_contacts: [contacto({ last_activity_at: haceDias(1) })],
      helm_calls: [{ id: 'll1', client_id: 'c1', title: 'Llamada', starts_at: '2026-07-15T23:30:00Z', status: 'no_show', contact_id: 'k1' }],
    }
    const { ctx, propuestas } = hazCtx({ tablas })
    await agente.corre(ctx)
    const p = propuestas.find(x => x.datos.motivo === 'noshow')
    expect(p.porque).toContain('2026-07-16') // 23:30 UTC = 01:30 del 16 en Madrid
  })
})
