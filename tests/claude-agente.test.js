// El bucle de Claude con herramientas (api/_lib/claude-agente.js): que encadene
// pasos, que se PARE ante una herramienta delicada dejando las no delicadas ya
// hechas, que al cerrar los pendientes junte todos los tool_result en un solo
// mensaje, que respete el tope de pasos y que un corte por largo nunca pase por
// un «hecho». Claude (claudePaso) va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const paso = vi.fn()
const repara = vi.fn((args) => args)
vi.mock('../api/_lib/anthropic.js', () => ({
  // Con copia del historial tal como se manda: el bucle lo sigue ampliando.
  claudePaso: (o) => paso({ ...o, messages: [...o.messages] }),
  // En el bucle real repara los args contra el esquema; aquí, identidad.
  reparaArgs: (...a) => repara(...a),
  traducirHerramientas: (tools) => (tools || []).map(t => ({
    name: t.name, description: t.description ?? '', input_schema: t.input_schema ?? t.inputSchema,
  })),
}))

const { turnoAgente, cierraPendientes, RECHAZADA, MAX_POR_PASO } = await import('../api/_lib/claude-agente.js')

const TOOLS = [
  { name: 'leer', description: '', input_schema: { type: 'object', properties: {} } },
  { name: 'escribir', description: '', input_schema: { type: 'object', properties: {} } },
]
const base = { apiKey: 'k', model: 'claude-sonnet-5', system: 'sistema', tools: TOOLS }
const uso = (id, name = 'leer', input = {}) => ({ type: 'tool_use', id, name, input })
const contesta = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: {} })

beforeEach(() => { paso.mockReset(); repara.mockClear() })

describe('turnoAgente', () => {
  it('sin herramientas, contesta y termina', async () => {
    paso.mockResolvedValueOnce(contesta('Hola, soy el bot'))
    const ejecutar = vi.fn()
    const messages = [{ role: 'user', content: 'hola' }]
    const r = await turnoAgente({ ...base, messages, ejecutar, esDelicada: () => false })

    expect(r.tipo).toBe('fin')
    expect(r.texto).toBe('Hola, soy el bot')
    expect(ejecutar).not.toHaveBeenCalled()
    expect(paso).toHaveBeenCalledTimes(1)
    // El content del asistente se añade tal cual al historial que devuelve.
    expect(r.messages.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Hola, soy el bot' }] })
    // Y el array de quien llama no se toca.
    expect(messages).toEqual([{ role: 'user', content: 'hola' }])
  })

  it('pasa maxTokens (32000 por defecto) y el esfuerzo a cada paso', async () => {
    paso.mockResolvedValue(contesta('ok'))
    await turnoAgente({ ...base, messages: [{ role: 'user', content: 'a' }], ejecutar: vi.fn(), esDelicada: () => false })
    expect(paso.mock.calls[0][0]).toMatchObject({ maxTokens: 32000, esfuerzo: 'medium', model: 'claude-sonnet-5', system: 'sistema', tools: TOOLS })

    await turnoAgente({ ...base, messages: [{ role: 'user', content: 'a' }], ejecutar: vi.fn(), esDelicada: () => false, maxTokens: 64000, esfuerzo: 'high' })
    expect(paso.mock.calls[1][0]).toMatchObject({ maxTokens: 64000, esfuerzo: 'high' })
  })

  it('una herramienta no delicada, su resultado vuelve a Claude y luego termina', async () => {
    paso
      .mockResolvedValueOnce({ content: [uso('tu1', 'leer', { perfil: 'hugo' })], stop_reason: 'tool_use', usage: {} })
      .mockResolvedValueOnce(contesta('Aquí tienes'))
    const ejecutar = vi.fn().mockResolvedValueOnce({ ok: true, texto: 'datos del perfil' })
    const messages = [{ role: 'user', content: 'dame el calendario de hugo' }]
    const r = await turnoAgente({ ...base, messages, ejecutar, esDelicada: () => false })

    expect(r.tipo).toBe('fin')
    expect(r.texto).toBe('Aquí tienes')
    expect(ejecutar).toHaveBeenCalledWith('leer', { perfil: 'hugo' })
    expect(paso).toHaveBeenCalledTimes(2)
    // El tool_result va en un mensaje user, con el mismo tool_use_id.
    const userTool = r.messages.find(m => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result')
    expect(userTool.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu1', content: 'datos del perfil' }])
  })

  it('una herramienta delicada para el turno, con la no delicada ya ejecutada y el texto del paso', async () => {
    paso.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Te propongo este guion para el lunes.' },
        uso('tu1', 'leer', { perfil: 'hugo' }),
        uso('tu2', 'escribir', { perfil: 'hugo', guion: '...' }),
      ],
      stop_reason: 'tool_use', usage: {},
    })
    const ejecutar = vi.fn().mockResolvedValueOnce({ ok: true, texto: 'leido' })
    const messages = [{ role: 'user', content: 'programa un guion para hugo' }]
    const r = await turnoAgente({ ...base, messages, ejecutar, esDelicada: (name) => name === 'escribir' })

    expect(r.tipo).toBe('pendiente')
    expect(r.texto).toBe('Te propongo este guion para el lunes.')
    // Solo se ejecutó la no delicada.
    expect(ejecutar).toHaveBeenCalledTimes(1)
    expect(ejecutar).toHaveBeenCalledWith('leer', { perfil: 'hugo' })
    expect(r.resultados).toEqual([{ type: 'tool_result', tool_use_id: 'tu1', content: 'leido' }])
    expect(r.pendientes).toEqual([{ id: 'tu2', name: 'escribir', input: { perfil: 'hugo', guion: '...' } }])
    // No se ha mandado nada todavía: el último mensaje es el del asistente.
    expect(r.messages.at(-1).role).toBe('assistant')
    expect(paso).toHaveBeenCalledTimes(1)
  })

  it('cierraPendientes junta lo hecho y lo decidido, y la segunda llamada termina', async () => {
    const resultados = [{ type: 'tool_result', tool_use_id: 'tu1', content: 'leido' }]
    const messages = [
      { role: 'user', content: 'programa un guion para hugo' },
      { role: 'assistant', content: [uso('tu2', 'escribir')] },
    ]
    const decididos = [{ tool_use_id: 'tu2', ok: true, texto: 'guion programado' }]
    const conResultados = cierraPendientes(messages, resultados, decididos)

    expect(conResultados.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu1', content: 'leido' },
        { type: 'tool_result', tool_use_id: 'tu2', content: 'guion programado' },
      ],
    })

    paso.mockResolvedValueOnce(contesta('Hecho, lo tienes en el calendario'))
    const r = await turnoAgente({ ...base, messages: conResultados, ejecutar: vi.fn(), esDelicada: (name) => name === 'escribir' })
    expect(r.tipo).toBe('fin')
    expect(r.texto).toBe('Hecho, lo tienes en el calendario')
  })

  it('una decisión rechazada marca is_error con el aviso de RECHAZADA', () => {
    const msgs = cierraPendientes([], [], [{ tool_use_id: 'x', ok: false, texto: RECHAZADA }])
    expect(msgs.at(-1).content[0]).toEqual({ type: 'tool_result', tool_use_id: 'x', content: RECHAZADA, is_error: true })
  })

  it('respeta el tope de pasos cuando Claude no para de pedir herramientas', async () => {
    paso.mockResolvedValue({ content: [uso('t')], stop_reason: 'tool_use', usage: {} })
    const ejecutar = vi.fn().mockResolvedValue({ ok: true, texto: 'x' })
    const messages = [{ role: 'user', content: 'dale vueltas' }]
    const r = await turnoAgente({ ...base, messages, ejecutar, esDelicada: () => false, maxPasos: 2 })

    expect(r.tipo).toBe('tope')
    expect(paso).toHaveBeenCalledTimes(2)
  })
})

describe('turnoAgente: cortes por largo', () => {
  it('un tool_use cortado por max_tokens no se ejecuta ni pide aprobación: vuelve a Claude con error', async () => {
    paso
      .mockResolvedValueOnce({
        content: [{ type: 'thinking', thinking: '', signature: 's' }, uso('tu1', 'escribir', { perfil: 'hugo', guiones: [{ titulo: 'a medias' }] })],
        stop_reason: 'max_tokens', usage: {},
      })
      .mockResolvedValueOnce(contesta('Los meto en dos tandas.'))
    const ejecutar = vi.fn()
    const esDelicada = vi.fn(() => true)
    const r = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'prepárame los guiones de la semana de hugo' }], ejecutar, esDelicada })

    expect(ejecutar).not.toHaveBeenCalled()
    expect(esDelicada).not.toHaveBeenCalled()
    expect(r.tipo).toBe('fin')
    expect(r.texto).toBe('Los meto en dos tandas.')
    // El segundo paso ve el assistant cortado tal cual y su tool_result con error.
    const enviados = paso.mock.calls[1][0].messages
    expect(enviados.at(-2).content[0]).toEqual({ type: 'thinking', thinking: '', signature: 's' })
    expect(enviados.at(-1).role).toBe('user')
    expect(enviados.at(-1).content).toHaveLength(1)
    expect(enviados.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1', is_error: true })
    expect(enviados.at(-1).content[0].content).toContain('cortada por longitud')
  })

  it('el corte cuenta como paso para el tope', async () => {
    paso.mockResolvedValue({ content: [uso('tu1', 'escribir')], stop_reason: 'max_tokens', usage: {} })
    const r = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'x' }], ejecutar: vi.fn(), esDelicada: () => true, maxPasos: 3 })
    expect(r.tipo).toBe('tope')
    expect(paso).toHaveBeenCalledTimes(3)
    // Cada tool_use cortado se quedó con su tool_result.
    expect(r.messages.at(-1)).toMatchObject({ role: 'user', content: [{ tool_use_id: 'tu1', is_error: true }] })
  })

  it('una respuesta de texto cortada acaba con el aviso, aunque no haya texto', async () => {
    paso.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Estos son los guiones: 1)' }], stop_reason: 'max_tokens', usage: {} })
    const r1 = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'x' }], ejecutar: vi.fn(), esDelicada: () => false })
    expect(r1.tipo).toBe('fin')
    expect(r1.texto).toBe('Estos son los guiones: 1)\n\n⚠️ La respuesta se ha cortado por largo.')

    paso.mockResolvedValueOnce({ content: [{ type: 'thinking', thinking: '', signature: 's' }], stop_reason: 'max_tokens', usage: {} })
    const r2 = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'x' }], ejecutar: vi.fn(), esDelicada: () => false })
    expect(r2.tipo).toBe('fin')
    expect(r2.texto).toBe('⚠️ La respuesta se ha cortado por largo.')
  })

  it('con el contexto lleno acaba con aviso y sin dejar tool_use sin resultado', async () => {
    paso.mockResolvedValueOnce({ content: [uso('tu1', 'leer')], stop_reason: 'model_context_window_exceeded', usage: {} })
    const ejecutar = vi.fn()
    const r = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'x' }], ejecutar, esDelicada: () => false })
    expect(r.tipo).toBe('fin')
    expect(r.texto).toContain('demasiado larga')
    expect(ejecutar).not.toHaveBeenCalled()
    expect(paso).toHaveBeenCalledTimes(1)
    expect(r.messages.at(-1)).toMatchObject({ role: 'user', content: [{ tool_use_id: 'tu1', is_error: true }] })
  })
})

describe('turnoAgente: lo que no debe tumbar el turno', () => {
  it('si ejecutar lanza, ese tool_use recibe un resultado con error y se sigue', async () => {
    paso
      .mockResolvedValueOnce({ content: [uso('tu1'), uso('tu2')], stop_reason: 'tool_use', usage: {} })
      .mockResolvedValueOnce(contesta('Una ha fallado'))
    const ejecutar = vi.fn()
      .mockRejectedValueOnce(new Error('se cayó la base'))
      .mockResolvedValueOnce({ ok: true, texto: 'bien' })
    const r = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'x' }], ejecutar, esDelicada: () => false })

    expect(r.tipo).toBe('fin')
    expect(paso.mock.calls[1][0].messages.at(-1).content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu1', content: 'No se ha podido: se cayó la base', is_error: true },
      { type: 'tool_result', tool_use_id: 'tu2', content: 'bien' },
    ])
  })

  it('si esDelicada lanza, se trata como delicada', async () => {
    paso.mockResolvedValueOnce({ content: [uso('tu1', 'escribir')], stop_reason: 'tool_use', usage: {} })
    const ejecutar = vi.fn()
    const r = await turnoAgente({ ...base, messages: [{ role: 'user', content: 'x' }], ejecutar, esDelicada: () => { throw new Error('no sé') } })
    expect(r.tipo).toBe('pendiente')
    expect(r.pendientes).toEqual([{ id: 'tu1', name: 'escribir', input: {} }])
    expect(ejecutar).not.toHaveBeenCalled()
  })

  it(`atiende como mucho ${MAX_POR_PASO} herramientas por paso; las de más vuelven con error`, async () => {
    const usos = Array.from({ length: MAX_POR_PASO + 2 }, (_, i) => uso(`t${i}`))
    paso
      .mockResolvedValueOnce({ content: usos, stop_reason: 'tool_use', usage: {} })
      .mockResolvedValueOnce(contesta('vale'))
    const ejecutar = vi.fn().mockResolvedValue({ ok: true, texto: 'x' })
    await turnoAgente({ ...base, messages: [{ role: 'user', content: 'todo' }], ejecutar, esDelicada: () => false })

    expect(ejecutar).toHaveBeenCalledTimes(MAX_POR_PASO)
    const bloques = paso.mock.calls[1][0].messages.at(-1).content
    expect(bloques.map(b => b.tool_use_id)).toEqual(usos.map(u => u.id))
    expect(bloques.filter(b => b.is_error)).toHaveLength(2)
    expect(bloques.at(-1).content).toContain('Demasiadas')
  })

  it('repara los args con el esquema aunque las herramientas lleguen en formato MCP', async () => {
    const esquema = { type: 'object', properties: { perfil: { type: 'string' } } }
    paso
      .mockResolvedValueOnce({ content: [uso('tu1', 'perfiles', { perfil: 'dcc' })], stop_reason: 'tool_use', usage: {} })
      .mockResolvedValueOnce(contesta('ok'))
    await turnoAgente({
      ...base, tools: [{ name: 'perfiles', description: '', inputSchema: esquema }],
      messages: [{ role: 'user', content: 'x' }], ejecutar: vi.fn().mockResolvedValue({ ok: true, texto: 'y' }), esDelicada: () => false,
    })
    expect(repara).toHaveBeenCalledWith({ perfil: 'dcc' }, esquema)
  })
})
