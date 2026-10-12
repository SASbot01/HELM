// AI para todo — sección Operaciones: cómo opera Silvestre AI a sus clientes
// con HELM, para que quien lee lo replique con los suyos.
//
// Cada hilo usa los mismos bloques que un capítulo de la guía (h2/h3/p/lista/
// pasos/aviso/prompt/codigo/tabla) y se pinta igual. Todo lo que se cuenta
// existe en el código de HELM, comprobado el 12/10/2026 contra:
//   src/helm/permisos.js, api/equipo.js        roles, niveles y qué ve cada uno
//   src/helm/views/Onboarding.jsx              el formulario y las dos Biblias
//   api/_lib/equipo.js                         el equipo de agentes y sus horarios
//   api/_lib/ingesta.js, scripts/agents-worker  Drive: «0 · Entrada» y las fases
//   api/mcp/[token].js, src/helm/Creditos.jsx  el conector de Claude
//   api/formularios.js, plugins/Formularios    formularios → contacto del CRM
//   api/_lib/creditos.js, api/register.js      créditos, packs y el regalo
// Si cambia algo de eso, se cambia aquí.

export const HELM_REGISTRO = 'https://helm.s4sf.net/registro'
export const HELM_WEB = 'https://helm.s4sf.net'

const base = { seccion: 'operaciones', fecha: '2026-10-12' }

export default [
  {
    ...base,
    slug: 'como-damos-de-alta-a-un-cliente',
    tema: 'clientes',
    titulo: 'Cómo damos de alta a un cliente en HELM',
    gancho: 'Un cliente nuevo, operativo en una tarde',
    resumen: 'El orden exacto que seguimos con cada cliente: su perfil, el onboarding que se convierte en su Biblia, las integraciones y quién del equipo ve qué.',
    lectura: '7 min',
    bloques: [
      { tipo: 'p', texto: 'En Silvestre AI llevamos las redes, el contenido y las ventas de nuestros clientes. Todo eso vive en un solo sitio: **HELM**, el software que hemos construido para operar. Este hilo es el procedimiento que seguimos cada vez que entra un cliente nuevo, tal cual, para que lo copies con los tuyos.' },

      { tipo: 'h2', texto: 'Agencia, perfiles y equipo' },
      { tipo: 'p', texto: 'HELM se organiza en tres capas, y entenderlas ahorra mucho lío:' },
      { tipo: 'lista', items: [
        '**La agencia** eres tú. Te registras con su nombre y entras como administrador. El saldo de créditos y el conector de Claude son de la agencia.',
        '**Los perfiles** son tus clientes. Cada uno tiene su CRM, su calendario de contenido, sus agentes y sus integraciones, sin mezclarse con los demás.',
        '**El equipo** son las personas que trabajan en cada perfil: closers, setters, CSM, editores. Cada una entra con su cuenta y ve solo lo suyo.',
      ] },

      { tipo: 'h2', texto: 'El alta, paso a paso' },
      { tipo: 'pasos', items: [
        { titulo: 'Crea el perfil', texto: 'Desde el tablero de perfiles, **Nuevo perfil**. Es la ficha del cliente: a partir de aquí todo lo que hagas queda dentro de ella.' },
        { titulo: 'Rellena el onboarding de contenido', texto: 'En **Onboarding** está el formulario de marca y negocio: quién es, su tono, su oferta, su cliente y su mina de contenido. Se autoguarda, así que puedes hacerlo en la llamada con el cliente o mandárselo.' },
        { titulo: 'Genera la Biblia', texto: 'Al completarlo, la IA sintetiza las respuestas en dos documentos: la **Biblia de Empresa** y la **Biblia de Contenido**. Es lo que la IA del perfil lee antes de cada guion, email o respuesta. Se puede leer, editar y regenerar.' },
        { titulo: 'Conecta sus herramientas', texto: 'En **Ajustes → Integraciones**: Stripe o WooCommerce para las ventas, Calendly para las llamadas, Instagram para las métricas, Google para Calendar y Drive, y Telegram para hablar con su IA desde el móvil.' },
        { titulo: 'Da acceso al equipo', texto: 'En **Equipo** das de alta a cada persona con su rol y, aparte, su acceso al panel con su correo y contraseña.' },
      ] },
      { tipo: 'aviso', variante: 'truco', titulo: 'La Biblia primero, siempre', texto: 'Sin Biblia la IA escribe en genérico. Con ella, el primer guion ya suena al cliente. Por eso HELM enseña un aviso en el Informe hasta que el onboarding está hecho.' },

      { tipo: 'h2', texto: 'Quién ve qué: roles y permisos' },
      { tipo: 'p', texto: 'Un closer no tiene por qué ver las finanzas del negocio ni lo que cobra cada compañero. HELM separa dos cosas: qué **secciones ve** cada rol (lo que no ve, no existe para él, ni por la URL) y, de lo que ve, qué **puede editar**. Lo que trae de serie:' },
      { tipo: 'tabla', cabecera: ['Rol', 'Ve', 'Edita'], filas: [
        ['Closer', 'CRM, Diario, Tareas', 'CRM, Ventas, Diario, Tareas'],
        ['Setter', 'CRM, Diario, Tareas', 'CRM, Diario, Tareas'],
        ['CSM', 'CRM, Diario, Tareas, Formularios, Biblioteca', 'Lo mismo'],
        ['Editor', 'Agentes, Tareas, Biblioteca, Equipos IA', 'Agentes, Tareas'],
      ] },
      { tipo: 'p', texto: 'Las dos matrices se cambian en **Ajustes → Permisos**. Por encima del rol está el nivel de acceso (propietario, admin o miembro): el propietario y el admin lo ven todo de su perfil, y el dueño nunca se queda fuera de su propio negocio.' },
      { tipo: 'aviso', variante: 'dato', titulo: 'El editor ve la estrategia', texto: 'De serie el editor ve Agentes y Equipos IA: la estrategia que ejecuta. Sin ella graba y monta a ciegas.' },

      { tipo: 'h2', texto: 'Hazlo con tus clientes' },
      { tipo: 'p', texto: 'Créate la cuenta de tu agencia, da de alta a tu primer cliente y pásale el onboarding esta misma semana. Entras con créditos de regalo para probar la IA desde el primer día.' },
    ],
    claves: [
      'Agencia (tú) → perfiles (tus clientes) → equipo (quien trabaja en cada uno).',
      'El onboarding se convierte en dos Biblias, y la IA escribe con ellas.',
      'Cada rol ve solo sus secciones; se ajusta en Ajustes → Permisos.',
    ],
  },

  {
    ...base,
    slug: 'contenido-automatico-de-referencias-a-drive',
    tema: 'contenido',
    titulo: 'El contenido automático: de los creadores de referencia al Drive',
    gancho: 'Guiones escritos, calendario lleno y vídeos que se ordenan solos',
    resumen: 'Cómo sale el contenido de nuestros clientes: creadores de referencia transcritos, un equipo de agentes que escribe los guiones de la semana, y un Drive donde subes el vídeo y HELM lo coloca.',
    lectura: '9 min',
    bloques: [
      { tipo: 'p', texto: 'El contenido es lo que más horas come en una agencia. Nosotros lo hemos convertido en una cadena con cuatro eslabones: **referencias → guiones → calendario → Drive**. Te cuento cada uno tal y como funciona hoy en HELM.' },

      { tipo: 'h2', texto: 'Los creadores de referencia' },
      { tipo: 'p', texto: 'Cada perfil tiene asignados unos **creadores de referencia**: cuentas que ya funcionan en su nicho. HELM descarga sus reels, los transcribe frase a frase y los etiqueta: el papel de cada frase (gancho, planteamiento, remate o venta), el tipo de gancho, la estructura, el tema y la llamada a la acción. Ese banco es el **corpus**, y se ve en la sección **Agentes**.' },
      { tipo: 'p', texto: 'Cada lunes, el agente de **virales** rastrea los reels recientes de esos creadores, elige los 8 que mejor sirven para inspirar la semana y los mete en el corpus.' },

      { tipo: 'h2', texto: 'El equipo de agentes' },
      { tipo: 'p', texto: 'Cada perfil tiene un equipo de siete agentes que comparten memoria. Corren solos dentro de HELM:' },
      { tipo: 'tabla', cabecera: ['Agente', 'Qué hace'], filas: [
        ['Director', 'Cada mañana mira calendario, agenda, tareas y memoria, deja el plan del día y reparte encargos'],
        ['Investigador', 'Estudia los reels de los creadores de referencia y apunta los temas y ganchos que se repiten'],
        ['Analista', 'Compara las métricas de los reels propios y guarda conclusiones con cifras'],
        ['Productor', 'Sigue cada pieza de guion a publicado y avisa de lo que se atasca'],
        ['Comercial', 'Repasa leads, llamadas y cobros y avisa de lo que se enfría. No escribe a nadie'],
        ['Informe', 'Los lunes cruza contenido, leads y ventas de la semana'],
        ['Guionista', 'Escribe los guiones del día y los deja en el calendario como borrador'],
      ] },
      { tipo: 'p', texto: 'Y uno más, el **programador**: cada lunes prepara los guiones de la semana entrante por tipo. Si el calendario ya tiene suficientes de un tipo, no repite; si faltan, los escribe en los mejores días libres. También se lanza a mano para el periodo que quieras.' },
      { tipo: 'aviso', variante: 'ojo', titulo: 'Los agentes proponen, tú apruebas', texto: 'Lo que un agente no puede hacer está en el código, no en el prompt: el guionista solo deja borradores, ninguno borra ni cambia lo que ya hay en el calendario, y ninguno toca el CRM, las ventas ni las tareas. Las tareas que proponen solo pasan a Tareas cuando el dueño las acepta.' },

      { tipo: 'h2', texto: 'El calendario: cuatro tipos de pieza' },
      { tipo: 'p', texto: 'Cada guion lleva un tipo, y el tipo decide para qué sirve y dónde acaba en Drive. El reparto semanal que usa el programador por defecto:' },
      { tipo: 'tabla', cabecera: ['Tipo', 'Piezas por semana'], filas: [
        ['Viralidad', '3'], ['Autoridad', '2'], ['Conversión', '1'], ['Venta', '0 (salvo que lo pidas)'],
      ] },
      { tipo: 'p', texto: 'Cada guion pasa por estas fases: **borrador** (espera tu aprobación) → **por grabar** → **sin editar** → **editado** → **publicado**. En **Roadmap** ves el plan a seis meses, mes a mes y semana a semana, y al abrir un día aparecen los guiones que ya tiene programados.' },

      { tipo: 'h2', texto: 'Drive: subes el vídeo y HELM lo ordena' },
      { tipo: 'p', texto: 'Cada perfil tiene su carpeta en el Drive de contenido con una estructura fija:' },
      { tipo: 'codigo', titulo: 'La carpeta de un perfil', texto: 'Instagram /\n  0 · Entrada\n  1 · Sin editar / Viralidad · Conversión · Autoridad · Venta\n  2 · Editados   / (los mismos cuatro)\n  3 · Publicados\n  Recursos', nota: 'Cada pieza es una carpeta «AAAA-MM-DD · Título». Dónde está la carpeta ES su estado: no hay otro sitio que mantener.' },
      { tipo: 'pasos', items: [
        { titulo: 'Graba y sube a «0 · Entrada»', texto: 'El cliente o tu equipo sube el vídeo tal cual, sin renombrarlo.' },
        { titulo: 'HELM lo escucha', texto: 'Cada cinco minutos mira la Entrada. Transcribe el principio del vídeo y lo compara con los guiones del calendario.' },
        { titulo: 'Lo coloca en su pieza', texto: 'Si sabe de qué guion es, lo mueve a «1 · Sin editar / <tipo>», dentro de la carpeta de esa pieza. Si no lo sabe, lo deja en Entrada: mejor quieto que mal puesto.' },
      ] },
      { tipo: 'aviso', variante: 'truco', titulo: 'Graba el guion como está escrito', texto: 'HELM reconoce el vídeo por lo que se dice. Cuanto más se parezca lo grabado al guion, más fácil lo coloca solo. Lo que se quede en Entrada se ordena con un clic o desde Claude.' },

      { tipo: 'h2', texto: 'Hazlo con tus clientes' },
      { tipo: 'p', texto: 'Esta cadena es la misma para cualquier perfil que des de alta en HELM. Créate la cuenta, asigna los creadores de referencia de tu cliente y deja que el programador te llene la semana.' },
    ],
    claves: [
      'Referencias transcritas y etiquetadas → guiones con su tipo → calendario → Drive.',
      'Siete agentes por perfil, más el programador de los lunes; ninguno publica ni borra nada.',
      'Subes el vídeo a «0 · Entrada» y HELM lo mueve a su pieza.',
    ],
  },

  {
    ...base,
    slug: 'conecta-helm-a-claude',
    tema: 'claude',
    titulo: 'Opera a tus clientes desde Claude con el conector de HELM',
    gancho: 'Todos tus clientes, dentro de tu chat de Claude',
    resumen: 'Con un enlace, Claude lee el corpus, el calendario y las métricas de cada cliente, y programa guiones en HELM. Lo que Claude haga en tu cuenta no gasta créditos.',
    lectura: '6 min',
    bloques: [
      { tipo: 'p', texto: 'Buena parte de nuestro trabajo de estrategia lo hacemos hablando con Claude. No copiando y pegando datos: Claude está **conectado a HELM** y lee lo de cada cliente directamente. Es un conector MCP, el enchufe universal entre Claude y otras herramientas.' },

      { tipo: 'h2', texto: 'Cómo se conecta' },
      { tipo: 'pasos', items: [
        { titulo: 'Genera el enlace en HELM', texto: 'En el panel de **Créditos** de tu agencia está **Conector de Claude → Generar enlace**. Un enlace sirve para todos los perfiles de la agencia.' },
        { titulo: 'Guárdalo como una contraseña', texto: 'Solo se enseña una vez y quien lo tenga entra a tus perfiles. Si se filtra, generas uno nuevo y el anterior deja de funcionar.' },
        { titulo: 'Añádelo en claude.ai', texto: 'En los conectores de Claude, **Añadir conector personalizado**, y pegas el enlace.' },
      ] },
      { tipo: 'codigo', titulo: 'La forma del enlace', texto: 'https://helm.s4sf.net/api/mcp/<tu-token>' },

      { tipo: 'h2', texto: 'Las herramientas que le da a Claude' },
      { tipo: 'tabla', cabecera: ['Herramienta', 'Para qué'], filas: [
        ['`perfiles`', 'Tus clientes y los creadores de referencia de cada uno'],
        ['`identidades`', 'Los creadores de referencia, por tipo de contenido, y cuántos reels tiene cada uno'],
        ['`corpus`', 'Todo de un creador o de un perfil: reels transcritos frase a frase, etiquetas, métricas y memoria'],
        ['`calendario`', 'Los guiones de un perfil con su fecha, tipo y fase, y los vídeos que no se supo dónde colocar'],
        ['`programar_guiones`', 'Mete guiones en el calendario con su tipo, o corrige uno'],
        ['`ordenar_video`', 'Coloca un vídeo que se quedó en «0 · Entrada»'],
        ['`metricas`', 'Las métricas reales de Instagram del perfil y un estudio ya calculado de qué funciona'],
        ['`anadir_reels`', 'Añade reels al corpus por su enlace; se transcriben por detrás'],
        ['`asignar_creadores`', 'Asigna o quita creadores de referencia a un perfil'],
        ['`etiquetar_reels`', 'Corrige las etiquetas de un reel; lo tuyo ya no se pisa'],
        ['`guardar_memoria`', 'Guarda una conclusión para que vuelva a salir la próxima vez'],
      ] },
      { tipo: 'aviso', variante: 'ojo', titulo: 'Revisa las etiquetas', texto: 'El etiquetado automático lo hace un modelo local pequeño y se equivoca. Cuando Claude analice reels, pídele que corrija con `etiquetar_reels` lo que no encaje con el guion.' },

      { tipo: 'h2', texto: 'Cómo lo usamos en el día a día' },
      { tipo: 'prompt', titulo: 'La semana de un cliente', texto: 'Mira el calendario del perfil de mi cliente para los próximos 7 días. Con su corpus, escríbeme los guiones que falten para tener 3 de viralidad, 2 de autoridad y 1 de conversión, y prográmalos en los días libres con su tipo.' },
      { tipo: 'prompt', titulo: 'Qué le funciona', texto: 'Trae las métricas de Instagram del perfil de los últimos 30 días. Cruza las piezas más vistas y las más guardadas con su calendario y dime qué ganchos y temas rinden. Guarda las tres conclusiones más claras en la memoria.' },
      { tipo: 'prompt', titulo: 'Vídeos sin colocar', texto: 'Mira en el calendario qué vídeos se han quedado en «0 · Entrada» sin guion y dime de cuál crees que es cada uno. Cuando te confirme, ordénalos.' },
      { tipo: 'aviso', variante: 'dato', titulo: 'Tu Claude, tu cuenta', texto: 'Lo que Claude piensa y escribe en tu cuenta de claude.ai lo pagas tú a Anthropic, como siempre: **no gasta créditos de HELM**. Solo gasta créditos cuando el conector le pide a HELM que use su propia IA.' },

      { tipo: 'h2', texto: 'Hazlo con tus clientes' },
      { tipo: 'p', texto: 'Créate la cuenta de tu agencia en HELM, da de alta un cliente, genera el enlace y pídele a Claude su primera semana de guiones.' },
    ],
    claves: [
      'Un enlace por agencia, generado en el panel de Créditos.',
      'Claude lee corpus, calendario y métricas, y programa guiones en HELM.',
      'Lo que Claude haga en tu cuenta no gasta créditos.',
    ],
  },

  {
    ...base,
    slug: 'crm-y-formularios',
    tema: 'ventas',
    titulo: 'El CRM y los formularios: de la landing a la ficha del cliente',
    gancho: 'Cada lead, en su sitio y con su historia',
    resumen: 'Cómo llevamos las ventas de nuestros clientes: pipelines por perfil, formularios que crean el contacto solos y el equipo comercial viendo solo lo suyo.',
    lectura: '6 min',
    bloques: [
      { tipo: 'p', texto: 'El contenido trae gente; el CRM es donde no se pierde. Cada perfil de HELM tiene su propio CRM, y los formularios de sus landings escriben directamente en él.' },

      { tipo: 'h2', texto: 'El CRM de cada perfil' },
      { tipo: 'lista', items: [
        '**Pipeline en tablero**: arrastras cada contacto de etapa en etapa, o lo ves en lista.',
        '**Varios pipelines por perfil**: ventas, partnerships, soporte… cada uno con sus etapas y subetapas.',
        '**Etapas editables**: renombrar una etapa no mueve a nadie de sitio, porque el contacto guarda la clave y no la etiqueta.',
        '**Ficha del contacto**: sus datos, su actividad y las respuestas de todos los formularios que ha rellenado.',
      ] },

      { tipo: 'h2', texto: 'Los formularios' },
      { tipo: 'p', texto: 'En **Formularios** construyes el formulario y lo compartes con su enlace público, o lo conectas a la landing de tu cliente. Cuando alguien lo envía, HELM hace tres cosas:' },
      { tipo: 'pasos', items: [
        { titulo: 'Busca o crea el contacto', texto: 'En el CRM del perfil. Reconoce el mismo teléfono aunque venga escrito de otra forma.' },
        { titulo: 'Guarda las respuestas en su ficha', texto: 'Pegadas al contacto, para siempre.' },
        { titulo: 'Lo deja en su actividad', texto: 'Para que el closer o el setter vea de dónde viene antes de llamar.' },
      ] },
      { tipo: 'p', texto: 'Trae plantillas para los momentos de un servicio: onboarding y análisis inicial, satisfacción del primer mes y cierre. Un mismo cliente pasa por varias y todas quedan en su ficha.' },
      { tipo: 'aviso', variante: 'dato', titulo: 'Así lo hacemos aquí', texto: 'Nuestras propias landings funcionan así: cada lead entra como contacto en el CRM de nuestro perfil de HELM, en el embudo que le toca, con sus UTM.' },

      { tipo: 'h2', texto: 'Las ventas, cerradas en el mismo sitio' },
      { tipo: 'p', texto: 'Con Stripe o WooCommerce conectados en **Ajustes → Integraciones**, las ventas entran solas; con Calendly, las llamadas. El agente **comercial** repasa cada día leads, llamadas y cobros y avisa de lo que se enfría, sin escribir nunca a nadie por su cuenta. Y en **Informe** ves lo facturado por periodo y por programa.' },

      { tipo: 'h2', texto: 'Hazlo con tus clientes' },
      { tipo: 'p', texto: 'Créate la cuenta, da de alta a tu cliente y monta su primer formulario: el próximo lead de su landing ya aparecerá en su CRM.' },
    ],
    claves: [
      'Un CRM por perfil, con varios pipelines y etapas editables.',
      'Los formularios crean el contacto y guardan las respuestas en su ficha.',
      'Ventas y llamadas entran por las integraciones; el comercial avisa, no escribe.',
    ],
  },

  {
    ...base,
    slug: 'como-se-paga-helm-creditos',
    tema: 'creditos',
    titulo: 'Cómo se paga HELM: créditos, sin suscripción',
    gancho: 'Pagas lo que usa tu IA, nada más',
    resumen: 'Sin cuota ni permanencia: compras créditos y la IA de HELM los gasta al trabajar para tus clientes. 1 € = 100 créditos, y al registrarte te regalamos para probar.',
    lectura: '4 min',
    bloques: [
      { tipo: 'p', texto: 'HELM no tiene suscripción. Lo que cuesta de verdad es la IA, así que se paga eso: la agencia compra créditos por adelantado y se descuentan cuando la IA de HELM trabaja para sus perfiles.' },

      { tipo: 'h2', texto: 'Las cuentas' },
      { tipo: 'tabla', cabecera: ['Qué', 'Cómo es'], filas: [
        ['Cambio', '**1 € = 100 créditos**'],
        ['Al registrarte', '**200 créditos** de regalo para probar'],
        ['Packs', '10 €, 25 €, 50 € y 100 €, sin descuentos por volumen'],
        ['Cuota', 'Ninguna. Sin permanencia'],
      ] },

      { tipo: 'h2', texto: 'Qué gasta créditos y qué no' },
      { tipo: 'lista', items: [
        '**Gasta**: la IA de HELM en el panel, el contenido automático (los agentes y el programador) y cuando el conector de Claude le pide a HELM que use su IA.',
        '**No gasta**: lo que Claude piensa y escribe en tu propia cuenta de claude.ai. Eso lo pagas a Anthropic, como siempre.',
      ] },
      { tipo: 'p', texto: 'Cada llamada se cobra según lo que consume. En **Movimientos** ves cada cargo con su perfil, de dónde viene (panel, contenido automático o conector de Claude) y sus tokens.' },
      { tipo: 'aviso', variante: 'ojo', titulo: 'Sin saldo, la IA se para', texto: 'Antes de cada llamada HELM mira el saldo. Si está a cero, la IA de tus perfiles deja de trabajar hasta que recargas; el resto del panel sigue igual.' },

      { tipo: 'h2', texto: 'Cómo se recarga' },
      { tipo: 'pasos', items: [
        { titulo: 'Abre Créditos', texto: 'El botón con tu saldo está en la cabecera del tablero de perfiles.' },
        { titulo: 'Elige un pack', texto: 'Se paga con tarjeta, con Stripe, y los créditos se suman al saldo de la agencia.' },
      ] },

      { tipo: 'h2', texto: 'Hazlo con tus clientes' },
      { tipo: 'p', texto: 'Regístrate, usa los créditos de regalo con tu primer cliente y recarga solo cuando veas que te compensa.' },
    ],
    claves: [
      'Sin suscripción: 1 € = 100 créditos, y 200 de regalo al registrarte.',
      'Gasta la IA de HELM; lo que hace Claude en tu cuenta, no.',
      'Cada cargo se ve en Movimientos, con su perfil y sus tokens.',
    ],
  },
]
