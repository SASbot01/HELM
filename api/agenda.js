// HELM — los huecos libres de un perfil, para que un lead reserve su llamada.
//
//   GET ?slug=<perfil>   → { days: [ { date, weekday, monthday, slots: [...] } ] }
//
// Público a propósito: lo llama gente de la calle desde la landing, igual que
// api/formularios.js. No lleva token — la defensa es que solo lee, solo de un
// perfil activo con Google enlazado, y con límite por IP.
//
// De dónde salen los huecos:
//   1. Una plantilla semanal del perfil (qué días y a qué horas coge llamadas).
//   2. Menos lo que ya tenga ocupado en su Google Calendar.
//   3. Menos lo que otro lead ya haya reservado por aquí.
//
// El formato de salida es el que la landing de Hugo ya esperaba de central, a
// propósito: así el selector de día y hora funciona sin tocar la landing.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { getGoogleConfig, getAccessToken, listCalendarEvents } from './_lib/google.js'

// Plantilla por defecto. Es lo que se usa mientras nadie la haya tocado, y está
// puesta para un negocio español: de lunes a viernes, de 10 a 19, media hora.
export const AGENDA_DEFECTO = {
  dias: [1, 2, 3, 4, 5],        // 1 = lunes … 7 = domingo
  desde: '10:00',
  hasta: '19:00',
  duracion: 30,                 // minutos por llamada
  diasVista: 10,                // cuántos días hacia adelante se ofrecen
  avisoHoras: 2,                // no se ofrece nada con menos margen que este
  zona: 'Europe/Madrid',
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Las horas de la plantilla ("10:00") son horas LOCALES del negocio, pero todo
// lo demás (Google, la base) va en UTC. Convertir a mano con un offset fijo se
// rompe dos veces al año con el cambio de hora, así que se resuelve preguntando
// al propio motor de fechas qué hora local corresponde a un instante dado.
function offsetMinutos(fecha, zona) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(fmt.formatToParts(fecha).map(x => [x.type, x.value]))
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (comoUtc - fecha.getTime()) / 60000
}

// Instante UTC de una hora local concreta de un día concreto.
function instante(y, m, d, hh, mm, zona) {
  const tanteo = new Date(Date.UTC(y, m - 1, d, hh, mm))
  // Dos pasadas: la primera da un offset aproximado y la segunda lo corrige en
  // los días en que el reloj cambia justo a esa hora.
  const uno = new Date(tanteo.getTime() - offsetMinutos(tanteo, zona) * 60000)
  return new Date(tanteo.getTime() - offsetMinutos(uno, zona) * 60000)
}

// Partes locales (año, mes, día, día de la semana) de un instante.
function partesLocales(fecha, zona) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const p = Object.fromEntries(fmt.formatToParts(fecha).map(x => [x.type, x.value]))
  const orden = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { y: +p.year, m: +p.month, d: +p.day, dow: orden[p.weekday] || 1 }
}

const hhmm = (fecha, zona) => new Intl.DateTimeFormat('es-ES', {
  timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(fecha)

/**
 * Genera los huecos de la plantilla y tacha los que pisan algo ocupado.
 * `ocupado` es una lista de [inicioMs, finMs].
 */
export function construirDias(cfg, ocupado, ahora = new Date()) {
  const { dias, desde, hasta, duracion, diasVista, avisoHoras, zona } = { ...AGENDA_DEFECTO, ...cfg }
  const [h1, m1] = String(desde).split(':').map(Number)
  const [h2, m2] = String(hasta).split(':').map(Number)
  const minimo = ahora.getTime() + avisoHoras * 3600_000
  const salida = []

  for (let i = 0; i < diasVista; i++) {
    const base = new Date(ahora.getTime() + i * 86400_000)
    const { y, m, d, dow } = partesLocales(base, zona)
    if (!dias.includes(dow)) continue

    const abre = instante(y, m, d, h1, m1, zona)
    const cierra = instante(y, m, d, h2, m2, zona)
    const slots = []

    for (let t = abre.getTime(); t + duracion * 60000 <= cierra.getTime(); t += duracion * 60000) {
      const fin = t + duracion * 60000
      // Un hueco solo vale si va con suficiente antelación y no pisa nada.
      const libre = t >= minimo && !ocupado.some(([a, b]) => t < b && fin > a)
      if (!libre) continue
      slots.push({
        start: new Date(t).toISOString(),
        end: new Date(fin).toISOString(),
        time: hhmm(new Date(t), zona),
        available: true,
      })
    }

    // Un día sin huecos no se manda: en el selector de la landing sería una
    // pestaña que no lleva a ninguna parte.
    if (slots.length) {
      salida.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        weekday: DIAS[dow - 1],
        monthday: `${d} ${MESES[m - 1]}`,
        slots,
      })
    }
  }
  return salida
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const ip = getClientIp(req)
  const gate = rateLimit({ key: `agenda:${ip || 'anon'}`, max: 60, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter || 60))
    return res.status(429).json({ error: 'Demasiadas peticiones' })
  }

  try {
    const slug = String(req.query.slug || '').toLowerCase()
    const { data: client } = await supabase
      .from('clients').select('id, active').eq('slug', slug).maybeSingle()
    if (!client || client.active === false) return res.status(404).json({ error: 'Perfil no encontrado' })

    const row = await getGoogleConfig(supabase, client.id)
    const cfg = row?.config || {}
    // Sin Google enlazado no hay forma de saber qué tiene ocupado, y ofrecer la
    // plantilla entera acabaría con dos llamadas encima de una reunión suya.
    if (!cfg.refreshToken) {
      return res.status(200).json({ days: [], motivo: 'sin-google' })
    }

    const agenda = { ...AGENDA_DEFECTO, ...(cfg.agenda || {}) }
    const ahora = new Date()
    const hasta = new Date(ahora.getTime() + agenda.diasVista * 86400_000)

    // Lo que ya tiene en su calendario.
    const ocupado = []
    try {
      const { token } = await getAccessToken(supabase, client.id)
      const eventos = await listCalendarEvents(token, {
        calendarId: cfg.calendarId || 'primary',
        timeMin: ahora.toISOString(),
        timeMax: hasta.toISOString(),
      })
      for (const e of eventos) {
        if (e.status === 'cancelled') continue
        if (e.transparency === 'transparent') continue   // marcado como "disponible"
        const a = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00Z` : null)
        const b = e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00Z` : null)
        if (a && b) ocupado.push([new Date(a).getTime(), new Date(b).getTime()])
      }
    } catch (err) {
      // Si Google falla se devuelven cero huecos en vez de la plantilla entera:
      // es preferible que el lead pida que le llamen a que le den una hora que
      // choca con otra cosa.
      console.warn('[agenda] calendario', err.message)
      return res.status(200).json({ days: [], motivo: 'calendario-no-disponible' })
    }

    // Y lo que ya han reservado otros leads por aquí.
    const { data: reservas } = await supabase
      .from('helm_form_responses').select('meta')
      .eq('client_id', client.id).gte('submitted_at', new Date(ahora.getTime() - 86400_000).toISOString())
      .limit(2000)
    for (const r of reservas || []) {
      const a = r.meta?.slot_start
      const b = r.meta?.slot_end
      if (a) ocupado.push([new Date(a).getTime(), new Date(b || a).getTime() + (b ? 0 : agenda.duracion * 60000)])
    }

    // Un minuto de caché: la landing pide los huecos al abrir, y varias visitas
    // seguidas no tienen por qué costar una llamada a Google cada una.
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.status(200).json({ days: construirDias(agenda, ocupado, ahora) })
  } catch (err) {
    console.error('[agenda]', err)
    return res.status(500).json({ error: 'No se pudieron cargar los huecos' })
  }
}
