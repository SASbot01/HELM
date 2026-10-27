// HELM — Editor de reels: la biblioteca de estilos de referencia (30).
//
// Cada estilo lleva el NOMBRE DEL PERFIL de donde sale (lo pidió Alex el
// 2026-10-19). En el editor, cada tarjeta tiene dos botones:
//   · «Crear»         → abre el taller con ese estilo: subes tu vídeo y HELM lo
//                       monta con `estilo`, que son parámetros REALES del motor
//                       (los de ./estilo.js: subtítulos, punch-in, corte,
//                       recursos y música). Siempre pasan por normalizaEstilo:
//                       lo que no se dice aquí, va como el de HELM.
//   · «Copiar prompt» → copia `prompt`, para que Claude lo haga por el MCP con
//                       todo lo que el motor no hace (rótulos, gráficos, SFX…).
//
// De dónde sale cada uno:
//   · Los 6 primeros, de mirar FOTOGRAMAS reales de sus reels (2026-10-19): por
//     eso traen `reels` con su portada (public/agentes/editor-estilos/). Lo que
//     un fotograma no da (el ritmo exacto) va marcado «a ajustar».
//   · Los otros 24, de la investigación de 2026-10-27 (creadores de negocio,
//     marketing e IA en español e inglés, con fuentes públicas en `fuentes`):
//     sin reels de ejemplo (`reels: []`), la tarjeta enseña una vista previa
//     hecha con CSS a partir de `estilo`. `confianza` dice cuánto está
//     documentado su modo de editar: con «baja», el estilo es aproximado.
//     Lo marcado «[aprox.]» en el prompt no está verificado en una fuente.
//
// Cuáles 30 (provisional, A CONFIRMAR CON ALEX): la orden pedía «6 de antes +
// 24 nuevos» y a la vez «los 30 de la investigación sin el Ali Abdaal repetido
// y uno más de habla hispana», que serían 36. Para quedarse en 30, de los 29
// creadores distintos de la investigación salieron 6:
//   · Paddy Galloway: lo suyo es la doctrina de miniaturas (va a Portadas);
//   · cinco de los seis de confianza «baja»: Oscar Feito, Jürgen Klarić y
//     Josef Ajram (en español) y Justin Welsh y Grant Cardone (en inglés).
// No es un criterio limpio: Laura Ribas, también «baja», se quedó, y el
// hispano añadido (Marcos Vázquez) es «baja» también. Si Alex prefiere a
// Feito, Klarić o Ajram, entran en lugar de los de inglés que menos le sirvan.
// Los enlaces van al perfil donde más publica cada uno (Instagram, YouTube, X o
// su web): la tarjeta dice cuál es.
//
// Lo que NUNCA se copia: la cara, la voz, el logo, la marca ni el contenido de
// nadie. Un estilo es solo cómo se edita (y los reels de ejemplo son
// referencias para sacarlo, no para copiarlos).
//
// Uso:
//   import { ESTILOS_REFERENCIA, TEMAS, IDIOMAS, buscaReferencia, estiloDeReferencia } from './editor/estilos-referencia'
//   estiloDeReferencia('hormozi')   // → el estilo completo y válido, listo para el motor
import { normalizaEstilo } from './estilo.js'

// Lo que se añade a cada prompt: el estilo es la edición, no la persona.
const SOLO_ESTILO = ' Copia solo cómo edita: nunca su cara, su voz, su logo, su marca ni su contenido.'

// Los temas del filtro de la galería (el `nicho` de cada uno es más fino).
export const TEMAS = Object.freeze({
  negocio: 'Negocio y finanzas',
  marketing: 'Marketing y ventas',
  ia: 'IA y tecnología',
  creadores: 'Creadores y marca personal',
  productividad: 'Productividad',
  mentalidad: 'Mentalidad',
  fitness: 'Fitness y salud',
})

export const IDIOMAS = Object.freeze({ es: 'Español', en: 'Inglés', pt: 'Portugués' })

const ig = (perfil) => `https://www.instagram.com/${perfil}/`

export const ESTILOS_REFERENCIA = [
  // ── Los 6 sacados de fotogramas reales ────────────────────────────────────
  {
    clave: 'rpn',
    nombre: 'rpn',
    nicho: 'noticias de IA / tech',
    tema: 'ia',
    idioma: 'en',
    enlace: ig('rpn'),
    prototipoMiniatura: true, // Dd4WsE-Pd43 vale además de prototipo de portada
    reels: [
      { shortcode: 'DecWaVFJC4v', url: 'https://www.instagram.com/reel/DecWaVFJC4v/', caption: 'Google is releasing Gemini 4 Argon today', likes: 4174 },
      { shortcode: 'Dd4WsE-Pd43', url: 'https://www.instagram.com/reel/Dd4WsE-Pd43/', caption: 'OpenAI just launched dots (GPT-6 Astra)', likes: 19552 },
    ],
    // Pantalla partida (render arriba, persona abajo), mayúsculas de 1–3
    // palabras a media altura con resalte amarillo, cortes cada ~2 s.
    estilo: {
      palabrasPorBloque: 2, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#FFD60A', colorBorde: '#000000',
      tamano: 80, borde: 6, posicion: 52, zoom: true, zoomCada: 3, zoomFactor: 1.08,
      pausaFrase: 0.5, silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'arriba', recursoDuracion: 2, musicaVolumen: 0.1,
    },
    prompt: 'Edita el reel en el estilo de rpn (divulgación tech). Alterna dos modos: (1) PANTALLA PARTIDA — arriba un render o gráfico 3D que explica el tema con rótulos tipo etiqueta (cajas con línea que señalan cada parte, acentos neón cian/verde); abajo el talking head en estudio, con luz cinematográfica y poca profundidad de campo. (2) B-ROLL a pantalla completa cuando se ilustra algo (capturas de producto, grabaciones de pantalla de la app/web de la que se habla). Subtítulos: blancos, negrita, MAYÚSCULAS, 1–3 palabras por bloque, centrados a media altura; resalta alguna palabra o cifra clave en amarillo. Corte rápido y seco (cambia de plano o b-roll cada ~2 s) con algún punch-in. Paleta oscura, alto contraste. Tono: noticia tech enérgica. [Ritmo exacto de cortes y zoom: ajustar al analizar el audio.]' + SOLO_ESTILO,
  },
  {
    clave: 'austingeorgas',
    nombre: 'austingeorgas',
    nicho: 'motivación / vision board',
    tema: 'mentalidad',
    idioma: 'en',
    enlace: ig('austingeorgas'),
    reels: [
      { shortcode: 'DAzCFqTRxWm', url: 'https://www.instagram.com/reel/DAzCFqTRxWm/', caption: 'Your life can change at any moment', likes: 9589 },
    ],
    // Subtítulo limpio en minúscula a media altura; collages con zoom rápido y
    // música épica por encima (los titulares recortados van por el prompt).
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#000000',
      tamano: 64, borde: 3, posicion: 55, zoom: true, zoomCada: 3, zoomFactor: 1.1,
      silencioMax: 0.35, silencioDeja: 0.1, recursosModo: 'corte', recursoDuracion: 2, musicaVolumen: 0.22,
    },
    prompt: 'Edita el reel en el estilo de austingeorgas (motivacional, vision board). Las palabras clave aparecen con tipografía RECORTADA tipo revista (ransom note: cada letra en una fuente y color distintos) sobre COLLAGES de fotos (tablero de visión) animados con zoom rápido. Intercala b-roll de vida aspiracional: apartamento con vistas a la ciudad, éxito tranquilo, lifestyle. Subtítulos del discurso en blanco, minúscula, sans-serif limpia, pocas palabras, a media altura (distintos de la tipografía decorativa de los titulares). Música épica en crescendo. Color natural y cálido en el metraje; las letras recortadas de colores son el acento. [Ritmo de cortes: ajustar al audio.]' + SOLO_ESTILO,
  },
  {
    clave: 'pedrobuerbaum',
    nombre: 'pedrobuerbaum',
    nicho: 'negocio / mentalidad',
    tema: 'negocio',
    idioma: 'es',
    enlace: ig('pedrobuerbaum'),
    reels: [
      { shortcode: 'DefGBtXkpLl', url: 'https://www.instagram.com/reel/DefGBtXkpLl/', caption: 'La pregunta detrás de cada decisión que tomo', likes: 6895 },
    ],
    // Una toma cinematográfica y sobria: sin zoom, cortes suaves que respiran,
    // subtítulo pequeño en minúscula y sin resalte.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#000000',
      tamano: 58, borde: 2, posicion: 60, zoom: false,
      pausaFrase: 0.8, silencioMax: 0.6, silencioDeja: 0.2, recursosModo: 'corte', recursoDuracion: 3.5, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de pedrobuerbaum (negocio/mentalidad premium, en español). Una sola toma CINEMATOGRÁFICA y de moda: el protagonista con gafas de sol y ropa negra, en la calle de una ciudad con coches de fondo; cámara con poca profundidad de campo y color desaturado/frío, look caro. Monólogo directo a cámara. Subtítulos blancos, minúscula, sans-serif, pocas palabras, alineados abajo a la izquierda a media altura. Ritmo suave, cortes limpios entre tomas de la misma escena, SIN gráficos ni rótulos. Sobrio y elegante. [Ritmo de cortes: ajustar al audio.]' + SOLO_ESTILO,
  },
  {
    clave: 'samzia',
    nombre: 'samzia',
    nicho: 'mentalidad / grind',
    tema: 'mentalidad',
    idioma: 'en',
    enlace: ig('samzia'),
    reels: [
      { shortcode: 'DeZzFbfPCw-', url: 'https://www.instagram.com/reel/DeZzFbfPCw-/', caption: 'Don’t have time to sit and relax', likes: 32413 },
      { shortcode: 'DdcjzkthTA7', url: 'https://www.instagram.com/reel/DdcjzkthTA7/', caption: 'You know exactly what you need to be doing', likes: 9476 },
    ],
    // Una palabra grande por plano, centrada; todo b-roll y la música manda.
    estilo: {
      palabrasPorBloque: 1, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#000000',
      tamano: 96, borde: 3, posicion: 50, zoom: true, zoomCada: 2, zoomFactor: 1.05,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 2, musicaVolumen: 0.3,
    },
    prompt: 'Edita el reel en el estilo de samzia (mentalidad, grind hacia el éxito). SOLO b-roll cinematográfico, oscuro y aspiracional, sin talking head: skyline nocturno con luces de ciudad, figura con capucha frente a pantallas de código/trading, interiores de lujo minimalistas. Color frío, oscuro, alto contraste, poca profundidad de campo. Subtítulos blancos, negrita, minúscula, UNA palabra por plano, centrados a media altura, al ritmo de la música. Cada plano dura ~2 s con una sola palabra: muy minimalista. Tono: grind solitario, épico. [Ritmo exacto al audio.]' + SOLO_ESTILO,
  },
  {
    clave: 'felipetambara.ia',
    nombre: 'felipetambara.ia',
    nicho: 'IA / listas de herramientas',
    tema: 'ia',
    idioma: 'pt',
    enlace: ig('felipetambara.ia'),
    // Probado de verdad el 2026-10-19 en el reel 1019 de Alex (render con
    // Pillow + ffmpeg en el server, helm-ops/tmp/edicion-1019/render.py).
    reels: [
      { shortcode: 'Db1JYvvRXxG', url: 'https://www.instagram.com/reel/Db1JYvvRXxG/', caption: 'Salva esse vídeo pra não perder as ferramentas', likes: 12900 },
    ],
    // Talking head fijo (sin zoom), subtítulo en minúscula sobre el pecho,
    // corte seco y la voz a −14 LUFS, como en el reel probado.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#000000',
      tamano: 60, borde: 2, posicion: 66, zoom: false,
      silencioMax: 0.35, silencioDeja: 0.1, volumen: -14, recursosModo: 'corte', recursoDuracion: 3, musicaVolumen: 0.06,
    },
    prompt: 'Edita el reel en el estilo de felipetambara.ia (listas de herramientas). Talking head fijo, sin b-roll. Cada vez que dice «usa esto para X», CORTE SECO a un set nuevo, un fotograma antes de la frase: arriba un TÍTULO en serif blanca (Instrument Serif) curvado en arco, en español («Generar ideas», «Generar vídeos», «Generar imágenes», «Organización», «Automatizaciones»); a la izquierda una COLUMNA de 4 apps de esa categoría (icono de app con esquinas redondeadas + nombre en blanco seminegrita; logos sin tarjeta tal cual), que entra con un pop corto de un fotograma por fila. Ningún nombre puede tapar ojos o boca: si es largo, va en la última fila. Subtítulos en minúscula, blancos, sans medium (Inter), palabra a palabra, abajo a la derecha sobre el pecho, en trozos «usa esto para» + palabra clave, sin pasar del 86 % del ancho (botones de Instagram). Si el fondo es claro, degradado oscuro suave arriba y a la izquierda y sombra doble en los textos. Cierre en «guarda este vídeo»: título «Guárdalo» + icono de guardar. Audio normalizado a −14 LUFS, pico ≤ −2 dBTP. Primer fotograma con el set completo (es la portada por defecto).' + SOLO_ESTILO,
  },
  {
    clave: 'izansimon',
    nombre: 'izansimon',
    nicho: 'fitness',
    tema: 'fitness',
    idioma: 'es',
    enlace: ig('izansimon'),
    reels: [
      { shortcode: 'DeR0RncIjeH', url: 'https://www.instagram.com/reel/DeR0RncIjeH/', caption: 'Comenta “RECOMPOSICIÓN” y te mando el sistema', likes: 725 },
    ],
    // Pódcast con tarjetas insertadas: el motor las pone arriba con la persona
    // abajo (lo más parecido al picture-in-picture); resalte rosa de su borde.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FF6FB5', colorBorde: '#000000',
      tamano: 66, borde: 4, posicion: 70, zoom: true, zoomCada: 5, zoomFactor: 1.05,
      silencioMax: 0.45, silencioDeja: 0.14, recursosModo: 'arriba', recursoDuracion: 3, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de izansimon (fitness, en español, formato pódcast/reacción). Talking head con micrófono de pódcast y fondo de ventana con skyline. Sobre la parte inferior, TARJETAS INSERTADAS (picture-in-picture) con borde de color (rosa) que muestran aquello de lo que habla: fotos de físico antes/después, capturas. Dos tipos de subtítulo: (a) una ETIQUETA de tema en caja negra redondeada con texto blanco en minúscula (p. ej. «el poder de la recomposición corporal»), que aparece cuando toca el punto; y (b) el subtítulo del habla en blanco, palabra a palabra. Ritmo medio; corta a la imagen insertada justo cuando la menciona. Color natural y brillante. [Ritmo de cortes: ajustar al audio.]' + SOLO_ESTILO,
  },

  // ── Negocio y ventas, en inglés ───────────────────────────────────────────
  {
    clave: 'hormozi',
    nombre: 'hormozi',
    persona: 'Alex Hormozi',
    nicho: 'negocio / ventas',
    tema: 'negocio',
    idioma: 'en',
    enlace: ig('hormozi'),
    confianza: 'alta',
    fuentes: [
      'https://www.choppity.com/tools/recreate-video-editing-style/alex-hormozi/',
      'https://riverside.com/blog/hormozi-style-videos',
      'https://quso.ai/blog/how-to-edit-reels-and-shorts-like-alex-hormozi.html',
    ],
    reels: [],
    // El más imitado: mayúsculas blancas con borde negro grueso, la palabra que
    // suena en amarillo, 2–4 palabras en el tercio bajo, jump cut cada 1–3 s y
    // punch-in del 10–20 %. Casi sin b-roll y con la música muy baja.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#FFD60A', colorBorde: '#000000',
      tamano: 84, borde: 8, posicion: 68, zoom: true, zoomCada: 2.5, zoomFactor: 1.12,
      pausaFrase: 0.45, silencioMax: 0.25, silencioDeja: 0.06, quitarTomas: true, quitarMuletillas: true, volumen: -14,
      recursosModo: 'corte', recursoDuracion: 1.5, musicaVolumen: 0.06,
    },
    prompt: 'Edita el reel en el estilo de Alex Hormozi (@hormozi, negocio y ventas). Una sola persona a cámara sobre fondo oscuro, llenando más del 60 % del cuadro. Jump cut cada 1–3 s alternando plano medio y primer plano, sin pausas ni muletillas; el corte cae en la palabra de énfasis. Punch-in digital frecuente del 10–20 %. Subtítulos desde el primer fotograma: sans muy gruesa en MAYÚSCULAS (tipo Montserrat Black [aprox.]), blancos con contorno negro grueso y sombra ligera, 2–4 palabras visibles, la palabra que suena en AMARILLO, centrados en el tercio inferior, con un pequeño rebote al entrar. B-roll mínimo o nulo. Alto contraste, negros profundos, piel cálida. Voz muy limpia y cercana, música de fondo muy baja, sin efectos en las transiciones. Gancho: una afirmación rotunda o a contracorriente, sin intro ni marca.' + SOLO_ESTILO,
  },
  {
    clave: 'leilahormozi',
    nombre: 'leilahormozi',
    persona: 'Leila Hormozi',
    nicho: 'liderazgo / empresa',
    tema: 'negocio',
    idioma: 'en',
    enlace: ig('leilahormozi'),
    confianza: 'media',
    fuentes: [
      'https://www.choppity.com/tools/recreate-video-editing-style/leila-hormozi/',
      'https://www.choppity.com/tools/recreate-video-editing-style/',
    ],
    reels: [],
    // El contrapunto calmado: sin subtítulos quemados, tomas de 3–8 s, las
    // pausas se dejan a propósito, sin zoom y casi sin música.
    estilo: {
      subtitulos: false, palabrasPorBloque: 5, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#000000',
      tamano: 56, borde: 0, posicion: 72, zoom: false,
      pausaFrase: 1, silencioMax: 1, silencioDeja: 0.35, recursosModo: 'corte', recursoDuracion: 3.5, musicaVolumen: 0.04,
    },
    prompt: 'Edita el reel en el estilo de Leila Hormozi (@leilahormozi, liderazgo y empresa): calma y autoridad. Foco total en quien habla, SIN subtítulos quemados (como mucho los de la plataforma). Tomas largas de 3–8 s, pocos jump cuts y las pausas se dejan a propósito para dar peso. Plano medio centrado de cintura para arriba, encuadre constante, sin zoom. Texto en pantalla raro: si aparece, sans limpia en minúscula normal, blanca y sin contorno. Sin b-roll, gráficos ni emojis. Color neutro cálido y algo desaturado (fondo beige, negros un poco levantados, luz suave). Audio limpio con el aire natural de la sala y, casi siempre, SIN música. Sin transiciones. Gancho: una afirmación directa o una pregunta que reta; la seguridad al decirlo es el gancho.' + SOLO_ESTILO,
  },
  {
    clave: 'imangadzhi',
    nombre: 'imangadzhi',
    persona: 'Iman Gadzhi',
    nicho: 'agencias / emprendimiento',
    tema: 'negocio',
    idioma: 'en',
    enlace: ig('imangadzhi'),
    confianza: 'media',
    fuentes: [
      'https://www.opus.pro/pt-br/blog/how-to-edit-instagram-reels-exactly-like-iman-ghadzi',
      'https://submagic.co/blog/how-to-make-captions-like-iman-gadzhi',
      'https://ark.beehiiv.com/p/iman-gadzhi-broke-youtube-made-millions',
    ],
    reels: [],
    // Subtítulo de un solo color blanco, en minúscula, sin resalte de color;
    // cambios de ángulo frecuentes con zoom suave y b-roll que marca el ritmo.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#000000',
      tamano: 62, borde: 2, posicion: 62, zoom: true, zoomCada: 3, zoomFactor: 1.05,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 2, musicaVolumen: 0.14,
    },
    prompt: 'Edita el reel en el estilo de Iman Gadzhi (@imangadzhi, agencias y emprendimiento): cinematográfico y de marca personal. Cambios de ÁNGULO frecuentes para que nunca se pare y zoom-in sutil para dar cercanía. El b-roll marca el ritmo (puede ser metraje antiguo propio, como un flashback). Subtítulos de UN solo color, BLANCO, en minúscula; la palabra que suena pasa de fina a NEGRITA en vez de cambiar de color; nada de colores fosforito ni transiciones llamativas entre líneas. Tipografía sin verificar (Helvetica o Montserrat [aprox.]). Ritmo rápido guiado por el gancho, color cálido y de cine [aprox.]. La historia personal es la columna del vídeo.' + SOLO_ESTILO,
  },
  {
    clave: 'codiesanchez',
    nombre: 'codiesanchez',
    persona: 'Codie Sanchez',
    nicho: 'compra de empresas / inversión',
    tema: 'negocio',
    idioma: 'en',
    enlace: ig('codiesanchez'),
    confianza: 'alta',
    fuentes: [
      'https://www.choppity.com/tools/recreate-video-editing-style/codie-sanchez/',
      'https://builtin.com/job/youtube-video-editor/7340580',
    ],
    reels: [],
    // Subtítulo grande blanco sin contorno (solo una sombra), en minúscula
    // normal, en bloques de varias palabras abajo; ritmo conversacional.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFFFFF', colorBorde: '#1A1A1A',
      tamano: 70, borde: 2, posicion: 70, zoom: true, zoomCada: 5, zoomFactor: 1.05,
      pausaFrase: 0.65, silencioMax: 0.45, silencioDeja: 0.14, recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de Codie Sanchez (@codiesanchez, compra de pequeñas empresas e inversión). Plano medio centrado con el estudio a la vista detrás (cálido, cargado de objetos). Ritmo conversacional, de 2 a 5 s por plano, jump cuts entre ángulos y algún inserto de b-roll de vez en cuando. Subtítulos en sans NEGRITA, en minúscula normal, GRANDES, BLANCOS sin contorno y con una sombra ligera, en bloques de varias líneas abajo al centro; a veces una sola palabra en mayúsculas para enfatizar. El gancho va en TEXTO GRANDE en el primer fotograma (ocupa el tercio de abajo): una promesa concreta, una lista numerada o una afirmación rotunda, que se entienda sin sonido. Color cálido y natural, saturación un poco subida, sin etalonaje pesado. Micro directo y limpio, música sutil o ninguna.' + SOLO_ESTILO,
  },
  {
    clave: 'thediaryofaceo',
    nombre: 'thediaryofaceo',
    persona: 'Steven Bartlett (The Diary of a CEO)',
    nicho: 'pódcast de negocio / entrevistas',
    tema: 'negocio',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@TheDiaryOfACEO',
    confianza: 'media',
    fuentes: [
      'https://en.wikipedia.org/wiki/The_Diary_of_a_CEO',
      'https://www.entertainmentcareers.net/flightstory/head-of-youtube-packaging-and-strategy-the-diary-of-a-ceo/job/529232/',
      'https://thenathanbarryshow.transistor.fm/episodes/grace-miller',
    ],
    reels: [],
    // Clips de entrevista: subtítulos grandes con la frase fuerte resaltada,
    // cortes que respetan la conversación y algún inserto.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFB020', colorBorde: '#000000',
      tamano: 70, borde: 4, posicion: 66, zoom: true, zoomCada: 6, zoomFactor: 1.06,
      pausaFrase: 0.8, silencioMax: 0.5, silencioDeja: 0.15, recursosModo: 'corte', recursoDuracion: 3, musicaVolumen: 0.06,
    },
    prompt: 'Edita el reel en el estilo de los clips de The Diary of a CEO (@thediaryofaceo, entrevistas de negocio): un trozo de conversación larga recortado en su momento más fuerte. Look de estudio cinematográfico con luz de contraste [aprox.], plano y contraplano si hay dos cámaras. Subtítulos grandes quemados, con la frase clave resaltada [color: aprox.]. Cortes que respetan el hilo de la conversación (sin dejarla a saltos) y algún inserto o b-roll de apoyo. Gancho: la frase más chocante o contraria del clip, en el primer segundo. El empaquetado manda: el primer fotograma y el texto del gancho se piensan para el CTR.' + SOLO_ESTILO,
  },
  {
    clave: 'gregisenberg',
    nombre: 'gregisenberg',
    persona: 'Greg Isenberg',
    nicho: 'ideas de startups con IA',
    tema: 'negocio',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@GregIsenberg',
    confianza: 'media',
    fuentes: [
      'https://moon.fm/podcasts/786918',
      'https://requestforstartups.substack.com/p/multipreneurship-and-the-future-of',
      'https://www.youtube.com/@GregIsenberg',
    ],
    reels: [],
    // Clips de vídeo-pódcast: palabra a palabra con la palabra clave en verde
    // (cifras y dinero), cortes rápidos y zoom a la cara en el remate.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#22C55E', colorBorde: '#000000',
      tamano: 72, borde: 6, posicion: 66, zoom: true, zoomCada: 3.5, zoomFactor: 1.1,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.06,
    },
    prompt: 'Edita el reel en el estilo de los clips de Greg Isenberg (@gregisenberg, ideas de startups e IA): un trozo de su vídeo-pódcast convertido en vertical. Subtítulos quemados palabra a palabra con las palabras clave resaltadas [color: aprox.], cortes rápidos, zoom a la cara en el remate y b-roll de las webs o cifras que se mencionan (capturas a pantalla completa). Ritmo mucho más agresivo que el del pódcast. Gancho: una frase potente del invitado, con una cifra o una afirmación tajante. Estructura: idea → desarrollo → acción concreta.' + SOLO_ESTILO,
  },

  // ── Negocio y marketing, en español ───────────────────────────────────────
  {
    clave: 'mastermunozoficial',
    nombre: 'mastermunozoficial',
    persona: 'Carlos «Máster» Muñoz',
    nicho: 'emprendimiento / ventas',
    tema: 'negocio',
    idioma: 'es',
    enlace: 'https://www.youtube.com/@mastermunozoficial',
    confianza: 'media',
    fuentes: [
      'https://www.planetadelibros.com/autor/carlos-master-munoz/000055497',
      'https://www.mediotiempo.com/otros-mundos/carlos-master-munoz-se-retira-de-las-redes-sociales',
      'https://www.merca20.com/carlos-munoz-anuncia-su-nueva-estrategia-de-contenido-para-triunfar-en-redes',
    ],
    reels: [],
    // Clip de conferencia: mayúsculas grandes en la franja central-alta con la
    // frase clave resaltada, corte en el remate y punch-in; casi sin música.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#FFD60A', colorBorde: '#000000',
      tamano: 80, borde: 7, posicion: 52, zoom: true, zoomCada: 3.5, zoomFactor: 1.1,
      silencioMax: 0.35, silencioDeja: 0.1, recursosModo: 'corte', recursoDuracion: 2, musicaVolumen: 0.04,
    },
    prompt: 'Edita el reel en el estilo de Carlos «Máster» Muñoz (@mastermunozoficial, emprendimiento y ventas, en español): un trozo de conferencia o charla grabada a varias cámaras (plano general y primeros planos) convertido en vertical. El ritmo lo marca su discurso: jump cuts que quitan las pausas y corte justo en el remate. Subtítulos grandes quemados, en MAYÚSCULAS, con la palabra o frase clave resaltada (amarillo o verde [aprox.]), centrados en la franja central-alta. Punch-in en las frases clave. Poco b-roll: pesa la frase provocadora. Sonido de sala y música mínima. Gancho: una afirmación tajante o contraintuitiva sobre dinero o negocio. Estructura: provocación → argumento → ejemplo.' + SOLO_ESTILO,
  },
  {
    clave: 'emprendeaprendiendo',
    nombre: 'emprendeaprendiendo',
    persona: 'Euge Oller (Emprende Aprendiendo)',
    nicho: 'emprendimiento / divulgación de negocios',
    tema: 'negocio',
    idioma: 'es',
    enlace: 'https://www.youtube.com/@EmprendeAprendiendo',
    confianza: 'media',
    fuentes: [
      'https://emprendedores.es/lideres/quien-es-euge-oller-emprende-aprendiendo',
      'https://www.bbva.com/es/innovacion/youtube-para-emprendedores-siete-canales-para-inspirarse-y-hacer-crecer-un-negocio/',
      'https://www.elclubdeinversion.com/entrevista-euge-oller/',
    ],
    reels: [],
    // «Value video» rápido: cero tiempos muertos, jump cut constante, mucho
    // b-roll corto y mayúsculas con resalte por palabra; música enérgica baja.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#FFD60A', colorBorde: '#000000',
      tamano: 76, borde: 6, posicion: 66, zoom: true, zoomCada: 2.5, zoomFactor: 1.1,
      pausaFrase: 0.45, silencioMax: 0.25, silencioDeja: 0.06, recursosModo: 'corte', recursoDuracion: 2, musicaVolumen: 0.12,
    },
    prompt: 'Edita el reel en el estilo de Euge Oller (Emprende Aprendiendo, divulgación de negocios, en español). Ritmo rápido, cero tiempos muertos, jump cuts constantes y muchos cortes a b-roll que ilustra lo que dice (stock, gráficos, capturas de pantalla). Palabras clave y textos animados que refuerzan el audio, flechas y subrayados animados, iconos y emojis, y efectos de sonido (whoosh, pop, ding) en casi cada transición y texto. Punch-ins para enfatizar. Música enérgica y bajita. Subtítulos sans gruesos en MAYÚSCULAS con resalte por palabra [tipografía y color: aprox.]. Gancho: una promesa de aprendizaje clara. Estructura: promesa → puntos numerados → ejemplo → llamada a la acción.' + SOLO_ESTILO,
  },
  {
    clave: 'morisdieck',
    nombre: 'morisdieck',
    persona: 'Moris Dieck',
    nicho: 'finanzas personales / negocio',
    tema: 'negocio',
    idioma: 'es',
    enlace: 'https://www.youtube.com/@morisdieck',
    confianza: 'media',
    fuentes: [
      'https://financera.mx/finanzas-personales/youtube-aprender-finanzas-personales-en-mexico/',
      'https://expansion.mx/economia/2022/09/30/conoce-una-nueva-forma-de-hablar-del-dinero',
      'https://www.xataka.com.mx/empresas-y-economia/moris-dieck-coach-financiero-eres-1-ciento-mejor-todos-dias-a-larga-vas-a-tener-crecimiento-exponencial-asi-convirtio-formula-matematica-leccion-para-vida',
    ],
    reels: [],
    // Pulido y didáctico: subtítulo animado de 2 palabras con la cifra en
    // verde dinero, punch-ins y b-roll de cifras.
    estilo: {
      palabrasPorBloque: 2, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#22C55E', colorBorde: '#000000',
      tamano: 80, borde: 6, posicion: 64, zoom: true, zoomCada: 3, zoomFactor: 1.08,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 2, musicaVolumen: 0.12,
    },
    prompt: 'Edita el reel en el estilo de Moris Dieck (@morisdieck, finanzas y negocio, en español): producción pulida y moderna. Subtítulos grandes animados palabra a palabra, cifras y animaciones de apoyo para los conceptos, punch-ins, efectos de sonido sutiles y música. Color etalonado y limpio. Ritmo medio-rápido, cortes al grano. Gancho: un dato de dinero sorprendente o una pregunta («¿cuánto necesitas para…?»). Estructura clara y didáctica, lenguaje sencillo. [Tipografía y colores exactos: aprox.]' + SOLO_ESTILO,
  },
  {
    clave: 'romualdfonstv',
    nombre: 'romualdfonstv',
    persona: 'Romuald Fons',
    nicho: 'SEO / marketing digital',
    tema: 'marketing',
    idioma: 'es',
    enlace: 'https://www.youtube.com/@romualdfonstv',
    confianza: 'media',
    fuentes: [
      'https://vidiq.com/youtube-stats/channel/@romualdfonstv/',
      'https://creatordb.app/creatorstats/romualdfons/',
      'https://www.levelup.com/noticias/gana-1-millon-de-euros-en-solo-una-semana-con-curso-para-hackear-algoritmo-de-youtube/',
    ],
    reels: [],
    // Hiperdinámico y con humor: zoom brusco cada 2 s, cortes al límite,
    // textos enormes de énfasis (rojo) y capturas a pantalla completa.
    estilo: {
      palabrasPorBloque: 2, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#EF4444', colorBorde: '#000000',
      tamano: 88, borde: 8, posicion: 62, zoom: true, zoomCada: 2, zoomFactor: 1.15,
      pausaFrase: 0.4, silencioMax: 0.2, silencioDeja: 0.05, recursosModo: 'corte', recursoDuracion: 1.5, musicaVolumen: 0.14,
    },
    prompt: 'Edita el reel en el estilo de Romuald Fons (@romualdfonstv, SEO y marketing digital, en español): hiperdinámico y con humor. Cortes muy rápidos, jump cuts, memes, gifs y clips de cultura pop insertados, efectos de sonido marcados y zooms bruscos. Alterna la cámara (mucha energía a cámara) con capturas de Google y de herramientas SEO, con zoom y recuadros o flechas sobre lo que explica. Textos grandes animados para enfatizar; los subtítulos van más como énfasis puntual que palabra a palabra [aprox.]. Música y SFX enérgicos. Gancho: una pregunta o promesa de resultados con un golpe visual.' + SOLO_ESTILO,
  },
  {
    clave: 'vilmanunez',
    nombre: 'vilmanunez',
    persona: 'Vilma Núñez',
    nicho: 'marketing digital / embudos',
    tema: 'marketing',
    idioma: 'es',
    enlace: ig('vilmanunez'),
    confianza: 'media',
    fuentes: [
      'https://motionapp.com/creator/vilma-nuez/',
      'https://creatordb.app/creatorstats/vilmanunez/',
      'https://www.planetadelibros.com/libro-de-invisible-a-invencible/396385',
    ],
    reels: [],
    // Talking head profesional: subtítulo grande con la palabra clave en el
    // color de marca, cortes al silencio y punch-in de énfasis.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#F43F8E', colorBorde: '#000000',
      tamano: 70, borde: 4, posicion: 66, zoom: true, zoomCada: 4.5, zoomFactor: 1.06,
      silencioMax: 0.35, silencioDeja: 0.1, recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.06,
    },
    prompt: 'Edita el reel en el estilo de Vilma Núñez (@vilmanunez, marketing digital y embudos, en español). Talking head profesional, encuadre limpio, fondo de estudio u oficina con la marca a la vista. Subtítulos grandes quemados con la palabra clave resaltada en el color de marca del cliente [el rosa es aprox.]. Ritmo medio-rápido, cortes al silencio, punch-ins para enfatizar. Un titular fijo arriba durante todo el reel con el gancho. Contenido muy estructurado (listas, pasos, frameworks) y marca coherente (logo y paleta del cliente). SFX suaves. Gancho: un problema o beneficio de marketing («deja de…», «3 formas de…»).' + SOLO_ESTILO,
  },
  {
    clave: 'lauraribas',
    nombre: 'lauraribas',
    persona: 'Laura Ribas',
    nicho: 'marca personal / marketing esencialista',
    tema: 'marketing',
    idioma: 'es',
    enlace: 'https://lauraribas.com',
    confianza: 'baja',
    fuentes: [
      'https://latam.casadellibro.com/libro-el-hechizo-de-una-marca/9788418053115/14452182',
      'https://asest.es/story/mentora-de-laura-ribas/',
      'https://www.ivoox.com/en/desarrollo-profesional-personal-laura-ribas-audios-mp3_rf_128655778_1.html',
    ],
    reels: [],
    // Cálido y sobrio: subtítulo fino en crema, sin zoom, pausas que respiran.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFF8EE', colorResalte: '#F2C9A0', colorBorde: '#3A2A20',
      tamano: 58, borde: 2, posicion: 70, zoom: false,
      pausaFrase: 0.9, silencioMax: 0.6, silencioDeja: 0.22, recursosModo: 'corte', recursoDuracion: 3.5, musicaVolumen: 0.1,
    },
    prompt: 'Edita el reel en el estilo de Laura Ribas (@lauraribas, marca personal y marketing, en español): cálido, sobrio y de mucho valor percibido. Talking head cuidado con luz suave, encuadre limpio y fondo de estudio u hogar elegante. Edición pausada, cortes limpios al silencio, pocos efectos. Textos sutiles y elegantes (tipografía fina [aprox.]) en una paleta neutra y cálida (crema, negro y un acento). Subtítulo limpio y un titular que invita a pensar. Música suave. Gancho: una pregunta o una idea de negocio o mentalidad. [Todo el estilo es aprox.: descrito de forma general.]' + SOLO_ESTILO,
  },

  // ── Marketing y marca personal, en inglés ─────────────────────────────────
  {
    clave: 'garyvee',
    nombre: 'garyvee',
    persona: 'Gary Vaynerchuk',
    nicho: 'marketing de contenidos / marca personal',
    tema: 'marketing',
    idioma: 'en',
    enlace: ig('garyvee'),
    confianza: 'media',
    fuentes: [
      'https://www.garyvaynerchuk.com/make-instagram-videos/',
      'https://www.kapwing.com/resources/how-to-make-videos-like-garyvee/',
    ],
    reels: [],
    // Tarjeta de título + selfie a cámara + subtítulos, todo dentro de la zona
    // segura del centro; la palabra clave enfatizada.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFD60A', colorBorde: '#000000',
      tamano: 68, borde: 5, posicion: 64, zoom: true, zoomCada: 4, zoomFactor: 1.06,
      silencioMax: 0.35, silencioDeja: 0.1, recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de Gary Vaynerchuk (@garyvee, marketing y marca personal), según sus propias directrices: una TARJETA DE TÍTULO en texto arriba + el vídeo a cámara (tipo selfie o trozo de charla) + subtítulos. Los primeros segundos son el gancho. El titular: una frase corta y contundente sacada del propio vídeo, con las palabras clave enfatizadas (a veces en MAYÚSCULAS), números o porcentajes y palabras con emoción, llenando el ancho, sin clickbait descarado. Todo lo importante dentro de la zona segura del centro (1080×1350). Al final, una llamada a comentar o compartir CON un motivo ligado al contenido. [Las medidas son de 2019: aprox.]' + SOLO_ESTILO,
  },
  {
    clave: 'thedankoe',
    nombre: 'thedankoe',
    persona: 'Dan Koe',
    nicho: 'negocio de una persona / escritura',
    tema: 'creadores',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@DanKoeTalks',
    confianza: 'media',
    fuentes: [
      'https://favikon.com/blog/who-is-dan-koe',
      'https://socialblade.com/youtube/handle/dankoetalks/achievements',
      'https://tagabukid.substack.com/p/how-dan-koe-writes-one-newsletter',
    ],
    reels: [],
    // Ensayo minimalista: tipografía grande en el centro con un solo acento,
    // sin zoom, ritmo pausado y música ambiental.
    estilo: {
      palabrasPorBloque: 2, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#F2C14E', colorBorde: '#000000',
      tamano: 78, borde: 0, posicion: 50, zoom: false,
      pausaFrase: 0.9, silencioMax: 0.7, silencioDeja: 0.25, recursosModo: 'corte', recursoDuracion: 4, musicaVolumen: 0.18,
    },
    prompt: 'Edita el reel en el estilo de Dan Koe (@thedankoe, negocio de una sola persona y escritura): formato ensayo, minimalista. Tipografía en movimiento (kinetic typography) y animaciones 2D limpias, a menudo en blanco y negro o con una paleta muy corta y UN acento de color; transiciones suaves, muy poco b-roll y poca aparición a cámara. Ritmo pausado y reflexivo, música ambiental, la voz como narración de un guion escrito. [El estilo visual es aprox.: sale de cómo lo imitan, no de él.]' + SOLO_ESTILO,
  },
  {
    clave: 'kallaway',
    nombre: 'kallaway',
    persona: 'Kane Kallaway',
    nicho: 'short-form / tech e IA',
    tema: 'creadores',
    idioma: 'en',
    enlace: ig('kallaway'),
    confianza: 'alta',
    fuentes: [
      'https://www.favikon.com/blog/who-is-kane-k-aka-kallaway',
      'https://creatordb.app/creatorstats/kallaway/',
      'https://www.castmagic.io/podcast/rhythm-hooks-and-a-billion-views-kane-kallaways-short-form-video-content-secrets',
      'https://www.youtube.com/@kallaway',
    ],
    reels: [],
    // Su formato: el visual de apoyo en la mitad de ARRIBA y él en la de abajo,
    // cada frase cambia lo de arriba (1,5–3 s); karaoke en mayúsculas encima
    // de su cabeza y cortes pegados al silencio.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#38E07B', colorBorde: '#000000',
      tamano: 74, borde: 6, posicion: 56, zoom: true, zoomCada: 3, zoomFactor: 1.06,
      pausaFrase: 0.45, silencioMax: 0.25, silencioDeja: 0.06, recursosModo: 'arriba', recursoDuracion: 2, musicaVolumen: 0.1,
    },
    prompt: 'Edita el reel en el estilo de Kallaway (@kallaway, short-form de tech e IA). Mitad SUPERIOR con un visual inmersivo a pantalla completa (b-roll, interfaz de la app, archivo, animación) y mitad INFERIOR con quien habla; cada frase cambia el visual de arriba (planos de 1,5–3 s). Jump cuts pegados al silencio, cero aire muerto, punch-ins suaves. Subtítulos karaoke palabra a palabra, centrados, sans gruesa (tipo Montserrat o Poppins [aprox.]), en mayúsculas, con la palabra clave en color [color: aprox.], en el centro-bajo, encima de la cabeza. Flechas, subrayados y cajas que entran limpias. Música sutil, whooshes en las transiciones y a veces un silencio antes del remate. Gancho: abre un «curiosity loop» en 2–3 s y siembra micro-ganchos durante todo el vídeo; el final cierra el loop del principio.' + SOLO_ESTILO,
  },
  {
    clave: 'colinandsamir',
    nombre: 'colinandsamir',
    persona: 'Colin and Samir',
    nicho: 'economía de creadores',
    tema: 'creadores',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@ColinandSamir',
    confianza: 'alta',
    fuentes: [
      'https://vidcon.com/anaheim/speaker/230255',
      'https://www.rollingstone.com/culture/culture-features/colin-and-samir-youtube-interview-1342517/',
      'https://podcast.creatorscience.com/colinandsamir/',
    ],
    reels: [],
    // Documental: ritmo que respira (jump cuts y planos largos), zoom muy
    // suave y espaciado, b-roll narrativo y diseño sonoro con más música.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FBBF24', colorBorde: '#000000',
      tamano: 60, borde: 3, posicion: 70, zoom: true, zoomCada: 7, zoomFactor: 1.04,
      pausaFrase: 0.8, silencioMax: 0.55, silencioDeja: 0.18, recursosModo: 'corte', recursoDuracion: 3.5, musicaVolumen: 0.14,
    },
    prompt: 'Edita el reel en el estilo de Colin and Samir (@colinandsamir, economía de creadores): alta producción de corte documental. Varias cámaras, luz cuidada y color cálido de cine. Equilibrio entre edición de retención y expresión creativa: b-roll narrativo, insertos de archivo y gráficos de datos limpios. Ritmo dinámico que respira: mezcla jump cuts con planos más largos de reportaje. Rótulos inferiores y títulos de sección con su tipografía de marca [aprox.]. Diseño sonoro de documental. Gancho: la tesis o la pregunta del reportaje al principio.' + SOLO_ESTILO,
  },

  // ── Productividad ─────────────────────────────────────────────────────────
  {
    clave: 'aliabdaal',
    nombre: 'aliabdaal',
    persona: 'Ali Abdaal',
    nicho: 'productividad / creación de contenido',
    tema: 'productividad',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@aliabdaal',
    confianza: 'alta',
    fuentes: [
      'https://www.choppity.com/tools/recreate-video-editing-style/ali-abdaal/',
      'https://blog.adobe.com/en/publish/2024/09/05/how-ai-helps-ali-abdaal-save-hours-every-week',
      'https://academy.aliabdaal.com/',
      'https://buffer.com/resources/youtube-thumbnails/',
    ],
    reels: [],
    // Frase entera por bloque (no palabra a palabra), en minúscula normal, con
    // las palabras clave en amarillo; ritmo moderado y b-roll que ilustra.
    estilo: {
      palabrasPorBloque: 5, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FFD60A', colorBorde: '#000000',
      tamano: 60, borde: 2, posicion: 60, zoom: true, zoomCada: 6, zoomFactor: 1.05,
      pausaFrase: 0.7, silencioMax: 0.5, silencioDeja: 0.15, recursosModo: 'corte', recursoDuracion: 3, musicaVolumen: 0.1,
    },
    prompt: 'Edita el reel en el estilo de Ali Abdaal (@aliabdaal, productividad y creación de contenido). Ritmo moderado, de 2 a 5 s por plano; los cortes caen en los cambios naturales de idea. Subtítulos en letra manuscrita o script, en minúscula normal, blancos con las palabras clave en AMARILLO, en varias líneas a la IZQUIERDA de quien habla (junto a él, no encima), apareciendo frase a frase. Plano medio con la persona un poco descentrada para dejar sitio al texto. Base en blanco y negro o desaturada con el AMARILLO como color selectivo; fondo gris limpio, luz suave. B-roll abundante que ilustra cada punto (capturas de apps con zoom, libros, él usándolas) y gráficos de texto para listas y pasos. Voz limpia y música tranquila (lo-fi). Gancho: una pregunta o un reencuadre que despierta curiosidad, no el susto.' + SOLO_ESTILO,
  },
  {
    clave: 'jeffsu',
    nombre: 'jeffsu',
    persona: 'Jeff Su',
    nicho: 'productividad / herramientas de IA',
    tema: 'productividad',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@JeffSu',
    confianza: 'alta',
    fuentes: [
      'https://socialblade.com/youtube/handle/jeffsu/videos',
      'https://creatordb.app/creatorstats/jeffsu/',
      'https://www.youtube.com/@JeffSu',
    ],
    reels: [],
    // Limpio y gráfico: plano fijo (sin zoom), cortes apretados al silencio y
    // el código de color verde = hacer en el resalte.
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#34D399', colorBorde: '#000000',
      tamano: 62, borde: 3, posicion: 68, zoom: false,
      pausaFrase: 0.55, silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 3, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de Jeff Su (@jeffsu, productividad y herramientas de IA): gráfico, limpio y muy ordenado. Estructura explícita: índice al principio y secciones numeradas con rótulo. Gráficos de texto animados al ritmo de la voz: las palabras clave aparecen junto a él o encima, con un CÓDIGO DE COLOR fijo (verde = hacer, rojo = evitar). Iconos planos, flechas y cajas redondeadas, diseño tipo diapositiva con mucho aire. Talking head en plano medio FIJO + muchos insertos; capturas de pantalla reales con zoom y recuadros amarillos (y desenfoque sobre los datos sensibles). Jump cuts apretados al silencio, sin relleno. Música suave y pequeños «pops» al entrar cada gráfico. Gancho: en los primeros segundos promete el resultado y la estructura. [Tipografía: sans limpia, aprox.]' + SOLO_ESTILO,
  },

  // ── IA y tecnología ───────────────────────────────────────────────────────
  {
    clave: 'mreflow',
    nombre: 'mreflow',
    persona: 'Matt Wolfe',
    nicho: 'noticias y tutoriales de IA',
    tema: 'ia',
    idioma: 'en',
    enlace: 'https://www.youtube.com/@mreflow',
    confianza: 'media',
    fuentes: [
      'https://www.youtube.com/@mreflow',
      'https://blog.hubspot.com/marketing/ai-tips-newsletters-youtube-x',
      'https://www.futuretools.io/',
    ],
    reels: [],
    // Demo de herramientas: la pantalla arriba y él abajo (lo más parecido a
    // su cámara en una esquina), planos más largos para que se vea la demo.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#7DD3FC', colorBorde: '#000000',
      tamano: 66, borde: 5, posicion: 58, zoom: true, zoomCada: 5, zoomFactor: 1.06,
      silencioMax: 0.4, silencioDeja: 0.12, recursosModo: 'arriba', recursoDuracion: 3.5, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de Matt Wolfe (@mreflow, noticias y tutoriales de herramientas de IA). Talking head + grabación de pantalla del navegador y de las herramientas, con su cámara en una esquina (picture-in-picture) durante las demos. Jump cuts que quitan las muletillas, ritmo medio-rápido. Punch-in sobre la zona que importa de la pantalla (el cursor, el resultado generado). B-roll: capturas de las herramientas, lo que genera la IA (imágenes, vídeo) y sus logos. Gancho: enseña primero el resultado final y promete lo que se va a ver. Música ligera y transiciones por corte. [Subtítulos: aprox.]' + SOLO_ESTILO,
  },
  {
    clave: 'rileybrown_ai',
    nombre: 'rileybrown_ai',
    persona: 'Riley Brown',
    nicho: 'vibe coding / apps con IA',
    tema: 'ia',
    idioma: 'en',
    enlace: 'https://x.com/rileybrown_ai',
    confianza: 'media',
    fuentes: [
      'https://yespress.io/riley-brown',
      'https://podbay.fm/p/a-new-vibe',
      'https://x.com/rileybrown_ai',
    ],
    reels: [],
    // Demo en crudo: grabación de pantalla larga a pantalla completa con su voz
    // encima, sin zoom, subtítulo automático tipo CapCut y casi sin música.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#FACC15', colorBorde: '#000000',
      tamano: 64, borde: 6, posicion: 64, zoom: false,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 4.5, musicaVolumen: 0.03,
    },
    prompt: 'Edita el reel en el estilo de Riley Brown (@rileybrown_ai, vibe coding: apps hechas describiéndoselas a una IA). Demo en crudo: grabación de la pantalla del móvil u ordenador mientras cuenta en voz alta lo que quiere y la IA lo construye, del prompt al resultado en directo, con el suspense de «¿funcionará?». Mucha grabación de pantalla con su voz encima, cortes rápidos al silencio. Estética cruda y auténtica (selfie + pantalla), no ultra pulida. Subtítulos automáticos palabra a palabra tipo TikTok/CapCut. Transiciones por corte y música mínima. Gancho: algo concreto y asombroso en los primeros segundos («hice esta app en 5 minutos con el móvil»). Estructura: promesa → construcción en directo → resultado funcionando.' + SOLO_ESTILO,
  },
  {
    clave: 'rowancheung',
    nombre: 'rowancheung',
    persona: 'Rowan Cheung (The Rundown AI)',
    nicho: 'noticias de IA',
    tema: 'ia',
    idioma: 'en',
    enlace: 'https://x.com/rowancheung',
    confianza: 'media',
    fuentes: [
      'https://thestudententrepreneur.org/?p=11573',
      'https://www.therundown.ai/ai-university',
      'https://therundownai.beehiiv.com/authors/rowan-cheung',
    ],
    reels: [],
    // Noticia de IA: palabra a palabra, cortes al silencio y b-roll de la
    // herramienta o empresa a pantalla completa.
    estilo: {
      palabrasPorBloque: 3, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#60A5FA', colorBorde: '#000000',
      tamano: 68, borde: 5, posicion: 64, zoom: true, zoomCada: 4, zoomFactor: 1.06,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 2.5, musicaVolumen: 0.08,
    },
    prompt: 'Edita el reel en el estilo de Rowan Cheung (@rowancheung, The Rundown AI, noticias de IA). Talking head + capturas de demos y productos de IA. Subtítulos quemados palabra a palabra, cortes rápidos al silencio y b-roll de la herramienta o la empresa de la que habla (logo, interfaz, lo que genera). Gancho: el titular de la noticia en los primeros segundos («X acaba de lanzar…»). Estructura: noticia → qué hace → por qué importa → qué puedes hacer tú. [Ritmo, tipografía y animación: aprox.; su fuerte es la newsletter.]' + SOLO_ESTILO,
  },
  {
    clave: 'jonhernandezia',
    nombre: 'jonhernandezia',
    persona: 'Jon Hernández',
    nicho: 'divulgación de IA',
    tema: 'ia',
    idioma: 'es',
    enlace: ig('jonhernandezia'),
    confianza: 'media',
    fuentes: [
      'https://www.planetadelibros.com/autor/jon-hernandez/000067038',
      'https://www.merca2.es/2026/04/17/inteligencia-artificial-usar-a-ti-2369661/',
      'https://creatordb.app/creatorstats/jonhernandezia/',
    ],
    reels: [],
    // Noticias de IA en español: la captura de la herramienta arriba y él abajo,
    // mayúsculas con la palabra clave en azul tech y cortes al grano.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#38BDF8', colorBorde: '#000000',
      tamano: 74, borde: 6, posicion: 56, zoom: true, zoomCada: 3.5, zoomFactor: 1.07,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'arriba', recursoDuracion: 3, musicaVolumen: 0.07,
    },
    prompt: 'Edita el reel en el estilo de Jon Hernández (@jonhernandezia, divulgación de IA, en español): noticia y análisis. Él a cámara combinado con muchas capturas de pantalla (webs, herramientas, demos) con punch-in y recuadros o flechas sobre lo que señala. Ritmo ágil, cortes al grano. Subtítulos grandes quemados palabra a palabra y un titular fijo arriba con el nombre de la herramienta o el dato clave. B-roll de la interfaz del producto. SFX moderados. Gancho: «esto que acaba de salir…» + el nombre del modelo o la novedad + por qué importa. [Colores: aprox.]' + SOLO_ESTILO,
  },
  {
    clave: 'dotcsv',
    nombre: 'dotcsv',
    persona: 'Carlos Santana (Dot CSV)',
    nicho: 'divulgación de IA',
    tema: 'ia',
    idioma: 'es',
    enlace: 'https://www.youtube.com/@DotCSV',
    confianza: 'alta',
    fuentes: [
      'https://creatordb.app/creatorstats/dotcsv/',
      'https://blogthinkbig.com/?p=212413',
      'https://www.youtube.com/@DotCSV',
    ],
    reels: [],
    // Divulgación enérgica: mayúsculas con el término técnico resaltado, zooms
    // y gráficos explicativos a pantalla completa.
    estilo: {
      palabrasPorBloque: 3, mayusculas: true, colorTexto: '#FFFFFF', colorResalte: '#A78BFA', colorBorde: '#000000',
      tamano: 72, borde: 6, posicion: 64, zoom: true, zoomCada: 3.5, zoomFactor: 1.08,
      silencioMax: 0.3, silencioDeja: 0.08, recursosModo: 'corte', recursoDuracion: 3, musicaVolumen: 0.1,
    },
    prompt: 'Edita el reel en el estilo de Dot CSV (@dotcsv, divulgación de IA, en español). Talking head enérgico y entusiasta + muchos gráficos y animaciones que explican (esquemas de redes neuronales, diagramas), capturas de papers y demos de modelos. Ritmo dinámico con zooms y texto en pantalla que destaca los términos técnicos clave. B-roll: demos de los modelos, lo que generan y clips de archivo. Gancho: la novedad de IA + «esto lo cambia todo». Estructura: contexto → explicación visual paso a paso → qué implica. [Sonido, transiciones y colores: aprox.]' + SOLO_ESTILO,
  },

  // ── Fitness (infoproductor de habla hispana, añadido en lugar del duplicado) ─
  {
    clave: 'fitness.revolucionario',
    nombre: 'fitness.revolucionario',
    persona: 'Marcos Vázquez (Fitness Revolucionario)',
    nicho: 'fitness y salud basados en ciencia',
    tema: 'fitness',
    idioma: 'es',
    enlace: ig('fitness.revolucionario'),
    // Verificado: sus programas online (Momentum, Fundamentos, Strongvo), su
    // pódcast y sus libros. Su modo de editar NO está documentado: el estilo es
    // una aproximación a lo que se ve en su cuenta (divulgación sobria).
    confianza: 'baja',
    fuentes: [
      'https://www.fitnessrevolucionario.com/',
      'https://fitgeneration.es/mejores-cuentas-de-instagram-de-fitness-y-nutricion/',
      'https://www.podengine.ai/podcasts/radio-fitness-revolucionario',
    ],
    reels: [],
    estilo: {
      palabrasPorBloque: 4, mayusculas: false, colorTexto: '#FFFFFF', colorResalte: '#F97316', colorBorde: '#000000',
      tamano: 64, borde: 4, posicion: 68, zoom: true, zoomCada: 6, zoomFactor: 1.05,
      pausaFrase: 0.7, silencioMax: 0.45, silencioDeja: 0.14, recursosModo: 'corte', recursoDuracion: 3.5, musicaVolumen: 0.06,
    },
    prompt: 'Edita el reel en el estilo de Marcos Vázquez (@fitness.revolucionario, fitness y salud basados en ciencia, en español): divulgación sobria, que cuestiona los dogmas con datos. Talking head limpio, cortes al silencio sin prisa, subtítulos en minúscula normal con la palabra clave resaltada [color: aprox.]. Cuando cita un estudio o un dato, entra a pantalla completa una infografía o una captura sencilla (de las que publica en su cuenta) durante unos segundos. Poca música y sin efectos llamativos: la autoridad la pone el contenido. Gancho: una creencia de fitness que se cae («no necesitas…», «lo que dice la ciencia de…»). [Todo el estilo es aprox.: su forma de editar no está documentada.]' + SOLO_ESTILO,
  },
]

/** El estilo de referencia con esa clave, o null. */
export const buscaReferencia = (clave) => (clave ? ESTILOS_REFERENCIA.find(e => e.clave === clave) || null : null)

/** El estilo completo y válido para el motor (el de HELM si la clave no existe). */
export const estiloDeReferencia = (clave) => normalizaEstilo(buscaReferencia(clave)?.estilo || {})
