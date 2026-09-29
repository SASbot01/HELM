// HELM — Edición: el puesto del editor de vídeo de un perfil.
//
// Clientes del editor, pedidos (enlazados a los guiones del calendario), cobros
// y el Agente Montador. Todo pasa por aquí con la clave de servicio y exige
// acceso al perfil: las tablas no tienen policy para anon (migración 084).
//
//   GET  ?action=resumen      &clientId=   → todo lo de la pantalla
//   POST ?action=cliente      &clientId=   → alta o edición ({ id? , ... })
//   POST ?action=pedido       &clientId=   → alta o edición
//   POST ?action=estado       &clientId=   → { id, estado } (y cobro al entregar)
//   POST ?action=cobro        &clientId=   → alta o edición
//   POST ?action=cobrado      &clientId=   → { id } lo marca como cobrado
//   POST ?action=recordar     &clientId=   → { id } apunta el recordatorio y
//                                            devuelve el mensaje para enviarlo
//   POST ?action=borrar       &clientId=   → { tabla: cliente|pedido|cobro, id }
//   POST ?action=sincronizar  &clientId=   → el Agente Montador contra el Drive
//   POST ?action=hoja         &clientId=   → { id } la hoja de montaje del pedido
//   POST ?action=visto        &clientId=   → { ids } el editor abre encargos nuevos
//   POST ?action=mesa         &clientId=   → { activo, nombre } este perfil es (o
//                                            deja de ser) una mesa de edición
//
// Editor compartido (migración 085): un perfil dado de alta como «mesa de
// edición» recibe los pedidos que le envían los demás (editor_client_id). Los
// ve en su resumen como `recibidos`, los mueve de estado y pide su hoja; no los
// edita ni los borra, porque son del perfil que los envió.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { calendario, carpetasDe, TIPOS } from './_lib/ingesta.js'
import { llmChat } from './_lib/llm.js'

const TABLAS = {
  cliente: 'helm_edicion_clientes',
  pedido: 'helm_edicion_pedidos',
  cobro: 'helm_edicion_cobros',
}
const ESTADOS = ['guion', 'bruto', 'edicion', 'revision', 'entregado']
const ahora = () => new Date().toISOString()
const dia = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)
const texto = (v, max = 4000) => String(v ?? '').trim().slice(0, max)
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null)

function falla(msg, code = 400) {
  const e = new Error(msg)
  e.statusCode = code
  return e
}

// Solo se escribe en filas de ESTE perfil: el id que llega del navegador no
// basta para tocar la de otro.
async function propia(tabla, id, clientId) {
  const { data, error } = await supabase.from(TABLAS[tabla]).select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
  if (error) throw error
  if (!data) throw falla('No existe en este perfil', 404)
  return data
}

// Un pedido que ha llegado a la mesa de este perfil desde otro.
async function recibido(id, clientId) {
  const { data, error } = await supabase.from(TABLAS.pedido).select('*').eq('id', id).eq('editor_client_id', clientId).maybeSingle()
  if (error) throw error
  if (!data) throw falla('No existe en este perfil', 404)
  return data
}
// Propio o recibido: para lo que puede hacer el editor (estado, hoja, visto).
const pedidoAccesible = (id, clientId) => propia('pedido', id, clientId).catch(() => recibido(id, clientId))

// Las mesas de edición activas, con el nombre que se enseña al enviar.
async function mesas() {
  const { data, error } = await supabase.from('helm_edicion_editores')
    .select('client_id, nombre, clients(name)').eq('activo', true)
  if (error) throw error
  return (data || []).map(m => ({ id: m.client_id, nombre: m.nombre || m.clients?.name || 'Editor' }))
}

// Los encargos que tiene esta mesa, con el perfil de origen y su guion (con la
// fase real en el Drive de ese perfil).
async function recibidosDe(clientId) {
  const { data, error } = await supabase.from(TABLAS.pedido)
    .select('*, clients!helm_edicion_pedidos_client_id_fkey(name, slug)')
    .eq('editor_client_id', clientId).order('entrega', { nullsFirst: false })
  if (error) throw error
  const filas = data || []
  const guiones = new Map()
  for (const origen of new Set(filas.filter(p => p.guion_id).map(p => p.client_id))) {
    for (const g of await guionesDe(origen)) guiones.set(g.id, g)
  }
  return filas.map(({ clients: c, ...p }) => {
    const g = p.guion_id ? guiones.get(p.guion_id) : null
    return {
      ...p, recibido: true, origen: { id: p.client_id, nombre: c?.name || 'Otro perfil', slug: c?.slug || '' },
      guion_info: g ? { id: g.id, fecha: g.date, titulo: g.title, tipo: g.tipo, fase: g.fase, guion: g.body || '' } : null,
    }
  })
}

async function guarda(tabla, clientId, id, fila) {
  const q = id
    ? supabase.from(TABLAS[tabla]).update({ ...fila, updated_at: ahora() }).eq('id', id).eq('client_id', clientId)
    : supabase.from(TABLAS[tabla]).insert({ ...fila, client_id: clientId })
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}

// ── Los guiones del calendario, con su fase real en Drive ───────────────────
async function guionesDe(clientId) {
  try {
    return await calendario(clientId, { desde: dia(-62), hasta: dia(124) })
  } catch {
    return []   // sin Drive o sin calendario: la sección sigue funcionando
  }
}

// Qué estado de pedido corresponde a la fase de su guion en Drive. null = el
// Drive no dice nada nuevo (la pieza no se ha grabado todavía).
function estadoPorFase(fase) {
  if (fase === 'editado' || fase === 'publicado') return 'entregado'
  if (fase === 'sin_editar') return 'bruto'
  return null
}

// Al entregar un pedido con precio y sin cobro, nace su cobro pendiente. Así
// «cobrar» no depende de acordarse.
async function cobroAlEntregar(p) {
  if (!(Number(p.precio) > 0)) return null
  const { data: ya } = await supabase.from(TABLAS.cobro).select('id').eq('pedido_id', p.id).limit(1)
  if (ya?.length) return null
  const { data, error } = await supabase.from(TABLAS.cobro).insert({
    client_id: p.client_id, cliente_id: p.cliente_id, pedido_id: p.id,
    concepto: p.titulo, importe: p.precio, vence: dia(15), estado: 'pendiente',
  }).select().single()
  if (error) throw error
  return data
}

// ── El Agente Montador: sincronizar pedidos con el Drive ────────────────────
async function sincronizar(clientId) {
  const [guiones, { data: pedidos, error }] = await Promise.all([
    guionesDe(clientId),
    supabase.from(TABLAS.pedido).select('*').eq('client_id', clientId),
  ])
  if (error) throw error
  const porGuion = new Map((pedidos || []).filter(p => p.guion_id).map(p => [p.guion_id, p]))
  const cambios = []

  for (const g of guiones) {
    const objetivo = estadoPorFase(g.fase)
    const p = porGuion.get(g.id)

    // Guion grabado sin pedido: se abre el pedido, ya en su estado.
    if (!p) {
      if (!objetivo) continue
      const nuevo = await guarda('pedido', clientId, null, {
        guion_id: g.id, titulo: g.title, formato: 'short', estado: objetivo,
        entrega: g.date >= dia(0) ? g.date : dia(3),
        drive_url: g.drive_carpeta_id ? `https://drive.google.com/drive/folders/${g.drive_carpeta_id}` : '',
        entregado_at: objetivo === 'entregado' ? ahora() : null,
      })
      cambios.push({ tipo: 'nuevo', titulo: g.title, estado: objetivo })
      continue
    }

    // Solo se avanza, nunca se retrocede: si el editor ya lo tiene en edición
    // o revisión, que el bruto siga en Drive no lo devuelve a «bruto».
    if (!objetivo || ESTADOS.indexOf(objetivo) <= ESTADOS.indexOf(p.estado)) continue
    const fila = { estado: objetivo }
    if (objetivo === 'entregado') fila.entregado_at = ahora()
    if (!p.drive_url && g.drive_carpeta_id) fila.drive_url = `https://drive.google.com/drive/folders/${g.drive_carpeta_id}`
    const guardado = await guarda('pedido', clientId, p.id, fila)
    if (objetivo === 'entregado') await cobroAlEntregar(guardado)
    cambios.push({ tipo: 'avanza', titulo: p.titulo, de: p.estado, estado: objetivo })
  }
  return cambios
}

// En la mesa del editor, el agente solo avanza lo que le han enviado: los
// guiones de cada perfil siguen siendo de ese perfil.
async function sincronizarRecibidos(clientId) {
  const cambios = []
  for (const p of await recibidosDe(clientId)) {
    const objetivo = estadoPorFase(p.guion_info?.fase)
    if (!objetivo || ESTADOS.indexOf(objetivo) <= ESTADOS.indexOf(p.estado)) continue
    const fila = { estado: objetivo, ...(objetivo === 'entregado' ? { entregado_at: ahora() } : {}) }
    const guardado = await guarda('pedido', p.client_id, p.id, fila)
    if (objetivo === 'entregado') await cobroAlEntregar(guardado)
    cambios.push({ tipo: 'avanza', titulo: p.titulo, de: p.estado, estado: objetivo })
  }
  return cambios
}

// ── El Agente Montador: la hoja de montaje ──────────────────────────────────
async function hojaDeMontaje(clientId, pedido) {
  let guion = null
  if (pedido.guion_id) {
    const { data } = await supabase.from('helm_content_calendar')
      .select('title, body, tipo, date').eq('id', pedido.guion_id).maybeSingle()
    guion = data
  }
  if (!guion?.body && !pedido.notas_estilo) {
    throw falla('Sin guion ni notas de estilo no hay de qué hacer la hoja. Enlaza el pedido a un guion o escribe las notas.')
  }
  // La guía de formatos de montaje (B-roll, a cámara con insertos…) que
  // mantiene el Agent OS en su memoria global.
  const { data: guia } = await supabase.from('agent_memory').select('contenido')
    .eq('ambito', 'global').ilike('contenido', '%FORMATOS DE MONTAJE%').limit(1)

  const system = [
    'Eres el Montador del equipo: el jefe de postproducción de reels y vídeos cortos.',
    'Escribes la hoja de montaje que el editor sigue para editar la pieza. Español de España, concreta, sin relleno.',
    'Estructura, en este orden:',
    '1. FORMATO: cuál de la guía y por qué, en una línea.',
    '2. GANCHO (0-3 s): qué se ve, qué se oye y el texto en pantalla exacto.',
    '3. MONTAJE, en una tabla TIEMPO | QUÉ SE VE | QUÉ SE OYE O SE LEE, una fila por idea del guion, con los cortes y los insertos.',
    '4. RITMO Y MÚSICA: cortes por segundo, tipo de música y dónde sube.',
    '5. SUBTÍTULOS Y GRÁFICOS: estilo, palabras a resaltar.',
    '6. CIERRE Y CTA: el plano final y el texto del CTA.',
    '7. CHECKLIST DE ENTREGA: formato de exportación (9:16 1080×1920 para short, 16:9 para largo), duración objetivo y nombre del archivo.',
    guia?.[0]?.contenido ? `\nGuía de formatos del equipo:\n${guia[0].contenido}` : '',
  ].join('\n')

  const user = [
    `Pieza: ${pedido.titulo}`,
    `Formato pedido: ${pedido.formato === 'largo' ? 'vídeo largo horizontal' : pedido.formato === 'revision' ? 'revisión de una pieza ya editada' : 'short vertical (Reel/TikTok/Short)'}`,
    guion?.tipo ? `Tipo de reel: ${TIPOS[guion.tipo] || guion.tipo}` : '',
    pedido.clips > 1 ? `Clips a entregar: ${pedido.clips}` : '',
    pedido.notas_estilo ? `Notas de estilo del cliente: ${pedido.notas_estilo}` : '',
    guion?.body ? `\nGuion, tal como se grabó:\n${guion.body}` : '',
  ].filter(Boolean).join('\n')

  let hoja
  try {
    hoja = await llmChat({ clientId, system, messages: [{ role: 'user', content: user }], temperature: 0.4, maxTokens: 1800 })
  } catch (e) {
    // El caso típico: el perfil tira del modelo local y ese modelo no está en
    // la máquina. Se dice qué hacer, no el error de Ollama.
    if (/modelo local|not found|ECONNREFUSED|fetch failed/i.test(e.message)) {
      throw falla('La IA de este perfil no está disponible ahora mismo. Conecta Claude en Ajustes → IA y vuelve a pedir la hoja.', 503)
    }
    throw e
  }
  return guarda('pedido', clientId, pedido.id, { hoja, hoja_at: ahora() })
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)
    const accion = String(req.query?.action || '')
    const b = req.body || {}

    if (accion === 'resumen') {
      const todas = await mesas()
      const soyMesa = todas.some(m => m.id === clientId)
      const [cl, pe, co, guiones, carpetas, recibidos] = await Promise.all([
        supabase.from(TABLAS.cliente).select('*').eq('client_id', clientId).order('nombre'),
        supabase.from(TABLAS.pedido).select('*').eq('client_id', clientId).order('entrega', { nullsFirst: false }),
        supabase.from(TABLAS.cobro).select('*').eq('client_id', clientId).order('vence', { nullsFirst: false }),
        guionesDe(clientId),
        carpetasDe(clientId).catch(() => null),
        soyMesa ? recibidosDe(clientId) : [],
      ])
      for (const r of [cl, pe, co]) if (r.error) throw r.error
      return res.status(200).json({
        clientes: cl.data || [], pedidos: pe.data || [], cobros: co.data || [],
        guiones: guiones.map(g => ({ id: g.id, fecha: g.date, titulo: g.title, tipo: g.tipo, fase: g.fase, guion: g.body || '' })),
        drive: carpetas ? { conectado: true, url: `https://drive.google.com/drive/folders/${carpetas.raiz}` } : { conectado: false },
        // A quién se le puede enviar (todas las mesas menos la propia) y, si
        // este perfil es una mesa, lo que le ha llegado.
        editores: todas.filter(m => m.id !== clientId),
        soyMesa, recibidos,
        esSuperadmin: Boolean(auth.superadmin || auth.role === 'superadmin'),
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

    if (accion === 'cliente') {
      if (!texto(b.nombre)) throw falla('El nombre es obligatorio')
      if (b.id) await propia('cliente', b.id, clientId)
      const fila = {
        nombre: texto(b.nombre, 160), canal: texto(b.canal, 160),
        contrato: ['retainer', 'por_video', 'pack'].includes(b.contrato) ? b.contrato : 'por_video',
        tarifa: numero(b.tarifa), estado: ['activo', 'pausa', 'fin'].includes(b.estado) ? b.estado : 'activo',
        vip: Boolean(b.vip), drive_url: texto(b.drive_url, 600), brief_url: texto(b.brief_url, 600), notas: texto(b.notas),
      }
      return res.status(200).json({ cliente: await guarda('cliente', clientId, b.id, fila) })
    }

    if (accion === 'pedido') {
      if (!texto(b.titulo)) throw falla('El título es obligatorio')
      const antes = b.id ? await propia('pedido', b.id, clientId) : null
      const fila = {
        titulo: texto(b.titulo, 200), cliente_id: b.cliente_id || null, guion_id: b.guion_id || null,
        formato: ['short', 'largo', 'revision'].includes(b.formato) ? b.formato : 'short',
        estado: ESTADOS.includes(b.estado) ? b.estado : 'guion',
        entrega: fecha(b.entrega), clips: Math.max(1, Math.round(numero(b.clips)) || 1),
        precio: numero(b.precio), notas_estilo: texto(b.notas_estilo), editor_id: b.editor_id || null,
        drive_url: texto(b.drive_url, 600),
      }
      // Enviar a una mesa de edición (o retirarlo). Al cambiar de mesa vuelve a
      // salirle como nuevo al editor.
      const editor = b.editor_client_id || null
      if (editor !== (antes?.editor_client_id || null)) {
        if (editor && (editor === clientId || !(await mesas()).some(m => m.id === editor))) throw falla('Ese editor no recibe encargos')
        Object.assign(fila, { editor_client_id: editor, enviado_at: editor ? ahora() : null, visto_at: null })
      }
      return res.status(200).json({ pedido: await guarda('pedido', clientId, b.id, fila) })
    }

    if (accion === 'estado') {
      if (!ESTADOS.includes(b.estado)) throw falla('Estado desconocido')
      const antes = await pedidoAccesible(b.id, clientId)
      const fila = { estado: b.estado }
      if (b.estado === 'entregado' && antes.estado !== 'entregado') fila.entregado_at = ahora()
      // Se guarda en el perfil dueño del pedido, sea este o el que lo envió.
      const pedido = await guarda('pedido', antes.client_id, b.id, fila)
      const cobro = b.estado === 'entregado' ? await cobroAlEntregar(pedido) : null
      return res.status(200).json({ pedido, cobro })
    }

    if (accion === 'cobro') {
      if (!texto(b.concepto)) throw falla('El concepto es obligatorio')
      if (b.id) await propia('cobro', b.id, clientId)
      const fila = {
        concepto: texto(b.concepto, 200), importe: numero(b.importe), vence: fecha(b.vence),
        cliente_id: b.cliente_id || null, pedido_id: b.pedido_id || null,
        metodo: ['stripe', 'bizum', 'transferencia', 'otro'].includes(b.metodo) ? b.metodo : 'transferencia',
        enlace: texto(b.enlace, 600),
      }
      return res.status(200).json({ cobro: await guarda('cobro', clientId, b.id, fila) })
    }

    if (accion === 'cobrado') {
      await propia('cobro', b.id, clientId)
      const deshacer = b.deshacer === true
      const cobro = await guarda('cobro', clientId, b.id, deshacer
        ? { estado: 'pendiente', cobrado_at: null }
        : { estado: 'cobrado', cobrado_at: ahora() })
      return res.status(200).json({ cobro })
    }

    // HELM no envía correos: el recordatorio se apunta aquí y el mensaje se
    // manda desde el navegador (correo o WhatsApp), con el texto ya escrito.
    if (accion === 'recordar') {
      const c = await propia('cobro', b.id, clientId)
      let nombre = ''
      if (c.cliente_id) {
        const { data } = await supabase.from(TABLAS.cliente).select('nombre').eq('id', c.cliente_id).maybeSingle()
        nombre = data?.nombre || ''
      }
      const importe = Number(c.importe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
      const vence = c.vence ? new Date(c.vence + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : ''
      const mensaje = [
        `Hola${nombre ? ' ' + nombre : ''}, te escribo por el pago de «${c.concepto}» (${importe})`
          + (vence ? `, que vencía el ${vence}.` : '.'),
        c.enlace ? `Puedes pagarlo aquí: ${c.enlace}` : '',
        '¡Gracias!',
      ].filter(Boolean).join('\n')
      const cobro = await guarda('cobro', clientId, b.id, { recordado_at: ahora() })
      return res.status(200).json({ cobro, mensaje })
    }

    if (accion === 'borrar') {
      if (!TABLAS[b.tabla]) throw falla('Tabla desconocida')
      await propia(b.tabla, b.id, clientId)
      const { error } = await supabase.from(TABLAS[b.tabla]).delete().eq('id', b.id).eq('client_id', clientId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    if (accion === 'sincronizar') {
      const cambios = await sincronizar(clientId)
      if ((await mesas()).some(m => m.id === clientId)) cambios.push(...(await sincronizarRecibidos(clientId)))
      return res.status(200).json({ cambios })
    }

    if (accion === 'visto') {
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter(Boolean).slice(0, 200)
      if (ids.length) {
        const { error } = await supabase.from(TABLAS.pedido).update({ visto_at: ahora() })
          .in('id', ids).eq('editor_client_id', clientId).is('visto_at', null)
        if (error) throw error
      }
      return res.status(200).json({ ok: true })
    }

    // Dar de alta este perfil como mesa de edición. Es montar la estructura
    // del negocio, así que es del superadmin.
    if (accion === 'mesa') {
      if (!(auth.superadmin || auth.role === 'superadmin')) throw falla('Solo el administrador de HELM puede hacerlo', 403)
      const { data: c } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
      const { error } = await supabase.from('helm_edicion_editores').upsert({
        client_id: clientId, nombre: texto(b.nombre, 120) || c?.name || 'Editor', activo: b.activo !== false,
      })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    if (accion === 'hoja') {
      const pedido = await pedidoAccesible(b.id, clientId)
      // La IA y el guion son los del perfil dueño del pedido.
      return res.status(200).json({ pedido: await hojaDeMontaje(pedido.client_id, pedido) })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[edicion]', e)
    return res.status(code).json({ error: e.message || 'Error' })
  }
}
