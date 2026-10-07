// HELM — fechas escritas por una persona (o por el modelo) → YYYY-MM-DD.
//
// Existe por una razón muy concreta: los modelos pequeños NO saben qué día es
// hoy. Aunque se lo pongas en el system prompt, al pedirle "prográmalo para
// mañana" qwen2.5 contesta con una fecha de su entrenamiento (2023-10-26 en la
// prueba). Si el chat va a agendar cosas de verdad, la fecha no puede salir del
// modelo: el modelo repite la palabra que dijo el usuario ("mañana", "el
// lunes") y quien echa cuentas es esto.

const pad = (n) => String(n).padStart(2, '0')
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const sinTildes = (s) => String(s || '').toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')

const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

const suma = (base, dias) => { const d = new Date(base); d.setDate(d.getDate() + dias); return d }

// Una fecha sin año ("25/07", "1 de agosto") es casi siempre la más cercana,
// pero no siempre hacia adelante: el 25/07 dicho el 29/07 es el de hace cuatro
// días (un reporte que se apunta tarde), no el del año que viene. Solo se salta
// de año cuando queda claramente atrás.
const MARGEN_ATRAS_DIAS = 60
const anioMasProbable = (day, mon, hoy) => {
  const d = new Date(hoy.getFullYear(), mon - 1, day)
  return d < suma(hoy, -MARGEN_ATRAS_DIAS) ? hoy.getFullYear() + 1 : hoy.getFullYear()
}

/**
 * Convierte lo que sea que haya escrito una persona en una fecha ISO.
 *
 * Entiende: hoy, mañana, pasado mañana, ayer, "el lunes", "el martes que
 * viene", "en 3 días", "dentro de 2 semanas", 25/07, 25-07-2026, "1 de agosto"
 * y 2026-07-25.
 *
 * @param {string} texto
 * @param {Date}   [hoy] para poder probarlo sin depender del reloj
 * @returns {string|null} YYYY-MM-DD, o null si no hay forma de entenderlo
 */
export function resolverFecha(texto, hoy = new Date()) {
  const t = sinTildes(texto).replace(/^(el|para el|para|este|esta|proximo|proxima)\s+/, '').trim()
  if (!t) return null

  if (t === 'hoy') return isoLocal(hoy)
  if (t === 'manana') return isoLocal(suma(hoy, 1))
  if (t === 'ayer') return isoLocal(suma(hoy, -1))
  if (/^pasado( manana)?$/.test(t)) return isoLocal(suma(hoy, 2))

  // ISO directa. Se comprueba que exista de verdad: 2026-02-31 no vale.
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return d.getMonth() === Number(iso[2]) - 1 && d.getDate() === Number(iso[3]) ? isoLocal(d) : null
  }

  // "en 3 dias", "dentro de 2 semanas", "en un mes"
  const rel = t.match(/^(?:en|dentro de)\s+(\d+|un|una|dos|tres)\s*(dia|dias|semana|semanas|mes|meses)$/)
  if (rel) {
    const n = { un: 1, una: 1, dos: 2, tres: 3 }[rel[1]] ?? Number(rel[1])
    if (/dia/.test(rel[2])) return isoLocal(suma(hoy, n))
    if (/semana/.test(rel[2])) return isoLocal(suma(hoy, n * 7))
    const d = new Date(hoy); d.setMonth(d.getMonth() + n); return isoLocal(d)
  }

  // "lunes", "lunes que viene". Siempre el PRÓXIMO que llegue: si hoy es lunes
  // y dices "lunes", te refieres al de dentro de siete días, no a hoy. Por eso
  // "que viene" y "próximo" no cambian nada — ya es lo que se calcula.
  const dia = t.match(/^(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(\s+(que viene|proximo|siguiente))?$/)
  if (dia) {
    const delta = (DIAS[dia[1]] - hoy.getDay() + 7) % 7 || 7
    return isoLocal(suma(hoy, delta))
  }

  // "1 de agosto", "15 de septiembre de 2026"
  const conMes = t.match(/^(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?$/)
  if (conMes && MESES[conMes[2]]) {
    const day = Number(conMes[1])
    const mon = MESES[conMes[2]]
    // Sin año lo decide anioMasProbable: "1 de enero" dicho en diciembre es el
    // de dentro de un mes; "25/07" dicho el 29/07 es el de hace cuatro días.
    const year = conMes[3] ? Number(conMes[3]) : anioMasProbable(day, mon, hoy)
    const d = new Date(year, mon - 1, day)
    return d.getMonth() === mon - 1 ? isoLocal(d) : null
  }

  // 25/07, 25-07, 25/07/2026
  const num = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (num) {
    const day = Number(num[1]); const mon = Number(num[2])
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null
    let year = num[3] ? Number(num[3]) : anioMasProbable(day, mon, hoy)
    if (year < 100) year += 2000
    const d = new Date(year, mon - 1, day)
    return d.getMonth() === mon - 1 ? isoLocal(d) : null
  }

  return null
}

/**
 * Fecha resuelta Y con sentido. Una fecha de 2023 en un calendario de 2026 no
 * es una fecha: es el modelo alucinando, y hay que rechazarla en vez de
 * escribirla en la base de datos.
 *
 * @returns {{iso: string}|{error: string}}
 */
export function fechaValida(texto, { hoy = new Date(), atras = 370, adelante = 730 } = {}) {
  const iso = resolverFecha(texto, hoy)
  if (!iso) return { error: `No entiendo la fecha "${texto}". Dímela como "mañana", "el lunes" o "25/07".` }
  const dias = Math.round((new Date(iso + 'T12:00:00') - new Date(isoLocal(hoy) + 'T12:00:00')) / 86_400_000)
  if (dias < -atras || dias > adelante) {
    return { error: `La fecha "${texto}" sale ${iso}, que queda demasiado lejos de hoy. Repítemela.` }
  }
  return { iso }
}
