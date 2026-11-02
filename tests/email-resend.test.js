// Email marketing · el cliente de Resend (api/_lib/email/resend.js), con
// `fetch` simulado: nada sale a la red. Más de 100 correos se parten en lotes
// de 100, cada lote con su Idempotency-Key; un 429 se respeta (Retry-After) y
// se reintenta con la MISMA clave, igual que un 5xx o un fallo de red; el
// cupo del plan no se reintenta; y cada error dice si es de la campaña (clave,
// remitente) o de un correo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  enviarLote, enviarTodos, enviarUno, verificarClave, estadoDominio, traduceError, _espera, _olvidaRitmo, MAX_LOTE,
} from '../api/_lib/email/resend.js'

const esperas = []
const llamadas = []
let respuestas = []

const respuesta = (status, cuerpo, cabeceras = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (n) => cabeceras[n.toLowerCase()] ?? null },
  json: async () => cuerpo,
})

beforeEach(() => {
  esperas.length = 0
  llamadas.length = 0
  respuestas = []
  _olvidaRitmo()
  vi.spyOn(_espera, 'ms').mockImplementation(async (n) => { esperas.push(n) })
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const cuerpo = opts.body ? JSON.parse(opts.body) : undefined
    llamadas.push({ url, metodo: opts.method, cabeceras: opts.headers, cuerpo })
    const r = respuestas.shift()
    if (r instanceof Error) throw r
    if (typeof r === 'function') return r(cuerpo)
    return r || respuesta(200, { data: (Array.isArray(cuerpo) ? cuerpo : []).map((_, i) => ({ id: `re_${llamadas.length}_${i}` })) })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const correo = (i) => ({ from: 'hola@acme.es', to: [`p${i}@x.es`], subject: 's', html: '<p>h</p>', text: 'h' })

describe('Resend · lotes', () => {
  it('250 correos son 3 lotes (100, 100, 50), cada uno con su clave, y los ids vuelven en orden', async () => {
    const ids = await enviarTodos('re_clave_123456', Array.from({ length: 250 }, (_, i) => correo(i)), { clave: 'prueba-1' })
    expect(llamadas.map(l => l.cuerpo.length)).toEqual([100, 100, 50])
    expect(llamadas.every(l => l.url === 'https://api.resend.com/emails/batch' && l.metodo === 'POST')).toBe(true)
    expect(llamadas.map(l => l.cabeceras['Idempotency-Key'])).toEqual(['prueba-1:1', 'prueba-1:2', 'prueba-1:3'])
    expect(llamadas[0].cabeceras.Authorization).toBe('Bearer re_clave_123456')
    expect(ids).toHaveLength(250)
    expect(ids[0]).toBe('re_1_0')
    expect(ids[249]).toBe('re_3_49')
    expect(llamadas[2].cuerpo[49].to).toEqual(['p249@x.es'])
  })

  it('va a su ritmo: entre llamada y llamada con la misma clave espera (2 por segundo)', async () => {
    await enviarTodos('re_clave_123456', Array.from({ length: 201 }, (_, i) => correo(i)), { clave: 'r' })
    expect(esperas.filter(n => n > 0).length).toBeGreaterThanOrEqual(2)
    expect(esperas.every(n => n <= 550)).toBe(true)
  })

  it('un lote sin clave o de más de 100 no se manda', async () => {
    await expect(enviarLote('re_x_12345678', [correo(1)], {})).rejects.toThrow(/Idempotency-Key/)
    await expect(enviarLote('re_x_12345678', Array.from({ length: MAX_LOTE + 1 }, (_, i) => correo(i)), { idempotencia: 'k' })).rejects.toThrow(/como mucho 100/)
    expect(llamadas).toHaveLength(0)
  })
})

describe('Resend · reintentos', () => {
  it('un 429 espera lo que pide Retry-After y repite con la MISMA Idempotency-Key', async () => {
    respuestas = [respuesta(429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { 'retry-after': '3' })]
    const ids = await enviarLote('re_clave_123456', [correo(1), correo(2)], { idempotencia: 'lote-a' })
    expect(llamadas).toHaveLength(2)
    expect(llamadas.map(l => l.cabeceras['Idempotency-Key'])).toEqual(['lote-a', 'lote-a'])
    expect(JSON.stringify(llamadas[0].cuerpo)).toBe(JSON.stringify(llamadas[1].cuerpo))
    expect(esperas).toContain(3000)
    expect(ids).toEqual(['re_2_0', 're_2_1'])
  })

  it('un 5xx o un fallo de red también se repiten; si no ceden, sube un error reintentable', async () => {
    respuestas = [new TypeError('fetch failed'), respuesta(502, { message: 'Bad gateway' })]
    expect(await enviarLote('re_clave_123456', [correo(1)], { idempotencia: 'k' })).toEqual(['re_3_0'])
    respuestas = [respuesta(500, {}), respuesta(500, {}), respuesta(500, {}), respuesta(500, {})]
    await expect(enviarLote('re_clave_123456', [correo(1)], { idempotencia: 'k2' })).rejects.toMatchObject({ reintentable: true })
    expect(llamadas.filter(l => l.cabeceras['Idempotency-Key'] === 'k2')).toHaveLength(4)
  })

  it('el cupo diario o mensual del plan no se reintenta', async () => {
    respuestas = [respuesta(429, { name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' })]
    await expect(enviarLote('re_clave_123456', [correo(1)], { idempotencia: 'k' })).rejects.toMatchObject({ cupo: true, reintentable: false })
    expect(llamadas).toHaveLength(1)
  })

  it('un 409 por la misma clave con otro contenido es «no se sabe»; uno concurrente se reintenta', async () => {
    respuestas = [respuesta(409, { name: 'invalid_idempotent_request', message: 'Same idempotency key used with a different request payload.' })]
    await expect(enviarLote('re_clave_123456', [correo(1)], { idempotencia: 'k' })).rejects.toMatchObject({ idempotencia: true })
    respuestas = [respuesta(409, { name: 'concurrent_idempotent_requests', message: 'Same idempotency key used while original request is still in progress.' })]
    expect(await enviarLote('re_clave_123456', [correo(1)], { idempotencia: 'k3' })).toHaveLength(1)
  })
})

describe('Resend · errores y clave', () => {
  it('la clave o el remitente son de la campaña; un correo malo, del correo', () => {
    expect(traduceError(401, { name: 'invalid_api_key', message: 'API key is invalid' })).toMatchObject({ deCampana: true })
    expect(traduceError(403, { name: 'validation_error', message: 'The acme.es domain is not verified.' })).toMatchObject({ deCampana: true })
    expect(traduceError(422, { name: 'validation_error', message: 'Invalid `from` field.' })).toMatchObject({ deCampana: true })
    expect(traduceError(422, { name: 'validation_error', message: 'Invalid `to` field.' })).toMatchObject({ validacion: true, deCampana: false })
  })

  it('verificarClave lista los dominios; una clave de solo envío vale pero no deja comprobarlos', async () => {
    respuestas = [respuesta(200, { object: 'list', data: [{ name: 'Acme.es', status: 'verified' }, { name: 'otra.es', status: 'pending' }] })]
    const r = await verificarClave('re_clave_123456')
    expect(llamadas[0]).toMatchObject({ url: 'https://api.resend.com/domains', metodo: 'GET' })
    expect(r).toEqual({ restringida: false, dominios: [{ nombre: 'acme.es', estado: 'verified' }, { nombre: 'otra.es', estado: 'pending' }] })
    expect(estadoDominio(r.dominios, 'hola@ACME.es')).toBe('verified')
    expect(estadoDominio(r.dominios, 'hola@otra.es')).toBe('pending')
    expect(estadoDominio(r.dominios, 'hola@nada.es')).toBeNull()

    respuestas = [respuesta(401, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails' })]
    expect(await verificarClave('re_solo_envio_1')).toEqual({ restringida: true, dominios: [] })
    respuestas = [respuesta(401, { name: 'invalid_api_key', message: 'API key is invalid' })]
    await expect(verificarClave('re_mala_123456')).rejects.toThrow(/no reconoce la clave/)
  })

  it('un correo suelto va a /emails con su clave', async () => {
    respuestas = [respuesta(200, { id: 're_suelto' })]
    expect(await enviarUno('re_clave_123456', correo(1), { idempotencia: 'lote-x-7' })).toBe('re_suelto')
    expect(llamadas[0]).toMatchObject({ url: 'https://api.resend.com/emails', metodo: 'POST' })
    expect(llamadas[0].cabeceras['Idempotency-Key']).toBe('lote-x-7')
  })
})
