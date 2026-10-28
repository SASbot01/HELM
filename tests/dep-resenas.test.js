// El agente de Reseñas (api/_lib/departamentos/resenas.js): saca el enlace de
// reseña de Google del place_id del negocio y pide reseña a las ventas cobradas
// hace 3-10 días, con tope de 5 por pasada. Supabase simulado; fechas fijas en
// Europe/Madrid (28-oct-2026, CET).
import { describe, it, expect, beforeEach } from 'vitest'
import resenas from '../api/_lib/departamentos/resenas.js'

function mkSupabase(tablas) {
  function from(tabla) {
    const rows = () => (tablas[tabla] ||= [])
    const filtros = []
    let orden = null, tope = null
    const sel = () => {
      let out = rows().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    const run = (uno) => { const s = sel(); return Promise.resolve({ data: uno ? (s[0] || null) : s, error: null }) }
    const q = {
      select() { return q },
      eq(c, v) { filtros.push(r => r[c] === v); return q },
      is(c, v) { filtros.push(r => (r[c] ?? null) === v); return q },
      gt(c, v) { filtros.push(r => r[c] > v); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      lte(c, v) { filtros.push(r => r[c] <= v); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      maybeSingle() { return run(true) }, single() { return run(true) },
      then(res, rej) { return run(false).then(res, rej) },
    }
    return q
  }
  return { from }
}

function mkProponer() {
  const claves = new Set(), todas = [], creadas = []
  const fn = async (p) => {
    todas.push(p)
    if (claves.has(p.clave)) return null
    claves.add(p.clave); creadas.push(p)
    return { id: `prop-${claves.size}`, ...p }
  }
  fn.todas = todas; fn.creadas = creadas
  return fn
}

const HOY = new Date('2026-10-28T10:00:00Z')
const venta = (id, date, cash = 50) => ({ id, client_id: 'c1', date, client_name: `Cliente ${id}`, client_phone: `6000000${id}`, cash_collected: cash })

function escenario({ placeId = 'ChIJ_negocio_123', ventas } = {}) {
  const integ = placeId
    ? [{ client_id: 'c1', service: 'google_places', member_id: null, enabled: true, config: { apiKey: 'k', place_id: placeId } }]
    : [{ client_id: 'c1', service: 'google_places', member_id: null, enabled: true, config: { apiKey: 'k' } }]
  const tablas = {
    user_integrations: integ,
    sales: ventas || [
      venta('a', '2026-10-19'), venta('b', '2026-10-20'), venta('c', '2026-10-21'),
      venta('d', '2026-10-22'), venta('e', '2026-10-23'),      // 5 válidas (3-10 días, cobradas)
      venta('reciente', '2026-10-27'),                          // hace 1 día: muy pronto
      venta('vieja', '2026-10-15'),                             // hace 13 días: tarde
      venta('impagada', '2026-10-20', 0),                       // sin cobrar
    ],
  }
  const proponer = mkProponer()
  const ctx = {
    supabase: mkSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'peluqueria', name: 'Isabel Lozano' },
    agenciaId: 'casa', hoy: HOY, config: {}, autonomia: 'proponer', proponer, avisar: async () => {}, log: () => {},
  }
  return { tablas, ctx, proponer }
}

describe('resenas · enlace de Google y ventana 3-10 días', () => {
  let esc
  beforeEach(() => { esc = escenario() })

  it('pide reseña a las ventas cobradas hace 3-10 días, con el enlace de Google y el WhatsApp', async () => {
    const r = await resenas.corre(esc.ctx)
    expect(r.propuestas).toBe(5)
    const p = esc.proponer.creadas.find(x => x.clave === 'resenas:a')
    expect(p.telefono).toBe('6000000a')
    expect(p.mensaje).toContain('https://search.google.com/local/writereview?placeid=ChIJ_negocio_123')
    // Ni demasiado pronto, ni tarde, ni sin cobrar.
    expect(esc.proponer.todas.some(x => ['resenas:reciente', 'resenas:vieja', 'resenas:impagada'].includes(x.clave))).toBe(false)
  })

  it('no duplica: a la segunda pasada no propone nada nuevo', async () => {
    await resenas.corre(esc.ctx)
    const r2 = await resenas.corre(esc.ctx)
    expect(r2.propuestas).toBe(0)
  })

  it('tope de 5 por pasada aunque haya más candidatas', async () => {
    const siete = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
      .map((d, i) => venta(`v${i}`, d))
    const e = escenario({ ventas: siete })
    const r = await resenas.corre(e.ctx)
    expect(r.propuestas).toBe(5)
    expect(e.proponer.creadas).toHaveLength(5)
  })

  it('sin place_id, no pide nada y dice qué falta', async () => {
    const e = escenario({ placeId: null })
    const r = await resenas.corre(e.ctx)
    expect(r.propuestas).toBe(0)
    expect(r.resumen).toMatch(/place_id/)
  })
})
