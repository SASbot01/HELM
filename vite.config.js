import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Tauri detección — añade flags óptimos para el build desktop sin afectar
// el flujo Vercel actual. Cuando se hace `tauri dev`, las env vars TAURI_ENV_*
// se setean automáticamente. Para deploys Vercel todo sigue funcionando igual.
//
// https://vite.dev/config/
const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Vite limpia logs en cada update — Tauri necesita verlos para debug
  clearScreen: !isTauri,

  // Servidor dev — fija puerto, escucha en LAN para que Tauri devUrl conecte
  server: {
    host: isTauri ? false : true,
    port: 5173,
    strictPort: true,
    // Permite abrir el dev-server tras un túnel Cloudflare (URL provisional)
    allowedHosts: ['.trycloudflare.com', 'dev.apex-closers.com', '.loca.lt', '.pinggy.link', '.serveo.net', '.ngrok-free.app'],
    // Preview local: reenvía las llamadas del frontend al dev-server de las
    // funciones api/ (Vercel-style) que corre en :5182 contra la Supabase local.
    proxy: {
      '/api': 'http://localhost:5182',
      // Supabase local servida desde el mismo origen que la app. Necesario
      // al entrar por un túnel HTTPS: el navegador no puede llamar a
      // http://<ip-tailscale>:54321 (mixed content + IP privada).
      // VITE_SUPABASE_URL debe apuntar entonces a <origen>/sb.
      '/sb': {
        target: 'http://localhost:54321',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/sb/, ''),
      },
    },
    // Tauri WebView2 (Win) y WKWebView (Mac) necesitan HMR via WS específico
    hmr: isTauri
      ? { protocol: 'ws', host: 'localhost', port: 5174 }
      : undefined,
    watch: isTauri ? { ignored: ['**/src-tauri/**'] } : undefined,
  },

  // `vite preview` — sirve el build de dist/ con los mismos proxies. Es lo que
  // usamos detrás del túnel público: el dev-server manda ~1800 módulos sueltos
  // y el cliente del túnel se satura (502); el build son 2 ficheros.
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', 'dev.apex-closers.com', '.loca.lt', '.pinggy.link', '.serveo.net', '.ngrok-free.app'],
    proxy: {
      '/api': 'http://localhost:5182',
      '/sb': {
        target: 'http://localhost:54321',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/sb/, ''),
      },
    },
  },

  // Build target alineado con Tauri (Chromium ≥104, Safari ≥13)
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  // Define global para que el frontend pueda detectar entorno
  define: {
    __IS_TAURI__: JSON.stringify(isTauri),
  },
})
