// Créditos a precio fijo (api/_lib/creditos.js + src/helm/precios.js): lo que
// cuesta el Editor de reels según dura el vídeo, que sin saldo no se lanza (402
// con el mensaje que se enseña), que la casa (sin_cobro) y un perfil sin agencia
// no pagan, que el cobro va a mover_saldo con su referencia única y que si la
// base falla no rompe el trabajo. Y GET /api/creditos?action=precios. Supabase
// y el acceso van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = { agencias: {}, perfiles: {}, movimientos: {}, fallaMovimientos: null }
const rpc = vi.fn()
const accede = vi.fn()

vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (tabla) => {
      const filtros = {}
      const q = {
        select: () => q,
        eq: (c, v) => { filtros[c] = v; return q },
        maybeSingle: async () => {
          if (tabla === 'agencia_movimientos') {
            if (db.fallaMovimientos) return { data: null, error: db.fallaMovimientos }
            return { data: structuredClone(db.movimientos[filtros.referencia] || null), error: null }
          }
          return { data: tabla === 'agencias' ? structuredClone(db.agencias[filtros.id] || null) : null, error: null }
        },
      }
      return q
    },
    rpc: (...a) => rpc(...a),
  },
}))
vi.mock('../api/_lib/access.js', () => ({
  agenciaDe: async (clientId) => db.perfiles[clientId] ?? null,
  requireProfileAccess: (...a) => accede(...a),
}))
vi.mock('../api/_lib/auth.js', () => ({
  applyCors: () => {},
  requireSuperAdmin: vi.fn(),
  requirePlataforma: vi.fn(),
  writeAudit: vi.fn(),
}))

const { PRECIOS_FIJOS, precioEditor, quienPagaPerfil, exigirImporte, cobrarFijo, cobradoYa, CREDITOS_POR_EURO } = await import('../api/_lib/creditos.js')
const precios = await import('../src/helm/precios.js')
const { default: creditos } = await import('../api/creditos.js')

// Cada caso con su agencia: creditos.js recuerda las agencias unos segundos.
let n = 0
function agencia({ saldo = 0, sinCobro = false } = {}) {
  const id = `a0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  const perfil = `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  db.agencias[id] = { id, saldo, sin_cobro: sinCobro }
  db.perfiles[perfil] = id
  return { id, perfil }
}
const SIN_AGENCIA = 'c0000000-0000-4000-8000-00000000dead'

beforeEach(() => {
  rpc.mockReset()
  accede.mockReset()
  accede.mockResolvedValue({ userId: 'u1' })
})

describe('precios fijos', () => {
  it('los de Alex, en euros, y los mismos en el servidor y en la pantalla', () => {
    expect(PRECIOS_FIJOS).toEqual({ 'editor-reels': 1.5, 'portada-ia': 0.4, 'trial-reel': 0.3 })
    expect(PRECIOS_FIJOS).toBe(precios.PRECIOS_FIJOS)
    expect(precioEditor).toBe(precios.precioEditor)
    expect(CREDITOS_POR_EURO).toBe(100)
    expect(precios.aCreditos(PRECIOS_FIJOS['portada-ia'])).toBe(40)
    expect(precios.CONCEPTOS['editor-reels']).toBe('Editor de reels')
    // El fondo con IA cuesta como una portada, pero se lee por su nombre.
    expect(precios.CONCEPTOS['fondo-ia']).toBe('Fondo con IA')
    expect(PRECIOS_FIJOS['fondo-ia']).toBeUndefined()
  })

  it('precioEditor: 1,50 € por cada bloque de 3 minutos empezado, mínimo uno', () => {
    expect(precioEditor(0)).toBe(1.5)
    expect(precioEditor(179)).toBe(1.5)
    expect(precioEditor(180)).toBe(1.5)
    expect(precioEditor(181)).toBe(3)
    expect(precioEditor(360)).toBe(3)
    expect(precioEditor(361)).toBe(4.5)
    expect(precioEditor(600)).toBe(6)
  })

  it('precioEditor: medio segundo de gracia y lo raro cuenta como un bloque', () => {
    expect(precioEditor(180.4)).toBe(1.5)
    expect(precioEditor(180.6)).toBe(3)
    expect(precioEditor(NaN)).toBe(1.5)
    expect(precioEditor(-20)).toBe(1.5)
    expect(precioEditor(undefined)).toBe(1.5)
    expect(precioEditor('181')).toBe(3)
  })
})

describe('quienPagaPerfil y exigirImporte', () => {
  it('quién paga: la agencia del perfil con su saldo; nadie sin perfil, sin agencia o en la casa', async () => {
    const a = agencia({ saldo: 2.5 })
    expect(await quienPagaPerfil(a.perfil)).toEqual({ agenciaId: a.id, saldo: 2.5 })
    expect(await quienPagaPerfil(null)).toBeNull()
    expect(await quienPagaPerfil(SIN_AGENCIA)).toBeNull()
    expect(await quienPagaPerfil(agencia({ saldo: 50, sinCobro: true }).perfil)).toBeNull()
  })

  it('con el saldo justo, pasa', async () => {
    const a = agencia({ saldo: 1.5 })
    expect(await exigirImporte(a.perfil, 1.5)).toEqual({ paga: true, saldo: 1.5 })
    // El saldo llega de la base como numeric (texto con cuatro decimales).
    const b = agencia({ saldo: '0.4000' })
    expect(await exigirImporte(b.perfil, PRECIOS_FIJOS['portada-ia'])).toEqual({ paga: true, saldo: 0.4 })
  })

  it('sin saldo suficiente, 402 con lo que cuesta y lo que queda, en créditos', async () => {
    const a = agencia({ saldo: 1 })
    const e = await exigirImporte(a.perfil, 1.5).catch(x => x)
    expect(e.statusCode).toBe(402)
    expect(e.message).toBe('No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 100. Recarga en Créditos.')
    // En negativo (la IA por tokens puede dejarlo un poco por debajo) quedan 0.
    const b = agencia({ saldo: -0.3 })
    await expect(exigirImporte(b.perfil, 0.3)).rejects.toThrow('esto cuesta 30 créditos y te quedan 0.')
    const c = agencia({ saldo: 12.345 })
    await expect(exigirImporte(c.perfil, 15)).rejects.toThrow('esto cuesta 1.500 créditos y te quedan 1.234.')
  })

  it('la casa (sin_cobro) y un perfil sin agencia no pagan: no se exige nada', async () => {
    const casa = agencia({ saldo: 0, sinCobro: true })
    expect(await exigirImporte(casa.perfil, 6)).toEqual({ paga: false, saldo: null })
    expect(await exigirImporte(SIN_AGENCIA, 6)).toEqual({ paga: false, saldo: null })
  })

  it('lo pendiente (trabajos en cola sin cobrar) se aparta del saldo: no se ponen 20 vídeos con 1,50 €', async () => {
    const a = agencia({ saldo: 3 })
    // Con 1,50 € ya comprometidos, queda justo para otro.
    expect(await exigirImporte(a.perfil, 1.5, { pendiente: 1.5 })).toEqual({ paga: true, saldo: 3 })
    const e = await exigirImporte(a.perfil, 1.5, { pendiente: 2 }).catch(x => x)
    expect(e.statusCode).toBe(402)
    expect(e.message).toBe('No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 100 (otros 200 ya están apartados para trabajos que aún no han terminado). Recarga en Créditos.')
    // Más comprometido que saldo: quedan 0, no un número negativo.
    await expect(exigirImporte(a.perfil, 0.3, { pendiente: 4.5 })).rejects.toThrow('te quedan 0 (otros 450 ya están')
    // Lo raro (negativo, NaN) cuenta como nada.
    expect(await exigirImporte(a.perfil, 3, { pendiente: -5 })).toEqual({ paga: true, saldo: 3 })
    expect(await exigirImporte(a.perfil, 3, { pendiente: NaN })).toEqual({ paga: true, saldo: 3 })
  })

  it('pendiente como función: recibe la agencia y el perfil, y solo se llama si la agencia paga', async () => {
    const a = agencia({ saldo: 2 })
    const suma = vi.fn(async () => 1)
    await expect(exigirImporte(a.perfil, 1.5, { pendiente: suma })).rejects.toMatchObject({ statusCode: 402 })
    expect(suma).toHaveBeenCalledWith({ agenciaId: a.id, clientId: a.perfil })
    const casa = agencia({ saldo: 0, sinCobro: true })
    const nunca = vi.fn(async () => 99)
    expect(await exigirImporte(casa.perfil, 1.5, { pendiente: nunca })).toEqual({ paga: false, saldo: null })
    expect(await exigirImporte(SIN_AGENCIA, 1.5, { pendiente: nunca })).toEqual({ paga: false, saldo: null })
    expect(nunca).not.toHaveBeenCalled()
    // Si no se puede saber lo pendiente (falla la base), no se lanza a ciegas.
    await expect(exigirImporte(a.perfil, 0.3, { pendiente: async () => { throw new Error('la base no contesta') } })).rejects.toThrow('la base no contesta')
  })
})

describe('cobrarFijo', () => {
  it('llama a mover_saldo con el importe en negativo, el concepto y la referencia', async () => {
    const a = agencia({ saldo: 5 })
    rpc.mockResolvedValueOnce({ data: 3.5, error: null })
    const saldo = await cobrarFijo(a.perfil, 1.5, { concepto: 'editor-reels', referencia: 'editor:e1', origen: 'auto' })
    expect(saldo).toBe(3.5)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('mover_saldo', {
      p_agencia: a.id, p_importe: -1.5, p_tipo: 'consumo', p_origen: 'auto',
      p_client: a.perfil, p_modelo: 'editor-reels', p_tokens_in: 0, p_tokens_out: 0, p_coste_usd: 0,
      p_referencia: 'editor:e1',
    })
  })

  it('origen por defecto «panel»; la misma referencia otra vez → la base no cobra y devuelve null', async () => {
    const a = agencia({ saldo: 5 })
    rpc.mockResolvedValueOnce({ data: '4.6000', error: null }).mockResolvedValueOnce({ data: null, error: null })
    expect(await cobrarFijo(a.perfil, 0.4, { concepto: 'portada-ia', referencia: 'portada:x' })).toBe(4.6)
    expect(rpc.mock.calls[0][1].p_origen).toBe('panel')
    expect(await cobrarFijo(a.perfil, 0.4, { concepto: 'portada-ia', referencia: 'portada:x' })).toBeNull()
    expect(rpc.mock.calls[1][1].p_referencia).toBe('portada:x')
  })

  it('si no paga (casa o sin agencia), no llama a la base', async () => {
    const casa = agencia({ saldo: 0, sinCobro: true })
    expect(await cobrarFijo(casa.perfil, 1.5, { concepto: 'editor-reels', referencia: 'editor:casa' })).toBeNull()
    expect(await cobrarFijo(SIN_AGENCIA, 1.5, { concepto: 'editor-reels', referencia: 'editor:nadie' })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sin referencia o sin importe no cobra (nunca a ciegas)', async () => {
    const a = agencia({ saldo: 5 })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await cobrarFijo(a.perfil, 1.5, { concepto: 'editor-reels' })).toBeNull()
    expect(await cobrarFijo(a.perfil, 0, { concepto: 'editor-reels', referencia: 'editor:cero' })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('costeUsd: lo que nos cuesta por fuera va en p_coste_usd (lo raro, 0)', async () => {
    const a = agencia({ saldo: 5 })
    rpc.mockResolvedValue({ data: 4.6, error: null })
    await cobrarFijo(a.perfil, 0.4, { concepto: 'portada-ia', referencia: 'portada:c1', costeUsd: 0.04 })
    await cobrarFijo(a.perfil, 0.4, { concepto: 'fondo-ia', referencia: 'portada:c2', costeUsd: 'mucho' })
    expect(rpc.mock.calls.map(c => [c[1].p_modelo, c[1].p_coste_usd])).toEqual([['portada-ia', 0.04], ['fondo-ia', 0]])
  })

  it('si la RPC falla (error o excepción), no lanza: devuelve null y queda en el log', async () => {
    const a = agencia({ saldo: 5 })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'la base no contesta' } })
    await expect(cobrarFijo(a.perfil, 1.5, { concepto: 'editor-reels', referencia: 'editor:r1' })).resolves.toBeNull()
    rpc.mockRejectedValueOnce(new Error('se fue la red'))
    await expect(cobrarFijo(a.perfil, 0.3, { concepto: 'trial-reel', referencia: 'trial:r2' })).resolves.toBeNull()
    expect(log).toHaveBeenCalledTimes(2)
    expect(String(log.mock.calls[0].join(' '))).toContain('editor:r1')
    log.mockRestore()
  })
})

describe('cobradoYa', () => {
  beforeEach(() => { db.movimientos = {}; db.fallaMovimientos = null })

  it('lo cobrado con esa referencia, en euros y en positivo; sin cobro, null', async () => {
    db.movimientos['editor:e1'] = { importe: '-1.5000' }
    expect(await cobradoYa('editor:e1')).toBe(1.5)
    expect(await cobradoYa('editor:otro')).toBeNull()
    expect(await cobradoYa('')).toBeNull()
  })

  it('si la base falla, lanza (no se sabe: hay que volver a mirar)', async () => {
    db.fallaMovimientos = { message: 'la base no contesta' }
    await expect(cobradoYa('editor:e1')).rejects.toMatchObject({ message: 'la base no contesta' })
  })
})

describe('GET /api/creditos?action=precios', () => {
  async function llama(query) {
    const res = {
      statusCode: 200, body: null, headers: {},
      status(c) { this.statusCode = c; return this },
      json(b) { this.body = b; return this },
      setHeader(k, v) { this.headers[k] = v },
      end() { return this },
    }
    await creditos({ method: 'GET', query: { action: 'precios', ...query }, headers: {} }, res)
    return res
  }

  it('dice si el perfil paga, su saldo y los precios (en euros), pasando por el acceso al perfil', async () => {
    const a = agencia({ saldo: 3.2 })
    const r = await llama({ clientId: a.perfil })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ paga: true, saldo: 3.2, precios: { 'editor-reels': 1.5, 'portada-ia': 0.4, 'trial-reel': 0.3 } })
    expect(accede).toHaveBeenCalledWith(expect.anything(), a.perfil)
  })

  it('la casa: no paga y sin saldo que enseñar', async () => {
    const casa = agencia({ saldo: 0, sinCobro: true })
    expect((await llama({ clientId: casa.perfil })).body).toMatchObject({ paga: false, saldo: null })
  })

  it('sin perfil, 400; perfil ajeno, lo que diga el acceso (403)', async () => {
    expect((await llama({})).statusCode).toBe(400)
    // Un id que no es un UUID ni llega a la base.
    const raro = await llama({ clientId: "x' or 1=1" })
    expect([raro.statusCode, raro.body]).toEqual([400, { error: 'Ese perfil no es válido' }])
    expect(accede).not.toHaveBeenCalled()
    accede.mockRejectedValueOnce(Object.assign(new Error('No tienes acceso a este perfil'), { statusCode: 403 }))
    const r = await llama({ clientId: agencia({ saldo: 1 }).perfil })
    expect(r.statusCode).toBe(403)
    expect(r.body).toEqual({ error: 'No tienes acceso a este perfil' })
  })
})
