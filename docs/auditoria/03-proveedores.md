# 3. Inventario de proveedores

Empresas de fuera a las que HELM envía datos o de las que los recibe. Son los posibles «encargados del tratamiento» (quien trata datos por tu cuenta) que habría que listar a un cliente.

Las columnas de contrato, región y retención son condiciones de cada proveedor: están comprobadas en la fuente oficial de cada proveedor el 5 de octubre de 2026 (ver «Fuentes» y sus límites). Lo que no se pudo leer sigue marcado `PENDIENTE`.

## Reciben datos personales

| Proveedor | Para qué | Qué datos reciben | Clave | DPA / país / retención |
|---|---|---|---|---|
| **Anthropic** (Claude) | Agentes, chat, «Mi día», etiquetado de reels | Nombres de leads y clientes, empresa, etapa, notas del CRM, respuestas de formularios, descripción de llamadas, ventas con nombre del comprador, transcripciones | Global del servidor, o la del perfil | EE. UU. DPA con cláusulas contractuales tipo incluido en los términos comerciales; entradas y salidas se borran en 30 días; no se usan para entrenar por defecto [1][2][3]. `PENDIENTE`: confirmar que la cuenta está bajo términos comerciales |
| **Google** (Calendar, Drive, OAuth) | Agenda, reservas, vídeos, documentos | Al reservar: nombre, email, teléfono y **todas las respuestas** del lead en el evento; Google le envía la invitación | App global + token por perfil | Depende de la cuenta de cada perfil. Con Google Workspace: DPA incluido en el contrato, Google es encargado, borrado en 180 días como máximo, región UE elegible solo en algunas ediciones [4][6]. Con un Gmail personal: no consta DPA (`PENDIENTE` releer). Adherida al marco UE-EE. UU. [5]. Además HELM, como app conectada, tiene obligaciones propias: ver abajo |
| **Telegram** | Avisos al dueño y chat con la IA | Avisos con nombre, email y teléfono del lead; respuestas de la IA con datos del CRM | Bot por perfil | **Sin DPA**: Telegram no se ofrece como encargado. Datos de usuarios europeos en Países Bajos; los mensajes de bot no van cifrados de extremo a extremo y no tienen plazo de borrado; sin mención al marco UE-EE. UU. [10][11] |
| **Cloudflare** (túnel) | Publicar HELM en internet | Todo el tráfico pasa por ellos | Token en el sistema | DPA (v6.4, 3 abr 2026) incluido en el contrato de autoservicio, sin firmar nada; Cloudflare es encargado. Red global, sin región por defecto (limitar a la UE es de pago, Enterprise). Adherida al marco UE-EE. UU. [12][13]. `PENDIENTE`: plazos de sus registros y si el DPA cubre el plan gratuito |
| **Stripe** | Importar ventas y clientes | HELM lee nombre, email, teléfono, pagos. Apenas envía | Clave por perfil | La cuenta es de cada cliente: Stripe es encargado **suyo**, no de HELM. DPA incluido en su contrato (28 sep 2026). Datos en EE. UU. e India entre otros; adherida al marco UE-EE. UU. También actúa por cuenta propia (fraude) y entrena modelos con los datos; conserva 5 años o más [15][16]. `PENDIENTE`: residencia de datos |
| **WooCommerce** | Importar pedidos | Es la tienda del propio cliente | Clave por perfil | No aplica (es del cliente) |
| **Cal.com** | Calendario incrustado en `/empresas` | Nombre y email del visitante, en la URL del iframe | Variable de entorno | Encargado para los datos de quien reserva, pero el DPA **hay que pedirlo** (no es público ni automático). Datos en EE. UU. (cal.com); existe una instancia aparte en la UE (cal.eu). Adherida al marco UE-EE. UU.; dice no entrenar modelos [17][18] |
| **Google Fonts** | Tipografías | IP y navegador de cada visitante | — | **Ya no se usa** (5 oct 2026): las tipografías se sirven desde el propio servidor (`public/fonts`) |

### Lo que sale de la comprobación

- **Telegram es el punto más débil**: sin contrato de encargado y con nombre, email y teléfono de leads en los avisos. Sus condiciones para bots piden además política de privacidad del bot y datos cifrados en reposo [11], y hoy los tokens se guardan sin cifrar. Decisión pendiente: quitar los datos personales de los avisos (dejar «tienes un lead nuevo» y un enlace) o asumirlo e informarlo.
- **Google obliga a HELM como aplicación conectada** [7][8][9]: usar los datos solo para funciones visibles al usuario, no cederlos ni usarlos para entrenar modelos, y pasar una evaluación de seguridad si la app se publica con permisos amplios de Drive. Hay que revisar que enviar datos de agenda y Drive a Anthropic encaja con ese «uso limitado».
- **Cal.com**: pedir el DPA desde su centro de confianza [18], o usar la instancia europea.
- **Stripe y WooCommerce** son proveedores del cliente, no de HELM: en el contrato con el cliente HELM figura como quien accede a esos datos por su encargo.

## No reciben datos personales (o solo consultas)

| Proveedor | Para qué | Qué se envía |
|---|---|---|
| Instagram (API oficial) | Métricas de las publicaciones propias | Nada de terceros; solo recuentos |
| Instagram y otras webs de vídeo, vía `yt-dlp` | Descargar los reels que se pegan | La URL del reel |
| Google Places | Prospección | Texto de búsqueda («dentistas en Valencia») |
| BOE / BORME | Prospección | Consulta por provincia. **Devuelve** nombres de administradores |
| OpenStreetMap | Prospección | Consulta de lugar y categoría |
| Brave Search / DuckDuckGo | Chat (`/estudiar`) y prospección | Términos de búsqueda |
| Webs de los prospectos | Enriquecer fichas | Visitas a su web (respeta `robots.txt`) |
| Calendly | Ver eventos propios | — |
| Hugging Face | Descargar el modelo de Whisper una vez | Nada personal |

## Se quedan dentro (no son proveedores)

Modelo local (Ollama), Whisper, Tesseract y la propia base de datos: se procesan en la máquina y no salen.

## Hay restos en la base, pero el código ya no los usa

Close CRM, ManyChat, WhatsApp Cloud API, Fireflies, proveedores de email, Sentry (su librería ya se ha quitado del proyecto). Sus tablas están vacías. Conviene borrarlas para que no aparezcan en una auditoría de terceros.

## Cómo se guardan las claves de estos proveedores

- Las del servidor: en `.env.server` (permisos 600, nunca subido a git).
- Las de cada perfil (Google, Stripe, Telegram, Instagram, Claude, WooCommerce…): en la tabla `user_integrations`, **en texto plano**, sin cifrar.

## Fuentes

- [1] Anthropic, «How long do you store my organization's data?» — https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- [2] Anthropic, «Is my data used for model training?» — https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
- [3] Anthropic, «How do I view and sign your Data Processing Addendum (DPA)?» — https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa

- [4] Google, Cloud Data Processing Addendum — https://cloud.google.com/terms/data-processing-addendum
- [5] Google, marcos de transferencia de datos (vigente desde el 23 ago 2025) — https://policies.google.com/privacy/frameworks
- [6] Google Workspace, elegir la ubicación de los datos — https://knowledge.workspace.google.com/admin/compliance/choose-a-geographic-location-for-your-data
- [7] Google APIs Terms of Service (9 nov 2021) — https://developers.google.com/terms
- [8] Google API Services User Data Policy (15 feb 2024) — https://developers.google.com/terms/api-services-user-data-policy
- [9] Google Workspace API user data and developer policy (3 sep 2026) — https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- [10] Telegram, política de privacidad (21 ago 2026) y preguntas frecuentes — https://telegram.org/privacy · https://telegram.org/faq
- [11] Telegram, condiciones para desarrolladores de bots — https://telegram.org/tos/bot-developers
- [12] Cloudflare, Customer DPA v6.4 (3 abr 2026) — https://www.cloudflare.com/cloudflare-customer-dpa/
- [13] Cloudflare, RGPD y subencargados — https://www.cloudflare.com/trust-hub/gdpr/ · https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/
- [14] Cloudflare, Regional Services — https://developers.cloudflare.com/data-localization/regional-services/
- [15] Stripe, DPA y contrato de servicios (28 sep 2026) — https://stripe.com/legal/dpa · https://stripe.com/es/legal/ssa
- [16] Stripe, política de privacidad (16 ene 2026) y Privacy Center — https://stripe.com/es/privacy · https://stripe.com/es/legal/privacy-center
- [17] Cal.com, política de privacidad (1 oct 2026) — https://cal.com/privacy
- [18] Cal.com, centro de confianza y subencargados — https://trust.cal.com/ · https://trust.cal.com/subprocessors

Consultadas el 5 de octubre de 2026. Las páginas se leyeron a través de una herramienta que devuelve un extracto, no el texto íntegro: abrir cada enlace y releer el pasaje antes de citarlo a un cliente. No se comprobó la inscripción de cada empresa en el registro oficial del marco UE-EE. UU. (dataprivacyframework.gov), solo lo que cada una declara. `REVISIÓN-LEGAL`.
