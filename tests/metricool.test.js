// Metricool (api/_lib/metricool.js): solo GET, métricas diarias de anuncios,
// configuración por perfil sin dejar el token en el código, y upsert que no
// duplica. El fetch y Supabase van simulados.
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  _http, normaliza, sinDoble, resumenDe, gastoDeAnuncio, comoInsight, configDe,
  sincronizaPerfil, recortaRango, BASE,
} from '../api/_lib/metricool.js'

// El cruce con el CRM importa el media buyer, y ese archivo abre el cliente de
// Supabase al cargarse. No se usa (el test le pasa su propia base), pero la URL
// tiene que existir para que el módulo cargue.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key'

afterEach(() => {
  _http.fetch = (url, opts) => globalThis.fetch(url, opts)
  vi.unstubAllEnvs()
})

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body == null ? '' : JSON.stringify(body)),
})

function memoria(tablas) {
  class Q {
    constructor(t) { Object.assign(this, { t, f: [], op: 'select', on: ['id'], uno: null, lim: null }) }
    select() { return this }
    eq(c, v) { this.f.push(r => r[c] === v || (r[c] != null && String(r[c]) === String(v))); return this }
    gte(c, v) { this.f.push(r => String(r[c]) >= String(v)); return this }
    lt(c, v) { this.f.push(r => String(r[c]) < String(v)); return this }
    in(c, v) { const s = v.map(String); this.f.push(r => s.includes(String(r[c]))); return this }
    order() { return this }
    limit(n) { this.lim = n; return this }
    range(a, b) { this.desde = a; this.lim = b - a + 1; return this }
    upsert(d, o = {}) { this.op = 'upsert'; this.d = d; this.on = (o.onConflict || 'id').split(',').map(s => s.trim()); return this }
    maybeSingle() { this.uno = 'm'; return this.run() }
    then(a, b) { return this.run().then(a, b) }
    async run() {
      const t = (tablas[this.t] ||= [])
      const pasa = r => this.f.every(f => f(r))
      if (this.op === 'upsert') {
        const data = []
        for (const r of (Array.isArray(this.d) ? this.d : [this.d])) {
          let ya = t.find(x => this.on.every(k => String(x[k] ?? '') === String(r[k] ?? '')))
          if (ya) Object.assign(ya, structuredClone(r))
          else { ya = structuredClone(r); t.push(ya) }
          data.push(ya)
        }
        return { data, error: null }
      }
      let data = t.filter(pasa)
      if (this.lim != null) data = data.slice(this.desde || 0, (this.desde || 0) + this.lim)
      if (this.uno === 'm') return { data: data[0] ?? null, error: null }
      return { data, error: null }
    }
  }
  return { from: (t) => new Q(t) }
}

describe('normaliza', () => {
  it('parte por día las métricas anidadas de un anuncio de Data Studio', () => {
    const filas = normaliza([{
      provider: 'facebook', campaignId: '111', campaignName: 'Cap',
      adGroupId: '222', adgroupName: 'Cj', adId: '333', adName: 'Hook', currency: 'EUR',
      metrics: {
        impressions: { '20261026': 500, '20261027': 1000 },
        spent: { '20261026': 6, '20261027': 12.5 },
        clicks: { '20261027': 20, '20261026': 10 },
        conversions: { '20261027': 3 },
      },
    }], { red: 'meta', nivel: 'ad' })
    expect(filas).toHaveLength(2)
    const dia = filas.find(f => f.dia === '2026-10-27')
    expect(dia).toMatchObject({
      red: 'meta', nivel: 'ad', campaign_id: '111', adset_id: '222', ad_id: '333',
      ad_nombre: 'Hook', gasto: 12.5, impresiones: 1000, clics: 20, conversiones: 3, ctr: 2, moneda: 'EUR',
    })
    expect(filas.find(f => f.dia === '2026-10-26')).toMatchObject({ gasto: 6, clics: 10, cpm: 12, cpc: 0.6 })
  })

  it('acepta el día como clave exterior y el envoltorio { data } de campaña', () => {
    const filas = normaliza({
      data: [{ network: 'tiktok', providerCampaignId: '9', name: 'TT', metrics: { '2026-10-27': { impressions: 10, spend: 1, clicks: 2, conversions: 1 } } }],
    }, { red: 'tiktok', nivel: 'campana' })
    expect(filas).toEqual([expect.objectContaining({ red: 'tiktok', nivel: 'campana', dia: '2026-10-27', campaign_id: '9', campaign_nombre: 'TT', gasto: 1, impresiones: 10, clics: 2, conversiones: 1 })])
  })

  it('lee una campaña de Meta con la fecha YYYYMMDD y no guarda una creatividad sin cifras', () => {
    const filas = normaliza([
      { provider: 'facebook', providerCampaignId: '111', name: 'Cap', date: 20261027, impressions: 1000, clicks: 20, spent: 12.5, ctr: 2, reach: 800, conversions: 3, currency: 'EUR' },
      { name: 'Solo el texto', titles: ['Hola'] },
    ], { red: 'meta', nivel: 'campana' })
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ nivel: 'campana', dia: '2026-10-27', campaign_id: '111', campaign_nombre: 'Cap', alcance: 800, ad_id: '' })
  })
})

describe('gasto y resumen', () => {
  const filas = [
    { dia: '2026-10-21', red: 'meta', ad_id: 'ad-1', campaign_id: 'c1', adset_id: 's1', gasto: 30, impresiones: 100, clics: 4, leads: 1, conversiones: 0, leads_crm: 1, ventas_crm: 0, cobrado_crm: 0 },
    { dia: '2026-10-22', red: 'meta', ad_id: 'ad-1', campaign_id: 'c1', adset_id: 's1', gasto: 50, impresiones: 100, clics: 4, leads: 1, conversiones: 0, leads_crm: 0, ventas_crm: 1, cobrado_crm: 80 },
    { dia: '2026-10-21', red: 'meta', ad_id: '', campaign_id: 'c1', adset_id: '', gasto: 999, impresiones: 1, clics: 0, leads: 0, conversiones: 0, leads_crm: 0, ventas_crm: 0, cobrado_crm: 0 },
    { dia: '2026-10-21', red: 'google', ad_id: '', campaign_id: 'g1', adset_id: '', gasto: 10, impresiones: 40, clics: 2, leads: 0, conversiones: 1, leads_crm: 0, ventas_crm: 0, cobrado_crm: 0 },
    { dia: '2026-10-30', red: 'meta', ad_id: 'ad-1', campaign_id: 'c1', adset_id: '', gasto: 500, impresiones: 1, clics: 0, leads: 0, conversiones: 0, leads_crm: 0, ventas_crm: 0, cobrado_crm: 0 },
  ]

  it('no suma la campaña el día en que ya están sus anuncios', () => {
    expect(sinDoble(filas).some(f => f.gasto === 999)).toBe(false)
    expect(resumenDe(filas).gasto).toBe(590)
    expect(resumenDe(filas).por_red.google.gasto).toBe(10)
    expect(resumenDe(filas).cobrado_crm).toBe(80)
  })

  it('el gasto del test casa el utm con el anuncio, dentro de los 5 días', () => {
    const ad = { utm: 'ad-1', publicado_en: '2026-10-20' }
    expect(gastoDeAnuncio(ad, filas)).toBe(80)
    expect(gastoDeAnuncio({ utm: 'g1', publicado_en: '2026-10-20' }, filas)).toBe(10)
    expect(gastoDeAnuncio({ utm: 'nadie', publicado_en: '2026-10-20' }, filas)).toBeNull()
  })

  it('comoInsight deja la forma que ya juzga el media buyer', () => {
    expect(comoInsight(filas[0])).toMatchObject({ ad_id: 'ad-1', gasto: 30, clics_enlace: 4, leads_meta: 1, frecuencia: null })
  })
})

describe('configDe', () => {
  const tablas = {}
  const db = memoria(tablas)

  afterEach(() => { for (const k of Object.keys(tablas)) delete tablas[k] })

  it('la ficha del perfil manda sobre el entorno', async () => {
    vi.stubEnv('METRICOOL_USER_TOKEN', 'token-del-entorno')
    vi.stubEnv('METRICOOL_USER_ID', '11')
    tablas.user_integrations = [{ client_id: 'c1', service: 'metricool', enabled: true, member_id: null, config: { blog_id: '555', user_id: '42', user_token: 'token-del-perfil' } }]
    const cfg = await configDe(db, 'c1', { slug: 'silvestre' })
    expect(cfg).toMatchObject({ token: 'token-del-perfil', userId: '42', blogId: '555', origenToken: 'perfil', origenBlog: 'perfil' })
  })

  it('sin ficha, el token del entorno y el blog del mapa por slug', async () => {
    vi.stubEnv('METRICOOL_USER_TOKEN', 'token-entorno-1')
    vi.stubEnv('METRICOOL_USER_ID', '99')
    vi.stubEnv('METRICOOL_BRANDS', JSON.stringify({ silvestre: '999' }))
    tablas.clients = [{ id: 'c1', slug: 'silvestre', agencia_id: null }]
    const cfg = await configDe(db, 'c1')
    expect(cfg).toMatchObject({ token: 'token-entorno-1', userId: '99', blogId: '999', origenToken: 'entorno', origenBlog: 'entorno' })
  })

  it('el token puede vivir en la agencia si el perfil solo tiene el blog', async () => {
    tablas.user_integrations = [{ client_id: 'c1', service: 'metricool', enabled: true, member_id: null, config: { blog_id: '321' } }]
    tablas.clients = [{ id: 'c1', slug: 'silvestre', agencia_id: 'ag1' }]
    tablas.agencias = [{ id: 'ag1', metricool: { user_id: '1234567', user_token: 'token-agencia' } }]
    const cfg = await configDe(db, 'c1')
    expect(cfg).toMatchObject({ token: 'token-agencia', userId: '1234567', blogId: '321', origenToken: 'agencia' })
  })

  it('enabled=false apaga el perfil aunque el entorno esté lleno', async () => {
    vi.stubEnv('METRICOOL_USER_TOKEN', 'token-entorno-1')
    vi.stubEnv('METRICOOL_USER_ID', '99')
    vi.stubEnv('METRICOOL_BRANDS', JSON.stringify({ silvestre: '999' }))
    tablas.user_integrations = [{ client_id: 'c1', service: 'metricool', enabled: false, member_id: null, config: { blog_id: '555' } }]
    expect(await configDe(db, 'c1', { slug: 'silvestre' })).toBeNull()
  })

  it('sin token o sin blog, no hay configuración', async () => {
    expect(await configDe(db, 'c1', { slug: 'silvestre' })).toBeNull()
  })
})

describe('sincronizaPerfil', () => {
  const cfg = { token: 'token-de-prueba', userId: '42', blogId: '555' }

  it('solo hace GET, el token va en la cabecera y el upsert no duplica', async () => {
    const tablas = {
      crm_contacts: [{ id: 'c1', client_id: 'p1', utm_content: '333', created_at: '2026-10-27T10:00:00Z' }],
      sales: [{ id: 'v1', client_id: 'p1', contact_id: 'c1', utm_content: '333', cash_collected: 40, status: 'won', date: '2026-10-28', created_at: '2026-10-28T10:00:00Z' }],
    }
    const llamadas = []
    _http.fetch = async (url, opts) => {
      llamadas.push({ url: String(url), method: opts.method, auth: opts.headers['X-Mc-Auth'] })
      const u = String(url)
      expect(u.startsWith(BASE)).toBe(true)
      expect(u).not.toContain('token-de-prueba')
      expect(u).toContain('userId=42')
      expect(u).toContain('blogId=555')
      if (u.includes('/datastudio/fbads/ads')) {
        return json(200, [{
          provider: 'facebook', campaignId: '111', campaignName: 'Cap', adGroupId: '222', adId: '333', adName: 'Hook',
          metrics: {
            impressions: { '20261026': 500, '20261027': 1000 },
            spent: { '20261026': 6, '20261027': 12.5 },
            clicks: { '20261027': 20, '20261026': 10 },
            conversions: { '20261027': 3 },
          },
        }])
      }
      return json(404, {})
    }
    const db = memoria(tablas)
    const r = await sincronizaPerfil({ db, clientId: 'p1', desde: '2026-10-26', hasta: '2026-10-27', cfg })
    expect(llamadas.length).toBeGreaterThan(0)
    expect(llamadas.every(l => l.method === 'GET' && l.auth === 'token-de-prueba')).toBe(true)
    expect(r.filas).toHaveLength(2)
    expect(r.avisos.filter(a => /CRM/.test(a))).toEqual([])
    const dia = tablas.helm_metricool_ads.find(f => f.dia === '2026-10-27')
    expect(dia).toMatchObject({ client_id: 'p1', blog_id: '555', ad_id: '333', gasto: 12.5, leads_crm: 1, ventas_crm: 1, cobrado_crm: 40 })
    await sincronizaPerfil({ db, clientId: 'p1', desde: '2026-10-26', hasta: '2026-10-27', cfg })
    expect(tablas.helm_metricool_ads).toHaveLength(2)
  })

  it('un 401 no guarda nada', async () => {
    const tablas = {}
    _http.fetch = async () => json(401, { message: 'no' })
    await expect(sincronizaPerfil({ db: memoria(tablas), clientId: 'p1', desde: '2026-10-27', hasta: '2026-10-27', cfg })).rejects.toThrow(/X-Mc-Auth/)
    expect(tablas.helm_metricool_ads || []).toHaveLength(0)
  })

  it('si el rango no trae días, pide día a día y no multiplica un total repetido', async () => {
    const tablas = {}
    const diasPedidos = []
    _http.fetch = async (url) => {
      const u = String(url)
      if (!u.includes('/stats/adwords/campaigns')) return json(404, {})
      const start = new URL(u).searchParams.get('start')
      const end = new URL(u).searchParams.get('end')
      diasPedidos.push(`${start}-${end}`)
      if (start !== end) return json(200, [{ provider: 'adwords', providerCampaignId: 'g1', name: 'Search', impressions: 10, clicks: 1, spent: 4 }])
      return json(200, [{ provider: 'adwords', providerCampaignId: 'g1', name: 'Search', impressions: 10, clicks: 1, spent: 4 }])
    }
    const r = await sincronizaPerfil({ db: memoria(tablas), clientId: 'p1', desde: '2026-10-25', hasta: '2026-10-27', cfg })
    expect(diasPedidos[0]).toBe('20261025-20261027')
    expect(diasPedidos).toContain('20261025-20261025')
    expect(r.avisos.join(' ')).toMatch(/repite el mismo total/)
    expect(tablas.helm_metricool_ads).toHaveLength(1)
    expect(tablas.helm_metricool_ads[0]).toMatchObject({ dia: '2026-10-27', red: 'google', campaign_id: 'g1', gasto: 4, nivel: 'campana' })
  })
})

describe('recorte y conector', () => {
  it('un rango largo se queda en los últimos 31 días', () => {
    const r = recortaRango('2026-01-01', '2026-10-27')
    expect(r.desde).toBe('2026-09-27')
    expect(r.hasta).toBe('2026-10-27')
    expect(r.avisos[0]).toMatch(/31 días/)
  })

  it('anuncios está en el conector del perfil, es de solo lectura y va por páginas', async () => {
    const { DEL_CLIENTE, ESCRIBEN, herramientasDe } = await import('../api/mcp/[token].js')
    expect(DEL_CLIENTE).toContain('anuncios')
    expect(ESCRIBEN).not.toContain('anuncios')
    const t = herramientasDe({ clientId: 'c', slug: 's', nombre: 'S' }).find(x => x.name === 'anuncios')
    expect(t.inputSchema.properties.cursor).toBeTruthy()
    expect(t.inputSchema.properties.perfil).toBeTruthy()
    expect(t.inputSchema.properties.red.enum).toEqual(['meta', 'tiktok', 'google'])
    expect(t.description).toMatch(/hay_mas/)
    expect(t.description).toMatch(/solo lectura/)
  })
})
