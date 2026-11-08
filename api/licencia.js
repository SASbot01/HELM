// HELM — la licencia de la agencia (97 €/año) y su clave de Claude.
//
//   GET  ?action=estado [&agenciaId=]   → cualquiera con sesión, AUNQUE no haya
//                                         licencia (es lo que mira el panel para
//                                         saber si abre la pantalla de pago).
//                                         Quien administra la agencia ve todo
//                                         (licencias, clave de Claude); el resto
//                                         del equipo, solo si vale. La
//                                         plataforma puede mirar cualquiera.
//   POST ?action=pagar                  → (admin) { url } del pago en Stripe
//   POST ?action=confirmar { sessionId } → (admin) al volver de Stripe
//   POST ?action=webhook                → Stripe avisa de un pago
//   POST ?action=clave { apiKey, model } → (admin, con licencia) guarda la clave
//                                          de Claude de la agencia, comprobada
//   POST ?action=quitar-clave           → (admin, con licencia) la quita
//
// El pago es el de los créditos de antes (el Stripe solo de HELM:
// HELM_CREDITOS_STRIPE_KEY y su webhook), con factura e IVA dentro del precio.
// El webhook sigue registrado en Stripe como /api/creditos?action=webhook:
// api/creditos.js es este mismo archivo.
//
// Un pago activa UNA licencia: se apunta con el id de la sesión de Stripe como
// referencia única (activar_licencia, migración 125), y la vuelta del navegador
// y el webhook pueden llegar los dos sin dar dos años. A ninguno de los dos se
// le cree: con el id se le pregunta a Stripe, con nuestra clave, si está pagada.
import crypto from 'node:crypto'
import { applyCors, requireSuperAdmin, validateAuth, writeAudit } from './_lib/auth.js'
import {
  precioLicencia, MESES_LICENCIA, estadoAgencia, licenciaValida, activarLicencia, licenciasDe,
  guardarClaveAgencia, quitarClaveAgencia, agenciaDelPerfil, claveHelm,
} from './_lib/licencia.js'
import { supabase } from './lib/supabase.js'
import { verificarClave, modeloValido, MODELO_POR_DEFECTO, MODELOS_CLAUDE } from './_lib/anthropic.js'
import { olvidarProveedor } from './_lib/llm.js'

const STRIPE = 'https://api.stripe.com/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIA = 86_400_000
// La cuenta de Stripe solo de HELM (la de los créditos). La compartida
// (HELM_STRIPE_SECRET_KEY) es de los cobros de los perfiles y no se usa aquí.
const claveStripe = () => process.env.HELM_CREDITOS_STRIPE_KEY || ''
// Los dos secretos de webhook valen, cada uno con la clave de SU cuenta: si la
// cuenta compartida aún avisa aquí, sus pagos (que no son de licencias) se
// contestan con 200 y no se tocan.
const cuentasWebhook = () => [
  { secreto: process.env.HELM_CREDITOS_STRIPE_WEBHOOK_SECRET, clave: claveStripe() },
  { secreto: process.env.HELM_STRIPE_WEBHOOK_SECRET, clave: process.env.HELM_STRIPE_SECRET_KEY || '' },
].filter(c => c.secreto)
// Marca de las sesiones de licencia: en una cuenta llegan al webhook otros pagos.
const MARCA = 'licencia'
const SIN_PAGOS = 'Los pagos todavía no están configurados. Escríbenos y te activamos la licencia a mano.'

/** Lo que se añade a la sesión para que salga la factura con el IVA dentro. */
export function camposFactura(env = process.env) {
  const f = {
    customer_creation: 'always',
    billing_address_collection: 'required',
    'tax_id_collection[enabled]': 'true',
    'invoice_creation[enabled]': 'true',
    'invoice_creation[invoice_data][description]': 'Licencia anual de HELM para la agencia (12 meses).',
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
  if (!r.ok) throw falla(j?.error?.message || `Stripe respondió ${r.status}`, 502)
  return j
}

/**
 * Activa la licencia de una sesión de Stripe si está pagada y es de licencia.
 * Idempotente. Devuelve { pagado, agenciaId?, venceAt?, nueva? }.
 */
async function activarSesion(sessionId, clave = claveStripe()) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) throw falla('Sesión de pago inválida')
  const s = await stripe(`/checkout/sessions/${sessionId}`, { clave })
  if (s.payment_status !== 'paid' || s.metadata?.helm !== MARCA) return { pagado: false }
  const agenciaId = String(s.metadata?.agencia_id || '')
  if (!UUID.test(agenciaId)) return { pagado: false }
  const r = await activarLicencia({
    agenciaId, referencia: s.id,
    importe: Number(s.amount_total ?? s.amount_subtotal ?? 0) / 100,
    pagadaAt: new Date(),
    email: s.customer_details?.email || s.customer_email || null,
  })
  return { pagado: true, agenciaId, venceAt: r.venceAt, nueva: r.nueva }
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

const diasHasta = (iso) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / DIA)) : 0)

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const accion = String(req.query?.action || '')
  try {
    if (accion === 'webhook') {
      // Sin secreto configurado no se procesa nada: cualquiera podría llamar.
      // (Aun con firma buena, el pago se le vuelve a preguntar a Stripe.)
      const cuenta = cuentasWebhook().find(c => firmaValida(req.rawBody, req.headers['stripe-signature'], c.secreto))
      if (!cuenta) return res.status(400).json({ error: 'Firma inválida' })
      const ev = req.body || {}
      // Lo que no es una licencia (otros pagos de la cuenta) se contesta con 200
      // para que Stripe no lo reintente. Sin la clave de la cuenta que avisa,
      // 503: Stripe lo reintenta y queda en el log.
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)
          && ev.data?.object?.metadata?.helm === MARCA) {
        if (!cuenta.clave) throw falla(SIN_PAGOS, 503)
        await activarSesion(ev.data.object.id, cuenta.clave)
      }
      return res.status(200).json({ received: true })
    }

    if (accion === 'estado') {
      // Sin exigir licencia: es justo lo que se mira para saber si la hay.
      const auth = await validateAuth(req, { required: true, licencia: false })
      const administra = auth.superadmin === true || auth.role === 'superadmin'
      const otra = auth.plataforma && UUID.test(String(req.query?.agenciaId || '')) ? req.query.agenciaId : null
      const agenciaId = otra || auth.agenciaId || (auth.clientId ? await agenciaDelPerfil(auth.clientId) : null)
      if (!agenciaId) {
        // Una cuenta sin agencia: la plataforma ve todo; el resto no tiene nada que pagar aquí.
        return res.status(200).json({ agencia: null, plataforma: Boolean(auth.plataforma), administra, licencia: { valida: true } })
      }
      const estado = await estadoAgencia(agenciaId, { fresca: true })
      // La plataforma entra siempre (en su propia agencia, vale); mirando otra,
      // ve la licencia de esa tal cual.
      const valida = auth.plataforma && !otra ? true : !estado.existe || licenciaValida(estado)
      // El equipo de un perfil solo necesita saber si puede entrar.
      if (!administra) return res.status(200).json({ administra: false, licencia: { valida } })

      const [{ data: agencia, error }, historial] = await Promise.all([
        supabase.from('agencias').select('id, nombre, slug, sin_cobro').eq('id', agenciaId).maybeSingle(),
        licenciasDe(agenciaId).catch(() => []),
      ])
      if (error) throw error
      if (!agencia) throw falla('Esa agencia no existe', 404)
      return res.status(200).json({
        agencia: { id: agencia.id, nombre: agencia.nombre, slug: agencia.slug, sinCobro: agencia.sin_cobro },
        plataforma: Boolean(auth.plataforma),
        administra: true,
        licencia: {
          valida,
          sinCobro: Boolean(estado.sinCobro),
          venceAt: estado.venceAt,
          dias: diasHasta(estado.venceAt),
          precio: precioLicencia(),
          meses: MESES_LICENCIA,
          pagosActivos: Boolean(claveStripe()),
          historial,
        },
        ia: {
          clave: Boolean(estado.clave),
          last4: estado.clave?.last4 || null,
          model: estado.clave?.model || null,
          // La de la casa sin clave propia trabaja con la de HELM.
          deHelm: Boolean(estado.sinCobro && !estado.clave && claveHelm()),
          modelos: MODELOS_CLAUDE.map(m => ({ id: m.id, label: m.label, desc: m.desc })),
          porDefecto: MODELO_POR_DEFECTO,
        },
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

    if (accion === 'pagar' || accion === 'confirmar') {
      // Pagar es justo lo que se hace sin licencia.
      const auth = await requireSuperAdmin(req, { licencia: false })
      const agenciaId = auth.agenciaId
      if (!agenciaId) throw falla('Tu cuenta no tiene agencia', 403)

      if (accion === 'confirmar') {
        const r = await activarSesion(req.body?.sessionId)
        // De otra agencia (un enlace reenviado): se activa la suya, pero aquí no se cuenta nada.
        if (r.pagado && r.agenciaId !== agenciaId) return res.status(200).json({ pagado: false })
        if (r.pagado && r.nueva) {
          await writeAudit({ actor: auth, action: 'licencia.pagada', resourceType: 'agencia', resourceId: agenciaId, req, metadata: { venceAt: r.venceAt } })
        }
        return res.status(200).json({ pagado: r.pagado, venceAt: r.venceAt || null })
      }

      const estado = await estadoAgencia(agenciaId, { fresca: true })
      if (estado.sinCobro) throw falla('La agencia de la casa no paga licencia.')
      const base = process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net'
      const precio = precioLicencia()
      const s = await stripe('/checkout/sessions', {
        method: 'POST',
        form: {
          mode: 'payment',
          client_reference_id: agenciaId,
          'metadata[agencia_id]': agenciaId,
          'metadata[helm]': MARCA,
          locale: 'es',
          ...camposFactura(),
          ...(auth.email ? { customer_email: auth.email } : {}),
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]': 'eur',
          'line_items[0][price_data][unit_amount]': String(Math.round(precio * 100)),
          'line_items[0][price_data][product_data][name]': 'HELM · Licencia anual de agencia',
          'line_items[0][price_data][product_data][description]': '12 meses de HELM para tu agencia. La IA la pones tú: tu clave de Claude o tu cuenta de Claude.',
          success_url: `${base}/admin?licencia=ok&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/admin?licencia=cancelado`,
        },
      })
      return res.status(200).json({ url: s.url })
    }

    if (accion === 'clave' || accion === 'quitar-clave') {
      const auth = await requireSuperAdmin(req)
      const agenciaId = auth.agenciaId
      if (!agenciaId) throw falla('Tu cuenta no tiene agencia', 403)

      if (accion === 'quitar-clave') {
        await quitarClaveAgencia(agenciaId)
        olvidarProveedor()
        await writeAudit({ actor: auth, action: 'agencia.clave-claude.quitada', resourceType: 'agencia', resourceId: agenciaId, req })
        return res.status(200).json({ clave: false })
      }

      const apiKey = String(req.body?.apiKey || '').trim()
      const model = modeloValido(req.body?.model) ? req.body.model : MODELO_POR_DEFECTO
      if (!apiKey) throw falla('Falta la clave de Claude')
      // Si no vale, no se guarda: así nadie descubre el fallo a mitad de un
      // trabajo. Con 400: el 401 de Anthropic haría que el panel cerrara la sesión.
      try { await verificarClave(apiKey, model) } catch (err) { throw falla(err.message, 400) }
      await guardarClaveAgencia(agenciaId, { apiKey, model, por: auth.email || '' })
      olvidarProveedor()
      await writeAudit({ actor: auth, action: 'agencia.clave-claude', resourceType: 'agencia', resourceId: agenciaId, req, metadata: { model, last4: apiKey.slice(-4) } })
      return res.status(200).json({ clave: true, last4: apiKey.slice(-4), model })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[licencia]', e)
    return res.status(code).json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) })
  }
}
