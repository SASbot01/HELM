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

// De la agenda, lectura y `calendar.events`. El segundo es el que deja CREAR la
// reunión cuando un lead reserva su llamada: sin él, la hora quedaba apuntada
// en el CRM pero no aparecía en el calendario de nadie, así que había que
// meterla a mano y era cuestión de tiempo que se solapara con otra cosa.
//
// De Drive, lectura y `drive.file`. Ese último es el que deja crear el
// documento del guion, y está elegido a propósito en vez del `drive` completo:
//
//   · `drive` (escritura total) es un scope RESTRINGIDO. Obliga a pasar la
//     verificación de Google y, además, una auditoría de seguridad anual: son
//     semanas de trámite y un coste recurrente.
//   · `drive.file` NO es sensible. No necesita verificación ninguna, y da
//     acceso solo a los ficheros que crea la propia aplicación. Es exactamente
//     lo que hace falta para dejar el guion en una carpeta, y de paso significa
//     que HELM no puede tocar ni leer el resto del Drive del cliente aunque
//     quisiera.
//
// Son exactamente los que se registran en la pantalla de consentimiento (ver
// docs/google-app.md). Pedir uno de más que no esté allí registrado es motivo
// de `invalid_scope`: calendar.readonly ya incluye leer los eventos, así que
// calendar.events.readonly sobraba.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
]

export const SCOPE_AGENDA = 'https://www.googleapis.com/auth/calendar.events'
export const puedeEscribirEnAgenda = (scopes) =>
  String(scopes || '').includes(SCOPE_AGENDA)

// Quien enlazó Google antes de que existiera `drive.file` tiene un permiso que
// no incluye escribir. El token sigue siendo válido para todo lo de antes, así
// que no se le puede echar: hay que detectarlo y pedirle que vuelva a conectar
// solo cuando vaya a usar algo que escriba.
export const SCOPE_ESCRITURA = 'https://www.googleapis.com/auth/drive.file'
export const puedeEscribirEnDrive = (scopes) =>
  String(scopes || '').includes(SCOPE_ESCRITURA)

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

/**
 * Crea la reunión en el calendario cuando un lead reserva su llamada.
 *
 * Con invitado y con enlace de Meet: si la llamada solo existiera en el
 * calendario del negocio, el lead no tendría ni recordatorio ni por dónde
 * entrar, y la mitad no se presenta. `sendUpdates=all` es lo que hace que le
 * llegue la invitación por correo.
 */
export async function crearEventoEnCalendar(token, {
  calendarId = 'primary', titulo, descripcion, inicio, fin, invitado, zona = 'Europe/Madrid',
}) {
  const cuerpo = {
    summary: String(titulo || 'Llamada').slice(0, 300),
    description: String(descripcion || '').slice(0, 4000),
    start: { dateTime: new Date(inicio).toISOString(), timeZone: zona },
    end: { dateTime: new Date(fin).toISOString(), timeZone: zona },
    ...(invitado ? { attendees: [{ email: invitado }] } : {}),
    // requestId tiene que ser único por evento: si se repite, Google devuelve
    // el Meet del evento anterior y dos llamadas distintas comparten sala.
    conferenceData: {
      createRequest: {
        requestId: `helm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  }

  const params = new URLSearchParams({
    conferenceDataVersion: '1',
    sendUpdates: invitado ? 'all' : 'none',
  })
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    const e = new Error(`Calendar respondió ${res.status}: ${detalle.slice(0, 200)}`)
    e.statusCode = res.status
    throw e
  }
  const ev = await res.json()
  return {
    id: ev.id,
    htmlLink: ev.htmlLink || null,
    meet: ev.hangoutLink || ev.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri || null,
  }
}

// ─── Avisos de cobro en el calendario ───────────────────────────────────────
//
// Son otra cosa que las llamadas de arriba: no hay invitado, no hay Meet y no
// se manda correo a nadie. Es una nota para el dueño del calendario, con los
// recordatorios puestos a mano para que suenen cuando tienen que sonar.
//
// Todos llevan la misma marca en `extendedProperties.private`. Eso es lo que
// permite volver a pasar la sincronización mañana sin duplicar nada: se
// buscan por la marca, se comparan con lo que toca y se borra lo que sobra.
// Sin la marca habría que adivinar por el título, y el primer aviso que el
// dueño renombrase a mano se duplicaría para siempre.
export const MARCA_AVISO = 'helm-cobros'

/** Los avisos que HELM ya tiene puestos en ese tramo del calendario. */
export async function listarAvisosHelm(token, { calendarId = 'primary', timeMin, timeMax, marca = MARCA_AVISO }) {
  const eventos = []
  let pageToken = null
  for (let i = 0; i < 6; i++) {
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', maxResults: '250',
      privateExtendedProperty: `helmAviso=${marca}`,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await apiGet(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
    eventos.push(...(page.items || []))
    pageToken = page.nextPageToken
    if (!pageToken) break
  }
  return eventos
}

/**
 * El cuerpo de un aviso. Fuera de las funciones de red porque lo usan las dos
 * —crear y actualizar— y porque así se puede comparar antes de tocar nada.
 *
 * `avisoHorasAntes` son las 48 h que pidió Hugo, en minutos. El recordatorio a
 * 0 minutos es el del día: salta a la hora del evento.
 */
export function cuerpoDeAviso({ titulo, descripcion, dia, hora = 9, duracionMin = 15, zona = 'Europe/Madrid', clave, marca = MARCA_AVISO, avisoHorasAntes = 48 }) {
  const inicio = `${dia}T${String(hora).padStart(2, '0')}:00:00`
  const fin = `${dia}T${String(hora).padStart(2, '0')}:${String(duracionMin).padStart(2, '0')}:00`
  return {
    summary: String(titulo || 'Cobro').slice(0, 300),
    description: String(descripcion || '').slice(0, 4000),
    // Sin `Z`: la hora es local de Madrid y la zona va aparte. Con Z, el aviso
    // de las 9:00 saltaría a las 11:00 en verano.
    start: { dateTime: inicio, timeZone: zona },
    end: { dateTime: fin, timeZone: zona },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 0 },
        { method: 'popup', minutes: avisoHorasAntes * 60 },
        { method: 'email', minutes: avisoHorasAntes * 60 },
      ],
    },
    extendedProperties: { private: { helmAviso: marca, helmClave: String(clave) } },
  }
}

async function calendarWrite(token, url, method, cuerpo) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok && res.status !== 410) {   // 410 = ya estaba borrado, da igual
    const detalle = await res.text().catch(() => '')
    const e = new Error(`Calendar respondió ${res.status}: ${detalle.slice(0, 200)}`)
    e.statusCode = res.status
    throw e
  }
  return method === 'DELETE' ? null : res.json()
}

export const crearAviso = (token, calendarId, cuerpo) =>
  calendarWrite(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, 'POST', cuerpo)

export const actualizarAviso = (token, calendarId, eventId, cuerpo) =>
  calendarWrite(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, 'PATCH', cuerpo)

export const borrarAviso = (token, calendarId, eventId) =>
  calendarWrite(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, 'DELETE')

/**
 * Baja una hoja de cálculo de Google como CSV.
 *
 * Por `export` de Drive y no por la API de Sheets a propósito: Sheets sería un
 * scope más que registrar y volver a consentir, y para leer una tabla plana no
 * aporta nada. Con `drive.readonly`, que HELM ya tiene, esto funciona tal cual.
 * Solo baja la PRIMERA pestaña, que es lo que devuelve el export sin gid.
 */
export async function exportarHojaComoCSV(token, fileId, { gid } = {}) {
  const params = new URLSearchParams({ mimeType: 'text/csv' })
  if (gid != null) params.set('gid', String(gid))
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    const e = new Error(`Drive respondió ${res.status} al exportar la hoja: ${detalle.slice(0, 200)}`)
    e.statusCode = res.status
    throw e
  }
  return res.text()
}

// Crea un Google Doc con el guion dentro de la carpeta indicada.
//
// Va por subida multipart y no por la API de Google Docs (que sería otro scope
// y otra verificación): se manda el texto como text/plain y se le pide a Drive
// que lo convierta a documento nativo con `mimeType` de destino. El resultado es
// un Doc editable, que es lo que espera quien lo abre.
export async function crearDocEnDrive(token, { nombre, texto, folderId }) {
  const LIMITE = '-------helm-guion-limite'
  const meta = {
    name: String(nombre || 'Guion').slice(0, 200),
    mimeType: 'application/vnd.google-apps.document',
    ...(folderId ? { parents: [folderId] } : {}),
  }
  const cuerpo = [
    `--${LIMITE}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(meta),
    `--${LIMITE}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    String(texto || ''),
    `--${LIMITE}--`,
    '',
  ].join('\r\n')

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${LIMITE}`,
      },
      body: cuerpo,
    },
  )
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    // 403 con este scope casi siempre es una carpeta que no creó HELM: con
    // drive.file solo se puede escribir en lo propio. Merece un mensaje que lo
    // diga, porque el de Google no lo explica.
    const e = new Error(
      res.status === 403
        ? 'Google no deja escribir en esa carpeta. Con el permiso de HELM (drive.file) solo se puede escribir en carpetas creadas desde aquí.'
        : `Drive respondió ${res.status}: ${detalle.slice(0, 200)}`,
    )
    e.statusCode = res.status
    throw e
  }
  return res.json()
}

// Crea la carpeta donde irán los guiones y devuelve su id. Con `drive.file`,
// HELM solo puede escribir dentro de lo que ha creado él, así que la carpeta
// tiene que nacer aquí: no vale pegar el id de una carpeta hecha a mano.
export async function crearCarpetaEnDrive(token, { nombre, parentId } = {}) {
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(nombre || 'Guiones').slice(0, 200),
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
  )
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    const e = new Error(`No se pudo crear la carpeta: ${detalle.slice(0, 200)}`)
    e.statusCode = res.status
    throw e
  }
  return res.json()
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
