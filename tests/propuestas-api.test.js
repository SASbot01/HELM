// La API de la bandeja (api/propuestas.js): quién ve, quién decide y qué
// llega a decidir(). Ver: quien puede usar los agentes del perfil. Decidir,
// cambiar ajustes y lanzar: solo quien administra su agencia. Una propuesta de
// otro perfil por su id es un 404; del navegador solo cuentan el id y el sí/no
// (nada de input, herramienta ni resumen); y los fallos de la base no salen.
// La sesión y las propuestas van simuladas; Supabase, en memoria.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase } = await import('./ayudas/base-memoria.js')
  const base = crearBase({ unicos: { agent_jobs: [['clave']], helm_agente_ajustes: [['client_id', 'agente']] } })
  return { supabase: base.supabase, __base: base }
})
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {} }))

// Las sesiones de prueba, por la cabecera x-quien.
const SESIONES = vi.hoisted(() => ({
  admin: { userId: 'admin-1', email: 'alex@helm.es', admin: true, usa: true },
  editor: { userId: 'editor-1', email: 'edi@helm.es', admin: false, usa: true },
  closer: { userId: 'closer-1', email: 'clo@helm.es', admin: false, usa: false },
}))
vi.mock('../api/_lib/access.js', async () => {
  const { __base } = await import('../api/lib/supabase.js')
  return {
    SECCION_AGENTES: 'contenido',
    requireProfileAccess: async (req) => {
      const s = SESIONES[req.headers?.['x-quien']]
      if (!s) throw Object.assign(new Error('Unauthorized: missing token'), { statusCode: 401 })
      return s
    },
    puedeUsarAgentes: async (auth) => auth.usa === true,
    puedeVerSaldo: async (auth) => auth.admin === true,
    agenciaDe: async (clientId) => __base.filas('clients').find(c => c.id === clientId)?.agencia_id || null,
  }
})
const sim = vi.hoisted(() => ({ decidir: null }))
vi.mock('../api/_lib/propuestas.js', () => ({
  listarPropuestas: vi.fn(async (clientId) => ({ pendientes: [{ id: 'x', client_id: clientId }], decididas: [] })),
  decidir: vi.fn(async (args) => (sim.decidir ? sim.decidir(args) : { ok: true, decidida: true, estado: 'aplicada', texto: 'Hecho.' })),
  proponer: vi.fn(), avisarAgencia: vi.fn(), caducarPropuestas: vi.fn(),
}))

const { __base: db } = await import('../api/lib/supabase.js')
const { decidir, listarPropuestas } = await import('../api/_lib/propuestas.js')
const { CLAVES } = await import('../api/_lib/departamentos/index.js')
const { contexto } = await import('../api/_lib/contexto.js')
const { default: handler } = await import('../api/propuestas.js')

const AG = 'a0000000-0000-4000-8000-000000000001'
const P = { hugo: 'c0000000-0000-4000-8000-000000000001', dcc: 'c0000000-0000-4000-8000-000000000002', suelto: 'c0000000-0000-4000-8000-000000000003' }
const ID = { hugo: 'd0000000-0000-4000-8000-000000000001', dcc: 'd0000000-0000-4000-8000-000000000002' }

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader() {},
  }
}
async function llama(method, action, { quien = 'admin', clientId = P.hugo, body } = {}) {
  const res = respuesta()
  await handler({ method, query: { action, ...(clientId != null ? { clientId } : {}) }, headers: quien ? { 'x-quien': quien } : {}, body }, res)
  return res
}

beforeEach(() => {
  db.vaciar()
  sim.decidir = null
  vi.mocked(decidir).mockClear()
  vi.mocked(listarPropuestas).mockClear()
  db.tablas.clients = [
    { id: P.hugo, agencia_id: AG }, { id: P.dcc, agencia_id: AG }, { id: P.suelto, agencia_id: null },
  ]
  db.tablas.helm_propuestas = [
    { id: ID.hugo, client_id: P.hugo, agencia_id: AG, estado: 'pendiente', herramienta: 'crm_tarea', input: { titulo: 'guardado' } },
    { id: ID.dcc, client_id: P.dcc, agencia_id: AG, estado: 'pendiente' },
  ]
})

describe('ver la bandeja', () => {
  it('quien puede usar los agentes la ve; puedeDecidir solo si administra la agencia', async () => {
    const a = await llama('GET', 'lista', { quien: 'admin' })
    expect(a.statusCode).toBe(200)
    expect(a.body).toMatchObject({ puedeDecidir: true, pendientes: [{ client_id: P.hugo }] })
    expect(listarPropuestas).toHaveBeenCalledWith(P.hugo)
    const e = await llama('GET', 'lista', { quien: 'editor' })
    expect(e.statusCode).toBe(200)
    expect(e.body.puedeDecidir).toBe(false)
  })

  it('sin permiso para los agentes, 403; sin sesión, 401; sin perfil válido, 400', async () => {
    expect((await llama('GET', 'lista', { quien: 'closer' })).statusCode).toBe(403)
    const sin = await llama('GET', 'lista', { quien: null })
    expect(sin.statusCode).toBe(401)
    expect((await llama('GET', 'lista', { clientId: null })).statusCode).toBe(400)
    expect((await llama('GET', 'lista', { clientId: "x' or 1=1" })).statusCode).toBe(400)
    expect(listarPropuestas).not.toHaveBeenCalled()
  })

  it('OPTIONS contesta sin más; un GET desconocido, 405', async () => {
    expect((await llama('OPTIONS', 'lista')).statusCode).toBe(200)
    expect((await llama('GET', 'borrar')).statusCode).toBe(405)
  })
})

describe('decidir', () => {
  it('solo quien administra la agencia; el resto, 403 sin llegar a decidir()', async () => {
    const r = await llama('POST', 'decidir', { quien: 'editor', body: { id: ID.hugo, aprobar: true } })
    expect(r.statusCode).toBe(403)
    expect((await llama('POST', 'decidir', { quien: 'closer', body: { id: ID.hugo, aprobar: true } })).statusCode).toBe(403)
    expect(decidir).not.toHaveBeenCalled()
  })

  it('a decidir() solo le llegan el id y el sí/no (más quién y de qué agencia y perfil): nada del input', async () => {
    const r = await llama('POST', 'decidir', {
      body: { id: ID.hugo, aprobar: true, input: { titulo: 'Borrar todo' }, herramienta: 'registrar_venta', resumen: 'trampa', agenciaId: 'otra', clientId: P.dcc },
    })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, decidida: true, estado: 'aplicada', texto: 'Hecho.' })
    expect(decidir).toHaveBeenCalledTimes(1)
    expect(vi.mocked(decidir).mock.calls[0][0]).toEqual({
      id: ID.hugo, aprobar: true, agenciaId: AG, clientId: P.hugo,
      quien: { id: 'admin-1', email: 'alex@helm.es', nombre: 'alex@helm.es' }, origen: 'panel',
    })
  })

  it('decide dentro del contexto del perfil y su agencia (para el cobro y el registro)', async () => {
    let visto = null
    sim.decidir = () => { visto = contexto(); return { ok: true, decidida: true, estado: 'rechazada', texto: 'Rechazada: no se hace.' } }
    await llama('POST', 'decidir', { body: { id: ID.hugo, aprobar: false } })
    expect(visto).toMatchObject({ agenciaId: AG, clientId: P.hugo, origen: 'panel' })
  })

  it('una propuesta de otro perfil (aunque sea de la misma agencia), un id raro o que no existe: 404', async () => {
    for (const id of [ID.dcc, 'd0000000-0000-4000-8000-00000000beef', 'nada', "1' or '1'='1", '', null]) {
      const r = await llama('POST', 'decidir', { body: { id, aprobar: true } })
      expect(r.statusCode, String(id)).toBe(404)
    }
    expect(decidir).not.toHaveBeenCalled()
  })

  it('el sí/no tiene que ser booleano', async () => {
    for (const aprobar of ['true', 1, null, undefined, 'si']) {
      expect((await llama('POST', 'decidir', { body: { id: ID.hugo, aprobar } })).statusCode).toBe(400)
    }
    // Un cuerpo que no es un objeto no es nada.
    expect((await llama('POST', 'decidir', { body: 'id=x&aprobar=true' })).statusCode).toBe(404)
    expect((await llama('POST', 'decidir', { body: [ID.hugo, true] })).statusCode).toBe(404)
    expect(decidir).not.toHaveBeenCalled()
  })

  it('si no se ha podido decidir (ya estaba, caducada), 409 con el texto en `error` para el panel', async () => {
    sim.decidir = () => ({ ok: false, decidida: false, estado: 'aplicada', texto: 'Ya estaba aplicada.' })
    const r = await llama('POST', 'decidir', { body: { id: ID.hugo, aprobar: true } })
    expect(r.statusCode).toBe(409)
    expect(r.body).toMatchObject({ error: 'Ya estaba aplicada.', estado: 'aplicada' })
    // Aprobada pero sin poder hacerse: se ha decidido (200) y dice por qué.
    sim.decidir = () => ({ ok: false, decidida: true, estado: 'fallida', texto: 'Ha cambiado algo…' })
    expect((await llama('POST', 'decidir', { body: { id: ID.hugo, aprobar: true } })).statusCode).toBe(200)
  })

  it('un perfil sin agencia: sus propuestas no se deciden', async () => {
    db.tablas.helm_propuestas.push({ id: 'd0000000-0000-4000-8000-000000000003', client_id: P.suelto, agencia_id: null, estado: 'pendiente' })
    const r = await llama('POST', 'decidir', { clientId: P.suelto, body: { id: 'd0000000-0000-4000-8000-000000000003', aprobar: true } })
    expect(r.statusCode).toBe(409)
    expect(decidir).not.toHaveBeenCalled()
  })

  it('un fallo de la base o de decidir() es un 500 genérico, sin detalles', async () => {
    sim.decidir = () => { throw new Error('relation "helm_propuestas" does not exist at character 15') }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await llama('POST', 'decidir', { body: { id: ID.hugo, aprobar: true } })
    expect(r.statusCode).toBe(500)
    expect(r.body).toEqual({ error: 'No se ha podido hacer. Prueba otra vez.' })
    db.fallos.helm_propuestas = 'permission denied for table helm_propuestas'
    const s = await llama('POST', 'decidir', { body: { id: ID.hugo, aprobar: true } })
    expect(s.statusCode).toBe(500)
    expect(JSON.stringify(s.body)).not.toContain('permission')
    err.mockRestore()
  })
})

describe('ajustes', () => {
  it('los ve quien usa los agentes; cambiarlos, solo quien administra', async () => {
    db.tablas.helm_agente_ajustes = [{ client_id: P.hugo, agente: 'cobrador', activo: false, autonomia: 'proponer', config: { secreto: 1 } }]
    const r = await llama('GET', 'ajustes', { quien: 'editor' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ajustes: [{ agente: 'cobrador', activo: false, autonomia: 'proponer' }], agentes: CLAVES, puedeCambiar: false })
    expect((await llama('POST', 'ajuste', { quien: 'editor', body: { agente: 'cobrador', activo: true } })).statusCode).toBe(403)
    expect(db.tablas.helm_agente_ajustes[0].activo).toBe(false)
  })

  it('solo claves de agente válidas y valores válidos; la configuración no se toca desde aquí', async () => {
    for (const body of [
      { agente: 'no-existe', activo: false },
      { agente: '__proto__', activo: false },
      { agente: 'cobrador', activo: 'false' },
      { agente: 'cobrador', autonomia: 'todo' },
      { agente: 'cobrador' },
      { agente: 'cobrador', config: { tope: 1e9 } },
    ]) {
      expect((await llama('POST', 'ajuste', { body })).statusCode, JSON.stringify(body)).toBe(400)
    }
    expect(db.filas('helm_agente_ajustes')).toHaveLength(0)
    expect((await llama('POST', 'ajuste', { body: { agente: 'media-buyer', activo: false } })).statusCode).toBe(200)
    db.filas('helm_agente_ajustes')[0].config = { topeDiario: 50 }
    const r = await llama('POST', 'ajuste', { body: { agente: 'media-buyer', autonomia: 'interno', config: { topeDiario: 999999 }, client_id: P.dcc } })
    expect(r.statusCode).toBe(200)
    expect(db.filas('helm_agente_ajustes')).toEqual([expect.objectContaining({ client_id: P.hugo, agente: 'media-buyer', activo: false, autonomia: 'interno', config: { topeDiario: 50 } })])
  })

  it('un fallo de la base al leerlos es un 500 genérico', async () => {
    db.fallos.helm_agente_ajustes = 'column "x" does not exist'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await llama('GET', 'ajustes')
    expect(r.statusCode).toBe(500)
    expect(r.body.error).toBe('No se ha podido hacer. Prueba otra vez.')
    err.mockRestore()
  })
})

describe('correr', () => {
  const trabajos = () => db.filas('agent_jobs')

  it('solo quien administra; encola una pasada por el perfil, como mucho una cada 10 minutos', async () => {
    expect((await llama('POST', 'correr', { quien: 'editor', body: {} })).statusCode).toBe(403)
    const a = await llama('POST', 'correr', { body: {} })
    expect(a.statusCode).toBe(200)
    expect(a.body).toEqual({ encolado: true })
    expect(trabajos()).toHaveLength(1)
    expect(trabajos()[0]).toMatchObject({ tipo: 'departamentos', estado: 'pendiente', max_intentos: 1, payload: { clientId: P.hugo } })
    expect(trabajos()[0].clave).toMatch(new RegExp(`^departamentos:${P.hugo}:mano:\\d+$`))
    const b = await llama('POST', 'correr', { body: {} })
    expect(b.body).toMatchObject({ encolado: false, texto: expect.stringMatching(/hace poco/) })
    expect(trabajos()).toHaveLength(1)
  })

  it('con agentes: solo los que existen (sin repetir); si ninguno existe, 400 (no «todos»)', async () => {
    const a = await llama('POST', 'correr', { body: { agentes: ['cobrador', 'cobrador', 'rm -rf', 'caja'] } })
    expect(a.statusCode).toBe(200)
    expect(trabajos()[0].payload).toEqual({ clientId: P.hugo, solo: ['cobrador', 'caja'] })
    db.vaciar()
    db.tablas.clients = [{ id: P.hugo, agencia_id: AG }]
    expect((await llama('POST', 'correr', { body: { agentes: ['nada'] } })).statusCode).toBe(400)
    expect((await llama('POST', 'correr', { body: { agentes: 'cobrador' } })).statusCode).toBe(400)
    expect((await llama('POST', 'correr', { body: { agentes: Array(100).fill('cobrador') } })).statusCode).toBe(400)
    expect(trabajos()).toHaveLength(0)
  })

  it('un perfil sin agencia no se encola', async () => {
    expect((await llama('POST', 'correr', { clientId: P.suelto, body: {} })).statusCode).toBe(409)
    expect(trabajos()).toHaveLength(0)
  })

  it('una acción POST desconocida es un 400', async () => {
    expect((await llama('POST', 'borrar_todo', { body: {} })).statusCode).toBe(400)
  })
})
