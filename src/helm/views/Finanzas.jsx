// HELM — Finanzas: ingresos y gastos, balance del negocio.
import { useEffect, useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchRows, insertRow, deleteRow, money, fmtDate, todayISO } from '../lib'
import { Panel, Empty, Modal, Field, Input, Kpi } from '../ui'

// Cómo se clasifica cada movimiento. `sign` decide si suma o resta, y
// `recurring` marca los que se repiten mes a mes (los fijos).
const TIPOS = [
  { key: 'ingreso',  label: 'Ingreso',        category: 'Ingreso',        sign: 1,  recurring: false },
  { key: 'fijo',     label: 'Gasto fijo',     category: 'Gasto fijo',     sign: -1, recurring: true },
  { key: 'puntual',  label: 'Gasto puntual',  category: 'Gasto puntual',  sign: -1, recurring: false },
  { key: 'comision', label: 'Comisión',       category: 'Comisión',       sign: -1, recurring: false },
]
const TIPO_POR_CATEGORIA = Object.fromEntries(TIPOS.map(t => [t.category, t]))

// Movimientos antiguos (o importados) que no traen una de nuestras categorías:
// se clasifican por el signo del importe.
function tipoDe(row) {
  const t = TIPO_POR_CATEGORIA[row.category]
  if (t) return t
  return Number(row.amount) >= 0 ? TIPOS[0] : TIPOS[2]
}

export default function Finanzas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [products, setProducts] = useState(null)
  const [sales, setSales] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: todayISO(), kind: 'ingreso', category: '', description: '', amount: '' })

  const load = () => fetchRows('ceo_finance_entries', clientId, { order: 'date' }).then(setRows)
  const loadCatalog = () => Promise.all([
    fetchRows('products', clientId, { order: 'created_at' }),
    fetchRows('sales', clientId, { order: 'date' }),
  ]).then(([p, v]) => { setProducts(p); setSales(v) })
  useEffect(() => { load(); loadCatalog() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Qué se está vendiendo de verdad: catálogo activo cruzado con las ventas.
  const catalogo = useMemo(() => {
    if (!products || !sales) return null
    const vendido = {}
    for (const v of sales) {
      const k = (v.product || '').trim()
      if (!k) continue
      vendido[k] = vendido[k] || { unidades: 0, importe: 0 }
      vendido[k].unidades++
      vendido[k].importe += Number(v.revenue) || 0
    }
    const filas = products.filter(p => p.active !== false).map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      currency: p.currency || 'EUR',
      interval: p.billing_interval,
      fromStripe: Boolean(p.stripe_product_id),
      ...(vendido[p.name] || { unidades: 0, importe: 0 }),
    }))
    // Productos vendidos que no están en el catálogo (venta suelta o manual).
    for (const [name, d] of Object.entries(vendido)) {
      if (!filas.some(f => f.name === name)) {
        filas.push({ id: 'x-' + name, name, price: 0, currency: 'EUR', interval: null, fromStripe: false, ...d })
      }
    }
    return filas.sort((a, b) => b.importe - a.importe)
  }, [products, sales])

  const t = useMemo(() => {
    const r = rows || []
    const sum = (f) => r.filter(f).reduce((a, x) => a + Number(x.amount), 0)
    const income = sum(x => Number(x.amount) > 0)
    const expense = sum(x => Number(x.amount) < 0)
    return {
      income,
      expense,
      balance: income + expense,
      fijos: sum(x => tipoDe(x).key === 'fijo'),
      puntuales: sum(x => tipoDe(x).key === 'puntual'),
      comisiones: sum(x => tipoDe(x).key === 'comision'),
    }
  }, [rows])

  async function save(e) {
    e.preventDefault()
    const raw = Math.abs(Number(form.amount) || 0)
    if (!raw) return
    const tipo = TIPOS.find(x => x.key === form.kind) || TIPOS[0]
    await insertRow('ceo_finance_entries', {
      client_id: clientId, date: form.date,
      // La categoría marca el tipo; si escriben una propia se guarda como
      // detalle dentro de la descripción, para no romper la clasificación.
      category: tipo.category,
      description: [form.category.trim(), form.description.trim()].filter(Boolean).join(' · ') || null,
      amount: raw * tipo.sign,
      recurring: tipo.recurring,
    })
    setForm({ date: todayISO(), kind: 'ingreso', category: '', description: '', amount: '' })
    setOpen(false); load()
  }
  async function remove(id) { await deleteRow('ceo_finance_entries', id); load() }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Balance" value={money(t.balance)} accent sub="ingresos − gastos" />
        <Kpi label="Ingresos" value={money(t.income)} />
        <Kpi label="Gastos" value={money(t.expense)} sub="todos los tipos" />
        <Kpi label="Gastos fijos" value={money(t.fijos)} sub="se repiten cada mes" />
        <Kpi label="Gastos puntuales" value={money(t.puntuales)} sub="una sola vez" />
        <Kpi label="Comisiones" value={money(t.comisiones)} sub="closers, setters, afiliados" />
      </div>
      <Panel title="Productos activos">
        {catalogo == null ? <Empty>Cargando…</Empty> : catalogo.length === 0 ? (
          <Empty>Sin productos. Se dan de alta solos al importar Stripe o al registrar una venta.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Producto</th><th>Precio</th><th>Vendidos</th><th>Facturado</th><th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {catalogo.map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.price ? money(p.price) : '—'}{p.interval ? ` / ${p.interval}` : ''}</td>
                    <td>{p.unidades || '—'}</td>
                    <td>{p.importe ? money(p.importe) : '—'}</td>
                    <td><span className="helm-badge">{p.fromStripe ? 'Stripe' : 'Manual'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Movimientos" action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo movimiento</button>}>
        {rows == null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
          <Empty>Sin movimientos registrados.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Importe</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const pos = Number(r.amount) >= 0
                  const tipo = tipoDe(r)
                  return (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td><span className={'helm-badge tipo-' + tipo.key}>{tipo.label}</span></td>
                      <td>{r.description || '—'}</td>
                      <td className="helm-num" style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>{pos ? '+' : ''}{money(r.amount)}</td>
                      <td><Trash2 size={15} className="helm-x" onClick={() => remove(r.id)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <Modal title="Nuevo movimiento" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Field label="Tipo">
              <select className="helm-input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Concepto"><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="nómina, software, comisión de Juan…" /></Field>
            <Field label="Descripción"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Importe (€)"><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} autoFocus /></Field>
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Guardar movimiento</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
