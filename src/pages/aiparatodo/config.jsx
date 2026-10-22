// AI para todo — s4sf.net/aiparatodo, la web de IA de Alex Silvestre, como
// configuración del motor de las comunidades (src/pages/comunidad/).
//
// El contenido sigue en sus archivos (contenido.js, guia/, skills/,
// noNegociables.js, guiaModos.js); aquí se dice cómo se pinta:
// marca, textos, puerta, cobro, API y nombres de las métricas.
//
// Puerta: gratis desde el 20-10-2026. Se piden nombre, correo y a qué te
// dedicas (una pulsación), una sola vez, y se abre todo; entran en el CRM de
// silvestre. Del 11 al 20 de octubre fue un muro de pago de 1,97 €/mes con un
// Payment Link de Stripe en modo de prueba (no llegó a cobrar): sigue abajo,
// en COBRO, por si se vuelve a él (COBRO_ACTIVO = true pone el muro después de
// los datos, con el correo ya puesto en Stripe).
import {
  Sparkles, Newspaper, BookOpen, Blocks, BrainCircuit, Cpu, ShieldAlert, PanelsTopLeft,
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
import { PanelWebs, FichaWeb, VitrinaWebs } from './Webs.jsx'
import { PREMIADAS } from './webs.js'

// HELM Academy (Skool): la comunidad a la que se entra antes de AI para todo.
// Lo usa el formulario de /helm-academy para redirigir allí tras recoger los datos.
export const SKOOL_URL = 'https://www.skool.com/helm-academy-4887/about'

const COBRO_ACTIVO = false
const COBRO = {
  link: 'https://buy.stripe.com/test_7sY3cu5aratnexD1eM5kk01',
  titulo: 'Acceso a AI para todo',
  incluye: <>Con el acceso se abren <b>todos los hilos</b>, los <b>capítulos de la guía</b> y las <b>noticias</b>. Un solo pago al mes.</>,
  precio: { ahora: '1,97 €', periodo: '/mes', antes: '12 €/mes', nota: 'precio de por vida' },
  urgencia: <><b>⏳ En 30 días sube a 12 €/mes</b> para los nuevos. Entra ahora y te quedas en <b>1,97 €/mes para siempre</b>.</>,
  boton: 'Pagar y acceder',
  legal: 'Suscripción mensual, cancela cuando quieras. Pago seguro con Stripe.',
}

export default {
  clave: 'aiparatodo',            // las métricas: aiparatodo, aiparatodo-foro, -hilo, -diario, -articulo
  cta: 'aip',                     // y los clics: aip-creador, aip-noticia-fuente…
  nombre: 'AI para todo',
  ruta: '/aiparatodo',
  api: '/api/aiparatodo',
  clase: '',
  // v3: la del muro de pago (11-20 oct), que se mantiene al volver a gratis:
  // quien entró por ?pago=ok sigue dentro. Quien dejó sus datos cuando era
  // gratis los tiene en v2 (6-11 oct) o en la llave sin versión (hasta el 6):
  // también valen, y se pasan a v3 la primera vez (datos.js · accesoDe).
  // v4: desde el 22-10-2026 el acceso es con aprobación (antes gratis o de
  // pago). Se corta con las anteriores a propósito: toda la audiencia del
  // periodo gratuito vuelve a pasar por la solicitud, que es lo que se quiere
  // (que pasen primero por HELM Academy). No hereda de llaves antiguas.
  llave: 's4sf.aiparatodo.v4',
  llavesAntiguas: [],
  privacidad: '/privacidad',
  cabecera: {
    titulo: 'AI para todo — IA sin humo, de Alex Silvestre',
    descripcion: `${PREMIADAS} webs premiadas (y la de GTA VI) con su prompt, skills para Claude, noticias de cada día y la guía completa de Claude, con los 7 tipos de agentes. Gratis y en español.`,
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  },
  Fondo,
  logo: <><span className="aip-logo-marca">AI</span><span>para todo</span></>,
  fundador: FUNDADOR,

  secciones: SECCIONES,
  iconos: { webs: PanelsTopLeft, skills: Sparkles, news: Newspaper, guia: BookOpen },
  portadasHilo: { webs: PanelsTopLeft, skills: Sparkles, mcp: Blocks, guia: BookOpen },
  // Las webs de referencia se pintan a su manera (Webs.jsx): un panel con la
  // portada de cada web y una ficha por web con su prompt.
  vistas: { seccion: { webs: PanelWebs }, hilo: { webs: FichaWeb } },
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
        inmediato: true, pipeline: PIPELINE_LEAD_MAGNET, nota: 'pidió la guía Los Mods de Claude (PDF)', titulo: 'Descárgate la guía',
        texto: 'Gratis: tu nombre y tu correo y es tuya, con todos los prompts, junto con las webs de referencia y todos los hilos de AI para todo.', boton: 'Descargar',
      },
    },
    {
      hilo: NN_HILO, principal: false, portada3d: NN_PORTADA_3D, alt: 'La guía «Mis 8 no negociables con Claude»',
      gancho: 'Mis 8 no negociables con Claude', kicker: `Guía en PDF · ${NN_PUNTOS.length} puntos`,
      Indice: IndiceNN, Cuerpo: CuerpoNoNegociables,
      puerta: {
        inmediato: true, pipeline: PIPELINE_LEAD_MAGNET, nota: 'pidió la guía Mis 8 no negociables (PDF)', titulo: 'Descárgate la guía',
        texto: 'Gratis: tu nombre y tu correo y es tuya, junto con las webs de referencia y todos los hilos de AI para todo.', boton: 'Descargar',
      },
    },
  ],

  portada: {
    titulo: 'IA sin humo.',
    boton: 'Sigue a nuestro creador',
    sub: (
      <>
        Webs premiadas con su prompt para que tu IA haga la tuya, skills para Claude, las noticias del día que
        importan y la guía completa de Claude, con los 7 tipos de agentes. En español y <b>gratis</b>: deja tu
        nombre y tu correo una vez y se te abre todo.
      </>
    ),
    despues: <><VitrinaWebs /><BloqueHelm donde="portada" /></>,
  },
  textos: {
    navCta: 'Sigue al creador',
    zonaNews: 'Tres piezas al día · y las breves',
    foroVacio: { titulo: 'Los primeros hilos están en camino', texto: 'Sigue a nuestro creador para enterarte cuando se abran.' },
    puertaArticulo: 'Gratis: tu nombre y tu correo, una sola vez, y se abren el diario entero, las webs de referencia con su prompt, los hilos de skills y la guía completa de Claude.',
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
  // Las listas de la puerta tienen que ser las mismas que las de la comunidad
  // en el servidor (api/_lib/comunidades.js); un test lo comprueba.
  puerta: {
    // Desde el 22-10-2026, AI para todo es acceso CON APROBACIÓN: se pide
    // nombre y correo y lo aprueba Alex a quien ya está en HELM Academy (el
    // Skool). La puerta de `datos` de abajo se queda para los PDF (lead magnet),
    // que se piden con `inmediato` y siguen abriéndose directos.
    aprobacion: {
      // El «únete» lleva al formulario de HELM Academy (/helm-academy), que
      // recoge los datos y redirige al Skool. Alex aprueba a quien aparezca allí.
      skool: '/helm-academy',
      kicker: 'acceso con aprobación',
      titulo: 'Pide tu acceso',
      texto: 'Déjanos tu nombre y tu correo. Le damos acceso a quien ya está en HELM Academy (es gratis): únete si aún no lo has hecho y pídelo aquí.',
      boton: 'Pedir acceso',
      legal: <>Usamos tus datos solo para darte acceso y enviarte contenido de AI para todo y de Silvestre AI. Puedes darte de baja cuando quieras. <a href="/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a></>,
      pendiente: {
        titulo: '¡Solicitud recibida!',
        texto: 'Si aún no estás en HELM Academy, únete (es gratis). En cuanto Alex lo confirme, abre AI para todo aquí con este mismo correo.',
        skoolBoton: 'Unirme a HELM Academy',
        comprobar: 'Ya me uní — abrir AI para todo',
        aun: 'Todavía no está aprobado. Únete a HELM Academy y vuelve a probar en un rato.',
      },
    },
    datos: {
      kicker: 'gratis · una sola vez',
      titulo: 'Entra gratis',
      texto: 'Tu nombre y tu correo, una sola vez, y se abre todo: las webs de referencia con su prompt, los hilos de skills, la guía completa de Claude y el diario.',
      boton: 'Entrar gratis',
      profesiones: {
        negocio: 'Tengo un negocio',
        freelance: 'Freelance o creador',
        empresa: 'Trabajo en una empresa',
        empezando: 'Estoy empezando',
      },
      ingresos: null,
      legal: <>Usamos tus datos solo para enviarte contenido de AI para todo y de Silvestre AI. Puedes darte de baja cuando quieras. <a href="/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a></>,
    },
  },
  cobro: COBRO_ACTIVO ? COBRO : null,
}
