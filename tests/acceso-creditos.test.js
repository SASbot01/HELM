// Quién ve el saldo de la agencia y quién puede gastarlo (api/_lib/access.js):
// puedeVerSaldo, solo la plataforma y el administrador de ESA agencia;
// puedeUsarAgentes, la escalera del panel para la sección de los agentes
// (apagada → nadie; plataforma, superadmin y niveles totales → sí; sin oficio
// o dueño → sí; el resto, según sus permisos guardados o los de serie).
// Supabase va simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-acceso-0123456789'

const db = { perfiles: {}, permisos: {}, equipo: [], fallaPermisos: null, fallaEquipo: null, consultas: [] }

vi.mock('../api/lib/supabase.js', () => ({
  supabase: {
    from: (tabla) => {
      const f = {}
      const q = {
        select: () => q,
        eq: (c, v) => { f[c] = v; return q },
        maybeSingle: async () => {
          db.consultas.push(tabla)
          if (tabla === 'clients') return { data: f.id in db.perfiles ? { agencia_id: db.perfiles[f.id] } : null, error: null }
          if (tabla === 'helm_permissions') {
            if (db.fallaPermisos) return { data: null, error: db.fallaPermisos }
            return { data: db.permisos[f.client_id] || null, error: null }
          }
          if (tabla === 'helm_team') {
            if (db.fallaEquipo) return { data: null, error: db.fallaEquipo }
            return { data: db.equipo.find(p => p.login_id === f.login_id && p.client_id === f.client_id) || null, error: null }
          }
          return { data: null, error: null }
        },
      }
      return q
    },
  },
}))

const { puedeVerSaldo, puedeUsarAgentes, SECCION_AGENTES } = await import('../api/_lib/access.js')

const AG = 'a0000000-0000-4000-8000-000000000001'
const OTRA = 'a0000000-0000-4000-8000-000000000002'
let n = 0
const perfil = (agenciaId = AG) => {
  const id = `c0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  db.perfiles[id] = agenciaId
  return id
}
const persona = (clientId, role, login = `u-${role}`) => { db.equipo.push({ login_id: login, client_id: clientId, role }); return { userId: login, clientId } }

beforeEach(() => {
  db.permisos = {}
  db.equipo = []
  db.fallaPermisos = null
  db.fallaEquipo = null
  db.consultas = []
})

describe('puedeVerSaldo', () => {
  it('la plataforma, de cualquier perfil; el administrador, solo de los de SU agencia', async () => {
    const p = perfil(AG)
    const ajeno = perfil(OTRA)
    expect(await puedeVerSaldo({ plataforma: true }, ajeno)).toBe(true)
    const admin = { superadmin: true, agenciaId: AG }
    expect(await puedeVerSaldo(admin, p)).toBe(true)
    expect(await puedeVerSaldo({ role: 'superadmin', agenciaId: AG }, p)).toBe(true)
    expect(await puedeVerSaldo(admin, ajeno)).toBe(false)
    // Un administrador sin agencia, tampoco.
    expect(await puedeVerSaldo({ superadmin: true, agenciaId: null }, p)).toBe(false)
  })

  it('un acceso de cliente o alguien del equipo del perfil entra al perfil, pero no ve el saldo', async () => {
    const p = perfil(AG)
    expect(await puedeVerSaldo({ clientId: p, role: 'client', userId: 'u1' }, p)).toBe(false)
    // Ni con nivel de acceso total del perfil: el saldo es de la agencia.
    expect(await puedeVerSaldo({ clientId: p, role: 'client', nivel: 'admin', agenciaId: AG }, p)).toBe(false)
  })

  it('sin sesión, sin perfil o con un perfil sin agencia, no', async () => {
    const suelto = perfil(null)
    expect(await puedeVerSaldo(null, perfil())).toBe(false)
    expect(await puedeVerSaldo({ superadmin: true, agenciaId: AG }, '')).toBe(false)
    expect(await puedeVerSaldo({ superadmin: true, agenciaId: AG }, suelto)).toBe(false)
  })
})

describe('puedeUsarAgentes', () => {
  it('la sección de los agentes es la entrada «Agentes» del menú (clave contenido)', () => {
    expect(SECCION_AGENTES).toBe('contenido')
  })

  it('plataforma, administrador de la agencia y niveles de acceso total, sin mirar el oficio', async () => {
    const p = perfil()
    expect(await puedeUsarAgentes({ plataforma: true }, p)).toBe(true)
    expect(await puedeUsarAgentes({ superadmin: true, agenciaId: AG }, p)).toBe(true)
    expect(await puedeUsarAgentes({ role: 'superadmin', agenciaId: AG }, p)).toBe(true)
    persona(p, 'closer', 'jefa')
    expect(await puedeUsarAgentes({ userId: 'jefa', clientId: p, nivel: 'admin,ceo,director' }, p)).toBe(true)
    expect(await puedeUsarAgentes({ userId: 'jefa', clientId: p, nivel: 'admin' }, p)).toBe(true)
    expect(db.consultas).not.toContain('helm_team')
  })

  it('el dueño, quien no tiene oficio en el perfil y un acceso sin usuario, sí', async () => {
    const p = perfil()
    expect(await puedeUsarAgentes(persona(p, 'dueno'), p)).toBe(true)
    expect(await puedeUsarAgentes({ userId: 'sin-ficha', clientId: p }, p)).toBe(true)
    expect(await puedeUsarAgentes({ userId: null, clientId: p }, p)).toBe(true)
  })

  it('de serie: el editor sí; closer, setter, csm y otro, no', async () => {
    const p = perfil()
    expect(await puedeUsarAgentes(persona(p, 'editor'), p)).toBe(true)
    for (const rol of ['closer', 'setter', 'csm', 'otro']) {
      expect(await puedeUsarAgentes(persona(p, rol), p)).toBe(false)
    }
    // Un oficio que no está en ninguna lista, tampoco.
    expect(await puedeUsarAgentes(persona(p, 'becario'), p)).toBe(false)
  })

  it('con permisos guardados en el perfil, mandan los suyos; el rol que no aparece se queda con los de serie', async () => {
    const p = perfil()
    db.permisos[p] = { sections: {}, visible: { closer: ['crm', 'contenido'], editor: ['tareas'] } }
    expect(await puedeUsarAgentes(persona(p, 'closer'), p)).toBe(true)
    expect(await puedeUsarAgentes(persona(p, 'editor'), p)).toBe(false)
    expect(await puedeUsarAgentes(persona(p, 'setter'), p)).toBe(false)
    db.permisos[p] = { visible: { setter: ['crm'] } }
    expect(await puedeUsarAgentes(persona(p, 'editor', 'u-editor-2'), p)).toBe(true)
    // Unos permisos vacíos son los de serie.
    db.permisos[p] = { visible: {} }
    expect(await puedeUsarAgentes(persona(p, 'closer', 'u-closer-2'), p)).toBe(false)
    expect(await puedeUsarAgentes(persona(p, 'editor', 'u-editor-3'), p)).toBe(true)
  })

  it('si el negocio apaga la sección, nadie (tampoco la plataforma), como en el panel', async () => {
    const p = perfil()
    db.permisos[p] = { sections: { [SECCION_AGENTES]: false } }
    expect(await puedeUsarAgentes({ plataforma: true }, p)).toBe(false)
    expect(await puedeUsarAgentes({ superadmin: true, agenciaId: AG }, p)).toBe(false)
    expect(await puedeUsarAgentes(persona(p, 'dueno'), p)).toBe(false)
    // Apagar el módulo «Equipos IA» no quita los agentes.
    db.permisos[p] = { sections: { 'equipos-ia': false } }
    expect(await puedeUsarAgentes(persona(p, 'editor'), p)).toBe(true)
  })

  it('sin la tabla de permisos, todo encendido y los de serie; si falla la ficha del equipo, lanza (no se gasta a ciegas)', async () => {
    const p = perfil()
    db.fallaPermisos = { message: 'relation "helm_permissions" does not exist' }
    expect(await puedeUsarAgentes(persona(p, 'editor'), p)).toBe(true)
    expect(await puedeUsarAgentes(persona(p, 'closer'), p)).toBe(false)
    db.fallaEquipo = { message: 'la base no contesta' }
    await expect(puedeUsarAgentes({ userId: 'u-editor', clientId: p }, p)).rejects.toMatchObject({ message: 'la base no contesta' })
  })

  it('sin sesión o sin perfil, no', async () => {
    expect(await puedeUsarAgentes(null, perfil())).toBe(false)
    expect(await puedeUsarAgentes({ plataforma: true }, '')).toBe(false)
  })
})
