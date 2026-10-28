// Filmmaking para todo — el contenido de la comunidad de Detrás de Cámara
// (Abel Casal Díaz), para filmmakers y videógrafos freelance que quieren
// trabajar con clientes que pagan.
//
//   · Recursos: cada recurso es un archivo de ./recursos/ (plantillas, LUTs,
//     checklists…). Añadir uno es añadir un archivo: se carga solo. Usa los
//     mismos bloques que un capítulo, más `descarga` para el archivo.
//   · Guía: cada capítulo es un archivo de ./guia/ (NN-slug.js, con la forma
//     de src/pages/aiparatodo/guia/01-empieza-aqui.js). Mientras un capítulo
//     del índice no tenga archivo, sale como «pronto».
//   · La guía gratuita en PDF: GUIA_PDF, abajo. Mientras no tenga archivo,
//     sale como «pronto».
//   · News: no está aquí. Es el diario y las breves del perfil detras-de-camra,
//     que se piden a /api/comunidad?c=filmmakingparatodo.
//
//   · Contenido con HELM: el sistema con el que Detrás de Cámara crea su
//     contenido, en ./contenidoHelm.js.
//
// Lo marcado TODO-ABEL falta de Abel: no se inventa.
import CONTENIDO_HELM from './contenidoHelm.js'

export const FUNDADOR = {
  nombre: 'Abel Casal Díaz',
  instagram: 'https://www.instagram.com/abelcasaldiaz',
  handle: '@abelcasaldiaz',
  escuela: 'https://www.instagram.com/abelcasal.detrasdecamara',
  web: 'https://detrasdecamara.org',
  clase: 'https://detrasdecamara.org/valor',
}

// Las secciones. Todas se recorren sin dejar nada: se ven los temas y los
// hilos, como un foro. Lo que pide los datos es LEER un hilo.
// TODO-ABEL: revisar los textos de cada sección.
export const SECCIONES = [
  {
    key: 'recursos', titulo: 'Recursos', desc: 'Plantillas, LUTs, checklists y lo que de verdad se usa en un rodaje. Para descargar y usar con tus clientes.',
    temas: [
      { key: 'plantillas', nombre: 'Plantillas', desc: 'Presupuestos, contratos y briefing' },
      { key: 'color', nombre: 'Color y LUTs', desc: 'Looks, LUTs y cómo dejar el color listo para entregar' },
      { key: 'audio', nombre: 'Audio y música', desc: 'Sonido directo, música y licencias' },
      { key: 'checklists', nombre: 'Checklists de rodaje', desc: 'Lo que no se puede olvidar antes, durante y después' },
      { key: 'equipo', nombre: 'Equipo', desc: 'Con qué se rueda y qué merece la pena comprar' },
    ],
  },
  {
    key: 'news', titulo: 'News', desc: 'El diario del filmmaker: Sony, equipo, filmmaking y posproducción. Una pieza al día, investigada y contrastada, y las breves de cada mañana.',
    // Los temas del diario y de las breves (los del perfil detras-de-camra en
    // api/_lib/noticias-perfiles.js).
    temas: [
      { key: 'sony', nombre: 'Sony', desc: 'Cámaras Alpha, FX, Cinema Line y firmware' },
      { key: 'equipo', nombre: 'Equipo', desc: 'Otras cámaras, ópticas, drones, luz y audio' },
      { key: 'filmmaking', nombre: 'Filmmaking', desc: 'Industria, técnica, rodajes y tendencias' },
      { key: 'postproduccion', nombre: 'Posproducción', desc: 'DaVinci Resolve, Premiere, Final Cut e IA aplicada al vídeo' },
    ],
  },
  {
    key: 'comunidad', titulo: 'Comunidad', desc: 'Preséntate, pregunta y enseña lo que has rodado. Entre todos.',
    temas: [
      { key: 'presentate', nombre: 'Preséntate', desc: 'Quién eres y qué ruedas' },
      { key: 'dudas', nombre: 'Dudas', desc: 'Pregunta lo que sea' },
      { key: 'rodado', nombre: 'Lo que he rodado', desc: 'Enseña tus piezas y lo que te ha funcionado' },
    ],
  },
  {
    key: 'guia', titulo: 'La guía', desc: 'Capítulo a capítulo, y una guía gratuita en PDF.',
    temas: [
      { key: 'pdf', nombre: 'Guía en PDF', desc: 'La guía gratuita, para descargar' },
      { key: 'capitulos', nombre: 'Capítulos', desc: 'La guía, en orden' },
    ],
  },
  {
    key: 'contenido', titulo: 'Contenido con HELM', desc: 'El sistema con el que Detrás de Cámara crea su contenido: referencias, guiones, calendario y Drive. Para que lo uses con tu marca y con tus clientes.',
    temas: [
      { key: 'sistema', nombre: 'El sistema', desc: 'De los creadores de referencia al Drive' },
    ],
  },
]
export const seccionPorClave = (k) => SECCIONES.find(s => s.key === k)

// ── La guía ─────────────────────────────────────────────────────────────────
// Los capítulos, en orden. El texto de cada uno está en ./guia/NN-slug.js; el
// que todavía no tenga archivo sale como «pronto».
// TODO-ABEL: los títulos y el orden de los capítulos.
const TEXTOS_GUIA = Object.values(import.meta.glob('./guia/*.js', { eager: true, import: 'default' }))
export const CAPITULOS = [
  { slug: 'capitulo-1', titulo: 'TODO-ABEL · Capítulo 1' },
  { slug: 'capitulo-2', titulo: 'TODO-ABEL · Capítulo 2' },
  { slug: 'capitulo-3', titulo: 'TODO-ABEL · Capítulo 3' },
  { slug: 'capitulo-4', titulo: 'TODO-ABEL · Capítulo 4' },
  { slug: 'capitulo-5', titulo: 'TODO-ABEL · Capítulo 5' },
].map((c, i) => {
  const texto = TEXTOS_GUIA.find(t => t.slug === c.slug)
  return {
    ...c, n: String(i + 1).padStart(2, '0'), seccion: 'guia', tema: 'capitulos',
    resumen: texto?.resumen, lectura: texto?.lectura, fecha: texto?.fecha,
    texto: texto || null, pronto: !texto,
  }
})
export const capituloPorSlug = (slug) => CAPITULOS.find(c => c.slug === slug)

// La guía gratuita en PDF (el equivalente a los no negociables de AI para
// todo). Cuando esté, se rellena aquí y se pinta sola con las piezas genéricas
// del motor (src/pages/comunidad/GuiaPdf.jsx): el PDF y su portada 3D van en
// public/filmmakingparatodo/, y la `nota` se añade a las notas de la
// comunidad en api/_lib/comunidades.js.
// TODO-ABEL: el PDF, su título, el resumen, la portada, el índice y la intro.
export const GUIA_PDF = {
  hilo: {
    slug: 'guia-gratuita', seccion: 'guia', tema: 'pdf',
    titulo: 'TODO-ABEL · La guía gratuita en PDF',
    resumen: 'TODO-ABEL · De qué va la guía, en una o dos frases.',
    fecha: '2026-10-13', lectura: '',
  },
  archivo: null,              // '/filmmakingparatodo/<guia>.pdf'
  portada3d: null,            // '/filmmakingparatodo/<guia>-3d.webp'
  alt: 'La guía gratuita de Detrás de Cámara',
  gancho: 'TODO-ABEL · La guía gratuita en PDF',
  kicker: 'Guía en PDF',
  intro: '',
  indice: [],
  recurso: 'guia-gratuita',
  nota: 'Filmmaking para todo · descargó la guía gratuita (PDF)',
  principal: true,
  puerta: {
    pipeline: 'Lead magnet', nota: 'pidió la guía gratuita (PDF)', titulo: 'Descárgate la guía',
    texto: 'Cuatro datos y es tuya, junto con todos los hilos de Filmmaking para todo.', boton: 'Descargar',
  },
}
const PDF_LISTO = Boolean(GUIA_PDF.archivo)
export const PDFS = PDF_LISTO ? [GUIA_PDF] : []
const HILO_PDF = PDF_LISTO ? GUIA_PDF.hilo : { ...GUIA_PDF.hilo, pronto: true }

// ── Recursos ────────────────────────────────────────────────────────────────
// Los de ./recursos/, del más nuevo al más antiguo.
export const RECURSOS = Object.values(import.meta.glob('./recursos/*.js', { eager: true, import: 'default' }))
  .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || a.slug.localeCompare(b.slug))

// Los hilos de una sección (y de un tema). News no está aquí: viene de la API.
export const hilosDe = (seccion, tema) => [HILO_PDF, ...RECURSOS, ...CAPITULOS, ...CONTENIDO_HELM]
  .filter(h => h.seccion === seccion && (!tema || h.tema === tema))
