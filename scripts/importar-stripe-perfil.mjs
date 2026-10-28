// Importa a un perfil el histórico de los cobros que entraron por SUS enlaces
// de pago en una cuenta de Stripe compartida (ver api/_lib/stripe-historico.js).
//
//   node --env-file=.env.server scripts/importar-stripe-perfil.mjs \
//     --perfil detras-de-camra \
//     --enlace plink_AAA --enlace plink_BBB=6 --enlace plink_CCC=3:1987 \
//     --enlace plink_DDD=mensual [--mensualidad "Producto · mensualidad"] \
//     [--leads] [--prueba] [--clave HELM_STRIPE_SECRET_KEY]
//
// `plink=N` marca un plan fraccionado de N cuotas (y `:total`, su precio
// total si no es N × cuota); `plink=mensual`, un enlace de la mensualidad
// (suscripción o pago suelto de cada mes: se juntan por cliente).
// --prueba no escribe nada: enseña lo que haría.
// --clave es el NOMBRE de la variable de entorno con la clave de Stripe.
import { supabase } from '../api/lib/supabase.js'
import { historicoPorEnlaces } from '../api/_lib/stripe-historico.js'

const args = process.argv.slice(2)
const valor = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const perfil = valor('--perfil')
const enlaces = args.flatMap((a, i) => (a === '--enlace' ? [args[i + 1]] : [])).filter(Boolean).map(t => {
  const [id, plan] = t.split('=')
  if (plan === 'mensual') return { id, mensual: true }
  const [cuotas, total] = String(plan || '').split(':')
  return { id, cuotas: Number(cuotas) || 0, total: Number(total) || 0 }
})
const prueba = args.includes('--prueba')
const clave = process.env[valor('--clave') || 'HELM_STRIPE_SECRET_KEY']
if (!perfil || !enlaces.length) { console.error('Faltan --perfil y al menos un --enlace'); process.exit(1) }
if (!clave) { console.error('No hay clave de Stripe en el entorno'); process.exit(1) }
if (enlaces.some(e => !/^plink_[A-Za-z0-9]+$/.test(e.id))) { console.error('Algún --enlace no es un plink_ válido'); process.exit(1) }

const { data: cliente, error } = await supabase.from('clients').select('id, name, slug').eq('slug', perfil).maybeSingle()
if (error || !cliente) { console.error(`No existe el perfil ${perfil}`); process.exit(1) }

const r = await historicoPorEnlaces({
  supabase, clientId: cliente.id, apiKey: clave, enlaces, mensualidad: valor('--mensualidad'), leads: args.includes('--leads'), prueba,
})
console.log(`${prueba ? 'PRUEBA (no se ha escrito nada)' : 'IMPORTADO'} · ${cliente.name}\n`)
for (const e of r.enlaces) console.log(`  ${e.tipo.padEnd(11)} ${e.pagadas}/${e.sesiones} pagados · ${e.producto}${e.activo ? '' : ' (inactivo)'}`)
console.log('')
for (const o of r.ops) console.log('  · ' + o)
console.log(`\nVentas: ${r.ventas.nuevas} nuevas, ${r.ventas.vinculadas} vinculadas a una manual, ${r.ventas.actualizadas} puestas al día, ${r.ventas.yaEstaban} ya estaban`)
console.log(`Finanzas: ${r.finanzas} apuntes · Enlaces: ${r.enlacesGuardados} · Leads: ${r.leads} · Cobrado en Stripe por estos enlaces: ${r.cobrado} €`)
if (r.errores.length) { console.log('\nERRORES:'); for (const e of r.errores) console.log('  ! ' + e); process.exitCode = 1 }
