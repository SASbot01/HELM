// HELM — Agent OS. El taller del operador, detrás de /agents.
//
// Solo superadmin. No lleva clientId por ninguna parte: esto no es una sección
// del panel de un cliente, es el espacio de trabajo de quien opera HELM — sus
// identidades, su corpus de referencia y su memoria a largo plazo.
//
// El recorrido de un reel:
//   pegas el enlace  → POST ?action=reel-add
//   el worker lo coge → descargar (yt-dlp) → transcribir (Whisper) → etiquetar
//   y queda dibujado en la gráfica, con su guion frase a frase.
//
// El paso de descarga masiva con Apify NO existe todavía a propósito: los
// enlaces se pegan a mano. Cuando haga falta, entra como un tipo de job más.
//
// Este endpoint solo encola: no descarga, no transcribe y no llama al modelo.
// Todo eso es del worker (scripts/agents-worker.mjs), que corre aparte y puede
// tardar minutos por vídeo. Una función HTTP no es sitio para eso.
import { createHash } from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { wrap } from './_lib/auth.js'

// Estados por los que pasa un reel, en orden.
const ESTADOS = ['pendiente', 'descargando', 'transcribiendo', 'transcrito', 'etiquetado', 'error']

// Los cuatro papeles que puede tener una frase dentro de un guion.
const ROLES_FRASE = ['gancho', 'planteamiento', 'remate', 'venta']

const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// La URL identifica al reel. Se normaliza antes de hashear para que el mismo
// vídeo con y sin parámetros de seguimiento (?igsh=…) no entre dos veces.
function normalizaUrl(url) {
  try {
    const u = new URL(String(url).trim())
    u.hash = ''
    u.search = ''
    return u.origin.toLowerCase() + u.pathname.replace(/\/+$/, '')
  } catch {
    return String(url || '').trim().toLowerCase()
  }
}
const hashUrl = (url) => createHash('sha256').update(normalizaUrl(url)).digest('hex').slice(0, 32)

function detectaFuente(url) {
  const u = String(url).toLowerCase()
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('tiktok.com')) return 'tiktok'
  return 'otro'
}

// Encola un trabajo. `clave` hace el encolado idempotente: si ese trabajo ya
// está en la cola o ya se hizo, no entra otra vez.
async function encola(tipo, payload, clave) {
  const { error } = await supabase
    .from('agent_jobs')
    .upsert({ tipo, payload, clave, estado: 'pendiente', correr_tras: new Date().toISOString() },
            { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar ${tipo}: ${error.message}`)
}

async function handler(req, res) {
  const accion = String(req.query?.action || req.query?.accion || '').trim()

  switch (accion) {
    // ── Identidades ───────────────────────────────────────────────────────
    case 'identidades': {
      const { data, error } = await supabase
        .from('agent_identities').select('*').order('nombre')
      if (error) throw error
      return res.status(200).json({ identidades: data || [] })
    }

    case 'identidad-guardar': {
      const b = req.body || {}
      const nombre = String(b.nombre || '').trim()
      if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })

      const fila = {
        nombre,
        slug: slugify(b.slug || nombre),
        descripcion: String(b.descripcion || ''),
        contexto: String(b.contexto || ''),
        reglas: b.reglas && typeof b.reglas === 'object' ? b.reglas : {},
        activa: b.activa !== false,
        updated_at: new Date().toISOString(),
      }

      const q = b.id
        ? supabase.from('agent_identities').update(fila).eq('id', b.id).select().single()
        : supabase.from('agent_identities').insert(fila).select().single()
      const { data, error } = await q
      if (error) throw error
      return res.status(200).json({ identidad: data })
    }

    case 'identidad-borrar': {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el id' })
      const { error } = await supabase.from('agent_identities').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── Corpus de reels ───────────────────────────────────────────────────
    case 'reels': {
      const identityId = String(req.query?.identityId || '')
      let q = supabase.from('agent_reels')
        .select('id, identity_id, url, fuente, cuenta, publicado_en, caption, metricas, etiquetas, estado, error, duracion_s, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (identityId) q = q.eq('identity_id', identityId)
      const { data, error } = await q
      if (error) throw error
      return res.status(200).json({ reels: data || [] })
    }

    // Un reel entero, con transcripción y frases. Va aparte de la lista
    // porque la transcripción pesa y la gráfica no la necesita.
    case 'reel': {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el id' })
      const { data, error } = await supabase
        .from('agent_reels').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Ese reel no existe' })
      return res.status(200).json({ reel: data })
    }

    // Pegar enlaces. Acepta uno o varios de golpe, uno por línea.
    case 'reel-add': {
      const b = req.body || {}
      const urls = (Array.isArray(b.urls) ? b.urls : String(b.url || '').split('\n'))
        .map(u => String(u).trim()).filter(Boolean)
      if (!urls.length) return res.status(400).json({ error: 'No has pasado ningún enlace' })
      if (urls.length > 100) return res.status(400).json({ error: 'Máximo 100 enlaces por vez' })

      const identityId = b.identityId || null
      const nuevos = []
      const repetidos = []

      for (const url of urls) {
        const url_hash = hashUrl(url)
        const { data: ya } = await supabase
          .from('agent_reels').select('id').eq('url_hash', url_hash).maybeSingle()
        if (ya) { repetidos.push(url); continue }

        const { data, error } = await supabase.from('agent_reels').insert({
          identity_id: identityId,
          url,
          url_hash,
          fuente: detectaFuente(url),
          cuenta: String(b.cuenta || ''),
          estado: 'pendiente',
        }).select('id, url').single()
        if (error) throw error

        // La clave lleva el hash de la URL, no el id: si el reel se borra y se
        // vuelve a pegar, el trabajo viejo no bloquea al nuevo.
        await encola('descargar', { reelId: data.id }, `descargar:${url_hash}`)
        nuevos.push(data)
      }

      return res.status(200).json({ nuevos: nuevos.length, repetidos: repetidos.length, reels: nuevos })
    }

    // Los números del reel, a mano mientras no haya importación automática.
    case 'reel-metricas': {
      const b = req.body || {}
      if (!b.id) return res.status(400).json({ error: 'Falta el id' })
      const num = (v) => (v === '' || v == null ? null : Number(v))
      const metricas = {
        vistas: num(b.vistas), likes: num(b.likes), comentarios: num(b.comentarios),
        compartidos: num(b.compartidos), guardados: num(b.guardados),
      }
      const { data, error } = await supabase.from('agent_reels')
        .update({ metricas, updated_at: new Date().toISOString() })
        .eq('id', b.id).select('id, metricas').single()
      if (error) throw error
      return res.status(200).json({ reel: data })
    }

    // Corregir a mano el etiquetado que propuso la IA. El humano manda.
    case 'reel-etiquetas': {
      const b = req.body || {}
      if (!b.id) return res.status(400).json({ error: 'Falta el id' })

      const frases = Array.isArray(b.frases)
        ? b.frases
          .filter(f => f && typeof f.texto === 'string')
          .map(f => ({
            texto: f.texto,
            rol: ROLES_FRASE.includes(f.rol) ? f.rol : 'planteamiento',
            inicio_s: Number.isFinite(Number(f.inicio_s)) ? Number(f.inicio_s) : null,
          }))
        : undefined

      const fila = { updated_at: new Date().toISOString() }
      if (b.etiquetas && typeof b.etiquetas === 'object') fila.etiquetas = b.etiquetas
      if (frases) fila.frases = frases
      if (b.identityId !== undefined) fila.identity_id = b.identityId || null
      // Si alguien etiqueta a mano un reel a medias, queda etiquetado.
      if (fila.etiquetas || frases) fila.estado = 'etiquetado'

      const { data, error } = await supabase.from('agent_reels')
        .update(fila).eq('id', b.id).select().single()
      if (error) throw error
      return res.status(200).json({ reel: data })
    }

    case 'reel-borrar': {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el id' })
      const { error } = await supabase.from('agent_reels').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // Reintentar uno que falló, desde el principio.
    case 'reel-reintentar': {
      const id = String(req.query?.id || req.body?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el id' })
      const { data: reel, error: e1 } = await supabase
        .from('agent_reels').select('id, url_hash').eq('id', id).maybeSingle()
      if (e1) throw e1
      if (!reel) return res.status(404).json({ error: 'Ese reel no existe' })

      await supabase.from('agent_reels')
        .update({ estado: 'pendiente', error: '', updated_at: new Date().toISOString() })
        .eq('id', id)
      // Se borra el trabajo viejo para que la clave quede libre.
      await supabase.from('agent_jobs').delete().eq('clave', `descargar:${reel.url_hash}`)
      await encola('descargar', { reelId: id }, `descargar:${reel.url_hash}`)
      return res.status(200).json({ ok: true })
    }

    // ── Memoria a largo plazo ─────────────────────────────────────────────
    case 'memoria': {
      const q = String(req.query?.q || '').trim()
      let sel = supabase.from('agent_memory').select('*')
        .order('updated_at', { ascending: false }).limit(300)
      if (q) sel = sel.ilike('contenido', `%${q}%`)
      const { data, error } = await sel
      if (error) throw error
      return res.status(200).json({ memoria: data || [] })
    }

    case 'memoria-guardar': {
      const b = req.body || {}
      const contenido = String(b.contenido || '').trim()
      if (!contenido) return res.status(400).json({ error: 'La nota está vacía' })
      const fila = {
        ambito: b.identityId ? 'identidad' : 'global',
        identity_id: b.identityId || null,
        clave: String(b.clave || ''),
        contenido,
        etiquetas: Array.isArray(b.etiquetas) ? b.etiquetas : [],
        updated_at: new Date().toISOString(),
      }
      const q = b.id
        ? supabase.from('agent_memory').update(fila).eq('id', b.id).select().single()
        : supabase.from('agent_memory').insert(fila).select().single()
      const { data, error } = await q
      if (error) throw error
      return res.status(200).json({ nota: data })
    }

    case 'memoria-borrar': {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el id' })
      const { error } = await supabase.from('agent_memory').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── Estado de la cola ─────────────────────────────────────────────────
    // Lo que el panel enseña para saber si el worker está vivo y por dónde va.
    case 'estado': {
      const [jobs, reels] = await Promise.all([
        supabase.from('agent_jobs')
          .select('id, tipo, estado, intentos, error, correr_tras, empezado_en, acabado_en')
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('agent_reels').select('estado'),
      ])
      if (jobs.error) throw jobs.error
      if (reels.error) throw reels.error

      const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]))
      for (const r of reels.data || []) porEstado[r.estado] = (porEstado[r.estado] || 0) + 1

      return res.status(200).json({
        jobs: jobs.data || [],
        reels: porEstado,
        total: (reels.data || []).length,
      })
    }

    default:
      return res.status(400).json({ error: `Acción desconocida: ${accion || '(ninguna)'}` })
  }
}

export default wrap(handler, { superadmin: true })
