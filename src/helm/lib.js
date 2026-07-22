// HELM — capa de datos. Lee/escribe directo a Supabase (RLS "allow all" + anon key).
import { supabase } from '../utils/supabase'

export { supabase }

export const money = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0)

export const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) } catch { return d }
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export function monthStartISO() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)
}

// Lista de clientes (perfiles). El primero activo es el seleccionado por defecto.
export async function listClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, slug, name, client_type, primary_color')
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) { console.warn('[helm] listClients', error.message); return [] }
  return data || []
}

// ── Perfiles (clientes) ────────────────────────────────────────────────────

// Un solo tipo de perfil: Growth. Los demás (consultoría, manufactura,
// logística) eran de la plataforma antigua y ya no se usan.
export const CLIENT_TYPES = [
  { value: 'growth', label: 'Growth' },
]

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/

const DEFAULT_PIPELINE_STAGES = [
  { key: 'lead', label: 'Lead', color: '#64748B' },
  { key: 'contacted', label: 'Contactado', color: '#3B82F6' },
  { key: 'qualified', label: 'Cualificado', color: '#8B5CF6' },
  { key: 'proposal', label: 'Propuesta', color: '#F59E0B' },
  { key: 'won', label: 'Ganado', color: '#22C55E' },
  { key: 'lost', label: 'Perdido', color: '#EF4444' },
]

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

// Crea un perfil de negocio (fila en clients) + su pipeline por defecto y,
// opcionalmente, un usuario de acceso (team admin). Todo scoped a Supabase
// con anon key (RLS allow-all). Devuelve el cliente creado.
export async function createProfile({ name, slug, client_type = 'growth', primary_color, admin } = {}) {
  const cleanName = String(name || '').trim()
  if (!cleanName) throw new Error('El nombre del perfil es obligatorio')
  const cleanSlug = slugify(slug || cleanName)
  if (!SLUG_RE.test(cleanSlug)) throw new Error('URL inválida: usa a-z, 0-9 y guiones (3-40)')

  // Unicidad de slug.
  const { data: dup } = await supabase.from('clients').select('id').eq('slug', cleanSlug).maybeSingle()
  if (dup) throw new Error(`Ya existe un perfil con la URL "${cleanSlug}"`)

  // 1) Cliente
  const row = { slug: cleanSlug, name: cleanName, client_type, active: true, is_demo: false }
  if (primary_color) row.primary_color = primary_color
  const { data: client, error } = await supabase
    .from('clients').insert(row)
    .select('id, slug, name, client_type, primary_color').single()
  if (error) { console.warn('[helm] createProfile', error.message); throw error }

  // 2) Pipeline por defecto (best-effort)
  try {
    await supabase.from('crm_pipelines').insert({
      client_id: client.id, name: 'Pipeline', stages: DEFAULT_PIPELINE_STAGES, is_default: true,
    })
  } catch (e) { console.warn('[helm] createProfile pipeline', e?.message) }

  // 3) Usuario de acceso opcional (login del cliente)
  if (admin?.email && admin?.password) {
    try {
      await supabase.from('team').insert({
        client_id: client.id,
        name: (admin.name || cleanName).trim(),
        email: String(admin.email).trim().toLowerCase(),
        password: String(admin.password), // texto plano: verifyPassword lo soporta
        role: 'admin,ceo,director',
        active: true,
      })
    } catch (e) { console.warn('[helm] createProfile admin', e?.message); throw new Error('Perfil creado, pero falló crear el acceso: ' + (e?.message || e)) }
  }

  return client
}

// Helpers CRUD genéricos scoped a un cliente.
export async function fetchRows(table, clientId, { order = 'created_at', asc = false, limit = 500 } = {}) {
  let q = supabase.from(table).select('*').eq('client_id', clientId).order(order, { ascending: asc }).limit(limit)
  const { data, error } = await q
  if (error) { console.warn(`[helm] fetch ${table}`, error.message); return [] }
  return data || []
}

export async function insertRow(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) { console.warn(`[helm] insert ${table}`, error.message); throw error }
  return data
}

export async function updateRow(table, id, patch) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single()
  if (error) { console.warn(`[helm] update ${table}`, error.message); throw error }
  return data
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) { console.warn(`[helm] delete ${table}`, error.message); throw error }
}

// ── Endpoints del servidor ─────────────────────────────────────────────────
// Lo que no puede ir directo a Supabase desde el navegador: el chat (habla con
// el modelo local del servidor) y Stripe (la clave secreta nunca sale del
// backend). Ambos exigen el JWT de superadmin que guardó el login.
async function apiFetch(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('bw_admin_jwt')
  const r = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await r.json().catch(() => ({}))
  if (r.status === 401) {
    // Sesión sin JWT válido (o caducado): no tiene arreglo desde aquí, hay que
    // volver a entrar. Limpiamos y mandamos al login en vez de dejar la vista
    // colgada con un error que el usuario no puede resolver.
    localStorage.removeItem('bw_admin_jwt')
    localStorage.removeItem('bw_superadmin')
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
  }
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`)
  return data
}

export const chatApi = {
  history: (clientId) => apiFetch(`/api/chat?action=history&clientId=${clientId}`),
  knowledge: (clientId) => apiFetch(`/api/chat?action=knowledge&clientId=${clientId}`),
  send: (clientId, message) => apiFetch('/api/chat?action=send', { method: 'POST', body: { clientId, message } }),
  clearHistory: (clientId) => apiFetch(`/api/chat?action=history&clientId=${clientId}`, { method: 'DELETE' }),
  forget: (id) => apiFetch(`/api/chat?action=knowledge&id=${id}`, { method: 'DELETE', body: { id } }),
  health: () => apiFetch('/api/chat?action=health'),
}

// Stripe por perfil. La clave nunca vuelve al navegador: el backend la
// devuelve enmascarada.
export const stripeApi = {
  status: (clientId) => apiFetch(`/api/stripe?action=status&clientId=${clientId}`),
  link: (clientId, apiKey, webhookSecret) =>
    apiFetch('/api/stripe?action=link', { method: 'POST', body: { clientId, apiKey, webhookSecret } }),
  unlink: (clientId) => apiFetch(`/api/stripe?action=unlink&clientId=${clientId}`, { method: 'DELETE' }),
  sync: (clientId, days = 30) =>
    apiFetch('/api/stripe?action=sync', { method: 'POST', body: { clientId, days } }),
}

// Actividades de un contacto (timeline del CRM), más recientes primero.
export async function fetchActivities(contactId) {
  const { data, error } = await supabase
    .from('crm_activities').select('*')
    .eq('contact_id', contactId)
    .order('performed_at', { ascending: false })
    .limit(100)
  if (error) { console.warn('[helm] fetchActivities', error.message); return [] }
  return data || []
}
