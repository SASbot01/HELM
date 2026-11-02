// HELM — Email marketing: campañas de correo a los contactos del CRM, que
// salen por la cuenta de Resend DEL PERFIL (su clave, su dominio, su cupo).
//
//   GET    ?action=estado      → conexión (solo …últimos 4), ajustes, pipelines y si mandas
//   POST   ?action=ajustes     { apiKey?, webhookSecret?, quitarWebhook?, remitenteNombre,
//                                remitenteEmail, responderA, empresa, direccion } → estado + avisos
//   DELETE ?action=clave       → quita la clave (y pausa lo que esté en marcha)
//   POST   ?action=audiencia   { pipelineId, etapas } → cuántos, unos cuantos de muestra, quién se queda fuera
//   GET    ?action=campanas    → la lista, con enviados, fallidos y bajas
//   GET    ?action=campana     &id= → la campaña, sus mensajes y sus cuentas
//   POST   ?action=guardar     { id?, nombre, audiencia, mensajes: [{ asunto, cuerpo, esperaDias }], inicio, ventana }
//   POST   ?action=duplicar    { id } → una copia en borrador (lo lanzado no se edita)
//   DELETE ?action=campana     &id= → solo borradores
//   POST   ?action=prueba      { id } → la secuencia entera a TU correo, con «[Prueba]»
//   POST   ?action=lanzar      { id, confirmar } → `confirmar` es el número EXACTO de personas que
//                                se le enseñó al confirmar; si el CRM ha cambiado, 409 con el nuevo
//   POST   ?action=pausar | reanudar { id }
//   GET    ?action=bajas       → quién no quiere más correos (y rebotes y quejas)
//   POST   ?action=baja        { email, nota? } → apuntar una a mano
//   POST   ?action=quitar-baja { email, pedido: true, nota? } → solo si la persona lo ha pedido
//
// Todos piden entrar al perfil y ver la sección 'email' (la escalera del menú,
// puedeVerSeccion). Lo que cambia algo o manda algo, además, mandar en el
// perfil (mandaEnPerfil): el resto lo ve, no lo toca.
//
// La clave de Resend se valida antes de guardarla y se queda en el servidor
// (api/_lib/email/config.js): al navegador solo vuelven sus cuatro últimos.
// Lo que manda de verdad es el worker (api/_lib/email/motor.js); aquí se prepara.
import { randomUUID } from 'node:crypto'
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess, puedeVerSeccion, mandaEnPerfil } from './_lib/access.js'
import { todasLasFilas } from './_lib/filas.js'
import { pipelinesDe } from './_lib/bot/comun.js'
import {
  getResendConfig, saveResendConfig, deleteResendConfig, credencialesDe, conexionVisible,
  leerAjustes, remitenteDeAjustes, faltaParaMandar,
} from './_lib/email/config.js'
import { verificarClave, estadoDominio, enviarTodos, ResendError } from './_lib/email/resend.js'
import { construirAudiencia, leeAudiencia, describeAudiencia, pipelinesParaElegir, limpiaEmail, MAX_DESTINATARIOS } from './_lib/email/audiencia.js'
import { componerCorreo, cargaResend, variablesDesconocidas, VARIABLES, TOPES } from './_lib/email/plantilla.js'
import { enlaceBaja, urlPublica } from './_lib/email/baja.js'
import { registrarBaja } from './_lib/email/bajas.js'
import { leeLocalMadrid, localMadrid, primerEnvio, ventanaDe } from './_lib/email/calendario.js'

export const SECCION = 'email'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fuera = (code, error, extra = {}) => Object.assign(new Error(error), { statusCode: code, ...extra })
const ahoraIso = () => new Date().toISOString()
const quien = (auth) => String(auth?.email || auth?.userId || 'panel').slice(0, 200)
const urlWebhook = (clientId) => `${urlPublica()}/api/email-webhook?perfil=${clientId}`
const texto = (v, max) => String(v ?? '').trim().slice(0, max)

// ── Lecturas ────────────────────────────────────────────────────────────────

async function estado({ clientId, admin }) {
  const [fila, ajustes, pipelines] = await Promise.all([
    getResendConfig(supabase, clientId), leerAjustes(clientId), pipelinesParaElegir(clientId),
  ])
  const conexion = conexionVisible(fila)
  return {
    puedeAdministrar: admin,
    clave: conexion.clave,
    webhook: { ...conexion.webhook, url: urlWebhook(clientId) },
    ajustes: {
      remitenteNombre: ajustes.remitente_nombre || '',
      remitenteEmail: ajustes.remitente_email || '',
      responderA: ajustes.responder_a || '',
      empresa: ajustes.empresa || '',
      direccion: ajustes.direccion || '',
      dominios: Array.isArray(ajustes.dominios) ? ajustes.dominios : [],
      comprobadoEn: ajustes.comprobado_en || null,
    },
    faltan: faltaParaMandar(ajustes, conexion),
    pipelines,
    limites: { destinatarios: MAX_DESTINATARIOS, mensajes: TOPES.mensajes, asunto: TOPES.asunto, cuerpo: TOPES.cuerpo },
    variables: VARIABLES,
  }
}

const suma = (filas, campo) => filas.reduce((n, f) => n + (Number(f[campo]) || 0), 0)

function cuentas(resumen = [], destinatarios = null) {
  return {
    enviados: suma(resumen, 'enviados'),
    entregados: suma(resumen, 'entregados'),
    rebotados: suma(resumen, 'rebotados'),
    quejas: suma(resumen, 'quejas'),
    fallidos: suma(resumen, 'fallidos') + suma(resumen, 'dudosos'),
    pendientes: suma(resumen, 'pendientes'),
    bajas: Number(destinatarios?.bajas) || 0,
    activos: Number(destinatarios?.activos) || 0,
    terminados: Number(destinatarios?.terminados) || 0,
  }
}

function vistaCampana(c, pipelines) {
  return {
    id: c.id,
    nombre: c.nombre,
    estado: c.estado,
    // 'activa' antes de su fecha es, para quien lo mira, «programada».
    programada: c.estado === 'activa' && Boolean(c.inicio_en) && new Date(c.inicio_en) > new Date(),
    audiencia: { pipelineId: c.audiencia?.pipelineId || null, etapas: Array.isArray(c.audiencia?.etapas) ? c.audiencia.etapas : [] },
    audienciaTexto: describeAudiencia(c.audiencia, pipelines),
    inicio: localMadrid(c.inicio_en),
    inicioEn: c.inicio_en || null,
    ventana: ventanaDe(c),
    total: c.total || 0,
    remitente: c.remitente ? { nombre: c.remitente.nombre || '', email: c.remitente.email || '' } : null,
    error: c.error || null,
    lanzadaEn: c.lanzada_en || null,
    lanzadaPor: c.lanzada_por || null,
    pausadaEn: c.pausada_en || null,
    terminadaEn: c.terminada_en || null,
    creadaEn: c.created_at || null,
  }
}

async function campanas({ clientId }) {
  const { data: lista, error } = await supabase.from('helm_email_campanas').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  if (!lista?.length) return { campanas: [] }
  const [pipelines, resumen, destinatarios, mensajes] = await Promise.all([
    pipelinesDe(clientId),
    todasLasFilas(() => supabase.from('helm_email_resumen').select('*').eq('client_id', clientId).order('campana_id').order('orden')),
    todasLasFilas(() => supabase.from('helm_email_resumen_destinatarios').select('*').eq('client_id', clientId).order('campana_id')),
    todasLasFilas(() => supabase.from('helm_email_mensajes').select('id, campana_id').eq('client_id', clientId).order('id')),
  ])
  return {
    campanas: lista.map(c => ({
      ...vistaCampana(c, pipelines),
      mensajes: mensajes.filter(m => m.campana_id === c.id).length,
      ...cuentas(resumen.filter(r => r.campana_id === c.id), destinatarios.find(d => d.campana_id === c.id)),
    })),
  }
}

async function campanaDe(clientId, id) {
  if (!UUID.test(String(id || ''))) throw fuera(404, 'Esa campaña no existe.')
  const { data, error } = await supabase.from('helm_email_campanas').select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
  if (error) throw error
  if (!data) throw fuera(404, 'Esa campaña no existe.')
  return data
}

async function mensajesDe(campanaId) {
  const { data, error } = await supabase.from('helm_email_mensajes').select('id, orden, asunto, cuerpo, espera_dias')
    .eq('campana_id', campanaId).order('orden')
  if (error) throw error
  return data || []
}

async function detalle({ clientId, admin }, id) {
  const c = await campanaDe(clientId, id)
  const [ms, pipelines, { data: resumen, error: e1 }, { data: dest, error: e2 }] = await Promise.all([
    mensajesDe(c.id), pipelinesDe(clientId),
    supabase.from('helm_email_resumen').select('*').eq('campana_id', c.id),
    supabase.from('helm_email_resumen_destinatarios').select('*').eq('campana_id', c.id).maybeSingle(),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return {
    campana: { ...vistaCampana(c, pipelines), ...cuentas(resumen || [], dest) },
    mensajes: ms.map(m => ({
      id: m.id, orden: m.orden, asunto: m.asunto, cuerpo: m.cuerpo, esperaDias: m.espera_dias,
      ...cuentas((resumen || []).filter(r => r.orden === m.orden)),
    })),
    editable: admin && c.estado === 'borrador',
  }
}

// ── Validar lo que llega ───────────────────────────────────────────────────

function leeVentana(v) {
  if (v == null || v === false) return { ventana_desde: null, ventana_hasta: null }
  const desde = Number(v.desde)
  const hasta = Number(v.hasta)
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 0 || desde > 23 || hasta < 1 || hasta > 24 || desde >= hasta) {
    throw fuera(400, 'La franja horaria no vale: la hora de inicio tiene que ser anterior a la de fin.')
  }
  return { ventana_desde: desde, ventana_hasta: hasta }
}

function leeMensajes(lista) {
  if (!Array.isArray(lista) || !lista.length) throw fuera(400, 'La campaña necesita al menos un correo.')
  if (lista.length > TOPES.mensajes) throw fuera(400, `Una secuencia lleva como mucho ${TOPES.mensajes} correos.`)
  return lista.map((m, i) => {
    const n = i + 1
    const asunto = String(m?.asunto ?? '').replace(/[\r\n]+/g, ' ').trim()
    const cuerpo = String(m?.cuerpo ?? '').replace(/\r\n?/g, '\n').trim()
    if (!asunto) throw fuera(400, `Al correo ${n} le falta el asunto.`)
    if (asunto.length > TOPES.asunto) throw fuera(400, `El asunto del correo ${n} pasa de ${TOPES.asunto} caracteres.`)
    if (!cuerpo) throw fuera(400, `Al correo ${n} le falta el texto.`)
    if (cuerpo.length > TOPES.cuerpo) throw fuera(400, `El texto del correo ${n} pasa de ${TOPES.cuerpo} caracteres.`)
    const malas = variablesDesconocidas(`${asunto}\n${cuerpo}`)
    if (malas.length) throw fuera(400, `En el correo ${n} hay variables que no existen: ${malas.map(v => `{{${v}}}`).join(', ')}. Las que hay: ${VARIABLES.map(v => `{{${v}}}`).join(', ')}.`)
    const espera = i === 0 ? 0 : Number(m?.esperaDias ?? 0)
    if (!Number.isInteger(espera) || espera < 0 || espera > TOPES.esperaDias) throw fuera(400, `La espera del correo ${n} tiene que ser un número de días entre 0 y ${TOPES.esperaDias}.`)
    return { orden: n, asunto, cuerpo, espera_dias: espera }
  })
}

function leeCampana(b, pipelines) {
  const nombre = texto(b.nombre, 500)
  if (!nombre) throw fuera(400, 'Ponle un nombre a la campaña.')
  if (nombre.length > TOPES.nombreCampana) throw fuera(400, `El nombre pasa de ${TOPES.nombreCampana} caracteres.`)
  const { pipelineId, etapas } = leeAudiencia(b.audiencia, pipelines)
  let inicio = null
  if (b.inicio) {
    inicio = leeLocalMadrid(b.inicio)
    if (!inicio) throw fuera(400, 'La fecha programada no vale.')
    if (inicio.getTime() < Date.now() + 60_000) throw fuera(400, 'La fecha programada ya ha pasado: elige una futura (o que salga al lanzar).')
  }
  return {
    nombre,
    audiencia: { pipelineId, etapas },
    inicio_en: inicio ? inicio.toISOString() : null,
    ...leeVentana(b.ventana),
    mensajes: leeMensajes(b.mensajes),
  }
}

// ── Escrituras ──────────────────────────────────────────────────────────────

async function guardaMensajes(clientId, campanaId, mensajes) {
  const filas = mensajes.map(m => ({ ...m, campana_id: campanaId, client_id: clientId }))
  const { error } = await supabase.from('helm_email_mensajes').upsert(filas, { onConflict: 'campana_id,orden' })
  if (error) throw error
  const { error: e2 } = await supabase.from('helm_email_mensajes').delete().eq('campana_id', campanaId).gt('orden', mensajes.length)
  if (e2) throw e2
}

async function guardar(ctx, b) {
  const { clientId, auth } = ctx
  const datos = leeCampana(b, await pipelinesDe(clientId))
  const { mensajes, ...campana } = datos
  let id = b.id ? String(b.id) : null
  if (id) {
    if (!UUID.test(id)) throw fuera(404, 'Esa campaña no existe.')
    const { data, error } = await supabase.from('helm_email_campanas').update({ ...campana, updated_at: ahoraIso() })
      .eq('id', id).eq('client_id', clientId).eq('estado', 'borrador').select('id').maybeSingle()
    if (error) throw error
    if (!data) {
      await campanaDe(clientId, id)
      throw fuera(409, 'Esta campaña ya está lanzada y no se puede cambiar. Duplícala y edita la copia.')
    }
  } else {
    const { data, error } = await supabase.from('helm_email_campanas')
      .insert({ ...campana, client_id: clientId, estado: 'borrador', creada_por: quien(auth) }).select('id').single()
    if (error) throw error
    id = data.id
  }
  await guardaMensajes(clientId, id, mensajes)
  return detalle(ctx, id)
}

async function duplicar(ctx, b) {
  const { clientId, auth } = ctx
  const c = await campanaDe(clientId, b.id)
  const ms = await mensajesDe(c.id)
  const { data, error } = await supabase.from('helm_email_campanas').insert({
    client_id: clientId, estado: 'borrador', nombre: `Copia de ${c.nombre}`.slice(0, TOPES.nombreCampana),
    audiencia: c.audiencia || {}, ventana_desde: c.ventana_desde ?? null, ventana_hasta: c.ventana_hasta ?? null,
    inicio_en: null, creada_por: quien(auth),
  }).select('id').single()
  if (error) throw error
  if (ms.length) await guardaMensajes(clientId, data.id, ms.map(m => ({ orden: m.orden, asunto: m.asunto, cuerpo: m.cuerpo, espera_dias: m.espera_dias })))
  return detalle(ctx, data.id)
}

async function borrar({ clientId }, id) {
  await campanaDe(clientId, id)
  const { data, error } = await supabase.from('helm_email_campanas').delete()
    .eq('id', id).eq('client_id', clientId).eq('estado', 'borrador').select('id')
  if (error) throw error
  if (!data?.length) throw fuera(409, 'Solo se borran los borradores: una campaña lanzada se queda como registro (puedes pausarla).')
  return { ok: true }
}

function leeAjustes(b) {
  const remitenteEmail = String(b.remitenteEmail ?? '').trim()
  const responderA = String(b.responderA ?? '').trim()
  const fila = {
    remitente_nombre: texto(b.remitenteNombre, 120) || null,
    remitente_email: remitenteEmail ? limpiaEmail(remitenteEmail) : null,
    responder_a: responderA ? limpiaEmail(responderA) : null,
    empresa: texto(b.empresa, 200) || null,
    direccion: texto(b.direccion, 400) || null,
  }
  if (remitenteEmail && !fila.remitente_email) throw fuera(400, 'El correo del remitente no es válido.')
  if (responderA && !fila.responder_a) throw fuera(400, 'El correo de «responder a» no es válido.')
  return fila
}

async function guardarAjustes(ctx, b, req) {
  const { clientId, auth } = ctx
  const campos = leeAjustes(b)
  const fila = await getResendConfig(supabase, clientId)
  const cfg = { ...(fila?.enabled === false ? {} : fila?.config || {}) }
  const nuevaClave = String(b.apiKey ?? '').trim()
  if (nuevaClave && !/^re_[A-Za-z0-9_-]{8,200}$/.test(nuevaClave)) throw fuera(400, 'Eso no parece una clave de Resend (empiezan por «re_»).')
  const nuevoSecreto = String(b.webhookSecret ?? '').trim()
  if (nuevoSecreto && !/^whsec_[A-Za-z0-9+/=]{16,200}$/.test(nuevoSecreto)) throw fuera(400, 'Eso no parece el secreto de firma de un webhook de Resend (empieza por «whsec_»).')

  // La clave se prueba ANTES de guardarla: una que no vale no entra.
  const avisos = []
  const clave = nuevaClave || cfg.apiKey || null
  let comprobacion = null
  if (clave) {
    try {
      comprobacion = await verificarClave(clave)
    } catch (err) {
      if (!(err instanceof ResendError)) throw err
      if (nuevaClave) throw fuera(400, `Resend no acepta esa clave: ${err.message}`)
      avisos.push(`No se ha podido comprobar la clave guardada: ${err.message}`)
    }
  } else {
    avisos.push('Falta la clave de Resend: sin ella no sale nada.')
  }
  if (comprobacion?.restringida) {
    avisos.push('La clave solo tiene permiso de envío, así que no se ha podido comprobar el dominio. Mira en resend.com → Domains que el de tu remitente esté «Verified».')
  } else if (comprobacion && campos.remitente_email) {
    const dominio = campos.remitente_email.split('@')[1]
    const est = estadoDominio(comprobacion.dominios, campos.remitente_email)
    if (est !== 'verified') {
      avisos.push(est
        ? `El dominio ${dominio} está en tu cuenta de Resend pero aún no está verificado (${est}). Hasta que lo esté no se puede mandar desde él.`
        : `El dominio ${dominio} no está en tu cuenta de Resend. Añádelo en resend.com → Domains y verifícalo (los registros DNS) antes de lanzar.`)
    }
  }

  if (nuevaClave) { cfg.apiKey = nuevaClave; cfg.last4 = nuevaClave.slice(-4) }
  if (nuevoSecreto) { cfg.webhookSecret = nuevoSecreto; cfg.webhookLast4 = nuevoSecreto.slice(-4) }
  if (b.quitarWebhook === true) { delete cfg.webhookSecret; delete cfg.webhookLast4 }
  if (nuevaClave || nuevoSecreto || b.quitarWebhook === true) await saveResendConfig(supabase, clientId, cfg)

  const { error } = await supabase.from('helm_email_ajustes').upsert({
    client_id: clientId, ...campos, updated_at: ahoraIso(), updated_por: quien(auth),
    ...(comprobacion && !comprobacion.restringida ? { dominios: comprobacion.dominios.slice(0, 100), comprobado_en: ahoraIso() } : {}),
  }, { onConflict: 'client_id' })
  if (error) throw error
  await writeAudit({
    clientId, actor: auth, action: 'email.ajustes', req,
    metadata: { clave: Boolean(nuevaClave), webhook: nuevoSecreto ? 'puesto' : b.quitarWebhook === true ? 'quitado' : 'igual' },
  })
  return { ...(await estado(ctx)), avisos }
}

async function quitarClave(ctx, req) {
  const { clientId, auth } = ctx
  await deleteResendConfig(supabase, clientId)
  // Lo que esté en marcha no puede seguir sin clave: se pausa ya y se dice por qué.
  const { error } = await supabase.from('helm_email_campanas')
    .update({ estado: 'pausada', pausada_en: ahoraIso(), error: 'Se ha quitado la clave de Resend: vuelve a ponerla en Ajustes y reanuda la campaña.', updated_at: ahoraIso() })
    .eq('client_id', clientId).eq('estado', 'activa')
  if (error) throw error
  await writeAudit({ clientId, actor: auth, action: 'email.clave_quitada', req })
  return estado(ctx)
}

async function previsualizar({ clientId }, b) {
  // Sin la lista entera: al panel le basta con la cuenta y la muestra.
  const { contactos: _TODOS, ...resto } = await construirAudiencia(clientId, { pipelineId: b.pipelineId || null, etapas: b.etapas })
  return resto
}

// La secuencia entera a TU correo (el de tu sesión, nunca otro: esto no es un
// buzón para mandar a quien sea). Las variables salen con su valor por defecto.
async function prueba(ctx, b) {
  const { clientId, auth } = ctx
  const gate = rateLimit({ key: `email-prueba:${clientId}`, max: 10, windowMs: 10 * 60_000 })
  if (!gate.ok) throw fuera(429, 'Has mandado muchas pruebas seguidas: espera unos minutos.')
  const c = await campanaDe(clientId, b.id)
  const ms = await mensajesDe(c.id)
  if (!ms.length) throw fuera(400, 'La campaña no tiene correos.')
  const para = limpiaEmail(auth?.email)
  if (!para) throw fuera(400, 'Tu sesión no tiene un correo al que mandar la prueba.')
  const cred = await credencialesDe(clientId)
  if (!cred?.apiKey) throw fuera(400, 'Falta la clave de Resend (pestaña Ajustes).')
  const remitente = c.estado === 'borrador' || !c.remitente ? remitenteDeAjustes(await leerAjustes(clientId)) : c.remitente
  if (!remitente.email || !remitente.empresa || !remitente.direccion) throw fuera(400, 'Completa el remitente, la empresa y la dirección en Ajustes: van en todos los correos, también en las pruebas.')
  const enlace = enlaceBaja(clientId, para)
  const correos = ms.map((m, i) => cargaResend({
    compuesto: componerCorreo({ mensaje: m, persona: { nombre: '', email: para }, remitente, enlaceBaja: enlace, prefijo: `[Prueba ${i + 1}/${ms.length}] ` }),
    para, remitente, enlaceBaja: enlace, etiquetas: { helm_prueba: c.id },
  }))
  try {
    await enviarTodos(cred.apiKey, correos, { clave: `helm-email-prueba-${randomUUID()}` })
  } catch (err) {
    if (err instanceof ResendError) throw fuera(err.status >= 500 || err.reintentable ? 502 : 400, err.message)
    throw err
  }
  return { ok: true, enviados: correos.length, para }
}

async function lanzar(ctx, b, req) {
  const { clientId, auth } = ctx
  const c = await campanaDe(clientId, b.id)
  if (!['borrador', 'preparando'].includes(c.estado)) throw fuera(409, 'Esta campaña ya está lanzada.')
  if (!(await mensajesDe(c.id)).length) throw fuera(409, 'La campaña no tiene correos.')
  const [fila, ajustes] = await Promise.all([getResendConfig(supabase, clientId), leerAjustes(clientId)])
  const faltan = faltaParaMandar(ajustes, conexionVisible(fila))
  if (faltan.length) throw fuera(409, `Antes de lanzar falta ${faltan.join(', ')} (pestaña Ajustes).`)

  // El dominio, otra vez y ahora: lanzar con uno sin verificar es una campaña
  // que se pausa en el primer lote.
  const cred = await credencialesDe(clientId)
  let comprobacion
  try {
    comprobacion = await verificarClave(cred.apiKey)
  } catch (err) {
    if (err instanceof ResendError) throw fuera(409, `Resend no acepta la clave guardada: ${err.message}`)
    throw err
  }
  if (!comprobacion.restringida && estadoDominio(comprobacion.dominios, ajustes.remitente_email) !== 'verified') {
    throw fuera(409, `El dominio de ${ajustes.remitente_email} no está verificado en Resend. Verifícalo en resend.com → Domains y vuelve a lanzar.`)
  }

  const ahora = new Date()
  const inicioEn = c.inicio_en ? new Date(c.inicio_en) : null
  if (inicioEn && inicioEn.getTime() < ahora.getTime() - 60_000) {
    throw fuera(409, 'La fecha programada ya ha pasado: cámbiala (o quítala para que salga al lanzar).')
  }
  const aud = await construirAudiencia(clientId, c.audiencia)
  if (aud.excedido) {
    throw fuera(409, `La audiencia tiene ${aud.total.toLocaleString('es-ES')} personas y el tope por campaña es ${MAX_DESTINATARIOS.toLocaleString('es-ES')}: acótala con etapas o divídela en dos campañas.`, { codigo: 'tope', total: aud.total })
  }
  if (!aud.total) throw fuera(409, 'No hay nadie a quien mandarla: ningún contacto de esa audiencia tiene un correo válido que no esté de baja.')
  // Lo que se confirmó tiene que ser lo que sale. Si el CRM ha cambiado desde
  // que se enseñó el número, se vuelve a preguntar.
  if (Number(b.confirmar) !== aud.total) {
    throw fuera(409, `La audiencia ha cambiado: ahora son ${aud.total.toLocaleString('es-ES')} personas. Confírmalo otra vez.`, { codigo: 'confirmar', total: aud.total })
  }

  const { data: tomada, error } = await supabase.from('helm_email_campanas').update({ estado: 'preparando', updated_at: ahoraIso() })
    .eq('id', c.id).eq('client_id', clientId).in('estado', ['borrador', 'preparando']).select('id').maybeSingle()
  if (error) throw error
  if (!tomada) throw fuera(409, 'Esta campaña ya está lanzada.')

  const primero = primerEnvio({ ahora, inicioEn, ventana: ventanaDe(c) }).toISOString()
  for (let i = 0; i < aud.contactos.length; i += 500) {
    const filas = aud.contactos.slice(i, i + 500).map(p => ({
      campana_id: c.id, client_id: clientId, contact_id: p.contact_id || null, email: p.email, nombre: p.nombre || null,
      estado: 'activo', siguiente_orden: 1, siguiente_en: primero,
    }))
    const { error: e } = await supabase.from('helm_email_destinatarios').upsert(filas, { onConflict: 'campana_id,email', ignoreDuplicates: true })
    if (e) throw e
  }
  const { error: e2 } = await supabase.from('helm_email_campanas').update({
    estado: 'activa', total: aud.total, remitente: remitenteDeAjustes(ajustes), error: null,
    lanzada_en: ahoraIso(), lanzada_por: quien(auth), updated_at: ahoraIso(),
  }).eq('id', c.id).eq('estado', 'preparando')
  if (e2) throw e2
  await writeAudit({ clientId, actor: auth, action: 'email.campana_lanzada', resourceType: 'helm_email_campanas', resourceId: c.id, req, metadata: { total: aud.total, primero } })
  return { ok: true, total: aud.total, primerEnvio: primero, ...(await detalle(ctx, c.id)) }
}

async function pausar(ctx, b, req) {
  const { clientId, auth } = ctx
  await campanaDe(clientId, b.id)
  const { data, error } = await supabase.from('helm_email_campanas').update({ estado: 'pausada', pausada_en: ahoraIso(), updated_at: ahoraIso() })
    .eq('id', b.id).eq('client_id', clientId).eq('estado', 'activa').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw fuera(409, 'Solo se puede pausar una campaña en marcha.')
  await writeAudit({ clientId, actor: auth, action: 'email.campana_pausada', resourceType: 'helm_email_campanas', resourceId: b.id, req })
  return detalle(ctx, b.id)
}

async function reanudar(ctx, b, req) {
  const { clientId, auth } = ctx
  await campanaDe(clientId, b.id)
  const [fila, ajustes] = await Promise.all([getResendConfig(supabase, clientId), leerAjustes(clientId)])
  const faltan = faltaParaMandar(ajustes, conexionVisible(fila))
  if (faltan.length) throw fuera(409, `Antes de reanudar falta ${faltan.join(', ')} (pestaña Ajustes).`)
  // Sale con el remitente de ahora: si se pausó por él, al reanudar ya va el bueno.
  const { data, error } = await supabase.from('helm_email_campanas')
    .update({ estado: 'activa', error: null, remitente: remitenteDeAjustes(ajustes), updated_at: ahoraIso() })
    .eq('id', b.id).eq('client_id', clientId).eq('estado', 'pausada').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw fuera(409, 'Solo se puede reanudar una campaña pausada.')
  await writeAudit({ clientId, actor: auth, action: 'email.campana_reanudada', resourceType: 'helm_email_campanas', resourceId: b.id, req })
  return detalle(ctx, b.id)
}

const MAX_BAJAS = 1000

async function bajas({ clientId }) {
  const { data, error } = await supabase.from('helm_email_bajas').select('email, motivo, origen, campana_id, detalle, creada_en')
    .eq('client_id', clientId).order('creada_en', { ascending: false }).limit(MAX_BAJAS + 1)
  if (error) throw error
  const lista = (data || []).slice(0, MAX_BAJAS)
  const ids = [...new Set(lista.map(b => b.campana_id).filter(Boolean))]
  let nombres = new Map()
  if (ids.length) {
    const { data: cs, error: e2 } = await supabase.from('helm_email_campanas').select('id, nombre').eq('client_id', clientId).in('id', ids.slice(0, 500))
    if (e2) throw e2
    nombres = new Map((cs || []).map(c => [c.id, c.nombre]))
  }
  return {
    bajas: lista.map(b => ({ email: b.email, motivo: b.motivo, origen: b.origen, detalle: b.detalle || null, creadaEn: b.creada_en, campana: b.campana_id ? nombres.get(b.campana_id) || null : null })),
    hayMas: (data || []).length > MAX_BAJAS,
  }
}

async function apuntarBaja({ clientId, auth }, b, req) {
  const email = limpiaEmail(b.email)
  if (!email) throw fuera(400, 'Ese correo no es válido.')
  const r = await registrarBaja({ clientId, email, motivo: 'manual', origen: 'panel', detalle: texto(b.nota, 300) || `Apuntada por ${quien(auth)}` })
  await writeAudit({ clientId, actor: auth, action: 'email.baja_apuntada', req, metadata: { email } })
  return { ok: true, nueva: r.nueva }
}

async function quitarBaja({ clientId, auth }, b, req) {
  const email = limpiaEmail(b.email)
  if (!email) throw fuera(400, 'Ese correo no es válido.')
  if (b.pedido !== true) {
    throw fuera(400, 'Una baja solo se quita si la propia persona te ha pedido volver a recibir tus correos. Marca la casilla para confirmarlo.')
  }
  const { data, error } = await supabase.from('helm_email_bajas').delete().eq('client_id', clientId).eq('email', email).select('motivo')
  if (error) throw error
  if (!data?.length) throw fuera(404, 'Ese correo no está en las bajas.')
  // Queda constancia de quién la quitó y por qué: es lo que se enseña si alguien pregunta.
  await writeAudit({ clientId, actor: auth, action: 'email.baja_quitada', req, metadata: { email, motivo: data[0].motivo, nota: texto(b.nota, 300) || null } })
  return { ok: true }
}

// ── Rutas ───────────────────────────────────────────────────────────────────
// `admin`: solo quien manda en el perfil.
const RUTAS = {
  'GET estado': { fn: (ctx) => estado(ctx) },
  'GET campanas': { fn: (ctx) => campanas(ctx) },
  'GET campana': { fn: (ctx, _b, req) => detalle(ctx, req.query.id) },
  'GET bajas': { fn: (ctx) => bajas(ctx) },
  'POST ajustes': { admin: true, fn: (ctx, b, req) => guardarAjustes(ctx, b, req) },
  'DELETE clave': { admin: true, fn: (ctx, _b, req) => quitarClave(ctx, req) },
  'POST audiencia': { admin: true, fn: (ctx, b) => previsualizar(ctx, b) },
  'POST guardar': { admin: true, fn: (ctx, b) => guardar(ctx, b) },
  'POST duplicar': { admin: true, fn: (ctx, b) => duplicar(ctx, b) },
  'DELETE campana': { admin: true, fn: (ctx, _b, req) => borrar(ctx, req.query.id) },
  'POST prueba': { admin: true, fn: (ctx, b) => prueba(ctx, b) },
  'POST lanzar': { admin: true, fn: (ctx, b, req) => lanzar(ctx, b, req) },
  'POST pausar': { admin: true, fn: (ctx, b, req) => pausar(ctx, b, req) },
  'POST reanudar': { admin: true, fn: (ctx, b, req) => reanudar(ctx, b, req) },
  'POST baja': { admin: true, fn: (ctx, b, req) => apuntarBaja(ctx, b, req) },
  'POST quitar-baja': { admin: true, fn: (ctx, b, req) => quitarBaja(ctx, b, req) },
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const gate = rateLimit({ key: `email-marketing:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfter))
      return res.status(429).json({ error: 'Demasiadas peticiones', retryAfter: gate.retryAfter })
    }
    const clientId = String(req.query?.clientId || '')
    if (!UUID.test(clientId)) return res.status(400).json({ error: 'Falta el perfil' })
    // Un solo perfil por petición: el que se comprueba es el que se usa.
    if (req.body?.clientId && String(req.body.clientId) !== clientId) {
      return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
    }
    const ruta = RUTAS[`${req.method} ${String(req.query?.action || '')}`]
    if (!ruta) return res.status(405).json({ error: 'Acción no válida' })

    const auth = await requireProfileAccess(req, clientId)
    if (!(await puedeVerSeccion(auth, clientId, SECCION))) throw fuera(403, 'Tu rol no tiene acceso a Email marketing en este perfil.')
    const admin = await mandaEnPerfil(auth, clientId)
    if (ruta.admin && !admin) throw fuera(403, 'Esto solo lo puede hacer quien administra el perfil.')
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
    const r = await ruta.fn({ clientId, auth, admin }, b, req)
    return res.status(200).json(r)
  } catch (e) {
    const code = e.statusCode || 500
    if (code >= 500) console.error('[email-marketing]', e)
    return res.status(code).json({
      error: code >= 500 ? 'No se ha podido hacer. Prueba otra vez.' : e.message,
      ...(e.codigo ? { codigo: e.codigo } : {}),
      ...(e.total != null ? { total: e.total } : {}),
    })
  }
}
