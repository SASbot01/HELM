// Hilo de la sección «Skills y repos», tema «repos». Lead magnet del reel
// «Una IA de 744.000 millones de parámetros en un portátil sin gráfica»
// (comenta OFFLINE). Datos comprobados el 19/11/2026 leyendo el repo:
// - JustVugg/colibri: motor de inferencia en C para modelos MoE enormes,
//   Apache 2.0 (cada modelo conserva su propia licencia), ~52.000★.
// - README: deja en RAM lo que usa cada token, los expertos frecuentes en la
//   GPU si la hay y el resto lo lee del disco. GLM-5.2 a 0,05–0,1 tok/s en frío
//   en un portátil de 25 GB sin GPU; 1,83 tok/s solo CPU en un Ryzen AI Max+
//   395 de 128 GB.
// - docs/quickstart.md: ~16 GB de RAM mínimo, 24 GB+ recomendado; GLM-5.2 int4
//   ocupa ~429 GB; el modelo recomendado para empezar es Qwen3.6-35B-A3B
//   (23 GB, cabe entero en RAM). Instalación: ./start-here.sh (START-HERE.bat
//   en Windows).
// - docs/api.md: `coli serve` da API compatible con OpenAI (/v1/chat/completions)
//   y con Anthropic (/v1/messages); Claude Code con ANTHROPIC_BASE_URL,
//   ANTHROPIC_API_KEY (cualquiera si no pones COLI_API_KEY) y ANTHROPIC_MODEL =
//   el --model-id. Avisa de una espera MUY larga antes del primer token con
//   Claude Code (su prompt y sus herramientas son grandes).
// El cálculo de 33–67 minutos para 200 tokens es propio, con las cifras del README.

const REPO = 'https://github.com/JustVugg/colibri'
const API = `${REPO}/blob/main/docs/api.md`
const QUICK = `${REPO}/blob/main/docs/quickstart.md`

export default {
  slug: 'repo-colibri',
  seccion: 'skills',
  tema: 'repos',
  tipo: 'repo',
  titulo: 'Colibri: una IA de 744.000 millones de parámetros en tu ordenador, sin gráfica',
  gancho: 'IA gigante en local, sin nube',
  resumen: 'Colibri es un motor gratis y de código abierto que hace correr modelos enormes como GLM-5.2 en un ordenador normal: deja en la RAM solo lo imprescindible y va leyendo el resto del disco. Qué es, qué máquina necesitas, cómo instalarlo, cómo conectar Claude Code a tu propio modelo local y por qué de momento es para trastear, no para trabajar.',
  fecha: '2026-11-19',
  lectura: '7 min',
  nota: 'Código abierto (Apache 2.0) de JustVugg, un desarrollador independiente. No es de NVIDIA, OpenAI ni Anthropic. Una vez descargado el modelo, todo corre en tu máquina; la descarga sí necesita internet. Es lentísimo con los modelos grandes: para probar, sí; para el día a día, todavía no.',
  portada: '/aiparatodo/colibri.webp',
  skills: [
    {
      n: '01', clave: 'colibri', nombre: 'Qué es', corto: 'un motor para correr modelos enormes en local',
      titular: 'Un modelo gigante que no cabe en tu RAM… y aun así funciona',
      historia: 'Colibri es un programa que ejecuta en tu ordenador modelos de IA de tipo «mezcla de expertos» (MoE), como GLM-5.2, de 744.000 millones de parámetros. El truco: en estos modelos cada palabra solo usa una parte pequeña del modelo, los «expertos» que tocan. Así que Colibri deja fija en la RAM la parte que se usa siempre (unos 9,9 GB con GLM-5.2), pone en la gráfica los expertos que más se repiten si tienes una, y el resto lo va leyendo del disco cuando hace falta. Como Netflix, que no te descarga la película entera para empezar a verla. Es gratis, de código abierto y lo ha hecho un desarrollador independiente; ya pasa de 50.000 estrellas en GitHub.',
      puedesTitulo: 'Lo que te da',
      puedes: [
        'Modelos enormes funcionando en tu máquina, sin nube ni suscripción',
        'Sin pagar por token: una vez descargado, corre en local (127.0.0.1)',
        'Tu propia API, compatible con la de OpenAI y con la de Anthropic',
        'Conectar Claude Code a tu modelo local',
        'Modelos más pequeños (de 19 a 23 GB) que van bastante más rápido',
      ],
      autor: 'JustVugg', oficial: false, repo: 'JustVugg/colibri', clave_repo: true, github: REPO, licencia: 'Apache 2.0',
      ejemplos: [],
    },
    {
      n: '02', clave: 'requisitos', nombre: 'Qué máquina necesitas', corto: 'RAM, disco y paciencia',
      titular: 'Antes de descargar nada: mira tu RAM y tu disco',
      historia: 'Para GLM-5.2 el repo pide unos 16 GB de RAM como mínimo (24 GB o más recomendado) y unos 430 GB libres en un SSD NVMe rápido: el disco es lo que más manda en la velocidad, porque los expertos se leen de ahí todo el rato. No hace falta gráfica. Si no tienes tanto espacio, empieza por un modelo pequeño: el asistente de instalación recomienda Qwen3.6-35B-A3B, que ocupa 23 GB y cabe entero en la RAM, y Qwen3-Coder-30B-A3B, de 19 GB, para programar.',
      puedes: [
        'RAM: 16 GB mínimo para GLM-5.2, 24 GB o más recomendado',
        'Disco: ~430 GB libres en un SSD NVMe para GLM-5.2 (la versión que recomienda hoy el repo)',
        'Gráfica: opcional; si la tienes, ayuda',
        'Para empezar: Qwen3.6-35B-A3B (23 GB) o Qwen3-Coder-30B-A3B (19 GB)',
      ],
      github: QUICK, autor: 'JustVugg', oficial: false, repo: 'JustVugg/colibri', licencia: 'Apache 2.0',
      ejemplos: [],
    },
    {
      n: '03', clave: 'instalacion', nombre: 'Instalación', corto: 'un script que lo hace todo',
      titular: 'Instálalo con un solo script',
      historia: 'El repo trae un asistente que mira tu ordenador, te recomienda el modelo que cabe, compila o descarga el motor, baja el modelo y abre un panel. En Windows basta con descargar el ZIP del repo, descomprimirlo y hacer doble clic en START-HERE.bat. En Mac y Linux, los comandos de abajo. La próxima vez, vuelve a lanzar ./start-here.sh y arranca sin descargar nada; con --reconfigure cambias de modelo.',
      puedes: [
        'En Mac necesitas antes las herramientas de Apple (xcode-select --install) y Homebrew',
        'En Ubuntu o Debian: sudo apt install git python3 build-essential',
        'Cambiar de modelo: ./start-here.sh --reconfigure',
        'Charlar con el modelo desde el terminal: ./coli chat',
      ],
      sueltaTitulo: 'En Mac (con Homebrew)',
      sueltaNota: 'En Linux cambia la primera línea por la de apt. La descarga del modelo puede tardar horas según tu conexión.',
      suelta: 'brew install libomp git python\ngit clone https://github.com/JustVugg/colibri\ncd colibri\n./start-here.sh',
      ejemplos: [],
    },
    {
      n: '04', clave: 'claude-code', nombre: 'Conectar Claude Code', corto: 'tu propia API local, compatible con Anthropic',
      titular: 'Claude Code hablando con tu modelo local',
      historia: 'Con «coli serve» Colibri levanta un servidor en tu máquina que entiende el mismo idioma que la API de Anthropic (/v1/messages) y que la de OpenAI (/v1/chat/completions). Así puedes apuntar Claude Code a tu modelo local con tres variables de entorno. Un aviso importante de la propia documentación: Claude Code manda un mensaje inicial muy largo (sus instrucciones y sus herramientas), y con un modelo grande leído del disco la espera hasta el primer token puede ser muy larga. Prueba primero con el curl de abajo: si contesta en un minuto o así, todo funciona y el resto de la espera es por el tamaño del mensaje. Con un modelo pequeño se nota mucho menos.',
      puedes: [
        'Arranca el servidor con el nombre de modelo que quieras (--model-id)',
        'ANTHROPIC_BASE_URL apunta a tu máquina; ANTHROPIC_MODEL, al nombre que pusiste',
        'La clave puede ser cualquier texto, salvo que pongas COLI_API_KEY en el servidor',
        'Si vas a abrirlo fuera de tu máquina, pon COLI_API_KEY antes',
      ],
      sueltaTitulo: 'Servidor y Claude Code',
      sueltaNota: 'Cambia la ruta del modelo por la tuya. Las tres primeras líneas en una terminal; las export y claude, en otra.',
      suelta: 'cd colibri/c\n./coli serve --host 127.0.0.1 --port 8000 --model-id glm-5.2-colibri --model /ruta/a/tu/modelo\n\nexport ANTHROPIC_BASE_URL=http://localhost:8000\nexport ANTHROPIC_API_KEY=local\nexport ANTHROPIC_MODEL=glm-5.2-colibri\nclaude',
      github: API, autor: 'JustVugg', oficial: false, repo: 'JustVugg/colibri', licencia: 'Apache 2.0',
      ejemplos: [
        { titulo: 'Prueba rápida antes de abrir Claude Code', texto: 'curl http://127.0.0.1:8000/v1/messages -H \'x-api-key: local\' -H \'content-type: application/json\' -d \'{"model":"glm-5.2-colibri","max_tokens":128,"messages":[{"role":"user","content":"Hola"}]}\'' },
      ],
    },
    {
      n: '05', clave: 'ojo', nombre: 'La pega', corto: 'lentísimo con los modelos grandes',
      titular: 'Para trastear, una pasada. Para trabajar a diario, todavía no',
      historia: 'En el portátil del autor (25 GB de RAM, sin gráfica) GLM-5.2 va a 0,05–0,1 tokens por segundo en frío: un token cada 10–20 segundos. Una respuesta de 200 tokens son unos 33–67 minutos (cálculo nuestro con sus cifras). En un ordenador potente, solo con CPU, llega a unos 1,8 tokens por segundo, y con varias gráficas grandes, a 9. Los modelos pequeños, de 19–23 GB, van a unos 6 tokens por segundo en CPU: ahí sí se puede usar. Y en conversaciones largas cada turno vuelve a pagar todo el contexto.',
      puedes: [
        'GLM-5.2 en un portátil normal: minutos por respuesta',
        'Modelos pequeños: usables en un ordenador corriente',
        'Algunas funciones de la API no están (stop_sequences, imágenes en el mensaje)',
        'Las herramientas solo funcionan con los motores marcados en su tabla de compatibilidad',
      ],
      ejemplos: [],
    },
  ],
}
