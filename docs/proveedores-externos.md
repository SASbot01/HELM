# Proveedores externos pendientes de decidir

Tres bloques del informe de julio de 2026 no se pueden construir enteros sin
contratar un servicio de fuera. Lo que sigue es la comparativa para decidir,
con precios consultados en **julio de 2026** — conviene verificarlos antes de
firmar, porque los tres mercados se mueven.

En los tres casos HELM ya tiene el hueco preparado: el modelo de datos, la
interfaz y la cola existen. Falta enchufar el proveedor.

---

## 1. Contratos con firma digital

**Qué pide el informe:** con solo el email del cliente, generar y enviar un
contrato para firma 100 % digital, con copia firmada automática para las dos
partes.

### Lo que hay que entender antes de elegir

La firma electrónica en España se rige por **eIDAS**, que define tres niveles:

| Nivel | Qué es | Vale para |
|---|---|---|
| **Simple** | Un clic de aceptación con traza | Documentos de bajo riesgo |
| **Avanzada** | Identifica al firmante y detecta manipulaciones | **Contratos de servicios — lo que necesitas** |
| **Cualificada** | Avanzada + certificado cualificado de un QTSP | Escrituras, contratación pública |

Para contratos de consultoría, la **avanzada** es suficiente y es el estándar
del sector. No pagues por cualificada salvo que un cliente te lo exija.

### Comparativa

| | **Signaturit** | **DocuSign** |
|---|---|---|
| Origen | Español, **QTSP** con Autoridad de Certificación propia | Estadounidense, líder mundial |
| Plan de entrada | ~10 €/mes (5 envíos) | ~9 €/mes (personal) |
| Plan de negocio | ~29 €/usuario/mes (10 envíos) · Business+ ~45-57 €/usuario/mes (ilimitado) | Más caro por usuario |
| API | Desde ~600 $/año (Starter) | Sí, orientada a volumen alto |
| Soporte en español | Profundo | Menos profundo |
| Extras | Firma avanzada ~2,50 €, cualificada 10-15 € por firma | — |

**Recomendación: Signaturit.** Es QTSP español, cubre los tres niveles de
eIDAS, el soporte y la doctrina legal están en tu idioma y jurisdicción, y a
tu volumen (contratos de consultoría, no miles al mes) el coste por usuario
sale mejor que DocuSign. DocuSign compensa cuando hay integraciones de
volumen muy alto o presencia multinacional, que no es el caso.

**Aviso de coste:** el precio por usuario/mes engaña. Si vas a mandar pocos
contratos, el plan API anual (~600 $) puede salir peor que el Business+ con
envíos ilimitados. Cuenta cuántos contratos firmas al mes antes de elegir
plan.

### Qué falta en HELM

`helm_team.contract_url` ya guarda el contrato del equipo, y el plugin
**Contratos** está registrado como no disponible. Al conectar haría falta:
plantillas de contrato, endpoint de envío, y un webhook que reciba el
documento firmado y lo guarde en el bucket `helm`.

---

## 2. Avisos de tareas por email y WhatsApp

**Qué pide el informe:** notificación automática por email o WhatsApp al
responsable de una tarea.

### Email

| | **Resend** | **Postmark** |
|---|---|---|
| Gratis | 3.000 emails/mes | No |
| Entrada | 20 $/mes → 50.000 emails | 15 $/mes → 10.000 emails |
| A 10.000/mes | Cuesta el plan de 50.000 | **Más barato** |
| A 50.000+/mes | **Más barato** | Se encarece |
| Fuerte en | API moderna, React Email, DX | Entregabilidad crítica, *Message Streams* que aíslan transaccional de marketing |

**Recomendación: Resend.** Para avisos internos al equipo el volumen es
mínimo — con 3.000/mes gratis probablemente no pagues nada — y la API encaja
directa con el stack de React que ya usa HELM. Postmark solo compensa si más
adelante mandas email a clientes en volumen y necesitas separar reputación de
transaccional y marketing.

### WhatsApp

Aquí hay que ser claro: **Meta cambió el modelo de precios el 1 de julio de
2025**. Antes pagabas una conversación de 24 h y dentro mandabas lo que
quisieras; ahora **se paga por cada mensaje de plantilla**.

- Las plantillas de **utilidad** (que es lo que sería "tienes una tarea
  asignada") cuestan **80-90 % menos** que las de marketing.
- Los mensajes dentro de una ventana de atención de 24 h abierta por el
  usuario son **gratis**.
- A las tarifas base de Meta hay que sumarle el margen del proveedor (BSP):
  **+0,003 a 0,010 $ por mensaje**.

**Lo importante:** para avisar a tu propio equipo, WhatsApp es tirar dinero y
burocracia. Necesitas verificación de empresa, plantillas aprobadas por Meta
una a una, y un BSP. Para avisar a **clientes** sí tiene sentido, pero eso ya
no es "notificar una tarea".

**Recomendación: empieza solo con email.** Deja WhatsApp para cuando el caso
de uso sea comunicación con el cliente, no con el equipo.

### Qué falta en HELM

Ya está la cola: `crm_tasks.notify_channels` y `notified_at`. La interfaz
permite marcar los canales y **avisa explícitamente de que todavía no se
envía**. Falta un endpoint que recorra las tareas con avisos pendientes y las
mande.

---

## 3. Discord como capa de comunicación

**Qué pide el informe:** Discord como canal central con clientes y equipo,
estudiando integrarlo o empotrarlo dentro del sistema.

### El problema

**Discord no se puede empotrar.** No lo soporta y no es un descuido: su
widget oficial es una vista previa del servidor, no un cliente de chat. No
hay iframe oficial que funcione.

Las opciones de terceros:

| | Qué es | Riesgo |
|---|---|---|
| **WidgetBot** | Cliente de Discord reconstruido que habla con la API. Chat real, subida de archivos, foros | Dependes de un tercero para tu canal de comunicación |
| **Titan Embeds** | Iframe con OAuth de Discord e invitados | Proyecto pequeño, mantenimiento incierto |
| **Elfsight** | Widget para CMS | Poco control |

### Recomendación

**No lo empotres. Intégralo por bot.** Lo que aporta valor real no es ver
Discord dentro de HELM —para eso ya está Discord— sino que HELM **hable** con
Discord: un bot que publique en un canal cuando entra un lead, se cierra una
venta o vence una tarea. Eso es una webhook URL y media tarde de trabajo, sin
depender de nadie.

Empotrar el chat te ata a un tercero para algo crítico y aporta poco: los
clientes ya tienen Discord abierto.

Si de verdad quieres el chat dentro del panel, la pregunta previa es otra:
**¿por qué Discord y no un chat propio?** Para comunicación con clientes de
consultoría, un canal por cliente dentro de HELM —con su historial pegado a
su ficha, que es la idea que recorre todo el informe— encaja mejor que
mandarlos a una plataforma de gaming.

---

## Resumen

| Bloque | Recomendación | Coste estimado |
|---|---|---|
| Contratos | **Signaturit** (QTSP español, firma avanzada) | ~29-57 €/usuario/mes |
| Avisos email | **Resend** | 0 € a tu volumen |
| Avisos WhatsApp | **Aplazar** — no compensa para avisos internos | — |
| Discord | **Bot con webhooks, no empotrado** | 0 € |

## Fuentes

- [DocuSign vs Signaturit — Signaturit](https://www.signaturit.com/es/blog/docusign-vs-signaturit/)
- [Precios de Signaturit — eSign.AI](https://www.esign.ai/blog/signaturit-email-signature-certification-prices)
- [Herramientas de firma electrónica 2026](https://saasexpertos.com/herramientas-de-firma-electronica-2026/)
- [Resend vs Postmark 2026 — SuprSend](https://www.suprsend.com/post/resend-vs-postmark)
- [Postmark vs Resend — Postmark](https://postmarkapp.com/compare/resend-alternative)
- [WhatsApp Business API pricing 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [WhatsApp Business API pricing 2026 — Uptail](https://www.uptail.ai/blog/whatsapp-business-api-pricing-2026-what-it-costs-and-how-billing-works)
- [Why Discord can't be embedded — WidgetBot](https://widgetbot.io/blog/why-discord-can-t-be-embedded-natively)
- [Titan Embeds](https://github.com/TitanEmbeds/Titan)
