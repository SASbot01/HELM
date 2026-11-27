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
// api/leads.js no sale a la red por su cuenta. Si algún día lo hace, estos tests
// lo cantan: `fetch` es este simulacro, que siempre falla.
const red = vi.fn(async () => { throw new Error('sin red en los tests') })
vi.stubGlobal('fetch', red)

const { default: leads } = await import('../api/leads.js')
const { CONTACTO } = await import('../src/pages/helmAcademy/entrega.js')
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

beforeEach(() => { ops.length = 0; existente = null; notificar.mockClear(); red.mockClear() })

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

describe('school (las altas de HELM Academy)', () => {
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

// A quien entra por el quiz de la academia se le dice que alguien del equipo le
// escribe en menos de 24 horas. Aquí, lo que hace que esa promesa se cumpla.
describe('school · la promesa de contacto', () => {
  const noa = { nombre: 'Noa Ruiz', email: 'noa@example.com', dedico: 'diseño', edad: '28', residencia: 'Lorca', telefono: '600111222', quiero: 'Crear contenido y vivir de ello', ingreso: '2.000 – 3.000 €/mes', usa_ia: 'Un poco, a veces' }
  const horas = (iso) => (Date.parse(iso) - Date.now()) / 3_600_000

  it('nuevo: deja en la ficha hasta cuándo hay que escribirle y avisa al equipo con lo que contó', async () => {
    await pide('school', noa)
    const [fila] = inserts()
    expect(horas(fila.custom_fields.school.contactar_antes)).toBeGreaterThan(CONTACTO.horas - 0.1)
    expect(horas(fila.custom_fields.school.contactar_antes)).toBeLessThanOrEqual(CONTACTO.horas)
    expect(fila.notes).toContain('se le dijo que le escribimos en menos de 24 horas para ayudarle con el primer paso')
    expect(notificar).toHaveBeenCalledTimes(1)
    const [, clientId, aviso] = notificar.mock.calls[0]
    expect(clientId).toBe('id-de-silvestre')
    expect(aviso).toMatchObject({ tipo: 'lead', titulo: 'HELM Academy: escribe a Noa Ruiz antes de 24 h', destino: 'crm' })
    expect(aviso.cuerpo).toContain('600111222')
    expect(aviso.cuerpo).toContain('Quiere: Crear contenido y vivir de ello · meta: 2.000 – 3.000 €/mes · IA: Un poco, a veces')
    expect(aviso.cuerpo).toMatch(/por WhatsApp para ayudarle con el primer paso\. Límite: /)
  })

  it('quien repite (o un reintento de la academia) con la promesa viva no reinicia el reloj ni repite el aviso', async () => {
    const antes = new Date(Date.now() + 5 * 3_600_000).toISOString()
    existente = { id: 'c1', name: 'Noa', notes: '', custom_fields: { school: { apuntado: 'ayer', contactar_antes: antes } } }
    const r = await pide('school', noa)
    expect(r.statusCode).toBe(200)
    expect(updates()[0].custom_fields.school.contactar_antes).toBe(antes)
    expect(notificar).not.toHaveBeenCalled()
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
})

// La landing ya no tiene formulario: los datos se dejan en el quiz de la
// academia, y es su servidor el que manda cada alta aquí. Tiene que seguir
// entrando igual que cuando la mandaba el navegador, ahora con la guía por la
// que entró y la campaña de la que vino.
describe('school · las altas que manda la academia', () => {
  const GUIA = 'que-ningun-lead-se-enfrie'
  // Tal como sale de la academia (plataforma/servidor.mjs · /api/alta).
  const alta = (mas = {}) => ({
    nombre: 'Noa Ruiz', email: 'noa@example.com', telefono: '+34600111222', edad: '25-34', residencia: 'Lorca',
    dedico: 'Diseño · empieza por: Contenido', quiero: 'Crear contenido y vivir de ello', ingreso: '2.000 – 3.000 €/mes', usa_ia: 'Un poco, a veces',
    website: '', origen: {}, ...mas,
  })
  const campana = { utm_source: 'youtube', utm_medium: 'video', utm_campaign: 'leads-nov', utm_content: 'v-leads', utm_term: 'crm', fbclid: 'IwAR0abc', referrer: 'https://s4sf.net/' }

  it('entra igual, con su guía y su campaña, sin salir a la red', async () => {
    const r = await pide('school', alta({ guia: GUIA, origen: campana }))
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, id: expect.any(String) })
    expect(await verifyJwt(r.body.id)).toMatchObject({ kind: 'lead', sub: 'contacto-nuevo' })
    const [fila] = inserts()
    expect(fila).toMatchObject({
      client_id: 'id-de-silvestre', name: 'Noa Ruiz', email: 'noa@example.com', phone: '+34600111222', source: 'HELM Academy',
      pipeline_id: 'id-de-silvestre/School', status: 'acceso_dado',
      utm_source: 'youtube', utm_medium: 'video', utm_campaign: 'leads-nov', utm_content: 'v-leads',
    })
    expect(fila.custom_fields.school).toMatchObject({
      dedico: 'Diseño · empieza por: Contenido', quiero: 'Crear contenido y vivir de ello', ingreso: '2.000 – 3.000 €/mes', usa_ia: 'Un poco, a veces',
      edad: '25-34', residencia: 'Lorca', telefono: '+34600111222', guia: GUIA,
    })
    // De la campaña, a la ficha solo las UTM: ni el fbclid ni de dónde venía.
    expect(fila.custom_fields.school.utm).toEqual({ utm_source: 'youtube', utm_medium: 'video', utm_campaign: 'leads-nov', utm_content: 'v-leads', utm_term: 'crm' })
    expect(fila.custom_fields.aiparatodo).toMatchObject({ acceso: 'aprobado', via: 'helm-academy' })
    expect(fila.notes).toContain(`guía: ${GUIA}`)
    expect(notificar.mock.calls[0][2].cuerpo).toContain('Entró por la guía: Que ningún lead se enfríe')
    expect(red).not.toHaveBeenCalled()
  })

  it('sin campaña quedan las UTM de siempre; con fuente y sin medio no se inventa uno', async () => {
    await pide('school', alta())
    expect(inserts()[0]).toMatchObject({ utm_source: 'helm-academy', utm_medium: 'skool' })
    expect(inserts()[0]).not.toHaveProperty('utm_campaign')
    expect(inserts()[0].custom_fields.school).not.toHaveProperty('utm')
    ops.length = 0
    await pide('school', alta({ email: 'otra@example.com', origen: { utm_source: 'instagram' } }))
    expect(inserts()[0]).toMatchObject({ utm_source: 'instagram', utm_medium: null })
  })

  it('de la campaña solo pasan las claves conocidas, recortadas; lo demás no llega a la ficha', async () => {
    await pide('school', alta({ origen: { utm_source: `  ${'y'.repeat(400)}  `, email: 'otro@example.com', cualquiera: 'cosa' } }))
    const [fila] = inserts()
    expect(fila.utm_source).toBe('y'.repeat(200))
    expect(fila.custom_fields.school.utm).toEqual({ utm_source: 'y'.repeat(200) })
    ops.length = 0
    for (const [i, origen] of [undefined, null, 'utm_source=x', 42, []].entries()) {
      const r = await pide('school', alta({ email: `rara-${i}@example.com`, origen }))
      expect(r.statusCode).toBe(200)
    }
    expect(inserts()).toHaveLength(5)
    expect(inserts().every(f => f.utm_source === 'helm-academy' && !f.custom_fields.school.utm)).toBe(true)
  })

  it('sin guía, o con una que no tiene forma de guía, no se guarda ninguna', async () => {
    const malas = [undefined, '', 'ab', 'Que-Ningun-Lead', '../../admin', '/guia/x', 'x'.repeat(81), 42, { a: 1 }]
    for (const [i, guia] of malas.entries()) {
      ops.length = 0
      const r = await pide('school', alta({ email: `sin-guia-${i}@example.com`, guia }))
      expect(r.statusCode).toBe(200)
      expect(inserts()[0].custom_fields.school).not.toHaveProperty('guia')
      expect(inserts()[0].notes).not.toContain('guía:')
    }
  })

  it('quien ya estaba: sus UTM de la primera llegada no se pisan (solo los huecos), y las de esta entrada quedan en su ficha', async () => {
    existente = { id: 'c1', name: 'Noa', notes: '', custom_fields: { school: { guia: 'los-mods-de-claude' } }, utm_source: 'instagram', utm_medium: null, utm_campaign: 'la-primera', utm_content: null }
    const r = await pide('school', alta({ guia: GUIA, origen: campana }))
    expect(await verifyJwt(r.body.id)).toMatchObject({ sub: 'c1' })
    const [u] = updates()
    expect(u).not.toHaveProperty('utm_source')
    expect(u).not.toHaveProperty('utm_campaign')
    expect(u).toMatchObject({ utm_medium: 'video', utm_content: 'v-leads' })
    expect(u.custom_fields.school).toMatchObject({ guia: GUIA, utm: { utm_source: 'youtube', utm_campaign: 'leads-nov' } })
  })

  it('la trampa sigue rechazando a los bots, y las líneas de la pantalla de gracias que ya no existe no se pueden anotar', async () => {
    expect((await pide('school', alta({ website: 'https://spam.example' }))).statusCode).toBe(400)
    expect(inserts()).toHaveLength(0)
    const { body } = await pide('school', alta())
    existente = { id: 'contacto-nuevo', notes: 'HELM Academy · se apuntó' }
    for (const texto of ['HELM Academy · empezó a ver el vídeo', 'HELM Academy · abrió la guía en la academia', 'HELM Academy · descargó la guía (PDF)']) {
      expect((await pide('nota', { id: body.id, texto })).statusCode).toBe(400)
    }
  })
})
