// HELM — Portadas de reels: el compositor. Pinta la portada en un canvas de
// 1080×1920 con el fotograma real del reel y la tipografía de la serie.
//
// Dos mitades a propósito:
//   · maquetar() decide tamaños, líneas y posiciones con una función de medir
//     que se le pasa: sin canvas, para poder probarla (tests/portadas.test.js);
//   · pintar() dibuja ese plan en un contexto 2D de verdad.
//
// La cara no se toca: el fotograma va tal cual, solo encuadrado. Ninguna IA
// dibuja aquí (ver api/portadas.js: por qué).
import {
  LIENZO, TAM_MINIMO, LETRAS, palabrasDe, quitaSignos, primeraCifra, tintaSobre, contraste,
} from './reglas.js'

const { ancho: W, alto: H } = LIENZO

/**
 * Parte las palabras en líneas que quepan en `anchoMax`, con el tamaño más
 * grande posible entre `tamMax` y `tamMin`. Si ni al mínimo cabe, devuelve el
 * mínimo igualmente (las comprobaciones lo marcarán).
 */
export function ajusta({ palabras, anchoMax, lineasMax, tamMax, tamMin, medir }) {
  const parte = (tam) => {
    const lineas = []
    let actual = []
    for (const p of palabras) {
      const prueba = [...actual, p].join(' ')
      if (actual.length && medir(prueba, tam) > anchoMax) { lineas.push(actual); actual = [p] }
      else actual.push(p)
    }
    if (actual.length) lineas.push(actual)
    return lineas
  }
  for (let tam = tamMax; tam >= tamMin; tam -= 2) {
    const lineas = parte(tam)
    if (lineas.length <= lineasMax && lineas.every(l => medir(l.join(' '), tam) <= anchoMax)) return { tam, lineas, cabe: true }
  }
  return { tam: tamMin, lineas: parte(tamMin), cabe: false }
}

const esResaltada = (palabra, resaltada) =>
  Boolean(resaltada) && quitaSignos(palabra).toLowerCase() === quitaSignos(resaltada).toLowerCase()

/**
 * El plan de una portada: qué texto va dónde y con qué tamaño. `medir(texto,
 * tam)` devuelve el ancho en px con la letra de la marca.
 */
export function maquetar({ texto, resaltada = '', secundario = '', plantilla, marca, medir }) {
  const may = (s) => (marca.mayusculas ? String(s || '').toLocaleUpperCase('es-ES') : String(s || ''))
  const T = may(texto)
  const R = may(resaltada)
  const S = may(secundario)
  const plan = { plantilla, bloques: [], cajas: [], tam: 0 }
  const linea = (palabras, tam, cx, y, extra = {}) => ({ palabras, tam, cx, y, ancho: medir(palabras.join(' '), tam), ...extra })

  if (plantilla === 'numero' && primeraCifra(T)) {
    const cifra = primeraCifra(T)
    const resto = palabrasDe(T.replace(cifra, '').replace(/\s+/g, ' ').trim())
    const num = ajusta({ palabras: [cifra], anchoMax: 380, lineasMax: 1, tamMax: 520, tamMin: 200, medir })
    const lado = ajusta({ palabras: resto.length ? resto : [''], anchoMax: 560, lineasMax: 3, tamMax: 110, tamMin: 80, medir })
    const altoNum = num.tam * 0.9
    const yNum = 340 + altoNum
    plan.bloques.push({ tipo: 'cifra', lineas: [linea([cifra], num.tam, 60 + num.lineas.length * 0, yNum, { izquierda: 60 })], color: 'resalte' })
    const altoLado = lado.lineas.length * lado.tam * 1.02
    const y0 = 340 + (altoNum - altoLado) / 2 + lado.tam * 0.85
    plan.bloques.push({
      tipo: 'imagen', color: 'blanco',
      lineas: lado.lineas.map((l, i) => linea(l, lado.tam, 0, y0 + i * lado.tam * 1.02, { izquierda: 460 })),
    })
    plan.tam = lado.tam
    plan.cajas.push({ x0: 60, x1: 60 + medir(cifra, num.tam), y0: 340, y1: 340 + altoNum })
    plan.cajas.push({ x0: 460, x1: 460 + Math.max(...plan.bloques[1].lineas.map(l => l.ancho)), y0: y0 - lado.tam * 0.85, y1: y0 + (lado.lineas.length - 1) * lado.tam * 1.02 + lado.tam * 0.2 })
    plan.degradado = 'arriba'
    return conResaltada(plan, R)
  }

  if (plantilla === 'arriba' || plantilla === 'numero') {
    const a = ajusta({ palabras: palabrasDe(T), anchoMax: 960, lineasMax: 3, tamMax: 180, tamMin: TAM_MINIMO, medir })
    const paso = a.tam * 1.02
    // Por debajo del icono de reel (y 240–340), que en la cuadrícula va encima.
    const arriba = 370
    const y0 = arriba + a.tam * 0.85
    plan.bloques.push({ tipo: 'imagen', color: 'blanco', lineas: a.lineas.map((l, i) => linea(l, a.tam, W / 2, y0 + i * paso)) })
    let yFin = y0 + (a.lineas.length - 1) * paso + a.tam * 0.2
    if (S) {
      const s = Math.max(54, Math.round(a.tam * 0.42))
      plan.bloques.push({ tipo: 'imagen', color: 'resalte', lineas: [linea(palabrasDe(S), s, W / 2, yFin + s * 1.2)] })
      yFin += s * 1.4
    }
    plan.tam = a.tam
    // Una caja por línea: el bloque entero como rectángulo tocaría el icono de
    // reel aunque ninguna línea llegue a él.
    for (const b of plan.bloques) {
      for (const l of b.lineas) plan.cajas.push({ x0: l.cx - l.ancho / 2, x1: l.cx + l.ancho / 2, y0: l.y - l.tam * 0.85, y1: l.y + l.tam * 0.2 })
    }
    if (yFin > plan.cajas.at(-1).y1) plan.cajas.at(-1).y1 = yFin
    plan.degradado = 'arriba'
    return conResaltada(plan, R)
  }

  if (plantilla === 'pregunta') {
    const texto = /^[«"]/.test(T) ? T : `«${T.replace(/^["']|["']$/g, '')}»`
    const a = ajusta({ palabras: palabrasDe(texto), anchoMax: 820, lineasMax: 3, tamMax: 120, tamMin: TAM_MINIMO, medir })
    const paso = a.tam * 1.08
    const alto = a.lineas.length * paso + 2 * 56
    const y0 = 960 - alto / 2
    plan.caja = { x0: 90, x1: 990, y0, y1: y0 + alto, radio: 28, color: 'resalte' }
    plan.bloques.push({
      tipo: 'caja', color: 'tintaResalte',
      lineas: a.lineas.map((l, i) => linea(l, a.tam, W / 2, y0 + 56 + a.tam * 0.85 + i * paso)),
    })
    plan.tam = a.tam
    plan.cajas.push({ x0: 90, x1: 990, y0, y1: y0 + alto })
    plan.degradado = 'suave'
    return conResaltada(plan, R)
  }

  if (plantilla === 'etiqueta') {
    const a = ajusta({ palabras: palabrasDe(T), anchoMax: 700, lineasMax: 2, tamMax: 104, tamMin: 90, medir })
    const paso = a.tam * 1.02
    const alto = Math.max(170, a.lineas.length * paso + 2 * 34)
    const y0 = 1180 - alto / 2
    plan.pildora = { x0: 60, x1: 1020, y0, y1: y0 + alto, radio: alto / 2 }
    plan.sello = { cx: 60 + 22 + 65, cy: y0 + alto / 2, r: 65, texto: (marca.etiqueta || '').slice(0, 3).toLocaleUpperCase('es-ES') }
    const x = 60 + 22 + 130 + 28
    plan.bloques.push({
      tipo: 'pildora', color: 'blanco',
      lineas: a.lineas.map((l, i) => linea(l, a.tam, 0, y0 + (alto - a.lineas.length * paso) / 2 + a.tam * 0.85 + i * paso, { izquierda: x })),
    })
    plan.tam = a.tam
    plan.cajas.push({ x0: 60, x1: 1020, y0, y1: y0 + alto })
    plan.degradado = 'suave'
    return conResaltada(plan, R)
  }

  // costura (y lo que no se reconozca)
  const a = ajusta({ palabras: palabrasDe(T), anchoMax: 864, lineasMax: 3, tamMax: 150, tamMin: TAM_MINIMO, medir })
  const pad = { x: 28, y: 18 }
  const paso = a.tam * 1.05 + 2 * pad.y + 12
  const alto = a.lineas.length * paso - 12
  const y0 = 960 - alto / 2
  const lineas = a.lineas.map((l, i) => {
    const ancho = medir(l.join(' '), a.tam)
    const top = y0 + i * paso
    return linea(l, a.tam, W / 2, top + pad.y + a.tam * 0.86, { cajaLinea: { x0: W / 2 - ancho / 2 - pad.x, x1: W / 2 + ancho / 2 + pad.x, y0: top, y1: top + a.tam * 1.05 + 2 * pad.y } })
  })
  plan.bloques.push({ tipo: 'cajas', color: 'tintaPrincipal', lineas })
  let yFin = y0 + alto
  if (S) {
    const s = Math.max(54, Math.round(a.tam * 0.42))
    plan.bloques.push({ tipo: 'imagen', color: 'blanco', lineas: [linea(palabrasDe(S), s, W / 2, yFin + s * 1.3)] })
    yFin += s * 1.5
  }
  plan.tam = a.tam
  plan.cajas.push({ x0: Math.min(...lineas.map(l => l.cajaLinea.x0)), x1: Math.max(...lineas.map(l => l.cajaLinea.x1)), y0, y1: yFin })
  plan.degradado = 'suave'
  return conResaltada(plan, R)
}

function conResaltada(plan, R) {
  plan.resaltada = R
  plan.tieneResaltada = Boolean(R) && plan.bloques.some(b => b.lineas.some(l => l.palabras.some(p => esResaltada(p, R))))
  return plan
}

// ── Pintar ──────────────────────────────────────────────────────────────────

/** El fotograma a sangre: cubre 1080×1920, con el encuadre vertical y el zoom. */
export function pintaFondo(ctx, imagen, { encuadre = 0.5, zoom = 1 } = {}) {
  const iw = imagen.videoWidth || imagen.naturalWidth || imagen.width
  const ih = imagen.videoHeight || imagen.naturalHeight || imagen.height
  ctx.fillStyle = '#0A0A0C'
  ctx.fillRect(0, 0, W, H)
  if (!iw || !ih) return
  const escala = Math.max(W / iw, H / ih) * Math.max(1, zoom)
  const dw = iw * escala
  const dh = ih * escala
  const dx = (W - dw) / 2
  const dy = (H - dh) * Math.min(1, Math.max(0, encuadre))
  ctx.drawImage(imagen, dx, dy, dw, dh)
}

function rect(ctx, { x0, x1, y0, y1, radio = 0 }) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x0, y0, x1 - x0, y1 - y0, radio)
  else ctx.rect(x0, y0, x1 - x0, y1 - y0)
}

const mediaColor = (ctx, c) => {
  try {
    const x = Math.max(0, Math.floor(c.x0)), y = Math.max(0, Math.floor(c.y0))
    const w = Math.max(1, Math.min(W - x, Math.ceil(c.x1 - c.x0))), h = Math.max(1, Math.min(H - y, Math.ceil(c.y1 - c.y0)))
    const d = ctx.getImageData(x, y, w, h).data
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < d.length; i += 4 * 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
    return n ? [r / n, g / n, b / n] : null
  } catch { return null }
}

/**
 * Pinta la portada. Devuelve los contrastes medidos de cada bloque de texto
 * (para las comprobaciones).
 */
export function pintar(ctx, { imagen, encuadre, zoom, plan, marca }) {
  const letra = LETRAS[marca.letra] || LETRAS.barlow
  const fuente = (tam) => `${letra.peso} ${tam}px "${letra.familia}"`
  const colores = {
    principal: marca.colorPrincipal,
    resalte: marca.colorResalte,
    blanco: '#FFFFFF',
    tintaPrincipal: tintaSobre(marca.colorPrincipal),
    tintaResalte: tintaSobre(marca.colorResalte),
  }
  pintaFondo(ctx, imagen, { encuadre, zoom })

  // Lo que oscurece el fondo para que el texto se lea, según la plantilla.
  if (plan.degradado === 'arriba') {
    const g = ctx.createLinearGradient(0, 0, 0, 1100)
    g.addColorStop(0, 'rgba(0,0,0,0.78)')
    g.addColorStop(0.65, 'rgba(0,0,0,0.45)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, 1100)
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, 0, W, H)
  }

  const contrastes = []
  // Las cajas y la píldora, antes que el texto.
  if (plan.caja) {
    ctx.fillStyle = colores[plan.caja.color]
    rect(ctx, plan.caja); ctx.fill()
    contrastes.push(contraste(colores.tintaResalte, colores.resalte))
  }
  if (plan.pildora) {
    ctx.fillStyle = 'rgba(12,12,14,0.92)'
    rect(ctx, plan.pildora); ctx.fill()
    contrastes.push(contraste('#FFFFFF', '#0C0C0E'))
    if (plan.sello) {
      ctx.fillStyle = colores.principal
      ctx.beginPath(); ctx.arc(plan.sello.cx, plan.sello.cy, plan.sello.r, 0, Math.PI * 2); ctx.fill()
      if (plan.sello.texto) {
        ctx.fillStyle = colores.tintaPrincipal
        ctx.font = fuente(plan.sello.texto.length > 2 ? 52 : 64)
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(plan.sello.texto, plan.sello.cx, plan.sello.cy + 2)
      }
    }
  }

  for (const b of plan.bloques) {
    if (b.tipo === 'imagen') {
      // Texto sobre la imagen: se mide el fondo que tiene debajo.
      for (const l of b.lineas) {
        const x0 = l.izquierda != null ? l.izquierda : l.cx - l.ancho / 2
        const fondo = mediaColor(ctx, { x0, x1: x0 + l.ancho, y0: l.y - l.tam * 0.8, y1: l.y + l.tam * 0.15 })
        if (fondo) contrastes.push(contraste(b.color === 'resalte' ? colores.resalte : '#FFFFFF', fondo))
      }
    }
    for (const l of b.lineas) {
      if (b.tipo === 'cajas' && l.cajaLinea) {
        ctx.fillStyle = colores.principal
        rect(ctx, { ...l.cajaLinea, radio: 16 }); ctx.fill()
        contrastes.push(contraste(colores.tintaPrincipal, colores.principal))
      }
      pintaLinea(ctx, l, { fuente, color: colores[b.color] || '#FFFFFF', colores, plan, sombra: b.tipo === 'imagen' || b.tipo === 'cifra' })
    }
  }
  return { contrastes }
}

function pintaLinea(ctx, l, { fuente, color, colores, plan, sombra }) {
  ctx.font = fuente(l.tam)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const espacio = ctx.measureText(' ').width
  let x = l.izquierda != null ? l.izquierda : l.cx - l.ancho / 2
  for (const p of l.palabras) {
    const w = ctx.measureText(p).width
    const resaltada = esResaltada(p, plan.resaltada)
    let tinta = color
    if (resaltada) {
      if (l.cajaLinea || plan.caja) {
        // En una caja, la resaltada lleva su propia caja del color de resalte.
        ctx.fillStyle = plan.caja ? colores.principal : colores.resalte
        rect(ctx, { x0: x - 10, x1: x + w + 10, y0: l.y - l.tam * 0.86, y1: l.y + l.tam * 0.2, radio: 10 }); ctx.fill()
        tinta = plan.caja ? colores.tintaPrincipal : colores.tintaResalte
      } else {
        tinta = colores.resalte
      }
    }
    if (sombra) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 6
      ctx.lineWidth = Math.max(4, l.tam * 0.05)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineJoin = 'round'
      ctx.strokeText(p, x, l.y)
      ctx.restore()
    }
    ctx.fillStyle = tinta
    ctx.fillText(p, x, l.y)
    x += w + espacio
  }
}
