// HELM — Agent OS: el equipo de agentes de un perfil.
//
// Siete agentes que comparten una memoria (agent_memory con client_id):
//
//   director      cada mañana mira el calendario, la agenda, las tareas y la
//                 memoria, deja el plan del día y reparte encargos a los demás
//   investigador  estudia los reels de los creadores de referencia que hay
//                 en el corpus y apunta los temas y ganchos que se repiten
//   analista      compara las métricas de los reels propios y guarda
//                 conclusiones con cifras
//   productor     sigue cada pieza de guion a publicado (grabación, edición,
//                 publicación) y avisa de lo que se atasca
//   comercial     repasa leads, llamadas y cobros y avisa de lo que se enfría.
//                 No escribe a nadie: avisa y propone.
//   informe       los lunes cruza contenido, leads y ventas de la semana
//   guionista     escribe los guiones del día y los deja en el calendario
//                 como BORRADOR. Aprobar es cosa del dueño del perfil.
//
// Cualquiera puede proponer tareas: quedan en agent_tareas como pendientes y
// solo pasan a las Tareas de HELM cuando el dueño las acepta.
//
// Corre dentro del worker (scripts/agents-worker.mjs) como trabajo de tipo
// 'equipo'. Cada vez que un agente corre queda una fila en agent_ejecuciones
// con lo que fue haciendo paso a paso y los tokens que gastó: es lo que
// enseña la pantalla Agentes → Equipo.
//
// Lo que un agente NO puede hacer está aquí en el código, no en el prompt: el
// guionista solo inserta filas con revision='borrador', ninguno actualiza ni
// borra nada del calendario, y ninguno toca el CRM, las ventas ni las tareas:
// de esas tablas solo se lee.
import { supabase } from '../lib/supabase.js'
import { claudeTurno } from './anthropic.js'
import { calendario, TIPOS, FASES } from './ingesta.js'
import { getIgConfig } from './instagram.js'
import { sincronizar as sincronizarIg } from '../instagram.js'
import { notificar } from './notificar.js'
import { puntuarGancho, clasificaGancho } from './ig-calidad.js'
import { apifyListo, rastreaCuentas } from './apify.js'
import { validaArgs } from './esquema.js'
import { esPropio } from './creadores.js'

export const AGENTES = ['director', 'investigador', 'analista', 'productor', 'comercial', 'informe', 'guionista']
// En el orden en que corren: el guionista el último, para leer lo de los demás.
const ESPECIALISTAS = AGENTES.slice(1)
// El informe no lo encarga el director: sale solo los lunes.
const ENCARGABLES = ESPECIALISTAS.filter(a => a !== 'informe')

const CLAVE = () => process.env.AGENTS_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || ''
// Escribir y planificar piden criterio; leer listas y resumir, no.
const MODELOS = {
  director: process.env.AGENTS_MODELO_DIRECTOR || 'claude-sonnet-5',
  guionista: process.env.AGENTS_MODELO_GUIONISTA || 'claude-sonnet-5',
  investigador: process.env.AGENTS_MODELO_INVESTIGADOR || 'claude-haiku-4-5',
  analista: process.env.AGENTS_MODELO_ANALISTA || 'claude-haiku-4-5',
  productor: process.env.AGENTS_MODELO_PRODUCTOR || 'claude-haiku-4-5',
  comercial: process.env.AGENTS_MODELO_COMERCIAL || 'claude-haiku-4-5',
  informe: process.env.AGENTS_MODELO_INFORME || 'claude-sonnet-5',
  editor: process.env.AGENTS_MODELO_EDITOR || 'claude-haiku-4-5',
  programador: process.env.AGENTS_MODELO_PROGRAMADOR || 'claude-sonnet-5',
  virales: process.env.AGENTS_MODELO_VIRALES || 'claude-sonnet-5',
}

// Agentes que se pueden LANZAR a mano (o por el MCP) pero que no entran en el
// reparto diario del director: el editor de reels es uno.
export const AGENTES_LANZABLES = [...AGENTES, 'editor', 'programador', 'virales']

// ── Fechas: el día es el de Madrid ──────────────────────────────────────────
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' })
export const diaMadrid = (d = new Date()) => fmtDia.format(d)
export const horaMadrid = (d = new Date()) => Number(fmtHora.format(d))
const masDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
const esLunes = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay() === 1

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// ── La cola ─────────────────────────────────────────────────────────────────
// Un solo intento: si un agente falla, queda registrado como error y se
// relanza a mano. Reintentar solo repetiría el gasto y el mismo fallo.
export async function encolaAgente({ clientId, agente, origen, encargo = '', clave, turno = null, params = null }) {
  const { error } = await supabase.from('agent_jobs').upsert({
    tipo: 'equipo', payload: { clientId, agente, origen, encargo, ...(params ? { params } : {}) }, clave,
    estado: 'pendiente', max_intentos: 1, correr_tras: new Date().toISOString(),
    ...(turno ? { created_at: turno } : {}),
  }, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar al ${agente}: ${error.message}`)
}

/** Lo que mira el worker cada minuto: a partir de las 6:00 de Madrid, el
 *  director de cada perfil activo, una vez al día (la clave lleva la fecha). */
export async function miraAgenda() {
  if (horaMadrid() < 6) return
  const { data, error } = await supabase.from('agent_perfiles').select('client_id').eq('activo', true)
  if (error) throw error
  const hoy = diaMadrid()
  for (const { client_id } of data || []) {
    await encolaAgente({ clientId: client_id, agente: 'director', origen: 'horario', clave: `equipo:director:${client_id}:${hoy}` })
  }
}

/** Lunes a partir de las 6:00 de Madrid: el programador prepara el contenido de
 *  la semana entrante para cada perfil activo, idempotente por semana (si ya
 *  está montado un tipo, no lo repite). El botón manual hace lo mismo a demanda. */
export async function miraProgramador() {
  if (!esLunes(diaMadrid()) || horaMadrid() < 6) return
  const { data, error } = await supabase.from('agent_perfiles').select('client_id').eq('activo', true)
  if (error) throw error
  const hoy = diaMadrid()
  for (const { client_id } of data || []) {
    await encolaAgente({
      clientId: client_id, agente: 'programador', origen: 'horario',
      clave: `programador:${client_id}:${hoy}`, params: { desde: masDias(hoy, 1), hasta: masDias(hoy, 7) },
    })
  }
}

/** Lunes a partir de las 6:00 de Madrid: el agente de virales rastrea los reels
 *  recientes de los creadores de referencia de cada perfil activo y mete los
 *  mejores en el corpus, una vez por semana (clave con la fecha). El botón
 *  manual hace lo mismo a demanda. */
export async function miraVirales() {
  if (!apifyListo()) return
  if (!esLunes(diaMadrid()) || horaMadrid() < 6) return
  const { data, error } = await supabase.from('agent_perfiles').select('client_id').eq('activo', true)
  if (error) throw error
  const hoy = diaMadrid()
  for (const { client_id } of data || []) {
    await encolaAgente({ clientId: client_id, agente: 'virales', origen: 'horario', clave: `virales:${client_id}:${hoy}` })
  }
}

/** Al arrancar el worker: lo que figure corriendo se quedó a medias. */
export async function cierraHuerfanas() {
  await supabase.from('agent_ejecuciones')
    .update({ estado: 'error', error: 'Se interrumpió: el worker se reinició a mitad.', acabado_en: new Date().toISOString() })
    .eq('estado', 'corriendo')
}

// ── La memoria compartida ───────────────────────────────────────────────────

// Sin las notas de creador que Claude guarda por el MCP (tipo 'creador'):
// llevan el perfil para saber de qué agencia son, pero no son memoria del
// equipo y se comerían el tope (y con él, las reglas del dueño más antiguas).
async function memoriaDe(clientId) {
  const { data, error } = await supabase.from('agent_memory')
    .select('id, clave, agente, tipo, para_agente, estado, contenido, updated_at')
    .eq('client_id', clientId).neq('tipo', 'creador').order('updated_at', { ascending: false }).limit(200)
  if (error) throw error
  return data || []
}

// Las reglas que deja el Estudio de contenido (agente 'estratega') caducan a
// las 12 semanas sin reconfirmarse. Las borra el propio estudio, pero en las
// agencias que pagan se pide a mano: si un perfil no vuelve a pedir otro, aquí
// dejan de leerse igual (api/_lib/estudio-contenido/generar.js).
const CADUCA_ESTRATEGA_MS = 12 * 7 * 86_400_000
const caducada = (n) => n.agente === 'estratega' && n.tipo === 'aprendido' &&
  Date.now() - Date.parse(n.updated_at) > CADUCA_ESTRATEGA_MS

// Cómo la lee un agente. Las propuestas sin aceptar no son verdad todavía: se
// enseñan como tales, y las descartadas no se enseñan.
function memoriaTexto(notas, agente) {
  const dia = (n) => String(n.updated_at).slice(0, 10)
  const vivas = notas.filter(n => !(n.tipo === 'propuesta' && n.estado === 'descartada') && !caducada(n))
  const grupo = (titulo, lista, fmt) => lista.length ? `## ${titulo}\n${lista.map(fmt).join('\n')}` : ''
  return [
    grupo('Reglas del dueño del perfil (se obedecen)', vivas.filter(n => n.tipo === 'regla'),
      n => `- ${n.contenido}`),
    grupo('Recados para ti', vivas.filter(n => n.tipo === 'para' && n.para_agente === agente),
      n => `- De ${n.agente}, ${dia(n)}: ${n.contenido}`),
    grupo('Plan del día', vivas.filter(n => n.tipo === 'plan'),
      n => `- ${dia(n)}: ${n.contenido}`),
    grupo('Avisos vigentes', vivas.filter(n => n.tipo === 'aviso'),
      n => `- (${n.agente}, ${dia(n)}) ${n.contenido}`),
    grupo('Último informe semanal', vivas.filter(n => n.tipo === 'informe').slice(0, 1),
      n => `${dia(n)}:\n${n.contenido}`),
    grupo('Lo aprendido', vivas.filter(n => n.tipo === 'aprendido' || (n.tipo === 'propuesta' && n.estado === 'aceptada')),
      n => `- [${n.clave}] (${n.agente}, ${dia(n)}) ${n.contenido}`),
    grupo('Propuestas que el dueño aún no ha aceptado (no las des por buenas)', vivas.filter(n => n.tipo === 'propuesta' && n.estado === 'pendiente'),
      n => `- [${n.clave}] (${n.agente}, ${dia(n)}) ${n.contenido}`),
    grupo('Lo último que hizo cada agente', vivas.filter(n => n.tipo === 'hecho'),
      n => `- ${n.agente}, ${dia(n)}: ${n.contenido}`),
  ].filter(Boolean).join('\n\n') || '(La memoria del perfil está vacía.)'
}

async function guardaNota(clientId, nota) {
  const fila = { ambito: 'perfil', client_id: clientId, updated_at: new Date().toISOString(), ...nota }
  const { data: ya } = await supabase.from('agent_memory').select('id, contenido, estado')
    .eq('client_id', clientId).eq('clave', nota.clave).maybeSingle()
  if (ya) {
    // Una propuesta ya contestada conserva su respuesta si no ha cambiado.
    if (nota.tipo === 'propuesta' && ya.contenido === nota.contenido) fila.estado = ya.estado
    const { error } = await supabase.from('agent_memory').update(fila).eq('id', ya.id)
    if (error) throw error
    return 'actualizada'
  }
  const { error } = await supabase.from('agent_memory').insert(fila)
  if (error) throw error
  return 'nueva'
}

// Lo que escribe un agente al terminar. Las claves de 'hecho' y de los recados
// son fijas (una por agente y destinatario): siempre se pisa la anterior. Las
// conclusiones llevan la clave que elija el modelo, que ve las que ya existen:
// si repite clave, se actualiza esa nota en vez de duplicarse.
async function escribeMemoria(ctx, { hecho, memoria, tareas }) {
  const { clientId, agente } = ctx
  if (hecho) {
    await guardaNota(clientId, { clave: `${agente}/hecho`, agente, tipo: 'hecho', contenido: String(hecho).slice(0, 1200) })
  }
  // Los avisos son una foto de hoy: los de la vez anterior se quitan, y lo que
  // siga pasando vuelve a salir en los nuevos.
  const { error: eAvisos } = await supabase.from('agent_memory').delete()
    .eq('client_id', clientId).eq('agente', agente).eq('tipo', 'aviso')
  if (eAvisos) throw eAvisos
  await proponTareas(ctx, tareas)
  let nuevas = 0, actualizadas = 0
  for (const n of (Array.isArray(memoria) ? memoria : []).slice(0, 8)) {
    const contenido = String(n?.contenido || '').trim().slice(0, 1500)
    if (!contenido) continue
    let fila
    if (n.tipo === 'para' && AGENTES.includes(n.para) && n.para !== agente) {
      fila = { clave: `${agente}/para/${n.para}`, agente, tipo: 'para', para_agente: n.para, contenido }
    } else if (n.tipo === 'aviso') {
      fila = { clave: `${agente}/aviso/${slug(n.clave || contenido)}`, agente, tipo: 'aviso', contenido }
    } else if (n.tipo === 'propuesta' || n.tipo === 'aprendido') {
      const clave = slug(n.clave)
      if (!clave) continue
      fila = { clave, agente, tipo: n.tipo, contenido, ...(n.tipo === 'propuesta' ? { estado: 'pendiente' } : {}) }
    } else continue
    const r = await guardaNota(clientId, fila)
    if (r === 'nueva') nuevas++; else actualizadas++
  }
  if (nuevas || actualizadas) await ctx.log(`Memoria: ${nuevas} ${nuevas === 1 ? 'nota nueva' : 'notas nuevas'}, ${actualizadas} ${actualizadas === 1 ? 'actualizada' : 'actualizadas'}.`)
}

// Tareas que un agente propone al dueño. No entran en las Tareas de HELM
// hasta que las acepta (api/agents.js, 'equipo-tarea'). La clave sale del
// título: una tarea ya contestada no se vuelve a proponer.
async function proponTareas(ctx, tareas) {
  const { clientId, agente } = ctx
  let n = 0
  for (const t of (Array.isArray(tareas) ? tareas : []).slice(0, 5)) {
    const titulo = String(t?.titulo || '').trim().slice(0, 200)
    const clave = slug(titulo)
    if (!clave) continue
    const { data: ya } = await supabase.from('agent_tareas').select('id, estado')
      .eq('client_id', clientId).eq('clave', clave).maybeSingle()
    if (ya && ya.estado !== 'pendiente') continue
    const fila = {
      client_id: clientId, clave, agente, titulo, detalle: String(t.detalle || '').trim().slice(0, 800),
      vence: /^\d{4}-\d{2}-\d{2}$/.test(t.vence || '') ? t.vence : null,
      prioridad: ['low', 'medium', 'high'].includes(t.prioridad) ? t.prioridad : 'medium',
      updated_at: new Date().toISOString(),
    }
    const { error } = ya
      ? await supabase.from('agent_tareas').update(fila).eq('id', ya.id)
      : await supabase.from('agent_tareas').insert(fila)
    if (error) throw error
    n++
  }
  if (n) await ctx.log(`${n} ${n === 1 ? 'tarea propuesta' : 'tareas propuestas'}: ${n === 1 ? 'espera' : 'esperan'} tu visto bueno.`)
}

// El trozo de esquema que comparten las herramientas de entrega.
const ESQUEMA_MEMORIA = {
  hecho: { type: 'string', description: 'Qué has hecho en esta ejecución, en una o dos frases.' },
  memoria: {
    type: 'array',
    description: 'Lo que dejas en la memoria compartida. Máximo 8 notas. Si una conclusión ya existe en la memoria, reutiliza SU clave para actualizarla: no escribas otra nota que diga lo mismo.',
    items: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['aprendido', 'para', 'propuesta', 'aviso'], description: 'aprendido: una conclusión. para: un recado a otro agente. propuesta: un cambio de estrategia que debe aprobar el dueño. aviso: algo que el dueño tiene que mirar hoy (se atasca, vence, se enfría).' },
        clave: { type: 'string', description: 'Identificador corto en minúsculas con guiones, p. ej. "ganchos-de-pregunta". En aprendido, propuesta y aviso.' },
        para: { type: 'string', enum: AGENTES, description: 'A quién va el recado. Solo en tipo "para".' },
        contenido: { type: 'string' },
      },
      required: ['tipo', 'contenido'],
    },
  },
}

const ESQUEMA_TAREAS = {
  tareas: {
    type: 'array',
    description: 'Tareas que propones al dueño del perfil. Máximo 5, solo las que de verdad haya que hacer; quedan pendientes hasta que las acepte. No repitas las que ya están abiertas o propuestas.',
    items: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Qué hay que hacer, empezando por el verbo.' },
        detalle: { type: 'string', description: 'Por qué, con el dato que lo justifica.' },
        vence: { type: 'string', description: 'AAAA-MM-DD, si tiene fecha.' },
        prioridad: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['titulo'],
    },
  },
}

const REGLAS_COMUNES = `Español de España, directo, sin relleno.
Usa solo los datos que te llegan. No inventes cifras, reels ni hechos; si falta un dato, dilo.
Entregas llamando a la herramienta que tienes disponible, una sola vez.`

// ── Datos que usan varios agentes ───────────────────────────────────────────

async function creadoresDe(clientId) {
  const { data, error } = await supabase.from('agent_identity_clients')
    .select('agent_identities(id, nombre, slug, categoria, descripcion)').eq('client_id', clientId)
  if (error) throw error
  return (data || []).map(r => r.agent_identities).filter(Boolean)
}

const vistas = (r) => Number(r.metricas?.vistas) || 0
const ganchoDe = (r) => {
  const g = (r.frases || []).filter(f => f.rol === 'gancho').map(f => f.texto).join(' ')
  return (g || r.frases?.[0]?.texto || String(r.transcripcion || '')).slice(0, 220)
}

async function reelsDe(identityIds) {
  if (!identityIds.length) return []
  const { data, error } = await supabase.from('agent_reels')
    .select('identity_id, url, cuenta, metricas, etiquetas, frases, transcripcion, duracion_s, created_at')
    .in('identity_id', identityIds).eq('estado', 'etiquetado').limit(1000)
  if (error) throw error
  return data || []
}

async function reelsPropios(clientId, n = 60) {
  const { data, error } = await supabase.from('helm_ig_media')
    .select('caption, permalink, publicado_en, producto, visitas, alcance, likes, comentarios, guardados, compartidos, retencion_media, seguidores_ganados')
    .eq('client_id', clientId).order('publicado_en', { ascending: false }).limit(n)
  if (error) throw error
  return (data || []).filter(r => r.producto === 'REELS' || !r.producto)
}

async function calendarioTexto(clientId, desde, hasta) {
  const guiones = await calendario(clientId, { desde, hasta })
  const texto = guiones.map(g =>
    `- ${g.date} · «${g.title}» · ${g.tipo ? TIPOS[g.tipo] : 'sin tipo'} · ${FASES[g.fase]}`
    + `${g.revision === 'borrador' ? ' · BORRADOR sin aprobar' : ''}`
    + `${g.grabado_at ? ` · grabado el ${diaMadrid(new Date(g.grabado_at))}` : ''}`).join('\n')
  return { guiones, texto: texto || '(No hay guiones en esas fechas.)' }
}

// ── El recorrido de las piezas ──────────────────────────────────────────────
// Cada guion del calendario, con la etapa en la que está de verdad:
//   borrador → por_grabar → sin_editar → editado → publicado
// Lo usan el productor, el director y la pantalla (que lo pide cada pocos
// segundos: de ahí la caché, porque la fase sale de mirar Drive).
export const ETAPAS = ['borrador', 'por_grabar', 'sin_editar', 'editado', 'publicado']
const cachePiezas = new Map()

export async function flujoPiezas(clientId, { fresco = false } = {}) {
  const ya = cachePiezas.get(clientId)
  if (!fresco && ya && Date.now() - ya.t < 60_000) return ya.piezas
  const hoy = diaMadrid()
  const [guiones, pedidos] = await Promise.all([
    calendario(clientId, { desde: masDias(hoy, -45), hasta: masDias(hoy, 21) }),
    supabase.from('helm_edicion_pedidos').select('guion_id, estado, entrega, enviado_at').eq('client_id', clientId).not('guion_id', 'is', null),
  ])
  if (pedidos.error) throw pedidos.error
  const piezas = guiones.map(g => {
    const pedido = (pedidos.data || []).find(p => p.guion_id === g.id) || null
    return {
      id: g.id, date: g.date, title: g.title, tipo: g.tipo,
      etapa: g.revision === 'borrador' ? 'borrador' : g.fase,
      grabado_at: g.grabado_at, pedido: pedido && { estado: pedido.estado, entrega: pedido.entrega },
    }
  })
  cachePiezas.set(clientId, { t: Date.now(), piezas })
  return piezas
}

// Lo que se atasca, contado sin modelo: son fechas y estados, no opiniones.
function atascos(piezas, hoy) {
  const de = (e) => piezas.filter(p => p.etapa === e)
  const linea = (p, extra) => `- ${p.date} · «${p.title}»${p.tipo ? ` · ${TIPOS[p.tipo]}` : ''}${extra ? ` · ${extra}` : ''}`
  const diasGrabado = (p) => p.grabado_at ? diasEntre(diaMadrid(new Date(p.grabado_at)), hoy) : null
  const proximos = Array.from({ length: 7 }, (_, i) => masDias(hoy, i + 1))
  const cubiertos = new Set(piezas.filter(p => p.etapa !== 'borrador').map(p => p.date))
  return {
    borradores: de('borrador').map(p => linea(p)),
    grabarAtrasado: de('por_grabar').filter(p => p.date < hoy).map(p => linea(p, `tocaba hace ${diasEntre(p.date, hoy)} días`)),
    grabarPronto: de('por_grabar').filter(p => p.date >= hoy && p.date <= masDias(hoy, 3)).map(p => linea(p)),
    sinEncargo: de('sin_editar').filter(p => !p.pedido).map(p => linea(p, diasGrabado(p) != null ? `grabado hace ${diasGrabado(p)} días, sin encargo al editor` : 'sin encargo al editor')),
    enEdicion: de('sin_editar').filter(p => p.pedido).map(p => linea(p, `encargo en «${p.pedido.estado}»${p.pedido.entrega ? `, entrega ${p.pedido.entrega}${p.pedido.entrega < hoy && p.pedido.estado !== 'entregado' ? ' (VENCIDA)' : ''}` : ''}`)),
    sinPublicar: de('editado').map(p => linea(p, p.date < hoy ? `su fecha era hace ${diasEntre(p.date, hoy)} días` : '')),
    publicados: de('publicado').length,
    huecos: proximos.filter(d => !cubiertos.has(d)),
  }
}

async function tareasAbiertas(clientId) {
  const { data, error } = await supabase.from('crm_tasks')
    .select('title, due_date, priority, status, completed, visibility')
    .eq('client_id', clientId).order('due_date', { ascending: true, nullsFirst: false }).limit(300)
  if (error) throw error
  // Las privadas son de quien las creó: el equipo no las lee.
  return (data || []).filter(t => !t.completed && t.status !== 'done' && t.visibility !== 'privada').slice(0, 40)
}

async function llamadasEntre(clientId, desde, hasta) {
  const { data, error } = await supabase.from('helm_calls')
    .select('title, starts_at, status, outcome, contact_id')
    .eq('client_id', clientId).gte('starts_at', desde).lt('starts_at', hasta)
    .neq('status', 'cancelada').order('starts_at').limit(40)
  if (error) throw error
  return data || []
}
const horaDe = (t) => new Date(t).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })

// ── Los agentes ─────────────────────────────────────────────────────────────
// Cada uno recibe `ctx` y devuelve el resumen de lo que hizo.

async function director(ctx) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  const [notas, cal, creadores, ig, ayer, tareas, llamadas, propuestas] = await Promise.all([
    memoriaDe(clientId),
    calendarioTexto(clientId, masDias(hoy, -3), masDias(hoy, 10)),
    creadoresDe(clientId),
    getIgConfig(supabase, clientId),
    supabase.from('agent_ejecuciones').select('agente, estado, resumen, error, empezado_en')
      .eq('client_id', clientId).neq('estado', 'corriendo')
      .gte('empezado_en', new Date(Date.now() - 36 * 3600e3).toISOString()).order('empezado_en'),
    tareasAbiertas(clientId),
    llamadasEntre(clientId, new Date().toISOString(), new Date(Date.now() + 30 * 3600e3).toISOString()),
    supabase.from('agent_tareas').select('titulo').eq('client_id', clientId).eq('estado', 'pendiente'),
  ])
  const deHoy = llamadas.filter(c => diaMadrid(new Date(c.starts_at)) === hoy)
  const borradores = cal.guiones.filter(g => g.revision === 'borrador').length
  await ctx.log(`Leí la memoria (${notas.length} notas) y el calendario del ${masDias(hoy, -3)} al ${masDias(hoy, 10)}: ${cal.guiones.length} guiones, ${borradores} en borrador.`)
  await ctx.log(`Agenda de hoy: ${deHoy.length} ${deHoy.length === 1 ? 'llamada' : 'llamadas'}. Tareas abiertas en HELM: ${tareas.length}.`)

  const user = [
    `Perfil: ${ctx.perfil.name} (${ctx.perfil.slug}). Hoy es ${hoy}; ayer fue ${masDias(hoy, -1)}.`,
    `Guiones nuevos que el guionista puede escribir hoy: ${ctx.cfg.guiones_dia}.`,
    `Creadores de referencia asignados: ${creadores.map(c => c.nombre).join(', ') || 'ninguno'}.`,
    `Instagram del perfil: ${ig?.config?.token ? 'conectado, hay métricas de los reels propios' : 'NO conectado: el analista no tiene métricas propias'}.`,
    'El investigador estudia el corpus que ya hay en HELM; los reels nuevos entran cuando el dueño pega enlaces en el Agente de contenido.',
    `\n# Calendario\n${cal.texto}`,
    `\n# Agenda de hoy\n${deHoy.map(c => `- ${horaDe(c.starts_at)} · ${c.title}`).join('\n') || '(Sin llamadas ni reuniones.)'}`,
    `\n# Tareas abiertas en HELM\n${tareas.map(t => `- ${t.title}${t.due_date ? ` (vence ${diaMadrid(new Date(t.due_date))})` : ''}${t.priority === 'high' ? ' [prioridad alta]' : ''}`).join('\n') || '(Ninguna.)'}`,
    (propuestas.data || []).length ? `\n# Tareas ya propuestas que esperan respuesta (no las repitas)\n${propuestas.data.map(t => `- ${t.titulo}`).join('\n')}` : '',
    `\n# Lo que hicieron los agentes en las últimas 36 horas\n${(ayer.data || []).map(e => `- ${e.agente} (${e.estado}): ${e.resumen || e.error}`).join('\n') || '(Nada.)'}`,
    `\n# Memoria compartida\n${memoriaTexto(notas, 'director')}`,
  ].filter(Boolean).join('\n')

  const out = await ctx.pide({
    system: `Eres el director del equipo que lleva un perfil: su contenido de Instagram y el negocio que hay detrás. Cada mañana decides qué hace hoy cada especialista.

Tu equipo:
· investigador — estudia los reels de los creadores de referencia y apunta temas y ganchos que se repiten.
· analista — compara las métricas de los reels propios publicados y saca conclusiones con cifras.
· productor — sigue cada pieza de guion a publicado (grabar, editar, publicar) y avisa de lo que se atasca.
· comercial — repasa leads, llamadas y cobros y avisa de lo que se enfría. No escribe a nadie.
· guionista — escribe guiones nuevos y los deja en borrador. Corre el último y lee lo que dejen los demás.
(El informe semanal sale solo los lunes: no lo encargues.)

Qué haces:
1. Mira qué se grabó o publicó ayer y qué toca hoy en el calendario, en la agenda y en las tareas.
2. Decide el encargo de cada especialista: concreto, de una a tres frases, apoyado en lo que dice la memoria. No hace falta que corran todos cada día: no incluyas al que no tenga nada que hacer. Si hay muchos borradores sin aprobar o el calendario ya está lleno, no encargues guiones.
3. Escribe el plan del día en 3-6 líneas para el dueño del perfil: qué toca grabar o publicar hoy, qué llamadas tiene y qué va a hacer el equipo.
4. Si del plan sale algo que el dueño tiene que hacer y no está ya entre sus tareas, propónlo en "tareas". Pocas y concretas.

${REGLAS_COMUNES}`,
    user,
    herramienta: {
      name: 'plan_del_dia',
      description: 'Entrega el plan del día y los encargos.',
      input_schema: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'El plan del día, 3-6 líneas.' },
          encargos: {
            type: 'array',
            description: 'El trabajo de hoy de cada especialista.',
            items: {
              type: 'object',
              properties: { agente: { type: 'string', enum: ENCARGABLES }, encargo: { type: 'string' } },
              required: ['agente', 'encargo'],
            },
          },
          ...ESQUEMA_MEMORIA,
          tareas: ESQUEMA_TAREAS.tareas,
        },
        required: ['plan', 'encargos', 'hecho'],
      },
    },
    maxTokens: 3000,
  })

  const plan = String(out.plan || '').trim()
  if (!plan) throw new Error('El director no devolvió un plan')
  await guardaNota(clientId, { clave: 'director/plan', agente: 'director', tipo: 'plan', contenido: plan.slice(0, 2000) })
  await ctx.log('Plan del día guardado en la memoria.')

  // Los encargos, en el orden en que tienen que correr: el guionista el último.
  // Los lunes entra además el informe, una vez (su clave lleva solo la fecha).
  const encargos = ESPECIALISTAS
    .map(a => (a === 'informe' && esLunes(hoy))
      ? { agente: a, encargo: 'Informe de la semana pasada.', clave: `equipo:informe:${clientId}:${hoy}` }
      : (out.encargos || []).find(t => t?.agente === a && ENCARGABLES.includes(a)))
    .filter(t => t && String(t.encargo || '').trim())
  const sello = ctx.origen === 'horario' ? hoy : `${hoy}:${Date.now()}`
  const base = Date.now()
  for (const [i, t] of encargos.entries()) {
    await encolaAgente({
      clientId, agente: t.agente, origen: 'director', encargo: String(t.encargo).slice(0, 1000),
      clave: t.clave || `equipo:${t.agente}:${clientId}:${sello}`, turno: new Date(base + i * 1000).toISOString(),
    })
    await ctx.log(`Encargo al ${t.agente}: ${String(t.encargo).slice(0, 300)}`)
  }
  await escribeMemoria(ctx, out)
  return `Plan del día y ${encargos.length} ${encargos.length === 1 ? 'encargo' : 'encargos'} (${encargos.map(t => t.agente).join(', ') || 'ninguno'}).`
}

async function investigador(ctx) {
  const { clientId } = ctx
  // Los creadores «Propio» son el perfil mismo, no una referencia.
  const creadores = (await creadoresDe(clientId)).filter(c => !esPropio(c))
  if (!creadores.length) {
    await ctx.log('Este perfil no tiene creadores de referencia asignados. No hay nada que investigar.')
    return 'Sin creadores de referencia: no hice nada.'
  }
  const reels = await reelsDe(creadores.map(c => c.id))

  // El corpus crece cuando alguien pega enlaces en el Agente de contenido:
  // Instagram no deja listar los reels de otra cuenta. Lo que sí se sabe aquí
  // es qué ha entrado desde la última vez y de quién hace tiempo que no entra
  // nada, y eso se le dice al dueño.
  const hoy = diaMadrid()
  const entro = (r) => diaMadrid(new Date(r.created_at))
  const anadidos = reels.filter(r => diasEntre(entro(r), hoy) <= 7).length
  const parados = creadores.map(c => {
    const suyos = reels.filter(r => r.identity_id === c.id)
    const ultimo = suyos.map(entro).sort().at(-1)
    return { nombre: c.nombre, dias: ultimo ? diasEntre(ultimo, hoy) : null }
  }).filter(c => c.dias == null || c.dias >= 14)
  await ctx.log(`Corpus: ${reels.length} reels analizados de ${creadores.length} creadores, ${anadidos} entraron en los últimos 7 días.`)
  const avisoCorpus = parados.length ? {
    tipo: 'aviso', clave: 'corpus-sin-reels-nuevos',
    contenido: `Hace tiempo que no entran reels nuevos de: ${parados.map(c => c.dias == null ? `${c.nombre} (ninguno analizado)` : `${c.nombre} (${c.dias} días)`).join(', ')}. Pega enlaces recientes en Agente de contenido para que el estudio no se quede viejo.`,
  } : null
  if (avisoCorpus) await ctx.log(`Sin reels nuevos en 14 días o más: ${parados.map(c => c.nombre).join(', ')}.`)

  if (reels.length < 3) {
    await ctx.log(`Solo hay ${reels.length} reels analizados de los creadores: demasiado poco para sacar patrones.`)
    await escribeMemoria(ctx, { memoria: avisoCorpus ? [avisoCorpus] : [] })
    return 'Corpus aún pequeño para sacar patrones.'
  }

  // Por creador: sus más vistos y los últimos en entrar.
  const bloque = creadores.map(c => {
    const suyos = reels.filter(r => r.identity_id === c.id)
    if (!suyos.length) return ''
    const top = [...suyos].sort((a, b) => vistas(b) - vistas(a)).slice(0, 8)
    const recientes = [...suyos].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .filter(r => !top.includes(r)).slice(0, 5)
    const linea = (r) => `- ${vistas(r) ? `${vistas(r)} vistas` : 'vistas desconocidas'} · gancho ${r.etiquetas?.tipo_gancho || '?'} · tema «${r.etiquetas?.tema || '?'}» · ${r.etiquetas?.tipo || '?'} · abre: «${ganchoDe(r)}»`
    return `## ${c.nombre}${c.categoria ? ` (${c.categoria})` : ''}\nMás vistos:\n${top.map(linea).join('\n')}${recientes.length ? `\nÚltimos en entrar:\n${recientes.map(linea).join('\n')}` : ''}`
  }).filter(Boolean).join('\n\n')

  const out = await ctx.pide({
    system: `Eres el investigador del equipo de contenido de un perfil de Instagram. Estudias los reels de sus creadores de referencia y dejas en la memoria los temas y ganchos que se repiten, para que el guionista los use.

Qué cuenta como patrón: algo que aparece en reels de MÁS DE UN creador, o varias veces entre los más vistos de uno. Cita siempre un ejemplo literal de apertura entre comillas y di en cuántos reels lo has visto. Lo que solo aparece una vez no es un patrón.

Las etiquetas de gancho y tema pueden estar mal puestas: fíate de la frase literal antes que de la etiqueta.

${REGLAS_COMUNES}`,
    user: [
      `Perfil: ${ctx.perfil.name}.`,
      ctx.encargo ? `Encargo del director: ${ctx.encargo}` : '',
      `\n# Reels de los creadores de referencia\n${bloque}`,
      `\n# Memoria compartida\n${memoriaTexto(await memoriaDe(clientId), 'investigador')}`,
    ].filter(Boolean).join('\n'),
    herramienta: {
      name: 'informe_investigacion',
      description: 'Entrega lo que has encontrado.',
      input_schema: { type: 'object', properties: { ...ESQUEMA_MEMORIA }, required: ['hecho', 'memoria'] },
    },
    maxTokens: 3000,
  })
  await escribeMemoria(ctx, { ...out, memoria: [avisoCorpus, ...(Array.isArray(out.memoria) ? out.memoria : [])].filter(Boolean) })
  return `${anadidos} reels nuevos esta semana en el corpus. ${String(out.hecho || '').slice(0, 300)}`
}

async function analista(ctx) {
  const { clientId } = ctx
  const ig = await getIgConfig(supabase, clientId)
  if (!ig?.config?.token) {
    await ctx.log('Instagram no está conectado en este perfil: HELM no tiene las métricas de sus reels. Conéctalo en Ajustes → Instagram.')
    return 'Sin datos: Instagram no está conectado. No he escrito conclusiones.'
  }
  try {
    const s = await sincronizarIg(clientId, 60)
    await ctx.log(`Instagram sincronizado: ${s.sincronizadas} publicaciones de @${s.username || '?'}.`)
  } catch (err) {
    await ctx.log(`No pude sincronizar Instagram (${String(err.message).slice(0, 160)}). Sigo con lo último guardado.`)
  }
  const reels = (await reelsPropios(clientId)).filter(r => r.visitas > 0)
  if (reels.length < 3) {
    await ctx.log(`Solo hay ${reels.length} reels propios con métricas: con menos de 3 no se puede comparar.`)
    return `Sin datos suficientes: ${reels.length} reels con métricas. No he escrito conclusiones.`
  }

  const orden = [...reels].sort((a, b) => b.visitas - a.visitas)
  const mediana = orden[Math.floor(orden.length / 2)].visitas
  const linea = (r) => [
    String(r.publicado_en || '').slice(0, 10), `${r.visitas} visitas`, `${r.likes} likes`, `${r.comentarios} comentarios`,
    `${r.guardados} guardados`, `${r.compartidos} compartidos`,
    r.retencion_media ? `${r.retencion_media} s de visionado medio` : '', `${r.seguidores_ganados} seguidores`,
    `«${String(r.caption).replace(/\s+/g, ' ').slice(0, 160)}»`,
  ].filter(Boolean).join(' · ')
  await ctx.log(`Comparo ${reels.length} reels propios. Mediana: ${mediana} visitas; el mejor, ${orden[0].visitas}; el peor, ${orden.at(-1).visitas}.`)

  const out = await ctx.pide({
    system: `Eres el analista del equipo de contenido de un perfil de Instagram. Comparas las métricas de sus reels publicados y dices qué ha funcionado y qué no.

Reglas del análisis:
· Cada conclusión lleva sus cifras: cuántos reels, cuántas visitas, frente a qué mediana. Una conclusión sin cifra no se escribe.
· «Funciona» es lo que se repite entre los de arriba y no entre los de abajo. Si algo aparece igual en los dos extremos, no explica nada.
· Con pocos reels, dilo: «con 6 reels esto es una pista, no una regla».
· Nada de opiniones sobre calidad ni consejos genéricos.
· Si los datos apuntan a cambiar la estrategia (un tipo de gancho, un tema, una duración), escríbelo como nota de tipo "propuesta".

${REGLAS_COMUNES}`,
    user: [
      `Perfil: ${ctx.perfil.name}. Hoy es ${diaMadrid()}.`,
      ctx.encargo ? `Encargo del director: ${ctx.encargo}` : '',
      `\n# Reels propios, de más a menos visitas (mediana: ${mediana})\n${orden.map(r => `- ${linea(r)}`).join('\n')}`,
      `\n# Memoria compartida\n${memoriaTexto(await memoriaDe(clientId), 'analista')}`,
    ].filter(Boolean).join('\n'),
    herramienta: {
      name: 'informe_analisis',
      description: 'Entrega tus conclusiones.',
      input_schema: { type: 'object', properties: { ...ESQUEMA_MEMORIA }, required: ['hecho', 'memoria'] },
    },
    maxTokens: 3000,
  })
  await escribeMemoria(ctx, out)
  return String(out.hecho || 'Análisis hecho.').slice(0, 400)
}

// ── El mejor día para publicar, por las métricas del perfil ─────────────────
// La mediana de visitas de cada día de la semana (hora de Madrid). Con esto el
// guionista programa los borradores en los días que de verdad funcionan en esta
// cuenta, no en el primer hueco. Sin datos suficientes devuelve null y se vuelve
// al comportamiento de antes (primeros días libres). Es el mismo criterio que la
// sección «Informe de contenido», calculado aquí desde helm_ig_media para no
// depender de nada más.
const DOW_MADRID = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Madrid' })
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // lunes=0 … domingo=6
const diaSemanaDe = (iso) => DOW.indexOf(DOW_MADRID.format(new Date(iso)))
const diaSemanaFecha = (dia) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7
const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const medianaNum = (xs) => {
  const o = xs.filter(x => x != null).sort((a, b) => a - b)
  if (!o.length) return null
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** Días de la semana (0=lunes…6=domingo) ordenados de mejor a peor por mediana
 *  de visitas, o null si no hay piezas suficientes para fiarse. */
async function mejoresDiasSemana(clientId) {
  const { data } = await supabase.from('helm_ig_media')
    .select('publicado_en, visitas').eq('client_id', clientId).not('publicado_en', 'is', null)
  const piezas = (data || []).filter(p => p.visitas != null)
  if (piezas.length < 8) return null
  const porDia = Array.from({ length: 7 }, () => [])
  for (const p of piezas) { const d = diaSemanaDe(p.publicado_en); if (d >= 0) porDia[d].push(p.visitas) }
  const rank = porDia
    .map((vs, i) => ({ i, med: vs.length >= 2 ? medianaNum(vs) : null }))
    .filter(d => d.med != null)
    .sort((a, b) => b.med - a.med)
  return rank.length >= 2 ? rank.map(d => d.i) : null
}

/** Las n fechas para los guiones: libres, a partir de mañana. Con ranking, las
 *  más próximas que caigan en los mejores días; si faltan (o no hay ranking), se
 *  completan con los primeros huecos libres. */
function proximasFechas(hoy, n, ocupados, ranking) {
  const fechas = []
  if (ranking && ranking.length) {
    const buenos = new Set(ranking.slice(0, Math.max(2, n)))
    for (let i = 1; i <= 56 && fechas.length < n; i++) {
      const d = masDias(hoy, i)
      if (!ocupados.has(d) && buenos.has(diaSemanaFecha(d))) fechas.push(d)
    }
  }
  for (let i = 1; fechas.length < n && i < 40; i++) {
    const d = masDias(hoy, i)
    if (!ocupados.has(d) && !fechas.includes(d)) fechas.push(d)
  }
  return fechas
}

// Las n fechas óptimas dentro de un periodo [desde, hasta]: libres y, con
// ranking de métricas, en los mejores días primero; si no hay suficientes días
// libres, se repiten (un día admite varias piezas).
function fechasDePeriodo(desde, hasta, n, ocupados, ranking) {
  const todos = []
  const libres = []
  for (let d = desde, i = 0; d <= hasta && i < 400; d = masDias(d, 1), i++) {
    todos.push(d)
    if (!ocupados.has(d)) libres.push(d)
  }
  // Si ya no quedan días libres (el plan pide varias piezas por día), se reparte
  // igualmente sobre todos los días: mejor dos guiones un día que ninguno.
  if (!libres.length) libres.push(...todos)
  if (ranking && ranking.length) {
    const pref = (dia) => { const k = ranking.indexOf(diaSemanaFecha(dia)); return k < 0 ? 99 : k }
    libres.sort((a, b) => pref(a) - pref(b) || (a < b ? -1 : 1))
  }
  const out = []
  for (let i = 0; out.length < n && libres.length; i++) out.push(libres[i % libres.length])
  return out
}

// Reúne el material del perfil y escribe guiones para unas fechas dadas, en
// borrador. Lo comparten el guionista (día a día) y el programador (por periodo
// y tipo). Con tipoForzado, TODOS son de ese tipo; sin él, el modelo elige.
async function escribeGuiones(ctx, { fechas, tipoForzado = null, nota = null, avisar = true }) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  if (!fechas?.length) { await ctx.log('Sin fechas libres: no escribo.'); return [] }
  const creadores = (await creadoresDe(clientId)).filter(c => !esPropio(c))
  const ids = creadores.map(c => c.id)
  const [reels, estudios, guia, biblia, propios, cal, notas] = await Promise.all([
    reelsDe(ids),
    ids.length ? supabase.from('agent_memory').select('identity_id, contenido').in('identity_id', ids).eq('clave', 'estudio') : { data: [] },
    supabase.from('agent_memory').select('contenido').eq('ambito', 'global').is('client_id', null).limit(5),
    supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId),
    reelsPropios(clientId),
    calendarioTexto(clientId, masDias(hoy, -21), masDias(hoy, 35)),
    memoriaDe(clientId),
  ])
  const top = [...reels].filter(r => vistas(r) > 0).sort((a, b) => vistas(b) - vistas(a)).slice(0, 12)
  const nombre = (id) => creadores.find(c => c.id === id)?.nombre || '?'
  const guionDe = (r) => ((r.frases || []).length ? r.frases.map(f => `[${f.rol}] ${f.texto}`).join('\n') : String(r.transcripcion || '')).slice(0, 1400)
  const mejoresPropios = [...propios].filter(r => r.visitas > 0).sort((a, b) => b.visitas - a.visitas).slice(0, 6)
  const n = fechas.length

  const user = [
    `Perfil: ${ctx.perfil.name} (${ctx.perfil.slug}). Hoy es ${hoy}.`,
    `Escribe ${n} ${n === 1 ? 'guion' : 'guiones'}, para estas fechas: ${fechas.join(', ')}.${tipoForzado ? ` TODOS de tipo "${TIPOS[tipoForzado] || tipoForzado}".` : ''}`,
    nota || '',
    ctx.encargo ? `Encargo del director: ${ctx.encargo}` : '',
    `\n# Memoria compartida del perfil\n${memoriaTexto(notas, 'guionista')}`,
    (biblia.data || []).length ? `\n# Quién es este perfil\n${biblia.data.map(b => `## ${b.kind}\n${String(b.content).slice(0, 5000)}`).join('\n\n')}` : '',
    mejoresPropios.length ? `\n# Los reels propios que mejor han funcionado\n${mejoresPropios.map(r => `- ${r.visitas} visitas · «${String(r.caption).replace(/\s+/g, ' ').slice(0, 200)}»`).join('\n')}` : '',
    `\n# Guiones que ya están en el calendario (no repitas tema)\n${cal.texto}`,
    (estudios.data || []).length ? `\n# Estudios de los creadores de referencia\n${estudios.data.map(e => `## ${nombre(e.identity_id)}\n${String(e.contenido).slice(0, 2500)}`).join('\n\n')}` : '',
    top.length ? `\n# Los reels más vistos de los creadores de referencia\n${top.map(r => `### ${nombre(r.identity_id)} · ${vistas(r)} vistas · gancho ${r.etiquetas?.tipo_gancho || '?'}\n${guionDe(r)}`).join('\n\n')}` : '',
    (guia.data || []).length ? `\n# Guías globales\n${guia.data.map(g => String(g.contenido).slice(0, 2500)).join('\n\n')}` : '',
  ].filter(Boolean).join('\n')

  const out = await ctx.pide({
    system: `Eres el guionista del equipo de contenido de un perfil de Instagram. Escribes guiones de reel listos para grabar.

Cómo escribes:
· El guion entero, tal como se va a decir en voz alta, en la voz del perfil. Es lo que permite luego reconocer el vídeo grabado.
· Copia la ESTRUCTURA de lo que funciona a los creadores de referencia (cómo abren, cómo desarrollan, cómo piden), nunca sus frases ni sus temas tal cual: el tema es del perfil.
· Las reglas del dueño y lo aprendido en la memoria mandan sobre todo lo demás.
· Frases cortas. El gancho en los 3 primeros segundos. Entre 30 y 60 segundos hablados salvo que la memoria diga otra cosa.
· No repitas un tema que ya esté en el calendario.
· Cada guion lleva su tipo: viralidad (alcance), autoridad (demostrar que sabe), conversion (llevar a la conversación) o venta.${tipoForzado ? ` En esta tanda, TODOS son de tipo "${tipoForzado}".` : ''}
· En "inspirado_en" di de qué reel o patrón sale la estructura.
· Si te falta algo para escribir bien (reglas de marca, de qué va el perfil), déjalo como recado para el director.

Tus guiones quedan en borrador. No se publican ni se aprueban solos.

${REGLAS_COMUNES}`,
    user,
    herramienta: {
      name: 'entregar_guiones',
      description: 'Entrega los guiones escritos.',
      input_schema: {
        type: 'object',
        properties: {
          guiones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fecha: { type: 'string', description: 'AAAA-MM-DD, una de las fechas pedidas.' },
                titulo: { type: 'string' },
                tipo: { type: 'string', enum: Object.keys(TIPOS) },
                guion: { type: 'string', description: 'El guion entero, tal como se dice.' },
                inspirado_en: { type: 'string' },
              },
              required: ['fecha', 'titulo', 'tipo', 'guion'],
            },
          },
          ...ESQUEMA_MEMORIA,
        },
        required: ['guiones', 'hecho'],
      },
    },
    maxTokens: 8000, esfuerzo: 'medium',
  })

  const escritos = []
  const libres = [...fechas]
  for (const g of (Array.isArray(out.guiones) ? out.guiones : []).slice(0, n)) {
    const guion = String(g?.guion || '').trim()
    const titulo = String(g?.titulo || '').trim().slice(0, 200)
    if (!guion || !titulo) continue
    // La fecha, de las pedidas; si el modelo se la inventa, la primera libre.
    const fecha = libres.includes(g.fecha) ? g.fecha : libres[0]
    if (!fecha) break
    libres.splice(libres.indexOf(fecha), 1)
    // Puntúa el gancho (la primera línea) con el scorer determinista: una señal
    // para el dueño, no un bloqueo.
    const primeraLinea = String(guion).split('\n').map(s => s.trim()).filter(Boolean)[0] || guion
    const gp = puntuarGancho(primeraLinea)
    const formula = clasificaGancho(primeraLinea)
    const notaGancho = `Gancho (auto): ${gp.score}/100 · ${gp.verdict}`
      + (gp.verdict !== 'STRONG' ? ` · a pulir: ${gp.weakest}` : '')
      + (formula ? ` · fórmula: ${formula.nombre}` : '')
    const partes = [guion]
    if (g.inspirado_en) partes.push(`Inspirado en: ${String(g.inspirado_en).slice(0, 300)}`)
    partes.push(notaGancho)
    const cuerpo = partes.join('\n\n---\n')
    const tipoFinal = tipoForzado || (TIPOS[g.tipo] ? g.tipo : null)
    const { error } = await supabase.from('helm_content_calendar').insert({
      client_id: clientId, date: fecha, title: titulo, body: cuerpo, format: 'reel',
      tipo: tipoFinal, source: 'agente', revision: 'borrador',
    })
    if (error) throw error
    escritos.push({ fecha, titulo, tipo: tipoFinal })
    await ctx.log(`Borrador: ${fecha} · «${titulo}» (${TIPOS[tipoFinal] || 'sin tipo'}).`)
  }
  if (avisar && escritos.length) {
    await notificar(supabase, clientId, {
      tipo: 'agentes', destino: 'contenido',
      titulo: `${escritos.length} ${escritos.length === 1 ? 'guion nuevo' : 'guiones nuevos'} en borrador`,
      cuerpo: `${escritos.map(e => `${e.fecha} · ${e.titulo}`).join('\n')}\nRevísalos en Agentes → Equipo → Borradores.`,
    })
  }
  await escribeMemoria(ctx, out)
  return escritos
}

async function guionista(ctx) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  const n = Math.min(Math.max(Number(ctx.cfg.guiones_dia) || 2, 1), 5)
  const cal = await calendarioTexto(clientId, masDias(hoy, -21), masDias(hoy, 21))
  const ocupados = new Set(cal.guiones.map(g => g.date))
  const ranking = await mejoresDiasSemana(clientId)
  const fechas = proximasFechas(hoy, n, ocupados, ranking)
  await ctx.log(`Fechas para los ${n} guiones: ${fechas.join(', ')}${ranking ? ` · mejores días: ${ranking.slice(0, 3).map(i => NOMBRE_DIA[i]).join(', ')}` : ' · primeros huecos libres'}.`)
  const escritos = await escribeGuiones(ctx, { fechas })
  return escritos.length
    ? `${escritos.length} ${escritos.length === 1 ? 'guion' : 'guiones'} en borrador: ${escritos.map(e => `${e.fecha} · ${e.titulo}`).join('; ')}.`
    : 'No escribí ningún guion.'
}

// ── El programador: contenido por TIPO y PERIODO, idempotente ───────────────
// Para cada tipo pedido, si el periodo ya tiene suficientes guiones de ese tipo
// no hace nada; si faltan, escribe los que falten en los mejores días libres.
// Lo lanza el botón «iniciar estudio y creación» (ctx.params con desde/hasta/
// tipos/porTipo) o, cada lunes, el horario para la semana entrante.
const REPARTO_SEMANA = { viralidad: 3, autoridad: 2, conversion: 1, venta: 0 }
async function programador(ctx) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  const p = ctx.params || {}
  const desde = p.desde || masDias(hoy, 1)
  const hasta = p.hasta || masDias(desde, 13)          // por defecto, dos semanas
  const semanas = Math.max(1, Math.round((diasEntre(desde, hasta) + 1) / 7))
  const tipos = (Array.isArray(p.tipos) && p.tipos.length ? p.tipos : Object.keys(REPARTO_SEMANA)).filter(t => TIPOS[t])
  // Objetivo por tipo: si el botón manda porTipo, se usa tal cual; si no, el
  // reparto semanal por el nº de semanas del periodo.
  const objetivo = (t) => Math.max(0, Math.round(p.porTipo?.[t] != null ? Number(p.porTipo[t]) : (REPARTO_SEMANA[t] || 0) * semanas))

  const { data: existentes } = await supabase.from('helm_content_calendar')
    .select('date, tipo').eq('client_id', clientId).gte('date', desde).lte('date', hasta)
  const hay = {}; for (const g of existentes || []) hay[g.tipo] = (hay[g.tipo] || 0) + 1
  const ocupados = new Set((existentes || []).map(g => g.date))
  const ranking = await mejoresDiasSemana(clientId)

  await ctx.log(`Periodo ${desde} → ${hasta} (${semanas} sem). Tipos: ${tipos.map(t => TIPOS[t]).join(', ')}.`)
  const resumen = []
  for (const tipo of tipos) {
    const meta = objetivo(tipo)
    const tiene = hay[tipo] || 0
    const faltan = meta - tiene
    if (faltan <= 0) { await ctx.log(`${TIPOS[tipo]}: ya hay ${tiene}/${meta}, no toco nada (idempotente).`); resumen.push(`${TIPOS[tipo]}: ya estaba (${tiene})`); continue }
    const fechas = fechasDePeriodo(desde, hasta, faltan, ocupados, ranking)
    for (const f of fechas) ocupados.add(f)              // repartir entre días
    await ctx.log(`${TIPOS[tipo]}: faltan ${faltan} (hay ${tiene}/${meta}). Escribo en ${fechas.join(', ')}.`)
    const nota = `IMPORTANTE: faltan ${faltan} guiones de ${TIPOS[tipo]} para completar el plan de estas semanas. Escribe EXACTAMENTE ${faltan}, uno por cada fecha pedida, aunque el calendario ya tenga temas parecidos: dales un ángulo, un gancho o un sub-tema NUEVO. No devuelvas la lista vacía ni menos de ${faltan}.`
    const escritos = await escribeGuiones(ctx, { fechas, tipoForzado: tipo, nota, avisar: false })
    resumen.push(`${TIPOS[tipo]}: +${escritos.length}`)
  }
  await notificar(supabase, clientId, {
    tipo: 'agentes', destino: 'roadmap',
    titulo: `Programación de contenido lista · ${desde} → ${hasta}`,
    cuerpo: `${resumen.join('\n')}\nRevísalos en el Roadmap (día a día) o en Agentes → Por aprobar.`,
  }).catch(() => {})
  return resumen.join(' · ') || 'Nada que programar.'
}

// Sin nada que contar no se llama al modelo, pero los avisos de la vez
// anterior ya no valen.
async function sinAvisos(ctx) {
  await supabase.from('agent_memory').delete().eq('client_id', ctx.clientId).eq('agente', ctx.agente).eq('tipo', 'aviso')
}

const ENTREGA_PARTE = (name, description) => ({
  name, description,
  input_schema: { type: 'object', properties: { ...ESQUEMA_MEMORIA, ...ESQUEMA_TAREAS }, required: ['hecho', 'memoria'] },
})

async function productor(ctx) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  const piezas = await flujoPiezas(clientId, { fresco: true })
  if (!piezas.length) {
    await ctx.log('No hay ningún guion en el calendario de las últimas semanas: no hay piezas que seguir.')
    await sinAvisos(ctx)
    return 'Sin piezas en el calendario: no hice nada.'
  }
  const a = atascos(piezas, hoy)
  await ctx.log(`${piezas.length} piezas: ${a.borradores.length} en borrador, ${a.grabarAtrasado.length + a.grabarPronto.length} por grabar (${a.grabarAtrasado.length} con la fecha pasada), ${a.sinEncargo.length + a.enEdicion.length} sin editar, ${a.sinPublicar.length} editadas sin publicar, ${a.publicados} publicadas.`)
  if (a.huecos.length) await ctx.log(`Días de la próxima semana sin guion aprobado: ${a.huecos.join(', ')}.`)

  const bloque = (titulo, lineas) => `## ${titulo}\n${lineas.length ? lineas.join('\n') : '(Nada.)'}`
  const out = await ctx.pide({
    system: `Eres el productor del equipo de contenido de un perfil de Instagram. Sigues cada pieza desde el guion hasta que se publica y dices qué está atascado y qué toca hoy.

Las etapas: borrador (espera que el dueño lo apruebe) → por grabar → sin editar (grabado; hay que encargarlo al editor) → editado (listo para publicar) → publicado.

Qué entregas:
· Avisos (tipo "aviso"): uno por cada cosa que el dueño tiene que mirar hoy, con el título de la pieza y la fecha. Primero lo que lleva más días parado. Si no hay nada atascado, no escribas avisos.
· Tareas: solo lo que el dueño tiene que hacer él con una pieza concreta que ya existe (grabar tal pieza, encargar tal vídeo al editor, publicar tal reel). Una por pieza, con su fecha. Aprobar borradores no es una tarea: ya los ve en su bandeja. Nada de tareas genéricas ni condicionales.
· Recados (tipo "para"): al guionista si faltan guiones para los próximos días o si sobran borradores sin aprobar; al director si algo se repite.
No mueves nada tú: ni fechas, ni fases, ni encargos.

${REGLAS_COMUNES}`,
    user: [
      `Perfil: ${ctx.perfil.name}. Hoy es ${hoy}.`,
      ctx.encargo ? `Encargo del director: ${ctx.encargo}` : '',
      '\n# Dónde está cada pieza',
      bloque('Borradores sin aprobar', a.borradores),
      bloque('Por grabar con la fecha pasada', a.grabarAtrasado),
      bloque('Por grabar hoy y en los próximos 3 días', a.grabarPronto),
      bloque('Grabadas sin encargo al editor', a.sinEncargo),
      bloque('En edición', a.enEdicion),
      bloque('Editadas sin publicar', a.sinPublicar),
      `Publicadas en las últimas semanas: ${a.publicados}.`,
      `Días de la próxima semana sin guion aprobado: ${a.huecos.join(', ') || 'ninguno'}.`,
      `\n# Memoria compartida\n${memoriaTexto(await memoriaDe(clientId), 'productor')}`,
    ].filter(Boolean).join('\n'),
    herramienta: ENTREGA_PARTE('parte_produccion', 'Entrega el parte de producción.'),
    maxTokens: 2500,
  })
  await escribeMemoria(ctx, out)
  return String(out.hecho || 'Parte de producción hecho.').slice(0, 400)
}

// Etapas del embudo que ya no hay que perseguir.
const CERRADAS = /won|lost|ganad|perdid|cliente|descart/i

async function comercial(ctx) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  const ahora = Date.now()
  const [contactos, llamadas, cobros, ventas] = await Promise.all([
    supabase.from('crm_contacts')
      .select('name, company, status, stage_key, source, deal_value, last_activity_at, created_at')
      .eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
    llamadasEntre(clientId, new Date(ahora - 7 * 86_400_000).toISOString(), new Date(ahora + 2 * 86_400_000).toISOString()),
    supabase.from('helm_edicion_cobros').select('concepto, importe, vence').eq('client_id', clientId).eq('estado', 'pendiente'),
    supabase.from('sales').select('date, client_name, product, revenue, cash_collected')
      .eq('client_id', clientId).gte('date', masDias(hoy, -30)).order('date', { ascending: false }).limit(200),
  ])
  for (const r of [contactos, cobros, ventas]) if (r.error) throw r.error

  const etapa = (c) => c.stage_key || c.status || 'lead'
  const abiertos = (contactos.data || []).filter(c => !CERRADAS.test(etapa(c)))
  const quieto = (c) => Math.floor((ahora - Date.parse(c.last_activity_at || c.created_at)) / 86_400_000)
  const frios = abiertos.filter(c => quieto(c) >= 5)
    .sort((x, y) => (Number(y.deal_value) || 0) - (Number(x.deal_value) || 0) || quieto(y) - quieto(x)).slice(0, 25)
  const nuevos = abiertos.filter(c => ahora - Date.parse(c.created_at) < 7 * 86_400_000)
  const porEtapa = {}
  for (const c of abiertos) porEtapa[etapa(c)] = (porEtapa[etapa(c)] || 0) + 1
  const proximas = llamadas.filter(c => Date.parse(c.starts_at) >= ahora)
  const sinCerrar = llamadas.filter(c => Date.parse(c.starts_at) < ahora && !c.outcome && c.status === 'agendada')
  const vencidos = (cobros.data || []).filter(c => c.vence && c.vence < hoy)
  const aMedias = (ventas.data || []).filter(v => Number(v.revenue) > Number(v.cash_collected))

  await ctx.log(`CRM: ${abiertos.length} contactos abiertos (${nuevos.length} de esta semana, ${frios.length} sin movimiento en 5 días o más). Llamadas: ${proximas.length} en las próximas 48 h, ${sinCerrar.length} pasadas sin resultado. Cobros pendientes: ${(cobros.data || []).length} (${vencidos.length} vencidos). Ventas de 30 días: ${(ventas.data || []).length}.`)
  if (!abiertos.length && !llamadas.length && !(cobros.data || []).length && !(ventas.data || []).length) {
    await ctx.log('No hay contactos, llamadas, cobros ni ventas en este perfil: no hay nada que repasar.')
    await sinAvisos(ctx)
    return 'Sin datos comerciales en este perfil: no hice nada.'
  }

  const lista = (l, f) => l.length ? l.map(f).join('\n') : '(Nada.)'
  const eur = (n) => `${Math.round(Number(n) || 0)} €`
  const out = await ctx.pide({
    system: `Eres el comercial del equipo que lleva un perfil. Cada mañana repasas el CRM, las llamadas y los cobros y dices a quién hay que atender hoy.

Qué entregas:
· Avisos (tipo "aviso"): lo que se enfría o vence, con nombre, días y cifra. Primero lo que más dinero mueve. Sin datos que lo respalden, no hay aviso.
· Tareas: a quién escribir o llamar hoy y por qué, una por persona, como mucho 5.
· Si ves un patrón (de dónde vienen los leads que avanzan, en qué etapa se quedan), una nota "aprendido" con sus cifras. Si sale de un tema de contenido, deja un recado al guionista.
Tú no escribes a nadie ni cambias nada del CRM: avisas y propones.

${REGLAS_COMUNES}`,
    user: [
      `Perfil: ${ctx.perfil.name}. Hoy es ${hoy}.`,
      ctx.encargo ? `Encargo del director: ${ctx.encargo}` : '',
      `\n# Embudo (contactos abiertos por etapa)\n${Object.entries(porEtapa).map(([k, n]) => `- ${k}: ${n}`).join('\n') || '(Vacío.)'}`,
      `\n# Contactos nuevos de los últimos 7 días\n${lista(nuevos.slice(0, 25), c => `- ${c.name || 'sin nombre'} · etapa ${etapa(c)} · origen ${c.source || '?'}`)}`,
      `\n# Contactos abiertos sin movimiento en 5 días o más\n${lista(frios, c => `- ${c.name || 'sin nombre'}${c.company ? ` (${c.company})` : ''} · etapa ${etapa(c)} · ${quieto(c)} días quieto${Number(c.deal_value) ? ` · ${eur(c.deal_value)}` : ''}`)}`,
      `\n# Llamadas de las próximas 48 horas\n${lista(proximas, c => `- ${diaMadrid(new Date(c.starts_at))} ${horaDe(c.starts_at)} · ${c.title}${c.contact_id ? '' : ' · sin ficha en el CRM'}`)}`,
      `\n# Llamadas de la última semana sin resultado apuntado\n${lista(sinCerrar, c => `- ${diaMadrid(new Date(c.starts_at))} · ${c.title}`)}`,
      `\n# Cobros pendientes\n${lista(cobros.data || [], c => `- ${c.concepto} · ${eur(c.importe)}${c.vence ? ` · vence ${c.vence}${c.vence < hoy ? ' (VENCIDO)' : ''}` : ''}`)}`,
      `\n# Ventas de los últimos 30 días con dinero por cobrar\n${lista(aMedias, v => `- ${v.date} · ${v.client_name || '?'} · ${v.product || '?'} · cobrado ${eur(v.cash_collected)} de ${eur(v.revenue)}`)}`,
      `\n# Memoria compartida\n${memoriaTexto(await memoriaDe(clientId), 'comercial')}`,
    ].filter(Boolean).join('\n'),
    herramienta: ENTREGA_PARTE('parte_comercial', 'Entrega el parte comercial.'),
    maxTokens: 2500,
  })
  await escribeMemoria(ctx, out)
  return String(out.hecho || 'Parte comercial hecho.').slice(0, 400)
}

async function informe(ctx) {
  const { clientId } = ctx
  const hoy = diaMadrid()
  const desde = masDias(hoy, -7), antes = masDias(hoy, -14)
  const [reels, piezas, contactos, ventas, runs] = await Promise.all([
    reelsPropios(clientId, 80),
    flujoPiezas(clientId, { fresco: true }),
    supabase.from('crm_contacts').select('source, utm_content, status, stage_key, created_at')
      .eq('client_id', clientId).gte('created_at', `${antes}T00:00:00Z`).limit(1000),
    supabase.from('sales').select('date, product, revenue, cash_collected, utm_content')
      .eq('client_id', clientId).gte('date', antes).limit(500),
    supabase.from('agent_ejecuciones').select('agente, estado, tokens_in, tokens_out')
      .eq('client_id', clientId).gte('empezado_en', `${desde}T00:00:00Z`),
  ])
  for (const r of [contactos, ventas, runs]) if (r.error) throw r.error

  const enSemana = (d) => d >= desde && d < hoy
  const enAnterior = (d) => d >= antes && d < desde
  const dia = (t) => diaMadrid(new Date(t))
  const publicados = reels.filter(r => r.publicado_en && enSemana(dia(r.publicado_en)))
  const publicadosAntes = reels.filter(r => r.publicado_en && enAnterior(dia(r.publicado_en)))
  const leads = (contactos.data || []).filter(c => enSemana(dia(c.created_at)))
  const leadsAntes = (contactos.data || []).filter(c => enAnterior(dia(c.created_at)))
  const vend = (ventas.data || []).filter(v => enSemana(v.date))
  const vendAntes = (ventas.data || []).filter(v => enAnterior(v.date))
  const suma = (l, k) => Math.round(l.reduce((s, x) => s + (Number(x[k]) || 0), 0))
  const grabadas = piezas.filter(p => p.grabado_at && enSemana(dia(p.grabado_at))).length
  const tokens = (runs.data || []).reduce((s, e) => s + e.tokens_in + e.tokens_out, 0)

  await ctx.log(`Semana del ${desde} al ${masDias(hoy, -1)}: ${publicados.length} reels publicados con métricas, ${grabadas} piezas grabadas, ${leads.length} leads nuevos, ${vend.length} ventas (${suma(vend, 'revenue')} €).`)
  if (!publicados.length && !publicadosAntes.length && !leads.length && !vend.length && !grabadas) {
    await ctx.log('No hay reels con métricas, leads ni ventas de la semana: sin datos no hay informe.')
    return 'Sin datos de la semana: no escribí informe.'
  }

  const origenes = {}
  for (const c of leads) origenes[c.source || 'sin origen'] = (origenes[c.source || 'sin origen'] || 0) + 1
  const reel = (r) => `- ${dia(r.publicado_en)} · ${r.visitas} visitas · ${r.guardados} guardados · ${r.compartidos} compartidos · ${r.seguidores_ganados} seguidores · «${String(r.caption).replace(/\s+/g, ' ').slice(0, 140)}»`
  const out = await ctx.pide({
    system: `Eres quien escribe el informe semanal del equipo que lleva un perfil. Cruzas el contenido publicado con los leads y las ventas de la semana y dices qué funcionó, qué no y qué cambiar.

Cómo es el informe:
· Texto corrido en 3 bloques cortos con su título: «Qué pasó» (las cifras de la semana frente a la anterior), «Qué funcionó y qué no» (solo lo que los datos sostienen) y «Qué hacer esta semana» (de 2 a 4 cosas concretas).
· Cada afirmación con su cifra. Si un dato falta (no hay ventas registradas, Instagram sin conectar), dilo en vez de rellenar.
· No atribuyas una venta o un lead a un reel si el dato no lo dice: di «coincide en fechas», no «gracias a».
· Lo que proponga cambiar la estrategia va además como nota de tipo "propuesta"; lo que haya que hacer, como tarea.

${REGLAS_COMUNES}`,
    user: [
      `Perfil: ${ctx.perfil.name}. Hoy es ${hoy}. Semana: del ${desde} al ${masDias(hoy, -1)}. Semana anterior: del ${antes} al ${masDias(desde, -1)}.`,
      `\n# Reels publicados esta semana (${publicados.length}; la anterior, ${publicadosAntes.length} con ${suma(publicadosAntes, 'visitas')} visitas en total)\n${publicados.map(reel).join('\n') || '(Ninguno con métricas.)'}`,
      `\n# Producción\nPiezas grabadas esta semana: ${grabadas}. Ahora mismo: ${ETAPAS.map(e => `${piezas.filter(p => p.etapa === e).length} ${e.replace('_', ' ')}`).join(', ')}.`,
      `\n# Leads\nNuevos esta semana: ${leads.length} (la anterior: ${leadsAntes.length}). Por origen: ${Object.entries(origenes).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}.`,
      `\n# Ventas\nEsta semana: ${vend.length} ventas, ${suma(vend, 'revenue')} € facturados, ${suma(vend, 'cash_collected')} € cobrados. La anterior: ${vendAntes.length} ventas, ${suma(vendAntes, 'revenue')} €.${vend.length ? `\n${vend.map(v => `- ${v.date} · ${v.product || '?'} · ${Math.round(Number(v.revenue) || 0)} €`).join('\n')}` : ''}`,
      `\n# El equipo de agentes\n${(runs.data || []).length} ejecuciones, ${(runs.data || []).filter(e => e.estado === 'error').length} con error, ${tokens} tokens.`,
      `\n# Memoria compartida\n${memoriaTexto(await memoriaDe(clientId), 'informe')}`,
    ].join('\n'),
    herramienta: {
      name: 'informe_semanal',
      description: 'Entrega el informe de la semana.',
      input_schema: {
        type: 'object',
        properties: { informe: { type: 'string', description: 'El informe entero, con sus tres bloques.' }, ...ESQUEMA_MEMORIA, ...ESQUEMA_TAREAS },
        required: ['informe', 'hecho'],
      },
    },
    maxTokens: 4000, esfuerzo: 'medium',
  })
  const texto = String(out.informe || '').trim()
  if (!texto) throw new Error('No llegó el texto del informe')
  // Una nota por semana: relanzarlo la misma semana la reescribe.
  await guardaNota(clientId, { clave: `informe/${desde}`, agente: 'informe', tipo: 'informe', contenido: texto.slice(0, 6000) })
  await ctx.log('Informe guardado en la memoria.')
  await notificar(supabase, clientId, {
    tipo: 'agentes', titulo: `Informe de la semana del ${desde}`,
    cuerpo: `${texto.slice(0, 280)}…\nEntero en Agentes → Equipo → Memoria.`, destino: 'contenido',
  })
  await escribeMemoria(ctx, out)
  return String(out.hecho || 'Informe semanal escrito.').slice(0, 400)
}

// ── Editor de reels ─────────────────────────────────────────────────────────
// Sigue el manual de edición que Alex guardó en la memoria (agent_memory,
// ambito 'editor'). El motor de render (ffmpeg/composición) está en
// construcción; por ahora el agente ENSEÑA el proceso paso a paso, para verlo
// en vivo. Se dispara a mano o por el conector de Claude (MCP): las dos vías
// encolan este mismo trabajo y el proceso se ve igual en el Registro. Por Drive
// no entra nada: la carpeta no se vigila.
const dormir = (ms) => new Promise(r => setTimeout(r, ms))
const PASOS_EDITOR = [
  ['Inspeccionar', 'ffprobe: duración, resolución, fps, rotación y audio; hoja de fotogramas cada 3 s.'],
  ['Transcribir', 'audio a 16 kHz mono; STT con tiempos por palabra (sherpa-onnx).'],
  ['Limpiar', 'detectar trabas, repeticiones y silencios de más de 0,6 s; cortar vídeo y audio en el mismo valle.'],
  ['Leer el contexto', 'una frase de qué defiende el vídeo; marcar palabras ancla: herramientas, cifras, pasos y la llamada a la acción.'],
  ['Elegir el formato', 'puntuar las frases visualizables: ≥60% → A (pantalla partida), ≤40% → B (b-roll).'],
  ['Plan de escenas', 'escenas de 2–4 s, una idea cada una; cada animación 0,05–0,15 s antes de su palabra ancla.'],
  ['Capturar lo real', 'las webs y repos que se nombran, con el navegador y a resolución nativa, en la tarjeta de navegador.'],
  ['Animar y componer', 'el estilo de la casa (#0A0A0C / rojo #E4362B / dorado #E8B93A); fotogramas con Pillow.'],
  ['Subtítulos y sonido', 'palabra a palabra en Inter ExtraBold; efectos por código 20 dB por debajo de la voz.'],
  ['Control de calidad', 'cada animación sobre su palabra (±0,15 s), zonas seguras de Instagram, voz ≈ -18 dB.'],
]

async function editor(ctx) {
  const video = ctx.encargo && /https?:|\.mp4|\.mov|v[ií]deo|reel/i.test(ctx.encargo) ? ctx.encargo : null
  const { data: manual } = await supabase.from('agent_memory').select('contenido')
    .eq('ambito', 'editor').eq('clave', 'editor-reels').is('client_id', null).maybeSingle()
  await ctx.log(manual?.contenido
    ? `Manual de edición cargado de la memoria de HELM (${manual.contenido.length} caracteres).`
    : 'No encontré el manual de edición en la memoria. Guárdalo para que lo siga.')
  await ctx.log(video
    ? `Vídeo recibido: ${String(video).slice(0, 200)}.`
    : 'Prueba en seco: todavía sin vídeo. Te enseño el proceso que seguiré cuando entre uno por el conector de Claude.')
  for (const [titulo, que] of PASOS_EDITOR) {
    await dormir(650)
    await ctx.log(`${titulo} — ${que}`)
  }
  await dormir(400)
  await ctx.log('Motor de render (ffmpeg + composición): EN CONSTRUCCIÓN. El plan y las decisiones salen; el montaje final llega por fases.')
  return video
    ? 'Proceso recorrido sobre el vídeo recibido. El render se monta por fases (motor en construcción).'
    : 'Demostración del proceso, sin vídeo. Motor de render en construcción.'
}

// ── El agente de virales (lunes 7:00 · o a mano) ─────────────────────────────
// Rastrea con Apify los reels recientes de los creadores de referencia del
// perfil, se queda con los que de verdad despegaron (visualizaciones muy por
// encima de la mediana de su propia cuenta), el modelo elige los que mejor
// encajan con ESTE perfil y los MANDA AL CORPUS (se transcriben y etiquetan
// solos, igual que si se pegaran a mano) + deja el informe en la memoria para
// que el guionista los use. Solo LEE Instagram: ni sigue, ni comenta, ni publica.
async function virales(ctx) {
  const { clientId } = ctx
  if (!apifyListo()) { await ctx.log('No hay APIFY_TOKEN en el worker: no puedo rastrear Instagram.'); return 'Sin APIFY_TOKEN.' }
  const creadores = (await creadoresDe(clientId)).filter(c => !esPropio(c))
  // El nombre de la identidad es el usuario de IG (p. ej. "soybedia", "hormozi").
  const cuentas = creadores.map(c => c.nombre).filter(h => /^[a-z0-9._]{1,30}$/i.test(h || ''))
  if (!cuentas.length) { await ctx.log('El perfil no tiene creadores de referencia con cuenta de Instagram.'); return 'Sin cuentas de referencia.' }
  const porHandle = new Map(creadores.map(c => [String(c.nombre).toLowerCase(), c]))
  await ctx.log(`Rastreo ${cuentas.length} cuentas de referencia (reels de los últimos 7 días): ${cuentas.map(c => '@' + c).join(', ')}.`)

  let reels = []
  try { reels = await rastreaCuentas(cuentas, { dias: 7, porCuenta: 12 }) }
  catch (e) { await ctx.log(`Apify falló: ${String(e.message).slice(0, 200)}`); return `Apify falló: ${String(e.message).slice(0, 160)}` }
  if (!reels.length) { await ctx.log('Apify no devolvió reels recientes de esas cuentas.'); return 'Sin reels recientes.' }

  // Fuera los que ya están en el corpus (cualquier estado) y los marcados como IA.
  const sinCola = (u) => String(u || '').split('?')[0].replace(/\/$/, '')
  const { data: yaFilas } = await supabase.from('agent_reels')
    .select('url').in('identity_id', creadores.map(c => c.id)).limit(5000)
  const enCorpus = new Set((yaFilas || []).map(r => sinCola(r.url)))
  const cand = reels.filter(r => !r.es_ia && !enCorpus.has(sinCola(r.url)))
  await ctx.log(`${reels.length} reels recientes; ${cand.length} candidatos tras quitar los de IA y los que ya están en el corpus.`)
  if (!cand.length) return 'No hay reels nuevos esta semana que no estén ya en el corpus.'

  const notas = await memoriaDe(clientId)
  const { data: biblia } = await supabase.from('helm_biblia').select('kind, content').eq('client_id', clientId)
  const topa = cand.slice(0, 40)
  const lista = topa.map((r, i) =>
    `${i + 1}. ${r.url} · @${r.cuenta} · ${r.vistas.toLocaleString('es-ES')} visualizaciones · viralidad ×${r.viralidad ?? '?'}`
    + ` · ${r.likes.toLocaleString('es-ES')} likes · ${r.duracion ? r.duracion + 's' : '?'} · «${r.texto.slice(0, 140)}»`).join('\n')

  const out = await ctx.pide({
    system: `Eres el agente de virales semanales de HELM. De una lista de reels recientes de los creadores de referencia del perfil, eliges los 8 que mejor le sirven para inspirar sus guiones de esta semana.
Criterios, por orden: 1) ENCAJE con el cliente — ¿puede grabar algo así con su voz, su cara y sus medios? ¿conecta con lo que vende o con su nicho? ¿aporta un ángulo que aún no ha tocado? Este es el criterio que manda. 2) Viralidad relativa (ya calculada: visualizaciones ÷ mediana de su cuenta; ×2 o más es que despegó de verdad). 3) Variedad de formato y de tema; como mucho 2 del mismo creador. Prioriza los de encaje alto aunque otro sin encaje tenga más viralidad.
Para cada elegido di su número en la lista, por qué encaja (1 frase con el dato) y cómo lo adaptaría ESTE cliente (1 frase). Añade hasta 3 conclusiones sobre qué está funcionando en el nicho esta semana.
${REGLAS_COMUNES}`,
    user: [
      `Perfil: ${ctx.perfil.name} (${ctx.perfil.slug}).`,
      (biblia || []).length ? `\n# Quién es este perfil\n${(biblia || []).map(b => `## ${b.kind}\n${String(b.content).slice(0, 2500)}`).join('\n\n')}` : '',
      `\n# Memoria del perfil\n${memoriaTexto(notas, 'guionista')}`,
      `\n# Reels candidatos (recientes, del nicho)\n${lista}`,
    ].filter(Boolean).join('\n'),
    herramienta: {
      name: 'elige_virales',
      description: 'Los reels elegidos (máximo 8, los de mejor encaje primero) y las conclusiones del nicho.',
      input_schema: {
        type: 'object',
        properties: {
          elegidos: {
            type: 'array',
            description: 'Máximo 8.',
            items: {
              type: 'object',
              properties: {
                n: { type: 'integer', description: 'El número del reel en la lista.' },
                porque: { type: 'string', description: 'Por qué encaja, con el dato.' },
                adaptacion: { type: 'string', description: 'Cómo lo grabaría este cliente.' },
              },
              required: ['n', 'porque'],
            },
          },
          conclusiones: { type: 'array', items: { type: 'string' }, description: 'Máximo 3.' },
          ...ESQUEMA_MEMORIA,
        },
        required: ['elegidos', 'hecho'],
      },
    },
    maxTokens: 3500, esfuerzo: 'medium',
  })

  const elegidos = (Array.isArray(out.elegidos) ? out.elegidos : [])
    .map(e => ({ ...topa[Number(e.n) - 1], porque: e.porque, adaptacion: e.adaptacion }))
    .filter(e => e && e.url).slice(0, 8)
  if (!elegidos.length) { await ctx.log('El modelo no eligió ningún reel.'); return 'No se eligieron virales.' }

  // Al corpus: cada uno bajo la identidad de su creador, para que se descargue,
  // transcriba y etiquete solo y entre en el material del guionista.
  const { anadeReels } = await import('../agents.js')
  let anadidos = 0
  for (const e of elegidos) {
    const ident = porHandle.get(String(e.cuenta).toLowerCase())
    try {
      const { nuevos } = await anadeReels([e.url], ident?.id || null, e.cuenta || '')
      anadidos += nuevos.length
    } catch (err) { await ctx.log(`No pude añadir ${e.url} al corpus: ${String(err.message).slice(0, 120)}`) }
  }
  await ctx.log(`${elegidos.length} virales elegidos; ${anadidos} enviados al corpus (se transcriben y etiquetan por detrás).`)

  // El informe de la semana queda en la memoria del perfil: lo lee el guionista.
  const informe = `Virales de la semana (${diaMadrid()}):\n`
    + elegidos.map((e, i) =>
      `${i + 1}. ${e.url} — @${e.cuenta} · ${e.vistas.toLocaleString('es-ES')} vis · ×${e.viralidad ?? '?'}\n   ${e.porque || ''}${e.adaptacion ? `\n   Adaptación: ${e.adaptacion}` : ''}`).join('\n')
    + (Array.isArray(out.conclusiones) && out.conclusiones.length ? `\n\nQué funciona en el nicho:\n- ${out.conclusiones.slice(0, 3).join('\n- ')}` : '')
  await guardaNota(clientId, { clave: `virales-${diaMadrid()}`, agente: 'virales', tipo: 'aprendido', contenido: informe.slice(0, 1500) })

  await notificar(supabase, clientId, {
    tipo: 'agentes',
    titulo: `${elegidos.length} virales nuevos de referencia`,
    cuerpo: elegidos.map(e => `${e.url} (@${e.cuenta}, ×${e.viralidad ?? '?'})`).join('\n'),
  })
  await escribeMemoria(ctx, out)
  return `${elegidos.length} virales al corpus de ${ctx.perfil.name}: ${[...new Set(elegidos.map(e => '@' + e.cuenta))].join(', ')}.`
}

const CORRE = { director, investigador, analista, productor, comercial, informe, guionista, editor, programador, virales }

// ── Una ejecución ───────────────────────────────────────────────────────────

/** Lo que llama el worker para un trabajo de tipo 'equipo'. */
export async function ejecutaAgente(job) {
  const { clientId, agente, origen = 'manual', encargo = '', params = null } = job.payload || {}
  if (!CORRE[agente]) throw new Error(`Agente desconocido: ${agente}`)
  const [{ data: perfil }, { data: cfg }] = await Promise.all([
    supabase.from('clients').select('id, slug, name').eq('id', clientId).maybeSingle(),
    supabase.from('agent_perfiles').select('*').eq('client_id', clientId).maybeSingle(),
  ])
  if (!perfil) throw new Error('Ese perfil ya no existe')
  const modelo = MODELOS[agente]

  const { data: run, error } = await supabase.from('agent_ejecuciones')
    .insert({ client_id: clientId, agente, origen, encargo, modelo }).select('id').single()
  if (error) throw error

  const pasos = []
  const tokens = { in: 0, out: 0 }
  const guarda = (extra = {}) => supabase.from('agent_ejecuciones')
    .update({ pasos, tokens_in: tokens.in, tokens_out: tokens.out, ...extra }).eq('id', run.id)
  const acaba = (estado, extra) => guarda({ estado, acabado_en: new Date().toISOString(), ...extra })

  const ctx = {
    clientId, agente, origen, encargo, params, perfil, modelo,
    cfg: cfg || { activo: false, guiones_dia: 2, tope_tokens_dia: 400000 },
    // Cada paso se guarda al momento: la pantalla lo va enseñando en vivo.
    async log(texto) { pasos.push({ t: new Date().toISOString(), texto: String(texto).slice(0, 600) }); await guarda() },
    async pide({ system, user, herramienta, maxTokens, esfuerzo }) {
      await ctx.log(`Pregunto a ${modelo}…`)
      const r = await claudeTurno({
        apiKey: CLAVE(), model: modelo, system, messages: [{ role: 'user', content: user }],
        maxTokens, tools: [herramienta], esfuerzo,
      })
      tokens.in += r.usage?.in || 0
      tokens.out += r.usage?.out || 0
      await ctx.log(`Respuesta recibida: ${r.usage?.in || 0} tokens de entrada, ${r.usage?.out || 0} de salida.`)
      const llamada = r.toolCalls.find(c => c.name === herramienta.name)
      if (!llamada) {
        // Qué hizo en vez de entregar: así el registro dice algo más que "falló".
        const otras = r.toolCalls.map(c => c.name).join(', ')
        throw new Error(`El modelo contestó sin llamar a "${herramienta.name}", que es como entrega el resultado.${
          otras ? ` Llamó a: ${otras}.` : ''}${r.content ? ` Escribió: «${String(r.content).slice(0, 200)}${r.content.length > 200 ? '…' : ''}»` : ' No escribió nada (¿se quedó sin tokens?).'}`)
      }
      // Lo entregado, contra su esquema. No se para por esto (cada agente ya
      // sabe arreglarse con lo que falte): queda en los pasos qué campo vino
      // mal, que es lo que hace falta para entender un resultado raro.
      const { errores } = validaArgs(herramienta.input_schema, llamada.args || {})
      if (errores.length) await ctx.log(`Lo entregado no cuadra del todo con "${herramienta.name}": ${errores.slice(0, 5).join(' ')}`)
      return llamada.args || {}
    },
  }

  try {
    // Lo que pone el horario o el director no corre con el perfil en pausa.
    // Lo que lanza una persona a mano, sí: para eso ha pulsado el botón.
    if (origen !== 'manual' && !ctx.cfg.activo) {
      await ctx.log('Los agentes de este perfil están en pausa.')
      await acaba('saltado', { resumen: 'En pausa: no corrió.' })
      return
    }
    if (!CLAVE()) throw new Error('Falta la clave de Claude (AGENTS_ANTHROPIC_KEY)')
    const gastado = await tokensDeHoy(clientId)
    if (gastado >= ctx.cfg.tope_tokens_dia) {
      await ctx.log(`Tope diario alcanzado: ${gastado} de ${ctx.cfg.tope_tokens_dia} tokens.`)
      await acaba('saltado', { resumen: 'Tope de tokens del día alcanzado: no corrió.' })
      return
    }
    if (encargo) await ctx.log(`Encargo: ${encargo}`)
    const resumen = await CORRE[agente](ctx)
    await acaba('hecho', { resumen: String(resumen || '').slice(0, 1000) })
  } catch (err) {
    await acaba('error', { error: String(err?.message || err).slice(0, 600) })
    throw err
  }
}

/** Tokens gastados hoy (día de Madrid) por los agentes de un perfil. */
export async function tokensDeHoy(clientId) {
  const { data, error } = await supabase.from('agent_ejecuciones').select('tokens_in, tokens_out, empezado_en')
    .eq('client_id', clientId).gte('empezado_en', new Date(Date.now() - 26 * 3600e3).toISOString())
  if (error) throw error
  const hoy = diaMadrid()
  return (data || []).filter(e => diaMadrid(new Date(e.empezado_en)) === hoy)
    .reduce((s, e) => s + e.tokens_in + e.tokens_out, 0)
}
