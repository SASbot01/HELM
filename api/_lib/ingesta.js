// HELM — Drive del contenido: el calendario de guiones y las carpetas de cada
// perfil en "HELM Contenido". Ya nada vigila la Entrada ni empareja solo: el
// vídeo se sube a "0 · Entrada" y Claude lo coloca por el conector.
// Lo usan el conector de Claude (api/mcp: calendario y ordenar_video), las
// fases del roadmap (api/agentes-perfil.js), el puesto del editor
// (api/edicion.js) y el equipo de agentes (api/_lib/equipo.js, que también
// corre en el worker: solo lee el calendario).
//
// La estructura de cada perfil es fija y se busca por nombre:
//   Instagram / 0 · Entrada
//             / 1 · Sin editar / Viralidad | Conversión | Autoridad | Venta
//             / 2 · Editados   / (los mismos cuatro)
//             / 3 · Publicados
//             / Recursos
// Cada pieza es una carpeta "AAAA-MM-DD · Título" que avanza de fase en fase:
// dónde está esa carpeta ES su estado. No hay otro sitio que mantener.
import { supabase } from '../lib/supabase.js'
import { hijos, archivo, mover, crearCarpeta, ruta, subcarpeta, CARPETA } from './drive-helm.js'

export const TIPOS = {
  viralidad: 'Viralidad', conversion: 'Conversión', autoridad: 'Autoridad', venta: 'Venta',
}
export const FASES = {
  por_grabar: 'Por grabar', sin_editar: 'Sin editar', editado: 'Editado', publicado: 'Publicado',
}

// ── Las carpetas de un perfil ───────────────────────────────────────────────
// Se resuelven una vez por proceso: la estructura no cambia a menudo, y si
// alguien la renombra basta con reiniciar helm-api (y el worker).
const cache = new Map()

export async function carpetasDe(clientId) {
  if (cache.has(clientId)) return cache.get(clientId)
  const { data: perfil, error } = await supabase.from('agent_drive_perfiles')
    .select('carpeta_id, carpeta_nombre, activa').eq('client_id', clientId).maybeSingle()
  if (error) throw error
  if (!perfil) return null

  const ig = await ruta(perfil.carpeta_id, ['Instagram'])
  const [entrada, sinEditar, editados, publicados] = await Promise.all(
    ['0 · Entrada', '1 · Sin editar', '2 · Editados', '3 · Publicados'].map(n => ruta(ig, [n])))
  const porTipo = async (padre) => Object.fromEntries(await Promise.all(
    Object.entries(TIPOS).map(async ([k, nombre]) => [k, (await subcarpeta(padre, nombre))?.id || null])))

  const c = {
    raiz: perfil.carpeta_id, nombre: perfil.carpeta_nombre, activa: perfil.activa,
    entrada, sinEditar, editados, publicados,
    sinEditarTipo: await porTipo(sinEditar), editadosTipo: await porTipo(editados),
  }
  cache.set(clientId, c)
  return c
}

/** En qué fase está una pieza, mirando dónde está su carpeta. */
export async function faseDe(carpetaId, c) {
  const { parents = [] } = await archivo(carpetaId)
  const padre = parents[0]
  if (padre === c.publicados) return 'publicado'
  if (padre === c.editados || Object.values(c.editadosTipo).includes(padre)) return 'editado'
  return 'sin_editar'
}

// ── El calendario ───────────────────────────────────────────────────────────

/** Los guiones de un perfil entre dos fechas, con la fase real de cada uno. */
export async function calendario(clientId, { desde, hasta } = {}) {
  let q = supabase.from('helm_content_calendar')
    .select('id, date, title, body, tipo, grabado, grabado_at, drive_carpeta_id, revision, source')
    .eq('client_id', clientId).order('date')
  if (desde) q = q.gte('date', desde)
  if (hasta) q = q.lte('date', hasta)
  const { data, error } = await q
  if (error) throw error

  const c = await carpetasDe(clientId).catch(() => null)
  return Promise.all((data || []).map(async g => {
    let fase = g.grabado ? 'sin_editar' : 'por_grabar'
    if (g.drive_carpeta_id && c) fase = await faseDe(g.drive_carpeta_id, c).catch(() => fase)
    return { ...g, fase }
  }))
}

// ── Ordenar: el vídeo a la carpeta de su guion ──────────────────────────────

const limpio = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)

/**
 * Mete un vídeo de Entrada en la pieza de su guion (y la crea si no existe),
 * en "1 · Sin editar / <tipo>", y marca el guion como grabado. Sin guion va a
 * la pieza "Sin guion · AAAA-MM-DD" del día, la misma para todos los de ese día.
 */
export async function ordenar({ clientId, driveId, desde, guion, tipo }) {
  const c = await carpetasDe(clientId)
  if (!c) throw new Error('Este perfil no tiene carpeta en HELM Contenido')
  const t = guion?.tipo || tipo || 'autoridad'
  const destinoTipo = c.sinEditarTipo[t]
  if (!destinoTipo) throw new Error(`Falta la carpeta "1 · Sin editar / ${TIPOS[t]}"`)

  let pieza = guion?.drive_carpeta_id || null
  if (!pieza) {
    const nombre = guion ? `${guion.date} · ${limpio(guion.title)}` : `Sin guion · ${new Date().toISOString().slice(0, 10)}`
    const existente = await subcarpeta(destinoTipo, nombre)
    pieza = existente?.id || (await crearCarpeta(nombre, destinoTipo, guion?.body || '')).id
  }
  await mover(driveId, desde, pieza)

  if (guion) {
    const { error } = await supabase.from('helm_content_calendar').update({
      grabado: true, grabado_at: guion.grabado_at || new Date().toISOString(),
      drive_carpeta_id: pieza, tipo: t, updated_at: new Date().toISOString(),
    }).eq('id', guion.id)
    if (error) throw error
  }
  return { pieza, destino: `1 · Sin editar / ${TIPOS[t]}` }
}

/** Los vídeos que hay ahora mismo en la Entrada de un perfil. */
export async function enEntrada(clientId) {
  const c = await carpetasDe(clientId)
  if (!c) return []
  return (await hijos(c.entrada)).filter(h => h.mimeType !== CARPETA && h.mimeType.startsWith('video/'))
}

// ── Las fases del roadmap ───────────────────────────────────────────────────

/**
 * El calendario cercano (con la fase de cada guion) y los enlaces a su
 * carpeta, para las fases del roadmap (api/agentes-perfil.js → fases). Los
 * vídeos son las filas antiguas del automático, que ya no se escriben.
 */
export async function resumenDrive(clientId) {
  const c = await carpetasDe(clientId).catch(() => null)
  if (!c) return { conectado: false }
  const dia = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)
  const [guiones, videos] = await Promise.all([
    // Dos meses atrás y cuatro adelante: lo que recorre el calendario mensual.
    calendario(clientId, { desde: dia(-62), hasta: dia(124) }),
    supabase.from('agent_drive_videos')
      .select('drive_id, nombre, estado, destino, error, transcripcion, created_at')
      .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30),
  ])
  if (videos.error) throw videos.error
  return {
    conectado: true,
    carpeta: { nombre: c.nombre, url: `https://drive.google.com/drive/folders/${c.raiz}`, entrada: `https://drive.google.com/drive/folders/${c.entrada}` },
    guiones: guiones.map(g => ({ id: g.id, fecha: g.date, titulo: g.title, tipo: g.tipo, fase: g.fase, guion: g.body || '' })),
    videos: (videos.data || []).map(v => ({ ...v, transcripcion: v.transcripcion.slice(0, 400) })),
  }
}
