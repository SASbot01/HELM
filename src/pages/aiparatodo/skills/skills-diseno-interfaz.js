// Hilo de la sección Skills (tema diseño): que tus webs y apps no parezcan hechas con IA.
// Dos skills de la comunidad y un servidor MCP, ninguno oficial de Anthropic.
// Comprobado el 2026-10-14 con gh api (README, manifiestos de plugin, LICENSE, releases,
// issues) y con la documentación de cada proyecto:
// - nextlevelbuilder/ui-ux-pro-max-skill (MIT, 135.705★, push 2026-10-12, v2.15.0):
//   marketplace «ui-ux-pro-max-skill» con el plugin «ui-ux-pro-max», que trae 7 skills
//   (.claude/skills: ui-ux-pro-max, design, brand, design-system, ui-styling, slides,
//   banner-design). No está en claude-plugins-official. Necesita Python 3. No sirve en
//   claude.ai: el ZIP del repo pasa de 200 archivos y el autor no publica uno para subir.
//   El paquete npm bueno es ui-ux-pro-max-cli (el antiguo uipro-cli está obsoleto).
// - pbakaus/impeccable (Apache-2.0, 81.022★, push 2026-10-13, v4.5.2): una sola skill con
//   24 comandos y un detector de 59 reglas (cifra del README). Su marketplace.json declara
//   el marketplace «impeccable» con el plugin «impeccable»: de ahí sale
//   /plugin install impeccable@impeccable, que es lo mismo que el README pide hacer desde
//   el menú /plugin. Hooks, descarga del motor y telemetría, contados en la tarjeta.
// - 21st-dev/magic-mcp (ISC, 6.010★, push 2026-09-09): NO es una skill, es el servidor MCP
//   remoto de 21st.dev (https://21st.dev/api/mcp), antes «Magic MCP». Vía oficial: la CLI
//   @21st-dev/cli v1.18.0 (init --client claude --write). La vía de plugin falla: issue #82
//   abierto y PR #83 sin fusionar a 2026-10-14, solo carga la skill y no el MCP. Los precios
//   de 21st.dev/pricing van con «$» sin decir la divisa.
// Sin instalarTodo: cada una se instala por su lado (dos marketplaces distintos y un MCP).
// Fuentes: github.com/nextlevelbuilder/ui-ux-pro-max-skill, github.com/pbakaus/impeccable,
// impeccable.style/docs/install, impeccable.style/faq, github.com/21st-dev/magic-mcp,
// 21st.dev/mcp.md, 21st.dev/llms.txt (12.000+ componentes), 21st.dev/pricing.md,
// help.21st.dev/cli/setup, el dist de @21st-dev/cli 1.18.0 (escribe .mcp.json con
// type http y x-api-key ${API_KEY_21ST}), code.claude.com/docs/en/mcp y
// ai.google.dev/gemini-api/docs/pricing (modelos de imagen sin nivel gratis).

const UUPM = 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill'
const IMP = 'https://github.com/pbakaus/impeccable'
const MAGIC = 'https://github.com/21st-dev/magic-mcp'

export default {
  slug: 'skills-diseno-interfaz',
  portada: '/aiparatodo/skills-diseno-interfaz.webp',
  seccion: 'skills',
  tema: 'diseno',
  titulo: '3 herramientas para que tus webs no parezcan hechas con IA',
  gancho: 'Que no se note que lo hizo una IA',
  resumen: 'Dos skills y un servidor MCP para que Claude Code diseñe con criterio: UI UX Pro Max elige estructura, colores y tipografías según tu sector, Impeccable revisa y pule la interfaz hasta quitarle los tics de la IA, y 21st.dev le da un catálogo de componentes ya hechos. Con la instalación real de cada una, lo que cuesta y lo que hay que vigilar.',
  fecha: '2026-10-14',
  lectura: '10 min',
  nota: 'Ninguna es oficial de Anthropic. UI UX Pro Max (Next Level Builder, MIT) e Impeccable (Paul Bakaus, Apache-2.0) son skills gratis y de código abierto. 21st.dev no es una skill: es un servidor MCP de una empresa, con plan gratis limitado y planes de pago. Las tres están pensadas para Claude Code y una carpeta con el proyecto de tu web. Si prefieres la skill oficial de Anthropic, frontend-design está en el hilo «5 skills de diseño para Claude».',
  instalarTodo: null,
  skills: [
    {
      n: '01',
      clave: 'ui-ux-pro-max',
      nombre: 'UI UX Pro Max',
      titular: 'Un sistema de diseño hecho para tu sector',
      corto: 'decide estructura, estilo, colores y tipografías según tu tipo de negocio antes de escribir el código',
      historia: 'Si le pides una web a Claude sin más, decide a ojo y suele acabar en lo de siempre: degradado morado, tarjetas iguales, la misma letra. UI UX Pro Max le da datos para decidir. En Claude Code se activa sola cuando le pides una landing, un panel o una app: busca en su base de datos local (en la versión 2.15.0, 192 tipos de producto, 79 estilos, 192 paletas, 74 parejas de tipografías y 119 guías de UX) y genera un sistema de diseño para tu negocio. Ese sistema incluye la estructura de la página, el estilo, los colores con su código, las tipografías de Google Fonts, las animaciones y una lista de lo que no conviene hacer en tu sector. Antes de entregar repasa una checklist: contraste de 4,5:1, foco de teclado visible, que se vea bien a 375, 768, 1024 y 1440 píxeles y nada de emojis haciendo de iconos. Es de las skills de diseño más populares para Claude, con más de 135.000 estrellas en GitHub. Ojo: el plugin instala siete skills de golpe (esta, design, brand, design-system, ui-styling, slides y banner-design) y pueden activarse con cualquier petición que suene a diseño. La de design genera logos, iconos y maquetas con IA de terceros (Gemini de Google, Atlas Cloud o MuAPI) usando tu propia clave, y eso se paga aparte: en la API de Gemini, los modelos de imagen no tienen nivel gratis. Necesitas Python 3 en el ordenador; si no lo tienes, instálalo tú. Y está pensada para Claude Code: el autor no publica una versión para subirla al chat de claude.ai.',
      puedes: [
        'Generar el sistema de diseño de tu negocio (estructura, estilo, colores, tipografías y lo que hay que evitar) antes de escribir una línea',
        'Guardarlo en design-system/<proyecto>/MASTER.md para que todas las páginas sigan la misma línea de una sesión a otra',
        'Ajustar el resultado del 1 al 10: más sobrio o más atrevido, con más o menos animación, con más aire o más denso',
        'Revisar una web que ya tienes: contraste, botones en el móvil, formularios y navegación',
        'Trabajar en tu tecnología: HTML con Tailwind por defecto, y también React, Next.js, Vue, Astro, Laravel, Flutter o SwiftUI, entre 22',
      ],
      autor: 'Next Level Builder',
      oficial: false,
      repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
      ruta: '.claude/skills/ui-ux-pro-max',
      github: UUPM,
      licencia: 'MIT',
      suelta: '/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill\n/plugin install ui-ux-pro-max@ui-ux-pro-max-skill',
      sueltaTitulo: 'Instalar en Claude Code (plugin del autor)',
      sueltaNota: 'Dentro de Claude Code, una línea detrás de otra. Instala el plugin con sus 7 skills. Comprueba antes que tienes Python 3 con python3 --version. Otra vía, en la terminal, dentro de la carpeta del proyecto y con Node: npx ui-ux-pro-max-cli init --ai claude. No uses el paquete antiguo uipro-cli, que el autor da por desfasado, ni copias de otros directorios de skills: instálala siempre desde el plugin o la CLI del autor.',
      ejemplos: [
        { titulo: 'Nutricionista: web para conseguir citas', texto: 'Soy nutricionista en Valencia y paso consulta presencial y online. Usa la skill UI UX Pro Max: primero genera el sistema de diseño para una consulta de nutrición y salud (tono cercano, nada clínico ni frío) y guárdalo como proyecto «Nutri Laura». Luego hazme una landing en HTML + Tailwind con estas secciones: qué hago, para quién es, cómo funciona la primera consulta, testimonios, precios y un botón de reservar cita que se vea arriba del todo y otra vez tras los testimonios. Que se vea perfecta en móvil y pase la checklist de accesibilidad antes de enseñármela.' },
        { titulo: 'Agencia: revisar y mejorar la web que ya tienes', texto: 'Tengo una pequeña agencia de redes sociales y la web actual está en esta carpeta. Usa UI UX Pro Max para hacer una auditoría de diseño y usabilidad: contraste, tamaño de botones en móvil, formularios, navegación y coherencia de colores y tipografías. Dame una lista priorizada (crítico, importante, menor) explicada para alguien que no programa y, cuando te diga «adelante», aplica solo los arreglos críticos sin cambiar los textos.' },
      ],
    },
    {
      n: '02',
      clave: 'impeccable',
      nombre: 'Impeccable',
      titular: 'Un director de diseño que quita los tics de la IA',
      corto: 'revisa, critica y pule la interfaz con 24 comandos y un detector que salta tras cada cambio',
      historia: 'Hay webs que se reconocen hechas con IA a un kilómetro: la fuente Inter para todo, degradados de morado a azul, tarjetas dentro de tarjetas, texto gris sobre fondo de color, un icono en un cuadrado redondeado encima de cada título y animaciones con rebote. Impeccable, de Paul Bakaus, convierte a Claude Code en un director de diseño que conoce esos tics y los evita. Empiezas con /impeccable init: revisa tu proyecto, te pregunta lo que le falte sobre tu público, tu propósito y tu tono, y lo guarda en PRODUCT.md, para que el resto de comandos trabajen con ese contexto. Luego tienes 24 comandos con la forma /impeccable <comando> <zona>: shape para planificar antes de programar, critique para una crítica con puntuación, audit para accesibilidad, rendimiento y móvil, bolder o quieter para subir o bajar el tono, clarify para los textos de botones y errores, y polish para el repaso final. Si escribes /impeccable a secas te enseña un menú y no ejecuta nada por su cuenta. Además trae un detector con 59 reglas fijas que no usa IA: en Claude Code revisa cada archivo de interfaz que Claude edita y le devuelve los fallos. Es gratis y de código abierto. Ojo con tres cosas: esos hooks se ejecutan aparte de los permisos que das a Claude (los apagas con /impeccable hooks off); la primera vez descarga su motor desde GitHub y comprueba su huella SHA-256 antes de usarlo; y al empezar un diseño nuevo consulta la API de impeccable.style y, salvo que lo desactives con npx impeccable telemetry off, le cuenta de forma anónima qué opción elegiste. No manda tu código ni tu PRODUCT.md.',
      puedes: [
        'Planificar una página o un formulario antes de que Claude escriba código (/impeccable shape)',
        'Pedir una crítica de UX con puntuación y una auditoría de accesibilidad, rendimiento y móvil (critique y audit)',
        'Subir o bajar el tono del diseño, quitar lo que sobra y reescribir los textos de la interfaz (bolder, quieter, distill y clarify)',
        'Crear atajos para tus comandos favoritos: /impeccable pin audit te deja usar /audit a secas',
        'Revisar una web ya publicada sin IA ni clave API, desde la terminal y con Chrome, Chromium o Edge instalado: npx impeccable detect https://tuweb.com',
      ],
      autor: 'Paul Bakaus',
      oficial: false,
      repo: 'pbakaus/impeccable',
      ruta: 'plugin/skills/impeccable',
      github: IMP,
      licencia: 'Apache-2.0',
      suelta: '/plugin marketplace add pbakaus/impeccable\n/plugin install impeccable@impeccable\n\n# si te pide /reload-plugins, ejecútalo; luego, ya en la carpeta de tu proyecto:\n/impeccable init',
      sueltaTitulo: 'Instalar en Claude Code (plugin del autor)',
      sueltaNota: 'Dentro de Claude Code. La segunda línea abre la ficha del plugin para que elijas dónde instalarlo, igual que abrir /plugin y elegir Impeccable en Discover. El plugin trae la skill, sus subagentes y los hooks de revisión automática. Por terminal, desde la raíz del proyecto: npx impeccable install (necesita Node 22.18 o superior). Deja archivos en tu proyecto (.impeccable/, PRODUCT.md y DESIGN.md): el README trae un bloque para el .gitignore.',
      ejemplos: [
        { titulo: 'Editor de vídeo: portfolio que luzca el trabajo', texto: '/impeccable critique portfolio Revisa la página de mi portfolio de edición de vídeo como si fueras un director de arte. Dime qué parece hecho por IA, qué distrae de los vídeos y qué cambiarías primero. Después aplica /impeccable distill para que los vídeos sean lo protagonista.' },
        { titulo: 'Creador de contenido: repaso antes de lanzar el curso', texto: '/impeccable audit landing Antes de lanzar la landing de mi curso, revisa la accesibilidad, que se vea bien en el móvil y que cargue rápido. Luego pasa /impeccable clarify a los botones y mensajes del formulario para que estén en español de España, claros y sin jerga, y termina con /impeccable polish.' },
      ],
    },
    {
      n: '03',
      clave: '21st-mcp',
      nombre: '21st.dev (21st MCP, antes Magic MCP)',
      titular: 'Componentes de diseñador sin salir de Claude Code',
      corto: 'no es una skill: es un servidor MCP que conecta Claude con un catálogo de componentes en React y Tailwind',
      historia: 'Esta no es una skill, es un servidor MCP. No le enseña a Claude a diseñar: lo conecta con 21st.dev, un marketplace de componentes de interfaz ya hechos (secciones de precios, cabeceras, menús, testimonios, formularios, temas y plantillas) en React y Tailwind, compatibles con shadcn/ui. La propia 21st.dev habla de más de 12.000. Desde el chat, Claude busca en el catálogo en lenguaje normal, te enseña candidatos, descarga el código del que elijas, lo mete en tu proyecto y lo adapta a tus colores y tipografías. También trae logos de marcas en SVG. Antes se llamaba Magic MCP, y muchos tutoriales cuentan cosas que ya no valen: ya no hace falta escribir /ui, las claves antiguas de Magic se anularon y el plan gratis no genera componentes con IA. Ahora el servidor lo aloja 21st.dev y tú solo necesitas una cuenta y una clave gratuita, que empieza por 21st_sk_. El plan gratis da búsquedas y logos sin límite, pero solo 2 descargas de código al día en total, sumando web, MCP y terminal. El plan Builder, desde 6 $ al mes pagando el año, quita ese límite; generar con IA pide un plan con créditos. Los planes de pago se cobran por trimestre o por año, no hay pago mensual. Y el resultado es código React: sirve si tu web está en React, Next.js o Vite, no para WordPress, Wix o Squarespace.',
      puedes: [
        'Buscar en el catálogo en lenguaje normal («busca en 21st una sección de precios») y ver opciones antes de gastar descargas',
        'Meter el componente elegido en tu proyecto y que Claude lo adapte a tus textos, colores y tipografías',
        'Traer logos de marcas en SVG o JSX, gratis y sin límite',
        'Preguntar qué plan tienes y cuántas descargas te quedan hoy',
        'Con un plan de pago con IA activada y créditos, generar componentes nuevos a partir de un texto',
      ],
      autor: '21st.dev',
      oficial: false,
      repo: '21st-dev/magic-mcp',
      github: MAGIC,
      licencia: 'ISC (repo); cada componente del catálogo indica su propia licencia, y en algunos figura como desconocida',
      suelta: 'npx @21st-dev/cli@latest init --client claude --write\nexport API_KEY_21ST="21st_sk_TU_CLAVE"   # mejor en tu perfil de shell, nunca en el repo\nclaude   # al abrir, aprueba el servidor «21st» del .mcp.json y compruébalo con /mcp',
      sueltaTitulo: 'Conectar el servidor MCP (en la carpeta del proyecto)',
      sueltaNota: 'En tu terminal, con Node 18 o superior. Crea la clave gratis en 21st.dev/mcp. El comando escribe un .mcp.json que lee la clave de la variable API_KEY_21ST, así la clave no acaba en el repo. No la pegues nunca en el chat. Evita de momento la vía de plugin: por un fallo abierto (issue #82) carga la skill pero no el servidor MCP. El código del catálogo lo publica la comunidad: revísalo antes de publicar tu web.',
      ejemplos: [
        { titulo: 'Nutricionista: tabla de precios para la consulta', texto: 'Estoy en la carpeta de la web de mi consulta (React con Tailwind). Usa 21st para buscar secciones de precios con un estilo limpio y tonos verdes. Antes de descargar ningún código, enséñame las 3 mejores opciones con su enlace de vista previa y dime cuántas descargas gratuitas me quedan hoy. Cuando elija una, instálala y adapta los textos a mis tres servicios: Primera consulta 60 €, Bono trimestral 150 € y Seguimiento mensual 45 €. Todo en español y con un botón de «Reservar cita» que lleve a mi página de contacto.' },
        { titulo: 'Editor de vídeo: portada y portfolio', texto: 'Quiero renovar la portada de mi web de editor de vídeo. Busca en 21st un «hero» con vídeo de fondo y una galería tipo portfolio. Elige solo una de cada, porque estoy en el plan gratuito y tengo dos descargas al día. Intégralas en la página de inicio, pon como titular «Edito reels que retienen hasta el último segundo» y comprueba que se ve bien en el móvil antes de darlo por terminado.' },
      ],
    },
  ],
}
