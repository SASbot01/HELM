// HELM — Calendly por perfil.
//
// Al contrario que Stripe/Woo, Calendly no tiene claim de "secreto de firma":
// se enlaza con un Token de Acceso Personal (PAT), que el propio usuario saca
// de Calendly → Integrations → API & Webhooks. Vive en `user_integrations`,
// igual que Stripe — nunca en una columna de `clients` ni al alcance del rol
// anónimo.
const API = 'https://api.calendly.com'

async function req(token, path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = data?.message || data?.title || `Calendly respondió ${r.status}`
    const e = new Error(r.status === 401 ? 'Token no válido o caducado.' : msg)
    e.statusCode = r.status === 401 ? 401 : 502
    throw e
  }
  return data
}

/** Verifica el token y devuelve los datos de la cuenta (nombre, slug, enlace). */
export async function verificarToken(token) {
  const { resource: u } = await req(token, '/users/me')
  return {
    uri: u.uri, name: u.name, slug: u.slug, email: u.email,
    schedulingUrl: u.scheduling_url, avatarUrl: u.avatar_url,
    orgUri: u.current_organization,
  }
}

/** Próximos eventos agendados en la cuenta (para asomarlos en Llamadas). */
export async function eventosProgramados(token, orgUri, { count = 20 } = {}) {
  const params = new URLSearchParams({
    organization: orgUri, status: 'active', sort: 'start_time:asc',
    min_start_time: new Date().toISOString(), count: String(count),
  })
  const { collection } = await req(token, `/scheduled_events?${params}`)
  return (collection || []).map(e => ({
    uri: e.uri, name: e.name, start: e.start_time, end: e.end_time,
    location: e.location?.location || e.location?.type || '',
    status: e.status,
  }))
}

// ── Config por perfil ──────────────────────────────────────────────────────
// user_integrations: { client_id, service:'calendly', enabled, config }
// config = { token, uri, name, slug, email, schedulingUrl, orgUri }

export async function getCalendlyConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'calendly')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveCalendlyConfig(supabase, clientId, config, enabled = true) {
  const existing = await getCalendlyConfig(supabase, clientId)
  const row = { client_id: clientId, service: 'calendly', config, enabled, updated_at: new Date().toISOString() }
  if (existing) {
    const { error } = await supabase.from('user_integrations').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('user_integrations').insert(row)
    if (error) throw error
  }
}
