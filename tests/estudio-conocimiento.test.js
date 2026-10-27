// Base de conocimiento del Estudio de contenido: que esté todo, que solo use las
// tres etiquetas de confianza, que cada punto del resumen y cada fuente lleven
// una URL de verdad y que el texto del system prompt no se desmadre de tamaño.
// Son datos estáticos: sin red ni base.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  CONOCIMIENTO,
  ALGORITMO_RESUMEN,
  FUENTES,
  HITOS,
  FECHA_INVESTIGACION,
} from '../api/_lib/estudio-contenido/conocimiento.js'

const ETIQUETAS = ['OFICIAL', 'DATOS', 'HEURÍSTICA']
const ESTADOS = ['en_prueba', 'confirmada', 'descartada']
// Las cifras con punto de millar, como se escriben en la doctrina (en es-ES
// el 1000 no se agrupa si no se pide).
const miles = (n) => n.toLocaleString('es-ES', { useGrouping: 'always' })
const urlValida = (u) => {
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

describe('conocimiento: exports', () => {
  it('exporta todo lo del contrato', () => {
    expect(typeof CONOCIMIENTO).toBe('string')
    expect(Array.isArray(ALGORITMO_RESUMEN)).toBe(true)
    expect(Array.isArray(FUENTES)).toBe(true)
    expect(Array.isArray(HITOS)).toBe(true)
    expect(typeof FECHA_INVESTIGACION).toBe('string')
  })

  it('HITOS son los cuatro de la etapa, en orden', () => {
    expect(HITOS).toEqual([1000, 10000, 100000, 1000000])
  })

  it('FECHA_INVESTIGACION es una fecha AAAA-MM-DD real', () => {
    expect(FECHA_INVESTIGACION).toBe('2026-10-27')
    expect(FECHA_INVESTIGACION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(FECHA_INVESTIGACION))).toBe(false)
  })

  it('el código no apunta a archivos temporales (las fuentes van en FUENTES)', () => {
    const fuente = readFileSync(new URL('../api/_lib/estudio-contenido/conocimiento.js', import.meta.url), 'utf8')
    expect(fuente).not.toMatch(/scratchpad|\/tmp\//i)
  })
})

describe('conocimiento: CONOCIMIENTO (system prompt)', () => {
  it('es denso pero no se pasa de 30.000 caracteres', () => {
    expect(CONOCIMIENTO.length).toBeGreaterThan(5000)
    expect(CONOCIMIENTO.length).toBeLessThanOrEqual(30000)
  })

  it('está dentro del rango de palabras (2.500-4.500)', () => {
    const palabras = CONOCIMIENTO.split(/\s+/).filter(Boolean).length
    expect(palabras).toBeGreaterThanOrEqual(2500)
    expect(palabras).toBeLessThanOrEqual(4500)
  })

  it('viene recortado, sin saltos sueltos en los bordes', () => {
    expect(CONOCIMIENTO).toBe(CONOCIMIENTO.trim())
  })

  it('cubre las cinco superficies y los pilares del método', () => {
    for (const t of ['Feed', 'Reels', 'Explorar', 'recomendaciones', 'Stories']) {
      expect(CONOCIMIENTO).toContain(t)
    }
    for (const t of ['mediana', 'percentil', 'alcance', 'retención', 'tercio', 'experiment']) {
      expect(CONOCIMIENTO.toLowerCase()).toContain(t)
    }
  })

  it('tiene una etapa que acaba en cada uno de los cuatro hitos', () => {
    // «0 → 1.000 —», «1.000 → 10.000 —», «10.000 → 100.000 —», «100.000 → 1.000.000 —»
    for (const h of HITOS) {
      expect(CONOCIMIENTO, `falta la etapa que llega a ${miles(h)}`).toContain(`→ ${miles(h)} —`)
    }
  })

  it('usa las tres etiquetas de confianza', () => {
    for (const e of ETIQUETAS) {
      expect(CONOCIMIENTO).toContain(`[${e}]`)
    }
  })

  it('entre corchetes solo hay las tres etiquetas (o los huecos de la plantilla de hipótesis)', () => {
    const corchetes = [...CONOCIMIENTO.matchAll(/\[([^\]]+)\]/g)].map(m => m[1])
    expect(corchetes.length).toBeGreaterThan(0)
    // Lista cerrada: «[cálculo propio]» o «[datos]» serían etiquetas inventadas.
    const HUECOS = ['un solo cambio', 'tipo de pieza', 'métrica primaria', 'base', 'objetivo', 'mecanismo']
    for (const c of corchetes) {
      expect(HUECOS.includes(c) || ETIQUETAS.includes(c), `etiqueta no válida: [${c}]`).toBe(true)
    }
    // «vía prensa» va fuera de la etiqueta, nunca dentro.
    expect(CONOCIMIENTO).not.toMatch(/\[[^\]]*vía prensa[^\]]*\]/i)
    expect(CONOCIMIENTO).toContain('(vía prensa)')
  })

  it('empieza por la regla dura: solo las cifras de DATOS, sin recalcular la etapa', () => {
    const regla = CONOCIMIENTO.indexOf('REGLA DURA')
    expect(regla).toBeGreaterThan(-1)
    // Va antes que la doctrina del algoritmo.
    expect(regla).toBeLessThan(CONOCIMIENTO.indexOf('# 1.'))
    expect(CONOCIMIENTO).toContain('datos.etapa')
    expect(CONOCIMIENTO).toMatch(/falta histórico/)
    // Lo que HELM no tiene no se estima: va a avisos y a métricas a vigilar.
    for (const t of ['duración del vídeo', 'tasa de', 'D+3', 'seguidores ganados por', '% de no seguidores', 'avisos', 'metricas_a_vigilar']) {
      expect(CONOCIMIENTO).toContain(t)
    }
  })

  it('una fecha estimada null no es siempre «falta histórico»: nombra cada caso de datos.etapa', () => {
    const regla = CONOCIMIENTO.slice(CONOCIMIENTO.indexOf('REGLA DURA'), CONOCIMIENTO.indexOf('# 1.'))
    expect(regla).toContain('cuenta.seguidores null')     // no se sabe cuántos tiene
    expect(regla).toContain('ritmo_dia null')             // falta histórico
    expect(regla).toMatch(/ritmo_dia 0 o negativo[^·]*no crece/)
    expect(regla).toMatch(/ritmo_dia mayor que 0[^·]*más de 10 años[^·]*ritmo_necesario_90d/)
    expect(regla).toContain('siguiente_hito null')
    expect(regla).toMatch(/en ningún caso estimes tú una fecha/)
  })

  it('los pares se cuentan solo con piezas que la IA ve, y sin estadística que no puede calcular', () => {
    expect(CONOCIMIENTO).toContain('piezas_base')
    expect(CONOCIMIENTO).toMatch(/SOLO con piezas que veas en DATOS/)
    expect(CONOCIMIENTO).toMatch(/nunca\s+supongas pares que no ves/)
    expect(CONOCIMIENTO).not.toMatch(/Mann-Whitney/)
    // Lo que DATOS no trae no se compara (alcance_vs_seguidores del estudio anterior).
    expect(CONOCIMIENTO).toMatch(/que DATOS no trae \(no lo supongas\)/)
  })

  it('el plazo de los objetivos lo elige la IA; las fechas y proyecciones, no', () => {
    expect(CONOCIMIENTO).not.toMatch(/NO calcules plazos/)
    expect(CONOCIMIENTO).toMatch(/plazo_dias, de 14 a 90\) sí lo eliges tú/)
  })

  it('dice el denominador de las tasas: por mil visitas y, aparte, por alcance', () => {
    expect(CONOCIMIENTO).toContain('por cada 1.000 VISITAS')
    expect(CONOCIMIENTO).toContain('datos.por_alcance')
    expect(CONOCIMIENTO).toContain('por cada 1.000 CUENTAS')
  })

  it('solo agrega piezas maduras (72 h) y lo dice', () => {
    expect(CONOCIMIENTO).toContain('72 h')
    expect(CONOCIMIENTO).toContain('piezas_recientes')
    expect(CONOCIMIENTO).toMatch(/frecuencia\s+sí las cuenta todas/)
  })

  it('recoge la regla oficial del cebo de interacción, sin vender «comenta PALABRA» a ciegas', () => {
    expect(CONOCIMIENTO).toMatch(/CEBO/)
    expect(CONOCIMIENTO).toContain('emoji')
    expect(CONOCIMIENTO).toContain('ManyChat')
    expect(CONOCIMIENTO).toMatch(/sorteos/)
    // «Comenta PALABRA» solo aparece con su matiz de moderación y riesgo.
    expect(CONOCIMIENTO).toMatch(/«Comenta PALABRA»[^.]*moderación[^.]*riesgo/)
  })

  it('trae la doctrina del avatar de contenido, distinto del de ventas', () => {
    expect(CONOCIMIENTO).toContain('AVATAR DE CONTENIDO')
    expect(CONOCIMIENTO).toContain('Schwartz')
    expect(CONOCIMIENTO).toContain('avatar de')
    expect(CONOCIMIENTO).toContain('ventas')
    expect(CONOCIMIENTO).toContain('diferencia_con_ventas')
  })

  it('da reglas para días, horas y alcance_vs_seguidores', () => {
    expect(CONOCIMIENTO).toMatch(/no hay una mejor hora oficial/i)
    expect(CONOCIMIENTO).toContain('Buffer')
    expect(CONOCIMIENTO).toContain('datos.dias')
    expect(CONOCIMIENTO).toContain('alcance_vs_seguidores')
  })

  it('usa los tres estados de aprendido del contrato y ningún otro', () => {
    for (const e of ESTADOS) expect(CONOCIMIENTO).toContain(e)
    // Los de antes («hipótesis/provisional») no son estados del contrato.
    expect(CONOCIMIENTO).not.toMatch(/provisional/i)
    expect(CONOCIMIENTO).toMatch(/vuelve a en_prueba/)
    expect(CONOCIMIENTO).toMatch(/dentro de «evidencia»/)
  })

  it('explica los objetivos anteriores con sus estados y los vigentes', () => {
    for (const t of ['desde_anterior', 'cumplido', 'no_cumplido', 'en_curso', 'avance', 'vence', 'VIGENTES']) {
      expect(CONOCIMIENTO).toContain(t)
    }
  })
})

describe('conocimiento: ALGORITMO_RESUMEN', () => {
  it('trae entre 8 y 12 puntos', () => {
    expect(ALGORITMO_RESUMEN.length).toBeGreaterThanOrEqual(8)
    expect(ALGORITMO_RESUMEN.length).toBeLessThanOrEqual(12)
  })

  it('cada punto lleva título, texto, una fuente URL y una etiqueta válida', () => {
    for (const p of ALGORITMO_RESUMEN) {
      expect(typeof p.titulo).toBe('string')
      expect(p.titulo.trim().length).toBeGreaterThan(0)
      expect(typeof p.texto).toBe('string')
      expect(p.texto.trim().length).toBeGreaterThan(0)
      expect(urlValida(p.fuente), `fuente no es URL en «${p.titulo}»`).toBe(true)
      expect(ETIQUETAS, `etiqueta no válida en «${p.titulo}»`).toContain(p.etiqueta)
      // La etiqueta va en su campo, no metida en el texto.
      expect(p.texto, `corchetes en «${p.titulo}»`).not.toMatch(/[[\]]/)
    }
  })

  it('cada fuente del resumen está en FUENTES', () => {
    const urls = new Set(FUENTES.map(f => f.url))
    for (const p of ALGORITMO_RESUMEN) {
      expect(urls.has(p.fuente), `«${p.titulo}» cita una fuente que no está en FUENTES`).toBe(true)
    }
  })

  it('la duración cita el estudio de duración, no el de estadísticas generales', () => {
    const duracion = ALGORITMO_RESUMEN.find(p => /duración importa/i.test(p.titulo))
    expect(duracion?.fuente).toBe('https://socialinsider.io/blog/instagram-reels-length/')
  })

  it('no repite títulos', () => {
    const titulos = ALGORITMO_RESUMEN.map(p => p.titulo)
    expect(new Set(titulos).size).toBe(titulos.length)
  })

  it('son puntos cortos para la pantalla, no párrafos', () => {
    for (const p of ALGORITMO_RESUMEN) {
      expect(p.texto.length, `punto demasiado largo: «${p.titulo}»`).toBeLessThanOrEqual(260)
    }
  })

  it('mezcla fuentes oficiales con datos de terceros', () => {
    const etiquetas = new Set(ALGORITMO_RESUMEN.map(p => p.etiqueta))
    expect(etiquetas.has('OFICIAL')).toBe(true)
    expect(etiquetas.has('DATOS')).toBe(true)
  })
})

describe('conocimiento: FUENTES', () => {
  it('trae las fuentes con id, título, URL, fecha y etiqueta', () => {
    expect(FUENTES.length).toBeGreaterThanOrEqual(10)
    for (const f of FUENTES) {
      expect(Object.keys(f).sort()).toEqual(['etiqueta', 'fecha', 'id', 'titulo', 'url'])
      expect(f.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(f.titulo.trim().length).toBeGreaterThan(0)
      expect(urlValida(f.url), `URL no válida en «${f.id}»`).toBe(true)
      expect(ETIQUETAS, `etiqueta no válida en «${f.id}»`).toContain(f.etiqueta)
    }
  })

  it('la fecha es null, un año o un día real, y no posterior a la investigación', () => {
    for (const f of FUENTES) {
      if (f.fecha == null) continue
      expect(f.fecha, `fecha rara en «${f.id}»`).toMatch(/^\d{4}(?:-\d{2}-\d{2})?$/)
      expect(Number.isNaN(Date.parse(f.fecha))).toBe(false)
      expect(f.fecha <= FECHA_INVESTIGACION, `«${f.id}» tiene fecha futura`).toBe(true)
    }
  })

  it('no repite ids ni URLs', () => {
    expect(new Set(FUENTES.map(f => f.id)).size).toBe(FUENTES.length)
    expect(new Set(FUENTES.map(f => f.url)).size).toBe(FUENTES.length)
  })

  it('«vía prensa» es parte del título de una fuente oficial, no una etiqueta', () => {
    const prensa = FUENTES.filter(f => /vía prensa/.test(f.titulo))
    expect(prensa.length).toBeGreaterThan(0)
    for (const f of prensa) expect(f.etiqueta).toBe('OFICIAL')
  })
})
