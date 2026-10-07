// HELM — recepción de formularios alojados FUERA de HELM.
//
// La página pública de HELM (/f/<id>) escribe directa contra Supabase con la
// anon key. Eso no vale cuando el formulario vive en la web del cliente
// (detrasdecamara.org/valor): habría que publicar la anon key de HELM en un
// dominio ajeno. Por eso esto es un endpoint de servidor: la landing manda un
// POST y aquí dentro, con la service key, se hace lo que importa —
//
//   1. Buscar (o crear) el contacto en el CRM del perfil.
//   2. Guardar las respuestas pegadas a esa ficha.
//   3. Dejar constancia en la actividad del contacto.
//
// Es público a propósito: lo llama gente de la calle desde su navegador. La
// defensa no es un token (estaría en el HTML de la landing igualmente), sino
// que solo se acepta lo que ya existe: un perfil activo, un formulario activo
// de ese perfil, y con límite por IP.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import {
  getGoogleConfig, getAccessToken, crearEventoEnCalendar, puedeEscribirEnAgenda,
} from './_lib/google.js'
import { notificar } from './_lib/notificar.js'

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

const txt = (v, max = 400) => String(v == null ? '' : v).trim().slice(0, max)

// Handle de Instagram: llega como "@juan", "juan" o la URL entera.
const handle = (v) => txt(v, 120)
  .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
  .replace(/^@+/, '')
  .replace(/[/?#].*$/, '')

// Para comparar teléfonos: los últimos 9 dígitos. Así "+34 600 11 22 33" y
// "0034600112233" son el mismo número, que es como los escribe la gente.
const cola = (v) => String(v || '').replace(/\D/g, '').slice(-9)

/**
 * Pipeline y etapa de entrada de los leads de un formulario.
 *
 * Solo se aplica al CREAR el contacto. A quien ya está en el CRM no se le
 * mueve: si alguien lleva semanas en "propuesta" y vuelve a rellenar un
 * formulario, sacarlo de ahí y devolverlo a "lead" borraría el trabajo del
 * comercial — el mismo criterio que ya se usa para no pisarle los datos.
 */
async function destinoDe(form) {
  const sinEmbudo = { pipelineId: null, stage: 'lead', stageReservado: null }
  if (!form?.pipeline_id) return sinEmbudo

  const { data: pipeline } = await supabase
    .from('crm_pipelines').select('id, stages').eq('id', form.pipeline_id).maybeSingle()
  // El pipeline pudo borrarse después de configurar el formulario. Mejor un
  // lead en el embudo por defecto que un contacto apuntando a algo que no está.
  if (!pipeline) return sinEmbudo

  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : []
  const existe = (key) => stages.find(s => s.key === key)?.key || null
  return {
    pipelineId: pipeline.id,
    stage: existe(form.stage_key) || stages[0]?.key || 'lead',
    // La etapa de "ya ha reservado hora", si el formulario la declara y sigue
    // existiendo en el embudo. Null = este formulario no distingue las dos
    // cosas y todos sus leads entran igual.
    stageReservado: existe(form.booked_stage_key),
  }
}

/**
 * Mueve al contacto a la etapa de "ya ha reservado" cuando el formulario se
 * completa eligiendo hora.
 *
 * Esto es la excepción a la regla de no tocar a quien ya está en el CRM, y
 * tiene motivo: los formularios de dos pasos (la carta de ventas de Detrás de
 * Cámara: primero el contacto, después cualificar y elegir hueco) crean el
 * contacto en el paso 1, cuando todavía no ha reservado nada. Sin esto, el
 * embudo no distingue a quien dejó el email de quien va a estar en la llamada,
 * que es justo lo que hay que ver.
 *
 * No es "un lead que vuelve a rellenar el formulario semanas después": es el
 * mismo envío terminándose. Aun así solo se mueve a quien sigue en la etapa de
 * entrada — si el comercial ya lo trabajó, no se le pisa el trabajo.
 */
async function avanzarPorReserva(form, contactId) {
  if (!form?.booked_stage_key || !contactId) return

  const destino = await destinoDe(form)
  if (!destino.stageReservado) return

  const { data: contacto } = await supabase
    .from('crm_contacts').select('id, status, pipeline_id').eq('id', contactId).maybeSingle()
  if (!contacto || contacto.status !== destino.stage) return

  const { error } = await supabase.from('crm_contacts').update({
    status: destino.stageReservado,
    pipeline_id: contacto.pipeline_id || destino.pipelineId,
    last_activity_at: new Date().toISOString(),
  }).eq('id', contactId)
  if (error) console.warn('[formularios] no se pudo mover el contacto a reservado:', error.message)
}

// ── La reunión en el calendario, y el aviso ─────────────────────────────────
// Un único sitio para las dos formas de reservar: la que manda la hora con los
// datos de contacto y la que la elige en un paso posterior. Antes solo la
// primera creaba el evento, y las reservas de los formularios por pasos se
// quedaban en el CRM sin llegar nunca al calendario.
//
// Si Google falla, la reserva sigue adelante sin evento: el lead ya ha elegido
// su hora y perderlo por un fallo de calendario sería mucho peor que una
// reunión que hay que apuntar a mano. Pero se AVISA: en silencio es como se
// pierde un mes de llamadas.
const cuandoLabel = (iso) => new Date(iso).toLocaleString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
})

async function agendarLlamada(client, form, { nombre, email, telefono, respuestas, meta }) {
  let evento = null
  let fallo = null
  try {
    const cfgG = (await getGoogleConfig(supabase, client.id))?.config
    if (!cfgG?.refreshToken) {
      fallo = 'el perfil no tiene Google Calendar conectado'
    } else if (!puedeEscribirEnAgenda(cfgG.scopes)) {
      fallo = 'Google está conectado sin permiso para crear eventos; hay que volver a conectarlo en Ajustes'
    } else {
      const { token } = await getAccessToken(supabase, client.id)
      const fin = meta.slot_end || new Date(new Date(meta.slot_start).getTime() + 30 * 60000).toISOString()
      evento = await crearEventoEnCalendar(token, {
        calendarId: cfgG.calendarId || 'primary',
        titulo: `Llamada · ${nombre || email || 'lead'}`,
        descripcion: [
          `Lead de ${form.title}.`,
          email ? `Email: ${email}` : '',
          telefono ? `Teléfono: ${telefono}` : '',
          '',
          ...Object.entries(respuestas || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`),
        ].filter(Boolean).join('\n'),
        inicio: meta.slot_start,
        fin,
        invitado: email || null,
      })
    }
  } catch (err) {
    fallo = err.message
  }
  if (fallo) console.warn('[formularios] no se pudo crear el evento:', fallo)

  const quien = nombre || email || 'Un lead'
  const cuando = cuandoLabel(meta.slot_start)
  await notificar(supabase, client.id, {
    tipo: 'reserva', titulo: `Llamada agendada · ${quien}`,
    cuerpo: [cuando, email, telefono, evento?.meet ? `Meet: ${evento.meet}` : ''].filter(Boolean).join('\n'),
    destino: 'llamadas', meta: { slot_start: meta.slot_start, evento_id: evento?.id || null },
  })
  if (fallo) {
    await notificar(supabase, client.id, {
      tipo: 'calendario', nivel: 'error',
      titulo: 'Una reserva no ha llegado a Google Calendar',
      cuerpo: `${quien}, ${cuando}. Apúntala a mano. Motivo: ${fallo}`.slice(0, 600),
      destino: 'ajustes',
    })
  }
  return evento
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  try {
    const ip = getClientIp(req)
    const limite = rateLimit({ key: `formularios:${ip || 'anon'}`, max: 20, windowMs: 60_000 })
    if (!limite.ok) {
      res.setHeader('Retry-After', String(limite.retryAfter || 60))
      return res.status(429).json({ error: 'Demasiados envíos seguidos. Espera un minuto.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const slug = txt(body.slug, 80).toLowerCase()
    const formSlug = txt(body.form, 80).toLowerCase()
    if (!slug || !formSlug) return res.status(400).json({ error: 'Faltan slug y form' })

    // ── El perfil y su formulario ──────────────────────────────────────────
    const { data: client } = await supabase
      .from('clients').select('id, active').eq('slug', slug).maybeSingle()
    if (!client || client.active === false) {
      return res.status(404).json({ error: 'Perfil no encontrado' })
    }

    const { data: form } = await supabase
      .from('helm_forms').select('id, title, fields, active, pipeline_id, stage_key, booked_stage_key')
      .eq('client_id', client.id).eq('slug', formSlug).maybeSingle()
    if (!form) return res.status(404).json({ error: 'Formulario no encontrado' })
    if (form.active === false) return res.status(410).json({ error: 'Este formulario ya no admite respuestas' })

    // Solo se guardan las claves que el formulario declara. Si no, cualquiera
    // podría meter un jsonb enorme de basura en la ficha de un contacto.
    const claves = new Set((form.fields || []).map(f => f.key))
    const entrada = body.respuestas && typeof body.respuestas === 'object' ? body.respuestas : {}
    const respuestas = {}
    for (const [k, v] of Object.entries(entrada)) {
      if (!claves.has(k)) continue
      respuestas[k] = Array.isArray(v) ? v.slice(0, 40).map(x => txt(x, 300)) : txt(v, 4000)
    }

    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {}

    // La prueba del consentimiento, si la landing la manda: qué casilla marcó
    // y con qué texto. La fecha la pone el servidor, no el navegador.
    const consentimiento = body.consentimiento || meta.consentimiento
    if (consentimiento && typeof consentimiento === 'object') {
      meta.consentimiento = {
        aceptado: consentimiento.aceptado === true,
        texto: txt(consentimiento.texto, 300),
        fecha: new Date().toISOString(),
      }
    } else delete meta.consentimiento

    // ── El hueco, si reserva llamada ───────────────────────────────────────
    // Dos personas pueden abrir la landing a la vez y elegir la misma hora: los
    // huecos se calcularon antes de que ninguna enviara. Se comprueba aquí, que
    // es el único punto por el que pasan las dos.
    //
    // El 409 es el código que la landing ya sabe interpretar: recarga los
    // huecos y le pide que elija otro, en vez de dar un error genérico.
    if (meta.slot_start) {
      const { data: pillado } = await supabase
        .from('helm_form_responses').select('id')
        .eq('client_id', client.id)
        .eq('meta->>slot_start', meta.slot_start)
        .limit(1)
      if (pillado?.length) {
        return res.status(409).json({ error: 'Ese horario acaba de ocuparse. Elige otro.' })
      }
    }

    // ── Completar una respuesta ya empezada ────────────────────────────────
    // Los formularios de varios pasos (la calculadora de Hugo: primero los
    // datos, después el cálculo) mandan lo que tienen en cada paso. Si se
    // creara una respuesta por paso, el que abandona a mitad dejaría una ficha
    // con dos entradas a medias. Con el id de la primera se completa aquella.
    //
    // Va ANTES de validar los datos de contacto: en el segundo paso ya no hay
    // nombre ni email que mandar, y el contacto no se toca.
    const responseId = txt(body.responseId, 64)
    if (responseId) {
      const { data: previa } = await supabase
        .from('helm_form_responses').select('id, contact_id, answers, meta')
        .eq('id', responseId).eq('form_id', form.id).maybeSingle()
      if (!previa) return res.status(404).json({ error: 'Respuesta no encontrada' })

      const { error: errMerge } = await supabase.from('helm_form_responses').update({
        answers: { ...(previa.answers || {}), ...respuestas },
        meta: { ...(previa.meta || {}), ...meta, completado_en: new Date().toISOString() },
      }).eq('id', previa.id)
      if (errMerge) return res.status(500).json({ error: 'No se pudo completar la respuesta: ' + errMerge.message })

      // Si en este paso ha elegido hora, deja de ser un lead a medias. Se mueve
      // de etapa y se anota en el timeline: quien abre la ficha antes de la
      // llamada tiene que ver cuándo es sin abrir la respuesta.
      //
      // La fecha se comprueba porque `meta` viene de fuera: una cadena que no
      // sea una fecha reventaría el formateo y devolvería un 500 por una
      // respuesta que ya se ha guardado bien.
      const cuando = new Date(meta.slot_start || '')
      // Solo la primera vez que llega la hora: reenviar el paso no duplica la
      // reunión ni el aviso.
      if (!Number.isNaN(cuando.getTime()) && !previa.meta?.slot_start) {
        let contacto = null
        if (previa.contact_id) {
          const { data } = await supabase.from('crm_contacts')
            .select('name, email, phone').eq('id', previa.contact_id).maybeSingle()
          contacto = data
        }
        const evento = await agendarLlamada(client, form, {
          nombre: contacto?.name || '', email: contacto?.email || '', telefono: contacto?.phone || '',
          respuestas: { ...(previa.answers || {}), ...respuestas }, meta,
        })
        if (evento) {
          const { error: errEv } = await supabase.from('helm_form_responses').update({
            meta: {
              ...(previa.meta || {}), ...meta, completado_en: new Date().toISOString(),
              evento_id: evento.id, evento_url: evento.htmlLink, meet_url: evento.meet,
            },
          }).eq('id', previa.id)
          if (errEv) console.warn('[formularios] enlace del evento:', errEv.message)
        }
      }
      if (previa.contact_id && !Number.isNaN(cuando.getTime())) {
        await avanzarPorReserva(form, previa.contact_id)
        const { error: errAct } = await supabase.from('crm_activities').insert({
          client_id: client.id,
          contact_id: previa.contact_id,
          type: 'meeting',
          description: `Llamada reservada · ${cuando.toLocaleString('es-ES', {
            dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid',
          })}`,
          performed_at: new Date().toISOString(),
          performed_by: 'Formulario web',
        })
        if (errAct) console.warn('[formularios] actividad de reserva:', errAct.message)
      }

      return res.status(200).json({ ok: true, contactId: previa.contact_id, responseId: previa.id })
    }

    // ── El contacto ────────────────────────────────────────────────────────
    const nombre = txt(body.nombre, 160)
    const email = txt(body.email, 200).toLowerCase()
    const telefono = txt(body.telefono, 40)
    // El negocio de quien escribe, cuando la landing lo pregunta (la de Sergio
    // Amorós: sus leads son empresas, no particulares). Es una columna del CRM,
    // no una respuesta del formulario, así que se trata como el resto de datos
    // de contacto y no pasa por la lista de claves declaradas.
    const empresa = txt(body.empresa, 200)
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre' })
    if (email && !RE_EMAIL.test(email)) return res.status(400).json({ error: 'Email no válido' })
    if (!email && !telefono) return res.status(400).json({ error: 'Hace falta un email o un teléfono' })

    // Quien vuelve a rellenar el formulario tiene que caer en su ficha de
    // siempre, no crear una nueva. Primero por email (comparación exacta, la
    // hace la base); solo si eso falla se baja la lista para comparar
    // teléfonos, que hay que normalizar en memoria porque están escritos de mil
    // formas ("+34 600 11 22 33", "0034600112233"…).
    const instagram = handle(body.instagram)
    const telCola = cola(telefono)
    let contacto = null

    if (email) {
      const { data } = await supabase.from('crm_contacts')
        .select('id, email, phone, instagram, company')
        .eq('client_id', client.id).eq('email', email).limit(1)
      contacto = data?.[0] || null
    }
    if (!contacto && telCola.length >= 9) {
      const { data } = await supabase.from('crm_contacts')
        .select('id, email, phone, instagram, company')
        .eq('client_id', client.id).not('phone', 'is', null).limit(5000)
      contacto = (data || []).find(c => cola(c.phone) === telCola) || null
    }

    let contactId = contacto?.id || null
    let creado = false

    if (contactId) {
      // Solo se rellenan los huecos: si el equipo ya corrigió un dato a mano,
      // un formulario nuevo no debe machacárselo.
      const patch = { last_activity_at: new Date().toISOString() }
      if (!contacto.email && email) patch.email = email
      if (!contacto.phone && telefono) { patch.phone = telefono; patch.whatsapp = telefono }
      if (!contacto.instagram && instagram) patch.instagram = instagram
      if (!contacto.company && empresa) patch.company = empresa
      await supabase.from('crm_contacts').update(patch).eq('id', contactId)
    } else {
      // A qué embudo entra. El formulario lo decide; si no lo dice, se queda
      // como siempre: pipeline por defecto y etapa 'lead'.
      const destino = await destinoDe(form)
      const { data: nuevo, error } = await supabase.from('crm_contacts').insert({
        client_id: client.id,
        name: nombre,
        email,
        phone: telefono,
        whatsapp: telefono,
        instagram,
        company: empresa,
        source: txt(body.origen, 60) || 'Web',
        // Si el envío ya trae hora (llegó de una sola vez, sin pasar por el
        // paso 1), no es un lead: es alguien con la llamada puesta. Entra ya en
        // la etapa de reservado en vez de esperar a que alguien lo mueva.
        status: (meta.slot_start && destino.stageReservado) || destino.stage,
        pipeline_id: destino.pipelineId,
        // De qué anuncio viene. Va también a las columnas del CRM y no solo al
        // meta de la respuesta: la vista de Ventas filtra por estas columnas, y
        // dejarlas vacías esconde de dónde salió cada venta.
        utm_source: txt(meta.utm_source, 200) || null,
        utm_medium: txt(meta.utm_medium, 200) || null,
        utm_campaign: txt(meta.utm_campaign, 200) || null,
        utm_content: txt(meta.utm_content, 200) || null,
        last_activity_at: new Date().toISOString(),
      }).select('id').single()
      if (error) return res.status(500).json({ error: 'No se pudo crear el contacto: ' + error.message })
      contactId = nuevo.id
      creado = true
    }

    // ── La reunión en el calendario ────────────────────────────────────────
    // Se crea ANTES de guardar la respuesta para poder meter el enlace de Meet
    // dentro de ella.
    const evento = meta.slot_start
      ? await agendarLlamada(client, form, { nombre, email, telefono, respuestas, meta })
      : null

    // ── La respuesta ───────────────────────────────────────────────────────
    const { data: respuesta, error: errResp } = await supabase
      .from('helm_form_responses').insert({
        client_id: client.id,
        form_id: form.id,
        contact_id: contactId,
        respondent: [nombre, email].filter(Boolean).join(' · '),
        answers: respuestas,
        meta: {
          ...meta,
          ip: ip || null,
          recibido_en: new Date().toISOString(),
          // Para poder abrir la reunión desde la ficha del CRM sin buscarla.
          ...(evento ? { evento_id: evento.id, evento_url: evento.htmlLink, meet_url: evento.meet } : {}),
        },
      }).select('id, submitted_at').single()
    if (errResp) return res.status(500).json({ error: 'No se pudo guardar la respuesta: ' + errResp.message })

    // Constancia en el timeline. Se espera de verdad: en serverless, devolver
    // la respuesta puede congelar la función y dejar el insert a medias. Si
    // falla no se aborta nada — la respuesta ya está guardada, que es lo que no
    // se puede perder.
    const { error: errAct } = await supabase.from('crm_activities').insert({
      client_id: client.id,
      contact_id: contactId,
      type: 'note',
      description: `${form.title} recibido${meta.lead_tier ? ` · lead ${meta.lead_tier}` : ''}${
        Number.isFinite(Number(meta.lead_score)) ? ` (${Number(meta.lead_score)}/100)` : ''}`,
      performed_at: new Date().toISOString(),
      performed_by: 'Formulario web',
    })
    if (errAct) console.warn('[formularios] actividad:', errAct.message)

    // La reserva ya ha avisado por su cuenta; aquí, el lead que entra sin hora.
    if (!meta.slot_start) {
      await notificar(supabase, client.id, {
        tipo: 'lead', titulo: `${creado ? 'Lead nuevo' : 'Respuesta nueva'} · ${nombre || email || telefono}`,
        cuerpo: [form.title, email, telefono].filter(Boolean).join('\n'),
        destino: 'crm',
      })
    }

    return res.status(200).json({
      ok: true,
      contactId,
      contactoCreado: creado,
      responseId: respuesta.id,
    })
  } catch (err) {
    console.error('[formularios]', err)
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}
