// HELM — chat con IA por perfil.
//
// Cada perfil (client_id) tiene su propia conversación y su propia memoria:
//   · helm_chat_messages → historial que se le manda al modelo
//   · helm_knowledge     → memoria permanente que se inyecta en el system prompt
//
// El método de guiones (universal) vive en api/_lib/copy-knowledge.js.
// Lo específico de cada cuenta se añade con /conocimiento y /reel-estudio.
//
// Acciones:
//   POST ?action=send        { clientId, message }   → responde y persiste
//   GET  ?action=history     &clientId=              → historial
//   GET  ?action=knowledge   &clientId=              → memoria
//   DELETE ?action=knowledge &id=                    → borra un bloque
//   DELETE ?action=history   &clientId=              → vacía la conversación
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, validateAuth } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { COPY_KNOWLEDGE } from './_lib/copy-knowledge.js'
import { llmChat, llmChatConHerramientas, llmHealth, llmInfo } from './_lib/llm.js'
import { investigar, buscadorEnUso } from './_lib/web.js'
import { HERRAMIENTAS, INSTRUCCIONES_ACCIONES, ejecutarAccion } from './_lib/acciones.js'
import { resolverFecha, isoLocal } from './_lib/fechas.js'
import { getGoogleConfig, getAccessToken, crearDocEnDrive, puedeEscribirEnDrive } from './_lib/google.js'

const MAX_TOKENS = 2048
const HISTORY_TURNS = 12        // mensajes de contexto que se reenvían al modelo

// ── Comandos ───────────────────────────────────────────────────────────────
export const COMMANDS = [
  { cmd: '/help', args: '', desc: 'Muestra todos los comandos disponibles.' },
  { cmd: '/reel-guion', args: '<tema o ángulo>', desc: 'Escribe el guion: hook, bullets y CTA, con la estructura completa.' },
  { cmd: '/programar-guion', args: '<fecha> <tema>', desc: 'Escribe el guion y lo agenda en el calendario de Contenido el día que digas.' },
  { cmd: '/reel-estudio', args: '<guion o transcripción>', desc: 'Estudia un reel ajeno: extrae su patrón y lo guarda en la memoria del perfil.' },
  { cmd: '/estudiar', args: '<tema o URL>', desc: 'Busca en internet, se lee las fuentes y aprende lo que sirva para este negocio.' },
  { cmd: '/conocimiento', args: '<info>', desc: 'Guarda información en la memoria permanente de este perfil.' },
  { cmd: '/email', args: '<tema>', desc: 'Escribe un email de marketing con asunto, cuerpo, P.D. y enlaces con UTM.' },
  { cmd: '/descripcion', args: '<bio de perfil | vídeo sobre…>', desc: 'Tu bio para redes o la descripción de un vídeo, escritas con lo que sé de ti.' },
  { cmd: '/memoria-setter', args: '<info>', desc: 'Entrena al setter: guarda oferta, objeciones, tono y conversaciones que funcionaron.' },
  // Los cuatro que EJECUTAN. Lo mismo se puede pedir hablando, sin comando.
  { cmd: '/añadir', args: '<pieza y día>', desc: 'Añade piezas al calendario de Contenido.' },
  { cmd: '/reporteventa', args: '<persona y números>', desc: 'Apunta en Diario el reporte del día de un closer.' },
  { cmd: '/reportesetting', args: '<persona y números>', desc: 'Apunta en Diario el reporte del día de un setter.' },
  { cmd: '/creacionequipo', args: '<nombre, rol y condiciones>', desc: 'Da de alta a una persona en Equipo.' },
  { cmd: '/guion-setting', args: '<a quién escribes y desde dónde>', desc: 'Guion de setting: apertura, cualificación, transición a llamada y objeciones.' },
  { cmd: '/continuar-conversacion', args: '<pega la conversación>', desc: 'Lee por dónde va el chat con el lead y escribe la siguiente respuesta.' },
  { cmd: '/memoria', args: '', desc: 'Lista lo que la IA tiene guardado sobre este perfil.' },
]

const HELP_TEXT = [
  'Estos son los comandos que entiendo:',
  '',
  ...COMMANDS.map(c => `**${c.cmd}** ${c.args ? `\`${c.args}\`` : ''}\n${c.desc}`),
  '',
  'Sin comando, es una conversación normal: pregúntame lo que quieras sobre contenido, guiones o copy.',
].join('\n')

// ── System prompt ──────────────────────────────────────────────────────────
const BASE_ROLE = `Eres el copywriter de cabecera de este perfil de negocio dentro de HELM.
Escribes guiones para redes (reels, carousels, YouTube), hooks, bullet points y
email marketing. Hablas español de España, directo y sin florituras.

Trabajas SIEMPRE con el método de abajo. No es una sugerencia: es cómo se hace
aquí. Y usas la memoria del perfil (más abajo) para que todo suene a esta cuenta
concreta y no a un guion genérico de internet.

Tres cosas que no se negocian:
· Tocar la emoción del espectador. Sin emoción no sirve de nada.
· Nada de saludos ni preámbulos: se arranca hablando.
· Un solo CTA, concreto.

Si te falta contexto del negocio para escribir bien, dilo y pide justo el dato
que necesitas — no te lo inventes.`

// Los comandos de setting no los escribe un copywriter: los escribe alguien que
// se ha comido miles de DMs. Cambia el oficio, así que cambia el rol entero.
// El Copiloto Fiscal (consultoria.s4sf.net): un rol entero aparte, no el
// copywriter con otro nombre. Un despacho no necesita hooks ni CTAs — necesita
// que alguien con memoria perfecta de sus plazos y sus clientes conteste rápido
// y no se invente una cifra. Es la respuesta seria a "Sage Copilot".
const FISCAL_ROLE = `Eres el Copiloto Fiscal de este despacho dentro de HELM. Ayudas al asesor con
plazos y modelos tributarios españoles (303, 130, 131, 111, 115, 349, 390, 190, 347, 200, 202),
con el estado de sus clientes en el sistema, y con redactar avisos o resúmenes cuando te lo pidan.

Hablas español de España, profesional y al grano — como un compañero de despacho con memoria
perfecta de los datos del sistema, no como un buscador ni como una guía genérica de Hacienda.

Reglas que no se negocian:
· Si te preguntan un plazo, un importe o el estado de un cliente y NO está en el contexto que
  tienes más abajo, dilo tal cual — "eso no lo tengo en el sistema, compruébalo" — en vez de
  inventarte una fecha o una cifra. Un dato fiscal mal dicho le cuesta dinero real a alguien.
· Si te piden redactar un aviso o un email para un cliente, escríbelo, pero dejando claro que es
  un borrador que el asesor revisa antes de mandarlo — tú no presentas nada ni envías nada.
· No eres el copywriter de contenido de HELM. Si te piden un guion de reel o de ventas, di que
  eso no es lo tuyo aquí.

Si te falta contexto del despacho para responder bien, dilo y pide justo el dato que necesitas —
no te lo inventes.`

const SETTER_ROLE = `Eres el jefe de setting de este negocio dentro de HELM. Tu trabajo es
conseguir llamadas agendadas por mensaje directo (Instagram, WhatsApp, LinkedIn),
y entrenar al setter que los manda.

Hablas español de España, en el registro de un mensaje real: frases cortas, sin
comas de más, sin lenguaje de folleto. Escribes como escribe una persona en el
móvil, no como escribe una marca.

Reglas del oficio que no se negocian:
· Nunca se vende por chat. El objetivo del mensaje es la LLAMADA, nada más.
· Un mensaje, una pregunta. Dos preguntas seguidas matan la conversación.
· Se pregunta antes de ofrecer: primero el contexto del lead, luego la propuesta.
· Nada de textos gigantes ni de audios de tres minutos por escrito.
· Nada de vender a quien no ha dicho que tiene el problema.
· Se escucha lo que dice el lead: si acaba de contar algo, se responde a ESO
  antes de seguir con el plan.

Si te falta un dato del negocio (oferta, precio, a quién va dirigido, de dónde
sale el lead), pídelo en una línea en vez de inventártelo.`

const TASKS = {
  guion: `TAREA: escribe el guion que te piden.

Entrega en este orden y con estos títulos:

**HOOK** — 3 opciones distintas, cada una de una familia diferente. Una línea cada una.
**GANAS / PIERDES** — una frase que deje en evidencia qué gana el que escucha y qué pierde el que no.
**DESARROLLO** — 3 bullets, uno por idea, de menor a mayor impacto. Cada uno con su capa: dato, emoción u opinión.
**TRIPLE AUTORIDAD** — persona reconocida + entidad o estudio + el ángulo de experiencia propia que debería contar.
**CIERRE / CTA** — una sola acción.

Recuerda: puntos clave y ángulos, no un guion cerrado palabra por palabra — él
escribe su propio script encima de esto.`,

  estudio: `TAREA: estudia el reel/guion que te acaban de pasar y extrae su patrón para
poder replicarlo. Analiza, no resumas.

Entrega:
**TIPO DE HOOK** — a qué familia pertenece y por qué funciona (o por qué no).
**ESTRUCTURA** — cómo está montado: dónde acaba la intro, cómo encadena, dónde reabre el bucle.
**CAPAS** — cuáles de las tres (dato / emoción / opinión) usa y cuál le falta.
**QUÉ ROBAR** — el mecanismo concreto que se puede reutilizar, explicado como plantilla rellenable.
**CÓMO APLICARLO A ESTA CUENTA** — un ejemplo ya adaptado al perfil.

Sé concreto y breve. Esto se guarda en memoria para usarlo después.`,

  // Lo que se le manda con el texto de las páginas ya descargadas. El modelo es
  // local y no navega: aquí solo lee lo que le hemos traído.
  estudiar: `TAREA: te paso el texto de varias páginas de internet sobre un tema. Estúdialas
y quédate con lo que le sirve a ESTE negocio. No resumas por resumir.

Entrega:
**LO QUE HE APRENDIDO** — 4-6 puntos, cada uno un hecho o una idea concreta, no
una generalidad. Si un dato lleva cifra o fecha, cítala.
**LO QUE APLICA A ESTA CUENTA** — qué de todo eso encaja con este negocio y por
qué. Aquí sí puedes cruzarlo con lo que ya sabes del perfil.
**CÓMO USARLO** — 2-3 acciones concretas: un ángulo de contenido, un cambio en
la oferta, una objeción que rebatir…
**LO QUE NO ME CREO** — lo que sea promocional, esté sin respaldo o se
contradiga entre fuentes. Si las fuentes son flojas, dilo claramente.
**FUENTES** — de cuál sale cada cosa importante, con el número de la fuente.

Reglas: solo lo que esté en las páginas. Si algo no aparece, no lo rellenes con
lo que creas saber — di que no lo has encontrado. Y si el material no vale para
nada, dilo en dos líneas en vez de inventar un informe.`,

  email: `TAREA: escribe el email de marketing que te piden.

Entrega:
**ASUNTO** — 3 opciones, 4-8 palabras cada una.
**PREHEADER** — continúa el asunto, no lo repite.
**CUERPO** — entra directo a la escena o al conflicto, un solo objetivo.
**P.D.** — con la promesa resumida.

Todos los enlaces llevan UTMs con el formato del método. Marca cada enlace como
[TEXTO DEL ENLACE](URL?utm_source=email&utm_medium=...&utm_campaign=...&utm_content=...)
y usa slugs en minúscula con guiones. Si no te han dado la URL de destino,
escribe {{url}} como marcador pero deja los UTMs ya montados.`,

  // ── Descripciones ────────────────────────────────────────────────────────
  // Dos entregables muy distintos que la gente pide con la misma palabra. El
  // handler decide cuál toca y le manda solo esa tarea: darle las dos al modelo
  // y que elija es la forma de que devuelva una mezcla de ambas.
  bio: `TAREA: escribe la biografía del perfil de redes de esta cuenta.

Es una bio: cabe en 150 caracteres, se lee en dos segundos y decide si te siguen.
No es un currículum ni una lista de servicios.

Entrega:
**3 BIOS COMPLETAS** — numeradas, cada una de un ángulo distinto:
  1. Por el resultado que consigue el cliente.
  2. Por el mecanismo o la forma de trabajar que la hace distinta.
  3. Por la autoridad y la prueba (cifras, casos, años).
Cada bio en el formato real: líneas cortas, sin párrafos, con la última línea
reservada al CTA del enlace.
**PARA CADA UNA** — una frase de por qué funciona y a quién repele (una bio que
no repele a nadie no atrae a nadie).
**NOMBRE DEL PERFIL** — 2 opciones del campo "nombre" (el que sí busca el
algoritmo): persona + lo que hace, en pocas palabras.

Cuenta los caracteres de cada bio y ponlos entre paréntesis al final. Si te
piden una red concreta, ajústate a su límite y a cómo se lee allí.`,

  video: `TAREA: escribe la descripción del vídeo que te piden.

La descripción tiene dos lectores: la persona que decide si sigue viendo, y el
buscador que decide a quién se lo enseña. Sirve a los dos, en ese orden.

Entrega:
**TÍTULO** — 3 opciones, cada una con una promesa distinta. Máximo 60 caracteres.
**PRIMERAS 2 LÍNEAS** — lo único que se ve sin desplegar: promesa y motivo para
seguir. Aquí no se saluda ni se presenta nadie.
**DESCRIPCIÓN COMPLETA** — de qué va, qué se lleva quien lo vea y para quién es.
En bloques cortos, con lenguaje de persona.
**CAPÍTULOS** — marcas de tiempo con el nombre de cada parte. Si no te han dado
la estructura del vídeo, escribe la que tendría y márcalo como propuesta.
**CTA** — uno solo, con el enlace marcado como {{url}} si no te lo han dado.
**ETIQUETAS** — 8-12 palabras clave que de verdad se buscan, separadas por comas.

Nada de "en el vídeo de hoy os traigo": se entra directo.`,

  // ── Setting ──────────────────────────────────────────────────────────────
  guionSetting: `TAREA: escribe el guion de setting para la situación que te describen.

Es un guion de mensajes, no un discurso. Cada pieza tiene que poder copiarse y
pegarse tal cual en el chat.

Entrega:
**APERTURA** — 3 mensajes de primer contacto, cada uno de un ángulo distinto
(por el contenido que consumió, por su situación visible, por una pregunta
directa). Máximo dos líneas cada uno.
**CUALIFICACIÓN** — las 4 preguntas que hay que hacer, EN ORDEN y de una en una,
con lo que buscas averiguar en cada una entre paréntesis: situación actual,
problema y su coste, intento previo, y decisión (si manda él y si hay presupuesto).
**PUENTE A LA LLAMADA** — el mensaje exacto con el que se pasa de la conversación
a proponer la llamada, más la frase de cierre para fijar día y hora.
**SI DICE QUE SÍ** — la confirmación que reduce el no-show: qué se le recuerda y
qué se le pide que traiga.
**OBJECIONES** — las 4 más probables en este caso (precio, tiempo, "mándame
información", "me lo pienso") con la respuesta lista para pegar. La respuesta
siempre devuelve la conversación a una pregunta.

Debajo de cada bloque, una línea en cursiva con el porqué, para que el setter
aprenda y no se limite a copiar.`,

  continuar: `TAREA: te pasan una conversación con un lead a medias. Léela y escribe lo
siguiente que hay que mandar.

Entrega:
**DÓNDE ESTAMOS** — 2-3 líneas: qué ha dicho el lead de verdad, qué temperatura
tiene (frío / interesado / listo para llamada) y qué información falta todavía
para poder proponer la llamada.
**SIGUIENTE MENSAJE** — 3 opciones listas para copiar y pegar, numeradas y de tono
distinto (más directa, más suave, más provocadora). Cada una responde a lo último
que dijo él antes de avanzar.
**POR QUÉ ESTA** — cuál de las tres recomiendas y en una línea por qué.
**SI CONTESTA X** — los dos escenarios más probables de respuesta y qué mandar en
cada uno.
**LO QUE NO HAY QUE HACER AQUÍ** — el error concreto que se cometería en este
punto de esta conversación.

Si en la conversación el lead ya ha dado señal de compra, no sigas cualificando:
propón la llamada.`,
}

// Trocea un documento largo para que un solo PDF no se coma toda la ventana de
// contexto y deje fuera a la Biblia, que es lo que de verdad manda.
const MAX_DOC_CHARS = 6000
const recorta = (txt) => {
  const t = String(txt || '').trim()
  return t.length <= MAX_DOC_CHARS ? t : t.slice(0, MAX_DOC_CHARS) + '\n\n[…documento recortado…]'
}

/**
 * Arma el system prompt del turno.
 *
 * @param {'copy'|'setting'|'fiscal'} modo qué oficio toca. En 'setting' no entra el
 *   método de copywriting (es para guiones de contenido y solo desviaría al
 *   modelo) y sí entra el entrenamiento del setter, que en 'copy' sobra. En
 *   'fiscal' (consultoria) no entra ninguno de los dos: es un oficio distinto.
 */
function buildSystem({ clientName, knowledge, biblia, library = [], modo = 'copy', contextoFiscal }) {
  const esSetting = modo === 'setting'
  const esFiscal = modo === 'fiscal'
  // Lo guardado con /memoria-setter va en su propio bloque: mezclado con las
  // notas de copy, el modelo escribía DMs con estructura de reel.
  const setter = knowledge.filter(k => k.kind === 'setter')
  const generales = knowledge.filter(k => k.kind !== 'setter')

  const memoria = generales.length
    ? generales.map(k => `### ${k.title || k.kind}\n${k.content}`).join('\n\n')
    : '(Todavía no hay nada guardado suelto de este perfil. Si necesitas contexto, pídelo.)'

  const parts = [
    esFiscal ? FISCAL_ROLE : esSetting ? SETTER_ROLE : BASE_ROLE,
    `# PERFIL ACTIVO\n${clientName}`,
  ]
  if (!esSetting && !esFiscal) parts.push(`# MÉTODO\n${COPY_KNOWLEDGE}`)
  if (esFiscal && contextoFiscal) parts.push(`# PLAZOS Y ESTADO DEL DESPACHO (datos reales del sistema, ahora mismo)\n${contextoFiscal}`)

  // La Biblia (si el onboarding está hecho) es el contexto de máxima prioridad:
  // manda sobre el método genérico y sobre cualquier suposición.
  if (biblia?.empresa) parts.push(`# BIBLIA DE LA EMPRESA\nEsto define la marca. Tiene prioridad sobre todo lo demás.\n\n${biblia.empresa}`)
  if (biblia?.contenido) parts.push(`# BIBLIA DE CONTENIDO\nEl manual de contenido de esta cuenta. Aplícalo al escribir.\n\n${biblia.contenido}`)

  parts.push(`# MEMORIA DE ESTE PERFIL\nNotas sueltas y reels estudiados de esta cuenta.\n\n${memoria}`)

  // El entrenamiento del setter manda sobre el criterio general: si aquí pone
  // que a este avatar se le tutea o que la oferta se presenta de tal forma, es
  // eso y no lo que diría un manual.
  if (esSetting) {
    parts.push(
      '# ENTRENAMIENTO DEL SETTER\n'
      + (setter.length
        ? 'Así se hace setting en esta cuenta. Manda sobre cualquier criterio general.\n\n'
          + setter.map(k => `### ${k.title || 'Nota de setting'}\n${k.content}`).join('\n\n')
        : '(Vacío. Este perfil todavía no ha entrenado a su setter con `/memoria-setter`. '
          + 'Trabaja con la Biblia y la memoria general, y di qué te falta.)'),
    )
  }

  // Biblioteca: documentos y transcripciones que el usuario ha marcado para
  // que entren en contexto. Van al final y con menos prioridad que la Biblia:
  // son material de consulta, no la definición de la marca.
  if (library.length) {
    const docs = library.map(d => {
      const cabecera = [
        d.kind === 'transcripcion' ? 'Transcripción' : 'Documento',
        d.title,
        d.contact_name ? `cliente: ${d.contact_name}` : null,
        d.occurred_on || null,
      ].filter(Boolean).join(' · ')
      return `### ${cabecera}\n${recorta(d.content)}`
    }).join('\n\n')
    parts.push(
      '# BIBLIOTECA\nDocumentos de la empresa y transcripciones de llamadas. '
      + 'Úsalos como fuente de hechos cuando te pregunten por un cliente o por cómo '
      + 'funciona el negocio. Si algo contradice a la Biblia, manda la Biblia.\n\n'
      + docs,
    )
  }

  return parts.join('\n\n---\n\n')
}

// Lo que el Copiloto Fiscal necesita para no inventarse un plazo: los
// próximos 30 días de obligaciones (con el nombre del cliente, que es lo que
// pregunta el asesor) y un recuento de cómo está el trimestre. Sin esto, un
// 14B respondería con lo que "normalmente" pasa en vez de con la realidad de
// este despacho — que es justo lo que la regla del rol le prohíbe hacer.
async function getContextoFiscal(clientId) {
  const hoy = new Date().toISOString().slice(0, 10)
  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const { data: proximas } = await supabase
    .from('helm_fiscal_obligaciones')
    .select('modelo, periodo, fecha_limite, estado, crm_contacts(name)')
    .eq('client_id', clientId)
    .gte('fecha_limite', hoy).lte('fecha_limite', en30)
    .order('fecha_limite').limit(60)
  const { data: todas } = await supabase
    .from('helm_fiscal_obligaciones')
    .select('estado')
    .eq('client_id', clientId)
  if (!proximas?.length && !todas?.length) return null

  const cuenta = { pendiente_docs: 0, en_proceso: 0, presentado: 0, fuera_plazo: 0 }
  for (const o of todas || []) cuenta[o.estado] = (cuenta[o.estado] || 0) + 1

  const lista = (proximas || [])
    .map(o => `- ${o.modelo} (${o.periodo}) de ${o.crm_contacts?.name || 'cliente sin nombre'} — vence ${o.fecha_limite}, estado: ${o.estado}`)
    .join('\n') || '(ninguna en los próximos 30 días)'

  return `Resumen general: ${cuenta.pendiente_docs} pendientes de documentación, ${cuenta.en_proceso} en proceso, `
    + `${cuenta.presentado} presentadas, ${cuenta.fuera_plazo} fuera de plazo.\n\n`
    + `Próximos 30 días (hoy es ${hoy}):\n${lista}`
}

// ── Helpers de datos ───────────────────────────────────────────────────────
async function getKnowledge(clientId) {
  const { data } = await supabase
    .from('helm_knowledge').select('id, kind, title, content, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: true }).limit(200)
  return data || []
}

// Documentos de la biblioteca marcados como contexto. El nombre del contacto
// viaja junto al documento para que la IA pueda responder "¿qué pasó con este
// cliente?" sin tener que cruzar ids.
async function getLibrary(clientId) {
  const { data, error } = await supabase
    .from('helm_library')
    .select('title, kind, content, occurred_on, crm_contacts(name)')
    .eq('client_id', clientId).eq('in_context', true)
    .order('occurred_on', { ascending: false, nullsFirst: false })
    .limit(40)
  // La tabla llega en una migración aparte: sin ella, el chat sigue como antes.
  if (error) { console.warn('[helm] getLibrary', error.message); return [] }
  return (data || [])
    .filter(d => (d.content || '').trim())
    .map(d => ({ ...d, contact_name: d.crm_contacts?.name || null }))
}

// Las Biblias del perfil (empresa/contenido), si el onboarding ya se completó.
async function getBiblia(clientId) {
  const { data } = await supabase
    .from('helm_biblia').select('kind, content').eq('client_id', clientId)
  const out = {}
  for (const row of data || []) out[row.kind] = row.content
  return out
}

async function getHistory(clientId, limit = HISTORY_TURNS) {
  const { data } = await supabase
    .from('helm_chat_messages').select('id, role, content, command, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(limit)
  return (data || []).reverse()
}

async function saveMessage(clientId, role, content, command = null) {
  const { data } = await supabase
    .from('helm_chat_messages').insert({ client_id: clientId, role, content, command })
    .select('id, role, content, command, created_at').single()
  return data
}

// Alias tolerante: la gente escribe el comando sin guiones, con acentos o con
// el verbo delante ("/crear-guion-setting"). Todo cae en el canónico.
const ALIASES = {
  '/programarguion': '/programar-guion',
  '/reelguion': '/reel-guion',
  '/estudia': '/estudiar',
  '/investigar': '/estudiar',
  '/buscar': '/estudiar',
  '/descripción': '/descripcion',
  '/bio': '/descripcion',
  '/memoriasetter': '/memoria-setter',
  '/setter': '/memoria-setter',
  '/guionsetting': '/guion-setting',
  '/crearguionsetting': '/guion-setting',
  '/crear-guion-setting': '/guion-setting',
  '/guion-de-setting': '/guion-setting',
  '/anadir': '/añadir',
  '/agregar': '/añadir',
  '/calendario': '/añadir',
  '/reporte-venta': '/reporteventa',
  '/reporteventas': '/reporteventa',
  '/reportecloser': '/reporteventa',
  '/reporte-setting': '/reportesetting',
  '/reportesetter': '/reportesetting',
  '/creacion-equipo': '/creacionequipo',
  '/crearequipo': '/creacionequipo',
  '/nuevomiembro': '/creacionequipo',
  '/continuarconversacion': '/continuar-conversacion',
  '/continuar-conversación': '/continuar-conversacion',
  '/continuar': '/continuar-conversacion',
}

function parseCommand(text) {
  // Acentos y eñes incluidos: si alguien escribe /descripción, es un comando,
  // no una frase suelta que hay que mandarle entera al modelo.
  const m = String(text || '').trim().match(/^(\/[a-záéíóúüñ-]+)\s*([\s\S]*)$/i)
  if (!m) return { command: null, body: String(text || '').trim() }
  let command = m[1].toLowerCase()
  command = ALIASES[command] || command
  if (!COMMANDS.some(c => c.cmd === command)) return { command: null, body: String(text || '').trim() }
  return { command, body: m[2].trim() }
}

// La fecha de /programar-guion la resuelve el mismo motor que usan las
// acciones del chat (api/_lib/fechas.js), así que aquí también valen "el lunes"
// o "en 3 días" y no solo hoy/mañana/25-07 como antes.

/**
 * Deja el guion como documento en la carpeta de Drive del perfil.
 *
 * Nunca lanza: devuelve `{ url, aviso }` y el guion se agenda igual pase lo que
 * pase. Un guion que se pierde porque Drive dio 500 es mucho peor que un guion
 * agendado sin documento, y quien lo escribió no tiene forma de saber que hay
 * que repetirlo.
 */
async function docDelGuion(clientId, { titulo, fecha, guion }) {
  try {
    const row = await getGoogleConfig(supabase, clientId)
    const cfg = row?.config
    if (!cfg?.refreshToken) return { url: null }        // sin Google enlazado: normal, sin aviso
    if (!cfg.guionesFolderId) {
      return { url: null, aviso: '_Para que además caiga en Drive, prepara la carpeta en Ajustes → Integraciones._' }
    }
    if (!puedeEscribirEnDrive(cfg.scopes)) {
      return { url: null, aviso: '_Este perfil enlazó Google antes de que HELM pudiera escribir. Reconecta en Ajustes y el próximo guion irá también a Drive._' }
    }
    const { token } = await getAccessToken(supabase, clientId)
    const doc = await crearDocEnDrive(token, {
      nombre: `${fecha} · ${String(titulo).slice(0, 80)}`,
      texto: guion,
      folderId: cfg.guionesFolderId,
    })
    return { url: doc.webViewLink || null }
  } catch (err) {
    console.warn('[chat] docDelGuion', err.message)
    return { url: null, aviso: `_El guion está agendado, pero no pude subirlo a Drive: ${err.message}_` }
  }
}

// ── Comandos de acción ─────────────────────────────────────────────────────
// El atajo con nombre propio de las tres cosas que el chat sabe hacer. Lo mismo
// se puede pedir hablando, pero un comando quita la duda de si te ha entendido.
//
// `fijo` son los campos que decide el COMANDO y no el modelo: en /reporteventa
// el rol es closer aunque la frase mencione otra cosa.
const ACCION_DE_COMANDO = {
  '/añadir': {
    tool: 'programar_contenido',
    ayuda: [
      'Dime qué pieza y para cuándo. Puedes meter varias de una vez:',
      '',
      '`/añadir reel sobre las objeciones de precio para mañana`',
      '`/añadir el lunes un carrusel con los 3 errores al contratar un closer`',
      '`/añadir para el jueves un email de reactivación y el viernes un reel de testimonios`',
      '',
      'Fechas que entiendo: hoy, mañana, pasado, un día de la semana, «en 3 días», 25/07 o 2026-08-10.',
      'Formatos: reel, carrusel, email, YouTube o nota. Si no dices ninguno, va como reel.',
    ],
  },
  '/reporteventa': {
    tool: 'crear_reporte_diario',
    fijo: { rol: 'closer' },
    ayuda: [
      'El reporte del día de un **closer**. Dime de quién es y sus números:',
      '',
      '`/reporteventa Juan: 8 agendadas, 6 asistieron, 4 cualificaron, 2 cierres, 1 en seguimiento, 1 perdido`',
      '`/reporteventa ayer Ana tuvo 5 agendadas y asistieron 3, cerró 1`',
      '',
      'Lo que lleva un closer: agendadas, asistieron, cualificaron, convirtieron, seguimiento y perdidos.',
      'Lo que no me digas se queda en 0. Si no pones fecha, es de hoy.',
    ],
  },
  '/reportesetting': {
    tool: 'crear_reporte_diario',
    fijo: { rol: 'setter' },
    ayuda: [
      'El reporte del día de un **setter**. Dime de quién es y sus números:',
      '',
      '`/reportesetting Marta: 40 conversaciones abiertas, 12 efectivas, 5 agendamientos`',
      '`/reportesetting ayer Pedro abrió 25 conversaciones, 8 efectivas y agendó 3`',
      '',
      'Lo que lleva un setter: conversaciones abiertas, conversaciones efectivas y agendamientos.',
      'Lo que no me digas se queda en 0. Si no pones fecha, es de hoy.',
    ],
  },
  '/creacionequipo': {
    tool: 'crear_miembro_equipo',
    ayuda: [
      'Doy de alta a alguien en Equipo. Como mínimo, nombre y rol:',
      '',
      '`/creacionequipo Marta como setter, marta@acme.com, 8% de comisión`',
      '`/creacionequipo Juan closer con 1.200 € fijos y 10% de comisión desde el 1 de agosto`',
      '',
      'Roles: dueño, closer, setter, CSM, editor u otro.',
      'Puedo guardar además email, teléfono, comisión, fijo mensual, fecha de inicio y notas.',
      'El acceso al panel no se da aquí: eso se hace en Equipo → Acceso.',
    ],
  },
}
// Los dos comandos que cambian de oficio: dejan de escribir contenido y pasan a
// mandar mensajes a un lead.
const SETTING_COMMANDS = new Set(['/guion-setting', '/continuar-conversacion'])

// /descripcion sirve para dos entregables distintos. Si nombran la bio o el
// perfil, es una bio; si nombran un vídeo (o cualquiera de sus formatos), es la
// descripción del vídeo. Sin pistas, bio: es lo que pide casi todo el mundo.
const RE_BIO = /\b(bio|biograf[íi]a|perfil|about|acerca)\b/i
const RE_VIDEO = /\b(v[íi]deo|video|youtube|yt|short|shorts|reel|reels|tiktok|podcast|episodio|masterclass|webinar|clase)\b/i
const esDeVideo = (body) => !RE_BIO.test(body || '') && RE_VIDEO.test(body || '')

function titleFrom(text) {
  const first = String(text).split('\n').find(l => l.trim()) || 'Sin título'
  return first.trim().slice(0, 80)
}

// Llama al modelo LOCAL (Ollama en este servidor) y devuelve el texto.
function ask({ system, messages }) {
  return llmChat({ system, messages, maxTokens: MAX_TOKENS, temperature: 0.75 })
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)

  // Sesión válida y con permiso sobre el perfil que se pide. `health` y
  // `commands` no tocan datos de nadie, así que solo exigen estar logueado.
  const reqClientId = req.query.clientId || req.body?.clientId || null
  const isPublicAction = action === 'health' || action === 'commands'
  try {
    if (isPublicAction) await validateAuth(req, { required: true })
    else await requireProfileAccess(req, reqClientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  // GET ?action=history|knowledge
  if (req.method === 'GET') {
    if (action === 'health') return res.status(200).json({ ...(await llmHealth()), ...llmInfo })
    if (action === 'commands') return res.status(200).json({ commands: COMMANDS })
    const clientId = req.query.clientId
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
    if (action === 'history') return res.status(200).json({ messages: await getHistory(clientId, 200) })
    if (action === 'knowledge') return res.status(200).json({ knowledge: await getKnowledge(clientId) })
    return res.status(400).json({ error: 'Acción no soportada' })
  }

  // DELETE ?action=history|knowledge
  if (req.method === 'DELETE') {
    if (action === 'knowledge') {
      const id = req.query.id || req.body?.id
      if (!id || !reqClientId) return res.status(400).json({ error: 'id y clientId requeridos' })
      const { error } = await supabase.from('helm_knowledge')
        .delete().eq('id', id).eq('client_id', reqClientId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ success: true })
    }
    if (action === 'history') {
      const clientId = req.query.clientId || req.body?.clientId
      if (!clientId) return res.status(400).json({ error: 'clientId requerido' })
      const { error } = await supabase.from('helm_chat_messages').delete().eq('client_id', clientId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ success: true })
    }
    return res.status(400).json({ error: 'Acción no soportada' })
  }

  // POST ?action=send
  if (req.method === 'POST' && action === 'send') {
    const gate = rateLimit({ key: `chat:${ip}`, max: 30, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfter))
      return res.status(429).json({ error: 'Demasiadas peticiones seguidas.', retryAfter: gate.retryAfter })
    }

    const { clientId, message } = req.body || {}
    if (!clientId || !message?.trim()) {
      return res.status(400).json({ error: 'clientId y message son obligatorios' })
    }

    const { data: client } = await supabase
      .from('clients').select('id, name, client_type').eq('id', clientId).maybeSingle()
    if (!client) return res.status(404).json({ error: 'Perfil no encontrado' })
    const esConsultoria = client.client_type === 'consultoria'

    const { command, body } = parseCommand(message)

    // El Copiloto Fiscal no tiene comandos de infoproducto (/reel-guion,
    // /email…): son de otro oficio. Se avisa en vez de ejecutarlos.
    if (command && esConsultoria) {
      const u = await saveMessage(clientId, 'user', message, command)
      const b = await saveMessage(clientId, 'assistant',
        `Aquí no hay comandos — pregúntame directamente lo que necesites sobre plazos, modelos o `
        + `clientes del despacho.`, command)
      return res.status(200).json({ userMessage: u, message: b })
    }

    // Comandos que se resuelven sin llamar al modelo.
    if (command === '/help') {
      const userMsg = await saveMessage(clientId, 'user', message, command)
      const botMsg = await saveMessage(clientId, 'assistant', HELP_TEXT, command)
      return res.status(200).json({ userMessage: userMsg, message: botMsg })
    }

    if (command === '/memoria') {
      const k = await getKnowledge(clientId)
      const text = k.length
        ? [`Tengo ${k.length} bloques guardados de **${client.name}**:`, '',
           ...k.map(x => `· **${x.title || 'Sin título'}** — ${x.kind}`)].join('\n')
        : 'Todavía no tengo nada guardado de este perfil. Usa `/conocimiento` para empezar.'
      const userMsg = await saveMessage(clientId, 'user', message, command)
      const botMsg = await saveMessage(clientId, 'assistant', text, command)
      return res.status(200).json({ userMessage: userMsg, message: botMsg })
    }

    if (command === '/conocimiento') {
      if (!body) return res.status(400).json({ error: 'Escribe la información después de /conocimiento' })
      const { error } = await supabase.from('helm_knowledge').insert({
        client_id: clientId, kind: 'nota', title: titleFrom(body), content: body, source: 'chat',
      })
      if (error) return res.status(500).json({ error: error.message })
      const userMsg = await saveMessage(clientId, 'user', message, command)
      const botMsg = await saveMessage(
        clientId, 'assistant',
        `Guardado en la memoria de **${client.name}**. Lo tendré en cuenta a partir de ahora.`,
        command,
      )
      return res.status(200).json({ userMessage: userMsg, message: botMsg })
    }

    // /memoria-setter: lo mismo que /conocimiento pero para el oficio de
    // setting. Va a su propio cajón para que /guion-setting y
    // /continuar-conversacion lo usen como manual de la casa.
    if (command === '/memoria-setter') {
      if (!body) {
        const help = [
          'Escribe después del comando lo que quieres que aprenda el setter. Por ejemplo:',
          '',
          '`/memoria-setter la oferta son 3 meses de acompañamiento a 1.500 € y solo entramos si facturan más de 3.000 €/mes`',
          '`/memoria-setter cuando dicen "mándame info" no mandamos nada: se devuelve con una pregunta sobre su situación`',
          '`/memoria-setter esta conversación acabó en llamada agendada: [pega el chat entero]`',
          '',
          'Cuanto más concreto (oferta, precio, a quién decimos que no, objeciones reales, chats que sí funcionaron), '
          + 'mejores serán los guiones que te escriba.',
        ].join('\n')
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant', help, command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      const fila = {
        client_id: clientId, title: `Setting — ${titleFrom(body)}`, content: body, source: 'setter',
      }
      let { error } = await supabase.from('helm_knowledge').insert({ ...fila, kind: 'setter' })
      // Sin `migrations/helm_setter.sql` aplicada, el check de `kind` rechaza
      // 'setter'. Se guarda como nota antes que perder lo que el usuario acaba
      // de escribir; `source` sigue distinguiéndolo.
      if (error && /violates check constraint|check constraint/i.test(error.message || '')) {
        console.warn('[helm] falta migrations/helm_setter.sql — guardando como nota')
        ;({ error } = await supabase.from('helm_knowledge').insert({ ...fila, kind: 'nota' }))
      }
      if (error) return res.status(500).json({ error: error.message })

      const u = await saveMessage(clientId, 'user', message, command)
      const b = await saveMessage(
        clientId, 'assistant',
        `Aprendido. Lo usaré en **/guion-setting** y en **/continuar-conversacion** para que los `
        + `mensajes suenen a ${client.name} y no a un guion de plantilla.`,
        command,
      )
      return res.status(200).json({ userMessage: u, message: b })
    }

    // ── Comandos de acción ─────────────────────────────────────────────────
    // La versión con nombre y apellidos de lo que ya se puede pedir hablando.
    // Van antes de cargar memoria y Biblia a propósito: para dar de alta a
    // alguien no hace falta saber cómo escribe la marca, y así el comando
    // responde en un tercio del tiempo.
    if (ACCION_DE_COMANDO[command]) {
      const { tool, fijo, ayuda } = ACCION_DE_COMANDO[command]

      if (!body) {
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant', ayuda.join('\n'), command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      const hoy = new Date()
      // El modelo aquí solo hace de extractor: convierte la frase en campos.
      // Nada de Biblia ni de método — cuanto menos contexto, menos se despista.
      const sistema = [
        'Eres un extractor de datos. Conviertes lo que te escriben en una llamada a la herramienta.',
        `Hoy es ${isoLocal(hoy)}.`,
        'Reglas: copia las fechas TAL CUAL las diga el usuario ("mañana", "el lunes", "25/07") sin',
        'convertirlas ni calcular el día. No rellenes campos que no te hayan dicho. No inventes nombres,',
        'números ni roles. Si falta algo obligatorio, no llames a la herramienta: di qué falta en una línea.',
      ].join('\n')

      let turno
      try {
        turno = await llmChatConHerramientas({
          system: sistema,
          messages: [{ role: 'user', content: body }],
          tools: HERRAMIENTAS.filter(h => h.function.name === tool),
          maxTokens: 800,
        })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'Error llamando al modelo' })
      }

      const llamada = turno.toolCalls.find(c => c.name === tool)
      if (!llamada) {
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant',
          turno.content || ['No he sacado los datos de ahí.', '', ...ayuda].join('\n'), command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      // `fijo` manda sobre lo que diga el modelo: en /reporteventa el rol es
      // closer aunque en la frase aparezca la palabra "setter".
      const r = await ejecutarAccion(tool, { ...llamada.args, ...(fijo || {}) }, { supabase, clientId, hoy })
      const u = await saveMessage(clientId, 'user', message, command)
      const b = await saveMessage(clientId, 'assistant',
        r.ok ? `✅ **Hecho.**\n\n${r.resumen}` : `⚠️ ${r.error}`, command)
      return res.status(200).json({ userMessage: u, message: b })
    }

    // Comandos que sí llaman al modelo.
    const [knowledge, biblia, library, history] = await Promise.all([
      getKnowledge(clientId), getBiblia(clientId), getLibrary(clientId), getHistory(clientId),
    ])

    // /programar-guion <fecha> <tema>: escribe el guion y lo agenda en el
    // calendario de Contenido el día indicado.
    if (command === '/programar-guion') {
      const first = body.split(/\s+/)[0] || ''
      const fecha = resolverFecha(first)
      const tema = fecha ? body.slice(first.length).trim() : ''
      if (!fecha || !tema) {
        const help = [
          'Dime la fecha y el tema, en ese orden:',
          '`/programar-guion 25/07 lanzamiento del curso`',
          'Fechas válidas: `hoy`, `mañana`, `pasado`, `25/07`, `2026-07-25`.',
        ].join('\n')
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant',
          (!fecha ? 'No entendí la fecha. ' : 'Falta el tema. ') + help, command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      const system = buildSystem({ clientName: client.name, knowledge, biblia, library })
      let guion
      try {
        guion = await ask({ system, messages: [{ role: 'user', content: `${TASKS.guion}\n\n---\n\nPETICIÓN: ${tema}` }] })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'Error llamando al modelo' })
      }

      // El documento en Drive es opcional a propósito: si el perfil no tiene
      // Google enlazado, o lo enlazó antes de que HELM pudiera escribir, el
      // guion se agenda igual. Perder el guion por no poder subir el doc sería
      // el peor de los dos fallos posibles.
      const doc = await docDelGuion(clientId, { titulo: tema, fecha, guion })

      const { error: calErr } = await supabase.from('helm_content_calendar').insert({
        client_id: clientId, date: fecha, title: tema.slice(0, 80),
        body: guion, format: 'reel', status: 'planned', source: 'chat',
        doc_url: doc.url || null,
      })
      const u = await saveMessage(clientId, 'user', message, command)
      const confirm = calErr
        ? `He escrito el guion pero no pude agendarlo (${calErr.message}).\n\n${guion}`
        : [
          `📅 Guion agendado en **Contenido** para el **${fecha}**. Lo tienes en el calendario.`,
          doc.url ? `📄 Y en Drive: [abrir el documento](${doc.url})` : '',
          doc.aviso || '',
          '',
          guion,
        ].filter(Boolean).join('\n\n')
      const b = await saveMessage(clientId, 'assistant', confirm, command)
      return res.status(200).json({ userMessage: u, message: b })
    }

    // /estudiar <tema o URL>: lo único del chat que sale a internet. Busca,
    // se lee las páginas y guarda lo aprendido en la memoria del perfil, que es
    // lo que hace que la próxima vez ya lo sepa sin volver a buscar.
    if (command === '/estudiar') {
      if (!body) {
        const help = [
          'Dime qué quieres que estudie. Puede ser un tema o una URL concreta:',
          '',
          '`/estudiar cómo están cobrando las mentorías high ticket en España`',
          '`/estudiar https://unblog.com/articulo-que-me-interesa`',
          '',
          `Buscaré con ${buscadorEnUso()}, me leeré las páginas y me quedaré con lo que sirva `
          + 'para este negocio. Lo aprendido se guarda en la memoria del perfil.',
        ].join('\n')
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant', help, command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      let inv
      try {
        // Tres páginas y no cuatro, y más cortas: lo que entra aquí es lo que
        // el modelo tiene que leer antes de escribir nada, y el túnel corta a
        // los 100 s. Con tres fuentes ya se puede contrastar.
        inv = await investigar(body, { paginas: 3, maxChars: 4500 })
      } catch (err) {
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant',
          `No he podido buscar en internet: ${err.message}. Si el servidor no tiene salida a la red, `
          + 'pásame el texto directamente con `/conocimiento`.', command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      if (!inv.fuentes.length) {
        const detalle = inv.fallos.length
          ? '\n\nLo que he intentado abrir:\n' + inv.fallos.map(f => `· ${f.url} — ${f.error}`).join('\n')
          : ''
        const u = await saveMessage(clientId, 'user', message, command)
        const b = await saveMessage(clientId, 'assistant',
          (inv.esUrl
            ? 'No he podido leer esa página.'
            : 'No he encontrado ninguna página legible sobre eso. Prueba a decirlo de otra forma, '
              + 'o pásame tú la URL directamente.') + detalle, command)
        return res.status(200).json({ userMessage: u, message: b })
      }

      // Las páginas van numeradas para que el modelo pueda citar "fuente 2" en
      // vez de inventarse de dónde ha sacado cada cosa.
      const dossier = inv.fuentes
        .map((f, i) => `### FUENTE ${i + 1} — ${f.title}\n${f.url}\n\n${f.text}`)
        .join('\n\n---\n\n')

      const system = buildSystem({ clientName: client.name, knowledge, biblia, library })
      let estudio
      try {
        estudio = await ask({
          system,
          messages: [{ role: 'user', content: `${TASKS.estudiar}\n\n---\n\nTEMA: ${body}\n\n---\n\n${dossier}` }],
        })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'Error llamando al modelo' })
      }

      const listaFuentes = inv.fuentes.map((f, i) => `${i + 1}. [${f.title}](${f.url})`).join('\n')

      // A memoria va el estudio CON sus fuentes: dentro de un mes, poder
      // comprobar de dónde salió un dato vale tanto como el dato.
      await supabase.from('helm_knowledge').insert({
        client_id: clientId,
        kind: 'nota',
        title: `Estudio — ${titleFrom(body)}`,
        content: `${estudio}\n\n---\nFuentes consultadas:\n${listaFuentes}`,
        source: inv.esUrl ? `web:${inv.fuentes[0].url}` : `web:${buscadorEnUso()}`,
      })

      const cabecera = inv.esUrl
        ? `🔎 He leído la página y lo he guardado en la memoria de **${client.name}**.`
        : `🔎 He buscado en ${buscadorEnUso()}, leído **${inv.fuentes.length} páginas** y guardado lo aprendido `
          + `en la memoria de **${client.name}**.`
      const pie = `\n\n---\n**Fuentes**\n${listaFuentes}`
        + (inv.fallos.length ? `\n\n_No pude abrir ${inv.fallos.length}: ${inv.fallos.map(f => f.error).join(', ')}._` : '')

      const u = await saveMessage(clientId, 'user', message, command)
      const b = await saveMessage(clientId, 'assistant', `${cabecera}\n\n${estudio}${pie}`, command)
      return res.status(200).json({ userMessage: u, message: b })
    }

    // /continuar-conversacion sin conversación no tiene nada que leer.
    if (command === '/continuar-conversacion' && !body) {
      const help = [
        'Pégame la conversación después del comando y te escribo lo siguiente. Tal cual la copies del móvil vale:',
        '',
        '`/continuar-conversacion`',
        '`Lead: vi tu reel del otro día`',
        '`Yo: ¿qué te resonó?`',
        '`Lead: lo de que no me llegan clientes por Instagram`',
        '',
        'Marca quién dice cada cosa como puedas (Lead/Yo, Él/Yo…). Si no, lo deduzco.',
      ].join('\n')
      const u = await saveMessage(clientId, 'user', message, command)
      const b = await saveMessage(clientId, 'assistant', help, command)
      return res.status(200).json({ userMessage: u, message: b })
    }

    // ── Copiloto Fiscal (consultoria): conversación normal, SIN las
    // herramientas de infoproducto (agendar contenido, reporte de closer…),
    // que no pintan nada en un despacho. Con el contexto real de plazos.
    if (!command && esConsultoria) {
      const contextoFiscal = await getContextoFiscal(clientId)
      const system = buildSystem({ clientName: client.name, knowledge, biblia, library, modo: 'fiscal', contextoFiscal })
      const messages = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ]
      let respuesta
      // Temperatura baja a propósito: aquí lo que importa es no inventarse un
      // plazo, no sonar creativo.
      try { respuesta = await llmChat({ system, messages, maxTokens: MAX_TOKENS, temperature: 0.3 }) } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message })
      }
      const u = await saveMessage(clientId, 'user', message, null)
      const b = await saveMessage(clientId, 'assistant', respuesta, null)
      return res.status(200).json({ userMessage: u, message: b })
    }

    // ── Conversación normal: aquí el chat puede EJECUTAR ───────────────────
    // Sin comando, el modelo tiene herramientas: si le pides que programe el
    // contenido, que apunte un reporte o que dé de alta a alguien, lo hace en
    // el panel en vez de explicarte dónde está el botón.
    if (!command) {
      const hoy = new Date()
      const system = buildSystem({ clientName: client.name, knowledge, biblia, library })
        + '\n\n---\n\n' + INSTRUCCIONES_ACCIONES(hoy)
      const messages = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ]

      let turno
      try {
        turno = await llmChatConHerramientas({
          system, messages, tools: HERRAMIENTAS, maxTokens: MAX_TOKENS,
        })
      } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message || 'Error llamando al modelo' })
      }

      // Sin herramientas de por medio: charla de siempre. Si además vuelve
      // vacío (a los modelos pequeños les pasa cuando llevan herramientas
      // colgadas), se repite la pregunta sin ellas.
      if (!turno.toolCalls.length) {
        let respuesta = turno.content
        if (!respuesta) {
          try { respuesta = await ask({ system, messages }) } catch (err) {
            return res.status(err.statusCode || 502).json({ error: err.message })
          }
        }
        const u = await saveMessage(clientId, 'user', message, null)
        const b = await saveMessage(clientId, 'assistant', respuesta, null)
        return res.status(200).json({ userMessage: u, message: b })
      }

      // Se ejecutan en orden. El tope es para que un bucle del modelo no
      // acabe escribiendo cuarenta filas en la base de datos.
      const hechos = []
      const fallos = []
      for (const llamada of turno.toolCalls.slice(0, 4)) {
        const r = await ejecutarAccion(llamada.name, llamada.args, { supabase, clientId, hoy })
        if (r.ok) hechos.push(r.resumen)
        else fallos.push(r.error)
      }

      // La respuesta la redacta el servidor, no el modelo: lo que se le dice a
      // la persona tiene que ser exactamente lo que ha pasado en la base de
      // datos. Una segunda pasada por el modelo aquí acabaría diciendo "he
      // programado tres piezas" cuando solo entraron dos.
      const partes = []
      if (hechos.length) partes.push('✅ **Hecho.**\n\n' + hechos.join('\n\n'))
      if (fallos.length) partes.push((hechos.length ? '\n' : '⚠️ ') + fallos.join('\n'))
      if (!partes.length) partes.push(turno.content || 'No he podido hacerlo. Repítemelo con otras palabras.')

      const u = await saveMessage(clientId, 'user', message, null)
      const b = await saveMessage(clientId, 'assistant', partes.join('\n'), 'acción')
      return res.status(200).json({ userMessage: u, message: b })
    }

    const task = command === '/reel-guion' ? TASKS.guion
      : command === '/reel-estudio' ? TASKS.estudio
      : command === '/email' ? TASKS.email
      : command === '/descripcion' ? (esDeVideo(body) ? TASKS.video : TASKS.bio)
      : command === '/guion-setting' ? TASKS.guionSetting
      : command === '/continuar-conversacion' ? TASKS.continuar
      : null

    // Los comandos estructurados van SIN historial y con la tarea pegada al
    // turno del usuario. Con un modelo de 14B el historial pesa más que las
    // instrucciones del system: si la respuesta anterior fue un guion, te
    // devuelve un guion aunque le pidas un email. Sin historial no hay dudas.
    const modo = SETTING_COMMANDS.has(command) ? 'setting' : 'copy'
    const system = buildSystem({ clientName: client.name, knowledge, biblia, library, modo })
    // Con `/descripcion` y `/guion-setting` a secas no hay petición que pegar,
    // pero sí hay trabajo: se escribe con lo que ya sabe del negocio.
    const porDefecto = command === '/descripcion'
      ? 'Escribe la bio del perfil de esta cuenta con la información que ya tienes de ella.'
      : command === '/guion-setting'
        ? 'Escribe el guion de setting de esta cuenta para su oferta y su cliente ideal, en mensaje directo de Instagram.'
        : message

    const messages = task
      ? [{ role: 'user', content: `${task}\n\n---\n\nPETICIÓN: ${body || porDefecto}` }]
      : [
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ]

    let answer
    try {
      answer = await ask({ system, messages })
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message || 'Error llamando al modelo' })
    }

    const userMsg = await saveMessage(clientId, 'user', message, command)
    const botMsg = await saveMessage(clientId, 'assistant', answer, command)

    // /reel-estudio guarda tanto el material bruto como el análisis.
    if (command === '/reel-estudio' && body) {
      await supabase.from('helm_knowledge').insert([
        { client_id: clientId, kind: 'reel', title: `Reel estudiado — ${titleFrom(body)}`, content: body, source: 'chat' },
        { client_id: clientId, kind: 'analisis', title: `Patrón — ${titleFrom(body)}`, content: answer, source: 'chat' },
      ])
    }

    return res.status(200).json({ userMessage: userMsg, message: botMsg })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
