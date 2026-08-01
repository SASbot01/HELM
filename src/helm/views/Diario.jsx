// HELM — Diario: el reporte de actividad del día, distinto para cada rol.
//
// Antes pedía las mismas ocho casillas a todo el mundo, así que un setter
// rellenaba "cierres" y un closer "conversaciones abiertas". Ahora las métricas
// las define el ROL (ver ../equipo/roles.js): el closer reporta su embudo
// —agendadas, asistieron, cualificaron, convirtieron, seguimiento, perdidos—,
// el setter su actividad y el CSM su acompañamiento.
//
// Si la persona ya está dada de alta en Equipo, elegirla fija su rol sola: no
// hay que preguntarlo.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchRows, fetchRowsOrError, insertRow, deleteRow, fmtDate, todayISO } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Kpi, CountInput, FormNote } from '../ui'
import { ROLES, ROLE_MAP, roleLabel } from '../equipo/roles'

// Roles que reportan algo. Los que no tienen métricas definidas (editor, otro)
// no aparecen en el diario: no tendrían nada que rellenar.
const ROLES_DIARIO = ROLES.filter(r => r.diario.length > 0)

const EMPTY = { date: todayISO(), person_id: '', name: '', role: 'closer', metrics: {} }

export default function Diario({ clientId }) {
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState([])
  const [open, setOpen] = useState(false)
  const [rolVista, setRolVista] = useState('closer')
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRows('reports', clientId, { order: 'date' }).then(setRows)
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
  }, [clientId])

  // Cada rol tiene su tabla: mezclar columnas de closer y de setter en una sola
  // daría una rejilla medio vacía en la que no se lee nada.
  const rol = ROLE_MAP[rolVista] || ROLES_DIARIO[0]
  const delRol = useMemo(() => (rows || []).filter(r => r.role === rolVista), [rows, rolVista])

  // Totales de las métricas de este rol, para la fila de KPIs.
  const totales = useMemo(() => {
    const acc = {}
    for (const m of rol.diario) acc[m.field] = delRol.reduce((a, r) => a + (Number(r[m.field]) || 0), 0)
    return acc
  }, [delRol, rol])

  // Tasa de show del closer: cuántos de los que tenían cita se presentaron.
  const tasaShow = useMemo(() => {
    if (rolVista !== 'closer') return null
    const citas = totales.appointments_booked || 0
    return citas ? Math.round(((totales.calls_made || 0) / citas) * 100) : null
  }, [totales, rolVista])

  async function save(form) {
    const row = await insertRow('reports', {
      client_id: clientId, date: form.date, name: form.name.trim(), role: form.role,
      person_id: form.person_id || null,
      ...Object.fromEntries((ROLE_MAP[form.role]?.diario || []).map(m => [m.field, Number(form.metrics[m.field]) || 0])),
    })
    setRows(rs => [row, ...(rs || [])])
    setRolVista(form.role)
    setOpen(false)
  }

  async function remove(id) {
    setError(null)
    try {
      await deleteRow('reports', id)
      setRows(rs => rs.filter(r => r.id !== id))
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        {rol.diario.slice(0, 4).map(m => (
          <Kpi key={m.field} label={m.label} value={totales[m.field] || 0} />
        ))}
        {tasaShow != null && <Kpi label="Tasa de show" value={tasaShow + '%'} accent sub="asistieron / agendadas" />}
      </div>

      {error && <FormNote>{error}</FormNote>}

      <Panel
        title={`Reportes diarios · ${rol.label}`}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="helm-select" value={rolVista} onChange={e => setRolVista(e.target.value)}>
              {ROLES_DIARIO.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo reporte</button>
          </div>
        }
      >
        {rows == null ? <Empty>Cargando…</Empty> : delRol.length === 0 ? (
          <Empty>Sin reportes de {rol.label.toLowerCase()} todavía.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Persona</th>
                  {rol.diario.map(m => <th key={m.field}>{m.label}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {delRol.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.name || '—'}</td>
                    {rol.diario.map(m => <td key={m.field} className="helm-num">{r[m.field] ?? 0}</td>)}
                    <td><Trash2 size={15} className="helm-x" onClick={() => remove(r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && <ReporteModal people={people} onClose={() => setOpen(false)} onSave={save} />}
    </div>
  )
}

function ReporteModal({ people, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const activos = people.filter(p => p.active !== false && ROLE_MAP[p.role]?.diario.length)
  const rol = ROLE_MAP[form.role] || ROLES_DIARIO[0]

  // Elegir a alguien del equipo trae su rol: el informe pedía que, si el
  // sistema ya sabe el rol, no lo vuelva a preguntar.
  function elegirPersona(id) {
    const p = activos.find(x => x.id === id)
    setForm(f => ({
      ...f,
      person_id: id,
      name: p ? p.name : f.name,
      role: p ? p.role : f.role,
      metrics: {},          // las métricas del rol anterior no valen para el nuevo
    }))
  }

  const setMetric = (field, v) => setForm(f => ({ ...f, metrics: { ...f.metrics, [field]: v } }))
  const num = (field) => Number(form.metrics[field]) || 0

  const errors = {}
  if (!form.name.trim()) errors.name = 'Di de quién es el reporte'
  if (!form.date) errors.date = 'La fecha es obligatoria'
  // Coherencia del embudo: no pueden asistir más de las que había agendadas,
  // ni convertir más de los que cualificaron.
  if (form.role === 'closer') {
    if (num('calls_made') > num('appointments_booked')) {
      errors.calls_made = 'No pueden asistir más llamadas de las agendadas'
    }
    if (num('qualified') > num('calls_made')) {
      errors.qualified = 'No pueden cualificar más de los que asistieron'
    }
    if (num('closes') > num('qualified')) {
      errors.closes = 'No pueden convertir más de los que cualificaron'
    }
  }
  if (form.role === 'setter' && num('effective_conversations') > num('conversations_opened')) {
    errors.effective_conversations = 'No puede haber más efectivas que abiertas'
  }
  const ok = Object.keys(errors).length === 0
  const shown = touched ? errors : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setSaving(true)
    try { await onSave(form) } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title="Nuevo reporte diario" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="helm-form-2">
          <Field label="Fecha *" error={shown.date}>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} max={todayISO()} />
          </Field>
          <Field label="Persona *" error={shown.name} hint={activos.length ? 'Su rol se rellena solo' : undefined}>
            {activos.length > 0 ? (
              <Select value={form.person_id} onChange={e => elegirPersona(e.target.value)}>
                <option value="">— Elige a alguien —</option>
                {activos.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
              </Select>
            ) : (
              <Input value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
            )}
          </Field>
        </div>

        {/* El rol solo se pregunta si no viene de la ficha de la persona. */}
        {!form.person_id && (
          <Field label="Rol" hint={rol.desc}>
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, metrics: {} }))}>
              {ROLES_DIARIO.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
        )}

        <div className="helm-drawer-section">{rol.label} · {rol.key === 'closer' ? 'embudo del día' : 'actividad del día'}</div>

        {rol.diario.map(m => (
          <Field key={m.field} label={m.label} error={shown[m.field]} hint={m.hint}>
            <CountInput value={form.metrics[m.field] ?? ''} onChange={v => setMetric(m.field, v)} placeholder="0" />
          </Field>
        ))}

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar reporte'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
