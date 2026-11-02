// HELM — Email marketing: el ÚNICO sitio que habla con Resend con la clave de
// un perfil (sin SDK, como calendly.js o meta-ads.js). El correo del sistema
// (avisos de acceso, con la clave global RESEND_API_KEY) sigue en ../correo.js.
//
//   · GET  /domains       → comprobar la clave al guardarla y si el dominio del
//                           remitente está verificado
//   · POST /emails/batch  → hasta 100 correos por llamada (los de la campaña)
//   · POST /emails        → uno (cuando un lote entero se rechaza y hay que
//                           saber cuál de los cien era el malo)
//
// Cada envío lleva Idempotency-Key: si se repite la MISMA petición con la
// MISMA clave en 24 h, Resend devuelve lo que contestó la primera vez y no
// manda nada otra vez. Es lo que deja reintentar tras un fallo de red o una
// caída del worker sin mandar dos veces. Cambiar el cuerpo con la misma clave
// es un 409 (invalid_idempotent_request), que aquí se trata como «no se sabe».
//
// Ritmo: Resend admite 2 peticiones por segundo por equipo. Entre llamada y
// llamada con la misma clave se espera lo justo, y un 429 se respeta
// (Retry-After) y se reintenta, como los 5xx y los fallos de red. El cupo
// diario o mensual del plan no se reintenta: hay que esperar o ampliar el plan.
import { createHash } from 'node:crypto'

const API = 'https://api.resend.com'
const TIMEOUT_MS = 30_000
export const MAX_LOTE = 100
// 2 peticiones/s, con margen.
const ENTRE_LLAMADAS_MS = 550
const INTENTOS = 4
const ESPERA_MAX_MS = 10_000

export class ResendError extends Error {
  constructor(message, { status = 502, nombre = null, reintentable = false, deCampana = false, cupo = false, idempotencia = false, validacion = false, restringida = false, esperaMs = 0 } = {}) {
    super(message)
    Object.assign(this, { statusCode: status >= 500 ? 502 : status, status, nombre, reintentable, deCampana, cupo, idempotencia, validacion, restringida, esperaMs })
  }
}

/** Para los tests: la espera entre llamadas y reintentos. */
export const _espera = { ms: (n) => new Promise(r => setTimeout(r, n)) }

const recorta = (t, n = 300) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Lo que contesta Resend cuando no es 2xx → un ResendError que se entiende. */
export function traduceError(status, cuerpo = {}, headers = null) {
  const nombre = cuerpo?.name || null
  const original = recorta(cuerpo?.message || `Resend respondió ${status}`)
  const base = { status, nombre }
  if (nombre === 'restricted_api_key') {
    return new ResendError('La clave solo tiene permiso de envío.', { ...base, restringida: true })
  }
  if (status === 401 || nombre === 'invalid_api_key' || nombre === 'missing_api_key') {
    return new ResendError(`Resend no reconoce la clave (${original}). Crea una nueva en resend.com → API Keys y pégala en Email marketing → Ajustes.`, { ...base, deCampana: true })
  }
  if (status === 403 || nombre === 'invalid_from_address') {
    return new ResendError(`Resend no deja mandar desde ese remitente: ${original}. Comprueba que el dominio está verificado en resend.com → Domains.`, { ...base, deCampana: true })
  }
  if (status === 409 && nombre === 'concurrent_idempotent_requests') {
    return new ResendError('Resend aún está procesando ese envío.', { ...base, reintentable: true, esperaMs: 2000 })
  }
  if (status === 409) {
    return new ResendError(`Resend ya tenía un envío con esa clave y otro contenido: no se sabe si salió. (${original})`, { ...base, idempotencia: true })
  }
  if (status === 429 && /quota/i.test(String(nombre || ''))) {
    const cual = /daily/i.test(nombre) ? 'diario' : 'mensual'
    return new ResendError(`Has llegado al límite ${cual} de envíos de tu plan de Resend. Se seguirá mandando cuando se renueve (o amplía el plan).`, { ...base, cupo: true })
  }
  if (status === 429) {
    const tras = Number(headers?.get?.('retry-after'))
    return new ResendError('Resend pide ir más despacio.', { ...base, reintentable: true, esperaMs: Number.isFinite(tras) && tras > 0 ? tras * 1000 : 1000 })
  }
  if (status >= 500) return new ResendError(`Resend no responde bien ahora mismo (${original}).`, { ...base, reintentable: true })
  // Un `from` o un `reply_to` que no le gustan es de la campaña, no de una persona.
  if ((status === 422 || status === 400) && /`?(from|reply_to)`?\s+field|\bdomain\b/i.test(original)) {
    return new ResendError(`Resend no acepta el remitente: ${original}`, { ...base, deCampana: true })
  }
  if (status === 422 || status === 400) return new ResendError(`Resend no acepta el correo: ${original}`, { ...base, validacion: true })
  return new ResendError(`Resend dice: ${original}`, { ...base, validacion: true })
}

// La última llamada de cada clave (por su huella, no la clave en claro).
const ultima = new Map()
const huella = (apiKey) => createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 16)

async function aSuRitmo(apiKey) {
  const h = huella(apiKey)
  const falta = (ultima.get(h) || 0) + ENTRE_LLAMADAS_MS - Date.now()
  if (falta > 0) await _espera.ms(falta)
  ultima.set(h, Date.now())
}

async function unaVez(apiKey, ruta, { metodo, cuerpo, idempotencia }) {
  await aSuRitmo(apiKey)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let r
  try {
    r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'HELM-email-marketing',
        ...(idempotencia ? { 'Idempotency-Key': idempotencia } : {}),
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      signal: ctrl.signal,
    })
  } catch (err) {
    throw new ResendError(`No se ha podido hablar con Resend (${recorta(err?.name === 'AbortError' ? 'tardó demasiado' : err?.message, 120)}).`, { status: 503, reintentable: true })
  } finally {
    clearTimeout(t)
  }
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) throw traduceError(r.status, datos, r.headers)
  return datos
}

/** Una llamada con sus reintentos (429, 5xx, red). Lo demás sube tal cual. */
async function llama(apiKey, ruta, { metodo = 'GET', cuerpo, idempotencia } = {}) {
  let ultimoError
  for (let i = 0; i < INTENTOS; i++) {
    try {
      return await unaVez(apiKey, ruta, { metodo, cuerpo, idempotencia })
    } catch (err) {
      if (!(err instanceof ResendError) || !err.reintentable) throw err
      ultimoError = err
      if (i < INTENTOS - 1) await _espera.ms(Math.min(ESPERA_MAX_MS, Math.max(err.esperaMs || 0, 500 * 2 ** i)))
    }
  }
  throw ultimoError
}

/**
 * Comprueba la clave contra GET /domains.
 * @returns {{ restringida: boolean, dominios: Array<{ nombre: string, estado: string }> }}
 *   `restringida`: la clave vale pero solo para mandar (no deja listar dominios).
 * @throws ResendError si Resend no la acepta.
 */
export async function verificarClave(apiKey) {
  try {
    const r = await llama(apiKey, '/domains')
    const lista = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
    return {
      restringida: false,
      dominios: lista.slice(0, 200).map(d => ({ nombre: String(d?.name || '').toLowerCase(), estado: String(d?.status || 'desconocido') })),
    }
  } catch (err) {
    if (err instanceof ResendError && err.restringida) return { restringida: true, dominios: [] }
    throw err
  }
}

/** El estado en Resend del dominio de un correo ('verified', 'pending'…), o null si no está. */
export function estadoDominio(dominios, email) {
  const dominio = String(email || '').split('@')[1]?.toLowerCase()
  if (!dominio) return null
  return (dominios || []).find(d => d.nombre === dominio)?.estado || null
}

/**
 * Manda un lote (1..100 correos) en UNA llamada a /emails/batch.
 * @returns {string[]} el id de Resend de cada correo, en el mismo orden
 */
export async function enviarLote(apiKey, correos, { idempotencia }) {
  if (!Array.isArray(correos) || !correos.length) return []
  if (correos.length > MAX_LOTE) throw new Error(`Un lote de Resend lleva como mucho ${MAX_LOTE} correos (llegan ${correos.length}).`)
  if (!idempotencia) throw new Error('Un lote sin Idempotency-Key podría salir dos veces.')
  const r = await llama(apiKey, '/emails/batch', { metodo: 'POST', cuerpo: correos, idempotencia })
  const lista = Array.isArray(r?.data) ? r.data : []
  return correos.map((_, i) => (lista[i]?.id ? String(lista[i].id) : null))
}

/** Manda un correo suelto por /emails. @returns {string} su id en Resend */
export async function enviarUno(apiKey, correo, { idempotencia }) {
  if (!idempotencia) throw new Error('Un envío sin Idempotency-Key podría salir dos veces.')
  const r = await llama(apiKey, '/emails', { metodo: 'POST', cuerpo: correo, idempotencia })
  return r?.id ? String(r.id) : null
}

/**
 * Manda los que sean, partidos en lotes de 100, con una clave por lote
 * (`${clave}:1`, `${clave}:2`…). Para las pruebas y lo que no pasa por el motor.
 * @returns {string[]} los ids, en orden
 */
export async function enviarTodos(apiKey, correos, { clave }) {
  const ids = []
  for (let i = 0; i < correos.length; i += MAX_LOTE) {
    ids.push(...await enviarLote(apiKey, correos.slice(i, i + MAX_LOTE), { idempotencia: `${clave}:${i / MAX_LOTE + 1}` }))
  }
  return ids
}

/** Para los tests: olvida el ritmo de las claves. */
export function _olvidaRitmo() {
  ultima.clear()
}
