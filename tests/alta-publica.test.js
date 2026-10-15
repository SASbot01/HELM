// El alta pública de HELM (api/onboarding.js · alta-publica-nueva, alta-publica,
// altas, alta-convertir, alta-descartar): helm.s4sf.net/alta sin token, para un
// negocio que aún no tiene perfil. Se comprueba la trampa para bots, la
// validación del contacto, el límite por IP, que la llave solo abra SU alta y
// no valga como sesión, que la agencia se entere una sola vez, y la bandeja:
// quién ve qué, convertir (una vez, en la agencia del alta) y descartar.
// Sin red ni base: Supabase y Telegram van simulados; notificar es el de verdad.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-el-alta-publica-0123456789'
process.env.HELM_TELEGRAM_TOKEN = 'token-del-bot-de-agencia'
delete process.env.HELM_PUBLIC_URL
delete process.env.HELM_ALTA_AGENCIA
delete process.env.HELM_TELEGRAM_AGENCIAS

const AG = {
  silvestre: 'a0000000-0000-4000-8000-000000000001',
  otra: 'a0000000-0000-4000-8000-000000000002',
}
const SA = {
  silvestre: 'b0000000-0000-4000-8000-000000000001',
  otra: 'b0000000-0000-4000-8000-000000000002',
  plataforma: 'b0000000-0000-4000-8000-000000000003',
}
const PERFIL = {
  casa: 'c0000000-0000-4000-8000-0000000000e1',
  ajeno: 'c0000000-0000-4000-8000-0000000000e2',
}
const CHAT = { silvestre: 111, otra: 222 }
const NO_VALIDO = 'Este enlace ha caducado o no es válido. Pide uno nuevo a quien te lo envió.'
const RECOGIDA = 'Esta alta ya la ha recogido el equipo.'

// ── Base simulada ──────────────────────────────────────────────────────────
const db = {}
const tabla = (t) => (db[t] ||= [])
const copia = (x) => (x == null ? x : structuredClone(x))
const igualA = (a, b) => (a == null || b == null ? a == b : String(a) === String(b))
const ahoraIso = () => new Date().toISOString()
// Lo que pone la tabla al crear una fila, como en las migraciones.
const DEFECTOS = {
  helm_altas: () => ({
    id: crypto.randomUUID(), nombre: '', email: '', telefono: '', negocio: '', answers: {}, estado: 'borrador',
    client_id: null, origen: {}, ip_hash: '', acepta_privacidad_at: null, enviado_at: null,
    created_at: ahoraIso(), updated_at: ahoraIso(),
  }),
  helm_onboarding: () => ({ id: crypto.randomUUID(), status: 'draft', completed_at: null }),
}
const UNICAS = { clients: ['slug'] }

function consulta(t) {
  const filtros = []
  let op = 'select'
  let datos = null
  let opciones = {}
  let columnas = '*'
  let devolver = false
  const pasa = (f) => filtros.every(fn => fn(f))
  // Solo las columnas pedidas, como PostgREST (lo que no se pide no sale).
  const proyecta = (f) => {
    if (columnas.includes('superadmins(')) return { ...f, superadmins: tabla('superadmins').find(s => s.id === f.superadmin_id) || null }
    if (columnas === '*') return f
    return Object.fromEntries(columnas.split(',').map(c => c.trim()).map(c => [c, f[c] ?? null]))
  }
  async function ejecuta(una) {
    // Un salto de cola, como la red: dos peticiones a la vez se intercalan.
    await Promise.resolve()
    const filas = tabla(t)
    let data = null
    if (op === 'select') data = filas.filter(pasa).map(f => copia(proyecta(f)))
    else if (op === 'insert') {
      const nuevas = [datos].flat().map(d => ({ ...(DEFECTOS[t]?.() || { id: crypto.randomUUID() }), ...copia(d) }))
      for (const n of nuevas) {
        for (const col of UNICAS[t] || []) {
          if (filas.some(f => f[col] === n[col])) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${t}_${col}_key"` } }
        }
      }
      filas.push(...nuevas)
      data = devolver ? nuevas.map(f => copia(proyecta(f))) : null
    } else if (op === 'update') {
      const tocadas = filas.filter(pasa)
      for (const f of tocadas) Object.assign(f, copia(datos))
      data = devolver ? tocadas.map(f => copia(proyecta(f))) : null
    } else if (op === 'upsert') {
      const claves = (opciones.onConflict || 'id').split(',').map(c => c.trim())
      for (const d of [datos].flat()) {
        const f = filas.find(x => claves.every(k => igualA(x[k], d[k])))
        if (f) { if (!opciones.ignoreDuplicates) Object.assign(f, copia(d)) }
        else filas.push({ ...(DEFECTOS[t]?.() || {}), ...copia(d) })
      }
    } else if (op === 'delete') {
      const borradas = filas.filter(pasa)
      db[t] = filas.filter(f => !pasa(f))
      data = devolver ? borradas.map(f => copia(proyecta(f))) : null
    }
    if (una) {
      const lista = Array.isArray(data) ? data : (data == null ? [] : [data])
      if (lista.length > 1) return { data: null, error: { message: 'JSON object requested, multiple rows returned' } }
      data = lista[0] ?? null
    }
    return { data, error: null }
  }
  const q = {
    select(c = '*') { columnas = c; if (op !== 'select') devolver = true; return q },
    eq(c, v) { filtros.push(f => igualA(f[c], v)); return q },
    in(c, vs) { filtros.push(f => vs.some(v => igualA(f[c], v))); return q },
    is(c, v) { filtros.push(f => (v === null ? f[c] == null : f[c] === v)); return q },
    neq(c, v) { filtros.push(f => !igualA(f[c], v)); return q },
    not(c) { filtros.push(f => f[c] != null); return q },
    gte(c, v) { filtros.push(f => f[c] != null && String(f[c]) >= String(v)); return q },
    lt(c, v) { filtros.push(f => f[c] != null && String(f[c]) < String(v)); return q },
    order() { return q },
    limit() { return q },
    insert(d) { op = 'insert'; datos = d; return q },
    update(d) { op = 'update'; datos = d; return q },
    upsert(d, o) { op = 'upsert'; datos = d; opciones = o || {}; return q },
    delete() { op = 'delete'; return q },
    maybeSingle: () => ejecuta(true),
    single: () => ejecuta(true),
    then: (ok, ko) => ejecuta(false).then(ok, ko),
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))

// Telegram: lo que sale por el bot se apunta aquí en vez de mandarse.
const enviados = []
vi.mock('../api/_lib/telegram.js', async (original) => ({
  ...(await original()),
  enviarMensaje: async (_token, chatId, texto) => { enviados.push({ chatId, texto }); return 1 },
}))

const { default: onboarding, redDeIp } = await import('../api/onboarding.js')
const { signJwt, verifyJwt, validateAuth } = await import('../api/_lib/auth.js')
const { tablasDelPerfil } = await import('../api/perfiles.js')
const { PRIVACIDAD_VERSION } = await import('../src/pages/altaPublica.js')
const { DEFAULT_STAGES } = await import('../src/helm/perfilNuevo.js')

function reinicia() {
  for (const k of Object.keys(db)) delete db[k]
  // Los topes por agencia y hora viven en memoria mientras dura el proceso:
  // con agencias nuevas en cada prueba, lo de una no cuenta en la siguiente.
  // (Y perfiles y administradores nuevos: lo que el servidor recuerda de cada
  // uno, como su agencia, tampoco.)
  for (const ids of [AG, SA, PERFIL]) for (const k of Object.keys(ids)) ids[k] = crypto.randomUUID()
  db.agencias = [
    { id: AG.silvestre, nombre: 'Silvestre AI', slug: 'silvestreai', perfil_casa_id: PERFIL.casa },
    { id: AG.otra, nombre: 'Otra Agencia', slug: 'otra', perfil_casa_id: null },
  ]
  db.clients = [
    { id: PERFIL.casa, slug: 'silvestre', name: 'Silvestre', agencia_id: AG.silvestre, active: true },
    { id: PERFIL.ajeno, slug: 'ajeno', name: 'Ajeno', agencia_id: AG.otra, active: true },
  ]
  db.superadmins = [
    { id: SA.silvestre, active: true, agencia_id: AG.silvestre, plataforma: false },
    { id: SA.otra, active: true, agencia_id: AG.otra, plataforma: false },
    { id: SA.plataforma, active: true, agencia_id: AG.silvestre, plataforma: true },
  ]
  db.helm_telegram_vinculos = [
    { superadmin_id: SA.silvestre, agencia_id: AG.silvestre, tg_chat_id: CHAT.silvestre },
    { superadmin_id: SA.otra, agencia_id: AG.otra, tg_chat_id: CHAT.otra },
  ]
  enviados.length = 0
}
beforeEach(reinicia)

// ── Peticiones ─────────────────────────────────────────────────────────────
function respuesta() {
  return {
    statusCode: 0, body: null, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
  }
}
let n = 0
const otraIp = () => { n++; return `10.${20 + Math.floor(n / 250)}.${n % 250}.1` }
async function llama({ method = 'POST', action, query = {}, body, token, ip }) {
  const res = respuesta()
  const headers = { 'x-forwarded-for': ip || otraIp() }
  if (token) headers.authorization = `Bearer ${token}`
  await onboarding({ method, query: { action, ...query }, body, headers, socket: {} }, res)
  return res
}

const CONTACTO = { nombre: '  Ana   Pérez ', email: ' Ana.Perez@Example.com ', telefono: '+34 600 11 22 33', acepta: true, website: '' }
const nueva = (extra = {}, ip) => llama({ action: 'alta-publica-nueva', body: { ...CONTACTO, ...extra }, ip })
const ver = (t) => llama({ method: 'GET', action: 'alta-publica', query: { t } })
const guarda = (t, answers, enviar = false) => llama({ action: 'alta-publica', body: { t, answers, ...(enviar ? { enviar: true } : {}) } })
const lista = (token) => llama({ method: 'GET', action: 'altas', token })
const convierte = (altaId, token) => llama({ action: 'alta-convertir', body: { altaId }, token })
const descarta = (altaId, token) => llama({ action: 'alta-descartar', body: { altaId }, token })
const agenciaDe = (a) => llama({ method: 'GET', action: 'alta-publica-agencia', query: a === undefined ? {} : { a } })
const borra = (t) => llama({ action: 'alta-publica-borrar', body: { t } })
const haceDias = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString()

const sesion = (sub) => signJwt({ sub, role: 'superadmin', superadmin: true })
const sesionCliente = () => signJwt({ sub: 'u-1', clientId: PERFIL.casa, role: 'user' })
const altaDe = async (t) => {
  const { altaId } = await verifyJwt(t)
  return tabla('helm_altas').find(a => a.id === altaId)
}

async function empieza(extra) {
  const r = await nueva(extra)
  expect(r.statusCode).toBe(200)
  return { t: r.body.t, id: (await verifyJwt(r.body.t)).altaId }
}
async function enviada(answers = { nombre: 'Estudio Pilates Norte', sector: 'Pilates' }, extra) {
  const alta = await empieza(extra)
  const r = await guarda(alta.t, answers, true)
  expect(r.statusCode).toBe(200)
  return alta
}

// ── El primer paso ─────────────────────────────────────────────────────────
describe('alta-publica-nueva', () => {
  it('el campo trampa: contesta como si nada, con una llave que no abre nada, y no crea el alta', async () => {
    const r = await nueva({ website: 'https://spam.example' })
    expect(r.statusCode).toBe(200)
    expect(Object.keys(r.body).sort()).toEqual(['agencia', 'caduca', 't'])
    expect(r.body.t.split('.')).toHaveLength(3)
    expect(new Date(r.body.caduca).getTime()).toBeGreaterThan(Date.now())
    expect(tabla('helm_altas')).toHaveLength(0)
    await expect(verifyJwt(r.body.t)).rejects.toThrow()
    const abierta = await ver(r.body.t)
    expect(abierta.statusCode).toBe(401)
    expect(abierta.body.error).toBe(NO_VALIDO)
  })

  it('valida nombre, email, WhatsApp y la casilla de privacidad, diciendo qué campo falla', async () => {
    const casos = [
      [{ nombre: ' A ' }, 'nombre'],
      [{ nombre: 'x'.repeat(121) }, 'nombre'],
      [{ nombre: { a: 1 } }, 'nombre'],
      [{ email: 'no-es-un-email' }, 'email'],
      [{ email: `${'a'.repeat(195)}@b.com` }, 'email'],
      [{ email: '[pincha](http://malo.example)@b.com' }, 'email'],
      [{ telefono: '12345' }, 'telefono'],
      [{ telefono: '1'.repeat(21) }, 'telefono'],
      [{ telefono: 'llámame mañana' }, 'telefono'],
      [{ telefono: undefined }, 'telefono'],
      [{ acepta: undefined }, 'acepta'],
      [{ acepta: 'true' }, 'acepta'],
    ]
    for (const [extra, campo] of casos) {
      const r = await nueva(extra)
      expect(r.statusCode, JSON.stringify(extra).slice(0, 60)).toBe(400)
      expect(r.body.campo).toBe(campo)
      expect(r.body.error).toBeTruthy()
    }
    expect(tabla('helm_altas')).toHaveLength(0)
  })

  it('crea el alta en la agencia por defecto, con la huella de la IP (nunca la IP) y una llave de 30 días', async () => {
    const r = await nueva({
      origen: { utm_source: 'instagram', utm_campaign: 'c'.repeat(300), inventada: 'no', referrer: 'https://instagram.com/' },
      // Lo que mande el navegador para elegir alta, perfil o estado no cuenta.
      id: 'a-mano', client_id: PERFIL.ajeno, estado: 'convertida',
    }, '203.0.113.7')
    expect(r.statusCode).toBe(200)
    const [fila] = tabla('helm_altas')
    expect(fila).toMatchObject({
      agencia_id: AG.silvestre, nombre: 'Ana Pérez', email: 'ana.perez@example.com', telefono: '+34 600 11 22 33',
      negocio: '', answers: {}, estado: 'borrador', client_id: null, enviado_at: null,
      origen: { utm_source: 'instagram', utm_campaign: 'c'.repeat(200), referrer: 'https://instagram.com/' },
    })
    expect(fila.id).not.toBe('a-mano')
    expect(fila.acepta_privacidad_at).toBeTruthy()
    expect(fila.ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(fila)).not.toContain('203.0.113.7')

    const p = await verifyJwt(r.body.t)
    expect(p).toMatchObject({ kind: 'alta-publica', altaId: fila.id })
    expect(p.exp - p.iat).toBe(60 * 60 * 24 * 30)
    const dias = (new Date(r.body.caduca) - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThanOrEqual(30)

    // La misma IP da la misma huella; otra, otra.
    await nueva({}, '203.0.113.7')
    await nueva({}, '198.51.100.1')
    const huellas = tabla('helm_altas').map(a => a.ip_hash)
    expect(huellas[1]).toBe(huellas[0])
    expect(huellas[2]).not.toBe(huellas[0])
  })

  it('?a=<slug> la manda a esa agencia; un slug que no existe, a la de siempre', async () => {
    await nueva({ agencia: 'otra' })
    await nueva({ agencia: 'no-existe' })
    await nueva({ agencia: '../../silvestreai' })
    expect(tabla('helm_altas').map(a => a.agencia_id)).toEqual([AG.otra, AG.silvestre, AG.silvestre])
  })

  it('la de siempre se puede cambiar con HELM_ALTA_AGENCIA', async () => {
    process.env.HELM_ALTA_AGENCIA = 'otra'
    try {
      await nueva()
      expect(tabla('helm_altas')[0].agencia_id).toBe(AG.otra)
    } finally {
      delete process.env.HELM_ALTA_AGENCIA
    }
  })

  it('límite por IP: 5 altas nuevas por hora; los datos mal escritos no gastan intentos', async () => {
    const ip = '192.0.2.55'
    for (let i = 0; i < 3; i++) expect((await nueva({ email: 'mal' }, ip)).statusCode).toBe(400)
    for (let i = 0; i < 5; i++) expect((await nueva({}, ip)).statusCode).toBe(200)
    const sexta = await nueva({}, ip)
    expect(sexta.statusCode).toBe(429)
    expect(sexta.body.retryAfter).toBeGreaterThan(0)
    expect(sexta.headers['retry-after']).toBeTruthy()
    expect(tabla('helm_altas')).toHaveLength(5)
    expect((await nueva({}, '192.0.2.56')).statusCode).toBe(200)
  })
})

// ── La llave ───────────────────────────────────────────────────────────────
describe('la llave del alta pública', () => {
  it('no vale como sesión del panel, ni como enlace de alta de un perfil', async () => {
    const { t } = await empieza()
    await expect(validateAuth({ headers: { authorization: `Bearer ${t}` } })).rejects.toMatchObject({ statusCode: 401 })
    expect((await lista(t)).statusCode).toBe(401)
    expect((await convierte((await verifyJwt(t)).altaId, t)).statusCode).toBe(401)
    expect((await llama({ action: 'enlace', body: { clientId: PERFIL.casa }, token: t })).statusCode).toBe(401)
    const comoEnlace = await llama({ method: 'GET', action: 'alta', query: { t } })
    expect(comoEnlace.statusCode).toBe(401)
    expect(comoEnlace.body.error).toBe(NO_VALIDO)
  })

  it('solo abre SU alta: otros tokens, caducada o manipulada, nada, y con el mismo mensaje que el enlace', async () => {
    const mia = await empieza()
    const otra = await empieza()
    const [h, , s] = mia.t.split('.')
    const cuerpoFalso = Buffer.from(JSON.stringify({ kind: 'alta-publica', altaId: otra.id, exp: 9e9 })).toString('base64url')
    const llaves = [
      await signJwt({ kind: 'alta', clientId: PERFIL.casa }),
      await signJwt({ kind: 'community', clientId: PERFIL.casa }),
      await sesion(SA.silvestre),
      await signJwt({ kind: 'alta-publica', altaId: mia.id }, { expiresIn: -60 }),
      await signJwt({ kind: 'alta-publica', altaId: 'no-es-un-uuid' }),
      await signJwt({ kind: 'alta-publica', altaId: crypto.randomUUID() }),
      `${h}.${cuerpoFalso}.${s}`,
      '', 'basura',
    ]
    for (const t of llaves) {
      const r = await ver(t)
      expect(r.statusCode, t.slice(0, 30)).toBe(401)
      expect(r.body.error).toBe(NO_VALIDO)
      expect((await guarda(t, { nombre: 'Colado' })).statusCode).toBe(401)
    }
    expect(tabla('helm_altas').every(a => !a.answers.nombre)).toBe(true)
  })
})

// ── Guardar y enviar ───────────────────────────────────────────────────────
describe('alta-publica (guardar y enviar)', () => {
  it('abre su alta con la agencia y sus datos de contacto, en borrador', async () => {
    const { t } = await empieza()
    const r = await ver(t)
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({
      agencia: { nombre: 'Silvestre AI' },
      contacto: { nombre: 'Ana Pérez', email: 'ana.perez@example.com', telefono: '+34 600 11 22 33' },
      answers: {},
      estado: 'draft',
      enviado_at: null,
      recogida: false,
    })
  })

  it('guarda validando como el modo con token, sin tocar el estado ni avisar', async () => {
    const { t } = await empieza()
    const malas = await guarda(t, { inventada: 'x' })
    expect(malas.statusCode).toBe(400)
    expect(malas.body.campo).toBe('inventada')
    for (const answers of [undefined, null, 'x', []]) {
      expect((await guarda(t, answers)).statusCode).toBe(400)
    }

    const r = await guarda(t, { nombre: ' Estudio Pilates Norte ', sector: '  ', camara: '7', servicios: [{ nombre: 'Bono 10', precio: '' }, {}] })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, estado: 'draft', enviado_at: null })
    const fila = await altaDe(t)
    expect(fila.answers).toEqual({ nombre: ' Estudio Pilates Norte ', camara: 7, servicios: [{ nombre: 'Bono 10' }] })
    expect(fila).toMatchObject({ estado: 'borrador', negocio: '', enviado_at: null })
    expect(tabla('helm_notificaciones')).toHaveLength(0)
    expect(enviados).toHaveLength(0)
    expect((await ver(t)).body.answers.camara).toBe(7)
  })

  it('no se puede enviar vacío', async () => {
    const { t } = await empieza()
    const r = await guarda(t, { nombre: '   ' }, true)
    expect(r.statusCode).toBe(400)
    expect((await altaDe(t)).estado).toBe('borrador')
    expect(enviados).toHaveLength(0)
  })

  it('al enviarla: enviada, con el negocio, y la agencia se entera UNA vez (campana de su perfil de la casa y su bot)', async () => {
    const { t, id } = await empieza()
    const uno = await guarda(t, { nombre: ' Estudio Pilates Norte ' }, true)
    expect(uno.statusCode).toBe(200)
    expect(uno.body).toMatchObject({ ok: true, estado: 'completed' })
    expect(uno.body.enviado_at).toBeTruthy()
    const fila = await altaDe(t)
    expect(fila).toMatchObject({ estado: 'enviada', negocio: 'Estudio Pilates Norte', enviado_at: uno.body.enviado_at })

    const [aviso] = tabla('helm_notificaciones')
    expect(tabla('helm_notificaciones')).toHaveLength(1)
    expect(aviso).toMatchObject({
      client_id: PERFIL.casa, tipo: 'lead', nivel: 'info',
      titulo: 'Alta nueva en HELM · Estudio Pilates Norte',
      destino: 'https://helm.s4sf.net/admin', clave: `alta-publica:${id}`,
    })
    // Sin datos de contacto: la campana del perfil de la casa la ve todo su
    // equipo, también quien no puede abrir la bandeja.
    expect(aviso.cuerpo).toContain('Altas recibidas')
    for (const dato of ['Ana', 'Pérez', 'ana.perez', '600 11 22 33']) {
      expect(aviso.cuerpo).not.toContain(dato)
      expect(aviso.titulo).not.toContain(dato)
      expect(enviados[0].texto).not.toContain(dato)
    }
    // Por el bot de agencia, a los de SU agencia y con su perfil de la casa delante.
    expect(enviados.map(e => e.chatId)).toEqual([CHAT.silvestre])
    expect(enviados[0].texto.startsWith('🔔 \\[Silvestre] *Alta nueva en HELM · Estudio Pilates Norte*')).toBe(true)

    // Lo reenvía corregido: se guarda, el negocio se pone al día, y no se avisa otra vez.
    const dos = await guarda(t, { nombre: 'Pilates Norte' }, true)
    expect(dos.body).toMatchObject({ ok: true, estado: 'completed', enviado_at: uno.body.enviado_at })
    expect(await altaDe(t)).toMatchObject({ estado: 'enviada', negocio: 'Pilates Norte' })
    // Y retocarla sin enviar no la devuelve a borrador.
    const tres = await guarda(t, { nombre: 'Pilates Norte', sector: 'Pilates' })
    expect(tres.body).toMatchObject({ ok: true, estado: 'completed', enviado_at: uno.body.enviado_at })
    expect((await altaDe(t)).estado).toBe('enviada')
    expect(tabla('helm_notificaciones')).toHaveLength(1)
    expect(enviados).toHaveLength(1)
    expect((await ver(t)).body).toMatchObject({ estado: 'completed', enviado_at: uno.body.enviado_at })
  })

  it('dos envíos a la vez avisan una sola vez', async () => {
    const { t } = await empieza()
    const [a, b] = await Promise.all([guarda(t, { nombre: 'Uno' }, true), guarda(t, { nombre: 'Dos' }, true)])
    expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    expect(a.body.estado).toBe('completed')
    expect(b.body.estado).toBe('completed')
    expect(tabla('helm_notificaciones')).toHaveLength(1)
    expect(enviados).toHaveLength(1)
  })

  it('sin perfil de la casa, el aviso va solo por el bot de la agencia, con su nombre', async () => {
    process.env.HELM_TELEGRAM_AGENCIAS = 'silvestreai,otra'
    try {
      await enviada({ nombre: 'Taller Mecánico Ruiz' }, { agencia: 'otra' })
      expect(tabla('helm_notificaciones')).toHaveLength(0)
      expect(enviados.map(e => e.chatId)).toEqual([CHAT.otra])
      expect(enviados[0].texto.startsWith('🔔 \\[Otra Agencia] *Alta nueva en HELM · Taller Mecánico Ruiz*')).toBe(true)
    } finally {
      delete process.env.HELM_TELEGRAM_AGENCIAS
    }
  })

  it('lo que escribe quien la rellena no arma enlaces en el aviso de Telegram', async () => {
    await enviada({ nombre: '[Oferta](http://malo.example) *gratis*' }, { nombre: 'Ana [pincha](http://malo.example)' })
    const [{ texto }] = enviados
    expect(texto).not.toContain('[Oferta]')
    expect(texto).not.toContain('[pincha]')
    expect(texto).not.toContain('*gratis*')
  })

  it('ni con una URL, un dominio o una @mención a pelo, que Telegram enlaza sin Markdown', async () => {
    await enviada({ nombre: 'Pago pendiente https://ev.il/x en www.ev.il o @soporte_falso' })
    const [{ texto }] = enviados
    expect(texto).toContain('Pago pendiente')
    expect(texto).not.toMatch(/https?:\/\//)
    expect(texto).not.toMatch(/[a-z0-9]\.[a-z]{2}/i)
    expect(texto).not.toContain('@')
    expect(texto).not.toContain('soporte_falso')
    const [aviso] = tabla('helm_notificaciones')
    expect(aviso.titulo).not.toContain('ev.il')
  })

  it('cuando el equipo la recoge (convertida o descartada), ya no se puede tocar: 409', async () => {
    const convertida = await enviada()
    expect((await convierte(convertida.id, await sesion(SA.silvestre))).statusCode).toBe(200)
    const descartada = await enviada()
    expect((await descarta(descartada.id, await sesion(SA.silvestre))).statusCode).toBe(200)
    for (const { t } of [convertida, descartada]) {
      const r = await guarda(t, { nombre: 'Otra cosa' })
      expect(r.statusCode).toBe(409)
      expect(r.body.error).toBe(RECOGIDA)
      expect((await guarda(t, { nombre: 'Otra cosa' }, true)).statusCode).toBe(409)
      expect((await altaDe(t)).answers.nombre).toBeUndefined()
      // Al abrirla, la página ya sabe que está recogida: no ofrece seguir
      // escribiendo algo que no se guardaría.
      expect((await ver(t)).body).toMatchObject({ estado: 'completed', recogida: true })
    }
  })
})

// ── La bandeja ─────────────────────────────────────────────────────────────
describe('altas (la bandeja)', () => {
  it('sin sesión 401; un acceso de cliente 403; cada agencia ve las suyas y la plataforma todas', async () => {
    await enviada({ nombre: 'De Silvestre' })
    await empieza()
    await enviada({ nombre: 'De la otra' }, { agencia: 'otra' })

    expect((await lista()).statusCode).toBe(401)
    expect((await lista(await sesionCliente())).statusCode).toBe(403)

    const suyas = await lista(await sesion(SA.silvestre))
    expect(suyas.statusCode).toBe(200)
    expect(suyas.body.altas).toHaveLength(2)
    expect(suyas.body.altas.every(a => a.agencia.id === AG.silvestre)).toBe(true)
    const una = suyas.body.altas.find(a => a.estado === 'enviada')
    expect(una).toMatchObject({
      agencia: { id: AG.silvestre, nombre: 'Silvestre AI', slug: 'silvestreai' },
      nombre: 'Ana Pérez', email: 'ana.perez@example.com', telefono: '+34 600 11 22 33',
      negocio: 'De Silvestre', estado: 'enviada', client_id: null, answers: { nombre: 'De Silvestre' },
    })
    expect(una.enviado_at).toBeTruthy()
    expect(una.created_at).toBeTruthy()
    expect(una).not.toHaveProperty('ip_hash')
    expect(una).not.toHaveProperty('agencia_id')

    const deLaOtra = await lista(await sesion(SA.otra))
    expect(deLaOtra.body.altas.map(a => a.negocio)).toEqual(['De la otra'])
    const todas = await lista(await sesion(SA.plataforma))
    expect(todas.body.altas).toHaveLength(3)
  })

  it('convertir crea el perfil en la agencia del alta, le copia las respuestas y la marca convertida', async () => {
    const answers = { nombre: 'Estudio Pilates Norte', sector: 'Pilates', camara: 7 }
    const { id, t } = await enviada(answers)
    const enviadoAt = (await altaDe(t)).enviado_at
    // La plataforma también puede, y el perfil nace en la agencia del ALTA, no en la suya.
    const r = await convierte(id, await sesion(SA.plataforma))
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ clientId: expect.any(String), slug: 'estudio-pilates-norte' })

    const perfil = tabla('clients').find(c => c.id === r.body.clientId)
    expect(perfil).toMatchObject({
      slug: 'estudio-pilates-norte', name: 'Estudio Pilates Norte', agencia_id: AG.silvestre,
      client_type: 'growth', active: true, is_demo: false,
    })
    expect(tabla('helm_onboarding')).toEqual([expect.objectContaining({
      client_id: r.body.clientId, form: 'alta', answers, status: 'completed', completed_at: enviadoAt,
    })])
    expect(await altaDe(t)).toMatchObject({ estado: 'convertida', client_id: r.body.clientId })
    expect(tabla('audit_logs')).toEqual([expect.objectContaining({ action: 'alta.convertida', client_id: r.body.clientId, resource_id: id })])
  })

  it('es idempotente: convertirla otra vez devuelve el mismo perfil y no pisa lo que el equipo ya tocó', async () => {
    const { id } = await enviada()
    const token = await sesion(SA.silvestre)
    const uno = await convierte(id, token)
    const perfiles = tabla('clients').length
    tabla('helm_onboarding')[0].answers = { nombre: 'Editado por el equipo' }
    const dos = await convierte(id, token)
    expect(dos.statusCode).toBe(200)
    expect(dos.body).toEqual(uno.body)
    expect(tabla('clients')).toHaveLength(perfiles)
    expect(tabla('helm_onboarding')).toHaveLength(1)
    expect(tabla('helm_onboarding')[0].answers).toEqual({ nombre: 'Editado por el equipo' })
  })

  it('dos «Crear perfil» a la vez dejan un solo perfil', async () => {
    const { id } = await enviada()
    const token = await sesion(SA.silvestre)
    const antes = tabla('clients').length
    const [a, b] = await Promise.all([convierte(id, token), convierte(id, token)])
    expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    expect(b.body.clientId).toBe(a.body.clientId)
    expect(tabla('clients')).toHaveLength(antes + 1)
    expect(tabla('helm_onboarding')).toHaveLength(1)
  })

  it('otra agencia no la ve ni la convierte ni la descarta (404); un acceso de cliente tampoco (403)', async () => {
    const { id, t } = await enviada()
    const antes = tabla('clients').length
    for (const r of [await convierte(id, await sesion(SA.otra)), await descarta(id, await sesion(SA.otra))]) {
      expect(r.statusCode).toBe(404)
      expect(r.body.error).toBe('Esa alta no existe.')
    }
    expect((await convierte(id, await sesionCliente())).statusCode).toBe(403)
    expect((await convierte(id)).statusCode).toBe(401)
    expect((await convierte('no-es-un-uuid', await sesion(SA.silvestre))).statusCode).toBe(404)
    expect(tabla('clients')).toHaveLength(antes)
    expect(await altaDe(t)).toMatchObject({ estado: 'enviada', client_id: null })
  })

  it('el nombre del perfil sale de la respuesta 1, o del negocio, o del contacto; y su URL no choca', async () => {
    const token = await sesion(SA.silvestre)
    // «Silvestre» ya es un perfil y «Alta» es una ruta de la web.
    const casos = [
      [{ nombre: 'Silvestre' }, 'silvestre-2', 'Silvestre'],
      [{ nombre: 'Alta' }, 'alta-2', 'Alta'],
      [{ sector: 'Pilates' }, 'ana-perez', 'Ana Pérez'],
      [{ nombre: '🔥' }, 'negocio', '🔥'],
    ]
    for (const [answers, slug, name] of casos) {
      const { id } = await enviada(answers)
      const r = await convierte(id, token)
      expect(r.statusCode, slug).toBe(200)
      expect(r.body.slug).toBe(slug)
      expect(tabla('clients').find(c => c.id === r.body.clientId).name).toBe(name)
    }
  })

  it('se puede convertir un alta que aún no han enviado: el onboarding queda completado, sin fecha de envío', async () => {
    const { id } = await empieza()
    const r = await convierte(id, await sesion(SA.silvestre))
    expect(r.statusCode).toBe(200)
    expect(r.body.slug).toBe('ana-perez')
    expect(tabla('helm_onboarding')[0]).toMatchObject({ status: 'completed', completed_at: null, answers: {} })
  })

  it('descartar la marca descartada (una vez); con perfil ya no se puede', async () => {
    const token = await sesion(SA.silvestre)
    const { id, t } = await enviada()
    const r = await descarta(id, token)
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, estado: 'descartada' })
    expect((await altaDe(t)).estado).toBe('descartada')
    expect((await descarta(id, token)).statusCode).toBe(200)
    expect(tabla('audit_logs').filter(a => a.action === 'alta.descartada')).toHaveLength(1)

    const convertida = await enviada()
    await convierte(convertida.id, token)
    const tarde = await descarta(convertida.id, token)
    expect(tarde.statusCode).toBe(409)
    expect((await altaDe(convertida.t)).estado).toBe('convertida')
  })

  it('cada acción, con su método', async () => {
    const token = await sesion(SA.silvestre)
    expect((await llama({ method: 'GET', action: 'alta-publica-nueva' })).statusCode).toBe(405)
    expect((await llama({ method: 'POST', action: 'altas', token })).statusCode).toBe(405)
    expect((await llama({ method: 'GET', action: 'alta-convertir', token })).statusCode).toBe(405)
  })
})



// ── Lo que se arregló tras la revisión ─────────────────────────────────────
describe('a quién le llega, antes de pedir los datos', () => {
  it('alta-publica-agencia: la de ?a= si existe; si no, la de siempre, y lo dice', async () => {
    expect((await agenciaDe('otra')).body).toEqual({ agencia: { nombre: 'Otra Agencia', slug: 'otra' }, pedida: 'otra', encontrada: true })
    expect((await agenciaDe('OTRA')).body.agencia.slug).toBe('otra')
    expect((await agenciaDe('otraa')).body).toEqual({ agencia: { nombre: 'Silvestre AI', slug: 'silvestreai' }, pedida: 'otraa', encontrada: false })
    expect((await agenciaDe()).body).toEqual({ agencia: { nombre: 'Silvestre AI', slug: 'silvestreai' }, pedida: null, encontrada: true })
    // Lo que no tiene pinta de slug ni se busca: como si no viniera.
    expect((await agenciaDe('../admin')).body).toMatchObject({ pedida: null, encontrada: true })
    expect((await llama({ action: 'alta-publica-agencia', body: {} })).statusCode).toBe(405)
  })

  it('sin la agencia de siempre, 503 (no se piden datos que no podrían llegar a nadie)', async () => {
    db.agencias = db.agencias.filter(a => a.slug !== 'silvestreai')
    const r = await agenciaDe('no-existe')
    expect(r.statusCode).toBe(503)
    expect((await nueva({ agencia: 'no-existe' })).statusCode).toBe(503)
  })

  it('el alta nueva dice a qué agencia ha ido y guarda qué texto de privacidad se aceptó', async () => {
    const r = await nueva({ agencia: 'otra' })
    expect(r.body.agencia).toEqual({ nombre: 'Otra Agencia', slug: 'otra' })
    expect(tabla('helm_altas')[0]).toMatchObject({ agencia_id: AG.otra, acepta_privacidad_version: PRIVACIDAD_VERSION })
    expect(PRIVACIDAD_VERSION).toBeTruthy()
  })
})

describe('el WhatsApp: solo un teléfono', () => {
  it('con letras, barras o dos puntos no pasa, aunque lleve sus cifras', async () => {
    for (const telefono of ['600112233 https://ev.il/x', '600112233 ev.il', '+34 600 11 22 33 @yo', '600-112-233 ext 4']) {
      const r = await nueva({ telefono })
      expect(r.statusCode, telefono).toBe(400)
      expect(r.body.campo).toBe('telefono')
    }
    for (const telefono of ['+34 600 11 22 33', '(+34) 600-112-233', '0034.600.112.233']) {
      expect((await nueva({ telefono })).statusCode, telefono).toBe(200)
    }
  })
})

describe('el límite por red (IPv6)', () => {
  it('redDeIp: IPv4 tal cual; IPv6, su /64; IPv4 dentro de IPv6, la IPv4', () => {
    expect(redDeIp('198.51.100.9')).toBe('198.51.100.9')
    expect(redDeIp('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(redDeIp('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64')
    expect(redDeIp('2001:DB8:1:2:FFFF::8')).toBe('2001:db8:1:2::/64')
    expect(redDeIp('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(redDeIp('::1')).toBe('0:0:0:0::/64')
    expect(redDeIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(redDeIp('')).toBe('')
    expect(redDeIp(null)).toBe('')
  })

  it('cambiar de dirección dentro del mismo /64 no da más altas; otro /64, sí', async () => {
    const codigos = []
    for (let i = 1; i <= 8; i++) codigos.push((await nueva({}, `2001:db8:1:2::${i.toString(16)}`)).statusCode)
    expect(codigos).toEqual([200, 200, 200, 200, 200, 429, 429, 429])
    expect((await nueva({}, '2001:db8:1:3::1')).statusCode).toBe(200)
    // Y la huella es la de la red: las del mismo /64 se reconocen juntas.
    const [a, b, , , , c] = tabla('helm_altas').map(x => x.ip_hash)
    expect(b).toBe(a)
    expect(c).not.toBe(a)
  })

  it('tope por agencia y hora, venga de donde venga; las demás agencias, como siempre', async () => {
    const codigos = []
    for (let i = 0; i < 61; i++) codigos.push((await nueva({ agencia: 'otra' })).statusCode)
    expect(codigos.filter(c => c === 200)).toHaveLength(60)
    expect(codigos.at(-1)).toBe(429)
    const tope = await nueva({ agencia: 'otra' })
    expect(tope.body.retryAfter).toBeGreaterThan(0)
    expect((await nueva()).statusCode).toBe(200)
  })

  it('como mucho 20 avisos por agencia y hora: las demás llegan a la bandeja, sin aviso', async () => {
    for (let i = 0; i < 22; i++) await enviada({ nombre: `Negocio ${i}` })
    expect(tabla('helm_notificaciones')).toHaveLength(20)
    expect(tabla('helm_altas').filter(a => a.estado === 'enviada')).toHaveLength(22)
  })
})

describe('los datos de quien la rellena', () => {
  it('puede borrar su alta desde /alta: desaparece entera, sin dejar su IP en el registro', async () => {
    const { t, id } = await enviada()
    const r = await borra(t)
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true })
    expect(tabla('helm_altas').find(a => a.id === id)).toBeUndefined()
    const [registro] = tabla('audit_logs')
    expect(registro).toMatchObject({ action: 'alta.borrada', resource_id: id, ip_address: null, user_agent: null })
    // Ya no abre nada.
    expect((await ver(t)).statusCode).toBe(401)
    expect((await borra(t)).statusCode).toBe(401)
  })

  it('con otra llave, o ninguna, no borra nada', async () => {
    const { id } = await empieza()
    for (const t of [await signJwt({ kind: 'alta', clientId: PERFIL.casa }), await sesion(SA.silvestre), '', undefined]) {
      expect((await borra(t)).statusCode).toBe(401)
    }
    expect(tabla('helm_altas').find(a => a.id === id)).toBeTruthy()
    expect((await llama({ method: 'GET', action: 'alta-publica-borrar' })).statusCode).toBe(405)
  })

  it('con perfil ya no: se lo pide a la agencia (409 que la nombra)', async () => {
    const { t, id } = await enviada()
    await convierte(id, await sesion(SA.silvestre))
    const r = await borra(t)
    expect(r.statusCode).toBe(409)
    expect(r.body.error).toContain('Silvestre AI')
    expect(tabla('helm_altas').find(a => a.id === id)).toBeTruthy()
  })

  it('descartada, sí se puede borrar la fila que queda', async () => {
    const { t, id } = await enviada()
    await descarta(id, await sesion(SA.silvestre))
    expect((await borra(t)).statusCode).toBe(200)
    expect(tabla('helm_altas')).toHaveLength(0)
  })

  it('descartar la vacía: sin contacto, respuestas, origen ni huella', async () => {
    const { id, t } = await enviada({ nombre: 'Estudio Pilates Norte' }, { origen: { utm_source: 'ig' } })
    await descarta(id, await sesion(SA.silvestre))
    const fila = await altaDe(t)
    expect(fila).toMatchObject({ estado: 'descartada', nombre: '', email: '', telefono: '', negocio: '', ip_hash: '' })
    // (toMatchObject da por bueno cualquier objeto frente a {}: estos, a pelo.)
    expect(fila.answers).toEqual({})
    expect(fila.origen).toEqual({})
    const vista = (await ver(t)).body
    expect(vista).toMatchObject({ recogida: true, contacto: { nombre: '', email: '', telefono: '' } })
    expect(vista.answers).toEqual({})
  })

  it('convertirla vacía sus respuestas (ya están en el perfil) y guarda el contacto', async () => {
    const answers = { nombre: 'Estudio Pilates Norte', sector: 'Pilates' }
    const { id, t } = await enviada(answers)
    const r = await convierte(id, await sesion(SA.silvestre))
    expect(tabla('helm_onboarding')[0]).toMatchObject({ client_id: r.body.clientId, answers })
    expect(await altaDe(t)).toMatchObject({ estado: 'convertida', nombre: 'Ana Pérez', email: 'ana.perez@example.com' })
    expect((await altaDe(t)).answers).toEqual({})
    // Convertirla otra vez no copia el vacío encima.
    expect((await convierte(id, await sesion(SA.silvestre))).body).toEqual(r.body)
    expect(tabla('helm_onboarding')[0].answers).toEqual(answers)
  })

  it('una conversión que se quedó a medias (respuestas sin copiar) se termina al repetirla', async () => {
    const answers = { nombre: 'Estudio Pilates Norte' }
    const { id, t } = await enviada(answers)
    const r = await convierte(id, await sesion(SA.silvestre))
    // Como si la copia hubiera fallado: el onboarding no está y el alta conserva sus respuestas.
    db.helm_onboarding = []
    ;(await altaDe(t)).answers = answers
    await convierte(id, await sesion(SA.silvestre))
    expect(tabla('helm_onboarding')).toEqual([expect.objectContaining({ client_id: r.body.clientId, answers })])
    expect((await altaDe(t)).answers).toEqual({})
  })
})

describe('la bandeja, después de la revisión', () => {
  it('solo enviadas y a medias: ni convertidas ni descartadas', async () => {
    const token = await sesion(SA.silvestre)
    const convertida = await enviada({ nombre: 'Convertida' })
    await convierte(convertida.id, token)
    const descartada = await enviada({ nombre: 'Descartada' })
    await descarta(descartada.id, token)
    await enviada({ nombre: 'Enviada' })
    await empieza()
    const r = await lista(token)
    expect(r.body.altas.map(a => a.estado).sort()).toEqual(['borrador', 'enviada'])
  })

  it('al abrirla se borran los borradores de más de 30 días y las descartadas viejas; lo demás se queda', async () => {
    const token = await sesion(SA.silvestre)
    const viejo = await empieza()
    const reciente = await empieza()
    const enviadaVieja = await enviada()
    const descartadaVieja = await enviada()
    await descarta(descartadaVieja.id, token)
    const convertidaVieja = await enviada()
    await convierte(convertidaVieja.id, token)
    const deOtra = await empieza({ agencia: 'otra' })
    for (const { t } of [viejo, enviadaVieja, descartadaVieja, convertidaVieja, deOtra]) (await altaDe(t)).created_at = haceDias(31)
    ;(await altaDe(reciente.t)).created_at = haceDias(29)

    await lista(token)
    const quedan = tabla('helm_altas').map(a => a.id)
    expect(quedan).not.toContain(viejo.id)
    expect(quedan).not.toContain(descartadaVieja.id)
    for (const { id } of [reciente, enviadaVieja, convertidaVieja]) expect(quedan).toContain(id)
    // La de otra agencia la purga quien la administra, no esta.
    expect(quedan).toContain(deOtra.id)
    await lista(await sesion(SA.otra))
    expect(tabla('helm_altas').map(a => a.id)).not.toContain(deOtra.id)
  })
})

describe('el perfil que nace de un alta', () => {
  it('nace con el mismo pipeline que el del panel, y el doble clic no deja uno huérfano', async () => {
    const { id } = await enviada()
    const token = await sesion(SA.silvestre)
    const [a] = await Promise.all([convierte(id, token), convierte(id, token)])
    expect(tabla('crm_pipelines')).toEqual([expect.objectContaining({
      client_id: a.body.clientId, name: 'Pipeline', is_default: true, stages: DEFAULT_STAGES,
    })])
  })
})

describe('borrar un perfil no se lleva su agencia', () => {
  it('tablasDelPerfil se salta agencias.perfil_casa_id, aunque PostgREST la dé como clave ajena a clients', async () => {
    const fk = "Note:\nThis is a Foreign Key to `clients.id`.<fk table='clients' column='id'/>"
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        definitions: {
          clients: { properties: { id: {}, agencia_id: { description: "<fk table='agencias' column='id'/>" } } },
          agencias: { properties: { id: {}, perfil_casa_id: { description: fk } } },
          crm_contacts: { properties: { id: {}, client_id: { description: fk } } },
          helm_altas: { properties: { id: {}, agencia_id: {}, client_id: { description: fk } } },
          helm_tareas: { properties: { id: {}, perfil: { description: fk } } },
        },
      }),
    })))
    try {
      const tablas = await tablasDelPerfil()
      expect(tablas).toEqual([['crm_contacts', 'client_id'], ['helm_altas', 'client_id'], ['helm_tareas', 'perfil']])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
