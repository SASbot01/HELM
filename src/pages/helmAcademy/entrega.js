// HELM ACADEMY — a dónde lleva la landing (/helm-academy) y qué se le promete a
// quien entra.
//
// El embudo: vídeo de YouTube → /helm-academy?guia=… (la landing) → el quiz de
// la academia (academy.helmm.app): unas preguntas y sus datos de contacto → entra
// gratis en «AI para todo» con «Tu plan» (la guía por la que empezar) y el aviso
// de que en menos de 24 horas le escribe alguien del equipo.
//
// La landing ya no tiene formulario: los datos se dejan en el quiz, y la
// academia manda cada alta al CRM desde su servidor (api/leads.js · school).
//
// Aquí va, junto y arriba, lo que se cambia cada dos por tres: las guías, el
// vídeo de la landing y lo que se promete del contacto. La página
// (HelmAcademy.jsx) solo lo pinta.

// Este fichero no toca el navegador al cargarse: también lo importa el servidor
// (api/leads.js), para que la promesa se escriba en un solo sitio.

// ── La academia y su quiz ────────────────────────────────────────────────────
// Sin cuenta, la parte gratuita de la academia es el quiz de entrada. Cada vídeo
// enlaza a la landing con su guía:
//   s4sf.net/helm-academy?guia=que-ningun-lead-se-enfrie
// y el botón lleva a esa guía en la academia, que enseña su título sobre el quiz
// y la abre al terminarlo. Sin ?guia= (o con algo que no tenga forma de enlace
// de guía) lleva a la parte gratuita entera.
export const ACADEMIA = {
  web: 'https://academy.helmm.app',
  todo: '/aiparatodo',   // sin guía concreta: la parte gratuita entera
  preguntas: 'seis',     // las que tiene el quiz, como se le dice a la persona
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

// Lo que se le pasa a la academia en la dirección: de qué campaña viene, y nada
// más. La academia lo lee al llegar y lo manda al CRM con el alta. Datos
// personales, ninguno: esos se dejan en el quiz.
export const CAMPANA = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid']

// ── El vídeo de la landing (opcional) ────────────────────────────────────────
// Un vídeo corto encima del botón. Uno de los dos:
//   · youtube: el enlace o el id de un vídeo de YouTube (mejor «oculto»: no
//     sale en el canal ni en el buscador, pero se ve con el enlace).
//   · mp4: un archivo propio, p. ej. '/helm-academy/vsl.mp4' (en public/).
// Con los dos vacíos, la landing no enseña el vídeo.
export const VSL = {
  youtube: '',
  mp4: '',
  poster: '',        // la portada antes del play; con YouTube, si falta, la del propio vídeo
  minutos: 7,
  titulo: 'Cómo dirigir la IA y vivir de ello',
}

// ── El contacto de después ───────────────────────────────────────────────────
// A quien entra se le dice que alguien del equipo le escribe en `plazo` por
// `canal`, y para qué (`para`). Se lo dicen la landing, el quiz de la academia y
// su «Tu plan», así que las tres cosas tienen que decir lo mismo: si se cambia
// aquí, se cambia también en la academia. No suena a venta porque no lo es: el
// primer mensaje es para ayudarle a empezar (docs/helm-academy-embudo.md).
// Esto lo leen la landing y el aviso al equipo (api/leads.js · school).
const HORAS = 24
export const CONTACTO = {
  horas: HORAS,               // el plazo, para la fecha límite que ve el equipo
  plazo: `${HORAS} horas`,    // y como se le dice a la persona
  canal: 'WhatsApp',
  equipo: 'Silvestre AI',
  para: 'para ayudarte con el primer paso',
}

// ── Piezas sin pantalla (para poder probarlas solas) ─────────────────────────

// La guía que viene en ?guia=, si tiene forma de enlace de guía (minúsculas,
// números y guiones); null si no. Es lo único que se deja pasar a la dirección
// de la academia y a la ficha del CRM.
const RE_GUIA = /^[a-z0-9-]{3,80}$/
export const guiaDe = (v) => (typeof v === 'string' && RE_GUIA.test(v) ? v : null)
export const tituloGuia = (v) => (guiaDe(v) && Object.hasOwn(GUIAS, v) ? GUIAS[v] : null)

// A dónde va dentro de la academia, y su dirección.
export const destinoAcademia = (guia) => (guiaDe(guia) ? `/guia/${guia}` : ACADEMIA.todo)
export const enlaceAcademia = (guia) => `${ACADEMIA.web}${destinoAcademia(guia)}`

// La dirección del botón: el quiz (o la guía, que lo lleva delante) con la
// campaña de la visita. `campana` es un objeto con lo que traía la landing; solo
// pasan las claves de CAMPANA, recortadas.
export function enlaceQuiz(guia, campana = {}) {
  const url = new URL(enlaceAcademia(guia))
  for (const k of CAMPANA) {
    const v = typeof campana?.[k] === 'string' ? campana[k].trim().slice(0, 200) : ''
    if (v) url.searchParams.set(k, v)
  }
  return url.href
}

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

// El reproductor de YouTube sin cookies hasta que se le da al play.
export const urlYoutube = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`
export const portadaYoutube = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
