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
  if (!form?.pipeline_id) return { pipelineId: null, stage: 'lead' }

  const { data: pipeline } = await supabase
    .from('crm_pipelines').select('id, stages').eq('id', form.pipeline_id).maybeSingle()
  // El pipeline pudo borrarse después de configurar el formulario. Mejor un
  // lead en el embudo por defecto que un contacto apuntando a algo que no está.
  if (!pipeline) return { pipelineId: null, stage: 'lead' }

  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : []
  const elegida = stages.find(s => s.key === form.stage_key)
  return {
    pipelineId: pipeline.id,
    stage: elegida?.key || stages[0]?.key || 'lead',
  }
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
      .from('helm_forms').select('id, title, fields, active, pipeline_id, stage_key')
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

      return res.status(200).json({ ok: true, contactId: previa.contact_id, responseId: previa.id })
    }

    // ── El contacto ────────────────────────────────────────────────────────
    const nombre = txt(body.nombre, 160)
    const email = txt(body.email, 200).toLowerCase()
    const telefono = txt(body.telefono, 40)
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
        .select('id, email, phone, instagram')
        .eq('client_id', client.id).eq('email', email).limit(1)
      contacto = data?.[0] || null
    }
    if (!contacto && telCola.length >= 9) {
      const { data } = await supabase.from('crm_contacts')
        .select('id, email, phone, instagram')
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
        source: txt(body.origen, 60) || 'Web',
        status: destino.stage,
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

    // ── La respuesta ───────────────────────────────────────────────────────
    const { data: respuesta, error: errResp } = await supabase
      .from('helm_form_responses').insert({
        client_id: client.id,
        form_id: form.id,
        contact_id: contactId,
        respondent: [nombre, email].filter(Boolean).join(' · '),
        answers: respuestas,
        meta: { ...meta, ip: ip || null, recibido_en: new Date().toISOString() },
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
