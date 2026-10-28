// HELM — Ventas · el PROSPECTOR.
//
// La prospección (api/prospeccion.js) ya busca negocios por zona en Google Maps
// y los enriquece leyendo su web. Lo que faltaba: el PRIMER MENSAJE de cada uno,
// redactado con lo que se sabe del negocio (no tiene web, la tiene vieja,
// buenas reseñas…), listo para mandar por WhatsApp.
//
// OJO LSSI: nada de envíos masivos ni correo. Esto NO manda nada: propone, uno
// a uno, para que el dueño decida a quién escribir. Cada propuesta lleva el
// enlace de WhatsApp si hay teléfono; sin teléfono no hay a quién escribir (y
// el correo en frío queda descartado a propósito), así que se deja fuera.
//
// Solo los negocios en estado 'nuevo' (prospectados y sin tocar): los que ya se
// importaron al CRM los lleva el seguimiento. Tope 5 por pasada, los más
// calientes primero (mejores reseñas). Sin IA: datos + plantillas.

const recorta = (t, n) => { const s = String(t ?? '').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s }

// Lo que se sabe del negocio, para elegir el ángulo del mensaje.
function anguloDe(p) {
  const web = String(p.web || '').trim()
  const rating = Number(p.rating) || 0
  const resenas = Number(p.resenas) || 0
  const buenas = rating >= 4.3 && resenas >= 10
  if (!web) return { clave: 'sin_web', buenas }
  return { clave: 'con_web', buenas }
}

// El primer mensaje, corto y cercano, con el gancho de lo que se ha encontrado.
// Firma quien escribe: ctx.config.remitente o, si no, el nombre del perfil
// (nunca un «[tu nombre]» que se pueda mandar tal cual).
function primerMensaje(p, remitente = '') {
  const soy = remitente ? `Hola, soy ${remitente}.` : 'Hola.'
  const nombre = String(p.nombre || '').trim()
  const ref = nombre ? ` ${nombre}` : ''
  const a = anguloDe(p)
  const elogio = a.buenas ? ` Os he visto en Google con muy buenas reseñas (${Number(p.rating).toFixed(1)}★), se nota que cuidáis el trabajo.` : ''
  if (a.clave === 'sin_web') {
    return `${soy}${elogio} Me fijé en${ref} y vi que todavía no tenéis web.${elogio ? '' : ' Se nota que trabajáis bien,'} ayudo a negocios como el vuestro a tener una web sencilla que les traiga clientes. ¿Te cuento en 2 minutos sin compromiso?`
  }
  return `${soy}${elogio} Me fijé en${ref} y creo que podríais sacarle bastante más a vuestra presencia online. Trabajo con negocios como el vuestro para que la web traiga clientes de verdad. ¿Te va bien que te cuente la idea en 2 minutos?`
}

export default {
  key: 'prospector',
  departamento: 'ventas',

  async corre(ctx) {
    const { supabase, clientId } = ctx
    const maximo = Number(ctx.config?.maximo) > 0 ? Number(ctx.config.maximo) : 5

    // Negocios prospectados sin tocar. Se piden más de los que caben: muchos no
    // tendrán teléfono y hay que poder llegar a los que sí.
    const { data: prospectos, error } = await supabase.from('helm_prospects')
      .select('id, nombre, direccion, telefono, telefonos_web, web, categoria, rating, resenas, estado, extra, created_at')
      .eq('client_id', clientId).eq('estado', 'nuevo').order('created_at', { ascending: false }).limit(200)
    if (error) throw error

    // Solo con teléfono (WhatsApp): sin canal no hay propuesta útil, y el correo
    // en frío no se hace (LSSI). Los más calientes primero: reseñas y valoración.
    const telDe = (p) => p.telefono || (Array.isArray(p.telefonos_web) ? p.telefonos_web[0] : '') || ''
    const puntos = (p) => (Number(p.rating) || 0) * 10 + Math.min(Number(p.resenas) || 0, 500) / 10
    const conTelefono = (prospectos || [])
      .filter(p => telDe(p))
      .sort((a, b) => puntos(b) - puntos(a))

    let n = 0
    for (const p of conTelefono.slice(0, maximo)) {
      const a = anguloDe(p)
      const pista = a.clave === 'sin_web' ? 'no tiene web' : a.buenas ? `web y buenas reseñas (${Number(p.rating).toFixed(1)}★)` : 'ya tiene web'
      const r = await ctx.proponer({
        clave: `prospector:${p.id}`,
        titulo: `Primer mensaje a ${p.nombre || 'un negocio'}`,
        porque: `Prospectado${p.categoria ? ` (${recorta(p.categoria, 40)})` : ''}${p.direccion ? ` en ${recorta(p.direccion, 60)}` : ''}: ${pista}. Tú decides si le escribes.`,
        mensaje: primerMensaje(p, String(ctx.config?.remitente || ctx.perfil?.name || '').trim()),
        telefono: telDe(p),
        datos: { prospectId: p.id, angulo: a.clave, rating: p.rating || null, resenas: p.resenas || null },
      })
      if (r && r.creada !== false) n++
    }

    const resumen = conTelefono.length
      ? `${conTelefono.length} negocios prospectados con teléfono; propuse el primer mensaje de ${n}.`
      : 'No hay negocios prospectados nuevos con teléfono.'
    await ctx.log(resumen)
    return { propuestas: n, resumen }
  },
}
