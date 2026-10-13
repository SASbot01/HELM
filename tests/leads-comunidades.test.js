// El alta de las comunidades en el CRM (api/leads.js · miembro y nota): cada
// comunidad escribe en SU perfil, que sale de la lista cerrada; AI para todo
// sigue como estaba; y lo que manda el navegador no puede llevar a otro CRM.
// Sin red ni base: Supabase va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-leads-0123456789'

const ops = []
function consulta(tabla) {
  const q = {
    tabla, filtros: [], fila: null,
    select() { return q },
    eq(c, v) { q.filtros.push([c, v]); return q },
    ilike(c, v) { q.filtros.push([c, v]); return q },
    limit() { return q },
    insert(fila) { q.fila = fila; ops.push({ op: 'insert', tabla, fila }); return q },
    update(cambios) { ops.push({ op: 'update', tabla, cambios }); return q },
    single() { return Promise.resolve({ data: { id: 'contacto-nuevo' }, error: null }) },
    maybeSingle() {
      const v = Object.fromEntries(q.filtros)
      if (tabla === 'clients') return Promise.resolve({ data: { id: `id-de-${v.slug}`, active: true }, error: null })
      if (tabla === 'crm_pipelines') return Promise.resolve({ data: { id: `${v.client_id}/${v.name}`, stages: [{ key: 'lead_nuevo' }] }, error: null })
      if (tabla === 'crm_contacts') return Promise.resolve({ data: q.contacto ?? null, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then(ok) { return Promise.resolve({ data: [], error: null }).then(ok) },
  }
  ops.push({ op: 'from', tabla, q })
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))

const { default: leads } = await import('../api/leads.js')
const { signJwt } = await import('../api/_lib/auth.js')

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader() {},
  }
}
let ip = 0
const pide = async (action, body) => {
  const res = respuesta()
  // Una IP distinta por petición: el límite por IP no entra en estas pruebas.
  await leads({ method: 'POST', query: { action }, body, headers: { 'x-forwarded-for': `10.0.0.${++ip}` }, socket: {} }, res)
  return res
}
const altas = () => ops.filter(o => o.op === 'insert' && o.tabla === 'crm_contacts').map(o => o.fila)
const perfiles = () => ops.filter(o => o.op === 'from' && o.tabla === 'clients').map(o => Object.fromEntries(o.q.filtros).slug)

beforeEach(() => { ops.length = 0 })

describe('miembro', () => {
  it('Filmmaking para todo da de alta en detras-de-camra, con sus opciones', async () => {
    const r = await pide('miembro', {
      comunidad: 'filmmakingparatodo', nombre: 'Ana', email: 'ana@example.com', profesion: 'bodas', ingresos: 'de_500_a_1500',
      pipeline: 'Página de inicio', nota: 'entró por recursos/x', origen: { utm_source: 'reel' },
      // Lo que no debe servir para nada:
      perfil: 'silvestre', client_id: 'otro', clientId: 'otro',
    })
    expect(r.statusCode).toBe(200)
    expect(perfiles()).toEqual(['detras-de-camra'])
    const [fila] = altas()
    expect(fila.client_id).toBe('id-de-detras-de-camra')
    expect(fila.pipeline_id).toBe('id-de-detras-de-camra/Página de inicio')
    expect(fila.source).toBe('Filmmaking para todo')
    expect(fila.utm_source).toBe('reel')
    expect(fila.custom_fields.filmmakingparatodo).toMatchObject({ profesion: 'Videógrafo de bodas', ingresos: 'de_500_a_1500' })
    expect(fila.notes).toBe('Filmmaking para todo · entró por recursos/x · profesión: Videógrafo de bodas · ingresos: De 500 a 1.500 €/mes')
  })

  it('sin comunidad, AI para todo en silvestre, como siempre', async () => {
    const r = await pide('miembro', { nombre: 'Luis', email: 'luis@example.com', profesion: 'editor', ingresos: 'mas_1000', pipeline: 'Lead magnet', nota: 'pidió la guía' })
    expect(r.statusCode).toBe(200)
    expect(perfiles()).toEqual(['silvestre'])
    const [fila] = altas()
    expect(fila).toMatchObject({
      client_id: 'id-de-silvestre', source: 'AI para todo', utm_source: 'aiparatodo', utm_medium: 'comunidad',
      pipeline_id: 'id-de-silvestre/Lead magnet', notes: 'AI para todo · pidió la guía · profesión: editor · ingresos: Más de 1.000 €/mes',
    })
    expect(fila.custom_fields.aiparatodo).toMatchObject({ profesion: 'editor', ingresos: 'mas_1000' })
  })

  it('cada comunidad solo acepta lo suyo', async () => {
    const casos = [
      [{ comunidad: 'otra' }, 'Comunidad desconocida'],
      [{ comunidad: '__proto__' }, 'Comunidad desconocida'],
      [{ comunidad: 'filmmakingparatodo', ingresos: 'mas_1000', profesion: 'bodas' }, 'Elige tus ingresos'],
      [{ comunidad: 'filmmakingparatodo', ingresos: 'mas_3000', profesion: 'astronauta' }, 'Elige a qué te dedicas'],
      [{ comunidad: 'filmmakingparatodo', ingresos: 'mas_3000', profesion: 'constructor' }, 'Elige a qué te dedicas'],
      [{ comunidad: 'aiparatodo', ingresos: 'menos_500', profesion: 'x' }, 'Elige tus ingresos'],
    ]
    for (const [extra, error] of casos) {
      const r = await pide('miembro', { nombre: 'X', email: 'x@example.com', ingresos: 'mas_1000', profesion: 'x', ...extra })
      expect(r.statusCode, JSON.stringify(extra)).toBe(400)
      expect(r.body.error).toBe(error)
    }
    expect(altas()).toHaveLength(0)
  })
})

describe('nota', () => {
  it('una ficha de una comunidad no vale en otro perfil', async () => {
    const ficha = await signJwt({ kind: 'lead', clientId: 'id-de-silvestre', sub: 'c1' })
    const r = await pide('nota', { comunidad: 'filmmakingparatodo', id: ficha, texto: 'AI para todo · descargó la guía Los Mods de Claude (PDF)' })
    expect(r.statusCode).toBe(400)   // esa línea no es de Filmmaking para todo
  })

  it('las líneas de silvestre siguen valiendo sin comunidad, y nada heredado cuenta como línea', async () => {
    const ficha = await signJwt({ kind: 'lead', clientId: 'id-de-silvestre', sub: 'c1' })
    expect((await pide('nota', { id: ficha, texto: '__proto__' })).statusCode).toBe(400)
    expect((await pide('nota', { id: ficha, texto: 'constructor' })).statusCode).toBe(400)
    const ok = await pide('nota', { id: ficha, texto: 'AI para todo · descargó la guía Los Mods de Claude (PDF)' })
    expect(ok.statusCode).not.toBe(400)
    expect(perfiles()).toContain('silvestre')
  })
})
