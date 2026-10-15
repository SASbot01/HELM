import { describe, it, expect, vi, beforeEach } from 'vitest'

// La red, simulada: el DNS y el fetch público son lo único que sale fuera.
const dnsLookup = vi.fn()
const fetchPublico = vi.fn()
vi.mock('node:dns/promises', () => ({ default: { lookup: (...a) => dnsLookup(...a) } }))
vi.mock('../api/_lib/web.js', async (orig) => ({
  ...(await orig()),
  fetchPublico: (...a) => fetchPublico(...a),
}))
vi.mock('../api/_lib/enriquecer.js', () => ({
  UA: 'test',
  reglasRobots: async () => ({ prohibidas: [], todoFuera: false }),
  permitida: () => true,
}))

const {
  puntuaHtml, anioCopyright, noEsWeb, esAparcada, pareceCadena, generadorDe, diagnosticoWeb, UMBRAL,
} = await import('../api/_lib/web-antigua.js')

const MODERNA = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<meta name="generator" content="WordPress 6.4.2"></head><body><main>Joyería artesana</main>
<footer>© 2026 Joyería Pérez · Todos los derechos reservados</footer></body></html>`

const VIEJA = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html><head><meta name="generator" content="Microsoft FrontPage 6.0">
<script src="js/jquery-1.4.2.min.js"></script></head>
<body bgcolor="#000000"><center><font face="Arial" size="2">Bienvenidos</font></center>
<table><tr><td width="200">a</td><td width="300">b</td><td height="20">c</td></tr></table>
<p>Copyright &copy; 2011 Joyería López</p></body></html>`

const resp = (html, { status = 200, url = 'https://joyeria.es/', tipo = 'text/html; charset=utf-8', cabeceras = {} } = {}) => ({
  status, url,
  headers: { get: (k) => ({ 'content-type': tipo, ...cabeceras })[k.toLowerCase()] ?? null },
  text: async () => html,
})

describe('puntuaHtml', () => {
  it('una web actual no llega al umbral', () => {
    const r = puntuaHtml(MODERNA, { https: true, anioActual: 2026 })
    expect(r.puntos).toBeLessThan(UMBRAL)
    expect(r.anioCopyright).toBe(2026)
  })

  it('una web de los 2000 suma de sobra y dice por qué', () => {
    const r = puntuaHtml(VIEJA, { https: false, anioActual: 2026 })
    expect(r.puntos).toBeGreaterThanOrEqual(UMBRAL)
    const todo = r.motivos.join(' | ')
    expect(todo).toMatch(/móvil/)
    expect(todo).toMatch(/https/)
    expect(todo).toMatch(/© 2011/)
    expect(todo).toMatch(/FrontPage/)
    expect(todo).toMatch(/librerías/)
    expect(todo).toMatch(/HTML anterior a 2014/)
    expect(todo).toMatch(/tablas/)
  })

  it('el © antiguo solo no basta para llamarla anticuada', () => {
    const html = MODERNA.replace('© 2026', '© 2019')
    const r = puntuaHtml(html, { https: true, anioActual: 2026 })
    expect(r.motivos.join()).toMatch(/2019/)
    expect(r.puntos).toBeLessThan(UMBRAL)
  })

  it('WordPress 4 y Joomla 1.5 cuentan; WordPress 6 no', () => {
    const wp4 = MODERNA.replace('WordPress 6.4.2', 'WordPress 4.9.8')
    const joomla = MODERNA.replace('WordPress 6.4.2', 'Joomla! 1.5 - Open Source Content Management')
    expect(puntuaHtml(wp4, { anioActual: 2026 }).motivos.join()).toMatch(/WordPress 4/)
    expect(puntuaHtml(joomla, { anioActual: 2026 }).motivos.join()).toMatch(/Joomla! 1\.5/)
    expect(puntuaHtml(MODERNA, { anioActual: 2026 }).motivos).toEqual([])
  })

  it('Last-Modified de hace años suma', () => {
    const r = puntuaHtml(MODERNA, { anioActual: 2026, ultimaModificacion: 'Tue, 03 Mar 2015 10:00:00 GMT' })
    expect(r.motivos.join()).toMatch(/2015/)
  })
})

describe('señales sueltas', () => {
  it('anioCopyright coge el año más alto pegado a la marca, no «desde 1952»', () => {
    expect(anioCopyright('<p>Desde 1952 en Valencia</p><p>© 2009-2016 Joyería</p>')).toBe(2016)
    expect(anioCopyright('<p>Desde 1952</p>')).toBe(null)
    expect(anioCopyright('<p>2014 Todos los derechos reservados</p>')).toBe(2014)
  })

  it('noEsWeb reconoce redes y fichas', () => {
    expect(noEsWeb('https://www.instagram.com/joyerialopez/')).toBe('Instagram')
    expect(noEsWeb('https://m.facebook.com/joyeria')).toBe('Facebook')
    expect(noEsWeb('https://joyeria-lopez.business.site/')).toMatch(/Google/)
    expect(noEsWeb('https://joyerialopez.es')).toBe(null)
  })

  it('esAparcada solo con páginas que son poco más que el cartel', () => {
    expect(esAparcada('<h1>This domain is for sale!</h1>')).toBe(true)
    expect(esAparcada('<h1>Apache2 Ubuntu Default Page</h1>')).toBe(true)
    expect(esAparcada('<p>Web en construcción</p>')).toBe(true)
    const larga = `<p>${'Joyería artesana con taller propio. '.repeat(100)}</p><p>Web en construcción</p>`
    expect(esAparcada(larga)).toBe(false)
  })

  it('pareceCadena con frases de franquicia, no con una tienda normal', () => {
    expect(pareceCadena('<p>Abre tu propia joyería con nuestra franquicia</p>')).toBeTruthy()
    expect(pareceCadena('<p>Más de 120 tiendas en España</p>')).toBeTruthy()
    expect(pareceCadena('<p>Red de oficinas en toda España</p>')).toBeTruthy()
    expect(pareceCadena('<p>Visita nuestra tienda en la calle Colón</p>')).toBe(null)
  })

  it('generadorDe lee el meta en cualquier orden de atributos', () => {
    expect(generadorDe('<meta content="Joomla! 3.9" name="generator">')).toBe('Joomla! 3.9')
    expect(generadorDe('<meta name="generator" content="Joomla! 3.9">')).toBe('Joomla! 3.9')
  })
})

describe('diagnosticoWeb', () => {
  beforeEach(() => {
    dnsLookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchPublico.mockReset()
  })

  it('sin web y con solo Instagram → sin_web, sin tocar la red', async () => {
    expect((await diagnosticoWeb('', { anioActual: 2026 })).estado).toBe('sin_web')
    expect((await diagnosticoWeb('https://instagram.com/x', { anioActual: 2026 })).estado).toBe('sin_web')
    expect(fetchPublico).not.toHaveBeenCalled()
  })

  it('dominio que ya no existe → caida', async () => {
    dnsLookup.mockRejectedValue(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))
    const d = await diagnosticoWeb('joyeria-caducada.es', { anioActual: 2026 })
    expect(d.estado).toBe('caida')
    expect(d.motivos[0]).toMatch(/ya no existe/)
  })

  it('IP privada → desconocido, nunca se pide', async () => {
    dnsLookup.mockResolvedValue([{ address: '192.168.1.10', family: 4 }])
    const d = await diagnosticoWeb('https://interna.es', { anioActual: 2026 })
    expect(d.estado).toBe('desconocido')
    expect(fetchPublico).not.toHaveBeenCalled()
  })

  it('web vieja por http → antigua con sus motivos', async () => {
    fetchPublico.mockResolvedValue(resp(VIEJA, { url: 'http://joyeria.es/' }))
    const d = await diagnosticoWeb('http://joyeria.es', { anioActual: 2026 })
    expect(d.estado).toBe('antigua')
    expect(d.motivos.join()).toMatch(/https/)
    expect(d.cadena).toBe(null)
  })

  it('web moderna → actual', async () => {
    fetchPublico.mockResolvedValue(resp(MODERNA))
    expect((await diagnosticoWeb('https://joyeria.es', { anioActual: 2026 })).estado).toBe('actual')
  })

  it('franquicia → se marca cadena', async () => {
    fetchPublico.mockResolvedValue(resp(MODERNA.replace('Joyería artesana', 'Más de 80 tiendas. Abre tu franquicia')))
    expect((await diagnosticoWeb('https://cadena.es', { anioActual: 2026 })).cadena).toBeTruthy()
  })

  it('certificado roto → antigua, mirando la versión http', async () => {
    fetchPublico
      .mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } }))
      .mockResolvedValueOnce(resp(MODERNA, { url: 'http://joyeria.es/' }))
    const d = await diagnosticoWeb('https://joyeria.es', { anioActual: 2026 })
    expect(d.estado).toBe('antigua')
    expect(d.motivos[0]).toMatch(/certificado/)
  })

  it('no carga dos veces → caida; antibots → desconocido; 404 → caida; aparcado → caida', async () => {
    fetchPublico.mockRejectedValue(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))
    expect((await diagnosticoWeb('https://a.es', { anioActual: 2026 })).estado).toBe('caida')
    expect(fetchPublico).toHaveBeenCalledTimes(2)

    fetchPublico.mockReset().mockResolvedValue(resp('<title>Just a moment...</title> cloudflare', { status: 503 }))
    expect((await diagnosticoWeb('https://b.es', { anioActual: 2026 })).estado).toBe('desconocido')

    fetchPublico.mockReset().mockResolvedValue(resp('Not found', { status: 404 }))
    expect((await diagnosticoWeb('https://c.es', { anioActual: 2026 })).estado).toBe('caida')

    fetchPublico.mockReset().mockResolvedValue(resp('<h1>Este dominio ha sido registrado por Arsys</h1>'))
    expect((await diagnosticoWeb('https://d.es', { anioActual: 2026 })).estado).toBe('caida')
  })
})
