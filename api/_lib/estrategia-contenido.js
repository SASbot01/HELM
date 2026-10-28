// HELM — framework de Ronda de Stories / Ronda de Reels, condensado para
// inyectar en el system prompt de los Agentes de Contenido.
//
// Es la misma doctrina que ve el usuario en Contenido → Estrategias
// (src/helm/views/contenido/estrategiasData.js), resumida a lo que un agente
// necesita para proponer ideas: los tres carriles, la Ronda, las plantillas y
// las reglas de forma. El banco de ganchos y los datos de soporte no van aquí
// — son para que la persona entienda el método, no hacen falta para generar.

export const ESTRATEGIA_CONTENIDO = `
# FRAMEWORK DE CONTENIDO — RONDA DE STORIES / RONDA DE REELS

La unidad no es la pieza suelta, es la ronda: una secuencia que abre, tensa,
enseña, prueba, recoge y pide. Toda idea que propongas tiene que encajar en
este framework, no en "consejos genéricos de redes sociales".

## LOS TRES CARRILES (aplican a historias y a reels)

- **Dar** (~50-60 % de las piezas) — enseñas un mecanismo con nombre propio.
  La persona podría aplicarlo hoy sin comprarte nada.
- **Conectar** (~25-35 %) — proceso, cifras, errores, cara, alumnos. Pruebas
  que el mecanismo funciona y que tú lo vives.
- **Vender** (~15 %) — oferta explícita, una sola acción. Nunca aparece sin
  que Dar y Conectar hayan pasado antes.

## RONDA DE STORIES — 7 frames

01 Ancla (Dar) — que no pasen de largo, sin saludo ni logo.
02 Tensión (Dar) — el problema, con coste puesto.
03 Mecanismo (Dar) — la idea, bautizada con nombre propio. Un solo paso.
04 Prueba (Conectar) — captura, cifra o caso real que demuestra el 03.
05 Interacción (Conectar) — encuesta o caja de preguntas. Abre la ventana de DM.
06 Puente (Conectar) — conecta lo enseñado con lo que se vende. Aún no pide.
07 Petición (Vender) — una sola acción, mínima fricción.

Plantillas de ronda: A·Mecanismo (7 frames, día por defecto, 3-4×/semana) ·
B·Prueba social (6 frames, cuando un alumno consigue algo) · C·Venta (12
frames, carrito abierto) · D·Lanzamiento (5 rondas, una por día).

## RONDA DE REELS — 7 tiempos

01 Gancho (Dar, 0-3s) — imagen y frase a la vez, sin intro.
02 Contrato (Dar, 3-8s) — qué se lleva quien se queda y en cuánto tiempo.
03 Tensión (Dar, 8-14s) — el problema, con coste puesto.
04 Mecanismo (Dar, 14-20s) — la idea, bautizada. El tiempo que se guarda.
05 Prueba (Conectar, 20-28s) — se enseña, no se cuenta.
06 Petición (Vender, 28-30s) — una sola acción, en el pico de valor.
07 Bucle (Conectar, últimos 1-2s) — el final devuelve a la primera frase.

Plantillas de guion: A·Mecanismo (20-30s, 3×/semana) · B·Prueba (25-40s,
2×/semana) · C·Objeción (15-25s, 1×/semana) · D·Lanzamiento (5 reels, 1/día).

## REGLAS DE FORMA QUE NO SE NEGOCIAN

- Una idea por pieza. Si necesita dos frases, son dos piezas.
- Máximo doce palabras en pantalla a la vez.
- El gancho tiene que crear una pregunta en la cabeza de quien mira — si no,
  es un titular, no un gancho.
- El CTA va uno solo por pieza, nunca dos compitiendo.
- Tres piezas de Dar/Conectar por cada una que llega a venta dura.
- Nada de pantallazos de tu propio panel de métricas como prueba: la prueba
  es el resultado del cliente, no el tuyo.

## CATEGORÍAS DE GANCHO DISPONIBLES

Contraste · Error confesado · Cifra concreta · Enemigo común · Curiosidad de
proceso · Pregunta cerrada · Antes/después · Tesis propia · Filtro de rol ·
Demostración inmediata · Objeción ajena (sacada de la caja de preguntas) ·
Cita del cliente (su frase literal + un cualificador).
`
