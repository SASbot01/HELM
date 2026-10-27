// El endpoint del Estudio de contenido (api/estudio-contenido.js): quién lo ve
// (la misma escalera que el panel para el Informe de contenido), qué devuelve
// (también por qué falló lo último, con un mensaje para el usuario) y cuándo
// NO encola uno nuevo: sin Instagram (400), con uno en marcha (409, también
// con un doble clic, por el índice único), con tres pedidos hoy (429) o sin
// saldo en una agencia que paga (402), cada uno con su `codigo`. La de la casa
// (sin_cobro) ni paga ni se le mira el saldo. Sin red ni base.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let db = {}
const pedidas = []
const rota = {}   // tabla → error que devuelve su siguiente consulta

// Lo justo de PostgREST: columnas, filtros (también sobre `payload->>clave`),
// orden, tope, escrituras y el índice único parcial de la migración 113 (una
// fila 'en_curso' por perfil en helm_estudio_contenido).
function consulta(tabla) {
  const filtros = []
  let orden = null
  let tope = null
  let campos = null
  let op = 'select'
  let cuerpo = null
  const valor = (r, c) => (c.includes('->>') ? r[c.split('->>')[0]]?.[c.split('->>')[1]] : r[c])
  const recorta = (r) => (campos ? Object.fromEntries(campos.filter(c => c in r).map(c => [c, r[c]])) : r)
  const elegidas = () => {
    let out = (db[tabla] || []).filter(r => filtros.every(f => f(r)))
    if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
    if (tope != null) out = out.slice(0, tope)
    return out
  }
  function ejecuta(uno) {
    pedidas.push(tabla)
    if (rota[tabla]) { const error = rota[tabla]; delete rota[tabla]; return Promise.resolve({ data: null, error }) }
    if (op === 'insert') {
      const nuevas = [cuerpo].flat().map(r => ({ id: crypto.randomUUID(), generado_en: new Date().toISOString(), ...r }))
      const choca = tabla === 'helm_estudio_contenido' &&
        nuevas.some(n => n.estado === 'en_curso' && (db[tabla] || []).some(r => r.client_id === n.client_id && r.estado === 'en_curso'))
      if (choca) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "helm_estudio_contenido_uno_en_curso"' } })
      ;(db[tabla] ||= []).push(...nuevas)
      return Promise.resolve({ data: uno ? recorta(nuevas[0]) : nuevas.map(recorta), error: null })
    }
    const sel = elegidas()
    if (op === 'update') for (const r of sel) Object.assign(r, cuerpo)
    const out = sel.map(recorta)
    return Promise.resolve({ data: uno ? out[0] || null : out, error: null })
  }
  const q = {
    select(cols = '*') { campos = cols === '*' ? null : cols.split(',').map(c => c.trim()); return q },
    eq(c, v) { filtros.push(r => valor(r, c) === v); return q },
    in(c, vs) { filtros.push(r => vs.includes(valor(r, c))); return q },
    is(c, v) { filtros.push(r => (valor(r, c) ?? null) === v); return q },
    gte(c, v) { filtros.push(r => valor(r, c) >= v); return q },
    // Como en Postgres: null < x no es verdad (una fila sin empezado_en no entra).
    lt(c, v) { filtros.push(r => valor(r, c) != null && valor(r, c) < v); return q },
    order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
    limit(n) { tope = n; return q },
    insert(r) { op = 'insert'; cuerpo = r; return q },
    update(r) { op = 'update'; cuerpo = r; return q },
    single() { return ejecuta(true) },
    maybeSingle() { return ejecuta(true) },
    then(res, rej) { return ejecuta(false).then(res, rej) },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/auth.js', () => ({ applyCors: () => {} }))
const sesion = vi.hoisted(() => ({ auth: null }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: async () => sesion.auth }))
const cobro = vi.hoisted(() => ({ paga: true, saldo: 10 }))
const sinSaldo = async () => {
  if (cobro.saldo <= 0) throw Object.assign(new Error('Te has quedado sin créditos. Recarga para que la IA siga trabajando.'), { statusCode: 402 })
}
const exigirSaldo = vi.fn(sinSaldo)
vi.mock('../api/_lib/creditos.js', () => ({
  pagaConCreditos: async () => cobro.paga,
  exigirSaldo: (...a) => exigirSaldo(...a),
  costeUsd: (_m, u) => (u.input_tokens * 2 + u.output_tokens * 10) / 1e6,
  precioEuros: (usd) => usd * 0.92 * 2,
}))
vi.mock('../api/_lib/instagram.js', () => ({
  getIgConfig: async (_s, clientId) => (db.user_integrations || []).find(r => r.client_id === clientId) || null,
}))
const encolaEstudio = vi.fn(async () => {})
vi.mock('../api/_lib/estudio-contenido/generar.js', () => ({
  encolaEstudio: (...a) => encolaEstudio(...a), modeloEstudio: () => 'claude-sonnet-5', TIPO: 'estudio-contenido',
}))
vi.mock('../api/_lib/estudio-contenido/conocimiento.js', () => ({
  ALGORITMO_RESUMEN: [{ titulo: 'Tres señales', texto: 'Tiempo de visionado, me gusta y envíos.', fuente: 'https://example.com', etiqueta: 'OFICIAL' }],
}))

const { default: handler, inicioDiaMadrid, puedeVerMetricas } = await import('../api/estudio-contenido.js')

async function pide(auth, action = '', { method = action === 'ahora' ? 'POST' : 'GET', ...query } = {}) {
  sesion.auth = auth
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  await handler({ method, query: { ...(action ? { action } : {}), clientId: 'c1', ...query }, headers: {} }, res)
  return res
}

const ADMIN_AGENCIA = { superadmin: true, role: 'superadmin', agenciaId: 'ag-1' }
const PROPIETARIO = { role: 'client', clientId: 'c1', userId: 'login-dueno', nivel: 'admin,ceo,director' }
const CLOSER = { role: 'client', clientId: 'c1', userId: 'login-closer', nivel: 'member' }
const EDITOR = { role: 'client', clientId: 'c1', userId: 'login-editor', nivel: 'member' }

const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
// Los id de los estudios son UUID: `ver` no consulta lo que no lo es.
const E1 = '11111111-1111-4111-8111-111111111111'
const E2 = '22222222-2222-4222-8222-222222222222'
const OTRO = '33333333-3333-4333-8333-333333333333'
const estudios = () => db.helm_estudio_contenido

beforeEach(() => {
  pedidas.length = 0
  for (const k of Object.keys(rota)) delete rota[k]
  encolaEstudio.mockReset()
  encolaEstudio.mockImplementation(async () => {})
  exigirSaldo.mockReset()
  exigirSaldo.mockImplementation(sinSaldo)
  cobro.paga = true
  cobro.saldo = 10
  db = {
    helm_permissions: [{ client_id: 'c1', sections: {}, visible: {} }],
    helm_team: [
      { login_id: 'login-closer', client_id: 'c1', role: 'closer' },
      { login_id: 'login-editor', client_id: 'c1', role: 'editor' },
    ],
    user_integrations: [{ client_id: 'c1', service: 'instagram', enabled: true, config: { token: 'tok', followers: 1551 } }],
    helm_estudio_contenido: [
      { id: E1, client_id: 'c1', generado_en: '2026-10-13T07:00:00Z', estado: 'listo', datos: { cuenta: { piezas: 90 } }, estudio: { resumen: 'viejo' }, modelo: 'claude-sonnet-5', tokens: 20_000, coste_usd: 0.1, error: null },
      { id: E2, client_id: 'c1', generado_en: '2026-10-20T07:00:00Z', estado: 'listo', datos: { cuenta: { piezas: 97 } }, estudio: { resumen: 'nuevo' }, modelo: 'claude-sonnet-5', tokens: 20_000, coste_usd: 0.1, error: null },
      { id: OTRO, client_id: 'c2', generado_en: '2026-10-20T08:00:00Z', estado: 'listo', datos: {}, estudio: { resumen: 'de otro perfil' }, modelo: 'claude-sonnet-5' },
    ],
    agent_jobs: [],
  }
})

describe('api/estudio-contenido · quién lo ve', () => {
  it('la agencia, el propietario y el editor (lo trae de serie) entran', async () => {
    for (const auth of [ADMIN_AGENCIA, PROPIETARIO, EDITOR]) expect((await pide(auth)).statusCode).toBe(200)
  })

  it('un closer sin el Informe de contenido se queda fuera de las tres acciones', async () => {
    expect((await pide(CLOSER)).statusCode).toBe(403)
    expect((await pide(CLOSER, 'ver', { id: E1 })).statusCode).toBe(403)
    expect((await pide(CLOSER, 'ahora')).statusCode).toBe(403)
    expect(encolaEstudio).not.toHaveBeenCalled()
  })

  it('con «metricas» marcado para su rol, el closer entra; si el perfil se lo quita al editor, el editor no', async () => {
    db.helm_permissions[0].visible = { closer: ['crm', 'metricas'], editor: ['contenido'] }
    expect((await pide(CLOSER)).statusCode).toBe(200)
    expect((await pide(EDITOR)).statusCode).toBe(403)
  })

  it('apagado en Secciones no lo ve nadie', async () => {
    db.helm_permissions[0].sections = { metricas: false }
    for (const auth of [ADMIN_AGENCIA, PROPIETARIO, EDITOR]) {
      expect((await pide(auth)).statusCode).toBe(403)
      expect((await pide(auth, 'ahora')).statusCode).toBe(403)
    }
    expect(encolaEstudio).not.toHaveBeenCalled()
  })

  it('a quien manda en todo no se le busca el oficio', async () => {
    expect(await puedeVerMetricas(PROPIETARIO, 'c1')).toBe(true)
    expect(pedidas).not.toContain('helm_team')
  })
})

describe('api/estudio-contenido · lo que devuelve', () => {
  it('el último listo, el historial, si hay uno en marcha, el coste, Instagram y el algoritmo', async () => {
    const r = await pide(PROPIETARIO)
    expect(r.statusCode).toBe(200)
    expect(r.body.estudio).toMatchObject({ id: E2, estado: 'listo', estudio: { resumen: 'nuevo' }, modelo: 'claude-sonnet-5' })
    expect(Object.keys(r.body.estudio).sort()).toEqual(['datos', 'estado', 'estudio', 'generado_en', 'id', 'modelo'])
    expect(r.body.historial).toEqual([
      { id: E2, generado_en: '2026-10-20T07:00:00Z', estado: 'listo' },
      { id: E1, generado_en: '2026-10-13T07:00:00Z', estado: 'listo' },
    ])
    expect(r.body.en_curso).toBe(false)
    expect(r.body.conectado).toBe(true)
    expect(r.body.coste_aprox_eur).toBeGreaterThan(0.15)
    expect(r.body.coste_aprox_eur).toBeLessThan(0.3)
    expect(r.body.algoritmo[0].etiqueta).toBe('OFICIAL')
    expect(r.body.ultimo_error).toBeNull()
  })

  it('a la agencia de la casa no le cuesta nada', async () => {
    cobro.paga = false
    expect((await pide(PROPIETARIO)).body.coste_aprox_eur).toBe(0)
  })

  it('ultimo_error: solo si lo último pedido falló después del último listo, con fecha y mensaje', async () => {
    const fallo = { id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(5), estado: 'error', error: 'No quedan créditos para hacer el estudio. Recarga y vuelve a pedirlo. No se ha cobrado nada.' }
    estudios().push(fallo)
    expect((await pide(PROPIETARIO)).body.ultimo_error).toEqual({ generado_en: fallo.generado_en, mensaje: fallo.error })
    // Detrás del fallo hay otro en marcha: ese aún no ha fallado.
    estudios().push({ id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(1), estado: 'en_curso' })
    expect((await pide(PROPIETARIO)).body).toMatchObject({ en_curso: true, ultimo_error: null })
    // Y si después salió uno bueno, ya no hay nada que contar.
    estudios().at(-1).estado = 'listo'
    expect((await pide(PROPIETARIO)).body.ultimo_error).toBeNull()
    // El fallo de otro perfil no sale aquí.
    db.helm_estudio_contenido = [{ ...fallo, client_id: 'c2' }]
    expect((await pide(PROPIETARIO)).body.ultimo_error).toBeNull()
  })

  it('una fila que lleva más de 30 min TRABAJÁNDOSE se da por perdida: pasa a error y deja pedir otro', async () => {
    const colgada = { id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(45), empezado_en: hace(45), estado: 'en_curso' }
    estudios().push(colgada)
    const r = await pide(PROPIETARIO)
    expect(r.body.en_curso).toBe(false)
    expect(colgada).toMatchObject({ estado: 'error', error: expect.stringMatching(/a medias/) })
    expect(r.body.ultimo_error).toEqual({ generado_en: colgada.generado_en, mensaje: colgada.error })
    expect((await pide(PROPIETARIO, 'ahora')).statusCode).toBe(200)
  })

  it('la espera en la cola no cuenta: un pedido de hace 40 min que el worker aún no ha cogido sigue en marcha', async () => {
    // Por la mañana la cola va cargada (director, programador, virales…): el
    // pedido espera sin empezar, y el sondeo de la pantalla no lo puede matar.
    const enCola = { id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(40), empezado_en: null, estado: 'en_curso' }
    estudios().push(enCola)
    const r = await pide(PROPIETARIO)
    expect(r.body).toMatchObject({ en_curso: true, ultimo_error: null })
    expect(enCola.estado).toBe('en_curso')
    expect((await pide(PROPIETARIO, 'ahora')).statusCode).toBe(409)
    // Empezado hace 10 min (aunque se pidiera hace 40): tampoco.
    Object.assign(enCola, { empezado_en: hace(10) })
    expect((await pide(PROPIETARIO)).body.en_curso).toBe(true)
  })

  it('6 h en la cola sin empezar: se da por perdido, y sin cobrar nada', async () => {
    const olvidado = { id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(7 * 60), empezado_en: null, estado: 'en_curso' }
    estudios().push(olvidado)
    const r = await pide(PROPIETARIO)
    expect(r.body.en_curso).toBe(false)
    expect(olvidado).toMatchObject({ estado: 'error', error: expect.stringMatching(/no llegó a empezar.*No se ha cobrado nada/) })
    expect(r.body.ultimo_error.mensaje).toBe(olvidado.error)
  })

  it('en marcha: una fila en curso reciente, o un estudio de los lunes aún en la cola', async () => {
    estudios().push({ id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(3), estado: 'en_curso' })
    expect((await pide(PROPIETARIO)).body.en_curso).toBe(true)
    estudios().pop()
    db.agent_jobs = [{ id: 'j1', tipo: 'estudio-contenido', estado: 'pendiente', payload: { clientId: 'c1', origen: 'auto' }, created_at: hace(1) }]
    expect((await pide(PROPIETARIO)).body.en_curso).toBe(true)
    // Un pedido del panel en la cola cuya fila ya se dio por perdida no cuenta: no se va a hacer.
    db.agent_jobs = [{ id: 'j2', tipo: 'estudio-contenido', estado: 'pendiente', payload: { clientId: 'c1', origen: 'panel', estudioId: E1 }, created_at: hace(1) }]
    expect((await pide(PROPIETARIO)).body.en_curso).toBe(false)
  })

  it('sin estudios ni Instagram: null y desconectado', async () => {
    db.helm_estudio_contenido = []
    db.user_integrations = []
    const r = await pide(PROPIETARIO)
    expect(r.body).toMatchObject({ estudio: null, historial: [], en_curso: false, conectado: false, ultimo_error: null })
  })

  it('ver: { estudio } con la MISMA forma que el del GET, y solo del perfil comprobado', async () => {
    const r = await pide(PROPIETARIO, 'ver', { id: E1 })
    expect(r.statusCode).toBe(200)
    expect(r.body.estudio).toMatchObject({ id: E1, estudio: { resumen: 'viejo' } })
    const delGet = (await pide(PROPIETARIO)).body.estudio
    expect(Object.keys(r.body.estudio).sort()).toEqual(Object.keys(delGet).sort())
    // De otro perfil, o un id que no es un UUID: no existe aquí.
    expect((await pide(PROPIETARIO, 'ver', { id: OTRO })).statusCode).toBe(404)
    expect((await pide(PROPIETARIO, 'ver', { id: 'e1' })).statusCode).toBe(404)
    expect((await pide(PROPIETARIO, 'ver', { id: "' or 1=1 --" })).statusCode).toBe(404)
    expect((await pide(PROPIETARIO, 'ver')).statusCode).toBe(400)
  })

  it('un fallo interno no se le enseña al usuario: mensaje genérico (el detalle, al log)', async () => {
    rota.helm_estudio_contenido = { message: 'permission denied for table helm_estudio_contenido' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await pide(PROPIETARIO)
    expect(r.statusCode).toBe(500)
    expect(r.body.error).not.toMatch(/permission|helm_/)
    expect(log.mock.calls.flat().join(' ')).toContain('permission denied')
    log.mockRestore()
  })
})

describe('api/estudio-contenido · pedir uno', () => {
  it('con todo en orden, abre la fila en curso y encola el trabajo del panel que la rellena', async () => {
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(200)
    const fila = estudios().find(f => f.estado === 'en_curso')
    expect(fila).toMatchObject({ client_id: 'c1', modelo: 'claude-sonnet-5' })
    expect(r.body).toEqual({ encolado: true, id: fila.id })
    expect(encolaEstudio).toHaveBeenCalledWith('c1', { origen: 'panel', estudioId: fila.id })
    expect(exigirSaldo).toHaveBeenCalledTimes(1)
  })

  it('sin Instagram conectado: 400 sin_instagram', async () => {
    db.user_integrations[0].config = {}
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(400)
    expect(r.body).toMatchObject({ codigo: 'sin_instagram', error: expect.stringMatching(/Instagram/) })
    expect(encolaEstudio).not.toHaveBeenCalled()
  })

  it('con uno en marcha: 409 en_curso (una fila reciente o el de los lunes en la cola)', async () => {
    db.agent_jobs = [{ id: 'j1', tipo: 'estudio-contenido', estado: 'corriendo', payload: { clientId: 'c1', origen: 'auto' }, created_at: hace(2) }]
    expect((await pide(PROPIETARIO, 'ahora')).body).toMatchObject({ codigo: 'en_curso' })
    db.agent_jobs = []
    estudios().push({ id: crypto.randomUUID(), client_id: 'c1', generado_en: hace(3), estado: 'en_curso' })
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('en_curso')
    expect(encolaEstudio).not.toHaveBeenCalled()
  })

  it('doble clic: los dos POST a la vez, solo uno abre fila y encola; el otro, 409', async () => {
    const [a, b] = await Promise.all([pide(PROPIETARIO, 'ahora'), pide(PROPIETARIO, 'ahora')])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    expect(estudios().filter(f => f.estado === 'en_curso')).toHaveLength(1)
    expect(encolaEstudio).toHaveBeenCalledTimes(1)
  })

  it('el índice manda: si el otro clic abre su fila justo después de las comprobaciones, 409 y no se encola', async () => {
    // El otro POST cuela su fila mientras este mira el saldo.
    exigirSaldo.mockImplementationOnce(async () => {
      estudios().push({ id: crypto.randomUUID(), client_id: 'c1', generado_en: new Date().toISOString(), estado: 'en_curso' })
    })
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('en_curso')
    expect(estudios().filter(f => f.estado === 'en_curso')).toHaveLength(1)
    expect(encolaEstudio).not.toHaveBeenCalled()
  })

  it('si no se puede encolar, la fila no se queda en curso: pasa a error, y al usuario un mensaje genérico', async () => {
    encolaEstudio.mockRejectedValueOnce(new Error('No se pudo encolar el estudio: connection refused'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(500)
    expect(r.body.error).not.toMatch(/connection/)
    expect(estudios().some(f => f.estado === 'en_curso')).toBe(false)
    expect(estudios().at(-1)).toMatchObject({ estado: 'error', error: expect.stringMatching(/No se ha cobrado nada/) })
    log.mockRestore()
  })

  it('el de otro perfil en marcha no bloquea este', async () => {
    db.agent_jobs = [{ id: 'j1', tipo: 'estudio-contenido', estado: 'pendiente', payload: { clientId: 'c2', origen: 'auto' }, created_at: hace(1) }]
    estudios().push({ id: crypto.randomUUID(), client_id: 'c2', generado_en: hace(1), estado: 'en_curso' })
    expect((await pide(PROPIETARIO, 'ahora')).statusCode).toBe(200)
  })

  it('más de 3 al día: 429 tope_diario; el automático del lunes no cuenta', async () => {
    const job = (i, origen) => ({ id: `j${i}`, tipo: 'estudio-contenido', estado: 'hecho', payload: { clientId: 'c1', origen }, created_at: new Date(Date.now() - i * 1000).toISOString() })
    db.agent_jobs = [job(1, 'panel'), job(2, 'panel'), job(3, 'auto')]
    expect((await pide(PROPIETARIO, 'ahora')).statusCode).toBe(200)
    estudios().find(f => f.estado === 'en_curso').estado = 'listo'
    db.agent_jobs.push(job(4, 'panel'))
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(429)
    expect(r.body.codigo).toBe('tope_diario')
    expect(encolaEstudio).toHaveBeenCalledTimes(1)
  })

  it('los de ayer no cuentan para el tope de hoy', async () => {
    const ayer = new Date(Date.parse(inicioDiaMadrid()) - 60_000).toISOString()
    db.agent_jobs = [1, 2, 3].map(i => ({ id: `j${i}`, tipo: 'estudio-contenido', estado: 'hecho', payload: { clientId: 'c1', origen: 'panel' }, created_at: ayer }))
    expect((await pide(PROPIETARIO, 'ahora')).statusCode).toBe(200)
  })

  it('sin saldo en una agencia que paga: 402 sin_saldo, ni fila ni cola', async () => {
    cobro.saldo = 0
    const r = await pide(PROPIETARIO, 'ahora')
    expect(r.statusCode).toBe(402)
    expect(r.body).toMatchObject({ codigo: 'sin_saldo', error: expect.stringMatching(/créditos/) })
    expect(estudios().some(f => f.estado === 'en_curso')).toBe(false)
    expect(encolaEstudio).not.toHaveBeenCalled()
  })

  it('la agencia de la casa (sin_cobro) no paga: ni se le mira el saldo', async () => {
    cobro.paga = false
    cobro.saldo = 0
    expect((await pide(PROPIETARIO, 'ahora')).statusCode).toBe(200)
    expect(exigirSaldo).not.toHaveBeenCalled()
    expect(encolaEstudio).toHaveBeenCalledTimes(1)
  })

  it('pedirlo por GET no encola', async () => {
    expect((await pide(PROPIETARIO, 'ahora', { method: 'GET' })).statusCode).toBe(400)
    expect(encolaEstudio).not.toHaveBeenCalled()
  })
})

describe('api/estudio-contenido · el día de Madrid', () => {
  it('la medianoche de Madrid en UTC, con horario de verano y de invierno', () => {
    expect(inicioDiaMadrid(new Date('2026-10-27T10:00:00Z'))).toBe('2026-10-26T23:00:00.000Z')
    expect(inicioDiaMadrid(new Date('2026-07-15T10:00:00Z'))).toBe('2026-07-14T22:00:00.000Z')
    // Las 23:30 UTC del 26 ya son día 27 en Madrid.
    expect(inicioDiaMadrid(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-26T23:00:00.000Z')
  })
})
