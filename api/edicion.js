// HELM — Edición: el puesto del editor de vídeo de un perfil.
//
// Clientes del editor, pedidos (enlazados a los guiones del calendario) y
// cobros. Todo pasa por aquí con la clave de servicio y exige acceso al perfil: las tablas no tienen policy para anon (migración 084).
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
//   POST ?action=visto        &clientId=   → { ids } el editor abre encargos nuevos
//   POST ?action=mesa         &clientId=   → { activo, nombre } este perfil es (o
//                                            deja de ser) una mesa de edición
//
// Editor compartido (migración 085): un perfil dado de alta como «mesa de
// edición» recibe los pedidos que le envían los demás (editor_client_id). Los
// ve en su resumen como `recibidos`, los mueve de estado; no los
// edita ni los borra, porque son del perfil que los envió.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { calendario, carpetasDe } from './_lib/ingesta.js'

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

    return res.status(400).json({ error: `Acción desconocida: ${accion}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) console.error('[edicion]', e)
    return res.status(code).json({ error: e.message || 'Error' })
  }
}
