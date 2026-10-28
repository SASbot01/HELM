// HELM — Atención · Postventa: no dejar sola a la gente después de comprar.
//
// Qué hace en cada pasada por el perfil:
//   · A los días que diga el perfil (ctx.config.dias, por defecto [7, 30])
//     contados desde la venta, propone un mensaje de seguimiento («¿qué tal…?»)
//     con el WhatsApp del cliente.
//   · En el último de esos días, a quien da buenas señales (ha pagado entero o
//     es comprador que repite) se le pide en su lugar un testimonio/reseña.
//   · Lo manda el dueño desde su móvil (sin herramienta: aprobar = darlo por
//     hecho).
//
// La clave es por venta y por día («postventa:<venta>:<dia>», o
// «postventa-testimonio:<venta>» para el testimonio), así que ni se repite ni
// se solapan el seguimiento y la petición de testimonio.
//
// Datos que usa: sales (date, client_name, client_phone, client_email, product,
// revenue, cash_collected). Fechas en Europe/Madrid. No llama a la IA.

const DIA = 86_400_000
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || ''
const seCreo = (r) => Boolean(r) && r.creada !== false
const aDia = (s) => Date.parse(`${String(s || '').slice(0, 10)}T00:00:00Z`)
const diasEntre = (desde, hasta) => Math.round((aDia(hasta) - aDia(desde)) / DIA)

// Los días configurados, saneados: enteros positivos, sin repetir y en orden.
function diasDe(config) {
  const crudos = Array.isArray(config.dias) ? config.dias : [7, 30]
  const limpios = [...new Set(crudos.map(n => Math.trunc(Number(n))).filter(n => Number.isFinite(n) && n > 0))]
  return limpios.sort((a, b) => a - b)
}

const pagadaEntera = (v) => Number(v.revenue) > 0 && Number(v.cash_collected) >= Number(v.revenue)

// ¿Comprador que repite? Dos o más ventas con el mismo email.
async function repite(supabase, clientId, email) {
  if (!email) return false
  const { data } = await supabase.from('sales')
    .select('id').eq('client_id', clientId).ilike('client_email', email).limit(2)
  return (data?.length || 0) >= 2
}

const mensajeSeguimiento = ({ nombre, producto, negocio }) =>
  `${nombre ? `¡Hola ${nombre}!` : '¡Hola!'} ¿Qué tal te va con ${producto}? `
  + `Si te ha surgido cualquier duda, cuéntame y te echo una mano. — ${negocio}`

const mensajeTestimonio = ({ nombre, producto, negocio }) =>
  `${nombre ? `¡Hola ${nombre}!` : '¡Hola!'} Me alegra mucho tenerte con nosotros. `
  + `Si estás contento/a con ${producto}, ¿te importaría dejarnos unas líneas de testimonio? `
  + `Nos ayuda muchísimo. ¡Gracias! — ${negocio}`

export default {
  key: 'postventa',
  departamento: 'atencion',

  async corre(ctx) {
    const { supabase, clientId, perfil, hoy, config } = ctx
    const dias = diasDe(config)
    if (!dias.length) return { propuestas: 0, resumen: '' }
    const maxDia = dias[dias.length - 1]
    const hoyStr = fmtDia.format(hoy)
    // Solo las ventas que pueden caer justo en uno de los días (hasta el mayor).
    const desdeStr = fmtDia.format(new Date(hoy.getTime() - (maxDia + 1) * DIA))

    const { data: ventas, error } = await supabase.from('sales')
      .select('id, date, client_name, client_phone, client_email, product, revenue, cash_collected')
      .eq('client_id', clientId)
      .gte('date', desdeStr)
      .lte('date', hoyStr)
      .order('date', { ascending: false })
      .limit(500)
    if (error) throw error
    if (!ventas?.length) return { propuestas: 0, resumen: '' }

    const negocio = perfil.name || perfil.slug || 'nosotros'
    let seguimientos = 0
    let testimonios = 0
    for (const v of ventas) {
      const edad = diasEntre(v.date, hoyStr)
      if (!dias.includes(edad)) continue
      const nombre = primerNombre(v.client_name)
      const producto = v.product || 'tu compra'

      const buenaSenal = edad === maxDia && (pagadaEntera(v) || await repite(supabase, clientId, v.client_email))
      if (buenaSenal) {
        const r = await ctx.proponer({
          clave: `postventa-testimonio:${v.id}`,
          titulo: `Pedir testimonio a ${v.client_name || v.client_email || 'un cliente'}`,
          porque: `Compró «${producto}» hace ${edad} días y da buenas señales (pago completo o cliente que repite).`,
          mensaje: mensajeTestimonio({ nombre, producto, negocio }),
          telefono: v.client_phone || null,
          datos: { venta: v.id, dia: edad, producto },
        })
        if (seCreo(r)) testimonios += 1
      } else {
        const r = await ctx.proponer({
          clave: `postventa:${v.id}:${edad}`,
          titulo: `Seguimiento a ${v.client_name || v.client_email || 'un cliente'} (día ${edad})`,
          porque: `Compró «${producto}» hace ${edad} días: toca el mensaje de seguimiento.`,
          mensaje: mensajeSeguimiento({ nombre, producto, negocio }),
          telefono: v.client_phone || null,
          datos: { venta: v.id, dia: edad, producto },
        })
        if (seCreo(r)) seguimientos += 1
      }
    }

    ctx.log?.(`postventa ${hoyStr}: ${seguimientos} seguimientos, ${testimonios} testimonios`)
    const propuestas = seguimientos + testimonios
    const resumen = propuestas
      ? `${seguimientos} seguimiento(s)${testimonios ? ` y ${testimonios} petición(es) de testimonio` : ''}.`
      : ''
    return { propuestas, resumen }
  },
}
