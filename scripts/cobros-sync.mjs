// HELM — pone en el calendario los cobros y renovaciones que vienen.
//
// El producto es de PAGO ÚNICO: no hay pasarela que cobre sola, así que si
// nadie se acuerda de pasar el cargo, el dinero no entra. Esto lee la hoja
// donde vive la lista de clientes y deja en Google Calendar un aviso por cada
// cobro, con recordatorio el día que toca y otro 48 h antes.
//
// Se pasa entero cada vez, y es idempotente: los avisos llevan una marca
// (`extendedProperties.private.helmAviso`) y una clave `cliente|fecha`. En
// cada pasada se compara lo que hay con lo que toca —
//
//   · falta un aviso            → se crea
//   · cambió el importe o texto → se actualiza
//   · ya no está en la hoja     → se borra
//
// Ese último caso es el que resuelve las bajas: quitar a alguien de la hoja,
// o marcarlo como baja, hace que sus avisos desaparezcan solos en la
// siguiente pasada. Lo mismo con las altas y con los cambios de fecha.
//
//   node scripts/cobros-sync.mjs              → simulacro, no toca el calendario
//   node scripts/cobros-sync.mjs --aplicar    → escribe de verdad
//
// Config por entorno (en .env.server):
//   HELM_COBROS_SHEET   id de la hoja de Google (el trozo largo de su URL)
//   HELM_COBROS_SLUG    perfil de HELM cuyo Google se usa (por defecto enformaconhugo)
//   HELM_COBROS_DIAS    horizonte en días (por defecto 120)
//   HELM_COBROS_HORA    hora del aviso, 0-23 (por defecto 9)
import { supabase } from '../api/lib/supabase.js'
import {
  getAccessToken, exportarHojaComoCSV, listarAvisosHelm,
  cuerpoDeAviso, crearAviso, actualizarAviso, borrarAviso,
} from '../api/_lib/google.js'
import { parseCSV, normalizarFilas, calcularCobros, atrasados, aISO } from '../api/_lib/renovaciones.js'

const APLICAR = process.argv.includes('--aplicar')
const SLUG = process.env.HELM_COBROS_SLUG || 'enformaconhugo'
const SHEET = process.env.HELM_COBROS_SHEET
const DIAS = Number(process.env.HELM_COBROS_DIAS || 120)
const HORA = Number(process.env.HELM_COBROS_HORA || 9)

const eur = (n) => (n == null ? '—' : `${Number(n).toFixed(2).replace('.', ',')} €`)

// Lo que ve Hugo en la notificación del móvil. El importe primero porque es lo
// único que se lee entero en la pantalla de bloqueo.
function tituloDe(c) {
  return c.tipo === 'cuota'
    ? `💶 Cobrar ${eur(c.importe)} — ${c.cliente} (${c.etiqueta})`
    : `🔁 Renovación ${c.cliente} — ${eur(c.importe)}`
}

function descripcionDe(c) {
  return [
    `Cliente: ${c.cliente}`,
    `Producto: ${c.producto}`,
    `Importe: ${eur(c.importe)}`,
    `Concepto: ${c.etiqueta}`,
    '',
    c.tipo === 'cuota'
      ? 'Producto de pago único fraccionado: este cargo hay que pasarlo a mano, no se cobra solo.'
      : 'Termina el período contratado: renovar o dar de baja.',
    '',
    'Aviso puesto por HELM desde la hoja de clientes. Si cambias la hoja, este aviso se ajusta solo.',
  ].join('\n')
}

async function main() {
  if (!SHEET) {
    console.error('Falta HELM_COBROS_SHEET: el id de la hoja de Google con la lista de clientes.')
    process.exit(1)
  }

  const { data: cliente } = await supabase
    .from('clients').select('id, slug').eq('slug', SLUG).maybeSingle()
  if (!cliente) { console.error(`No existe el perfil "${SLUG}" en HELM.`); process.exit(1) }

  const { token } = await getAccessToken(supabase, cliente.id)

  // ── La hoja ────────────────────────────────────────────────────────────────
  const csv = await exportarHojaComoCSV(token, SHEET)
  const hoy = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
  const { clientes, bajas, ignoradas } = normalizarFilas(parseCSV(csv), hoy)

  console.log(`Hoja leída: ${clientes.length} clientes activos, ${bajas.length} dados de baja, ${ignoradas.length} filas ilegibles.`)
  for (const i of ignoradas) console.warn(`  ⚠ sin aviso — ${i.nombre}: ${i.motivo} (${i.producto || 'sin producto'})`)

  const vencidos = atrasados(clientes, { hoy })
  if (vencidos.length) {
    console.log(`\n${vencidos.length} clientes ya vencidos (no se les pone aviso, el aviso sería del pasado):`)
    for (const v of vencidos) console.log(`  · ${v.cliente} — ${v.tipo}, hace ${v.dias} días (${eur(v.importe)})`)
  }

  // ── Lo que toca vs lo que hay ──────────────────────────────────────────────
  const cobros = calcularCobros(clientes, { hoy, horizonteDias: DIAS })
  const hasta = new Date(+hoy + DIAS * 86400000)
  const existentes = await listarAvisosHelm(token, {
    calendarId: 'primary',
    timeMin: hoy.toISOString(),
    timeMax: hasta.toISOString(),
  })

  const porClave = new Map()
  for (const ev of existentes) {
    const clave = ev.extendedProperties?.private?.helmClave
    if (clave) porClave.set(clave, ev)
  }

  const plan = { crear: [], actualizar: [], borrar: [], igual: 0 }
  for (const c of cobros) {
    const cuerpo = cuerpoDeAviso({
      titulo: tituloDe(c), descripcion: descripcionDe(c),
      dia: aISO(c.fecha), hora: HORA, clave: c.clave,
    })
    const ya = porClave.get(c.clave)
    if (!ya) plan.crear.push({ c, cuerpo })
    else if (ya.summary !== cuerpo.summary || ya.description !== cuerpo.description) plan.actualizar.push({ c, cuerpo, id: ya.id })
    else plan.igual++
    porClave.delete(c.clave)
  }
  // Lo que queda en el mapa ya no le corresponde a nadie: baja, cambio de
  // fecha o cliente borrado de la hoja.
  for (const [clave, ev] of porClave) plan.borrar.push({ clave, id: ev.id, titulo: ev.summary })

  console.log(`\n${APLICAR ? 'APLICANDO' : 'SIMULACRO (nada se escribe; añade --aplicar)'} — horizonte ${DIAS} días`)
  console.log(`  crear: ${plan.crear.length} · actualizar: ${plan.actualizar.length} · borrar: ${plan.borrar.length} · sin cambios: ${plan.igual}`)

  for (const { c } of plan.crear) console.log(`  + ${aISO(c.fecha)}  ${tituloDe(c)}`)
  for (const { c } of plan.actualizar) console.log(`  ~ ${aISO(c.fecha)}  ${tituloDe(c)}`)
  for (const b of plan.borrar) console.log(`  - ${b.titulo || b.clave}`)

  if (!APLICAR) {
    const suma = cobros.reduce((s, c) => s + (c.importe || 0), 0)
    console.log(`\nEn ${DIAS} días hay ${cobros.length} cobros por ${eur(suma)}.`)
    return
  }

  let ok = 0; let fallos = 0
  const intentar = async (etiqueta, fn) => {
    try { await fn(); ok++ } catch (err) { fallos++; console.error(`  ✗ ${etiqueta}: ${err.message}`) }
  }
  for (const { c, cuerpo } of plan.crear) await intentar(`crear ${c.clave}`, () => crearAviso(token, 'primary', cuerpo))
  for (const { c, cuerpo, id } of plan.actualizar) await intentar(`actualizar ${c.clave}`, () => actualizarAviso(token, 'primary', id, cuerpo))
  for (const b of plan.borrar) await intentar(`borrar ${b.clave}`, () => borrarAviso(token, 'primary', b.id))

  console.log(`\nHecho: ${ok} avisos escritos, ${fallos} fallos.`)
  if (fallos) process.exit(1)
}

main().catch((err) => { console.error('[cobros-sync]', err); process.exit(1) })
