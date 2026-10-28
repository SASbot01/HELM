// El agente de Bienvenida (api/_lib/departamentos/bienvenida.js): da la
// bienvenida a las ventas de las últimas 48 h y deja las tareas de arranque.
// Supabase simulado en memoria y un `proponer` de mentira que deduplica por
// clave, como el de verdad. Fechas fijas en Europe/Madrid (28-oct-2026, CET).
import { describe, it, expect, beforeEach } from 'vitest'
import bienvenida from '../api/_lib/departamentos/bienvenida.js'

// ── Supabase de juguete ──────────────────────────────────────────────────────
function mkSupabase(tablas) {
  const DEFECTOS = { crm_tasks: { completed: false } }   // lo que pone la BD sola
  function from(tabla) {
    const rows = () => (tablas[tabla] ||= [])
    const filtros = []
    let orden = null, tope = null, op = 'select', cuerpo = null
    const likeRe = (p) => new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')
    const sel = () => {
      let out = rows().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    const run = (uno) => {
      if (op === 'insert') {
        const arr = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((r, i) => ({ id: r.id || `${tabla}-${rows().length + i + 1}`, ...DEFECTOS[tabla], ...r }))
        rows().push(...arr)
        return Promise.resolve({ data: uno ? arr[0] : arr, error: null })
      }
      const s = sel()
      if (op === 'update') { for (const r of s) Object.assign(r, cuerpo); return Promise.resolve({ data: s, error: null }) }
      return Promise.resolve({ data: uno ? (s[0] || null) : s, error: null })
    }
    const q = {
      select() { return q }, insert(r) { op = 'insert'; cuerpo = r; return q }, update(r) { op = 'update'; cuerpo = r; return q },
      eq(c, v) { filtros.push(r => r[c] === v); return q },
      in(c, vs) { filtros.push(r => vs.includes(r[c])); return q },
      is(c, v) { filtros.push(r => (r[c] ?? null) === v); return q },
      ilike(c, p) { const re = likeRe(p); filtros.push(r => re.test(String(r[c] ?? ''))); return q },
      gt(c, v) { filtros.push(r => r[c] > v); return q },
      gte(c, v) { filtros.push(r => r[c] >= v); return q },
      lt(c, v) { filtros.push(r => r[c] < v); return q },
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

const HOY = new Date('2026-10-28T10:00:00Z')   // Madrid: 28-oct-2026, 11:00 (CET)

function escenario({ config = {}, autonomia = 'proponer', ventas } = {}) {
  const tablas = {
    sales: ventas || [
      { id: 's1', client_id: 'c1', client_name: 'Ana Pérez', client_email: 'ana@x.com', client_phone: '600111222', product: 'Curso Pro', created_at: '2026-10-28T09:00:00.000Z', date: '2026-10-28' },
      { id: 'viejo', client_id: 'c1', client_name: 'Luis Antiguo', client_email: 'luis@x.com', client_phone: '600999888', product: 'Ebook', created_at: '2026-10-25T10:00:00.000Z', date: '2026-10-25' },
    ],
    crm_tasks: [],
  }
  const proponer = mkProponer()
  const ctx = {
    supabase: mkSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'silvestre', name: 'Silvestre AI' },
    agenciaId: 'casa', hoy: HOY, config, autonomia, proponer, avisar: async () => {}, log: () => {},
  }
  return { tablas, ctx, proponer }
}

describe('bienvenida · detecta y propone', () => {
  let esc
  beforeEach(() => { esc = escenario() })

  it('solo las ventas de las últimas 48 h; propone la bienvenida con WhatsApp y las tareas de arranque', async () => {
    const r = await bienvenida.corre(esc.ctx)
    // 1 bienvenida + 2 tareas (por defecto) para la venta reciente; la vieja no cuenta.
    expect(r.propuestas).toBe(3)
    const bienv = esc.proponer.creadas.find(p => p.clave === 'bienvenida:s1')
    expect(bienv).toBeTruthy()
    expect(bienv.telefono).toBe('600111222')
    expect(bienv.mensaje).toContain('Curso Pro')
    expect(bienv.mensaje).toContain('Ana')
    // No se toca la venta de hace más de 48 h.
    expect(esc.proponer.todas.some(p => p.clave.includes('viejo'))).toBe(false)
    // Las tareas de arranque van a la bandeja con la escritura crm_tarea.
    const tareas = esc.proponer.creadas.filter(p => p.herramienta === 'crm_tarea')
    expect(tareas).toHaveLength(2)
    expect(tareas[0].input.titulo).toContain('Ana')
  })

  it('no duplica: a la segunda pasada no propone nada nuevo', async () => {
    await bienvenida.corre(esc.ctx)
    const r2 = await bienvenida.corre(esc.ctx)
    expect(r2.propuestas).toBe(0)
  })

  it('mete el enlace de alta/acceso del perfil cuando está configurado', async () => {
    const e = escenario({ config: { enlace_alta: 'https://helm.s4sf.net/acceso/abc' } })
    await bienvenida.corre(e.ctx)
    const bienv = e.proponer.creadas.find(p => p.clave === 'bienvenida:s1')
    expect(bienv.mensaje).toContain('https://helm.s4sf.net/acceso/abc')
  })

  it('con autonomía interna, crea las tareas directamente y solo propone la bienvenida', async () => {
    const e = escenario({ autonomia: 'interno' })
    const r = await bienvenida.corre(e.ctx)
    expect(r.propuestas).toBe(1)                       // solo la bienvenida (es saliente)
    expect(e.tablas.crm_tasks).toHaveLength(2)         // las tareas, creadas en el tablero
    expect(e.tablas.crm_tasks[0]).toMatchObject({ client_id: 'c1', status: 'todo', completed: false })
    // La segunda pasada no duplica ni las tareas ni la bienvenida.
    const r2 = await bienvenida.corre(e.ctx)
    expect(r2.propuestas).toBe(0)
    expect(e.tablas.crm_tasks).toHaveLength(2)
  })

  it('sin ventas en la ventana, no hace nada', async () => {
    const e = escenario({ ventas: [] })
    expect(await bienvenida.corre(e.ctx)).toEqual({ propuestas: 0, resumen: '' })
  })
})

describe('bienvenida · solo a quien compra por primera vez', () => {
  it('la mensualidad de quien ya era cliente no es un cliente nuevo: no hay bienvenida', async () => {
    const { ctx, proponer } = escenario({ ventas: [
      { id: 'mes-oct', client_id: 'c1', client_name: 'David', client_email: 'david@x.com', client_phone: '600222333', product: 'Mensualidad', created_at: '2026-10-28T08:00:00.000Z', date: '2026-10-28' },
      { id: 'mes-sep', client_id: 'c1', client_name: 'David', client_email: 'david@x.com', client_phone: '600222333', product: 'Mensualidad', created_at: '2026-09-28T08:00:00.000Z', date: '2026-09-28' },
    ] })
    const r = await bienvenida.corre(ctx)
    expect(r.propuestas).toBe(0)
    expect(proponer.todas.some(p => String(p.clave).startsWith('bienvenida:'))).toBe(false)
  })

  it('dos compras del mismo cliente nuevo en 48 h: una sola bienvenida, la de la primera', async () => {
    const { ctx, proponer } = escenario({ ventas: [
      { id: 'a2', client_id: 'c1', client_name: 'Eva', client_email: 'EVA@x.com', client_phone: '', product: 'Extra', created_at: '2026-10-28T09:30:00.000Z', date: '2026-10-28' },
      { id: 'a1', client_id: 'c1', client_name: 'Eva', client_email: 'eva@x.com', client_phone: '', product: 'Curso', created_at: '2026-10-27T18:00:00.000Z', date: '2026-10-27' },
    ] })
    await bienvenida.corre(ctx)
    const bienvenidas = proponer.creadas.filter(p => String(p.clave).startsWith('bienvenida:'))
    expect(bienvenidas.map(p => p.clave)).toEqual(['bienvenida:a1'])
  })
})
