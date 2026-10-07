// HELM — el Agent OS como conector de Claude (MCP), en /api/mcp/<token>.
//
// Para que desde claude.ai se lea el corpus (identidades, reels transcritos y
// etiquetados, memoria) y Claude analice y escriba guiones con él. Claude hace
// el trabajo de pensar; esto solo le da los datos y le deja añadir.
//
// Alta en claude.ai → Ajustes → Conectores → Añadir conector personalizado,
// con la URL https://helm.s4sf.net/api/mcp/<HELM_MCP_TOKEN>.
//
// Autenticación: el token secreto de la URL. (claude.ai también deja mandar
// cabeceras; con la URL basta.) Quien tenga la URL entra, así que se trata como una
// contraseña. Para revocarla: cambiar HELM_MCP_TOKEN en .env.server y
// reiniciar helm-api.
//
// Protocolo: MCP por "Streamable HTTP" en su forma mínima — sin sesiones ni
// streaming, un POST JSON-RPC y su respuesta JSON. No hace falta más para
// herramientas que responden en el acto.
import { timingSafeEqual, createHash } from 'node:crypto'
import { supabase } from '../lib/supabase.js'
import { rateLimit, getClientIp } from '../_lib/auth.js'
import { anadeReels, hashUrl } from '../agents.js'
import { calendario, ordenar, TIPOS, FASES } from '../_lib/ingesta.js'
import { archivo as archivoDrive } from '../_lib/drive-helm.js'

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05']

// Los mismos valores que el worker (scripts/agents-worker.mjs) y la gráfica
// (src/agents/ganchos.js): una etiqueta fuera de lista no se dibuja.
const GANCHOS = ['pregunta', 'dato', 'error comun', 'contrarian', 'historia', 'promesa', 'lista', 'demostracion']
const ESTRUCTURAS = ['problema-solucion', 'lista', 'historia', 'comparacion', 'tutorial', 'opinion']
const ROLES = ['gancho', 'planteamiento', 'remate', 'venta']
// Los formatos de montaje de la guía guardada en la memoria global.
const FORMATOS = ['hablando a cámara', 'hablando a cámara + insertos', 'b-roll + voz en off', 'b-roll + frase en pantalla',
  'recortado sobre imágenes', 'demostración con texto clave', 'podcast o entrevista', 'escenario o evento', 'vídeo ajeno + texto']

const TOOLS = [
  {
    name: 'identidades',
    description: 'Lista las identidades (creadores de referencia) del Agent OS agrupadas por tipo de contenido (Filmmaking, Marca personal, Ecommerce…), con cuántos reels tiene cada una en el corpus. Empieza por aquí.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'perfiles',
    description: 'Los perfiles de HELM (las marcas para las que se escriben guiones: detras-de-camra, enformaconhugo…) y qué creadores de referencia tiene asignado cada uno. Cuando te pidan guiones o análisis "para" un perfil, usa "corpus" con ese perfil.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'corpus',
    description: 'Todo lo que HELM sabe de una identidad: su descripción, contexto y reglas, la memoria guardada y sus reels con la transcripción frase a frase (cada frase con su papel: gancho, planteamiento, remate o venta), las etiquetas (tema, tipo de gancho, estructura, CTA) y las métricas. Es la base para analizar su estilo o escribir guiones como los suyos. Con "perfil" devuelve lo mismo de todos los creadores asignados a ese perfil de HELM; con "tipo", el de todos los creadores de ese tipo de contenido. Los reels van ordenados de más a menos vistas. Sin identidad ni perfil devuelve los reels que no tienen identidad.',
    inputSchema: {
      type: 'object',
      properties: {
        identidad: { type: 'string', description: 'Nombre o slug de la identidad, p. ej. "samzia".' },
        perfil: { type: 'string', description: 'Slug o nombre del perfil de HELM, p. ej. "detras-de-camra".' },
        tipo: { type: 'string', description: 'Tipo de contenido, p. ej. "Filmmaking".' },
      },
    },
  },
  {
    name: 'anadir_reels',
    description: 'Añade reels al corpus por su enlace (Instagram, TikTok o YouTube). El servidor los descarga, transcribe y etiqueta por detrás: tarda unos minutos por reel, así que no estarán en el corpus al momento. Los que ya estaban se saltan.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'Enlaces de los reels.' },
        identidad: { type: 'string', description: 'Nombre o slug de la identidad a la que pertenecen.' },
      },
      required: ['urls'],
    },
  },
  {
    name: 'asignar_creadores',
    description: 'Asigna creadores de referencia a un perfil de HELM, o se los quita. Lo mismo que Ajustes → IA → Creadores de referencia. Se puede pasar una lista de creadores y/o un tipo de contenido entero.',
    inputSchema: {
      type: 'object',
      properties: {
        perfil: { type: 'string', description: 'Slug o nombre del perfil de HELM, p. ej. "silvestre".' },
        identidades: { type: 'array', items: { type: 'string' }, description: 'Nombres o slugs de los creadores.' },
        tipo: { type: 'string', description: 'Todos los creadores de este tipo de contenido, p. ej. "Filmmaking".' },
        quitar: { type: 'boolean', description: 'true para quitarlos en vez de asignarlos.' },
      },
      required: ['perfil'],
    },
  },
  {
    name: 'etiquetar_reels',
    description: 'Corrige el etiquetado de uno o varios reels del corpus. El etiquetado automático lo hace un modelo local pequeño y se equivoca mucho (pone "pregunta" de gancho casi siempre): cuando analices reels con "corpus", mira si sus etiquetas encajan con el guion y, si no, CORRÍGELAS con esto. Tu etiquetado sustituye al automático y ya no se vuelve a pisar.',
    inputSchema: {
      type: 'object',
      properties: {
        reels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'La url del reel, tal cual sale en "corpus".' },
              tipo_gancho: { type: 'string', enum: GANCHOS, description: 'Cómo abre el reel.' },
              estructura: { type: 'string', enum: ESTRUCTURAS, description: 'Cómo está montado.' },
              tema: { type: 'string', description: 'De qué va, en 3-5 palabras.' },
              cta: { type: 'string', description: 'Qué pide al final, literal. Vacío si no pide nada.' },
              tipo: { type: 'string', enum: Object.keys(TIPOS), description: 'Para qué sirve el reel: viralidad, conversion, autoridad o venta.' },
              formato: { type: 'string', enum: FORMATOS, description: 'Cómo está montado (ver la guía de formatos en memoria_global). Solo si lo sabes por el guion.' },
              roles: {
                type: 'array', items: { type: 'string', enum: ROLES },
                description: 'El papel de cada frase, en el mismo orden y número que las frases de "corpus". Opcional.',
              },
            },
            required: ['url', 'tipo_gancho', 'estructura', 'tema'],
          },
        },
      },
      required: ['reels'],
    },
  },
  {
    name: 'calendario',
    description: 'El calendario de guiones de un perfil de HELM: cada guion con su fecha, título, tipo (viralidad, conversión, autoridad, venta), el texto y en qué fase está (por grabar, sin editar, editado, publicado; la fase sale de la carpeta de Drive donde está la pieza). Incluye los vídeos que llegaron a "0 · Entrada" y no se supo de qué guion eran, para ordenarlos con "ordenar_video". Úsalo para "¿qué grabo esta semana?", "¿qué está listo para publicar?" o antes de programar guiones nuevos.',
    inputSchema: {
      type: 'object',
      properties: {
        perfil: { type: 'string', description: 'Slug o nombre del perfil, p. ej. "enformaconhugo".' },
        desde: { type: 'string', description: 'AAAA-MM-DD. Por defecto, hace 7 días.' },
        hasta: { type: 'string', description: 'AAAA-MM-DD. Por defecto, dentro de 30 días.' },
      },
      required: ['perfil'],
    },
  },
  {
    name: 'programar_guiones',
    description: 'Mete guiones en el calendario de un perfil (o corrige uno pasando su id). Cada guion lleva su tipo, que decide su carpeta en Drive: cuando se grabe y se suba a "0 · Entrada", HELM lo reconocerá por lo que se dice y lo moverá solo a "1 · Sin editar / <tipo>". Escribe el guion completo, tal como se va a decir: es lo que permite reconocer el vídeo.',
    inputSchema: {
      type: 'object',
      properties: {
        perfil: { type: 'string' },
        guiones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Solo para corregir uno que ya existe.' },
              fecha: { type: 'string', description: 'AAAA-MM-DD, el día de publicación.' },
              titulo: { type: 'string' },
              tipo: { type: 'string', enum: Object.keys(TIPOS) },
              guion: { type: 'string', description: 'El guion entero.' },
            },
            required: ['fecha', 'titulo', 'tipo', 'guion'],
          },
        },
      },
      required: ['perfil', 'guiones'],
    },
  },
  {
    name: 'ordenar_video',
    description: 'Coloca un vídeo que se quedó en "0 · Entrada" porque HELM no supo de qué guion era. Con guion_id va a la pieza de ese guion; sin guion, con el tipo, va a "1 · Sin editar / <tipo>" en una pieza nueva.',
    inputSchema: {
      type: 'object',
      properties: {
        perfil: { type: 'string' },
        video_id: { type: 'string', description: 'El id que sale en "calendario" → sin_ordenar.' },
        guion_id: { type: 'string' },
        tipo: { type: 'string', enum: Object.keys(TIPOS) },
      },
      required: ['perfil', 'video_id'],
    },
  },
  {
    name: 'guardar_memoria',
    description: 'Guarda una nota en la memoria a largo plazo: una conclusión del análisis, una regla de estilo, algo que funciona o que no. Con identidad queda asociada a ella; sin identidad es global. Lo guardado vuelve a salir en "corpus".',
    inputSchema: {
      type: 'object',
      properties: {
        contenido: { type: 'string', description: 'La nota.' },
        identidad: { type: 'string', description: 'Nombre o slug de la identidad (opcional).' },
      },
      required: ['contenido'],
    },
  },
]

// El nombre o el slug, sin distinguir mayúsculas: Claude escribe "Samzia" tan
// a menudo como "samzia".
async function identidadDe(nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  if (!n) return null
  const { data, error } = await supabase.from('agent_identities').select('*')
  if (error) throw error
  const ident = (data || []).find(i => i.slug === n || i.nombre.toLowerCase() === n)
  if (!ident) {
    throw new Error(`No hay ninguna identidad "${nombre}". Las que hay: ${(data || []).map(i => i.nombre).join(', ') || 'ninguna'}`)
  }
  return ident
}

// El perfil de HELM por slug o nombre, igual de tolerante que identidadDe.
async function perfilDe(nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  const { data, error } = await supabase.from('clients').select('id, slug, name')
  if (error) throw error
  const c = (data || []).find(x => x.slug === n || String(x.name || '').toLowerCase() === n)
  if (!c) throw new Error(`No hay ningún perfil "${nombre}" en HELM.`)
  return c
}

// Lo de un creador: su ficha, su memoria y sus reels. Sin creador, los reels
// que no tienen identidad.
async function corpusDe(ident) {
  let reels = supabase.from('agent_reels')
    .select('url, publicado_en, caption, metricas, idioma, transcripcion, frases, etiquetas, estado')
    .in('estado', ['transcrito', 'etiquetado', 'error'])
    .neq('transcripcion', '')
    .limit(100)
  reels = ident ? reels.eq('identity_id', ident.id) : reels.is('identity_id', null)
  const memoria = ident
    ? supabase.from('agent_memory').select('contenido, updated_at')
      .eq('identity_id', ident.id).order('updated_at', { ascending: false }).limit(200)
    : Promise.resolve({ data: [] })

  const [r, m] = await Promise.all([reels, memoria])
  if (r.error) throw r.error
  if (m.error) throw m.error

  const vistas = (x) => Number(x.metricas?.vistas) || 0
  return {
    identidad: ident && {
      nombre: ident.nombre, tipo: ident.categoria, descripcion: ident.descripcion,
      contexto: ident.contexto, reglas: ident.reglas,
    },
    memoria: m.data || [],
    reels: (r.data || []).sort((a, b) => vistas(b) - vistas(a)).map(x => ({
      url: x.url,
      publicado_en: x.publicado_en,
      caption: x.caption || undefined,
      idioma: x.idioma,
      etiquetas: x.etiquetas,
      metricas: x.metricas,
      // Sin etiquetar todavía (o el modelo local falló): la transcripción
      // está, pero los papeles de frase no significan nada.
      etiquetado: x.estado === 'etiquetado',
      // Quién etiquetó: lo del modelo local es un borrador que Claude debe revisar.
      etiquetado_por: x.estado === 'etiquetado' ? (['claude', 'claude-api'].includes(x.etiquetas?.por) ? 'claude' : x.etiquetas?.por === 'jev' ? 'jev, revisar' : 'modelo local, revisar') : undefined,
      frases: (x.frases || []).length
        ? x.frases.map(f => (x.estado === 'etiquetado' ? `[${f.rol}] ${f.texto}` : f.texto))
        : [x.transcripcion],
    })),
  }
}

const HERRAMIENTAS = {
  async identidades() {
    const [ids, reels] = await Promise.all([
      supabase.from('agent_identities').select('nombre, slug, categoria, descripcion, activa').order('nombre'),
      supabase.from('agent_reels').select('identity_id, agent_identities(slug)'),
    ])
    if (ids.error) throw ids.error
    if (reels.error) throw reels.error
    const cuenta = {}
    for (const r of reels.data || []) {
      const slug = r.agent_identities?.slug || '(sin identidad)'
      cuenta[slug] = (cuenta[slug] || 0) + 1
    }
    // Agrupadas por tipo de contenido, que es como se eligen: "los de filmmaking".
    const porTipo = {}
    for (const i of ids.data || []) {
      const k = i.categoria || 'Sin tipo de contenido'
      ;(porTipo[k] ||= []).push({ nombre: i.nombre, slug: i.slug, descripcion: i.descripcion, activa: i.activa, reels: cuenta[i.slug] || 0 })
    }
    return { por_tipo_de_contenido: porTipo, reels_sin_identidad: cuenta['(sin identidad)'] || 0 }
  },

  async perfiles() {
    const { data, error } = await supabase.from('agent_identity_clients')
      .select('clients(slug, name), agent_identities(nombre)')
    if (error) throw error
    const porPerfil = {}
    for (const r of data || []) {
      const k = r.clients.slug
      porPerfil[k] ||= { perfil: k, nombre: r.clients.name, creadores: [] }
      porPerfil[k].creadores.push(r.agent_identities.nombre)
    }
    const perfiles = Object.values(porPerfil)
    return perfiles.length
      ? { perfiles }
      : { perfiles, nota: 'Ningún perfil tiene creadores asignados. Se asignan en HELM → Ajustes → IA.' }
  },

  async corpus({ identidad, perfil, tipo }) {
    // La memoria global (reglas de HELM, conclusiones generales) vale para
    // cualquier guion: va una vez, fuera de cada creador.
    const global = await supabase.from('agent_memory').select('contenido, updated_at')
      .eq('ambito', 'global').order('updated_at', { ascending: false }).limit(100)
    if (global.error) throw global.error

    if (perfil) {
      const cliente = await perfilDe(perfil)
      const { data, error } = await supabase.from('agent_identity_clients')
        .select('agent_identities(*)').eq('client_id', cliente.id)
      if (error) throw error
      const creadores = (data || []).map(r => r.agent_identities)
      if (!creadores.length) {
        throw new Error(`El perfil "${cliente.name}" no tiene creadores asignados. Se asignan en HELM → Ajustes → IA.`)
      }
      return {
        perfil: { slug: cliente.slug, nombre: cliente.name },
        memoria_global: global.data || [],
        creadores: await Promise.all(creadores.map(corpusDe)),
      }
    }

    if (tipo) {
      const { data, error } = await supabase.from('agent_identities').select('*')
      if (error) throw error
      const t = String(tipo).trim().toLowerCase()
      const creadores = (data || []).filter(i => (i.categoria || '').toLowerCase() === t)
      if (!creadores.length) {
        const hay = [...new Set((data || []).map(i => i.categoria).filter(Boolean))]
        throw new Error(`No hay creadores de tipo "${tipo}". Los tipos que hay: ${hay.join(', ') || 'ninguno'}`)
      }
      return {
        tipo: creadores[0].categoria,
        memoria_global: global.data || [],
        creadores: await Promise.all(creadores.map(corpusDe)),
      }
    }

    const ident = await identidadDe(identidad)
    return { memoria_global: global.data || [], ...(await corpusDe(ident)) }
  },

  async asignar_creadores({ perfil, identidades, tipo, quitar }) {
    const cliente = await perfilDe(perfil)
    const ids = new Map()
    for (const n of Array.isArray(identidades) ? identidades : []) {
      const i = await identidadDe(n)
      if (i) ids.set(i.id, i.nombre)
    }
    if (tipo) {
      const { data, error } = await supabase.from('agent_identities').select('id, nombre, categoria')
      if (error) throw error
      const del = (data || []).filter(i => (i.categoria || '').toLowerCase() === String(tipo).trim().toLowerCase())
      if (!del.length) throw new Error(`No hay creadores de tipo "${tipo}".`)
      for (const i of del) ids.set(i.id, i.nombre)
    }
    if (!ids.size) throw new Error('Di qué creadores: "identidades" o "tipo".')

    const { error } = quitar
      ? await supabase.from('agent_identity_clients').delete()
        .eq('client_id', cliente.id).in('identity_id', [...ids.keys()])
      : await supabase.from('agent_identity_clients').upsert(
        [...ids.keys()].map(identity_id => ({ identity_id, client_id: cliente.id })),
        { onConflict: 'identity_id,client_id', ignoreDuplicates: true })
    if (error) throw error
    return { perfil: cliente.slug, [quitar ? 'quitados' : 'asignados']: [...ids.values()] }
  },

  async anadir_reels({ urls, identidad }) {
    const lista = (Array.isArray(urls) ? urls : [urls]).map(u => String(u || '').trim()).filter(Boolean)
    if (!lista.length) throw new Error('No has pasado ningún enlace')
    if (lista.length > 100) throw new Error('Máximo 100 enlaces por vez')
    const ident = await identidadDe(identidad)
    const { nuevos, repetidos } = await anadeReels(lista, ident?.id || null)
    return { anadidos: nuevos.length, ya_estaban: repetidos, nota: 'Se procesan por detrás, unos minutos por reel.' }
  },

  async etiquetar_reels({ reels }) {
    const lista = Array.isArray(reels) ? reels : []
    if (!lista.length) throw new Error('No has pasado ningún reel')
    if (lista.length > 50) throw new Error('Máximo 50 reels por vez')

    const hechos = []
    const fallos = []
    for (const r of lista) {
      const { data: reel, error } = await supabase.from('agent_reels')
        .select('id, frases').eq('url_hash', hashUrl(r.url)).maybeSingle()
      if (error) throw error
      if (!reel) { fallos.push(`${r.url}: no está en el corpus`); continue }
      if (!GANCHOS.includes(r.tipo_gancho)) { fallos.push(`${r.url}: gancho "${r.tipo_gancho}" no vale`); continue }
      if (!ESTRUCTURAS.includes(r.estructura)) { fallos.push(`${r.url}: estructura "${r.estructura}" no vale`); continue }

      const fila = {
        etiquetas: {
          tema: String(r.tema || '').slice(0, 120),
          tipo_gancho: r.tipo_gancho,
          estructura: r.estructura,
          cta: String(r.cta || '').slice(0, 200),
          ...(TIPOS[r.tipo] ? { tipo: r.tipo } : {}),
          ...(FORMATOS.includes(r.formato) ? { formato: r.formato } : {}),
          // Marca que lo hizo Claude: el worker ya no lo reetiqueta encima.
          por: 'claude',
        },
        estado: 'etiquetado',
        error: '',
        updated_at: new Date().toISOString(),
      }
      // Los papeles solo si cuadran frase a frase; si no, se quedan los que había.
      const frases = reel.frases || []
      if (Array.isArray(r.roles) && r.roles.length === frases.length && frases.length) {
        fila.frases = frases.map((f, i) => ({ ...f, rol: ROLES.includes(r.roles[i]) ? r.roles[i] : 'planteamiento' }))
      } else if (Array.isArray(r.roles) && r.roles.length) {
        fallos.push(`${r.url}: ${r.roles.length} papeles para ${frases.length} frases; se guardan las etiquetas sin los papeles`)
      }
      const { error: e2 } = await supabase.from('agent_reels').update(fila).eq('id', reel.id)
      if (e2) throw e2
      hechos.push(r.url)
    }
    return { corregidos: hechos.length, ...(fallos.length ? { avisos: fallos } : {}) }
  },

  async calendario({ perfil, desde, hasta }) {
    const c = await perfilDe(perfil)
    const dia = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)
    const guiones = await calendario(c.id, { desde: desde || dia(-7), hasta: hasta || dia(30) })
    const { data: sueltos, error } = await supabase.from('agent_drive_videos')
      .select('drive_id, nombre, transcripcion, created_at').eq('client_id', c.id).eq('estado', 'sin_guion')
    if (error) throw error
    return {
      perfil: c.slug,
      guiones: guiones.map(g => ({
        id: g.id, fecha: g.date, titulo: g.title, tipo: g.tipo ? TIPOS[g.tipo] : 'sin tipo',
        fase: FASES[g.fase], guion: g.body || '',
      })),
      sin_ordenar: (sueltos || []).map(v => ({
        video_id: v.drive_id, nombre: v.nombre, llego: v.created_at, dice: v.transcripcion.slice(0, 600),
      })),
    }
  },

  async programar_guiones({ perfil, guiones }) {
    const c = await perfilDe(perfil)
    const lista = Array.isArray(guiones) ? guiones : []
    if (!lista.length) throw new Error('No has pasado ningún guion')
    const hechos = []
    for (const g of lista) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(g.fecha))) throw new Error(`Fecha no válida: "${g.fecha}" (AAAA-MM-DD)`)
      if (!TIPOS[g.tipo]) throw new Error(`Tipo no válido: "${g.tipo}"`)
      const fila = {
        client_id: c.id, date: g.fecha, title: String(g.titulo).slice(0, 200), body: String(g.guion || ''),
        tipo: g.tipo, format: 'reel', source: 'claude', updated_at: new Date().toISOString(),
      }
      const q = g.id
        ? supabase.from('helm_content_calendar').update(fila).eq('id', g.id).eq('client_id', c.id).select('id, date, title').single()
        : supabase.from('helm_content_calendar').insert(fila).select('id, date, title').single()
      const { data, error } = await q
      if (error) throw error
      hechos.push(`${data.date} · ${data.title}`)
    }
    return { perfil: c.slug, programados: hechos }
  },

  async ordenar_video({ perfil, video_id, guion_id, tipo }) {
    const c = await perfilDe(perfil)
    const { data: v, error } = await supabase.from('agent_drive_videos')
      .select('drive_id, nombre').eq('drive_id', video_id).eq('client_id', c.id).maybeSingle()
    if (error) throw error
    if (!v) throw new Error('Ese vídeo no está entre los de este perfil')
    let guion = null
    if (guion_id) {
      const r = await supabase.from('helm_content_calendar')
        .select('id, date, title, body, tipo, grabado_at, drive_carpeta_id').eq('id', guion_id).eq('client_id', c.id).maybeSingle()
      if (r.error) throw r.error
      if (!r.data) throw new Error('Ese guion no es de este perfil')
      guion = r.data
    } else if (!TIPOS[tipo]) throw new Error('Pasa guion_id, o el tipo si no es de ningún guion')

    const { parents = [] } = await archivoDrive(video_id)
    const r = await ordenar({ clientId: c.id, driveId: video_id, desde: parents[0], guion, tipo })
    await supabase.from('agent_drive_videos').update({
      estado: 'ordenado', calendario_id: guion?.id || null, destino: r.destino, updated_at: new Date().toISOString(),
    }).eq('drive_id', video_id)
    return { video: v.nombre, movido_a: r.destino }
  },

  async guardar_memoria({ contenido, identidad }) {
    const texto = String(contenido || '').trim()
    if (!texto) throw new Error('La nota está vacía')
    const ident = await identidadDe(identidad)
    const { error } = await supabase.from('agent_memory').insert({
      ambito: ident ? 'identidad' : 'global',
      identity_id: ident?.id || null,
      contenido: texto,
    })
    if (error) throw error
    return { guardado: true, en: ident ? ident.nombre : 'memoria global' }
  },
}

// ¿Quién es este token? El maestro (HELM_MCP_TOKEN) es el del operador y lo
// ve todo. Los de cada perfil viven hasheados en agent_mcp_tokens y solo ven
// ese perfil. Devuelve null si no vale.
async function alcanceDe(dado) {
  const t = String(dado || '')
  if (t.length < 32) return null
  const maestro = process.env.HELM_MCP_TOKEN || ''
  if (maestro.length >= 32) {
    const a = Buffer.from(t), b = Buffer.from(maestro)
    if (a.length === b.length && timingSafeEqual(a, b)) return { operador: true }
  }
  const hash = createHash('sha256').update(t).digest('hex')
  const { data } = await supabase.from('agent_mcp_tokens')
    .select('client_id, clients(slug, name)').eq('token_hash', hash).maybeSingle()
  if (!data?.clients) return null
  supabase.from('agent_mcp_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', hash).then(() => {})
  return { clientId: data.client_id, slug: data.clients.slug, nombre: data.clients.name }
}

// ── Lo que puede hacer un perfil con su propio enlace ───────────────────────
// Leer y usar SU parte: sus creadores, su calendario, sus vídeos. Lo que toca
// el corpus de todos (añadir reels, reetiquetar, asignar creadores) es del
// operador y ni siquiera aparece.
const DEL_CLIENTE = ['identidades', 'perfiles', 'corpus', 'calendario', 'programar_guiones', 'ordenar_video', 'guardar_memoria']

async function asignadosDe(clientId) {
  const { data, error } = await supabase.from('agent_identity_clients')
    .select('agent_identities(nombre, slug)').eq('client_id', clientId)
  if (error) throw error
  return (data || []).map(r => r.agent_identities).filter(Boolean)
}
const esDe = (lista, nombre) => {
  const n = String(nombre || '').trim().toLowerCase()
  return lista.some(i => i.slug === n || i.nombre.toLowerCase() === n)
}

async function llamaComoCliente(nombre, args, a) {
  if (!DEL_CLIENTE.includes(nombre)) throw new Error('Esa herramienta no está disponible con este enlace.')
  const mios = await asignadosDe(a.clientId)
  const x = { ...args, perfil: a.slug }

  if (nombre === 'perfiles') return { perfiles: [{ perfil: a.slug, nombre: a.nombre, creadores: mios.map(i => i.nombre) }] }
  if (nombre === 'identidades') {
    const r = await HERRAMIENTAS.identidades()
    const porTipo = {}
    for (const [tipo, lista] of Object.entries(r.por_tipo_de_contenido)) {
      const suyos = lista.filter(i => esDe(mios, i.slug))
      if (suyos.length) porTipo[tipo] = suyos
    }
    return { perfil: a.slug, por_tipo_de_contenido: porTipo }
  }
  if (nombre === 'corpus') {
    // Un creador suyo por nombre; si no, todos los de su perfil.
    if (x.identidad && esDe(mios, x.identidad)) return HERRAMIENTAS.corpus({ identidad: x.identidad })
    if (x.identidad) throw new Error(`"${x.identidad}" no es uno de los creadores de ${a.nombre}.`)
    return HERRAMIENTAS.corpus({ perfil: a.slug })
  }
  if (nombre === 'guardar_memoria') {
    if (!x.identidad || !esDe(mios, x.identidad)) {
      throw new Error(`Di en qué creador guardarlo: ${mios.map(i => i.nombre).join(', ')}.`)
    }
    return HERRAMIENTAS.guardar_memoria(x)
  }
  return HERRAMIENTAS[nombre](x)
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fallo = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

async function responde(msg, alcance) {
  const { id, method, params } = msg || {}
  switch (method) {
    case 'initialize': {
      const pedida = params?.protocolVersion
      return ok(id, {
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'helm-agent-os', version: '1.0.0' },
        instructions: alcance.operador
          ? 'Corpus de reels de referencia del Agent OS de HELM. Para analizar a un creador o escribir guiones con su estilo: "identidades" y luego "corpus" de esa identidad. Para escribir para una marca de HELM: "perfiles" y luego "corpus" con ese perfil. Los guiones se guardan con "programar_guiones" (con su tipo) y se consultan con "calendario"; al grabarlos y subirlos a "0 · Entrada" de su Drive, HELM los mueve solos a su carpeta. Las conclusiones que merezca la pena conservar, con "guardar_memoria". El etiquetado del "modelo local" es poco fiable: al analizar, corrige con "etiquetar_reels" las etiquetas que no encajen con el guion. Si piden un guion "en B-roll" o de un formato de montaje concreto, sigue la guía de formatos que viene en memoria_global.'
          : `Conector de contenido de ${alcance.nombre} en HELM (perfil "${alcance.slug}"). Sus creadores de referencia y su propio historial están en "corpus"; su calendario de guiones, en "calendario". Para escribir guiones: lee "corpus" (la memoria_global trae la guía de formatos de montaje, como el B-roll), escribe con la voz del creador "Propio" sin repetir temas que ya haya tratado, y guárdalos con "programar_guiones" (con su tipo). Al grabarlos y subirlos a "0 · Entrada" de su Drive, HELM los ordena solos.`,
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: alcance.operador ? TOOLS : TOOLS.filter(t => DEL_CLIENTE.includes(t.name)) })
    case 'tools/call': {
      const fn = alcance.operador
        ? HERRAMIENTAS[params?.name]
        : (args) => llamaComoCliente(params?.name, args, alcance)
      if (!HERRAMIENTAS[params?.name]) return fallo(id, -32602, `Herramienta desconocida: ${params?.name}`)
      // Un fallo de la herramienta va como resultado con isError, no como
      // error JSON-RPC: así Claude lo lee y puede corregir (p. ej. el nombre
      // de la identidad) en vez de dar la llamada por rota.
      try {
        const r = await fn(params?.arguments || {})
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(r, null, 1) }] })
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: String(e?.message || e) }], isError: true })
      }
    }
    default:
      return fallo(id, -32601, `Método no soportado: ${method}`)
  }
}

export default async function handler(req, res) {
  // Un token es una contraseña larga en una URL: se limita cuántas veces se
  // puede probar desde una misma IP, y cuánto puede pedir quien ya lo tiene.
  const paso = rateLimit({ key: `mcp:${getClientIp(req)}`, max: 240, windowMs: 60_000 })
  if (!paso.ok) return res.status(429).setHeader('Retry-After', String(paso.retryAfter)).json({ error: 'Demasiadas peticiones' })
  const alcance = await alcanceDe(req.query?.token)
  if (!alcance) return res.status(404).json({ error: 'No encontrado' })
  // Sin sesiones ni avisos del servidor: no hay canal GET que abrir.
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST').end()

  const body = req.body
  const lote = Array.isArray(body) ? body : [body]
  if (!lote.length || lote.some(m => !m || typeof m !== 'object')) {
    return res.status(400).json(fallo(null, -32700, 'JSON no válido'))
  }

  // Las notificaciones (sin id) no llevan respuesta.
  const respuestas = []
  for (const m of lote) {
    if (m.id === undefined || m.id === null) continue
    respuestas.push(await responde(m, alcance))
  }
  if (!respuestas.length) return res.status(202).end()
  return res.status(200).json(Array.isArray(body) ? respuestas : respuestas[0])
}
