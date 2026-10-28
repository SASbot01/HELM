// Meta Ads (api/_lib/meta-ads.js, las escrituras meta_presupuesto y
// meta_pausar de api/_lib/bot/escrituras.js y api/meta-ads.js): el cliente de
// la Marketing API v26.0 (reintentos y errores claros, sin enseñar el token),
// los topes (+20 %, aprendizaje, 72 h, tope diario y mensual, sin topes no se
// sube), que si el valor en Meta ha cambiado no se aplica, que el registro se
// escribe ANTES de llamar a Meta (si no se puede, no se llama), «parar todo» y
// reanudar exactamente lo parado, la bandeja de punta a punta y el endpoint
// (los topes, solo quien administra la agencia). Sin red ni base: Meta es un
// fetch simulado y Supabase va en memoria.
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Supabase en memoria ─────────────────────────────────────────────────────
let tablas = {}
const fallan = new Set()
// Como el trigger de la migración 117: el registro solo admite añadir.
const SOLO_ANADIR = new Set(['helm_ads_acciones'])
const ahoraISO = () => new Date().toISOString()
// Los valores por defecto de las columnas que importan aquí (los pone Postgres).
const DEFECTOS = { helm_propuestas: () => ({ estado: 'pendiente', tg_mensajes: [], datos: {} }) }
const nueva = (t, r) => ({ id: randomUUID(), created_at: ahoraISO(), creada_en: ahoraISO(), ...(DEFECTOS[t]?.() || {}), ...structuredClone(r) })

class Q {
  constructor(t) { Object.assign(this, { t, f: [], op: 'select', ord: [], lim: null, uno: null }) }
  select() { return this }
  eq(c, v) { this.f.push(r => r[c] != null && String(r[c]) === String(v)); return this }
  neq(c, v) { this.f.push(r => String(r[c]) !== String(v)); return this }
  gt(c, v) { this.f.push(r => r[c] != null && String(r[c]) > String(v)); return this }
  gte(c, v) { this.f.push(r => r[c] != null && String(r[c]) >= String(v)); return this }
  lt(c, v) { this.f.push(r => r[c] != null && String(r[c]) < String(v)); return this }
  lte(c, v) { this.f.push(r => r[c] != null && String(r[c]) <= String(v)); return this }
  in(c, v) { this.f.push(r => v.map(String).includes(String(r[c]))); return this }
  is(c, v) { this.f.push(r => (v === null ? r[c] == null : r[c] === v)); return this }
  not(c, op) { if (op === 'is') this.f.push(r => r[c] != null); return this }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this }
  limit(n) { this.lim = n; return this }
  insert(d) { this.op = 'insert'; this.d = d; return this }
  update(d) { this.op = 'update'; this.d = d; return this }
  upsert(d, o = {}) { Object.assign(this, { op: 'upsert', d, on: (o.onConflict || 'id').split(','), ignora: Boolean(o.ignoreDuplicates) }); return this }
  delete() { this.op = 'delete'; return this }
  single() { this.uno = 's'; return this.run() }
  maybeSingle() { this.uno = 'm'; return this.run() }
  then(a, b) { return this.run().then(a, b) }
  async run() {
    const t = (tablas[this.t] ||= [])
    const pasa = r => this.f.every(f => f(r))
    if ((this.op === 'insert' || this.op === 'upsert') && fallan.has(this.t)) return { data: null, error: { message: `fallo simulado en ${this.t}` } }
    if ((this.op === 'update' || this.op === 'delete') && SOLO_ANADIR.has(this.t)) return { data: null, error: { message: 'helm_ads_acciones es un registro: solo se pueden añadir filas' } }
    let data
    if (this.op === 'insert') {
      data = (Array.isArray(this.d) ? this.d : [this.d]).map(r => nueva(this.t, r))
      t.push(...data)
    } else if (this.op === 'upsert') {
      data = []
      for (const r of Array.isArray(this.d) ? this.d : [this.d]) {
        const ya = t.find(x => this.on.every(k => String(x[k]) === String(r[k])))
        if (ya && this.ignora) continue
        if (ya) { Object.assign(ya, structuredClone(r)); data.push(ya) } else { const n = nueva(this.t, r); t.push(n); data.push(n) }
      }
    } else if (this.op === 'update') {
      data = t.filter(pasa)
      for (const r of data) Object.assign(r, structuredClone(this.d))
    } else if (this.op === 'delete') {
      data = t.filter(pasa)
      tablas[this.t] = t.filter(r => !data.includes(r))
    } else {
      data = t.filter(pasa)
      for (const [c, asc] of [...this.ord].reverse()) data = [...data].sort((a, b) => (asc ? 1 : -1) * String(a[c] ?? '').localeCompare(String(b[c] ?? '')))
    }
    if (this.lim != null) data = data.slice(0, this.lim)
    data = structuredClone(data)
    if (this.uno === 's') return data.length ? { data: data[0], error: null } : { data: null, error: { message: 'sin filas' } }
    if (this.uno === 'm') return { data: data[0] ?? null, error: null }
    return { data, error: null }
  }
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => new Q(t) } }))

// ── Lo que no hace falta para estas pruebas ─────────────────────────────────
vi.mock('../api/mcp/[token].js', () => ({
  ESCRIBEN: [], DEL_CLIENTE: ['perfiles'], herramientasDe: () => [], ejecutaHerramienta: vi.fn(),
  alcanceDesdeContexto: async ({ agenciaId }) => (agenciaId === 'agencia-1'
    ? { agenciaId, nombre: 'Silvestre AI', perfiles: tablas.clients.filter(c => c.agencia_id === agenciaId).map(({ id, slug, name }) => ({ id, slug, name })), origen: 'agentes' }
    : null),
}))
vi.mock('../api/_lib/equipo.js', () => ({ AGENTES_LANZABLES: ['director'], encolaAgente: vi.fn(), tokensDeHoy: async () => 0 }))
vi.mock('../api/_lib/ingesta.js', () => ({ enEntrada: vi.fn(async () => []) }))
const accede = vi.fn()
const administra = vi.fn()
vi.mock('../api/_lib/access.js', async (original) => ({
  ...(await original()),
  requireProfileAccess: (...a) => accede(...a),
  puedeUsarAgentes: async () => true,
  puedeVerSaldo: (...a) => administra(...a),
}))

// ── Meta, simulado ──────────────────────────────────────────────────────────
const TOKEN = 'EAAtokenDelUsuarioDelSistema0123456789abcdef'
const M = { objs: {}, gasto: { today: 0, this_month: 0 }, llamadas: [], fallos: [], cuentas: [] }
// Los campos que solo tiene un tipo: pedirlos de otro da error, como en Meta.
const SOLO = { learning_stage_info: 'adset', adset_id: 'ad', objective: 'campaign' }
function campos(o, fields) {
  const pedidos = String(fields || '').split(',').filter(Boolean)
  if (pedidos.some(f => SOLO[f] && SOLO[f] !== o.tipo)) return null
  const out = { id: o.id }
  for (const f of pedidos) if (o[f] !== undefined) out[f] = o[f]
  return out
}
const responde = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => structuredClone(body) })
const errorMeta = (status, code, message, extra = {}) => responde(status, { error: { code, message, ...extra } })

async function fetchMeta(url, opciones = {}) {
  const u = new URL(url)
  const metodo = opciones.method || 'GET'
  const p = Object.fromEntries(metodo === 'GET' ? u.searchParams : new URLSearchParams(opciones.body))
  const [, version, ...resto] = u.pathname.split('/')
  const ruta = resto.join('/')
  M.llamadas.push({ metodo, ruta, p, version, host: u.host })
  if (M.fallos.length) {
    const f = M.fallos.shift()
    return typeof f === 'function' ? f() : f
  }
  if (p.access_token !== TOKEN) return errorMeta(400, 190, 'Invalid OAuth access token - Cannot parse access token')
  const partes = ruta.split('/')
  if (ruta === 'me') return responde(200, { id: '999', name: 'HELM Media buyer' })
  if (ruta === 'me/adaccounts') return responde(200, { data: M.cuentas })
  if (partes[0].startsWith('act_')) {
    const acc = partes[0].slice(4)
    const de = (tipo) => Object.values(M.objs).filter(o => o.tipo === tipo && o.account_id === acc).map(o => campos(o, p.fields)).filter(Boolean)
    if (partes[1] === 'campaigns') return responde(200, { data: de('campaign') })
    if (partes[1] === 'adsets') return responde(200, { data: de('adset') })
    if (partes[1] === 'ads') return responde(200, { data: de('ad') })
    if (partes[1] === 'insights') return responde(200, { data: p.date_preset ? [{ spend: String(M.gasto[p.date_preset] ?? 0) }] : [] })
  }
  const o = M.objs[partes[0]]
  if (!o) return errorMeta(400, 100, 'Unsupported get request.', { error_subcode: 33 })
  if (partes[1] === 'adsets') return responde(200, { data: Object.values(M.objs).filter(x => x.tipo === 'adset' && x.campaign_id === o.id).map(x => campos(x, p.fields)) })
  if (metodo === 'POST') {
    if (p.daily_budget) o.daily_budget = M.ignoraPresupuesto ? o.daily_budget : p.daily_budget
    if (p.status) { o.status = p.status; o.effective_status = p.status }
    return responde(200, { success: true })
  }
  const c = campos(o, p.fields)
  return c ? responde(200, c) : errorMeta(400, 100, '(#100) Tried accessing nonexisting field (learning_stage_info) on node type (Ad)')
}
const posts = () => M.llamadas.filter(l => l.metodo === 'POST')

const meta = await import('../api/_lib/meta-ads.js')
const { herramientasBot, NO_SE_PUEDE } = await import('../api/_lib/bot-herramientas.js')
const { proponer, decidir } = await import('../api/_lib/propuestas.js')
const { default: endpoint } = await import('../api/meta-ads.js')

// ── Datos ───────────────────────────────────────────────────────────────────
const PERFIL = { id: randomUUID(), slug: 'detras-de-camra', name: 'DDC' }
const OTRO = { id: randomUUID(), slug: 'enformaconhugo', name: 'Hugo' }
const hace = (horas) => new Date(Date.now() - horas * 3_600_000).toISOString()
const cuentaFila = (extra = {}) => ({
  id: randomUUID(), client_id: PERFIL.id, cuenta_id: 'act_111', nombre: 'DDC Ads', moneda: 'EUR', zona: 'Europe/Madrid',
  activa: true, nivel: 1, tope_diario: 120, tope_duro: null, tope_mensual: 3600, subida_max_pct: 20, horas_entre_subidas: 72,
  dias_min: 3, gasto_min_factor: 1.5, objetivo_cpl: 2.5, objetivo_cpa: null, fase: 'captacion', vigilante: {}, ...extra,
})

function siembra() {
  tablas = {
    clients: [{ ...PERFIL, agencia_id: 'agencia-1', active: true }, { ...OTRO, agencia_id: 'agencia-1', active: true }],
    agencias: [{ id: 'agencia-1', nombre: 'Silvestre AI' }],
    user_integrations: [{ id: randomUUID(), client_id: PERFIL.id, service: 'meta_ads', member_id: null, enabled: true, config: { token: TOKEN } }],
    helm_ads_cuentas: [cuentaFila()],
    helm_ads_acciones: [],
    helm_ads_paradas: [],
    helm_propuestas: [],
    audit_logs: [],
  }
  M.objs = {}
  const o = (x) => { M.objs[x.id] = { account_id: '111', status: 'ACTIVE', effective_status: 'ACTIVE', created_time: hace(24 * 10), ...x } }
  o({ id: '2001', tipo: 'campaign', name: 'Captación /valor' })
  o({ id: '2002', tipo: 'campaign', name: 'Retargeting', daily_budget: '1000' }) // presupuesto de campaña: 10 €
  o({ id: '2003', tipo: 'campaign', name: 'Vieja', status: 'PAUSED', effective_status: 'PAUSED' })
  o({ id: '3001', tipo: 'adset', name: 'Reel cámara', campaign_id: '2001', daily_budget: '4000', learning_stage_info: { status: 'SUCCESS' } })
  o({ id: '3002', tipo: 'adset', name: 'Carrusel', campaign_id: '2001', daily_budget: '5000', learning_stage_info: { status: 'LEARNING' } })
  o({ id: '3003', tipo: 'adset', name: 'Retarget 7d', campaign_id: '2002', learning_stage_info: { status: 'SUCCESS' } })
  o({ id: '4001', tipo: 'ad', name: 'Hook en la calle', adset_id: '3001', campaign_id: '2001' })
  o({ id: '4002', tipo: 'ad', name: 'Carrusel 5 errores', adset_id: '3002', campaign_id: '2001' })
  // Un conjunto de OTRA cuenta.
  o({ id: '3999', tipo: 'adset', name: 'De otro', account_id: '222', campaign_id: '2999', daily_budget: '1000', learning_stage_info: { status: 'SUCCESS' } })
  M.cuentas = [{ id: 'act_111', account_id: '111', name: 'DDC Ads', currency: 'EUR', timezone_name: 'Europe/Madrid' }, { id: 'act_333', account_id: '333', name: 'Hugo Ads', currency: 'EUR', timezone_name: 'Europe/Madrid' }]
  M.gasto = { today: 30, this_month: 900 }
  M.llamadas = []
  M.fallos = []
  M.ignoraPresupuesto = false
}

beforeEach(() => {
  siembra()
  fallan.clear()
  vi.stubGlobal('fetch', vi.fn(fetchMeta))
  meta._espera.ms = async () => {}
  accede.mockReset()
  accede.mockResolvedValue({ userId: 'u1', email: 'alex@example.com', name: 'Alex', superadmin: true })
  administra.mockReset()
  administra.mockResolvedValue(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.META_APP_SECRET
})

const acciones = () => tablas.helm_ads_acciones
const presupuesto = (args) => meta.planPresupuesto({ clientId: PERFIL.id, perfil: 'DDC', cuenta: 'act_111', tipo: 'adset', objeto: '3001', quien: 'Alex', ...args })

// ── El cliente ──────────────────────────────────────────────────────────────
describe('el cliente de la Marketing API', () => {
  it('habla con graph.facebook.com v26.0, con el token en la petición y todas las páginas', async () => {
    let n = 0
    M.fallos.push(() => responde(200, { data: [{ id: '1' }], paging: { cursors: { after: 'CUR1' }, next: 'https://graph.facebook.com/v26.0/act_111/campaigns?after=CUR1' } }))
    M.fallos.push(() => { n++; return responde(200, { data: [{ id: '2' }], paging: { cursors: { after: 'CUR2' } } }) })
    const lista = await meta.campanas(TOKEN, 'act_111')
    expect(lista.map(c => c.id)).toEqual(['1', '2'])
    expect(n).toBe(1)
    expect(M.llamadas[0]).toMatchObject({ host: 'graph.facebook.com', version: 'v26.0', ruta: 'act_111/campaigns' })
    expect(M.llamadas[0].p.access_token).toBe(TOKEN)
    expect(M.llamadas[1].p.after).toBe('CUR1')
    expect(meta.VERSION).toBe('v26.0')
  })

  it('reintenta lo pasajero (5xx, red) y no lo que es un error de la petición', async () => {
    M.fallos.push(errorMeta(500, 2, 'Service temporarily unavailable', { is_transient: true }))
    M.fallos.push(() => { throw new TypeError('fetch failed') })
    expect((await meta.yo(TOKEN)).name).toBe('HELM Media buyer')
    expect(M.llamadas).toHaveLength(3)

    M.llamadas = []
    M.fallos.push(errorMeta(400, 100, 'Invalid parameter'))
    await expect(meta.yo(TOKEN)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Meta dice: Invalid parameter/) })
    expect(M.llamadas).toHaveLength(1)
  })

  it('token caducado: 401 con qué hacer, y sin enseñar el token', async () => {
    const e = await meta.yo('EAAotroTokenQueNoVale0123456789').catch(x => x)
    expect(e).toBeInstanceOf(meta.MetaError)
    expect(e).toMatchObject({ statusCode: 401, caducado: true, code: 190 })
    expect(e.message).toMatch(/ha caducado o se ha revocado/)
    expect(e.message).not.toMatch(/EAA/)
    expect(M.llamadas).toHaveLength(1)
  })

  it('límite de uso: si Meta pide esperar minutos no insiste; lee las cabeceras de uso', async () => {
    const cab = { 'x-business-use-case-usage': JSON.stringify({ 123: [{ type: 'ads_management', call_count: 98, total_cputime: 20, total_time: 30, estimated_time_to_regain_access: 12 }] }), 'x-ad-account-usage': JSON.stringify({ acc_id_util_pct: 40, ads_api_access_tier: 'development_access' }) }
    M.fallos.push(responde(400, { error: { code: 80004, message: 'There have been too many calls to this ad-account.' } }, cab))
    const e = await meta.campanas(TOKEN, 'act_111').catch(x => x)
    expect(e).toMatchObject({ statusCode: 429, limite: true, esperaMin: 12 })
    expect(e.message).toMatch(/bajar el ritmo.*12 min/)
    expect(M.llamadas).toHaveLength(1)
    expect(meta.ultimoUso).toMatchObject({ pct: 98, esperaMin: 12, nivel: 'development_access' })
    // Sin espera, se reintenta.
    M.llamadas = []
    M.fallos.push(errorMeta(400, 17, 'User request limit reached'))
    expect(await meta.campanas(TOKEN, 'act_111')).toHaveLength(3)
    expect(M.llamadas).toHaveLength(2)
  })

  it('con META_APP_SECRET, cada llamada lleva su appsecret_proof', async () => {
    process.env.META_APP_SECRET = 'secreto-de-la-app'
    await meta.yo(TOKEN)
    const { createHmac } = await import('node:crypto')
    expect(M.llamadas[0].p.appsecret_proof).toBe(createHmac('sha256', 'secreto-de-la-app').update(TOKEN).digest('hex'))
  })

  it('normaliza los insights: leads de las acciones, CTR de enlace y céntimos', () => {
    const f = meta.normalizaInsight({ date_start: '2026-10-27', ad_id: 4001, ad_name: 'Hook', spend: '12.345', impressions: '1000', reach: '800', frequency: '1.25', clicks: '30', inline_link_clicks: '20', inline_link_click_ctr: '2', ctr: '3', actions: [{ action_type: 'link_click', value: '20' }, { action_type: 'lead', value: '5' }] })
    expect(f).toMatchObject({ dia: '2026-10-27', ad_id: '4001', gasto: 12.35, ctr: 2, leads_meta: 5, frecuencia: 1.25, clics_enlace: 20 })
    expect(meta.aMinimos(48, 'EUR')).toBe(4800)
    expect(meta.aMinimos(1500, 'JPY')).toBe(1500)
    expect(meta.normalizaCuenta('111')).toBe('act_111')
    expect(meta.normalizaCuenta('act_abc')).toBeNull()
    expect(meta.diasQuedanMes('2026-10-28')).toBe(4)
    expect(meta.topeDuro({ tope_diario: 100 })).toBe(175)
    expect(meta.topeDuro({ tope_diario: 100, tope_duro: 150 })).toBe(150)
  })
})

// ── Cambiar un presupuesto ─────────────────────────────────────────────────
describe('planPresupuesto (meta_presupuesto): los topes', () => {
  it('subir un 20 %: resumen con antes → después, sin tocar nada; al aplicar, registro antes y Meta lo confirma', async () => {
    const plan = await presupuesto({ antes: 40, despues: 48, motivo: '1,85 €/lead en 7 días' })
    expect(plan.resumen).toBe('En DDC (cuenta «DDC Ads»): subir el presupuesto diario del conjunto «Reel cámara» de 40 € a 48 € (+20 %). Tope de la cuenta: 120 €/día entre todos los presupuestos y 3600 € al mes.')
    expect(posts()).toHaveLength(0)
    expect(acciones()).toHaveLength(0)
    // El registro se escribe antes: al llegar el POST ya está el intento.
    let enElPost = null
    globalThis.fetch.mockImplementation(async (url, o) => {
      if (o?.method === 'POST') enElPost = acciones().map(a => a.estado)
      return fetchMeta(url, o)
    })
    const r = await plan.aplicar()
    expect(enElPost).toEqual(['intento'])
    expect(posts()).toHaveLength(1)
    expect(posts()[0]).toMatchObject({ ruta: '3001', p: { daily_budget: '4800' } })
    expect(M.objs['3001'].daily_budget).toBe('4800')
    expect(r.hecho).toMatch(/40 € → 48 €\. Meta lo confirma/)
    const [intento, hecho] = acciones()
    expect(intento).toMatchObject({ estado: 'intento', accion: 'presupuesto', objeto_id: '3001', quien: 'Alex', porque: '1,85 €/lead en 7 días', antes: { daily_budget: 4000, valor: 40 }, despues: { daily_budget: 4800, valor: 48 } })
    expect(hecho).toMatchObject({ estado: 'hecho', intento_id: intento.id })
  })

  it('más del +20 % de una vez, no', async () => {
    await expect(presupuesto({ despues: 49 })).rejects.toThrow(/\+22,5 %: el tope es \+20 % de una vez \(como mucho 48 €\)/)
    tablas.helm_ads_cuentas[0].subida_max_pct = 10
    await expect(presupuesto({ despues: 46 })).rejects.toThrow(/el tope es \+10 %/)
    expect(posts()).toHaveLength(0)
  })

  it('en aprendizaje no se sube (sí se baja)', async () => {
    await expect(presupuesto({ objeto: '3002', despues: 55 })).rejects.toThrow(/«Carrusel» no ha salido del aprendizaje \(aún aprendiendo\)/)
    const baja = await presupuesto({ objeto: '3002', despues: 40 })
    expect(baja.resumen).toMatch(/bajar el presupuesto diario del conjunto «Carrusel» de 50 € a 40 € \(−20 %\)\.$/)
    // Una campaña con presupuesto de campaña: el aprendizaje es el de sus conjuntos.
    const camp = await meta.planPresupuesto({ clientId: PERFIL.id, perfil: 'DDC', cuenta: 'act_111', tipo: 'campaign', objeto: '2002', despues: 12 })
    expect(camp.resumen).toMatch(/de la campaña «Retargeting» de 10 € a 12 € \(\+20 %\)/)
    M.objs['3003'].learning_stage_info = { status: 'FAIL' }
    await expect(meta.planPresupuesto({ clientId: PERFIL.id, cuenta: 'act_111', tipo: 'campaign', objeto: '2002', despues: 12 })).rejects.toThrow(/aprendizaje limitado/)
  })

  it('una subida cada 72 h por conjunto', async () => {
    const subida = (horas) => ({ id: randomUUID(), client_id: PERFIL.id, cuenta_id: 'act_111', objeto_tipo: 'adset', objeto_id: '3001', accion: 'presupuesto', estado: 'hecho', antes: { valor: 33 }, despues: { valor: 40 }, quien: 'Alex', origen: 'aprobado', creada_en: hace(horas) })
    tablas.helm_ads_acciones.push(subida(10))
    await expect(presupuesto({ despues: 48 })).rejects.toThrow(/ya se le subió el presupuesto el .*: hasta 72 h después no se vuelve a subir/)
    // Una bajada reciente no cuenta; una subida de hace más de 72 h, tampoco.
    tablas.helm_ads_acciones = [{ ...subida(10), antes: { valor: 50 }, despues: { valor: 40 } }, subida(80)]
    expect((await presupuesto({ despues: 48 })).resumen).toMatch(/de 40 € a 48 €/)
  })

  it('la suma de presupuestos diarios no pasa del tope; el mes tampoco; sin topes no se sube', async () => {
    // Ahora: 40 (Reel) + 50 (Carrusel) + 10 (Retargeting) = 100 €/día.
    tablas.helm_ads_cuentas[0].tope_diario = 105
    await expect(presupuesto({ despues: 48 })).rejects.toThrow(/sería 108 €, más que el tope de 105 €\. Cabe como mucho 45 €/)
    expect((await presupuesto({ despues: 45 })).resumen).toMatch(/de 40 € a 45 €/)
    // Lo pausado no gasta: no cuenta.
    M.objs['3002'].status = 'PAUSED'
    expect((await presupuesto({ despues: 48 })).resumen).toMatch(/a 48 €/)

    tablas.helm_ads_cuentas[0].tope_diario = 120
    M.gasto.this_month = 3500
    await expect(presupuesto({ despues: 48 })).rejects.toThrow(/el mes acabaría en unos .* más que el tope mensual de 3600 €/)

    tablas.helm_ads_cuentas[0].tope_mensual = null
    await expect(presupuesto({ despues: 48 })).rejects.toThrow(/no tiene topes/)
    expect(posts()).toHaveLength(0)
  })

  it('si en Meta ya no está el «antes» que se propuso, no se toca', async () => {
    M.objs['3001'].daily_budget = '4500'
    await expect(presupuesto({ antes: 40, despues: 48 })).rejects.toThrow(/ya no es 40 € sino 45 €: alguien lo ha cambiado/)
    expect(posts()).toHaveLength(0)
    expect(acciones()).toHaveLength(0)
  })

  it('solo lo de la cuenta y la cuenta, solo de su perfil', async () => {
    await expect(presupuesto({ objeto: '3999', despues: 11 })).rejects.toThrow(/no es un conjunto de la cuenta act_111/)
    await expect(meta.planPresupuesto({ clientId: OTRO.id, cuenta: 'act_111', tipo: 'adset', objeto: '3001', despues: 48 })).rejects.toThrow(/no está conectada a este perfil/)
    // Un anuncio pasado como conjunto: Meta no da el campo y no se toca.
    await expect(presupuesto({ objeto: '4001', despues: 48 })).rejects.toThrow(/Meta dice/)
    expect(posts()).toHaveLength(0)
  })

  it('si el registro no se puede escribir, no se llama a Meta', async () => {
    const plan = await presupuesto({ despues: 48 })
    fallan.add('helm_ads_acciones')
    await expect(plan.aplicar()).rejects.toThrow(/No se ha podido escribir el registro.*no se ha tocado Meta/)
    expect(posts()).toHaveLength(0)
    expect(M.objs['3001'].daily_budget).toBe('4000')
  })

  it('si Meta dice que sí pero al volver a leerlo no ha cambiado, queda como fallido', async () => {
    M.ignoraPresupuesto = true
    const plan = await presupuesto({ despues: 48 })
    await expect(plan.aplicar()).rejects.toThrow(/sigue en 40 €/)
    expect(acciones().map(a => a.estado)).toEqual(['intento', 'fallido'])
  })

  it('el mismo valor: no hay nada que hacer', async () => {
    const plan = await presupuesto({ despues: 40 })
    expect(plan.ya).toBeTruthy()
    expect(plan.resumen).toMatch(/ya es 40 €/)
  })
})

describe('planPausa (meta_pausar)', () => {
  it('pausa un anuncio, con registro y comprobación', async () => {
    const plan = await meta.planPausa({ clientId: PERFIL.id, perfil: 'DDC', cuenta: 'act_111', tipo: 'ad', objeto: '4002', quien: 'Alex', motivo: '6,57 €/lead' })
    expect(plan.resumen).toBe('En DDC (cuenta «DDC Ads»): pausar el anuncio «Carrusel 5 errores». Deja de gastar en cuanto Meta lo aplique; se puede reactivar.')
    const r = await plan.aplicar()
    expect(posts()).toEqual([expect.objectContaining({ ruta: '4002', p: expect.objectContaining({ status: 'PAUSED' }) })])
    expect(r.hecho).toMatch(/El anuncio «Carrusel 5 errores»: en pausa\. Meta lo confirma/)
    expect(acciones().map(a => [a.accion, a.estado])).toEqual([['pausar', 'intento'], ['pausar', 'hecho']])
    // Ya en pausa: nada que hacer.
    expect((await meta.planPausa({ clientId: PERFIL.id, cuenta: 'act_111', tipo: 'ad', objeto: '4002' })).ya).toBeTruthy()
  })
})

// ── Parar todo ──────────────────────────────────────────────────────────────
describe('parar los anuncios y reanudar exactamente esos', () => {
  it('pausa solo lo activo, guarda la lista antes de tocar Meta y reanuda esas', async () => {
    let paradaAntes = null
    globalThis.fetch.mockImplementation(async (url, o) => {
      if (o?.method === 'POST' && paradaAntes == null) paradaAntes = structuredClone(tablas.helm_ads_paradas)
      return fetchMeta(url, o)
    })
    const r = await meta.pararTodo({ clientId: PERFIL.id, cuenta: 'act_111', quien: 'Alex', origen: 'panel', motivo: 'Me voy de viaje' })
    expect(r.pausadas.map(x => x.id)).toEqual(['2001', '2002'])
    expect(paradaAntes).toHaveLength(1)
    expect(paradaAntes[0].objetos.map(x => x.id)).toEqual(['2001', '2002'])
    expect(posts().map(p => [p.ruta, p.p.status])).toEqual([['2001', 'PAUSED'], ['2002', 'PAUSED']])
    expect(acciones().map(a => [a.accion, a.estado])).toEqual([['parar_todo', 'intento'], ['parar_todo', 'hecho']])
    // Otra vez: no queda nada activo.
    expect((await meta.pararTodo({ clientId: PERFIL.id, cuenta: 'act_111' })).ya).toBe(true)

    M.llamadas = []
    const re = await meta.reanudarTodo({ clientId: PERFIL.id, cuenta: 'act_111', quien: 'Alex' })
    expect(re.reactivadas.map(x => x.id)).toEqual(['2001', '2002'])
    // La que ya estaba en pausa antes de parar, sigue en pausa.
    expect(M.objs['2003'].status).toBe('PAUSED')
    expect(posts().map(p => [p.ruta, p.p.status])).toEqual([['2001', 'ACTIVE'], ['2002', 'ACTIVE']])
    expect(tablas.helm_ads_paradas[0].reanudada_por).toBe('Alex')
    await expect(meta.reanudarTodo({ clientId: PERFIL.id, cuenta: 'act_111' })).rejects.toThrow(/No hay nada parado/)
  })

  it('no reanuda si hoy ya se ha pasado del tope duro', async () => {
    await meta.pararTodo({ clientId: PERFIL.id, cuenta: 'act_111' })
    M.gasto.today = 300
    M.llamadas = []
    await expect(meta.reanudarTodo({ clientId: PERFIL.id, cuenta: 'act_111' })).rejects.toThrow(/Hoy ya van 300 € gastados y el tope duro del día es 210 €/)
    expect(posts()).toHaveLength(0)
  })

  it('si no se puede guardar la lista, no se para nada', async () => {
    fallan.add('helm_ads_paradas')
    await expect(meta.pararTodo({ clientId: PERFIL.id, cuenta: 'act_111' })).rejects.toThrow(/no se ha tocado Meta/)
    expect(posts()).toHaveLength(0)
  })
})

// ── Las escrituras del bot y la bandeja ─────────────────────────────────────
describe('meta_presupuesto y meta_pausar en el bot y en la bandeja', () => {
  const ALCANCE = () => ({ agenciaId: 'agencia-1', nombre: 'Silvestre AI', perfiles: tablas.clients.map(({ id, slug, name }) => ({ id, slug, name })), origen: 'telegram' })
  const herramientas = () => herramientasBot({ alcance: ALCANCE(), agenciaId: 'agencia-1', superadmin: { id: 'sa-1', email: 'alex@example.com', nombre: 'Alex' } })

  it('son delicadas, con describir, y lo aprobado es lo que se hace', async () => {
    const hs = await herramientas()
    const h = (n) => hs.find(t => t.name === n)
    for (const n of ['meta_presupuesto', 'meta_pausar']) {
      expect(h(n)?.delicada, n).toBe(true)
      expect(typeof h(n).describir).toBe('function')
    }
    const input = { perfil: 'DDC', cuenta: 'act_111', tipo: 'adset', objeto: '3001', despues: 48 }
    const tarjeta = await h('meta_presupuesto').describir(input)
    expect(tarjeta).toMatch(/de 40 € a 48 € \(\+20 %\)/)
    expect(posts()).toHaveLength(0)
    // Alguien lo toca en Ads Manager entre la tarjeta y el «Aprobar».
    M.objs['3001'].daily_budget = '4400'
    const r = await h('meta_presupuesto').ejecutar(input, { resumenAprobado: tarjeta })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/Ha cambiado algo desde que lo aprobaste/)
    expect(posts()).toHaveLength(0)
    // Con el «antes», se dice qué ha cambiado.
    const r2 = await h('meta_presupuesto').ejecutar({ ...input, antes: 40 })
    expect(r2.ok).toBe(false)
    expect(r2.texto).toMatch(/ya no es 40 € sino 44 €/)
    expect(posts()).toHaveLength(0)
    // Y lo que no se puede, ni sale con botones.
    expect(await h('meta_presupuesto').describir({ ...input, despues: 80 })).toMatch(new RegExp(`^${NO_SE_PUEDE}`))
  })

  it('de punta a punta: el agente propone, el dueño aprueba en la bandeja y se aplica; si Meta cambió, no', async () => {
    const p = await proponer({
      clientId: PERFIL.id, agente: 'media-buyer', clave: 'media-buyer:hoy:subir:3001', titulo: 'Subir «Reel cámara» de 40 € a 48 €/día (+20 %)',
      porque: 'En 7 días: 1,85 €/lead.', herramienta: 'meta_presupuesto',
      input: { cuenta: 'act_111', tipo: 'adset', objeto: '3001', antes: 40, despues: 48, motivo: 'En 7 días: 1,85 €/lead.' },
    })
    expect(p.resumen).toMatch(/de 40 € a 48 €/)
    expect(p.input.perfil).toBe(PERFIL.slug)
    const r = await decidir({ id: p.id, aprobar: true, agenciaId: 'agencia-1', quien: { id: 'sa-1', nombre: 'Alex' } })
    expect(r).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(M.objs['3001'].daily_budget).toBe('4800')
    expect(acciones().find(a => a.estado === 'intento')).toMatchObject({ quien: 'Alex', porque: 'En 7 días: 1,85 €/lead.' })

    // La segunda: alguien la cambia a mano antes de aprobar.
    const p2 = await proponer({
      clientId: PERFIL.id, agente: 'media-buyer', clave: 'media-buyer:hoy:bajar:3002', titulo: 'Bajar «Carrusel» de 50 € a 40 €/día (−20 %)',
      herramienta: 'meta_presupuesto', input: { cuenta: 'act_111', tipo: 'adset', objeto: '3002', antes: 50, despues: 40 },
    })
    M.objs['3002'].daily_budget = '3000'
    M.llamadas = []
    const r2 = await decidir({ id: p2.id, aprobar: true, agenciaId: 'agencia-1', quien: { nombre: 'Alex' } })
    expect(r2).toMatchObject({ ok: false, estado: 'fallida' })
    expect(r2.texto).toMatch(/alguien lo ha cambiado/)
    expect(posts()).toHaveLength(0)
  })

  it('una subida que no cabe en los topes ni se propone', async () => {
    const r = await proponer({
      clientId: PERFIL.id, agente: 'media-buyer', clave: 'x', titulo: 'Subir mucho', herramienta: 'meta_presupuesto',
      input: { cuenta: 'act_111', tipo: 'adset', objeto: '3001', antes: 40, despues: 60 },
    })
    expect(r).toMatchObject({ creada: false })
    expect(r.motivo).toMatch(/el tope es \+20 %/)
    expect(tablas.helm_propuestas).toHaveLength(0)
  })
})

// ── El endpoint ─────────────────────────────────────────────────────────────
function llama(method, action, { body, query = {} } = {}) {
  const res = { statusCode: 200, cuerpo: null, setHeader() {}, status(c) { this.statusCode = c; return this }, json(b) { this.cuerpo = b; return this }, end() { return this } }
  const req = { method, query: { clientId: PERFIL.id, action, ...query }, body, headers: {} }
  return endpoint(req, res).then(() => res)
}

describe('api/meta-ads.js', () => {
  it('los topes: solo quien administra la agencia; validados y con su registro', async () => {
    administra.mockResolvedValue(false)
    expect((await llama('POST', 'topes', { body: { cuenta: 'act_111', tope_diario: 500 } })).statusCode).toBe(403)
    expect(tablas.helm_ads_cuentas[0].tope_diario).toBe(120)

    administra.mockResolvedValue(true)
    expect((await llama('POST', 'topes', { body: { cuenta: 'act_111', subida_max_pct: 30 } })).cuerpo.error).toMatch(/como mucho 20/)
    expect((await llama('POST', 'topes', { body: { cuenta: 'act_111', horas_entre_subidas: 24 } })).cuerpo.error).toMatch(/como poco 72/)
    expect((await llama('POST', 'topes', { body: { cuenta: 'act_111', tope_duro: 100 } })).cuerpo.error).toMatch(/tope duro .* no puede ser menor/)
    expect((await llama('POST', 'topes', { body: { cuenta: 'act_111', nivel: 2 } })).cuerpo.error).toMatch(/nivel: 0 .* o 1/)
    const ok = await llama('POST', 'topes', { body: { cuenta: 'act_111', tope_diario: 150, tope_mensual: 4000, objetivo_cpl: 3 } })
    expect(ok.statusCode).toBe(200)
    expect(tablas.helm_ads_cuentas[0]).toMatchObject({ tope_diario: 150, tope_mensual: 4000, objetivo_cpl: 3, topes_por: 'Alex' })
    expect(ok.cuerpo.cuenta.tope_duro_efectivo).toBe(262.5)
    expect(acciones()).toEqual([expect.objectContaining({ accion: 'topes', estado: 'hecho', antes: { tope_diario: 120, tope_mensual: 3600, objetivo_cpl: 2.5 }, despues: { tope_diario: 150, tope_mensual: 4000, objetivo_cpl: 3 } })])
    expect(posts()).toHaveLength(0)
  })

  it('conectar: Meta dice quién es antes de guardar; el token nunca sale entero', async () => {
    tablas.user_integrations = []
    const malo = await llama('POST', 'conectar', { body: { token: 'EAAunTokenQueMetaNoAcepta1234567890' } })
    expect(malo.statusCode).toBe(401)
    expect(tablas.user_integrations).toHaveLength(0)
    const r = await llama('POST', 'conectar', { body: { token: TOKEN } })
    expect(r.statusCode).toBe(200)
    expect(r.cuerpo.token).toBe(meta.maskToken(TOKEN))
    expect(JSON.stringify(r.cuerpo)).not.toContain(TOKEN)
    expect(tablas.user_integrations[0]).toMatchObject({ service: 'meta_ads', config: { token: TOKEN, usuario: { id: '999' } } })
    const estado = await llama('GET', 'estado')
    expect(estado.cuerpo).toMatchObject({ conectado: true, puedeCambiar: true })
    expect(JSON.stringify(estado.cuerpo)).not.toContain(TOKEN)
    // Las cuentas: solo las que ve el token.
    expect((await llama('POST', 'cuentas', { body: { cuentas: ['act_111', 'act_555'] } })).cuerpo.error).toMatch(/no ve act_555/)
    expect((await llama('POST', 'cuentas', { body: { cuentas: ['act_111', '333'] } })).statusCode).toBe(200)
    expect(tablas.helm_ads_cuentas.map(c => c.cuenta_id).sort()).toEqual(['act_111', 'act_333'])
  })

  it('parar: pausa ya, sin pasar por la cola; y deshacer pasa por los topes', async () => {
    const r = await llama('POST', 'parar', { body: {} })
    expect(r.statusCode).toBe(200)
    expect(r.cuerpo.resultado[0].pausadas.map(x => x.id)).toEqual(['2001', '2002'])
    expect(tablas.agent_jobs || []).toHaveLength(0)

    // Deshacer una subida = bajar al valor de antes (enseña primero, hace con el resumen).
    await (await presupuesto({ despues: 48 })).aplicar()
    const intento = acciones().find(a => a.accion === 'presupuesto' && a.estado === 'intento')
    const previa = await llama('POST', 'deshacer', { body: { accion: intento.id } })
    expect(previa.cuerpo).toMatchObject({ previa: true })
    expect(previa.cuerpo.resumen).toMatch(/bajar .* de 48 € a 40 €/)
    M.llamadas = []
    const hecho = await llama('POST', 'deshacer', { body: { accion: intento.id, resumen: previa.cuerpo.resumen } })
    expect(hecho.statusCode).toBe(200)
    expect(M.objs['3001'].daily_budget).toBe('4000')
    expect(acciones().filter(a => a.deshace === intento.id).map(a => a.estado)).toEqual(['intento', 'hecho'])
    // Los no administradores no paran ni deshacen.
    administra.mockResolvedValue(false)
    expect((await llama('POST', 'parar', { body: {} })).statusCode).toBe(403)
    expect((await llama('GET', 'registro')).statusCode).toBe(200)
  })
})
