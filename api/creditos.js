// HELM — créditos de la agencia.
//
//   GET  ?action=packs                       → público: { packs, bienvenida }
//   GET  ?action=saldo [&agenciaId=]         → (admin) saldo y movimientos de SU
//                                               agencia (la plataforma, de cualquiera)
//   POST ?action=comprar  { pack }           → (admin) { url } de pago en Stripe
//   POST ?action=confirmar { sessionId }     → (admin) al volver de Stripe
//   POST ?action=bienvenida                  → (admin) los créditos de regalo,
//                                               una sola vez por agencia: se dan
//                                               al cerrar la oferta de compra
//                                               que sale al entrar por primera vez
//   POST ?action=webhook                     → Stripe avisa de un pago
//   POST ?action=ajuste { agenciaId, euros } → (plataforma) sumar o quitar a mano
//   GET  ?action=agencias                    → (plataforma) todas, con saldo
//   GET  ?action=precios &clientId=          → (quien entre al perfil, también un
//                                               acceso de cliente) lo que cuesta cada
//                                               trabajo a precio fijo y si ese perfil
//                                               paga: { paga, saldo, precios }, con
//                                               saldo y precios en EUROS (en pantalla,
//                                               ×100 = créditos; ver src/helm/precios.js)
//
// Las cuentas de pago son las de HELM, no las de Stripe que cada perfil conecta
// para sus ventas. Desde el 27-oct-2026 los créditos van a una cuenta de Stripe
// SOLO de HELM (HELM_CREDITOS_STRIPE_KEY y su webhook); mientras no esté, la
// compartida de siempre (HELM_STRIPE_SECRET_KEY, que también usan los cobros
// automáticos de los perfiles: por eso no se reutiliza para la nueva).
//
// Cada pago lleva su factura (la hace Stripe y la manda por correo) con el IVA
// DENTRO del precio del pack: con HELM_CREDITOS_STRIPE_TAX=1 lo calcula Stripe
// Tax (hay que activarlo en la cuenta antes, o Stripe rechaza la sesión); con
// HELM_CREDITOS_TAX_RATE=txr_… se aplica ese tipo fijo (el 21 %, inclusivo).
//
// Un pago se suma UNA vez: se apunta con el id de la sesión de Stripe como
// referencia única, y la vuelta del navegador y el webhook pueden llegar los
// dos sin duplicar. Tampoco se cree a ninguno de los dos: con el id se le
// pregunta a Stripe, con nuestra clave, si la sesión está pagada y de cuánto.
import crypto from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, requireSuperAdmin, requirePlataforma, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { PACKS, CREDITOS_POR_EURO, BIENVENIDA_EUROS, PRECIOS_FIJOS, sumarSaldo, quienPagaPerfil } from './_lib/creditos.js'

const STRIPE = 'https://api.stripe.com/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const claveStripe = () => process.env.HELM_CREDITOS_STRIPE_KEY || process.env.HELM_STRIPE_SECRET_KEY || ''
// Los dos secretos valen mientras se pasa de una cuenta a la otra.
const secretosWebhook = () => [process.env.HELM_CREDITOS_STRIPE_WEBHOOK_SECRET, process.env.HELM_STRIPE_WEBHOOK_SECRET].filter(Boolean)
// Marca de las sesiones de créditos: en la cuenta compartida llegan al webhook
// los pagos de otros negocios, y alguno trae client_reference_id.
const MARCA = 'creditos'

/** Lo que se añade a la sesión para que salga la factura con el IVA dentro. */
export function camposFactura(env = process.env) {
  const f = {
    customer_creation: 'always',
    billing_address_collection: 'required',
    'tax_id_collection[enabled]': 'true',
    'invoice_creation[enabled]': 'true',
    'invoice_creation[invoice_data][description]': 'Créditos de HELM para usar los agentes (editor de reels, portadas, estudios…).',
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

async function stripe(ruta, { method = 'GET', form } = {}) {
  if (!claveStripe()) throw falla('Los pagos todavía no están configurados. Escríbenos y te cargamos los créditos a mano.', 503)
  const r = await fetch(`${STRIPE}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${claveStripe()}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw falla(j?.error?.message || `Stripe respondió ${r.status}`, 502)
  return j
}

/** Suma los créditos de una sesión de Stripe si está pagada. Idempotente. */
async function acreditarSesion(sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) throw falla('Sesión de pago inválida')
  const s = await stripe(`/checkout/sessions/${sessionId}`)
  // Solo las sesiones que abrió HELM para créditos, con su agencia.
  const agenciaId = s.metadata?.helm === MARCA ? s.metadata?.agencia_id : null
  if (s.payment_status !== 'paid' || !agenciaId) return { pagado: false }
  // Lo que se suma es lo que se cobró, no lo que diga el pack que se pidió:
  // el importe del pack (subtotal, con el IVA dentro); si un día el IVA fuera
  // aparte, el total lo llevaría encima y no se convierte en créditos.
  const euros = Number(s.amount_subtotal ?? s.amount_total ?? 0) / 100
  const saldo = await sumarSaldo(agenciaId, euros, { tipo: 'recarga', origen: 'stripe', referencia: s.id })
  return { pagado: true, nuevo: saldo != null, euros }
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

const aCreditos = (euros) => Math.floor(Number(euros || 0) * CREDITOS_POR_EURO)

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const accion = String(req.query?.action || '')
  try {
    if (accion === 'packs') {
      return res.status(200).json({ packs: PACKS, bienvenida: aCreditos(BIENVENIDA_EUROS) })
    }

    if (accion === 'precios') {
      // Lo pregunta la pantalla de un agente antes de lanzar: va por el perfil
      // (como el resto de agentes), no por ser administrador de la agencia.
      const clientId = String(req.query?.clientId || '')
      if (!clientId) throw falla('Falta el perfil')
      // Un id que no es un UUID no llega a la base (volvería un 500 con su texto).
      if (!UUID.test(clientId)) throw falla('Ese perfil no es válido')
      await requireProfileAccess(req, clientId)
      const p = await quienPagaPerfil(clientId)
      return res.status(200).json({ paga: Boolean(p), saldo: p ? p.saldo : null, precios: PRECIOS_FIJOS })
    }

    if (accion === 'webhook') {
      // Sin secreto configurado no se procesa nada: cualquiera podría llamar.
      // (Aun con firma buena, el importe se le vuelve a pedir a Stripe.)
      if (!secretosWebhook().some(sec => firmaValida(req.rawBody, req.headers['stripe-signature'], sec))) {
        return res.status(400).json({ error: 'Firma inválida' })
      }
      const ev = req.body || {}
      // Los pagos de otros negocios de la cuenta compartida se ignoran (con 200,
      // para que Stripe no los reintente).
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)
          && ev.data?.object?.metadata?.helm === MARCA) {
        await acreditarSesion(ev.data.object.id)
      }
      return res.status(200).json({ received: true })
    }

    if (accion === 'agencias') {
      await requirePlataforma(req)
      const { data, error } = await supabase.from('agencias')
        .select('id, nombre, slug, saldo, sin_cobro, created_at').order('created_at')
      if (error) throw error
      return res.status(200).json({ agencias: (data || []).map(a => ({ ...a, creditos: aCreditos(a.saldo) })) })
    }

    if (accion === 'ajuste') {
      const auth = await requirePlataforma(req)
      const { agenciaId, euros, nota } = req.body || {}
      const n = Number(euros)
      if (!agenciaId || !Number.isFinite(n) || !n) throw falla('Faltan la agencia o el importe')
      const saldo = await sumarSaldo(agenciaId, n, { tipo: 'ajuste', origen: 'manual' })
      await writeAudit({ actor: auth, action: 'creditos.ajuste', resourceType: 'agencia', resourceId: agenciaId, req, metadata: { euros: n, nota } })
      return res.status(200).json({ saldo, creditos: aCreditos(saldo) })
    }

    const auth = await requireSuperAdmin(req)
    // La plataforma puede mirar cualquier agencia; el resto, la suya.
    const agenciaId = (auth.plataforma && req.query?.agenciaId) || auth.agenciaId
    if (!agenciaId) throw falla('Tu cuenta no tiene agencia', 403)

    if (accion === 'saldo') {
      const [{ data: agencia, error: e1 }, { data: movs, error: e2 }, { data: regalo, error: e3 }] = await Promise.all([
        supabase.from('agencias').select('id, nombre, slug, saldo, sin_cobro').eq('id', agenciaId).maybeSingle(),
        supabase.from('agencia_movimientos')
          .select('id, tipo, importe, origen, modelo, tokens_in, tokens_out, client_id, created_at, clients(name)')
          .eq('agencia_id', agenciaId).order('created_at', { ascending: false }).limit(100),
        supabase.from('agencia_movimientos').select('id').eq('referencia', `bienvenida:${agenciaId}`).maybeSingle(),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3
      if (!agencia) throw falla('Esa agencia no existe', 404)
      return res.status(200).json({
        agencia: { id: agencia.id, nombre: agencia.nombre, slug: agencia.slug, sinCobro: agencia.sin_cobro },
        plataforma: Boolean(auth.plataforma),
        saldo: Number(agencia.saldo),
        creditos: aCreditos(agencia.saldo),
        pagosActivos: Boolean(claveStripe()),
        packs: PACKS,
        // La oferta de bienvenida sale mientras no se haya cobrado el regalo.
        bienvenida: {
          pendiente: !agencia.sin_cobro && BIENVENIDA_EUROS > 0 && !regalo,
          creditos: aCreditos(BIENVENIDA_EUROS),
        },
        movimientos: (movs || []).map(m => ({
          id: m.id, tipo: m.tipo, origen: m.origen, modelo: m.modelo,
          creditos: Math.round(Number(m.importe) * CREDITOS_POR_EURO * 100) / 100,
          tokens: (m.tokens_in || 0) + (m.tokens_out || 0),
          perfil: m.clients?.name || null, fecha: m.created_at,
        })),
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

    if (accion === 'comprar') {
      const pack = PACKS.find(p => p.id === req.body?.pack)
      if (!pack) throw falla('Ese pack no existe')
      const base = process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net'
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
          'line_items[0][price_data][unit_amount]': String(pack.euros * 100),
          'line_items[0][price_data][product_data][name]': `HELM · ${pack.creditos.toLocaleString('es-ES')} créditos`,
          success_url: `${base}/admin?creditos=ok&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/admin?creditos=cancelado`,
        },
      })
      return res.status(200).json({ url: s.url })
    }

    if (accion === 'confirmar') {
      const r = await acreditarSesion(req.body?.sessionId)
      return res.status(200).json(r)
    }

    if (accion === 'bienvenida') {
      // Siempre a la agencia de quien lo pide: la plataforma no cobra regalos ajenos.
      const suya = auth.agenciaId
      if (!suya) throw falla('Tu cuenta no tiene agencia', 403)
      const { data: a } = await supabase.from('agencias').select('sin_cobro').eq('id', suya).maybeSingle()
      if (!a || a.sin_cobro || BIENVENIDA_EUROS <= 0) return res.status(200).json({ nuevo: false, creditos: 0 })
      // La referencia es única: dos clics (o dos pestañas) no regalan dos veces.
      const saldo = await sumarSaldo(suya, BIENVENIDA_EUROS, { tipo: 'regalo', origen: 'registro', referencia: `bienvenida:${suya}` })
      return res.status(200).json({ nuevo: saldo != null, creditos: aCreditos(BIENVENIDA_EUROS), saldo: saldo != null ? aCreditos(saldo) : null })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[creditos]', e)
    return res.status(code).json({ error: e.message })
  }
}
