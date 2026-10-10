// Hilo de la sección Skills: las skills oficiales de documentos de Anthropic.
// Comprobado contra github.com/anthropics/skills (rama main), su
// .claude-plugin/marketplace.json, el LICENSE.txt de cada skill y el centro de
// ayuda de Claude el 06/10/2026.

const REPO = 'https://github.com/anthropics/skills'

// Las cuatro de documentos NO se copian sueltas: su licencia prohíbe copiarlas
// y guardar copias fuera de los servicios de Anthropic. Se instalan con el
// plugin oficial desde Claude Code, que es la vía que documenta Anthropic.
const PLUGIN_DOCS = {
  suelta: '/plugin marketplace add anthropics/skills\n/plugin install document-skills@anthropic-agent-skills',
  sueltaTitulo: 'Instalar en Claude Code (plugin oficial)',
  sueltaNota: 'Dentro de Claude Code. Instala las cuatro de documentos a la vez: su licencia no permite copiarlas sueltas. En la web y la app de Claude ya vienen de serie.',
}

const LICENCIA_DOCS = 'Propietaria de Anthropic, source-available (no es código abierto). Su LICENSE.txt te deja usarla dentro de los servicios de Anthropic según tus condiciones con ellos, pero prohíbe modificarla, redistribuirla y guardar copias fuera de esos servicios. La vía que documenta Anthropic para Claude Code es el plugin document-skills.'

export default {
  slug: 'skills-documentos-oficina',
  portada: '/aiparatodo/skills-documentos-oficina.webp',
  seccion: 'skills',
  tema: 'documentos',
  titulo: '5 skills de documentos para Claude',
  gancho: 'Word, Excel, PowerPoint y PDF sin abrirlos',
  resumen: 'Las cinco skills oficiales con las que Claude crea y edita archivos de Word, Excel, PowerPoint y PDF de verdad, y escribe contigo documentos largos que se entienden a la primera.',
  fecha: '2026-10-06',
  lectura: '9 min',
  nota: 'Las cinco son oficiales de Anthropic (repo anthropics/skills), pero con licencias distintas: docx, xlsx, pptx y pdf son source-available con licencia propietaria, es decir, se usan con Claude tal cual y no se modifican ni se comparten, y doc-coauthoring no trae archivo de licencia en su carpeta.',
  instalarTodo: {
    explica: 'En la web y la app de Claude no tienes que instalar nada: Word, Excel, PowerPoint y PDF vienen de serie con la ejecución de código y creación de archivos activada, y las ves en Customize > Skills. En Claude Code, las cuatro de documentos van en el plugin oficial «document-skills», y doc-coauthoring en «example-skills», que trae otras once. En tu ordenador estas skills tiran de herramientas que quizá no tengas, como LibreOffice, Python o Node: si algo falla, pídele a Claude que compruebe qué falta. Pega estas líneas una a una; cada install te abre un panel para elegir dónde instalarlo:',
    comando: '/plugin marketplace add anthropics/skills\n/plugin install document-skills@anthropic-agent-skills\n/plugin install example-skills@anthropic-agent-skills',
  },
  skills: [
    {
      n: '01',
      clave: 'docx',
      nombre: 'Word (docx)',
      titular: 'Contratos y propuestas en Word, bien hechos',
      corto: 'crea, edita y revisa documentos de Word con control de cambios y comentarios',
      historia: 'Un abogado freelance recibe el contrato del cliente y tiene que devolverlo marcado. Con esta skill Claude edita el .docx original sin tocar su formato, deja cada cambio como control de cambios a tu nombre y ancla los comentarios a la frase exacta. Y si partes de cero, monta la propuesta con índice, encabezados, tablas y número de página, en A4 por defecto.',
      puedes: [
        'Crear propuestas, informes y cartas con índice, encabezados y número de página',
        'Revisar un contrato con control de cambios a tu nombre y comentarios en la frase exacta',
        'Editar un Word que ya tienes sin perder su formato, y convertir los .doc antiguos',
        'Sacar una copia limpia con todos los cambios aceptados',
      ],
      autor: 'Anthropic',
      oficial: true,
      repo: 'anthropics/skills',
      ruta: 'skills/docx',
      github: `${REPO}/tree/main/skills/docx`,
      licencia: LICENCIA_DOCS,
      ...PLUGIN_DOCS,
      ejemplos: [
        { titulo: 'Revisar un contrato', texto: 'Te adjunto el contrato de prestación de servicios que me ha mandado un cliente. Revísalo defendiendo mis intereses como proveedor y devuélvemelo en Word con control de cambios a nombre de «Alex» y un comentario en cada cláusula que toques explicando por qué. Fíjate sobre todo en plazos de pago, propiedad intelectual y penalizaciones.' },
        { titulo: 'Propuesta para una agencia', texto: 'Crea en Word una propuesta comercial para una agencia pequeña que quiere 12 reels al mes. Portada, índice, problema del cliente, qué incluye, calendario, precio en una tabla y condiciones. A4, tipografía sobria y número de página en el pie.' },
      ],
    },
    {
      n: '02',
      clave: 'xlsx',
      nombre: 'Excel (xlsx)',
      titular: 'Hojas de cálculo con fórmulas que funcionan',
      corto: 'crea, limpia y edita hojas de cálculo con fórmulas vivas y sin errores',
      historia: 'Pedirle un Excel a una IA suele acabar en números escritos a mano: cambias un dato y no se recalcula nada. Esta skill obliga a Claude a usar fórmulas reales, a recalcular el archivo y a no entregarlo mientras quede una sola fórmula con error. Para una nutricionista con un curso online, eso es un control de ventas y gastos que sigue funcionando el mes que viene. Si la usas en Claude Code, ten LibreOffice instalado: es lo que usa para recalcular y comprobar.',
      puedes: [
        'Montar presupuestos y controles de gastos con fórmulas que se recalculan solas',
        'Limpiar un CSV desordenado (filas rotas, cabeceras fuera de sitio) y dejarlo en Excel',
        'Rellenar tu plantilla escribiendo solo en sus celdas de entrada, sin tocar sus fórmulas',
        'Modelos financieros con cada supuesto en su celda: en azul lo que tecleas, en negro lo calculado',
      ],
      autor: 'Anthropic',
      oficial: true,
      repo: 'anthropics/skills',
      ruta: 'skills/xlsx',
      github: `${REPO}/tree/main/skills/xlsx`,
      licencia: LICENCIA_DOCS,
      ...PLUGIN_DOCS,
      ejemplos: [
        { titulo: 'Presupuestos de un editor de vídeo', texto: 'Crea un Excel de presupuestos para mi servicio de edición de vídeo. Una pestaña «Tarifas» con el precio por reel, vídeo de YouTube y anuncio, y otra «Presupuesto» donde elijo tipo de pieza y cantidad y se calculan subtotal, IVA al 21 % y total. Todo con fórmulas, importes en euros y una fila de ejemplo rellena.' },
        { titulo: 'Cuentas de un curso online', texto: 'Te paso el CSV de ventas de mi plataforma de cursos y el extracto del banco del último trimestre. Monta un Excel con ingresos por mes, gastos por categoría (anuncios, herramientas, colaboradores) y beneficio neto, con un gráfico de evolución. Usa fórmulas, no números pegados, formato en euros y apunta en un comentario de dónde sale cada supuesto.' },
      ],
    },
    {
      n: '03',
      clave: 'pptx',
      nombre: 'PowerPoint (pptx)',
      titular: 'Presentaciones de venta que no parecen de IA',
      corto: 'crea y edita presentaciones, desde cero o sobre tu propia plantilla',
      historia: 'Una agencia pequeña tiene que presentar al cliente el jueves y no tiene diseñador. La skill hace que Claude elija una paleta pensada para tu tema, varíe la composición entre diapositivas, use gráficos nativos que luego editas en PowerPoint y evite los tics de las presentaciones hechas con IA, como la raya de color bajo cada título. Antes de entregar, pasa cada diapositiva a imagen y busca textos cortados y elementos solapados.',
      puedes: [
        'Montar un deck de venta desde cero con gráficos editables y notas del orador',
        'Rellenar tu plantilla de marca (.pptx o .potx) eligiendo la maqueta adecuada para cada bloque',
        'Sacar el texto de una presentación para resumirla o convertirla en un post',
        'Añadir, duplicar, reordenar o borrar diapositivas de un deck que ya tienes',
      ],
      autor: 'Anthropic',
      oficial: true,
      repo: 'anthropics/skills',
      ruta: 'skills/pptx',
      github: `${REPO}/tree/main/skills/pptx`,
      licencia: LICENCIA_DOCS,
      ...PLUGIN_DOCS,
      ejemplos: [
        { titulo: 'Deck de venta para un cliente', texto: 'Crea una presentación de 10 diapositivas para vender un servicio de gestión de redes a una clínica dental: problema, solución, cómo trabajamos, resultados con cifras grandes, tres planes de precio en columnas y siguiente paso. Gráficos nativos, notas del orador en cada diapositiva y una paleta que no sea el azul corporativo de siempre.' },
        { titulo: 'Tu webinar sobre tu plantilla', texto: 'Te adjunto la plantilla de mi marca (.potx) y el guion de mi webinar. Reparte el contenido usando las maquetas de la plantilla, varía la composición entre diapositivas y borra los huecos que sobren. Antes de dármela, revisa que no quede texto cortado ni texto de ejemplo de la plantilla.' },
      ],
    },
    {
      n: '04',
      clave: 'pdf',
      nombre: 'PDF',
      titular: 'Rellena, une y exprime cualquier PDF',
      corto: 'lee, crea, une, divide, rellena y protege archivos PDF',
      historia: 'La gestoría te pide un formulario rellenado, tienes doce facturas sueltas y el contrato escaneado no deja copiar ni una línea. Con esta skill Claude rellena formularios PDF (también los que no tienen campos rellenables, colocando el texto en su sitio), une y divide documentos, saca las tablas a Excel y aplica OCR a los escaneados para leer su texto. Además protege con contraseña, añade marcas de agua y crea PDFs nuevos desde cero.',
      puedes: [
        'Rellenar formularios PDF, tengan o no campos rellenables',
        'Unir facturas en un solo PDF o dividir uno largo por páginas',
        'Extraer las tablas de un PDF y pasarlas a Excel',
        'Leer PDFs escaneados con OCR y proteger los tuyos con contraseña o marca de agua',
      ],
      autor: 'Anthropic',
      oficial: true,
      repo: 'anthropics/skills',
      ruta: 'skills/pdf',
      github: `${REPO}/tree/main/skills/pdf`,
      licencia: LICENCIA_DOCS,
      ...PLUGIN_DOCS,
      ejemplos: [
        { titulo: 'Facturas del trimestre', texto: 'Te subo las facturas del trimestre en PDF. Únelas en un solo archivo ordenadas por fecha, añade una primera página con una tabla resumen (fecha, proveedor, base, IVA y total) y pásame también esa tabla en Excel para la gestoría.' },
        { titulo: 'Rellenar un formulario', texto: 'Rellena este formulario PDF de alta de proveedor con los datos de mi empresa que te pego abajo. Antes de rellenar, dime qué campos has encontrado y qué vas a poner en cada uno; deja en blanco los que no sepas y márcamelos. [pega aquí tus datos]' },
      ],
    },
    {
      n: '05',
      clave: 'doc-coauthoring',
      nombre: 'Doc Co-authoring',
      titular: 'Documentos largos escritos a cuatro manos',
      corto: 'te guía en tres fases para escribir propuestas, manuales y documentos que se entienden a la primera',
      historia: 'Un documento largo rara vez falla por la redacción: falla porque el autor sabe cosas que el lector no. Esta skill convierte a Claude en coautor con método: primero te saca todo el contexto a base de preguntas, luego construye el documento sección a sección (te propone de 5 a 20 ideas, tú eliges y él redacta) y al final lo pone a prueba con un Claude sin contexto para cazar lo que no se entiende (en Claude Code lo lanza él; en la web te guía para hacerlo en un chat nuevo). Sirve para el temario de un curso, una propuesta grande o el manual de tu negocio.',
      puedes: [
        'Volcar todo lo que sabes, desordenado, y que Claude te haga las preguntas que faltan',
        'Construir cada sección eligiendo entre ideas numeradas: «quédate con la 1, la 4 y la 7»',
        'Probar el documento con un Claude sin contexto que te dice qué no se entiende',
        'Traer contexto desde Slack, Google Drive u otros conectores si los tienes conectados',
      ],
      autor: 'Anthropic',
      oficial: true,
      repo: 'anthropics/skills',
      ruta: 'skills/doc-coauthoring',
      github: `${REPO}/tree/main/skills/doc-coauthoring`,
      licencia: 'Sin licencia declarada: su carpeta no trae LICENSE.txt y el repo no tiene una licencia general.',
      // Sin licencia declarada no hay permiso para copiarla: también por plugin.
      suelta: '/plugin marketplace add anthropics/skills\n/plugin install example-skills@anthropic-agent-skills',
      sueltaTitulo: 'Instalar en Claude Code (plugin oficial)',
      sueltaNota: 'Dentro de Claude Code. Viene en el plugin «example-skills», con otras once skills oficiales. Su carpeta no trae licencia, así que mejor por el plugin que copiándola suelta.',
      ejemplos: [
        { titulo: 'El manual de tu agencia', texto: 'Quiero escribir el manual de procesos de mi agencia de contenido para los dos editores nuevos. Usa el flujo de coautoría: hazme primero las preguntas de contexto y luego te cuento todo lo que sé de cómo trabajamos, aunque sea desordenado.' },
        { titulo: 'Propuesta para un cliente grande', texto: 'Ayúdame a escribir con el flujo de coautoría una propuesta para formar en IA al equipo de marketing de una cadena de gimnasios. La lectora es su directora de marketing, que la reenviará a dirección. Al terminar, haz la prueba de lector para ver si alguien sin contexto entiende el precio, el calendario y qué gana la empresa.' },
      ],
    },
  ],
}
