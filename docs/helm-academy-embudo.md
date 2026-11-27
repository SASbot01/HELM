# HELM Academy · el embudo de entrada

Vídeo de YouTube → `s4sf.net/helm-academy?guia=…` (la landing) → **el quiz de la
academia** (`academy.helmm.app`): seis preguntas y sus datos de contacto → entra
gratis en «AI para todo» con **«Tu plan»** (la guía por la que empezar) → en
menos de 24 horas, el mensaje de una persona del equipo.

Lo que tiene que quedar claro al terminar es **el siguiente paso: esperar ese
mensaje**. Se lo dicen la landing (antes de pulsar), el quiz y «Tu plan».

## 1. Lo que ve la persona

1. **La landing** (`/helm-academy`). Qué va a aprender y un botón. **No tiene
   formulario**: el botón lleva al quiz. Debajo, en tres pasos, lo que viene:
   contestas el quiz, entras con tu plan, te escribimos por WhatsApp en menos de
   24 horas para ayudarte con el primer paso.
2. **El quiz**, en la academia. Seis preguntas, una por pantalla, y después
   nombre, correo, WhatsApp y privacidad. Al enviarlo se crea su cuenta gratis.
3. **«Tu plan»**, dentro de AI para todo: la guía por la que empezar y el aviso
   de que en menos de 24 horas le escribe el equipo.

El quiz y «Tu plan» viven en la plataforma de la academia (otro repositorio).
Aquí está solo la landing y lo que recibe el CRM.

### Qué guía se abre: `?guia=`

Cada vídeo de YouTube enlaza a la landing con su guía:

    https://s4sf.net/helm-academy?guia=que-ningun-lead-se-enfrie

El botón lleva entonces a `academy.helmm.app/guia/<esa guía>`: la academia pone
su título sobre el quiz y la abre al terminarlo. El valor es el «enlace legible»
de la guía en la academia: minúsculas, números y guiones. Las de hoy:

| `?guia=` | Guía |
|---|---|
| `30-dias-de-contenido-en-una-tarde` | 30 días de contenido en una tarde |
| `que-ningun-lead-se-enfrie` | Que ningún lead se enfríe |
| `responde-en-2-minutos-sin-sonar-a-robot` | Responde en 2 minutos sin sonar a robot |
| `saca-el-negocio-de-tu-cabeza` | Saca el negocio de tu cabeza |
| `facturado-no-es-cobrado` | Facturado no es cobrado |
| `vende-ia-sin-meterte-en-lios` | Vende IA sin meterte en líos |
| `mis-8-no-negociables-con-claude` | Mis 8 no negociables con Claude |
| `los-mods-de-claude` | Los Mods de Claude |

Sin `?guia=` (el enlace de la bio, por ejemplo) el botón lleva a la parte
gratuita entera (`academy.helmm.app/aiparatodo`). Una guía nueva funciona en
cuanto exista en la academia; para que la landing diga su título hay que
añadirla a `GUIAS` en `src/pages/helmAcademy/entrega.js`.

### La campaña: de dónde viene cada lead

Lo que traiga la dirección de la landing de `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content`, `utm_term` y `fbclid` viaja en el enlace al quiz.
Si alguien entró por otra página de s4sf.net con sus UTM (la bio) y llegó a la
landing pulsando, viajan las de esa visita. Nada más pasa a la dirección: ningún
dato personal.

La academia las lee al llegar y las manda con el alta. En el CRM quedan en las
columnas de UTM del contacto (si es nuevo; a quien ya estaba solo se le rellenan
los huecos, porque de las suyas cuelga la atribución de los anuncios) y siempre
en `custom_fields.school.utm`. Ejemplo de enlace para la descripción de un vídeo:

    https://s4sf.net/helm-academy?guia=que-ningun-lead-se-enfrie&utm_source=youtube&utm_medium=video&utm_campaign=leads

## 2. El motivo del contacto

**«Para ayudarte con el primer paso.»** Es lo que le dicen la landing, el quiz y
«Tu plan», con las mismas palabras: si se cambia, se cambia en los tres sitios
(aquí, `CONTACTO.para` en `src/pages/helmAcademy/entrega.js`).

No suena a venta porque no lo es. En el quiz nos cuenta a qué se quiere dedicar,
cuánto quiere ganar, si ya usa la IA y por dónde quiere empezar; lo natural es
devolverle algo hecho con eso: su ruta de inicio, empezando por el primer paso.
Y abre la conversación sola, porque para afinarla hay que preguntarle.

Lo que se promete se cumple: el primer mensaje **lleva la ayuda**, no una
propuesta de llamada.

Alternativas, por si se quiere cambiar:

| Motivo | Cuándo encaja | Pega |
|---|---|---|
| **Un extra por WhatsApp**: la plantilla o los prompts que acompañan a la guía | El que más respuestas da: tiene que contestar para recibirlo. Se puede sumar. | Hace falta un recurso más. |
| **Dudas de la guía**: «para ver qué te ha parecido y resolverte dudas» | Solo si no hay nada mejor. | Es el que más suena a seguimiento comercial. |

## 3. Lo que queda en HELM para el equipo

Cada alta del quiz la manda la academia, desde su servidor, a
`api/leads.js · school`. Con ella:

- **Aviso** (campana del panel y Telegram) por cada persona nueva: «HELM
  Academy: escribe a Noa Ruiz antes de 24 h», con su teléfono, su correo, lo que
  contestó, la guía por la que entró y la hora límite (hora de Madrid).
- **En la ficha** (embudo «School»): la línea «se le dijo que le escribimos en
  menos de 24 horas para ayudarle con el primer paso» y, en
  `custom_fields.school`, la fecha `contactar_antes`, la guía (`guia`) y la
  campaña (`utm`).
- Quien repite el quiz con el plazo aún abierto (o un reintento de la academia)
  no genera otro aviso ni reinicia el reloj. Si vuelve pasado el plazo, sí.
- HELM no manda ningún correo a la persona: su sitio es la academia.

Las altas llegan todas desde la misma dirección (la del servidor de la
academia), así que el tope de altas nuevas por IP y hora de `school()` puede
frenarlas. No se pierden: la academia las reintenta.

## 4. WhatsApp de confirmación (a mano, o el día que se automatice)

Para mandar nada más apuntarse, si se quiere que el número del equipo ya le
suene cuando llegue el mensaje de verdad:

> Hola Noa 👋 Soy [nombre], del equipo de Alex Silvestre. Ya tienes tu plan en
> HELM Academy: https://academy.helmm.app/aiparatodo
> Guarda este número: en menos de 24 horas te escribo por aquí para ayudarte con
> el primer paso.

## 5. El mensaje del equipo (el contacto de las 24 horas)

**Antes de escribir**, en la ficha: por qué guía entró, qué quiere, su meta, si
usa la IA, a qué se dedica y por dónde quiere empezar (va junto a lo que se
dedica: «… · empieza por: …»).

**Apertura** (una pregunta fácil de contestar, y la ayuda ya preparada):

> Hola Noa, soy [nombre], del equipo de Alex (Silvestre AI). Ayer entraste en
> HELM Academy.
> He visto que quieres **crear contenido y vivir de ello** y que la IA la usas
> **un poco, a veces**. Con eso te he preparado por dónde empezar: son 3 pasos.
> ¿Te los paso en un audio o los prefieres escritos?

**Los tres pasos** (en un audio de 1–2 min o un mensaje corto). Siempre con esta
forma, adaptada a lo que contestó:

1. **Esta semana** — el primer paso, pequeño y concreto, que sale de su punto de
   partida («todavía no usa la IA» no empieza donde «es su herramienta
   principal»). Normalmente, la guía de su plan: «empieza por el punto X».
2. **Este mes** — lo que le acerca a su meta (contenido, servicio o negocio).
3. **Lo que se salta** — lo que no necesita todavía. Es lo que más se agradece.

**Después**, una pregunta para afinar (y para saber a quién tenemos delante):

> Para ajustarte el paso 2: ¿cuántas horas a la semana le puedes dedicar ahora
> mismo?

Solo si encaja y lo pide la conversación, se ofrece verlo en una llamada. Nunca
en el primer mensaje.

**Si no contesta:**

- A las 24 h: «Noa, te dejo aquí los pasos por escrito para que los tengas» (y
  se le mandan: la promesa se cumple conteste o no).
- A los 3 días: «¿Pudiste empezar por el paso 1? Si te atascas en algo, dímelo».
- Después, nada más. Se queda en el embudo para el contenido.

## 6. Lo que se puede cambiar

En `src/pages/helmAcademy/entrega.js`:

- **Las guías** (`GUIAS`): los títulos que la landing sabe decir.
- **El vídeo** (opcional): `VSL.youtube` (enlace de YouTube, mejor «oculto») o
  `VSL.mp4` (archivo en `public/helm-academy/`), con su título y sus minutos.
  Sale encima del botón. Vacío, la landing no enseña vídeo.
- **El contacto** (`CONTACTO`): plazo, canal y para qué se le escribe. Tiene que
  decir lo mismo que el quiz y «Tu plan» de la academia.

Y una cosa que decide Alex: quién del equipo recibe el aviso de Telegram.
