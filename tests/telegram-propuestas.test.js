// Los botones de las propuestas de los agentes en el bot de la agencia
// (api/telegram-agencia.js, «pa:<id>» aprueba y «pr:<id>» rechaza): solo los
// pulsa quien está vinculado, desde SU chat privado y con la cuenta activa en
// una agencia con bot; la agencia que cuenta es la de su cuenta (decidir() la
// compara con la de la propuesta); y hay límite de pulsaciones. decidir() va
// simulada (sus reglas: tests/propuestas.test.js); Supabase, en memoria.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-del-bot-0123456789'
process.env.HELM_TELEGRAM_TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
process.env.HELM_TELEGRAM_SECRETO = 'secreto-del-webhook_de-prueba'
process.env.HELM_TELEGRAM_AGENCIAS = 'silvestreai'

vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase } = await import('./ayudas/base-memoria.js')
  const base = crearBase()
  return { supabase: base.supabase, __base: base }
})
const callbacks = vi.hoisted(() => [])
vi.mock('../api/_lib/telegram.js', async (original) => ({
  ...(await original()),
  tg: async () => ({ message_id: 1 }),
  enviarMensaje: async () => 1,
  enviarConBotones: async () => ({ message_id: 1 }),
  editarMensaje: async () => true,
  responderCallback: async (_token, id, texto) => { callbacks.push({ id, texto }); return true },
  accionEscribiendo: async () => null,
  publicarComandos: async () => null,
}))
vi.mock('../api/mcp/[token].js', () => ({
  ESCRIBEN: [], DEL_CLIENTE: [], herramientasDe: () => [],
  ejecutaHerramienta: async () => ({ ok: false, texto: 'no' }),
  alcanceDesdeContexto: async () => null,
}))
vi.mock('../api/_lib/bot-herramientas.js', () => ({
  herramientasBot: async () => [], sistemaBot: () => 'SISTEMA', resolverPerfil: () => ({ error: 'x', opciones: [] }),
  perfilesDeAgencia: async () => [], esAccionVacia: () => false, NO_SE_PUEDE: 'No se puede hacer tal cual: ',
}))
vi.mock('../api/_lib/equipo.js', () => ({ AGENTES_LANZABLES: [], encolaAgente: async () => {}, tokensDeHoy: async () => 0 }))
vi.mock('../api/chat.js', () => ({ responderMensaje: async () => ({ respuesta: '' }), COMMANDS: [] }))
vi.mock('../api/_lib/llm.js', () => ({ proveedorDe: () => 'claude' }))
vi.mock('../api/_lib/creditos.js', () => ({ claveHelm: () => 'clave-de-helm', exigirSaldo: async () => {}, cobrar: async () => {} }))
vi.mock('../api/_lib/claude-agente.js', () => ({ turnoAgente: vi.fn(), cierraPendientes: () => [{ content: [] }], RECHAZADA: 'rechazada' }))
const decididas = vi.hoisted(() => [])
vi.mock('../api/_lib/propuestas.js', async () => {
  const { contexto } = await import('../api/_lib/contexto.js')
  return {
    decidir: vi.fn(async (args) => {
      decididas.push({ args, contexto: contexto() })
      return { ok: true, decidida: true, estado: args.aprobar ? 'aplicada' : 'rechazada', texto: args.aprobar ? `Hecho. ${'x'.repeat(400)}` : 'Rechazada: no se hace.' }
    }),
  }
})

const { __base: db } = await import('../api/lib/supabase.js')
const { default: handler } = await import('../api/telegram-agencia.js')

const AG = { silvestre: 'a0000000-0000-4000-8000-000000000001', otra: 'a0000000-0000-4000-8000-000000000002' }
const SA = {
  alex: 'b0000000-0000-4000-8000-000000000001',
  baja: 'b0000000-0000-4000-8000-000000000002',
  movido: 'b0000000-0000-4000-8000-000000000003',
  sinbot: 'b0000000-0000-4000-8000-000000000004',
}
const PROP = 'e0000000-0000-4000-8000-0000000000aa'

let updateId = 1
let tg = 9000
function respuesta() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
}
async function boton(from, data, { chat = from, tipo = 'private' } = {}) {
  callbacks.length = 0
  const res = respuesta()
  await handler({
    method: 'POST', query: { action: 'webhook' }, headers: { 'x-telegram-bot-api-secret-token': process.env.HELM_TELEGRAM_SECRETO },
    body: { update_id: updateId++, callback_query: { id: `cq-${updateId}`, from: { id: from }, data, message: { message_id: 77, chat: { id: chat, type: tipo } } } },
  }, res)
  return callbacks.at(-1)?.texto
}
function vinculado(superadminId, agenciaId = AG.silvestre) {
  const id = ++tg
  db.tablas.helm_telegram_vinculos.push({ superadmin_id: superadminId, agencia_id: agenciaId, tg_user_id: id, tg_chat_id: id, vinculado_at: new Date().toISOString() })
  return id
}

beforeEach(() => {
  db.vaciar()
  decididas.length = 0
  db.tablas.agencias = [
    { id: AG.silvestre, nombre: 'Silvestre AI', slug: 'silvestreai' },
    { id: AG.otra, nombre: 'Otra', slug: 'otra' },
  ]
  db.tablas.superadmins = [
    { id: SA.alex, active: true, agencia_id: AG.silvestre, email: 'alex@helm.es', name: 'Alex' },
    { id: SA.baja, active: false, agencia_id: AG.silvestre, email: 'baja@helm.es', name: 'Baja' },
    // Su vínculo es de Silvestre, pero su cuenta ya es de otra agencia (que además no tiene bot).
    { id: SA.movido, active: true, agencia_id: AG.otra, email: 'movido@helm.es', name: 'Movido' },
  ]
  db.tablas.helm_telegram_vinculos = []
})

describe('botones «pa:/pr:» de las propuestas', () => {
  it('quien está vinculado, en su chat privado: aprueba o rechaza con la agencia de SU cuenta', async () => {
    const yo = vinculado(SA.alex)
    expect(await boton(yo, `pa:${PROP.toUpperCase()}`)).toMatch(/^Hecho\. x+/)
    expect(callbacks.at(-1).texto.length).toBeLessThanOrEqual(190)
    expect(decididas).toHaveLength(1)
    expect(decididas[0].args).toEqual({
      id: PROP, aprobar: true, agenciaId: AG.silvestre, quien: { id: SA.alex, email: 'alex@helm.es', nombre: 'Alex' }, origen: 'Telegram',
    })
    expect(decididas[0].contexto).toMatchObject({ agenciaId: AG.silvestre, origen: 'telegram' })
    expect(await boton(yo, `pr:${PROP}`)).toBe('Rechazada: no se hace.')
    expect(decididas[1].args.aprobar).toBe(false)
  })

  it('quien no está vinculado, o pulsa desde otro chat o un grupo, no decide nada', async () => {
    const yo = vinculado(SA.alex)
    expect(await boton(4242, `pa:${PROP}`)).toBe('Esta propuesta no es tuya.')
    // Un reenvío de la tarjeta a otro chat (su id de usuario es el bueno, el chat no).
    expect(await boton(yo, `pa:${PROP}`, { chat: 31337 })).toBe('Esta propuesta no es tuya.')
    // En un grupo, cualquiera podría pulsar: ni se mira.
    expect(await boton(yo, `pa:${PROP}`, { tipo: 'group' })).toBeUndefined()
    expect(await boton(yo, `pa:${PROP}`, { tipo: 'supergroup', chat: -100123 })).toBeUndefined()
    expect(decididas).toHaveLength(0)
  })

  it('una cuenta desactivada, o que ya es de una agencia sin bot, no decide (y se desvincula)', async () => {
    const baja = vinculado(SA.baja)
    expect(await boton(baja, `pa:${PROP}`)).toBe('Tu cuenta ya no puede usar este bot.')
    const movido = vinculado(SA.movido)
    expect(await boton(movido, `pa:${PROP}`)).toBe('Tu cuenta ya no puede usar este bot.')
    expect(decididas).toHaveLength(0)
    expect(db.filas('helm_telegram_vinculos')).toHaveLength(0)
  })

  it('si la cuenta cambia a otra agencia CON bot, decide como esa agencia (decidir() no le dejará tocar las de la anterior)', async () => {
    process.env.HELM_TELEGRAM_AGENCIAS = 'silvestreai,otra'
    try {
      const movido = vinculado(SA.movido, AG.silvestre)
      await boton(movido, `pa:${PROP}`)
      expect(decididas[0].args.agenciaId).toBe(AG.otra)
    } finally {
      process.env.HELM_TELEGRAM_AGENCIAS = 'silvestreai'
    }
  })

  it('datos que no son una propuesta no llegan a decidir()', async () => {
    const yo = vinculado(SA.alex)
    for (const d of ['pa:', 'pa:nada', `pa:${PROP}x`, `px:${PROP}`, `pa:${PROP.slice(0, 35)}-`, `pa:../../${PROP}`, `pA:${PROP}`]) {
      await boton(yo, d)
    }
    expect(decididas).toHaveLength(0)
  })

  it('como mucho 20 pulsaciones por minuto y persona', async () => {
    const yo = vinculado(SA.alex)
    const textos = []
    for (let i = 0; i < 22; i++) textos.push(await boton(yo, `pr:${PROP}`))
    expect(decididas).toHaveLength(20)
    expect(textos.slice(-2)).toEqual(['Demasiado seguido. Espera un momento.', 'Demasiado seguido. Espera un momento.'])
  })

  it('sin la cabecera secreta del webhook no se mira nada', async () => {
    const yo = vinculado(SA.alex)
    const res = respuesta()
    await handler({ method: 'POST', query: { action: 'webhook' }, headers: {}, body: { update_id: updateId++, callback_query: { id: 'cq', from: { id: yo }, data: `pa:${PROP}`, message: { message_id: 1, chat: { id: yo, type: 'private' } } } } }, res)
    expect(res.statusCode).toBe(401)
    expect(decididas).toHaveLength(0)
  })
})
