// «Los Mods de Claude» — la guía en PDF de Alex, en datos.
//
// Es el lead magnet del Reel de los Mods («Comenta CLAUDE y te paso la guía»).
// Vive en la sección Guía como guía PRINCIPAL. El PDF está en public/aiparatodo/.
// La página enseña el índice a todo el mundo y, con los cuatro datos dejados, la
// guía entera y la descarga. Entra al embudo «Lead magnet» del CRM de silvestre.
//
// Todo lo técnico está comprobado contra la documentación de Claude Code de
// octubre de 2026 (code.claude.com/docs/en/plugins/mods/*): los Mods necesitan
// la v2.1.287+, van encendidos de serie, corren DENTRO de Claude Code con tus
// permisos (no están aislados) y los bloques de código son los ejemplos reales
// de la documentación. Al regenerar el PDF, copiar el cuerpo de aquí.

export const MODOS_PDF = '/aiparatodo/los-mods-de-claude.pdf'
export const MODOS_PORTADA_3D = '/aiparatodo/mods-3d.webp'

// Para el hilo y las tarjetas (como NN_HILO).
export const MODOS_HILO = {
  slug: 'los-mods-de-claude', seccion: 'guia', tema: 'modos',
  titulo: 'Los Mods de Claude: 3 usos de los que nadie habla (guía en PDF)',
  resumen: 'Qué es un Mod, los 3 usos que más te cambian el día, los prompts para que Claude te los construya solo, y cómo no meterte un troyano. Todo comprobado contra la documentación oficial.',
  fecha: '2026-10-09', lectura: '12 min', principal: true,
}
export const MODOS_RUTA = `/aiparatodo/${MODOS_HILO.seccion}/${MODOS_HILO.tema}/${MODOS_HILO.slug}`

export const MODOS_GANCHO = 'Los Mods de Claude: 3 usos de los que nadie habla'
export const MODOS_INTRO = 'Un Mod convierte Claude Code en TUYO. No es un chat con más botones: es código que corre dentro de Claude —con tus permisos— y le añade paneles, comandos y reglas a tu medida. Lo mejor: no tienes que programarlos, se los pides a Claude y te los construye. Aquí tienes qué son, los 3 usos que de verdad cambian tu día, los prompts para copiar, y cómo no meterte un troyano sin querer.'

// El índice que se ve ANTES de dejar los datos (como IndiceNN).
export const MODOS_INDICE = [
  { n: '01', nombre: 'Qué es un Mod (y por qué no es un plugin más)' },
  { n: '02', nombre: 'Enciéndelos y mira cuáles ya tienes gratis' },
  { n: '03', nombre: 'Uso 1 · El Mod que protege tus límites' },
  { n: '04', nombre: 'Uso 2 · El panel en vivo de tus agentes' },
  { n: '05', nombre: 'Uso 3 · El guardarraíl que frena un desastre' },
  { n: '06', nombre: 'El truco de verdad: que Claude te lo construya' },
  { n: '07', nombre: 'Antes de instalar uno: no te metas un troyano' },
  { n: '08', nombre: 'Prompts para copiar y pegar' },
]

// El cuerpo, en bloques (los mismos que un capítulo: h2/h3/p/lista/pasos/aviso/
// prompt/codigo/tabla). Los bloques `codigo` son ejemplos REALES de la docu.
export const MODOS_BLOQUES = [
  {
    tipo: 'p',
    texto: 'Llevas usando Claude Code para que escriba y arregle cosas. Un **Mod** es el siguiente nivel: le cambias a Claude Code la cara y el comportamiento. Y la parte buena es que **no hace falta programar**: se lo describes y Claude te lo construye.',
  },

  // 01 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Qué es un Mod (y por qué no es un plugin más)' },
  {
    tipo: 'p',
    texto: 'Un Mod es un trozo de código (JavaScript o TypeScript) que corre **dentro** de Claude Code. Claude Code lo llama cuando pasa algo —usas una herramienta, envías un prompt, se dibuja la pantalla— y tu Mod puede mirarlo, cambiarlo o quedárselo. Eso le deja hacer tres cosas que ni las skills, ni los hooks, ni los MCP pueden:',
  },
  {
    tipo: 'lista',
    items: [
      '**Dibujar interfaz de verdad**: un panel al lado de la conversación o una banda encima del cuadro de texto, con botones y campos.',
      '**Meterse en una llamada a una herramienta**: frenar un comando peligroso y preguntarte, responder sin ejecutarlo, o mandar una petición a otro modelo.',
      '**Añadir un comando tuyo** (`/loquesea`) que lanza tu función al instante, sin gastar un turno de Claude, incluso mientras Claude trabaja.',
    ],
  },
  {
    tipo: 'aviso', variante: 'dato', titulo: 'Lo primero de todo',
    texto: 'Los Mods necesitan Claude Code **v2.1.287 o superior** y vienen **encendidos de serie**. Comprueba tu versión con `claude --version` y actualiza si la tuya es más vieja.',
  },

  // 02 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Enciéndelos y mira cuáles ya tienes gratis' },
  {
    tipo: 'p',
    texto: 'Algunas funciones de Claude Code **ya son Mods**. El propio `/diff` lo es. Para ver cuáles tienes cargados, escribe `/plugin` y mira la línea de debajo de las pestañas: te dice el número y los nombres, como `1 mod active · first-mod`.',
  },
  {
    tipo: 'codigo', titulo: 'En tu terminal', nota: 'Comprueba la versión y mira los Mods que ya tienes cargados.',
    texto: 'claude --version\n/plugin',
  },
  {
    tipo: 'p',
    texto: 'Hay uno gratis que mucha gente no conoce: **«You should know»**, un agente que vigila por detrás mientras Claude trabaja en algo largo y te avisa de lo que a ti o a Claude se os podría escapar. Se enciende así:',
  },
  {
    tipo: 'codigo', titulo: 'Activar un Mod que ya viene incluido', nota: 'Un vigilante que te avisa de cosas que se te escaparían. Viene apagado de serie.',
    texto: '/plugin enable cc-plugin-you-should-know@builtin',
  },
  {
    tipo: 'p',
    texto: 'Y Anthropic publica Mods de ejemplo en abierto (repo `anthropics/claude-code-playground`): **token-weather** (dibuja cómo de lleno va tu contexto), **blast-radius** (frena comandos peligrosos como `rm -rf` y te enseña qué harían) y **replay-theater** (un comando `/replay` que repasa los cambios de la última tanda).',
  },

  // 03 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Uso 1 · El Mod que protege tus límites' },
  {
    tipo: 'p',
    texto: 'Lo simple no debería gastarte el modelo potente. Arreglar una errata o renombrar unos archivos no necesita a Opus: con Haiku va sobrado, y **así tus límites de Opus aguantan para lo que de verdad importa** (planear un lanzamiento, un error difícil). Un Mod puede mirar la tarea y mandar lo pequeño a un modelo barato por su cuenta, sin que tú cambies de modelo a mano.',
  },
  {
    tipo: 'prompt', titulo: 'Pídeselo a Claude (copia y pega)',
    texto: 'Constrúyeme un mod para Claude Code que, para trabajos pequeños (renombrar archivos, arreglar una errata, resumir un texto), use el modelo Haiku en vez del potente, para no gastar mis límites de Opus en tonterías. Añádele un comando /modelo que me diga qué modelo está usando ahora mismo.',
  },
  {
    tipo: 'codigo', titulo: 'Lo que hay por debajo (ejemplo real de la documentación)', nota: 'Así manda un Mod un trabajillo a Haiku sin tocar tu conversación: $.model.complete con model: "haiku".',
    texto: "on('command.run', { command: 'triage' }, async ($, e) => {\n  const r = await $.model.complete({\n    model: 'haiku',\n    system: 'Responde con una palabra: bug, mejora o duda.',\n    prompt: e.args,\n    maxTokens: 20,\n    timeoutMs: 15000,\n  })\n  const etiqueta = r.isAnswered ? r.text.trim() : 'desconocido'\n  return { text: 'Etiqueta: ' + etiqueta }\n})",
  },
  {
    tipo: 'aviso', variante: 'truco', titulo: 'Por qué nadie lo cuenta',
    texto: 'Todo el mundo cambia de modelo a mano con `/model` y se olvida. Un Mod lo hace solo, cada vez, para siempre. Es la diferencia entre acordarte… y que no haga falta acordarse.',
  },

  // 04 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Uso 2 · El panel en vivo de tus agentes' },
  {
    tipo: 'p',
    texto: 'Cuando lanzas varios agentes a la vez, pierdes el hilo de qué está haciendo cada uno. Un Mod puede abrir un **panel en vivo** al lado de la conversación y pintar lo que pasa en tiempo real: cuántas herramientas lleva, qué está tocando, cuántas peticiones van. Tú solo se lo pides.',
  },
  {
    tipo: 'prompt', titulo: 'Pídeselo a Claude (copia y pega)',
    texto: 'Constrúyeme un mod que muestre en vivo qué están haciendo mis agentes de Claude Code: un panel al lado de la conversación con cada agente, qué herramienta está usando y cuántas peticiones lleva. Que se actualice solo mientras trabajan.',
  },
  {
    tipo: 'codigo', titulo: 'La pieza clave (ejemplo real de la documentación)', nota: 'Un Mod cuenta cada herramienta que usa Claude y lo pinta junto al spinner: «Pensando · herramientas: 3…». Misma idea, a lo grande, para el panel.',
    texto: "let herramientas = 0\n\nexport function register(on) {\n  // Cada vez que Claude va a usar una herramienta\n  on('tool.call', async ($, e, next) => {\n    herramientas += 1\n    $.ui.invalidate('ui.render')   // vuelve a dibujar\n    return next(e)                  // deja que la herramienta corra\n  })\n\n  // Cada vez que Claude Code dibuja el spinner\n  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {\n    return next({ ...e, props: { ...e.props, suffix: ' · herramientas: ' + herramientas + '…' } })\n  })\n}",
  },
  {
    tipo: 'aviso', variante: 'dato', titulo: 'Dónde se ve',
    texto: 'El panel se dibuja en la terminal y en la pestaña Code de la app de escritorio. En la extensión de VS Code y en `claude -p` el Mod funciona igual, pero no pinta panel.',
  },

  // 05 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Uso 3 · El guardarraíl que frena un desastre' },
  {
    tipo: 'p',
    texto: 'Un `rm -rf` o un `git push --force` en el sitio equivocado te arruina el día. Un Mod puede **retener** el comando peligroso antes de que corra, enseñártelo y preguntarte si tiras p’alante o lo cancelas. Es, de hecho, lo que hace el ejemplo oficial `blast-radius`.',
  },
  {
    tipo: 'prompt', titulo: 'Pídeselo a Claude (copia y pega)',
    texto: 'Constrúyeme un mod que, antes de ejecutar un comando peligroso (rm -rf, git reset --hard, git push --force), lo frene y me pregunte si quiero seguir o cancelar, enseñándome el comando. Para el resto de comandos, que no moleste.',
  },
  {
    tipo: 'codigo', titulo: 'Cómo frena y pregunta (ejemplo real de la documentación)', nota: 'El Mod retiene la llamada, te pregunta con $.ui.ask y solo sigue si dices que sí.',
    texto: "const RIESGO = /rm\\s+-rf|git\\s+reset\\s+--hard|git\\s+push.*--force/\n\non('tool.call', { tool: 'Bash' }, async ($, e, next) => {\n  if (!RIESGO.test(e.command)) return next(e)   // lo normal, sin molestar\n  let respuesta\n  try {\n    respuesta = await $.ui.ask('¿Ejecuto esto? ' + e.command, ['Ejecútalo', 'Cancela'])\n  } catch {\n    return { deny: 'El usuario no lo aprobó.' }\n  }\n  if (respuesta !== 'Ejecútalo') return { deny: 'Cancelado por el usuario.' }\n  return next(e)   // sigue, y aún pasa el permiso normal\n})",
  },
  {
    tipo: 'aviso', variante: 'ojo', titulo: 'Un guardarraíl no es una jaula',
    texto: 'El Mod añade una pregunta tuya, pero no sustituye a los permisos de Claude Code: tras decir «Ejecútalo», el permiso normal sigue pidiéndose. Es una red de seguridad, no un cheque en blanco.',
  },

  // 06 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'El truco de verdad: que Claude te lo construya' },
  {
    tipo: 'p',
    texto: 'No tienes que escribir ni una línea. En una sesión de Claude Code, describes el Mod en tu idioma y Claude lo escribe, usando una skill que ya trae de serie (`plugin-authoring`). Lo guarda en una carpeta suya, te pide aprobar cada archivo, y lo carga en caliente: cada vez que le pides un cambio, se recarga al terminar y lo pruebas al momento.',
  },
  {
    tipo: 'pasos',
    items: [
      { titulo: 'Pídelo', texto: 'En Claude Code: «constrúyeme un mod que…» y lo que quieras. Claude carga la skill `plugin-authoring` y escribe los archivos.' },
      { titulo: 'Aprueba', texto: 'Te pregunta si activas la recarga en caliente para la sesión. Dile que sí: así se carga y se actualiza solo con cada cambio.' },
      { titulo: 'Compruébalo', texto: 'Escribe `/plugin` → pestaña Installed: ahí sale tu Mod y puedes apagarlo.' },
      { titulo: 'Guárdalo', texto: 'Un Mod que te escribe Claude vive solo en esa sesión. Para quedártelo, cópialo a una carpeta tuya (p. ej. `~/mods/mi-mod`) y ábrelo con `claude --plugin-dir ~/mods/mi-mod`.' },
    ],
  },
  {
    tipo: 'codigo', titulo: 'Cargar un Mod tuyo en una sesión', nota: 'Sin instalarlo: lo carga solo para esa sesión y lo recarga cuando cambias un archivo.',
    texto: 'claude --plugin-dir ./mi-mod',
  },

  // 07 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Antes de instalar uno: no te metas un troyano' },
  {
    tipo: 'p',
    texto: 'Esto es lo más importante de toda la guía. Un Mod **corre con tus permisos y no está aislado**. Una vez cargado puede:',
  },
  {
    tipo: 'lista',
    items: [
      'Leer y escribir tus archivos, arrancar programas y hacer peticiones a internet.',
      'Leer tus secretos: variables de entorno y ajustes, **incluida una clave de API** que tengas ahí.',
      'Ver toda tu sesión: cada prompt que envías y cada herramienta que usa Claude.',
      'Actuar sin preguntarte y gastar tu plan o tu clave llamando a un modelo.',
    ],
  },
  {
    tipo: 'p',
    texto: 'Por eso puedes **auditar un Mod antes de instalarlo**, sin ejecutarlo. Clona sus archivos y pásale el validador: te lista qué eventos engancha (`hooks:`) y qué le pide a Claude Code hacer (`calls:`), como leer un archivo o salir a la red.',
  },
  {
    tipo: 'codigo', titulo: 'Auditar un Mod sin ejecutarlo', nota: 'Mira las líneas hooks: y calls: de la salida. Si pide cosas que no cuadran con lo que dice hacer, no lo instales.',
    texto: 'claude plugin validate ./un-mod',
  },
  {
    tipo: 'aviso', variante: 'ojo', titulo: 'La regla de oro',
    texto: 'Instala Mods solo de gente y de sitios en los que confíes. **Si no sabes quién lo hizo, no lo instales.** ¿Un apuro? Arranca con `claude --safe-mode` y esa sesión va sin ningún Mod.',
  },

  // 08 ──────────────────────────────────────────────────────────────────────
  { tipo: 'h2', texto: 'Prompts para copiar y pegar' },
  {
    tipo: 'p',
    texto: 'Pégalos tal cual en una sesión de Claude Code (en un proyecto de confianza) y deja que te los construya. Empieza por uno.',
  },
  {
    tipo: 'prompt', titulo: 'El medidor de contexto',
    texto: 'Constrúyeme un mod que me dibuje encima del cuadro de texto cómo de lleno va mi contexto después de cada respuesta, en porcentaje y con una barra, y que me avise cuando pase del 80%.',
  },
  {
    tipo: 'prompt', titulo: 'El parte del día',
    texto: 'Constrúyeme un mod con un comando /parte que me resuma en 5 líneas qué hemos cambiado hoy en este proyecto (archivos tocados y por qué), para pegarlo en mi registro diario.',
  },
  {
    tipo: 'prompt', titulo: 'El vigilante de claves',
    texto: 'Constrúyeme un mod que, antes de que Claude escriba en un archivo, revise si se está colando una clave de API o una contraseña, y si la ve, lo frene y me avise.',
  },
  {
    tipo: 'prompt', titulo: 'El cronómetro de tareas',
    texto: 'Constrúyeme un mod que mida cuánto tarda cada tarea (desde que envío el prompt hasta que Claude termina) y lo muestre junto al spinner, para saber qué me cuesta más.',
  },
]

export const MODOS_CLAVES = [
  'Un Mod es código que corre DENTRO de Claude Code, con tus permisos, y le añade paneles, comandos y reglas a tu medida.',
  'No programas: se lo pides a Claude y te lo construye, lo apruebas y lo pruebas al momento.',
  'Los 3 usos que cambian el día: enrutar lo simple a un modelo barato, un panel en vivo de tus agentes y un guardarraíl que frena desastres.',
  'Audita siempre con `claude plugin validate` antes de instalar uno de fuera. Si no sabes quién lo hizo, no lo instales.',
  'Necesitas Claude Code v2.1.287+, y ya vienen encendidos.',
]

export const MODOS_ORDEN = [
  { cuando: 'Hoy', que: 'Comprueba tu versión, abre `/plugin` y enciende «You should know».' },
  { cuando: 'Esta semana', que: 'Pídele a Claude el Mod del Uso 1 (enrutar lo simple a Haiku) y pruébalo un par de días.' },
  { cuando: 'Cuando te sientas cómodo', que: 'El panel de agentes y el guardarraíl. Guárdate los que te sirvan en `~/mods`.' },
  { cuando: 'Antes de instalar de fuera', que: 'Siempre `claude plugin validate`. Confía en el autor o no lo instales.' },
]

export const MODOS_FUENTES = [
  { texto: 'Mods — visión general (documentación oficial)', url: 'https://code.claude.com/docs/en/plugins/mods/overview' },
  { texto: 'Crear un Mod (pedírselo a Claude o escribirlo tú)', url: 'https://code.claude.com/docs/en/plugins/mods/create' },
  { texto: 'Mods de ejemplo de Anthropic', url: 'https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods' },
]
