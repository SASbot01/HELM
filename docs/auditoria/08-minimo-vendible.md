# 8. Propuesta de mínimo vendible (parte de HELM)

## Antes de nada: una «Fase 0,5» de contención

El plan dice que no se toca código hasta aprobar la Fase 0. Propongo una excepción acotada, porque el riesgo 1 no admite espera:

- Cambiar el secreto y las dos claves de Supabase.
- Dejar de publicar en internet la herramienta de administración y todo lo que la web no necesita; cerrar los puertos a la red.
- Hacer privado el bucket.
- Corregir los dos fallos de permisos de la API y los dos de ejecución en el servidor (riesgos 4 y 5).

Son 2-4 días. No cambia nada de lo que ve el usuario. Requiere reiniciar servicios (tu sudo) y unos minutos de parada.

## El recorte

El que marca la sección 11 del plan, ajustado a lo que ya existe:

| Bloque | Qué entra | Semanas |
|---|---|---|
| **Contención** | Lo de arriba | 0,5-1 |
| **Fase 1** | Aislamiento real con tests, 2FA, cifrado de tokens, cabeceras, copias cifradas con restauración probada, plazos y borrado automático, «descargar y borrar» por persona, registro de tratamientos, subencargados, plan de brechas, prueba de consentimiento en formularios | 4-5 |
| **Fase 2** | Roles aplicados en servidor, acceso del operador concedido y registrado, colaboradores con alcance y caducidad, baja en un clic, invitaciones, auditoría inmutable, contrato de encargado, facturación con Stripe | 4-6 |
| **Fase 3 (recorte)** | Stripe, Google (con Gmail) y Calendly con permisos mínimos y tokens cifrados; plantilla de embudo y leads; plantilla de llamadas de venta; bandeja de aprobaciones general | 4-6 |
| **Fase 4 (recorte)** | Pasarela de IA con detección de datos personales, inventario de IA, registro de formación, checklist de cookies y consentimiento | 4-5 |
| **Total HELM** | | **17-23 semanas** |

Cómo leer la cifra:

- Son semanas de trabajo de una persona con Claude Code, a ritmo sostenido. No incluyen tus revisiones entre fases ni las de un abogado.
- Lo que más puede moverla es el aislamiento (la interfaz habla con la base desde decenas de sitios) y la plantilla de llamadas (grabar y transcribir con consentimiento es un producto en sí).
- Trámites ajenos que corren en paralelo y no controlo: la verificación de Google para leer Gmail (permiso restringido, con evaluación de seguridad) `PENDIENTE` de confirmar requisitos y plazos actuales, y la revisión legal de los borradores.

## Lo que recortaría aún más si hay prisa

Para una primera venta con un cliente piloto bastaría con: contención + Fase 1 + de la Fase 2 solo roles, colaboradores, auditoría y contrato + de la Fase 3 solo la plantilla de embudo. Serían **9-12 semanas**. Sin pasarela de IA, a ese piloto habría que decirle con claridad qué datos van a Anthropic.

## Lo que no entra en esta estimación

La parte de Rastro Empresas (Fase 5 del mínimo: verificación, blindaje de cuentas, accesos, filtraciones, correo e informe ejecutivo). No he auditado ese repositorio, así que cualquier cifra sería inventada. `PENDIENTE`: estimar al abrir Rastro.
