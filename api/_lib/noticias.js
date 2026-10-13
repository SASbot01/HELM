// HELM — Noticias: las tres noticias del día de cada perfil.
//
// Un agente que corre solo, una vez al día y por perfil:
//
//   1. lee las fuentes del perfil (RSS públicos: no hay ningún servicio de por
//      medio ni se manda a nadie ningún dato del perfil). Cuáles son, de qué
//      temas y con qué criterio se eligen está en ./noticias-perfiles.js; sin
//      entrada propia, IA y ciberseguridad, como siempre
//   2. se queda con lo publicado en el último día y medio, sin lo que ya dio
//   3. le pasa los titulares a Claude, que elige las tres que más le importan
//      a este perfil y las cuenta en español
//   4. las guarda en helm_noticias y avisa por la campana (y Telegram, si lo
//      hay)
//
// Corre dentro del worker (scripts/agents-worker.mjs) como trabajo de tipo
// 'noticias'. Se enciende por perfil con la sección «Noticias».
//
// Dos cosas que están en el código y no en el prompt: el enlace de cada
// noticia sale de la fuente, nunca del modelo (el modelo elige por número), y
// el texto de las fuentes se le pasa como material a leer, no como órdenes.
import { supabase } from '../lib/supabase.js'
import { claudeTurno } from './anthropic.js'
import { notificar } from './notificar.js'
import { BREVES_POR_DEFECTO, brevesDe } from './noticias-perfiles.js'

const CLAVE = () => process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''
const MODELO = process.env.NOTICIAS_MODELO || 'claude-sonnet-5'

// A qué hora (de Madrid) se empieza. Media hora antes de las 6:00: el worker
// hace un trabajo cada vez, y si le pilla a mitad de otro tiene margen.
const HORA = 5, MINUTO = 30
// Cuánto hacia atrás cuenta como «de hoy».
const VENTANA_H = 36
const POR_FUENTE = 12


// ── Fechas: el día es el de Madrid ──────────────────────────────────────────
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const diaMadrid = (d = new Date()) => fmtDia.format(d)
const minutosMadrid = (d = new Date()) => { const [h, m] = fmtHora.format(d).split(':').map(Number); return h * 60 + m }

// ── Leer un RSS o un Atom ───────────────────────────────────────────────────
// A mano y no con una librería: de cada entrada solo hacen falta cuatro campos.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const limpia = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, ' ')          // etiquetas que venían escapadas
  .replace(/\s+/g, ' ').trim()

const campo = (bloque, ...nombres) => {
  for (const n of nombres) {
    const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(bloque)
    if (m && m[1].trim()) return m[1]
  }
  return ''
}

export function entradasDe(xml) {
  const bloques = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []
  return bloques.map(b => {
    // En Atom el enlace va en un atributo; en RSS, dentro de la etiqueta.
    const enlaces = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1])
    const atom = enlaces.find(a => /rel=["']alternate["']/i.test(a)) || enlaces.find(a => /href=/i.test(a) && !/rel=/i.test(a))
    const url = limpia(atom ? /href=["']([^"']+)["']/i.exec(atom)?.[1] : campo(b, 'link', 'guid'))
    const fecha = new Date(limpia(campo(b, 'pubDate', 'published', 'updated', 'dc:date')))
    return {
      titulo: limpia(campo(b, 'title')).slice(0, 300),
      url,
      fecha: Number.isNaN(fecha.getTime()) ? null : fecha,
      texto: limpia(campo(b, 'description', 'summary', 'content:encoded', 'content')).slice(0, 500),
    }
  }).filter(e => e.titulo && /^https?:\/\//.test(e.url))
}

async function leeFuente(f) {
  const r = await fetch(f.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HELM-noticias/1.0)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return entradasDe(await r.text()).map(e => ({ ...e, fuente: f.nombre, tema: f.tema }))
}

/** Lo publicado en el último día y medio en todas las fuentes. Una fuente que
 *  falle no tumba a las demás: se apunta y se sigue. */
export async function recoge(ahora = new Date(), fuentes = BREVES_POR_DEFECTO.fuentes) {
  const desde = ahora.getTime() - VENTANA_H * 3600_000
  const res = await Promise.allSettled(fuentes.map(leeFuente))
  const fallos = [], vistas = new Set(), entradas = []
  res.forEach((r, i) => {
    if (r.status === 'rejected') { fallos.push(`${fuentes[i].nombre} (${String(r.reason?.message || r.reason).slice(0, 60)})`); return }
    const recientes = r.value
      .filter(e => e.fecha && e.fecha.getTime() >= desde && e.fecha.getTime() <= ahora.getTime() + 3600_000)
      .sort((a, b) => b.fecha - a.fecha).slice(0, POR_FUENTE)
    for (const e of recientes) {
      const clave = e.url.replace(/[?#].*$/, '')
      if (vistas.has(clave)) continue
      vistas.add(clave)
      entradas.push(e)
    }
  })
  return { entradas, fallos }
}

// ── Elegir ──────────────────────────────────────────────────────────────────

// La herramienta con la que entrega. Si el perfil deja que el modelo ponga el
// tema (temaDelModelo), lleva además el campo `tema`, solo con los suyos.
const HERRAMIENTA = {
  name: 'entregar_noticias',
  description: 'Entrega las noticias elegidas, de más a menos importante.',
  input_schema: {
    type: 'object',
    properties: {
      noticias: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'El número de la noticia en la lista que te han dado.' },
            titular: { type: 'string' },
            resumen: { type: 'string' },
            por_que: { type: 'string' },
          },
          required: ['n', 'titular', 'resumen', 'por_que'],
        },
      },
    },
    required: ['noticias'],
  },
}

function herramientaDe(cfg) {
  if (!cfg.temaDelModelo) return HERRAMIENTA
  const item = HERRAMIENTA.input_schema.properties.noticias.items
  return {
    ...HERRAMIENTA,
    input_schema: {
      ...HERRAMIENTA.input_schema,
      properties: {
        noticias: {
          type: 'array',
          items: {
            ...item,
            properties: { ...item.properties, tema: { type: 'string', enum: Object.keys(cfg.temas) } },
            required: [...item.required, 'tema'],
          },
        },
      },
    },
  }
}

export async function elige({ perfil, hoy, entradas, yaDadas, biblia, cfg = BREVES_POR_DEFECTO }) {
  const lista = entradas.map((e, i) =>
    `[${i + 1}] (${cfg.temas[e.tema] || e.tema} · ${e.fuente} · ${e.fecha.toISOString().slice(0, 16).replace('T', ' ')} UTC) ${e.titulo}${e.texto ? `\n    ${e.texto}` : ''}`).join('\n')
  const user = [
    `Perfil: ${perfil.name}. Hoy es ${hoy}.`,
    biblia ? `\n# Quién es este perfil y a quién le habla\n${biblia}` : '',
    yaDadas.length ? `\n# Ya dadas en los últimos días (no las repitas, salvo que haya una novedad de verdad)\n${yaDadas.map(t => `- ${t}`).join('\n')}` : '',
    `\n# Lo publicado en las últimas ${VENTANA_H} horas\n<noticias>\n${lista}\n</noticias>`,
  ].filter(Boolean).join('\n')
  const r = await claudeTurno({
    apiKey: CLAVE(), model: MODELO, system: cfg.sistema, messages: [{ role: 'user', content: user }],
    maxTokens: 2500, tools: [herramientaDe(cfg)], esfuerzo: 'medium',
  })
  const llamada = r.toolCalls.find(c => c.name === HERRAMIENTA.name)
  if (!llamada) throw new Error('El modelo contestó sin entregar las noticias en su formato')
  const elegidas = [], usados = new Set()
  for (const x of Array.isArray(llamada.args?.noticias) ? llamada.args.noticias : []) {
    const e = entradas[Number(x?.n) - 1]
    const titular = String(x?.titular || '').trim()
    if (!e || usados.has(e) || !titular) continue
    // El tema, siempre uno de los del perfil: el que diga el modelo si puede
    // ponerlo, y si no (o si se sale de la lista), el de la fuente.
    const tema = cfg.temaDelModelo && Object.hasOwn(cfg.temas, String(x?.tema)) ? x.tema : e.tema
    if (!Object.hasOwn(cfg.temas, tema)) continue
    usados.add(e)
    elegidas.push({
      tema, url: e.url, fuente: e.fuente, publicado_en: e.fecha.toISOString(),
      titular: titular.slice(0, 300),
      resumen: String(x.resumen || '').trim().slice(0, 1200),
      por_que: String(x.por_que || '').trim().slice(0, 800),
    })
    if (elegidas.length === 3) break
  }
  return { elegidas, tokens: (r.usage?.in || 0) + (r.usage?.out || 0) }
}

// ── El trabajo ──────────────────────────────────────────────────────────────

/** Trabajo 'noticias' del worker: payload { clientId, origen }. */
export async function generaNoticias(job) {
  const { clientId } = job.payload || {}
  if (!CLAVE()) throw new Error('Falta la clave de Claude (AGENTS_ANTHROPIC_KEY)')
  const { data: perfil } = await supabase.from('clients').select('id, slug, name').eq('id', clientId).maybeSingle()
  if (!perfil) throw new Error('Ese perfil ya no existe')
  const hoy = diaMadrid()
  const cfg = brevesDe(perfil.slug)

  const [{ entradas, fallos }, previas, biblia] = await Promise.all([
    recoge(new Date(), cfg.fuentes),
    supabase.from('helm_noticias').select('url, titular, fecha').eq('client_id', clientId)
      .gte('fecha', diaMadrid(new Date(Date.now() - 7 * 86_400_000))).neq('fecha', hoy),
    supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId),
  ])
  if (previas.error) throw previas.error
  if (fallos.length) console.log(`[noticias] fuentes que han fallado: ${fallos.join(', ')}`)

  const dadas = new Set((previas.data || []).map(p => p.url))
  const candidatas = entradas.filter(e => !dadas.has(e.url))
  if (!candidatas.length) throw new Error(`Ninguna fuente ha dado noticias nuevas (${fallos.length} de ${cfg.fuentes.length} han fallado)`)

  const { elegidas, tokens } = await elige({
    perfil, hoy, entradas: candidatas, cfg,
    yaDadas: (previas.data || []).map(p => p.titular),
    biblia: (biblia.data || []).map(b => `## ${b.kind}\n${String(b.content).slice(0, 2000)}`).join('\n\n').slice(0, 5000),
  })
  if (!elegidas.length) throw new Error('El modelo no eligió ninguna noticia utilizable')

  // Las de hoy se sustituyen enteras: relanzarlo a mano no deja seis.
  const { error: eBorra } = await supabase.from('helm_noticias').delete().eq('client_id', clientId).eq('fecha', hoy)
  if (eBorra) throw eBorra
  const { error } = await supabase.from('helm_noticias').insert(
    elegidas.map((n, i) => ({ client_id: clientId, fecha: hoy, puesto: i + 1, ...n })))
  if (error) throw error
  console.log(`[noticias] ${perfil.slug}: ${elegidas.length} de ${candidatas.length} candidatas, ${tokens} tokens`)

  await notificar(supabase, clientId, {
    tipo: 'noticias', titulo: 'Tus noticias de hoy',
    cuerpo: elegidas.map((n, i) => `${i + 1}. ${n.titular}`).join('\n'),
    destino: 'noticias', clave: `noticias:${hoy}`, cadaHoras: 20,
  })
}

/** Lo que mira el worker cada minuto: desde las 5:30 de Madrid, un trabajo por
 *  cada perfil con la sección Noticias encendida, una vez al día (la clave
 *  lleva la fecha). */
export async function miraNoticias() {
  if (minutosMadrid() < HORA * 60 + MINUTO) return
  const { data, error } = await supabase.from('helm_permissions').select('client_id, sections')
  if (error) throw error
  const hoy = diaMadrid()
  for (const p of data || []) {
    if (p.sections?.noticias !== true) continue
    await encolaNoticias(p.client_id, { origen: 'horario', clave: `noticias:${p.client_id}:${hoy}` })
  }
}

export async function encolaNoticias(clientId, { origen = 'manual', clave }) {
  const { error } = await supabase.from('agent_jobs').upsert({
    tipo: 'noticias', payload: { clientId, origen }, clave,
    estado: 'pendiente', max_intentos: 2, correr_tras: new Date().toISOString(),
  }, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudieron encolar las noticias: ${error.message}`)
}
