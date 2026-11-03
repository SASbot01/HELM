// Hilo de la sección «Skills y repos», tema «Claude Code». Lead magnet del reel
// «La skill que busca skills por ti» (comenta SKILL).
// Datos comprobados el 03/11/2026 con `gh api`, leyendo el repo sin ejecutar
// nada:
// - vercel-labs/skills (MIT, 37.875★, 3.276 forks, push 2026-11-03):
//   «The open agent skills tool — npx skills», la CLI y el ecosistema abierto de
//   skills de Vercel Labs. La monta el equipo que lleva skills.sh (su directorio
//   de skills, construido sobre la spec de Skills de Anthropic).
// - skills/find-skills/SKILL.md: la skill que descubre e instala otras skills.
//   Salta cuando dices «cómo hago X», «¿hay una skill para X?», «¿puedes hacer
//   X?» o quieres ampliar lo que hace tu agente. Usa la CLI: `npx skills find`
//   para buscar (en skills.sh) y `npx skills add` para instalar.
// Los números de skills.sh que circulan por redes (1,2M skills, 4,2M
// instalaciones, nº1 del leaderboard) son del directorio, no de GitHub: no se
// pueden comprobar con gh api, así que aquí se cuenta lo verificable.
// Node.js, -g, -a claude-code, /reload-skills y la telemetría de la CLI están
// comprobados en el hilo plugins-claude-code.

const GH = 'https://github.com/vercel-labs/skills/tree/main/skills/find-skills'

export default {
  slug: 'find-skills',
  portada: '/aiparatodo/find-skills.webp',
  seccion: 'skills',
  tema: 'desarrollo',
  tipo: 'guia',
  titulo: 'find-skills: la skill que busca skills por ti',
  gancho: 'Que Claude encuentre la skill que necesitas',
  resumen: 'La skill de Vercel Labs que le da a tu agente un buscador de skills: le dices lo que quieres hacer —una web, contenido, revisar código— y busca en el ecosistema abierto, te propone las que mejor encajan y, si dices que sí, te las instala. Dentro: qué es, cómo instalarla, cómo pedirle que busque e instale, y ejemplos.',
  fecha: '2026-11-03',
  lectura: '6 min',
  nota: 'No es una skill de Anthropic: es un proyecto de Vercel Labs, gratis y de código abierto (MIT), parte de la CLI `npx skills` y de su directorio skills.sh. Comprobada en el repo vercel-labs/skills el 03/11/2026 (37.875★). Los recuentos del directorio (millones de skills e instalaciones) son de skills.sh, no de GitHub.',
  instalarTodo: 'npx skills add vercel-labs/skills@find-skills -g -a claude-code',
  skills: [
    {
      n: '01', clave: 'find-skills', nombre: 'Qué es', corto: 'un buscador de skills dentro de tu agente',
      titular: 'La skill que, en vez de hacer el trabajo, encuentra la que lo hace',
      historia: 'El ecosistema de skills crece más rápido de lo que nadie puede seguir: hay skills para diseñar como Apple, para montar documentos de oficina, para revisar pull requests, para casi todo. El problema ya no es que no exista la skill que necesitas, es encontrarla. find-skills resuelve justo eso: es una skill que le enseña a tu agente a buscar otras. Cuando le dices «¿cómo hago X?», «¿hay una skill para X?» o «¿puedes hacer X?», en vez de improvisar, busca en el directorio abierto (skills.sh), filtra por lo que mejor encaja y te propone las candidatas. Si le dices que sí, te las instala. La lleva Vercel Labs, el mismo equipo que mantiene la CLI `npx skills` y ese directorio.',
      puedes: [
        'Pedirle una capacidad por lo que quieres lograr, sin saber qué skill existe',
        'Que te proponga las que mejor encajan en vez de buscar tú a mano',
        'Instalarlas en el momento, sin salir de la conversación',
        'Descubrir skills que no sabías que existían para algo que ya haces a mano',
      ],
      autor: 'Vercel Labs', oficial: false, repo: 'vercel-labs/skills', github: GH, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '02', clave: 'instalacion', nombre: 'Instalación', corto: 'una orden en la terminal',
      titular: 'Instálala en un minuto',
      historia: 'Se instala con la propia CLI de skills de Vercel. Con `@find-skills` te llevas solo esta. Con -g queda para todos tus proyectos; sin -g, solo para el que estás. Funciona en Claude Code y en otros agentes que usan skills: si quitas `-a claude-code`, la CLI te pregunta en cuáles instalarla. A partir de ahí, find-skills se activa sola cuando le pides algo que podría tener skill.',
      puedes: [
        'Instalar solo esta skill, para todos tus proyectos o solo para uno',
        'Ver lo que tienes instalado: npx skills list -g',
        'Quitarla: npx skills remove -g find-skills',
        'Usarla también fuera de Claude Code (Cursor, Codex y otros agentes con skills)',
      ],
      sueltaTitulo: 'Instalar en tu terminal',
      sueltaNota: 'Necesitas Node.js 22.20 o superior. Claude Code la detecta sin reiniciar; si la carpeta ~/.claude/skills no existía al abrir la sesión, escribe /reload-skills. La CLI manda telemetría anónima: se apaga con DISABLE_TELEMETRY=1.',
      suelta: 'npx skills add vercel-labs/skills@find-skills -g -a claude-code',
      autor: 'Vercel Labs', oficial: false, repo: 'vercel-labs/skills', github: GH, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '03', clave: 'como-se-usa', nombre: 'Cómo se usa', corto: 'buscar, instalar y mantener al día',
      titular: 'Dos órdenes y ya: buscar e instalar',
      historia: 'Una vez instalada, no tienes que acordarte de nada: cuando le pidas a tu agente algo que podría tener skill, la usa sola. Pero por debajo son dos órdenes muy simples. `npx skills find` busca en el directorio —puedes darle una palabra o dejar que te pregunte—, y `npx skills add` instala la que elijas. Con `npx skills update` pones al día todo lo que ya tienes. Y skills.sh es el escaparate: ahí ves cada skill, de quién es y cómo se instala antes de decidir.',
      puedes: [
        'Buscar por lo que quieres hacer: npx skills find "revisar código"',
        'Buscar solo entre las de un autor de confianza: npx skills find --owner anthropics',
        'Instalar la que elijas: npx skills add <autor/repo@skill>',
        'Mantener todas al día de una vez: npx skills update',
      ],
      sueltaTitulo: 'Las órdenes',
      sueltaNota: 'La primera busca; la segunda instala (cambia el ejemplo por la skill que quieras); la tercera actualiza. Browse en skills.sh.',
      suelta: 'npx skills find "lo que quieras hacer"\n\nnpx skills add anthropics/skills@pdf -g -a claude-code\n\nnpx skills update',
      autor: 'Vercel Labs', oficial: false, repo: 'vercel-labs/skills', github: GH, licencia: 'MIT',
      ejemplos: [
        'Encuéntrame una skill para que mis documentos de Word salgan con mi plantilla',
        '¿Hay una skill para revisar pull requests como lo haría un senior?',
        'Quiero que mis webs no huelan a IA: busca una skill de diseño y pruébala',
      ],
    },
    {
      n: '04', clave: 'cuando-salta', nombre: 'Cuándo salta', corto: 'sin pedirla, cuando hace falta',
      titular: 'No tienes que acordarte de ella',
      historia: 'Lo bueno de una skill bien hecha es que se activa sola en el momento justo. find-skills salta cuando dices «¿cómo hago X?», «busca una skill para X», «¿puedes hacer X?» o cuando sueltas que ojalá tuvieras ayuda con un tema (diseño, pruebas, despliegue…). En vez de contestarte a ciegas, mira si existe una herramienta para eso y te la ofrece. Es la diferencia entre un agente que improvisa y uno que, antes de nada, se pregunta «¿no habrá ya una skill para esto?».',
      puedes: [
        'Trabajar normal y que te sugiera skills cuando encajen, sin pedirlas',
        'Partir de un deseo vago («ojalá esto se hiciera solo») y que te lo aterrice',
        'Evitar reinventar lo que ya existe y está probado por la comunidad',
        'Combinarla con las demás de este hilo: ella las encuentra, tú las instalas',
      ],
      autor: 'Vercel Labs', oficial: false, repo: 'vercel-labs/skills', github: GH, licencia: 'MIT',
      ejemplos: [],
    },
  ],
}
