// HELM — el puesto de la plataforma: todas las agencias de un vistazo.
//
//   GET  ?action=resumen          → cifras globales y cada agencia con su
//                                   actividad (perfiles, licencia, último acceso)
//   GET  ?action=agencia&id=      → una agencia por dentro: administradores,
//                                   perfiles, licencias y fallos
//   POST ?action=dar-licencia { id, meses, nota }
//                                 → regala (o amplía) licencia a mano, sin cobro
//   POST ?action=anular-licencia { id, licenciaId }
//                                 → anula una licencia (la de un error)
//   POST ?action=borrar-agencia { id, confirma }
//                                 → borra la agencia entera; `confirma` es su
//                                   slug, escrito a mano por quien borra
//
// Solo la plataforma (superadmins.plataforma). Desactivar a un administrador va
// por /api/users?action=set-active.
//
// Desde el 7-nov-2026 cada agencia paga una licencia anual (api/licencia.js) y
// usa su propia clave de Claude: HELM ya no apunta consumo ni saldo.
import fs from 'node:fs/promises'
import path from 'node:path'
import { supabase } from './lib/supabase.js'
import { applyCors, requirePlataforma, writeAudit } from './_lib/auth.js'
import { activarLicencia, licenciasDe, olvidarAgencia, MESES_LICENCIA } from './_lib/licencia.js'
import { borrarPerfil, DIR_COPIAS } from './perfiles.js'

const DIA = 86_400_000
const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

async function todas(consulta) {
  const { data, error } = await consulta
  if (error) throw error
  return data || []
}

// Último acceso de cada email, mirando los inicios de sesión de los 90 días.
async function ultimosAccesos() {
  const filas = await todas(supabase.from('audit_logs')
    .select('actor_email, created_at').eq('action', 'login.success')
    .gte('created_at', hace(90)).order('created_at', { ascending: false }).limit(5000))
  const ultimo = {}
  for (const f of filas) {
    const email = String(f.actor_email || '').toLowerCase()
    if (email && !ultimo[email]) ultimo[email] = f.created_at
  }
  return ultimo
}

/**
 * La licencia de una agencia en una palabra, a partir de su última fecha de
 * caducidad: casa (no la necesita), activa, caducada o sin (nunca la tuvo).
 */
export function estadoDeLicencia({ sinCobro, casa, venceAt }, ahora = Date.now()) {
  if (sinCobro || casa) return { estado: 'casa', venceAt: null, dias: null }
  if (!venceAt) return { estado: 'sin', venceAt: null, dias: null }
  const ms = Date.parse(venceAt) - ahora
  return { estado: ms > 0 ? 'activa' : 'caducada', venceAt, dias: Math.ceil(ms / DIA) }
}

async function resumen() {
  const [agencias, admins, perfiles, licencias, accesos, fallos] = await Promise.all([
    todas(supabase.from('agencias').select('id, nombre, slug, sin_cobro, created_at').order('created_at', { ascending: false })),
    todas(supabase.from('superadmins').select('id, name, email, active, plataforma, agencia_id, created_at')),
    todas(supabase.from('clients').select('id, agencia_id, active, created_at')),
    todas(supabase.from('licenses').select('agencia_id, origen, importe_eur, vence_at, pagada_at')
      .eq('estado', 'activa').limit(50000)),
    ultimosAccesos(),
    todas(supabase.from('agent_jobs').select('payload').eq('estado', 'error').gte('created_at', hace(7)).limit(2000)),
  ])

  const agenciaDePerfil = Object.fromEntries(perfiles.map(p => [p.id, p.agencia_id]))
  const desde7 = Date.now() - 7 * DIA
  const fallosPorAgencia = {}
  for (const j of fallos) {
    const a = agenciaDePerfil[j.payload?.clientId]
    if (a) fallosPorAgencia[a] = (fallosPorAgencia[a] || 0) + 1
  }
  // La última fecha de caducidad de cada agencia.
  const vence = {}
  for (const l of licencias) {
    if (l.agencia_id && l.vence_at && (!vence[l.agencia_id] || l.vence_at > vence[l.agencia_id])) vence[l.agencia_id] = l.vence_at
  }

  const lista = agencias.map(a => {
    const suyos = admins.filter(s => s.agencia_id === a.id)
    const susPerfiles = perfiles.filter(p => p.agencia_id === a.id)
    const ultimo = suyos
      .map(s => accesos[String(s.email || '').toLowerCase()])
      .filter(Boolean).sort().pop() || null
    const casa = suyos.some(s => s.plataforma)
    return {
      id: a.id,
      nombre: a.nombre,
      slug: a.slug,
      alta: a.created_at,
      sinCobro: a.sin_cobro,
      casa,
      licencia: estadoDeLicencia({ sinCobro: a.sin_cobro, casa, venceAt: vence[a.id] || null }),
      admin: (suyos.find(s => s.active && !s.plataforma) || suyos.find(s => s.active) || suyos[0])?.email || null,
      admins: suyos.length,
      adminsActivos: suyos.filter(s => s.active).length,
      perfiles: susPerfiles.length,
      perfilesActivos: susPerfiles.filter(p => p.active !== false).length,
      ultimoAcceso: ultimo,
      fallos7d: fallosPorAgencia[a.id] || 0,
    }
  })

  const deFuera = lista.filter(a => !a.casa && !a.sinCobro)
  const pagadas = (dias) => licencias
    .filter(l => l.origen === 'stripe' && l.pagada_at && l.pagada_at >= hace(dias))
    .reduce((s, l) => s + (Number(l.importe_eur) || 0), 0)
  const redondea = (n) => Math.round(n * 100) / 100

  return {
    totales: {
      agencias: deFuera.length,
      nuevas7d: deFuera.filter(a => Date.parse(a.alta) >= desde7).length,
      perfiles: deFuera.reduce((s, a) => s + a.perfiles, 0),
      activas7d: deFuera.filter(a => a.ultimoAcceso && Date.parse(a.ultimoAcceso) >= desde7).length,
      conLicencia: deFuera.filter(a => a.licencia.estado === 'activa').length,
      caducan30d: deFuera.filter(a => a.licencia.estado === 'activa' && a.licencia.dias <= 30).length,
      sinLicencia: deFuera.filter(a => a.licencia.estado !== 'activa').length,
      ingresos30d: redondea(pagadas(30)),
      ingresos365d: redondea(pagadas(365)),
    },
    agencias: lista,
  }
}

async function agencia(id) {
  if (!UUID.test(String(id || ''))) throw falla('Agencia inválida')
  const [{ data: a, error }, admins, perfiles, licencias, accesos] = await Promise.all([
    supabase.from('agencias').select('id, nombre, slug, sin_cobro, created_at').eq('id', id).maybeSingle(),
    todas(supabase.from('superadmins').select('id, name, email, active, plataforma, created_at').eq('agencia_id', id).order('created_at')),
    todas(supabase.from('clients').select('id, name, brand_name, slug, logo_url, active, created_at').eq('agencia_id', id).order('created_at', { ascending: false })),
    licenciasDe(id),
    ultimosAccesos(),
  ])
  if (error) throw error
  if (!a) throw falla('Esa agencia no existe', 404)

  const ids = perfiles.map(p => p.id)
  const [equipos, fallos] = ids.length
    ? await Promise.all([
      todas(supabase.from('agent_perfiles').select('client_id, activo').in('client_id', ids)),
      todas(supabase.from('agent_jobs').select('tipo, payload, error, created_at')
        .eq('estado', 'error').gte('created_at', hace(7))
        .in('payload->>clientId', ids).order('created_at', { ascending: false }).limit(30)),
    ])
    : [[], []]
  const equipoDe = Object.fromEntries(equipos.map(e => [e.client_id, e.activo]))
  const nombreDe = Object.fromEntries(perfiles.map(p => [p.id, p.brand_name || p.name]))
  const casa = admins.some(s => s.plataforma)
  const vigente = licencias.filter(l => l.estado === 'activa' && l.vence).map(l => l.vence).sort().pop() || null

  return {
    agencia: {
      id: a.id, nombre: a.nombre, slug: a.slug, alta: a.created_at, sinCobro: a.sin_cobro, casa,
      licencia: estadoDeLicencia({ sinCobro: a.sin_cobro, casa, venceAt: vigente }),
    },
    admins: admins.map(s => ({
      id: s.id, nombre: s.name, email: s.email, activo: s.active, plataforma: s.plataforma,
      alta: s.created_at, ultimoAcceso: accesos[String(s.email || '').toLowerCase()] || null,
    })),
    perfiles: perfiles.map(p => ({
      id: p.id, nombre: p.brand_name || p.name, slug: p.slug, logo: p.logo_url,
      activo: p.active !== false, alta: p.created_at,
      equipo: equipoDe[p.id] == null ? 'sin activar' : (equipoDe[p.id] ? 'activo' : 'en pausa'),
    })),
    licencias,
    fallos: fallos.map(j => ({
      tipo: j.tipo, agente: j.payload?.agente || null, perfil: nombreDe[j.payload?.clientId] || null,
      error: String(j.error || '').slice(0, 240), fecha: j.created_at,
    })),
  }
}

// Borra una agencia y todo lo suyo: cada perfil con su copia (borrarPerfil, la
// misma baja que usa el tablero), sus administradores, sus movimientos de
// antes y sus licencias regaladas. Antes, una copia de la agencia en disco. Nunca la de la
// plataforma, y nunca una que haya pagado: esos pagos hay que conservarlos
// (para esa, desactivar a sus administradores).
async function borrarAgencia(id, confirma, auth, req) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw falla('Agencia inválida')
  const { data: a, error } = await supabase.from('agencias').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!a) throw falla('Esa agencia no existe', 404)
  const admins = await todas(supabase.from('superadmins').select('*').eq('agencia_id', id))
  if (admins.some(s => s.plataforma)) throw falla('La agencia de la plataforma no se puede borrar', 403)
  if (String(confirma || '').trim() !== a.slug) throw falla(`Para borrar la agencia escribe su identificador exacto: ${a.slug}`)
  const movs = await todas(supabase.from('agencia_movimientos').select('*').eq('agencia_id', id))
  const licencias = await todas(supabase.from('licenses').select('*').eq('agencia_id', id))
  if (movs.some(m => m.tipo === 'recarga') || licencias.some(l => l.origen === 'stripe')) {
    throw falla('Esta agencia ha pagado (licencias o recargas) y sus pagos hay que conservarlos. Desactiva a sus administradores en lugar de borrarla.', 409)
  }

  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(DIR_COPIAS, `agencia-${a.slug}-${sello}`)
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  // Lleva hashes de contraseña: solo el dueño la lee.
  await fs.writeFile(path.join(dir, 'agencia.json'), JSON.stringify({ agencia: a, admins, movimientos: movs, licencias }, null, 1), { mode: 0o600 })

  const perfiles = await todas(supabase.from('clients').select('*').eq('agencia_id', id))
  const borrados = []
  for (const c of perfiles) {
    const r = await borrarPerfil(c, auth, req)
    borrados.push({ slug: c.slug, copia: r.copia })
  }
  const { error: e1 } = await supabase.from('superadmins').delete().eq('agencia_id', id)
  if (e1) throw falla(`Perfiles borrados, pero no sus administradores: ${e1.message}. La copia está en ${dir}.`, 500)
  // Los movimientos, la clave de Claude y el enlace del conector caen con la
  // agencia (ON DELETE CASCADE); sus licencias se quedan sin agencia.
  const { error: e2 } = await supabase.from('agencias').delete().eq('id', id)
  if (e2) throw falla(`No se pudo borrar la agencia: ${e2.message}. La copia está en ${dir}.`, 500)

  await writeAudit({
    actor: auth, action: 'agencia.borrada', resourceType: 'agencia', resourceId: id, req,
    metadata: { nombre: a.nombre, slug: a.slug, copia: dir, perfiles: borrados, admins: admins.map(s => s.email) },
  })
  return { copia: dir, perfiles: borrados.length, admins: admins.length }
}

// ── Licencias a mano ─────────────────────────────────────────────────────────
// Regalar un año (o los meses que sean) a una agencia, sin cobro: la misma
// cuenta que un pago (empieza hoy o cuando acabe la que tenga).
async function darLicencia({ id, meses, nota }, auth, req) {
  if (!UUID.test(String(id || ''))) throw falla('Agencia inválida')
  const n = Math.floor(Number(meses) || MESES_LICENCIA)
  if (n < 1 || n > 36) throw falla('Entre 1 y 36 meses')
  const r = await activarLicencia({
    agenciaId: id, origen: 'manual', importe: 0, meses: n,
    nota: String(nota || '').trim().slice(0, 200), creadoPor: auth.email || '',
  })
  await writeAudit({ actor: auth, action: 'licencia.dada', resourceType: 'agencia', resourceId: id, req, metadata: { meses: n, nota, venceAt: r.venceAt } })
  return { venceAt: r.venceAt }
}

async function anularLicencia({ id, licenciaId }, auth, req) {
  if (!UUID.test(String(id || '')) || !UUID.test(String(licenciaId || ''))) throw falla('Licencia inválida')
  const { data, error } = await supabase.from('licenses').update({ estado: 'anulada' })
    .eq('id', licenciaId).eq('agencia_id', id).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw falla('Esa licencia no es de esta agencia', 404)
  olvidarAgencia(id)
  await writeAudit({ actor: auth, action: 'licencia.anulada', resourceType: 'agencia', resourceId: id, req, metadata: { licenciaId } })
  return { anulada: true }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const auth = await requirePlataforma(req)
    const accion = String(req.query?.action || '')
    if (accion === 'resumen') return res.status(200).json(await resumen())
    if (accion === 'agencia') return res.status(200).json(await agencia(req.query?.id))
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
    const b = req.body || {}
    if (accion === 'borrar-agencia') return res.status(200).json({ ok: true, ...(await borrarAgencia(b.id, b.confirma, auth, req)) })
    if (accion === 'dar-licencia') return res.status(200).json(await darLicencia(b, auth, req))
    if (accion === 'anular-licencia') return res.status(200).json(await anularLicencia(b, auth, req))
    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[plataforma]', e)
    return res.status(code).json({ error: e.message })
  }
}
