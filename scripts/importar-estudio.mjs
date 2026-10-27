// Guarda en el Informe de contenido de un perfil un estudio de contenido hecho
// fuera del worker (por Claude con el conector, a partir de los datos de HELM):
// sale en «Estudio de contenido» como uno más. Ver importaEstudio en
// api/_lib/estudio-contenido/generar.js.
//
//   node --env-file=.env.server scripts/importar-estudio.mjs \
//     --perfil detras-de-camra --json /ruta/estudio.json [--prueba] [--modelo "claude (conector)"]
//
// El JSON es el objeto `estudio` con las claves de la herramienta del worker
// (resumen, etapa, objetivos, diagnostico, plan, experimentos,
// avatar_contenido, aprendido, metricas_a_vigilar, avisos). Los números de
// la cuenta y el valor actual de cada objetivo los pone HELM.
// --prueba no escribe nada: enseña lo que guardaría y si pasa la revisión.
import { readFileSync } from 'node:fs'
import { supabase } from '../api/lib/supabase.js'
import { importaEstudio } from '../api/_lib/estudio-contenido/generar.js'

function argumentos(argv) {
  const a = { prueba: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--prueba') a.prueba = true
    else if (['--perfil', '--json', '--modelo'].includes(k)) a[k.slice(2)] = argv[++i]
    else throw new Error(`No sé qué es ${k}`)
  }
  if (!a.perfil || !a.json) throw new Error('Uso: --perfil <slug> --json <ruta> [--prueba] [--modelo <texto>]')
  return a
}

const num = (v) => (v == null ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }))

async function main() {
  const a = argumentos(process.argv.slice(2))
  const entrada = JSON.parse(readFileSync(a.json, 'utf8'))
  const { data: perfil, error } = await supabase.from('clients').select('id, slug, name').eq('slug', a.perfil).maybeSingle()
  if (error) throw error
  if (!perfil) throw new Error(`No hay ningún perfil «${a.perfil}»`)

  const r = await importaEstudio({ clientId: perfil.id, entrada, prueba: a.prueba, ...(a.modelo ? { modelo: a.modelo } : {}) })
  const e = r.estudio
  console.log(`${perfil.name} (${perfil.slug}): ${r.datos.cuenta.piezas} piezas, ${num(r.datos.cuenta.seguidores)} seguidores`)
  console.log(`  etapa: ${e.etapa.nombre}`)
  for (const o of e.objetivos) console.log(`  objetivo: ${o.nombre} · ${o.metrica} ${num(o.actual)} → ${num(o.objetivo)} en ${o.plazo_dias} días`)
  console.log(`  plan: ${e.plan.map(s => `semana ${s.semana} (${s.piezas.length} piezas)`).join(', ')}`)
  console.log(`  ${e.experimentos.length} experimentos · ${e.aprendido.length} reglas (${e.aprendido.filter(x => x.estado === 'confirmada').length} confirmadas) · ${e.metricas_a_vigilar.length} métricas · ${e.avisos.length} avisos`)
  if (r.errores.length) {
    console.log('NO se guarda: la revisión no lo deja pasar:')
    for (const x of r.errores) console.log(`  · ${x}`)
    process.exitCode = 1
    return
  }
  console.log(r.guardado
    ? `  GUARDADO (${r.id}): ${r.guardadas} reglas a la memoria del equipo, ${r.caducadas} caducadas`
    : '  (prueba: no se ha guardado nada)')
}

main().catch(e => { console.error('Error:', e.message || e); process.exit(1) })
