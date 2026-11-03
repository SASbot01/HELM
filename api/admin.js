import { supabase, toAppFormat } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, writeAudit, validateAuth } from './_lib/auth.js'
import { verifyPassword } from './_lib/passwords.js'
import { puedeVerPerfil, perfilesVisibles } from './_lib/access.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)

  // Rate limit global suave (60/min por IP), más estricto en login/acciones destructivas abajo
  const globalGate = rateLimit({ key: `admin:${ip}`, max: 120, windowMs: 60_000 })
  if (!globalGate.ok) {
    res.setHeader('Retry-After', String(globalGate.retryAfter))
    return res.status(429).json({ error: 'Too many requests', retryAfter: globalGate.retryAfter })
  }

  // POST ?action=login — SuperAdmin login (emite JWT)
  if (req.method === 'POST' && action === 'login') {
    // Rate-limit severo anti brute-force: 5 intentos/5 min por IP
    const loginGate = rateLimit({ key: `admin:login:${ip}`, max: 5, windowMs: 5 * 60_000 })
    if (!loginGate.ok) {
      res.setHeader('Retry-After', String(loginGate.retryAfter))
      await writeAudit({ action: 'login.rate_limited', req, statusCode: 429, metadata: { email: req.body?.email } })
      return res.status(429).json({ error: 'Too many login attempts. Try later.', retryAfter: loginGate.retryAfter })
    }

    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })

    // 1) Source of truth original: tabla `superadmins`.
    const { data, error } = await supabase
      .from('superadmins')
      .select('*')
      .eq('email', email)
      .eq('active', true)
      .limit(1)

    if (error) {
      await writeAudit({ action: 'login.error', req, statusCode: 500, errorMessage: error.message, metadata: { email } })
      return res.status(500).json({ error: 'Auth service error' })
    }

    let row = data?.[0]
    let source = 'superadmins'

    // 2) Fallback: acceso de cliente. Si el email no está en `superadmins`,
    // se busca en `team` (que es donde aterrizan los accesos creados con
    // "Nuevo perfil" → "Crear un acceso"). Ese usuario entra a HELM pero
    // bloqueado a SU perfil: el JWT lleva clientId y la API lo comprueba.
    let teamRow = null
    if (!row || !verifyPassword(password, row)) {
      const { data: teamData, error: teamErr } = await supabase
        .from('team')
        .select('id, client_id, name, email, role, password_hash, active, guide_seen')
        .eq('email', String(email).trim().toLowerCase())
        .eq('active', true)
        .limit(2)

      if (teamErr) {
        await writeAudit({ action: 'login.error', req, statusCode: 500, errorMessage: teamErr.message, metadata: { email } })
        return res.status(500).json({ error: 'Auth service error' })
      }

      teamRow = (teamData || []).find(t => verifyPassword(password, t))
      if (!teamRow) {
        await writeAudit({ action: 'login.failed', req, statusCode: 401, metadata: { email } })
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      row = teamRow
      source = 'team'
    }

    // Nombre del perfil al que pertenece el acceso de cliente.
    let clientInfo = null
    // Rol de la PERSONA (closer, setter, CSM…), que no es lo mismo que su nivel
    // de acceso. De él dependen las secciones que verá: sin esto, un closer
    // entraría al panel completo, con las finanzas del negocio incluidas.
    let teamRole = null
    // Su ficha en el directorio de personas. Hace falta el id, y no solo el
    // rol: es lo único que identifica a QUIÉN está mirando el panel, y sin eso
    // no se puede enseñar a cada uno solo sus tareas privadas.
    let helmTeamId = null
    if (source === 'team') {
      const [{ data }, { data: persona }] = await Promise.all([
        supabase.from('clients').select('id, name, slug').eq('id', teamRow.client_id).maybeSingle(),
        supabase.from('helm_team').select('id, role, name').eq('login_id', teamRow.id).maybeSingle(),
      ])
      if (!data) {
        await writeAudit({ action: 'login.orphan_team', req, statusCode: 403, metadata: { email } })
        return res.status(403).json({ error: 'Este acceso no tiene un perfil asociado' })
      }
      clientInfo = data
      teamRole = persona?.role || null
      helmTeamId = persona?.id || null
    }

    const isSuperadmin = source === 'superadmins'
    // El administrador de una agencia entra con ella: el panel enseña su
    // nombre y su saldo de créditos.
    let agencia = null
    if (isSuperadmin && row.agencia_id) {
      const { data } = await supabase.from('agencias').select('id, nombre, slug').eq('id', row.agencia_id).maybeSingle()
      agencia = data || null
    }
    const user = isSuperadmin
      ? { ...toAppFormat(row, 'superadmins'), agencia, plataforma: row.plataforma === true }
      : {
          id: row.id, email: row.email, name: row.name, role: 'client',
          clientId: clientInfo.id, clientName: clientInfo.name, clientSlug: clientInfo.slug,
          guideSeen: row.guide_seen === true,
          // `teamRole` es el oficio (closer/setter/csm…) y `level` el nivel de
          // acceso guardado en team.role. Con los dos, el panel decide qué
          // secciones pinta.
          teamRole,
          level: row.role || null,
          // Su ficha en el directorio del perfil: con ella el panel sabe cuáles
          // de las tareas privadas son suyas.
          helmTeamId,
        }
    delete user.password
    delete user.passwordHash

    let token = null
    try {
      token = await signJwt({
        sub: row.id,
        email: row.email,
        role: isSuperadmin ? 'superadmin' : 'client',
        superadmin: isSuperadmin,
        clientId: isSuperadmin ? null : clientInfo.id,
        clientSlug: isSuperadmin ? null : clientInfo.slug,
        agenciaId: isSuperadmin ? (row.agencia_id || null) : null,
        plataforma: isSuperadmin && row.plataforma === true,
        via: source,
      }, { expiresIn: 60 * 60 * 12 }) // 12h
    } catch (err) {
      console.warn('[admin.login] could not sign JWT (JWT_SECRET missing?):', err?.message)
    }

    await writeAudit({
      action: 'login.success',
      actor: { userId: row.id, email: row.email, role: isSuperadmin ? 'superadmin' : 'client', superadmin: isSuperadmin, via: source },
      req, statusCode: 200, metadata: { email, source },
    })

    return res.status(200).json({ success: true, user, token })
  }

  // GET ?action=verify — ¿Sigue valiendo esta sesión? Devuelve {isSuperAdmin, email}.
  // Lo pregunta el panel ante un 401 (src/helm/sesion.js) antes de mandarte al
  // login: un 401 también puede ser de Instagram o Google con el permiso
  // caducado. Por eso es la misma comprobación que la de cualquier endpoint
  // (validateAuth: firma, tipo de token y cuenta o acceso todavía activos), y
  // un 401 de aquí quiere decir, solo, que la sesión ya no vale.
  if (req.method === 'GET' && action === 'verify') {
    const header = req.headers?.authorization || req.headers?.Authorization || ''
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, isSuperAdmin: false, error: 'no_token' })
    }
    try {
      const auth = await validateAuth(req, { required: true })
      return res.status(200).json({
        ok: true,
        isSuperAdmin: auth.superadmin === true || auth.role === 'superadmin',
        email: auth.email || null,
        userId: auth.userId || null,
      })
    } catch (err) {
      return res.status(401).json({ ok: false, isSuperAdmin: false, error: err.message })
    }
  }

  // GET ?action=mis-perfiles — los perfiles a los que una cuenta de equipo
  // puede entrar (el suyo de origen más aquellos donde la hayan añadido al
  // equipo), con su oficio en cada uno. Lo pide el selector del panel. Un
  // superadmin no lo usa: tiene su propia lista (los de su agencia).
  if (req.method === 'GET' && action === 'mis-perfiles') {
    let auth
    try { auth = await validateAuth(req, { required: true }) }
    catch (err) { return res.status(err.statusCode || 401).json({ error: err.message }) }
    const ids = await perfilesVisibles(auth)
    if (ids === null || !ids.length) return res.status(200).json({ perfiles: [] })
    const [{ data: clientes }, { data: personas }] = await Promise.all([
      supabase.from('clients')
        .select('id, slug, name, client_type, primary_color, logo_url, brand_name, brand_subtitle, agencia_id')
        .in('id', ids).eq('active', true),
      auth.userId
        ? supabase.from('helm_team').select('client_id, role').eq('login_id', auth.userId).eq('active', true)
        : Promise.resolve({ data: [] }),
    ])
    const oficio = new Map((personas || []).map(p => [p.client_id, p.role]))
    const perfiles = (clientes || []).map(c => ({ ...c, teamRole: oficio.get(c.id) || null, origen: c.id === auth.clientId }))
    return res.status(200).json({ perfiles })
  }

  // POST ?action=cambiar-perfil { clientId } — cambia el perfil activo de una
  // cuenta de equipo con acceso a varios. Reemite el token con el nuevo
  // clientId (tras comprobar que puede entrar) y con el NIVEL del perfil nuevo
  // —null si no es el de origen, para que no herede permisos— y devuelve el
  // user para el panel. El superadmin no cambia por aquí: su token no lleva
  // clientId y elige perfil en la propia lista.
  if (req.method === 'POST' && action === 'cambiar-perfil') {
    let auth
    try { auth = await validateAuth(req, { required: true }) }
    catch (err) { return res.status(err.statusCode || 401).json({ error: err.message }) }
    if (auth.superadmin || auth.role === 'superadmin') {
      return res.status(400).json({ error: 'Un administrador no cambia de perfil por aquí' })
    }
    const destino = req.body?.clientId
    if (!destino) return res.status(400).json({ error: 'clientId requerido' })
    if (!(await puedeVerPerfil(auth, destino))) {
      return res.status(403).json({ error: 'No tienes acceso a ese perfil' })
    }
    const [{ data: cliente }, { data: persona }, { data: cuenta }] = await Promise.all([
      supabase.from('clients').select('id, name, slug').eq('id', destino).maybeSingle(),
      supabase.from('helm_team').select('id, role, name').eq('login_id', auth.userId).eq('client_id', destino).maybeSingle(),
      supabase.from('team').select('client_id, role').eq('id', auth.userId).maybeSingle(),
    ])
    if (!cliente) return res.status(404).json({ error: 'Ese perfil no existe' })
    const esOrigen = cuenta?.client_id === destino
    const user = {
      id: auth.userId, email: auth.email, name: persona?.name || auth.email, role: 'client',
      clientId: cliente.id, clientName: cliente.name, clientSlug: cliente.slug,
      guideSeen: true,
      teamRole: persona?.role || null,
      // El nivel solo cuenta en su perfil de origen; en el ajeno, null (manda el oficio).
      level: esOrigen ? (cuenta?.role || null) : null,
      helmTeamId: persona?.id || null,
    }
    let token = null
    try {
      token = await signJwt({
        sub: auth.userId, email: auth.email, role: 'client', superadmin: false,
        clientId: cliente.id, clientSlug: cliente.slug, agenciaId: null, plataforma: false, via: 'team',
      }, { expiresIn: 60 * 60 * 12 })
    } catch (err) {
      console.warn('[admin.cambiar-perfil] no se pudo firmar JWT:', err?.message)
    }
    await writeAudit({
      clientId: destino, action: 'perfil.cambiado',
      actor: { userId: auth.userId, email: auth.email, role: 'client' },
      req, statusCode: 200, metadata: { destino },
    })
    return res.status(200).json({ success: true, user, token })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
