// HELM — La Fábrica: los procesos internos que la plataforma lleva sobre cada
// perfil. NO es el CRM del cliente: es el tablero de trabajo de Alex sobre ese
// negocio, invisible para el cliente y su equipo. De ahí requirePlataforma en
// todas las acciones (ni un superadmin de otra agencia, ni el propio cliente).
//
//   GET  ?action=lista  &clientId=            → las tareas de ese perfil
//   POST ?action=crear  &clientId=  { agente, estado, titulo, detalle, fase }
//   POST ?action=mover  &clientId=  { id, estado, agente?, nota? }
//   POST ?action=anotar &clientId=  { id, nota }
//   POST ?action=editar &clientId=  { id, titulo?, detalle?, fase?, agente? }
//   POST ?action=borrar &clientId=  { id }
//
// Mismo motor que lee el enlace de operador del MCP (api/mcp/[token].js), sobre
// la tabla fabrica_tareas (migración 120).
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requirePlataforma } from './_lib/auth.js'

export const AGENTES = ['Estrategia', 'Marketing y contenido', 'Comercial y ventas', 'Seguridad y legal', 'Operaciones y entrega']
export const ESTADOS = ['backlog', 'curso', 'revision', 'bloqueada', 'hecho']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hoy = () => new Date().toISOString().slice(0, 10)
const limpiaNotas = (v) => Array.isArray(v) ? v.filter(n => n && n.texto).map(n => ({ fecha: String(n.fecha || '').slice(0, 10), texto: String(n.texto).slice(0, 2000) })) : []

async function cargaTarea(clientId, id) {
  if (!UUID.test(String(id || ''))) { const e = new Error('Falta el id de la tarea'); e.statusCode = 400; throw e }
  const { data, error } = await supabase.from('fabrica_tareas').select('*').eq('client_id', clientId).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) { const e = new Error('Esa tarea no existe en este perfil'); e.statusCode = 404; throw e }
  return data
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requirePlataforma(req)   // «solo yo»: la plataforma y nadie más
    const clientId = String(req.query?.clientId || '')
    if (!clientId || !UUID.test(clientId)) return res.status(400).json({ error: 'Falta el perfil' })
    const accion = String(req.query?.action || '')
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    if (accion === 'lista') {
      const { data, error } = await supabase.from('fabrica_tareas')
        .select('id, agente, estado, titulo, detalle, fase, orden, notas, created_at, updated_at')
        .eq('client_id', clientId).order('orden').order('created_at')
      if (error) throw error
      return res.status(200).json({ tareas: data || [], agentes: AGENTES, estados: ESTADOS })
    }

    if (req.method !== 'POST') return res.status(400).json({ error: `Acción desconocida: ${accion}` })

    if (accion === 'crear') {
      const titulo = String(body.titulo || '').trim()
      if (!titulo) return res.status(400).json({ error: 'Falta el título' })
      const agente = AGENTES.includes(body.agente) ? body.agente : 'Estrategia'
      const estado = ESTADOS.includes(body.estado) ? body.estado : 'backlog'
      const { data, error } = await supabase.from('fabrica_tareas').insert({
        client_id: clientId, agente, estado, titulo,
        detalle: body.detalle ? String(body.detalle).slice(0, 4000) : null,
        fase: body.fase ? String(body.fase).slice(0, 40) : null,
        notas: body.nota ? [{ fecha: hoy(), texto: String(body.nota).slice(0, 2000) }] : [],
      }).select('*').single()
      if (error) throw error
      return res.status(200).json({ tarea: data })
    }

    if (accion === 'mover') {
      const t = await cargaTarea(clientId, body.id)
      const cambios = { updated_at: new Date().toISOString() }
      if (body.estado !== undefined) {
        if (!ESTADOS.includes(body.estado)) return res.status(400).json({ error: 'Estado no válido' })
        cambios.estado = body.estado
      }
      if (body.agente !== undefined) {
        if (!AGENTES.includes(body.agente)) return res.status(400).json({ error: 'Agente no válido' })
        cambios.agente = body.agente
      }
      if (body.nota) cambios.notas = [...limpiaNotas(t.notas), { fecha: hoy(), texto: String(body.nota).slice(0, 2000) }]
      const { data, error } = await supabase.from('fabrica_tareas').update(cambios).eq('id', t.id).select('*').single()
      if (error) throw error
      return res.status(200).json({ tarea: data })
    }

    if (accion === 'anotar') {
      const t = await cargaTarea(clientId, body.id)
      const texto = String(body.nota || '').trim()
      if (!texto) return res.status(400).json({ error: 'Falta la nota' })
      const notas = [...limpiaNotas(t.notas), { fecha: hoy(), texto: texto.slice(0, 2000) }]
      const { data, error } = await supabase.from('fabrica_tareas').update({ notas, updated_at: new Date().toISOString() }).eq('id', t.id).select('*').single()
      if (error) throw error
      return res.status(200).json({ tarea: data })
    }

    if (accion === 'editar') {
      const t = await cargaTarea(clientId, body.id)
      const cambios = { updated_at: new Date().toISOString() }
      if (body.titulo !== undefined) { const v = String(body.titulo).trim(); if (!v) return res.status(400).json({ error: 'El título no puede quedar vacío' }); cambios.titulo = v }
      if (body.detalle !== undefined) cambios.detalle = body.detalle ? String(body.detalle).slice(0, 4000) : null
      if (body.fase !== undefined) cambios.fase = body.fase ? String(body.fase).slice(0, 40) : null
      if (body.agente !== undefined) { if (!AGENTES.includes(body.agente)) return res.status(400).json({ error: 'Agente no válido' }); cambios.agente = body.agente }
      const { data, error } = await supabase.from('fabrica_tareas').update(cambios).eq('id', t.id).select('*').single()
      if (error) throw error
      return res.status(200).json({ tarea: data })
    }

    if (accion === 'borrar') {
      const t = await cargaTarea(clientId, body.id)
      const { error } = await supabase.from('fabrica_tareas').delete().eq('id', t.id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
