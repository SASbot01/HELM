// HELM — registro público con aprobación.
//
// Crea un negocio (clients.active=false) y su acceso (team.active=false), ambos
// PENDIENTES. Un superadmin los aprueba desde /usersadmin (activa los dos). El
// usuario no puede entrar hasta entonces: el login exige active=true.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { hashPassword } from './_lib/passwords.js'

const DEFAULT_PIPELINE_STAGES = [
  { key: 'lead', label: 'Lead', color: '#64748B' },
  { key: 'contacted', label: 'Contactado', color: '#3B82F6' },
  { key: 'qualified', label: 'Cualificado', color: '#8B5CF6' },
  { key: 'proposal', label: 'Propuesta', color: '#F59E0B' },
  { key: 'won', label: 'Ganado', color: '#22C55E' },
  { key: 'lost', label: 'Perdido', color: '#EF4444' },
]

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

  const { businessName, name, email, password, logoUrl, brandName, brandSubtitle } = req.body || {}
  const mail = String(email || '').trim().toLowerCase()
  if (!businessName?.trim() || !name?.trim() || !mail || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ error: 'Email inválido' })
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })

  // Email único entre superadmins y accesos de cliente.
  const [{ data: t }, { data: sa }] = await Promise.all([
    supabase.from('team').select('id').eq('email', mail).limit(1),
    supabase.from('superadmins').select('id').eq('email', mail).limit(1),
  ])
  if ((t && t.length) || (sa && sa.length)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
  }

  // Slug único para el negocio.
  const base = slugify(businessName) || 'negocio'
  let slug = base
  for (let n = 2; ; n++) {
    const { data } = await supabase.from('clients').select('id').eq('slug', slug).maybeSingle()
    if (!data) break
    slug = `${base}-${n}`
  }

  // 1) Negocio pendiente, ya con su marca: el logo y el nombre que puso en el
  //    formulario son con lo que verá el panel el día que se le apruebe.
  const negocio = {
    slug, name: businessName.trim(), client_type: 'growth', active: false, is_demo: false,
  }
  const marca = {
    logo_url: typeof logoUrl === 'string' && /^https?:\/\//.test(logoUrl) ? logoUrl : null,
    brand_name: brandName?.trim() ? String(brandName).trim().slice(0, 40) : null,
    brand_subtitle: brandSubtitle?.trim() ? String(brandSubtitle).trim().slice(0, 40) : null,
  }

  let { data: client, error: cErr } = await supabase.from('clients')
    .insert({ ...negocio, ...marca }).select('id, slug').single()

  // Si `migrations/helm_marca.sql` todavía no está aplicada, esas columnas no
  // existen. Perder el registro entero por la marca sería absurdo: se reintenta
  // sin ella y el negocio entra igual.
  if (cErr && (cErr.code === '42703' || cErr.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(cErr.message || ''))) {
    console.warn('[register] sin columnas de marca — aplica migrations/helm_marca.sql');
    ({ data: client, error: cErr } = await supabase.from('clients').insert(negocio).select('id, slug').single())
  }
  if (cErr) return res.status(500).json({ error: cErr.message })

  // 2) Pipeline por defecto (best-effort).
  try {
    await supabase.from('crm_pipelines').insert({
      client_id: client.id, name: 'Pipeline', stages: DEFAULT_PIPELINE_STAGES, is_default: true,
    })
  } catch { /* no bloquea el registro */ }

  // 3) Acceso pendiente.
  const { error: uErr } = await supabase.from('team').insert({
    client_id: client.id, name: name.trim(), email: mail,
    password_hash: hashPassword(password), role: 'admin,ceo,director',
    active: false, guide_seen: false,
  })
  if (uErr) {
    await supabase.from('clients').delete().eq('id', client.id)   // rollback
    return res.status(500).json({ error: uErr.message })
  }

  await writeAudit({ action: 'register.pending', req, statusCode: 200, metadata: { email: mail, slug } })
  return res.status(200).json({ success: true, pending: true })
}
