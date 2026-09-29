// AI para todo — el contenido de la comunidad.
//
// Un foro de skills por temas. De momento hay uno (diseño); el resto de temas
// se enseñan como «próximamente» para que se vea hacia dónde va. Añadir un
// post es añadir un objeto a POSTS.
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

// Agenda una llamada: la auditoría de /empresas.
export const LLAMADA = '/empresas#auditoria'

// Las casillas de la pantalla de entrada.
export const ZONAS = [
  { key: 'skills', titulo: 'Skills', desc: 'El foro de skills para Claude, por temas: diseño, contenido, estrategia…', ruta: '/aiparatodo/skills', activa: true },
  { key: 'news', titulo: 'News', desc: 'Lo nuevo de la IA que de verdad cambia cómo trabajas. Sin humo.', activa: false },
  { key: 'guia', titulo: 'Guía completa de Claude', desc: 'De cero a dirigir Claude: proyectos, skills, conectores y agentes.', activa: false },
]

export const TEMAS = [
  { key: 'diseno', nombre: 'Diseño', desc: 'Webs, pósters, apps y paletas sin saber diseñar', activo: true },
  { key: 'contenido', nombre: 'Contenido', desc: 'Guiones, reels y copy con tu voz', activo: false },
  { key: 'estrategia', nombre: 'Estrategia', desc: 'Oferta, embudo y números del negocio', activo: false },
  { key: 'automatizacion', nombre: 'Automatización', desc: 'Que las tareas repetidas se hagan solas', activo: false },
]

const REPO_SKILLS = 'https://github.com/anthropics/skills'
const copiaSuelta = (ruta, nombre) =>
  `rm -rf /tmp/anthropic-skills && git clone --depth 1 ${REPO_SKILLS} /tmp/anthropic-skills && mkdir -p ~/.claude/skills && cp -r /tmp/anthropic-skills/skills/${nombre} ~/.claude/skills/`

export const POSTS = [
  {
    slug: '5-skills-diseno-claude',
    tema: 'diseno',
    titulo: '5 skills de diseño para Claude',
    gancho: 'Diseña sin saber diseñar',
    resumen: 'Cinco skills gratis y oficiales de Anthropic que convierten a Claude en tu diseñador: webs completas, pósters, apps, paletas y arte generativo.',
    fecha: '2026-09-29',
    lectura: '8 min',
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
        suelta: copiaSuelta('skills', 'algorithmic-art'),
        ejemplos: [
          { titulo: 'Fondo para tu marca', texto: 'Genera un fondo de partículas que fluyen despacio, en granate sobre negro, con controles para la densidad y la velocidad. Quiero usarlo detrás de mi web.' },
          { titulo: 'Geometría viva', texto: 'Crea un patrón geométrico que crece como un coral, en tonos cian y blanco sobre azul noche, con un control para cambiar la semilla.' },
        ],
      },
    ],
  },
]

export const postPorSlug = (slug) => POSTS.find(p => p.slug === slug)
