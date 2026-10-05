# 6. Análisis de brecha: lo que pide el plan frente a lo que hay

Solo HELM. Estado: ✅ hecho · 🟡 parcial · ❌ falta. Esfuerzo: S (días), M (1-2 semanas), L (3 semanas o más). El esfuerzo es una estimación mía, no un compromiso.

## Fase 1 — Cumplimiento propio

| Qué pide | Estado | Qué hay | Esfuerzo |
|---|---|---|---|
| Registro de actividades (art. 30) | ❌ | Nada. El mapa de `02-mapa-datos.md` es la base | S |
| Lista de subencargados | 🟡 | `03-proveedores.md`, con condiciones por verificar | S |
| Plazos de conservación y borrado automático | ❌ | Ningún dato personal caduca | M |
| Descargar y borrar los datos de una persona | ❌ | Solo borrado de perfil entero (deja copia indefinida) y CSV interno | M |
| Registro de solicitudes de derechos con plazo de 1 mes | ❌ | Nada | S |
| Plan de respuesta a brechas y registro de incidentes | ❌ | Nada | S |
| 2FA obligatorio en admin | ❌ | No hay 2FA | M |
| Aislamiento entre usuarios, con tests | ❌ | La base está abierta; ver `04-seguridad.md` §4.1 | L |
| Secretos en un gestor | 🟡 | Fichero con permisos correctos; tokens de terceros sin cifrar en la base | M |
| Logs sin datos personales | 🟡 | Pocos datos en logs; auditoría con email e IP, editable | S |
| Copias cifradas y prueba de restauración | 🟡 | Copia diaria verificada, sin cifrar, mismo disco, sin bucket | S |
| Cabeceras de seguridad | ❌ | Ninguna | S |
| Rate limiting en lo sensible | 🟡 | En memoria; falta en MCP | S |
| Una única función para llamar a modelos | 🟡 | Dos capas que confluyen en `claudeTurno` | S |
| Sin retención ni entrenamiento en el proveedor | 🟡 | Anthropic no entrena por defecto y borra a 30 días; sin acuerdo de retención cero | S (documentar) |
| Textos legales coherentes con el código | ❌ | Política con huecos sin rellenar; no se guarda la prueba del consentimiento | S + abogado |

## Fase 2 — Base B2B

| Qué pide | Estado | Qué hay | Esfuerzo |
|---|---|---|---|
| Organizaciones aisladas, con tests de salto | ❌ | Hay «perfiles» con `client_id`, pero sin aislamiento real | L |
| Roles (propietario, admin, miembro, auditor, operador) | 🟡 | Existen niveles, solo aplicados en la interfaz; el operador entra siempre, sin concesión ni registro | M |
| Colaboradores con acceso mínimo, caducidad y baja en un clic | 🟡 | Se puede revocar un acceso, pero la sesión dura 12 h más; un closer ve toda la base | M |
| Invitaciones, 2FA configurable, preparación SSO | ❌ | El alta la hace alguien poniendo contraseña | M |
| Auditoría inmutable y exportable | 🟡 | Existe `audit_logs`, editable y sin exportación | S |
| Facturación B2B con Stripe | ❌ | Stripe solo se usa para leer las ventas del cliente | M |
| Contrato de encargado aceptado y registrado | ❌ | Nada | S + abogado |
| Región de datos en la UE, documentada | 🟡 | Servidor propio (país por confirmar); Anthropic en EE. UU. | S |

## Fase 3 — De contenido a operaciones

| Qué pide | Estado | Qué hay | Esfuerzo |
|---|---|---|---|
| Motor de procesos editable | ❌ | El equipo de agentes es un flujo fijo en código | L |
| Agentes con permisos explícitos | 🟡 | Los límites existen, pero en el código, no declarados ni configurables | M |
| Conector Stripe | 🟡 | Lectura e importación; clave en claro | S |
| Conector Google Workspace | 🟡 | Calendar y Drive. Gmail no | M |
| Conector Calendly | 🟡 | Solo lectura de eventos | S |
| Resto de conectores (Meta, WhatsApp, Shopify, Hotmart…) | ❌ | Instagram solo métricas propias; WooCommerce sí | L cada grupo |
| Plantilla embudo y leads | 🟡 | Formularios → CRM → reserva → aviso. Sin prueba de consentimiento ni seguimiento | M |
| Plantilla llamadas de venta | 🟡 | Agenda y ficha previa a la llamada. Sin grabación, transcripción ni borrado | L |
| Plantilla contenido | ✅ | Es lo que HELM hace hoy | — |
| Bandeja de aprobaciones | 🟡 | «Por aprobar» del equipo de agentes (guiones y tareas) | M |
| Panel de valor | 🟡 | Tokens por ejecución; sin coste en euros ni horas ahorradas | S |
| Memoria separada por organización | 🟡 | Hay memoria compartida por creador y global | M |
| Servidor MCP por organización | 🟡 | Token por perfil con alcance limitado; sin caducidad ni límite de uso | S |

## Fase 4 — Seguridad y gobierno de la IA

| Qué pide | Estado | Esfuerzo |
|---|---|---|
| Pasarela de IA con seudonimización | ❌ | L |
| Catálogo de modelos por organización | 🟡 (elección Claude/local por perfil) | S |
| Límites de gasto | 🟡 (tope diario de tokens solo en el equipo de agentes) | S |
| Registro de cada llamada | 🟡 (solo ejecuciones del equipo) | S |
| Defensa frente a inyección | 🟡 (ver `05-riesgos-ia.md` §5.4) | M |
| Suite de red team en CI | ❌ | M |
| Inventario de IA, formación, política, EIPD, evidencias | ❌ | M-L en conjunto |
| Kit de cumplimiento (cookies, consentimiento, grabaciones…) | ❌ | M |

## Fases 5 a 7

Rastro Empresas, la integración y el material de venta no se han auditado: pertenecen al otro repositorio o dependen de las fases anteriores. Ver `09-rastro-pendiente.md`.
