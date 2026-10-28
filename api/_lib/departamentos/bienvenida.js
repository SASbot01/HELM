// HELM — Atención · Bienvenida: dar la bienvenida a quien acaba de comprar.
//
// Qué hace en cada pasada por el perfil:
//   · Busca las VENTAS nuevas (sales) de las últimas 48 h.
//   · Por cada una propone el mensaje de bienvenida ya redactado (qué ha
//     comprado, próximos pasos y, si el perfil tiene un enlace de alta/acceso
//     configurado, lo mete dentro) con el WhatsApp del cliente: lo manda el
//     dueño desde su móvil (sin herramienta: aprobar = darlo por hecho).
//   · Deja preparadas las tareas de arranque del equipo. Son internas y
//     reversibles, así que con autonomia 'interno' se CREAN directas en el
//     tablero de Tareas (crm_tasks); si no, se PROPONEN con la escritura
//     crm_tarea (van a la bandeja con «Aprobar»).
//
// La clave es por venta («bienvenida:<venta>»), así que a nadie se le da la
// bienvenida dos veces aunque la pasada se repita dentro de la ventana.
//
// Datos que usa: sales (id, client_name, client_email, client_phone, product,
// created_at, date) y crm_tasks para las tareas de arranque. No llama a la IA:
// el texto es una plantilla en español.

const DIA = 86_400_000

// El día de Madrid de una fecha, 'YYYY-MM-DD'.
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || ''
// ctx.proponer devuelve la fila (creada), null (ya existía) o { creada:false }.
const seCreo = (r) => Boolean(r) && r.creada !== false

// La lista de tareas de arranque: la del perfil (ctx.config.tareas) o la de por
// defecto. {cliente} se sustituye por el nombre de quien ha comprado.
function tareasDeArranque(config, cliente) {
  const plantillas = Array.isArray(config.tareas) && config.tareas.length
    ? config.tareas
    : ['Dar la bienvenida y enviar los accesos a {cliente}', 'Agendar la llamada de arranque con {cliente}']
  const quien = cliente || 'el nuevo cliente'
  return plantillas
    .map(t => String(t || '').replaceAll('{cliente}', quien).trim().slice(0, 300))
    .filter(Boolean)
}

// Crea una tarea en el tablero si no hay ya una abierta con el mismo título
// (mismo criterio que la escritura crm_tarea de api/_lib/bot/escrituras.js).
async function crearTareaInterna(supabase, clientId, titulo, descripcion) {
  const { data: ya } = await supabase.from('crm_tasks')
    .select('id').eq('client_id', clientId).eq('completed', false).ilike('title', titulo).limit(1)
  if (ya?.length) return false
  await supabase.from('crm_tasks').insert({
    client_id: clientId, title: titulo, description: descripcion || '',
    status: 'todo', priority: 'medium', category: 'general', visibility: 'equipo', checklist: [],
  })
  return true
}

function mensajeBienvenida({ nombre, negocio, producto, pasos, enlace }) {
  const hola = nombre ? `¡Hola ${nombre}!` : '¡Hola!'
  const lineas = [
    `${hola} Gracias por confiar en ${negocio}. Ya tienes ${producto}.`,
    `Próximos pasos: ${pasos}`,
    enlace ? `Aquí tienes tu acceso para empezar: ${enlace}` : '',
    'Cualquier duda, por aquí me tienes. ¡Bienvenido/a! 🙌',
  ]
  return lineas.filter(Boolean).join('\n')
}

export default {
  key: 'bienvenida',
  departamento: 'atencion',

  async corre(ctx) {
    const { supabase, clientId, perfil, hoy, config, autonomia } = ctx
    const corte = new Date(hoy.getTime() - 2 * DIA).toISOString()

    const { data: ventas, error } = await supabase.from('sales')
      .select('id, client_name, client_email, client_phone, product, created_at, date')
      .eq('client_id', clientId)
      .gte('created_at', corte)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    if (!ventas?.length) return { propuestas: 0, resumen: '' }

    // Solo a quien compra por PRIMERA vez: las mensualidades y las cuotas
    // entran como ventas nuevas cada mes y no son un cliente nuevo. Fuera
    // quien ya tenía una venta antes (por correo) y, dentro de la ventana, se
    // queda la primera de cada uno (por correo o teléfono).
    const claveCliente = (v) => String(v.client_email || '').trim().toLowerCase() || String(v.client_phone || '').replace(/\D/g, '')
    const correos = [...new Set(ventas.map(v => String(v.client_email || '').trim().toLowerCase()).filter(Boolean))]
    const yaClientes = new Set()
    if (correos.length) {
      const { data: antes, error: eA } = await supabase.from('sales')
        .select('client_email').eq('client_id', clientId).lt('created_at', corte).in('client_email', correos).limit(1000)
      if (eA) throw eA
      for (const a of antes || []) yaClientes.add(String(a.client_email || '').trim().toLowerCase())
    }
    const vistos = new Set()
    const nuevas = [...ventas].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).filter(v => {
      const k = claveCliente(v)
      if (!k) return true
      if (yaClientes.has(k) || vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    if (!nuevas.length) return { propuestas: 0, resumen: '' }

    const negocio = perfil.name || perfil.slug || 'nosotros'
    const pasos = String(config.pasos || 'te escribo enseguida para ponerte en marcha.').trim()
    // Enlace de alta/acceso del perfil, si lo tiene puesto en su configuración.
    const enlace = String(config.enlace_alta || '').trim() || null
    const interno = autonomia === 'interno'

    let propuestas = 0
    let tareasHechas = 0
    for (const v of nuevas) {
      const nombre = primerNombre(v.client_name)
      const producto = v.product || 'tu compra'
      const mensaje = mensajeBienvenida({ nombre, negocio, producto, pasos, enlace })

      const r = await ctx.proponer({
        clave: `bienvenida:${v.id}`,
        titulo: `Dar la bienvenida a ${v.client_name || v.client_email || 'un nuevo cliente'}`,
        porque: `Ha comprado «${producto}» en las últimas 48 h y aún no se le ha dado la bienvenida.`,
        mensaje,
        telefono: v.client_phone || null,
        datos: { venta: v.id, producto, email: v.client_email || null },
      })
      if (seCreo(r)) propuestas += 1

      // Las tareas de arranque del equipo: directas si es interno, si no a la bandeja.
      for (const titulo of tareasDeArranque(config, v.client_name && primerNombre(v.client_name))) {
        if (interno) {
          if (await crearTareaInterna(supabase, clientId, titulo, `Arranque de ${v.client_name || 'nuevo cliente'} (${producto}).`)) tareasHechas += 1
        } else {
          const t = await ctx.proponer({
            clave: `bienvenida-tarea:${v.id}:${titulo.slice(0, 60)}`,
            titulo: `Tarea de arranque: ${titulo}`,
            porque: `Nueva venta de «${producto}»: dejar lista la tarea de arranque del equipo.`,
            herramienta: 'crm_tarea',
            input: { titulo, descripcion: `Arranque de ${v.client_name || 'nuevo cliente'} (${producto}).`, prioridad: 'media' },
          })
          if (seCreo(t)) propuestas += 1
        }
      }
    }

    const hoyDia = fmtDia.format(hoy)
    ctx.log?.(`bienvenida ${hoyDia}: ${propuestas} propuestas, ${tareasHechas} tareas internas`)
    const resumen = propuestas || tareasHechas
      ? `${propuestas} bienvenida(s) propuestas${tareasHechas ? ` y ${tareasHechas} tarea(s) de arranque creadas` : ''}.`
      : ''
    return { propuestas, resumen }
  },
}
