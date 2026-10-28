// Hilo de la sección «Skills y repos», tema «repos».
// Harvey (ethanplusai, MIT): agente de ventas autónomo que busca negocios, los
// investiga, les escribe emails en frío y lleva las respuestas, usando la
// suscripción de Claude a través de Claude Code (claude -p). Datos comprobados
// el 15/10/2026 leyendo una copia del repo, sin ejecutarlo y sin historial de
// git: README, CHANGELOG (0.2.1 y 0.3.0, las dos del 13/10/2026; 0.2.0, del
// 13/09/2026), pyproject.toml, harvey.yaml, .env.example, CLAUDE.md,
// Dockerfile, docker-compose.yml y el código de harvey/ (main, brain, config,
// cli, trainer, setup, gate, agentes, collectors, integraciones, dashboard y
// web). Lo que se deduce del código sin ejecutarlo (que el bucle deja de
// prospectar, que los botones del panel no sirven) se dice así. Lo que no se
// puede saber sin ejecutarlo (gasto diario, calidad de los emails, si escribe
// bien en español) se dice como no comprobado. El apartado legal de España
// (LSSI, RGPD, LOPDGDD y Ley General de Telecomunicaciones) no sale del repo:
// es contexto general, no asesoramiento legal.
// Los bloques de terminal no llevan comentarios detrás de una orden: en el zsh
// de serie del Mac (sin interactivecomments) el # no es comentario y todo lo
// que va detrás se le pasaría a la orden como argumentos.

const REPO = 'https://github.com/ethanplusai/harvey'

export default {
  slug: 'repo-harvey',
  seccion: 'skills',
  tema: 'repos',
  tipo: 'repo',
  titulo: 'Harvey: el agente de código abierto que busca clientes con tu Claude Pro o Max',
  gancho: 'Un agente cuyo único trabajo es buscarte clientes',
  resumen: 'Un agente de código abierto que busca negocios, los investiga, les escribe emails en frío y lleva las respuestas con tu suscripción de Claude. Con la instalación paso a paso, el ajuste que tienes que cambiar antes de arrancar, cómo revisar cada email antes de que salga y lo que dice la ley española.',
  fecha: '2026-10-15',
  lectura: '18 min',
  nota: 'Código abierto (MIT) de ethanplusai. Beta (v0.3.0, del 13/10/2026) pensada para EE. UU. y en inglés. Necesitas Python 3.11+, Claude Pro o Max, un buzón en un dominio aparte y, mejor, un verificador de emails. En España, la publicidad por email exige autorización previa, salvo excepciones (LSSI): lee el apartado 09 antes de enviar.',
  portada: '/aiparatodo/harvey.webp',
  skills: [
    {
      n: '01', clave: 'que-es', nombre: 'Qué es', corto: 'un agente de ventas que corre en tu ordenador',
      titular: 'Un comercial autónomo que corre en tu ordenador',
      historia: 'Harvey se presenta como un «agente de ventas autónomo». Encuentra negocios que encajan con lo que vendes, aprende algo concreto de cada uno, les escribe emails en frío que lo mencionan, los envía, lee las respuestas y lleva la conversación hacia una reunión. Corre en tu máquina, en bucle y por su cuenta. Lo que lo hace distinto es que no pagas la API del modelo. Llama a Claude a través de Claude Code con tu suscripción Pro o Max (o, si lo activas, a Codex con tu plan de ChatGPT). Eso, siempre que no tengas ANTHROPIC_API_KEY en el entorno ni en el .env: si la tienes, claude -p la usa y pagas por tokens. Antes, lee las condiciones de uso: las de Claude para cuentas de consumo limitan el uso automatizado fuera de lo que Anthropic permite, y si las incumples arriesgas tu cuenta. Tampoco es gratis del todo: para enviar necesitas un buzón y conviene un verificador de emails. Y es muy nuevo: está en beta y su última versión, la 0.3.0, salió el 13 de octubre de 2026.',
      puedes: [
        'Encontrar negocios de tu cliente ideal: con harvey discover (por defecto OpenStreetMap, gratis) y, dentro del bucle, en DuckDuckGo, Bing, Google, G2, Clutch, Hunter y, si lo activas, LinkedIn',
        'Leer la web de cada empresa y quedarse con algo concreto para personalizar',
        'Escribir una secuencia de 3 emails en frío para cada contacto',
        'Leer las respuestas, clasificarlas y preparar la contestación',
        'Seguir todos tus contactos y envíos en un panel local que se actualiza solo',
        'Usar tu suscripción de Claude en vez de pagar la API por tokens (revisa antes sus condiciones de uso)',
      ],
      autor: 'ethanplusai', oficial: false, repo: 'ethanplusai/harvey', clave_repo: true,
      github: REPO, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '02', clave: 'como-trabaja', nombre: 'Cómo trabaja', corto: 'un latido cada 15 minutos y cinco subagentes',
      titular: 'Un latido cada 15 minutos y cinco subagentes',
      historia: 'Harvey funciona como un latido. Cada 15 minutos (se puede cambiar) se despierta y mira dos cosas: si está en horas de silencio (de 22:00 a 07:00 por defecto) y si le queda margen en tu suscripción. Luego decide qué hacer, lo hace, lo registra y vuelve a dormir. La decisión no la toma la IA: son reglas fijas, con este orden de prioridad: responder, enviar, escribir y prospectar. Prospectar solo toca cuando no queda ningún prospecto pendiente, y el análisis va siempre junto a la prospección. Además, en cada vuelta analiza las webs de hasta 25 empresas y, si envías con Gmail o SMTP, lee el buzón. Los envíos van al final, y solo si antes ha podido leer todas las respuestas. Cada fase del ciclo (los agentes y, después, los envíos) tiene un tope de 10 minutos. Claude solo entra donde hace falta juzgar o escribir: puntuar prospectos, redactar emails y clasificar respuestas.',
      puedes: [
        'Scout (prospección): busca empresas y contactos. A los que saca de buscar empresas y de ofertas de empleo, Claude los puntúa de 1 a 100 (descarta los de menos de 30) y les añade una nota; los que llegan por Hunter, por LinkedIn o de empresas ya descubiertas entran sin puntuar',
        'Writer (redacción): 3 emails, de menos de 75, 75 y 40 palabras cada uno, con esperas de 0, 3 y 4 días',
        'Writer, con Gmail o SMTP: el primer email se escribe para cada persona con datos reales de su empresa',
        'Sender (envío): rellena las variables, programa cada email en el Outbox y aplica controles y límites',
        'Handler (respuestas): clasifica la intención, detecta bajas y rebotes, avanza la conversación y prepara la respuesta',
        'Analyst (análisis): estadísticas del embudo, sin gastar modelo (corre junto a Scout)',
      ],
      ejemplos: [],
    },
    {
      n: '03', clave: 'contactos', nombre: 'De dónde saca los contactos', corto: 'descubrir, investigar, completar y verificar',
      titular: 'De dónde saca los contactos y cómo encuentra los emails',
      historia: 'Los datos pasan por cuatro fases: DISCOVER, PROFILE, ENRICH y VERIFY (el enriquecimiento con registros públicos aún está en la hoja de ruta: los contactos salen de páginas de equipo y de Hunter). Descubrir negocios se hace con harvey discover, por defecto en OpenStreetMap, gratis y sin cuenta. Investigarlos es leer su web —la página de inicio, el robots.txt, el sitemap y las páginas de equipo y de empleo— con reglas fijas, sin gastar modelo. Para el email, Harvey deduce el patrón de direcciones de cada empresa y verifica un solo candidato con Reoon, ZeroBounce o Hunter. Sin ninguna de esas claves, en Google Workspace, Microsoft 365 o tras una pasarela de filtrado, la dirección se queda como «guess» (supuesta) y no se envía. En el resto de dominios prueba el buzón por el puerto 25, si tu red no lo bloquea. Si responde que existe y el dominio no acepta cualquier dirección, lo da por verificado y sí puede enviarse. Antes de descubrir, tú confirmas qué señales cuentan para elegir un buen prospecto: hay un catálogo de 23 y ninguna se recoge hasta que la confirmas. Ojo: esa confirmación solo afecta a descubrir e investigar; la prospección que hace Scout en el bucle no la mira.',
      puedes: [
        'OpenStreetMap: gratis y sin cuenta (la fuente por defecto de harvey discover)',
        'DataForSEO: de pago, con un depósito mínimo de 50 $',
        'Serper (2.500 búsquedas gratis); sin su clave, Scout saca resultados de DuckDuckGo, Bing y Google',
        'Directorios G2 y Clutch, páginas de equipo de cada empresa, Hunter y, si quieres, Indeed (instalando aparte python-jobspy) y LinkedIn (este va contra sus condiciones: apartado 09)',
        'Calcular el gasto antes de buscar (--estimate); el tope de gasto por defecto es 1 $',
        'Sacar a CSV los prospectos con email verificado o «risky» (catch-all) con harvey export',
      ],
      sueltaTitulo: 'Elegir señales y buscar negocios',
      sueltaNota: 'Por orden: ves el catálogo de señales, confirmas las 21 que el repo marca como gratuitas (algunas, como las de registros públicos, todavía no las recoge nada), ves las fuentes con sus precios, calculas lo que costaría sin gastar y buscas. Con OpenStreetMap no gastas nada.',
      suelta: 'harvey signals\nharvey signals --confirm free\nharvey discover --providers\nharvey discover --estimate\nharvey discover',
      ejemplos: [],
    },
    {
      n: '04', clave: 'requisitos', nombre: 'Requisitos', corto: 'Python, tu suscripción, un buzón y un verificador',
      titular: 'Lo que necesitas de verdad (y lo que cuesta)',
      historia: 'El README dice que lo único obligatorio es el proveedor de correo. En la práctica conviene también un verificador: sin él, casi todas las direcciones se quedan sin verificar. El modelo va con tu suscripción de Claude (Pro o Max) y Claude Code con la sesión iniciada. El asistente de instalación habla solo de Max, y el propio repo te pide que revises las condiciones de tu proveedor antes de usarla así. La cuenta del README: tu suscripción, el buzón (unos 7 $ al mes con Google Workspace) y el descubrimiento (0 $ con OpenStreetMap). Lo que está por medir es cuánto gasta de tu suscripción al día. Cada llamada del redactor arrastra unas 740 líneas de instrucciones (683 de skills y 59 de su prompt), más lo que sabe de tu producto. Harvey se frena solo al llegar al 80 % de tu límite. Con Codex también funciona (solo en macOS y Linux, con una versión concreta de su CLI), pero no cambia solo de uno a otro.',
      puedes: [
        'Python 3.11 o superior (en Mac, python3.13: el python3 del sistema es la 3.9 y no sirve; si no lo tienes, brew install python@3.13)',
        'Claude Pro o Max, con Claude Code y la sesión iniciada (claude login), y sin ANTHROPIC_API_KEY en el entorno ni en el .env',
        'Un buzón para enviar: Gmail/Google Workspace (recomendado) o cualquier SMTP + IMAP',
        'Un verificador (gratis hasta un tope, según el repo): Reoon, 600 al mes; ZeroBounce, 100; Hunter, 50 verificaciones y 25 búsquedas',
        'Opcionales: Serper, DataForSEO y Cloudflare para entrenar (unos 5 $ al mes)',
        'Chromium (Playwright) solo si activas LinkedIn',
        'Piden credenciales: Gmail (ID y secreto de cliente OAuth), SMTP/IMAP (usuario y contraseña), Instantly (clave, plan Growth), Reoon, ZeroBounce, Hunter y Serper (claves), DataForSEO (usuario y contraseña de API), Cloudflare (Account ID y token) y LinkedIn (tu email y contraseña)',
        'Claude Code va con tu sesión, y Harvey lee además tu token del Llavero o de ~/.claude/.credentials.json para consultar tu cuota; Codex, con tu sesión de ChatGPT. No piden nada OpenStreetMap, DuckDuckGo, Bing ni Google',
      ],
      ejemplos: [],
    },
    {
      n: '05', clave: 'instalacion', nombre: 'Instalación', corto: 'que te lo instale Claude Code, o a mano',
      titular: 'Instálalo paso a paso',
      historia: 'Hay dos caminos. El fácil: clonas el repo, abres Claude Code dentro y le pides «set up Harvey for me». El repo trae un CLAUDE.md que convierte a Claude Code en asistente de instalación: mira en qué punto estás, instala lo que falta y te pregunta lo que necesita. Pero ese CLAUDE.md está desfasado. En la presentación y los costes da Instantly como forma de envío, aunque en el paso 2 recomienda Gmail. Además crea el entorno con python3 en vez de python3.13, habla de unas 19 señales (son 23) y describe una opción de permisos que ya se quitó. Así que no le dejes hacer sin mirar. El camino manual son los pasos del README, y en el .env van tus claves. Para Gmail: creas un proyecto en Google Cloud, activas la API de Gmail y configuras la pantalla de consentimiento de OAuth (si es de tipo externo, añade tu cuenta como usuario de prueba). Luego sacas un ID de cliente de tipo «Desktop app», lo pegas en el .env y ejecutas harvey gmail auth. Ojo: en ese modo de prueba, Google caduca el permiso a los 7 días y tendrás que repetir harvey gmail auth. Con Google Workspace puedes marcar la app como interna y te lo ahorras. Ese permiso (gmail.modify) deja a Harvey leer, enviar y modificar tus correos, así que usa un buzón dedicado solo a esto.',
      puedes: [
        'Camino fácil: git clone, cd harvey, claude y «set up Harvey for me» (mejor con el prompt de abajo)',
        'Camino manual: entorno con python3.13, pip install -e . y tu .env (el bloque de abajo)',
        'harvey install instala las dependencias y Chromium',
        'Gmail: pantalla de consentimiento y OAuth «Desktop app» en Google Cloud, y después harvey gmail auth',
        'Antes de harvey run, revisa harvey.local.yaml (apartado 06)',
        'Arrancar y parar, desde la terminal: harvey run y Ctrl+C (y harvey dashboard en otra)',
      ],
      autor: 'ethanplusai', oficial: false, repo: 'ethanplusai/harvey',
      github: REPO + '#quick-start', licencia: 'MIT',
      sueltaTitulo: 'Instalar a mano en tu terminal',
      sueltaNota: 'Pégalo entero: se para en nano para que pongas tus claves (Ctrl+O y Enter guardan; Ctrl+X sale) y termina en train a propósito. harvey gmail auth solo hace falta si envías con Gmail. Antes de arrancar, edita harvey.local.yaml (apartado 06): tal como sale del entrenamiento envía por Instantly, sin aprobación. El camino fácil, con Claude Code, está en el prompt de abajo.',
      suelta: '# Si en Mac no tienes Python 3.13, antes: brew install python@3.13\ngit clone https://github.com/ethanplusai/harvey.git\ncd harvey\npython3.13 -m venv .venv && source .venv/bin/activate && pip install -e .\ncp .env.example .env\nnano .env\nharvey gmail auth\nharvey train https://tu-empresa.com\n# Para aquí. Edita harvey.local.yaml, apartado 06, y luego, en dos terminales:\n# harvey dashboard, que abre http://localhost:5555\n# harvey run',
      ejemplos: [
        { titulo: 'Que Claude Code lo instale, con cabeza', texto: 'Instala Harvey siguiendo el README de este repo. Crea el entorno con python3.13, no con python3. Configura Gmail como proveedor de correo, deja require_approval en true y LinkedIn desactivado. Antes de cada paso dime qué vas a hacer, y no ejecutes harvey run hasta que yo te lo diga.' },
      ],
    },
    {
      n: '06', clave: 'configuracion', nombre: 'Tu negocio y tu cliente', corto: 'harvey train y el fichero que manda',
      titular: 'Configúralo con tu negocio y tu cliente ideal',
      historia: 'harvey train con la URL de tu web rastrea hasta 100 páginas y Claude deduce tu producto, tu cliente ideal (sectores, tamaño, cargos y zona), tu competencia y las objeciones típicas. Lo guarda en harvey.local.yaml y en dos ficheros de skills/ (product_knowledge.md y competitive_intel.md). Ese harvey.local.yaml es el que manda: si existe, harvey.yaml no se lee. Y aquí está la trampa. El entrenamiento lo deja con el envío por Instantly y con LinkedIn activado. Con Instantly no hay aprobación ni control previo. Si tienes su clave, las campañas se crean y se activan directamente, y las respuestas salen sin revisión. Si no la tienes, no sale nada y tu Gmail o SMTP no se usa. Además, si no detecta tu zona pone «United States», la zona horaria es la de Nueva York y quien firma se llama «Harvey», con el email harvey@tudominio y el cargo «Business Development». El asistente harvey setup tampoco ayuda: solo pregunta por Instantly. Así que, antes de arrancar, abre harvey.local.yaml y cámbialo a mano. En la zona, pon ciudades, no países: harvey discover busca cada una en un radio de 40 km alrededor de un punto (o usa icp.geo_coordinates con lat,lng,radio). El tono y el estilo se ajustan editando los .md de skills/ y prompts/, que entran enteros en el prompt.',
      puedes: [
        'Cambiar provider de «instantly» a «gmail» (o «smtp») y añadir require_approval: true',
        'Desactivar LinkedIn (enabled: false); aun así, Scout seguirá buscando perfiles suyos en los buscadores, sin iniciar sesión',
        'Poner tu nombre, tu empresa, tu cargo y el email del buzón que autorizas (el repo no aclara qué pasa si no coinciden)',
        'Revisar product e icp: es lo que Claude ha deducido de tu web, corrígelo a mano (en geography, ciudades con su país)',
        'Cambiar la zona horaria a Europe/Madrid para que las horas de silencio sean las tuyas',
        'Ajustar el estilo en skills/*.md, prompts/writer.md y prompts/handler.md (system.md y scout.md no se cargan)',
        'Saber que los campos de la oferta (offer: booking_url, goal…) existen, pero ningún agente los usa todavía',
      ],
      sueltaTitulo: 'Lo que cambias en harvey.local.yaml',
      sueltaNota: 'Son solo las claves que hay que tocar: busca cada una y cambia su valor, sin borrar el resto. require_approval no viene en el fichero del entrenamiento: añádela debajo de provider (por defecto ya es true).',
      suelta: 'persona:\n  name: "Tu nombre"            # por defecto firma «Harvey»\n  company: "Tu empresa"        # revisa lo que dedujo de tu web\n  role: "Tu cargo"             # por defecto, Business Development\n  email: "tu@tu-dominio-de-envio.com"\nicp:\n  geography:\n    - "Madrid, España"         # una ciudad por línea: radio de 40 km\n    - "Valencia, España"\nchannels:\n  email:\n    provider: "gmail"          # el entrenamiento pone "instantly"\n    require_approval: true     # no viene en el fichero: añádela\n    max_daily_sends: 10        # el README aconseja empezar con 10-20\n  linkedin:\n    enabled: false\nusage:\n  quiet_hours:\n    timezone: "Europe/Madrid"  # por defecto, America/New_York',
      ejemplos: [
        { titulo: 'Revisa lo que ha aprendido de ti', texto: 'Abre harvey.local.yaml y explícame en castellano qué ha deducido el entrenamiento de mi producto y de mi cliente ideal. Luego cambia solo esto: provider a gmail, añade require_approval: true debajo de provider, max_daily_sends a 10, LinkedIn desactivado, zona horaria Europe/Madrid, ciudades concretas con su país en geography y la firma con mi nombre, mi empresa, mi cargo y el email de mi buzón de envío. No toques nada más y enséñame los cambios antes de guardar.' },
      ],
    },
    {
      n: '07', clave: 'panel', nombre: 'El panel', corto: 'tus contactos en el navegador, en local',
      titular: 'El panel: todo el proceso en tu navegador',
      historia: 'harvey dashboard abre un panel en http://localhost:5555. Es una web local que se refresca sola preguntando al servidor cada pocos segundos (entre 8 y 20): no es una retransmisión en tiempo real, pero ves cómo avanzan tus contactos sin recargar. Desde ahí revisas lo que ha encontrado y apruebas emails. El panel tiene botones para arrancar y parar, pero según el código no sirven. El de arrancar lanza Harvey sin el subcomando run, así que solo imprime la ayuda. El de parar solo ve lo que arrancó el propio panel. Arráncalo y páralo desde la terminal: harvey run y Ctrl+C. Todo se guarda en una base de datos SQLite en tu ordenador (data/harvey.db). Una advertencia: el panel no tiene usuario ni contraseña. Por defecto solo escucha en tu propia máquina (127.0.0.1); no lo abras a la red.',
      puedes: [
        'Today, Signals y Discover: el día, qué buscas y qué ha encontrado',
        'Companies, Contacts y Campaigns: empresas, personas y secuencias',
        'Outbox: los emails que esperan tu aprobación',
        'Conversations y Activity: las respuestas y lo que ha ido haciendo',
        'Usage, Settings, Controls y Help: consumo, ajustes y controles',
        'Arrancar y parar: mejor desde la terminal, porque los botones del panel no lo hacen bien',
      ],
      sueltaTitulo: 'Ver cómo va',
      sueltaNota: 'status y usage te dan el resumen del embudo y tu cuota en la terminal. harvey dashboard abre el panel en http://localhost:5555 y deja la terminal ocupada mientras está abierto (Ctrl+C lo cierra). En una terminal nueva, entra antes en la carpeta de Harvey y activa el entorno con source .venv/bin/activate: si no, te dirá «command not found: harvey».',
      suelta: 'harvey status\nharvey usage\nharvey dashboard',
      ejemplos: [],
    },
    {
      n: '08', clave: 'controles', nombre: 'Los controles', corto: 'aprobar antes de enviar, filtros y límites',
      titular: 'Nada sale sin tu visto bueno (si usas Gmail o SMTP)',
      historia: 'Por defecto, cada email que Harvey quiere enviar —el primero, los seguimientos y las respuestas— espera en el Outbox hasta que lo apruebas. Lo revisas en el panel con el teclado (A aprueba, R rechaza, J y K para moverte) o desde la terminal. Antes de salir pasa además un control fijo, sin IA. Pero ojo con dos cosas. La primera: la aprobación y ese control solo existen con Gmail o SMTP. Con Instantly no hay ninguno de los dos. La segunda: la aprobación solo cubre los envíos. Sin preguntarte, Harvey rastrea webs y buscadores, prueba servidores de correo por el puerto 25 y gasta créditos de los verificadores. También lee tu buzón (con SMTP, marca como leídos los no leídos), entra en LinkedIn si le das tus credenciales, cancela envíos y marca bajas. No hay un modo de prueba para el envío: para probarlo, lo más prudente es dejar la aprobación puesta y no aprobar nada. Apagar el email (channels.email.enabled: false) no basta para usarlo solo como buscador: el redactor sigue escribiendo, gastando tu suscripción, y según el código el bucle se queda atascado en «enviar». Para sacar listas, usa harvey export.',
      puedes: [
        'Aprobar o rechazar cada email en el Outbox o con harvey outbox (existe --approve-all: no lo uses)',
        'Control previo sin IA: bloquea variables sin rellenar, frases prohibidas, asuntos de más de 90 caracteres y cuerpos de más de 220 palabras',
        'También bloquea el HTML, más de un enlace y las direcciones no verificadas o que no casan con la ficha',
        'Tope diario configurable (max_daily_sends, 50 por defecto); como mucho 8 por ciclo, con 4 a 15 segundos entre uno y otro',
        'Si alguien responde, se cancelan sus seguimientos; las bajas se respetan y no se contestan (detecta palabras en inglés; en español depende del modelo)',
        'Las respuestas que suenan a amenaza legal pasan a una persona. Ojo: sus reglas fijas buscan palabras en inglés (lawyer, GDPR…); «abogado», «AEPD» o «RGPD» dependen del modelo',
        'Se para solo si los rebotes pasan del 5 % (a partir de 10 envíos), o cuando tú quieras con harvey sending pause; las dos cosas, solo con Gmail o SMTP',
        'Se frena al llegar al 80 % de tu ventana de uso de Claude (la de 5 horas o la semanal)',
      ],
      sueltaTitulo: 'Revisar y frenar',
      sueltaNota: 'outbox te enseña la cola; sending pause frena los envíos por Gmail o SMTP (con Instantly no actúa), y export saca a CSV los contactos con email verificado o «risky». Para reanudar: harvey sending resume, que además pone a cero el contador de rebotes. El contador diario de envíos se reinicia a medianoche UTC (la 01:00 o las 02:00 en la España peninsular, según la época del año).',
      suelta: 'harvey outbox\nharvey sending pause\nharvey export',
      ejemplos: [],
    },
    {
      n: '09', clave: 'legal', nombre: 'Antes de enviar en España', corto: 'LSSI, RGPD, Lista Robinson y LinkedIn',
      titular: 'Antes de enviar un solo email en España',
      historia: 'Harvey viene pensado para Estados Unidos. Su README dice que en Europa el email en frío entre empresas necesita un «interés legítimo defendible». En España eso no basta: manda la LSSI. Su artículo 21 prohíbe enviar publicidad por email a quien no la haya pedido o autorizado expresamente. Hay una excepción: que ya sea cliente tuyo, que tengas sus datos de forma lícita y que le ofrezcas productos o servicios de tu empresa parecidos a los que contrató. Y la prohibición también cuenta cuando escribes a empresas, no solo a particulares. El RGPD es otra capa. La ley española (art. 19 LOPDGDD) presume el interés legítimo para tratar el contacto profesional de quien trabaja en una empresa: nombre, cargo y email de trabajo, si es para relacionarte con esa empresa. Pero eso no te da permiso para mandarle publicidad por email: eso lo decide la LSSI. Traducido: un email comercial en frío a quien no te lo ha pedido choca con la ley española, lo mande Harvey o lo mandes tú. La LSSI lo castiga con multas de hasta 30.000 €, y de 30.001 a 150.000 € si el envío es masivo (arts. 38 y 39). Esto es contexto general, no asesoramiento legal: antes de usarlo en serio, consúltalo con un abogado.',
      puedes: [
        'Manda publicidad por email solo a quien te la haya pedido o autorizado expresamente, o a quien ya sea cliente tuyo, sobre productos parecidos a los que contrató',
        'Llamar tampoco es vía libre: desde junio de 2023, las llamadas comerciales necesitan consentimiento u otra base legal del RGPD (art. 66 de la Ley General de Telecomunicaciones). Y un mensaje privado en redes puede contar como comunicación electrónica: si te presentas, que no sea publicidad',
        'En cada email: quién eres, en nombre de qué empresa y que se note que es comercial (art. 20 LSSI), con una dirección de email válida para darse de baja (art. 22: sin ella, el envío está prohibido). Harvey no añade pie ni baja, y el Outbox no deja editar, solo aprobar o rechazar: pídelo en prompts/writer.md y rechaza todo email que salga sin ello',
        'Si los datos salen de su web o los deduce Harvey, el RGPD te obliga a decirle, como tarde en el primer contacto, quién eres, para qué usas sus datos, de dónde los has sacado y cómo oponerse (art. 14). Si se opone, no vuelvas a escribirle',
        'Antes de cualquier marketing directo a quien no te ha dado su consentimiento (emails a clientes, llamadas…), consulta la Lista Robinson y quita a los inscritos (art. 23 LOPDGDD)',
        'Lee tú todas las respuestas en español. Las peticiones de acceso, supresión u oposición hay que contestarlas en un mes, como norma general (art. 12 RGPD)',
        'Ojo con los datos de terceros: Harvey manda a Claude, con tu cuenta, los nombres, cargos, emails y respuestas de tus prospectos. El responsable eres tú. Revisa si tu plan incluye un acuerdo de encargado del tratamiento (art. 28 RGPD) y, en los ajustes de privacidad de Claude, si tus conversaciones se usan para mejorar los modelos',
        'Si envías a quien sí puedes escribir: dominio aparte con SPF, DKIM y DMARC, calienta el buzón 2–4 semanas, empieza con 10–20 al día y para si los rebotes pasan del 3 % (lo aconseja el propio README). Esto evita el spam; no lo hace legal',
        'LinkedIn prohíbe en su Acuerdo de usuario los bots y la extracción automática de perfiles, y puede restringir o cerrar tu cuenta. Es justo lo que hace Harvey con LinkedIn (entra con tu usuario y extrae perfiles): déjalo desactivado. Aun así, Scout busca perfiles de LinkedIn en Google, Bing o DuckDuckGo y los guarda, sin iniciar sesión',
        'Uso más prudente: que Harvey busque e investigue empresas, lo exportas con harvey export y el primer contacto lo haces tú, sin mandar publicidad por email a quien no te la ha pedido. Investigar también es tratar datos personales: guarda solo lo necesario y bórralo si no hay relación',
      ],
      ejemplos: [
        { titulo: 'Primer contacto a mano, con lo que investigó Harvey', texto: 'Te paso los datos de una empresa que he sacado con Harvey [pega el nombre de la empresa, su web y lo que investigó; el email no hace falta]. Escríbeme un mensaje corto de LinkedIn en español para presentarme: quién soy, qué he visto de su negocio y una pregunta abierta. Sin vender, sin enlaces y en menos de 60 palabras. Lo enviaré yo a mano.' },
      ],
    },
    {
      n: '10', clave: 'limites', nombre: 'Lo que no hace', corto: 'límites, pegas y lo que está por medir',
      titular: 'Lo que no hace (y lo que está por medir)',
      historia: 'Lo de llevar la conversación «hasta la reunión» es a medias. Prepara las respuestas y su prompt le pide proponer dos o tres horas concretas. Pero no hay calendario conectado (esa integración está vacía) y tu enlace de reservas no se usa: la reunión la cierras tú. Además, según el código (sin ejecutarlo), Scout solo busca cuando no queda ningún prospecto nuevo. Los que tienen un email sin verificar o inválido, y los perfiles de LinkedIn que guarda sin email, se quedan como nuevos para siempre. Así que, en la práctica, tras la primera ronda el bucle deja de buscar y solo intenta escribir. Para que vuelva a buscar tendrías que limpiar esos prospectos a mano en data/harvey.db. Es una beta: su última versión es del 13 de octubre de 2026 y la 0.2.0, del 13 de septiembre. La documentación va por detrás: el README dice que es la 0.2.1, y ya va por la 0.3.0. Esa 0.2.1 corrigió un fallo de seguridad grave. Antes, Claude se ejecutaba sin la comprobación de permisos sobre texto que no era de fiar, como los emails recibidos. Si usaste una versión anterior con respuestas reales, el propio changelog recomienda revisar tu cuenta. Y sin ejecutarlo no se puede saber cuánto gasta al día, qué calidad tienen sus emails ni si escribe bien en español. Las estadísticas de sus skills no citan fuente.',
      puedes: [
        'LinkedIn solo busca y extrae perfiles (con tu usuario y contraseña, en un navegador invisible); no envía conexiones ni mensajes',
        'Todo está en inglés: prompts, skills y panel; las bajas las detecta por palabras en inglés y un «darme de baja» depende del modelo',
        'Los nombres con tilde o ñ se descartan o se deforman (al construir el email, «José» se queda en «jos»)',
        'OpenStreetMap solo entiende 9 términos de oficios en inglés (roof, plumb, hvac, electric, dentist, lawyer, attorney, contractor, landscap): para SaaS o agencias no sirve',
        'No añade dirección postal, enlace de baja ni cabecera List-Unsubscribe',
        'Su control bloquea frases como «I’m an AI», aunque el README promete que reconocerá ser una IA si se lo preguntan. Si alguien te pregunta si habla con una IA, contesta tú y di la verdad',
        'Contacta con más sitios de los que dice: buscadores, OpenStreetMap, las webs y servidores de correo de los prospectos y una dirección interna no documentada de Anthropic (con tu token de Claude) para leer tu cuota',
        'Docker: trae Dockerfile y docker-compose.yml, pero tal cual no arranca: la imagen no lleva tu .env ni tu harvey.local.yaml y, sin .env, Harvey abre el asistente interactivo, que dentro del contenedor se cierra. El README solo lo menciona de pasada',
      ],
      ejemplos: [],
    },
  ],
}
