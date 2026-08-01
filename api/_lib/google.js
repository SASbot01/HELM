// HELM — Google (Calendar + Drive) por perfil de negocio.
//
// Mismo contrato que Stripe y Woo: la credencial vive en `user_integrations`
// (service='google'), que tiene RLS negando al rol anónimo, así que el
// navegador nunca ve el refresh token. Aquí solo hay OAuth y llamadas HTTP;
// la lógica de negocio (qué evento es una llamada, cómo se guarda) está en
// api/google.js.
//
// Sin SDK a propósito: googleapis pesa ~50 MB y en una función serverless eso
// es tiempo de arranque. Los tres endpoints que usamos son fetch normales.

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'

// Solo lectura: HELM refleja lo que hay en Google, no escribe en la agenda ni
// en el Drive de nadie. Pedir permisos de escritura obligaría además a pasar
// la verificación de Google, que tarda semanas.
//
// Son exactamente los cuatro que se registran en la pantalla de consentimiento
// (ver docs/google-app.md). Pedir uno de más que no esté allí registrado es
// motivo de `invalid_scope`: calendar.readonly ya incluye leer los eventos, así
// que calendar.events.readonly sobraba.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
]

export const googleCredsMissing = () =>
  !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET

// La URL que Google tiene registrada como redirect. Debe coincidir carácter a
// carácter con la del panel de Google Cloud, así que manda la variable de
// entorno; lo demás es deducción para desarrollo.
export function googleRedirectUri(req) {
  const path = '/api/google?action=callback'
  if (process.env.HELM_PUBLIC_URL) {
    return `${process.env.HELM_PUBLIC_URL.replace(/\/$/, '')}${path}`
  }
  const fwdHost = req?.headers?.['x-forwarded-host']
  if (fwdHost) return `${req.headers['x-forwarded-proto'] || 'https'}://${fwdHost}${path}`
  try {
    const ref = req?.headers?.referer || req?.headers?.origin
    if (ref) return `${new URL(ref).origin}${path}`
  } catch { /* referer inválido: seguimos con host */ }
  return `${req?.headers?.['x-forwarded-proto'] || 'http'}://${req?.headers?.host || 'localhost:5173'}${path}`
}

export function googleAuthUrl({ state, redirectUri, loginHint }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // offline + consent es lo que garantiza un refresh_token. Sin `consent`,
    // la segunda vez que alguien enlaza la misma cuenta Google no lo manda y
    // la conexión se muere en cuanto caduca el access token.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  if (loginHint) params.set('login_hint', loginHint)
  return `${OAUTH_AUTH}?${params}`
}

async function tokenRequest(body) {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(json?.error_description || json?.error || `Google ${res.status}`)
    err.statusCode = res.status
    throw err
  }
  return json
}

export const exchangeCode = (code, redirectUri) => tokenRequest({
  code,
  client_id: process.env.GOOGLE_CLIENT_ID || '',
  client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirect_uri: redirectUri,
  grant_type: 'authorization_code',
})

export const refreshAccessToken = (refreshToken) => tokenRequest({
  refresh_token: refreshToken,
  client_id: process.env.GOOGLE_CLIENT_ID || '',
  client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
  grant_type: 'refresh_token',
})

// ── Config por perfil ──────────────────────────────────────────────────────
// config = { refreshToken, accessToken, expiresAt, email, name, picture,
//            scopes, calendarId, filtro, palabra, diasAtras, diasAdelante,
//            lastSyncAt }

export async function getGoogleConfig(supabase, clientId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('id, config, enabled, updated_at')
    .eq('client_id', clientId).eq('service', 'google')
    .is('member_id', null)
    .maybeSingle()
  return data || null
}

export async function saveGoogleConfig(supabase, clientId, config, enabled = true) {
  const existing = await getGoogleConfig(supabase, clientId)
  const row = {
    client_id: clientId,
    service: 'google',
    config,
    enabled,
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    const { error } = await supabase.from('user_integrations').update(row).eq('id', existing.id)
    if (error) throw error
    return { ...existing, ...row }
  }
  const { data, error } = await supabase.from('user_integrations').insert(row).select().single()
  if (error) throw error
  return data
}

/**
 * Access token válido para este perfil, refrescándolo si hace falta.
 *
 * Google da tokens de una hora; guardamos el vigente en la config para no
 * pedir uno nuevo en cada petición (y para no gastar cuota de refresh).
 *
 * @throws error con statusCode 400 si el perfil no tiene Google enlazado, o
 *         401 si Google ha revocado el permiso (hay que volver a enlazar).
 */
export async function getAccessToken(supabase, clientId) {
  const row = await getGoogleConfig(supabase, clientId)
  const cfg = row?.config || {}
  if (!cfg.refreshToken) {
    const e = new Error('Este perfil no tiene Google enlazado')
    e.statusCode = 400
    throw e
  }
  // 60 s de margen: un token que caduca mientras viaja la petición es un 401
  // imposible de depurar desde fuera.
  if (cfg.accessToken && cfg.expiresAt && Date.now() < cfg.expiresAt - 60_000) {
    return { token: cfg.accessToken, config: cfg, row }
  }

  let fresh
  try {
    fresh = await refreshAccessToken(cfg.refreshToken)
  } catch (err) {
    // invalid_grant = el usuario revocó el acceso o cambió la contraseña.
    const e = new Error(
      /invalid_grant/i.test(err.message)
        ? 'Google ha revocado el acceso. Vuelve a enlazar la cuenta desde Ajustes.'
        : `Google: ${err.message}`,
    )
    e.statusCode = 401
    throw e
  }

  const next = {
    ...cfg,
    accessToken: fresh.access_token,
    expiresAt: Date.now() + (Number(fresh.expires_in) || 3600) * 1000,
  }
  await saveGoogleConfig(supabase, clientId, next)
  return { token: fresh.access_token, config: next, row }
}

// ── Llamadas a la API ──────────────────────────────────────────────────────

async function apiGet(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `Google ${res.status}`
    try { msg = JSON.parse(text)?.error?.message || msg } catch { /* respuesta no-JSON */ }
    const err = new Error(msg)
    err.statusCode = res.status
    throw err
  }
  return res.json()
}

export const getUserInfo = (token) => apiGet(token, USERINFO)

export const listCalendars = (token) =>
  apiGet(token, `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=100`)

/**
 * Eventos de un calendario en una ventana de tiempo, ya expandidos (las series
 * recurrentes vienen como instancias sueltas: es lo que se pinta en un
 * calendario). Pagina hasta agotar la ventana o llegar a `maxPages`.
 */
export async function listCalendarEvents(token, {
  calendarId = 'primary', timeMin, timeMax, maxPages = 6,
} = {}) {
  const events = []
  let pageToken = null
  for (let i = 0; i < maxPages; i++) {
    const params = new URLSearchParams({
      timeMin, timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      showDeleted: 'true',   // para poder marcar como cancelada la que se borró
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await apiGet(
      token,
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    )
    events.push(...(page.items || []))
    pageToken = page.nextPageToken
    if (!pageToken) break
  }
  return events
}

export function listDriveFiles(token, { q, pageToken, pageSize = 40, folderId } = {}) {
  // Papelera fuera siempre; lo demás se compone encima.
  const clauses = ['trashed = false']
  if (folderId) clauses.push(`'${folderId.replace(/'/g, "\\'")}' in parents`)
  if (q) clauses.push(`name contains '${String(q).replace(/'/g, "\\'")}'`)
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: String(Math.min(Math.max(pageSize, 1), 100)),
    orderBy: 'folder,modifiedTime desc',
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  })
  if (pageToken) params.set('pageToken', pageToken)
  return apiGet(token, `${DRIVE_API}/files?${params}`)
}

export const getDriveFile = (token, fileId) =>
  apiGet(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,size,webViewLink&supportsAllDrives=true`)

// Tipos de Google (Docs, Sheets, Slides) que sabemos convertir a texto plano.
const EXPORTABLE = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
}
// Archivos que ya son texto y se descargan tal cual.
const PLAIN = /^(text\/|application\/json$|application\/xml$)/

export const driveFileIsReadable = (mimeType) =>
  Boolean(EXPORTABLE[mimeType]) || PLAIN.test(mimeType || '')

/**
 * Texto de un archivo de Drive, para meterlo en la Biblioteca (el contexto de
 * la IA). Un PDF o un .docx no se lee: extraerlo requiere un conversor que
 * HELM no tiene, y devolver basura sería peor que decirlo.
 */
export async function readDriveFileText(token, file, { maxChars = 200_000 } = {}) {
  const mime = file.mimeType || ''
  let url
  if (EXPORTABLE[mime]) {
    url = `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(EXPORTABLE[mime])}`
  } else if (PLAIN.test(mime)) {
    url = `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`
  } else {
    const e = new Error(
      `"${file.name}" es ${mime || 'un tipo desconocido'} y no se puede leer como texto. ` +
      'Conviértelo a Documento de Google o pega su contenido a mano en la Biblioteca.',
    )
    e.statusCode = 400
    throw e
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const err = new Error(`Google Drive ${res.status} al leer "${file.name}"`)
    err.statusCode = res.status
    throw err
  }
  const text = await res.text()
  return text.length > maxChars ? text.slice(0, maxChars) + '\n\n[…recortado]' : text
}

// ── ¿Qué evento es una llamada? ────────────────────────────────────────────
//
// Un calendario tiene de todo: recordatorios, bloques de trabajo, el dentista.
// Por defecto contamos como llamada lo que tiene con quién hablar — invitados
// o un enlace de videollamada — que es exactamente lo que agenda un closer.
// Quien prefiera otra cosa lo cambia en Ajustes.

export const FILTROS = ['videollamada', 'invitados', 'palabra', 'todos']

export function meetUrlOf(event) {
  if (event.hangoutLink) return event.hangoutLink
  const point = (event.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video')
  if (point?.uri) return point.uri
  // Zoom, Meet o Whereby pegados a mano en la ubicación o la descripción.
  const hay = `${event.location || ''} ${event.description || ''}`
  const m = hay.match(/https?:\/\/[^\s<>"]*(zoom\.us|meet\.google\.com|whereby\.com|teams\.microsoft\.com)[^\s<>"]*/i)
  return m ? m[0] : null
}

export function looksLikeCall(event, cfg = {}) {
  const filtro = FILTROS.includes(cfg.filtro) ? cfg.filtro : 'videollamada'
  if (filtro === 'todos') return true

  if (filtro === 'palabra') {
    const palabras = String(cfg.palabra || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!palabras.length) return false
    const hay = `${event.summary || ''} ${event.description || ''}`.toLowerCase()
    return palabras.some(p => hay.includes(p))
  }

  // Los invitados propios no cuentan: un evento donde el único "asistente" eres
  // tú es un bloque de agenda, no una llamada.
  const invitados = (event.attendees || []).filter(a => !a.self && !a.resource)
  if (filtro === 'invitados') return invitados.length > 0
  return Boolean(meetUrlOf(event)) || invitados.length > 0
}
