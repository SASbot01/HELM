// HELM plugin — Tareas. Tablero kanban (drag&drop) sobre crm_tasks, scoped al
// perfil. Filtros por prioridad, responsable y cliente; checklist de subtareas.
//
// El responsable sale de `helm_team` (el directorio de personas) y no de
// `team` (la tabla de login): así se puede asignar trabajo a alguien que no
// entra al panel, que es lo normal en un editor o un closer externo. Las tareas
// antiguas apuntan a `team` y se siguen mostrando.
//
// AVISOS: se puede marcar por dónde hay que notificar al responsable y queda
// registrado en la tarea, pero el envío real necesita un proveedor de email o
// WhatsApp que todavía no está decidido. La cola se llena igualmente para no
// perder los avisos mientras tanto; ver `notify_channels` / `notified_at`.
import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Check, Trash2, Calendar, ListChecks, User, Bell, ChevronLeft, ChevronRight,
  LayoutGrid, CalendarDays,
} from 'lucide-react'
import {
  supabase, fetchRows, fetchRowsOrError, insertRow, updateRow, deleteRow, fmtDate, todayISO,
} from '../lib'
import { Empty, Modal, Drawer, Field, Input, Textarea, Select, FormNote, SearchSelect } from '../ui'
import { roleLabel } from '../equipo/roles'

const STATUSES = [
  { key: 'todo', label: 'Por hacer', tone: '' },
  { key: 'in_progress', label: 'En curso', tone: 'cyan' },
  { key: 'review', label: 'En revisión', tone: 'amber' },
  { key: 'done', label: 'Hecho', tone: 'green' },
]
const PRIORITIES = [
  { key: 'high', label: 'Alta', tone: 'red' },
  { key: 'medium', label: 'Media', tone: 'amber' },
  { key: 'low', label: 'Baja', tone: 'cyan' },
]
const CANALES = [
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
]
const toneOf = (p) => PRIORITIES.find(x => x.key === p)?.tone || ''
const prioLabel = (p) => PRIORITIES.find(x => x.key === p)?.label || p

const NEW = {
  title: '', description: '', priority: 'medium', status: 'todo', due_date: '',
  assignee_helm_id: '', contact: { id: null, label: '' }, service_id: '', notify_channels: [],
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const effStatus = (t) => t.status || (t.completed ? 'done' : 'todo')
const asArray = (v) => (Array.isArray(v) ? v : [])
const isOverdue = (t) => t.due_date && effStatus(t) !== 'done' && t.due_date.slice(0, 10) < todayISO()

// ── Calendario ─────────────────────────────────────────────────────────────
// Fechas en local, nunca por ISO/UTC: `new Date('2026-03-01')` se interpreta en
// UTC y en España cae en el día anterior, así que el mes salía desplazado.
const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const mesLabel = (d) => d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

// La rejilla del mes, empezando en lunes. Se rellena con los días de los meses
// vecinos hasta completar semanas, y se recorta la última si sobra entera.
function semanasDe(mes) {
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const hueco = (inicio.getDay() + 6) % 7            // lunes = 0
  const dias = []
  for (let i = 0; i < 42; i++) {
    dias.push(new Date(mes.getFullYear(), mes.getMonth(), 1 - hueco + i))
  }
  const semanas = []
  for (let i = 0; i < 42; i += 7) semanas.push(dias.slice(i, i + 7))
  while (semanas.length > 4 && semanas.at(-1).every(d => d.getMonth() !== mes.getMonth())) semanas.pop()
  return semanas
}

export default function Tareas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState([])     // helm_team: el directorio
  const [legacy, setLegacy] = useState([])     // team: solo para tareas antiguas
  const [contacts, setContacts] = useState([])
  const [services, setServices] = useState([])
  const [prioF, setPrioF] = useState('all')
  const [assF, setAssF] = useState('all')
  const [cliF, setCliF] = useState('all')
  const [dragKey, setDragKey] = useState(null)
  const [vista, setVista] = useState('kanban')       // kanban | calendario
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1) })
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(null)   // tarea abierta en el drawer
  const [error, setError] = useState(null)
  // Descripciones desplegadas: en la tarjeta se recorta a 2 líneas y aquí
  // guardamos las que el usuario ha abierto para leerlas enteras.
  const [abiertas, setAbiertas] = useState(() => new Set())

  const toggleDesc = (id) => setAbiertas(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const load = () => fetchRows('crm_tasks', clientId).then(setRows)

  useEffect(() => {
    load()
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
    fetchRowsOrError('helm_services', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setServices(r))
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
    supabase.from('team').select('id, name').eq('client_id', clientId).eq('active', true).order('name')
      .then(({ data }) => setLegacy(data || []))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nombre del responsable, venga del directorio nuevo o de la tabla antigua.
  const nameOf = (t) =>
    people.find(m => m.id === t.assignee_helm_id)?.name
    || legacy.find(m => m.id === t.assignee_id)?.name
    || null

  const clienteDe = (t) => contacts.find(c => c.id === t.contact_id)?.name || null

  const filtered = useMemo(() => (rows || []).filter(t => {
    if (prioF !== 'all' && t.priority !== prioF) return false
    if (assF !== 'all') {
      const asignado = t.assignee_helm_id || t.assignee_id
      if (assF === 'none' ? Boolean(asignado) : asignado !== assF) return false
    }
    if (cliF !== 'all' && t.contact_id !== cliF) return false
    return true
  }), [rows, prioF, assF, cliF])

  const byStatus = useMemo(() => Object.fromEntries(
    STATUSES.map(s => [s.key, filtered.filter(t => effStatus(t) === s.key)]),
  ), [filtered])

  // Clientes que tienen alguna tarea, para el filtro.
  const clientesConTareas = useMemo(() => {
    const ids = [...new Set((rows || []).map(t => t.contact_id).filter(Boolean))]
    return ids.map(id => contacts.find(c => c.id === id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, contacts])

  async function moveTo(t, status) {
    if (effStatus(t) === status) return
    const done = status === 'done'
    setRows(rs => rs.map(r => (r.id === t.id ? { ...r, status, completed: done } : r)))
    try {
      await updateRow('crm_tasks', t.id, {
        status, completed: done, completed_at: done ? new Date().toISOString() : null,
      })
    } catch { load() }
  }

  // Arrastrar una tarea a otro día del calendario le cambia el vencimiento.
  async function moveToDate(t, iso) {
    if ((t.due_date || '').slice(0, 10) === iso) return
    const due = iso ? new Date(`${iso}T12:00:00`).toISOString() : null
    setRows(rs => rs.map(r => (r.id === t.id ? { ...r, due_date: due } : r)))
    try { await updateRow('crm_tasks', t.id, { due_date: due }) } catch { load() }
  }

  async function create(form) {
    const row = await insertRow('crm_tasks', {
      client_id: clientId, title: form.title.trim(), description: form.description.trim(),
      priority: form.priority, status: form.status,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      assignee_helm_id: form.assignee_helm_id || null,
      contact_id: form.contact.id,
      service_id: form.service_id || null,
      notify_channels: form.notify_channels,
      checklist: [],
    })
    setRows(rs => [row, ...(rs || [])])
    setCreating(false)
  }

  async function remove(id) {
    setError(null)
    try {
      await deleteRow('crm_tasks', id)
      setRows(rs => rs.filter(r => r.id !== id))
      setActive(null)
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  const counts = STATUSES.map(s => (byStatus[s.key] || []).length)
  const activos = people.filter(p => p.active !== false)

  return (
    <>
      <div className="helm-crm-bar">
        <div className="helm-chips">
          <button className={'helm-chip' + (prioF === 'all' ? ' active' : '')} onClick={() => setPrioF('all')}>Todas</button>
          {PRIORITIES.map(p => (
            <button key={p.key} className={'helm-chip' + (prioF === p.key ? ' active' : '')} onClick={() => setPrioF(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="helm-crm-actions">
          <div className="helm-vista-tabs">
            <button
              className={'helm-vista-tab' + (vista === 'kanban' ? ' active' : '')}
              onClick={() => setVista('kanban')} title="Tablero"
            >
              <LayoutGrid size={14} /> Tablero
            </button>
            <button
              className={'helm-vista-tab' + (vista === 'calendario' ? ' active' : '')}
              onClick={() => setVista('calendario')} title="Calendario"
            >
              <CalendarDays size={14} /> Calendario
            </button>
          </div>
          <select className="helm-select" value={assF} onChange={e => setAssF(e.target.value)}>
            <option value="all">Todo el equipo</option>
            <option value="none">Sin asignar</option>
            {activos.map(m => <option key={m.id} value={m.id}>{m.name} · {roleLabel(m.role)}</option>)}
            {legacy.filter(l => !activos.some(a => a.id === l.id)).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {clientesConTareas.length > 0 && (
            <select className="helm-select" value={cliF} onChange={e => setCliF(e.target.value)}>
              <option value="all">Todos los clientes</option>
              {clientesConTareas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="helm-btn primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> Nueva tarea
          </button>
        </div>
      </div>

      {error && <FormNote>{error}</FormNote>}

      {rows == null ? (
        <Empty>Cargando…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Sin tareas. Crea la primera.</Empty>
      ) : vista === 'calendario' ? (
        <Calendario
          tareas={filtered} mes={mes} onMes={setMes}
          onAbrir={setActive} onFecha={moveToDate} nameOf={nameOf}
        />
      ) : (
        <div className="helm-kanban">
          {STATUSES.map((s, i) => (
            <div
              key={s.key}
              className={'helm-col' + (dragKey === s.key ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); if (dragKey !== s.key) setDragKey(s.key) }}
              onDragLeave={() => setDragKey(k => (k === s.key ? null : k))}
              onDrop={e => {
                e.preventDefault(); setDragKey(null)
                const id = e.dataTransfer.getData('text/plain')
                const t = rows.find(r => r.id === id)
                if (t) moveTo(t, s.key)
              }}
            >
              <div className="helm-col-head">
                <span className={'helm-dot ' + s.tone} />
                <b>{s.label}</b>
                <span className="helm-col-count">{counts[i]}</span>
              </div>
              <div className="helm-col-body">
                {(byStatus[s.key] || []).map(t => {
                  const chk = asArray(t.checklist)
                  const chkDone = chk.filter(c => c.done).length
                  const cliente = clienteDe(t)
                  return (
                    <div
                      key={t.id}
                      className="helm-kcard"
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
                      onClick={() => setActive(t)}
                    >
                      <div className="helm-kcard-top"><b>{t.title}</b></div>
                      {cliente && <div className="helm-kcard-sub"><User size={12} />{cliente}</div>}
                      {t.description && (() => {
                        const abierta = abiertas.has(t.id)
                        // Solo ofrecemos "Ver más" si el texto da para recortarse.
                        const largo = t.description.length > 90 || t.description.includes('\n')
                        return (
                          <>
                            <div className={'helm-tcard-desc' + (abierta ? ' open' : '')}>{t.description}</div>
                            {largo && (
                              <button
                                type="button"
                                className="helm-tcard-more"
                                onClick={e => { e.stopPropagation(); toggleDesc(t.id) }}
                              >
                                {abierta ? 'Ver menos' : 'Ver más'}
                              </button>
                            )}
                          </>
                        )
                      })()}
                      <div className="helm-kcard-meta">
                        <span className={'helm-chip ' + toneOf(t.priority)}>{prioLabel(t.priority)}</span>
                        {t.due_date && (
                          <span className={'helm-task-due' + (isOverdue(t) ? ' over' : '')}>
                            <Calendar size={11} /> {fmtDate(t.due_date)}
                          </span>
                        )}
                        {chk.length > 0 && (
                          <span className="helm-chk"><ListChecks size={11} /> {chkDone}/{chk.length}</span>
                        )}
                        {asArray(t.notify_channels).length > 0 && (
                          <span className="helm-chk" title="Aviso pendiente de enviar"><Bell size={11} /></span>
                        )}
                        {nameOf(t) && (
                          <span className="helm-assignee" title={nameOf(t)}>{initials(nameOf(t))}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {(byStatus[s.key] || []).length === 0 && <div className="helm-col-empty">Suelta aquí</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <TaskModal
          people={activos} contacts={contacts} services={services}
          onClose={() => setCreating(false)} onSave={create}
        />
      )}

      {active && (
        <TaskDrawer
          task={active} people={activos} legacy={legacy} contacts={contacts} services={services}
          onClose={() => setActive(null)}
          onSaved={(patch) => {
            setRows(rs => rs.map(r => r.id === active.id ? { ...r, ...patch } : r))
            setActive(null)
          }}
          onDelete={() => remove(active.id)}
        />
      )}
    </>
  )
}

// Vista de mes. Las tareas se colocan por fecha de vencimiento; las que no
// tienen fecha van aparte, y se les pone una arrastrándolas a un día.
function Calendario({ tareas, mes, onMes, onAbrir, onFecha, nameOf }) {
  const [sobre, setSobre] = useState(null)   // día resaltado mientras se arrastra

  const semanas = useMemo(() => semanasDe(mes), [mes])
  const hoy = isoLocal(new Date())

  const porDia = useMemo(() => {
    const map = {}
    for (const t of tareas) {
      if (!t.due_date) continue
      const k = t.due_date.slice(0, 10)
      ;(map[k] = map[k] || []).push(t)
    }
    // Dentro de un día, primero lo urgente: así el recorte a 3 no esconde lo que importa.
    const orden = { high: 0, medium: 1, low: 2 }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (orden[a.priority] ?? 1) - (orden[b.priority] ?? 1))
    return map
  }, [tareas])

  const sinFecha = useMemo(() => tareas.filter(t => !t.due_date), [tareas])

  const salta = (n) => onMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1))
  const drop = (e, iso) => {
    e.preventDefault(); setSobre(null)
    const t = tareas.find(r => r.id === e.dataTransfer.getData('text/plain'))
    if (t) onFecha(t, iso)
  }

  const Pastilla = ({ t }) => (
    <button
      className={'helm-cal-task ' + toneOf(t.priority) + (effStatus(t) === 'done' ? ' done' : '') + (isOverdue(t) ? ' over' : '')}
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
      onClick={() => onAbrir(t)}
      title={`${t.title}${nameOf(t) ? ` · ${nameOf(t)}` : ''}`}
    >
      <span className="helm-cal-task-t">{t.title}</span>
      {nameOf(t) && <span className="helm-cal-task-a">{initials(nameOf(t))}</span>}
    </button>
  )

  return (
    <div className="helm-cal">
      <div className="helm-cal-head">
        <button className="helm-btn sm" onClick={() => salta(-1)} aria-label="Mes anterior"><ChevronLeft size={14} /></button>
        <b className="helm-cal-mes">{mesLabel(mes)}</b>
        <button className="helm-btn sm" onClick={() => salta(1)} aria-label="Mes siguiente"><ChevronRight size={14} /></button>
        <button className="helm-btn sm" onClick={() => { const h = new Date(); onMes(new Date(h.getFullYear(), h.getMonth(), 1)) }}>
          Hoy
        </button>
      </div>

      <div className="helm-cal-dias">{DIAS.map(d => <span key={d}>{d}</span>)}</div>

      <div className="helm-cal-grid">
        {semanas.flat().map(d => {
          const iso = isoLocal(d)
          const suyas = porDia[iso] || []
          const fuera = d.getMonth() !== mes.getMonth()
          return (
            <div
              key={iso}
              className={'helm-cal-dia' + (fuera ? ' fuera' : '') + (iso === hoy ? ' hoy' : '') + (sobre === iso ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); if (sobre !== iso) setSobre(iso) }}
              onDragLeave={() => setSobre(s => (s === iso ? null : s))}
              onDrop={e => drop(e, iso)}
            >
              <span className="helm-cal-n">{d.getDate()}</span>
              {suyas.slice(0, 3).map(t => <Pastilla key={t.id} t={t} />)}
              {suyas.length > 3 && <span className="helm-cal-mas">+{suyas.length - 3} más</span>}
            </div>
          )
        })}
      </div>

      {sinFecha.length > 0 && (
        <div
          className={'helm-cal-sinfecha' + (sobre === '' ? ' over' : '')}
          onDragOver={e => { e.preventDefault(); if (sobre !== '') setSobre('') }}
          onDragLeave={() => setSobre(s => (s === '' ? null : s))}
          onDrop={e => drop(e, '')}
        >
          <b>Sin fecha ({sinFecha.length})</b>
          <div className="helm-cal-sinfecha-list">
            {sinFecha.map(t => <Pastilla key={t.id} t={t} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// Campos compartidos por el alta y la ficha: responsable, cliente, servicio y
// avisos. Duplicarlos era lo que hacía que el drawer se quedara atrás.
function CamposTarea({ f, set, people, contacts, services }) {
  const toggleCanal = (k) => set('notify_channels',
    asArray(f.notify_channels).includes(k)
      ? f.notify_channels.filter(x => x !== k)
      : [...asArray(f.notify_channels), k])

  const responsable = people.find(p => p.id === f.assignee_helm_id)

  return (
    <>
      <div className="helm-form-2">
        <Field label="Prioridad">
          <Select value={f.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
      </div>

      <div className="helm-form-2">
        <Field label="Responsable" hint={people.length ? 'Cualquier perfil del equipo' : 'Da de alta a tu gente en Equipo y perfiles'}>
          <Select value={f.assignee_helm_id} onChange={e => set('assignee_helm_id', e.target.value)}>
            <option value="">Sin asignar</option>
            {people.map(m => <option key={m.id} value={m.id}>{m.name} · {roleLabel(m.role)}</option>)}
          </Select>
        </Field>
        <Field label="Vence">
          <Input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
        </Field>
      </div>

      <Field label="Cliente" hint="Adjunta la tarea a un contacto del CRM">
        <SearchSelect
          value={f.contact}
          onChange={c => set('contact', c)}
          placeholder="Buscar en el CRM…"
          emptyText="Nadie con ese nombre"
          allowFree={false}
          options={contacts.map(c => ({
            id: c.id, label: c.name, sub: [c.company, c.email].filter(Boolean).join(' · '),
          }))}
        />
      </Field>

      {services.length > 0 && (
        <Field label="Servicio">
          <Select value={f.service_id} onChange={e => set('service_id', e.target.value)}>
            <option value="">— Ninguno —</option>
            {services.filter(s => s.active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Avisar al responsable">
        <div className="helm-pickers" style={{ marginBottom: 0 }}>
          {CANALES.map(c => (
            <button
              key={c.key} type="button"
              className={'helm-pick' + (asArray(f.notify_channels).includes(c.key) ? ' on' : '')}
              onClick={() => toggleCanal(c.key)}
              disabled={!f.assignee_helm_id}
            >{c.label}</button>
          ))}
        </div>
      </Field>
      {asArray(f.notify_channels).length > 0 && (
        <FormNote tone="warn">
          El aviso queda registrado en la tarea, pero <b>todavía no se envía</b>: falta
          conectar un proveedor de {f.notify_channels.join(' y ')}.
          {responsable && !responsable.email && f.notify_channels.includes('email') && ' Además, esta persona no tiene email en su ficha.'}
          {responsable && !responsable.whatsapp && !responsable.phone && f.notify_channels.includes('whatsapp') && ' Además, esta persona no tiene WhatsApp en su ficha.'}
        </FormNote>
      )}
    </>
  )
}

function TaskModal({ people, contacts, services, onClose, onSave }) {
  const [f, setF] = useState(NEW)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const errores = {}
  if (!f.title.trim()) errores.title = 'El título es obligatorio'
  if (f.due_date && f.due_date < todayISO()) errores.due_date = 'La fecha ya ha pasado'
  const ok = !errores.title   // una fecha pasada avisa pero no bloquea
  const shown = touched ? errores : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setBusy(true)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Nueva tarea" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <Field label="Título *" error={shown.title}>
          <Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus />
        </Field>
        <Field label="Descripción">
          <Textarea value={f.description} onChange={e => set('description', e.target.value)} />
        </Field>
        <CamposTarea f={f} set={set} people={people} contacts={contacts} services={services} />
        {shown.due_date && <FormNote tone="warn">{shown.due_date}</FormNote>}
        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Detalle de tarea (drawer): edición + checklist de subtareas ──────────────
function TaskDrawer({ task, people, legacy, contacts, services, onClose, onSaved, onDelete }) {
  const contactoActual = contacts.find(c => c.id === task.contact_id)
  const [f, setF] = useState({
    title: task.title || '', description: task.description || '',
    priority: task.priority || 'medium', status: effStatus(task),
    due_date: task.due_date ? task.due_date.slice(0, 10) : '',
    // Las tareas antiguas guardaban el responsable en `team`; se conserva el
    // valor para no desasignarlas solo por abrirlas.
    assignee_helm_id: task.assignee_helm_id || '',
    contact: { id: task.contact_id || null, label: contactoActual?.name || '' },
    service_id: task.service_id || '',
    notify_channels: asArray(task.notify_channels),
    checklist: asArray(task.checklist),
  })
  const [newItem, setNewItem] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const chkDone = f.checklist.filter(c => c.done).length
  const addItem = () => {
    const text = newItem.trim()
    if (!text) return
    set('checklist', [...f.checklist, { text, done: false }])
    setNewItem('')
  }
  const toggleItem = (i) => set('checklist', f.checklist.map((c, ci) => (ci === i ? { ...c, done: !c.done } : c)))
  const delItem = (i) => set('checklist', f.checklist.filter((_, ci) => ci !== i))

  const responsableAntiguo = legacy.find(m => m.id === task.assignee_id)?.name

  async function save() {
    if (!f.title.trim()) return setError('El título es obligatorio')
    setBusy(true); setError(null)
    const done = f.status === 'done'
    const patch = {
      title: f.title.trim(), description: f.description.trim(),
      priority: f.priority, status: f.status,
      due_date: f.due_date ? new Date(f.due_date).toISOString() : null,
      assignee_helm_id: f.assignee_helm_id || null,
      contact_id: f.contact.id, service_id: f.service_id || null,
      notify_channels: f.notify_channels, checklist: f.checklist,
      completed: done, completed_at: done ? new Date().toISOString() : null,
    }
    try {
      await updateRow('crm_tasks', task.id, patch)
      onSaved(patch)
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Drawer
      title="Tarea"
      sub={people.find(m => m.id === f.assignee_helm_id)?.name || responsableAntiguo || 'Sin asignar'}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <button className="helm-btn" onClick={onDelete}><Trash2 size={15} /> Eliminar</button>
          <button className="helm-btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      <Field label="Título"><Input value={f.title} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="Descripción"><Textarea value={f.description} onChange={e => set('description', e.target.value)} /></Field>

      <CamposTarea f={f} set={set} people={people} contacts={contacts} services={services} />

      {responsableAntiguo && !f.assignee_helm_id && (
        <FormNote tone="warn">
          Esta tarea estaba asignada a <b>{responsableAntiguo}</b> desde el sistema de accesos
          antiguo. Vuelve a elegir responsable arriba para pasarla al directorio de equipo.
        </FormNote>
      )}

      <div className="helm-chk-block">
        <div className="helm-chk-head">
          <b><ListChecks size={15} /> Subtareas</b>
          {f.checklist.length > 0 && <span>{chkDone}/{f.checklist.length}</span>}
        </div>
        <div className="helm-chk-list">
          {f.checklist.map((c, i) => (
            <div key={i} className={'helm-chk-item' + (c.done ? ' done' : '')}>
              <button type="button" className={'helm-check' + (c.done ? ' on' : '')} onClick={() => toggleItem(i)}>
                {c.done && <Check size={12} />}
              </button>
              <span>{c.text}</span>
              <Trash2 size={14} className="helm-x" onClick={() => delItem(i)} />
            </div>
          ))}
        </div>
        <div className="helm-chk-add">
          <Input
            value={newItem} placeholder="Añadir subtarea…"
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
          />
          <button type="button" className="helm-btn" onClick={addItem}><Plus size={15} /></button>
        </div>
      </div>

      <FormNote>{error}</FormNote>
    </Drawer>
  )
}
