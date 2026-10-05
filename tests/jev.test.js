// El cliente de Jev: qué manda, qué devuelve y cuándo reintenta. Sin red.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.stubEnv('TYPESAFE_API_KEY', 'clave-de-prueba')
const { jevDecide, jevDisponible, etiquetaConJev } = await import('../api/_lib/jev.js')

const respuesta = (status, body, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
})

describe('jev', () => {
  let llamadas
  beforeEach(() => { llamadas = [] })

  it('manda el contenido y las preguntas con la clave, y devuelve las respuestas', async () => {
    const fetchImpl = async (url, opts) => {
      llamadas.push({ url, opts })
      return respuesta(200, { model: 'jev-1.13.0', answers: { g: { type: 'choice', choice: 'dato', confidence: 0.8 } }, usage: { input_tokens: 300 } })
    }
    const preguntas = { g: { type: 'choice', instructions: '¿Qué gancho?', criteria: { dato: null, pregunta: null } } }
    const r = await jevDecide({ 0: 'El 90 % falla en esto.' }, preguntas, { fetchImpl })
    expect(jevDisponible()).toBe(true)
    expect(llamadas[0].url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(llamadas[0].opts.headers.Authorization).toBe('Bearer clave-de-prueba')
    expect(JSON.parse(llamadas[0].opts.body)).toEqual({ state: { 0: 'El 90 % falla en esto.' }, model: 'jev-1.13.0', questions: preguntas })
    expect(r).toEqual({ answers: { g: { type: 'choice', choice: 'dato', confidence: 0.8 } }, tokens: 300, modelo: 'jev-1.13.0' })
  })

  it('reintenta si le dicen que espere (429) y acaba contestando', async () => {
    let n = 0
    const fetchImpl = async () => (++n === 1
      ? respuesta(429, {}, { 'retry-after': '0.01' })
      : respuesta(200, { answers: { a: { type: 'noul', noul: 0.9 } } }))
    const r = await jevDecide('texto', { a: { type: 'noul', instructions: '¿Urge?' } }, { fetchImpl })
    expect(n).toBe(2)
    expect(r.answers.a.noul).toBe(0.9)
  })

  it('no reintenta una petición mal formada (422): falla con el motivo', async () => {
    let n = 0
    const fetchImpl = async () => { n++; return respuesta(422, { error: 'criteria: required' }) }
    await expect(jevDecide('texto', { a: { type: 'choice', instructions: 'x' } }, { fetchImpl })).rejects.toThrow(/422.*criteria/)
    expect(n).toBe(1)
  })

  it('etiqueta un guion: una pregunta por etiqueta y por línea, y la CTA sale de las líneas de venta', async () => {
    let cuerpo
    const fetchImpl = async (_url, opts) => {
      cuerpo = JSON.parse(opts.body)
      return respuesta(200, { answers: {
        tipo_gancho: { choice: 'dato', confidence: 0.9 },
        estructura: { choice: 'algo-inventado', confidence: 0.4 },
        tipo: { choice: 'conversion', confidence: 0.7 },
        rol_0: { choice: 'gancho' }, rol_1: { choice: 'planteamiento' }, rol_2: { choice: 'venta' },
      } })
    }
    const out = await etiquetaConJev(['El 90 % falla en esto.', 'Te explico por qué.', 'Comenta GUIA y te la mando.'], { fetchImpl })
    expect(cuerpo.state).toEqual({ 0: 'El 90 % falla en esto.', 1: 'Te explico por qué.', 2: 'Comenta GUIA y te la mando.' })
    expect(Object.keys(cuerpo.questions)).toEqual(['tipo_gancho', 'estructura', 'tipo', 'rol_0', 'rol_1', 'rol_2'])
    // Una opción fuera de la lista se queda vacía, no se guarda inventada.
    expect(out).toMatchObject({ tema: '', tipo_gancho: 'dato', estructura: '', tipo: 'conversion', cta: 'Comenta GUIA y te la mando.', confianza: 0.4 })
    expect(out.frases.map(f => f.rol)).toEqual(['gancho', 'planteamiento', 'venta'])
  })
})
