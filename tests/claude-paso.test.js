// Un paso de Claude en crudo (claudePaso, api/_lib/anthropic.js): que mande el
// historial tal cual (bloques tool_use/tool_result sin tocar), que traduzca las
// herramientas del conector a lo que pide Anthropic sin campos de más, que vaya
// con streaming y caché de prompt, y que con la clave de HELM exija saldo antes
// y cobre después (también cuando Claude rechaza). El SDK va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const cuerpos = []
const stream = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor(opciones) { this.opciones = opciones }
    messages = { stream: (body) => { cuerpos.push(body); return stream(body) } }
  },
}))

const exigirSaldo = vi.fn()
const cobrar = vi.fn()
vi.mock('../api/_lib/creditos.js', () => ({
  exigirSaldo: (...a) => exigirSaldo(...a),
  cobrar: (...a) => cobrar(...a),
  claveHelm: () => 'clave-de-helm',
}))

const { claudePaso, MODELO_POR_DEFECTO } = await import('../api/_lib/anthropic.js')

const USO = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 }
const respuesta = (extra = {}) => ({
  id: 'msg_1', role: 'assistant',
  content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'hola' }],
  stop_reason: 'end_turn', usage: USO, ...extra,
})
const devuelve = (res) => stream.mockImplementationOnce(() => ({ finalMessage: async () => res }))

// Un historial con una ronda de herramientas, como lo lleva el bucle.
const HISTORIAL = [
  { role: 'user', content: 'dame los perfiles' },
  { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 'tu1', name: 'perfiles', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{"perfiles":[]}' }] },
]

beforeEach(() => {
  cuerpos.length = 0
  stream.mockReset()
  exigirSaldo.mockReset()
  cobrar.mockReset()
})

describe('claudePaso', () => {
  it('manda el historial tal cual, con streaming, y devuelve el Message crudo', async () => {
    const res = respuesta()
    devuelve(res)
    const r = await claudePaso({ apiKey: 'otra', model: 'claude-sonnet-5', system: 'sé breve', messages: HISTORIAL })

    expect(r).toBe(res)
    expect(cuerpos).toHaveLength(1)
    const body = cuerpos[0]
    // El mismo array, sin normalizar ni aplanar a texto.
    expect(body.messages).toBe(HISTORIAL)
    expect(body.messages[2].content[0].type).toBe('tool_result')
    expect(body.model).toBe('claude-sonnet-5')
    expect(body.output_config).toEqual({ effort: 'medium' })
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000)
  })

  it('pasa maxTokens y esfuerzo', async () => {
    devuelve(respuesta())
    await claudePaso({ apiKey: 'otra', model: 'claude-opus-5', messages: HISTORIAL, maxTokens: 32000, esfuerzo: 'high' })
    expect(cuerpos[0].max_tokens).toBe(32000)
    expect(cuerpos[0].output_config).toEqual({ effort: 'high' })
  })

  it('activa la caché: arriba del todo y al final del system', async () => {
    devuelve(respuesta())
    await claudePaso({ apiKey: 'otra', model: 'claude-sonnet-5', system: 'sé breve', messages: HISTORIAL })
    expect(cuerpos[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(cuerpos[0].system).toEqual([{ type: 'text', text: 'sé breve', cache_control: { type: 'ephemeral' } }])

    // Sin system no se manda system.
    devuelve(respuesta())
    await claudePaso({ apiKey: 'otra', model: 'claude-sonnet-5', messages: HISTORIAL })
    expect('system' in cuerpos[1]).toBe(false)
  })

  it('traduce las herramientas del conector (inputSchema) y quita lo que no es de Anthropic', async () => {
    devuelve(respuesta())
    const esquema = { type: 'object', properties: { perfil: { type: 'string' } } }
    await claudePaso({
      apiKey: 'otra', model: 'claude-sonnet-5', messages: HISTORIAL,
      tools: [
        { name: 'perfiles', description: 'Los perfiles', inputSchema: esquema },
        { name: 'escribir', description: 'Escribe', input_schema: esquema, delicada: true, ejecutar: async () => ({}) },
      ],
    })
    expect(cuerpos[0].tools).toEqual([
      { name: 'perfiles', description: 'Los perfiles', input_schema: esquema },
      { name: 'escribir', description: 'Escribe', input_schema: esquema },
    ])
    for (const t of cuerpos[0].tools) expect(Object.keys(t).sort()).toEqual(['description', 'input_schema', 'name'])
  })

  it('con la clave de HELM exige saldo antes y cobra después', async () => {
    devuelve(respuesta())
    await claudePaso({ apiKey: 'clave-de-helm', model: 'claude-sonnet-5', messages: HISTORIAL })
    expect(exigirSaldo).toHaveBeenCalledTimes(1)
    expect(cobrar).toHaveBeenCalledWith('claude-sonnet-5', USO)
    expect(exigirSaldo.mock.invocationCallOrder[0]).toBeLessThan(stream.mock.invocationCallOrder[0])
    expect(stream.mock.invocationCallOrder[0]).toBeLessThan(cobrar.mock.invocationCallOrder[0])
  })

  it('sin saldo no llama a Claude', async () => {
    exigirSaldo.mockRejectedValueOnce(Object.assign(new Error('sin créditos'), { statusCode: 402 }))
    await expect(claudePaso({ apiKey: 'clave-de-helm', model: 'claude-sonnet-5', messages: HISTORIAL })).rejects.toMatchObject({ statusCode: 402 })
    expect(stream).not.toHaveBeenCalled()
    expect(cobrar).not.toHaveBeenCalled()
  })

  it('con la clave propia de un perfil no se exige saldo ni se cobra', async () => {
    devuelve(respuesta())
    await claudePaso({ apiKey: 'sk-del-perfil', model: 'claude-sonnet-5', messages: HISTORIAL })
    expect(exigirSaldo).not.toHaveBeenCalled()
    expect(cobrar).not.toHaveBeenCalled()
  })

  it('un rechazo de Claude es un 422, y se cobra antes porque Anthropic ya lo ha facturado', async () => {
    devuelve(respuesta({ content: [], stop_reason: 'refusal' }))
    await expect(claudePaso({ apiKey: 'clave-de-helm', model: 'claude-sonnet-5', messages: HISTORIAL })).rejects.toMatchObject({ statusCode: 422 })
    expect(cobrar).toHaveBeenCalledTimes(1)
  })

  it('un error de la API sale traducido', async () => {
    stream.mockImplementationOnce(() => ({ finalMessage: async () => { throw Object.assign(new Error('rate'), { status: 429 }) } }))
    await expect(claudePaso({ apiKey: 'otra', model: 'claude-sonnet-5', messages: HISTORIAL })).rejects.toMatchObject({ statusCode: 429 })
  })

  it('un modelo desconocido se cambia por el de por defecto, avisando', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    devuelve(respuesta())
    await claudePaso({ apiKey: 'otra', model: 'claude-inventado-9', messages: HISTORIAL })
    expect(cuerpos[0].model).toBe(MODELO_POR_DEFECTO)
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })
})
