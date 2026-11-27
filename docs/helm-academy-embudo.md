# HELM Academy · el embudo de entrada

Vídeo de YouTube → `s4sf.net/helm-academy` (el formulario) → en el momento, el
lead magnet (un vídeo de 5–7 min **y** una guía en PDF) → en menos de 24 horas,
el mensaje de una persona del equipo.

Lo que tiene que quedar claro al terminar el formulario es **el siguiente paso:
esperar ese mensaje**. Todo lo demás acompaña.

## 1. Lo que ve la persona

1. **El formulario** (`/helm-academy`). Bajo el botón ya lo dice: «Después, en
   menos de 24 horas, te escribe por WhatsApp una persona del equipo con tu ruta
   de inicio». Así el mensaje no le llega de sorpresa. El texto legal dice
   también para qué se usa el teléfono.
2. **Las gracias** (`/helm-academy/gracias`). Ya no se va al Skool. Arriba, el
   aviso («Tu siguiente paso: esperar nuestro WhatsApp»); debajo, tres pasos
   numerados: mira el vídeo, descarga la guía, espera nuestro mensaje. El último
   le devuelve lo que nos contó y el final del teléfono al que le escribimos.
3. **El correo** (si hay correo saliente en el servidor). El mismo mensaje y el
   enlace a su página, para que lo tenga aunque cierre la pestaña.

## 2. El motivo del contacto

**Elegido: su ruta de inicio.** En el formulario nos cuenta a qué se quiere
dedicar, cuánto quiere ganar y si ya usa la IA. Lo natural es devolverle algo
hecho con eso: por dónde empezar según su punto de partida y qué se puede
saltar. No suena a venta porque no lo es: es lo primero que se le manda. Y abre
la conversación sola, porque para afinar la ruta hay que preguntarle.

Lo que se promete se cumple: el primer mensaje **lleva la ruta**, no una
propuesta de llamada.

Alternativas, por si se quiere cambiar (se cambia en
`src/pages/helmAcademy/entrega.js` · `CONTACTO`, y aquí):

| Motivo | Cuándo encaja | Pega |
|---|---|---|
| **Bienvenida y acceso**: «te damos de alta y te pasamos tu acceso» | Si el acceso deja de ser automático (plataforma propia, alta a mano). Poner `SKOOL_EN_GRACIAS = false`. | Si el acceso ya es inmediato, no hay nada que entregar. |
| **Un extra por WhatsApp**: la plantilla o los prompts que acompañan a la guía | El que más respuestas da: tiene que contestar para recibirlo. Se puede sumar a la ruta. | Hace falta un tercer recurso. |
| **Dudas del vídeo**: «para ver qué te ha parecido y resolverte dudas» | Solo si no hay nada mejor. | Es el que más suena a seguimiento comercial. |

## 3. Lo que queda en HELM para el equipo

- **Aviso** (campana del panel y Telegram) por cada persona nueva: «HELM
  Academy: escribe a Noa Ruiz antes de 24 h», con su teléfono, su correo, lo que
  contestó y la hora límite (hora de Madrid).
- **En la ficha** (embudo «School»): la línea «se le dijo que le escribimos en
  menos de 24 horas con su ruta de inicio» y, en `custom_fields.school`, la
  fecha `contactar_antes`.
- **Por dónde va**: «empezó a ver el vídeo» y «descargó la guía (PDF)» se anotan
  solas en la ficha cuando lo hace. Antes de escribirle, mirarlo: no es lo mismo
  quien ha visto el vídeo que quien no.
- Quien reenvía el formulario con el plazo aún abierto no genera otro aviso ni
  reinicia el reloj. Si vuelve pasado el plazo, sí.

## 4. El correo de confirmación (sale solo)

> **Asunto:** Lo tuyo de HELM Academy, y tu siguiente paso
>
> Hola Noa:
>
> Aquí tienes lo que has pedido, para verlo cuando quieras:
> https://s4sf.net/helm-academy/gracias
>
> Tu siguiente paso: esperar nuestro WhatsApp. En menos de 24 horas te escribe
> una persona del equipo de Silvestre AI, al teléfono que nos has dejado. Con lo
> que nos has contado te preparamos tu ruta de inicio: por dónde empezar según
> tu punto de partida y qué te puedes saltar.
>
> No tienes que hacer nada más. Solo contestar cuando te escribamos.
>
> Alex Silvestre
> HELM Academy

Sale de `api/leads.js` (`prometeContacto`) y solo si el servidor tiene
`RESEND_API_KEY` y `CORREO_DESDE`. Sin eso no se manda nada y el alta funciona
igual.

## 5. WhatsApp de confirmación (a mano, o el día que se automatice)

Para mandar nada más apuntarse, si se quiere que el número del equipo ya le
suene cuando llegue la ruta:

> Hola Noa 👋 Soy [nombre], del equipo de Alex Silvestre. Ya tienes tu vídeo y
> tu guía de HELM Academy: https://s4sf.net/helm-academy/gracias
> Guarda este número: en menos de 24 horas te escribo por aquí con tu ruta de
> inicio.

## 6. El mensaje del equipo (el contacto de las 24 horas)

**Antes de escribir**, en la ficha: qué quiere, su meta, si usa la IA, a qué se
dedica, y si ha visto el vídeo y descargado la guía.

**Apertura** (una pregunta fácil de contestar, y la ruta ya preparada):

> Hola Noa, soy [nombre], del equipo de Alex (Silvestre AI). Ayer nos dejaste
> tus datos en HELM Academy.
> He visto que quieres **crear contenido y vivir de ello** y que la IA la usas
> **un poco, a veces**. Con eso te he preparado tu ruta de inicio: son 3 pasos.
> ¿Te la paso en un audio o la prefieres escrita?

**La ruta** (tres pasos, en un audio de 1–2 min o un mensaje corto). Siempre con
esta forma, adaptada a lo que contestó:

1. **Esta semana** — lo primero, pequeño y concreto, que sale de su punto de
   partida («todavía no usa la IA» no empieza donde «es su herramienta
   principal»).
2. **Este mes** — lo que le acerca a su meta (contenido, servicio o negocio).
3. **Lo que se salta** — lo que no necesita todavía. Es lo que más se agradece.

Si no ha visto el vídeo, el paso 1 es verlo: «empieza por el vídeo, el minuto X
es el tuyo».

**Después de la ruta**, una pregunta para afinarla (y para saber a quién tenemos
delante):

> Para ajustarte el paso 2: ¿cuántas horas a la semana le puedes dedicar ahora
> mismo?

Solo si encaja y lo pide la conversación, se ofrece verlo en una llamada. Nunca
en el primer mensaje.

**Si no contesta:**

- A las 24 h: «Noa, te dejo aquí la ruta por escrito para que la tengas» (y se
  le manda: la promesa se cumple conteste o no).
- A los 3 días: «¿Pudiste empezar por el paso 1? Si te atascas en algo, dímelo».
- Después, nada más. Se queda en el embudo para el contenido.

## 7. Lo que falta para publicarlo

En `src/pages/helmAcademy/entrega.js`:

- **El vídeo**: `VSL.youtube` (enlace de YouTube, mejor «oculto») o `VSL.mp4`
  (archivo en `public/helm-academy/`). Y su título, los minutos y la frase de
  debajo.
- **La guía**: el PDF en `public/helm-academy/` y su ruta en `PDF.href`, con su
  título.
- **El número** desde el que escribe el equipo (`CONTACTO.numero`), si se quiere
  enseñar para que lo guarden.
- **La comunidad**: `SKOOL_EN_GRACIAS` deja o quita el enlace «mientras
  esperas» al Skool.

Mientras falte el vídeo o la guía, su bloque no se pinta y el formulario no lo
promete (el botón sigue diciendo «Entrar gratis a HELM Academy»). **No publicar
hasta que estén los dos**: sin ellos la pantalla solo avisa del contacto.

Y dos cosas que decide Alex: si el contacto es por WhatsApp o también por
llamada (`CONTACTO.canal`), y quién del equipo recibe el aviso de Telegram.
