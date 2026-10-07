// Guía completa de Claude — Capítulo 01
// AI para todo. Voz de Alex Silvestre. Verificado contra fuentes oficiales
// el 2026-10-06 (ver `fuentes` al final del objeto).

export default {
  slug: 'empieza-aqui',
  n: '01',
  titulo: 'Empieza aquí: qué es Claude y cómo pensar con él',
  gancho: 'No es un buscador. Es alguien a quien diriges.',
  resumen: 'Al terminar sabrás qué es Claude, dónde se usa y cómo pedirle las cosas para que salgan bien a la primera (o a la segunda).',
  lectura: '18 min',
  fecha: '2026-10-06',
  bloques: [
    { tipo: 'p', texto: 'Abres Claude por primera vez. Ves un cuadro de texto. Y lo tratas como lo que conoces: le pides algo corto, como si fuera Google, y te llega una respuesta correcta pero genérica. Piensas «vale, está bien, pero no es para tanto». Y lo cierras.' },
    { tipo: 'p', texto: 'El problema no es la herramienta. Es cómo la estás usando. Claude no rinde cuando le haces preguntas sueltas; rinde cuando le das trabajo, contexto y dirección, como harías con alguien de tu equipo. Este capítulo va de eso: del cambio de cabeza que hace que pase de «curioso» a «no sé cómo trabajaba antes sin esto».' },
    { tipo: 'p', texto: 'No necesitas saber programar. Ni saber de IA. Solo necesitas saber explicar lo que quieres. Vamos.' },

    { tipo: 'h2', texto: 'Qué es Claude (y qué no es)' },
    { tipo: 'p', texto: 'Claude es un asistente de inteligencia artificial de la empresa Anthropic. Por dentro es un modelo de lenguaje: un sistema entrenado con muchísimo texto que predice y redacta, razona sobre lo que le das y usa herramientas (buscar en internet, leer tus archivos, crear documentos) cuando hacen falta.' },
    { tipo: 'p', texto: 'En la práctica, para ti es esto: le escribes en lenguaje normal y te devuelve trabajo hecho. Un guion, un correo, un análisis de tu hoja de cálculo, un resumen de un PDF de 80 páginas, un borrador de propuesta para un cliente. Conversas, le corriges, y va afinando.' },
    { tipo: 'p', texto: 'Lo que NO es, y conviene tenerlo claro desde el minuto uno:' },
    { tipo: 'lista', items: [
      'No es un buscador. No «busca y te enseña enlaces»; redacta y razona. Puede buscar en internet, pero esa es una función aparte que activas tú.',
      'No sabe lo que pasó ayer por defecto. Su conocimiento tiene una fecha de corte. Para algo reciente, necesita buscar en la web.',
      'No es infalible. Puede equivocarse con seguridad: inventar un dato, una cifra o una cita con total aplomo. Eso se revisa, siempre.',
      'No es una persona ni te conoce. No sabe nada de tu negocio hasta que se lo cuentas. Lo que le des, es lo que tendrá.',
    ] },
    { tipo: 'aviso', variante: 'dato', titulo: 'Tiene fecha de caducidad en la cabeza', texto: 'Los modelos más recientes de Claude (Fable 5.1, Opus 5.5 y Sonnet 5.5) tienen su conocimiento más fiable hasta junio de 2026; el rápido, Haiku 4.5, bastante antes. Si le preguntas por algo posterior (una noticia de esta semana, un precio de hoy), o lo inventa o te dice que no lo sabe. Para eso está la búsqueda web, que verás más abajo.' },

    { tipo: 'h2', texto: 'Dónde se usa y qué planes hay' },
    { tipo: 'p', texto: 'Claude está en tres sitios, con la misma cuenta en todos:' },
    { tipo: 'lista', items: [
      '**Web**: entras en `claude.ai` desde el navegador. Es el sitio por el que casi todos empiezan.',
      '**Escritorio**: hay app para Mac y Windows (`claude.ai/download`). Útil si lo vas a usar a diario.',
      '**Móvil**: hay app para iOS y Android, para cuando estás fuera.',
    ] },
    { tipo: 'p', texto: 'Sobre los planes, a grandes rasgos: hay un plan **Free** (gratis), un plan **Pro** de pago, y planes **Max** (Max 5x y Max 20x) para quien lo usa mucho. La diferencia principal es cuánto puedes usarlo y a qué funciones avanzadas llegas. El gratis incluye chatear en web, escritorio y móvil, buscar en la web, crear archivos y memoria entre conversaciones.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'Empieza por el gratis', texto: 'No pagues nada el primer día. El plan Free da de sobra para hacer todo lo de este capítulo y coger el hábito. Cuando te choques con el límite de uso un par de veces en una misma tarde, ahí sabrás que ya te compensa el Pro. Los precios cambian y varían por país, así que míralos en `claude.com/pricing` antes de decidir.' },

    { tipo: 'h2', texto: 'El cambio mental: de buscador a compañero al que diriges' },
    { tipo: 'p', texto: 'Este es el apartado más importante del capítulo. Si te quedas con una sola idea, que sea esta.' },
    { tipo: 'p', texto: 'Llevas veinte años usando Google. Y Google te enseñó un reflejo: escribir dos o tres palabras y esperar que el buscador adivine qué quieres. Con Claude, ese reflejo juega en tu contra.' },
    { tipo: 'p', texto: 'Piensa en Claude como en una persona muy capaz que acaba de entrar en tu equipo. Lista, rápida, trabajadora. Pero recién llegada: no conoce tu negocio, ni a tus clientes, ni tu tono, ni lo que ya intentaste y no funcionó. Si le sueltas una frase y esperas magia, te dará algo genérico. Si le explicas el encargo como se lo explicarías a esa persona, te dará trabajo de verdad.' },
    { tipo: 'tabla', cabecera: ['Lo que haces con un buscador', 'Lo que haces con Claude'], filas: [
      ['Escribes 3 palabras clave', 'Explicas el encargo con contexto'],
      ['Eliges entre enlaces que te da', 'Recibes trabajo hecho y lo corriges'],
      ['Una búsqueda, un resultado', 'Una conversación: pides, revisas, afinas'],
      ['Buscas información', 'Delegas una tarea'],
    ] },
    { tipo: 'aviso', variante: 'ojo', titulo: 'El error número uno', texto: 'Tratar a Claude como a Google. Preguntas de tres palabras dan respuestas de tres palabras de valor. La mayoría de las decepciones con la IA vienen de aquí, no del modelo.' },

    { tipo: 'h2', texto: 'Cómo escribir una buena petición' },
    { tipo: 'p', texto: 'Una buena petición no es «larga» por adornarla. Es completa. Lleva cinco ingredientes. No hace falta que estén los cinco siempre, pero cuantos más pongas, menos tendrás que corregir después.' },
    { tipo: 'lista', items: [
      '**Contexto**: quién eres, de qué va tu negocio, para quién es esto. Lo que esa persona recién llegada necesitaría saber.',
      '**Objetivo**: qué quieres conseguir de verdad. No «escribe un post», sino «quiero que la gente se apunte a la lista de espera».',
      '**Formato**: cómo quieres la respuesta. Lista, tabla, correo, hilo de 5 tuits, 200 palabras, tono cercano.',
      '**Ejemplos**: algo tuyo que te guste, o una referencia. «Que suene como esto que escribí yo» vale oro.',
      '**Restricciones**: lo que NO quieres. Sin emojis, sin palabras de relleno, nada de «en el mundo actual», máximo tres frases.',
    ] },
    { tipo: 'h3', texto: 'Antes y después' },
    { tipo: 'p', texto: 'Mira la diferencia con un caso real. Una nutricionista con un curso online quiere anunciar una plaza libre. El reflejo de buscador sería: `escríbeme un post para Instagram sobre mi curso`. Y recibe un texto plano, lleno de tópicos, que podría ser de cualquiera.' },
    { tipo: 'p', texto: 'La versión dirigida es esta (cópiala y cámbiala por la tuya):' },
    { tipo: 'prompt', titulo: 'Antes/después: una petición completa', texto: 'Soy nutricionista y tengo un curso online de alimentación para gente con horarios de locos. Mi clienta tipo es una mujer de 30-45 años, con trabajo de oficina, que llega a casa reventada y acaba cenando cualquier cosa. Se siente culpable por ello.\n\nEscríbeme 3 opciones de texto para una publicación de Instagram anunciando que se ha quedado una plaza libre en la próxima edición del curso.\n\nObjetivo: que quien lo lea sienta que la entiendo y haga clic en el enlace de la bio.\nFormato: entre 80 y 120 palabras cada opción, con un gancho fuerte en la primera línea.\nTono: cercano, de tú, sin culpabilizar, sin tópicos de coaching.\nNo quiero: emojis, ni la palabra «holístico», ni promesas de resultados rápidos.\n\nAntes de escribir, dime si te falta algún dato para que salga bien.' },
    { tipo: 'p', texto: 'La segunda da tres textos que ya suenan a ella y que puede publicar casi tal cual. La diferencia no la puso un modelo mejor: la pusiste tú, con 90 segundos más de contexto.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'Acaba pidiéndole que te pregunte', texto: 'Remata tus peticiones con «antes de empezar, dime qué te falta para hacerlo bien». Claude te hará dos o tres preguntas y la respuesta final será mucho mejor, porque no habrá tenido que adivinar. Es el truco más barato y más infrautilizado que existe.' },

    { tipo: 'h2', texto: 'Itera: no te quedes con la primera respuesta' },
    { tipo: 'p', texto: 'Esto también va contra el reflejo de buscador. En Google coges el primer resultado y te vas. Con Claude, la primera respuesta es un borrador, no la entrega. La magia está en la segunda, la tercera y la cuarta vuelta.' },
    { tipo: 'p', texto: 'No hace falta reescribir la petición entera. Sigues la conversación y corriges, igual que con una persona:' },
    { tipo: 'lista', items: [
      '«La opción 2 es la buena. Hazme otras tres parecidas a esa.»',
      '«Demasiado comercial. Bájalo, que parezca que lo escribe una persona, no una marca.»',
      '«El principio no engancha. Dame cinco primeras frases distintas, solo la primera frase.»',
      '«Perfecto. Ahora adáptalo a un correo para mi lista.»',
    ] },
    { tipo: 'prompt', titulo: 'Iterar sobre una respuesta', texto: 'De lo que me has dado, me quedo con la versión 2. Me gusta el tono, pero el final es flojo y suena a anuncio.\n\nHazme 4 variantes de esa versión 2, cambiando solo las dos últimas frases para que acaben con una pregunta o una imagen concreta, no con una llamada a la acción de manual.\n\nMantén igual el principio, que ese sí funciona.' },

    { tipo: 'h2', texto: 'Las herramientas que cambian el resultado' },
    { tipo: 'p', texto: 'Claude no es solo el cuadro de texto. Tiene funciones que, bien usadas, le dan superpoderes. Estas son las que vas a usar desde el primer día. En la web, muchas se abren con el botón `+` de abajo a la izquierda, o escribiendo `/` para ver las opciones y comandos.' },

    { tipo: 'h3', texto: 'Artifacts: el trabajo, al lado de la conversación' },
    { tipo: 'p', texto: 'Cuando le pides algo que es una «pieza» (un documento, una web de una página, una tabla, un pequeño programita, un panel), Claude lo abre en un panel aparte, al lado del chat. Eso es un artifact. En vez de perderse en el hilo de mensajes, queda ahí: lo editas, vuelves a él y lo compartes.' },
    { tipo: 'lista', items: [
      'Le pides el artifact en cualquier conversación, o arrancas desde una plantilla en la pestaña «Artifacts».',
      'Hay plantillas para documentos (Docs), presentaciones (Slides) y diseño (Design).',
      'En un documento, seleccionas el texto que quieres cambiar, pulsas «Edit with Claude» y le dices qué hacer.',
      'Todo lo que creas se guarda en la pestaña «Artifacts» de la barra lateral, así que lo recuperas desde cualquier chat.',
    ] },
    { tipo: 'aviso', variante: 'dato', titulo: 'Si no te aparecen', texto: 'Para que Claude pueda crear archivos y artifacts, la ejecución de código y la creación de archivos tienen que estar activadas en `Settings > Capabilities` (Ajustes > Capacidades). Normalmente ya lo están; si no ves la opción de crear, mira ahí primero.' },

    { tipo: 'h3', texto: 'Pensar más: el razonamiento extendido' },
    { tipo: 'p', texto: 'Para tareas difíciles, Claude puede «pensar» antes de responder: dedica un rato a desgranar el problema y a probar enfoques antes de darte la respuesta. Verás un apartado de «Thinking» (pensamiento) que puedes desplegar para ver cómo llegó a la conclusión.' },
    { tipo: 'p', texto: 'Esto lo controlas desde el nombre del modelo, junto al botón de enviar: ahí encuentras el ajuste de esfuerzo («Effort») y el de pensamiento. En los modelos actuales de gama alta el razonamiento va siempre activado y lo que ajustas es cuánto esfuerzo le dedica; en los más rápidos lo puedes encender y apagar.' },
    { tipo: 'p', texto: 'Úsalo cuando la tarea requiere razonar de verdad y no datos de internet: ordenar la estrategia de tu oferta, cuadrar números, revisar la lógica de un contrato, planear un lanzamiento. Para cosas simples no hace falta, y tarda más.' },

    { tipo: 'h3', texto: 'Búsqueda web e investigación' },
    { tipo: 'p', texto: 'Como Claude no sabe lo de ayer, para algo actual tiene que mirar internet. Hay dos niveles:' },
    { tipo: 'lista', items: [
      '**Búsqueda web**: para datos concretos que se resuelven en una o dos consultas. El tiempo que hace, una noticia reciente, los datos de una empresa, un precio de hoy.',
      '**Investigación (Research)**: para cuando necesitas recopilar de varias fuentes y te vale un informe. Compara a cinco competidores, resume un tema a fondo. Tarda uno a tres minutos porque hace muchas búsquedas y las junta.',
    ] },

    { tipo: 'h3', texto: 'Subir archivos' },
    { tipo: 'p', texto: 'Puedes arrastrar archivos a la conversación para que Claude los lea y trabaje con ellos. Tu hoja de cálculo de ventas, el PDF de un contrato, el guion que ya tienes, una captura de pantalla. Admite PDF, Word (DOCX), CSV, TXT, HTML, JSON y Excel (XLSX), entre otros, y como imágenes JPEG, PNG, GIF y WebP.' },
    { tipo: 'p', texto: 'Los límites, a día de hoy: hasta 500 MB por archivo, hasta 20 archivos por chat, imágenes de hasta 8000 por 8000 píxeles y PDF de hasta 1000 páginas. En los PDF de 100 páginas o menos lee también lo visual (gráficos, imágenes); a partir de ahí, solo el texto.' },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Lo que subes, lo lee', texto: 'Antes de arrastrar el Excel de clientes o el contrato de un tercero, piensa qué lleva dentro. Si hay datos personales, cuentas bancarias o cosas confidenciales que no son tuyas para compartir, quítalos o anonimiza primero. Más sobre esto al final del capítulo.' },

    { tipo: 'h2', texto: 'Qué modelo usar según la tarea' },
    { tipo: 'p', texto: 'Claude no es un solo cerebro: es una familia de modelos. Cambias de uno a otro pulsando el nombre del modelo, junto al botón de enviar. El criterio es sencillo: para pensar fuerte, el más capaz; para tareas repetidas y rápidas, el ligero.' },
    { tipo: 'tabla', cabecera: ['Modelo', 'Para qué es mejor', 'Velocidad'], filas: [
      ['Claude Fable 5.1', 'Razonamiento muy exigente y tareas largas en las que trabaja solo mucho rato', 'Más lento'],
      ['Claude Opus 5.5', 'El todoterreno: trabajo de conocimiento y proyectos largos. La recomendación oficial si dudas', 'Media'],
      ['Claude Sonnet 5.5', 'El mejor equilibrio entre velocidad e inteligencia para el día a día', 'Rápido'],
      ['Claude Haiku 4.5', 'Lo más rápido, para tareas simples y repetidas', 'El más rápido'],
    ] },
    { tipo: 'p', texto: 'No te obsesiones con esto al principio. La guía oficial dice que, si no sabes cuál elegir, empieces por Opus 5.5 para casi todo. Cuando notes que una tarea pequeña va sobrada o que una grande se te queda corta, cambias. El nombre exacto importa menos que el criterio: potente para pensar, ligero para repetir.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'Un modelo no arregla una mala petición', texto: 'Antes de saltar al modelo más potente porque «no me sale bien», revisa tu petición. Casi siempre el problema es falta de contexto, no falta de modelo. Primero arregla el encargo; después, si de verdad hace falta, sube de modelo.' },

    { tipo: 'h2', texto: 'Prompts para copiar y adaptar' },
    { tipo: 'p', texto: 'Cuatro peticiones completas para el trabajo real. Copia la que te sirva y cambia lo que está entre corchetes por lo tuyo. Fíjate en que todas llevan contexto, objetivo, formato y restricciones, y que casi todas acaban pidiéndole a Claude que pregunte lo que le falte.' },
    { tipo: 'prompt', titulo: 'Plan de contenido semanal (creador de reels)', texto: 'Soy creador de contenido sobre [tu tema, p. ej. finanzas personales para autónomos] y publico reels en Instagram y TikTok. Mi público es [describe a tu seguidor tipo: edad, qué le preocupa, qué nivel tiene del tema].\n\nAyúdame a planear los reels de la semana que viene. Dame 7 ideas, una por día.\n\nPara cada idea quiero:\n- Un gancho para los 3 primeros segundos (la frase que frena el scroll).\n- La idea central en una línea.\n- Un pie de publicación de 2-3 frases.\n\nObjetivo: que la gente guarde y comparta, no solo que le dé like.\nRestricciones: nada de datos que haya que verificar y pueda estar desfasado; ideas que yo pueda grabar solo con el móvil; sin tendencias de audio concretas.\n\nAntes de darme el plan, hazme las preguntas que necesites sobre mi público o mi estilo.' },
    { tipo: 'prompt', titulo: 'Correo de lanzamiento con tu voz (infoproducto)', texto: 'Tengo un [curso/ebook/plantilla] que se llama [nombre] y que ayuda a [a quién] a [resultado concreto]. Abro inscripciones el [fecha] y cierro el [fecha].\n\nTe pego debajo un correo mío anterior que funcionó bien, para que cojas MI tono y mi forma de escribir, no la tuya:\n\n[pega aquí 1 correo tuyo que te guste]\n\nCon ese tono, escríbeme un correo anunciando la apertura de inscripciones.\n\nFormato: máximo 250 palabras, una sola llamada a la acción, asunto incluido (dame 3 opciones de asunto).\nObjetivo: que quien ya me sigue entienda por qué esto es para él AHORA.\nRestricciones: sin urgencia falsa, sin «no te lo pierdas», sin emojis. Que suene a mí.' },
    { tipo: 'prompt', titulo: 'Revisar un documento antes de firmarlo (profesional o freelance)', texto: 'Te adjunto un [contrato / propuesta / pliego] que me han enviado. No soy abogado y quiero entenderlo antes de responder.\n\nHazme tres cosas:\n1. Un resumen en lenguaje llano de qué dice y a qué me comprometo, en 5-7 puntos.\n2. Una lista de las cláusulas que me pueden perjudicar o que son raras, explicando por qué.\n3. Una lista de preguntas que le haría a la otra parte antes de firmar.\n\nContexto: soy [tu oficio] y esto es para [el encargo]. Lo que más me importa es [p. ej. cobrar a tiempo / conservar los derechos de mi trabajo / poder cancelar].\n\nAviso importante: esto es orientación para entenderlo, no asesoría legal. Señálame claramente lo que debería consultar con un profesional.' },
    { tipo: 'prompt', titulo: 'Propuesta y presupuesto para un cliente (agencia o freelance)', texto: 'Soy [tu oficio, p. ej. editor de vídeo] y un cliente potencial me ha pedido presupuesto para [describe el encargo con el máximo detalle: qué, cuánto, para cuándo].\n\nAyúdame a montar una propuesta corta y profesional.\n\nQuiero esta estructura:\n- Qué he entendido que necesita (para demostrar que le he escuchado).\n- Qué incluye el trabajo y qué no (para evitar malentendidos luego).\n- Plazos y número de revisiones incluidas.\n- Tres opciones de precio: una básica, una recomendada y una premium.\n\nContexto de mis precios: una pieza tipo me lleva [tiempo] y suelo cobrar sobre [rango]. No quiero malvenderme.\nFormato: texto listo para pegar en un correo, tono cercano pero profesional.\n\nSi te falta algún dato para dar los precios, pídemelo antes de inventarlos.' },

    { tipo: 'h2', texto: 'Los errores que vas a cometer (y cómo evitarlos)' },
    { tipo: 'p', texto: 'Casi todo el mundo tropieza en las mismas tres piedras. Si las esquivas desde el principio, te ahorras semanas de pensar que «la IA no es para mí».' },
    { tipo: 'pasos', items: [
      { titulo: 'Pedir sin contexto', texto: 'La madre de todos los errores. Peticiones de una línea esperando resultados de experto. Solución: antes de darle a enviar, pregúntate si una persona que no te conoce podría hacer el encargo con lo que has escrito. Si no, falta contexto.' },
      { titulo: 'Creerte todo lo que dice', texto: 'Claude puede dar un dato falso con una seguridad total. Nombres, cifras, fechas, citas, datos de una ley. Solución: trata los datos como «a verificar». Para lo que de verdad importa, pídele las fuentes o actívale la búsqueda web, y compruébalo tú.' },
      { titulo: 'Aceptar la primera respuesta', texto: 'La primera es un borrador. Quedarte ahí es dejar la mayor parte del valor sin coger. Solución: corrige al menos una vez. «Más corto», «menos comercial», «más como yo». Siempre mejora.' },
    ] },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Donde más mete la pata', texto: 'Con datos exactos y recientes: estadísticas, precios, leyes, qué dijo quién y cuándo. Ahí es donde más se inventa cosas con cara de certeza. Si vas a publicar una cifra o un dato legal, verifícalo fuera de Claude. No es negociable.' },

    { tipo: 'h2', texto: 'Privacidad: qué no pegar' },
    { tipo: 'p', texto: 'Regla sencilla para el día a día: no pegues nada que no querrías que saliera de tu control. En concreto, mantén fuera de las conversaciones:' },
    { tipo: 'lista', items: [
      'Contraseñas, claves de API, tokens y números de tarjeta o de cuenta bancaria.',
      'Datos personales de tus clientes o de terceros (DNI, direcciones, historiales) que no te corresponde compartir.',
      'Documentos confidenciales que firmaste no divulgar.',
    ] },
    { tipo: 'p', texto: 'Para trabajar con un documento sensible, quita o cambia los datos personales antes de subirlo. Con frecuencia Claude puede hacer el trabajo igual de bien con los nombres cambiados por «Cliente A», «Cliente B».' },
    { tipo: 'p', texto: 'Un apunte sobre el entrenamiento: en los planes de consumo (Free, Pro y Max), tus conversaciones pueden usarse para mejorar Claude si tú lo permites, y eso lo controlas en los ajustes de privacidad («Model Improvement»); puedes cambiarlo cuando quieras. Hay chats en modo incógnito que no se usan para eso. Los productos de empresa (Claude for Work) y la API tienen políticas distintas. Si manejas datos delicados, revisa tu ajuste y, ante la duda, no lo pegues.' },
    { tipo: 'aviso', variante: 'ojo', titulo: 'La prueba del periódico', texto: 'Antes de pegar algo dudoso, pásale esta prueba: si esto apareciera mañana en un periódico con tu nombre al lado, ¿pasaría algo? Si la respuesta es sí, no lo pegues, o quítale lo sensible primero.' },

    { tipo: 'h2', texto: 'Tu ejercicio de 15 minutos' },
    { tipo: 'p', texto: 'La teoría no sirve de nada si no abres Claude hoy. Haz esto antes de pasar al capítulo 2. Son 15 minutos.' },
    { tipo: 'pasos', items: [
      { titulo: 'Entra y elige una tarea real (2 min)', texto: 'Abre `claude.ai`. Piensa en algo que tengas pendiente de verdad esta semana: un correo, un texto, un resumen de un documento. Nada de pruebas tontas; una tarea real.' },
      { titulo: 'Escribe la petición completa (5 min)', texto: 'Mete los cinco ingredientes: contexto, objetivo, formato, un ejemplo tuyo si lo tienes y las restricciones. Acábala con «antes de empezar, dime qué te falta».' },
      { titulo: 'Deja que te pregunte y responde (3 min)', texto: 'Si te hace preguntas, contéstalas. Ya estás dirigiendo, no buscando.' },
      { titulo: 'Itera dos veces (4 min)', texto: 'Coge su respuesta y córrige dos veces. Más corto, otro tono, cambia el principio. Compara el resultado final con lo que te habría dado una petición de una línea.' },
      { titulo: 'Quédate con la diferencia', texto: 'Ese salto entre la primera respuesta y la cuarta es, resumido, de qué va toda esta guía. Lo que viene después (Proyectos, Skills, Conectores, agentes) solo hace ese salto más grande y más automático.' },
    ] },
    { tipo: 'p', texto: 'En el capítulo 2 montamos lo primero serio: un Proyecto donde Claude ya conoce tu negocio y no tienes que explicárselo cada vez. Pero el cambio de cabeza, el de verdad, lo acabas de hacer aquí.' },
  ],
  claves: [
    'Claude no es un buscador: es un compañero capaz al que diriges con contexto, no con palabras sueltas.',
    'Una buena petición lleva contexto, objetivo, formato, ejemplos y restricciones; y acaba pidiéndole que pregunte lo que falte.',
    'La primera respuesta es un borrador. El valor está en iterar dos o tres veces.',
    'Verifica siempre los datos exactos y recientes: cifras, precios, leyes y citas. Puede inventarlos con total seguridad.',
    'Elige modelo por criterio: potente para pensar, ligero para tareas repetidas. Si dudas, empieza por Opus 5.5.',
    'No pegues contraseñas, datos de clientes ni documentos confidenciales. Anonimiza antes de subir.',
  ],
  fuentes: [
    { texto: 'Models overview — Claude Docs', url: 'https://platform.claude.com/docs/en/models/overview' },
    { texto: 'Planes y precios de Claude', url: 'https://claude.com/pricing' },
    { texto: 'Get started with Claude — Centro de ayuda', url: 'https://support.claude.com/en/articles/8114491-get-started-with-claude' },
    { texto: 'What are artifacts and how do I use them?', url: 'https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them' },
    { texto: 'When should I use web search, extended thinking, and research?', url: 'https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research' },
    { texto: 'Upload files to Claude — Centro de ayuda', url: 'https://support.claude.com/en/articles/8241126-upload-files-to-claude' },
    { texto: 'Is my data used for model training? — Privacidad de Anthropic', url: 'https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training' },
  ],
}
