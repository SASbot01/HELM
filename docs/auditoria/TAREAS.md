# Tareas pendientes

Guardado el 5 de octubre de 2026 para seguir al día siguiente. Marca con `[x]` lo hecho.

## Hecho la madrugada del 5 de octubre (en producción y comprobado)

- [x] Servicios reiniciados con el código nuevo: el equipo de agentes ya responde en producción con sus 7 agentes
- [x] La pasarela `/sb` solo deja pasar tablas y archivos, y solo con la clave pública (`scripts/sb-proxy.mjs`). Fuera quedan la administración de Postgres, auth, GraphQL y cualquier petición con la clave de servicio
- [x] La clave pública ya no ve 177 de las 206 tablas: las que la web no usa (`migrations/090_anon_solo_tablas_de_la_web.sql`)
- [x] Chat: un solo perfil por petición (`api/chat.js`)
- [x] Accesos del equipo: solo propietario o administrador, y solo un propietario toca a otro propietario (`api/equipo.js`)
- [x] Enlaces de reel: solo URL http(s), y nunca se leen como opción de `yt-dlp`
- [x] Descargas del servidor: un único filtro de direcciones privadas, salto a salto, con la red de Tailscale incluida
- [x] El log de errores ya no escribe tokens; tope de 30 MB por petición; el error 500 no devuelve detalles
- [x] Cabeceras: `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`
- [x] Límite de uso en el conector MCP (240 peticiones por minuto e IP)
- [x] Los formularios de `/empresas` y `/primermap` guardan la prueba del consentimiento (texto y fecha)
- [x] El audio de un reel que falla definitivamente se borra
- [x] Fuera la contraseña del comentario de `migrations/072_infoproducto_mid.sql`
- [x] Tests de la pasarela (`tests/seguridad.test.js`) y recorrido de 40 pantallas en producción sin ningún fallo

Los servicios `helm-web`, `helm-api` y `helm-agents` corren con tu usuario y systemd los relanza solos, así que se reinician sin sudo: `kill -TERM $(systemctl show helm-api -p MainPID --value)`.

## Hecho el 5 de octubre por la mañana (en el código, SIN PUBLICAR)

Falta `npm run build` y relanzar `helm-web` y `helm-api` para que salga en producción.

- [x] CSP y protección contra incrustación (`scripts/cabeceras.mjs`): solo `/gracias` se deja incrustar, y solo en cal.com / cal.eu. Probada en las 14 páginas públicas; **el panel con sesión no se ha probado con la CSP puesta**
- [x] Casilla de consentimiento en el formulario propio (`/f/:id`), con la prueba guardada; `api/formularios.js` guarda la prueba si la landing la manda (no la exige: las landings externas aún no la envían)
- [x] Copias cifradas, con los archivos del bucket, y restauración probada (`scripts/backup-db.sh`, `scripts/restore-test.sh`). **La clave está en `~/.helm-backup.key`: apúntala fuera de esta máquina**
- [x] Las copias de perfiles borrados caducan a los 30 días (lo hace la copia nocturna)
- [x] Tipografías servidas desde el propio servidor (`public/fonts`); ya no se pide nada a Google Fonts
- [x] Retirados `scripts/rehash-passwords.mjs` y `scripts/reset-superadmin-pass.sh` (los dos estaban rotos)
- [x] `npm audit`: 0 vulnerabilidades. Fuera `xlsx` y `@sentry/node`, que no se usaban; `vitest` actualizado
- [x] Condiciones de Google, Telegram, Cloudflare, Stripe y Cal.com comprobadas (`03-proveedores.md`). Sale una decisión nueva: Telegram no ofrece contrato de encargado

## Agente de noticias (5 de octubre, SIN PUBLICAR)

- [x] Agente que cada mañana lee 15 fuentes de IA y ciberseguridad y deja las 3 mejores (`api/_lib/noticias.js`, `api/noticias.js`, sección «Noticias»). La tabla ya está creada (`migrations/091_helm_noticias.sql`)
- [ ] Publicar: `npm run build` y relanzar `helm-web`, `helm-api` y `helm-agents`
- [ ] Encender la sección «Noticias» en Secciones del perfil silvestre: hasta entonces el agente no corre

## Jev, el modelo de decisión de TypeSafe (5 de octubre, SIN ACTIVAR)

- [x] Cliente (`api/_lib/jev.js`) y enganche en el etiquetado de reels: entra cuando Claude no está disponible, antes que el modelo local. Sin clave no hace nada
- [ ] Crear cuenta en console.typesafe.ai, sacar una clave y ponerla en `.env.server` como `TYPESAFE_API_KEY` (solo tú)
- [ ] Con la clave puesta: `node --env-file=.env.server scripts/jev-compara.mjs` para ver cuánto coincide con Claude en español antes de fiarse
- [ ] Si se activa, añadir TypeSafe a `03-proveedores.md` y leer su DPA (recibe las transcripciones de los reels)

## Lo que sigue abierto del riesgo 1 (importante)

- [ ] **Las 29 tablas que la web usa siguen legibles y modificables con la clave pública**: contactos, ventas, llamadas, respuestas de formularios, finanzas, equipo. Cerrarlo es el trabajo de aislamiento por perfil (semanas, no horas)
- [ ] **El bucket de archivos sigue público.** Hacerlo privado obliga a cambiar cómo sube y enseña archivos la web
- [ ] **Las claves de Supabase siguen siendo las de ejemplo.** Desde internet ya no sirven (la pasarela rechaza la de servicio), pero sí desde la red local y Tailscale, donde los puertos 54321-54327 siguen escuchando. Cambiarlas exige parar la base unos minutos: mejor contigo delante
- [ ] Los logs de `/var/log/helm-*.log` son de root y legibles por todos: `sudo chmod 640 /var/log/helm-*.log`

## Solo las puedes hacer tú

- [ ] Decidir si el equipo de agentes se activa en «detras de camra» (activo, o dado de alta en pausa)
- [ ] Pedir a Cloudflare los registros de acceso a `helm.s4sf.net/sb/` y consultar a un abogado si hay que notificar a la AEPD
- [ ] Cambiar las claves de Stripe, Google y Telegram guardadas en HELM (después de cerrar la base)
- [ ] Revocar la clave de servicio antigua del proyecto Supabase en la nube (quedó en el historial de git, commit `ef80bbc`)
- [ ] Confirmar en qué país está el servidor y si HELM sigue en el mini PC o pasa a un proveedor en la UE
- [ ] Elegir mínimo vendible completo (17-23 semanas) o piloto recortado (9-12)
- [ ] Conectar Instagram en alexsilvestre (el analista y el informe no tienen métricas)
- [ ] Telegram: quitar nombre, email y teléfono de los avisos, o asumirlo e informarlo (no hay contrato de encargado)
- [ ] Pedir el DPA a Cal.com, o pasar a su instancia europea (cal.eu)
- [ ] Añadir la casilla de consentimiento a las landings externas (detrasdecamara.org, herrerafilm.com, la de Hugo, sergiofilm): están en otros proyectos

## Las puedo hacer yo en cuanto digas «adelante»

Lo que queda de la contención de la base:

- [ ] Cambiar el secreto JWT de Supabase y generar claves `anon` y `service_role` nuevas; actualizar `.env`, `.env.server` y reconstruir
- [ ] Hacer privado el bucket `helm`: subida por la API y enlaces firmados de corta duración
- [ ] Reglas por perfil en las 29 tablas que usa la web, con una sesión propia por usuario en vez de la clave común
- [ ] Hacer que los puertos 54321-54327 solo escuchen en local
- [ ] Tests que intenten leer datos de otro perfil y fallen

Otras cosas sueltas que no dependen de ninguna decisión:

- [ ] Borrar los 5 audios antiguos que quedaron en `/home/s4sf/helm-agents/audio` (el modo de permisos no me dejó: `rm /home/s4sf/helm-agents/audio/*`)
- [ ] Recorrer el panel con sesión con la CSP puesta, tras publicar
- [ ] Borrar las tablas vacías de integraciones que ya no existen (Close, ManyChat, WhatsApp, Fireflies)
- [ ] Que el conector MCP programe guiones como borrador (cambia tu forma de trabajar desde claude.ai: decídelo tú) y que sus tokens caduquen
- [ ] Probar lo que quedó sin probar del equipo de agentes tras el reinicio: el director con el prompt nuevo y aceptar una tarea propuesta

## Estado del trabajo sin guardar en git

Nada de esta sesión tiene commit: el equipo de agentes ampliado (`api/_lib/equipo.js`, `src/agents/Equipo.jsx`, `migrations/089_agent_equipo_ampliado.sql`…) y `docs/auditoria/`. La rama es `feat/archivos-formularios-crm`.
