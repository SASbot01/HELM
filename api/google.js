// HELM — Google Calendar y Google Drive por perfil de negocio.
//
// El perfil enlaza SU cuenta de Google desde Ajustes con un OAuth normal (el
// botón manda a Google, Google vuelve al callback). El refresh token se guarda
// en `user_integrations` y nunca sale del servidor.
//
// Qué hace con cada cosa:
//   · Calendar → las reuniones que parecen llamadas caen en helm_calls, que es
//     lo que pinta la vista "Llamadas".
//   · Drive    → explorar la unidad e importar documentos a la Biblioteca, que
//     es el contexto que lee la IA del chat.
//
// Acciones:
//   GET    ?action=status     &clientId=
//   GET    ?action=auth-url   &clientId=          → URL a la que mandar al usuario
//   GET    ?action=callback   &code=&state=       → vuelta de Google (pública)
//   POST   ?action=config     { clientId, ... }   → filtro de llamadas, calendario
//   POST   ?action=sync-calls { clientId }        → importa la ventana a helm_calls
//   GET    ?action=calendars  &clientId=
//   GET    ?action=drive      &clientId=&q=&folderId=&pageToken=
//   POST   ?action=drive-import { clientId, fileId, contactId }
//   DELETE ?action=unlink     &clientId=
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit, signJwt, verifyJwt } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import {
  FILTROS, googleAuthUrl, googleRedirectUri, googleCredsMissing, exchangeCode,
  getAccessToken, getGoogleConfig, saveGoogleConfig, getUserInfo, listCalendars,
  listCalendarEvents, listDriveFiles, getDriveFile, readDriveFileText,
  driveFileIsReadable, looksLikeCall, meetUrlOf,
  puedeEscribirEnDrive, puedeEscribirEnAgenda,
} from './_lib/google.js'

const DIAS_ATRAS = 30
const DIAS_ADELANTE = 60

// Origen público de la app, para volver del callback al panel del perfil.
function appOrigin(req) {
  if (process.env.HELM_PUBLIC_URL) return process.env.HELM_PUBLIC_URL.replace(/\/$/, '')
  const fwdHost = req.headers['x-forwarded-host']
  if (fwdHost) return `${req.headers['x-forwarded-proto'] || 'https'}://${fwdHost}`
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:5173'}`
}

// Fecha/hora de un evento de Google. Los de todo el día traen `date` en vez de
// `dateTime`; se guardan a las 00:00 locales y marcados como all_day.
function eventStart(ev) {
  if (ev.start?.dateTime) return { iso: new Date(ev.start.dateTime).toISOString(), allDay: false }
  if (ev.start?.date) return { iso: new Date(`${ev.start.date}T00:00:00`).toISOString(), allDay: true }
  return null
}
function eventEnd(ev) {
  if (ev.end?.dateTime) return new Date(ev.end.dateTime).toISOString()
  if (ev.end?.date) return new Date(`${ev.end.date}T00:00:00`).toISOString()
  return null
}

// Lo que HELM guarda de un evento. Solo campos que vienen de Google: el estado,
// las notas y el contacto son del usuario y la sincronización no los toca.
function callFromEvent(ev, calendarId) {
  const start = eventStart(ev)
  if (!start) return null
  return {
    google_event_id: ev.id,
    google_calendar_id: calendarId,
    html_link: ev.htmlLink || null,
    title: (ev.summary || '(sin título)').slice(0, 300),
    starts_at: start.iso,
    ends_at: eventEnd(ev),
    all_day: start.allDay,
    attendees: (ev.attendees || [])
      .filter(a => !a.resource)
      .map(a => ({ email: a.email || null, name: a.displayName || null, status: a.responseStatus || null, self: a.self === true })),
    organizer_email: ev.organizer?.email || null,
    location: ev.location || null,
    meet_url: meetUrlOf(ev),
    description: ev.description ? String(ev.description).slice(0, 4000) : null,
    source: 'google',
    updated_at: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)
  const gate = rateLimit({ key: `google:${ip}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
  }

  // ── GET ?action=callback ─────────────────────────────────────────────────
  // Aquí vuelve el navegador desde Google, sin cabecera de sesión: lo que
  // autentica la petición es el `state`, que es un JWT que firmamos nosotros al
  // dar la URL de autorización y caduca en 10 minutos.
  if (req.method === 'GET' && action === 'callback') {
    const origin = appOrigin(req)
    // writeHead y no res.redirect: el segundo solo existe en el runtime de
    // Vercel, y el servidor de desarrollo (scripts/api-server.mjs) no lo tiene.
    const volver = (slug, params) => {
      res.writeHead(302, { Location: `${origin}/${slug || 'admin'}?${new URLSearchParams(params)}` })
      return res.end()
    }

    const { code, state, error: oauthError } = req.query
    let payload = null
    try {
      payload = await verifyJwt(String(state || ''))
      if (payload.kind !== 'google-oauth') throw new Error('state inesperado')
    } catch {
      return volver('admin', { google: 'error', msg: 'La conexión ha caducado. Inténtalo otra vez desde Ajustes.' })
    }
    if (oauthError || !code) {
      return volver(payload.slug, { google: 'error', msg: oauthError === 'access_denied' ? 'Has cancelado la conexión con Google.' : 'Google no ha devuelto el permiso.' })
    }

    try {
      const tokens = await exchangeCode(String(code), googleRedirectUri(req))
      const info = await getUserInfo(tokens.access_token).catch(() => ({}))
      const prev = (await getGoogleConfig(supabase, payload.clientId))?.config || {}

      await saveGoogleConfig(supabase, payload.clientId, {
        ...prev,
        // Google solo manda refresh_token la primera vez de cada consentimiento:
        // si no viene, conservamos el que ya teníamos.
        refreshToken: tokens.refresh_token || prev.refreshToken || null,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
        scopes: tokens.scope || null,
        email: info.email || prev.email || null,
        name: info.name || prev.name || null,
        picture: info.picture || prev.picture || null,
        calendarId: prev.calendarId || 'primary',
        filtro: prev.filtro || 'videollamada',
        palabra: prev.palabra || '',
        diasAtras: prev.diasAtras ?? DIAS_ATRAS,
        diasAdelante: prev.diasAdelante ?? DIAS_ADELANTE,
      })
      await writeAudit({ clientId: payload.clientId, action: 'google.linked', req, metadata: { email: info.email } })
      return volver(payload.slug, { google: 'ok' })
    } catch (err) {
      return volver(payload.slug, { google: 'error', msg: err.message })
    }
  }

  // ── El resto exige sesión con permiso sobre el perfil ────────────────────
  const clientId = req.query.clientId || req.body?.clientId
  // Un solo perfil por petición: el que se comprueba es el que se usa. Si
  // vienen los dos (URL y cuerpo) y no coinciden, no se adivina cuál vale.
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  const { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('id', clientId).maybeSingle()
  if (!client) return res.status(404).json({ error: 'Perfil no encontrado' })

  try {
    // ── GET ?action=status ─────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'status') {
      const row = await getGoogleConfig(supabase, clientId)
      const cfg = row?.config || {}
      return res.status(200).json({
        linked: Boolean(row?.enabled && cfg.refreshToken),
        // Sin credenciales de la app de Google no hay nada que enlazar: la
        // tarjeta de Ajustes lo dice en vez de dar un botón que falla.
        appConfigured: !googleCredsMissing(),
        redirectUri: googleRedirectUri(req),
        email: cfg.email || null,
        name: cfg.name || null,
        picture: cfg.picture || null,
        calendarId: cfg.calendarId || 'primary',
        filtro: cfg.filtro || 'videollamada',
        palabra: cfg.palabra || '',
        diasAtras: cfg.diasAtras ?? DIAS_ATRAS,
        diasAdelante: cfg.diasAdelante ?? DIAS_ADELANTE,
        lastSyncAt: cfg.lastSyncAt || null,
        updatedAt: row?.updated_at || null,
        // Escritura en Drive. `puedeEscribir` distingue a quien enlazó antes de
        // que existiera el permiso: su token vale para todo lo de antes, así
        // que no se le echa — se le pide reconectar solo cuando toca escribir.
        puedeEscribir: puedeEscribirEnDrive(cfg.scopes),
        puedeAgendar: puedeEscribirEnAgenda(cfg.scopes),
      })
    }

    // ── GET ?action=auth-url ───────────────────────────────────────────────
    if (req.method === 'GET' && action === 'auth-url') {
      if (googleCredsMissing()) {
        return res.status(400).json({
          error: 'Al servidor le faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. Ver docs/google-app.md.',
        })
      }
      const state = await signJwt(
        { kind: 'google-oauth', clientId, slug: client.slug },
        { expiresIn: 600 },
      )
      const prev = (await getGoogleConfig(supabase, clientId))?.config || {}
      return res.status(200).json({
        url: googleAuthUrl({ state, redirectUri: googleRedirectUri(req), loginHint: prev.email }),
      })
    }

    // ── DELETE ?action=unlink ──────────────────────────────────────────────
    if (req.method === 'DELETE' && action === 'unlink') {
      const row = await getGoogleConfig(supabase, clientId)
      if (row) {
        const { error } = await supabase.from('user_integrations').delete().eq('id', row.id)
        if (error) return res.status(500).json({ error: error.message })
      }
      await writeAudit({ clientId, action: 'google.unlinked', req })
      return res.status(200).json({ linked: false })
    }

    // ── POST ?action=config ────────────────────────────────────────────────
    // Qué calendario se mira y qué cuenta como llamada.
    if (req.method === 'POST' && action === 'config') {
      const row = await getGoogleConfig(supabase, clientId)
      if (!row?.config?.refreshToken) return res.status(400).json({ error: 'Este perfil no tiene Google enlazado' })
      const b = req.body || {}
      const next = {
        ...row.config,
        calendarId: b.calendarId || row.config.calendarId || 'primary',
        filtro: FILTROS.includes(b.filtro) ? b.filtro : (row.config.filtro || 'videollamada'),
        palabra: typeof b.palabra === 'string' ? b.palabra.slice(0, 200) : (row.config.palabra || ''),
        diasAtras: Math.min(Math.max(Number(b.diasAtras) || row.config.diasAtras || DIAS_ATRAS, 1), 365),
        diasAdelante: Math.min(Math.max(Number(b.diasAdelante) || row.config.diasAdelante || DIAS_ADELANTE, 1), 365),
      }
      await saveGoogleConfig(supabase, clientId, next)
      return res.status(200).json({ success: true, ...next, refreshToken: undefined, accessToken: undefined })
    }

    // ── GET ?action=calendars ──────────────────────────────────────────────
    if (req.method === 'GET' && action === 'calendars') {
      const { token } = await getAccessToken(supabase, clientId)
      const list = await listCalendars(token)
      return res.status(200).json({
        calendars: (list.items || []).map(c => ({
          id: c.id, name: c.summary, primary: c.primary === true, color: c.backgroundColor || null,
        })),
      })
    }

    // ── POST ?action=sync-calls ────────────────────────────────────────────
    if (req.method === 'POST' && action === 'sync-calls') {
      const { token, config: cfg } = await getAccessToken(supabase, clientId)
      const diasAtras = Math.min(Math.max(Number(req.body?.diasAtras) || cfg.diasAtras || DIAS_ATRAS, 1), 365)
      const diasAdelante = Math.min(Math.max(Number(req.body?.diasAdelante) || cfg.diasAdelante || DIAS_ADELANTE, 1), 365)
      const calendarId = cfg.calendarId || 'primary'
      const timeMin = new Date(Date.now() - diasAtras * 86_400_000).toISOString()
      const timeMax = new Date(Date.now() + diasAdelante * 86_400_000).toISOString()

      const events = await listCalendarEvents(token, { calendarId, timeMin, timeMax })

      // Lo que ya teníamos de Google en esta ventana, para decidir alta o
      // actualización sin pedirle a la base una consulta por evento.
      const { data: existentes } = await supabase
        .from('helm_calls')
        .select('id, google_event_id, status')
        .eq('client_id', clientId)
        .not('google_event_id', 'is', null)
      const porEvento = new Map((existentes || []).map(r => [r.google_event_id, r]))

      // Emails del CRM, para colgar cada llamada de su ficha automáticamente.
      const { data: contactos } = await supabase
        .from('crm_contacts').select('id, email').eq('client_id', clientId).limit(5000)
      const porEmail = new Map(
        (contactos || [])
          .filter(c => c.email)
          .map(c => [String(c.email).toLowerCase(), c.id]),
      )

      const nuevas = []
      let actualizadas = 0
      let canceladas = 0
      let descartados = 0
      const errores = []

      for (const ev of events) {
        const ya = porEvento.get(ev.id)

        // Evento borrado en Google: si lo teníamos y seguía en pie, se marca
        // cancelado. Si el usuario ya le puso un estado, se respeta.
        if (ev.status === 'cancelled') {
          if (ya && ya.status === 'agendada') {
            const { error } = await supabase.from('helm_calls')
              .update({ status: 'cancelada', updated_at: new Date().toISOString() }).eq('id', ya.id)
            if (error) errores.push(error.message)
            else canceladas++
          }
          continue
        }

        if (!looksLikeCall(ev, cfg)) { if (!ya) descartados++; continue }

        const fila = callFromEvent(ev, calendarId)
        if (!fila) { descartados++; continue }

        if (ya) {
          const { error } = await supabase.from('helm_calls').update(fila).eq('id', ya.id)
          if (error) errores.push(error.message)
          else actualizadas++
        } else {
          // Contacto del CRM por el email de un invitado que no seas tú.
          const invitado = fila.attendees.find(a => a.email && !a.self)
          nuevas.push({
            ...fila,
            client_id: clientId,
            status: 'agendada',
            contact_id: invitado ? porEmail.get(String(invitado.email).toLowerCase()) || null : null,
          })
        }
      }

      // Alta en bloques: un insert de 400 filas de golpe es lo que hace que
      // Supabase devuelva 413 y se pierda la sincronización entera.
      for (let i = 0; i < nuevas.length; i += 100) {
        const { error } = await supabase.from('helm_calls').insert(nuevas.slice(i, i + 100))
        if (error) errores.push(error.message)
      }

      await saveGoogleConfig(supabase, clientId, { ...cfg, lastSyncAt: new Date().toISOString() })
      await writeAudit({ clientId, action: 'google.sync_calls', req, metadata: { nuevas: nuevas.length, actualizadas } })

      return res.status(200).json({
        revisados: events.length,
        nuevas: nuevas.length,
        actualizadas,
        canceladas,
        descartados,
        ventana: { diasAtras, diasAdelante },
        errores,
      })
    }

    // ── GET ?action=drive ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'drive') {
      const { token } = await getAccessToken(supabase, clientId)
      const page = await listDriveFiles(token, {
        q: req.query.q || undefined,
        folderId: req.query.folderId || undefined,
        pageToken: req.query.pageToken || undefined,
      })
      return res.status(200).json({
        files: (page.files || []).map(f => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          isFolder: f.mimeType === 'application/vnd.google-apps.folder',
          readable: driveFileIsReadable(f.mimeType),
          modifiedTime: f.modifiedTime,
          size: f.size ? Number(f.size) : null,
          link: f.webViewLink || null,
        })),
        nextPageToken: page.nextPageToken || null,
      })
    }

    // ── POST ?action=drive-import ──────────────────────────────────────────
    // Trae el texto de un documento de Drive a la Biblioteca, que es el
    // contexto que el chat le pasa a la IA.
    if (req.method === 'POST' && action === 'drive-import') {
      const { fileId, contactId } = req.body || {}
      if (!fileId) return res.status(400).json({ error: 'fileId requerido' })
      // La ficha a la que se cuelga tiene que ser de este perfil.
      if (contactId) {
        const { data: ficha } = await supabase.from('crm_contacts').select('id')
          .eq('id', contactId).eq('client_id', clientId).maybeSingle()
        if (!ficha) return res.status(404).json({ error: 'Ese contacto no es de este perfil' })
      }

      const { token } = await getAccessToken(supabase, clientId)
      const file = await getDriveFile(token, fileId)
      const texto = await readDriveFileText(token, file)
      if (!texto.trim()) return res.status(400).json({ error: `"${file.name}" está vacío` })

      const { data, error } = await supabase.from('helm_library').insert({
        client_id: clientId,
        kind: 'documento',
        title: file.name,
        content: texto,
        file_url: file.webViewLink || '',
        file_name: file.name,
        contact_id: contactId || null,
        tags: ['drive'],
        in_context: true,
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })

      await writeAudit({ clientId, action: 'google.drive_import', req, metadata: { fileId, name: file.name } })
      return res.status(200).json({ document: data, chars: texto.length })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
