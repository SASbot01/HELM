# HELM

El puesto de mando del negocio: CRM · Ventas · Diario · Finanzas · Informe · Plugins.

Se entra por `/login` (superadmin) y todo vive bajo `/admin`. El resto de la
plataforma antigua (apex-operations, ClientApp multi-tenant, MID, ERP, landings,
funnels y ~190 endpoints) se retiró; sigue disponible en el historial de git
(commit `ef80bbc`) si hiciera falta recuperar algo.

Producción: [central.blackwolfsec.io](https://central.blackwolfsec.io) → `/admin`

---

## Stack

- **Frontend**: React 19 + Vite 7 + React Router 7 (`src/helm/`)
- **UI**: lucide-react, recharts, CSS propio (`src/helm/theme.css`)
- **Backend**: una sola Vercel Function — `api/admin.js` (auth superadmin)
- **Datos**: Supabase (Postgres + Auth + Storage)
- **Deploy**: Vercel

---

## Quick start

```bash
npm install
cp .env.example .env   # rellenar las claves
npm run dev            # http://localhost:5173
```

| Script                 | Acción                          |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Vite dev server con HMR         |
| `npm run build`        | Build de producción a `dist/`   |
| `npm run preview`      | Servir el build local           |
| `npm run lint`         | ESLint                          |
| `npm run icons:generate` | Regenerar iconos PWA          |

---

## Estructura

```
src/
  main.jsx                  # rutas: / → /admin, /login, /admin/*
  helm/                     # la app entera (views, plugins, ui, lib)
  pages/admin/SuperAdminLogin.jsx
  utils/{supabase,data}.js
  components/{Toast,PasswordInput}.jsx
  contexts/ThemeContext.jsx
api/
  admin.js                  # login superadmin + gestión
  _lib/{auth,passwords}.js
  lib/supabase.js
migrations/ · sql/ · supabase/   # esquema de la BD
```
