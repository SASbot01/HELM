// Filmmaking para todo — s4sf.net/filmmakingparatodo, la comunidad de Detrás
// de Cámara (Abel Casal Díaz), como configuración del motor de las
// comunidades (src/pages/comunidad/).
//
// Las mismas piezas que AI para todo —portada, secciones con temas e hilos,
// puerta, alta en el CRM, guía, noticias y diario— con su marca, sus textos y
// sus fuentes. HELM sale solo en su sección («Contenido con HELM»), como el
// sistema con el que Detrás de Cámara crea su contenido.
//
// Puerta: gratis por ahora (decidido el 13-10-2026). Pide los cuatro datos
// una vez, entran en el CRM del perfil detras-de-camra y se abre todo.
//
// Para pasar a pago: COBRO_ACTIVO = true. El muro sale después de los datos,
// con el correo ya puesto en Stripe. OJO con el enlace: el Payment Link de AI
// para todo vuelve a /aiparatodo?pago=ok, así que con ese mismo enlace quien
// pague abriría AI para todo y no esta, y además el producto es «Acceso AI
// para todo» (comprobado el 13/10/2026 en Stripe, modo test, cuenta «taller»).
// Esta comunidad necesita su producto «Acceso Detrás de Cámara» y un Payment
// Link que vuelva a /filmmakingparatodo?pago=ok (VITE_FMPT_PAGO_LINK).
import { BookOpen, Users, Newspaper, FolderOpen, Camera, Aperture, Clapperboard, Film, Workflow } from 'lucide-react'
import {
  FUNDADOR, SECCIONES, hilosDe, CAPITULOS, capituloPorSlug, PDFS,
} from './contenido.js'
import { Fondo, ClaseGratis, TrasHilo } from './piezas.jsx'

const COBRO_ACTIVO = false
const COBRO = {
  // El enlace de AI para todo mientras no haya uno propio (ver arriba).
  link: import.meta.env.VITE_FMPT_PAGO_LINK || 'https://buy.stripe.com/test_7sY3cu5aratnexD1eM5kk01',
  titulo: 'Acceso a Filmmaking para todo',
  incluye: <>Con el acceso se abren <b>todos los recursos</b>, los <b>capítulos de la guía</b> y las <b>noticias</b>. Un solo pago al mes.</>,
  precio: { ahora: 'TODO-ABEL €', periodo: '/mes' },   // TODO-ABEL: el precio
  boton: 'Pagar y acceder',
  legal: 'Suscripción mensual, cancela cuando quieras. Pago seguro con Stripe.',
}

const PRIVACIDAD = 'https://detrasdecamara.org/privacidad'

export default {
  clave: 'filmmakingparatodo',    // las métricas: filmmakingparatodo, -foro, -hilo, -diario, -articulo
  cta: 'fmpt',                    // y los clics: fmpt-creador, fmpt-clase, fmpt-noticia-fuente…
  nombre: 'Filmmaking para todo',
  ruta: '/filmmakingparatodo',
  api: '/api/comunidad?c=filmmakingparatodo',
  clase: 'ddc',
  llave: 's4sf.filmmakingparatodo.v1',
  privacidad: PRIVACIDAD,
  cabecera: {
    titulo: 'Filmmaking para todo — la comunidad de Detrás de Cámara',
    descripcion: 'Recursos para tu trabajo, las noticias de cámaras, equipo y posproducción de cada día, una comunidad para preguntar y la guía. Para filmmakers y videógrafos. En español.',
    imagen: '/filmmakingparatodo/og.jpg',   // TODO-ABEL: la imagen para compartir (1200×630)
    colorBarra: '#0A0A0D',
  },
  Fondo,
  // TODO-ABEL: confirmar el nombre y la marca. Va con la tipografía y el
  // dorado de detrasdecamara.org («Detrás de Cámara» con el dorado al final).
  logo: <><span>Filmmaking</span><span className="ddc-dorado">para todo</span></>,
  fundador: FUNDADOR,

  secciones: SECCIONES,
  iconos: { recursos: FolderOpen, news: Newspaper, comunidad: Users, guia: BookOpen, contenido: Workflow },
  portadasHilo: { recursos: FolderOpen, guia: BookOpen, comunidad: Users, contenido: Workflow },
  hilosDe,
  capitulos: CAPITULOS,
  capituloPorSlug,
  posts: null,
  pdfs: PDFS,
  TrasHilo,

  portada: {
    // «Vive del filmmaking», el lema de detrasdecamara.org.
    titulo: 'Vive del filmmaking.',
    antes: <p className="aip-kicker ddc-sello">Detrás de Cámara · la comunidad</p>,
    boton: 'Sigue a Abel',
    secundario: <ClaseGratis />,
    sub: (
      <>
        Recursos para tu trabajo, las noticias del día que le importan a un filmmaker, una comunidad para
        preguntar y enseñar lo que ruedas, y la guía. En español. Deja tus datos una vez y <b>se te abre todo</b>.
      </>
    ),
  },
  textos: {
    navCta: 'Sigue a Abel',
    zonaNews: 'Una pieza al día · y las breves',
    foroVacio: { titulo: 'Los primeros hilos están en camino', texto: 'Sigue a Abel para enterarte cuando se abran.' },
    puertaArticulo: 'Cuatro datos, una sola vez, y se abren el diario entero, los recursos y la guía.',
  },
  pie: {
    marca: 'Filmmaking para todo · Detrás de Cámara',
    autor: FUNDADOR.nombre,
    enlaces: [
      { texto: 'Instagram', href: FUNDADOR.instagram, fuera: true },
      { texto: 'Escuela', href: FUNDADOR.escuela, fuera: true },
      { texto: 'Web', href: FUNDADOR.web, fuera: true },
      { texto: 'Privacidad', href: PRIVACIDAD, fuera: true },
    ],
  },

  news: {
    nombre: 'El diario de Filmmaking para todo',
    sub: 'Sony, equipo, filmmaking y posproducción. Una pieza al día, a las 9:00, investigada en las fuentes originales y revisada dato a dato, y las breves de la mañana.',
    vacio: {
      titulo: 'La primera edición está en la imprenta',
      texto: 'Cada día sale una, a las 9:00. Mientras tanto, las breves de la mañana, aquí abajo.',
    },
    ediciones: [{ clave: 'manana', desde: 0 }],
    iconos: { sony: Camera, equipo: Aperture, filmmaking: Clapperboard, postproduccion: Film },
  },

  // Los embudos los crea migrations/103_detrasdecamara_embudos_comunidad.sql en el perfil
  // detras-de-camra. Las listas de la puerta tienen que ser las mismas que las
  // de la comunidad en el servidor (api/_lib/comunidades.js).
  crm: { embudoComunidad: 'Página de inicio' },
  puerta: {
    datos: {
      titulo: 'Deja tus datos para leerlo',
      texto: 'Una sola vez: con estos cuatro datos se abren todos los recursos, los capítulos de la guía y las noticias. Te avisamos cuando haya nuevos.',
      boton: 'Leer',
      profesiones: {
        freelance: 'Filmmaker freelance',
        bodas: 'Videógrafo de bodas',
        productora: 'En una productora',
        empezando: 'Estoy empezando',
        otra: 'Otra cosa',
      },
      // TODO-ABEL: tramos propuestos; confirmar con Abel.
      ingresos: {
        menos_500: 'Menos de 500 €/mes',
        de_500_a_1500: 'De 500 a 1.500 €/mes',
        de_1500_a_3000: 'De 1.500 a 3.000 €/mes',
        mas_3000: 'Más de 3.000 €/mes',
      },
      // TODO-ABEL: que su política de privacidad cubra este alta.
      legal: <>Usamos tus datos solo para enviarte contenido de Filmmaking para todo y Detrás de Cámara. Puedes darte de baja cuando quieras. <a href={PRIVACIDAD} target="_blank" rel="noopener noreferrer">Privacidad</a></>,
    },
  },
  cobro: COBRO_ACTIVO ? COBRO : null,
}
