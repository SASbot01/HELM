# Crear la aplicación de Google de HELM

Se hace **una sola vez** para todo HELM, no una por cliente. Después, cada
perfil conecta su propia cuenta de Google desde *Ajustes → Integraciones →
Conectar con Google*: HELM guarda su permiso, no su contraseña, y el propio
usuario puede retirarlo cuando quiera.

Hace falta una cuenta de Google (la del negocio) con acceso a
[console.cloud.google.com](https://console.cloud.google.com). Tarda unos diez
minutos.

---

## 1. Proyecto

1. Entra en Google Cloud Console y arriba a la izquierda pulsa el selector de
   proyecto → **Proyecto nuevo**.
2. Nombre: `HELM`. Crear.
3. Asegúrate de que el selector de arriba muestra `HELM` antes de seguir: casi
   todos los líos de configuración salen de haber activado las cosas en otro
   proyecto.

## 2. Activar las dos APIs

En **APIs y servicios → Biblioteca**, busca y pulsa *Habilitar* en:

- **Google Calendar API**
- **Google Drive API**

Sin esto, el enlace funciona pero las llamadas devuelven `403 API not enabled`.

## 3. Pantalla de consentimiento

En **APIs y servicios → Pantalla de consentimiento de OAuth**:

1. Tipo de usuario: **Externo** (a menos que todos tus usuarios estén en tu
   propio Workspace, en cuyo caso vale *Interno* y te ahorras la verificación).
2. Nombre de la aplicación: el que verá el usuario al aceptar — pon el de tu
   marca, no "HELM", si vendes el panel en blanco.
3. Correo de asistencia y de contacto: el tuyo.
4. **Permisos (scopes)**: añade exactamente estos seis:

   ```
   .../auth/userinfo.email
   .../auth/userinfo.profile
   .../auth/calendar.readonly
   .../auth/calendar.events
   .../auth/drive.readonly
   .../auth/drive.file
   ```

   `calendar.events` es el que deja **crear la reunión** cuando un lead reserva
   su llamada desde una landing: sin él, la hora queda apuntada en el CRM pero
   no aparece en el calendario de nadie. Es un scope *sensible*, de la misma
   familia que `calendar.readonly`, que ya estaba: no cambia en nada el trámite
   de verificación respecto a lo que ya tenías.

   `drive.file` es el que deja **crear** los documentos de los guiones, y está elegido a propósito en
   lugar del `drive` completo:

   - `drive` (escritura total) es un scope **restringido**: obliga a pasar la
     verificación de Google *y* una auditoría de seguridad anual. Semanas de
     trámite y un coste que se repite cada año.
   - `drive.file` **no es sensible**: no necesita verificación ninguna. Da
     acceso solo a los ficheros que crea la propia aplicación, así que HELM
     puede dejar el guion en su carpeta pero no ve ni toca el resto del Drive
     del cliente.

   Consecuencia práctica: la carpeta de los guiones **la tiene que crear HELM**,
   desde *Ajustes → Integraciones → Crear la carpeta en Drive*. Pegar el enlace
   de una carpeta hecha a mano no funciona — Google devolvería `403` al subir el
   primer guion.

   > **Si ya tenías la app montada con los cuatro de antes:** añade `drive.file`
   > aquí y avisa a cada perfil de que tiene que *desconectar y volver a
   > conectar* Google. Un permiso concedido antes no se amplía solo; hasta que
   > reconecten, todo lo demás les sigue funcionando igual y HELM les avisa en
   > Ajustes.

5. **Usuarios de prueba**: mientras la app esté en modo *Prueba*, solo pueden
   conectar las cuentas que añadas aquí (hasta 100). Añade las tuyas y las de
   tus primeros clientes.

> **Sobre la verificación.** `drive.readonly` es un permiso *sensible*: para
> salir de modo prueba y aceptar a cualquiera, Google exige verificar la app
> (política de privacidad publicada, dominio verificado y, con Drive, a veces
> una revisión de seguridad). Tarda semanas. Mientras tanto, en modo *Prueba*
> todo funciona igual para los usuarios que añadas a mano — que es lo normal
> los primeros meses.

## 4. Credenciales

En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de
OAuth**:

1. Tipo de aplicación: **Aplicación web**.
2. Nombre: `HELM web`.
3. **URIs de redirección autorizados** — aquí es donde vuelve el navegador
   después de aceptar. Tiene que coincidir **carácter a carácter** con la que
   usa el servidor; HELM te la enseña en *Ajustes → Integraciones* cuando
   faltan las credenciales. Normalmente:

   ```
   https://TU-DOMINIO/api/google?action=callback
   ```

   Añade también la de desarrollo si vas a probar en local:

   ```
   http://localhost:5173/api/google?action=callback
   ```

4. Crear. Copia el **ID de cliente** y el **secreto de cliente**.

## 5. Ponerlas en el servidor

En `.env.server` (o en Vercel → *Settings → Environment Variables*):

```bash
GOOGLE_CLIENT_ID=1234...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
HELM_PUBLIC_URL=https://TU-DOMINIO      # sin barra final
```

`HELM_PUBLIC_URL` importa más de lo que parece: es lo que hace que la URL de
redirección que construye el servidor sea idéntica a la registrada arriba.
Detrás de un proxy o un túnel, sin ella, Google contesta
`redirect_uri_mismatch`.

Reinicia el servidor de API (`systemctl restart helm-api` si corre como
servicio) y recarga HELM. La tarjeta *Google Calendar y Drive* de Ajustes
dejará de avisar y el botón **Conectar con Google** ya funciona.

---

## Qué hace HELM con el permiso

| Permiso | Para qué |
|---|---|
| `calendar.readonly` | Leer los eventos: traer los que parecen llamadas a la sección **Llamadas**, y saber qué horas están ocupadas para no ofrecerlas en la agenda pública. |
| `calendar.events` | **Crear** la reunión cuando un lead reserva su llamada desde una landing, con enlace de Meet e invitación para él. |
| `drive.readonly` | Listar archivos e importar el texto de Documentos, Hojas y Presentaciones a la **Biblioteca** (el contexto de la IA). |
| `drive.file` | **Crear** el documento del guion en la carpeta del perfil. Solo alcanza a lo que crea HELM. |
| `userinfo.email` / `profile` | Enseñar qué cuenta está conectada en Ajustes. |

HELM solo escribe dos cosas: la reunión de una llamada reservada y el documento
de un guion. Nada más se crea, modifica ni borra. Cada perfil guarda su propio
permiso en `user_integrations`, que tiene RLS negando al rol anónimo: el token
nunca llega al navegador.

## Averías típicas

| Mensaje | Causa |
|---|---|
| `redirect_uri_mismatch` | La URI registrada no es idéntica a la que manda el servidor. Compárala con la que muestra Ajustes, incluida la parte `?action=callback`. |
| `access_denied` | La cuenta no está en *Usuarios de prueba* mientras la app está en modo Prueba. |
| `API not enabled` | Falta habilitar Calendar o Drive en el paso 2 — o se habilitaron en otro proyecto. |
| «Google ha revocado el acceso» | El usuario retiró el permiso desde su cuenta de Google, o cambió la contraseña. Se arregla volviendo a conectar desde Ajustes. |
