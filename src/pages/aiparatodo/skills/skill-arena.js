// Hilo de la sección «Skills y repos», tema «Claude Code». Lead magnet del reel
// «¿No te gusta lo que te responde Claude? Deja de repetir el prompt» (comenta
// ARENA). Datos comprobados el 28/10/2026 con gh api, leyendo el repo sin
// ejecutar nada:
// - Jakeschincariol/arena-skill (MIT, 1.086★): un solo commit, del 26/09/2026
//   (df07b8e). README, skills/arena/SKILL.md (371 líneas), rubric.md,
//   strategies.json, bracket.py (solo biblioteca estándar) y
//   .claude-plugin/marketplace.json (marketplace «arena-skill», plugin
//   «arena-skill»: como plugin se llama /arena-skill:arena).
// - Cifras del README: 15 modos de razonar × 12 flujos × 12 estrategias =
//   2.160 cartas; rúbrica 30/25/20/15/10; 100 agentes = 7 rondas, 595 llamadas
//   a subagentes en 70 tandas de 10; --quick = 16 agentes, 91 llamadas.
// - Si la skill se activa sola (sin /arena), pregunta antes de gastar.
// Los bloques de terminal no llevan comentarios detrás de una orden (zsh del Mac).

const REPO = 'https://github.com/Jakeschincariol/arena-skill'

export default {
  slug: 'skill-arena',
  seccion: 'skills',
  tema: 'desarrollo',
  tipo: 'guia',
  titulo: 'Arena: 100 Claudes compiten y te quedas con la respuesta que sobrevive',
  gancho: 'Deja de repetir el prompt',
  resumen: 'La skill de Jake Schincariol para cuando Claude te da una respuesta que no te convence: lanza 100 subagentes con la misma tarea y una estrategia distinta cada uno, los enfrenta en un torneo eliminatorio con un juez y una rúbrica, y te devuelve la que sobrevive. Con la instalación, cómo se usa, lo que gasta de verdad y cuándo merece la pena.',
  fecha: '2026-10-28',
  lectura: '7 min',
  nota: 'Skill gratis y de código abierto (MIT) de Jake Schincariol, no oficial de Anthropic. La skill es gratis, pero los tokens los pagas tú: el torneo completo de 100 agentes son 595 llamadas a subagentes. Necesitas Claude Code y Python 3.8 o superior. Comprobada en su repo el 28/10/2026.',
  portada: '/aiparatodo/arena.webp',
  instalarTodo: null,
  skills: [
    {
      n: '01', clave: 'arena', nombre: 'Qué es', corto: '100 subagentes, la misma tarea y un torneo',
      titular: 'Cuando Claude no da con la respuesta, que compitan 100',
      historia: 'Cuando una respuesta no te convence, lo normal es repetir el prompt una y otra vez. Arena hace otra cosa. Escribes /arena y lanza subagentes (100 por defecto) con exactamente la misma tarea, palabra por palabra. A cada uno le reparte una carta distinta: una forma de razonar, un flujo de trabajo y una estrategia, así que cada uno la ataca de otra manera. Luego se enfrentan por parejas: cada uno critica la solución del otro, defiende la suya y la corrige, y un juez puntúa el combate con una rúbrica. El que pierde queda fuera: 100, 50, 25, 13, 7, 4, 2 y 1. Te devuelve la solución que sobrevive, los ataques que superó y cuántas rondas aguantó. Y no toca tus archivos: todo lo escribe en una carpeta .arena/, y aplicar la respuesta es decisión tuya.',
      puedes: [
        'Mejorar un titular, un guion, un plan o un correo que no te convence',
        'Atacar un fallo de código difícil, como un test que falla a ratos',
        'Comparar a ciegas la ganadora con la respuesta que rechazaste',
        'Repetir el mismo torneo con la misma semilla (--seed)',
      ],
      autor: 'Jake Schincariol', oficial: false, repo: 'Jakeschincariol/arena-skill', github: REPO, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '02', clave: 'cartas', nombre: 'Las cartas', corto: '2.160 formas distintas de atacar la misma tarea',
      titular: 'Las cartas: 2.160 formas de atacar la misma tarea',
      historia: 'Lo que hace distintos a los 100 agentes no es el modelo, que es el mismo, sino la carta. Cada carta junta tres cosas. Un modo de razonar, de 15: primeros principios, darle la vuelta al problema, buscar una analogía, pensar como un adversario, empezar por las restricciones, preguntar como Sócrates, llevar la contraria, pensar en sistema… Un flujo de trabajo, de 12: borrador, crítica y reescritura; esquema primero; test primero; investigar y luego sintetizar; tres borradores y elegir uno… Y una estrategia, de 12: lo más simple que funcione, rigor máximo, ponerse en el lugar del usuario, empezar por los casos límite, velocidad… Son 2.160 combinaciones. Ningún agente repite carta y, hasta 144 agentes, ni siquiera comparten dos de sus tres partes. Las cartas están en un archivo (strategies.json) que puedes editar.',
      puedes: [
        '15 modos de razonar, 12 flujos de trabajo y 12 estrategias',
        'Cartas sin repetir y repartidas lo más igualadas posible',
        'Editar las cartas a tu gusto en strategies.json',
      ],
      ejemplos: [],
    },
    {
      n: '03', clave: 'torneo', nombre: 'El torneo', corto: 'atacar, defender, corregir y un juez',
      titular: 'Atacar, defender y un juez con rúbrica',
      historia: 'En cada combate se emparejan dos soluciones, evitando que se enfrenten dos agentes con el mismo modo de razonar. Cada uno ataca la del otro desde su carta: qué está mal, qué requisito se dejó y qué caso exacto la rompe. Son hasta 7 ataques, marcados como FATAL, MAJOR o MINOR. Luego cada uno responde a los ataques que recibió, reconociéndolos o rebatiéndolos con pruebas, y reescribe su solución para arreglar lo que reconoció. Un juez aparte lee las dos soluciones corregidas, comprueba cada ataque por su cuenta y las puntúa. El juez nunca ve las cartas, y una solución con un fallo fatal comprobado no puede ganar a una que no lo tiene. Si empezaste desde una respuesta que rechazaste, al final un último juez compara a ciegas la ganadora con la tuya y te dice el resultado, aunque gane la vieja.',
      puedesTitulo: 'La rúbrica del juez (100 puntos)',
      puedes: [
        'Corrección: 30',
        'Que cumpla todo lo que pide la tarea: 25',
        'Que aguante los ataques recibidos: 20',
        'Concreción: 15',
        'Claridad: 10',
      ],
      ejemplos: [],
    },
    {
      n: '04', clave: 'instalacion', nombre: 'Instalación', corto: 'que te la instale Claude, o copiar la carpeta',
      titular: 'Instálala',
      historia: 'Lo más fácil: abre Claude Code, pega el enlace del repo y pídele que la instale (el prompt de abajo). También puedes copiar la carpeta a mano o instalarla como plugin. Si la copias, se llama /arena; como plugin, Claude Code le pone delante el nombre del plugin y queda como /arena-skill:arena. Para que solo esté en un proyecto, copia la carpeta en el .claude/skills/ de ese proyecto en vez de en tu carpeta personal. Necesitas Claude Code, porque lanza los subagentes con su herramienta de agentes, y Python 3.8 o superior. No hay que instalar nada más.',
      puedes: [
        'Pegar el enlace en Claude Code y pedirle que la instale',
        'Copiar la carpeta en ~/.claude/skills (todos tus proyectos) o en .claude/skills de un proyecto',
        'Como plugin, dentro de Claude Code: /plugin marketplace add Jakeschincariol/arena-skill y luego /plugin install arena-skill@arena-skill',
      ],
      sueltaTitulo: 'Copiar la carpeta en tu terminal',
      sueltaNota: 'Así queda como /arena para todos tus proyectos. En el Mac, python3 viene con las herramientas de desarrollo de Apple (si no las tienes, el Mac te ofrece instalarlas); en Windows, instala Python antes.',
      suelta: 'git clone https://github.com/Jakeschincariol/arena-skill.git\ncp -r arena-skill/skills/arena ~/.claude/skills/',
      ejemplos: [
        { titulo: 'Que Claude Code la instale', texto: 'https://github.com/Jakeschincariol/arena-skill\n\nInstala esta skill y comprueba que /arena funciona.' },
      ],
    },
    {
      n: '05', clave: 'uso', nombre: 'Cómo se usa', corto: '/arena, --quick, --agents y --seed',
      titular: 'Cómo se usa',
      historia: 'Si escribes /arena sin más, toma como tarea tu última petición y como respuesta a batir la que no te gustó. También puedes darle la tarea detrás. Claude puede lanzarla solo si le dices algo como «esa respuesta es mala, que compitan», y en ese caso te pregunta antes de gastar nada. Dos cosas importantes. Los subagentes no ven tu conversación: la skill escribe la tarea en un archivo (.arena/<ejecución>/task.md) y eso es todo lo que saben, así que si un requisito no está ahí, los 100 se lo saltan. Y cada subagente escribe un archivo, así que en el modo de permisos normal te pedirá permiso una vez por archivo: actívale «aceptar ediciones» (Mayús+Tab).',
      puedesTitulo: 'Las opciones',
      puedes: [
        '--quick: 16 agentes, para el día a día',
        '--agents N: el número de agentes que quieras (100 por defecto)',
        '--seed S: misma semilla, mismas cartas y mismos cruces (no las mismas respuestas)',
        '--wave W: subagentes por tanda (10 por defecto); súbelo solo si subiste el límite de Claude Code',
      ],
      sueltaTitulo: 'Dentro de Claude Code',
      sueltaNota: 'Ejemplos del propio repo: la tarea va detrás de las opciones.',
      suelta: '/arena\n/arena --quick write the headline for our pricing page\n/arena --agents 32 fix the flaky test in tests/test_api.py\n/arena --seed 7 plan my launch week, I have 6 hours a day',
      ejemplos: [
        { titulo: 'El titular de tu página de ventas', texto: '/arena --quick Escribe el titular y el subtítulo de la página de venta de [tu producto] para [tu cliente ideal]. Tiene que decir el resultado concreto que consigue, sin promesas exageradas, en menos de 12 palabras el titular y 25 el subtítulo.' },
        { titulo: 'El guion de un reel', texto: '/arena --quick Escribe el guion de un reel de 30 segundos sobre [tema] para [tu público]. Gancho en los 3 primeros segundos, una sola idea, frases cortas para decir en voz alta y un CTA final para que comenten [palabra].' },
      ],
    },
    {
      n: '06', clave: 'coste', nombre: 'Lo que cuesta', corto: 'de 43 a 595 llamadas, según cuántos agentes',
      titular: 'Lo que cuesta (y cuándo merece la pena)',
      historia: 'La skill es gratis, pero los tokens los pagas tú, y 100 agentes son muchos. Si usas Claude Code con tu plan Pro o Max, sale de tu límite de uso; con clave de API, lo pagas por tokens. Cada llamada lee la tarea y una o dos soluciones, así que la cuenta crece con el tamaño de la tarea. Además, no corren los 100 a la vez: Claude Code lanza como mucho 10 herramientas a la vez por defecto, así que va en tandas de 10 y tarda un rato. Antes de empezar, la skill te dice el tamaño del torneo. La recomendación del propio autor: --quick o --agents 16 para lo de cada día, y los 100 para la respuesta que de verdad importa.',
      puedesTitulo: 'Agentes → rondas, llamadas y tandas de 10',
      puedes: [
        '100 (por defecto): 7 rondas, 595 llamadas, 70 tandas',
        '64: 6 rondas, 379 llamadas, 49 tandas',
        '32: 5 rondas, 187 llamadas, 28 tandas',
        '16 (--quick): 4 rondas, 91 llamadas, 16 tandas',
        '8: 3 rondas, 43 llamadas, 10 tandas',
        'Una llamada más si hay una respuesta rechazada que batir',
      ],
      ejemplos: [],
    },
    {
      n: '07', clave: 'letra-pequena', nombre: 'La letra pequeña', corto: 'lo que no hace y lo que no promete',
      titular: 'La letra pequeña',
      historia: '«100 versiones de Claude» son 100 subagentes del mismo modelo que estés usando, no 100 modelos distintos: lo que los diferencia es la carta. Los jueces también son Claude, puntuando con una rúbrica que está en el repo para que la leas y la cambies. Lo que te llevas es la mejor respuesta que encontró ese torneo, no una prueba de que sea correcta; por eso te enseña los ataques que superó. La misma semilla da las mismas cartas y los mismos cruces, pero no las mismas respuestas. No arregla una tarea mal planteada: si la tarea es vaga, salen 100 respuestas vagas. Y nunca edita tu proyecto: los cambios de código vuelven como un diff o como archivos completos dentro de la respuesta ganadora, y aplicarlos lo decides tú.',
      puedes: [
        'Escribe bien la tarea antes de lanzarla: es lo único que ven los 100',
        'Empieza con --quick y sube solo si el resultado lo merece',
        'Revisa los ataques que superó la ganadora antes de fiarte de ella',
      ],
      ejemplos: [],
    },
  ],
}
