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
import { supabase } from '../lib/supabase.js'
import { contexto } from './contexto.js'
import { agenciaDe } from './access.js'

export const CREDITOS_POR_EURO = 100
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
const agenciasVistas = new Map() // id -> { agencia, exp }
async function agencia(id) {
  const vista = agenciasVistas.get(id)
  if (vista && vista.exp > Date.now()) return vista.agencia
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
    const e = new Error('Te has quedado sin créditos. Recarga en Ajustes → Créditos para que la IA siga trabajando.')
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

/** Suma créditos (recarga pagada, regalo o ajuste). Devuelve el saldo o null si ya estaba apuntado. */
export async function sumarSaldo(agenciaId, euros, { tipo = 'recarga', origen = 'stripe', referencia = null } = {}) {
  const { data, error } = await supabase.rpc('mover_saldo', {
    p_agencia: agenciaId, p_importe: euros, p_tipo: tipo, p_origen: origen, p_referencia: referencia,
  })
  if (error) throw error
  agenciasVistas.delete(agenciaId)
  return data
}
