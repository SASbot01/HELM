#!/usr/bin/env node
// scripts/setup-admin-api-key.mjs
//
// Genera ADMIN_API_KEY (32 bytes random) y la setea en Vercel para
// production+preview. Imprime la key UNA SOLA VEZ — Alejandro la copia
// al .env del bot IA.
//
// Uso: node scripts/setup-admin-api-key.mjs
//
// Requiere VERCEL_TOKEN (en /home/blackwolfsec/ejambre/.env).

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Lee VERCEL_TOKEN del .env del entorno (busca en cwd y en /home/blackwolfsec/ejambre/.env)
function readEnv(varName) {
  if (process.env[varName]) return process.env[varName]
  const candidates = [
    path.join(process.cwd(), '.env'),
    '/home/blackwolfsec/ejambre/.env',
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const content = fs.readFileSync(file, 'utf8')
    const m = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const VERCEL_TOKEN      = readEnv('VERCEL_TOKEN')
const VERCEL_PROJECT_ID = readEnv('VERCEL_PROJECT_ID') || 'prj_dashboard_ops'  // ajustar si hace falta
const VERCEL_TEAM_ID    = readEnv('VERCEL_TEAM_ID')

if (!VERCEL_TOKEN) {
  console.error('✗ VERCEL_TOKEN no encontrado en env ni en .env files')
  process.exit(1)
}

const KEY = crypto.randomBytes(32).toString('base64')

async function setEnv() {
  const url = new URL(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`)
  if (VERCEL_TEAM_ID) url.searchParams.set('teamId', VERCEL_TEAM_ID)
  url.searchParams.set('upsert', 'true')

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: 'ADMIN_API_KEY',
      value: KEY,
      target: ['production', 'preview'],
      type: 'encrypted',
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    console.error(`✗ Vercel API ${r.status}:`, j.error?.message || j)
    process.exit(2)
  }
  return j
}

console.log('Generating + uploading ADMIN_API_KEY to Vercel…\n')

setEnv().then(() => {
  console.log('✓ ADMIN_API_KEY set in Vercel (production + preview).')
  console.log('')
  console.log('━━━ COPY THIS KEY (shown ONLY now) ━━━')
  console.log(KEY)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Next:')
  console.log('  1. Add to bot IA .env:  APEX_ADMIN_API_KEY=<key above>')
  console.log('  2. Redeploy Vercel:     env vars only apply to NEW deploys')
  console.log('  3. Test:                curl -H "X-Admin-Key: <key>" https://central.blackwolfsec.io/api/admin/agent?op=help')
}).catch(err => {
  console.error('✗ Error:', err.message)
  process.exit(3)
})
