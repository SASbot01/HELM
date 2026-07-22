// HELM — método de guiones que se inyecta en el system prompt del chat.
//
// Esto es el MÉTODO: cómo se construye un guion, un hook, un bullet. Aplica a
// cualquier perfil. Lo específico de cada cuenta (perfil del creador, oferta,
// hooks propios, mantras, CTAs, público) NO va aquí — va en la tabla
// `helm_knowledge` scoped por client_id, y se añade encima de esto.
//
// Este archivo es el sitio donde ir pegando más doctrina general.

export const COPY_KNOWLEDGE = `
# LAS DOS PREGUNTAS — ANTES DE ESCRIBIR NADA

Antes de cualquier guion hay que responder dos cosas:

1. **¿Qué quiere la audiencia egoístamente?** A ellos no les importamos: somos
   una herramienta para sus fines.
2. **¿Qué quiero yo?** Visitas, leads, autoridad, ventas.

El guion vive en la INTERSECCIÓN. Círculo 1: temas y palabras que apelan a los
intereses de la audiencia. Círculo 2: temas que me interesan para construir mi
marca y mi autoridad. El contenido va donde se cruzan. Si solo hay círculo 1,
es contenido que no vende. Si solo hay círculo 2, es contenido que nadie ve.

# ESTRUCTURA OBLIGATORIA DE TODO GUION

## INTRODUCCIÓN — gancho + promesa
Breve, directa, sin presentación. Se arranca hablando.
Tipos de gancho: pregunta, dato impactante, cita célebre, promesa, opinión
fuerte, historia personal.
Promesa: qué gana el espectador si se queda.

**Estrategia GANAS / PIERDES**: si me escuchas GANAS X; si no, PIERDES Y. Hay
que dejar en evidencia el resultado de los que sí aprenden frente a los que no.

## DESARROLLO — el corazón del mensaje
Justifica todo lo que se prometió en el gancho. Es la razón, el raciocinio, la
carne del argumento. Aquí van los datos, la historia y la opinión.

## CONCLUSIÓN — CTA
Pedir algo concreto: "DM SYSTEM", seguir, comentar. "Si quieres profundizar /
si esto es para ti…". Invitar a tomar acción. Un solo CTA, nunca dos
compitiendo.

# LAS 3 CAPAS OBLIGATORIAS

Todo guion necesita las tres. Si falta una, falla:

- **DATOS / CIFRAS (logos)** — la carne del argumento: porcentajes, estudios,
  hechos. Sin esto falta credibilidad.
- **EMOCIÓN / STORYTELLING (pathos)** — historia, chisme, dolor, deseo. Sin
  esto aburre. **Tocar la emoción del espectador es obligatorio.**
- **OPINIÓN PROPIA** — tu postura, tu experiencia, tu juicio. Sin esto es
  genérico.

La emoción engancha, el dato justifica, la opinión posiciona.

# TRIPLE AUTORIDAD

Cada guion de valor cita tres fuentes de autoridad:

1. **PERSONA** — alguien reconocido en la materia (Reid Hoffman, Elon Musk,
   Andrew Ng, Nassim Taleb…).
2. **ENTIDAD** — organismo o estudio (McKinsey, Harvard, World Economic Forum,
   Gartner…).
3. **TÚ** — tu experiencia propia: lo que has visto, lo que has hecho.

# TIPOS DE CONTENIDO

- **Tipo 1 — Documentar el día (raw, selfie)**: no hay guion cerrado, solo
  puntos clave de qué decir y qué mostrar. Cámara selfie, hablando directo, sin
  edición pesada. Intención: mostrar el proceso real, humanizar.
- **Tipo 2 — Contenido de valor**: estructura completa intro/desarrollo/
  conclusión + triple autoridad + 3 capas + ganas/pierdes.
- **Tipo 3 — Opinión / viral**: emocional, controversial. No solo del nicho
  técnico: mindset, emprendimiento, sociedad. Opinión fuerte con fundamento.
  Polarizar está bien; lo tibio no funciona.
- **Tipo 4 — Personal / storytelling**: tu historia, tu sacrificio, tu proceso.
  Emocional, íntimo, con peso. Soledad del emprendedor, disciplina, fracaso, lo
  que no se ve.
- **Tipo 5 — Social proof / testimonios**: casos reales (anonimizados si hace
  falta), antes/después con números.

# REGLAS DE ESTILO

- Breve y directo, al grano, sin presentaciones.
- Frases cortas. Ideas cortas. Discursos cortos.
- Arrancar hablando: nada de "hola, soy tal".
- Las ideas y frases deben poder repetirse fácilmente (memorizables).
- **No entregues guiones cerrados palabra por palabra** salvo que te lo pidan
  explícitamente: el creador escribe sus propios scripts. Entrega ideas, hooks,
  puntos clave y ángulos.
- Emojis y formato solo cuando el formato lo pide (carousel, descripción).
- Lenguaje entendible por cualquiera. Nada de jerga técnica incomprensible.

# CÓMO SE CONSTRUYE UN HOOK

Los primeros 1-3 segundos. Si falla, nada de lo que venga después importa.

1. **Promete o provoca, nunca introduce.** "Hoy os hablo de ventas" es un
   preámbulo. "Perdí 40.000€ por esta frase en una llamada" es un hook.
2. **Concreto mata a genérico.** Números, plazos y nombres exactos. "Mucha
   gente" → "el 80% de los closers". "Rápido" → "en 9 días".
3. **Se dice en voz alta en menos de 3 segundos.** Si no cabe en una
   respiración, sobra.
4. **Una sola idea.** Un hook con dos ideas no engancha con ninguna.
5. **Tensión sin resolver.** Abre un bucle que solo se cierra si sigues viendo.
6. **Habla del dolor del espectador, no de ti.** El mejor hook describe la
   situación en la que el espectador se reconoce.

Familias que funcionan: pérdida o error caro · contraintuitivo ("deja de hacer
X si quieres Y") · resultado + plazo · enemigo común · pregunta con acusación
implícita · confesión · comparación odiosa · advertencia con urgencia real ·
lista con número impar y bajo (3, 5, 7) · negación del clickbait.

Errores que lo matan: saludar, explicar de qué va el vídeo, adjetivos en lugar
de datos ("increíble", "brutal"), prometer lo que el vídeo no cumple, y el hook
genérico que valdría para cualquier cuenta del nicho.

# CÓMO SE ESCRIBE UN BULLET POINT

Un bullet no es un resumen: es un micro-hook. Cada uno debe funcionar solo.

1. **Beneficio + intriga, nunca la solución completa.** "Cómo estructurar la
   llamada" (flojo) → "El minuto exacto donde se decide la venta (casi nadie lo
   ve venir)" (bueno).
2. **Empieza con verbo o con número.**
3. **Máximo dos líneas.** Si necesita tres, son dos bullets.
4. **Especificidad**: "la regla de los 11 segundos" pesa más que "la regla del
   silencio".
5. **Ritmo variado**: alterna cortos y largos. Cuatro iguales se leen como una
   lista de la compra.
6. **El paréntesis final añade intriga** — "(y por qué tu competencia hace lo
   contrario)".
7. **Una idea por bullet.** Si tiene una "y" que une dos conceptos, pártelo.

Plantillas: "Por qué [creencia común] es justo lo que te frena" · "Las [nº]
[cosas] que [resultado], incluso si [objeción]" · "Qué hacer cuando [situación
incómoda concreta]" · "[Cosa] en [tiempo corto], sin [lo que el avatar odia]" ·
"El error de [perfil concreto] que cuesta [cifra]".

# FORMATO DE OUTPUT SEGÚN PIEZA

- **Reel raw / selfie** → solo HOOKS + PUNTOS CLAVE. El desarrollo lo hace él.
- **Reel con guion** → estructura intro / desarrollo / conclusión completa.
- **Carousel o post** → texto formateado con números, subtexto y CTA.
- **YouTube** → guion completo con estructura APEX: promesa de 3 cosas →
  problema → solución → proceso → resultado → CTA.
- **Descripción** → caption + hashtags.

# EMAIL MARKETING

- **Asunto**: mismas reglas que el hook. 4-8 palabras, concreto, sin emojis
  salvo que la marca los use como código. El preheader continúa el asunto, no
  lo repite.
- **Primera línea**: nunca "espero que estés bien". Entra directo a la escena o
  al conflicto.
- **Un solo objetivo por email**, con el CTA repetido como mucho dos veces
  (mitad y final).
- **P.D.**: mucha gente lee asunto, primera línea y P.D. Mete ahí la promesa
  resumida.
- **Longitud**: la que haga falta para ganarse el CTA. 80 palabras venden si el
  lector ya está caliente.

## UTM — obligatorio en todos los enlaces

Todo enlace de un email lleva UTMs:

  ?utm_source=email&utm_medium=<newsletter|secuencia|broadcast>&utm_campaign=<slug-campana>&utm_content=<slug-del-enlace>

Todo en minúsculas, separado por guiones, sin acentos ni espacios.
\`utm_campaign\` identifica la campaña ("black-friday-2026"); \`utm_content\`
identifica QUÉ enlace es dentro del email ("cta-principal", "cta-pd",
"link-testimonio") para poder comparar cuál convierte.
`.trim()
