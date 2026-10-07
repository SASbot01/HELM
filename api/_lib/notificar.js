// HELM — notificaciones: lo que el panel tiene que contarle al dueño del perfil.
//
// Un solo punto de entrada, `notificar()`. Guarda la notificación (la campana
// del panel lee de ahí) y, si el perfil tiene Telegram vinculado, la manda
// también por ahí: una reserva que solo se ve entrando al panel llega tarde.
//
// Nunca lanza. Quien avisa está en mitad de otra cosa —guardar una reserva,
// contestar a una landing— y un fallo al notificar no puede tumbar eso.
import { getTelegramConfig, enviarMensaje } from './telegram.js'

const ICONO = { info: '🔔', aviso: '⚠️', error: '🔴' }

/**
 * @param {object} supabase cliente con la clave de servicio
 * @param {string} clientId perfil al que se avisa
 * @param {object} n
 * @param {string} n.tipo     'reserva' | 'lead' | 'embudo' | 'calendario' | 'estudio' | …
 * @param {'info'|'aviso'|'error'} [n.nivel]
 * @param {string} n.titulo
 * @param {string} [n.cuerpo]
 * @param {string} [n.destino] sección del panel ('llamadas') o URL
 * @param {string} [n.clave]   con `cadaHoras`, no se repite dentro de esa ventana
 * @param {number} [n.cadaHoras]
 * @param {object} [n.meta]
 */
export async function notificar(supabase, clientId, {
  tipo, nivel = 'info', titulo, cuerpo = '', destino = null, clave = null, cadaHoras = 0, meta = {},
}) {
  try {
    if (!clientId || !titulo) return null

    if (clave && cadaHoras > 0) {
      const desde = new Date(Date.now() - cadaHoras * 3600_000).toISOString()
      const { data: ya } = await supabase.from('helm_notificaciones').select('id')
        .eq('client_id', clientId).eq('clave', clave).gte('created_at', desde).limit(1)
      if (ya?.length) return null
    }

    const { data, error } = await supabase.from('helm_notificaciones').insert({
      client_id: clientId, tipo, nivel,
      titulo: String(titulo).slice(0, 200), cuerpo: String(cuerpo).slice(0, 2000),
      destino, clave, meta,
    }).select('id').single()
    if (error) { console.warn('[notificar]', error.message); return null }

    // Telegram, a todos los chats vinculados del perfil. Sin esperar a que
    // acabe no vale: en serverless la función se congela al responder.
    try {
      const tgRow = await getTelegramConfig(supabase, clientId)
      const cfg = tgRow?.enabled ? tgRow.config || {} : {}
      const chats = Array.isArray(cfg.chats) ? cfg.chats : []
      if (cfg.token && chats.length) {
        const texto = `${ICONO[nivel] || ICONO.info} *${titulo}*${cuerpo ? `\n${cuerpo}` : ''}`
        await Promise.all(chats.map(c => enviarMensaje(cfg.token, c.id, texto).catch(() => null)))
      }
    } catch (err) {
      console.warn('[notificar] telegram', err.message)
    }
    return data.id
  } catch (err) {
    console.warn('[notificar]', err.message)
    return null
  }
}
