// HELM — la tarea de cada mañana: pone al día los perfiles que lo tienen
// configurado (api/_lib/automatico.js). La lanza el cron de s4sf en minipc:
//
//   15 6 * * * cd /home/s4sf/helm && node --env-file=.env.server scripts/automatico-diario.mjs >> /home/s4sf/helm-logs/automatico.log 2>&1
//
// --prueba no escribe nada: enseña lo que haría. --perfil <slug> solo ese.
// --hoy AAAA-MM-DD (solo con --prueba) simula otro día, para ver qué haría.
import { supabase } from '../api/lib/supabase.js'
import { ponerAlDia, hoyMadrid, SERVICIO } from '../api/_lib/automatico.js'
import { writeAudit } from '../api/_lib/auth.js'

const args = process.argv.slice(2)
const prueba = args.includes('--prueba')
const soloPerfil = args.includes('--perfil') ? args[args.indexOf('--perfil') + 1] : null
const hoyPedido = args.includes('--hoy') ? args[args.indexOf('--hoy') + 1] : null
if (hoyPedido && (!prueba || !/^\d{4}-\d{2}-\d{2}$/.test(hoyPedido))) { console.error('--hoy solo vale con --prueba y en formato AAAA-MM-DD'); process.exit(1) }
const hoy = hoyPedido || hoyMadrid()

const { data: filas, error } = await supabase.from('user_integrations')
  .select('client_id, config, clients(name, slug)').eq('service', SERVICIO).eq('enabled', true)
if (error) { console.error(`[${hoy}] no se pudo leer la configuración: ${error.message}`); process.exit(1) }

let fallos = 0
for (const f of filas || []) {
  if (soloPerfil && f.clients?.slug !== soloPerfil) continue
  const r = await ponerAlDia({ supabase, clientId: f.client_id, config: f.config || {}, hoy, prueba })
  const s = r.stripe
  const resumen = [
    s ? `stripe: ${s.ventas.nuevas} nuevas, ${s.ventas.actualizadas} al día, ${s.finanzas} apuntes` : null,
    `gastos fijos: ${r.gastos.length}`,
    `cuotas seguras: ${r.cuotas.length}`,
  ].filter(Boolean).join(' · ')
  console.log(`[${hoy}]${prueba ? ' PRUEBA' : ''} ${f.clients?.name || f.client_id} — ${resumen}`)
  for (const o of [...(s?.ops || []), ...r.gastos.map(g => `Gasto fijo: ${g}`), ...r.cuotas.map(c => `Cuota segura: ${c}`)]) console.log(`    · ${o}`)
  for (const e of r.errores) console.log(`    ! ${e}`)
  fallos += r.errores.length
  if (!prueba && (s?.ops?.length || r.gastos.length || r.cuotas.length || r.errores.length)) {
    await writeAudit({
      clientId: f.client_id, action: 'automatico.diario', resourceType: 'client', resourceId: f.client_id,
      actor: { role: 'system', email: 'automatico' },
      metadata: { hoy, stripe: s ? { ventas: s.ventas, finanzas: s.finanzas, ops: s.ops } : null, gastos: r.gastos, cuotas: r.cuotas, errores: r.errores },
    })
  }
}
if (fallos) process.exitCode = 1
