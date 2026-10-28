// El guionista de ventas (api/_lib/departamentos/guionista-ventas.js): une cada
// reel con los leads y las ventas cobradas por atribución UTM (shortcode /
// media_id / «comenta PALABRA»), saca el ranking de temas que más VENDEN y lo
// deja en la memoria del perfil para el guionista del Equipo. La base se simula.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import agente, { shortcodeDe, palabraComenta, cobradoDe, atribuyeReels } from '../api/_lib/departamentos/guionista-ventas.js'

// ── Una base en memoria con lo justo que usan estos agentes ──────────────────
function hazSupabase(tablas) {
  let ids = 0
  function from(tabla) {
    const filtros = []
    let op = 'select', cuerpo = null, orden = null, tope = null
    const rows = () => (tablas[tabla] ||= [])
    const elegidas = () => {
      let out = rows().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    function corre(uno) {
      if (op === 'insert') {
        const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(r => ({ id: r.id || `id-${++ids}`, ...r }))
        rows().push(...nuevas)
        return Promise.resolve({ data: uno ? nuevas[0] : nuevas, error: null })
      }
      const picked = elegidas()
      if (op === 'update') for (const r of picked) Object.assign(r, cuerpo)
      return Promise.resolve({ data: uno ? (picked[0] || null) : picked, error: null })
    }
    const q = {
      select() { return q },
      eq(c, v) { filtros.push(r => r[c] === v); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      lt(c, v) { filtros.push(r => r[c] < v); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      insert(r) { op = 'insert'; cuerpo = r; return q },
      update(r) { op = 'update'; cuerpo = r; return q },
      single() { return corre(true) },
      maybeSingle() { return corre(true) },
      then(res, rej) { return corre(false).then(res, rej) },
    }
    return q
  }
  return { from }
}

let tablas, log, proponer, ctx
function hazCtx() {
  log = []
  proponer = vi.fn(async () => ({ id: `prop-${Math.random()}` }))
  ctx = {
    supabase: hazSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'silvestre', name: 'Silvestre' }, agenciaId: 'casa',
    hoy: new Date('2026-10-28T10:00:00Z'), config: {}, autonomia: 'proponer',
    proponer, avisar: vi.fn(async () => 0), log: async (...a) => { log.push(a.join(' ')) },
  }
}

const reel = (id, permalink, caption, visitas) => ({
  media_id: id, permalink, caption, visitas, producto: 'REELS', publicado_en: '2026-10-10T08:00:00Z', client_id: 'c1',
})
const venta = (utm, cash, extra = {}) => ({
  client_id: 'c1', utm_content: utm, utm_campaign: '', revenue: cash, cash_collected: cash, product: 'Curso', date: '2026-10-20', status: 'Completada', ...extra,
})
const lead = (utm) => ({ client_id: 'c1', utm_content: utm, utm_campaign: '', created_at: '2026-10-20T10:00:00Z', status: 'lead' })

beforeEach(() => {
  tablas = {
    helm_ig_media: [
      reel('m1', 'https://instagram.com/reel/AAAbbb1111/', 'Cómo cerrar más ventas\nel método X', 5000),
      reel('m2', 'https://instagram.com/reel/CCCddd2222/', 'Comenta PLANTILLA y te la mando', 8000),
      reel('m3', 'https://instagram.com/p/EEEfff3333/', 'Receta de pollo al horno', 20000),
    ],
    sales: [
      venta('AAAbbb1111', 500), venta('AAAbbb1111', 500),   // 2 cobradas a m1
      venta('plantilla', 300),                               // 1 cobrada a m2 por «comenta»
      venta('AAAbbb1111', 0, { cash_collected: 0, status: 'Pendiente' }),  // NO cobrada: no cuenta
    ],
    crm_contacts: [lead('AAAbbb1111'), lead('AAAbbb1111'), lead('AAAbbb1111'), lead('plantilla')],
    agent_memory: [],
  }
  hazCtx()
})

describe('helpers de atribución', () => {
  it('shortcodeDe saca el código del permalink', () => {
    expect(shortcodeDe('https://instagram.com/reel/AAAbbb1111/')).toBe('aaabbb1111')
    expect(shortcodeDe('https://instagram.com/p/EEEfff3333')).toBe('eeefff3333')
    expect(shortcodeDe('')).toBe('')
  })
  it('palabraComenta saca la palabra del «comenta …»', () => {
    expect(palabraComenta('Comenta PLANTILLA y te la mando')).toBe('plantilla')
    expect(palabraComenta('comenta «REPO» para el enlace')).toBe('repo')
    expect(palabraComenta('Dale like')).toBe('')
  })
  it('cobradoDe usa cash_collected y, sin él, solo si está cobrada', () => {
    expect(cobradoDe({ cash_collected: 120 })).toBe(120)
    expect(cobradoDe({ cash_collected: null, revenue: 90, status: 'Completada' })).toBe(90)
    expect(cobradoDe({ cash_collected: null, revenue: 90, status: 'Pendiente' })).toBe(0)
  })
  it('atribuyeReels no atribuye por cercanía, solo por UTM', () => {
    const filas = atribuyeReels({
      reels: [reel('m1', 'https://instagram.com/reel/AAAbbb1111/', 'x', 10)],
      ventas: [venta('nada-que-ver', 500)], contactos: [],
    })
    expect(filas[0]).toMatchObject({ ventas: 0, ingresos: 0, leads: 0 })
  })
})

describe('guionista-ventas · corre', () => {
  it('saca el ranking por ventas COBRADAS y lo guarda en la memoria para el guionista', async () => {
    const r = await agente.corre(ctx)
    // m1 (2 ventas, 1000€, 3 leads) por delante de m2 (1 venta, 300€, 1 lead).
    // m3 es el más visto (20k) pero no vende: no lidera.
    expect(r.resumen).toMatch(/Cómo cerrar más ventas/)
    expect(r.resumen).toMatch(/1\.000 €|1000 €/)
    const nota = tablas.agent_memory.find(n => n.clave === 'ventas/temas')
    expect(nota).toMatchObject({ ambito: 'perfil', client_id: 'c1', agente: 'guionista', tipo: 'aprendido' })
    expect(nota.contenido).toMatch(/MÁS VENDEN/)
    expect(nota.contenido).toMatch(/Cómo cerrar más ventas/)
    expect(nota.contenido.indexOf('Cómo cerrar más ventas')).toBeLessThan(nota.contenido.indexOf('Comenta PLANTILLA'))
    expect(nota.contenido).not.toMatch(/Receta de pollo/)
  })

  it('la venta no cobrada no cuenta como venta', async () => {
    await agente.corre(ctx)
    const nota = tablas.agent_memory.find(n => n.clave === 'ventas/temas')
    // m1 tiene 2 cobradas (no 3), 1.000 € (no 1.500).
    expect(nota.contenido).toMatch(/2 ventas cobradas \(1\.?000 €\)/)
  })

  it('upsert: correrlo dos veces no duplica la nota', async () => {
    await agente.corre(ctx)
    await agente.corre(ctx)
    expect(tablas.agent_memory.filter(n => n.clave === 'ventas/temas')).toHaveLength(1)
  })

  it('sin atribución posible: no inventa, dice que falta utm_content y no escribe nota', async () => {
    tablas.sales = [venta('otra-cosa', 500)]
    tablas.crm_contacts = [lead('tampoco')]
    hazCtx()
    const r = await agente.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(r.resumen).toMatch(/utm_content/)
    expect(r.resumen).toMatch(/visitas/)
    expect(tablas.agent_memory).toHaveLength(0)
  })

  it('sin reels propios no hay nada que atribuir', async () => {
    tablas.helm_ig_media = []
    hazCtx()
    const r = await agente.corre(ctx)
    expect(r.resumen).toMatch(/Sin reels/)
    expect(tablas.agent_memory).toHaveLength(0)
  })
})
