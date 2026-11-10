// Créditos a precio fijo, RETIRADOS el 2026-11-08 (licencia anual + trae-tu-
// clave): lo que queda de api/_lib/creditos.js y src/helm/precios.js. Que
// nadie paga (quienPagaPerfil null, exigirImporte no frena aunque no haya
// saldo, cobrarFijo no toca la base, preciosDelPerfil dice paga: false) y GET
// /api/creditos?action=precios igual. Lo que no decide nada pero sigue ahí
// (lo apartado, el cerrojo por agencia, cobradoYa, los precios) sigue
// funcionando como antes. Supabase y el acceso van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = { agencias: {}, perfiles: {}, movimientos: {}, fallaMovimientos: null, ediciones: [], variantes: [], fallas: {} }
const rpc = vi.fn()
const accede = vi.fn()
const ver = vi.fn()

// Lo que devuelve una consulta de lista (await sobre la cadena), con sus filtros.
function lista(tabla, f) {
  if (db.fallas[tabla]) return { data: null, error: db.fallas[tabla] }
  const de = (filas) => filas.filter(r => (!f.client_id_in || f.client_id_in.includes(r.client_id))
    && (!f.estado_in || f.estado_in.includes(r.estado))
    && (!('cobrado_eur_is' in f) || r.cobrado_eur == null))
  if (tabla === 'clients') return { data: Object.entries(db.perfiles).filter(([, ag]) => ag === f.agencia_id).map(([id]) => ({ id })), error: null }
  if (tabla === 'helm_ediciones') return { data: structuredClone(de(db.ediciones)), error: null }
  if (tabla === 'helm_trial_reels') return { data: structuredClone(de(db.variantes)), error: null }
  return { data: [], error: null }
}

vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (tabla) => {
      const filtros = {}
      const q = {
        select: () => q,
        eq: (c, v) => { filtros[c] = v; return q },
        in: (c, v) => { filtros[`${c}_in`] = v; return q },
        is: (c, v) => { filtros[`${c}_is`] = v; return q },
        maybeSingle: async () => {
          if (tabla === 'agencia_movimientos') {
            if (db.fallaMovimientos) return { data: null, error: db.fallaMovimientos }
            return { data: structuredClone(db.movimientos[filtros.referencia] || null), error: null }
          }
          return { data: tabla === 'agencias' ? structuredClone(db.agencias[filtros.id] || null) : null, error: null }
        },
        then: (ok, ko) => Promise.resolve(lista(tabla, filtros)).then(ok, ko),
      }
      return q
    },
    rpc: (...a) => rpc(...a),
  },
}))
vi.mock('../api/_lib/access.js', () => ({
  agenciaDe: async (clientId) => db.perfiles[clientId] ?? null,
  requireProfileAccess: (...a) => accede(...a),
  puedeVerSaldo: (...a) => ver(...a),
}))
vi.mock('../api/_lib/auth.js', () => ({
  applyCors: () => {},
  validateAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  requirePlataforma: vi.fn(),
  writeAudit: vi.fn(),
}))
vi.mock('../api/_lib/llm.js', () => ({ olvidarProveedor: () => {} }))

const {
  PRECIOS_FIJOS, precioEditor, quienPagaPerfil, exigirImporte, cobrarFijo, cobradoYa, CREDITOS_POR_EURO,
  apartadoDeAgencia, reservaTemporal, conCerrojoAgencia, preciosDelPerfil,
} = await import('../api/_lib/creditos.js')
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
// Otro perfil de la misma agencia.
let m = 0
function otroPerfil(agenciaId) {
  const id = `d0000000-0000-4000-8000-${String(++m).padStart(12, '0')}`
  db.perfiles[id] = agenciaId
  return id
}
const hace = (ms) => new Date(Date.now() - ms).toISOString()
const edicion = (client_id, extra = {}) => ({ id: `e-${db.ediciones.length + 1}`, client_id, estado: 'en_cola', precio_eur: 1.5, cobrado_eur: null, created_at: hace(60_000), updated_at: hace(60_000), ...extra })
const variante = (client_id, extra = {}) => ({ client_id, estado: 'en_cola', precio_eur: 0.3, cobrado_eur: null, updated_at: hace(60_000), ...extra })

beforeEach(() => {
  rpc.mockReset()
  accede.mockReset()
  accede.mockResolvedValue({ userId: 'u1' })
  ver.mockReset()
  ver.mockResolvedValue(true)
  db.ediciones = []
  db.variantes = []
  db.fallas = {}
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

  it('creditosQueQuedan: hacia abajo como el servidor, nunca negativo, y null sin saldo que enseñar', () => {
    expect(precios.creditosQueQuedan(1.4987)).toBe(149)
    expect(precios.creditosQueQuedan('0.2900')).toBe(29)
    expect(precios.creditosQueQuedan(5)).toBe(500)
    expect(precios.creditosQueQuedan(-0.3)).toBe(0)
    expect(precios.creditosQueQuedan(null)).toBeNull()
    expect(precios.creditosQueQuedan(undefined)).toBeNull()
    expect(precios.creditosQueQuedan('')).toBeNull()
    expect(precios.creditosQueQuedan('nada')).toBeNull()
  })
})

describe('desde la licencia, nadie paga por trabajo', () => {
  it('quienPagaPerfil: null siempre (con saldo, sin saldo, la casa o sin agencia)', async () => {
    for (const perfil of [agencia({ saldo: 50 }).perfil, agencia({ saldo: 0 }).perfil, agencia({ sinCobro: true }).perfil, SIN_AGENCIA, null]) {
      expect(await quienPagaPerfil(perfil)).toBeNull()
    }
  })

  it('exigirImporte no frena nada, ni sin saldo ni con todo apartado, y no mira la base', async () => {
    const a = agencia({ saldo: 0 })
    db.ediciones.push(edicion(a.perfil, { precio_eur: 15 }))
    db.fallas.helm_ediciones = { code: '57014', message: 'no debería consultarse' }
    expect(await exigirImporte(a.perfil, 6, { detalle: true })).toEqual({ paga: false, saldo: null })
    expect(await exigirImporte(a.perfil, 1.5, { pendiente: 99 })).toEqual({ paga: false, saldo: null })
  })

  it('cobrarFijo no cobra ni llama a la base', async () => {
    const a = agencia({ saldo: 5 })
    expect(await cobrarFijo(a.perfil, 1.5, { concepto: 'editor-reels', referencia: 'editor:e1', origen: 'auto' })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('preciosDelPerfil: paga false y sin saldo, con los precios de referencia', async () => {
    expect(await preciosDelPerfil(agencia({ saldo: 3 }).perfil, { verSaldo: true })).toEqual({ paga: false, saldo: null, precios: PRECIOS_FIJOS })
  })
})

describe('lo apartado, común a todos los agentes', () => {
  it('suma ediciones en marcha sin cobrar y variantes en cola o montándose de TODOS los perfiles de la agencia', async () => {
    const a = agencia({ saldo: 10 })
    const otro = otroPerfil(a.id)
    const ajena = agencia({ saldo: 10 })
    db.ediciones.push(
      edicion(a.perfil, { estado: 'subiendo' }),
      edicion(a.perfil, { estado: 'en_cola', precio_eur: 3 }),
      edicion(otro, { estado: 'transcribiendo' }),
      edicion(otro, { estado: 'montando', precio_eur: '4.5000' }),
      // Lo que ya no cuenta: acabado, fallido, cobrado o de otra agencia.
      edicion(a.perfil, { estado: 'listo' }),
      edicion(a.perfil, { estado: 'error' }),
      edicion(otro, { estado: 'montando', cobrado_eur: 1.5 }),
      edicion(ajena.perfil, { estado: 'en_cola' }),
    )
    db.variantes.push(
      variante(a.perfil),
      variante(otro, { estado: 'procesando' }),
      variante(a.perfil, { estado: 'listo' }),
      variante(a.perfil, { cobrado_eur: 0.3 }),
      variante(ajena.perfil),
    )
    // 1,50 + 3 + 1,50 + 4,50 de ediciones y 0,30 + 0,30 de variantes, en céntimos.
    expect(await apartadoDeAgencia(a.id)).toBe(11.1)
    expect(await apartadoDeAgencia(ajena.id)).toBe(1.8)
    expect(await apartadoDeAgencia(null)).toBe(0)
  })

  it('no cuenta la edición que se está lanzando, ni una subida abandonada, ni una variante colgada por un reinicio', async () => {
    const a = agencia({ saldo: 10 })
    db.ediciones.push(
      edicion(a.perfil, { id: 'esta', estado: 'subiendo' }),
      edicion(a.perfil, { estado: 'subiendo', updated_at: hace(7 * 3600_000) }),
      // Lo que lleva horas en cola o montándose sí cuenta: lo cierra el worker, no esto.
      edicion(a.perfil, { estado: 'en_cola', updated_at: hace(7 * 3600_000) }),
    )
    db.variantes.push(
      variante(a.perfil, { estado: 'procesando', updated_at: hace(20 * 60_000) }),
      variante(a.perfil, { estado: 'en_cola', updated_at: hace(20 * 60_000) }),
    )
    expect(await apartadoDeAgencia(a.id)).toBe(3.3)
    expect(await apartadoDeAgencia(a.id, { excluirEdicion: 'esta' })).toBe(1.8)
  })

  it('las reservas en memoria (Portadas generando) cuentan hasta liberarlas, y liberar dos veces no suelta dos', async () => {
    const a = agencia({ saldo: 10 })
    const b = agencia({ saldo: 10 })
    const l1 = reservaTemporal(a.id, 0.4)
    const l2 = reservaTemporal(a.id, 0.4)
    expect(await apartadoDeAgencia(a.id)).toBe(0.8)
    expect(await apartadoDeAgencia(b.id)).toBe(0)
    l1()
    l1()
    expect(await apartadoDeAgencia(a.id)).toBe(0.4)
    l2()
    expect(await apartadoDeAgencia(a.id)).toBe(0)
    // Sin agencia o sin importe, no aparta nada (y liberar no rompe).
    expect(() => reservaTemporal(null, 0.4)()).not.toThrow()
    expect(() => reservaTemporal(a.id, 0)()).not.toThrow()
    expect(await apartadoDeAgencia(a.id)).toBe(0)
  })

  it('una agencia sin perfiles solo tiene lo reservado en memoria', async () => {
    const id = 'a0000000-0000-4000-8000-0000000fffff'
    db.agencias[id] = { id, saldo: 1, sin_cobro: false }
    const libera = reservaTemporal(id, 0.4)
    expect(await apartadoDeAgencia(id)).toBe(0.4)
    libera()
  })

  it('si falta la tabla de un agente (su migración), cuenta 0; si la base falla de otra forma, lanza', async () => {
    const a = agencia({ saldo: 10 })
    db.ediciones.push(edicion(a.perfil))
    db.variantes.push(variante(a.perfil))
    db.fallas.helm_trial_reels = { code: '42P01', message: 'relation "helm_trial_reels" does not exist' }
    expect(await apartadoDeAgencia(a.id)).toBe(1.5)
    db.fallas.helm_trial_reels = null
    db.fallas.helm_ediciones = { code: 'PGRST205', message: "Could not find the table 'public.helm_ediciones' in the schema cache" }
    expect(await apartadoDeAgencia(a.id)).toBe(0.3)
    db.fallas.helm_ediciones = { code: '57014', message: 'canceling statement due to statement timeout' }
    await expect(apartadoDeAgencia(a.id)).rejects.toMatchObject({ code: '57014' })
  })
})

describe('conCerrojoAgencia', () => {
  const espera = (ms) => new Promise(ok => setTimeout(ok, ms))

  it('de uno en uno por agencia; dos agencias a la vez no se esperan', async () => {
    const orden = []
    const trabajo = (nombre, ms) => async () => { orden.push(`${nombre}:entra`); await espera(ms); orden.push(`${nombre}:sale`); return nombre }
    const r = await Promise.all([
      conCerrojoAgencia('ag-x', trabajo('a', 20)),
      conCerrojoAgencia('ag-x', trabajo('b', 1)),
      conCerrojoAgencia('ag-y', trabajo('c', 1)),
    ])
    expect(r).toEqual(['a', 'b', 'c'])
    expect(orden.indexOf('a:sale')).toBeLessThan(orden.indexOf('b:entra'))
    expect(orden.indexOf('c:sale')).toBeLessThan(orden.indexOf('a:sale'))
  })

  it('si `fn` lanza, se suelta igual; y sin agencia no espera a nadie', async () => {
    await expect(conCerrojoAgencia('ag-z', async () => { throw new Error('mal') })).rejects.toThrow('mal')
    expect(await conCerrojoAgencia('ag-z', async () => 'sigue')).toBe('sigue')
    let suelta
    const larga = conCerrojoAgencia('ag-w', () => new Promise(ok => { suelta = ok }))
    expect(await conCerrojoAgencia(null, async () => 'sin agencia')).toBe('sin agencia')
    suelta('fin')
    expect(await larga).toBe('fin')
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

  it('sea quien sea y tenga la agencia el saldo que tenga: no paga, sin saldo, y pasando por el acceso al perfil', async () => {
    const a = agencia({ saldo: 3.2 })
    const r = await llama({ clientId: a.perfil })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ paga: false, saldo: null, precios: { 'editor-reels': 1.5, 'portada-ia': 0.4, 'trial-reel': 0.3 } })
    expect(accede).toHaveBeenCalledWith(expect.anything(), a.perfil)
    const casa = agencia({ saldo: 0, sinCobro: true })
    expect((await llama({ clientId: casa.perfil })).body).toEqual({ paga: false, saldo: null, precios: PRECIOS_FIJOS })
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
