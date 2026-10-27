// HELM — Editor de reels: los subtítulos palabra a palabra. PURO.
//
//   · bloquesDe() — junta las palabras que quedan (con el tiempo del vídeo
//     editado) en bloques de N palabras que caben en una línea.
//   · assDe() — el archivo .ass que quema ffmpeg (filtro `ass`, libass): cada
//     bloque se ve entero y la palabra que suena va en el color de resalte.
//
// La letra es Montserrat ExtraBold, que va en el repo (./fuentes, licencia
// OFL): el servidor solo tiene DejaVu y Liberation, y sin `fontsdir` libass
// pondría cualquiera.
import { ZONA_SUBTITULOS, LIENZO } from '../../../src/agents/editor/estilo.js'

// El nombre de familia que lee libass (el «name ID 1» del TTF).
export const FUENTE_ASS = 'Montserrat ExtraBold'
export const ARCHIVO_FUENTE = 'Montserrat-ExtraBold.ttf'

// Lo que avanza cada carácter de Montserrat ExtraBold, en «em» (sacado del
// propio TTF, tablas cmap y hmtx): para saber si un bloque cabe en una línea
// sin tener que medir con la letra cargada. Lo que no está, como una «M».
const ANCHOS = {"0":0.685,"1":0.405,"2":0.599,"3":0.603,"4":0.7,"5":0.607,"6":0.649,"7":0.632,"8":0.669,"9":0.649," ":0.291,"A":0.786,"B":0.769,"C":0.73,"D":0.826,"E":0.672,"F":0.642,"G":0.77,"H":0.806,"I":0.339,"J":0.557,"K":0.752,"L":0.61,"M":0.954,"N":0.806,"O":0.846,"P":0.737,"Q":0.846,"R":0.74,"S":0.647,"T":0.635,"U":0.786,"V":0.766,"W":1.184,"X":0.737,"Y":0.693,"Z":0.679,"Á":0.786,"É":0.672,"Í":0.339,"Ó":0.846,"Ú":0.786,"Ü":0.786,"Ñ":0.806,"a":0.628,"b":0.695,"c":0.603,"d":0.698,"e":0.642,"f":0.406,"g":0.705,"h":0.696,"i":0.313,"j":0.32,"k":0.677,"l":0.313,"m":1.045,"n":0.696,"o":0.666,"p":0.695,"q":0.695,"r":0.443,"s":0.547,"t":0.447,"u":0.692,"v":0.62,"w":0.956,"x":0.619,"y":0.62,"z":0.556,"á":0.628,"é":0.642,"í":0.313,"ó":0.666,"ú":0.692,"ü":0.692,"ñ":0.696,"¿":0.597,"?":0.597,"¡":0.301,"!":0.301,"%":0.897,"€":0.819,"$":0.647,"@":1.036,"#":0.73,"&":0.752,"+":0.609,"-":0.388,"–":0.5,"—":1,"«":0.605,"»":0.605,"\"":0.462,"'":0.242,".":0.283,",":0.283,":":0.283,";":0.283,"(":0.369,")":0.369,"/":0.415,"*":0.453}
const ANCHO_DESCONOCIDO = 0.954
export const ANCHO_UTIL = ZONA_SUBTITULOS.x1 - ZONA_SUBTITULOS.x0

/** Lo que mide un texto en una línea, en píxeles del lienzo (con su borde). */
export function anchoTexto(texto, estilo) {
  let em = 0
  for (const ch of String(texto)) em += ANCHOS[ch] ?? ANCHO_DESCONOCIDO
  return em * estilo.tamano + 2 * (estilo.borde || 0)
}

// Un bloque aparece un pelo antes de su primera palabra, y si el siguiente
// llega enseguida, el de antes se queda hasta entonces (sin parpadeos).
const ADELANTO = 0.05
const HUECO_SIN_PARPADEO = 0.4
const COLA_ULTIMO = 0.3
// Donde acaba una frase o hay una coma, empieza otro bloque.
const CORTA_BLOQUE = /[.!?…,;:]["'»”)\]]*$/

const r3 = (n) => Math.round(n * 1000) / 1000

/**
 * La palabra tal y como se pinta: sin la puntuación del final (salvo ? y !),
 * en mayúsculas si toca (con sus tildes y su Ñ) y sin lo que libass leería
 * como una orden ({ } y \).
 */
export function textoDePalabra(w, mayusculas = true) {
  let t = String(w || '').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim()
  t = t.replace(/[.,;:…]+(["'»”)\]]*)$/, '$1').replace(/^["'«“(]+|["'»”)]+$/g, '')
  return mayusculas ? t.toLocaleUpperCase('es-ES') : t
}

/**
 * Los bloques de subtítulos. `palabras` con el tiempo del vídeo editado
 * ([{ w, a, b }], en orden). Cada bloque: { a, b, texto, palabras: [{ w, a, b }] },
 * con `w` ya en el texto que se pinta.
 */
export function bloquesDe(palabras, estilo, duracion = null) {
  const D = Number(duracion) > 0 ? Number(duracion) : Infinity
  const bloques = []
  let actual = null
  let cortaDespues = false
  for (const p of Array.isArray(palabras) ? palabras : []) {
    const w = textoDePalabra(p.w, estilo.mayusculas)
    if (!w || !(p.b >= p.a)) continue
    const conEsta = actual ? `${actual.palabras.map(x => x.w).join(' ')} ${w}` : w
    if (!actual || cortaDespues || actual.palabras.length >= estilo.palabrasPorBloque || anchoTexto(conEsta, estilo) > ANCHO_UTIL) {
      actual = { palabras: [] }
      bloques.push(actual)
    }
    actual.palabras.push({ w, a: p.a, b: p.b })
    cortaDespues = CORTA_BLOQUE.test(String(p.w).trim())
  }
  bloques.forEach((bl, i) => {
    const previo = bloques[i - 1]
    bl.a = Math.max(previo ? previo.palabras.at(-1).b : 0, bl.palabras[0].a - ADELANTO, 0)
    bl.b = bl.palabras.at(-1).b
  })
  bloques.forEach((bl, i) => {
    const siguiente = bloques[i + 1]
    if (siguiente && siguiente.a - bl.b < HUECO_SIN_PARPADEO) bl.b = siguiente.a
    else if (!siguiente) bl.b = Math.min(D, bl.b + COLA_ULTIMO)
    bl.a = r3(bl.a)
    bl.b = r3(Math.max(bl.b, bl.a + 0.1))
    bl.texto = bl.palabras.map(x => x.w).join(' ')
  })
  return bloques.map(bl => ({ a: bl.a, b: bl.b, texto: bl.texto, palabras: bl.palabras.map(x => ({ w: x.w, a: r3(x.a), b: r3(x.b) })) }))
}

// ── El archivo .ass ─────────────────────────────────────────────────────────

/** #RRGGBB → &HAABBGGRR (ASS guarda los colores al revés, con la transparencia delante). */
export function colorAss(hex, alfa = 0) {
  const h = String(hex || '#FFFFFF').replace('#', '').padStart(6, '0').slice(0, 6).toUpperCase()
  const a = Math.max(0, Math.min(255, Math.round(alfa))).toString(16).padStart(2, '0').toUpperCase()
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`
}
/** El mismo color para una orden dentro del texto: {\c&HBBGGRR&}. */
const colorEnLinea = (hex) => `${colorAss(hex).replace(/^&H00/, '&H')}&`

/** Segundos → H:MM:SS.cc (centésimas: lo que entiende ASS). */
export function tiempoAss(seg) {
  const cs = Math.max(0, Math.round(Number(seg) * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

/**
 * El .ass entero. Un evento por palabra: el bloque completo, con la palabra
 * que suena en el color de resalte, desde que empieza esa palabra hasta que
 * empieza la siguiente (la primera, desde que aparece el bloque; la última,
 * hasta que se va). Así nunca hay dos a la vez ni un hueco entre ellas.
 */
export function assDe(bloques, estilo, { lienzo = LIENZO, fuente = FUENTE_ASS } = {}) {
  const { ancho: W, alto: H } = lienzo
  const mL = ZONA_SUBTITULOS.x0
  const mR = W - ZONA_SUBTITULOS.x1
  const cx = Math.round((mL + (W - mR)) / 2)
  const cy = Math.round((H * estilo.posicion) / 100)
  const sombra = estilo.borde > 0 ? Math.min(4, Math.round(estilo.borde / 2)) : 0
  const lineas = [
    '[Script Info]',
    '; HELM — subtítulos del Editor de reels',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: HELM,${fuente},${estilo.tamano},${colorAss(estilo.colorTexto)},${colorAss(estilo.colorResalte)},${colorAss(estilo.colorBorde)},${colorAss(estilo.colorBorde, 110)},0,0,0,0,100,100,0,0,1,${estilo.borde},${sombra},5,${mL},${mR},0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  const resalte = colorEnLinea(estilo.colorResalte)
  const normal = colorEnLinea(estilo.colorTexto)
  for (const bl of bloques) {
    // Una palabra sola que no cabe se encoge hasta caber (nunca menos del 60 %).
    const ancho = anchoTexto(bl.texto, estilo)
    const escala = ancho > ANCHO_UTIL ? Math.max(60, Math.floor((100 * ANCHO_UTIL) / ancho)) : 100
    const cabeza = `{\\an5\\pos(${cx},${cy})${escala < 100 ? `\\fscx${escala}\\fscy${escala}` : ''}}`
    bl.palabras.forEach((p, i) => {
      const ini = i === 0 ? bl.a : p.a
      const fin = i === bl.palabras.length - 1 ? bl.b : bl.palabras[i + 1].a
      if (Math.round(fin * 100) <= Math.round(ini * 100)) return
      const texto = bl.palabras.map((x, j) => (j === i ? `{\\c${resalte}}${x.w}{\\c${normal}}` : x.w)).join(' ')
      lineas.push(`Dialogue: 0,${tiempoAss(ini)},${tiempoAss(fin)},HELM,,0,0,0,,${cabeza}${texto}`)
    })
  }
  return lineas.join('\n') + '\n'
}
