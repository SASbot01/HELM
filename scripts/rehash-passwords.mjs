#!/usr/bin/env node
// scripts/rehash-passwords.mjs
//
// Cierra fase final de BUG-002 (auditoría 2026-05-10): re-hashea las
// passwords plain de la tabla `team` con scrypt. El código de auth ya
// soporta scrypt + fallback plain (api/_lib/passwords.js verifyPassword),
// pero la BD aún tiene 59 users con `password` en plain text y `password_hash`
// vacío. Este script completa la migración.
//
// USO (dry-run primero, recomendado):
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/rehash-passwords.mjs --dry-run
//
// Para aplicar de verdad:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/rehash-passwords.mjs --apply
//
// Para borrar la columna password plain DESPUÉS (¡destructivo!):
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/rehash-passwords.mjs --apply --drop-plain
//
// Lo que hace:
//   1. Lee todas las filas de `team` con password not null AND password_hash IS NULL.
//   2. Para cada una, calcula scrypt(password) → 'scrypt:<salt>:<hash>'.
//   3. UPDATE password_hash con el resultado.
//   4. (opcional con --drop-plain) UPDATE password = '' (NO borra columna,
//      solo vacía valor). Para borrar columna usar SQL ALTER TABLE manual.
//
// El código de auth (verifyPassword) ya prefiere password_hash si existe, así
// que después de correr este script todos los logins van por scrypt.

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const SCRYPT_KEYLEN = 64

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

const args = new Set(process.argv.slice(2))
const DRY_RUN = !args.has('--apply')
const DROP_PLAIN = args.has('--drop-plain')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`\n=== rehash-passwords ${DRY_RUN ? '(DRY RUN)' : '(APPLY)'}${DROP_PLAIN ? ' + drop plain' : ''} ===\n`)

  // 1. Listar candidatos
  const { data: rows, error } = await supabase
    .from('team')
    .select('id, name, email, password, password_hash')
    .not('password', 'is', null)
    .neq('password', '')
    .is('password_hash', null)

  if (error) {
    console.error('Error consultando team:', error.message)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('✓ No hay usuarios con password plain pendientes. Migración completa.')
    return
  }

  console.log(`Usuarios con password plain (sin hash): ${rows.length}`)
  for (const r of rows) {
    console.log(`  - ${r.email || '[no email]'} (id=${r.id?.slice(0, 8)}, name=${r.name || '?'})`)
  }
  console.log()

  if (DRY_RUN) {
    console.log('DRY RUN — no se aplica nada. Usar --apply para ejecutar de verdad.')
    return
  }

  // 2. Aplicar
  let ok = 0
  let fail = 0
  for (const r of rows) {
    const hash = hashPassword(r.password)
    const update = { password_hash: hash }
    if (DROP_PLAIN) update.password = ''

    const { error: upErr } = await supabase
      .from('team')
      .update(update)
      .eq('id', r.id)

    if (upErr) {
      console.error(`  ✗ ${r.email}: ${upErr.message}`)
      fail++
    } else {
      console.log(`  ✓ ${r.email}: hashed${DROP_PLAIN ? ' + plain cleared' : ''}`)
      ok++
    }
  }

  console.log(`\n=== Resultado: ${ok} ok, ${fail} fallos ===`)
  if (DROP_PLAIN) {
    console.log('\nNOTA: solo se vació la columna password (= ""). Para borrar la columna del schema completamente, ejecutar manualmente:\n  ALTER TABLE team DROP COLUMN password;')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
