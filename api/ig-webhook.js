// HELM — Webhook de Instagram: por aquí avisa Meta de cada DM que llega a una
// cuenta conectada con el setter (api/_lib/setter-ig.js).
//
//   GET  → la verificación de Meta al dar de alta el webhook: devuelve
//          hub.challenge si hub.verify_token coincide con IG_WEBHOOK_VERIFY_TOKEN.
//   POST → un lote de eventos. Se comprueba la firma (X-Hub-Signature-256,
//          HMAC-SHA256 del cuerpo tal cual con IG_APP_SECRET), se contesta 200
//          al momento y se procesa después: Meta reintenta si tardamos y
//          desactiva el webhook si falla mucho.
//
// En el panel de la app de Meta: Instagram → Webhooks → URL de devolución de
// llamada https://helm.s4sf.net/api/ig-webhook, el mismo token de verificación
// y el campo «messages» suscrito. Ver docs/setter-instagram.md.
import crypto from 'node:crypto'
import { procesarWebhook, arrancaBarrido } from './_lib/setter-ig.js'

function cuerpoCrudo(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  return null
}

function firmaValida(crudo, cabecera) {
  const secreto = process.env.IG_APP_SECRET
  if (!secreto || !crudo || !cabecera) return false
  const [algo, firma] = String(cabecera).split('=')
  if (algo !== 'sha256' || !/^[0-9a-f]{64}$/i.test(firma || '')) return false
  const esperada = crypto.createHmac('sha256', secreto).update(crudo).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(esperada, 'hex'), Buffer.from(firma, 'hex'))
}

export default async function handler(req, res) {
  arrancaBarrido()

  if (req.method === 'GET') {
    const token = process.env.IG_WEBHOOK_VERIFY_TOKEN
    const q = req.query || {}
    if (token && q['hub.mode'] === 'subscribe' && String(q['hub.verify_token'] || '') === token) {
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send(String(q['hub.challenge'] || ''))
    }
    return res.status(403).json({ error: 'Verificación no válida' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const crudo = cuerpoCrudo(req)
  if (!firmaValida(crudo, req.headers['x-hub-signature-256'])) {
    return res.status(401).json({ error: 'Firma no válida' })
  }
  let cuerpo
  try { cuerpo = JSON.parse(crudo.toString('utf8')) } catch { return res.status(400).json({ error: 'JSON no válido' }) }

  res.status(200).json({ ok: true })
  // Ya contestado: lo que tarde esto no lo nota Meta. Este servidor es un
  // proceso persistente (scripts/api-server.mjs), así que la promesa termina.
  procesarWebhook(cuerpo).catch(err => console.error('[ig-webhook]', err?.message || err))
  return undefined
}
