// HELM — Contenido: calendario mensual de piezas programadas. Se llena desde el
// chat con /programar-guion (el guion cae en su día) o a mano aquí.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar as CalIcon } from 'lucide-react'
import { supabase, fetchRowsOrError } from '../lib'
import { Markdown } from '../md'
import { Drawer, Modal, Field, Input, Textarea, Select, Empty, FormNote } from '../ui'
import Adjuntos from '../Adjuntos'
import { roleLabel } from '../equipo/roles'

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const FORMATS = [
  { key: 'reel', label: 'Reel' }, { key: 'carousel', label: 'Carrusel' },
  { key: 'email', label: 'Email' }, { key: 'yt', label: 'YouTube' }, { key: 'nota', label: 'Nota' },
]
const fmtLabel = (f) => FORMATS.find(x => x.key === f)?.label || f

// Estado de producción de una pieza. Es lo que permite ver de un vistazo qué
// hay listo para las fechas elegidas y darle al editor su lista de trabajo.
const ESTADOS = [
  { key: 'todo',  label: 'Sin hacer' },
  { key: 'doing', label: 'En proceso' },
  { key: 'done',  label: 'Hecho' },
]
// Las piezas anteriores al cambio de estados traen 'planned'/'published'.
const ALIAS_ESTADO = { planned: 'todo', published: 'done' }
const estadoDe = (s) => ALIAS_ESTADO[s] || (ESTADOS.some(e => e.key === s) ? s : 'todo')
const estadoLabel = (s) => ESTADOS.find(e => e.key === estadoDe(s))?.label || 'Sin hacer'

// Botonera de estado. Se usa en la ficha y en la cabecera del calendario.
function EstadoBotones({ value, onChange, disabled }) {
  return (
    <div className="helm-segmented estado">
      {ESTADOS.map(e => (
        <button
          key={e.key} type="button" disabled={disabled}
          className={estadoDe(value) === e.key ? 'on ' + e.key : e.key}
          onClick={() => onChange(e.key)}
        >{e.label}</button>
      ))}
    </div>
  )
}

// Cuántas piezas se pintan dentro de la celda del día. El resto vive detrás de
// "+N más": la rejilla del mes tiene que seguir pareciendo una rejilla.
const MAX_EN_CELDA = 3

const pad = n => String(n).padStart(2, '0')
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = isoLocal(new Date())

export default function Contenido({ clientId }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [items, setItems] = useState(null)
  const [people, setPeople] = useState([])
  const [active, setActive] = useState(null)   // pieza abierta en el drawer
  const [addDay, setAddDay] = useState(null)    // fecha ISO para el modal de alta
  const [dia, setDia] = useState(null)          // día abierto en el panel lateral
  const [fEstado, setFEstado] = useState('__all__')

  const fromISO = isoLocal(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
  const toISO = isoLocal(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))

  const load = () => supabase.from('helm_content_calendar').select('*')
    .eq('client_id', clientId).gte('date', fromISO).lte('date', toISO).order('date')
    .then(({ data }) => setItems(data || []))
  useEffect(() => { load() }, [clientId, fromISO, toISO]) // eslint-disable-line react-hooks/exhaustive-deps

  // El editor al que se asigna cada pieza sale del directorio de equipo.
  useEffect(() => {
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows }) => setPeople(rows))
  }, [clientId])

  const visibles = useMemo(
    () => (items || []).filter(it => fEstado === '__all__' || estadoDe(it.status) === fEstado),
    [items, fEstado],
  )

  const byDay = useMemo(() => {
    const map = {}
    for (const it of visibles) (map[it.date] = map[it.date] || []).push(it)
    return map
  }, [visibles])

  // Cuántas piezas hay en cada estado este mes: el resumen que pedía el
  // informe para saber qué está realizado en las fechas seleccionadas.
  const resumen = useMemo(() => {
    const acc = Object.fromEntries(ESTADOS.map(e => [e.key, 0]))
    for (const it of (items || [])) acc[estadoDe(it.status)]++
    return acc
  }, [items])

  // Rejilla: huecos iniciales (semana empieza en lunes) + días del mes.
  const cells = useMemo(() => {
    const firstDow = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const arr = []
    for (let i = 0; i < firstDow; i++) arr.push(null)
    for (let d = 1; d <= days; d++) arr.push(isoLocal(new Date(cursor.getFullYear(), cursor.getMonth(), d)))
    return arr
  }, [cursor])

  const move = (delta) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  const goToday = () => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)) }

  async function remove(id) {
    if (!confirm('¿Borrar esta pieza del calendario?')) return
    await supabase.from('helm_content_calendar').delete().eq('id', id)
    setActive(null); load()
  }

  // Cambiar el estado es la acción más frecuente del día a día, así que va
  // optimista y sin abrir la ficha.
  async function setEstado(piece, status) {
    setItems(is => is.map(i => i.id === piece.id ? { ...i, status } : i))
    setActive(a => (a && a.id === piece.id ? { ...a, status } : a))
    const { error } = await supabase.from('helm_content_calendar')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', piece.id)
    if (error) load()
  }

  return (
    <div className="helm-cal">
      <div className="helm-cal-head">
        <div className="helm-cal-nav">
          <button className="helm-btn" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <b>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</b>
          <button className="helm-btn" onClick={() => move(1)}><ChevronRight size={16} /></button>
          <button className="helm-btn" onClick={goToday}>Hoy</button>
        </div>
        <div className="helm-cal-actions">
          <div className="helm-chips">
            <button className={'helm-chip' + (fEstado === '__all__' ? ' active' : '')} onClick={() => setFEstado('__all__')}>
              Todas
            </button>
            {ESTADOS.map(e => (
              <button key={e.key} className={'helm-chip' + (fEstado === e.key ? ' active' : '')} onClick={() => setFEstado(e.key)}>
                {e.label} <b>{resumen[e.key] || 0}</b>
              </button>
            ))}
          </div>
          <button className="helm-btn primary" onClick={() => setAddDay(TODAY)}><Plus size={15} /> Nueva pieza</button>
        </div>
      </div>

      {items == null ? <Empty>Cargando…</Empty> : (
        <div className="helm-cal-grid">
          {DOW.map(d => <div key={d} className="helm-cal-dow">{d}</div>)}
          {cells.map((iso, i) => {
            if (!iso) return <div key={'b' + i} className="helm-cal-cell empty" />
            const day = Number(iso.slice(8, 10))
            const list = byDay[iso] || []
            // La celda tiene alto fijo: si se pintaran las 10 piezas de un día
            // cargado, esa fila estiraría a toda la semana y el mes dejaría de
            // parecer un mes. Caben unas pocas y el resto se ve pulsando el día.
            const caben = list.length > MAX_EN_CELDA + 1 ? MAX_EN_CELDA : list.length
            return (
              <div key={iso} className={'helm-cal-cell' + (iso === TODAY ? ' today' : '')}>
                <div className="helm-cal-day">
                  <button
                    className="helm-cal-daynum"
                    title={list.length ? `Ver las ${list.length} piezas de este día` : 'Ver este día'}
                    onClick={() => setDia(iso)}
                  >{day}</button>
                  <button className="helm-cal-add" title="Añadir aquí" onClick={() => setAddDay(iso)}><Plus size={13} /></button>
                </div>
                <div className="helm-cal-items">
                  {list.slice(0, caben).map(it => (
                    <button
                      key={it.id}
                      className={'helm-cal-item ' + estadoDe(it.status)}
                      onClick={() => setActive(it)}
                      title={`${it.title} · ${estadoLabel(it.status)}`}
                    >
                      {it.title}
                    </button>
                  ))}
                  {list.length > caben && (
                    <button className="helm-cal-more" onClick={() => setDia(iso)}>
                      +{list.length - caben} más
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active && (
        <PieceDrawer
          piece={active} clientId={clientId} people={people}
          onClose={() => setActive(null)}
          onEstado={(s) => setEstado(active, s)}
          onSaved={() => { setActive(null); load() }}
          onDelete={() => remove(active.id)} />
      )}
      {/* El día entero, con todas sus piezas. Se abre al pulsar el número del
          día o el "+N más", y desde aquí se entra a cada guion. */}
      {dia && !active && (
        <DiaDrawer
          iso={dia} items={byDay[dia] || []}
          onClose={() => setDia(null)}
          onAbrir={(p) => { setActive(p); setDia(null) }}
          onEstado={setEstado}
          onAñadir={() => { setAddDay(dia); setDia(null) }} />
      )}
      {addDay && (
        <AddModal clientId={clientId} people={people} day={addDay} onClose={() => setAddDay(null)}
          onCreated={() => { setAddDay(null); load() }} />
      )}
    </div>
  )
}

// Lista de un día. Es lo que hace que una celda pequeña no esconda nada: aquí
// están todas las piezas, con su estado a mano para ir marcándolas.
function DiaDrawer({ iso, items, onClose, onAbrir, onEstado, onAñadir }) {
  const fecha = new Date(iso + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <Drawer
      title={fecha.charAt(0).toUpperCase() + fecha.slice(1)}
      sub={items.length === 1 ? '1 pieza' : `${items.length} piezas`}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <span />
          <button className="helm-btn primary" onClick={onAñadir}><Plus size={15} /> Añadir pieza</button>
        </div>
      }
    >
      {items.length === 0 ? (
        <Empty>Nada programado este día.</Empty>
      ) : items.map(p => (
        <div key={p.id} className="helm-dia-item">
          <button className="helm-dia-item-main" onClick={() => onAbrir(p)}>
            <b>{p.title}</b>
            <small>{fmtLabel(p.format)} · {p.body ? `guion de ${p.body.length} caracteres` : 'sin guion'}</small>
          </button>
          <EstadoBotones value={p.status} onChange={(s) => onEstado(p, s)} />
        </div>
      ))}
    </Drawer>
  )
}

// Detalle de una pieza: estado, responsable, adjuntos y el guion.
function PieceDrawer({ piece, clientId, people, onClose, onEstado, onSaved, onDelete }) {
  const [f, setF] = useState({
    title: piece.title || '', date: piece.date, format: piece.format || 'reel',
    body: piece.body || '', assignee_id: piece.assignee_id || '',
    attachments: Array.isArray(piece.attachments) ? piece.attachments : [],
  })
  const [editBody, setEditBody] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const editores = people.filter(p => p.active !== false)

  async function save() {
    if (!f.title.trim() || !f.date) return setError('El título y el día son obligatorios')
    setBusy(true); setError(null)
    const { error: e } = await supabase.from('helm_content_calendar').update({
      title: f.title.trim(), date: f.date, format: f.format, body: f.body,
      assignee_id: f.assignee_id || null, attachments: f.attachments,
      updated_at: new Date().toISOString(),
    }).eq('id', piece.id)
    if (e) { setError(e.message); setBusy(false); return }
    onSaved()
  }

  return (
    <Drawer
      title="Pieza de contenido"
      sub={`${fmtLabel(f.format)} · ${piece.source === 'chat' ? 'del chat' : 'manual'} · ${estadoLabel(piece.status)}`}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <button className="helm-btn" onClick={onDelete}><Trash2 size={15} /> Eliminar</button>
          <button className="helm-btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      {/* El estado se guarda al pulsar, sin pasar por "Guardar": es lo que más
          se toca y no tiene sentido que exija confirmar. */}
      <Field label="Estado">
        <EstadoBotones value={piece.status} onChange={onEstado} />
      </Field>

      <Field label="Título"><Input value={f.title} onChange={e => set('title', e.target.value)} /></Field>
      <div className="helm-form-2">
        <Field label="Día"><Input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Formato">
          <Select value={f.format} onChange={e => set('format', e.target.value)}>
            {FORMATS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>
      </div>

      {editores.length > 0 && (
        <Field label="Responsable" hint="Quién produce esta pieza">
          <Select value={f.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">— Sin asignar —</option>
            {editores.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Archivos" hint="Miniaturas, el vídeo montado, un PDF con el guion desarrollado…">
        <Adjuntos
          clientId={clientId} carpeta="contenido"
          value={f.attachments} onChange={v => set('attachments', v)}
          accept="image/*,video/*,application/pdf"
        />
      </Field>

      <div className="helm-chk-block">
        <div className="helm-chk-head">
          <b>Guion</b>
          <button className="helm-btn" onClick={() => setEditBody(e => !e)}>{editBody ? 'Ver' : 'Editar'}</button>
        </div>
        {editBody ? (
          <Textarea rows={16} value={f.body} onChange={e => set('body', e.target.value)} />
        ) : f.body ? (
          <div className="helm-biblia-doc"><Markdown text={f.body} /></div>
        ) : (
          <Empty>Sin guion. Pulsa «Editar» para escribirlo.</Empty>
        )}
      </div>

      <FormNote>{error}</FormNote>
    </Drawer>
  )
}

// Alta manual de una pieza en un día.
function AddModal({ clientId, people, day, onClose, onCreated }) {
  const [f, setF] = useState({ title: '', date: day, format: 'reel', body: '', status: 'todo', assignee_id: '', attachments: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const editores = people.filter(p => p.active !== false)

  async function create(e) {
    e.preventDefault()
    if (!f.title.trim() || !f.date) return setError('El título y el día son obligatorios')
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('helm_content_calendar').insert({
      client_id: clientId, title: f.title.trim(), date: f.date, format: f.format,
      body: f.body || null, status: f.status, source: 'manual',
      assignee_id: f.assignee_id || null, attachments: f.attachments,
    })
    if (err) { setError(err.message); setBusy(false); return }
    onCreated()
  }

  return (
    <Modal title="Nueva pieza de contenido" onClose={onClose} wide>
      <form onSubmit={create} noValidate>
        <Field label="Título *"><Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus placeholder="Reel sobre la objeción del precio" /></Field>
        <div className="helm-form-2">
          <Field label="Día"><Input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
          <Field label="Formato">
            <Select value={f.format} onChange={e => set('format', e.target.value)}>
              {FORMATS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Estado"><EstadoBotones value={f.status} onChange={v => set('status', v)} /></Field>
        {editores.length > 0 && (
          <Field label="Responsable">
            <Select value={f.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
              <option value="">— Sin asignar —</option>
              {editores.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Archivos">
          <Adjuntos clientId={clientId} carpeta="contenido" value={f.attachments}
            onChange={v => set('attachments', v)} accept="image/*,video/*,application/pdf" />
        </Field>
        <Field label="Guion / notas (opcional)"><Textarea rows={5} value={f.body} onChange={e => set('body', e.target.value)} /></Field>
        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy}><CalIcon size={15} /> {busy ? 'Guardando…' : 'Agendar'}</button>
        </div>
      </form>
    </Modal>
  )
}
