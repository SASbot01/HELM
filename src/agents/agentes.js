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

// Los departamentos: cada agente trabaja en uno. En el menú se entra por
// departamento, como a una oficina; el Equipo de agentes los enseña todos.
export const DEPARTAMENTOS = [
  {
    key: 'contenido',
    nombre: 'Departamento de contenido',
    resumen: 'Estudia a tus referentes, planifica los guiones, edita los reels y prepara portadas y pruebas.',
    icono: 'contenido',
  },
  {
    key: 'ventas',
    nombre: 'Departamento de ventas',
    resumen: 'Atiende a quien te escribe, lo cualifica y lo lleva a la llamada.',
    icono: 'setter',
  },
  {
    key: 'webs',
    nombre: 'Departamento de webs',
    resumen: 'Estudia el sector de cada cliente y prepara su web.',
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
    resumen: 'Monta tus reels en bruto según tu manual: formato, cortes, capturas reales y subtítulos.',
    detalle: 'Cuando entra un vídeo por el conector de Claude, sigue tu manual de edición paso a paso. Aquí se ve el proceso en vivo. El motor de render está en construcción.',
    estado: 'construido',
    abrible: true,
    icono: 'editor',
    soloAdmin: true,
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
    estado: 'activo',
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
]

// Las partes del agente de contenido, en el orden en que se enseñan.
export const PARTES_CONTENIDO = [
  { key: 'creadores', ruta: '', nombre: 'Creadores' },
  { key: 'reels', ruta: 'reels', nombre: 'Reels' },
  { key: 'memoria', ruta: 'memoria', nombre: 'Memoria' },
]
