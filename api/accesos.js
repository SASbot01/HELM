// HELM — panel de accesos con aprobación (AI para todo y otras comunidades que
// lo pidan). SOLO superadmin (Alex).
//
// Las solicitudes llegan por api/leads (solicitar-acceso) y quedan como
// contactos del perfil de la comunidad, con custom_fields.<clave>.acceso =
// 'pendiente'. Aquí se listan las pendientes y se aprueban o rechazan. Al
// aprobar, la persona entra en la web de la comunidad con su mismo correo
// (api/leads · comprobar-acceso); si hay correo saliente configurado, además se
// le avisa por correo. El perfil de cada comunidad sale de la lista cerrada de
// api/_lib/comunidades.js: nunca de la petición.
import { supabase } from './lib/supabase.js'
import { applyCors, requireSuperAdmin } from './_lib/auth.js'
import { puedeVerPerfil } from './_lib/access.js'
import { comunidadPorClave } from './_lib/comunidades.js'
import { hayCorreo, enviarCorreo } from './_lib/correo.js'

const ahora = () => new Date().toISOString()
const yerro = (status, mensaje) => Object.assign(new Error(mensaje), { statusCode: status })
const escapaHtml = (s) => String(s || '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
))

async function comunidadYperfil(clave) {
  const c = comunidadPorClave(clave)
  if (!c) throw yerro(400, 'Comunidad desconocida')
  const { data, error } = await supabase.from('clients').select('id').eq('slug', c.perfil).maybeSingle()
  if (error) throw error
  if (!data) throw yerro(404, 'Perfil no encontrado')
  return { clientId: data.id, c }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const auth = await requireSuperAdmin(req)
    const clave = String(req.query.comunidad || 'aiparatodo')
    const { clientId, c } = await comunidadYperfil(clave)
    // Que el perfil de la comunidad sea de la agencia de quien pregunta: un
    // superadmin de otra agencia no puede ver ni tocar sus leads.
    if (!(await puedeVerPerfil(auth, clientId))) throw yerro(403, 'Ese perfil no es de tu agencia')
    const action = req.query.action

    // Las solicitudes que esperan tu visto bueno.
    if (req.method === 'GET' && action === 'pendientes') {
      const { data, error } = await supabase.from('crm_contacts')
        .select('id, name, email, custom_fields, updated_at')
        .eq('client_id', clientId)
        .filter(`custom_fields->${clave}->>acceso`, 'eq', 'pendiente')
        .order('updated_at', { ascending: false }).limit(300)
      if (error) throw error
      const accesos = (data || []).map(r => ({
        id: r.id, nombre: r.name || '', email: r.email || '',
        solicitado: r.custom_fields?.[clave]?.solicitado || r.updated_at || null,
        // ¿Pasó por el formulario de HELM Academy (se fue al Skool)? Es lo que
        // Alex cruza para aprobar: si se apuntó, lo acepta.
        enSkool: Boolean(r.custom_fields?.school),
      }))
      return res.status(200).json({ accesos })
    }

    // Aprobar o rechazar una.
    if (req.method === 'POST' && (action === 'aprobar' || action === 'rechazar')) {
      const id = String(req.body?.id || '')
      if (!id) throw yerro(400, 'Falta el id')
      const { data: fila, error } = await supabase.from('crm_contacts')
        .select('id, name, email, custom_fields').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (error) throw error
      if (!fila) throw yerro(404, 'Esa solicitud ya no está')

      const estado = action === 'aprobar' ? 'aprobado' : 'rechazado'
      const campo = { ...(fila.custom_fields?.[clave] || {}), acceso: estado, [`${estado}_at`]: ahora() }
      const { error: e2 } = await supabase.from('crm_contacts')
        .update({ custom_fields: { ...(fila.custom_fields || {}), [clave]: campo }, updated_at: ahora() })
        .eq('id', id).eq('client_id', clientId)
      if (e2) throw e2

      if (estado !== 'aprobado') return res.status(200).json({ ok: true, estado })

      // Aprobado: la persona ya puede entrar con su correo. El enlace vale para
      // copiárselo a mano; si hay correo saliente, además se le manda.
      const enlace = c.web
      let correo = { enviado: false, motivo: 'sin-config' }
      if (fila.email && hayCorreo()) {
        const saludo = fila.name ? ` ${fila.name}` : ''
        correo = await enviarCorreo({
          para: fila.email,
          asunto: `Ya tienes acceso a ${c.nombre}`,
          texto: `¡Hola${saludo}! Ya tienes acceso a ${c.nombre}. Entra aquí con este mismo correo: ${enlace}`,
          html: `<p>¡Hola${escapaHtml(saludo)}!</p><p>Ya tienes acceso a <b>${escapaHtml(c.nombre)}</b>. Entra aquí con este mismo correo:</p><p><a href="${enlace}">${enlace}</a></p>`,
        })
      }
      return res.status(200).json({ ok: true, estado, enlace, correo })
    }

    throw yerro(405, 'Método no permitido')
  } catch (err) {
    const code = err.statusCode || 500
    if (code >= 500) console.error('[accesos]', err)
    return res.status(code).json({ error: err.message || 'Error' })
  }
}
