// HELM — las herramientas que ESCRIBEN del bot de Telegram de la agencia.
//
// Cada una tiene `preparar(args, h)`: valida contra los datos reales y dice en
// una o dos frases qué va a hacer (`resumen`, lo que ve el dueño en la tarjeta
// de Aprobar/Rechazar), sin escribir nada. Al aprobar se vuelve a preparar
// —puede haber cambiado algo entretanto— y, solo si sale lo mismo que se
// aprobó (bot-herramientas.js lo compara), se llama a `aplicar()`. Si no hay
// nada que hacer (ya estaba), `ya` lleva la respuesta y no se escribe. Todo lo
// que se va a escribir sale entero en `resumen`: nada de textos cortados.
//
// Las reglas son las del panel, que hoy viven en el frontend: Ventas.jsx,
// Finanzas.jsx, Enlaces.jsx, Tareas.jsx y crm/pipeline.js; y las de los
// endpoints de agentes (api/agents.js, api/agentes-perfil.js).
import { supabase } from '../../lib/supabase.js'
import { encolaAgente, AGENTES_LANZABLES } from '../equipo.js'
import { masMeses, aISO } from '../renovaciones.js'
import {
  recorta, redondea, falla, fechaDe, UUID, exactoIlike, textoLibre,
  pipelinesDe, pipelineDeContacto, pipelinePorNombre, resolverEtapa, etiquetaDeEtapa, normalizaEtapa, etapaGanada,
  contactoDe, personaDe,
} from './comun.js'
import { importeCuota } from './lecturas.js'

const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0)} €`
const ahora = () => new Date().toISOString()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Lo que el panel ofrece en Ventas → Método de pago.
const METODOS_PAGO = ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'Bizum', 'Efectivo', 'Financiación']
// Finanzas.jsx: el tipo decide la categoría, el signo y si es fijo.
const TIPOS_APUNTE = {
  ingreso: { label: 'Ingreso', category: 'Ingreso', sign: 1, recurring: false },
  gasto_fijo: { label: 'Gasto fijo', category: 'Gasto fijo', sign: -1, recurring: true },
  gasto_puntual: { label: 'Gasto puntual', category: 'Gasto puntual', sign: -1, recurring: false },
  comision: { label: 'Comisión', category: 'Comisión', sign: -1, recurring: false },
}
// Tareas.jsx
const PRIORIDADES = { alta: 'high', media: 'medium', baja: 'low' }
// Enlaces.jsx
const CATEGORIAS_ENLACE = ['General', 'Ventas', 'Marketing', 'Contenido', 'Herramientas', 'Clientes']
const TOPE_IMPORTE = 10_000_000

const importe = (v, campo) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw falla(`${campo}: tiene que ser un importe en euros mayor que 0.`)
  if (n > TOPE_IMPORTE) throw falla(`${campo}: ${euros(n)} no parece un importe real; repítemelo.`)
  return redondea(n)
}
const FECHA = (texto) => ({ type: 'string', description: `"hoy", "ayer", "mañana" o AAAA-MM-DD. ${texto}` })
const CONTACTO = { type: 'string', description: 'El contacto: su id (de crm_buscar), su email o su nombre.' }
const nombreDe = (h) => h.superadmin?.nombre || h.superadmin?.email || 'Telegram'
// Un texto que va a escribirse, entre comillas para la tarjeta; vacío si no hay.
const cita = (t, antes = ' ') => (t ? `${antes}«${t}»` : '')

/** Una nota en el timeline de un contacto (como registrarActividad de pagos.js, pero mirando si se ha guardado). */
async function anotaActividad(clientId, contactId, { title, description, actor, fecha }) {
  const { data, error } = await supabase.from('crm_activities').insert({
    client_id: clientId, contact_id: contactId, type: 'note', title, description, performed_by: actor || '',
    performed_at: fecha ? new Date(fecha).toISOString() : ahora(),
  }).select('id').single()
  if (error) throw error
  return data.id
}

// En una venta o una cuota, la actividad acompaña: si falla, se dice, pero lo hecho vale.
async function actividadDeAcompanamiento(clientId, contactId, datos) {
  try {
    await anotaActividad(clientId, contactId, datos)
    return null
  } catch (e) {
    console.warn('[bot] actividad del CRM:', e?.message || e)
    return 'No se ha podido dejar la nota en la ficha del CRM.'
  }
}

/** La ficha del CRM de un cliente: por su email exacto o, sin email, por su nombre exacto si solo hay una. */
async function fichaDeCliente(clientId, { email, cliente }) {
  const q = supabase.from('crm_contacts').select('id, name, status, pipeline_id').eq('client_id', clientId)
  const { data, error } = email
    ? await q.ilike('email', exactoIlike(email)).limit(1)
    : await q.ilike('name', exactoIlike(cliente)).limit(2)
  if (error) throw error
  return email ? data?.[0] || null : data?.length === 1 ? data[0] : null
}

export const ESCRITURAS = [
  {
    name: 'crm_crear_contacto',
    description: 'Da de alta un contacto (lead) en el CRM de un perfil. No lo duplica: si ya hay uno con ese email (o, sin email, con ese teléfono o ese nombre exacto) lo dice y no crea otro. La etapa se valida contra el pipeline; sin etapa, entra en la primera.',
    perfil: 'si',
    tabla: 'crm_contacts',
    properties: {
      nombre: { type: 'string', description: 'Nombre y apellidos.' },
      email: { type: 'string' },
      telefono: { type: 'string' },
      instagram: { type: 'string', description: 'Su @ de Instagram.' },
      etapa: { type: 'string', description: 'Etapa del pipeline, como la diga el dueño. Por defecto, la primera.' },
      pipeline: { type: 'string', description: 'Solo si el perfil tiene varios pipelines y no es el principal: su nombre.' },
      notas: { type: 'string', maxLength: 2500 },
    },
    required: ['nombre'],
    async preparar(a, h) {
      const id = h.p.id
      const nombre = String(a.nombre).trim().slice(0, 200)
      const email = a.email ? String(a.email).trim().toLowerCase() : ''
      if (email && !EMAIL.test(email)) throw falla(`email: «${a.email}» no es un email válido.`)
      const telefono = a.telefono ? String(a.telefono).trim().slice(0, 60) : ''
      const instagram = a.instagram ? String(a.instagram).trim().slice(0, 100) : ''
      const notas = textoLibre(a.notas, 'notas')
      const pipelines = await pipelinesDe(id)
      const pl = pipelinePorNombre(pipelines, a.pipeline)
      let etapa = pl.stages[0]
      if (a.etapa) {
        const r = resolverEtapa(a.etapa, pl.stages)
        if (r.error) throw falla(`${r.error} Las de «${pl.name}»: ${r.opciones.join(', ')}.`)
        etapa = r.etapa
      }

      // El mismo criterio que buscarOCrearContacto: la misma persona no puede
      // acabar como dos leads.
      let q = supabase.from('crm_contacts').select('id, name, email, phone, status, pipeline_id').eq('client_id', id)
      q = email ? q.ilike('email', exactoIlike(email)) : telefono ? q.eq('phone', telefono) : q.ilike('name', exactoIlike(nombre))
      const { data: ya, error } = await q.limit(1)
      if (error) throw error
      if (ya?.length) {
        const c = ya[0]
        const hecho = `Ya existe en el CRM de ${h.p.name}: ${c.name}${c.email ? ` <${c.email}>` : ''}, en «${etiquetaDeEtapa(c.status, pipelineDeContacto(c, pipelines).stages)}». No se crea otro.${email || telefono ? '' : ' Si es otra persona, pásame su email o su teléfono.'}`
        return { resumen: hecho, ya: { ya_estaba: true, id: c.id, hecho } }
      }

      const fila = {
        client_id: id, name: nombre, email, phone: telefono, instagram,
        status: etapa.key, substages: [], pipeline_id: pl.id, source: 'Telegram', notes: notas,
      }
      const donde = `«${etapa.label}»${pipelines.length > 1 ? ` del pipeline «${pl.name}»` : ''}`
      return {
        resumen: `Crear en el CRM de ${h.p.name} a ${nombre}${email ? ` <${email}>` : ''}${telefono ? ` (${telefono})` : ''}${instagram ? `, Instagram ${instagram}` : ''} en ${donde}.${notas ? `\nNotas:${cita(notas)}` : ''}`,
        async aplicar() {
          const { data, error: e } = await supabase.from('crm_contacts').insert(fila).select('id, name').single()
          if (e) throw e
          return { id: data.id, hecho: `${data.name} dado de alta en el CRM de ${h.p.name}, en ${donde}.`, recurso: data.id }
        },
      }
    },
  },

  {
    name: 'crm_mover_etapa',
    description: 'Mueve un contacto del CRM a otra etapa de SU pipeline (la etapa se valida contra ese pipeline; las subetapas se vacían, como en el panel).',
    perfil: 'si',
    tabla: 'crm_contacts',
    properties: {
      contacto: CONTACTO,
      etapa: { type: 'string', description: 'La etapa de destino, como la diga el dueño («cita agendada», «ganado»).' },
    },
    required: ['contacto', 'etapa'],
    async preparar(a, h) {
      const c = await contactoDe(h.p.id, a.contacto, { columnas: 'id, name, email, status, pipeline_id' })
      const pipelines = await pipelinesDe(h.p.id)
      const pl = pipelineDeContacto(c, pipelines)
      const r = resolverEtapa(a.etapa, pl.stages)
      if (r.error) throw falla(`${r.error} Las de «${pl.name}» (el pipeline de ${c.name}): ${r.opciones.join(', ')}.`)
      const antes = etiquetaDeEtapa(c.status, pl.stages)
      if (normalizaEtapa(c.status, pl.stages) === r.etapa.key) {
        const hecho = `${c.name} ya está en «${antes}».`
        return { resumen: hecho, ya: { ya_estaba: true, id: c.id, hecho } }
      }
      return {
        resumen: `Mover a ${c.name}${c.email ? ` <${c.email}>` : ''} de «${antes}» a «${r.etapa.label}»${pipelines.length > 1 ? ` (pipeline «${pl.name}»)` : ''} en ${h.p.name}.`,
        async aplicar() {
          const { data, error } = await supabase.from('crm_contacts')
            .update({ status: r.etapa.key, substages: [], updated_at: ahora() })
            .eq('id', c.id).eq('client_id', h.p.id).select('id')
          if (error) throw error
          if (!data?.length) throw falla('Ese contacto ya no existe.')
          return { id: c.id, hecho: `${c.name} pasa de «${antes}» a «${r.etapa.label}».`, recurso: c.id }
        },
      }
    },
  },

  {
    name: 'crm_nota',
    description: 'Deja una nota en la ficha (el timeline) de un contacto del CRM.',
    perfil: 'si',
    tabla: 'crm_activities',
    properties: {
      contacto: CONTACTO,
      texto: { type: 'string', maxLength: 2500, description: 'La nota, tal cual (hasta 2500 caracteres).' },
      titulo: { type: 'string', maxLength: 200, description: 'Opcional: un título corto.' },
    },
    required: ['contacto', 'texto'],
    async preparar(a, h) {
      const c = await contactoDe(h.p.id, a.contacto, { columnas: 'id, name, email' })
      const texto = textoLibre(a.texto, 'texto')
      if (!texto) throw falla('La nota está vacía.')
      const titulo = textoLibre(a.titulo, 'titulo', { max: 200 }) || 'Nota desde Telegram'
      return {
        resumen: `Añadir a la ficha de ${c.name} (${h.p.name}) la nota «${titulo}»:\n«${texto}»`,
        async aplicar() {
          const fecha = ahora()
          const nota = await anotaActividad(h.p.id, c.id, { title: titulo, description: texto, actor: nombreDe(h), fecha })
          const { error } = await supabase.from('crm_contacts').update({ last_activity_at: fecha }).eq('id', c.id).eq('client_id', h.p.id)
          if (error) console.warn('[bot] crm_nota: no se pudo actualizar la última actividad —', error.message)
          return { id: c.id, hecho: `Nota guardada en la ficha de ${c.name}.`, recurso: nota }
        },
      }
    },
  },

  {
    name: 'crm_tarea',
    description: 'Crea una tarea en el tablero de Tareas de un perfil, opcionalmente ligada a un contacto y con responsable del equipo. No duplica una tarea abierta con el mismo título.',
    perfil: 'si',
    tabla: 'crm_tasks',
    properties: {
      titulo: { type: 'string' },
      descripcion: { type: 'string', maxLength: 2500 },
      vence: FECHA('Cuándo vence. Opcional.'),
      prioridad: { type: 'string', enum: Object.keys(PRIORIDADES), description: 'Por defecto, media.' },
      contacto: { ...CONTACTO, description: `${CONTACTO.description} Opcional.` },
      responsable: { type: 'string', description: 'Nombre de una persona del equipo (ver "equipo"). Opcional.' },
    },
    required: ['titulo'],
    async preparar(a, h) {
      const id = h.p.id
      const titulo = String(a.titulo).trim().slice(0, 300)
      const descripcion = textoLibre(a.descripcion, 'descripcion')
      const vence = a.vence ? fechaDe(a.vence, { campo: 'vence', hoy: h.hoy, atras: 30 }) : null
      const c = a.contacto ? await contactoDe(id, a.contacto, { columnas: 'id, name' }) : null
      const resp = a.responsable ? (await personaDe(id, a.responsable)).persona : null
      const { data: ya, error } = await supabase.from('crm_tasks').select('id, title')
        .eq('client_id', id).eq('completed', false).ilike('title', exactoIlike(titulo)).limit(1)
      if (error) throw error
      if (ya?.length) {
        const hecho = `Ya hay una tarea abierta «${ya[0].title}» en ${h.p.name}; no se duplica.`
        return { resumen: hecho, ya: { ya_estaba: true, id: ya[0].id, hecho } }
      }
      const prioridad = a.prioridad || 'media'
      const extra = [vence && `vence ${vence}`, `prioridad ${prioridad}`, c && `con ${c.name}`, resp && `para ${resp.name}`].filter(Boolean).join(', ')
      return {
        resumen: `Crear en Tareas de ${h.p.name}: «${titulo}» (${extra}).${descripcion ? `\nDescripción:${cita(descripcion)}` : ''}`,
        async aplicar() {
          const { data, error: e } = await supabase.from('crm_tasks').insert({
            client_id: id, title: titulo, description: descripcion,
            due_date: vence ? `${vence}T12:00:00Z` : null, priority: PRIORIDADES[prioridad], status: 'todo',
            category: 'general', visibility: 'equipo', checklist: [], contact_id: c?.id || null, assignee_helm_id: resp?.id || null,
          }).select('id').single()
          if (e) throw e
          return { id: data.id, hecho: `Tarea «${titulo}» creada en ${h.p.name} (${extra}).`, recurso: data.id }
        },
      }
    },
  },

  {
    name: 'registrar_venta',
    description: 'Registra una venta en un perfil, como el formulario de Ventas: pago único o fraccionado en cuotas. Deja al cliente como ganado en el CRM (lo crea si no existe y tiene email) con una actividad en su ficha. En pago único, si no se dice lo cobrado, se da por cobrado entero; en fraccionado, lo cobrado son las cuotas ya pagadas. No duplica la misma venta (mismo cliente, producto, importe y fecha).',
    perfil: 'si',
    tabla: 'sales',
    properties: {
      cliente: { type: 'string', description: 'Nombre del cliente.' },
      email: { type: 'string', description: 'Email del cliente: con él se enlaza (o se crea) su ficha del CRM.' },
      telefono: { type: 'string' },
      producto: { type: 'string', description: 'Qué ha comprado (servicio, programa…).' },
      importe: { type: 'number', description: 'Lo facturado en total, en euros.' },
      cobrado: { type: 'number', minimum: 0, description: 'Lo cobrado ya, en euros. Ver la descripción para el valor por defecto.' },
      fecha: FECHA('Día de la venta; hoy o antes. Por defecto, hoy.'),
      metodo_pago: { type: 'string', enum: METODOS_PAGO },
      fraccionado: { type: 'boolean', description: 'true si se paga a plazos (cuotas mensuales).' },
      cuotas: { type: 'integer', minimum: 2, maximum: 60, description: 'Número de cuotas del fraccionado (2 o más).' },
      cuotas_cobradas: { type: 'integer', minimum: 0, maximum: 60, description: 'Cuotas ya cobradas. Por defecto, las que cubra "cobrado" (o 0).' },
      importe_cuota: { type: 'number', description: 'Importe de cada cuota. Por defecto, importe ÷ cuotas.' },
      inicio_plan: FECHA('Día de la primera cuota. Por defecto, el de la venta.'),
      closer: { type: 'string' },
      setter: { type: 'string' },
      csm: { type: 'string' },
      notas: { type: 'string', maxLength: 2500 },
    },
    required: ['cliente', 'producto', 'importe'],
    async preparar(a, h) {
      const id = h.p.id
      const cliente = String(a.cliente).trim().slice(0, 200)
      const producto = String(a.producto).trim().slice(0, 200)
      if (!cliente) throw falla('Falta el cliente.')
      const total = importe(a.importe, 'importe')
      const fecha = a.fecha ? fechaDe(a.fecha, { campo: 'fecha', hoy: h.hoy, atras: 1100, adelante: 0 }) : h.hoy
      const email = a.email ? String(a.email).trim().toLowerCase() : ''
      if (email && !EMAIL.test(email)) throw falla(`email: «${a.email}» no es un email válido.`)
      const metodo = a.metodo_pago || 'Transferencia'
      const telefono = a.telefono ? String(a.telefono).trim().slice(0, 60) : ''
      const notas = textoLibre(a.notas, 'notas')
      const [closer, setter, csm] = [a.closer, a.setter, a.csm].map(x => (x ? String(x).trim().slice(0, 100) : null))
      const frac = a.fraccionado === false ? false : Boolean(a.fraccionado || a.cuotas)

      let plan = null
      let cobrado
      if (frac) {
        const n = Number(a.cuotas)
        if (!n || n < 2) throw falla('Un plan fraccionado tiene 2 cuotas o más: dime cuántas.')
        const cuota = a.importe_cuota != null ? importe(a.importe_cuota, 'importe_cuota') : redondea(total / n)
        let pagadas = a.cuotas_cobradas
        if (pagadas == null) pagadas = a.cobrado != null ? Math.min(n, Math.round(Number(a.cobrado) / cuota)) : 0
        if (pagadas > n) throw falla('No puede haber más cuotas cobradas que totales.')
        cobrado = a.cobrado != null ? redondea(a.cobrado) : redondea(Math.min(total, pagadas * cuota))
        const inicio = a.inicio_plan ? fechaDe(a.inicio_plan, { campo: 'inicio_plan', hoy: h.hoy, atras: 1100 }) : fecha
        plan = { n, cuota, pagadas, inicio, fin: aISO(masMeses(new Date(`${inicio}T00:00:00Z`), n - 1)) }
      } else {
        cobrado = a.cobrado != null ? redondea(a.cobrado) : total
      }
      if (cobrado < 0) throw falla('cobrado: no puede ser negativo.')
      if (cobrado > total + 0.01) throw falla(`El cobrado (${euros(cobrado)}) no puede superar al facturado (${euros(total)}).`)

      // La misma venta dos veces (el dueño repite el mensaje): no se duplica.
      const { data: repe, error } = await supabase.from('sales').select('id')
        .eq('client_id', id).eq('date', fecha).eq('revenue', total).eq('source', 'telegram')
        .ilike('client_name', exactoIlike(cliente)).ilike('product', exactoIlike(producto)).limit(1)
      if (error) throw error
      if (repe?.length) {
        const hecho = `Esa venta ya estaba registrada (${cliente} · ${producto} · ${euros(total)} · ${fecha}); no se duplica.`
        return { resumen: hecho, ya: { ya_estaba: true, id: repe[0].id, hecho } }
      }

      // Su ficha del CRM: por email, y si no hay email, por el nombre exacto.
      const ficha = await fichaDeCliente(id, { email, cliente })
      const crm = ficha ? `su ficha del CRM (${ficha.name}) pasa a ganado` : email ? 'se crea su ficha en el CRM como ganado' : 'sin ficha en el CRM (no hay email ni un contacto con ese nombre)'
      const cobro = plan
        ? `fraccionado en ${plan.n} cuotas de ${euros(plan.cuota)} desde ${plan.inicio}, ${plan.pagadas} cobradas (${euros(cobrado)})`
        : `pago único, cobrado ${euros(cobrado)}`

      const fila = {
        client_id: id, date: fecha, client_name: cliente, client_email: email, client_phone: telefono,
        product: producto, revenue: total, cash_collected: cobrado, payment_method: metodo,
        payment_type: plan ? 'Fraccionado' : 'Pago único',
        installments_total: plan ? plan.n : null, installments_paid: plan ? plan.pagadas : 0, installment_amount: plan ? plan.cuota : null,
        plan_start: plan ? plan.inicio : null, plan_end: plan ? plan.fin : null,
        closer, setter, csm,
        status: 'won', source: 'telegram', notes: notas || 'Registrada desde Telegram',
      }
      const equipo = [closer && `closer ${closer}`, setter && `setter ${setter}`, csm && `CSM ${csm}`].filter(Boolean).join(', ')
      return {
        resumen: `Registrar en Ventas de ${h.p.name}: ${cliente}${email ? ` <${email}>` : ''} · ${producto} · ${euros(total)} el ${fecha} por ${metodo}, ${cobro}.${equipo ? ` Con ${equipo}.` : ''} Además, ${crm}.${notas ? `\nNotas:${cita(notas)}` : ''}`,
        async aplicar() {
          // Se vuelve a buscar (puede haber entrado entretanto) y, si no está,
          // se crea en la etapa ganada de SU pipeline, el de por defecto.
          let contacto = ficha || (email ? await fichaDeCliente(id, { email }) : null)
          let pipelines = null
          if (!contacto && email) {
            pipelines = await pipelinesDe(id)
            const pl = pipelines.find(p => p.isDefault) || pipelines[0]
            const { data: nuevo, error: e0 } = await supabase.from('crm_contacts').insert({
              client_id: id, name: cliente, email, phone: telefono, status: etapaGanada(pl.stages), substages: [],
              pipeline_id: pl.id, source: 'Telegram', deal_value: total,
            }).select('id, name, status, pipeline_id').single()
            if (e0) throw e0
            contacto = nuevo
          }
          const { data: venta, error: e } = await supabase.from('sales').insert({ ...fila, contact_id: contacto?.id || null }).select('id').single()
          if (e) throw e
          const avisos = []
          if (contacto) {
            pipelines ||= await pipelinesDe(id)
            const pl = pipelineDeContacto(contacto, pipelines)
            const { error: e2 } = await supabase.from('crm_contacts')
              .update({ status: etapaGanada(pl.stages), deal_value: total, updated_at: ahora() }).eq('id', contacto.id).eq('client_id', id)
            if (e2) {
              console.warn('[bot] registrar_venta: no se pudo marcar el contacto como ganado —', e2.message)
              avisos.push(`No se ha podido marcar a ${contacto.name} como ganado en el CRM.`)
            }
            const aviso = await actividadDeAcompanamiento(id, contacto.id, {
              title: `Venta: ${producto}`, description: `${euros(total)}, ${cobro}. Registrada desde Telegram.`, actor: nombreDe(h),
            })
            if (aviso) avisos.push(aviso)
          }
          return {
            id: venta.id, hecho: `Venta registrada en ${h.p.name}: ${cliente} · ${producto} · ${euros(total)} (${cobro}).`,
            ...(avisos.length ? { aviso: avisos.join(' ') } : {}), recurso: venta.id,
          }
        },
      }
    },
  },

  {
    name: 'registrar_cuota',
    description: 'Apunta una cuota cobrada de un plan fraccionado: suma una cuota a las cobradas (sin pasarse del total), suma su importe a lo cobrado de la venta y deja un Ingreso en Finanzas. Una por venta y mes: repetirla el mismo mes no la duplica. Mira antes la venta con cobros_pendientes: "cuota" es la que toca ahora.',
    perfil: 'si',
    tabla: 'sales',
    properties: {
      venta: { type: 'string', description: 'El id de la venta (venta_id de cobros_pendientes).' },
      cliente: { type: 'string', description: 'Sin id: el nombre del cliente, si solo tiene un plan con cuotas pendientes.' },
      cuota: { type: 'integer', minimum: 1, maximum: 60, description: 'El número de la cuota que se cobra: la siguiente a las ya cobradas (en cobros_pendientes, «1/3» → 2). Si la venta ya no va por ahí, no se apunta.' },
      importe: { type: 'number', description: 'Lo cobrado en esta cuota. Por defecto, el importe de la cuota (en la última, lo que falte).' },
      fecha: FECHA('Día del cobro; hoy o antes. Por defecto, hoy. Decide el mes de la cuota.'),
    },
    required: ['cuota'],
    async preparar(a, h) {
      const id = h.p.id
      const columnas = 'id, date, client_name, client_email, product, revenue, cash_collected, status, installments_total, installments_paid, installment_amount, plan_start, contact_id'
      let v
      if (a.venta) {
        if (!UUID.test(a.venta)) throw falla(`venta: «${a.venta}» no es un id de venta. Míralo con cobros_pendientes.`)
        const { data, error } = await supabase.from('sales').select(columnas).eq('id', a.venta).eq('client_id', id).maybeSingle()
        if (error) throw error
        if (!data) throw falla(`No hay ninguna venta con id ${a.venta} en ${h.p.name}.`)
        v = data
      } else if (a.cliente) {
        const { data, error } = await supabase.from('sales').select(columnas)
          .eq('client_id', id).not('installments_total', 'is', null).ilike('client_name', `%${exactoIlike(String(a.cliente).trim())}%`).limit(20)
        if (error) throw error
        const vivos = (data || []).filter(x => String(x.status || '').toLowerCase() !== 'cancelada' && (Number(x.installments_paid) || 0) < (Number(x.installments_total) || 0))
        if (!vivos.length) throw falla(`${a.cliente} no tiene ningún plan fraccionado con cuotas pendientes en ${h.p.name}.`)
        if (vivos.length > 1) throw falla(`${a.cliente} tiene varios planes con cuotas pendientes: ${vivos.map(x => `${x.product || 'sin producto'} ${x.installments_paid || 0}/${x.installments_total} (venta ${x.id})`).join('; ')}. Dime cuál.`)
        v = vivos[0]
      } else throw falla('Dime de qué venta (su id, de cobros_pendientes) o de qué cliente.')

      if (String(v.status || '').toLowerCase() === 'cancelada') throw falla('Esa venta está cancelada.')
      const total = Number(v.installments_total) || 0
      const pagadas = Number(v.installments_paid) || 0
      if (total < 2) throw falla(`La venta de ${v.client_name} no es un plan fraccionado.`)
      if (pagadas >= total) throw falla(`La venta de ${v.client_name} ya tiene todas sus cuotas cobradas (${pagadas}/${total}).`)

      const fecha = a.fecha ? fechaDe(a.fecha, { campo: 'fecha', hoy: h.hoy, atras: 370, adelante: 0 }) : h.hoy
      const mes = fecha.slice(0, 7)
      const nota = `telegram:${v.id}:${mes}`
      const { data: ya, error } = await supabase.from('ceo_finance_entries').select('id').eq('client_id', id).eq('notes', nota).limit(1)
      if (error) throw error
      if (ya?.length) {
        const hecho = `La cuota de ${mes} de ${v.client_name} (${v.product || 'su plan'}) ya estaba apuntada; no se duplica.`
        return { resumen: hecho, ya: { ya_estaba: true, id: v.id, hecho } }
      }
      // La cuota que se pidió (y se aprobó) es la que se apunta: si entretanto
      // alguien ha apuntado otra, esta ya no es la que toca.
      if (Number(a.cuota) !== pagadas + 1) {
        throw falla(`La venta de ${v.client_name} (${v.product || 'sin producto'}) lleva ${pagadas}/${total} cuotas cobradas: la siguiente es la ${pagadas + 1}, no la ${a.cuota}. Mírala con cobros_pendientes.`)
      }

      const facturado = Number(v.revenue) || 0
      const cobradoAntes = Number(v.cash_collected) || 0
      const falta = redondea(facturado - cobradoAntes)
      if (falta <= 0) throw falla(`La venta de ${v.client_name} ya está cobrada entera (${euros(cobradoAntes)} de ${euros(facturado)}).`)
      const ultima = pagadas + 1 === total
      const cuanto = a.importe != null ? importe(a.importe, 'importe') : ultima ? falta : Math.min(importeCuota(v), falta)
      if (cuanto > falta + 0.01) throw falla(`${euros(cuanto)} se pasa de lo que queda por cobrar de esa venta (${euros(falta)}).`)
      const despues = redondea(cobradoAntes + cuanto)
      const n = pagadas + 1

      return {
        resumen: `Apuntar en ${h.p.name} la cuota ${n}/${total} de ${v.client_name} (${v.product || 'sin producto'}): ${euros(cuanto)} el ${fecha}. La venta pasa a ${euros(despues)} cobrados de ${euros(facturado)} y se apunta un Ingreso en Finanzas.`,
        async aplicar() {
          // Solo si nadie ha sumado otra cuota entretanto: nunca se pasa del total.
          const { data: hecha, error: e1 } = await supabase.from('sales')
            .update({ installments_paid: n, cash_collected: despues })
            .eq('id', v.id).eq('client_id', id).eq('installments_paid', pagadas).select('id')
          if (e1) throw e1
          if (!hecha?.length) throw falla('Esa venta ha cambiado mientras tanto; vuelve a mirarla con cobros_pendientes.')
          const { error: e2 } = await supabase.from('ceo_finance_entries').insert({
            client_id: id, date: fecha, category: 'Ingreso', amount: cuanto, recurring: false, notes: nota,
            description: `Cuota ${n}/${total} · ${v.client_name}${v.product ? ` · ${v.product}` : ''}`,
            contact_ids: v.contact_id ? [v.contact_id] : [],
          })
          if (e2) {
            // Se deshace solo si nadie la ha tocado después; si no, se dice.
            const { data: deshecha, error: e3 } = await supabase.from('sales')
              .update({ installments_paid: pagadas, cash_collected: cobradoAntes })
              .eq('id', v.id).eq('client_id', id).eq('installments_paid', n).select('id')
            const ok = !e3 && deshecha?.length
            throw new Error(`No se ha podido apuntar el Ingreso en Finanzas (${e2.message || e2}). ${ok
              ? 'La venta se ha dejado como estaba; no se ha apuntado nada.'
              : `La venta NO se ha podido dejar como estaba: queda con la cuota ${n}/${total} cobrada y sin el Ingreso. Revísala a mano en Ventas.`}`)
          }
          const aviso = v.contact_id
            ? await actividadDeAcompanamiento(id, v.contact_id, {
              title: `Cuota ${n}/${total} cobrada`, description: `${euros(cuanto)} de ${v.product || 'su plan'}. Apuntada desde Telegram.`, actor: nombreDe(h), fecha,
            })
            : null
          return {
            id: v.id, cuotas: `${n}/${total}`, cobrado: despues,
            hecho: `Cuota ${n}/${total} de ${v.client_name} apuntada: ${euros(cuanto)}. Lleva ${euros(despues)} de ${euros(facturado)}.`,
            ...(aviso ? { aviso } : {}), recurso: v.id,
          }
        },
      }
    },
  },

  {
    name: 'finanzas_apunte',
    description: 'Apunta un movimiento en Finanzas de un perfil, como el panel: ingreso, gasto fijo (se repite cada mes), gasto puntual o comisión. El importe va siempre en positivo: el tipo decide si suma o resta. Una comisión necesita a quién se le paga si el perfil tiene equipo. No duplica el mismo apunte hecho hace unos minutos.',
    perfil: 'si',
    tabla: 'ceo_finance_entries',
    properties: {
      tipo: { type: 'string', enum: Object.keys(TIPOS_APUNTE) },
      importe: { type: 'number', description: 'En euros, en positivo.' },
      concepto: { type: 'string', description: 'Nómina, software, comisión de julio…' },
      descripcion: { type: 'string', maxLength: 2500 },
      fecha: FECHA('Por defecto, hoy.'),
      persona: { type: 'string', description: 'Persona del equipo a la que va (obligatoria en comisiones si hay equipo).' },
    },
    required: ['tipo', 'importe'],
    async preparar(a, h) {
      const id = h.p.id
      const tipo = TIPOS_APUNTE[a.tipo]
      const cuanto = importe(a.importe, 'importe')
      const fecha = a.fecha ? fechaDe(a.fecha, { campo: 'fecha', hoy: h.hoy }) : h.hoy
      let persona = null
      if (a.persona) persona = (await personaDe(id, a.persona)).persona
      else if (a.tipo === 'comision') {
        const { data, error } = await supabase.from('helm_team').select('id, name, active').eq('client_id', id)
        if (error) throw error
        const activas = (data || []).filter(p => p.active !== false)
        if (activas.length) throw falla(`Una comisión necesita a quién se le paga: ${activas.map(p => p.name).join(', ')}.`)
      }
      const descripcion = textoLibre([a.concepto, a.descripcion].map(x => String(x || '').trim()).filter(Boolean).join(' · '), 'concepto y descripción')
      const amount = redondea(cuanto * tipo.sign)

      const { data: ya, error } = await supabase.from('ceo_finance_entries').select('id')
        .eq('client_id', id).eq('date', fecha).eq('category', tipo.category).eq('amount', amount).eq('description', descripcion)
        .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).limit(1)
      if (error) throw error
      if (ya?.length) {
        const hecho = `Ese apunte (${tipo.label} de ${euros(cuanto)} del ${fecha}) se acaba de hacer; no se duplica.`
        return { resumen: hecho, ya: { ya_estaba: true, id: ya[0].id, hecho } }
      }
      return {
        resumen: `Apuntar en Finanzas de ${h.p.name}: ${tipo.label} de ${euros(cuanto)} con fecha ${fecha}${persona ? `, para ${persona.name}` : ''}${tipo.recurring ? '. Cuenta como gasto fijo mensual' : ''}.${descripcion ? `\nConcepto:${cita(descripcion)}` : ''}`,
        async aplicar() {
          const { data, error: e } = await supabase.from('ceo_finance_entries').insert({
            client_id: id, date: fecha, category: tipo.category, description: descripcion, amount, recurring: tipo.recurring,
            person_id: persona?.id || null, person_name: persona?.name || '', person_role: persona?.role || '', contact_ids: [],
          }).select('id').single()
          if (e) throw e
          return { id: data.id, hecho: `${tipo.label} de ${euros(cuanto)} apuntado en Finanzas de ${h.p.name}.`, recurso: data.id }
        },
      }
    },
  },

  {
    name: 'aprobar_guion',
    description: 'Aprueba o descarta un guion que el guionista dejó en BORRADOR (los ids salen en agentes_estado → borradores o en calendario). Aprobar lo deja en el calendario; descartar lo borra. Solo toca guiones en borrador.',
    perfil: 'si',
    tabla: 'helm_content_calendar',
    properties: {
      guion_id: { type: 'string', description: 'El id del guion.' },
      accion: { type: 'string', enum: ['aprobar', 'descartar'] },
    },
    required: ['guion_id', 'accion'],
    async preparar(a, h) {
      if (!UUID.test(a.guion_id)) throw falla(`guion_id: «${a.guion_id}» no es un id de guion. Míralo con agentes_estado o calendario.`)
      const { data: g, error } = await supabase.from('helm_content_calendar')
        .select('id, date, title, revision').eq('id', a.guion_id).eq('client_id', h.p.id).maybeSingle()
      if (error) throw error
      if (!g) throw falla(`No hay ningún guion con id ${a.guion_id} en ${h.p.name}.`)
      if (g.revision !== 'borrador') throw falla(`«${g.title}» ya no está en borrador (está ${g.revision || 'aprobado'}).`)
      const aprobar = a.accion === 'aprobar'
      return {
        resumen: aprobar
          ? `Aprobar el borrador «${recorta(g.title, 120)}» (${g.date}) de ${h.p.name}: queda en el calendario como aprobado.`
          : `Descartar el borrador «${recorta(g.title, 120)}» (${g.date}) de ${h.p.name}: se borra del calendario.`,
        async aplicar() {
          const q = aprobar
            ? supabase.from('helm_content_calendar').update({ revision: 'aprobado', updated_at: ahora() })
            : supabase.from('helm_content_calendar').delete()
          const { data, error: e } = await q.eq('id', g.id).eq('client_id', h.p.id).eq('revision', 'borrador').select('id')
          if (e) throw e
          if (!data?.length) throw falla('Ese borrador ya no existe.')
          return { id: g.id, hecho: `«${g.title}» ${aprobar ? 'aprobado' : 'descartado'}.`, recurso: g.id }
        },
      }
    },
  },

  {
    name: 'marcar_grabado',
    description: 'Marca un guion del calendario como grabado (o lo desmarca). Solo eso: no mira Drive ni mueve vídeos. Lo mismo que el botón «Grabado» del panel.',
    perfil: 'si',
    tabla: 'helm_content_calendar',
    properties: {
      guion_id: { type: 'string', description: 'El id del guion (de calendario o resumen_perfil).' },
      grabado: { type: 'boolean', description: 'false para desmarcarlo. Por defecto, true.' },
    },
    required: ['guion_id'],
    async preparar(a, h) {
      if (!UUID.test(a.guion_id)) throw falla(`guion_id: «${a.guion_id}» no es un id de guion. Míralo con calendario.`)
      const id = h.p.id
      const { data: g, error } = await supabase.from('helm_content_calendar')
        .select('id, date, title, grabado, grabado_at, drive_carpeta_id').eq('id', a.guion_id).eq('client_id', id).maybeSingle()
      if (error) throw error
      if (!g) throw falla(`No hay ningún guion con id ${a.guion_id} en ${h.p.name}.`)
      const desmarcar = a.grabado === false
      if (desmarcar && !g.grabado) {
        const hecho = `«${g.title}» no estaba marcado como grabado.`
        return { resumen: hecho, ya: { ya_estaba: true, id: g.id, hecho } }
      }
      return {
        resumen: desmarcar
          ? `Desmarcar como grabado «${recorta(g.title, 120)}» (${g.date}) en ${h.p.name}.`
          : `Marcar como grabado «${recorta(g.title, 120)}» (${g.date}) en ${h.p.name}.`,
        // Como api/agentes-perfil.js (acción 'grabar').
        async aplicar() {
          const patch = desmarcar
            ? { grabado: false, grabado_at: null, updated_at: ahora() }
            : { grabado: true, grabado_at: g.grabado_at || ahora(), updated_at: ahora() }
          const { error: e } = await supabase.from('helm_content_calendar').update(patch).eq('id', g.id).eq('client_id', id)
          if (e) throw e
          return {
            id: g.id, grabado: !desmarcar,
            ...(g.drive_carpeta_id ? { drive: `https://drive.google.com/drive/folders/${g.drive_carpeta_id}` } : {}),
            hecho: desmarcar ? `«${g.title}» ya no figura como grabado.` : `«${g.title}» marcado como grabado.`,
            recurso: g.id,
          }
        },
      }
    },
  },

  {
    name: 'lanzar_agente',
    description: `Lanza ahora un agente del equipo de IA de un perfil, sin esperar a su horario. Gasta tokens. No se lanza si ese agente ya está en cola o trabajando. Agentes: ${AGENTES_LANZABLES.join(', ')}.`,
    perfil: 'si',
    tabla: 'agent_jobs',
    properties: {
      agente: { type: 'string', enum: AGENTES_LANZABLES },
      encargo: { type: 'string', maxLength: 500, description: 'Opcional: qué quieres que haga esta vez, en una frase (hasta 500 caracteres).' },
    },
    required: ['agente'],
    async preparar(a, h) {
      const id = h.p.id
      const { data: ya, error } = await supabase.from('agent_jobs').select('id').eq('tipo', 'equipo')
        .in('estado', ['pendiente', 'corriendo']).eq('payload->>clientId', id).eq('payload->>agente', a.agente).limit(1)
      if (error) throw error
      if (ya?.length) throw falla(`El ${a.agente} de ${h.p.name} ya está en cola o trabajando.`)
      const encargo = textoLibre(a.encargo, 'encargo', { max: 500 })
      return {
        resumen: `Lanzar ahora al agente «${a.agente}» de ${h.p.name}. Gasta tokens de IA.${encargo ? `\nEncargo:${cita(encargo)}` : ''}`,
        async aplicar() {
          const clave = `equipo:${a.agente}:${id}:telegram:${Date.now()}`
          await encolaAgente({ clientId: id, agente: a.agente, origen: 'telegram', encargo, clave })
          return { agente: a.agente, hecho: `El ${a.agente} de ${h.p.name} está en cola; lo verás en agentes_estado.`, recurso: clave }
        },
      }
    },
  },

  {
    name: 'equipo_pausar',
    description: 'Pausa (activo=false) o reanuda (activo=true) el equipo de agentes de IA de un perfil: en pausa no corren solos (el director de cada mañana y lo programado); a mano se pueden seguir lanzando.',
    perfil: 'si',
    tabla: 'agent_perfiles',
    properties: {
      activo: { type: 'boolean', description: 'false para pausar, true para reanudar.' },
    },
    required: ['activo'],
    async preparar(a, h) {
      const id = h.p.id
      const { data: cfg, error } = await supabase.from('agent_perfiles').select('activo').eq('client_id', id).maybeSingle()
      if (error) throw error
      if (cfg && Boolean(cfg.activo) === a.activo) {
        const hecho = `El equipo de agentes de ${h.p.name} ya estaba ${a.activo ? 'activo' : 'en pausa'}.`
        return { resumen: hecho, ya: { ya_estaba: true, hecho } }
      }
      return {
        resumen: a.activo
          ? `Reanudar el equipo de agentes de ${h.p.name}: vuelven a correr solos cada mañana (gastan tokens).`
          : `Pausar el equipo de agentes de ${h.p.name}: dejan de correr solos hasta que lo reanudes.`,
        async aplicar() {
          const { error: e } = await supabase.from('agent_perfiles').upsert({ client_id: id, activo: a.activo, updated_at: ahora() }, { onConflict: 'client_id' })
          if (e) throw e
          return { activo: a.activo, hecho: `Equipo de agentes de ${h.p.name} ${a.activo ? 'reanudado' : 'en pausa'}.`, recurso: id }
        },
      }
    },
  },

  {
    name: 'notificaciones_leidas',
    description: 'Marca como leídas notificaciones de la campana: las de esos ids, o todas las sin leer de un perfil (o, sin perfil ni ids, las de toda la agencia). El dueño ve antes cuáles son.',
    perfil: 'opcional',
    tabla: 'helm_notificaciones',
    properties: {
      ids: { type: 'array', items: { type: 'string' }, maxItems: 200, description: 'Ids de notificaciones (de "notificaciones").' },
    },
    async preparar(a, h) {
      const perfiles = h.p ? [h.p.id] : h.perfiles.map(p => p.id)
      const ids = (a.ids || []).filter(x => UUID.test(x))
      if (a.ids?.length && !ids.length) throw falla('Esos ids no son de notificaciones.')
      const donde = h.p ? h.p.name : 'los perfiles de la agencia'
      if (!perfiles.length) return { resumen: 'No hay perfiles.', ya: { marcadas: 0, hecho: 'No hay perfiles.' } }
      // Se marcan justo las que ve el dueño en la tarjeta: una que llegue
      // después sigue sin leer.
      let q = supabase.from('helm_notificaciones').select('id, client_id, titulo, created_at').in('client_id', perfiles).is('leida_at', null)
      if (ids.length) q = q.in('id', ids)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      const lista = data || []
      if (!lista.length) {
        const hecho = ids.length ? 'Esas notificaciones ya estaban leídas o no son de esta agencia.' : `No hay notificaciones sin leer en ${donde}.`
        return { resumen: hecho, ya: { marcadas: 0, hecho } }
      }
      const nombre = new Map(h.perfiles.map(p => [p.id, p.name]))
      const lineas = lista.slice(0, 10).map(n => `• ${nombre.get(n.client_id) || ''}: ${recorta(n.titulo || 'sin título', 100)}`)
      return {
        resumen: `Marcar como leídas ${lista.length === 1 ? 'esta notificación' : `estas ${lista.length} notificaciones`} de ${donde}:\n${lineas.join('\n')}${lista.length > 10 ? `\n… y ${lista.length - 10} más.` : ''}`,
        async aplicar() {
          const { data: hechas, error: e } = await supabase.from('helm_notificaciones').update({ leida_at: ahora() })
            .in('client_id', perfiles).in('id', lista.map(n => n.id)).is('leida_at', null).select('id')
          if (e) throw e
          return { marcadas: (hechas || []).length, hecho: `${(hechas || []).length} notificaciones marcadas como leídas.` }
        },
      }
    },
  },

  {
    name: 'enlace_guardar',
    description: 'Guarda un enlace en la sección Enlaces de un perfil (landing, checkout, Drive…). Acepta la URL sin https://. No duplica una URL que ya esté guardada.',
    perfil: 'si',
    tabla: 'helm_links',
    properties: {
      titulo: { type: 'string' },
      url: { type: 'string' },
      categoria: { type: 'string', enum: CATEGORIAS_ENLACE, description: 'Por defecto, General.' },
      notas: { type: 'string', maxLength: 1000 },
    },
    required: ['titulo', 'url'],
    async preparar(a, h) {
      const titulo = String(a.titulo).trim().slice(0, 200)
      const crudo = textoLibre(a.url, 'url', { max: 1000 })
      const notas = textoLibre(a.notas, 'notas', { max: 1000 })
      const url = /^https?:\/\//i.test(crudo) ? crudo : `https://${crudo}`
      let u
      try { u = new URL(url) } catch { throw falla(`«${a.url}» no es una URL válida.`) }
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw falla(`«${a.url}» no es una URL válida.`)
      const categoria = a.categoria || 'General'
      const { data: ya, error } = await supabase.from('helm_links').select('id, title').eq('client_id', h.p.id).eq('url', url).limit(1)
      if (error) throw error
      if (ya?.length) {
        const hecho = `Esa URL ya está guardada en ${h.p.name} como «${ya[0].title}».`
        return { resumen: hecho, ya: { ya_estaba: true, id: ya[0].id, hecho } }
      }
      return {
        resumen: `Guardar en Enlaces de ${h.p.name} (${categoria}): «${titulo}» → ${url}.${notas ? `\nNotas:${cita(notas)}` : ''}`,
        async aplicar() {
          const { data, error: e } = await supabase.from('helm_links').insert({
            client_id: h.p.id, title: titulo, url, category: categoria, notes: notas || null,
          }).select('id').single()
          if (e) throw e
          return { id: data.id, hecho: `Enlace «${titulo}» guardado en ${h.p.name}.`, recurso: data.id }
        },
      }
    },
  },
]
