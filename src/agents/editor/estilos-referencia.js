// HELM — Editor de reels: la biblioteca de estilos de referencia.
//
// Cada estilo lleva el NOMBRE DEL PERFIL de donde salen los reels de ejemplo
// (lo pidió Alex el 2026-10-19). En el editor, debajo de la portada, cada uno
// tendrá dos botones:
//   · «Crear»        → monta el vídeo con ese estilo (HELM, con los parámetros
//                      de `estilo`, el modelo de ./estilo.js).
//   · «Copiar prompt» → copia `prompt`, para que Claude lo haga por el MCP.
//
// Los reels de ejemplo son REFERENCIAS para caracterizar el estilo, no para
// copiarlos: de ellos se saca el ritmo, el tipo de subtítulo y el corte, no su
// contenido. `estilo` y `prompt` quedan a null/'' a propósito: se rellenan
// cuando el editor pueda analizar cada vídeo (Whisper + detección de cortes) o
// cuando Alex describa cada estilo. No se inventan valores aquí.
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
    prompt: '',
  },
  {
    clave: 'austingeorgas',
    nombre: 'austingeorgas',
    nicho: 'motivación',
    idioma: 'en',
    reels: [
      { shortcode: 'DAzCFqTRxWm', url: 'https://www.instagram.com/reel/DAzCFqTRxWm/', caption: 'Your life can change at any moment', likes: 9589 },
    ],
    estilo: null,
    prompt: '',
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
    prompt: '',
  },
  {
    clave: 'samzia',
    nombre: 'samzia',
    nicho: 'mentalidad',
    idioma: 'en',
    reels: [
      { shortcode: 'DeZzFbfPCw-', url: 'https://www.instagram.com/reel/DeZzFbfPCw-/', caption: 'Don’t have time to sit and relax', likes: 32413 },
      { shortcode: 'DdcjzkthTA7', url: 'https://www.instagram.com/reel/DdcjzkthTA7/', caption: 'You know exactly what you need to be doing', likes: 9476 },
    ],
    estilo: null,
    prompt: '',
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
    prompt: '',
  },
]
