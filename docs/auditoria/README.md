# Auditoría de HELM — Fase 0

Fecha: 5 de octubre de 2026. Alcance: solo HELM (este repositorio). No se ha modificado código de producto.

## Actualización del mismo día

La auditoría describe el sistema tal como estaba al empezar. Esa misma madrugada se cerró parte del riesgo 1 y los riesgos 4 y 5: la administración de la base y la clave de servicio ya no se alcanzan desde internet, y la clave pública solo ve las 29 tablas que usa la web. **Esas 29 tablas y el bucket de archivos siguen abiertos.** El detalle de lo hecho y lo pendiente está en [TAREAS.md](TAREAS.md).

## Resumen en cinco líneas

1. HELM funciona y tiene buena parte de la base que pide el plan: perfiles, equipo de agentes con borradores y aprobación, conectores con Stripe, Google y Calendly, registro de auditoría.
2. **La base de datos está abierta a internet.** Sin iniciar sesión se pueden leer, cambiar y borrar los datos de todos los perfiles. Hay que cerrarlo ya, antes de seguir con el plan.
3. No hay aislamiento real entre perfiles, ni 2FA, ni cifrado de claves de terceros, ni plazos de borrado. Es el grueso de las Fases 1 y 2.
4. La IA está razonablemente acotada (los agentes solo producen borradores y propuestas), pero salen datos de leads a Anthropic sin que el perfil lo elija y hay memoria compartida entre perfiles.
5. Mínimo vendible, parte de HELM: entre 17 y 23 semanas de trabajo; un piloto recortado, entre 9 y 12.

## Documentos

| Documento | Contenido |
|---|---|
| [01-stack.md](01-stack.md) | Tecnologías, despliegue, autenticación |
| [02-mapa-datos.md](02-mapa-datos.md) | Qué datos personales entran, dónde van, quién los ve, cuánto duran. Diagrama |
| [03-proveedores.md](03-proveedores.md) | Proveedores externos y qué reciben |
| [04-seguridad.md](04-seguridad.md) | Estado de seguridad, con lo urgente primero |
| [05-riesgos-ia.md](05-riesgos-ia.md) | Dónde se usa IA, qué puede hacer cada agente, caminos de inyección |
| [06-brecha.md](06-brecha.md) | Lo que pide el plan frente a lo que hay |
| [07-top-10-riesgos.md](07-top-10-riesgos.md) | Los 10 riesgos y su arreglo |
| [08-minimo-vendible.md](08-minimo-vendible.md) | Recorte propuesto y tiempos |
| [09-rastro-pendiente.md](09-rastro-pendiente.md) | Lo que queda para el repositorio de Rastro |

## Cómo se ha hecho

- Lectura del código por tres revisiones independientes (stack y proveedores; seguridad y accesos; datos personales e IA).
- Comprobaciones en vivo contra el sistema en marcha, solo de lectura: recuentos, permisos y cabeceras. No se ha leído el contenido de ningún dato personal ni se ha escrito nada en la base.
- Los hallazgos más graves (base abierta, claves de ejemplo, chat de otro perfil, escalada a propietario, enlace de reel) se han releído en el código o repetido en vivo antes de darlos por buenos. El resto procede de las revisiones y lleva su referencia de fichero y línea. Donde el código y el sistema en marcha no coincidían, manda el sistema en marcha (por ejemplo, las tablas de contraseñas sí están protegidas).

## Pendiente de confirmar

Todo lo marcado `PENDIENTE` en los documentos. Lo principal: país donde está el servidor, cortafuegos, condiciones de cada proveedor salvo Anthropic, si sigue activa la clave antigua del historial de git y si hubo accesos ajenos a la base.
