// HELM — Trial reels: el gancho. Pinta en un lienzo 1080×1920 TRANSPARENTE el
// texto de los primeros segundos con el kit de Portadas (colores y letra de la
// serie), en la zona segura de arriba (ZONA_GANCHO), y lo da como PNG para que
// ffmpeg lo superponga con su fundido (api/_lib/variantes.js).
//
// Dos mitades, como el compositor de Portadas:
//   · planGancho() decide tamaño, líneas y cajas con una función de medir que
//     se le pasa: sin canvas, se puede probar;
//   · pintaGancho() dibuja ese plan en un contexto 2D de verdad.
// Además, pintaVistaPrevia(): el primer fotograma de la variante con su
// encuadre, espejo y color (aproximado), para enseñarlo en el taller.
import { ajusta } from '../portadas/componer.js'
import { LETRAS, tintaSobre } from '../portadas/reglas.js'
import { ZONA_GANCHO, LIENZO, palabrasDe, quitaSignos, reencuadre } from './reglas.js'

const { ancho: W, alto: H } = LIENZO
const TAM = { max: 128, min: 72 }

const esResaltada = (p, r) => Boolean(r) && quitaSignos(p).toLowerCase() === quitaSignos(r).toLowerCase()

/**
 * El plan del gancho, o null si no hay texto. Las líneas van centradas y
 * pegadas arriba de la zona segura; si con tres líneas no cabe en alto, se
 * baja la letra hasta que quepa (o hasta el mínimo).
 */
export function planGancho({ texto, resaltada = '', estilo = 'caja', marca, medir }) {
  const may = (s) => (marca.mayusculas ? String(s || '').toLocaleUpperCase('es-ES') : String(s || ''))
  const palabras = palabrasDe(may(texto))
  if (!palabras.length) return null
  const caja = estilo !== 'sombra'
  const pad = caja ? { x: 26, y: 12 } : { x: 0, y: 0 }
  const anchoMax = ZONA_GANCHO.x1 - ZONA_GANCHO.x0 - 2 * pad.x
  const altoZona = ZONA_GANCHO.y1 - ZONA_GANCHO.y0
  const sep = caja ? 12 : 6
  const altoDe = (tam, n) => n * (tam * 1.05 + 2 * pad.y) + (n - 1) * sep

  let a = ajusta({ palabras, anchoMax, lineasMax: 3, tamMax: TAM.max, tamMin: TAM.min, medir })
  while (altoDe(a.tam, a.lineas.length) > altoZona && a.tam > TAM.min) {
    a = ajusta({ palabras, anchoMax, lineasMax: 3, tamMax: a.tam - 4, tamMin: TAM.min, medir })
  }
  const altoLinea = a.tam * 1.05 + 2 * pad.y
  const cx = (ZONA_GANCHO.x0 + ZONA_GANCHO.x1) / 2
  const lineas = a.lineas.map((l, i) => {
    const ancho = medir(l.join(' '), a.tam)
    const top = ZONA_GANCHO.y0 + i * (altoLinea + sep)
    return {
      palabras: l, tam: a.tam, ancho, cx,
      base: top + pad.y + a.tam * 0.86,
      caja: { x0: cx - ancho / 2 - pad.x, x1: cx + ancho / 2 + pad.x, y0: top, y1: top + altoLinea },
    }
  })
  return {
    estilo: caja ? 'caja' : 'sombra',
    tam: a.tam,
    cabe: a.cabe && altoDe(a.tam, a.lineas.length) <= altoZona,
    resaltada: may(resaltada),
    lineas,
  }
}

function rect(ctx, { x0, x1, y0, y1 }, radio) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x0, y0, x1 - x0, y1 - y0, radio)
  else ctx.rect(x0, y0, x1 - x0, y1 - y0)
}

/** Dibuja el plan sobre `ctx` (que tiene que estar transparente). */
export function pintaGancho(ctx, plan, marca) {
  if (!plan) return
  const letra = LETRAS[marca.letra] || LETRAS.barlow
  const principal = marca.colorPrincipal
  const resalte = marca.colorResalte
  ctx.font = `${letra.peso} ${plan.tam}px "${letra.familia}"`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const espacio = ctx.measureText(' ').width

  for (const l of plan.lineas) {
    if (plan.estilo === 'caja') {
      // La caja de la línea, con una sombra suave para separarla del vídeo.
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 18
      ctx.shadowOffsetY = 4
      ctx.fillStyle = principal
      rect(ctx, l.caja, 16); ctx.fill()
      ctx.restore()
    }
    let x = l.cx - l.ancho / 2
    for (const p of l.palabras) {
      const w = ctx.measureText(p).width
      const marcada = esResaltada(p, plan.resaltada)
      if (plan.estilo === 'caja') {
        let tinta = tintaSobre(principal)
        if (marcada) {
          ctx.fillStyle = resalte
          rect(ctx, { x0: x - 10, x1: x + w + 10, y0: l.base - l.tam * 0.86, y1: l.base + l.tam * 0.2 }, 10); ctx.fill()
          tinta = tintaSobre(resalte)
        }
        ctx.fillStyle = tinta
        ctx.fillText(p, x, l.base)
      } else {
        // Letra con trazo y sombra: se lee sobre cualquier fondo.
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.7)'
        ctx.shadowBlur = 22
        ctx.shadowOffsetY = 5
        ctx.lineWidth = Math.max(6, l.tam * 0.09)
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'
        ctx.strokeText(p, x, l.base)
        ctx.restore()
        ctx.fillStyle = marcada ? resalte : '#FFFFFF'
        ctx.fillText(p, x, l.base)
      }
      x += w + espacio
    }
  }
}

/**
 * El gancho en su propio lienzo transparente de 1080×1920, o null si no hay
 * texto. Espera a la letra de la marca: sin ella, el PNG saldría con la de
 * sistema.
 */
export async function lienzoGancho({ texto, resaltada, estilo, marca }) {
  if (!palabrasDe(texto).length) return null
  const letra = LETRAS[marca.letra] || LETRAS.barlow
  try { await document.fonts.load(`${letra.peso} 100px "${letra.familia}"`) } catch { /* sigue con la que haya */ }
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const medir = (t, tam) => { ctx.font = `${letra.peso} ${tam}px "${letra.familia}"`; return ctx.measureText(t).width }
  const plan = planGancho({ texto, resaltada, estilo, marca, medir })
  pintaGancho(ctx, plan, marca)
  return c
}

// El color de ffmpeg (eq) imitado con los filtros del canvas: es una
// aproximación para la vista previa, no lo que sale exacto.
const FILTRO = {
  neutro: 'none',
  calido: 'saturate(1.06) sepia(0.08)',
  frio: 'saturate(1.02) hue-rotate(-8deg) brightness(1.01)',
  contraste: 'contrast(1.08) saturate(1.08) brightness(1.01)',
}

/**
 * La vista previa del primer fotograma: el fotograma con el encuadre (la
 * misma cuenta que ffmpeg, reencuadre()), el espejo, el color y el gancho.
 */
export function pintaVistaPrevia(ctx, { fotograma, ajustes, gancho }) {
  ctx.save()
  ctx.fillStyle = '#0A0A0C'
  ctx.fillRect(0, 0, W, H)
  const fw = fotograma?.width || 0
  const fh = fotograma?.height || 0
  if (fw && fh) {
    const { ew, eh, x, y } = reencuadre({ ancho: fw, alto: fh }, ajustes)
    if (ajustes.espejo) { ctx.translate(W, 0); ctx.scale(-1, 1) }
    try { ctx.filter = FILTRO[ajustes.color] || 'none' } catch { /* sin filtros en este navegador */ }
    ctx.drawImage(fotograma, -x, -y, ew, eh)
  }
  ctx.restore()
  if (gancho) ctx.drawImage(gancho, 0, 0)
}
