// @vitest-environment jsdom
// El Editor de reels en pantalla (src/agents/EditorReel.jsx), pulsando de
// verdad con la API simulada:
//   · la galería: los 30 estilos, el filtro por idioma y tema, «Crear» abre el
//     taller con ese estilo y «Copiar prompt» copia el suyo;
//   · el precio antes de subir («Esto cuesta… · te quedan…» o «Gratis en tu
//     agencia») y un vídeo de más de 10 minutos que no entra;
//   · el flujo entero: crear → el vídeo por trozos (con subePorTrozos de
//     verdad, trozos de 1 KB) → los recursos → lanzar, también cuando se corta
//     o se cancela y se sigue, y cuando no hay saldo (402);
//   · cuando «lanzar» falla: 422/410 solo dejan descartar o cerrar, un 409 con
//     `recibidos` vuelve a «Seguir subiendo», y un recurso que llegó aunque se
//     canceló no sale repetido en el vídeo;
//   · la lista: cada estado en castellano con su barra, lo cobrado, una subida
//     a medias que se sigue eligiendo el mismo archivo, una entera que se lanza
//     sin él, y que no se sondea por subidas a medias;
//   · los 30 estilos son parámetros válidos para el motor.
// Y que ya no aparece «En construcción» por ningún lado.
//
// Usa jsdom y @testing-library/react, que vienen del node_modules compartido
// con ~/code/HELM.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  ediciones: [],
  estilo: null,
  guardados: [],
  llamadas: [],
  precios: null,
  duracion: 95,
  recibidos: 0,
  nRecursos: 0,
  errorCrear: null,
  errorLanzar: null,
  respuestaLanzar: null,
  errorLista: null,
  manda: null,
}))

vi.mock('../src/helm/lib', () => ({
  editorApi: {
    lista: vi.fn(async () => {
      if (h.errorLista) { const e = h.errorLista; h.errorLista = null; throw e }
      return { ediciones: h.ediciones.map(e => ({ ...e })) }
    }),
    estado: vi.fn(async (_c, id) => ({ edicion: { ...h.ediciones.find(e => e.id === id), plan: { resumen: { tomas: 1, muletillas: 2, silencios: 3, duracionOriginal: 60, duracionFinal: 41, sinVoz: false }, cortes: 5, bloques: 20, zooms: 4, quitado: [{ a: 1, b: 3, texto: 'Esta IA hace que tu negocio venda más.', motivo: 'toma' }] } } })),
    descarga: vi.fn(async () => new Blob(['x'])),
    borrar: vi.fn(async (_c, id) => { h.llamadas.push(['borrar', id]); h.ediciones = h.ediciones.filter(e => e.id !== id); return { ok: true } }),
    estilos: vi.fn(async () => ({ estilos: [{ id: 'g', nombre: 'Estilo HELM', params: h.estilo, global: true }], porDefecto: { id: 'g', nombre: 'Estilo HELM', params: h.estilo, global: true } })),
    guardarEstilo: vi.fn(async (_c, params) => { h.guardados.push(params); return { porDefecto: { id: 'p', nombre: 'Estilo del perfil', params, global: false } } }),
    crear: vi.fn(async (_c, datos) => {
      h.llamadas.push(['crear', datos])
      if (h.errorCrear) throw h.errorCrear
      h.ediciones.unshift({ id: 'e1', nombre_original: datos.nombre, estado: 'subiendo', progreso: 0, paso: null, duracion_original: null, duracion_final: null, created_at: new Date().toISOString(), error: null, estilo_ref: datos.estilo_ref || null, recursos: [], precio_eur: 1.5, cobrado_eur: null })
      return { edicion: { id: 'e1', estado: 'subiendo', precio_eur: 1.5 } }
    }),
    urlTrozo: (c, id) => `/api/editor?action=trozo&clientId=${c}&id=${id}`,
    recibidos: vi.fn(async (_c, id) => { h.llamadas.push(['recibidos', id]); return { recibidos: h.recibidos } }),
    urlRecurso: (c, id, tipo, nombre) => `/api/editor?action=recurso&clientId=${c}&id=${id}&tipo=${tipo}&nombre=${encodeURIComponent(nombre)}`,
    quitarRecurso: vi.fn(async (_c, id, recurso) => {
      h.llamadas.push(['quitar', id, recurso])
      h.ediciones = h.ediciones.map(e => (e.id === id ? { ...e, recursos: (e.recursos || []).filter(r => r.id !== recurso) } : e))
      return { ok: true }
    }),
    lanzar: vi.fn(async (_c, id, recursos) => {
      h.llamadas.push(['lanzar', id, recursos])
      if (h.errorLanzar) { const e = h.errorLanzar; h.errorLanzar = null; throw e }
      if (h.respuestaLanzar) { const r = h.respuestaLanzar; h.respuestaLanzar = null; return r }
      h.ediciones = h.ediciones.map(e => (e.id === id ? { ...e, estado: 'en_cola', paso: 'En cola', progreso: 0 } : e))
      return { edicion: { id, estado: 'en_cola', precio_eur: 1.5 } }
    }),
  },
  creditosApi: { precios: vi.fn(async () => h.precios) },
}))

vi.mock('../src/agents/editor/duracion', () => ({ leeDuracion: vi.fn(async () => h.duracion) }))

// La subida por trozos es la de verdad (src/helm/subida.js), con trozos de
// 1 KB, esperas de milisegundos y la red simulada en h.manda.
vi.mock('../src/helm/subida', async (original) => {
  const real = await original()
  const manda = (o) => h.manda(o)
  return { ...real, mandaTrozo: manda, subePorTrozos: (o) => real.subePorTrozos({ ...o, trozo: 1024, pausa: 1, manda }) }
})

const { default: EditorReel } = await import('../src/agents/EditorReel.jsx')
const { ESTILO_POR_DEFECTO, normalizaEstilo } = await import('../src/agents/editor/estilo.js')
const { ESTILOS_REFERENCIA, TEMAS, IDIOMAS, estiloDeReferencia } = await import('../src/agents/editor/estilos-referencia.js')
const { PRECIOS_FIJOS } = await import('../src/helm/precios.js')
const { AGENTES } = await import('../src/agents/agentes.js')

const accion = (url) => new URL(url, 'http://helm.test').searchParams
function mandaPorDefecto({ url, cuerpo, alAvanzar }) {
  const q = accion(url)
  if (q.get('action') === 'trozo') {
    const offset = Number(q.get('offset'))
    h.llamadas.push(['trozo', offset, cuerpo.size])
    alAvanzar?.(cuerpo.size)
    return Promise.resolve({ recibidos: offset + cuerpo.size })
  }
  if (q.get('action') === 'recurso') return Promise.resolve({ recurso: guardaRecurso(q, cuerpo) })
  return Promise.reject(new Error(`url inesperada: ${url}`))
}
// El servidor apunta el recurso en la fila (lo que luego devuelve `estado`).
function guardaRecurso(q, cuerpo) {
  h.nRecursos += 1
  h.llamadas.push(['recurso', q.get('tipo'), q.get('nombre')])
  const recurso = { id: `r${h.nRecursos}`, tipo: q.get('tipo'), nombre: q.get('nombre'), bytes: cuerpo.size }
  h.ediciones = h.ediciones.map(e => (e.id === q.get('id') ? { ...e, recursos: [...(e.recursos || []), recurso] } : e))
  return recurso
}

const ahora = () => new Date().toISOString()
beforeEach(() => {
  h.estilo = { ...ESTILO_POR_DEFECTO }
  h.guardados = []
  h.llamadas = []
  h.precios = { paga: true, saldo: 10, precios: PRECIOS_FIJOS }
  h.duracion = 95
  h.recibidos = 0
  h.nRecursos = 0
  h.errorCrear = null
  h.errorLanzar = null
  h.respuestaLanzar = null
  h.errorLista = null
  h.manda = mandaPorDefecto
  // Quien administra: el botón de recarga dice «Recargar créditos».
  localStorage.setItem('bw_superadmin', '1')
  h.ediciones = [
    { id: 'a', nombre_original: 'lista.mp4', estado: 'listo', progreso: 100, paso: 'Listo para descargar', duracion_original: 60, duracion_final: 41, created_at: ahora(), error: null, estilo_ref: 'hormozi', recursos: [{ id: 'x1', tipo: 'broll' }, { id: 'x2', tipo: 'musica' }], precio_eur: 1.5, cobrado_eur: 1.5 },
    { id: 'b', nombre_original: 'montando.mov', estado: 'montando', progreso: 63, paso: 'Montando el vídeo (1:00 → 0:41)', duracion_original: 200, duracion_final: null, created_at: ahora(), error: null, estilo_ref: null, recursos: [], precio_eur: 3, cobrado_eur: null },
    { id: 'c', nombre_original: 'mal.mp4', estado: 'error', progreso: 10, paso: null, duracion_original: null, duracion_final: null, created_at: ahora(), error: 'No se puede leer ese vídeo.', estilo_ref: null, recursos: [], precio_eur: 1.5, cobrado_eur: null },
  ]
})
afterEach(() => { cleanup(); localStorage.clear() })

const MB = 1048576
const archivo = (nombre, tipo, bytes = 2048) => new File([new Uint8Array(bytes)], nombre, { type: tipo })
const video = (nombre = 'toma.mp4', bytes = 3000) => archivo(nombre, 'video/mp4', bytes)
const pinta = () => render(<EditorReel clientId="c1" client={{ name: 'Alex' }} onVolver={() => {}} />)
const tarjetas = (c) => c.querySelectorAll('.ed-refs > li')
const llamadas = (tipo) => h.llamadas.filter(l => l[0] === tipo)
const lineaPrecio = (texto) => screen.findByText((_, el) => Boolean(el?.classList?.contains('ed-precio-linea')) && el.textContent === texto)

async function abreTaller(clave = null) {
  const r = pinta()
  await screen.findByText('lista.mp4')
  fireEvent.click(clave ? screen.getByRole('button', { name: `Crear con el estilo de @${clave}` }) : screen.getByRole('button', { name: /Editar con mi estilo/ }))
  await screen.findByRole('heading', { name: clave ? `Editar con el estilo de @${clave}` : 'Editar con tu estilo' })
  return r
}
async function eligeVideo(a = video()) {
  fireEvent.change(screen.getByLabelText('Elegir el vídeo'), { target: { files: [a] } })
  await screen.findByText(a.name)
}

describe('EditorReel · la galería de estilos', () => {
  it('enseña los 30 estilos, filtra por idioma y tema, y ya no dice «En construcción»', async () => {
    const { container } = pinta()
    await screen.findByText('lista.mp4')
    expect(tarjetas(container)).toHaveLength(30)
    // Los 6 de fotogramas reales enseñan su portada; los demás, la vista previa con CSS.
    expect(screen.getByAltText('Reel de ejemplo de @rpn')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Vista previa de los subtítulos del estilo de @hormozi' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Español' }))
    const es = ESTILOS_REFERENCIA.filter(e => e.idioma === 'es')
    expect(tarjetas(container)).toHaveLength(es.length)
    expect(screen.getByText(`${es.length} estilos`)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'ia' } })
    const esIa = es.filter(e => e.tema === 'ia')
    expect(esIa.length).toBeGreaterThan(0)
    expect(tarjetas(container)).toHaveLength(esIa.length)
    expect(screen.getByText('@dotcsv')).toBeTruthy()
    expect(screen.queryByText('@hormozi')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: '' } })
    expect(tarjetas(container)).toHaveLength(30)

    expect(document.body.textContent).not.toMatch(/construcción|esté integrado|se activa cuando/i)
    const editor = AGENTES.find(a => a.key === 'editor')
    expect(editor.estado).toBe('activo')
    expect(`${editor.resumen} ${editor.detalle}`).not.toMatch(/construcción/i)
  })

  it('«Crear» abre el taller con ese estilo, y «Copiar prompt» copia el suyo', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { container } = pinta()
    await screen.findByText('lista.mp4')
    const hormozi = screen.getByText('@hormozi').closest('li')
    fireEvent.click(within(hormozi).getByRole('button', { name: /Copiar prompt/ }))
    await within(hormozi).findByText('Copiado')
    expect(writeText).toHaveBeenCalledWith(ESTILOS_REFERENCIA.find(e => e.clave === 'hormozi').prompt)

    fireEvent.click(within(hormozi).getByRole('button', { name: 'Crear con el estilo de @hormozi' }))
    expect(await screen.findByRole('heading', { name: 'Editar con el estilo de @hormozi' })).toBeTruthy()
    expect(container.querySelector('.ed-refs')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ajustar el estilo/ }))
    expect(screen.getByLabelText('En mayúsculas').checked).toBe(true)
    expect(screen.getByLabelText('Palabras por bloque').value).toBe('3')
    expect(screen.getByLabelText('Cuánto zoom').value).toBe('1.12')

    // «Estilos» vuelve a la galería.
    fireEvent.click(screen.getByRole('button', { name: 'Estilos' }))
    expect(tarjetas(container)).toHaveLength(30)
  })

  it('la tarjeta dice de qué plataforma es el enlace del perfil', async () => {
    pinta()
    await screen.findByText('lista.mp4')
    const enlace = (nombre) => within(screen.getByText(`@${nombre}`).closest('li')).getByRole('link').textContent.trim()
    expect(enlace('thediaryofaceo')).toBe('Ver en YouTube')
    expect(enlace('rileybrown_ai')).toBe('Ver en X')
    expect(enlace('vilmanunez')).toBe('Ver en Instagram')
    expect(enlace('lauraribas')).toBe('Ver su web')
  })
})

describe('EditorReel · el precio, antes de subir', () => {
  it('«Esto cuesta… · te quedan…» con la duración del vídeo; sin saldo no deja empezar y lleva a recargar', async () => {
    h.precios = { paga: true, saldo: 5, precios: PRECIOS_FIJOS }
    h.duracion = 200
    await abreTaller('kallaway')
    expect(screen.getByText(/Cuesta 150 créditos por cada 3 minutos/)).toBeTruthy()
    await eligeVideo()
    expect(await lineaPrecio('Esto cuesta 300 créditos · te quedan 500')).toBeTruthy()
    expect(screen.getByText(/3:20 de vídeo: 2 × 150 créditos/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar vídeo' }).disabled).toBe(false)
    cleanup()

    h.precios = { paga: true, saldo: 2, precios: PRECIOS_FIJOS }
    await abreTaller('kallaway')
    await eligeVideo()
    expect(await lineaPrecio('Esto cuesta 300 créditos · te quedan 200')).toBeTruthy()
    expect(screen.getByText('No te llega el saldo para este vídeo.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar vídeo' }).disabled).toBe(true)
    const recarga = vi.fn()
    window.addEventListener('helm:sin-saldo', recarga)
    fireEvent.click(screen.getByRole('button', { name: /Recargar créditos/ }))
    window.removeEventListener('helm:sin-saldo', recarga)
    expect(recarga).toHaveBeenCalledTimes(1)
  })

  it('«Gratis en tu agencia» si el perfil no paga', async () => {
    h.precios = { paga: false, saldo: null, precios: PRECIOS_FIJOS }
    await abreTaller()
    expect(screen.getByText('Gratis en tu agencia')).toBeTruthy()
    await eligeVideo()
    expect(screen.getByText('Gratis en tu agencia')).toBeTruthy()
    expect(screen.queryByText(/Esto cuesta/)).toBeNull()
  })

  it('no acepta lo que no es vídeo ni uno de más de 10 minutos', async () => {
    await abreTaller()
    fireEvent.change(screen.getByLabelText('Elegir el vídeo'), { target: { files: [archivo('notas.txt', 'text/plain', 10)] } })
    expect(await screen.findByText(/Eso no es un vídeo/)).toBeTruthy()
    h.duracion = 720
    fireEvent.change(screen.getByLabelText('Elegir el vídeo'), { target: { files: [video('largo.mp4')] } })
    expect(await screen.findByText(/Ese vídeo dura 12:00: el máximo son 10 minutos/)).toBeTruthy()
    expect(screen.queryByText('largo.mp4')).toBeNull()
    expect(llamadas('crear')).toEqual([])
  })

  it('lo que queda se cuenta hacia abajo, como el servidor: con 1,4987 € quedan 149 y no llega', async () => {
    h.precios = { paga: true, saldo: 1.4987, precios: PRECIOS_FIJOS }
    await abreTaller()
    await eligeVideo()
    expect(await lineaPrecio('Esto cuesta 150 créditos · te quedan 149')).toBeTruthy()
    expect(screen.getByText('No te llega el saldo para este vídeo.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar vídeo' }).disabled).toBe(true)
    cleanup()

    // Justo lo que cuesta sí llega; y 0,29 € son 29 créditos (no 28 por la coma flotante).
    h.precios = { paga: true, saldo: 1.5, precios: PRECIOS_FIJOS }
    await abreTaller()
    await eligeVideo()
    expect(await lineaPrecio('Esto cuesta 150 créditos · te quedan 150')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar vídeo' }).disabled).toBe(false)
    cleanup()
    h.precios = { paga: true, saldo: 0.29, precios: PRECIOS_FIJOS }
    await abreTaller()
    await eligeVideo()
    expect(await lineaPrecio('Esto cuesta 150 créditos · te quedan 29')).toBeTruthy()
  })

  it('quien no administra la agencia no compra: el botón dice «Cómo recargar»', async () => {
    localStorage.removeItem('bw_superadmin')
    h.precios = { paga: true, saldo: 0.2, precios: PRECIOS_FIJOS }
    await abreTaller()
    await eligeVideo()
    expect(screen.queryByRole('button', { name: /Recargar créditos/ })).toBeNull()
    const recarga = vi.fn()
    window.addEventListener('helm:sin-saldo', recarga)
    fireEvent.click(screen.getByRole('button', { name: 'Cómo recargar' }))
    window.removeEventListener('helm:sin-saldo', recarga)
    expect(recarga).toHaveBeenCalledTimes(1)
  })
})

describe('EditorReel · editar un vídeo', () => {
  it('crear → trozos → lanzar: manda el estilo elegido, sube por trozos y aparece en cola', async () => {
    const { container } = await abreTaller('hormozi')
    // Soltarlo encima también vale.
    fireEvent.drop(container.querySelector('.ed-subida'), { dataTransfer: { files: [video('toma.mp4', 3000)] } })
    await screen.findByText('toma.mp4')
    expect(await lineaPrecio('Esto cuesta 150 créditos · te quedan 1000')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))

    expect(await screen.findByText(/«toma\.mp4» ya está en cola/)).toBeTruthy()
    expect(h.llamadas.map(l => l[0])).toEqual(['crear', 'trozo', 'trozo', 'trozo', 'lanzar'])
    expect(h.llamadas[0][1]).toEqual({
      nombre: 'toma.mp4', bytes: 3000, tipo: 'video/mp4', duracion: 95, estilo_ref: 'hormozi', params: estiloDeReferencia('hormozi'),
    })
    expect(llamadas('trozo').map(l => [l[1], l[2]])).toEqual([[0, 1024], [1024, 1024], [2048, 952]])
    expect(llamadas('lanzar')).toEqual([['lanzar', 'e1', []]])
    // El taller se cierra (vuelve la galería) y el vídeo sale en la lista, en cola.
    expect(tarjetas(container)).toHaveLength(30)
    const fila = (await screen.findByText('toma.mp4')).closest('li')
    await within(fila).findByText('En cola')
    expect(within(fila).getByText(/estilo @hormozi/)).toBeTruthy()
  })

  it('recursos: valida tipo y tamaño, se suben tras el vídeo y van a lanzar con su palabra', async () => {
    await abreTaller()
    await eligeVideo(video('toma.mp4', 1500))
    fireEvent.change(screen.getByLabelText('Añadir imágenes o clips'), {
      target: { files: [archivo('foto.jpg', 'image/jpeg', 100), archivo('clip.mov', 'video/quicktime', 200), archivo('notas.pdf', 'application/pdf', 10)] },
    })
    expect(await screen.findByText(/«notas\.pdf» no vale como imagen o clip/)).toBeTruthy()
    expect(screen.getByText('foto.jpg')).toBeTruthy()
    expect(screen.getByText('clip.mov')).toBeTruthy()
    expect(screen.queryByText('notas.pdf')).toBeNull()
    fireEvent.change(screen.getByLabelText('Cuando diga… (foto.jpg)'), { target: { value: ' factura ' } })
    // Con imágenes, se elige cómo entran: arriba con la persona abajo.
    fireEvent.click(screen.getByLabelText('Arriba, con la persona abajo'))

    fireEvent.change(screen.getByLabelText('Elegir logo'), { target: { files: [archivo('logo.jpg', 'image/jpeg', 50)] } })
    expect(await screen.findByText(/El logo tiene que ser PNG o WebP/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Elegir logo'), { target: { files: [archivo('enorme.png', 'image/png', 6 * MB)] } })
    expect(await screen.findByText(/«enorme\.png» pesa 6 MB: el logo puede pesar hasta 5 MB/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Elegir logo'), { target: { files: [archivo('logo.png', 'image/png', 50)] } })
    fireEvent.change(screen.getByLabelText('Elegir música'), { target: { files: [archivo('fondo.mp3', 'audio/mpeg', 300)] } })
    await screen.findByText('fondo.mp3')
    expect(screen.getByLabelText('Dónde va el logo').value).toBe('arriba-der')
    expect(screen.getByLabelText('Volumen de la música')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    await screen.findByText(/«toma\.mp4» ya está en cola/)
    expect(h.llamadas.map(l => l.slice(0, 2).join(':'))).toEqual([
      'crear:[object Object]', 'trozo:0', 'trozo:1024', 'recurso:broll', 'recurso:broll', 'recurso:logo', 'recurso:musica', 'lanzar:e1',
    ])
    expect(llamadas('recurso').map(l => l[2])).toEqual(['foto.jpg', 'clip.mov', 'logo.png', 'fondo.mp3'])
    expect(llamadas('crear')[0][1].params.recursosModo).toBe('arriba')
    expect(llamadas('lanzar')[0][2]).toEqual([{ id: 'r1', palabra: 'factura' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }])
  })

  it('402 al crear: no sube nada, lo dice tal cual y deja recargar', async () => {
    const msg = 'No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 20. Recarga en Créditos.'
    h.errorCrear = new Error(msg)
    await abreTaller('vilmanunez')
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(msg)).toBeTruthy()
    expect(llamadas('trozo')).toEqual([])
    const recarga = vi.fn()
    window.addEventListener('helm:sin-saldo', recarga)
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Recargar créditos/ }))
    window.removeEventListener('helm:sin-saldo', recarga)
    expect(recarga.mock.calls[0][0].detail).toBe(msg)
    // Sigue en el taller, listo para volver a probar.
    expect(screen.getByRole('button', { name: 'Editar vídeo' })).toBeTruthy()
  })

  it('402 al lanzar: el vídeo queda subido y se lanza luego sin volver a subirlo', async () => {
    h.errorLanzar = new Error('No tienes saldo suficiente: esto cuesta 150 créditos y te quedan 20. Recarga en Créditos.')
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(/No tienes saldo suficiente/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lanzar la edición' }))
    expect(await screen.findByText(/«toma\.mp4» ya está en cola/)).toBeTruthy()
    expect(llamadas('crear')).toHaveLength(1)
    expect(llamadas('trozo')).toHaveLength(3)
    expect(llamadas('lanzar')).toHaveLength(2)
  })

  it('si se corta la red, sigue desde lo que tiene el servidor', async () => {
    let red = false
    h.manda = (o) => {
      if (!red && accion(o.url).get('offset') === '1024') {
        h.llamadas.push(['fallo'])
        return Promise.reject(Object.assign(new Error('La subida se cortó. Comprueba la conexión y vuelve a probar.'), { red: true }))
      }
      return mandaPorDefecto(o)
    }
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(/La subida se cortó/, {}, { timeout: 3000 })).toBeTruthy()
    // Lo reintentó solo (1 + 6 veces) antes de rendirse.
    expect(llamadas('fallo')).toHaveLength(7)
    red = true
    h.recibidos = 1024
    fireEvent.click(screen.getByRole('button', { name: 'Seguir subiendo' }))
    expect(await screen.findByText(/«toma\.mp4» ya está en cola/)).toBeTruthy()
    expect(llamadas('recibidos')).toEqual([['recibidos', 'e1']])
    expect(llamadas('trozo').map(l => l[1])).toEqual([0, 1024, 2048])
    expect(llamadas('crear')).toHaveLength(1)
  })

  it('«Cancelar» para la subida y luego se sigue desde donde iba', async () => {
    h.manda = (o) => {
      if (accion(o.url).get('offset') === '1024') {
        return new Promise((_, mal) => o.senal.addEventListener('abort', () => mal(Object.assign(new Error('Subida cancelada'), { cancelada: true }))))
      }
      return mandaPorDefecto(o)
    }
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText(/Subida parada/)).toBeTruthy()
    h.manda = mandaPorDefecto
    h.recibidos = 1024
    fireEvent.click(screen.getByRole('button', { name: 'Seguir subiendo' }))
    expect(await screen.findByText(/«toma\.mp4» ya está en cola/)).toBeTruthy()
    expect(llamadas('trozo').map(l => l[1])).toEqual([0, 1024, 2048])
  })

  it('un recurso que llegó aunque se canceló no sale repetido: se quita antes de volver a subirlo y no va a lanzar', async () => {
    const cancelada = () => Object.assign(new Error('Subida cancelada'), { cancelada: true })
    let primera = true
    h.manda = (o) => {
      const q = accion(o.url)
      if (q.get('action') === 'recurso' && primera) {
        primera = false
        // El servidor ya lo tiene entero (lo apunta) y la pantalla corta antes de oír la respuesta.
        guardaRecurso(q, o.cuerpo)
        return new Promise((_, mal) => o.senal.addEventListener('abort', () => mal(cancelada())))
      }
      return mandaPorDefecto(o)
    }
    await abreTaller()
    await eligeVideo()
    fireEvent.change(screen.getByLabelText('Añadir imágenes o clips'), { target: { files: [archivo('foto.jpg', 'image/jpeg', 100)] } })
    fireEvent.change(screen.getByLabelText('Cuando diga… (foto.jpg)'), { target: { value: 'factura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText(/Parado\. El vídeo ya está subido/)).toBeTruthy()
    expect(h.ediciones.find(e => e.id === 'e1').recursos.map(r => r.id)).toEqual(['r1'])

    fireEvent.click(screen.getByRole('button', { name: 'Lanzar la edición' }))
    expect(await screen.findByText(/«toma\.mp4» ya está en cola/)).toBeTruthy()
    // r1 (el huérfano) fuera antes de subirlo otra vez; a lanzar solo va r2, con su palabra.
    expect(llamadas('quitar')).toEqual([['quitar', 'e1', 'r1']])
    expect(llamadas('recurso')).toHaveLength(2)
    expect(llamadas('lanzar')).toEqual([['lanzar', 'e1', [{ id: 'r2', palabra: 'factura' }]]])
    expect(h.ediciones.find(e => e.id === 'e1').recursos.map(r => r.id)).toEqual(['r2'])
  })

  it('mientras el taller sube, «Agentes» y «Seguir subiendo» de la lista están apagados (no cortan la subida)', async () => {
    h.ediciones.unshift({
      id: 'm', nombre_original: 'medias.mp4', estado: 'subiendo', progreso: 0, paso: 'Subiendo el vídeo (40 %)', duracion_original: null, duracion_final: null,
      created_at: ahora(), error: null, estilo_ref: null, precio_eur: 1.5, cobrado_eur: null, recursos: [],
    })
    h.manda = (o) => {
      if (accion(o.url).get('offset') === '1024') {
        return new Promise((_, mal) => o.senal.addEventListener('abort', () => mal(Object.assign(new Error('Subida cancelada'), { cancelada: true }))))
      }
      return mandaPorDefecto(o)
    }
    await abreTaller()
    await eligeVideo()
    const medias = screen.getByText('medias.mp4').closest('li')
    expect(within(medias).getByRole('button', { name: /Seguir subiendo/ }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    await screen.findByRole('button', { name: 'Cancelar' })
    // Se apagan en el mismo cambio de estado que la subida, pero con la suite
    // entera cargando la máquina puede llegar un render después.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Agentes/ }).disabled).toBe(true)
      expect(screen.getByRole('button', { name: /Estilos/ }).disabled).toBe(true)
      expect(within(medias).getByRole('button', { name: /Seguir subiendo/ }).disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await screen.findByText(/Subida parada/)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Agentes/ }).disabled).toBe(false)
      expect(within(medias).getByRole('button', { name: /Seguir subiendo/ }).disabled).toBe(false)
    })
  })

  it('sin red dice que no hay conexión, no «Failed to fetch»', async () => {
    h.errorCrear = new TypeError('Failed to fetch')
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText('No hay conexión con HELM: comprueba la red y vuelve a probar.')).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Editar vídeo' })).toBeTruthy()
  })

  it('«Guardar como estilo del perfil» guarda lo cambiado, normalizado', async () => {
    await abreTaller()
    fireEvent.click(screen.getByRole('button', { name: /Ajustar el estilo/ }))
    fireEvent.click(await screen.findByLabelText('En mayúsculas'))
    fireEvent.click(screen.getByRole('button', { name: /Guardar como estilo del perfil/ }))
    await screen.findByText(/Guardado/)
    expect(h.guardados).toHaveLength(1)
    expect(h.guardados[0]).toEqual({ ...normalizaEstilo(ESTILO_POR_DEFECTO), mayusculas: false })
  })
})

describe('EditorReel · cuando «lanzar» no sale', () => {
  const falla = (mensaje, status, datos) => Object.assign(new Error(mensaje), { status, ...(datos ? { datos } : {}) })

  it('un 422 (el vídeo no se puede leer) no deja «Lanzar» otra vez: solo descartar o cerrar', async () => {
    const msg = 'No se puede leer ese vídeo. Prueba a exportarlo otra vez desde el móvil (MP4 o MOV).'
    h.errorLanzar = falla(msg, 422)
    const confirma = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect((await screen.findByText(msg)).closest('[role="alert"]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lanzar la edición' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Seguir subiendo' })).toBeNull()
    expect(screen.queryByText(/ya está en cola/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy()
    // «Descartar» la borra y el taller vuelve a empezar, con el mismo vídeo elegido.
    fireEvent.click(screen.getByRole('button', { name: /Descartar/ }))
    expect(await screen.findByRole('button', { name: 'Editar vídeo' })).toBeTruthy()
    expect(llamadas('borrar')).toEqual([['borrar', 'e1']])
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeTruthy()
    confirma.mockRestore()
  })

  it('un «lanzar» que contesta 200 con la edición en error no dice «en cola»', async () => {
    h.respuestaLanzar = { edicion: { id: 'e1', estado: 'error', error: 'El vídeo dura más de 10 minutos. Recórtalo y vuelve a subirlo.' } }
    const { container } = await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(/El vídeo dura más de 10 minutos/)).toBeTruthy()
    expect(screen.queryByText(/ya está en cola/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lanzar la edición' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(tarjetas(container)).toHaveLength(30)
  })

  it('un 409 con `recibidos` (le falta un trozo) vuelve a «Seguir subiendo» y sigue desde ahí', async () => {
    h.errorLanzar = falla('El vídeo todavía no ha llegado entero.', 409, { recibidos: 2048 })
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(/Al vídeo le falta un trozo por llegar/)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Subida del vídeo' }).getAttribute('aria-valuenow')).toBe('68')
    expect(screen.queryByRole('button', { name: 'Lanzar la edición' })).toBeNull()
    h.recibidos = 2048
    fireEvent.click(screen.getByRole('button', { name: 'Seguir subiendo' }))
    expect(await screen.findByText(/«toma\.mp4» ya está en cola/)).toBeTruthy()
    expect(llamadas('trozo').map(l => l[1])).toEqual([0, 1024, 2048, 2048])
    expect(llamadas('lanzar')).toHaveLength(2)
  })

  it('un 409 que ya lo tiene todo (otro archivo con el mismo nombre) no cuadra: a descartar', async () => {
    h.errorLanzar = falla('El vídeo todavía no ha llegado entero.', 409, { recibidos: 5000 })
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(/no cuadra con este archivo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Seguir subiendo' })).toBeNull()
    expect(screen.getByRole('button', { name: /Descartar/ })).toBeTruthy()
  })

  it('un 410 (la subida se perdió) tampoco deja seguir', async () => {
    h.errorLanzar = falla('La subida se perdió (pasó demasiado tiempo). Vuelve a empezar.', 410)
    await abreTaller()
    await eligeVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Editar vídeo' }))
    expect(await screen.findByText(/La subida se perdió/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lanzar la edición' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy()
  })
})

describe('EditorReel · tus vídeos', () => {
  it('cada estado en castellano con su progreso, lo cobrado, descargar y «Qué ha quitado»', async () => {
    pinta()
    const fila = (await screen.findByText('lista.mp4')).closest('li')
    expect(within(fila).getByRole('button', { name: /Descargar/ })).toBeTruthy()
    expect(within(fila).getByText('0:41')).toBeTruthy()
    expect(within(fila).getByText('150 créditos')).toBeTruthy()
    expect(within(fila).getByText(/estilo @hormozi · 2 recursos/)).toBeTruthy()
    const montando = screen.getByText('montando.mov').closest('li')
    expect(within(montando).getByText('Montando')).toBeTruthy()
    expect(within(montando).getByText(/Montando el vídeo \(1:00 → 0:41\) · 63 %/)).toBeTruthy()
    expect(within(montando).getByText('costará 300 créditos')).toBeTruthy()
    const mal = screen.getByText('mal.mp4').closest('li')
    expect(within(mal).getByText('No se puede leer ese vídeo.')).toBeTruthy()
    expect(within(mal).getByText('sin cobrar')).toBeTruthy()
    // «Qué ha quitado» trae el resumen del plan.
    fireEvent.click(within(fila).getByRole('button', { name: /Qué ha quitado/ }))
    expect(await screen.findByText(/«Esta IA hace que tu negocio venda más\.»/)).toBeTruthy()
    expect(screen.getByText(/1 toma repetida/)).toBeTruthy()
  })

  it('una subida a medias se sigue eligiendo el mismo archivo (y no otro)', async () => {
    h.ediciones.unshift({
      id: 'm', nombre_original: 'medias.mp4', bytes: 3000, estado: 'subiendo', progreso: 0, paso: null, duracion_original: null, duracion_final: null,
      created_at: ahora(), error: null, estilo_ref: 'kallaway', precio_eur: 1.5, cobrado_eur: null, recursos: [{ id: 'rx', tipo: 'logo', nombre: 'logo.png', bytes: 50 }],
    })
    h.recibidos = 2048
    pinta()
    const fila = (await screen.findByText('medias.mp4')).closest('li')
    expect(within(fila).getByText('Subida a medias')).toBeTruthy()
    const input = within(fila).getByLabelText('Seguir subiendo medias.mp4')
    fireEvent.change(input, { target: { files: [video('otro.mp4', 3000)] } })
    expect(await screen.findByText(/Ese no es el mismo vídeo: para seguir, elige «medias\.mp4»/)).toBeTruthy()
    fireEvent.change(input, { target: { files: [video('medias.mp4', 3000)] } })
    expect(await screen.findByRole('heading', { name: 'Editar con el estilo de @kallaway' })).toBeTruthy()
    expect(screen.getByText(/Esta subida se quedó a medias/)).toBeTruthy()
    expect(await lineaPrecio('Esto cuesta 150 créditos · te quedan 1000')).toBeTruthy()
    expect(screen.getByText('logo.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir subiendo' }))
    expect(await screen.findByText(/«medias\.mp4» ya está en cola/)).toBeTruthy()
    expect(llamadas('crear')).toEqual([])
    expect(llamadas('trozo').map(l => l[1])).toEqual([2048])
    expect(llamadas('lanzar')).toEqual([['lanzar', 'm', [{ id: 'rx' }]]])
    // El estilo de una subida retomada no lo trae la lista: no se enseñan unos ajustes que no son los suyos.
    expect(screen.queryByRole('button', { name: /Ajustar el estilo/ })).toBeNull()
  })

  it('una subida que llegó entera (p. ej. sin saldo al lanzar) se lanza desde la lista, sin volver a elegir el archivo', async () => {
    h.ediciones.unshift({
      id: 'm', nombre_original: 'entero.mp4', estado: 'subiendo', progreso: 0, paso: 'Vídeo subido', duracion_original: null, duracion_final: null,
      created_at: ahora(), error: null, estilo_ref: 'kallaway', precio_eur: 3, cobrado_eur: null,
      recursos: [{ id: 'rb', tipo: 'broll', nombre: 'foto.jpg', bytes: 100, clase: 'imagen' }],
    })
    pinta()
    const fila = (await screen.findByText('entero.mp4')).closest('li')
    expect(within(fila).getByText('Falta lanzarlo')).toBeTruthy()
    expect(within(fila).queryByLabelText('Seguir subiendo entero.mp4')).toBeNull()
    fireEvent.click(within(fila).getByRole('button', { name: 'Lanzar la edición de entero.mp4' }))
    expect(await screen.findByRole('heading', { name: 'Editar con el estilo de @kallaway' })).toBeTruthy()
    expect(screen.getByText(/El vídeo ya llegó entero/)).toBeTruthy()
    expect(screen.getByText('ya subido')).toBeTruthy()
    expect(await lineaPrecio('Esto cuesta 300 créditos · te quedan 1000')).toBeTruthy()
    expect(screen.getByText(/Es el precio de cuando empezaste a subirlo/)).toBeTruthy()
    // La palabra de cada recurso se pone (otra vez) aquí antes de lanzar.
    fireEvent.change(screen.getByLabelText('Cuando diga… (foto.jpg)'), { target: { value: 'factura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lanzar la edición' }))
    expect(await screen.findByText(/«entero\.mp4» ya está en cola/)).toBeTruthy()
    expect(llamadas('crear')).toEqual([])
    expect(llamadas('recibidos')).toEqual([])
    expect(llamadas('trozo')).toEqual([])
    expect(llamadas('lanzar')).toEqual([['lanzar', 'm', [{ id: 'rb', palabra: 'factura' }]]])
  })

  it('solo pregunta cada 3 s por lo que está en cola o editándose, no por subidas a medias', async () => {
    const reloj = vi.spyOn(globalThis, 'setInterval')
    const cada3s = () => reloj.mock.calls.filter(c => c[1] === 3000).length
    h.ediciones = [
      h.ediciones[0],
      { id: 'm', nombre_original: 'medias.mp4', estado: 'subiendo', progreso: 0, paso: null, duracion_original: null, duracion_final: null, created_at: ahora(), error: null, estilo_ref: null, precio_eur: 1.5, cobrado_eur: null, recursos: [] },
    ]
    pinta()
    await screen.findByText('medias.mp4')
    expect(cada3s()).toBe(0)
    cleanup()

    h.ediciones = [...h.ediciones, { id: 'q', nombre_original: 'cola.mp4', estado: 'en_cola', progreso: 0, paso: 'En cola', duracion_original: 30, duracion_final: null, created_at: ahora(), error: null, estilo_ref: null, precio_eur: 1.5, cobrado_eur: null, recursos: [] }]
    pinta()
    await screen.findByText('cola.mp4')
    expect(cada3s()).toBe(1)
    reloj.mockRestore()
  })

  it('si la lista no carga, lo dice (sin «Failed to fetch») y no se queda en «Cargando…»', async () => {
    h.errorLista = new TypeError('Failed to fetch')
    pinta()
    expect(await screen.findByText(/No hay conexión con HELM/)).toBeTruthy()
    expect(screen.queryByText('Cargando…')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a probar' }))
    expect(await screen.findByText('lista.mp4')).toBeTruthy()
    expect(screen.queryByText(/No hay conexión con HELM/)).toBeNull()
  })
})

describe('los 30 estilos de referencia', () => {
  it('son 30, sin repetir, con su perfil y parámetros válidos para el motor', () => {
    expect(ESTILOS_REFERENCIA).toHaveLength(30)
    expect(new Set(ESTILOS_REFERENCIA.map(e => e.clave)).size).toBe(30)
    expect(ESTILOS_REFERENCIA.filter(e => /abdaal/i.test(e.clave))).toHaveLength(1)
    for (const e of ESTILOS_REFERENCIA) {
      expect(e.nombre, e.clave).toBeTruthy()
      expect(IDIOMAS[e.idioma], e.clave).toBeTruthy()
      expect(TEMAS[e.tema], e.clave).toBeTruthy()
      expect(e.enlace, e.clave).toMatch(/^https:\/\//)
      expect(e.prompt, e.clave).toMatch(/nunca su cara/)
      expect(Array.isArray(e.reels), e.clave).toBe(true)
      // Cada parámetro existe en el motor y ya está dentro de su rango y paso.
      const n = normalizaEstilo(e.estilo)
      for (const [k, v] of Object.entries(e.estilo)) {
        expect(Object.hasOwn(ESTILO_POR_DEFECTO, k), `${e.clave}.${k}`).toBe(true)
        expect(n[k], `${e.clave}.${k}`).toBe(v)
      }
      // Los nuevos, sin reels de ejemplo, traen de dónde sale el estilo.
      if (!e.reels.length) expect(e.fuentes?.length, e.clave).toBeGreaterThan(0)
    }
    // Los 6 de hoy conservan sus reels de ejemplo.
    for (const clave of ['rpn', 'austingeorgas', 'pedrobuerbaum', 'samzia', 'felipetambara.ia', 'izansimon']) {
      expect(ESTILOS_REFERENCIA.find(e => e.clave === clave).reels.length, clave).toBeGreaterThan(0)
    }
    expect(ESTILOS_REFERENCIA.filter(e => e.idioma === 'es').length).toBeGreaterThanOrEqual(10)
  })

  it('cada estilo es coherente con cómo edita ese perfil', () => {
    const de = (clave) => estiloDeReferencia(clave)
    expect(de('hormozi')).toMatchObject({ mayusculas: true, colorTexto: '#FFFFFF', colorBorde: '#000000', colorResalte: '#FFD60A', zoom: true })
    expect(de('hormozi').palabrasPorBloque).toBeGreaterThanOrEqual(2)
    expect(de('hormozi').palabrasPorBloque).toBeLessThanOrEqual(4)
    expect(de('hormozi').zoomCada).toBeLessThanOrEqual(3)
    expect(de('kallaway').recursosModo).toBe('arriba')
    expect(de('leilahormozi')).toMatchObject({ subtitulos: false, zoom: false })
    expect(de('leilahormozi').silencioMax).toBeGreaterThan(de('hormozi').silencioMax)
    expect(de('samzia').palabrasPorBloque).toBe(1)
    expect(de('aliabdaal')).toMatchObject({ mayusculas: false, colorResalte: '#FFD60A' })
    expect(de('imangadzhi').colorResalte).toBe(de('imangadzhi').colorTexto)
    expect(de('felipetambara.ia').volumen).toBe(-14)
    expect(de('romualdfonstv').zoomFactor).toBe(1.15)
  })
})
