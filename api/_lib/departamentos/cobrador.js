// HELM — el cobrador del departamento de Finanzas.
//
// Cada mañana mira los planes de PAGO FRACCIONADO y las renovaciones de un
// perfil y, por cada cuota o renovación que toca HOY o en los próximos días (o
// que ya venció sin cobrar), deja una propuesta en la bandeja: el recordatorio
// para el cliente ya redactado (con su enlace de WhatsApp si hay teléfono) y,
// para una cuota, la escritura `registrar_cuota` para que «Aprobar» la marque
// como cobrada cuando el dueño confirme. NUNCA cobra solo: solo propone.
//
// El dinero fraccionado es el que se escapa: no hay pasarela que pase el cargo,
// así que si nadie se acuerda, no entra (ver api/_lib/renovaciones.js). Por eso
// este agente es el primero de Finanzas en correr.
//
// De dónde salen los datos (esquema real, no inventado):
//   · sales — installments_total/paid, installment_amount, plan_start, revenue,
//     cash_collected, status, client_name/phone, product, service_end.
//     La próxima cuota y su importe se calculan igual que cobros_pendientes de
//     api/_lib/bot/lecturas.js (misma fórmula, portada para no arrastrar la
//     base en los tests).
//   · helm_links — por si hay un enlace de pago guardado para meterlo al mensaje.
//
// Lo que se escribe al aprobar lo hace la escritura registrar_cuota
// (api/_lib/bot/escrituras.js): suma la cuota, actualiza lo cobrado y deja el
// Ingreso en Finanzas, sin pasarse del total y sin duplicar el mes.
import { masMeses, aISO } from '../renovaciones.js'

// ── Cálculo puro (el día es SIEMPRE el de Madrid, como api/_lib/bot/comun.js) ─
const fmtMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoyMadrid = (d = new Date()) => fmtMadrid.format(d)
const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100
const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(redondea(n))} €`
// Suma n días a un 'AAAA-MM-DD' al mediodía UTC (así la hora no cruza de día).
const masDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diasEntre = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86_400_000)

// Mismas reglas que lecturas.js: una venta cancelada no cobra, y la cuota y su
// fecha se sacan de las columnas del plan.
const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'
const cuotasPendientes = (v) => {
  const total = Number(v?.installments_total) || 0
  return total ? Math.max(0, total - (Number(v.installments_paid) || 0)) : null
}
const importeCuota = (v) => redondea(Number(v.installment_amount) || (Number(v.revenue) || 0) / (Number(v.installments_total) || 1))
// La primera cuota, el día que arranca el plan; luego una al mes.
const proximaCuota = (v) => aISO(masMeses(new Date(`${v.plan_start || v.date}T00:00:00Z`), Number(v.installments_paid) || 0))
const nombrePila = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || ''

// Un enlace de pago guardado en Enlaces (checkout, pasarela…): para meterlo en
// el recordatorio. Se prefiere la categoría Ventas, y si no, cualquiera que
// huela a cobro por su título o su URL.
const RE_PAGO = /pago|cobro|checkout|\bpay\b|stripe|hotmart|bizum|factura|suscrip|payment|pagar/i
function enlaceDePago(links) {
  const lista = (links || []).filter(l => l?.url)
  const deVentas = lista.find(l => String(l.category || '') === 'Ventas' && RE_PAGO.test(`${l.title || ''} ${l.url}`))
  return (deVentas || lista.find(l => RE_PAGO.test(`${l.title || ''} ${l.url}`)))?.url || null
}

// Cómo se dice la fecha en el título y en el porqué.
function cuando(fechaISO, hoy) {
  if (fechaISO === hoy) return 'vence hoy'
  if (fechaISO < hoy) {
    const d = diasEntre(hoy, fechaISO)
    return d === 1 ? 'venció ayer' : `vencida (hace ${d} días)`
  }
  const d = diasEntre(fechaISO, hoy)
  return d === 1 ? 'vence mañana' : `vence el ${fechaISO}`
}

// El recordatorio para el cliente: cercano, corto, sin sonar a robot. Cambia
// según si la cuota está al caer o ya se pasó.
function mensajeCuota({ nombre, n, total, producto, importe, fechaISO, hoy, enlace }) {
  const hola = nombre ? `Hola ${nombre}, ` : 'Hola, '
  const que = `la cuota ${n}/${total} de ${producto} (${euros(importe)})`
  const cuerpo = fechaISO < hoy
    ? `${hola}se nos quedó pendiente ${que}, que vencía el ${fechaISO}. ¿La dejamos al día?`
    : fechaISO === hoy
      ? `${hola}un recordatorio rápido: hoy vence ${que}.`
      : `${hola}un recordatorio rápido: ${que} vence el ${fechaISO}.`
  const pago = enlace ? ` Puedes dejarla hecha aquí: ${enlace}.` : ''
  return `${cuerpo}${pago} ¡Gracias!`
}

function mensajeRenovacion({ nombre, producto, importe, fechaISO, hoy, enlace }) {
  const hola = nombre ? `Hola ${nombre}, ` : 'Hola, '
  const cuerpo = fechaISO < hoy
    ? `${hola}tu ${producto} venció el ${fechaISO}. ¿Lo renovamos?`
    : fechaISO === hoy
      ? `${hola}hoy toca renovar tu ${producto} (${euros(importe)}).`
      : `${hola}tu ${producto} (${euros(importe)}) se renueva el ${fechaISO}.`
  const pago = enlace ? ` Lo tienes aquí: ${enlace}.` : ''
  return `${cuerpo}${pago} ¡Gracias!`
}

export default {
  key: 'cobrador',
  departamento: 'finanzas',

  async corre(ctx) {
    const { supabase, clientId, config = {} } = ctx
    const hoy = hoyMadrid(ctx.hoy || new Date())
    // Ventana de antelación (por defecto, 3 días) y topes para no inundar.
    const dias = Number.isFinite(config.dias) ? config.dias : 3
    const tope = Number.isFinite(config.max) ? config.max : 40
    // Atrás, lo que se mira: cuotas vencidas, todas (es deuda viva); pero una
    // renovación muy vieja ya no se persigue.
    const renovDesde = masDias(hoy, -(Number.isFinite(config.vencidas_dias) ? config.vencidas_dias : 60))
    const limite = masDias(hoy, dias)

    const { data: ventas, error } = await supabase.from('sales')
      .select('id, date, client_name, client_phone, product, revenue, cash_collected, status, installments_total, installments_paid, installment_amount, plan_start, service_end')
      .eq('client_id', clientId).limit(5000)
    if (error) throw error

    const { data: links } = await supabase.from('helm_links')
      .select('title, url, category').eq('client_id', clientId).limit(200)
    const enlace = enlaceDePago(links)

    let propuestas = 0
    let cuotas = 0; let renovaciones = 0; let vencidas = 0
    const propon = async (p) => { const r = await ctx.proponer(p); if (r) propuestas++; return r }

    // ── Cuotas de planes fraccionados ──────────────────────────────────────
    const planes = (ventas || [])
      .filter(v => !cancelada(v) && cuotasPendientes(v) > 0)
      .map(v => ({ v, fecha: proximaCuota(v) }))
      .filter(({ v, fecha }) => {
        const falta = redondea((Number(v.revenue) || 0) - (Number(v.cash_collected) || 0))
        return falta > 0 && fecha <= limite   // hoy, próximos `dias`, o ya vencida
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    for (const { v, fecha } of planes) {
      if (propuestas >= tope) break
      const n = (Number(v.installments_paid) || 0) + 1
      const total = Number(v.installments_total) || 0
      const importe = importeCuota(v)
      const producto = v.product || 'tu plan'
      const facturado = Number(v.revenue) || 0
      const cobrado = Number(v.cash_collected) || 0
      const atrasada = fecha < hoy
      if (atrasada) vencidas++
      cuotas++
      const r = await propon({
        clave: `cobrador:${v.id}:${n}`,
        titulo: `Cuota ${n}/${total} de ${v.client_name || 'cliente'} — ${euros(importe)} — ${cuando(fecha, hoy)}`,
        porque: `Plan de ${producto}: ${v.installments_paid || 0}/${total} cuotas cobradas, ${euros(importe)} cada una. ` +
          `La cuota ${n} ${cuando(fecha, hoy)} (${fecha}). Lleva ${euros(cobrado)} de ${euros(facturado)}; faltan ${euros(facturado - cobrado)}.`,
        mensaje: mensajeCuota({ nombre: nombrePila(v.client_name), n, total, producto, importe, fechaISO: fecha, hoy, enlace }),
        telefono: v.client_phone || null,
        // Al aprobar, se marca cobrada con los datos de ese momento.
        herramienta: 'registrar_cuota',
        input: { venta: v.id, cuota: n },
        datos: { venta: v.id, cuota: n, importe, fecha, vencida: atrasada },
      })
      if (!r) continue
    }

    // ── Renovaciones (pago único con fin de término) ───────────────────────
    const renovs = (ventas || [])
      .filter(v => !cancelada(v) && cuotasPendientes(v) == null && v.service_end)
      .map(v => ({ v, fecha: v.service_end }))
      .filter(({ fecha }) => fecha <= limite && fecha >= renovDesde)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    for (const { v, fecha } of renovs) {
      if (propuestas >= tope) break
      const importe = Number(v.revenue) || 0
      const producto = v.product || 'tu servicio'
      const atrasada = fecha < hoy
      if (atrasada) vencidas++
      renovaciones++
      // Sin escritura: una renovación no se «marca cobrada», la gestiona el
      // dueño (recobra y revende). Aprobar = darla por avisada.
      await propon({
        clave: `cobrador:renov:${v.id}:${fecha}`,
        titulo: `Renovación de ${producto} de ${v.client_name || 'cliente'} — ${euros(importe)} — ${cuando(fecha, hoy)}`,
        porque: `${producto} de ${v.client_name || 'cliente'} ${cuando(fecha, hoy)} (${fecha}). Importe de referencia: ${euros(importe)}.`,
        mensaje: mensajeRenovacion({ nombre: nombrePila(v.client_name), producto, importe, fechaISO: fecha, hoy, enlace }),
        telefono: v.client_phone || null,
        datos: { venta: v.id, fecha, importe, vencida: atrasada },
      })
    }

    const resumen = propuestas
      ? `${propuestas} cobro${propuestas === 1 ? '' : 's'} por avisar` +
        ` (${cuotas} cuota${cuotas === 1 ? '' : 's'}, ${renovaciones} renovaci${renovaciones === 1 ? 'ón' : 'ones'})` +
        `${vencidas ? `, ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''}.`
      : `Sin cobros que tocar en los próximos ${dias} días.`
    return { propuestas, resumen }
  },
}
