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
//   import { exigirImporte, cobrarFijo, cobradoYa, quienPagaPerfil, precioEditor, PRECIOS_FIJOS } from './_lib/creditos.js'
//   // antes de lanzar: si no llega, lanza un 402 con el mensaje para el usuario.
//   // `pendiente` = lo que ya está comprometido en trabajos de la AGENCIA que
//   // aún no se han cobrado (en cola, en marcha…; sin contar este): sin eso,
//   // con 1,50 € se pueden poner 20 vídeos en cola. Un número, o una función
//   // que lo calcula y solo se llama si la agencia paga:
//   await exigirImporte(clientId, precioEditor(duracion), {
//     pendiente: ({ agenciaId }) => sumaDeLoQueTieneEnMarcha(agenciaId, { menos: id }),
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
import { CREDITOS_POR_EURO, PRECIOS_FIJOS, precioEditor } from '../../src/helm/precios.js'

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
 * Antes de llamar a Claude: sin saldo, no se llama. Lanza un 402 con un
 * mensaje que se puede enseñar tal cual.
 */
export async function exigirSaldo() {
  const p = await quienPaga()
  if (!p) return
  if (Number(p.agencia.saldo) <= 0) {
    const e = new Error('Te has quedado sin créditos. Recarga para que la IA siga trabajando.')
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

/**
 * Antes de lanzar un trabajo de `euros`: si el perfil paga y no le llega el
 * saldo, lanza un 402 con un mensaje que se enseña tal cual (y que abre la
 * recarga en el panel: ver apiFetch en src/helm/lib.js). El cobro de verdad es
 * cobrarFijo, al acabar bien, así que lo que ya está en cola y aún no se ha
 * cobrado se pasa como `pendiente` (euros, o una función
 * ({ agenciaId, clientId }) → euros que solo se llama si la agencia paga): se
 * resta del saldo antes de comparar. Puede lanzar si falla la base.
 * @returns {Promise<{ paga: boolean, saldo: number|null }>}
 */
export async function exigirImporte(clientId, euros, { pendiente = 0 } = {}) {
  const p = await quienPagaPerfil(clientId)
  if (!p) return { paga: false, saldo: null }
  const importe = centimos(euros)
  if (!(importe > 0)) return { paga: true, saldo: p.saldo }
  const comprometido = typeof pendiente === 'function' ? await pendiente({ agenciaId: p.agenciaId, clientId }) : pendiente
  const apartado = Math.max(0, centimos(comprometido) || 0)
  const libre = p.saldo - apartado
  // La diezmilésima: el saldo es numeric(12,4) y el precio llega en céntimos.
  if (libre + 1e-4 < importe) {
    const cuesta = formatoCreditos.format(Math.round(importe * CREDITOS_POR_EURO))
    const quedan = formatoCreditos.format(Math.max(0, Math.floor(libre * CREDITOS_POR_EURO)))
    const enMarcha = apartado > 0
      ? ` (otros ${formatoCreditos.format(Math.round(apartado * CREDITOS_POR_EURO))} ya están apartados para trabajos que aún no han terminado)`
      : ''
    const e = new Error(`No tienes saldo suficiente: esto cuesta ${cuesta} créditos y te quedan ${quedan}${enMarcha}. Recarga en Créditos.`)
    e.statusCode = 402
    throw e
  }
  return { paga: true, saldo: p.saldo }
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
