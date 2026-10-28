// HELM — la bandeja de los agentes de departamento, para el panel.
//
//   GET  ?action=lista   &clientId=                 → { pendientes, decididas, puedeDecidir }
//   POST ?action=decidir &clientId=  { id, aprobar } → { ok, decidida, estado, texto }
//                                                     (409 con `error` si no se ha podido decidir)
//   GET  ?action=ajustes &clientId=                 → { ajustes: [{ agente, activo, autonomia }], agentes, puedeCambiar }
//   POST ?action=ajuste  &clientId=  { agente, activo?, autonomia? } → { ok }
//   POST ?action=correr  &clientId=  { agentes? }   → { encolado, texto? }: pasa los agentes ya
//
// Ver la bandeja: quien puede usar los agentes del perfil (puedeUsarAgentes).
// Decidir, cambiar ajustes y lanzar: solo quien administra la agencia del
// perfil (o la plataforma): son acciones con clientes y con dinero.
// Decidir solo recibe el id y sí/no: lo que se aplica es lo que se guardó al
// proponerla (la herramienta y su input), nunca lo que mande el navegador.
// Las propuestas y la forma de aplicarlas: api/_lib/propuestas.js.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess, puedeUsarAgentes, puedeVerSaldo, agenciaDe } from './_lib/access.js'
import { listarPropuestas, decidir } from './_lib/propuestas.js'
import { CLAVES, TIPO } from './_lib/departamentos/index.js'
import { enContexto } from './_lib/contexto.js'

const fuera = (code, error) => Object.assign(new Error(error), { statusCode: code })
const AUTONOMIAS = ['proponer', 'interno']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!UUID.test(clientId)) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)
    if (!(await puedeUsarAgentes(auth, clientId))) throw fuera(403, 'Tu rol no puede usar los agentes de este perfil.')
    const accion = String(req.query?.action || '')
    const admin = await puedeVerSaldo(auth, clientId)

    if (req.method === 'GET' && accion === 'lista') {
      const r = await listarPropuestas(clientId)
      return res.status(200).json({ ...r, puedeDecidir: admin })
    }

    if (req.method === 'GET' && accion === 'ajustes') {
      const { data, error } = await supabase.from('helm_agente_ajustes').select('agente, activo, autonomia').eq('client_id', clientId)
      if (error) throw error
      return res.status(200).json({ ajustes: data || [], agentes: CLAVES, puedeCambiar: admin })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
    if (!['decidir', 'ajuste', 'correr'].includes(accion)) return res.status(400).json({ error: 'Acción desconocida' })
    if (!admin) throw fuera(403, 'Esto solo lo puede hacer quien administra la agencia.')
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}

    if (accion === 'decidir') {
      const id = String(b.id || '')
      if (!UUID.test(id)) throw fuera(404, 'Esa propuesta no existe.')
      if (typeof b.aprobar !== 'boolean') throw fuera(400, 'Di si la apruebas o la rechazas.')
      // Solo las del perfil por el que se ha entrado.
      const { data: p, error } = await supabase.from('helm_propuestas').select('id, client_id').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (error) throw error
      if (!p || p.client_id !== clientId) throw fuera(404, 'Esa propuesta no existe.')
      const agenciaId = await agenciaDe(clientId)
      if (!agenciaId) throw fuera(409, 'Este perfil no tiene agencia: sus propuestas no se pueden decidir.')
      const r = await enContexto({ agenciaId, clientId, origen: 'panel' }, () => decidir({
        id, aprobar: b.aprobar, agenciaId, clientId,
        quien: { id: auth.userId || null, email: auth.email || null, nombre: auth.name || auth.email || null }, origen: 'panel',
      }))
      return r.decidida ? res.status(200).json(r) : res.status(409).json({ ...r, error: r.texto })
    }

    if (accion === 'ajuste') {
      const agente = String(b.agente || '')
      if (!CLAVES.includes(agente)) throw fuera(400, 'Ese agente no existe.')
      const fila = { client_id: clientId, agente, updated_at: new Date().toISOString() }
      if (b.activo != null) {
        if (typeof b.activo !== 'boolean') throw fuera(400, 'Encendido tiene que ser sí o no.')
        fila.activo = b.activo
      }
      if (b.autonomia != null) {
        if (!AUTONOMIAS.includes(b.autonomia)) throw fuera(400, 'Autonomía no válida.')
        fila.autonomia = b.autonomia
      }
      if (!('activo' in fila) && !('autonomia' in fila)) throw fuera(400, 'No hay nada que cambiar.')
      const { error } = await supabase.from('helm_agente_ajustes').upsert(fila, { onConflict: 'client_id,agente' })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // accion === 'correr'
    let solo = null
    if (b.agentes != null) {
      if (!Array.isArray(b.agentes) || b.agentes.length > CLAVES.length * 2) throw fuera(400, 'Lista de agentes no válida.')
      solo = [...new Set(b.agentes.filter(a => CLAVES.includes(a)))]
      // Pedir solo agentes que no existen no es «todos».
      if (!solo.length) throw fuera(400, 'Ninguno de esos agentes existe.')
    }
    if (!(await agenciaDe(clientId))) throw fuera(409, 'Este perfil no tiene agencia: los agentes de departamento no lo miran.')
    // Una pasada a mano cada 10 minutos como mucho (la clave lleva el tramo).
    const tramo = Math.floor(Date.now() / 600_000)
    const { data: nuevo, error } = await supabase.from('agent_jobs').upsert({
      tipo: TIPO, estado: 'pendiente', payload: { clientId, ...(solo ? { solo } : {}) },
      clave: `${TIPO}:${clientId}:mano:${tramo}`, correr_tras: new Date().toISOString(), max_intentos: 1,
    }, { onConflict: 'clave', ignoreDuplicates: true }).select('id')
    if (error) throw error
    if (Array.isArray(nuevo) && !nuevo.length) {
      return res.status(200).json({ encolado: false, texto: 'Ya los has lanzado hace poco: espera unos minutos.' })
    }
    return res.status(200).json({ encolado: true })
  } catch (e) {
    const code = e.statusCode || 500
    if (code >= 500) console.error('[propuestas]', e)
    return res.status(code).json({ error: code >= 500 ? 'No se ha podido hacer. Prueba otra vez.' : e.message })
  }
}
