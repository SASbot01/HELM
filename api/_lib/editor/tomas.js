// HELM — Editor de reels: qué se queda del vídeo en bruto. PURO (sin Node,
// sin base de datos): de las palabras con sus tiempos (Whisper, palabra a
// palabra) saca los trozos del vídeo que van y las palabras que quedan, ya
// con el tiempo del vídeo editado.
//
// Lo que quita, en este orden:
//   1. Las muletillas sueltas: una frase entera que solo es «eh», «em»,
//      «mmm», «vale vale», «a ver»… (dentro de una frase no se toca nada:
//      cortar a mitad de frase se oye).
//   2. Las tomas repetidas: cuando alguien se equivoca y vuelve a empezar, la
//      frase de antes empieza igual que la de después. Va la ÚLTIMA toma; la
//      de antes (y lo que hubiera entre las dos) fuera.
//   3. Los silencios: los de más de `silencioMax` se quedan en `silencioDeja`
//      (repartido antes y después del corte, para no comerse ninguna sílaba).
//
// Las palabras llegan como [{ w, a, b, p }]: texto, inicio y fin en segundos
// del vídeo original y la probabilidad que da Whisper (no se usa para cortar).

// Una frase acaba en punto, interrogación, exclamación o puntos suspensivos
// (con comillas o paréntesis detrás, si los hay).
const FIN_FRASE = /[.!?…]["'»”)\]]*$/
// Sonidos de duda: eh, eeh, em, emm, mm, mmm, hmm, ah, uh, um.
const SONIDO = /^(e+h*|e+m+|m+|h+m+|a+h+|u+h+|u+m+)$/
// Palabras que solas no dicen nada, y las parejas que tampoco.
const RELLENO = new Set(['vale', 'bueno', 'venga', 'ok', 'okay', 'pues', 'vamos'])
const RELLENO_DOBLE = new Set(['a ver', 'o sea', 'vamos a'])
// Cuánto se mira hacia delante para encontrar la otra toma.
const VENTANA_FRASES = 4
const VENTANA_SEGUNDOS = 25
// Las primeras palabras que se comparan entre dos tomas (3–8).
const MIN_COMPARA = 3
const MAX_COMPARA = 8
// Lo que se deja antes de la primera palabra y después de la última.
const MARGEN_INICIO = 0.1
const COLA_FINAL = 0.35
// Un trozo más corto que esto no merece un corte.
const MIN_TRAMO = 0.2

const r3 = (n) => Math.round(n * 1000) / 1000

/** Para comparar: minúsculas, sin tildes ni signos. «¿Más?» → «mas». */
export function normaliza(w) {
  return String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Las palabras utilizables, en orden y con b ≥ a. */
export function limpiaPalabras(palabras) {
  return (Array.isArray(palabras) ? palabras : [])
    .map(p => ({ w: String(p?.w ?? '').trim(), a: Number(p?.a), b: Number(p?.b), p: p?.p == null ? null : Number(p.p) }))
    .filter(p => p.w && Number.isFinite(p.a) && Number.isFinite(p.b) && p.a >= 0)
    .map(p => ({ ...p, b: Math.max(p.a, p.b) }))
    .sort((x, y) => x.a - y.a)
}

/**
 * Parte las palabras en frases: corta en cada pausa de `pausaFrase` segundos
 * o más y después de cada punto. Cada frase: { i0, i1, a, b, texto, tokens }.
 */
export function frasesDe(palabras, { pausaFrase = 0.6 } = {}) {
  const trozos = []
  let actual = null
  palabras.forEach((p, i) => {
    const prev = palabras[i - 1]
    if (!actual || p.a - prev.b >= pausaFrase || FIN_FRASE.test(prev.w)) {
      actual = { i0: i, i1: i }
      trozos.push(actual)
    } else {
      actual.i1 = i
    }
  })
  return trozos.flatMap(t => partePorArranque(palabras, t.i0, t.i1)).map(([i0, i1]) => {
    const ps = palabras.slice(i0, i1 + 1)
    return {
      i0, i1,
      a: ps[0].a,
      b: ps[ps.length - 1].b,
      texto: ps.map(p => p.w).join(' '),
      tokens: ps.map(p => normaliza(p.w)).filter(Boolean),
    }
  })
}

/**
 * Una vuelta a empezar sin pausa ni punto («…venda más esta IA hace que…»):
 * si a mitad de la frase se repiten, tal cual, sus 3 primeras palabras (o
 * más), ahí empieza otra frase. Así la regla de las tomas la ve.
 */
function partePorArranque(palabras, i0, i1) {
  const conTexto = []
  for (let i = i0; i <= i1; i++) {
    const t = normaliza(palabras[i].w)
    if (t) conTexto.push({ i, t })
  }
  const ts = conTexto.map(x => x.t)
  for (let k = MIN_COMPARA; k + MIN_COMPARA <= ts.length; k++) {
    const m = Math.min(MAX_COMPARA, k, ts.length - k)
    if (m >= MIN_COMPARA && ts.slice(0, m).every((t, j) => t === ts[k + j])) {
      const corte = conTexto[k].i
      return [[i0, corte - 1], ...partePorArranque(palabras, corte, i1)]
    }
  }
  return [[i0, i1]]
}

/** ¿Es una frase que solo es muletilla? (sin ninguna palabra con contenido) */
export function esMuletilla(tokens) {
  if (!tokens.length) return true
  for (let k = 0; k < tokens.length;) {
    if (RELLENO_DOBLE.has(`${tokens[k]} ${tokens[k + 1]}`)) { k += 2; continue }
    if (SONIDO.test(tokens[k]) || RELLENO.has(tokens[k])) { k += 1; continue }
    return false
  }
  return true
}

/** Distancia de edición entre dos cadenas (para «negocio» / «negocios»). */
function distancia(x, y) {
  const m = x.length
  const n = y.length
  let fila = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const nueva = [i]
    for (let j = 1; j <= n; j++) {
      nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    fila = nueva
  }
  return fila[n]
}

/** Dos palabras son «la misma» si son iguales o, si son largas, casi. */
const iguales = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && distancia(x, y) <= 1)

/** Distancia de edición entre dos listas de palabras (cuántas cambian, sobran o faltan). */
function distanciaPalabras(xs, ys) {
  let fila = Array.from({ length: ys.length + 1 }, (_, j) => j)
  for (let i = 1; i <= xs.length; i++) {
    const nueva = [i]
    for (let j = 1; j <= ys.length; j++) {
      nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (iguales(xs[i - 1], ys[j - 1]) ? 0 : 1))
    }
    fila = nueva
  }
  return fila[ys.length]
}

/**
 * ¿Es `despues` otra toma de `antes`? Se comparan las primeras palabras de
 * `antes` (entre 3 y 8) con las primeras de lo que se dice a partir de
 * `despues` (que puede seguir en la frase siguiente, si hubo una pausa a
 * mitad de la toma buena). Tolera una palabra cambiada, de más o de menos,
 * siempre que la similitud llegue a `umbral`.
 *   → { n, distancia, similitud } si lo es, o null.
 */
export function comparaTomas(antes, despues, umbral = 0.6) {
  const n = Math.min(antes.length, MAX_COMPARA)
  if (n < MIN_COMPARA || despues.length < MIN_COMPARA) return null
  const base = antes.slice(0, n)
  let mejor = Infinity
  for (const m of [n - 1, n, n + 1]) {
    if (m < MIN_COMPARA || m > despues.length) continue
    mejor = Math.min(mejor, distanciaPalabras(base, despues.slice(0, m)))
  }
  const permitidas = Math.min(1, Math.floor(n * (1 - umbral) + 1e-9))
  const similitud = 1 - mejor / n
  return mejor <= permitidas && similitud >= umbral ? { n, distancia: mejor, similitud: r3(similitud) } : null
}

/**
 * Qué frases se quitan y por qué: Map(índice → 'muletilla' | 'toma').
 */
export function frasesQuitadas(frases, { quitarTomas = true, quitarMuletillas = true, similitudTomas = 0.6 } = {}) {
  const quitar = new Map()
  if (quitarMuletillas) frases.forEach((f, i) => { if (esMuletilla(f.tokens)) quitar.set(i, 'muletilla') })
  if (!quitarTomas) return quitar

  // Todas las palabras seguidas (sin las muletillas), para leer lo que se
  // dice desde el principio de una frase aunque siga en la siguiente.
  const seguidas = []
  const desde = []
  frases.forEach((f, i) => {
    desde[i] = seguidas.length
    if (quitar.get(i) !== 'muletilla') seguidas.push(...f.tokens)
  })
  const lo = (j, n) => seguidas.slice(desde[j], desde[j] + n)

  for (let i = 0; i < frases.length; i++) {
    if (quitar.has(i)) continue
    const fi = frases[i]
    const ti = fi.tokens
    let siguiente = -1 // la frase con contenido que va justo después
    for (let j = i + 1; j < frases.length && j <= i + VENTANA_FRASES; j++) {
      const fj = frases[j]
      if (fj.a - fi.a > VENTANA_SEGUNDOS) break
      if (quitar.get(j) === 'muletilla' || !fj.tokens.length) continue
      if (siguiente < 0) siguiente = j

      let retoma = Boolean(comparaTomas(ti, lo(j, MAX_COMPARA + 1), similitudTomas))
      // Un arranque en falso de una o dos palabras («Esta… Esta IA hace…»):
      // solo si es idéntico al principio de la frase de justo después.
      if (!retoma && ti.length < MIN_COMPARA && j === siguiente && fj.tokens.length > ti.length) {
        retoma = ti.every((t, k) => t === fj.tokens[k])
      }
      if (retoma) {
        for (let k = i; k < j; k++) if (!quitar.has(k)) quitar.set(k, 'toma')
        break
      }
    }
  }

  // Lo último que se dice es un arranque que se dejó a medias: empieza igual
  // que una frase anterior y se corta antes de llegar a decir lo mismo.
  const ultimas = frases.map((f, i) => i).filter(i => !quitar.has(i))
  const fin = ultimas.at(-1)
  if (fin != null) {
    const tf = lo(fin, MAX_COMPARA + 1)
    if (tf.length >= 2 && tf.length < MIN_COMPARA + 2) {
      const previa = ultimas.slice(0, -1).reverse().slice(0, VENTANA_FRASES)
        .find(i => frases[fin].a - frases[i].a <= VENTANA_SEGUNDOS && frases[i].tokens.length > tf.length
          && distanciaPalabras(frases[i].tokens.slice(0, tf.length), tf) === 0)
      if (previa != null) quitar.set(fin, 'toma')
    }
  }
  return quitar
}

/**
 * Los trozos del original que van y las palabras que quedan, con el tiempo
 * del vídeo editado.
 *   palabras → [{ w, a, b, p }] del original
 *   opciones → el estilo (pausaFrase, silencioMax, silencioDeja, quitarTomas,
 *              similitudTomas, quitarMuletillas)
 *   duracion → del original (s), para no pasarse del final
 *
 * Devuelve { segmentos: [{a, b}], palabras: [{w, a, b}], frases, duracion, resumen }.
 */
export function tomasDe(palabrasCrudas, opciones = {}, duracion = null) {
  const o = { pausaFrase: 0.6, silencioMax: 0.4, silencioDeja: 0.12, quitarTomas: true, quitarMuletillas: true, similitudTomas: 0.6, ...opciones }
  const D = Number(duracion) > 0 ? Number(duracion) : Infinity
  const palabras = limpiaPalabras(palabrasCrudas).filter(p => p.a < D)
  if (!palabras.length) return sinCortes(duracion, [], opciones.fps)

  const frases = frasesDe(palabras, o)
  const quitar = frasesQuitadas(frases, o)
  const fuera = new Uint8Array(palabras.length)
  frases.forEach((f, i) => { if (quitar.has(i)) for (let k = f.i0; k <= f.i1; k++) fuera[k] = 1 })
  // Si todo son muletillas o tomas, algo ha ido mal: mejor el vídeo entero.
  if (fuera.every(Boolean)) return { ...sinCortes(duracion, palabras, opciones.fps), frases: resumenFrases(frases, new Map()) }

  // El silencio que se deja en cada corte, repartido: un poco antes de la
  // palabra (para el ataque de la consonante) y algo más después (la cola).
  const antes = Math.max(0.04, o.silencioDeja * 0.4)
  const despues = Math.max(0.04, o.silencioDeja - antes)

  const segmentos = []
  let seg = null
  let silencios = 0
  const cierra = () => {
    const k = seg.ultima
    const w = palabras[k]
    let b
    if (k + 1 >= palabras.length) b = Math.min(D, w.b + COLA_FINAL)
    else if (!fuera[k + 1]) b = w.b + despues
    else b = Math.max(w.b, Math.min(w.b + despues, palabras[k + 1].a - 0.02))
    seg.b = Math.min(D, b)
    segmentos.push(seg)
    seg = null
  }
  for (let k = 0; k < palabras.length; k++) {
    if (fuera[k]) continue
    const w = palabras[k]
    if (seg && seg.ultima === k - 1 && w.a - palabras[k - 1].b <= o.silencioMax) {
      seg.ultima = k
      seg.indices.push(k)
      continue
    }
    if (seg) {
      if (seg.ultima === k - 1) silencios++
      cierra()
    }
    let a
    if (k === 0) a = Math.max(0, w.a - MARGEN_INICIO)
    else if (!fuera[k - 1] && segmentos.length) a = w.a - antes
    else a = Math.min(w.a, Math.max(w.a - antes, palabras[k - 1].b + 0.02))
    seg = { a: Math.max(0, a), ultima: k, indices: [k] }
  }
  if (seg) cierra()

  // Trozos que se tocan o se pisan (palabras muy juntas a los dos lados de un
  // corte) se unen. Y todos los cortes, a la rejilla de fotogramas de la
  // salida (1/30 s): así la imagen y el sonido de cada trozo duran justo lo
  // mismo, el editado dura lo que dice el plan y los subtítulos no se van
  // desfasando corte a corte.
  const fps = Number(o.fps) > 0 ? Number(o.fps) : 30
  const ultimoFotograma = Number.isFinite(D) ? Math.floor(D * fps + 1e-6) : Infinity
  const enRejilla = []
  for (const s of segmentos) {
    const fa = Math.max(0, Math.round(s.a * fps))
    const fb = Math.min(ultimoFotograma, Math.round(s.b * fps))
    const prev = enRejilla.at(-1)
    if (prev && fa <= prev.fb + Math.round(0.04 * fps)) {
      prev.fb = Math.max(prev.fb, fb)
      prev.indices.push(...s.indices)
    } else if (fb > fa) {
      enRejilla.push({ fa, fb, indices: [...s.indices] })
    }
  }
  const buenos = enRejilla
    .filter(s => s.fb - s.fa >= Math.ceil(MIN_TRAMO * fps))
    .map(s => ({ a: s.fa / fps, b: s.fb / fps, indices: s.indices }))

  // El tiempo del vídeo editado: cada trozo empieza donde acabó el anterior.
  const salida = []
  let t = 0
  for (const s of buenos) {
    for (const k of s.indices) {
      const w = palabras[k]
      salida.push({ w: w.w, a: r3(t + Math.max(0, w.a - s.a)), b: r3(t + Math.min(s.b, w.b) - s.a) })
    }
    t += s.b - s.a
  }
  const resFrases = resumenFrases(frases, quitar)
  const total = r3(t)
  return {
    segmentos: buenos.map(s => ({ a: r3(s.a), b: r3(s.b) })),
    palabras: salida,
    frases: resFrases,
    duracion: total,
    resumen: {
      tomas: resFrases.filter(f => f.estado === 'toma').length,
      muletillas: resFrases.filter(f => f.estado === 'muletilla').length,
      silencios,
      cortes: Math.max(0, buenos.length - 1),
      segundosQuitados: Number.isFinite(D) ? r3(Math.max(0, D - total)) : null,
    },
  }
}

function resumenFrases(frases, quitar) {
  return frases.map((f, i) => ({ a: r3(f.a), b: r3(f.b), texto: f.texto, estado: quitar.get(i) || 'va' }))
}

/** Sin palabras (o sin voz): el vídeo entero, tal cual (hasta el último fotograma entero). */
export function sinCortes(duracion, palabras = [], fps = 30) {
  const f = Number(fps) > 0 ? Number(fps) : 30
  const D = Number(duracion) > 0 ? Math.floor(Number(duracion) * f + 1e-6) / f : 0
  return {
    segmentos: D ? [{ a: 0, b: r3(D) }] : [],
    palabras: palabras.filter(p => p.a < D).map(p => ({ w: p.w, a: r3(p.a), b: r3(Math.min(p.b, D)) })),
    frases: [],
    duracion: r3(D),
    resumen: { tomas: 0, muletillas: 0, silencios: 0, cortes: 0, segundosQuitados: Number(duracion) > 0 ? r3(Number(duracion) - D) : 0 },
  }
}
