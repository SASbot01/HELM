// Web Creator: las piezas puras del estudio (api/_lib/webcreator.js) — sacar la
// ciudad, quitar directorios, leer una web, los patrones y el prompt. La base,
// la IA y la red se simulan: aquí no sale ninguna petición.
import { describe, it, expect, vi } from 'vitest'

vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: () => ({}) } }))
vi.mock('../api/_lib/web.js', () => ({ buscarWeb: vi.fn(), urlPublica: vi.fn(), fetchPublico: vi.fn(), decodeEntidades: (s) => String(s).replace(/&amp;/g, '&') }))
vi.mock('../api/_lib/places.js', () => ({ buscarNegocios: vi.fn() }))
vi.mock('../api/_lib/anthropic.js', () => ({ claudeTurno: vi.fn() }))
vi.mock('../api/_lib/llm.js', () => ({ proveedorDe: vi.fn() }))
vi.mock('../api/_lib/creditos.js', () => ({ claveHelm: () => '' }))
vi.mock('../api/_lib/notificar.js', () => ({ notificar: vi.fn() }))

const {
  ciudadDe, esRuido, slugDe, puntuaMaps, analizaHtml, patronesDe, seccionesRecomendadas, construyePrompt, dominioDe, horarioLegible,
  deNotas, sectorDeTexto, nombrePropio, ciudadConCp,
} = await import('../api/_lib/webcreator.js')

const HTML = `<!doctype html><html><head><title>Clínica Bella | Estética en Lorca</title>
<meta name="description" content="Tratamientos faciales y corporales en Lorca. Pide tu cita.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BeautySalon","name":"Bella"}</script></head>
<body><nav><a href="/">Inicio</a><a href="/tratamientos">Tratamientos</a><a href="/equipo">Equipo</a><a href="/contacto">Contacto</a></nav>
<h1>Tu clínica de estética en Lorca</h1><h2>Nuestros tratamientos</h2><h2>Opiniones de clientas</h2><h2>Preguntas frecuentes</h2>
<a class="btn" href="https://www.treatwell.es/bella">Reserva tu cita</a><a href="https://wa.me/34600000000">WhatsApp</a>
<a href="tel:+34968000000">Llámanos</a><p>Limpieza facial 45 €</p><img src="a.webp"><img src="b.webp">
<iframe src="https://www.google.com/maps/embed?pb=1"></iframe></body></html>`

describe('Web Creator · piezas del estudio', () => {
  it('saca la ciudad de una dirección de Google Maps', () => {
    expect(ciudadDe('C. Mayor, 12, 30800 Lorca, Murcia, España')).toBe('Lorca')
    expect(ciudadDe('Calle de Serrano, 41, 28001 Madrid, España')).toBe('Madrid')
    expect(ciudadDe('Avinguda Diagonal, 08019 Barcelona')).toBe('Barcelona')
    expect(ciudadDe('')).toBeNull()
  })

  it('quita directorios y redes, pero no la web de un negocio', () => {
    expect(esRuido('https://www.doctoralia.es/clinica-x')).toBe(true)
    expect(esRuido('https://www.instagram.com/bella')).toBe(true)
    expect(esRuido('https://www.paginasamarillas.es/x')).toBe(true)
    expect(esRuido('https://clinicabella.es/')).toBe(false)
    expect(dominioDe('https://www.ClinicaBella.es/tratamientos?x=1')).toBe('clinicabella.es')
  })

  it('el horario de Maps se escribe legible y el vacío no cuenta', () => {
    expect(horarioLegible([])).toBeNull()
    expect(horarioLegible('')).toBeNull()
    expect(horarioLegible(['lunes: 10:00–14:00', 'martes: cerrado'])).toBe('lunes: 10:00–14:00; martes: cerrado')
    expect(horarioLegible({ weekdayDescriptions: ['lunes: 9:00–20:00'] })).toBe('lunes: 9:00–20:00')
  })

  it('saca los datos de unas notas escritas como resumen (Isabel Lozano)', () => {
    const notas = `https://drive.google.com/drive/folders/abc

# Resumen informativo completo — Isabel Lozano Estilista

Nombre comercial: Isabel Lozano Estilista Actividad: Peluquería y estilismo capilar. Ubicación: Lorca, Murcia, España.

- Dirección: Calle Navarra, 1, edificio Los Almendros, Lorca, Murcia.
- Teléfono de contacto y reservas: +34 667 71 40 42.
- Instagram: [@isabellozanoestilista](https://www.instagram.com/isabellozanoestilista/?utm_source=chatgpt.com)

| Día       | Horario       |
| --------- | ------------- |
| Lunes     | 10:00–13:30   |
| Viernes   | 10:00–19:00   |
| Sábado    | Cerrado. Solo se atiende con cita previa para eventos. |`
    const n = deNotas(notas)
    expect(n.actividad).toBe('Peluquería y estilismo capilar')
    expect(n.ubicacion).toBe('Lorca, Murcia, España')
    expect(n.direccion).toBe('Calle Navarra, 1, edificio Los Almendros, Lorca, Murcia')
    expect(n.telefono).toBe('+34 667 71 40 42')
    expect(n.instagram).toBe('@isabellozanoestilista')
    expect(n.horario).toBe('Lunes: 10:00–13:30; Viernes: 10:00–19:00; Sábado: Cerrado. Solo se atiende con cita previa para eventos.')
    expect(sectorDeTexto('isabel lozano estilista')).toBe('peluquería')
    expect(sectorDeTexto('micropigmentación de cejas')).toBe('micropigmentación')
    expect(nombrePropio('isabel lozano estilista')).toBe('Isabel Lozano Estilista')
    expect(nombrePropio('Joyería McQueen')).toBe('Joyería McQueen')
    expect(ciudadConCp('Calle Navarra, 1, edificio Los Almendros, Lorca, Murcia.')).toBeNull()
    expect(ciudadConCp('C. Mayor, 12, 30800 Lorca, Murcia')).toBe('Lorca')
  })

  it('el prompt lleva lo aprendido en webs anteriores', () => {
    const prompt = construyePrompt({ id: 'x', cliente: { nombre: 'A' }, sector: 'peluquería', ciudad: 'Lorca', competidores: [], patrones: patronesDe([]), ia: null, faltan: [], aprendido: '## 2026-10-18 · Isabel Lozano\n- Paleta cálida' })
    expect(prompt).toContain('## Lo aprendido en las webs anteriores')
    expect(prompt).toContain('- Paleta cálida')
  })

  it('hace slugs limpios para la carpeta y el repositorio', () => {
    expect(slugDe('Joyería Pérez & Hijos Lorca')).toBe('joyeria-perez-hijos-lorca')
    expect(slugDe('')).toBe('web')
  })

  it('en Maps puntúa más la buena nota con muchas reseñas', () => {
    expect(puntuaMaps({ rating: 4.6, resenas: 400 })).toBeGreaterThan(puntuaMaps({ rating: 5, resenas: 3 }))
    expect(puntuaMaps({})).toBe(0)
  })

  it('lee una web: titulares, menú, llamadas a la acción y señales', () => {
    const a = analizaHtml(HTML, 'https://clinicabella.es/')
    expect(a.titulo).toBe('Clínica Bella | Estética en Lorca')
    expect(a.descripcion).toContain('Pide tu cita')
    expect(a.h1[0]).toBe('Tu clínica de estética en Lorca')
    expect(a.menu).toEqual(['Inicio', 'Tratamientos', 'Equipo', 'Contacto'])
    expect(a.ctas).toContain('Reserva tu cita')
    expect(a.senales).toMatchObject({ reserva_online: true, whatsapp: true, telefono_visible: true, precios: true, opiniones: true, mapa: true, faq: true, formulario: false })
    expect(a.plataformas_reserva).toEqual(['treatwell'])
    expect(a.schema).toEqual(['BeautySalon'])
    expect(a.secciones).toEqual(expect.arrayContaining(['servicios', 'equipo', 'opiniones', 'preguntas frecuentes', 'contacto / cómo llegar']))
    expect(a.imagenes).toBe(2)
  })

  it('saca lo que tienen casi todas y lo que casi nadie hace', () => {
    const a = analizaHtml(HTML, 'https://a.es')
    const b = analizaHtml('<html><h2>Servicios</h2><a href="https://wa.me/1">WhatsApp</a></html>', 'https://b.es')
    const c = analizaHtml('<html><h2>Servicios</h2><a href="https://wa.me/2">Escríbenos</a><form></form></html>', 'https://c.es')
    const p = patronesDe([a, b, c])
    expect(p.leidas).toBe(3)
    expect(p.comunes.map(x => x.k)).toContain('whatsapp')
    expect(p.raros.map(x => x.k)).toContain('blog')
    expect(p.secciones[0].s).toBe('servicios')
    expect(patronesDe([]).leidas).toBe(0)
    const secciones = seccionesRecomendadas(p, { resenas: 40 })
    expect(secciones[0]).toMatch(/^portada/)
    expect(secciones.at(-1)).toMatch(/^contacto/)
    expect(new Set(secciones).size).toBe(secciones.length)
  })

  it('el prompt lleva el cliente, el estudio, lo que falta y el protocolo de publicación', () => {
    const competidores = [{ nombre: 'Clínica Bella', url: 'https://clinicabella.es/', posicion_google: 1, consulta: 'clínica estética Lorca', analisis: analizaHtml(HTML, 'https://clinicabella.es/') }]
    const patrones = patronesDe(competidores.map(c => c.analisis))
    const prompt = construyePrompt({
      id: '11111111-2222-4333-8444-555555555555',
      cliente: { nombre: 'Estética Rosa', telefono: '968 11 22 33', direccion: 'C. Nogalte, 3, 30800 Lorca, Murcia, España', rating: 4.8, resenas: 57, contexto: '- Llamada: quiere reservas online' },
      sector: 'centro de estética', ciudad: 'Lorca', competidores, patrones, ia: null, faltan: ['logo', 'fotos propias'],
    })
    expect(prompt).toContain('# Web para Estética Rosa — centro de estética en Lorca')
    expect(prompt).toContain('4,8★ con 57 reseñas')
    expect(prompt).toContain('quiere reservas online')
    expect(prompt).toContain('1º en Google para «clínica estética Lorca»')
    expect(prompt).toContain('[PENDIENTE')
    expect(prompt).toContain('logo, fotos propias')
    expect(prompt).toContain('gh repo create SASbot01/web-estetica-rosa-lorca --private --source . --remote origin')
    expect(prompt).toContain('gh pr create --base main --head primera-version')
    expect(prompt).toContain('scripts/web-creator.mjs subida 11111111-2222-4333-8444-555555555555')
    expect(prompt).not.toContain('vercel login')
    expect(prompt).not.toMatch(/undefined|null|NaN/)
  })

  it('sin webs de referencia, el prompt lo dice en vez de inventar', () => {
    const prompt = construyePrompt({ id: 'x', cliente: { nombre: 'Joyería Sol' }, sector: null, ciudad: null, competidores: [], patrones: patronesDe([]), ia: null, faltan: [] })
    expect(prompt).toContain('No se ha podido leer ninguna web de referencia')
    expect(prompt).not.toMatch(/undefined|NaN/)
  })
})
