// @vitest-environment jsdom
// HELM Academy (src/pages/HelmAcademy.jsx y helmAcademy/): al dejar los datos ya
// no se va al Skool; se pasa a la pantalla de gracias, que entrega el vídeo y
// la guía y deja claro el siguiente paso: esperar el mensaje del equipo en
// menos de 24 horas. Sin red: el alta y las notas van simuladas.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const pideLead = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/leads.js', () => ({ pideLead }))
vi.mock('../src/pages/inicio/socio/track.js', () => ({ track: () => {} }))

const { default: HelmAcademy } = await import('../src/pages/HelmAcademy.jsx')
const { default: AIPT } = await import('../src/pages/aiparatodo/config.jsx')
const {
  VSL, PDF, NOTA_VIDEO, NOTA_GUIA, idYoutube, videoDe, queEntrega, finalTelefono, guardaEntrega, leeEntrega,
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
const conRecursos = () => {
  VSL.youtube = 'https://youtu.be/abcDEF12345'
  PDF.href = '/helm-academy/guia.pdf'
}

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

  it('solo promete lo que está subido', () => {
    expect(queEntrega({ youtube: 'abcDEF12345' }, { href: '/g.pdf' })).toBe('el vídeo y la guía')
    expect(queEntrega({ youtube: 'abcDEF12345' }, { href: '' })).toBe('el vídeo')
    expect(queEntrega({}, { href: '/g.pdf' })).toBe('la guía')
    expect(queEntrega({}, { href: '' })).toBe('')
  })

  it('del teléfono solo recuerda el final, y del nombre el de pila', () => {
    expect(finalTelefono('+34 600 111 222')).toBe('222')
    expect(finalTelefono('12')).toBe('')
    guardaEntrega({ nombre: ' Noa Ruiz ', telefono: '600111222', quiero: 'x', ingreso: 'y', usa_ia: 'z' })
    expect(leeEntrega()).toMatchObject({ nombre: 'Noa', tel: '222', quiero: 'x', ingreso: 'y', usa_ia: 'z' })
    expect(JSON.stringify(leeEntrega())).not.toContain('600111')
  })
})

describe('el formulario de HELM Academy', () => {
  it('al enviarlo no se va al Skool: pasa a las gracias, con el siguiente paso a la vista', async () => {
    pideLead.mockResolvedValue({ ok: true, id: 'ficha-1' })
    pinta('/helm-academy')
    rellenaYEnvia()
    expect(await screen.findByText(/Tu siguiente paso: esperar nuestro WhatsApp\./, {}, ESPERA)).toBeTruthy()
    expect(pideLead).toHaveBeenCalledWith('school', expect.objectContaining({ nombre: 'Noa Ruiz', email: 'noa@example.com', telefono: '+34 600 111 222' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hecho, Noa. Estás dentro.')
    expect(screen.getByText('···222')).toBeTruthy()
    expect(screen.getByText(/No tienes que hacer nada más\./)).toBeTruthy()
    // Lo que nos contó, de vuelta: de ahí sale su ruta de inicio.
    expect(screen.getByLabelText('Lo que nos has contado').textContent).toContain('Crear contenido y vivir de ello')
    // La ficha queda en el navegador (abre AI para todo y firma las notas).
    expect(JSON.parse(localStorage.getItem(AIPT.llave)).id).toBe('ficha-1')
  })

  it('antes de enviar ya dice que después le escribimos, y para qué usamos el teléfono', () => {
    pinta('/helm-academy')
    expect(screen.getByText(/Después, en menos de 24 horas, te escribe por WhatsApp una persona del equipo con tu ruta de inicio\./)).toBeTruthy()
    expect(screen.getByText(/te\s+escriba o te llame con tu ruta de inicio/)).toBeTruthy()
  })

  it('promete el vídeo y la guía solo cuando están subidos', () => {
    pinta('/helm-academy')
    expect(screen.getByRole('button').textContent).toContain('Entrar gratis a HELM Academy')
    cleanup()
    conRecursos()
    pinta('/helm-academy')
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
  const entra = () => {
    localStorage.setItem(AIPT.llave, JSON.stringify({ id: 'ficha-1', nombre: 'Noa' }))
    guardaEntrega({ nombre: 'Noa', telefono: '600111222', quiero: 'Crear contenido y vivir de ello' })
    pideLead.mockResolvedValue({ ok: true })
  }

  it('sin vídeo ni guía subidos, solo queda el paso de esperar', () => {
    entra()
    pinta('/helm-academy/gracias')
    expect(screen.getAllByRole('listitem').filter(li => li.className.includes('ha-paso'))).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Espera nuestro WhatsApp')
    expect(screen.queryByText(/Aquí abajo tienes/)).toBeNull()
  })

  it('con los dos: vídeo, guía y esperar, en ese orden', () => {
    entra(); conRecursos()
    pinta('/helm-academy/gracias')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hecho, Noa. Ya lo tienes.')
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      `Mira el vídeo ${VSL.minutos} min`, 'Descarga la guía', 'Espera nuestro WhatsApp',
    ])
    expect(screen.getByText(/Aquí abajo tienes el vídeo y la guía\./)).toBeTruthy()
  })

  it('el vídeo de YouTube no carga hasta el play, y al empezar queda anotado una sola vez', () => {
    entra(); conRecursos()
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

  it('descargar la guía también queda anotado', () => {
    entra(); conRecursos()
    pinta('/helm-academy/gracias')
    const enlace = screen.getByRole('link', { name: /Descargar el PDF/ })
    expect(enlace.getAttribute('href')).toBe('/helm-academy/guia.pdf')
    enlace.addEventListener('click', (ev) => ev.preventDefault())   // jsdom no navega
    fireEvent.click(enlace)
    expect(pideLead).toHaveBeenCalledWith('nota', { id: 'ficha-1', texto: NOTA_GUIA })
  })

  it('desde otro dispositivo (el enlace del correo) se pinta igual, sin nombre ni notas', () => {
    conRecursos()
    pinta('/helm-academy/gracias')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hecho. Ya lo tienes.')
    expect(screen.getByText(/al teléfono que nos has dejado\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hazlo aquí' }).getAttribute('href')).toBe('/helm-academy')
    fireEvent.click(screen.getByRole('button', { name: /Ver el vídeo/ }))
    expect(pideLead).not.toHaveBeenCalled()
  })
})
