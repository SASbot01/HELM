# HELM

El panel de operaciones de las agencias de Silvestre AI: CRM, contenido con IA,
ventas, cobros y agentes, un panel por cliente («perfil»). En producción en
https://helm.s4sf.net.

## Cómo está hecho

| Carpeta | Qué hay |
|---|---|
| `src/` | El panel (Vite + React). `src/helm` es la app; `src/agents` los agentes (Agent OS, también en `/agents`); `src/pages` las páginas públicas (landings, `/alta`, `/aiparatodo`…). |
| `api/` | Un fichero por endpoint: `/api/<nombre>` → `api/<nombre>.js`. Las piezas compartidas, en `api/_lib`; el cliente de la base, en `api/lib/supabase.js`. |
| `scripts/` | `api-server.mjs` (sirve `api/` en producción), `agents-worker.mjs` (el worker de los agentes) y herramientas de terminal. Lo de un solo uso, en `scripts/historico/`. |
| `migrations/` | El SQL de la base, aplicado a mano. Ver `migrations/README.md`. |
| `tests/` | Pruebas con Vitest: `npm test`. |
| `docs/` | Guías (apps de Google, Instagram, setter…) y la auditoría. |
| `public/` | Estáticos: logos, letras e imágenes de las páginas públicas. |

## En el servidor (minipc)

- Código en `/home/s4sf/helm`, con el entorno en `.env.server`.
- Servicios systemd: `helm-web` (el build con `vite preview`, :5173), `helm-api`
  (`scripts/api-server.mjs`, :5182), `helm-agents` (el worker) y `helm-apex`.
  Se publica con un túnel de Cloudflare.
- Base de datos: Postgres de Supabase en Docker (`supabase_db_apexallinone`).
- Despliegues, copias y herramientas: `/home/s4sf/helm-ops` (tiene su README).

## Desarrollo

```bash
npm install
npm run dev      # el panel
npm test         # las pruebas
npm run build    # el build de producción
```

Desplegar = subir los ficheros cambiados a `helm-ops/despliegues/<fecha>-<nombre>/staging`
y lanzar su `desplegar.sh`: comprueba que los ficheros del servidor no han cambiado
(huellas), copia, hace el build y reinicia lo que haga falta. Nunca en las franjas
del diario (7:55–8:40, 13:55–14:40 y 19:55–20:40, hora de Madrid).
