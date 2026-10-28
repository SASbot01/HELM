// Hilo de la sección «Skills y repos», tema «repos». Lead magnet del reel
// «Deja de pagar ElevenLabs» (comenta VOZ).
// VoiceStudio (debpalash, AGPL-3.0): clonación y diseño de voz, doblaje,
// dictado, transcripción y audiolibros, en local. Datos comprobados contra el
// repo y su documentación el 24/10/2026 (README + docs/mcp.md +
// docs/speech-platform.md): ~83.500 estrellas, licencia AGPL-3.0, «646 idiomas»
// (cifra del propio proyecto), motor por defecto basado en k2-fsa/OmniVoice,
// requisitos por plataforma, instalación, MCP en localhost:3900/mcp/ y sus
// herramientas. Los forks (aronken, shuv1337, tbalt88…) son copias: el bueno es
// debpalash/VoiceStudio.

const REPO = 'https://github.com/debpalash/VoiceStudio'

export default {
  slug: 'repo-voicestudio',
  seccion: 'skills',
  tema: 'repos',
  tipo: 'repo',
  titulo: 'VoiceStudio: clona tu voz gratis y en tu ordenador (adiós a ElevenLabs)',
  gancho: 'Deja de pagar ElevenLabs',
  resumen: 'La alternativa de código abierto a ElevenLabs que funciona en tu propio ordenador: clona tu voz con un audio corto, diseña voces nuevas, dobla vídeos y crea audiolibros. Y trae servidor MCP, así que Claude Code lo usa desde el chat. Instalación paso a paso y cómo conectarlo.',
  fecha: '2026-10-24',
  lectura: '8 min',
  nota: 'Código abierto (licencia AGPL-3.0) de debpalash, con unas 83.500 estrellas en GitHub. Funciona en local: tus audios no salen de tu ordenador. Clona solo tu voz o la de alguien que te haya dado permiso.',
  portada: '/aiparatodo/voicestudio.webp',
  skills: [
    {
      n: '01', clave: 'que-es', nombre: 'Qué es', corto: 'un ElevenLabs gratis que corre en tu ordenador',
      titular: 'Un ElevenLabs gratis que corre en tu ordenador',
      historia: 'VoiceStudio es una app de escritorio de código abierto que hace casi todo lo que pagas en ElevenLabs, pero en tu máquina y sin cuota mensual. Le das una grabación corta y limpia de tu voz y la clona: mismo timbre, misma forma de hablar. Con esa voz le haces leer locuciones, historias o un audiolibro entero. También diseña voces que no existen a partir de una descripción, dobla vídeos con la voz sincronizada, dicta y transcribe. El proyecto dice cubrir 646 idiomas; el motor que trae por defecto está basado en OmniVoice (de k2-fsa), y puedes cambiar a otros motores desde su catálogo.',
      puedes: [
        'Clonar tu voz a partir de un audio corto y limpio',
        'Diseñar voces nuevas describiéndolas: género, edad, acento y tono',
        'Locuciones, historias y audiolibros completos con tu voz (también por lotes)',
        'Doblar un vídeo con la voz a tiempo, dictar con un widget flotante y transcribir audio',
        'Una API local y un servidor MCP para que tus agentes lo usen',
      ],
      autor: 'debpalash', oficial: false, repo: 'debpalash/VoiceStudio',
      github: REPO, licencia: 'AGPL-3.0',
      ejemplos: [],
    },
    {
      n: '02', clave: 'instalacion', nombre: 'Instalación', corto: 'un comando o el instalador de tu sistema',
      titular: 'Instálalo con un comando',
      historia: 'Va mejor con tarjeta gráfica: en Windows y Linux usa una NVIDIA (CUDA) y en los Mac con chip Apple (M1, M2, M3…) usa la aceleración de Apple. Sin gráfica también funciona, pero más lento; en ese caso instala una versión ligera que ocupa unos 5 GB. En los Mac antiguos con Intel solo funciona la interfaz, conectada a un VoiceStudio que corra en otro ordenador. Si no quieres terminal, en la página de Releases del repo tienes el instalador de cada sistema: .dmg para Mac, .exe para Windows y .AppImage o .deb para Linux.',
      puedesTitulo: 'Requisitos',
      puedes: [
        'NVIDIA en Windows o Linux: aceleración CUDA',
        'Mac con chip Apple: aceleración Metal (MPS)',
        'Sin gráfica: funciona en el procesador, más lento (unos 5 GB de disco)',
        'Mac con Intel: solo la app, conectada a un backend remoto',
      ],
      sueltaTitulo: 'Instalar en tu terminal',
      sueltaNota: 'La primera línea es para Mac y Linux; la segunda, para Windows (en PowerShell). Elige la tuya, no hace falta las dos.',
      suelta: '# Mac y Linux:\ncurl -fsSL https://voicestudio.sh/install | sh\n\n# Windows (PowerShell):\nirm https://voicestudio.sh/install | iex',
      ejemplos: [],
    },
    {
      n: '03', clave: 'clonar', nombre: 'Clonar tu voz', corto: 'una grabación limpia y listo',
      titular: 'Clona tu voz con un audio corto',
      historia: 'Abre la app, crea una voz nueva y súbele una grabación tuya de referencia. La calidad del clon depende casi entera de esa grabación: unos segundos bien grabados valen más que un minuto con ruido. Graba en una habitación sin eco, con el micro cerca, hablando como hablas normalmente y sin música de fondo. A partir de ahí eliges esa voz, escribes el texto y te devuelve el audio. Si el resultado suena raro, casi siempre se arregla cambiando la grabación de referencia, no tocando ajustes.',
      puedesTitulo: 'Consejos',
      puedes: [
        'Usa una grabación limpia: sin música, sin eco y sin otras voces',
        'Habla con tu tono normal; el clon copia también cómo lo dices',
        'Guarda cada voz como perfil y reutilízala en todos tus proyectos',
        'Para textos largos (un audiolibro), usa los trabajos por lotes',
      ],
      ejemplos: [
        { titulo: 'Tu primera locución', texto: 'Hola, soy yo, pero no he grabado esto: lo ha leído VoiceStudio con mi voz, en mi ordenador y sin pagar nada. Si me sigues desde hace tiempo, dime en comentarios si notas la diferencia.' },
      ],
    },
    {
      n: '04', clave: 'disenar', nombre: 'Diseñar voces', corto: 'voces nuevas a partir de una descripción',
      titular: 'Crea voces que no existen',
      historia: 'Además de clonar, puedes describir la voz que quieres —por ejemplo, una mujer de unos 40 años, con tono cálido y ritmo pausado— y VoiceStudio la diseña. Sirve para los personajes de un audiolibro, para el narrador de tus vídeos o para tener varias voces distintas en un mismo proyecto sin pedirle a nadie que grabe. Ojo con un detalle de su documentación: si en la descripción solo pones palabras que no sabe traducir a rasgos de voz, la rechaza. Para saber qué entiende, prueba antes la descripción con describe_voice (desde Claude Code): te dice qué rasgos ha reconocido y qué palabras se ha saltado, sin guardar nada.',
      puedes: [
        'Describir la voz por género, edad, acento y tono',
        'Tener un narrador y varios personajes en el mismo proyecto',
        'Doblar un vídeo a otro idioma con la voz sincronizada',
        'Guardar recetas reutilizables y carpetas vigiladas que procesan solas lo que dejes dentro',
      ],
      ejemplos: [
        { titulo: 'Una voz de narrador', texto: 'Hombre de unos 50 años, voz grave y cálida, ritmo pausado, como un narrador de documental.' },
      ],
    },
    {
      n: '05', clave: 'claude-code', nombre: 'Con Claude Code', corto: 'su servidor MCP: Claude lo usa desde el chat',
      titular: 'Que Claude Code hable con tu voz',
      historia: 'VoiceStudio trae un servidor MCP dentro: en cuanto la app está abierta, escucha en http://localhost:3900/mcp/ (con la barra final). Lo conectas una vez a Claude Code y a partir de ahí, desde el chat, Claude puede leer un texto con tu voz, clonar una voz nueva, diseñar otra o transcribir un audio. Desde la sección Integraciones de la propia app puedes exportar también el archivo .mcp.json ya preparado. Un truco de su documentación: si pones OMNIVOICE_MCP_OUTPUT_MODE=files, el audio se guarda como archivo en vez de pasarse entero por el chat, y no te come contexto.',
      puedes: [
        'generate_speech — convierte texto en audio (WAV; OGG/Opus si tienes ffmpeg)',
        'clone_voice — crea una voz a partir de un audio de referencia',
        'describe_voice y design_voice — diseña voces a partir de una descripción',
        'transcribe — pasa un audio a texto',
        'list_voices, list_languages, check_health — ver voces, idiomas y el estado (y la gráfica que usa)',
      ],
      autor: 'debpalash', oficial: false, repo: 'debpalash/VoiceStudio',
      github: REPO + '/blob/main/docs/mcp.md', licencia: 'AGPL-3.0',
      sueltaTitulo: 'Conectarlo a Claude Code',
      sueltaNota: 'En tu terminal, con VoiceStudio abierto. Si cambiaste el puerto, cambia 3900 por el tuyo. Luego reinicia Claude Code.',
      suelta: 'claude mcp add --transport http voicestudio http://localhost:3900/mcp/',
      ejemplos: [
        { titulo: 'Locución con tu voz', texto: 'Con VoiceStudio, lee este guion con mi voz clonada y guárdalo como archivo de audio en la carpeta del proyecto: [pega tu guion]' },
        { titulo: 'Transcribir y resumir', texto: 'Transcribe con VoiceStudio el audio reunion.wav y hazme un resumen con las tareas que salen, quién las hace y para cuándo.' },
      ],
    },
    {
      n: '06', clave: 'ojo', nombre: 'Ojo antes de usarlo', corto: 'licencia AGPL y voces con permiso',
      titular: 'Dos cosas antes de usarlo',
      historia: 'La primera es legal: clona solo tu voz o la de alguien que te haya dado permiso por escrito. Usar la voz de otra persona sin su consentimiento puede meterte en un lío, y en contenido publicado deberías avisar de que la voz está hecha con IA. La segunda es la licencia: es AGPL-3.0. Para usarlo tú, en tu ordenador y para tus vídeos, no tienes que hacer nada. Pero si lo modificas y lo ofreces como servicio a otros a través de internet, la AGPL te obliga a publicar el código de esos cambios. Y un detalle técnico: dentro de tu ordenador su API no pide contraseña; si lo abres a la red, protégelo con su clave de API y úsalo solo en una red de confianza.',
      puedesTitulo: 'Antes de usarlo',
      puedes: [
        'Clona solo voces con permiso (la tuya o con consentimiento por escrito)',
        'Avisa cuando publiques audio hecho con IA',
        'Uso personal y para tus vídeos: libre; ofrecerlo modificado como servicio: AGPL',
        'No lo expongas a internet sin clave de API y sin una red de confianza',
      ],
      ejemplos: [],
    },
  ],
}
