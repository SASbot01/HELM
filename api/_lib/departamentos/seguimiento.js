// HELM — Ventas · el agente de SEGUIMIENTO.
//
// Cada mañana repasa el CRM del perfil y propone, a quien lleva días parado o
// se le ha escapado una llamada, el mensaje de seguimiento YA ESCRITO con su
// enlace de WhatsApp. No escribe a nadie: lo propone (va a la bandeja y al
// Telegram de la agencia con Aprobar/Rechazar). Al aprobar, se crea la tarea de
// seguimiento en el tablero (herramienta crm_tarea) y el dueño manda el mensaje
// desde su móvil. HELM todavía no envía WhatsApp ni correo.
//
// Tres motivos, de más a menos caliente:
//   (c) formulario recibido sin contestar en 24 h → primer contacto
//   (b) llamada a la que no se presentó (no-show) los últimos 7 días → rescate
//   (a) lead en etapa abierta sin movimiento desde hace ≥ config.dias → recordar
//
// No llama a la IA (su clave no tiene saldo): detecta con datos y redacta con
// plantillas en español natural. Las claves son estables por contacto y motivo
// —y llevan la semana (lunes, Europe/Madrid)— para no proponer dos veces lo
// mismo pero volver a insistir si a la semana siguiente sigue parado.

// ── Fechas en Europe/Madrid ──────────────────────────────────────────────────
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const diaMadrid = (d) => fmtDia.format(new Date(d))
const DIA_MS = 86_400_000

// El lunes de la semana del día (en Madrid), como clave estable de la semana.
function semanaDe(hoy) {
  const d = new Date(`${diaMadrid(hoy)}T00:00:00Z`)
  const lunes = (d.getUTCDay() + 6) % 7 // 0 = lunes
  d.setUTCDate(d.getUTCDate() - lunes)
  return d.toISOString().slice(0, 10)
}

// ── Etapas ───────────────────────────────────────────────────────────────────
// Las etapas son configurables por perfil; se clasifican por lo que significan
// (mismo criterio que src/helm/crm/pipeline.js, sin arrastrar su capa de datos).
const CERRADAS = /won|lost|ganad|perdid|cliente|descart|cerrad/i
const ETAPAS = [
  ['cita', /cita|reunion|reunión|agend|booked|meeting|llamada|demo/i],
  ['propuesta', /propuesta|proposal|presupuesto|negoci|oferta/i],
  ['seguimiento', /seguimiento|followup|follow[_-]?up|nurtur|pensar|pensand/i],
  ['contactado', /contact|calific|cualific|qualified|en[_-]?curso/i],
]
function tipoEtapa(status) {
  const s = String(status || '')
  for (const [k, re] of ETAPAS) if (re.test(s)) return k
  return 'lead'
}

const nombrePila = (n) => String(n || '').trim().split(/\s+/)[0] || ''
const telDe = (c) => c.whatsapp || c.phone || ''

// De dónde llegó, en una frase corta: el reel/anuncio (UTM) o el origen.
function porDonde(c) {
  const utm = c.utm_content || c.utm_campaign || c.utm_source
  if (utm) return String(utm).slice(0, 80)
  if (c.source && !/^web$/i.test(c.source)) return String(c.source).slice(0, 80)
  return ''
}

// La primera respuesta con chicha del formulario, para personalizar el mensaje.
function delFormulario(answers) {
  if (!answers || typeof answers !== 'object') return ''
  for (const v of Object.values(answers)) {
    const t = Array.isArray(v) ? v.join(', ') : String(v || '')
    if (t.trim().length > 3) return t.trim().slice(0, 120)
  }
  return ''
}

// ── Las plantillas (español cercano y corto; sin IA) ─────────────────────────
function mensajeFrio(c) {
  const hola = nombrePila(c.name) ? `Hola ${nombrePila(c.name)}` : 'Hola'
  const donde = porDonde(c) ? ` Llegaste por ${porDonde(c)} y` : ''
  switch (tipoEtapa(c.status || c.stage_key)) {
    case 'cita':
      return `${hola}, ¿seguimos con la llamada? Dime qué día y hora te vienen mejor y lo dejamos cerrado.`
    case 'propuesta':
      return `${hola}, ¿pudiste ver la propuesta? Cualquier duda te la resuelvo encantado y, si encaja, lo ponemos en marcha.`
    case 'seguimiento':
      return `${hola}, ¿cómo lo ves? Sin prisa, pero me gustaría saber si sigue encajando contigo para no dejarte colgado.`
    case 'contactado':
      return `${hola}, retomo nuestra conversación.${donde} me quedé con ganas de ayudarte. ¿Te viene bien que hablemos esta semana?`
    default:
      return `${hola},${donde} me quedé con ganas de contarte cómo te puedo ayudar. ¿Te va bien que lo veamos en un par de minutos?`
  }
}

function mensajeNoShow(nombre, cuando) {
  const hola = nombrePila(nombre) ? `Hola ${nombrePila(nombre)}` : 'Hola'
  const ref = cuando ? ` del ${cuando}` : ''
  return `${hola}, te esperaba en la llamada${ref} y no pudo ser; no pasa nada. ¿La movemos a otro día? Dime dos huecos que te vengan bien y la dejamos cerrada.`
}

function mensajePrimerContacto(c, snippet) {
  const hola = nombrePila(c.name) ? `Hola ${nombrePila(c.name)}` : 'Hola'
  const eco = snippet ? ` Me comentabas lo de «${snippet}».` : ''
  return `${hola}, gracias por escribirnos.${eco} Te leo con atención: ¿te viene bien que hablemos un momento esta semana y te cuento cómo te podemos ayudar?`
}

// ── El agente ────────────────────────────────────────────────────────────────
export default {
  key: 'seguimiento',
  departamento: 'ventas',

  async corre(ctx) {
    const { supabase, clientId, hoy = new Date() } = ctx
    const diasFrio = Number(ctx.config?.dias) > 0 ? Number(ctx.config.dias) : 5
    const maximo = Number(ctx.config?.maximo) > 0 ? Number(ctx.config.maximo) : 10
    const ahora = Date.parse(diaMadrid(hoy) + 'T12:00:00Z') || Date.now()
    const semana = semanaDe(hoy)

    // Todo el CRM de una vez y se filtra en memoria (como el comercial): con
    // pocos contactos es una consulta, y evita pedir operadores raros.
    const { data: contactos, error } = await supabase.from('crm_contacts')
      .select('id, name, email, phone, whatsapp, instagram, status, stage_key, source, deal_value, last_activity_at, created_at, utm_source, utm_campaign, utm_content, pipeline_id')
      .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    const porId = new Map((contactos || []).map(c => [c.id, c]))

    const candidatos = []

    // ── (a) Leads en etapa abierta sin movimiento desde hace ≥ diasFrio ───────
    for (const c of contactos || []) {
      const etapa = c.status || c.stage_key || 'lead'
      if (CERRADAS.test(etapa)) continue
      const quieto = Math.floor((ahora - Date.parse(c.last_activity_at || c.created_at)) / DIA_MS)
      if (!(quieto >= diasFrio)) continue
      const tel = telDe(c)
      candidatos.push({
        score: (Number(c.deal_value) || 0) + Math.min(quieto, 60),
        prop: {
          clave: `seguimiento:frio:${c.id}:${semana}`,
          titulo: `Seguir a ${c.name || 'un lead'} · ${quieto} días parado`,
          porque: `Lleva ${quieto} días sin movimiento en «${etapa}»${Number(c.deal_value) ? ` y mueve ${Math.round(c.deal_value)} €` : ''}. Un toque ahora lo recupera antes de que se enfríe del todo.`,
          herramienta: 'crm_tarea',
          input: { titulo: `Seguimiento: ${c.name || 'lead'}`, contacto: c.id, descripcion: `Lead parado ${quieto} días en «${etapa}». Mándale el WhatsApp de seguimiento.` },
          mensaje: mensajeFrio(c),
          telefono: tel,
          datos: { contactId: c.id, motivo: 'frio', dias: quieto, etapa },
        },
      })
    }

    // ── (b) Llamadas no-show de los últimos 7 días sin reagendar ──────────────
    const desde7 = new Date(ahora - 8 * DIA_MS).toISOString()
    const { data: llamadas, error: eLl } = await supabase.from('helm_calls')
      .select('id, title, starts_at, status, contact_id')
      .eq('client_id', clientId).gte('starts_at', desde7).order('starts_at', { ascending: false }).limit(200)
    if (eLl) throw eLl
    // «Sin reagendar»: no hay otra llamada futura (o posterior) para ese contacto.
    const futurasPorContacto = new Set()
    for (const l of llamadas || []) {
      if (l.contact_id && Date.parse(l.starts_at) >= ahora && l.status !== 'cancelada') futurasPorContacto.add(l.contact_id)
    }
    for (const l of llamadas || []) {
      if (l.status !== 'no_show') continue
      if (Date.parse(l.starts_at) >= ahora) continue
      if (l.contact_id && futurasPorContacto.has(l.contact_id)) continue
      const c = l.contact_id ? porId.get(l.contact_id) : null
      const tel = c ? telDe(c) : ''
      if (!c && !tel) continue // sin ficha ni teléfono no hay a quién escribir
      const nombre = c?.name || l.title || 'el lead'
      candidatos.push({
        score: (Number(c?.deal_value) || 0) + 1000, // un no-show es caliente: reservó y falló
        prop: {
          clave: `seguimiento:noshow:${l.id}:${semana}`,
          titulo: `Rescatar a ${nombre} (no vino a la llamada)`,
          porque: `No se presentó a la llamada del ${diaMadrid(l.starts_at)} y no hay otra agendada. Reservó hora: sigue interesado, solo hay que recolocarla.`,
          herramienta: 'crm_tarea',
          input: { titulo: `Reagendar llamada: ${nombre}`, ...(c ? { contacto: c.id } : {}), descripcion: `No-show del ${diaMadrid(l.starts_at)}. Escríbele para mover la llamada.` },
          mensaje: mensajeNoShow(nombre, diaMadrid(l.starts_at)),
          telefono: tel,
          datos: { contactId: c?.id || null, callId: l.id, motivo: 'noshow' },
        },
      })
    }

    // ── (c) Formularios recibidos sin contestar en 24 h ───────────────────────
    const desde7Resp = new Date(ahora - 7 * DIA_MS).toISOString()
    const { data: respuestas, error: eR } = await supabase.from('helm_form_responses')
      .select('id, contact_id, answers, submitted_at')
      .eq('client_id', clientId).gte('submitted_at', desde7Resp).order('submitted_at', { ascending: false }).limit(300)
    if (eR) throw eR
    // La actividad reciente del perfil, para ver si alguien ya contestó. Lo que
    // deja el propio formulario («Formulario web») no cuenta como contestar.
    const { data: actividades, error: eA } = await supabase.from('crm_activities')
      .select('contact_id, performed_at, performed_by')
      .eq('client_id', clientId).gte('performed_at', desde7Resp).order('performed_at', { ascending: false }).limit(2000)
    if (eA) throw eA
    const contestado = (contactId, trasISO) => (actividades || []).some(a =>
      a.contact_id === contactId && a.performed_at > trasISO && a.performed_by !== 'Formulario web')
    const vistosContacto = new Set()
    for (const r of respuestas || []) {
      if (!r.contact_id) continue // suelta, sin ficha: nada que contactar aún
      if (ahora - Date.parse(r.submitted_at) < DIA_MS) continue // aún no han pasado 24 h
      if (vistosContacto.has(r.contact_id)) continue // solo una por contacto
      vistosContacto.add(r.contact_id)
      const c = porId.get(r.contact_id)
      if (!c) continue
      if (CERRADAS.test(c.status || c.stage_key || '')) continue
      if (contestado(r.contact_id, r.submitted_at)) continue
      const tel = telDe(c)
      candidatos.push({
        score: (Number(c.deal_value) || 0) + 1500, // un lead que acaba de escribir es lo más caliente
        prop: {
          clave: `seguimiento:form:${r.id}`,
          titulo: `Contestar a ${c.name || 'un lead'} (rellenó el formulario)`,
          porque: `Rellenó el formulario el ${diaMadrid(r.submitted_at)} y lleva más de 24 h sin respuesta. El primer contacto rápido es lo que más convierte.`,
          herramienta: 'crm_tarea',
          input: { titulo: `Primer contacto: ${c.name || 'lead'}`, contacto: c.id, descripcion: 'Rellenó el formulario y sigue sin contestar. Mándale el primer mensaje.' },
          mensaje: mensajePrimerContacto(c, delFormulario(r.answers)),
          telefono: tel,
          datos: { contactId: c.id, responseId: r.id, motivo: 'form' },
        },
      })
    }

    // ── Priorizar los más calientes y respetar el tope ────────────────────────
    candidatos.sort((a, b) => b.score - a.score)
    let n = 0
    for (const cand of candidatos.slice(0, maximo)) {
      const r = await ctx.proponer(cand.prop)
      if (r && r.creada !== false) n++
    }

    const resumen = candidatos.length
      ? `${candidatos.length} leads para seguir; propuse ${n}.`
      : 'Nadie parado: el CRM está al día.'
    await ctx.log(resumen)
    return { propuestas: n, resumen }
  },
}
