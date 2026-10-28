# 7. Los 10 riesgos principales, por impacto

| # | Riesgo | Por qué importa | Arreglo propuesto | Esfuerzo |
|---|---|---|---|---|
| 1 | **La base de datos está abierta a internet** con claves de ejemplo, reglas «permitir todo» y la herramienta de administración accesible | Cualquiera puede leer, cambiar o borrar los datos de los 9 perfiles sin iniciar sesión. Es una brecha de datos en potencia ahora mismo | Contención inmediata: cambiar el secreto y las dos claves, dejar de publicar `/sb/pg` y lo que la web no necesita, cerrar los puertos. Después, aislamiento real (riesgo 2) | S para contener |
| 2 | **No hay aislamiento entre perfiles** | Es el requisito n.º 1 para vender a empresas. Hoy la separación la hace la interfaz | Que el navegador deje de hablar con la base con una clave común: o todo pasa por la API, o cada sesión lleva un token propio y la base aplica reglas por perfil. Con tests que intenten saltar de uno a otro | L |
| 3 | **Bucket de archivos público** | Facturas y documentos fiscales de clientes accesibles, listables y borrables por cualquiera | Bucket privado, enlaces firmados de corta duración, subida a través de la API | M |
| 4 | **Dos fallos de permisos en la API**: chat de otro perfil y cualquier miembro puede hacerse propietario | Un colaborador (o un cliente de otro perfil) puede ver lo que no debe o quedarse con la cuenta del dueño | Usar un único identificador de perfil ya verificado; aplicar niveles y roles en el servidor | S |
| 5 | **Ejecución de comandos y peticiones internas desde el servidor** (enlace de reel hacia `yt-dlp`; enriquecimiento sin filtro) | Con el riesgo 1 abierto, alguien de fuera podría llegar a controlar la máquina | Validar que sea una URL http(s) y separar argumentos; un único filtro de direcciones privadas para toda descarga | S |
| 6 | **Sin 2FA y sesiones que no se cortan al dar de baja** | El equipo del cliente tipo entra y sale a menudo; una contraseña robada o un excolaborador conservan acceso | 2FA con app; comprobar que el acceso sigue activo en cada petición; sesiones más cortas | M |
| 7 | **Claves de terceros sin cifrar y secretos antiguos en git** | Si se filtra la base, se filtran también Stripe, Google y Telegram de cada perfil | Cifrar esos campos con una clave fuera de la base; revocar la clave del historial; quitar la contraseña de la migración | M |
| 8 | **Ningún dato personal caduca ni se puede borrar por persona** | Incumple conservación limitada y los derechos de acceso y supresión; las copias de perfiles borrados se guardan para siempre | Tabla de plazos, tarea de borrado, «descargar y borrar» por persona, caducidad de las copias | M |
| 9 | **Datos de leads a Anthropic sin que el perfil lo decida, y texto no fiable junto a herramientas** | Transferencia a EE. UU. que no figura en ningún sitio; un formulario malicioso podría provocar una fuga a un archivo público | Pasarela única con interruptor por perfil; marcar el texto externo como datos; confirmación humana para `guardar_archivo`; que el MCP programe en borrador | M |
| 10 | **Un único servidor, sin cifrar, con la copia en el mismo disco** | Un robo, una avería o un incendio se llevan los datos y la copia a la vez | Cifrar las copias y enviar una fuera; incluir los archivos; probar una restauración; decidir si se sigue en hardware propio | S-M |

## Sobre el riesgo 1: ¿ha habido ya una brecha?

No se puede afirmar ni descartar. No hay registros de acceso a la base que lo muestren, y los que hay podría haberlos alterado cualquiera. Lo prudente:

1. Cerrar el acceso cuanto antes.
2. Pedir a Cloudflare los registros de peticiones a `/sb/` del periodo disponible y ver si hay accesos que no sean de la propia web.
3. Con eso, valorar con un abogado o DPD si procede notificar a la AEPD (el plazo de 72 horas cuenta desde que se tiene constancia de una brecha). `REVISIÓN-LEGAL`
4. Cambiar las claves de terceros guardadas en la base (Stripe, Google, Telegram) por si se hubieran leído.
