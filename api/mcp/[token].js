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
import { anotar, contexto, enContexto } from '../_lib/contexto.js'
import { agenciaDe } from '../_lib/access.js'
import { anadeReels, hashUrl, esEnlace } from '../agents.js'
import { calendario, ordenar, TIPOS, FASES } from '../_lib/ingesta.js'
import { archivo as archivoDrive } from '../_lib/drive-helm.js'
import { sincronizar as sincronizarIg } from '../instagram.js'
import { informeIg } from '../_lib/instagram.js'
import { validaArgs, explicaErrores, pagina, recorta, resumeArgs } from '../_lib/esquema.js'

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05']

// Los mismos valores que el worker (scripts/agents-worker.mjs) y la gráfica
// (src/agents/ganchos.js): una etiqueta fuera de lista no se dibuja.
const GANCHOS = ['pregunta', 'dato', 'error comun', 'contrarian', 'historia', 'promesa', 'lista', 'demostracion']
const ESTRUCTURAS = ['problema-solucion', 'lista', 'historia', 'comparacion', 'tutorial', 'opinion']
const ROLES = ['gancho', 'planteamiento', 'remate', 'venta']
// Los formatos de montaje de la guía guardada en la memoria global.
const FORMATOS = ['hablando a cámara', 'hablando a cámara + insertos', 'b-roll + voz en off', 'b-roll + frase en pantalla',
  'recortado sobre imágenes', 'demostración con texto clave', 'podcast o entrevista', 'escenario o evento', 'vídeo ajeno + texto']

// Piezas que repiten varias herramientas.
const PERFIL = {
  type: 'string',
  description: 'Slug del perfil de HELM (o su nombre), p. ej. "detras-de-camra"; los da "perfiles". Con el enlace de un perfil no hace falta: va siempre el suyo.',
}
const PERFIL_REGISTRO = {
  ...PERFIL,
  description: `${PERFIL.description} Aquí es opcional: sirve para que la escritura quede en el registro de ese perfil (HELM → Agentes → Equipo).`,
}
const PRUEBA = { type: 'boolean', description: 'true para ensayar: valida todo y devuelve lo que HARÍA, sin escribir nada.' }
const CURSOR = { type: 'integer', minimum: 0, description: 'Para seguir donde se quedó la respuesta anterior: pasa el número que vino en "siguiente". Por defecto 0.' }
const fecha = (texto) => ({ type: 'string', format: 'date', description: `AAAA-MM-DD, p. ej. "2026-10-14". ${texto}` })

// Paginación de las lecturas largas: todas responden con hay_mas y, si lo hay,
// siguiente (el cursor de la próxima llamada).
const PAGINACION = 'Si no cabe todo, la respuesta trae "hay_mas": true y "siguiente": vuelve a llamar con cursor = siguiente.'
// Lo que devuelve cada escritura.
const ESCRITURA = 'Con prueba=true no escribe: devuelve lo que haría. Repetir la misma llamada no duplica nada. Devuelve lo escrito (con ids), "hecho" (en una frase) y "comprobar" (qué llamada lo enseña).'

const TOOLS = [
  {
    name: 'identidades',
    description: 'Lista las identidades (creadores de referencia) del Agent OS agrupadas por tipo de contenido (Filmmaking, Marca personal, Ecommerce…), con cuántos reels tiene cada una en el corpus. Empieza por aquí. Devuelve { por_tipo_de_contenido: { <tipo>: [{ nombre, slug, descripcion, activa, reels }] }, reels_sin_identidad }.',
    inputSchema: {
      type: 'object',
      properties: {
        perfil: { ...PERFIL, description: `${PERFIL.description} Opcional: solo los creadores asignados a ese perfil.` },
        tipo: { type: 'string', description: 'Opcional: solo los de este tipo de contenido, p. ej. "Filmmaking".' },
      },
    },
  },
  {
    name: 'perfiles',
    description: 'Los perfiles de HELM (las marcas para las que se escriben guiones: detras-de-camra, enformaconhugo…) y qué creadores de referencia tiene asignado cada uno. Cuando te pidan guiones o análisis "para" un perfil, usa "corpus" con ese perfil. Devuelve { perfiles: [{ perfil (el slug), nombre, creadores: [nombre] }] }.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'corpus',
    description: `Lo que HELM sabe de una identidad: su ficha (descripción, contexto y reglas), la memoria guardada y sus reels con la transcripción frase a frase (cada frase con su papel: gancho, planteamiento, remate o venta), las etiquetas (tema, tipo de gancho, estructura, CTA) y las métricas. Es la base para analizar su estilo o escribir guiones como los suyos. Con "perfil", lo mismo de todos los creadores asignados a ese perfil; con "tipo", el de todos los creadores de ese tipo de contenido; sin identidad, perfil ni tipo, los reels que no tienen identidad. Los reels van de más a menos vistas, "limite" por creador. La memoria (memoria_global, con la guía de formatos de montaje, y la de cada creador) y las fichas solo vienen en la primera página (cursor 0). Con perfil o tipo (varios creadores) va por defecto en resumen: cada reel con url, fecha, métricas, etiquetas y el gancho, y la memoria de cada creador recortada; para escribir como uno de ellos, pide luego "corpus" con su identidad, que va completo. ${PAGINACION}`,
    inputSchema: {
      type: 'object',
      properties: {
        identidad: { type: 'string', description: 'Nombre o slug de la identidad, p. ej. "samzia".' },
        perfil: PERFIL,
        tipo: { type: 'string', description: 'Tipo de contenido, p. ej. "Filmmaking".' },
        limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Reels por creador en esta página. Por defecto 10 con una identidad y 5 con perfil o tipo; máximo 100.' },
        cursor: CURSOR,
        detalle: { type: 'string', enum: ['completo', 'resumen'], description: '"completo" (por defecto con una identidad): cada reel con todas sus frases y la memoria entera. "resumen" (por defecto con perfil o tipo): sin transcripción, solo el gancho, y la memoria de cada creador recortada a 600 caracteres por nota.' },
      },
    },
  },
  {
    name: 'anadir_reels',
    description: `Añade reels al corpus por su enlace (Instagram, TikTok o YouTube). El servidor los descarga, transcribe y etiqueta por detrás: tarda unos minutos por reel, así que no estarán en el corpus al momento. Los que ya estaban se saltan. ${ESCRITURA}`,
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100, description: 'Enlaces de los reels (https://…), hasta 100.' },
        identidad: { type: 'string', description: 'Nombre o slug de la identidad a la que pertenecen. Sin ella, quedan sin identidad.' },
        perfil: PERFIL_REGISTRO,
        prueba: PRUEBA,
      },
      required: ['urls'],
    },
  },
  {
    name: 'asignar_creadores',
    description: `Asigna creadores de referencia a un perfil de HELM, o se los quita. Lo mismo que Ajustes → IA → Creadores de referencia. Se puede pasar una lista de creadores y/o un tipo de contenido entero. ${ESCRITURA}`,
    inputSchema: {
      type: 'object',
      properties: {
        perfil: PERFIL,
        identidades: { type: 'array', items: { type: 'string' }, description: 'Nombres o slugs de los creadores.' },
        tipo: { type: 'string', description: 'Todos los creadores de este tipo de contenido, p. ej. "Filmmaking".' },
        quitar: { type: 'boolean', description: 'true para quitarlos en vez de asignarlos.' },
        prueba: PRUEBA,
      },
      required: ['perfil'],
    },
  },
  {
    name: 'etiquetar_reels',
    description: `Corrige el etiquetado de uno o varios reels del corpus (hasta 50 por llamada). El etiquetado automático lo hace un modelo local pequeño y se equivoca mucho (pone "pregunta" de gancho casi siempre): cuando analices reels con "corpus", mira si sus etiquetas encajan con el guion y, si no, CORRÍGELAS con esto. Tu etiquetado sustituye al automático y ya no se vuelve a pisar. ${ESCRITURA}`,
    inputSchema: {
      type: 'object',
      properties: {
        reels: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'La url del reel, tal cual sale en "corpus".' },
              tipo_gancho: { type: 'string', enum: GANCHOS, description: 'Cómo abre el reel.' },
              estructura: { type: 'string', enum: ESTRUCTURAS, description: 'Cómo está montado.' },
              tema: { type: 'string', description: 'De qué va, en 3-5 palabras.' },
              cta: { type: 'string', description: 'Qué pide al final, literal. Vacío si no pide nada.' },
              tipo: { type: 'string', enum: Object.keys(TIPOS), description: 'Para qué sirve el reel.' },
              formato: { type: 'string', enum: FORMATOS, description: 'Cómo está montado (ver la guía de formatos en memoria_global). Solo si lo sabes por el guion.' },
              roles: {
                type: 'array', items: { type: 'string', enum: ROLES },
                description: 'El papel de cada frase, en el mismo orden y número que las frases de "corpus". Opcional.',
              },
            },
            required: ['url', 'tipo_gancho', 'estructura', 'tema'],
          },
        },
        perfil: PERFIL_REGISTRO,
        prueba: PRUEBA,
      },
      required: ['reels'],
    },
  },
  {
    name: 'calendario',
    description: `El calendario de guiones de un perfil de HELM: cada guion con su id, fecha, título, tipo (viralidad, conversión, autoridad, venta), el texto y en qué fase está (por grabar, sin editar, editado, publicado; la fase sale de la carpeta de Drive donde está la pieza). Incluye en "sin_ordenar" los vídeos que llegaron a "0 · Entrada" y no se supo de qué guion eran, para ordenarlos con "ordenar_video". Úsalo para "¿qué grabo esta semana?", "¿qué está listo para publicar?" o antes de programar guiones nuevos (para no repetir temas). Por defecto el texto de cada guion va recortado; con detalle="completo", entero. ${PAGINACION}`,
    inputSchema: {
      type: 'object',
      properties: {
        perfil: PERFIL,
        desde: fecha('Por defecto, hace 7 días.'),
        hasta: fecha('Por defecto, dentro de 30 días.'),
        detalle: { type: 'string', enum: ['resumen', 'completo'], description: '"resumen" (por defecto): el guion recortado a 200 caracteres. "completo": el guion entero.' },
        limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Guiones por página, por orden de fecha. Por defecto 60.' },
        cursor: CURSOR,
      },
      required: ['perfil'],
    },
  },
  {
    name: 'programar_guiones',
    description: `Mete guiones en el calendario de un perfil (hasta 30 por llamada), o corrige uno pasando su id. Cada guion lleva su tipo, que decide su carpeta en Drive: cuando se grabe y se suba a "0 · Entrada", HELM lo reconocerá por lo que se dice y lo moverá solo a "1 · Sin editar / <tipo>". Escribe el guion completo, tal como se va a decir: es lo que permite reconocer el vídeo. Un guion con la misma fecha y el mismo título que uno que ya está en el calendario de ese perfil lo actualiza en vez de duplicarlo. ${ESCRITURA}`,
    inputSchema: {
      type: 'object',
      properties: {
        perfil: PERFIL,
        guiones: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Solo para corregir uno que ya existe: el id que sale en "calendario".' },
              fecha: fecha('El día de publicación.'),
              titulo: { type: 'string', description: 'Corto y reconocible; hasta 200 caracteres.' },
              tipo: { type: 'string', enum: Object.keys(TIPOS), description: 'Para qué sirve: decide su carpeta en Drive.' },
              guion: { type: 'string', description: 'El guion entero, tal como se va a decir.' },
            },
            required: ['fecha', 'titulo', 'tipo', 'guion'],
          },
        },
        prueba: PRUEBA,
      },
      required: ['perfil', 'guiones'],
    },
  },
  {
    name: 'ordenar_video',
    description: `Coloca un vídeo que se quedó en "0 · Entrada" porque HELM no supo de qué guion era. Con guion_id va a la pieza de ese guion; sin guion, con el tipo, va a "1 · Sin editar / <tipo>" en una pieza nueva. Uno que ya está donde se pide no se vuelve a mover. ${ESCRITURA}`,
    inputSchema: {
      type: 'object',
      properties: {
        perfil: PERFIL,
        video_id: { type: 'string', description: 'El video_id que sale en "calendario" → sin_ordenar.' },
        guion_id: { type: 'string', description: 'El id del guion (de "calendario") al que pertenece el vídeo.' },
        tipo: { type: 'string', enum: Object.keys(TIPOS), description: 'Solo si no es de ningún guion: a qué carpeta va.' },
        prueba: PRUEBA,
      },
      required: ['perfil', 'video_id'],
    },
  },
  {
    name: 'metricas',
    description: 'Las métricas reales de Instagram de un perfil de HELM: cada publicación suya con sus visitas, alcance, likes, comentarios, guardados, compartidos, retención media (reels) y seguidores ganados, más un resumen de la cuenta (medianas) y un estudio ya calculado: las más y menos vistas, las más guardadas, la mediana por día de la semana, si las más vistas retienen más, conclusiones y propuestas para la próxima semana. Úsalo para estudiar qué funciona en la cuenta: cruza el texto y la fecha de cada pieza con "calendario" y con el "corpus" para ver qué ganchos, temas y formatos rinden, y guarda las conclusiones con "guardar_memoria". Los datos son los de la última sincronización (viene la fecha); con actualizar=true se vuelven a traer de Instagram antes de responder, que tarda unos segundos. Por defecto el texto de cada publicación va recortado; con detalle="completo", entero. Si hay más publicaciones que las pedidas, "hay_mas": true (sube "limite" o acota con "dias").',
    inputSchema: {
      type: 'object',
      properties: {
        perfil: PERFIL,
        limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Cuántas publicaciones, de la más reciente hacia atrás. Por defecto 60, máximo 200. El estudio se calcula sobre ellas.' },
        dias: { type: 'integer', minimum: 1, description: 'Solo las publicadas en los últimos N días, p. ej. 15.' },
        detalle: { type: 'string', enum: ['resumen', 'completo'], description: '"resumen" (por defecto): el texto de cada publicación recortado a 200 caracteres. "completo": entero.' },
        actualizar: { type: 'boolean', description: 'true para sincronizar con Instagram antes de leer.' },
      },
      required: ['perfil'],
    },
  },
  {
    name: 'guardar_memoria',
    description: `Guarda una nota en la memoria a largo plazo: una conclusión del análisis, una regla de estilo, algo que funciona o que no. Con identidad queda asociada a ella; sin identidad es global (solo con el enlace del operador). Lo guardado vuelve a salir en "corpus" (primera página). Una nota idéntica a una que ya está no se duplica. ${ESCRITURA}`,
    inputSchema: {
      type: 'object',
      properties: {
        contenido: { type: 'string', description: 'La nota, en texto.' },
        identidad: { type: 'string', description: 'Nombre o slug de la identidad. Con el enlace de un perfil o de una agencia es obligatoria y tiene que ser uno de sus creadores.' },
        perfil: PERFIL_REGISTRO,
        prueba: PRUEBA,
      },
      required: ['contenido'],
    },
  },
]

// Las que escriben: aceptan prueba y quedan en el registro del perfil.
export const ESCRIBEN = ['anadir_reels', 'asignar_creadores', 'etiquetar_reels', 'programar_guiones', 'ordenar_video', 'guardar_memoria']

// El nombre o el slug, sin distinguir mayúsculas: Claude escribe "Samzia" tan
// a menudo como "samzia".
async function identidadDe(nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  if (!n) return null
  const { data, error } = await supabase.from('agent_identities').select('*')
  if (error) throw error
  // Primero el slug, que es único: un creador que se llamara como el slug de
  // otro no se lo puede quedar.
  const ident = (data || []).find(i => i.slug === n) || (data || []).find(i => i.nombre.toLowerCase() === n)
  if (!ident) {
    throw new Error(`No hay ninguna identidad "${nombre}". Las que hay: ${(data || []).map(i => i.nombre).join(', ') || 'ninguna'}`)
  }
  return ident
}

// El perfil de HELM por slug o nombre, igual de tolerante que identidadDe.
async function perfilDe(nombre) {
  const tal = String(nombre || '')
  const n = tal.trim().toLowerCase()
  if (!n) throw new Error('Di qué perfil.')
  const { data, error } = await supabase.from('clients').select('id, slug, name')
  if (error) throw error
  // Primero el slug tal cual (el enlace de un perfil pasa el suyo), luego en
  // minúsculas y el nombre solo si no hay slug que case. Al revés, otra agencia
  // que llamara a su perfil como el slug de uno ajeno (o lo escribiera en
  // mayúsculas) se quedaría con lo que el enlace de ese perfil lee y escribe.
  const c = (data || []).find(x => x.slug === tal)
    || (data || []).find(x => x.slug === n)
    || (data || []).find(x => String(x.name || '').toLowerCase() === n)
  if (!c) throw new Error(`No hay ningún perfil "${nombre}" en HELM.`)
  return c
}

// Lo de un creador: su ficha, su memoria y una página de sus reels, de más a
// menos vistas. Sin creador, los reels que no tienen identidad. La ficha y la
// memoria solo en la primera página: en las siguientes ya las tiene.
const vistasDe = (x) => Number(x.metricas?.vistas) || 0

async function corpusDe(ident, { limite = 10, cursor = 0, detalle = 'completo' } = {}) {
  const filtra = (q) => {
    q = q.in('estado', ['transcrito', 'etiquetado', 'error']).neq('transcripcion', '')
    return ident ? q.eq('identity_id', ident.id) : q.is('identity_id', null)
  }
  // Primero solo id y métricas de todos, para ordenar y paginar; luego las
  // filas enteras de la página.
  const primera = !cursor
  const [todos, m] = await Promise.all([
    filtra(supabase.from('agent_reels').select('id, metricas')).limit(1000),
    ident && primera
      ? supabase.from('agent_memory').select('contenido, updated_at')
        .eq('identity_id', ident.id).order('updated_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ])
  if (todos.error) throw todos.error
  if (m.error) throw m.error
  const pag = pagina((todos.data || []).sort((a, b) => vistasDe(b) - vistasDe(a)), { cursor, limite })

  let filas = []
  if (pag.items.length) {
    const { data, error } = await supabase.from('agent_reels')
      .select('id, url, publicado_en, caption, metricas, idioma, transcripcion, frases, etiquetas, estado')
      .in('id', pag.items.map(x => x.id))
    if (error) throw error
    const porId = new Map((data || []).map(x => [x.id, x]))
    filas = pag.items.map(x => porId.get(x.id)).filter(Boolean)
  }

  const reels = filas.map(x => {
    // Sin etiquetar todavía (o el modelo local falló): la transcripción
    // está, pero los papeles de frase no significan nada.
    const etiquetado = x.estado === 'etiquetado'
    const frases = (x.frases || []).length
      ? x.frases.map(f => (etiquetado ? `[${f.rol}] ${f.texto}` : f.texto))
      : [x.transcripcion]
    return {
      url: x.url,
      publicado_en: x.publicado_en,
      ...(detalle === 'completo' ? { caption: x.caption || undefined, idioma: x.idioma } : {}),
      etiquetas: x.etiquetas,
      metricas: x.metricas,
      etiquetado,
      // Quién etiquetó: lo del modelo local es un borrador que Claude debe revisar.
      etiquetado_por: etiquetado ? (['claude', 'claude-api'].includes(x.etiquetas?.por) ? 'claude' : x.etiquetas?.por === 'jev' ? 'jev, revisar' : 'modelo local, revisar') : undefined,
      ...(detalle === 'completo'
        ? { frases }
        : { gancho: recorta(frases[0], 200), frases_total: frases.length }),
    }
  })

  return {
    ...(ident && primera ? {
      identidad: {
        nombre: ident.nombre, tipo: ident.categoria, descripcion: ident.descripcion,
        contexto: ident.contexto, reglas: ident.reglas,
      },
      memoria: detalle === 'completo' ? m.data || [] : (m.data || []).map(n => ({ ...n, contenido: recorta(n.contenido, 600) })),
    } : ident ? { identidad: { nombre: ident.nombre } } : {}),
    reels_total: pag.total,
    reels,
    hay_mas: pag.hay_mas,
  }
}

// Lo que se dice al agente para que compruebe una escritura.
const comprobar = (herramienta, argumentos, nota) => ({ herramienta, argumentos, ...(nota ? { nota } : {}) })

// La clave natural de un guion: misma fecha y mismo título (sin mayúsculas ni
// espacios de más) en el mismo perfil es el mismo guion.
const claveGuion = (fecha, titulo) => `${fecha}|${String(titulo || '').trim().replace(/\s+/g, ' ').toLowerCase()}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HERRAMIENTAS = {
  async identidades({ perfil, tipo } = {}) {
    const [ids, reels, suyos] = await Promise.all([
      supabase.from('agent_identities').select('id, nombre, slug, categoria, descripcion, activa').order('nombre'),
      supabase.from('agent_reels').select('identity_id, agent_identities(slug)'),
      perfil ? perfilDe(perfil).then(c => asignadosDe(c.id)) : null,
    ])
    if (ids.error) throw ids.error
    if (reels.error) throw reels.error
    const cuenta = {}
    for (const r of reels.data || []) {
      const slug = r.agent_identities?.slug || '(sin identidad)'
      cuenta[slug] = (cuenta[slug] || 0) + 1
    }
    const t = String(tipo || '').trim().toLowerCase()
    // Los del perfil, por id: por nombre, un creador suyo que se llamara como
    // el slug de otro colaba a ese otro en la lista.
    const deEste = suyos && new Set(suyos.map(i => i.id))
    const lista = (ids.data || [])
      .filter(i => !deEste || deEste.has(i.id))
      .filter(i => !t || (i.categoria || '').toLowerCase() === t)
    if (t && !lista.length) {
      const hay = [...new Set((ids.data || []).map(i => i.categoria).filter(Boolean))]
      throw new Error(`No hay creadores de tipo "${tipo}"${perfil ? ' en ese perfil' : ''}. Los tipos que hay: ${hay.join(', ') || 'ninguno'}.`)
    }
    // Agrupadas por tipo de contenido, que es como se eligen: "los de filmmaking".
    const porTipo = {}
    for (const i of lista) {
      const k = i.categoria || 'Sin tipo de contenido'
      ;(porTipo[k] ||= []).push({ nombre: i.nombre, slug: i.slug, descripcion: i.descripcion, activa: i.activa, reels: cuenta[i.slug] || 0 })
    }
    return perfil
      ? { perfil, por_tipo_de_contenido: porTipo }
      : { por_tipo_de_contenido: porTipo, reels_sin_identidad: cuenta['(sin identidad)'] || 0 }
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

  async corpus({ identidad, perfil, tipo, limite, cursor = 0, detalle }) {
    // Con varios creadores, por defecto una vista de conjunto; con uno, entero.
    const varios = Boolean(perfil || tipo)
    limite ??= varios ? 5 : 10
    detalle ??= varios ? 'resumen' : 'completo'
    const opciones = { limite, cursor, detalle }
    const primera = !cursor
    // La memoria global (reglas de HELM, conclusiones generales) vale para
    // cualquier guion: va una vez, fuera de cada creador, en la primera página.
    const global = primera
      ? await supabase.from('agent_memory').select('contenido, updated_at')
        .eq('ambito', 'global').order('updated_at', { ascending: false }).limit(100)
      : { data: null }
    if (global.error) throw global.error
    const conMemoria = global.data ? { memoria_global: global.data } : {}
    // Varios creadores: hay más si a alguno le quedan reels; el cursor vale para todos.
    const junta = (creadores) => {
      const hayMas = creadores.some(c => c.hay_mas)
      return { creadores, hay_mas: hayMas, ...(hayMas ? { siguiente: cursor + limite } : {}) }
    }

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
        ...conMemoria,
        ...junta(await Promise.all(creadores.map(c => corpusDe(c, opciones)))),
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
        ...conMemoria,
        ...junta(await Promise.all(creadores.map(c => corpusDe(c, opciones)))),
      }
    }

    const ident = await identidadDe(identidad)
    const r = await corpusDe(ident, opciones)
    return { ...conMemoria, ...r, ...(r.hay_mas ? { siguiente: cursor + limite } : {}) }
  },

  async asignar_creadores({ perfil, identidades, tipo, quitar, prueba }) {
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
    if (!ids.size) throw new Error('Di qué creadores: "identidades" (lista de nombres o slugs) o "tipo" (un tipo de contenido entero).')

    const nombres = [...ids.values()]
    const hecho = `${quitar ? 'Quitados' : 'Asignados'} a ${cliente.slug}: ${nombres.join(', ')}.`
    const ver = comprobar('perfiles', {})
    if (prueba) return { prueba: true, perfil: cliente.slug, [quitar ? 'se_quitarian' : 'se_asignarian']: nombres, hecho: `Ensayo, nada escrito. ${hecho}`, comprobar: ver }

    // El upsert ignora los que ya estaban y el delete no falla si no estaban:
    // repetir la llamada deja lo mismo.
    const { error } = quitar
      ? await supabase.from('agent_identity_clients').delete()
        .eq('client_id', cliente.id).in('identity_id', [...ids.keys()])
      : await supabase.from('agent_identity_clients').upsert(
        [...ids.keys()].map(identity_id => ({ identity_id, client_id: cliente.id })),
        { onConflict: 'identity_id,client_id', ignoreDuplicates: true })
    if (error) throw error
    return { perfil: cliente.slug, [quitar ? 'quitados' : 'asignados']: nombres, hecho, comprobar: ver }
  },

  async anadir_reels({ urls, identidad, prueba }) {
    const lista = (Array.isArray(urls) ? urls : [urls]).map(u => String(u || '').trim()).filter(Boolean)
    if (!lista.length) throw new Error('No has pasado ningún enlace: "urls" es una lista de enlaces https://…')
    if (lista.length > 100) throw new Error('Máximo 100 enlaces por vez')
    const malos = lista.filter(u => !esEnlace(u))
    if (malos.length) throw new Error(`No son enlaces válidos (tienen que empezar por https:// y ser de Instagram, TikTok o YouTube): ${malos.slice(0, 5).map(u => `"${recorta(u, 80)}"`).join(', ')}`)
    const ident = await identidadDe(identidad)
    const ver = comprobar('corpus', { ...(ident ? { identidad: ident.slug } : {}), detalle: 'resumen' },
      'Tardan unos minutos por reel en salir: se descargan, transcriben y etiquetan por detrás.')

    if (prueba) {
      const { data, error } = await supabase.from('agent_reels').select('url, url_hash').in('url_hash', lista.map(hashUrl))
      if (error) throw error
      const ya = new Set((data || []).map(r => r.url_hash))
      const nuevos = lista.filter(u => !ya.has(hashUrl(u)))
      return {
        prueba: true, se_anadirian: nuevos, ya_estaban: lista.filter(u => ya.has(hashUrl(u))),
        en: ident ? ident.nombre : 'sin identidad',
        hecho: `Ensayo, nada escrito. Se añadirían ${nuevos.length} de ${lista.length}.`, comprobar: ver,
      }
    }
    const { nuevos, repetidos } = await anadeReels(lista, ident?.id || null)
    return {
      anadidos: nuevos.length, ids: nuevos.map(n => n.id), ya_estaban: repetidos,
      hecho: `${nuevos.length} reels añadidos al corpus${ident ? ` de ${ident.nombre}` : ''}${repetidos.length ? `; ${repetidos.length} ya estaban` : ''}.`,
      nota: 'Se procesan por detrás, unos minutos por reel.', comprobar: ver,
    }
  },

  async etiquetar_reels({ reels, prueba }) {
    const lista = Array.isArray(reels) ? reels : []
    if (!lista.length) throw new Error('No has pasado ningún reel')
    if (lista.length > 50) throw new Error('Máximo 50 reels por vez')

    const hechos = []
    const fallos = []
    for (const r of lista) {
      const { data: reel, error } = await supabase.from('agent_reels')
        .select('id, frases').eq('url_hash', hashUrl(r.url)).maybeSingle()
      if (error) throw error
      if (!reel) { fallos.push(`${r.url}: no está en el corpus (usa la url tal cual sale en "corpus")`); continue }

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
      if (!prueba) {
        const { error: e2 } = await supabase.from('agent_reels').update(fila).eq('id', reel.id)
        if (e2) throw e2
      }
      hechos.push(r.url)
    }
    const hecho = `${hechos.length} de ${lista.length} reels ${prueba ? 'se corregirían' : 'corregidos'}${fallos.length ? `, ${fallos.length} con avisos` : ''}.`
    return {
      ...(prueba ? { prueba: true, se_corregirian: hechos } : { corregidos: hechos.length, urls: hechos }),
      ...(fallos.length ? { avisos: fallos } : {}),
      hecho: prueba ? `Ensayo, nada escrito. ${hecho}` : hecho,
      comprobar: comprobar('corpus', { detalle: 'resumen' }, 'Con la identidad o el perfil de esos reels: salen con etiquetado_por "claude".'),
    }
  },

  async calendario({ perfil, desde, hasta, detalle = 'resumen', limite = 60, cursor = 0 }) {
    const c = await perfilDe(perfil)
    const dia = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)
    const rango = { desde: desde || dia(-7), hasta: hasta || dia(30) }
    if (rango.desde > rango.hasta) throw new Error(`"desde" (${rango.desde}) es posterior a "hasta" (${rango.hasta}).`)
    const guiones = await calendario(c.id, rango)
    const pag = pagina(guiones, { cursor, limite })
    const { data: sueltos, error } = await supabase.from('agent_drive_videos')
      .select('drive_id, nombre, transcripcion, created_at').eq('client_id', c.id).eq('estado', 'sin_guion')
    if (error) throw error
    const completo = detalle === 'completo'
    return {
      perfil: c.slug,
      ...rango,
      guiones: pag.items.map(g => ({
        id: g.id, fecha: g.date, titulo: g.title, tipo: g.tipo ? TIPOS[g.tipo] : 'sin tipo',
        fase: FASES[g.fase], guion: completo ? (g.body || '') : recorta(g.body, 200),
      })),
      total: pag.total,
      hay_mas: pag.hay_mas,
      ...(pag.hay_mas ? { siguiente: pag.siguiente } : {}),
      ...(!completo && guiones.some(g => (g.body || '').length > 200) ? { nota: 'Guiones recortados: con detalle="completo" van enteros.' } : {}),
      // Los vídeos sueltos van siempre, solo en la primera página.
      ...(cursor ? {} : {
        sin_ordenar: (sueltos || []).map(v => ({
          video_id: v.drive_id, nombre: v.nombre, llego: v.created_at, dice: recorta(v.transcripcion, completo ? 600 : 300),
        })),
      }),
    }
  },

  async programar_guiones({ perfil, guiones, prueba }) {
    const c = await perfilDe(perfil)
    const lista = Array.isArray(guiones) ? guiones : []
    if (!lista.length) throw new Error('No has pasado ningún guion')
    const malos = lista.filter(g => g.id && !UUID.test(g.id))
    if (malos.length) throw new Error(`id no válido: ${malos.map(g => `"${g.id}"`).join(', ')}. Es el id (uuid) que sale en "calendario"; para un guion nuevo, no pases id.`)

    // Lo que ya hay esos días, para no duplicar si se repite la llamada, y los
    // ids que se quieren corregir, para avisar si alguno no es de este perfil.
    const conId = lista.filter(g => g.id).map(g => g.id)
    const [hay, suyos] = await Promise.all([
      supabase.from('helm_content_calendar').select('id, date, title')
        .eq('client_id', c.id).in('date', [...new Set(lista.map(g => g.fecha))]),
      conId.length
        ? supabase.from('helm_content_calendar').select('id').eq('client_id', c.id).in('id', conId)
        : { data: [] },
    ])
    if (hay.error) throw hay.error
    if (suyos.error) throw suyos.error
    const deEste = new Set((suyos.data || []).map(g => g.id))
    const ajenos = conId.filter(id => !deEste.has(id))
    if (ajenos.length) throw new Error(`No hay ningún guion con id ${ajenos.join(', ')} en el calendario de ${c.slug}. Mira los ids con "calendario", o quita el id para crear uno nuevo.`)
    const existentes = new Map((hay.data || []).map(g => [claveGuion(g.date, g.title), g.id]))

    const plan = lista.map(g => {
      const titulo = String(g.titulo).trim().slice(0, 200)
      const ya = existentes.get(claveGuion(g.fecha, titulo))
      return { g, titulo, id: g.id || ya || null, accion: g.id ? 'corregido' : ya ? 'ya_estaba' : 'nuevo' }
    })
    const ver = comprobar('calendario', {
      perfil: c.slug,
      desde: lista.map(g => g.fecha).sort()[0],
      hasta: lista.map(g => g.fecha).sort().at(-1),
      detalle: 'completo',
    })
    const cuenta = (a) => plan.filter(p => p.accion === a).length
    const frase = `${plan.length} ${plan.length === 1 ? 'guion' : 'guiones'} en el calendario de ${c.slug}: ${cuenta('nuevo')} nuevos, ${cuenta('ya_estaba')} ya estaban (se actualizan), ${cuenta('corregido')} corregidos por id.`

    if (prueba) {
      return {
        prueba: true, perfil: c.slug,
        haria: plan.map(p => ({ accion: p.accion, ...(p.id ? { id: p.id } : {}), fecha: p.g.fecha, titulo: p.titulo, tipo: p.g.tipo })),
        hecho: `Ensayo, nada escrito. ${frase}`, comprobar: ver,
      }
    }

    const hechos = []
    for (const p of plan) {
      const fila = {
        client_id: c.id, date: p.g.fecha, title: p.titulo, body: String(p.g.guion || ''),
        tipo: p.g.tipo, format: 'reel', source: 'claude', updated_at: new Date().toISOString(),
      }
      // Dos iguales en la misma llamada: el segundo actualiza al primero.
      const id = p.id || existentes.get(claveGuion(p.g.fecha, p.titulo))
      const { data, error } = await (id
        ? supabase.from('helm_content_calendar').update(fila).eq('id', id).eq('client_id', c.id).select('id, date, title').single()
        : supabase.from('helm_content_calendar').insert(fila).select('id, date, title').single())
      if (error) throw error
      existentes.set(claveGuion(data.date, data.title), data.id)
      hechos.push({ id: data.id, fecha: data.date, titulo: data.title, tipo: p.g.tipo, accion: p.accion })
    }
    return { perfil: c.slug, programados: hechos, hecho: frase, comprobar: ver }
  },

  async ordenar_video({ perfil, video_id, guion_id, tipo, prueba }) {
    const c = await perfilDe(perfil)
    const { data: v, error } = await supabase.from('agent_drive_videos')
      .select('drive_id, nombre, estado, destino, calendario_id').eq('drive_id', video_id).eq('client_id', c.id).maybeSingle()
    if (error) throw error
    if (!v) throw new Error(`El vídeo "${video_id}" no está entre los de ${c.slug}. Los video_id salen en "calendario" → sin_ordenar.`)
    let guion = null
    if (guion_id) {
      if (!UUID.test(guion_id)) throw new Error(`guion_id no válido: "${guion_id}". Es el id (uuid) que sale en "calendario".`)
      const r = await supabase.from('helm_content_calendar')
        .select('id, date, title, body, tipo, grabado_at, drive_carpeta_id').eq('id', guion_id).eq('client_id', c.id).maybeSingle()
      if (r.error) throw r.error
      if (!r.data) throw new Error(`No hay ningún guion con id ${guion_id} en el calendario de ${c.slug}. Míralo con "calendario".`)
      guion = r.data
    } else if (!TIPOS[tipo]) throw new Error(`Pasa guion_id (el id del guion, de "calendario") o, si no es de ningún guion, tipo: ${Object.keys(TIPOS).join(', ')}.`)

    const t = guion?.tipo || tipo || 'autoridad'
    const destino = `1 · Sin editar / ${TIPOS[t]}`
    const ver = comprobar('calendario', { perfil: c.slug, ...(guion ? { desde: guion.date, hasta: guion.date } : {}) },
      guion ? 'El guion sale en fase "Sin editar" y el vídeo ya no está en sin_ordenar.' : 'El vídeo ya no está en sin_ordenar.')
    // Si ya está donde se pide, no se mueve otra vez.
    if (v.estado === 'ordenado' && v.destino === destino && (v.calendario_id || null) === (guion?.id || null)) {
      return { video: v.nombre, video_id, ya_estaba: true, movido_a: v.destino, hecho: `"${v.nombre}" ya estaba en ${v.destino}; no se mueve.`, comprobar: ver }
    }
    const adonde = guion ? `la pieza del guion ${guion.date} · ${guion.title} (${destino})` : `${destino}, en una pieza nueva`
    if (prueba) return { prueba: true, video: v.nombre, video_id, iria_a: adonde, hecho: `Ensayo, nada movido. "${v.nombre}" iría a ${adonde}.`, comprobar: ver }

    const { parents = [] } = await archivoDrive(video_id)
    const r = await ordenar({ clientId: c.id, driveId: video_id, desde: parents[0], guion, tipo })
    await supabase.from('agent_drive_videos').update({
      estado: 'ordenado', calendario_id: guion?.id || null, destino: r.destino, updated_at: new Date().toISOString(),
    }).eq('drive_id', video_id)
    return {
      video: v.nombre, video_id, guion_id: guion?.id || null, movido_a: r.destino, pieza: r.pieza,
      hecho: `"${v.nombre}" movido a ${adonde}.`, comprobar: ver,
    }
  },

  async metricas({ perfil, limite, dias, actualizar, detalle = 'resumen' }) {
    const c = await perfilDe(perfil)
    // Si la sincronización falla (cuota de Meta, token caducado) se responde
    // con lo último guardado y se dice: un análisis con datos de ayer vale más
    // que ninguno.
    let aviso = null
    if (actualizar) {
      try {
        await sincronizarIg(c.id, 60)
      } catch (e) {
        aviso = `No se ha podido sincronizar con Instagram (${String(e?.message || e).slice(0, 160)}). Van los datos de la última vez.`
      }
    }
    const pedidas = Math.min(Math.max(Number(limite) || 60, 1), 200)
    const inf = await informeIg(supabase, c.id, { limite: pedidas, dias })
    if (!inf.conectado) throw new Error(`${c.name} no tiene Instagram conectado. Se conecta en HELM → Ajustes → Integraciones → Instagram.`)
    if (!inf.publicaciones.length) {
      aviso ||= dias ? `No hay publicaciones en los últimos ${dias} días.` : 'Todavía no hay métricas guardadas. Vuelve a llamar con actualizar=true.'
    }
    const { conectado: _c, publicaciones, ...resto } = inf
    // Puede haber más si ha llegado justo el tope pedido.
    const hayMas = publicaciones.length === pedidas && pedidas < 200
    return {
      perfil: c.slug, ...(aviso ? { aviso } : {}), ...resto,
      publicaciones: detalle === 'completo' ? publicaciones : publicaciones.map(p => ({ ...p, texto: recorta(p.texto, 200) })),
      hay_mas: hayMas,
      ...(hayMas ? { nota: `Hay más publicaciones: sube "limite" (máximo 200) o acota con "dias".` } : {}),
    }
  },

  async guardar_memoria({ contenido, identidad, prueba }) {
    const texto = String(contenido || '').trim()
    if (!texto) throw new Error('La nota está vacía')
    const ident = await identidadDe(identidad)
    const en = ident ? ident.nombre : 'memoria global'
    const ver = comprobar('corpus', ident ? { identidad: ident.slug, limite: 1 } : { limite: 1 },
      ident ? 'Sale en "memoria" de la primera página.' : 'Sale en "memoria_global" de la primera página, con cualquier identidad o perfil.')
    // Una nota idéntica no se guarda dos veces.
    let q = supabase.from('agent_memory').select('id').eq('contenido', texto).limit(1)
    q = ident ? q.eq('identity_id', ident.id) : q.eq('ambito', 'global')
    const { data: ya, error: e0 } = await q
    if (e0) throw e0
    if (ya?.length) return { guardado: true, ya_estaba: true, id: ya[0].id, en, hecho: `La nota ya estaba en ${en}; no se duplica.`, comprobar: ver }
    if (prueba) return { prueba: true, en, caracteres: texto.length, hecho: `Ensayo, nada escrito. Se guardaría una nota de ${texto.length} caracteres en ${en}.`, comprobar: ver }

    const { data, error } = await supabase.from('agent_memory').insert({
      ambito: ident ? 'identidad' : 'global',
      identity_id: ident?.id || null,
      contenido: texto,
    }).select('id').single()
    if (error) throw error
    return { guardado: true, id: data.id, en, hecho: `Nota de ${texto.length} caracteres guardada en ${en}.`, comprobar: ver }
  },
}

// ¿Quién es este token? El maestro (HELM_MCP_TOKEN) es el del operador y lo
// ve todo. Los de cada perfil y los de cada agencia viven hasheados en
// agent_mcp_tokens: los de perfil ven ese perfil y los de agencia, los perfiles
// de la agencia. Devuelve null si no vale.
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
    .select('client_id, agencia_id, clients(slug, name), agencias(nombre)').eq('token_hash', hash).maybeSingle()
  if (!data) return null
  supabase.from('agent_mcp_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', hash).then(() => {})
  if (data.clients) {
    // Lo que HELM gaste en IA por este enlace se cobra a la agencia del perfil.
    anotar({ clientId: data.client_id, origen: 'mcp' })
    return { clientId: data.client_id, slug: data.clients.slug, nombre: data.clients.name }
  }
  if (data.agencia_id && data.agencias) {
    anotar({ agenciaId: data.agencia_id, origen: 'mcp' })
    const { data: perfiles, error } = await supabase.from('clients')
      .select('id, slug, name').eq('agencia_id', data.agencia_id).eq('active', true).order('name')
    if (error) throw error
    return { agenciaId: data.agencia_id, nombre: data.agencias.nombre, perfiles: perfiles || [] }
  }
  return null
}

// ── El enlace de una agencia ────────────────────────────────────────────────
// Las mismas herramientas que el enlace de un perfil, pero con todos los de la
// agencia: Claude dice en cada llamada para cuál (`perfil`), y se comprueba
// que es suyo.
// El perfil que pide una llamada, si es de la agencia. Sin perfil, el único que
// tenga (si solo tiene uno).
function perfilDeAgencia(a, pedido) {
  const n = String(pedido || '').trim().toLowerCase()
  return n
    ? a.perfiles.find(x => x.slug === pedido) || a.perfiles.find(x => x.slug === n)
      || a.perfiles.find(x => String(x.name || '').toLowerCase() === n) || null
    : a.perfiles.length === 1 ? a.perfiles[0] : null
}

async function llamaComoAgencia(nombre, args, a) {
  if (nombre === 'perfiles') {
    return {
      perfiles: await Promise.all(a.perfiles.map(async p => ({
        perfil: p.slug, nombre: p.name, creadores: (await asignadosDe(p.id)).map(i => i.nombre),
      }))),
    }
  }
  const p = perfilDeAgencia(a, args?.perfil)
  if (!p) {
    throw new Error(`Di para qué perfil (argumento "perfil"). Los de ${a.nombre}: ${a.perfiles.map(x => x.slug).join(', ') || 'ninguno todavía'}.`)
  }
  anotar({ clientId: p.id })
  return llamaComoCliente(nombre, args, { clientId: p.id, slug: p.slug, nombre: p.name })
}

// ── Lo que puede hacer un perfil con su propio enlace ───────────────────────
// Leer y usar SU parte: sus creadores, su calendario, sus vídeos. Lo que toca
// el corpus de todos (añadir reels, reetiquetar, asignar creadores) es del
// operador y ni siquiera aparece.
export const DEL_CLIENTE = ['identidades', 'perfiles', 'corpus', 'calendario', 'programar_guiones', 'ordenar_video', 'metricas', 'guardar_memoria']

async function asignadosDe(clientId) {
  const { data, error } = await supabase.from('agent_identity_clients')
    .select('agent_identities(id, nombre, slug)').eq('client_id', clientId)
  if (error) throw error
  return (data || []).map(r => r.agent_identities).filter(Boolean)
}
// El de la lista, por slug antes que por nombre: a la herramienta se le pasa su
// slug, no lo que escribió Claude, para que no se resuelva a otro creador.
const unoDe = (lista, nombre) => {
  const n = String(nombre || '').trim().toLowerCase()
  return n ? lista.find(i => i.slug === n) || lista.find(i => i.nombre.toLowerCase() === n) || null : null
}

async function llamaComoCliente(nombre, args, a) {
  if (!DEL_CLIENTE.includes(nombre)) throw new Error('Esa herramienta no está disponible con este enlace.')
  if (!a.clientId || !a.slug) throw new Error('Este enlace no tiene perfil.')
  const mios = await asignadosDe(a.clientId)
  const x = { ...args, perfil: a.slug }

  if (nombre === 'perfiles') return { perfiles: [{ perfil: a.slug, nombre: a.nombre, creadores: mios.map(i => i.nombre) }] }
  if (nombre === 'identidades') return HERRAMIENTAS.identidades({ perfil: a.slug, tipo: x.tipo })
  if (nombre === 'corpus') {
    // Un creador suyo por nombre; si no, todos los de su perfil. Nunca "tipo":
    // sería leer creadores que no son suyos.
    const opciones = { limite: x.limite, cursor: x.cursor, detalle: x.detalle }
    const ident = unoDe(mios, x.identidad)
    if (ident) return HERRAMIENTAS.corpus({ identidad: ident.slug, ...opciones })
    if (x.identidad) throw new Error(`"${x.identidad}" no es uno de los creadores de ${a.nombre}. Los suyos: ${mios.map(i => i.nombre).join(', ') || 'ninguno'}.`)
    return HERRAMIENTAS.corpus({ perfil: a.slug, ...opciones })
  }
  if (nombre === 'guardar_memoria') {
    const ident = unoDe(mios, x.identidad)
    if (!ident) {
      throw new Error(`Di en qué creador guardarlo: ${mios.map(i => i.nombre).join(', ')}.`)
    }
    // La memoria de un creador la leen todos los perfiles que lo usan. Si
    // alguno es de otra agencia, escribir aquí sería escribir en lo que lee
    // esa otra agencia: entonces solo la cambia la plataforma.
    const [mia, { data: usos, error }] = await Promise.all([
      agenciaDe(a.clientId),
      supabase.from('agent_identity_clients').select('clients(agencia_id)').eq('identity_id', ident.id),
    ])
    if (error) throw error
    if (!mia || (usos || []).some(u => u.clients?.agencia_id !== mia)) {
      throw new Error(`"${ident.nombre}" lo usan también perfiles de otras agencias: su memoria solo la cambia la plataforma.`)
    }
    return HERRAMIENTAS.guardar_memoria({ ...x, identidad: ident.slug })
  }
  return HERRAMIENTAS[nombre](x)
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fallo = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

// Lo mismo para cualquier enlace: cómo leer lo largo y cómo escribir sin miedo.
const COMO_SE_USA = ' Las lecturas largas (corpus, calendario) van por páginas: si la respuesta trae "hay_mas", sigue con cursor = "siguiente"; con detalle="resumen" ocupan mucho menos. Toda escritura acepta prueba=true para ensayar sin escribir, se puede repetir sin duplicar y devuelve en "comprobar" qué llamada enseña lo escrito. Si los argumentos no valen, el error dice qué campo y qué valores valen: corrígelo y repite.'

// ── El registro: lo que hace Claude, a la vista de una persona ─────────────
// Cada escritura (y cada error) queda como una ejecución del agente
// "conector" en agent_ejecuciones, la misma tabla que el registro de
// Agentes → Equipo de ese perfil. Sin perfil al que atribuirla (p. ej. una
// nota global del operador) no se apunta: la tabla pide un perfil.
async function perfilDelRegistro(alcance, args) {
  if (alcance.clientId) return alcance.clientId
  if (alcance.agenciaId) return perfilDeAgencia(alcance, args?.perfil)?.id || null
  return args?.perfil ? (await perfilDe(args.perfil).catch(() => null))?.id || null : null
}

async function registra(alcance, { herramienta, args, r, err, empezado }) {
  try {
    const clientId = await perfilDelRegistro(alcance, args)
    if (!clientId) return
    const quien = alcance.quien || (alcance.operador ? 'enlace del operador' : alcance.agenciaId ? `enlace de la agencia ${alcance.nombre}` : 'enlace del perfil')
    const texto = err ? `${herramienta}: ${String(err.message || err)}` : `${herramienta}: ${r?.hecho || 'hecho'}`
    await supabase.from('agent_ejecuciones').insert({
      client_id: clientId,
      agente: 'conector',
      origen: alcance.origen || 'mcp',
      estado: err ? 'error' : 'hecho',
      encargo: `${herramienta} (${quien})${Object.keys(args || {}).length ? ` · ${resumeArgs(args)}` : ''}`.slice(0, 600),
      resumen: err ? '' : String(r?.hecho || '').slice(0, 1000),
      error: err ? String(err.message || err).slice(0, 600) : '',
      pasos: [{ t: new Date().toISOString(), texto: texto.slice(0, 600) }],
      empezado_en: new Date(empezado).toISOString(),
      acabado_en: new Date().toISOString(),
    })
  } catch (e) {
    // El registro no puede tumbar la llamada: se avisa en el log y se sigue.
    console.error('[mcp] no se pudo apuntar en el registro:', e?.message || e)
  }
}

// ── El motor, reutilizable fuera del MCP ────────────────────────────────────
// Lo que ve y lo que puede hacer un alcance, sin el envoltorio JSON-RPC: lo usa
// tanto este endpoint como el bot de Telegram (api/_lib/bot-herramientas.js),
// para que una misma llamada se comporte igual venga de donde venga.

// Las herramientas visibles para este alcance: todas con el enlace del
// operador, solo las del cliente con el de un perfil o una agencia.
export function herramientasDe(alcance) {
  return alcance.operador ? TOOLS : TOOLS.filter(t => DEL_CLIENTE.includes(t.name))
}

// Ejecuta una herramienta y devuelve el resultado en crudo (el cuerpo de
// tools/call sin JSON-RPC). Mismos permisos, misma validación, mismo registro
// que por el MCP; el origen del registro lo pone el alcance (por defecto 'mcp').
// Un fallo de la herramienta no se lanza: viene en { ok:false, texto }, para
// que quien llame lo enseñe o se lo devuelva a Claude y pueda corregir.
export async function ejecutaHerramienta(nombre, argumentos, alcance) {
  const tool = TOOLS.find(t => t.name === nombre)
  if (!tool || !HERRAMIENTAS[nombre]) {
    const hay = herramientasDe(alcance).map(t => t.name)
    return { ok: false, desconocida: true, ensayo: false, args: {}, resultado: undefined, texto: `Herramienta desconocida: ${nombre}. Las que hay: ${hay.join(', ')}.` }
  }
  const fn = alcance.operador
    ? HERRAMIENTAS[nombre]
    : alcance.agenciaId
      ? (args) => llamaComoAgencia(nombre, args, alcance)
      : (args) => llamaComoCliente(nombre, args, alcance)

  // Con el enlace de un perfil el perfil es siempre el suyo; con el de una
  // agencia que solo tiene uno, también. Igual que en el MCP.
  const dados = { ...(argumentos || {}) }
  const llevaPerfil = 'perfil' in (tool.inputSchema.properties || {})
  if (alcance.clientId && llevaPerfil) dados.perfil = alcance.slug
  if (alcance.agenciaId && llevaPerfil && !dados.perfil && alcance.perfiles.length === 1) dados.perfil = alcance.perfiles[0].slug
  const empezado = Date.now()
  const { args, errores, avisos } = validaArgs(tool.inputSchema, dados)

  let r, err
  if (errores.length) {
    const pista = alcance.agenciaId && llevaPerfil ? `\nLos perfiles de ${alcance.nombre}: ${alcance.perfiles.map(x => x.slug).join(', ') || 'ninguno todavía'}.` : ''
    err = new Error(explicaErrores(nombre, errores) + pista)
  } else {
    // La herramienta corre en una copia del contexto: el perfil que anote
    // (llamaComoAgencia) no se queda pegado a lo que haga después quien llama,
    // p. ej. los siguientes pasos de Claude del bot, que paga la agencia.
    const c = contexto()
    try { r = await (c ? enContexto({ ...c }, () => fn(args)) : fn(args)) } catch (e) { err = e }
  }
  // Un ensayo (prueba=true) no deja rastro, ni cuando falla.
  const ensayo = args.prueba === true || dados.prueba === true || dados.prueba === 'true'
  if (!ensayo && (err || ESCRIBEN.includes(nombre))) {
    await registra(alcance, { herramienta: nombre, args, r, err, empezado })
  }
  if (err) return { ok: false, ensayo, args, resultado: undefined, texto: String(err?.message || err) }
  const resultado = avisos.length && r && typeof r === 'object' && !Array.isArray(r) ? { ...r, avisos } : r
  return { ok: true, ensayo, args, resultado, texto: JSON.stringify(resultado) }
}

// El alcance de una agencia sin pasar por un token: a partir de su agencia_id,
// la misma forma que alcanceDe da para un token de agencia (nombre y perfiles
// activos). Lo usa el bot, que resuelve la agencia desde el vínculo guardado,
// nunca desde lo que diga el mensaje.
export async function alcanceDesdeContexto({ agenciaId } = {}, { origen = 'telegram', quien } = {}) {
  if (!agenciaId) return null
  const { data: ag, error: e1 } = await supabase.from('agencias').select('nombre').eq('id', agenciaId).maybeSingle()
  if (e1) throw e1
  if (!ag) return null
  const { data: perfiles, error } = await supabase.from('clients')
    .select('id, slug, name').eq('agencia_id', agenciaId).eq('active', true).order('name')
  if (error) throw error
  // Lo que se gaste en IA por este alcance se cobra a la agencia.
  anotar({ agenciaId, origen })
  return { agenciaId, nombre: ag.nombre, perfiles: perfiles || [], origen, quien }
}

async function responde(msg, alcance) {
  const { id, method, params } = msg || {}
  switch (method) {
    case 'initialize': {
      const pedida = params?.protocolVersion
      return ok(id, {
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'helm-agent-os', version: '1.1.0' },
        instructions: (alcance.agenciaId
          ? `Conector de HELM de la agencia ${alcance.nombre}. Trabaja con los perfiles de sus clientes: empieza por "perfiles" para ver cuáles hay y sus creadores de referencia, y pasa siempre el argumento "perfil" (su slug) en las demás herramientas. Para escribir guiones de un perfil: lee su "corpus" (la memoria_global trae la guía de formatos de montaje), escribe con la voz de su creador "Propio" sin repetir temas que ya haya tratado, y guárdalos con "programar_guiones" (con su tipo). Su calendario, en "calendario"; lo que funciona en su Instagram, en "metricas". Lo que escribes queda en el registro del perfil (HELM → Agentes → Equipo).`
          : alcance.operador
          ? 'Corpus de reels de referencia del Agent OS de HELM. Para analizar a un creador o escribir guiones con su estilo: "identidades" y luego "corpus" de esa identidad. Para escribir para una marca de HELM: "perfiles" y luego "corpus" con ese perfil. Los guiones se guardan con "programar_guiones" (con su tipo) y se consultan con "calendario"; al grabarlos y subirlos a "0 · Entrada" de su Drive, HELM los mueve solos a su carpeta. Para estudiar qué le funciona a un perfil en su propia cuenta de Instagram: "metricas". Las conclusiones que merezca la pena conservar, con "guardar_memoria". El etiquetado del "modelo local" es poco fiable: al analizar, corrige con "etiquetar_reels" las etiquetas que no encajen con el guion. Si piden un guion "en B-roll" o de un formato de montaje concreto, sigue la guía de formatos que viene en memoria_global. Pasa "perfil" también en las escrituras que no lo piden para que queden en el registro de ese perfil (HELM → Agentes → Equipo).'
          : `Conector de contenido de ${alcance.nombre} en HELM (perfil "${alcance.slug}"). Sus creadores de referencia y su propio historial están en "corpus"; su calendario de guiones, en "calendario". Las visitas, guardados y retención de lo que ya ha publicado, en "metricas". Para escribir guiones: lee "corpus" (la memoria_global trae la guía de formatos de montaje, como el B-roll), escribe con la voz del creador "Propio" sin repetir temas que ya haya tratado, y guárdalos con "programar_guiones" (con su tipo). Al grabarlos y subirlos a "0 · Entrada" de su Drive, HELM los ordena solos. Lo que escribes queda en el registro del perfil (HELM → Agentes → Equipo).`)
          + COMO_SE_USA,
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: herramientasDe(alcance) })
    case 'tools/call': {
      // Un fallo de la herramienta va como resultado con isError, no como
      // error JSON-RPC: así Claude lo lee y puede corregir (p. ej. el nombre
      // de la identidad) en vez de dar la llamada por rota. Solo una
      // herramienta desconocida es error de protocolo.
      const x = await ejecutaHerramienta(params?.name, params?.arguments, alcance)
      if (x.desconocida) return fallo(id, -32602, x.texto)
      return ok(id, { content: [{ type: 'text', text: x.texto }], ...(x.ok ? {} : { isError: true }) })
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
