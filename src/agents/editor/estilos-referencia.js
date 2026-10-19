// HELM — Editor de reels: la biblioteca de estilos de referencia.
//
// Cada estilo lleva el NOMBRE DEL PERFIL de donde salen los reels de ejemplo
// (lo pidió Alex el 2026-10-19). En el editor, debajo de la portada, cada uno
// tendrá dos botones:
//   · «Crear»        → monta el vídeo con ese estilo (HELM). Usa `estilo`, el
//                      preset numérico de ./estilo.js (subtítulos, punch-in,
//                      corte). Queda null hasta que el editor analice el audio
//                      de los reels de ejemplo (Whisper + cortes) y lo rellene.
//   · «Copiar prompt» → copia `prompt`, para que Claude lo haga por el MCP.
//
// `prompt` SÍ está escrito: sale de mirar FOTOGRAMAS reales de cada reel
// (2026-10-19), así que describe lo que se ve —formato, subtítulos, rótulos,
// color, encuadre— y marca como «a ajustar» lo que un fotograma no da (el
// ritmo exacto de cortes y zoom, que depende del audio). Los reels de ejemplo
// son REFERENCIAS para sacar el estilo, no para copiar su contenido.
export const ESTILOS_REFERENCIA = [
  {
    clave: 'rpn',
    nombre: 'rpn',
    nicho: 'noticias de IA / tech',
    idioma: 'en',
    prototipoMiniatura: true, // Dd4WsE-Pd43 vale además de prototipo de portada
    reels: [
      { shortcode: 'DecWaVFJC4v', url: 'https://www.instagram.com/reel/DecWaVFJC4v/', caption: 'Google is releasing Gemini 4 Argon today', likes: 4174 },
      { shortcode: 'Dd4WsE-Pd43', url: 'https://www.instagram.com/reel/Dd4WsE-Pd43/', caption: 'OpenAI just launched dots (GPT-6 Astra)', likes: 19552 },
    ],
    estilo: null,
    prompt: 'Edita el reel en el estilo de rpn (divulgación tech). Alterna dos modos: (1) PANTALLA PARTIDA — arriba un render o gráfico 3D que explica el tema con rótulos tipo etiqueta (cajas con línea que señalan cada parte, acentos neón cian/verde); abajo el talking head en estudio, con luz cinematográfica y poca profundidad de campo. (2) B-ROLL a pantalla completa cuando se ilustra algo (capturas de producto, grabaciones de pantalla de la app/web de la que se habla). Subtítulos: blancos, negrita, MAYÚSCULAS, 1–3 palabras por bloque, centrados a media altura; resalta alguna palabra o cifra clave en amarillo. Corte rápido y seco (cambia de plano o b-roll cada ~2 s) con algún punch-in. Paleta oscura, alto contraste. Tono: noticia tech enérgica. [Ritmo exacto de cortes y zoom: ajustar al analizar el audio.]',
  },
  {
    clave: 'austingeorgas',
    nombre: 'austingeorgas',
    nicho: 'motivación / vision board',
    idioma: 'en',
    reels: [
      { shortcode: 'DAzCFqTRxWm', url: 'https://www.instagram.com/reel/DAzCFqTRxWm/', caption: 'Your life can change at any moment', likes: 9589 },
    ],
    estilo: null,
    prompt: 'Edita el reel en el estilo de austingeorgas (motivacional, vision board). Las palabras clave aparecen con tipografía RECORTADA tipo revista (ransom note: cada letra en una fuente y color distintos) sobre COLLAGES de fotos (tablero de visión) animados con zoom rápido. Intercala b-roll de vida aspiracional: apartamento con vistas a la ciudad, éxito tranquilo, lifestyle. Subtítulos del discurso en blanco, minúscula, sans-serif limpia, pocas palabras, a media altura (distintos de la tipografía decorativa de los titulares). Música épica en crescendo. Color natural y cálido en el metraje; las letras recortadas de colores son el acento. [Ritmo de cortes: ajustar al audio.]',
  },
  {
    clave: 'pedrobuerbaum',
    nombre: 'pedrobuerbaum',
    nicho: 'negocio / mentalidad',
    idioma: 'es',
    reels: [
      { shortcode: 'DefGBtXkpLl', url: 'https://www.instagram.com/reel/DefGBtXkpLl/', caption: 'La pregunta detrás de cada decisión que tomo', likes: 6895 },
    ],
    estilo: null,
    prompt: 'Edita el reel en el estilo de pedrobuerbaum (negocio/mentalidad premium, en español). Una sola toma CINEMATOGRÁFICA y de moda: el protagonista con gafas de sol y ropa negra, en la calle de una ciudad con coches de fondo; cámara con poca profundidad de campo y color desaturado/frío, look caro. Monólogo directo a cámara. Subtítulos blancos, minúscula, sans-serif, pocas palabras, alineados abajo a la izquierda a media altura. Ritmo suave, cortes limpios entre tomas de la misma escena, SIN gráficos ni rótulos. Sobrio y elegante. [Ritmo de cortes: ajustar al audio.]',
  },
  {
    clave: 'samzia',
    nombre: 'samzia',
    nicho: 'mentalidad / grind',
    idioma: 'en',
    reels: [
      { shortcode: 'DeZzFbfPCw-', url: 'https://www.instagram.com/reel/DeZzFbfPCw-/', caption: 'Don’t have time to sit and relax', likes: 32413 },
      { shortcode: 'DdcjzkthTA7', url: 'https://www.instagram.com/reel/DdcjzkthTA7/', caption: 'You know exactly what you need to be doing', likes: 9476 },
    ],
    estilo: null,
    prompt: 'Edita el reel en el estilo de samzia (mentalidad, grind hacia el éxito). SOLO b-roll cinematográfico, oscuro y aspiracional, sin talking head: skyline nocturno con luces de ciudad, figura con capucha frente a pantallas de código/trading, interiores de lujo minimalistas. Color frío, oscuro, alto contraste, poca profundidad de campo. Subtítulos blancos, negrita, minúscula, UNA palabra por plano, centrados a media altura, al ritmo de la música. Cada plano dura ~2 s con una sola palabra: muy minimalista. Tono: grind solitario, épico. [Ritmo exacto al audio.]',
  },
  {
    clave: 'felipetambara.ia',
    nombre: 'felipetambara.ia',
    nicho: 'IA / listas de herramientas',
    idioma: 'pt',
    // Probado de verdad el 2026-10-19 en el reel 1019 de Alex (render con
    // Pillow + ffmpeg en el server, helm-ops/tmp/edicion-1019/render.py).
    reels: [
      { shortcode: 'Db1JYvvRXxG', url: 'https://www.instagram.com/reel/Db1JYvvRXxG/', caption: 'Salva esse vídeo pra não perder as ferramentas', likes: 12900 },
    ],
    estilo: null,
    prompt: 'Edita el reel en el estilo de felipetambara.ia (listas de herramientas). Talking head fijo, sin b-roll. Cada vez que dice «usa esto para X», CORTE SECO a un set nuevo, un fotograma antes de la frase: arriba un TÍTULO en serif blanca (Instrument Serif) curvado en arco, en español («Generar ideas», «Generar vídeos», «Generar imágenes», «Organización», «Automatizaciones»); a la izquierda una COLUMNA de 4 apps de esa categoría (icono de app con esquinas redondeadas + nombre en blanco seminegrita; logos sin tarjeta tal cual), que entra con un pop corto de un fotograma por fila. Ningún nombre puede tapar ojos o boca: si es largo, va en la última fila. Subtítulos en minúscula, blancos, sans medium (Inter), palabra a palabra, abajo a la derecha sobre el pecho, en trozos «usa esto para» + palabra clave, sin pasar del 86 % del ancho (botones de Instagram). Si el fondo es claro, degradado oscuro suave arriba y a la izquierda y sombra doble en los textos. Cierre en «guarda este vídeo»: título «Guárdalo» + icono de guardar. Audio normalizado a −14 LUFS, pico ≤ −2 dBTP. Primer fotograma con el set completo (es la portada por defecto).',
  },
  {
    clave: 'izansimon',
    nombre: 'izansimon',
    nicho: 'fitness',
    idioma: 'es',
    reels: [
      { shortcode: 'DeR0RncIjeH', url: 'https://www.instagram.com/reel/DeR0RncIjeH/', caption: 'Comenta “RECOMPOSICIÓN” y te mando el sistema', likes: 725 },
    ],
    estilo: null,
    prompt: 'Edita el reel en el estilo de izansimon (fitness, en español, formato pódcast/reacción). Talking head con micrófono de pódcast y fondo de ventana con skyline. Sobre la parte inferior, TARJETAS INSERTADAS (picture-in-picture) con borde de color (rosa) que muestran aquello de lo que habla: fotos de físico antes/después, capturas. Dos tipos de subtítulo: (a) una ETIQUETA de tema en caja negra redondeada con texto blanco en minúscula (p. ej. «el poder de la recomposición corporal»), que aparece cuando toca el punto; y (b) el subtítulo del habla en blanco, palabra a palabra. Ritmo medio; corta a la imagen insertada justo cuando la menciona. Color natural y brillante. [Ritmo de cortes: ajustar al audio.]',
  },
]
