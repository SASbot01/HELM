// Las herramientas del bot de Telegram de la agencia (api/_lib/bot-herramientas.js):
// que reconozca el perfil como lo dice el dueño sin adivinar nunca entre dos,
// que las etapas se validen contra el pipeline de verdad, que una cuota no se
// pase ni se duplique, que lo que se hace al aprobar sea lo que decía la
// tarjeta, y que ninguna herramienta saque secretos aunque la base se los
// devuelva. Sin red ni base: Supabase va simulado en memoria.
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase en memoria ─────────────────────────────────────────────────────
// Lo justo de PostgREST para estas herramientas. A propósito, `select` NO
// recorta columnas: devuelve la fila entera, como un select('*'). Así se ve que
// lo que sale de cada herramienta se monta campo a campo.
let tablas = {}
const ops = []
// Tablas en las que el próximo insert falla, para ver qué pasa cuando la base dice que no.
const fallanInserts = new Set()

const valor = (fila, col) => {
  if (col.includes('->>')) {
    const [a, b] = col.split('->>')
    return fila[a]?.[b] == null ? null : String(fila[a][b])
  }
  return fila[col]
}
const escapa = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function comoRegex(patron) {
  let re = ''
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i]
    if (c === '\\' && i + 1 < patron.length) re += escapa(patron[++i])
    else if (c === '%' || c === '*') re += '.*'
    else if (c === '_') re += '.'
    else re += escapa(c)
  }
  return new RegExp(`^${re}$`, 'i')
}
const compara = (a, b) => (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && a !== '' && b !== '' && !/^\d{4}-/.test(String(a))
  ? Number(a) - Number(b) : String(a).localeCompare(String(b)))
const igual = (a, b) => a != null && String(a) === String(b)

function filtroDe(col, op, v) {
  switch (op) {
    case 'eq': return (f) => igual(valor(f, col), v)
    case 'neq': return (f) => !igual(valor(f, col), v)
    case 'gt': return (f) => valor(f, col) != null && compara(valor(f, col), v) > 0
    case 'gte': return (f) => valor(f, col) != null && compara(valor(f, col), v) >= 0
    case 'lt': return (f) => valor(f, col) != null && compara(valor(f, col), v) < 0
    case 'lte': return (f) => valor(f, col) != null && compara(valor(f, col), v) <= 0
    case 'ilike': return (f) => comoRegex(String(v)).test(String(valor(f, col) ?? ''))
    case 'is': return (f) => (v === null || v === 'null' ? valor(f, col) == null : valor(f, col) === v)
    case 'in': return (f) => v.some(x => igual(valor(f, col), x))
    default: throw new Error(`operador ${op} sin simular`)
  }
}

class Consulta {
  constructor(tabla) { Object.assign(this, { tabla, filtros: [], op: 'select', cuenta: null, cabeza: false, orden: [], lim: null, uno: null }) }
  select(_, o = {}) { if (this.op === 'select') { this.cuenta = o.count || null; this.cabeza = Boolean(o.head) } return this }
  eq(c, v) { this.filtros.push(filtroDe(c, 'eq', v)); return this }
  neq(c, v) { this.filtros.push(filtroDe(c, 'neq', v)); return this }
  gt(c, v) { this.filtros.push(filtroDe(c, 'gt', v)); return this }
  gte(c, v) { this.filtros.push(filtroDe(c, 'gte', v)); return this }
  lt(c, v) { this.filtros.push(filtroDe(c, 'lt', v)); return this }
  lte(c, v) { this.filtros.push(filtroDe(c, 'lte', v)); return this }
  ilike(c, v) { this.filtros.push(filtroDe(c, 'ilike', v)); return this }
  is(c, v) { this.filtros.push(filtroDe(c, 'is', v)); return this }
  in(c, v) { this.filtros.push(filtroDe(c, 'in', v)); return this }
  not(c, op, v) { const f = filtroDe(c, op, v); this.filtros.push(x => !f(x)); return this }
  or(texto) {
    const partes = texto.split(',').map(p => { const [c, op, ...v] = p.split('.'); return filtroDe(c, op, v.join('.')) })
    this.filtros.push(f => partes.some(p => p(f)))
    return this
  }
  order(c, o = {}) { this.orden.push([c, o.ascending !== false]); return this }
  limit(n) { this.lim = n; return this }
  insert(filas) { this.op = 'insert'; this.datos = filas; return this }
  update(c) { this.op = 'update'; this.datos = c; return this }
  upsert(fila, o = {}) { this.op = 'upsert'; this.datos = fila; this.conflicto = o.onConflict; return this }
  delete() { this.op = 'delete'; return this }
  single() { this.uno = 'single'; return this.ejecuta() }
  maybeSingle() { this.uno = 'maybe'; return this.ejecuta() }
  then(ok, ko) { return this.ejecuta().then(ok, ko) }

  async ejecuta() {
    const t = (tablas[this.tabla] ||= [])
    const pasa = (f) => this.filtros.every(fn => fn(f))
    let data
    if (this.op === 'insert' && fallanInserts.has(this.tabla)) {
      return { data: null, error: { message: `fallo simulado en ${this.tabla}` } }
    }
    if (this.op === 'insert') {
      const nuevas = (Array.isArray(this.datos) ? this.datos : [this.datos]).map(f => ({ id: randomUUID(), created_at: new Date().toISOString(), ...structuredClone(f) }))
      t.push(...nuevas)
      ops.push({ op: 'insert', tabla: this.tabla, filas: nuevas })
      data = nuevas
    } else if (this.op === 'update') {
      data = t.filter(pasa)
      for (const f of data) Object.assign(f, structuredClone(this.datos))
      ops.push({ op: 'update', tabla: this.tabla, cambios: this.datos, n: data.length })
    } else if (this.op === 'delete') {
      data = t.filter(pasa)
      tablas[this.tabla] = t.filter(f => !data.includes(f))
      ops.push({ op: 'delete', tabla: this.tabla, n: data.length })
    } else if (this.op === 'upsert') {
      const clave = this.conflicto
      const ya = t.find(f => igual(f[clave], this.datos[clave]))
      if (ya) Object.assign(ya, this.datos)
      else t.push({ ...this.datos })
      ops.push({ op: 'upsert', tabla: this.tabla, fila: this.datos })
      data = [ya || this.datos]
    } else {
      data = t.filter(pasa)
      for (const [c, asc] of [...this.orden].reverse()) data = [...data].sort((a, b) => (asc ? 1 : -1) * compara(a[c] ?? '', b[c] ?? ''))
    }
    const count = data.length
    if (this.lim != null) data = data.slice(0, this.lim)
    data = structuredClone(data)
    if (this.uno === 'single') return { data: data[0] ?? null, error: data.length ? null : { message: 'sin filas' } }
    if (this.uno === 'maybe') return { data: data[0] ?? null, error: null }
    return { data: this.cabeza ? null : data, count: this.cuenta ? count : null, error: null }
  }
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => new Consulta(t) } }))

// ── El conector y lo que no hace falta para estas pruebas ──────────────────
const ejecutaHerramienta = vi.fn()
vi.mock('../api/mcp/[token].js', () => {
  const PERFIL = { type: 'string' }
  return {
    ESCRIBEN: ['anadir_reels', 'asignar_creadores', 'etiquetar_reels', 'programar_guiones', 'ordenar_video', 'guardar_memoria'],
    DEL_CLIENTE: ['identidades', 'perfiles', 'corpus', 'calendario', 'programar_guiones', 'ordenar_video', 'metricas', 'guardar_memoria'],
    herramientasDe: () => [
      { name: 'identidades', description: 'Creadores.', inputSchema: { type: 'object', properties: { perfil: PERFIL, tipo: { type: 'string' } } } },
      { name: 'perfiles', description: 'Perfiles.', inputSchema: { type: 'object', properties: {} } },
      { name: 'corpus', description: 'Corpus.', inputSchema: { type: 'object', properties: { identidad: { type: 'string' }, perfil: PERFIL, limite: { type: 'integer', minimum: 1, maximum: 100 } } } },
      { name: 'calendario', description: 'Calendario.', inputSchema: { type: 'object', properties: { perfil: PERFIL, desde: { type: 'string', format: 'date', description: 'AAAA-MM-DD.' }, hasta: { type: 'string', format: 'date' }, limite: { type: 'integer' } }, required: ['perfil'] } },
      {
        name: 'programar_guiones', description: 'Mete guiones. Con prueba=true no escribe: devuelve lo que haría. Repetir no duplica.',
        inputSchema: {
          type: 'object', required: ['perfil', 'guiones'],
          properties: {
            perfil: PERFIL,
            guiones: { type: 'array', minItems: 1, items: { type: 'object', required: ['fecha', 'titulo', 'tipo', 'guion'], properties: { fecha: { type: 'string', format: 'date' }, titulo: { type: 'string' }, tipo: { type: 'string' }, guion: { type: 'string' } } } },
            prueba: { type: 'boolean' },
          },
        },
      },
      { name: 'ordenar_video', description: 'Ordena.', inputSchema: { type: 'object', properties: { perfil: PERFIL, video_id: { type: 'string' }, prueba: { type: 'boolean' } }, required: ['perfil', 'video_id'] } },
      { name: 'metricas', description: 'Métricas.', inputSchema: { type: 'object', properties: { perfil: PERFIL, limite: { type: 'integer' }, actualizar: { type: 'boolean' } }, required: ['perfil'] } },
      { name: 'guardar_memoria', description: 'Memoria.', inputSchema: { type: 'object', properties: { contenido: { type: 'string' }, identidad: { type: 'string' }, perfil: PERFIL, prueba: { type: 'boolean' } }, required: ['contenido'] } },
    ],
    ejecutaHerramienta: (...a) => ejecutaHerramienta(...a),
  }
})
const encolaAgente = vi.fn(async () => {})
vi.mock('../api/_lib/equipo.js', () => ({
  AGENTES_LANZABLES: ['director', 'investigador', 'analista', 'productor', 'comercial', 'informe', 'guionista', 'editor', 'programador', 'virales'],
  encolaAgente: (...a) => encolaAgente(...a),
  tokensDeHoy: async () => 1234,
}))
// La Entrada de Drive ya no se mira al marcar un guion como grabado. Con un
// vídeo esperando, si alguien vuelve a cablearlo, el test lo ve.
const enEntrada = vi.fn(async () => [{ id: 'video-en-entrada', name: 'toma.mov' }])
vi.mock('../api/_lib/ingesta.js', () => ({ enEntrada: (...a) => enEntrada(...a) }))

const { resolverPerfil, herramientasBot, perfilesDeAgencia, sistemaBot, esAccionVacia, NO_SE_PUEDE } = await import('../api/_lib/bot-herramientas.js')
const { resolverEtapa, hoyMadrid, aTexto, tapaSecretos, MAX_TEXTO } = await import('../api/_lib/bot/comun.js')

// ── Datos ───────────────────────────────────────────────────────────────────
const AGENCIA = 'agencia-silvestre'
const P = {
  ddc: { id: randomUUID(), slug: 'detras-de-camra', name: 'detras de camra', brand_name: 'detras de camara' },
  hugo: { id: randomUUID(), slug: 'enformaconhugo', name: 'enformaconhugo', brand_name: null },
  silvestre: { id: randomUUID(), slug: 'silvestre', name: 'Silvestre AI', brand_name: null },
  alex: { id: randomUUID(), slug: 'alexsilvestre', name: 'alexsilvestre', brand_name: 'rastropro' },
  nova: { id: randomUUID(), slug: 'estudio-nova', name: 'Estudio Nova', brand_name: 'Estudio Nova' },
  markitos: { id: randomUUID(), slug: 'markitosfitness', name: 'Markitosfitness', brand_name: null },
}
const PERFILES = Object.values(P).map(({ id, slug, name }) => ({ id, slug, name }))
const AJENO = { id: randomUUID(), slug: 'smdsmdms', name: 'smdsmdms' }
const SECRETOS = ['hash-$2b$-secreto', 'tok-SECRETO-123', 'cfg-SECRETA', 'ES12-cuenta-de-pago', 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV']

const IDS = { pipelineFunnel: randomUUID(), ana: randomUUID(), luis: randomUUID(), venta: randomUUID(), ventaUltima: randomUUID(), ventaLlena: randomUUID(), guion: randomUUID() }
const HOY = hoyMadrid()
const MES = HOY.slice(0, 7)
const ESTAGES_INGLES = [
  { key: 'lead', label: 'Lead' }, { key: 'contacted', label: 'Contactado' }, { key: 'qualified', label: 'Cualificado' },
  { key: 'proposal', label: 'Propuesta' }, { key: 'won', label: 'Ganado' }, { key: 'lost', label: 'Perdido' },
]

function siembra() {
  const secretos = { password_hash: SECRETOS[0], token: SECRETOS[1], config: { token: SECRETOS[2] } }
  tablas = {
    clients: [...Object.values(P), AJENO].map(p => ({ ...p, agencia_id: p === AJENO ? 'otra-agencia' : AGENCIA, active: true, config: { apiKey: SECRETOS[2] } })),
    crm_pipelines: [
      { id: randomUUID(), client_id: P.ddc.id, name: 'Pipeline', stages: ESTAGES_INGLES, is_default: true, created_at: '2026-01-01' },
      {
        id: IDS.pipelineFunnel, client_id: P.ddc.id, name: 'Funnel pagina2', is_default: false, created_at: '2026-02-01',
        stages: [{ key: 'lead', label: 'Lead' }, { key: 'contactado', label: 'Contactado' }, { key: 'llamada_agendada', label: 'Llamada agendada' },
          { key: 'cliente', label: 'Cliente' }, { key: 'perdido', label: 'Perdido' }],
      },
    ],
    crm_contacts: [
      { id: IDS.ana, client_id: P.ddc.id, name: 'Ana García', email: 'ana@example.com', phone: '600111222', status: 'contacted', substages: ['x'], pipeline_id: null, notes: `Me pasó su clave ${SECRETOS[4]}`, custom_fields: { token: SECRETOS[1] }, updated_at: '2026-10-01', created_at: '2026-09-01', ...secretos },
      { id: IDS.luis, client_id: P.ddc.id, name: 'Luis Pérez', email: 'luis@example.com', status: 'lead', substages: [], pipeline_id: IDS.pipelineFunnel, updated_at: '2026-10-02', created_at: '2026-10-02', ...secretos },
    ],
    crm_activities: [{ id: randomUUID(), client_id: P.ddc.id, contact_id: IDS.ana, type: 'note', title: 'Llamada', description: 'Le interesa', performed_at: '2026-10-03', ...secretos }],
    helm_form_responses: [{ id: randomUUID(), client_id: P.ddc.id, contact_id: IDS.ana, answers: { '¿Qué haces?': 'bodas' }, submitted_at: '2026-09-01', helm_forms: { title: 'Lanzamiento' }, ...secretos }],
    crm_tasks: [],
    sales: [
      { id: IDS.venta, client_id: P.ddc.id, date: `${MES}-01`, client_name: 'Ana García', product: 'Mentoría', revenue: 900, cash_collected: 300, status: 'won', installments_total: 3, installments_paid: 1, installment_amount: 300, plan_start: `${MES}-01`, contact_id: IDS.ana, ...secretos },
      { id: IDS.ventaUltima, client_id: P.ddc.id, date: `${MES}-01`, client_name: 'Marta Ruiz', product: 'Curso', revenue: 1000, cash_collected: 666.66, status: 'won', installments_total: 3, installments_paid: 2, installment_amount: 333.33, plan_start: `${MES}-01`, ...secretos },
      { id: IDS.ventaLlena, client_id: P.ddc.id, date: `${MES}-01`, client_name: 'Pedro Gil', product: 'Curso', revenue: 600, cash_collected: 600, status: 'won', installments_total: 2, installments_paid: 2, installment_amount: 300, plan_start: `${MES}-01`, ...secretos },
      { id: randomUUID(), client_id: P.ddc.id, date: `${MES}-02`, client_name: 'Cancelado', product: 'X', revenue: 5000, cash_collected: 5000, status: 'cancelada', ...secretos },
    ],
    ceo_finance_entries: [{ id: randomUUID(), client_id: P.ddc.id, date: `${MES}-03`, category: 'Gasto fijo', description: 'Software', amount: -50, recurring: true, ...secretos }],
    helm_team: [{ id: randomUUID(), client_id: P.ddc.id, name: 'Juan Closer', role: 'closer', email: 'juan@example.com', active: true, pay_account: SECRETOS[3], pay_method: 'iban', ...secretos }],
    helm_links: [{ id: randomUUID(), client_id: P.ddc.id, title: 'Checkout', url: 'https://pago.example.com', category: 'Ventas', notes: 'el bueno', created_at: '2026-09-01', ...secretos }],
    helm_notificaciones: [{ id: randomUUID(), client_id: P.ddc.id, tipo: 'lead', nivel: 'info', titulo: 'Lead nuevo', cuerpo: 'Ha entrado Ana', leida_at: null, created_at: '2026-10-10', clave: 'k', meta: secretos }],
    helm_content_calendar: [{ id: IDS.guion, client_id: P.ddc.id, date: HOY, title: 'Cómo elegir objetivo', tipo: 'autoridad', revision: 'borrador', grabado: false, ...secretos }],
    agent_perfiles: [{ client_id: P.ddc.id, activo: true, guiones_dia: 2, tope_tokens_dia: 400000 }],
    agent_ejecuciones: [{ id: randomUUID(), client_id: P.ddc.id, agente: 'guionista', origen: 'horario', estado: 'error', error: 'sin saldo', empezado_en: new Date().toISOString(), ...secretos }],
    agent_jobs: [{ id: randomUUID(), tipo: 'equipo', estado: 'pendiente', payload: { clientId: P.ddc.id, agente: 'director', origen: 'horario', token: SECRETOS[1] }, created_at: new Date().toISOString() }],
    audit_logs: [],
  }
}

const ALCANCE = { agenciaId: AGENCIA, nombre: 'Silvestre AI', perfiles: PERFILES, origen: 'telegram' }
const SUPERADMIN = { id: 'sa-1', email: 'dueno@example.com', nombre: 'Alejandro' }
let herramientas
const h = (n) => herramientas.find(t => t.name === n)
const insertados = (tabla) => ops.filter(o => o.op === 'insert' && o.tabla === tabla).flatMap(o => o.filas)

beforeEach(async () => {
  siembra()
  ops.length = 0
  fallanInserts.clear()
  ejecutaHerramienta.mockReset()
  encolaAgente.mockClear()
  herramientas = await herramientasBot({ alcance: ALCANCE, agenciaId: AGENCIA, superadmin: SUPERADMIN })
})

// ── De qué perfil habla ─────────────────────────────────────────────────────
describe('resolverPerfil', () => {
  const lista = Object.values(P).map(({ id, slug, name, brand_name }) => ({ id, slug, name, marca: brand_name }))
  const slug = (texto) => resolverPerfil(lista, texto).perfil?.slug

  it('reconoce cada perfil como lo dice el dueño', () => {
    expect(slug('DCC')).toBe('detras-de-camra')
    expect(slug('dcc')).toBe('detras-de-camra')
    expect(slug('DDC')).toBe('detras-de-camra')
    expect(slug('Detrás de Cámaras')).toBe('detras-de-camra')
    expect(slug('detras de camra')).toBe('detras-de-camra')
    expect(slug('detras-de-camra')).toBe('detras-de-camra')
    expect(slug('Hugo')).toBe('enformaconhugo')
    expect(slug('En forma con Hugo')).toBe('enformaconhugo')
    expect(slug('el perfil de hugo')).toBe('enformaconhugo')
    expect(slug('Silvestre')).toBe('silvestre')
    expect(slug('Silvestre AI')).toBe('silvestre')
    expect(slug('lo de silvestre')).toBe('silvestre')
    expect(slug('el perfil de silvestre')).toBe('silvestre')
    expect(slug('rastropro')).toBe('alexsilvestre')
    expect(slug('Rastro Pro')).toBe('alexsilvestre')
    expect(slug('lo de alexsilvestre')).toBe('alexsilvestre')
    expect(slug('la de alex silvestre')).toBe('alexsilvestre')
    expect(slug('Nova')).toBe('estudio-nova')
    expect(slug('markitos')).toBe('markitosfitness')
  })

  it('sin la marca (solo slug y nombre) sigue reconociendo «Detrás de Cámaras»', () => {
    const sinMarca = lista.map(({ marca: _m, ...p }) => p)
    expect(resolverPerfil(sinMarca, 'Detrás de Cámaras').perfil?.slug).toBe('detras-de-camra')
  })

  it('si encajan varios, no adivina: error con las opciones', () => {
    const r = resolverPerfil(lista, 'silv')
    expect(r.perfil).toBeUndefined()
    expect(r.error).toMatch(/más de un perfil/)
    expect(r.opciones.sort()).toEqual(['Silvestre AI', 'alexsilvestre'])

    // Dos perfiles nombrados en el mismo texto, en cualquier nivel.
    const casos = {
      'detras de camra y enformaconhugo': ['detras de camra', 'enformaconhugo'],
      'en forma con hugo y silvestre': ['Silvestre AI', 'enformaconhugo'],
      'Hugo y Silvestre': ['Silvestre AI', 'enformaconhugo'],
      'la de alexsilvestre y silvestre': ['Silvestre AI', 'alexsilvestre'],
    }
    for (const [texto, opciones] of Object.entries(casos)) {
      const x = resolverPerfil(lista, texto)
      expect(x.perfil?.slug, texto).toBeUndefined()
      expect(x.opciones.sort(), texto).toEqual(opciones)
    }
  })

  it('una errata en una palabra corta no cae en otro perfil', () => {
    for (const texto of ['Nora', 'Noba']) expect(resolverPerfil(lista, texto).perfil, texto).toBeUndefined()
    expect(slug('Estudio Noba')).toBe('estudio-nova')
  })

  it('las herramientas y quien las llama reconocen el perfil con la misma lista (con la marca)', async () => {
    // Lo que hace telegram-agencia.js: resolverPerfil sobre alcance.perfiles.
    const alcance = { ...ALCANCE, perfiles: Object.values(P).map(({ id, slug, name }) => ({ id, slug, name })) }
    expect(resolverPerfil(alcance.perfiles, 'rastropro').perfil).toBeUndefined()
    const lasDeEste = await herramientasBot({ alcance, agenciaId: AGENCIA, superadmin: SUPERADMIN })
    for (const texto of ['rastropro', 'Rastro Pro', 'rastro']) {
      expect(resolverPerfil(alcance.perfiles, texto).perfil?.slug, texto).toBe('alexsilvestre')
      expect(resolverPerfil(await perfilesDeAgencia(alcance), texto).perfil?.slug, texto).toBe('alexsilvestre')
    }
    const r = await lasDeEste.find(t => t.name === 'ventas').ejecutar({ perfil: 'rastropro' })
    expect(r.ok, r.texto).toBe(true)
    expect(JSON.parse(r.texto).perfil).toBe('alexsilvestre')
  })

  it('si no existe o no dice nada, error con todos los de la agencia', () => {
    for (const texto of ['Pepito', '', null, 'xyz']) {
      const r = resolverPerfil(lista, texto)
      expect(r.perfil).toBeUndefined()
      expect(r.opciones).toHaveLength(lista.length)
    }
  })
})

// ── Etapas ──────────────────────────────────────────────────────────────────
describe('etapas del CRM', () => {
  it('lo que dice el dueño se valida contra las etapas reales del pipeline', () => {
    expect(resolverEtapa('ganado', ESTAGES_INGLES).etapa.key).toBe('won')
    expect(resolverEtapa('Ganado', ESTAGES_INGLES).etapa.key).toBe('won')
    expect(resolverEtapa('cliente', ESTAGES_INGLES).etapa.key).toBe('won')
    expect(resolverEtapa('won', ESTAGES_INGLES).etapa.key).toBe('won')
    expect(resolverEtapa('propuesta', ESTAGES_INGLES).etapa.key).toBe('proposal')
    expect(resolverEtapa('cualificado', ESTAGES_INGLES).etapa.key).toBe('qualified')
    const malo = resolverEtapa('llamada agendada', ESTAGES_INGLES)
    expect(malo.etapa).toBeUndefined()
    expect(malo.opciones).toContain('Ganado (won)')
  })

  it('mover de etapa usa el pipeline DEL contacto y vacía las subetapas', async () => {
    const ok = await h('crm_mover_etapa').ejecutar({ perfil: 'DCC', contacto: 'luis@example.com', etapa: 'llamada agendada' })
    expect(ok.ok).toBe(true)
    expect(tablas.crm_contacts.find(c => c.id === IDS.luis)).toMatchObject({ status: 'llamada_agendada', substages: [] })

    // «propuesta» existe en el pipeline principal, pero no en el de Luis.
    const mal = await h('crm_mover_etapa').ejecutar({ perfil: 'DCC', contacto: 'Luis Pérez', etapa: 'propuesta' })
    expect(mal.ok).toBe(false)
    expect(mal.texto).toMatch(/Funnel pagina2/)
    expect(mal.texto).toMatch(/Llamada agendada/)
  })

  it('mover a la etapa en la que ya está no escribe', async () => {
    const r = await h('crm_mover_etapa').ejecutar({ perfil: 'DCC', contacto: IDS.ana, etapa: 'contactado' })
    expect(r.ok).toBe(true)
    expect(r.texto).toMatch(/ya está/)
    expect(ops.filter(o => o.op === 'update')).toHaveLength(0)
  })

  it('buscar por etapa: la etapa en la que SE VE cada contacto en su pipeline, no los alias del grupo', async () => {
    const mas = (name, status, pipeline_id = null) => ({ id: randomUUID(), client_id: P.ddc.id, name, status, pipeline_id, created_at: '2026-10-05', updated_at: '2026-10-05' })
    tablas.crm_contacts.push(mas('Quique Cualificado', 'qualified'), mas('Raúl Raro', 'registrado'), mas('Carla Contactada', 'contactado', IDS.pipelineFunnel))
    const busca = async (etapa) => JSON.parse((await h('crm_buscar').ejecutar({ perfil: 'DCC', etapa })).texto)

    // En el principal, 'contacted' y 'qualified' son dos etapas; en el Funnel, 'contactado'.
    const contactado = await busca('Contactado')
    expect(contactado.contactos.map(c => c.nombre).sort()).toEqual(['Ana García', 'Carla Contactada'])
    expect(contactado.total).toBe(2)
    expect((await busca('cualificado')).contactos.map(c => c.nombre)).toEqual(['Quique Cualificado'])

    // Un estado que no es de ninguna etapa se ve en la primera, como en el panel.
    expect((await busca('lead')).contactos.map(c => c.nombre).sort()).toEqual(['Luis Pérez', 'Raúl Raro'])
  })

  it('crear un contacto: etapa validada, la primera por defecto, y sin duplicar por email', async () => {
    const mal = await h('crm_crear_contacto').ejecutar({ perfil: 'DCC', nombre: 'Eva', email: 'eva@example.com', etapa: 'inventada' })
    expect(mal.ok).toBe(false)
    expect(insertados('crm_contacts')).toHaveLength(0)

    const bien = await h('crm_crear_contacto').ejecutar({ perfil: 'DCC', nombre: 'Eva', email: 'Eva@Example.com' })
    expect(bien.ok).toBe(true)
    expect(insertados('crm_contacts')[0]).toMatchObject({ client_id: P.ddc.id, status: 'lead', email: 'eva@example.com', source: 'Telegram' })

    const repe = await h('crm_crear_contacto').ejecutar({ perfil: 'DCC', nombre: 'Ana G.', email: 'ANA@example.com' })
    expect(repe.ok).toBe(true)
    expect(repe.texto).toMatch(/Ya existe/)
    expect(insertados('crm_contacts')).toHaveLength(1)
  })
})

// ── Cuotas ──────────────────────────────────────────────────────────────────
describe('registrar_cuota', () => {
  const venta = (id) => tablas.sales.find(v => v.id === id)

  it('suma una cuota, apunta el Ingreso y no la duplica en el mismo mes', async () => {
    const r = await h('registrar_cuota').ejecutar({ perfil: 'DCC', venta: IDS.venta, cuota: 2 })
    expect(r.ok, r.texto).toBe(true)
    expect(venta(IDS.venta)).toMatchObject({ installments_paid: 2, cash_collected: 600 })
    const [apunte] = insertados('ceo_finance_entries')
    expect(apunte).toMatchObject({ client_id: P.ddc.id, category: 'Ingreso', amount: 300, date: HOY, notes: `telegram:${IDS.venta}:${MES}` })
    expect(tablas.audit_logs.at(-1)).toMatchObject({ action: 'telegram.registrar_cuota', actor_id: 'sa-1', actor_email: 'dueno@example.com', actor_type: 'superadmin', client_id: P.ddc.id })

    const otra = await h('registrar_cuota').ejecutar({ perfil: 'DCC', venta: IDS.venta, cuota: 2 })
    expect(otra.ok).toBe(true)
    expect(otra.texto).toMatch(/ya estaba apuntada/)
    expect(venta(IDS.venta)).toMatchObject({ installments_paid: 2, cash_collected: 600 })
    expect(insertados('ceo_finance_entries')).toHaveLength(1)
  })

  it('la última cuota cobra lo que falta y no se pasa del total', async () => {
    const r = await h('registrar_cuota').ejecutar({ perfil: 'DCC', cliente: 'Marta', cuota: 3 })
    expect(r.ok, r.texto).toBe(true)
    expect(venta(IDS.ventaUltima)).toMatchObject({ installments_paid: 3, cash_collected: 1000 })
    expect(insertados('ceo_finance_entries')[0].amount).toBe(333.34)

    const llena = await h('registrar_cuota').ejecutar({ perfil: 'DCC', venta: IDS.ventaLlena, cuota: 3 })
    expect(llena.ok).toBe(false)
    expect(llena.texto).toMatch(/todas sus cuotas/)
    expect(venta(IDS.ventaLlena)).toMatchObject({ installments_paid: 2, cash_collected: 600 })
  })

  it('un importe que se pasa de lo que falta no se apunta', async () => {
    const r = await h('registrar_cuota').ejecutar({ perfil: 'DCC', venta: IDS.venta, cuota: 2, importe: 1000 })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/se pasa/)
    expect(venta(IDS.venta).installments_paid).toBe(1)
    expect(insertados('ceo_finance_entries')).toHaveLength(0)
  })

  it('describir explica qué hará sin escribir nada', async () => {
    const texto = await h('registrar_cuota').describir({ perfil: 'DCC', venta: IDS.venta, cuota: 2, fecha: 'hoy' })
    expect(texto).toMatch(/cuota 2\/3 de Ana García/)
    expect(texto).toMatch(/300 €/)
    expect(ops.filter(o => o.op !== 'select' && o.op !== undefined)).toHaveLength(0)
    const llena = await h('registrar_cuota').describir({ perfil: 'DCC', venta: IDS.ventaLlena, cuota: 3, fecha: 'hoy' })
    expect(llena).toMatch(new RegExp(`^${NO_SE_PUEDE}`))
    expect(esAccionVacia(llena)).toBe(true)
    expect(esAccionVacia(texto)).toBe(false)
  })

  it('la cuota es la que se pidió: si entretanto la apuntan desde el panel, no se apunta otra', async () => {
    const input = { perfil: 'DCC', venta: IDS.venta, cuota: 2 }
    expect(await h('registrar_cuota').describir(input)).toMatch(/cuota 2\/3/)
    Object.assign(venta(IDS.venta), { installments_paid: 2, cash_collected: 600 })
    const r = await h('registrar_cuota').ejecutar({ ...input })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/la siguiente es la 3, no la 2/)
    expect(venta(IDS.venta)).toMatchObject({ installments_paid: 2, cash_collected: 600 })
    expect(insertados('ceo_finance_entries')).toHaveLength(0)
  })

  it('si al aprobar ya no sale lo que decía la tarjeta, no se hace', async () => {
    await h('registrar_cuota').describir({ perfil: 'DCC', venta: IDS.venta, cuota: 2 })
    venta(IDS.venta).installment_amount = 250
    // Al pulsar Aprobar se rehacen las herramientas y el input vuelve de la base (jsonb) con otro orden.
    const otras = await herramientasBot({ alcance: ALCANCE, agenciaId: AGENCIA, superadmin: SUPERADMIN })
    const r = await otras.find(t => t.name === 'registrar_cuota').ejecutar({ cuota: 2, venta: IDS.venta, perfil: 'DCC' })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/Ha cambiado algo/)
    expect(r.texto).toMatch(/250 €/)
    expect(venta(IDS.venta).installments_paid).toBe(1)
    expect(insertados('ceo_finance_entries')).toHaveLength(0)
  })

  it('con resumenAprobado, solo se hace si coincide con lo que sale ahora', async () => {
    const input = { perfil: 'DCC', venta: IDS.venta, cuota: 2 }
    const mal = await h('registrar_cuota').ejecutar(input, { resumenAprobado: 'Apuntar la cuota 2/3 de Ana García: 900 €.' })
    expect(mal.ok).toBe(false)
    expect(venta(IDS.venta).installments_paid).toBe(1)
    const tarjeta = await h('registrar_cuota').describir(input)
    const bien = await h('registrar_cuota').ejecutar(input, { resumenAprobado: tarjeta })
    expect(bien.ok, bien.texto).toBe(true)
    expect(venta(IDS.venta).installments_paid).toBe(2)
  })

  it('si el Ingreso no se puede apuntar, la venta se deja como estaba y se dice', async () => {
    fallanInserts.add('ceo_finance_entries')
    const r = await h('registrar_cuota').ejecutar({ perfil: 'DCC', venta: IDS.venta, cuota: 2 })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/se ha dejado como estaba/)
    expect(venta(IDS.venta)).toMatchObject({ installments_paid: 1, cash_collected: 300 })
    expect(tablas.audit_logs.at(-1)).toMatchObject({ action: 'telegram.registrar_cuota', status_code: 500 })
  })
})

// ── Lo que sale nunca lleva secretos ────────────────────────────────────────
describe('secretos', () => {
  const LLAMADAS = {
    resumen_perfil: {}, crm_buscar: { texto: 'a' }, crm_contacto: { contacto: 'Ana García' }, ventas: {}, cobros_pendientes: {},
    finanzas: {}, agentes_estado: {}, notificaciones: {}, enlaces: {}, equipo: {},
  }

  it('ninguna herramienta de lectura devuelve contraseñas, tokens, claves ni configuración', async () => {
    for (const [nombre, args] of Object.entries(LLAMADAS)) {
      const r = await h(nombre).ejecutar({ perfil: 'DCC', ...args })
      expect(r.ok, `${nombre}: ${r.texto}`).toBe(true)
      for (const s of SECRETOS) expect(r.texto, nombre).not.toContain(s)
      expect(r.texto, nombre).not.toMatch(/password|"token"|"config"|pay_account/)
    }
  })

  it('lo que devuelve el conector también sale limpio', async () => {
    ejecutaHerramienta.mockResolvedValue({ ok: true, ensayo: false, resultado: { perfil: 'detras-de-camra', config: { token: SECRETOS[1] }, guiones: [{ titulo: 'x', password: SECRETOS[0] }] }, texto: '' })
    const r = await h('calendario').ejecutar({ perfil: 'DCC' })
    expect(r.ok).toBe(true)
    for (const s of SECRETOS) expect(r.texto).not.toContain(s)
  })

  it('un texto largo se recorta sin pasar de MAX_TEXTO, con el aviso dentro', () => {
    const t = aTexto('x'.repeat(10000))
    expect(t.length).toBeLessThanOrEqual(MAX_TEXTO)
    expect(t).toMatch(/Pide menos \(limite\)/)
  })

  it('tapa los valores de cualquier variable de entorno con nombre de secreto y las claves de Google y Apify', () => {
    const antes = { ...process.env }
    try {
      process.env.IG_APP_SECRET = '0123456789abcdef0123456789abcdef'
      process.env.VITE_SUPABASE_ANON_KEY = 'publica-publica-publica-publica'
      const google = `AIza${'B'.repeat(35)}`
      const t = tapaSecretos(`a ${process.env.IG_APP_SECRET} b ${google} c apify_api_${'z'.repeat(30)} d ${process.env.VITE_SUPABASE_ANON_KEY}`)
      expect(t).toBe('a [oculto] b [oculto] c [oculto] d publica-publica-publica-publica')
    } finally {
      process.env = antes
    }
  })

  it('perfiles: los de la agencia con su marca y sus creadores', async () => {
    ejecutaHerramienta.mockResolvedValue({ ok: true, resultado: { perfiles: [{ perfil: 'detras-de-camra', creadores: ['samzia'] }] } })
    const r = JSON.parse((await h('perfiles').ejecutar({})).texto)
    expect(r.perfiles).toHaveLength(PERFILES.length)
    expect(r.perfiles.find(p => p.perfil === 'detras-de-camra')).toMatchObject({ marca: 'detras de camara', creadores: ['samzia'] })
  })
})

// ── El conector y el resto ──────────────────────────────────────────────────
describe('herramientas', () => {
  it('lectura directa; escritura y gasto, delicadas y con describir', () => {
    const nombres = herramientas.map(t => t.name)
    expect(new Set(nombres).size).toBe(nombres.length)
    for (const n of ['perfiles', 'resumen_perfil', 'crm_buscar', 'crm_contacto', 'ventas', 'cobros_pendientes', 'finanzas', 'agentes_estado', 'notificaciones', 'enlaces', 'equipo', 'identidades', 'corpus', 'calendario']) {
      expect(h(n)?.delicada, n).toBe(false)
    }
    for (const n of ['crm_crear_contacto', 'crm_mover_etapa', 'crm_nota', 'crm_tarea', 'registrar_venta', 'registrar_cuota', 'finanzas_apunte', 'aprobar_guion', 'marcar_grabado', 'lanzar_agente', 'equipo_pausar', 'notificaciones_leidas', 'enlace_guardar', 'programar_guiones', 'ordenar_video', 'guardar_memoria']) {
      expect(h(n)?.delicada, n).toBe(true)
      expect(typeof h(n).describir, n).toBe('function')
    }
    // metricas lee, pero sincronizar con Instagram escribe y gasta cuota de Meta.
    expect(h('metricas').delicada({ perfil: 'DCC' })).toBe(false)
    expect(h('metricas').delicada({ perfil: 'DCC', actualizar: true })).toBe(true)
    for (const t of herramientas) {
      expect(t.input_schema).toMatchObject({ type: 'object', additionalProperties: false })
      expect(t.input_schema.properties.prueba, t.name).toBeUndefined()
    }
  })

  it('el conector recibe el slug ya resuelto y las fechas en AAAA-MM-DD; el ensayo va con prueba', async () => {
    ejecutaHerramienta.mockResolvedValue({ ok: true, resultado: { prueba: true, hecho: 'Ensayo, nada escrito. 1 guion en el calendario de detras-de-camra: 1 nuevos.', haria: [{ accion: 'nuevo', fecha: HOY, titulo: 'Gancho', tipo: 'viralidad' }] } })
    const guion = { fecha: 'hoy', titulo: 'Gancho', tipo: 'viralidad', guion: 'Texto' }
    const texto = await h('programar_guiones').describir({ perfil: 'Detrás de Cámaras', guiones: [guion], prueba: false })
    expect(ejecutaHerramienta).toHaveBeenLastCalledWith('programar_guiones', { perfil: 'detras-de-camra', guiones: [{ ...guion, fecha: HOY }], prueba: true }, ALCANCE)
    expect(texto).toMatch(/^En detras de camra: 1 guion/)
    expect(texto).toMatch(/Gancho/)

    ejecutaHerramienta.mockResolvedValue({ ok: true, resultado: { hecho: 'hecho' } })
    await h('programar_guiones').ejecutar({ perfil: 'DCC', guiones: [guion] })
    const [, dados] = ejecutaHerramienta.mock.lastCall
    expect(dados).toEqual({ perfil: 'detras-de-camra', guiones: [{ ...guion, fecha: HOY }] })
    expect(tablas.audit_logs.at(-1)).toMatchObject({ action: 'telegram.programar_guiones' })
  })

  it('metricas con actualizar se describe sin llamar al conector, y al aprobar sincroniza', async () => {
    const texto = await h('metricas').describir({ perfil: 'DCC', actualizar: true })
    expect(texto).toMatch(/Sincronizar ahora con Instagram las métricas de detras de camra/)
    expect(ejecutaHerramienta).not.toHaveBeenCalled()
    ejecutaHerramienta.mockResolvedValue({ ok: true, resultado: { perfil: 'detras-de-camra', publicaciones: [] } })
    expect((await h('metricas').ejecutar({ perfil: 'DCC', actualizar: true })).ok).toBe(true)
    expect(ejecutaHerramienta).toHaveBeenCalledTimes(1)
    expect(ejecutaHerramienta.mock.lastCall[1]).toMatchObject({ perfil: 'detras-de-camra', actualizar: true, limite: 20 })
  })

  it('en el conector también: si el ensayo al aprobar no dice lo mismo que la tarjeta, no se escribe', async () => {
    const guion = { fecha: 'hoy', titulo: 'Gancho', tipo: 'viralidad', guion: 'Texto' }
    const ensayo = (accion) => ({ ok: true, resultado: { prueba: true, hecho: 'Ensayo, nada escrito. 1 guion.', haria: [{ accion, fecha: HOY, titulo: 'Gancho', tipo: 'viralidad' }] } })
    ejecutaHerramienta.mockResolvedValueOnce(ensayo('nuevo'))
    expect(await h('programar_guiones').describir({ perfil: 'DCC', guiones: [guion] })).toMatch(/nuevo/)
    ejecutaHerramienta.mockResolvedValueOnce(ensayo('ya_estaba'))
    const r = await h('programar_guiones').ejecutar({ perfil: 'DCC', guiones: [guion] })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/Ha cambiado algo/)
    expect(ejecutaHerramienta).toHaveBeenCalledTimes(2)
    expect(ejecutaHerramienta.mock.calls.every(([, dados]) => dados.prueba === true)).toBe(true)
  })

  it('guardar_memoria enseña la nota entera, y una que no cabe no se guarda', async () => {
    ejecutaHerramienta.mockResolvedValue({ ok: true, resultado: { prueba: true, hecho: 'Ensayo, nada escrito. Se guardaría una nota.' } })
    const nota = `Regla: ${'palabra '.repeat(200)}FIN-DE-LA-NOTA`
    expect(await h('guardar_memoria').describir({ perfil: 'DCC', contenido: nota, identidad: 'samzia' })).toContain('FIN-DE-LA-NOTA')
    const larga = await h('guardar_memoria').describir({ perfil: 'DCC', contenido: 'x'.repeat(3000) })
    expect(larga).toMatch(new RegExp(`^${NO_SE_PUEDE}.*máximo es 2500`))
  })

  it('un perfil de otra agencia no se toca, y uno ambiguo devuelve las opciones', async () => {
    const ajena = await herramientasBot({ alcance: { ...ALCANCE, perfiles: [...PERFILES, AJENO] }, agenciaId: AGENCIA, superadmin: SUPERADMIN })
    const r = await ajena.find(t => t.name === 'ventas').ejecutar({ perfil: 'smdsmdms' })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/no es de esta agencia/)

    const amb = await h('ventas').ejecutar({ perfil: 'silv' })
    expect(amb.ok).toBe(false)
    expect(amb.texto).toMatch(/Silvestre AI/)
    expect(amb.texto).toMatch(/alexsilvestre/)
  })

  it('el alcance tiene que ser de agencia', async () => {
    await expect(herramientasBot({ alcance: { operador: true }, agenciaId: AGENCIA })).rejects.toThrow()
    await expect(herramientasBot({ alcance: { ...ALCANCE, agenciaId: 'otra' }, agenciaId: AGENCIA })).rejects.toThrow()
  })

  it('registrar_venta fraccionada: como el formulario, y el contacto pasa a ganado', async () => {
    const r = await h('registrar_venta').ejecutar({ perfil: 'DCC', cliente: 'Ana García', email: 'ana@example.com', producto: 'Mentoría 2', importe: 1200, fraccionado: true, cuotas: 4, cuotas_cobradas: 1 })
    expect(r.ok, r.texto).toBe(true)
    const [v] = insertados('sales')
    expect(v).toMatchObject({
      client_id: P.ddc.id, revenue: 1200, cash_collected: 300, payment_type: 'Fraccionado', installments_total: 4, installments_paid: 1,
      installment_amount: 300, status: 'won', contact_id: IDS.ana, date: HOY, plan_start: HOY,
    })
    expect(tablas.crm_contacts.find(c => c.id === IDS.ana)).toMatchObject({ status: 'won', deal_value: 1200 })
    expect(insertados('crm_activities')).toHaveLength(1)

    const mal = await h('registrar_venta').ejecutar({ perfil: 'DCC', cliente: 'X', producto: 'Y', importe: 100, fraccionado: true, cuotas: 1 })
    expect(mal.ok).toBe(false)
    const pasada = await h('registrar_venta').ejecutar({ perfil: 'DCC', cliente: 'X', producto: 'Y', importe: 100, cobrado: 200 })
    expect(pasada.ok).toBe(false)
  })

  it('registrar_venta con un email con «_» no se engancha a otro contacto: crea el suyo en la etapa ganada', async () => {
    tablas.crm_contacts.push({ id: randomUUID(), client_id: P.ddc.id, name: 'Ana Punto', email: 'ana.g@example.com', status: 'lead', pipeline_id: null })
    const input = { perfil: 'DCC', cliente: 'Ana Guion', email: 'ana_g@example.com', producto: 'Curso', importe: 200, notas: 'Pagó en dos veces' }
    expect(await h('registrar_venta').describir(input)).toMatch(/se crea su ficha.*\n.*Pagó en dos veces/s)
    const r = await h('registrar_venta').ejecutar(input)
    expect(r.ok, r.texto).toBe(true)
    expect(tablas.crm_contacts.find(c => c.email === 'ana.g@example.com')).toMatchObject({ status: 'lead' })
    const nuevo = tablas.crm_contacts.find(c => c.email === 'ana_g@example.com')
    expect(nuevo).toMatchObject({ status: 'won', name: 'Ana Guion', deal_value: 200 })
    expect(insertados('sales')[0]).toMatchObject({ contact_id: nuevo.id, notes: 'Pagó en dos veces' })
  })

  it('si no se puede dejar la nota en la ficha: crm_nota falla; en una venta, se avisa', async () => {
    fallanInserts.add('crm_activities')
    const nota = await h('crm_nota').ejecutar({ perfil: 'DCC', contacto: 'Ana García', texto: 'Llamar' })
    expect(nota.ok).toBe(false)
    expect(tablas.audit_logs.at(-1)).toMatchObject({ action: 'telegram.crm_nota', status_code: 500 })
    const venta = await h('registrar_venta').ejecutar({ perfil: 'DCC', cliente: 'Ana García', email: 'ana@example.com', producto: 'Extra', importe: 50 })
    expect(venta.ok).toBe(true)
    expect(JSON.parse(venta.texto).aviso).toMatch(/nota en la ficha/)
  })

  it('lo que se escribe sale entero en la tarjeta; si no cabe, no se hace', async () => {
    const texto = `Inicio ${'bla '.repeat(400)} FINAL`
    expect(await h('crm_nota').describir({ perfil: 'DCC', contacto: 'Ana García', texto })).toContain(' FINAL')
    expect(await h('lanzar_agente').describir({ perfil: 'DCC', agente: 'guionista', encargo: `${'x'.repeat(300)} FINAL` })).toContain(' FINAL»')
    const larga = await h('crm_nota').describir({ perfil: 'DCC', contacto: 'Ana García', texto: 'y'.repeat(2600) })
    expect(larga).toMatch(new RegExp(`^${NO_SE_PUEDE}`))
    expect((await h('crm_nota').ejecutar({ perfil: 'DCC', contacto: 'Ana García', texto: 'y'.repeat(2600) })).ok).toBe(false)
    expect(insertados('crm_activities')).toHaveLength(0)
  })

  it('notificaciones_leidas: la tarjeta dice cuáles, y las de otra agencia no se tocan', async () => {
    const ajena = { id: randomUUID(), client_id: AJENO.id, titulo: 'De otra agencia', leida_at: null, created_at: '2026-10-11' }
    tablas.helm_notificaciones.push(ajena)
    const solo = await h('notificaciones_leidas').describir({ ids: [ajena.id] })
    expect(solo).toMatch(/No hace falta hacer nada/)
    const r = await h('notificaciones_leidas').ejecutar({ ids: [ajena.id] })
    expect(r.ok).toBe(true)
    expect(ajena.leida_at).toBeNull()
    expect(ops.filter(o => o.op === 'update')).toHaveLength(0)

    expect(await h('notificaciones_leidas').describir({})).toMatch(/Lead nuevo/)
  })

  it('lanzar un agente que ya está en cola no se encola otra vez', async () => {
    const r = await h('lanzar_agente').ejecutar({ perfil: 'DCC', agente: 'director' })
    expect(r.ok).toBe(false)
    expect(encolaAgente).not.toHaveBeenCalled()
    const bien = await h('lanzar_agente').ejecutar({ perfil: 'DCC', agente: 'guionista' })
    expect(bien.ok).toBe(true)
    expect(encolaAgente).toHaveBeenCalledWith(expect.objectContaining({ clientId: P.ddc.id, agente: 'guionista', origen: 'telegram' }))
  })

  it('marcar_grabado solo marca: ni mira la Entrada de Drive ni encola nada', async () => {
    const tarjeta = await h('marcar_grabado').describir({ perfil: 'DCC', guion_id: IDS.guion })
    expect(tarjeta).not.toMatch(/Drive|Entrada/)
    const r = await h('marcar_grabado').ejecutar({ perfil: 'DCC', guion_id: IDS.guion })
    expect(r.ok).toBe(true)
    expect(r.texto).not.toMatch(/Entrada|en camino/)
    expect(tablas.helm_content_calendar[0].grabado).toBe(true)
    expect(enEntrada).not.toHaveBeenCalled()
    expect(ops.filter(o => ['agent_jobs', 'agent_drive_videos'].includes(o.tabla))).toHaveLength(0)
  })

  it('aprobar un borrador solo si sigue en borrador', async () => {
    expect((await h('aprobar_guion').ejecutar({ perfil: 'DCC', guion_id: IDS.guion, accion: 'aprobar' })).ok).toBe(true)
    expect(tablas.helm_content_calendar[0].revision).toBe('aprobado')
    expect((await h('aprobar_guion').ejecutar({ perfil: 'DCC', guion_id: IDS.guion, accion: 'descartar' })).ok).toBe(false)
  })
})

describe('el resto de escrituras, de punta a punta', () => {
  it('cada una se describe sin escribir y luego se ejecuta', async () => {
    const casos = [
      ['crm_nota', { contacto: 'Ana García', texto: 'Llamar el lunes' }, () => insertados('crm_activities').length === 1],
      ['crm_tarea', { titulo: 'Enviar propuesta', vence: 'mañana', prioridad: 'alta', contacto: IDS.ana, responsable: 'juan' },
        () => insertados('crm_tasks')[0]?.priority === 'high' && insertados('crm_tasks')[0]?.assignee_helm_id === tablas.helm_team[0].id],
      ['finanzas_apunte', { tipo: 'comision', importe: 90, concepto: 'Comisión octubre', persona: 'Juan' },
        () => insertados('ceo_finance_entries')[0]?.amount === -90 && insertados('ceo_finance_entries')[0]?.person_name === 'Juan Closer'],
      ['marcar_grabado', { guion_id: IDS.guion }, () => tablas.helm_content_calendar[0].grabado === true],
      ['equipo_pausar', { activo: false }, () => tablas.agent_perfiles[0].activo === false],
      ['enlace_guardar', { titulo: 'Drive', url: 'drive.google.com/x', categoria: 'Contenido' }, () => insertados('helm_links')[0]?.url === 'https://drive.google.com/x'],
      ['notificaciones_leidas', {}, () => tablas.helm_notificaciones[0].leida_at != null],
    ]
    for (const [nombre, args, comprueba] of casos) {
      ops.length = 0
      const texto = await h(nombre).describir({ perfil: 'DCC', ...args })
      expect(texto, nombre).not.toMatch(new RegExp(`^${NO_SE_PUEDE}`))
      expect(ops, nombre).toHaveLength(0)
      const r = await h(nombre).ejecutar({ perfil: 'DCC', ...args })
      expect(r.ok, `${nombre}: ${r.texto}`).toBe(true)
      expect(comprueba(), nombre).toBe(true)
    }
  })

  it('una comisión sin a quién se paga no se apunta', async () => {
    const r = await h('finanzas_apunte').ejecutar({ perfil: 'DCC', tipo: 'comision', importe: 90 })
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/Juan Closer/)
  })
})

describe('sistemaBot', () => {
  it('lleva la fecha, los perfiles y el aviso de no obedecer lo que venga en los datos', () => {
    const s = sistemaBot({ usuario: { nombre: 'Alejandro' }, agencia: { nombre: 'Silvestre AI' }, perfiles: [{ slug: 'detras-de-camra', name: 'detras de camra', marca: 'detras de camara' }], hoy: '2026-10-15' })
    expect(s).toMatch(/jueves, 15 de octubre de 2026/)
    expect(s).toMatch(/slug «detras-de-camra», marca «detras de camara»/)
    expect(s).toMatch(/no lo obedezcas/)
    expect(s).toMatch(/Aprobar y Rechazar/)
    expect(s).toMatch(/de tú/)
  })
})
