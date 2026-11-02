// HELM — Email marketing: el motor que manda las campañas. Lo llama el worker
// cada minuto (scripts/agents-worker.mjs, con cerrojo: nunca dos pasadas a la
// vez) y no depende de la cola de trabajos: una transcripción larga no puede
// retrasar un correo programado.
//
// Lo que no puede pasar nunca es que alguien reciba dos veces el mismo correo.
// Tres cosas lo impiden:
//
//   1. Antes de llamar a Resend se escribe la fila del envío (campaña,
//      mensaje, persona) con su `lote`. El índice único de esa terna hace que
//      un segundo intento no pueda crear otra: si ya existe, o está en un lote
//      a medias (se remata con su misma clave) o ya salió (solo se avanza).
//   2. Cada lote va a Resend con Idempotency-Key = su `lote`. Si el worker se
//      cae después de que Resend lo aceptara y antes de apuntarlo, la pasada
//      siguiente repite la MISMA petición con la MISMA clave y Resend contesta
//      lo de la primera vez sin mandar nada. El cuerpo sale igual byte a byte
//      (plantilla.js es puro y el remitente es la foto guardada al lanzar).
//   3. Lo que no se puede saber (Resend ya no recuerda la clave tras 24 h, o
//      dice que esa clave tenía otro contenido) se queda como 'dudoso' y no se
//      repite. Mejor uno de menos que uno de más.
//
// Quien está de baja (o rebotó, o se quejó) no recibe nada: se mira la lista
// de bajas del perfil en cada pasada y, además, registrarBaja corta su fila
// en la campaña al momento.
//
// Cada correo que sale deja una actividad 'email' en la ficha del contacto
// del CRM, con su asunto.
import { randomUUID } from 'node:crypto'
import { supabase } from '../../lib/supabase.js'
import { enviarLote, enviarUno, MAX_LOTE, ResendError } from './resend.js'
import { componerCorreo, cargaResend } from './plantilla.js'
import { enlaceBaja } from './baja.js'
import { siguienteEnvio, enVentana, ventanaDe } from './calendario.js'
import { credencialesDe } from './config.js'
import { bajasDe } from './bajas.js'

// Por campaña y pasada (un minuto): 10 lotes de 100 = 1.000 correos.
export const LOTES_POR_PASADA = 10
// Resend recuerda una Idempotency-Key 24 h: pasado esto, repetir sería a ciegas.
export const CADUCA_LOTE_MS = 23 * 3600_000
const QUIEN = 'Email marketing'
const COLS_ENVIO = 'id, campana_id, mensaje_id, destinatario_id, client_id, contact_id, email, orden, lote, estado, intentos, suelto, creado_en'

export const claveLote = (lote) => `helm-email-${lote}`
export const claveSuelta = (lote, envioId) => `helm-email-${lote}-${envioId}`
const recorta = (t, n = 900) => String(t ?? '').slice(0, n)

/**
 * Una pasada: todas las campañas activas de todos los perfiles.
 * @returns {Array<{ campana, enviados?, fallidos?, dudosos?, programada?, pausada?, error? }>}
 */
export async function enviaCorreos({ db = supabase, ahora = () => new Date(), log = () => {} } = {}) {
  const { data, error } = await db.from('helm_email_campanas').select('*').eq('estado', 'activa').order('created_at').limit(500)
  if (error) throw error
  const resultados = []
  for (const c of data || []) {
    try {
      resultados.push({ campana: c.id, ...(await pasaCampana(c, { db, ahora, log })) })
    } catch (err) {
      log(`email marketing: la campaña ${c.id} ha fallado: ${err.message}`)
      resultados.push({ campana: c.id, error: err.message })
    }
  }
  return resultados
}

async function pasaCampana(c, { db, ahora, log }) {
  if (c.inicio_en && new Date(c.inicio_en) > ahora()) return { programada: true }
  const cred = await credencialesDe(c.client_id, db)
  if (!cred?.apiKey) {
    await pausa(db, c, 'Falta la clave de Resend: ponla en Email marketing → Ajustes y reanuda la campaña.')
    return { pausada: true }
  }
  const remitente = c.remitente || {}
  if (!remitente.email) {
    await pausa(db, c, 'Falta el remitente: complétalo en Email marketing → Ajustes y reanuda la campaña.')
    return { pausada: true }
  }
  const { data: ms, error } = await db.from('helm_email_mensajes')
    .select('id, orden, asunto, cuerpo, espera_dias').eq('campana_id', c.id).order('orden')
  if (error) throw error
  if (!ms?.length) {
    await pausa(db, c, 'La campaña no tiene mensajes.')
    return { pausada: true }
  }
  const ctx = {
    c, db, ahora, log, remitente,
    apiKey: cred.apiKey,
    mensajes: new Map(ms.map(m => [m.orden, m])),
    porId: new Map(ms.map(m => [m.id, m])),
    ventana: ventanaDe(c),
    bajas: await bajasDe(c.client_id, db),
    cuenta: { enviados: 0, fallidos: 0, dudosos: 0 },
  }

  // Primero lo que se quedó a medias (con su misma clave), luego lo nuevo.
  const r = await rematarPendientes(ctx)
  if (!r.parar && enVentana(ahora(), ctx.ventana)) {
    for (let i = 0; i < LOTES_POR_PASADA; i++) {
      // Si alguien la pausa a mitad de pasada, se para en el siguiente lote.
      if (i > 0 && !(await sigueActiva(db, c.id))) break
      const otro = await loteNuevo(ctx)
      if (otro.parar || otro.vacio) break
    }
  }
  if (ctx.cuenta.enviados && c.error) {
    await db.from('helm_email_campanas').update({ error: null, updated_at: ahora().toISOString() }).eq('id', c.id).eq('estado', 'activa')
  }
  await cierraSiTerminada(db, c, ahora())
  return ctx.cuenta
}

// ── Lo nuevo ────────────────────────────────────────────────────────────────

async function loteNuevo(ctx) {
  const { c, db, ahora } = ctx
  const ahoraIso = ahora().toISOString()
  const { data: dests, error } = await db.from('helm_email_destinatarios')
    .select('id, contact_id, email, nombre, siguiente_orden')
    .eq('campana_id', c.id).eq('estado', 'activo').lte('siguiente_en', ahoraIso)
    .order('id').limit(MAX_LOTE)
  if (error) throw error
  if (!dests?.length) return { vacio: true }

  const deBaja = dests.filter(d => ctx.bajas.has(d.email))
  const vivos = dests.filter(d => !ctx.bajas.has(d.email))
  const sinMensaje = vivos.filter(d => !ctx.mensajes.get(d.siguiente_orden))
  const toca = vivos.filter(d => ctx.mensajes.get(d.siguiente_orden))
  if (deBaja.length) {
    const { error: e } = await db.from('helm_email_destinatarios').update({ estado: 'baja', updated_at: ahoraIso })
      .in('id', deBaja.map(d => d.id)).eq('estado', 'activo')
    if (e) throw e
  }
  if (sinMensaje.length) {
    const { error: e } = await db.from('helm_email_destinatarios').update({ estado: 'terminado', siguiente_en: null, updated_at: ahoraIso })
      .in('id', sinMensaje.map(d => d.id)).eq('estado', 'activo')
    if (e) throw e
  }
  if (!toca.length) return {}

  const lote = randomUUID()
  const filas = toca.map(d => ({
    campana_id: c.id, mensaje_id: ctx.mensajes.get(d.siguiente_orden).id, destinatario_id: d.id,
    client_id: c.client_id, contact_id: d.contact_id || null, email: d.email, orden: d.siguiente_orden,
    lote, estado: 'pendiente', intentos: 0, suelto: false, creado_en: ahoraIso, actualizado_en: ahoraIso,
  }))
  // El índice único (campaña, mensaje, persona) decide: solo vuelven las que se han creado ahora.
  const { data: nuevas, error: e2 } = await db.from('helm_email_envios')
    .upsert(filas, { onConflict: 'campana_id,mensaje_id,destinatario_id', ignoreDuplicates: true })
    .select(COLS_ENVIO)
  if (e2) throw e2
  const creadas = new Set((nuevas || []).map(n => n.destinatario_id))
  const yaEstaban = toca.filter(d => !creadas.has(d.id))
  if (yaEstaban.length) await avanzaYaHechos(ctx, yaEstaban)
  if (!nuevas?.length) return {}
  const persona = new Map(toca.map(d => [d.id, d]))
  return mandaLote(ctx, lote, nuevas.map(n => ({ ...n, persona: persona.get(n.destinatario_id) })), { fresco: true })
}

// Quien ya tenía su fila de este mensaje: si ya salió (o falló, o es dudosa),
// el worker se cayó antes de pasarlo al siguiente. Se avanza sin mandar nada.
// Si está a medias, la remata rematarPendientes en la pasada siguiente.
async function avanzaYaHechos(ctx, dests) {
  const { c, db, ahora } = ctx
  const { data, error } = await db.from('helm_email_envios').select('destinatario_id, orden, estado, enviado_en')
    .eq('campana_id', c.id).in('destinatario_id', dests.map(d => d.id))
  if (error) throw error
  for (const d of dests) {
    const e = (data || []).find(x => x.destinatario_id === d.id && x.orden === d.siguiente_orden)
    if (!e || e.estado === 'pendiente') continue
    await avanza(ctx, [{ destinatario_id: d.id, orden: d.siguiente_orden }], e.enviado_en ? new Date(e.enviado_en) : ahora())
  }
}

// ── Lo que se quedó a medias ───────────────────────────────────────────────

async function rematarPendientes(ctx) {
  const { c, db, ahora } = ctx
  const { data, error } = await db.from('helm_email_envios').select(COLS_ENVIO)
    .eq('campana_id', c.id).eq('estado', 'pendiente').order('id').limit(MAX_LOTE * LOTES_POR_PASADA)
  if (error) throw error
  if (!data?.length) return {}
  const personas = await personasDe(db, [...new Set(data.map(e => e.destinatario_id))])
  const lotes = new Map()
  for (const e of data) {
    if (!lotes.has(e.lote)) lotes.set(e.lote, [])
    lotes.get(e.lote).push({ ...e, persona: personas.get(e.destinatario_id) || { email: e.email, nombre: '' } })
  }
  for (const [lote, filas] of lotes) {
    const desde = Math.min(...filas.map(f => new Date(f.creado_en).getTime()))
    if (ahora().getTime() - desde > CADUCA_LOTE_MS) {
      await cierra(ctx, filas, 'dudoso', 'No se sabe si salió: el envío se cortó y Resend ya no recuerda la petición. No se repite para no mandarlo dos veces.')
      continue
    }
    const r = await mandaLote(ctx, lote, filas, { fresco: false })
    if (r.parar) return r
  }
  return {}
}

async function personasDe(db, ids) {
  const mapa = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('helm_email_destinatarios').select('id, email, nombre').in('id', ids.slice(i, i + 200))
    if (error) throw error
    for (const d of data || []) mapa.set(d.id, d)
  }
  return mapa
}

// ── Mandar ──────────────────────────────────────────────────────────────────

function correoDe(ctx, f) {
  const mensaje = ctx.porId.get(f.mensaje_id)
  if (!mensaje) throw new Error(`El mensaje ${f.mensaje_id} ya no existe`)
  const enlace = enlaceBaja(ctx.c.client_id, f.email)
  const compuesto = componerCorreo({ mensaje, persona: { nombre: f.persona?.nombre || '', email: f.email }, remitente: ctx.remitente, enlaceBaja: enlace })
  return {
    asunto: compuesto.subject,
    carga: cargaResend({ compuesto, para: f.email, remitente: ctx.remitente, enlaceBaja: enlace, etiquetas: { helm_campana: ctx.c.id, helm_envio: f.id } }),
  }
}

/** Un lote a Resend. `fresco`: es el primer intento (nadie lo ha mandado nunca). */
async function mandaLote(ctx, lote, filas, { fresco }) {
  const orden = [...filas].sort((a, b) => Number(a.id) - Number(b.id))
  if (orden.some(f => f.suelto)) return unoAUno(ctx, lote, orden)
  const correos = orden.map(f => correoDe(ctx, f))
  try {
    const ids = await enviarLote(ctx.apiKey, correos.map(x => x.carga), { idempotencia: claveLote(lote) })
    await marcaEnviados(ctx, lote, orden, ids, correos)
    return {}
  } catch (err) {
    return trataError(ctx, lote, orden, err, { fresco })
  }
}

async function trataError(ctx, lote, filas, err, { fresco }) {
  const { c, db } = ctx
  if (!(err instanceof ResendError)) throw err
  // Red, 5xx o 429 que no ha cedido: se queda pendiente y la pasada siguiente lo repite con la misma clave.
  if (err.reintentable) {
    await anotaIntento(ctx, filas, err.message)
    return { parar: true }
  }
  // El cupo del plan: se sigue solo cuando se renueve.
  if (err.cupo) {
    await anotaIntento(ctx, filas, err.message)
    await anotaError(db, c, err.message)
    return { parar: true }
  }
  if (err.idempotencia) {
    await cierra(ctx, filas, 'dudoso', err.message)
    return {}
  }
  // La clave o el remitente: no es de este lote, es de la campaña. Se pausa.
  // En el primer intento, Resend no lo aceptó: no salió y se borra, para que al
  // reanudar se mande entero. En una repetición no se sabe si la primera vez
  // salió: se queda pendiente y se remata con su clave al reanudar.
  if (err.deCampana) {
    if (fresco) {
      const { error } = await db.from('helm_email_envios').delete().eq('lote', lote).eq('estado', 'pendiente')
      if (error) throw error
    }
    await pausa(db, c, err.message)
    return { parar: true }
  }
  // Un correo malo tumba el lote entero: uno a uno, para saber cuál.
  if (filas.length > 1) {
    const { error } = await db.from('helm_email_envios').update({ suelto: true, actualizado_en: ctx.ahora().toISOString() })
      .eq('lote', lote).eq('estado', 'pendiente')
    if (error) throw error
    return unoAUno(ctx, lote, filas.map(f => ({ ...f, suelto: true })))
  }
  await cierra(ctx, filas, 'fallido', err.message)
  return {}
}

// Si los tres primeros fallan igual y no sale ninguno, el problema no es de
// tres personas sino de la campaña (el remitente, el asunto…): se pausa sin
// dar a nadie por fallido.
const FALLOS_SEGUIDOS = 3

async function unoAUno(ctx, lote, filas) {
  const { c, db } = ctx
  let salio = false
  const enDuda = []
  for (const f of filas) {
    const correo = correoDe(ctx, f)
    try {
      const id = await enviarUno(ctx.apiKey, correo.carga, { idempotencia: claveSuelta(lote, f.id) })
      await marcaEnviados(ctx, lote, [f], [id], [correo])
      if (!salio && enDuda.length) {
        for (const x of enDuda) await cierra(ctx, [x.f], 'fallido', x.motivo)
        enDuda.length = 0
      }
      salio = true
    } catch (err) {
      if (!(err instanceof ResendError)) throw err
      if (err.reintentable || err.cupo) {
        await anotaIntento(ctx, [f], err.message)
        if (err.cupo) await anotaError(db, c, err.message)
        return { parar: true }
      }
      // Los que quedan siguen pendientes: al reanudar se repiten con sus mismas claves.
      if (err.deCampana) {
        await pausa(db, c, err.message)
        return { parar: true }
      }
      if (err.idempotencia) {
        await cierra(ctx, [f], 'dudoso', err.message)
        continue
      }
      if (salio) {
        await cierra(ctx, [f], 'fallido', err.message)
        continue
      }
      enDuda.push({ f, motivo: err.message })
      if (enDuda.length >= FALLOS_SEGUIDOS) {
        await pausa(db, c, `Resend rechaza los correos de esta campaña: ${err.message}`)
        return { parar: true }
      }
    }
  }
  for (const x of enDuda) await cierra(ctx, [x.f], 'fallido', x.motivo)
  return {}
}

// ── Apuntar ─────────────────────────────────────────────────────────────────

async function marcaEnviados(ctx, lote, filas, ids, correos) {
  const { c, db, ahora, log } = ctx
  const cuando = ahora().toISOString()
  // De 'pendiente' a 'enviado' de una vez: lo que vuelve es lo que ha cambiado
  // AHORA. Solo de eso se apunta la actividad del CRM y se avanza la secuencia.
  const { data: cambiadas, error } = await db.from('helm_email_envios')
    .update({ estado: 'enviado', enviado_en: cuando, actualizado_en: cuando, error: null })
    .eq('lote', lote).eq('estado', 'pendiente').in('id', filas.map(f => f.id))
    .select('id')
  if (error) throw error
  const hechas = new Set((cambiadas || []).map(x => x.id))
  const salieron = filas.map((f, i) => ({ f, id: ids[i], asunto: correos[i]?.asunto })).filter(x => hechas.has(x.f.id))
  ctx.cuenta.enviados += salieron.length

  // El id de Resend de cada uno, para cruzar lo que avise el webhook.
  for (let i = 0; i < salieron.length; i += 25) {
    const tanda = salieron.slice(i, i + 25).filter(x => x.id)
    const r = await Promise.all(tanda.map(x => db.from('helm_email_envios').update({ resend_id: x.id }).eq('id', x.f.id)))
    const fallo = r.find(x => x?.error)
    if (fallo) log(`email marketing: no se pudo guardar el id de Resend: ${fallo.error.message}`)
  }

  const actividades = salieron.filter(x => x.f.contact_id).map(x => ({
    client_id: c.client_id, contact_id: x.f.contact_id, type: 'email',
    title: recorta(`Email: ${x.asunto}`, 200),
    description: `Campaña «${c.nombre}» · correo ${x.f.orden} de ${ctx.mensajes.size}.`,
    performed_by: QUIEN, performed_at: cuando,
  }))
  if (actividades.length) {
    const { error: eA } = await db.from('crm_activities').insert(actividades)
    if (eA) log(`email marketing: no se pudo apuntar en el CRM: ${eA.message}`)
  }
  await avanza(ctx, salieron.map(x => x.f), new Date(cuando))
}

/** Cierra filas pendientes como 'fallido' o 'dudoso'. Un fallido corta la secuencia de esa persona; un dudoso, no. */
async function cierra(ctx, filas, estado, motivo) {
  const { db, ahora } = ctx
  const cuando = ahora().toISOString()
  const { data: cambiadas, error } = await db.from('helm_email_envios')
    .update({ estado, error: recorta(motivo), actualizado_en: cuando })
    .eq('estado', 'pendiente').in('id', filas.map(f => f.id))
    .select('id')
  if (error) throw error
  const hechas = new Set((cambiadas || []).map(x => x.id))
  const suyas = filas.filter(f => hechas.has(f.id))
  if (!suyas.length) return
  if (estado === 'fallido') {
    ctx.cuenta.fallidos += suyas.length
    const { error: e } = await db.from('helm_email_destinatarios').update({ estado: 'fallido', siguiente_en: null, updated_at: cuando })
      .in('id', suyas.map(f => f.destinatario_id)).eq('estado', 'activo')
    if (e) throw e
  } else {
    ctx.cuenta.dudosos += suyas.length
    await avanza(ctx, suyas, ahora())
  }
}

/** Pasa a cada persona al siguiente mensaje de la secuencia (o la da por terminada). Repetirlo no avanza dos veces. */
async function avanza(ctx, filas, base) {
  const { db, ahora } = ctx
  const porOrden = new Map()
  for (const f of filas) {
    if (!porOrden.has(f.orden)) porOrden.set(f.orden, [])
    porOrden.get(f.orden).push(f.destinatario_id)
  }
  for (const [orden, ids] of porOrden) {
    const siguiente = ctx.mensajes.get(orden + 1)
    const cambio = siguiente
      ? { siguiente_orden: orden + 1, siguiente_en: siguienteEnvio(base, siguiente.espera_dias, ctx.ventana).toISOString() }
      : { estado: 'terminado', siguiente_orden: orden + 1, siguiente_en: null }
    const { error } = await db.from('helm_email_destinatarios').update({ ...cambio, updated_at: ahora().toISOString() })
      .in('id', ids).eq('siguiente_orden', orden).eq('estado', 'activo')
    if (error) throw error
  }
}

async function anotaIntento(ctx, filas, motivo) {
  const { db, ahora } = ctx
  const porIntentos = new Map()
  for (const f of filas) {
    const n = (Number(f.intentos) || 0) + 1
    if (!porIntentos.has(n)) porIntentos.set(n, [])
    porIntentos.get(n).push(f.id)
  }
  for (const [n, ids] of porIntentos) {
    const { error } = await db.from('helm_email_envios').update({ intentos: Math.min(n, 32000), error: recorta(motivo), actualizado_en: ahora().toISOString() })
      .in('id', ids).eq('estado', 'pendiente')
    if (error) throw error
  }
}

async function sigueActiva(db, id) {
  const { data, error } = await db.from('helm_email_campanas').select('estado').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.estado === 'activa'
}

async function pausa(db, c, motivo) {
  const cuando = new Date().toISOString()
  const { error } = await db.from('helm_email_campanas')
    .update({ estado: 'pausada', pausada_en: cuando, error: recorta(motivo, 1000), updated_at: cuando })
    .eq('id', c.id).eq('estado', 'activa')
  if (error) throw error
}

async function anotaError(db, c, motivo) {
  const { error } = await db.from('helm_email_campanas').update({ error: recorta(motivo, 1000), updated_at: new Date().toISOString() }).eq('id', c.id)
  if (error) throw error
}

async function cierraSiTerminada(db, c, ahora) {
  const { data: quedan, error } = await db.from('helm_email_destinatarios').select('id').eq('campana_id', c.id).eq('estado', 'activo').limit(1)
  if (error) throw error
  if (quedan?.length) return
  const { data: pendientes, error: e2 } = await db.from('helm_email_envios').select('id').eq('campana_id', c.id).eq('estado', 'pendiente').limit(1)
  if (e2) throw e2
  if (pendientes?.length) return
  const cuando = ahora.toISOString()
  const { error: e3 } = await db.from('helm_email_campanas').update({ estado: 'terminada', terminada_en: cuando, updated_at: cuando })
    .eq('id', c.id).eq('estado', 'activa')
  if (e3) throw e3
}
