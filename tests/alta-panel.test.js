// El alta en HELM por el lado del navegador: los campos compartidos
// (src/helm/onboarding/Campos.jsx), la página pública /alta/<token>
// (src/pages/AltaHelm.jsx), el recuadro del enlace en Onboarding y la ruta de
// onboardingApi.enlaceAlta. Sin red ni navegador: las vistas se pintan a texto
// con react-dom/server.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../src/utils/supabase.js', () => ({ supabase: {} }))

const { FieldInput, TableInput } = await import('../src/helm/onboarding/Campos.jsx')
const { VistaAlta } = await import('../src/pages/AltaHelm.jsx')
const { VistaEnlaceAlta } = await import('../src/helm/views/Onboarding.jsx')
const { onboardingApi } = await import('../src/helm/lib.js')
const { ONBOARDING_ALTA } = await import('../src/helm/onboarding/alta.js')

const aTexto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
function pinta(componente, props) {
  const html = renderToStaticMarkup(createElement(componente, props))
  return { html, texto: aTexto(html) }
}

const CAMPOS = ONBOARDING_ALTA.sections.flatMap(s => s.fields)
const campo = (key) => CAMPOS.find(f => f.key === key)
const ULTIMO = ONBOARDING_ALTA.sections.length - 1

describe('Campos: los mismos inputs del panel, con límites solo si se piden', () => {
  it('cada tipo pinta las clases de siempre', () => {
    expect(pinta(FieldInput, { field: campo('nombre'), value: 'Muny', onChange() {} }).html).toMatch(/^<input class="helm-input" value="Muny"\/>$/)
    expect(pinta(FieldInput, { field: campo('que_haces'), value: '', onChange() {} }).html).toContain('class="helm-input helm-onb-area"')
    expect(pinta(FieldInput, { field: campo('camara'), value: 7, onChange() {} }).html).toContain('helm-onb-scale-n on')
    expect(pinta(FieldInput, { field: campo('antiguedad'), value: 'De 2 a 5 años', onChange() {} }).html).toContain('helm-onb-opt on')
    const multi = pinta(FieldInput, { field: campo('objetivo'), value: ['Más leads', 'Más ventas'], onChange() {} }).html
    expect(multi.match(/helm-onb-opt on/g)).toHaveLength(2)
    expect(pinta(FieldInput, { field: campo('servicios'), value: [], onChange() {} }).html).toContain('helm-onb-addrow')
  })

  it('en el panel (sin límites) no hay maxLength ni id', () => {
    const { html } = pinta(FieldInput, { field: campo('nombre'), value: '', onChange() {} })
    expect(html).not.toContain('maxLength')
    expect(html).not.toContain('maxlength')
    expect(html).not.toContain('id=')
  })

  it('con límites: texto 300, largo 5000, celdas 300 y el id para la etiqueta', () => {
    const limites = { text: 300, long: 5000, filas: 20 }
    expect(pinta(FieldInput, { field: campo('nombre'), value: '', onChange() {}, limites, id: 'x' }).html).toContain('maxLength="300"')
    expect(pinta(FieldInput, { field: campo('nombre'), value: '', onChange() {}, limites, id: 'x' }).html).toContain('id="x"')
    expect(pinta(FieldInput, { field: campo('que_haces'), value: '', onChange() {}, limites }).html).toContain('maxLength="5000"')
    expect(pinta(FieldInput, { field: campo('redes'), value: [{}], onChange() {}, limites }).html).toContain('maxLength="300"')
  })

  it('una tabla llena (20 filas) ya no ofrece añadir otra', () => {
    const field = campo('redes')
    const filas = Array.from({ length: 20 }, (_, i) => ({ red: `Red ${i}` }))
    expect(pinta(TableInput, { field, value: filas, onChange() {}, limites: { filas: 20 } }).html).not.toContain('helm-onb-addrow')
    expect(pinta(TableInput, { field, value: filas.slice(0, 19), onChange() {}, limites: { filas: 20 } }).html).toContain('helm-onb-addrow')
    // En el panel no hay tope.
    expect(pinta(TableInput, { field, value: filas, onChange() {} }).html).toContain('helm-onb-addrow')
  })
})

describe('la página pública del alta', () => {
  const base = { fase: 'form', perfil: { nombre: 'Muny' }, answers: {}, paso: 0, estado: 'borrador' }

  it('cargando, enlace caducado y fallo de red', () => {
    expect(pinta(VistaAlta, { fase: 'cargando' }).texto).toContain('Abriendo tu alta')
    const caducado = pinta(VistaAlta, { fase: 'caducado', error: { msg: 'Este enlace ha caducado o no es válido. Pide uno nuevo a quien te lo envió.' } }).texto
    expect(caducado).toContain('Este enlace ya no vale')
    expect(caducado).toContain('Pide uno nuevo a quien te lo envió')
    expect(caducado).not.toContain('Siguiente')
    const fallo = pinta(VistaAlta, { fase: 'fallo', error: { msg: 'Error 502' } }).texto
    expect(fallo).toContain('Error 502')
    expect(fallo).toContain('Reintentar')
  })

  it('la primera sección: nombre del perfil, la intro, el paso y sin «Anterior»', () => {
    const { html, texto } = pinta(VistaAlta, base)
    expect(texto).toContain('Alta de Muny en HELM')
    expect(texto).toContain('Unos 15 minutos')
    expect(texto).toContain('Paso 1 de 7')
    expect(texto).toContain('Tu negocio')
    expect(texto).toContain('0 de 40 respondidas')
    expect(texto).toContain('Siguiente')
    expect(texto).not.toContain('Anterior')
    expect(texto).not.toContain('Enviar')
    expect(html).toContain('src="/assets/logos/helm-mark.svg"')
    expect(html).toContain('data-tono="oro"')
    // La etiqueta apunta a su campo, y el campo trae el límite del servidor.
    expect(html).toContain('for="alta-nombre"')
    expect(html).toContain('id="alta-nombre"')
    expect(html).toContain('maxLength="300"')
  })

  it('las 40 preguntas salen, una sección cada vez', () => {
    let preguntas = 0
    for (let paso = 0; paso <= ULTIMO; paso++) {
      const { html, texto } = pinta(VistaAlta, { ...base, paso })
      const sec = ONBOARDING_ALTA.sections[paso]
      expect(texto).toContain(`Paso ${paso + 1} de 7`)
      for (const f of sec.fields) expect(html).toContain(`id="alta-${f.key}-l"`)
      preguntas += (html.match(/class="alta-q/g) || []).length
      // La intro solo en la primera.
      expect(texto.includes('Unos 15 minutos')).toBe(paso === 0)
    }
    expect(preguntas).toBe(40)
  })

  it('cuenta lo respondido y marca la pregunta hecha', () => {
    const answers = { nombre: 'Muny', ambito: ['100 % online'], servicios: [{ nombre: 'Anillo', precio: '90 €' }], camara: 8 }
    const { html, texto } = pinta(VistaAlta, { ...base, answers })
    expect(texto).toContain('4 de 40 respondidas')
    expect(html).toContain('class="alta-q done"')
    expect(texto).toContain('Puedes elegir varias.')
  })

  it('la última sección: lo que falta, con atajos, y el botón de enviar', () => {
    const answers = { nombre: 'Muny', objetivo: ['Más ventas'] }
    const { texto } = pinta(VistaAlta, { ...base, answers, paso: ULTIMO })
    expect(texto).toContain('¿Listo para enviarlo?')
    expect(texto).toContain('Has respondido 2 de 40')
    expect(texto).toContain('Tu negocio · faltan 6')
    expect(texto).toContain('Objetivos · faltan 2')
    expect(texto).toContain('Elige hasta 3.')
    expect(texto).toContain('Anterior')
    expect(texto).toContain('Enviar')
    expect(texto).not.toContain('Siguiente')
  })

  it('sin ninguna respuesta no se puede enviar', () => {
    const { html, texto } = pinta(VistaAlta, { ...base, paso: ULTIMO })
    expect(texto).toContain('Responde al menos una pregunta')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Enviar/)
  })

  it('ya enviado: se avisa con la fecha y se puede volver a enviar', () => {
    const props = { ...base, answers: { nombre: 'Muny' }, estado: 'enviado', enviadoAt: '2026-10-12T10:00:00Z' }
    expect(pinta(VistaAlta, props).texto).toContain('Ya lo enviaste el 12 de octubre de 2026')
    const ultimo = pinta(VistaAlta, { ...props, paso: ULTIMO }).texto
    expect(ultimo).toContain('Volver a enviar')
    expect(ultimo).toContain('¿Lo vuelves a enviar?')
    // El aviso a la agencia solo sale con el primer envío: no se le promete otro.
    expect(ultimo).toContain('le llega al momento a quien te mandó el enlace')
    expect(ultimo).not.toContain('Al enviarlo, avisamos')
    expect(pinta(VistaAlta, { ...base, answers: { nombre: 'Muny' }, paso: ULTIMO }).texto).toContain('Al enviarlo, avisamos')
  })

  it('un error de una pregunta va en ella; uno general, abajo', () => {
    const enCampo = pinta(VistaAlta, { ...base, error: { msg: 'En «1 · ¿Cómo se llama…»: como mucho 300 caracteres.', campo: 'nombre' } })
    expect(enCampo.html).toContain('class="alta-q mal"')
    expect(enCampo.html).toContain('alta-q-error')
    expect(enCampo.html).not.toContain('alta-error')
    const general = pinta(VistaAlta, { ...base, error: { msg: 'No hay conexión: lo que escribes se guardará en cuanto vuelva.' } })
    expect(general.html).toContain('alta-error')
    expect(general.texto).toContain('No hay conexión')
  })

  it('el indicador de guardado', () => {
    expect(pinta(VistaAlta, { ...base, guardado: 'guardando' }).texto).toContain('Guardando…')
    expect(pinta(VistaAlta, { ...base, guardado: 'guardado' }).texto).toContain('Guardado')
    expect(pinta(VistaAlta, { ...base, guardado: 'error' }).texto).toContain('Sin guardar')
    expect(pinta(VistaAlta, { ...base, guardado: 'pendiente' }).texto).not.toContain('Guardado')
  })

  it('la pantalla de gracias', () => {
    const { texto } = pinta(VistaAlta, { fase: 'gracias', perfil: { nombre: 'Muny' } })
    expect(texto).toContain('¡Recibido!')
    expect(texto).toContain('Las respuestas de Muny ya le han llegado')
    expect(texto).toContain('Revisar mis respuestas')
  })
})

describe('el enlace para el cliente, en Onboarding', () => {
  const ENLACE = { url: 'https://helm.s4sf.net/alta/eyJ.abc.def', caduca: '2026-11-14T10:00:00Z' }

  it('sin enlace: el botón para crearlo', () => {
    const { texto } = pinta(VistaEnlaceAlta, { enlace: null })
    expect(texto).toContain('Enlace para tu cliente')
    expect(texto).toContain('Crear enlace')
    expect(texto).not.toContain('WhatsApp')
  })

  it('con enlace: la URL, copiar, WhatsApp con la URL dentro y la caducidad', () => {
    const { html, texto } = pinta(VistaEnlaceAlta, { enlace: ENLACE })
    expect(html).toContain(`value="${ENLACE.url}"`)
    expect(texto).toContain('Copiar')
    expect(texto).toContain('Enviar por WhatsApp')
    const wa = html.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)
    expect(wa).not.toBeNull()
    const mensaje = decodeURIComponent(new URL(wa[1].replace(/&amp;/g, '&')).searchParams.get('text'))
    expect(mensaje).toContain(ENLACE.url)
    expect(mensaje).toContain('40 preguntas')
    expect(texto).toContain('Caduca el 14 de noviembre de 2026')
    expect(texto).not.toContain('Crear enlace')
  })

  it('copiado y error', () => {
    expect(pinta(VistaEnlaceAlta, { enlace: ENLACE, copiado: true }).texto).toContain('Copiado')
    expect(pinta(VistaEnlaceAlta, { enlace: null, error: 'Perfil no encontrado' }).texto).toContain('Perfil no encontrado')
  })
})

describe('onboardingApi.enlaceAlta', () => {
  let llamadas
  beforeEach(() => {
    llamadas = []
    vi.stubGlobal('localStorage', { getItem: (k) => (k === 'bw_admin_jwt' ? 'jwt-de-prueba' : null), removeItem() {} })
    vi.stubGlobal('fetch', vi.fn(async (ruta, opciones) => {
      llamadas.push({ ruta, ...opciones })
      return { status: 200, ok: true, json: async () => ({ url: 'https://helm.s4sf.net/alta/x', caduca: '2026-11-14T10:00:00Z' }) }
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('POST a action=enlace con el perfil y la sesión', async () => {
    const r = await onboardingApi.enlaceAlta('perfil-1')
    expect(r.url).toBe('https://helm.s4sf.net/alta/x')
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].ruta).toBe('/api/onboarding?action=enlace')
    expect(llamadas[0].method).toBe('POST')
    expect(JSON.parse(llamadas[0].body)).toEqual({ clientId: 'perfil-1' })
    expect(llamadas[0].headers.Authorization).toBe('Bearer jwt-de-prueba')
  })
})
