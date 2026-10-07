// HELM — cliente de WooCommerce, sin SDK: llama a la REST API v3 vía fetch.
//
// Mismo planteamiento que Stripe: las credenciales NO vienen de una env var
// global, se pasan por parámetro. Cada perfil enlaza SU tienda desde Ajustes y
// sus claves viven en `user_integrations` (tabla con RLS que niega el acceso
// anónimo — solo la toca el servidor).
//
// Woo se autentica con consumer key + consumer secret. Sobre HTTPS van en
// Basic Auth; sobre HTTP, Woo los aceptaría por query string, pero eso manda
// las credenciales en claro y queda en los logs del servidor: aquí se exige
// HTTPS y punto.

const TIMEOUT_MS = 20_000

class WooError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

// Normaliza la URL de la tienda: sin barra final, sin la ruta de la API si el
// usuario la pegó entera (es el error de copiar y pegar más habitual).
export function normalizeStoreUrl(raw) {
  let url = String(raw || '').trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  url = url.replace(/\/+$/, '')
  url = url.replace(/\/wp-json(\/wc\/v\d+)?$/i, '')
  return url
}

export function validateStoreUrl(raw) {
  const url = normalizeStoreUrl(raw)
  if (!url) return { ok: false, error: 'Falta la URL de la tienda' }
  let parsed
  try { parsed = new URL(url) } catch { return { ok: false, error: 'La URL de la tienda no es válida' } }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'La tienda debe usar HTTPS: por HTTP las claves viajarían en claro' }
  }
  return { ok: true, url }
}

export async function wooRequest(cfg, path, { method = 'GET', params = null } = {}) {
  const { storeUrl, consumerKey, consumerSecret } = cfg || {}
  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw new WooError('Esta cuenta no tiene WooCommerce enlazado.', 400)
  }

  const url = new URL(`${storeUrl}/wp-json/wc/v3${path}`)
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  let res
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // Un dominio que no resuelve o una tienda caída no es un fallo nuestro:
    // se dice claramente en vez de soltar un "fetch failed".
    throw new WooError(
      err.name === 'TimeoutError'
        ? 'La tienda no respondió a tiempo'
        : `No se pudo conectar con la tienda (${err.message})`,
      502,
    )
  }

  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* respuesta no-JSON */ }

  if (!res.ok) {
    // Cuando WordPress devuelve su HTML de error (plugin desactivado, permalinks
    // sin configurar), `json` viene vacío y el código HTTP es lo único útil.
    const detalle = json?.message
      || (res.status === 404 ? 'No se encontró la REST API de WooCommerce en esa URL' : `HTTP ${res.status}`)
    throw new WooError(detalle, res.status)
  }

  return { data: json, headers: res.headers }
}

export function wooFor(cfg) {
  return {
    // Comprueba credenciales y devuelve algo identificable de la tienda.
    // Woo no tiene un endpoint "cuenta": el de datos del sistema es el que
    // requiere permisos de lectura y confirma que las claves valen.
    async check() {
      const { data } = await wooRequest(cfg, '/system_status')
      return {
        name: data?.settings?.title || data?.environment?.site_url || cfg.storeUrl,
        siteUrl: data?.environment?.site_url || cfg.storeUrl,
        wooVersion: data?.environment?.version || null,
        currency: data?.settings?.currency || 'EUR',
      }
    },
    orders: {
      // Pedidos de una ventana de tiempo. Woo pagina de 100 en 100.
      list: (params) => wooRequest(cfg, '/orders', { params: { per_page: 100, ...params } }),
      retrieve: (id) => wooRequest(cfg, `/orders/${id}`),
    },
  }
}

// Recorre todas las páginas de pedidos de una ventana. `X-WP-TotalPages` dice
// cuántas hay; sin ese tope, una tienda grande entraría en bucle.
export async function listAllOrders(cfg, { after, status = 'completed,processing', maxPages = 20 }) {
  const todos = []
  for (let page = 1; page <= maxPages; page++) {
    const { data, headers } = await wooRequest(cfg, '/orders', {
      params: { per_page: 100, page, after, status, orderby: 'date', order: 'desc' },
    })
    if (!Array.isArray(data) || data.length === 0) break
    todos.push(...data)
    const total = Number(headers.get('x-wp-totalpages') || 0)
    if (!total || page >= total) break
  }
  return todos
}

// ── Config por perfil ──────────────────────────────────────────────────────
// Vive en user_integrations: { client_id, service:'woo', enabled, config }
// config = { storeUrl, consumerKey, consumerSecret, webhookSecret, storeName, currency }

export async function getWooConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'woo')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveWooConfig(supabase, clientId, config, enabled = true) {
  const existing = await getWooConfig(supabase, clientId)
  const row = {
    client_id: clientId,
    service: 'woo',
    config,
    enabled,
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    const { error } = await supabase.from('user_integrations').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('user_integrations').insert(row)
    if (error) throw error
  }
}

// Nunca devolvemos las claves al frontend: solo los 4 últimos caracteres.
export function maskKey(key) {
  if (!key) return null
  return { masked: `••••••••${String(key).slice(-4)}` }
}
