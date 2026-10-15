// HELM — lo que comparten las herramientas del bot de Telegram de la agencia
// (api/_lib/bot-herramientas.js): textos sin tildes, fechas de Madrid, las
// etapas del CRM, buscar un contacto o una persona del equipo, y lo que se
// devuelve a Claude (recortado y sin secretos).
//
// Las etapas del CRM viven en el frontend (src/helm/crm/pipeline.js), que el
// servidor no puede importar: aquí está la misma regla, portada. Si cambia
// allí, cambia aquí.
import { supabase } from '../../lib/supabase.js'
import { fechaValida } from '../fechas.js'
import { recorta } from '../esquema.js'

// ── Texto ───────────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes ni espacios de más: «Detrás de Cámaras» → «detras de camaras». */
export const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

export const palabrasDe = (s) => normaliza(s).split(/[^a-z0-9ñ]+/).filter(Boolean)

// Palabras que no distinguen nada al nombrar un perfil o una etapa.
export const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'lo', 'con', 'y', 'e', 'en', 'a', 'al', 'para', 'por', 'perfil', 'marca', 'cuenta', 'the', 'of', 'and'])

/** Distancia de edición (con trasposiciones): «dcc» y «ddc» están a 1. */
export function distancia(a, b) {
  const n = a.length, m = b.length
  if (!n) return m
  if (!m) return n
  const d = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)])
  for (let j = 1; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + coste)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[n][m]
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Un texto para meterlo en un filtro `or(...)` de PostgREST: las comas, los
// paréntesis y las comillas son sintaxis del filtro, y % _ * comodines.
export const paraFiltro = (s) => String(s ?? '').replace(/[,()"'\\%_*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
// Un valor exacto para ilike (sin comodines).
export const exactoIlike = (s) => String(s ?? '').replace(/[\\%_]/g, (c) => `\\${c}`)

export const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Un error que se le cuenta tal cual al dueño (no es un fallo del servidor). */
export function falla(mensaje) {
  const e = new Error(mensaje)
  e.statusCode = 400
  return e
}

// ── Fechas: el día es el de Madrid ──────────────────────────────────────────
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
export const hoyMadrid = (d = new Date()) => fmtDia.format(d)

export function masDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const inicioDeMes = (iso) => `${iso.slice(0, 7)}-01`
export function finDeMes(iso) {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

// resolverFecha (fechas.js) mira los campos LOCALES del "hoy" que recibe: se
// le pasa un Date local con el día de Madrid para que «mañana» sea el de aquí
// aunque el servidor esté en otra zona.
const localDe = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12) }

/**
 * 'hoy', 'mañana', 'ayer', AAAA-MM-DD (y lo demás que entiende fechas.js) → AAAA-MM-DD.
 * @param {string} texto
 * @param {{ campo?: string, hoy?: string, atras?: number, adelante?: number }} [o]
 */
export function fechaDe(texto, { campo = 'fecha', hoy = hoyMadrid(), atras = 370, adelante = 730 } = {}) {
  const r = fechaValida(String(texto ?? ''), { hoy: localDe(hoy), atras, adelante })
  if (r.error) {
    if (!adelante && /lejos/.test(r.error)) throw falla(`${campo}: "${texto}" queda en el futuro o demasiado atrás; tiene que ser de hoy (${hoy}) o anterior.`)
    throw falla(`${campo}: ${r.error}`)
  }
  return r.iso
}

/** Un rango desde/hasta; por defecto, el mes en curso hasta hoy. */
export function rangoDe(a, { hoy = hoyMadrid() } = {}) {
  const desde = a.desde ? fechaDe(a.desde, { campo: 'desde', hoy, atras: 3700, adelante: 3700 }) : inicioDeMes(hoy)
  const hasta = a.hasta ? fechaDe(a.hasta, { campo: 'hasta', hoy, atras: 3700, adelante: 3700 }) : hoy
  if (desde > hasta) throw falla(`"desde" (${desde}) es posterior a "hasta" (${hasta}).`)
  return { desde, hasta }
}

// ── Lo que vuelve a Claude ──────────────────────────────────────────────────
export const MAX_TEXTO = 6000

// Columnas o campos que no salen nunca, vengan de donde vengan.
const CLAVE_SECRETA = /^(password|passwordhash|pass|contrasena|token|access_token|refresh_token|id_token|secret|secreto|client_secret|apikey|api_key|clave_api|config|pay_account|pay_method|pay_terms|private_key|cookie|authorization)$|(_token|_secret|_hash|_password|_apikey|_api_key)$/i

// Formatos de credencial conocidos, por si alguien pegó una en una nota o un
// email y acaba dentro de un dato.
const PATRONES_SECRETOS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /\b(?:sk|rk|pk|whsec)_(?:live|test)_[A-Za-z0-9]{10,}/g,
  /\bwhsec_[A-Za-z0-9]{16,}/g,
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bya29\.[A-Za-z0-9_-]{20,}/g,
  /\bEAA[A-Za-z0-9]{40,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bapify_api_[A-Za-z0-9]{20,}/g,
]
// Los valores de las variables de entorno con nombre de secreto (las públicas
// del frontend, fuera): si uno acaba en una nota o en un error, no sale.
const NOMBRE_SECRETO = /(KEY|SECRET|SECRETO|TOKEN|PASSWORD|PASS)$/
const valoresSecretos = () => Object.entries(process.env)
  .filter(([k, v]) => NOMBRE_SECRETO.test(k) && !/^VITE_|ANON/.test(k) && typeof v === 'string' && v.length >= 16)
  .map(([, v]) => v)

/** Quita, a cualquier profundidad, los campos con nombre de secreto. */
export function limpiaSecretos(v, hondo = 0) {
  if (hondo > 12 || v == null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(x => limpiaSecretos(x, hondo + 1))
  const limpio = {}
  for (const [k, x] of Object.entries(v)) {
    if (CLAVE_SECRETA.test(k)) continue
    limpio[k] = limpiaSecretos(x, hondo + 1)
  }
  return limpio
}

export function tapaSecretos(texto) {
  let t = String(texto ?? '')
  for (const re of PATRONES_SECRETOS) t = t.replace(re, '[oculto]')
  for (const valor of valoresSecretos()) t = t.split(valor).join('[oculto]')
  return t
}

/** Lo que recibe Claude: JSON compacto, sin secretos y como mucho MAX_TEXTO caracteres (el aviso de recorte, dentro). */
export function aTexto(r, { max = MAX_TEXTO } = {}) {
  const crudo = typeof r === 'string' ? r : JSON.stringify(limpiaSecretos(r)) ?? ''
  const t = tapaSecretos(crudo)
  if (t.length <= max) return t
  const nota = `\n[…recortado: la respuesta pasaba de ${max} caracteres. Pide menos (limite) o acota (fechas, texto, perfil).]`
  return `${t.slice(0, Math.max(0, max - nota.length))}${nota}`
}

// Lo que se escribe se enseña ENTERO en la tarjeta de Aprobar/Rechazar: el
// dueño no aprueba un texto que no ha visto. Por eso tiene tope.
export const TOPE_TEXTO = 2500

/** Un texto libre que se va a escribir, sin espacios de más; si pasa del tope, error (nunca se corta a escondidas). */
export function textoLibre(v, campo, { max = TOPE_TEXTO } = {}) {
  const t = String(v ?? '').trim()
  if (t.length > max) throw falla(`${campo}: tiene ${t.length} caracteres y desde Telegram el máximo es ${max}. Acórtalo o hazlo desde el panel.`)
  return t
}

export { recorta }

// ── Etapas del CRM (portado de src/helm/crm/pipeline.js) ────────────────────
export const DEFAULT_STAGES = [
  { key: 'lead', label: 'Lead' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'cita', label: 'Cita agendada' },
  { key: 'propuesta', label: 'Propuesta' },
  { key: 'seguimiento', label: 'Seguimiento futuro' },
  { key: 'ganado', label: 'Ganado' },
  { key: 'perdido', label: 'Perdido' },
]

// Formas de nombrar LA MISMA etapa: conviven pipelines con claves en inglés
// ('won') y en español ('ganado').
const GRUPOS = [
  ['lead', 'nuevo', 'new', 'abierto', 'entrada'],
  ['contactado', 'contacted', 'contacto', 'qualified', 'calificado', 'cualificado', 'en_curso'],
  ['cita', 'cita_agendada', 'reunion', 'agendado', 'booked', 'meeting'],
  ['propuesta', 'proposal', 'propuesta_enviada', 'negotiation', 'negociacion'],
  ['seguimiento', 'followup', 'follow_up', 'nurturing'],
  ['ganado', 'won', 'cerrado', 'cliente'],
  ['perdido', 'lost', 'descartado'],
]
const GRUPO_DE = new Map()
GRUPOS.forEach((g, i) => g.forEach(k => GRUPO_DE.set(k, i)))
const GRUPO_GANADO = 5

/** Las claves que significan lo mismo que esta (para buscar contactos guardados con un alias). */
export const aliasDe = (key) => {
  const g = GRUPO_DE.get(key)
  return g == null ? [key] : [...new Set([key, ...GRUPOS[g]])]
}

/** Como normalizeStage del panel: la etapa en la que SE VE un contacto. */
export function normalizaEtapa(status, stages = DEFAULT_STAGES) {
  const v = String(status || '').toLowerCase().trim()
  const lista = stages.length ? stages : DEFAULT_STAGES
  if (lista.some(s => s.key === v)) return v
  const grupo = GRUPO_DE.get(v)
  if (grupo != null) {
    const eq = lista.find(s => GRUPO_DE.get(s.key) === grupo)
    if (eq) return eq.key
  }
  return lista[0]?.key || 'lead'
}

export const etiquetaDeEtapa = (status, stages) => {
  const key = normalizaEtapa(status, stages)
  return stages.find(s => s.key === key)?.label || key
}

/** La etapa de "ganado" de un pipeline, sea cual sea su clave. */
export const etapaGanada = (stages) => stages.find(s => GRUPO_DE.get(s.key) === GRUPO_GANADO)?.key || 'won'

/**
 * Lo que diga el dueño («ganado», «Cita agendada», «won») → una etapa REAL de
 * ese pipeline. A diferencia del panel, nunca cae en la primera por descarte:
 * lo que no cuadra es un error con las que hay.
 * @returns {{ etapa: {key,label} } | { error: string, opciones: string[] }}
 */
export function resolverEtapa(texto, stages) {
  const lista = stages?.length ? stages : DEFAULT_STAGES
  const opciones = lista.map(s => `${s.label} (${s.key})`)
  const t = normaliza(texto)
  if (!t) return { error: 'Falta la etapa.', opciones }
  const comoClave = t.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

  const exacta = lista.find(s => s.key.toLowerCase() === t || s.key.toLowerCase() === comoClave)
  if (exacta) return { etapa: exacta }
  const porNombre = lista.filter(s => normaliza(s.label) === t)
  if (porNombre.length === 1) return { etapa: porNombre[0] }

  const grupo = GRUPO_DE.get(comoClave)
  if (grupo != null) {
    const eq = lista.filter(s => GRUPO_DE.get(s.key) === grupo || GRUPO_DE.get(normaliza(s.label).replace(/[^a-z0-9]+/g, '_')) === grupo)
    if (eq.length === 1) return { etapa: eq[0] }
  }

  if (t.length >= 3) {
    const parecidas = lista.filter(s => {
      const l = normaliza(s.label)
      return l.includes(t) || s.key.toLowerCase().includes(comoClave) || (l.length >= 3 && t.includes(l))
    })
    if (parecidas.length === 1) return { etapa: parecidas[0] }
    if (parecidas.length > 1) return { error: `«${texto}» puede ser más de una etapa.`, opciones: parecidas.map(s => `${s.label} (${s.key})`) }
  }
  return { error: `La etapa «${texto}» no existe en ese pipeline.`, opciones }
}

const etapasDeFila = (stages) => (Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES)
  .filter(s => s && s.key)
  .map(s => ({ key: String(s.key), label: String(s.label || s.key) }))

/** Los pipelines del perfil, el de por defecto primero (como loadPipelines del panel). */
export async function pipelinesDe(clientId) {
  const { data, error } = await supabase.from('crm_pipelines')
    .select('id, name, stages, is_default, created_at').eq('client_id', clientId)
    .order('is_default', { ascending: false }).order('created_at', { ascending: true })
  if (error) throw error
  if (!data?.length) return [{ id: null, name: 'Pipeline', isDefault: true, stages: DEFAULT_STAGES }]
  const lista = data.map(p => ({ id: p.id, name: p.name || 'Pipeline', isDefault: Boolean(p.is_default), stages: etapasDeFila(p.stages) }))
  if (!lista.some(p => p.isDefault)) lista[0].isDefault = true
  return lista
}

/** El pipeline de un contacto: pipeline_id vacío es el de por defecto. */
export function pipelineDeContacto(contacto, pipelines) {
  const porDefecto = pipelines.find(p => p.isDefault) || pipelines[0]
  if (!contacto?.pipeline_id) return porDefecto
  return pipelines.find(p => p.id === contacto.pipeline_id) || porDefecto
}

/** Un pipeline por su nombre; sin nombre, el de por defecto. */
export function pipelinePorNombre(pipelines, nombre) {
  if (!nombre) return pipelines.find(p => p.isDefault) || pipelines[0]
  const t = normaliza(nombre)
  const exacto = pipelines.filter(p => normaliza(p.name) === t)
  const lista = exacto.length ? exacto : pipelines.filter(p => normaliza(p.name).includes(t))
  if (lista.length === 1) return lista[0]
  throw falla(`${lista.length ? `«${nombre}» puede ser más de un pipeline` : `No hay ningún pipeline «${nombre}»`}. Los que hay: ${pipelines.map(p => p.name).join(', ')}.`)
}

// ── Buscar dentro de un perfil ──────────────────────────────────────────────
export const COLUMNAS_CONTACTO = 'id, name, email, phone, whatsapp, instagram, company, country, status, substages, pipeline_id, deal_value, source, notes, tags, custom_fields, producto_interes, situacion_actual, fecha_llamada, assigned_closer, assigned_setter, utm_source, utm_campaign, last_activity_at, created_at, updated_at'

/**
 * Un contacto del CRM del perfil por su id, su email o su nombre. Con varios
 * que encajan, error con la lista para que se elija (nunca el primero).
 */
export async function contactoDe(clientId, ref, { columnas = COLUMNAS_CONTACTO } = {}) {
  const r = String(ref ?? '').trim()
  if (!r) throw falla('Falta el contacto (su id, su email o su nombre).')
  let q = supabase.from('crm_contacts').select(columnas).eq('client_id', clientId)
  if (UUID.test(r)) q = q.eq('id', r)
  else if (r.includes('@')) q = q.ilike('email', exactoIlike(r))
  else {
    const t = paraFiltro(r)
    if (t.length < 2) throw falla(`«${r}» es muy poco para buscar un contacto.`)
    q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%,instagram.ilike.%${t}%`)
  }
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(8)
  if (error) throw error
  const lista = data || []
  if (!lista.length) throw falla(`No encuentro a «${r}» en el CRM de este perfil. Búscalo con crm_buscar.`)
  if (lista.length === 1) return lista[0]
  // Con el nombre exacto, ese aunque haya otros que lo contengan.
  const exacto = lista.filter(c => normaliza(c.name) === normaliza(r))
  if (exacto.length === 1) return exacto[0]
  throw falla(`Hay varios contactos que encajan con «${r}»: ${lista.map(c => `${c.name}${c.email ? ` <${c.email}>` : ''} (id ${c.id})`).join('; ')}. Dime cuál (pasa su id).`)
}

/** Una persona activa del equipo (helm_team) por su nombre. */
export async function personaDe(clientId, nombre) {
  const { data, error } = await supabase.from('helm_team')
    .select('id, name, role, active').eq('client_id', clientId)
  if (error) throw error
  const activas = (data || []).filter(p => p.active !== false)
  const t = normaliza(nombre)
  const exacto = activas.filter(p => normaliza(p.name) === t)
  const lista = exacto.length ? exacto : activas.filter(p => normaliza(p.name).includes(t))
  if (lista.length === 1) return { persona: lista[0], activas }
  throw falla(`${lista.length ? `«${nombre}» puede ser más de una persona del equipo` : `No hay nadie activo en el equipo que se llame «${nombre}»`}. ${activas.length ? `Están: ${activas.map(p => p.name).join(', ')}.` : 'El equipo de este perfil está vacío.'}`)
}
