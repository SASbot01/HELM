// Edición — lo común a sus pestañas: la API, los estados y las cuentas.

async function api(action, clientId, body) {
  const token = localStorage.getItem('bw_admin_jwt')
  const r = await fetch(`/api/edicion?action=${action}&clientId=${clientId}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await r.json().catch(() => ({}))
  if (r.status === 401) {
    localStorage.removeItem('bw_admin_jwt')
    window.location.href = '/login'
    throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
  }
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`)
  return data
}

export const edicionApi = {
  resumen: (c) => api('resumen', c),
  cliente: (c, fila) => api('cliente', c, fila),
  pedido: (c, fila) => api('pedido', c, fila),
  estado: (c, id, estado) => api('estado', c, { id, estado }),
  cobro: (c, fila) => api('cobro', c, fila),
  cobrado: (c, id, deshacer = false) => api('cobrado', c, { id, deshacer }),
  recordar: (c, id) => api('recordar', c, { id }),
  borrar: (c, tabla, id) => api('borrar', c, { tabla, id }),
  visto: (c, ids) => api('visto', c, { ids }),
  mesa: (c, activo = true) => api('mesa', c, { activo }),
}

// El flujo de un pedido, en orden.
export const ESTADOS = [
  { key: 'guion', label: 'En guion' },
  { key: 'bruto', label: 'En bruto' },
  { key: 'edicion', label: 'Edición' },
  { key: 'revision', label: 'Revisión' },
  { key: 'entregado', label: 'Entregado' },
]
export const estadoLabel = (k) => ESTADOS.find(e => e.key === k)?.label || k

export const FORMATOS = [
  { key: 'short', label: 'Short / Reel / TikTok' },
  { key: 'largo', label: 'YouTube horizontal' },
  { key: 'revision', label: 'Revisión' },
]
export const formatoCorto = (k) => ({ short: 'Short', largo: 'Largo', revision: 'Revisión' }[k] || k)

export const CONTRATOS = [
  { key: 'retainer', label: 'Retainer mensual' },
  { key: 'por_video', label: 'Por vídeo' },
  { key: 'pack', label: 'Por pack' },
]
export const contratoLabel = (k) => CONTRATOS.find(c => c.key === k)?.label || k

export const METODOS = [
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'bizum', label: 'Bizum' },
  { key: 'stripe', label: 'Stripe' },
  { key: 'otro', label: 'Otro' },
]

// Fase del guion en Drive → etiqueta.
export const FASES = {
  por_grabar: 'Por grabar', sin_editar: 'Sin editar', editado: 'Editado', publicado: 'Publicado',
}
export const TIPOS = { viralidad: 'Viralidad', conversion: 'Conversión', autoridad: 'Autoridad', venta: 'Venta' }

// ── Fechas, siempre en local (una fecha ISO sin hora se lee en UTC) ─────────
export const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const diasHasta = (iso) => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - hoy) / 86_400_000)
}
export const fechaCorta = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
export const cuandoLabel = (iso) => {
  const n = diasHasta(iso)
  if (n == null) return 'Sin fecha'
  if (n < 0) return `Vencido hace ${-n} d`
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  return `En ${n} d`
}

// Un cobro pendiente con el vencimiento pasado está atrasado. No se guarda:
// se calcula, así no hay que mantenerlo.
export const estadoCobro = (c) => {
  if (c.estado === 'cobrado') return 'cobrado'
  return c.vence && diasHasta(c.vence) < 0 ? 'atrasado' : 'pendiente'
}

export const eur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0)

export const mismoMes = (iso, ref = new Date()) => {
  if (!iso) return false
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}
