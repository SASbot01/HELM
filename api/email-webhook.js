// HELM — Webhook de Resend para Email marketing (público: lo llama Resend).
//
//   POST ?perfil=<clientId> → un aviso (email.delivered, email.bounced,
//                             email.complained). Se comprueba su firma Svix con
//                             el secreto de ESE perfil y se aplica (ver
//                             api/_lib/email/webhook.js).
//
// En Resend: Webhooks → Add endpoint, con la URL que enseña Email marketing →
// Ajustes y esos tres eventos. El «Signing secret» (whsec_…) se pega en la
// misma pantalla. Sin secreto guardado, el perfil no acepta avisos.
import { credencialesDe } from './_lib/email/config.js'
import { firmaSvixValida, procesaEvento } from './_lib/email/webhook.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cuerpoCrudo(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const clientId = String(req.query?.perfil || '')
  if (!UUID.test(clientId)) return res.status(400).json({ error: 'Falta el perfil' })
  try {
    const cred = await credencialesDe(clientId)
    const crudo = cuerpoCrudo(req)
    const h = req.headers || {}
    if (!cred?.webhookSecret || !firmaSvixValida({
      secreto: cred.webhookSecret, id: h['svix-id'], timestamp: h['svix-timestamp'], firma: h['svix-signature'], cuerpo: crudo,
    })) {
      return res.status(401).json({ error: 'Firma no válida' })
    }
    let evento
    try { evento = JSON.parse(crudo.toString('utf8')) } catch { return res.status(400).json({ error: 'JSON no válido' }) }
    const r = await procesaEvento(clientId, evento)
    return res.status(200).json({ ok: true, ...r })
  } catch (err) {
    // Un 5xx hace que Resend lo reintente más tarde, que es lo que se quiere.
    console.error('[email-webhook]', err?.message || err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
