// HELM — cliente Stripe mínimo, sin SDK: llama a api.stripe.com vía fetch.
//
// Diferencia con la versión del proyecto anterior: la clave NO viene de una
// env var global, se pasa por parámetro. Cada perfil de negocio enlaza SU
// cuenta de Stripe desde Ajustes y su clave vive en `user_integrations`
// (tabla con RLS que niega el acceso anónimo — solo la toca el servidor).

const STRIPE_BASE = 'https://api.stripe.com/v1'

// Stripe habla form-urlencoded, incluido lo anidado: metadata[x]=y.
export function encodeForm(obj, prefix = '') {
  const pairs = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') {
          pairs.push(...encodeForm(item, `${key}[${i}]`).split('&').filter(Boolean))
        } else {
          pairs.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else if (typeof v === 'object') {
      pairs.push(...encodeForm(v, key).split('&').filter(Boolean))
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    }
  }
  return pairs.join('&')
}

export async function stripeRequest(apiKey, path, { method = 'GET', body = null, idempotencyKey = null } = {}) {
  if (!apiKey) {
    const e = new Error('Esta cuenta no tiene Stripe enlazado.')
    e.statusCode = 400
    throw e
  }
  const headers = { Authorization: `Bearer ${apiKey}` }
  let reqBody
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    reqBody = encodeForm(body)
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const url = method === 'GET' && body
    ? `${STRIPE_BASE}${path}?${encodeForm(body)}`
    : `${STRIPE_BASE}${path}`

  const res = await fetch(url, { method, headers, body: reqBody, signal: AbortSignal.timeout(20_000) })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* respuesta no-JSON */ }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Stripe ${res.status}`)
    err.statusCode = res.status
    err.stripeError = json?.error
    throw err
  }
  return json
}

// API de alto nivel. Todas las llamadas reciben la clave del perfil.
export function stripeFor(apiKey) {
  const req = (path, opts) => stripeRequest(apiKey, path, opts)
  return {
    account: {
      retrieve: () => req('/account'),
    },
    customers: {
      create: (data, opts) => req('/customers', { method: 'POST', body: data, ...opts }),
      retrieve: (id) => req(`/customers/${id}`),
      list: (params) => req('/customers', { body: params }),
    },
    products: {
      create: (data, opts) => req('/products', { method: 'POST', body: data, ...opts }),
      retrieve: (id) => req(`/products/${id}`),
      update: (id, data) => req(`/products/${id}`, { method: 'POST', body: data }),
      list: (params) => req('/products', { body: params }),
    },
    prices: {
      create: (data, opts) => req('/prices', { method: 'POST', body: data, ...opts }),
      list: (params) => req('/prices', { body: params }),
    },
    checkoutSessions: {
      create: (data, opts) => req('/checkout/sessions', { method: 'POST', body: data, ...opts }),
      retrieve: (id) => req(`/checkout/sessions/${id}`),
      lineItems: (id) => req(`/checkout/sessions/${id}/line_items`, { body: { limit: 5 } }),
      list: (params) => req('/checkout/sessions', { body: params }),
    },
    paymentIntents: {
      list: (params) => req('/payment_intents', { body: params }),
    },
    charges: {
      list: (params) => req('/charges', { body: params }),
    },
    invoices: {
      list: (params) => req('/invoices', { body: params }),
    },
    billingPortal: {
      sessions: {
        create: (data) => req('/billing_portal/sessions', { method: 'POST', body: data }),
      },
    },
  }
}

// ── Config por perfil ──────────────────────────────────────────────────────
// Vive en user_integrations: { client_id, service:'stripe', enabled, config }
// config = { apiKey, webhookSecret, accountName, accountId, livemode }

export async function getStripeConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'stripe')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveStripeConfig(supabase, clientId, config, enabled = true) {
  const existing = await getStripeConfig(supabase, clientId)
  const row = {
    client_id: clientId,
    service: 'stripe',
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

// Nunca devolvemos la clave al frontend: solo los 4 últimos caracteres.
export function maskKey(key) {
  if (!key) return null
  const tail = String(key).slice(-4)
  const kind = String(key).startsWith('sk_live') || String(key).startsWith('rk_live') ? 'live' : 'test'
  return { masked: `••••••••${tail}`, kind }
}
