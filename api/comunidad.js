// HELM — Comunidad interna de un perfil: portal público + gestión de miembros.
//
// Aquí conviven dos mundos con reglas distintas:
//
//   · El PORTAL. Público, sin sesión de HELM. Alguien de fuera abre
//     /c/<slug>, se registra y espera aprobación. Su credencial vive en
//     helm_community_members (tabla con RLS que niega al anónimo) y su sesión es
//     un JWT propio, con kind:'community'. Nunca da acceso al panel: solo a la
//     comunidad de ESE perfil.
//
//   · La GESTIÓN. Desde dentro del panel, con la sesión de HELM de siempre:
//     aprobar, bloquear o echar a alguien, y la config de la comunidad.
//
// Los cursos y el muro los lee y escribe el panel directo contra Supabase (como
// el resto de HELM); por aquí pasan solo cuando quien pregunta es un miembro,
// que no tiene anon key ni debe tenerla.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, verifyJwt, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { hashPassword, verifyPassword } from './_lib/passwords.js'

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const MIN_PASSWORD = 8
const ESTADOS = ['pendiente', 'activo', 'bloqueado']

/**
 * El enlace de Discord que se guarda.
 *
 * Se acepta cualquier URL de Discord (discord.gg, discord.com/invite y el
 * canal directo), pero solo de Discord: este campo acaba siendo un botón que
 * se le enseña a los alumnos, y dejar pasar cualquier URL lo convierte en un
 * sitio cómodo desde el que mandar a la gente a donde sea.
 *
 * Vacío borra el enlace, que es como se quita el botón.
 */
function discordValido(valor) {
  const url = String(valor || '').trim()
  if (!url) return ''
  if (!/^https:\/\/(www\.)?(discord\.gg|discord\.com|discordapp\.com)\//i.test(url)) {
    const e = new Error('El enlace de Discord tiene que empezar por https://discord.gg/ o https://discord.com/')
    e.statusCode = 400
    throw e
  }
  return url.slice(0, 300)
}

// Sesión de miembro: 30 días. No es el panel, es una comunidad — obligar a
// entrar cada 12 horas para ver un curso es una molestia sin ganancia.
const DIAS_SESION = 30

async function sesionMiembro(req) {
  const header = req.headers?.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) { const e = new Error('Sin sesión'); e.statusCode = 401; throw e }
  let payload
  try { payload = await verifyJwt(token) } catch (err) {
    const e = new Error('Sesión no válida: ' + err.message); e.statusCode = 401; throw e
  }
  if (payload.kind !== 'community') {
    // Un JWT del panel no vale como sesión de miembro y viceversa: si se
    // aceptaran indistintamente, un miembro de una comunidad podría usar su
    // token contra los endpoints del panel.
    const e = new Error('Sesión no válida para la comunidad'); e.statusCode = 403; throw e
  }
  const { data } = await supabase
    .from('helm_community_members')
    .select('id, client_id, name, email, status')
    .eq('id', payload.sub).maybeSingle()
  if (!data || data.status !== 'activo') {
    const e = new Error('Tu acceso a esta comunidad ya no está activo'); e.statusCode = 403; throw e
  }
  return data
}

// Datos del perfil + su comunidad a partir del slug de la URL pública.
async function porSlug(slug) {
  const { data: client } = await supabase
    .from('clients')
    .select('id, slug, name, brand_name, brand_subtitle, logo_url, primary_color, active')
    .eq('slug', String(slug || '').toLowerCase()).maybeSingle()
  if (!client || !client.active) return null
  const { data: cfg } = await supabase
    .from('helm_community').select('*').eq('client_id', client.id).maybeSingle()
  return { client, cfg: cfg || null }
}

const marcaDe = (client, cfg) => ({
  nombre: cfg?.name || client.brand_name || client.name,
  subtitulo: client.brand_subtitle || null,
  logo: client.logo_url || null,
  // El color de marca del perfil, para que la página pública de la comunidad
  // no se pinte con el acento de HELM.
  color: client.primary_color || null,
  bienvenida: cfg?.welcome || null,
  // La comunidad puede vivir en Discord: aquí solo viaja el enlace, y la
  // formación y el muro siguen estando en HELM.
  discord: cfg?.discord_url || null,
})

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)
  const gate = rateLimit({ key: `comunidad:${ip}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  try {
    // ═══ PORTAL PÚBLICO ═══════════════════════════════════════════════════
    // GET ?action=portal&slug= → qué pintar en la pantalla de entrada
    if (req.method === 'GET' && action === 'portal') {
      const info = await porSlug(req.query.slug)
      if (!info) return res.status(404).json({ error: 'Esta comunidad no existe' })
      if (!info.cfg?.enabled) {
        return res.status(200).json({ enabled: false, marca: marcaDe(info.client, info.cfg) })
      }
      return res.status(200).json({ enabled: true, marca: marcaDe(info.client, info.cfg) })
    }

    // POST ?action=register { slug, name, email, password }
    if (req.method === 'POST' && action === 'register') {
      const reg = rateLimit({ key: `comunidad:reg:${ip}`, max: 5, windowMs: 10 * 60_000 })
      if (!reg.ok) return res.status(429).json({ error: 'Demasiados registros seguidos. Prueba más tarde.' })

      const { slug, name, email, password } = req.body || {}
      const info = await porSlug(slug)
      if (!info?.cfg?.enabled) return res.status(404).json({ error: 'Esta comunidad no acepta registros' })

      const correo = String(email || '').trim().toLowerCase()
      if (!String(name || '').trim()) return res.status(400).json({ error: 'Dime tu nombre' })
      if (!RE_EMAIL.test(correo)) return res.status(400).json({ error: 'Email no válido' })
      if (String(password || '').length < MIN_PASSWORD) {
        return res.status(400).json({ error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres` })
      }

      const { data: yaEsta } = await supabase.from('helm_community_members')
        .select('id, status').eq('client_id', info.client.id).eq('email', correo).maybeSingle()
      if (yaEsta) {
        return res.status(409).json({
          error: yaEsta.status === 'pendiente'
            ? 'Ya te registraste con ese email: tu acceso está pendiente de aprobación.'
            : 'Ya existe una cuenta con ese email. Entra con tu contraseña.',
        })
      }

      // auto_approve = el dueño ha decidido que entre todo el mundo sin filtro.
      const status = info.cfg.auto_approve ? 'activo' : 'pendiente'
      const { data, error } = await supabase.from('helm_community_members').insert({
        client_id: info.client.id,
        name: String(name).trim().slice(0, 120),
        email: correo,
        password_hash: hashPassword(String(password)),
        status,
        approved_at: status === 'activo' ? new Date().toISOString() : null,
      }).select('id, name, status').single()
      if (error) return res.status(500).json({ error: error.message })

      await writeAudit({
        clientId: info.client.id, action: 'comunidad.registro', req,
        metadata: { email: correo, status },
      })

      const token = status === 'activo'
        ? await signJwt({ kind: 'community', sub: data.id, clientId: info.client.id },
          { expiresIn: 60 * 60 * 24 * DIAS_SESION })
        : null
      return res.status(200).json({ status, token, miembro: { id: data.id, name: data.name } })
    }

    // POST ?action=login { slug, email, password }
    if (req.method === 'POST' && action === 'login') {
      const intento = rateLimit({ key: `comunidad:login:${ip}`, max: 8, windowMs: 5 * 60_000 })
      if (!intento.ok) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' })

      const { slug, email, password } = req.body || {}
      const info = await porSlug(slug)
      if (!info?.cfg?.enabled) return res.status(404).json({ error: 'Esta comunidad no está disponible' })

      const { data: miembro } = await supabase.from('helm_community_members')
        .select('id, name, email, password_hash, status')
        .eq('client_id', info.client.id)
        .eq('email', String(email || '').trim().toLowerCase())
        .maybeSingle()

      if (!miembro || !verifyPassword(String(password || ''), miembro)) {
        return res.status(401).json({ error: 'Email o contraseña incorrectos' })
      }
      if (miembro.status === 'pendiente') {
        return res.status(403).json({ error: 'Tu acceso todavía está pendiente de aprobación.' })
      }
      if (miembro.status === 'bloqueado') {
        return res.status(403).json({ error: 'Tu acceso a esta comunidad está desactivado.' })
      }

      await supabase.from('helm_community_members')
        .update({ last_login_at: new Date().toISOString() }).eq('id', miembro.id)

      const token = await signJwt(
        { kind: 'community', sub: miembro.id, clientId: info.client.id },
        { expiresIn: 60 * 60 * 24 * DIAS_SESION },
      )
      return res.status(200).json({ token, miembro: { id: miembro.id, name: miembro.name } })
    }

    // ═══ ZONA DE MIEMBRO (sesión de comunidad) ════════════════════════════
    if (action === 'me' || action === 'contenido' || action === 'muro') {
      const miembro = await sesionMiembro(req)

      if (req.method === 'GET' && action === 'me') {
        const { data: client } = await supabase.from('clients')
          .select('id, slug, name, brand_name, brand_subtitle, logo_url, primary_color').eq('id', miembro.client_id).single()
        const { data: cfg } = await supabase.from('helm_community')
          .select('*').eq('client_id', miembro.client_id).maybeSingle()
        return res.status(200).json({
          miembro: { id: miembro.id, name: miembro.name, email: miembro.email },
          marca: marcaDe(client, cfg),
        })
      }

      // La formación, ya montada: cursos publicados, con sus módulos dentro y
      // las clases dentro de cada uno. Las clases sin módulo cuelgan del curso.
      if (req.method === 'GET' && action === 'contenido') {
        const [{ data: cursos }, mods, { data: lecciones }] = await Promise.all([
          supabase.from('helm_courses')
            .select('id, title, description, cover_url, position')
            .eq('client_id', miembro.client_id).eq('published', true)
            .order('position').order('created_at'),
          supabase.from('helm_modules')
            .select('id, course_id, title, description, position')
            .eq('client_id', miembro.client_id).eq('published', true)
            .order('position').order('created_at'),
          supabase.from('helm_lessons')
            .select('id, course_id, module_id, title, body, video_url, attachments, position')
            .eq('client_id', miembro.client_id).eq('published', true)
            .order('position').order('created_at'),
        ])
        // Si la migración de módulos no está puesta, `mods.error` y aquí no hay
        // ninguno: la formación se sirve en dos niveles, como antes.
        const modulos = mods.error ? [] : (mods.data || [])
        return res.status(200).json({
          cursos: (cursos || []).map(c => {
            const suyas = (lecciones || []).filter(l => l.course_id === c.id)
            return {
              ...c,
              modulos: modulos.filter(m => m.course_id === c.id).map(m => ({
                ...m, lecciones: suyas.filter(l => l.module_id === m.id),
              })),
              // Solo las sueltas. Una clase de un módulo sin publicar no
              // aparece por ningún lado: ocultar el módulo se lleva sus clases
              // por delante, no las suelta en el curso.
              lecciones: suyas.filter(l => !l.module_id),
            }
          }),
        })
      }

      if (req.method === 'GET' && action === 'muro') {
        const { data } = await supabase.from('helm_community_wall')
          .select('id, member_id, author_name, from_owner, body, parent_id, created_at')
          .eq('client_id', miembro.client_id).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(200)
        return res.status(200).json({ mensajes: (data || []).reverse() })
      }

      if (req.method === 'POST' && action === 'muro') {
        const body = String(req.body?.body || '').trim()
        if (!body) return res.status(400).json({ error: 'Escribe algo' })
        const { data, error } = await supabase.from('helm_community_wall').insert({
          client_id: miembro.client_id,
          member_id: miembro.id,
          author_name: miembro.name,
          from_owner: false,
          body: body.slice(0, 4000),
          parent_id: req.body?.parentId || null,
        }).select('id, member_id, author_name, from_owner, body, parent_id, created_at').single()
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ mensaje: data })
      }

      return res.status(405).json({ error: 'Method not allowed' })
    }

    // ═══ GESTIÓN DESDE EL PANEL ═══════════════════════════════════════════
    const clientId = req.query.clientId || req.body?.clientId
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
    await requireProfileAccess(req, clientId)

    // GET ?action=admin-config → config + URL pública + cuántos hay en cada estado
    if (req.method === 'GET' && action === 'admin-config') {
      const [{ data: client }, { data: cfg }, { data: miembros }] = await Promise.all([
        supabase.from('clients').select('slug, name, brand_name').eq('id', clientId).single(),
        supabase.from('helm_community').select('*').eq('client_id', clientId).maybeSingle(),
        supabase.from('helm_community_members').select('status').eq('client_id', clientId),
      ])
      const cuenta = { pendiente: 0, activo: 0, bloqueado: 0 }
      for (const m of miembros || []) cuenta[m.status] = (cuenta[m.status] || 0) + 1
      const base = process.env.HELM_PUBLIC_URL?.replace(/\/$/, '')
        || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`
      return res.status(200).json({
        config: {
          enabled: cfg?.enabled ?? false,
          name: cfg?.name || '',
          welcome: cfg?.welcome || '',
          auto_approve: cfg?.auto_approve ?? false,
          discord_url: cfg?.discord_url || '',
        },
        url: `${base}/c/${client.slug}`,
        cuenta,
      })
    }

    // POST ?action=admin-config
    if (req.method === 'POST' && action === 'admin-config') {
      const b = req.body || {}
      const { error } = await supabase.from('helm_community').upsert({
        client_id: clientId,
        enabled: Boolean(b.enabled),
        name: String(b.name || '').trim().slice(0, 80) || null,
        welcome: String(b.welcome || '').trim().slice(0, 2000) || null,
        auto_approve: Boolean(b.auto_approve),
        discord_url: discordValido(b.discord_url),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id' })
      if (error) {
        // 42703 = falta la columna. Es siempre lo mismo: una migración sin
        // aplicar. Decirlo así ahorra ir a buscar qué significa el código.
        if (error.code === '42703') {
          return res.status(500).json({ error: 'Falta aplicar migrations/helm_marca_color_discord.sql en Supabase.' })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ ok: true })
    }

    // GET ?action=miembros → la lista, sin hashes
    if (req.method === 'GET' && action === 'miembros') {
      const { data, error } = await supabase.from('helm_community_members')
        .select('id, name, email, status, approved_at, last_login_at, created_at')
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1000)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ miembros: data || [] })
    }

    // POST ?action=miembro-estado { memberId, status }
    if (req.method === 'POST' && action === 'miembro-estado') {
      const { memberId, status } = req.body || {}
      if (!memberId || !ESTADOS.includes(status)) {
        return res.status(400).json({ error: `memberId y status (${ESTADOS.join(', ')}) requeridos` })
      }
      // El where lleva client_id: sin él, quien administra un perfil podría
      // cambiar el estado de un miembro de otro pasando su id.
      const { data, error } = await supabase.from('helm_community_members')
        .update({ status, approved_at: status === 'activo' ? new Date().toISOString() : null })
        .eq('id', memberId).eq('client_id', clientId)
        .select('id, status').maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(404).json({ error: 'Ese miembro no es de esta comunidad' })
      await writeAudit({ clientId, action: 'comunidad.estado_miembro', req, metadata: { memberId, status } })
      return res.status(200).json({ ok: true, ...data })
    }

    // POST ?action=aprobar-todos → los pendientes de golpe
    if (req.method === 'POST' && action === 'aprobar-todos') {
      const { data, error } = await supabase.from('helm_community_members')
        .update({ status: 'activo', approved_at: new Date().toISOString() })
        .eq('client_id', clientId).eq('status', 'pendiente').select('id')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, aprobados: (data || []).length })
    }

    // DELETE ?action=miembro&memberId=
    if (req.method === 'DELETE' && action === 'miembro') {
      const memberId = req.query.memberId || req.body?.memberId
      if (!memberId) return res.status(400).json({ error: 'memberId requerido' })
      const { error } = await supabase.from('helm_community_members')
        .delete().eq('id', memberId).eq('client_id', clientId)
      if (error) return res.status(500).json({ error: error.message })
      await writeAudit({ clientId, action: 'comunidad.borrar_miembro', req, metadata: { memberId } })
      return res.status(200).json({ ok: true })
    }

    // POST ?action=muro-owner { body } → publicar en el muro como el negocio
    if (req.method === 'POST' && action === 'muro-owner') {
      const body = String(req.body?.body || '').trim()
      if (!body) return res.status(400).json({ error: 'Escribe algo' })
      const { data: client } = await supabase.from('clients')
        .select('name, brand_name').eq('id', clientId).single()
      const { data, error } = await supabase.from('helm_community_wall').insert({
        client_id: clientId,
        author_name: client.brand_name || client.name,
        from_owner: true,
        body: body.slice(0, 4000),
        parent_id: req.body?.parentId || null,
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ mensaje: data })
    }

    return res.status(400).json({ error: 'Acción no reconocida' })
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
