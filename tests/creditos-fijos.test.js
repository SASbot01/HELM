// Créditos a precio fijo (api/_lib/creditos.js + src/helm/precios.js): lo que
// cuesta el Editor de reels según dura el vídeo, que sin saldo no se lanza (402
// con el mensaje que se enseña: con cifras solo a quien administra), que lo
// apartado por TODOS los agentes de la agencia (ediciones y variantes en
// marcha sin cobrar, y las reservas en memoria) se resta antes de lanzar y
// antes de llamar a Claude, que comprobar y apartar van de uno en uno por
// agencia, que la casa (sin_cobro) y un perfil sin agencia no pagan, que el
// cobro va a mover_saldo con su referencia única y que si la base falla no
// rompe el trabajo. Y GET /api/creditos?action=precios (el saldo, solo a quien
// administra). Supabase y el acceso van simulados.
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
  requireSuperAdmin: vi.fn(),
  requirePlataforma: vi.fn(),
  writeAudit: vi.fn(),
}))

const {
  PRECIOS_FIJOS, precioEditor, quienPagaPerfil, exigirImporte, cobrarFijo, cobradoYa, CREDITOS_POR_EURO,
  apartadoDeAgencia, reservaTemporal, conCerrojoAgencia, exigirSaldo, preciosDelPerfil,
} = await import('../api/_lib/creditos.js')
const { enContexto } = await import('../api/_lib/contexto.js')
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
const GENERICO = (cuesta) => `La agencia no tiene créditos suficientes para esto (cuesta ${cuesta} créditos). Pide a quien administra la agencia que recargue.`

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

  it('sin saldo suficiente, a quien administra (detalle): 402 con lo que cuesta y lo que queda, en créditos', async () => {
    const a = agencia({ saldo: 1 })
    const e = await exigirImporte(a.perfil, 1.5, { detalle: true }).catch(x => x)
    expect(e.statusCode).toBe(402)
    expect(e.message).toBe('No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 100. Recarga en Créditos.')
    // En negativo (la IA por tokens puede dejarlo un poco por debajo) quedan 0.
    const b = agencia({ saldo: -0.3 })
    await expect(exigirImporte(b.perfil, 0.3, { detalle: true })).rejects.toThrow('esto cuesta 30 créditos y te quedan 0.')
    const c = agencia({ saldo: 12.345 })
    await expect(exigirImporte(c.perfil, 15, { detalle: true })).rejects.toThrow('esto cuesta 1.500 créditos y te quedan 1.234.')
  })

  it('sin detalle (por defecto, quien no administra): un 402 genérico, sin el saldo ni lo apartado', async () => {
    const a = agencia({ saldo: 1 })
    db.ediciones.push(edicion(otroPerfil(a.id), { precio_eur: 0.5 }))
    const e = await exigirImporte(a.perfil, 1.5).catch(x => x)
    expect(e.statusCode).toBe(402)
    expect(e.message).toBe(GENERICO('150'))
    expect(e.message).not.toMatch(/quedan|apartad/)
    await expect(exigirImporte(agencia({ saldo: 12.345 }).perfil, 15, { detalle: false })).rejects.toThrow(GENERICO('1.500'))
  })

  it('la casa (sin_cobro) y un perfil sin agencia no pagan: no se exige nada', async () => {
    const casa = agencia({ saldo: 0, sinCobro: true })
    expect(await exigirImporte(casa.perfil, 6)).toEqual({ paga: false, saldo: null })
    expect(await exigirImporte(SIN_AGENCIA, 6)).toEqual({ paga: false, saldo: null })
  })

  it('lo pendiente que se pasa a mano (como hasta ahora) se aparta del saldo: no se ponen 20 vídeos con 1,50 €', async () => {
    const a = agencia({ saldo: 3 })
    // Con 1,50 € ya comprometidos, queda justo para otro.
    expect(await exigirImporte(a.perfil, 1.5, { pendiente: 1.5 })).toEqual({ paga: true, saldo: 3 })
    const e = await exigirImporte(a.perfil, 1.5, { pendiente: 2, detalle: true }).catch(x => x)
    expect(e.statusCode).toBe(402)
    expect(e.message).toBe('No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 100 (otros 200 ya están apartados para trabajos que aún no han terminado). Recarga en Créditos.')
    // Más comprometido que saldo: quedan 0, no un número negativo.
    await expect(exigirImporte(a.perfil, 0.3, { pendiente: 4.5, detalle: true })).rejects.toThrow('te quedan 0 (otros 450 ya están')
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

  it('si se pasa `pendiente`, todo como hasta ahora (no rompe a los agentes de antes): manda eso y, sin decir `detalle`, el 402 con cifras', async () => {
    const a = agencia({ saldo: 1.5 })
    db.ediciones.push(edicion(a.perfil))
    expect(await exigirImporte(a.perfil, 1.5, { pendiente: 0 })).toEqual({ paga: true, saldo: 1.5 })
    await expect(exigirImporte(a.perfil, 1.5)).rejects.toThrow(GENERICO('150'))
    await expect(exigirImporte(a.perfil, 3, { pendiente: 0 })).rejects.toThrow('esto cuesta 300 créditos y te quedan 150.')
    // Lo que se diga en `detalle` manda siempre.
    await expect(exigirImporte(a.perfil, 3, { pendiente: 0, detalle: false })).rejects.toThrow(GENERICO('300'))
    await expect(exigirImporte(a.perfil, 3, { detalle: true })).rejects.toThrow('esto cuesta 300 créditos y te quedan 0 (otros 150 ya están apartados')
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
    await expect(exigirImporte(a.perfil, 0.3)).rejects.toMatchObject({ code: '57014' })
  })

  it('lo de un agente lo ven los demás: con 1,50 € y un vídeo en cola, ni portadas ni variantes (la agencia no acaba en negativo)', async () => {
    const a = agencia({ saldo: 1.5 })
    db.ediciones.push(edicion(a.perfil, { id: 'video', estado: 'en_cola', precio_eur: 1.5 }))
    const portada = await exigirImporte(a.perfil, PRECIOS_FIJOS['portada-ia']).catch(x => x)
    expect([portada.statusCode, portada.message]).toEqual([402, GENERICO('40')])
    await expect(exigirImporte(otroPerfil(a.id), PRECIOS_FIJOS['trial-reel'])).rejects.toMatchObject({ statusCode: 402 })
    // A quien administra, con lo apartado en el mensaje.
    await expect(exigirImporte(a.perfil, 0.4, { detalle: true }))
      .rejects.toThrow('esto cuesta 40 créditos y te quedan 0 (otros 150 ya están apartados para trabajos que aún no han terminado)')
    // El propio vídeo, al lanzarlo, no se cuenta a sí mismo.
    expect(await exigirImporte(a.perfil, 1.5, { excluirEdicion: 'video' })).toEqual({ paga: true, saldo: 1.5 })
  })

  it('una portada generándose (reservaTemporal) frena otra que ya no llega', async () => {
    const a = agencia({ saldo: 0.6 })
    const libera = reservaTemporal(a.id, 0.4)
    await expect(exigirImporte(a.perfil, 0.4)).rejects.toMatchObject({ statusCode: 402 })
    libera()
    expect(await exigirImporte(a.perfil, 0.4)).toEqual({ paga: true, saldo: 0.6 })
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

  it('comprobar y apartar dentro: dos peticiones casi a la vez con saldo para una, solo pasa una', async () => {
    const a = agencia({ saldo: 0.5 })
    const pide = () => conCerrojoAgencia(a.id, async () => {
      await exigirImporte(a.perfil, 0.4)
      return reservaTemporal(a.id, 0.4)
    })
    const [r1, r2] = await Promise.allSettled([pide(), pide()])
    expect(r1.status).toBe('fulfilled')
    expect(r2).toMatchObject({ status: 'rejected', reason: { statusCode: 402 } })
    r1.value()
  })
})

describe('exigirSaldo (los agentes de Claude)', () => {
  const conAgencia = (agenciaId, fn) => enContexto({ agenciaId, origen: 'panel' }, fn)

  it('lo apartado tampoco se gasta en Claude: saldo − apartado tiene que ser > 0', async () => {
    const a = agencia({ saldo: 1.5 })
    db.ediciones.push(edicion(a.perfil, { precio_eur: 1.5 }))
    const e = await conAgencia(a.id, () => exigirSaldo()).catch(x => x)
    expect(e.statusCode).toBe(402)
    expect(e.message).toMatch(/^Te has quedado sin créditos: lo que queda está apartado/)
    expect(e.message).not.toMatch(/\d/)
    const b = agencia({ saldo: 2 })
    db.ediciones.push(edicion(b.perfil, { precio_eur: 1.5 }))
    await expect(conAgencia(b.id, () => exigirSaldo())).resolves.toBeUndefined()
  })

  it('sin saldo, el mensaje de siempre y sin mirar lo apartado; sin contexto o en la casa, no se exige nada', async () => {
    const a = agencia({ saldo: 0 })
    db.fallas.clients = { message: 'no debería consultarse' }
    await expect(conAgencia(a.id, () => exigirSaldo())).rejects.toThrow('Te has quedado sin créditos. Recarga para que la IA siga trabajando.')
    db.fallas.clients = null
    await expect(exigirSaldo()).resolves.toBeUndefined()
    const casa = agencia({ saldo: 0, sinCobro: true })
    await expect(conAgencia(casa.id, () => exigirSaldo())).resolves.toBeUndefined()
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

  it('a quien administra: si el perfil paga, su saldo, si le alcanza y los precios (en euros), pasando por el acceso al perfil', async () => {
    const a = agencia({ saldo: 3.2 })
    const r = await llama({ clientId: a.perfil })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({
      paga: true, saldo: 3.2,
      alcanza: { 'editor-reels': true, 'portada-ia': true, 'trial-reel': true },
      precios: { 'editor-reels': 1.5, 'portada-ia': 0.4, 'trial-reel': 0.3 },
    })
    expect(accede).toHaveBeenCalledWith(expect.anything(), a.perfil)
    expect(ver).toHaveBeenCalledWith({ userId: 'u1' }, a.perfil)
  })

  it('a quien no administra la agencia (cliente, equipo del perfil): sin saldo, solo si alcanza, con lo apartado descontado', async () => {
    ver.mockResolvedValue(false)
    const a = agencia({ saldo: 2 })
    db.ediciones.push(edicion(otroPerfil(a.id), { precio_eur: 1.5 }))
    const r = await llama({ clientId: a.perfil })
    expect(r.statusCode).toBe(200)
    // Libres: 0,50 €.
    expect(r.body).toEqual({
      paga: true, saldo: null,
      alcanza: { 'editor-reels': false, 'portada-ia': true, 'trial-reel': true },
      precios: PRECIOS_FIJOS,
    })
    expect(JSON.stringify(r.body)).not.toContain('2')
  })

  it('preciosDelPerfil: alcanza con la misma cuenta que exigirImporte (la diezmilésima)', async () => {
    const a = agencia({ saldo: '0.39995' })
    expect((await preciosDelPerfil(a.perfil)).alcanza['portada-ia']).toBe(true)
    const b = agencia({ saldo: 0.399 })
    expect(await preciosDelPerfil(b.perfil, { verSaldo: true })).toMatchObject({ saldo: 0.399, alcanza: { 'portada-ia': false, 'trial-reel': true } })
  })

  it('la casa: no paga y sin saldo que enseñar', async () => {
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
