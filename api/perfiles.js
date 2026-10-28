// HELM — dar de baja un perfil: desactivarlo, reactivarlo o borrarlo del todo.
//
// Solo el superadmin. Hay dos escalones a propósito:
//
//   desactivar  el perfil desaparece del tablero y su URL deja de abrir, pero
//               no se toca ni un dato. Se puede deshacer.
//   borrar      se llevan el perfil y TODO lo que cuelga de él (contactos,
//               formularios, accesos, archivos…). No se puede deshacer, así que
//               antes se guarda una copia entera en disco, y sin copia no se
//               borra nada.
//
//   GET  ?action=inactivos                        → los perfiles desactivados
//   POST ?action=activar  { clientId, activo }     → activa o desactiva
//   POST ?action=borrar   { clientId, confirma }   → `confirma` es el slug,
//                                                    escrito por quien borra
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { supabase } from './lib/supabase.js'
import { applyCors, requireSuperAdmin, writeAudit } from './_lib/auth.js'
import { puedeVerPerfil } from './_lib/access.js'

// Fuera del repo: una copia no puede acabar en un commit ni en el build.
export const DIR_COPIAS = process.env.HELM_BACKUP_DIR || path.join(os.homedir(), 'helm-copias')
const BUCKET = 'helm'

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

// Las tablas que apuntan a `clients`, y por qué columna. Se pregunta al propio
// PostgREST en vez de llevar una lista a mano: una tabla nueva que se olvide
// de apuntarse aquí dejaría datos huérfanos (o bloquearía el borrado).
async function tablasDelPerfil() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw falla('No se pudo leer el esquema de la base', 502)
  const spec = await r.json()
  const tablas = []
  for (const [tabla, def] of Object.entries(spec.definitions || {})) {
    if (tabla === 'clients') continue
    for (const [col, v] of Object.entries(def.properties || {})) {
      if (col === 'client_id' || /fk table='clients'/.test(v.description || '')) tablas.push([tabla, col])
    }
  }
  return tablas
}

async function filasDe(tabla, col, id) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').eq(col, id).range(desde, desde + 999)
    if (error) return { error }
    filas.push(...data)
    if (data.length < 1000) return { filas }
  }
}

async function archivosDe(prefijo) {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefijo, { limit: 1000 })
  if (error) throw falla('No se pudieron listar los archivos del perfil: ' + error.message, 502)
  let rutas = []
  for (const o of data || []) {
    const ruta = `${prefijo}/${o.name}`
    rutas = rutas.concat(o.id ? [ruta] : await archivosDe(ruta))
  }
  return rutas
}

// La ruta dentro del bucket de una URL pública de Supabase Storage, o null.
function rutaEnBucket(url) {
  const m = String(url || '').match(new RegExp(`/object/public/${BUCKET}/(.+)$`))
  return m ? decodeURIComponent(m[1]) : null
}

// También lo usa la plataforma al borrar una agencia entera (api/plataforma.js).
export async function borrarPerfil(client, auth, req) {
  const tablas = await tablasDelPerfil()

  // ── 1 · La copia ──────────────────────────────────────────────────────────
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(DIR_COPIAS, `${client.slug}-${sello}`)
  await fs.mkdir(path.join(dir, 'archivos'), { recursive: true, mode: 0o700 })

  const copia = { clients: [client] }
  const conDatos = []
  for (const [tabla, col] of tablas) {
    const { filas, error } = await filasDe(tabla, col, client.id)
    if (error) throw falla(`No se pudo copiar ${tabla}: ${error.message}. No se ha borrado nada.`, 500)
    if (!filas.length) continue
    copia[tabla] = (copia[tabla] || []).concat(filas)
    conDatos.push([tabla, col])
  }

  const rutas = await archivosDe(client.id)
  // El logo puede vivir fuera de su carpeta (el que se sube al registrarse),
  // pero la URL la escribe quien edita la marca: si apunta a la carpeta de
  // OTRO perfil, o es un archivo que usa otro perfil, borrar este se llevaría
  // por delante algo ajeno. Entonces se deja donde está.
  const logo = rutaEnBucket(client.logo_url)
  if (logo && !rutas.includes(logo) && !logo.includes('..')
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(logo)) {
    const { data: otros } = await supabase.from('clients').select('id')
      .eq('logo_url', client.logo_url).neq('id', client.id).limit(1)
    if (!otros?.length) rutas.push(logo)
  }
  for (const ruta of rutas) {
    const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
    if (error) throw falla(`No se pudo copiar el archivo ${ruta}: ${error.message}. No se ha borrado nada.`, 500)
    await fs.writeFile(path.join(dir, 'archivos', ruta.replaceAll('/', '__')), Buffer.from(await data.arrayBuffer()))
  }
  copia._archivos = rutas
  // Lleva hashes de contraseña y tokens de integraciones: solo el dueño la lee.
  await fs.writeFile(path.join(dir, 'datos.json'), JSON.stringify(copia, null, 1), { mode: 0o600 })

  // ── 2 · El borrado ────────────────────────────────────────────────────────
  // En pasadas: las claves ajenas entre tablas deciden el orden, y lo que
  // falla en una pasada suele entrar en la siguiente.
  if (rutas.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(rutas)
    if (error) throw falla('No se pudieron borrar los archivos: ' + error.message, 500)
  }
  let pendientes = conDatos
  const borrado = {}
  for (let pasada = 0; pasada < 6 && pendientes.length; pasada++) {
    const siguen = []
    for (const [tabla, col] of pendientes) {
      const { error, count } = await supabase.from(tabla).delete({ count: 'exact' }).eq(col, client.id)
      if (!error) { borrado[tabla] = (borrado[tabla] || 0) + (count || 0); continue }
      if (/view/i.test(error.message)) continue   // una vista: se vacía sola al borrar su tabla
      siguen.push([tabla, col])
    }
    pendientes = siguen
  }
  if (pendientes.length) {
    throw falla(`El borrado se ha quedado a medias en: ${pendientes.map(p => p[0]).join(', ')}. La copia está en ${dir}.`, 500)
  }
  const { error } = await supabase.from('clients').delete().eq('id', client.id)
  if (error) throw falla(`No se pudo borrar el perfil: ${error.message}. La copia está en ${dir}.`, 500)

  await writeAudit({
    actor: auth, action: 'perfil.borrado', resourceType: 'client', resourceId: client.id, req,
    metadata: { slug: client.slug, name: client.name, copia: dir, filas: borrado, archivos: rutas.length },
  })
  return { copia: dir, filas: borrado, archivos: rutas.length }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const auth = await requireSuperAdmin(req)
    const accion = String(req.query?.action || '')
    const b = req.body || {}

    if (accion === 'inactivos') {
      let q = supabase.from('clients')
        .select('id, slug, name, client_type, logo_url, brand_name, brand_subtitle, primary_color')
        .eq('active', false).order('name')
      // Cada agencia, los suyos.
      if (!auth.plataforma) q = q.eq('agencia_id', auth.agenciaId || '00000000-0000-0000-0000-000000000000')
      const { data, error } = await q
      if (error) throw error
      return res.status(200).json({ perfiles: data || [] })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
    const { data: client } = await supabase.from('clients').select('*').eq('id', String(b.clientId || '')).maybeSingle()
    if (!client || !(await puedeVerPerfil(auth, client.id))) throw falla('Ese perfil no existe', 404)

    if (accion === 'activar') {
      const activo = b.activo !== false
      const { error } = await supabase.from('clients').update({ active: activo }).eq('id', client.id)
      if (error) throw error
      await writeAudit({
        clientId: client.id, actor: auth, action: activo ? 'perfil.reactivado' : 'perfil.desactivado',
        resourceType: 'client', resourceId: client.id, req,
      })
      return res.status(200).json({ ok: true, activo })
    }

    if (accion === 'borrar') {
      // El slug escrito a mano: borrar no puede salir de un clic despistado ni
      // de una petición que se equivoque de id.
      if (String(b.confirma || '').trim() !== client.slug) {
        throw falla('Para borrar el perfil escribe su URL exacta: ' + client.slug)
      }
      return res.status(200).json({ ok: true, ...(await borrarPerfil(client, auth, req)) })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
