// HELM — Webs y Google · Reseñas: pedir reseña en Google a quien acaba de pagar.
//
// Qué hace en cada pasada por el perfil:
//   · Saca el enlace directo para dejar reseña en Google a partir del place_id
//     del negocio (https://search.google.com/local/writereview?placeid=…). El
//     place_id vive en la integración de Google Places del perfil
//     (user_integrations, service='google_places', config.place_id), junto a la
//     clave de la Places API (api/_lib/places.js). Si el perfil no lo tiene,
//     no se puede pedir nada: se dice qué falta en el resumen.
//   · Propone pedir reseña a los clientes de ventas cobradas hace 3-10 días
//     (ni recién comprado ni demasiado tarde), con un tope de 5 por pasada para
//     no quemar la lista. Lo manda el dueño desde su móvil (sin herramienta).
//
// La clave es por venta («resenas:<venta>»), así que a nadie se le pide dos veces.
//
// Datos que usa: user_integrations (google_places → config.place_id) y sales
// (date, client_name, client_phone, cash_collected). No llama a la IA.

const DIA = 86_400_000
const TOPE = 5
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || ''
const seCreo = (r) => Boolean(r) && r.creada !== false

// El place_id del propio negocio, si lo tiene puesto en su Google Places.
async function placeIdDelPerfil(supabase, clientId) {
  const { data } = await supabase.from('user_integrations')
    .select('config').eq('client_id', clientId).eq('service', 'google_places').is('member_id', null).maybeSingle()
  const pid = String(data?.config?.place_id || '').trim()
  return pid || null
}

const enlaceResena = (placeId) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`

const mensajeResena = ({ nombre, negocio, enlace }) =>
  `${nombre ? `¡Hola ${nombre}!` : '¡Hola!'} Gracias por confiar en ${negocio}. `
  + `Si ha sido una buena experiencia, ¿nos dejas una reseña en Google? `
  + `Es un momento y nos ayuda un montón: ${enlace}`

export default {
  key: 'resenas',
  departamento: 'webs',

  async corre(ctx) {
    const { supabase, clientId, perfil, hoy } = ctx

    const placeId = await placeIdDelPerfil(supabase, clientId)
    if (!placeId) {
      return {
        propuestas: 0,
        resumen: 'No se puede pedir reseñas: falta el place_id del negocio. Ponlo en la integración de Google Places del perfil (config.place_id).',
      }
    }
    const enlace = enlaceResena(placeId)

    // Ventas cobradas hace 3-10 días.
    const desdeStr = fmtDia.format(new Date(hoy.getTime() - 10 * DIA))
    const hastaStr = fmtDia.format(new Date(hoy.getTime() - 3 * DIA))
    const { data: ventas, error } = await supabase.from('sales')
      .select('id, date, client_name, client_phone, cash_collected')
      .eq('client_id', clientId)
      .gt('cash_collected', 0)
      .gte('date', desdeStr)
      .lte('date', hastaStr)
      .order('date', { ascending: false })
      .limit(100)
    if (error) throw error
    if (!ventas?.length) return { propuestas: 0, resumen: '' }

    const negocio = perfil.name || perfil.slug || 'nosotros'
    let propuestas = 0
    for (const v of ventas) {
      if (propuestas >= TOPE) break
      const r = await ctx.proponer({
        clave: `resenas:${v.id}`,
        titulo: `Pedir reseña en Google a ${v.client_name || 'un cliente'}`,
        porque: `Pagó hace entre 3 y 10 días: buen momento para pedirle una reseña en Google.`,
        mensaje: mensajeResena({ nombre: primerNombre(v.client_name), negocio, enlace }),
        telefono: v.client_phone || null,
        datos: { venta: v.id, enlace },
      })
      if (seCreo(r)) propuestas += 1
    }

    ctx.log?.(`resenas ${fmtDia.format(hoy)}: ${propuestas} peticiones (tope ${TOPE})`)
    return { propuestas, resumen: propuestas ? `${propuestas} petición(es) de reseña en Google propuestas.` : '' }
  },
}
