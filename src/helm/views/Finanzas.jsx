// HELM — Finanzas: ingresos y gastos, balance del negocio.
import { useEffect, useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchRows, insertRow, deleteRow, money, fmtDate, todayISO } from '../lib'
import { Panel, Empty, Modal, Field, Input, Kpi } from '../ui'

export default function Finanzas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: todayISO(), kind: 'ingreso', category: '', description: '', amount: '' })

  const load = () => fetchRows('ceo_finance_entries', clientId, { order: 'date' }).then(setRows)
  useEffect(() => { load() }, [clientId])

  const t = useMemo(() => {
    const r = rows || []
    const income = r.filter(x => Number(x.amount) > 0).reduce((a, x) => a + Number(x.amount), 0)
    const expense = r.filter(x => Number(x.amount) < 0).reduce((a, x) => a + Number(x.amount), 0)
    return { income, expense, balance: income + expense }
  }, [rows])

  async function save(e) {
    e.preventDefault()
    const raw = Math.abs(Number(form.amount) || 0)
    if (!raw) return
    const amount = form.kind === 'gasto' ? -raw : raw
    await insertRow('ceo_finance_entries', {
      client_id: clientId, date: form.date, category: form.category.trim() || (form.kind === 'gasto' ? 'gasto' : 'ingreso'),
      description: form.description.trim() || null, amount,
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
        <Kpi label="Gastos" value={money(t.expense)} />
      </div>
      <Panel title="Movimientos" action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo movimiento</button>}>
        {rows == null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
          <Empty>Sin movimientos registrados.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Importe</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const pos = Number(r.amount) >= 0
                  return (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.category || '—'}</td>
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
                <option value="ingreso">Ingreso</option>
                <option value="gasto">Gasto</option>
              </select>
            </Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Categoría"><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="ventas, nómina, software…" /></Field>
            <Field label="Descripción"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Importe (€)"><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} autoFocus /></Field>
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Guardar movimiento</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
