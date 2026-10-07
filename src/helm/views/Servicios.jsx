// HELM — Servicios: el catálogo de la consultoría.
//
// Es la pieza de la que cuelga el resto: al registrar una venta se elige un
// servicio y el precio se autocompleta; en el CRM se filtra el pipeline por el
// servicio que tiene contratado cada cliente. Sin catálogo, ninguna de las dos
// cosas es posible.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Link2, Users, Package } from 'lucide-react'
import {
  fetchRowsOrError, fetchRows, insertRow, updateRow, deleteRow,
  money, MISSING_TABLE, activeSales,
} from '../lib'
import { Panel, Empty, Modal, Field, Input, Textarea, Select, Kpi, MoneyInput, CountInput, FormNote } from '../ui'
import { roleLabel } from '../equipo/roles'
import MigracionPendiente from '../MigracionPendiente'

const FORMATOS = ['1 a 1', 'Grupal', 'Mentoría', 'Done for you', 'Curso', 'Asesoría puntual', 'Retainer']
const BILLINGS = [
  { key: 'unico', label: 'Pago único' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'trimestral', label: 'Trimestral' },
  { key: 'anual', label: 'Anual' },
]
const billingLabel = (k) => BILLINGS.find(b => b.key === k)?.label || 'Pago único'

const EMPTY = {
  name: '', format: '', description: '', price: '', billing: 'unico',
  duration_days: '', responsables: [], recursos: [], active: true,
}

const toForm = (r) => ({
  ...EMPTY,
  ...r,
  price: r.price ? String(r.price) : '',
  duration_days: r.duration_days ? String(r.duration_days) : '',
  responsables: Array.isArray(r.responsables) ? r.responsables : [],
  recursos: Array.isArray(r.recursos) ? r.recursos : [],
})

export default function Servicios({ clientId }) {
  const [rows, setRows] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [people, setPeople] = useState([])
  const [sales, setSales] = useState([])
  const [edit, setEdit] = useState(null)   // servicio en edición, o EMPTY para alta
  const [error, setError] = useState(null)

  const load = () => fetchRowsOrError('helm_services', clientId, { order: 'created_at', asc: true })
    .then(({ rows: r, error }) => { setRows(r); setFatal(error) })

  useEffect(() => {
    load()
    // El equipo alimenta el selector de responsables; las ventas, la facturación
    // real de cada servicio. Si alguna falla (migración sin aplicar), se queda
    // vacía y el catálogo sigue funcionando.
    fetchRowsOrError('helm_team', clientId).then(({ rows: r }) => setPeople(r))
    fetchRows('sales', clientId, { order: 'date' }).then(v => setSales(activeSales(v)))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuánto ha facturado cada servicio de verdad. Se cruza por service_id y, para
  // las ventas antiguas que no lo tienen, por el nombre del producto.
  const facturacion = useMemo(() => {
    const acc = {}
    for (const v of sales) {
      const key = v.service_id || (v.product || '').trim().toLowerCase()
      if (!key) continue
      acc[key] = acc[key] || { unidades: 0, importe: 0 }
      acc[key].unidades++
      acc[key].importe += Number(v.revenue) || 0
    }
    return acc
  }, [sales])

  // Un servicio puede tener ventas apuntadas de las dos formas: las nuevas por
  // service_id, las anteriores al catálogo solo por el nombre del producto.
  const datosDe = (s) => facturacion[s.id] || facturacion[(s.name || '').trim().toLowerCase()] || { unidades: 0, importe: 0 }

  const stats = useMemo(() => {
    const todos = rows || []
    const activos = todos.filter(s => s.active !== false)
    const importeDe = (s) =>
      (facturacion[s.id] || facturacion[(s.name || '').trim().toLowerCase()] || { importe: 0 }).importe
    return {
      total: activos.length,
      recurrentes: activos.filter(s => s.billing !== 'unico').length,
      facturado: todos.reduce((a, s) => a + importeDe(s), 0),
    }
  }, [rows, facturacion])

  async function save(form) {
    const row = {
      client_id: clientId,
      name: form.name.trim(),
      format: form.format.trim(),
      description: form.description.trim(),
      price: Number(form.price) || 0,
      billing: form.billing,
      duration_days: form.duration_days === '' ? null : Number(form.duration_days),
      responsables: form.responsables,
      recursos: form.recursos.filter(r => r.label?.trim() || r.url?.trim()),
      active: form.active,
      updated_at: new Date().toISOString(),
    }
    if (form.id) {
      const saved = await updateRow('helm_services', form.id, row)
      setRows(rs => rs.map(r => r.id === form.id ? saved : r))
    } else {
      const saved = await insertRow('helm_services', row)
      setRows(rs => [...(rs || []), saved])
    }
    setEdit(null)
  }

  async function remove(s) {
    if (!window.confirm(`¿Eliminar el servicio "${s.name}"? Las ventas que lo tengan asignado se quedan sin servicio.`)) return
    setError(null)
    try {
      await deleteRow('helm_services', s.id)
      setRows(rs => rs.filter(r => r.id !== s.id))
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  async function toggleActive(s) {
    const next = !s.active
    setRows(rs => rs.map(r => r.id === s.id ? { ...r, active: next } : r))
    try { await updateRow('helm_services', s.id, { active: next }) } catch { load() }
  }

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Servicios" />
  if (fatal) return <FormNote>{fatal}</FormNote>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Servicios activos" value={stats.total} />
        <Kpi label="Recurrentes" value={stats.recurrentes} sub="mensual, trimestral o anual" />
        <Kpi label="Facturado" value={money(stats.facturado)} accent sub="histórico del catálogo" />
      </div>

      {error && <FormNote>{error}</FormNote>}

      <Panel
        title="Catálogo"
        action={<button className="helm-btn primary" onClick={() => setEdit(EMPTY)}><Plus size={15} />Nuevo servicio</button>}
      >
        {rows == null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
          <Empty>
            Aún no hay servicios. Créalos aquí y podrás asignarlos a cada cliente
            del CRM y elegirlos al registrar una venta.
          </Empty>
        ) : (
          <div className="helm-svc-grid">
            {rows.map(s => {
              const d = datosDe(s)
              return (
                <div key={s.id} className={'helm-svc' + (s.active === false ? ' off' : '')}>
                  <div className="helm-svc-head">
                    <div className="helm-svc-ico"><Package size={17} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{s.name}</b>
                      <small>{[s.format, billingLabel(s.billing)].filter(Boolean).join(' · ')}</small>
                    </div>
                    <div className="helm-svc-price">{money(s.price)}</div>
                  </div>

                  {s.description && <p className="helm-svc-desc">{s.description}</p>}

                  <div className="helm-svc-meta">
                    {s.duration_days ? <span>{s.duration_days} días</span> : <span>Sin duración fija</span>}
                    <span>{d.unidades} vendido{d.unidades === 1 ? '' : 's'}</span>
                    <span>{money(d.importe)} facturado</span>
                  </div>

                  {s.responsables?.length > 0 && (
                    <div className="helm-svc-people">
                      <Users size={12} />
                      {s.responsables.map(p => (
                        <span key={p.id || p.name} className="helm-tag">{p.name}{p.role ? ` · ${roleLabel(p.role)}` : ''}</span>
                      ))}
                    </div>
                  )}

                  {s.recursos?.length > 0 && (
                    <div className="helm-svc-links">
                      {s.recursos.map((r, i) => (
                        <a key={i} className="helm-btn sm" href={r.url} target="_blank" rel="noreferrer">
                          <Link2 size={13} />{r.label || 'Recurso'}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="helm-svc-foot">
                    <label className="helm-switch">
                      <input type="checkbox" checked={s.active !== false} onChange={() => toggleActive(s)} />
                      <span>{s.active === false ? 'Inactivo' : 'Activo'}</span>
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Pencil size={15} className="helm-x" title="Editar" onClick={() => setEdit(toForm(s))} />
                      <Trash2 size={15} className="helm-x" title="Eliminar" onClick={() => remove(s)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {edit && <ServicioModal inicial={edit} people={people} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  )
}

function ServicioModal({ inicial, people, onClose, onSave }) {
  const [form, setForm] = useState(inicial)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const errors = {}
  if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
  if (form.price !== '' && Number(form.price) < 0) errors.price = 'No puede ser negativo'
  if (form.duration_days !== '' && Number(form.duration_days) < 0) errors.duration_days = 'No puede ser negativo'
  form.recursos.forEach((r, i) => {
    if (r.url?.trim() && !/^https?:\/\/|^[\w-]+\./i.test(r.url.trim())) errors['recurso' + i] = 'URL no válida'
  })
  const ok = Object.keys(errors).length === 0
  const shown = touched ? errors : {}

  // Responsables: se guarda una copia del nombre y el rol junto al id, para que
  // el servicio siga legible aunque la persona se dé de baja del equipo.
  function togglePersona(p) {
    set('responsables', form.responsables.some(x => x.id === p.id)
      ? form.responsables.filter(x => x.id !== p.id)
      : [...form.responsables, { id: p.id, name: p.name, role: p.role }])
  }

  const setRecurso = (i, k, v) => set('recursos', form.recursos.map((r, j) => j === i ? { ...r, [k]: v } : r))

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setSaving(true)
    try { await onSave(form) } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title={form.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="helm-form-2">
          <Field label="Nombre *" error={shown.name}>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Consultoría de escalado" autoFocus />
          </Field>
          <Field label="Formato">
            <Input value={form.format} onChange={e => set('format', e.target.value)} list="helm-svc-formatos" placeholder="1 a 1, grupal…" />
            <datalist id="helm-svc-formatos">{FORMATOS.map(f => <option key={f} value={f} />)}</datalist>
          </Field>
        </div>

        <div className="helm-form-2">
          <Field label="Precio (€)" error={shown.price}>
            <MoneyInput value={form.price} onChange={v => set('price', v)} />
          </Field>
          <Field label="Facturación">
            <Select value={form.billing} onChange={e => set('billing', e.target.value)}>
              {BILLINGS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Duración (días)" error={shown.duration_days} hint="Déjalo vacío si no tiene fin definido">
          <CountInput value={form.duration_days} onChange={v => set('duration_days', v)} placeholder="90" />
        </Field>

        <Field label="Descripción">
          <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
            placeholder="Qué incluye, para quién es, qué resultado promete…" />
        </Field>

        <div className="helm-drawer-section">Responsables implicados</div>
        {people.length === 0 ? (
          <p className="helm-settings-lead">
            Aún no hay nadie en <b>Equipo y perfiles</b>. Da de alta a tu gente allí y podrás asignarla aquí.
          </p>
        ) : (
          <div className="helm-pickers">
            {people.filter(p => p.active !== false).map(p => (
              <button
                key={p.id} type="button"
                className={'helm-pick' + (form.responsables.some(x => x.id === p.id) ? ' on' : '')}
                onClick={() => togglePersona(p)}
              >
                {p.name}<small>{roleLabel(p.role)}</small>
              </button>
            ))}
          </div>
        )}

        <div className="helm-drawer-section">Enlaces y recursos</div>
        {form.recursos.map((r, i) => (
          <div key={i} className="helm-form-2" style={{ gridTemplateColumns: '1fr 1.4fr auto', alignItems: 'start' }}>
            <Field label={i === 0 ? 'Nombre' : ''}>
              <Input value={r.label || ''} onChange={e => setRecurso(i, 'label', e.target.value)} placeholder="Guion de onboarding" />
            </Field>
            <Field label={i === 0 ? 'URL' : ''} error={shown['recurso' + i]}>
              <Input value={r.url || ''} onChange={e => setRecurso(i, 'url', e.target.value)} placeholder="drive.google.com/…" />
            </Field>
            <Field label={i === 0 ? ' ' : ''}>
              <button type="button" className="helm-btn" onClick={() => set('recursos', form.recursos.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </Field>
          </div>
        ))}
        <button type="button" className="helm-btn" onClick={() => set('recursos', [...form.recursos, { label: '', url: '' }])}>
          <Plus size={14} />Añadir recurso
        </button>

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear servicio'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
