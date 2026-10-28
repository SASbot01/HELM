// HELM — a quién hay que avisar hoy, y qué decirle.
//
// El despacho no tiene que calcular nada: abre la pantalla y ve la lista de
// clientes a los que toca escribir, con el mensaje ya escrito y el enlace donde
// suben sus papeles. Un clic y sale por WhatsApp o por email.
//
// Por qué no se manda solo todavía: HELM no tiene proveedor de correo ni la API
// de WhatsApp Business, y la parte difícil de un aviso nunca fue el envío —
// era saber A QUIÉN. Eso es lo que resuelve esto. Cuando haya canal, el motor
// ya está: solo cambia quién pulsa el botón.
import { diasPara, MODELOS } from './modelos'

// Los avisos de vencimiento: 7 días antes, 3 días antes y el día D.
const POR_VENCIMIENTO = [
  { tipo: 'd7', dias: 7, urgencia: 'aviso' },
  { tipo: 'd3', dias: 3, urgencia: 'seria' },
  { tipo: 'd0', dias: 0, urgencia: 'ultima' },
]

// Y los de recogida de documentación dentro del trimestre, que es lo que pidió
// Alejandro: primer aviso el día 1, segundo el 7, urgente el 14, último el 18.
// Solo se proponen si el cliente NO ha entregado nada todavía.
const POR_TRIMESTRE = [
  { tipo: 'trim1', dia: 1, urgencia: 'aviso' },
  { tipo: 'trim7', dia: 7, urgencia: 'aviso' },
  { tipo: 'trim14', dia: 14, urgencia: 'seria' },
  { tipo: 'trim18', dia: 18, urgencia: 'ultima' },
]

const TONO = {
  aviso: { label: 'Recordatorio', tono: '' },
  seria: { label: 'Insistir', tono: 'amber' },
  ultima: { label: 'Última llamada', tono: 'red' },
}

/**
 * Los avisos que tocan HOY.
 *
 * `enviados` es el conjunto de `${obligacionId}:${tipo}` que ya salieron: un
 * aviso repetido molesta más que uno que falta, así que lo ya mandado no se
 * vuelve a proponer nunca.
 */
export function avisosDeHoy(obligaciones, enviados = new Set(), hoy = new Date()) {
  const out = []
  const diaDelMes = hoy.getDate()

  for (const o of obligaciones) {
    if (o.estado === 'presentado') continue
    const faltan = diasPara(o.fecha_limite)
    if (faltan < 0) continue                    // vencido: ya no es un aviso, es un problema

    // Vencimiento
    for (const v of POR_VENCIMIENTO) {
      if (faltan !== v.dias) continue
      if (enviados.has(`${o.id}:${v.tipo}`)) continue
      out.push({ obligacion: o, tipo: v.tipo, ...TONO[v.urgencia], faltan })
    }

    // Recogida de documentación: solo mientras no haya entregado nada y quede
    // más de una semana. Pedirle facturas a alguien tres días antes del plazo
    // no es recogida de documentación, es una urgencia — y esa ya la cubre d3.
    if (o.estado === 'pendiente_docs' && faltan > 7) {
      for (const t of POR_TRIMESTRE) {
        if (diaDelMes !== t.dia) continue
        if (enviados.has(`${o.id}:${t.tipo}`)) continue
        out.push({ obligacion: o, tipo: t.tipo, ...TONO[t.urgencia], faltan })
      }
    }
  }

  // Lo más urgente primero: es el orden en que hay que ir escribiendo.
  const peso = { ultima: 0, seria: 1, aviso: 2 }
  return out.sort((a, b) => (peso[a.label] ?? 9) - (peso[b.label] ?? 9) || a.faltan - b.faltan)
}

/**
 * El mensaje, ya escrito. Se manda tal cual o se retoca antes de enviarlo.
 *
 * Tutea y va sin florituras: lo escribe una asesoría a su cliente de toda la
 * vida, no una marca a un desconocido. Y siempre acaba en el enlace, que es la
 * única acción que se le pide.
 */
export function mensajeDe({ tipo, obligacion, nombreCliente, nombreDespacho, enlace }) {
  const modelo = `${obligacion.modelo}${MODELOS[obligacion.modelo] ? ` (${MODELOS[obligacion.modelo].nombre})` : ''}`
  const fecha = new Date(`${obligacion.fecha_limite}T00:00:00`)
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  const hola = `Hola${nombreCliente ? ` ${String(nombreCliente).split(' ')[0]}` : ''},`
  const firma = nombreDespacho ? `\n\nUn saludo,\n${nombreDespacho}` : ''
  const link = enlace ? `\n\n${enlace}` : ''

  const cuerpos = {
    trim1: `ya podemos ponernos con tu ${modelo} del ${obligacion.periodo}. Cuando puedas, súbenos las facturas y los extractos del periodo por aquí:`,
    trim7: `te recordamos que seguimos esperando la documentación para tu ${modelo} del ${obligacion.periodo}. En cuanto la tengamos nos ponemos:`,
    trim14: `nos queda poco margen para preparar tu ${modelo} del ${obligacion.periodo} con tranquilidad. Se presenta el ${fecha} y todavía no tenemos tus documentos:`,
    trim18: `esto es lo último que te escribimos por el ${modelo} del ${obligacion.periodo}: se presenta el ${fecha} y aún no nos ha llegado nada. Si no podemos prepararlo a tiempo, la presentación fuera de plazo lleva recargo:`,
    d7: `tu ${modelo} del ${obligacion.periodo} se presenta el ${fecha}. Si te falta por mandarnos algo, este es el momento:`,
    d3: `quedan 3 días para presentar tu ${modelo} del ${obligacion.periodo} (${fecha}). Si tienes algo pendiente de enviarnos, mándalo hoy:`,
    d0: `hoy es el último día para presentar tu ${modelo} del ${obligacion.periodo}. Si falta algo por tu parte, avísanos ya:`,
  }

  return `${hola} ${cuerpos[tipo] || cuerpos.d7}${link}${firma}`
}

// El enlace de WhatsApp con el mensaje dentro. Es el mismo patrón que ya usa la
// ficha del CRM, así que el despacho no aprende nada nuevo.
export function enlaceWhatsApp(telefono, mensaje) {
  const num = String(telefono || '').replace(/\D/g, '')
  if (!num) return null
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

export function enlaceEmail(email, asunto, mensaje) {
  if (!email) return null
  return `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`
}
