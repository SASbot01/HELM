// Agent OS — el catálogo de agentes.
//
// Cada agente es una cosa que corre sola y produce algo. Lo que NO es un
// agente: las identidades y la memoria, que son material compartido que todos
// usan. Por eso van aparte y no como una casilla más del catálogo.
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
    key: 'reels',
    ruta: 'reels',
    nombre: 'Analista de reels',
    resumen: 'Pega enlaces y te dice qué gancho funciona.',
    detalle: 'Descarga el audio, lo transcribe con Whisper y etiqueta el guion frase a frase. Todo acaba en una gráfica donde cada punto es un reel.',
    estado: 'activo',
    // Qué número enseña la casilla. Se resuelve contra el estado real; si no
    // hay dato, la casilla no inventa un cero.
    metrica: 'corpus',
    icono: 'grafica',
  },
  {
    key: 'guiones',
    nombre: 'Escritor de guiones',
    resumen: 'Escribe la semana con tu marca y lo que ya funcionó.',
    detalle: 'Coge el calendario, el contexto de la identidad y los ganchos que mejor rindieron, y propone los guiones de la semana para que tú los apruebes.',
    estado: 'construido',
    icono: 'pluma',
  },
  {
    key: 'drive',
    nombre: 'Ingesta de Drive',
    resumen: 'Ordena solo lo que grabas.',
    detalle: 'Vigila una carpeta de entrada, transcribe cada vídeo nuevo, adivina a qué guion pertenece y lo renombra y mueve a su sitio.',
    estado: 'construido',
    icono: 'carpeta',
  },
  {
    key: 'informe',
    nombre: 'Informe semanal',
    resumen: 'Qué funcionó, qué no y qué hacer la semana que viene.',
    detalle: 'Cruza las métricas de contenido con los leads y las ventas, y escribe la conclusión. Lo que aprende sube o baja el peso de cada gancho.',
    estado: 'construido',
    icono: 'informe',
  },
]

// Material compartido. No son agentes: son de lo que comen los agentes.
export const RECURSOS = [
  {
    key: 'identidades', ruta: 'identidades', nombre: 'Identidades', icono: 'persona',
    resumen: 'Estilos de creador con todo su contexto. De aquí bebe la IA para escribir como alguien.',
  },
  {
    key: 'memoria', ruta: 'memoria', nombre: 'Memoria', icono: 'memoria',
    resumen: 'Lo que hay que recordar entre sesiones: conclusiones, reglas que funcionan, errores a no repetir.',
  },
]
