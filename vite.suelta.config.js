// Filmmaking para todo suelta, para detrasdecamara.org/filmmakingparatodo
// (ver src/pages/filmmakingparatodo/suelta/main.jsx). Se construye con
// scripts/construir-suelta.sh, que le pasa en SUELTA_PUBLIC una carpeta con
// solo las fuentes que usa: el public/ de HELM no va a la web de Abel.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'src/pages/filmmakingparatodo/suelta'),
  base: '/filmmakingparatodo/',
  publicDir: process.env.SUELTA_PUBLIC || false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: process.env.SUELTA_SALIDA || path.resolve(__dirname, 'dist-suelta'),
    emptyOutDir: true,
  },
})
