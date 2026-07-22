// HELM plugin — Tareas. CRUD real contra crm_tasks, scoped al cliente.
import { useEffect, useState } from 'react'
import { Plus, Check, Trash2 } from 'lucide-react'
import { fetchRows, insertRow, updateRow, deleteRow, fmtDate } from '../lib'
import { Panel, Empty, Modal, Field, Input, Textarea, Select } from '../ui'

const PRIORITIES = [
  { key: 'high', label: 'Alta', tone: 'red' },
  { key: 'medium', label: 'Media', tone: 'amber' },
  { key: 'low', label: 'Baja', tone: 'cyan' },
]
const toneOf = (p) => PRIORITIES.find(x => x.key === p)?.tone || ''

const EMPTY = { title: '', description: '', priority: 'medium', due_date: '' }

export default function Tareas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)

  const load = () => fetchRows('crm_tasks', clientId).then(setRows)
  useEffect(() => { load() }, [clientId])

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    await insertRow('crm_tasks', {
      client_id: clientId, title: form.title.trim(), description: form.description.trim(),
      priority: form.priority, due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
    })
    setForm(EMPTY); setOpen(false); load()
  }

  async function toggle(t) {
    const completed = !t.completed
    setRows(rs => rs.map(r => r.id === t.id ? { ...r, completed } : r))
    try { await updateRow('crm_tasks', t.id, { completed, completed_at: completed ? new Date().toISOString() : null, status: completed ? 'done' : 'todo' }) }
    catch { load() }
  }

  async function remove(id) { await deleteRow('crm_tasks', id); load() }

  const pending = (rows || []).filter(r => !r.completed)
  const done = (rows || []).filter(r => r.completed)

  return (
    <>
      <Panel
        title={rows ? `Tareas · ${pending.length} pendientes` : 'Tareas'}
        action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nueva tarea</button>}
      >
        {rows == null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
          <Empty>Sin tareas. Crea la primera.</Empty>
        ) : (
          <div className="helm-tasks">
            {[...pending, ...done].map(t => (
              <div key={t.id} className={'helm-task' + (t.completed ? ' done' : '')}>
                <button className={'helm-check' + (t.completed ? ' on' : '')} onClick={() => toggle(t)}>
                  {t.completed && <Check size={13} />}
                </button>
                <div className="helm-task-main">
                  <div className="helm-task-title">{t.title}</div>
                  {t.description && <div className="helm-task-desc">{t.description}</div>}
                </div>
                <div className="helm-task-meta">
                  <span className={'helm-chip ' + toneOf(t.priority)}>{PRIORITIES.find(p => p.key === t.priority)?.label || t.priority}</span>
                  {t.due_date && <span className="helm-task-due">{fmtDate(t.due_date)}</span>}
                </div>
                <Trash2 size={15} className="helm-x" onClick={() => remove(t.id)} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {open && (
        <Modal title="Nueva tarea" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Field label="Título *"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus /></Field>
            <Field label="Descripción"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="helm-form-2">
              <Field label="Prioridad">
                <Select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </Field>
              <Field label="Vence"><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></Field>
            </div>
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Crear tarea</button>
          </form>
        </Modal>
      )}
    </>
  )
}
