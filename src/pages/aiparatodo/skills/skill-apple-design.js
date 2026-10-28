// Hilo de la sección «Skills y repos», tema «diseño». Lead magnet del reel
// «Tu web huele a IA (y por eso nadie se la toma en serio)» (comenta APPLE).
// Datos comprobados el 28/10/2026 con gh api, leyendo el repo sin ejecutar nada:
// - emilkowalski/skills (MIT, 51.059★, push 2026-10-28): 16 skills para
//   diseño e interfaces de Emil Kowalski (Design Engineer; el README cuenta su
//   experiencia en Vercel y Linear). Instalación del README:
//   npx skills@latest add emilkowalski/skills (las 16). Con --skill apple-design
//   (opción de la CLI vercel-labs/skills) se instala solo esta.
// - skills/apple-design/SKILL.md: un solo archivo, 290 líneas, 17 apartados
//   numerados y una tabla de referencia rápida. Se basa en las charlas de
//   diseño de la WWDC, sobre todo Designing Fluid Interfaces (2018), y cita
//   también The Details of UI Typography (2020), Designing Audio-Haptic
//   Experiences y Principles of Great Design (2026). Último cambio en la skill:
//   15/09/2026. Si se llama sin pregunta, contesta solo una frase fija en inglés.
// No es oficial de Apple ni de Anthropic. Lo de Node.js, -g, /reload-skills y
// la telemetría de la CLI está comprobado en el hilo plugins-claude-code.

const SKILL = 'https://github.com/emilkowalski/skills/tree/main/skills/apple-design'

export default {
  slug: 'skill-apple-design',
  seccion: 'skills',
  tema: 'diseno',
  tipo: 'guia',
  titulo: 'Apple Design: la skill para que tu web no huela a IA',
  gancho: 'Que tu web no huela a IA',
  resumen: 'La skill de Emil Kowalski que le enseña a tu agente a diseñar con el criterio de Apple: lo que cuentan sus charlas de diseño de la WWDC, sobre todo Designing Fluid Interfaces, pasado a la web en 17 apartados. Tipografía, espaciado, jerarquía, materiales, accesibilidad y animaciones con muelles. Con la instalación, cómo usarla para diseñar y para revisar lo que ya tienes, y los prompts.',
  fecha: '2026-10-28',
  lectura: '7 min',
  nota: 'No es una skill oficial de Apple ni de Anthropic: es un proyecto independiente de Emil Kowalski, gratis y de código abierto (MIT). Está pensada para webs (CSS y JavaScript). Comprobada en su repo el 28/10/2026.',
  portada: '/aiparatodo/apple-design.webp',
  instalarTodo: null,
  skills: [
    {
      n: '01', clave: 'apple-design', nombre: 'Qué es', corto: 'el criterio de diseño de Apple, en una skill para tu agente',
      titular: 'Por qué tu web huele a IA (y qué hace esta skill)',
      historia: 'Las webs hechas con IA tienen tics que se reconocen enseguida. Antes eran los degradados morados, los botones que brillan y la franja de color en el lateral de cada tarjeta. Ahora son los titulares enormes en serif y cursiva sobre fondo negro o crema, intentando parecer caros. Emil Kowalski lo resume así: los agentes no tienen buen gusto. Eligen la curva de animación equivocada o un borde sólido donde iría una sombra suave, y esos detalles se suman. Esta skill le da a tu agente el criterio de Apple: lo que explican sus charlas de diseño de la WWDC, sobre todo Designing Fluid Interfaces (2018), traducido a la web. La idea de fondo es que una interfaz se siente viva cuando responde al instante, se mueve como un objeto real y la puedes coger y darle la vuelta a mitad de movimiento. Tu agente la sigue cuando diseña y también la usa para revisar lo que ya tienes hecho.',
      puedes: [
        'Diseñar una web o una app con el criterio de Apple desde el primer prompt',
        'Revisar lo que ya tienes: tipografía, espaciado, jerarquía, contraste y animaciones',
        'Arreglar las animaciones que se sienten «de plantilla»: rebotes donde no tocan y saltos al interrumpirlas',
        'Tener en cuenta a quien pide menos movimiento, menos transparencias o más contraste',
      ],
      autor: 'Emil Kowalski', oficial: false, repo: 'emilkowalski/skills', github: SKILL, licencia: 'MIT',
      ejemplos: [],
    },
    {
      n: '02', clave: 'instalacion', nombre: 'Instalación', corto: 'una orden en la terminal, o un solo archivo a mano',
      titular: 'Instálala en un minuto',
      historia: 'Se instala con la CLI de skills de Vercel, la de skills.sh. Con --skill apple-design te llevas solo esta. Sin esa opción te instala las 16 skills del repo, casi todas de animación. Con -g queda para todos tus proyectos; sin -g, solo para el proyecto en el que estás. Funciona en Claude Code y en otros agentes que usan skills: si quitas -a claude-code, la CLI te pregunta en cuáles instalarla. Como la skill es un único archivo (SKILL.md), también puedes descargarlo tú en la carpeta de skills de Claude Code.',
      puedes: [
        'Instalar solo esta skill o las 16 del repo',
        'Para todos tus proyectos (-g) o solo para uno',
        'Ver lo que tienes instalado: npx skills list -g',
        'Quitarla: npx skills remove -g apple-design',
      ],
      sueltaTitulo: 'Instalar en tu terminal',
      sueltaNota: 'Necesitas Node.js 22.20 o superior. Usa la primera orden o, si prefieres no usar la CLI, las dos de abajo (descargan el archivo a mano). Claude Code la detecta sin reiniciar; si la carpeta ~/.claude/skills no existía al abrir la sesión, escribe /reload-skills. La CLI manda telemetría anónima: se apaga con DISABLE_TELEMETRY=1.',
      suelta: 'npx skills add emilkowalski/skills --skill apple-design -g -a claude-code\n\n# o a mano, que es un solo archivo:\nmkdir -p ~/.claude/skills/apple-design\ncurl -fsSL https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md -o ~/.claude/skills/apple-design/SKILL.md',
      ejemplos: [],
    },
    {
      n: '03', clave: 'como-se-usa', nombre: 'Cómo se usa', corto: 'se activa sola al diseñar, o la llamas tú',
      titular: 'Se activa sola, o la llamas tú',
      historia: 'La descripción de la skill le dice a Claude cuándo usarla: al construir o revisar interfaces con gestos, animaciones con muelles, paneles que se arrastran, materiales translúcidos, tipografía o movimiento accesible. Si le pides una web o una revisión de diseño, la carga solo. También la puedes llamar tú con /apple-design. Un detalle: si la llamas sin preguntar nada, solo contesta con una frase en inglés diciendo que está lista. Después pídele lo que quieras en español. No te impone un estilo ni unos colores: te da criterio, así que combínala con tu marca.',
      puedes: [
        'Pedirle una página nueva que siga las reglas desde el principio',
        'Pasarle tu web y que te diga qué huele a IA y cómo arreglarlo',
        'Revisar solo las animaciones o solo la tipografía',
        'Llamarla a mano con /apple-design dentro de Claude Code',
      ],
      ejemplos: [
        { titulo: 'Revisar la web que ya tienes', texto: 'Usa la skill apple-design y revisa mi web (la carpeta de este proyecto). Dime, por orden de importancia, qué detalles hacen que parezca hecha con IA: tipografía, espaciado, jerarquía, sombras y bordes, y animaciones. Para cada uno explica el porqué en una frase y propón el cambio exacto en CSS. No toques nada hasta que te diga cuáles aplico.' },
        { titulo: 'Una landing nueva con criterio', texto: 'Con la skill apple-design, hazme la landing de [tu negocio] en HTML y CSS. Usa la fuente del sistema, titulares grandes con el espaciado entre letras ajustado y un texto cómodo de leer, y marca la jerarquía con peso y tamaño. Nada de degradados morados ni titulares en cursiva. Que los botones respondan al pulsar y que todo respete a quien tiene activado reducir el movimiento.' },
        { titulo: 'Arreglar las animaciones', texto: 'Con la skill apple-design, repasa todas las animaciones de este proyecto. Dime cuáles no se pueden interrumpir, cuáles rebotan sin que el usuario haya lanzado nada, cuáles entran por un lado y salen por otro y cuáles animan algo que no sea transform u opacity. Propón el arreglo de cada una con muelles y espera a que te diga cuáles aplico.' },
      ],
    },
    {
      n: '04', clave: 'movimiento', nombre: 'Movimiento', corto: 'respuesta inmediata, muelles e interrupciones',
      titular: 'El corazón de la skill: que todo se mueva como algo real',
      historia: 'Once de los 17 apartados van de movimiento. Lo primero es responder al pulsar, no al soltar: el botón reacciona en cuanto lo tocas. Lo que arrastras va pegado al dedo, respetando el punto por donde lo cogiste. Y el principio que la skill llama el más importante: toda animación se puede interrumpir y dar la vuelta en cualquier momento, partiendo de donde está el elemento en pantalla y no de donde iba a acabar. Para eso usa muelles (springs) en vez de animaciones de duración fija, con los dos parámetros que usa Apple: la amortiguación (cuánto rebota) y la respuesta (lo rápido que llega). Por defecto, sin rebote. El rebote solo se usa cuando el gesto trae impulso, por ejemplo al lanzar una tarjeta. Al soltar, la animación sigue a la velocidad del dedo y apunta a donde iba el gesto, como el scroll. Lo que entra por la derecha sale por la derecha, y en los bordes hay resistencia suave en vez de un tope seco.',
      puedesTitulo: 'Lo que le enseña a tu agente',
      puedes: [
        'Responder al pulsar y dar respuesta continua mientras arrastras, no solo al final',
        'Muelles por defecto sin rebote; un poco de rebote solo tras un gesto con impulso',
        'Valores que usa Apple: mover un elemento, amortiguación 1 y respuesta 0,4; un panel o cajón, 0,8 y 0,3',
        'Pasar la velocidad del dedo a la animación y calcular dónde acabaría el gesto',
        'Entrar y salir por el mismo camino, y que un menú nazca del botón que lo abre',
        'Resistencia progresiva en los bordes en vez de pararse en seco',
        'Animar solo transform y opacity para que vaya fluido',
      ],
      ejemplos: [],
    },
    {
      n: '05', clave: 'materiales-y-letra', nombre: 'Materiales, letra y accesibilidad', corto: 'transparencias, tipografía y movimiento reducido',
      titular: 'Materiales, tipografía y accesibilidad',
      historia: 'Las barras y los paneles se hacen como capas translúcidas por encima del contenido, con desenfoque, en vez de franjas opacas. Pero nunca una capa clara translúcida encima de otra, porque el texto deja de leerse. En tipografía, el espaciado entre letras depende del tamaño: los titulares grandes lo llevan más apretado y el texto pequeño, un poco más abierto. El interlineado va al revés: justo en los titulares y más holgado en el texto. La jerarquía se marca con peso, tamaño e interlineado a la vez, y antes de una fuente propia, la del sistema. Y la accesibilidad no se deja para el final: si alguien pide menos movimiento, los deslizamientos pasan a fundidos cortos; si pide menos transparencia, las capas se vuelven sólidas; y si pide más contraste, fondos casi sólidos con un borde claro.',
      puedesTitulo: 'Lo que le enseña a tu agente',
      puedes: [
        'Barras y paneles translúcidos con desenfoque, con el contenido pasando por debajo',
        'Espaciado entre letras según el tamaño, nunca uno fijo para todo',
        'Interlineado justo en los titulares y cómodo en el texto',
        'Medidas en rem para que la web no se rompa si el usuario agranda la letra',
        'Respetar las preferencias de reducir movimiento, reducir transparencia y más contraste',
      ],
      ejemplos: [],
    },
    {
      n: '06', clave: 'principios', nombre: 'Los 8 principios', corto: 'propósito, control, sencillez, oficio…',
      titular: 'Los 8 principios que hay detrás',
      historia: 'Todo lo anterior sirve a los ocho principios de diseño que Apple presentó en la WWDC de 2026, y que la skill usa para razonar. Propósito: decidir también lo que no se hace. Control: que la persona elija y pueda deshacer, y pedir confirmación solo en lo que no tiene vuelta atrás. Responsabilidad: privacidad y seguridad, sobre todo con IA. Familiaridad: apoyarse en lo que la gente ya conoce. Flexibilidad: adaptarse al dispositivo y a cada persona. Sencillez, que no es lo mismo que minimalismo. Oficio: ningún espaciado ni tiempo es casual. Y el disfrute, que sale de hacer bien los otros siete, no de añadir confeti. Cierra con el método: prototipar algo con lo que se pueda interactuar, diseñar la interacción y lo visual a la vez, y revisar las animaciones a cámara lenta.',
      puedes: [
        'Cuatro tipos de aviso: estado, completado, advertencia y error, y validar al escribir, no al enviar',
        'Que cada pantalla diga dónde estás, adónde puedes ir y cómo salir',
        'Cada control cerca de lo que cambia, y etiquetas concretas en vez de genéricas',
        'Lo habitual primero; lo avanzado, un nivel más abajo',
      ],
      ejemplos: [],
    },
    {
      n: '07', clave: 'ojo', nombre: 'Antes de instalarla', corto: 'lo que conviene saber',
      titular: 'Lo que conviene saber',
      historia: 'No es una skill oficial de Apple: es de Emil Kowalski, que la ha escrito a partir de las charlas públicas de la WWDC. Está pensada para webs (CSS, JavaScript y librerías de animación como Motion), no para apps nativas; para Swift, el mismo repo tiene write-swift. Está escrita en inglés, pero Claude la aplica igual cuando le hablas en español. Y no hace milagros con un mal encargo: te da criterio, pero lo que vendes, tu marca y tus colores los sigues poniendo tú. Si te gusta, el repo tiene otras 15 skills que se instalan igual, como review-animations (revisa tus animaciones con sus reglas), break-ui (intenta romper tu interfaz con datos extremos) o mobile-native (que tu web se sienta como una app en el móvil).',
      puedes: [
        'Gratis y de código abierto (MIT): puedes leerla entera antes de instalarla',
        'Más skills del mismo autor: npx skills add emilkowalski/skills --skill review-animations -g',
        'Para apps de iPhone en Swift, mejor write-swift, del mismo repo',
      ],
      ejemplos: [],
    },
  ],
}
