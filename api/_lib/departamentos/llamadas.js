// HELM — Ventas · el PREPARADOR DE LLAMADAS.
//
// Dos cosas cada mañana:
//   1) Para las llamadas de HOY, un parte por Telegram (ctx.avisar) con la
//      ficha de cada una: quién, a qué hora, qué contestó en el formulario, por
//      dónde llegó (UTM/reel/anuncio), el historial del CRM, la conversación
//      con el setter si la hay, y 2-3 objeciones probables según su caso.
//   2) Para las llamadas ya pasadas sin resultado apuntado, una propuesta
//      «Apunta el resultado de la llamada con X» (herramienta crm_nota), para
//      que no se queden sin cerrar en el CRM.
//
// El parte es un aviso suelto (no toca nada). Lo de apuntar el resultado sí
// toca el CRM, así que se propone. Sin IA: datos + plantillas en español.

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const diaMadrid = (d) => fmtDia.format(new Date(d))
const horaMadrid = (d) => fmtHora.format(new Date(d))
const DIA_MS = 86_400_000
const recorta = (t, n) => { const s = String(t ?? '').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s }

const porDonde = (c) => {
  if (!c) return ''
  const utm = c.utm_content || c.utm_campaign || c.utm_source
  if (utm) return String(utm).slice(0, 80)
  if (c.source) return String(c.source).slice(0, 80)
  return ''
}

// Lo que escribió en el formulario, en dos o tres líneas.
function lineasFormulario(answers) {
  if (!answers || typeof answers !== 'object') return []
  return Object.entries(answers)
    .map(([k, v]) => `   · ${k}: ${Array.isArray(v) ? v.join(', ') : String(v || '')}`.trim())
    .filter(l => l.length > 6).slice(0, 4)
}

// Objeciones probables según el caso. Sin IA: las de siempre, ordenadas por lo
// que suele pesar en cada etapa/ticket, 2-3 como mucho.
function objeciones(c) {
  const alto = Number(c?.deal_value) >= 1000
  const todas = [
    'Precio («¿no es caro?») → ancla en lo que gana, no en lo que cuesta.',
    alto
      ? 'Decisión («lo tengo que consultar») → cierra el siguiente paso con fecha y con quien decide.'
      : 'Decisión («me lo pienso») → cierra el siguiente paso con fecha, no lo dejes al aire.',
    'Tiempo («ahora no tengo tiempo») → enséñale que es poco al día y que lo pesado lo llevas tú.',
    'Confianza («¿funciona en mi caso?») → un ejemplo parecido al suyo.',
  ]
  return todas.slice(0, 3)
}

// La ficha de una llamada para el parte de Telegram.
function fichaLlamada(l, { contacto, respuesta, historial, setter }) {
  const nombre = contacto?.name || l.title || 'Sin ficha'
  const lineas = [`🕒 ${horaMadrid(l.starts_at)} · ${nombre}${contacto ? '' : ' · sin ficha en el CRM'}`]
  const donde = porDonde(contacto)
  if (donde) lineas.push(`  Llegó por: ${donde}`)
  if (contacto?.deal_value) lineas.push(`  Ticket: ${Math.round(contacto.deal_value)} €`)
  const form = lineasFormulario(respuesta?.answers)
  if (form.length) lineas.push('  Dijo en el formulario:', ...form)
  if (historial?.length) {
    lineas.push('  Historial:')
    for (const h of historial.slice(0, 3)) lineas.push(`   · ${diaMadrid(h.performed_at)} ${recorta(h.title || h.description || h.type || 'actividad', 80)}`)
  }
  if (setter?.length) {
    lineas.push('  Con el setter:')
    for (const m of setter.slice(-3)) lineas.push(`   · ${m.autor === 'lead' ? 'Él' : 'Nosotros'}: ${recorta(m.texto, 100)}`)
  }
  lineas.push('  Objeciones probables:')
  for (const o of objeciones(contacto)) lineas.push(`   · ${o}`)
  return lineas.join('\n')
}

export default {
  key: 'llamadas',
  departamento: 'ventas',

  async corre(ctx) {
    const { supabase, clientId, hoy = new Date() } = ctx
    const maximo = Number(ctx.config?.maximo) > 0 ? Number(ctx.config.maximo) : 10
    const ahora = hoy instanceof Date ? hoy.getTime() : Date.parse(hoy) || Date.now()
    const hoyDia = diaMadrid(hoy)

    // Llamadas de la última semana y las próximas 48 h (no canceladas).
    const { data: llamadas, error } = await supabase.from('helm_calls')
      .select('id, title, starts_at, status, outcome, contact_id')
      .eq('client_id', clientId)
      .gte('starts_at', new Date(ahora - 8 * DIA_MS).toISOString())
      .order('starts_at', { ascending: true }).limit(200)
    if (error) throw error
    const vivas = (llamadas || []).filter(l => l.status !== 'cancelada')

    const deHoy = vivas.filter(l => diaMadrid(l.starts_at) === hoyDia)
    const pasadasSinResultado = vivas.filter(l =>
      Date.parse(l.starts_at) < ahora && !l.outcome && (l.status === 'agendada' || !l.status))

    // Las fichas: de las llamadas de hoy (para el parte) y de las pasadas (para
    // nombrar a quién hay que apuntarle el resultado).
    const idsHoy = [...new Set(deHoy.map(l => l.contact_id).filter(Boolean))]
    const idsFicha = [...new Set([...idsHoy, ...pasadasSinResultado.map(l => l.contact_id).filter(Boolean)])]
    let porId = new Map(), respPorContacto = new Map(), histPorContacto = new Map(), convPorContacto = new Map()
    if (idsFicha.length) {
      const { data: contactos } = await supabase.from('crm_contacts')
        .select('id, name, email, phone, status, stage_key, source, deal_value, utm_source, utm_campaign, utm_content')
        .eq('client_id', clientId).in('id', idsFicha)
      porId = new Map((contactos || []).map(c => [c.id, c]))
    }
    if (idsHoy.length) {
      const [{ data: respuestas }, { data: actividades }, { data: convs }] = await Promise.all([
        supabase.from('helm_form_responses').select('contact_id, answers, submitted_at')
          .eq('client_id', clientId).in('contact_id', idsHoy).order('submitted_at', { ascending: false }).limit(200),
        supabase.from('crm_activities').select('contact_id, type, title, description, performed_at')
          .eq('client_id', clientId).in('contact_id', idsHoy).order('performed_at', { ascending: false }).limit(500),
        supabase.from('helm_ig_conversaciones').select('id, contact_id')
          .eq('client_id', clientId).in('contact_id', idsHoy).limit(100),
      ])
      for (const r of respuestas || []) if (!respPorContacto.has(r.contact_id)) respPorContacto.set(r.contact_id, r)
      for (const a of actividades || []) {
        const l = histPorContacto.get(a.contact_id) || []
        l.push(a); histPorContacto.set(a.contact_id, l)
      }
      const convIds = (convs || []).map(c => c.id)
      if (convIds.length) {
        const { data: mensajes } = await supabase.from('helm_ig_mensajes')
          .select('conversacion_id, autor, texto, created_at')
          .eq('client_id', clientId).in('conversacion_id', convIds).order('created_at', { ascending: true }).limit(500)
        const porConv = new Map()
        for (const m of mensajes || []) { const l = porConv.get(m.conversacion_id) || []; if (m.texto) l.push(m); porConv.set(m.conversacion_id, l) }
        for (const c of convs || []) if (c.contact_id) convPorContacto.set(c.contact_id, porConv.get(c.id) || [])
      }
    }

    // 1) El parte de hoy (un solo aviso con todas las fichas).
    if (deHoy.length) {
      const cabecera = `📞 Llamadas de hoy (${hoyDia}) · ${deHoy.length}`
      const fichas = deHoy.map(l => fichaLlamada(l, {
        contacto: porId.get(l.contact_id),
        respuesta: respPorContacto.get(l.contact_id),
        historial: histPorContacto.get(l.contact_id),
        setter: convPorContacto.get(l.contact_id),
      }))
      await ctx.avisar([cabecera, ...fichas].join('\n\n'))
    }

    // 2) Apuntar el resultado de las llamadas ya pasadas sin resultado.
    let n = 0
    for (const l of pasadasSinResultado.slice(0, maximo)) {
      const c = l.contact_id ? (porId.get(l.contact_id) || null) : null
      const quien = c?.name || l.title || 'el lead'
      // Sin ficha en el CRM no hay dónde apuntar la nota: se deja fuera.
      if (!c) continue
      const r = await ctx.proponer({
        clave: `llamadas:resultado:${l.id}`,
        titulo: `Apunta el resultado de la llamada con ${quien}`,
        porque: `La llamada del ${diaMadrid(l.starts_at)} ya pasó y no tiene resultado apuntado. Déjalo en su ficha para no perder el hilo (¿avanzó, se cayó, hay que reagendar?).`,
        herramienta: 'crm_nota',
        input: { contacto: c.id, titulo: 'Resultado de la llamada', texto: `Llamada del ${diaMadrid(l.starts_at)} (${l.title || 'sin título'}) — resultado: ` },
        datos: { contactId: c.id, callId: l.id, motivo: 'resultado' },
      })
      if (r && r.creada !== false) n++
    }

    const resumen = `Hoy: ${deHoy.length} ${deHoy.length === 1 ? 'llamada' : 'llamadas'}${deHoy.length ? ' (parte enviado)' : ''}. Sin resultado: ${pasadasSinResultado.length}, propuse ${n}.`
    await ctx.log(resumen)
    return { propuestas: n, resumen }
  },
}
