import { supabase, toAppFormat } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, writeAudit } from './_lib/auth.js'
import { verifyPassword } from './_lib/passwords.js'

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

    // 2) Fallback: BlackWolf team leadership.
    // Si superadmins no acepta (no existe el email o password inválido), aceptar
    // miembros del team del tenant Black Wolf cuyo `role` intersecte con la
    // lista de leadership (ceo/cto/director/ops_director/central). Esto evita
    // duplicar credenciales en `superadmins` para cada nuevo director y hace
    // que añadir/quitar acceso a /admin sea simplemente editar el role en team.
    if (!row || !verifyPassword(password, row)) {
      const BW_CLIENT_ID = 'd7d83ca3-7e18-498d-89e1-c6da252675dc'
      const LEADERSHIP_ROLES = new Set(['ceo', 'cto', 'director', 'ops_director', 'central'])

      const { data: teamData, error: teamErr } = await supabase
        .from('team')
        .select('*')
        .eq('client_id', BW_CLIENT_ID)
        .eq('email', email)
        .eq('active', true)
        .limit(1)

      if (teamErr) {
        await writeAudit({ action: 'login.error', req, statusCode: 500, errorMessage: teamErr.message, metadata: { email } })
        return res.status(500).json({ error: 'Auth service error' })
      }

      const teamRow = teamData?.[0]
      if (!teamRow || !verifyPassword(password, teamRow)) {
        await writeAudit({ action: 'login.failed', req, statusCode: 401, metadata: { email } })
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const userRoles = (teamRow.role || '').split(',').map(s => s.trim().toLowerCase())
      const hasLeadership = userRoles.some(r => LEADERSHIP_ROLES.has(r))
      if (!hasLeadership) {
        await writeAudit({ action: 'login.forbidden_role', req, statusCode: 403, metadata: { email, role: teamRow.role } })
        return res.status(403).json({ error: 'Tu rol no autoriza acceso al panel admin' })
      }

      row = teamRow
      source = 'team_leadership'
    }

    const user = source === 'superadmins'
      ? toAppFormat(row, 'superadmins')
      : { id: row.id, email: row.email, name: row.name, role: row.role, source: 'team_bw' }
    delete user.password
    delete user.passwordHash

    let token = null
    try {
      token = await signJwt({
        sub: row.id,
        email: row.email,
        role: 'superadmin',
        superadmin: true,
        via: source,
      }, { expiresIn: 60 * 60 * 12 }) // 12h
    } catch (err) {
      console.warn('[admin.login] could not sign JWT (JWT_SECRET missing?):', err?.message)
    }

    await writeAudit({
      action: 'login.success',
      actor: { userId: row.id, email: row.email, role: 'superadmin', superadmin: true, via: source },
      req, statusCode: 200, metadata: { email, source },
    })

    return res.status(200).json({ success: true, user, token })
  }

  // GET ?action=verify — Verifica el JWT del admin y devuelve {isSuperAdmin, email}.
  // Implementa la parte server del Sprint 0 T0.7: el frontend ya no decide
  // super-admin solo por presencia de `bw_superadmin` en localStorage; ahora
  // monta y llama a este endpoint con Bearer <bw_admin_jwt>; si falla, limpia
  // el localStorage y desactiva el modo super-admin.
  if (req.method === 'GET' && action === 'verify') {
    const header = req.headers?.authorization || req.headers?.Authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) {
      return res.status(401).json({ ok: false, isSuperAdmin: false, error: 'no_token' })
    }
    try {
      const { verifyJwt } = await import('./_lib/auth.js')
      const payload = await verifyJwt(token)
      const isSuperAdmin = payload.superadmin === true || payload.role === 'superadmin'
      return res.status(200).json({
        ok: true,
        isSuperAdmin,
        email: payload.email || null,
        userId: payload.sub || null,
      })
    } catch (err) {
      return res.status(401).json({ ok: false, isSuperAdmin: false, error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
