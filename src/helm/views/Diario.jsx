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
import { supabase, fetchRows, fetchRowsOrError, insertRow, deleteRow, fmtDate, todayISO } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Kpi, CountInput, FormNote } from '../ui'
import { rolesDelProducto, roleMapDelProducto, roleLabel } from '../equipo/roles'
import { marcarVendidos } from '../diario/ventas'

// Roles que reportan algo. Los que no tienen métricas definidas (editor, otro)
// no aparecen en el diario: no tendrían nada que rellenar.
const rolesDiario = () => rolesDelProducto().filter(r => r.diario.length > 0)

const EMPTY = { date: todayISO(), person_id: '', name: '', role: 'closer', metrics: {}, sales: [] }

// Roles cuyo reporte puede cerrar ventas. Un setter agenda, no cierra: pedirle
// a quién le vendio seria pedirle algo que no hace.
const VENDEN = new Set(['closer', 'dueno'])

export default function Diario({ clientId }) {
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState([])
  const [open, setOpen] = useState(false)
  const [rolVista, setRolVista] = useState('closer')
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    fetchRows('reports', clientId, { order: 'date' }).then(setRows)
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
  }, [clientId])

  // Cada rol tiene su tabla: mezclar columnas de closer y de setter en una sola
  // daría una rejilla medio vacía en la que no se lee nada.
  const rol = roleMapDelProducto()[rolVista] || rolesDiario()[0]
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
    const ventas = VENDEN.has(form.role) ? (form.sales || []).filter(v => v.contact_id) : []
    const row = await insertRow('reports', {
      client_id: clientId, date: form.date, name: form.name.trim(), role: form.role,
      person_id: form.person_id || null,
      sales: ventas,
      ...Object.fromEntries((roleMapDelProducto()[form.role]?.diario || []).map(m => [m.field, Number(form.metrics[m.field]) || 0])),
    })
    setRows(rs => [row, ...(rs || [])])
    setRolVista(form.role)
    setOpen(false)

    // El reporte ya esta guardado; mover el CRM va despues y no puede tumbarlo.
    // Si un contacto se borro entre medias, se avisa y el reporte se queda.
    if (ventas.length) {
      const { movidos, fallos } = await marcarVendidos(clientId, ventas)
      setAviso([
        movidos ? `${movidos} ${movidos === 1 ? 'contacto pasado' : 'contactos pasados'} a ganado en el CRM.` : '',
        fallos.length ? `No se pudo con: ${fallos.join('; ')}` : '',
      ].filter(Boolean).join(' '))
    }
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
      {aviso && <FormNote tone="warn">{aviso}</FormNote>}

      <Panel
        title={`Reportes diarios · ${rol.label}`}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="helm-select" value={rolVista} onChange={e => setRolVista(e.target.value)}>
              {rolesDiario().map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
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

      {open && <ReporteModal clientId={clientId} people={people} onClose={() => setOpen(false)} onSave={save} />}
    </div>
  )
}

// ── A quién se le vendió ───────────────────────────────────────────────────
// Los contactos se ELIGEN de la lista, no se teclean. Escribir "Ana" con tres
// Anas en el CRM movería la ficha equivocada, y el error no se vería hasta que
// alguien se extrañase de que un lead frío figura como cliente.
function Ventas({ clientId, value = [], onChange, declarados }) {
  const [contactos, setContactos] = useState(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    supabase.from('crm_contacts')
      .select('id, name, email, company, status')
      .eq('client_id', clientId)
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => setContactos(data || []))
  }, [clientId])

  const sugerencias = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    // El set de ya elegidos se calcula aquí dentro y no fuera: si se declara
    // arriba, el compilador de React no puede conservar la memoización.
    const elegidos = new Set(value.map(v => v.contact_id))
    return (contactos || [])
      .filter(c => !elegidos.has(c.id))
      .filter(c => [c.name, c.email, c.company].some(x => String(x || '').toLowerCase().includes(q)))
      .slice(0, 6)
  }, [busca, contactos, value])

  const añadir = (c) => { onChange([...value, { contact_id: c.id, name: c.name, amount: '' }]); setBusca('') }
  const quitar = (id) => onChange(value.filter(v => v.contact_id !== id))
  const importe = (id, v) => onChange(value.map(x => (x.contact_id === id ? { ...x, amount: v } : x)))

  return (
    <>
      <div className="helm-drawer-section">A quién se le vendió</div>
      <p className="helm-settings-note" style={{ marginTop: -4 }}>
        Lo que pongas aquí <b>mueve el CRM</b>: cada uno pasa a ganado con su importe. Lo demás
        del reporte son contadores y no tocan nada.
      </p>

      {value.map(v => (
        <div key={v.contact_id} className="helm-form-2" style={{ alignItems: 'end' }}>
          <Field label="Cliente">
            <div className="helm-settings-row" style={{ margin: 0 }}>
              <b>{v.name}</b>
              <button type="button" className="helm-btn sm" onClick={() => quitar(v.contact_id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </Field>
          <Field label="Importe (€)">
            <Input type="number" min="0" step="1" value={v.amount}
              onChange={e => importe(v.contact_id, e.target.value)} placeholder="1200" />
          </Field>
        </div>
      ))}

      <Field
        label="Añadir cliente"
        hint={contactos === null ? 'Cargando contactos…' : 'Busca por nombre, email o empresa'}
      >
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Empieza a escribir…" />
      </Field>

      {sugerencias.length > 0 && (
        <div className="helm-leccion-list" style={{ marginTop: -6 }}>
          {sugerencias.map(c => (
            <button key={c.id} type="button" className="helm-leccion-main" onClick={() => añadir(c)}>
              <span>
                <b>{c.name}</b>
                <small>{[c.company, c.email].filter(Boolean).join(' · ') || 'sin más datos'}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {busca.trim() && sugerencias.length === 0 && contactos !== null && (
        <p className="helm-settings-note">
          Nadie con ese nombre en el CRM. Si el cliente no está dado de alta, créalo antes en
          <b> CRM</b> — así el reporte apunta a una ficha de verdad.
        </p>
      )}

      {/* Aviso, no bloqueo: se puede cerrar a alguien que no esté en el CRM, y
          el contador es el que manda para las métricas. */}
      {value.length > 0 && declarados !== value.length && (
        <FormNote tone="warn">
          Has puesto {declarados} en «Convirtieron» y aquí {value.length}. No pasa nada, pero
          revísalo por si falta alguien.
        </FormNote>
      )}
    </>
  )
}

function ReporteModal({ clientId, people, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const activos = people.filter(p => p.active !== false && roleMapDelProducto()[p.role]?.diario.length)
  const rol = roleMapDelProducto()[form.role] || rolesDiario()[0]

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
              {rolesDiario().map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
        )}

        <div className="helm-drawer-section">{rol.label} · {rol.key === 'closer' ? 'embudo del día' : 'actividad del día'}</div>

        {rol.diario.map(m => (
          <Field key={m.field} label={m.label} error={shown[m.field]} hint={m.hint}>
            <CountInput value={form.metrics[m.field] ?? ''} onChange={v => setMetric(m.field, v)} placeholder="0" />
          </Field>
        ))}

        {/* Quien cierra ventas dice a QUIÉN. Es lo único de todo el reporte que
            mueve el CRM: el resto son contadores y no tocan nada. */}
        {VENDEN.has(rol.key) && (
          <Ventas
            clientId={clientId} value={form.sales}
            onChange={v => setForm(f => ({ ...f, sales: v }))}
            declarados={num('closes')}
          />
        )}

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
