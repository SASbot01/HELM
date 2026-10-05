#!/usr/bin/env node
// HELM — ¿acierta Jev con nuestros reels? Lo compara con lo que etiquetó Claude.
//
// Jev está entrenado sobre todo en inglés, y su documentación pide probarlo
// con contenido propio antes de fiarse en otro idioma. Esto coge reels que ya
// etiquetó Claude, se los pasa a Jev y dice en cuántos coinciden. No guarda
// nada: solo lee y enseña el resultado.
//
//   node --env-file=.env.server scripts/jev-compara.mjs        → 30 reels
//   node --env-file=.env.server scripts/jev-compara.mjs 100
//
// Necesita TYPESAFE_API_KEY en .env.server.
import { createClient } from '@supabase/supabase-js'
import { etiquetaConJev, jevDisponible } from '../api/_lib/jev.js'

if (!jevDisponible()) { console.error('Falta TYPESAFE_API_KEY en .env.server'); process.exit(1) }
const n = Math.min(Number(process.argv[2]) || 30, 300)
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const { data: reels, error } = await db.from('agent_reels')
  .select('id, etiquetas, frases').eq('estado', 'etiquetado')
  .in('etiquetas->>por', ['claude', 'claude-api']).order('updated_at', { ascending: false }).limit(n)
if (error) { console.error(error.message); process.exit(1) }

const CAMPOS = ['tipo_gancho', 'estructura', 'tipo']
const igual = Object.fromEntries(CAMPOS.map(c => [c, 0]))
let hechos = 0, roles = 0, rolesIgual = 0, ms = 0
for (const r of reels) {
  const frases = (r.frases || []).filter(f => f.texto)
  if (!frases.length) continue
  const t = Date.now()
  let out
  try { out = await etiquetaConJev(frases.map(f => f.texto)) } catch (e) { console.log(`✗ ${r.id}: ${e.message.slice(0, 100)}`); continue }
  ms += Date.now() - t
  hechos++
  for (const c of CAMPOS) if ((r.etiquetas?.[c] || '') === out[c]) igual[c]++
  for (const f of out.frases) { roles++; if (frases[f.i]?.rol === f.rol) rolesIgual++ }
  console.log(`${r.id}  gancho ${r.etiquetas?.tipo_gancho} → ${out.tipo_gancho}  ·  confianza ${out.confianza.toFixed(2)}`)
}
if (!hechos) { console.log('No hay reels etiquetados por Claude con los que comparar.'); process.exit(0) }
const pct = (a, b) => `${Math.round((100 * a) / b)} %`
console.log(`\n${hechos} reels, ${Math.round(ms / hechos)} ms de media por reel. Coincide con Claude en:`)
for (const c of CAMPOS) console.log(`  ${c.padEnd(12)} ${pct(igual[c], hechos)}`)
console.log(`  papel de cada frase ${pct(rolesIgual, roles)}`)
console.log('\nSi en el gancho coincide poco con Claude, no merece la pena usarlo para etiquetar en español.')
