// AI para todo con aprobación (api/leads.js · solicitar-acceso, comprobar-acceso):
// se pide acceso (nombre y correo) y queda 'pendiente' en el propio contacto;
// no se devuelve ficha hasta que esté 'aprobado'. Sin red ni base: Supabase y el
// aviso van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-acceso-0123456789'

const ops = []
let existente = null                 // el contacto que ya está en el CRM, si lo hay
function consulta(tabla) {
  const q = {
    tabla, filtros: [],
    select() { return q },
    eq(c, v) { q.filtros.push([c, v]); return q },
    ilike(c, v) { q.filtros.push([c, v]); return q },
    limit() { return q },
    order() { return q },
    insert(fila) { ops.push({ op: 'insert', tabla, fila }); return q },
    update(cambios) { ops.push({ op: 'update', tabla, cambios }); return q },
    single() { return Promise.resolve({ data: { id: 'contacto-nuevo' }, error: null }) },
    maybeSingle() {
      const v = Object.fromEntries(q.filtros)
      if (tabla === 'clients') return Promise.resolve({ data: { id: `id-de-${v.slug}`, active: true }, error: null })
      if (tabla === 'crm_pipelines') {
        const stages = v.name === 'School'
          ? [{ key: 'apuntado' }, { key: 'en_skool' }, { key: 'pidio_acceso' }, { key: 'acceso_dado' }]
          : [{ key: 'lead_nuevo' }]
        return Promise.resolve({ data: { id: `${v.client_id}/${v.name}`, stages }, error: null })
      }
      // El contacto de una ficha firmada (las notas de la pantalla de gracias).
      if (tabla === 'crm_contacts') return Promise.resolve({ data: existente, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then(ok) { return Promise.resolve({ data: tabla === 'crm_contacts' && existente ? [existente] : [], error: null }).then(ok) },
  }
  ops.push({ op: 'from', tabla, q })
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
const notificar = vi.hoisted(() => vi.fn(async () => null))
vi.mock('../api/_lib/notificar.js', () => ({ notificar }))
// El correo saliente: apagado salvo en el test que lo enciende.
const correo = vi.hoisted(() => ({ hay: false, enviar: vi.fn(async () => ({ enviado: true })) }))
vi.mock('../api/_lib/correo.js', () => ({ hayCorreo: () => correo.hay, enviarCorreo: correo.enviar }))

const { default: leads } = await import('../api/leads.js')
const { CONTACTO, NOTA_VIDEO, NOTA_GUIA } = await import('../src/pages/helmAcademy/entrega.js')
const { verifyJwt } = await import('../api/_lib/auth.js')

function respuesta() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this }, setHeader() {},
  }
}
let ip = 0
const pide = async (action, body) => {
  const res = respuesta()
  await leads({ method: 'POST', query: { action }, body, headers: { 'x-forwarded-for': `10.1.0.${++ip}` }, socket: {} }, res)
  return res
}
const inserts = () => ops.filter(o => o.op === 'insert' && o.tabla === 'crm_contacts').map(o => o.fila)
const updates = () => ops.filter(o => o.op === 'update' && o.tabla === 'crm_contacts').map(o => o.cambios)

beforeEach(() => { ops.length = 0; existente = null; notificar.mockClear(); correo.hay = false; correo.enviar.mockClear() })

describe('solicitar-acceso · a qué embudo va', () => {
  const pideAcceso = () => pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Marta', email: 'marta@example.com' })

  it('nuevo: entra en School, en «Pidió acceso»', async () => {
    await pideAcceso()
    expect(inserts()[0]).toMatchObject({ pipeline_id: 'id-de-silvestre/School', status: 'pidio_acceso' })
  })

  it('ya estaba en la página de inicio (o en ningún embudo): pasa a School · «Pidió acceso»', async () => {
    existente = { id: 'c1', name: 'Marta', custom_fields: {}, pipeline_id: 'id-de-silvestre/Página de inicio', status: 'lead_nuevo' }
    await pideAcceso()
    expect(updates()[0]).toMatchObject({ pipeline_id: 'id-de-silvestre/School', status: 'pidio_acceso' })
    ops.length = 0
    existente = { id: 'c2', name: 'Marta', custom_fields: {}, pipeline_id: null, status: null }
    await pideAcceso()
    expect(updates()[0]).toMatchObject({ pipeline_id: 'id-de-silvestre/School', status: 'pidio_acceso' })
  })

  it('de otro embudo (un lead magnet, un cliente): se apunta la solicitud pero no se mueve', async () => {
    existente = { id: 'c3', name: 'Marta', custom_fields: {}, pipeline_id: 'id-de-silvestre/Lead magnet', status: 'cliente' }
    await pideAcceso()
    const u = updates()[0]
    expect(u.custom_fields.aiparatodo.acceso).toBe('pendiente')
    expect(u).not.toHaveProperty('pipeline_id')
    expect(u).not.toHaveProperty('status')
  })
})

describe('solicitar-acceso', () => {
  it('nuevo: queda pendiente en silvestre, no da ficha y avisa a Alex', async () => {
    const r = await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Marta', email: 'marta@example.com' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ estado: 'pendiente' })
    const [fila] = inserts()
    expect(fila.client_id).toBe('id-de-silvestre')
    expect(fila.custom_fields.aiparatodo.acceso).toBe('pendiente')
    expect(notificar).toHaveBeenCalledTimes(1)
    expect(notificar.mock.calls[0][2].cuerpo).toMatch(/marta@example.com/)
  })

  it('si ya estaba aprobado, entra directo (devuelve ficha) y no inserta', async () => {
    existente = { id: 'c-aprobado', name: 'Leo', custom_fields: { aiparatodo: { acceso: 'aprobado' } } }
    const r = await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Leo', email: 'leo@example.com' })
    expect(r.statusCode).toBe(200)
    expect(r.body.estado).toBe('aprobado')
    const ficha = await verifyJwt(r.body.id)
    expect(ficha).toMatchObject({ kind: 'lead', sub: 'c-aprobado' })
    expect(inserts()).toHaveLength(0)
    expect(notificar).not.toHaveBeenCalled()
  })

  it('si ya estaba pendiente, no vuelve a avisar (solo actualiza)', async () => {
    existente = { id: 'c-pend', name: 'Ada', notes: '', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    const r = await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Ada', email: 'ada@example.com' })
    expect(r.body).toEqual({ estado: 'pendiente' })
    expect(inserts()).toHaveLength(0)
    expect(updates()).toHaveLength(1)
    expect(notificar).not.toHaveBeenCalled()
  })

  it('la trampa (website) y el correo malo se rechazan', async () => {
    expect((await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Bot', email: 'b@b.com', website: 'http://x' })).statusCode).toBe(400)
    expect((await pide('solicitar-acceso', { comunidad: 'aiparatodo', nombre: 'Sin correo', email: 'nop' })).statusCode).toBe(400)
    expect(inserts()).toHaveLength(0)
  })
})

describe('comprobar-acceso', () => {
  it('aprobado devuelve la ficha para entrar', async () => {
    existente = { id: 'c9', custom_fields: { aiparatodo: { acceso: 'aprobado' } } }
    const r = await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'ok@example.com' })
    expect(r.body.estado).toBe('aprobado')
    expect((await verifyJwt(r.body.id)).sub).toBe('c9')
  })

  it('no distingue pendiente de desconocido (no deja sondear el CRM)', async () => {
    existente = { id: 'c8', custom_fields: { aiparatodo: { acceso: 'pendiente' } } }
    expect((await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'p@example.com' })).body).toEqual({ estado: 'pendiente' })
    existente = null
    expect((await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'nadie@example.com' })).body).toEqual({ estado: 'pendiente' })
  })
})

describe('school (formulario de HELM Academy)', () => {
  it('guarda el lead en silvestre con sus datos, con el acceso a AI para todo ya dado, y devuelve su ficha', async () => {
    const r = await pide('school', { nombre: 'Noa', email: 'noa@example.com', dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222' })
    expect(r.statusCode).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(await verifyJwt(r.body.id)).toMatchObject({ kind: 'lead', sub: 'contacto-nuevo' })
    const [fila] = inserts()
    expect(fila.client_id).toBe('id-de-silvestre')
    expect(fila.phone).toBe('600111222')
    expect(fila.source).toBe('HELM Academy')
    expect(fila.custom_fields.school).toMatchObject({ dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222' })
    expect(fila.custom_fields.aiparatodo).toMatchObject({ acceso: 'aprobado', via: 'helm-academy' })
    expect(fila).toMatchObject({ pipeline_id: 'id-de-silvestre/School', status: 'acceso_dado' })
  })

  it('quien ya estaba: le da el acceso; a School solo si venía de la página de inicio, de ningún embudo o de School', async () => {
    existente = { id: 'c1', name: 'Noa', custom_fields: { aiparatodo: { acceso: 'pendiente' } }, pipeline_id: 'id-de-silvestre/Página de inicio', status: 'lead_nuevo' }
    const r = await pide('school', { nombre: 'Noa', email: 'noa@example.com', dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222' })
    expect(await verifyJwt(r.body.id)).toMatchObject({ sub: 'c1' })
    expect(updates()[0]).toMatchObject({ pipeline_id: 'id-de-silvestre/School', status: 'acceso_dado' })
    expect(updates()[0].custom_fields.aiparatodo.acceso).toBe('aprobado')
    ops.length = 0
    existente = { id: 'c2', name: 'Cliente', custom_fields: {}, pipeline_id: 'id-de-silvestre/Lead magnet', status: 'cliente' }
    await pide('school', { nombre: 'Cliente', email: 'cli@example.com', dedico: 'x', edad: '40', residencia: 'Murcia', telefono: '600' })
    const u = updates()[0]
    expect(u.custom_fields.aiparatodo.acceso).toBe('aprobado')
    expect(u).not.toHaveProperty('pipeline_id')
  })

  it('después, «comprobar-acceso» con ese correo abre AI para todo', async () => {
    existente = { id: 'c3', name: 'Noa', custom_fields: { aiparatodo: { acceso: 'aprobado', via: 'helm-academy' } } }
    const r = await pide('comprobar-acceso', { comunidad: 'aiparatodo', email: 'noa@example.com' })
    expect(r.body.estado).toBe('aprobado')
    expect(await verifyJwt(r.body.id)).toMatchObject({ sub: 'c3' })
  })

  it('la trampa y el correo malo se rechazan', async () => {
    expect((await pide('school', { nombre: 'Bot', email: 'b@b.com', website: 'x', dedico: 'x', edad: '1', residencia: 'x', telefono: '1' })).statusCode).toBe(400)
    expect((await pide('school', { nombre: 'X', email: 'nop' })).statusCode).toBe(400)
    expect(inserts()).toHaveLength(0)
  })
})

// Al apuntarse, la pantalla de gracias le dice que alguien del equipo le
// escribe en menos de 24 horas. Aquí, lo que hace que esa promesa se cumpla.
describe('school · la promesa de contacto', () => {
  const noa = { nombre: 'Noa Ruiz', email: 'noa@example.com', dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222', quiero: 'Crear contenido y vivir de ello', ingreso: '2.000 – 3.000 €/mes', usa_ia: 'Un poco, a veces' }
  const horas = (iso) => (Date.parse(iso) - Date.now()) / 3_600_000

  it('nuevo: deja en la ficha hasta cuándo hay que escribirle y avisa al equipo con lo que contó', async () => {
    await pide('school', noa)
    const [fila] = inserts()
    expect(horas(fila.custom_fields.school.contactar_antes)).toBeGreaterThan(CONTACTO.horas - 0.1)
    expect(horas(fila.custom_fields.school.contactar_antes)).toBeLessThanOrEqual(CONTACTO.horas)
    expect(fila.notes).toContain('se le dijo que le escribimos en menos de 24 horas con su ruta de inicio')
    expect(notificar).toHaveBeenCalledTimes(1)
    const [, clientId, aviso] = notificar.mock.calls[0]
    expect(clientId).toBe('id-de-silvestre')
    expect(aviso).toMatchObject({ tipo: 'lead', titulo: 'HELM Academy: escribe a Noa Ruiz antes de 24 h', destino: 'crm' })
    expect(aviso.cuerpo).toContain('600111222')
    expect(aviso.cuerpo).toContain('Quiere: Crear contenido y vivir de ello · meta: 2.000 – 3.000 €/mes · IA: Un poco, a veces')
    expect(aviso.cuerpo).toMatch(/por WhatsApp con su ruta de inicio\. Límite: /)
  })

  it('quien reenvía con la promesa viva no reinicia el reloj ni repite el aviso', async () => {
    const antes = new Date(Date.now() + 5 * 3_600_000).toISOString()
    existente = { id: 'c1', name: 'Noa', notes: '', custom_fields: { school: { apuntado: 'ayer', contactar_antes: antes } } }
    await pide('school', noa)
    expect(updates()[0].custom_fields.school.contactar_antes).toBe(antes)
    expect(notificar).not.toHaveBeenCalled()
    expect(correo.enviar).not.toHaveBeenCalled()
  })

  it('quien vuelve con el plazo vencido (o se apuntó antes de que existiera) tiene plazo y aviso nuevos', async () => {
    existente = { id: 'c1', name: 'Noa', notes: '', custom_fields: { school: { contactar_antes: new Date(Date.now() - 3_600_000).toISOString() } } }
    await pide('school', noa)
    expect(horas(updates()[0].custom_fields.school.contactar_antes)).toBeGreaterThan(CONTACTO.horas - 0.1)
    expect(notificar).toHaveBeenCalledTimes(1)
    ops.length = 0; notificar.mockClear()
    existente = { id: 'c2', name: 'Leo', notes: 'HELM Academy · se apuntó', custom_fields: { school: { apuntado: 'hace un mes' } } }
    await pide('school', { ...noa, email: 'leo@example.com' })
    expect(updates()[0].notes).toContain('se le dijo que le escribimos')
    expect(notificar).toHaveBeenCalledTimes(1)
  })

  it('con correo saliente, le manda lo suyo y su siguiente paso; sin él, no pasa nada', async () => {
    await pide('school', noa)
    expect(correo.enviar).not.toHaveBeenCalled()
    correo.hay = true
    await pide('school', { ...noa, email: 'otra@example.com' })
    expect(correo.enviar).toHaveBeenCalledTimes(1)
    const c = correo.enviar.mock.calls[0][0]
    expect(c.para).toBe('otra@example.com')
    expect(c.texto).toContain('Hola Noa:')
    expect(c.texto).toContain('https://s4sf.net/helm-academy/gracias')
    expect(c.texto).toContain('Tu siguiente paso: esperar nuestro WhatsApp. En menos de 24 horas')
    expect(c.html).toContain('<a href="https://s4sf.net/helm-academy/gracias">')
  })

  it('el nombre no se cuela como HTML en el correo', async () => {
    correo.hay = true
    await pide('school', { ...noa, nombre: '<b>Noa</b>' })
    expect(correo.enviar.mock.calls[0][0].html).toContain('Hola &lt;b&gt;Noa&lt;/b&gt;:')
  })

  it('la pantalla de gracias puede anotar «vio el vídeo» y «descargó la guía», y nada más', async () => {
    const { body } = await pide('school', noa)
    existente = { id: 'contacto-nuevo', notes: 'HELM Academy · se apuntó' }
    ops.length = 0
    expect((await pide('nota', { id: body.id, texto: NOTA_VIDEO })).statusCode).toBe(200)
    expect((await pide('nota', { id: body.id, texto: NOTA_GUIA })).statusCode).toBe(200)
    expect(updates().map(u => u.notes)).toEqual([
      `HELM Academy · se apuntó\n${NOTA_VIDEO}`,
      `HELM Academy · se apuntó\n${NOTA_GUIA}`,
    ])
    expect((await pide('nota', { id: body.id, texto: 'HELM Academy · cualquier otra cosa' })).statusCode).toBe(400)
  })
})
