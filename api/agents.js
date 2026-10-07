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
// Los enlaces se pegan a mano, a propósito: HELM no depende de ningún
// servicio de fuera para traer reels.
//
// Este endpoint solo encola: no descarga, no transcribe y no llama al modelo.
// Todo eso es del worker (scripts/agents-worker.mjs), que corre aparte y puede
// tardar minutos por vídeo. Una función HTTP no es sitio para eso.
import { createHash, randomBytes } from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { wrap } from './_lib/auth.js'
import { fichaDe } from './agentes-perfil.js'
import { resumenDrive } from './_lib/ingesta.js'
import { getIgConfig } from './_lib/instagram.js'
import { AGENTES as AGENTES_EQUIPO, encolaAgente, tokensDeHoy, flujoPiezas } from './_lib/equipo.js'

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
    // Instagram sirve el mismo reel en /reel/X y en /<usuario>/reel/X (el
    // enlace que se copia desde el perfil): sin esto entraría dos veces.
    const ruta = u.hostname.endsWith('instagram.com')
      ? u.pathname.replace(/^\/[^/]+\/(reels?|p)\//, '/$1/')
      : u.pathname
    return u.origin.toLowerCase() + ruta.replace(/\/+$/, '')
  } catch {
    return String(url || '').trim().toLowerCase()
  }
}
export const hashUrl = (url) => createHash('sha256').update(normalizaUrl(url)).digest('hex').slice(0, 32)

function detectaFuente(url) {
  const u = String(url).toLowerCase()
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('drive.google.com')) return 'drive'
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

// Mete reels en el corpus y encola su descarga. La usan el panel (reel-add) y
// el conector de Claude (api/mcp): los dos tienen que saltarse los repetidos
// igual y encolar igual.
// Un enlace acaba como argumento de yt-dlp en el worker: tiene que ser una
// URL http(s) de verdad, no cualquier texto.
export function esEnlace(url) {
  try { return ['http:', 'https:'].includes(new URL(String(url)).protocol) } catch { return false }
}

export async function anadeReels(urls, identityId = null, cuenta = '') {
  const nuevos = []
  const repetidos = []
  const malo = urls.find(u => !esEnlace(u))
  if (malo !== undefined) {
    const e = new Error(`No es un enlace válido: ${String(malo).slice(0, 80)}`)
    e.statusCode = 400
    throw e
  }

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
      cuenta: String(cuenta || ''),
      estado: 'pendiente',
    }).select('id, url').single()
    if (error) throw error

    // La clave lleva el hash de la URL, no el id: si el reel se borra y se
    // vuelve a pegar, el trabajo viejo no bloquea al nuevo.
    await encola('descargar', { reelId: data.id }, `descargar:${url_hash}`)
    nuevos.push(data)
  }
  return { nuevos, repetidos }
}

async function handler(req, res) {
  const accion = String(req.query?.action || req.query?.accion || '').trim()

  switch (accion) {
    // ── Identidades ───────────────────────────────────────────────────────
    case 'identidades': {
      const { data, error } = await supabase
        .from('agent_identities').select('*, agent_reels(estado, metricas)').order('categoria').order('nombre')
      if (error) throw error
      // El mismo resumen por creador que ve un perfil (api/agentes-perfil.js).
      const identidades = (data || []).map(({ agent_reels: rs = [], ...i }) => ({
        ...i,
        reels: rs.length,
        analizados: rs.filter(r => r.estado === 'etiquetado').length,
        max_vistas: Math.max(0, ...rs.map(r => Number(r.metricas?.vistas) || 0)) || null,
      }))
      return res.status(200).json({ identidades })
    }

    // La ficha de un creador: lo que se sabe de él, en qué perfiles de HELM
    // está, su memoria y sus reels (sin transcripción: esa va en 'reel').
    case 'identidad-ficha': {
      const slug = String(req.query?.slug || '')
      const { data: identidad, error } = await supabase
        .from('agent_identities').select('id').eq('slug', slug).maybeSingle()
      if (error) throw error
      if (!identidad) return res.status(404).json({ error: 'Ese creador no existe' })
      return res.status(200).json(await fichaDe(identidad.id))
    }

    case 'identidad-guardar': {
      const b = req.body || {}
      const nombre = String(b.nombre || '').trim()
      if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })

      const fila = {
        nombre,
        slug: slugify(b.slug || nombre),
        descripcion: String(b.descripcion || ''),
        categoria: String(b.categoria || '').trim(),
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

      const { nuevos, repetidos } = await anadeReels(urls, b.identityId || null, b.cuenta)
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

    // ── Creadores de cada perfil de HELM ──────────────────────────────────
    // Qué identidades usa un perfil (detras-de-camra, enformaconhugo…) como
    // referencia para sus guiones.
    case 'perfil-creadores': {
      const clientId = String(req.query?.clientId || '')
      if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
      const { data, error } = await supabase
        .from('agent_identity_clients').select('identity_id').eq('client_id', clientId)
      if (error) throw error
      return res.status(200).json({ identityIds: (data || []).map(r => r.identity_id) })
    }

    // Se manda la lista entera: lo que no venga deja de estar asignado.
    case 'perfil-creadores-guardar': {
      const b = req.body || {}
      if (!b.clientId) return res.status(400).json({ error: 'Falta el perfil' })
      const ids = [...new Set((Array.isArray(b.identityIds) ? b.identityIds : []).map(String))]
      const { error: e1 } = await supabase
        .from('agent_identity_clients').delete().eq('client_id', b.clientId)
      if (e1) throw e1
      if (ids.length) {
        const { error: e2 } = await supabase.from('agent_identity_clients')
          .insert(ids.map(identity_id => ({ identity_id, client_id: b.clientId })))
        if (e2) throw e2
      }
      return res.status(200).json({ identityIds: ids })
    }

    // Lo mismo visto desde el creador: en qué perfiles de HELM está. Es lo
    // que usa su ficha en /agents para asignarlo a varios perfiles de golpe.
    case 'identidad-perfiles': {
      const identityId = String(req.query?.identityId || '')
      if (!identityId) return res.status(400).json({ error: 'Falta el creador' })
      const [perfiles, asignados] = await Promise.all([
        supabase.from('clients').select('id, slug, name').order('name'),
        supabase.from('agent_identity_clients').select('client_id').eq('identity_id', identityId),
      ])
      if (perfiles.error) throw perfiles.error
      if (asignados.error) throw asignados.error
      return res.status(200).json({ perfiles: perfiles.data || [], clientIds: (asignados.data || []).map(r => r.client_id) })
    }

    case 'identidad-perfiles-guardar': {
      const b = req.body || {}
      if (!b.identityId) return res.status(400).json({ error: 'Falta el creador' })
      const ids = [...new Set((Array.isArray(b.clientIds) ? b.clientIds : []).map(String))]
      const { error: e1 } = await supabase
        .from('agent_identity_clients').delete().eq('identity_id', b.identityId)
      if (e1) throw e1
      if (ids.length) {
        const { error: e2 } = await supabase.from('agent_identity_clients')
          .insert(ids.map(client_id => ({ identity_id: b.identityId, client_id })))
        if (e2) throw e2
      }
      return res.status(200).json({ clientIds: ids })
    }

    // ── Ingesta de Drive ──────────────────────────────────────────────────
    // Los perfiles con carpeta en "HELM Contenido", o el detalle de uno.
    case 'drive': {
      const clientId = String(req.query?.clientId || '')
      if (clientId) return res.status(200).json(await resumenDrive(clientId))
      const { data, error } = await supabase.from('agent_drive_perfiles')
        .select('client_id, carpeta_nombre, activa, clients(slug, name)')
      if (error) throw error
      return res.status(200).json({
        perfiles: (data || []).map(p => ({ id: p.client_id, slug: p.clients.slug, nombre: p.clients.name, carpeta: p.carpeta_nombre, activa: p.activa })),
      })
    }

    // ── El enlace del conector de Claude de un perfil ─────────────────────
    // Solo se guarda su hash; el enlace se enseña UNA vez, al generarlo.
    // Generar otro revoca el anterior (hay un índice único por perfil).
    case 'mcp-enlace': {
      const clientId = String(req.query?.clientId || req.body?.clientId || '')
      if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('agent_mcp_tokens')
          .select('created_at, ultimo_uso').eq('client_id', clientId).maybeSingle()
        if (error) throw error
        return res.status(200).json({ existe: Boolean(data), ...(data || {}) })
      }
      const token = randomBytes(24).toString('hex')
      const token_hash = createHash('sha256').update(token).digest('hex')
      const { error: e1 } = await supabase.from('agent_mcp_tokens').delete().eq('client_id', clientId)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('agent_mcp_tokens').insert({ token_hash, client_id: clientId })
      if (e2) throw e2
      const base = process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net'
      return res.status(200).json({ url: `${base}/api/mcp/${token}` })
    }

    // ── Memoria a largo plazo ─────────────────────────────────────────────
    case 'memoria': {
      const q = String(req.query?.q || '').trim()
      // Las notas del equipo de un perfil van aparte (acción 'equipo').
      let sel = supabase.from('agent_memory').select('*').is('client_id', null)
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

    // ── El equipo de agentes de un perfil ─────────────────────────────────
    // Todo lo que enseña Agentes → Equipo, de una vez: el interruptor, en qué
    // anda cada agente, el registro, la memoria compartida, lo que espera
    // aprobación (guiones en borrador y tareas propuestas) y por dónde va cada
    // pieza de contenido.
    case 'equipo': {
      const { data: perfiles, error: e0 } = await supabase.from('agent_perfiles')
        .select('client_id, activo, guiones_dia, tope_tokens_dia, clients(slug, name)')
      if (e0) throw e0
      const lista = (perfiles || []).map(p => ({
        id: p.client_id, slug: p.clients.slug, nombre: p.clients.name,
        activo: p.activo, guiones_dia: p.guiones_dia, tope_tokens_dia: p.tope_tokens_dia,
      }))
      const clientId = String(req.query?.clientId || '')
      const perfil = lista.find(p => p.id === clientId)
      if (!perfil) return res.status(200).json({ perfiles: lista, perfil: null })

      const [runs, jobs, memoria, borradores, creadores, ig, hoy, tareas, piezas] = await Promise.all([
        supabase.from('agent_ejecuciones').select('*').eq('client_id', clientId)
          .order('empezado_en', { ascending: false }).limit(80),
        supabase.from('agent_jobs').select('payload, estado, created_at').eq('tipo', 'equipo')
          .in('estado', ['pendiente', 'corriendo']).eq('payload->>clientId', clientId),
        supabase.from('agent_memory').select('id, clave, agente, tipo, para_agente, estado, contenido, updated_at')
          .eq('client_id', clientId).order('updated_at', { ascending: false }).limit(200),
        supabase.from('helm_content_calendar').select('id, date, title, body, tipo, created_at')
          .eq('client_id', clientId).eq('revision', 'borrador').order('date'),
        supabase.from('agent_identity_clients').select('identity_id', { count: 'exact', head: true }).eq('client_id', clientId),
        getIgConfig(supabase, clientId),
        tokensDeHoy(clientId),
        supabase.from('agent_tareas').select('id, agente, titulo, detalle, vence, prioridad, created_at')
          .eq('client_id', clientId).eq('estado', 'pendiente').order('created_at', { ascending: false }),
        // Si Drive no contesta, la pantalla sigue: solo falta el recorrido.
        flujoPiezas(clientId).catch(() => null),
      ])
      for (const r of [runs, jobs, memoria, borradores, creadores, tareas]) if (r.error) throw r.error

      const agentes = AGENTES_EQUIPO.map(a => {
        const suyas = (runs.data || []).filter(r => r.agente === a)
        const job = (jobs.data || []).find(j => j.payload?.agente === a)
        return {
          agente: a,
          // 'corriendo' sale de la ejecución, que es la que tiene los pasos.
          estado: suyas[0]?.estado === 'corriendo' ? 'corriendo' : job ? 'en_cola' : 'parado',
          ultima: suyas.find(r => r.estado !== 'corriendo') || null,
          enCurso: suyas[0]?.estado === 'corriendo' ? suyas[0] : null,
        }
      })
      return res.status(200).json({
        perfiles: lista, perfil, agentes,
        ejecuciones: runs.data || [],
        memoria: memoria.data || [],
        borradores: borradores.data || [],
        tareas: tareas.data || [],
        piezas,
        tokensHoy: hoy,
        fuentes: {
          claude: Boolean(process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY),
          instagram: Boolean(ig?.config?.token),
          creadores: creadores.count || 0,
        },
      })
    }

    // El interruptor y los topes. Crear la fila es lo que da de alta a un
    // perfil en el equipo.
    case 'equipo-config': {
      const b = req.body || {}
      if (!b.clientId) return res.status(400).json({ error: 'Falta el perfil' })
      const fila = { client_id: b.clientId, updated_at: new Date().toISOString() }
      if (typeof b.activo === 'boolean') fila.activo = b.activo
      if (b.guiones_dia != null) fila.guiones_dia = Math.min(Math.max(Math.round(Number(b.guiones_dia)) || 1, 1), 5)
      if (b.tope_tokens_dia != null) fila.tope_tokens_dia = Math.max(Math.round(Number(b.tope_tokens_dia)) || 0, 0)
      const { data, error } = await supabase.from('agent_perfiles')
        .upsert(fila, { onConflict: 'client_id' }).select().single()
      if (error) throw error
      return res.status(200).json({ perfil: data })
    }

    // Lanzar un agente ahora, sin esperar al horario.
    case 'equipo-lanzar': {
      const b = req.body || {}
      if (!b.clientId) return res.status(400).json({ error: 'Falta el perfil' })
      if (!AGENTES_EQUIPO.includes(b.agente)) return res.status(400).json({ error: 'Ese agente no existe' })
      const { data: ya, error } = await supabase.from('agent_jobs').select('id').eq('tipo', 'equipo')
        .in('estado', ['pendiente', 'corriendo']).eq('payload->>clientId', b.clientId).eq('payload->>agente', b.agente).limit(1)
      if (error) throw error
      if (ya?.length) return res.status(409).json({ error: 'Ese agente ya está en cola o trabajando' })
      await encolaAgente({
        clientId: b.clientId, agente: b.agente, origen: 'manual',
        clave: `equipo:${b.agente}:${b.clientId}:manual:${Date.now()}`,
      })
      return res.status(200).json({ ok: true })
    }

    // Aprobar o descartar un borrador. Solo toca filas que siguen en borrador:
    // un guion ya aprobado no se borra desde aquí.
    case 'equipo-guion': {
      const b = req.body || {}
      if (!b.id || !['aprobar', 'descartar'].includes(b.accion)) return res.status(400).json({ error: 'Faltan el guion o la acción' })
      const q = b.accion === 'aprobar'
        ? supabase.from('helm_content_calendar').update({ revision: 'aprobado', updated_at: new Date().toISOString() })
        : supabase.from('helm_content_calendar').delete()
      const { data, error } = await q.eq('id', b.id).eq('revision', 'borrador').select('id')
      if (error) throw error
      if (!data?.length) return res.status(404).json({ error: 'Ese borrador ya no existe' })
      return res.status(200).json({ ok: true })
    }

    // Una tarea propuesta por un agente: al aceptarla entra en las Tareas de
    // HELM tal cual; descartada, no se vuelve a proponer.
    case 'equipo-tarea': {
      const b = req.body || {}
      if (!b.id || !['aceptar', 'descartar'].includes(b.accion)) return res.status(400).json({ error: 'Faltan la tarea o la acción' })
      const { data: t, error } = await supabase.from('agent_tareas').select('*').eq('id', b.id).eq('estado', 'pendiente').maybeSingle()
      if (error) throw error
      if (!t) return res.status(404).json({ error: 'Esa tarea ya está contestada' })
      const cambio = { estado: b.accion === 'aceptar' ? 'aceptada' : 'descartada', updated_at: new Date().toISOString() }
      if (b.accion === 'aceptar') {
        const { data: nueva, error: e2 } = await supabase.from('crm_tasks').insert({
          client_id: t.client_id, title: t.titulo, description: t.detalle,
          due_date: t.vence ? `${t.vence}T12:00:00Z` : null, priority: t.prioridad,
        }).select('id').single()
        if (e2) throw e2
        cambio.task_id = nueva.id
      }
      const { error: e3 } = await supabase.from('agent_tareas').update(cambio).eq('id', t.id)
      if (e3) throw e3
      return res.status(200).json({ ok: true })
    }

    // La memoria del perfil a mano: una regla nueva, contestar una propuesta
    // o borrar una nota.
    case 'equipo-nota': {
      const b = req.body || {}
      if (b.accion === 'crear') {
        const contenido = String(b.contenido || '').trim()
        if (!b.clientId || !contenido) return res.status(400).json({ error: 'La regla está vacía' })
        const { error } = await supabase.from('agent_memory').insert({
          ambito: 'perfil', client_id: b.clientId, clave: `regla/${randomBytes(4).toString('hex')}`,
          agente: 'dueño', tipo: 'regla', contenido,
        })
        if (error) throw error
        return res.status(200).json({ ok: true })
      }
      if (!b.id) return res.status(400).json({ error: 'Falta la nota' })
      const nota = supabase.from('agent_memory')
      const q = b.accion === 'borrar' ? nota.delete()
        : b.accion === 'aceptar' ? nota.update({ estado: 'aceptada' })
        : b.accion === 'descartar' ? nota.update({ estado: 'descartada' })
        : null
      if (!q) return res.status(400).json({ error: 'Acción desconocida' })
      // Solo notas de perfil: la memoria de los creadores no se toca desde aquí.
      const { error } = await q.eq('id', b.id).not('client_id', 'is', null)
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

      const [ahora, actividad] = await Promise.all([enCurso(), actividad24h()])
      return res.status(200).json({
        jobs: jobs.data || [],
        reels: porEstado,
        total: (reels.data || []).length,
        ahora,
        actividad,
      })
    }

    default:
      return res.status(400).json({ error: `Acción desconocida: ${accion || '(ninguna)'}` })
  }
}

// ── Lo que se ve trabajar en la portada ─────────────────────────────────────

// Los trabajos que el worker tiene entre manos, con el nombre de aquello en lo
// que está: "transcribiendo" solo no dice nada; "transcribiendo el reel de
// @fulano" sí.
async function enCurso() {
  const { data, error } = await supabase.from('agent_jobs')
    .select('id, tipo, payload, intentos, max_intentos, empezado_en')
    .eq('estado', 'corriendo').order('empezado_en')
  if (error) throw error
  const jobs = data || []
  const reelIds = [...new Set(jobs.map(j => j.payload?.reelId).filter(Boolean))]
  const driveIds = [...new Set(jobs.map(j => j.payload?.driveId).filter(Boolean))]
  const [reels, videos] = await Promise.all([
    reelIds.length ? supabase.from('agent_reels').select('id, cuenta, caption, url').in('id', reelIds) : { data: [] },
    driveIds.length ? supabase.from('agent_drive_videos').select('drive_id, nombre').in('drive_id', driveIds) : { data: [] },
  ])
  const reel = new Map((reels.data || []).map(r => [r.id, r]))
  const video = new Map((videos.data || []).map(v => [v.drive_id, v]))
  return jobs.map(j => {
    const r = reel.get(j.payload?.reelId)
    const v = video.get(j.payload?.driveId)
    const que = r ? (r.cuenta ? `@${r.cuenta.replace(/^@/, '')}` : '') + (r.caption ? ` · ${r.caption.slice(0, 70)}` : '') || r.url
      : v ? v.nombre : ''
    return { id: j.id, tipo: j.tipo, intentos: j.intentos, max_intentos: j.max_intentos, empezado_en: j.empezado_en, que }
  })
}

// Lo acabado en las últimas 24 horas, por hora y por paso, más lo que tarda
// cada paso de media. Se agrega aquí para no mandar miles de filas al panel.
async function actividad24h() {
  const HORA = 3600e3
  const fin = Math.ceil(Date.now() / HORA) * HORA
  const desde = fin - 24 * HORA
  const { data, error } = await supabase.from('agent_jobs')
    .select('tipo, estado, empezado_en, acabado_en')
    .in('estado', ['hecho', 'error'])
    .gte('acabado_en', new Date(desde).toISOString())
    .limit(10000)
  if (error) throw error

  const horas = Array.from({ length: 24 }, (_, i) => ({ t: desde + i * HORA, porTipo: {}, errores: 0 }))
  const duracion = {}
  for (const j of data || []) {
    const fin = Date.parse(j.acabado_en)
    const h = horas[Math.floor((fin - desde) / HORA)]
    if (!h) continue
    if (j.estado === 'error') { h.errores++; continue }
    h.porTipo[j.tipo] = (h.porTipo[j.tipo] || 0) + 1
    if (j.empezado_en) {
      const d = duracion[j.tipo] ||= { n: 0, ms: 0 }
      d.n++; d.ms += Math.max(0, fin - Date.parse(j.empezado_en))
    }
  }
  const media = Object.fromEntries(Object.entries(duracion).map(([k, d]) => [k, Math.round(d.ms / d.n / 1000)]))
  return { horas, media }
}

export default wrap(handler, { superadmin: true })
