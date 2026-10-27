// HELM — créditos: lo que paga cada agencia por la IA que usa.
//
// Sin suscripción. La agencia compra créditos por adelantado y cada llamada a
// Claude que hace HELM con NUESTRA clave se le descuenta al doble de lo que nos
// cuesta. Lo que Claude haga en la cuenta del propio usuario (el conector MCP
// usado desde su claude.ai) no pasa por aquí: lo paga él a Anthropic.
//
// El saldo se guarda en euros (agencias.saldo); en pantalla se enseña en
// créditos, 1 € = 100 créditos.
//
// A quién se cobra lo dice el contexto de la petición (./contexto.js): lo
// rellenan validateAuth y requireProfileAccess, y el worker al empezar cada
// trabajo. Sin contexto, o con una agencia `sin_cobro`, no se cobra nada.
//
// Los agentes que no usan Claude (Editor de reels, Portadas con IA, Trial
// reels) cobran a PRECIO FIJO por trabajo (src/helm/precios.js), con el perfil
// explícito y sin depender de claveHelm(). Uso:
//   import { exigirImporte, cobrarFijo, cobradoYa, quienPagaPerfil, precioEditor, PRECIOS_FIJOS,
//            conCerrojoAgencia, reservaTemporal } from './_lib/creditos.js'
//   // antes de lanzar: si no llega, lanza un 402 con el mensaje para el usuario.
//   // Lo que ya está comprometido en trabajos de la AGENCIA que aún no se han
//   // cobrado (de TODOS los agentes: apartadoDeAgencia) se resta del saldo
//   // antes de comparar: sin eso, con 1,50 € se ponen 20 vídeos en cola, o se
//   // gasta en Portadas lo que ya está apartado para un vídeo del Editor.
//   // Comprobar y apartar van dentro del cerrojo de la agencia:
//   await conCerrojoAgencia(agenciaId, async () => {
//     await exigirImporte(clientId, precioEditor(duracion), { excluirEdicion: id, detalle: verSaldo })
//     // …y aquí, antes de soltar el cerrojo, lo que lo deja apartado: la fila
//     // en marcha (Editor, Trial reels) o reservaTemporal (Portadas).
//   })
//   // al terminar BIEN (nunca si falla); la referencia hace que no se cobre dos veces
//   const saldo = await cobrarFijo(clientId, precio, { concepto: 'editor-reels', referencia: `editor:${id}`, origen: 'auto' })
//   // saldo null = no se ha cobrado AHORA. Para saber si apuntar cobrado_eur:
//   //   saldo != null                     → cobrado ahora
//   //   await cobradoYa(`editor:${id}`)   → lo cobrado antes con esa referencia (un
//   //                                        reintento del worker), o null
//   //   null y quienPagaPerfil ≠ null     → falló el apunte: reintentar más tarde
//   //                                        (con la misma referencia no hay riesgo)
//   // Lo que nos cuesta por fuera (la imagen de Ideogram/Replicate), en dólares,
//   // va en `costeUsd` para que el margen de la plataforma salga bien.
// La agencia `sin_cobro` (la de la casa) y un perfil sin agencia no pagan.
import { supabase } from '../lib/supabase.js'
import { contexto } from './contexto.js'
import { agenciaDe } from './access.js'
import { HORAS_SUBIDA } from './subida-trozos.js'
import { CREDITOS_POR_EURO, PRECIOS_FIJOS, precioEditor } from '../../src/helm/precios.js'
import { EN_MARCHA as EDICIONES_EN_MARCHA } from '../../src/agents/editor/estilo.js'

export { CREDITOS_POR_EURO, PRECIOS_FIJOS, precioEditor }
export const MARGEN = 2
// Anthropic factura en dólares; los créditos se venden en euros.
const EUR_POR_USD = Number(process.env.HELM_EUR_POR_USD || 0.92)

// Créditos que se regalan al registrarse, para probar sin pagar.
export const BIENVENIDA_EUROS = Number(process.env.HELM_CREDITOS_BIENVENIDA_EUR || 2)

// Packs a la venta. Sin descuentos por volumen: menos que explicar.
export const PACKS = [10, 25, 50, 100].map(euros => ({
  id: `pack-${euros}`, euros, creditos: euros * CREDITOS_POR_EURO,
}))

// Precio por millón de tokens, en dólares (tarifas de Anthropic).
const PRECIOS_USD = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/**
 * Lo que nos cuesta una respuesta, en dólares, a partir de su `usage`.
 * La caché se cobra distinto: leerla vale una décima parte de la entrada y
 * escribirla un 25 % más.
 */
export function costeUsd(modelo, usage = {}) {
  const p = PRECIOS_USD[modelo] || PRECIOS_USD['claude-opus-5']
  const m = 1_000_000
  return (
    (usage.input_tokens || 0) * p.in / m +
    (usage.cache_read_input_tokens || 0) * p.in * 0.1 / m +
    (usage.cache_creation_input_tokens || 0) * p.in * 1.25 / m +
    (usage.output_tokens || 0) * p.out / m
  )
}

/** Lo que se le cobra a la agencia por ese coste, en euros. */
export const precioEuros = (usd) => usd * EUR_POR_USD * MARGEN

// Saldo y si paga, recordados unos segundos: se mira antes de cada llamada.
// `fresca`: se lee de la base aunque esté recordada (lo que cobra a precio
// fijo pasa una vez por trabajo y no puede fiarse de un saldo de hace 10 s).
const agenciasVistas = new Map() // id -> { agencia, exp }
async function agencia(id, { fresca = false } = {}) {
  const vista = agenciasVistas.get(id)
  if (!fresca && vista && vista.exp > Date.now()) return vista.agencia
  const { data, error } = await supabase.from('agencias').select('id, saldo, sin_cobro').eq('id', id).maybeSingle()
  if (error) throw error
  agenciasVistas.set(id, { agencia: data, exp: Date.now() + 10_000 })
  return data
}

/** La clave de Claude de HELM: lo que se llama con ella, se cobra. */
export const claveHelm = () => process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''

/**
 * ¿La IA de este perfil la paga su agencia con créditos? Es lo que decide si
 * un perfil sin clave propia usa Claude con la clave de HELM (y paga) o el
 * modelo local, que es lo que hace la agencia de la casa.
 */
export async function pagaConCreditos(clientId) {
  if (!clientId || !claveHelm()) return false
  const id = await agenciaDe(clientId)
  if (!id) return false
  const a = await agencia(id)
  return Boolean(a && !a.sin_cobro)
}

/** La agencia que paga lo que gaste la petición en curso, o null. */
async function quienPaga() {
  const c = contexto()
  if (!c) return null
  const agenciaId = c.clientId ? (await agenciaDe(c.clientId)) || c.agenciaId : c.agenciaId
  if (!agenciaId) return null
  const a = await agencia(agenciaId)
  if (!a || a.sin_cobro) return null
  return { agencia: a, clientId: c.clientId || null, origen: c.origen || 'panel' }
}

/**
 * Antes de llamar a Claude: sin saldo LIBRE, no se llama. Libre es el saldo
 * menos lo apartado para trabajos a precio fijo que aún no se han cobrado
 * (apartadoDeAgencia): si no, lo reservado para un vídeo del Editor en cola se
 * gastaría en Claude y el Editor, al acabar, cobraría igual. Lanza un 402 con
 * un mensaje que se puede enseñar tal cual (sin cifras: lo ve quien sea).
 */
export async function exigirSaldo() {
  const p = await quienPaga()
  if (!p) return
  const saldo = Number(p.agencia.saldo) || 0
  // Sin saldo ni se mira lo apartado: no hace falta para decir que no. Si no
  // se puede mirar (la base falla, o falta una columna de una migración), Claude
  // sigue funcionando como antes de lo apartado: solo con el saldo.
  let apartado = 0
  if (saldo > 0) {
    try { apartado = await apartadoDeAgencia(p.agencia.id) } catch (err) {
      console.error('[creditos] no se pudo mirar lo apartado; se sigue con el saldo:', err?.message || err)
    }
  }
  const libre = Math.round((saldo - apartado) * 10_000) / 10_000
  if (libre <= 0) {
    const e = new Error(apartado > 0
      ? 'Te has quedado sin créditos: lo que queda está apartado para trabajos que aún no han terminado. Recarga para que la IA siga trabajando.'
      : 'Te has quedado sin créditos. Recarga para que la IA siga trabajando.')
    e.statusCode = 402
    throw e
  }
}

/**
 * Después de una respuesta de Claude: apunta el consumo y lo descuenta. Nunca
 * lanza — si falla el apunte, la respuesta ya está pagada a Anthropic y no se
 * le puede quitar al usuario; queda en el log.
 */
export async function cobrar(modelo, usage) {
  try {
    const p = await quienPaga()
    if (!p) return
    const usd = costeUsd(modelo, usage)
    if (usd <= 0) return
    const tokensIn = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
    const { data, error } = await supabase.rpc('mover_saldo', {
      p_agencia: p.agencia.id, p_importe: -precioEuros(usd), p_tipo: 'consumo', p_origen: p.origen,
      p_client: p.clientId, p_modelo: modelo, p_tokens_in: tokensIn, p_tokens_out: usage.output_tokens || 0,
      p_coste_usd: usd,
    })
    if (error) throw error
    if (data != null) agenciasVistas.set(p.agencia.id, { agencia: { ...p.agencia, saldo: data }, exp: Date.now() + 10_000 })
  } catch (err) {
    console.error('[creditos] no se pudo apuntar el consumo:', err?.message || err)
  }
}

// ── Precio fijo por trabajo ────────────────────────────────────────────────

const centimos = (euros) => Math.round(Number(euros) * 100) / 100
const formatoCreditos = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })

/**
 * ¿Quién paga lo que haga este perfil? null si no paga nadie (perfil sin
 * agencia, o agencia `sin_cobro`); si no, su agencia y el saldo que le queda,
 * en euros, leído de la base en ese momento. Puede lanzar si falla la base.
 * @returns {Promise<null | { agenciaId: string, saldo: number }>}
 */
export async function quienPagaPerfil(clientId) {
  if (!clientId) return null
  const agenciaId = await agenciaDe(clientId)
  if (!agenciaId) return null
  const a = await agencia(agenciaId, { fresca: true })
  if (!a || a.sin_cobro) return null
  return { agenciaId, saldo: Number(a.saldo) || 0 }
}

// ── Lo apartado: lo comprometido y aún sin cobrar, de TODOS los agentes ─────
//
// Los agentes a precio fijo cobran al ACABAR bien, así que lo que tienen en
// marcha ya está comprometido: no se puede gastar en otra cosa. Hasta el
// 27-oct cada agente restaba solo lo suyo, y con 1,50 € se lanzaba un vídeo del
// Editor, dos portadas y una variante: la agencia acababa en −1,10 €.

// Las variantes de Trial reels que aún pueden salir (y cobrarse).
const TRIAL_EN_MARCHA = ['en_cola', 'procesando']
// Copia de CADUCA_PROCESANDO de api/trial-reels.js: un «procesando» con más de
// esto es que el servidor se reinició a medias, y no va a cobrarse.
const CADUCA_PROCESANDO_TRIAL = 15 * 60_000
// Lo mismo que CADUCA_SUBIENDO_MS de api/_lib/editor/trabajo.js (que importa
// este archivo: por eso no se importa de allí): una subida parada desde hace
// más de esto se abandonó y no cuenta.
const CADUCA_SUBIENDO_EDITOR = HORAS_SUBIDA * 3600_000
const edadDe = (f) => Date.now() - new Date(f.updated_at || f.created_at || 0).getTime()
// La tabla no existe todavía (falta su migración): nada puede estar apartado
// en ella, y Claude no debe dejar de funcionar por eso.
const sinTabla = (error) => ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code)
  || /relation .* does not exist|could not find the table|column .* does not exist/i.test(error?.message || '')

// Reservas en memoria de ESTE proceso (el api-server es uno solo), para lo que
// no deja una fila en marcha mientras trabaja: una portada con IA tarda unos
// 30 s y se cobra al acabar.
const reservas = new Map() // agenciaId -> euros

/**
 * Aparta `euros` del saldo de la agencia mientras dura un trabajo que no deja
 * fila en marcha (Portadas con IA). Devuelve liberar(), que se llama SIEMPRE
 * al acabar, haya salido bien o mal (en un finally); llamarla dos veces no
 * suelta dos veces. Sin agencia o sin importe, no aparta nada.
 *
 * Uso (en lugar del enVuelo de api/portadas.js):
 *   let liberar = () => {}
 *   await conCerrojoAgencia(agenciaId, async () => {
 *     await exigirImporte(clientId, precio, { detalle: verSaldo })
 *     liberar = reservaTemporal(agenciaId, precio)
 *   })
 *   try { … genera y cobra … } finally { liberar() }
 */
export function reservaTemporal(agenciaId, euros) {
  const importe = centimos(euros)
  if (!agenciaId || !(importe > 0)) return () => {}
  reservas.set(agenciaId, centimos((reservas.get(agenciaId) || 0) + importe))
  let suelta = false
  return function liberar() {
    if (suelta) return
    suelta = true
    const queda = centimos((reservas.get(agenciaId) || 0) - importe)
    if (queda > 0) reservas.set(agenciaId, queda)
    else reservas.delete(agenciaId)
  }
}

/**
 * Lo que la agencia tiene comprometido y aún sin cobrar, en euros, de TODOS
 * sus perfiles y de todos los agentes:
 *   · ediciones del Editor subiendo, en cola, transcribiendo o montándose, sin
 *     cobrar (precio_eur), menos las subidas abandonadas y `excluirEdicion`
 *     (la que se está lanzando: su precio es el que se va a exigir);
 *   · variantes de Trial reels en cola o montándose, sin cobrar (un
 *     «procesando» colgado por un reinicio no cuenta);
 *   · lo reservado en memoria con reservaTemporal (Portadas generando).
 * Lanza si falla la base: entonces no se sabe, y no se lanza nada a ciegas.
 *
 * Uso: exigirImporte ya lo resta solo; esto es para quien enseñe lo libre.
 *   const libre = saldo - await apartadoDeAgencia(agenciaId)
 */
export async function apartadoDeAgencia(agenciaId, { excluirEdicion = null } = {}) {
  if (!agenciaId) return 0
  // Lo reservado en memoria se lee al final, tras las consultas: lo soltado
  // mientras tanto ya no cuenta.
  const conReservas = (euros) => Math.max(0, centimos(euros + (reservas.get(agenciaId) || 0)))
  const { data: perfiles, error } = await supabase.from('clients').select('id').eq('agencia_id', agenciaId)
  if (error) throw error
  const ids = (perfiles || []).map(p => p.id)
  if (!ids.length) return conReservas(0)

  const [ediciones, variantes] = await Promise.all([
    supabase.from('helm_ediciones').select('id, estado, precio_eur, cobrado_eur, created_at, updated_at')
      .in('client_id', ids).in('estado', EDICIONES_EN_MARCHA).is('cobrado_eur', null),
    supabase.from('helm_trial_reels').select('estado, precio_eur, cobrado_eur, updated_at')
      .in('client_id', ids).in('estado', TRIAL_EN_MARCHA),
  ])
  if (ediciones.error && !sinTabla(ediciones.error)) throw ediciones.error
  if (variantes.error && !sinTabla(variantes.error)) throw variantes.error

  let total = 0
  for (const f of ediciones.data || []) {
    if (f.cobrado_eur != null || (excluirEdicion && f.id === excluirEdicion)) continue
    if (f.estado === 'subiendo' && edadDe(f) > CADUCA_SUBIENDO_EDITOR) continue
    total += Number(f.precio_eur) || 0
  }
  for (const f of variantes.data || []) {
    if (f.cobrado_eur != null) continue
    if (f.estado === 'procesando' && Date.now() - new Date(f.updated_at || 0).getTime() > CADUCA_PROCESANDO_TRIAL) continue
    total += Number(f.precio_eur) || 0
  }
  return conReservas(total)
}

// Un cerrojo por agencia, el MISMO para todos los agentes de este proceso.
const cerrojos = new Map() // clave -> la cola de turnos

/**
 * Ejecuta `fn` de uno en uno por agencia: comprobar el saldo (exigirImporte) y
 * dejar el trabajo apartado (la fila en marcha, o reservaTemporal) van dentro,
 * juntos, para que dos peticiones casi a la vez (del mismo agente o de dos
 * distintos) no pasen las dos con el saldo de una. Devuelve lo que devuelva
 * `fn` (y lanza lo que lance; el turno se suelta igual).
 *
 * Sin agencia no espera (nadie paga); quien quiera serializar igualmente un
 * perfil sin agencia puede pasar su clientId. No se anida con la misma clave:
 * esperaría a sí mismo. Y dentro no va lo largo (subir, generar, montar): solo
 * comprobar y apartar.
 *
 * Uso:
 *   const agenciaId = await agenciaDe(clientId)   // de ./access.js
 *   await conCerrojoAgencia(agenciaId, async () => {
 *     await exigirImporte(clientId, precio, { detalle: verSaldo })
 *     await supabase.from(TABLA).insert({ …, estado: 'en_cola', precio_eur: precio })
 *   })
 */
export async function conCerrojoAgencia(agenciaId, fn) {
  if (!agenciaId) return fn()
  const clave = String(agenciaId)
  const antes = cerrojos.get(clave) || Promise.resolve()
  let suelta
  const mio = new Promise(ok => { suelta = ok })
  const cola = antes.then(() => mio)
  cerrojos.set(clave, cola)
  await antes
  try {
    return await fn()
  } finally {
    suelta()
    if (cerrojos.get(clave) === cola) cerrojos.delete(clave)
  }
}

/**
 * Antes de lanzar un trabajo de `euros`: si el perfil paga y no le llega el
 * saldo LIBRE (el saldo menos lo apartado), lanza un 402 con un mensaje que se
 * enseña tal cual (y que abre la recarga en el panel: ver apiFetch en
 * src/helm/lib.js). El cobro de verdad es cobrarFijo, al acabar bien.
 *
 * Opciones:
 *   · excluirEdicion: la edición que se está lanzando, para no contarla dos
 *     veces (su fila ya está «subiendo» con su precio).
 *   · detalle: true solo para quien puede ver el saldo (puedeVerSaldo de
 *     ./access.js): el 402 dice cuánto cuesta, cuánto queda y cuánto está
 *     apartado. Con false (por defecto), uno genérico que no enseña el saldo
 *     de la agencia y dice a quién pedir la recarga.
 *   · pendiente: lo de antes (euros, o una función ({ agenciaId, clientId }) →
 *     euros que solo se llama si la agencia paga). Si se pasa, todo va como
 *     hasta ahora, para no romper a ningún agente mientras se adaptan: se usa
 *     ESO en lugar de apartadoDeAgencia y, si no se dice `detalle`, el 402
 *     lleva las cifras, como antes. Quien lo pasa solo resta lo suyo y enseña
 *     el saldo a cualquiera: mejor no pasarlo, y pasar `detalle`.
 * Va dentro de conCerrojoAgencia junto con lo que deja el trabajo apartado.
 * Puede lanzar si falla la base.
 * @returns {Promise<{ paga: boolean, saldo: number|null }>}
 */
export async function exigirImporte(clientId, euros, { pendiente = null, excluirEdicion = null, detalle } = {}) {
  const p = await quienPagaPerfil(clientId)
  if (!p) return { paga: false, saldo: null }
  const importe = centimos(euros)
  if (!(importe > 0)) return { paga: true, saldo: p.saldo }
  const comprometido = pendiente == null
    ? await apartadoDeAgencia(p.agenciaId, { excluirEdicion })
    : typeof pendiente === 'function' ? await pendiente({ agenciaId: p.agenciaId, clientId }) : pendiente
  const apartado = Math.max(0, centimos(comprometido) || 0)
  const libre = p.saldo - apartado
  // La diezmilésima: el saldo es numeric(12,4) y el precio llega en céntimos.
  if (libre + 1e-4 < importe) {
    const cuesta = formatoCreditos.format(Math.round(importe * CREDITOS_POR_EURO))
    let mensaje = `La agencia no tiene créditos suficientes para esto (cuesta ${cuesta} créditos). Pide a quien administra la agencia que recargue.`
    // Sin decirlo: genérico, salvo para los agentes de antes (con `pendiente`).
    if (detalle ?? (pendiente != null)) {
      const quedan = formatoCreditos.format(Math.max(0, Math.floor(libre * CREDITOS_POR_EURO)))
      const enMarcha = apartado > 0
        ? ` (otros ${formatoCreditos.format(Math.round(apartado * CREDITOS_POR_EURO))} ya están apartados para trabajos que aún no han terminado)`
        : ''
      mensaje = `No tienes saldo suficiente: esto cuesta ${cuesta} créditos y te quedan ${quedan}${enMarcha}. Recarga en Créditos.`
    }
    const e = new Error(mensaje)
    e.statusCode = 402
    throw e
  }
  return { paga: true, saldo: p.saldo }
}

/**
 * Lo que enseña la pantalla de un agente antes de lanzar (GET
 * /api/creditos?action=precios): si el perfil paga, los precios y, por cada
 * uno, si le alcanza a la agencia con lo apartado ya descontado. El saldo, solo
 * a quien puede verlo (`verSaldo`, de puedeVerSaldo); al resto, null.
 *
 * Uso:
 *   res.json(await preciosDelPerfil(clientId, { verSaldo: await puedeVerSaldo(auth, clientId) }))
 * @returns {Promise<{ paga: boolean, saldo: number|null, alcanza?: Record<string, boolean>, precios: object }>}
 */
export async function preciosDelPerfil(clientId, { verSaldo = false } = {}) {
  const p = await quienPagaPerfil(clientId)
  if (!p) return { paga: false, saldo: null, precios: PRECIOS_FIJOS }
  const libre = p.saldo - await apartadoDeAgencia(p.agenciaId)
  // La misma cuenta que exigirImporte: alcanza si no le falta más de una diezmilésima.
  const alcanza = Object.fromEntries(Object.entries(PRECIOS_FIJOS).map(([k, euros]) => [k, libre + 1e-4 >= euros]))
  return { paga: true, saldo: verSaldo ? p.saldo : null, alcanza, precios: PRECIOS_FIJOS }
}

/**
 * Cobra un trabajo hecho a precio fijo: apunta `euros` como consumo de la
 * agencia del perfil, con `concepto` (una clave de PRECIOS_FIJOS) donde los de
 * Claude llevan el modelo. `referencia` es obligatoria y única por trabajo
 * (p. ej. `editor:<id>`): con la misma, la base no cobra dos veces aunque el
 * trabajo se repita o el worker lo reintente.
 *
 * Devuelve el saldo nuevo, o null si no se ha cobrado (no paga, ya estaba
 * cobrado, sin referencia o falla la base; para distinguirlos, cobradoYa y
 * quienPagaPerfil). Nunca lanza: el trabajo ya está hecho y entregado; si
 * falla el apunte, queda en el log. `costeUsd`: lo que nos ha costado por
 * fuera (una imagen de Ideogram/Replicate), para el margen de la plataforma.
 */
export async function cobrarFijo(clientId, euros, { concepto, referencia, origen = 'panel', costeUsd = 0 } = {}) {
  try {
    const importe = centimos(euros)
    if (!(importe > 0)) return null
    if (!referencia) throw new Error('falta la referencia: sin ella se podría cobrar dos veces')
    const p = await quienPagaPerfil(clientId)
    if (!p) return null
    const coste = Number(costeUsd)
    const { data, error } = await supabase.rpc('mover_saldo', {
      p_agencia: p.agenciaId, p_importe: -importe, p_tipo: 'consumo', p_origen: origen,
      p_client: clientId, p_modelo: concepto || null, p_tokens_in: 0, p_tokens_out: 0,
      p_coste_usd: Number.isFinite(coste) && coste > 0 ? coste : 0,
      p_referencia: String(referencia),
    })
    if (error) throw error
    if (data == null) return null
    const saldo = Number(data)
    const vista = agenciasVistas.get(p.agenciaId)
    if (vista) agenciasVistas.set(p.agenciaId, { agencia: { ...vista.agencia, saldo }, exp: Date.now() + 10_000 })
    return saldo
  } catch (err) {
    console.error(`[creditos] no se pudo cobrar ${concepto || 'un trabajo'} (${referencia || 'sin referencia'}):`, err?.message || err)
    return null
  }
}

/**
 * Lo que ya se cobró con esa `referencia`, en euros (en positivo), o null si
 * no hay cobro con ella. Para el worker que se cayó entre cobrarFijo y apuntar
 * cobrado_eur: al repetir, cobrarFijo da null («ya estaba») y esto dice cuánto.
 * Lanza si falla la base: entonces no se sabe, y hay que volver a mirar luego.
 */
export async function cobradoYa(referencia) {
  if (!referencia) return null
  const { data, error } = await supabase.from('agencia_movimientos')
    .select('importe').eq('referencia', String(referencia)).maybeSingle()
  if (error) throw error
  if (!data) return null
  return centimos(Math.abs(Number(data.importe) || 0))
}

/** Suma créditos (recarga pagada, regalo o ajuste). Devuelve el saldo o null si ya estaba apuntado. */
export async function sumarSaldo(agenciaId, euros, { tipo = 'recarga', origen = 'stripe', referencia = null } = {}) {
  const { data, error } = await supabase.rpc('mover_saldo', {
    p_agencia: agenciaId, p_importe: euros, p_tipo: tipo, p_origen: origen, p_referencia: referencia,
  })
  if (error) throw error
  agenciasVistas.delete(agenciaId)
  return data
}
