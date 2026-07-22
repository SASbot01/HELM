// HELM — Diario: reporte diario de actividad de closers y setters.
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchRows, insertRow, deleteRow, fmtDate, todayISO } from '../lib'
import { Panel, Empty, Modal, Field, Input } from '../ui'

export default function Diario({ clientId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    date: todayISO(), name: '', role: 'closer',
    calls_made: '', conversations_opened: '', appointments_booked: '', offers_launched: '', closes: '',
  })

  const load = () => fetchRows('reports', clientId, { order: 'date' }).then(setRows)
  useEffect(() => { load() }, [clientId])

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    const num = (v) => (v === '' ? 0 : Number(v) || 0)
    await insertRow('reports', {
      client_id: clientId, date: form.date, name: form.name.trim(), role: form.role,
      calls_made: num(form.calls_made), conversations_opened: num(form.conversations_opened),
      appointments_booked: num(form.appointments_booked), offers_launched: num(form.offers_launched),
      closes: num(form.closes),
    })
    setForm({ date: todayISO(), name: '', role: 'closer', calls_made: '', conversations_opened: '', appointments_booked: '', offers_launched: '', closes: '' })
    setOpen(false); load()
  }
  async function remove(id) { await deleteRow('reports', id); load() }

  return (
    <Panel title="Reportes diarios · Closer / Setter" action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo reporte</button>}>
      {rows == null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
        <Empty>Sin reportes diarios todavía.</Empty>
      ) : (
        <div className="helm-tablewrap">
          <table className="helm-table">
            <thead><tr><th>Fecha</th><th>Persona</th><th>Rol</th><th>Llamadas</th><th>Convers.</th><th>Citas</th><th>Ofertas</th><th>Cierres</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.name || '—'}</td>
                  <td><span className={'helm-chip ' + (r.role === 'closer' ? 'cyan' : '')}>{r.role || '—'}</span></td>
                  <td className="helm-num">{r.calls_made ?? 0}</td>
                  <td className="helm-num">{r.conversations_opened ?? 0}</td>
                  <td className="helm-num">{r.appointments_booked ?? 0}</td>
                  <td className="helm-num">{r.offers_launched ?? 0}</td>
                  <td className="helm-num">{r.closes ?? 0}</td>
                  <td><Trash2 size={15} className="helm-x" onClick={() => remove(r.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="Nuevo reporte diario" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Persona *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Rol">
              <select className="helm-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="closer">closer</option>
                <option value="setter">setter</option>
              </select>
            </Field>
            <Field label="Llamadas"><Input type="number" value={form.calls_made} onChange={e => setForm({ ...form, calls_made: e.target.value })} /></Field>
            <Field label="Conversaciones abiertas"><Input type="number" value={form.conversations_opened} onChange={e => setForm({ ...form, conversations_opened: e.target.value })} /></Field>
            <Field label="Citas agendadas"><Input type="number" value={form.appointments_booked} onChange={e => setForm({ ...form, appointments_booked: e.target.value })} /></Field>
            <Field label="Ofertas lanzadas"><Input type="number" value={form.offers_launched} onChange={e => setForm({ ...form, offers_launched: e.target.value })} /></Field>
            <Field label="Cierres"><Input type="number" value={form.closes} onChange={e => setForm({ ...form, closes: e.target.value })} /></Field>
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Guardar reporte</button>
          </form>
        </Modal>
      )}
    </Panel>
  )
}
