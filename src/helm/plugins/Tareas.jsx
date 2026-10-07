// HELM plugin — Tareas. Tablero kanban (drag&drop) sobre crm_tasks, scoped al
// perfil. Filtros por prioridad, responsable y cliente; checklist de subtareas.
//
// El responsable sale de `helm_team` (el directorio de personas) y no de
// `team` (la tabla de login): así se puede asignar trabajo a alguien que no
// entra al panel, que es lo normal en un editor o un closer externo. Las tareas
// antiguas apuntan a `team` y se siguen mostrando.
//
// TAREAS PRIVADAS: una tarea marcada como privada solo aparece en el tablero de
// su responsable y en el de quien manda en el perfil. Ojo con lo que significa:
// el panel lee Supabase con la anon key, así que esto ESCONDE la tarea, no la
// protege — quien sepa consultar la tabla la sigue viendo. Sirve para que el
// equipo no se cruce con lo que no le toca, no para guardar secretos.
//
// COLABORACIÓN: dos perfiles que han aceptado colaborar pueden encargarse
// tareas. La tarea vive en el tablero del que TIENE QUE HACERLA (client_id) y
// recuerda quién la encargó (origin_client_id). Ver colaboracion.js.
//
// AVISOS: se puede marcar por dónde hay que notificar al responsable y queda
// registrado en la tarea, pero el envío real necesita un proveedor de email o
// WhatsApp que todavía no está decidido. La cola se llena igualmente para no
// perder los avisos mientras tanto; ver `notify_channels` / `notified_at`.
import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Check, Trash2, Calendar, ListChecks, User, Bell, ChevronLeft, ChevronRight,
  LayoutGrid, CalendarDays, Lock, Building2, Send, X,
} from 'lucide-react'
import {
  supabase, fetchRows, fetchRowsOrError, insertRow, updateRow, deleteRow, fmtDate, todayISO,
  listClients,
} from '../lib'
import { Empty, Modal, Drawer, Field, Input, Textarea, Select, FormNote, SearchSelect } from '../ui'
import { roleLabel } from '../equipo/roles'
import { sesionHelm } from '../permisos'
import {
  listaColaboraciones, pedirColaboracion, responderColaboracion, deshacerColaboracion,
  idsColaboradores, esperandoRespuesta, laOtraParte, ACEPTADA, PENDIENTE, RECHAZADA,
} from './colaboracion'

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
  visibility: 'equipo', destino: '',   // destino '' = este perfil
}

// Las columnas que trae helm_tareas_colaboracion.sql. Mientras esa migración no
// esté aplicada hay que dejarlas fuera de todo insert y update: Postgres
// rechaza la fila entera por una columna que no existe, y eso convertiría "no
// has aplicado una migración" en "no se pueden crear tareas".
const COLUMNAS_NUEVAS = ['visibility', 'origin_client_id']
const sinLasNuevas = (fila) =>
  Object.fromEntries(Object.entries(fila).filter(([k]) => !COLUMNAS_NUEVAS.includes(k)))

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const effStatus = (t) => t.status || (t.completed ? 'done' : 'todo')
const asArray = (v) => (Array.isArray(v) ? v : [])
const isOverdue = (t) => t.due_date && effStatus(t) !== 'done' && t.due_date.slice(0, 10) < todayISO()
const esPrivada = (t) => t.visibility === 'privada'

// ── Calendario ─────────────────────────────────────────────────────────────
// Fechas en local, nunca por ISO/UTC: `new Date('2026-03-01')` se interpreta en
// UTC y en España cae en el día anterior, así que el mes salía desplazado.
const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const mesLabel = (d) => d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
const diaLargo = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

// El lunes de la semana a la que pertenece una fecha.
function lunesDe(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

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
  const [perfiles, setPerfiles] = useState([]) // todos los perfiles de HELM
  const [colabs, setColabs] = useState([])     // helm_collaborations
  const [faltaColabTabla, setFaltaColabTabla] = useState(false)
  // La migración helm_tareas_colaboracion.sql no está aplicada: ni tareas
  // privadas ni encargos a otros perfiles, pero el tablero funciona como antes.
  const [sinMigracion, setSinMigracion] = useState(false)
  const [prioF, setPrioF] = useState('all')
  const [assF, setAssF] = useState('all')
  const [cliF, setCliF] = useState('all')
  const [dragKey, setDragKey] = useState(null)
  const [vista, setVista] = useState('kanban')       // kanban | calendario | encargadas
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1) })
  const [creating, setCreating] = useState(false)
  const [verColabs, setVerColabs] = useState(false)
  const [active, setActive] = useState(null)   // tarea abierta en el drawer
  const [error, setError] = useState(null)
  // El número de ticket: su orden de creación en el perfil, estable aunque
  // cambie de columna o se filtre.
  const numeroDe = useMemo(() => new Map(
    [...(rows || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((t, i) => [t.id, i + 1]),
  ), [rows])
  // Descripciones desplegadas: en la tarjeta se recorta a 2 líneas y aquí
  // guardamos las que el usuario ha abierto para leerlas enteras.
  const [abiertas, setAbiertas] = useState(() => new Set())

  // Quién está mirando. De aquí sale qué tareas privadas puede ver.
  const yo = useMemo(() => sesionHelm(), [])

  const toggleDesc = (id) => setAbiertas(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Las tareas de este perfil MÁS las que este perfil encargó a otros. Sin la
  // segunda mitad, encargar trabajo fuera sería mandarlo a un agujero: no
  // habría forma de saber si se hizo.
  //
  // Si la migración de colaboración no está aplicada, `origin_client_id` no
  // existe y la consulta falla entera; se cae al listado de siempre para que el
  // tablero siga funcionando igual que antes.
  const load = () => supabase
    .from('crm_tasks').select('*')
    .or(`client_id.eq.${clientId},origin_client_id.eq.${clientId}`)
    .order('created_at', { ascending: false }).limit(500)
    .then(({ data, error: err }) => {
      if (!err) { setRows(data || []); return null }
      // La consulta solo puede fallar por una razón previsible: la migración de
      // colaboración no está aplicada y `origin_client_id` no existe. Se cae al
      // listado de siempre y se apagan las funciones que dependen de ella.
      setSinMigracion(true)
      return fetchRows('crm_tasks', clientId).then(setRows)
    })

  useEffect(() => {
    load()
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
    fetchRowsOrError('helm_services', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setServices(r))
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
    supabase.from('team').select('id, name').eq('client_id', clientId).eq('active', true).order('name')
      .then(({ data }) => setLegacy(data || []))
    listClients().then(setPerfiles)
    listaColaboraciones(clientId).then(({ filas, faltaTabla }) => {
      setColabs(filas)
      setFaltaColabTabla(faltaTabla)
    })
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const nombrePerfil = (id) => perfiles.find(p => p.id === id)?.name || 'Otro perfil'

  // Perfiles con los que ya se puede intercambiar trabajo.
  const colaboradores = useMemo(() => {
    const ids = new Set(idsColaboradores(colabs, clientId))
    return perfiles.filter(p => ids.has(p.id))
  }, [colabs, perfiles, clientId])

  const pendientesDeContestar = useMemo(
    () => colabs.filter(c => esperandoRespuesta(c, clientId)).length,
    [colabs, clientId],
  )

  // Nombre del responsable, venga del directorio nuevo o de la tabla antigua.
  const nameOf = (t) =>
    people.find(m => m.id === t.assignee_helm_id)?.name
    || legacy.find(m => m.id === t.assignee_id)?.name
    || null

  const clienteDe = (t) => contacts.find(c => c.id === t.contact_id)?.name || null

  // ── Qué tareas puede ver quien está mirando ──────────────────────────────
  // Lo privado se descuenta ANTES que cualquier filtro: si no, los contadores
  // de las columnas delatarían que hay algo que no se puede abrir.
  const permitidas = useMemo(() => (rows || []).filter(t => {
    if (!esPrivada(t)) return true
    if (yo.mandaEnTodo) return true
    return Boolean(yo.helmTeamId) && t.assignee_helm_id === yo.helmTeamId
  }), [rows, yo])

  // El tablero es lo que este perfil tiene que hacer. Lo que encargó a otros
  // vive en su propia pestaña: mezclarlo aquí sería contar dos veces el trabajo.
  const delPerfil = useMemo(() => permitidas.filter(t => t.client_id === clientId), [permitidas, clientId])
  const encargadas = useMemo(
    () => permitidas.filter(t => t.client_id !== clientId && t.origin_client_id === clientId),
    [permitidas, clientId],
  )

  const filtered = useMemo(() => delPerfil.filter(t => {
    if (prioF !== 'all' && t.priority !== prioF) return false
    if (assF !== 'all') {
      const asignado = t.assignee_helm_id || t.assignee_id
      if (assF === 'none' ? Boolean(asignado) : asignado !== assF) return false
    }
    if (cliF !== 'all' && t.contact_id !== cliF) return false
    return true
  }), [delPerfil, prioF, assF, cliF])

  const byStatus = useMemo(() => Object.fromEntries(
    STATUSES.map(s => [s.key, filtered.filter(t => effStatus(t) === s.key)]),
  ), [filtered])

  // Clientes que tienen alguna tarea, para el filtro.
  const clientesConTareas = useMemo(() => {
    const ids = [...new Set(delPerfil.map(t => t.contact_id).filter(Boolean))]
    return ids.map(id => contacts.find(c => c.id === id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [delPerfil, contacts])

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
    // Encargar a otro perfil: la tarea nace en SU tablero y recuerda de dónde
    // vino. El responsable, el contacto del CRM y el servicio se quedan fuera
    // a propósito: son gente y catálogo de esta casa, y allí no significan nada.
    const fuera = Boolean(form.destino)
    const fila = {
      client_id: fuera ? form.destino : clientId,
      origin_client_id: fuera ? clientId : null,
      title: form.title.trim(), description: form.description.trim(),
      priority: form.priority, status: form.status,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      assignee_helm_id: fuera ? null : (form.assignee_helm_id || null),
      contact_id: fuera ? null : form.contact.id,
      service_id: fuera ? null : (form.service_id || null),
      notify_channels: fuera ? [] : form.notify_channels,
      visibility: fuera ? 'equipo' : form.visibility,
      checklist: [],
    }
    const row = await insertRow('crm_tasks', sinMigracion ? sinLasNuevas(fila) : fila)
    setRows(rs => [row, ...(rs || [])])
    setCreating(false)
    if (fuera) setVista('encargadas')
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
            {encargadas.length > 0 && (
              <button
                className={'helm-vista-tab' + (vista === 'encargadas' ? ' active' : '')}
                onClick={() => setVista('encargadas')} title="Lo que has encargado a otros perfiles"
              >
                <Send size={14} /> Encargadas <span className="helm-col-count">{encargadas.length}</span>
              </button>
            )}
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
          <button
            className={'helm-btn' + (pendientesDeContestar ? ' primary' : '')}
            onClick={() => setVerColabs(true)}
            title="Colaborar con otros perfiles de HELM"
          >
            <Building2 size={15} /> Colaboración
            {pendientesDeContestar > 0 && <span className="helm-col-count">{pendientesDeContestar}</span>}
          </button>
          <button className="helm-btn primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> Nueva tarea
          </button>
        </div>
      </div>

      {error && <FormNote>{error}</FormNote>}

      {rows == null ? (
        <Empty>Cargando…</Empty>
      ) : vista === 'encargadas' ? (
        <Encargadas tareas={encargadas} nombrePerfil={nombrePerfil} onAbrir={setActive} />
      ) : delPerfil.length === 0 ? (
        <Empty>Sin tareas. Crea la primera.</Empty>
      ) : vista === 'calendario' ? (
        <Calendario
          tareas={filtered} mes={mes} onMes={setMes}
          onAbrir={setActive} onFecha={moveToDate} nameOf={nameOf}
        />
      ) : (
        <div className="helm-kanban helm-tablon">
          {STATUSES.map((s, i) => (
            <div
              key={s.key}
              className={'helm-col' + (dragKey === s.key ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); if (dragKey !== s.key) setDragKey(s.key) }}
              onDragLeave={() => setDragKey(k => (k === s.key ? null : k))}
              onDrop={e => {
                e.preventDefault(); setDragKey(null)
                const id = e.dataTransfer.getData('text/plain')
                const t = filtered.find(r => r.id === id)
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
                    <article
                      key={t.id}
                      /* Un ticket: franja de color por prioridad, número, título
                         y un talón perforado con fecha y responsable. Lo que
                         arde (prioridad alta, vencida) se ve antes de leer. */
                      className={'helm-ticket p-' + (t.priority || 'medium') + (isOverdue(t) ? ' vencida' : '') + (s.key === 'done' ? ' hecha' : '')}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
                      onClick={() => setActive(t)}
                    >
                      <div className="helm-ticket-cuerpo">
                        <div className="helm-ticket-cab">
                          <span className="helm-ticket-num">#{String(numeroDe.get(t.id) || 0).padStart(3, '0')}</span>
                          <span className="helm-ticket-prio">{prioLabel(t.priority)}</span>
                          {esPrivada(t) && <Lock size={11} className="helm-ticket-lock" aria-label="Privada" />}
                        </div>
                        <b className="helm-ticket-titulo">{t.title}</b>
                        {t.origin_client_id && t.origin_client_id !== clientId && (
                          <div className="helm-ticket-sub helm-task-externa">
                            <Building2 size={12} />Encargo de {nombrePerfil(t.origin_client_id)}
                          </div>
                        )}
                        {cliente && <div className="helm-ticket-sub"><User size={12} />{cliente}</div>}
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
                        {chk.length > 0 && (
                          <div className="helm-ticket-progreso" title={`${chkDone} de ${chk.length} hechas`}>
                            <span style={{ width: `${Math.round((chkDone / chk.length) * 100)}%` }} />
                            <small><ListChecks size={11} /> {chkDone}/{chk.length}</small>
                          </div>
                        )}
                      </div>
                      <div className="helm-ticket-talon">
                        {t.due_date
                          ? <span className="helm-ticket-fecha"><Calendar size={11} /> {isOverdue(t) ? 'Venció ' : ''}{fmtDate(t.due_date)}</span>
                          : <span className="helm-ticket-fecha sin">Sin fecha</span>}
                        {asArray(t.notify_channels).length > 0 && (
                          <Bell size={12} className="helm-ticket-aviso" aria-label="Aviso pendiente de enviar" />
                        )}
                        {nameOf(t)
                          ? <span className="helm-ticket-quien" title={nameOf(t)}>{initials(nameOf(t))}</span>
                          : <span className="helm-ticket-quien libre" title="Sin responsable">?</span>}
                      </div>
                    </article>
                  )
                })}
                {(byStatus[s.key] || []).length === 0 && <div className="helm-col-empty">Arrastra aquí un ticket</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <TaskModal
          people={activos} contacts={contacts} services={services}
          colaboradores={sinMigracion ? [] : colaboradores}
          sinMigracion={sinMigracion}
          onClose={() => setCreating(false)} onSave={create}
        />
      )}

      {verColabs && (
        <Colaboraciones
          clientId={clientId} perfiles={perfiles} colabs={colabs} yo={yo}
          faltaTabla={faltaColabTabla}
          nombrePerfil={nombrePerfil}
          onCambio={(filas) => setColabs(filas)}
          onClose={() => setVerColabs(false)}
        />
      )}

      {active && (
        <TaskDrawer
          task={active} people={activos} legacy={legacy} contacts={contacts} services={services}
          sinMigracion={sinMigracion}
          externa={active.client_id !== clientId}
          perfilDestino={active.client_id !== clientId ? nombrePerfil(active.client_id) : null}
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

// ── Lo que este perfil ha encargado a otros ─────────────────────────────────
// Vista de lista, no tablero: aquí no se arrastra nada. Mover de columna una
// tarea que está haciendo otro sería decidir por él si ya la ha terminado.
function Encargadas({ tareas, nombrePerfil, onAbrir }) {
  if (!tareas.length) return <Empty>No has encargado ninguna tarea a otros perfiles.</Empty>

  const orden = { todo: 0, in_progress: 1, review: 2, done: 3 }
  const lista = [...tareas].sort((a, b) => (orden[effStatus(a)] ?? 0) - (orden[effStatus(b)] ?? 0))

  return (
    <div className="helm-encargos">
      {lista.map(t => {
        const est = STATUSES.find(s => s.key === effStatus(t))
        return (
          <button key={t.id} className="helm-encargo" onClick={() => onAbrir(t)}>
            <span className={'helm-dot ' + (est?.tone || '')} />
            <span className="helm-encargo-main">
              <b>{t.title}</b>
              <small><Building2 size={11} /> {nombrePerfil(t.client_id)}</small>
            </span>
            <span className="helm-encargo-meta">
              <span className={'helm-chip ' + toneOf(t.priority)}>{prioLabel(t.priority)}</span>
              <span className="helm-chip">{est?.label || effStatus(t)}</span>
              {t.due_date && (
                <span className={'helm-task-due' + (isOverdue(t) ? ' over' : '')}>
                  <Calendar size={11} /> {fmtDate(t.due_date)}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Colaboración entre perfiles ─────────────────────────────────────────────
function Colaboraciones({ clientId, perfiles, colabs, yo, faltaTabla, nombrePerfil, onCambio, onClose }) {
  const [destino, setDestino] = useState({ id: null, label: '' })
  const [mensaje, setMensaje] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Con quién NO tiene sentido ofrecer colaborar: con uno mismo, y con quien ya
  // hay algo vivo (pendiente o aceptado). Las rechazadas sí vuelven a la lista:
  // un "ahora no" de hace meses no puede cerrar la puerta para siempre.
  const ocupados = useMemo(() => new Set(
    colabs.filter(c => c.status !== RECHAZADA).map(c => laOtraParte(c, clientId)),
  ), [colabs, clientId])

  const candidatos = useMemo(
    () => perfiles.filter(p => p.id !== clientId && !ocupados.has(p.id)),
    [perfiles, clientId, ocupados],
  )

  const recargar = async () => {
    const { filas } = await listaColaboraciones(clientId)
    onCambio(filas)
  }

  async function pedir(e) {
    e.preventDefault()
    if (!destino.id) return setError('Elige el perfil con el que quieres colaborar')
    setBusy(true); setError(null)
    try {
      await pedirColaboracion({ clientId, otroClientId: destino.id, mensaje, email: yo.email })
      setDestino({ id: null, label: '' }); setMensaje('')
      await recargar()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function responder(id, aceptar) {
    setError(null)
    try {
      await responderColaboracion(id, { aceptar, email: yo.email })
      await recargar()
    } catch (err) { setError(err.message) }
  }

  async function deshacer(id) {
    setError(null)
    try {
      await deshacerColaboracion(id)
      await recargar()
    } catch (err) { setError(err.message) }
  }

  const entrantes = colabs.filter(c => esperandoRespuesta(c, clientId))
  const enviadas = colabs.filter(c => c.status === PENDIENTE && c.from_client_id === clientId)
  const activas = colabs.filter(c => c.status === ACEPTADA)

  return (
    <Modal title="Colaboración entre perfiles" onClose={onClose} wide>
      {faltaTabla ? (
        <FormNote tone="warn">
          Falta aplicar la migración <b>helm_tareas_colaboracion.sql</b>. Hasta entonces
          no se pueden crear colaboraciones.
        </FormNote>
      ) : (
        <>
          <FormNote tone="warn">
            Aceptar una colaboración deja que ese perfil <b>cree tareas en tu tablero</b>, y
            tú en el suyo. No le da acceso a nada más de tu panel.
          </FormNote>

          {entrantes.length > 0 && (
            <div className="helm-colab-bloque">
              <b>Te han pedido colaborar</b>
              {entrantes.map(c => (
                <div key={c.id} className="helm-colab">
                  <div className="helm-colab-main">
                    <b>{nombrePerfil(c.from_client_id)}</b>
                    {c.message && <small>«{c.message}»</small>}
                  </div>
                  <div className="helm-colab-acciones">
                    <button className="helm-btn sm primary" onClick={() => responder(c.id, true)}>Aceptar</button>
                    <button className="helm-btn sm" onClick={() => responder(c.id, false)}>Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activas.length > 0 && (
            <div className="helm-colab-bloque">
              <b>Colaborando</b>
              {activas.map(c => (
                <div key={c.id} className="helm-colab">
                  <div className="helm-colab-main">
                    <b>{nombrePerfil(laOtraParte(c, clientId))}</b>
                    <small>Podéis encargaros tareas mutuamente</small>
                  </div>
                  <div className="helm-colab-acciones">
                    <button
                      className="helm-btn sm" onClick={() => deshacer(c.id)}
                      title="Las tareas ya encargadas se quedan donde están"
                    >
                      <X size={14} /> Terminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {enviadas.length > 0 && (
            <div className="helm-colab-bloque">
              <b>Esperando respuesta</b>
              {enviadas.map(c => (
                <div key={c.id} className="helm-colab">
                  <div className="helm-colab-main">
                    <b>{nombrePerfil(c.to_client_id)}</b>
                    <small>Pendiente de que lo acepten</small>
                  </div>
                  <div className="helm-colab-acciones">
                    <button className="helm-btn sm" onClick={() => deshacer(c.id)}>Retirar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={pedir} className="helm-colab-bloque" noValidate>
            <b>Pedir colaboración</b>
            <Field label="Perfil" hint="Empieza a escribir el nombre del negocio">
              <SearchSelect
                value={destino}
                onChange={setDestino}
                placeholder="Buscar perfil en HELM…"
                emptyText={candidatos.length ? 'Ningún perfil con ese nombre' : 'No hay más perfiles disponibles'}
                allowFree={false}
                options={candidatos.map(p => ({ id: p.id, label: p.name, sub: p.slug }))}
              />
            </Field>
            <Field label="Para qué" hint="Opcional, pero ayuda a que lo acepten">
              <Textarea
                value={mensaje} onChange={e => setMensaje(e.target.value)}
                placeholder="Para pasaros el trabajo de edición sin perderlo por WhatsApp…"
              />
            </Field>
            <FormNote>{error}</FormNote>
            <div className="helm-modal-actions">
              <button type="submit" className="helm-btn primary" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}

// ── Calendario ──────────────────────────────────────────────────────────────
// Una pastilla de tarea. Vive FUERA del componente del calendario a propósito:
// definida dentro, React la trataba como un componente nuevo en cada render y
// desmontaba y volvía a montar todas las pastillas cada vez que se arrastraba
// algo, que es justo cuando peor sienta.
function Pastilla({ t, nameOf, onAbrir }) {
  return (
    <button
      className={'helm-cal-task ' + toneOf(t.priority) + (effStatus(t) === 'done' ? ' done' : '') + (isOverdue(t) ? ' over' : '')}
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
      onClick={() => onAbrir(t)}
      title={`${t.title}${nameOf(t) ? ` · ${nameOf(t)}` : ''}`}
    >
      {esPrivada(t) && <Lock size={10} className="helm-cal-task-lock" />}
      <span className="helm-cal-task-t">{t.title}</span>
      {nameOf(t) && <span className="helm-cal-task-a">{initials(nameOf(t))}</span>}
    </button>
  )
}

// Vista de mes o de semana. Las tareas se colocan por fecha de vencimiento; las
// que no tienen fecha van aparte, y se les pone una arrastrándolas a un día.
//
// En mes cabían 3 por día y el resto era un "+N más" que no llevaba a ninguna
// parte: justo los días cargados eran los que no se podían mirar. Ahora ese
// texto abre el día entero, y la vista de semana da sitio para verlos sin
// abrir nada.
function Calendario({ tareas, mes, onMes, onAbrir, onFecha, nameOf }) {
  const [sobre, setSobre] = useState(null)   // día resaltado mientras se arrastra
  const [rango, setRango] = useState('mes')  // mes | semana
  const [dia, setDia] = useState(null)       // día desplegado (iso)

  const hoy = isoLocal(new Date())

  // Los días que se pintan: el mes entero por semanas, o solo la semana del día
  // de referencia. Las dos formas devuelven lo mismo — una lista de semanas —
  // para que la rejilla no tenga que saber en qué modo está.
  const semanas = useMemo(() => {
    if (rango === 'mes') return semanasDe(mes)
    const lunes = lunesDe(mes)
    return [Array.from({ length: 7 }, (_, i) => new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i))]
  }, [mes, rango])

  const porDia = useMemo(() => {
    const map = {}
    for (const t of tareas) {
      if (!t.due_date) continue
      const k = t.due_date.slice(0, 10)
      ;(map[k] = map[k] || []).push(t)
    }
    // Dentro de un día, primero lo urgente: así el recorte no esconde lo que importa.
    const orden = { high: 0, medium: 1, low: 2 }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (orden[a.priority] ?? 1) - (orden[b.priority] ?? 1))
    return map
  }, [tareas])

  const sinFecha = useMemo(() => tareas.filter(t => !t.due_date), [tareas])

  // En semana caben muchas más por día: la celda es igual de ancha pero solo
  // hay una fila, así que el alto deja de ser un problema.
  const tope = rango === 'semana' ? 12 : 3

  const salta = (n) => onMes(rango === 'mes'
    ? new Date(mes.getFullYear(), mes.getMonth() + n, 1)
    : new Date(mes.getFullYear(), mes.getMonth(), mes.getDate() + n * 7))

  const drop = (e, iso) => {
    e.preventDefault(); setSobre(null)
    const t = tareas.find(r => r.id === e.dataTransfer.getData('text/plain'))
    if (t) onFecha(t, iso)
  }

  const titulo = rango === 'mes'
    ? mesLabel(mes)
    : (() => {
        const l = lunesDe(mes)
        const d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + 6)
        const fmt = (x) => x.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        return `${fmt(l)} – ${fmt(d)}`
      })()

  // Cuántas quedan por hacer en lo que se está mirando: es el dato que se busca
  // al abrir el calendario, y contarlo a ojo entre las celdas no vale.
  const pendientes = useMemo(() => {
    const dentro = new Set(semanas.flat().map(isoLocal))
    return tareas.filter(t => t.due_date && dentro.has(t.due_date.slice(0, 10)) && effStatus(t) !== 'done').length
  }, [semanas, tareas])

  const delDia = dia ? (porDia[dia] || []) : []

  return (
    <div className="helm-cal">
      <div className="helm-cal-head">
        <button className="helm-btn sm" onClick={() => salta(-1)} aria-label="Anterior"><ChevronLeft size={14} /></button>
        <b className="helm-cal-mes">{titulo}</b>
        <button className="helm-btn sm" onClick={() => salta(1)} aria-label="Siguiente"><ChevronRight size={14} /></button>
        <button
          className="helm-btn sm"
          onClick={() => { const h = new Date(); onMes(rango === 'mes' ? new Date(h.getFullYear(), h.getMonth(), 1) : h) }}
        >
          Hoy
        </button>
        <div className="helm-vista-tabs helm-cal-rango">
          <button
            className={'helm-vista-tab' + (rango === 'mes' ? ' active' : '')}
            onClick={() => { setRango('mes'); onMes(new Date(mes.getFullYear(), mes.getMonth(), 1)) }}
          >Mes</button>
          <button
            className={'helm-vista-tab' + (rango === 'semana' ? ' active' : '')}
            onClick={() => setRango('semana')}
          >Semana</button>
        </div>
        {pendientes > 0 && <span className="helm-cal-pend">{pendientes} pendientes</span>}
      </div>

      <div className="helm-cal-dias">{DIAS.map(d => <span key={d}>{d}</span>)}</div>

      <div className={'helm-cal-grid' + (rango === 'semana' ? ' semana' : '')}>
        {semanas.flat().map(d => {
          const iso = isoLocal(d)
          const suyas = porDia[iso] || []
          const fuera = rango === 'mes' && d.getMonth() !== mes.getMonth()
          const vencidas = suyas.filter(isOverdue).length
          return (
            <div
              key={iso}
              className={'helm-cal-dia' + (fuera ? ' fuera' : '') + (iso === hoy ? ' hoy' : '') + (sobre === iso ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); if (sobre !== iso) setSobre(iso) }}
              onDragLeave={() => setSobre(s => (s === iso ? null : s))}
              onDrop={e => drop(e, iso)}
            >
              <div className="helm-cal-dia-head">
                <span className="helm-cal-n">{d.getDate()}</span>
                {vencidas > 0 && <span className="helm-cal-alerta" title={`${vencidas} fuera de plazo`}>{vencidas}</span>}
              </div>
              {suyas.slice(0, tope).map(t => <Pastilla key={t.id} t={t} nameOf={nameOf} onAbrir={onAbrir} />)}
              {suyas.length > tope && (
                <button type="button" className="helm-cal-mas" onClick={() => setDia(iso)}>
                  +{suyas.length - tope} más
                </button>
              )}
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
            {sinFecha.map(t => <Pastilla key={t.id} t={t} nameOf={nameOf} onAbrir={onAbrir} />)}
          </div>
        </div>
      )}

      {dia && (
        <Modal title={diaLargo(dia)} onClose={() => setDia(null)}>
          <div className="helm-cal-dia-lista">
            {delDia.map(t => <Pastilla key={t.id} t={t} nameOf={nameOf} onAbrir={(x) => { setDia(null); onAbrir(x) }} />)}
          </div>
        </Modal>
      )}
    </div>
  )
}

// Campos compartidos por el alta y la ficha: responsable, cliente, servicio y
// avisos. Duplicarlos era lo que hacía que el drawer se quedara atrás.
function CamposTarea({ f, set, people, contacts, services, sinPrivacidad }) {
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

      {!sinPrivacidad && (
        <Field
          label="Quién la ve"
          hint={f.visibility === 'privada'
            ? 'Solo su responsable y quien manda en el perfil'
            : 'Todo el que entra a este perfil'}
        >
          <Select value={f.visibility} onChange={e => set('visibility', e.target.value)}>
            <option value="equipo">Todo el equipo</option>
            <option value="privada">Solo el responsable y los admins</option>
          </Select>
        </Field>
      )}
      {!sinPrivacidad && f.visibility === 'privada' && !f.assignee_helm_id && (
        <FormNote tone="warn">
          Una tarea privada sin responsable no la vería nadie salvo los admins.
          Elige a quién es antes de guardar.
        </FormNote>
      )}

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

function TaskModal({ people, contacts, services, colaboradores, sinMigracion, onClose, onSave }) {
  const [f, setF] = useState(NEW)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const fuera = Boolean(f.destino)

  const errores = {}
  if (!f.title.trim()) errores.title = 'El título es obligatorio'
  if (f.due_date && f.due_date < todayISO()) errores.due_date = 'La fecha ya ha pasado'
  if (!fuera && f.visibility === 'privada' && !f.assignee_helm_id) {
    errores.visibility = 'Una tarea privada necesita responsable'
  }
  const ok = !errores.title && !errores.visibility   // una fecha pasada avisa pero no bloquea
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
        {colaboradores.length > 0 && (
          <Field label="Para" hint="Puedes encargársela a un perfil con el que colaboras">
            <Select value={f.destino} onChange={e => set('destino', e.target.value)}>
              <option value="">Este perfil</option>
              {colaboradores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Título *" error={shown.title}>
          <Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus />
        </Field>
        <Field label="Descripción">
          <Textarea value={f.description} onChange={e => set('description', e.target.value)} />
        </Field>

        {fuera ? (
          // Encargo a otro perfil: solo lo que significa algo al otro lado. El
          // responsable, el contacto y el servicio son de esta casa; allí
          // asignan ellos, con su gente.
          <>
            <div className="helm-form-2">
              <Field label="Prioridad">
                <Select value={f.priority} onChange={e => set('priority', e.target.value)}>
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </Field>
              <Field label="Vence">
                <Input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
              </Field>
            </div>
            <FormNote tone="warn">
              La tarea entra en el tablero de ese perfil como <b>Por hacer</b> y con tu
              nombre como quien la encarga. El responsable lo eligen ellos.
            </FormNote>
          </>
        ) : (
          <CamposTarea f={f} set={set} people={people} contacts={contacts} services={services} sinPrivacidad={sinMigracion} />
        )}

        {shown.due_date && <FormNote tone="warn">{shown.due_date}</FormNote>}
        {shown.visibility && <FormNote>{shown.visibility}</FormNote>}
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
function TaskDrawer({ task, people, legacy, contacts, services, sinMigracion, externa, perfilDestino, onClose, onSaved, onDelete }) {
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
    visibility: task.visibility || 'equipo',
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
    if (!externa && f.visibility === 'privada' && !f.assignee_helm_id) {
      return setError('Una tarea privada necesita responsable, o no la vería nadie salvo los admins')
    }
    setBusy(true); setError(null)
    const done = f.status === 'done'
    // Una tarea que está en el tablero de otro perfil no se le puede reasignar
    // ni colgar de un contacto del CRM de aquí: esos ids no existen allí.
    const patch = externa
      ? {
          title: f.title.trim(), description: f.description.trim(),
          priority: f.priority,
          due_date: f.due_date ? new Date(f.due_date).toISOString() : null,
          checklist: f.checklist,
        }
      : {
          title: f.title.trim(), description: f.description.trim(),
          priority: f.priority, status: f.status,
          due_date: f.due_date ? new Date(f.due_date).toISOString() : null,
          assignee_helm_id: f.assignee_helm_id || null,
          contact_id: f.contact.id, service_id: f.service_id || null,
          notify_channels: f.notify_channels, checklist: f.checklist,
          visibility: f.visibility,
          completed: done, completed_at: done ? new Date().toISOString() : null,
        }
    const limpio = sinMigracion ? sinLasNuevas(patch) : patch
    try {
      await updateRow('crm_tasks', task.id, limpio)
      onSaved(limpio)
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Drawer
      title={externa ? 'Tarea encargada' : 'Tarea'}
      sub={externa
        ? perfilDestino
        : (people.find(m => m.id === f.assignee_helm_id)?.name || responsableAntiguo || 'Sin asignar')}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <button className="helm-btn" onClick={onDelete}>
            <Trash2 size={15} /> {externa ? 'Retirar el encargo' : 'Eliminar'}
          </button>
          <button className="helm-btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      {externa && (
        <FormNote tone="warn">
          Esta tarea está en el tablero de <b>{perfilDestino}</b>. Puedes cambiar lo que
          pediste o retirarlo, pero el estado y el responsable los llevan ellos.
        </FormNote>
      )}

      <Field label="Título"><Input value={f.title} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="Descripción"><Textarea value={f.description} onChange={e => set('description', e.target.value)} /></Field>

      {externa ? (
        <div className="helm-form-2">
          <Field label="Prioridad">
            <Select value={f.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Vence">
            <Input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
          </Field>
        </div>
      ) : (
        <CamposTarea f={f} set={set} people={people} contacts={contacts} services={services} sinPrivacidad={sinMigracion} />
      )}

      {responsableAntiguo && !f.assignee_helm_id && !externa && (
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
