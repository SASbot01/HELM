// El agente de Documentación (api/_lib/departamentos/documentacion.js): según
// los plazos fiscales de los próximos 15 días y lo que falta por entregar,
// propone un recordatorio por cliente con su enlace de subida (/d/<token>).
// Supabase simulado; tokenDe de api/documentos.js mockeado (no firmamos JWT).
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../api/documentos.js', () => ({ tokenDe: async (c, k) => `tok_${c}_${k}` }))

const documentacion = (await import('../api/_lib/departamentos/documentacion.js')).default

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
      in(c, vs) { filtros.push(r => vs.includes(r[c])); return q },
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

const HOY = new Date('2026-10-28T10:00:00Z')   // Madrid: 28-oct-2026

function escenario({ obligaciones, contactos } = {}) {
  const tablas = {
    helm_fiscal_obligaciones: obligaciones || [
      // Dentro de 15 días y esperando papeles: entra (contacto A, dos modelos misma fecha).
      { id: 'o1', client_id: 'c1', contact_id: 'A', modelo: '303', periodo: '2026T3', fecha_limite: '2026-11-05', estado: 'pendiente_docs' },
      { id: 'o2', client_id: 'c1', contact_id: 'A', modelo: '130', periodo: '2026T3', fecha_limite: '2026-11-05', estado: 'pendiente_docs' },
      // Ya en proceso (papeles entregados): no se recuerda.
      { id: 'o3', client_id: 'c1', contact_id: 'B', modelo: '111', periodo: '2026T3', fecha_limite: '2026-11-04', estado: 'en_proceso' },
      // Esperando papeles pero más allá de 15 días: aún no.
      { id: 'o4', client_id: 'c1', contact_id: 'B', modelo: '349', periodo: '2026T3', fecha_limite: '2026-12-01', estado: 'pendiente_docs' },
      // Otro cliente que sí entra.
      { id: 'o5', client_id: 'c1', contact_id: 'B', modelo: '303', periodo: '2026T3', fecha_limite: '2026-11-10', estado: 'pendiente_docs' },
    ],
    crm_contacts: contactos || [
      { id: 'A', client_id: 'c1', name: 'María Gómez', phone: '600222333' },
      { id: 'B', client_id: 'c1', name: 'Taller López SL', phone: '600444555' },
    ],
  }
  const proponer = mkProponer()
  const ctx = {
    supabase: mkSupabase(tablas), clientId: 'c1',
    perfil: { id: 'c1', slug: 'asesoria', name: 'Asesoría Suiza' },
    agenciaId: 'casa', hoy: HOY, config: {}, autonomia: 'proponer', proponer, avisar: async () => {}, log: () => {},
  }
  return { tablas, ctx, proponer }
}

describe('documentacion · plazos próximos y papeles que faltan', () => {
  let esc
  beforeEach(() => { esc = escenario() })

  it('un recordatorio por cliente, agrupando sus modelos, con el enlace de subida y el WhatsApp', async () => {
    const r = await documentacion.corre(esc.ctx)
    expect(r.propuestas).toBe(2)   // A (303+130) y B (303); no la de en_proceso ni la de >15 días
    const a = esc.proponer.creadas.find(p => p.clave.startsWith('documentacion:A:'))
    expect(a.clave).toBe('documentacion:A:2026-11-05')
    expect(a.telefono).toBe('600222333')
    expect(a.mensaje).toContain('modelo 303 (2026T3)')
    expect(a.mensaje).toContain('modelo 130 (2026T3)')
    expect(a.mensaje).toContain('05/11/2026')
    expect(a.mensaje).toContain('/d/tok_c1_A')     // enlace del portal, por contacto
    const b = esc.proponer.creadas.find(p => p.clave.startsWith('documentacion:B:'))
    expect(b.mensaje).toContain('modelo 303')
    expect(b.mensaje).not.toContain('349')         // la de >15 días no entra
  })

  it('no duplica: a la segunda pasada no propone nada nuevo', async () => {
    await documentacion.corre(esc.ctx)
    const r2 = await documentacion.corre(esc.ctx)
    expect(r2.propuestas).toBe(0)
  })

  it('si el perfil no lleva Fiscal (sin vencimientos), no hace nada', async () => {
    const e = escenario({ obligaciones: [] })
    expect(await documentacion.corre(e.ctx)).toEqual({ propuestas: 0, resumen: '' })
  })
})
