// HELM — Portadas con IA: los estilos. Lo comparten la pantalla (las tarjetas
// con su ejemplo) y la API (el prompt que se manda a la IA).
//
// La portada se genera con nano-banana-pro (Google, vía Replicate) a partir
// de un FOTOGRAMA REAL del reel: la persona es la del vídeo y el prompt pide
// conservarla tal cual (cara, ropa, accesorios). No se inventan caras. Si el
// estilo tiene una portada de referencia, se manda también como segunda
// imagen, SOLO para copiar el estilo (nunca su persona ni sus textos).
//
// Las referencias son portadas de reels que Alex eligió como ejemplo (llevan
// el botón de play que pone Instagram: el prompt dice que se ignore). Viven en
// public/agentes/portadas-estilos/<clave>-ref.jpg. La tarjeta enseña una
// portada hecha con este mismo generador (<clave>.jpg) si la hay (`ejemplo`);
// si no, la referencia.
//
// Además de estos, cada perfil puede subir SUS ejemplos (api/portadas.js ·
// ejemplos): se guardan con su nombre y se mandan como referencia de estilo.

export const ESTILOS_IA = [
  {
    clave: 'oro',
    nombre: 'Título dorado',
    desc: 'Pódcast premium: título gigante en oro 3D arriba y una notificación encima de la persona.',
    origen: null,
    referencia: false,
    ejemplo: true,
    estilo: 'Style: cinematic premium podcast thumbnail. The person sits in the lower two thirds in a dark, warm recording studio with soft bokeh lights and acoustic panels. At the top, the TITLE as a HUGE extra-condensed bold sans-serif headline spanning the full width, in metallic gold with a 3D extrusion and soft drop shadow; the top of the person\'s head slightly overlaps the bottom of the title. Over the person\'s chest, a sleek dark translucent rounded iOS-style notification card with a small rounded app icon and two short lines of text related to the topic (first line: an app or brand name in bold; second line: a short alert in Spanish).',
  },
  {
    clave: 'neon',
    nombre: 'Objeto 3D y neón',
    desc: 'Arriba, un objeto 3D del tema con el título en neón; abajo, tú en un estudio tech.',
    origen: { perfil: 'rpn', reel: 'https://www.instagram.com/reel/Dd4WsE-Pd43/' },
    referencia: true,
    ejemplo: true,
    estilo: 'Copy the layout and look of the style reference: the top half is a striking, glossy 3D object shot related to the topic, with the TITLE in big glowing neon-white rounded letters over it; the bottom half is the person in a cinematic tech studio with monitors and warm practical lights; high contrast, dark palette.',
  },
  {
    clave: 'noticia',
    nombre: 'Noticia tech',
    desc: 'Un objeto icónico del tema arriba, el título limpio como un logo y tú debajo, como en una noticia.',
    origen: { perfil: 'rpn', reel: 'https://www.instagram.com/reel/DecWaVFJC4v/' },
    referencia: true,
    estilo: 'Copy the layout and look of the style reference: the top half is a clean, bright product-style shot of an iconic object related to the topic on a light neutral background, with the TITLE below it in a clean white sans-serif with a small colorful logo-like icon before it, like a tech news announcement; the bottom half is the person in a modern studio, energetic expression. Bright, clean, editorial.',
  },
  {
    clave: 'arco',
    nombre: 'Serif en arco + apps',
    desc: 'Título elegante en arco arriba y una columna de apps a un lado. Para listas de herramientas.',
    origen: { perfil: 'felipetambara.ia', reel: 'https://www.instagram.com/reel/Db1JYvvRXxG/' },
    referencia: true,
    ejemplo: true,
    estilo: 'Copy the look of the style reference: dark moody room with colored accent lights, the person in the lower right half, the TITLE in an elegant white serif font curved in an arc across the top, and on the left a vertical column of 3 or 4 rounded app-icon tiles with their names in white (use the apps named in the details if any; otherwise well-known apps that fit the topic).',
  },
  {
    clave: 'collage',
    nombre: 'Collage de recortes',
    desc: 'Letras recortadas de revista y un collage de fotos. Para motivación, objetivos, estilo de vida.',
    origen: { perfil: 'austingeorgas', reel: 'https://www.instagram.com/reel/DAzCFqTRxWm/' },
    referencia: true,
    estilo: 'Copy the look of the style reference: a white background; the TITLE built from mismatched cut-out magazine letters (ransom-note style, different colors and fonts per letter) at the top; below, a tight vision-board collage of photos related to the topic, and the person cut out and placed prominently in the collage.',
  },
  {
    clave: 'datos',
    nombre: 'Dato que choca',
    desc: 'Fondo claro, comparación con iconos y una frase en negro y rojo. Para desmontar mitos.',
    origen: { perfil: 'izansimon', reel: 'https://www.instagram.com/reel/DeR0RncIjeH/' },
    referencia: true,
    estilo: 'Copy the look of the style reference: a light grey/white textured background; at the top a simple visual comparison with flat icons and arrows related to the topic; in the middle the TITLE in very bold black sans-serif with one key word in red; the person in the lower part, natural light, looking at the camera.',
  },
  {
    clave: 'libre',
    nombre: 'A tu manera',
    desc: 'Describe el estilo que quieres o sube una portada de ejemplo y la IA lo copia.',
    origen: null,
    referencia: false,
    estilo: '',
  },
]

export const estiloIaPorClave = (k) => ESTILOS_IA.find(e => e.clave === k) || null

/** La imagen de la tarjeta y la referencia (lo que se manda a la IA) de un estilo. */
export const ejemploDe = (e) => (e.ejemplo || !e.referencia ? `/agentes/portadas-estilos/${e.clave}.jpg` : `/agentes/portadas-estilos/${e.clave}-ref.jpg`)
export const referenciaDe = (e) => (e.referencia ? `public/agentes/portadas-estilos/${e.clave}-ref.jpg` : null)

export const MAX_TITULO_IA = 60
export const MAX_DETALLE_IA = 400
export const MAX_EJEMPLOS = 24
export const MAX_NOMBRE_EJEMPLO = 40

/**
 * El prompt para la IA. `imagenes`: cuántas van (1 = solo el fotograma;
 * 2 = fotograma + referencia de estilo, la del estilo o la que subió el
 * usuario). En inglés, que es como mejor sigue las instrucciones; el TÍTULO
 * va tal cual, en español.
 */
export function promptPortadaIa({ estilo, titulo, tema = '', detalle = '', imagenes = 1 }) {
  const t = String(titulo || '').trim()
  const lineas = [
    'Create a vertical 9:16 Instagram Reel cover (thumbnail).',
    'Image 1 is a real frame from the creator\'s video: use THIS SAME PERSON exactly — same face, facial features, skin, hair, glasses, cap, beard, tattoos and clothes. Do not change their identity, age or body. Remove and ignore any text, subtitles, logos or interface graphics that appear in image 1.',
  ]
  if (imagenes > 1) {
    lineas.push('Image 2 is a STYLE REFERENCE ONLY: copy its layout, typography style, color grading and graphic elements, but never its person, products, brand names or words, and ignore any white circular play button or Instagram interface in it.')
  }
  if (estilo?.estilo) lineas.push(estilo.estilo)
  if (detalle) lineas.push(`Extra details from the creator (follow them): ${String(detalle).trim()}`)
  if (tema) lineas.push(`Topic of the video, for choosing objects and imagery (do not write it on the cover): ${String(tema).trim()}`)
  lineas.push(
    `TITLE, exactly as written, in Spanish, with these exact characters and accents: «${t}». Spell it perfectly. Apart from the title, only add the few short words a described element needs (such as app names or a notification line), in Spanish.`,
    'Keep all text inside the central safe area (not in the top 6% or the bottom 14% of the image), large and readable at a small size. No watermark, no play button, no Instagram interface, no borders.',
  )
  return lineas.join('\n')
}
