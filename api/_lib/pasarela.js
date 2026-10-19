// HELM — la puerta del panel a la base de datos (/api/db).
//
// El panel lee y escribe tablas directamente (src/helm/lib.js, con
// supabase-js). Hasta ahora lo hacía con la clave pública, que va dentro del
// JS que se descarga cualquiera, y con reglas "todo vale" en la base: quien
// sacara la clave podía leer y escribir el CRM de todos los perfiles. Con una
// sola agencia era un riesgo; con agencias de fuera sería enseñarle a cada una
// los clientes de las demás.
//
// Ahora el panel habla con esta puerta con SU sesión (el JWT del login). Aquí
// se comprueba quién es, se le recortan las peticiones a los perfiles que puede
// ver y se reenvían a la Supabase local con la clave de servicio. La clave
// pública ya no abre ninguna tabla.
//
// Qué se deja pasar:
//   · /rest/v1/<tabla>                     leer y escribir filas
//   · /storage/v1/object/helm/<perfil>/…   subir y borrar archivos
//   · /storage/v1/object/public/helm/…     ver archivos (sin sesión: son enlaces)
//
// Cómo se recorta, según la tabla:
//   · con columna client_id → solo filas de tus perfiles, al leer, al
//     cambiar, al borrar y al crear
//   · clients               → tus perfiles; crear y cambiar, solo el
//                             administrador de la agencia; borrar, nunca (eso
//                             va por api/perfiles.js, con copia)
//   · helm_collaborations   → las que salen o llegan a un perfil tuyo
//   · el resto, y las que guardan secretos → no
//
// La plataforma (quien cuida del sistema) ve todos los perfiles, pero las
// tablas de secretos tampoco las abre por aquí.
import { supabase } from '../lib/supabase.js'
import { validateAuth } from './auth.js'
import { perfilesVisibles, olvidarVisibles } from './access.js'

const BASE = () => process.env.SUPABASE_URL || 'http://localhost:54321'
const CLAVE = () => process.env.SUPABASE_SERVICE_KEY || ''
const NINGUNO = '00000000-0000-0000-0000-000000000000'
const MAX_CUERPO = 30 * 1024 * 1024

// Credenciales, tokens y dinero: solo el servidor, con sus propios endpoints.
const SECRETAS = new Set([
  'superadmins', 'user_integrations', 'agent_mcp_tokens', 'agencias', 'agencia_movimientos',
  'audit_logs', 'portal_tokens',
  'helm_telegram_vinculos', 'helm_telegram_conversaciones', 'helm_telegram_aprobaciones',
  // Las altas públicas: datos de contacto de quien aún no tiene perfil.
  'helm_altas',
  // El setter de Instagram: DM privados de terceros (api/setter-ig.js).
  'helm_setter_ig', 'helm_ig_conversaciones', 'helm_ig_mensajes',
  // Trial reels: los trabajos de vídeo, solo por api/trial-reels.js.
  'helm_trial_reels',
  // Web Creator: estudio y prompt de cada web, solo por api/web-creator.js.
  'helm_web_creator', 'helm_web_fabricacion',
  // La oficina de cada agente: el chat va por api/agente-oficina.js.
  'helm_agente_chat',
])

// LISTA BLANCA: las únicas tablas que el panel toca por aquí (las que usa
// src/; tests/pasarela.test.js comprueba que no falta ninguna). Antes era una
// lista negra y quedaban abiertas, para cualquier sesión de su perfil, tablas
// heredadas con secretos que el panel ni usa (whatsapp_config, email_config,
// calendly_auth, console_api_keys…). Una tabla nueva del panel se añade aquí.
export const PANEL = new Set([
  'ceo_finance_entries', 'clients', 'crm_activities', 'crm_contacts', 'crm_pipelines', 'crm_tasks',
  'helm_calls', 'helm_collaborations', 'helm_content_calendar', 'helm_documentos_venta',
  'helm_fiscal_avisos', 'helm_fiscal_obligaciones', 'helm_fiscal_perfil', 'helm_form_responses',
  'helm_forms', 'helm_gastos', 'helm_ig_media', 'helm_library', 'helm_links', 'helm_onboarding',
  'helm_permissions', 'helm_services', 'helm_team', 'helm_virales', 'products', 'reports', 'sales', 'team',
])

// Lo que PostgREST acepta y el panel usa. PUT y compañía, fuera.
const METODOS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'])

// `team` guarda los accesos (con su contraseña). El panel solo lee nombres
// para asignar tareas; escribir va por api/equipo.js.
const COLUMNAS_TEAM = new Set(['id', 'name', 'client_id', 'active', 'role', 'email'])
// Parámetros de PostgREST que no filtran por ninguna columna.
const NO_FILTRAN = new Set(['select', 'limit', 'offset', 'on_conflict', 'columns'])

// Quien manda en un perfil: propietario ('admin,ceo,director') o admin ('admin'),
// igual que api/equipo.js.
const nivelTotal = (nivel) => String(nivel || '').split(',').map(s => s.trim()).includes('admin')

/**
 * En `team` solo se puede filtrar y ordenar por las columnas que se dejan
 * leer: si no, un filtro sobre password_hash (`like.scrypt:ab*`) contesta sí o
 * no y deja sacar el hash de la contraseña de un compañero letra a letra.
 */
function revisaFiltrosTeam(query) {
  const fuera = (c) => !COLUMNAS_TEAM.has(c)
  for (const [k, v] of query) {
    if (NO_FILTRAN.has(k)) continue
    if (k === 'order') {
      const cols = v.split(',').map(s => s.trim().split('.')[0]).filter(Boolean)
      if (cols.some(fuera)) throw prohibido('Por ese campo de team no se puede ordenar')
      continue
    }
    // El panel no usa or/and en team (solo client_id, active y orden por
    // nombre): fuera del todo, mejor que intentar leer dentro (con comillas o
    // anidados se colaría una columna).
    if (/(^|\.)(or|and)$/.test(k)) throw prohibido('Por esos campos de team no se puede filtrar')
    if (fuera(k)) throw prohibido('Por esos campos de team no se puede filtrar')
  }
}

// Solo el administrador de la agencia: qué perfiles existen y qué secciones
// ve cada uno. Un acceso de cliente podría, si no, darse secciones a sí mismo.
const SOLO_ADMIN_ESCRIBE = new Set(['clients', 'helm_permissions'])

// Columnas que solo escribe el servidor: `helm_team.login_id` cuelga una
// persona del equipo de un acceso (team); cambiarlo a mano sería apuntarla al
// acceso de otro perfil y luego cambiarle la contraseña por api/equipo.js.
const SOLO_SERVIDOR = { helm_team: ['login_id'], clients: ['agencia_id'] }

// Tablas a las que se puede saltar desde otra en un `select` (la ficha de un
// formulario desde su respuesta). Lo incrustado no pasa por el recorte, así
// que solo se permite lo que sabemos que es del mismo perfil.
const INCRUSTABLES = new Set(['helm_forms'])

// Cabeceras de la petición que entiende PostgREST/Storage y se reenvían.
const PASAN = ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'accept-profile',
  'content-profile', 'x-upsert', 'cache-control', 'x-client-info']
// Y las de la respuesta que necesita supabase-js.
const VUELVEN = ['content-type', 'content-range', 'preference-applied', 'content-length',
  'cache-control', 'etag', 'last-modified']

// ── Qué tablas llevan client_id ───────────────────────────────────────────
// Se le pregunta a PostgREST (su descripción OpenAPI trae las columnas de cada
// tabla) y se recuerda diez minutos: una tabla nueva entra sola.
let columnas = { exp: 0, porTabla: new Map() }
async function columnasDe(tabla) {
  if (columnas.exp < Date.now()) {
    const r = await fetch(`${BASE()}/rest/v1/`, { headers: { apikey: CLAVE(), Authorization: `Bearer ${CLAVE()}`, Accept: 'application/openapi+json' } })
    if (!r.ok) throw new Error(`No pude leer el esquema (${r.status})`)
    const j = await r.json()
    const porTabla = new Map()
    for (const [nombre, def] of Object.entries(j.definitions || {})) porTabla.set(nombre, new Set(Object.keys(def.properties || {})))
    columnas = { exp: Date.now() + 10 * 60_000, porTabla }
  }
  return columnas.porTabla.get(tabla) || null
}

function corta(res, code, error) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ message: error, error }))
}

function leeCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = []
    let total = 0
    req.on('data', c => {
      total += c.length
      if (total > MAX_CUERPO) { req.destroy(); reject(Object.assign(new Error('El archivo es demasiado grande'), { statusCode: 413 })); return }
      trozos.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(trozos)))
    req.on('error', reject)
  })
}

const lista = (ids) => `(${(ids.length ? ids : [NINGUNO]).map(encodeURIComponent).join(',')})`
const filasDe = (cuerpo) => {
  if (!cuerpo?.length) return []
  const j = JSON.parse(cuerpo.toString('utf8'))
  return Array.isArray(j) ? j : [j]
}
const esAdmin = (auth) => auth.plataforma || auth.superadmin || auth.role === 'superadmin'

function prohibido(msg = 'No tienes acceso a esto') {
  return Object.assign(new Error(msg), { statusCode: 403 })
}

/**
 * Revisa y recorta una petición a /rest/v1/<tabla>. Devuelve la query ya
 * recortada (URLSearchParams) y, si hace falta, el cuerpo reescrito.
 */
export async function recortaTabla({ auth, ids, metodo, tabla, query, cuerpo, prefer }) {
  if (SECRETAS.has(tabla)) throw prohibido()
  if (!PANEL.has(tabla)) {
    console.warn(`[db] tabla fuera de la lista del panel: ${tabla} (${metodo})`)
    throw prohibido()
  }
  const cols = await columnasDe(tabla)
  if (!cols) throw Object.assign(new Error(`No existe la tabla ${tabla}`), { statusCode: 404 })

  const select = query.get('select') || ''
  if (select.includes('(')) {
    const saltos = [...select.matchAll(/([a-z0-9_]+)(?:!\w+)?\(/g)].map(m => m[1])
    if (saltos.some(t => !INCRUSTABLES.has(t))) throw prohibido('Esa consulta cruza tablas que no se pueden cruzar')
  }

  const lee = metodo === 'GET' || metodo === 'HEAD'
  if (tabla === 'team') {
    if (!lee) throw prohibido('Los accesos se gestionan desde Equipo')
    const pedidas = (select || '*').split(',').map(c => c.trim())
    if (pedidas.some(c => !COLUMNAS_TEAM.has(c))) throw prohibido('Esas columnas de team no se pueden leer')
    revisaFiltrosTeam(query)
  }
  if (!lee && SOLO_ADMIN_ESCRIBE.has(tabla) && !esAdmin(auth)) throw prohibido('Solo el administrador puede cambiar esto')
  if (tabla === 'clients' && metodo === 'DELETE') throw prohibido('Los perfiles se borran desde Perfiles')

  // Un «guardar pisando» (upsert) en perfiles o colaboraciones no pasa por el
  // recorte de abajo: con `on_conflict=id` (o slug) reescribiría el perfil de
  // OTRA agencia y, como el perfil nuevo nace en la agencia de quien guarda, se
  // lo llevaría a la suya. El registro es público, así que cualquiera podía.
  const pisa = /resolution\s*=/i.test(prefer) || query.has('on_conflict')
  if (pisa && (tabla === 'clients' || tabla === 'helm_collaborations') && !auth.plataforma) {
    throw prohibido('Eso no se puede guardar así')
  }

  const filas = metodo === 'POST' || metodo === 'PATCH' ? filasDe(cuerpo) : []
  const vetadas = auth.plataforma ? [] : (SOLO_SERVIDOR[tabla] || []).filter(c => c !== 'agencia_id')
  if (filas.some(f => vetadas.some(c => c in f))) throw prohibido('Ese campo lo gestiona el servidor')

  // El oficio de cada persona (dueño, closer…) decide lo que ve y edita: solo lo
  // cambia, y solo borra personas, quien manda en el perfil o el administrador.
  // Si no, cualquiera del equipo se subía a «dueño» él solo.
  if (tabla === 'helm_team' && !lee && !esAdmin(auth) && !nivelTotal(auth.nivel)) {
    if (metodo === 'DELETE' || filas.some(f => 'role' in f)) {
      throw prohibido('Solo quien manda en el perfil cambia el equipo')
    }
  }

  // Perfiles nuevos: nacen en la agencia de quien los crea. Y nadie mueve un
  // perfil de agencia desde aquí.
  if (tabla === 'clients') {
    for (const f of filas) {
      if ('agencia_id' in f && !auth.plataforma) throw prohibido('Un perfil no se cambia de agencia')
      if (metodo === 'POST') f.agencia_id = auth.agenciaId
    }
    if (metodo === 'POST' && !auth.agenciaId) throw prohibido('Tu cuenta no tiene agencia')
  }

  // La plataforma no se recorta.
  if (ids === null) return { query, filas: tabla === 'clients' ? filas : null }

  if (tabla === 'clients') {
    if (metodo !== 'POST') query.append('id', `in.${lista(ids)}`)
    return { query, filas }
  }

  if (tabla === 'helm_collaborations') {
    const l = lista(ids)
    if (metodo === 'POST') {
      if (filas.some(f => !ids.includes(f.from_client_id))) throw prohibido()
    } else {
      query.append('and', `(or(from_client_id.in.${l},to_client_id.in.${l}))`)
    }
    return { query, filas: null }
  }

  if (!cols.has('client_id')) throw prohibido()

  if (metodo === 'POST') {
    if (filas.some(f => !ids.includes(f.client_id))) throw prohibido('No puedes crear filas en ese perfil')
    // Un upsert que pisa filas existentes: tiene que pisarlas dentro de tus
    // perfiles. Por (client_id, …) siempre lo es; por id, se comprueba. Sin
    // `on_conflict` PostgREST usaría la clave primaria de la tabla, que no
    // siempre es `id` (p. ej. event_id): se exige decirla.
    if (/resolution\s*=\s*merge-duplicates/i.test(prefer)) {
      if (!query.get('on_conflict')) throw prohibido('Ese guardado no se puede hacer por aquí')
      const conflicto = query.get('on_conflict').split(',').map(c => c.trim())
      if (!conflicto.includes('client_id')) {
        if (conflicto.join() !== 'id') throw prohibido('Ese guardado no se puede hacer por aquí')
        const conId = filas.map(f => f.id).filter(Boolean)
        if (conId.length) {
          const { data, error } = await supabase.from(tabla).select('client_id').in('id', conId)
          if (error) throw error
          if ((data || []).some(r => !ids.includes(r.client_id))) throw prohibido()
        }
      }
    }
  } else {
    if (metodo === 'PATCH' && filas.some(f => 'client_id' in f && !ids.includes(f.client_id))) {
      throw prohibido('No puedes mover filas a ese perfil')
    }
    query.append('client_id', `in.${lista(ids)}`)
  }
  return { query, filas: null }
}

/** Revisa una petición a Storage. Solo el bucket `helm`, y solo en tus perfiles. */
function recortaArchivo({ auth, ids, metodo, ruta, cuerpo }) {
  // Subir: /storage/v1/object/helm/<perfil>/<carpeta>/<archivo>
  const m = ruta.match(/^\/storage\/v1\/object\/helm\/([^/]+)\/.+/)
  const prefijoValido = (p) => ids === null || ids.includes(p) || (p === 'registro' && esAdmin(auth))
  if (m && ['POST', 'PUT'].includes(metodo)) {
    if (!prefijoValido(m[1])) throw prohibido('No puedes subir archivos a ese perfil')
    return
  }
  // Borrar: DELETE /storage/v1/object/helm  { prefixes: [...] }
  if (ruta === '/storage/v1/object/helm' && metodo === 'DELETE') {
    const { prefixes = [] } = JSON.parse(cuerpo?.toString('utf8') || '{}')
    if (!prefixes.length || prefixes.some(p => !prefijoValido(String(p).split('/')[0]))) throw prohibido('No puedes borrar esos archivos')
    return
  }
  throw prohibido()
}

async function reenvia(req, res, { ruta, query, cuerpo, conClave = true }) {
  const headers = {}
  for (const h of PASAN) if (req.headers[h]) headers[h] = req.headers[h]
  if (conClave) { headers.apikey = CLAVE(); headers.Authorization = `Bearer ${CLAVE()}` }
  const qs = query?.toString()
  const r = await fetch(`${BASE()}${ruta}${qs ? `?${qs}` : ''}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) || !cuerpo?.length ? undefined : cuerpo,
  })
  res.statusCode = r.status
  for (const h of VUELVEN) {
    const v = r.headers.get(h)
    if (v && h !== 'content-length') res.setHeader(h, v)
  }
  res.end(Buffer.from(await r.arrayBuffer()))
}

/** La entrada: la llama scripts/api-server.mjs para todo lo que empieza por /api/db/. */
export async function pasarela(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
    if (!METODOS.has(req.method)) return corta(res, 405, 'Método no permitido')
    // Solo el esquema `public`: con Accept-Profile/Content-Profile se podría
    // pedir otro esquema expuesto con una tabla que se llame igual.
    for (const h of ['accept-profile', 'content-profile']) {
      const v = req.headers?.[h]
      if (v && String(v).trim().toLowerCase() !== 'public') return corta(res, 403, 'Ese esquema no se abre por aquí')
    }
    const u = new URL(req.url, 'http://local')
    const ruta = u.pathname.replace(/^\/api\/db/, '')
    const query = new URLSearchParams(u.search)

    // Los enlaces de archivos públicos se abren sin sesión: van en un <img>.
    if (/^\/storage\/v1\/object\/public\/helm\//.test(ruta) && ['GET', 'HEAD'].includes(req.method)) {
      return await reenvia(req, res, { ruta, query, conClave: false })
    }

    let auth
    try { auth = await validateAuth(req, { required: true }) }
    catch { return corta(res, 401, 'Tu sesión ha caducado. Vuelve a entrar.') }
    const ids = await perfilesVisibles(auth)
    const cuerpo = ['GET', 'HEAD'].includes(req.method) ? null : await leeCuerpo(req)

    const t = ruta.match(/^\/rest\/v1\/([a-z0-9_]+)$/)
    if (t) {
      const tabla = t[1]
      // Un perfil creado o movido tiene que salir ya en la siguiente lista.
      if (tabla === 'clients' && !['GET', 'HEAD'].includes(req.method)) olvidarVisibles()
      const { query: q, filas } = await recortaTabla({
        auth, ids, metodo: req.method, tabla, query, cuerpo, prefer: String(req.headers.prefer || ''),
      })
      const nuevo = filas ? Buffer.from(JSON.stringify(filas.length === 1 && !cuerpo.toString().trim().startsWith('[') ? filas[0] : filas)) : cuerpo
      return await reenvia(req, res, { ruta, query: q, cuerpo: nuevo })
    }

    if (ruta.startsWith('/storage/v1/object/')) {
      recortaArchivo({ auth, ids, metodo: req.method, ruta, cuerpo })
      return await reenvia(req, res, { ruta, query, cuerpo })
    }

    return corta(res, 404, 'Ruta desconocida')
  } catch (err) {
    const code = err.statusCode || (err instanceof SyntaxError ? 400 : 500)
    if (code >= 500) console.error('[db] ', err)
    if (!res.headersSent) corta(res, code, code >= 500 ? 'Error interno' : err.message)
    else res.end()
  }
}
