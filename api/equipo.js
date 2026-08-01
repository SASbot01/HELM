// HELM — accesos al panel para la gente del equipo.
//
// Separar `helm_team` (quién es cada uno) de `team` (quién puede entrar) es
// deliberado: hay gente en el equipo que no necesita panel —un editor externo,
// un closer que solo reporta— y hay accesos que no son personas del equipo.
// `helm_team.login_id` une los dos cuando toca.
//
// La contraseña se hashea AQUÍ y nunca en el navegador. El frontend escribe
// directo en Supabase para casi todo, pero una credencial no puede: el hasheo
// tiene que pasar por el servidor y la contraseña no debe quedar en ninguna
// tabla en claro.
//
// Acciones:
//   POST   ?action=grant   { clientId, email, password, level, personId? }
//   POST   ?action=revoke  { clientId, personId }
//
// Sin `personId`, `grant` crea un acceso suelto para el perfil (el que se pide
// al dar de alta un negocio nuevo) sin colgarlo de nadie del equipo.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { hashPassword } from './_lib/passwords.js'

// Nivel de acceso al panel. NO es lo mismo que el rol de la persona (closer,
// setter, CSM): eso dice lo que HACE y vive en helm_team.role. Esto dice
// cuánto puede TOCAR del sistema.
//
// `team.role` guarda una lista separada por comas, que es el formato que ya
// usaba la plataforma; se mantiene para no romper los accesos existentes.
export const NIVELES = {
  propietario: 'admin,ceo,director',
  admin: 'admin',
  miembro: 'member',
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const MIN_PASSWORD = 8

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = getClientIp(req)
  // Más estricto que el resto de endpoints: esto crea credenciales.
  const gate = rateLimit({ key: `equipo:${ip}`, max: 12, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  const action = req.query.action
  const { clientId, personId } = req.body || {}
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  // Con personId: el acceso se cuelga de esa persona del equipo. La persona
  // tiene que existir Y ser de este perfil — sin esta comprobación, quien
  // tenga acceso a un perfil podría crear credenciales en la ficha de otro.
  let persona = null
  if (personId) {
    const { data } = await supabase
      .from('helm_team').select('id, client_id, name, role, login_id, email')
      .eq('id', personId).maybeSingle()
    if (!data || data.client_id !== clientId) {
      return res.status(404).json({ error: 'Esa persona no está en el equipo de este perfil' })
    }
    persona = data
  }

  // ── POST ?action=grant ───────────────────────────────────────────────────
  if (action === 'grant') {
    const { email, password, level } = req.body || {}
    const correo = String(email || '').trim().toLowerCase()

    if (!RE_EMAIL.test(correo)) return res.status(400).json({ error: 'Email no válido' })
    if (!NIVELES[level]) {
      return res.status(400).json({ error: `Nivel de acceso no válido (${Object.keys(NIVELES).join(', ')})` })
    }
    // Al actualizar un acceso ya existente se puede dejar la contraseña vacía
    // para no cambiarla; al crearlo, es obligatoria.
    const cambiaPassword = Boolean(password)
    if (!persona?.login_id && !cambiaPassword) {
      return res.status(400).json({ error: 'La contraseña es obligatoria al crear el acceso' })
    }
    if (cambiaPassword && String(password).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres` })
    }

    // Un email no puede estar en dos accesos: el login busca por email y con
    // duplicados acabaría entrando en el perfil equivocado.
    const { data: enUso } = await supabase
      .from('team').select('id, client_id').eq('email', correo).limit(2)
    const choca = (enUso || []).some(t => t.id !== persona?.login_id)
    if (choca) {
      return res.status(409).json({ error: 'Ya existe un acceso con ese email' })
    }

    const fila = {
      client_id: clientId,
      name: persona?.name || req.body?.name || correo.split('@')[0],
      email: correo,
      role: NIVELES[level],
      active: true,
    }
    if (cambiaPassword) {
      fila.password_hash = hashPassword(String(password))
      // Si esta fila venía de la época del texto plano, se limpia al tocarla.
      fila.password = null
    }

    let loginId = persona?.login_id || null
    if (loginId) {
      const { error } = await supabase.from('team').update(fila).eq('id', loginId)
      if (error) return res.status(500).json({ error: error.message })
    } else {
      const { data, error } = await supabase.from('team').insert(fila).select('id').single()
      if (error) return res.status(500).json({ error: error.message })
      loginId = data.id
    }

    // El email también se guarda en la ficha de la persona: es el mismo dato y
    // tenerlo desincronizado confunde a quien mira el equipo.
    if (persona) {
      const { error: errPersona } = await supabase.from('helm_team')
        .update({ login_id: loginId, email: correo, updated_at: new Date().toISOString() })
        .eq('id', persona.id)
      if (errPersona) return res.status(500).json({ error: errPersona.message })
    }

    await writeAudit({
      clientId, action: 'equipo.access_granted', req,
      metadata: { personId: personId || null, level, nuevo: !persona?.login_id },
    })

    return res.status(200).json({ ok: true, loginId, email: correo, level })
  }

  // ── POST ?action=revoke ──────────────────────────────────────────────────
  // Se desactiva, no se borra: así el histórico de quién hizo qué sigue
  // teniendo a quién apuntar, y reactivarlo es un clic.
  if (action === 'revoke') {
    if (!persona) return res.status(400).json({ error: 'personId requerido' })
    if (!persona.login_id) return res.status(200).json({ ok: true, loginId: null })

    const { error } = await supabase.from('team')
      .update({ active: false }).eq('id', persona.login_id)
    if (error) return res.status(500).json({ error: error.message })

    await supabase.from('helm_team')
      .update({ login_id: null, updated_at: new Date().toISOString() }).eq('id', persona.id)

    await writeAudit({ clientId, action: 'equipo.access_revoked', req, metadata: { personId } })
    return res.status(200).json({ ok: true, loginId: null })
  }

  return res.status(400).json({ error: 'Acción no reconocida' })
}
