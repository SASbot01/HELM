// HELM — Email marketing: a quién le llega una campaña.
//
// Se elige UN pipeline del perfil (cualquiera) y, si se quiere, algunas de sus
// etapas. Salen los contactos de ese pipeline con un correo válido, uno por
// correo (en minúsculas: «Ana@x.com» y «ana@x.com» son la misma persona y no
// reciben dos), y sin los que están de baja en el perfil.
//
// El pipeline y la etapa de cada contacto se leen como en el CRM del panel
// (las mismas reglas, en api/_lib/bot/comun.js): pipeline_id vacío o de un
// pipeline borrado = el de por defecto, y la etapa normalizada contra las
// etapas de su pipeline («won» cuenta como «Ganado»). Así lo que sale aquí es
// lo que el dueño ve en el tablero.
//
// Se lee TODO por páginas (todasLasFilas): PostgREST corta en 1000 filas sin
// avisar, y un CRM de 3.000 contactos no puede quedarse en 1.000 a escondidas.
import { supabase } from '../../lib/supabase.js'
import { todasLasFilas } from '../filas.js'
import { pipelinesDe, pipelineDeContacto, normalizaEtapa } from '../bot/comun.js'
import { bajasDe } from './bajas.js'

/** El tope por campaña. Más que esto, se acota con etapas o se hacen dos. */
export const MAX_DESTINATARIOS = 5000
const MUESTRA = 5

// Lo bastante estricto para que Resend no rechace el lote por un correo mal
// escrito, sin pretender ser el RFC entero.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/

/** Un correo bien formado, en minúsculas, o null. */
export function limpiaEmail(v) {
  const e = String(v ?? '').trim().toLowerCase()
  if (e.length < 6 || e.length > 254 || e.includes('..') || e.startsWith('.') || e.split('@')[0].endsWith('.')) return null
  return EMAIL_RE.test(e) ? e : null
}

/** Los pipelines del perfil con sus etapas, para elegir en el panel. */
export async function pipelinesParaElegir(clientId) {
  const lista = await pipelinesDe(clientId)
  return lista.map(p => ({ id: p.id, nombre: p.name, porDefecto: p.isDefault, etapas: p.stages.map(s => ({ key: s.key, label: s.label })) }))
}

/** La audiencia guardada → { pipelineId, etapas } limpia, o un error 400 que se entiende. */
export function leeAudiencia(a, pipelines) {
  const pipelineId = a?.pipelineId ? String(a.pipelineId) : null
  const pipeline = pipelines.find(p => (p.id || null) === pipelineId)
  if (!pipeline) throw Object.assign(new Error('Ese pipeline ya no existe en el CRM: elige otro.'), { statusCode: 400 })
  const claves = new Set(pipeline.stages.map(s => s.key))
  const etapas = [...new Set((Array.isArray(a?.etapas) ? a.etapas : []).map(String))]
  const malas = etapas.filter(e => !claves.has(e))
  if (malas.length) throw Object.assign(new Error(`Esas etapas no están en «${pipeline.name}»: ${malas.join(', ')}.`), { statusCode: 400 })
  return { pipelineId, etapas, pipeline }
}

/** «Ventas · Lead, Ganado» (o «Ventas · todas las etapas»). */
export function describeAudiencia(a, pipelines) {
  const p = pipelines.find(x => (x.id || null) === (a?.pipelineId || null))
  if (!p) return 'Pipeline borrado'
  const etapas = (a?.etapas || []).map(k => p.stages.find(s => s.key === k)?.label || k)
  return `${p.name} · ${etapas.length ? etapas.join(', ') : 'todas las etapas'}`
}

/**
 * La audiencia de una campaña, tal y como está el CRM ahora.
 * @returns {{
 *   contactos: Array<{ contact_id, email, nombre }>,   // como mucho `tope`
 *   total: number, excedido: boolean, tope: number,
 *   sinEmail: number, invalidos: number, duplicados: number, deBaja: number,
 *   muestra: Array<{ nombre, email }>, descripcion: string,
 * }}
 */
export async function construirAudiencia(clientId, audiencia, { db = supabase, tope = MAX_DESTINATARIOS } = {}) {
  const pipelines = await pipelinesDe(clientId)
  const { pipelineId, etapas, pipeline } = leeAudiencia(audiencia, pipelines)
  const porDefecto = pipeline.isDefault

  // Un pipeline que no es el de por defecto se filtra en la base; el de por
  // defecto no se puede (se le suman los de pipeline_id vacío o borrado).
  const filas = await todasLasFilas(() => {
    let q = db.from('crm_contacts').select('id, name, email, status, pipeline_id').eq('client_id', clientId)
    if (!porDefecto && pipelineId) q = q.eq('pipeline_id', pipelineId)
    return q.order('id')
  })

  const bajas = await bajasDe(clientId, db)
  const vistos = new Set()
  const contactos = []
  let sinEmail = 0, invalidos = 0, duplicados = 0, deBaja = 0, total = 0
  const enEtapas = etapas.length ? new Set(etapas) : null
  for (const c of filas) {
    if (pipelineDeContacto(c, pipelines)?.id !== pipeline.id) continue
    if (enEtapas && !enEtapas.has(normalizaEtapa(c.status, pipeline.stages))) continue
    if (!String(c.email ?? '').trim()) { sinEmail++; continue }
    const email = limpiaEmail(c.email)
    if (!email) { invalidos++; continue }
    if (vistos.has(email)) { duplicados++; continue }
    vistos.add(email)
    if (bajas.has(email)) { deBaja++; continue }
    total++
    if (contactos.length < tope) contactos.push({ contact_id: c.id, email, nombre: String(c.name ?? '').trim().slice(0, 200) })
  }
  return {
    contactos, total, tope, excedido: total > tope,
    sinEmail, invalidos, duplicados, deBaja,
    muestra: contactos.slice(0, MUESTRA).map(({ nombre, email }) => ({ nombre, email })),
    descripcion: describeAudiencia({ pipelineId, etapas }, pipelines),
  }
}
