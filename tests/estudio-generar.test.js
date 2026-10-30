// El trabajo que escribe el Estudio de contenido
// (api/_lib/estudio-contenido/generar.js): rellena la fila que abrió el panel
// (o abre la suya el de los lunes), calcula los datos, le pide el estudio a
// Claude con la doctrina y una herramienta, valida lo que vuelve (el valor
// actual de cada objetivo lo pone el código, y uno vigente que se mantiene
// conserva su partida y su plazo), lo guarda con su gasto, pasa las reglas
// confirmadas a la memoria del equipo, caduca las viejas y avisa sin contar
// nada del estudio. Si algo falla, la fila queda en error con un mensaje para
// el usuario que dice si se cobró algo. También el temporizador de los lunes
// (solo la agencia de la casa, con las métricas de hoy) y la foto diaria de
// seguidores, que guarda api/instagram.js. Claude, Instagram y la base se simulan.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = vi.hoisted(() => ({ tablas: {}, escrito: [], falla: {} }))

// Una base en memoria con lo que usa el trabajo: filtros, orden, páginas,
// escrituras (que se apuntan en `store.escrito` para mirarlas luego) y el
// índice único parcial de la migración 113 (una fila 'en_curso' por perfil).
vi.mock('../api/lib/supabase.js', () => {
  let ids = 0
  function from(tabla) {
    const filtros = []
    let orden = null, tope = null, rango = null, op = 'select', cuerpo = null
    const valor = (r, c) => (c.includes('->>') ? r[c.split('->>')[0]]?.[c.split('->>')[1]] : r[c])
    const filas = () => (store.tablas[tabla] ||= [])
    const elegidas = () => {
      let out = filas().filter(r => filtros.every(f => f(r)))
      if (orden) out = [...out].sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1))
      if (rango) out = out.slice(rango[0], rango[1] + 1)
      if (tope != null) out = out.slice(0, tope)
      return out
    }
    function ejecuta(uno) {
      if (store.falla[tabla]) return Promise.resolve({ data: null, error: { message: store.falla[tabla] } })
      if (op === 'insert') {
        const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(r => ({ id: r.id || `id-${++ids}`, generado_en: new Date().toISOString(), ...r }))
        if (tabla === 'helm_estudio_contenido' && nuevas.some(n => n.estado === 'en_curso' && filas().some(r => r.client_id === n.client_id && r.estado === 'en_curso'))) {
          return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "helm_estudio_contenido_uno_en_curso"' } })
        }
        filas().push(...nuevas)
        store.escrito.push({ tabla, op, filas: nuevas })
        return Promise.resolve({ data: uno ? nuevas[0] : nuevas, error: null })
      }
      if (op === 'upsert') {
        store.escrito.push({ tabla, op, filas: Array.isArray(cuerpo) ? cuerpo : [cuerpo] })
        return Promise.resolve({ data: null, error: null })
      }
      const sel = elegidas()
      if (op === 'update') { for (const r of sel) Object.assign(r, cuerpo); store.escrito.push({ tabla, op, filas: sel.map(r => r.id), cambios: cuerpo }) }
      if (op === 'delete') { store.tablas[tabla] = filas().filter(r => !sel.includes(r)); store.escrito.push({ tabla, op, filas: sel.map(r => r.id) }) }
      return Promise.resolve({ data: uno ? sel[0] || null : sel, error: null })
    }
    const q = {
      select() { return q },
      eq(c, v) { filtros.push(r => valor(r, c) === v); return q },
      in(c, vs) { filtros.push(r => vs.includes(valor(r, c))); return q },
      is(c, v) { filtros.push(r => (valor(r, c) ?? null) === v); return q },
      lt(c, v) { filtros.push(r => valor(r, c) < v); return q },
      gte(c, v) { filtros.push(r => valor(r, c) >= v); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      range(a, b) { rango = [a, b]; return q },
      insert(r) { op = 'insert'; cuerpo = r; return q },
      upsert(r) { op = 'upsert'; cuerpo = r; return q },
      update(r) { op = 'update'; cuerpo = r; return q },
      delete() { op = 'delete'; return q },
      single() { return ejecuta(true) },
      maybeSingle() { return ejecuta(true) },
      then(res, rej) { return ejecuta(false).then(res, rej) },
    }
    return q
  }
  return { supabase: { from } }
})

const claudePaso = vi.fn()
vi.mock('../api/_lib/anthropic.js', () => ({
  claudePaso: (...a) => claudePaso(...a),
  reparaArgs: (a) => a,
  modeloValido: (m) => ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'].includes(m),
  MODELO_POR_DEFECTO: 'claude-opus-5',
}))
const cobro = vi.hoisted(() => ({ paga: true }))
vi.mock('../api/_lib/creditos.js', () => ({
  claveHelm: () => 'clave-de-helm',
  costeUsd: (_m, u) => ((u.input_tokens || 0) * 2 + (u.output_tokens || 0) * 10) / 1e6,
  pagaConCreditos: async () => cobro.paga,
  precioEuros: (usd) => usd * 0.92 * 2,
}))
// Instagram por dentro (api/_lib/instagram.js): la de verdad habla con Meta.
// api/instagram.js (sincronizar, conectar) va de verdad, con esto debajo.
const ig = vi.hoisted(() => ({ perfil: null, falla: null }))
vi.mock('../api/_lib/instagram.js', () => {
  const fila = (clientId) => (store.tablas.user_integrations || []).find(r => r.client_id === clientId) || null
  return {
    getIgConfig: async (_s, clientId) => fila(clientId),
    saveIgConfig: async (_s, clientId, config) => {
      const f = fila(clientId)
      if (f) f.config = config
      else (store.tablas.user_integrations ||= []).push({ client_id: clientId, service: 'instagram', member_id: null, enabled: true, config })
      store.escrito.push({ tabla: 'user_integrations', op: 'save', config })
    },
    getToken: async (_s, clientId) => {
      if (ig.falla) throw Object.assign(new Error(ig.falla), { statusCode: 502 })
      return { token: 't', config: fila(clientId)?.config || {} }
    },
    getPerfil: async () => { if (!ig.perfil) throw new Error('Meta no contesta'); return ig.perfil },
    listMedia: async () => [],
    getInsights: async () => ({}),
    // Sin altas ni bajas: el relleno del histórico (tests/seguidores-historial.test.js) no añade nada aquí.
    altasYBajas: async () => [],
    exchangeCode: async () => ({ access_token: 'corto', user_id: 7 }),
    exchangeLongLived: async () => ({ access_token: 'largo', expires_in: 5_184_000 }),
    suscribirMensajes: async () => ({}),
    igAuthUrl: () => 'https://instagram.com/oauth', igRedirectUri: () => 'https://helm/cb', igCredsMissing: () => false,
    maskToken: () => '••••', informeIg: async () => ({}),
  }
})
vi.mock('../api/_lib/auth.js', () => ({
  applyCors: () => {}, rateLimit: () => ({ ok: true }), getClientIp: () => '1.1.1.1', writeAudit: async () => {},
  signJwt: async () => 'firmado', verifyJwt: async () => ({ kind: 'instagram-oauth', clientId: 'c1', slug: 'silvestre' }),
}))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: async () => ({ role: 'client', clientId: 'c1' }) }))
const notificar = vi.fn(async () => {})
vi.mock('../api/_lib/notificar.js', () => ({ notificar: (...a) => notificar(...a) }))
vi.mock('../api/_lib/estudio-contenido/conocimiento.js', () => ({
  CONOCIMIENTO: '# DOCTRINA DE PRUEBA', HITOS: [1000, 10000, 100000, 1000000], ALGORITMO_RESUMEN: [],
}))
vi.mock('../api/_lib/equipo.js', () => ({ diaMadrid: () => '2026-10-27', horaMadrid: () => 10 }))

const { generaEstudio, revisaEstudio, guardaAprendido, caducaAprendido, miraEstudiosContenido, encolaEstudio, objetivosVigentes, importaEstudio, datosDeHoy, SISTEMA, HERRAMIENTA } =
  await import('../api/_lib/estudio-contenido/generar.js')
const { calculaDatos } = await import('../api/_lib/estudio-contenido/datos.js')
const { sincronizaMetricas } = await import('../api/_lib/metricas-ig.js')
const { sincronizar, default: instagramHandler } = await import('../api/instagram.js')

// ── Lo que trae la base ─────────────────────────────────────────────────────

const DIA = 86_400_000
const hace = (ms) => new Date(Date.now() - ms).toISOString()
const diaMadrid = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const piezas = (k) => Array.from({ length: k }, (_, i) => ({
  id: `m${String(i).padStart(3, '0')}`, client_id: 'c1', permalink: `https://instagram.com/p/${i}`,
  caption: i === 0 ? 'Convierte cualquier web en una API\ncon este repo' : `Pieza ${i}`,
  producto: 'REELS', tipo: 'VIDEO', publicado_en: hace((5 + i * 3) * DIA),
  visitas: i === 0 ? 50_000 : 1000 + i * 10, alcance: 800, likes: 30, comentarios: 3, guardados: 12, compartidos: 6,
  interacciones: 50, retencion_media: 7.8,
}))

beforeEach(() => {
  store.tablas = {
    clients: [{ id: 'c1', slug: 'silvestre', name: 'Silvestre AI', agencia_id: 'casa' }],
    helm_ig_media: piezas(20),
    user_integrations: [{ client_id: 'c1', service: 'instagram', member_id: null, enabled: true, config: { token: 't', followers: 1551, username: 'silvesttre.ai', lastSyncAt: new Date().toISOString() } }],
    helm_ig_seguidores: [],
    helm_estudio_contenido: [],
    helm_biblia: [{ client_id: 'c1', kind: 'contenido', content: 'Hablamos de IA práctica para no programadores.' }],
    helm_onboarding: [{ client_id: 'c1', form: 'contenido', answers: { d6_voz_interior: '«Esto no es para mí, yo no sé programar»', e1_preguntas: '¿Cómo empiezo?', marca: 'no entra' } }],
    helm_avatar: [{ client_id: 'c1', resumen: { avatar: { descripcion: 'Dueños de pymes de 35-50 años.', dolores: ['falta de tiempo'], motivaciones: ['automatizar'] } } }],
    agent_memory: [],
    agent_jobs: [],
  }
  store.escrito = []
  store.falla = {}
  cobro.paga = true
  ig.perfil = { username: 'silvesttre.ai', followers_count: 1560 }
  ig.falla = null
  claudePaso.mockReset()
  notificar.mockClear()
})

// Lo que deja el POST del panel antes de encolar: la fila 'en_curso'.
function pedidoDelPanel(extra = {}) {
  store.tablas.helm_estudio_contenido.push({ id: 'pedido', client_id: 'c1', estado: 'en_curso', generado_en: hace(60_000), ...extra })
  return { payload: { clientId: 'c1', origen: 'panel', estudioId: 'pedido' } }
}

// ── Lo que contesta Claude ──────────────────────────────────────────────────

const semana = (n) => ({
  semana: n, foco: `Foco ${n}`, acciones: ['Grabar', 'Probar un gancho'],
  piezas: [{ tema: 'Webs como API', angulo: 'El error que comete todo el mundo', formato: 'reel', gancho: 'Nadie te cuenta esto de las APIs' }],
})
const estudioBueno = (extra = {}) => ({
  resumen: 'La cuenta crece a base de un viral; la base es sólida.',
  etapa: { nombre: 'De 1.000 a 10.000', que_cambia: 'Volver repetible lo que funciona.' },
  objetivos: [
    { nombre: 'Subir la mediana', metrica: 'mediana_visitas', actual: 99999, objetivo: 1500, plazo_dias: 30, por_que: 'La base está en ~1.100.' },
    { nombre: 'Llegar a 2.000', metrica: 'seguidores', actual: 1, objetivo: 2000, plazo_dias: 90, por_que: 'Ritmo necesario.' },
    { nombre: 'Inventado', metrica: 'felicidad', actual: 1, objetivo: 2, plazo_dias: 30, por_que: 'No existe.' },
  ],
  diagnostico: {
    funciona: [{ hallazgo: 'Las piezas de utilidad', evidencia: 'Mediana de 1.100 en 20 piezas', por_que: 'Se guardan.' }],
    no_funciona: [{ hallazgo: 'Los textos largos', evidencia: 'Tercio de abajo', por_que: 'Cansan.' }],
  },
  plan: [semana(3), semana(1), semana(2), semana(4)],
  experimentos: [{ hipotesis: 'Si…', variable: 'gancho', como: 'Dos trials', metrica: 'visitas a 72 h', criterio_exito: '5 de 5', duracion: '2 semanas' }],
  avatar_contenido: {
    a_quien_hablar: 'Quien quiere usar IA sin programar.', nivel_consciencia: 'Sabe que existe, no cómo empezar.',
    dolores: ['No sé programar'], deseos: ['Automatizar'], objeciones: ['Esto no es para mí'],
    temas_que_enganchan: ['Webs como API'], temas_que_no: ['Noticias'], vocabulario: ['vibecoding'],
    a_quien_no: 'Programadores senior.', diferencia_con_ventas: 'Compra la pyme; sigue el curioso.',
  },
  aprendido: [
    { regla: 'Los ganchos de transformación X→Y funcionan', evidencia: '6 de 6 pares por encima de la mediana', estado: 'Confirmada' },
    { regla: 'Publicar el sábado rinde menos', evidencia: 'Solo 5 piezas', estado: 'provisional' },
    { regla: 'Las preguntas en el gancho bajan las visitas', evidencia: 'El tercio de arriba tiene más preguntas', estado: 'descartada' },
  ],
  metricas_a_vigilar: [{ metrica: 'compartidos por mil', por_que: 'Llegan a no seguidores', umbral: '> 5', etiqueta: 'OFICIAL vía prensa' }],
  avisos: ['Sin duración de los vídeos no se lee la retención.'],
  ...extra,
})
const respuesta = (input, { id = 'tu1', usage = { input_tokens: 15_000, output_tokens: 6_000 } } = {}) => ({
  stop_reason: 'tool_use', usage,
  content: [{ type: 'thinking', thinking: '…', signature: 's' }, { type: 'tool_use', id, name: 'entregar_estudio', input }],
})

const filaEstudio = () => store.tablas.helm_estudio_contenido.at(-1)
const prompt = () => claudePaso.mock.calls[0][0].messages[0].content

describe('generaEstudio · pedido en el panel', () => {
  it('rellena LA fila que abrió el endpoint: calcula, pide, valida y guarda con su gasto', async () => {
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())

    expect(store.tablas.helm_estudio_contenido).toHaveLength(1)
    const f = filaEstudio()
    expect(f.id).toBe('pedido')
    expect(f.estado).toBe('listo')
    expect(f.modelo).toBe('claude-sonnet-5')
    expect(f.tokens).toBe(21_000)
    expect(f.coste_usd).toBe(0.09)
    expect(f.error).toBeNull()
    expect(f.datos.cuenta).toMatchObject({ usuario: 'silvesttre.ai', seguidores: 1551, piezas: 20, piezas_recientes: 0 })
    // Lo que diga el modelo del valor actual no vale: lo pone el código. Y cada
    // objetivo lleva su partida, desde cuándo cuenta y cuándo vence.
    expect(f.estudio.objetivos).toHaveLength(2)
    const [mediana, seguidores] = f.estudio.objetivos
    expect(mediana).toMatchObject({ metrica: 'visitas', actual: f.datos.base.medianas.visitas, partida: f.datos.base.medianas.visitas, objetivo: 1500, plazo_dias: 30 })
    expect(Date.parse(mediana.vence) - Date.parse(mediana.desde)).toBe(30 * DIA)
    expect(seguidores).toMatchObject({ metrica: 'seguidores', actual: 1551 })
    expect(f.estudio.plan.map(s => s.semana)).toEqual([1, 2, 3, 4])
    expect(f.estudio.metricas_a_vigilar[0].etiqueta).toBe('OFICIAL')
    expect(f.estudio.aprendido.map(r => r.estado)).toEqual(['confirmada', 'en_prueba', 'descartada'])

    // A Claude: la doctrina, la herramienta, Sonnet con esfuerzo medio y la clave de HELM (cobra).
    const pedido = claudePaso.mock.calls[0][0]
    expect(pedido.system.startsWith('# DOCTRINA DE PRUEBA')).toBe(true)
    expect(pedido.system).toContain('entregar_estudio')
    expect(pedido.system).toContain('por cada 1.000 cuentas alcanzadas')
    expect(pedido).toMatchObject({ apiKey: 'clave-de-helm', model: 'claude-sonnet-5', esfuerzo: 'medium' })
    expect(pedido.tools[0].name).toBe('entregar_estudio')
    const user = prompt()
    expect(user).toContain('"siguiente_hito":10000')
    expect(user).toContain('Convierte cualquier web en una API')
    expect(user).toContain('D6 · voz interior: «Esto no es para mí, yo no sé programar»')
    expect(user).toContain('E1 · preguntas')
    expect(user).not.toContain('no entra')
    expect(user).toContain('<material>')
    // Las piezas de la base, una a una, para que pueda contar pares de verdad.
    expect(user).toContain('"piezas_base":[{')
    expect(pedido.system).toMatch(/pares se cuentan SOLO con piezas que estén en DATOS/)
    expect(pedido.system).toMatch(/por cada 1\.000 VISITAS \(nunca por alcance\)/)
  })

  it('el avatar de VENTAS no entra en el prompt (el Informe lo ven roles que no pueden verlo)', async () => {
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(prompt()).not.toMatch(/avatar de ventas/i)
    expect(prompt()).not.toContain('Dueños de pymes')
    expect(prompt()).not.toContain('falta de tiempo')
    expect(store.escrito.some(w => w.tabla === 'helm_avatar')).toBe(false)
  })

  it('las piezas de menos de 72 h no salen en los textos de las más y menos vistas', async () => {
    store.tablas.helm_ig_media.push({ ...piezas(1)[0], id: 'joven', caption: 'Recién subido y ya va fuerte', visitas: 90_000, publicado_en: hace(DIA) })
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(prompt()).not.toContain('Recién subido')
    expect(filaEstudio().datos.cuenta.piezas_recientes).toBe(1)
  })

  it('avisa al acabar, en Informe de contenido, sin contar nada del estudio', async () => {
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(notificar).toHaveBeenCalledTimes(1)
    const aviso = notificar.mock.calls[0][2]
    expect(aviso.destino).toBe('metricas')
    expect(aviso.titulo).toMatch(/estudio de contenido/i)
    expect(aviso.cuerpo).not.toMatch(/\d/)
    expect(aviso.cuerpo).not.toContain('viral')
  })

  it('si su fila ya no está en curso (se dio por perdida o ya se hizo), no repite ni cobra', async () => {
    await generaEstudio(pedidoDelPanel({ estado: 'error', error: 'a medias' }))
    expect(claudePaso).not.toHaveBeenCalled()
    expect(filaEstudio()).toMatchObject({ estado: 'error', error: 'a medias' })
    await generaEstudio({ payload: { clientId: 'c1', origen: 'panel', estudioId: 'de-otro-perfil' } })
    expect(claudePaso).not.toHaveBeenCalled()
  })

  it('al empezar, la fila coge empezado_en y la hora de ahora: los 30 min cuentan desde que se trabaja', async () => {
    const job = pedidoDelPanel({ generado_en: hace(25 * 60_000), empezado_en: null })
    let alEmpezar = null
    claudePaso.mockImplementationOnce(async () => { alEmpezar = { ...filaEstudio() }; return respuesta(estudioBueno()) })
    await generaEstudio(job)
    expect(Date.now() - Date.parse(alEmpezar.generado_en)).toBeLessThan(5_000)
    expect(Date.now() - Date.parse(alEmpezar.empezado_en)).toBeLessThan(5_000)
  })
})

describe('generaEstudio · lo aprendido y la memoria del equipo', () => {
  it('las confirmadas van a la memoria; las descartadas y las que vuelven a «en prueba» salen', async () => {
    store.tablas.agent_memory = [
      { id: 'n1', client_id: 'c1', clave: 'estrategia/las-preguntas-en-el-gancho-bajan-las-visitas', agente: 'estratega', tipo: 'aprendido', contenido: 'vieja', updated_at: hace(DIA) },
      { id: 'n2', client_id: 'c1', clave: 'ganchos-de-pregunta', agente: 'analista', tipo: 'aprendido', contenido: 'del analista', updated_at: hace(DIA) },
      { id: 'n3', client_id: 'c1', clave: 'estrategia/publicar-el-sabado-rinde-menos', agente: 'estratega', tipo: 'aprendido', contenido: 'Publicar el sábado rinde menos. Evidencia: 5 pares', updated_at: hace(DIA) },
    ]
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    const notas = store.tablas.agent_memory
    const nueva = notas.find(n => n.clave === 'estrategia/los-ganchos-de-transformacion-x-y-funcionan')
    expect(nueva).toMatchObject({ client_id: 'c1', ambito: 'perfil', agente: 'estratega', tipo: 'aprendido' })
    expect(nueva.contenido).toContain('6 de 6')
    // La descartada se va; la que falló y vuelve a prueba, también; la del analista ni se toca.
    expect(notas.some(n => n.id === 'n1')).toBe(false)
    expect(notas.some(n => n.id === 'n3')).toBe(false)
    expect(notas.find(n => n.id === 'n2').contenido).toBe('del analista')
  })

  it('le pasa al modelo las reglas que ya están en la memoria, con su texto y su fecha', async () => {
    store.tablas.agent_memory = [{ id: 'n1', client_id: 'c1', clave: 'estrategia/regla-x', agente: 'estratega', tipo: 'aprendido', contenido: 'Regla X. Evidencia: 7 pares (Estudio de contenido, 2026-09-01)', updated_at: '2026-09-01T07:00:00Z' }]
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(prompt()).toContain('«Regla X» (confirmada por última vez el 2026-09-01)')
  })

  it('caducan las del estratega con 12 semanas sin reconfirmar; lo reconfirmado hoy se queda', async () => {
    const semanas = (n) => hace(n * 7 * DIA)
    store.tablas.agent_memory = [
      { id: 'vieja', client_id: 'c1', clave: 'estrategia/vieja', agente: 'estratega', tipo: 'aprendido', contenido: 'Vieja', updated_at: semanas(13) },
      { id: 'reciente', client_id: 'c1', clave: 'estrategia/reciente', agente: 'estratega', tipo: 'aprendido', contenido: 'Reciente', updated_at: semanas(11) },
      { id: 'reconfirmada', client_id: 'c1', clave: 'estrategia/los-ganchos-de-transformacion-x-y-funcionan', agente: 'estratega', tipo: 'aprendido', contenido: 'antes', updated_at: semanas(20) },
      { id: 'analista', client_id: 'c1', clave: 'otra', agente: 'analista', tipo: 'aprendido', contenido: 'del analista', updated_at: semanas(30) },
      { id: 'regla', client_id: 'c1', clave: 'regla-dueno', agente: 'estratega', tipo: 'regla', contenido: 'del dueño', updated_at: semanas(30) },
      { id: 'ajena', client_id: 'c2', clave: 'estrategia/vieja', agente: 'estratega', tipo: 'aprendido', contenido: 'de otro perfil', updated_at: semanas(30) },
    ]
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(store.tablas.agent_memory.map(n => n.id).sort()).toEqual(['ajena', 'analista', 'reciente', 'reconfirmada', 'regla'])
    expect(store.tablas.agent_memory.find(n => n.id === 'reconfirmada').contenido).toContain('6 de 6')
    expect(await caducaAprendido('c1')).toBe(0)
  })

  it('una regla ya confirmada se actualiza en su sitio, no se duplica', async () => {
    store.tablas.agent_memory = [{ id: 'n1', client_id: 'c1', clave: 'estrategia/regla-x', agente: 'estratega', tipo: 'aprendido', contenido: 'antes' }]
    await guardaAprendido('c1', [{ regla: 'Regla X', evidencia: '7 casos', estado: 'confirmada' }], '2026-10-27')
    expect(store.tablas.agent_memory).toHaveLength(1)
    expect(store.tablas.agent_memory[0].contenido).toBe('Regla X. Evidencia: 7 casos (Estudio de contenido, 2026-10-27)')
  })
})

describe('generaEstudio · el estudio anterior y sus objetivos', () => {
  const anterior = (objetivos, generado_en = hace(7 * DIA)) => ({
    id: 'viejo', client_id: 'c1', estado: 'listo', generado_en, datos: {},
    estudio: { objetivos, aprendido: [{ regla: 'Regla vieja', estado: 'en_prueba' }], experimentos: [] },
  })

  it('le pasa sus reglas y compara sus objetivos en su plazo', async () => {
    store.tablas.helm_estudio_contenido = [anterior([
      { nombre: 'Seguidores', metrica: 'seguidores', actual: 1500, objetivo: 1550, plazo_dias: 30 },
      { nombre: 'Mediana', metrica: 'visitas', actual: 1000, objetivo: 5000, plazo_dias: 30 },
    ])]
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(prompt()).toContain('Regla vieja')
    const [seg, med] = filaEstudio().datos.desde_anterior.objetivos
    expect(seg).toMatchObject({ antes: 1500, ahora: 1551, estado: 'cumplido', cumplido: true })
    expect(med).toMatchObject({ antes: 1000, estado: 'en_curso', cumplido: null })
  })

  it('los en curso van como OBJETIVOS VIGENTES; uno que se mantiene conserva su partida, su cifra y su plazo', async () => {
    const desde = hace(10 * DIA)
    store.tablas.helm_estudio_contenido = [anterior([
      { nombre: 'Subir la mediana', metrica: 'visitas', actual: 1000, partida: 900, objetivo: 5000, plazo_dias: 60, desde },
      { nombre: 'Seguidores', metrica: 'seguidores', actual: 1500, objetivo: 1550, plazo_dias: 30 },   // ya cumplido: no es vigente
    ])]
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno({
      objetivos: [
        // El modelo lo mantiene (mismo nombre y métrica) e intenta cambiarle la cifra y el plazo: no cuela.
        { nombre: 'Subir la mediana', metrica: 'visitas', objetivo: 1200, plazo_dias: 14, por_que: 'Sigue en ello.' },
        { nombre: 'Llegar a 2.000', metrica: 'seguidores', objetivo: 2000, plazo_dias: 90, por_que: 'Nuevo.' },
      ],
    })))
    await generaEstudio(pedidoDelPanel())
    const vigentes = prompt().split('# OBJETIVOS VIGENTES')[1].split('\n')[1]
    expect(JSON.parse(vigentes)).toEqual([expect.objectContaining({ nombre: 'Subir la mediana', metrica: 'visitas', partida: 900, objetivo: 5000 })])
    const [mantenido, nuevo] = filaEstudio().estudio.objetivos
    expect(mantenido).toMatchObject({ nombre: 'Subir la mediana', partida: 900, objetivo: 5000, plazo_dias: 60, desde, por_que: 'Sigue en ello.' })
    expect(mantenido.actual).toBe(filaEstudio().datos.base.medianas.visitas)
    expect(mantenido.vence).toBe(new Date(Date.parse(desde) + 60 * DIA).toISOString())
    expect(nuevo).toMatchObject({ nombre: 'Llegar a 2.000', partida: 1551, objetivo: 2000, plazo_dias: 90 })
  })

  it('objetivosVigentes: solo los en curso, con lo que hace falta para mantenerlos', () => {
    const ant = anterior([{ nombre: 'A', metrica: 'visitas', actual: 1000, objetivo: 9000, plazo_dias: 45 }, null, { nombre: 'B', metrica: 'seguidores', actual: 10, objetivo: 20 }], '2026-10-20T07:00:00Z')
    const datos = calculaDatos({ piezas: piezas(20), seguidores: 1551, anterior: ant, hoy: new Date('2026-10-27T10:00:00Z') })
    expect(objetivosVigentes(ant, datos)).toEqual([
      expect.objectContaining({ nombre: 'A', metrica: 'visitas', partida: 1000, objetivo: 9000, plazo_dias: 45, desde: '2026-10-20T07:00:00Z', vence: '2026-12-04T07:00:00.000Z' }),
    ])
  })
})

describe('datosDeHoy · las cifras de hoy frente a un estudio ya hecho', () => {
  it('la etapa y el avance de sus objetivos salen con los seguidores de hoy, no con los del día del estudio', async () => {
    const estudio = {
      id: 'e27', client_id: 'c1', estado: 'listo', generado_en: '2026-10-27T17:48:00Z', datos: { cuenta: { seguidores: 1577 } },
      estudio: { objetivos: [{ nombre: 'Llegar a 2.000 seguidores', metrica: 'seguidores', actual: 1577, objetivo: 2000, plazo_dias: 33 }] },
    }
    store.tablas.user_integrations = [{ client_id: 'c1', service: 'instagram', enabled: true, config: { token: 'tok', followers: 1984, username: 'cuenta' } }]
    store.tablas.helm_ig_seguidores = [
      { client_id: 'c1', dia: '2026-10-27', seguidores: 1589 }, { client_id: 'c1', dia: '2026-10-28', seguidores: 1694 },
      { client_id: 'c1', dia: '2026-10-29', seguidores: 1874 }, { client_id: 'c1', dia: '2026-10-30', seguidores: 1984 },
    ]
    const hoy = await datosDeHoy('c1', estudio, new Date('2026-10-30T10:00:00Z'))
    expect(hoy.cuenta.seguidores).toBe(1984)
    expect(hoy.etapa.siguiente_hito).toBeGreaterThan(1984)
    const [o] = hoy.objetivos
    expect(o).toMatchObject({ nombre: 'Llegar a 2.000 seguidores', antes: 1577, ahora: 1984, objetivo: 2000, estado: 'en_curso', quedan_dias: 31 })
    expect(o.avance).toBeGreaterThan(0.9)
  })
})

describe('generaEstudio · validar lo que entrega', () => {
  it('si no vale, se le devuelve el motivo una vez; a la segunda, se guarda y se suma el gasto', async () => {
    claudePaso
      .mockResolvedValueOnce(respuesta(estudioBueno({ plan: [semana(1)] }), { id: 'tu-malo' }))
      .mockResolvedValueOnce(respuesta(estudioBueno(), { id: 'tu-bueno', usage: { input_tokens: 1000, output_tokens: 1000 } }))
    await generaEstudio(pedidoDelPanel())
    expect(claudePaso).toHaveBeenCalledTimes(2)
    const segunda = claudePaso.mock.calls[1][0].messages
    expect(segunda[1].role).toBe('assistant')
    expect(segunda[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu-malo', is_error: true })
    expect(segunda[2].content[0].content).toMatch(/4 semanas/)
    expect(filaEstudio()).toMatchObject({ estado: 'listo', tokens: 23_000 })
  })

  it('si no llama a la herramienta, se le pide que entregue', async () => {
    claudePaso
      .mockResolvedValueOnce({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Aquí va mi análisis…' }] })
      .mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(pedidoDelPanel())
    expect(claudePaso.mock.calls[1][0].messages[2].content).toMatch(/entregar_estudio/)
    expect(filaEstudio().estado).toBe('listo')
  })

  it('revisaEstudio: normaliza, recorta y pone el actual del código', () => {
    const datos = calculaDatos({ piezas: piezas(20), seguidores: 1551, hoy: new Date() })
    const muchos = Array.from({ length: 7 }, (_, i) => ({ nombre: `o${i}`, metrica: 'medianas.retencion', objetivo: 9, plazo_dias: 400, por_que: 'Retener más.' }))
    const { estudio, errores } = revisaEstudio(estudioBueno({ objetivos: muchos }), datos)
    expect(errores).toEqual([])
    expect(estudio.objetivos).toHaveLength(5)
    expect(estudio.objetivos[0]).toMatchObject({ metrica: 'retencion_s', actual: 7.8, partida: 7.8, plazo_dias: 90 })
    const { errores: e2 } = revisaEstudio({ resumen: '' }, datos)
    expect(e2.some(x => x.includes('resumen'))).toBe(true)
    expect(e2.some(x => x.includes('4 semanas'))).toBe(true)
    expect(HERRAMIENTA.input_schema.required).toEqual(expect.arrayContaining(['resumen', 'objetivos', 'plan', 'avatar_contenido', 'aprendido']))
    expect(HERRAMIENTA.input_schema.properties.aprendido.items.properties.estado.enum).toEqual(['confirmada', 'descartada', 'en_prueba'])
    expect(SISTEMA).toContain('<material>')
    expect(SISTEMA).toMatch(/5 o más pares/)
  })
})

describe('generaEstudio · cuando falla: mensaje para el usuario y si se cobró', () => {
  it('sin saldo antes de empezar: lo dice, y que no se ha cobrado nada', async () => {
    claudePaso.mockRejectedValueOnce(Object.assign(new Error('Te has quedado sin créditos. Recarga para que la IA siga trabajando.'), { statusCode: 402 }))
    await expect(generaEstudio(pedidoDelPanel())).rejects.toThrow(/créditos/)
    expect(filaEstudio()).toMatchObject({ estado: 'error', error: 'No quedan créditos para hacer el estudio. Recarga y vuelve a pedirlo. No se ha cobrado nada.' })
    expect(store.tablas.agent_memory).toEqual([])
  })

  it('si Claude lo rechaza DESPUÉS de cobrar, la fila guarda tokens y coste, y lo dice', async () => {
    claudePaso
      .mockResolvedValueOnce(respuesta(estudioBueno({ plan: [semana(1)] })))
      .mockRejectedValueOnce(Object.assign(new Error('Claude ha rechazado esta petición por sus filtros de seguridad. Reformúlala.'), { statusCode: 422, usage: { input_tokens: 1000, output_tokens: 1000 } }))
    await expect(generaEstudio(pedidoDelPanel())).rejects.toThrow(/rechazado/)
    const f = filaEstudio()
    expect(f).toMatchObject({ estado: 'error', tokens: 23_000, coste_usd: 0.102 })
    expect(f.error).toBe('No se ha podido hacer el estudio. Vuelve a pedirlo en un rato. Se ha cobrado lo que llegó a usar la IA (0,19 €).')
  })

  it('a la agencia de la casa no se le cobra: lo gastado se apunta, pero el mensaje dice que nada', async () => {
    cobro.paga = false
    claudePaso.mockResolvedValue(respuesta(estudioBueno({ objetivos: [{ nombre: 'x', metrica: 'felicidad', objetivo: 3 }] })))
    await expect(generaEstudio(pedidoDelPanel())).rejects.toThrow(/no ha devuelto un estudio válido/)
    const f = filaEstudio()
    expect(f).toMatchObject({ estado: 'error', tokens: 42_000 })
    expect(f.error).toBe('La IA no ha devuelto un estudio que se pueda usar. Vuelve a pedirlo en un rato. No se ha cobrado nada.')
    expect(f.datos.cuenta.piezas).toBe(20)
    expect(notificar).not.toHaveBeenCalled()
  })

  it('un fallo interno no se le enseña al usuario: el detalle va al log y al trabajo', async () => {
    store.falla.helm_ig_media = 'relation "helm_ig_media" does not exist'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(generaEstudio(pedidoDelPanel())).rejects.toThrow()
    const f = filaEstudio()
    expect(f.estado).toBe('error')
    expect(f.error).toBe('No se ha podido hacer el estudio. Vuelve a pedirlo en un rato. No se ha cobrado nada.')
    expect(log.mock.calls.flat().join(' ')).toContain('helm_ig_media')
    log.mockRestore()
  })

  it('sin piezas sincronizadas, o con todas de menos de 72 h, no se llama a Claude', async () => {
    store.tablas.helm_ig_media = []
    await expect(generaEstudio(pedidoDelPanel())).rejects.toThrow(/Sincroniza/)
    expect(filaEstudio()).toMatchObject({ estado: 'error', error: expect.stringMatching(/Sincroniza la cuenta.*No se ha cobrado nada\.$/) })
    store.tablas.helm_estudio_contenido = []
    store.tablas.helm_ig_media = piezas(3).map(p => ({ ...p, publicado_en: hace(DIA) }))
    await expect(generaEstudio(pedidoDelPanel())).rejects.toThrow(/72 horas/)
    expect(claudePaso).not.toHaveBeenCalled()
  })

  it('sin perfil o sin clientId, ni fila', async () => {
    await expect(generaEstudio({ payload: {} })).rejects.toThrow(/clientId/)
    await expect(generaEstudio({ payload: { clientId: 'nadie', origen: 'auto' } })).rejects.toThrow(/no existe/)
    expect(store.tablas.helm_estudio_contenido).toEqual([])
  })
})

describe('generaEstudio · el de los lunes (origen auto)', () => {
  const auto = (extra = {}) => ({ payload: { clientId: 'c1', origen: 'auto', ...extra } })

  it('abre su propia fila y la rellena', async () => {
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(auto())
    expect(store.tablas.helm_estudio_contenido).toHaveLength(1)
    expect(filaEstudio()).toMatchObject({ client_id: 'c1', estado: 'listo' })
  })

  it('una fila que lleva más de 30 min trabajándose se da por perdida antes de abrir la nueva', async () => {
    store.tablas.helm_estudio_contenido = [{ id: 'colgado', client_id: 'c1', estado: 'en_curso', generado_en: hace(45 * 60_000), empezado_en: hace(45 * 60_000) }]
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(auto())
    expect(store.tablas.helm_estudio_contenido.find(f => f.id === 'colgado')).toMatchObject({ estado: 'error', error: expect.stringMatching(/a medias/) })
    expect(filaEstudio().estado).toBe('listo')
    expect(filaEstudio().empezado_en).toEqual(expect.any(String))   // la del lunes nace empezada
  })

  it('un pedido del panel que espera en la cola (sin empezar) no se da por perdido: el de los lunes no hace otro', async () => {
    store.tablas.helm_estudio_contenido = [{ id: 'pedido', client_id: 'c1', estado: 'en_curso', generado_en: hace(40 * 60_000), empezado_en: null }]
    await generaEstudio(auto())
    expect(claudePaso).not.toHaveBeenCalled()
    expect(store.tablas.helm_estudio_contenido).toEqual([expect.objectContaining({ id: 'pedido', estado: 'en_curso' })])
  })

  it('si alguien acaba de pedir uno (fila en curso reciente), el de los lunes no hace otro', async () => {
    store.tablas.helm_estudio_contenido = [{ id: 'pedido', client_id: 'c1', estado: 'en_curso', generado_en: hace(60_000) }]
    await generaEstudio(auto())
    expect(claudePaso).not.toHaveBeenCalled()
    expect(store.tablas.helm_estudio_contenido).toHaveLength(1)
    expect(store.tablas.helm_estudio_contenido[0].estado).toBe('en_curso')
  })

  it('si las métricas no se han sincronizado hoy, sincroniza el perfil antes (con su foto de seguidores)', async () => {
    store.tablas.user_integrations[0].config.lastSyncAt = hace(DIA)
    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(auto())
    expect(store.escrito.find(w => w.tabla === 'helm_ig_seguidores')?.filas).toEqual([{ client_id: 'c1', dia: diaMadrid(), seguidores: 1560 }])
    expect(filaEstudio().estado).toBe('listo')
    expect(filaEstudio().datos.cuenta.seguidores).toBe(1560)
  })

  it('si no se puede sincronizar, se reprograma en 20 minutos sin abrir fila; a la segunda, sale con lo que hay', async () => {
    store.tablas.user_integrations[0].config.lastSyncAt = hace(DIA)
    ig.falla = 'Meta da 503'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await generaEstudio(auto())
    expect(claudePaso).not.toHaveBeenCalled()
    expect(store.tablas.helm_estudio_contenido).toEqual([])
    const otro = store.escrito.find(w => w.tabla === 'agent_jobs').filas[0]
    expect(otro).toMatchObject({ tipo: 'estudio-contenido', payload: { clientId: 'c1', origen: 'auto', reintento: true }, max_intentos: 1 })
    expect(otro.clave).toMatch(/^estudio-contenido:c1:\d{4}-\d{2}-\d{2}:reintento$/)
    expect(Date.parse(otro.correr_tras) - Date.now()).toBeGreaterThan(19 * 60_000)

    claudePaso.mockResolvedValueOnce(respuesta(estudioBueno()))
    await generaEstudio(auto({ reintento: true }))
    expect(filaEstudio().estado).toBe('listo')
    log.mockRestore()
  })
})

describe('el estudio de los lunes: el temporizador', () => {
  beforeEach(() => {
    store.tablas.clients = [
      { id: 'c1', agencia_id: 'casa' }, { id: 'c2', agencia_id: 'cliente' }, { id: 'c3', agencia_id: 'casa' }, { id: 'c4', agencia_id: 'casa' },
    ]
    store.tablas.agencias = [{ id: 'casa', sin_cobro: true }, { id: 'cliente', sin_cobro: false }]
    store.tablas.user_integrations = [
      { client_id: 'c1', service: 'instagram', member_id: null, enabled: true, config: { token: 't' } },
      { client_id: 'c2', service: 'instagram', member_id: null, enabled: true, config: { token: 't' } },
      { client_id: 'c3', service: 'instagram', member_id: null, enabled: true, config: {} },          // sin token
      { client_id: 'c4', service: 'instagram', member_id: null, enabled: true, config: { token: 't' } },
    ]
    store.tablas.helm_permissions = [{ client_id: 'c4', sections: { metricas: false } }]
  })
  const encolados = () => store.escrito.filter(w => w.tabla === 'agent_jobs').flatMap(w => w.filas)

  it('el lunes desde las 6:30 de Madrid: uno por perfil de la casa con Instagram y el Informe encendido, origen auto', async () => {
    await miraEstudiosContenido(new Date('2026-10-26T05:45:00Z'))   // lunes, 6:45 en Madrid
    expect(encolados()).toEqual([{
      tipo: 'estudio-contenido', payload: { clientId: 'c1', origen: 'auto' }, clave: 'estudio-contenido:c1:2026-10-26',
      estado: 'pendiente', max_intentos: 1, correr_tras: expect.any(String),
    }])
    // El mismo lunes, mirado otra vez, no repite.
    store.escrito = []
    await miraEstudiosContenido(new Date('2026-10-26T10:00:00Z'))
    expect(encolados()).toEqual([])
  })

  it('ni antes de las 6:30, ni entre 7:55 y 8:40, ni otro día', async () => {
    await miraEstudiosContenido(new Date('2026-11-02T05:15:00Z'))   // lunes, 6:15
    await miraEstudiosContenido(new Date('2026-11-02T07:00:00Z'))   // lunes, 8:00
    await miraEstudiosContenido(new Date('2026-11-03T09:00:00Z'))   // martes
    expect(encolados()).toEqual([])
    await miraEstudiosContenido(new Date('2026-11-02T07:41:00Z'))   // lunes, 8:41
    expect(encolados().map(j => j.clave)).toEqual(['estudio-contenido:c1:2026-11-02'])
  })

  it('a demanda: origen panel, con la fila del pedido en el payload y en la clave, y un solo intento', async () => {
    await encolaEstudio('c2', { estudioId: 'fila-1' })
    expect(encolados()[0]).toMatchObject({
      tipo: 'estudio-contenido', payload: { clientId: 'c2', origen: 'panel', estudioId: 'fila-1' }, clave: 'estudio-contenido:fila-1', max_intentos: 1,
    })
  })
})

describe('la foto diaria de seguidores (api/instagram.js)', () => {
  const fotos = () => store.escrito.filter(w => w.tabla === 'helm_ig_seguidores').flatMap(w => w.filas)

  it('cada sincronización (también la del worker) guarda los seguidores del día de Madrid', async () => {
    const parte = await sincronizaMetricas({ payload: { clientId: 'c1' } })
    expect(parte).toMatchObject({ followers: 1560, followersFresco: true })
    expect(fotos()).toEqual([{ client_id: 'c1', dia: diaMadrid(), seguidores: 1560 }])
  })

  it('si getPerfil falla, el número es el de antes: no se apunta como foto de hoy', async () => {
    ig.perfil = null
    const parte = await sincronizar('c1')
    expect(parte).toMatchObject({ followers: 1551, followersFresco: false })
    expect(fotos()).toEqual([])
  })

  it('al pulsar «Sincronizar» en el panel', async () => {
    const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
    await instagramHandler({ method: 'POST', query: { action: 'sync' }, body: { clientId: 'c1' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(fotos()).toEqual([{ client_id: 'c1', dia: diaMadrid(), seguidores: 1560 }])
  })

  it('al conectar la cuenta (con token a mano o por Meta), la primera foto', async () => {
    const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, writeHead(c) { this.statusCode = c } }
    await instagramHandler({ method: 'POST', query: { action: 'link' }, body: { clientId: 'c1', token: 'x'.repeat(40) }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(fotos()).toHaveLength(1)
    await instagramHandler({ method: 'GET', query: { action: 'callback', code: 'abc', state: 'firmado' }, headers: { host: 'helm' } }, res)
    expect(res.statusCode).toBe(302)
    expect(fotos()).toHaveLength(2)
    // Por Meta, si el perfil no llega, no hay foto.
    ig.perfil = null
    await instagramHandler({ method: 'GET', query: { action: 'callback', code: 'abc', state: 'firmado' }, headers: { host: 'helm' } }, res)
    expect(fotos()).toHaveLength(2)
  })

  it('si la foto no se puede guardar, la sincronización sigue', async () => {
    store.falla.helm_ig_seguidores = 'sin tabla'
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(sincronizar('c1')).resolves.toMatchObject({ followersFresco: true })
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })
})

// ── Un estudio hecho fuera (Claude por el conector) ─────────────────────────
describe('importaEstudio · el estudio que escribe Claude por el conector', () => {
  it('con --prueba revisa y calcula, pero no escribe nada ni llama a Claude', async () => {
    const r = await importaEstudio({ clientId: 'c1', entrada: estudioBueno(), prueba: true })
    expect(r.errores).toEqual([])
    expect(r.guardado).toBe(false)
    expect(r.datos.cuenta.piezas).toBe(20)
    expect(store.escrito).toEqual([])
    expect(claudePaso).not.toHaveBeenCalled()
  })

  it('lo guarda «listo» y sin coste, con los números de HELM y el actual del código; lo confirmado a la memoria y avisa', async () => {
    const r = await importaEstudio({ clientId: 'c1', entrada: estudioBueno() })
    expect(r.guardado).toBe(true)
    const fila = filaEstudio()
    expect(fila).toMatchObject({ id: r.id, client_id: 'c1', estado: 'listo', modelo: 'claude (conector)', tokens: 0, coste_usd: 0 })
    expect(fila.datos.cuenta.piezas).toBe(20)
    // El «actual» que trae el JSON no vale: lo pone el código; lo inventado se cae.
    expect(fila.estudio.objetivos.map(o => o.metrica)).not.toContain('felicidad')
    expect(fila.estudio.objetivos.every(o => o.actual !== 99999)).toBe(true)
    expect(store.tablas.agent_memory.some(n => n.agente === 'estratega' && n.tipo === 'aprendido')).toBe(true)
    expect(notificar).toHaveBeenCalledWith(expect.anything(), 'c1', expect.objectContaining({ destino: 'metricas' }))
    expect(claudePaso).not.toHaveBeenCalled()
  })

  it('si no pasa la revisión (sin plan de 4 semanas), no guarda nada y dice por qué', async () => {
    const r = await importaEstudio({ clientId: 'c1', entrada: estudioBueno({ plan: [semana(1)] }) })
    expect(r.guardado).toBe(false)
    expect(r.errores.join(' ')).toMatch(/4 semanas/)
    expect(store.tablas.helm_estudio_contenido).toEqual([])
  })

  it('sin piezas sincronizadas no hay estudio que guardar', async () => {
    store.tablas.helm_ig_media = []
    await expect(importaEstudio({ clientId: 'c1', entrada: estudioBueno() })).rejects.toThrow(/sincronizadas/)
  })
})
