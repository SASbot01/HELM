#!/usr/bin/env node
// HELM — Web Creator desde la terminal del servidor. Lo usa el protocolo de
// publicación del prompt (paso 7) para apuntar dónde ha quedado la web.
//
//   node scripts/web-creator.mjs lista [slug-del-perfil]
//   node scripts/web-creator.mjs prompt <id>
//   node scripts/web-creator.mjs estudiar <id>
//   node scripts/web-creator.mjs publicada <id> --repo <url> --web <url>
//   node scripts/web-creator.mjs ensayo <contactId>   (el estudio en seco: no guarda nada)
//
// Con el entorno del servidor cargado:
//   set -a && . ./.env.server && set +a && node scripts/web-creator.mjs …
import { supabase } from '../api/lib/supabase.js'
import { encolaEstudio, ensayo } from '../api/_lib/webcreator.js'

const [orden, ...resto] = process.argv.slice(2)
const opcion = (n) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : undefined }
const fallo = (m) => { console.error(m); process.exit(1) }
const RE_UUID = /^[0-9a-f-]{36}$/i

async function fila(id) {
  if (!RE_UUID.test(String(id || ''))) fallo('Falta el id de la web (el que sale en la ficha o en «lista»)')
  const { data } = await supabase.from('helm_web_fabricacion').select('*').eq('id', id).maybeSingle()
  if (!data) fallo(`No hay ninguna web con id ${id}`)
  return data
}

if (orden === 'lista') {
  let q = supabase.from('helm_web_fabricacion').select('id, estado, fase, sector, ciudad, web_url, datos, client_id').order('created_at', { ascending: false }).limit(100)
  if (resto[0]) {
    const { data: p } = await supabase.from('clients').select('id').eq('slug', resto[0]).maybeSingle()
    if (!p) fallo(`No hay ningún perfil ${resto[0]}`)
    q = q.eq('client_id', p.id)
  }
  const { data } = await q
  for (const f of data || []) console.log(`${f.id}  ${f.estado.padEnd(10)} ${f.fase.padEnd(13)} ${f.datos?.nombre || '?'} · ${f.sector || '?'} · ${f.ciudad || '?'}${f.web_url ? ` · ${f.web_url}` : ''}`)
  if (!data?.length) console.log('No hay webs en fabricación.')
} else if (orden === 'prompt') {
  const f = await fila(resto[0])
  if (!f.prompt) fallo(`Esa web aún no tiene prompt (estado: ${f.estado}${f.error ? ` · ${f.error}` : ''})`)
  console.log(f.prompt)
} else if (orden === 'estudiar') {
  const f = await fila(resto[0])
  await supabase.from('helm_web_fabricacion').update({ estado: 'pendiente', error: null }).eq('id', f.id)
  await encolaEstudio(f.client_id, f.id)
  console.log('Estudio encolado: el worker lo hace en un momento.')
} else if (orden === 'publicada') {
  const f = await fila(resto[0])
  const repo = opcion('repo')
  const web = opcion('web')
  for (const [n, u] of [['repo', repo], ['web', web]]) {
    if (u && !/^https:\/\/\S+$/i.test(u)) fallo(`--${n} tiene que ser una dirección https://`)
  }
  if (!repo && !web) fallo('Pon al menos --repo o --web')
  const { error } = await supabase.from('helm_web_fabricacion').update({
    fase: 'publicada', ...(repo ? { repo_url: repo } : {}), ...(web ? { web_url: web } : {}), updated_at: new Date().toISOString(),
  }).eq('id', f.id)
  if (error) fallo(error.message)
  console.log(`Apuntada como publicada: ${f.datos?.nombre || f.id}${web ? ` → ${web}` : ''}`)
} else if (orden === 'ensayo') {
  if (!RE_UUID.test(String(resto[0] || ''))) fallo('Falta el id del contacto del CRM')
  const { data: c } = await supabase.from('crm_contacts').select('client_id').eq('id', resto[0]).maybeSingle()
  if (!c) fallo('No existe ese contacto')
  const r = await ensayo(c.client_id, resto[0])
  const { prompt, ...resumen } = r
  console.log(JSON.stringify(resumen, null, 1))
  console.log('\n========== PROMPT ==========\n' + prompt)
} else {
  fallo('Uso: lista [perfil] · prompt <id> · estudiar <id> · publicada <id> --repo <url> --web <url>')
}
process.exit(0)
