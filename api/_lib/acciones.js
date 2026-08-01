// HELM — lo que el chat puede HACER, no solo escribir.
//
// Cuatro acciones: agendar contenido, apuntar el reporte diario de alguien, dar
// de alta a un miembro del equipo y guardar un texto en Archivos. El modelo
// local decide cuál toca y con qué argumentos; este fichero es el que valida y
// escribe en la base de datos.
//
// Principio de la casa: el modelo NO es de fiar para los datos. Un 14B se
// inventa fechas (le dices "mañana" y contesta 2023-10-26), se saca roles de la
// manga y a veces manda un número donde iba un texto. Así que aquí:
//   · las fechas las resuelve fechas.js a partir de la PALABRA del usuario,
//   · los roles y las métricas van contra una lista blanca,
//   · lo que no cuadra se devuelve como error para que el chat lo pregunte,
//     nunca se guarda "lo más parecido".
//
// Cada acción devuelve { ok, resumen, detalle? } o { ok:false, error }. Ese
// texto vuelve al modelo como resultado de la herramienta y también es lo que
// se le enseña a la persona, así que se escribe para leerlo.

import { fechaValida, isoLocal } from './fechas.js'

// ── Listas blancas ─────────────────────────────────────────────────────────
// Copia de src/helm/equipo/roles.js, que es la fuente de verdad. Se duplica a
// propósito: `api/` se despliega como funciones sueltas y no debe importar del
// bundle del frontend. Si allí se añade un rol, hay que añadirlo aquí.
const ROLES = {
  dueno:  { label: 'Dueño',  metricas: ['calls_made', 'closes'] },
  closer: { label: 'Closer', metricas: ['appointments_booked', 'calls_made', 'qualified', 'closes', 'follow_ups', 'lost'] },
  setter: { label: 'Setter', metricas: ['conversations_opened', 'effective_conversations', 'appointments_booked'] },
  csm:    { label: 'CSM',    metricas: ['calls_made', 'doubts_solved'] },
  editor: { label: 'Editor', metricas: [] },
  otro:   { label: 'Otro',   metricas: [] },
}

// Cómo llama la gente a cada métrica cuando la dicta por voz o por chat. El
// modelo suele mandar la etiqueta en castellano en vez del nombre de columna.
const ALIAS_METRICAS = {
  agendadas: 'appointments_booked', agendamientos: 'appointments_booked',
  llamadas_agendadas: 'appointments_booked', citas: 'appointments_booked',
  asistieron: 'calls_made', llamadas: 'calls_made', llamadas_hechas: 'calls_made',
  cualificaron: 'qualified', cualificados: 'qualified',
  cierres: 'closes', convirtieron: 'closes', ventas: 'closes',
  seguimiento: 'follow_ups', en_seguimiento: 'follow_ups',
  perdidos: 'lost', perdidas: 'lost',
  conversaciones: 'conversations_opened', conversaciones_abiertas: 'conversations_opened',
  conversaciones_efectivas: 'effective_conversations', efectivas: 'effective_conversations',
  dudas: 'doubts_solved', dudas_resueltas: 'doubts_solved',
}

const FORMATOS = ['reel', 'carousel', 'email', 'yt', 'nota']
const ALIAS_FORMATO = {
  carrusel: 'carousel', youtube: 'yt', video: 'yt', 'vídeo': 'yt',
  correo: 'email', post: 'nota', tiktok: 'reel', short: 'reel',
}

const sinTildes = (s) => String(s || '').toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')

const texto = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const numero = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function normalizarRol(v) {
  const t = sinTildes(v).replace(/\s+/g, '')
  if (ROLES[t]) return t
  if (t === 'dueño' || t === 'ceo' || t === 'propietario' || t === 'jefe') return 'dueno'
  if (t.includes('closer') || t.includes('cerrador')) return 'closer'
  if (t.includes('setter') || t.includes('agendador')) return 'setter'
  if (t.includes('csm') || t.includes('customer') || t.includes('exito')) return 'csm'
  if (t.includes('editor') || t.includes('video')) return 'editor'
  return null
}

// ── Definiciones que ve el modelo ──────────────────────────────────────────
// Las descripciones son instrucciones, no documentación: es lo único que lee el
// modelo para decidir. De ahí que insistan en lo de las fechas.

export const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'programar_contenido',
      description:
        'Agenda una o varias piezas de contenido en el calendario de Contenido del perfil. '
        + 'Úsala cuando pidan programar, agendar o planificar contenido, reels, posts, emails o vídeos.',
      parameters: {
        type: 'object',
        properties: {
          piezas: {
            type: 'array',
            description: 'Una entrada por pieza. Si piden varias piezas, mándalas todas de una vez.',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string', description: 'De qué va la pieza, en pocas palabras.' },
                fecha: {
                  type: 'string',
                  description:
                    'COPIA LITERALMENTE la fecha como la dijo el usuario: "mañana", "el lunes", '
                    + '"25/07", "1 de agosto". NO la conviertas a otro formato y NO calcules tú el día: '
                    + 'el servidor lo hace. Si no dijo fecha, pon "hoy".',
                },
                formato: { type: 'string', enum: FORMATOS, description: 'reel por defecto.' },
                guion: { type: 'string', description: 'El guion o las notas, si el usuario los ha dado.' },
              },
              required: ['titulo', 'fecha'],
            },
          },
        },
        required: ['piezas'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_reporte_diario',
      description:
        'Apunta el reporte diario de una persona del equipo en la sección Diario. '
        + 'Úsala cuando digan que quieren registrar/hacer el reporte o los números del día. '
        + 'Necesitas el nombre de la persona y sus números; si no los tienes, pregúntalos antes.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre de la persona que reporta.' },
          rol: { type: 'string', enum: Object.keys(ROLES), description: 'Su rol. Si no lo sabes, no lo inventes: pregúntalo.' },
          fecha: { type: 'string', description: 'Como la dijo el usuario ("hoy", "ayer", "25/07"). "hoy" si no dice nada.' },
          metricas: {
            type: 'object',
            description:
              'Números del día. Closer: appointments_booked, calls_made, qualified, closes, follow_ups, lost. '
              + 'Setter: conversations_opened, effective_conversations, appointments_booked. '
              + 'CSM: calls_made, doubts_solved.',
            additionalProperties: { type: 'number' },
          },
        },
        required: ['nombre', 'rol', 'metricas'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_miembro_equipo',
      description:
        'Da de alta a una persona en el equipo del perfil. Úsala cuando pidan crear, añadir o dar de alta '
        + 'a alguien del equipo. Hacen falta al menos el nombre y el rol; si falta uno, pregúntalo antes de llamar.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          rol: { type: 'string', enum: Object.keys(ROLES) },
          email: { type: 'string' },
          telefono: { type: 'string' },
          comision_pct: { type: 'number', description: 'Porcentaje de comisión, 0-100.' },
          fijo: { type: 'number', description: 'Fijo mensual en euros.' },
          fecha_inicio: { type: 'string', description: 'Como la dijo el usuario. Vacío si no la dice.' },
          notas: { type: 'string' },
        },
        required: ['nombre', 'rol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardar_archivo',
      description:
        'Guarda un texto como archivo en la sección Archivos del perfil. Úsala cuando pidan guardar, '
        + 'archivar o "dame en un archivo" algo que acabas de escribir (un guion, un email, una propuesta). '
        + 'El contenido lo escribes TÚ entero en el argumento: no pongas "lo de antes" ni referencias.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Cómo se llama el archivo, sin extensión. Ej: "Guion reel precios".' },
          contenido: { type: 'string', description: 'El texto completo del archivo, en markdown.' },
          carpeta: { type: 'string', description: 'Carpeta donde guardarlo. "Del chat" si no dicen otra.' },
          nota: { type: 'string', description: 'Una línea de para qué es, opcional.' },
        },
        required: ['nombre', 'contenido'],
      },
    },
  },
]

export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS.map(h => h.function.name)

// ── Ejecución ──────────────────────────────────────────────────────────────

async function programarContenido(args, { supabase, clientId, hoy }) {
  const piezas = Array.isArray(args?.piezas) ? args.piezas : [args]
  if (!piezas.length) return { ok: false, error: 'No me has dicho qué pieza programar.' }
  if (piezas.length > 20) return { ok: false, error: 'Son demasiadas piezas de una vez (máximo 20).' }

  const filas = []
  const errores = []
  for (const p of piezas) {
    const titulo = texto(p?.titulo, 200)
    if (!titulo) { errores.push('Una de las piezas viene sin título.'); continue }
    const f = fechaValida(p?.fecha || 'hoy', { hoy })
    if (f.error) { errores.push(`"${titulo}": ${f.error}`); continue }
    const fmt = sinTildes(p?.formato)
    filas.push({
      client_id: clientId,
      title: titulo,
      date: f.iso,
      format: FORMATOS.includes(fmt) ? fmt : (ALIAS_FORMATO[fmt] || 'reel'),
      body: texto(p?.guion, 20_000) || null,
      status: 'todo',
      source: 'chat',
    })
  }
  if (!filas.length) return { ok: false, error: errores.join(' ') || 'No he podido montar ninguna pieza.' }

  const { data, error } = await supabase.from('helm_content_calendar').insert(filas).select('id, title, date')
  if (error) return { ok: false, error: `No se ha podido guardar en el calendario: ${error.message}` }

  const lista = (data || []).map(d => `· ${d.date} — ${d.title}`).join('\n')
  return {
    ok: true,
    resumen: `${data.length} pieza(s) agendadas en Contenido:\n${lista}`
      + (errores.length ? `\nNo pude con: ${errores.join(' ')}` : ''),
  }
}

async function crearReporteDiario(args, { supabase, clientId, hoy }) {
  const nombre = texto(args?.nombre, 120)
  if (!nombre) return { ok: false, error: '¿De quién es el reporte? Necesito el nombre.' }

  const rol = normalizarRol(args?.rol)
  if (!rol) return { ok: false, error: `No reconozco el rol "${args?.rol}". Los válidos son: ${Object.keys(ROLES).join(', ')}.` }
  const permitidas = ROLES[rol].metricas
  if (!permitidas.length) return { ok: false, error: `Un ${ROLES[rol].label} no lleva reporte diario en HELM.` }

  const f = fechaValida(args?.fecha || 'hoy', { hoy })
  if (f.error) return { ok: false, error: f.error }

  // Solo las métricas de SU rol: si el modelo manda "closes" en un reporte de
  // setter, esa columna existe pero no significa nada ahí y ensucia el informe.
  const metricas = {}
  const ignoradas = []
  for (const [k, v] of Object.entries(args?.metricas || {})) {
    const campo = permitidas.includes(k) ? k : ALIAS_METRICAS[sinTildes(k).replace(/\s+/g, '_')]
    const n = numero(v)
    if (!campo || !permitidas.includes(campo) || n === null || n < 0) { ignoradas.push(k); continue }
    metricas[campo] = Math.round(n)
  }
  if (!Object.keys(metricas).length) {
    return {
      ok: false,
      error: `No me has dado ningún número válido para un ${ROLES[rol].label}. `
        + `Los que lleva son: ${permitidas.join(', ')}.`,
    }
  }

  // Se cuelga de la ficha de equipo si esa persona ya existe, para que el
  // reporte cuente en sus totales y no quede como un nombre suelto.
  const { data: gente } = await supabase
    .from('helm_team').select('id, name').eq('client_id', clientId).limit(200)
  const persona = (gente || []).find(p => sinTildes(p.name) === sinTildes(nombre))

  const fila = {
    client_id: clientId, date: f.iso, name: nombre, role: rol,
    person_id: persona?.id || null,
    ...Object.fromEntries(permitidas.map(m => [m, metricas[m] ?? 0])),
  }
  const { data, error } = await supabase.from('reports').insert(fila).select('id, date').single()
  if (error) return { ok: false, error: `No se ha podido guardar el reporte: ${error.message}` }

  const detalle = permitidas.map(m => `${m}: ${fila[m]}`).join(' · ')
  return {
    ok: true,
    resumen: `Reporte de ${nombre} (${ROLES[rol].label}) guardado en Diario el ${data.date}.\n${detalle}`
      + (persona ? '' : `\nOjo: "${nombre}" no está en el equipo, así que el reporte queda a su nombre pero sin ficha.`)
      + (ignoradas.length ? `\nIgnoré lo que no aplica a este rol: ${ignoradas.join(', ')}.` : ''),
  }
}

async function crearMiembroEquipo(args, { supabase, clientId, hoy }) {
  const nombre = texto(args?.nombre, 120)
  if (!nombre) return { ok: false, error: 'Necesito el nombre de la persona.' }
  const rol = normalizarRol(args?.rol)
  if (!rol) return { ok: false, error: `Necesito su rol. Los válidos: ${Object.keys(ROLES).join(', ')}.` }

  const email = texto(args?.email, 160).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: `"${email}" no parece un email válido.` }
  }

  const { data: yaEsta } = await supabase
    .from('helm_team').select('id, name').eq('client_id', clientId).limit(200)
  if ((yaEsta || []).some(p => sinTildes(p.name) === sinTildes(nombre))) {
    return { ok: false, error: `Ya hay alguien llamado "${nombre}" en el equipo. Si es otra persona, dime su nombre completo.` }
  }

  const comision = numero(args?.comision_pct)
  const fijo = numero(args?.fijo)
  let inicio = null
  if (args?.fecha_inicio) {
    const f = fechaValida(args.fecha_inicio, { hoy })
    if (f.error) return { ok: false, error: f.error }
    inicio = f.iso
  }

  const { data, error } = await supabase.from('helm_team').insert({
    client_id: clientId,
    name: nombre,
    role: rol,
    email,
    phone: texto(args?.telefono, 40),
    commission_pct: comision !== null && comision >= 0 && comision <= 100 ? comision : 0,
    fixed_fee: fijo !== null && fijo >= 0 ? fijo : 0,
    started_on: inicio,
    notes: texto(args?.notas, 2000),
    active: true,
  }).select('id, name, role').single()
  if (error) return { ok: false, error: `No se ha podido crear: ${error.message}` }

  const extras = [
    email ? `email ${email}` : null,
    comision ? `${comision}% de comisión` : null,
    fijo ? `${fijo} € fijos` : null,
    inicio ? `desde el ${inicio}` : null,
  ].filter(Boolean)

  return {
    ok: true,
    resumen: `${data.name} dado de alta en Equipo como ${ROLES[rol].label}`
      + (extras.length ? ` (${extras.join(', ')}).` : '.')
      + ' Todavía no tiene acceso al panel: eso se le da desde Equipo → Acceso.',
  }
}

// ── Guardar un archivo en la sección Archivos ──────────────────────────────
// Lo que escribe el chat se lo lleva el scroll. Con esto, cuando alguien dice
// "guárdame esto", el texto se sube al bucket como .md y queda en Archivos con
// su ficha. No se toca lo que el modelo escribe: se guarda tal cual.

// Nombre de archivo seguro. Duplicado de src/helm/lib.js a propósito: `api/`
// no importa del bundle del frontend (ver la nota de arriba sobre los roles).
function nombreSeguro(nombre) {
  const limpio = String(nombre || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  return `${Math.random().toString(36).slice(2, 8)}-${limpio || 'archivo'}`
}

async function guardarArchivo(args, { supabase, clientId }) {
  const contenido = String(args?.contenido ?? '')
  if (!contenido.trim()) return { ok: false, error: '¿Qué contenido guardo? Me has mandado el archivo vacío.' }
  if (contenido.length > 400_000) return { ok: false, error: 'Ese texto es demasiado largo para guardarlo como archivo.' }

  // La extensión la ponemos nosotros: el modelo propone nombres como
  // "guion.docx" y luego el contenido es markdown, y el archivo no abre.
  const base = texto(args?.nombre, 90).replace(/\.[a-z0-9]{1,5}$/i, '') || 'documento'
  const nombre = `${base}.md`
  const path = `${clientId}/archivos/${nombreSeguro(nombre)}`

  // Se sube el string tal cual, no un Blob: el cliente de Supabase lo acepta y
  // así no dependemos de que el runtime de turno tenga Blob global.
  const { error: errUp } = await supabase.storage.from('helm').upload(
    path, contenido,
    { cacheControl: '3600', upsert: false, contentType: 'text/markdown; charset=utf-8' },
  )
  if (errUp) {
    if (/bucket/i.test(errUp.message)) {
      return { ok: false, error: 'Falta el almacén de archivos. Hay que aplicar migrations/helm_operativa.sql en Supabase.' }
    }
    return { ok: false, error: `No se ha podido subir el archivo: ${errUp.message}` }
  }

  const { data: pub } = supabase.storage.from('helm').getPublicUrl(path)
  const { error } = await supabase.from('helm_files').insert({
    client_id: clientId,
    name: nombre,
    path,
    url: pub.publicUrl,
    type: 'text/markdown',
    size: Buffer.byteLength(contenido, 'utf8'),
    folder: texto(args?.carpeta, 60) || 'Del chat',
    source: 'chat',
    note: texto(args?.nota, 200),
  })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return { ok: false, error: 'Falta la sección Archivos. Hay que aplicar migrations/helm_archivos.sql en Supabase.' }
    }
    return { ok: false, error: `No se ha podido registrar el archivo: ${error.message}` }
  }

  return { ok: true, resumen: `Guardado en Archivos como "${nombre}".` }
}

const EJECUTORES = {
  programar_contenido: programarContenido,
  crear_reporte_diario: crearReporteDiario,
  crear_miembro_equipo: crearMiembroEquipo,
  guardar_archivo: guardarArchivo,
}

/**
 * Ejecuta una herramienta pedida por el modelo.
 * Nunca lanza: un fallo se devuelve como texto para que el chat lo cuente.
 *
 * @param {string} nombre
 * @param {object} args     argumentos tal cual los mandó el modelo
 * @param {object} ctx      { supabase, clientId, hoy }
 */
export async function ejecutarAccion(nombre, args, ctx) {
  const fn = EJECUTORES[nombre]
  if (!fn) return { ok: false, error: `No existe la acción "${nombre}".` }
  try {
    return await fn(args || {}, { ...ctx, hoy: ctx.hoy || new Date() })
  } catch (err) {
    console.warn('[acciones]', nombre, err?.message)
    return { ok: false, error: `Ha fallado la acción: ${err.message}` }
  }
}

// Lo que se le cuenta al modelo en el system prompt sobre lo que puede hacer.
export const INSTRUCCIONES_ACCIONES = (hoy) => `# ACCIONES QUE PUEDES EJECUTAR
Hoy es ${isoLocal(hoy)}.

No solo escribes: puedes hacer cuatro cosas en el panel de este perfil.
· programar_contenido — agendar piezas en el calendario de Contenido.
· crear_reporte_diario — apuntar los números del día de alguien en Diario.
· crear_miembro_equipo — dar de alta a una persona en Equipo.
· guardar_archivo — dejar un texto tuyo guardado en la sección Archivos.

Cómo se usan:
· Si te lo piden, HAZLO con la herramienta. No contestes "puedes ir a la sección
  tal": para eso estás tú.
· Si falta un dato obligatorio (el nombre, el rol, los números), pregúntalo en
  UNA línea y espera. Nunca te lo inventes ni pongas un valor de relleno.
· Las fechas se copian tal cual las diga la persona ("mañana", "el lunes",
  "25/07"). No las traduzcas ni calcules el día: de eso se encarga el servidor.
· Después de ejecutar, di en una frase qué ha quedado hecho. Sin repetir la
  lista entera si es larga.
· Si la acción devuelve un error, explícalo con esas mismas palabras y di qué
  hace falta para arreglarlo.`
