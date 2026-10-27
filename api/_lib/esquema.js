// HELM — validar los argumentos de una herramienta contra su inputSchema.
//
// Lo usan el conector de Claude (api/mcp) antes de ejecutar cada herramienta y
// el equipo de agentes (api/_lib/equipo.js) al recibir lo que entrega el
// modelo. Un validador mínimo, sin dependencias: solo lo que usan nuestros
// esquemas (type, properties, required, items, enum, format 'date', minimum,
// maximum, minItems, maxItems).
//
// Cada error dice qué campo, qué pasa y qué vale, para que quien llama (un
// modelo, casi siempre) lo corrija a la primera en vez de adivinar.

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** ¿Es una fecha AAAA-MM-DD que existe en el calendario? */
export function esFecha(s) {
  if (typeof s !== 'string' || !FECHA.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const tipoDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const corto = (v) => { const s = JSON.stringify(v); return s && s.length > 60 ? `${s.slice(0, 57)}…` : s }

// Lo que un modelo manda "casi bien" y no merece un error: un número como
// texto ("60"), un booleano como texto ("true") o un solo elemento donde va
// una lista. Se arregla y se sigue.
function arregla(v, esq) {
  if (esq.type === 'number' || esq.type === 'integer') {
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  }
  if (esq.type === 'boolean' && (v === 'true' || v === 'false')) return v === 'true'
  if (esq.type === 'array' && v !== undefined && !Array.isArray(v) && esq.items?.type === tipoDe(v)) return [v]
  return v
}

function valida(v, esq, ruta, errores) {
  v = arregla(v, esq)
  const t = tipoDe(v)
  const donde = ruta || 'argumentos'

  if (esq.type === 'integer' ? !Number.isInteger(v) : esq.type === 'number' ? (t !== 'number' || !Number.isFinite(v)) : esq.type && t !== esq.type) {
    errores.push(`${donde}: tiene que ser ${NOMBRE[esq.type] || esq.type}${esq.format === 'date' ? ' AAAA-MM-DD' : ''}; ha llegado ${t === 'undefined' ? 'nada' : `${NOMBRE[t] || t} ${corto(v)}`}.`)
    return v
  }
  if (esq.enum && !esq.enum.includes(v)) {
    errores.push(`${donde}: ${corto(v)} no vale. Valores posibles: ${esq.enum.map(x => JSON.stringify(x)).join(', ')}.`)
  }
  if (esq.format === 'date' && !esFecha(v)) {
    errores.push(`${donde}: ${corto(v)} no es una fecha válida. Formato AAAA-MM-DD, p. ej. "2026-10-14".`)
  }
  if (t === 'number') {
    if (esq.minimum != null && v < esq.minimum) errores.push(`${donde}: ${v} es menos del mínimo (${esq.minimum}).`)
    if (esq.maximum != null && v > esq.maximum) errores.push(`${donde}: ${v} pasa del máximo (${esq.maximum}).`)
  }
  if (t === 'array') {
    if (esq.minItems != null && v.length < esq.minItems) errores.push(`${donde}: hace falta al menos ${esq.minItems} ${esq.minItems === 1 ? 'elemento' : 'elementos'}.`)
    if (esq.maxItems != null && v.length > esq.maxItems) errores.push(`${donde}: como mucho ${esq.maxItems} por llamada; han llegado ${v.length}. Pártelo en varias.`)
    if (esq.items) v = v.map((x, i) => valida(x, esq.items, `${donde}[${i}]`, errores))
  }
  if (t === 'object' && esq.properties) {
    const props = esq.properties
    const pre = ruta ? `${ruta}.` : ''
    for (const k of esq.required || []) {
      if (v[k] === undefined || v[k] === null || v[k] === '') {
        const p = props[k] || {}
        errores.push(`${pre}${k}: falta, y es obligatorio${p.description ? ` (${p.description})` : ''}.`)
      }
    }
    // Solo las propiedades propias del esquema: con `k in props`, un
    // "__proto__" en los argumentos pasaba y le cambiaba el prototipo a lo
    // limpio (p. ej. heredaba prueba=true y una escritura real no se apuntaba).
    const tiene = (k) => Object.hasOwn(props, k)
    const fuera = Object.keys(v).filter(k => !tiene(k))
    // Un campo de más no para la llamada: se ignora y se avisa. Los modelos
    // añaden a veces alguno, y romper lo que antes funcionaba por eso sería
    // peor que dejarlo pasar. Un nombre mal escrito de un campo obligatorio
    // ya da su propio error ("falta").
    if (fuera.length) {
      const hay = Object.keys(props)
      errores.avisos.push(`${ruta || 'argumentos'}: ${fuera.map(k => `"${k}"`).join(', ')} no ${fuera.length === 1 ? 'es un campo' : 'son campos'} de esta herramienta y se ignora. ${hay.length ? `Los que hay: ${hay.join(', ')}.` : 'No lleva ninguno: llámala sin argumentos.'}`)
    }
    const limpio = {}
    for (const [k, x] of Object.entries(v)) {
      if (!tiene(k) || x === undefined || x === null) { if (tiene(k)) limpio[k] = x; continue }
      limpio[k] = valida(x, props[k], `${pre}${k}`, errores)
    }
    return limpio
  }
  return v
}

const NOMBRE = { string: 'texto', number: 'un número', integer: 'un número entero', boolean: 'true o false', array: 'una lista', object: 'un objeto', null: 'null' }

/** Valida `args` contra `esquema`. Devuelve los argumentos (con los arreglos
 *  menores ya hechos) y la lista de errores; vacía si todo vale. */
export function validaArgs(esquema, args) {
  const errores = []
  errores.avisos = []
  const limpio = valida(args ?? {}, esquema || { type: 'object' }, '', errores)
  return { args: limpio, errores: [...errores], avisos: errores.avisos }
}

/** El texto de error para quien llamó a la herramienta. */
export const explicaErrores = (herramienta, errores) =>
  `Argumentos no válidos para "${herramienta}":\n- ${errores.join('\n- ')}`

// ── Recortar respuestas ─────────────────────────────────────────────────────

/** Un trozo de lista: desde `cursor`, como mucho `limite`. Dice si hay más y
 *  con qué cursor se sigue. */
export function pagina(lista, { cursor = 0, limite } = {}) {
  const desde = Math.max(0, Math.floor(Number(cursor) || 0))
  const n = Math.max(1, Math.floor(Number(limite) || lista.length || 1))
  const items = lista.slice(desde, desde + n)
  const hayMas = desde + n < lista.length
  return { items, total: lista.length, hay_mas: hayMas, siguiente: hayMas ? desde + n : null }
}

/** Un texto largo, cortado por la última palabra entera antes de `n`. */
export function recorta(texto, n) {
  const s = String(texto ?? '')
  if (s.length <= n) return s
  const corte = s.slice(0, n)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > n * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`
}

/** Los argumentos en una línea, para el registro: sin textos largos (un guion,
 *  una nota) ni nada que no haga falta para saber qué se pidió. */
export function resumeArgs(args) {
  const partes = []
  for (const [k, v] of Object.entries(args || {})) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) partes.push(`${k}: ${v.length}`)
    else if (typeof v === 'object') partes.push(`${k}: {…}`)
    else partes.push(`${k}: ${recorta(String(v), 40)}`)
  }
  return partes.join(' · ')
}
