// Los agentes de departamento (api/_lib/departamentos/index.js): cómo se pasan
// por un perfil (los apagados no corren, uno roto o colgado no para a los
// demás, ctx.proponer pone SIEMPRE el perfil y el agente) y el reloj del
// worker (una pasada al día por perfil, desde las 6:45 de Madrid y nunca
// durante la edición del diario, 7:55-8:40; las propuestas vencidas, a
// cualquier hora). Supabase va en memoria y las propuestas, simuladas.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-departamentos-0123'

vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase } = await import('./ayudas/base-memoria.js')
  const base = crearBase({ unicos: { agent_jobs: [['clave']] } })
  return { supabase: base.supabase, __base: base }
})
const sim = vi.hoisted(() => ({ propuestas: [], avisos: [], caducadas: 0, caducarFalla: false, respuesta: null }))
vi.mock('../api/_lib/propuestas.js', () => ({
  proponer: vi.fn(async (p) => {
    sim.propuestas.push(p)
    if (sim.respuesta) return sim.respuesta(p)
    return { id: `prop-${sim.propuestas.length}`, ...p }
  }),
  avisarAgencia: vi.fn(async (agenciaId, texto) => { sim.avisos.push({ agenciaId, texto }); return 1 }),
  caducarPropuestas: vi.fn(async () => {
    if (sim.caducarFalla) throw new Error('la base se ha caído')
    sim.caducadas++
    return 0
  }),
}))

const { __base: db } = await import('../api/lib/supabase.js')
const { olvidarPerfil } = await import('../api/_lib/access.js')
const { caducarPropuestas } = await import('../api/_lib/propuestas.js')
const {
  correDepartamentos, miraDepartamentos, trabajoDepartamentos, agentesDepartamento, horaDeEncolar, olvidaReloj, CLAVES, TIPO,
} = await import('../api/_lib/departamentos/index.js')

const AG = 'a0000000-0000-4000-8000-000000000001'
const P = {
  hugo: 'c0000000-0000-4000-8000-000000000001',
  dcc: 'c0000000-0000-4000-8000-000000000002',
  apagado: 'c0000000-0000-4000-8000-000000000003',
  suelto: 'c0000000-0000-4000-8000-000000000004',
  nuevo: 'c0000000-0000-4000-8000-000000000005',
}

beforeEach(() => {
  db.vaciar()
  for (const id of Object.values(P)) olvidarPerfil(id)
  olvidaReloj()
  Object.assign(sim, { propuestas: [], avisos: [], caducadas: 0, caducarFalla: false, respuesta: null })
  vi.mocked(caducarPropuestas).mockClear()
  db.tablas.clients = [
    { id: P.hugo, slug: 'enformaconhugo', name: 'En Forma con Hugo', agencia_id: AG, active: true },
    { id: P.dcc, slug: 'detrasdecamara', name: 'Detrás de Cámara', agencia_id: AG, active: true },
    { id: P.apagado, slug: 'apagado', name: 'Apagado', agencia_id: AG, active: false },
    { id: P.suelto, slug: 'suelto', name: 'Suelto', agencia_id: null, active: true },
  ]
})

// Un agente de prueba que apunta su ctx y hace lo que se le diga.
function agente(key, hace = async () => ({ resumen: `${key} ok` })) {
  const vistos = []
  return { key, vistos, corre: async (ctx) => { vistos.push(ctx); return hace(ctx) } }
}

describe('correDepartamentos', () => {
  it('pasa los agentes en orden con su ctx; los apagados en ese perfil no corren', async () => {
    db.tablas.helm_agente_ajustes = [
      { client_id: P.hugo, agente: 'caja', activo: false, autonomia: 'proponer', config: {} },
      { client_id: P.hugo, agente: 'cobrador', activo: true, autonomia: 'interno', config: { dias: 3 } },
      // El ajuste de otro perfil no cuenta.
      { client_id: P.dcc, agente: 'seguimiento', activo: false, autonomia: 'proponer', config: {} },
    ]
    const a = [agente('cobrador'), agente('caja'), agente('seguimiento')]
    const hoy = new Date('2026-11-02T08:00:00Z')
    const r = await correDepartamentos({ clientId: P.hugo, hoy, agentes: a })
    expect(r).toEqual([
      { key: 'cobrador', ok: true, propuestas: 0, resumen: 'cobrador ok' },
      { key: 'seguimiento', ok: true, propuestas: 0, resumen: 'seguimiento ok' },
    ])
    expect(a[1].vistos).toHaveLength(0)
    const ctx = a[0].vistos[0]
    expect(ctx).toMatchObject({
      clientId: P.hugo, agenciaId: AG, hoy, config: { dias: 3 }, autonomia: 'interno',
      perfil: { id: P.hugo, slug: 'enformaconhugo', name: 'En Forma con Hugo' },
    })
    expect(ctx.supabase).toBe(db.supabase)
    // Sin fila de ajustes: encendido, «proponer» y sin configuración.
    expect(a[2].vistos[0]).toMatchObject({ config: {}, autonomia: 'proponer' })
  })

  it('uno que lanza (o se cuelga) no para a los demás', async () => {
    const a = [
      agente('limpieza-crm', async () => { throw new Error('columna que no existe') }),
      agente('cobrador', () => new Promise(() => {})),
      agente('caja', () => { throw new Error('síncrono') }),
      agente('director'),
    ]
    const r = await correDepartamentos({ clientId: P.hugo, agentes: a, maxMs: 30 })
    expect(r.map(x => [x.key, x.ok])).toEqual([['limpieza-crm', false], ['cobrador', false], ['caja', false], ['director', true]])
    expect(r[0].error).toBe('columna que no existe')
    expect(r[1].error).toMatch(/tardó más de/)
    expect(r[2].error).toBe('síncrono')
  })

  it('ctx.proponer pone SIEMPRE el clientId y el agente, y cuenta solo las que se crean', async () => {
    let n = 0
    sim.respuesta = () => [{ id: 'p1' }, null, { creada: false, motivo: 'No hace falta hacer nada.' }, { id: 'p2' }][n++]
    const a = [agente('cobrador', async (ctx) => {
      for (let i = 0; i < 4; i++) await ctx.proponer({ clave: `c:${i}`, titulo: 't', clientId: P.dcc, agente: 'director' })
      // Lo que diga el agente que ha propuesto no cuenta: cuentan las creadas.
      return { propuestas: 99, resumen: 'cuatro intentos' }
    })]
    const r = await correDepartamentos({ clientId: P.hugo, agentes: a })
    expect(sim.propuestas.map(p => [p.clientId, p.agente])).toEqual(Array(4).fill([P.hugo, 'cobrador']))
    expect(r[0]).toEqual({ key: 'cobrador', ok: true, propuestas: 2, resumen: 'cuatro intentos' })
  })

  it('ctx.avisar va a la agencia del perfil', async () => {
    await correDepartamentos({ clientId: P.hugo, agentes: [agente('director', async (ctx) => { await ctx.avisar('Parte del día'); return {} })] })
    expect(sim.avisos).toEqual([{ agenciaId: AG, texto: 'Parte del día' }])
  })

  it('`solo` limita a esos agentes', async () => {
    const a = [agente('cobrador'), agente('caja'), agente('director')]
    const r = await correDepartamentos({ clientId: P.hugo, agentes: a, solo: ['caja', 'no-existe'] })
    expect(r.map(x => x.key)).toEqual(['caja'])
  })

  it('un perfil apagado, sin agencia, que no existe o con la sección de agentes apagada no se pasa', async () => {
    const a = [agente('cobrador')]
    expect(await correDepartamentos({ clientId: P.apagado, agentes: a })).toEqual([])
    expect(await correDepartamentos({ clientId: P.suelto, agentes: a })).toEqual([])
    expect(await correDepartamentos({ clientId: 'c0000000-0000-4000-8000-00000000dead', agentes: a })).toEqual([])
    expect(await correDepartamentos({ agentes: a })).toEqual([])
    db.tablas.helm_permissions = [{ client_id: P.hugo, sections: { contenido: false } }]
    expect(await correDepartamentos({ clientId: P.hugo, agentes: a })).toEqual([])
    expect(a[0].vistos).toHaveLength(0)
  })

  it('el registro: solo agentes de CLAVES, en su orden, con corre() y con la clave del archivo', async () => {
    const lista = await agentesDepartamento()
    expect(Array.isArray(lista)).toBe(true)
    const orden = lista.map(a => CLAVES.indexOf(a.key))
    expect(orden.every(i => i >= 0)).toBe(true)
    expect([...orden].sort((x, y) => x - y)).toEqual(orden)
    for (const a of lista) expect(typeof a.corre).toBe('function')
    expect(await agentesDepartamento()).toBe(lista)
  })
})

describe('trabajoDepartamentos', () => {
  it('sin perfil es un error; con un perfil que no se pasa, «nada»', async () => {
    await expect(trabajoDepartamentos({ payload: {} })).rejects.toThrow(/falta clientId/)
    await expect(trabajoDepartamentos({})).rejects.toThrow(/falta clientId/)
    expect(await trabajoDepartamentos({ payload: { clientId: P.apagado } })).toBe('departamentos: nada')
  })
})

describe('miraDepartamentos', () => {
  // 2 de noviembre de 2026: Madrid va a UTC+1.
  const nov = (hhmm) => new Date(`2026-11-02T${hhmm}:00Z`)
  const trabajos = () => db.filas('agent_jobs')

  it('las horas: desde las 6:45 de Madrid y nunca de 7:55 a 8:40 (en invierno y en verano)', () => {
    expect(horaDeEncolar(nov('05:44'))).toBe(false) // 6:44
    expect(horaDeEncolar(nov('05:45'))).toBe(true) // 6:45
    expect(horaDeEncolar(nov('06:54'))).toBe(true) // 7:54
    expect(horaDeEncolar(nov('06:55'))).toBe(false) // 7:55
    expect(horaDeEncolar(nov('07:40'))).toBe(false) // 8:40
    expect(horaDeEncolar(nov('07:41'))).toBe(true) // 8:41
    expect(horaDeEncolar(nov('22:59'))).toBe(true) // 23:59
    expect(horaDeEncolar(nov('23:30'))).toBe(false) // 0:30 del día siguiente
    // 1 de julio: UTC+2.
    expect(horaDeEncolar(new Date('2026-07-01T04:44:00Z'))).toBe(false)
    expect(horaDeEncolar(new Date('2026-07-01T04:45:00Z'))).toBe(true)
    expect(horaDeEncolar(new Date('2026-07-01T05:55:00Z'))).toBe(false)
  })

  it('antes de las 6:45 no encola, pero caduca', async () => {
    expect(await miraDepartamentos(nov('05:30'))).toBe(0)
    expect(trabajos()).toHaveLength(0)
    expect(sim.caducadas).toBe(1)
  })

  it('a las 6:45 encola una pasada por cada perfil activo con agencia, con la fecha de Madrid en la clave', async () => {
    expect(await miraDepartamentos(nov('05:45'))).toBe(2)
    expect(trabajos().map(j => j.clave).sort()).toEqual([`${TIPO}:${P.hugo}:2026-11-02`, `${TIPO}:${P.dcc}:2026-11-02`].sort())
    for (const j of trabajos()) {
      expect(j).toMatchObject({ tipo: 'departamentos', estado: 'pendiente', max_intentos: 1, correr_tras: '2026-11-02T05:45:00.000Z' })
      expect(Object.keys(j.payload)).toEqual(['clientId'])
    }
  })

  it('durante la edición del diario no encola; al acabar, sí', async () => {
    expect(await miraDepartamentos(nov('06:55'))).toBe(0)
    expect(await miraDepartamentos(nov('07:40'))).toBe(0)
    expect(trabajos()).toHaveLength(0)
    expect(await miraDepartamentos(nov('07:41'))).toBe(2)
  })

  it('una vez al día por perfil: mirar otra vez no duplica; solo recoge los perfiles nuevos; al día siguiente, otra', async () => {
    await miraDepartamentos(nov('05:45'))
    const upserts = () => db.ops.filter(o => o.tabla === 'agent_jobs' && o.op === 'upsert').length
    expect(upserts()).toBe(1)
    // Cada minuto, como el worker: no vuelve a la base.
    await miraDepartamentos(nov('05:46'))
    await miraDepartamentos(nov('06:30'))
    expect(upserts()).toBe(1)
    // Pasada la hora vuelve a mirar: los que ya están no se repiten; el nuevo, sí.
    db.tablas.clients.push({ id: P.nuevo, slug: 'nuevo', name: 'Nuevo', agencia_id: AG, active: true })
    await miraDepartamentos(nov('07:45'))
    expect(upserts()).toBe(2)
    expect(trabajos()).toHaveLength(3)
    expect(new Set(trabajos().map(j => j.clave)).size).toBe(3)
    // Al día siguiente (3-nov a las 7:00 de Madrid), otra pasada por cada uno.
    await miraDepartamentos(new Date('2026-11-03T06:00:00Z'))
    expect(trabajos()).toHaveLength(6)
    expect(trabajos().filter(j => j.clave.endsWith(':2026-11-03'))).toHaveLength(3)
  })

  it('caduca como mucho cada 10 minutos, y si caducar falla, encola igual', async () => {
    await miraDepartamentos(nov('05:00'))
    await miraDepartamentos(nov('05:05'))
    expect(caducarPropuestas).toHaveBeenCalledTimes(1)
    await miraDepartamentos(nov('05:10'))
    expect(caducarPropuestas).toHaveBeenCalledTimes(2)
    olvidaReloj()
    sim.caducarFalla = true
    expect(await miraDepartamentos(nov('05:45'))).toBe(2)
  })

  it('si la base falla al leer los perfiles, lanza (el worker lo apunta) y vuelve a probar en la siguiente vuelta', async () => {
    db.fallos.clients = 'caída'
    await expect(miraDepartamentos(nov('05:45'))).rejects.toBeTruthy()
    delete db.fallos.clients
    expect(await miraDepartamentos(nov('05:46'))).toBe(2)
  })
})
