// HELM — cobros y renovaciones de un producto de PAGO ÚNICO.
//
// La diferencia con una suscripción es todo el problema: aquí no hay pasarela
// que cobre sola. Alguien tiene que acordarse de pasar el cargo, y si no se
// acuerda el dinero simplemente no entra. De ahí que esto exista.
//
// Dos formas de pagar el mismo producto, y cada una avisa distinto:
//
//   · FRACCIONADO ("fraccionado", "pago inteligente") — el precio se parte en
//     cuotas mensuales. Hay que cobrar CADA MES, a mano, el día que le toca a
//     ese cliente. Un semestral de 500 son 6 cuotas de 83,33 €.
//   · ENTERO (todo lo demás) — se pagó de una vez y solo se vuelve a tocar al
//     acabar el término, para renovar o dejarlo ir.
//
// Este fichero es solo cálculo: ni red, ni Google, ni base de datos. Así se
// puede probar el día 31, en febrero y en año bisiesto sin llamar a nadie.
// Quien habla con Google es scripts/renovaciones-sync.mjs.

/** Meses que dura el término según cómo esté escrito el producto. */
export function mesesDeTermino(producto) {
  const p = String(producto || '').toLowerCase()
  // "9 meses pro" y cualquier otro "<n> meses" que aparezca mañana en la hoja.
  const sueltos = p.match(/(\d+)\s*meses/)
  if (sueltos) return Number(sueltos[1])
  if (p.includes('anual')) return 12
  if (p.includes('semestral')) return 6
  if (p.includes('trimestral')) return 3
  if (p.includes('mensual')) return 1
  return null
}

/**
 * ¿Se cobra a plazos?
 *
 * "inteligente" a secas NO cuenta: en la lista aparece tanto en "Anual
 * inteligente" (Salvador, 900 € de una vez) como en "Anual pago inteligente"
 * (Noemí, 1100 € en cuotas de 90). Lo que fracciona es "fraccionado" o "pago
 * inteligente", no el adjetivo suelto.
 */
export const esFraccionado = (producto) =>
  /fraccionad|pago\s+inteligente/i.test(String(producto || ''))

/**
 * Importes de una celda de PVP.
 *
 * En la hoja conviven "500", "250€", "1100(90€)" y "75€ (800€)" — o sea que
 * cuando hay dos números el orden no es fiable. La regla que sí lo es: de dos
 * importes, el grande es el total del producto y el pequeño la cuota mensual.
 *
 * @returns {{ total: number|null, cuota: number|null }}
 */
export function parseImportes(celda) {
  const numeros = String(celda || '')
    .replace(/\./g, '')            // 1.100 → 1100
    .replace(/,/g, '.')            // 83,33 → 83.33
    .match(/\d+(?:\.\d+)?/g)
  if (!numeros?.length) return { total: null, cuota: null }
  const vals = numeros.map(Number).sort((a, b) => b - a)
  if (vals.length === 1) return { total: vals[0], cuota: null }
  return { total: vals[0], cuota: vals[vals.length - 1] }
}

/**
 * Fecha de alta desde lo que haya en la celda.
 *
 * Si trae año, se respeta. Si es un "DD/MM" pelado —como toda la lista de
 * Hugo— se asume la última vez que pasó esa fecha, porque un alta siempre es
 * pasado: en agosto de 2026, "19/11" es noviembre de 2025 y "02/07" es julio
 * de 2026.
 */
export function parseFechaInicio(celda, hoy = new Date()) {
  const txt = String(celda || '').trim().replace(/[()]/g, '')
  const m = txt.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (!m) {
    const suelta = new Date(txt)
    return Number.isNaN(+suelta) ? null : suelta
  }
  const [, d, mes, anyo] = m
  if (anyo) {
    const y = Number(anyo.length === 2 ? `20${anyo}` : anyo)
    return new Date(Date.UTC(y, Number(mes) - 1, Number(d)))
  }
  let f = new Date(Date.UTC(hoy.getUTCFullYear(), Number(mes) - 1, Number(d)))
  if (f > hoy) f = new Date(Date.UTC(hoy.getUTCFullYear() - 1, Number(mes) - 1, Number(d)))
  return f
}

/**
 * Suma meses conservando el día del mes.
 *
 * Con tope al último día si el mes destino no llega: al que se dio de alta un
 * 31 se le cobra el 28 en febrero, que es lo que pasa de verdad. Sin esto,
 * JavaScript desborda al 3 de marzo y el aviso sale tres días tarde.
 */
export function masMeses(fecha, n) {
  const dia = fecha.getUTCDate()
  const f = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + n, 1))
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate()
  f.setUTCDate(Math.min(dia, ultimo))
  return f
}

export const aISO = (f) => f.toISOString().slice(0, 10)

const SIN_ACENTOS = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Una fila se da por dada de baja si alguna celda lo dice. La hoja la lleva una
// persona, así que se acepta cualquiera de las formas en que se escribe.
const RE_BAJA = /^(baja|cancelad[oa]|anulad[oa]|inactiv[oa]|no|fin|termina[dr]?o?)$/

/**
 * Convierte las filas de la hoja en clientes normalizados.
 *
 * Las columnas se buscan por nombre de cabecera (sin acentos ni mayúsculas)
 * porque la hoja la ordena una persona y las columnas se mueven. Si no hay
 * cabecera reconocible se cae al orden de la lista original:
 * día · cliente · producto · PVP · fecha inicio.
 *
 * @param {string[][]} filas  la hoja ya partida en celdas, cabecera incluida
 * @returns {{ clientes: Array, bajas: Array, ignoradas: Array }}
 */
export function normalizarFilas(filas, hoy = new Date()) {
  if (!filas?.length) return { clientes: [], bajas: [], ignoradas: [] }

  const cabecera = filas[0].map(SIN_ACENTOS)
  const buscar = (...nombres) => {
    for (const n of nombres) {
      const i = cabecera.findIndex(c => c.includes(n))
      if (i >= 0) return i
    }
    return -1
  }
  const col = {
    cliente: buscar('cliente', 'nombre'),
    producto: buscar('producto', 'contratado'),
    pvp: buscar('pvp', 'precio', 'importe'),
    inicio: buscar('inicio', 'alta', 'fecha'),
    estado: buscar('estado', 'baja', 'activo'),
  }
  // Sin cabecera reconocible: posiciones de la lista original.
  const conCabecera = col.cliente >= 0 && col.producto >= 0
  const idx = conCabecera ? col : { cliente: 1, producto: 2, pvp: 3, inicio: 4, estado: -1 }

  const clientes = []; const bajas = []; const ignoradas = []
  for (const fila of filas.slice(conCabecera ? 1 : 0)) {
    const nombre = String(fila[idx.cliente] || '').trim()
    const producto = String(fila[idx.producto] || '').trim()
    if (!nombre) continue

    const estado = SIN_ACENTOS(idx.estado >= 0 ? fila[idx.estado] : '')
    if (estado && RE_BAJA.test(estado)) { bajas.push({ nombre, motivo: estado }); continue }

    const meses = mesesDeTermino(producto)
    const inicio = parseFechaInicio(fila[idx.inicio], hoy)
    if (!meses || !inicio) {
      ignoradas.push({ nombre, producto, motivo: !meses ? 'producto sin término reconocible' : 'fecha de inicio ilegible' })
      continue
    }

    const { total, cuota } = parseImportes(fila[idx.pvp])
    const frac = esFraccionado(producto)
    clientes.push({
      nombre,
      producto,
      meses,
      inicio,
      fraccionado: frac,
      total,
      // Si la hoja no dice la cuota, se reparte el total entre los meses.
      cuota: frac ? (cuota ?? (total != null ? Math.round((total / meses) * 100) / 100 : null)) : total,
    })
  }
  return { clientes, bajas, ignoradas }
}

/**
 * Todos los cobros de un cliente que caen dentro del horizonte.
 *
 * Fraccionado: `meses` cuotas, la primera el día del alta y la última
 * meses-1 después. Entero: un solo aviso al acabar el término.
 */
export function cobrosDe(cliente, { hoy, hasta }) {
  const out = []
  const añadir = (fecha, etiqueta, importe) => {
    if (fecha < hoy || fecha > hasta) return
    out.push({
      clave: `${SIN_ACENTOS(cliente.nombre).replace(/\s+/g, '-')}|${aISO(fecha)}`,
      cliente: cliente.nombre,
      producto: cliente.producto,
      fecha,
      etiqueta,
      importe,
      tipo: cliente.fraccionado ? 'cuota' : 'renovación',
    })
  }

  if (cliente.fraccionado) {
    for (let k = 1; k <= cliente.meses - 1; k++) {
      añadir(masMeses(cliente.inicio, k), `cuota ${k + 1}/${cliente.meses}`, cliente.cuota)
    }
    // La última cuota cierra el producto: a partir de ahí o renueva o se va.
    añadir(masMeses(cliente.inicio, cliente.meses), 'fin del fraccionado — renovar o dar de baja', cliente.total)
    return out
  }

  añadir(masMeses(cliente.inicio, cliente.meses), `fin de término (${cliente.meses} meses)`, cliente.total)
  return out
}

/** El calendario entero, ordenado por fecha. */
export function calcularCobros(clientes, { hoy = new Date(), horizonteDias = 120 } = {}) {
  const hasta = new Date(+hoy + horizonteDias * 86400000)
  return clientes
    .flatMap(c => cobrosDe(c, { hoy, hasta }))
    .sort((a, b) => a.fecha - b.fecha)
}

/**
 * Lo que ya se debería haber cobrado y nadie ha tocado.
 *
 * No genera evento de calendario —no se avisa del pasado— pero sí sale en el
 * resumen: es donde está el dinero que se ha escapado.
 */
export function atrasados(clientes, { hoy = new Date() } = {}) {
  const out = []
  for (const c of clientes) {
    const fin = masMeses(c.inicio, c.fraccionado ? c.meses : c.meses)
    if (fin < hoy) {
      out.push({
        cliente: c.nombre,
        producto: c.producto,
        fecha: fin,
        dias: Math.round((hoy - fin) / 86400000),
        tipo: c.fraccionado ? 'fraccionado terminado' : 'término vencido',
        importe: c.total,
      })
    }
  }
  return out.sort((a, b) => b.dias - a.dias)
}

/** Parte un CSV respetando comillas y saltos de línea dentro de las celdas. */
export function parseCSV(texto) {
  const filas = []; let fila = []; let celda = ''; let enComillas = false
  const s = String(texto || '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (enComillas) {
      if (c === '"') { if (s[i + 1] === '"') { celda += '"'; i++ } else enComillas = false }
      else celda += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(celda); celda = '' }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = '' }
    else celda += c
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila) }
  return filas.filter(f => f.some(c => String(c).trim()))
}
