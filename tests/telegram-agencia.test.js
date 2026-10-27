// El bot de Telegram de la agencia (api/telegram-agencia.js): quién puede
// hablarle, cómo se vincula, y que lo delicado no se haga sin el Aprobar de
// su dueño ni se haga dos veces. Sin red ni base: Supabase, Telegram, las
// herramientas y el bucle de Claude van simulados.
import crypto from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-del-bot-0123456789'
process.env.HELM_TELEGRAM_TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
process.env.HELM_TELEGRAM_SECRETO = 'secreto-del-webhook_de-prueba'
delete process.env.HELM_TELEGRAM_AGENCIAS
delete process.env.HELM_TELEGRAM_MODELO

const AG = { silvestre: 'a0000000-0000-4000-8000-000000000001', pp: 'a0000000-0000-4000-8000-000000000002' }
const SA = {
  alex: 'b0000000-0000-4000-8000-000000000001',
  otro: 'b0000000-0000-4000-8000-000000000002',
  pp: 'b0000000-0000-4000-8000-000000000003',
}
const PERFIL = {
  hugo: 'c0000000-0000-4000-8000-000000000001',
  dcc: 'c0000000-0000-4000-8000-000000000002',
  ajeno: 'c0000000-0000-4000-8000-000000000003',
  alex: 'c0000000-0000-4000-8000-000000000004',
  nuevo: 'c0000000-0000-4000-8000-000000000005',
}

// ── Base simulada ──────────────────────────────────────────────────────────
const db = {}
const consultadas = []
// Ganchos (al insertar en una tabla, una vez) y fallos (la tabla devuelve error).
const ganchos = {}
const fallos = {}
const PK = { helm_telegram_vinculos: 'superadmin_id', helm_telegram_conversaciones: 'tg_chat_id' }
const tabla = (t) => (db[t] ||= [])
const copia = (x) => (x == null ? x : structuredClone(x))
const igualA = (a, b) => (a == null || b == null ? a == b : String(a) === String(b))
function valor(fila, col) {
  const m = /^(\w+)->>(\w+)$/.exec(col)
  if (m) {
    const v = fila[m[1]]?.[m[2]]
    return v == null ? null : String(v)
  }
  return fila[col]
}

function consulta(t) {
  consultadas.push(t)
  const filtros = []
  let op = 'select'
  let datos = null
  let opciones = {}
  let columnas = '*'
  let devolver = false
  const pasa = (f) => filtros.every(fn => fn(f))
  const conEmbebidos = (f) => (columnas.includes('superadmins(')
    ? { ...f, superadmins: tabla('superadmins').find(s => s.id === f.superadmin_id) || null }
    : f)
  async function ejecuta(una) {
    if (fallos[t]) return { data: null, error: fallos[t] }
    if (op === 'insert' && ganchos[t]) {
      const gancho = ganchos[t]
      delete ganchos[t]
      await gancho(copia(datos))
    }
    const filas = tabla(t)
    let data = null
    if (op === 'select') data = filas.filter(pasa).map(f => copia(conEmbebidos(f)))
    else if (op === 'insert') {
      const nuevas = (Array.isArray(datos) ? datos : [datos])
        .map(d => ({ ...(PK[t] ? {} : { id: crypto.randomUUID() }), created_at: new Date().toISOString(), ...copia(d) }))
      filas.push(...nuevas)
      data = devolver ? copia(nuevas) : null
    } else if (op === 'update') {
      const tocadas = filas.filter(pasa)
      for (const f of tocadas) Object.assign(f, copia(datos))
      data = devolver ? copia(tocadas) : null
    } else if (op === 'upsert') {
      const clave = opciones.onConflict || PK[t] || 'id'
      for (const d of Array.isArray(datos) ? datos : [datos]) {
        const f = filas.find(x => igualA(x[clave], d[clave]))
        if (f) Object.assign(f, copia(d))
        else filas.push(copia(d))
      }
    } else if (op === 'delete') {
      db[t] = filas.filter(f => !pasa(f))
    }
    if (una) data = Array.isArray(data) ? (data[0] ?? null) : data
    return { data, error: null }
  }
  const q = {
    select(c = '*') { if (op === 'select') columnas = c; else devolver = true; return q },
    eq(c, v) { filtros.push(f => igualA(valor(f, c), v)); return q },
    gt(c, v) { filtros.push(f => valor(f, c) != null && String(valor(f, c)) > String(v)); return q },
    gte(c, v) { filtros.push(f => valor(f, c) != null && String(valor(f, c)) >= String(v)); return q },
    in(c, vs) { filtros.push(f => vs.some(v => igualA(valor(f, c), v))); return q },
    is(c, v) { filtros.push(f => (v === null ? valor(f, c) == null : valor(f, c) === v)); return q },
    not(c) { filtros.push(f => valor(f, c) != null); return q },
    order() { return q },
    limit() { return q },
    insert(d) { op = 'insert'; datos = d; return q },
    update(d) { op = 'update'; datos = d; return q },
    upsert(d, o) { op = 'upsert'; datos = d; opciones = o || {}; return q },
    delete() { op = 'delete'; return q },
    maybeSingle: () => ejecuta(true),
    single: () => ejecuta(true),
    then: (ok, ko) => ejecuta(false).then(ok, ko),
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t), rpc: async () => ({ data: null, error: null }) } }))

// ── Telegram simulado (lo que no habla con la red se queda el de verdad) ───
const enviados = []
const editados = []
const callbacks = []
const registrarWebhook = vi.fn(async () => true)
const botAgencia = vi.fn(async () => ({ botId: 123456789, username: 'Helm_silvestre_bot', firstName: 'HELM' }))
const infoWebhook = vi.fn(async () => ({ url: 'https://helm.example/api/telegram-agencia?action=webhook', pendientes: 0, ultimoError: null }))
vi.mock('../api/_lib/telegram.js', async (original) => ({
  ...(await original()),
  enviarMensaje: async (_token, chatId, texto) => { enviados.push({ chatId, texto }); return 1 },
  enviarConBotones: async (_token, chatId, texto, botones, opciones) => { enviados.push({ chatId, texto, botones, plano: Boolean(opciones?.plano) }); return { message_id: 1000 + enviados.length } },
  responderCallback: async (_token, id, texto) => { callbacks.push({ id, texto }); return true },
  editarMensaje: async (_token, chatId, messageId, texto, _botones, opciones) => { editados.push({ chatId, messageId, texto, plano: Boolean(opciones?.plano) }); return true },
  accionEscribiendo: async () => null,
  botAgencia: (...a) => botAgencia(...a),
  infoWebhook: (...a) => infoWebhook(...a),
  registrarWebhook: (...a) => registrarWebhook(...a),
  publicarComandos: async () => null,
}))

// ── El alcance de la agencia, como lo da el conector ───────────────────────
vi.mock('../api/mcp/[token].js', () => ({
  ESCRIBEN: [],
  DEL_CLIENTE: [],
  herramientasDe: () => [],
  ejecutaHerramienta: async () => ({ ok: false, ensayo: false, args: {}, resultado: null, texto: 'no' }),
  alcanceDesdeContexto: async ({ agenciaId }, { origen, quien } = {}) => {
    const ag = tabla('agencias').find(a => a.id === agenciaId)
    if (!ag) return null
    const perfiles = tabla('clients').filter(c => c.agencia_id === agenciaId && c.active).map(({ id, slug, name }) => ({ id, slug, name }))
    return { agenciaId, nombre: ag.nombre, perfiles, origen, quien }
  },
}))

// ── Herramientas: una que lee y una delicada ───────────────────────────────
// El reconocimiento del perfil (resolverPerfil, perfilesDeAgencia) es el de
// verdad: con marcas, siglas y palabras sueltas, como en producción.
const NO_SE_PUEDE_TXT = 'No se puede hacer tal cual: '
const leer = vi.fn(async () => ({ ok: true, texto: '{"guiones":[]}' }))
const programar = vi.fn(async (input) => ({ ok: true, texto: JSON.stringify({ hecho: `Programados ${input.guiones.length} guiones` }) }))
const describirGuiones = async (input) => {
  if (!input.guiones?.length) return `${NO_SE_PUEDE_TXT}faltan los guiones.`
  if (input.guiones[0].titulo === 'Ya estaba') return 'El guion ya estaba programado. No hace falta hacer nada.'
  return `Programar ${input.guiones.length} guion(es) en ${input.perfil}`
}
const herramientasBot = vi.fn(async () => [
  { name: 'calendario', description: 'Lee el calendario', input_schema: { type: 'object', properties: { perfil: { type: 'string' } } }, delicada: false, ejecutar: leer },
  {
    name: 'programar_guiones', description: 'Guarda guiones', input_schema: { type: 'object', properties: { perfil: { type: 'string' }, guiones: { type: 'array' } } },
    delicada: true, ejecutar: programar, describir: (...a) => describirGuiones(...a),
  },
])
let sistemas = 0
const sistemaBot = vi.fn(() => `SISTEMA ${++sistemas}`)
vi.mock('../api/_lib/bot-herramientas.js', async (original) => {
  const real = await original()
  return {
    herramientasBot: (...a) => herramientasBot(...a),
    sistemaBot: (...a) => sistemaBot(...a),
    resolverPerfil: real.resolverPerfil,
    perfilesDeAgencia: real.perfilesDeAgencia,
    esAccionVacia: real.esAccionVacia,
    NO_SE_PUEDE: real.NO_SE_PUEDE,
  }
})
// Lo que arrastra bot-herramientas y no pinta nada aquí.
vi.mock('../api/_lib/equipo.js', () => ({
  AGENTES_LANZABLES: ['director', 'investigador', 'analista', 'productor', 'comercial', 'informe', 'guionista', 'editor', 'programador', 'virales'],
  encolaAgente: async () => {},
  tokensDeHoy: async () => 0,
}))
// Y lo que arrastra api/telegram.js (el bot de cada perfil), del que solo se prueba la guarda.
vi.mock('../api/chat.js', () => ({ responderMensaje: async () => ({ respuesta: '' }), COMMANDS: [] }))
vi.mock('../api/_lib/llm.js', () => ({ proveedorDe: () => 'claude' }))

// ── El bucle de Claude: turnoAgente simulado, el resto el de verdad ────────
const turnoAgente = vi.fn()
vi.mock('../api/_lib/claude-agente.js', async (original) => ({ ...(await original()), turnoAgente: (...a) => turnoAgente(...a) }))
vi.mock('../api/_lib/creditos.js', () => ({ claveHelm: () => 'clave-de-helm', exigirSaldo: async () => {}, cobrar: async () => {} }))

const { default: handler } = await import('../api/telegram-agencia.js')
const { signJwt } = await import('../api/_lib/auth.js')
const { RECHAZADA } = await import('../api/_lib/claude-agente.js')
const { notificar } = await import('../api/_lib/notificar.js')
const { contexto, anotar } = await import('../api/_lib/contexto.js')
const { NO_SE_PUEDE } = await import('../api/_lib/bot-herramientas.js')
const { default: handlerPerfil } = await import('../api/telegram.js')
const TG = await vi.importActual('../api/_lib/telegram.js')

// ── Ayudas ─────────────────────────────────────────────────────────────────
function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader() {},
  }
}
let updateId = 1
let tgId = 5000
const nuevoTg = () => ++tgId
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex')
const enUnRato = (min) => new Date(Date.now() + min * 60_000).toISOString()

const CABECERA = { 'x-telegram-bot-api-secret-token': process.env.HELM_TELEGRAM_SECRETO }
async function webhook(update, headers = CABECERA) {
  const res = respuesta()
  await handler({ method: 'POST', query: { action: 'webhook' }, headers, body: { update_id: updateId++, ...update } }, res)
  return res
}
const mensaje = (from, text) => webhook({ message: { message_id: 1, date: 0, text, from: { id: from, first_name: 'Alex', username: 'alex' }, chat: { id: from, type: 'private' } } })
const boton = (from, data, chat = from) => webhook({ callback_query: { id: `cq-${updateId}`, from: { id: from }, data, message: { message_id: 77, chat: { id: chat, type: 'private' } } } })

let ip = 0
async function panel(method, action, superadminId, query = {}) {
  const token = await signJwt({ sub: superadminId, superadmin: true, role: 'superadmin', email: `${superadminId}@x.es` })
  const res = respuesta()
  await handler({ method, query: { action, ...query }, body: {}, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `10.1.0.${++ip}` }, socket: {} }, res)
  return res
}

function vincula(superadminId, tg, agenciaId = AG.silvestre) {
  tabla('helm_telegram_vinculos').push({
    superadmin_id: superadminId, agencia_id: agenciaId, tg_user_id: tg, tg_chat_id: tg, tg_nombre: 'Alex @alex',
    vinculado_at: new Date().toISOString(), codigo_hash: null, codigo_caduca: null,
  })
}
const vinculoDe = (superadminId) => tabla('helm_telegram_vinculos').find(v => v.superadmin_id === superadminId)
const aprobaciones = () => tabla('helm_telegram_aprobaciones')
const conversacion = (chat) => tabla('helm_telegram_conversaciones').find(c => String(c.tg_chat_id) === String(chat))
const ultimo = (chat) => enviados.filter(e => e.chatId === chat).at(-1)?.texto || ''

const USO = {
  id: 'toolu_1', name: 'programar_guiones',
  input: { perfil: 'enformaconhugo', guiones: [{ fecha: '2026-10-19', titulo: 'Sentadilla', tipo: 'viralidad', guion: 'Hoy, la sentadilla…' }] },
}
const USO_DCC = {
  id: 'toolu_2', name: 'programar_guiones',
  input: { perfil: 'DCC', guiones: [{ fecha: '2026-10-20', titulo: 'Plano secuencia', tipo: 'viralidad', guion: 'El plano…' }] },
}
const conPerfil = (uso, perfil, id = uso.id) => ({ ...uso, id, input: { ...uso.input, perfil } })
const OCUPADO = 'Aún estoy con lo anterior; cuando te conteste, vuelve a escribírmelo.'

// El primer turno se para en las herramientas delicadas; el segundo (al reanudar) contesta.
function turnoQueSePara(...usos) {
  if (!usos.length) usos = [USO]
  turnoAgente.mockImplementationOnce(async ({ messages }) => {
    const historial = [...messages, { role: 'assistant', content: [{ type: 'thinking', thinking: 'Lo programo.', signature: 'firma' }, ...usos.map(u => ({ type: 'tool_use', ...u }))] }]
    return { tipo: 'pendiente', texto: '', messages: historial, resultados: [], pendientes: usos }
  })
  turnoAgente.mockImplementationOnce(async ({ messages }) => ({ tipo: 'fin', texto: 'Listo: guion programado para el lunes.', messages }))
}
const fin = (texto) => async (o) => ({ tipo: 'fin', texto, messages: o.messages })

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.agencias = [
    { id: AG.silvestre, nombre: 'Silvestre AI', slug: 'silvestreai' },
    { id: AG.pp, nombre: 'pp', slug: 'pp' },
  ]
  db.superadmins = [
    { id: SA.alex, name: 'Alex', email: 'alex@x.es', active: true, agencia_id: AG.silvestre, plataforma: true },
    { id: SA.otro, name: 'Otra', email: 'otra@x.es', active: true, agencia_id: AG.silvestre, plataforma: false },
    { id: SA.pp, name: 'Pepe', email: 'pepe@x.es', active: true, agencia_id: AG.pp, plataforma: false },
  ]
  db.clients = [
    { id: PERFIL.hugo, slug: 'enformaconhugo', name: 'En Forma con Hugo', agencia_id: AG.silvestre, active: true },
    { id: PERFIL.dcc, slug: 'detras-de-camra', name: 'Detrás de Cámaras', agencia_id: AG.silvestre, active: true },
    { id: PERFIL.ajeno, slug: 'pp-perfil', name: 'Perfil de pp', agencia_id: AG.pp, active: true },
  ]
  consultadas.length = 0
  for (const k of Object.keys(ganchos)) delete ganchos[k]
  for (const k of Object.keys(fallos)) delete fallos[k]
  registrarWebhook.mockClear()
  botAgencia.mockClear()
  infoWebhook.mockClear()
  sistemas = 0
  enviados.length = 0
  editados.length = 0
  callbacks.length = 0
  turnoAgente.mockReset()
  leer.mockClear()
  programar.mockClear()
  herramientasBot.mockClear()
  sistemaBot.mockClear()
})

// ── El webhook ─────────────────────────────────────────────────────────────
describe('la puerta del webhook', () => {
  it('con el secreto mal, o sin él, 401 y no se toca nada', async () => {
    const casi = `${process.env.HELM_TELEGRAM_SECRETO.slice(0, -1)}X`
    for (const headers of [{ 'x-telegram-bot-api-secret-token': 'otro-secreto' }, { 'x-telegram-bot-api-secret-token': casi }, { 'x-telegram-bot-api-secret-token': '' }, {}]) {
      const res = await webhook({ message: { message_id: 1, text: '/start ABCD-EFGH', from: { id: 1 }, chat: { id: 1, type: 'private' } } }, headers)
      expect(res.statusCode).toBe(401)
    }
    expect(consultadas).toEqual([])
    expect(enviados).toEqual([])
    expect(turnoAgente).not.toHaveBeenCalled()
  })

  it('el mismo update dos veces se atiende una', async () => {
    const tg = nuevoTg()
    const update = { update_id: 999_001, message: { message_id: 1, text: 'hola', from: { id: tg }, chat: { id: tg, type: 'private' } } }
    for (let i = 0; i < 2; i++) {
      const res = respuesta()
      await handler({ method: 'POST', query: { action: 'webhook' }, headers: CABECERA, body: update }, res)
      expect(res.statusCode).toBe(200)
    }
    expect(enviados).toHaveLength(1)
  })

  it('en un grupo no contesta, ni a un vinculado', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    await webhook({ message: { message_id: 1, text: 'hola', from: { id: tg }, chat: { id: -100, type: 'group' } } })
    expect(enviados).toEqual([])
    expect(turnoAgente).not.toHaveBeenCalled()
  })
})

// ── Vincular ───────────────────────────────────────────────────────────────
describe('vincular un Telegram', () => {
  it('con el código bueno del panel: queda vinculada la persona y el código no vale otra vez', async () => {
    const r = await panel('POST', 'codigo', SA.alex)
    expect(r.statusCode).toBe(200)
    const { codigo, enlace, caduca } = r.body
    expect(codigo).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(enlace).toBe(`https://t.me/Helm_silvestre_bot?start=${codigo}`)
    expect(new Date(caduca).getTime()).toBeGreaterThan(Date.now())
    // En la base solo el hash.
    expect(JSON.stringify(tabla('helm_telegram_vinculos'))).not.toContain(codigo)
    expect(vinculoDe(SA.alex).codigo_hash).toBe(sha(codigo))

    const tg = nuevoTg()
    await mensaje(tg, `/start ${codigo}`)
    expect(vinculoDe(SA.alex)).toMatchObject({ tg_user_id: tg, tg_chat_id: tg, agencia_id: AG.silvestre, codigo_hash: null, codigo_caduca: null })
    expect(ultimo(tg)).toContain('Vinculado')
    expect(tabla('audit_logs').map(a => a.action)).toContain('telegram.agencia_vinculada')

    // Otra persona con el mismo código: nada.
    const intruso = nuevoTg()
    await mensaje(intruso, `/vincular ${codigo.toLowerCase()}`)
    expect(vinculoDe(SA.alex).tg_user_id).toBe(tg)
    expect(ultimo(intruso)).toContain('no vale')

    const estado = await panel('GET', 'estado', SA.alex)
    expect(estado.body).toMatchObject({
      bot: { username: 'Helm_silvestre_bot', nombre: 'HELM' }, permitido: true, plataforma: true,
      vinculado: { tg_nombre: 'Alex @alex' },
      webhook: { url: 'https://helm.example/api/telegram-agencia?action=webhook', pendientes: 0, ultimoError: null },
    })
  })

  it('escrito a mano, con espacios y en minúsculas, también vale', async () => {
    tabla('helm_telegram_vinculos').push({ superadmin_id: SA.otro, agencia_id: AG.silvestre, codigo_hash: sha('ABCD-EFGH'), codigo_caduca: enUnRato(10) })
    const tg = nuevoTg()
    await mensaje(tg, '/vincular abcd efgh')
    expect(vinculoDe(SA.otro).tg_user_id).toBe(tg)
  })

  it('con un código caducado no se vincula', async () => {
    tabla('helm_telegram_vinculos').push({ superadmin_id: SA.alex, agencia_id: AG.silvestre, codigo_hash: sha('ABCD-EFGH'), codigo_caduca: enUnRato(-1) })
    const tg = nuevoTg()
    await mensaje(tg, '/vincular ABCD-EFGH')
    expect(vinculoDe(SA.alex).tg_user_id).toBeUndefined()
    expect(ultimo(tg)).toContain('caducado')
  })

  it('con un código de otra agencia (sin el bot) no se vincula, y el panel ni lo da', async () => {
    const r = await panel('POST', 'codigo', SA.pp)
    expect(r.statusCode).toBe(403)
    // Aunque lo hubiera (de cuando sí lo tenía), no sirve.
    tabla('helm_telegram_vinculos').push({ superadmin_id: SA.pp, agencia_id: AG.pp, codigo_hash: sha('WXYZ-2345'), codigo_caduca: enUnRato(10) })
    const tg = nuevoTg()
    await mensaje(tg, '/start WXYZ-2345')
    expect(vinculoDe(SA.pp).tg_user_id).toBeUndefined()
    expect(vinculoDe(SA.pp).codigo_hash).toBeNull()
    expect(ultimo(tg)).toContain('no puede usar este bot')
  })

  it('un código inventado no vincula a nadie', async () => {
    const tg = nuevoTg()
    await mensaje(tg, '/vincular QQQQ-QQQQ')
    expect(tabla('helm_telegram_vinculos')).toEqual([])
    expect(ultimo(tg)).toContain('no vale')
  })
})

// ── Desconocidos ───────────────────────────────────────────────────────────
describe('quien no está vinculado', () => {
  it('no llega a la IA: solo el texto fijo de que es privado', async () => {
    const tg = nuevoTg()
    for (const texto of ['hola', '¿cuánto ha cobrado Hugo este mes?', '/perfiles', '/start']) await mensaje(tg, texto)
    expect(turnoAgente).not.toHaveBeenCalled()
    expect(herramientasBot).not.toHaveBeenCalled()
    expect(enviados).toHaveLength(4)
    for (const e of enviados) expect(e.texto).toContain('Este bot es privado')
  })

  it('a partir del quinto mensaje en un minuto, ni eso', async () => {
    const tg = nuevoTg()
    for (let i = 0; i < 8; i++) await mensaje(tg, `intento ${i}`)
    expect(enviados).toHaveLength(5)
  })

  it('una cuenta desactivada pierde el vínculo en su siguiente mensaje', async () => {
    const tg = nuevoTg()
    vincula(SA.otro, tg)
    db.superadmins.find(s => s.id === SA.otro).active = false
    await mensaje(tg, 'hola')
    expect(vinculoDe(SA.otro)).toBeUndefined()
    expect(ultimo(tg)).toContain('te he desvinculado')
    expect(turnoAgente).not.toHaveBeenCalled()
  })
})

// ── Conversación ───────────────────────────────────────────────────────────
describe('hablar con el bot', () => {
  it('una pregunta: Claude con las herramientas de la agencia, la respuesta y el historial', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoAgente.mockImplementationOnce(async (o) => {
      // Lo que lee va directo; lo delicado, a aprobar.
      expect(await o.ejecutar('calendario', { perfil: 'enformaconhugo' })).toEqual({ ok: true, texto: '{"guiones":[]}' })
      expect(o.esDelicada('calendario', {})).toBe(false)
      expect(o.esDelicada('programar_guiones', {})).toBe(true)
      expect((await o.ejecutar('borrar_todo', {})).ok).toBe(false)
      return { tipo: 'fin', texto: 'Hugo no tiene nada programado esta semana.', messages: o.messages }
    })
    await mensaje(tg, '¿Qué tiene Hugo esta semana?')

    const [args] = turnoAgente.mock.calls[0]
    expect(args).toMatchObject({ apiKey: 'clave-de-helm', model: 'claude-sonnet-5', system: 'SISTEMA 1' })
    expect(args.messages.at(-1)).toEqual({ role: 'user', content: '¿Qué tiene Hugo esta semana?' })
    for (const t of args.tools) expect(Object.keys(t).sort()).toEqual(['description', 'input_schema', 'name'])
    // Alcance de agencia: los perfiles activos de Silvestre AI y ninguno más.
    const [ctx] = herramientasBot.mock.calls[0]
    expect(ctx.agenciaId).toBe(AG.silvestre)
    expect(ctx.alcance.perfiles.map(p => p.slug)).toEqual(['enformaconhugo', 'detras-de-camra'])
    expect(ctx.superadmin).toEqual({ id: SA.alex, email: 'alex@x.es', nombre: 'Alex' })

    expect(ultimo(tg)).toBe('Hugo no tiene nada programado esta semana.')
    expect(conversacion(tg).historial).toEqual([
      { role: 'user', content: '¿Qué tiene Hugo esta semana?' },
      { role: 'assistant', content: 'Hugo no tiene nada programado esta semana.' },
    ])

    // El siguiente mensaje lleva el historial delante.
    turnoAgente.mockImplementationOnce(async (o) => ({ tipo: 'fin', texto: 'Vale.', messages: o.messages }))
    await mensaje(tg, '¿Y DCC?')
    expect(turnoAgente.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: '¿Qué tiene Hugo esta semana?' },
      { role: 'assistant', content: 'Hugo no tiene nada programado esta semana.' },
      { role: 'user', content: '¿Y DCC?' },
    ])
  })

  it('/nuevo olvida el historial', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    tabla('helm_telegram_conversaciones').push({ tg_chat_id: tg, superadmin_id: SA.alex, historial: [{ role: 'user', content: 'x' }], turno: null })
    await mensaje(tg, '/nuevo')
    expect(conversacion(tg)).toBeUndefined()
    expect(turnoAgente).not.toHaveBeenCalled()
  })

  it('/perfiles enseña solo los de su agencia', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    await mensaje(tg, '/perfiles')
    expect(ultimo(tg)).toContain('En Forma con Hugo')
    expect(ultimo(tg)).toContain('Detrás de Cámaras')
    expect(ultimo(tg)).not.toContain('pp-perfil')
  })

  it('los errores de Claude se cuentan claros y sin tripas', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    const casos = [
      [Object.assign(new Error('Te has quedado sin créditos.'), { statusCode: 402 }), 'sin créditos'],
      [Object.assign(new Error('Anthropic rechazó la petición: Your credit balance is too low to access the Anthropic API. req_011CXYZ'), { statusCode: 502 }), 'sin saldo'],
      [Object.assign(new Error('Claude se ha negado (refusal) en el paso 3'), { statusCode: 422 }), 'de otra forma'],
      [new Error('connect ECONNREFUSED 127.0.0.1:54321'), 'fallo por mi lado'],
    ]
    for (const [err, esperado] of casos) {
      turnoAgente.mockRejectedValueOnce(err)
      await mensaje(tg, 'hola')
      expect(ultimo(tg)).toContain(esperado)
      expect(ultimo(tg)).not.toMatch(/req_|ECONNREFUSED|refusal|Anthropic API/)
    }
  })
})

// ── Lo que lee el panel ────────────────────────────────────────────────────
describe('el estado que lee el panel', () => {
  it('con solo=vinculo: si estás vinculado, sin preguntar nada a Telegram', async () => {
    vincula(SA.alex, nuevoTg())
    const r = await panel('GET', 'estado', SA.alex, { solo: 'vinculo' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ vinculado: { tg_nombre: 'Alex @alex', vinculado_at: expect.any(String) }, permitido: true, plataforma: true })
    expect(botAgencia).not.toHaveBeenCalled()
    expect(infoWebhook).not.toHaveBeenCalled()
  })

  it('a una agencia sin el bot no se le cuenta nada del bot ni se llama a Telegram', async () => {
    const r = await panel('GET', 'estado', SA.pp)
    expect(r.body).toMatchObject({ bot: null, webhook: null, vinculado: null, permitido: false, plataforma: false })
    expect(r.body.configurado).toBeUndefined()
    expect(botAgencia).not.toHaveBeenCalled()
    expect(infoWebhook).not.toHaveBeenCalled()
  })

  it('el webhook: si es el de este HELM con las pulsaciones, la fecha del último fallo y la hora del servidor', async () => {
    const antes = process.env.HELM_PUBLIC_URL
    process.env.HELM_PUBLIC_URL = 'https://helm.example/'
    try {
      infoWebhook.mockResolvedValueOnce({
        url: 'https://helm.example/api/telegram-agencia?action=webhook', pendientes: 0,
        ultimoError: 'Connection refused', ultimoErrorFecha: '2026-10-15T08:00:00.000Z', tipos: ['message', 'callback_query'],
      })
      let r = await panel('GET', 'estado', SA.otro)
      expect(r.body).toMatchObject({
        configurado: true, permitido: true, plataforma: false,
        webhook: { propio: true, ultimoError: 'Connection refused', ultimoErrorFecha: '2026-10-15T08:00:00.000Z' },
      })
      expect(Date.parse(r.body.ahora)).toBeGreaterThan(0)

      // Registrado sin las pulsaciones de los botones: no vale.
      infoWebhook.mockResolvedValueOnce({ url: 'https://helm.example/api/telegram-agencia?action=webhook', pendientes: 0, ultimoError: null, tipos: ['message'] })
      r = await panel('GET', 'estado', SA.otro)
      expect(r.body.webhook.propio).toBe(false)

      // Otro HELM con la misma ruta, tampoco.
      infoWebhook.mockResolvedValueOnce({ url: 'https://staging.example/api/telegram-agencia?action=webhook', pendientes: 0, ultimoError: null, tipos: null })
      r = await panel('GET', 'estado', SA.otro)
      expect(r.body.webhook.propio).toBe(false)
    } finally {
      if (antes == null) delete process.env.HELM_PUBLIC_URL
      else process.env.HELM_PUBLIC_URL = antes
    }
  })

  it('el código dice cuánto le queda, para que la cuenta atrás no dependa del reloj del navegador', async () => {
    const r = await panel('POST', 'codigo', SA.alex)
    expect(r.body).toMatchObject({ segundos: 15 * 60, enlace: `https://t.me/Helm_silvestre_bot?start=${r.body.codigo}` })
    expect(Date.parse(r.body.caduca) - Date.parse(r.body.ahora)).toBeGreaterThan(14 * 60_000)
  })
})

// ── Aprobar y rechazar ─────────────────────────────────────────────────────
describe('lo delicado pide permiso', () => {
  it('turno con algo pendiente → aprobación → se hace una vez y Claude sigue donde estaba', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla para el lunes')

    // Se ha parado: nada escrito, una aprobación con sus botones.
    expect(programar).not.toHaveBeenCalled()
    expect(aprobaciones()).toHaveLength(1)
    const [a] = aprobaciones()
    expect(a).toMatchObject({
      estado: 'pendiente', herramienta: 'programar_guiones', tool_use_id: 'toolu_1', client_id: PERFIL.hugo,
      superadmin_id: SA.alex, agencia_id: AG.silvestre, resumen: 'Programar 1 guion(es) en enformaconhugo', args: USO.input,
    })
    const minutos = (new Date(a.caduca).getTime() - Date.now()) / 60_000
    expect(minutos).toBeGreaterThan(29)
    expect(minutos).toBeLessThanOrEqual(30)
    const tarjeta = enviados.at(-1)
    expect(tarjeta.texto).toContain('Programar 1 guion(es) en enformaconhugo')
    expect(tarjeta.botones).toEqual([[
      { text: '✅ Aprobar', callback_data: `a:${a.id}` },
      { text: '❌ Rechazar', callback_data: `r:${a.id}` },
    ]])
    expect(a.tg_message_id).toBe(1000 + enviados.length)
    expect(conversacion(tg).turno).toMatchObject({ system: 'SISTEMA 1', model: 'claude-sonnet-5', pendientes: [USO], aprobaciones: [a.id] })

    // Mientras tanto, otro mensaje no empieza otro turno.
    await mensaje(tg, '¿Y DCC?')
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    expect(ultimo(tg)).toContain('apruebas o rechazas')

    // Aprobar, dos veces seguidas.
    await boton(tg, `a:${a.id}`)
    await boton(tg, `a:${a.id}`)
    expect(programar).toHaveBeenCalledTimes(1)
    // Con la tarjeta que vio el dueño, para que la herramienta compruebe que no ha cambiado.
    expect(programar).toHaveBeenCalledWith(USO.input, { resumenAprobado: 'Programar 1 guion(es) en enformaconhugo' })
    expect(callbacks.map(c => c.texto)).toEqual(['Aprobada', 'Ya estaba decidida.'])
    expect(aprobaciones()[0]).toMatchObject({ estado: 'ejecutada', resultado: { ok: true, texto: '{"hecho":"Programados 1 guiones"}' } })
    expect(editados.at(-1).texto).toContain('Aprobada y hecha')

    // Y Claude sigue: el mismo system, el pensamiento tal cual y el resultado de la herramienta.
    expect(turnoAgente).toHaveBeenCalledTimes(2)
    const [reanudado] = turnoAgente.mock.calls[1]
    expect(reanudado.system).toBe('SISTEMA 1')
    expect(reanudado.messages.at(-2).content[0]).toEqual({ type: 'thinking', thinking: 'Lo programo.', signature: 'firma' })
    expect(reanudado.messages.at(-1)).toEqual({
      role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"hecho":"Programados 1 guiones"}' }],
    })
    expect(ultimo(tg)).toBe('Listo: guion programado para el lunes.')
    expect(conversacion(tg).turno).toBeNull()
    expect(conversacion(tg).historial).toEqual([
      { role: 'user', content: 'Programa en Hugo el guion de la sentadilla para el lunes' },
      { role: 'assistant', content: 'Listo: guion programado para el lunes.' },
    ])
    expect(tabla('audit_logs').map(x => x.action)).toContain('telegram.accion_aprobada')
  })

  it('la tarjeta sale sin formato (se ve tal cual lo que se escribe) y, antes, lo que Claude explicó', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoAgente.mockImplementationOnce(async ({ messages }) => ({
      tipo: 'pendiente', texto: 'Te propongo este guion para el lunes:', resultados: [], pendientes: [USO],
      messages: [...messages, { role: 'assistant', content: [{ type: 'text', text: 'Te propongo este guion para el lunes:' }, { type: 'tool_use', ...USO }] }],
    }))
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [explicacion, tarjeta] = enviados.slice(-2)
    expect(explicacion.texto).toBe('Te propongo este guion para el lunes:')
    expect(tarjeta).toMatchObject({ plano: true })
    expect(tarjeta.texto).toMatch(/^🟡 ¿Lo hago\?\n\nProgramar 1 guion\(es\) en enformaconhugo\n\nCaduca en 30 minutos\.$/)

    await boton(tg, `r:${aprobaciones()[0].id}`)
    expect(editados.at(-1)).toMatchObject({ plano: true })
  })

  it('rechazada: no se hace y Claude lo sabe', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    await boton(tg, `r:${a.id}`)
    expect(programar).not.toHaveBeenCalled()
    expect(aprobaciones()[0].estado).toBe('rechazada')
    expect(editados.at(-1).texto).toContain('Rechazada')
    const [reanudado] = turnoAgente.mock.calls[1]
    expect(reanudado.messages.at(-1).content).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', content: RECHAZADA, is_error: true }])
  })

  it('el botón pulsado por otro usuario no aprueba nada', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()

    // Un desconocido, desde su chat o desde el del dueño.
    await boton(nuevoTg(), `a:${a.id}`)
    const ajeno = nuevoTg()
    await boton(ajeno, `a:${a.id}`, tg)
    // Otro administrador de la misma agencia, vinculado con su propio Telegram.
    const otra = nuevoTg()
    vincula(SA.otro, otra)
    await boton(otra, `a:${a.id}`)
    await boton(otra, `a:${a.id}`, tg)

    expect(programar).not.toHaveBeenCalled()
    expect(aprobaciones()[0].estado).toBe('pendiente')
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    expect(callbacks).toHaveLength(4)
    for (const c of callbacks) expect(c.texto).toBe('Esta acción no es tuya.')
  })

  it('caducada: el botón ya no hace nada, y el siguiente mensaje empieza de nuevo con nota en el historial', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    a.caduca = enUnRato(-1)
    await boton(tg, `a:${a.id}`)
    expect(programar).not.toHaveBeenCalled()
    expect(callbacks.at(-1).texto).toContain('caducado')

    turnoAgente.mockReset()
    turnoAgente.mockImplementationOnce(async (o) => ({ tipo: 'fin', texto: 'Dime.', messages: o.messages }))
    await mensaje(tg, 'Olvídalo, ¿qué tal DCC?')
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    expect(aprobaciones()[0].estado).toBe('caducada')
    expect(ultimo(tg)).toBe('Dime.')
    // Nada se hizo: sistema nuevo, y en el historial la petición y en qué quedó.
    const [nuevo] = turnoAgente.mock.calls[0]
    expect(nuevo.system).toBe('SISTEMA 2')
    expect(nuevo.messages).toEqual([
      { role: 'user', content: 'Programa en Hugo el guion de la sentadilla' },
      { role: 'assistant', content: '(Quedó pendiente de tu aprobación:\n• programar_guiones: caducó sin hacerse)' },
      { role: 'user', content: 'Olvídalo, ¿qué tal DCC?' },
    ])
  })

  it('un perfil que deja de ser de la agencia antes de aprobar no se toca', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    db.clients.find(c => c.id === PERFIL.hugo).agencia_id = AG.pp
    const [a] = aprobaciones()
    await boton(tg, `a:${a.id}`)
    expect(programar).not.toHaveBeenCalled()
    expect(aprobaciones()[0]).toMatchObject({ estado: 'fallida', resultado: { ok: false } })
    const [reanudado] = turnoAgente.mock.calls[1]
    expect(reanudado.messages.at(-1).content[0]).toMatchObject({ tool_use_id: 'toolu_1', is_error: true })
  })
})

// ── El perfil de lo que se aprueba ─────────────────────────────────────────
describe('lo aprobado va al perfil que enseñó la tarjeta', () => {
  it('un perfil nombrado por su marca («RastroPro», «Rastro Pro») se aprueba y se hace', async () => {
    db.clients.push({ id: PERFIL.alex, slug: 'alexsilvestre', name: 'Alex Silvestre', brand_name: 'RastroPro', agencia_id: AG.silvestre, active: true })
    for (const nombre of ['RastroPro', 'Rastro Pro']) {
      db.helm_telegram_aprobaciones = []
      db.helm_telegram_vinculos = []
      programar.mockClear()
      const tg = nuevoTg()
      vincula(SA.alex, tg)
      turnoQueSePara(conPerfil(USO, nombre))
      await mensaje(tg, `Programa en ${nombre} el guion de la sentadilla`)
      const [a] = aprobaciones()
      // El texto de Claude se cambia por el slug y el id del perfil al que lleva.
      expect(a).toMatchObject({ client_id: PERFIL.alex, args: { perfil: 'alexsilvestre' }, resumen: 'Programar 1 guion(es) en alexsilvestre' })
      await boton(tg, `a:${a.id}`)
      expect(programar).toHaveBeenCalledTimes(1)
      expect(programar.mock.calls[0][0]).toEqual({ ...USO.input, perfil: 'alexsilvestre' })
      expect(aprobaciones()[0].estado).toBe('ejecutada')
    }
    // El prompt también lleva las marcas.
    expect(sistemaBot.mock.calls[0][0].perfiles).toContainEqual(expect.objectContaining({ slug: 'alexsilvestre', marca: 'RastroPro' }))
  })

  it('un perfil nuevo que se llame justo como lo dijo Claude no se queda con la acción', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara(conPerfil(USO, 'hugo'))
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    expect(a).toMatchObject({ client_id: PERFIL.hugo, args: { perfil: 'enformaconhugo' } })
    db.clients.push({ id: PERFIL.nuevo, slug: 'hugo', name: 'Hugo', agencia_id: AG.silvestre, active: true })
    await boton(tg, `a:${a.id}`)
    expect(programar.mock.calls[0][0]).toEqual({ ...USO.input, perfil: 'enformaconhugo' })
  })

  it('sin perfil y con un solo perfil en la agencia, se fija ese', async () => {
    db.clients = db.clients.filter(c => c.id !== PERFIL.dcc)
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    const { perfil: _p, ...sinPerfil } = USO.input
    turnoQueSePara({ ...USO, input: sinPerfil })
    await mensaje(tg, 'Programa el guion de la sentadilla')
    expect(aprobaciones()[0]).toMatchObject({ client_id: PERFIL.hugo, args: { perfil: 'enformaconhugo' } })
  })

  it('si al aprobar el slug fijado ya lleva a otro perfil, no se hace', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    // Hugo cambia de slug y otro perfil se queda con el suyo.
    Object.assign(db.clients.find(c => c.id === PERFIL.hugo), { slug: 'hugo-fit', name: 'Hugo Fit' })
    db.clients.push({ id: PERFIL.nuevo, slug: 'enformaconhugo', name: 'Otro', agencia_id: AG.silvestre, active: true })
    await boton(tg, `a:${a.id}`)
    expect(programar).not.toHaveBeenCalled()
    expect(aprobaciones()[0]).toMatchObject({ estado: 'fallida', resultado: { ok: false } })
    expect(aprobaciones()[0].resultado.texto).toContain('ya no lleva al perfil')
  })
})

// ── Lo que no lleva tarjeta ────────────────────────────────────────────────
describe('lo que no se va a hacer no saca botones', () => {
  it('un perfil que no existe: sin tarjeta, Claude recibe el motivo y sigue en el mismo mensaje', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara(conPerfil(USO, 'nadie'))
    turnoAgente.mockReset()
    turnoQueSePara(conPerfil(USO, 'nadie'))
    await mensaje(tg, 'Programa algo en nadie')
    expect(aprobaciones()).toEqual([])
    expect(enviados.some(e => e.botones)).toBe(false)
    expect(turnoAgente).toHaveBeenCalledTimes(2)
    const [segundo] = turnoAgente.mock.calls[1]
    expect(segundo.system).toBe('SISTEMA 1')
    expect(segundo.messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: expect.stringMatching(/^No se puede hacer tal cual: No encuentro ningún perfil/), is_error: true }],
    })
    expect(NO_SE_PUEDE).toBe(NO_SE_PUEDE_TXT)
    expect(ultimo(tg)).toBe('Listo: guion programado para el lunes.')
  })

  it('en un paso con dos: la que no se puede va a los resultados y la otra sale con botones', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    const vacio = { ...USO_DCC, input: { ...USO_DCC.input, guiones: [] } }
    turnoQueSePara(USO, vacio)
    await mensaje(tg, 'Programa en Hugo y en DCC')
    expect(aprobaciones()).toHaveLength(1)
    expect(conversacion(tg).turno.resultados).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_2', content: 'No se puede hacer tal cual: faltan los guiones.', is_error: true },
    ])
    await boton(tg, `a:${aprobaciones()[0].id}`)
    const [reanudado] = turnoAgente.mock.calls[1]
    expect(reanudado.messages.at(-1).content.map(b => [b.tool_use_id, Boolean(b.is_error)])).toEqual([['toolu_2', true], ['toolu_1', false]])
  })

  it('lo que ya estaba hecho tampoco pide permiso: va a Claude como hecho', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara({ ...USO, input: { ...USO.input, guiones: [{ ...USO.input.guiones[0], titulo: 'Ya estaba' }] } })
    await mensaje(tg, 'Programa otra vez el de la sentadilla')
    expect(aprobaciones()).toEqual([])
    expect(turnoAgente.mock.calls[1][0].messages.at(-1).content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'El guion ya estaba programado. No hace falta hacer nada.' },
    ])
  })

  it('si Claude insiste en lo imposible, lo deja a las pocas vueltas', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    const imposible = conPerfil(USO, 'nadie')
    turnoAgente.mockImplementation(async ({ messages }) => ({
      tipo: 'pendiente', texto: '', messages: [...messages, { role: 'assistant', content: [{ type: 'tool_use', ...imposible }] }], resultados: [], pendientes: [imposible],
    }))
    await mensaje(tg, 'Programa algo en nadie')
    expect(turnoAgente).toHaveBeenCalledTimes(4)
    expect(ultimo(tg)).toContain('No he podido preparar lo que me pides')
    expect(conversacion(tg).turno).toBeNull()
  })
})

// ── Dos acciones, mensajes a destiempo y reinicios ─────────────────────────
describe('el turno en pausa no se pierde', () => {
  it('dos acciones en un paso: Claude sigue una sola vez, cuando las dos están decididas', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara(USO, USO_DCC)
    await mensaje(tg, 'Programa en Hugo y en DCC')
    const [a, b] = aprobaciones()
    expect(b).toMatchObject({ client_id: PERFIL.dcc, args: { perfil: 'detras-de-camra' } })
    await boton(tg, `a:${a.id}`)
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    await boton(tg, `r:${b.id}`)
    expect(turnoAgente).toHaveBeenCalledTimes(2)
    expect(programar).toHaveBeenCalledTimes(1)
    expect(turnoAgente.mock.calls[1][0].messages.at(-1).content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"hecho":"Programados 1 guiones"}' },
      { type: 'tool_result', tool_use_id: 'toolu_2', content: RECHAZADA, is_error: true },
    ])
  })

  it('una hecha y la otra caducada: el siguiente mensaje cierra el turno con las dos y el texto nuevo detrás', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara(USO, USO_DCC)
    await mensaje(tg, 'Programa en Hugo y en DCC')
    const [a, b] = aprobaciones()
    await boton(tg, `a:${a.id}`)
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    b.caduca = enUnRato(-1)
    await mensaje(tg, '¿Cómo ha quedado?')
    expect(turnoAgente).toHaveBeenCalledTimes(2)
    const [seguido] = turnoAgente.mock.calls[1]
    expect(seguido.system).toBe('SISTEMA 1')
    expect(seguido.messages.at(-2).content.at(-1)).toMatchObject({ type: 'tool_use', id: 'toolu_2' })
    expect(seguido.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"hecho":"Programados 1 guiones"}' },
        { type: 'tool_result', tool_use_id: 'toolu_2', content: expect.stringContaining('caducado'), is_error: true },
        { type: 'text', text: '¿Cómo ha quedado?' },
      ],
    })
    expect(aprobaciones()[1].estado).toBe('caducada')
    expect(editados.at(-1).texto).toContain('Caducada')
    expect(conversacion(tg).turno).toBeNull()
    expect(conversacion(tg).historial[0]).toEqual({ role: 'user', content: 'Programa en Hugo y en DCC\n\n¿Cómo ha quedado?' })
  })

  it('un mensaje que llega mientras se hace lo aprobado no se lleva el turno por delante', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    // Justo después de apuntarla como ejecutada, cuando se audita, llega otro mensaje.
    ganchos.audit_logs = async () => { await mensaje(tg, 'otra cosa') }
    await boton(tg, `a:${a.id}`)
    expect(enviados.map(e => e.texto)).toContain(OCUPADO)
    expect(turnoAgente).toHaveBeenCalledTimes(2)
    expect(turnoAgente.mock.calls[1][0].messages.at(-1).content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"hecho":"Programados 1 guiones"}' },
    ])
    expect(ultimo(tg)).toBe('Listo: guion programado para el lunes.')
  })

  it('un mensaje mientras Claude piensa no empieza otro turno', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoAgente.mockImplementationOnce(async (o) => {
      await mensaje(tg, '¿sigues?')
      return { tipo: 'fin', texto: 'Ya está.', messages: o.messages }
    })
    await mensaje(tg, 'hola')
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    expect(enviados.map(e => e.texto)).toEqual([OCUPADO, 'Ya está.'])
  })

  it('/nuevo mientras Claude piensa: lo que estaba en marcha ya no contesta, ni guarda, ni saca botones', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoAgente.mockImplementationOnce(async (o) => {
      await mensaje(tg, '/nuevo')
      return { tipo: 'fin', texto: 'Respuesta vieja', messages: o.messages }
    })
    await mensaje(tg, 'hola')
    expect(enviados.map(e => e.texto)).not.toContain('Respuesta vieja')
    expect(ultimo(tg)).toContain('empezamos de cero')
    expect(conversacion(tg)).toBeUndefined()

    turnoAgente.mockImplementationOnce(async ({ messages }) => {
      await mensaje(tg, '/nuevo')
      return { tipo: 'pendiente', texto: '', messages: [...messages, { role: 'assistant', content: [{ type: 'tool_use', ...USO }] }], resultados: [], pendientes: [USO] }
    })
    await mensaje(tg, 'Programa en Hugo')
    expect(aprobaciones()).toEqual([])
    expect(enviados.some(e => e.botones)).toBe(false)
    expect(conversacion(tg)).toBeUndefined()
  })

  it('el turno sigue con el modelo con el que se paró, aunque cambie HELM_TELEGRAM_MODELO', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    process.env.HELM_TELEGRAM_MODELO = 'claude-otro'
    try {
      await boton(tg, `a:${aprobaciones()[0].id}`)
      expect(turnoAgente.mock.calls[1][0].model).toBe('claude-sonnet-5')
    } finally {
      delete process.env.HELM_TELEGRAM_MODELO
    }
  })

  it('una aprobada que se quedó a medias por un reinicio no bloquea el chat: Claude sabe que no se sabe si se hizo', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    // Recién aprobada y sin nadie haciéndola: puede que aún se esté haciendo.
    Object.assign(a, { estado: 'aprobada', decidida_at: new Date().toISOString() })
    await mensaje(tg, '¿Lo has hecho?')
    expect(ultimo(tg)).toContain('aprobada a medias')
    expect(turnoAgente).toHaveBeenCalledTimes(1)
    // Pasados unos minutos, ya no: se da por interrumpida y el turno se cierra.
    a.decidida_at = new Date(Date.now() - 5 * 60_000).toISOString()
    await mensaje(tg, '¿Lo has hecho?')
    expect(aprobaciones()[0]).toMatchObject({ estado: 'fallida', resultado: { ok: false } })
    expect(editados.at(-1).texto).toContain('se interrumpió')
    expect(turnoAgente).toHaveBeenCalledTimes(2)
    expect(turnoAgente.mock.calls[1][0].messages.at(-1).content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: expect.stringContaining('no sé si llegó a hacerse'), is_error: true },
      { type: 'text', text: '¿Lo has hecho?' },
    ])
  })

  it('el fallo de una herramienta llega a Claude sin secretos', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    const clave = `sk-ant-api03-${'x'.repeat(40)}`
    leer.mockImplementationOnce(async () => { throw new Error(`fallo con ${clave}`) })
    let r
    turnoAgente.mockImplementationOnce(async (o) => {
      r = await o.ejecutar('calendario', { perfil: 'hugo' })
      return { tipo: 'fin', texto: 'Uy.', messages: o.messages }
    })
    await mensaje(tg, '¿Qué tiene Hugo?')
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/^No se ha podido: /)
    expect(r.texto).not.toContain(clave)
  })

  it('lo que paga Claude va a la agencia; lo que anota una herramienta no se queda para el paso siguiente', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    let enLaHerramienta, antes, despues
    leer.mockImplementationOnce(async () => {
      anotar({ clientId: PERFIL.hugo })
      enLaHerramienta = { ...contexto() }
      return { ok: true, texto: '[]' }
    })
    turnoAgente.mockImplementationOnce(async (o) => {
      antes = { ...contexto() }
      await o.ejecutar('calendario', { perfil: 'hugo' })
      despues = { ...contexto() }
      return { tipo: 'fin', texto: 'Nada.', messages: o.messages }
    })
    await mensaje(tg, '¿Qué tiene Hugo?')
    expect(antes).toEqual({ agenciaId: AG.silvestre, origen: 'telegram' })
    expect(enLaHerramienta).toMatchObject({ agenciaId: AG.silvestre, clientId: PERFIL.hugo })
    expect(despues).toEqual(antes)
  })
})

// ── Botones raros, base caída y cambios de agencia ─────────────────────────
describe('los botones siempre se contestan', () => {
  it('con datos que no son un id, o con la base caída, el botón no se queda con el reloj', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    await boton(tg, `a:${'-'.repeat(36)}`)
    expect(callbacks).toHaveLength(1)
    expect(callbacks[0].texto).toBeUndefined()
    expect(consultadas).not.toContain('helm_telegram_aprobaciones')

    fallos.helm_telegram_aprobaciones = new Error('connect ECONNREFUSED')
    await boton(tg, `a:${crypto.randomUUID()}`)
    expect(callbacks.at(-1).texto).toBe('No he podido, prueba otra vez.')
  })

  it('una aprobación de otra agencia no se hace aunque sea tuya, y el chat empieza de cero en la nueva', async () => {
    process.env.HELM_TELEGRAM_AGENCIAS = 'silvestreai,pp'
    try {
      const tg = nuevoTg()
      vincula(SA.alex, tg)
      turnoQueSePara()
      await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
      const [a] = aprobaciones()
      db.superadmins.find(s => s.id === SA.alex).agencia_id = AG.pp
      await boton(tg, `a:${a.id}`)
      expect(programar).not.toHaveBeenCalled()
      expect(aprobaciones()[0].estado).toBe('caducada')
      expect(callbacks.at(-1).texto).toContain('otra agencia')

      turnoAgente.mockReset()
      turnoAgente.mockImplementationOnce(fin('Hola desde pp.'))
      await mensaje(tg, 'hola')
      expect(vinculoDe(SA.alex).agencia_id).toBe(AG.pp)
      expect(turnoAgente.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'hola' }])
      expect(herramientasBot.mock.calls.at(-1)[0].agenciaId).toBe(AG.pp)
      expect(herramientasBot.mock.calls.at(-1)[0].alcance.perfiles.map(p => p.slug)).toEqual(['pp-perfil'])
    } finally {
      delete process.env.HELM_TELEGRAM_AGENCIAS
    }
  })
})

// ── El panel y los desvínculos ─────────────────────────────────────────────
describe('registrar y desvincular', () => {
  it('registrar: solo la plataforma, con un secreto válido y pidiendo también las pulsaciones', async () => {
    const antes = { url: process.env.HELM_PUBLIC_URL, secreto: process.env.HELM_TELEGRAM_SECRETO }
    process.env.HELM_PUBLIC_URL = 'https://helm.example/'
    try {
      const otra = await panel('POST', 'registrar', SA.otro)
      expect(otra.statusCode).toBe(403)

      process.env.HELM_TELEGRAM_SECRETO = 'con espacios y ñ'
      const malo = await panel('POST', 'registrar', SA.alex)
      expect(malo.statusCode).toBe(400)
      expect(malo.body.error).toContain('HELM_TELEGRAM_SECRETO')
      expect(registrarWebhook).not.toHaveBeenCalled()
      process.env.HELM_TELEGRAM_SECRETO = antes.secreto

      const r = await panel('POST', 'registrar', SA.alex)
      expect(r.statusCode).toBe(200)
      expect(r.body).toEqual({ ok: true, url: 'https://helm.example/api/telegram-agencia?action=webhook' })
      expect(registrarWebhook).toHaveBeenCalledWith(process.env.HELM_TELEGRAM_TOKEN, r.body.url, antes.secreto, ['message', 'callback_query'])
      expect(tabla('audit_logs').map(x => x.action)).toContain('telegram.agencia_webhook')
    } finally {
      if (antes.url == null) delete process.env.HELM_PUBLIC_URL
      else process.env.HELM_PUBLIC_URL = antes.url
      process.env.HELM_TELEGRAM_SECRETO = antes.secreto
    }
  })

  it('desvincular desde el panel: fuera el vínculo, lo pendiente caduca y el Telegram se entera', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    turnoQueSePara()
    await mensaje(tg, 'Programa en Hugo el guion de la sentadilla')
    const [a] = aprobaciones()
    const r = await panel('DELETE', 'vinculo', SA.alex)
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true })
    expect(vinculoDe(SA.alex)).toBeUndefined()
    expect(conversacion(tg)).toBeUndefined()
    expect(aprobaciones()[0].estado).toBe('caducada')
    expect(editados.at(-1).texto).toContain('ya no está vinculado')
    expect(ultimo(tg)).toContain('desvinculado desde el panel')
    await boton(tg, `a:${a.id}`)
    expect(programar).not.toHaveBeenCalled()
    expect(callbacks.at(-1).texto).toBe('Esta acción no es tuya.')
    // Sin vínculo, también contesta bien.
    expect((await panel('DELETE', 'vinculo', SA.alex)).statusCode).toBe(200)
  })

  it('/desvincular desde Telegram: luego ya no llega a la IA', async () => {
    const tg = nuevoTg()
    vincula(SA.alex, tg)
    await mensaje(tg, '/desvincular')
    expect(vinculoDe(SA.alex)).toBeUndefined()
    expect(ultimo(tg)).toContain('ya no habla con HELM')
    await mensaje(tg, 'hola')
    expect(ultimo(tg)).toContain('Este bot es privado')
    expect(turnoAgente).not.toHaveBeenCalled()
  })

  it('vincular otro Telegram cancela lo pendiente del anterior y le avisa', async () => {
    const viejo = nuevoTg()
    vincula(SA.alex, viejo)
    turnoQueSePara()
    await mensaje(viejo, 'Programa en Hugo el guion de la sentadilla')
    const { body } = await panel('POST', 'codigo', SA.alex)
    const nuevo = nuevoTg()
    await mensaje(nuevo, `/start ${body.codigo}`)
    expect(vinculoDe(SA.alex)).toMatchObject({ tg_user_id: nuevo, tg_chat_id: nuevo })
    expect(aprobaciones()[0].estado).toBe('caducada')
    expect(editados.at(-1).texto).toContain('vinculado a otro Telegram')
    expect(conversacion(viejo)).toBeUndefined()
    expect(ultimo(viejo)).toContain('se ha vinculado a otro Telegram')
    expect(ultimo(nuevo)).toContain('Vinculado')
  })

  it('el bot de agencia no se puede enlazar como bot de un perfil (api/telegram.js)', async () => {
    const antes = process.env.HELM_PUBLIC_URL
    process.env.HELM_PUBLIC_URL = 'https://helm.example'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: { id: 123456789, username: 'Helm_silvestre_bot', first_name: 'HELM' } }) })))
    try {
      const token = await signJwt({ sub: SA.alex, superadmin: true, role: 'superadmin', email: 'alex@x.es' })
      const res = respuesta()
      await handlerPerfil({
        method: 'POST', query: { action: 'link' }, body: { clientId: PERFIL.hugo, token: process.env.HELM_TELEGRAM_TOKEN },
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `10.2.0.${++ip}` }, socket: {},
      }, res)
      expect(res.statusCode).toBe(400)
      expect(res.body.error).toContain('bot de HELM para agencias')
      expect(registrarWebhook).not.toHaveBeenCalled()
      expect(tabla('user_integrations')).toEqual([])
    } finally {
      vi.unstubAllGlobals()
      if (antes == null) delete process.env.HELM_PUBLIC_URL
      else process.env.HELM_PUBLIC_URL = antes
    }
  })
})

// ── La Bot API (api/_lib/telegram.js, la de verdad, con fetch simulado) ─────
describe('la Bot API', () => {
  let llamadas
  function responde(...respuestas) {
    llamadas = []
    const cola = [...respuestas]
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      llamadas.push({ metodo: String(url).split('/').at(-1), cuerpo: JSON.parse(init.body) })
      const [status, body] = cola.shift() || [200, { ok: true, result: true }]
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }))
  }
  const fallo = (status, description, extra = {}) => [status, { ok: false, error_code: status, description, ...extra }]
  afterEach(() => vi.unstubAllGlobals())

  it('enviarConBotones: si Telegram no entiende el formato, otra vez sin él y con los botones', async () => {
    const teclado = [[{ text: '✅', callback_data: 'a:1' }]]
    responde(fallo(400, "Bad Request: can't parse entities"), [200, { ok: true, result: { message_id: 9 } }])
    expect(await TG.enviarConBotones('T', 1, 'utm_source_x', teclado)).toEqual({ message_id: 9 })
    expect(llamadas.map(l => l.cuerpo.parse_mode)).toEqual(['Markdown', undefined])
    expect(llamadas[1].cuerpo.reply_markup).toEqual({ inline_keyboard: teclado })
  })

  it('las tarjetas (plano): el texto tal cual, sin Markdown ni conversiones', async () => {
    const teclado = [[{ text: '✅', callback_data: 'a:1' }]]
    const texto = '🟡 ¿Lo hago?\n\nNota para ana_g@x.com y juan_p@y.com: [aquí](https://malo.example)\n- uno\n**dos**'
    responde([200, { ok: true, result: { message_id: 5 } }])
    expect(await TG.enviarConBotones('T', 1, texto, teclado, { plano: true })).toEqual({ message_id: 5 })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].cuerpo.parse_mode).toBeUndefined()
    expect(llamadas[0].cuerpo.text).toBe(texto)
    expect(llamadas[0].cuerpo.reply_markup).toEqual({ inline_keyboard: teclado })

    responde([200, { ok: true, result: { message_id: 5 } }])
    await TG.editarMensaje('T', 1, 5, texto, undefined, { plano: true })
    expect(llamadas[0].cuerpo).toMatchObject({ text: texto })
    expect(llamadas[0].cuerpo.parse_mode).toBeUndefined()
  })

  it('un 429 corto se espera y se reintenta una vez; uno largo, no', async () => {
    responde(fallo(429, 'Too Many Requests: retry after 0', { parameters: { retry_after: 0 } }), [200, { ok: true, result: { message_id: 3 } }])
    expect(await TG.enviarMensaje('T', 1, 'hola')).toBe(1)
    expect(llamadas).toHaveLength(2)

    responde(fallo(429, 'Too Many Requests: retry after 0', { parameters: { retry_after: 0 } }), [200, { ok: true, result: { message_id: 4 } }])
    expect(await TG.enviarConBotones('T', 1, 'hola', [[{ text: 'x', callback_data: 'y' }]])).toEqual({ message_id: 4 })

    responde(fallo(429, 'Too Many Requests: retry after 30', { parameters: { retry_after: 30 } }))
    await expect(TG.enviarMensaje('T', 1, 'hola')).rejects.toMatchObject({ telegramCode: 429, retryAfter: 30 })
    expect(llamadas).toHaveLength(1)
  })

  it('editarMensaje y responderCallback: lo que no es un fallo no lanza, y lo que sí, sí', async () => {
    responde(fallo(400, 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same'))
    expect(await TG.editarMensaje('T', 1, 2, 'x')).toBeNull()
    expect(llamadas).toHaveLength(1)

    responde(fallo(400, "Bad Request: can't parse entities"), [200, { ok: true, result: { message_id: 2 } }])
    expect(await TG.editarMensaje('T', 1, 2, '_x')).toEqual({ message_id: 2 })
    expect(llamadas.map(l => l.cuerpo.parse_mode)).toEqual(['Markdown', undefined])
    expect(llamadas[1].cuerpo.reply_markup).toBeUndefined()

    responde(fallo(400, 'Bad Request: query is too old and response timeout expired or query ID is invalid'))
    expect(await TG.responderCallback('T', 'q', 'Aprobada')).toBeNull()

    responde(fallo(500, 'Internal Server Error'))
    await expect(TG.responderCallback('T', 'q')).rejects.toMatchObject({ statusCode: 502 })
  })
})

// ── Avisos por el bot de agencia ───────────────────────────────────────────
describe('notificar también avisa por el bot de la agencia', () => {
  it('solo lo importante, con el nombre del perfil delante y a los vinculados de esa agencia', async () => {
    const alex = nuevoTg()
    const pepe = nuevoTg()
    vincula(SA.alex, alex)
    vincula(SA.pp, pepe, AG.pp)

    await notificar({ from: (t) => consulta(t) }, PERFIL.hugo, { tipo: 'estudio', nivel: 'info', titulo: 'Estudio listo' })
    expect(enviados).toEqual([])

    await notificar({ from: (t) => consulta(t) }, PERFIL.hugo, { tipo: 'reserva', titulo: 'Nueva reserva', cuerpo: 'Ana, lunes 10:00' })
    await notificar({ from: (t) => consulta(t) }, PERFIL.hugo, { tipo: 'agentes', nivel: 'error', titulo: 'El guionista ha fallado' })
    expect(enviados.map(e => e.chatId)).toEqual([alex, alex])
    expect(enviados[0].texto).toBe('🔔 \\[En Forma con Hugo] *Nueva reserva*\nAna, lunes 10:00')
    expect(enviados[1].texto).toContain('🔴 \\[En Forma con Hugo]')
  })
})
