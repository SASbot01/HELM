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
]

// Las partes del agente de contenido, en el orden en que se enseñan.
export const PARTES_CONTENIDO = [
  { key: 'creadores', ruta: '', nombre: 'Creadores' },
  { key: 'reels', ruta: 'reels', nombre: 'Reels' },
  { key: 'memoria', ruta: 'memoria', nombre: 'Memoria' },
]
