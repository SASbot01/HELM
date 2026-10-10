// Hilo de la sección «Skills y repos», tema «repos».
// reverse-api-engineer (kalil0321, MIT): hace ingeniería inversa del tráfico de
// una web y genera un cliente de API. Datos comprobados contra el repo y su
// documentación el 10/10/2026 (README + página del proyecto): instalación
// (uv/pip), modos (manual, agent, engineer, collector), proveedores de captura
// (Playwright MCP, Chrome MCP, Vercel agent-browser), requisitos (Python 3.11+,
// clave de API para el modo agente) y licencia MIT.

const REPO = 'https://github.com/kalil0321/reverse-api-engineer'

export default {
  slug: 'repo-reverse-api-engineer',
  seccion: 'skills',
  tema: 'repos',
  tipo: 'repo',
  titulo: 'Reverse API Engineer: convierte cualquier web en una API para tus agentes',
  gancho: 'Deja de pagar APIs: saca la de cualquier web',
  resumen: 'Un repo de código abierto que hace ingeniería inversa del tráfico de red de una web y te genera un cliente de API listo para tus agentes. Sin abrir DevTools, sin copiar cURL. Con la instalación paso a paso, los cuatro modos y cómo bajar el riesgo de que te baneen.',
  fecha: '2026-10-10',
  lectura: '9 min',
  nota: 'Código abierto (licencia MIT, permite uso comercial) de kalil0321. Necesitas Python 3.11+ y una clave de API para el modo agente. Úsalo solo en webs donde tengas permiso y respeta siempre sus condiciones y su robots.txt.',
  portada: '/aiparatodo/reverse-api-3d.webp',
  skills: [
    {
      n: '01', clave: 'que-es', nombre: 'Qué es', corto: 'convierte el tráfico de una web en un cliente de API',
      titular: 'Convierte el tráfico de una web en un cliente de API',
      historia: 'La idea es sencilla y potente: un navegador —el tuyo o uno que pilota un agente— visita la web y la herramienta captura todo el tráfico de red en un archivo HAR. Después, un modelo lee ese tráfico y escribe un cliente de API que funciona. Así dejas de abrir las DevTools, copiar cURL y montar el cliente a mano. Para tus agentes el cambio es grande: en lugar de navegar la web clic a clic (lento y caro en tokens), llaman directamente a la API que acabas de sacar, y la misma tarea sale en la mitad de tiempo y por la mitad de coste. El autor lo usa, por ejemplo, para automatizar su prospección en LinkedIn y su marketing en Reddit.',
      puedes: [
        'Sacar la API (aunque no sea pública) que hay detrás de una web',
        'Que tus agentes llamen a esa API en vez de navegar a mano',
        'Generar el cliente en Python, JavaScript, TypeScript, Go, Java, C#, PHP, Ruby, C o PowerShell',
        'Reutilizar tus sesiones y cookies usando tu Chrome real (modo chrome-mcp)',
      ],
      autor: 'kalil0321', oficial: false, repo: 'kalil0321/reverse-api-engineer', clave_repo: true,
      github: REPO, licencia: 'MIT',
      ejemplos: [
        { titulo: 'Un objetivo en lenguaje normal', texto: 'fetch all apple jobs from their careers page' },
      ],
    },
    {
      n: '02', clave: 'instalacion', nombre: 'Instalación', corto: 'un comando y listo (Python 3.11+)',
      titular: 'Instálalo en un minuto',
      historia: 'Funciona en Linux, macOS con Apple Silicon y Windows de 64 bits (ya no soporta macOS Intel ni Windows de 32 bits). Se instala con uv o con pip. Si quieres el modo manual —tú navegas y la IA genera el cliente— añade el extra [manual] y los navegadores de Playwright. Para el modo agente necesitas una clave de API del proveedor que elijas (por defecto usa Claude).',
      puedes: [
        'Requisito: Python 3.11 o superior',
        'Modo agente: una clave de API (por defecto, Claude Sonnet)',
        'Modo manual: el extra [manual] + el Chromium de Playwright',
        'Se configura con /settings dentro de la CLI (modelo, SDK, idioma de salida)',
      ],
      sueltaTitulo: 'Instalar en tu terminal',
      sueltaNota: 'La primera línea instala la herramienta. Las de abajo son para el modo manual (tú navegas). Elige uv o pip, no hace falta las dos.',
      suelta: 'uv tool install reverse-api-engineer\n# o con pip:\npip install reverse-api-engineer\n\n# para el modo manual (tú navegas la web):\npip install "reverse-api-engineer[manual]"\nplaywright install chromium',
      ejemplos: [],
    },
    {
      n: '03', clave: 'modos', nombre: 'Los 4 modos', corto: 'manual, agente, engineer y collector',
      titular: 'Cuatro formas de usarlo (cambias con Shift+Tab)',
      historia: 'Arrancas la CLI escribiendo reverse-api-engineer y, dentro, le dices tu objetivo en lenguaje natural. Según cómo quieras capturar, eliges modo. El resultado se guarda en una carpeta ./scripts/ con el nombre de la tarea.',
      puedes: [
        'manual — navegas tú el sitio y la IA genera el cliente con lo que se capturó',
        'agent — un agente captura solo (Playwright, Chrome MCP o la CLI agent-browser de Vercel). Es el modo por defecto',
        'engineer — vuelve a generar el cliente desde una captura anterior, sin navegar otra vez: engineer <run_id>',
        'collector — el agente recopila datos estructurados (JSON/CSV) con búsqueda y descarga de páginas',
      ],
      sueltaTitulo: 'Modo agente desde script (para automatizar)',
      sueltaNota: 'Con --json te devuelve un único JSON por stdout (status, run_id, har_path, script_path, coste). Útil para encadenarlo en tus flujos.',
      suelta: 'reverse-api-engineer agent --prompt "capture the public jobs api" \\\n  --url https://example.com/jobs --json | jq\n\n# ver ejecuciones pasadas y reusar una:\nreverse-api-engineer list --json\nreverse-api-engineer run <run_id> --file api_client.py --no-interactive',
      ejemplos: [
        { titulo: 'Pídele la API que quieras', texto: 'Arranca reverse-api-engineer, elige el modo agente y dile: «captura la API pública de ofertas de empleo de esta web [pega la URL]». Deja que navegue, y cuando termine revisa el cliente que te ha generado en ./scripts/ antes de usarlo.' },
      ],
    },
    {
      n: '04', clave: 'captura', nombre: 'De dónde captura', corto: 'Playwright, tu Chrome real o agent-browser',
      titular: 'Playwright, tu Chrome real o agent-browser',
      historia: 'En modo agente hay tres proveedores de captura. El que marca la diferencia para webs con login (LinkedIn, Reddit y compañía) es chrome-mcp: usa tu Chrome de verdad, así que conserva tus sesiones y cookies y no tienes que volver a iniciar sesión ni resolver captchas desde cero. Funciona mejor cuando ya tienes flujos en los que tus agentes usan el navegador: conviertes esas acciones en llamadas a la API y la tarea se acelera.',
      puedes: [
        'auto (por defecto) — Playwright MCP, un flujo para navegar y hacer la ingeniería inversa',
        'chrome-mcp — tu Chrome real; conserva sesiones y cookies (necesita Chrome 146+ y Node 20.19+)',
        'agent-browser — la CLI de Vercel; si no está, la instala con npm o la lanza con npx',
      ],
      autor: 'kalil0321', oficial: false, repo: 'kalil0321/reverse-api-engineer',
      github: REPO + '#modes', licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '05', clave: 'baneo', nombre: 'Reducir el baneo', corto: 'navega como un humano y ve despacio',
      titular: 'Cómo reducir el riesgo de que te baneen',
      historia: 'El propio repo avisa: las webs con detección agresiva de bots pueden bloquear la captura o pedir interacción manual. La clave no es «esconderte», es no comportarte como un bot abusivo. Si usas tu Chrome real ya logueado (chrome-mcp), para la web eres tú de siempre, no una sesión nueva y sospechosa. Captura una sola vez y luego reutiliza el cliente generado (modo engineer) en lugar de volver a navegar una y otra vez: cada pasada de más es una papeleta para que te marquen. Y sobre todo: hazlo a volumen humano y solo donde tengas permiso.',
      puedes: [
        'Usa chrome-mcp con tu sesión real ya iniciada: pareces un usuario normal, no un bot recién llegado',
        'Captura una vez y reutiliza el cliente (modo engineer); no repitas la navegación sin necesidad',
        'Ve despacio y a poca cantidad: nada de barrer miles de páginas de golpe',
        'Respeta el robots.txt, los límites y las condiciones de cada web; si un sitio lo prohíbe, no insistas',
        'Úsalo solo en webs donde tengas permiso, y revisa el cliente que genera antes de ejecutarlo',
      ],
      ejemplos: [],
    },
    {
      n: '06', clave: 'salidas', nombre: 'Qué genera', corto: 'un cliente de API listo para usar',
      titular: 'Qué te deja al terminar',
      historia: 'Al acabar tienes un cliente de API de verdad, no un apaño: la carpeta ./scripts/{nombre}/ con api_client.py, su README.md y un example_usage.py, más una copia permanente en ~/.reverse-api/runs/. Si usas el modo collector, en vez de un cliente te deja los datos ordenados en ./collected/ (items.json, items.csv y un README). Como el código se ejecuta en tu máquina a través de Claude Code, revísalo siempre antes de lanzarlo.',
      puedes: [
        'Un cliente completo: api_client.py + README.md + example_usage.py',
        'Una copia permanente de cada ejecución en ~/.reverse-api/runs/',
        'Modo collector: items.json e items.csv listos para usar',
        'El idioma de salida lo eliges tú (Python por defecto)',
      ],
      ejemplos: [],
    },
  ],
}
