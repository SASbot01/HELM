// Una base en memoria con lo justo de PostgREST para las pruebas de la bandeja
// (tests/propuestas*.test.js, tests/departamentos-index.test.js): filtros,
// orden, límite, embebidos (`superadmins(...)` por superadmin_id), índices
// únicos con onConflict/ignoreDuplicates, valores por defecto y fallos a
// propósito. Como PostgREST, una escritura solo devuelve filas si lleva
// `.select()` detrás, y un upsert con ignoreDuplicates solo las que inserta.
// Cada operación se resuelve entera de una vez: dos a la vez no se pisan, como
// un UPDATE … WHERE estado = 'pendiente' en Postgres.
import { randomUUID } from 'node:crypto'

export function crearBase({ unicos = {}, defectos = {} } = {}) {
  const tablas = {}
  const ops = []
  // fallos[tabla] = 'mensaje' (todas las operaciones) o fallos[`${tabla}:${op}`].
  const fallos = {}
  const filas = (t) => (tablas[t] ||= [])
  const copia = (x) => (x == null ? x : structuredClone(x))
  const igual = (a, b) => (a == null || b == null ? a == b : String(a) === String(b))
  const compara = (a, b) => {
    const na = Number(a), nb = Number(b)
    if (typeof a === 'number' && typeof b === 'number') return na - nb
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
  }
  const filtro = (col, op, v) => {
    switch (op) {
      case 'eq': return (f) => igual(f[col], v)
      case 'neq': return (f) => !igual(f[col], v)
      case 'gt': return (f) => f[col] != null && compara(f[col], v) > 0
      case 'gte': return (f) => f[col] != null && compara(f[col], v) >= 0
      case 'lt': return (f) => f[col] != null && compara(f[col], v) < 0
      case 'lte': return (f) => f[col] != null && compara(f[col], v) <= 0
      case 'in': return (f) => v.some(x => igual(f[col], x))
      case 'is': return (f) => (v === null || v === 'null' ? f[col] == null : f[col] === v)
      default: throw new Error(`operador ${op} sin simular`)
    }
  }
  const choca = (t, fila, cols) => filas(t).find(x => cols.every(c => igual(x[c], fila[c])))

  function from(t) {
    const filtros = []
    let op = 'select', datos = null, opciones = {}, columnas = '*', devolver = false, orden = null, tope = null
    // Las columnas pedidas (las de arriba del todo; un embebido «tabla(...)»
    // trae la fila de esa tabla por <tabla sin la s>_id).
    const pedidas = () => {
      const partes = []
      let hondo = 0, actual = ''
      for (const ch of columnas) {
        if (ch === '(') hondo++
        if (ch === ')') hondo--
        if (ch === ',' && hondo === 0) { partes.push(actual.trim()); actual = '' } else actual += ch
      }
      if (actual.trim()) partes.push(actual.trim())
      return partes
    }
    const embebe = (f) => {
      if (columnas.trim() === '*') return f
      const out = {}
      for (const c of pedidas()) {
        const m = /^(\w+)\((.*)\)$/s.exec(c)
        if (m) {
          const otra = filas(m[1]).find(s => s.id === f[`${m[1].replace(/s$/, '')}_id`]) || null
          out[m[1]] = otra
        } else if (c === '*') Object.assign(out, f)
        else out[c] = f[c]
      }
      return out
    }
    const conDefectos = (d) => ({ id: randomUUID(), ...(typeof defectos[t] === 'function' ? defectos[t]() : copia(defectos[t] || {})), ...copia(d) })
    async function ejecuta(uno) {
      const fallo = fallos[`${t}:${op}`] || fallos[t]
      if (fallo) return { data: null, error: { message: fallo } }
      const pasa = (f) => filtros.every(fn => fn(f))
      let data = null
      if (op === 'select') {
        data = filas(t).filter(pasa)
        if (orden) data = [...data].sort((a, b) => compara(a[orden.c] ?? '', b[orden.c] ?? '') * (orden.asc ? 1 : -1))
        if (tope != null) data = data.slice(0, tope)
        data = data.map(f => copia(embebe(f)))
      } else if (op === 'insert') {
        const nuevas = (Array.isArray(datos) ? datos : [datos]).map(conDefectos)
        for (const n of nuevas) {
          for (const cols of unicos[t] || []) {
            if (choca(t, n, cols)) return { data: null, error: { code: '23505', message: `duplicate key (${cols.join(',')})` } }
          }
        }
        filas(t).push(...nuevas)
        data = devolver ? copia(nuevas) : null
      } else if (op === 'update') {
        const tocadas = filas(t).filter(pasa)
        for (const f of tocadas) Object.assign(f, copia(datos))
        data = devolver ? copia(tocadas) : null
      } else if (op === 'upsert') {
        const cols = String(opciones.onConflict || 'id').split(',').map(s => s.trim())
        const hechas = []
        for (const d of Array.isArray(datos) ? datos : [datos]) {
          const ya = choca(t, d, cols)
          if (ya) {
            if (opciones.ignoreDuplicates) continue
            Object.assign(ya, copia(d))
            hechas.push(ya)
          } else {
            const n = conDefectos(d)
            filas(t).push(n)
            hechas.push(n)
          }
        }
        data = devolver ? copia(hechas) : null
      } else if (op === 'delete') {
        const quitadas = filas(t).filter(pasa)
        tablas[t] = filas(t).filter(f => !pasa(f))
        data = devolver ? copia(quitadas) : null
      }
      ops.push({ tabla: t, op, datos: copia(datos), opciones, n: Array.isArray(data) ? data.length : null })
      if (uno) data = Array.isArray(data) ? (data[0] ?? null) : data
      return { data, error: null }
    }
    const q = {
      select(c = '*') { if (op === 'select') columnas = c; else devolver = true; return q },
      eq(c, v) { filtros.push(filtro(c, 'eq', v)); return q },
      neq(c, v) { filtros.push(filtro(c, 'neq', v)); return q },
      gt(c, v) { filtros.push(filtro(c, 'gt', v)); return q },
      gte(c, v) { filtros.push(filtro(c, 'gte', v)); return q },
      lt(c, v) { filtros.push(filtro(c, 'lt', v)); return q },
      lte(c, v) { filtros.push(filtro(c, 'lte', v)); return q },
      in(c, v) { filtros.push(filtro(c, 'in', v)); return q },
      is(c, v) { filtros.push(filtro(c, 'is', v)); return q },
      not(c, o, v) { const f = filtro(c, o, v); filtros.push(x => !f(x)); return q },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q },
      limit(n) { tope = n; return q },
      insert(d) { op = 'insert'; datos = d; return q },
      update(d) { op = 'update'; datos = d; return q },
      upsert(d, o = {}) { op = 'upsert'; datos = d; opciones = o; return q },
      delete() { op = 'delete'; return q },
      maybeSingle: () => ejecuta(true),
      single: () => ejecuta(true),
      then: (ok, ko) => ejecuta(false).then(ok, ko),
    }
    return q
  }

  const vaciar = () => {
    for (const k of Object.keys(tablas)) delete tablas[k]
    for (const k of Object.keys(fallos)) delete fallos[k]
    ops.length = 0
  }
  return { supabase: { from, rpc: async () => ({ data: null, error: null }) }, tablas, filas, ops, fallos, vaciar }
}
