// HELM — notificaciones: lo que el panel tiene que contarle al dueño del perfil.
//
// Un solo punto de entrada, `notificar()`. Guarda la notificación (la campana
// del panel lee de ahí) y, si el perfil tiene Telegram vinculado, la manda
// también por ahí: una reserva que solo se ve entrando al panel llega tarde.
//
// Lo importante (avisos, errores, leads, reservas y ventas) llega además por
// el bot de HELM para agencias a los administradores de la agencia del perfil
// que lo tienen vinculado, con el nombre del perfil delante: con varias marcas
// en un mismo chat, hay que saber de cuál es.
//
// Lo que es de la agencia y aún no de un perfil (un alta pública de alguien
// que todavía no es cliente) va por `notificarAgencia()`: solo el bot de
// agencia, con el nombre de la agencia delante.
//
// Nunca lanza. Quien avisa está en mitad de otra cosa —guardar una reserva,
// contestar a una landing— y un fallo al notificar no puede tumbar eso.
import { getTelegramConfig, enviarMensaje, tokenAgencia, agenciaPermitida } from './telegram.js'
import { agenciaDe } from './access.js'

const ICONO = { info: '🔔', aviso: '⚠️', error: '🔴' }
const A_LA_AGENCIA = new Set(['lead', 'reserva', 'venta'])

// Por el bot de agencia, a quien lo tenga vinculado y siga siendo de esa
// agencia. Sin HELM_TELEGRAM_TOKEN, nada. `etiqueta` dice de quién es el aviso
// y solo se pide si hay a quién mandarlo (para un perfil, cuesta una consulta).
async function aLaAgencia(supabase, agenciaId, { nivel, titulo, cuerpo }, etiqueta) {
  const token = tokenAgencia()
  if (!token) return
  if (!agenciaId || !(await agenciaPermitida(supabase, agenciaId))) return
  const { data: vinculos, error } = await supabase.from('helm_telegram_vinculos')
    .select('tg_chat_id, superadmins(active, agencia_id)')
    .eq('agencia_id', agenciaId).not('tg_chat_id', 'is', null)
  if (error) throw error
  const chats = (vinculos || [])
    .filter(v => v.tg_chat_id && v.superadmins?.active !== false && v.superadmins?.agencia_id === agenciaId)
    .map(v => v.tg_chat_id)
  if (!chats.length) return
  // El corchete va escapado: en el Markdown de Telegram abre un enlace.
  const texto = `${ICONO[nivel] || ICONO.info} \\[${await etiqueta()}] *${titulo}*${cuerpo ? `\n${cuerpo}` : ''}`
  await Promise.all(chats.map(id => enviarMensaje(token, id, texto).catch(() => null)))
}

async function avisarAgencia(supabase, clientId, aviso) {
  if (!tokenAgencia()) return
  await aLaAgencia(supabase, await agenciaDe(clientId), aviso, async () => {
    const { data: perfil } = await supabase.from('clients').select('name, slug').eq('id', clientId).maybeSingle()
    return perfil?.name || perfil?.slug || 'Perfil'
  })
}

/**
 * Un aviso de la agencia que aún no es de ningún perfil: solo por el bot de
 * agencia, a sus administradores vinculados. Nunca lanza.
 * @param {object} supabase cliente con la clave de servicio
 * @param {string} agenciaId
 * @param {object} n
 * @param {'info'|'aviso'|'error'} [n.nivel]
 * @param {string} n.titulo
 * @param {string} [n.cuerpo]
 * @param {string} [n.etiqueta] lo que va entre corchetes delante (el nombre de la agencia)
 */
export async function notificarAgencia(supabase, agenciaId, { nivel = 'info', titulo, cuerpo = '', etiqueta = 'HELM' }) {
  try {
    if (!agenciaId || !titulo) return
    await aLaAgencia(supabase, agenciaId, { nivel, titulo, cuerpo }, async () => etiqueta)
  } catch (err) {
    console.warn('[notificar] telegram de la agencia', err.message)
  }
}

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
    if (nivel === 'aviso' || nivel === 'error' || A_LA_AGENCIA.has(tipo)) {
      try {
        await avisarAgencia(supabase, clientId, { nivel, titulo, cuerpo })
      } catch (err) {
        console.warn('[notificar] telegram de la agencia', err.message)
      }
    }
    return data.id
  } catch (err) {
    console.warn('[notificar]', err.message)
    return null
  }
}
