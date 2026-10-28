# 9. Lo que queda para el repositorio de Rastro

Esta auditoría cubre solo HELM, que es lo que hay en este repositorio. Para Rastro queda por hacer, cuando se abra el suyo:

- Su propia Fase 0: stack, mapa de datos, proveedores, seguridad y riesgos de IA, con el mismo formato que estos documentos.
- De la Fase 1: la evaluación de impacto (perfila personas, combina fuentes, analiza filtraciones y lee Gmail), la revisión de permisos del escáner de Gmail y la comprobación de que no se guardan contraseñas filtradas.
- La Fase 5 entera (Rastro Empresas) y su estimación.

## Lo que HELM necesitará de Rastro (para la Fase 6)

- Una identidad de organización común o un enlace seguro entre cuentas.
- Que cada hallazgo de Rastro tenga un identificador estable y un tipo, para convertirlo en tarea de HELM.
- La lista de aplicaciones de IA detectadas, en un formato que alimente el inventario de IA de HELM.

## Observaciones hechas de paso

Sin auditar Rastro, al mirar la máquina he visto dos cosas que le afectan:

- El `crontab` del usuario lleva una clave de acceso de Rastro escrita en claro en cada línea. Conviene moverla a un fichero con permisos restringidos.
- Rastro y HELM comparten máquina. Si alguien entrara por HELM (riesgos 1 y 5), tendría a mano los ficheros de Rastro.
