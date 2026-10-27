// La oficina de un agente: su estado de verdad y el chat con el perfil.
//
// Dos cosas:
//   1) estadoDe()  — lee las tablas reales de cada agente y devuelve, en
//      lenguaje llano, qué está haciendo ahora, qué ha dejado hecho y qué le
//      falta. Es lo que hace que un agente nunca «se vea vacío»: aunque no
//      tenga trabajo, dice qué hace y cómo se le pide.
//   2) el chat — hablas con el agente. Sabe qué es, ve su estado y recuerda las
//      indicaciones que le das (se guardan en agent_memory, ámbito 'oficina').
//
// Honrado a propósito: el agente NO dice que hace algo que no hace. Si le pides
// un PDF o un vídeo editado y todavía no lo entrega él solo, lo dice y explica
// cómo se hace hoy. Nunca se enseña como hecho lo que no funciona.
import { supabase } from '../lib/supabase.js'
import { llmChat } from './llm.js'
import { ESTILOS_REFERENCIA } from '../../src/agents/editor/estilos-referencia.js'

// Qué es cada agente, del lado del servidor (no se fía del navegador para el
// prompt). El texto de pantalla, más largo, vive en src/agents/agentes.js.
const QUE_HACE = {
  contenido: 'Guardas los creadores de referencia del perfil, sus reels transcritos y lo aprendido de ellos. Es de donde sale la estrategia y los guiones.',
  editor: 'Montas los reels en bruto según el manual de edición del perfil: formato, cortes, capturas reales y subtítulos.',
  estudio: 'Puntúas el gancho, revisas la caption, auditas el perfil y quitas el olor a IA. No publicas nada.',
  portadas: 'Compones la portada de cada reel en 1080×1920 con el fotograma real y el kit de la serie. La IA solo escribe los textos.',
  'setter-ig': 'Contestas los DM de Instagram, cualificas a cada lead y lo llevas a la llamada. Cada uno entra en el CRM.',
  'trial-reels': 'Coges un reel ya publicado y montas 2–3 variantes con otro arranque y otro gancho para volver a probarlo.',
  'web-creator': 'Estudias las webs mejor posicionadas del sector del cliente y preparas el prompt para construir la suya.',
  equipo: 'Coordinas al equipo de contenido: el director reparte cada mañana y los demás investigan, analizan y escriben los guiones.',
}

const NOMBRE = {
  contenido: 'Agente de contenido', editor: 'Editor de reels',
  estudio: 'Estudio de Instagram', portadas: 'Portadas', 'setter-ig': 'Setter de Instagram',
  'trial-reels': 'Trial reels', 'web-creator': 'Web Creator', equipo: 'Equipo de agentes',
}

export const AGENTES_OFICINA = Object.keys(QUE_HACE)

const CLAVE_REGLAS = (agente) => `oficina:${agente}`
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '')
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// ── Estado real de cada agente ───────────────────────────────────────────────
// Cada uno devuelve { haciendo:[str], ultimos:[str], falta:[{texto, cta}] }.
// cta ∈ 'abrir' | 'conectar' | undefined. Todo envuelto en try/catch: una
// consulta que falle (una tabla que aún no está en este entorno) nunca tumba
// la cabecera; como mucho, ese bloque sale vacío.

async function estadoWebCreator(clientId) {
  const { data } = await supabase
    .from('helm_web_fabricacion')
    .select('estado, fase, sector, ciudad, estudiado_en, web_url, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  const filas = data || []
  const haciendo = filas.filter(f => f.estado === 'estudiando')
    .map(f => `Estudiando la competencia de ${f.sector || 'un cliente'}${f.ciudad ? ` en ${f.ciudad}` : ''}`)
  const ultimos = filas.filter(f => f.estado === 'listo' && f.estudiado_en).slice(0, 3)
    .map(f => `Estudio listo de ${f.sector || 'un cliente'}${f.ciudad ? ` (${f.ciudad})` : ''} · ${fecha(f.estudiado_en)}`)
  const falta = []
  const pendientes = filas.filter(f => f.estado === 'pendiente').length
  if (pendientes) falta.push({ texto: `Falta arrancar el estudio de ${plural(pendientes, 'contacto', 'contactos')} en fabricación`, cta: 'abrir' })
  const sinConstruir = filas.filter(f => f.estado === 'listo' && f.fase === 'por_construir').length
  if (sinConstruir) falta.push({ texto: `${plural(sinConstruir, 'web', 'webs')} con el estudio listo, sin construir`, cta: 'abrir' })
  const conError = filas.filter(f => f.estado === 'error').length
  if (conError) falta.push({ texto: `${plural(conError, 'estudio', 'estudios')} con error`, cta: 'abrir' })
  if (!filas.length) falta.push({ texto: 'Ningún contacto en «En fabricación» todavía. Mueve uno en el CRM para que empiece.', cta: 'abrir' })
  return { haciendo, ultimos, falta }
}

async function estadoTrialReels(clientId) {
  const { data } = await supabase
    .from('helm_trial_reels')
    .select('estado, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  const filas = data || []
  const enCurso = filas.filter(f => f.estado === 'en_cola' || f.estado === 'procesando').length
  const listas = filas.filter(f => f.estado === 'listo').length
  const errores = filas.filter(f => f.estado === 'error').length
  const haciendo = enCurso ? [`Montando ${plural(enCurso, 'variante', 'variantes')}`] : []
  const ultimos = listas ? [`${plural(listas, 'variante lista', 'variantes listas')} para descargar`] : []
  const falta = []
  if (errores) falta.push({ texto: `${plural(errores, 'variante', 'variantes')} con error`, cta: 'abrir' })
  if (!filas.length) falta.push({ texto: 'Aún no has probado ningún reel. Elige uno publicado y pídele variantes.', cta: 'abrir' })
  return { haciendo, ultimos, falta }
}

async function estadoSetter(clientId) {
  const { data: cfg } = await supabase
    .from('helm_setter_ig').select('activo, modo').eq('client_id', clientId).maybeSingle()
  const { data: convs } = await supabase
    .from('helm_ig_conversaciones').select('estado').eq('client_id', clientId)
  const filas = convs || []
  const falta = []
  if (!cfg || !cfg.activo) {
    falta.push({ texto: 'El setter está apagado. Conéctalo a Instagram y actívalo para que conteste.', cta: 'conectar' })
    return { haciendo: [], ultimos: [], falta }
  }
  const atendiendo = filas.filter(c => c.estado === 'ia').length
  const haciendo = atendiendo ? [`Atendiendo ${plural(atendiendo, 'conversación', 'conversaciones')}`] : ['A la escucha de DM nuevos']
  if (cfg.modo === 'borrador') falta.push({ texto: 'En modo borrador: deja respuestas para que las apruebes antes de enviar.', cta: 'abrir' })
  const conHumano = filas.filter(c => c.estado === 'humano').length
  const ultimos = conHumano ? [`${plural(conHumano, 'conversación pasada', 'conversaciones pasadas')} a una persona`] : []
  return { haciendo, ultimos, falta }
}

async function estadoEditor(clientId) {
  try {
    const { data, error } = await supabase
      .from('helm_ediciones').select('estado, updated_at').eq('client_id', clientId)
      .order('updated_at', { ascending: false }).limit(20)
    if (error) throw error
    const filas = data || []
    const enCurso = filas.filter(f => f.estado === 'corriendo' || f.estado === 'en_cola').length
    const listas = filas.filter(f => f.estado === 'listo').length
    return {
      haciendo: enCurso ? [`Editando ${plural(enCurso, 'vídeo', 'vídeos')}`] : [],
      ultimos: listas ? [`${plural(listas, 'reel montado', 'reels montados')}`] : [],
      falta: filas.length ? [] : [{ texto: 'Sube un reel en bruto o pásaselo por el conector de Claude y lo monta según tu manual.', cta: 'abrir' }],
    }
  } catch {
    // La migración del editor todavía no está en este entorno: lo que ya hay
    // son los estilos de edición, con la portada de sus reels y su prompt.
    return {
      haciendo: [],
      ultimos: [],
      falta: [
        { texto: `${ESTILOS_REFERENCIA.length} estilos de edición listos: elige uno por la portada de sus reels de ejemplo y copia su prompt para que Claude lo monte por el conector.`, cta: 'abrir' },
        { texto: 'El motor de edición se está integrando: muy pronto podrás subirle un vídeo aquí y que lo monte HELM solo.' },
      ],
    }
  }
}

async function estadoEquipo(clientId) {
  const { data } = await supabase
    .from('agent_ejecuciones').select('agente, estado, resumen, empezado_en')
    .eq('client_id', clientId).order('empezado_en', { ascending: false }).limit(12)
  const filas = data || []
  const corriendo = filas.filter(f => f.estado === 'corriendo')
  const haciendo = corriendo.map(f => `${f.agente} trabajando${f.resumen ? `: ${f.resumen}` : ''}`)
  const ultimos = filas.filter(f => f.estado === 'hecho' && f.resumen).slice(0, 3)
    .map(f => `${f.agente}: ${f.resumen} · ${fecha(f.empezado_en)}`)
  return { haciendo, ultimos, falta: filas.length ? [] : [{ texto: 'El director planifica cada mañana a las 6:00. Aún no hay ejecuciones registradas.', cta: 'abrir' }] }
}

const RESOLUTORES = {
  'web-creator': estadoWebCreator,
  'trial-reels': estadoTrialReels,
  'setter-ig': estadoSetter,
  editor: estadoEditor,
  equipo: estadoEquipo,
}

/** El estado vivo de un agente, en lenguaje llano. Nunca lanza. */
export async function estadoDe(clientId, agente) {
  const base = { hace: QUE_HACE[agente] || '', nombre: NOMBRE[agente] || agente, haciendo: [], ultimos: [], falta: [] }
  const fn = RESOLUTORES[agente]
  if (!fn) {
    // Agentes sin señal de fondo propia (contenido, portadas, estudio):
    // la cabecera vive de «qué hace» + abrir el panel + hablar. No se inventa
    // actividad que no existe.
    return { ...base, falta: [{ texto: 'Abre el panel para ver y usar lo que tiene dentro.', cta: 'abrir' }] }
  }
  try {
    const d = await fn(clientId)
    return { ...base, ...d }
  } catch (e) {
    return { ...base, falta: [{ texto: 'No he podido leer su estado ahora mismo. Inténtalo de nuevo en un momento.' }], _error: e.message }
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

/** El hilo con un agente, del más viejo al más nuevo. */
export async function historial(clientId, agente, limite = 40) {
  const { data } = await supabase
    .from('helm_agente_chat').select('id, rol, texto, adjunto, created_at')
    .eq('client_id', clientId).eq('agente', agente)
    .order('created_at', { ascending: false }).limit(limite)
  return (data || []).reverse()
}

async function registra(clientId, agente, rol, texto, adjunto = null) {
  const { data } = await supabase
    .from('helm_agente_chat')
    .insert({ client_id: clientId, agente, rol, texto, adjunto })
    .select('id, rol, texto, adjunto, created_at').single()
  return data
}

/** Las indicaciones permanentes que el perfil le ha dado a este agente. */
async function reglasDe(clientId, agente) {
  const { data } = await supabase
    .from('agent_memory').select('contenido')
    .eq('client_id', clientId).eq('ambito', 'oficina').eq('clave', CLAVE_REGLAS(agente))
    .maybeSingle()
  return data?.contenido || ''
}

/** Añade una indicación a la memoria del agente (se acumula, no se pisa). */
export async function guardaRegla(clientId, agente, texto) {
  const previas = await reglasDe(clientId, agente)
  const linea = `· ${texto.trim()}`
  const contenido = previas ? `${previas}\n${linea}` : linea
  const comun = { client_id: clientId, ambito: 'oficina', clave: CLAVE_REGLAS(agente), contenido, updated_at: new Date().toISOString() }
  // Hay índice único (client_id, clave): upsert por esas dos.
  await supabase.from('agent_memory').upsert(comun, { onConflict: 'client_id,clave' })
  return contenido
}

function sistemaDe(agente, estado, reglas) {
  const lineas = []
  lineas.push(`Eres el «${NOMBRE[agente] || agente}» de HELM, hablando con el dueño del perfil que te emplea.`)
  lineas.push(`Lo que haces: ${QUE_HACE[agente] || ''}`)
  const vivo = []
  if (estado.haciendo?.length) vivo.push(`Ahora mismo: ${estado.haciendo.join('; ')}.`)
  if (estado.ultimos?.length) vivo.push(`Último hecho: ${estado.ultimos.join('; ')}.`)
  if (estado.falta?.length) vivo.push(`Pendiente: ${estado.falta.map(f => f.texto).join('; ')}.`)
  if (vivo.length) lineas.push(`Tu estado: ${vivo.join(' ')}`)
  if (reglas) lineas.push(`Indicaciones permanentes que te ha dado este cliente (respétalas):\n${reglas}`)
  lineas.push('Hablas en español de España, claro y breve, de tú. No te inventas datos ni cifras.')
  lineas.push('Eres honrado con lo que puedes hacer: si te piden algo que todavía no ejecutas tú solo (entregar un guion en PDF, editar un vídeo), dilo con franqueza y explica cómo se hace hoy en HELM. Nunca digas que has hecho algo que no has hecho.')
  lineas.push('Si el cliente te da una instrucción para recordar siempre, confírmale que la guardas; la app ya la añade a tu memoria.')
  return lineas.join('\n\n')
}

/**
 * Una vuelta de conversación con el agente. Persiste el mensaje del usuario y
 * la respuesta, y devuelve ambos. `recordar` guarda además el mensaje como
 * indicación permanente.
 */
export async function conversa(clientId, agente, texto, { recordar = false } = {}) {
  const tuyo = await registra(clientId, agente, 'tu', texto)
  if (recordar) await guardaRegla(clientId, agente, texto)

  const [estado, reglas, previos] = await Promise.all([
    estadoDe(clientId, agente),
    reglasDe(clientId, agente),
    historial(clientId, agente, 12),
  ])
  const system = sistemaDe(agente, estado, reglas)
  const messages = previos
    .filter(m => m.id !== tuyo.id)
    .map(m => ({ role: m.rol === 'tu' ? 'user' : 'assistant', content: m.texto }))
  messages.push({ role: 'user', content: texto })

  const respuesta = await llmChat({ clientId, system, messages, maxTokens: 700, temperature: 0.5 })
  const suyo = await registra(clientId, agente, 'agente', respuesta)
  return { tuyo, suyo }
}
