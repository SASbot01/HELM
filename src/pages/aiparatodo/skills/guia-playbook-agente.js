// Hilo de la sección «Skills y repos», tema «automatización». Lead magnet del
// reel «No construyas más agentes de IA. Haz esto en su lugar» (comenta
// PLAYBOOK). Guía de Silvestre AI: los 4 prompts del reel, tal cual, y la
// carpeta del playbook. Fuentes comprobadas el 01/11/2026:
// - Anthropic, «Building effective agents» (19/12/2024).
// - Anthropic, «Equipping agents for the real world with Agent Skills»
//   (16/10/2025): una skill es una carpeta con instrucciones, scripts y
//   recursos; se carga por partes (primero su nombre y descripción, luego el
//   cuerpo, luego los archivos que hagan falta).
// - Barry Zhang y Mahesh Murag (Anthropic), «Don't Build Agents, Build Skills
//   Instead», AI Engineer, noviembre de 2025: un agente general y una
//   biblioteca de skills, en vez de un agente por tarea.

const EFECTIVOS = 'https://www.anthropic.com/engineering/building-effective-agents'
const SKILLS = 'https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills'
const CHARLA = 'https://www.ai.engineer/talks/CEvIs9y1uog-agent-skills'

const ENTREVISTA = 'Quiero delegarte una parte de mi trabajo: [TAREA]. Entrevístame, una pregunta cada vez, hasta que sepas hacerla tú solo sin preguntarme nada: objetivo, pasos, herramientas, criterios de calidad, errores típicos y excepciones. No respondas ni propongas nada hasta que yo te diga «basta».'
const PLAYBOOK = 'Con todo lo que te he contado, escribe el PLAYBOOK de esta tarea: un manual que otra IA pueda seguir sin conocerme. Incluye: cuándo se usa, qué necesita de entrada, los pasos numerados, las reglas que no se pueden saltar y cómo es el resultado final. Corto, claro y en formato Markdown.'
const HERRAMIENTAS = 'Haz inventario de todo lo que usamos o creamos para esta tarea: archivos, plantillas, scripts aprobados y documentos. Ordénalos en una carpeta /herramientas y añade al playbook una sección «Herramientas» con un enlace a cada uno y la regla: «Si existe aquí, úsalo. No lo vuelvas a crear».'
const PRUEBA = 'Escribe la lista de comprobación de «trabajo terminado» para esta tarea: de 5 a 10 puntos que se puedan verificar con un sí o un no. Añádela al final del playbook con esta regla: «Antes de entregarme nada, revisa tu trabajo punto por punto, corrige lo que falle y dime qué has comprobado».'

const PLANTILLA = `# Playbook: [TAREA]

## Cuándo se usa
- [La situación que lo pone en marcha]
- No se usa para: [lo que se parece pero no es]

## Qué necesita de entrada
- [Dato o archivo] (de dónde sale)
- Si falta algo: [a quién preguntar o qué hacer]

## Pasos
1. …
2. …
3. …

## Reglas que no se pueden saltar
- …

## Errores típicos y excepciones
- Si [caso], entonces [qué hacer].

## Herramientas
Si existe aquí, úsalo. No lo vuelvas a crear.
- [plantilla.md](herramientas/plantilla.md): para qué sirve
- [ejemplo-bueno.md](herramientas/ejemplos/ejemplo-bueno.md): así queda un trabajo bien hecho

## Cómo es el resultado final
- Formato: …
- Dónde se entrega: …

## Trabajo terminado
Antes de entregarme nada, revisa tu trabajo punto por punto, corrige lo que falle y dime qué has comprobado.
- [ ] …
- [ ] …`

export default {
  slug: 'guia-playbook-agente',
  seccion: 'skills',
  tema: 'automatizacion',
  tipo: 'guia',
  titulo: 'Un agente y un playbook: delega en la IA con 4 prompts (y deja de construir agentes)',
  gancho: 'No construyas más agentes',
  resumen: '¿15 proyectos de IA a medias? Los que más saben usan un solo agente y un playbook para cada trabajo: un manual que la IA sigue sin conocerte. Los 4 prompts para hacerlo (entrevista, playbook, caja de herramientas y prueba), la carpeta lista para copiar, cómo usarla en Claude, Claude Code o ChatGPT, y qué hacer cuando falla.',
  fecha: '2026-11-01',
  lectura: '8 min',
  nota: 'Guía de Silvestre AI. Se apoya en lo que Anthropic publica sobre agentes y skills: «Building effective agents» (diciembre de 2024), «Agent Skills» (octubre de 2025) y la charla «Don’t Build Agents, Build Skills Instead» de Barry Zhang y Mahesh Murag (AI Engineer, noviembre de 2025). Los prompts sirven en Claude, ChatGPT o Gemini.',
  portada: '/aiparatodo/playbook-agente.webp',
  instalarTodo: null,
  skills: [
    {
      n: '01', clave: 'la-idea', nombre: 'La idea', corto: 'un agente general y un manual para cada trabajo',
      titular: 'Por qué tienes 15 proyectos de IA a medias',
      historia: 'Lo normal es montar un agente para cada cosa: uno para los guiones, otro para las propuestas, otro para los informes. Cada uno con su prompt gigante, y cuando uno falla nadie sabe por qué ni dónde tocar. En Anthropic lo plantean al revés: el agente ya es bueno en general; lo que le falta es saber cómo haces TÚ cada trabajo. Así que usas un solo agente y le das un playbook por tarea: un manual corto con cuándo se usa, qué necesita, los pasos, las reglas, las herramientas y cómo se comprueba que está bien. Es lo mismo que harías con una persona nueva en el equipo: la entrevistas, le das el manual y la caja de herramientas, y le enseñas a revisar su trabajo. Y cuando algo sale mal, no rehaces el agente: arreglas esa parte del playbook.',
      puedesTitulo: 'La delegación con IA, en 3 pasos',
      puedes: [
        'Entrevista: que la IA te pregunte hasta saber hacer la tarea sin ti (y de ahí sale el playbook)',
        'Caja de herramientas: todo lo que ya tienes hecho, en una carpeta, para no rehacerlo',
        'Prueba: una lista de sí o no que la IA repasa antes de entregarte nada',
        'Cuando falla, arreglas una sección del playbook, no un cerebro gigante',
      ],
      web: { nombre: 'Anthropic · Building effective agents', detalle: 'Empezar por lo más simple que funcione, y complicarlo solo si hace falta', url: EFECTIVOS, boton: 'Leer el artículo' },
      ejemplos: [],
    },
    {
      n: '02', clave: 'entrevista', nombre: '1 · La entrevista', corto: 'que te pregunte hasta saber hacerlo sin ti',
      titular: 'La entrevista: que te saque todo lo que sabes',
      historia: 'Lo que hace bien un trabajo no está escrito en ningún sitio: está en tu cabeza. Por eso el primer paso no es escribir un prompt, es dejar que la IA te entreviste, una pregunta cada vez, como haría alguien que va a sustituirte una semana. Contesta con ejemplos reales y pásale trabajos que ya hiciste bien, y también uno que salió mal y por qué. No la dejes proponer nada hasta que digas «basta»: si empieza a responder antes, se quedará con la mitad. Cambia [TAREA] por tu trabajo concreto: «escribir la propuesta para un cliente nuevo» funciona; «marketing», no.',
      puedes: [
        'Una pregunta cada vez, hasta cubrir objetivo, pasos, herramientas, calidad, errores y excepciones',
        'Contesta con ejemplos reales y pega trabajos que ya hiciste',
        'Cuéntale también qué sale mal y cómo lo arreglas',
        'Tú decides cuándo acaba: hasta que no digas «basta», solo pregunta',
      ],
      sueltaTitulo: 'Prompt 1 · La entrevista',
      sueltaNota: 'Cambia [TAREA] por un trabajo concreto que repites. Mejor en un chat nuevo o en un proyecto solo para esta tarea.',
      suelta: ENTREVISTA,
      ejemplos: [],
    },
    {
      n: '03', clave: 'playbook', nombre: '2 · El playbook', corto: 'el manual que otra IA sigue sin conocerte',
      titular: 'El playbook: un manual que otra IA pueda seguir sin conocerte',
      historia: 'Con la entrevista hecha, le pides que lo escriba como manual. La prueba de que está bien es esa frase: que otra IA, que no sabe nada de ti, pueda seguirlo. Pídelo corto y en Markdown, con secciones fijas. Cuando lo tengas, léelo tú: si hay un paso que no harías así o una regla que falta, corrígelo ahora, que luego es lo que va a seguir al pie de la letra. Abajo tienes la plantilla con las secciones, por si prefieres rellenarla tú o dársela de modelo.',
      puedes: [
        'Cuándo se usa (y cuándo no)',
        'Qué necesita de entrada y qué hacer si falta algo',
        'Los pasos numerados',
        'Las reglas que no se pueden saltar',
        'Cómo es el resultado final',
      ],
      sueltaTitulo: 'Prompt 2 · El playbook',
      sueltaNota: 'En el mismo chat de la entrevista, justo después de decir «basta».',
      suelta: PLAYBOOK,
      ejemplos: [
        { titulo: 'La plantilla del playbook, para dársela de modelo', texto: `Usa exactamente esta estructura para el playbook:\n\n${PLANTILLA}` },
      ],
    },
    {
      n: '04', clave: 'herramientas', nombre: '3 · La caja de herramientas', corto: 'si existe, se usa; no se vuelve a crear',
      titular: 'La caja de herramientas: que no reinvente lo que ya tienes',
      historia: 'Buena parte de lo que sale mal es la IA rehaciendo desde cero algo que ya tenías: tu plantilla de propuesta, tu hoja de precios, el script que ya funciona. La caja de herramientas lo evita. Es una carpeta /herramientas junto al playbook con todo lo que se usa para esa tarea: plantillas, ejemplos de trabajos bien hechos, documentos de referencia y scripts que ya has aprobado. El playbook enlaza cada uno y lleva una regla corta y tajante: si existe aquí, úsalo. No lo vuelvas a crear.',
      puedes: [
        'Plantillas que ya usas (propuesta, informe, email…)',
        'Ejemplos de trabajos bien hechos, para que copie el nivel',
        'Documentos de referencia: precios, tono, condiciones',
        'Scripts aprobados, para que no escriba otro distinto cada vez',
      ],
      sueltaTitulo: 'Prompt 3 · La caja de herramientas',
      suelta: HERRAMIENTAS,
      ejemplos: [],
    },
    {
      n: '05', clave: 'prueba', nombre: '4 · La prueba', corto: 'la lista de sí o no antes de entregarte nada',
      titular: 'La prueba: que revise su trabajo antes de dártelo',
      historia: 'La última pieza es la que más se nota: una lista de «trabajo terminado» con entre 5 y 10 puntos que se contestan con sí o no. No vale «que quede bien»; vale «el precio coincide con la hoja de precios», «tiene menos de 200 palabras» o «lleva el enlace de pago». Va al final del playbook con la regla de que la IA la repase punto por punto antes de entregarte nada, corrija lo que falle y te diga qué ha comprobado. Así sabes qué revisó y qué no.',
      puedes: [
        'De 5 a 10 puntos, cada uno con respuesta de sí o no',
        'Cosas que se puedan comprobar mirando el resultado',
        'Que la IA corrija antes de entregar, no después',
        'Que te diga qué ha comprobado',
      ],
      sueltaTitulo: 'Prompt 4 · La prueba',
      suelta: PRUEBA,
      ejemplos: [],
    },
    {
      n: '06', clave: 'la-carpeta', nombre: 'La carpeta del playbook', corto: 'cómo queda y dónde ponerla',
      titular: 'La carpeta del playbook, lista para copiar',
      historia: 'Al acabar los cuatro prompts tienes una carpeta por tarea: el PLAYBOOK.md y su caja de herramientas. Cada nueva tarea que delegas es otra carpeta, y el agente es siempre el mismo. Dónde ponerla depende de con qué trabajes. En Claude o ChatGPT, súbela a un proyecto dedicado a esa tarea (archivos del proyecto) y empieza cada conversación con «sigue el playbook». En Claude Code puedes convertirla en una skill: la carpeta va en ~/.claude/skills/[tarea]/, el PLAYBOOK.md pasa a llamarse SKILL.md y arriba lleva dos líneas, el nombre y una descripción de cuándo usarla. Así Claude la carga solo cuando la tarea aparece, que es justo lo que explica Anthropic en su artículo de Agent Skills.',
      puedesTitulo: 'Cómo queda',
      puedes: [
        'playbooks/[tarea]/PLAYBOOK.md: el manual',
        'playbooks/[tarea]/herramientas/: plantillas, documentos y scripts',
        'playbooks/[tarea]/herramientas/ejemplos/: trabajos bien hechos',
        'En Claude Code, como skill: ~/.claude/skills/[tarea]/SKILL.md con nombre y descripción arriba',
      ],
      web: { nombre: 'Anthropic · Agent Skills', detalle: 'Qué es una skill y cómo se carga por partes', url: SKILLS, boton: 'Leer el artículo' },
      sueltaTitulo: 'La plantilla del PLAYBOOK.md',
      sueltaNota: 'Para convertirla en skill de Claude Code, llámala SKILL.md y pon arriba del todo estas cuatro líneas: ---, name: [tarea-en-minusculas-con-guiones], description: [qué hace y cuándo usarla] y ---.',
      suelta: PLANTILLA,
      ejemplos: [],
    },
    {
      n: '07', clave: 'cuando-falla', nombre: 'Cuando falla', corto: 'se arregla una sección, no todo el agente',
      titular: 'Cuando falla, arreglas esa parte del playbook',
      historia: 'Va a fallar, y está bien: es así como mejora. La diferencia es que ahora sabes dónde mirar. ¿Ha usado datos que no eran? Es la sección de entrada. ¿Se ha saltado un paso? Los pasos. ¿Ha hecho algo que nunca harías? Falta una regla. ¿Ha rehecho tu plantilla? La caja de herramientas. ¿Te ha entregado algo a medias? La prueba no lo comprobaba. Cambias esa sección, añades el caso a «Errores típicos y excepciones» y lo vuelves a probar con el mismo encargo. En unas semanas, el playbook recoge todo lo que antes solo sabías tú.',
      puedes: [
        'Datos equivocados → «Qué necesita de entrada»',
        'Se salta pasos → «Pasos»',
        'Hace algo que no debe → «Reglas que no se pueden saltar»',
        'Rehace lo que ya existe → «Herramientas»',
        'Entrega a medias → «Trabajo terminado»',
      ],
      web: { nombre: 'La charla de Anthropic', detalle: '«Don’t Build Agents, Build Skills Instead», Barry Zhang y Mahesh Murag', url: CHARLA, boton: 'Ver la charla' },
      ejemplos: [
        { titulo: 'Arreglar el playbook cuando algo sale mal', texto: 'Has seguido el playbook de [TAREA] y ha fallado así: [qué ha pasado y qué esperaba]. Dime qué sección del playbook lo ha causado (entrada, pasos, reglas, herramientas o trabajo terminado) y propón el cambio más pequeño que lo evite. Añade el caso a «Errores típicos y excepciones». No cambies nada más.' },
        { titulo: 'Repasar si hace falta un agente nuevo', texto: 'Esta es la lista de cosas para las que he intentado montar un agente: [lista]. Para cada una, dime si es una tarea que podría ir como playbook para un solo agente, qué entrevista haría falta para escribirlo y cuál empezarías primero por tiempo ahorrado a la semana.' },
      ],
    },
  ],
}
