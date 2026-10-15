// El «Alta en HELM» por enlace (api/onboarding.js · enlace y alta): quién puede
// pedir el enlace, que el token solo abra el alta de su perfil y no valga como
// sesión, que solo se guarde lo que el formulario declara, y que la agencia se
// entere una sola vez de que el cliente lo ha enviado.
// Sin red ni base: Supabase y las notificaciones van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-del-alta-0123456789'
delete process.env.HELM_PUBLIC_URL

const PERFIL = 'c0000000-0000-4000-8000-0000000000a1'
const APAGADO = 'c0000000-0000-4000-8000-0000000000a2'
const AJENO = 'c0000000-0000-4000-8000-0000000000a3'

// ── Base simulada ──────────────────────────────────────────────────────────
const db = {}
const upserts = []
function reinicia() {
  db.clients = [
    { id: PERFIL, name: 'hugo', brand_name: 'En Forma con Hugo', active: true, agencia_id: 'ag-1' },
    { id: APAGADO, name: 'Apagado', brand_name: null, active: false, agencia_id: 'ag-1' },
    { id: AJENO, name: 'Ajeno', brand_name: null, active: true, agencia_id: 'ag-2' },
  ]
  db.helm_onboarding = []
  upserts.length = 0
}

function consulta(tabla) {
  const filtros = []
  let fila = null
  const busca = () => (db[tabla] || []).find(f => filtros.every(([c, v]) => f[c] === v)) || null
  const q = {
    select() { return q },
    eq(c, v) { filtros.push([c, v]); return q },
    upsert(row, opciones) { fila = row; upserts.push({ tabla, row: structuredClone(row), opciones }); return q },
    maybeSingle() { return Promise.resolve({ data: structuredClone(busca()), error: null }) },
    single() {
      if (!fila) return Promise.resolve({ data: structuredClone(busca()), error: null })
      const lista = (db[tabla] ||= [])
      const previa = lista.find(f => f.client_id === fila.client_id && f.form === fila.form)
      if (previa) Object.assign(previa, fila)
      else lista.push({ status: 'draft', completed_at: null, ...fila })
      return Promise.resolve({ data: structuredClone(previa || lista.at(-1)), error: null })
    },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/notificar.js', () => ({ notificar: vi.fn(async () => 'n-1') }))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))

const { default: onboarding, validarAlta } = await import('../api/onboarding.js')
const { signJwt, verifyJwt } = await import('../api/_lib/auth.js')
const { notificar } = await import('../api/_lib/notificar.js')
const { ONBOARDING_ALTA } = await import('../src/helm/onboarding/alta.js')

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
async function llama({ method = 'POST', query = {}, body, token, ipFija }) {
  const res = respuesta()
  const headers = { 'x-forwarded-for': ipFija || `10.1.0.${++ip % 250}` }
  if (token) headers.authorization = `Bearer ${token}`
  await onboarding({ method, query, body, headers, socket: {} }, res)
  return res
}
const enlace = (clientId, token) => llama({ query: { action: 'enlace' }, body: { clientId }, token })
const verAlta = (t, ipFija) => llama({ method: 'GET', query: { action: 'alta', t }, ipFija })
const guardaAlta = (body) => llama({ query: { action: 'alta' }, body })

const sesionDe = (clientId) => signJwt({ sub: 'u-1', clientId, role: 'user' })
const tokenAlta = (clientId = PERFIL, opciones) => signJwt({ kind: 'alta', clientId }, opciones)
const guardadas = () => upserts.filter(u => u.tabla === 'helm_onboarding').map(u => u.row)

beforeEach(() => { reinicia(); notificar.mockClear() })

describe('el formulario', () => {
  it('tiene 40 preguntas, numeradas del 1 al 40 y con claves únicas', () => {
    const preguntas = ONBOARDING_ALTA.sections.flatMap(s => s.fields)
    expect(preguntas).toHaveLength(40)
    expect(new Set(preguntas.map(p => p.key)).size).toBe(40)
    preguntas.forEach((p, i) => expect(p.label.startsWith(`${i + 1} · `), p.key).toBe(true))
  })
})

describe('enlace', () => {
  it('sin sesión no hay enlace', async () => {
    const r = await enlace(PERFIL)
    expect(r.statusCode).toBe(401)
  })

  it('con sesión de otro perfil, tampoco', async () => {
    const r = await enlace(PERFIL, await sesionDe(AJENO))
    expect(r.statusCode).toBe(403)
  })

  it('da un enlace de 30 días cuyo token es de alta y de ese perfil', async () => {
    const r = await enlace(PERFIL, await sesionDe(PERFIL))
    expect(r.statusCode).toBe(200)
    expect(r.body.url).toMatch(/^https:\/\/helm\.s4sf\.net\/alta\/[\w-]+\.[\w-]+\.[\w-]+$/)
    const token = r.body.url.split('/alta/')[1]
    const p = await verifyJwt(token)
    expect(p).toMatchObject({ kind: 'alta', clientId: PERFIL })
    expect(p.exp - p.iat).toBe(60 * 60 * 24 * 30)
    const dias = (new Date(r.body.caduca) - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThanOrEqual(30)
  })

  it('el token del enlace no vale como sesión del panel', async () => {
    const r = await enlace(PERFIL, await tokenAlta(PERFIL))
    expect(r.statusCode).toBe(401)
  })

  it('un perfil desactivado no da enlace', async () => {
    const r = await enlace(APAGADO, await sesionDe(APAGADO))
    expect(r.statusCode).toBe(409)
  })
})

describe('alta (pública)', () => {
  const NO_VALIDO = 'Este enlace ha caducado o no es válido. Pide uno nuevo a quien te lo envió.'

  it('abre el alta del perfil del token, sin sesión', async () => {
    const r = await verAlta(await tokenAlta())
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ perfil: { nombre: 'En Forma con Hugo' }, answers: {}, estado: 'borrador', enviado_at: null })
  })

  it('un token que no es de alta, caducado, manipulado o de un perfil apagado no abre nada', async () => {
    const sesion = await sesionDe(PERFIL)
    const comunidad = await signJwt({ kind: 'community', clientId: PERFIL })
    const caducado = await tokenAlta(PERFIL, { expiresIn: -60 })
    const buena = await tokenAlta()
    const [h, , s] = buena.split('.')
    const cuerpoFalso = Buffer.from(JSON.stringify({ kind: 'alta', clientId: AJENO, exp: 9e9 })).toString('base64url')
    const manipulado = `${h}.${cuerpoFalso}.${s}`
    const apagado = await tokenAlta(APAGADO)
    for (const t of [sesion, comunidad, caducado, manipulado, apagado, '', 'basura']) {
      const r = await verAlta(t)
      expect(r.statusCode, t).toBe(401)
      expect(r.body.error).toBe(NO_VALIDO)
    }
    const r = await guardaAlta({ t: comunidad, answers: { nombre: 'X' } })
    expect(r.statusCode).toBe(401)
    expect(guardadas()).toHaveLength(0)
  })

  it('rechaza lo que el formulario no declara, diciendo qué pregunta falla', async () => {
    const t = await tokenAlta()
    const largo = 'x'.repeat(301)
    const casos = [
      [{ inventada: 'hola' }, 'inventada'],
      [JSON.parse('{"__proto__": "x"}'), '__proto__'],
      [{ antiguedad: 'Desde siempre' }, '4 · ¿Cuánto tiempo llevas con el negocio?'],
      [{ ambito: ['En Marte'] }, '7 · ¿Dónde vendes?'],
      [{ objetivo: ['Más leads', 'Más ventas', 'Tener claros mis números', 'Más contenido y más constancia'] }, 'como mucho 3'],
      [{ camara: 11 }, '31 · ¿Cómo te sientes delante de la cámara?'],
      [{ camara: 4.5 }, 'del 1 al 10'],
      [{ nombre: largo }, '1 · ¿Cómo se llama tu negocio o tu marca?'],
      [{ que_haces: 'y'.repeat(5001) }, 'como mucho 5000'],
      [{ nombre: { a: 1 } }, 'tiene que ser texto'],
      [{ servicios: [{ nombre: 'Mentoría', coste: '10' }] }, 'columna que no existe'],
      [{ servicios: [{ precio: largo }] }, '«Precio»'],
      [{ referentes: Array.from({ length: 21 }, (_, i) => ({ nombre: `@r${i}` })) }, 'como mucho 20 filas'],
    ]
    for (const [answers, trozo] of casos) {
      const r = await guardaAlta({ t, answers })
      expect(r.statusCode, JSON.stringify(answers).slice(0, 80)).toBe(400)
      expect(r.body.error).toContain(trozo)
    }
    expect(guardadas()).toHaveLength(0)
  })

  it('guarda en el formulario alta del perfil del token, sin lo vacío', async () => {
    const r = await guardaAlta({
      t: await tokenAlta(),
      clientId: AJENO, client_id: AJENO,   // lo que mande el navegador no cuenta
      answers: {
        nombre: 'En Forma con Hugo', sector: '   ', que_haces: '',
        antiguedad: 'De 2 a 5 años', ambito: ['100 % online', '100 % online'], formatos: [],
        camara: '7', publicidad: null,
        servicios: [{ nombre: 'Mentoría', precio: '297 €', modalidad: '' }, {}, { nombre: '  ' }],
        redes: [{}],
      },
    })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ok: true, estado: 'borrador', enviado_at: null })
    const [fila] = guardadas()
    expect(fila).toMatchObject({ client_id: PERFIL, form: 'alta' })
    // El borrador lo pone la tabla al crear la fila; guardar no escribe estado.
    expect(fila).not.toHaveProperty('status')
    expect(fila).not.toHaveProperty('completed_at')
    expect(db.helm_onboarding[0].status).toBe('draft')
    expect(fila.answers).toEqual({
      nombre: 'En Forma con Hugo', antiguedad: 'De 2 a 5 años', ambito: ['100 % online'], camara: 7,
      servicios: [{ nombre: 'Mentoría', precio: '297 €' }],
    })
    expect(upserts[0].opciones).toEqual({ onConflict: 'client_id,form' })
    expect(notificar).not.toHaveBeenCalled()

    const visto = await verAlta(await tokenAlta())
    expect(visto.body.answers.nombre).toBe('En Forma con Hugo')
  })

  it('al enviarlo avisa a la agencia una sola vez, aunque lo envíe dos veces', async () => {
    const t = await tokenAlta()
    const uno = await guardaAlta({ t, answers: { nombre: 'Hugo' }, enviar: true })
    expect(uno.statusCode).toBe(200)
    expect(uno.body.estado).toBe('enviado')
    expect(uno.body.enviado_at).toBeTruthy()
    expect(guardadas()[0]).toMatchObject({ status: 'completed', form: 'alta' })
    expect(guardadas()[0].completed_at).toBeTruthy()

    const dos = await guardaAlta({ t, answers: { nombre: 'Hugo, corregido' }, enviar: true })
    expect(dos.statusCode).toBe(200)
    expect(notificar).toHaveBeenCalledTimes(1)
    const [, clientId, aviso] = notificar.mock.calls[0]
    expect(clientId).toBe(PERFIL)
    expect(aviso).toEqual({
      tipo: 'onboarding', nivel: 'aviso',
      titulo: 'En Forma con Hugo ha rellenado el alta en HELM',
      cuerpo: 'Ya puedes ver sus respuestas en Onboarding.',
      destino: 'onboarding',
      clave: `alta-enviada:${PERFIL}`, cadaHoras: 24,
    })

    // Retocar después de enviar no lo devuelve a borrador: el guardado no
    // escribe estado, así que tampoco uno leído antes de un envío que llegó
    // después (un autoguardado que se cruza con el botón de enviar).
    const retoque = await guardaAlta({ t, answers: { nombre: 'Hugo, otra vez' } })
    expect(retoque.body.estado).toBe('enviado')
    expect(guardadas().at(-1)).not.toHaveProperty('status')
    expect(guardadas().at(-1)).not.toHaveProperty('completed_at')
    expect(db.helm_onboarding[0].status).toBe('completed')
    const visto = await verAlta(t)
    expect(visto.body).toMatchObject({ estado: 'enviado', answers: { nombre: 'Hugo, otra vez' } })
    expect(visto.body.enviado_at).toBeTruthy()
  })

  it('si el equipo la dio por completada en el panel, el enlace sigue en borrador y el envío avisa', async () => {
    // Lo que deja marcarCompletado (views/Onboarding.jsx) en el alta: estado
    // completado, pero sin completed_at, que es la fecha del envío del cliente.
    db.helm_onboarding.push({ client_id: PERFIL, form: 'alta', answers: { nombre: 'Hugo' }, status: 'completed', completed_at: null })
    const t = await tokenAlta()
    const visto = await verAlta(t)
    expect(visto.body).toMatchObject({ estado: 'borrador', enviado_at: null })

    const r = await guardaAlta({ t, answers: { nombre: 'Hugo' }, enviar: true })
    expect(r.body).toMatchObject({ ok: true, estado: 'enviado' })
    expect(r.body.enviado_at).toBeTruthy()
    expect(notificar).toHaveBeenCalledTimes(1)
  })

  it('no se puede enviar vacío', async () => {
    const r = await guardaAlta({ t: await tokenAlta(), answers: { nombre: ' ' }, enviar: true })
    expect(r.statusCode).toBe(400)
    expect(guardadas()).toHaveLength(0)
    expect(notificar).not.toHaveBeenCalled()
  })

  it('una petición sin respuestas no vacía lo guardado', async () => {
    const t = await tokenAlta()
    await guardaAlta({ t, answers: { nombre: 'Hugo' } })
    for (const body of [{ t }, { t, answers: null }, { t, answers: 'x' }, { t, answers: [] }]) {
      const r = await guardaAlta(body)
      expect(r.statusCode, JSON.stringify(body.answers)).toBe(400)
    }
    expect(guardadas()).toHaveLength(1)
    expect(db.helm_onboarding[0].answers).toEqual({ nombre: 'Hugo' })
  })

  it('quita lo que Postgres no admite en un jsonb en vez de fallar al guardar', async () => {
    const r = await guardaAlta({
      t: await tokenAlta(),
      answers: { nombre: 'Hu\u0000go', sector: 'fitness \uD83D', tono: '\u0000', servicios: [{ nombre: 'Mentoría\uDC00' }] },
    })
    expect(r.statusCode).toBe(200)
    expect(guardadas()[0].answers).toEqual({ nombre: 'Hugo', sector: 'fitness ', servicios: [{ nombre: 'Mentoría' }] })
  })

  it('tiene límite por IP', async () => {
    const t = await tokenAlta()
    let ultima
    for (let i = 0; i < 61; i++) ultima = await verAlta(t, '10.9.9.9')
    expect(ultima.statusCode).toBe(429)
  })
})

describe('validarAlta', () => {
  it('sin respuestas no hay nada que guardar, y una lista no es un formulario', () => {
    expect(validarAlta(undefined)).toEqual({ answers: {} })
    expect(validarAlta([]).error).toBeTruthy()
  })

  it('la escala admite el número escrito, pero no lo que Number() entiende de más', () => {
    expect(validarAlta({ camara: ' 7 ' })).toEqual({ answers: { camara: 7 } })
    expect(validarAlta({ camara: '   ' })).toEqual({ answers: {} })
    for (const raro of ['0x7', '1e1', '7.0', '-3', true]) {
      expect(validarAlta({ camara: raro }).campo, String(raro)).toBe('camara')
    }
    // Un emoji entero no es una media pareja: se queda.
    expect(validarAlta({ nombre: 'Hugo 💪' })).toEqual({ answers: { nombre: 'Hugo 💪' } })
  })
})
