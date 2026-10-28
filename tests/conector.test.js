// El conector reutilizable (api/mcp/[token].js): que una herramienta con
// alcance de agencia dé EXACTAMENTE lo mismo venga por el token (el handler
// MCP de siempre) o por alcanceDesdeContexto (lo que usará el bot de Telegram).
// Así se garantiza que el bot no ve ni más ni menos que el conector. Sin red ni
// base: Supabase va simulado, y aplica los filtros eq/in como la base de verdad.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.HELM_MCP_TOKEN = ''   // sin token maestro: así el de prueba es de agencia

// Todos los perfiles de HELM: los dos activos de la agencia, uno dormido de la
// misma agencia y uno de otra. El alcance solo puede ver los dos primeros.
const CLIENTES = [
  { id: 'p1', slug: 'detras-de-camra', name: 'Detrás de Cámara', agencia_id: 'ag-1', active: true },
  { id: 'p2', slug: 'enformaconhugo', name: 'En Forma con Hugo', agencia_id: 'ag-1', active: true },
  { id: 'p3', slug: 'dormido', name: 'Dormido', agencia_id: 'ag-1', active: false },
  { id: 'p4', slug: 'ajeno', name: 'Ajeno', agencia_id: 'ag-2', active: true },
]
const CREADORES = {
  p1: [{ id: 'i1', nombre: 'Samzia', slug: 'samzia' }],
  p2: [{ id: 'i2', nombre: 'Propio Hugo', slug: 'propio-hugo' }],
}

// Lo que ha pasado por la base: cada consulta (tabla y filtros) y cada insert.
const consultas = []
const inserts = []

const cumple = (fila, filtros) => Object.entries(filtros).every(([c, v]) => Array.isArray(v) ? v.includes(fila[c]) : fila[c] === v)

function consulta(tabla) {
  const q = {
    tabla, filtros: {}, fila: null,
    select() { return q },
    eq(c, v) { q.filtros[c] = v; return q },
    in(c, v) { q.filtros[c] = v; return q },
    order() { return q },
    update() { return q },
    insert(fila) { q.fila = fila; inserts.push({ tabla, fila }); return q },
    single() {
      return Promise.resolve({ data: { id: `${tabla}-nuevo`, date: q.fila?.date, title: q.fila?.title }, error: null })
    },
    maybeSingle() {
      consultas.push({ tabla, filtros: { ...q.filtros } })
      if (tabla === 'agent_mcp_tokens') {
        return Promise.resolve({ data: { client_id: null, agencia_id: 'ag-1', clients: null, agencias: { nombre: 'Silvestre AI' } }, error: null })
      }
      if (tabla === 'agencias') return Promise.resolve({ data: q.filtros.id === 'ag-1' ? { nombre: 'Silvestre AI' } : null, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then(ok, ko) {
      consultas.push({ tabla, filtros: { ...q.filtros } })
      let data = []
      if (q.fila) return Promise.resolve({ data: null, error: null }).then(ok, ko)
      if (tabla === 'clients') {
        data = CLIENTES.filter(c => cumple(c, q.filtros)).map(({ id, slug, name }) => ({ id, slug, name }))
      } else if (tabla === 'agent_identity_clients') {
        data = (CREADORES[q.filtros.client_id] || []).map(i => ({ agent_identities: i }))
      }
      return Promise.resolve({ data, error: null }).then(ok, ko)
    },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))

const { default: handler, alcanceDesdeContexto, ejecutaHerramienta, herramientasDe, DEL_CLIENTE, ESCRIBEN } = await import('../api/mcp/[token].js')
const { enContexto, contexto } = await import('../api/_lib/contexto.js')

beforeEach(() => { consultas.length = 0; inserts.length = 0 })

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader() { return this },
  }
}

// La respuesta JSON-RPC del handler MCP para una llamada, con un token de agencia.
async function rpc(nombre, args = {}) {
  const res = respuesta()
  await handler({
    method: 'POST',
    query: { token: `tok-${nombre}`.padEnd(48, 'x') },   // >= 32 caracteres → alcance de agencia
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nombre, arguments: args } },
    headers: { 'x-forwarded-for': '10.0.0.1' }, socket: {},
  }, res)
  expect(res.statusCode).toBe(200)
  return res.body
}
const porToken = async (nombre, args) => (await rpc(nombre, args)).result.content[0].text

// Un guion válido para programar_guiones.
const GUIONES = [{ fecha: '2026-10-19', titulo: 'Tres errores al entrenar', tipo: 'viralidad', guion: 'Si entrenas así, para.' }]

describe('paridad del conector: token de agencia vs contexto', () => {
  it('"perfiles" da el mismo texto por token y por contexto', async () => {
    const textoToken = await porToken('perfiles')
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' }, { origen: 'telegram', quien: 'Álex' })
    const x = await ejecutaHerramienta('perfiles', {}, alc)

    expect(x.ok).toBe(true)
    expect(x.texto).toBe(textoToken)
    const datos = JSON.parse(x.texto)
    expect(datos.perfiles).toHaveLength(2)
    expect(datos.perfiles[0]).toEqual({ perfil: 'detras-de-camra', nombre: 'Detrás de Cámara', creadores: ['Samzia'] })
  })

  it('un error (sin decir el perfil) también es idéntico por token y por contexto', async () => {
    // "identidades" necesita perfil y la agencia tiene dos: el mismo error en ambos.
    const textoToken = await porToken('identidades')
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' })
    const x = await ejecutaHerramienta('identidades', {}, alc)

    expect(x.ok).toBe(false)
    expect(x.texto).toBe(textoToken)
    expect(x.texto).toContain('Di para qué perfil')
  })

  it('alcanceDesdeContexto tiene la misma forma que da un token de agencia, solo con los perfiles activos de la agencia', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' }, { quien: 'Álex' })
    expect(alc).toMatchObject({ agenciaId: 'ag-1', nombre: 'Silvestre AI', origen: 'telegram', quien: 'Álex' })
    expect(alc.perfiles).toEqual([
      { id: 'p1', slug: 'detras-de-camra', name: 'Detrás de Cámara' },
      { id: 'p2', slug: 'enformaconhugo', name: 'En Forma con Hugo' },
    ])
    // La consulta a clients llevó los dos filtros: los de la agencia y activos.
    expect(consultas.find(c => c.tabla === 'clients').filtros).toEqual({ agencia_id: 'ag-1', active: true })
    // Sin agencia, o con una que no existe, no hay alcance.
    expect(await alcanceDesdeContexto({})).toBeNull()
    expect(await alcanceDesdeContexto({ agenciaId: 'ag-nada' })).toBeNull()
  })

  it('un perfil de otra agencia o dormido no se puede usar aunque se pida por su nombre', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' })
    for (const perfil of ['ajeno', 'dormido']) {
      const x = await ejecutaHerramienta('calendario', { perfil }, alc)
      expect(x.ok).toBe(false)
      expect(x.texto).toContain('Di para qué perfil')
    }
  })

  it('herramientasDe en agencia enseña solo las del cliente', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' })
    const nombres = herramientasDe(alc).map(t => t.name)
    expect(nombres).toEqual(DEL_CLIENTE)
    expect(nombres).not.toContain('anadir_reels')
  })

  it('una herramienta desconocida es "desconocida", no un error de la herramienta', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' })
    const r = await ejecutaHerramienta('inventada', {}, alc)
    expect(r.desconocida).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.texto).toContain('Herramienta desconocida')
  })

  it('por el handler MCP, una herramienta desconocida sigue siendo el error JSON-RPC -32602', async () => {
    const body = await rpc('inventada')
    expect(body.result).toBeUndefined()
    expect(body.error.code).toBe(-32602)
    expect(body.error.message).toContain('Herramienta desconocida')
  })
})

describe('escrituras por contexto', () => {
  it('una escritura queda en el registro del perfil con origen telegram y quién la pidió', async () => {
    expect(ESCRIBEN).toContain('programar_guiones')
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' }, { origen: 'telegram', quien: 'Telegram de Álex' })
    const x = await ejecutaHerramienta('programar_guiones', { perfil: 'enformaconhugo', guiones: GUIONES }, alc)

    expect(x.ok).toBe(true)
    expect(x.ensayo).toBe(false)
    expect(x.resultado.programados).toHaveLength(1)
    // El guion, en el calendario de ese perfil.
    const guion = inserts.find(i => i.tabla === 'helm_content_calendar')
    expect(guion.fila).toMatchObject({ client_id: 'p2', date: '2026-10-19', title: 'Tres errores al entrenar' })
    // Y el registro, a nombre del perfil, con origen y quién.
    const reg = inserts.find(i => i.tabla === 'agent_ejecuciones')
    expect(reg.fila).toMatchObject({ client_id: 'p2', agente: 'conector', origen: 'telegram', estado: 'hecho' })
    expect(reg.fila.encargo).toContain('programar_guiones (Telegram de Álex)')
  })

  it('un ensayo (prueba=true) no escribe nada, ni en el registro', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' }, { origen: 'telegram', quien: 'Telegram de Álex' })
    const x = await ejecutaHerramienta('programar_guiones', { perfil: 'enformaconhugo', guiones: GUIONES, prueba: true }, alc)

    expect(x.ok).toBe(true)
    expect(x.ensayo).toBe(true)
    expect(x.resultado.prueba).toBe(true)
    expect(inserts).toEqual([])
  })

  it('el perfil que anota la herramienta no se queda en el contexto de quien llama', async () => {
    const alc = await alcanceDesdeContexto({ agenciaId: 'ag-1' })
    await enContexto({ agenciaId: 'ag-1', origen: 'telegram' }, async () => {
      // llamaComoAgencia anota el perfil (p2) antes de llamar a la herramienta.
      const x = await ejecutaHerramienta('programar_guiones', { perfil: 'enformaconhugo', guiones: GUIONES }, alc)
      expect(x.ok).toBe(true)
      expect(contexto()).toEqual({ agenciaId: 'ag-1', origen: 'telegram' })
    })
  })
})
