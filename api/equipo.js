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
import { applyCors, rateLimit, getClientIp, writeAudit, olvidarAcceso } from './_lib/auth.js'
import { requireProfileAccess, agenciaDe } from './_lib/access.js'
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

// ¿Administra esta sesión el perfil? Su superadmin, o alguien del equipo con
// nivel admin en él. (requireProfileAccess, que mira si ENTRA, va antes.)
async function administraPerfil(auth, clientId) {
  if (auth.superadmin || auth.role === 'superadmin') return true
  const { data: yo } = await supabase.from('team')
    .select('role, active').eq('id', auth.userId).eq('client_id', clientId).maybeSingle()
  const mio = String(yo?.role || '').split(',').map(r => r.trim())
  return Boolean(yo?.active) && mio.includes('admin')
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET ?action=disponibles&clientId= — las cuentas que YA existen en tu
  // agencia (su perfil de origen es uno de la agencia) y que todavía no están
  // en el equipo de este perfil, para el botón «Añadir persona existente».
  if (req.method === 'GET' && req.query.action === 'disponibles') {
    if (!rateLimit({ key: `equipo:${getClientIp(req)}`, max: 30, windowMs: 60_000 }).ok) {
      return res.status(429).json({ error: 'Demasiadas peticiones' })
    }
    const clientId = req.query.clientId
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
    let auth
    try { auth = await requireProfileAccess(req, clientId) }
    catch (err) { return res.status(err.statusCode || 401).json({ error: err.message }) }
    if (!(await administraPerfil(auth, clientId))) {
      return res.status(403).json({ error: 'Solo el propietario o un administrador del perfil gestionan el equipo' })
    }
    const ag = await agenciaDe(clientId)
    const { data: perfilesAg } = ag
      ? await supabase.from('clients').select('id, name').eq('agencia_id', ag)
      : { data: [] }
    const idsAg = (perfilesAg || []).map(c => c.id)
    if (!idsAg.length) idsAg.push(clientId)
    const nombrePerfil = new Map((perfilesAg || []).map(c => [c.id, c.name]))
    const [{ data: cuentas }, { data: yaAqui }] = await Promise.all([
      supabase.from('team').select('id, email, name, client_id, active').in('client_id', idsAg).eq('active', true),
      supabase.from('helm_team').select('login_id').eq('client_id', clientId),
    ])
    const ocupados = new Set((yaAqui || []).map(r => r.login_id).filter(Boolean))
    const disponibles = (cuentas || [])
      .filter(c => !ocupados.has(c.id))
      .map(c => ({ loginId: c.id, email: c.email, name: c.name || c.email.split('@')[0], origen: nombrePerfil.get(c.client_id) || null }))
    return res.status(200).json({ disponibles })
  }

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

  // Dar y quitar accesos es cosa de quien administra el perfil. Tener sesión
  // en él no basta: un miembro podría hacerse propietario o cambiarle la
  // contraseña al dueño. Y solo un propietario toca a otro propietario.
  let esPropietario = true
  try {
    const auth = await requireProfileAccess(req, clientId)
    if (!auth.superadmin && auth.role !== 'superadmin') {
      const { data: yo } = await supabase.from('team')
        .select('role, active').eq('id', auth.userId).eq('client_id', clientId).maybeSingle()
      const mio = String(yo?.role || '').split(',').map(r => r.trim())
      if (!yo?.active || !mio.includes('admin')) {
        return res.status(403).json({ error: 'Solo el propietario o un administrador del perfil gestionan los accesos' })
      }
      esPropietario = mio.includes('ceo') || mio.includes('director')
    }
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
    // Y su acceso, si lo tiene, también tiene que ser de este perfil: la ficha
    // de la persona se edita desde el panel, y un login_id apuntando al acceso
    // de otro perfil permitiría cambiarle el email y la contraseña (o
    // desactivarlo) a alguien de otro negocio.
    // Solo al crear o cambiar una credencial (grant): no se puede tocar la
    // contraseña ni el email del acceso de otro perfil. Compartir una cuenta
    // (cuyo origen es otro perfil) es justo lo que sí se permite, y va por
    // `vincular`/`desvincular`, que no tocan la credencial.
    if (action === 'grant' && persona.login_id) {
      const { data: acceso } = await supabase.from('team').select('client_id').eq('id', persona.login_id).maybeSingle()
      if (acceso && acceso.client_id !== clientId) {
        return res.status(409).json({ error: 'El acceso de esta persona es de otro perfil' })
      }
    }
  }

  if (action === 'grant' && !esPropietario) {
    const { data: suLogin } = persona?.login_id
      ? await supabase.from('team').select('role').eq('id', persona.login_id).maybeSingle()
      : { data: null }
    if (req.body?.level === 'propietario' || /\b(ceo|director)\b/.test(suLogin?.role || '')) {
      return res.status(403).json({ error: 'Solo un propietario puede dar o cambiar un acceso de propietario' })
    }
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
    }

    let loginId = persona?.login_id || null
    if (loginId) {
      const { error } = await supabase.from('team').update(fila).eq('id', loginId)
      if (error) return res.status(500).json({ error: error.message })
      olvidarAcceso(loginId)   // su nivel nuevo vale ya, no dentro de un minuto
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
    olvidarAcceso(persona.login_id)   // su sesión deja de valer ya

    await supabase.from('helm_team')
      .update({ login_id: null, updated_at: new Date().toISOString() }).eq('id', persona.id)

    await writeAudit({ clientId, action: 'equipo.access_revoked', req, metadata: { personId } })
    return res.status(200).json({ ok: true, loginId: null })
  }

  // ── POST ?action=vincular ────────────────────────────────────────────────
  // Da acceso a ESTE perfil a una cuenta que YA EXISTE (la de otro perfil): una
  // misma persona —un setter, un closer— puede trabajar en varios perfiles con
  // una sola cuenta. No crea credenciales ni toca la contraseña: solo engancha
  // la cuenta a la ficha de la persona en este perfil (helm_team.login_id). Su
  // oficio aquí (y por tanto qué ve) es el de su ficha; su nivel de origen NO
  // viaja (ver cuentaAcceso en _lib/auth.js).
  if (action === 'vincular') {
    if (!persona) return res.status(400).json({ error: 'personId requerido' })
    const correo = String(req.body?.email || '').trim().toLowerCase()
    if (!RE_EMAIL.test(correo)) return res.status(400).json({ error: 'Email no válido' })
    if (persona.login_id) {
      return res.status(409).json({ error: 'Esta persona ya tiene acceso. Quítaselo antes de vincular otra cuenta.' })
    }
    const { data: cuentas } = await supabase.from('team').select('id, active').eq('email', correo).limit(2)
    const activas = (cuentas || []).filter(c => c.active !== false)
    if (!activas.length) {
      return res.status(404).json({ error: 'No existe ninguna cuenta activa con ese email. Créale un acceso nuevo con contraseña.' })
    }
    if (activas.length > 1) return res.status(409).json({ error: 'Hay más de una cuenta con ese email' })
    const loginId = activas[0].id
    const { error } = await supabase.from('helm_team')
      .update({ login_id: loginId, email: correo, updated_at: new Date().toISOString() }).eq('id', persona.id)
    if (error) return res.status(500).json({ error: error.message })
    olvidarAcceso(loginId)   // su lista de perfiles cambia: que valga ya
    await writeAudit({ clientId, action: 'equipo.cuenta_vinculada', req, metadata: { personId, loginId } })
    return res.status(200).json({ ok: true, loginId, email: correo })
  }

  // ── POST ?action=desvincular ─────────────────────────────────────────────
  // Le quita a la persona el acceso a ESTE perfil, sin tocar la cuenta: sigue
  // viva en su perfil de origen y en los demás donde esté vinculada. Para
  // retirar del todo un acceso de este perfil está `revoke`.
  if (action === 'desvincular') {
    if (!persona) return res.status(400).json({ error: 'personId requerido' })
    if (!persona.login_id) return res.status(200).json({ ok: true, loginId: null })
    const idLogin = persona.login_id
    const { error } = await supabase.from('helm_team')
      .update({ login_id: null, updated_at: new Date().toISOString() }).eq('id', persona.id)
    if (error) return res.status(500).json({ error: error.message })
    olvidarAcceso(idLogin)
    await writeAudit({ clientId, action: 'equipo.cuenta_desvinculada', req, metadata: { personId, loginId: idLogin } })
    return res.status(200).json({ ok: true, loginId: null })
  }

  // ── POST ?action=agregar-existente ───────────────────────────────────────
  // Añade a ESTE perfil una cuenta que YA existe en la agencia (su origen es
  // otro perfil): crea su ficha en el equipo con el rol elegido y la deja
  // enganchada a su cuenta, en un paso. No toca su contraseña; su nivel de
  // origen no viaja (ver cuentaAcceso en _lib/auth.js). Lo usa el botón
  // «Añadir persona existente».
  if (action === 'agregar-existente') {
    const { loginId, role, name } = req.body || {}
    if (!loginId) return res.status(400).json({ error: 'Falta la cuenta a añadir' })
    const { data: cuenta } = await supabase.from('team')
      .select('id, email, name, active, client_id').eq('id', loginId).maybeSingle()
    if (!cuenta || cuenta.active === false) {
      return res.status(404).json({ error: 'Esa cuenta no existe o está inactiva' })
    }
    // Tiene que ser de la misma agencia que el perfil.
    const [agPerfil, agCuenta] = await Promise.all([agenciaDe(clientId), agenciaDe(cuenta.client_id)])
    if (agPerfil && agCuenta && agPerfil !== agCuenta) {
      return res.status(403).json({ error: 'Esa cuenta no es de tu agencia' })
    }
    const { data: yaAqui } = await supabase.from('helm_team')
      .select('id').eq('client_id', clientId).eq('login_id', loginId).maybeSingle()
    if (yaAqui) return res.status(409).json({ error: 'Esa persona ya está en el equipo de este perfil' })
    const rol = String(role || 'setter').trim().slice(0, 40) || 'setter'
    const { data: persona, error } = await supabase.from('helm_team').insert({
      client_id: clientId,
      name: (name && String(name).trim()) || cuenta.name || cuenta.email.split('@')[0],
      role: rol, email: cuenta.email, login_id: loginId, active: true,
    }).select('id, name, role, email, phone, country, login_id, active').single()
    if (error) return res.status(500).json({ error: error.message })
    olvidarAcceso(loginId)
    await writeAudit({ clientId, action: 'equipo.persona_existente_anadida', req, metadata: { loginId, role: rol } })
    return res.status(200).json({ ok: true, persona })
  }

  return res.status(400).json({ error: 'Acción no reconocida' })
}
