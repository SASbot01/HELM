// Hilo de la sección «Skills y repos», tema «estrategia». Lead magnet del reel
// «Así conviertes Claude en una máquina de Google Ads» (comenta GOOGLE).
// Las tres piezas del reel —buscar los anuncios de la competencia, redactar
// anuncios y palabras clave/cuenta— salen de repos abiertos. Comprobado el
// 19/11/2026 leyendo cada repo, sin ejecutarlos:
// - competitor-ad-intelligence (GooseWorks, MIT; publicado en
//   gooseworks-ai/goose-skills y en github/awesome-copilot): busca anuncios en
//   el Centro de Transparencia de Google Ads y en la Biblioteca de Meta, los
//   agrupa por gancho y formato y revisa las landings. Sin claves ni cuentas.
// - nowork-studio/notfair-plugin (MIT, ~4.300★): 45 skills; google-ads-copy
//   (titulares y descripciones RSA con variantes), google-ads-landing,
//   google-ads-audit y google-ads (palabras clave, pujas, presupuestos,
//   negativas). El trabajo con la cuenta en vivo va por su MCP con OAuth (un
//   espacio NotFair); el repo no dice si eso es de pago.
// - cohnen/mcp-google-ads (MIT, ~700★): MCP que lee tu cuenta (rendimiento,
//   consultas GAQL, palabras clave). Necesita un proyecto de Google Cloud con la
//   API de Google Ads y un developer token de Google.
// Google no tiene API pública del Centro de Transparencia: todo esto lo lee
// como una web. No se promete ningún resultado ni se dan cifras de ahorro.

const TRANSPARENCIA = 'https://adstransparency.google.com/'
const GOOSE = 'https://github.com/github/awesome-copilot/blob/main/skills/competitor-ad-intelligence/SKILL.md'
const NOTFAIR = 'https://github.com/nowork-studio/notfair-plugin'
const MCP_ADS = 'https://github.com/cohnen/mcp-google-ads'

export default {
  slug: 'guia-google-ads',
  seccion: 'skills',
  tema: 'estrategia',
  tipo: 'repo',
  titulo: 'Google Ads con Claude: espía los anuncios de tu competencia y reescribe los tuyos',
  gancho: 'Tus Google Ads, escritos desde Claude',
  resumen: 'Cómo montar en Claude las tres herramientas del reel: una que busca los anuncios que tu competencia tiene activos ahora mismo en el Centro de Transparencia de Google Ads, otra que te redacta titulares y descripciones a partir de lo que ya funciona, y la que trabaja tus palabras clave y tu cuenta. Qué hace cada una, cómo instalarlas, los prompts en español y qué no conviene dejarle hacer solo.',
  fecha: '2026-11-19',
  lectura: '8 min',
  nota: 'Skills y repos de código abierto (MIT) de terceros, no oficiales de Google ni de Anthropic. Las skills son gratis, pero las usas con tu cuenta de Claude. Conectar tu cuenta de Google Ads es opcional y pide permisos: Claude propone, y los cambios y el presupuesto los apruebas tú. Nadie te puede garantizar resultados.',
  portada: '/aiparatodo/google-ads.webp',
  skills: [
    {
      n: '01', clave: 'google-ads', nombre: 'Qué es', corto: 'tres herramientas: espiar, redactar y palabras clave',
      titular: 'Claude como tu equipo de Google Ads',
      historia: 'Google publica en su Centro de Transparencia de Anuncios todos los anuncios que tiene activos cada anunciante: los de búsqueda, los de display y los de YouTube, con sus textos y adónde llevan. Casi nadie lo mira. Con una skill, Claude lo lee por ti: le pegas tu web, entiende tu sector, busca a tus competidores y te trae sus anuncios, sus titulares, las palabras por las que pujan y sus landings. Con esa base, otra skill te escribe tus anuncios, y si conectas tu cuenta te dice qué palabras clave cambiar y hacia dónde mover el presupuesto.',
      puedesTitulo: 'Las tres piezas',
      puedes: [
        'Buscador de anuncios: los anuncios activos de tu competencia, agrupados por gancho y formato',
        'Redactor: titulares y descripciones para anuncios de búsqueda, con variantes para probar',
        'Palabras clave y cuenta: qué palabras, qué negativas y dónde está el presupuesto',
        'Todo con prompts en español, abajo',
      ],
      autor: 'Varios (código abierto)', oficial: false, github: TRANSPARENCIA, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '02', clave: 'competencia', nombre: 'Anuncios de la competencia', corto: 'el Centro de Transparencia, leído por Claude',
      titular: 'Los anuncios que tu competencia tiene activos ahora mismo',
      historia: 'La skill competitor-ad-intelligence, de GooseWorks, busca los anuncios de los competidores que le digas en el Centro de Transparencia de Google Ads (y, si quieres, en la Biblioteca de Anuncios de Meta). Los agrupa por el gancho que usan, el formato y la llamada a la acción, abre las landings a las que llevan y te devuelve un informe: qué mensajes repiten, qué ofrecen, qué huecos dejan y cómo contraatacar, con titulares de ejemplo. No necesita claves ni cuentas: solo que Claude pueda buscar y abrir páginas.',
      puedes: [
        'Anuncios de búsqueda, display, YouTube y Shopping de cada competidor',
        'Ganchos, formatos y llamadas a la acción más repetidos',
        'Sus landings: mensaje, prueba social y si enseñan precio',
        'Huecos que dejan y titulares para atacarlos',
      ],
      github: GOOSE, autor: 'GooseWorks', oficial: false, repo: 'gooseworks-ai/goose-skills', licencia: 'MIT',
      ejemplos: [
        { titulo: 'Analiza a tu competencia', texto: 'Usa la skill competitor-ad-intelligence. Mi web es [tu web] y vendo [qué vendes] en [ciudad o país]. Busca mis 5 competidores principales en Google, saca sus anuncios activos del Centro de Transparencia de Google Ads y analiza sus titulares, las palabras por las que parecen pujar y sus landings. Respóndeme en español y termina con los 3 huecos que podría aprovechar yo.' },
      ],
    },
    {
      n: '03', clave: 'redactor', nombre: 'Redactor de anuncios', corto: 'titulares y descripciones a partir de lo que funciona',
      titular: 'Tus anuncios, reescritos con lo que ya funciona',
      historia: 'El plugin NotFair trae la skill google-ads-copy, que escribe titulares y descripciones para anuncios de búsqueda adaptables (RSA) respetando las reglas de Google, con variantes para probar unas contra otras. Si le das el informe de la competencia, parte de él: qué prometen ellos, qué no dice nadie y cómo diferenciarte. El mismo plugin tiene google-ads-landing para revisar tu landing y google-ads-audit para auditar la cuenta.',
      puedes: [
        'Hasta 15 titulares y 4 descripciones por anuncio, dentro de los límites de Google',
        'Variantes para probar unas contra otras',
        'Revisión de la landing a la que lleva el anuncio',
        'Auditoría de la cuenta (google-ads-audit)',
      ],
      sueltaTitulo: 'Instalar el plugin en Claude Code',
      sueltaNota: 'Escríbelo dentro de Claude Code, una línea cada vez.',
      suelta: '/plugin marketplace add nowork-studio/notfair-plugin\n/plugin install notfair@nowork-studio',
      github: NOTFAIR, autor: 'NoWork Studio', oficial: false, repo: 'nowork-studio/notfair-plugin', licencia: 'MIT',
      ejemplos: [
        { titulo: 'Reescribe tus anuncios', texto: 'Con el análisis de la competencia de arriba, usa google-ads-copy y escríbeme un anuncio de búsqueda para [tu servicio] en [ciudad]: 15 titulares y 4 descripciones, en español de España, sin prometer nada que no pueda cumplir. Marca cuáles atacan los huecos que dejaba la competencia.' },
      ],
    },
    {
      n: '04', clave: 'cuenta', nombre: 'Palabras clave y tu cuenta', corto: 'conecta la cuenta y que te diga qué mover',
      titular: 'Conecta tu cuenta y que te diga qué cambiar',
      historia: 'Para que Claude vea tus campañas de verdad (gasto, clics, conversiones, términos de búsqueda) hay que conectarle tu cuenta. Dos caminos. El del plugin NotFair: su skill google-ads trabaja palabras clave, pujas, presupuestos, negativas y campañas a través de su propio conector, que se autoriza con tu cuenta de Google en un espacio de NotFair (mira sus condiciones antes). O el MCP de código abierto mcp-google-ads, que lee tu cuenta desde tu ordenador: rendimiento de campañas y anuncios, palabras clave y consultas a medida. Este último pide un proyecto en Google Cloud con la API de Google Ads activada y un developer token, que Google aprueba en unos días.',
      puedes: [
        'Qué palabras clave gastan sin convertir y cuáles merecen más',
        'Negativas: búsquedas que no quieres pagar',
        'Hacia qué campañas mover el presupuesto',
        'Con el MCP de código abierto, solo lectura: los cambios los haces tú',
      ],
      github: MCP_ADS, autor: 'cohnen', oficial: false, repo: 'cohnen/mcp-google-ads', licencia: 'MIT',
      ejemplos: [
        { titulo: 'Revisa tu cuenta', texto: 'Mira mis campañas de Google Ads de los últimos 30 días. Dime: (1) las 10 palabras clave que más gastan sin convertir, (2) términos de búsqueda que debería añadir como negativos, (3) hacia qué campañas movería el presupuesto y por qué. No cambies nada: propónmelo y yo decido.' },
      ],
    },
    {
      n: '05', clave: 'ojo', nombre: 'Antes de usarlo', corto: 'Claude propone, tú apruebas',
      titular: 'Lo que conviene saber',
      historia: 'Los anuncios del Centro de Transparencia son públicos, pero Google no tiene una API oficial para ellos: las skills los leen como una web y a veces fallan o se quedan cortas, así que contrasta lo importante. Inspirarte en lo que funciona está bien; copiar textos o marcas de otros, no. Si conectas tu cuenta, lo que toque presupuesto o pujas que lo revises tú antes de aplicarlo. Y revisa cada repo antes de instalarlo: son de terceros.',
      puedes: [
        'Claude propone; los cambios y el presupuesto los apruebas tú',
        'Inspírate en la competencia, no copies sus textos ni sus marcas',
        'Comprueba en el Centro de Transparencia lo que te traiga',
        'Gratis, pero consume tu plan de Claude',
      ],
      ejemplos: [],
    },
  ],
}
