// Hilo de la sección «Skills y repos», tema «Claude Code». Lead magnet del reel
// «Tu app vibecodeada te la van a hackear» (comenta HACK): los 20 fallos de
// seguridad más comunes en apps hechas con IA y el prompt para que Claude Code
// revise la app contra ellos. No es un repo ni depende de una herramienta: es
// una lista de comprobación (OWASP de bolsillo) pensada para Supabase/Firebase,
// Vercel y apps de React/Next/Vite, que es lo que sale casi siempre al
// «vibecodear».

const PROMPT = `Actúa como auditor de seguridad de mi app. Revisa todo el proyecto (código, configuración, migraciones de la base de datos y variables de entorno) contra esta lista y NO cambies nada todavía.

1. ¿Hay algún .env u otro archivo con secretos subido a git, ahora o en el historial (git log -p)?
2. ¿Hay claves secretas en el frontend o en variables con prefijo público (VITE_, NEXT_PUBLIC_, EXPO_PUBLIC_)?
3. ¿Alguna clave ha llegado a estar expuesta y habría que rotarla?
4. ¿Las claves de servicios de pago (OpenAI, Anthropic, Stripe…) tienen solo los permisos justos? Recuérdame poner límites de gasto.
5. ¿Todas las tablas tienen RLS (Row Level Security) activado?
6. ¿Alguna política RLS deja leer o escribir de más (using true, o sin filtrar por el usuario)?
7. ¿La service_role o cualquier clave de administrador aparece fuera del servidor?
8. ¿Hay consultas SQL construidas pegando texto del usuario?
9. ¿El login usa un proveedor fiable y las contraseñas se guardan con hash?
10. ¿Cada endpoint comprueba en el servidor que el recurso pertenece a quien lo pide (IDOR)?
11. ¿Las cookies de sesión son HttpOnly, Secure y SameSite, y caducan?
12. ¿Las rutas de administración están protegidas en el servidor, no solo ocultas en el frontend?
13. ¿Hay límite de peticiones (rate limiting) en login, registro, formularios y en los endpoints que llaman a una IA?
14. ¿Se valida en el servidor todo lo que entra, incluidas las subidas de archivos (tipo real y tamaño)? ¿Los buckets son privados?
15. ¿CORS está limitado a mis dominios? ¿Los webhooks verifican la firma?
16. ¿Los errores muestran detalles internos o las respuestas devuelven campos de más?
17. ¿Hay innerHTML o dangerouslySetInnerHTML con datos de usuarios?
18. ¿Se fuerza HTTPS y están las cabeceras de seguridad (CSP, HSTS, X-Content-Type-Options, frame-ancestors)?
19. ¿Hay dependencias con vulnerabilidades conocidas (npm audit) o paquetes que no existen o no son los oficiales?
20. Si la app usa un LLM con herramientas, ¿el texto de los usuarios puede darle instrucciones (inyección de prompts)?

Para cada punto dime OK, FALLO o NO APLICA. En cada fallo dime el archivo y la línea, por qué es peligroso, la gravedad (crítica, alta, media o baja) y cómo lo arreglarías. Ordena los fallos de más a menos grave y espera a que te diga cuáles arreglar.`

export default {
  slug: 'seguridad-apps-vibecoding',
  seccion: 'skills',
  tema: 'desarrollo',
  tipo: 'guia',
  titulo: 'Tu app vibecodeada te la van a hackear: los 20 fallos de seguridad más comunes',
  gancho: 'Que no te hackeen la app',
  resumen: '.env en GitHub, claves en el frontend, bases de datos sin RLS, sin límite de peticiones… Los 20 fallos de seguridad que más se repiten en apps hechas con IA, explicados sin tecnicismos, y el prompt para pegárselo a Claude Code y que te revise la app entera.',
  fecha: '2026-10-24',
  lectura: '10 min',
  nota: 'Esta lista te ayuda a encontrar los fallos más típicos, pero no sustituye a una auditoría profesional si tu app maneja pagos o datos sensibles. Revisa solo apps que sean tuyas o que tengas permiso para revisar.',
  portada: '/aiparatodo/seguridad-vibecoding.webp',
  skills: [
    {
      n: '01', clave: 'secretos', nombre: 'Secretos y claves', corto: 'fallos 1 a 4: .env, claves en el frontend y límites de gasto',
      titular: 'Tus claves, a la vista de todos',
      historia: 'La mayoría de los hackeos a apps hechas con IA no tienen nada de sofisticado: alguien encuentra una clave que no debería estar a la vista. Hay bots que rastrean GitHub a todas horas buscando claves recién subidas, y en minutos te pueden vaciar la cuenta de OpenAI o usar tu Stripe. Y ojo: todo lo que viaja al navegador —el código de tu frontend incluido— lo puede leer cualquiera con las herramientas de desarrollador.',
      puedesTitulo: 'Qué revisar',
      puedes: [
        '1 · El .env, fuera de GitHub: en el .gitignore y sin haberse subido nunca (mira el historial, no solo el último commit)',
        '2 · Ninguna clave secreta en el frontend: lo que lleva VITE_, NEXT_PUBLIC_ o EXPO_PUBLIC_ acaba en el navegador y es público',
        '3 · Si una clave se ha expuesto, rótala: borrar el commit no basta, ya la pueden tener copiada',
        '4 · Límites de gasto y alertas en OpenAI, Anthropic, Stripe y compañía, y claves con los permisos justos',
      ],
      ejemplos: [],
    },
    {
      n: '02', clave: 'base-de-datos', nombre: 'Tu base de datos', corto: 'fallos 5 a 8: RLS, políticas y la clave de administrador',
      titular: 'Una base de datos sin reglas es una base de datos pública',
      historia: 'Con Supabase o Firebase, tu web habla con la base de datos directamente desde el navegador usando una clave pública. Eso está bien… solo si hay reglas que digan quién puede leer y escribir qué. Sin RLS (Row Level Security), cualquiera que copie la clave pública del código de tu web puede descargarse la tabla de usuarios entera. Es el fallo número uno en apps vibecodeadas. En Supabase, el Security Advisor del panel te avisa de las tablas que no tienen RLS.',
      puedesTitulo: 'Qué revisar',
      puedes: [
        '5 · RLS activado en TODAS las tablas, sin excepción',
        '6 · Políticas que filtren por usuario (por ejemplo, auth.uid() = user_id), nunca un «true» que lo deje todo abierto',
        '7 · La service_role (la clave de administrador) solo en el servidor: esa se salta todas las reglas',
        '8 · Consultas parametrizadas, nunca SQL construido pegando texto del usuario (inyección SQL)',
      ],
      ejemplos: [],
    },
    {
      n: '03', clave: 'usuarios', nombre: 'Usuarios y permisos', corto: 'fallos 9 a 12: login, IDOR, sesiones y rutas de admin',
      titular: 'Iniciar sesión no da permiso para verlo todo',
      historia: 'El fallo más típico tiene nombre: IDOR. Tu app pide /api/pedidos/123, el usuario cambia el 123 por el 124… y ve el pedido de otra persona. Esconder un botón en el frontend no protege nada, porque cualquiera puede llamar a tu API sin pasar por tu web. La protección tiene que estar en el servidor, en cada petición, comprobando que lo que se pide es de quien lo pide.',
      puedesTitulo: 'Qué revisar',
      puedes: [
        '9 · Login con un proveedor serio (Supabase Auth, Clerk, Auth.js…) y contraseñas con hash, nunca guardadas en claro',
        '10 · En cada endpoint, comprueba en el servidor que el recurso es de quien lo pide; no te fíes del id que manda el navegador',
        '11 · Sesiones y cookies seguras (HttpOnly, Secure y SameSite) y que caduquen',
        '12 · Las rutas de admin, protegidas en el servidor: quitarlas del menú no es protegerlas',
      ],
      ejemplos: [],
    },
    {
      n: '04', clave: 'api', nombre: 'Tu API', corto: 'fallos 13 a 16: rate limiting, validación, CORS y errores',
      titular: 'Sin límites, tu API es barra libre',
      historia: 'Sin límite de peticiones, un bot puede probar miles de contraseñas por minuto en tu login, llenarte la base de datos de registros falsos o llamar a tu endpoint de IA hasta dejarte la cuenta a cero. Y todo lo que llega de fuera —formularios, archivos, webhooks— hay que comprobarlo en el servidor: la validación del formulario en el navegador ayuda al usuario, pero no protege nada.',
      puedesTitulo: 'Qué revisar',
      puedes: [
        '13 · Rate limiting en el login, el registro, los formularios y, sobre todo, en los endpoints que llaman a una IA',
        '14 · Valida en el servidor todo lo que entra (tipos y tamaños); en las subidas, el tipo real del archivo y su peso, y los buckets privados por defecto',
        '15 · CORS solo para tus dominios, y los webhooks (Stripe…) verificados con su firma',
        '16 · Errores sin detalles internos (nada de trazas ni consultas SQL al usuario) y respuestas sin campos de más',
      ],
      ejemplos: [],
    },
    {
      n: '05', clave: 'navegador', nombre: 'Navegador, dependencias e IA', corto: 'fallos 17 a 20: XSS, cabeceras, paquetes e inyección de prompts',
      titular: 'Lo que nadie mira hasta que pasa',
      historia: 'Si pintas en pantalla texto escrito por un usuario sin escaparlo, alguien puede meter un script que robe las sesiones de los demás (XSS). Las dependencias viejas traen fallos que ya son públicos. Y hay un riesgo nuevo de programar con IA: a veces se inventa el nombre de un paquete que no existe, y hay atacantes que registran justo esos nombres con código malicioso dentro. Si tu app usa una IA con herramientas, súmale la inyección de prompts.',
      puedesTitulo: 'Qué revisar',
      puedes: [
        '17 · Nada de innerHTML ni dangerouslySetInnerHTML con texto de usuarios (XSS)',
        '18 · HTTPS siempre y cabeceras de seguridad: CSP, HSTS, X-Content-Type-Options y frame-ancestors',
        '19 · Dependencias al día (npm audit, Dependabot) y comprueba que cada paquete que añade la IA existe y es el oficial',
        '20 · Si tu app usa una IA con herramientas, trata el texto de los usuarios como no fiable y limita lo que la IA puede hacer',
      ],
      ejemplos: [],
    },
    {
      n: '06', clave: 'prompt', nombre: 'El prompt para Claude Code', corto: 'pégalo y te revisa la app contra los 20 puntos',
      titular: 'Pégaselo a Claude Code y que te revise la app',
      historia: 'Abre Claude Code dentro de la carpeta de tu app y pégale este prompt. Revisa los 20 puntos uno a uno, te dice dónde está cada fallo, por qué es peligroso y cómo de grave es, y no toca nada hasta que tú se lo digas. Luego arregla de uno en uno, empezando por lo crítico (claves expuestas y tablas sin RLS), y comprueba que la app sigue funcionando después de cada arreglo.',
      puedesTitulo: 'Cómo usarlo',
      puedes: [
        'En tu terminal, entra en la carpeta de tu proyecto y escribe claude',
        'Pega el prompt y deja que revise sin cambiar nada',
        'Arregla primero lo crítico y lo alto; luego lo demás, de uno en uno',
        'Repítelo cada vez que añadas algo grande (pagos, login, subidas de archivos, IA)',
      ],
      ejemplos: [
        { titulo: 'Auditoría de seguridad de tu app (los 20 puntos)', texto: PROMPT },
      ],
    },
  ],
}
