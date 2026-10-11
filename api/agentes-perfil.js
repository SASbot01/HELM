// HELM — la sección Agentes de un perfil: los creadores de referencia que ese
// perfil tiene asignados, en solo lectura.
//
// El corpus es del operador (api/agents.js, solo superadmin). Esto es la
// ventana del perfil a él: ve SUS creadores y nada más, y no toca nada. Elegir
// los creadores y editarlos sigue siendo del superadmin.
//
//   GET ?action=creadores &clientId=          → los creadores del perfil
//   GET ?action=ficha     &clientId=&slug=    → uno, con reels, guiones y memoria
//   GET ?action=drive     &clientId=          → calendario de guiones y vídeos de Entrada
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { resumenDrive, enEntrada } from './_lib/ingesta.js'

async function creadoresDe(clientId) {
  const { data, error } = await supabase.from('agent_identity_clients')
    .select('agent_identities(id, nombre, slug, categoria, descripcion, agent_reels(estado, metricas))')
    .eq('client_id', clientId)
  if (error) throw error
  return (data || []).map(r => r.agent_identities).filter(Boolean)
}

// Lo que enseña la tarjeta de cada creador: cuántos reels, cuántos analizados
// y el que más vistas tiene.
function resumen(i) {
  const reels = i.agent_reels || []
  const { agent_reels: _, ...resto } = i
  return {
    ...resto,
    reels: reels.length,
    analizados: reels.filter(r => r.estado === 'etiquetado').length,
    max_vistas: Math.max(0, ...reels.map(r => Number(r.metricas?.vistas) || 0)) || null,
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    await requireProfileAccess(req, clientId)

    const accion = String(req.query?.action || '')
    if (accion === 'creadores') {
      return res.status(200).json({ creadores: (await creadoresDe(clientId)).map(resumen) })
    }

    if (accion === 'ficha') {
      const slug = String(req.query?.slug || '')
      // Solo los creadores de ESTE perfil: el resto del corpus no es suyo.
      const ident = (await creadoresDe(clientId)).find(i => i.slug === slug)
      if (!ident) return res.status(404).json({ error: 'Ese creador no está en este perfil' })
      return res.status(200).json(await fichaDe(ident.id))
    }

    // El calendario de guiones y lo que ha pasado por su Entrada de Drive.
    if (accion === 'drive') return res.status(200).json(await resumenDrive(clientId))

    // Solo las fases de cada guion (dónde está su carpeta en Drive), para que el
    // roadmap pinte "Sin editar / Editado / Publicado" sin traerse todo el Drive.
    if (accion === 'fases') {
      const r = await resumenDrive(clientId).catch(() => ({ conectado: false }))
      if (!r.conectado) return res.status(200).json({ conectado: false, fases: {} })
      const fases = {}
      for (const g of r.guiones || []) fases[g.id] = g.fase
      return res.status(200).json({ conectado: true, fases, carpeta: r.carpeta })
    }

    // Marcar un guion como grabado y disparar una pasada de Entrada: el worker
    // detecta el vídeo, lo archiva en la pieza del guion y lo deja enlazado. Así
    // nada se queda suelto. Si Drive no está conectado, el guion queda grabado
    // igualmente y el vídeo se archivará cuando lo esté.
    if (accion === 'grabar') {
      const guionId = String(req.body?.guionId || '')
      if (!guionId) return res.status(400).json({ error: 'Falta el guion' })
      const { data: g, error } = await supabase.from('helm_content_calendar')
        .select('id, grabado, grabado_at, drive_carpeta_id').eq('id', guionId).eq('client_id', clientId).maybeSingle()
      if (error) throw error
      if (!g) return res.status(404).json({ error: 'Ese guion no existe en este perfil' })

      const desmarcar = req.body?.grabado === false
      const patch = desmarcar
        ? { grabado: false, grabado_at: null, updated_at: new Date().toISOString() }
        : { grabado: true, grabado_at: g.grabado_at || new Date().toISOString(), updated_at: new Date().toISOString() }
      const { error: e2 } = await supabase.from('helm_content_calendar').update(patch).eq('id', g.id)
      if (e2) throw e2

      let detectando = 0
      if (!desmarcar) {
        try {
          for (const v of await enEntrada(clientId)) {
            const { data: ya } = await supabase.from('agent_drive_videos').select('drive_id').eq('drive_id', v.id).maybeSingle()
            if (ya) continue
            await supabase.from('agent_drive_videos').insert({ drive_id: v.id, client_id: clientId, nombre: v.name })
            await supabase.from('agent_jobs').upsert(
              { tipo: 'drive-ingesta', payload: { clientId, driveId: v.id }, clave: `drive:${v.id}`, estado: 'pendiente', correr_tras: new Date().toISOString() },
              { onConflict: 'clave', ignoreDuplicates: true })
            detectando++
          }
        } catch { /* Drive puede no estar conectado: el guion queda grabado igual */ }
      }
      const driveUrl = g.drive_carpeta_id ? `https://drive.google.com/drive/folders/${g.drive_carpeta_id}` : null
      return res.status(200).json({ grabado: !desmarcar, driveUrl, detectando })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion || '(ninguna)'}` })
  } catch (err) {
    const code = err?.statusCode || 500
    if (code >= 500) console.error('[agentes-perfil]', err)
    return res.status(code).json({ error: code >= 500 ? 'Error interno' : err.message })
  }
}

// La ficha completa de un creador. La usan este endpoint y api/agents.js
// (la del superadmin), así que las dos pantallas enseñan lo mismo.
export async function fichaDe(identityId) {
  const [ident, reels, memoria, perfiles] = await Promise.all([
    supabase.from('agent_identities').select('*').eq('id', identityId).single(),
    supabase.from('agent_reels')
      .select('id, url, caption, metricas, etiquetas, frases, transcripcion, estado, error, publicado_en, created_at')
      .eq('identity_id', identityId).limit(500),
    supabase.from('agent_memory').select('id, contenido, updated_at')
      .eq('identity_id', identityId).order('updated_at', { ascending: false }),
    supabase.from('agent_identity_clients').select('clients(slug, name)').eq('identity_id', identityId),
  ])
  for (const r of [ident, reels, memoria, perfiles]) if (r.error) throw r.error

  const vistas = (r) => Number(r.metricas?.vistas) || 0
  return {
    identidad: ident.data,
    reels: (reels.data || []).sort((a, b) => vistas(b) - vistas(a)),
    memoria: memoria.data || [],
    perfiles: (perfiles.data || []).map(p => p.clients),
  }
}
