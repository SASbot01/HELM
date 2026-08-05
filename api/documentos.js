// HELM — el portal donde el cliente de una asesoría sube su documentación.
//
//   GET  ?action=estado&t=<token>   → qué le falta por entregar
//   POST ?action=subir              → registra un documento ya subido al bucket
//
// El dolor que resuelve: 25 personas persiguiendo facturas por WhatsApp, email
// y teléfono cada trimestre. Aquí el cliente entra por SU enlace, ve qué le
// falta y lo sube. Cuando sube algo, la obligación pasa sola de "pendiente de
// docs" a "en proceso", que es lo que hace que el despacho deje de perseguirle.
//
// Público, como los formularios: lo abre gente de la calle desde su navegador.
// Lo que autentica es el token del enlace, un JWT firmado por HELM que lleva
// dentro el contacto y caduca. Sin token no se ve nada, y un token de un cliente
// no sirve para ver los papeles de otro.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, signJwt, verifyJwt } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'

const txt = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max)

// Un año de validez: la relación con una asesoría dura años y un enlace que
// caduca cada mes obliga a reenviarlo, que es justo el trabajo que queríamos
// quitar. Se puede invalidar cambiando el JWT_SECRET o borrando el contacto.
const DIAS = 365

/** El enlace personal de un cliente. Lo genera el panel, no el propio cliente. */
export const tokenDe = (clientId, contactId) =>
  signJwt({ kind: 'docs', clientId, sub: contactId }, { expiresIn: 60 * 60 * 24 * DIAS })

async function contactoDelToken(token) {
  let p
  try { p = await verifyJwt(String(token || '')) } catch {
    const e = new Error('Este enlace ha caducado o no es válido. Pídele uno nuevo a tu asesoría.')
    e.statusCode = 401; throw e
  }
  if (p.kind !== 'docs') { const e = new Error('Enlace no válido'); e.statusCode = 403; throw e }

  const { data } = await supabase
    .from('crm_contacts').select('id, client_id, name, company')
    .eq('id', p.sub).maybeSingle()
  if (!data || data.client_id !== p.clientId) {
    const e = new Error('Este enlace ya no está activo'); e.statusCode = 403; throw e
  }
  return data
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `documentos:${ip || 'anon'}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter || 60))
    return res.status(429).json({ error: 'Demasiadas peticiones' })
  }

  try {
    const action = req.query.action

    // ── Qué le falta ───────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'estado') {
      const contacto = await contactoDelToken(req.query.t)
      const { data: cliente } = await supabase
        .from('clients').select('name, brand_name, brand_subtitle, logo_url')
        .eq('id', contacto.client_id).maybeSingle()

      // Solo lo que sigue abierto y no ha vencido hace siglos: enseñarle al
      // cliente el 303 del trimestre pasado que ya se presentó solo confunde.
      const hoy = new Date().toISOString().slice(0, 10)
      const { data: pendientes } = await supabase
        .from('helm_fiscal_obligaciones')
        .select('id, modelo, periodo, fecha_limite, estado')
        .eq('contact_id', contacto.id)
        .in('estado', ['pendiente_docs', 'en_proceso'])
        .gte('fecha_limite', hoy)
        .order('fecha_limite').limit(20)

      const { data: subidos } = await supabase
        .from('helm_fiscal_documentos')
        .select('id, nombre, tipo, subido_at')
        .eq('contact_id', contacto.id)
        .order('subido_at', { ascending: false }).limit(30)

      return res.status(200).json({
        // Los ids hacen falta en el navegador para componer la ruta del bucket,
        // que el servidor vuelve a comprobar al registrar: no son un secreto.
        ids: { client: contacto.client_id, contacto: contacto.id },
        cliente: { nombre: contacto.name, empresa: contacto.company || null },
        marca: cliente ? {
          nombre: cliente.brand_name || cliente.name,
          subtitulo: cliente.brand_subtitle || null,
          logo: cliente.logo_url || null,
        } : null,
        pendientes: pendientes || [],
        subidos: subidos || [],
      })
    }

    // ── Registrar lo subido ────────────────────────────────────────────────
    // El fichero viaja del navegador al bucket directamente (con la anon key,
    // como el resto de HELM); aquí solo se anota que existe y se mueve el
    // estado. Pasar megas por esta función sería lento y caro sin ganar nada.
    if (req.method === 'POST' && action === 'subir') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const contacto = await contactoDelToken(body.t)

      const nombre = txt(body.nombre, 200)
      const ruta = txt(body.ruta, 400)
      if (!nombre || !ruta) return res.status(400).json({ error: 'Faltan el nombre y la ruta' })
      // Que nadie use este endpoint para apuntarse ficheros de otra carpeta.
      if (!ruta.startsWith(`fiscal/${contacto.client_id}/${contacto.id}/`)) {
        return res.status(403).json({ error: 'Ruta no permitida' })
      }

      const { data, error } = await supabase.from('helm_fiscal_documentos').insert({
        client_id: contacto.client_id,
        contact_id: contacto.id,
        obligacion_id: txt(body.obligacionId, 64) || null,
        nombre,
        ruta,
        tipo: txt(body.tipo, 40) || 'otro',
        origen: 'portal',
      }).select('id').single()
      if (error) return res.status(500).json({ error: 'No se pudo registrar: ' + error.message })

      // Que el cliente haya entregado algo es la señal de que el despacho puede
      // ponerse: la obligación deja de estar "pendiente de docs" sola. Es el
      // paso que evita la llamada de "¿me lo has mandado ya?".
      if (body.obligacionId) {
        await supabase.from('helm_fiscal_obligaciones')
          .update({ estado: 'en_proceso', updated_at: new Date().toISOString() })
          .eq('id', body.obligacionId).eq('contact_id', contacto.id)
          .eq('estado', 'pendiente_docs')
      }

      return res.status(200).json({ ok: true, id: data.id })
    }

    // ── El enlace de un cliente, para el panel ─────────────────────────────
    // Va con sesion: lo pide el despacho, no el cliente. Se genera al vuelo y
    // no se guarda — un token guardado es un token que hay que rotar.
    if (req.method === 'GET' && action === 'enlace') {
      const { clientId, contactId } = req.query
      if (!clientId || !contactId) return res.status(400).json({ error: 'Faltan clientId y contactId' })
      await requireProfileAccess(req, clientId)
      const { data } = await supabase
        .from('crm_contacts').select('id').eq('id', contactId).eq('client_id', clientId).maybeSingle()
      if (!data) return res.status(404).json({ error: 'Contacto no encontrado' })
      return res.status(200).json({ token: await tokenDe(clientId, contactId) })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    console.error('[documentos]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
