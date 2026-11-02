// HELM — Darse de baja de los correos de un negocio (público, sin sesión).
//
//   GET  ?t=<token>  → una página pequeña: «¿No quieres recibir más correos de
//                      X?» con un botón. No da de baja: los antivirus de
//                      empresa y las vistas previas abren los enlaces de los
//                      correos solos, y darían de baja a quien no lo ha pedido.
//   POST ?t=<token>  → la baja. Es lo que manda el botón y también la baja de
//                      un clic de Gmail y Yahoo (List-Unsubscribe-Post:
//                      List-Unsubscribe=One-Click, RFC 8058), que llega sin
//                      cookies ni página. Repetirla no hace nada nuevo.
//
// El token (api/_lib/email/baja.js) va firmado: dice el perfil y el correo, y
// cambiar cualquiera de los dos lo invalida.
import { supabase } from './lib/supabase.js'
import { rateLimit, getClientIp } from './_lib/auth.js'
import { leeTokenBaja } from './_lib/email/baja.js'
import { registrarBaja, estaDeBaja } from './_lib/email/bajas.js'
import { escapa } from './_lib/email/plantilla.js'

const CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"

function pagina(res, codigo, { titulo, texto, boton = null }) {
  res.statusCode = codigo
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', CSP)
  const form = boton
    ? `<form method="post" action="${escapa(boton.accion)}"><button type="submit">${escapa(boton.texto)}</button></form>`
    : ''
  res.end(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapa(titulo)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5; color: #1f2328;
    font: 16px/1.6 -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 16px; box-sizing: border-box; }
  main { max-width: 440px; width: 100%; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 28px 24px; box-sizing: border-box; }
  h1 { font-size: 20px; line-height: 1.3; margin: 0 0 10px; }
  p { margin: 0 0 18px; color: #4b5563; overflow-wrap: anywhere; }
  button { font: inherit; font-weight: 600; padding: 11px 18px; border-radius: 10px; border: 0; background: #1f2328; color: #fff; cursor: pointer; width: 100%; }
</style></head>
<body><main><h1>${escapa(titulo)}</h1><p>${escapa(texto)}</p>${form}</main></body></html>`)
}

async function nombreDelNegocio(clientId) {
  const { data: a } = await supabase.from('helm_email_ajustes').select('empresa').eq('client_id', clientId).maybeSingle()
  if (a?.empresa) return a.empresa
  const { data: c } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
  return c?.name || 'este negocio'
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // Holgado: la baja de un clic de Gmail llega desde pocas IPs de Google para
  // muchos destinatarios a la vez.
  const gate = rateLimit({ key: `email-baja:${getClientIp(req)}`, max: 300, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return pagina(res, 429, { titulo: 'Un momento', texto: 'Demasiados intentos seguidos. Vuelve a probar en un minuto.' })
  }

  const token = String(req.query?.t || '')
  const quien = leeTokenBaja(token)
  if (!quien) {
    return pagina(res, 400, { titulo: 'Enlace no válido', texto: 'Este enlace de baja no es válido o está incompleto. Ábrelo otra vez desde el pie del correo.' })
  }

  try {
    const negocio = await nombreDelNegocio(quien.clientId)
    if (req.method === 'POST') {
      // La de un clic llega con este cuerpo exacto; el botón de la página, sin él.
      const unClic = String(req.body?.['List-Unsubscribe'] || '') === 'One-Click'
      await registrarBaja({ clientId: quien.clientId, email: quien.email, motivo: 'baja', origen: unClic ? 'un_clic' : 'enlace' })
      return pagina(res, 200, {
        titulo: 'Te has dado de baja',
        texto: `No recibirás más correos de ${negocio} en ${quien.email}. Si ha sido sin querer, escríbeles y te volverán a apuntar.`,
      })
    }
    if (await estaDeBaja(quien.clientId, quien.email)) {
      return pagina(res, 200, { titulo: 'Ya estás de baja', texto: `${quien.email} ya no recibe correos de ${negocio}.` })
    }
    return pagina(res, 200, {
      titulo: `¿Dejar de recibir correos de ${negocio}?`,
      texto: `Pulsa el botón y no se enviarán más correos a ${quien.email}.`,
      boton: { accion: `/api/email-baja?t=${encodeURIComponent(token)}`, texto: 'Darme de baja' },
    })
  } catch (err) {
    console.error('[email-baja]', err?.message || err)
    return pagina(res, 500, { titulo: 'No se ha podido hacer', texto: 'Algo ha fallado de nuestro lado. Vuelve a intentarlo en un rato.' })
  }
}
