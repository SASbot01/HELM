// Hilo de la sección «Skills y repos», tema «diseño». Lead magnet del reel
// «Claude Opus 5.5 hace que las webs hechas con IA sean mucho mejores… si lo
// configuras bien» (comenta WEB), publicado el 27/11/2026. Guía de Silvestre
// AI: las 4 piezas del reel, con sus órdenes y sus prompts.
// Comprobado el 27/11/2026 leyendo el README y la documentación de cada
// herramienta, sin ejecutar las órdenes:
// - emilkowalski/skills (MIT): el README lista 19 skills (la carpeta tiene 20)
//   y da una sola orden, `npx skills@latest add emilkowalski/skills`. El
//   instalador es la herramienta `skills` (pide Node.js 22.20 o superior y
//   manda estadísticas anónimas; se apagan con DISABLE_TELEMETRY=1).
// - pbakaus/impeccable (Apache-2.0), versión 4.11.1 del 26/11/2026: el README
//   habla de 24 comandos y 62 reglas fijas. Instalación: `npx impeccable
//   install` y luego `/impeccable init`; como plugin, `/plugin marketplace add
//   pbakaus/impeccable` e instalarlo desde `/plugin`.
// - Figma MCP server (developers.figma.com): Figma recomienda el plugin
//   `figma@claude-plugins-official`; a mano, `claude mcp add --transport http
//   figma https://mcp.figma.com/mcp`. Límites de lectura: 20 consultas al mes
//   en Starter; 200 al día con asiento Dev o Full en Professional. Escribir en
//   Figma (use_figma) está en beta y pide Professional y asiento Full.
// - microsoft/playwright-mcp: `claude mcp add playwright npx
//   @playwright/mcp@latest` (Node.js 20 o superior). Por defecto trabaja con
//   la estructura de accesibilidad, no con la imagen. Su README recomienda ya a
//   los agentes de código la versión de terminal (@playwright/cli).
// Los prompts son de Silvestre AI. No se promete ningún resultado.

const EMIL = 'https://github.com/emilkowalski/skills'
const IMP = 'https://github.com/pbakaus/impeccable'
const FIGMA = 'https://developers.figma.com/docs/figma-mcp-server/'
const PW = 'https://github.com/microsoft/playwright-mcp'

const REFERENCIAS = 'En la carpeta referencias/ tienes capturas de webs reales que me gustan. Antes de escribir código, míralas una a una y dime qué tienen en común: tipografía, espaciado, color, cómo ordenan la página y qué NO hacen. Guarda esas reglas en DESIGN.md, con un apartado final que se llame «Huele a IA» con lo que hay que evitar. No copies ninguna: quiero su criterio, no su diseño.'
const REVISAR = 'Usa las skills de diseño de Emil Kowalski que tienes instaladas y revisa esta web. Dime, por orden de importancia, qué detalles hacen que parezca hecha con IA: tipografía, espaciado, jerarquía, sombras y bordes, y animaciones. Para cada uno explica el porqué en una frase y propón el cambio exacto. No toques nada hasta que te diga cuáles aplico.'
const CRITICA = '/impeccable critique portada Revisa la página principal como un director de arte. Dime qué parece hecho por IA, qué distrae de lo importante y qué cambiarías primero.'
const HERO = 'Este es el frame del hero en Figma: [enlace al frame]. Léelo con el conector de Figma y móntalo en esta web con sus medidas, colores y tipografías reales. Usa las variables del archivo, no valores a ojo. Cuando termines, dime qué no has podido reproducir tal cual.'
const BUCLE = 'Abre la web en local con Playwright. Haz una captura a 1440 de ancho y otra a 390. Compáralas con DESIGN.md y con las capturas de referencias/, dime los cinco fallos que más se notan y arréglalos. Repite: captura, lista, arreglo. Para cuando no encuentres nada que cambiarías, o a la quinta vuelta, y enséñame la última captura.'
const LANDING = `Vamos a hacer la landing de [tu negocio]. Trabaja en este orden:
1. Lee DESIGN.md y las capturas de referencias/.
2. Planifica la página con Impeccable (shape) antes de escribir código y espera a que te diga que sí.
3. Monta el hero a partir de este frame de Figma: [enlace al frame].
4. Abre el resultado con Playwright, haz capturas en escritorio y en móvil y pule hasta que no cambiarías nada.
5. Termina con la auditoría y el repaso final de Impeccable (audit y polish).
No uses nada de lo que DESIGN.md marca como «Huele a IA».`
const CLAUDE_MD = `## Diseño de esta web
- Antes de tocar la interfaz, lee DESIGN.md y las capturas de referencias/.
- Usa las skills de diseño instaladas (las de Emil Kowalski e Impeccable) para tipografía, espaciado, jerarquía y animación.
- Si hay un frame de Figma para lo que vas a montar, léelo con el conector de Figma y usa sus medidas y sus variables. No pongas valores a ojo.
- No des una pantalla por terminada sin verla: ábrela con Playwright, haz una captura a 1440 y otra a 390 de ancho y corrige lo que falle.
- Nada de lo que DESIGN.md marca como «Huele a IA».
- Lo que yo te corrija dos veces, apúntalo como regla en DESIGN.md.`

export default {
  slug: 'guia-web-configuracion',
  seccion: 'skills',
  tema: 'diseno',
  tipo: 'guia',
  titulo: 'La configuración de Claude para webs que no huelen a IA: 4 piezas, con sus órdenes y sus prompts',
  gancho: 'Webs que no huelen a IA',
  resumen: 'Si a Claude solo le dices «hazme una web», te sale algo que huele a IA. Esta es la configuración que uso yo para que no pase, pieza a pieza: referencias de webs reales para darle gusto, las skills de diseño de Emil Kowalski e Impeccable para darle criterio, Figma conectado para que lea tus diseños y Playwright para que vea lo que hace y lo pula. Con la orden de instalación de cada una, los prompts tal cual y el bloque para dejarlo fijo en tu proyecto.',
  fecha: '2026-11-27',
  lectura: '10 min',
  nota: 'Guía de Silvestre AI. Las skills de Emil Kowalski (MIT) e Impeccable (Paul Bakaus, Apache-2.0) son proyectos independientes, no de Anthropic; el conector de Figma es el oficial de Figma y Playwright es de Microsoft. Datos comprobados el 27/11/2026 en el README y la documentación de cada uno. Pensada para Claude Code y una carpeta con el proyecto de tu web.',
  portada: '/aiparatodo/web-configuracion.webp',
  instalarTodo: {
    explica: 'Las cuatro órdenes seguidas, en tu terminal y desde la carpeta del proyecto. Después abre Claude Code, lanza /impeccable init y entra en /plugin para iniciar sesión en Figma.',
    titulo: 'Las cuatro, en la terminal',
    comando: 'npx skills@latest add emilkowalski/skills\nnpx impeccable install\nclaude plugin install figma@claude-plugins-official\nclaude mcp add playwright npx @playwright/mcp@latest',
  },
  skills: [
    {
      n: '01', clave: 'que-es', nombre: 'Qué es', corto: 'por qué «hazme una web» huele a IA y qué le falta a Claude',
      titular: 'Por qué «hazme una web» huele a IA',
      historia: 'Los modelos nuevos hacen webs mucho mejores que hace un año. Pero si solo le dices «hazme una web», Claude tira de lo de siempre: la flecha en todos los botones, el fondo crema, una palabra en cursiva en el titular, tres tarjetas con iconos en fila. No le falta capacidad. Le faltan cuatro cosas, y cada una se le da con una pieza: gusto (referencias de webs reales), criterio (skills de diseño), tus diseños (Figma conectado) y ojos (un navegador para ver lo que hace). Esta es la configuración que uso yo, con las órdenes y los prompts tal cual. Se monta una vez por proyecto y vale para todas sus páginas.',
      puedesTitulo: 'Lo que necesitas',
      puedes: [
        'Claude Code, con el plan que ya tengas',
        'Node.js 22.20 o superior: lo pide el instalador de skills',
        'La carpeta del proyecto de tu web, aunque esté vacía',
        'Opcional: una cuenta de Figma. La gratuita vale para probar',
      ],
      ejemplos: [],
    },
    {
      n: '02', clave: 'referencias', nombre: 'Pieza 1 · Gusto', corto: 'webs reales, convertidas en reglas',
      titular: 'Pieza 1: dale gusto con webs reales',
      historia: 'Claude no sabe qué te parece un buen diseño si no se lo enseñas. Decirle «hazla moderna y limpia» no sirve: eso es justo lo que da el resultado de siempre. Lo que funciona es pasarle de tres a cinco capturas de webs reales que te gusten, de tu sector y alguna de fuera, y pedirle que saque de ellas las reglas antes de escribir código. Guarda las capturas en una carpeta referencias/ dentro del proyecto. Lo importante del prompt son dos cosas: que te diga qué NO hacen esas webs, y que lo deje escrito en un archivo, DESIGN.md, para que no se le olvide en el siguiente chat.',
      puedesTitulo: 'Cómo prepararlo',
      puedes: [
        'De 3 a 5 capturas: la portada entera y alguna sección que te guste',
        'Mejor capturas que enlaces: así ve exactamente lo que ves tú',
        'El resultado es DESIGN.md: tipografía, espaciado, color y lo que no se hace',
        'No se copia ninguna web: se saca su criterio',
      ],
      ejemplos: [
        { titulo: 'Sacar las reglas de tus referencias', texto: REFERENCIAS },
      ],
    },
    {
      n: '03', clave: 'emil-design-eng', nombre: 'Pieza 2 · Skills de Emil Kowalski', corto: 'animación, interacción y los principios de diseño de Apple',
      titular: 'Pieza 2: criterio, con las skills de Emil Kowalski',
      historia: 'Una skill es un archivo de instrucciones que Claude carga solo cuando lo necesita. Emil Kowalski, Design Engineer, ha publicado las suyas en abierto: su README lista 19 a fecha de esta guía. La principal, emil-design-eng, va sobre todo de animación, con algo de diseño. Alrededor tiene otras para casos concretos: apple-design pasa a la web los principios de diseño de Apple, review-animations revisa tus animaciones con sus reglas, break-ui prueba la interfaz con datos extremos, mobile-native hace que una web se sienta como una app en el móvil y learn-taste convierte tus correcciones en reglas dentro de DESIGN.md. La orden instala el paquete entero. Ojo: el instalador manda estadísticas de uso anónimas; se apagan escribiendo DISABLE_TELEMETRY=1 delante de la orden.',
      puedes: [
        'Animaciones con las curvas y los tiempos bien elegidos',
        'Revisar las animaciones que ya tienes (review-animations)',
        'Probar la interfaz con textos larguísimos y datos raros (break-ui)',
        'Guardar lo que le corriges como reglas (learn-taste)',
        'Instalar solo una: añade --skill apple-design al final de la orden',
      ],
      hilo: { ruta: '/aiparatodo/skills/diseno/skill-apple-design', texto: 'Leer el hilo de Apple Design' },
      github: EMIL, autor: 'Emil Kowalski', oficial: false, repo: 'emilkowalski/skills', licencia: 'MIT',
      sueltaTitulo: 'Instalar las skills de Emil Kowalski',
      sueltaNota: 'En tu terminal. Te pregunta en qué herramienta y dónde instalarlas: elige Claude Code. Necesita Node.js 22.20 o superior. Si tenías Claude Code abierto, reinícialo.',
      suelta: 'npx skills@latest add emilkowalski/skills',
      ejemplos: [
        { titulo: 'Que revise tu web con criterio', texto: REVISAR },
      ],
    },
    {
      n: '04', clave: 'impeccable', nombre: 'Pieza 2 · Impeccable', corto: 'un director de diseño con un comando para cada momento',
      titular: 'Impeccable: planificar, criticar y pulir',
      historia: 'Impeccable, de Paul Bakaus, convierte a Claude Code en un director de diseño que conoce los tics de las webs hechas con IA y los evita. Se instala desde la carpeta del proyecto y se arranca con /impeccable init: te pregunta por tu público, tu propósito y tu tono y lo guarda en PRODUCT.md, para que el resto de comandos trabajen con ese contexto. A partir de ahí tienes comandos con la forma /impeccable <comando>: shape para planificar una página antes de programarla, critique para una crítica con nota, audit para el repaso técnico y polish para el acabado final. Además trae un detector de reglas fijas que no usa IA: 62 según su README, en la versión 4.11.1. Ojo con dos cosas. El instalador te ofrece un hook de diseño, y en Claude Code los hooks se ejecutan aparte de los permisos que le das al modelo. Y manda estadísticas de uso anónimas, que se apagan con npx impeccable telemetry off.',
      puedes: [
        'Planificar la página antes de escribir código (shape)',
        'Una crítica de diseño con nota (critique)',
        'Un repaso técnico con prioridades (audit)',
        'El acabado final (polish) y los textos de botones y errores (clarify)',
        'Revisar una carpeta sin IA, desde la terminal: npx impeccable detect src/',
      ],
      hilo: { ruta: '/aiparatodo/skills/diseno/skills-diseno-interfaz', texto: 'Leer el hilo de las 3 herramientas de diseño' },
      github: IMP, autor: 'Paul Bakaus', oficial: false, repo: 'pbakaus/impeccable', licencia: 'Apache-2.0',
      sueltaTitulo: 'Instalar Impeccable',
      sueltaNota: 'La primera línea, en tu terminal y desde la raíz del proyecto. La última, dentro de Claude Code. También se puede instalar como plugin: /plugin marketplace add pbakaus/impeccable y luego elegir Impeccable en /plugin.',
      suelta: 'npx impeccable install\n\n# reinicia Claude Code y, ya en la carpeta del proyecto:\n/impeccable init',
      ejemplos: [
        { titulo: 'Crítica de tu portada', texto: CRITICA },
      ],
    },
    {
      n: '05', clave: 'figma', nombre: 'Pieza 3 · Figma', corto: 'que lea tus diseños en vez de adivinarlos',
      titular: 'Pieza 3: tus diseños, con Figma conectado',
      historia: 'Si le describes un diseño con palabras, Claude lo adivina. Si le conectas Figma, lo lee: medidas, colores, tipografías y variables. Figma tiene un conector oficial (un servidor MCP) y recomienda instalarlo como plugin de Claude Code, que ya trae la conexión y sus skills. Después de instalarlo, reinicia Claude Code, entra en /plugin, pestaña de instalados, elige figma, inicia sesión y pulsa «Allow access» en el navegador. Para usarlo, copia en Figma el enlace al frame que quieras y pégalo en el prompt. Y si no diseñas en Figma, te vale igual: pega ahí tus referencias y tus pruebas y que las lea desde ahí. Dos límites que conviene saber. En el plan gratuito de Figma son 20 consultas al mes. Y que Claude escriba en tus archivos de Figma está en beta y pide plan Professional y asiento Full; leer funciona en todos los planes.',
      puedes: [
        'Montar una sección a partir de un frame, con sus medidas reales',
        'Usar las variables de color y de tipografía del archivo',
        'Sacar una captura del diseño para compararla con lo montado',
        'Plan gratuito: 20 consultas al mes. Con asiento Dev o Full en Professional, 200 al día',
      ],
      web: { nombre: 'Figma MCP server', detalle: 'Documentación oficial de Figma, en inglés', url: FIGMA, boton: 'Abrir' },
      sueltaTitulo: 'Instalar el conector de Figma',
      sueltaNota: 'En tu terminal. Si prefieres conectarlo a mano: claude mcp add --transport http figma https://mcp.figma.com/mcp y, dentro de Claude Code, /mcp > figma > Authenticate.',
      suelta: 'claude plugin install figma@claude-plugins-official',
      ejemplos: [
        { titulo: 'Montar el hero desde Figma', texto: HERO },
      ],
    },
    {
      n: '06', clave: 'playwright', nombre: 'Pieza 4 · Playwright', corto: 'que vea la web, la corrija y repita',
      titular: 'Pieza 4: ojos, con Playwright',
      historia: 'Es la pieza que más cambia el resultado. Sin ella, Claude escribe el código y no ve cómo queda: diseña con la pantalla apagada. Playwright, de Microsoft, le da un navegador: abre la web, cambia el tamaño de la ventana, hace capturas y lee los errores de la consola. Un detalle importante: por defecto no mira la imagen, lee la estructura de la página, que le sirve para navegar pero no para juzgar un diseño. Por eso en el prompt le pides capturas de forma expresa, en escritorio y en móvil. Y le dices cuándo parar, porque cada captura que mira gasta de tu plan. El propio Playwright recomienda ya a los agentes de código su versión de terminal, que gasta menos; el conector de aquí abajo sigue funcionando y es el más fácil de montar.',
      puedes: [
        'Ver la página de verdad, a 1440 y a 390 de ancho',
        'Encontrar lo que se rompe en el móvil',
        'Leer los errores de la consola',
        'Repetir captura, lista de fallos y arreglo hasta que no cambiaría nada',
        'Alternativa que gasta menos: npm install -g @playwright/cli@latest y luego playwright-cli install --skills',
      ],
      web: { nombre: 'microsoft/playwright-mcp', detalle: 'El servidor MCP de Playwright, de Microsoft. Necesita Node.js 20 o superior', url: PW, boton: 'Ver en GitHub' },
      sueltaTitulo: 'Conectar Playwright a Claude Code',
      sueltaNota: 'En tu terminal, desde la carpeta del proyecto. Al abrir Claude Code, comprueba con /mcp que playwright aparece conectado.',
      suelta: 'claude mcp add playwright npx @playwright/mcp@latest',
      ejemplos: [
        { titulo: 'El bucle de pulido', texto: BUCLE },
      ],
    },
    {
      n: '07', clave: 'todo-junto', nombre: 'Todo junto', corto: 'el prompt para la web entera y el bloque para tu CLAUDE.md',
      titular: 'Las cuatro piezas a la vez',
      historia: 'Con las cuatro piezas instaladas, la web se pide en orden: primero lee las reglas, luego planifica, luego monta desde tu diseño y al final mira y pule. El primer prompt es ese orden, tal cual. El segundo es un bloque para pegar en el archivo CLAUDE.md de tu proyecto: son las instrucciones que Claude Code lee al empezar cada sesión, así que no tienes que repetírselo cada vez.',
      puedesTitulo: 'Qué te llevas',
      puedes: [
        'Un solo prompt para la landing entera',
        'Se para a que apruebes el plan antes de programar',
        'El bloque de CLAUDE.md deja la configuración fija en el proyecto',
        'Cambia lo que va entre corchetes por lo tuyo',
      ],
      ejemplos: [
        { titulo: 'La landing entera, en orden', texto: LANDING },
        { titulo: 'El bloque para tu CLAUDE.md', texto: CLAUDE_MD },
      ],
    },
    {
      n: '08', clave: 'antes-de-usarlo', nombre: 'Antes de usarlo', corto: 'de quién es cada pieza, qué gasta y qué no hace',
      titular: 'Lo que conviene saber',
      historia: 'Las skills de Emil Kowalski e Impeccable no son de Anthropic: son proyectos independientes, gratis y de código abierto, y conviene mirar el repo antes de instalar nada. El conector de Figma sí es el oficial de Figma, y Playwright es de Microsoft. Todo se usa con tu plan de Claude, y lo que más gasta es el bucle de Playwright, porque cada captura que mira cuenta. Los números de esta guía (19 skills, la versión 4.11.1, los límites de Figma) son los del 27 de noviembre de 2026 y cambian a menudo. Y nada de esto pone tu marca ni tu oferta: qué vendes y a quién se lo sigues diciendo tú.',
      puedesTitulo: 'En resumen',
      puedes: [
        'Skills de terceros: mira el repo antes de instalar',
        'El instalador de skills e Impeccable mandan estadísticas anónimas, y se pueden apagar',
        'Figma gratis: 20 consultas al mes',
        'El bucle de Playwright gasta de tu plan: dile cuándo parar',
        'Tu marca y tu oferta las pones tú',
      ],
      ejemplos: [],
    },
  ],
}
