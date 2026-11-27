// HELM ACADEMY — lo que se entrega al dejar los datos en /helm-academy y lo que
// se le promete a la persona después (la pantalla /helm-academy/gracias).
//
// El embudo: vídeo de YouTube → /helm-academy (el formulario) → en el momento,
// el lead magnet (las dos cosas: un vídeo de 5–7 min y una guía en PDF) y el
// aviso de que en menos de 24 horas le escribe alguien del equipo. Lo
// importante de esa pantalla es que la persona sepa cuál es su siguiente paso:
// esperar ese mensaje.
//
// Aquí va, junto y arriba, lo que se cambia cada dos por tres: el vídeo, la
// guía y el motivo del contacto. La pantalla (Gracias.jsx) solo lo pinta.

// Este fichero no toca el navegador al cargarse: también lo importa el servidor
// (api/leads.js), para que la promesa se escriba en un solo sitio.

// La pantalla de gracias. También la enlaza el correo de confirmación.
export const RUTA_GRACIAS = '/helm-academy/gracias'

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

// ── La guía en PDF ───────────────────────────────────────────────────────────
// href: la ruta del archivo, p. ej. '/helm-academy/guia.pdf' (en public/).
// Vacío = la pantalla no enseña el bloque de la guía.
export const PDF = {
  href: '',
  titulo: 'La guía en PDF',
  detalle: 'Lo del vídeo, por escrito y con los pasos para aplicarlo. Para tenerla a mano.',
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
export const NOTA_GUIA = 'HELM Academy · descargó la guía (PDF)'

// ── Piezas sin pantalla (para poder probarlas solas) ─────────────────────────

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

// Lo que se entrega, en palabras: «el vídeo y la guía», «el vídeo», «la guía»
// o '' si aún no hay nada subido. De aquí salen la promesa del formulario y el
// titular de la pantalla de gracias: nunca se promete lo que no está.
export function queEntrega(vsl = VSL, pdf = PDF) {
  return [videoDe(vsl) && 'el vídeo', pdf.href && 'la guía'].filter(Boolean).join(' y ')
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
// pila, el final del teléfono y las tres respuestas). Lo demás está en el CRM.
const LLAVE = 's4sf.helmacademy.entrega.v1'

export function guardaEntrega(f) {
  const entrega = {
    nombre: String(f.nombre || '').trim().split(/\s+/)[0].slice(0, 40),
    tel: finalTelefono(f.telefono),
    quiero: String(f.quiero || '').slice(0, 120),
    ingreso: String(f.ingreso || '').slice(0, 40),
    usa_ia: String(f.usa_ia || '').slice(0, 40),
    at: new Date().toISOString(),
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
