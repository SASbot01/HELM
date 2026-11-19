// Prepara de antemano el análisis de oportunidades de todos los sectores que
// hay en el CRM de un perfil, para que ningún cold caller espere al abrir un lead.
//
// USO (en el servidor, desde la carpeta de HELM):
//   node --env-file=.env.server scripts/oportunidades-precalcular.mjs [slug-del-perfil] [--rehacer]
// Por defecto: web-seller, y solo los sectores que aún no tienen análisis.
// Necesita que el perfil tenga Claude conectado (Ajustes → IA) o una clave de
// servidor válida (AGENTS_ANTHROPIC_KEY).
import { supabase } from '../api/lib/supabase.js'
import { sectorDe, guardado, generar } from '../api/_lib/oportunidades.js'

const slug = process.argv.slice(2).find(a => !a.startsWith('--')) || 'web-seller'
const rehacer = process.argv.includes('--rehacer')
const { data: perfil, error: e0 } = await supabase.from('clients').select('id, name').eq('slug', slug).maybeSingle()
if (e0 || !perfil) { console.error('No encuentro el perfil', slug, e0?.message || ''); process.exit(1) }

const sectores = new Map()
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await supabase.from('crm_contacts').select('tags, position, custom_fields')
    .eq('client_id', perfil.id).order('id').range(desde, desde + 999)
  if (error) throw error
  for (const c of data) {
    const s = sectorDe(c)
    if (s) { const v = sectores.get(s.clave) || { ...s, n: 0 }; v.n++; sectores.set(s.clave, v) }
  }
  if (data.length < 1000) break
}
const lista = [...sectores.values()].sort((a, b) => b.n - a.n)
console.log(`${perfil.name}: ${lista.length} sectores`)
for (const s of lista) {
  if (!rehacer && await guardado(perfil.id, s.clave)) { console.log(`  = ${s.nombre} (${s.n} leads) ya estaba`); continue }
  const t = Date.now()
  try {
    const r = await generar(perfil.id, s.clave, s.nombre)
    console.log(`  + ${s.nombre} (${s.n} leads): ${r.analisis.oportunidades.length} oportunidades en ${Math.round((Date.now() - t) / 1000)} s`)
  } catch (e) {
    console.log(`  ! ${s.nombre}: ${e.message}`)
    if (e.statusCode === 401 || e.statusCode === 402) process.exit(1)
  }
}
