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
}

export const AGENTES = [
  {
    key: 'contenido',
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
    key: 'drive',
    ruta: 'drive',
    nombre: 'Calendario de guiones',
    resumen: 'Tus guiones día a día, y lo que grabas se ordena solo en Drive.',
    detalle: 'Vigila 0 · Entrada, transcribe cada vídeo nuevo, reconoce de qué guion es y lo mueve a su carpeta. El calendario sigue a Drive: se ve qué está por grabar, sin editar, editado o publicado.',
    estado: 'activo',
    icono: 'carpeta',
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
    ruta: 'editor',
    nombre: 'Editor de reels',
    resumen: 'Monta tus reels en bruto según tu manual: formato, cortes, capturas reales y subtítulos.',
    detalle: 'Cuando entra un vídeo —por el conector de Claude o por la carpeta de Drive— sigue tu manual de edición paso a paso. Aquí se ve el proceso en vivo. El motor de render está en construcción.',
    estado: 'construido',
    abrible: true,
    icono: 'editor',
    soloAdmin: true,
  },
  {
    key: 'portadas',
    ruta: 'portadas',
    nombre: 'Portadas',
    resumen: 'Tus reels con su portada y, en cada uno, una nueva: el fotograma real, el texto y la serie.',
    detalle: 'Propone tres textos para la portada de cada reel, la compone en 1080×1920 con el kit de tu serie y te enseña cómo queda en la cuadrícula del perfil antes de descargarla en JPG o PNG.',
    estado: 'activo',
    icono: 'portadas',
  },
]

// Las partes del agente de contenido, en el orden en que se enseñan.
export const PARTES_CONTENIDO = [
  { key: 'creadores', ruta: '', nombre: 'Creadores' },
  { key: 'reels', ruta: 'reels', nombre: 'Reels' },
  { key: 'memoria', ruta: 'memoria', nombre: 'Memoria' },
]
