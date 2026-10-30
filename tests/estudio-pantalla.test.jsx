// @vitest-environment jsdom
// La pantalla del estudio de contenido (EstudioContenido.jsx), dentro del
// Informe. El servidor lo monta otro agente: aquí se simula la API y se
// comprueba la pantalla en sus estados —con estudio, sin estudio, en curso,
// error, sin Instagram, con fallos 402/429/409/400—, el sondeo (con
// temporizadores falsos), el historial (envuelto y suelto), los decimales, el
// «gratis» y que el resumen rápido de Metricas solo se esconde con un estudio
// 'listo'.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'

// Recharts no mide nada en jsdom (no hay ResizeObserver): lo sustituimos por
// stubs para poder montar Metricas con publicaciones sin que reviente.
vi.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>
  return {
    ResponsiveContainer: Stub, BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub,
    CartesianGrid: Stub, Tooltip: Stub, ReferenceLine: Stub, Cell: Stub,
  }
})

const de = vi.fn()
const ahora = vi.fn()
const ver = vi.fn()
const informe = vi.fn()
const sync = vi.fn()
vi.mock('../src/helm/lib', () => ({
  estudioContenidoApi: {
    de: (...a) => de(...a),
    ahora: (...a) => ahora(...a),
    ver: (...a) => ver(...a),
  },
  instagramApi: {
    informe: (...a) => informe(...a),
    sync: (...a) => sync(...a),
  },
  supabase: {},
}))
const { default: EstudioContenido } = await import('../src/helm/views/EstudioContenido.jsx')
const { default: Metricas } = await import('../src/helm/views/Metricas.jsx')

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  de.mockReset(); ahora.mockReset(); ver.mockReset(); informe.mockReset(); sync.mockReset()
})

// Un error de apiFetch tal y como llega ahora: con el código de estado (y, si lo
// manda el servidor, el `codigo`) encima del Error.
function apiError(status, codigo, mensaje = `Error ${status}`) {
  const e = new Error(mensaje)
  e.status = status
  if (codigo) e.codigo = codigo
  return e
}

// La base de conocimiento del algoritmo que la API devuelve para enseñar.
const ALGORITMO = [
  { titulo: 'El tiempo de visionado manda', texto: 'Las tres señales que más pesan son tiempo de visionado, likes y envíos.', fuente: 'https://transparency.meta.com/features/explaining-ranking/ig-reels-chaining/', etiqueta: 'OFICIAL' },
  { titulo: 'Los compartidos llegan a quien no te sigue', texto: 'Los envíos pesan algo más en el contenido de cuentas que no sigues.', fuente: 'Metricool 2026', etiqueta: 'DATOS' },
  { titulo: 'Publica cuando puedas sostenerlo', texto: 'Mejor repartir las piezas que soltarlas seguidas.', fuente: 'Criterio HELM', etiqueta: 'HEURÍSTICA' },
]

// Un estudio completo y «listo», con las nueve secciones de la pantalla.
const CON_ESTUDIO = {
  estudio: {
    id: 'e1', generado_en: '2026-10-25T09:00:00Z', estado: 'listo', modelo: 'claude-opus-5',
    datos: {
      cuenta: { usuario: 'silvesttre.ai', seguidores: 1551, piezas: 97, piezas_recientes: 2, desde: '2026-01-01', hasta: '2026-10-20' },
      etapa: { hito_anterior: 1000, siguiente_hito: 10000, progreso: 0.061, ritmo_dia: 4.2, dias_historial: 120, fecha_estimada: '2027-03-01', ritmo_necesario_90d: 94 },
      medianas: { visitas: 1275, alcance: 1400, retencion_s: 7.8, guardados_por_mil: 10.2, compartidos_por_mil: 3.1, interacciones_por_mil: 40, likes_por_mil: 25 },
      percentiles: { visitas: { p25: 500, p50: 1275, p75: 2600, p90: 8000 } },
      frecuencia: { por_semana_4s: 5, por_semana_12s: 4 },
      tercios: null,
      alcance_vs_seguidores: 0.82,
      desde_anterior: { generado_en: '2026-10-18T09:00:00Z', objetivos: [{ nombre: 'Subir guardados', metrica: 'guardados_por_mil', antes: 8, ahora: 10.2, objetivo: 10, estado: 'cumplido', cumplido: true, avance: 1, vence: '2026-10-25' }] },
      avisos: ['Pocos datos de horas de publicación.'],
    },
    estudio: {
      resumen: 'La cuenta retiene bien y genera guardados por encima de su tamaño.',
      etapa: { nombre: 'De 1.000 a 10.000', que_cambia: 'Ahora toca consistencia y temas que se compartan.' },
      objetivos: [{ nombre: 'Mediana de visitas', metrica: 'visitas', actual: 1275, objetivo: 2000, plazo_dias: 30, por_que: 'Subir el suelo de cada pieza.' }],
      diagnostico: {
        funciona: [{ hallazgo: 'La retención es alta', evidencia: '7,8 s de mediana', por_que: 'Buenos ganchos' }],
        no_funciona: [{ hallazgo: 'Pocos compartidos', evidencia: '3,1 por mil', por_que: 'Falta ángulo identitario' }],
      },
      plan: [
        { semana: 1, foco: 'Ganchos más fuertes', acciones: ['Grabar 4 reels'], piezas: [{ tema: 'Errores comunes', angulo: 'lista', formato: 'REELS', gancho: 'El error que te cuesta seguidores' }] },
        { semana: 2, foco: 'Piezas compartibles', acciones: ['Probar formatos'], piezas: [] },
      ],
      experimentos: [{ hipotesis: 'Los ganchos con número se comparten más', variable: 'gancho', como: '5 con número vs 5 sin', metrica: 'compartidos_por_mil', criterio_exito: '+30 %', duracion: '2 semanas' }],
      avatar_contenido: {
        a_quien_hablar: 'Creadores que empiezan en IA', nivel_consciencia: 'consciente del problema',
        dolores: ['No crecen'], deseos: ['Vivir de esto'], objeciones: ['No tengo tiempo'],
        temas_que_enganchan: ['Casos reales'], temas_que_no: ['Teoría densa'], vocabulario: ['reel', 'alcance'],
        a_quien_no: 'Expertos avanzados', diferencia_con_ventas: 'Aquí le hablas a quien aún no te compra.',
      },
      aprendido: [
        { regla: 'Los miércoles rinden más', evidencia: '1.800 vs 1.275', estado: 'confirmada' },
        { regla: 'Los carruseles no funcionan', evidencia: 'muestra corta', estado: 'en_prueba' },
      ],
      metricas_a_vigilar: [{ metrica: 'Compartidos por mil', por_que: 'Es la palanca a no seguidores', umbral: 'por debajo de 3', etiqueta: 'OFICIAL' }],
      avisos: ['El buen viernes de la cuenta va en contra de Buffer.'],
    },
  },
  historial: [
    { id: 'e1', generado_en: '2026-10-25T09:00:00Z', estado: 'listo' },
    { id: 'e0', generado_en: '2026-10-18T09:00:00Z', estado: 'listo' },
  ],
  en_curso: false,
  coste_aprox_eur: 0.14,
  conectado: true,
  algoritmo: ALGORITMO,
  ultimo_error: null,
}

const SIN_ESTUDIO = { estudio: null, historial: [], en_curso: false, coste_aprox_eur: 0.14, conectado: true, algoritmo: ALGORITMO, ultimo_error: null }

describe('EstudioContenido · la pantalla del estudio', () => {
  it('con estudio: pinta las nueve secciones, avisa de que ya hay uno y nota que las tasas son por 1.000 visitas', async () => {
    de.mockResolvedValueOnce(CON_ESTUDIO)
    const onHayEstudio = vi.fn()
    render(<EstudioContenido clientId="demo" onHayEstudio={onHayEstudio} />)

    await screen.findByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')
    expect(de).toHaveBeenCalledWith('demo')
    expect(onHayEstudio).toHaveBeenCalledWith(true)
    // 1) Etapa  2) Objetivos  3) Diagnóstico  4) Plan  5) Experimentos
    expect(screen.getByText('De 1.000 a 10.000')).toBeTruthy()
    expect(screen.getByText('1.551')).toBeTruthy()            // seguidores en la barra de progreso
    expect(screen.getByText('La retención es alta')).toBeTruthy()
    expect(screen.getByText('Pocos compartidos')).toBeTruthy()
    expect(screen.getByText('Ganchos más fuertes')).toBeTruthy()
    expect(screen.getByText('Los ganchos con número se comparten más')).toBeTruthy()
    // 6) Avatar de contenido (distinto del de ventas)  7) Aprendido  8) Vigilar
    expect(screen.getByText('Creadores que empiezan en IA')).toBeTruthy()
    expect(screen.getByText('Los miércoles rinden más')).toBeTruthy()
    expect(screen.getByText('Confirmada')).toBeTruthy()
    expect(screen.getByText('por debajo de 3')).toBeTruthy()   // umbral de la métrica a vigilar
    // El repaso del estudio anterior, con su estado
    expect(screen.getByText(/Desde el estudio del/)).toBeTruthy()
    expect(screen.getByText('Cumplido')).toBeTruthy()
    // La nota del contrato B
    expect(screen.getByText(/por cada 1\.000 visitas/)).toBeTruthy()
    // El botón invita a actualizar, no a generar de cero
    expect(screen.getByRole('button', { name: /Actualizar estudio/ })).toBeTruthy()
  })

  it('con estudio: el acordeón del plan abre la primera semana y la segunda al pulsar', async () => {
    de.mockResolvedValueOnce(CON_ESTUDIO)
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Ganchos más fuertes')
    // La semana 1 nace abierta: se ven sus piezas.
    expect(screen.getByText('Errores comunes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Piezas compartibles/ }))
    expect(screen.getByText('Probar formatos')).toBeTruthy()
  })

  it('decimales y unidades: retención en s con 1 decimal, por mil con «por mil», y estado del objetivo anterior', async () => {
    const CON_DECIMALES = {
      ...CON_ESTUDIO,
      estudio: {
        ...CON_ESTUDIO.estudio,
        estudio: {
          ...CON_ESTUDIO.estudio.estudio,
          objetivos: [{ nombre: 'Retención', metrica: 'retencion_s', actual: 7.8, objetivo: 8.6, plazo_dias: 30, por_que: 'Mejores ganchos.' }],
        },
        datos: {
          ...CON_ESTUDIO.estudio.datos,
          desde_anterior: {
            generado_en: '2026-10-18T09:00:00Z',
            objetivos: [
              { nombre: 'Subir guardados', metrica: 'guardados_por_mil', antes: 8, ahora: 10.2, objetivo: 10, estado: 'cumplido', cumplido: true, avance: 1, vence: '2026-10-25' },
              { nombre: 'Más visitas', metrica: 'visitas', antes: 1000, ahora: 1500, objetivo: 2000, estado: 'en_curso', cumplido: null, avance: 0.5, vence: '2026-11-15' },
            ],
          },
        },
      },
    }
    de.mockResolvedValueOnce(CON_DECIMALES)
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')
    // El objetivo de retención con su decimal y su unidad (no «8 → 9»).
    expect(screen.getByText('8,6 s')).toBeTruthy()
    expect(screen.getByText('retención')).toBeTruthy()         // la métrica como subtítulo
    // El repaso anterior: tasas por mil con unidad, estados y fecha de vencimiento.
    expect(screen.getByText(/10,2 por mil/)).toBeTruthy()
    expect(screen.getByText('Cumplido')).toBeTruthy()
    expect(screen.getByText('En curso')).toBeTruthy()
    expect(screen.getByText(/vence el 15 nov/)).toBeTruthy()
  })

  it('con las cifras de hoy (al_dia): seguidores, ritmo y cómo van los objetivos de este estudio, sin tocar el análisis', async () => {
    const AL_DIA = {
      ...CON_ESTUDIO,
      al_dia: {
        calculado_en: '2026-10-30T10:00:00Z',
        cuenta: { seguidores: 1984 },
        etapa: { hito_anterior: 1000, siguiente_hito: 10000, progreso: 0.109, ritmo_dia: 98.7, dias_historial: 4, fecha_estimada: '2027-01-20', ritmo_necesario_90d: 89.1 },
        objetivos: [{ nombre: 'Mediana de visitas', metrica: 'visitas', antes: 1275, ahora: 1650, objetivo: 2000, estado: 'en_curso', cumplido: null, avance: 0.52, vence: '2026-11-24T09:00:00.000Z', quedan_dias: 25 }],
      },
    }
    de.mockResolvedValueOnce(AL_DIA)
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')
    expect(screen.getByText('1.984')).toBeTruthy()                       // los seguidores de hoy, no los 1.551 del estudio
    expect(screen.getByText('98,7 seguidores/día')).toBeTruthy()
    expect(screen.getByText(/Seguidores y ritmo de hoy/)).toBeTruthy()
    expect(screen.getByText(/Cómo van hoy/)).toBeTruthy()              // en lugar del repaso congelado del anterior
    expect(screen.queryByText('Subir guardados')).toBeNull()
    expect(screen.getByText(/quedan 25 días/, { selector: '.ec-anterior-vence' })).toBeTruthy()
    expect(screen.getByText('1.650', { selector: '.ec-obj-hoy b' })).toBeTruthy()
  })

  it('etapa sin crecimiento (ritmo 0): lo dice claro y no finge «sin histórico»', async () => {
    const CON_NOCRECE = {
      ...CON_ESTUDIO,
      estudio: {
        ...CON_ESTUDIO.estudio,
        datos: {
          ...CON_ESTUDIO.estudio.datos,
          etapa: { hito_anterior: 1000, siguiente_hito: 10000, progreso: 0.061, ritmo_dia: 0, dias_historial: 120, fecha_estimada: null, ritmo_necesario_90d: 94 },
        },
      },
    }
    de.mockResolvedValueOnce(CON_NOCRECE)
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')
    expect(screen.getByText('La cuenta no está creciendo')).toBeTruthy()
    expect(screen.getByText('94 al día')).toBeTruthy()          // la caja de «Para 90 días» sigue
    expect(screen.queryByText('Sin histórico aún')).toBeNull()
  })

  it('sin estudio: explica qué hará, ofrece el botón y el coste junto a él', async () => {
    de.mockResolvedValueOnce(SIN_ESTUDIO)
    const onHayEstudio = vi.fn()
    render(<EstudioContenido clientId="demo" onHayEstudio={onHayEstudio} />)
    await screen.findByText('Convierte tus cifras en un plan')
    expect(onHayEstudio).toHaveBeenCalledWith(false)
    expect(screen.getAllByRole('button', { name: /Generar estudio/ }).length).toBeGreaterThan(0)
    // El coste, junto al botón y en créditos (lo que la agencia ve en su saldo: 1 € = 100).
    expect(screen.getByText('Cuesta unos 14 créditos')).toBeTruthy()
    expect(screen.queryByText(/€/)).toBeNull()
    // No se pinta ninguna sección del estudio todavía.
    expect(screen.queryByText('Diagnóstico')).toBeNull()
  })

  it('gratis en la agencia: coste 0 no sale como «0,00 €»', async () => {
    de.mockResolvedValueOnce({ ...SIN_ESTUDIO, coste_aprox_eur: 0 })
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Convierte tus cifras en un plan')
    expect(screen.getByText('Gratis en tu agencia')).toBeTruthy()
    expect(screen.queryByText(/0,00 €|0 créditos/)).toBeNull()
  })

  it('estudio en error: no pinta secciones, da un texto genérico (sin el error interno) y ofrece reintentar', async () => {
    const CON_ERROR = {
      estudio: { id: 'e1', generado_en: '2026-10-25T09:00:00Z', estado: 'error', datos: null, estudio: null, modelo: null },
      historial: [{ id: 'e1', generado_en: '2026-10-25T09:00:00Z', estado: 'error' }],
      en_curso: false, coste_aprox_eur: 0.14, conectado: true, algoritmo: ALGORITMO,
      ultimo_error: { generado_en: '2026-10-25T09:00:00Z', mensaje: 'No pudimos terminar el estudio. No se te ha cobrado; inténtalo de nuevo.' },
    }
    de.mockResolvedValueOnce(CON_ERROR)
    const onHayEstudio = vi.fn()
    render(<EstudioContenido clientId="demo" onHayEstudio={onHayEstudio} />)
    await screen.findByText(/No pudimos terminar el estudio/)
    // Un estudio en error no cuenta como estudio.
    expect(onHayEstudio).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Creadores que empiezan en IA')).toBeNull()
    expect(screen.queryByText('La retención es alta')).toBeNull()
    // Botón para reintentar, y nunca el saldo de la clave de HELM.
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy()
    expect(screen.queryByText(/credit balance/i)).toBeNull()
  })

  it('en curso: el botón queda bloqueado como «Estudiando…»', async () => {
    de.mockResolvedValueOnce({ ...SIN_ESTUDIO, en_curso: true })
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Estudiando tu cuenta a fondo…')
    const btn = screen.getByRole('button', { name: /Estudiando…/ })
    expect(btn.disabled).toBe(true)
  })

  it('en curso: sondea cada 10 s, se recupera de un fallo del sondeo y para al terminar', async () => {
    vi.useFakeTimers()
    try {
      de.mockResolvedValueOnce({ ...SIN_ESTUDIO, en_curso: true })   // 1ª carga: en curso
        .mockRejectedValueOnce(apiError(503, null, 'Error 503'))     // 1er sondeo: falla
        .mockResolvedValueOnce({ ...SIN_ESTUDIO, en_curso: true })   // 2º sondeo: sigue
        .mockResolvedValueOnce(CON_ESTUDIO)                          // 3er sondeo: listo
      render(<EstudioContenido clientId="demo" />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(de).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })  // falla y reprograma
      expect(de).toHaveBeenCalledTimes(2)
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })  // sigue en curso
      expect(de).toHaveBeenCalledTimes(3)
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })  // listo: deja de sondear
      expect(de).toHaveBeenCalledTimes(4)
      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
      expect(de).toHaveBeenCalledTimes(4)   // ya no hay más llamadas
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin Instagram: no pinta nada (el panel de contacto lo pone Metricas)', async () => {
    de.mockResolvedValueOnce({ conectado: false, estudio: null, historial: [], en_curso: false })
    const { container } = render(<EstudioContenido clientId="demo" />)
    await vi.waitFor(() => expect(de).toHaveBeenCalled())
    expect(container.querySelector('.ec')).toBeNull()
    expect(screen.queryByRole('button', { name: /estudio/i })).toBeNull()
  })

  it('fallo 402: avisa de que no hay saldo para recargar', async () => {
    de.mockResolvedValueOnce(SIN_ESTUDIO)
    ahora.mockRejectedValueOnce(apiError(402, 'sin_saldo'))
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Convierte tus cifras en un plan')
    fireEvent.click(screen.getAllByRole('button', { name: /Generar estudio/ })[0])
    expect(await screen.findByText(/Sin saldo: recarga créditos/)).toBeTruthy()
  })

  it('fallo 429: avisa del tope de tres estudios al día', async () => {
    de.mockResolvedValueOnce(SIN_ESTUDIO)
    ahora.mockRejectedValueOnce(apiError(429, 'tope_diario'))
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Convierte tus cifras en un plan')
    fireEvent.click(screen.getAllByRole('button', { name: /Generar estudio/ })[0])
    expect(await screen.findByText(/Ya has pedido 3 estudios hoy/)).toBeTruthy()
  })

  it('409 al generar: pasa a «Estudiando…» y se engancha al que ya está en curso (sondea), sin avisar de error', async () => {
    vi.useFakeTimers()
    try {
      de.mockResolvedValueOnce(SIN_ESTUDIO).mockResolvedValue({ ...SIN_ESTUDIO, en_curso: true })
      ahora.mockRejectedValueOnce(apiError(409, 'en_curso'))
      render(<EstudioContenido clientId="demo" />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      fireEvent.click(screen.getAllByRole('button', { name: /Generar estudio/ })[0])
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.getByText('Estudiando tu cuenta a fondo…')).toBeTruthy()
      expect(screen.queryByText(/Ya hay un estudio en marcha/)).toBeNull()
      expect(de).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
      expect(de).toHaveBeenCalledTimes(2)   // se ha enganchado: sondea el que ya estaba en curso
    } finally {
      vi.useRealTimers()
    }
  })

  it('fallo 400: pide conectar Instagram', async () => {
    de.mockResolvedValueOnce(SIN_ESTUDIO)
    ahora.mockRejectedValueOnce(apiError(400, 'sin_instagram'))
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Convierte tus cifras en un plan')
    fireEvent.click(screen.getAllByRole('button', { name: /Generar estudio/ })[0])
    expect(await screen.findByText(/Conecta tu Instagram/)).toBeTruthy()
  })

  it('desplegable del algoritmo: se abre y enseña cada punto con su fuente y etiqueta', async () => {
    de.mockResolvedValueOnce(SIN_ESTUDIO)
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('Convierte tus cifras en un plan')
    // Cerrado de inicio: el texto de los puntos no se ve.
    expect(screen.queryByText(/Las tres señales que más pesan/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Cómo funciona el algoritmo/ }))
    expect(screen.getByText('El tiempo de visionado manda')).toBeTruthy()
    // La fuente web sale como enlace que abre en otra pestaña.
    const fuente = screen.getAllByRole('link', { name: /Fuente/ })[0]
    expect(fuente.getAttribute('href')).toContain('transparency.meta.com')
    expect(fuente.getAttribute('target')).toBe('_blank')
    expect(fuente.getAttribute('rel')).toContain('noopener')
    // La etiqueta OFICIAL es un botón que despliega su explicación (móvil/teclado).
    const oficial = screen.getAllByText('OFICIAL').find(el => el.classList.contains('ec-etq'))
    expect(oficial.tagName).toBe('BUTTON')
    expect(oficial.getAttribute('title')).toMatch(/Instagram o Meta/)
    fireEvent.click(oficial)
    expect(screen.getByRole('note')).toHaveProperty('textContent', expect.stringMatching(/Instagram o Meta/))
  })

  it('historial envuelto: elegir un estudio anterior lo pide por la API ({ estudio: fila })', async () => {
    de.mockResolvedValueOnce(CON_ESTUDIO)
    ver.mockResolvedValueOnce({ estudio: { ...CON_ESTUDIO.estudio, id: 'e0', estudio: { ...CON_ESTUDIO.estudio.estudio, resumen: 'Un estudio más viejo.' } } })
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')
    const selector = screen.getByLabelText('Elegir un estudio del historial')
    fireEvent.change(selector, { target: { value: 'e0' } })
    expect(ver).toHaveBeenCalledWith('demo', 'e0')
    expect(await screen.findByText('Un estudio más viejo.')).toBeTruthy()
    // Al ver uno antiguo, la cabecera lo dice.
    expect(screen.getByText(/Estudio del/)).toBeTruthy()
  })

  it('historial: un estudio fallido no afirma nada del cobro, y si es el último fallo no se repite el aviso', async () => {
    const FALLO = { id: 'e2', generado_en: '2026-10-26T09:00:00Z', estado: 'error', datos: null, estudio: null, modelo: 'claude-sonnet-5' }
    const VIEJO = { id: 'ex', generado_en: '2026-10-10T09:00:00Z', estado: 'error', datos: null, estudio: null, modelo: 'claude-sonnet-5' }
    de.mockResolvedValueOnce({
      ...CON_ESTUDIO,
      historial: [{ id: 'e2', generado_en: FALLO.generado_en, estado: 'error' }, ...CON_ESTUDIO.historial, { id: 'ex', generado_en: VIEJO.generado_en, estado: 'error' }],
      ultimo_error: { generado_en: FALLO.generado_en, mensaje: 'La IA no ha devuelto un estudio que se pueda usar. Se ha cobrado lo que llegó a usar la IA (0,05 €).' },
    })
    ver.mockResolvedValueOnce({ estudio: FALLO }).mockResolvedValueOnce({ estudio: VIEJO })
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText(/Se ha cobrado lo que llegó a usar la IA/)
    const selector = screen.getByLabelText('Elegir un estudio del historial')
    // El último fallo: ya lo cuenta ultimo_error (con lo cobrado). Un solo aviso.
    fireEvent.change(selector, { target: { value: 'e2' } })
    await waitFor(() => expect(ver).toHaveBeenCalledWith('demo', 'e2'))
    await waitFor(() => expect(screen.queryByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')).toBeNull())
    expect(screen.getAllByText(/Se ha cobrado lo que llegó a usar la IA/)).toHaveLength(1)
    expect(screen.queryByText(/No se pudo terminar el estudio del/)).toBeNull()
    expect(screen.queryByText(/No se te ha cobrado/)).toBeNull()
    // Uno fallido más viejo: texto neutro, sin decir que no se cobró.
    fireEvent.change(selector, { target: { value: 'ex' } })
    expect(await screen.findByText(/No se pudo terminar el estudio del .*solo se cobró lo que usó/)).toBeTruthy()
    expect(screen.queryByText(/No se te ha cobrado/)).toBeNull()
  })

  it('historial: si eliges el que está «(en curso)», al terminar se ve ese estudio y el botón vuelve', async () => {
    vi.useFakeTimers()
    try {
      const EN_CURSO = { id: 'e2', generado_en: '2026-10-27T09:00:00Z', estado: 'en_curso', datos: null, estudio: null, modelo: 'claude-sonnet-5' }
      const LISTO = { ...CON_ESTUDIO.estudio, id: 'e2', generado_en: '2026-10-27T09:04:00Z', estudio: { ...CON_ESTUDIO.estudio.estudio, resumen: 'El estudio recién terminado.' } }
      de.mockResolvedValueOnce({ ...CON_ESTUDIO, en_curso: true, historial: [{ id: 'e2', generado_en: EN_CURSO.generado_en, estado: 'en_curso' }, ...CON_ESTUDIO.historial] })
        .mockResolvedValueOnce({ ...CON_ESTUDIO, estudio: LISTO, en_curso: false, historial: [{ id: 'e2', generado_en: LISTO.generado_en, estado: 'listo' }, ...CON_ESTUDIO.historial] })
      ver.mockResolvedValueOnce({ estudio: EN_CURSO })
      render(<EstudioContenido clientId="demo" />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      fireEvent.change(screen.getByLabelText('Elegir un estudio del historial'), { target: { value: 'e2' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(ver).toHaveBeenCalledWith('demo', 'e2')
      expect(screen.getByRole('button', { name: /Estudiando…/ }).disabled).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })   // el sondeo lo trae listo
      expect(de).toHaveBeenCalledTimes(2)
      expect(screen.getByText('El estudio recién terminado.')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Actualizar estudio/ }).disabled).toBe(false)
      expect(screen.queryByText('Estudiando tu cuenta a fondo…')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('historial suelto: tolera que `ver` devuelva la fila sin envolver', async () => {
    de.mockResolvedValueOnce(CON_ESTUDIO)
    ver.mockResolvedValueOnce({ ...CON_ESTUDIO.estudio, id: 'e0', estudio: { ...CON_ESTUDIO.estudio.estudio, resumen: 'Suelto y viejo.' } })
    render(<EstudioContenido clientId="demo" />)
    await screen.findByText('La cuenta retiene bien y genera guardados por encima de su tamaño.')
    fireEvent.change(screen.getByLabelText('Elegir un estudio del historial'), { target: { value: 'e0' } })
    expect(ver).toHaveBeenCalledWith('demo', 'e0')
    expect(await screen.findByText('Suelto y viejo.')).toBeTruthy()
  })
})

// ── Integración con Metricas ──────────────────────────────────────────────
// El resumen rápido («Qué dicen los números» / «Para la próxima semana») solo
// debe esconderse cuando hay un estudio LISTO, no con uno en error.
const DATOS_IG = {
  conectado: true,
  cuenta: { usuario: 'silvesttre.ai', seguidores: 1551, sincronizado: '2026-10-20' },
  resumen: { publicaciones: 2, desde: '2026-10-01', hasta: '2026-10-20', visitas_totales: 3000, mediana_visitas: 1275, mediana_retencion_s: 7.8, mediana_guardados_por_mil: 10.2 },
  estudio: {
    conclusiones: ['Los reels largos retienen mejor.'],
    proxima_semana: ['Graba cuatro reels con gancho de número.'],
    por_dia_semana: [
      { dia: 'lunes', mediana_visitas: 1000, publicaciones: 1 },
      { dia: 'martes', mediana_visitas: 1100, publicaciones: 1 },
      { dia: 'miércoles', mediana_visitas: 1800, publicaciones: 2 },
      { dia: 'jueves', mediana_visitas: 900, publicaciones: 1 },
      { dia: 'viernes', mediana_visitas: 1500, publicaciones: 1 },
      { dia: 'sábado', mediana_visitas: 700, publicaciones: 0 },
      { dia: 'domingo', mediana_visitas: 800, publicaciones: 1 },
    ],
  },
  publicaciones: [
    { url: 'https://instagram.com/p/a', titulo: 'Pieza A', visitas: 2000, fecha: '2026-10-18', formato: 'REELS', retencion_media_s: 8.1, guardados_por_mil: 11, compartidos_por_mil: 3.4, interacciones_por_mil: 42 },
    { url: 'https://instagram.com/p/b', titulo: 'Pieza B', visitas: 1000, fecha: '2026-10-10', formato: 'REELS', retencion_media_s: 6.9, guardados_por_mil: 9, compartidos_por_mil: 2.8, interacciones_por_mil: 36 },
  ],
}

describe('Metricas + EstudioContenido · el resumen rápido', () => {
  it('con un estudio LISTO, el resumen rápido se esconde', async () => {
    informe.mockResolvedValue(DATOS_IG)
    de.mockResolvedValue(CON_ESTUDIO)
    render(<Metricas clientId="demo" onNavigate={() => {}} />)
    // Aparece primero (hasta que el estudio avisa de que ya hay uno listo)…
    await screen.findByText('Las publicaciones')
    // …y luego desaparece.
    await waitFor(() => expect(screen.queryByText('Qué dicen los números')).toBeNull())
  })

  it('con un estudio en ERROR, el resumen rápido se queda', async () => {
    informe.mockResolvedValue(DATOS_IG)
    de.mockResolvedValue({
      estudio: { id: 'e1', generado_en: '2026-10-25T09:00:00Z', estado: 'error', datos: null, estudio: null, modelo: null },
      historial: [], en_curso: false, coste_aprox_eur: 0.14, conectado: true, algoritmo: ALGORITMO,
      ultimo_error: { generado_en: '2026-10-25T09:00:00Z', mensaje: 'No pudimos terminar el estudio.' },
    })
    render(<Metricas clientId="demo" onNavigate={() => {}} />)
    // Esperamos a que el estudio resuelva su carga (sale el aviso de error)…
    await screen.findByText(/No pudimos terminar el estudio/)
    // …y el resumen rápido sigue ahí.
    expect(screen.getByText('Qué dicen los números')).toBeTruthy()
  })
})
