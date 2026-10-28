// El alta pública sin enlace (helm.s4sf.net/alta) por el lado del navegador:
// la llave guardada en este navegador y los datos del primer paso
// (src/pages/altaPublica.js), la página en modo público (VistaAlta con
// `publica`), la bandeja «Altas recibidas» del tablero de Perfiles y su cajón
// (src/helm/AltasRecibidas.jsx), la línea del enlace en Onboarding y las rutas
// de altasApi. Sin red ni navegador: las vistas se pintan a texto con
// react-dom/server y el almacén es un Map.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// El panel lee la agencia del perfil por la pasarela: aquí, una tabla de un perfil.
vi.mock('../src/utils/supabase.js', () => {
  const consulta = () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { agencia_id: 'ag-otra' }, error: null }),
    }
    return q
  }
  return { supabase: { from: consulta } }
})

const publicaMod = await import('../src/pages/altaPublica.js')
const {
  LLAVE, agenciaDeLaUrl, leerAlta, recordarAlta, olvidarAlta, validarDatos, origenDeLaVisita, estaEnviada, DATOS_VACIOS,
  textoPrivacidad, PRIVACIDAD_VERSION,
} = publicaMod
const { VistaAlta } = await import('../src/pages/AltaHelm.jsx')
const { VistaAltas, VistaDetalleAlta } = await import('../src/helm/AltasRecibidas.jsx')
const { VistaEnlaceAlta } = await import('../src/helm/views/Onboarding.jsx')
const { altasApi, enlaceAltaPublica, enlaceAltaPublicaDelPerfil, createProfile, slugify } = await import('../src/helm/lib.js')
const perfilNuevo = await import('../src/helm/perfilNuevo.js')
const pipelineMod = await import('../src/helm/crm/pipeline.js')
const { ONBOARDING_ALTA } = await import('../src/helm/onboarding/alta.js')

const aTexto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
function pinta(componente, props) {
  const html = renderToStaticMarkup(createElement(componente, props))
  return { html, texto: aTexto(html) }
}

// Un localStorage de mentira, y uno que lanza en todo (ventana privada de
// Safari antiguo, datos del sitio bloqueados).
function almacen(inicial = {}) {
  const m = new Map(Object.entries(inicial))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    m,
  }
}
const roto = { getItem() { throw new Error('SecurityError') }, setItem() { throw new Error('QuotaExceeded') }, removeItem() { throw new Error('SecurityError') } }
const MAÑANA = new Date(Date.now() + 86_400_000).toISOString()
const AYER = new Date(Date.now() - 86_400_000).toISOString()

describe('la llave del alta, en este navegador', () => {
  it('se guarda y se lee con su caducidad y su agencia', () => {
    const ls = almacen()
    expect(recordarAlta({ t: 'jwt.1', caduca: MAÑANA, agencia: 'muny' }, ls)).toBe(true)
    expect(JSON.parse(ls.m.get(LLAVE))).toEqual({ t: 'jwt.1', caduca: MAÑANA, agencia: 'muny' })
    expect(leerAlta(null, ls)).toEqual({ t: 'jwt.1', caduca: MAÑANA, agencia: 'muny' })
    expect(leerAlta('muny', ls)?.t).toBe('jwt.1')
  })

  it('caducada, se olvida', () => {
    const ls = almacen({ [LLAVE]: JSON.stringify({ t: 'jwt.viejo', caduca: AYER }) })
    expect(leerAlta(null, ls)).toBeNull()
    expect(ls.m.has(LLAVE)).toBe(false)
  })

  it('con otra agencia en la URL es otra alta; sin ?a= se retoma la que haya', () => {
    const ls = almacen({ [LLAVE]: JSON.stringify({ t: 'jwt.1', caduca: MAÑANA, agencia: 'muny' }) })
    expect(leerAlta('otra', ls)).toBeNull()
    expect(ls.m.has(LLAVE)).toBe(true)
    expect(leerAlta(null, ls)?.t).toBe('jwt.1')
    const sinAgencia = almacen({ [LLAVE]: JSON.stringify({ t: 'jwt.2', caduca: MAÑANA, agencia: null }) })
    expect(leerAlta('muny', sinAgencia)).toBeNull()
  })

  it('lo que no es una llave no se usa; un token a pelo, sí', () => {
    expect(leerAlta(null, almacen({ [LLAVE]: 'eyJ.abc.def' }))?.t).toBe('eyJ.abc.def')
    expect(leerAlta(null, almacen({ [LLAVE]: JSON.stringify({ t: 42 }) }))).toBeNull()
    expect(leerAlta(null, almacen({ [LLAVE]: JSON.stringify({ t: 'x'.repeat(3000) }) }))).toBeNull()
    expect(leerAlta(null, almacen())).toBeNull()
  })

  it('sin almacén, o con uno que lanza, la página sigue: nada guardado y sin errores', () => {
    expect(leerAlta(null, roto)).toBeNull()
    expect(recordarAlta({ t: 'jwt.1' }, roto)).toBe(false)
    expect(() => olvidarAlta(roto)).not.toThrow()
    expect(leerAlta(null, null)).toBeNull()
    expect(recordarAlta({ t: 'jwt.1' }, null)).toBe(false)
    expect(() => olvidarAlta(null)).not.toThrow()
  })

  it('olvidarla la borra', () => {
    const ls = almacen({ [LLAVE]: JSON.stringify({ t: 'jwt.1' }) })
    olvidarAlta(ls)
    expect(ls.m.has(LLAVE)).toBe(false)
  })

  it('por defecto usa localStorage, si lo hay', () => {
    const ls = almacen()
    vi.stubGlobal('localStorage', ls)
    try {
      expect(recordarAlta({ t: 'jwt.g', caduca: MAÑANA })).toBe(true)
      expect(leerAlta()?.t).toBe('jwt.g')
      olvidarAlta()
      expect(leerAlta()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('la agencia de ?a= y el origen de la visita', () => {
  it('el slug, en minúsculas; uno con otra pinta no vale', () => {
    expect(agenciaDeLaUrl('?a=Silvestreai')).toBe('silvestreai')
    expect(agenciaDeLaUrl('?a=detras-de-camara-2')).toBe('detras-de-camara-2')
    expect(agenciaDeLaUrl('?a=../admin')).toBeNull()
    expect(agenciaDeLaUrl('?a=-x')).toBeNull()
    expect(agenciaDeLaUrl('?a=' + 'x'.repeat(61))).toBeNull()
    expect(agenciaDeLaUrl('')).toBeNull()
    expect(agenciaDeLaUrl('?utm_source=ig')).toBeNull()
  })

  it('solo las utm_* que traen algo y la página de antes, recortadas', () => {
    const o = origenDeLaVisita('?a=muny&utm_source=ig&utm_medium=&utm_campaign=' + 'c'.repeat(200) + '&otra=1', 'https://instagram.com/' + 'r'.repeat(400))
    expect(Object.keys(o).sort()).toEqual(['referrer', 'utm_campaign', 'utm_source'])
    expect(o.utm_source).toBe('ig')
    expect(o.utm_campaign).toHaveLength(120)
    expect(o.referrer).toHaveLength(300)
    expect(origenDeLaVisita('', '')).toEqual({})
  })
})

describe('los datos del primer paso: lo mismo que pide el servidor', () => {
  const buenos = { nombre: '  Ana   Carbonell ', email: ' ana@muny.es ', telefono: '+34 600 11 22 33', acepta: true, website: '' }

  it('buenos: limpios y sin la casilla ni la trampa', () => {
    expect(validarDatos(buenos)).toEqual({ limpio: { nombre: 'Ana Carbonell', email: 'ana@muny.es', telefono: '+34 600 11 22 33' } })
  })

  it('vacíos: un motivo por campo', () => {
    const { errores } = validarDatos(DATOS_VACIOS)
    expect(Object.keys(errores).sort()).toEqual(['acepta', 'email', 'nombre', 'telefono'])
  })

  it('nombre de 2 a 120', () => {
    expect(validarDatos({ ...buenos, nombre: 'A' }).errores.nombre).toBeTruthy()
    expect(validarDatos({ ...buenos, nombre: 'Al' }).limpio).toBeTruthy()
    expect(validarDatos({ ...buenos, nombre: 'a'.repeat(121) }).errores.nombre).toContain('120')
  })

  it('email con pinta de email y de 200 como mucho', () => {
    for (const malo of ['ana', 'ana@', 'ana@muny', '@muny.es', 'ana muny@x.es', `${'a'.repeat(195)}@muny.es`]) {
      expect(validarDatos({ ...buenos, email: malo }).errores?.email, malo).toBeTruthy()
    }
    expect(validarDatos({ ...buenos, email: 'ana.c+alta@sub.muny.es' }).limpio).toBeTruthy()
  })

  it('teléfono de 6 a 20 cifras, con espacios, guiones o prefijo', () => {
    expect(validarDatos({ ...buenos, telefono: '12345' }).errores.telefono).toBeTruthy()
    expect(validarDatos({ ...buenos, telefono: '123-456' }).limpio).toBeTruthy()
    expect(validarDatos({ ...buenos, telefono: '1'.repeat(21) }).errores.telefono).toBeTruthy()
    expect(validarDatos({ ...buenos, telefono: 'sin número' }).errores.telefono).toBeTruthy()
  })

  it('el teléfono, solo con lo que lleva un teléfono: con un enlace dentro no pasa', () => {
    for (const malo of ['600112233 https://ev.il/x', '600112233 ev.il', '600 11 22 33 @yo']) {
      expect(validarDatos({ ...buenos, telefono: malo }).errores?.telefono, malo).toBeTruthy()
    }
    expect(validarDatos({ ...buenos, telefono: '(+34) 600-112-233' }).limpio).toBeTruthy()
  })

  it('la casilla tiene que ser true, no algo que lo parezca', () => {
    expect(validarDatos({ ...buenos, acepta: 'true' }).errores.acepta).toBeTruthy()
    expect(validarDatos({ ...buenos, acepta: 1 }).errores.acepta).toBeTruthy()
  })
})

describe('enviada o no, en los dos modos', () => {
  it('con enlace (enviado/borrador) y en /alta (completed/draft, y enviada al guardar)', () => {
    expect(estaEnviada({ estado: 'enviado', enviado_at: '2026-10-15T10:00:00Z' })).toBe(true)
    expect(estaEnviada({ estado: 'borrador', enviado_at: null })).toBe(false)
    expect(estaEnviada({ estado: 'completed', enviado_at: '2026-10-15T10:00:00Z' })).toBe(true)
    expect(estaEnviada({ estado: 'draft', enviado_at: null })).toBe(false)
    expect(estaEnviada({ ok: true, estado: 'enviada', enviado_at: '2026-10-15T10:00:00Z' })).toBe(true)
    expect(estaEnviada({ ok: true, estado: 'borrador', enviado_at: null })).toBe(false)
    expect(estaEnviada(null)).toBe(false)
  })
})

describe('la página en /alta: «Tus datos»', () => {
  const RECEPTORA = { nombre: 'Muny Estudio', slug: 'muny', encontrada: true }
  const base = { publica: true, fase: 'datos', datos: DATOS_VACIOS, receptora: RECEPTORA, conAlta: false }

  it('los tres datos con su etiqueta, la casilla y «Empezar»', () => {
    const { html, texto } = pinta(VistaAlta, base)
    expect(texto).toContain('Alta en HELM')
    expect(texto).toContain('Tus datos')
    for (const [id, etiqueta, auto] of [['nombre', 'Nombre y apellidos', 'name'], ['email', 'Email', 'email'], ['telefono', 'WhatsApp', 'tel']]) {
      expect(html).toContain(`for="alta-dato-${id}"`)
      expect(html).toMatch(new RegExp(`<input id="alta-dato-${id}"[^>]*autoComplete="${auto}"`))
      expect(texto).toContain(etiqueta)
    }
    expect(html).toContain('type="email"')
    expect(html).toContain('type="tel"')
    expect(texto).toContain('Empezar')
    expect(texto).not.toContain('Siguiente')
    expect(texto).not.toContain('Paso 1 de 7')
  })

  it('la casilla nombra a la agencia que recibe los datos, dice para qué y cómo borrarlos', () => {
    const { html, texto } = pinta(VistaAlta, base)
    expect(html).toMatch(/<input id="alta-acepta" type="checkbox"/)
    expect(html).toContain('for="alta-acepta"')
    expect(texto).toContain('Acepto que Muny Estudio reciba estos datos y mis respuestas a través de HELM')
    expect(texto).toContain('conocer mi negocio')
    expect(texto).toContain('contactarme por email o WhatsApp')
    expect(texto).toContain('desde esta misma página mientras aún no tenga perfil, o pidiéndoselo a Muny Estudio')
    expect(texto).not.toContain('la agencia que me ha pasado este enlace')
    expect(texto).toContain(textoPrivacidad('Muny Estudio'))
    expect(PRIVACIDAD_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('si el ?a= no es de ninguna agencia, lo dice antes y nombra a la que lo recibiría', () => {
    const otra = { nombre: 'Silvestre AI', slug: 'silvestreai', encontrada: false }
    const { html, texto } = pinta(VistaAlta, { ...base, receptora: otra })
    expect(html).toContain('alta-aviso-mal')
    expect(texto).toContain('no es de ninguna agencia de HELM')
    expect(texto).toContain('los recibirá Silvestre AI')
    expect(texto).toContain('Acepto que Silvestre AI reciba')
    expect(pinta(VistaAlta, base).html).not.toContain('alta-aviso-mal')
  })

  it('mientras se pregunta a quién le llega, se espera (sin «tu alta», que aún no hay)', () => {
    expect(pinta(VistaAlta, { publica: true, fase: 'cargando', conAlta: false }).texto).toContain('Abriendo el formulario…')
    expect(pinta(VistaAlta, { publica: true, fase: 'cargando' }).texto).toContain('Abriendo tu alta…')
  })

  it('la trampa: oculta a la vista, al tabulador y a los lectores de pantalla', () => {
    const { html } = pinta(VistaAlta, base)
    const trampa = html.match(/<div class="alta-trampa" aria-hidden="true">(.*?)<\/div>/)
    expect(trampa).not.toBeNull()
    const input = trampa[1].match(/<input[^>]*>/)[0]
    expect(input).toContain('name="website"')
    expect(input).toContain('tabindex="-1"')
    expect(input).toContain('autoComplete="off"')
  })

  it('cada error junto a su campo; uno general, abajo', () => {
    const errores = { email: 'Revisa el email: parece que le falta algo.', acepta: 'Para seguir, marca la casilla.' }
    const { html, texto } = pinta(VistaAlta, { ...base, erroresDatos: errores })
    expect(texto).toContain('Revisa el email')
    expect(texto).toContain('Para seguir, marca la casilla.')
    expect(html).toMatch(/<input id="alta-dato-email"[^>]*aria-invalid="true"[^>]*aria-describedby="alta-dato-email-error"/)
    expect(html).toContain('class="alta-check mal"')
    expect(html).not.toMatch(/<input id="alta-dato-nombre"[^>]*aria-invalid/)
    const general = pinta(VistaAlta, { ...base, error: { msg: 'Se han empezado demasiadas altas seguidas desde esta conexión.' } })
    expect(general.html).toContain('alta-error')
    expect(general.texto).toContain('demasiadas altas seguidas')
  })

  it('mientras se crea, el botón espera', () => {
    const { html, texto } = pinta(VistaAlta, { ...base, creando: true })
    expect(texto).toContain('Un momento…')
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/)
  })

  it('lo escrito sigue en los campos', () => {
    const { html } = pinta(VistaAlta, { ...base, datos: { ...DATOS_VACIOS, nombre: 'Ana', acepta: true } })
    expect(html).toMatch(/<input id="alta-dato-nombre"[^>]*value="Ana"/)
    expect(html).toMatch(/<input id="alta-acepta" type="checkbox"[^>]*checked=""/)
  })
})

describe('la página en /alta: las preguntas, el final y lo que puede pasar', () => {
  const base = {
    publica: true, fase: 'form', answers: { nombre: 'Muny' }, paso: 0, estado: 'borrador',
    agencia: { nombre: 'Silvestre IA' }, contacto: { nombre: 'Ana Carbonell', email: 'ana@muny.es', telefono: '600112233' },
    recordada: true,
  }
  const ULTIMO = ONBOARDING_ALTA.sections.length - 1

  it('en cada paso, a quién le llega y «Borrar mis datos» (con enlace, no)', () => {
    const { html, texto } = pinta(VistaAlta, base)
    expect(texto).toContain('Tus datos y tus respuestas los recibe Silvestre IA, a través de HELM.')
    expect(texto).toContain('Borrar mis datos')
    expect(html).toMatch(/<p class="alta-pie alta-borrar">/)
    expect(pinta(VistaAlta, { ...base, borrando: true }).texto).toContain('Borrando…')
    expect(pinta(VistaAlta, { ...base, publica: false }).texto).not.toContain('Borrar mis datos')
  })

  it('borrada: se dice, y se puede empezar otra', () => {
    const { texto } = pinta(VistaAlta, { publica: true, fase: 'borrada' })
    expect(texto).toContain('Hemos borrado tus datos')
    expect(texto).toContain('ya no están en HELM')
    expect(texto).toContain('Empezar otra alta')
  })

  it('las mismas 40 preguntas, con «¿No eres tú? Empezar de nuevo»', () => {
    const { html, texto } = pinta(VistaAlta, base)
    expect(texto).toContain('Alta de tu negocio en HELM')
    expect(texto).toContain('Hola, Ana.')
    expect(texto).toContain('¿No eres tú? Empezar de nuevo')
    expect(texto).toContain('Paso 1 de 7')
    expect(texto).toContain('1 de 40 respondidas')
    expect(html).toContain('id="alta-nombre"')
    // Con enlace no sale: ahí el enlace es de un perfil, no de este navegador.
    expect(pinta(VistaAlta, { ...base, publica: false }).texto).not.toContain('¿No eres tú?')
  })

  it('el final dice a quién le llega y cómo se vuelve', () => {
    expect(pinta(VistaAlta, { ...base, paso: ULTIMO }).texto)
      .toContain('Al enviarlo, avisamos a Silvestre IA. Podrás volver desde este mismo navegador')
    expect(pinta(VistaAlta, { ...base, paso: ULTIMO, recordada: false }).texto)
      .toContain('mientras no cierres esta página')
    expect(pinta(VistaAlta, { ...base, paso: ULTIMO, agencia: null }).texto).toContain('avisamos al equipo')
    expect(pinta(VistaAlta, { ...base, paso: ULTIMO, estado: 'enviado' }).texto)
      .toContain('le llega al momento a Silvestre IA')
  })

  it('gracias: a quién le ha llegado y cómo volver', () => {
    const { texto } = pinta(VistaAlta, { ...base, fase: 'gracias' })
    expect(texto).toContain('¡Recibido!')
    expect(texto).toContain('Gracias, Ana. Tus respuestas ya le han llegado a Silvestre IA: te escribirá por email o WhatsApp')
    expect(texto).toContain('helm.s4sf.net/alta desde este mismo navegador')
    expect(texto).toContain('Revisar mis respuestas')
    expect(pinta(VistaAlta, { ...base, fase: 'gracias', agencia: null, contacto: null }).texto)
      .toContain('Gracias. Tus respuestas ya le han llegado al equipo')
  })

  it('caducada: no hay enlace que pedir, se empieza otra', () => {
    const { texto } = pinta(VistaAlta, { publica: true, fase: 'caducado' })
    expect(texto).toContain('Tu alta ya no está disponible')
    expect(texto).toContain('Han pasado más de 30 días')
    expect(texto).toContain('Empezar una nueva')
    expect(texto).not.toContain('Pide uno nuevo')
    // Con enlace, lo de siempre y sin «empezar».
    const enlace = pinta(VistaAlta, { fase: 'caducado' }).texto
    expect(enlace).toContain('Este enlace ya no vale')
    expect(enlace).not.toContain('Empezar una nueva')
  })

  it('si no abre, reintentar y, en /alta con un alta guardada, empezar de nuevo', () => {
    const publica = pinta(VistaAlta, { publica: true, fase: 'fallo', error: { msg: 'Error 500' } }).texto
    expect(publica).toContain('Reintentar')
    expect(publica).toContain('¿No eres tú? Empezar de nuevo')
    expect(pinta(VistaAlta, { fase: 'fallo', error: { msg: 'Error 500' } }).texto).not.toContain('Empezar de nuevo')
    // Sin alta guardada (no se supo a quién iría) no hay nada que «empezar de nuevo».
    expect(pinta(VistaAlta, { publica: true, conAlta: false, fase: 'fallo', error: { msg: 'Error 503' } }).texto).not.toContain('¿No eres tú?')
  })

  it('recogida por el equipo: se dice; lo de «no se ha guardado», solo si venía de guardar', () => {
    const { texto } = pinta(VistaAlta, { ...base, fase: 'recogida', error: { msg: 'Esta alta ya la ha recogido el equipo.', alGuardar: true } })
    expect(texto).toContain('Ya está en manos del equipo')
    expect(texto).toContain('Esta alta ya la ha recogido el equipo.')
    expect(texto).toContain('Lo último que hayas escrito ya no se ha guardado aquí.')
    expect(texto).toContain('cuéntaselo directamente a Silvestre IA')
    expect(texto).toContain('Empezar el alta de otro negocio')
    expect(texto).not.toContain('Siguiente')
    // Al abrirla ya recogida no había nada a medias.
    const alAbrir = pinta(VistaAlta, { ...base, fase: 'recogida', error: { msg: 'Esta alta ya la ha recogido el equipo.' } }).texto
    expect(alAbrir).not.toContain('ya no se ha guardado')
    expect(alAbrir).toContain('cuéntaselo directamente a Silvestre IA')
  })
})

// ── La bandeja del tablero ─────────────────────────────────────────────────
const AG = { id: 'ag-1', nombre: 'Silvestre IA', slug: 'silvestreai' }
const alta = (cambios = {}) => ({
  id: 'a-1', agencia: AG, nombre: 'Ana Carbonell', email: 'ana@muny.es', telefono: '600 11 22 33',
  negocio: 'Muny', estado: 'enviada', enviado_at: '2026-10-14T10:00:00Z', created_at: '2026-10-13T09:00:00Z',
  client_id: null, answers: { nombre: 'Muny' }, ...cambios,
})
const ENLACE = 'https://helm.s4sf.net/alta?a=silvestreai'

describe('Altas recibidas: la bandeja', () => {
  it('cargando y fallo', () => {
    expect(pinta(VistaAltas, { altas: null }).texto).toContain('Cargando')
    const fallo = pinta(VistaAltas, { altas: null, fallo: 'Error 500' }).texto
    expect(fallo).toContain('Error 500')
    expect(fallo).toContain('Reintentar')
    expect(fallo).not.toContain('Todavía no ha llegado ninguna')
  })

  it('vacía: qué es y el enlace público para copiar', () => {
    const { html, texto } = pinta(VistaAltas, { altas: [], enlace: ENLACE })
    expect(texto).toContain('Todavía no ha llegado ninguna')
    expect(texto).toContain('antes de tener perfil en helm.s4sf.net/alta?a=silvestreai')
    expect(html).toContain(`value="${ENLACE}"`)
    expect(texto).toContain('Copiar')
    expect(pinta(VistaAltas, { altas: [], enlace: ENLACE, copiado: true }).texto).toContain('Copiado')
    // Sin la agencia no se ofrece un enlace que mandaría las altas a otra.
    const sin = pinta(VistaAltas, { altas: [], enlace: null })
    expect(sin.html).not.toContain('helm-altas-enlace')
    expect(sin.texto).toContain('Todavía no ha llegado ninguna')
  })

  it('las enviadas, la última primero; las convertidas y descartadas no salen', () => {
    const altas = [
      alta({ id: 'a-1', negocio: 'Muny', enviado_at: '2026-10-12T10:00:00Z' }),
      alta({ id: 'a-2', negocio: 'Estudio Lirio', nombre: 'Lola', enviado_at: '2026-10-14T10:00:00Z' }),
      alta({ id: 'a-3', negocio: 'Ya convertida', estado: 'convertida' }),
      alta({ id: 'a-4', negocio: 'Descartada', estado: 'descartada' }),
      alta({ id: 'a-5', negocio: '', nombre: 'Pepe a medias', estado: 'borrador', enviado_at: null, answers: {} }),
    ]
    const { texto } = pinta(VistaAltas, { altas, enlace: ENLACE })
    expect(texto.indexOf('Estudio Lirio')).toBeGreaterThan(-1)
    expect(texto.indexOf('Estudio Lirio')).toBeLessThan(texto.indexOf('Muny'))
    expect(texto).not.toContain('Ya convertida')
    expect(texto).not.toContain('Descartada')
    expect(texto).not.toContain('Todavía no ha llegado ninguna')
    expect(texto).toContain('1/40')
    // Las de a medias: cuántas, y a la vista solo si se piden.
    expect(texto).toContain('Hay 1 a medias: ha dejado sus datos, pero aún no la ha enviado.')
    expect(texto).not.toContain('Pepe a medias')
    const abiertas = pinta(VistaAltas, { altas, enlace: ENLACE, verMedias: true }).texto
    expect(abiertas).toContain('Pepe a medias')
    expect(abiertas).toContain('se borran solas a los 30 días')
  })

  it('el nombre: el del negocio, el de la pregunta 1 o el de quien la rellena', () => {
    const { texto } = pinta(VistaAltas, {
      altas: [
        alta({ id: 'x', negocio: '', answers: { nombre: 'Desde la pregunta' } }),
        alta({ id: 'y', negocio: '', answers: {}, nombre: 'Solo contacto' }),
      ],
    })
    expect(texto).toContain('Desde la pregunta')
    expect(texto).toContain('Solo contacto')
    // Sin nombre de negocio, el de quien la rellena va de título y no se repite debajo.
    expect(texto.split('Solo contacto')).toHaveLength(2)
  })

  it('con altas de varias agencias (plataforma), cada una dice de cuál', () => {
    const altas = [alta(), alta({ id: 'a-9', agencia: { id: 'ag-2', nombre: 'Detrás de Cámara', slug: 'ddc' } })]
    expect(pinta(VistaAltas, { altas, varias: true }).texto).toContain('Ana Carbonell · Detrás de Cámara')
    expect(pinta(VistaAltas, { altas, varias: false }).texto).not.toContain('Detrás de Cámara')
  })
})

describe('Altas recibidas: el cajón de un alta', () => {
  const CAMPOS = ONBOARDING_ALTA.sections.flatMap(s => s.fields)
  const respuestas = {
    nombre: 'Muny',
    camara: 8,
    ambito: ['En toda España', '100 % online'],
    servicios: [{ nombre: 'Anillo', precio: '90 €' }, {}, { nombre: 'Collar', modalidad: 'Pago único' }],
    antiguedad: 'De 2 a 5 años',
  }

  it('las 40 preguntas en el orden del formulario, con lo respondido y lo que falta', () => {
    const { html, texto } = pinta(VistaDetalleAlta, { alta: alta({ answers: respuestas }) })
    let antes = -1
    for (const f of CAMPOS) {
      const i = texto.indexOf(f.label.replace(/\s+/g, ' '))
      expect(i, f.key).toBeGreaterThan(antes)
      antes = i
    }
    for (const s of ONBOARDING_ALTA.sections) expect(texto).toContain(s.title)
    expect(texto).toContain('8 / 10')
    expect(texto).toContain('En toda España · 100 % online')
    expect(texto).toContain('Producto o servicio: Anillo · Precio: 90 €')
    expect(texto).toContain('Producto o servicio: Collar · Pago único, mensual o a plazos: Pago único')
    expect(texto).toContain('De 2 a 5 años')
    expect((html.match(/class="helm-alta-sin"/g) || [])).toHaveLength(40 - 5)
    expect(texto).toContain('5 de 40 respondidas')
  })

  it('el contacto: quién, cuándo, email y WhatsApp', () => {
    const { html, texto } = pinta(VistaDetalleAlta, { alta: alta() })
    expect(texto).toContain('Muny')
    expect(texto).toContain('Ana Carbonell')
    expect(texto).toContain('Enviada el 14 oct 2026')
    expect(html).toContain('href="mailto:ana@muny.es"')
    expect(html).toContain('href="https://wa.me/34600112233"')
    expect(pinta(VistaDetalleAlta, { alta: alta({ telefono: '+44 7700 900123' }) }).html).toContain('href="https://wa.me/447700900123"')
    expect(pinta(VistaDetalleAlta, { alta: alta({ telefono: '0034 600 11 22 33' }) }).html).toContain('href="https://wa.me/34600112233"')
  })

  it('a medias: lo dice', () => {
    const { texto } = pinta(VistaDetalleAlta, { alta: alta({ estado: 'borrador', enviado_at: null }) })
    expect(texto).toContain('A medias: aún no la ha enviado (empezada el 13 oct 2026)')
  })

  it('crear el perfil o descartar; descartar se confirma', () => {
    const normal = pinta(VistaDetalleAlta, { alta: alta() }).texto
    expect(normal).toContain('Crear perfil')
    expect(normal).toContain('Descartar')
    expect(normal).toContain('«Crear perfil» crea el perfil «Muny» con estas respuestas ya en Onboarding → Alta en HELM.')
    expect(pinta(VistaDetalleAlta, { alta: alta(), ocupado: 'crear' }).texto).toContain('Creando…')
    const confirmar = pinta(VistaDetalleAlta, { alta: alta(), confirmar: true }).texto
    expect(confirmar).toContain('¿Descartarla?')
    expect(confirmar).toContain('Se borran sus datos de contacto y sus respuestas')
    expect(confirmar).toContain('No se puede deshacer')
    expect(confirmar).toContain('Sí, descartar')
    expect(confirmar).not.toContain('Crear perfil')
    expect(pinta(VistaDetalleAlta, { alta: alta(), error: 'No tienes permiso' }).texto).toContain('No tienes permiso')
  })

  it('creado: dónde está y cómo entrar', () => {
    const { texto } = pinta(VistaDetalleAlta, { alta: alta(), creado: { clientId: 'c-1', slug: 'muny' } })
    expect(texto).toContain('Perfil creado: /muny')
    expect(texto).toContain('Abrir el perfil')
    expect(texto).toContain('Seguir con las altas')
    expect(texto).not.toContain('Crear perfil')
  })
})

describe('Onboarding: «¿Aún no tiene perfil?»', () => {
  it('con el enlace de la agencia, la línea y copiar', () => {
    const { texto } = pinta(VistaEnlaceAlta, { enlace: null, publica: ENLACE })
    expect(texto).toContain('¿Aún no tiene perfil? Mándale helm.s4sf.net/alta?a=silvestreai')
    expect(texto).toContain('Copiar')
    expect(pinta(VistaEnlaceAlta, { enlace: null, publica: ENLACE, copiadoPublica: true }).texto).toContain('Copiado')
  })

  it('sin él, nada', () => {
    expect(pinta(VistaEnlaceAlta, { enlace: null }).texto).not.toContain('¿Aún no tiene perfil?')
  })
})

describe('altasApi y el enlace público', () => {
  let llamadas
  let respuesta
  beforeEach(() => {
    llamadas = []
    respuesta = {}
    vi.stubGlobal('localStorage', { getItem: (k) => (k === 'bw_admin_jwt' ? 'jwt-de-prueba' : null), removeItem() {} })
    vi.stubGlobal('fetch', vi.fn(async (ruta, opciones) => {
      llamadas.push({ ruta, ...opciones })
      return { status: 200, ok: true, json: async () => respuesta }
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lista, convertir y descartar, con la sesión', async () => {
    respuesta = { altas: [] }
    await altasApi.lista()
    respuesta = { clientId: 'c-1', slug: 'muny' }
    expect(await altasApi.convertir('a-1')).toEqual({ clientId: 'c-1', slug: 'muny' })
    respuesta = { ok: true }
    await altasApi.descartar('a-1')
    expect(llamadas.map(l => [l.method, l.ruta])).toEqual([
      ['GET', '/api/onboarding?action=altas'],
      ['POST', '/api/onboarding?action=alta-convertir'],
      ['POST', '/api/onboarding?action=alta-descartar'],
    ])
    expect(JSON.parse(llamadas[1].body)).toEqual({ altaId: 'a-1' })
    expect(JSON.parse(llamadas[2].body)).toEqual({ altaId: 'a-1' })
    for (const l of llamadas) expect(l.headers.Authorization).toBe('Bearer jwt-de-prueba')
  })

  it('el enlace lleva el slug de la agencia', () => {
    expect(enlaceAltaPublica('silvestreai')).toBe('https://helm.s4sf.net/alta?a=silvestreai')
    expect(enlaceAltaPublica(null)).toBe('https://helm.s4sf.net/alta')
  })

  it('el de un perfil: el de SU agencia, no el de quien mira', async () => {
    respuesta = { agencia: { id: 'ag-otra', nombre: 'Otra', slug: 'otra' }, plataforma: true }
    expect(await enlaceAltaPublicaDelPerfil('c-1')).toBe('https://helm.s4sf.net/alta?a=otra')
    expect(llamadas[0].ruta).toBe('/api/creditos?action=saldo&agenciaId=ag-otra')
    respuesta = { agencia: null }
    expect(await enlaceAltaPublicaDelPerfil('c-1')).toBeNull()
  })
})

describe('cómo nace un perfil: lo mismo desde el panel que desde el servidor', () => {
  it('una sola lista de etapas: el CRM reexporta las de perfilNuevo', () => {
    expect(pipelineMod.DEFAULT_STAGES).toBe(perfilNuevo.DEFAULT_STAGES)
    expect(pipelineMod.DEFAULT_SUBSTAGES).toBe(perfilNuevo.DEFAULT_SUBSTAGES)
    expect(pipelineMod.PIPELINE_VIRTUAL.stages).toBe(perfilNuevo.DEFAULT_STAGES)
    expect(perfilNuevo.pipelineInicial('c-1')).toEqual({
      client_id: 'c-1', name: 'Pipeline', is_default: true,
      stages: perfilNuevo.DEFAULT_STAGES, substages: perfilNuevo.DEFAULT_SUBSTAGES,
    })
  })

  it('el mismo slugify y la misma fila', () => {
    expect(slugify).toBe(perfilNuevo.slugify)
    expect(slugify('  Joyería Muny & Co. ')).toBe('joyeria-muny-co')
    expect(perfilNuevo.filaPerfilNuevo({ slug: 'muny', name: 'Muny' }))
      .toEqual({ slug: 'muny', name: 'Muny', client_type: 'growth', active: true, is_demo: false })
  })

  it('el panel tampoco deja crear un perfil con la URL de una ruta de la web', async () => {
    await expect(createProfile({ name: 'Alta' })).rejects.toThrow('es de la propia web')
    await expect(createProfile({ name: 'Mi perfil', slug: 'login' })).rejects.toThrow('es de la propia web')
  })
})
