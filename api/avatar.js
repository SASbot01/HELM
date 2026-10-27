// HELM — Avatar: el estudio de los clientes de un perfil.
//
//   GET  ?action=lista  &clientId=   → el estudio, las fichas por contacto y si
//                                      hay una pasada en marcha
//   POST ?action=ahora  &clientId=   → lanza el estudio ahora
//
// Lo genera el worker (api/_lib/avatar.js). Aquí solo se lee y se pide. Las
// dos acciones piden, además de entrar al perfil, poder ver el avatar
// (puedeVerAvatar, abajo).
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { encolaAvatar } from './_lib/avatar.js'

// Copia de NIVELES_TOTALES de src/helm/permisos.js. Se duplica a propósito:
// aquel archivo tira del cliente de Supabase del navegador y api/ no lo importa.
const NIVELES_TOTALES = ['admin,ceo,director', 'admin']

/**
 * ¿Puede esta sesión ver (y pedir) el avatar de ventas de este perfil?
 *
 * La misma escalera que sigue el panel para enseñar la pestaña (HelmApp →
 * puede('avatar'), con seccionEncendida y puedeVer de src/helm/permisos.js):
 * que el negocio no lo haya apagado en Secciones y, encima, mandar en todo el
 * perfil o tener el avatar marcado en Permisos para tu rol. El panel ya no le
 * pinta la pestaña a quien no toca, pero el endpoint se puede llamar a mano, y
 * cada estudio gasta créditos de la agencia y retrata a los clientes.
 */
export async function puedeVerAvatar(auth, clientId) {
  // Sin la tabla o sin la columna, como el panel: todo encendido y los
  // permisos de serie (loadPermisos y loadSecciones hacen lo mismo).
  const { data, error } = await supabase.from('helm_permissions')
    .select('sections, visible').eq('client_id', clientId).maybeSingle()
  const permisos = error ? {} : (data || {})
  if (permisos.sections?.avatar === false) return false

  // La plataforma y el administrador de la agencia, y en el equipo quien
  // tiene nivel de propietario o administrador.
  if (auth.plataforma || auth.superadmin || auth.role === 'superadmin') return true
  if (NIVELES_TOTALES.includes(auth.nivel)) return true

  // El oficio (closer, setter…) no va en el token: se mira en su ficha.
  const { data: persona, error: eRol } = await supabase.from('helm_team')
    .select('role').eq('login_id', auth.userId).maybeSingle()
  if (eRol) throw eRol
  // Sin oficio es quien montó el negocio (o un acceso de antes de los roles), y
  // el dueño no se limita: los dos lo ven todo, también en el panel.
  const rol = persona?.role
  if (!rol || rol === 'dueno') return true
  // Ningún rol lo trae de serie (DEFAULT_VISIBLE): o se le ha marcado en
  // Permisos, o no lo ve.
  const lista = permisos.visible?.[rol]
  return Array.isArray(lista) && lista.includes('avatar')
}

async function enMarcha(clientId) {
  const { data } = await supabase.from('agent_jobs').select('estado, error')
    .eq('tipo', 'avatar').eq('payload->>clientId', clientId)
    .order('created_at', { ascending: false }).limit(1)
  const j = data?.[0]
  return {
    corriendo: j ? ['pendiente', 'corriendo'].includes(j.estado) : false,
    fallo: j?.estado === 'error' ? String(j.error || '').slice(0, 300) : '',
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)
    if (!(await puedeVerAvatar(auth, clientId))) {
      throw Object.assign(new Error('El avatar de ventas no está disponible para tu acceso. Pídeselo a quien lleva el negocio.'), { statusCode: 403 })
    }
    const accion = String(req.query?.action || '')

    if (accion === 'lista') {
      const [estudio, fichas, estado] = await Promise.all([
        supabase.from('helm_avatar').select('resumen, n_contactos, n_analizados, generado_en').eq('client_id', clientId).maybeSingle(),
        supabase.from('helm_avatar_contactos').select('nombre, genero, genero_conf, edad_rango, ubicacion, facturacion, perfil, interes')
          .eq('client_id', clientId).order('analizado_en', { ascending: false }).limit(400),
        enMarcha(clientId),
      ])
      if (estudio.error) throw estudio.error
      return res.status(200).json({ estudio: estudio.data || null, fichas: fichas.data || [], ...estado })
    }

    if (accion === 'ahora' && req.method === 'POST') {
      const gate = rateLimit({ key: `avatar:${clientId}`, max: 6, windowMs: 60 * 60_000 })
      if (!gate.ok) throw Object.assign(new Error('Ya lo has pedido varias veces esta hora. Espera un poco.'), { statusCode: 429 })
      if ((await enMarcha(clientId)).corriendo) return res.status(200).json({ ok: true })
      await encolaAvatar(clientId, { origen: 'manual' })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
