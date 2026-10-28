// HELM — Estudio de contenido: los números.
//
// Todo lo que el estudio afirma con cifras sale de aquí, calculado por código y
// nunca por la IA: medianas (no medias, que con un viral mienten), percentiles,
// tasas por cada 1.000 visitas (y aparte por cada 1.000 cuentas alcanzadas),
// tercios, días y franjas en hora de Madrid, la etapa de seguidores y cómo van
// los objetivos del estudio anterior. La IA (./generar.js) recibe este objeto y
// solo puede usar sus números; la pantalla lo enseña tal cual.
//
// Se compara a la misma edad: todo lo agregado (medianas, base, percentiles,
// días, franjas, formatos, tercios, mejores y peores) sale de las piezas
// MADURAS, las de 72 h o más. Una pieza más joven aún está cogiendo visitas y
// tiraría hacia abajo su día, su franja y la base de los objetivos. Solo la
// frecuencia cuenta todas: publicar es publicar, tenga las visitas que tenga.
//
// Función pura: sin base, sin red y sin reloj (la fecha llega en `hoy`), para
// poder probarla caso a caso (tests/estudio-datos.test.js).
import { HITOS } from './conocimiento.js'

const MIN_PIEZAS = 12            // con menos, casi todo es ruido
const MIN_DIAS_RITMO = 7         // histórico de seguidores para dar un ritmo
const VENTANA_RITMO_DIAS = 30    // el ritmo, con el último mes del histórico si lo hay
const EN_CURSO_H = 72            // una pieza más joven sigue cogiendo visitas
const BASE_DIAS = 56             // la base de los objetivos: las últimas 8 semanas…
const BASE_MIN_PIEZAS = 12       // …o, si en 8 semanas hay menos, las últimas 12
const MIN_POR_GRUPO = 8          // un día o una franja con menos piezas no se compara
const MIN_TERCIOS = 15           // 5 contra 5 como poco: con 3 contra 3 ningún contraste es significativo
const MIN_PERCENTILES = 30       // con menos, el p25, el p75 y el p90 se mueven con cada pieza
const PLAZO_POR_DEFECTO = 30     // el de un objetivo que no lo traiga (el mismo que pone generar.js)
const MAX_PIEZAS_BASE = 40       // las de la base, una a una, que van a la IA para contar pares
const MAX_ANOS_ESTIMA = 10       // más allá, una fecha estimada no dice nada
const DIA_MS = 86_400_000

const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const DIAS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Franjas pensadas para quien ve los reels desde España: la comida va tarde.
const FRANJAS = [
  { franja: 'madrugada (0-7 h)', desde: 0, hasta: 7 },
  { franja: 'mañana (7-13 h)', desde: 7, hasta: 13 },
  { franja: 'mediodía (13-16 h)', desde: 13, hasta: 16 },
  { franja: 'tarde (16-20 h)', desde: 16, hasta: 20 },
  { franja: 'noche (20-24 h)', desde: 20, hasta: 24 },
]

// El día, la fecha y la hora en Madrid: un reel subido a las 00:30 de un
// martes es lunes en UTC, y la cuenta publica para gente de aquí.
const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtDiaSemana = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' })
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' })

const finito = (x) => x != null && x !== '' && Number.isFinite(Number(x))
const num = (x) => (finito(x) ? Number(x) : 0)
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10)
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000)

/** Percentil con interpolación lineal (el p50 es la mediana de siempre). */
export function percentil(xs, p) {
  const o = xs.filter(finito).map(Number).sort((a, b) => a - b)
  if (!o.length) return null
  const h = (o.length - 1) * p
  const lo = Math.floor(h)
  return r1(lo + 1 < o.length ? o[lo] + (h - lo) * (o[lo + 1] - o[lo]) : o[lo])
}
export const mediana = (xs) => percentil(xs, 0.5)

// Por mil, redondeado por pieza como en el Informe (api/_lib/instagram.js),
// para que los dos digan la misma mediana.
const porMil = (v, base) => (base > 0 ? r1((v / base) * 1000) : null)
const pct = (lista, f) => (lista.length ? Math.round((lista.filter(f).length / lista.length) * 100) : null)

// La primera línea del texto es lo más parecido a un título que tiene un reel.
const tituloDe = (caption) => String(caption || '').split('\n')[0].trim().slice(0, 140) || '(sin texto)'
// El gancho «con número»: una cifra o un número escrito («tres errores…»).
const NUMERO = /\d|\b(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil)\b/i

function formatoDe(p) {
  if (p.producto === 'REELS') return 'reel'
  if (p.tipo === 'CAROUSEL_ALBUM') return 'carrusel'
  if (p.tipo === 'IMAGE') return 'imagen'
  if (p.tipo === 'VIDEO') return 'vídeo'
  return 'otro'
}

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA_MS)
const masDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)

// Una fila de helm_ig_media, con lo que el estudio mira de ella.
function pieza(p, hoyMs) {
  const t = p.publicado_en ? Date.parse(p.publicado_en) : NaN
  const fecha = Number.isFinite(t) ? new Date(t) : null
  const caption = String(p.caption || '')
  const primera = caption.split('\n')[0].trim()
  const visitas = num(p.visitas)
  const alcance = num(p.alcance)
  return {
    titulo: tituloDe(caption),
    caption,
    url: p.permalink || null,
    t: fecha ? t : null,
    fecha: fecha ? fmtFecha.format(fecha) : null,
    dia_semana: fecha ? DIAS_EN.indexOf(fmtDiaSemana.format(fecha)) : null,
    hora: fecha ? Number(fmtHora.format(fecha)) : null,
    formato: formatoDe(p),
    visitas,
    alcance,
    retencion_s: finito(p.retencion_media) ? Number(p.retencion_media) : null,
    guardados_por_mil: porMil(num(p.guardados), visitas),
    compartidos_por_mil: porMil(num(p.compartidos), visitas),
    interacciones_por_mil: porMil(num(p.interacciones), visitas),
    likes_por_mil: porMil(num(p.likes), visitas),
    // Las mismas tasas por alcance, que es el denominador que pide Mosseri.
    a_guardados: porMil(num(p.guardados), alcance),
    a_compartidos: porMil(num(p.compartidos), alcance),
    a_likes: porMil(num(p.likes), alcance),
    a_interacciones: porMil(num(p.interacciones), alcance),
    repeticion: alcance > 0 && visitas > 0 ? visitas / alcance : null,
    // Sin fecha no se sabe su edad: se trata como madura.
    en_curso: fecha ? hoyMs - t < EN_CURSO_H * 3_600_000 : false,
    pregunta: /[¿?]/.test(primera),
    numero: NUMERO.test(primera),
    longitud: caption.length,
  }
}

const medianasDe = (lista) => ({
  visitas: mediana(lista.map(p => p.visitas)),
  alcance: mediana(lista.map(p => p.alcance)),
  retencion_s: mediana(lista.map(p => p.retencion_s)),
  guardados_por_mil: mediana(lista.map(p => p.guardados_por_mil)),
  compartidos_por_mil: mediana(lista.map(p => p.compartidos_por_mil)),
  interacciones_por_mil: mediana(lista.map(p => p.interacciones_por_mil)),
  likes_por_mil: mediana(lista.map(p => p.likes_por_mil)),
})

/** Las métricas a las que puede apuntar un objetivo del estudio. */
export const METRICAS_OBJETIVO = [...Object.keys(medianasDe([])), 'seguidores', 'frecuencia']

/**
 * El valor de hoy de la métrica de un objetivo. Las medianas se miden sobre la
 * BASE (las últimas 8 semanas), no sobre todo el histórico: con cien piezas
 * detrás, la mediana de siempre apenas se mueve en un mes y ningún objetivo se
 * vería cumplido. Así fija los objetivos la doctrina (conocimiento.js §9).
 */
export function valorMetrica(datos, metrica) {
  if (!datos) return null
  if (metrica === 'seguidores') return datos.cuenta?.seguidores ?? null
  if (metrica === 'frecuencia') return datos.frecuencia?.por_semana_4s ?? null
  const m = datos.base ? datos.base.medianas : datos.medianas
  return m && Object.hasOwn(m, metrica) ? m[metrica] ?? null : null
}

// Lo que se enseña de una pieza en «mejores» y «peores».
const corta = (medianaVisitas) => (p) => ({
  titulo: p.titulo,
  fecha: p.fecha,
  visitas: p.visitas,
  retencion_s: r1(p.retencion_s),
  guardados_por_mil: p.guardados_por_mil,
  compartidos_por_mil: p.compartidos_por_mil,
  url: p.url,
  formato: p.formato,
  veces_mediana: medianaVisitas > 0 ? r1(p.visitas / medianaVisitas) : null,
})

// Las piezas de la base una a una, en corto: sin ellas la IA no puede contar
// pares para confirmar una regla ni repasar un experimento de las últimas
// semanas, que casi nunca cae entre las mejores ni las peores de siempre.
const enCorto = (medianaVisitas) => (p) => ({
  fecha: p.fecha,
  formato: p.formato,
  visitas: p.visitas,
  veces_mediana: medianaVisitas > 0 ? r1(p.visitas / medianaVisitas) : null,
  retencion_s: r1(p.retencion_s),
  guardados_por_mil: p.guardados_por_mil,
  compartidos_por_mil: p.compartidos_por_mil,
  titulo: p.titulo.slice(0, 80),
})

// Las fotos diarias de seguidores, limpias, sin días repetidos y en orden.
function limpiaHistorial(historial) {
  const porDia = new Map()
  for (const h of Array.isArray(historial) ? historial : []) {
    const dia = String(h?.dia || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !finito(h?.seguidores)) continue
    porDia.set(dia, Number(h.seguidores))
  }
  return [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dia, seguidores]) => ({ dia, seguidores }))
}

/**
 * Seguidores al día con el histórico. Se compara la última foto con una de
 * hace entre 7 y 30 días (la más antigua de ese tramo); si no hay ninguna en
 * ese tramo, con la más reciente de antes. Sin una foto de hace 7 días o más,
 * no hay ritmo: con dos días seguidos, cualquier pico parece una tendencia.
 */
function ritmoDe(puntos) {
  const ultimo = puntos.at(-1)
  if (!ultimo) return null
  const atras = puntos.filter(p => diasEntre(p.dia, ultimo.dia) >= MIN_DIAS_RITMO)
  if (!atras.length) return null
  const enVentana = atras.filter(p => diasEntre(p.dia, ultimo.dia) <= VENTANA_RITMO_DIAS)
  const desde = enVentana.length ? enVentana[0] : atras.at(-1)
  const dias = diasEntre(desde.dia, ultimo.dia)
  return { desde, hasta: ultimo, dias, porDia: (ultimo.seguidores - desde.seguidores) / dias }
}

function etapaDe(seguidores, puntos, ritmo, hoyDia) {
  const hitos = [...HITOS].sort((a, b) => a - b)
  const dias_historial = puntos.length ? diasEntre(puntos[0].dia, puntos.at(-1).dia) : 0
  const ritmo_dia = ritmo ? r1(ritmo.porDia) : null
  if (seguidores == null) {
    return { hito_anterior: null, siguiente_hito: null, progreso: null, ritmo_dia, dias_historial, fecha_estimada: null, ritmo_necesario_90d: null }
  }
  const hito_anterior = hitos.filter(h => h <= seguidores).at(-1) ?? 0
  const siguiente_hito = hitos.find(h => h > seguidores) ?? null
  const faltan = siguiente_hito == null ? 0 : siguiente_hito - seguidores
  // Progreso dentro de la etapa: de 1.000 a 10.000, con 1.551 va por el 6 %.
  const progreso = siguiente_hito == null ? 1 : r3((seguidores - hito_anterior) / (siguiente_hito - hito_anterior))
  let fecha_estimada = null
  if (siguiente_hito != null && ritmo && ritmo.porDia > 0) {
    const dias = Math.ceil(faltan / ritmo.porDia)
    if (dias <= MAX_ANOS_ESTIMA * 365) fecha_estimada = masDias(hoyDia, dias)
  }
  return {
    hito_anterior, siguiente_hito, progreso, ritmo_dia, dias_historial, fecha_estimada,
    ritmo_necesario_90d: siguiente_hito == null ? null : r1(faltan / 90),
  }
}

// Cuánto se ha andado desde el punto de partida hacia el objetivo, de 0 a 1.
function avanceDe(antes, ahora, objetivo, alcanzado) {
  if (antes == null || ahora == null || objetivo == null) return null
  if (objetivo === antes) return alcanzado ? 1 : 0
  return r3(Math.min(1, Math.max(0, (ahora - antes) / (objetivo - antes))))
}

/**
 * Cómo van los objetivos del estudio anterior. Un objetivo se mide en su
 * fecha: mientras no venza, está «en_curso» (cumplido: null) aunque vaya por
 * debajo; si ya llegó a la cifra antes de vencer, está «cumplido»; y solo se da
 * por «no_cumplido» con el plazo vencido. Con el estudio de cada lunes, un
 * objetivo a 60 días no puede salir fallado a la semana.
 *
 * El plazo cuenta desde que se puso el objetivo (`desde`): si un estudio lo
 * mantuvo, desde el primero que lo puso, y el punto de partida (`partida`)
 * también es el de entonces. Sin `desde`, desde el estudio anterior.
 *
 * Vence por DÍAS de Madrid, no al milisegundo: los estudios son semanales y
 * los plazos, de 14, 28 o 56 días; si no, que un objetivo saliera vencido o
 * aún vigente dependería de los minutos que el trabajo esperó en la cola.
 */
function desdeAnterior(anterior, datos, hoyMs) {
  const objetivos = anterior?.estudio?.objetivos
  if (!Array.isArray(objetivos) || !objetivos.length) return null
  const generado = Date.parse(anterior.generado_en || '')
  const hoyDia = fmtFecha.format(new Date(hoyMs))
  return {
    generado_en: anterior.generado_en || null,
    objetivos: objetivos.filter(o => o && typeof o === 'object').map(o => {
      const metrica = String(o.metrica || '')
      const antes = finito(o.partida) ? Number(o.partida)
        : finito(o.actual) ? Number(o.actual) : valorMetrica(anterior.datos, metrica)
      const ahora = valorMetrica(datos, metrica)
      const objetivo = finito(o.objetivo) ? Number(o.objetivo) : null
      // Casi todo objetivo es subir; si el estudio pidió bajar algo (publicar
      // menos para cuidar cada pieza), se cumple al quedar por debajo.
      const sube = antes == null || objetivo == null || objetivo >= antes
      const alcanzado = ahora != null && objetivo != null && (sube ? ahora >= objetivo : ahora <= objetivo)
      const inicio = Number.isFinite(Date.parse(o.desde || '')) ? Date.parse(o.desde) : generado
      const plazo = finito(o.plazo_dias) ? Number(o.plazo_dias) : PLAZO_POR_DEFECTO
      const vence = Number.isFinite(inicio) ? inicio + plazo * DIA_MS : null
      const estado = alcanzado ? 'cumplido' : vence != null && hoyDia >= fmtFecha.format(new Date(vence)) ? 'no_cumplido' : 'en_curso'
      return {
        nombre: String(o.nombre || metrica), metrica, antes, ahora, objetivo, estado,
        cumplido: estado === 'en_curso' ? null : estado === 'cumplido',
        avance: avanceDe(antes, ahora, objetivo, alcanzado),
        vence: vence != null ? new Date(vence).toISOString() : null,
      }
    }),
  }
}

/**
 * Los números del estudio de un perfil.
 *
 * @param {object}   o
 * @param {object[]} o.piezas              filas de helm_ig_media (todas las del perfil)
 * @param {number}   [o.seguidores]        los de ahora (user_integrations → config.followers)
 * @param {string}   [o.usuario]           el @ de la cuenta
 * @param {object[]} [o.historialSeguidores] [{ dia, seguidores }] de helm_ig_seguidores
 * @param {object}   [o.anterior]          el último estudio listo: { generado_en, datos, estudio }
 * @param {Date|string} [o.hoy]
 */
export function calculaDatos({ piezas, seguidores, usuario = null, historialSeguidores = [], anterior = null, hoy = new Date() } = {}) {
  const ahora = hoy instanceof Date ? hoy : new Date(hoy)
  const hoyMs = ahora.getTime()
  const hoyDia = fmtFecha.format(ahora)
  const lista = (Array.isArray(piezas) ? piezas : []).map(p => pieza(p, hoyMs))
  const puntos = limpiaHistorial(historialSeguidores)
  const seg = finito(seguidores) ? Number(seguidores) : (puntos.at(-1)?.seguidores ?? null)
  const avisos = []

  const conFecha = lista.filter(p => p.t != null).sort((a, b) => a.t - b.t)
  // Lo que se compara son las maduras (72 h o más): las demás aún cogen visitas.
  const maduras = lista.filter(p => !p.en_curso)
  const recientes = lista.length - maduras.length
  const madurasConFecha = conFecha.filter(p => !p.en_curso)
  const porVisitas = [...maduras].sort((a, b) => b.visitas - a.visitas)
  const medianas = medianasDe(maduras)

  // La base de los objetivos: las últimas 8 semanas, o las últimas 12 piezas.
  const desdeBase = hoyMs - BASE_DIAS * DIA_MS
  let base = madurasConFecha.filter(p => p.t >= desdeBase)
  if (base.length < BASE_MIN_PIEZAS) base = madurasConFecha.slice(-BASE_MIN_PIEZAS)
  if (!base.length) base = maduras

  // La frecuencia, con todas: lo de ayer también es publicar.
  const enVentana = (dias) => conFecha.filter(p => p.t > hoyMs - dias * DIA_MS && p.t <= hoyMs).length

  const formatos = [...new Set(maduras.map(p => p.formato))].map(formato => {
    const suyas = maduras.filter(p => p.formato === formato)
    return { formato, piezas: suyas.length, mediana_visitas: mediana(suyas.map(p => p.visitas)), mediana_compartidos_por_mil: mediana(suyas.map(p => p.compartidos_por_mil)) }
  }).sort((a, b) => b.piezas - a.piezas)

  const dias = DIAS_SEMANA.map((dia, i) => {
    const suyas = maduras.filter(p => p.dia_semana === i)
    return { dia, piezas: suyas.length, mediana_visitas: mediana(suyas.map(p => p.visitas)) }
  })
  const horas = FRANJAS.map(({ franja, desde, hasta }) => {
    const suyas = maduras.filter(p => p.hora != null && p.hora >= desde && p.hora < hasta)
    return { franja, piezas: suyas.length, mediana_visitas: mediana(suyas.map(p => p.visitas)) }
  })

  // ¿Qué separa a las más vistas de las menos vistas? El tercio de arriba
  // contra el de abajo, con 5 piezas por tercio como poco (15 maduras): con
  // 3 contra 3 el azar explica cualquier diferencia.
  const tercio = Math.floor(maduras.length / 3)
  const grupo = (g) => ({
    piezas: g.length,
    ...medianasDe(g),
    longitud_caption: mediana(g.map(p => p.longitud)),
    gancho_pregunta_pct: pct(g, p => p.pregunta),
    gancho_numero_pct: pct(g, p => p.numero),
    reels_pct: pct(g, p => p.formato === 'reel'),
  })
  const tercios = maduras.length >= MIN_TERCIOS ? { arriba: grupo(porVisitas.slice(0, tercio)), abajo: grupo(porVisitas.slice(-tercio)) } : null

  const conAlcance = maduras.filter(p => p.alcance > 0)
  const por_alcance = {
    guardados_por_mil: mediana(conAlcance.map(p => p.a_guardados)),
    compartidos_por_mil: mediana(conAlcance.map(p => p.a_compartidos)),
    likes_por_mil: mediana(conAlcance.map(p => p.a_likes)),
    interacciones_por_mil: mediana(conAlcance.map(p => p.a_interacciones)),
    // Visitas ÷ alcance: por encima de 1, la gente lo repite.
    repeticion: r2(mediana(conAlcance.map(p => p.repeticion))),
  }

  // Cuánto del total se lo llevan las mejores: la doctrina pide declararlo.
  const totalMaduras = maduras.reduce((t, p) => t + p.visitas, 0)
  const concentracion = totalMaduras > 0 ? {
    visitas_totales: totalMaduras,
    mejor_pct: Math.round((porVisitas[0].visitas / totalMaduras) * 100),
    cinco_mejores_pct: Math.round((porVisitas.slice(0, 5).reduce((t, p) => t + p.visitas, 0) / totalMaduras) * 100),
  } : null

  // Seguidores por cada 1.000 visitas. Aquí sí van todas las piezas: son
  // visitas que ya han pasado y seguidores que ya han llegado. El techo supone
  // que todos los seguidores llegaron por estas piezas; el reciente cruza lo
  // que creció la cuenta en el tramo del ritmo con las visitas de lo publicado
  // en ese tramo (aproximado: la API no da seguimientos por reel).
  const total = lista.reduce((t, p) => t + p.visitas, 0)
  const ritmo = ritmoDe(puntos)
  let reciente = null
  if (ritmo) {
    const desde = Date.parse(`${ritmo.desde.dia}T00:00:00Z`) - DIA_MS
    const hasta = Date.parse(`${ritmo.hasta.dia}T23:59:59Z`) + DIA_MS
    const visitasTramo = conFecha.filter(p => p.t >= desde && p.t <= hasta).reduce((t, p) => t + p.visitas, 0)
    if (visitasTramo > 0) reciente = r2(((ritmo.hasta.seguidores - ritmo.desde.seguidores) / visitasTramo) * 1000)
  }
  const conversion = {
    techo_por_mil: seg != null && total > 0 ? r2((seg / total) * 1000) : null,
    reciente_por_mil: reciente,
  }

  const mejores = porVisitas.slice(0, 5)
  const yaMejores = new Set(mejores)
  const peores = [...porVisitas].reverse().filter(p => !yaMejores.has(p)).slice(0, 5)
  const visitasDe = (q) => percentil(maduras.map(p => p.visitas), q)

  const datos = {
    cuenta: {
      usuario: usuario || null,
      seguidores: seg,
      piezas: lista.length,
      // Las de menos de 72 h: están en `piezas` y en la frecuencia, en nada más.
      piezas_recientes: recientes,
      desde: conFecha[0]?.fecha ?? null,
      hasta: conFecha.at(-1)?.fecha ?? null,
    },
    etapa: etapaDe(seg, puntos, ritmo, hoyDia),
    medianas,
    percentiles: {
      visitas: { p25: visitasDe(0.25), p50: medianas.visitas, p75: visitasDe(0.75), p90: visitasDe(0.9) },
    },
    frecuencia: { por_semana_4s: r1(enVentana(28) / 4), por_semana_12s: r1(enVentana(84) / 12) },
    formatos,
    dias,
    horas,
    tercios,
    alcance_vs_seguidores: seg > 0 && medianas.visitas != null ? r2(medianas.visitas / seg) : null,
    mejores: mejores.map(corta(medianas.visitas)),
    peores: peores.map(corta(medianas.visitas)),
    desde_anterior: null,
    avisos,
    // Además del contrato: la base de los objetivos (y sus piezas una a una,
    // la más reciente primero, para contar pares), las tasas por cada 1.000
    // cuentas alcanzadas, la concentración y la conversión, que la IA necesita
    // y no puede calcular.
    base: {
      piezas: base.length,
      desde: base.find(p => p.fecha)?.fecha ?? null,
      hasta: [...base].reverse().find(p => p.fecha)?.fecha ?? null,
      medianas: medianasDe(base),
    },
    piezas_base: [...base].reverse().slice(0, MAX_PIEZAS_BASE).map(enCorto(medianas.visitas)),
    por_alcance,
    concentracion,
    conversion,
  }
  datos.desde_anterior = desdeAnterior(anterior, datos, hoyMs)

  // ── Avisos: lo que estos números no permiten concluir ──
  const n = (v) => Math.round(v).toLocaleString('es-ES', { useGrouping: 'always' })
  if (!lista.length) avisos.push('No hay publicaciones sincronizadas: sin piezas no hay estudio.')
  else if (lista.length < MIN_PIEZAS) avisos.push(`Solo hay ${lista.length} piezas: con menos de ${MIN_PIEZAS} casi todo es ruido y cualquier conclusión es provisional.`)
  if (seg == null) avisos.push('No se sabe cuántos seguidores tiene la cuenta: sincroniza Instagram para calcular la etapa.')
  if (!ritmo) {
    avisos.push(`Aún no hay histórico de seguidores suficiente (${datos.etapa.dias_historial} de ${MIN_DIAS_RITMO} días): sin ritmo de crecimiento ni fecha estimada para el siguiente hito.`)
  } else if (datos.etapa.siguiente_hito != null && !datos.etapa.fecha_estimada) {
    avisos.push(ritmo.porDia > 0
      ? `Al ritmo actual (${r1(ritmo.porDia)} seguidores al día) el siguiente hito queda a más de ${MAX_ANOS_ESTIMA} años: hay que cambiar el ritmo, no esperar.`
      : 'La cuenta no está creciendo en el último tramo del histórico: no hay fecha estimada para el siguiente hito.')
  }
  if (recientes) {
    avisos.push(`${recientes} ${recientes === 1 ? 'pieza tiene' : 'piezas tienen'} menos de ${EN_CURSO_H} h: ${recientes === 1 ? 'sigue' : 'siguen'} cogiendo visitas, así que solo ${recientes === 1 ? 'cuenta' : 'cuentan'} en la frecuencia, no en las medianas, los percentiles, los días, las franjas, los formatos, los tercios ni las mejores y peores.`)
  }
  if (lista.length && !maduras.length) avisos.push(`Todas las piezas tienen menos de ${EN_CURSO_H} h: todavía no hay nada que comparar.`)
  if (maduras.length && !tercios) avisos.push(`Hacen falta al menos ${MIN_TERCIOS} piezas maduras (5 por tercio) para comparar el tercio más visto con el menos visto; hay ${maduras.length}.`)
  if (maduras.length && maduras.length < MIN_PERCENTILES) avisos.push(`Con ${maduras.length} piezas maduras (menos de ${MIN_PERCENTILES}), los percentiles (p25, p75, p90) son orientativos: cambian mucho con cada pieza nueva.`)
  if (concentracion && maduras.length >= 5 && concentracion.mejor_pct >= 30) {
    avisos.push(`Una sola pieza («${porVisitas[0].titulo.slice(0, 60)}», ${n(porVisitas[0].visitas)} visitas) se lleva el ${concentracion.mejor_pct} % de todas las visitas: es un caso aparte, no una regla.`)
  }
  if (maduras.length && !maduras.some(p => p.retencion_s != null)) avisos.push('Ninguna pieza trae tiempo medio de visionado: no se puede hablar de retención.')
  if (maduras.length && Math.max(...dias.map(d => d.piezas)) < MIN_POR_GRUPO) avisos.push(`Ningún día de la semana llega a ${MIN_POR_GRUPO} piezas: los días no se comparan todavía.`)

  return datos
}
