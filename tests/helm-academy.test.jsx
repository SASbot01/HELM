// @vitest-environment jsdom
// HELM Academy (src/pages/HelmAcademy.jsx y helmAcademy/entrega.js): la landing
// ya no tiene formulario. Su botón lleva al quiz de la academia, con la guía y
// la campaña de la visita, y antes de pulsarlo ya dice lo que viene después: el
// plan y el mensaje del equipo en menos de 24 horas. Sin red.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// La campaña de la visita (lo que recuerda el navegador de la primera página).
const origen = vi.hoisted(() => vi.fn(() => ({})))
vi.mock('../src/pages/inicio/socio/origen.js', () => ({ origen }))
const track = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/inicio/socio/track.js', () => ({ track }))
// La página no llama a nadie: si lo hiciera, se vería aquí.
const red = vi.fn(async () => { throw new Error('sin red en los tests') })
vi.stubGlobal('fetch', red)

const { default: HelmAcademy } = await import('../src/pages/HelmAcademy.jsx')
const {
  VSL, CAMPANA, idYoutube, videoDe, guiaDe, tituloGuia, destinoAcademia, enlaceAcademia, enlaceQuiz,
} = await import('../src/pages/helmAcademy/entrega.js')

const VSL_VACIA = { ...VSL }
afterEach(() => {
  cleanup(); track.mockClear(); red.mockClear(); origen.mockReset(); origen.mockReturnValue({})
  Object.assign(VSL, VSL_VACIA)
})

const pinta = (ruta) => render(
  <MemoryRouter initialEntries={[ruta]}>
    <Routes>
      <Route path="/helm-academy" element={<HelmAcademy />} />
    </Routes>
  </MemoryRouter>,
)
const GUIA = 'que-ningun-lead-se-enfrie'
const QUIZ = 'https://academy.helmm.app/aiparatodo'
const QUIZ_GUIA = `https://academy.helmm.app/guia/${GUIA}`
const boton = () => screen.getByRole('link', { name: /Empezar el quiz|Quiero la guía/ })
const conVideo = () => { VSL.youtube = 'https://youtu.be/abcDEF12345' }

describe('a dónde lleva la landing (entrega.js)', () => {
  it('la guía de la dirección solo vale si tiene forma de guía', () => {
    expect(guiaDe(GUIA)).toBe(GUIA)
    for (const mala of [null, undefined, '', 'ab', 'Que-Ningun-Lead', '../admin', '/guia/x', 'a b c', 'x'.repeat(81), 42]) {
      expect(guiaDe(mala)).toBeNull()
      expect(destinoAcademia(mala)).toBe('/aiparatodo')
    }
    expect(destinoAcademia(GUIA)).toBe(`/guia/${GUIA}`)
    expect(enlaceAcademia(GUIA)).toBe(QUIZ_GUIA)
    expect(enlaceAcademia(null)).toBe(QUIZ)
    // El título, solo de las guías que se conocen: una nueva funciona sin él.
    expect(tituloGuia(GUIA)).toBe('Que ningún lead se enfríe')
    expect(tituloGuia('una-guia-nueva')).toBeNull()
    expect(tituloGuia('constructor')).toBeNull()
  })

  it('el enlace al quiz lleva la campaña y nada más: ni datos personales ni claves desconocidas', () => {
    expect(CAMPANA).toEqual(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'])
    expect(enlaceQuiz(null)).toBe(QUIZ)
    expect(enlaceQuiz('../admin', null)).toBe(QUIZ)
    const url = new URL(enlaceQuiz(GUIA, {
      utm_source: 'youtube', utm_campaign: '  leads nov & más  ', utm_content: 'z'.repeat(300), utm_term: 42, fbclid: 'IwAR0abc',
      email: 'noa@example.com', nombre: 'Noa', telefono: '600111222', k: 'mecanismo', guia: 'otra-guia',
    }))
    expect(url.origin + url.pathname).toBe(QUIZ_GUIA)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'youtube', utm_campaign: 'leads nov & más', utm_content: 'z'.repeat(200), fbclid: 'IwAR0abc',
    })
  })

  it('saca el id de YouTube de un id suelto o de cualquiera de sus enlaces', () => {
    for (const v of ['abcDEF12345', 'https://youtu.be/abcDEF12345?si=x', 'https://www.youtube.com/watch?v=abcDEF12345&t=3', 'https://www.youtube.com/embed/abcDEF12345', 'https://youtube.com/shorts/abcDEF12345']) {
      expect(idYoutube(v)).toBe('abcDEF12345')
    }
    expect(idYoutube('')).toBeNull()
    expect(idYoutube('https://vimeo.com/123456')).toBeNull()
  })

  it('pinta YouTube si lo hay, si no el archivo propio, y si no nada', () => {
    expect(videoDe({ youtube: 'abcDEF12345', mp4: '/v.mp4' })).toEqual({ tipo: 'youtube', id: 'abcDEF12345' })
    expect(videoDe({ youtube: '', mp4: '/v.mp4' })).toEqual({ tipo: 'mp4', src: '/v.mp4' })
    expect(videoDe({ youtube: '', mp4: '' })).toBeNull()
  })
})

describe('la landing de HELM Academy', () => {
  it('no tiene formulario: el botón es un enlace al quiz de la academia, en la misma pestaña', () => {
    const { container } = pinta('/helm-academy')
    expect(container.querySelector('form, input, select, textarea')).toBeNull()
    expect(boton().textContent).toContain('Empezar el quiz')
    expect(boton().getAttribute('href')).toBe(QUIZ)
    expect(boton().hasAttribute('target')).toBe(false)
    expect(screen.getByText(/Contesta seis preguntas y/).textContent).toBe('Es gratis. Contesta seis preguntas y entras con tu plan.')
    // Ya no lleva al Skool, ni lo nombra.
    expect(container.innerHTML).not.toMatch(/skool/i)
    expect(red).not.toHaveBeenCalled()
  })

  it('con ?guia= lleva a esa guía en la academia y dice cuál es', () => {
    pinta(`/helm-academy?guia=${GUIA}`)
    expect(boton().textContent).toContain('Quiero la guía')
    expect(boton().getAttribute('href')).toBe(QUIZ_GUIA)
    expect(screen.getByText(/Contesta seis preguntas y/).textContent).toBe('Es gratis. Contesta seis preguntas y te abrimos la guía «Que ningún lead se enfríe».')
    expect(screen.getAllByText('«Que ningún lead se enfríe»')).toHaveLength(2)
  })

  it('una guía nueva funciona sin título, y una ?guia= que no tiene forma de guía se ignora', () => {
    pinta('/helm-academy?guia=una-guia-nueva')
    expect(boton().getAttribute('href')).toBe('https://academy.helmm.app/guia/una-guia-nueva')
    expect(screen.getByText(/Contesta seis preguntas y/).textContent).toBe('Es gratis. Contesta seis preguntas y te abrimos la guía.')
    cleanup()
    pinta('/helm-academy?guia=..%2Fadmin')
    expect(boton().textContent).toContain('Empezar el quiz')
    expect(boton().getAttribute('href')).toBe(QUIZ)
  })

  it('pasa al quiz la campaña de la dirección (utm_* y fbclid), y nada más', () => {
    pinta(`/helm-academy?guia=${GUIA}&utm_source=youtube&utm_medium=video&utm_campaign=leads%20nov&utm_content=v1&utm_term=crm&fbclid=IwAR0abc&email=noa%40example.com&nombre=Noa&k=mecanismo`)
    const url = new URL(boton().getAttribute('href'))
    expect(url.origin + url.pathname).toBe(QUIZ_GUIA)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'youtube', utm_medium: 'video', utm_campaign: 'leads nov', utm_content: 'v1', utm_term: 'crm', fbclid: 'IwAR0abc',
    })
  })

  it('sin campaña en la dirección usa la de la visita (quien entró por la bio); la de la dirección manda', () => {
    origen.mockReturnValue({ utm_source: 'instagram', utm_medium: 'bio', k: 'mecanismo' })
    pinta('/helm-academy')
    expect(Object.fromEntries(new URL(boton().getAttribute('href')).searchParams)).toEqual({ utm_source: 'instagram', utm_medium: 'bio' })
    cleanup()
    pinta('/helm-academy?utm_source=youtube&fbclid=IwAR0abc')
    expect(Object.fromEntries(new URL(boton().getAttribute('href')).searchParams)).toMatchObject({ utm_source: 'youtube', fbclid: 'IwAR0abc' })
  })

  it('antes de pulsar ya sabe lo que viene: el quiz, su plan y que le escribimos en menos de 24 horas', () => {
    pinta('/helm-academy')
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Contestas el quiz', 'Entras con tu plan', 'Te escribimos por WhatsApp',
    ])
    const espera = screen.getByText(/En menos de 24 horas te escribe una persona del equipo de Silvestre AI, para ayudarte con el primer paso\./)
    expect(espera.textContent).toContain('No tienes que hacer nada más.')
  })

  it('el clic en el botón queda medido', () => {
    pinta('/helm-academy')
    boton().addEventListener('click', (ev) => ev.preventDefault())   // jsdom no navega
    fireEvent.click(boton())
    expect(track).toHaveBeenCalledWith('clic_cta', { donde: 'ha-quiz' })
  })

  it('el vídeo es opcional: sin subir no sale; subido, va encima del botón y no carga hasta el play', () => {
    const { container } = pinta('/helm-academy')
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('iframe, video')).toBeNull()
    cleanup()
    conVideo()
    const { container: c } = pinta('/helm-academy')
    const play = screen.getByRole('button', { name: /Ver el vídeo/ })
    expect(play.compareDocumentPosition(boton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(c.querySelector('iframe')).toBeNull()
    fireEvent.click(play)
    expect(c.querySelector('iframe').getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0&playsinline=1')
    expect(track.mock.calls.filter(([, d]) => d.donde === 'ha-video')).toHaveLength(1)
  })

  it('con un archivo propio usa el vídeo del navegador, y el play se mide una sola vez', () => {
    VSL.mp4 = '/helm-academy/vsl.mp4'
    const { container } = pinta('/helm-academy')
    expect(container.querySelector('video source').getAttribute('src')).toBe('/helm-academy/vsl.mp4')
    fireEvent.play(container.querySelector('video'))
    fireEvent.play(container.querySelector('video'))
    expect(track.mock.calls.filter(([, d]) => d.donde === 'ha-video')).toHaveLength(1)
  })
})
