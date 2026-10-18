// HELM — El setter de Instagram: el agente de cada perfil que contesta los DM,
// cualifica al lead y lo lleva a la llamada.
//
// Cómo corre. Meta avisa de cada DM por el webhook (api/ig-webhook.js); aquí se
// guarda, se le busca o crea su ficha en el CRM y se marca el hilo como
// pendiente. No se contesta al instante: se espera `retraso_s` (los leads
// escriben en ráfagas de tres mensajes y una respuesta a los dos segundos
// delata al robot). Un barrido cada 10 s recoge los hilos que ya toca
// contestar, también los que quedaron a medias si el servidor se reinició.
//
// Lo que nunca hace:
//   · escribir a quien no ha escrito antes, ni pasadas 24 h de su último
//     mensaje (reglas de Meta: fuera de esa ventana el envío falla);
//   · contestar en un hilo que lleva una persona. Si alguien del equipo
//     escribe desde la app de Instagram, el hilo pasa a «humano» solo;
//   · ocultar que es un asistente: la primera respuesta lo dice (Ley de IA,
//     art. 50, en vigor para estos sistemas desde agosto de 2026).
//
// En modo «borrador» escribe la respuesta y la deja para que una persona la
// apruebe en el panel (Agentes → Setter de Instagram). En modo «auto» la manda.
import { supabase } from '../lib/supabase.js'
import { enContexto } from './contexto.js'
import { llmChatConHerramientas } from './llm.js'
import { notificar } from './notificar.js'
import { pipelinesDe, pipelineDeContacto, resolverEtapa, normalizaEtapa } from './bot/comun.js'
import { getToken, enviarDm, perfilDeRemitente } from './instagram.js'

const VENTANA_MS = 24 * 3600_000
const MAX_HISTORIAL = 40
const BARRIDO_MS = 10_000

export const AVISO_POR_DEFECTO = (marca) => `¡Hola! Te escribe el asistente de ${marca} 🙂 Si en algún momento prefieres hablar con una persona del equipo, dímelo y te paso.`

const recorta = (s, n) => String(s || '').slice(0, n)
const ahora = () => new Date().toISOString()

// ── Configuración ───────────────────────────────────────────────────────────

export const CONFIG_POR_DEFECTO = {
  activo: false, modo: 'borrador', objetivo: 'agendar', form_id: null, enlace: '',
  instrucciones: '', preguntas: '', aviso_ia: '', retraso_s: 25,
}

export async function configDe(clientId) {
  const { data } = await supabase.from('helm_setter_ig').select('*').eq('client_id', clientId).maybeSingle()
  return { ...CONFIG_POR_DEFECTO, ...(data || {}) }
}

export function normalizaConfig(c = {}) {
  const modo = c.modo === 'auto' ? 'auto' : 'borrador'
  const objetivo = ['agendar', 'enlace', 'cualificar'].includes(c.objetivo) ? c.objetivo : 'agendar'
  let enlace = recorta(c.enlace, 500).trim()
  if (enlace && !/^https:\/\//i.test(enlace)) enlace = ''
  return {
    activo: Boolean(c.activo),
    modo,
    objetivo,
    form_id: /^[0-9a-f-]{36}$/i.test(String(c.form_id || '')) ? c.form_id : null,
    enlace,
    instrucciones: recorta(c.instrucciones, 6000),
    preguntas: recorta(c.preguntas, 2000),
    aviso_ia: recorta(c.aviso_ia, 400),
    retraso_s: Math.min(600, Math.max(5, Math.round(Number(c.retraso_s) || 25))),
  }
}

/** A qué perfil pertenece una cuenta profesional de Instagram (entry.id del webhook). */
async function perfilDeCuenta(igCuentaId) {
  const { data } = await supabase.from('user_integrations').select('client_id, config')
    .eq('service', 'instagram').is('member_id', null).filter('config->>userId', 'eq', String(igCuentaId)).limit(2)
  if (!data?.length) return null
  if (data.length > 1) console.warn('[setter-ig] la misma cuenta de Instagram está en dos perfiles:', igCuentaId)
  return data[0].client_id
}

// ── Lo que llega por el webhook ─────────────────────────────────────────────

/**
 * Procesa el cuerpo de un webhook de Instagram (object: 'instagram').
 * No lanza: un evento raro no puede tumbar los demás del mismo envío.
 */
export async function procesarWebhook(cuerpo) {
  if (cuerpo?.object !== 'instagram') return
  for (const entrada of cuerpo.entry || []) {
    const cuenta = String(entrada.id || '')
    for (const ev of entrada.messaging || []) {
      try {
        await procesarEvento(cuenta, ev)
      } catch (err) {
        console.error('[setter-ig] evento:', err?.message || err)
      }
    }
  }
}

async function procesarEvento(cuenta, ev) {
  const m = ev.message
  if (!m || !m.mid) return // lecturas, reacciones, postbacks: nada que contestar
  if (m.is_deleted) {
    await supabase.from('helm_ig_mensajes').update({ texto: '(mensaje borrado)', adjuntos: null }).eq('mid', m.mid)
    return
  }
  const clientId = await perfilDeCuenta(cuenta)
  if (!clientId) return

  const eco = Boolean(m.is_echo)
  // En un eco, quien escribe es la propia cuenta y el lead es el destinatario.
  const usuario = String((eco ? ev.recipient?.id : ev.sender?.id) || '')
  if (!usuario || usuario === cuenta) return
  const cuando = ev.timestamp ? new Date(Number(ev.timestamp)).toISOString() : ahora()
  const texto = recorta(m.text, 4000)
  const adjuntos = Array.isArray(m.attachments) && m.attachments.length
    ? m.attachments.map(a => ({ tipo: a.type, url: a.payload?.url || null }))
    : null

  if (eco) {
    // Un eco de un hilo que el setter no lleva (el equipo escribiendo a quien
    // no ha escrito a la cuenta por aquí): ni hilo nuevo ni ficha en el CRM.
    const { data: conv } = await supabase.from('helm_ig_conversaciones').select('*')
      .eq('client_id', clientId).eq('ig_usuario_id', usuario).maybeSingle()
    if (!conv) return
    // ¿Es un mensaje que mandó HELM? Si ya está guardado con ese mid, o hay uno
    // nuestro idéntico de hace un momento (el eco puede llegar antes que la
    // respuesta del envío), no es de una persona.
    const { data: nuestro } = await supabase.from('helm_ig_mensajes').select('id')
      .eq('client_id', clientId).eq('mid', m.mid).maybeSingle()
    if (nuestro) return
    const hace = new Date(Date.now() - 90_000).toISOString()
    const { data: reciente } = await supabase.from('helm_ig_mensajes').select('id')
      .eq('conversacion_id', conv.id).eq('direccion', 'saliente').eq('estado', 'enviado').is('mid', null)
      .eq('texto', texto).gte('created_at', hace).limit(1)
    if (reciente?.length) {
      await supabase.from('helm_ig_mensajes').update({ mid: m.mid }).eq('id', reciente[0].id)
      return
    }
    // Lo ha escrito alguien desde la app: el hilo pasa a manos de una persona.
    await guardaMensaje(conv, { mid: m.mid, direccion: 'saliente', autor: 'instagram', texto, adjuntos, created_at: cuando })
    await supabase.from('helm_ig_conversaciones').update({
      estado: conv.estado === 'cerrada' ? 'cerrada' : 'humano',
      motivo_humano: conv.estado === 'ia' ? 'Alguien del equipo ha contestado desde Instagram' : conv.motivo_humano,
      pendiente_desde: null, ultimo_mensaje_at: cuando, updated_at: ahora(),
    }).eq('id', conv.id)
    await descartaBorradores(conv.id)
    return
  }

  const conv = await hiloDe(clientId, cuenta, usuario)
  const nuevo = await guardaMensaje(conv, { mid: m.mid, direccion: 'entrante', autor: 'lead', texto, adjuntos, estado: 'recibido', created_at: cuando })
  if (!nuevo) return // repetido
  await supabase.from('helm_ig_conversaciones').update({
    ultimo_entrante_at: cuando, ultimo_mensaje_at: cuando, updated_at: ahora(),
    pendiente_desde: conv.pendiente_desde || cuando,
  }).eq('id', conv.id)
  // Lo que había escrito el setter y nadie aprobó ya no contesta a lo último.
  await descartaBorradores(conv.id)
  if (conv.contact_id) {
    await supabase.from('crm_contacts').update({ last_activity_at: cuando }).eq('id', conv.contact_id).eq('client_id', clientId)
  }
  programa(conv.id)
}

/** El hilo de esa persona con ese perfil; si no existe, se crea con su ficha en el CRM. */
async function hiloDe(clientId, cuenta, usuario) {
  const { data: ya } = await supabase.from('helm_ig_conversaciones').select('*')
    .eq('client_id', clientId).eq('ig_usuario_id', usuario).maybeSingle()
  if (ya) return ya

  let perfil = {}
  try {
    const { token } = await getToken(supabase, clientId)
    perfil = await perfilDeRemitente(token, usuario)
  } catch { /* sin token o sin permiso: el hilo va con su id */ }
  const handle = perfil.username ? `@${perfil.username}` : null
  const contactId = await fichaParaHilo(clientId, { nombre: perfil.name || handle || 'Lead de Instagram', instagram: handle })

  const { data, error } = await supabase.from('helm_ig_conversaciones').insert({
    client_id: clientId, ig_cuenta_id: cuenta, ig_usuario_id: usuario,
    usuario: perfil.username || null, nombre: perfil.name || null, contact_id: contactId,
  }).select('*').single()
  if (error) {
    // Dos eventos del mismo lead a la vez: el otro lo ha creado primero.
    const { data: otro } = await supabase.from('helm_ig_conversaciones').select('*')
      .eq('client_id', clientId).eq('ig_usuario_id', usuario).maybeSingle()
    if (otro) return otro
    throw error
  }
  return data
}

/** La ficha del CRM: la que ya tenga ese @ de Instagram o una nueva en la primera etapa. */
async function fichaParaHilo(clientId, { nombre, instagram }) {
  try {
    if (instagram) {
      const { data } = await supabase.from('crm_contacts').select('id')
        .eq('client_id', clientId).ilike('instagram', instagram).limit(1)
      if (data?.length) return data[0].id
    }
    const pipelines = await pipelinesDe(clientId)
    const pl = pipelines.find(p => p.isDefault) || pipelines[0]
    const { data, error } = await supabase.from('crm_contacts').insert({
      client_id: clientId, name: recorta(nombre, 200), instagram: instagram || '',
      status: pl.stages[0]?.key || 'lead', substages: [], pipeline_id: pl.id, source: 'Instagram DM',
      last_activity_at: ahora(),
    }).select('id').single()
    if (error) throw error
    return data.id
  } catch (err) {
    console.warn('[setter-ig] no se pudo crear la ficha del CRM:', err?.message || err)
    return null
  }
}

async function guardaMensaje(conv, fila) {
  const { data, error } = await supabase.from('helm_ig_mensajes').insert({
    conversacion_id: conv.id, client_id: conv.client_id, ...fila,
  }).select('id').single()
  if (error) {
    if (String(error.code) === '23505') return null // ese mid ya estaba
    throw error
  }
  return data
}

async function descartaBorradores(conversacionId) {
  await supabase.from('helm_ig_mensajes').update({ estado: 'descartado' })
    .eq('conversacion_id', conversacionId).eq('estado', 'borrador')
}

// ── Cuándo contestar ────────────────────────────────────────────────────────
// Un temporizador por hilo para la respuesta normal y un barrido de respaldo.
// Todo en globalThis: el servidor importa este módulo una vez, pero así no se
// duplica aunque lo importen dos endpoints.

const G = globalThis.__helmSetterIg ||= { timers: new Map(), ocupados: new Set(), barrido: null }

function programa(conversacionId, retrasoS) {
  arrancaBarrido()
  const previo = G.timers.get(conversacionId)
  if (previo) clearTimeout(previo)
  // Si no se sabe el retraso aún, el barrido lo respeta igual; el temporizador
  // solo adelanta el caso normal.
  const ms = (Number(retrasoS) || 25) * 1000 + 500
  G.timers.set(conversacionId, setTimeout(() => {
    G.timers.delete(conversacionId)
    atender(conversacionId).catch(e => console.error('[setter-ig] atender:', e?.message || e))
  }, ms))
}

export function arrancaBarrido() {
  if (G.barrido) return
  G.barrido = setInterval(() => {
    barrer().catch(e => console.error('[setter-ig] barrido:', e?.message || e))
  }, BARRIDO_MS)
  G.barrido.unref?.()
}

async function barrer() {
  const hace = new Date(Date.now() - 5000).toISOString()
  const { data } = await supabase.from('helm_ig_conversaciones').select('id')
    .eq('estado', 'ia').not('pendiente_desde', 'is', null).lte('pendiente_desde', hace).limit(20)
  for (const c of data || []) {
    if (!G.timers.has(c.id)) await atender(c.id).catch(e => console.error('[setter-ig] atender:', e?.message || e))
  }
}

/** Si ya toca, contesta el hilo (o deja el borrador). */
export async function atender(conversacionId, { forzar = false } = {}) {
  if (G.ocupados.has(conversacionId)) return { estado: 'ocupado' }
  G.ocupados.add(conversacionId)
  try {
    const { data: conv } = await supabase.from('helm_ig_conversaciones').select('*').eq('id', conversacionId).maybeSingle()
    if (!conv) return { estado: 'no-existe' }
    const cfg = await configDe(conv.client_id)
    if (!forzar) {
      if (!cfg.activo || conv.estado !== 'ia' || !conv.pendiente_desde) {
        if (conv.pendiente_desde && (!cfg.activo || conv.estado !== 'ia')) {
          await supabase.from('helm_ig_conversaciones').update({ pendiente_desde: null }).eq('id', conv.id)
        }
        return { estado: 'nada' }
      }
      // Que haya pasado el retraso desde el ÚLTIMO mensaje del lead.
      const falta = new Date(conv.ultimo_entrante_at || conv.pendiente_desde).getTime() + cfg.retraso_s * 1000 - Date.now()
      if (falta > 1000) { programa(conv.id, Math.ceil(falta / 1000)); return { estado: 'esperando' } }
    }
    if (!dentroDeVentana(conv)) {
      await supabase.from('helm_ig_conversaciones').update({ pendiente_desde: null }).eq('id', conv.id)
      return { estado: 'fuera-de-ventana' }
    }
    return await enContexto({ clientId: conv.client_id, origen: 'setter-ig' }, () => contestar(conv, cfg))
  } finally {
    G.ocupados.delete(conversacionId)
  }
}

export const dentroDeVentana = (conv) =>
  Boolean(conv.ultimo_entrante_at) && Date.now() - new Date(conv.ultimo_entrante_at).getTime() < VENTANA_MS - 60_000

// ── El turno del setter ─────────────────────────────────────────────────────

const HERRAMIENTA = {
  type: 'function',
  function: {
    name: 'responder_dm',
    description: 'La respuesta al lead y lo que sabes de él tras su último mensaje.',
    parameters: {
      type: 'object',
      properties: {
        mensajes: {
          type: 'array', minItems: 1, maxItems: 3,
          items: { type: 'string', maxLength: 600 },
          description: 'Lo que se le manda, en 1 a 3 mensajes cortos (como se escribe por DM). Vacío no vale: si pasas a humano, despídete diciendo que le escribe alguien del equipo.',
        },
        fase: {
          type: 'string',
          enum: ['saludo', 'descubrimiento', 'cualificado', 'enlace_enviado', 'agendado', 'no_encaja', 'humano'],
          description: 'En qué punto queda la conversación DESPUÉS de esta respuesta.',
        },
        accion: {
          type: 'string', enum: ['seguir', 'pasar_a_humano', 'cerrar'],
          description: 'pasar_a_humano: lo pide, hay queja, negociación de precio, un tema delicado o algo que no sabes. cerrar: no encaja o se despide.',
        },
        motivo: { type: 'string', maxLength: 300, description: 'Si pasas a humano o cierras: por qué, en una frase para el equipo.' },
        datos: {
          type: 'object',
          description: 'Solo lo que el lead ha dicho de verdad; lo que no sepas, no lo pongas.',
          properties: {
            nombre: { type: 'string' }, necesidad: { type: 'string' }, situacion: { type: 'string' },
            presupuesto: { type: 'string' }, urgencia: { type: 'string' }, email: { type: 'string' }, telefono: { type: 'string' },
          },
        },
        resumen: { type: 'string', maxLength: 500, description: 'La conversación en dos frases, para el closer.' },
      },
      required: ['mensajes', 'fase', 'accion'],
    },
  },
}

function sistema({ marca, biblia, cfg, enlace, datos, avisoPendiente }) {
  const objetivo = {
    agendar: enlace
      ? `Llevar al lead a reservar una llamada. Cuando esté cualificado (o lo pida), pásale ESTE enlace tal cual, sin acortarlo: ${enlace}`
      : 'Llevar al lead a una llamada. No hay enlace de reserva configurado: cuando esté cualificado, pide su mejor día y hora y pasa a humano para que el equipo la cierre.',
    enlace: enlace
      ? `Llevar al lead a este enlace cuando encaje (o lo pida): ${enlace}`
      : 'Cualificar al lead y, cuando encaje, pasar a humano.',
    cualificar: 'Cualificar al lead (qué necesita, en qué situación está, urgencia) y, cuando encaje, pasar a humano para que el equipo siga.',
  }[cfg.objetivo]

  return `Eres el setter de ${marca} y contestas por mensaje directo de Instagram. Escribes en español de España, como una persona del equipo que escribe por DM: frases cortas, cercanas, sin listas ni negritas, como mucho un emoji, y UNA pregunta por mensaje.

TU OBJETIVO
${objetivo}

CÓMO TRABAJAS
1. Primero entiende qué busca y en qué situación está. Pregunta de una en una; no interrogues.
2. Si encaja con lo que ofrece ${marca}, llévalo al objetivo. Si no encaja, díselo con amabilidad y cierra.
3. Nunca inventes precios, plazos, garantías ni resultados: si no están abajo, di que lo verá con el equipo en la llamada.
4. Pasa a humano (accion «pasar_a_humano») si lo pide, si se queja, si negocia precio, si pregunta algo que no sabes o si el tema es delicado (salud, dinero personal, menores, legal). Despídete diciendo que le escribe alguien del equipo.
5. Si pregunta si eres un bot, dilo sin rodeos: eres el asistente de ${marca} y puede hablar con una persona cuando quiera.
6. No pidas datos sensibles (DNI, tarjetas, contraseñas). Email o teléfono solo si hace falta para la llamada.
7. No hables de otras cuentas ni de la competencia, y no prometas nada en nombre de nadie.
${avisoPendiente ? '8. Este es tu primer mensaje: el aviso de que eres un asistente ya lo manda HELM antes del tuyo; no lo repitas, ve al grano.\n' : ''}
LO QUE TIENES QUE SABER DE ${marca.toUpperCase()}
${cfg.instrucciones ? recorta(cfg.instrucciones, 6000) : '(sin instrucciones del equipo)'}
${cfg.preguntas ? `\nPREGUNTAS PARA CUALIFICAR (en este orden, adaptándolas):\n${recorta(cfg.preguntas, 2000)}\n` : ''}
${biblia ? `\nLA MARCA (Biblia)\n${biblia}\n` : ''}
${datos && Object.keys(datos).length ? `\nLO QUE YA SABES DE ESTE LEAD: ${JSON.stringify(datos)}\n` : ''}
Contesta SIEMPRE con la herramienta responder_dm.`
}

/** Los mensajes del hilo como turnos para el modelo (lead = user; el resto = assistant). */
function turnosDe(mensajes) {
  const turnos = []
  for (const m of mensajes) {
    if (m.estado === 'borrador' || m.estado === 'descartado' || m.estado === 'error') continue
    const role = m.autor === 'lead' ? 'user' : 'assistant'
    const contenido = m.texto || (m.adjuntos?.length ? `(${m.adjuntos.map(a => a.tipo || 'adjunto').join(', ')})` : '')
    if (!contenido) continue
    const ultimo = turnos[turnos.length - 1]
    if (ultimo && ultimo.role === role) ultimo.content += `\n${contenido}`
    else turnos.push({ role, content: contenido })
  }
  while (turnos.length && turnos[0].role === 'assistant') turnos.shift()
  return turnos
}

async function marcaYBiblia(clientId) {
  const [{ data: c }, { data: biblias }] = await Promise.all([
    supabase.from('clients').select('name, brand_name').eq('id', clientId).maybeSingle(),
    supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId),
  ])
  const marca = c?.brand_name || c?.name || 'la marca'
  const empresa = (biblias || []).find(b => b.kind === 'empresa')?.content || (biblias || [])[0]?.content || ''
  return { marca, biblia: recorta(empresa, 5000) }
}

export function enlaceDe(cfg, contactId) {
  if (cfg.objetivo === 'agendar' && cfg.form_id) {
    const base = (process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net').replace(/\/$/, '')
    return `${base}/f/${cfg.form_id}${contactId ? `?c=${contactId}` : ''}`
  }
  return cfg.enlace || ''
}

/**
 * Pide al modelo la respuesta. Sirve para un hilo real y para el simulador
 * del panel (sin hilo, sin envío).
 */
export async function pensar({ clientId, cfg, mensajes, datos = {}, contactId = null, avisoPendiente = false }) {
  const { marca, biblia } = await marcaYBiblia(clientId)
  const enlace = enlaceDe(cfg, contactId)
  const turnos = turnosDe(mensajes).slice(-MAX_HISTORIAL)
  if (!turnos.length) throw Object.assign(new Error('No hay ningún mensaje del lead que contestar'), { statusCode: 400 })
  const r = await llmChatConHerramientas({
    clientId,
    system: sistema({ marca, biblia, cfg, enlace, datos, avisoPendiente }),
    messages: turnos,
    tools: [HERRAMIENTA],
    maxTokens: 1200,
    temperature: 0.6,
  })
  const args = r.toolCalls?.find(t => t.name === 'responder_dm')?.args
  // Si el modelo contesta en texto en vez de con la herramienta, se aprovecha
  // el texto como un único mensaje y se sigue.
  const salida = args || { mensajes: r.content ? [r.content] : [], fase: 'descubrimiento', accion: 'seguir' }
  const lista = (Array.isArray(salida.mensajes) ? salida.mensajes : [salida.mensajes])
    .map(t => recorta(t, 900).trim()).filter(Boolean).slice(0, 3)
  if (!lista.length) throw Object.assign(new Error('La IA no ha escrito ninguna respuesta'), { statusCode: 502 })
  const limpia = (o) => Object.fromEntries(Object.entries(o || {})
    .filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, recorta(v, 300).trim()]))
  return {
    mensajes: lista,
    fase: salida.fase || 'descubrimiento',
    accion: ['seguir', 'pasar_a_humano', 'cerrar'].includes(salida.accion) ? salida.accion : 'seguir',
    motivo: recorta(salida.motivo, 300),
    datos: { ...datos, ...limpia(salida.datos) },
    resumen: recorta(salida.resumen, 500),
    enlace,
  }
}

async function contestar(conv, cfg) {
  const { data: mensajes } = await supabase.from('helm_ig_mensajes').select('autor, texto, adjuntos, estado, created_at')
    .eq('conversacion_id', conv.id).order('created_at', { ascending: true }).limit(200)
  const avisoPendiente = !conv.aviso_dado
  const r = await pensar({ clientId: conv.client_id, cfg, mensajes: mensajes || [], datos: conv.datos || {}, contactId: conv.contact_id, avisoPendiente })

  const { marca } = await marcaYBiblia(conv.client_id)
  const salientes = [...(avisoPendiente ? [recorta(cfg.aviso_ia, 400).trim() || AVISO_POR_DEFECTO(marca)] : []), ...r.mensajes]
  const pasaAHumano = r.accion === 'pasar_a_humano'
  const cierra = r.accion === 'cerrar'

  await supabase.from('helm_ig_conversaciones').update({
    fase: pasaAHumano ? 'humano' : r.fase, datos: r.datos, resumen: r.resumen || conv.resumen,
    estado: pasaAHumano ? 'humano' : cierra ? 'cerrada' : conv.estado,
    motivo_humano: pasaAHumano ? (r.motivo || 'El setter pide que siga una persona') : conv.motivo_humano,
    // En borrador, el aviso cuenta como dado cuando alguien aprueba la respuesta.
    aviso_dado: cfg.modo === 'auto' ? true : conv.aviso_dado, pendiente_desde: null, updated_at: ahora(),
  }).eq('id', conv.id)

  let enviados = 0
  if (cfg.modo === 'auto') {
    for (const [i, texto] of salientes.entries()) {
      if (i) await new Promise(ok => setTimeout(ok, 1200 + Math.min(2500, texto.length * 25)))
      const ok = await enviarComo(conv, texto, 'ia')
      if (!ok) break
      enviados++
    }
  } else {
    for (const texto of salientes) {
      await guardaMensaje(conv, { direccion: 'saliente', autor: 'ia', texto, estado: 'borrador' })
    }
    await notificar(supabase, conv.client_id, {
      tipo: 'lead', titulo: `Respuesta del setter por aprobar · ${quien(conv)}`,
      cuerpo: `${r.resumen || ''}\n\n«${salientes.join(' / ').slice(0, 400)}»`, destino: 'contenido',
      clave: `setter-ig-borrador-${conv.id}`, cadaHoras: 1,
    })
  }

  await alCrm(conv, r)
  if (pasaAHumano) {
    await notificar(supabase, conv.client_id, {
      tipo: 'lead', nivel: 'aviso', titulo: `${quien(conv)} necesita a una persona`,
      cuerpo: `${r.motivo || 'El setter ha pasado el hilo al equipo.'}${r.resumen ? `\n\n${r.resumen}` : ''}`, destino: 'contenido',
    })
  }
  return { estado: cfg.modo === 'auto' ? 'enviado' : 'borrador', enviados, accion: r.accion, fase: r.fase }
}

const quien = (conv) => (conv.usuario ? `@${conv.usuario}` : conv.nombre || 'Un lead de Instagram')

/**
 * Manda un texto en el hilo y lo guarda. El mensaje se guarda ANTES de
 * enviarlo (sin mid) para que su eco no se confunda con alguien del equipo.
 */
export async function enviarComo(conv, texto, autor) {
  if (!dentroDeVentana(conv)) {
    await guardaMensaje(conv, { direccion: 'saliente', autor, texto, estado: 'error', error: 'Han pasado más de 24 h desde su último mensaje: Instagram ya no deja contestar.' })
    return false
  }
  const fila = await guardaMensaje(conv, { direccion: 'saliente', autor, texto, estado: 'enviado' })
  try {
    const { token } = await getToken(supabase, conv.client_id)
    const r = await enviarDm(token, conv.ig_usuario_id, texto)
    if (r?.message_id && fila) await supabase.from('helm_ig_mensajes').update({ mid: r.message_id }).eq('id', fila.id).is('mid', null)
    await supabase.from('helm_ig_conversaciones').update({ ultimo_mensaje_at: ahora() }).eq('id', conv.id)
    return true
  } catch (err) {
    if (fila) await supabase.from('helm_ig_mensajes').update({ estado: 'error', error: recorta(err.message, 300) }).eq('id', fila.id)
    return false
  }
}

/** Lo que el setter ha sacado de la conversación, en la ficha del CRM. */
async function alCrm(conv, r) {
  if (!conv.contact_id) return
  try {
    const { data: c } = await supabase.from('crm_contacts').select('id, name, email, phone, status, pipeline_id, notes')
      .eq('id', conv.contact_id).eq('client_id', conv.client_id).maybeSingle()
    if (!c) return
    const cambios = { last_activity_at: ahora() }
    if (r.datos.email && !c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.datos.email)) cambios.email = r.datos.email.toLowerCase()
    if (r.datos.telefono && !c.phone) cambios.phone = r.datos.telefono
    if (r.datos.nombre && /^(@|Lead de Instagram)/.test(c.name || '')) cambios.name = r.datos.nombre
    // La primera respuesta saca al lead de la primera etapa a «contactado», si
    // el pipeline la tiene. Las demás etapas las mueve el equipo o la reserva.
    const pipelines = await pipelinesDe(conv.client_id)
    const pl = pipelineDeContacto(c, pipelines)
    if (normalizaEtapa(c.status, pl.stages) === pl.stages[0]?.key) {
      const destino = resolverEtapa('contactado', pl.stages)
      if (!destino.error) { cambios.status = destino.etapa.key; cambios.substages = [] }
    }
    await supabase.from('crm_contacts').update(cambios).eq('id', c.id).eq('client_id', conv.client_id)

    const hitos = { enlace_enviado: 'Le ha pasado el enlace', cualificado: 'Lead cualificado', no_encaja: 'No encaja', humano: 'Pasa a una persona' }
    const hito = r.accion === 'pasar_a_humano' ? hitos.humano : hitos[r.fase]
    if (hito) {
      await supabase.from('crm_activities').insert({
        client_id: conv.client_id, contact_id: c.id, type: 'note', title: `Setter de Instagram · ${hito}`,
        description: [r.resumen, r.motivo].filter(Boolean).join('\n\n') || hito, performed_by: 'Setter de Instagram',
        performed_at: ahora(),
      })
    }
  } catch (err) {
    console.warn('[setter-ig] CRM:', err?.message || err)
  }
}
