// Hilo de la sección «Skills y repos», tema «estrategia». Lead magnet del reel
// «Skills para buscar inversión (Seed)» (comenta SKILL). Datos comprobados el
// 01/11/2026 con gh api, leyendo el repo sin ejecutarlo:
// - neubauerwilli/seed-skill (MIT, 1★, creado y último cambio el 29/10/2026):
//   11 skills EN ALEMÁN (seed-start, -konkurrenz, -markt, -investoren, -plan,
//   -praesentation, -zahlen, -foerderung, -closer, -gespraech, -crm). Su README
//   dice que es una versión propia de la idea de un reel de opusjake (Jake
//   Schincariol) del 27/10/2026, sin código de otro repo; Jake no ha publicado
//   un repo así (lista de sus repos, 01/11/2026). Las cuatro del reel de Alex:
//   konkurrenz, investoren, plan + praesentation y closer.
// - Lo que hay de código (versand.py, crm.py, finanzplan.py) solo usa la
//   biblioteca estándar y no abre conexiones: versand.py revisa el borrador y
//   apunta el «ja» en un archivo; no envía nada.
// - Plugin: marketplace «seed-skill», plugin «seed-skill» (/seed-skill:…).
// - Alternativa en inglés: emotixco/claude-skills-founder (MIT, 769★, último
//   cambio el 01/11/2026), 14 skills; competitor-matrix, fundraise-prep,
//   pitch-deck y product-brief; su email-sequence es de onboarding, no de
//   inversores. Plugin «founder@emotix».
// Lo de España (LSSI, ENISA, CDTI) no sale de los repos: contexto general, no
// asesoramiento. Los bloques de terminal no llevan comentarios detrás de una orden.

const REPO = 'https://github.com/neubauerwilli/seed-skill'
const SKILLS = `${REPO}/tree/main/skills`
const EMOTIX = 'https://github.com/emotixco/claude-skills-founder'

export default {
  slug: 'repo-seed-skill',
  seccion: 'skills',
  tema: 'estrategia',
  tipo: 'repo',
  titulo: 'Seed Skill: 11 skills gratis para preparar tu ronda de inversión con Claude',
  gancho: 'Prepara tu ronda sin hacerlo todo tú',
  resumen: 'Un pack de skills para fundadores que preparan una ronda pre-seed o seed: una analiza a tu competencia, otra busca inversores que encajan con tu fase y tu sector, otras escriben el plan de negocio y el pitch deck, y el Closer redacta los emails a inversores y su seguimiento. Qué hace cada una, cómo instalarlo, cómo usarlo en español y una alternativa en inglés más rodada.',
  fecha: '2026-11-01',
  lectura: '9 min',
  nota: 'Código abierto (MIT) de Willi Neubauer, no oficial de Anthropic. Ojo: está en alemán, es muy nuevo (del 29/10/2026) y piensa en Alemania y Austria; abajo tienes cómo usarlo en español. Redacta y prepara: los emails los envías tú, la llamada la haces tú y la ronda la cierras tú. Es gratis, pero lo usas con tu cuenta de Claude. No es asesoramiento financiero ni legal.',
  portada: '/aiparatodo/seed-skill.webp',
  skills: [
    {
      n: '01', clave: 'seed-skill', nombre: 'Qué es', corto: '11 skills que preparan tu ronda, de la idea al email',
      titular: 'Un pack de skills para fundadores, y cada una hace su trabajo',
      historia: 'Seed Skill son once skills para Claude que te acompañan en una ronda pre-seed o seed, de principio a fin. Empiezas con /seed-start: te hace siete preguntas sobre tu idea, comprueba si está madura para buscar inversión y te dice qué toca después. Cada skill deja su trabajo como un archivo en una carpeta seed/ de tu proyecto, y las siguientes lo leen: la del deck usa lo que encontró la de competencia, y el Closer usa la lista de inversores. Son gratis, sin registro, sin clave de API y sin nada que conectar. Su autor cuenta en el README que lo hizo a partir de la idea de un reel de Jake Schincariol, con su propio código.',
      puedesTitulo: 'Las once',
      puedes: [
        '/seed-start: siete preguntas sobre tu idea y si está lista para buscar inversión',
        '/seed-konkurrenz: tu competencia y sus puntos débiles, con enlaces',
        '/seed-markt: el tamaño de tu mercado (TAM, SAM y SOM), calculado de abajo arriba',
        '/seed-investoren: inversores que encajan con tu fase y tu sector, cada uno con su fuente',
        '/seed-plan y /seed-praesentation: el plan de negocio y el pitch deck',
        '/seed-zahlen: cuánto dinero necesitas, valoración, dilución y para cuánto te llega',
        '/seed-foerderung: ayudas públicas como alternativa (pensadas para Alemania, Austria y Suiza)',
        '/seed-closer y /seed-crm: los emails a inversores, el seguimiento y la lista de contactos',
        '/seed-gespraech: prepara la reunión con un inversor y practica las preguntas difíciles',
      ],
      autor: 'Willi Neubauer', oficial: false, repo: 'neubauerwilli/seed-skill', clave_repo: true, github: REPO, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '02', clave: 'competencia', nombre: 'Competencia', corto: 'sus precios, sus quejas y por dónde atacarlos',
      titular: 'Competencia: dónde son débiles tus competidores',
      historia: 'La skill de competencia (/seed-konkurrenz, «buscador de puntos débiles») busca competidores directos e indirectos en fuentes públicas. Lee sus precios, sus valoraciones y las quejas de sus clientes, y te enseña dónde se les puede atacar y en qué se puede diferenciar tu idea. Cada dato lleva su enlace y no inventa nada: si no encuentra un precio, lo dice. Es lo que un inversor te va a preguntar en los primeros cinco minutos: quién más hace esto y por qué te van a elegir a ti.',
      puedes: [
        'Competidores directos e indirectos, de fuentes públicas',
        'Sus precios, reseñas y quejas, con enlace a cada dato',
        'Dónde son débiles y dónde puedes diferenciarte',
        'Lo deja en seed/konkurrenz.md para el plan y el deck',
      ],
      github: `${SKILLS}/seed-konkurrenz`, autor: 'Willi Neubauer', oficial: false, repo: 'neubauerwilli/seed-skill', licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '03', clave: 'inversores', nombre: 'Inversores', corto: 'los que encajan por fase, sector y región, con fuente',
      titular: 'Inversores: los que encajan contigo, no una lista de mil',
      historia: 'La skill de inversores (/seed-investoren) busca business angels, redes de angels y fondos que invierten en fases tempranas. Parte de tu sector, tu modelo de negocio, tu fase (idea, prototipo, primeros clientes o primeros ingresos) y tu país. De cada candidato abre su propia web y mira en qué fases y sectores invierte, en qué región, cómo se le presenta un proyecto, si publica el tamaño de su ticket y qué empresas tiene en cartera. Te explica por qué encaja cada uno y te da la fuente. No inventa inversores, tickets ni direcciones de contacto. Si un dato solo sale de un directorio de terceros, lo marca para que lo compruebes en la web del inversor.',
      puedes: [
        'Redes de business angels, clubs y fondos pre-seed y seed',
        'Filtrados por fase, sector, región y, si lo publican, ticket',
        'Ejemplos de su cartera y cómo presentarles tu proyecto',
        'Cada inversor con el porqué y su fuente; nada inventado',
      ],
      github: `${SKILLS}/seed-investoren`, autor: 'Willi Neubauer', oficial: false, repo: 'neubauerwilli/seed-skill', licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '04', clave: 'plan-y-deck', nombre: 'Plan y pitch deck', corto: 'el plan de negocio, los números y las diapositivas',
      titular: 'Plan de negocio y pitch deck a partir de lo que ya has trabajado',
      historia: 'Con lo que han dejado las demás skills, /seed-plan escribe el plan de negocio en versión corta (dos páginas, para la primera conversación y para adjuntar al email) o completa. Separa los hechos de las suposiciones y dice cómo se comprobaría cada suposición. /seed-praesentation monta el pitch deck: doce diapositivas con una sola idea cada una y como mucho 30 palabras, en esquema con lo que tienes que decir o como un archivo HTML que abres en el navegador y guardas como PDF. Los números salen de /seed-zahlen, que calcula con un pequeño programa cuánto dinero necesitas el primer año, para cuántos meses te llega, la valoración antes y después de la ronda y cuánto te diluyes. Y el tamaño del mercado, de /seed-markt.',
      puedes: [
        'Plan de negocio corto (2 páginas) o completo, con hechos y suposiciones separados',
        'Pitch deck de 12 diapositivas: esquema con texto para decir, o HTML listo para PDF',
        'Cuánto necesitas, para cuánto te llega, valoración y dilución, calculados',
        'Tamaño de mercado de abajo arriba, con cada suposición a la vista',
      ],
      github: `${SKILLS}/seed-praesentation`, autor: 'Willi Neubauer', oficial: false, repo: 'neubauerwilli/seed-skill', licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '05', clave: 'closer', nombre: 'Closer', corto: 'emails personalizados a inversores y su seguimiento',
      titular: 'El Closer: emails a inversores que se leen, y un seguimiento sin dar la lata',
      historia: 'El Closer (/seed-closer) escribe un email personal a cada inversor como borrador: un archivo por inversor en seed/closer/, o en la carpeta de borradores de tu correo si tienes una herramienta de correo conectada. Cada email tiene entre 90 y 160 palabras y sigue un orden: por qué le escribes a esa persona, qué construyes en una frase, una prueba (usuarios, clientes piloto, ingresos o el estado real si aún no hay), cuánto buscas y para qué, y la petición de una llamada de 20 minutos con dos horarios. Nunca envía nada por su cuenta. Te enseña el borrador con el destinatario y la fuente de su dirección, y te pregunta si sale; solo cuenta un «sí» sin nada más. «Sí, pero…», «sí a todos» u «ok» no valen, y si cambias el texto hace falta otro sí. Un solo destinatario, sin copias, y solo a direcciones que el inversor publica. Como mucho dos seguimientos, con cinco días laborables entre uno y otro; si no hay respuesta, ese inversor pasa a «sin interés». /seed-crm lleva la lista: en qué punto está cada inversor y a quién le toca seguimiento.',
      puedes: [
        'Un borrador por inversor, con un motivo concreto sacado de su web o su cartera',
        'Tu «sí» para cada email; el envío lo haces tú desde tu correo',
        'Hasta dos seguimientos, cada uno con algo nuevo que contar',
        'Respuestas a quien contesta: horarios, dudas o un «gracias» si es un no',
        'La lista de inversores en un CSV en tu ordenador, con estado y próximo paso',
      ],
      github: `${SKILLS}/seed-closer`, autor: 'Willi Neubauer', oficial: false, repo: 'neubauerwilli/seed-skill', licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '06', clave: 'instalacion', nombre: 'Instalación', corto: 'pega el enlace en Claude Code y di «instala la skill»',
      titular: 'Instálalo',
      historia: 'Lo más fácil: abre Claude Code, pega el enlace del repo y dile que lo instale (el prompt de abajo). También se puede instalar como plugin o copiando las carpetas. Como plugin, las skills se llaman /seed-skill:seed-start, /seed-skill:seed-closer… Si copias las carpetas, se quedan en /seed-start, /seed-closer… Para que estén solo en un proyecto, cópialas en el .claude/skills/ de ese proyecto. Las herramientas de números, del Closer y de la lista necesitan Python 3.8 o superior, sin instalar nada más. Sin Claude Code también puedes pegar una SKILL.md al principio de un chat y funciona como un modo, aunque sin esas herramientas.',
      puedes: [
        'Pegar el enlace en Claude Code y pedirle que lo instale',
        'Como plugin: /plugin marketplace add neubauerwilli/seed-skill y /plugin install seed-skill@seed-skill',
        'Copiando las carpetas a ~/.claude/skills (las once a la vez)',
      ],
      sueltaTitulo: 'Copiar las carpetas en tu terminal',
      sueltaNota: 'Así quedan como /seed-start, /seed-closer… para todos tus proyectos. En el Mac, python3 viene con las herramientas de desarrollo de Apple; en Windows, instala Python y usa py en vez de python3.',
      suelta: 'git clone https://github.com/neubauerwilli/seed-skill.git\ncp -r seed-skill/skills/seed-* ~/.claude/skills/',
      ejemplos: [
        { titulo: 'Que Claude Code lo instale', texto: 'https://github.com/neubauerwilli/seed-skill\n\nInstala estas skills y comprueba que /seed-start funciona.' },
      ],
    },
    {
      n: '07', clave: 'en-espanol', nombre: 'Usarlo en español', corto: 'que te responda en español y piense en España',
      titular: 'Cómo usarlo en español (y en España)',
      historia: 'Las instrucciones de las skills están en alemán, pero tú puedes escribirle en español y pedirle que todo lo que entregue (el plan, el deck, los emails) sea en español. Dos cosas a ajustar. Las ayudas públicas que conoce son de Alemania, Austria y Suiza: pídele que busque las de España con su fuente oficial, por ejemplo ENISA, el CDTI o las de tu comunidad autónoma. Y los emails: en España, la LSSI limita los correos comerciales que nadie ha pedido. El Closer ya está pensado para eso (emails de uno en uno, a direcciones que el inversor publica para recibir proyectos), pero si un fondo tiene un formulario para presentar proyectos, usa el formulario. Ante la duda, consúltalo con un profesional.',
      puedes: [
        'Empezar con /seed-start y pedir que todo salga en español',
        'Pedir inversores y redes de angels de España, con la fuente de cada uno',
        'Cambiar las ayudas alemanas por las españolas (ENISA, CDTI, tu comunidad)',
        'Usar el formulario del fondo cuando lo tenga, en vez del email',
      ],
      ejemplos: [
        { titulo: 'Arrancar en español', texto: '/seed-start Respóndeme siempre en español y escribe en español todos los archivos de la carpeta seed/. Busco una ronda pre-seed en España. Mi idea es: [en dos frases qué haces, para quién y qué has conseguido hasta ahora].' },
        { titulo: 'Inversores en España', texto: '/seed-investoren En español: busca business angels, redes de angels y fondos pre-seed y seed que inviertan en [tu sector] en España, en fase de [idea / prototipo / primeros clientes]. De cada uno, su web, por qué encaja, si publica el ticket y cómo se le presenta un proyecto. Nada sin fuente.' },
      ],
    },
    {
      n: '08', clave: 'alternativa', nombre: 'Alternativa en inglés', corto: 'emotixco/claude-skills-founder: 14 skills, más rodado',
      titular: 'Si lo prefieres en inglés y con más recorrido',
      historia: 'Si no te apaña el alemán, claude-skills-founder, de Emotix, es un pack de 14 skills en inglés para fundadores, con más de 700 estrellas y en uso desde marzo de 2026. Para la ronda tienes /competitor-matrix (de 5 a 8 competidores con sus precios y la fecha en que los miró), /fundraise-prep (si estás listo para levantar, cuánto y con qué instrumento, el perfil de inversor por fase, ticket, sector y región, y un plan de 12 semanas) y /pitch-deck (12 diapositivas con su titular y lo que hay que decir). Guarda todo en una carpeta founder/ que las demás skills reutilizan. No trae un Closer para inversores: su skill de emails es de bienvenida a usuarios. Y es honesto con sus resultados: sus propias pruebas dicen que con los modelos grandes la diferencia frente a Claude sin skills es pequeña; donde más ayuda es en guardar y reutilizar tus datos entre sesiones.',
      puedes: [
        'Dentro de Claude Code: /plugin marketplace add emotixco/claude-skills-founder',
        'Y después: /plugin install founder@emotix (quedan como /founder:pitch-deck, /founder:fundraise-prep…)',
        'Precios de la competencia, valoraciones y rondas con enlace, o marcados como estimación si no encuentra fuente',
        'Tus métricas nunca se inventan: lo que falta sale como [hueco] para que lo rellenes',
      ],
      autor: 'Emotix', oficial: false, repo: 'emotixco/claude-skills-founder', github: EMOTIX, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '09', clave: 'ojo', nombre: 'Antes de usarlo', corto: 'lo que no hace y lo que no promete',
      titular: 'Lo que conviene saber',
      historia: 'Las skills redactan y preparan; la ronda sigue siendo tuya. Los emails los envías tú, la llamada la haces tú y la ronda la cierras tú. Nadie te puede garantizar dinero: lo que mejoran es la probabilidad de que la persona adecuada lea tu proyecto bien explicado. La valoración, el reparto, los contratos y los impuestos los revisa un profesional antes de firmar nada. Los datos de inversores salen de fuentes públicas: compruébalos en la web del propio inversor, porque las condiciones cambian. Y como el repo es muy nuevo y de un solo autor, léelo antes de instalarlo: son archivos de texto y tres scripts cortos de Python que no se conectan a nada.',
      puedes: [
        'No es asesoramiento financiero ni legal',
        'Comprueba cada inversor en su propia web antes de escribirle',
        'Tus números, solo los reales: lo que es una estimación, que lo diga',
        'Gratis, pero lo usas con tu cuenta de Claude (consume tu plan o tus tokens)',
      ],
      ejemplos: [],
    },
  ],
}
