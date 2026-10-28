// HELM — Web Creator en el panel (Agentes → Web Creator).
//
//   GET  ?action=lista      &clientId=        → las webs en fabricación (y crea las que falten)
//   GET  ?action=ficha      &clientId=&id=    → una, con su estudio y su prompt
//   POST ?action=estudiar   { clientId, id }  → volver a estudiar
//   POST ?action=publicacion { clientId, id, fase, repo_url, web_url, notas }
//
// Solo para los perfiles que tienen el agente (helm_web_creator). El motor está
// en api/_lib/webcreator.js y el estudio lo hace el worker.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { miraFabricacion, encolaEstudio } from './_lib/webcreator.js'

const RE_UUID = /^[0-9a-f-]{36}$/i
const FASES = ['por_construir', 'construyendo', 'publicada', 'entregada']
const recorta = (s, n) => String(s ?? '').slice(0, n)
const urlValida = (u) => {
  const s = recorta(u, 300).trim()
  if (!s) return null
  return /^https:\/\/[^\s]+$/i.test(s) ? s : undefined
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const gate = rateLimit({ key: `web-creator:${getClientIp(req)}`, max: 90, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  try {
    const { data: activo } = await supabase.from('helm_web_creator').select('etapa_key').eq('client_id', clientId).eq('activo', true).maybeSingle()
    if (!activo) return res.status(403).json({ error: 'Este perfil no tiene Web Creator' })

    // ── GET ?action=lista ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'lista') {
      // Si alguien acaba de mover un contacto, no espera al minuto del worker.
      await miraFabricacion(clientId).catch(e => console.warn('[web-creator] mirar:', e.message))
      const { data: filas, error } = await supabase.from('helm_web_fabricacion')
        .select('id, contact_id, estado, fase, sector, ciudad, prompt_con_ia, error, repo_url, web_url, estudiado_en, created_at, datos')
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(200)
      if (error) return res.status(500).json({ error: error.message })
      const ids = (filas || []).map(f => f.contact_id)
      const { data: contactos } = ids.length
        ? await supabase.from('crm_contacts').select('id, name, company, status, phone').in('id', ids)
        : { data: [] }
      const porId = new Map((contactos || []).map(c => [c.id, c]))
      return res.status(200).json({
        etapa: activo.etapa_key,
        webs: (filas || []).map(({ datos, ...f }) => {
          const c = porId.get(f.contact_id)
          return {
            ...f,
            nombre: datos?.nombre || c?.company || c?.name || 'Contacto',
            persona: c?.name || null,
            telefono: c?.phone || datos?.telefono || null,
            en_etapa: c?.status === activo.etapa_key,
          }
        }),
      })
    }

    const id = req.query.id || req.body?.id
    if (!RE_UUID.test(String(id || ''))) return res.status(400).json({ error: 'Falta la web' })
    const { data: fila } = await supabase.from('helm_web_fabricacion').select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
    if (!fila) return res.status(404).json({ error: 'No encuentro esa web' })

    // ── GET ?action=ficha ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'ficha') {
      const { data: c } = await supabase.from('crm_contacts').select('id, name, company, status, phone, email').eq('id', fila.contact_id).maybeSingle()
      return res.status(200).json({ web: { ...fila, contacto: c || null } })
    }

    // ── POST ?action=estudiar ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'estudiar') {
      if (fila.estado === 'estudiando') return res.status(409).json({ error: 'Ya se está estudiando' })
      await supabase.from('helm_web_fabricacion').update({ estado: 'pendiente', error: null, updated_at: new Date().toISOString() }).eq('id', fila.id)
      await encolaEstudio(clientId, fila.id)
      return res.status(200).json({ ok: true })
    }

    // ── POST ?action=publicacion ───────────────────────────────────────────
    if (req.method === 'POST' && action === 'publicacion') {
      const cambios = { updated_at: new Date().toISOString() }
      if (req.body?.fase !== undefined) {
        if (!FASES.includes(req.body.fase)) return res.status(400).json({ error: 'Fase no válida' })
        cambios.fase = req.body.fase
      }
      for (const k of ['repo_url', 'web_url']) {
        if (req.body?.[k] === undefined) continue
        const u = urlValida(req.body[k])
        if (u === undefined) return res.status(400).json({ error: `${k === 'repo_url' ? 'El repositorio' : 'La web'} tiene que ser una dirección https://` })
        cambios[k] = u
      }
      if (req.body?.notas !== undefined) cambios.notas = recorta(req.body.notas, 4000)
      const { error } = await supabase.from('helm_web_fabricacion').update(cambios).eq('id', fila.id)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[web-creator]', err)
    if (res.headersSent) return undefined
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
