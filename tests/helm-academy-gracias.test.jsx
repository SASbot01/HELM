// @vitest-environment jsdom
// HELM Academy (src/pages/HelmAcademy.jsx y helmAcademy/): al dejar los datos ya
// no se va al Skool; se pasa a la pantalla de gracias, que entrega la guía
// (dentro de la academia) y el vídeo si lo hay, y deja claro el siguiente paso:
// esperar el mensaje del equipo en menos de 24 horas. Sin red: el alta y las
// notas van simuladas.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const pideLead = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/leads.js', () => ({ pideLead }))
vi.mock('../src/pages/inicio/socio/track.js', () => ({ track: () => {} }))

const { default: HelmAcademy } = await import('../src/pages/HelmAcademy.jsx')
const { default: AIPT } = await import('../src/pages/aiparatodo/config.jsx')
const {
  VSL, PDF, NOTA_VIDEO, NOTA_ABRE, NOTA_GUIA, idYoutube, videoDe, queEntrega, finalTelefono,
  guiaDe, tituloGuia, destinoAcademia, enlaceAcademia, rutaGracias,
  guardaEntrega, leeEntrega, entradaViva, gastaEntrada,
} = await import('../src/pages/helmAcademy/entrega.js')

const VSL_VACIA = { ...VSL }
const PDF_VACIO = { ...PDF }
afterEach(() => {
  cleanup(); pideLead.mockReset(); localStorage.clear()
  Object.assign(VSL, VSL_VACIA); Object.assign(PDF, PDF_VACIO)
})

const pinta = (ruta) => render(
  <MemoryRouter initialEntries={[ruta]}>
    <Routes>
      <Route path="/helm-academy" element={<HelmAcademy />} />
      <Route path="/helm-academy/gracias" element={<HelmAcademy gracias />} />
    </Routes>
  </MemoryRouter>,
)
// Con toda la batería a la vez, el segundo que da findBy por defecto se queda corto.
const ESPERA = { timeout: 5000 }
const pon = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
function rellenaYEnvia() {
  pon('Nombre', 'Noa Ruiz'); pon('Correo', 'noa@example.com'); pon('Teléfono', '+34 600 111 222')
  pon('Edad', '28'); pon('Lugar de residencia', 'Lorca'); pon('A qué te dedicas', 'Diseño')
  pon('¿A qué te quieres dedicar?', 'Crear contenido y vivir de ello')
  pon('¿Cuánto quieres ganar al mes?', '2.000 – 3.000 €/mes')
  pon('¿Ya usas la IA para trabajar?', 'Un poco, a veces')
  fireEvent.click(screen.getByRole('button'))
}
const GUIA = 'que-ningun-lead-se-enfrie'
const EN_LA_ACADEMIA = `https://academy.helmm.app/guia/${GUIA}`
// El enlace de entrada que da la academia: de un solo uso.
const ENTRADA = `https://academy.helmm.app/entrar?t=${'a'.repeat(43)}`
const conVideo = () => { VSL.youtube = 'https://youtu.be/abcDEF12345' }

describe('lo que se entrega (entrega.js)', () => {
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

  it('promete la guía del vídeo (o las guías), y el vídeo solo si está subido', () => {
    expect(queEntrega(GUIA, {})).toBe('la guía')
    expect(queEntrega(null, {})).toBe('las guías')
    expect(queEntrega(GUIA, { youtube: 'abcDEF12345' })).toBe('el vídeo y la guía')
    expect(queEntrega('', { mp4: '/v.mp4' })).toBe('el vídeo y las guías')
  })

  it('la guía de la dirección solo vale si tiene forma de guía', () => {
    expect(guiaDe(GUIA)).toBe(GUIA)
    for (const mala of [null, undefined, '', 'ab', 'Que-Ningun-Lead', '../admin', '/guia/x', 'a b c', 'x'.repeat(81), 42]) {
      expect(guiaDe(mala)).toBeNull()
      expect(destinoAcademia(mala)).toBe('/aiparatodo')
    }
    expect(destinoAcademia(GUIA)).toBe(`/guia/${GUIA}`)
    expect(enlaceAcademia(GUIA)).toBe(EN_LA_ACADEMIA)
    expect(enlaceAcademia(null)).toBe('https://academy.helmm.app/aiparatodo')
    expect(rutaGracias(GUIA)).toBe(`/helm-academy/gracias?guia=${GUIA}`)
    expect(rutaGracias('../admin')).toBe('/helm-academy/gracias')
    // El título, solo de las guías que se conocen: una nueva funciona sin él.
    expect(tituloGuia(GUIA)).toBe('Que ningún lead se enfríe')
    expect(tituloGuia('una-guia-nueva')).toBeNull()
    expect(tituloGuia('constructor')).toBeNull()
  })

  it('del teléfono solo recuerda el final, y del nombre el de pila', () => {
    expect(finalTelefono('+34 600 111 222')).toBe('222')
    expect(finalTelefono('12')).toBe('')
    guardaEntrega({ nombre: ' Noa Ruiz ', telefono: '600111222', quiero: 'x', ingreso: 'y', usa_ia: 'z' })
    expect(leeEntrega()).toMatchObject({ nombre: 'Noa', tel: '222', quiero: 'x', ingreso: 'y', usa_ia: 'z', guia: '' })
    expect(JSON.stringify(leeEntrega())).not.toContain('600111')
  })

  it('el enlace de entrada solo se guarda si es de un solo uso y de la academia, y deja de valer al usarlo o caducar', () => {
    guardaEntrega({ nombre: 'Noa' }, { guia: GUIA, academia: { url: ENTRADA, unUso: true } })
    expect(entradaViva(leeEntrega())).toBe(ENTRADA)
    gastaEntrada()
    expect(entradaViva(leeEntrega())).toBeNull()
    expect(leeEntrega()).toMatchObject({ nombre: 'Noa', guia: GUIA })   // lo demás se queda
    // La dirección normal no hace falta guardarla; una de otro sitio no se guarda nunca.
    guardaEntrega({ nombre: 'Noa' }, { academia: { url: 'https://academy.helmm.app/aiparatodo', unUso: false } })
    expect(leeEntrega().entrada).toBeUndefined()
    guardaEntrega({ nombre: 'Noa' }, { academia: { url: 'https://academy.helmm.app.malo.example/entrar?t=x', unUso: true } })
    expect(leeEntrega().entrada).toBeUndefined()
    expect(entradaViva({ entrada: { url: ENTRADA, hasta: new Date(Date.now() - 1000).toISOString() } })).toBeNull()
    expect(entradaViva({ entrada: { url: 'https://malo.example/entrar', hasta: new Date(Date.now() + 60_000).toISOString() } })).toBeNull()
    expect(entradaViva(null)).toBeNull()
  })
})

describe('el formulario de HELM Academy', () => {
  it('al enviarlo no se va al Skool: pasa a las gracias, con el siguiente paso a la vista', async () => {
    pideLead.mockResolvedValue({ ok: true, id: 'ficha-1' })
    pinta('/helm-academy')
    rellenaYEnvia()
    expect(await screen.findByText(/Tu siguiente paso: esperar nuestro WhatsApp\./, {}, ESPERA)).toBeTruthy()
    expect(pideLead).toHaveBeenCalledWith('school', expect.objectContaining({ nombre: 'Noa Ruiz', email: 'noa@example.com', telefono: '+34 600 111 222' }))
    expect(pideLead.mock.calls[0][1]).not.toHaveProperty('guia')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hecho, Noa. Ya lo tienes.')
    expect(screen.getByText('···222')).toBeTruthy()
    expect(screen.getByText(/No tienes que hacer nada más\./)).toBeTruthy()
    // Lo que nos contó, de vuelta: de ahí sale su ruta de inicio.
    expect(screen.getByLabelText('Lo que nos has contado').textContent).toContain('Crear contenido y vivir de ello')
    // La ficha queda en el navegador (abre AI para todo y firma las notas).
    expect(JSON.parse(localStorage.getItem(AIPT.llave)).id).toBe('ficha-1')
    // Sin guía concreta ni enlace de entrada: la parte gratuita, por su dirección normal.
    expect(screen.getByRole('link', { name: /Abrir las guías/ }).getAttribute('href')).toBe('https://academy.helmm.app/aiparatodo')
  })

  it('con ?guia=, la manda con el alta, y el botón de las gracias lleva el enlace de entrada que vuelve', async () => {
    pideLead.mockResolvedValue({ ok: true, id: 'ficha-1', academia: { url: ENTRADA, unUso: true } })
    pinta(`/helm-academy?guia=${GUIA}`)
    rellenaYEnvia()
    const boton = await screen.findByRole('link', { name: /Abrir la guía/ }, ESPERA)
    expect(pideLead).toHaveBeenCalledWith('school', expect.objectContaining({ email: 'noa@example.com', guia: GUIA }))
    expect(boton.getAttribute('href')).toBe(ENTRADA)
    expect(screen.getByText('Que ningún lead se enfríe.')).toBeTruthy()
    expect(screen.getByText(/Entras directamente con este botón, sin crear otra cuenta\./)).toBeTruthy()
    expect(leeEntrega().guia).toBe(GUIA)
  })

  it('una ?guia= que no tiene forma de guía no se manda', async () => {
    pideLead.mockResolvedValue({ ok: true, id: 'ficha-1' })
    pinta('/helm-academy?guia=..%2Fadmin')
    expect(screen.getByRole('button').textContent).toContain('Quiero las guías')
    rellenaYEnvia()
    await screen.findByText(/Tu siguiente paso/, {}, ESPERA)
    expect(pideLead.mock.calls[0][1]).not.toHaveProperty('guia')
  })

  it('antes de enviar ya dice que después le escribimos, y para qué usamos el teléfono', () => {
    pinta('/helm-academy')
    expect(screen.getByText(/Después, en menos de 24 horas, te escribe por WhatsApp una persona del equipo con tu ruta de inicio\./)).toBeTruthy()
    expect(screen.getByText(/te\s+escriba o te llame con tu ruta de inicio/)).toBeTruthy()
  })

  it('promete lo que entrega: las guías, la guía del vídeo con su título, y el vídeo cuando está subido', () => {
    pinta('/helm-academy')
    expect(screen.getByRole('button').textContent).toContain('Quiero las guías')
    expect(screen.getByText(/te damos las guías al momento/)).toBeTruthy()
    cleanup()
    pinta(`/helm-academy?guia=${GUIA}`)
    expect(screen.getByRole('button').textContent).toContain('Quiero la guía')
    expect(screen.getByText('«Que ningún lead se enfríe»')).toBeTruthy()
    cleanup()
    conVideo()
    pinta('/helm-academy?guia=una-guia-nueva')
    expect(screen.getByRole('button').textContent).toContain('Quiero el vídeo y la guía')
    expect(screen.getByText(/te damos el vídeo y la guía al momento/)).toBeTruthy()
  })

  it('a quien ya se apuntó desde este navegador le da el atajo a lo suyo', () => {
    pinta('/helm-academy')
    expect(screen.queryByText('Vuelve a lo tuyo')).toBeNull()
    cleanup()
    guardaEntrega({ nombre: 'Noa', telefono: '600111222' })
    pinta('/helm-academy')
    expect(screen.getByRole('link', { name: 'Vuelve a lo tuyo' }).getAttribute('href')).toBe('/helm-academy/gracias')
    cleanup()
    // Si ahora llega por otro vídeo, el atajo lleva a la guía de ese.
    pinta('/helm-academy?guia=los-mods-de-claude')
    expect(screen.getByRole('link', { name: 'Vuelve a lo tuyo' }).getAttribute('href')).toBe('/helm-academy/gracias?guia=los-mods-de-claude')
  })

  it('si el alta falla, se queda en el formulario con el error', async () => {
    pideLead.mockRejectedValue(new Error('No he podido guardarte. Prueba en un minuto.'))
    pinta('/helm-academy')
    rellenaYEnvia()
    expect((await screen.findByRole('alert', {}, ESPERA)).textContent).toBe('No he podido guardarte. Prueba en un minuto.')
    expect(screen.queryByText(/Tu siguiente paso/)).toBeNull()
    expect(leeEntrega()).toBeNull()
  })
})

describe('la pantalla de gracias', () => {
  const entra = (extra) => {
    localStorage.setItem(AIPT.llave, JSON.stringify({ id: 'ficha-1', nombre: 'Noa' }))
    guardaEntrega({ nombre: 'Noa', telefono: '600111222', quiero: 'Crear contenido y vivir de ello' }, extra)
    pideLead.mockResolvedValue({ ok: true })
  }
  const botonGuia = () => screen.getByRole('link', { name: /Abrir la guía/ })

  it('sin vídeo subido: abrir las guías y esperar', () => {
    entra()
    pinta('/helm-academy/gracias')
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Abre las guías', 'Espera nuestro WhatsApp'])
    expect(screen.getByText(/Aquí abajo tienes las guías\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir las guías/ }).getAttribute('href')).toBe('https://academy.helmm.app/aiparatodo')
    expect(screen.getByText(/Si te pide una cuenta, es gratis: usa el mismo correo que nos has dejado\./)).toBeTruthy()
  })

  it('con vídeo y guía: vídeo, guía y esperar, en ese orden', () => {
    entra({ guia: GUIA }); conVideo()
    pinta('/helm-academy/gracias')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hecho, Noa. Ya lo tienes.')
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      `Mira el vídeo ${VSL.minutos} min`, 'Abre tu guía', 'Espera nuestro WhatsApp',
    ])
    expect(screen.getByText(/Aquí abajo tienes el vídeo y la guía\./)).toBeTruthy()
    expect(botonGuia().getAttribute('href')).toBe(EN_LA_ACADEMIA)
  })

  it('el botón abre la guía en otra pestaña con el enlace de entrada; una vez usado, lleva a la dirección normal', async () => {
    entra({ guia: GUIA, academia: { url: ENTRADA, unUso: true } })
    pinta(`/helm-academy/gracias?guia=${GUIA}`)
    const boton = botonGuia()
    expect(boton.getAttribute('target')).toBe('_blank')
    expect(boton.getAttribute('href')).toBe(ENTRADA)
    boton.addEventListener('click', (ev) => ev.preventDefault())   // jsdom no navega
    fireEvent.click(boton)
    // El navegador sigue el enlace que se pulsó: no cambia hasta después.
    expect(boton.getAttribute('href')).toBe(ENTRADA)
    expect(pideLead.mock.calls).toEqual([['nota', { id: 'ficha-1', texto: NOTA_ABRE }]])
    expect(entradaViva(leeEntrega())).toBeNull()
    await waitFor(() => expect(botonGuia().getAttribute('href')).toBe(EN_LA_ACADEMIA), ESPERA)
    expect(screen.getByText(/Si te pide una cuenta, es gratis/)).toBeTruthy()
  })

  it('un enlace de entrada caducado, o de otra guía, no se usa', () => {
    entra({ guia: GUIA, academia: { url: ENTRADA, unUso: true } })
    // Vuelve por el enlace de otro vídeo: la entrada era para la guía anterior.
    pinta('/helm-academy/gracias?guia=los-mods-de-claude')
    expect(botonGuia().getAttribute('href')).toBe('https://academy.helmm.app/guia/los-mods-de-claude')
    cleanup()
    const guardado = leeEntrega()
    guardado.entrada.hasta = new Date(Date.now() - 1000).toISOString()
    localStorage.setItem('s4sf.helmacademy.entrega.v1', JSON.stringify(guardado))
    pinta('/helm-academy/gracias')
    expect(botonGuia().getAttribute('href')).toBe(EN_LA_ACADEMIA)
  })

  it('si caduca con la pantalla abierta, el botón pasa solo a la dirección normal', async () => {
    entra({ guia: GUIA, academia: { url: ENTRADA, unUso: true } })
    const guardado = leeEntrega()
    guardado.entrada.hasta = new Date(Date.now() + 150).toISOString()
    localStorage.setItem('s4sf.helmacademy.entrega.v1', JSON.stringify(guardado))
    pinta('/helm-academy/gracias')
    expect(botonGuia().getAttribute('href')).toBe(ENTRADA)
    await waitFor(() => expect(botonGuia().getAttribute('href')).toBe(EN_LA_ACADEMIA), ESPERA)
    expect(pideLead).not.toHaveBeenCalled()
  })

  it('el vídeo de YouTube no carga hasta el play, y al empezar queda anotado una sola vez', () => {
    entra(); conVideo()
    const { container } = pinta('/helm-academy/gracias')
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver el vídeo/ }))
    expect(container.querySelector('iframe').getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0&playsinline=1')
    expect(pideLead.mock.calls).toEqual([['nota', { id: 'ficha-1', texto: NOTA_VIDEO }]])
  })

  it('con un archivo propio usa el vídeo del navegador', () => {
    entra(); VSL.mp4 = '/helm-academy/vsl.mp4'
    const { container } = pinta('/helm-academy/gracias')
    expect(container.querySelector('video source').getAttribute('src')).toBe('/helm-academy/vsl.mp4')
    fireEvent.play(container.querySelector('video'))
    fireEvent.play(container.querySelector('video'))
    expect(pideLead.mock.calls).toEqual([['nota', { id: 'ficha-1', texto: NOTA_VIDEO }]])
  })

  it('un PDF propio, si se pone, sale como descarga debajo del botón y también queda anotado', () => {
    entra({ guia: GUIA })
    pinta('/helm-academy/gracias')
    expect(screen.queryByRole('link', { name: /descárgala en PDF/ })).toBeNull()
    cleanup()
    PDF.href = '/helm-academy/guia.pdf'
    pinta('/helm-academy/gracias')
    const enlace = screen.getByRole('link', { name: /descárgala en PDF/ })
    expect(enlace.getAttribute('href')).toBe('/helm-academy/guia.pdf')
    enlace.addEventListener('click', (ev) => ev.preventDefault())   // jsdom no navega
    fireEvent.click(enlace)
    expect(pideLead).toHaveBeenCalledWith('nota', { id: 'ficha-1', texto: NOTA_GUIA })
  })

  it('desde otro dispositivo (el enlace del correo) se pinta igual, con su guía, sin nombre ni notas', () => {
    conVideo()
    pinta(`/helm-academy/gracias?guia=${GUIA}`)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hecho. Ya lo tienes.')
    expect(screen.getByText(/al teléfono que nos has dejado\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hazlo aquí' }).getAttribute('href')).toBe(`/helm-academy?guia=${GUIA}`)
    const boton = botonGuia()
    expect(boton.getAttribute('href')).toBe(EN_LA_ACADEMIA)
    boton.addEventListener('click', (ev) => ev.preventDefault())   // jsdom no navega
    fireEvent.click(boton)
    fireEvent.click(screen.getByRole('button', { name: /Ver el vídeo/ }))
    expect(pideLead).not.toHaveBeenCalled()
  })
})
