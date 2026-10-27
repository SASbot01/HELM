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
//
// Desde el 27-oct hay además los ESTILOS DE MINIATURA de la investigación de
// creadores (los de habla hispana, los de negocio en inglés y los de IA):
// lo que hacen unos 30 creadores, agrupado en 15 estilos que de verdad se
// distinguen, cada uno con un nombre genérico. `para` dice quién lo usa, SOLO
// como referencia y con su perfil público; `aproximado` marca lo que la fuente
// no describe con detalle (colores, letra). No llevan imagen: la tarjeta pinta
// una vista previa con CSS a partir de `vista` (vistaDe, abajo, y
// ./VistaEstilo.jsx). Su prompt NUNCA pide la cara, el logo ni la marca de
// nadie: la persona es siempre la del fotograma o la foto del usuario, y los
// objetos y pantallas, genéricos y sin marca. `mayusculas`: el titular se manda
// en mayúsculas (con tildes). `usaMarca`: se le pasan los colores del kit de
// la serie del perfil.

const P = (nombre, enlace) => ({ nombre, enlace })
const CREADORES = {
  munoz: P('Carlos «Máster» Muñoz', 'https://www.youtube.com/@mastermunozoficial'),
  oller: P('Euge Oller', 'https://www.youtube.com/@EmprendeAprendiendo'),
  fons: P('Romuald Fons', 'https://www.youtube.com/@romualdfonstv'),
  vilma: P('Vilma Núñez', 'https://www.instagram.com/vilmanunez'),
  feito: P('Oscar Feito', 'https://oscarfeito.gumroad.com/'),
  jon: P('Jon Hernández', 'https://www.youtube.com/@la_inteligencia_artificial'),
  klaric: P('Jürgen Klarić', 'https://www.youtube.com/@jurgenklaricchannel'),
  ajram: P('Josef Ajram', 'https://www.instagram.com/josefajram'),
  ribas: P('Laura Ribas', 'https://lauraribas.com'),
  dieck: P('Moris Dieck', 'https://www.youtube.com/@morisdieck'),
  hormozi: P('Alex Hormozi', 'https://www.youtube.com/@AlexHormozi'),
  abdaal: P('Ali Abdaal', 'https://www.youtube.com/@aliabdaal'),
  codie: P('Codie Sanchez', 'https://www.youtube.com/@CodieSanchezCT'),
  garyvee: P('GaryVee', 'https://www.instagram.com/garyvee/'),
  bartlett: P('Steven Bartlett', 'https://www.youtube.com/@TheDiaryOfACEO'),
  koe: P('Dan Koe', 'https://www.youtube.com/@DanKoeTalks'),
  welsh: P('Justin Welsh', 'https://www.linkedin.com/in/justinwelsh'),
  cardone: P('Grant Cardone', 'https://www.youtube.com/@grantcardone'),
  kallaway: P('Kallaway', 'https://www.instagram.com/kallaway/'),
  wolfe: P('Matt Wolfe', 'https://www.youtube.com/@mreflow'),
  riley: P('Riley Brown', 'https://x.com/rileybrown_ai'),
  isenberg: P('Greg Isenberg', 'https://www.youtube.com/@GregIsenberg'),
  rowan: P('Rowan Cheung', 'https://x.com/rowancheung'),
  jeffsu: P('Jeff Su', 'https://www.youtube.com/@JeffSu'),
  dotcsv: P('Dot CSV', 'https://www.youtube.com/@DotCSV'),
  galloway: P('Paddy Galloway', 'https://www.youtube.com/@paddygalloway'),
  colinsamir: P('Colin and Samir', 'https://www.youtube.com/@ColinandSamir'),
}
const de = (...claves) => claves.map(k => CREADORES[k])

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

  // ── Estilos de miniatura de la investigación (27-oct) ────────────────────
  {
    clave: 'verdad',
    nombre: 'Verdad incómoda',
    desc: 'Tú a un lado, serio, y una frase corta y tajante en mayúsculas sobre fondo oscuro: «DEJA DE…», «NADIE TE DICE…».',
    para: de('munoz', 'klaric', 'cardone'),
    aproximado: true,
    consejo: 'Elige un fotograma en el que mires a cámara, serio.',
    mayusculas: true,
    estilo: 'Style: a hard-hitting "uncomfortable truth" thumbnail. Dark, almost black background (a dim stage or studio, slightly blurred). The person on one side (right or left third), looking straight at the camera with the serious expression they have in image 1, lit with strong contrast. On the other side, the TITLE in a HUGE, heavy, condensed sans-serif, stacked in 2 or 3 lines, white with a thick black outline, and the most important word in bright yellow. Palette: black, white, yellow and a touch of red. Nothing else: no icons, no logos.',
    vista: { fondo: ['#0B0B0D', '#1E1A16'], tinta: '#FFFFFF', resalte: '#FFD21F', letra: 'condensada', sitio: 'centro', persona: 'derecha', titular: 'Nadie te lo dice', resaltada: 'Nadie' },
  },
  {
    clave: 'reaccion',
    nombre: 'Reacción y flechas',
    desc: 'Tu cara en grande, colores vivos, texto con contorno gordo y flechas o círculos rojos señalando lo importante.',
    para: de('fons', 'oller', 'dotcsv'),
    aproximado: true,
    consejo: 'Funciona si en el fotograma tienes cara de sorpresa: la IA no te cambia el gesto.',
    estilo: 'Style: an energetic, colorful thumbnail. Bright saturated background (a yellow, blue or red gradient). The person big in the foreground, cut out with a thin white outline, keeping the expression they have in image 1. Next to them, one simple generic object or screen related to the topic, with one or two thick hand-drawn RED ARROWS and a red circle pointing at it. The TITLE in 2–4 words, very big, bold rounded sans-serif, white with a thick black outline and a soft drop shadow. Generic, unbranded objects only: no real logos or brand names.',
    vista: { fondo: ['#2F7BFF', '#FFD21F'], tinta: '#FFFFFF', contorno: '#000000', resalte: '#FF2D2D', letra: 'redonda', sitio: 'arriba', persona: 'izquierda', adorno: 'flechas', titular: '¡Esto funciona!', resaltada: 'funciona' },
  },
  {
    clave: 'novedad',
    nombre: 'Lo cambia todo',
    desc: 'La novedad del día: tú junto a la herramienta o la pantalla nueva, en tonos tech, con una flecha a lo nuevo.',
    para: de('jon', 'wolfe', 'rowan', 'dotcsv'),
    aproximado: true,
    estilo: 'Style: a tech-news reaction thumbnail. Dark navy-to-black background with a subtle glowing grid. On one side the person, keeping their expression from image 1; on the other side a big, glowing, GENERIC interface of a new AI tool (an unbranded chat window or app screen with abstract shapes; no real product interface, no logos). One bright accent color (electric cyan or lime) for a single arrow or circle pointing at the new thing. The TITLE short and very high-contrast, in a white bold sans-serif, with the key word in the accent color.',
    vista: { fondo: ['#071224', '#0E2547'], tinta: '#FFFFFF', resalte: '#22D3EE', letra: 'limpia', sitio: 'arriba', persona: 'derecha', adorno: 'pantalla', titular: 'Esta IA lo cambia todo', resaltada: 'todo' },
  },
  {
    clave: 'resultado',
    nombre: 'Resultado en pantalla',
    desc: 'Tú y, al lado, la pantalla con lo que has conseguido (la app hecha, el panel, la venta). Texto corto que lo anuncia.',
    para: de('riley', 'jeffsu'),
    aproximado: true,
    estilo: 'Style: a clean "here is the result" thumbnail. Solid or softly graded light background (off-white or pale blue). The person on one side with a clear, friendly expression. On the other side a large, slightly tilted laptop or phone screen showing a polished, GENERIC result related to the topic (a finished app, a dashboard with a rising chart, a completed page): unbranded, no real product interfaces, no logos. The TITLE in 2–4 big words in a bold, clean dark sans-serif announcing the result and how fast or easy it was, with one word in a blue accent color. Crisp, low noise, slightly desaturated.',
    vista: { fondo: ['#F4F6FA', '#DCE6F5'], tinta: '#0F172A', resalte: '#2563EB', letra: 'limpia', sitio: 'arriba', persona: 'izquierda', adorno: 'pantalla', titular: 'Mi app en 10 minutos', resaltada: '10' },
  },
  {
    clave: 'numero',
    nombre: 'Número grande',
    desc: 'Una cifra enorme manda (3 ideas, 10.000 €, 7 días) y tú al lado. Para listas, dinero y plazos.',
    para: de('isenberg', 'dieck', 'vilma'),
    aproximado: true,
    consejo: 'Pon la cifra en el titular, en número: «3 ideas…», «10.000 €…».',
    estilo: 'Style: a "big number" thumbnail. Strong, saturated background (deep green, royal blue or black). The person on one side. The number in the TITLE (if there is one) rendered GIGANTIC, taking almost half of the cover, in a heavy sans-serif with a thick contrasting outline or inside a bright box, and the rest of the title smaller next to it or underneath. Optionally a few simple flat money or calendar symbols (€, $, a small upward chart arrow). No logos.',
    vista: { fondo: ['#064E3B', '#0B3B2E'], tinta: '#FFFFFF', resalte: '#FACC15', letra: 'condensada', sitio: 'arriba', persona: 'derecha', adorno: 'cifra', titular: '3 ideas para vender', resaltada: '3' },
  },
  {
    clave: 'marca',
    nombre: 'Marca premium',
    desc: 'Ordenado y de marca: tu foto cuidada, fondo en tu color y un titular limpio con una palabra en tu color de resalte. Sin gritos.',
    para: de('vilma', 'ribas', 'feito'),
    aproximado: true,
    usaMarca: true,
    estilo: 'Style: a tidy, premium personal-brand cover. A solid background in the brand main color (or a soft, clean studio backdrop in that color), the person well lit, centered or slightly to one side, looking polished. The TITLE in a clean, modern sans-serif (medium-bold, sentence case), 3–6 words on two lines, with exactly one word in the brand accent color. Generous margins, no outlines, no arrows, no emojis: elegant and calm, not sensational.',
    vista: { fondo: ['#F5EFE6', '#EADFCF'], tinta: '#1F2937', resalte: '#C2410C', letra: 'limpia', sitio: 'arriba', persona: 'centro', titular: '5 formas de vender más', resaltada: 'vender' },
  },
  {
    clave: 'aire',
    nombre: 'Mucho aire',
    desc: 'Minimalista: mucho espacio vacío, uno o dos colores, la idea en letra grande y limpia y tú en pequeño.',
    para: de('koe', 'welsh', 'ribas'),
    aproximado: true,
    estilo: 'Style: a minimalist, editorial cover with a lot of empty space. A flat background in one calm color (off-white, sand or charcoal) and at most one accent color. The TITLE is the protagonist: large, clean sans-serif or elegant serif, left-aligned, sentence case, with plenty of breathing room. The person small, in the lower part or a corner, simple and calm. No arrows, no outlines, no clutter, no icons.',
    vista: { fondo: ['#F3F1EC', '#F3F1EC'], tinta: '#111111', resalte: '#B45309', letra: 'serif', sitio: 'arriba', persona: 'pequena', titular: 'Trabaja menos, piensa más', resaltada: 'piensa' },
  },
  {
    clave: 'esquema',
    nombre: 'Esquema en pizarra',
    desc: 'Un esquema sencillo (pirámide, tres opciones, círculos que se cruzan) que explica la idea de un vistazo, con colores apagados.',
    para: de('abdaal'),
    aproximado: true,
    estilo: 'Style: a calm, educational "framework" thumbnail. Muted palette (soft sage greens, warm creams, soft charcoal) with ONE single accent color. Soft bokeh background, like a cozy study. The person with the calm expression they have in image 1, on one side. On the other side a simple hand-drawn, whiteboard-style DIAGRAM that explains the topic at a glance (a pyramid, a 2x2 grid, three option cards or a Venn diagram) with very few words. The TITLE in 2–4 words, clean dark sans-serif. No logos.',
    vista: { fondo: ['#E7E5DA', '#CFD6C4'], tinta: '#1F2A24', resalte: '#B45309', letra: 'limpia', sitio: 'arriba', persona: 'derecha', adorno: 'pizarra', titular: 'El sistema que uso', resaltada: 'sistema' },
  },
  {
    clave: 'antes',
    nombre: 'Antes y después',
    desc: 'La portada partida en dos: a un lado cómo estaba, al otro cómo queda, con una flecha en medio. Para cambios y resultados.',
    para: de('abdaal', 'galloway'),
    aproximado: true,
    estilo: 'Style: a split "before and after" thumbnail. The cover is divided in two halves by a clean diagonal or vertical line: the "before" side dull, grey and desaturated, the "after" side bright, saturated and warm, with a bold arrow from before to after. The person appears only once, on the "after" side, keeping their expression. Each side shows one simple generic visual related to the topic (no logos). The TITLE short and very readable across the top, white bold sans-serif with a dark outline. Optionally tiny labels "ANTES" and "DESPUÉS".',
    vista: { fondo: ['#6B7280', '#F97316'], tinta: '#FFFFFF', contorno: '#111111', resalte: '#FDE047', letra: 'condensada', sitio: 'arriba', persona: 'derecha', adorno: 'antes-despues', titular: 'De 0 a 1.000 clientes', resaltada: '1.000' },
  },
  {
    clave: 'gancho',
    nombre: 'Gancho en el arranque',
    desc: 'Como en los reels: la portada es el arranque del vídeo, tal cual, con la frase gancho en grande sobre una franja oscura.',
    para: de('hormozi', 'codie', 'garyvee'),
    mayusculas: true,
    estilo: 'Style: the cover looks like the opening frame of the video itself. Keep the scene and background of image 1 almost as they are (natural, unpolished, real), only slightly darkened. Across the upper-middle part, the TITLE as the spoken hook in BIG bold uppercase sans-serif, white, filling the width, with one key word in yellow and a subtle dark band behind it for readability. No graphics, no icons, no logos.',
    vista: { fondo: ['#3A3A3A', '#151515'], tinta: '#FFFFFF', caja: '#111111', resalte: '#FACC15', letra: 'condensada', sitio: 'centro', persona: 'centro', adorno: 'escena', titular: 'Nadie te cuenta esto', resaltada: 'Nadie' },
  },
  {
    clave: 'mitad',
    nombre: 'Mitad y mitad',
    desc: 'Arriba, una imagen potente del tema (el producto, la pantalla, el sitio); abajo, tú hablando. El gancho, en la costura.',
    para: de('kallaway', 'riley'),
    estilo: 'Style: an immersive split thumbnail. The TOP HALF is a striking, cinematic, full-bleed visual of the topic (a product, a screen, a place or a concept; generic and unbranded). The BOTTOM HALF is the person from image 1 talking to camera in their own setting. Where the two halves meet, the TITLE in 2–4 words, bold modern sans-serif, white with a thin dark outline and a soft shadow, with one word in a bright amber accent. Clean, high contrast, no logos.',
    vista: { fondo: ['#1D4ED8', '#18181B'], tinta: '#FFFFFF', contorno: '#000000', resalte: '#F59E0B', letra: 'limpia', sitio: 'centro', persona: 'abajo', adorno: 'mitad', titular: 'Por qué esto lo cambia todo', resaltada: 'todo' },
  },
  {
    clave: 'cita',
    nombre: 'Frase entre comillas',
    desc: 'Una frase tuya, corta y que choca, entre comillas y en grande, con tu cara al lado. Para entrevistas, pódcast y opiniones.',
    para: de('bartlett', 'garyvee', 'colinsamir'),
    aproximado: true,
    estilo: 'Style: a bold quote thumbnail, like a podcast clip. Dark, moody studio background with soft rim light. The person on one side, keeping the expression they have in image 1. The TITLE as a short, provocative quote between big Spanish angle quotes « », in a heavy white sans-serif filling most of the width, with one or two words in a warm orange accent color. Minimal: no icons, no logos.',
    vista: { fondo: ['#111827', '#030712'], tinta: '#FFFFFF', resalte: '#FB923C', letra: 'condensada', sitio: 'centro', persona: 'izquierda', adorno: 'comillas', titular: 'Nadie quiere oír esto', resaltada: 'Nadie' },
  },
  {
    clave: 'contexto',
    nombre: 'En tu sitio, sin filtro',
    desc: 'Tú en tu sitio de verdad (delante de las pantallas, entrenando, en el taller) y una frase corta. Real, poco retocado.',
    para: de('ajram'),
    aproximado: true,
    estilo: 'Style: a raw, authentic "behind the scenes" cover. Keep the real setting of image 1 (screens, gym, workshop, street) and its natural light; only improve sharpness and contrast slightly: no studio look, no heavy retouching. The TITLE short (2–5 words), about mindset or discipline, in a bold white condensed sans-serif with a subtle shadow, in the upper part. No graphics, no icons, no logos.',
    vista: { fondo: ['#44403C', '#1C1917'], tinta: '#FFFFFF', resalte: '#F87171', letra: 'condensada', sitio: 'arriba', persona: 'centro', adorno: 'escena', titular: 'Disciplina o excusas', resaltada: 'Disciplina' },
  },
  {
    clave: 'entrevista',
    nombre: 'Entrevista',
    desc: 'Tú y tu invitado, cara a cara, y la frase más fuerte de la charla. Solo si salís los dos en el fotograma: la IA no se inventa a nadie.',
    para: de('feito', 'isenberg', 'colinsamir', 'bartlett'),
    aproximado: true,
    consejo: 'Elige un fotograma en el que salgáis los dos.',
    estilo: 'Style: a clean interview/podcast thumbnail. Keep EVERY person who appears in image 1 exactly as they are (if there are two, both of them; never add anyone who is not in image 1). Place them side by side against a dark, simple studio background with soft colored rim lights. The TITLE as a short, curiosity-driven line in a heavy white sans-serif in the upper part, with one word in a warm amber accent color. Editorial and premium. No logos.',
    vista: { fondo: ['#1E1B4B', '#0F0D2E'], tinta: '#FFFFFF', resalte: '#FBBF24', letra: 'limpia', sitio: 'arriba', persona: 'dos', titular: 'Así montó su negocio', resaltada: 'negocio' },
  },
  {
    clave: 'foco',
    nombre: 'Un solo foco',
    desc: 'Una sola cosa que se entiende en un segundo: una imagen que plantea una pregunta y 0–3 palabras que no repiten el título.',
    para: de('galloway'),
    estilo: 'Style: a "one focus" curiosity thumbnail that is understood in under a second. Clean, uncluttered background with very high contrast and saturated color. ONE single focal point: the person, keeping their expression from image 1, next to ONE intriguing object or situation related to the topic that raises a question (something unexpected, oversized or out of place; generic and unbranded). The TITLE is at most 3 big words with a thick dark outline, complementing the image instead of describing it. Nothing else on the cover.',
    vista: { fondo: ['#7C3AED', '#4C1D95'], tinta: '#FFFFFF', contorno: '#000000', resalte: '#FDE047', letra: 'redonda', sitio: 'arriba', persona: 'izquierda', adorno: 'foco', titular: 'No lo hagas', resaltada: 'No' },
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

/**
 * La imagen de la tarjeta de un estilo: la portada hecha con este generador
 * (`ejemplo`), si no la de referencia, y si no tiene ninguna, null (la tarjeta
 * pinta entonces su vista previa con CSS, vistaDe; «A tu manera» lleva icono).
 */
export const ejemploDe = (e) => {
  if (e?.ejemplo) return `/agentes/portadas-estilos/${e.clave}.jpg`
  if (e?.referencia) return `/agentes/portadas-estilos/${e.clave}-ref.jpg`
  return null
}
/** La referencia que se manda a la IA (solo para copiar el estilo), o null. */
export const referenciaDe = (e) => (e?.referencia ? `public/agentes/portadas-estilos/${e.clave}-ref.jpg` : null)

// ── La vista previa con CSS de los estilos sin imagen ──────────────────────
const HEX = /^#[0-9a-f]{6}$/i
// `tam`: el cuerpo, en % del ancho de la tarjeta (la estrecha, más grande).
const LETRAS_VISTA = {
  condensada: { familia: '"Barlow Condensed", "Arial Narrow", sans-serif', peso: 900, tam: 16 },
  limpia: { familia: '"Inter Tight", system-ui, sans-serif', peso: 800, tam: 11.5 },
  redonda: { familia: '"Inter Tight", system-ui, sans-serif', peso: 800, tam: 12 },
  serif: { familia: 'Georgia, "Times New Roman", serif', peso: 600, tam: 12.5 },
}
export const SITIOS_VISTA = ['arriba', 'centro', 'abajo']
export const PERSONAS_VISTA = ['derecha', 'izquierda', 'centro', 'abajo', 'pequena', 'dos', 'ninguna']
export const ADORNOS_VISTA = ['flechas', 'pantalla', 'pizarra', 'antes-despues', 'comillas', 'cifra', 'mitad', 'escena', 'foco']
const sinSignos = (p) => String(p || '').replace(/^[¿¡"'«(]+|[?!"'».,:;)]+$/g, '').toLocaleLowerCase('es-ES')
const color = (c, defecto) => (HEX.test(String(c || '')) ? String(c).toUpperCase() : defecto)

/**
 * Lo que pinta la tarjeta de un estilo sin imagen, ya saneado: el degradado de
 * fondo, la letra, dónde va el titular y la silueta de la persona (una forma
 * neutra, nunca una cara), y el titular de ejemplo palabra a palabra con la
 * resaltada marcada. `marca` (el kit de la serie): los estilos `usaMarca` se
 * enseñan con sus colores. `detras`: los colores sobre los que se lee el
 * titular (la caja, el contorno o el fondo donde cae), para medir el contraste.
 * null si el estilo tiene imagen (o no hay estilo).
 */
export function vistaDe(estilo, marca = null) {
  if (!estilo || ejemploDe(estilo) || !estilo.vista) return null
  const v = estilo.vista
  let fondo = [color(v.fondo?.[0], '#111111'), color(v.fondo?.[1] ?? v.fondo?.[0], '#111111')]
  let tinta = color(v.tinta, '#FFFFFF')
  let resalte = color(v.resalte, '#FFD21F')
  if (estilo.usaMarca && marca && HEX.test(marca.colorPrincipal || '') && HEX.test(marca.colorResalte || '')) {
    fondo = [marca.colorPrincipal.toUpperCase(), marca.colorPrincipal.toUpperCase()]
    resalte = marca.colorResalte.toUpperCase()
    tinta = luz(fondo[0]) > 0.4 ? '#111111' : '#FFFFFF'
  }
  const caja = v.caja ? color(v.caja, null) : null
  const contorno = v.contorno ? color(v.contorno, null) : null
  const sitio = SITIOS_VISTA.includes(v.sitio) ? v.sitio : 'arriba'
  const letra = LETRAS_VISTA[v.letra] || LETRAS_VISTA.limpia
  const mayus = Boolean(estilo.mayusculas)
  const objetivo = sinSignos(v.resaltada)
  const texto = String(v.titular || estilo.nombre || '').trim()
  const palabras = texto.split(/\s+/).filter(Boolean).map(p => ({
    texto: mayus ? p.toLocaleUpperCase('es-ES') : p,
    resaltada: Boolean(objetivo) && sinSignos(p) === objetivo,
  }))
  const detras = caja ? [caja] : contorno ? [contorno] : sitio === 'arriba' ? [fondo[0]] : sitio === 'abajo' ? [fondo[1]] : fondo
  return {
    fondo,
    degradado: v.adorno === 'antes-despues'
      ? `linear-gradient(90deg, ${fondo[0]} 0 50%, ${fondo[1]} 50% 100%)`
      : `linear-gradient(180deg, ${fondo[0]}, ${fondo[1]})`,
    tinta, resalte, caja, contorno, sitio,
    familia: letra.familia, peso: letra.peso, tam: letra.tam,
    persona: PERSONAS_VISTA.includes(v.persona) ? v.persona : 'centro',
    adorno: ADORNOS_VISTA.includes(v.adorno) ? v.adorno : null,
    // La silueta, con la tinta muy suave: se ve que ahí va la persona sin
    // dibujar a nadie.
    silueta: luz(fondo[1]) > 0.4 ? 'rgba(17,17,17,0.22)' : 'rgba(255,255,255,0.20)',
    palabras,
    detras,
  }
}

// Luminancia relativa (WCAG) de un #RRGGBB, para elegir tinta y silueta.
function luz(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

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
export function promptPortadaIa({ estilo, titulo, tema = '', detalle = '', imagenes = 1, colores = null }) {
  const limpio = String(titulo || '').trim()
  // Los estilos en mayúsculas las piden aquí, con sus tildes: la IA copia el
  // titular «tal cual», así que se le da ya escrito como tiene que salir.
  const t = estilo?.mayusculas ? limpio.toLocaleUpperCase('es-ES') : limpio
  const lineas = [
    'Create a vertical 9:16 Instagram Reel cover (thumbnail).',
    'Image 1 is a real frame from the creator\'s video: use THIS SAME PERSON exactly — same face, facial features, skin, hair, glasses, cap, beard, tattoos and clothes. Do not change their identity, age or body. Remove and ignore any text, subtitles, logos or interface graphics that appear in image 1.',
    'Never add any other real person, celebrity or recognizable face that is not in image 1.',
  ]
  if (imagenes > 1) {
    lineas.push('Image 2 is a STYLE REFERENCE ONLY: copy its layout, typography style, color grading and graphic elements, but never its person, products, brand names or words, and ignore any white circular play button or Instagram interface in it.')
  }
  if (estilo?.estilo) lineas.push(estilo.estilo)
  if (estilo?.usaMarca && Array.isArray(colores) && colores.length) {
    lineas.push(`The creator's brand colors (use them as the main and accent colors): ${colores.slice(0, 2).join(', ')}.`)
  }
  if (detalle) lineas.push(`Extra details from the creator (follow them): ${String(detalle).trim()}`)
  if (tema) lineas.push(`Topic of the video, for choosing objects and imagery (do not write it on the cover): ${String(tema).trim()}`)
  lineas.push(
    `TITLE, exactly as written, in Spanish, with these exact characters and accents: «${t}». Spell it perfectly. Apart from the title, only add the few short words a described element needs (such as app names or a notification line), in Spanish.`,
    'Keep all text inside the central safe area (not in the top 6% or the bottom 14% of the image), large and readable at a small size. No watermark, no play button, no Instagram interface, no borders.',
  )
  return lineas.join('\n')
}
