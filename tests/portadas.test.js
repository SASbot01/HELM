// Portadas de reels: las reglas del estudio (src/agents/portadas/reglas.js), la
// maqueta del compositor (componer.js, sin canvas) y el servidor
// (api/portadas.js) con Supabase, la IA e Instagram simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizaMarca, normalizaOpciones, primeraCifra, contraste, tintaSobre, comprobar, MARCA_POR_DEFECTO, ZONA_CUADRICULA,
} from '../src/agents/portadas/reglas.js'
import { ajusta, maquetar } from '../src/agents/portadas/componer.js'
import { tamanoFotograma, capturador } from '../src/agents/portadas/fotograma.js'

// Una letra de mentira: cada carácter mide medio cuerpo.
const medir = (t, tam) => String(t).length * tam * 0.5

describe('reglas', () => {
  it('normalizaMarca deja fuera lo que no vale', () => {
    expect(normalizaMarca({ colorPrincipal: 'rojo', letra: 'comic', plantilla: 'x', etiqueta: 'a'.repeat(40), mayusculas: 'sí' }))
      .toEqual({ ...MARCA_POR_DEFECTO, etiqueta: 'a'.repeat(24) })
    expect(normalizaMarca({ colorPrincipal: '#00ff00', letra: 'montserrat', plantilla: 'pregunta', mayusculas: false }))
      .toMatchObject({ colorPrincipal: '#00FF00', letra: 'montserrat', plantilla: 'pregunta', mayusculas: false })
    expect(normalizaMarca({ letra: '__proto__' }).letra).toBe('barlow')
  })

  it('normalizaOpciones: palabras, resaltada que exista, plantilla y tope de 3', () => {
    const o = normalizaOpciones([
      { texto: 'Facturé 18.000 € en un mes', resaltada: '18.000', plantilla: 'numero' },
      { texto: 'una', resaltada: 'una' },                                    // muy corta
      { texto: 'Esto no se lo cuenta nadie a los nuevos creadores de hoy', resaltada: 'nadie' }, // muy larga
      { texto: '¿Cómo consigo clientes sin anuncios?', resaltada: 'inventada' },
      { texto: 'Deja de grabar así', resaltada: 'grabar', plantilla: 'rara' },
      { texto: 'La cuarta sobra', resaltada: 'cuarta' },
    ])
    expect(o).toHaveLength(3)
    expect(o[0]).toMatchObject({ texto: 'Facturé 18.000 € en un mes', resaltada: '18.000', plantilla: 'numero' })
    expect(o[1]).toMatchObject({ resaltada: '', plantilla: 'pregunta' })
    expect(o[2]).toMatchObject({ resaltada: 'grabar', plantilla: 'costura' })
    expect(normalizaOpciones('nada')).toEqual([])
  })

  it('primeraCifra', () => {
    expect(primeraCifra('5 errores al grabar')).toBe('5')
    expect(primeraCifra('Gané 18.000€ así')).toBe('18.000€')
    expect(primeraCifra('Sin números')).toBe(null)
  })

  it('contraste WCAG y tinta', () => {
    expect(contraste('#FFFFFF', '#000000')).toBeCloseTo(21, 0)
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(tintaSobre('#E8B93A')).toBe('#0D0A02')
    expect(tintaSobre('#0A0A0C')).toBe('#FFFFFF')
  })

  it('comprobar marca lo que falla', () => {
    const bien = comprobar({ texto: 'Deja de grabar así', cajas: [{ x0: 100, x1: 900, y0: 400, y1: 700 }], contrastes: [7], tamano: 140 })
    expect(bien.every(c => c.ok)).toBe(true)
    const mal = comprobar({
      texto: 'Esto es un titular con demasiadas palabras para una portada',
      cajas: [{ x0: 20, x1: 500, y0: 1500, y1: 1700 }], contrastes: [2], tamano: 60,
    })
    expect(mal.filter(c => !c.ok)).toHaveLength(5)
  })
})

describe('compositor', () => {
  it('ajusta busca el tamaño más grande que cabe', () => {
    const r = ajusta({ palabras: ['Deja', 'de', 'grabar', 'así'], anchoMax: 864, lineasMax: 2, tamMax: 150, tamMin: 96, medir })
    expect(r.cabe).toBe(true)
    expect(r.lineas.length).toBeLessThanOrEqual(2)
    expect(r.lineas.every(l => medir(l.join(' '), r.tam) <= 864)).toBe(true)
    const no = ajusta({ palabras: ['Supercalifragilisticoespialidoso'], anchoMax: 300, lineasMax: 1, tamMax: 150, tamMin: 96, medir })
    expect(no).toMatchObject({ cabe: false, tam: 96 })
  })

  it.each(['costura', 'arriba', 'pregunta', 'etiqueta', 'numero'])('la plantilla %s deja el texto dentro de la cuadrícula', (plantilla) => {
    const marca = { ...MARCA_POR_DEFECTO, etiqueta: 'IA' }
    const plan = maquetar({ texto: '5 errores al grabar tus reels', resaltada: 'errores', plantilla, marca, medir })
    expect(plan.cajas.length).toBeGreaterThan(0)
    for (const c of plan.cajas) {
      expect(c.y0).toBeGreaterThanOrEqual(ZONA_CUADRICULA.y0)
      expect(c.y1).toBeLessThanOrEqual(ZONA_CUADRICULA.y1)
      expect(c.x0).toBeGreaterThanOrEqual(ZONA_CUADRICULA.x0 - 1)
      expect(c.x1).toBeLessThanOrEqual(ZONA_CUADRICULA.x1 + 1)
    }
    expect(plan.tam).toBeGreaterThanOrEqual(80)
    expect(plan.tieneResaltada).toBe(true)
    expect(comprobar({ texto: '5 errores al grabar tus reels', cajas: plan.cajas, contrastes: [5], tamano: plan.tam })[1].ok).toBe(true)
  })

  it('mayúsculas con tilde y pregunta entre comillas', () => {
    const plan = maquetar({ texto: '¿Cómo consigo clientes?', plantilla: 'pregunta', marca: MARCA_POR_DEFECTO, medir })
    const todo = plan.bloques.flatMap(b => b.lineas.flatMap(l => l.palabras)).join(' ')
    expect(todo).toBe('«¿CÓMO CONSIGO CLIENTES?»')
  })

  it('el número sin cifra cae a titular arriba', () => {
    const plan = maquetar({ texto: 'Sin cifras aquí', plantilla: 'numero', marca: MARCA_POR_DEFECTO, medir })
    expect(plan.bloques.some(b => b.tipo === 'cifra')).toBe(false)
    expect(plan.degradado).toBe('arriba')
  })
})

// ── Servidor ────────────────────────────────────────────────────────────────
const PERFIL = 'c0000000-0000-4000-8000-0000000000c1'
const db = {}
const escrituras = []
function consulta(tabla) {
  const filtros = []
  let cambio = null, nueva = null
  const filas = () => (db[tabla] ||= [])
  const encaja = (f) => filtros.every(([c, v]) => f[c] === v)
  const q = {
    select() { return q },
    eq(c, v) { filtros.push([c, v]); return q },
    update(row) { cambio = row; return q },
    insert(row) { nueva = row; return q },
    maybeSingle() { return Promise.resolve({ data: structuredClone(filas().find(encaja) || null), error: null }) },
    then(ok, mal) {
      if (cambio) { filas().filter(encaja).forEach(f => Object.assign(f, cambio)); escrituras.push({ tabla, cambio }) }
      if (nueva) { filas().push({ id: `id-${filas().length + 1}`, ...nueva }); escrituras.push({ tabla, nueva }) }
      return Promise.resolve({ data: filas().filter(encaja), error: null }).then(ok, mal)
    },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))
vi.mock('../api/_lib/access.js', () => ({ requireProfileAccess: vi.fn(async () => ({ sub: 'u-1' })) }))
vi.mock('../api/_lib/llm.js', () => ({ llmChat: vi.fn() }))
vi.mock('../api/_lib/instagram.js', () => ({ getToken: vi.fn(async () => ({ token: 't' })), getMediaUrls: vi.fn() }))
vi.mock('../api/_lib/web.js', () => ({ fetchPublico: vi.fn() }))

const { default: portadas, extraeJson } = await import('../api/portadas.js')
const { llmChat } = await import('../api/_lib/llm.js')
const { getMediaUrls } = await import('../api/_lib/instagram.js')
const { fetchPublico } = await import('../api/_lib/web.js')

let ip = 0
async function llama({ method = 'GET', action, query = {}, body }) {
  const res = {
    statusCode: 0, body: null, headers: {}, headersSent: false,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.headersSent = true; return this },
    end() { return this }, setHeader(k, v) { this.headers[k] = v },
  }
  await portadas({ method, query: { action, clientId: PERFIL, ...query }, body, headers: { 'x-forwarded-for': `10.7.0.${++ip}` }, socket: {} }, res)
  return res
}

beforeEach(() => {
  db.agent_memory = []
  db.helm_biblia = [{ client_id: PERFIL, kind: 'contenido', content: 'Tono directo.' }]
  db.helm_ig_media = [{ client_id: PERFIL, media_id: '17900000000000001', caption: 'Los 5 errores que te hunden los reels\nY cómo evitarlos', visitas: 1200 }]
  escrituras.length = 0
  llmChat.mockReset(); getMediaUrls.mockReset(); fetchPublico.mockReset()
})

describe('api/portadas', () => {
  it('marca: por defecto, se guarda saneada y se vuelve a leer', async () => {
    expect((await llama({ action: 'marca' })).body.marca).toEqual(MARCA_POR_DEFECTO)
    const g = await llama({ method: 'POST', action: 'marca', body: { clientId: PERFIL, marca: { colorPrincipal: '#123456', letra: 'nada' } } })
    expect(g.statusCode).toBe(200)
    expect(db.agent_memory[0]).toMatchObject({ client_id: PERFIL, clave: 'portadas-marca', ambito: 'portadas' })
    expect((await llama({ action: 'marca' })).body.marca).toMatchObject({ colorPrincipal: '#123456', letra: 'barlow' })
    await llama({ method: 'POST', action: 'marca', body: { clientId: PERFIL, marca: { colorPrincipal: '#654321' } } })
    expect(db.agent_memory).toHaveLength(1)
  })

  it('textos: lee el caption y la Biblia, y devuelve opciones válidas', async () => {
    llmChat.mockResolvedValue('Aquí tienes: {"opciones":[{"texto":"5 errores que hunden tus reels","resaltada":"errores","plantilla":"numero","angulo":"A","porque":"cifra"},{"texto":"x"}]}')
    const r = await llama({ method: 'POST', action: 'textos', body: { clientId: PERFIL, mediaId: '17900000000000001' } })
    expect(r.statusCode).toBe(200)
    expect(r.body.opciones).toHaveLength(1)
    const { system, messages } = llmChat.mock.calls[0][0]
    expect(system).toMatch(/cuadrícula/)
    expect(messages[0].content).toMatch(/Los 5 errores/)
    expect(messages[0].content).toMatch(/Tono directo/)
    expect(llmChat.mock.calls[0][0].clientId).toBe(PERFIL)
  })

  it('textos: reel de otro perfil → 404; respuesta sin opciones → 502', async () => {
    expect((await llama({ method: 'POST', action: 'textos', body: { clientId: PERFIL, mediaId: '1790000000000999' } })).statusCode).toBe(404)
    llmChat.mockResolvedValue('no sé')
    expect((await llama({ method: 'POST', action: 'textos', body: { clientId: PERFIL, mediaId: '17900000000000001' } })).statusCode).toBe(502)
  })

  it('video e imagen: solo reels del perfil y solo del CDN de Meta', async () => {
    expect((await llama({ action: 'video', query: { mediaId: '1790000000000999' } })).statusCode).toBe(404)
    expect(getMediaUrls).not.toHaveBeenCalled()
    getMediaUrls.mockResolvedValue({ video: 'https://evil.example.com/v.mp4', imagen: '' })
    expect((await llama({ action: 'video', query: { mediaId: '17900000000000001' } })).statusCode).toBe(502)
    expect(fetchPublico).not.toHaveBeenCalled()
    expect((await llama({ action: 'imagen', query: { mediaId: '17900000000000001' } })).statusCode).toBe(404)
  })

  it('extraeJson aguanta texto alrededor', () => {
    expect(extraeJson('bla {"a":1} bla')).toEqual({ a: 1 })
    expect(extraeJson('nada')).toBe(null)
  })
})

// El fotograma de un vídeo propio (Portadas y Trial reels): reducido a lo que
// cubre 1080×1920 y con dos lienzos que se turnan (un 4K del móvil agotaba la
// memoria de canvas de iOS). Sin canvas: lienzos de mentira.
describe('fotograma', () => {
  it('tamanoFotograma: lo más pequeño que siga cubriendo 1080×1920, nunca más grande que el vídeo', () => {
    expect(tamanoFotograma(2160, 3840)).toEqual({ ancho: 1080, alto: 1920 })       // 4K vertical
    expect(tamanoFotograma(3840, 2160)).toEqual({ ancho: 3413, alto: 1920 })       // 4K apaisado: el alto manda
    expect(tamanoFotograma(720, 1280)).toEqual({ ancho: 720, alto: 1280 })         // más pequeño: tal cual
    expect(tamanoFotograma(1080, 1920)).toEqual({ ancho: 1080, alto: 1920 })
    expect(tamanoFotograma(0, 1920)).toBeNull()
    expect(tamanoFotograma(undefined, undefined)).toBeNull()
  })

  it('capturador: reduce, turna dos lienzos (cada captura es otro objeto) y sin contexto devuelve null', () => {
    const dibujos = []
    let sinMemoria = false
    const creados = []
    const crea = () => {
      const c = { width: 300, height: 150, getContext: () => (sinMemoria ? null : { drawImage: (...a) => dibujos.push([c, ...a]) }) }
      creados.push(c)
      return c
    }
    const captura = capturador(crea)
    const video = { videoWidth: 2160, videoHeight: 3840 }
    const a = captura(video)
    const b = captura(video)
    const c = captura(video)
    expect(creados).toHaveLength(2)
    expect(a).not.toBe(b)
    expect(c).toBe(a)
    expect([a.width, a.height]).toEqual([1080, 1920])
    expect(dibujos[0].slice(1)).toEqual([video, 0, 0, 1080, 1920])
    // Aún sin imagen (el vídeo no ha cargado): nada.
    expect(captura({ videoWidth: 0, videoHeight: 0 })).toBeNull()
    // El navegador sin memoria de canvas: null, y quien llama se queda con el de antes.
    sinMemoria = true
    expect(captura(video)).toBeNull()
    expect(dibujos).toHaveLength(3)
  })
})
