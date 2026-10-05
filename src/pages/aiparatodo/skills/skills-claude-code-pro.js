// Hilo de la sección Skills: método para trabajar con Claude Code en proyectos de verdad.
// Comprobado el 06/10/2026 con la API de GitHub (carpeta, SKILL.md leído entero, LICENSE
// y manifiestos de plugin) y con code.claude.com/docs (discover-plugins y skills).
// - obra/superpowers (rama main, MIT, ~296k estrellas, push 27/09/2026, v6.4.2): 15 skills
//   en skills/. El repo trae su propio marketplace «superpowers-dev» (de desarrollo), pero
//   el plugin «superpowers» está en el marketplace oficial «claude-plugins-official»
//   (anclado a v6.4.1; brainstorming, executing-plans, test-driven-development,
//   systematic-debugging y verification-before-completion son idénticas en ambas versiones;
//   writing-plans cambia en detalle, no en lo que se cuenta aquí). El plugin trae un hook
//   SessionStart (startup|clear|compact) que inyecta la skill using-superpowers.
//   executing-plans usa scripts de ../subagent-driven-development y la guía
//   ../requesting-code-review/code-reviewer.md: su comando suelto copia las tres carpetas.
// - mattpocock/skills (rama main, MIT, ~277k estrellas, push 05/10/2026): plugin
//   «mattpocock-skills», también en «claude-plugins-official» (su repo declara además el
//   marketplace «mattpocock»). grilling (skills/productivity) va en el plugin; grill-me
//   solo invoca a grilling. git-guardrails-claude-code (skills/misc) NO va en el plugin.
//   Su script usa jq: probado aquí, sin jq sale con código 0 y no bloquea nada.

const SP = 'https://github.com/obra/superpowers'
const MP = 'https://github.com/mattpocock/skills'

const sueltaSP = (...carpetas) =>
  `rm -rf /tmp/superpowers && git clone --depth 1 ${SP} /tmp/superpowers && mkdir -p ~/.claude/skills && cp -r ${carpetas.map(c => `/tmp/superpowers/skills/${c}`).join(' ')} ~/.claude/skills/ && rm -rf /tmp/superpowers`

const sueltaMP = (ruta) =>
  `rm -rf /tmp/mattpocock-skills && git clone --depth 1 ${MP} /tmp/mattpocock-skills && mkdir -p ~/.claude/skills && cp -r /tmp/mattpocock-skills/${ruta} ~/.claude/skills/ && rm -rf /tmp/mattpocock-skills`

export default {
  slug: 'skills-claude-code-pro',
  seccion: 'skills',
  tema: 'desarrollo',
  titulo: '8 skills para que Claude Code trabaje con método',
  gancho: 'Que Claude Code deje de improvisar',
  resumen: 'El método Superpowers y dos skills de Matt Pocock para que Claude Code te pregunte antes de programar, trabaje con un plan, busque la causa de cada fallo y no te diga «listo» sin pruebas. Pensado para quien monta webs, automatizaciones y herramientas internas sin ser programador.',
  fecha: '2026-10-06',
  lectura: '11 min',
  nota: 'Ninguna es oficial de Anthropic: las seis primeras son de Superpowers, de Jesse Vincent (repo obra/superpowers), y las dos últimas de Matt Pocock (repo mattpocock/skills). Los dos repos tienen licencia MIT, son gratis y de código abierto, y sus plugins están en el marketplace oficial de Anthropic para Claude Code.',
  instalarTodo: {
    explica: 'Superpowers y el paquete de Matt Pocock están en el marketplace oficial de Anthropic, que Claude Code añade solo la primera vez que lo abres en la terminal: no hay que registrar nada. Pega estas dos líneas dentro de Claude Code, una a una. Cada una abre el panel del plugin, donde ves qué instala y cuántos tokens añade a cada mensaje, y eliges si lo quieres en todos tus proyectos o solo en este. Superpowers trae sus 15 skills y un hook que, al empezar cada sesión, tras un /clear y después de compactar, le recuerda a Claude que las use. Además, entre ellas se llaman con el prefijo superpowers:, que solo existe con el plugin. Por eso el plugin es la forma recomendada: sueltas funcionan, pero Claude tiene que acordarse solo de usarlas. El de Matt trae grilling y el resto de sus skills de ingeniería, pero no Git Guardrails: esa se instala con su comando suelto. En la app de escritorio, pestaña Code, lo mismo está en + > Plugins > Add plugin.',
    comando: '/plugin install superpowers@claude-plugins-official\n/plugin install mattpocock-skills@claude-plugins-official',
  },
  skills: [
    {
      n: '01',
      clave: 'brainstorming',
      nombre: 'Brainstorming',
      titular: 'Primero entiende qué quieres, luego programa',
      corto: 'hace que Claude Code te pregunte y te enseñe un diseño antes de escribir una línea de código',
      historia: 'El error más caro con Claude Code es que se ponga a programar al segundo mensaje y construya algo que no era. Esta skill lo frena: clasifica tu petición en voz alta (prueba rápida, cambio acotado sobre algo que ya existe o proyecto nuevo), te pregunta de una en una, con opciones cuando puede, te propone dos o tres enfoques con su recomendación y no toca código hasta que dices que sí. Una nutricionista que quiere un portal para sus alumnas sale con el diseño escrito y aprobado antes de gastar una tarde en algo que no le sirve.',
      puedes: [
        'Convertir una idea vaga («quiero una web para vender mi curso») en un diseño que apruebas por partes',
        'Elegir entre dos o tres enfoques, cada uno con sus pros y contras y la recomendación de Claude',
        'Partir un proyecto demasiado grande en subproyectos y decidir en qué orden se construyen',
        'Guardar el diseño aprobado en docs/superpowers/specs/ para que el plan y las sesiones futuras partan de ahí',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      ruta: 'skills/brainstorming',
      github: `${SP}/tree/main/skills/brainstorming`,
      licencia: 'MIT',
      suelta: sueltaSP('brainstorming'),
      ejemplos: [
        { titulo: 'Web para vender un curso', texto: 'Quiero montar una web para vender mi curso de nutrición deportiva: página de venta, pago y una zona privada con los vídeos. No sé programar. Antes de escribir código, usa brainstorming: hazme las preguntas de una en una, proponme dos o tres formas de hacerlo con la que recomiendas y no empieces hasta que apruebe el diseño.' },
        { titulo: 'Herramienta interna de una agencia', texto: 'En mi agencia llevamos los encargos de reels en un Excel y se nos pierden entregas. Quiero una herramienta interna sencilla para ver qué está en edición, en revisión y entregado, y de quién es cada pieza. Usa brainstorming para entender cómo trabajamos antes de proponerme nada y, si es demasiado grande, pártelo en fases.' },
      ],
    },
    {
      n: '02',
      clave: 'writing-plans',
      nombre: 'Writing Plans',
      titular: 'Un plan que cualquiera podría seguir',
      corto: 'convierte el diseño aprobado en un plan de tareas pequeñas, cada una con su prueba y su comprobación',
      historia: 'Con el diseño aprobado, esta skill escribe el plan de obra antes de tocar código. Lo escribe para un programador que no conoce tu proyecto: qué archivos se crean o cambian en cada tarea, qué prueba la demuestra, qué comando hay que lanzar y qué resultado significa que ha ido bien. Antes de dártelo lo repasa contra el diseño para que no falte nada, y apunta los cinco casos raros que más probablemente le romperían la herramienta a quien la use, cada uno con su prueba. Un editor de vídeo que automatiza el renombrado de sus brutos sabe exactamente qué se va a construir antes de que exista una línea.',
      puedes: [
        'Tener el plan guardado en docs/superpowers/plans/, con cada tarea en casillas que se marcan al terminar',
        'Ver qué archivos se van a crear o tocar en cada tarea antes de que nadie los toque',
        'Cubrir los casos que nadie pidió (un archivo vacío, un email mal escrito, un PDF duplicado) con su propia prueba',
        'Elegir cómo se ejecuta: un subagente y una revisión por tarea, o todo en tu sesión con una revisión final',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      ruta: 'skills/writing-plans',
      github: `${SP}/tree/main/skills/writing-plans`,
      licencia: 'MIT',
      suelta: sueltaSP('writing-plans'),
      ejemplos: [
        { titulo: 'Del diseño al plan', texto: 'Ya tenemos el diseño aprobado en docs/superpowers/specs/. Usa writing-plans para escribir el plan de implementación. Al terminar, explícame en lenguaje sencillo y sin código qué hace cada tarea, y cuál de las dos formas de ejecutarlo me recomiendas y por qué.' },
        { titulo: 'Automatización de facturas', texto: 'Quiero un script que lea las facturas en PDF de una carpeta, saque fecha, cliente e importe y lo pase a un Excel para mi gestoría. Si no hay diseño previo, pasa primero por brainstorming. Luego escribe el plan con writing-plans y asegúrate de que cubre qué pasa con un PDF escaneado, uno duplicado y uno sin importe.' },
      ],
    },
    {
      n: '03',
      clave: 'executing-plans',
      nombre: 'Executing Plans',
      titular: 'Ejecuta el plan sin perderse',
      corto: 'ejecuta el plan tarea a tarea en tu sesión, con un registro que sobrevive a las conversaciones largas',
      historia: 'Es la opción «Native» que te ofrece writing-plans: Claude ejecuta el plan él mismo, tarea a tarea, sin pararse a preguntarte «¿sigo?». Cada tarea terminada y cada decisión que toma por su cuenta van a un archivo de progreso, así que si la conversación se compacta no rehace lo que ya está hecho. Solo se para ante algo irreversible o destructivo, algo de seguridad, un merge, push o publicación, o un plan tan roto que todo sería adivinar; al final, un revisor con contexto limpio repasa todo el trabajo. Es la que más depende del resto de Superpowers: el comando suelto copia también las dos skills de las que saca sus scripts y su guía de revisión, pero además llama a otras de Superpowers (pruebas, verificación, ramas de trabajo), así que lo suyo es el plugin.',
      puedes: [
        'Dejar que trabaje tareas seguidas sin tener que escribirle «sigue» cada vez',
        'Retomar un proyecto tras una sesión larga sin que repita tareas: se guía por el registro y por el historial de git',
        'Recibir al final la lista de decisiones que tomó en tu nombre y lo que costaría si alguna fuera errónea',
        'Pasar a subagent-driven-development (un subagente y una revisión por tarea) a mitad de plan, con el mismo registro',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      ruta: 'skills/executing-plans',
      github: `${SP}/tree/main/skills/executing-plans`,
      licencia: 'MIT',
      suelta: sueltaSP('executing-plans', 'subagent-driven-development', 'requesting-code-review'),
      ejemplos: [
        { titulo: 'Ejecutar el plan', texto: 'Ejecuta el plan de docs/superpowers/plans/ con executing-plans, en una rama nueva y nunca sobre main. Cuando termines, dime en lenguaje sencillo qué se ha hecho, qué decisiones tomaste por tu cuenta y qué ha quedado pendiente.' },
        { titulo: 'Retomar al día siguiente', texto: 'Ayer empezamos a ejecutar el plan de la zona privada de mi curso y la sesión se cortó. Usa executing-plans: mira el registro de progreso y el historial de git, dime qué tareas están hechas y sigue desde la primera que falte, sin rehacer nada.' },
      ],
    },
    {
      n: '04',
      clave: 'test-driven-development',
      nombre: 'Test-Driven Development',
      titular: 'Pruebas que demuestran que funciona',
      corto: 'obliga a escribir primero la prueba, verla fallar y solo entonces el código',
      historia: 'Si no sabes leer código, no puedes saber si lo que ha hecho Claude está bien: las pruebas automáticas son tu red, porque comprueban el comportamiento cada vez que algo cambia. Esta skill impone la ley de hierro del TDD: ni una línea de código sin una prueba que haya fallado antes, y si escribió el código primero, lo borra y empieza de nuevo. Solo se la salta en prototipos de usar y tirar, código generado o archivos de configuración, y siempre preguntándote. En una agencia que calcula comisiones con una herramienta interna, el día que alguien toque el cálculo salta una prueba antes de pagar mal a un editor.',
      puedes: [
        'Que cada función nueva y cada arreglo llegue con su prueba, escrita antes que el código',
        'Ver la prueba fallar primero, para saber que de verdad comprueba algo',
        'Convertir cada error que encuentres en una prueba que impide que vuelva',
        'Pasar todas las pruebas del proyecto antes de dar un cambio por terminado, no solo la del cambio',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      ruta: 'skills/test-driven-development',
      github: `${SP}/tree/main/skills/test-driven-development`,
      licencia: 'MIT',
      suelta: sueltaSP('test-driven-development'),
      ejemplos: [
        { titulo: 'Comisiones de una agencia', texto: 'En la herramienta interna de mi agencia, añade el cálculo de comisiones: cada editor cobra un 10 % de lo facturado por sus reels, y un 15 % a partir de 20 reels al mes. Usa test-driven-development: escribe primero las pruebas con casos concretos (0, 19, 20 y 35 reels), enséñame que fallan y luego escribe el código. Explícame las pruebas en castellano, sin código.' },
        { titulo: 'Arreglo con prueba', texto: 'El formulario de reservas de mi web acepta emails sin arroba. Usa test-driven-development: primero una prueba que reproduzca el fallo y que yo vea fallar, después el arreglo, y al final pasa todas las pruebas del proyecto y dime el resultado.' },
      ],
    },
    {
      n: '05',
      clave: 'systematic-debugging',
      nombre: 'Systematic Debugging',
      titular: 'Arregla la causa, no el síntoma',
      corto: 'busca la causa real de un error en cuatro fases antes de proponer ningún arreglo',
      historia: 'Lo típico: algo falla, Claude prueba un arreglo, no va, mete otro encima, y al quinto el proyecto está peor que al principio. Esta skill prohíbe arreglar sin investigar: primero lee el error entero, lo reproduce y mira qué ha cambiado; luego lo compara con algo parecido que sí funciona; después prueba una sola hipótesis cada vez; y solo entonces arregla, con una prueba que reproduce el fallo. Si tres arreglos seguidos no funcionan, para y te plantea si el problema es cómo está montado en vez de seguir parcheando.',
      puedes: [
        'Encontrar por qué tu automatización falla «a veces», reproduciendo el error antes de tocar nada',
        'Localizar en qué paso se rompe una cadena (formulario, servidor, CRM, email) registrando qué entra y qué sale de cada uno',
        'Que cada arreglo llegue con una prueba que demuestra que el fallo existía y ya no',
        'Cortar el bucle de parches: tras tres intentos fallidos, para y lo decide contigo',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      ruta: 'skills/systematic-debugging',
      github: `${SP}/tree/main/skills/systematic-debugging`,
      licencia: 'MIT',
      suelta: sueltaSP('systematic-debugging'),
      ejemplos: [
        { titulo: 'Leads que no llegan', texto: 'Los leads del formulario de mi web no llegan al CRM desde ayer, pero el formulario dice «enviado». Usa systematic-debugging y no apliques ningún arreglo hasta encontrar la causa. Reproduce el fallo, dime en qué paso exacto se pierde el dato (formulario, servidor o CRM) y enséñame la evidencia antes de proponerme el arreglo.' },
        { titulo: 'Cuando ya vas en bucle', texto: 'Llevamos tres arreglos y la exportación a Excel sigue sacando las fechas mal. Deja de adivinar. Usa systematic-debugging desde la fase 1 y, si crees que el problema es cómo está montado, dímelo antes de intentar un cuarto arreglo.' },
      ],
    },
    {
      n: '06',
      clave: 'verification-before-completion',
      nombre: 'Verification Before Completion',
      titular: 'Nada de «listo» sin pruebas',
      corto: 'no deja a Claude decir que algo funciona sin haber ejecutado la comprobación y leído el resultado',
      historia: 'El «¡listo, ya funciona!» que luego no funciona duele más cuando no sabes programar, porque no tienes cómo comprobarlo tú. Esta skill pone una regla sin excepciones: ninguna afirmación de éxito sin una comprobación hecha en ese momento. Antes de decir que algo está terminado, Claude tiene que identificar qué comando lo demuestra, ejecutarlo entero, leer la salida y solo entonces hablar, con la evidencia delante. Un «debería», un «probablemente» o un «¡perfecto!» antes de comprobar son, para la skill, señales de alarma.',
      puedes: [
        'Que cada «funciona» venga con el comando que lo prueba y lo que ha salido, por ejemplo «34 de 34 pruebas pasadas»',
        'Que no se fíe de lo que dice un subagente: revisa los cambios reales en git antes de informarte',
        'Que repase el plan punto por punto antes de dar una fase por cerrada',
        'Que no haga commit ni abra un pull request sin haber verificado antes',
      ],
      autor: 'Jesse Vincent',
      oficial: false,
      repo: 'obra/superpowers',
      ruta: 'skills/verification-before-completion',
      github: `${SP}/tree/main/skills/verification-before-completion`,
      licencia: 'MIT',
      suelta: sueltaSP('verification-before-completion'),
      ejemplos: [
        { titulo: 'Antes de publicar la landing', texto: 'Antes de dar por buenos los cambios de la landing, usa verification-before-completion: compila el proyecto, pasa las pruebas y dime exactamente qué comandos has ejecutado y qué ha salido. Lo que no hayas podido comprobar, dímelo claro en vez de suponer que va.' },
        { titulo: 'Revisar trabajo delegado', texto: 'Has usado subagentes para montar la automatización de facturas. Aplica verification-before-completion: no te fíes de lo que te han dicho, revisa los cambios reales en git, ejecuta las pruebas y dame la lista de lo que pedí con «comprobado» o «pendiente» al lado de cada punto.' },
      ],
    },
    {
      n: '07',
      clave: 'grilling',
      nombre: 'Grilling (grill-me)',
      titular: 'Que te acribille a preguntas antes de empezar',
      corto: 'te entrevista sin piedad sobre un plan, una decisión o una idea hasta que no quede nada por decidir',
      historia: 'Matt Pocock dice en su README que es de sus skills más populares, y sirve también fuera del código: un lanzamiento, una oferta, la estructura de un curso. Claude dibuja el árbol de decisiones de tu idea y te pregunta por rondas: todas las preguntas que ya se pueden contestar, numeradas y cada una con su respuesta recomendada. Lo que se puede averiguar mirando tu proyecto lo busca él con un subagente; las decisiones son tuyas, y no actúa hasta que confirmas que estáis de acuerdo en todo. Con el plugin la lanzas con /grill-me (o /mattpocock-skills:grill-me si otro comando ya usa ese nombre); suelta, con /grilling o pidiéndole «grill me».',
      puedes: [
        'Poner a prueba la idea de un producto o un lanzamiento antes de gastar un euro',
        'Contestar rondas de preguntas numeradas aceptando sus recomendaciones cuando te convenzan («la 1 sí, la 3 lo que propones»)',
        'Que busque él los datos de tu proyecto en vez de preguntártelos',
        'Cerrar todas las decisiones de una herramienta antes de pedir el diseño o el plan',
      ],
      autor: 'Matt Pocock',
      oficial: false,
      repo: 'mattpocock/skills',
      ruta: 'skills/productivity/grilling',
      github: `${MP}/tree/main/skills/productivity/grilling`,
      licencia: 'MIT',
      suelta: sueltaMP('skills/productivity/grilling'),
      ejemplos: [
        { titulo: 'Lanzamiento de un curso', texto: 'Grill me sobre el lanzamiento de mi curso de edición de vídeo para creadores: precio, plataforma, si hago webinar o no, bonos y fechas. Pregúntame por rondas, con tu recomendación en cada pregunta, y no me propongas un plan hasta que no quede ninguna decisión abierta.' },
        { titulo: 'Antes de construir', texto: 'Quiero que Claude Code me monte un sistema para que mis clientes del despacho me suban documentos y yo los vea ordenados por caso. Grill me sobre todo lo que hay que decidir antes de construirlo: privacidad, quién accede, dónde se guardan los archivos y qué avisos llegan por email. Lo que puedas averiguar mirando el proyecto, averígualo tú.' },
      ],
    },
    {
      n: '08',
      clave: 'git-guardrails-claude-code',
      nombre: 'Git Guardrails',
      titular: 'Que Claude no pueda borrar tu trabajo',
      corto: 'instala un hook que bloquea los comandos de git peligrosos antes de que Claude los ejecute',
      historia: 'En git, un solo reset --hard o clean -f borra horas de trabajo sin pasar por ninguna papelera, y un push manda tus cambios fuera sin que los hayas revisado. Esta skill te monta un hook de Claude Code que mira cada comando antes de ejecutarlo y bloquea push (también --force), reset --hard, clean -f, branch -D, checkout . y restore .: Claude recibe el aviso de que no tiene permiso. Te pregunta si lo quieres solo en este proyecto o en todos y si quieres añadir o quitar comandos de la lista. Ojo: el script usa jq y, si no lo tienes instalado, no bloquea nada y no avisa, así que haz siempre la prueba final que te propone: tiene que salir BLOCKED.',
      puedes: [
        'Bloquear push, reset --hard, clean -f, branch -D, checkout . y restore . en un proyecto o en todos',
        'Decidir tú cuándo se sube algo: el push lo haces tú, después de revisar',
        'Añadir tus propios comandos prohibidos a la lista o quitar alguno',
        'Comprobar con una prueba que el bloqueo funciona antes de fiarte',
      ],
      autor: 'Matt Pocock',
      oficial: false,
      repo: 'mattpocock/skills',
      ruta: 'skills/misc/git-guardrails-claude-code',
      github: `${MP}/tree/main/skills/misc/git-guardrails-claude-code`,
      licencia: 'MIT',
      suelta: sueltaMP('skills/misc/git-guardrails-claude-code'),
      ejemplos: [
        { titulo: 'Proteger todos tus proyectos', texto: 'Configura git guardrails para todos mis proyectos. Antes de tocar mi configuración, enséñame qué vas a añadir y en qué archivo. Después haz la prueba que trae la skill: pásale al script un «git push origin main» simulado, sin ejecutarlo de verdad, y enséñame que sale BLOCKED; si no sale, dime qué falta.' },
        { titulo: 'Web que se publica con cada push', texto: 'Mi web se publica sola cada vez que se hace push a main. Configura git guardrails solo en este proyecto para que no puedas hacer push ni descartar cambios (eso lo hago yo) y añade también «git rebase» a la lista. Al terminar, haz la prueba simulada de la skill, sin ejecutar ningún comando de git de verdad, y dime qué comandos quedan bloqueados.' },
      ],
    },
  ],
}
