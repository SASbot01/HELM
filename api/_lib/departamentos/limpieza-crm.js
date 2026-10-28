// HELM — Operaciones · limpieza del CRM.
//
// Mira las fichas de un perfil y detecta dos cosas que ensucian el pipeline:
//
//   1) DUPLICADOS. Dos (o más) fichas que son la misma persona: mismo email
//      normalizado, mismo teléfono normalizado a E.164 español, o mismo nombre
//      exacto con mismo teléfono. Por cada grupo deja UNA propuesta (con clave
//      estable por el conjunto de ids: el mismo grupo no se propone dos veces)
//      que dice por qué y qué ficha conservar (la más completa y antigua).
//      HELM no tiene una escritura segura para FUSIONAR fichas, así que la
//      propuesta es para hacerlo a mano y explica cómo; no lleva herramienta.
//
//   2) FICHAS A MEDIO RELLENAR: sin etapa del pipeline, o sin responsable
//      (closer/setter). Son una sola tarea de revisión para el equipo. Si el
//      agente va en autonomía 'interno' la crea él mismo en Tareas (reversible:
//      una tarea se cierra); si no, la propone con la herramienta `crm_tarea`.
//
// Tope de 10 propuestas de duplicados por pasada, para no inundar la bandeja.

export const TOPE = 10

const recorta = (t, n) => {
  const s = String(t ?? '').trim()
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

// ── Normalizaciones (lo que decide si dos fichas son la misma) ───────────────
export function normEmail(e) {
  const s = String(e || '').trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null
}

/** Teléfono a E.164 español: quita todo lo que no sea dígito o +, pasa 00 a +,
 *  y a un número español de 9 cifras (6/7/8/9) le pone el 34. null si no cuela. */
export function normTel(t) {
  let d = String(t || '').replace(/[^\d+]/g, '')
  if (d.startsWith('00')) d = `+${d.slice(2)}`
  d = d.replace(/^\+/, '')
  if (/^[6-9]\d{8}$/.test(d)) d = `34${d}`
  return /^\d{8,15}$/.test(d) ? d : null
}

export function normNombre(n) {
  return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// ── Agrupar duplicados (unión por cualquiera de las tres señales) ────────────
/** Devuelve los grupos de fichas que son la misma persona (más de una ficha). */
export function gruposDuplicados(contactos) {
  const padre = contactos.map((_, i) => i)
  const raiz = (x) => (padre[x] === x ? x : (padre[x] = raiz(padre[x])))
  const une = (a, b) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) padre[ra] = rb }

  const vistos = new Map()
  contactos.forEach((c, i) => {
    const claves = []
    const e = normEmail(c.email); if (e) claves.push(`e:${e}`)
    const t = normTel(c.phone); if (t) claves.push(`t:${t}`)
    const nm = normNombre(c.name); if (nm && t) claves.push(`nt:${nm}|${t}`)
    for (const k of claves) {
      if (vistos.has(k)) une(i, vistos.get(k))
      else vistos.set(k, i)
    }
  })

  const porRaiz = new Map()
  contactos.forEach((_, i) => {
    const r = raiz(i)
    if (!porRaiz.has(r)) porRaiz.set(r, [])
    porRaiz.get(r).push(contactos[i])
  })
  return [...porRaiz.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => claveGrupo(a).localeCompare(claveGrupo(b)))
}

// Puntuación de «lo completa que está» una ficha, para decidir cuál se conserva.
const completitud = (c) =>
  ['name', 'email', 'phone', 'company', 'instagram', 'notes'].filter((f) => c[f] && String(c[f]).trim()).length +
  (Number(c.deal_value) > 0 ? 1 : 0) +
  (c.status && String(c.status).trim() ? 1 : 0)

const tiempo = (c) => { const t = Date.parse(c.created_at); return Number.isNaN(t) ? Infinity : t }

/** La ficha a conservar: la más completa; a igualdad, la más antigua. */
export function elegirConservar(grupo) {
  return grupo.slice().sort((a, b) => completitud(b) - completitud(a) || tiempo(a) - tiempo(b))[0]
}

const claveGrupo = (grupo) => `limpieza-crm:dup:${grupo.map((c) => c.id).slice().sort().join('+')}`

/** La propuesta de un grupo de duplicados: clave estable, título y el porqué. */
export function propuestaDuplicados(grupo) {
  const keep = elegirConservar(grupo)
  const emails = [...new Set(grupo.map((c) => normEmail(c.email)).filter(Boolean))]
  const tels = [...new Set(grupo.map((c) => normTel(c.phone)).filter(Boolean))]
  const señales = []
  if (emails.length === 1 && grupo.filter((c) => normEmail(c.email)).length > 1) señales.push(`el email ${emails[0]}`)
  if (tels.length === 1 && grupo.filter((c) => normTel(c.phone)).length > 1) señales.push(`el teléfono +${tels[0]}`)
  const porSeñal = señales.length ? `Comparten ${señales.join(' y ')}.` : 'Coinciden por email, teléfono o por nombre y teléfono.'
  const nombre = recorta(keep.name || '(sin nombre)', 80)
  const alta = String(keep.created_at || '').slice(0, 10)
  const sobran = grupo.length - 1
  const titulo = `${grupo.length} fichas duplicadas: ${nombre}`
  const porque = `${porSeñal} Conserva la ficha más completa y antigua${alta ? ` (alta ${alta})` : ''}: «${nombre}»${keep.email ? ` · ${keep.email}` : ''}. HELM no fusiona fichas solo: ábrelas en el CRM, pasa a esa los datos que falten y borra ${sobran === 1 ? 'la otra' : `las otras ${sobran}`}.`
  return { clave: claveGrupo(grupo), titulo, porque, ids: grupo.map((c) => c.id).slice().sort() }
}

// Crea una tarea de revisión directamente en Tareas (solo en autonomía
// 'interno'); no duplica una tarea abierta con el mismo título.
async function crearTareaInterna(ctx, { titulo, descripcion }) {
  const { data: ya, error } = await ctx.supabase.from('crm_tasks')
    .select('id').eq('client_id', ctx.clientId).eq('completed', false).eq('title', titulo).limit(1)
  if (error) throw error
  if (ya && ya.length) return false
  const { error: e2 } = await ctx.supabase.from('crm_tasks').insert({
    client_id: ctx.clientId, title: recorta(titulo, 300), description: recorta(descripcion, 2500),
    status: 'todo', priority: 'medium', category: 'general', visibility: 'equipo',
    checklist: [], contact_id: null, assignee_helm_id: null,
  })
  if (e2) throw e2
  return true
}

export default {
  key: 'limpieza-crm',
  departamento: 'operaciones',
  async corre(ctx) {
    const { supabase, clientId, autonomia, proponer } = ctx
    const { data, error } = await supabase.from('crm_contacts')
      .select('id, name, email, phone, status, assigned_closer, assigned_setter, company, instagram, notes, deal_value, created_at')
      .eq('client_id', clientId).limit(5000)
    if (error) throw error
    const contactos = data || []

    // 1) Duplicados → una propuesta por grupo (tope TOPE).
    let dups = 0
    for (const grupo of gruposDuplicados(contactos)) {
      if (dups >= TOPE) break
      const { clave, titulo, porque, ids } = propuestaDuplicados(grupo)
      const r = await proponer({ clave, titulo, porque, datos: { ids, motivo: 'duplicado' } })
      if (r && r.creada !== false) dups++
    }

    // 2) Fichas sin etapa o sin responsable → una tarea de revisión.
    const sinEtapa = contactos.filter((c) => !c.status || !String(c.status).trim())
    const sinDueno = contactos.filter((c) => !c.assigned_closer && !c.assigned_setter)
    const aRevisar = new Set([...sinEtapa, ...sinDueno].map((c) => c.id))
    let tareaInterna = 0
    let tareaPropuesta = 0
    if (aRevisar.size) {
      const titulo = 'Revisar fichas del CRM sin etapa o sin dueño'
      const ejemplos = [...new Set([...sinEtapa, ...sinDueno].map((c) => c.name).filter(Boolean))].slice(0, 10).join(', ')
      const descripcion = `${aRevisar.size} fichas por revisar: ${sinEtapa.length} sin etapa y ${sinDueno.length} sin responsable (closer/setter).${ejemplos ? ` Ejemplos: ${recorta(ejemplos, 400)}.` : ''} Asígnales etapa del pipeline y un responsable.`
      if (autonomia === 'interno') {
        if (await crearTareaInterna(ctx, { titulo, descripcion })) tareaInterna++
      } else {
        const r = await proponer({ clave: `limpieza-crm:sin-datos:${titulo}`, titulo, porque: descripcion, herramienta: 'crm_tarea', input: { titulo, descripcion } })
        if (r && r.creada !== false) tareaPropuesta++
      }
    }

    const partes = []
    if (dups) partes.push(`${dups} ${dups === 1 ? 'grupo de duplicados' : 'grupos de duplicados'}`)
    if (tareaInterna) partes.push('tarea de fichas sin etapa/dueño creada')
    if (tareaPropuesta) partes.push('propuesta de fichas sin etapa/dueño')
    return { propuestas: dups + tareaPropuesta, resumen: partes.join(', ') }
  },
}
