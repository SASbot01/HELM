// Hilo de la sección «Skills y repos», tema «automatización». Lead magnet del
// reel «Claude acaba de lanzar Claude Apps» (comenta APPS), publicado el
// 27/11/2026. Guía de Silvestre AI: qué es «Instalar como aplicación», los
// pasos, los permisos y 12 apps con su prompt.
// Fuentes comprobadas el 27/11/2026:
// - Ayuda de Claude, «Instalar un artefacto como aplicación» (en español): los
//   nombres de los menús y de los permisos salen de ahí, no de la app.
// - Anuncio de Anthropic, «Turn artifacts into Mac and Windows apps»
//   (24/11/2026), y las notas de versión de ese día.
// Lo que NO dicen esas páginas y por eso no se afirma aquí: cómo guarda sus
// datos una app instalada entre un día y otro.
// «Claude Apps» no es el nombre de la función: es la carpeta donde quedan las
// apps instaladas. La función se llama «Instalar como aplicación».
// Los 12 prompts están escritos a partir de lo que la ayuda dice que una app
// puede hacer; no se han ejecutado uno a uno en la app de escritorio.

const AYUDA = 'https://support.claude.com/es/articles/18516354-install-an-artifact-as-an-app'
const ANUNCIO = 'https://claude.com/resources/articles/install-as-app'

const TELEPROMPTER = 'Hazme un teleprompter como artefacto. Pego mi guion y el texto sube solo, en letra grande y blanca sobre fondo oscuro. Quiero un botón de empezar y pausar (también con la barra espaciadora), control de velocidad, control del tamaño de letra y modo espejo. La ventana tiene que ser estrecha, para ponerla justo debajo de la cámara, y flotar siempre por encima del resto de ventanas.'
const CRONOMETRO = 'Hazme un cronómetro de grabación en una ventana pequeña que flote por encima de las demás. Un botón grande de empezar y parar, y otro de «marca»: cada vez que lo pulso, apunta el minuto y el segundo exactos y me deja escribir una nota corta (por ejemplo, «toma buena» o «repetir»). Al terminar, un botón que copie todas las marcas como lista, para pegarlas en mis notas de edición.'
const BLOC = 'Hazme un bloc de ideas en una ventana pequeña que flote por encima de las demás. Escribo una idea, pulso Intro y se añade arriba de la lista con la fecha y la hora. Quiero poder marcar una idea como usada, borrarla y buscar entre todas. Añade un atajo de teclado que funcione desde cualquier aplicación para traer la ventana al frente con el cursor ya en la caja de texto. Guarda las ideas para que sigan ahí cuando cierre y vuelva a abrir la app, y pon un botón para copiarlas todas.'

const POMODORO = 'Crea un temporizador Pomodoro que viva en mi barra de menús. Bloques de 25 minutos de trabajo y 5 de descanso, con un descanso largo de 15 cada cuatro bloques. En el icono de la barra quiero ver los minutos que quedan. Al terminar cada bloque, avísame con una notificación. Dentro de la ventana, un contador de los bloques que llevo hoy.'
const HORAS = 'Hazme un contador de horas por cliente que viva en la barra de menús. Tengo una lista de clientes que puedo editar. Elijo uno, le doy a empezar y cuenta el tiempo; al parar, guarda la sesión con la fecha y me deja añadir una nota. Quiero ver el total de horas por cliente de esta semana y de este mes, y un botón para copiar el resumen del mes. En el icono de la barra, el cliente que está en marcha y el tiempo que lleva. Guarda los datos para que sigan ahí cuando cierre y vuelva a abrir la app.'
const DESCANSOS = 'Crea una app pequeña que me recuerde levantarme y estirarme. Yo elijo cada cuántos minutos (por defecto, 50) y en qué horario (por defecto, de 9 a 19 h, de lunes a viernes). Cuando toque, mándame una notificación con un estiramiento distinto cada vez, explicado en una frase. Que viva en la barra de menús, con un botón para pausar los avisos durante una hora.'

const PRESUPUESTOS = 'Hazme una calculadora de presupuestos para mi servicio: [describe tu servicio y cómo cobras: por horas, por proyecto, por pieza…]. Quiero añadir conceptos con cantidad y precio, aplicar un descuento, elegir el IVA y ver el total. Con un botón, que me genere el texto del presupuesto listo para copiar y pegar en un correo, en español de España y con los importes en euros. Guarda mis conceptos habituales para no escribirlos cada vez.'
const TABLERO = 'Hazme un tablero de tareas con tres columnas: Por hacer, En curso y Hecho. Añado una tarea escribiendo y pulsando Intro, y la muevo de columna arrastrándola. Cada tarea puede llevar una etiqueta de color y una fecha límite; las que vencen hoy, resaltadas. Arriba, un filtro por etiqueta. Guarda el tablero para que siga igual cuando cierre y vuelva a abrir la app.'
const PALETA = 'Hazme una herramienta de paletas de color. Pego hasta seis colores en hexadecimal y me enseña todas las combinaciones de texto sobre fondo, con su contraste según WCAG y una marca clara de si aprueba el nivel AA para texto normal y para texto grande. Si una combinación suspende, que me proponga el tono más cercano que sí aprueba. Botón para copiar la paleta como variables CSS.'
const HABITOS = 'Hazme un seguimiento de hábitos. Añado los hábitos que quiera (por ejemplo, «grabar un vídeo» o «30 minutos de lectura») y cada día marco los que he hecho. Quiero ver la semana en una fila de siete casillas por hábito, la racha actual de cada uno y el porcentaje del mes. Diseño limpio y con poco color. Guarda los datos para que sigan ahí cuando cierre y vuelva a abrir la app.'

const REESCRITOR = 'Hazme una app que reescriba textos con mi tono usando Claude. Arriba pego dos o tres textos míos de ejemplo, que se quedan guardados como referencia. Debajo pego cualquier texto y elijo para qué es: correo, publicación de LinkedIn, descripción de un reel o mensaje de WhatsApp. Al pulsar «Reescribir», que Claude me devuelva el texto con mi forma de escribir, sin inventar datos que no estén en el original, y con un botón para copiarlo.'
const IDEAS = 'Hazme una app que ordene mis ideas de contenido usando Claude. Pego una lista de ideas, una por línea, y al pulsar «Ordenar» Claude me devuelve una tabla: la idea, el formato que mejor le va (reel, carrusel, vídeo largo o correo), el gancho en una frase y una nota del 1 al 5 de lo fácil que es de grabar. Quiero poder ordenar la tabla por cualquier columna y copiarla.'

export default {
  slug: 'guia-claude-apps',
  seccion: 'skills',
  tema: 'automatizacion',
  tipo: 'guia',
  titulo: 'Instala lo que te hace Claude como una app de tu ordenador: los pasos y 12 apps para construir hoy',
  gancho: 'De chat a aplicación',
  resumen: 'Claude ya deja instalar en tu ordenador lo que te construye en un chat: la opción se llama «Instalar como aplicación» y le da a tu artefacto su propia ventana y su propio icono, en Mac y en Windows. Aquí tienes los pasos para instalar la primera, los cinco permisos que te puede pedir (y cuál no dar a la ligera) y 12 apps con su prompt para construirlas hoy: teleprompter, Pomodoro, contador de horas, presupuestos, tablero de tareas y más.',
  fecha: '2026-11-27',
  lectura: '9 min',
  nota: 'Guía de Silvestre AI sobre una función oficial de Anthropic, en beta desde el 24 de noviembre de 2026. Datos comprobados el 27/11/2026 en la ayuda de Claude y en el anuncio de Anthropic. Necesitas la app de escritorio de Claude (Mac o Windows); vale cualquier plan, también el gratuito. Anthropic no revisa las apps antes de que las instales.',
  portada: '/aiparatodo/claude-apps.webp',
  instalarTodo: null,
  skills: [
    {
      n: '01', clave: 'que-es', nombre: 'Qué es', corto: 'de un artefacto en un chat a una app con su icono',
      titular: 'De un chat a una app con su ventana y su icono',
      historia: 'Hasta ahora, lo que Claude te construía en un chat (un artefacto: una calculadora, un temporizador, un tablero) se quedaba dentro del chat. Desde el 24 de noviembre de 2026 lo puedes instalar en tu ordenador: en el menú del artefacto aparece «Instalar como aplicación» y, al confirmarlo, pasa a tener su propia ventana y su propio icono y se abre como cualquier otra app. Un detalle de nombres: no hay un producto que se llame «Claude Apps». Así se llama la carpeta donde quedan instaladas. No hace falta saber programar: la app se la describes a Claude y la cambias hablando con él.',
      puedesTitulo: 'Lo que necesitas',
      puedes: [
        'La app de escritorio de Claude para Mac o Windows, en la versión 6.28899.0 o posterior',
        'Cualquier plan, también el gratuito: está en beta y se va activando poco a poco',
        'Internet y la sesión iniciada en Claude: sin conexión, las apps no abren',
        'No funciona en el navegador, en el móvil ni en Linux',
      ],
      web: { nombre: 'Ayuda de Claude', detalle: 'Instalar un artefacto como aplicación', url: AYUDA, boton: 'Abrir la ayuda' },
      ejemplos: [],
    },
    {
      n: '02', clave: 'instalar', nombre: 'Instalar la primera', corto: 'cinco pasos, de la actualización al icono',
      titular: 'Instala tu primera app en cinco pasos',
      historia: 'Uno: actualiza la app de escritorio. En Mac, menú Claude > Buscar actualizaciones; en Windows, botón ☰ > Ayuda > Buscar actualizaciones. Dos: abre un chat y pídele a Claude lo que quieres con uno de los prompts de abajo. Tres: pruébalo dentro del chat y pídele cambios hasta que te convenza. Cuatro: con el artefacto abierto, haz clic derecho sobre él (también vale el menú de su título o el de Compartir) y elige «Instalar como aplicación»; si tienes Claude en inglés, «Install as app». Cinco: Claude te pide confirmación, pulsas «Instalar» y la app se abre en su propia ventana. En Mac queda en la carpeta Claude Apps, dentro de Aplicaciones de tu carpeta de usuario, y la encuentras también con Spotlight. En Windows, en la carpeta Claude Apps del menú de inicio o en un acceso directo del escritorio.',
      puedesTitulo: 'Después de instalarla',
      puedes: [
        'Dejarla en el Dock (Mac): con la app abierta, clic derecho en su icono > Opciones > Mantener en el Dock. No se ancla sola',
        'Cambiarla: editas el artefacto en el chat y la app instalada se actualiza',
        'Verlas todas: en la app de Claude, Archivo > Aplicaciones',
        'Quitarla: Archivo > Aplicaciones, eliges la app y pulsas Desinstalar. El artefacto no se borra: sigue en tu chat',
      ],
      web: { nombre: 'Anuncio de Anthropic', detalle: '24 de noviembre de 2026, en inglés', url: ANUNCIO, boton: 'Leer el anuncio' },
      ejemplos: [],
    },
    {
      n: '03', clave: 'permisos', nombre: 'Los permisos', corto: 'cinco, y uno que no se da a la ligera',
      titular: 'Qué puede tocar una app en tu ordenador',
      historia: 'Recién instalada, la app puede hacer lo mismo que hacía dentro del chat, incluido usar Claude y tus conectores si el artefacto ya los usaba. Todo lo demás te lo tiene que pedir, y tú contestas «Permitir» o «No permitir». Los permisos son cinco. Notificaciones. Atajos de teclado, que funcionan aunque estés en otra aplicación. Flotar sobre otras ventanas, que además deja a la app saber dónde está el cursor. Un elemento en la barra de menús de Mac o un icono en la bandeja de Windows. Y el quinto, que es otra liga: acceso completo al ordenador. Con él, la app puede ejecutar programas y leer, cambiar o borrar tus archivos sin preguntarte cada vez. Anthropic no revisa las apps antes de que las instales, así que el filtro eres tú. Claude pone un primer freno: en los planes individuales, normalmente no deja que una app pida acceso completo si parte de ella la ha escrito otra persona. Y un «Permitir» vale solo para esa versión: cada vez que la app cambia, aunque el cambio lo hayas hecho tú, te lo vuelve a preguntar.',
      puedesTitulo: 'Mi regla con los permisos',
      puedes: [
        'Acceso completo, solo a apps que hayas hecho tú y solo si de verdad lo necesitan',
        'Las 12 apps de esta guía están pensadas para no necesitarlo: si alguna te lo pide, di que no y pregúntale a Claude para qué lo quiere',
        'Revisar o quitar permisos: en Mac, clic en el nombre de la app en la barra de menús > Permisos; en Windows, clic derecho en la barra de título > Permisos',
        'Quitar el acceso completo no deshace lo que la app ya haya cambiado',
        'Si una app carga código de otra web, ese código puede cambiar sin que te vuelva a pedir permiso',
      ],
      ejemplos: [],
    },
    {
      n: '04', clave: 'flotan', nombre: 'Apps que flotan', corto: 'teleprompter, cronómetro de grabación y bloc de ideas',
      titular: 'Tres apps que flotan por encima de todo',
      historia: 'Son ventanas pequeñas que se quedan encima de lo que estés haciendo, así que te pedirán el permiso «Flotar sobre otras ventanas». El teleprompter es la app del reel: lees el guion mirando a cámara mientras te grabas. El cronómetro marca en qué minuto está cada toma buena, para no buscarla luego en edición. Y el bloc aparece con un atajo de teclado, apuntas la idea y sigues con lo tuyo; ese te pedirá también el permiso de atajos.',
      puedesTitulo: 'Qué te llevas',
      puedes: [
        'Un teleprompter con velocidad, tamaño de letra y modo espejo',
        'Un cronómetro que apunta el minuto exacto de cada toma',
        'Un bloc de ideas que sale con un atajo desde cualquier aplicación',
        'Permisos que piden: flotar sobre otras ventanas y, el bloc, atajos de teclado',
      ],
      ejemplos: [
        { titulo: '1 · Teleprompter flotante', texto: TELEPROMPTER },
        { titulo: '2 · Cronómetro de grabación', texto: CRONOMETRO },
        { titulo: '3 · Bloc de ideas con atajo', texto: BLOC },
      ],
    },
    {
      n: '05', clave: 'barra-de-menus', nombre: 'Apps de barra de menús', corto: 'Pomodoro, horas por cliente y descansos',
      titular: 'Tres apps que viven en la barra de menús',
      historia: 'En Mac aparecen arriba, junto al reloj; en Windows, en la bandeja del sistema. Están siempre a un clic y no ocupan sitio. El temporizador Pomodoro es el ejemplo que pone la propia Anthropic en su ayuda. Estas apps siguen funcionando aunque cierres su ventana: para salir del todo, Cmd+Q en Mac o «Salir» en el menú del icono en Windows.',
      puedesTitulo: 'Qué te llevas',
      puedes: [
        'Un Pomodoro que te avisa al acabar cada bloque',
        'Un contador de horas por cliente, con el total de la semana y del mes',
        'Un recordatorio para levantarte y estirarte, en tu horario',
        'Permisos que piden: elemento en la barra de menús (o icono en la bandeja) y notificaciones',
      ],
      ejemplos: [
        { titulo: '4 · Temporizador Pomodoro', texto: POMODORO },
        { titulo: '5 · Contador de horas por cliente', texto: HORAS },
        { titulo: '6 · Recordatorio de descansos', texto: DESCANSOS },
      ],
    },
    {
      n: '06', clave: 'tu-trabajo', nombre: 'Apps para tu trabajo', corto: 'presupuestos, tareas, colores y hábitos',
      titular: 'Cuatro herramientas hechas a tu medida',
      historia: 'Las que antes buscabas en una tienda de apps o resolvías con una hoja de cálculo. La diferencia es que estas hacen justo lo que tú necesitas y nada más. No piden ningún permiso especial: son una ventana. En la calculadora, cambia lo que va entre corchetes por tu servicio y por cómo cobras; cuanto más concreto seas, mejor sale a la primera.',
      puedesTitulo: 'Qué te llevas',
      puedes: [
        'Una calculadora de presupuestos que te deja el texto listo para el correo',
        'Un tablero de tareas con tres columnas, etiquetas y fechas',
        'Una paleta de colores que te dice si el contraste se lee',
        'Un seguimiento de hábitos con rachas',
      ],
      ejemplos: [
        { titulo: '7 · Calculadora de presupuestos', texto: PRESUPUESTOS },
        { titulo: '8 · Tablero de tareas', texto: TABLERO },
        { titulo: '9 · Paleta de colores con contraste', texto: PALETA },
        { titulo: '10 · Seguimiento de hábitos', texto: HABITOS },
      ],
    },
    {
      n: '07', clave: 'con-claude', nombre: 'Apps con Claude dentro', corto: 'un reescritor con tu tono y un ordenador de ideas',
      titular: 'Dos apps que usan a Claude por dentro',
      historia: 'Una app instalada puede hacerle peticiones a Claude, igual que el artefacto del que sale. Sirve para herramientas que piensan: reescribir, clasificar, resumir. En vez de abrir un chat y explicar lo mismo cada vez, pegas el texto y pulsas un botón. Ojo con una cosa: cada petición que hace la app cuenta en el uso de tu plan, igual que si la escribieras tú en un chat.',
      puedesTitulo: 'Qué te llevas',
      puedes: [
        'Un reescritor que pasa cualquier texto a tu forma de escribir',
        'Un ordenador de ideas de contenido: formato, gancho y dificultad de cada una',
        'Cada uso gasta de tu plan de Claude',
        'Revisa lo que devuelve: se puede equivocar igual que en un chat',
      ],
      ejemplos: [
        { titulo: '11 · Reescritor con tu tono', texto: REESCRITOR },
        { titulo: '12 · Ordenador de ideas de contenido', texto: IDEAS },
      ],
    },
    {
      n: '08', clave: 'antes-de-usarlo', nombre: 'Antes de usarlo', corto: 'los límites de una función que está en beta',
      titular: 'Lo que conviene saber',
      historia: 'Está en beta, así que puede cambiar. Sin conexión las apps no abren: necesitas internet y la sesión iniciada en Claude. No todo se puede instalar: quedan fuera los artefactos hechos con una plantilla (documentos, presentaciones y hojas de cálculo), los artefactos antiguos y los artefactos en vivo de Cowork. La ayuda oficial no explica cómo guarda sus datos una app instalada, así que haz la prueba antes de fiarte: apunta algo, cierra la app del todo y vuelve a abrirla. Si lo pierde, pídele a Claude que lo guarde y añade un botón para copiar lo que tengas dentro. En el plan Team la función viene activada, pero el acceso completo está apagado hasta que lo active un administrador; en Enterprise está toda apagada hasta que la active un propietario. Y los prompts de esta guía son un punto de partida: lo normal es pedirle a Claude dos o tres cambios hasta dejar la app a tu gusto.',
      puedesTitulo: 'En resumen',
      puedes: [
        'Beta: puede cambiar de un día para otro',
        'Sin internet, las apps no abren',
        'Documentos, presentaciones y hojas de plantilla no se pueden instalar',
        'Comprueba que la app guarda tus datos antes de fiarte de ella',
        'Si usa a Claude por dentro, gasta de tu plan',
        'Acceso completo, solo a apps hechas por ti',
      ],
      ejemplos: [],
    },
  ],
}
