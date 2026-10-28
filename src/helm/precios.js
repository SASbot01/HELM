// HELM — lo que cuesta cada trabajo de agente a precio fijo. Módulo puro (sin
// React, sin navegador y sin Node): lo usan el servidor (api/_lib/creditos.js,
// que lo reexporta, y los agentes que cobran) y la pantalla, para enseñar el
// precio ANTES de lanzar con la misma cuenta con la que luego se cobra.
//
// Uso:
//   import { PRECIOS_FIJOS, precioEditor, aCreditos, CONCEPTOS } from '../helm/precios.js'
//   precioEditor(video.duration)          // → 1.5, 3, 4.5… (euros de saldo)
//   aCreditos(PRECIOS_FIJOS['portada-ia']) // → 40 (lo que se enseña)
//   CONCEPTOS[movimiento.modelo]          // → «Editor de reels» (o undefined si es IA por tokens)
//   creditosQueQuedan(precios.saldo)      // → 149 con 1,4987 €; null si no se ve el saldo
//
// Los precios van en euros de saldo, como agencias.saldo; en pantalla se
// enseñan en créditos (1 € = 100 créditos). Son por trabajo, no por tokens:
// el Editor de reels, Portadas y Trial reels trabajan con ffmpeg, Whisper o un
// modelo de imagen, no con Claude, y lo que cuesten no sale del `usage`.

export const CREDITOS_POR_EURO = 100

// Decisión de Alex (27-oct), fijos por trabajo. La clave es el «concepto» con
// el que se apunta el cobro (agencia_movimientos.modelo).
export const PRECIOS_FIJOS = Object.freeze({
  // Por cada bloque de 3 minutos empezado del vídeo en bruto (precioEditor).
  'editor-reels': 1.5,
  // Por cada imagen generada (portada entera con IA o fondo con IA).
  'portada-ia': 0.4,
  // Por cada variante montada.
  'trial-reel': 0.3,
})

// Cómo se leen en la lista de movimientos de créditos. El fondo con IA de
// Portadas cuesta lo mismo que una portada (PRECIOS_FIJOS['portada-ia']), pero
// se puede apuntar con su propio concepto para que se lea por su nombre.
export const CONCEPTOS = Object.freeze({
  'editor-reels': 'Editor de reels',
  'portada-ia': 'Portada con IA',
  'fondo-ia': 'Fondo con IA',
  'trial-reel': 'Trial reel',
})

// El Editor cobra por bloques de 3 minutos del vídeo en bruto. Medio segundo
// de gracia: el navegador y ffprobe no siempre dan la misma duración (el
// contenedor y la pista no acaban igual) y un vídeo de «3 minutos» que mide
// 180,2 s no ha empezado otro bloque (Instagram corta los reels a 3 min justos:
// es justo donde caen muchos). OJO: esto lo añadimos nosotros, no Alex; si no
// lo quiere, GRACIA_EDITOR_S = 0 y se cobra ceil(seg/180) a secas.
export const BLOQUE_EDITOR_S = 180
export const GRACIA_EDITOR_S = 0.5

const centimos = (euros) => Math.round(Number(euros) * 100) / 100

/**
 * Lo que cuesta editar un vídeo de `segundos` en bruto, en euros: 1,50 € por
 * cada bloque de 3 minutos empezado, y como mínimo uno (0 s, una duración que
 * no se sabe o rara, cuentan como un bloque). El tope de duración (10 min) lo
 * pone api/editor.js, no esto.
 */
export const precioEditor = (segundos) => {
  const s = Number(segundos)
  const bloques = Number.isFinite(s) && s > GRACIA_EDITOR_S ? Math.ceil((s - GRACIA_EDITOR_S) / BLOQUE_EDITOR_S) : 1
  return centimos(Math.max(1, bloques) * PRECIOS_FIJOS['editor-reels'])
}

/** Euros de saldo → créditos, redondeado (lo que se enseña). */
export const aCreditos = (euros) => Math.round(Number(euros || 0) * CREDITOS_POR_EURO)

/**
 * Los créditos que QUEDAN con un saldo de `euros`, hacia abajo como los cuenta
 * el servidor (exigirImporte): con 1,4987 € quedan 149, no 150 (el 1e-6 es por
 * la coma flotante: 0,29 × 100 da 28,999…). Nunca negativo. Con el saldo sin
 * saber (null: el saldo es de la agencia y solo lo ve quien la administra),
 * null, y la pantalla no enseña «te quedan…», solo el precio.
 */
export const creditosQueQuedan = (euros) => {
  if (euros == null || euros === '') return null
  const n = Number(euros)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n * CREDITOS_POR_EURO + 1e-6)) : null
}
