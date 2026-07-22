// HELM — Ventas: reporte de ventas.
import { useEffect, useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchRows, insertRow, deleteRow, money, fmtDate, todayISO } from '../lib'
import { Panel, Empty, Modal, Field, Input, Kpi } from '../ui'

export default function Ventas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: todayISO(), client_name: '', product: '', revenue: '', cash_collected: '', closer: '', status: 'won' })

  const load = () => fetchRows('sales', clientId, { order: 'date' }).then(setRows)
  useEffect(() => { load() }, [clientId])

  const totals = useMemo(() => {
    const r = rows || []
    return {
      revenue: r.reduce((a, x) => a + (Number(x.revenue) || 0), 0),
      cash: r.reduce((a, x) => a + (Number(x.cash_collected) || 0), 0),
      count: r.length,
    }
  }, [rows])

  async function save(e) {
    e.preventDefault()
    if (!form.client_name.trim()) return
    await insertRow('sales', {
      client_id: clientId, date: form.date, client_name: form.client_name.trim(),
      product: form.product.trim() || null, revenue: Number(form.revenue) || 0,
      cash_collected: Number(form.cash_collected) || 0, closer: form.closer.trim() || null, status: form.status,
    })
    setForm({ date: todayISO(), client_name: '', product: '', revenue: '', cash_collected: '', closer: '', status: 'won' })
    setOpen(false); load()
  }
  async function remove(id) { await deleteRow('sales', id); load() }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Revenue total" value={money(totals.revenue)} accent />
        <Kpi label="Cash collected" value={money(totals.cash)} />
        <Kpi label="Nº ventas" value={totals.count} />
      </div>
      <Panel title="Ventas" action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Registrar venta</button>}>
        {rows == null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
          <Empty>Sin ventas registradas.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Closer</th><th>Revenue</th><th>Cash</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.client_name || '—'}</td>
                    <td>{r.product || '—'}</td>
                    <td>{r.closer || '—'}</td>
                    <td className="helm-num">{money(r.revenue)}</td>
                    <td className="helm-num">{money(r.cash_collected)}</td>
                    <td><span className={'helm-chip ' + (r.status === 'won' ? 'green' : '')}>{r.status || '—'}</span></td>
                    <td><Trash2 size={15} className="helm-x" onClick={() => remove(r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <Modal title="Registrar venta" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Cliente *"><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} autoFocus /></Field>
            <Field label="Producto"><Input value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} /></Field>
            <Field label="Closer"><Input value={form.closer} onChange={e => setForm({ ...form, closer: e.target.value })} /></Field>
            <Field label="Revenue (€)"><Input type="number" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} /></Field>
            <Field label="Cash collected (€)"><Input type="number" value={form.cash_collected} onChange={e => setForm({ ...form, cash_collected: e.target.value })} /></Field>
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Guardar venta</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
