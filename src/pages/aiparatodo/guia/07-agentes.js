// Capítulo 07 de la «Guía completa de Claude» — AI para todo.
// Los 7 tipos de agentes con Claude.
//
// Comprobado el 2026-10-14 contra fuentes oficiales:
//   - Patrones y cifras: anthropic.com/engineering/building-effective-agents
//     (19/12/2024: workflow frente a agente, LLM aumentado, encadenamiento,
//     enrutamiento, paralelización, orquestador-trabajadores, checkpoints
//     humanos) y anthropic.com/engineering/multi-agent-research-system
//     (13/06/2025: es el sistema de la función Research; 4× tokens un agente,
//     15× varios agentes; 90,2 % sobre un solo Opus 4; hasta 90 % menos tiempo;
//     regla de 1 agente / 2-4 / más de 10 subagentes).
//   - Claude Code (code.claude.com/docs/en/): mcp, skills, sub-agents, hooks,
//     permission-modes, permissions (orden deny > ask > allow, reglas mcp__),
//     workflows (ultracode, /workflows, límites, /deep-research, Large workflow).
//   - Agent SDK (code.claude.com/docs/en/agent-sdk/): quickstart, subagents,
//     skills, user-input (canUseTool; ejemplo TS adaptado con textos en español).
//   - App: claude.com/docs/connectors/getting-started (Tool permissions: Always
//     allow, Needs approval, Blocked; Allow once), claude.com/connectors
//     (Gmail, Notion y HubSpot en el catálogo), support.claude.com art. 12512180
//     (subir skills, planes), support.claude.com art. 10166901 (Gmail: aprobación
//     por defecto antes de enviar, responder o reenviar). Notion MCP:
//     developers.notion.com. HubSpot MCP: developers.hubspot.com (remote HubSpot
//     MCP server; la redirect URL la pone quien crea el conector) y
//     code.claude.com/docs/en/mcp (--callback-port usa http://localhost:PUERTO/callback).
// Revisado por segunda vez el 2026-10-14 contra las mismas fuentes.
// No se afirma, por no estar confirmado: qué plan pide cada conector del
// directorio; un endpoint MCP oficial de Gmail para Claude Code (se usa el
// conector de claude.ai); que el OAuth de HubSpot funcione con --client-id,
// --client-secret y --callback-port en Claude Code (se avisa en el bloque);
// el detalle de los agent teams. La cadena con el Agent SDK es un patrón propio
// hecho a partir de los ejemplos de la documentación, no código literal. Las
// skills no aparecen como patrón en los dos artículos de Anthropic: son una
// pieza del producto Claude (Agent Skills) y así se presentan.

export default {
  slug: 'agentes',
  n: '07',
  titulo: 'Los 7 tipos de agentes con Claude',
  gancho: 'De Claude que contesta a Claude que trabaja por ti',
  resumen: 'Los siete tipos de agentes que puedes montar hoy con Claude, del más simple al más complejo: con herramientas, con skills, en cadena, en paralelo, enrutador, humano en el bucle y orquestador. Para cada uno, cuándo te conviene, cómo se monta en la app y en Claude Code, los archivos reales, un prompt listo para copiar, los errores típicos y lo que cuesta.',
  lectura: '40 min',
  fecha: '2026-10-14',
  bloques: [
    { tipo: 'p', texto: 'La palabra «agente» se ha gastado de tanto usarla. Hoy se vende como agente cualquier cosa con IA: un chatbot, una automatización de tres pasos, un asistente que te resume los correos. Y así es imposible saber qué montar en tu negocio.' },
    { tipo: 'p', texto: 'En este capítulo ponemos orden. Vas a ver los siete tipos de agentes que puedes construir hoy con Claude, del más sencillo al más complejo, con ejemplos de negocios pequeños como el tuyo. Para cada uno: qué es, cuándo te conviene y cuándo no, cómo se monta en la app de Claude y en Claude Code, la configuración real (archivos y comandos), un prompt para copiar, los errores típicos y lo que cuesta.' },
    { tipo: 'p', texto: 'Es el capítulo más largo de la guía. No hace falta leerlo de una sentada: lee la introducción y la tabla de los siete, y luego ve directo al tipo que necesites. Al final tienes un caso completo que los combina y una lista de comprobación.' },
    { tipo: 'aviso', variante: 'dato', titulo: 'Qué es un agente, en una frase', texto: 'Un agente es Claude usando herramientas en bucle: decide qué hacer, lo hace, mira el resultado y decide el siguiente paso, hasta terminar la tarea. Así lo define Anthropic, sin adornos.' },

    // ── Introducción ─────────────────────────────────────────────────────────
    { tipo: 'h2', texto: 'Agente o flujo de trabajo: la distinción que te ahorra dinero' },
    { tipo: 'p', texto: 'Anthropic, en su guía «Building effective agents», mete todo esto bajo el paraguas de «sistemas agénticos», pero separa dos cosas que conviene no confundir.' },
    { tipo: 'lista', items: [
      '**Flujo de trabajo (workflow)**: los pasos están decididos de antemano, en código o en instrucciones. Claude ejecuta cada paso, pero el camino lo has trazado tú. Ejemplo: primero resume el correo, luego clasifícalo, luego redacta la respuesta.',
      '**Agente**: Claude decide él mismo qué pasos dar y qué herramientas usar, según lo que va encontrando. Tú le das el objetivo, no el camino. Ejemplo: «deja lista la campaña de otoño», y él decide qué necesita.',
    ] },
    { tipo: 'p', texto: 'Piensa en una receta frente a un cocinero. Con la receta (flujo de trabajo) sabes exactamente qué va a pasar y cuánto va a costar. Al cocinero (agente) le dices «haz una cena para seis» y él decide el menú: más flexible, pero más difícil de prever.' },
    { tipo: 'tabla',
      cabecera: ['', 'Flujo de trabajo', 'Agente'],
      filas: [
        ['Quién decide los pasos', 'Tú, de antemano', 'Claude, sobre la marcha'],
        ['Previsible', 'Mucho: el mismo camino cada vez', 'Menos: puede tomar caminos distintos'],
        ['Coste', 'Controlado', 'Más alto y más variable'],
        ['Ideal para', 'Tareas bien definidas que se repiten', 'Problemas abiertos donde no sabes cuántos pasos harán falta'],
        ['Ejemplo', 'La newsletter semanal con el mismo formato', 'Investigar a la competencia y proponer una estrategia'],
      ],
    },
    { tipo: 'aviso', variante: 'truco', titulo: 'La regla de oro de Anthropic', texto: 'Empieza por lo más simple que funcione y añade complejidad solo cuando haga falta. Muchas veces basta una sola petición bien hecha, con buen contexto y un par de ejemplos. Y a veces, dice Anthropic, lo correcto es no construir ningún agente.' },
    { tipo: 'p', texto: 'Hay un motivo económico. Los sistemas agénticos cambian velocidad y dinero por mejores resultados: según Anthropic, un agente gasta unas **4 veces más tokens** que una conversación normal, y un sistema con varios agentes, unas **15 veces más**. Si la tarea no vale ese extra, no lo pagues.' },
    { tipo: 'h3', texto: 'El ladrillo de todo: Claude con herramientas, búsqueda y memoria' },
    { tipo: 'p', texto: 'Anthropic llama «LLM aumentado» a la pieza base: el modelo más tres cosas, que son buscar información, usar herramientas y recordar. Los siete tipos de este capítulo son formas distintas de combinar esa pieza. Por eso empezamos por las herramientas: sin ellas, Claude solo puede hablar.' },

    { tipo: 'h2', texto: 'Los 7 tipos de un vistazo' },
    { tipo: 'p', texto: 'Esta es la tabla para tener a mano. Están ordenados de menos a más complejidad, que es también, más o menos, de menos a más coste.' },
    { tipo: 'tabla',
      cabecera: ['#', 'Tipo', 'Qué hace', 'Ejemplo', 'Dónde se monta', 'Coste'],
      filas: [
        ['1', 'Con herramientas (MCP)', 'Claude lee y actúa en tus apps', 'Gmail + Notion + HubSpot', 'App y Claude Code', 'Bajo'],
        ['2', 'Con skills', 'Repite tu proceso siempre igual', 'La newsletter de cada semana', 'App y Claude Code', 'Muy bajo'],
        ['3', 'Secuencial (en cadena)', 'Pasos en orden; cada uno usa lo del anterior', 'Diseña → Construye → Promociona', 'Claude Code y Agent SDK (en la app, a mano)', 'Medio'],
        ['4', 'En paralelo', 'Varios agentes a la vez; Claude junta los resultados', 'Cinco agentes analizando a cinco competidores', 'Claude Code y Agent SDK', 'Alto'],
        ['5', 'Enrutador', 'Clasifica lo que entra y lo deriva', 'La recepcionista: devolución o lead', 'App (con skills) y Claude Code', 'Bajo'],
        ['6', 'Humano en el bucle', 'Para y te pide Aprobar o Rechazar', 'Antes de reembolsar o escribir a un cliente', 'App y Claude Code', 'Casi nulo en tokens'],
        ['7', 'Orquestador', 'Un jefe reparte el trabajo entre especialistas y une el resultado', 'Director de marketing con Anuncios, Redes y Branding', 'Claude Code y Agent SDK', 'El más alto'],
      ],
    },
    { tipo: 'p', texto: 'Si conoces la guía de Anthropic: los tipos 3, 4, 5 y 7 son sus patrones de encadenamiento, paralelización, enrutamiento y orquestador-trabajadores. El 1 es su «LLM aumentado». El 6 no es un patrón aparte, sino algo que describe para cualquier agente: pararse en puntos de control a pedir la opinión de una persona. Y el 2, las skills, no aparece en esos artículos: es una pieza del producto Claude que sirve para que cualquiera de los otros trabaje a tu manera.' },
    { tipo: 'h3', texto: 'Las tres herramientas con las que se montan' },
    { tipo: 'lista', items: [
      '**La app de Claude** (claude.ai, escritorio y móvil): conectores (capítulo 04) y skills (capítulo 03), sin instalar nada. Aquí montas los tipos 1, 2, 5 y 6, y usas ya hecho uno que combina el 4 y el 7: la función Research.',
      '**Claude Code** (capítulo 06): Claude trabajando en tu ordenador. Aquí defines tus propios subagentes en archivos de texto y montas los siete tipos. Necesita un plan Pro, Max, Team o Enterprise, o una cuenta de Claude Console.',
      '**Claude Agent SDK**: el motor de Claude Code convertido en librería (en Python y en TypeScript), para meter un agente dentro de tu propio programa o servidor. Lo alojas tú y se paga por uso con una clave de API. Es para cuando tienes a alguien técnico o quieres un agente que corra sin ti delante.',
    ] },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Qué no es el Agent SDK', texto: 'No lo confundas con los Managed Agents (alojados por Anthropic) ni con el Tool Runner de la API, que no trae herramientas integradas. El Agent SDK trae las mismas herramientas que Claude Code (leer, escribir, ejecutar comandos) y corre donde tú lo pongas. Y un aviso de su documentación: salvo aprobación previa, Anthropic no permite a terceros ofrecer el inicio de sesión de claude.ai ni los límites de una suscripción en productos hechos con el SDK. Se usa con clave de API.' },

    { tipo: 'h3', texto: 'Antes de empezar en Claude Code: subagentes en dos minutos' },
    { tipo: 'p', texto: 'Casi todos los tipos se montan en Claude Code con la misma pieza: el **subagente**. Lo viste en el capítulo 06: un Claude especializado, con sus propias instrucciones, herramientas y modelo, al que el Claude principal le pasa un trozo del trabajo. Empieza con el contexto limpio y solo devuelve su resumen, así que no te llena la conversación principal.' },
    { tipo: 'p', texto: 'Un subagente es un archivo Markdown en `.claude/agents/` (en el proyecto) o en `~/.claude/agents/` (para todos tus proyectos). Arriba lleva una cabecera entre `---` con `name` y `description`, que son obligatorios, y debajo sus instrucciones.' },
    { tipo: 'codigo', titulo: 'Formato de un subagente (.claude/agents/revisor.md)', texto: `---
name: revisor
description: Revisa textos de venta antes de publicarlos. Úsalo después de escribir cualquier texto para clientes.
tools: Read, Grep, Glob
model: sonnet
---

Eres el corrector de la casa. Compruebas el tono, las promesas
exageradas y las faltas. Para cada problema: cita la frase,
explica qué falla y propón otra versión.`, nota: 'Obligatorios: name (sin dos puntos) y description. Opcionales útiles: tools (qué herramientas puede usar), model (haiku, sonnet, opus, fable, un ID completo o inherit), permissionMode, maxTurns, skills, mcpServers, hooks y memory. Los campos que no conoce, los ignora.' },
    { tipo: 'lista', items: [
      'Si creas la carpeta `agents/` por primera vez, **reinicia la sesión** para que la cargue. Los cambios en archivos que ya existían se recargan solos en unos segundos.',
      'Claude decide a qué subagente delegar leyendo su `description`. Para pedir uno, nómbralo («usa el subagente revisor para…») y Claude suele delegar. Para asegurarte de que lo usa, escribe `@` y elígelo de la lista: `@"revisor (agent)"`.',
      'Para que un subagente sea el agente principal de toda la sesión: `claude --agent revisor`.',
      'Lo más cómodo es pedirle a Claude que te lo escriba («créame un subagente que…») y revisar el archivo. En las versiones recientes, `/agents` te recuerda justo eso.',
    ] },

    // ── 1. Con herramientas (MCP) ────────────────────────────────────────────
    { tipo: 'h2', texto: '1. Con herramientas (MCP): Claude dentro de tu Gmail, tu Notion y tu CRM' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Es Claude con llaves: se conecta a tus apps por MCP y, además de hablar, lee tus correos, busca en tu Notion o actualiza una ficha de tu CRM.' },
    { tipo: 'p', texto: 'Es el tipo más básico y la base de todos los demás. Sin herramientas, Claude solo sabe lo que tú le pegas en el chat. Con herramientas, va él a buscarlo y, si le dejas, actúa: crea un borrador, apunta un lead, actualiza una página.' },
    { tipo: 'p', texto: 'Por debajo funciona con **MCP** (Model Context Protocol), el estándar abierto que viste en el capítulo 05: cada app publica un «servidor MCP» con sus herramientas (buscar correos, crear una página, actualizar un contacto) y Claude las usa cuando las necesita. Lo que lo convierte en agente es el bucle: Claude decide qué herramienta usar, lee lo que le devuelve y decide el siguiente paso.' },
    { tipo: 'p', texto: 'Un ejemplo. Una nutricionista con un curso online recibe cada día correos de alumnas. Con Gmail y Notion conectados, le pide a Claude: «lee los correos de alumnas de hoy, mira en mi Notion en qué módulo va cada una y prepárame un borrador de respuesta para cada correo». Claude busca, cruza los datos y redacta. Ella revisa y envía.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Úsalo** cuando la tarea necesita datos que viven en otra app (tu correo, tu CRM, tu Drive) o una acción en ella (crear un borrador, apuntar un contacto).',
      '**Úsalo** como base de cualquier otro tipo: un enrutador o un orquestador sin herramientas no puede tocar nada real.',
      '**No lo uses** si la tarea se resuelve con un solo prompt y un texto que ya tienes: las herramientas solo añaden coste y sitios donde equivocarse.',
      '**No conectes** apps «por si acaso». Cada conexión es una puerta y una lista de permisos que vigilar.',
    ] },
    { tipo: 'h3', texto: 'Montarlo en la app de Claude' },
    { tipo: 'p', texto: 'En la app no hay que escribir nada técnico: los conectores son MCP ya empaquetados. Lo viste paso a paso en el capítulo 04; este es el resumen para estas tres apps.' },
    { tipo: 'pasos', items: [
      { titulo: 'Abre los conectores', texto: 'En claude.ai o en la app de escritorio, ve a **Customize > Connectors** (también en claude.ai/customize/connectors).' },
      { titulo: 'Conecta Gmail', texto: 'Gmail es uno de los conectores de Google. Pulsa conectar, inicia sesión con tu cuenta de Google y revisa los permisos antes de aceptar. Por defecto, Claude te pide aprobación antes de enviar, responder o reenviar un correo.' },
      { titulo: 'Añade Notion y HubSpot desde el directorio', texto: 'Pulsa **Discover**, busca la app, pulsa **Connect to Claude** e inicia sesión en ella. Las dos están en el catálogo oficial de conectores, en claude.com/connectors. En Team y Enterprise, antes tiene que añadirlas un Owner para la organización.' },
      { titulo: 'Ajusta los permisos de cada herramienta', texto: 'Elige el conector en **Your connectors** y, en **Tool permissions**, marca para cada herramienta (o grupo de herramientas) **Always allow**, **Needs approval** o **Blocked**. Lo que envía, borra o cambia datos de clientes, en Needs approval.' },
      { titulo: 'Pruébalo', texto: 'Abre un chat, comprueba en **+ > Connectors** que el conector está activado en esa conversación y pide algo que necesite la app: «busca en mi Gmail…». Cuando Claude te pida permiso para usar una herramienta, eliges **Allow once** o **Always allow**.' },
    ] },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Los planes, compruébalos en tu cuenta', texto: 'Los conectores de Google (Drive, Gmail y Calendar) están en todos los planes, como viste en el capítulo 04. Para Notion, HubSpot y el resto del directorio, la página del catálogo no dice qué plan hace falta en cada caso, así que no te lo afirmo: compruébalo en tus ajustes antes de montar nada alrededor.' },
    { tipo: 'h3', texto: 'Montarlo en Claude Code' },
    { tipo: 'p', texto: 'En Claude Code tienes dos caminos, y conviene saber cuál usar con cada app.' },
    { tipo: 'p', texto: '**Camino 1: heredar los conectores de claude.ai.** Si entras en Claude Code con tu cuenta de claude.ai (la suscripción, no una clave de API), los conectores que ya tienes en la app te aparecen solos. Escribe `/mcp` para verlos. Es lo que toca con **Gmail**: la documentación de Claude Code dice que Gmail, Microsoft 365 y Google Calendar no admiten el inicio de sesión local desde Claude Code y que se conectan en claude.ai. Ojo: estos conectores no cargan si entras con clave de API, con `apiKeyHelper` o con un proveedor externo como Amazon Bedrock o Google Cloud (Agent Platform, antes Vertex AI).' },
    { tipo: 'p', texto: '**Camino 2: añadir un servidor MCP con `claude mcp add`.** Para las apps que publican su propio servidor, como Notion. Este es el comando oficial de Notion, que se pega en la terminal (no dentro de Claude Code):' },
    { tipo: 'codigo', titulo: 'Conectar Notion a Claude Code', texto: 'claude mcp add --transport http notion https://mcp.notion.com/mcp', nota: 'Después, dentro de Claude Code, escribe /mcp, elige notion y termina el inicio de sesión en el navegador (OAuth). Notion también ofrece SSE en https://mcp.notion.com/sse, pero recomienda la versión http.' },
    { tipo: 'p', texto: 'La forma general del comando sirve para cualquier servidor:' },
    { tipo: 'codigo', titulo: 'Sintaxis de claude mcp add', texto: `# Servidor remoto (lo más habitual)
claude mcp add --transport http <nombre> <url>

# Servidor remoto con clave en la cabecera
claude mcp add --transport http <nombre> <url> --header "Authorization: Bearer TU_CLAVE"

# Servidor local que corre en tu ordenador
claude mcp add --transport stdio --env CLAVE=valor <nombre> -- <comando> [argumentos]`, nota: 'El transporte puede ser http (recomendado), sse (en desuso) o stdio. Con --scope (o -s) eliges dónde se guarda: mira la tabla de abajo.' },
    { tipo: 'tabla',
      cabecera: ['Scope (--scope)', 'Dónde se guarda', 'Quién lo ve'],
      filas: [
        ['`local` (por defecto)', '`~/.claude.json`', 'Solo tú, en este proyecto'],
        ['`project`', '`.mcp.json` en la raíz del proyecto', 'Todo el que tenga el proyecto (se comparte por git). Claude Code pide aprobarlo antes de usarlo'],
        ['`user`', '`~/.claude.json`', 'Solo tú, en todos tus proyectos'],
      ],
    },
    { tipo: 'p', texto: 'Si el mismo servidor está en varios sitios, manda el más cercano: local, luego project, luego user, luego los de plugins y, al final, los conectores de claude.ai. Para que tu equipo tenga los mismos servidores, usa `.mcp.json`. Admite variables de entorno, así no guardas claves dentro del archivo:' },
    { tipo: 'codigo', titulo: '.mcp.json compartido (raíz del proyecto)', texto: `{
  "mcpServers": {
    "notion": { "type": "http", "url": "https://mcp.notion.com/mcp" },
    "api-interna": {
      "type": "http",
      "url": "\${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": { "Authorization": "Bearer \${API_KEY}" }
    }
  }
}`, nota: 'La expresión con API_KEY se rellena con la variable de entorno del mismo nombre, y la forma VAR:-valor usa «valor» si la variable no existe. «api-interna» es solo un ejemplo: cámbialo por tu servidor o bórralo. Si quieres que Claude Code vuelva a pedirte la aprobación de estos servidores, usa claude mcp reset-project-choices.' },
    { tipo: 'codigo', titulo: 'Gestionar tus servidores', texto: `claude mcp list           # todos los que tienes
claude mcp get notion     # el detalle de uno
claude mcp remove notion  # quitarlo`, nota: 'Dentro de una sesión, /mcp te enseña el estado de cada servidor y te deja iniciar sesión.' },
    { tipo: 'h3', texto: 'El caso de HubSpot' },
    { tipo: 'p', texto: 'HubSpot tiene servidor MCP oficial en `https://mcp.hubspot.com`, con lectura y escritura de contactos, empresas, negocios (deals), tickets, actividades y campañas; la lectura de lo de ingresos (carritos, facturas, pedidos, productos, presupuestos y suscripciones) está en beta. Pero no basta con pegar la URL: su documentación pide crear antes un **MCP connector** en la parte de desarrollo de HubSpot (Development > MCP Connectors). Al crearlo indicas una URL de retorno (redirect URL) y HubSpot te da un client ID y un client secret; después, cada usuario autoriza ese conector con su cuenta. Esa página no trae pasos para Claude Code.' },
    { tipo: 'p', texto: 'Lo práctico en un negocio pequeño: conecta HubSpot desde el directorio de claude.ai y úsalo en Claude Code heredándolo (camino 1). Si aun así quieres usar tus propias credenciales, Claude Code tiene estas opciones:' },
    { tipo: 'codigo', titulo: 'HubSpot con credenciales propias (sin probar de punta a punta)', texto: 'claude mcp add --transport http --client-id TU_CLIENT_ID --client-secret --callback-port 8080 hubspot https://mcp.hubspot.com', nota: 'Con --callback-port 8080, Claude Code usa la URL de retorno http://localhost:8080/callback: es la que tienes que poner al crear el conector en HubSpot. --client-secret no lleva el secreto detrás: Claude Code te lo pide oculto. No lo he probado de punta a punta: hazlo primero con una cuenta de pruebas y, si falla, usa el conector de claude.ai.' },
    { tipo: 'h3', texto: 'Prompt para copiar' },
    { tipo: 'prompt', titulo: 'Recepción de correo con el contexto de tu CRM', texto: 'Busca en mi Gmail los correos de las últimas 24 horas de alumnas o posibles clientas. Ignora newsletters y notificaciones. Para cada correo:\n1. Busca a esa persona en mi [Notion / HubSpot] y dime qué sabemos de ella: si es alumna, en qué módulo va, si ya habló conmigo.\n2. Prepárame un BORRADOR de respuesta en mi tono [cercano / profesional], de no más de 120 palabras.\nNo envíes nada ni cambies ninguna ficha. Al final, dame una tabla: quién escribe, qué quiere, qué sabemos de ella y si el borrador está listo o necesita algo mío.' },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**La herramienta equivocada**: Anthropic lo resume con un ejemplo: un agente que busca en la web algo que solo existe en Slack está condenado. Dile dónde buscar: «en mi Notion», «en Gmail».',
      '**Demasiados servidores**: cada uno trae sus herramientas, y no todas son igual de buenas. Con veinte conectados, Claude duda más y acierta menos. Conecta lo que vayas a usar esta semana.',
      '**Descripciones malas**: en los servidores que montes tú, la descripción de cada herramienta es lo que Claude lee para decidir. Anthropic avisa de que una descripción mala puede mandar al agente por caminos completamente equivocados.',
      '**Always allow en lo que no se deshace**: enviar, borrar o cambiar datos de clientes, siempre con aprobación (lo ves en el tipo 6).',
      '**Servidores de origen dudoso**: un servidor, o un simple correo que Claude lee, puede colarle instrucciones (inyección). Solo servidores de confianza, y si Claude quiere hacer algo que no pediste, di que no.',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'En la app, los conectores de Google entran en todos los planes, y en el gratuito puedes tener un conector personalizado (capítulo 04). En Claude Code necesitas plan de pago o cuenta de Console. En tokens es el tipo más barato si la tarea son un par de llamadas a herramientas, pero cada llamada suma: lo que devuelve la herramienta (un correo, una ficha) entra en la conversación y se paga como texto. Por eso conviene pedir búsquedas acotadas («los de las últimas 24 horas», «solo de clientas»).' },

    // ── 2. Con skills ────────────────────────────────────────────────────────
    { tipo: 'h2', texto: '2. Con skills: le enseñas tu proceso una vez y lo repite siempre igual' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Una skill es tu manual de procedimiento metido en una carpeta: le explicas a Claude una vez cómo haces algo (tu newsletter, tus presupuestos) y lo repite siempre igual, sin que se lo recuerdes.' },
    { tipo: 'p', texto: 'El ejemplo de siempre: la newsletter. Cada semana haces lo mismo: repasas lo que publicaste, eliges tres temas, escribes un asunto que invite a abrir, tres bloques cortos con enlace y un cierre con llamada a la acción. Si se lo explicas a Claude cada lunes, pierdes diez minutos y cada semana sale un poco distinta.' },
    { tipo: 'p', texto: 'Con una skill lo explicas una vez, en un archivo `SKILL.md`. A partir de ahí, cuando pidas «la newsletter de esta semana», Claude carga tu procedimiento y lo sigue. Lo viste a fondo en el capítulo 03; aquí lo enfocamos como agente: una skill convierte a Claude en un especialista que hace **tu** proceso.' },
    { tipo: 'p', texto: 'Las skills se cargan por capas. Al arrancar, Claude solo ve el nombre y la `description` de cada una, y lee la skill entera solo cuando tu petición encaja con esa descripción. Por eso puedes tener muchas instaladas sin que estorben, y por eso la `description` es el interruptor.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'Skills y subagentes se combinan', texto: 'Una skill es un **cómo**; un subagente es un **quién**. Puedes darle sus skills a un subagente con el campo `skills` de su cabecera y tendrás un especialista que, además, trabaja a tu manera. En el caso final del capítulo lo ves en marcha.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Úsalo** cuando te repites: el mismo formato, el mismo tono, los mismos pasos cada vez (newsletter, guion de reel, presupuesto, informe para un cliente).',
      '**Úsalo** para que los otros tipos trabajen a tu manera: el enrutador deriva a una skill de respuestas con tu tono; el orquestador reparte a especialistas con su skill.',
      '**No lo uses** para el contexto de tu negocio (quién eres, tus precios, tu cliente ideal): eso va en un Proyecto (capítulo 02) o en CLAUDE.md (capítulo 06).',
      '**No lo uses** para conectar apps: una skill no conecta nada. Para leer tus datos hace falta el tipo 1.',
    ] },
    { tipo: 'h3', texto: 'El archivo: SKILL.md' },
    { tipo: 'p', texto: 'Una skill es una carpeta con el nombre de la skill y, dentro, un `SKILL.md`. Arriba va la cabecera (frontmatter) entre `---`; abajo, tus instrucciones. Este es un ejemplo completo para la newsletter de una nutricionista:' },
    { tipo: 'codigo', titulo: 'newsletter-semanal/SKILL.md', texto: `---
name: newsletter-semanal
description: Redacta la newsletter semanal de Come Mejor con el formato de la casa. Úsala cuando pida la newsletter, el correo de los domingos o un resumen semanal para mi lista.
---

# Newsletter semanal

## Antes de escribir
1. Lee las notas de la semana que te pase (o los posts que te indique).
2. Elige 3 temas: uno práctico (una receta o un truco), uno de mentalidad
   y uno de novedades del curso.
3. Si te falta material para alguno, pregúntame antes de inventar.

## Formato
- Asunto: máximo 45 caracteres, con curiosidad y sin mayúsculas.
- Saludo: «Hola, [nombre]:» y una frase personal sobre la semana.
- Tres bloques de 60 a 80 palabras, cada uno con subtítulo y enlace.
- Cierre: una llamada a la acción (la consulta 1 a 1 o el curso)
  y la firma «Marta».

## Tono
- De tú, cercano, sin tecnicismos ni promesas de salud.
- Nunca «milagro», «detox» ni «quema grasa».

## Entrega
Devuélveme 3 asuntos alternativos y el cuerpo listo para pegar.`, nota: 'La description dice qué hace y cuándo usarla, con las palabras que Marta usaría al pedirla. Recomendación oficial: que el SKILL.md no pase de 500 líneas; el material largo, en archivos aparte dentro de la misma carpeta.' },
    { tipo: 'p', texto: 'Todos los campos de la cabecera son opcionales, pero pon siempre `name` y `description`. Si no pones `name`, se usa el nombre de la carpeta. La `description`, junto con el campo `when_to_use` si lo usas, se corta a 1.536 caracteres en el listado de skills, así que lo importante va al principio.' },
    { tipo: 'h3', texto: 'Montarla en la app de Claude' },
    { tipo: 'pasos', items: [
      { titulo: 'Activa la ejecución de código', texto: 'En **Settings > Capabilities** (Free, Pro y Max). Sin ella, las skills no funcionan en la app. En Team y Enterprise lo activa el Owner en Organization settings > Plugins & skills.' },
      { titulo: 'Comprime la carpeta en un zip', texto: 'La carpeta tiene que llamarse igual que la skill (aquí, `newsletter-semanal`) y el zip tiene que contener el `SKILL.md`.' },
      { titulo: 'Súbela', texto: 'Ve a **Customize > Skills**, pulsa **+**, después **+ Create skill** y elige **Upload a skill**. Selecciona tu zip.' },
      { titulo: 'Actívala y pruébala', texto: 'Cuando aparezca en la lista, actívala y pide en un chat nuevo «la newsletter de esta semana» con tus notas. Si no salta, el problema casi siempre está en la description.' },
    ] },
    { tipo: 'codigo', titulo: 'Crear el zip desde la terminal (Mac o Linux)', texto: `cd ruta/a/tus/skills
zip -r newsletter-semanal.zip newsletter-semanal`, nota: 'También vale el «Comprimir» del Finder o del Explorador de Windows sobre la carpeta.' },
    { tipo: 'aviso', variante: 'ojo', titulo: 'La app solo acepta seis campos en la cabecera', texto: 'Al subir una skill a claude.ai solo se admiten `name`, `description`, `license`, `compatibility`, `metadata` y `allowed-tools`. Cualquier otro (por ejemplo `when_to_use`, `disable-model-invocation` o `context`) da el error «Unexpected key(s) in SKILL.md frontmatter». Esos campos son de Claude Code: si quieres la misma skill en los dos sitios, deja en la cabecera solo name y description.' },
    { tipo: 'p', texto: 'Las skills de la app están en los planes Free, Pro, Max, Team y Enterprise, y son de cada usuario. En Team y Enterprise puedes compartirlas con tus compañeros (en solo lectura) o el owner puede asignarlas a toda la organización.' },
    { tipo: 'h3', texto: 'Montarla en Claude Code' },
    { tipo: 'p', texto: 'En Claude Code una skill es una carpeta en tu disco. Nada de zips.' },
    { tipo: 'codigo', titulo: 'Crear la skill personal', texto: `mkdir -p ~/.claude/skills/newsletter-semanal
# y dentro, el archivo SKILL.md de arriba`, nota: 'Para que la tenga todo tu equipo, créala dentro del proyecto, en .claude/skills/newsletter-semanal/, y súbela a git.' },
    { tipo: 'tabla',
      cabecera: ['Dónde', 'Ruta', 'Para qué'],
      filas: [
        ['Personal', '`~/.claude/skills/<nombre>/SKILL.md`', 'Todos tus proyectos'],
        ['Proyecto', '`.claude/skills/<nombre>/SKILL.md`', 'Solo ese proyecto; se comparte con tu equipo por git'],
        ['Plugin', '`<plugin>/skills/<nombre>/SKILL.md`', 'Se invoca como `/<plugin>:<skill>`'],
        ['Empresa', 'La carpeta de managed settings', 'Toda la organización'],
      ],
    },
    { tipo: 'p', texto: 'Si dos skills se llaman igual, gana la de empresa, luego la personal y luego la del proyecto. Se activan solas cuando tu petición encaja con la description, o a mano escribiendo `/newsletter-semanal`. Los antiguos comandos de `.claude/commands/*.md` siguen funcionando, pero ahora forman parte de las skills.' },
    { tipo: 'p', texto: 'En Claude Code tienes además campos extra. Dos muy útiles:' },
    { tipo: 'lista', items: [
      '`disable-model-invocation: true`: Claude no la carga por su cuenta; solo se ejecuta cuando tú escribes `/nombre`. Para procesos que quieres lanzar tú.',
      '`$ARGUMENTS` en el cuerpo: se sustituye por lo que escribas detrás del comando. Con `$0`, `$1`… tomas cada argumento por separado.',
    ] },
    { tipo: 'codigo', titulo: '.claude/skills/newsletter-tema/SKILL.md (solo Claude Code)', texto: `---
name: newsletter-tema
description: Prepara la newsletter de la semana centrada en un tema concreto.
disable-model-invocation: true
---

Prepara la newsletter de esta semana centrada en: $ARGUMENTS
Sigue el formato de la skill newsletter-semanal.`, nota: 'La lanzas con /newsletter-tema desayunos rápidos y Claude recibe «centrada en: desayunos rápidos». Esta cabecera no se puede subir a la app por el campo disable-model-invocation.' },
    { tipo: 'p', texto: 'Y lo que subas a claude.ai también te llega a Claude Code: desde la versión 2.1.273, Claude Code carga las skills activadas en tu cuenta si entras con ella (no con clave de API ni con un proveedor externo como Bedrock o Google Cloud).' },
    { tipo: 'h3', texto: 'Con el Agent SDK' },
    { tipo: 'p', texto: 'En el SDK las skills se leen de las mismas carpetas, según los orígenes de configuración que le indiques (por defecto, user y project):' },
    { tipo: 'codigo', titulo: 'Skills en el Agent SDK (Python)', texto: `from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(
    setting_sources=["user", "project"],
    skills="all",
    allowed_tools=["Read", "Write", "Bash"],
)`, nota: 'setting_sources decide de dónde lee: user es tu carpeta ~/.claude y project, la carpeta .claude del proyecto.' },
    { tipo: 'h3', texto: 'Prompt para copiar' },
    { tipo: 'prompt', titulo: 'Convierte tu proceso en una skill', texto: 'Quiero convertir mi newsletter semanal en una skill para que la hagas siempre igual. Te pego mis 3 últimas newsletters, las que más me gustaron:\n[pega aquí las 3 newsletters]\n\nAnalízalas y escríbeme un SKILL.md completo:\n- Cabecera solo con name y description (la voy a subir a claude.ai).\n- La description tiene que decir qué hace y cuándo usarla, con las frases con las que yo la pediría: «la newsletter», «el correo del domingo», «el resumen de la semana».\n- En el cuerpo: los pasos que sigo, el formato exacto (asunto, bloques, cierre), mi tono y lo que no hago nunca.\nSi algo de mis ejemplos no está claro, pregúntamelo antes de escribir.' },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**Description genérica**: «Ayuda con newsletters» no salta nunca. Di qué hace y cuándo, con tus palabras.',
      '**Meter tu negocio en la skill**: quién eres y qué vendes va en el Proyecto o en CLAUDE.md. En la skill, solo el procedimiento.',
      '**Campos de Claude Code en un zip para la app**: error «Unexpected key(s)». En la app, name y description.',
      '**Skills kilométricas**: un SKILL.md de más de 500 líneas. Pasa las plantillas y los ejemplos largos a archivos aparte.',
      '**Instalar skills de cualquiera**: una skill puede traer scripts. Lee qué hace antes de instalarla.',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'Es el tipo más barato. En la app entra incluso en el plan gratuito, con la ejecución de código activada. En tokens, mientras no se usa solo ocupa su nombre y su descripción; el resto se lee únicamente cuando hace falta. Y además ahorra: dejas de pegar el mismo bloque de instrucciones en cada conversación.' },

    // ── 3. Secuencial ────────────────────────────────────────────────────────
    { tipo: 'h2', texto: '3. Secuencial (en cadena): Diseña → Construye → Promociona' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Varios pasos en un orden fijo, cada uno a cargo de un especialista, y cada uno trabaja sobre lo que le entrega el anterior. Como una cadena de montaje.' },
    { tipo: 'p', texto: 'Anthropic lo llama **encadenamiento de prompts** (prompt chaining): partes una tarea en pasos fijos y cada llamada procesa la salida de la anterior. Entre paso y paso puedes poner una **puerta** (gate): una comprobación que decide si se sigue o se vuelve atrás.' },
    { tipo: 'p', texto: 'El ejemplo: lanzar un taller online. Primero alguien **diseña** la propuesta (a quién va, qué promete, cómo se llama, cuánto cuesta). Con eso, alguien **construye** la landing y los textos. Y al final alguien **promociona**: publicaciones, correos y anuncios. Cada paso necesita el anterior terminado; no tiene sentido escribir anuncios de algo que todavía no tiene nombre.' },
    { tipo: 'p', texto: 'La gracia es que cada paso es más fácil que la tarea entera, así que cada uno sale mejor. Anthropic lo resume así: cambias velocidad por precisión.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Úsalo** cuando la tarea se parte limpiamente en pasos fijos, siempre los mismos y en el mismo orden.',
      '**Úsalo** cuando prefieres precisión a velocidad: varios pasos sencillos fallan menos que uno enorme.',
      '**No lo uses** si los pasos no dependen unos de otros: eso es el tipo 4 (en paralelo) y lo harías más rápido.',
      '**No lo uses** si no sabes de antemano qué pasos harán falta: eso es el tipo 7 (orquestador).',
    ] },
    { tipo: 'h3', texto: 'En la app de Claude' },
    { tipo: 'p', texto: 'La app no tiene un botón para encadenar agentes, pero el patrón funciona igual en una conversación si las puertas las pones tú: le pides el paso 1, para, lo revisas y entonces el paso 2. Si lo haces a menudo, mete la cadena en una skill con los pasos numerados y la orden de parar entre uno y otro.' },
    { tipo: 'prompt', titulo: 'Cadena con puertas en un solo chat', texto: 'Vamos a lanzar mi [taller / curso / servicio] sobre [tema] en tres pasos. Haz SOLO el paso en el que estemos y para al terminarlo; no pases al siguiente hasta que yo escriba «sigue».\n\nPaso 1, DISEÑA: a quién va, el problema que resuelve, la promesa en una frase, tres nombres posibles, el precio y qué incluye.\nPaso 2, CONSTRUYE: con el diseño aprobado, los textos de la landing (titular, para quién es, qué se lleva, preguntas frecuentes y botón).\nPaso 3, PROMOCIONA: con la landing aprobada, un plan de dos semanas con 6 publicaciones, 3 correos y 2 anuncios.\n\nAl final de cada paso, comprueba tú mismo que cumple lo pedido y dime qué decisión me toca tomar antes de seguir. Empieza por el paso 1.' },
    { tipo: 'h3', texto: 'En Claude Code, con subagentes' },
    { tipo: 'p', texto: 'Aquí sí tienes tres agentes de verdad, cada uno con sus instrucciones y su contexto limpio. El Claude principal hace de cinta transportadora: llama al primero, recoge su resultado y se lo pasa al siguiente con el contexto que necesita.' },
    { tipo: 'pasos', items: [
      { titulo: 'Crea la carpeta de agentes', texto: 'En tu proyecto, `.claude/agents/`. Si no existía, reinicia la sesión después de crear el primer archivo.' },
      { titulo: 'Crea los tres especialistas', texto: 'Un archivo por agente: `disenador.md`, `constructor.md` y `promotor.md`. Los tienes abajo.' },
      { titulo: 'Pide la cadena en orden', texto: 'En tu prompt, di qué subagente va primero y qué se pasa al siguiente. Es la forma que recoge la documentación oficial: «usa el subagente A para…, después usa el subagente B para…».' },
      { titulo: 'Revisa en cada puerta', texto: 'Pídele que pare entre pasos si quieres aprobar tú. Los subagentes no te pueden hacer preguntas, así que las puertas las pone el Claude principal.' },
    ] },
    { tipo: 'codigo', titulo: '.claude/agents/disenador.md', texto: `---
name: disenador
description: Diseña la propuesta de un producto o lanzamiento (público, promesa, nombre, precio). Úsalo como primer paso de cualquier lanzamiento.
tools: Read, Write
model: opus
---

Eres estratega de producto para negocios pequeños.
Con el brief que te pasen, entrega en lanzamiento/1-diseno.md:
- El público concreto y su problema, en dos frases.
- La promesa en una frase, sin exagerar.
- Tres nombres posibles y tu favorito.
- El precio recomendado y qué incluye.
No escribas textos de venta: eso es del siguiente paso.` },
    { tipo: 'codigo', titulo: '.claude/agents/constructor.md', texto: `---
name: constructor
description: Construye la landing y los textos de venta a partir de un diseño aprobado. Úsalo después del disenador.
tools: Read, Write, Edit
model: sonnet
---

Lees lanzamiento/1-diseno.md y construyes la landing en
lanzamiento/2-landing.html: titular, para quién es, qué se lleva,
preguntas frecuentes y un botón de compra.
Respeta al pie de la letra la promesa y el precio del diseño.
Deja huecos marcados para testimonios reales; no los inventes.` },
    { tipo: 'codigo', titulo: '.claude/agents/promotor.md', texto: `---
name: promotor
description: Crea el plan de promoción de un lanzamiento ya construido (publicaciones, correos y anuncios). Úsalo como último paso.
tools: Read, Write
model: sonnet
---

Lees lanzamiento/1-diseno.md y lanzamiento/2-landing.html y
escribes en lanzamiento/3-promocion.md un plan de dos semanas:
6 publicaciones, 3 correos y 2 anuncios, con fecha, canal y texto.
Todo tiene que llevar a la landing y repetir la misma promesa.` },
    { tipo: 'prompt', titulo: 'Lanzar la cadena en Claude Code', texto: 'Vamos a preparar el lanzamiento de [tu taller / curso] con este brief: [pega el brief]. Hazlo en cadena:\n1. Usa el subagente disenador para crear la propuesta. Para y enséñamela.\n2. Cuando yo escriba «sigue», usa el subagente constructor para construir la landing a partir de ese diseño. Para y enséñamela.\n3. Cuando yo escriba «sigue», usa el subagente promotor para el plan de promoción.\nSi algún paso no cumple lo que pide su archivo, devuélveselo al mismo subagente con lo que falla antes de pasar al siguiente.' },
    { tipo: 'h3', texto: 'Convertir la cadena en un comando' },
    { tipo: 'p', texto: 'Si lanzas a menudo, guarda ese prompt como skill del proyecto y tendrás `/lanzamiento`. Con `disable-model-invocation: true` solo se ejecuta cuando tú lo pides, y `$ARGUMENTS` recoge el brief.' },
    { tipo: 'codigo', titulo: '.claude/skills/lanzamiento/SKILL.md', texto: `---
name: lanzamiento
description: Prepara un lanzamiento completo en cadena: diseño, landing y promoción.
disable-model-invocation: true
---

Prepara el lanzamiento de: $ARGUMENTS

1. Usa el subagente disenador. Para y enséñame el diseño.
2. Cuando escriba «sigue», usa el subagente constructor.
3. Cuando escriba «sigue», usa el subagente promotor.
Si un paso no cumple lo que pide su archivo, repítelo antes de seguir.`, nota: 'Lo lanzas con /lanzamiento taller de batch cooking para familias. Existe también el campo context: fork, que ejecuta la skill entera dentro de un subagente, pero ese subagente no ve tu conversación ni puede pararse a esperar tu «sigue»: para una cadena con puertas, mejor sin fork.' },
    { tipo: 'h3', texto: 'Con el Agent SDK' },
    { tipo: 'p', texto: 'Si quieres que la cadena corra sin ti (por ejemplo, en un servidor, cada vez que entra un brief), el SDK te deja encadenar llamadas: la salida de una es la entrada de la siguiente. Primero se instala:' },
    { tipo: 'codigo', titulo: 'Instalar el Agent SDK', texto: `npm install @anthropic-ai/claude-agent-sdk    # TypeScript (Node.js 18 o superior)
uv add claude-agent-sdk                       # Python 3.10 o superior (o: pip install claude-agent-sdk)
export ANTHROPIC_API_KEY=tu-clave             # el SDK no lee el archivo .env por sí solo`, nota: 'Usa una de las dos primeras líneas según tu lenguaje. Con uv, en una carpeta nueva, haz antes uv init, y ejecuta con uv run cadena.py. Para los .ts de este capítulo, la documentación añade npm pkg set type=module y npm install --save-dev tsx, y se ejecutan con npx tsx archivo.ts. La clave de API se crea en Claude Console y se paga por uso.' },
    { tipo: 'p', texto: 'Este es un patrón construido a partir de los ejemplos de la documentación, no código literal de ella:' },
    { tipo: 'codigo', titulo: 'cadena.py', texto: `import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

async def ejecutar(prompt, **opts):
    texto = ""
    async for m in query(prompt=prompt, options=ClaudeAgentOptions(**opts)):
        if isinstance(m, ResultMessage) and m.subtype == "success":
            texto = m.result
    return texto

async def main():
    diseno = await ejecutar("Diseña la propuesta del taller de batch cooking: público, promesa, nombre y precio")
    landing = await ejecutar(f"Escribe los textos de la landing para esta propuesta:\\n{diseno}")
    await ejecutar(f"Escribe el plan de promoción de dos semanas para esta landing y guárdalo en promocion.md:\\n{landing}",
                   allowed_tools=["Read", "Write"], permission_mode="acceptEdits")

asyncio.run(main())`, nota: 'Cada llamada a ejecutar() es un agente nuevo. Entre una y otra puedes poner tu puerta: por ejemplo, comprobar que el diseño trae precio antes de seguir.' },
    { tipo: 'p', texto: 'Y para cadenas sobre muchos elementos (un agente por archivo, uno detrás de otro), Claude Code tiene los workflows, que ves en el tipo 7.' },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**El error se arrastra**: si el diseño sale mal, la landing y la promoción salen mal. Para eso están las puertas: revisa el primer paso antes de seguir.',
      '**Entregas vagas entre pasos**: si el diseñador no deja claro el precio, el constructor se lo inventa. Pide a cada paso un archivo con un formato fijo.',
      '**Demasiados eslabones**: cada paso suma tiempo. Si dos pasos los haría bien un solo agente, júntalos.',
      '**Encadenar lo que es independiente**: si el paso 3 no necesita el 2, estás perdiendo tiempo. Lánzalos en paralelo.',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'Moderado. Son varias llamadas, una detrás de otra, así que tarda más que una sola, pero el gasto está controlado porque sabes cuántos pasos hay. Con subagentes, además, cada uno empieza con el contexto limpio y solo devuelve su resumen, de modo que tu conversación principal no se llena. Y puedes ahorrar eligiendo modelo por paso: el más capaz para pensar el diseño y uno más ligero para lo mecánico.' },

    // ── 4. En paralelo ───────────────────────────────────────────────────────
    { tipo: 'h2', texto: '4. En paralelo: cinco agentes a la vez en vez de uno lento' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Lanzas varios agentes a la vez sobre partes independientes de una tarea y Claude junta sus resultados al final. Lo que uno haría de uno en uno, cinco lo hacen a la vez.' },
    { tipo: 'p', texto: 'Imagina una agencia pequeña que quiere analizar a cinco competidores antes de una propuesta. Un solo agente los miraría uno detrás de otro y, al llegar al quinto, tendría la cabeza llena del primero. Cinco agentes, uno por competidor, trabajan a la vez, cada uno con su contexto limpio, y Claude junta los cinco informes en una comparativa.' },
    { tipo: 'p', texto: 'Anthropic distingue dos variantes:' },
    { tipo: 'lista', items: [
      '**Por secciones (sectioning)**: partes la tarea en trozos independientes y cada agente hace uno. Los cinco competidores, o las cinco secciones de un informe.',
      '**Por votación (voting)**: varios agentes hacen la misma tarea y comparas. Por ejemplo, tres revisores leen el mismo anuncio y te quedas con lo que marcan varios.',
    ] },
    { tipo: 'p', texto: 'En el sistema de investigación de Anthropic, lanzar subagentes en paralelo recortó hasta un 90 % el tiempo de investigación en las consultas complejas.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Úsalo** cuando las partes no dependen unas de otras: cinco competidores, veinte vídeos que etiquetar, diez propuestas que revisar.',
      '**Úsalo** cuando necesitas varias opiniones para fiarte de un resultado (votación).',
      '**No lo uses** si un trozo necesita el resultado de otro: eso es una cadena (tipo 3).',
      '**No lo uses** si todos necesitan el mismo contexto o dependen mucho entre sí: Anthropic avisa de que hoy los agentes no son buenos coordinándose en tiempo real.',
      '**No lo uses** para algo pequeño: cinco agentes para una pregunta sencilla es tirar el dinero.',
    ] },
    { tipo: 'h3', texto: 'En la app de Claude' },
    { tipo: 'p', texto: 'En la app no defines tus propios agentes en paralelo, pero ya usas unos: la función **Research** de Claude funciona con varios agentes de Claude que investigan a la vez. Anthropic contó cómo la construyó en «How we built our multi-agent research system». Cuando pides una investigación amplia con Research, estás usando el tipo 4 (y el 7, porque hay un agente jefe que reparte el trabajo).' },
    { tipo: 'h3', texto: 'En Claude Code, con subagentes' },
    { tipo: 'p', texto: 'Basta con pedirlo. La documentación oficial pone de ejemplo pedir que investigue varias partes en paralelo con subagentes separados: cada uno explora su parte por su cuenta y luego Claude sintetiza. Funciona mejor cuando los caminos no dependen unos de otros.' },
    { tipo: 'prompt', titulo: 'Cinco competidores a la vez', texto: 'Quiero analizar a mis 5 competidores antes de cerrar mi propuesta de [tu servicio]. Son: [competidor 1 + web], [competidor 2 + web], [competidor 3 + web], [competidor 4 + web] y [competidor 5 + web].\n\nLanza 5 subagentes en paralelo, uno por competidor. Cada uno debe devolver, en menos de 300 palabras y con el mismo formato: qué ofrece, a quién, precios si son públicos, cómo se vende (canales y mensaje) y un punto débil claro. Solo información pública; si algo no lo encuentra, que escriba «no encontrado» en vez de suponer.\n\nCuando terminen los 5, júntalos en una tabla comparativa y dime 3 huecos que yo podría ocupar.' },
    { tipo: 'p', texto: 'Si lo vas a repetir, dale forma fija al investigador con un subagente propio, así los cinco devuelven exactamente lo mismo:' },
    { tipo: 'codigo', titulo: '.claude/agents/analista-competencia.md', texto: `---
name: analista-competencia
description: Analiza un competidor concreto a partir de su web y de fuentes públicas. Úsalo uno por competidor, en paralelo, cuando se pida comparar la competencia.
tools: Read, WebFetch, WebSearch
model: sonnet
---

Analizas UN competidor. Devuelve siempre este formato, en menos de 300 palabras:
- Qué ofrece y a quién
- Precios (solo si son públicos)
- Canales y mensaje principal
- Un punto débil claro, con la prueba
Si algo no lo encuentras, escribe «no encontrado». No supongas.` },
    { tipo: 'p', texto: 'Lo que conviene saber de los límites:' },
    { tipo: 'lista', items: [
      'Por defecto puede haber **20 subagentes** a la vez en una sesión (se cambia con la variable `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).',
      'Un subagente puede lanzar los suyos, hasta **tres niveles** por debajo de la conversación principal (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; con `1`, no anidan).',
      'Cada uno empieza con el contexto limpio y solo devuelve su resumen. Por eso tienes que darle en el prompt todo lo que necesita.',
      'Los subagentes no te pueden hacer preguntas. Si uno necesita permiso para una herramienta, el aviso te llega a la sesión principal con su nombre: apruebas, o pulsas Esc para denegar esa llamada.',
      'Pueden ir en primer plano (bloquean la conversación hasta terminar) o en segundo plano (siguen trabajando mientras tú haces otra cosa).',
    ] },
    { tipo: 'h3', texto: 'Para muchos agentes: los workflows' },
    { tipo: 'p', texto: 'Si en vez de cinco son cincuenta (todos los guiones de un año, todas las fichas de producto), Claude Code tiene **workflows**: Claude escribe un pequeño programa que coordina muchos subagentes y lo ejecuta en segundo plano mientras tú sigues trabajando. Se piden con palabras normales («usa un workflow para…») o con la palabra clave `ultracode` en el prompt.' },
    { tipo: 'prompt', titulo: 'Un workflow para ordenar tu archivo', texto: 'Usa un workflow para revisar todos los guiones de la carpeta guiones/: un agente por archivo que saque el tema, el formato (tutorial, opinión o caso real) y el gancho de los dos primeros segundos. Después, junta todo en guiones/indice.csv y dime qué temas se repiten más.' },
    { tipo: 'lista', items: [
      'Antes de arrancar te enseña las fases y te pide aprobarlo: **Yes, run it**, ver el script o **No**. En modo Manual te lo pregunta en cada ejecución; en modo auto, solo la primera vez. En la app de escritorio sale una tarjeta con **Once**, **Always** y **Deny**.',
      'Con `/workflows` ves el progreso, cada fase y cada agente. Puedes pausar con `p` o parar con `x`.',
      'Por defecto corren hasta **16 agentes a la vez**, con un máximo de 1.000 agentes por ejecución.',
      'Claude Code trae uno ya hecho: `/deep-research <pregunta>`, que investiga en varias fuentes, las contrasta y te da un informe con citas (necesita la búsqueda web).',
      'Están en los planes de pago y con la API. En Pro se activan en `/config`, en la fila **Dynamic workflows**.',
    ] },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**Partes que dependen entre sí**: si el agente 3 necesita lo del 2, el paralelo te da basura. Comprueba que cada trozo se puede hacer solo.',
      '**Trabajo duplicado**: Anthropic vio a varios de sus subagentes repetir la misma investigación. Dale a cada uno un trozo claro y distinto.',
      '**Formatos distintos**: si cada uno devuelve lo que quiere, juntarlos es imposible. Fija el formato de salida (para eso es el subagente de arriba).',
      '**Pasarse de agentes**: Anthropic cuenta que su sistema llegó a lanzar 50 subagentes para preguntas sencillas. Su regla: para buscar un dato, 1 agente con 3 a 10 llamadas a herramientas; para una comparación, de 2 a 4 subagentes; para algo complejo, más de 10.',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'Alto en tokens: un sistema de varios agentes gasta unas 15 veces más que un chat, según Anthropic. Lo que compras es tiempo, así que úsalo cuando el resultado lo valga. Con los workflows, Claude Code te avisa con **Large workflow** si una ejecución programa más de 25 agentes o prevé más de 1,5 millones de tokens, y en `/config` puedes fijar un tamaño orientativo: small (menos de 5 agentes), medium (menos de 10) o large (menos de 50). El consejo de la documentación: pruébalo primero con un trozo pequeño (una carpeta, no todo el archivo) para ver lo que gasta.' },

    // ── 5. Enrutador ─────────────────────────────────────────────────────────
    { tipo: 'h2', texto: '5. Enrutador: la recepcionista que clasifica y deriva' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Un agente que mira lo que entra, decide de qué tipo es y se lo pasa al especialista que toca. Como la recepcionista que te manda a contabilidad o a ventas.' },
    { tipo: 'p', texto: 'A tu bandeja llega de todo: una alumna que pide que le devuelvas el dinero del curso, alguien que pregunta si haces consultas online, un proveedor, una duda sobre el módulo 3. No se contestan igual ni los lleva la misma persona.' },
    { tipo: 'p', texto: 'Anthropic lo llama **enrutamiento** (routing): clasificar la entrada y mandarla a una tarea especializada. Tiene dos ventajas. Cada especialista tiene instrucciones cortas y afinadas, en vez de un prompt gigante que intenta cubrirlo todo. Y puedes mandar lo fácil a un modelo pequeño y barato y lo difícil a uno potente. Es literalmente el ejemplo de Anthropic: separar las preguntas generales, las peticiones de reembolso y el soporte técnico.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Úsalo** cuando lo que entra cae en categorías claras que se tratan distinto: devolución, lead, duda de alumna, otros.',
      '**Úsalo** cuando la clasificación es fiable: si tú la harías sin dudar en dos segundos, Claude también.',
      '**No lo uses** si las categorías se solapan mucho («¿es una queja o una devolución?»): un error de clasificación manda el caso al sitio equivocado.',
      '**No lo uses** si casi todo lo que entra es del mismo tipo: con un solo especialista basta.',
    ] },
    { tipo: 'h3', texto: 'En la app de Claude: dos skills ya son un enrutador' },
    { tipo: 'p', texto: 'En la app, el enrutador más sencillo ya lo tienes: las skills. Claude elige la skill comparando tu petición con la `description` de cada una. Si creas una skill `devoluciones` y otra `leads`, cada una con una description clara, al pegar un correo Claude carga la que toca. Eso es enrutar.' },
    { tipo: 'codigo', titulo: 'Las dos cabeceras (una en cada SKILL.md)', texto: `---
name: devoluciones
description: Responde peticiones de devolución o reembolso del curso siguiendo mi política (14 días, sin preguntas). Úsala cuando alguien pida que le devuelva el dinero, cancelar la compra o un reembolso.
---

---
name: leads
description: Responde a personas interesadas en mis consultas 1 a 1 o en el curso y propone una llamada. Úsala cuando alguien pregunte precios, disponibilidad, cómo funciona la consulta o si el curso es para él o para ella.
---`, nota: 'Son dos archivos distintos, cada uno con su cuerpo debajo (tu política de devoluciones, tu forma de presentar la consulta). Se suben en Customize > Skills, como viste en el tipo 2.' },
    { tipo: 'prompt', titulo: 'Recepcionista en un chat (app)', texto: 'Te voy a pegar los correos que me han llegado hoy. Para cada uno:\n1. Clasifícalo en UNA categoría: DEVOLUCIÓN, LEAD, DUDA DE ALUMNA u OTROS. Si dudas entre dos, márcalo como DUDOSO y dime por qué.\n2. Si es DEVOLUCIÓN o LEAD, usa la skill que corresponde para preparar un borrador de respuesta.\n3. Si es DUDA DE ALUMNA, propón una respuesta de tres líneas.\n4. Si es OTROS o DUDOSO, no respondas: resúmelo en una línea.\nDevuélveme primero una tabla (remitente, categoría, motivo) y después los borradores. No envíes nada.\n\n[pega aquí los correos]' },
    { tipo: 'h3', texto: 'En Claude Code: la description es el enrutador' },
    { tipo: 'p', texto: 'En Claude Code el enrutamiento lo hacen los subagentes. Claude decide a cuál delegar según tu petición, la `description` de cada subagente y el contexto de la conversación. La documentación recomienda descripciones concretas y, si quieres que delegue sin que se lo pidas, incluir en la description una frase como «use proactively».' },
    { tipo: 'codigo', titulo: '.claude/agents/devoluciones.md', texto: `---
name: devoluciones
description: Gestiona devoluciones y reembolsos de clientes (curso, cancelación, reembolso). Use proactively: úsalo cuando un mensaje pida devolver, cancelar o reembolsar una compra.
tools: Read, Grep
model: haiku
---

Resuelves la devolución siguiendo politica/devoluciones.md.
Devuelve: quién es, qué compró y cuándo, si cumple la política
(sí o no, y por qué) y un borrador de respuesta.
Nunca ejecutes el reembolso: eso lo aprueba una persona.` },
    { tipo: 'codigo', titulo: '.claude/agents/ventas.md', texto: `---
name: ventas
description: Atiende leads interesados en las consultas 1 a 1 o en el curso. Use proactively: úsalo cuando alguien pregunte precios, disponibilidad o cómo funciona un servicio.
tools: Read, Grep
model: haiku
---

Lees el mensaje y precios/servicios.md. Devuelve: qué busca la persona,
qué servicio le encaja, la temperatura del lead (frío, templado o caliente)
y un borrador de respuesta que proponga una llamada de 15 minutos.
No prometas descuentos ni plazos que no estén en precios/servicios.md.` },
    { tipo: 'p', texto: 'Y siempre una salida por defecto. Dile a Claude, en tu CLAUDE.md o en el prompt, qué hacer con lo que no encaja: «si no es devolución ni lead, no lo derives: resúmelo y déjamelo a mí».' },
    { tipo: 'prompt', titulo: 'Recepcionista en Claude Code', texto: 'En la carpeta entrada/ tienes los mensajes de hoy, uno por archivo. Para cada uno, decide si es una devolución, un lead u otra cosa. Las devoluciones pásalas al subagente devoluciones y los leads al subagente ventas. Lo que no sea ninguna de las dos cosas, no lo derives: resúmelo en una línea. Al terminar, escribe entrada/resumen.md con una tabla (archivo, categoría, quién lo ha llevado, siguiente paso) y los borradores debajo. No envíes nada ni ejecutes ningún reembolso.' },
    { tipo: 'p', texto: 'Dos detalles. Los dos especialistas usan `haiku`, el modelo más rápido y barato, porque su trabajo es acotado. Y si tienes muchos subagentes, sus descriptions juntas tienen un presupuesto de 15.000 tokens (sin contar los integrados); si lo pasas, Claude Code te avisa al arrancar. La solución: recortar las descriptions y llevar el detalle al cuerpo del archivo, que solo se lee cuando ese subagente trabaja.' },
    { tipo: 'h3', texto: 'Con el Agent SDK' },
    { tipo: 'p', texto: 'En el SDK es igual: defines los especialistas en `agents`, cada uno con su `description`; el agente principal delega con la herramienta `Agent`, y todos los ejemplos de la documentación la ponen en `allowedTools` para que delegue sin pedir permiso. Tienes el código completo en el tipo 7, porque el orquestador se monta de la misma forma.' },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**Categorías que se pisan**: «queja» y «devolución» a la vez confunden. Define categorías que no se solapen y di qué hacer con las dudosas.',
      '**Sin ruta por defecto**: lo que no encaja acaba metido a la fuerza en alguna categoría. Ten siempre un «otros».',
      '**Descriptions vagas**: «Ayuda con clientes» no enruta nada. Di qué casos y con qué palabras llegan.',
      '**Fiarse de la clasificación cuando hay dinero**: el enrutador prepara; el reembolso lo aprueba una persona (tipo 6).',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'Bajo. Clasificar es una tarea corta, y el enrutador puede incluso **bajar** el coste total, porque te deja mandar lo sencillo a modelos pequeños (Anthropic pone el ejemplo de mandar lo fácil a Haiku y lo difícil a Sonnet). En la app, si lo haces con skills, no pagas nada extra sobre tu plan.' },

    // ── 6. Humano en el bucle ────────────────────────────────────────────────
    { tipo: 'h2', texto: '6. Humano en el bucle: para y te pide Aprobar o Rechazar' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'El agente trabaja solo hasta llegar a un punto delicado, se para y te pregunta. Tú apruebas o rechazas, y entonces sigue. Úsalo con todo lo que toque dinero o clientes.' },
    { tipo: 'p', texto: 'No es un tipo aparte, sino una forma de montar cualquiera de los otros. Anthropic lo describe así para los agentes en general: pueden pararse a pedir tu opinión en puntos de control o cuando se atascan, es habitual ponerles una condición de parada (como un número máximo de intentos) y, en su ejemplo de agentes que programan, insiste en que la revisión humana sigue siendo clave aunque las pruebas estén automatizadas.' },
    { tipo: 'p', texto: 'La regla práctica es sencilla. Si una acción **no se puede deshacer** o **la ve un cliente**, pasa por ti: un reembolso, un correo enviado, una publicación, un cambio en la ficha de un cliente, un pago. Si se puede deshacer y solo la ves tú (un borrador, un archivo en una carpeta de pruebas), que la haga sola.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Siempre** con dinero: reembolsos, cobros, descuentos, presupuestos que salen.',
      '**Siempre** con clientes: correos y mensajes enviados, publicaciones, cambios en tu CRM.',
      '**Siempre** con lo irreversible: borrar, sobrescribir, publicar.',
      '**No hace falta** en tareas reversibles que solo te afectan a ti: ordenar tu carpeta de pruebas, preparar borradores, resumir. Ahí pedir aprobación es pura fricción.',
    ] },
    { tipo: 'aviso', variante: 'ojo', titulo: '«No lo envíes» no es una barrera', texto: 'Escribir en el prompt «no lo envíes» funciona casi siempre, pero es una petición, no un cierre. Lo que de verdad impide que algo se ejecute sin ti son los permisos: en la app, **Needs approval**; en Claude Code, las reglas `ask` y `deny` y los hooks. Para dinero y clientes, usa permisos.' },
    { tipo: 'h3', texto: 'En la app de Claude' },
    { tipo: 'pasos', items: [
      { titulo: 'Entra en el conector', texto: 'Customize > Connectors y elige el conector en **Your connectors** (Gmail, HubSpot, el que sea).' },
      { titulo: 'Abre Tool permissions', texto: 'Para cada herramienta o grupo de herramientas eliges **Always allow**, **Needs approval** o **Blocked**.' },
      { titulo: 'Pon en Needs approval lo que toca a clientes', texto: 'Enviar, responder, reenviar, crear o actualizar contactos, borrar. Leer y buscar pueden quedarse en Always allow.' },
      { titulo: 'Bloquea lo que no debe hacer nunca', texto: 'Si no quieres que Claude borre nada en esa app, ponlo en **Blocked**.' },
      { titulo: 'Decide en el momento', texto: 'Cuando Claude quiera usar una herramienta con aprobación, te lo pregunta en el chat: **Allow once** para esta vez o **Always allow** para no volver a preguntar. Con lo de clientes, Allow once.' },
    ] },
    { tipo: 'h3', texto: 'En Claude Code: tres niveles de control' },
    { tipo: 'p', texto: '**Nivel 1: el modo de permiso.** Lo viste en el capítulo 06: las versiones actuales arrancan en la terminal en modo **auto**, donde un clasificador revisa y aprueba por ti (las reglas `ask` del nivel 2 te siguen preguntando incluso ahí). En modo **Manual** (internamente, `default`) Claude te pide permiso antes de editar archivos o ejecutar comandos; en modo **plan**, explora y te propone un plan, y no toca nada hasta que lo apruebas. Cambias de modo con Shift+Tab, empiezas un mensaje con `/plan` o arrancas directamente en plan:' },
    { tipo: 'codigo', titulo: 'Arrancar en modo plan', texto: 'claude --permission-mode plan', nota: 'Con Ctrl+G puedes editar el plan antes de aprobarlo. Los modos son default (Manual), acceptEdits, plan, auto, dontAsk y bypassPermissions.' },
    { tipo: 'codigo', titulo: 'Que el proyecto arranque siempre en plan (.claude/settings.json)', texto: `{
  "permissions": {
    "defaultMode": "plan"
  }
}` },
    { tipo: 'p', texto: '**Nivel 2: reglas allow, ask y deny.** En `.claude/settings.json` le dices qué puede hacer solo (`allow`), qué tiene que preguntarte siempre (`ask`) y qué tiene prohibido (`deny`). Se evalúan por orden de dureza: primero deny, luego ask, luego allow, y la primera que encaja manda. Una regla `ask` te pregunta aunque otra más concreta lo permita.' },
    { tipo: 'codigo', titulo: 'Reglas para un negocio pequeño (.claude/settings.json)', texto: `{
  "permissions": {
    "allow": ["Bash(npm test *)"],
    "ask": ["Bash(git push *)", "mcp__hubspot"],
    "deny": ["Bash(rm *)"]
  }
}`, nota: 'La regla mcp__hubspot encaja con cualquier herramienta del servidor MCP llamado hubspot, así que Claude te preguntará antes de tocar tu CRM. Para una sola herramienta se usa la forma mcp__servidor__herramienta. Los conectores que Claude Code trae de claude.ai tienen otro nombre (empiezan por mcp__claude_ai_): míralo en /mcp antes de escribir la regla.' },
    { tipo: 'p', texto: '**Nivel 3: un hook que decide.** Para reglas más finas que un patrón (por ejemplo, «pregúntame solo si el comando hace tal cosa»), un hook `PreToolUse` se ejecuta antes de cada herramienta y puede devolver `allow`, `deny`, `ask` o `defer`. Con `ask`, Claude Code te enseña el aviso con el motivo que le des. Este ejemplo te pide confirmación antes de cualquier `git push` (necesita tener `jq` instalado):' },
    { tipo: 'codigo', titulo: '.claude/hooks/pedir-confirmacion.sh', texto: `#!/bin/bash
# .claude/hooks/pedir-confirmacion.sh
COMMAND=$(jq -r '.tool_input.command')
if echo "$COMMAND" | grep -q 'git push'; then
  jq -n --arg r "Confirma: $COMMAND" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
else
  exit 0
fi`, nota: 'Dale permiso de ejecución con chmod +x .claude/hooks/pedir-confirmacion.sh. Si el script termina con exit 0 sin escribir nada, el hook no decide y siguen mandando tus reglas normales.' },
    { tipo: 'codigo', titulo: 'Registrar el hook (.claude/settings.json)', texto: `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\${CLAUDE_PROJECT_DIR}/.claude/hooks/pedir-confirmacion.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}`, nota: 'Para vigilar herramientas MCP, el matcher de un hook es una expresión como mcp__hubspot__.* (el .* final es obligatorio: en un hook, mcp__hubspot a secas no encaja con ninguna herramienta). Para bloquear sin JSON, el script sale con exit 2 y el motivo va por la salida de error.' },
    { tipo: 'p', texto: 'Dos cosas importantes. Lo que decide un hook no se salta las reglas `deny` y `ask` de tus ajustes: si una regla dice ask, te pregunta igual. Y si varios hooks deciden a la vez, gana el más estricto: deny, luego defer, luego ask, luego allow.' },
    { tipo: 'p', texto: 'Un matiz para combinarlo con otros tipos: los subagentes no pueden hacerte preguntas, y un workflow no admite que le escribas a mitad de ejecución. Las peticiones de permiso sí te llegan a la sesión principal; pero si quieres revisar entre etapas de un workflow, la documentación recomienda lanzar cada etapa como un workflow aparte.' },
    { tipo: 'h3', texto: 'Con el Agent SDK: canUseTool' },
    { tipo: 'p', texto: 'Si el agente corre dentro de tu programa, la aprobación la gestionas con la función `canUseTool`: el SDK la llama cuando Claude quiere usar una herramienta que ninguna regla ni modo ha aprobado ya, y tú devuelves permitir o denegar. Este ejemplo, adaptado del de la documentación, te pregunta en la terminal:' },
    { tipo: 'codigo', titulo: 'aprobar.ts', texto: `import { query } from "@anthropic-ai/claude-agent-sdk";
import * as readline from "readline";

function preguntar(texto: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(texto, (respuesta) => {
      rl.close();
      resolve(respuesta);
    })
  );
}

for await (const message of query({
  prompt: "Lee devoluciones.csv y escribe en reembolsos.md qué reembolsos cumplen la política",
  options: {
    canUseTool: async (toolName, input) => {
      console.log("Claude quiere usar " + toolName + ":", JSON.stringify(input, null, 2));
      const respuesta = await preguntar("¿Aprobar? (s/n): ");
      if (respuesta.toLowerCase() === "s") {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: "El usuario lo ha rechazado" };
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}`, nota: 'Ojo: canUseTool no se llama para lo que ya está aprobado por una regla allow o por un modo como acceptEdits o bypassPermissions, y en dontAsk no se llama nunca. Si necesitas revisar todas las llamadas sin excepción, usa un hook PreToolUse. En Python existe lo mismo (can_use_tool), con un truco que explica la documentación: un hook vacío que mantiene abierta la conexión.' },
    { tipo: 'prompt', titulo: 'Prepara, para y pregunta', texto: 'Revisa las peticiones de devolución de esta semana en [carpeta / Gmail]. Para cada una, comprueba si cumple mi política [14 días desde la compra y no más de 2 módulos vistos] y prepara:\n- un resumen de una línea (quién, qué compró, cuándo),\n- tu recomendación (APROBAR o RECHAZAR) con el motivo,\n- el borrador de respuesta.\nPara ahí. No ejecutes ningún reembolso ni envíes ningún correo. Enséñame la lista y espera a que yo escriba, para cada una, «aprobar» o «rechazar». Solo entonces prepara los siguientes pasos de las que apruebe.' },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**Always allow en lo irreversible**: comodísimo, hasta el día que envía lo que no debía.',
      '**Aprobar sin leer**: si te pregunta 40 veces al día, acabarás pulsando «sí» sin mirar. Pide aprobación solo en lo importante y deja lo reversible en automático.',
      '**Confiar en el prompt para lo crítico**: «no lo envíes» orienta; Needs approval, ask y deny obligan.',
      '**Sin condición de parada**: un agente que reintenta sin fin gasta y puede estropear cosas. Pon un límite («si falla dos veces, para y avísame»); en los subagentes existe el campo `maxTurns`.',
      '**Bypass fuera de un entorno aislado**: el modo bypassPermissions se salta todas las preguntas. Solo en contenedores o máquinas virtuales.',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'En tokens, casi nada: pararse a preguntar no consume. Lo que cuesta es tu tiempo y algo de velocidad. A cambio, te ahorra el coste mucho mayor de un error que se va acumulando: un reembolso mal hecho, un correo equivocado a una clienta.' },

    // ── 7. Orquestador ───────────────────────────────────────────────────────
    { tipo: 'h2', texto: '7. Orquestador: el director de marketing que reparte el trabajo' },
    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Un agente jefe recibe un encargo grande, decide él qué subtareas hacen falta, las reparte entre especialistas y junta todo en un resultado final.' },
    { tipo: 'p', texto: 'Imagina que le dices a tu director de marketing: «lanzamos el curso en noviembre». No te pide la lista de tareas: decide que hacen falta un plan de anuncios, un calendario de redes y una revisión de marca, se lo encarga a cada especialista, revisa lo que le devuelven y te entrega un plan único.' },
    { tipo: 'p', texto: 'Anthropic lo llama **orquestador-trabajadores**. La diferencia con el paralelo (tipo 4) es quién decide las subtareas: en el paralelo las fijas tú de antemano («un agente por competidor»); en el orquestador las decide el jefe según el encargo. Si le pides solo los anuncios, quizá no llame a Branding; si le pides un relanzamiento completo, quizá llame a los tres y a alguno dos veces.' },
    { tipo: 'p', texto: 'Es la arquitectura del sistema de investigación de Anthropic: un investigador jefe planifica, guarda el plan en una memoria (porque si el contexto pasa de 200.000 tokens se corta), lanza subagentes en paralelo, junta lo que encuentran y, al final, un agente de citas pone las fuentes. Con Claude Opus 4 de jefe y Sonnet 4 de subagentes, superó en un 90,2 % a un único agente Opus 4 en su evaluación interna.' },
    { tipo: 'h3', texto: 'Cuándo usarlo y cuándo no' },
    { tipo: 'lista', items: [
      '**Úsalo** en tareas complejas donde no sabes de antemano cuántas subtareas ni cuáles harán falta.',
      '**Úsalo** cuando el resultado vale mucho: un lanzamiento, una propuesta grande, una investigación de mercado.',
      '**No lo uses** si las subtareas son siempre las mismas: una cadena (tipo 3) o un paralelo (tipo 4) son más baratos y previsibles.',
      '**No lo uses** si todos los especialistas necesitan el mismo contexto o dependen mucho unos de otros: según Anthropic, eso hoy no encaja bien con varios agentes.',
      '**No lo uses** si la tarea no paga unas 15 veces los tokens de un chat.',
    ] },
    { tipo: 'h3', texto: 'En la app de Claude' },
    { tipo: 'p', texto: 'Como en el tipo 4: la función **Research** es un orquestador por dentro (el investigador jefe que reparte). La usas, no la configuras. Para tener tu propio director con tus propios especialistas necesitas Claude Code o el Agent SDK.' },
    { tipo: 'h3', texto: 'En Claude Code: tu conversación es el director' },
    { tipo: 'p', texto: 'En Claude Code, la conversación principal ya es un orquestador: decide turno a turno a qué subagente llamar. Solo tienes que darle los especialistas y un buen encargo. Crea uno por área:' },
    { tipo: 'codigo', titulo: '.claude/agents/anuncios.md', texto: `---
name: anuncios
description: Especialista en anuncios de pago (Meta e Instagram). Úsalo para textos de anuncio, públicos, presupuesto y variantes para probar.
tools: Read, Write
model: sonnet
---

Eres especialista en anuncios para negocios pequeños con poco presupuesto.
Entregas en campana/anuncios.md: 3 públicos, 4 textos con su gancho,
el presupuesto diario recomendado y qué medir la primera semana.
Nada de promesas que la landing no cumpla.` },
    { tipo: 'codigo', titulo: '.claude/agents/redes.md', texto: `---
name: redes
description: Especialista en redes sociales orgánicas. Úsalo para calendarios de publicación, ideas de reels y carruseles.
tools: Read, Write
model: sonnet
---

Entregas en campana/redes.md un calendario de 3 semanas:
fecha, formato (reel, carrusel o historia), gancho y llamada a la acción.
Cada pieza lleva a la landing o a la lista de correo.` },
    { tipo: 'codigo', titulo: '.claude/agents/branding.md', texto: `---
name: branding
description: Especialista en marca. Úsalo para revisar que mensajes, nombre y tono sean coherentes con la marca antes de publicar.
tools: Read, Write
model: opus
---

Lees marca/guia.md y todo lo que haya en campana/.
Entregas en campana/branding.md: incoherencias de tono o de promesa,
frases que no suenan a la marca y su versión corregida.
No reescribes las piezas: señalas y propones.` },
    { tipo: 'prompt', titulo: 'El encargo al director', texto: 'Actúa como director de marketing del lanzamiento de [tu curso / servicio], previsto para [fecha]. El brief está en campana/brief.md.\n1. Lee el brief y decide qué necesitas de cada especialista: anuncios, redes y branding. Puede que no necesites a los tres, o que tengas que llamar a alguno dos veces.\n2. Da a cada subagente un encargo concreto: objetivo, formato de entrega, fecha límite y qué NO debe hacer.\n3. Lanza en paralelo los que no dependan entre sí. Branding revisa al final lo que hayan hecho los demás.\n4. Junta todo en campana/plan.md: un plan único, sin contradicciones, con calendario y presupuesto.\nNo publiques ni programes nada: el plan lo apruebo yo.' },
    { tipo: 'p', texto: 'Si prefieres que el director sea el agente principal de la sesión, con su propio carácter, créalo también como subagente y arranca con `claude --agent director-marketing`. En su campo `tools`, la forma `Agent(anuncios, redes, branding)` limita a qué especialistas puede llamar:' },
    { tipo: 'codigo', titulo: '.claude/agents/director-marketing.md', texto: `---
name: director-marketing
description: Director de marketing que coordina a los especialistas de anuncios, redes y branding.
tools: Agent(anuncios, redes, branding), Read, Write
model: opus
---

Eres el director de marketing de un negocio pequeño.
Recibes un encargo, decides qué especialistas hacen falta,
les das instrucciones concretas (objetivo, formato y límites)
y juntas sus entregas en un plan único y coherente.
Antes de dar algo por terminado, comprueba que no hay contradicciones.`, nota: 'Arráncalo con claude --agent director-marketing. La lista dentro de Agent(...) solo se respeta cuando ese agente es el principal (con --agent); dentro de un subagente normal, Agent a secas le deja lanzar subagentes y la lista se ignora.' },
    { tipo: 'h3', texto: 'Con el Agent SDK' },
    { tipo: 'p', texto: 'Para un orquestador que corra dentro de tu programa, le pasas al agente principal los especialistas en `agents` y la herramienta `Agent` en `allowedTools`. Ejemplo en TypeScript, a partir del de la documentación (la instalación la tienes en el tipo 3):' },
    { tipo: 'codigo', titulo: 'director.ts', texto: `import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Prepara el lanzamiento del curso: anuncios, redes y branding",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Agent"],
    agents: {
      anuncios: {
        description: "Especialista en anuncios de pago. Úsalo para textos y públicos.",
        prompt: "Eres un experto en anuncios de pago para negocios pequeños.",
        tools: ["Read", "Write"]
      },
      redes: {
        description: "Especialista en redes sociales. Úsalo para publicaciones y calendario.",
        prompt: "Eres un experto en redes sociales.",
        tools: ["Read", "Write"]
      },
      branding: {
        description: "Especialista en marca. Úsalo para revisar la coherencia de tono y mensaje.",
        prompt: "Eres el guardián de la marca: señalas incoherencias y propones correcciones.",
        tools: ["Read"]
      }
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}`, nota: 'En Python es lo mismo con AgentDefinition(description=..., prompt=..., tools=[...]) dentro de ClaudeAgentOptions(allowed_tools=[..., "Agent"], agents={...}). Lo que esté en allowedTools se aprueba solo; lo demás pasa por los permisos (por ejemplo, por tu canUseTool del tipo 6).' },
    { tipo: 'h3', texto: 'Con un workflow: el orquestador escrito en un guion' },
    { tipo: 'p', texto: 'Cuando el reparto es grande y quieres repetirlo siempre igual, el workflow pasa el plan del director a un pequeño programa: Claude lo escribe, el programa reparte y los resultados intermedios se quedan en el guion, no en tu conversación. Normalmente no lo escribes tú: pides «usa un workflow para…» y, si te gusta cómo ha ido, lo guardas pulsando `s` en `/workflows`, en `.claude/workflows/` (proyecto) o en `~/.claude/workflows/` (personal). Desde entonces se lanza como `/<nombre>`. Para que lo reconozcas, un guion guardado tiene esta pinta:' },
    { tipo: 'codigo', titulo: '.claude/workflows/fichas-producto.js', texto: `export const meta = {
  name: 'fichas-producto',
  description: 'Reescribe cada ficha de producto con el tono de la marca',
}

const lista = await agent('Lista todos los archivos .md de la carpeta productos/.', {
  schema: { type: 'object', required: ['files'], properties: { files: { type: 'array', items: { type: 'string' } } } },
})

const fichas = await pipeline(lista.files, file =>
  agent('Reescribe ' + file + ' siguiendo marca/guia.md. No cambies precios ni medidas.', { label: file }),
)

return fichas.filter(Boolean)`, nota: 'agent() lanza un subagente; pipeline() lanza uno por cada elemento de una lista; parallel() lanza varios a la vez y espera a todos. Con schema, el agente devuelve datos con esa forma en vez de texto. Un agente que se para o falla devuelve null; por eso el filter(Boolean) del final.' },
    { tipo: 'p', texto: 'Existen además los **agent teams**: un agente jefe que supervisa otras sesiones de Claude trabajando a la vez durante mucho rato. Son experimentales, vienen desactivados y van más allá de este capítulo.' },
    { tipo: 'h3', texto: 'Errores típicos' },
    { tipo: 'lista', items: [
      '**Encargos vagos del director**: si a cada especialista le llega «haz lo tuyo», duplican trabajo o dejan huecos. Anthropic lo arregló así en su sistema: a cada subagente, objetivo, formato de entrega, herramientas sugeridas y límites claros.',
      '**Matar moscas a cañonazos**: un orquestador con tres especialistas para escribir un post. El esfuerzo tiene que ir con la complejidad de la tarea.',
      '**Especialistas que se pisan**: si anuncios y redes escriben la misma pieza, el director no sabe cuál vale. Cada uno, su terreno y su archivo de entrega.',
      '**Nadie revisa el conjunto**: cada pieza puede estar bien y el plan no tener sentido. Pide al director que compruebe contradicciones antes de entregar, o pon a un especialista a revisar (aquí, branding).',
      '**Dejarle publicar**: el plan lo aprueba una persona (tipo 6).',
    ] },
    { tipo: 'h3', texto: 'Lo que cuesta' },
    { tipo: 'p', texto: 'Es el más caro de los siete: un sistema de varios agentes gasta, según Anthropic, unas 15 veces más tokens que un chat. Solo compensa en tareas de mucho valor que se puedan repartir de verdad. Para abaratarlo: un modelo potente para el director y modelos más ligeros para los especialistas con tareas acotadas (como hizo Anthropic, con Opus de jefe y Sonnet en los subagentes), y pruebas con encargos pequeños antes del grande.' },

    // ── Combinarlos ──────────────────────────────────────────────────────────
    { tipo: 'h2', texto: 'Cómo combinarlos: el negocio de Marta, de principio a fin' },
    { tipo: 'p', texto: 'Los siete tipos no compiten: se combinan. Lo normal en un negocio pequeño es usar tres o cuatro a la vez, cada uno en su sitio. Mira cómo lo monta Marta, nutricionista con un curso online («Come Mejor») y consultas 1 a 1, con una asistente a media jornada.' },
    { tipo: 'h3', texto: 'El punto de partida' },
    { tipo: 'lista', items: [
      'Le llegan unos 30 correos al día: alumnas con dudas, peticiones de devolución y gente interesada en la consulta.',
      'Cada domingo envía una newsletter. Cada trimestre lanza un taller nuevo.',
      'Lleva a sus alumnas en Notion y los leads en HubSpot.',
      'Antes de montar nada, fija su regla: **nada que toque dinero ni nada que vaya a leer una clienta sale sin que ella o su asistente lo aprueben**.',
    ] },
    { tipo: 'h3', texto: 'Qué tipo hace cada cosa' },
    { tipo: 'tabla',
      cabecera: ['Momento', 'Tipo', 'Cómo está montado', 'Quién aprueba'],
      filas: [
        ['Cada mañana, la bandeja de entrada', '1 (MCP) + 5 (Enrutador)', 'Gmail y HubSpot conectados en claude.ai; subagentes devoluciones y ventas en Claude Code', 'Nadie: solo clasifica y prepara'],
        ['Respuestas a alumnas y leads', '2 (Skills)', 'Skill respuestas-alumnas con su tono; los leads, con el borrador del subagente ventas', 'Marta, antes de enviar'],
        ['Reembolsos', '6 (Humano en el bucle)', 'Envíos en Needs approval en la app; reglas ask en Claude Code', 'Marta, uno a uno'],
        ['Domingo, la newsletter', '2 (Skills)', 'Skill newsletter-semanal', 'Marta, antes de programarla'],
        ['Lunes, ideas de contenido', '4 (En paralelo)', 'Cinco subagentes analista-competencia a la vez', 'Nadie: es investigación'],
        ['Cada trimestre, el taller nuevo', '3 (En cadena)', '`/lanzamiento`: disenador → constructor → promotor', 'Marta, en cada puerta'],
        ['La campaña del taller', '7 (Orquestador)', '`claude --agent director-marketing` con anuncios, redes y branding', 'Marta, el plan final'],
      ],
    },
    { tipo: 'h3', texto: 'La estructura del proyecto' },
    { tipo: 'codigo', titulo: 'La carpeta del negocio de Marta', texto: `come-mejor/
├── CLAUDE.md                        # quién es Marta, su tono, qué no tocar nunca
├── .mcp.json                        # Notion, compartido con su asistente
├── .claude/
│   ├── settings.json                # reglas ask y deny, y el hook de confirmación
│   ├── hooks/
│   │   └── pedir-confirmacion.sh
│   ├── agents/
│   │   ├── devoluciones.md          # tipo 5
│   │   ├── ventas.md                # tipo 5
│   │   ├── analista-competencia.md  # tipo 4
│   │   ├── disenador.md             # tipo 3
│   │   ├── constructor.md           # tipo 3
│   │   ├── promotor.md              # tipo 3
│   │   ├── director-marketing.md    # tipo 7
│   │   ├── anuncios.md              # tipo 7
│   │   ├── redes.md                 # tipo 7
│   │   └── branding.md              # tipo 7
│   └── skills/
│       ├── newsletter-semanal/SKILL.md   # tipo 2
│       ├── respuestas-alumnas/SKILL.md   # tipo 2
│       └── lanzamiento/SKILL.md          # tipo 3
├── politica/devoluciones.md
├── precios/servicios.md
├── marca/guia.md
├── entrada/                         # los correos del día
└── campana/                         # lo que entregan los especialistas`, nota: 'Gmail y HubSpot no están en .mcp.json: Marta los conecta en claude.ai y Claude Code los hereda al entrar con su cuenta.' },
    { tipo: 'h3', texto: 'Una mañana cualquiera' },
    { tipo: 'pasos', items: [
      { titulo: '8:30, la recepcionista', texto: 'Marta abre Claude Code en la carpeta del negocio y lanza el prompt de abajo. Claude lee el correo (tipo 1), clasifica (tipo 5) y deriva a los subagentes devoluciones y ventas; las dudas de alumnas las responde con su skill (tipo 2).' },
      { titulo: '8:40, la revisión', texto: 'Recibe una tabla con los 30 correos clasificados: 4 devoluciones con recomendación, 6 leads con su temperatura, 15 dudas de alumnas con respuesta propuesta y 5 «otros».' },
      { titulo: '8:50, las aprobaciones', texto: 'Marta lee las 4 devoluciones y escribe «aprobar» o «rechazar» en cada una (tipo 6). Cuando Claude va a apuntar los leads en HubSpot, la regla ask le pide permiso y ella lo da.' },
      { titulo: '9:00, a trabajar', texto: 'Los borradores aprobados salen. En media hora ha hecho lo que antes le llevaba la mañana, y no ha salido nada que ella no haya visto.' },
    ] },
    { tipo: 'prompt', titulo: 'La ronda de la mañana', texto: 'Buenos días. Haz la ronda de la mañana:\n1. Busca en mi Gmail los correos de las últimas 24 horas que no sean newsletters ni notificaciones.\n2. Clasifica cada uno en DEVOLUCIÓN, LEAD, DUDA DE ALUMNA u OTROS. Las devoluciones pásalas al subagente devoluciones y los leads al subagente ventas. Las dudas de alumnas respóndelas tú con la skill respuestas-alumnas.\n3. Escribe entrada/hoy.md con una tabla (remitente, categoría, resumen, siguiente paso) y los borradores debajo.\n4. Para y espera. No envíes ningún correo, no ejecutes reembolsos y no toques HubSpot hasta que yo apruebe cada caso.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'Móntalo de uno en uno', texto: 'Marta no montó todo esto en una tarde. Empezó conectando Gmail (tipo 1) y con una skill de respuestas (tipo 2). Cuando eso le funcionó dos semanas seguidas, añadió la recepcionista (tipo 5) y las aprobaciones (tipo 6). El orquestador llegó el tercer mes. Es el consejo de Anthropic llevado a un negocio: lo más simple que funcione, y complejidad solo cuando haga falta.' },
    { tipo: 'p', texto: 'Cuando todo esto funcione y quieras pasárselo a tu asistente o llevarlo a otro proyecto, Claude Code tiene una forma de empaquetarlo: un **plugin** puede llevar juntas skills, subagentes, hooks y servidores MCP, y se instala de una vez.' },

    // ── Lista de comprobación ────────────────────────────────────────────────
    { tipo: 'h2', texto: 'Lista de comprobación' },
    { tipo: 'p', texto: 'Antes de dar por montado cualquier agente, repasa esta lista.' },
    { tipo: 'pasos', items: [
      { titulo: '¿Hace falta un agente?', texto: 'Prueba primero con un solo prompt bien hecho. Si basta, no montes nada más.' },
      { titulo: 'Elige el tipo más simple que sirva', texto: 'Herramientas o skills antes que una cadena; cadena o paralelo antes que un orquestador.' },
      { titulo: 'Conecta solo lo necesario', texto: 'Las apps que use esta tarea, de fuentes de confianza, y nada «por si acaso».' },
      { titulo: 'Escribe descriptions concretas', texto: 'En skills y subagentes: qué hace y cuándo usarlo, con las palabras con las que lo pedirías. Es lo que decide a dónde va cada cosa.' },
      { titulo: 'Fija el formato de entrega', texto: 'Cada agente devuelve siempre lo mismo y en el mismo sitio (un archivo, una tabla). Sin eso no se puede encadenar ni juntar.' },
      { titulo: 'Pon puertas y una salida por defecto', texto: 'Comprobaciones entre pasos y una instrucción clara para lo que no encaja.' },
      { titulo: 'Protege el dinero y a los clientes', texto: 'Needs approval en la app; ask, deny o un hook en Claude Code; canUseTool en el SDK. Nada irreversible sin ti.' },
      { titulo: 'Pon límites', texto: 'Cuántos intentos, cuántos agentes, cuándo parar y avisarte.' },
      { titulo: 'Elige modelo por tarea', texto: 'Uno potente para pensar y coordinar; `haiku` para clasificar y para tareas acotadas.' },
      { titulo: 'Prueba en pequeño', texto: 'Una carpeta de pruebas, tres correos, un competidor. Mira lo que gasta antes de soltarlo en grande.' },
      { titulo: 'Revisa el resultado, no solo que terminó', texto: 'Que acabe sin errores no significa que haya hecho lo que querías.' },
      { titulo: 'Guarda lo que funciona', texto: 'Skills, subagentes y workflows dentro del proyecto y en git, para repetirlo igual y poder volver atrás.' },
    ] },
  ],
  claves: [
    'Un agente es Claude usando herramientas en bucle; un flujo de trabajo sigue pasos que fijas tú. Empieza siempre por lo más simple que funcione.',
    'Los 7 tipos: con herramientas (MCP), con skills, en cadena, en paralelo, enrutador, humano en el bucle y orquestador. No compiten: se combinan.',
    'En la app montas herramientas, skills, un enrutador con skills y las aprobaciones; con Claude Code y el Agent SDK, los siete, con subagentes en `.claude/agents/`.',
    'La `description` manda: decide qué skill se carga y a qué subagente se delega.',
    'Un agente gasta unas 4 veces los tokens de un chat y varios agentes, unas 15 veces: paralelo y orquestador, solo para tareas que lo valgan.',
    'Dinero y clientes, siempre con aprobación real: Needs approval en la app, reglas ask o deny y hooks en Claude Code, canUseTool en el SDK.',
  ],
  fuentes: [
    { texto: 'Building effective agents (Anthropic)', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
    { texto: 'How we built our multi-agent research system (Anthropic)', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
    { texto: 'Claude Code — Connect Claude Code to tools via MCP', url: 'https://code.claude.com/docs/en/mcp' },
    { texto: 'Claude Code — Skills', url: 'https://code.claude.com/docs/en/skills' },
    { texto: 'Claude Code — Subagents', url: 'https://code.claude.com/docs/en/sub-agents' },
    { texto: 'Claude Code — Dynamic workflows', url: 'https://code.claude.com/docs/en/workflows' },
    { texto: 'Claude Code — Permission modes', url: 'https://code.claude.com/docs/en/permission-modes' },
    { texto: 'Claude Code — Configure permissions', url: 'https://code.claude.com/docs/en/permissions' },
    { texto: 'Claude Code — Hooks reference', url: 'https://code.claude.com/docs/en/hooks' },
    { texto: 'Agent SDK — Quickstart', url: 'https://code.claude.com/docs/en/agent-sdk/quickstart' },
    { texto: 'Agent SDK — Subagents', url: 'https://code.claude.com/docs/en/agent-sdk/subagents' },
    { texto: 'Agent SDK — Handle approvals and user input', url: 'https://code.claude.com/docs/en/agent-sdk/user-input' },
    { texto: 'Conectores: primeros pasos (Claude Docs)', url: 'https://www.claude.com/docs/connectors/getting-started' },
    { texto: 'Directorio de conectores de Claude', url: 'https://claude.com/connectors' },
    { texto: 'Using skills in Claude (Soporte de Claude)', url: 'https://support.claude.com/en/articles/12512180-using-skills-in-claude' },
    { texto: 'Usar los conectores de Google Workspace (Soporte de Claude)', url: 'https://support.claude.com/hc/en-us/articles/10166901-use-google-workspace-connectors' },
    { texto: 'Notion MCP — Get started', url: 'https://developers.notion.com/guides/mcp/get-started-with-mcp' },
    { texto: 'HubSpot — Integrate with the remote HubSpot MCP server', url: 'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server' },
  ],
}
