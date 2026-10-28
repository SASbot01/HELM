// HELM — alta de una agencia.
//
// Quien se registra crea SU agencia y entra como su administrador: el mismo
// papel que tiene Silvestre AI con sus clientes, pero con los suyos. Sin
// aprobación manual — se paga por uso. Los créditos de bienvenida no se dan
// aquí: al entrar se le ofrece comprar y, si cierra la oferta, se le regalan
// (api/creditos.js → action=bienvenida).
//
// Los perfiles (sus clientes) los crea luego desde el panel.
//
//   POST ?action=register  { agencia, name, email, password }
//     → { success, user, token }, igual que el login de api/admin.js, para que
//       el navegador entre al panel sin pasar por /login.
import { supabase, toAppFormat } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit, signJwt } from './_lib/auth.js'
import { hashPassword } from './_lib/passwords.js'

function slugify(text) {
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '')
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!(req.method === 'POST' && req.query.action === 'register')) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `register:${ip}`, max: 5, windowMs: 10 * 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiados registros seguidos. Prueba más tarde.' })
  }

  const { agencia, name, email, password } = req.body || {}
  const nombreAgencia = String(agencia || '').trim().slice(0, 80)
  const nombre = String(name || '').trim().slice(0, 80)
  const mail = String(email || '').trim().toLowerCase()
  if (!nombreAgencia || !nombre || !mail || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ error: 'Email inválido' })
  if (String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

  // Email único entre administradores y accesos de cliente: el login mira las
  // dos tablas con el mismo email.
  const [{ data: t }, { data: sa }] = await Promise.all([
    supabase.from('team').select('id').eq('email', mail).limit(1),
    supabase.from('superadmins').select('id').ilike('email', mail).limit(1),
  ])
  if ((t && t.length) || (sa && sa.length)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
  }

  const base = slugify(nombreAgencia) || 'agencia'
  let slug = base
  for (let n = 2; ; n++) {
    const { data } = await supabase.from('agencias').select('id').eq('slug', slug).maybeSingle()
    if (!data) break
    slug = `${base}-${n}`
  }

  const { data: nueva, error: aErr } = await supabase.from('agencias')
    .insert({ nombre: nombreAgencia, slug }).select('id, nombre, slug').single()
  if (aErr) return res.status(500).json({ error: aErr.message })

  const { data: admin, error: uErr } = await supabase.from('superadmins').insert({
    email: mail, name: nombre, password_hash: hashPassword(String(password)),
    active: true, agencia_id: nueva.id,
  }).select('*').single()
  if (uErr) {
    await supabase.from('agencias').delete().eq('id', nueva.id)   // sin admin, la agencia no sirve
    return res.status(500).json({ error: uErr.message })
  }

  const user = { ...toAppFormat(admin, 'superadmins'), agencia: nueva, plataforma: false }
  delete user.password
  delete user.passwordHash
  delete user.password_hash

  let token = null
  try {
    token = await signJwt({
      sub: admin.id, email: admin.email, role: 'superadmin', superadmin: true,
      clientId: null, clientSlug: null, agenciaId: nueva.id, plataforma: false, via: 'registro',
    }, { expiresIn: 60 * 60 * 12 })
  } catch (err) {
    console.warn('[register] could not sign JWT (JWT_SECRET missing?):', err?.message)
  }

  await writeAudit({
    action: 'register.agencia', actor: { userId: admin.id, email: mail, role: 'superadmin', superadmin: true },
    req, statusCode: 200, metadata: { email: mail, agencia: slug },
  })
  return res.status(200).json({ success: true, user, token })
}
