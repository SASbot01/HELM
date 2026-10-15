// HELM — las herramientas de LECTURA del bot de Telegram de la agencia. Se
// ejecutan sin pedir permiso. Cada una recibe los argumentos ya validados y
// `h` (ver bot-herramientas.js): h.p es el perfil ya resuelto y comprobado.
//
// Se eligen las columnas una a una y se devuelven objetos montados a mano: así
// nunca sale nada que no se haya pedido (contraseñas, tokens, configuración).
import { supabase } from '../../lib/supabase.js'
import { tokensDeHoy, AGENTES_LANZABLES } from '../equipo.js'
import { masMeses, aISO } from '../renovaciones.js'
import {
  recorta, redondea, falla, masDias, rangoDe, inicioDeMes, finDeMes, paraFiltro, normaliza,
  pipelinesDe, pipelineDeContacto, etiquetaDeEtapa, normalizaEtapa, resolverEtapa, aliasDe, contactoDe, limpiaSecretos,
} from './comun.js'

const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'
const suma = (lista, campo) => redondea(lista.reduce((t, x) => t + (Number(x[campo]) || 0), 0))
const dia = (ts) => (ts ? String(ts).slice(0, 10) : null)
const haceDias = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
const comprueba = (...rs) => { for (const r of rs) if (r?.error) throw r.error }

// Cuotas que faltan de un fraccionado; null si es pago único.
const cuotasPendientes = (v) => {
  const total = Number(v?.installments_total) || 0
  if (!total) return null
  return Math.max(0, total - (Number(v.installments_paid) || 0))
}
export const importeCuota = (v) => redondea(Number(v.installment_amount) || (Number(v.revenue) || 0) / (Number(v.installments_total) || 1))
/** Cuándo toca la siguiente cuota: la primera, el día que arranca el plan; luego una al mes. */
export const proximaCuota = (v) => aISO(masMeses(new Date(`${v.plan_start || v.date}T00:00:00Z`), Number(v.installments_paid) || 0))
const cobroDe = (v) => {
  const pend = cuotasPendientes(v)
  return pend == null ? 'Pago único' : `Fraccionado ${v.installments_paid || 0}/${v.installments_total}`
}

// Contactos que se miran como mucho al buscar por etapa (el filtro final va aquí, no en la base).
const MAX_POR_ETAPA = 3000

const LIMITE = (por, max) => ({ type: 'integer', minimum: 1, maximum: max, description: `Cuántos como mucho. Por defecto ${por}, máximo ${max}.` })
const FECHA = (texto) => ({ type: 'string', description: `"hoy", "ayer", "mañana" o AAAA-MM-DD. ${texto}` })

export const LECTURAS = [
  {
    name: 'resumen_perfil',
    description: 'Cómo va un perfil de un vistazo: ventas y cobrado de este mes, leads nuevos de los últimos 7 días, guiones de los próximos 7 días, cuotas de planes fraccionados sin cobrar, fallos de los agentes en 7 días y notificaciones sin leer. Úsalo para «¿cómo va X?» antes de entrar en detalle.',
    perfil: 'si',
    properties: {},
    async leer(_, h) {
      const id = h.p.id
      const desde = inicioDeMes(h.hoy), hasta = finDeMes(h.hoy)
      const [mes, leads, guiones, planes, fallos, avisos] = await Promise.all([
        supabase.from('sales').select('revenue, cash_collected, status').eq('client_id', id).gte('date', desde).lte('date', hasta).limit(5000),
        supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('client_id', id).gte('created_at', haceDias(7)),
        supabase.from('helm_content_calendar').select('id, date, title, tipo, revision, grabado')
          .eq('client_id', id).gte('date', h.hoy).lte('date', masDias(h.hoy, 7)).order('date').limit(30),
        supabase.from('sales').select('revenue, cash_collected, status, installments_total, installments_paid, installment_amount')
          .eq('client_id', id).not('installments_total', 'is', null).limit(2000),
        supabase.from('agent_ejecuciones').select('agente, error, empezado_en')
          .eq('client_id', id).eq('estado', 'error').gte('empezado_en', haceDias(7)).order('empezado_en', { ascending: false }).limit(10),
        supabase.from('helm_notificaciones').select('id', { count: 'exact', head: true }).eq('client_id', id).is('leida_at', null),
      ])
      comprueba(mes, leads, guiones, planes, fallos, avisos)
      const ventas = (mes.data || []).filter(v => !cancelada(v))
      const vivos = (planes.data || []).filter(v => !cancelada(v) && cuotasPendientes(v) > 0)
      return {
        perfil: h.p.slug,
        mes: h.hoy.slice(0, 7),
        ventas_del_mes: { n: ventas.length, facturado: suma(ventas, 'revenue'), cobrado: suma(ventas, 'cash_collected') },
        leads_nuevos_7_dias: leads.count || 0,
        guiones_proximos_7_dias: (guiones.data || []).map(g => ({
          id: g.id, fecha: g.date, titulo: recorta(g.title, 90), tipo: g.tipo || null,
          ...(g.revision === 'borrador' ? { borrador: true } : {}), grabado: Boolean(g.grabado),
        })),
        cuotas_pendientes: {
          planes: vivos.length,
          cuotas: vivos.reduce((t, v) => t + cuotasPendientes(v), 0),
          importe: redondea(vivos.reduce((t, v) => t + Math.max(0, (Number(v.revenue) || 0) - (Number(v.cash_collected) || 0)), 0)),
        },
        fallos_agentes_7_dias: (fallos.data || []).map(f => ({ agente: f.agente, cuando: f.empezado_en, error: recorta(f.error, 160) })),
        notificaciones_sin_leer: avisos.count || 0,
      }
    },
  },

  {
    name: 'crm_buscar',
    description: 'Busca contactos en el CRM de un perfil por nombre, email, teléfono o Instagram, y/o por etapa del pipeline. Devuelve id, nombre, email, teléfono, etapa y valor. Sin texto ni etapa, los últimos que han entrado.',
    perfil: 'si',
    properties: {
      texto: { type: 'string', description: 'Parte del nombre, email, teléfono o @ de Instagram.' },
      etapa: { type: 'string', description: 'Solo los de esta etapa, como la diga el dueño («ganado», «cita agendada», «lead»).' },
      limite: LIMITE(10, 50),
    },
    async leer(a, h) {
      const id = h.p.id
      const pipelines = await pipelinesDe(id)
      const limite = a.limite || 10
      let q = supabase.from('crm_contacts')
        .select('id, name, email, phone, instagram, status, pipeline_id, deal_value, last_activity_at, created_at', { count: 'exact' })
        .eq('client_id', id)
      if (a.texto) {
        const t = paraFiltro(a.texto)
        if (t) q = q.or(`name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%,instagram.ilike.%${t}%`)
      }

      // Por etapa, un contacto encaja si SE VE en ella en el panel: con SU
      // pipeline y normalizaEtapa. Por alias sueltos no vale: 'contacted' y
      // 'qualified' son del mismo grupo pero, donde existen las dos, son dos
      // etapas; y un estado desconocido se ve en la primera.
      let destino = null
      if (a.etapa) {
        destino = new Map()
        const errores = []
        const pedida = normaliza(a.etapa)
        const tal = (e) => normaliza(e.label) === pedida || e.key.toLowerCase() === pedida.replace(/[^a-z0-9]+/g, '_')
        const resueltas = pipelines.map(p => ({ p, etapa: resolverEtapa(a.etapa, p.stages).etapa }))
        const exactas = resueltas.filter(x => x.etapa && tal(x.etapa))
        for (const { p, etapa } of resueltas) {
          if (!etapa) { errores.push(...resolverEtapa(a.etapa, p.stages).opciones); continue }
          // Por alias («cualificado» → 'contactado' donde no hay Cualificado)
          // solo si, donde esa etapa existe tal cual, es la misma.
          if (!tal(etapa) && !exactas.every(x => normalizaEtapa(etapa.key, x.p.stages) === x.etapa.key)) continue
          destino.set(p.id, etapa.key)
        }
        if (!destino.size) throw falla(`La etapa «${a.etapa}» no existe en ningún pipeline de ${h.p.name}. Las que hay: ${[...new Set(errores)].join(', ')}.`)
        // Para no traer el CRM entero, los estados que pueden verse ahí; si es la
        // primera etapa de algún pipeline, cualquiera puede, y no se filtra.
        if (!pipelines.some(p => destino.get(p.id) === p.stages[0]?.key)) {
          const estados = new Set()
          for (const p of pipelines) {
            const k = destino.get(p.id)
            if (k) aliasDe(k).filter(x => normalizaEtapa(x, p.stages) === k).forEach(x => estados.add(x))
          }
          q = q.in('status', [...estados])
        }
      }

      const { data: filas, error, count } = await q.order('created_at', { ascending: false }).limit(destino ? MAX_POR_ETAPA : limite)
      if (error) throw error
      const encajan = destino
        ? (filas || []).filter(c => { const pl = pipelineDeContacto(c, pipelines); return destino.get(pl.id) === normalizaEtapa(c.status, pl.stages) })
        : filas || []
      const total = destino ? encajan.length : count ?? encajan.length
      const data = encajan.slice(0, limite)
      const cortado = destino && (filas || []).length >= MAX_POR_ETAPA
      const varios = pipelines.length > 1
      return {
        perfil: h.p.slug,
        total: cortado ? `${total} o más` : total,
        contactos: data.map(c => {
          const pl = pipelineDeContacto(c, pipelines)
          return {
            id: c.id, nombre: c.name, email: c.email || undefined, telefono: c.phone || undefined, instagram: c.instagram || undefined,
            etapa: etiquetaDeEtapa(c.status, pl.stages), ...(varios ? { pipeline: pl.name } : {}),
            valor: Number(c.deal_value) || 0, alta: dia(c.created_at), ultima_actividad: dia(c.last_activity_at),
          }
        }),
        ...(total > limite ? { hay_mas: true, nota: `Hay ${cortado ? `${total} o más` : total}; afina con texto o etapa, o sube limite.` } : {}),
      }
    },
  },

  {
    name: 'crm_contacto',
    description: 'La ficha completa de un contacto del CRM: datos, etapa, notas, sus últimas 10 actividades, lo que respondió en los formularios, sus tareas abiertas y sus ventas. Úsalo antes de una llamada o para contestar «¿qué sabemos de X?».',
    perfil: 'si',
    properties: {
      contacto: { type: 'string', description: 'Su id (de crm_buscar), su email o su nombre.' },
    },
    required: ['contacto'],
    async leer(a, h) {
      const id = h.p.id
      const c = await contactoDe(id, a.contacto)
      const [pipelines, acts, formularios, tareas, ventas] = await Promise.all([
        pipelinesDe(id),
        supabase.from('crm_activities').select('type, custom_type, title, description, outcome, performed_by, performed_at, scheduled_at')
          .eq('client_id', id).eq('contact_id', c.id).order('performed_at', { ascending: false }).limit(10),
        supabase.from('helm_form_responses').select('answers, submitted_at, helm_forms(title)')
          .eq('client_id', id).eq('contact_id', c.id).order('submitted_at', { ascending: false }).limit(5),
        supabase.from('crm_tasks').select('id, title, due_date, priority, status')
          .eq('client_id', id).eq('contact_id', c.id).eq('completed', false).limit(10),
        supabase.from('sales').select('id, date, product, revenue, cash_collected, status, installments_total, installments_paid')
          .eq('client_id', id).eq('contact_id', c.id).order('date', { ascending: false }).limit(10),
      ])
      comprueba(acts, formularios, tareas, ventas)
      const pl = pipelineDeContacto(c, pipelines)
      // Lo que se pasa a texto se limpia ANTES: después ya no se distinguen los campos.
      const respuestas = (ans) => Object.fromEntries(Object.entries(limpiaSecretos(ans && typeof ans === 'object' ? ans : {}))
        .slice(0, 30).map(([k, v]) => [recorta(k, 80), recorta(typeof v === 'string' ? v : JSON.stringify(v), 300)]))
      const campos = limpiaSecretos(c.custom_fields && typeof c.custom_fields === 'object' ? c.custom_fields : {})
      return {
        perfil: h.p.slug,
        contacto: {
          id: c.id, nombre: c.name, email: c.email || undefined, telefono: c.phone || undefined, whatsapp: c.whatsapp || undefined,
          instagram: c.instagram || undefined, empresa: c.company || undefined, pais: c.country || undefined,
          etapa: etiquetaDeEtapa(c.status, pl.stages), ...(pipelines.length > 1 ? { pipeline: pl.name } : {}),
          valor: Number(c.deal_value) || 0, origen: c.source || undefined, etiquetas: Array.isArray(c.tags) && c.tags.length ? c.tags : undefined,
          producto_interes: c.producto_interes || undefined, situacion: c.situacion_actual ? recorta(c.situacion_actual, 400) : undefined,
          fecha_llamada: c.fecha_llamada || undefined, closer: c.assigned_closer || undefined, setter: c.assigned_setter || undefined,
          utm: c.utm_source ? `${c.utm_source}${c.utm_campaign ? ` / ${c.utm_campaign}` : ''}` : undefined,
          notas: c.notes ? recorta(c.notes, 800) : undefined,
          campos: Object.keys(campos).length ? recorta(JSON.stringify(campos), 600) : undefined,
          alta: dia(c.created_at), ultima_actividad: dia(c.last_activity_at),
        },
        actividades: (acts.data || []).map(x => ({
          fecha: dia(x.performed_at), tipo: x.custom_type || x.type, titulo: x.title || undefined,
          texto: x.description ? recorta(x.description, 300) : undefined, resultado: x.outcome || undefined,
          quien: x.performed_by || undefined, programada: x.scheduled_at ? dia(x.scheduled_at) : undefined,
        })),
        formularios: (formularios.data || []).map(f => ({ formulario: f.helm_forms?.title || 'Formulario', fecha: dia(f.submitted_at), respuestas: respuestas(f.answers) })),
        tareas_abiertas: (tareas.data || []).map(t => ({ id: t.id, titulo: t.title, vence: dia(t.due_date), prioridad: t.priority, estado: t.status })),
        ventas: (ventas.data || []).map(v => ({
          id: v.id, fecha: v.date, producto: v.product, facturado: Number(v.revenue) || 0, cobrado: Number(v.cash_collected) || 0,
          cobro: cobroDe(v), ...(cancelada(v) ? { cancelada: true } : {}),
        })),
      }
    },
  },

  {
    name: 'ventas',
    description: 'Las ventas de un perfil en un rango de fechas (por defecto, este mes hasta hoy): totales de facturado y cobrado sin las canceladas, y la lista con cliente, producto, importes y si es pago único o fraccionado.',
    perfil: 'si',
    properties: {
      desde: FECHA('Por defecto, el día 1 de este mes.'),
      hasta: FECHA('Por defecto, hoy.'),
      limite: LIMITE(20, 100),
    },
    async leer(a, h) {
      const { desde, hasta } = rangoDe(a, { hoy: h.hoy })
      const { data, error } = await supabase.from('sales')
        .select('id, date, client_name, product, revenue, cash_collected, payment_type, payment_method, status, installments_total, installments_paid')
        .eq('client_id', h.p.id).gte('date', desde).lte('date', hasta).order('date', { ascending: false }).limit(5000)
      if (error) throw error
      const activas = (data || []).filter(v => !cancelada(v))
      const limite = a.limite || 20
      const facturado = suma(activas, 'revenue'), cobrado = suma(activas, 'cash_collected')
      return {
        perfil: h.p.slug, desde, hasta,
        n: activas.length, facturado, cobrado, pendiente_de_cobro: redondea(facturado - cobrado),
        canceladas_aparte: (data || []).length - activas.length,
        ventas: activas.slice(0, limite).map(v => ({
          id: v.id, fecha: v.date, cliente: v.client_name, producto: v.product || undefined,
          facturado: Number(v.revenue) || 0, cobrado: Number(v.cash_collected) || 0, cobro: cobroDe(v), metodo: v.payment_method || undefined,
        })),
        ...(activas.length > limite ? { hay_mas: true } : {}),
      }
    },
  },

  {
    name: 'cobros_pendientes',
    description: 'Los planes de pago fraccionado de un perfil que aún tienen cuotas sin cobrar: cliente, producto, cuotas cobradas de las totales, importe de la cuota, fecha estimada de la próxima (la primera el día que arrancó el plan y luego una al mes) y si va atrasada. Para apuntar una cuota cobrada: registrar_cuota.',
    perfil: 'si',
    properties: {},
    async leer(_, h) {
      const { data, error } = await supabase.from('sales')
        .select('id, date, client_name, product, revenue, cash_collected, status, installments_total, installments_paid, installment_amount, plan_start')
        .eq('client_id', h.p.id).not('installments_total', 'is', null).limit(5000)
      if (error) throw error
      const planes = (data || []).filter(v => !cancelada(v) && cuotasPendientes(v) > 0).map(v => {
        const proxima = proximaCuota(v)
        return {
          venta_id: v.id, cliente: v.client_name, producto: v.product || undefined,
          cuotas: `${v.installments_paid || 0}/${v.installments_total}`, cuota: importeCuota(v),
          proxima_cuota: proxima, ...(proxima < h.hoy ? { atrasada: true } : {}),
          falta_por_cobrar: redondea(Math.max(0, (Number(v.revenue) || 0) - (Number(v.cash_collected) || 0))),
        }
      }).sort((x, y) => x.proxima_cuota.localeCompare(y.proxima_cuota))
      return {
        perfil: h.p.slug, hoy: h.hoy,
        planes_con_cuotas: planes.length,
        atrasadas: planes.filter(p => p.atrasada).length,
        falta_por_cobrar: redondea(planes.reduce((t, p) => t + p.falta_por_cobrar, 0)),
        planes: planes.slice(0, 40),
        ...(planes.length > 40 ? { hay_mas: true } : {}),
      }
    },
  },

  {
    name: 'finanzas',
    description: 'Las cuentas de un perfil en un periodo (por defecto, este mes): por un lado lo facturado y cobrado en ventas, y por otro los apuntes de Finanzas (ingresos, gastos fijos, puntuales y comisiones) con su balance y el desglose por categoría. Ojo: los apuntes de cuotas o los importados de Stripe pueden repetir dinero que ya está en ventas; no sumes las dos cosas sin decirlo.',
    perfil: 'si',
    properties: {
      desde: FECHA('Por defecto, el día 1 de este mes.'),
      hasta: FECHA('Por defecto, hoy.'),
    },
    async leer(a, h) {
      const { desde, hasta } = rangoDe(a, { hoy: h.hoy })
      const [ventas, apuntes] = await Promise.all([
        supabase.from('sales').select('revenue, cash_collected, status').eq('client_id', h.p.id).gte('date', desde).lte('date', hasta).limit(5000),
        supabase.from('ceo_finance_entries').select('date, category, description, amount, recurring, person_name')
          .eq('client_id', h.p.id).gte('date', desde).lte('date', hasta).order('date', { ascending: false }).limit(5000),
      ])
      comprueba(ventas, apuntes)
      const activas = (ventas.data || []).filter(v => !cancelada(v))
      const lista = apuntes.data || []
      const ingresos = redondea(lista.filter(e => Number(e.amount) > 0).reduce((t, e) => t + Number(e.amount), 0))
      const gastos = redondea(lista.filter(e => Number(e.amount) < 0).reduce((t, e) => t + Number(e.amount), 0))
      const porCategoria = {}
      for (const e of lista) {
        const k = e.category || 'Sin categoría'
        porCategoria[k] ||= { n: 0, total: 0 }
        porCategoria[k].n++
        porCategoria[k].total = redondea(porCategoria[k].total + (Number(e.amount) || 0))
      }
      return {
        perfil: h.p.slug, desde, hasta,
        ventas: { n: activas.length, facturado: suma(activas, 'revenue'), cobrado: suma(activas, 'cash_collected') },
        apuntes: { n: lista.length, ingresos, gastos, balance: redondea(ingresos + gastos), por_categoria: porCategoria },
        ultimos_apuntes: lista.slice(0, 15).map(e => ({
          fecha: e.date, categoria: e.category, importe: Number(e.amount) || 0, concepto: recorta(e.description || '', 100) || undefined,
          ...(e.recurring ? { fijo: true } : {}), ...(e.person_name ? { persona: e.person_name } : {}),
        })),
      }
    },
  },

  {
    name: 'agentes_estado',
    description: 'El equipo de agentes de IA de un perfil: si está activo o en pausa, cuántos guiones escribe al día, los tokens gastados hoy, qué hay en cola o trabajando, las últimas ejecuciones (con errores) y los guiones en borrador que esperan aprobación (con su id, para aprobar_guion).',
    perfil: 'si',
    properties: {},
    async leer(_, h) {
      const id = h.p.id
      const [cfg, runs, cola, borradores, tokens] = await Promise.all([
        supabase.from('agent_perfiles').select('activo, guiones_dia, tope_tokens_dia, updated_at').eq('client_id', id).maybeSingle(),
        supabase.from('agent_ejecuciones').select('agente, origen, estado, resumen, error, empezado_en, acabado_en')
          .eq('client_id', id).order('empezado_en', { ascending: false }).limit(10),
        supabase.from('agent_jobs').select('estado, payload, created_at, empezado_en')
          .eq('tipo', 'equipo').in('estado', ['pendiente', 'corriendo']).eq('payload->>clientId', id).limit(20),
        supabase.from('helm_content_calendar').select('id, date, title, tipo')
          .eq('client_id', id).eq('revision', 'borrador').order('date').limit(15),
        tokensDeHoy(id).catch(() => null),
      ])
      comprueba(cfg, runs, cola, borradores)
      return {
        perfil: h.p.slug,
        equipo: cfg.data
          ? { activo: Boolean(cfg.data.activo), guiones_dia: cfg.data.guiones_dia, tope_tokens_dia: cfg.data.tope_tokens_dia }
          : 'sin dar de alta (no corre solo; se puede lanzar a mano)',
        tokens_hoy: tokens,
        en_cola: (cola.data || []).map(j => ({ agente: j.payload?.agente, estado: j.estado, origen: j.payload?.origen, desde: j.empezado_en || j.created_at })),
        ultimas: (runs.data || []).map(r => ({
          agente: r.agente, origen: r.origen, estado: r.estado, cuando: r.empezado_en,
          ...(r.resumen ? { resumen: recorta(r.resumen, 200) } : {}), ...(r.error ? { error: recorta(r.error, 200) } : {}),
        })),
        borradores: (borradores.data || []).map(g => ({ id: g.id, fecha: g.date, titulo: recorta(g.title, 90), tipo: g.tipo || null })),
        agentes_lanzables: AGENTES_LANZABLES,
      }
    },
  },

  {
    name: 'notificaciones',
    description: 'Las últimas notificaciones SIN LEER (la campana de HELM): de un perfil o, sin perfil, de todos los de la agencia. Cada una con su id, perfil, nivel, título y texto. Para marcarlas como leídas: notificaciones_leidas.',
    perfil: 'opcional',
    properties: { limite: LIMITE(15, 40) },
    async leer(a, h) {
      const ids = h.p ? [h.p.id] : h.perfiles.map(p => p.id)
      if (!ids.length) return { sin_leer: 0, notificaciones: [] }
      const slugDe = new Map(h.perfiles.map(p => [p.id, p.slug]))
      const [lista, cuenta] = await Promise.all([
        supabase.from('helm_notificaciones').select('id, client_id, tipo, nivel, titulo, cuerpo, created_at')
          .in('client_id', ids).is('leida_at', null).order('created_at', { ascending: false }).limit(a.limite || 15),
        supabase.from('helm_notificaciones').select('id', { count: 'exact', head: true }).in('client_id', ids).is('leida_at', null),
      ])
      comprueba(lista, cuenta)
      return {
        ...(h.p ? { perfil: h.p.slug } : { perfiles: 'todos los de la agencia' }),
        sin_leer: cuenta.count ?? (lista.data || []).length,
        notificaciones: (lista.data || []).map(n => ({
          id: n.id, perfil: slugDe.get(n.client_id), nivel: n.nivel, tipo: n.tipo, titulo: n.titulo,
          texto: n.cuerpo ? recorta(n.cuerpo, 300) : undefined, fecha: n.created_at,
        })),
      }
    },
  },

  {
    name: 'enlaces',
    description: 'Los enlaces guardados de un perfil (landing, checkout, Drive, calendario, grupos…), con búsqueda por texto. Para «pásame el link de X».',
    perfil: 'si',
    properties: {
      texto: { type: 'string', description: 'Parte del nombre, la URL, la categoría o la nota.' },
      limite: LIMITE(20, 60),
    },
    async leer(a, h) {
      let q = supabase.from('helm_links').select('id, title, url, category, notes').eq('client_id', h.p.id)
      if (a.texto) {
        const t = paraFiltro(a.texto)
        if (t) q = q.or(`title.ilike.%${t}%,url.ilike.%${t}%,category.ilike.%${t}%,notes.ilike.%${t}%`)
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(a.limite || 20)
      if (error) throw error
      return {
        perfil: h.p.slug,
        enlaces: (data || []).map(l => ({ id: l.id, titulo: l.title, url: l.url, categoria: l.category, ...(l.notes ? { nota: recorta(l.notes, 160) } : {}) })),
      }
    },
  },

  {
    name: 'equipo',
    description: 'Las personas del equipo de un perfil (closers, setters, editores…): nombre, rol, email y si está activa. Sin datos de pago.',
    perfil: 'si',
    properties: {},
    async leer(_, h) {
      const { data, error } = await supabase.from('helm_team').select('id, name, role, email, active').eq('client_id', h.p.id).order('name')
      if (error) throw error
      return {
        perfil: h.p.slug,
        personas: (data || []).map(p => ({ id: p.id, nombre: p.name, rol: p.role, email: p.email || undefined, activo: p.active !== false })),
      }
    },
  },
]
