// HELM — Mi día: los rituales diarios con la IA del perfil.
//
// Siete momentos, cada uno con su pregunta. La IA no organiza a nadie: obliga a
// mirar lo que se hace. Por eso todo se guarda (helm_dia) y cada ritual lee los
// anteriores: mediodía lee el plan de la mañana, la noche lee el día entero y
// la revisión semanal relee la semana.
//
//   GET  ?action=resumen  &clientId=            → lo de hoy, el contexto (tareas
//                                                 abiertas, llamadas de hoy) y
//                                                 los últimos días
//   POST ?action=hacer    &clientId=  { tipo, entrada, callId? }
//                                               → genera, guarda y devuelve
//   POST ?action=borrar   &clientId=  { id }
//
// Cada persona ve lo suyo: las entradas se filtran por el email de la sesión.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { llmChat, proveedorDe } from './_lib/llm.js'
import { claudeTurno } from './_lib/anthropic.js'

// Con qué modelo se contesta. Si el perfil tiene su propio Claude conectado
// (Ajustes → IA), con ese. Si no, con la clave de Claude del servidor —la
// misma que usa el worker de agentes— antes que con el modelo local: estos
// rituales son para leerlos en el momento, y un 7B en CPU ni llega a tiempo ni
// razona lo bastante para decir «por qué fallaría». El local queda de último
// recurso.
const CLAVE_SERVIDOR = process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''
const MODELO_SERVIDOR = process.env.HELM_DIA_MODEL || 'claude-sonnet-5'

async function pregunta(clientId, opts) {
  const prov = await proveedorDe(clientId)
  if (prov.tipo !== 'claude' && CLAVE_SERVIDOR) {
    const r = await claudeTurno({ ...opts, apiKey: CLAVE_SERVIDOR, model: MODELO_SERVIDOR })
    if (r.content) return r.content
  }
  return llmChat({ clientId, ...opts })
}

const TIPOS = ['manana', 'reunion', 'correo', 'idea', 'mediodia', 'noche', 'semana']
const ZONA = 'Europe/Madrid'

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

// El día en la zona del negocio: a las 00:30 de Madrid todavía es «ayer» en UTC.
const diaLocal = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d)
const haceDias = (n) => diaLocal(new Date(Date.now() - n * 86_400_000))
const horaLocal = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA })

const BASE = `Eres el socio de trabajo de quien lleva este negocio. Español de España, directo, sin relleno ni frases de ánimo.
Usa SOLO lo que te dan: no inventes tareas, cifras, personas ni datos. Si falta algo para contestar bien, dilo en una línea.
Sé concreto y breve: cabe en una pantalla de móvil. Markdown sencillo (negritas y listas), sin título inicial.`

const SISTEMAS = {
  manana: `${BASE}
Tu trabajo ahora: de la lista de tareas, decir cuál mueve más el negocio hoy.
Devuelve:
- **La que más mueve**: una sola tarea, y en una frase por qué esa y no otra (dinero que entra, cuello de botella que desbloquea o plazo que vence).
- **Después, en este orden**: como mucho 3 más, una línea cada una.
- **Hoy no**: lo que puede esperar o no debería estar en la lista, sin rodeos.`,
  reunion: `${BASE}
Tu trabajo ahora: preparar una reunión. Devuelve exactamente tres preguntas que a esta persona no se le habrían ocurrido: las que destapan lo que el otro no va a contar solo (qué le frena de verdad, qué ha probado ya, qué pasa si no hace nada). Nada de «cuéntame sobre ti».
Cada pregunta, en negrita, con una línea debajo que diga qué buscas al hacerla. Si con los datos que hay no se puede afinar, dilo y haz las tres mejores preguntas posibles.`,
  correo: `${BASE}
Tu trabajo ahora: un correo largo. Devuelve:
- **En dos líneas**: qué dice y qué quiere de ti quien lo escribe.
- **Qué contestar**: los puntos de la respuesta, y debajo un borrador corto listo para enviar, en el mismo idioma del correo.`,
  idea: `${BASE}
Tu trabajo ahora: decir por qué fallaría esta idea. No la mejores ni la animes: búscale las grietas.
Devuelve las 3 razones más probables de fallo, ordenadas de más a menos grave, cada una con la señal concreta que lo confirmaría. Termina con **La prueba más barata**: lo mínimo que se puede hacer esta semana para saber si la primera razón es cierta.`,
  mediodia: `${BASE}
Tu trabajo ahora: el repaso de mediodía. Tienes el plan de la mañana (si lo hubo) y lo que la persona lleva hecho.
Devuelve:
- **Vas así**: una línea, sin adornos, comparando lo hecho con lo que más movía.
- **Esta tarde**: una o dos cosas, las que quedan de lo importante.
- **Recorta**: lo que sobra de la tarde y se cae sin que pase nada.`,
  noche: `${BASE}
Tu trabajo ahora: el cierre del día. Tienes lo que la persona cuenta que ha salido bien y mal, y lo que pasó hoy (plan, repaso, tareas que siguen abiertas, llamadas de mañana).
Devuelve:
- **Lo que te llevas de hoy**: una o dos líneas, lo que conviene repetir y lo que no.
- **Plan de mañana**: 3 cosas como mucho, en orden, la primera la que más mueve. Si mañana hay llamadas, colócalas.`,
  semana: `${BASE}
Tu trabajo ahora: releer la semana entera y decir en qué se está repitiendo esta persona.
Devuelve:
- **Te repites en**: los patrones que salen más de un día (la misma tarea que se arrastra, el mismo tipo de problema, la misma excusa), citando sus propias palabras entre comillas y el día.
- **Lo que no aparece**: algo importante para un negocio como este que no ha salido en toda la semana.
- **Una sola cosa para la semana que viene**: el cambio que rompería la repetición más cara.
Si hay menos de tres días con algo escrito, dilo: con tan poco no hay patrón, solo anécdota.`,
}

const ETIQUETA = {
  manana: 'Plan de la mañana', reunion: 'Preparación de reunión', correo: 'Correo', idea: 'Idea puesta a prueba',
  mediodia: 'Repaso de mediodía', noche: 'Cierre del día', semana: 'Revisión semanal',
}

// ── Contexto del negocio ────────────────────────────────────────────────────

async function tareasAbiertas(clientId) {
  const { data } = await supabase.from('crm_tasks')
    .select('id, title, description, due_date, priority, status, completed, visibility')
    .eq('client_id', clientId).order('due_date', { ascending: true, nullsFirst: false }).limit(300)
  return (data || [])
    // Las privadas son de quien las creó: no entran en el plan de otro.
    .filter(t => !t.completed && t.status !== 'done' && t.visibility !== 'privada')
    .slice(0, 40)
    .map(t => ({
      id: t.id, title: t.title, description: (t.description || '').slice(0, 200),
      due: t.due_date ? diaLocal(new Date(t.due_date)) : null, priority: t.priority || null,
      enCurso: t.status === 'in_progress' || t.status === 'doing' || t.status === 'review',
    }))
}

async function llamadasEntre(clientId, desde, hasta) {
  const { data } = await supabase.from('helm_calls')
    .select('id, title, starts_at, status, contact_id, attendees, description')
    .eq('client_id', clientId).gte('starts_at', desde).lt('starts_at', hasta)
    .neq('status', 'cancelada').order('starts_at').limit(30)
  return data || []
}

// Hoy y mañana, en hora del negocio (aproximado a ±1 h en el cambio de hora,
// que aquí da igual: es para saber qué reuniones hay cerca).
function ventana(diasDesde, diasHasta) {
  const hoy = diaLocal()
  const base = new Date(`${hoy}T00:00:00Z`).getTime() - 2 * 3600_000
  return [new Date(base + diasDesde * 86_400_000).toISOString(), new Date(base + diasHasta * 86_400_000).toISOString()]
}

const tareasTxt = (ts) => ts.length
  ? ts.map(t => `- ${t.title}${t.due ? ` (vence ${t.due})` : ''}${t.priority ? ` [prioridad ${t.priority}]` : ''}${t.enCurso ? ' [en curso]' : ''}${t.description ? ` — ${t.description}` : ''}`).join('\n')
  : '(no hay tareas abiertas en HELM)'

const llamadasTxt = (cs) => cs.length
  ? cs.map(c => `- ${horaLocal(c.starts_at)} · ${c.title}`).join('\n')
  : '(ninguna)'

async function negocioTxt(clientId) {
  const [{ data: c }, { data: servicios }] = await Promise.all([
    supabase.from('clients').select('name, brand_name').eq('id', clientId).maybeSingle(),
    supabase.from('helm_services').select('name, price, billing, active').eq('client_id', clientId).limit(20),
  ])
  const s = (servicios || []).filter(x => x.active !== false).map(x => `${x.name}${x.price ? ` (${x.price} €)` : ''}`).join(', ')
  return `Negocio: ${c?.brand_name || c?.name || 'sin nombre'}.${s ? ` Vende: ${s}.` : ''}`
}

// Todo lo que HELM sabe de la persona con la que es la reunión.
async function fichaDeLlamada(clientId, callId) {
  const { data: call } = await supabase.from('helm_calls').select('*').eq('id', callId).eq('client_id', clientId).maybeSingle()
  if (!call) throw falla('Esa llamada no existe en este perfil', 404)
  const partes = [
    `Reunión: ${call.title}, ${new Date(call.starts_at).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: ZONA })}.`,
    (call.attendees || []).filter(a => !a.self).length ? `Asisten: ${(call.attendees || []).filter(a => !a.self).map(a => a.name || a.email).join(', ')}.` : '',
    call.description ? `Descripción del evento:\n${String(call.description).slice(0, 1500)}` : '',
  ]
  if (call.contact_id) {
    const [{ data: ct }, { data: acts }, { data: resp }] = await Promise.all([
      supabase.from('crm_contacts').select('name, company, position, status, source, notes, deal_value, custom_fields').eq('id', call.contact_id).maybeSingle(),
      supabase.from('crm_activities').select('type, description, performed_at').eq('contact_id', call.contact_id).order('performed_at', { ascending: false }).limit(12),
      supabase.from('helm_form_responses').select('answers, submitted_at').eq('contact_id', call.contact_id).order('submitted_at', { ascending: false }).limit(3),
    ])
    if (ct) {
      partes.push(`Ficha del CRM: ${ct.name}${ct.company ? `, ${ct.company}` : ''}${ct.position ? ` (${ct.position})` : ''}. Etapa: ${ct.status || '—'}. Origen: ${ct.source || '—'}.${ct.deal_value ? ` Valor: ${ct.deal_value} €.` : ''}${ct.notes ? `\nNotas: ${String(ct.notes).slice(0, 800)}` : ''}`)
    }
    if (resp?.length) {
      partes.push('Lo que contestó en los formularios:\n' + resp.map(r => Object.entries(r.answers || {}).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')).join('\n').slice(0, 2500))
    }
    if (acts?.length) {
      partes.push('Historial:\n' + acts.map(a => `- ${diaLocal(new Date(a.performed_at))} ${a.type}: ${String(a.description || '').slice(0, 200)}`).join('\n'))
    }
  } else {
    partes.push('(Esta reunión no está enlazada a ninguna ficha del CRM.)')
  }
  return { call, texto: partes.filter(Boolean).join('\n\n') }
}

const entradasTxt = (filas) => filas.map(f =>
  `### ${f.fecha} · ${ETIQUETA[f.tipo]}\nLo que contó: ${f.entrada || '(nada)'}\nLo que se le devolvió: ${String(f.salida).slice(0, 1200)}`).join('\n\n')

// ── Lo que se le manda al modelo en cada ritual ─────────────────────────────

async function mensajeDe(tipo, { clientId, autor, entrada, callId }) {
  const hoy = diaLocal()
  const deHoy = async () => {
    const { data } = await supabase.from('helm_dia').select('tipo, fecha, entrada, salida')
      .eq('client_id', clientId).eq('autor', autor).eq('fecha', hoy).order('created_at')
    return data || []
  }
  const negocio = await negocioTxt(clientId)
  let meta = {}

  if (tipo === 'manana') {
    const [tareas, llamadas] = await Promise.all([tareasAbiertas(clientId), llamadasEntre(clientId, ...ventana(0, 1))])
    if (!tareas.length && !entrada) throw falla('No hay tareas abiertas en HELM. Escribe las de hoy y te digo cuál mueve más.')
    meta = { tareas: tareas.length, llamadas: llamadas.length }
    return { meta, user: `${negocio}\n\nTareas abiertas en HELM:\n${tareasTxt(tareas)}\n\nLlamadas de hoy:\n${llamadasTxt(llamadas)}${entrada ? `\n\nLo que añade la persona:\n${entrada}` : ''}` }
  }
  if (tipo === 'reunion') {
    if (!callId && !entrada) throw falla('Elige una llamada o cuenta con quién es la reunión y de qué va.')
    let ficha = ''
    if (callId) {
      const f = await fichaDeLlamada(clientId, callId)
      ficha = f.texto
      meta = { callId, titulo: f.call.title }
    }
    return { meta, user: `${negocio}\n\n${ficha}${entrada ? `\n\nLo que añade la persona:\n${entrada}` : ''}` }
  }
  if (tipo === 'correo') {
    if (entrada.length < 40) throw falla('Pega el correo entero.')
    return { meta, user: `${negocio}\n\nEl correo:\n${entrada}` }
  }
  if (tipo === 'idea') {
    if (entrada.length < 15) throw falla('Cuenta la idea con un poco más de detalle.')
    return { meta, user: `${negocio}\n\nLa idea:\n${entrada}` }
  }
  if (tipo === 'mediodia') {
    if (!entrada) throw falla('Cuenta qué llevas hecho esta mañana.')
    const hoyFilas = (await deHoy()).filter(f => f.tipo === 'manana')
    const tareas = await tareasAbiertas(clientId)
    return { meta, user: `${negocio}\n\n${hoyFilas.length ? `El plan de esta mañana:\n${hoyFilas.at(-1).salida}` : '(Hoy no hubo plan de la mañana.)'}\n\nLo que lleva hecho, en sus palabras:\n${entrada}\n\nTareas que siguen abiertas:\n${tareasTxt(tareas.slice(0, 20))}` }
  }
  if (tipo === 'noche') {
    if (!entrada) throw falla('Cuenta qué ha salido bien y qué no.')
    const [hoyFilas, tareas, manana] = await Promise.all([deHoy(), tareasAbiertas(clientId), llamadasEntre(clientId, ...ventana(1, 2))])
    return { meta, user: `${negocio}\n\nLo que cuenta del día:\n${entrada}\n\n${hoyFilas.length ? `Lo que pasó hoy en Mi día:\n${entradasTxt(hoyFilas)}` : '(Hoy no usó ningún otro ritual.)'}\n\nTareas que siguen abiertas:\n${tareasTxt(tareas.slice(0, 20))}\n\nLlamadas de mañana:\n${llamadasTxt(manana)}` }
  }
  // semana
  const { data: filas } = await supabase.from('helm_dia').select('tipo, fecha, entrada, salida')
    .eq('client_id', clientId).eq('autor', autor).gte('fecha', haceDias(7)).neq('tipo', 'semana')
    .order('fecha').order('created_at').limit(80)
  if (!filas?.length) throw falla('Esta semana todavía no hay nada que releer. Usa los rituales del día unos días y vuelve.')
  meta = { entradas: filas.length, dias: new Set(filas.map(f => f.fecha)).size }
  return { meta, user: `${negocio}\n\nTodo lo de los últimos 7 días (${meta.dias} días con algo escrito):\n\n${entradasTxt(filas)}${entrada ? `\n\nLo que añade la persona:\n${entrada}` : ''}` }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)
    const autor = auth.email || auth.userId || 'anon'
    const accion = String(req.query?.action || '')
    const b = req.body || {}

    if (accion === 'resumen') {
      const [entradas, tareas, llamadas] = await Promise.all([
        supabase.from('helm_dia').select('id, tipo, fecha, entrada, salida, meta, created_at')
          .eq('client_id', clientId).eq('autor', autor).gte('fecha', haceDias(14))
          .order('created_at', { ascending: false }).limit(120),
        tareasAbiertas(clientId),
        llamadasEntre(clientId, ...ventana(0, 2)),
      ])
      if (entradas.error) throw entradas.error
      return res.status(200).json({
        hoy: diaLocal(),
        entradas: entradas.data || [],
        tareas: tareas.map(t => ({ id: t.id, title: t.title, due: t.due })),
        llamadas: llamadas.map(c => ({ id: c.id, title: c.title, starts_at: c.starts_at, conFicha: Boolean(c.contact_id) })),
      })
    }

    if (accion === 'hacer' && req.method === 'POST') {
      const tipo = String(b.tipo || '')
      if (!TIPOS.includes(tipo)) throw falla('Ritual desconocido')
      // Cada uno cuesta una llamada al modelo: que un bucle no la dispare cien veces.
      const gate = rateLimit({ key: `dia:${clientId}:${autor}`, max: 20, windowMs: 10 * 60_000 })
      if (!gate.ok) throw falla('Demasiadas peticiones seguidas. Espera unos minutos.', 429)

      const entrada = String(b.entrada || '').trim().slice(0, 12_000)
      const { user, meta } = await mensajeDe(tipo, { clientId, autor, entrada, callId: b.callId ? String(b.callId) : null })

      let salida
      try {
        salida = await pregunta(clientId, {
          system: SISTEMAS[tipo], messages: [{ role: 'user', content: user }],
          temperature: tipo === 'idea' || tipo === 'reunion' ? 0.7 : 0.4, maxTokens: 900,
        })
      } catch (e) {
        if (/modelo local|not found|ECONNREFUSED|fetch failed/i.test(e.message)) {
          throw falla('La IA de este perfil no está disponible ahora mismo. Conecta Claude en Ajustes → IA y vuelve a intentarlo.', 503)
        }
        throw e
      }

      const { data, error } = await supabase.from('helm_dia').insert({
        client_id: clientId, tipo, fecha: diaLocal(), autor, entrada, salida, meta,
      }).select('id, tipo, fecha, entrada, salida, meta, created_at').single()
      if (error) throw error
      return res.status(200).json({ entrada: data })
    }

    if (accion === 'borrar' && req.method === 'POST') {
      const { error } = await supabase.from('helm_dia').delete()
        .eq('id', String(b.id || '')).eq('client_id', clientId).eq('autor', autor)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    return res.status(code).json({ error: e.message })
  }
}
