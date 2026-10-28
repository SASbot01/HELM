// HELM — Drive con la cuenta de servicio `helm-drive`, para el contenido.
//
// No es el Google de cada perfil (api/_lib/google.js, OAuth con drive.file):
// esto es la carpeta "HELM Contenido" que gestiona el operador y comparte con
// helm-drive@….iam.gserviceaccount.com como editor. Con eso HELM ve lo que se
// sube a mano y puede moverlo, cosa que drive.file no permite.
//
// La llave vive en .google-drive-sa.json (fuera de git). Sin ella, todo esto
// falla con un mensaje claro y el resto de HELM sigue igual.
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LLAVE = process.env.HELM_DRIVE_SA
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.google-drive-sa.json')
const API = 'https://www.googleapis.com/drive/v3'
export const CARPETA = 'application/vnd.google-apps.folder'

let token = null // { valor, exp }

async function acceso() {
  if (token && token.exp > Date.now() + 60_000) return token.valor
  let sa
  try { sa = JSON.parse(readFileSync(LLAVE, 'utf8')) }
  catch { throw new Error(`Falta la llave de helm-drive en ${LLAVE}`) }

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const ahora = Math.floor(Date.now() / 1000)
  const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  })}`
  const firma = createSign('RSA-SHA256').update(sinFirma).sign(sa.private_key).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`Google no ha dado acceso a helm-drive: ${d.error_description || d.error}`)
  token = { valor: d.access_token, exp: Date.now() + d.expires_in * 1000 }
  return token.valor
}

async function pide(ruta, { method = 'GET', query = {}, body } = {}) {
  const q = new URLSearchParams({ supportsAllDrives: 'true', ...query })
  const r = await fetch(`${API}${ruta}?${q}`, {
    method,
    headers: { Authorization: `Bearer ${await acceso()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    // Con el código a la vista: quien llama distingue un 404 (no existe o
    // helm-drive no lo ve) de un fallo de Drive o de la llave.
    const e = new Error(`Drive ${r.status}: ${d.error?.message || 'error'}`)
    e.status = r.status
    throw e
  }
  return d
}

// Los ids van en la ruta: escapados, para que uno raro no cambie la URL
// (p. ej. "x/../otro" o "x?fields=…").
const rutaArchivo = (id) => `/files/${encodeURIComponent(id)}`

const CAMPOS = 'id,name,mimeType,size,parents,createdTime,modifiedTime,description,videoMediaMetadata(durationMillis)'

/** Lo que hay dentro de una carpeta (sin la papelera). */
export async function hijos(carpetaId) {
  const out = []
  let pageToken
  do {
    const d = await pide('/files', {
      query: {
        q: `'${carpetaId}' in parents and trashed=false`,
        fields: `nextPageToken,files(${CAMPOS})`,
        includeItemsFromAllDrives: 'true', pageSize: '1000',
        ...(pageToken ? { pageToken } : {}),
      },
    })
    out.push(...(d.files || []))
    pageToken = d.nextPageToken
  } while (pageToken)
  return out
}

/** Un archivo por su id, también si está en la papelera (viene `trashed`). */
export const archivo = (id) => pide(rutaArchivo(id), { query: { fields: `${CAMPOS},trashed` } })

/** Mueve un archivo o una carpeta entera de `desde` a `hasta`. */
export const mover = (id, desde, hasta) =>
  pide(rutaArchivo(id), { method: 'PATCH', query: { addParents: hasta, removeParents: desde, fields: 'id,parents' }, body: {} })

export const crearCarpeta = (nombre, padre, descripcion = '') =>
  pide('/files', { method: 'POST', query: { fields: 'id,name' }, body: { name: nombre, mimeType: CARPETA, parents: [padre], description: descripcion } })

export const describir = (id, descripcion) =>
  pide(rutaArchivo(id), { method: 'PATCH', query: { fields: 'id' }, body: { description: descripcion } })

/** Descarga un archivo al disco. Devuelve los bytes escritos. */
export async function descargar(id, destino) {
  const { createWriteStream } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  const { Readable } = await import('node:stream')
  const r = await fetch(`${API}${rutaArchivo(id)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${await acceso()}` },
  })
  if (!r.ok) throw new Error(`Drive ${r.status} al descargar`)
  await pipeline(Readable.fromWeb(r.body), createWriteStream(destino))
}

/** La carpeta hija con ese nombre (sin distinguir mayúsculas ni espacios de más). */
export async function subcarpeta(padre, nombre) {
  // NFC: la "ñ" o las tildes pueden venir en dos formas Unicode distintas y
  // entonces "contraseñas" no es igual a "contraseñas".
  const n = (s) => s.normalize('NFC').trim().toLowerCase()
  return (await hijos(padre)).find(h => h.mimeType === CARPETA && n(h.name) === n(nombre)) || null
}

/** Sigue una ruta de nombres desde una carpeta: ['Instagram', '1 · Sin editar', 'Venta']. */
export async function ruta(desde, nombres) {
  let id = desde
  for (const nombre of nombres) {
    const c = await subcarpeta(id, nombre)
    if (!c) throw new Error(`No encuentro la carpeta "${nombre}"`)
    id = c.id
  }
  return id
}
