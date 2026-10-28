// El Media buyer (api/_lib/departamentos/media-buyer.js): las reglas sin IA
// (días y gasto mínimos antes de juzgar, coste por lead o por venta frente al
// objetivo, subir ≤ +20 % solo fuera del aprendizaje, una vez cada 72 h y si
// cabe en los topes, bajar, pausar, pedir creatividades por fatiga), el cruce
// con el CRM por utm_content = id del anuncio y la fecha de entrada del lead,
// la pasada diaria (sincroniza, propone con su porqué en cifras, manda el
// parte) y el vigilante, que solo puede frenar. Meta es un fetch simulado y
// Supabase va en memoria.
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Supabase en memoria ─────────────────────────────────────────────────────
let tablas = {}
const fallan = new Set()
const SOLO_ANADIR = new Set(['helm_ads_acciones'])
const ahoraISO = () => new Date().toISOString()
const nueva = (r) => ({ id: randomUUID(), created_at: ahoraISO(), creada_en: ahoraISO(), ...structuredClone(r) })
class Q {
  constructor(t) { Object.assign(this, { t, f: [], op: 'select', ord: [], lim: null, uno: null }) }
  select() { return this }
  eq(c, v) { this.f.push(r => r[c] != null && String(r[c]) === String(v)); return this }
  gt(c, v) { this.f.push(r => r[c] != null && String(r[c]) > String(v)); return this }
  gte(c, v) { this.f.push(r => r[c] != null && String(r[c]) >= String(v)); return this }
  lt(c, v) { this.f.push(r => r[c] != null && String(r[c]) < String(v)); return this }
  in(c, v) { this.f.push(r => v.map(String).includes(String(r[c]))); return this }
  is(c, v) { this.f.push(r => (v === null ? r[c] == null : r[c] === v)); return this }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this }
  limit(n) { this.lim = n; return this }
  range(a, b) { this.desde = a; this.lim = b - a + 1; return this }
  insert(d) { this.op = 'insert'; this.d = d; return this }
  update(d) { this.op = 'update'; this.d = d; return this }
  upsert(d, o = {}) { Object.assign(this, { op: 'upsert', d, on: (o.onConflict || 'id').split(',') }); return this }
  single() { this.uno = 's'; return this.run() }
  maybeSingle() { this.uno = 'm'; return this.run() }
  then(a, b) { return this.run().then(a, b) }
  async run() {
    const t = (tablas[this.t] ||= [])
    const pasa = r => this.f.every(f => f(r))
    if ((this.op === 'insert' || this.op === 'upsert') && fallan.has(this.t)) return { data: null, error: { message: `fallo simulado en ${this.t}` } }
    if (this.op === 'update' && SOLO_ANADIR.has(this.t)) return { data: null, error: { message: 'solo se pueden añadir filas' } }
    let data
    if (this.op === 'insert') {
      data = (Array.isArray(this.d) ? this.d : [this.d]).map(nueva)
      t.push(...data)
    } else if (this.op === 'upsert') {
      data = []
      for (const r of Array.isArray(this.d) ? this.d : [this.d]) {
        const ya = t.find(x => this.on.every(k => String(x[k]) === String(r[k])))
        if (ya) Object.assign(ya, structuredClone(r)); else t.push(nueva(r))
      }
    } else if (this.op === 'update') {
      data = t.filter(pasa)
      for (const r of data) Object.assign(r, structuredClone(this.d))
    } else {
      data = t.filter(pasa)
      for (const [c, asc] of [...this.ord].reverse()) data = [...data].sort((a, b) => (asc ? 1 : -1) * String(a[c] ?? '').localeCompare(String(b[c] ?? '')))
    }
    if (this.lim != null) data = data.slice(this.desde || 0, (this.desde || 0) + this.lim)
    data = structuredClone(data)
    if (this.uno === 's') return data.length ? { data: data[0], error: null } : { data: null, error: { message: 'sin filas' } }
    if (this.uno === 'm') return { data: data[0] ?? null, error: null }
    return { data, error: null }
  }
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => new Q(t) } }))
const avisos = []
vi.mock('../api/_lib/notificar.js', () => ({ notificar: vi.fn(async (_s, clientId, n) => { avisos.push({ clientId, ...n }); return 'n1' }) }))

// ── Meta, simulado ──────────────────────────────────────────────────────────
const TOKEN = 'EAAtokenDelUsuarioDelSistema0123456789abcdef'
const M = { objs: {}, dia: [], agg: [], gasto: { today: 0, this_month: 0 }, llamadas: [], falla: null }
const SOLO = { learning_stage_info: 'adset', adset_id: 'ad', objective: 'campaign' }
function campos(o, fields) {
  const pedidos = String(fields || '').split(',').filter(Boolean)
  if (pedidos.some(f => SOLO[f] && SOLO[f] !== o.tipo)) return null
  const out = { id: o.id }
  for (const f of pedidos) if (o[f] !== undefined) out[f] = o[f]
  return out
}
const responde = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => structuredClone(body) })
async function fetchMeta(url, opciones = {}) {
  const u = new URL(url)
  const metodo = opciones.method || 'GET'
  const p = Object.fromEntries(metodo === 'GET' ? u.searchParams : new URLSearchParams(opciones.body))
  const ruta = u.pathname.split('/').slice(2).join('/')
  M.llamadas.push({ metodo, ruta, p })
  if (M.falla) return M.falla()
  if (p.access_token !== TOKEN) return responde(400, { error: { code: 190, message: 'Invalid OAuth access token.' } })
  const partes = ruta.split('/')
  if (partes[0].startsWith('act_')) {
    const de = (tipo) => Object.values(M.objs).filter(o => o.tipo === tipo).map(o => campos(o, p.fields)).filter(Boolean)
    if (partes[1] === 'campaigns') return responde(200, { data: de('campaign') })
    if (partes[1] === 'adsets') return responde(200, { data: de('adset') })
    if (partes[1] === 'ads') return responde(200, { data: de('ad') })
    if (partes[1] === 'insights') {
      if (p.date_preset) return responde(200, { data: [{ spend: String(M.gasto[p.date_preset] ?? 0) }] })
      const r = JSON.parse(p.time_range)
      return responde(200, { data: p.time_increment ? M.dia.filter(f => f.date_start >= r.since && f.date_start <= r.until) : M.agg })
    }
  }
  const o = M.objs[partes[0]]
  if (!o) return responde(400, { error: { code: 100, message: 'Unsupported get request.', error_subcode: 33 } })
  if (metodo === 'POST') {
    if (p.daily_budget) o.daily_budget = p.daily_budget
    if (p.status) { o.status = p.status; o.effective_status = p.status }
    return responde(200, { success: true })
  }
  return responde(200, campos(o, p.fields))
}
const posts = () => M.llamadas.filter(l => l.metodo === 'POST')

const meta = await import('../api/_lib/meta-ads.js')
const mb = await import('../api/_lib/departamentos/media-buyer.js')
const agente = mb.default

// ── Ayudas ──────────────────────────────────────────────────────────────────
const AHORA = new Date('2026-10-28T06:00:00Z') // martes, 7:00 en Madrid
const HOY = '2026-10-28'
const haceDias = (n, desde = AHORA) => new Date(desde.getTime() - n * 86_400_000).toISOString()
const agg = (o = {}) => ({ gasto: 0, impresiones: 0, clics_enlace: 0, leads_meta: 0, compras_meta: 0, leads_crm: 0, ventas_crm: 0, cobrado_crm: 0, ...o })
const datos = (actual, previo = {}) => ({ actual: agg(actual), previo: agg(previo), ayer: agg() })
const unidad = (o) => ({ tipo: 'adset', enciende: true, aprendizaje: 'SUCCESS', creada: haceDias(10), campana: 'c1', ...o, conjuntos: [o.id] })
const anuncio = (o) => ({ status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: 'c1', created_time: haceDias(10), ...o })
const CUENTA = { id: 'fila-cuenta', client_id: 'perfil-1', cuenta_id: 'act_111', nombre: 'DDC Ads', moneda: 'EUR', zona: 'Europe/Madrid', activa: true, nivel: 1, fase: 'captacion', objetivo_cpl: 2.5, objetivo_cpa: 300, tope_diario: 120, tope_mensual: 3600, dias_min: 3, gasto_min_factor: 1.5, subida_max_pct: 20, horas_entre_subidas: 72, vigilante: {} }
const decide = (o) => mb.decide({ cuenta: CUENTA, hoy: HOY, ahora: AHORA, gastadoMes: 900, ...o })

// ── Las reglas ──────────────────────────────────────────────────────────────
describe('decide: las reglas', () => {
  it('no juzga antes de tiempo: 72 h publicado y 1,5 veces el objetivo gastado', () => {
    const u = unidad({ id: 's1', nombre: 'Nuevo', presupuesto: 40, creada: haceDias(2) })
    const r1 = decide({ unidades: [u], anuncios: [anuncio({ id: 'a1', name: 'A', adset_id: 's1', created_time: haceDias(2) })], porAnuncio: new Map([['a1', datos({ gasto: 80, leads_crm: 0 })]]) })
    expect(r1.propuestas).toEqual([])
    expect(r1.notas.join(' ')).toMatch(/«Nuevo»: aún no se juzga, lleva 2 días \(mínimo 3\)/)
    const r2 = decide({ unidades: [unidad({ id: 's1', nombre: 'Barato', presupuesto: 40 })], anuncios: [anuncio({ id: 'a1', name: 'A', adset_id: 's1' })], porAnuncio: new Map([['a1', datos({ gasto: 3, leads_crm: 0 })]]) })
    expect(r2.propuestas).toEqual([])
    expect(r2.notas.join(' ')).toMatch(/ha gastado 3 € \(mínimo 3,75 € para juzgar\)/)
  })

  it('pausa lo que no trae leads o los trae al doble del objetivo, con las cifras', () => {
    const unidades = [unidad({ id: 's1', nombre: 'Carrusel', presupuesto: 20, creada: haceDias(4) }), unidad({ id: 's2', nombre: 'Dos anuncios', presupuesto: 30 })]
    const anuncios = [
      anuncio({ id: 'a1', name: 'Carrusel 5 errores', adset_id: 's1', created_time: haceDias(4) }),
      anuncio({ id: 'a2', name: 'Malo', adset_id: 's2' }), anuncio({ id: 'a3', name: 'Bueno', adset_id: 's2' }),
    ]
    const porAnuncio = new Map([
      ['a1', datos({ gasto: 46, leads_crm: 7, leads_meta: 9 })], // 6,57 €/lead: 2,6 veces 2,50 €
      ['a2', datos({ gasto: 40, leads_crm: 0 })],
      ['a3', datos({ gasto: 100, leads_crm: 50 })],
    ])
    const { propuestas } = decide({ unidades, anuncios, porAnuncio })
    const pausa = propuestas.find(p => p.objeto.id === 's1')
    expect(pausa).toMatchObject({ tipo: 'pausar', objeto: { tipo: 'adset', id: 's1' }, titulo: 'Pausar el conjunto «Carrusel»' })
    expect(pausa.porque).toBe('En 7 días: 46 € gastados y 7 leads según HELM (6,57 €/lead, 2,6 veces tu objetivo de 2,5 €). Meta cuenta 9 leads. Lleva 4 días.')
    // En un conjunto con dos anuncios, se pausa solo el malo.
    expect(propuestas.find(p => p.objeto.id === 'a2')).toMatchObject({ tipo: 'pausar', objeto: { tipo: 'ad' }, titulo: 'Pausar el anuncio «Malo»' })
    expect(propuestas.find(p => p.objeto.id === 'a2').porque).toMatch(/ningún lead/)
    expect(propuestas.some(p => p.objeto.id === 'a3' || p.objeto.id === 's2')).toBe(false)
  })

  it('si Meta cuenta leads y HELM casi no los ve (atribución rota), no pausa: lo dice en el parte', () => {
    const u = unidad({ id: 's1', nombre: 'Formulario', presupuesto: 20 })
    const r = mb.decide({ cuenta: { ...CUENTA, objetivo_cpl: 10 }, hoy: HOY, ahora: AHORA, gastadoMes: 0, unidades: [u],
      anuncios: [anuncio({ id: 'a1', name: 'Lead form', adset_id: 's1' })], porAnuncio: new Map([['a1', datos({ gasto: 100, leads_meta: 30, leads_crm: 0 })]]) })
    expect(r.propuestas).toEqual([])
    expect(r.notas.join(' ')).toMatch(/Meta cuenta 30 leads y HELM solo ve 0: la atribución está rota \(falta utm_content=\{\{ad\.id\}\}/)
  })

  it('baja un 20 % lo que va caro sin ser un desastre', () => {
    const { propuestas } = decide({
      unidades: [unidad({ id: 's1', nombre: 'Caro', presupuesto: 50 })], anuncios: [anuncio({ id: 'a1', name: 'A', adset_id: 's1' })],
      porAnuncio: new Map([['a1', datos({ gasto: 300, leads_crm: 80 })]]), // 3,75 €/lead = 1,5 ×
    })
    expect(propuestas).toEqual([expect.objectContaining({ tipo: 'bajar', antes: 50, despues: 40, titulo: 'Bajar «Caro» de 50 € a 40 €/día (−20 %)' })])
  })

  it('sube como mucho un 20 % lo que va bien, ha salido del aprendizaje y gasta su presupuesto', () => {
    const base = { anuncios: [anuncio({ id: 'a1', name: 'Reel', adset_id: 's1' })], porAnuncio: new Map([['a1', datos({ gasto: 259, leads_crm: 140, leads_meta: 150 })]]) }
    const u = unidad({ id: 's1', nombre: 'Reel cámara', presupuesto: 40 })
    const { propuestas } = decide({ ...base, unidades: [u] })
    expect(propuestas).toHaveLength(1)
    expect(propuestas[0]).toMatchObject({ tipo: 'subir', antes: 40, despues: 48, titulo: 'Subir «Reel cámara» de 40 € a 48 €/día (+20 %)' })
    expect(propuestas[0].porque).toMatch(/^En 7 días: 259 € gastados y 140 leads según HELM \(1,85 €\/lead, 0,7 veces tu objetivo de 2,5 €\)\. Meta cuenta 150 leads\. Gasta el 92,5 % de su presupuesto y ha salido del aprendizaje\.$/)

    // Aprendiendo, con una subida en las últimas 72 h, sin gastar lo que tiene o sin topes: no.
    const no = (o, extra = {}) => decide({ ...base, unidades: [unidad({ id: 's1', nombre: 'Reel cámara', presupuesto: 40, ...o })], ...extra })
    expect(no({ aprendizaje: 'LEARNING' }).propuestas).toEqual([])
    expect(no({ aprendizaje: 'LEARNING' }).notas.join(' ')).toMatch(/aún aprendiendo: no se sube/)
    expect(no({}, { subidasRecientes: new Set(['s1']) }).notas.join(' ')).toMatch(/hace menos de 72 h/)
    expect(no({ presupuesto: 100 }).notas.join(' ')).toMatch(/solo gasta el 37 % de su presupuesto/)
    expect(mb.decide({ cuenta: { ...CUENTA, tope_mensual: null }, hoy: HOY, ahora: AHORA, ...base, unidades: [u] }).notas.join(' ')).toMatch(/no tiene topes/)
  })

  it('las subidas caben en los topes, también todas juntas', () => {
    const anuncios = [anuncio({ id: 'a1', name: 'R1', adset_id: 's1' }), anuncio({ id: 'a2', name: 'R2', adset_id: 's2' })]
    const porAnuncio = new Map([['a1', datos({ gasto: 259, leads_crm: 140 })], ['a2', datos({ gasto: 259, leads_crm: 140 })]])
    const unidades = [unidad({ id: 's1', nombre: 'Uno', presupuesto: 40 }), unidad({ id: 's2', nombre: 'Dos', presupuesto: 40 })]
    // Tope 89 €/día: 80 € puestos → quedan 9 €: 8 para la primera y a la segunda solo le cabría +1 € (menos del 5 %).
    const { propuestas, notas } = mb.decide({ cuenta: { ...CUENTA, tope_diario: 89 }, hoy: HOY, ahora: AHORA, gastadoMes: 0, unidades, anuncios, porAnuncio })
    expect(propuestas.map(p => [p.objeto.id, p.despues])).toEqual([['s1', 48]])
    expect(notas.join(' ')).toMatch(/«Dos» va bien, pero una subida no cabe en los topes/)
    // Con 90 €, a la segunda le caben 2 € (+5 %): entre las dos, justo el tope.
    expect(mb.decide({ cuenta: { ...CUENTA, tope_diario: 90 }, hoy: HOY, ahora: AHORA, gastadoMes: 0, unidades, anuncios, porAnuncio }).propuestas.map(p => p.despues)).toEqual([48, 42])
    // El mensual: 3600 − 3400 gastados = 200 € para los 4 días que quedan (50/día).
    const mes = mb.decide({ cuenta: CUENTA, hoy: HOY, ahora: AHORA, gastadoMes: 3400, unidades, anuncios, porAnuncio })
    expect(mes.propuestas).toEqual([])
    const suma = (ps) => ps.reduce((t, p) => t + p.despues - p.antes, 0)
    const holgado = mb.decide({ cuenta: CUENTA, hoy: HOY, ahora: AHORA, gastadoMes: 0, unidades, anuncios, porAnuncio })
    expect(holgado.propuestas.map(p => p.despues)).toEqual([48, 48])
    expect(80 + suma(holgado.propuestas)).toBeLessThanOrEqual(CUENTA.tope_diario)
  })

  it('en carrito juzga por ventas cobradas y no pausa por no vender hasta los 7 días', () => {
    const cuenta = { ...CUENTA, fase: 'carrito', objetivo_cpa: 100 }
    const u = unidad({ id: 's1', nombre: 'Carrito', presupuesto: 50, creada: haceDias(5) })
    const ad = anuncio({ id: 'a1', name: 'Oferta', adset_id: 's1', created_time: haceDias(5) })
    const r = mb.decide({ cuenta, hoy: HOY, ahora: AHORA, unidades: [u], anuncios: [ad], porAnuncio: new Map([['a1', datos({ gasto: 250, leads_crm: 60, ventas_crm: 0 })]]) })
    expect(r.propuestas).toEqual([])
    expect(r.notas.join(' ')).toMatch(/aún sin ventas cobradas; para decir que no vende se esperan 7 días/)
    const tarde = mb.decide({ cuenta, hoy: HOY, ahora: AHORA, unidades: [{ ...u, creada: haceDias(8) }], anuncios: [{ ...ad, created_time: haceDias(8) }], porAnuncio: new Map([['a1', datos({ gasto: 250, leads_crm: 60, ventas_crm: 0 })]]) })
    expect(tarde.propuestas).toEqual([expect.objectContaining({ tipo: 'pausar' })])
    expect(tarde.propuestas[0].porque).toMatch(/250 € gastados y 0 ventas cobradas según HELM \(ninguna venta\)\. Lleva 8 días\./)
  })

  it('en el cierre no toca nada; sin objetivo, tampoco', () => {
    const args = { unidades: [unidad({ id: 's1', nombre: 'X', presupuesto: 40 })], anuncios: [anuncio({ id: 'a1', name: 'A', adset_id: 's1' })], porAnuncio: new Map([['a1', datos({ gasto: 400, leads_crm: 0 })]]) }
    expect(mb.decide({ ...args, cuenta: { ...CUENTA, fase: 'cierre' }, hoy: HOY, ahora: AHORA }).propuestas).toEqual([])
    const sin = mb.decide({ ...args, cuenta: { ...CUENTA, objetivo_cpl: null }, hoy: HOY, ahora: AHORA })
    expect(sin.propuestas).toEqual([])
    expect(sin.notas[0]).toMatch(/Sin coste objetivo por lead/)
  })

  it('fatiga: frecuencia por encima de 3 y el CTR cayendo un 30 % → pedir creatividades', () => {
    const unidades = [unidad({ id: 's1', nombre: 'S', presupuesto: 40 })]
    const anuncios = [anuncio({ id: 'a1', name: 'Hook en la calle', adset_id: 's1' })]
    const porAnuncio = new Map([['a1', datos({ gasto: 200, leads_crm: 80, impresiones: 20000, clics_enlace: 260 }, { impresiones: 20000, clics_enlace: 400 })]])
    const { propuestas } = decide({ unidades, anuncios, porAnuncio, frecuencias: new Map([['a1', 3.4]]) })
    const c = propuestas.find(p => p.tipo === 'creatividades')
    expect(c).toMatchObject({ objeto: { tipo: 'ad', id: 'a1' }, titulo: '«Hook en la calle» se está cansando: hacen falta creatividades nuevas' })
    expect(c.porque).toMatch(/Frecuencia 3,4 en 7 días y el CTR ha caído un 35 % \(de 2 % a 1,3 %\)/)
    // Sin frecuencia alta, no.
    expect(decide({ unidades, anuncios, porAnuncio, frecuencias: new Map([['a1', 2]]) }).propuestas.some(p => p.tipo === 'creatividades')).toBe(false)
  })

  it('cada propuesta sale con su escritura, su «antes» y su caducidad a las 19:00', () => {
    const p = { tipo: 'subir', objeto: { tipo: 'adset', id: '3001', nombre: 'Reel' }, antes: 40, despues: 48, titulo: 'Subir', porque: 'Porque sí, con cifras.' }
    expect(mb.aPropuesta(p, CUENTA, HOY, AHORA)).toMatchObject({
      clave: 'media-buyer:2026-10-28:subir:3001', herramienta: 'meta_presupuesto', caducaHoras: 12,
      input: { cuenta: 'act_111', tipo: 'adset', objeto: '3001', antes: 40, despues: 48, motivo: 'Porque sí, con cifras.' },
    })
    expect(mb.aPropuesta({ ...p, tipo: 'pausar', objeto: { tipo: 'ad', id: '4002' } }, CUENTA, HOY, AHORA)).toMatchObject({ herramienta: 'meta_pausar', input: { tipo: 'ad', objeto: '4002' } })
    // Las creatividades: sin escritura (aprobar es darlo por encargado) y una vez por semana.
    const c = mb.aPropuesta({ ...p, tipo: 'creatividades', objeto: { tipo: 'ad', id: '4001' } }, CUENTA, HOY, AHORA)
    expect(c.herramienta).toBeUndefined()
    expect(c.clave).toBe('media-buyer:2026-10-26:creatividades:4001')
    expect(mb.horasHasta19(new Date('2026-10-28T17:30:00Z'))).toBe(12)
  })
})

// ── El cruce con el CRM ─────────────────────────────────────────────────────
describe('crmPorAnuncio: leads por utm_content y ventas por el día en que entró el lead', () => {
  beforeEach(() => {
    tablas = {
      crm_contacts: [
        { id: 'c1', client_id: 'p1', utm_content: '4001', created_at: '2026-10-22T09:00:00Z' },
        { id: 'c2', client_id: 'p1', utm_content: '4001', created_at: '2026-10-22T22:30:00Z' }, // 23-oct en Madrid
        { id: 'c3', client_id: 'p1', utm_content: '4002', created_at: '2026-10-25T10:00:00Z' },
        { id: 'c4', client_id: 'p1', utm_content: 'otro', created_at: '2026-10-25T10:00:00Z' },
        { id: 'c5', client_id: 'p2', utm_content: '4001', created_at: '2026-10-25T10:00:00Z' },
      ],
      sales: [
        // Cobrada el 27, de un lead del 22: cuenta el 22.
        { id: 'v1', client_id: 'p1', contact_id: 'c1', cash_collected: 497, status: 'won', date: '2026-10-27', created_at: '2026-10-27T10:00:00Z' },
        { id: 'v2', client_id: 'p1', contact_id: 'c3', cash_collected: 300, status: 'cancelada', created_at: '2026-10-26T10:00:00Z' },
        { id: 'v3', client_id: 'p1', contact_id: 'c3', cash_collected: 0, status: 'won', created_at: '2026-10-26T10:00:00Z' },
        // Con el UTM pero sin ficha: por su fecha.
        { id: 'v4', client_id: 'p1', contact_id: null, utm_content: '4002', cash_collected: 200, status: 'Completada', date: '2026-10-26', created_at: '2026-10-26T10:00:00Z' },
      ],
    }
  })

  it('cuenta cada cosa en su día y no mezcla perfiles, anuladas ni sin cobrar', async () => {
    const r = await mb.crmPorAnuncio('p1', ['4001', '4002'], { desde: '2026-10-14', hasta: '2026-10-27', zona: 'Europe/Madrid' })
    expect(Object.fromEntries(r)).toEqual({
      '4001|2026-10-22': { leads: 1, ventas: 1, cobrado: 497 },
      '4001|2026-10-23': { leads: 1, ventas: 0, cobrado: 0 },
      '4002|2026-10-25': { leads: 1, ventas: 0, cobrado: 0 },
      '4002|2026-10-26': { leads: 0, ventas: 1, cobrado: 200 },
    })
  })
})

// ── La pasada diaria y el vigilante, con Meta simulado ─────────────────────
const PERFIL = { id: randomUUID(), slug: 'detras-de-camra', name: 'DDC' }
const hoyReal = () => meta.diaEn('Europe/Madrid', new Date())
function siembra() {
  const hace = (d) => new Date(Date.now() - d * 86_400_000).toISOString()
  tablas = {
    clients: [{ ...PERFIL, agencia_id: 'agencia-1', active: true }],
    user_integrations: [{ id: 'ui1', client_id: PERFIL.id, service: 'meta_ads', member_id: null, enabled: true, config: { token: TOKEN } }],
    helm_ads_cuentas: [{ ...CUENTA, client_id: PERFIL.id, tope_mensual: 100000 }],
    helm_ads_acciones: [], helm_ads_paradas: [], helm_ads_metricas: [], crm_contacts: [], sales: [],
  }
  M.objs = {}
  const o = (x) => { M.objs[x.id] = { account_id: '111', status: 'ACTIVE', effective_status: 'ACTIVE', created_time: hace(10), ...x } }
  o({ id: '2001', tipo: 'campaign', name: 'Captación' })
  o({ id: '2003', tipo: 'campaign', name: 'Vieja', status: 'PAUSED', effective_status: 'PAUSED' })
  o({ id: '3001', tipo: 'adset', name: 'Reel cámara', campaign_id: '2001', daily_budget: '4000', learning_stage_info: { status: 'SUCCESS' } })
  o({ id: '3002', tipo: 'adset', name: 'Carrusel', campaign_id: '2001', daily_budget: '2000', learning_stage_info: { status: 'SUCCESS' } })
  o({ id: '4001', tipo: 'ad', name: 'Hook en la calle', adset_id: '3001', campaign_id: '2001' })
  o({ id: '4002', tipo: 'ad', name: 'Carrusel 5 errores', adset_id: '3002', campaign_id: '2001' })
  // 7 días: el Reel, 37 €/día y 20 leads/día en el CRM; el Carrusel, 6,57 €/lead.
  M.dia = []
  for (let d = 1; d <= 7; d++) {
    const dia = meta.masDias(hoyReal(), -d)
    M.dia.push({ date_start: dia, date_stop: dia, ad_id: '4001', ad_name: 'Hook en la calle', adset_id: '3001', campaign_id: '2001', spend: '37', impressions: '3000', reach: '2500', inline_link_clicks: '60', actions: [{ action_type: 'lead', value: '21' }] })
    for (let i = 0; i < 20; i++) tablas.crm_contacts.push({ id: `c-${d}-${i}`, client_id: PERFIL.id, utm_content: '4001', created_at: `${dia}T10:00:00Z` })
    if (d <= 4) {
      M.dia.push({ date_start: dia, date_stop: dia, ad_id: '4002', ad_name: 'Carrusel 5 errores', adset_id: '3002', campaign_id: '2001', spend: '11.5', impressions: '900', inline_link_clicks: '9', actions: [{ action_type: 'lead', value: '3' }] })
    }
  }
  for (let i = 0; i < 7; i++) tablas.crm_contacts.push({ id: `k-${i}`, client_id: PERFIL.id, utm_content: '4002', created_at: `${meta.masDias(hoyReal(), -1 - (i % 4))}T11:00:00Z` })
  tablas.sales.push({ id: 'v1', client_id: PERFIL.id, contact_id: 'c-3-0', cash_collected: 497, status: 'won', created_at: new Date().toISOString() })
  M.agg = [{ ad_id: '4001', frequency: '1.4' }, { ad_id: '4002', frequency: '1.2' }]
  M.gasto = { today: 20, this_month: 900 }
  M.llamadas = []
  M.falla = null
  avisos.length = 0
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fetchMeta))
  meta._espera.ms = async () => {}
})
afterEach(() => vi.unstubAllGlobals())

const ctxDe = (extra = {}) => ({
  clientId: PERFIL.id, perfil: PERFIL, hoy: new Date(), config: {}, autonomia: 'proponer',
  proponer: vi.fn(async (p) => ({ id: randomUUID(), ...p })), avisar: vi.fn(async () => 1), log: () => {}, ...extra,
})

describe('la pasada diaria', () => {
  beforeEach(siembra)

  it('sincroniza, cruza con el CRM, propone con su escritura y manda el parte; no toca Meta', async () => {
    const ctx = ctxDe()
    const r = await agente.corre(ctx)
    expect(agente.key).toBe('media-buyer')
    expect(r.propuestas).toBe(2)
    const enviadas = ctx.proponer.mock.calls.map(([p]) => p)
    const subir = enviadas.find(p => p.herramienta === 'meta_presupuesto')
    expect(subir).toMatchObject({ input: { cuenta: 'act_111', tipo: 'adset', objeto: '3001', antes: 40, despues: 48 } })
    expect(subir.porque).toMatch(/140 leads según HELM \(1,85 €\/lead/)
    expect(subir.porque).toMatch(/Meta cuenta 147 leads/)
    expect(subir.porque).toMatch(/1 venta cobrada \(497 €\)/)
    const pausar = enviadas.find(p => p.herramienta === 'meta_pausar')
    expect(pausar).toMatchObject({ input: { tipo: 'adset', objeto: '3002' }, titulo: 'Pausar el conjunto «Carrusel»' })
    expect(pausar.porque).toMatch(/46 € gastados y 7 leads según HELM \(6,57 €\/lead, 2,6 veces/)
    // La foto queda en helm_ads_metricas, con el CRM.
    expect(tablas.helm_ads_metricas.filter(f => f.ad_id === '4001')).toHaveLength(7)
    expect(tablas.helm_ads_metricas.find(f => f.ad_id === '4001')).toMatchObject({ cuenta_id: 'act_111', client_id: PERFIL.id, leads_crm: 20, leads_meta: 21, gasto: 37 })
    // El parte.
    expect(ctx.avisar).toHaveBeenCalledTimes(1)
    const parte = ctx.avisar.mock.calls[0][0]
    expect(parte).toMatch(/^📣 DDC · «DDC Ads» · .* · captación/)
    expect(parte).toMatch(/Ayer: 48,5 € gastados \(tope 120 €\/día\)\. 22 leads a 2,2 € según HELM; Meta cuenta 24 \(2 que no están en el CRM\)/)
    expect(parte).toMatch(/7 días: 305 € · 147 leads \(2,07 €\/lead\) · 1 venta cobrada \(497 €\)/)
    expect(parte).toMatch(/En la bandeja: 2 propuestas \(1 subir, 1 pausar\)\. Si no contestas, a las 19:00 caducan/)
    // Proponer no es tocar: ni un POST a Meta.
    expect(posts()).toHaveLength(0)
  })

  it('en nivel 0 solo mira: sincroniza y da el parte, sin propuestas', async () => {
    tablas.helm_ads_cuentas[0].nivel = 0
    const ctx = ctxDe()
    expect((await agente.corre(ctx)).propuestas).toBe(0)
    expect(ctx.proponer).not.toHaveBeenCalled()
    expect(ctx.avisar.mock.calls[0][0]).toMatch(/Nivel 0 \(solo mira\): habría propuesto 2 cambios/)
  })

  it('lo que la escritura no deja proponer queda en el parte con su motivo', async () => {
    const ctx = ctxDe({ proponer: vi.fn(async () => ({ creada: false, motivo: 'No se puede hacer tal cual: no cabe.' })) })
    expect((await agente.corre(ctx)).propuestas).toBe(0)
    expect(ctx.avisar.mock.calls[0][0]).toMatch(/No propongo «Subir «Reel cámara».*no cabe/)
  })

  it('sin conexión con Meta no revienta: lo dice', async () => {
    tablas.user_integrations = []
    expect(await agente.corre(ctxDe())).toMatchObject({ propuestas: 0, resumen: expect.stringMatching(/no tiene Meta Ads conectado/) })
    tablas.helm_ads_cuentas = []
    expect((await agente.corre(ctxDe())).resumen).toMatch(/Sin cuentas/)
  })
})

describe('el vigilante: solo frena', () => {
  beforeEach(siembra)
  const subeAlgo = () => posts().filter(p => p.p.daily_budget || p.p.status === 'ACTIVE')

  it('por debajo del 80 % no hace nada; al 80 % avisa una vez al día', async () => {
    M.gasto.today = 50
    expect((await mb.vigilante())[0]).toMatchObject({ accion: 'nada', gasto: 50 })
    expect(avisos).toHaveLength(0)
    M.gasto.today = 100
    expect((await mb.vigilante())[0].accion).toBe('aviso')
    expect((await mb.vigilante())[0].accion).toBe('nada')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].titulo).toMatch(/va por el 83,3 % del tope de hoy/)
    expect(posts()).toHaveLength(0)
    expect(tablas.helm_ads_cuentas[0].vigilante).toMatchObject({ gasto: 100, avisos: { p80: true } })
  })

  it('si el gasto de hoy pasa del tope duro, pausa lo activo, guarda la lista y avisa; nunca sube', async () => {
    M.gasto.today = 211 // tope duro = 1,75 × 120 = 210
    const [r] = await mb.vigilante()
    expect(r.accion).toBe('parada')
    expect(posts().map(p => [p.ruta, p.p.status])).toEqual([['2001', 'PAUSED']])
    expect(subeAlgo()).toHaveLength(0)
    expect(tablas.helm_ads_paradas[0]).toMatchObject({ quien: 'Vigilante de HELM', origen: 'vigilante', objetos: [{ id: '2001', nombre: 'Captación' }] })
    expect(tablas.helm_ads_paradas[0].motivo).toMatch(/Hoy van 211 € gastados y el tope duro del día es 210 €/)
    expect(tablas.helm_ads_acciones.map(a => [a.accion, a.estado, a.origen])).toEqual([['parar_todo', 'intento', 'vigilante'], ['parar_todo', 'hecho', 'vigilante']])
    expect(avisos[0]).toMatchObject({ nivel: 'error', destino: 'ads' })
    expect(avisos[0].cuerpo).toMatch(/He pausado 1 campaña/)
    // La hora siguiente ya no hay nada activo: ni POST ni aviso nuevo.
    M.llamadas = []
    expect((await mb.vigilante())[0].accion).toBe('nada')
    expect(posts()).toHaveLength(0)
    expect(avisos).toHaveLength(1)
  })

  it('el tope mensual también frena', async () => {
    tablas.helm_ads_cuentas[0].tope_mensual = 1000
    M.gasto.this_month = 1000
    expect((await mb.vigilante())[0].accion).toBe('parada')
    expect(subeAlgo()).toHaveLength(0)
    expect(tablas.helm_ads_paradas[0].motivo).toMatch(/En el mes van 1000 € y el tope mensual es 1000 €/)
  })

  it('en nivel 0 solo avisa', async () => {
    tablas.helm_ads_cuentas[0].nivel = 0
    M.gasto.today = 500
    expect((await mb.vigilante())[0].accion).toBe('aviso')
    expect(posts()).toHaveLength(0)
    expect(avisos[0].cuerpo).toMatch(/nivel 0 \(solo mira\): no he parado nada/)
  })

  it('si Meta falla 3 veces seguidas, avisa de que no puede vigilar', async () => {
    M.falla = () => responde(500, { error: { code: 2, message: 'Service temporarily unavailable', is_transient: true } })
    await mb.vigilante()
    await mb.vigilante()
    expect(avisos).toHaveLength(0)
    const [r] = await mb.vigilante()
    expect(r.accion).toBe('error')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].titulo).toMatch(/el vigilante no puede leer/)
    expect(posts()).toHaveLength(0)
  })
})
