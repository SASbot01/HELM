# 4. Estado de seguridad

Cada punto dice si está **comprobado en vivo** (probado contra el sistema en marcha el 5 oct 2026, solo lecturas y recuentos) o **visto en el código**. Gravedad: 🔴 alta, 🟠 media, 🟡 baja.

## 4.1 Lo urgente: la base de datos está abierta a internet

Son cuatro fallos que se suman. Cualquiera de ellos por separado ya sería grave.

1. 🔴 **Las claves de la base son las de ejemplo de Supabase.** *Comprobado en vivo.* Tanto la clave pública (`anon`) como la de servicio (`service_role`, la que lo puede todo) están firmadas con el secreto por defecto de la herramienta de Supabase, que está publicado en su documentación. Cualquiera puede fabricarse una clave de servicio válida.
2. 🔴 **La base se alcanza desde internet en `https://helm.s4sf.net/sb/`.** *Comprobado en vivo.* La interfaz hace de pasarela hacia Supabase (`vite.config.js:97-105`). También responde `…/sb/pg/` (la herramienta de administración de Postgres), que permite ejecutar SQL.
3. 🔴 **Sin iniciar sesión se leen y modifican los datos de todos los perfiles.** *Comprobado en vivo:* con la clave pública que va dentro de la web se obtienen 99 contactos, 95 respuestas de formulario, 15 ventas y 208 registros de auditoría, y esa clave tiene permiso de escribir y borrar en esas tablas. 111 tablas tienen reglas de acceso «permitir todo» y 66 no tienen ninguna. La separación entre perfiles solo existe en la interfaz.
4. 🔴 **El bucket de archivos es público**, con permiso para listar, subir y borrar sin sesión. Ahí están las facturas y los documentos del portal fiscal (`migrations/helm_operativa.sql:18-34`).

Qué significa en llano: hoy no hace falta «hackear» nada para llevarse o borrar los leads, las ventas y los documentos de los nueve perfiles. Hay que cerrarlo antes de cualquier otra cosa, y antes de enseñar HELM a un cliente.

Lo que sí está protegido: las tablas `team` y `superadmins` (contraseñas), `user_integrations` (claves de Stripe, Google…) y las del Agent OS no son accesibles con la clave pública. Con la clave de servicio (punto 1) sí lo son.

Además, los puertos de Supabase (54321-54327, incluido Postgres y el panel Studio) escuchan en todas las interfaces de red de la máquina. `PENDIENTE`: comprobar el cortafuegos (necesita sudo).

## 4.2 Lo que pide el documento, punto por punto

| Punto | Estado | Detalle |
|---|---|---|
| 2FA en administración | ❌ No hay | Ni para superadmin ni para nadie |
| ¿Un usuario puede leer datos de otro? | ❌ Sí | Ver 4.1. Y dentro de la API hay dos fallos más (4.3) |
| Gestión de secretos | 🟠 Parcial | `.env.server` con permisos correctos y fuera de git. Pero: claves de terceros en texto plano en la base; una clave de servicio antigua en el historial de git; una contraseña inicial en una migración |
| Cifrado en tránsito | ✅ / 🟠 | HTTPS por Cloudflare hacia fuera. Dentro de la máquina, sin TLS (aceptable si los puertos no se exponen) |
| Cifrado en reposo | ❌ No | Disco sin cifrar, copias sin cifrar, tokens sin cifrar |
| Logs | 🟠 | Tres ficheros de log legibles por cualquier usuario de la máquina. Ante un error se registra la URL entera, que puede llevar el token del conector MCP o de un enlace de documentos (`scripts/api-server.mjs:81`). El registro de auditoría guarda email e IP y **no es inmutable**: se puede editar y borrar |
| Copias de seguridad | 🟠 | Diarias, 14 días, verificadas. Pero sin cifrar, en el mismo disco, sin copia fuera, y no incluyen los archivos del bucket. Nunca se ha probado una restauración (`PENDIENTE` confirmar) |
| Rate limiting | 🟠 | Existe en login, chat, formularios y registro. Es en memoria (se pierde al reiniciar) y se basa en una cabecera que el visitante podría falsear. No hay en el conector MCP |
| Dependencias | 🟠 | `npm audit`: 21 vulnerabilidades (5 altas, 16 medias). Una es `xlsx`, que no tiene arreglo en npm |
| Cabeceras de seguridad | ❌ No hay | Ni CSP, ni HSTS, ni X-Frame-Options. *Comprobado en vivo* |

## 4.3 Fallos concretos en la API

*Vistos en el código; los tres primeros los he releído yo línea a línea.*

- 🔴 **Hablar con el chat de otro perfil** (`api/chat.js:1005` frente a `:1053`). El permiso se comprueba con el perfil que va en la URL, pero el mensaje se procesa con el que va en el cuerpo. Un usuario de un perfil puede leer el contexto de otro y escribirle memoria.
- 🔴 **Cualquier miembro puede hacerse propietario** (`api/equipo.js:53-125`). Basta con tener acceso al perfil para dar nivel «propietario» o cambiar la contraseña de otra persona, incluido el dueño. Los niveles (propietario, admin, miembro) y los roles (closer, setter) solo se aplican en la interfaz.
- 🔴 **Ejecución de comandos en el servidor a través de un enlace de reel** (`scripts/agents-worker.mjs:213-224`). La URL se pasa a `yt-dlp` sin separar opciones de argumentos ni validar que sea una URL, así que un «enlace» que empiece por `--` se interpreta como opción. Solo lo puede provocar un superadmin o quien tenga el token maestro del conector MCP, pero ver 4.1: hoy cualquiera puede insertar filas en la base.
- 🔴 **El servidor puede ser usado para visitar direcciones internas** (`api/_lib/enriquecer.js:83-100`). El enriquecimiento de prospectos descarga la web que se le indique sin comprobar que sea pública. El otro punto de descarga (`api/_lib/web.js`) sí filtra, pero no cubre la red de Tailscale ni las redirecciones.
- 🟠 Al desactivar a un colaborador, su sesión sigue valiendo hasta 12 horas (`api/_lib/auth.js:102-108`). Solo se revisa al momento para superadmins.
- 🟠 La sesión se guarda en `localStorage`: un fallo de inyección de código en la web permitiría robarla. No hay CSP que lo frene.
- 🟠 Los enlaces del portal de documentos valen un año y no se pueden revocar uno a uno (`api/documentos.js:24-28`).
- 🟠 Conectar Google o Instagram no está atado a la sesión del navegador: un usuario podría conseguir que otra persona vincule su cuenta al perfil equivocado (`api/google.js:111`, `api/instagram.js:152`).
- 🟠 Conociendo el identificador de una respuesta de formulario, se pueden añadir datos y crear un evento de calendario con el invitado que se quiera (`api/formularios.js:234-245`).
- 🟠 El servidor de la API no limita el tamaño de las peticiones (`scripts/api-server.mjs:36-48`).
- 🟡 La API acepta peticiones de cualquier origen (CORS `*`). Impacto limitado porque no se usan cookies.
- 🟡 Contraseña mínima de 6 caracteres en el registro y 8 en el alta de equipo.
- 🟡 El script `scripts/rehash-passwords.mjs` calcula los hashes de forma distinta a como se verifican: si se ejecutara, esas cuentas no podrían entrar.

## 4.4 Lo que está bien

- Contraseñas con `scrypt` y comparación en tiempo constante; hoy no queda ninguna en texto plano (*comprobado en vivo*: 13 de 13 con hash).
- Los webhooks de Stripe, WooCommerce y Telegram verifican la firma.
- El servidor de la API solo escucha en local.
- Los tokens del conector MCP por perfil se guardan como hash y limitan al perfil propio.
- Ningún secreto actual está en git.
- Borrar un perfil exige superadmin y deja rastro en auditoría.
- No se usa `eval` ni HTML sin escapar en la interfaz.

## 4.5 Sin determinar

- Reglas del cortafuegos de la máquina.
- Si Cloudflare sobrescribe la cabecera con la IP real del visitante.
- Si la clave de servicio que quedó en el historial de git (commit `ef80bbc`, de un proyecto Supabase en la nube) sigue activa. Hay que revocarla en ese proyecto.
- Si alguien ha accedido ya a los datos aprovechando 4.1. No hay registros que permitan saberlo con certeza; ver `07-top-10-riesgos.md`.
