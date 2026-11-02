// HELM — Email marketing: cuándo le toca a cada persona cada correo.
//
// Todo en hora de Madrid, que es la del negocio: «a las 9:00, dos días
// después» son las 9:00 de aquí también la semana que cambia la hora. Por eso
// las esperas se suman al día del calendario de Madrid, no como 48 horas.
//
//   · el primero sale al lanzar o, si se programó, a esa fecha y hora;
//   · cada siguiente, N días después de que le saliera el anterior a ESA
//     persona (a la misma hora del reloj de Madrid);
//   · con ventana (p. ej. 9–20 h), lo que caiga fuera se pasa a su apertura
//     siguiente: antes de las 9, a las 9 de ese día; después de las 20, a las
//     9 del día siguiente.
//
// Puro: sin base ni red.
export const ZONA = 'Europe/Madrid'

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** La fecha y la hora en Madrid de un instante. */
export function partesMadrid(d) {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

// Cuánto va Madrid por delante de UTC en ese instante, en ms.
const desfase = (t) => {
  const p = partesMadrid(new Date(t))
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(t / 1000) * 1000
}

/** Una hora del reloj de Madrid → el instante. El día puede desbordar (32 de octubre = 1 de noviembre). */
export function deMadrid(y, m, d, h = 0, min = 0) {
  const pared = Date.UTC(y, m - 1, d, h, min)
  // Dos pasadas: la primera puede caer al otro lado del cambio de hora.
  let t = pared - desfase(pared)
  t = pared - desfase(t)
  return new Date(t)
}

/** «2026-11-05T09:30» (lo que da un <input type="datetime-local">) leído como hora de Madrid. */
export function leeLocalMadrid(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(texto ?? '').trim())
  if (!m) return null
  const [y, mes, d, h, min] = m.slice(1).map(Number)
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null
  const t = deMadrid(y, mes, d, h, min)
  const p = partesMadrid(t)
  // El 31 de febrero no existe (Date lo pasaría a marzo sin decir nada).
  return p.d === d && p.m === mes ? t : null
}

/** El instante como «2026-11-05T09:30» de Madrid, para rellenar el formulario. */
export function localMadrid(d) {
  if (!d) return ''
  const p = partesMadrid(new Date(d))
  const dos = (n) => String(n).padStart(2, '0')
  return `${p.y}-${dos(p.m)}-${dos(p.d)}T${dos(p.h)}:${dos(p.min)}`
}

/** { desde, hasta } (horas de Madrid, [desde, hasta)) o null si se manda a cualquier hora. */
export function ventanaDe(campana) {
  const desde = campana?.ventana_desde
  const hasta = campana?.ventana_hasta
  if (desde == null || hasta == null) return null
  return { desde: Number(desde), hasta: Number(hasta) }
}

export function enVentana(d, ventana) {
  if (!ventana) return true
  const { h } = partesMadrid(d)
  return h >= ventana.desde && h < ventana.hasta
}

/** El primer instante desde `d` que cae dentro de la ventana. */
export function ajustaAVentana(d, ventana) {
  if (!ventana || enVentana(d, ventana)) return d
  const p = partesMadrid(d)
  if (p.h < ventana.desde) return deMadrid(p.y, p.m, p.d, ventana.desde, 0)
  return deMadrid(p.y, p.m, p.d + 1, ventana.desde, 0)
}

/** Cuándo sale el primer correo: al lanzar o a la fecha programada, dentro de la ventana. */
export function primerEnvio({ ahora, inicioEn = null, ventana = null }) {
  const base = inicioEn && inicioEn > ahora ? inicioEn : ahora
  return ajustaAVentana(base, ventana)
}

/** Cuándo sale el siguiente: `dias` días de Madrid después de `base`, a la misma hora, dentro de la ventana. */
export function siguienteEnvio(base, dias, ventana = null) {
  const p = partesMadrid(base)
  return ajustaAVentana(deMadrid(p.y, p.m, p.d + Math.max(0, Number(dias) || 0), p.h, p.min), ventana)
}
