// api/_lib/auth.js
// Helpers reutilizables para todos los endpoints serverless de Vercel.
// - validateAuth(req): verifica JWT y devuelve { userId, clientId, role, email } o lanza.
// - requireSuperAdmin(req): versión estricta que exige rol superadmin.
// - rateLimit({ key, max, windowMs }): in-memory + soft fallback. Para SaaS serio, migrar a Redis.
// - writeAudit({...}): inserta en audit_logs. Nunca lanza — la auditoría no debe romper el flujo.
// - getClientIp(req): IP respetando x-forwarded-for de Vercel.
// - corsHeaders(req, res): setea CORS controlado (whitelist por env CORS_ORIGINS).

import { supabase } from '../lib/supabase.js'

const JWT_SECRET = process.env.JWT_SECRET || ''

// ───────────────────────────────────────────────────────────────────────────
// JWT (sin dependencia externa: HS256 con Web Crypto API — disponible en Vercel Node 20)
// ───────────────────────────────────────────────────────────────────────────
function b64urlToBuf(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}
function bufToB64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(data, secret) {
  const crypto = await import('node:crypto')
  return crypto.createHmac('sha256', secret).update(data).digest()
}

export async function signJwt(payload, { expiresIn = 60 * 60 * 24 * 7 } = {}) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET env var missing')
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { iat: now, exp: now + expiresIn, ...payload }
  const h = bufToB64url(Buffer.from(JSON.stringify(header)))
  const b = bufToB64url(Buffer.from(JSON.stringify(body)))
  const sig = bufToB64url(await hmacSign(`${h}.${b}`, JWT_SECRET))
  return `${h}.${b}.${sig}`
}

export async function verifyJwt(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET env var missing')
  if (!token || typeof token !== 'string') throw new Error('Missing token')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token')
  const [h, b, s] = parts
  const expectedSig = bufToB64url(await hmacSign(`${h}.${b}`, JWT_SECRET))
  // timing-safe compare
  const crypto = await import('node:crypto')
  const a = Buffer.from(s)
  const e = Buffer.from(expectedSig)
  if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) throw new Error('Invalid signature')
  const payload = JSON.parse(b64urlToBuf(b).toString())
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expired')
  return payload
}

// ───────────────────────────────────────────────────────────────────────────
// validateAuth: lee Bearer token. Si no hay JWT pero header legacy 'x-client-slug',
// permite modo compat sólo si process.env.ALLOW_LEGACY_AUTH === '1' (migración gradual).
// ───────────────────────────────────────────────────────────────────────────
export async function validateAuth(req, { required = true } = {}) {
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (token) {
    try {
      const payload = await verifyJwt(token)
      return {
        userId: payload.sub || payload.userId || null,
        clientId: payload.clientId || null,
        clientSlug: payload.clientSlug || null,
        role: payload.role || 'user',
        email: payload.email || null,
        superadmin: payload.superadmin === true,
      }
    } catch (err) {
      if (required) {
        const e = new Error('Unauthorized: ' + err.message)
        e.statusCode = 401
        throw e
      }
    }
  }

  if (required && process.env.ALLOW_LEGACY_AUTH !== '1') {
    const e = new Error('Unauthorized: missing token')
    e.statusCode = 401
    throw e
  }

  // Legacy compat (solo si ALLOW_LEGACY_AUTH=1 durante migración)
  return {
    userId: null,
    clientId: null,
    clientSlug: req.headers?.['x-client-slug'] || null,
    role: 'legacy',
    email: null,
    superadmin: false,
  }
}

export async function requireSuperAdmin(req) {
  const auth = await validateAuth(req, { required: true })
  if (!auth.superadmin && auth.role !== 'superadmin') {
    const e = new Error('Forbidden: superadmin required')
    e.statusCode = 403
    throw e
  }
  return auth
}

// ───────────────────────────────────────────────────────────────────────────
// Rate limit (in-memory por instancia serverless — soft guard, no anti-DDoS serio)
// Para anti-abuse real conviene Upstash Redis o Vercel KV.
// ───────────────────────────────────────────────────────────────────────────
const buckets = new Map() // key -> { count, resetAt }

export function rateLimit({ key, max = 60, windowMs = 60_000 }) {
  if (!key) return { ok: true, remaining: max }
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: max - 1, resetAt: now + windowMs }
  }
  b.count++
  if (b.count > max) return { ok: false, remaining: 0, resetAt: b.resetAt, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
  return { ok: true, remaining: max - b.count, resetAt: b.resetAt }
}

// Devuelve la primera IP válida (IPv4/IPv6) o null — NO 'unknown', que rompería
// inserts a columnas tipo `inet`.
function isValidIpish(s) {
  if (!s || typeof s !== 'string') return false
  const v = s.trim()
  if (!v) return false
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return true         // IPv4
  if (v.includes(':') && /^[0-9a-fA-F:.]+$/.test(v)) return true // IPv6 (simplificado)
  return false
}

export function getClientIp(req) {
  const xf = req.headers?.['x-forwarded-for']
  if (xf) {
    const first = String(xf).split(',')[0].trim()
    if (isValidIpish(first)) return first
  }
  const real = req.headers?.['x-real-ip']
  if (isValidIpish(real)) return real
  const sock = req.socket?.remoteAddress
  if (isValidIpish(sock)) return sock
  return null
}

// ───────────────────────────────────────────────────────────────────────────
// Audit log — siempre best-effort, nunca lanza.
// ───────────────────────────────────────────────────────────────────────────
export async function writeAudit({
  clientId = null,
  actor = null,
  action,
  resourceType = null,
  resourceId = null,
  oldValues = null,
  newValues = null,
  req = null,
  statusCode = null,
  errorMessage = null,
  metadata = null,
}) {
  try {
    await supabase.from('audit_logs').insert({
      client_id: clientId,
      actor_id: actor?.userId || null,
      actor_email: actor?.email || null,
      actor_type: actor?.superadmin ? 'superadmin' : (actor?.role === 'system' ? 'system' : (actor?.role || 'user')),
      action,
      resource_type: resourceType,
      resource_id: resourceId ? String(resourceId) : null,
      old_values: oldValues,
      new_values: newValues,
      ip_address: (req ? getClientIp(req) : null) || null,
      user_agent: req?.headers?.['user-agent'] || null,
      status_code: statusCode,
      error_message: errorMessage,
      metadata: metadata || {},
    })
  } catch (err) {
    console.warn('[audit] failed:', err?.message)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// CORS whitelist (env CORS_ORIGINS="https://central.blackwolfsec.io,https://foo.com")
// Si no hay env, mantiene comportamiento actual (permisivo) para no romper nada.
// ───────────────────────────────────────────────────────────────────────────
export function applyCors(req, res) {
  const origin = req.headers?.origin || ''
  const allowed = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (allowed.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-client-slug,x-webhook-secret')
  res.setHeader('Access-Control-Max-Age', '86400')
}

// ───────────────────────────────────────────────────────────────────────────
// Helper envolvente (opt-in): wrap(handler, options)
// Aplica CORS + rate-limit + auth y captura errores limpiamente.
// ───────────────────────────────────────────────────────────────────────────
export function wrap(handler, {
  auth = false,
  superadmin = false,
  rateLimit: rl = null, // { max, windowMs }
  skipCors = false,
} = {}) {
  return async (req, res) => {
    if (!skipCors) applyCors(req, res)
    if (req.method === 'OPTIONS') return res.status(200).end()

    try {
      if (rl) {
        const ip = getClientIp(req)
        const key = `${ip}:${req.url?.split('?')[0] || 'unknown'}`
        const gate = rateLimit({ key, max: rl.max || 60, windowMs: rl.windowMs || 60_000 })
        if (!gate.ok) {
          res.setHeader('Retry-After', String(gate.retryAfter))
          return res.status(429).json({ error: 'Too many requests', retryAfter: gate.retryAfter })
        }
        res.setHeader('X-RateLimit-Remaining', String(gate.remaining))
      }

      let ctx = { auth: null }
      if (superadmin) {
        ctx.auth = await requireSuperAdmin(req)
      } else if (auth) {
        ctx.auth = await validateAuth(req, { required: true })
      }

      req.ctx = ctx
      return await handler(req, res)
    } catch (err) {
      const code = err?.statusCode || 500
      const safeMsg = code >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : (err?.message || 'Error')
      if (code >= 500) console.error('[wrap] 500:', err)
      return res.status(code).json({ error: safeMsg })
    }
  }
}
