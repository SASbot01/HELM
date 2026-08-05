// HELM — los modelos tributarios y cuándo vencen.
//
// Declarativo a propósito: la vista no sabe nada de fiscalidad, solo recorre
// esto. Cambiar una fecha o añadir un modelo es tocar este fichero y nada más.
//
// AVISO para quien lo mantenga: estas son las fechas ordinarias del calendario
// de la AEAT. Cada año hay festivos, prórrogas y campañas que las mueven, y una
// domiciliación bancaria adelanta el plazo unos días. El panel las usa como
// punto de partida — la fecha de cada obligación se puede editar a mano una vez
// generada, precisamente porque esto no puede tener razón siempre.

export const FORMAS = [
  { key: 'autonomo', label: 'Autónomo' },
  { key: 'sl', label: 'Sociedad Limitada' },
  { key: 'sa', label: 'Sociedad Anónima' },
  { key: 'cb', label: 'Comunidad de bienes' },
  { key: 'otra', label: 'Otra' },
]

export const IVA_OPCIONES = [
  { key: 'trimestral', label: 'IVA trimestral', desc: 'Lo normal en pymes y autónomos' },
  { key: 'mensual', label: 'IVA mensual', desc: 'REDEME o gran empresa' },
  { key: 'exento', label: 'Exento de IVA', desc: 'Actividad no sujeta' },
]

export const IRPF_OPCIONES = [
  { key: 'no', label: 'No presenta', desc: 'Sociedades, o sin actividad económica' },
  { key: 'directa', label: 'Estimación directa', desc: 'Modelo 130' },
  { key: 'modulos', label: 'Módulos', desc: 'Estimación objetiva, modelo 131' },
]

// Cada modelo dice qué es, cada cuánto se presenta y de qué dato de la ficha
// depende. `dia`/`mes` son el vencimiento ordinario del periodo.
export const MODELOS = {
  303: { nombre: 'IVA', desc: 'Autoliquidación trimestral o mensual' },
  130: { nombre: 'IRPF pago fraccionado', desc: 'Estimación directa' },
  131: { nombre: 'IRPF módulos', desc: 'Estimación objetiva' },
  111: { nombre: 'Retenciones del trabajo', desc: 'Nóminas y profesionales' },
  115: { nombre: 'Retenciones de alquileres', desc: 'Arrendamientos urbanos' },
  349: { nombre: 'Operaciones intracomunitarias', desc: 'Recapitulativa' },
  390: { nombre: 'Resumen anual de IVA', desc: 'Del ejercicio anterior' },
  190: { nombre: 'Resumen anual de retenciones', desc: 'Del ejercicio anterior' },
  347: { nombre: 'Operaciones con terceros', desc: 'Más de 3.005,06 € al año' },
  200: { nombre: 'Impuesto de Sociedades', desc: 'Declaración anual' },
  202: { nombre: 'Pago fraccionado de Sociedades', desc: 'Abril, octubre y diciembre' },
}

// Los cuatro trimestres, con el día y mes en que vence cada uno. El T4 vence en
// enero del año siguiente: por eso lleva `añoSiguiente`.
const TRIMESTRES = [
  { periodo: 'T1', dia: 20, mes: 4 },
  { periodo: 'T2', dia: 20, mes: 7 },
  { periodo: 'T3', dia: 20, mes: 10 },
  { periodo: 'T4', dia: 30, mes: 1, añoSiguiente: true },
]
// Las retenciones (111 y 115) cierran el T4 el día 20, no el 30 como el IVA.
const TRIMESTRES_RETENCIONES = TRIMESTRES.map(t =>
  (t.periodo === 'T4' ? { ...t, dia: 20 } : t))

const iso = (año, mes, dia) =>
  `${año}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

const deTrimestres = (modelo, año, lista = TRIMESTRES) => lista.map(t => ({
  modelo,
  periodo: `${año}${t.periodo}`,
  fecha_limite: iso(t.añoSiguiente ? año + 1 : año, t.mes, t.dia),
}))

// Los modelos mensuales vencen el día 30 del mes siguiente (el de diciembre, el
// 30 de enero). Febrero no da problema porque el vencimiento cae en marzo.
const deMeses = (modelo, año) => Array.from({ length: 12 }, (_, i) => {
  const mesSiguiente = i + 2
  const desborda = mesSiguiente > 12
  return {
    modelo,
    periodo: `${año}-${String(i + 1).padStart(2, '0')}`,
    fecha_limite: iso(desborda ? año + 1 : año, desborda ? 1 : mesSiguiente, 30),
  }
})

/**
 * El calendario de UN cliente para un ejercicio, a partir de su ficha fiscal.
 *
 * Devuelve `[{ modelo, periodo, fecha_limite }]`. Solo lo que le toca: si no
 * tiene trabajadores no sale el 111, y si está exento de IVA no sale el 303.
 * Generar de más es peor que generar de menos — un despacho que ve veinte
 * plazos falsos deja de mirar la pantalla.
 */
export function obligacionesDe(perfil, año) {
  if (!perfil) return []
  const out = []

  // IVA y su resumen anual
  if (perfil.iva === 'trimestral') {
    out.push(...deTrimestres('303', año))
    out.push({ modelo: '390', periodo: String(año), fecha_limite: iso(año + 1, 1, 30) })
  } else if (perfil.iva === 'mensual') {
    out.push(...deMeses('303', año))
    out.push({ modelo: '390', periodo: String(año), fecha_limite: iso(año + 1, 1, 30) })
  }

  // IRPF del empresario: o 130 o 131, nunca los dos.
  if (perfil.irpf === 'directa') out.push(...deTrimestres('130', año))
  else if (perfil.irpf === 'modulos') out.push(...deTrimestres('131', año))

  // Retenciones practicadas, con su resumen anual común.
  if (perfil.retenciones) out.push(...deTrimestres('111', año, TRIMESTRES_RETENCIONES))
  if (perfil.alquileres) out.push(...deTrimestres('115', año, TRIMESTRES_RETENCIONES))
  if (perfil.retenciones || perfil.alquileres) {
    out.push({ modelo: '190', periodo: String(año), fecha_limite: iso(año + 1, 1, 31) })
  }

  if (perfil.intracomunitarias) out.push(...deTrimestres('349', año, TRIMESTRES_RETENCIONES))

  // Sociedades: la declaración se presenta en julio del año siguiente, y los
  // pagos fraccionados en abril, octubre y diciembre del propio ejercicio.
  if (perfil.sociedades) {
    out.push({ modelo: '200', periodo: String(año), fecha_limite: iso(año + 1, 7, 25) })
    out.push({ modelo: '202', periodo: `${año}P1`, fecha_limite: iso(año, 4, 20) })
    out.push({ modelo: '202', periodo: `${año}P2`, fecha_limite: iso(año, 10, 20) })
    out.push({ modelo: '202', periodo: `${año}P3`, fecha_limite: iso(año, 12, 20) })
  }

  // El 347 lo presenta casi todo el mundo, en febrero del año siguiente.
  out.push({ modelo: '347', periodo: String(año), fecha_limite: iso(año + 1, 2, 28) })

  return out
}

export const ESTADOS = [
  { key: 'pendiente_docs', label: 'Pendiente de docs', tono: '' },
  { key: 'en_proceso', label: 'En proceso', tono: 'cyan' },
  { key: 'presentado', label: 'Presentado', tono: 'green' },
  { key: 'fuera_plazo', label: 'Fuera de plazo', tono: 'red' },
]
export const ESTADO_MAP = Object.fromEntries(ESTADOS.map(e => [e.key, e]))

// Días que faltan (negativo si ya pasó). Se compara en fechas locales sin hora:
// una obligación que vence hoy no está vencida hasta mañana.
export function diasPara(fechaLimite) {
  const hoy = new Date()
  const l = new Date(`${fechaLimite}T00:00:00`)
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((l - h) / 86400000)
}

// El aviso que corresponde: 7 días antes, 3 días antes y el día D, que es lo
// que pidió Alejandro. Solo cuenta si aún no está presentado.
export function urgencia(obligacion) {
  if (obligacion.estado === 'presentado') return null
  const d = diasPara(obligacion.fecha_limite)
  if (d < 0) return { nivel: 'vencido', tono: 'red', texto: `Venció hace ${-d} día${d === -1 ? '' : 's'}` }
  if (d === 0) return { nivel: 'hoy', tono: 'red', texto: 'Vence HOY' }
  if (d <= 3) return { nivel: 'critico', tono: 'red', texto: `Quedan ${d} días` }
  if (d <= 7) return { nivel: 'aviso', tono: 'amber', texto: `Quedan ${d} días` }
  return null
}
