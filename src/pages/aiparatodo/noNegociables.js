// «Mis 8 no negociables con Claude» — la guía en PDF de Alex, en datos.
//
// El PDF está en public/aiparatodo/. La página del hilo enseña el índice a
// todo el mundo y, con los datos dejados, los 8 puntos enteros y la descarga.
// Si se cambia el PDF, se cambia esto a la vez: es el mismo texto.

export const NN_PDF = '/aiparatodo/mis-8-no-negociables-con-claude.pdf'
export const NN_PORTADA_3D = '/aiparatodo/no-negociables-3d.webp'

export const NN_INTRO = 'Estas son las 8 cosas que hago siempre que trabajo con Claude. No son trucos: son la diferencia entre pedirle cosas a un chat y tener un sistema que trabaja por ti. Casi todas viven en Claude Code, la versión de Claude que trabaja directamente en tu ordenador. No hace falta ser programador: cada punto te dice qué es, un ejemplo y el primer paso.'

export const NN_PUNTOS = [
  {
    n: '01', nombre: 'Composio', titulo: 'Composio: conecta Claude con tus apps',
    frase: 'Tu asistente personal deja de ser un chat y empieza a hacer cosas.',
    que: 'Un puente entre Claude y más de 1.500 aplicaciones: correo, calendario, CRM, WhatsApp Business, Notion y muchas más. Lo conectas una vez y Claude puede leer, escribir y actuar en ellas.',
    ejemplo: '«Revisa mi correo, apunta en el CRM los contactos nuevos y prepárame una respuesta para cada uno.»',
    pasos: [
      'Crea una cuenta gratuita en Composio.',
      'En Claude, ve a Personalizar → Conectores → + → Añadir conector personalizado, y pega `https://connect.composio.dev/mcp`',
      'Pídele a Claude «conéctate a Gmail» (o a tu CRM) y autoriza el acceso cuando te lo pida.',
    ],
    donde: 'composio.dev',
    ojo: 'WhatsApp funciona con WhatsApp Business (la versión para empresas), no con tu WhatsApp personal. Y dale acceso solo a lo que necesites: Claude podrá actuar en esas cuentas.',
  },
  {
    n: '02', nombre: 'Skills', titulo: 'Skills: explícalo una vez, repítelo mil',
    frase: 'Para cualquier tarea que hagas más de dos veces.',
    que: 'Una skill es una ficha de instrucciones guardada: cómo se hace una tarea, paso a paso, con tus reglas y ejemplos. Claude la lee cada vez que toca esa tarea y la hace siempre igual, sin que se lo vuelvas a explicar.',
    ejemplo: 'Una skill «guiones» con tu estructura, tu tono y lo que nunca dices. Cada vez que pides un guion, sale con tu estilo.',
    pasos: [
      'Elige la tarea que más repites.',
      'Pídele a Claude «crea una skill para esta tarea» y explícale cómo la haces tú, con un ejemplo bueno y uno malo.',
      'Pruébala tres veces y corrige la skill, no el resultado: así mejora para siempre.',
    ],
    donde: 'code.claude.com/docs (sección Skills)',
    ojo: 'Una skill por tarea. Si mezclas tres tareas en una, Claude se lía.',
  },
  {
    n: '03', nombre: 'Loops', titulo: 'Loops: no escribo prompts, escribo «terminado»',
    frase: 'Claude no te devuelve la tarea hasta que está hecha de verdad.',
    que: 'En vez de pedir algo y revisar a mano si quedó bien, defines qué significa «terminado». Con `/goal` Claude sigue trabajando, comprobando y corrigiendo hasta que se cumple. Con `/loop` repite una tarea cada cierto tiempo.',
    ejemplo: '`/goal todos los tests pasan y la página carga sin errores`',
    pasos: [
      'Antes de pedir la tarea, escribe en una frase cómo sabrás que está bien hecha.',
      'Que se pueda comprobar: «los tests pasan», «el archivo existe», «no hay errores». No «que quede bonito».',
      'Lánzalo con `/goal` y deja que trabaje.',
    ],
    donde: 'code.claude.com/docs (comandos /goal y /loop)',
    ojo: 'Un loop sin condición clara gasta tokens sin parar. La frase de «terminado» es lo más importante.',
  },
  {
    n: '04', nombre: 'Modo plan', titulo: 'Modo plan para todo lo grande',
    frase: 'Primero el plano, luego la obra.',
    que: 'En modo plan, Claude investiga y te enseña paso a paso lo que va a hacer, sin tocar nada todavía. Tú lo corriges y, cuando el plan está bien, lo construye solo.',
    ejemplo: 'Antes de rehacer tu web: te enseña qué archivos va a cambiar, en qué orden y por qué. Le quitas lo que no quieres y le das luz verde.',
    pasos: [
      'En Claude Code, pulsa Mayús + Tab hasta que veas que estás en modo plan.',
      'Pide la tarea grande y lee el plan entero.',
      'Corrige lo que no te convenza y apruébalo. Solo entonces empieza a construir.',
    ],
    donde: 'code.claude.com/docs (Plan mode)',
    ojo: 'Diez minutos corrigiendo el plan ahorran horas deshaciendo cosas.',
  },
  {
    n: '05', nombre: 'Subagentes', titulo: 'Subagentes: varias tareas a la vez',
    frase: 'Si las tareas no dependen entre sí, no hagas cola.',
    que: 'Un subagente es otro Claude especializado que trabaja en paralelo, con su propia memoria de trabajo. Mientras uno investiga, otro escribe y otro revisa. El principal recoge los resultados.',
    ejemplo: '«Con subagentes en paralelo: uno analiza a mis 3 competidores, otro revisa mi web y otro me prepara 10 ideas de contenido.»',
    pasos: [
      'Separa tu trabajo en tareas que no necesiten el resultado de otra.',
      'Pídele a Claude que las haga «con subagentes en paralelo».',
      'Para crear subagentes fijos (un revisor, un investigador), usa el comando `/agents`.',
    ],
    donde: 'code.claude.com/docs/en/sub-agents',
    ojo: 'Varios agentes a la vez gastan más tokens. Úsalos para tareas independientes, no para todo.',
  },
  {
    n: '06', nombre: 'Hooks', titulo: 'Hooks: acciones que saltan solas',
    frase: 'Lo que siempre hay que hacer, que se haga sin pedirlo.',
    que: 'Un hook es una regla automática: «cuando pase esto, haz aquello». Se ejecuta siempre, sin depender de que Claude se acuerde.',
    ejemplo: 'Cuando Claude termina de tocar una función de mi app, un hook lanza Playwright, que abre la app en un navegador de verdad, la prueba como un usuario y busca errores.',
    pasos: [
      'Piensa en algo que siempre haces después de un cambio: probar, ordenar el código, avisar.',
      'En Claude Code escribe `/hooks` y elige el momento (por ejemplo, al terminar una tarea).',
      'Para pruebas automáticas en el navegador, instala Playwright y pide a Claude que te escriba las pruebas.',
    ],
    donde: 'code.claude.com/docs/en/hooks · playwright.dev',
    ojo: 'Un hook ejecuta comandos en tu ordenador. Pon solo los que entiendas.',
  },
  {
    n: '07', nombre: 'El modelo correcto', titulo: 'El modelo correcto (y un plan B)',
    frase: 'No uses un camión para ir a por el pan.',
    que: 'Claude tiene tres familias de modelos. Opus, el más potente, para lo pesado: diseñar un sistema, un error difícil. Sonnet para el trabajo del día a día. Haiku, el más rápido y barato, para tareas simples y repetitivas.',
    ejemplo: 'Planifico la arquitectura con Opus, construyo con Sonnet y los resúmenes o clasificaciones van con Haiku.',
    pasos: [
      'En Claude Code escribe `/model` y elige según la tarea.',
      'Si un subagente hace algo sencillo, asígnale Haiku.',
      'Plan B: si te quedas sin uso en Claude, Codex de OpenAI funciona en la terminal iniciando sesión con tu cuenta de ChatGPT.',
    ],
    donde: 'code.claude.com/docs · Codex: github.com/openai/codex',
    ojo: 'Codex no es ilimitado: usa los límites de tu plan de ChatGPT. El plan gratuito da un acceso muy limitado; para trabajar en serio necesitas uno de pago.',
  },
  {
    n: '08', nombre: 'Todo a GitHub', titulo: 'Todo a GitHub el mismo día',
    frase: 'Si no está en GitHub, no existe.',
    que: 'GitHub guarda tu trabajo en la nube con todo su historial. Si algo se rompe, vuelves a la versión de ayer. Si se te estropea el ordenador, no pierdes nada.',
    ejemplo: 'Al acabar el día le digo a Claude: «guarda todo en GitHub con un resumen de lo que hemos hecho hoy».',
    pasos: [
      'Crea una cuenta gratuita en GitHub. Los repositorios privados son gratis.',
      'Pídele a Claude que cree el repositorio y suba el proyecto.',
      'Haz de «súbelo a GitHub» lo último que pides cada día. Mejor aún: conviértelo en un hook.',
    ],
    donde: 'github.com',
    ojo: 'Nunca subas contraseñas ni claves de API. Pídele a Claude que las deje fuera (en un archivo .env ignorado).',
  },
]

export const NN_ORDEN = [
  { cuando: 'Semana 1', que: 'Instala Claude Code, súbelo todo a GitHub y usa el modo plan para cualquier tarea grande.' },
  { cuando: 'Semana 2', que: 'Crea tu primera skill con la tarea que más repites.' },
  { cuando: 'Semana 3', que: 'Conecta tu correo con Composio y aprende a elegir el modelo.' },
  { cuando: 'Semana 4', que: 'Cuando ya te sientas cómodo: loops, subagentes y hooks.' },
]
