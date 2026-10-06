// AI para todo — el contenido de la comunidad.
//
//   · Skills: cada colección es un archivo de ./skills/ (y la de diseño, aquí
//     abajo). Añadir una es añadir un archivo: se carga sola.
//   · Guía: cada capítulo es un archivo de ./guia/ (NN-slug.js). Mientras un
//     capítulo del índice no tenga archivo, se enseña como «pronto».
//   · No negociables: la guía en PDF, en ./noNegociables.js.
//   · News: no está aquí. Es el diario que escribe la redacción automática de
//     HELM (dos artículos al día) más las breves del agente de noticias, y se
//     piden a /api/aiparatodo.
//
// Las instrucciones de instalación son las REALES de Claude Code: el
// marketplace oficial de Anthropic (anthropics/skills) trae las cinco skills de
// diseño en el plugin `example-skills`, y cada una se puede copiar suelta a
// ~/.claude/skills. Comprobado contra los repos el 29/09/2026.

export const FUNDADOR = {
  nombre: 'Alex Silvestre',
  rol: 'Fundador de AI para todo',
  foto: '/inicio/alex.jpg',
  instagram: 'https://www.instagram.com/silvesttre.ia',
  handle: '@silvesttre.ia',
  youtube: 'https://www.youtube.com/@silvesttre-ai',
}

// Las cuatro secciones. Todas se recorren sin dejar nada: se ven los temas y
// los hilos, como un foro. Lo que pide el correo es LEER un hilo.
export const SECCIONES = [
  {
    key: 'skills', titulo: 'Skills', desc: 'Habilidades que se le instalan a Claude para que haga un trabajo concreto, y bien.',
    temas: [
      { key: 'diseno', nombre: 'Diseño', desc: 'Webs, pósters, apps y paletas sin saber diseñar' },
      { key: 'contenido', nombre: 'Contenido', desc: 'Guiones, reels y copy con tu voz' },
      { key: 'estrategia', nombre: 'Estrategia', desc: 'Oferta, embudo y números del negocio' },
      { key: 'automatizacion', nombre: 'Automatización', desc: 'Que las tareas repetidas se hagan solas' },
      { key: 'documentos', nombre: 'Documentos', desc: 'Word, Excel, PowerPoint y PDF sin pelearte con ellos' },
      { key: 'desarrollo', nombre: 'Claude Code', desc: 'Construir webs, automatizaciones y herramientas con método' },
      { key: 'mcp', nombre: 'MCP', desc: 'Conecta Claude a tus herramientas con el enchufe universal' },
    ],
  },
  {
    key: 'news', titulo: 'News', desc: 'El diario de IA, tecnología y ciberseguridad: dos piezas al día, investigadas y contrastadas, y las breves de cada mañana.',
    // Los temas del diario (aip_articulos.tema). Las breves (helm_noticias) usan
    // 'ia' y 'ciberseguridad', que también están aquí.
    temas: [
      { key: 'ia', nombre: 'IA', desc: 'Modelos, herramientas y lo que cambia cómo trabajas' },
      { key: 'tecnologia', nombre: 'Tecnología', desc: 'Lo nuevo en tecnología que de verdad importa' },
      { key: 'ciberseguridad', nombre: 'Ciberseguridad', desc: 'Fallos, estafas y cómo protegerte' },
    ],
  },
  {
    key: 'comunidad', titulo: 'Comunidad', desc: 'Dudas, lo que has montado y lo que te ha funcionado. Entre todos.',
    temas: [
      { key: 'presentate', nombre: 'Preséntate', desc: 'Quién eres y qué quieres montar' },
      { key: 'dudas', nombre: 'Dudas', desc: 'Pregunta lo que sea' },
      { key: 'montado', nombre: 'Lo que he montado', desc: 'Enseña tus sistemas y resultados' },
    ],
  },
  {
    key: 'guia', titulo: 'Guía completa de Claude', desc: 'De cero a dirigir Claude: proyectos, skills, conectores, MCP y Claude Code. Y mis no negociables, en PDF.',
    temas: [
      { key: 'capitulos', nombre: 'Capítulos', desc: 'La guía, en orden' },
      { key: 'no-negociables', nombre: 'No negociables', desc: 'Mis 8 no negociables con Claude, en PDF' },
    ],
  },
]
export const seccionPorClave = (k) => SECCIONES.find(s => s.key === k)

// Los capítulos de la guía, en orden. El texto de cada uno está en
// ./guia/NN-slug.js; el que todavía no tenga archivo sale como «pronto».
const TEXTOS_GUIA = Object.values(import.meta.glob('./guia/*.js', { eager: true, import: 'default' }))
export const CAPITULOS = [
  { slug: 'empieza-aqui', titulo: 'Empieza aquí: qué es Claude y cómo pensar con él' },
  { slug: 'proyectos', titulo: 'Proyectos: que Claude conozca tu negocio' },
  { slug: 'skills', titulo: 'Skills: enséñale a Claude a trabajar como tú' },
  { slug: 'conectores', titulo: 'Conectores: Claude con tus herramientas' },
  { slug: 'mcp', titulo: 'MCP: el enchufe universal entre Claude y todo lo demás' },
  { slug: 'claude-code', titulo: 'Claude Code y agentes: que trabaje solo' },
].map((c, i) => {
  const texto = TEXTOS_GUIA.find(t => t.slug === c.slug)
  return {
    ...c, n: String(i + 1).padStart(2, '0'), seccion: 'guia', tema: 'capitulos',
    resumen: texto?.resumen, lectura: texto?.lectura, fecha: texto?.fecha,
    texto: texto || null, pronto: !texto,
  }
})
export const capituloPorSlug = (slug) => CAPITULOS.find(c => c.slug === slug)

// Qué capítulos se enseñan en la Guía. Vacío = solo el PDF de los no
// negociables. Para publicar uno, se añade su slug aquí: aparece en la lista
// con el mismo estilo de tarjeta. (El archivo y la URL del capítulo existen
// aunque no esté en la lista.)
export const CAPITULOS_PUBLICADOS = []
const capituloVisible = (c) => CAPITULOS_PUBLICADOS.includes(c.slug)

const REPO_SKILLS = 'https://github.com/anthropics/skills'
const copiaSuelta = (ruta, nombre) =>
  `rm -rf /tmp/anthropic-skills && git clone --depth 1 ${REPO_SKILLS} /tmp/anthropic-skills && mkdir -p ~/.claude/skills && cp -r /tmp/anthropic-skills/skills/${nombre} ~/.claude/skills/`

export const POSTS = [
  {
    slug: '5-skills-diseno-claude',
    seccion: 'skills',
    tema: 'diseno',
    titulo: '5 skills de diseño para Claude',
    gancho: 'Diseña sin saber diseñar',
    resumen: 'Cinco skills gratis y oficiales de Anthropic que convierten a Claude en tu diseñador: webs completas, pósters, apps, paletas y arte generativo.',
    fecha: '2026-09-29',
    lectura: '8 min',
    nota: 'Las 5 son gratis, oficiales de Anthropic y de código abierto (Apache 2.0). Solo necesitas Claude Code.',
    instalarTodo: {
      explica: 'Las cinco vienen en el plugin oficial «example-skills» de Anthropic. Dentro de Claude Code, pega estas dos líneas una detrás de otra:',
      comando: '/plugin marketplace add anthropics/skills\n/plugin install example-skills@anthropic-agent-skills',
    },
    skills: [
      {
        n: '01', clave: 'frontend-design', nombre: 'Frontend Design', titular: 'Tu web, entera y con criterio',
        corto: 'páginas y apps completas: tipografía, color, animación y maquetación',
        historia: 'Le cuentas para qué es la página y Claude toma todas las decisiones que normalmente te bloquean: qué letra, qué colores, cómo se mueve, dónde va cada cosa. No sale una plantilla más: sale un diseño con dirección propia y código listo para publicar.',
        puedes: [
          'Describes el negocio y Claude diseña la página completa',
          'Elige tipografía, paleta, animaciones y estructura por ti',
          'Entrega código real, no una imagen de cómo quedaría',
          'Sirve para landings, paneles, portfolios y apps',
        ],
        github: `${REPO_SKILLS}/tree/main/skills/frontend-design`,
        autor: 'Anthropic', oficial: true, repo: 'anthropics/skills', ruta: 'skills/frontend-design', licencia: 'Apache 2.0',
        suelta: copiaSuelta('skills', 'frontend-design'),
        ejemplos: [
          { titulo: 'Landing para una academia', texto: 'Diseña la landing de una academia online de edición de vídeo. Estética oscura y cinematográfica, tipografía con carácter, animaciones suaves al hacer scroll. Hero con vídeo, módulos del curso, testimonios y formulario de reserva.' },
          { titulo: 'Panel minimalista', texto: 'Diseña un panel para seguir las ventas de un infoproducto: facturado, cobrado, leads por día y las últimas ventas. Fondo oscuro, un solo color de acento y tarjetas limpias.' },
        ],
      },
      {
        n: '02', clave: 'canvas-design', nombre: 'Canvas Design', titular: 'Pósters y portadas únicos',
        corto: 'pósters, portadas e infografías en PNG o PDF',
        historia: 'Cuando usas una plantilla, tu póster se parece al de todo el mundo. Aquí le dices a Claude qué quieres comunicar y compone una pieza desde cero, con tu marca y tus colores, lista para descargar.',
        puedes: [
          'Pósters, portadas e infografías para cualquier red',
          'Archivos listos en PNG o PDF',
          'Respeta tu identidad de marca',
          'La tipografía forma parte de la composición',
        ],
        github: `${REPO_SKILLS}/tree/main/skills/canvas-design`,
        autor: 'Anthropic', oficial: true, repo: 'anthropics/skills', ruta: 'skills/canvas-design', licencia: 'Apache 2.0',
        suelta: copiaSuelta('skills', 'canvas-design'),
        ejemplos: [
          { titulo: 'Anuncio de un directo', texto: 'Crea un póster vertical para Instagram anunciando un directo sobre IA aplicada a negocios. Negro y granate, mucho aire, solo el título, la fecha y la hora.' },
          { titulo: 'Miniatura de YouTube', texto: 'Diseña la miniatura de un vídeo titulado «Monté mi empresa con agentes». Contraste alto, una palabra enorme y un detalle en rojo.' },
        ],
      },
      {
        n: '03', clave: 'web-artifacts-builder', nombre: 'Web Artifacts Builder', titular: 'Apps que funcionan, sin programar',
        corto: 'apps funcionales con más de 40 componentes',
        historia: 'Una calculadora de presupuestos, un formulario que puntúa leads, un organizador de tareas: lo pides y Claude monta la app funcionando, con un stack profesional por debajo. Y la entrega en un solo archivo que puedes compartir.',
        puedes: [
          'Más de 40 componentes listos para usar',
          'React, TypeScript y Tailwind sin tocar nada',
          'Una app que funciona desde el primer momento',
          'Todo empaquetado en un único HTML',
        ],
        github: `${REPO_SKILLS}/tree/main/skills/web-artifacts-builder`,
        autor: 'Anthropic', oficial: true, repo: 'anthropics/skills', ruta: 'skills/web-artifacts-builder', licencia: 'Apache 2.0',
        suelta: copiaSuelta('skills', 'web-artifacts-builder'),
        ejemplos: [
          { titulo: 'Calculadora de presupuestos', texto: 'Crea una calculadora de presupuestos para un editor de vídeo: tipo de pieza (reel, YouTube, anuncio), número de clips y urgencia. Que muestre el precio al instante y permita copiarlo.' },
          { titulo: 'Tablero de contenido', texto: 'Construye un tablero con columnas Idea, Guion, Grabado y Publicado, donde se puedan arrastrar las tarjetas. Diseño oscuro y limpio.' },
        ],
      },
      {
        n: '04', clave: 'theme-factory', nombre: 'Theme Factory', titular: 'Color y tipografía resueltos',
        corto: '10 paletas con su tipografía, listas para aplicar',
        historia: 'Elegir colores y letras puede comerse una tarde entera. Theme Factory te enseña diez temas completos, cada uno con su combinación de fuentes, y lo aplica al proyecto que tengas delante. También crea uno a medida.',
        puedes: [
          '10 temas profesionales listos',
          'Cada tema con sus tipografías',
          'Temas a medida desde cero',
          'Se aplican a webs, presentaciones e informes',
        ],
        github: `${REPO_SKILLS}/tree/main/skills/theme-factory`,
        autor: 'Anthropic', oficial: true, repo: 'anthropics/skills', ruta: 'skills/theme-factory', licencia: 'Apache 2.0',
        suelta: copiaSuelta('skills', 'theme-factory'),
        ejemplos: [
          { titulo: 'Elegir tema para tu marca', texto: 'Enséñame los temas de Theme Factory y dime cuál encaja con una marca personal de IA con tono serio y oscuro. Aplícalo a una página de ejemplo.' },
          { titulo: 'Tema a medida', texto: 'Crea un tema propio para una marca de entrenamiento personal: energía, contraste y una tipografía que se lea desde el móvil.' },
        ],
      },
      {
        n: '05', clave: 'algorithmic-art', nombre: 'Algorithmic Art', titular: 'Arte generativo que no sale de ninguna plantilla',
        corto: 'arte generativo con controles en tiempo real',
        historia: 'Fractales, espirales, partículas que fluyen: piezas que cambian con cada semilla y que ajustas con controles mientras las miras. Es la skill que más sorprende la primera vez y la que ninguna herramienta de plantillas puede imitar.',
        puedes: [
          'Patrones generativos infinitos',
          'Fractales, partículas, espirales y geometría',
          'Controles para ajustar todo en directo',
          'Cada semilla, una pieza única y repetible',
        ],
        github: `${REPO_SKILLS}/tree/main/skills/algorithmic-art`,
        autor: 'Anthropic', oficial: true, repo: 'anthropics/skills', ruta: 'skills/algorithmic-art', licencia: 'Apache 2.0',
        suelta: copiaSuelta('skills', 'algorithmic-art'),
        ejemplos: [
          { titulo: 'Fondo para tu marca', texto: 'Genera un fondo de partículas que fluyen despacio, en granate sobre negro, con controles para la densidad y la velocidad. Quiero usarlo detrás de mi web.' },
          { titulo: 'Geometría viva', texto: 'Crea un patrón geométrico que crece como un coral, en tonos cian y blanco sobre azul noche, con un control para cambiar la semilla.' },
        ],
      },
    ],
  },
]

// Las colecciones de ./skills/, de la más nueva a la más antigua.
POSTS.push(...Object.values(import.meta.glob('./skills/*.js', { eager: true, import: 'default' })))
POSTS.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || a.slug.localeCompare(b.slug))

export const postPorSlug = (slug) => POSTS.find(p => p.slug === slug)

// La guía en PDF: su hilo en la sección Guía. /nonegociables lleva aquí.
export const NN_HILO = {
  slug: 'mis-8-no-negociables-con-claude', seccion: 'guia', tema: 'no-negociables',
  titulo: 'Mis 8 no negociables con Claude (guía en PDF)',
  resumen: 'Cómo trabajo para que la IA haga el trabajo de verdad: Composio, Skills, Loops, Modo plan, Subagentes, Hooks, el modelo correcto y Todo a GitHub.',
  fecha: '2026-10-05', lectura: '10 min',
}
export const NN_RUTA = `/aiparatodo/${NN_HILO.seccion}/${NN_HILO.tema}/${NN_HILO.slug}`

// Los hilos de una sección (y de un tema). News no está aquí: viene de la API.
// Los capítulos solo se listan si están en CAPITULOS_PUBLICADOS.
export const hilosDe = (seccion, tema) => [...POSTS, ...CAPITULOS.filter(capituloVisible), NN_HILO]
  .filter(h => h.seccion === seccion && (!tema || h.tema === tema))
