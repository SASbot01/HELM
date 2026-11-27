// HELM ACADEMY — lo que se entrega al dejar los datos en /helm-academy y lo que
// se le promete a la persona después (la pantalla /helm-academy/gracias).
//
// El embudo: vídeo de YouTube → /helm-academy?guia=… (el formulario) → en el
// momento, el lead magnet (la guía de ese vídeo, dentro de la parte gratuita de
// la academia, y si lo hay un vídeo de 5–7 min) y el aviso de que en menos de
// 24 horas le escribe alguien del equipo. Lo importante de esa pantalla es que
// la persona sepa cuál es su siguiente paso: esperar ese mensaje.
//
// Aquí va, junto y arriba, lo que se cambia cada dos por tres: la guía, el
// vídeo y el motivo del contacto. La pantalla (Gracias.jsx) solo lo pinta.

// Este fichero no toca el navegador al cargarse: también lo importa el servidor
// (api/leads.js), para que la promesa se escriba en un solo sitio.

// La pantalla de gracias. También la enlaza el correo de confirmación.
export const RUTA_GRACIAS = '/helm-academy/gracias'

// ── La guía, dentro de la academia ───────────────────────────────────────────
// Lo que se entrega siempre: la guía que acompaña al vídeo de YouTube del que
// viene la persona. Vive en la parte gratuita de la academia («AI para todo»,
// academy.helmm.app), y cada vídeo enlaza a la landing con la suya:
//   s4sf.net/helm-academy?guia=que-ningun-lead-se-enfrie
// Sin ?guia= (o con algo que no tenga forma de enlace de guía) se abre la parte
// gratuita entera. Al guardar el lead, el servidor (api/leads.js · school) le
// pide a la academia un enlace de entrada para esa persona: así entra en su
// guía sin crear otra cuenta.
export const ACADEMIA = {
  web: 'https://academy.helmm.app',
  todo: '/aiparatodo',   // sin guía concreta: la parte gratuita entera
}

// Los títulos de las guías que hay hoy, para decirle cuál es la suya. Una guía
// nueva funciona sin estar aquí (se le dice «la guía», sin título): el enlace
// lo decide la academia, no esta lista.
export const GUIAS = {
  '30-dias-de-contenido-en-una-tarde': '30 días de contenido en una tarde',
  'que-ningun-lead-se-enfrie': 'Que ningún lead se enfríe',
  'responde-en-2-minutos-sin-sonar-a-robot': 'Responde en 2 minutos sin sonar a robot',
  'saca-el-negocio-de-tu-cabeza': 'Saca el negocio de tu cabeza',
  'facturado-no-es-cobrado': 'Facturado no es cobrado',
  'vende-ia-sin-meterte-en-lios': 'Vende IA sin meterte en líos',
  'mis-8-no-negociables-con-claude': 'Mis 8 no negociables con Claude',
  'los-mods-de-claude': 'Los Mods de Claude',
}

// El enlace de entrada que da la academia es de un solo uso y caduca a los 15
// minutos. Aquí se le da uno menos: pasado ese rato (o ya usado) el botón lleva
// a la dirección normal de la guía, que nunca caduca.
export const ENTRADA_MINUTOS = 14

// ── El vídeo (la VSL) ────────────────────────────────────────────────────────
// Uno de los dos:
//   · youtube: el enlace o el id de un vídeo de YouTube (mejor «oculto»: no
//     sale en el canal ni en el buscador, pero se ve con el enlace).
//   · mp4: un archivo propio, p. ej. '/helm-academy/vsl.mp4' (en public/).
// Con los dos vacíos, la pantalla no enseña el bloque del vídeo.
export const VSL = {
  youtube: '',
  mp4: '',
  poster: '',        // la portada antes del play; con YouTube, si falta, la del propio vídeo
  minutos: 7,
  titulo: 'Cómo dirigir la IA y vivir de ello',
  gancho: 'El sistema, paso a paso y sin humo. Míralo entero: es lo que vamos a usar para preparar tu ruta.',
}

// ── Un PDF propio (opcional) ─────────────────────────────────────────────────
// La guía ya lleva su PDF dentro de la academia. Esto es por si además se quiere
// dar un archivo desde aquí: href es su ruta, p. ej. '/helm-academy/guia.pdf'
// (en public/), y sale como enlace de descarga debajo del botón de la guía.
// Vacío = no sale.
export const PDF = {
  href: '',
}

// ── El contacto de después ───────────────────────────────────────────────────
// A quien se apunta se le dice que alguien del equipo le escribe en `plazo`
// por `canal`, y para qué (`motivo`). El para qué tiene que ser verdad y tener
// sentido con lo que acaba de pedir: nos ha contado a qué se quiere dedicar,
// cuánto quiere ganar y si ya usa la IA, así que lo natural es devolverle algo
// hecho con eso — su ruta de inicio. No suena a venta porque no lo es: es lo
// primero que hace el equipo en ese mensaje (docs/helm-academy-embudo.md).
// Esto lo leen la pantalla, el correo de confirmación y el aviso al equipo
// (api/leads.js · school): si se cambia el motivo, se cambia aquí y en ese
// documento, nada más.
const HORAS = 24
export const CONTACTO = {
  horas: HORAS,               // el plazo, para la fecha límite que ve el equipo
  plazo: `${HORAS} horas`,    // y como se le dice a la persona
  canal: 'WhatsApp',
  equipo: 'Silvestre AI',
  motivo: 'tu ruta de inicio',
  // Lo que se le explica, en una frase.
  explica: 'Con lo que nos has contado te preparamos tu ruta de inicio: por dónde empezar según tu punto de partida y qué te puedes saltar.',
  // El número desde el que escribe el equipo, para que lo guarde y no le entre
  // como desconocido (p. ej. '+34 600 000 000'). Vacío = no se enseña.
  numero: '',
}

// La comunidad (Skool) deja de ser el siguiente paso: ya no se redirige allí.
// Queda como enlace discreto al final («mientras esperas»), porque la bio y la
// cabecera de la landing siguen diciendo «comunidad gratis». false = se quita,
// y el acceso lo da el equipo en su mensaje.
export const SKOOL_EN_GRACIAS = true

// Las líneas que la pantalla deja en la ficha del CRM. El servidor solo admite
// estas (api/leads.js · NOTAS las importa de aquí).
export const NOTA_VIDEO = 'HELM Academy · empezó a ver el vídeo'
export const NOTA_ABRE = 'HELM Academy · abrió la guía en la academia'
export const NOTA_GUIA = 'HELM Academy · descargó la guía (PDF)'

// ── Piezas sin pantalla (para poder probarlas solas) ─────────────────────────

// La guía que viene en ?guia=, si tiene forma de enlace de guía (minúsculas,
// números y guiones); null si no. Es lo único que se deja pasar a la academia,
// a la ficha del CRM y a las direcciones que se montan con ella.
const RE_GUIA = /^[a-z0-9-]{3,80}$/
export const guiaDe = (v) => (typeof v === 'string' && RE_GUIA.test(v) ? v : null)
export const tituloGuia = (v) => (guiaDe(v) && Object.hasOwn(GUIAS, v) ? GUIAS[v] : null)

// A dónde va dentro de la academia, y su dirección normal (la que no caduca).
export const destinoAcademia = (guia) => (guiaDe(guia) ? `/guia/${guia}` : ACADEMIA.todo)
export const enlaceAcademia = (guia) => `${ACADEMIA.web}${destinoAcademia(guia)}`

// La pantalla de gracias de esa guía: así el correo y el atajo «vuelve a lo
// tuyo» llevan a la suya aunque el navegador no recuerde nada.
export const rutaGracias = (guia) => (guiaDe(guia) ? `${RUTA_GRACIAS}?guia=${guia}` : RUTA_GRACIAS)

// El id de un vídeo de YouTube, venga como id suelto o como cualquiera de sus
// enlaces (watch?v=, youtu.be/, /embed/, /shorts/, /live/). null si no lo es.
export function idYoutube(v) {
  const s = String(v || '').trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/)
  return m ? m[1] : null
}

// Qué vídeo hay que pintar: { tipo: 'youtube', id } | { tipo: 'mp4', src } | null.
export function videoDe(vsl = VSL) {
  const id = idYoutube(vsl.youtube)
  if (id) return { tipo: 'youtube', id }
  const src = String(vsl.mp4 || '').trim()
  return src ? { tipo: 'mp4', src } : null
}

// Lo que se entrega, en palabras: «la guía» (la del vídeo del que viene) o «las
// guías» (sin una concreta: la parte gratuita entera), y delante «el vídeo» si
// está subido. De aquí salen la promesa del formulario y el titular de la
// pantalla de gracias: nunca se promete lo que no está.
export function queEntrega(guia, vsl = VSL) {
  return [videoDe(vsl) && 'el vídeo', guiaDe(guia) ? 'la guía' : 'las guías'].filter(Boolean).join(' y ')
}

// El reproductor de YouTube sin cookies hasta que se le da al play.
export const urlYoutube = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`
export const portadaYoutube = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

// Las tres últimas cifras del teléfono: para decirle a qué número se le va a
// escribir sin enseñarlo entero en pantalla. '' si no hay con qué.
export function finalTelefono(tel) {
  const cifras = String(tel || '').replace(/\D/g, '')
  return cifras.length >= 6 ? cifras.slice(-3) : ''
}

// ── Lo que recuerda este navegador ───────────────────────────────────────────
// Solo lo justo para pintar la pantalla de gracias al volver (el nombre de
// pila, el final del teléfono, las tres respuestas y qué guía pidió). Lo demás
// está en el CRM. El enlace de entrada a la academia también, mientras vale:
// es de un solo uso y de unos minutos, así que se borra al usarlo.
const LLAVE = 's4sf.helmacademy.entrega.v1'

// `academia` es lo que devuelve el alta (api/leads.js · school): { url, unUso }.
export function guardaEntrega(f, { guia, academia } = {}) {
  const entrega = {
    nombre: String(f.nombre || '').trim().split(/\s+/)[0].slice(0, 40),
    tel: finalTelefono(f.telefono),
    quiero: String(f.quiero || '').slice(0, 120),
    ingreso: String(f.ingreso || '').slice(0, 40),
    usa_ia: String(f.usa_ia || '').slice(0, 40),
    guia: guiaDe(guia) || '',
    at: new Date().toISOString(),
  }
  if (academia?.unUso && enLaAcademia(academia.url)) {
    entrega.entrada = { url: academia.url, hasta: new Date(Date.now() + ENTRADA_MINUTOS * 60_000).toISOString() }
  }
  try { localStorage.setItem(LLAVE, JSON.stringify(entrega)) } catch { /* incógnito */ }
  return entrega
}

export function leeEntrega() {
  try {
    const e = JSON.parse(localStorage.getItem(LLAVE) || 'null')
    return e && typeof e === 'object' && e.at ? e : null
  } catch { return null }
}

// Solo se abre un enlace que sea de la academia, venga de donde venga.
function enLaAcademia(url) {
  try { return new URL(String(url || '')).origin === ACADEMIA.web } catch { return false }
}

// El enlace de entrada, si lo hay y todavía vale; null si no.
export function entradaViva(entrega) {
  const e = entrega?.entrada
  return e && enLaAcademia(e.url) && Date.parse(e.hasta) > Date.now() ? e.url : null
}

// Ya se ha usado: fuera del navegador. La próxima vez, la dirección normal.
export function gastaEntrada() {
  const e = leeEntrega()
  if (!e?.entrada) return
  delete e.entrada
  try { localStorage.setItem(LLAVE, JSON.stringify(e)) } catch { /* incógnito */ }
}
