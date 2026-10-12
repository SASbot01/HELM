// HELM — créditos de la agencia.
//
//   GET  ?action=packs                       → público: { packs, bienvenida }
//   GET  ?action=saldo [&agenciaId=]         → (admin) saldo y movimientos de SU
//                                               agencia (la plataforma, de cualquiera)
//   POST ?action=comprar  { pack }           → (admin) { url } de pago en Stripe
//   POST ?action=confirmar { sessionId }     → (admin) al volver de Stripe
//   POST ?action=webhook                     → Stripe avisa de un pago
//   POST ?action=ajuste { agenciaId, euros } → (plataforma) sumar o quitar a mano
//   GET  ?action=agencias                    → (plataforma) todas, con saldo
//
// Las cuentas de pago son las de HELM (HELM_STRIPE_SECRET_KEY), no las de
// Stripe que cada perfil conecta para sus ventas.
//
// Un pago se suma UNA vez: se apunta con el id de la sesión de Stripe como
// referencia única, y la vuelta del navegador y el webhook pueden llegar los
// dos sin duplicar. Tampoco se cree a ninguno de los dos: con el id se le
// pregunta a Stripe, con nuestra clave, si la sesión está pagada y de cuánto.
import crypto from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, requireSuperAdmin, requirePlataforma, writeAudit } from './_lib/auth.js'
import { PACKS, CREDITOS_POR_EURO, BIENVENIDA_EUROS, sumarSaldo } from './_lib/creditos.js'

const STRIPE = 'https://api.stripe.com/v1'
const claveStripe = () => process.env.HELM_STRIPE_SECRET_KEY || ''

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
  const agenciaId = s.metadata?.agencia_id || s.client_reference_id
  if (s.payment_status !== 'paid' || !agenciaId) return { pagado: false }
  // Lo que se suma es lo que se cobró, no lo que diga el pack que se pidió.
  const euros = Number(s.amount_total || 0) / 100
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

    if (accion === 'webhook') {
      // Sin secreto configurado no se procesa nada: cualquiera podría llamar.
      // (Aun con firma buena, el importe se le vuelve a pedir a Stripe.)
      if (!firmaValida(req.rawBody, req.headers['stripe-signature'], process.env.HELM_STRIPE_WEBHOOK_SECRET)) {
        return res.status(400).json({ error: 'Firma inválida' })
      }
      const ev = req.body || {}
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
        await acreditarSesion(ev.data?.object?.id)
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
      const [{ data: agencia, error: e1 }, { data: movs, error: e2 }] = await Promise.all([
        supabase.from('agencias').select('id, nombre, slug, saldo, sin_cobro').eq('id', agenciaId).maybeSingle(),
        supabase.from('agencia_movimientos')
          .select('id, tipo, importe, origen, modelo, tokens_in, tokens_out, client_id, created_at, clients(name)')
          .eq('agencia_id', agenciaId).order('created_at', { ascending: false }).limit(100),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (!agencia) throw falla('Esa agencia no existe', 404)
      return res.status(200).json({
        agencia: { id: agencia.id, nombre: agencia.nombre, slug: agencia.slug, sinCobro: agencia.sin_cobro },
        plataforma: Boolean(auth.plataforma),
        saldo: Number(agencia.saldo),
        creditos: aCreditos(agencia.saldo),
        pagosActivos: Boolean(claveStripe()),
        packs: PACKS,
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

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[creditos]', e)
    return res.status(code).json({ error: e.message })
  }
}
