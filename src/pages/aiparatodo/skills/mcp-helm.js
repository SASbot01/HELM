// Tema MCP de la sección Skills: conectar Claude a HELM.
//
// HELM expone su Agent OS como conector MCP (api/mcp/<token>): desde claude.ai
// Claude lee el corpus de referencias, las identidades y la memoria, y escribe
// guiones con ese material. Es el conector real del producto; el token lo da
// HELM a cada cuenta. Aquí se cuenta qué hace, no se reparte ningún token.
export default {
  slug: 'mcp-helm',
  seccion: 'skills',
  tema: 'mcp',
  tipo: 'mcp',
  titulo: 'Conecta Claude a HELM',
  gancho: 'Tu Agent OS, dentro de Claude',
  resumen: 'El conector MCP de HELM mete el cerebro de tu contenido dentro de Claude: tus creadores de referencia, tus reels transcritos y etiquetados, y tu memoria. Claude piensa; HELM le da el material y le deja programar guiones.',
  fecha: '2026-10-07',
  lectura: '6 min',
  nota: 'Es el conector del propio HELM. El enlace con el token lo da HELM a cada cuenta; funciona desde claude.ai (web y escritorio).',
  skills: [
    {
      n: '01', clave: 'identidades', nombre: 'Identidades y corpus', titular: 'Todo tu banco de referencias, a mano de Claude',
      corto: 'tus creadores de referencia y sus reels transcritos y etiquetados',
      historia: 'HELM guarda a los creadores que estudias, con cada reel pasado a texto y etiquetado por gancho, estructura y CTA. Con el conector, Claude lee ese corpus entero y escribe «con la voz de» quien tú le digas, no desde cero.',
      puedes: [
        'Claude lista tus identidades de referencia y cuántos reels tiene cada una',
        'Lee el guion y las etiquetas de cualquier reel del corpus',
        'Escribe un guion nuevo imitando la estructura de los que funcionan',
        'Trabaja con tus datos, no con ejemplos genéricos de internet',
      ],
      ejemplos: [
        { titulo: 'Guion con una referencia', texto: 'Mira el corpus de mi identidad de marca personal y escríbeme un guion de reel sobre «cómo monté mi CRM con IA», con la misma estructura de gancho y remate que usan sus reels que más retienen.' },
        { titulo: 'Qué funciona', texto: 'Analiza los reels etiquetados como gancho de «dato» en mi corpus y dime qué tienen en común los tres con más retención.' },
      ],
    },
    {
      n: '02', clave: 'programar', nombre: 'Programar y recordar', titular: 'De la idea al calendario, sin salir del chat',
      corto: 'guarda guiones en el calendario y la memoria del Agent OS',
      historia: 'Lo que Claude escribe no se queda en el chat: lo guarda en tu calendario de contenido de HELM con su tipo, y lo que merece la pena conservar va a la memoria. La próxima vez, Claude arranca sabiendo lo que ya decidisteis.',
      puedes: [
        'Programa el guion en el calendario de contenido con su tipo',
        'Consulta qué hay planificado y qué falta por grabar',
        'Guarda en la memoria las conclusiones que quieres conservar',
        'Ordena el vídeo grabado en su carpeta de Drive',
      ],
      ejemplos: [
        { titulo: 'Agenda la semana', texto: 'Prepárame tres guiones de reel para esta semana con mis referencias, prográmalos en el calendario y dime qué día conviene publicar cada uno.' },
        { titulo: 'Memoria', texto: 'Guarda en la memoria que mi público responde mejor a los ganchos de «error común» que a los de «pregunta», para que lo tengas en cuenta a partir de ahora.' },
      ],
    },
  ],
  instalarTodo: {
    explica: 'Un conector MCP es una URL que le das a Claude una vez. En claude.ai, ve a Personalizar → Conectores → + Añadir conector personalizado y pega la URL de tu HELM:',
    comando: 'https://helm.s4sf.net/api/mcp/<tu-token-de-HELM>',
  },
}
