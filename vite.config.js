import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { sbProxy } from './scripts/sb-proxy.mjs'
import { cabecerasSeguridad } from './scripts/cabeceras.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cabecerasSeguridad()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Servidor dev — fija puerto y escucha en LAN.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Permite abrir el dev-server tras un túnel Cloudflare (URL provisional)
    // .enformaconhugo.com — la portada de Hugo (/paginainicio) sirve desde
    // este mismo build cuando el dominio apunte al túnel; sin su host aquí,
    // Vite lo rechaza con 403 antes de que React Router llegue a decidir nada.
    allowedHosts: ['.trycloudflare.com', 'dev.apex-closers.com', '.loca.lt', '.pinggy.link', '.serveo.net', '.ngrok-free.app', '.s4sf.net', '.enformaconhugo.com'],
    // Preview local: reenvía las llamadas del frontend al dev-server de las
    // funciones api/ (Vercel-style) que corre en :5182 contra la Supabase local.
    proxy: {
      '/api': 'http://localhost:5182',
      // /sb: solo GET/HEAD de /storage/v1/object/public/… (los enlaces viejos
      // a archivos guardados en la base), ver scripts/sb-proxy.mjs. Sin
      // escrituras ni Realtime. El panel habla con la base por /api/db
      // (api/_lib/pasarela.js) y las páginas públicas por sus endpoints.
      '/sb': sbProxy(),
    },
  },

  // `vite preview` — sirve el build de dist/ con los mismos proxies. Es lo que
  // usamos detrás del túnel público: el dev-server manda ~1800 módulos sueltos
  // y el cliente del túnel se satura (502); el build son 2 ficheros.
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    // Las cabeceras de seguridad (CSP incluida) las pone el plugin de
    // scripts/cabeceras.mjs en cada respuesta.
    // .enformaconhugo.com — la portada de Hugo (/paginainicio) sirve desde
    // este mismo build cuando el dominio apunte al túnel; sin su host aquí,
    // Vite lo rechaza con 403 antes de que React Router llegue a decidir nada.
    allowedHosts: ['.trycloudflare.com', 'dev.apex-closers.com', '.loca.lt', '.pinggy.link', '.serveo.net', '.ngrok-free.app', '.s4sf.net', '.enformaconhugo.com'],
    // Vite 7 rechaza por defecto todo lo que venga de un origen que no sea
    // localhost, y lo hace ANTES del proxy: el preflight de las landings moría
    // aquí sin llegar nunca a api/formularios.js (que sí responde con CORS
    // abierto). Las webs que mandan formularios al CRM van en esta lista.
    cors: {
      origin: [
        'https://detrasdecamara.org', 'https://www.detrasdecamara.org',
        'https://web.enformaconhugo.com', 'https://enformaconhugo.com',
        // La página de inicio de Alex (www.s4sf.net/paginainicio). Manda sus
        // formularios a api/leads.js (antes escribía en `crm_contacts` por el
        // proxy /sb, que hoy ya no escribe nada: solo GET/HEAD de
        // /storage/v1/object/public/…, ver scripts/sb-proxy.mjs). Este CORS
        // corre ANTES de cualquier proxy, así que el preflight se decide aquí.
        // Los dos hosts: el túnel sirve el dominio con y sin www, y el
        // navegador manda el que haya escrito la persona en la barra.
        'https://www.s4sf.net', 'https://s4sf.net',
        // herrerafilm.com — la web de bodas de Aitor López, en Hostinger. Su
        // formulario de contacto manda a api/formularios.js igual que las
        // landings de Detrás de Cámara. Los dos hosts porque Hostinger sirve
        // el dominio con y sin www.
        'https://herrerafilm.com', 'https://www.herrerafilm.com',
        // El despliegue de Vercel de la landing de Hugo, mientras el dominio
        // definitivo no apunte a él. Va el host exacto y no un comodín de
        // *.vercel.app: eso abriría el endpoint a cualquier proyecto de Vercel
        // del mundo, que es justo lo que esta lista existe para evitar.
        'https://game-of-life-landing-kfp4.vercel.app',
        // La web de Sergio Amorós, también en Vercel mientras su dominio no
        // esté comprado. Mismo criterio: host exacto, nunca el comodín. Cuando
        // el dominio apunte aquí, se añade al lado — este no se quita hasta
        // que se sepa que ya nadie entra por la URL de Vercel.
        'https://sergiofilm.vercel.app',
      ],
    },
    proxy: {
      '/api': 'http://localhost:5182',
      // /sb: solo GET/HEAD de /storage/v1/object/public/…, ver
      // scripts/sb-proxy.mjs. Sin escrituras ni Realtime.
      '/sb': sbProxy(),
    },
  },

  build: {
    target: 'esnext',
  },
})
