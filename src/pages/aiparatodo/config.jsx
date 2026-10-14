// AI para todo — s4sf.net/aiparatodo, la comunidad de IA de Alex Silvestre,
// como configuración del motor de las comunidades (src/pages/comunidad/).
//
// El contenido sigue en sus archivos (contenido.js, guia/, skills/,
// noNegociables.js, guiaModos.js); aquí se dice cómo se pinta:
// marca, textos, puerta, cobro, API y nombres de las métricas.
//
// Puerta: solo pago. Desde octubre de 2026 el acceso es un muro de pago (1,97
// €/mes de por vida, rebajado de 12 €/mes). El Payment Link de Stripe vuelve a
// /aiparatodo?pago=ok, y eso desbloquea el acceso. Es un desbloqueo simple:
// para verificarlo de verdad haría falta un webhook de Stripe.
import {
  Sparkles, Newspaper, BookOpen, Users, Blocks, BrainCircuit, Cpu, ShieldAlert,
} from 'lucide-react'
import {
  FUNDADOR, SECCIONES, hilosDe, postPorSlug, CAPITULOS, capituloPorSlug, NN_HILO,
} from './contenido.js'
import { NN_PORTADA_3D, NN_PUNTOS } from './noNegociables.js'
import { MODOS_HILO, MODOS_PORTADA_3D, MODOS_GANCHO, MODOS_INDICE } from './guiaModos.js'
import { PIPELINE_COMUNIDAD, PIPELINE_LEAD_MAGNET } from './crm.js'
import {
  Fondo, BloqueHelm, TrasHilo, IndiceNN, CuerpoNoNegociables, IndiceModos, CuerpoGuiaModos, CuerpoPost,
} from './piezas.jsx'

export default {
  clave: 'aiparatodo',            // las métricas: aiparatodo, aiparatodo-foro, -hilo, -diario, -articulo
  cta: 'aip',                     // y los clics: aip-creador, aip-noticia-fuente…
  nombre: 'AI para todo',
  ruta: '/aiparatodo',
  api: '/api/aiparatodo',
  clase: '',
  // v3: desde el muro de pago. Se subió desde v2 para invalidar los desbloqueos
  // gratuitos antiguos: quien entró gratis vuelve a ver el muro.
  llave: 's4sf.aiparatodo.v3',
  privacidad: '/privacidad',
  cabecera: {
    titulo: 'AI para todo — la comunidad de IA de Alex Silvestre',
    descripcion: 'Skills para Claude, noticias de cada día, comunidad y la guía completa de Claude, con los 7 tipos de agentes. En español, para miembros.',
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  },
  Fondo,
  logo: <><span className="aip-logo-marca">AI</span><span>para todo</span></>,
  fundador: FUNDADOR,

  secciones: SECCIONES,
  iconos: { skills: Sparkles, news: Newspaper, comunidad: Users, guia: BookOpen },
  portadasHilo: { skills: Sparkles, mcp: Blocks, guia: BookOpen, comunidad: Users },
  iconosTipo: { mcp: Blocks },
  hilosDe,
  capitulos: CAPITULOS,
  capituloPorSlug,
  posts: {
    seccion: 'skills',
    porSlug: postPorSlug,
    Cuerpo: CuerpoPost,
    kicker: (p) => ` · ${p.skills.length} ${p.tipo === 'repo' ? 'apartados' : 'skills'} · ${p.lectura}`,
  },
  TrasHilo,

  // Las guías en PDF: su hilo, su puerta (embudo «Lead magnet») y su cuerpo.
  pdfs: [
    {
      hilo: MODOS_HILO, principal: true, portada3d: MODOS_PORTADA_3D, alt: 'La guía «Los Mods de Claude»',
      gancho: MODOS_GANCHO, kicker: `Guía en PDF · guía principal · ${MODOS_INDICE.length} puntos`,
      Indice: IndiceModos, Cuerpo: CuerpoGuiaModos,
      puerta: {
        pipeline: PIPELINE_LEAD_MAGNET, nota: 'pidió la guía Los Mods de Claude (PDF)', titulo: 'Descárgate la guía',
        texto: 'Cuatro datos y es tuya, con todos los prompts, junto con todos los hilos de AI para todo.', boton: 'Descargar',
      },
    },
    {
      hilo: NN_HILO, principal: false, portada3d: NN_PORTADA_3D, alt: 'La guía «Mis 8 no negociables con Claude»',
      gancho: 'Mis 8 no negociables con Claude', kicker: `Guía en PDF · ${NN_PUNTOS.length} puntos`,
      Indice: IndiceNN, Cuerpo: CuerpoNoNegociables,
      puerta: {
        pipeline: PIPELINE_LEAD_MAGNET, nota: 'pidió la guía Mis 8 no negociables (PDF)', titulo: 'Descárgate la guía',
        texto: 'Cuatro datos y es tuya, junto con todos los hilos de AI para todo.', boton: 'Descargar',
      },
    },
  ],

  portada: {
    titulo: 'IA sin humo.',
    boton: 'Sigue a nuestro creador',
    sub: (
      <>
        Skills para Claude, las noticias del día que importan, una comunidad para preguntar y enseñar lo que
        montas, y la guía completa de Claude, con los 7 tipos de agentes. En español. Hazte miembro por
        <b> 1,97 €/mes</b> y se te abre todo: hilos, capítulos y noticias.
      </>
    ),
    despues: <BloqueHelm donde="portada" />,
  },
  textos: {
    navCta: 'Sigue al creador',
    zonaNews: 'Tres piezas al día · y las breves',
    foroVacio: { titulo: 'Los primeros hilos están en camino', texto: 'Sigue a nuestro creador para enterarte cuando se abran.' },
    puertaArticulo: 'Cuatro datos, una sola vez, y se abren el diario entero, los hilos de skills y la guía completa de Claude.',
  },
  pie: {
    marca: 'AI para todo',
    autor: FUNDADOR.nombre,
    enlaces: [
      { texto: 'Instagram', href: FUNDADOR.instagram, fuera: true },
      { texto: 'YouTube', href: FUNDADOR.youtube, fuera: true },
      { texto: 'Privacidad', href: '/privacidad' },
    ],
  },

  news: {
    nombre: 'El diario de AI para todo',
    sub: 'IA, tecnología y ciberseguridad. Tres piezas al día, a las 8:00, las 14:00 y las 20:00, investigadas en las fuentes originales y revisadas dato a dato.',
    vacio: {
      titulo: 'La primera edición está en la imprenta',
      texto: 'Cada día salen tres: a las 8:00, las 14:00 y las 20:00. Mientras tanto, las breves de la mañana, aquí abajo.',
    },
    ediciones: [{ clave: 'manana', desde: 0 }, { clave: 'mediodia', desde: 14 }, { clave: 'tarde', desde: 20 }],
    iconos: { ia: BrainCircuit, tecnologia: Cpu, ciberseguridad: ShieldAlert },
  },

  crm: { embudoComunidad: PIPELINE_COMUNIDAD },
  puerta: { datos: null },
  cobro: {
    link: 'https://buy.stripe.com/test_7sY3cu5aratnexD1eM5kk01',
    titulo: 'Acceso a AI para todo',
    incluye: <>Con el acceso se abren <b>todos los hilos</b>, los <b>capítulos de la guía</b> y las <b>noticias</b>. Un solo pago al mes.</>,
    precio: { ahora: '1,97 €', periodo: '/mes', antes: '12 €/mes', nota: 'precio de por vida' },
    urgencia: <><b>⏳ En 30 días sube a 12 €/mes</b> para los nuevos. Entra ahora y te quedas en <b>1,97 €/mes para siempre</b>.</>,
    boton: 'Pagar y acceder',
    legal: 'Suscripción mensual, cancela cuando quieras. Pago seguro con Stripe.',
  },
}
