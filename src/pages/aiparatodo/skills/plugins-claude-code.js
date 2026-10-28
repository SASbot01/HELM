// Hilo de la sección Skills (tema «desarrollo»): cinco complementos para Claude Code.
// Comprobado el 14/10/2026 con la API de GitHub (README, SKILL.md, manifiestos de plugin,
// marketplace.json y releases de cada repo), el marketplace oficial de Anthropic
// (anthropics/claude-plugins-official, .claude-plugin/marketplace.json), skills.sh,
// registry.npmjs.org, code.claude.com/docs, docs.coderabbit.ai, coderabbit.ai/pricing y
// cmem.ai/pricing. No se ha instalado ni ejecutado nada: todo sale de documentación y código.
// - vercel-labs/skills (MIT, 34.845★, push 09/10/2026): skill find-skills en
//   skills/find-skills/SKILL.md, sin versión propia; usa la CLI npm «skills» v1.7.2
//   (Node >= 22.20). skills.sh la pone la 1.ª del ranking (3,8M instalaciones). Snyk: riesgo
//   medio (W011, contenido de terceros); Gen Agent Trust Hub «Safe»; Socket «Pass».
//   npx skills remove sin -g busca solo en el proyecto (src/remove.ts): por eso -g.
// - obra/superpowers (MIT, 298.936★, push 10/10/2026, v7.0.0): 15 skills + hook SessionStart
//   (startup|clear|compact). claude-plugins-official lo ancla al sha 5bf4e78 = v6.4.1; el
//   marketplace del autor (obra/superpowers-marketplace) sirve la 7.0.0. Tiene hilo propio:
//   skills-claude-code-pro.js (/aiparatodo/skills/desarrollo/skills-claude-code-pro).
// - thedotmack/claude-mem (Apache-2.0 en el núcleo, open-core; 100.624★, push 13/10/2026,
//   v13.39.0): su marketplace se llama «thedotmack» y trae el plugin claude-mem 13.39.0.
//   CMEM Pro (cmem.ai/pricing): 30 días de prueba y luego 30 $/mes; el cobro puede empezar
//   antes si se gasta el uso incluido. package.json: engines node >=20.12.0.
// - rebelytics/one-skill-to-rule-them-all (CC-BY-4.0, 3.327★, push 09/10/2026, v3.6.0):
//   SKILL.md en la raíz del repo; release v3.6.0 con el asset task-observer.skill. Bloque de
//   activación en references/environments.md. skills.sh: 11,6K instalaciones (14/10/2026).
// - coderabbitai/skills (MIT, 190★, push 14/10/2026): plugin «coderabbit» en
//   claude-plugins-official (sha 3e8763d = v1.1.1, comando /coderabbit:coderabbit-review).
//   CLI de CodeRabbit 0.9.0 (cask de Homebrew del 08/10/2026). Free: 3 revisiones/hora en
//   CLI, en PR solo resúmenes; Essentials 24 $/mes por desarrollador con pago anual.
//
// NO CONFIRMADO (por eso no se afirma en las tarjetas):
// - Task Observer como plugin (/plugin marketplace add rebelytics/one-skill-to-rule-them-all
//   y /plugin install task-observer@one-skill-to-rule-them-all): el repo trae plugin.json y
//   marketplace.json válidos, pero el README no documenta esa vía y el SKILL.md está en la raíz,
//   no en skills/; no se ha comprobado que el plugin la cargue. Se dejan solo npx skills, la
//   subida del .skill y la copia manual.
// - Find Skills: no comprobado que funcione en claude.ai web (necesita ejecutar npx con
//   internet) ni que se invoque con /find-skills; skills.sh no aclara de qué periodo son las
//   3,8M instalaciones.
// - Superpowers: la ficha claude.com/plugins/superpowers cita comandos /brainstorming y
//   /execute-plan que el repo actual no tiene (no tiene commands/ ni agents/); no se sabe
//   cuándo pasará el marketplace oficial a la 7.0.0. No se publica la cifra de instalaciones.
// - Claude-Mem: si la prueba de CMEM Pro pide tarjeta (cmem.ai dice que sí; el README, que
//   el alta no); el flujo exacto de inicio de sesión; el puerto real del visor (37700 + uid %
//   100); qué herramientas MCP se exponen por defecto; cómo se invocan sus skills con barra.
// - CodeRabbit: en la 1.2.0 (sin publicar) el comando pasa a /coderabbit:code-review; los
//   precios salen con «$» sin nombrar la moneda; el plan Free solo aparece en la
//   documentación; licencia del binario de la CLI desconocida; Windows sin verificar; su
//   llegada a claude.ai/escritorio está «Submission in progress» (DISTRIBUTION_CHANNELS.md).

const FS = 'https://github.com/vercel-labs/skills'
const SP = 'https://github.com/obra/superpowers'
const CM = 'https://github.com/thedotmack/claude-mem'
const TO = 'https://github.com/rebelytics/one-skill-to-rule-them-all'
const CR = 'https://github.com/coderabbitai/skills'

export default {
  slug: 'plugins-claude-code',
  portada: '/aiparatodo/plugins-claude-code.webp',
  seccion: 'skills',
  tema: 'desarrollo',
  titulo: '5 complementos que le instalas a Claude Code',
  gancho: 'Que Claude Code busque, recuerde y se deje revisar',
  resumen: 'Lo que le instalas a Claude Code para que encuentre skills solo, trabaje con método, recuerde entre sesiones, convierta tus correcciones en mejores skills y pase el código por un revisor externo antes de que lo publiques. Con qué instala cada uno en tu ordenador, qué sale de él y cuánto cuesta.',
  fecha: '2026-10-14',
  lectura: '10 min',
  nota: 'Ninguno es oficial de Anthropic. Find Skills es de Vercel Labs (MIT), Superpowers de Jesse Vincent (MIT), Claude-Mem de Alex Newman (Apache 2.0, con un servicio de pago opcional), Task Observer de Eoghan Henn (CC BY 4.0) y CodeRabbit de la empresa del mismo nombre (el plugin es MIT y gratis, pero cada revisión gasta la cuota de tu plan de CodeRabbit, que tiene uno gratuito limitado). Superpowers y CodeRabbit están en el marketplace oficial de Anthropic para Claude Code. Comprobado repo a repo el 14/10/2026.',
  instalarTodo: null,
  skills: [
    {
      n: '01',
      clave: 'find-skills',
      nombre: 'Find Skills',
      titular: 'Que Claude te busque la skill que te falta',
      corto: 'cuando preguntas «¿hay alguna skill para…?», busca en skills.sh, descarta las dudosas y te la instala si dices que sí',
      historia: 'Es una skill para encontrar skills. Cuando le preguntas a Claude «¿hay alguna skill que haga…?» o «¿cómo hago esto?», se activa sola: mira primero el ranking de skills.sh, el directorio de Vercel ordenado por instalaciones, y si ahí no hay nada busca con npx skills find. Antes de recomendarte nada aplica un filtro: prefiere las que pasan de 1.000 instalaciones, desconfía de las que no llegan a 100 o vienen de repos con menos de 100 estrellas, y da más peso a fuentes como Anthropic, Vercel o Microsoft. Te enseña el nombre, qué hace, cuántas instalaciones tiene, el comando y el enlace a su ficha, y la instala si le dices que sí. Un editor de vídeo que necesita subtítulos no tiene que rebuscar en GitHub: pregunta y elige. Como lee contenido que publica cualquiera, Snyk le da un riesgo medio de inyección de instrucciones, y la propia skill instala con -y, sin confirmaciones: pídele siempre que te enseñe el comando y la ficha antes de instalar.',
      puedes: [
        'Preguntar en lenguaje normal («¿hay alguna skill para maquetar PDF?») y recibir opciones con su autor y sus instalaciones',
        'Que descarte por ti las skills con pocas instalaciones o de repos poco conocidos',
        'Ver la ficha de skills.sh de cada una, con sus auditorías de seguridad, antes de instalar nada',
        'Instalarla solo para tu usuario o solo en el proyecto, y quitarla después con npx skills remove',
        'Si no existe ninguna, que te ayude con la tarea y te proponga crear tu propia skill con npx skills init',
      ],
      autor: 'Vercel Labs',
      oficial: false,
      repo: 'vercel-labs/skills',
      ruta: 'skills/find-skills',
      github: `${FS}/tree/main/skills/find-skills`,
      licencia: 'MIT',
      suelta: 'npx skills add vercel-labs/skills --skill find-skills -g -a claude-code -y\n\n# comprobar, actualizar o quitar:\nnpx skills list -g\nnpx skills update find-skills\nnpx skills remove -g find-skills',
      sueltaTitulo: 'Instalar en tu terminal',
      sueltaNota: 'Necesitas Node.js 22.20 o superior. -g la deja en ~/.claude/skills para todos tus proyectos, -a claude-code la instala solo para Claude Code y -y se salta las preguntas. Claude Code la detecta sin reiniciar; si la carpeta ~/.claude/skills no existía al abrir la sesión, escribe /reload-skills. La CLI manda telemetría anónima: se apaga con DISABLE_TELEMETRY=1 o DO_NOT_TRACK=1.',
      ejemplos: [
        { titulo: 'Nutricionista: planes de menú en PDF', texto: 'Soy nutricionista y cada semana preparo planes de comidas en PDF para mis pacientes. ¿Hay alguna skill que me ayude a crear documentos PDF o Word con buena maquetación? Búscala, dime cuántas instalaciones tiene, de quién es y qué riesgos ves, y no instales nada hasta que te lo confirme.' },
        { titulo: 'Editor de vídeo: subtítulos y guiones', texto: 'Edito reels y vídeos para clientes. Búscame skills para generar subtítulos, transcribir audio o escribir guiones de vídeo corto. Enséñame las tres mejores con su enlace a skills.sh y el comando de instalación, explícame en una frase qué hace cada una y no instales ninguna sin que yo vea antes el comando.' },
      ],
    },
    {
      n: '02',
      clave: 'superpowers',
      nombre: 'Superpowers',
      titular: 'El método completo, en un solo plugin',
      corto: 'el plugin entero: 15 skills y un hook que obliga a Claude a usarlas antes de responder',
      hilo: { ruta: '/aiparatodo/skills/desarrollo/skills-claude-code-pro', texto: 'Leer el hilo de Superpowers' },
      historia: 'Superpowers ya tiene su propio hilo en este mismo tema, «8 skills para que Claude Code trabaje con método», donde se explican una a una brainstorming, writing-plans, executing-plans, las pruebas, la depuración y la verificación. Aquí va como lo que es: un plugin que se instala entero. Trae 15 skills y un hook que, al empezar cada sesión, tras un /clear y después de compactar, le mete a Claude la skill using-superpowers, que le obliga a buscar y usar la skill que toque antes de responder. Por eso no tienes que nombrarlas: si pides una web, primero te pregunta, luego escribe un plan, lo ejecuta y comprueba antes de decir «listo». Está pensado sobre todo para programar (pruebas, ramas de git, revisión de código); a un negocio que no programa le sirven sobre todo brainstorming, writing-plans y verification-before-completion. Cuenta con el gasto: el hook añade tokens a cada sesión, y ejecutar un plan con un subagente por tarea consume bastante más que hacerlo en la propia sesión.',
      puedes: [
        'Instalar las 15 skills de una vez, con el prefijo superpowers: con el que se llaman entre ellas',
        'Que se activen solas según la tarea, sin tener que nombrarlas',
        'Elegir cómo se ejecuta un plan aprobado: un subagente y una revisión por tarea, o todo en tu sesión con una revisión al final, que es lo más barato',
        'Diagnosticar una sesión que ha ido mal con la skill diagnosing-superpowers',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      github: SP,
      licencia: 'MIT',
      suelta: '/plugin install superpowers@claude-plugins-official\n\n# o la versión más reciente, desde el marketplace del autor:\n/plugin marketplace add obra/superpowers-marketplace\n/plugin install superpowers@superpowers-marketplace',
      sueltaTitulo: 'Instalar en Claude Code (plugin)',
      sueltaNota: 'Dentro de Claude Code. Elige una de las dos vías, no las dos. El marketplace oficial de Anthropic instala hoy la versión 6.4.1; el del autor, la 7.0.0, con el brainstorming rehecho. En Windows, el hook necesita Git for Windows (Git Bash).',
      ejemplos: [
        { titulo: 'Nutricionista: lanzar un programa nuevo', texto: 'Quiero lanzar un programa online de 8 semanas para pacientes con resistencia a la insulina. Antes de hacer nada, hazme las preguntas que necesites para entender a quién va dirigido, qué incluye y cómo lo voy a cobrar, y luego devuélveme un resumen del diseño para que lo corrija.' },
        { titulo: 'Agencia: plan por pasos con verificación', texto: 'Tengo que preparar la propuesta y el calendario de contenidos de un cliente nuevo (una clínica dental) para el mes que viene. Escribe primero un plan por pasos, cada uno con lo que hay que entregar y cómo comprobar que está bien, y no empieces a ejecutarlo hasta que yo lo apruebe.' },
      ],
    },
    {
      n: '03',
      clave: 'claude-mem',
      nombre: 'Claude-Mem',
      titular: 'Que Claude recuerde lo que hicisteis ayer',
      corto: 'anota lo que hace Claude en cada sesión, lo resume y se lo recuerda en la siguiente',
      historia: 'Cada sesión de Claude Code empieza sin la conversación anterior: el CLAUDE.md y su memoria automática guardan reglas y preferencias, no el detalle de lo que hicisteis ayer. Claude-Mem lo anota por ti. Con unos hooks captura cada acción de Claude (leer o editar un archivo, ejecutar un comando), un modelo pequeño (Haiku 4.5 por defecto) la resume en «observaciones» y, cuando Claude termina de responder, guarda un resumen con lo que pediste, lo que se hizo y los próximos pasos. Todo va a una base de datos en tu ordenador, en ~/.claude-mem, separada por proyecto. Al abrir la siguiente sesión, Claude recibe un índice de lo recordado y, si le preguntas «¿qué decidimos la semana pasada?», busca en la memoria. Ten en cuenta que guarda el texto de tus peticiones, así que si trabajas con datos de pacientes o clientes, escríbelos entre <private> y </private>: Claude los ve, pero no se guardan. Y ojo con el instalador: si no le dices nada, te deja preseleccionado su servicio de pago, CMEM Pro.',
      puedes: [
        'Retomar un proyecto sin volver a explicarle a Claude dónde lo dejasteis',
        'Preguntar en lenguaje normal qué se decidió o qué archivos se tocaron en sesiones anteriores',
        'Ver en el navegador, en tiempo real, lo que va recordando, filtrado por proyecto',
        'Pedir un resumen semana a semana (skill weekly-digests) o un documento para seguir en otra sesión (skill handoff)',
        'Dejar fuera de la memoria lo sensible, escribiéndolo entre <private> y </private>',
      ],
      autor: 'Alex Newman (thedotmack)',
      oficial: false,
      repo: 'thedotmack/claude-mem',
      github: CM,
      licencia: 'Apache 2.0 en el núcleo; la nube y la sincronización de equipos son de pago',
      suelta: 'npx claude-mem install --provider claude\n\n# comprobar que funciona:\nnpx claude-mem doctor\n\n# apagar la telemetría (viene encendida):\nnpx claude-mem telemetry disable',
      sueltaTitulo: 'Instalar en tu terminal (antes de abrir Claude Code)',
      sueltaNota: 'Necesitas Node.js 20.12 o superior y Claude Code 2.1.139 o posterior; Bun y uv los instala él si faltan. Con --provider claude la memoria se resume con tu plan de Claude (gasta parte de tu cuota) y te saltas el alta en cmem.ai. Sin esa opción, el instalador deja preseleccionado CMEM Pro, de pago: 30 $/mes después de 30 días de prueba (antes, si gastas el uso incluido), y según cmem.ai la prueba pide tarjeta. Al terminar, reinicia la terminal y abre una sesión nueva. npm install -g claude-mem no sirve: no registra los hooks. Para quitarlo, npx claude-mem uninstall, que conserva tus memorias en ~/.claude-mem: esa carpeta la borras tú.',
      ejemplos: [
        { titulo: 'Nutricionista: retomar sin repetir contexto', texto: 'Retoma lo que hicimos en las últimas sesiones con las plantillas de menús semanales: ¿qué formato acordamos para las cenas, qué archivos tocamos y qué quedó en «próximos pasos»? Sigue desde ahí. <private>La clienta es intolerante a la lactosa y tiene diabetes tipo 2.</private>' },
        { titulo: 'Editor de vídeo: repetir el mismo sistema', texto: 'Busca en la memoria cómo renombramos y ordenamos los brutos y la carpeta de exportación en el último proyecto de boda, y aplica exactamente el mismo sistema a la carpeta Rodaje_Octubre. Antes de mover nada, enséñame la lista de cambios.' },
      ],
    },
    {
      n: '04',
      clave: 'task-observer',
      nombre: 'Task Observer',
      titular: 'Convierte tus correcciones en mejores skills',
      corto: 'observa tus sesiones, apunta lo que corriges y lo que repites, y te propone mejorar tus skills o crear otras',
      historia: 'Es una meta-skill: su trabajo es mirar cómo trabajas con Claude y mejorar el resto de tus skills, y también a sí misma. Mientras trabajas apunta tres cosas: las correcciones que le haces a Claude (señal de que una skill debería ser más clara), las tareas que repites a mano sin que ninguna skill las cubra (candidatas a skill nueva) y sus propios puntos ciegos. Cada observación es un archivo Markdown en la carpeta skill-observations/observation-log/ de tu espacio de trabajo, y las propuestas de cambio las revisas tú: no toca ninguna skill instalada por su cuenta. Un editor de vídeo que cada semana corrige el tono de los guiones de sus reels acaba con propuestas concretas para su skill de guiones. Su autor avisa con honestidad: rinde cuando ya tienes varias skills y sesiones frecuentes; con unas pocas, la memoria de Claude cubre casi lo mismo con menos lío. Y lo más importante: instalarla no basta, hay que activarla en tu CLAUDE.md, porque sola se activa menos de lo que debería.',
      puedes: [
        'Detectar las tareas que repites y que deberían ser una skill',
        'Registrar cada corrección que le haces a Claude como una observación, un archivo por observación',
        'Revisar las propuestas de cambio y aprobar o rechazar cada una antes de que se apliquen',
        'Preguntar al final de cada sesión «¿Alguna observación registrada?» para que vuelque lo que no apuntó',
        'En claude.ai web o en el móvil, donde no hay archivos, recibir al final un documento de traspaso',
      ],
      autor: 'Eoghan Henn (rebelytics)',
      oficial: false,
      repo: 'rebelytics/one-skill-to-rule-them-all',
      github: TO,
      licencia: 'CC BY 4.0 (uso libre, también comercial, citando al autor y el repo)',
      suelta: '# para todos tus proyectos (sin -g, solo en este):\nnpx skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g',
      sueltaTitulo: 'Instalar en tu terminal',
      sueltaNota: 'Necesitas Node.js 22.20 o superior. Después, actívala: pídele a Claude que añada a tu CLAUDE.md el bloque de activación de references/environments.md (el primer ejemplo de abajo lo hace) y compruébalo en una sesión NUEVA. Señal de que no funciona: tras varias sesiones de trabajo no existe la carpeta skill-observations/observation-log/. En la web, el escritorio o el móvil de Claude, sin terminal: descarga task-observer.skill de la última versión en GitHub y súbelo en Settings > Customize.',
      ejemplos: [
        { titulo: 'Activarla en tu proyecto', texto: 'Acabo de instalar la skill task-observer. Lee su archivo references/environments.md, enséñame el bloque de activación que recomienda para el CLAUDE.md y, cuando te lo apruebe, añádelo a mi CLAUDE.md sin tocar nada más. Después dime cómo compruebo en una sesión nueva que se activa de verdad.' },
        { titulo: 'Agencia: revisión semanal', texto: 'Haz la sesión de revisión de Task Observer: abre el registro de observaciones pendientes, agrúpalas por skill afectada y preséntame una por una las propuestas de cambio para que yo apruebe o rechace. No modifiques ninguna skill hasta que te confirme.' },
      ],
    },
    {
      n: '05',
      clave: 'coderabbit',
      nombre: 'CodeRabbit',
      titular: 'Un segundo par de ojos antes de publicar',
      corto: 'un revisor de código externo: Claude escribe, CodeRabbit revisa y Claude corrige lo que encuentre',
      historia: 'Si no sabes leer código, no puedes revisar lo que Claude te ha escrito, y mejor que no lo revise el mismo que lo ha escrito. CodeRabbit es un revisor de código con IA de otra empresa; según la ficha del marketplace oficial, combina su propio sistema con más de 40 analizadores y tiene en cuenta tu CLAUDE.md. El plugin no revisa nada por sí mismo: lanza la CLI de CodeRabbit sobre tus cambios, recibe los hallazgos ordenados por gravedad (critical, major, minor, trivial, info), hace una lista de tareas, corrige y vuelve a revisar. Una nutricionista que acaba de añadir un formulario de citas a su web lo pasa por la revisión antes de que los datos de sus pacientes lleguen a producción. Cuenta con tres cosas: tus cambios viajan a los servidores de CodeRabbit (si no eliges la región UE, a EE. UU.), así que no deben llevar claves ni datos de clientes; el plan gratuito da 3 revisiones por hora en la CLI y en los pull requests solo resúmenes (el de pago empieza en 24 $ al mes por desarrollador, con pago anual); y cada revisión tarda de 7 a más de 30 minutos. Que salga sin hallazgos no garantiza que no haya fallos.',
      puedes: [
        'Pedir «Revisa mi código con CodeRabbit» y recibir los fallos agrupados por gravedad, explicados por Claude',
        'Revisar solo lo que aún no has confirmado (--uncommitted) o comparar con la rama main (--base main)',
        'Encadenar el ciclo completo: implementa, revisa, corrige primero lo critical y lo major y vuelve a revisar',
        'Con su app de GitHub, que revise cada pull request y aplicar sus comentarios uno a uno, con tu aprobación, diciendo «coderabbit autofix»',
        'Ver cuánta cuota te queda con coderabbit usage',
      ],
      autor: 'CodeRabbit',
      oficial: false,
      repo: 'coderabbitai/skills',
      github: CR,
      licencia: 'MIT (el plugin; el servicio de revisión es comercial, con un plan gratuito limitado)',
      suelta: '# 1. En tu terminal: la CLI, que es la que revisa\nbrew install coderabbit\n# inicia sesión (--region eu: cuenta en la UE; sin él, en EE. UU.)\ncoderabbit auth login --region eu\ncoderabbit auth status\n\n# 2. Dentro de Claude Code: el plugin\n/plugin marketplace update claude-plugins-official\n/plugin install coderabbit@claude-plugins-official',
      sueltaTitulo: 'Instalar la CLI y el plugin',
      sueltaNota: 'Sin Homebrew: curl -fsSL https://cli.coderabbit.ai/install.sh | sh (en Windows, irm https://cli.coderabbit.ai/install.ps1 | iex). El inicio de sesión abre el navegador y lo haces tú, con tu cuenta de GitHub; no pide tarjeta. La región se elige en el primer inicio de sesión. Tu proyecto tiene que ser un repositorio Git. En la versión del plugin publicada hoy (1.1.1) el comando es /coderabbit:coderabbit-review; en la siguiente cambiará de nombre, así que pídelo también en lenguaje normal.',
      ejemplos: [
        { titulo: 'Nutricionista: el formulario de citas', texto: 'Acabas de añadir a mi web el formulario para reservar consulta. Antes de subir nada, revisa solo los cambios sin confirmar con CodeRabbit (/coderabbit:coderabbit-review --uncommitted). Después explícame en castellano sencillo, sin tecnicismos, cada hallazgo crítico o importante, sobre todo los que afecten a los datos de mis pacientes (nombre, teléfono, motivo de consulta). Corrígelos de uno en uno pidiéndome permiso y vuelve a pasar la revisión al terminar.' },
        { titulo: 'Agencia: construir, revisar y resumir', texto: 'Implementa la nueva página de tarifas para el cliente de la panadería que tenemos en la carpeta /clientes/panaderia. Cuando termines, revísala con CodeRabbit comparando con la rama main (--base main). Haz una lista de tareas con lo que encuentre, arregla lo que salga como critical o major, vuelve a revisar para confirmar que está resuelto y escríbeme un resumen de cinco líneas, sin jerga, que pueda reenviar al cliente.' },
      ],
    },
  ],
}
