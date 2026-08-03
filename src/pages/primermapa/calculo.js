// Diagnóstico operativo — el motor de cálculo.
//
// Cada fuga devuelve un RANGO mensual, nunca una cifra exacta: se estima a
// partir de respuestas por tramos, y dar un número redondo transmitiría una
// precisión que no existe.
//
// Dos decisiones que sostienen la credibilidad del informe:
//   · Se usa el extremo bajo de cada rango publicado del sector.
//   · Las fugas basadas en TIEMPO llevan un descuento del 22 % cuando hay más
//     de dos, porque las mismas horas aparecen en varias y contarlas enteras
//     inflaría el total.
import { Q, visibles, valorDe } from './preguntas'

export const eur = (n) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €'

export const PERFILES = [
  { max: 35, name: 'Negocio artesanal', color: 'var(--clay)',
    txt: 'Todo funciona porque tú estás encima. Ahora mismo, cada euro extra que metas en captación te va a comprar más caos que ventas. Antes de automatizar nada hay que documentar y unificar dónde vive la información.' },
  { max: 55, name: 'Techo operativo', color: 'var(--warn)',
    txt: 'Vendes bien y el freno está en la operativa. Este es el punto donde la automatización se paga sola más rápido: ya hay procesos claros y repetidos, solo hay que conectarlos.' },
  { max: 75, name: 'Base sólida con fugas', color: 'var(--mint)',
    txt: 'Lo esencial funciona. Lo que queda son fugas concretas y localizables que están costando dinero en silencio, no un problema de fondo.' },
  { max: 101, name: 'Máquina engrasada', color: 'var(--mint)',
    txt: 'Poca fontanería que arreglar. Tu siguiente salto no es automatizar tareas, es meter inteligencia sobre los datos que ya tienes bien ordenados.' },
]

export const DIMENSIONES = {
  datos: 'Datos', velocidad: 'Velocidad', integracion: 'Integración',
  documentacion: 'Documentación', manual: 'Carga manual', capacidad: 'Capacidad',
}

export function compute(A) {
  const v = (id) => valorDe(A, id)
  const ticket = v('ticket') || 100
  const ventas = v('ventas') || 20
  const margen = v('margen') || 0.4
  const ch = v('costehora') || 25
  const leads = v('leads') || 50
  const conv = v('convlead') || 0.08
  // La hora del fundador no vale lo que la de su equipo: es la que decide.
  const chFund = ch * 2.2
  const team = v('equipo') || 1

  const leaks = []
  // Por debajo de 25 €/mes no es una fuga, es ruido: enseñarla resta
  // credibilidad al resto del informe.
  const add = (o) => { if (o.max > 25) leaks.push(o) }

  /* 1 · velocidad de respuesta */
  const lag = v('respuesta')
  if (lag >= 2) {
    const uplift = lag >= 4 ? 0.18 : lag === 3 ? 0.14 : 0.08
    const base = leads * conv * ticket * margen
    add({ area: 'Captación', name: 'Contactos que se enfrían antes de que respondáis',
      min: base * uplift * 0.6, max: base * uplift,
      why: `Entran unos ${Math.round(leads)} contactos al mes y el primero en responder se lleva la mayoría. Cada hora de espera reduce la probabilidad de cierre.`,
      fix: 'Respuesta automática en menos de 60 segundos por el canal que usó el cliente, con cualificación previa y aviso al comercial solo cuando el contacto está caliente.',
      esf: 'Bajo', plazo: '1–2 semanas' })
  }

  /* 2 · sin seguimiento */
  const seg = v('seguimiento')
  if (seg >= 2) {
    const perdidos = leads * (1 - conv)
    const rec = seg === 3 ? 0.035 : 0.02
    add({ area: 'Venta', name: 'Contactos que se pierden por no insistir',
      min: perdidos * rec * 0.55 * ticket * margen, max: perdidos * rec * ticket * margen,
      why: `Cada mes hay unos ${Math.round(perdidos)} contactos que no compran y con los que no se vuelve a hablar. La mayoría de las ventas se cierran a partir del cuarto contacto.`,
      fix: 'Secuencia de seguimiento de 5 a 8 toques por email y WhatsApp, que se detiene sola cuando el contacto responde o compra.',
      esf: 'Bajo', plazo: '2 semanas' })
  }

  /* 3 · abandono en el pago */
  const ab = v('abandono')
  if (A.abandono && ab >= 1) {
    const abandonan = ventas * 2.2
    const rec = ab === 3 ? 0.09 : 0.05
    add({ area: 'Venta', name: 'Compras que se quedan a medias y nadie recupera',
      min: abandonan * rec * 0.6 * ticket * margen, max: abandonan * rec * ticket * margen,
      why: 'De cada persona que llega al pago, dos más lo empiezan y lo dejan. Sin recuperación, ese tráfico ya pagado se tira.',
      fix: 'Recuperación en tres pasos a los 30 minutos, 24 horas y 3 días, con enlace directo al carrito y un incentivo solo en el último toque.',
      esf: 'Bajo', plazo: '1 semana' })
  }

  /* 4 · reuniones que se caen */
  const ns = v('noshow')
  if (A.noshow && ns >= 0.17) {
    const reuniones = ventas / Math.max(conv * 3, 0.12)
    const evitable = Math.min(ns * 0.45, 0.18)
    add({ area: 'Venta', name: 'Reuniones agendadas que no se presentan',
      min: reuniones * evitable * 0.55 * conv * 3 * ticket * margen,
      max: reuniones * evitable * conv * 3 * ticket * margen,
      why: `Un ${Math.round(ns * 100)} % de no presentados es hueco de agenda pagado con tráfico. La mayor parte se evita con recordatorios bien puestos.`,
      fix: 'Confirmación inmediata, recordatorios a 24 h y 1 h por WhatsApp, reagenda con un clic y aviso al comercial cuando alguien no confirma.',
      esf: 'Bajo', plazo: '1 semana' })
  }

  /* 5 · propuestas manuales */
  const pr = v('propuestas')
  if (pr >= 1) {
    const h = ventas / Math.max(conv * 4, 0.15) * (pr === 2 ? 0.75 : 0.3)
    add({ area: 'Venta', name: 'Horas montando propuestas desde cero',
      min: h * ch * 0.5, max: h * ch * 0.8, t: 1,
      why: 'Cada propuesta escrita a mano son entre 20 y 45 minutos que no se dedican a vender, y además ralentiza el envío justo cuando el cliente está más caliente.',
      fix: 'Generador de propuestas que toma los datos del CRM, monta el documento con el precio correcto y lo envía con firma digital incluida.',
      esf: 'Medio', plazo: '3–4 semanas' })
  }

  /* 6 · administración manual */
  const ha = v('horasadmin')
  if (ha >= 5) {
    const autom = v('facturas') >= 1 ? 0.6 : 0.4
    add({ area: 'Administración', name: 'Trabajo administrativo que no necesita a nadie',
      min: ha * autom * 0.65 * ch, max: ha * autom * ch, t: 1,
      why: `Unas ${Math.round(ha)} horas al mes en gestión. Entre el 40 y el 60 % son reglas fijas: si pasa esto, haz aquello.`,
      fix: 'Facturación automática al cobrar, conciliación de pagos contra facturas y envío programado de los informes internos.',
      esf: 'Medio', plazo: '3–5 semanas' })
  }

  /* 7 · copiar y pegar entre herramientas */
  const cp = v('copypaste')
  if (cp > 0) {
    const personas = Math.min(team, 8)
    const h = cp * personas * 21
    add({ area: 'Operación', name: 'Datos que se copian de una herramienta a otra a mano',
      min: h * ch * 0.6, max: h * ch * 0.85, t: 1,
      why: 'Es el trabajo más caro que existe: aporta cero, se hace todos los días y además introduce errores que luego cuesta más arreglar.',
      fix: 'Conexión directa entre las herramientas para que el dato se escriba una sola vez y viaje solo al resto del sistema.',
      esf: 'Medio', plazo: '2–4 semanas' })
  }

  /* 8 · atención al cliente repetitiva */
  const sv = v('soporte_vol')
  const sr = v('soporte_rep')
  if (sv * sr > 2) {
    const h = sv * 22 * sr * (6 / 60)
    const deflect = 0.55
    add({ area: 'Soporte', name: 'La misma pregunta contestada una y otra vez',
      min: h * deflect * 0.6 * ch, max: h * deflect * ch, t: 1,
      why: `Alrededor de ${Math.round(sv * sr)} consultas repetidas al día. Son las mismas cinco preguntas con distinta redacción.`,
      fix: 'Asistente entrenado con vuestras respuestas reales que resuelve lo repetido y pasa a una persona solo lo que tiene matiz.',
      esf: 'Medio', plazo: '3–4 semanas' })
  }

  /* 9 · sin retención */
  const ret = A.retencion || []
  if (ret.includes('nada') || ret.length <= 1) {
    const base = ventas * ticket * margen
    add({ area: 'Retención', name: 'Clientes que compran una vez y no vuelven',
      min: base * 0.05, max: base * 0.12,
      why: 'Ya has pagado por captarlos. Volver a venderles cuesta una fracción de lo que costó traerlos la primera vez.',
      fix: 'Secuencia post-compra, reactivación de dormidos a los 60 y 120 días, y petición automática de reseña en el momento de máxima satisfacción.',
      esf: 'Bajo', plazo: '2–3 semanas' })
  }

  /* 10 · software sin usar */
  const su = v('sinusar')
  const sc = v('stackcoste')
  if (su > 0 && sc > 200) {
    add({ area: 'Administración', name: 'Software que pagáis y no usáis',
      min: sc * 0.1 * su, max: sc * 0.25 * su,
      why: 'Herramientas que se contrataron para un proyecto que ya no existe, o duplicadas porque dos áreas compraron lo mismo.',
      fix: 'Auditoría de licencias, baja de lo muerto y consolidación de funciones duplicadas en una sola herramienta.',
      esf: 'Bajo', plazo: '1 semana' })
  }

  /* 11 · datos dispersos */
  const dd = (A.donde || []).length
  if (dd >= 4) {
    add({ area: 'Operación', name: 'La información del cliente vive en cinco sitios a la vez',
      min: team * 2.5 * ch * 0.6, max: team * 4 * ch, t: 1,
      why: `Has marcado ${dd} sitios distintos. Cada decisión empieza por buscar el dato y comprobar cuál de las versiones es la buena.`,
      fix: 'Fuente única de verdad: un sistema manda y el resto lee de él, con sincronización en un solo sentido para que nunca haya dos verdades.',
      esf: 'Alto', plazo: '6–8 semanas' })
  }

  /* 12 · fundador atrapado */
  const fh = v('fundadorhoras')
  if (fh >= 3.5) {
    add({ area: 'Equipo', name: 'Tu tiempo dentro de tareas mecánicas',
      min: fh * 4.33 * 0.5 * chFund, max: fh * 4.33 * 0.75 * chFund, t: 1,
      why: `Unas ${Math.round(fh * 4.33)} horas al mes tuyas en cosas que no requieren que seas tú. Ese es el coste más alto del negocio, aunque no aparezca en ninguna factura.`,
      fix: 'Documentar y automatizar primero lo que solo tú tocas: aprobaciones, revisiones y traspasos entre personas.',
      esf: 'Medio', plazo: '4–6 semanas' })
  }

  /* descuento de solape sobre el bloque de tiempo */
  const tiempo = leaks.filter(l => l.t)
  if (tiempo.length > 2) tiempo.forEach(l => { l.min *= 0.78; l.max *= 0.78 })

  leaks.forEach(l => { l.mid = (l.min + l.max) / 2 })
  leaks.sort((a, b) => b.mid - a.mid)

  /* índice de escalabilidad */
  const dims = { datos: [], velocidad: [], integracion: [], documentacion: [], manual: [], capacidad: [] }
  visibles(A).forEach(q => {
    if (!q.options) return
    const o = q.options.find(x => x.value === A[q.id])
    if (o && o.s !== undefined && o.d) dims[o.d].push(o.s / 3 * 100)
  })
  if (A.confianza !== undefined) dims.datos.push((A.confianza - 1) / 9 * 100)
  if ((A.donde || []).length) dims.integracion.push(Math.max(0, 100 - ((A.donde.length - 1) * 22)))
  Object.keys(dims).forEach(k => {
    dims[k] = dims[k].length ? Math.round(dims[k].reduce((a, b) => a + b) / dims[k].length) : 50
  })
  const idx = Math.round(Object.values(dims).reduce((a, b) => a + b) / 6)

  const total = {
    min: leaks.reduce((s, l) => s + l.min, 0),
    max: leaks.reduce((s, l) => s + l.max, 0),
  }
  const perfil = PERFILES.find(p => idx < p.max)

  return { leaks, dims, idx, total, perfil }
}

// ¿Es un lead caliente? Se calcula aquí y viaja al CRM, para que quien lo abra
// no tenga que deducirlo leyendo 30 respuestas.
export function calificar(A, R) {
  if (A.urgencia === 'ya') return { caliente: true, motivo: 'Urgencia inmediata' }
  if (A.triple === 'no' && A.objetivo === 'duplicar') {
    return { caliente: true, motivo: 'Quiere duplicar y la operativa no aguanta' }
  }
  if (R.total.max > 4000) return { caliente: true, motivo: 'Fuga estimada alta' }
  return { caliente: false, motivo: 'Estándar' }
}

// Cuántas señales de alarma ha dejado por el camino (opciones de puntuación
// baja). Es el contador que se ve en la barra lateral mientras responde.
export function señales(A) {
  const bajas = Object.keys(A).filter(k => {
    const q = Q.find(x => x.id === k)
    if (!q || !q.options) return false
    const o = q.options.find(x => x.value === A[k])
    return o && o.s !== undefined && o.s <= 1
  }).length
  return bajas + ((A.donde || []).length >= 4 ? 1 : 0)
}
