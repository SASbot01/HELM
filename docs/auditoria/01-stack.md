# 1. Stack de HELM

Auditoría del 5 de octubre de 2026. Todo lo que hay aquí se ha comprobado en el código o en la máquina; lo que no se pudo comprobar está marcado `PENDIENTE`.

## En una frase

HELM es una aplicación web (React) con funciones de servidor en Node y una base de datos Supabase, y **todo corre en un único ordenador propio** (un mini PC), publicado a internet por un túnel de Cloudflare.

## Piezas

| Pieza | Qué es | Dónde se ve |
|---|---|---|
| Lenguajes | JavaScript (módulos ES, JSX), algo de Python (transcripción), Bash y SQL | `package.json`, `scripts/` |
| Interfaz | React 19, React Router 7, Vite 7 | `package.json` |
| Servidor | Funciones «estilo Vercel» en `api/`, servidas por un servidor propio | `scripts/api-server.mjs` |
| Base de datos | Supabase local en Docker (Postgres 17, PostgREST, Storage, Realtime, Studio…) | contenedores `supabase_*_apexallinone` |
| Cola de trabajos | Tabla `agent_jobs` que un worker consulta cada 5 s | `scripts/agents-worker.mjs:84-117` |
| IA | Claude (API de Anthropic) y un modelo local con Ollama (`qwen2.5:7b-instruct`) | `api/_lib/anthropic.js`, `api/_lib/llm.js` |
| Audio | Whisper local (faster-whisper, en CPU) y `yt-dlp` + `ffmpeg` | `scripts/agents-transcribe.py` |
| OCR de facturas | Tesseract local | `api/gastos.js` |
| Archivos | Bucket `helm` de Supabase Storage (**público**) y Google Drive | `migrations/helm_operativa.sql:18-34`, `api/_lib/drive-helm.js` |

Hay dependencias declaradas que no se usan: `@sentry/node`, `pino`, `@tauri-apps/*`.

## Cómo está desplegado

Cinco servicios de systemd en la misma máquina:

- `helm-web`: sirve la interfaz (`vite preview`, puerto 5173). También hace de pasarela hacia la base de datos en la ruta `/sb`.
- `helm-api`: las funciones de `api/` (puerto 5182, solo local).
- `helm-apex`: proxy del dominio principal hacia el 5173.
- `helm-agents`: el worker (descargas, transcripción, etiquetado, equipo de agentes).
- `cloudflared-s4sf`: el túnel de Cloudflare. Los dominios públicos son `helm.s4sf.net`, `s4sf.net`, `www.s4sf.net` y `consultoria.s4sf.net`.

El `README.md` y `vercel.json` siguen describiendo un despliegue en Vercel (`central.blackwolfsec.io`). `PENDIENTE`: confirmar si eso sigue sirviendo tráfico o es historia.

## Dónde está la máquina

Es un mini PC físico (fabricante «Shenzhen DOKE», modelo MP80), con IP de red doméstica y Tailscale. `PENDIENTE`: confirmar en qué país está (se supone España; determina la «región de datos»). El disco **no está cifrado**.

## Autenticación

- Sistema propio, no el de Supabase: usuario y contraseña → un token JWT firmado (HS256) que el navegador guarda en `localStorage`.
- Las contraseñas se guardan con `scrypt` (13 cuentas, ninguna en texto plano). El código todavía acepta contraseñas antiguas en claro si existieran (`api/_lib/passwords.js:50-54`).
- No hay segundo factor (2FA).
- Tres niveles: superadmin (entra en cualquier perfil), acceso de equipo a un perfil y páginas públicas.
- El conector MCP (para claude.ai) se autentica con un secreto en la propia URL (`api/mcp/[token].js`).

## Tareas programadas

- Copia diaria de la base a las 03:00 (ver `04-seguridad.md`).
- Dentro del worker: mirar la carpeta de Drive cada 5 min, estudio de creadores cada 30 min y el director del equipo de agentes desde las 06:00.
