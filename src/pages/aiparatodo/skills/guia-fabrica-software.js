// Hilo de la sección «Skills y repos», tema «desarrollo» (Claude Code). Lead
// magnet del reel «Me he montado una fábrica de software en local» (comenta
// FÁBRICA). Guía de Silvestre AI: el bucle de la fábrica (redactor de specs →
// constructor → revisores en paralelo → aprobador) con los prompts de cada
// agente, cómo montarlo con subagentes de Claude Code y las reglas que no se
// saltan (humano en el bucle). Fuentes comprobadas el 04/11/2026:
// - Anthropic, «Building effective agents» (19/12/2024): el patrón
//   evaluador-optimizador y el humano en el bucle.
// - Anthropic, «Claude Code: Best practices for agentic coding» (abril de
//   2025): trabajar en ramas, criterios claros y revisión.
// - Claude Docs, «Subagents» (consultado el 04/11/2026): subagentes propios en
//   .claude/agents, con su nombre, su descripción y su sistema.
// «factory» es una herramienta propia de Alex, no un comando de Claude Code:
// cada agente es una sesión de Claude Code aparte que ella lanza. Esta guía
// enseña a montar el mismo bucle con lo que Claude Code ya trae.

const EFECTIVOS = 'https://www.anthropic.com/engineering/building-effective-agents'
const BEST = 'https://www.anthropic.com/engineering/claude-code-best-practices'
const SUBAGENTES = 'https://docs.claude.com/en/docs/claude-code/sub-agents'

const REDACTOR = 'Eres el Redactor de specs. No programes nada todavía. Te doy una funcionalidad nueva: [FUNCIONALIDAD]. Escribe una especificación corta en Markdown y guárdala en specs/F-XXX.md con: (1) el problema que resuelve, en una frase; (2) qué entra y qué sale; (3) una lista de 5 a 8 CRITERIOS DE ACEPTACIÓN, cada uno verificable con un sí o un no (ejemplo: «aparece un tercer botón en la home y lleva a /precios»), nada de criterios vagos como «que quede bonito»; (4) qué queda FUERA de alcance. No añadas nada que yo no haya pedido. Cuando la tengas, enséñamela y espera.'

const CONSTRUCTOR = 'Eres el Constructor. Lee la spec specs/F-XXX.md. Crea una rama nueva llamada factory/F-XXX y programa SOLO lo que pide la spec, sin salirte del alcance. Haz commits pequeños y con un mensaje claro según avanzas. Al terminar, comprueba tú mismo que el proyecto compila o arranca y repasa los criterios de aceptación uno por uno. Si algo no compila o un criterio no se cumple, arréglalo antes de parar. No fusiones nada a main. Dime en qué rama está, qué criterios cumples y cuáles no.'

const REVISOR = 'Eres un revisor, y SOLO miras desde una dimensión: [DIMENSIÓN]. Revisa los cambios de la rama factory/F-XXX contra la spec specs/F-XXX.md. No arregles nada: informa. Lista solo los problemas reales de tu dimensión, del más grave al más leve, y de cada uno di archivo:línea y el cambio más pequeño que lo resuelve. Si en tu dimensión no hay nada que cambiar, dilo con claridad. Sé exigente, pero no te inventes problemas para justificar el informe.'

const APROBADOR = 'Eres el Aprobador. Repasa los criterios de aceptación de specs/F-XXX.md uno por uno contra la rama factory/F-XXX y marca cada uno como cumplido o no. Lee los informes de los revisores. Luego decide una de dos cosas: (1) si se cumplen TODOS los criterios y ningún revisor deja algo grave, puedes fusionar la rama a main; (2) si falta algún criterio, o si el cambio lo ve cualquier visitante, toca dinero o toca datos de personas, NO fusiones: escálalo a una persona con un resumen de qué hace, qué criterios cumple y qué dijo cada revisor. Regla fija: un cambio de cara al público no se fusiona solo; lo aprueba una persona.'

const AGENTE_MD = `---
name: redactor-specs
description: Escribe la spec y los criterios de aceptación de una funcionalidad. No programa.
tools: Read, Grep, Glob, Write
---

Eres el Redactor de specs. No programes nada.
Para la funcionalidad que te pidan, escribe specs/F-XXX.md con:
- El problema que resuelve, en una frase.
- Qué entra y qué sale.
- De 5 a 8 criterios de aceptación, cada uno de sí o no.
- Qué queda fuera de alcance.
No añadas nada que no te hayan pedido.`

const ORQUESTA = 'Haz de fábrica para esta funcionalidad: [FUNCIONALIDAD]. 1) Usa el subagente redactor-specs para escribir specs/F-XXX.md y enséñamela antes de seguir. 2) Usa el subagente constructor para programarla en la rama factory/F-XXX. 3) Lanza en paralelo los subagentes revisor-seguridad, revisor-codigo, revisor-ui y revisor-ux sobre esa rama. 4) Si algún revisor encuentra algo grave, vuelve al constructor con esos puntos y repite el paso 3. 5) Usa el subagente aprobador para comprobar los criterios y decidir. Párate y avísame en cuanto el aprobador escale algo a revisión humana; no fusiones nada de cara al público sin mi visto bueno.'

export default {
  slug: 'guia-fabrica-software',
  seccion: 'skills',
  tema: 'desarrollo',
  tipo: 'guia',
  titulo: 'La fábrica de software: cuatro agentes que programan y revisan, y tú solo apruebas',
  gancho: 'Yo solo apruebo',
  resumen: 'Un redactor escribe la spec, un constructor la programa en una rama aparte, cuatro revisores (seguridad, código, UI y UX) la miran en paralelo y un aprobador la fusiona o la manda a una persona. Los cinco prompts tal cual, cómo montar el bucle con subagentes de Claude Code y las reglas que no se saltan: humano en el bucle y qué no se fusiona solo.',
  fecha: '2026-11-04',
  lectura: '9 min',
  nota: 'Guía de Silvestre AI. Es el bucle que enseñé en el reel de la fábrica, explicado para que lo montes tú. «factory» es una herramienta propia; aquí se reconstruye con lo que Claude Code ya trae (subagentes en .claude/agents y ramas de git). Se apoya en lo que Anthropic publica: el patrón evaluador-optimizador y el humano en el bucle de «Building effective agents» (diciembre de 2024) y las buenas prácticas de Claude Code.',
  portada: '/aiparatodo/fabrica-software.webp',
  instalarTodo: null,
  skills: [
    {
      n: '01', clave: 'la-fabrica', nombre: 'La fábrica', corto: 'cuatro agentes y tú aprobando',
      titular: 'La fábrica: cuatro agentes que programan, y tú solo apruebas',
      historia: 'No es un agente gigante que lo hace todo; son cuatro papeles pequeños, cada uno con un trabajo claro, que se pasan el testigo. El redactor convierte tu idea en una spec con criterios de sí o no. El constructor la programa en una rama aparte, sin tocar lo que ya funciona. Cuatro revisores la miran a la vez, cada uno desde su lado: seguridad, código, interfaz y experiencia. Y un aprobador comprueba los criterios y decide: o fusiona, o te la manda a ti. Si un revisor encuentra algo, se vuelve al constructor y se repite. Es el patrón que Anthropic llama evaluador-optimizador, con una persona en el bucle para lo que importa. En el reel lo probé de verdad: un tercer botón en la home, sobre una copia local de una de mis webs; el aprobador cumplió los seis criterios pero lo escaló a revisión humana porque el cambio lo ve cualquiera. Lo aprobé yo y se fusionó. Tú solo apruebas; el resto lo hacen los agentes.',
      puedesTitulo: 'El bucle, de principio a fin',
      puedes: [
        'Redactor de specs: tu idea se vuelve criterios de aceptación de sí o no',
        'Constructor: programa en una rama aparte, con varios commits',
        'Revisores en paralelo: seguridad, código, UI y UX, cada uno por su lado',
        'Aprobador: fusiona a main o lo escala a una persona',
        'Si algo falla, vuelve al constructor; tú apareces solo para aprobar',
      ],
      web: { nombre: 'Anthropic · Building effective agents', detalle: 'El patrón evaluador-optimizador y el humano en el bucle', url: EFECTIVOS, boton: 'Leer el artículo' },
      ejemplos: [],
    },
    {
      n: '02', clave: 'redactor', nombre: '1 · El redactor de specs', corto: 'tu idea, en criterios de sí o no',
      titular: 'El redactor: qué hay que hacer, y cómo saber que está hecho',
      historia: 'Casi todo lo que sale mal con la IA empieza aquí: le pides algo vago y te entrega algo vago. El redactor corta eso de raíz. No programa: coge tu idea y la deja en una spec corta con criterios de aceptación que se contestan con un sí o un no. «Aparece un tercer botón en la home y lleva a /precios» se puede comprobar; «que quede bien» no. Esos criterios son los que luego usará el aprobador para decidir, así que esta pieza es la que sostiene todas las demás. Cambia [FUNCIONALIDAD] por lo que quieras construir, y cuando te enseñe la spec, léela: si falta un criterio o sobra alcance, dilo ahora.',
      puedes: [
        'El problema en una frase, y qué entra y qué sale',
        'De 5 a 8 criterios de aceptación, cada uno de sí o no',
        'Lo que queda fuera de alcance, escrito aparte',
        'Nada que tú no hayas pedido',
      ],
      sueltaTitulo: 'Prompt 1 · El redactor de specs',
      sueltaNota: 'Cambia [FUNCIONALIDAD] por lo que quieres construir. Mejor en un chat o una sesión nueva.',
      suelta: REDACTOR,
      ejemplos: [],
    },
    {
      n: '03', clave: 'constructor', nombre: '2 · El constructor', corto: 'programa en una rama aparte',
      titular: 'El constructor: programa sin tocar lo que ya funciona',
      historia: 'El constructor lee la spec y la programa, pero con dos reglas que lo cambian todo. La primera: en una rama aparte (factory/F-XXX), nunca sobre main, para que, pase lo que pase, lo que está publicado siga intacto. La segunda: commits pequeños, para que luego se pueda ver qué hizo y, si hace falta, deshacer solo una parte. Antes de parar, comprueba él mismo que el proyecto arranca y repasa los criterios; si algo no cumple, lo arregla. No fusiona nada: eso es trabajo del aprobador. Así, cuando termina, tienes una rama lista para revisar y cero riesgo sobre lo que ya tenías.',
      puedes: [
        'Una rama nueva, factory/F-XXX, nunca main',
        'Commits pequeños y con mensaje claro',
        'Comprueba que compila o arranca antes de parar',
        'Repasa los criterios y arregla lo que falle; no fusiona',
      ],
      sueltaTitulo: 'Prompt 2 · El constructor',
      sueltaNota: 'Después de aprobar la spec. Cambia F-XXX por el número de tu funcionalidad.',
      suelta: CONSTRUCTOR,
      ejemplos: [],
    },
    {
      n: '04', clave: 'revisores', nombre: '3 · Los revisores en paralelo', corto: 'seguridad, código, UI y UX, a la vez',
      titular: 'Los revisores: cuatro miradas, cada una a lo suyo',
      historia: 'Un solo revisor mirándolo todo se cansa y se le escapan cosas. La fábrica lanza cuatro a la vez, y a cada uno le prohíbe meterse en lo que no es suyo: el de seguridad solo busca agujeros, el de código solo mira si está bien escrito, el de UI solo la interfaz y el de UX solo la experiencia de quien lo usa. Ninguno arregla nada: informan, del problema más grave al más leve, con archivo:línea y el cambio mínimo. Es el mismo prompt cuatro veces, cambiando una palabra. Si alguno encuentra algo grave, se vuelve al constructor con esos puntos y se repite; si todos pasan, le toca al aprobador. En mi prueba pasaron los cuatro a la primera, pero lo normal es que den una vuelta o dos, y está bien que así sea.',
      puedes: [
        'Seguridad: agujeros, datos expuestos, permisos',
        'Código: si está bien escrito y no se rompe nada',
        'UI: la interfaz, que se vea y se entienda',
        'UX: la experiencia de quien lo usa',
      ],
      sueltaTitulo: 'Prompt 3 · Un revisor (cambia la mirada)',
      sueltaNota: 'Lánzalo cuatro veces, una por dimensión. Cambia [DIMENSIÓN] por: seguridad / código / interfaz (UI) / experiencia de uso (UX).',
      suelta: REVISOR,
      ejemplos: [
        { titulo: 'Volver al constructor con lo que encontraron', texto: 'Estos son los informes de los revisores de la rama factory/F-XXX: [pega los informes]. Arregla solo los problemas graves y los que afecten a un criterio de aceptación, en esta misma rama, con un commit por arreglo. Lo leve y lo opinable, déjalo anotado pero no lo toques. Cuando acabes, dime qué cambiaste.' },
      ],
    },
    {
      n: '05', clave: 'aprobador', nombre: '4 · El aprobador', corto: 'fusiona a main o te lo escala a ti',
      titular: 'El aprobador: comprueba los criterios y decide',
      historia: 'El aprobador es el único que puede fusionar, y antes de hacerlo repasa los criterios de la spec uno por uno y lee lo que dijeron los revisores. A partir de ahí, dos caminos. Si se cumple todo y nadie dejó nada grave, puede fusionar a main. Pero si falta un criterio, o si el cambio lo ve cualquier visitante, toca dinero o toca datos de personas, no fusiona: te lo escala con un resumen para que decidas tú. Esa última regla es la que te deja dormir tranquilo: nada de cara al público entra solo. En mi prueba cumplió los seis criterios y aun así lo escaló, porque un botón en la home lo ve todo el mundo; lo aprobé yo con una orden y ahí sí se fusionó.',
      puedes: [
        'Repasa los criterios de aceptación, uno a uno',
        'Lee los informes de los revisores',
        'Fusiona a main solo si está todo y no hay nada grave',
        'Escala a una persona lo público, lo que toca dinero o datos',
      ],
      sueltaTitulo: 'Prompt 4 · El aprobador',
      sueltaNota: 'Cuando los revisores hayan pasado. Ajusta la regla de escalado a lo que en tu proyecto deba ver una persona.',
      suelta: APROBADOR,
      ejemplos: [],
    },
    {
      n: '06', clave: 'montaje', nombre: 'Móntala en Claude Code', corto: 'cada agente, un subagente; el bucle, un comando',
      titular: 'Móntala en Claude Code: cada agente es un subagente',
      historia: 'Los cinco prompts valen pegándolos en chats sueltos, pero el bucle se automatiza si cada agente es un subagente de Claude Code. Un subagente es un archivo en .claude/agents/ con dos líneas arriba (su nombre y cuándo se usa), qué herramientas puede tocar, y debajo su sistema: justo el prompt de antes. Creas cinco archivos (redactor-specs, constructor, revisor-seguridad, revisor-codigo, revisor-ui, revisor-ux y aprobador) y luego, desde una sesión, le pides a Claude que haga de fábrica: que llame a cada subagente en orden, lance los revisores en paralelo y se pare cuando el aprobador escale. Al de seguridad y los revisores les quitas permiso de escribir (que solo lean), y al aprobador le das el de git. Eso es, en esencia, lo que mi herramienta «factory» hace por detrás: una sesión de Claude Code por agente.',
      puedesTitulo: 'Los archivos que creas',
      puedes: [
        '.claude/agents/redactor-specs.md (solo lee y escribe la spec)',
        '.claude/agents/constructor.md (programa en la rama)',
        '.claude/agents/revisor-seguridad|codigo|ui|ux.md (solo leen)',
        '.claude/agents/aprobador.md (repasa criterios y puede usar git)',
      ],
      web: { nombre: 'Claude Docs · Subagents', detalle: 'Cómo se define un subagente en .claude/agents', url: SUBAGENTES, boton: 'Ver la documentación' },
      sueltaTitulo: 'La plantilla de un subagente (.claude/agents/redactor-specs.md)',
      sueltaNota: 'Guarda cada agente en .claude/agents/ con este formato: las dos líneas de arriba entre --- y debajo su prompt. Copia este y repite para los demás, cambiando name, description, tools y el texto.',
      suelta: AGENTE_MD,
      ejemplos: [
        { titulo: 'El comando que mueve el bucle', texto: ORQUESTA },
      ],
    },
    {
      n: '07', clave: 'reglas', nombre: 'Las reglas que no se saltan', corto: 'humano en el bucle y cuándo escalar',
      titular: 'Las reglas: humano en el bucle, y qué no se fusiona solo',
      historia: 'La fábrica solo es segura si tres reglas no se negocian. Una: criterios de sí o no. Si un criterio no se puede comprobar, el aprobador no tiene con qué decidir y todo se vuelve opinión. Dos: siempre en rama aparte. Main es sagrado; si algo sale mal, se tira la rama y no ha pasado nada. Tres: humano en el bucle para lo que importa. Un cambio que ve cualquier visitante, que toca dinero o que toca datos de personas no se fusiona solo, por muy verdes que estén los criterios: lo aprueba una persona. El resto —un script interno, una prueba, algo que solo ves tú— puede fusionarlo el aprobador. La gracia no es quitarte del medio del todo, es que solo aparezcas donde de verdad haces falta.',
      puedes: [
        'Criterios de sí o no: si no se puede comprobar, no es criterio',
        'Siempre en rama aparte; main no se toca hasta aprobar',
        'Público, dinero o datos de personas: lo aprueba una persona',
        'Lo interno y de bajo riesgo sí puede fusionarlo el aprobador',
      ],
      web: { nombre: 'Anthropic · Claude Code best practices', detalle: 'Trabajar en ramas, con criterios claros y revisión', url: BEST, boton: 'Leer las buenas prácticas' },
      ejemplos: [],
    },
  ],
}
