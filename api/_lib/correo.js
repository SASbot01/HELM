// HELM — correo saliente (opcional). Si hay RESEND_API_KEY y CORREO_DESDE en el
// entorno, manda por Resend; si no, no hace nada y lo dice. Quien llama no debe
// depender de que salga: el acceso se da igual, el correo es solo el aviso
// automático. Nunca lanza.
export function hayCorreo() {
  return Boolean(process.env.RESEND_API_KEY && process.env.CORREO_DESDE)
}

export async function enviarCorreo({ para, asunto, html, texto }) {
  if (!hayCorreo()) return { enviado: false, motivo: 'sin-config' }
  if (!para) return { enviado: false, motivo: 'sin-destinatario' }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.CORREO_DESDE, to: para, subject: asunto, html, text: texto }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      console.warn('[correo] resend', r.status, t.slice(0, 200))
      return { enviado: false, motivo: `http-${r.status}` }
    }
    return { enviado: true }
  } catch (err) {
    console.warn('[correo]', err.message)
    return { enviado: false, motivo: 'error' }
  }
}
