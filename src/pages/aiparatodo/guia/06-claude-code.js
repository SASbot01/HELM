// Capítulo 06 de la «Guía completa de Claude» — AI para todo.
// Datos verificados el 2026-10-06 contra la documentación oficial de Claude Code
// (code.claude.com/docs). Fuentes al final del objeto.

export default {
  slug: 'claude-code',
  n: '06',
  titulo: 'Claude Code y agentes: que trabaje solo',
  gancho: 'Dale manos a Claude: que toque tus archivos',
  resumen: 'Al terminar sabrás instalar Claude Code, ponerlo a trabajar en tu ordenador con permisos seguros y dejarlo corriendo solo: landings, informes y archivos ordenados sin tocar código.',
  lectura: '18 min',
  fecha: '2026-10-06',
  bloques: [
    { tipo: 'p', texto: 'Hasta ahora has hablado con Claude en una ventana. Le pedías algo, te lo daba en texto, y tú lo copiabas a mano a tu web, a tu hoja de cálculo o a tu carpeta.' },
    { tipo: 'p', texto: 'Ese copiar y pegar es el cuello de botella. La idea estaba bien; el trabajo de llevarla a tu ordenador seguía siendo tuyo.' },
    { tipo: 'p', texto: 'Claude Code quita ese paso. En vez de darte instrucciones, abre tus archivos, los cambia, ejecuta lo que haga falta y comprueba que funciona. Tú revisas el resultado, no el proceso.' },

    { tipo: 'aviso', variante: 'dato', titulo: 'En una frase', texto: 'Claude Code es Claude trabajando dentro de tu ordenador: lee tu carpeta, crea y edita archivos, ejecuta comandos y prueba lo que hace. La documentación oficial lo define como una herramienta que **lee tu proyecto, edita archivos, ejecuta comandos** y se integra con tus herramientas.' },

    { tipo: 'h2', texto: 'Qué es Claude Code (y por qué no es solo para programadores)' },
    { tipo: 'p', texto: 'Nació para programar, sí. Pero lo que de verdad hace es trabajar sobre archivos y carpetas. Y tu negocio es, en el fondo, un montón de archivos y carpetas.' },
    { tipo: 'p', texto: 'Una nutricionista con un curso online tiene PDFs, un Excel de alumnos, textos de la web y un calendario de correos. Un editor de vídeo tiene cientos de clips con nombres imposibles. Una agencia pequeña tiene propuestas, facturas y notas sueltas.' },
    { tipo: 'p', texto: 'Todo eso Claude Code lo puede leer, ordenar, transformar y generar. No necesitas saber programar: necesitas saber explicar qué quieres, igual que en el chat.' },
    { tipo: 'lista', items: [
      'Lee tus archivos: textos, hojas de cálculo, PDFs, carpetas enteras.',
      'Crea y edita archivos nuevos: una web, un informe, una plantilla, un guion.',
      'Ejecuta comandos en tu ordenador: convierte, renombra, mueve, instala.',
      'Comprueba lo que hace: abre lo que ha creado y verifica que funciona antes de darlo por bueno.',
    ] },
    { tipo: 'p', texto: 'El modelo mental: piensa en un becario muy rápido que se sienta en tu silla. No le dictas teclas. Le dices el resultado que quieres y le dejas trabajar, mirando por encima del hombro lo justo.' },

    { tipo: 'aviso', variante: 'truco', titulo: 'Háblale como a un colega', texto: 'La documentación oficial lo dice tal cual: háblale a Claude como a un compañero y cuéntale qué quieres conseguir. Cuanto más concreto seas (el error exacto, el formato final, dónde va cada cosa), mejor sale.' },

    { tipo: 'h2', texto: 'Dónde se usa' },
    { tipo: 'p', texto: 'Claude Code no vive en un solo sitio. Es el mismo motor en varias superficies, y el CLAUDE.md, los ajustes y los servidores MCP de tu proyecto funcionan en todas.' },
    { tipo: 'tabla',
      cabecera: ['Superficie', 'Qué es', 'Para quién'],
      filas: [
        ['Terminal', 'La versión completa, por línea de comandos. Todo el control.', 'El sitio donde más manda: vale la pena perderle el miedo'],
        ['App de escritorio', 'La app de Claude (macOS y Windows; en Linux, en beta), pestaña **Code**. Revisión visual de cambios y varias sesiones a la vez. No hace falta instalar nada más.', 'Si la terminal te intimida, empieza aquí'],
        ['Web y móvil', 'En claude.ai/code o en la app de Claude para iOS y Android. Corre en la nube y trabaja sobre repositorios de GitHub, no sobre las carpetas de tu ordenador.', 'Lanzar tareas largas y revisarlas desde cualquier sitio'],
        ['VS Code y JetBrains', 'Extensiones para el editor, con los cambios vistos en línea.', 'Si ya usas un editor de código'],
      ],
    },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Necesitas un plan de pago', texto: 'Claude Code no entra en el plan gratuito. Necesitas una suscripción **Pro, Max, Team o Enterprise**, o una cuenta de Claude Console (pago por uso de la API). Si ya pagas Claude para el chat, con esa misma cuenta entras.' },
    { tipo: 'p', texto: 'Para empezar con tus propias carpetas, lo más sencillo es la app de escritorio. En este capítulo te enseño la terminal, porque es la que te da el poder completo y, entendida esa, el resto te sale solo.' },

    { tipo: 'h2', texto: 'Instalación: de cero a tu primera sesión' },
    { tipo: 'p', texto: 'La terminal es esa ventana negra que da respeto. No pasa nada: vas a pegar una línea y poco más. Estos son los pasos oficiales, comprobados hoy.' },
    { tipo: 'pasos', items: [
      { titulo: 'Abre una terminal', texto: 'En Mac se llama «Terminal». En Windows, usa PowerShell. Es una ventana donde escribes órdenes de texto.' },
      { titulo: 'Pega el instalador', texto: 'Copia la línea de abajo, pégala y pulsa Enter. Descarga e instala Claude Code, y luego se actualiza solo.' },
      { titulo: 'Comprueba que está', texto: 'Cierra esa ventana, abre una nueva y escribe `claude --version`. Si te devuelve un número de versión, está instalado.' },
      { titulo: 'Entra en tu proyecto', texto: 'Ve a la carpeta donde está tu trabajo con `cd` y arranca con `claude`.' },
      { titulo: 'Inicia sesión', texto: 'La primera vez te pide entrar con tu cuenta de Claude y terminas el proceso en el navegador. Lo haces una vez.' },
    ] },
    { tipo: 'codigo', titulo: 'Instalar (Mac, Linux o WSL)', texto: 'curl -fsSL https://claude.ai/install.sh | bash', nota: 'En Windows con PowerShell: irm https://claude.ai/install.ps1 | iex. En Windows conviene tener instalado Git for Windows; sin él, Claude Code usa PowerShell para ejecutar comandos.' },
    { tipo: 'codigo', titulo: 'Abrir Claude Code en tu carpeta', texto: 'cd ruta/a/tu/proyecto\nclaude', nota: 'Sustituye «ruta/a/tu/proyecto» por la carpeta real. Si no tienes una, crea una vacía y empieza ahí.' },

    { tipo: 'aviso', variante: 'ojo', titulo: 'Trabaja sobre una copia al principio', texto: 'Claude Code puede borrar y sobrescribir archivos. Las primeras veces, trabaja en una carpeta de pruebas o en una copia, nunca sobre los únicos originales de tu negocio. Y jamás le des acceso a tus datos o claves de producción mientras aprendes.' },

    { tipo: 'h2', texto: 'Los primeros comandos y los modos de permiso' },
    { tipo: 'p', texto: 'Ya dentro, no hay magia nueva: le escribes en lenguaje normal. Prueba a conocer tu propia carpeta antes de pedir cambios.' },
    { tipo: 'lista', items: [
      '«¿Qué hay en esta carpeta y para qué sirve cada archivo?»',
      '«Hazme un resumen de este PDF en cinco puntos y guárdalo en un archivo nuevo.»',
      '«Cambia el título de la web por este otro y enséñame cómo queda.»',
    ] },
    { tipo: 'p', texto: 'La pieza clave de seguridad son los modos de permiso: deciden qué hace Claude sin preguntarte. Cambias de modo con **Shift+Tab** y el modo activo aparece en la barra de abajo.' },
    { tipo: 'tabla',
      cabecera: ['Modo', 'Qué hace'],
      filas: [
        ['Auto', 'Trabaja sin pararte a cada paso; un segundo modelo (un clasificador) revisa por detrás que cada acción encaje con lo que pediste. Es el modo con el que arrancan por defecto las versiones actuales en la terminal.'],
        ['Manual', 'Te pide permiso antes de editar archivos o ejecutar comandos; solo lee sin preguntar. El más prudente para empezar.'],
        ['Accept edits', 'Acepta solos los cambios de archivo y comandos básicos de carpeta (crear, mover, copiar) dentro del proyecto.'],
        ['Plan', 'Lee y explora, pero no edita tus archivos. Te propone un plan y no toca nada hasta que lo apruebas.'],
        ['Bypass', 'Se salta los permisos. No aparece al pulsar Shift+Tab salvo que arranques Claude Code con una opción especial. Solo para entornos aislados, como un contenedor o una máquina virtual.'],
      ],
    },
    { tipo: 'aviso', variante: 'dato', titulo: 'Un atajo que lo cambia todo', texto: 'Si tu sesión arranca en Auto, pulsa Shift+Tab una vez y verás `manual mode on` en la barra de abajo. Cada pulsación siguiente pasa a Accept edits, luego a Plan y vuelve a Auto. Mientras aprendes, trabaja en Manual para ver qué hace; cuando le cojas confianza en una tarea concreta, pásalo a un modo más ágil.' },

    { tipo: 'h3', texto: 'Modo plan: que piense antes de tocar' },
    { tipo: 'p', texto: 'El modo plan es tu mejor amigo con tareas grandes. Claude lee lo que necesita, no cambia nada y te devuelve un plan por escrito. Tú lo apruebas (o lo corriges) y entonces ejecuta.' },
    { tipo: 'p', texto: 'Entras con Shift+Tab hasta ver `plan mode on`, o empezando un mensaje suelto con `/plan`. Así evitas que se lance a lo loco sobre una carpeta importante. Primero el plan, luego las manos.' },
    { tipo: 'prompt', titulo: 'Pedir un plan antes de ejecutar', texto: '/plan Léete toda la carpeta [tu carpeta] y entiende qué hay. Mi objetivo es [lo que quieres conseguir, por ejemplo: pasar mis 40 recetas de PDF a una web sencilla que pueda publicar]. Devuélveme un plan paso a paso con: qué archivos vas a crear o cambiar, en qué orden, y qué me vas a pedir que revise. No ejecutes nada hasta que yo apruebe el plan.' },

    { tipo: 'h2', texto: 'CLAUDE.md: la memoria del proyecto' },
    { tipo: 'p', texto: 'Cada sesión de Claude Code empieza sin recordar la conversación anterior. Para que no tengas que explicarle lo mismo cada día existe un archivo especial: CLAUDE.md. Lo escribes tú y Claude lo lee al arrancar cada sesión.' },
    { tipo: 'p', texto: 'Va en la raíz del proyecto, como `CLAUDE.md` o dentro de `.claude/CLAUDE.md`. Ahí escribes las reglas fijas: cómo se llama tu negocio, qué tono usas, dónde va cada cosa, qué no quieres que haga nunca.' },
    { tipo: 'codigo', titulo: 'Ejemplo de CLAUDE.md para una nutricionista', texto: '# Proyecto: web del curso «Come mejor»\n\n## Negocio\n- Soy nutricionista. Vendo un curso online y una consulta 1 a 1.\n- Tono: cercano, de tú, sin tecnicismos ni promesas médicas.\n\n## Cómo trabajamos\n- Los textos van en español de España.\n- Las recetas viven en la carpeta /recetas, una por archivo.\n- Antes de publicar nada, enséñame cómo queda.\n\n## Nunca\n- No inventes datos nutricionales ni cites estudios sin que yo los verifique.\n- No toques la carpeta /facturas.', nota: 'Consejo oficial: que sea concreto y de menos de 200 líneas por archivo. Mejor reglas comprobables («usa 2 espacios de sangría») que vagas («formatea bien»).' },
    { tipo: 'p', texto: 'No hace falta escribirlo a mano desde cero. Dentro de Claude Code, el comando `/init` analiza tu carpeta y te genera un CLAUDE.md inicial que luego afinas. Si ya tienes uno, te propone mejoras en vez de sobrescribirlo.' },
    { tipo: 'p', texto: 'Además, Claude toma sus propias notas mientras trabaja (la **memoria automática**): apunta correcciones y preferencias que le das. Pero las reglas importantes, escríbelas tú en CLAUDE.md.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'La regla de las dos veces', texto: 'Cada vez que corrijas a Claude por segunda vez lo mismo, apúntalo en CLAUDE.md. Es la diferencia entre repetirte cada día y que el proyecto se vaya puliendo solo.' },

    { tipo: 'h2', texto: 'Skills y plugins en Claude Code' },
    { tipo: 'p', texto: 'Las skills que viste en el capítulo 03 también funcionan aquí, y de forma más potente. Una skill es una carpeta con un archivo `SKILL.md` que le enseña a Claude a hacer una tarea concreta, con tus pasos y tu criterio.' },
    { tipo: 'p', texto: 'Viven en `.claude/skills/<nombre>/SKILL.md` dentro del proyecto (o en `~/.claude/skills/` para todos tus proyectos). Se invocan escribiendo `/` y el nombre, o las usa Claude solo cuando vienen al caso. Con `/skills` ves todas las que tienes.' },
    { tipo: 'p', texto: 'Los plugins son paquetes que añaden de golpe skills, subagentes, hooks y conexiones MCP. Para explorarlos, escribe `/plugin` en una sesión de terminal: se abre en la pestaña **Discover**. El marketplace oficial de Anthropic viene añadido de serie.' },
    { tipo: 'codigo', titulo: 'Explorar e instalar extras', texto: '/plugin', nota: 'Abre el catálogo de plugins de tus marketplaces. En el capítulo 03 tienes los comandos para instalar por aquí las skills oficiales de Anthropic.' },

    { tipo: 'h2', texto: 'Subagentes: varios Claude a la vez' },
    { tipo: 'p', texto: 'Un subagente es un Claude especializado al que el Claude principal le pasa un trozo del trabajo. Cada uno tiene su propio contexto, sus herramientas y hasta su modelo. Sirve para dividir tareas grandes y para repetir siempre igual un trabajo (revisar, resumir, investigar).' },
    { tipo: 'p', texto: 'Se definen como archivos de texto en `.claude/agents/` (en el proyecto) o `~/.claude/agents/` (para todo). Son Markdown con una cabecera sencilla. La forma recomendada es pedírselo a Claude y que te lo escriba él.' },
    { tipo: 'codigo', titulo: 'Un subagente revisor de textos', texto: '---\nname: revisor-textos\ndescription: Revisa textos de marketing. Úsalo después de escribir textos de venta.\ntools: Read, Grep\nmodel: sonnet\n---\n\nEres un corrector de estilo. Revisas que el texto suene cercano,\nsin promesas exageradas y sin tecnicismos. Para cada problema:\ncita la frase, explica por qué falla y propón una versión mejor.', nota: 'En «model» valen los alias haiku (rápido, para tareas simples y repetitivas), sonnet (el día a día), opus (razonamiento complejo) y fable (el más capaz, para lo más largo y difícil), o un ID completo como claude-opus-5-5.' },
    { tipo: 'p', texto: 'Puedes lanzar varios subagentes en paralelo para que un trabajo largo avance a la vez por varios frentes, con un agente principal que reparte y junta los resultados.' },

    { tipo: 'h2', texto: 'Hooks: reglas que se cumplen siempre' },
    { tipo: 'p', texto: 'Un hook es un comando tuyo que Claude Code ejecuta en momentos fijos: antes de usar una herramienta, después de editar un archivo, cuando termina de responder. No depende de que a Claude «se le ocurra»: pasa siempre. Es control determinista.' },
    { tipo: 'p', texto: 'Se configuran en un archivo de ajustes: `.claude/settings.json` dentro del proyecto, o `~/.claude/settings.json` para todos tus proyectos. El ejemplo oficial más típico: formatear cada archivo justo después de que Claude lo edite.' },
    { tipo: 'codigo', titulo: 'Hook: formatear tras cada edición (.claude/settings.json)', texto: `{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" }
        ]
      }
    ]
  }
}`, nota: 'PostToolUse se dispara después de que Claude use una herramienta; aquí, solo tras editar o escribir archivos. Este ejemplo necesita jq y Node instalados. Con /hooks ves los que tienes activos, y puedes pedirle a Claude que te escriba los tuyos.' },
    { tipo: 'aviso', variante: 'ojo', titulo: 'La memoria sugiere, el hook obliga', texto: 'CLAUDE.md es contexto: orienta a Claude, pero no es una barrera. Si algo tiene que pasar o bloquearse sí o sí (nunca tocar una carpeta, pasar siempre una comprobación antes de dar algo por bueno), eso va en un hook, no en la memoria.' },

    { tipo: 'h2', texto: 'MCP: conectarlo a tus herramientas' },
    { tipo: 'p', texto: 'MCP (Model Context Protocol) es el estándar abierto que deja a Claude Code leer y escribir en tus herramientas: tu Drive, tu Notion, tu gestor de tareas, tu CRM. Es lo que convierte a Claude de «sabe mucho» a «trabaja con tus cosas».' },
    { tipo: 'p', texto: 'Lo vimos en los capítulos 04 (Conectores) y 05 (MCP). Lo importante aquí: si entras en Claude Code con tu cuenta de claude.ai, los conectores que ya añadiste en claude.ai te aparecen también en Claude Code. Escribe `/mcp` para verlos.' },

    { tipo: 'h2', texto: 'Tareas largas, en paralelo y programadas' },
    { tipo: 'p', texto: 'Aquí está el salto de verdad: que trabaje sin ti delante. Hay varias formas, de la más simple a la más seria.' },
    { tipo: 'lista', items: [
      '**En la nube**: lanzas una tarea larga en claude.ai/code o desde la app y vuelves cuando acaba. Puedes tener varias a la vez. Trabaja sobre un repositorio de GitHub.',
      '**`/loop`**: repite una orden cada cierto tiempo dentro de una sesión abierta, por ejemplo `/loop 30m mira si ha llegado el archivo del cliente`. Se para si cierras la sesión.',
      '**Tareas programadas de escritorio**: en la app de escritorio, una tarea que se lanza a la hora que digas con acceso a tus archivos locales. Necesita la app abierta y el ordenador encendido.',
      '**Rutinas**: configuraciones guardadas que corren en la nube aunque tengas el ordenador apagado. Se disparan por horario, por una llamada a su API o por eventos de GitHub.',
      '**Headless con `claude -p`**: una orden suelta que se ejecuta y termina, encadenable con otras herramientas. La base de cualquier automatización.',
      '**GitHub Actions**: Claude revisando cambios y ordenando incidencias de tu repositorio de forma automática.',
    ] },
    { tipo: 'codigo', titulo: 'Headless: Claude en una sola orden', texto: '# Analizar las últimas 200 líneas de un registro\ntail -200 app.log | claude -p "Avísame por Slack si ves alguna anomalía"\n\n# Revisar los archivos cambiados respecto a la rama main\ngit diff main --name-only | claude -p "revisa estos archivos por fallos de seguridad"', nota: 'La -p es de «print»: ejecuta, responde y sale, sin sesión interactiva. Son los ejemplos de la documentación oficial; el primero solo avisa por Slack si tienes Slack conectado.' },
    { tipo: 'p', texto: 'Para algo recurrente de verdad (cada mañana, cada lunes), las rutinas son lo tuyo. Se crean desde claude.ai/code/routines, desde la app de escritorio o escribiendo `/schedule` en la terminal. Ojo: cada ejecución trabaja sobre una copia recién descargada de tu repositorio de GitHub, no sobre tu ordenador, y sus cambios los sube a una rama que empieza por `claude/`.' },
    { tipo: 'prompt', titulo: 'Programar un informe semanal con /schedule', texto: '/schedule cada lunes a las 9:07, repasa el repositorio [tu proyecto], mira todo lo que cambió la semana pasada y escríbeme un informe claro de una página: qué se hizo, qué quedó a medias y qué conviene priorizar esta semana. Guárdalo como informe-semanal.md en una rama nueva y termina la sesión con un resumen de tres líneas.' },
    { tipo: 'aviso', variante: 'dato', titulo: 'Las rutinas corren en la nube', texto: 'Una rutina se ejecuta en la infraestructura de Anthropic, así que sigue funcionando con el portátil cerrado. Está en fase de pruebas (research preview, puede cambiar), disponible en los planes Pro, Max, Team y Enterprise, y gasta de tu uso como una sesión normal. Truco de la documentación: si la programas en punto puede arrancar varios minutos tarde; a las 9:07 arranca más fino que a las 9:00.' },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Una rutina no te pide permiso', texto: 'Corre sola: ejecuta comandos y usa todos los conectores que le dejes, incluido escribir, sin preguntarte. Al crearla, quita los conectores que no necesite. Y que la ejecución salga en verde solo significa que arrancó y terminó sin fallos técnicos: abre la sesión y comprueba qué hizo de verdad.' },

    { tipo: 'h2', texto: 'Git y GitHub: tu red de seguridad' },
    { tipo: 'p', texto: 'Si vas a dejar que Claude toque tus archivos, necesitas poder volver atrás. Eso es Git: un historial de versiones. Y GitHub, un sitio donde guardarlo a salvo (y lo que necesitan la web y las rutinas para trabajar).' },
    { tipo: 'p', texto: 'No tienes que aprender Git. Claude Code lo maneja por ti hablando normal: «crea una rama», «guarda estos cambios con un mensaje que explique qué hice», «enséñame qué he cambiado». Cada guardado es un punto al que puedes regresar.' },
    { tipo: 'p', texto: 'Dentro de una sesión tienes además un deshacer rápido: `/rewind` (o Esc dos veces con la caja de texto vacía) te devuelve a un mensaje anterior, con o sin los cambios de archivos. Pero no cubre lo que se hizo con comandos (borrar, mover o copiar archivos) y no sustituye a Git.' },
    { tipo: 'aviso', variante: 'truco', titulo: 'Guarda antes de un encargo grande', texto: 'Antes de pedirle a Claude algo ambicioso, dile «guarda todo lo que hay ahora en Git». Así tienes una foto del antes. Si el después no te gusta, le pides que vuelva a ese punto. Es la diferencia entre experimentar tranquilo y tener miedo a romper algo.' },

    { tipo: 'h2', texto: 'Cuatro encargos para tu negocio' },

    { tipo: 'h3', texto: 'Montar una landing' },
    { tipo: 'p', texto: 'Un creador de reels quiere una página para vender su mentoría. Sin diseñador, sin plantilla de pago.' },
    { tipo: 'prompt', titulo: 'Landing de venta', texto: 'Trabaja en la carpeta [tu carpeta]. Quiero una landing de una sola página para vender mi mentoría de [tema, por ejemplo: crecer en Instagram con reels]. Secciones: titular potente, para quién es, qué se lleva, un bloque para tres testimonios (déjalos como huecos marcados para que yo ponga testimonios reales, no los inventes), precio y un botón de reserva. Estética oscura y limpia, que se vea perfecta en móvil. Hazlo en HTML y CSS sencillos, en un solo archivo, y al terminar ábrelo para que vea cómo queda. Si necesitas decisiones de diseño, tómalas tú y justifícamelas en una línea.' },

    { tipo: 'h3', texto: 'Automatizar un informe semanal' },
    { tipo: 'p', texto: 'Una agencia pequeña pierde el viernes juntando lo que pasó en cada cuenta de cliente. Si el Excel está en tu ordenador, cuando el prompt funcione conviértelo en una tarea programada de la app de escritorio.' },
    { tipo: 'prompt', titulo: 'Informe a partir de un Excel', texto: 'En la carpeta [tu carpeta] tengo un Excel llamado [nombre.xlsx] con las tareas de la semana por cliente, con columnas cliente, tarea, estado y horas. Léelo y genérame un informe en un archivo nuevo por cada cliente: qué se completó, qué sigue abierto y el total de horas. Tono profesional y breve, para enviárselo al cliente. Si una fila está incompleta o es rara, no la inventes: lístamela aparte para que la revise yo.' },

    { tipo: 'h3', texto: 'Ordenar 300 archivos' },
    { tipo: 'p', texto: 'Un editor de vídeo tiene una carpeta con cientos de clips con nombres como «IMG_0423» y «final_final_v3».' },
    { tipo: 'prompt', titulo: 'Renombrar y clasificar', texto: '/plan En la carpeta [tu carpeta] hay unos 300 archivos de vídeo e imagen con nombres sin sentido. Enséñame cómo están organizados y proponme un sistema de nombres claro (fecha + proyecto + número) y una estructura de subcarpetas por proyecto. Cuando yo apruebe el plan, haz primero una copia de seguridad, luego renombra y mueve todo según ese sistema, y déjame un listado de qué archivo antiguo pasó a qué nombre nuevo. No borres nada.' },

    { tipo: 'h3', texto: 'Crear un mini-CRM' },
    { tipo: 'p', texto: 'Una abogada freelance lleva sus clientes potenciales en notas sueltas y se le escapan seguimientos.' },
    { tipo: 'prompt', titulo: 'Mini-CRM en un archivo', texto: 'Quiero un mini-CRM sencillo para llevar mis clientes potenciales, en la carpeta [tu carpeta]. Que sea una página web en un solo archivo HTML, sin cuentas ni servidores: campos nombre, contacto, asunto, estado (nuevo, hablado, propuesta enviada, cerrado) y fecha del próximo seguimiento. Que pueda añadir, editar y filtrar por estado, y que resalte los seguimientos vencidos. Los datos se guardan en el propio navegador, así que añade un botón para exportarlos a CSV y otro para importarlos, para no perderlos si borro el navegador. Al acabar, ábrelo y enséñame cómo se usa con un cliente de ejemplo.' },

    { tipo: 'h2', texto: 'Errores típicos y seguridad' },
    { tipo: 'lista', items: [
      'Pedir demasiado de golpe. Divide en pasos: primero el plan, luego cada parte. Un encargo claro sale mejor que uno enorme y vago.',
      'Trabajar sin red. Si no usas Git, un cambio malo puede no tener vuelta atrás. Guarda antes de empezar.',
      'Dejarlo en Auto o en Bypass desde el primer día sin mirar. Pasa a Manual, mira qué hace y afloja permisos cuando confíes en la tarea.',
      'Darle tu única copia. Trabaja sobre copias o en una rama hasta que el resultado te convenza.',
      'Creerte el estado «verde». Que una tarea termine sin error no significa que hiciera bien lo que querías. Revisa el resultado, no solo que acabó.',
    ] },
    { tipo: 'aviso', variante: 'ojo', titulo: 'Seguridad: lo mínimo innegociable', texto: 'No le des a Claude Code claves ni accesos de producción (tu web real, tu pasarela de pago, tu base de datos de clientes) mientras experimentas. Usa datos de prueba. El modo Bypass, solo en entornos aislados. Un plugin puede ejecutar hooks y servidores MCP en tu ordenador: lee qué instala antes de aceptarlo. Y conecta solo servidores MCP de los que te fíes, porque los que traen contenido de fuera pueden colarle instrucciones a Claude.' },

    { tipo: 'h2', texto: 'Tu primer encargo: checklist' },
    { tipo: 'pasos', items: [
      { titulo: 'Instala y entra', texto: 'Instala Claude Code, abre una carpeta de pruebas y arranca con `claude`.' },
      { titulo: 'Escribe tu CLAUDE.md', texto: 'Ejecuta `/init` o escribe cuatro reglas a mano: qué es el proyecto, tu tono, dónde va cada cosa y qué no tocar.' },
      { titulo: 'Pon la red de seguridad', texto: 'Pídele que guarde el estado actual en Git antes de nada.' },
      { titulo: 'Pide un plan', texto: 'En modo plan, dale un encargo real pequeño de tu negocio y revisa el plan antes de aprobarlo.' },
      { titulo: 'Ejecuta y revisa', texto: 'Déjalo trabajar en Manual, aprueba paso a paso y comprueba el resultado final con tus ojos.' },
      { titulo: 'Afina', texto: 'Lo que corregiste dos veces, anótalo en CLAUDE.md para no tener que repetirlo.' },
    ] },
    { tipo: 'p', texto: 'Cuando esto te salga solo, el siguiente paso es mi forma de trabajar. La tienes en la guía en PDF «Mis 8 no negociables con Claude»: Composio, Skills, Loops, Modo plan, Subagentes, Hooks, el modelo correcto y todo a GitHub. Está en la sección «No negociables» de esta guía.' },
  ],
  claves: [
    'Claude Code no es solo para programar: trabaja sobre tus archivos y carpetas, y tu negocio es archivos y carpetas.',
    'Vive en terminal, app de escritorio, web y editores, y necesita un plan de pago (Pro, Max, Team o Enterprise) o una cuenta de Console.',
    'Shift+Tab cambia el modo de permiso. Las versiones actuales arrancan en Auto: pasa a Manual mientras aprendes y usa el modo plan para que piense antes de tocar.',
    'CLAUDE.md es la memoria del proyecto; los hooks son reglas que se cumplen siempre; los subagentes dividen el trabajo.',
    '`/loop`, las tareas programadas de escritorio, las rutinas y `claude -p` dejan que trabaje solo; Git y GitHub son tu red de seguridad para volver atrás.',
    'Seguridad primero: trabaja sobre copias, nunca con claves de producción, y revisa el resultado, no solo que terminó.',
  ],
  fuentes: [
    { texto: 'Claude Code — Overview', url: 'https://code.claude.com/docs/en/overview' },
    { texto: 'Claude Code — Quickstart', url: 'https://code.claude.com/docs/en/quickstart' },
    { texto: 'Claude Code — Choose a permission mode', url: 'https://code.claude.com/docs/en/permission-modes' },
    { texto: 'Claude Code — How Claude remembers your project (CLAUDE.md)', url: 'https://code.claude.com/docs/en/memory' },
    { texto: 'Claude Code — Subagents', url: 'https://code.claude.com/docs/en/sub-agents' },
    { texto: 'Claude Code — Automate actions with hooks', url: 'https://code.claude.com/docs/en/hooks-guide' },
    { texto: 'Claude Code — Automate work with routines', url: 'https://code.claude.com/docs/en/routines' },
    { texto: 'Claude Code — Desktop scheduled tasks', url: 'https://code.claude.com/docs/en/desktop-scheduled-tasks' },
  ],
}
