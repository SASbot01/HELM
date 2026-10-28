# Plan: agentes por departamentos y Media buyer (28-oct-2026)

Alex pidió (28-oct) agentes para cada departamento de la empresa y un agente
que lleve las campañas de Meta, «sin preguntas, lo mejor posible», y un PDF con
lo que tiene que hacer él. Decisiones tomadas por defecto (las recomendadas):

- **Autonomía.** Todo lo que sale hacia un cliente o toca dinero se propone y
  se aprueba con un toque (Telegram o panel). Lo interno y reversible (tareas,
  notas) lo hacen solos. Cada agente se puede apagar por perfil.
- **Molde común.** Detecta (con datos de HELM, sin IA si se puede) → redacta →
  propuesta en la bandeja con «Aprobar» → al aprobar se aplica con las
  escrituras que ya usa el bot de Telegram (vuelven a prepararse y solo se
  aplican si sale lo mismo que se aprobó) → queda registrado.
- **Mensajes a clientes.** Mientras HELM no tenga WhatsApp ni correo saliente,
  el agente deja el mensaje redactado con su enlace de WhatsApp (wa.me) para
  mandarlo desde el móvil con un toque.
- **Media buyer.** Nivel 1 (propone, se aprueba), con topes en el código que
  solo pone el dueño y el límite de gasto de la cuenta en Meta como red.

Estado: ✅ hecho · 🟡 hecho a falta de algo de Alex (ver el PDF) · ⬜ pendiente.

## A. La base común (todos los agentes)
1. Tabla de propuestas (bandeja de aprobación) y de ajustes por agente y perfil (migración 116).
2. Módulo de propuestas: crear (sin duplicar), aprobar, rechazar, caducar y aplicar con las escrituras del bot.
3. Botones «Aprobar / Rechazar» de las propuestas en el Telegram de la agencia.
4. API de la bandeja para el panel, con permisos (aprueba quien administra la agencia).
5. Pantalla «Bandeja» en Agentes: lo que espera tu aprobación, con el mensaje listo y su enlace de WhatsApp.
6. Registro de agentes por departamento y trabajo diario del worker que los pasa por cada perfil.
7. Ajustes por agente: encendido/apagado y qué puede hacer solo.
8. Casillas que pasan a «Activo» cuando su agente funciona, con su número real.

## B. Finanzas
9. Cobrador: cuotas y renovaciones que tocan o están vencidas, con mensaje y enlace.
10. Cobrador: «marcar cobrado» como propuesta (registrar_cuota).
11. Conciliación: pagos de Stripe duplicados, pagos sin venta y ventas sin pago.
12. Caja: lo que entra y sale en 90 días y aviso si falta caja.
13. Comisiones: lo que toca a cada setter y closer con lo cobrado.

## C. Ventas
14. Seguimiento: leads parados (5 días o más) con mensaje redactado y tarea.
15. Seguimiento: llamadas no presentadas, para recuperarlas.
16. Seguimiento: formularios sin contestar.
17. Preparador de llamadas: ficha de cada llamada del día (formulario, origen, historial).
18. Preparador de llamadas: recordatorio de apuntar el resultado tras la llamada.
19. Prospector: primer mensaje redactado para cada negocio prospectado.

## D. Atención al cliente
20. Bienvenida: al que paga, tareas de arranque y mensaje de bienvenida.
21. Documentación pendiente: papeles que faltan antes de cada plazo (asesorías).
22. Postventa: a los N días de la compra, mensaje de seguimiento.
23. Postventa: a quien está contento, petición de reseña o testimonio.
24. Atención 24/7: chat con la base de conocimiento del negocio (primera versión).

## E. Operaciones
25. Director: parte del día por Telegram (entra, vence, atascado, hecho, pendiente de aprobar).
26. Limpieza del CRM: duplicados por correo o teléfono y fichas sin etapa.
27. Informe semanal ampliado: caja, coste por venta y bandeja.
28. Pregúntale a HELM: lecturas de ventas y cobros en el conector (solo lectura).
29. Productor: piezas atascadas como propuesta.

## F. Webs y Google
30. Reseñas: enlace directo de reseña de Google desde la ficha (place_id).
31. Reseñas: petición de reseña a clientes contentos, con su enlace.
32. Visibilidad en IA: comprobación de si Claude te recomienda en tu zona (con búsqueda web).

## G. Contenido y anuncios
33. Guionista por ventas: los temas de reels que más ventas trajeron (por UTM).
34. Anuncios: coste por lead y por venta con el gasto apuntado.
35. Media buyer: cliente de la API de anuncios de Meta (leer y actuar), con su versión.
36. Media buyer: conexión con token de usuario del sistema y cuentas publicitarias.
37. Media buyer: sincronización diaria del gasto y los resultados por anuncio.
38. Media buyer: cruce con las ventas cobradas del CRM (por UTM y por fecha del lead).
39. Media buyer: topes por cuenta (diario, duro del día y mensual) que solo pone el dueño.
40. Media buyer: propuestas de subir (+20 % como mucho, cada 72 h), bajar y pausar, con su porqué.
41. Media buyer: ejecutor seguro (vuelve a leer en Meta antes de cambiar, registra antes y después).
42. Media buyer: vigilante horario sin IA que solo puede frenar.
43. Media buyer: «Parar los anuncios» de un toque.
44. Media buyer: pantalla con la cuenta, los topes, el parte y el registro.
45. Conversions API: mandar a Meta los leads y las ventas del CRM.

## H. Cierre
46. Precio de cada agente en créditos (precio fijo por día o por resultado).
47. Pruebas de cada agente y de la base común.
48. Revisión de seguridad (permisos, dinero, datos de clientes) y arreglos.
49. Paquetes de despliegue comprobados.
50. PDF con todo lo que tiene que hacer Alex.
