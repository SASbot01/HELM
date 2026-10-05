// HELM — CRM · los pipelines de cada perfil.
//
// Un perfil puede tener VARIOS pipelines (ventas, partnerships, soporte…), cada
// uno con sus propias etapas y subetapas. Se guardan en `crm_pipelines` y un
// contacto pertenece a uno por `crm_contacts.pipeline_id`.
//
// Regla que sostiene la compatibilidad: `pipeline_id = NULL` significa "el
// pipeline por defecto". Los contactos anteriores a esta función lo tienen
// vacío y siguen apareciendo donde siempre, sin migrar un solo dato.
//
// Un contacto guarda su etapa en `crm_contacts.status` (la clave, no la
// etiqueta) y sus subetapas en `crm_contacts.substages` (array de claves).
// Por eso renombrar una etapa nunca mueve a nadie de sitio.
//
// Se importa el cliente directamente y no desde ../lib para no crear un ciclo:
// lib.js necesita estas etapas al dar de alta un perfil.
import { supabase } from '../../utils/supabase'

// El pipeline con el que arranca un perfil que no ha tocado nada.
export const DEFAULT_STAGES = [
  { key: 'lead', label: 'Lead', tone: '' },
  { key: 'contactado', label: 'Contactado', tone: 'cyan' },
  { key: 'cita', label: 'Cita agendada', tone: 'amber' },
  { key: 'propuesta', label: 'Propuesta', tone: 'violet' },
  { key: 'seguimiento', label: 'Seguimiento futuro', tone: 'amber' },
  { key: 'ganado', label: 'Ganado', tone: 'green' },
  { key: 'perdido', label: 'Perdido', tone: 'red' },
]

// Subetapas por defecto. Solo la de seguimiento trae contenido: es el caso que
// pedía el informe (saber a cuánto vista es cada seguimiento).
export const DEFAULT_SUBSTAGES = {
  seguimiento: [
    { key: '1m', label: '1 mes' },
    { key: '3m', label: '3 meses' },
    { key: '6m', label: '+6 meses' },
  ],
}

// Etapas de arranque de un pipeline NUEVO: mínimas a propósito. Un pipeline de
// partnerships o de soporte no tiene por qué parecerse al de ventas, y es más
// rápido añadir dos etapas que borrar cinco que no pintan nada.
export const NUEVO_PIPELINE_STAGES = [
  { key: 'entrada', label: 'Entrada', tone: '' },
  { key: 'en_curso', label: 'En curso', tone: 'cyan' },
  { key: 'cerrado', label: 'Cerrado', tone: 'green' },
]

export const TONES = ['', 'cyan', 'violet', 'amber', 'green', 'red']

// Etapas que cierran el trato. Se usan para la tasa de cierre y para no contar
// como "pipeline abierto" lo que ya está resuelto.
export const WON_KEYS = new Set(['ganado', 'won', 'cerrado', 'cliente'])
export const LOST_KEYS = new Set(['perdido', 'lost', 'descartado'])

// Formas de nombrar LA MISMA etapa. Se agrupan en vez de mapearse en una sola
// dirección porque conviven dos juegos de claves: los pipelines creados por la
// plataforma antigua usan inglés ('contacted', 'won') y los nuevos, español.
// Con un mapa inglés→español, un contacto en 'ganado' dentro de un pipeline
// inglés no encontraba su columna y caía en la primera: el trato desaparecía
// del sitio donde estaba.
const GRUPOS = [
  ['lead', 'nuevo', 'new', 'abierto', 'entrada'],
  ['contactado', 'contacted', 'contacto', 'qualified', 'calificado', 'cualificado', 'en_curso'],
  ['cita', 'cita_agendada', 'reunion', 'agendado', 'booked', 'meeting'],
  ['propuesta', 'proposal', 'propuesta_enviada', 'negotiation', 'negociacion'],
  ['seguimiento', 'followup', 'follow_up', 'nurturing'],
  ['ganado', 'won', 'cerrado', 'cliente'],
  ['perdido', 'lost', 'descartado'],
]
// alias → índice de su grupo, para no recorrer la lista en cada contacto.
const GRUPO_DE = new Map()
GRUPOS.forEach((g, i) => g.forEach(k => GRUPO_DE.set(k, i)))

// Normaliza contra las etapas REALES de este pipeline: primero por coincidencia
// exacta y, si no, buscando una etapa que signifique lo mismo. Solo cuando no
// hay ninguna equivalente (etapa borrada, o el contacto viene de otro pipeline)
// cae en la primera, para que siga siendo visible en vez de desaparecer.
export function normalizeStage(status, stages = DEFAULT_STAGES) {
  const v = String(status || '').toLowerCase().trim()
  const lista = stages.length ? stages : DEFAULT_STAGES
  if (lista.some(s => s.key === v)) return v

  const grupo = GRUPO_DE.get(v)
  if (grupo != null) {
    const equivalente = lista.find(s => GRUPO_DE.get(s.key) === grupo)
    if (equivalente) return equivalente.key
  }
  return lista[0]?.key || 'lead'
}

export const stageOf = (status, stages) =>
  stages.find(s => s.key === normalizeStage(status, stages)) || stages[0]

// Convierte una etiqueta escrita a mano en una clave estable y única.
export function stageKeyFrom(label, taken = []) {
  const base = String(label || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'etapa'
  let key = base
  let i = 2
  while (taken.includes(key)) key = `${base}_${i++}`
  return key
}

// ── Persistencia ───────────────────────────────────────────────────────────

// Las filas creadas por la plataforma antigua traen {key,label,color} sin
// `tone`; las nuevas traen `tone`. Se normaliza al leer.
const normalizaFila = (row) => ({
  id: row.id,
  name: row.name || 'Pipeline',
  isDefault: Boolean(row.is_default),
  stages: (Array.isArray(row.stages) && row.stages.length ? row.stages : DEFAULT_STAGES)
    .map(s => ({ key: s.key, label: s.label, tone: s.tone ?? '' })),
  substages: (row.substages && typeof row.substages === 'object') ? row.substages : {},
})

// El pipeline virtual que se enseña cuando el perfil no tiene ninguna fila.
// Existe en pantalla pero no en la base: se materializa al guardar por primera
// vez. Su id null casa con el pipeline_id vacío de los contactos antiguos.
export const PIPELINE_VIRTUAL = {
  id: null,
  name: 'Pipeline',
  isDefault: true,
  stages: DEFAULT_STAGES,
  substages: DEFAULT_SUBSTAGES,
}

/** Todos los pipelines del perfil, el por defecto primero. */
export async function loadPipelines(clientId) {
  const { data, error } = await supabase
    .from('crm_pipelines').select('id, name, stages, substages, is_default')
    .eq('client_id', clientId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[helm] loadPipelines', error.message)
    return [PIPELINE_VIRTUAL]
  }
  if (!data?.length) return [PIPELINE_VIRTUAL]

  const lista = data.map(normalizaFila)
  // Si ninguno está marcado por defecto (datos antiguos), manda el primero:
  // sin esto los contactos con pipeline_id vacío no tendrían dónde caer.
  if (!lista.some(p => p.isDefault)) lista[0].isDefault = true
  return lista
}

/** Guarda las etapas y subetapas de un pipeline. Lo crea si aún es virtual. */
export async function savePipeline(clientId, { id, name, stages, substages }) {
  if (id) {
    const { error } = await supabase.from('crm_pipelines')
      .update({ stages, substages, ...(name ? { name } : {}) }).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('crm_pipelines')
    .insert({ client_id: clientId, name: name || 'Pipeline', stages, substages, is_default: true })
    .select('id').single()
  if (error) throw error
  return data.id
}

export async function createPipeline(clientId, name) {
  const limpio = String(name || '').trim()
  if (!limpio) throw new Error('El pipeline necesita un nombre')

  const { count } = await supabase
    .from('crm_pipelines').select('id', { count: 'exact', head: true }).eq('client_id', clientId)

  // Si el perfil todavía no tiene ninguna fila, está usando el pipeline
  // VIRTUAL: existe en pantalla pero no en la base. Hay que materializarlo
  // antes de crear el segundo, porque si no el nuevo se convertiría en el
  // principal y se llevaría de golpe a todos los contactos existentes —que
  // tienen pipeline_id vacío— a sus etapas, que no son las suyas.
  if (!count) {
    await supabase.from('crm_pipelines').insert({
      client_id: clientId,
      name: PIPELINE_VIRTUAL.name,
      stages: DEFAULT_STAGES,
      substages: DEFAULT_SUBSTAGES,
      is_default: true,
    })
  }

  const { data, error } = await supabase.from('crm_pipelines')
    .insert({
      client_id: clientId,
      name: limpio,
      stages: NUEVO_PIPELINE_STAGES,
      substages: {},
      is_default: false,
    })
    .select('id, name, stages, substages, is_default').single()
  if (error) throw error
  return normalizaFila(data)
}

export async function renamePipeline(id, name) {
  const limpio = String(name || '').trim()
  if (!limpio) throw new Error('El pipeline necesita un nombre')
  const { error } = await supabase.from('crm_pipelines').update({ name: limpio }).eq('id', id)
  if (error) throw error
}

// Borrar un pipeline decide ANTES qué pasa con sus contactos: o se mueven a
// otro pipeline, o se borran con él. Sin esto, la FK (ON DELETE SET NULL) los
// dejaba sin pipeline y aparecían de golpe en el principal, como si no se
// hubiera borrado nada.
//   contactos: ids de los contactos que se ven en ese pipeline
//   destino:   id del pipeline al que moverlos; null para borrarlos
export async function deletePipeline(id, { contactos = [], destino = null } = {}) {
  if (contactos.length) {
    const q = destino
      ? supabase.from('crm_contacts').update({ pipeline_id: destino }).in('id', contactos)
      : supabase.from('crm_contacts').delete().in('id', contactos)
    const { error } = await q
    if (error) throw error
  }
  const { error } = await supabase.from('crm_pipelines').delete().eq('id', id)
  if (error) throw error
}

/** Marca uno como por defecto y desmarca el resto, en dos pasos. */
export async function setDefaultPipeline(clientId, id) {
  const { error: e1 } = await supabase.from('crm_pipelines')
    .update({ is_default: false }).eq('client_id', clientId)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('crm_pipelines')
    .update({ is_default: true }).eq('id', id)
  if (e2) throw e2
}

// ¿A qué pipeline pertenece un contacto? El id vacío cae en el por defecto.
export function pipelineDe(contact, pipelines) {
  const porDefecto = pipelines.find(p => p.isDefault) || pipelines[0]
  if (!contact?.pipeline_id) return porDefecto
  return pipelines.find(p => p.id === contact.pipeline_id) || porDefecto
}

// ¿Este contacto se ve en este pipeline? Cubre el caso de los contactos
// antiguos sin pipeline_id, que pertenecen al por defecto.
export function perteneceA(contact, pipeline, pipelines) {
  return pipelineDe(contact, pipelines).id === pipeline.id
}
