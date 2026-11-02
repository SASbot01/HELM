// Email marketing · el motor del worker (api/_lib/email/motor.js) contra una
// base en memoria y un Resend simulado que, como el de verdad, recuerda cada
// Idempotency-Key: la misma petición con la misma clave no manda nada otra
// vez, y la misma clave con otro cuerpo es un 409.
//
// Lo que se prueba es que NADIE recibe dos veces el mismo correo: ni si el
// worker se cae justo después de que Resend lo aceptara, ni si se cae antes de
// pasar a la persona al siguiente mensaje, ni si se repite la pasada. Y que la
// secuencia avanza con sus esperas, respeta la franja, la fecha programada y
// las bajas, y que lo que es de la campaña (la clave, el remitente) la pausa
// sin dar a nadie por perdido.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-del-motor-0123456789abcdef'
process.env.HELM_PUBLIC_URL = 'https://helm.ejemplo.es'

const h = vi.hoisted(() => ({ b: null, idEnvio: 0 }))
vi.mock('../api/lib/supabase.js', async () => {
  const { crearBase } = await import('./ayudas/base-memoria.js')
  h.b = crearBase({ defectos: { helm_email_envios: () => ({ id: ++h.idEnvio }) } })
  return { supabase: h.b.supabase }
})

const { enviaCorreos, LOTES_POR_PASADA } = await import('../api/_lib/email/motor.js')
const { _espera, _olvidaRitmo } = await import('../api/_lib/email/resend.js')
const { registrarBaja } = await import('../api/_lib/email/bajas.js')
const { deMadrid } = await import('../api/_lib/email/calendario.js')

const P = 'c0000000-0000-4000-8000-000000000001'
const C = 'd0000000-0000-4000-8000-000000000001'
const M1 = 'e0000000-0000-4000-8000-000000000001'
const M2 = 'e0000000-0000-4000-8000-000000000002'
const t = () => h.b.tablas
const db = () => h.b.supabase

// ── Resend simulado ─────────────────────────────────────────────────────────
const resend = { recibidos: [], llamadas: [], claves: new Map(), cola: [], n: 0 }
const resp = (status, cuerpo, cab = {}) => ({ ok: status < 300, status, headers: { get: (k) => cab[k.toLowerCase()] ?? null }, json: async () => cuerpo })
function fetchFalso(url, opts) {
  const clave = opts.headers['Idempotency-Key']
  const cuerpo = JSON.parse(opts.body)
  resend.llamadas.push({ url, clave, cuerpo, crudo: opts.body })
  const prev = resend.claves.get(clave)
  if (prev) return prev.crudo === opts.body ? prev.r() : resp(409, { name: 'invalid_idempotent_request', message: 'Same idempotency key used with a different request payload.' })
  const forzada = resend.cola.shift()
  if (forzada) return typeof forzada === 'function' ? forzada(cuerpo) : forzada
  const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo]
  const ids = lista.map(() => `re_${++resend.n}`)
  resend.recibidos.push(...lista.map((c, i) => ({ para: c.to[0], asunto: c.subject, id: ids[i], cuerpo: c })))
  const r = () => resp(200, Array.isArray(cuerpo) ? { data: ids.map(id => ({ id })) } : { id: ids[0] })
  resend.claves.set(clave, { crudo: opts.body, r })
  return r()
}
const recibidos = (email) => resend.recibidos.filter(x => x.para === email)

// ── Datos ───────────────────────────────────────────────────────────────────
let reloj
const ahora = () => new Date(reloj)
const pasa = (opts = {}) => enviaCorreos({ db: db(), ahora, log: () => {}, ...opts })
const REMITENTE = { nombre: 'Ana de Acme', email: 'hola@acme.es', responderA: '', empresa: 'Acme S.L.', direccion: 'Calle Mayor 1' }

function campana(extra = {}) {
  t().helm_email_campanas = [{ id: C, client_id: P, nombre: 'Bienvenida', estado: 'activa', audiencia: {}, inicio_en: null, ventana_desde: null, ventana_hasta: null, remitente: REMITENTE, total: 0, error: null, created_at: '2026-11-01T00:00:00Z', ...extra }]
}
function personas(n, extra = {}) {
  t().helm_email_destinatarios = Array.from({ length: n }, (_, i) => ({
    id: i + 1, campana_id: C, client_id: P, contact_id: `k${i + 1}`, email: `p${i + 1}@x.es`, nombre: `Persona ${i + 1}`,
    estado: 'activo', siguiente_orden: 1, siguiente_en: reloj.toISOString(), ...extra,
  }))
}
const dest = (id) => t().helm_email_destinatarios.find(d => d.id === id)
const envios = () => t().helm_email_envios || []

beforeEach(() => {
  h.b.vaciar()
  h.idEnvio = 0
  Object.assign(resend, { recibidos: [], llamadas: [], claves: new Map(), cola: [], n: 0 })
  _olvidaRitmo()
  vi.spyOn(_espera, 'ms').mockImplementation(async () => {})
  vi.stubGlobal('fetch', vi.fn(async (u, o) => fetchFalso(u, o)))
  reloj = deMadrid(2026, 11, 2, 11, 0)   // lunes 2 de noviembre, 11:00 en Madrid
  t().user_integrations = [{ id: 'u1', client_id: P, service: 'resend', enabled: true, member_id: null, config: { apiKey: 're_clave_del_perfil', last4: 'rfil' } }]
  t().helm_email_mensajes = [
    { id: M1, campana_id: C, client_id: P, orden: 1, asunto: 'Hola {{primer_nombre|}}', cuerpo: 'Bienvenida, {{nombre}}.', espera_dias: 0 },
    { id: M2, campana_id: C, client_id: P, orden: 2, asunto: 'Segundo', cuerpo: 'Dos días después.', espera_dias: 2 },
  ]
  campana()
  personas(3)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('motor · la secuencia', () => {
  it('manda el primero en un lote con su Idempotency-Key, lo apunta en el CRM y deja el segundo para dentro de dos días', async () => {
    await pasa()
    expect(resend.llamadas).toHaveLength(1)
    const [ll] = resend.llamadas
    expect(ll.url).toBe('https://api.resend.com/emails/batch')
    expect(ll.clave).toMatch(/^helm-email-[0-9a-f-]{36}$/)
    expect(ll.cuerpo.map(c => c.to[0])).toEqual(['p1@x.es', 'p2@x.es', 'p3@x.es'])
    expect(ll.cuerpo[0].subject).toBe('Hola Persona')
    expect(ll.cuerpo[0].headers['List-Unsubscribe']).toMatch(/^<https:\/\/helm\.ejemplo\.es\/api\/email-baja\?t=/)
    expect(ll.cuerpo[0].html).toContain('Acme S.L.')

    expect(envios().map(e => [e.email, e.orden, e.estado, e.resend_id])).toEqual([
      ['p1@x.es', 1, 'enviado', 're_1'], ['p2@x.es', 1, 'enviado', 're_2'], ['p3@x.es', 1, 'enviado', 're_3'],
    ])
    expect(t().crm_activities).toHaveLength(3)
    expect(t().crm_activities[0]).toMatchObject({ client_id: P, contact_id: 'k1', type: 'email', title: 'Email: Hola Persona', performed_by: 'Email marketing' })
    expect(t().crm_activities[0].description).toBe('Campaña «Bienvenida» · correo 1 de 2.')
    expect(dest(1)).toMatchObject({ estado: 'activo', siguiente_orden: 2, siguiente_en: deMadrid(2026, 11, 4, 11, 0).toISOString() })
  })

  it('repetir la pasada no manda nada; a los dos días sale el segundo y la campaña termina', async () => {
    await pasa()
    await pasa()
    expect(resend.recibidos).toHaveLength(3)
    reloj = deMadrid(2026, 11, 3, 11, 0)
    await pasa()
    expect(resend.recibidos).toHaveLength(3)
    reloj = deMadrid(2026, 11, 4, 11, 0)
    await pasa()
    expect(resend.recibidos.map(r => r.asunto)).toEqual(['Hola Persona', 'Hola Persona', 'Hola Persona', 'Segundo', 'Segundo', 'Segundo'])
    expect(t().helm_email_destinatarios.every(d => d.estado === 'terminado' && d.siguiente_en === null)).toBe(true)
    expect(t().helm_email_campanas[0]).toMatchObject({ estado: 'terminada' })
    expect(t().helm_email_campanas[0].terminada_en).toBeTruthy()
    await pasa()
    for (const p of ['p1@x.es', 'p2@x.es', 'p3@x.es']) expect(recibidos(p)).toHaveLength(2)
  })

  it('más de 100 a la vez: lotes de 100, cada uno con su clave', async () => {
    personas(250)
    await pasa()
    expect(resend.llamadas.map(l => l.cuerpo.length)).toEqual([100, 100, 50])
    expect(new Set(resend.llamadas.map(l => l.clave)).size).toBe(3)
    expect(envios().filter(e => e.estado === 'enviado')).toHaveLength(250)
    expect(LOTES_POR_PASADA).toBe(10)
  })
})

describe('motor · nunca dos veces', () => {
  it('se cae justo después de que Resend lo aceptara: la pasada siguiente repite la MISMA petición y nadie lo recibe dos veces', async () => {
    h.b.fallos['helm_email_envios:update'] = 'se ha ido la luz'
    await pasa()
    expect(resend.recibidos).toHaveLength(3)
    expect(envios().every(e => e.estado === 'pendiente')).toBe(true)
    expect(t().crm_activities || []).toHaveLength(0)

    delete h.b.fallos['helm_email_envios:update']
    await pasa()
    expect(resend.llamadas).toHaveLength(2)
    expect(resend.llamadas[1].clave).toBe(resend.llamadas[0].clave)
    expect(resend.llamadas[1].crudo).toBe(resend.llamadas[0].crudo)
    expect(resend.recibidos).toHaveLength(3)
    expect(envios().map(e => [e.estado, e.resend_id])).toEqual([['enviado', 're_1'], ['enviado', 're_2'], ['enviado', 're_3']])
    expect(t().crm_activities).toHaveLength(3)
    expect(dest(1).siguiente_orden).toBe(2)
  })

  it('se cae después de apuntarlo y antes de pasar a la persona al siguiente: no se vuelve a mandar, solo se avanza', async () => {
    t().helm_email_envios = [{ id: 900, campana_id: C, mensaje_id: M1, destinatario_id: 1, client_id: P, contact_id: 'k1', email: 'p1@x.es', orden: 1, lote: 'f0000000-0000-4000-8000-000000000009', estado: 'enviado', enviado_en: deMadrid(2026, 11, 2, 10, 30).toISOString(), intentos: 0, suelto: false }]
    await pasa()
    expect(recibidos('p1@x.es')).toHaveLength(0)
    expect(recibidos('p2@x.es')).toHaveLength(1)
    expect(envios().filter(e => e.destinatario_id === 1)).toHaveLength(1)
    // Desde cuando salió de verdad (10:30), no desde ahora.
    expect(dest(1)).toMatchObject({ siguiente_orden: 2, siguiente_en: deMadrid(2026, 11, 4, 10, 30).toISOString() })
  })

  it('un lote a medias de hace más de 23 h no se repite a ciegas: queda «dudoso» y la persona sigue con el siguiente', async () => {
    personas(1)
    t().helm_email_envios = [{ id: 901, campana_id: C, mensaje_id: M1, destinatario_id: 1, client_id: P, contact_id: 'k1', email: 'p1@x.es', orden: 1, lote: 'f0000000-0000-4000-8000-00000000000a', estado: 'pendiente', creado_en: new Date(reloj.getTime() - 24 * 3600_000).toISOString(), intentos: 1, suelto: false }]
    await pasa()
    expect(resend.llamadas).toHaveLength(0)
    expect(envios()[0]).toMatchObject({ estado: 'dudoso' })
    expect(dest(1).siguiente_orden).toBe(2)
  })

  it('Resend dice que esa clave tenía otro contenido: «dudoso», sin reintentar', async () => {
    personas(1)
    const lote = 'f0000000-0000-4000-8000-00000000000b'
    t().helm_email_envios = [{ id: 902, campana_id: C, mensaje_id: M1, destinatario_id: 1, client_id: P, contact_id: 'k1', email: 'p1@x.es', orden: 1, lote, estado: 'pendiente', creado_en: reloj.toISOString(), intentos: 0, suelto: false }]
    resend.claves.set(`helm-email-${lote}`, { crudo: '[{"otro":"cuerpo"}]', r: () => resp(200, { data: [{ id: 're_viejo' }] }) })
    await pasa()
    expect(envios()[0].estado).toBe('dudoso')
    expect(resend.recibidos).toHaveLength(0)
  })

  it('un 429 que no cede deja el lote pendiente; la pasada siguiente lo manda con la misma clave', async () => {
    const r429 = resp(429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { 'retry-after': '1' })
    resend.cola.push(r429, r429, r429, r429)
    await pasa()
    expect(envios().every(e => e.estado === 'pendiente' && e.intentos === 1)).toBe(true)
    expect(resend.recibidos).toHaveLength(0)
    await pasa()
    expect(new Set(resend.llamadas.map(l => l.clave)).size).toBe(1)
    expect(resend.recibidos).toHaveLength(3)
    expect(envios().every(e => e.estado === 'enviado')).toBe(true)
  })
})

describe('motor · bajas, franja y fecha', () => {
  it('a quien está de baja no le llega nada; quien se da de baja a mitad no recibe el siguiente', async () => {
    t().helm_email_bajas = [{ client_id: P, email: 'p2@x.es', motivo: 'baja', origen: 'enlace' }]
    await pasa()
    expect(recibidos('p2@x.es')).toHaveLength(0)
    expect(dest(2).estado).toBe('baja')
    await registrarBaja({ clientId: P, email: 'P3@x.es', motivo: 'baja', origen: 'enlace' }, db())
    reloj = deMadrid(2026, 11, 4, 11, 0)
    await pasa()
    expect(recibidos('p1@x.es')).toHaveLength(2)
    expect(recibidos('p3@x.es')).toHaveLength(1)
    expect(dest(3).estado).toBe('baja')
  })

  it('fuera de la franja no sale nada; al abrirse, sí', async () => {
    campana({ ventana_desde: 12, ventana_hasta: 14 })
    await pasa()
    expect(resend.llamadas).toHaveLength(0)
    reloj = deMadrid(2026, 11, 2, 12, 0)
    await pasa()
    expect(resend.recibidos).toHaveLength(3)
    // El segundo, dos días después a las 12:00, dentro de la franja.
    expect(dest(1).siguiente_en).toBe(deMadrid(2026, 11, 4, 12, 0).toISOString())
  })

  it('una campaña programada no manda nada antes de su fecha; una pausada, nunca', async () => {
    campana({ inicio_en: deMadrid(2026, 11, 3, 9, 0).toISOString() })
    expect(await pasa()).toEqual([{ campana: C, programada: true }])
    campana({ estado: 'pausada' })
    expect(await pasa()).toEqual([])
    expect(resend.llamadas).toHaveLength(0)
  })
})

describe('motor · lo que es de la campaña', () => {
  it('Resend rechaza la clave: se pausa con el motivo, no se da a nadie por enviado, y al reanudar sale una sola vez', async () => {
    resend.cola.push(resp(401, { name: 'invalid_api_key', message: 'API key is invalid' }))
    await pasa()
    expect(t().helm_email_campanas[0]).toMatchObject({ estado: 'pausada' })
    expect(t().helm_email_campanas[0].error).toMatch(/no reconoce la clave/)
    expect(envios()).toHaveLength(0)
    expect(dest(1).siguiente_orden).toBe(1)
    t().helm_email_campanas[0].estado = 'activa'
    await pasa()
    expect(resend.recibidos).toHaveLength(3)
    await pasa()
    for (const p of ['p1@x.es', 'p2@x.es', 'p3@x.es']) expect(recibidos(p)).toHaveLength(1)
  })

  it('sin clave guardada se pausa y lo dice', async () => {
    t().user_integrations = []
    await pasa()
    expect(t().helm_email_campanas[0]).toMatchObject({ estado: 'pausada' })
    expect(t().helm_email_campanas[0].error).toMatch(/Falta la clave de Resend/)
  })

  it('un correo malo tumba el lote: se manda uno a uno, sale el resto y solo ese queda fallido', async () => {
    resend.cola.push(resp(422, { name: 'validation_error', message: 'Invalid `to` field.' }))
    resend.cola.push(undefined)   // p1: bien
    resend.cola.push(resp(422, { name: 'validation_error', message: 'Invalid `to` field.' }))   // p2: mal
    await pasa()
    expect(resend.llamadas.map(l => l.url.endsWith('/batch'))).toEqual([true, false, false, false])
    expect(recibidos('p1@x.es')).toHaveLength(1)
    expect(recibidos('p2@x.es')).toHaveLength(0)
    expect(recibidos('p3@x.es')).toHaveLength(1)
    expect(Object.fromEntries(envios().map(e => [e.email, e.estado]))).toEqual({ 'p1@x.es': 'enviado', 'p2@x.es': 'fallido', 'p3@x.es': 'enviado' })
    expect(dest(2).estado).toBe('fallido')
    expect(t().helm_email_campanas[0].estado).toBe('activa')
    // Las claves sueltas son del lote y del envío: repetirlas no duplica.
    expect(resend.llamadas.slice(1).map(l => l.clave)).toEqual(envios().map(e => `helm-email-${e.lote}-${e.id}`))
  })

  it('si uno a uno fallan los tres primeros igual, el problema es de la campaña: se pausa sin dar a nadie por fallido', async () => {
    personas(5)
    const mal = resp(422, { name: 'validation_error', message: 'The subject is invalid.' })
    resend.cola.push(mal, mal, mal, mal)
    await pasa()
    expect(t().helm_email_campanas[0].estado).toBe('pausada')
    expect(t().helm_email_campanas[0].error).toMatch(/rechaza los correos de esta campaña/)
    expect(envios().every(e => e.estado === 'pendiente' && e.suelto === true)).toBe(true)
    expect(t().helm_email_destinatarios.every(d => d.estado === 'activo')).toBe(true)
  })
})
