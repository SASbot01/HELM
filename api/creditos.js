// HELM — la licencia de la agencia y su pago (antes: créditos).
//
// Desde el 2026-11-08 una agencia paga 97 € al año (una LICENCIA, IVA
// incluido) y ya está: HELM no vende créditos ni cobra por el uso de la IA,
// que la pone cada agencia con su propia clave (trae-tu-clave). Ver
// api/_lib/licencia.js y api/_lib/claves-agencia.js. El archivo se sigue
// llamando creditos.js para no tocar el webhook ya dado de alta en Stripe.
//
//   GET  ?action=precio                      → público: { euros } de la licencia
//   GET  ?action=licencia                    → (cualquier sesión, también sin
//                                               licencia) la de su agencia:
//                                               { agencia, exenta, vigente,
//                                               venceAt, precio, puedePagar… }
//   POST ?action=pagar-licencia              → (admin de la agencia, también sin
//                                               licencia) { url } de pago en Stripe
//   POST ?action=confirmar { sessionId }     → (sesión, también sin licencia) al
//                                               volver de Stripe: activa la licencia
//   POST ?action=webhook                     → Stripe avisa de un pago
//   GET  ?action=claves [&agenciaId=]        → (admin) si están sus claves de IA
//                                               (nunca las claves: 4 últimos)
//   POST ?action=claves { anthropicKey?, anthropicModel?, replicateToken?, borrar? }
//                                            → (admin) guardarlas. La de Claude
//                                               se comprueba contra Anthropic antes
//   GET  ?action=precios &clientId=          → lo que pedían los agentes antes de
//                                               lanzar: ahora siempre `paga: false`
//
// Al pagar (la vuelta del navegador o el webhook, lo que llegue antes): se
// activa la licencia de la agencia un año desde que acabe la vigente (o desde
// el pago, si no tiene), con extender_licencia. La referencia es el id de la
// sesión de Stripe: los dos avisos no suman dos años. Tampoco se cree a ninguno
// de los dos: con el id se le pregunta a Stripe, con nuestra clave, si la
// sesión está pagada.
//
// Las cuentas de pago son las de HELM, no las de Stripe que cada perfil conecta
// para sus ventas: la de HELM (HELM_CREDITOS_STRIPE_KEY y su webhook) y,
// mientras no esté, la compartida de siempre (HELM_STRIPE_SECRET_KEY). Cada
// pago lleva su factura (la hace Stripe) con el IVA DENTRO del precio: con
// HELM_CREDITOS_STRIPE_TAX=1 lo calcula Stripe Tax; con
// HELM_CREDITOS_TAX_RATE=txr_… se aplica ese tipo fijo (el 21 %, inclusivo).
// El precio, en HELM_LICENCIA_EUR (97 por defecto).
//
// Una sesión de CRÉDITOS abierta antes del cambio que se pague después se
// sigue apuntando como recarga (sumarSaldo) para que el pago no se pierda: hay
// que devolverlo a mano.
import crypto from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, validateAuth, requireSuperAdmin, writeAudit } from './_lib/auth.js'
import { requireProfileAccess, puedeVerSaldo, agenciaDe } from './_lib/access.js'
import { sumarSaldo, preciosDelPerfil } from './_lib/creditos.js'
import { licenciaDe, extenderLicencia, precioLicencia, MESES_LICENCIA } from './_lib/licencia.js'
import { estadoClaves, guardarClavesAgencia } from './_lib/claves-agencia.js'
import { verificarClave, modeloValido, MODELO_POR_DEFECTO, MODELOS_CLAUDE } from './_lib/anthropic.js'
import { olvidarProveedor } from './_lib/llm.js'

const STRIPE = 'https://api.stripe.com/v1'
// Los modelos de Claude que se pueden elegir para la clave de la agencia.
const CATALOGO = MODELOS_CLAUDE.map(({ id, label, desc }) => ({ id, label, desc }))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const claveNueva = () => process.env.HELM_CREDITOS_STRIPE_KEY || ''
const claveCompartida = () => process.env.HELM_STRIPE_SECRET_KEY || ''
// Con la que se abren las sesiones nuevas: la de HELM si está; si no, la compartida.
const claveStripe = () => claveNueva() || claveCompartida()
// Los dos secretos valen mientras se pasa de una cuenta a la otra, cada uno con
// la clave de SU cuenta: es ahí donde está la sesión que avisa.
const cuentasWebhook = () => [
  { secreto: process.env.HELM_CREDITOS_STRIPE_WEBHOOK_SECRET, clave: claveNueva() },
  { secreto: process.env.HELM_STRIPE_WEBHOOK_SECRET, clave: claveCompartida() },
].filter(c => c.secreto)
// Marcas de las sesiones de HELM: en la cuenta compartida llegan al webhook
// los pagos de otros negocios, y alguno trae client_reference_id.
const MARCA = 'creditos'
const MARCA_LICENCIA = 'licencia'
const SIN_PAGOS = 'Los pagos todavía no están configurados. Escríbenos y te activamos la licencia a mano.'

/**
 * ¿Es una sesión de créditos de HELM? Las que llevan la marca y, durante la
 * transición, las de antes de la marca (el código anterior al 27-oct solo
 * ponía metadata.agencia_id): se aceptan si esa agencia_id tiene forma de UUID
 * (los otros negocios de la cuenta compartida no la ponen) y, al acreditar, si
 * la agencia existe. Se puede quitar cuando no quede ningún pago de entonces
 * en vuelo (una sesión dura 24 h; un pago SEPA, unos días).
 */
function esDeCreditos(s) {
  const m = s?.metadata || {}
  if (m.helm === MARCA) return true
  return !m.helm && UUID.test(String(m.agencia_id || ''))
}

/** Lo que se añade a la sesión para que salga la factura con el IVA dentro. */
export function camposFactura(env = process.env, descripcion = 'Licencia anual de HELM para una agencia (12 meses).') {
  const f = {
    customer_creation: 'always',
    billing_address_collection: 'required',
    'tax_id_collection[enabled]': 'true',
    'invoice_creation[enabled]': 'true',
    'invoice_creation[invoice_data][description]': descripcion,
    'line_items[0][price_data][tax_behavior]': 'inclusive',
  }
  if (env.HELM_CREDITOS_STRIPE_TAX === '1') f['automatic_tax[enabled]'] = 'true'
  else if (/^txr_[A-Za-z0-9]+$/.test(env.HELM_CREDITOS_TAX_RATE || '')) f['line_items[0][tax_rates][0]'] = env.HELM_CREDITOS_TAX_RATE
  return f
}

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

async function stripe(ruta, { method = 'GET', form, clave = claveStripe() } = {}) {
  if (!clave) throw falla(SIN_PAGOS, 503)
  const r = await fetch(`${STRIPE}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${clave}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = falla(j?.error?.message || `Stripe respondió ${r.status}`, 502)
    // No está en esta cuenta (puede estar en la otra).
    e.noExiste = r.status === 404 || j?.error?.code === 'resource_missing'
    throw e
  }
  return j
}

/** La sesión, preguntando a cada cuenta por orden: la que no la tiene contesta 404. */
async function sesionDeStripe(sessionId, claves) {
  const unicas = [...new Set(claves.filter(Boolean))]
  if (!unicas.length) throw falla(SIN_PAGOS, 503)
  let noEsta = null
  for (const clave of unicas) {
    try {
      return await stripe(`/checkout/sessions/${sessionId}`, { clave })
    } catch (e) {
      if (!e.noExiste) throw e
      noEsta = e
    }
  }
  throw noEsta
}

/** La agencia a la que van los créditos de la sesión, o null si no es de créditos. */
async function agenciaDeSesion(s) {
  if (!esDeCreditos(s)) return null
  const agenciaId = s.metadata?.agencia_id || null
  if (!agenciaId || s.metadata?.helm === MARCA) return agenciaId
  // Una sesión de antes de la marca: solo si la agencia existe.
  const { data, error } = await supabase.from('agencias').select('id').eq('id', agenciaId).maybeSingle()
  if (error) throw error
  return data?.id || null
}

/**
 * Suma los créditos de una sesión de Stripe si está pagada. Idempotente. Solo
 * para sesiones de créditos abiertas antes del 2026-11-08 que se paguen
 * después: el saldo ya no sirve para nada, pero el pago queda apuntado para
 * devolverlo.
 * `claves`: las cuentas donde buscarla, por orden (por defecto, la propia y
 * luego la compartida).
 */
async function acreditarSesion(sessionId, claves = [claveNueva(), claveCompartida()], yaLeida = null) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) throw falla('Sesión de pago inválida')
  const s = yaLeida || await sesionDeStripe(sessionId, claves)
  if (s.payment_status !== 'paid') return { pagado: false }
  // Solo las sesiones que abrió HELM para créditos, con su agencia.
  const agenciaId = await agenciaDeSesion(s)
  if (!agenciaId) return { pagado: false }
  // Lo que se suma es lo que se cobró, no lo que diga el pack que se pidió:
  // el importe del pack (subtotal, con el IVA dentro); si un día el IVA fuera
  // aparte, el total lo llevaría encima y no se convierte en créditos.
  const euros = Number(s.amount_subtotal ?? s.amount_total ?? 0) / 100
  const saldo = await sumarSaldo(agenciaId, euros, { tipo: 'recarga', origen: 'stripe', referencia: s.id })
  return { pagado: true, nuevo: saldo != null, euros }
}

/** ¿Es una sesión de LICENCIA de HELM? */
const esDeLicencia = (s) => s?.metadata?.helm === MARCA_LICENCIA && UUID.test(String(s?.metadata?.agencia_id || ''))

/**
 * Activa la licencia de una sesión de Stripe de licencia, si está pagada.
 * Idempotente: con la misma sesión no suma dos años.
 */
async function activarLicenciaDeSesion(s) {
  if (s.payment_status !== 'paid' || !esDeLicencia(s)) return { pagado: false }
  const agenciaId = s.metadata.agencia_id
  const meses = Math.min(60, Math.max(1, Math.floor(Number(s.metadata.meses) || MESES_LICENCIA)))
  // Lo cobrado de verdad, con el IVA dentro.
  const euros = Number(s.amount_total ?? s.amount_subtotal ?? 0) / 100
  const venceAt = await extenderLicencia(agenciaId, {
    meses, origen: 'stripe', referencia: s.id, euros, nota: 'Pago con Stripe', por: s.customer_details?.email || s.customer_email || '',
  })
  // Con la licencia nueva, la IA de sus perfiles vuelve a resolverse ya.
  olvidarProveedor()
  return { pagado: true, licencia: true, nuevo: venceAt != null, venceAt }
}

/** Una sesión que vuelve de Stripe o avisa por webhook: licencia o, si es de antes, créditos. */
async function procesarSesion(sessionId, claves = [claveNueva(), claveCompartida()]) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) throw falla('Sesión de pago inválida')
  const s = await sesionDeStripe(sessionId, claves)
  if (esDeLicencia(s)) return activarLicenciaDeSesion(s)
  return acreditarSesion(s.id, claves, s)
}

// Stripe firma "t.cuerpo" con el secreto del webhook.
function firmaValida(raw, cabecera, secreto) {
  if (!raw || !cabecera || !secreto) return false
  const partes = Object.fromEntries(String(cabecera).split(',').map(p => p.split('=')))
  if (!partes.t || !partes.v1) return false
  const edad = Date.now() / 1000 - Number(partes.t)
  if (!Number.isFinite(edad) || edad > 300 || edad < -60) return false
  const esperada = crypto.createHmac('sha256', secreto).update(`${partes.t}.${raw.toString()}`).digest('hex')
  const a = Buffer.from(esperada)
  const b = Buffer.from(partes.v1)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** La agencia de la sesión: la suya (admin) o la del perfil (acceso de cliente). */
async function agenciaDeLaSesion(auth) {
  if (auth.agenciaId) return auth.agenciaId
  if (auth.clientId) return agenciaDe(auth.clientId)
  return null
}

/** Quien administra la agencia (o la plataforma, con ?agenciaId=). */
async function adminDeAgencia(req, { sinLicencia = false } = {}) {
  const auth = await requireSuperAdmin(req, { sinLicencia })
  const agenciaId = (auth.plataforma && req.query?.agenciaId) || auth.agenciaId
  if (!agenciaId) throw falla('Tu cuenta no tiene agencia', 403)
  return { auth, agenciaId }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const accion = String(req.query?.action || '')
  try {
    if (accion === 'precio') {
      return res.status(200).json({ euros: precioLicencia(), meses: MESES_LICENCIA })
    }

    if (accion === 'precios') {
      // Lo pregunta la pantalla de un agente antes de lanzar. HELM ya no cobra
      // por trabajo: preciosDelPerfil dice siempre `paga: false`.
      const clientId = String(req.query?.clientId || '')
      if (!clientId) throw falla('Falta el perfil')
      // Un id que no es un UUID no llega a la base (volvería un 500 con su texto).
      if (!UUID.test(clientId)) throw falla('Ese perfil no es válido')
      const auth = await requireProfileAccess(req, clientId)
      const verSaldo = await puedeVerSaldo(auth, clientId)
      return res.status(200).json(await preciosDelPerfil(clientId, { verSaldo }))
    }

    if (accion === 'webhook') {
      // Sin secreto configurado no se procesa nada: cualquiera podría llamar.
      // (Aun con firma buena, la sesión se le vuelve a pedir a Stripe.)
      const cuenta = cuentasWebhook().find(c => firmaValida(req.rawBody, req.headers['stripe-signature'], c.secreto))
      if (!cuenta) return res.status(400).json({ error: 'Firma inválida' })
      const ev = req.body || {}
      // Los pagos de otros negocios de la cuenta compartida se ignoran (con 200,
      // para que Stripe no los reintente). La sesión se pide a la cuenta que
      // avisa (sin su clave, 503: Stripe lo reintenta y queda en el log).
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)
          && (esDeLicencia(ev.data?.object) || esDeCreditos(ev.data?.object))) {
        await procesarSesion(ev.data.object.id, [cuenta.clave])
      }
      return res.status(200).json({ received: true })
    }

    if (accion === 'licencia') {
      // Se puede mirar SIN licencia: es lo que enseña la pantalla de pago.
      const auth = await validateAuth(req, { required: true, sinLicencia: true })
      const agenciaId = (auth.plataforma && req.query?.agenciaId) || await agenciaDeLaSesion(auth)
      if (!agenciaId) {
        // La plataforma sin agencia, o un perfil sin agencia: no necesita licencia.
        return res.status(200).json({ agencia: null, exenta: true, vigente: true, venceAt: null, plataforma: Boolean(auth.plataforma), puedePagar: false, precio: precioLicencia(), pagosActivos: Boolean(claveStripe()) })
      }
      const [{ data: agencia, error }, lic] = await Promise.all([
        supabase.from('agencias').select('id, nombre, slug').eq('id', agenciaId).maybeSingle(),
        licenciaDe(agenciaId, { fresca: true }),
      ])
      if (error) throw error
      const esAdmin = Boolean(auth.superadmin || auth.role === 'superadmin') && (auth.plataforma || auth.agenciaId === agenciaId)
      return res.status(200).json({
        agencia: agencia ? { id: agencia.id, nombre: agencia.nombre, slug: agencia.slug } : null,
        plataforma: Boolean(auth.plataforma),
        exenta: lic.exenta,
        vigente: lic.exenta || lic.vigente,
        venceAt: lic.venceAt,
        precio: precioLicencia(),
        meses: MESES_LICENCIA,
        pagosActivos: Boolean(claveStripe()),
        // Pagar es de quien administra la agencia; un acceso de cliente avisa.
        puedePagar: esAdmin && !lic.exenta,
        esAdmin,
      })
    }

    if (accion === 'claves') {
      const { auth, agenciaId } = await adminDeAgencia(req)
      if (req.method === 'GET') return res.status(200).json({ ...(await estadoClaves(agenciaId)), modelos: CATALOGO, modeloPorDefecto: MODELO_POR_DEFECTO })
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
      const b = req.body || {}
      const borrar = new Set(Array.isArray(b.borrar) ? b.borrar : [])
      const cambios = {}
      if (borrar.has('anthropic')) { cambios.anthropicKey = null; cambios.anthropicModel = null }
      if (borrar.has('replicate')) cambios.replicateToken = null
      const clave = String(b.anthropicKey || '').trim()
      const modelo = String(b.anthropicModel || '').trim()
      if (modelo && !modeloValido(modelo)) throw falla('Ese modelo no está en la lista')
      if (clave) {
        if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(clave)) throw falla('Eso no parece una clave de API de Anthropic (empieza por sk-ant-).')
        // Se comprueba contra Anthropic antes de guardar: una clave que no vale
        // no entra, y así nadie descubre el fallo a mitad de un trabajo.
        try { await verificarClave(clave, modelo || MODELO_POR_DEFECTO) } catch (e) { throw falla(e.message) }
        cambios.anthropicKey = clave
        cambios.anthropicModel = modelo || MODELO_POR_DEFECTO
      } else if (modelo && !borrar.has('anthropic')) {
        cambios.anthropicModel = modelo
      }
      const token = String(b.replicateToken || '').trim()
      if (token) {
        if (!/^r8_[A-Za-z0-9]{20,}$/.test(token)) throw falla('Eso no parece un token de Replicate (empieza por r8_).')
        cambios.replicateToken = token
      }
      if (!Object.keys(cambios).length) throw falla('No hay nada que guardar')
      await guardarClavesAgencia(agenciaId, cambios, auth.email || '')
      olvidarProveedor()
      await writeAudit({
        actor: auth, action: 'agencia.claves', resourceType: 'agencia', resourceId: agenciaId, req,
        // Nunca la clave: solo qué se ha tocado.
        metadata: { anthropic: 'anthropicKey' in cambios ? (cambios.anthropicKey ? 'puesta' : 'quitada') : 'igual', modelo: cambios.anthropicModel, replicate: 'replicateToken' in cambios ? (cambios.replicateToken ? 'puesto' : 'quitado') : 'igual' },
      })
      return res.status(200).json({ ...(await estadoClaves(agenciaId)), modelos: CATALOGO, modeloPorDefecto: MODELO_POR_DEFECTO })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

    if (accion === 'pagar-licencia') {
      // Sin licencia, claro: es para conseguirla. Solo quien administra la agencia.
      const { auth, agenciaId } = await adminDeAgencia(req, { sinLicencia: true })
      const { data: a, error } = await supabase.from('agencias').select('id, sin_cobro').eq('id', agenciaId).maybeSingle()
      if (error) throw error
      if (!a) throw falla('Esa agencia no existe', 404)
      if (a.sin_cobro) throw falla('Esta agencia no necesita licencia')
      const euros = precioLicencia()
      const base = process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net'
      const s = await stripe('/checkout/sessions', {
        method: 'POST',
        form: {
          mode: 'payment',
          client_reference_id: agenciaId,
          'metadata[agencia_id]': agenciaId,
          'metadata[helm]': MARCA_LICENCIA,
          'metadata[meses]': String(MESES_LICENCIA),
          locale: 'es',
          // La factura, solo desde la cuenta de HELM: con la compartida saldría
          // a nombre del otro negocio (y con su comisión de facturación).
          ...(claveNueva() ? camposFactura() : {}),
          ...(auth.email ? { customer_email: auth.email } : {}),
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]': 'eur',
          'line_items[0][price_data][unit_amount]': String(Math.round(euros * 100)),
          'line_items[0][price_data][product_data][name]': 'HELM · Licencia anual de agencia',
          success_url: `${base}/admin?licencia=ok&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/admin?licencia=cancelado`,
        },
      })
      return res.status(200).json({ url: s.url })
    }

    if (accion === 'confirmar') {
      // Al volver de Stripe, aún sin licencia: se puede llamar sin ella.
      await validateAuth(req, { required: true, sinLicencia: true })
      return res.status(200).json(await procesarSesion(req.body?.sessionId))
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[creditos]', e)
    return res.status(code).json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) })
  }
}
