// Los números del Estudio de contenido (api/_lib/estudio-contenido/datos.js):
// medianas y no medias, percentiles, tasas por cada 1.000 visitas, tercios
// (solo con 15 piezas maduras), días y franjas en hora de Madrid, la etapa con
// sus hitos, el ritmo solo con una semana de histórico y cómo van los objetivos
// del estudio anterior (en su plazo). Todo lo agregado, solo con piezas de 72 h
// o más. Es una función pura: aquí no hay base, ni red, ni reloj.
import { describe, it, expect, vi } from 'vitest'

// Los hitos del contrato. La doctrina la escribe otro módulo: aquí no hace falta.
vi.mock('../api/_lib/estudio-contenido/conocimiento.js', () => ({ HITOS: [1000, 10000, 100000, 1000000], CONOCIMIENTO: '', ALGORITMO_RESUMEN: [] }))

const { calculaDatos, percentil, mediana, valorMetrica, METRICAS_OBJETIVO } = await import('../api/_lib/estudio-contenido/datos.js')

const HOY = new Date('2026-10-27T10:00:00Z') // martes, 11:00 en Madrid
const DIA = 86_400_000

// Una pieza publicada hace `dias` días, a las 18:00 UTC si no se dice otra cosa.
let n = 0
function pieza(dias, extra = {}) {
  n++
  const t = new Date(HOY.getTime() - dias * DIA)
  t.setUTCHours(18, 0, 0, 0)
  return {
    id: `p${n}`, permalink: `https://instagram.com/p/${n}`, caption: `Pieza ${n}\nel resto del texto`,
    producto: 'REELS', tipo: 'VIDEO', publicado_en: t.toISOString(),
    visitas: 1000, alcance: 800, likes: 20, comentarios: 2, guardados: 10, compartidos: 5, interacciones: 40,
    retencion_media: 7.5, ...extra,
  }
}
const serie = (k, f = () => ({})) => Array.from({ length: k }, (_, i) => pieza(4 + i * 3, f(i)))

describe('estudio · percentiles y medianas', () => {
  it('interpola como siempre: el p50 es la mediana', () => {
    const xs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    expect(percentil(xs, 0.25)).toBe(325)
    expect(mediana(xs)).toBe(550)
    expect(percentil(xs, 0.75)).toBe(775)
    expect(percentil(xs, 0.9)).toBe(910)
    expect(mediana([3, null, 1, 2])).toBe(2)
    expect(mediana([])).toBeNull()
  })

  it('un viral no mueve la mediana (la media sí se iría a las nubes)', () => {
    const piezas = [...serie(20, (i) => ({ visitas: 1000 + i * 10 })), pieza(70, { visitas: 281_425 })]
    const d = calculaDatos({ piezas, seguidores: 1551, hoy: HOY })
    expect(d.medianas.visitas).toBe(1100)
    expect(d.percentiles.visitas.p50).toBe(d.medianas.visitas)
    expect(d.concentracion.mejor_pct).toBeGreaterThanOrEqual(30)
    expect(d.avisos.some(a => a.includes('se lleva el') && a.includes('caso aparte'))).toBe(true)
  })

  it('las tasas son por cada 1.000 visitas, y aparte por alcance', () => {
    const d = calculaDatos({ piezas: serie(12, () => ({ visitas: 2000, alcance: 1000, guardados: 20, compartidos: 6, likes: 40, interacciones: 80 })), seguidores: 4000, hoy: HOY })
    expect(d.medianas.guardados_por_mil).toBe(10)
    expect(d.medianas.compartidos_por_mil).toBe(3)
    expect(d.medianas.likes_por_mil).toBe(20)
    expect(d.medianas.interacciones_por_mil).toBe(40)
    expect(d.por_alcance.guardados_por_mil).toBe(20)
    expect(d.por_alcance.repeticion).toBe(2)
    expect(d.alcance_vs_seguidores).toBe(0.5)
  })
})

describe('estudio · pocas piezas', () => {
  it('con menos de 12 avisa, y con menos de 15 maduras no hay tercios', () => {
    const d = calculaDatos({ piezas: serie(5), seguidores: 300, hoy: HOY })
    expect(d.cuenta.piezas).toBe(5)
    expect(d.tercios).toBeNull()
    expect(d.avisos.some(a => a.startsWith('Solo hay 5 piezas'))).toBe(true)
    expect(d.avisos.some(a => a.includes('al menos 15 piezas maduras') && a.includes('hay 5'))).toBe(true)
  })

  it('tercios: con 14 maduras no (serían 4 contra 4); con 15, 5 contra 5', () => {
    const catorce = calculaDatos({ piezas: serie(14, (i) => ({ visitas: 1000 + i * 100 })), seguidores: 2000, hoy: HOY })
    expect(catorce.tercios).toBeNull()
    expect(catorce.avisos.some(a => a.includes('al menos 15 piezas maduras'))).toBe(true)
    // Las jóvenes no cuentan para llegar a 15.
    const conJovenes = calculaDatos({ piezas: [...serie(14), pieza(1), pieza(2)], seguidores: 2000, hoy: HOY })
    expect(conJovenes.tercios).toBeNull()
    const quince = calculaDatos({ piezas: serie(15, (i) => ({ visitas: 1000 + i * 100 })), seguidores: 2000, hoy: HOY })
    expect(quince.tercios.arriba.piezas).toBe(5)
    expect(quince.tercios.abajo.piezas).toBe(5)
    expect(quince.avisos.some(a => a.includes('piezas maduras (5 por tercio)'))).toBe(false)
  })

  it('con menos de 30 maduras avisa de que los percentiles son orientativos', () => {
    expect(calculaDatos({ piezas: serie(29), seguidores: 2000, hoy: HOY }).avisos.some(a => a.includes('percentiles') && a.includes('orientativos'))).toBe(true)
    expect(calculaDatos({ piezas: serie(30), seguidores: 2000, hoy: HOY }).avisos.some(a => a.includes('orientativos'))).toBe(false)
  })

  it('sin piezas devuelve la forma entera y lo dice', () => {
    const d = calculaDatos({ piezas: [], hoy: HOY })
    expect(d.cuenta).toEqual({ usuario: null, seguidores: null, piezas: 0, piezas_recientes: 0, desde: null, hasta: null })
    expect(d.medianas.visitas).toBeNull()
    expect(d.mejores).toEqual([])
    expect(d.peores).toEqual([])
    expect(d.desde_anterior).toBeNull()
    expect(d.avisos[0]).toMatch(/No hay publicaciones/)
  })
})

describe('estudio · etapa e hitos', () => {
  const etapa = (seguidores, historial = []) => calculaDatos({ piezas: serie(12), seguidores, historialSeguidores: historial, hoy: HOY }).etapa

  it('con 1.551 está entre 1.000 y 10.000, al 6 % de la etapa', () => {
    const e = etapa(1551)
    expect(e.hito_anterior).toBe(1000)
    expect(e.siguiente_hito).toBe(10_000)
    expect(e.progreso).toBe(0.061)
    expect(e.ritmo_necesario_90d).toBe(93.9)
  })

  it('por debajo de 1.000 el hito anterior es 0; en un hito justo, empieza la etapa siguiente', () => {
    expect(etapa(500)).toMatchObject({ hito_anterior: 0, siguiente_hito: 1000, progreso: 0.5 })
    expect(etapa(10_000)).toMatchObject({ hito_anterior: 10_000, siguiente_hito: 100_000, progreso: 0 })
  })

  it('pasado el último hito no hay siguiente', () => {
    expect(etapa(2_000_000)).toMatchObject({ hito_anterior: 1_000_000, siguiente_hito: null, progreso: 1, ritmo_necesario_90d: null })
  })

  it('sin histórico: ni ritmo ni fecha, y aviso', () => {
    const d = calculaDatos({ piezas: serie(12), seguidores: 1551, hoy: HOY })
    expect(d.etapa).toMatchObject({ ritmo_dia: null, dias_historial: 0, fecha_estimada: null })
    expect(d.avisos.some(a => a.includes('0 de 7 días'))).toBe(true)
  })

  it('con menos de 7 días de histórico, tampoco', () => {
    const d = calculaDatos({ piezas: serie(12), seguidores: 1560, historialSeguidores: [{ dia: '2026-10-24', seguidores: 1500 }, { dia: '2026-10-27', seguidores: 1560 }], hoy: HOY })
    expect(d.etapa.ritmo_dia).toBeNull()
    expect(d.etapa.dias_historial).toBe(3)
    expect(d.avisos.some(a => a.includes('3 de 7 días'))).toBe(true)
  })

  it('con una semana o más: ritmo, fecha estimada y conversión reciente', () => {
    const historial = [
      { dia: '2026-09-01', seguidores: 1000 },   // de hace más de 30 días: no se usa si hay otra mejor
      { dia: '2026-10-07', seguidores: 1351 },
      { dia: '2026-10-17', seguidores: 1451 },
      { dia: '2026-10-27', seguidores: 1551 },
    ]
    const d = calculaDatos({ piezas: serie(12), seguidores: 1551, historialSeguidores: historial, hoy: HOY })
    expect(d.etapa.dias_historial).toBe(56)
    expect(d.etapa.ritmo_dia).toBe(10)                      // (1551 - 1351) / 20 días
    // (10.000 - 1.551) / 10 = 845 días desde el 27-oct-2026
    expect(d.etapa.fecha_estimada).toBe('2029-02-18')
    expect(d.conversion.reciente_por_mil).toBeGreaterThan(0)
    expect(d.avisos.some(a => a.includes('histórico de seguidores'))).toBe(false)
  })

  it('un día repetido en el histórico cuenta una vez (gana la última foto)', () => {
    const d = calculaDatos({ piezas: serie(12), seguidores: 1600, historialSeguidores: [
      { dia: '2026-10-20', seguidores: 1500 }, { dia: '2026-10-20', seguidores: 1530 }, { dia: '2026-10-27', seguidores: 1600 },
    ], hoy: HOY })
    expect(d.etapa.ritmo_dia).toBe(10)
  })

  it('si la cuenta no crece, no hay fecha y se dice', () => {
    const d = calculaDatos({ piezas: serie(12), seguidores: 1500, historialSeguidores: [{ dia: '2026-10-13', seguidores: 1500 }, { dia: '2026-10-27', seguidores: 1500 }], hoy: HOY })
    expect(d.etapa.ritmo_dia).toBe(0)
    expect(d.etapa.fecha_estimada).toBeNull()
    expect(d.avisos.some(a => a.includes('no está creciendo'))).toBe(true)
  })
})

describe('estudio · tercios', () => {
  it('compara el tercio más visto con el menos visto, sus ganchos y su texto', () => {
    const piezas = serie(15, (i) => i < 5
      ? { visitas: 5000 + i, caption: `¿Sabes por qué 3 de cada 4 fallan?\n${'x'.repeat(200)}` }
      : i >= 10 ? { visitas: 100 + i, caption: 'Hoy toca\ncorto' } : { visitas: 1000 + i })
    const d = calculaDatos({ piezas, seguidores: 2000, hoy: HOY })
    expect(d.tercios.arriba.piezas).toBe(5)
    expect(d.tercios.arriba.visitas).toBeGreaterThan(5000)
    expect(d.tercios.abajo.visitas).toBeLessThan(200)
    expect(d.tercios.arriba.gancho_pregunta_pct).toBe(100)
    expect(d.tercios.arriba.gancho_numero_pct).toBe(100)
    expect(d.tercios.abajo.gancho_pregunta_pct).toBe(0)
    expect(d.tercios.arriba.longitud_caption).toBeGreaterThan(d.tercios.abajo.longitud_caption)
    expect(d.tercios.arriba).toHaveProperty('retencion_s')
  })

  it('lo de menos de 72 h no cuenta en nada agregado; solo en la frecuencia', () => {
    // Las 15 maduras, todas a las 18:00 UTC (20:00 de Madrid, «noche»). Las dos
    // jóvenes, carruseles con muy pocas visitas a mediodía de Madrid.
    const maduras = serie(15, (i) => ({ visitas: 1000 + i * 100 }))
    const nuevas = [
      pieza(0.5, { visitas: 3, producto: 'FEED', tipo: 'CAROUSEL_ALBUM', publicado_en: '2026-10-26T12:00:00Z' }),
      pieza(1, { visitas: 4, producto: 'FEED', tipo: 'CAROUSEL_ALBUM', publicado_en: '2026-10-25T12:00:00Z' }),
    ]
    const d = calculaDatos({ piezas: [...maduras, ...nuevas], seguidores: 2000, hoy: HOY })
    const soloMaduras = calculaDatos({ piezas: maduras, seguidores: 2000, hoy: HOY })
    expect(d.cuenta).toMatchObject({ piezas: 17, piezas_recientes: 2, hasta: '2026-10-26' })
    expect(d.medianas).toEqual(soloMaduras.medianas)
    expect(d.base).toEqual(soloMaduras.base)
    expect(d.percentiles).toEqual(soloMaduras.percentiles)
    expect(d.dias).toEqual(soloMaduras.dias)
    expect(d.horas).toEqual(soloMaduras.horas)
    expect(d.formatos.map(f => f.formato)).toEqual(['reel'])
    expect(d.tercios).toEqual(soloMaduras.tercios)
    expect(d.alcance_vs_seguidores).toBe(soloMaduras.alcance_vs_seguidores)
    expect(d.mejores).toEqual(soloMaduras.mejores)
    expect(d.peores.map(p => p.visitas)).not.toContain(3)
    expect(d.peores[0].visitas).toBe(1000)
    // La frecuencia sí las cuenta: publicar es publicar.
    expect(d.frecuencia.por_semana_4s).toBe(soloMaduras.frecuencia.por_semana_4s + 0.5)
    expect(d.avisos.some(a => a.startsWith('2 piezas tienen menos de 72 h') && a.includes('solo cuentan en la frecuencia'))).toBe(true)
  })

  it('una pieza de 24 h no tira hacia abajo la base de los objetivos', () => {
    const d = calculaDatos({ piezas: [...serie(12, () => ({ visitas: 2000 })), pieza(1, { visitas: 10 })], hoy: HOY })
    expect(d.base).toMatchObject({ piezas: 12, medianas: { visitas: 2000 } })
    expect(valorMetrica(d, 'visitas')).toBe(2000)
  })

  it('si todas son jóvenes, no hay nada que comparar y se dice', () => {
    const d = calculaDatos({ piezas: [pieza(1), pieza(2)], seguidores: 100, hoy: HOY })
    expect(d.cuenta).toMatchObject({ piezas: 2, piezas_recientes: 2 })
    expect(d.medianas.visitas).toBeNull()
    expect(d.mejores).toEqual([])
    expect(d.avisos.some(a => a.startsWith('Todas las piezas tienen menos de 72 h'))).toBe(true)
  })
})

describe('estudio · Madrid, formatos y frecuencia', () => {
  it('el día y la franja son los de Madrid, también con cambio de hora', () => {
    const d = calculaDatos({ piezas: [
      // Lunes 23:30 UTC = martes 00:30 en Madrid (horario de invierno, +1)
      pieza(0, { publicado_en: '2026-11-02T23:30:00Z' }),
      // Lunes 22:30 UTC = martes 00:30 en Madrid (horario de verano, +2)
      pieza(0, { publicado_en: '2026-07-06T22:30:00Z' }),
      // Miércoles 12:30 UTC = 14:30 en Madrid, en verano
      pieza(0, { publicado_en: '2026-07-08T12:30:00Z' }),
    ], seguidores: 100, hoy: new Date('2026-11-10T10:00:00Z') })
    const dia = (x) => d.dias.find(z => z.dia === x).piezas
    expect(dia('lunes')).toBe(0)
    expect(dia('martes')).toBe(2)
    expect(dia('miércoles')).toBe(1)
    expect(d.horas.find(h => h.franja.startsWith('madrugada')).piezas).toBe(2)
    expect(d.horas.find(h => h.franja.startsWith('mediodía')).piezas).toBe(1)
    expect(d.cuenta.desde).toBe('2026-07-07')
    expect(d.cuenta.hasta).toBe('2026-11-03')
    expect(d.dias.map(x => x.dia)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])
  })

  it('separa reels, carruseles e imágenes, de más a menos piezas', () => {
    const d = calculaDatos({ piezas: [
      ...serie(3), pieza(5, { producto: 'FEED', tipo: 'CAROUSEL_ALBUM', compartidos: 20, visitas: 2000 }),
      pieza(6, { producto: 'FEED', tipo: 'CAROUSEL_ALBUM', compartidos: 20, visitas: 2000 }), pieza(7, { producto: 'FEED', tipo: 'IMAGE' }),
    ], seguidores: 100, hoy: HOY })
    expect(d.formatos.map(f => f.formato)).toEqual(['reel', 'carrusel', 'imagen'])
    expect(d.formatos[1]).toEqual({ formato: 'carrusel', piezas: 2, mediana_visitas: 2000, mediana_compartidos_por_mil: 10 })
  })

  it('frecuencia: piezas por semana en las últimas 4 y 12 semanas', () => {
    const piezas = [...Array.from({ length: 8 }, (_, i) => pieza(i * 3 + 1)), ...Array.from({ length: 4 }, (_, i) => pieza(40 + i * 10))]
    const d = calculaDatos({ piezas, seguidores: 100, hoy: HOY })
    expect(d.frecuencia.por_semana_4s).toBe(2)
    expect(d.frecuencia.por_semana_12s).toBe(1)
  })
})

describe('estudio · mejores, peores y base', () => {
  it('cinco y cinco, sin repetirse, las peores de peor a mejor, con las veces la mediana', () => {
    const d = calculaDatos({ piezas: serie(14, (i) => ({ visitas: (i + 1) * 100 })), seguidores: 1000, hoy: HOY })
    expect(d.mejores.map(p => p.visitas)).toEqual([1400, 1300, 1200, 1100, 1000])
    expect(d.peores.map(p => p.visitas)).toEqual([100, 200, 300, 400, 500])
    expect(d.mejores[0]).toMatchObject({ titulo: expect.stringMatching(/^Pieza/), url: expect.stringContaining('instagram.com'), veces_mediana: 1.9 })
    expect(Object.keys(d.mejores[0])).toEqual(expect.arrayContaining(['titulo', 'fecha', 'visitas', 'retencion_s', 'guardados_por_mil', 'compartidos_por_mil', 'url']))
  })

  it('con pocas, las peores no repiten las mejores', () => {
    const d = calculaDatos({ piezas: serie(7, (i) => ({ visitas: (i + 1) * 100 })), seguidores: 1000, hoy: HOY })
    expect(d.mejores).toHaveLength(5)
    expect(d.peores.map(p => p.visitas)).toEqual([100, 200])
  })

  it('la base son las últimas 8 semanas; si hay pocas, las últimas 12 piezas', () => {
    const viejas = Array.from({ length: 20 }, (_, i) => pieza(100 + i, { visitas: 500 }))
    const recientes = Array.from({ length: 14 }, (_, i) => pieza(4 + i * 3, { visitas: 3000 }))
    expect(calculaDatos({ piezas: [...viejas, ...recientes], hoy: HOY }).base).toMatchObject({ piezas: 14, medianas: { visitas: 3000 } })
    const pocas = calculaDatos({ piezas: [...viejas, ...recientes.slice(0, 4)], hoy: HOY }).base
    expect(pocas.piezas).toBe(12)
    expect(pocas.medianas.visitas).toBe(500)
  })

  it('piezas_base: las de la base una a una, la más reciente primero, maduras y en corto (para contar pares)', () => {
    const viejas = Array.from({ length: 20 }, (_, i) => pieza(100 + i, { visitas: 500 }))
    const recientes = Array.from({ length: 14 }, (_, i) => pieza(4 + i * 3, { visitas: 3000 + i, caption: `Gancho ${i}\nresto` }))
    const joven = pieza(1, { visitas: 90_000 })
    const d = calculaDatos({ piezas: [...viejas, ...recientes, joven], hoy: HOY })
    expect(d.piezas_base).toHaveLength(d.base.piezas)
    // La de 24 h no está; la primera es la más reciente de las maduras.
    expect(d.piezas_base.some(p => p.visitas === 90_000)).toBe(false)
    expect(d.piezas_base[0]).toEqual({
      fecha: recientes[0].publicado_en.slice(0, 10), formato: 'reel', visitas: 3000, veces_mediana: expect.any(Number),
      retencion_s: 7.5, guardados_por_mil: 3.3, compartidos_por_mil: 1.7, titulo: 'Gancho 0',
    })
    expect(d.piezas_base.map(p => p.fecha)).toEqual([...d.piezas_base.map(p => p.fecha)].sort().reverse())
    // Con muchas, un tope: no se manda a la IA la base entera de una cuenta que publica a diario.
    const muchas = Array.from({ length: 60 }, (_, i) => pieza(4 + i * 0.5))
    expect(calculaDatos({ piezas: muchas, hoy: HOY }).piezas_base).toHaveLength(40)
  })
})

describe('estudio · desde el anterior', () => {
  const piezas = Array.from({ length: 12 }, (_, i) => pieza(4 + i * 3, { visitas: 2000, retencion_media: 9 }))
  const anterior = (objetivos, generado_en = '2026-10-20T07:00:00Z') => ({
    generado_en, datos: { base: { medianas: { visitas: 1500 } }, cuenta: { seguidores: 1500 } }, estudio: { objetivos },
  })

  it('cada objetivo se mide en su plazo: cumplido, en curso o no cumplido', () => {
    const d = calculaDatos({ piezas, seguidores: 1551, hoy: HOY, anterior: anterior([
      // Ya llegó (2.000 ≥ 1.800) antes de vencer: cumplido.
      { nombre: 'Subir la mediana', metrica: 'visitas', actual: 1500, objetivo: 1800, plazo_dias: 30 },
      // Va por debajo pero aún le quedan días: en curso, sin veredicto.
      { nombre: 'Retener más', metrica: 'retencion_s', actual: 7.8, objetivo: 9.5, plazo_dias: 30 },
      // Puesto el 1-oct a 14 días: venció el 15-oct sin llegar. Sin `actual`,
      // el «antes» sale de los datos del anterior.
      { nombre: 'Llegar a 1.600', metrica: 'seguidores', objetivo: 1600, plazo_dias: 14, desde: '2026-10-01T07:00:00Z' },
      // Bajar: se cumple al quedar por debajo.
      { nombre: 'Publicar menos y mejor', metrica: 'frecuencia', actual: 7, objetivo: 4, plazo_dias: 14 },
    ]) })
    expect(d.desde_anterior.generado_en).toBe('2026-10-20T07:00:00Z')
    expect(d.desde_anterior.objetivos).toEqual([
      { nombre: 'Subir la mediana', metrica: 'visitas', antes: 1500, ahora: 2000, objetivo: 1800, estado: 'cumplido', cumplido: true, avance: 1, vence: '2026-11-19T07:00:00.000Z' },
      { nombre: 'Retener más', metrica: 'retencion_s', antes: 7.8, ahora: 9, objetivo: 9.5, estado: 'en_curso', cumplido: null, avance: 0.706, vence: '2026-11-19T07:00:00.000Z' },
      { nombre: 'Llegar a 1.600', metrica: 'seguidores', antes: 1500, ahora: 1551, objetivo: 1600, estado: 'no_cumplido', cumplido: false, avance: 0.51, vence: '2026-10-15T07:00:00.000Z' },
      { nombre: 'Publicar menos y mejor', metrica: 'frecuencia', antes: 7, ahora: d.frecuencia.por_semana_4s, objetivo: 4, estado: 'cumplido', cumplido: true, avance: 1, vence: '2026-11-03T07:00:00.000Z' },
    ])
  })

  it('el mismo objetivo sin cumplir: en curso antes de vencer, no cumplido el día que vence', () => {
    const ant = anterior([{ nombre: 'Retener más', metrica: 'retencion_s', actual: 7.8, objetivo: 9.5, plazo_dias: 14 }])
    // La víspera (2-nov, 21:00 en Madrid): aún en plazo.
    const antes = calculaDatos({ piezas, hoy: new Date('2026-11-02T20:00:00Z'), anterior: ant }).desde_anterior.objetivos[0]
    expect(antes).toMatchObject({ estado: 'en_curso', cumplido: null, vence: '2026-11-03T07:00:00.000Z' })
    const despues = calculaDatos({ piezas, hoy: new Date('2026-11-03T07:00:00Z'), anterior: ant }).desde_anterior.objetivos[0]
    expect(despues).toMatchObject({ estado: 'no_cumplido', cumplido: false })
  })

  it('vence por día de Madrid: el estudio de ese día lo mide aunque arranque unos minutos antes de la hora en que se puso', () => {
    // Puesto a las 04:35 UTC a 28 días: vence el 2-nov a las 04:35 UTC (05:35 en
    // Madrid, ya en horario de invierno). El estudio de ese día arranca a las
    // 04:31 porque la cola iba más ligera, o a las 04:40: los dos lo miden.
    const ant = anterior([{ nombre: 'Retener más', metrica: 'retencion_s', actual: 7.8, objetivo: 9.5, plazo_dias: 28, desde: '2026-10-05T04:35:00Z' }])
    const pronto = calculaDatos({ piezas, hoy: new Date('2026-11-02T04:31:00Z'), anterior: ant }).desde_anterior.objetivos[0]
    const tarde = calculaDatos({ piezas, hoy: new Date('2026-11-02T04:40:00Z'), anterior: ant }).desde_anterior.objetivos[0]
    expect(pronto).toMatchObject({ estado: 'no_cumplido', cumplido: false })
    expect(tarde).toMatchObject({ estado: 'no_cumplido', cumplido: false })
    // La víspera, en Madrid, sigue en plazo.
    expect(calculaDatos({ piezas, hoy: new Date('2026-11-01T22:00:00Z'), anterior: ant }).desde_anterior.objetivos[0].estado).toBe('en_curso')
  })

  it('el punto de partida de un objetivo mantenido manda sobre su «actual»; sin plazo, 30 días', () => {
    const d = calculaDatos({ piezas, seguidores: 1551, hoy: HOY, anterior: anterior([
      { nombre: 'Subir la mediana', metrica: 'visitas', actual: 1900, partida: 1000, objetivo: 3000, plazo_dias: 60, desde: '2026-10-06T07:00:00Z' },
      { nombre: 'Más guardados', metrica: 'guardados_por_mil', actual: 8, objetivo: 20 },
    ]) })
    expect(d.desde_anterior.objetivos[0]).toMatchObject({ antes: 1000, ahora: 2000, estado: 'en_curso', avance: 0.5, vence: '2026-12-05T07:00:00.000Z' })
    expect(d.desde_anterior.objetivos[1]).toMatchObject({ estado: 'en_curso', vence: '2026-11-19T07:00:00.000Z' })
  })

  it('sin anterior, o sin objetivos, es null', () => {
    expect(calculaDatos({ piezas, hoy: HOY }).desde_anterior).toBeNull()
    expect(calculaDatos({ piezas, anterior: { estudio: { objetivos: [] } }, hoy: HOY }).desde_anterior).toBeNull()
  })

  it('valorMetrica: seguidores, frecuencia y medianas de la base; lo desconocido es null', () => {
    const d = calculaDatos({ piezas, seguidores: 1551, hoy: HOY })
    expect(valorMetrica(d, 'seguidores')).toBe(1551)
    expect(valorMetrica(d, 'frecuencia')).toBe(d.frecuencia.por_semana_4s)
    expect(valorMetrica(d, 'visitas')).toBe(d.base.medianas.visitas)
    expect(valorMetrica(d, 'inventada')).toBeNull()
    expect(valorMetrica(null, 'visitas')).toBeNull()
    expect(METRICAS_OBJETIVO).toEqual(['visitas', 'alcance', 'retencion_s', 'guardados_por_mil', 'compartidos_por_mil', 'interacciones_por_mil', 'likes_por_mil', 'seguidores', 'frecuencia'])
  })
})
