import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // El backend (funciones de api/ y scripts) corre en Node, no en el navegador:
  // `process`, `Buffer` y compañía son globales legítimos ahí.
  {
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}', 'vite.config.js'],
    languageOptions: { globals: globals.node },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
