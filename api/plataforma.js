// HELM — el puesto de la plataforma: todas las agencias de un vistazo.
//
//   GET  ?action=resumen          → cifras globales y cada agencia con su
//                                   actividad (perfiles, consumo, último acceso)
//   GET  ?action=agencia&id=      → una agencia por dentro: administradores,
//                                   perfiles, movimientos, gasto y fallos
//   POST ?action=borrar-agencia { id, confirma }
//                                 → borra la agencia entera; `confirma` es su
//                                   slug, escrito a mano por quien borra
//
// Solo la plataforma (superadmins.plataforma). Sumar o quitar saldo sigue en
// /api/creditos?action=ajuste y desactivar a un administrador en
// /api/users?action=set-active.
//
// El consumo sale de agencia_movimientos, así que la agencia de la casa
// (sin_cobro) no tiene: lo suyo no se apunta.
import fs from 'node:fs/promises'
import path from 'node:path'
import { supabase } from './lib/supabase.js'
import { applyCors, requirePlataforma, writeAudit } from './_lib/auth.js'
import { CREDITOS_POR_EURO, MARGEN, precioEuros } from './_lib/creditos.js'
import { borrarPerfil, DIR_COPIAS } from './perfiles.js'

const DIA = 86_400_000
const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString()
const aCreditos = (euros) => Math.round(Number(euros || 0) * CREDITOS_POR_EURO)
// Lo que nos cuesta de verdad, en euros: el mismo cambio que usa el cobro.
const costeEuros = (usd) => precioEuros(Number(usd || 0)) / MARGEN

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

// Suma los movimientos de una lista por agencia (o por lo que diga `clave`).
function agrupa(movs, clave) {
  const g = {}
  for (const m of movs) {
    const k = clave(m)
    if (k == null) continue
    const t = (g[k] ||= { consumo: 0, coste: 0, recargas: 0, tokens: 0, llamadas: 0 })
    const importe = Number(m.importe || 0)
    if (m.tipo === 'consumo') {
      t.consumo += -importe
      t.coste += costeEuros(m.coste_usd)
      t.tokens += (m.tokens_in || 0) + (m.tokens_out || 0)
      t.llamadas += 1
    } else if (m.tipo === 'recarga') {
      t.recargas += importe
    }
  }
  return g
}

const redondea = (t) => t && {
  consumo: aCreditos(t.consumo),
  costeEuros: Math.round(t.coste * 100) / 100,
  recargasEuros: Math.round(t.recargas * 100) / 100,
  tokens: t.tokens,
  llamadas: t.llamadas,
}

async function resumen() {
  const [agencias, admins, perfiles, movs30, accesos, fallos] = await Promise.all([
    todas(supabase.from('agencias').select('id, nombre, slug, saldo, sin_cobro, created_at').order('created_at', { ascending: false })),
    todas(supabase.from('superadmins').select('id, name, email, active, plataforma, agencia_id, created_at')),
    todas(supabase.from('clients').select('id, agencia_id, active, created_at')),
    todas(supabase.from('agencia_movimientos')
      .select('agencia_id, tipo, importe, coste_usd, tokens_in, tokens_out, created_at')
      .gte('created_at', hace(30)).limit(50000)),
    ultimosAccesos(),
    todas(supabase.from('agent_jobs').select('payload').eq('estado', 'error').gte('created_at', hace(7)).limit(2000)),
  ])

  const agenciaDePerfil = Object.fromEntries(perfiles.map(p => [p.id, p.agencia_id]))
  const desde7 = Date.now() - 7 * DIA
  const mes = agrupa(movs30, m => m.agencia_id)
  const semana = agrupa(movs30.filter(m => Date.parse(m.created_at) >= desde7), m => m.agencia_id)
  const fallosPorAgencia = {}
  for (const j of fallos) {
    const a = agenciaDePerfil[j.payload?.clientId]
    if (a) fallosPorAgencia[a] = (fallosPorAgencia[a] || 0) + 1
  }

  const lista = agencias.map(a => {
    const suyos = admins.filter(s => s.agencia_id === a.id)
    const susPerfiles = perfiles.filter(p => p.agencia_id === a.id)
    const ultimo = suyos
      .map(s => accesos[String(s.email || '').toLowerCase()])
      .filter(Boolean).sort().pop() || null
    return {
      id: a.id,
      nombre: a.nombre,
      slug: a.slug,
      alta: a.created_at,
      sinCobro: a.sin_cobro,
      casa: suyos.some(s => s.plataforma),
      creditos: aCreditos(a.saldo),
      admin: (suyos.find(s => s.active && !s.plataforma) || suyos.find(s => s.active) || suyos[0])?.email || null,
      admins: suyos.length,
      adminsActivos: suyos.filter(s => s.active).length,
      perfiles: susPerfiles.length,
      perfilesActivos: susPerfiles.filter(p => p.active !== false).length,
      ultimoAcceso: ultimo,
      semana: redondea(semana[a.id]) || redondea({ consumo: 0, coste: 0, recargas: 0, tokens: 0, llamadas: 0 }),
      mes: redondea(mes[a.id]) || redondea({ consumo: 0, coste: 0, recargas: 0, tokens: 0, llamadas: 0 }),
      fallos7d: fallosPorAgencia[a.id] || 0,
    }
  })

  const total = Object.values(mes).reduce((s, t) => ({
    consumo: s.consumo + t.consumo, coste: s.coste + t.coste, recargas: s.recargas + t.recargas,
    tokens: s.tokens + t.tokens, llamadas: s.llamadas + t.llamadas,
  }), { consumo: 0, coste: 0, recargas: 0, tokens: 0, llamadas: 0 })
  const deFuera = lista.filter(a => !a.casa)

  return {
    totales: {
      agencias: deFuera.length,
      nuevas7d: deFuera.filter(a => Date.parse(a.alta) >= desde7).length,
      perfiles: deFuera.reduce((s, a) => s + a.perfiles, 0),
      activas7d: deFuera.filter(a => a.ultimoAcceso && Date.parse(a.ultimoAcceso) >= desde7).length,
      saldoPendiente: deFuera.reduce((s, a) => s + Math.max(0, a.creditos), 0),
      sinSaldo: deFuera.filter(a => !a.sinCobro && a.creditos <= 0).length,
      mes: redondea(total),
    },
    agencias: lista,
  }
}

async function agencia(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw falla('Agencia inválida')
  const [{ data: a, error }, admins, perfiles, movs, movs30, accesos] = await Promise.all([
    supabase.from('agencias').select('id, nombre, slug, saldo, sin_cobro, created_at').eq('id', id).maybeSingle(),
    todas(supabase.from('superadmins').select('id, name, email, active, plataforma, created_at').eq('agencia_id', id).order('created_at')),
    todas(supabase.from('clients').select('id, name, brand_name, slug, logo_url, active, created_at').eq('agencia_id', id).order('created_at', { ascending: false })),
    todas(supabase.from('agencia_movimientos')
      .select('id, tipo, importe, origen, modelo, tokens_in, tokens_out, coste_usd, client_id, created_at')
      .eq('agencia_id', id).order('created_at', { ascending: false }).limit(150)),
    todas(supabase.from('agencia_movimientos')
      .select('tipo, importe, origen, modelo, coste_usd, tokens_in, tokens_out, created_at')
      .eq('agencia_id', id).gte('created_at', hace(30)).limit(50000)),
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
  const reparto = (clave) => Object.entries(agrupa(movs30.filter(m => m.tipo === 'consumo'), clave))
    .map(([k, t]) => ({ clave: k, ...redondea(t) }))
    .sort((x, y) => y.consumo - x.consumo)

  return {
    agencia: {
      id: a.id, nombre: a.nombre, slug: a.slug, alta: a.created_at,
      sinCobro: a.sin_cobro, creditos: aCreditos(a.saldo),
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
    porOrigen: reparto(m => m.origen || 'otro'),
    porModelo: reparto(m => m.modelo || 'otro'),
    movimientos: movs.map(m => ({
      id: m.id, tipo: m.tipo, origen: m.origen, modelo: m.modelo,
      creditos: Math.round(Number(m.importe) * CREDITOS_POR_EURO * 100) / 100,
      costeEuros: m.coste_usd != null ? Math.round(costeEuros(m.coste_usd) * 10000) / 10000 : null,
      tokens: (m.tokens_in || 0) + (m.tokens_out || 0),
      perfil: nombreDe[m.client_id] || null, fecha: m.created_at,
    })),
    fallos: fallos.map(j => ({
      tipo: j.tipo, agente: j.payload?.agente || null, perfil: nombreDe[j.payload?.clientId] || null,
      error: String(j.error || '').slice(0, 240), fecha: j.created_at,
    })),
  }
}

// Borra una agencia y todo lo suyo: cada perfil con su copia (borrarPerfil, la
// misma baja que usa el tablero), sus administradores, su saldo y sus
// movimientos. Antes, una copia de la agencia en disco. Nunca la de la
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
  if (movs.some(m => m.tipo === 'recarga')) {
    throw falla('Esta agencia ha pagado recargas y sus pagos hay que conservarlos. Desactiva a sus administradores en lugar de borrarla.', 409)
  }

  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(DIR_COPIAS, `agencia-${a.slug}-${sello}`)
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  // Lleva hashes de contraseña: solo el dueño la lee.
  await fs.writeFile(path.join(dir, 'agencia.json'), JSON.stringify({ agencia: a, admins, movimientos: movs }, null, 1), { mode: 0o600 })

  const perfiles = await todas(supabase.from('clients').select('*').eq('agencia_id', id))
  const borrados = []
  for (const c of perfiles) {
    const r = await borrarPerfil(c, auth, req)
    borrados.push({ slug: c.slug, copia: r.copia })
  }
  const { error: e1 } = await supabase.from('superadmins').delete().eq('agencia_id', id)
  if (e1) throw falla(`Perfiles borrados, pero no sus administradores: ${e1.message}. La copia está en ${dir}.`, 500)
  // Los movimientos y el enlace del conector caen con la agencia (ON DELETE CASCADE).
  const { error: e2 } = await supabase.from('agencias').delete().eq('id', id)
  if (e2) throw falla(`No se pudo borrar la agencia: ${e2.message}. La copia está en ${dir}.`, 500)

  await writeAudit({
    actor: auth, action: 'agencia.borrada', resourceType: 'agencia', resourceId: id, req,
    metadata: { nombre: a.nombre, slug: a.slug, copia: dir, perfiles: borrados, admins: admins.map(s => s.email) },
  })
  return { copia: dir, perfiles: borrados.length, admins: admins.length }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const auth = await requirePlataforma(req)
    const accion = String(req.query?.action || '')
    if (accion === 'resumen') return res.status(200).json(await resumen())
    if (accion === 'agencia') return res.status(200).json(await agencia(req.query?.id))
    if (accion === 'borrar-agencia') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
      const b = req.body || {}
      return res.status(200).json({ ok: true, ...(await borrarAgencia(b.id, b.confirma, auth, req)) })
    }
    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[plataforma]', e)
    return res.status(code).json({ error: e.message })
  }
}
