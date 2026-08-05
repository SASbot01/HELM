// HELM — capa de datos. Lee/escribe directo a Supabase (RLS "allow all" + anon key).
import { supabase } from '../utils/supabase'
import { esDeEsteProducto, productoActual } from './producto'
import { DEFAULT_STAGES, DEFAULT_SUBSTAGES } from './crm/pipeline'

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
    // logo_url / brand_name / brand_subtitle son la marca blanca: con ellos el
    // panel se pinta con la identidad del negocio en vez de con la de HELM.
    .select('id, slug, name, client_type, primary_color, logo_url, brand_name, brand_subtitle')
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) { console.warn('[helm] listClients', error.message); return [] }
  // Cada dominio enseña solo los perfiles de SU producto: en HELM no aparecen
  // los despachos y en el vertical de consultoría no aparecen los
  // infoproductores. Se filtra aquí, que es por donde pasan todas las listas.
  return (data || []).filter(c => esDeEsteProducto(c))
}

// ── Perfiles (clientes) ────────────────────────────────────────────────────

// Un solo tipo de perfil: Growth. Los demás (consultoría, manufactura,
// logística) eran de la plataforma antigua y ya no se usan.
export const CLIENT_TYPES = [
  { value: 'growth', label: 'Growth' },
]

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/


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
    // Las mismas etapas que usa el CRM, no una copia aparte: cuando eran dos
    // listas distintas, los perfiles nuevos nacían con claves en inglés y sin
    // la etapa de seguimiento.
    await supabase.from('crm_pipelines').insert({
      client_id: client.id, name: 'Pipeline', is_default: true,
      stages: DEFAULT_STAGES, substages: DEFAULT_SUBSTAGES,
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

// Igual que fetchRows pero devolviendo el error en vez de tragárselo. Lo usan
// las secciones cuyas tablas llegan en una migración aparte (Servicios,
// Equipo): si la migración no está aplicada, la vista lo dice en vez de
// quedarse vacía sin explicar por qué.
export async function fetchRowsOrError(table, clientId, { order = 'created_at', asc = false, limit = 500 } = {}) {
  const { data, error } = await supabase
    .from(table).select('*').eq('client_id', clientId).order(order, { ascending: asc }).limit(limit)
  if (error) {
    console.warn(`[helm] fetch ${table}`, error.message)
    // 42P01 = la tabla no existe todavía.
    const missing = error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')
    return { rows: [], error: missing ? MISSING_TABLE : error.message }
  }
  return { rows: data || [], error: null }
}

export const MISSING_TABLE = 'MISSING_TABLE'

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

// ── Ventas canceladas ──────────────────────────────────────────────────────
// Borrar una venta de verdad es una mala idea: se pierde el histórico y, si
// vino de Stripe, la siguiente importación la vuelve a crear. En su lugar se
// marca como cancelada y deja de contar en Informe, Finanzas y en los totales
// de Ventas, pero sigue consultable en su propio apartado.
//
// Se usa la columna `status`, que ya existía, para no depender de ninguna
// migración: los valores vivos son 'won' (alta manual) y 'Completada' (Stripe).
export const SALE_CANCELLED = 'cancelada'
export const isSaleCancelled = (row) =>
  String(row?.status || '').toLowerCase().trim() === SALE_CANCELLED
export const activeSales = (rows) => (rows || []).filter(r => !isSaleCancelled(r))

export const cancelSale = (id) => updateRow('sales', id, { status: SALE_CANCELLED })
export const restoreSale = (id) => updateRow('sales', id, { status: 'won' })

// Cuotas que quedan por cobrar de un pago fraccionado. null si es pago único.
// Lo usan Ventas (columna "Cobro") e Informe (KPI de cobro pendiente).
export const cuotasPendientes = (v) => {
  const total = Number(v?.installments_total) || 0
  if (!total) return null
  return Math.max(0, total - (Number(v.installments_paid) || 0))
}

// ── Archivos ───────────────────────────────────────────────────────────────
// Un único bucket público ('helm') para adjuntos de contenido, documentos de la
// biblioteca y contratos. Las rutas van namespaced por perfil, así todo lo de
// un cliente cuelga del mismo prefijo.

export const MAX_UPLOAD_MB = 25

// Nombre de archivo seguro: sin acentos, espacios ni caracteres raros, y con
// un sufijo aleatorio para que dos "guion.pdf" no se pisen.
function safeName(name) {
  const clean = String(name || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  return `${Math.random().toString(36).slice(2, 8)}-${clean || 'archivo'}`
}

export async function uploadFile(clientId, folder, file) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`El archivo pesa más de ${MAX_UPLOAD_MB} MB`)
  }
  const path = `${clientId}/${folder}/${safeName(file.name)}`
  const { error } = await supabase.storage.from('helm').upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || undefined,
  })
  if (error) {
    console.warn('[helm] upload', error.message)
    // Sin bucket, el mensaje de Supabase ("Bucket not found") no le dice nada a
    // quien está usando la app: se traduce a lo que hay que hacer.
    if (/bucket/i.test(error.message)) {
      throw new Error('Falta el almacén de archivos. Aplica migrations/helm_operativa.sql en Supabase.')
    }
    throw error
  }
  const { data } = supabase.storage.from('helm').getPublicUrl(path)
  return { name: file.name, url: data.publicUrl, path, type: file.type || '', size: file.size }
}

// URL pública a partir de la ruta en el bucket.
//
// Hace falta porque no todo lo que hay en el almacén lo sube el navegador: el
// chat y el onboarding escriben archivos desde el servidor, y allí Supabase se
// llama a sí mismo por su dirección interna (127.0.0.1). Esa URL guardada no
// abre desde fuera. Con la ruta, que sí es estable, el enlace se reconstruye
// aquí para el origen desde el que se esté mirando el panel.
export function publicUrl(path) {
  if (!path) return ''
  return supabase.storage.from('helm').getPublicUrl(path).data.publicUrl
}

export async function deleteFile(path) {
  if (!path) return
  const { error } = await supabase.storage.from('helm').remove([path])
  if (error) console.warn('[helm] deleteFile', error.message)
}

// ── Marca blanca ───────────────────────────────────────────────────────────
// Cada perfil pone su logo, su nombre y su subtítulo, y el panel entero se ve
// como software suyo. Los valores viven en la fila de `clients`; si faltan, se
// cae al nombre del perfil y a la marca HELM.

export const DEFAULT_SUBTITLE = 'OPERATING LAYER'
export const MAX_LOGO_MB = 2

export const brandOf = (client) => ({
  name: (client?.brand_name || client?.name || productoActual().nombre).trim(),
  subtitle: (client?.brand_subtitle ?? DEFAULT_SUBTITLE),
  logo: client?.logo_url || '',
})

// Sube el logo al bucket público. Se usa desde Ajustes (con perfil ya creado)
// y desde el registro público, donde todavía no hay id: en ese caso cuelga de
// `registro/` y se queda ahí, que es una carpeta y no un problema.
export async function uploadLogo(file, clientId) {
  if (!/^image\//.test(file.type || '')) throw new Error('El logo tiene que ser una imagen (PNG, JPG o SVG)')
  if (file.size > MAX_LOGO_MB * 1024 * 1024) throw new Error(`El logo pesa más de ${MAX_LOGO_MB} MB`)
  const { url } = await uploadFile(clientId || 'registro', 'marca', file)
  return url
}

// Guarda la marca del perfil. Devuelve la fila para refrescar la cabecera sin
// recargar la página.
export async function saveBrand(clientId, { brand_name, brand_subtitle, logo_url }) {
  const { data, error } = await supabase.from('clients')
    .update({
      brand_name: brand_name?.trim() || null,
      brand_subtitle: brand_subtitle?.trim() || null,
      logo_url: logo_url || null,
    })
    .eq('id', clientId)
    .select('id, slug, name, client_type, primary_color, logo_url, brand_name, brand_subtitle')
    .single()
  if (error) {
    console.warn('[helm] saveBrand', error.message)
    // 42703 = la columna no existe: falta aplicar migrations/helm_marca.sql.
    if (error.code === '42703' || /column .* does not exist|schema cache/i.test(error.message)) {
      throw new Error('Falta aplicar migrations/helm_marca.sql en Supabase.')
    }
    throw error
  }
  return data
}

export const humanSize = (bytes) => {
  const n = Number(bytes) || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
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
    localStorage.removeItem('bw_client')
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
  }
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`)
  return data
}

// Registro público (sin token): crea negocio + acceso pendientes de aprobación.
export async function registerAccount(payload) {
  const r = await fetch('/api/register?action=register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`)
  return data
}

// Panel de usuarios (superadmin) + marca de guía vista (usuario).
export const usersApi = {
  list: () => apiFetch('/api/users?action=list'),
  setActive: (type, id, active) => apiFetch('/api/users?action=set-active', { method: 'POST', body: { type, id, active } }),
  guideDone: () => apiFetch('/api/users?action=guide-done', { method: 'POST' }),
}

export const chatApi = {
  history: (clientId) => apiFetch(`/api/chat?action=history&clientId=${clientId}`),
  knowledge: (clientId) => apiFetch(`/api/chat?action=knowledge&clientId=${clientId}`),
  send: (clientId, message) => apiFetch('/api/chat?action=send', { method: 'POST', body: { clientId, message } }),
  clearHistory: (clientId) => apiFetch(`/api/chat?action=history&clientId=${clientId}`, { method: 'DELETE' }),
  forget: (clientId, id) => apiFetch(`/api/chat?action=knowledge&id=${id}&clientId=${clientId}`, { method: 'DELETE' }),
  health: () => apiFetch('/api/chat?action=health'),
}

// Accesos al panel para la gente del equipo. Pasa por el servidor porque la
// contraseña hay que hashearla allí, no en el navegador.
export const equipoApi = {
  grant: (clientId, personId, { email, password, level }) =>
    apiFetch('/api/equipo?action=grant', { method: 'POST', body: { clientId, personId, email, password, level } }),
  revoke: (clientId, personId) =>
    apiFetch('/api/equipo?action=revoke', { method: 'POST', body: { clientId, personId } }),
}

// Niveles de acceso al panel. Es distinto del ROL de la persona (closer,
// setter, CSM): el rol dice lo que hace, el nivel cuánto puede tocar.
export const NIVELES_ACCESO = [
  { key: 'propietario', label: 'Propietario', desc: 'Manda sobre todo el perfil. No le afectan los permisos por rol.' },
  { key: 'admin', label: 'Administrador', desc: 'Puede editarlo todo salvo la configuración de accesos.' },
  { key: 'miembro', label: 'Miembro', desc: 'Solo edita lo que permita la matriz de permisos de su rol.' },
]

// WooCommerce por perfil. Mismo contrato que stripeApi: las claves se quedan
// en el servidor y solo vuelven enmascaradas.
export const wooApi = {
  status: (clientId) => apiFetch(`/api/woo?action=status&clientId=${clientId}`),
  link: (clientId, body) => apiFetch('/api/woo?action=link', { method: 'POST', body: { clientId, ...body } }),
  unlink: (clientId) => apiFetch(`/api/woo?action=unlink&clientId=${clientId}`, { method: 'DELETE' }),
  sync: (clientId, days = 60) =>
    apiFetch('/api/woo?action=sync', { method: 'POST', body: { clientId, days } }),
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

// Google (Calendar + Drive) por perfil. El refresh token se queda en el
// servidor; aquí solo se pide la URL de autorización y se disparan las
// sincronizaciones.
export const googleApi = {
  status: (clientId) => apiFetch(`/api/google?action=status&clientId=${clientId}`),
  authUrl: (clientId) => apiFetch(`/api/google?action=auth-url&clientId=${clientId}`),
  unlink: (clientId) => apiFetch(`/api/google?action=unlink&clientId=${clientId}`, { method: 'DELETE' }),
  config: (clientId, body) => apiFetch('/api/google?action=config', { method: 'POST', body: { clientId, ...body } }),
  calendars: (clientId) => apiFetch(`/api/google?action=calendars&clientId=${clientId}`),
  carpetaGuiones: (clientId) =>
    apiFetch('/api/google?action=drive-carpeta-guiones', { method: 'POST', body: { clientId } }),
  syncCalls: (clientId, body = {}) =>
    apiFetch('/api/google?action=sync-calls', { method: 'POST', body: { clientId, ...body } }),
  drive: (clientId, { q, folderId, pageToken } = {}) => apiFetch(
    `/api/google?action=drive&clientId=${clientId}`
    + (q ? `&q=${encodeURIComponent(q)}` : '')
    + (folderId ? `&folderId=${encodeURIComponent(folderId)}` : '')
    + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''),
  ),
  driveImport: (clientId, fileId, contactId) =>
    apiFetch('/api/google?action=drive-import', { method: 'POST', body: { clientId, fileId, contactId } }),
}

// ── Comunidad ──────────────────────────────────────────────────────────────
// El único hilo común a todos los perfiles. No se filtra por client_id a
// propósito: el sentido de la sección es que la gente se lea entre negocios.

export const COMMUNITY_PAGE = 200

export async function fetchCommunity() {
  const { data, error } = await supabase
    .from('helm_community_messages')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(COMMUNITY_PAGE)
  if (error) {
    console.warn('[helm] fetchCommunity', error.message)
    const missing = error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')
    return { rows: [], error: missing ? MISSING_TABLE : error.message }
  }
  // Se piden los últimos y se pintan en orden de conversación.
  return { rows: (data || []).reverse(), error: null }
}

export async function postCommunity(msg) {
  const { data, error } = await supabase.from('helm_community_messages').insert(msg).select().single()
  if (error) { console.warn('[helm] postCommunity', error.message); throw error }
  return data
}

// Borrado blando: el mensaje desaparece del hilo pero no deja un hueco en las
// respuestas de los demás.
export async function deleteCommunity(id) {
  const { error } = await supabase.from('helm_community_messages')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) { console.warn('[helm] deleteCommunity', error.message); throw error }
}

// ── Comunidad interna (lado panel) ─────────────────────────────────────────
// La comunidad y la formación de ESTE perfil, con sus miembros. Distinto de
// fetchCommunity(), que es el hilo común de todos los negocios de HELM.
export const internaApi = {
  config: (clientId) => apiFetch(`/api/comunidad?action=admin-config&clientId=${clientId}`),
  guardarConfig: (clientId, body) =>
    apiFetch('/api/comunidad?action=admin-config', { method: 'POST', body: { clientId, ...body } }),
  miembros: (clientId) => apiFetch(`/api/comunidad?action=miembros&clientId=${clientId}`),
  estado: (clientId, memberId, status) =>
    apiFetch('/api/comunidad?action=miembro-estado', { method: 'POST', body: { clientId, memberId, status } }),
  aprobarTodos: (clientId) =>
    apiFetch('/api/comunidad?action=aprobar-todos', { method: 'POST', body: { clientId } }),
  borrarMiembro: (clientId, memberId) =>
    apiFetch(`/api/comunidad?action=miembro&clientId=${clientId}&memberId=${memberId}`, { method: 'DELETE' }),
  publicar: (clientId, body, parentId) =>
    apiFetch('/api/comunidad?action=muro-owner', { method: 'POST', body: { clientId, body, parentId } }),
}

// ── Comunidad interna (lado miembro) ───────────────────────────────────────
// El portal público. Sesión propia, guardada por comunidad: alguien puede ser
// miembro de dos y no tiene por qué compartir sesión entre ellas. Y NO usa
// apiFetch a propósito: ese redirige al login del panel al recibir un 401, que
// es justo lo que no debe pasarle a un alumno.
const MIEMBRO_KEY = (slug) => `helm_miembro_${slug}`
export const tokenMiembro = (slug) => {
  try { return localStorage.getItem(MIEMBRO_KEY(slug)) } catch { return null }
}
export const guardarTokenMiembro = (slug, token) => {
  try {
    if (token) localStorage.setItem(MIEMBRO_KEY(slug), token)
    else localStorage.removeItem(MIEMBRO_KEY(slug))
  } catch { /* incógnito: la sesión se pierde al cerrar, y ya */ }
}

async function miembroFetch(slug, path, { method = 'GET', body, conToken = true } = {}) {
  const token = conToken ? tokenMiembro(slug) : null
  const r = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(data?.error || `Error ${r.status}`)
    err.statusCode = r.status
    throw err
  }
  return data
}

export const miembroApi = {
  portal: (slug) => miembroFetch(slug, `/api/comunidad?action=portal&slug=${encodeURIComponent(slug)}`, { conToken: false }),
  registro: (slug, body) => miembroFetch(slug, '/api/comunidad?action=register', { method: 'POST', body: { slug, ...body }, conToken: false }),
  login: (slug, body) => miembroFetch(slug, '/api/comunidad?action=login', { method: 'POST', body: { slug, ...body }, conToken: false }),
  me: (slug) => miembroFetch(slug, '/api/comunidad?action=me'),
  contenido: (slug) => miembroFetch(slug, '/api/comunidad?action=contenido'),
  muro: (slug) => miembroFetch(slug, '/api/comunidad?action=muro'),
  escribir: (slug, body, parentId) => miembroFetch(slug, '/api/comunidad?action=muro', { method: 'POST', body: { body, parentId } }),
}

// ── Onboarding ─────────────────────────────────────────────────────────────
// Las respuestas viven en helm_onboarding (un documento por perfil y formulario).
// Al completarlo, se regeneran los bloques de helm_knowledge con source
// 'onboarding:<form>' para que el chat los use en su system prompt.

// Documento de onboarding de un perfil (o null si aún no existe).
export async function getOnboarding(clientId, form = 'contenido') {
  const { data, error } = await supabase
    .from('helm_onboarding').select('*')
    .eq('client_id', clientId).eq('form', form).maybeSingle()
  if (error) { console.warn('[helm] getOnboarding', error.message); return null }
  return data || null
}

// Guarda (o crea) el borrador. Upsert por (client_id, form).
export async function saveOnboardingDraft(clientId, answers, form = 'contenido') {
  const { data, error } = await supabase.from('helm_onboarding').upsert({
    client_id: clientId, form, answers, status: 'draft', updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,form' }).select().single()
  if (error) { console.warn('[helm] saveOnboardingDraft', error.message); throw error }
  return data
}

// Generación y gestión de la Biblia (pasa por el servidor: el modelo local solo
// escucha en el backend). El onboarding se marca completado al generar.
export const onboardingApi = {
  biblia: (clientId) => apiFetch(`/api/onboarding?action=biblia&clientId=${clientId}`),
  generate: (clientId, kind, dossier) =>
    apiFetch('/api/onboarding?action=generate', { method: 'POST', body: { clientId, kind, dossier } }),
  saveBiblia: (clientId, kind, content) =>
    apiFetch('/api/onboarding?action=save', { method: 'POST', body: { clientId, kind, content } }),
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
