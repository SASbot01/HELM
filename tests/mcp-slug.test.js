// El MCP y el slug de un perfil: con el enlace de su perfil (o de su agencia)
// se lee y se escribe en SU perfil. Antes, un perfil con slug
// `DETRAS-DE-CAMRA` (mayúsculas: la pasarela no lo validaba) se resolvía en
// minúsculas al perfil de otra agencia y leía sus creadores, incluido el
// «Propio» con las transcripciones de sus vídeos. Sin red ni base.
import { describe, it, expect, vi } from 'vitest'

process.env.HELM_MCP_TOKEN = ''

const CLIENTES = [
  { id: 'p-real', slug: 'detras-de-camra', name: 'Detrás de Cámara', agencia_id: 'ag-alex', active: true },
  { id: 'p-falso', slug: 'DETRAS-DE-CAMRA', name: 'Mi perfil', agencia_id: 'ag-alumno', active: true },
]
const IDENTIDADES = [
  { id: 'i-real', nombre: 'Propio DDC', slug: 'propio-ddc', categoria: 'Propio', descripcion: '', activa: true },
  { id: 'i-suyo', nombre: 'Referente', slug: 'referente', categoria: 'Filmmaking', descripcion: '', activa: true },
  // Un creador del alumno que se llama como el slug del «Propio» ajeno.
  { id: 'i-trampa', nombre: 'propio-ddc', slug: 'trampa', categoria: 'Filmmaking', descripcion: '', activa: true },
]
const ASIGNADOS = { 'p-real': ['i-real'], 'p-falso': ['i-suyo', 'i-trampa'] }
const leidas = []

const cumple = (fila, f) => Object.entries(f).every(([c, v]) => Array.isArray(v) ? v.includes(fila[c]) : fila[c] === v)
function consulta(tabla) {
  const q = {
    filtros: {},
    select() { return q }, order() { return q }, limit() { return q }, neq() { return q }, is() { return q }, update() { return q },
    eq(c, v) { q.filtros[c] = v; return q },
    in(c, v) { q.filtros[c] = v; return q },
    maybeSingle() {
      if (tabla === 'agencias') return Promise.resolve({ data: { nombre: q.filtros.id }, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then(ok, ko) {
      let data = []
      if (tabla === 'clients') data = CLIENTES.filter(c => cumple(c, q.filtros))
      else if (tabla === 'agent_identity_clients') {
        data = (ASIGNADOS[q.filtros.client_id] || []).map(id => ({ agent_identities: IDENTIDADES.find(i => i.id === id) }))
      } else if (tabla === 'agent_identities') data = IDENTIDADES
      else if (tabla === 'agent_reels') { if (q.filtros.identity_id) leidas.push(q.filtros.identity_id) }
      return Promise.resolve({ data, error: null }).then(ok, ko)
    },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))

const { alcanceDesdeContexto, ejecutaHerramienta } = await import('../api/mcp/[token].js')

describe('MCP · el perfil es el suyo aunque su slug choque en minúsculas con otro', () => {
  it('«identidades» da los creadores de SU perfil', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-alumno' })
    const x = await ejecutaHerramienta('identidades', {}, alc)
    expect(x.ok).toBe(true)
    const nombres = Object.values(JSON.parse(x.texto).por_tipo_de_contenido).flat().map(i => i.slug).sort()
    expect(nombres).toEqual(['referente', 'trampa'])
  })

  it('«corpus» por nombre resuelve a SU creador, no al «Propio» ajeno que tiene ese slug', async () => {
    leidas.length = 0
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-alumno' })
    await ejecutaHerramienta('corpus', { identidad: 'propio-ddc' }, alc)
    expect(leidas).not.toContain('i-real')
    expect(leidas).toContain('i-trampa')
  })

  it('«corpus» sin creador lee los del perfil suyo', async () => {
    leidas.length = 0
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-alumno' })
    await ejecutaHerramienta('corpus', {}, alc)
    expect(leidas).not.toContain('i-real')
  })
})
