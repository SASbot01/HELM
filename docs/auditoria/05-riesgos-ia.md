# 5. Riesgos de IA en el código actual

## 5.1 Dónde se llama a un modelo

Hay dos proveedores: **Claude** (Anthropic, fuera) y un **modelo local** (Ollama, dentro de la máquina). No hay una única función común: existen dos capas (`llmChat` en `api/_lib/llm.js` y llamadas directas a `claudeTurno`), aunque todo lo que va a Claude acaba pasando por `claudeTurno` (`api/_lib/anthropic.js:117-171`). Eso facilita la pasarela de la Fase 4.

| Dónde | Modelo | Datos personales de terceros en el prompt | Herramientas |
|---|---|---|---|
| Chat del panel y Telegram (`api/chat.js`) | Claude con la clave del perfil, o local | Sí: nombres de contactos, transcripciones de llamadas, conversaciones de leads pegadas | 3 (ver 5.3) |
| «Mi día» (`api/dia.js`) | Claude **con la clave del servidor** si el perfil no tiene la suya | Sí: ficha del contacto, notas, valor, respuestas de formularios, asistentes | Ninguna |
| Comercial, del equipo de agentes | Claude, clave del servidor | Sí: hasta 25 contactos con nombre, empresa, etapa e importe; ventas con nombre del comprador | Solo entrega estructurada |
| Informe semanal | Claude, clave del servidor | Agregados, orígenes de leads, ventas por producto | Solo entrega |
| Director, productor, analista, investigador, guionista | Claude, clave del servidor | No (títulos, métricas propias, reels de creadores) | Solo entrega |
| Etiquetado y estudio de reels (worker) | Claude, o local si falla | No (voz transcrita de creadores públicos) | Ninguna |
| OCR de facturas (`api/gastos.js`) | Clave del perfil, o local | Proveedor, NIF, importes | Una, que solo sugiere |
| Onboarding, contenido, análisis de Stripe | Clave del perfil, o local | No | Ninguna |
| Conector MCP (`api/mcp/`) | El modelo es claude.ai, fuera de HELM | Transcripciones, calendario, memoria | 10 (ver 5.3) |

Dos cosas a tener presentes:

- **«Mi día» y el agente comercial mandan datos de leads a Anthropic con la clave del servidor**, sin que el perfil lo haya elegido ni haya dónde desactivarlo. Hay que reflejarlo en el registro de tratamientos y en el contrato con el cliente.
- No se guardan los prompts completos. Sí se guardan las respuestas y lo que el usuario escribe (chat, «Mi día», memoria). No hay plazo de borrado.

## 5.2 Por dónde entra texto que no es de confianza

Texto que escribe alguien de fuera y que acaba dentro de un prompt:

- Respuestas de formularios públicos (cualquiera puede escribir lo que quiera en su nombre o en una respuesta).
- Nombres de clientes que vienen de Stripe o WooCommerce.
- Títulos y descripciones de eventos de Google Calendar (los pone quien convoca).
- Documentos importados de Drive y transcripciones de llamadas.
- Páginas web descargadas por `/estudiar` y por la prospección.
- Transcripciones y descripciones de reels de otros creadores.
- Mensajes de Telegram (solo de chats autorizados).

En ningún sitio se marca ese texto como «datos, no instrucciones»: se pega bajo un título y ya.

## 5.3 Qué puede hacer cada agente

**Chat (`api/_lib/acciones.js`)** — se ejecutan al momento, sin confirmación, hasta 4 por turno:

- `crear_reporte_diario`: escribe en `reports`.
- `crear_miembro_equipo`: escribe en `helm_team`.
- `guardar_archivo`: guarda un texto escrito por el modelo en el bucket **público** y devuelve su enlace.

No hay herramientas de borrar, enviar ni navegar. Los argumentos se validan contra listas cerradas.

**Equipo de agentes (`api/_lib/equipo.js`)** — ninguno tiene herramientas de acción; cada uno «entrega» un resultado y el código decide qué hacer con él:

- Notas en la memoria del perfil (máx. 8), tareas propuestas (máx. 5, pendientes de aceptar), guiones siempre como borrador.
- El director además encola a los demás agentes.
- No pueden tocar el CRM, las ventas ni las tareas reales. Tope diario de tokens por perfil.

**Conector MCP** — lo usa claude.ai con un token:

- Lectura: `identidades`, `perfiles`, `corpus`, `calendario`.
- Escritura: `programar_guiones` (entra **directo al calendario, sin borrador**), `ordenar_video` (mueve archivos en Drive), `guardar_memoria`.
- Solo con el token maestro: `anadir_reels`, `asignar_creadores`, `etiquetar_reels`.

## 5.4 Caminos de inyección de instrucciones

Un camino de inyección existe cuando en el mismo turno coinciden texto no fiable y una herramienta con efecto.

1. 🔴 **Chat → archivo público.** La memoria y la biblioteca del perfil (que pueden contener una web descargada, un documento de Drive o una conversación pegada) van en el prompt junto a `guardar_archivo`. Un texto malicioso podría hacer que el modelo vuelque datos del perfil en un archivo de enlace público. Sin confirmación humana.
2. 🟠 **Memoria envenenada en el equipo de agentes.** Un nombre de lead o el título de un evento con instrucciones dentro puede acabar convertido en una nota de memoria que los siete agentes leen en las ejecuciones siguientes. El daño está acotado: solo pueden producir borradores, propuestas y avisos, y todo pasa por aprobación.
3. 🟠 **Reels de terceros → estudio → todos los perfiles.** La transcripción de un reel alimenta un «estudio» que se guarda a nivel de creador y luego leen el guionista de cada perfil que tenga ese creador y el conector MCP.
4. 🟠 **Conector MCP.** claude.ai lee transcripciones y memoria de terceros y en la misma sesión puede escribir en el calendario sin borrador, mover archivos de Drive y escribir memoria.

Mitigaciones que ya existen: validación de argumentos, listas cerradas, estados de borrador y propuesta, topes de cantidad y de tokens, y que `/estudiar` corre sin herramientas.

## 5.5 Memoria: ¿separada por cliente?

- La memoria del chat (`helm_knowledge`) y la del equipo de agentes (`agent_memory` de ámbito «perfil») van por perfil.
- **No toda lo está.** Hay memoria «de creador» (compartida por todos los perfiles que tengan asignado ese creador; un perfil puede escribir en ella desde el conector MCP y otro la lee) y memoria «global» (la leen todos).
- Hoy son todo perfiles del mismo operador, así que no hay fuga real. Para vender a empresas distintas, esto incumple «nada de memoria compartida entre clientes» y hay que rediseñarlo en la Fase 3.
- `PENDIENTE`: comprobar si en los datos actuales algún creador está asignado a más de un perfil.
