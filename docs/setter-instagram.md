# Setter de Instagram — puesta en marcha

El setter contesta los DM de Instagram de un perfil, cualifica al lead y lo lleva a
la llamada. Código: `api/_lib/setter-ig.js` (motor), `api/ig-webhook.js` (lo que
manda Meta), `api/setter-ig.js` (panel) y `src/agents/SetterIG.jsx` (Agentes →
Setter de Instagram). Tablas: `migrations/107_setter_instagram.sql`.

## Lo que hay que hacer una vez, en la app de Meta de HELM

Es la misma app que ya da las métricas (IG_APP_ID / IG_APP_SECRET), con la
«Instagram API with Instagram Login».

1. **Permiso de mensajes.** En *Casos de uso → Instagram → Permisos*, añadir
   `instagram_business_manage_messages`. Mientras la app no pase la revisión, solo
   funciona con las cuentas añadidas en *Roles de la app → Probadores de
   Instagram* (cada cuenta tiene que aceptar la invitación desde su Instagram:
   *Configuración → Apps y sitios web → Invitaciones de probador*).
2. **Webhook.** En *Instagram → Configurar webhooks*:
   - URL de devolución de llamada: `https://helm.s4sf.net/api/ig-webhook`
   - Token de verificación: el valor de `IG_WEBHOOK_VERIFY_TOKEN` del servidor.
   - Suscribir el campo **messages**.
3. **Revisión de la app (App Review)** para usarlo con cuentas de clientes:
   - Verificación del negocio en el Business Manager.
   - Pedir acceso avanzado a `instagram_business_basic` e
     `instagram_business_manage_messages`.
   - Meta pide un vídeo de la pantalla: conectar la cuenta desde HELM, que llegue
     un DM, el borrador del setter en la bandeja, aprobarlo y verlo en Instagram.
     También la explicación de que siempre se puede pasar a una persona
     (botón «Tomar el control» y el setter pasa a humano si se lo piden).
   - Suele tardar de unos días a varias semanas.

## En el servidor

- `IG_WEBHOOK_VERIFY_TOKEN`: una cadena larga al azar (la misma que en Meta).
- `IG_APP_SECRET`: ya existe; con ella se comprueba la firma de cada aviso.
- `HELM_PUBLIC_URL`: ya existe; con ella se hace el enlace del formulario de reserva.

## En cada perfil

Agentes → Setter de Instagram → Configuración:

1. **Conectar mensajes de Instagram.** Vuelve a pedir el permiso a la cuenta, esta
   vez con mensajes, y la suscribe al webhook.
2. Rellenar lo que tiene que saber (oferta, para quién es, qué no prometer) y las
   preguntas para cualificar. El tono sale de la Biblia del perfil.
3. Elegir a dónde lleva al lead: el formulario de reserva de HELM (el enlace lleva
   la ficha del CRM, así la reserva cae en el mismo contacto), un enlace propio o
   solo cualificar y pasar a una persona.
4. Probarlo en la pestaña **Probar** (no usa Instagram).
5. Encenderlo en modo **Borrador**. Cuando las respuestas sean buenas, pasar a
   **Automático**.

## Reglas que el setter respeta siempre

- Solo contesta a quien ha escrito antes, y hasta 24 h después de su último
  mensaje (lo que permite Meta sin etiquetas especiales).
- La primera respuesta avisa de que es un asistente (Ley de IA, art. 50).
- Si alguien del equipo escribe en el hilo desde la app de Instagram o desde
  HELM, el setter deja de contestar en ese hilo hasta que se lo devuelvan.
- Pasa a una persona si se lo piden, si hay queja, negociación de precio, un
  tema delicado o algo que no sabe, y avisa en las notificaciones del perfil.
- No inventa precios, plazos ni resultados que no estén en sus instrucciones.
