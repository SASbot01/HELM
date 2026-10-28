// Agent OS — el catálogo de agentes.
//
// Cada agente es una cosa que corre sola y produce algo. Se entra desde un
// menú de casillas, en /agents y en la sección Agentes de cada perfil. Los
// creadores (identidades), sus reels y la memoria viven DENTRO del agente de
// contenido, que es quien los usa.
//
// Los que están sin construir aparecen igualmente, y marcados como tales. No es
// relleno: es el plan a la vista, y evita la pregunta de "¿esto qué va a
// llegar a ser?". Lo que nunca se hace aquí es enseñar como activo algo que no
// funciona.

export const ESTADOS = {
  activo:     { label: 'Activo',          tono: 'ok' },
  construido: { label: 'En construcción', tono: 'espera' },
  // Ya trabaja (dentro del Equipo de agentes o del bot) y se está ampliando a
  // lo que dice su casilla.
  mejora:     { label: 'Mejorándose',     tono: 'espera' },
  // Está hecho, pero le falta un permiso de fuera (Meta) para funcionar.
  espera:     { label: 'Esperando a Meta', tono: 'espera' },
  // El plan: lo que va a hacer, con su frase, para que se vea hacia dónde va.
  proximo:    { label: 'Próximamente',    tono: 'espera' },
}

// Los departamentos: cada agente trabaja en uno. En el menú se entra por
// departamento, como a una oficina; el Equipo de agentes los enseña todos.
export const DEPARTAMENTOS = [
  {
    key: 'contenido',
    nombre: 'Contenido y anuncios',
    resumen: 'Estudia a tus referentes, escribe y edita tus reels, lleva tus campañas y te dice qué anuncio trae clientes y cuál no.',
    icono: 'contenido',
  },
  {
    key: 'ventas',
    nombre: 'Ventas',
    resumen: 'Atiende a quien te escribe, lo lleva a la llamada y no deja que ningún lead se enfríe.',
    icono: 'setter',
  },
  {
    key: 'atencion',
    nombre: 'Atención al cliente',
    resumen: 'Responde a tus clientes a cualquier hora, les recuerda lo que falta y te pasa lo que no sabe.',
    icono: 'atencion',
  },
  {
    key: 'operaciones',
    nombre: 'Operaciones',
    resumen: 'Cada mañana mira todo el negocio, te dice qué está atascado y mueve el trabajo al siguiente paso.',
    icono: 'equipo',
  },
  {
    key: 'finanzas',
    nombre: 'Finanzas',
    resumen: 'Persigue cada cuota y cada renovación, cuadra Stripe con tus ventas y te avisa antes de que falte caja.',
    icono: 'finanzas',
  },
  {
    key: 'webs',
    nombre: 'Webs y Google',
    resumen: 'Prepara tu web, cuida tu ficha de Google y tus reseñas para que te encuentren y te elijan.',
    icono: 'web',
  },
]

export const AGENTES = [
  {
    key: 'contenido',
    departamento: 'contenido',
    ruta: 'contenido',
    nombre: 'Agente de contenido',
    resumen: 'Los creadores de referencia, sus reels analizados y lo aprendido de ellos.',
    detalle: 'Descarga cada reel, lo transcribe y etiqueta el guion frase a frase. Claude lo usa para tu estrategia y tus guiones.',
    estado: 'activo',
    // Qué número enseña la casilla. Se resuelve contra el estado real; si no
    // hay dato, la casilla no inventa un cero.
    metrica: 'corpus',
    icono: 'contenido',
  },
  {
    key: 'equipo',
    ruta: 'equipo',
    nombre: 'Equipo de agentes',
    resumen: 'Siete agentes con una memoria común: contenido, producción, ventas e informe.',
    detalle: 'El director planifica cada mañana a las 6:00 y reparte el trabajo. Aquí se ve el flujo entero: qué hace cada uno, por dónde va cada pieza, el registro de cada ejecución y lo que espera tu aprobación.',
    estado: 'activo',
    icono: 'equipo',
    // Tira de api/agents.js, que es solo para superadmin.
    soloAdmin: true,
  },
  {
    key: 'editor',
    departamento: 'contenido',
    ruta: 'editor',
    nombre: 'Editor de reels',
    resumen: 'Subes tu vídeo en bruto y te lo devuelve editado: sin tomas repetidas ni silencios, con subtítulos y en el estilo que elijas.',
    detalle: 'Eliges uno de sus más de 30 estilos de edición, subes el vídeo tal cual sale del móvil (y, si quieres, imágenes, clips, tu logo y música) y te devuelve el MP4 a 1080×1920 listo para Instagram. Ves el precio antes de empezar. HELM no publica.',
    estado: 'activo',
    icono: 'editor',
  },
  {
    key: 'estudio',
    departamento: 'contenido',
    ruta: 'estudio',
    nombre: 'Estudio de Instagram',
    resumen: 'Puntúa el gancho, revisa la caption, audita el perfil y quita el olor a IA.',
    detalle: 'Pegas un guion, una caption o tu perfil y te dice qué falla y cómo arreglarlo antes de publicar. No publica nada.',
    estado: 'activo',
    icono: 'informe',
  },
  {
    key: 'portadas',
    departamento: 'contenido',
    ruta: 'portadas',
    nombre: 'Portadas',
    resumen: 'Tus reels con su portada y, en cada uno, una nueva: el fotograma real, el texto y la serie.',
    detalle: 'Propone tres textos para la portada de cada reel, la compone en 1080×1920 con el kit de tu serie y te enseña cómo queda en la cuadrícula del perfil antes de descargarla en JPG o PNG.',
    estado: 'activo',
    icono: 'portadas',
  },
  {
    key: 'setter-ig',
    departamento: 'ventas',
    ruta: 'setter-ig',
    nombre: 'Setter de Instagram',
    resumen: 'Contesta tus DM, cualifica a cada lead y lo lleva a la llamada. Cada uno entra en el CRM.',
    detalle: 'Lee cada mensaje directo, pregunta lo justo para saber si encaja y, cuando encaja, le pasa tu formulario de reserva. Empieza dejando borradores para que los apruebes; cuando te fíes, contesta solo. Si alguien del equipo escribe en un hilo, se aparta.',
    // Hecho, pero Meta aún no ha dado el permiso de mensajes: se abre igual.
    estado: 'espera',
    abrible: true,
    icono: 'setter',
  },
  {
    key: 'trial-reels',
    departamento: 'contenido',
    ruta: 'trial-reels',
    nombre: 'Trial reels',
    resumen: 'Vuelve a probar tus reels: 2–3 variantes con otro arranque, otro gancho y otro encuadre.',
    detalle: 'Coge un reel que ya publicaste, propone ganchos y monta las variantes en MP4 1080×1920 con tu kit de Portadas. Las descargas y las subes en Instagram como «Reel de prueba»: HELM no publica.',
    estado: 'activo',
    icono: 'trial',
  },
  {
    key: 'web-creator',
    departamento: 'webs',
    ruta: 'web-creator',
    nombre: 'Web Creator',
    resumen: 'Los clientes en «En fabricación»: su estudio de las webs mejor posicionadas y el prompt para construir la suya.',
    detalle: 'Al pasar un contacto a «En fabricación», reúne todo lo que hay de él en el CRM y la prospección, estudia las webs de su sector que mejor posicionan en Google y Maps y prepara el prompt para Claude Code, que la construye, la sube a GitHub y la publica en Vercel.',
    estado: 'activo',
    icono: 'web',
    // De momento, solo en el perfil que vende webs.
    soloPerfiles: ['web-seller'],
  },

  // ── Lo que viene (28-oct-2026): un agente por cada trabajo de la empresa ──
  // Los que ya trabajan dentro del Equipo de agentes o del bot van como
  // «Mejorándose»; los nuevos, «Próximamente», con su frase. Ninguno se abre
  // todavía: se enseña el plan, no se finge que funciona.
  {
    key: 'guionista',
    departamento: 'contenido',
    nombre: 'Guionista',
    resumen: 'Te deja cada día los guiones en borrador, con los temas que más te han vendido, no solo los que más se vieron.',
    detalle: 'Hoy escribe los guiones del Equipo de agentes eligiendo por visitas. Va a unir cada reel con los leads y las ventas que trajo para escribir sobre lo que vende.',
    estado: 'mejora',
    icono: 'pluma',
  },
  {
    key: 'media-buyer',
    departamento: 'contenido',
    nombre: 'Media buyer',
    resumen: 'Lleva tus campañas de Meta: sube lo que vende, apaga lo que no y nunca pasa del tope que tú pongas.',
    detalle: 'Cada mañana cruza el gasto de Meta con las ventas cobradas de tu CRM y te propone los cambios con un botón para aprobar. Los topes de gasto los pones tú y el código no deja pasarlos.',
    estado: 'proximo',
    icono: 'anuncios',
  },
  {
    key: 'anuncios',
    departamento: 'contenido',
    nombre: 'Anuncios',
    resumen: 'Mide cada anuncio por los leads y las ventas que trae de verdad y te dice cuál apagar, cuál subir y qué probar después.',
    detalle: 'Hoy hace el test de 5 días por UTM. Va a calcular el coste por lead y por venta con lo cobrado y a proponer anuncios nuevos con tus reels que más venden.',
    estado: 'mejora',
    icono: 'grafica',
  },
  {
    key: 'publicador',
    departamento: 'contenido',
    nombre: 'Publicador',
    resumen: 'Programa y publica en Instagram lo que apruebas, a la hora en que tu público responde.',
    detalle: 'Necesita el permiso de publicación de Meta. Publica solo lo que tú apruebas.',
    estado: 'proximo',
    icono: 'publicar',
  },
  {
    key: 'palabra-clave',
    departamento: 'ventas',
    nombre: 'Palabra clave',
    resumen: 'Al que comenta la palabra de tu reel le manda el enlace por DM y lo mete en el CRM.',
    detalle: 'Como el «Comenta REPO» de tus reels. Necesita el permiso de comentarios y mensajes de Meta.',
    estado: 'proximo',
    icono: 'palabra',
  },
  {
    key: 'seguimiento',
    departamento: 'ventas',
    nombre: 'Seguimiento',
    resumen: 'Escribe al lead que se enfría, recuerda la llamada al que la tiene y rescata al que no vino.',
    detalle: 'Te pasa por Telegram el mensaje ya redactado de cada lead parado, con su enlace de WhatsApp, para mandarlo con un toque.',
    estado: 'proximo',
    icono: 'seguimiento',
  },
  {
    key: 'llamadas',
    departamento: 'ventas',
    nombre: 'Preparador de llamadas',
    resumen: 'Antes de cada llamada te da la ficha del lead y sus objeciones; después, apunta el resultado y la venta.',
    detalle: 'Junta lo que dijo en el formulario, por qué reel o anuncio llegó y su conversación con el setter.',
    estado: 'proximo',
    icono: 'llamada',
  },
  {
    key: 'prospector',
    departamento: 'ventas',
    nombre: 'Prospector',
    resumen: 'Busca negocios de tu zona en Google Maps, saca su contacto y te prepara el primer mensaje de cada uno.',
    detalle: 'Hoy busca y enriquece los negocios. Va a redactar el primer mensaje de cada uno con lo que ha encontrado de él.',
    estado: 'mejora',
    icono: 'buscar',
  },
  {
    key: 'atencion-24',
    departamento: 'atencion',
    nombre: 'Atención 24/7',
    resumen: 'Responde a tus clientes a cualquier hora con lo que sabe de tu negocio y te pasa, resumido, lo que no sabe.',
    detalle: 'Sabe qué ha comprado cada cliente y qué le falta. Primero en el chat de tu web; después en Instagram y WhatsApp.',
    estado: 'proximo',
    icono: 'atencion',
  },
  {
    key: 'bienvenida',
    departamento: 'atencion',
    nombre: 'Bienvenida',
    resumen: 'Al que te paga le da sus accesos, le pide lo que falta y le agenda la llamada de arranque.',
    detalle: 'Salta en cuanto entra el pago.',
    estado: 'proximo',
    icono: 'bienvenida',
  },
  {
    key: 'documentacion',
    departamento: 'atencion',
    nombre: 'Documentación pendiente',
    resumen: 'Recuerda a cada cliente qué papeles le faltan antes de cada plazo, con su enlace para subirlos.',
    detalle: 'Pensado para asesorías: tira de los plazos de Fiscal y de los documentos de cada cliente.',
    estado: 'proximo',
    icono: 'documentos',
  },
  {
    key: 'postventa',
    departamento: 'atencion',
    nombre: 'Postventa',
    resumen: 'Pregunta a cada cliente qué tal le va, te avisa de quien quiere irse y pide reseña o testimonio a quien está contento.',
    detalle: 'Los testimonios pasan al Guionista para tu contenido.',
    estado: 'proximo',
    icono: 'postventa',
  },
  {
    key: 'recepcionista',
    departamento: 'atencion',
    nombre: 'Recepcionista de voz',
    resumen: 'Coge el teléfono cuando no puedes, agenda la cita y te deja el recado en el CRM.',
    detalle: 'Necesita un número y un proveedor de voz.',
    estado: 'proximo',
    icono: 'telefono',
  },
  {
    key: 'director',
    departamento: 'operaciones',
    nombre: 'Director',
    resumen: 'Cada mañana mira todo el negocio, reparte el trabajo de los agentes y te manda el parte del día.',
    detalle: 'Hoy planifica el contenido del Equipo de agentes. Va a mirar también el embudo, los cobros y los clientes, y a mandarte por Telegram lo que entra, lo que vence, lo atascado y lo que espera tu aprobación.',
    estado: 'mejora',
    icono: 'director',
  },
  {
    key: 'productor',
    departamento: 'operaciones',
    nombre: 'Productor',
    resumen: 'Sigue cada pieza hasta que se publica y, si se atasca, la empuja al siguiente paso.',
    detalle: 'Hoy avisa de las piezas atascadas. Va a encargar al Editor el vídeo en bruto que entra.',
    estado: 'mejora',
    icono: 'produccion',
  },
  {
    key: 'pregunta',
    departamento: 'operaciones',
    nombre: 'Pregúntale a HELM',
    resumen: 'Le preguntas por Telegram o desde Claude cómo va cualquier cosa y te contesta con tus datos; si le pides un cambio, lo prepara para que lo apruebes.',
    detalle: 'Hoy el bot de Telegram ya contesta y el conector de Claude ve el contenido. Va a ver también el CRM, las ventas, los cobros y las finanzas.',
    estado: 'mejora',
    icono: 'bot',
  },
  {
    key: 'limpieza-crm',
    departamento: 'operaciones',
    nombre: 'Limpieza del CRM',
    resumen: 'Junta los contactos repetidos, rellena lo que falta y te avisa de las fichas sin etapa ni dueño.',
    detalle: 'Para que el resto de agentes trabaje con datos buenos.',
    estado: 'proximo',
    icono: 'limpieza',
  },
  {
    key: 'informe-semanal',
    departamento: 'operaciones',
    nombre: 'Informe semanal',
    resumen: 'Los lunes te dice qué ha pasado en contenido, ventas, cobros y clientes, y por qué.',
    detalle: 'Hoy sale los lunes con el contenido. Va a sumar la caja, el coste por venta y la atención al cliente.',
    estado: 'mejora',
    icono: 'informe',
  },
  {
    key: 'recetas',
    departamento: 'operaciones',
    nombre: 'Recetas',
    resumen: 'Le dices «cuando pase esto, haz aquello» y lo hace cada vez.',
    estado: 'proximo',
    icono: 'recetas',
  },
  {
    key: 'cobrador',
    departamento: 'finanzas',
    nombre: 'Cobrador',
    resumen: 'Te avisa de cada cuota y renovación que toca, prepara el enlace de pago y el mensaje, y marca lo cobrado.',
    detalle: 'Nunca cobra a una tarjeta sin permiso: te prepara el recordatorio para que lo apruebes.',
    estado: 'proximo',
    icono: 'cobros',
  },
  {
    key: 'conciliacion',
    departamento: 'finanzas',
    nombre: 'Conciliación',
    resumen: 'Cuadra cada pago de Stripe con su venta y su cliente, y te enseña los duplicados y lo que falta.',
    estado: 'proximo',
    icono: 'conciliacion',
  },
  {
    key: 'caja',
    departamento: 'finanzas',
    nombre: 'Caja',
    resumen: 'Te dice cuánto va a entrar y salir en los próximos 90 días y te avisa antes de que falte caja.',
    estado: 'proximo',
    icono: 'caja',
  },
  {
    key: 'comisiones',
    departamento: 'finanzas',
    nombre: 'Comisiones',
    resumen: 'Calcula lo que toca pagar a cada setter y closer con lo cobrado de verdad, no con lo vendido.',
    estado: 'proximo',
    icono: 'comisiones',
  },
  {
    key: 'resenas',
    departamento: 'webs',
    nombre: 'Reseñas',
    resumen: 'Pide la reseña de Google a cada cliente contento y te propone la respuesta a cada reseña nueva.',
    estado: 'proximo',
    icono: 'resenas',
  },
  {
    key: 'ficha-google',
    departamento: 'webs',
    nombre: 'Ficha de Google',
    resumen: 'Mantiene al día tu ficha de Google: horarios, fotos y una publicación a la semana sacada de tus reels.',
    detalle: 'Necesita el acceso a Google Business Profile.',
    estado: 'proximo',
    icono: 'ficha',
  },
  {
    key: 'visibilidad-ia',
    departamento: 'webs',
    nombre: 'Visibilidad en IA',
    resumen: 'Mira si ChatGPT y Google te recomiendan cuando alguien busca lo tuyo en tu zona, y qué cambiar para que lo hagan.',
    estado: 'proximo',
    icono: 'visibilidad',
  },
]

// Las partes del agente de contenido, en el orden en que se enseñan.
export const PARTES_CONTENIDO = [
  { key: 'creadores', ruta: '', nombre: 'Creadores' },
  { key: 'reels', ruta: 'reels', nombre: 'Reels' },
  { key: 'memoria', ruta: 'memoria', nombre: 'Memoria' },
]
