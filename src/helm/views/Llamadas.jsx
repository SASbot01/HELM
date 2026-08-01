// HELM — Llamadas: el calendario de las reuniones agendadas.
//
// Misma rejilla que Contenido a propósito (un mes, una celda por día), pero lo
// que cae dentro no lo escribe nadie a mano: sale de Google Calendar. La
// sincronización trae lo que parece una llamada — invitados o enlace de
// videollamada — y encima de cada evento HELM guarda lo suyo: en qué acabó,
// de qué contacto del CRM era y las notas. Eso no lo pisa ninguna
// sincronización posterior.
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, RefreshCw, Video, ExternalLink,
  Users, PhoneCall, AlertTriangle,
} from 'lucide-react'
import { supabase, fetchRows, fetchRowsOrError, googleApi, MISSING_TABLE } from '../lib'
import { Drawer, Modal, Field, Input, Textarea, Select, Empty, FormNote, SearchSelect } from '../ui'
import { roleLabel } from '../equipo/roles'
import MigracionPendiente from '../MigracionPendiente'

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// En qué acabó la llamada. 'agendada' es lo que pone la sincronización; el
// resto lo marca la persona cuando cuelga.
const ESTADOS = [
  { key: 'agendada',  label: 'Agendada' },
  { key: 'hecha',     label: 'Hecha' },
  { key: 'no_show',   label: 'No-show' },
  { key: 'cancelada', label: 'Cancelada' },
]
const estadoDe = (s) => (ESTADOS.some(e => e.key === s) ? s : 'agendada')
const estadoLabel = (s) => ESTADOS.find(e => e.key === estadoDe(s))?.label || 'Agendada'

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

// Cuántas llamadas se pintan dentro de la celda. El resto, tras "+N más".
const MAX_EN_CELDA = 3

const pad = n => String(n).padStart(2, '0')
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = isoLocal(new Date())

// La hora local de la llamada. Las de todo el día no tienen hora que enseñar.
const horaDe = (c) => (c.all_day ? '' : new Date(c.starts_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
const diaDe = (c) => isoLocal(new Date(c.starts_at))

// <input type="datetime-local"> quiere 'YYYY-MM-DDTHH:mm' en hora local, no ISO.
const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  return `${isoLocal(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export default function Llamadas({ clientId, onNavigate }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [items, setItems] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [people, setPeople] = useState([])
  const [contacts, setContacts] = useState([])
  const [active, setActive] = useState(null)
  const [addAt, setAddAt] = useState(null)     // fecha ISO del día para el alta manual
  const [dia, setDia] = useState(null)         // día abierto en el panel lateral
  const [fEstado, setFEstado] = useState('__all__')
  const [google, setGoogle] = useState(null)   // estado de la conexión
  const [sync, setSync] = useState(null)       // resultado de la última sincronización
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  // La ventana del mes en horas locales: si se pidiera en UTC, una llamada de
  // las 00:30 del día 1 se quedaría fuera en España.
  const desde = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString()
  const hasta = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString()

  const load = () => supabase.from('helm_calls').select('*')
    .eq('client_id', clientId).gte('starts_at', desde).lt('starts_at', hasta)
    .order('starts_at')
    .then(({ data, error: e }) => {
      if (e) {
        const missing = e.code === '42P01' || /does not exist|schema cache/i.test(e.message || '')
        setFatal(missing ? MISSING_TABLE : e.message)
        setItems([])
        return
      }
      setFatal(null)
      setItems(data || [])
    })

  useEffect(() => { load() }, [clientId, desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows }) => setPeople(rows))
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
  }, [clientId])

  const sincronizar = async (silencioso = false) => {
    setSyncing(true)
    if (!silencioso) { setSync(null); setError(null) }
    try {
      const r = await googleApi.syncCalls(clientId)
      setSync(r)
      await load()
      googleApi.status(clientId).then(setGoogle).catch(() => {})
    } catch (err) {
      // En la sincronización de cortesía (al entrar) un fallo no se enseña: no
      // has pedido nada y un error rojo al abrir la sección solo asusta.
      if (!silencioso) setError(err.message)
      else console.warn('[helm] sync llamadas', err.message)
    }
    setSyncing(false)
  }

  // Estado de Google y sincronización de cortesía al entrar: si hace más de
  // cinco minutos que no se mira la agenda, se mira. Sin bloquear la vista.
  useEffect(() => {
    let vivo = true
    googleApi.status(clientId).then(st => {
      if (!vivo) return
      setGoogle(st)
      const viejo = !st.lastSyncAt || Date.now() - new Date(st.lastSyncAt).getTime() > 5 * 60_000
      if (st.linked && viejo) sincronizar(true)
    }).catch(err => { if (vivo) setGoogle({ linked: false, error: err.message }) })
    return () => { vivo = false }
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(
    () => (items || []).filter(c => fEstado === '__all__' || estadoDe(c.status) === fEstado),
    [items, fEstado],
  )

  const byDay = useMemo(() => {
    const map = {}
    for (const c of visibles) (map[diaDe(c)] = map[diaDe(c)] || []).push(c)
    return map
  }, [visibles])

  const resumen = useMemo(() => {
    const acc = Object.fromEntries(ESTADOS.map(e => [e.key, 0]))
    for (const c of (items || [])) acc[estadoDe(c.status)]++
    return acc
  }, [items])

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

  async function remove(call) {
    const deGoogle = Boolean(call.google_event_id)
    if (!confirm(deGoogle
      ? 'Esta llamada viene de Google Calendar. Si borras la ficha aquí, el evento sigue en tu agenda y volverá en la próxima sincronización. ¿Seguir?'
      : '¿Borrar esta llamada?')) return
    await supabase.from('helm_calls').delete().eq('id', call.id)
    setActive(null); load()
  }

  // El estado es lo que más se toca (se marca al colgar), así que va optimista
  // y sin abrir la ficha.
  async function setEstado(call, status) {
    setItems(cs => cs.map(c => c.id === call.id ? { ...c, status } : c))
    setActive(a => (a && a.id === call.id ? { ...a, status } : a))
    const { error: e } = await supabase.from('helm_calls')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', call.id)
    if (e) load()
  }

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Llamadas" archivo="migrations/helm_google.sql" />
  if (fatal) return <FormNote>{fatal}</FormNote>

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
          {google?.linked && (
            <button className="helm-btn" onClick={() => sincronizar(false)} disabled={syncing}>
              <RefreshCw size={15} className={syncing ? 'helm-spin' : undefined} />
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          )}
          <button className="helm-btn primary" onClick={() => setAddAt(TODAY)}><Plus size={15} /> Nueva llamada</button>
        </div>
      </div>

      {google && !google.linked && (
        <div className="helm-settings-warn" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <span>
            Este perfil no tiene Google Calendar conectado, así que aquí solo verás lo que
            añadas a mano. Conéctalo en <b>Ajustes → Integraciones</b>
            {onNavigate && <> — <button className="helm-linkbtn" onClick={() => onNavigate('ajustes')}>ir a Ajustes</button></>}.
          </span>
        </div>
      )}

      {sync && (
        <div className="helm-settings-ok" style={{ marginBottom: 14, whiteSpace: 'pre-line' }}>
          {[
            `${sync.revisados} eventos revisados en tu agenda (${sync.ventana.diasAtras} días atrás, ${sync.ventana.diasAdelante} adelante):`,
            `· ${sync.nuevas} llamadas nuevas, ${sync.actualizadas} actualizadas`,
            sync.canceladas ? `· ${sync.canceladas} marcadas como canceladas (el evento ya no está en Google)` : null,
            sync.descartados ? `· ${sync.descartados} eventos descartados por no parecer llamadas` : null,
            ...(sync.errores || []).map(e => `· ⚠ ${e}`),
          ].filter(Boolean).join('\n')}
        </div>
      )}
      {error && <div className="helm-formerror" style={{ marginBottom: 14 }}>{error}</div>}

      {items == null ? <Empty>Cargando…</Empty> : (
        <div className="helm-cal-grid">
          {DOW.map(d => <div key={d} className="helm-cal-dow">{d}</div>)}
          {cells.map((iso, i) => {
            if (!iso) return <div key={'b' + i} className="helm-cal-cell empty" />
            const day = Number(iso.slice(8, 10))
            const list = byDay[iso] || []
            // Igual que en Contenido: la celda tiene alto fijo y un día con
            // ocho llamadas no puede estirar la semana entera.
            const caben = list.length > MAX_EN_CELDA + 1 ? MAX_EN_CELDA : list.length
            return (
              <div key={iso} className={'helm-cal-cell' + (iso === TODAY ? ' today' : '')}>
                <div className="helm-cal-day">
                  <button
                    className="helm-cal-daynum"
                    title={list.length ? `Ver las ${list.length} llamadas de este día` : 'Ver este día'}
                    onClick={() => setDia(iso)}
                  >{day}</button>
                  <button className="helm-cal-add" title="Añadir aquí" onClick={() => setAddAt(iso)}><Plus size={13} /></button>
                </div>
                <div className="helm-cal-items">
                  {list.slice(0, caben).map(c => (
                    <button
                      key={c.id}
                      className={'helm-cal-item ' + estadoDe(c.status)}
                      onClick={() => setActive(c)}
                      title={`${horaDe(c)} ${c.title} · ${estadoLabel(c.status)}`}
                    >
                      {horaDe(c) && <b>{horaDe(c)}</b>} {c.title}
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
        <CallDrawer
          call={active} people={people} contacts={contacts}
          onClose={() => setActive(null)}
          onEstado={(s) => setEstado(active, s)}
          onSaved={() => { setActive(null); load() }}
          onDelete={() => remove(active)} />
      )}
      {dia && !active && (
        <DiaDrawer
          iso={dia} items={byDay[dia] || []}
          onClose={() => setDia(null)}
          onAbrir={(c) => { setActive(c); setDia(null) }}
          onEstado={setEstado}
          onAñadir={() => { setAddAt(dia); setDia(null) }} />
      )}
      {addAt && (
        <AddModal clientId={clientId} people={people} contacts={contacts} day={addAt}
          onClose={() => setAddAt(null)} onCreated={() => { setAddAt(null); load() }} />
      )}
    </div>
  )
}

// Todas las llamadas de un día, con su hora y su estado a mano.
function DiaDrawer({ iso, items, onClose, onAbrir, onEstado, onAñadir }) {
  const fecha = new Date(iso + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <Drawer
      title={fecha.charAt(0).toUpperCase() + fecha.slice(1)}
      sub={items.length === 1 ? '1 llamada' : `${items.length} llamadas`}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <span />
          <button className="helm-btn primary" onClick={onAñadir}><Plus size={15} /> Nueva llamada</button>
        </div>
      }
    >
      {items.length === 0 ? (
        <Empty>Ninguna llamada este día.</Empty>
      ) : items.map(c => (
        <div key={c.id} className="helm-dia-item">
          <button className="helm-dia-item-main" onClick={() => onAbrir(c)}>
            <b>{horaDe(c) ? `${horaDe(c)} · ` : ''}{c.title}</b>
            <small>
              {c.google_event_id ? 'de Google Calendar' : 'manual'}
              {c.meet_url ? ' · con videollamada' : ''}
            </small>
          </button>
          <EstadoBotones value={c.status} onChange={(s) => onEstado(c, s)} />
        </div>
      ))}
    </Drawer>
  )
}

// Ficha de una llamada. Lo de Google se enseña (invitados, enlace, descripción)
// pero solo se edita lo que es de HELM.
function CallDrawer({ call, people, contacts, onClose, onEstado, onSaved, onDelete }) {
  const deGoogle = Boolean(call.google_event_id)
  const [f, setF] = useState({
    title: call.title || '',
    starts_at: toLocalInput(call.starts_at),
    outcome: call.outcome || '',
    contact: { id: call.contact_id || null, label: contacts.find(c => c.id === call.contact_id)?.name || '' },
    assignee_id: call.assignee_id || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const equipo = people.filter(p => p.active !== false)
  const invitados = Array.isArray(call.attendees) ? call.attendees.filter(a => !a.self) : []

  async function save() {
    if (!f.title.trim()) return setError('El título es obligatorio')
    setBusy(true); setError(null)
    const patch = {
      outcome: f.outcome || null,
      contact_id: f.contact.id || null,
      assignee_id: f.assignee_id || null,
      updated_at: new Date().toISOString(),
    }
    // Título y hora solo se guardan en las manuales: en las de Google los
    // reescribiría la siguiente sincronización y el cambio parecería perdido.
    if (!deGoogle) {
      patch.title = f.title.trim()
      patch.starts_at = fromLocalInput(f.starts_at)
    }
    const { error: e } = await supabase.from('helm_calls').update(patch).eq('id', call.id)
    if (e) { setError(e.message); setBusy(false); return }
    onSaved()
  }

  const cuando = new Date(call.starts_at).toLocaleString('es-ES', {
    weekday: 'long', day: '2-digit', month: 'long',
    ...(call.all_day ? {} : { hour: '2-digit', minute: '2-digit' }),
  })

  return (
    <Drawer
      title={call.title}
      sub={`${cuando} · ${deGoogle ? 'de Google Calendar' : 'manual'} · ${estadoLabel(call.status)}`}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <button className="helm-btn" onClick={onDelete}><Trash2 size={15} /> Eliminar</button>
          <button className="helm-btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      <Field label="Estado"><EstadoBotones value={call.status} onChange={onEstado} /></Field>

      {(call.meet_url || call.html_link) && (
        <div className="helm-call-links">
          {call.meet_url && (
            <a className="helm-btn primary" href={call.meet_url} target="_blank" rel="noreferrer">
              <Video size={15} /> Entrar a la llamada
            </a>
          )}
          {call.html_link && (
            <a className="helm-btn" href={call.html_link} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Ver en Google Calendar
            </a>
          )}
        </div>
      )}

      <Field label="Título" hint={deGoogle ? 'Lo manda Google: cámbialo en el evento de tu agenda.' : undefined}>
        <Input value={f.title} disabled={deGoogle} onChange={e => set('title', e.target.value)} />
      </Field>
      <Field label="Cuándo" hint={deGoogle ? 'La hora la manda Google.' : undefined}>
        <Input type="datetime-local" value={f.starts_at} disabled={deGoogle}
          onChange={e => set('starts_at', e.target.value)} />
      </Field>

      {invitados.length > 0 && (
        <Field label="Invitados">
          <div className="helm-call-guests">
            {invitados.map((a, i) => (
              <span key={a.email || i} className="helm-badge"><Users size={12} /> {a.name || a.email}</span>
            ))}
          </div>
        </Field>
      )}

      <Field label="Contacto del CRM" hint="Cuelga la llamada de su ficha">
        <SearchSelect
          value={f.contact}
          onChange={o => set('contact', o)}
          options={contacts.map(c => ({ id: c.id, label: c.name, sub: c.email || c.company || '' }))}
          placeholder="Buscar contacto…"
          allowFree={false}
        />
      </Field>

      {equipo.length > 0 && (
        <Field label="Quién la lleva">
          <Select value={f.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">— Sin asignar —</option>
            {equipo.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Qué pasó" hint="El resultado, los acuerdos, la objeción que salió…">
        <Textarea rows={6} value={f.outcome} onChange={e => set('outcome', e.target.value)} />
      </Field>

      {call.description && (
        <div className="helm-chk-block">
          <div className="helm-chk-head"><b>Descripción del evento</b></div>
          <p className="helm-settings-lead" style={{ whiteSpace: 'pre-wrap' }}>{call.description}</p>
        </div>
      )}

      <FormNote>{error}</FormNote>
    </Drawer>
  )
}

// Alta manual: la llamada que se cerró por WhatsApp y no está en la agenda.
function AddModal({ clientId, people, contacts, day, onClose, onCreated }) {
  const [f, setF] = useState({
    title: '', starts_at: `${day}T10:00`, status: 'agendada',
    contact: { id: null, label: '' }, assignee_id: '', meet_url: '', outcome: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const equipo = people.filter(p => p.active !== false)

  async function create(e) {
    e.preventDefault()
    if (!f.title.trim() || !f.starts_at) return setError('El título y la fecha son obligatorios')
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('helm_calls').insert({
      client_id: clientId,
      title: f.title.trim(),
      starts_at: fromLocalInput(f.starts_at),
      status: f.status,
      contact_id: f.contact.id || null,
      assignee_id: f.assignee_id || null,
      meet_url: f.meet_url.trim() || null,
      outcome: f.outcome || null,
      source: 'manual',
    })
    if (err) { setError(err.message); setBusy(false); return }
    onCreated()
  }

  return (
    <Modal title="Nueva llamada" onClose={onClose} wide>
      <form onSubmit={create} noValidate>
        <Field label="Título *">
          <Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus placeholder="Llamada de cierre · María" />
        </Field>
        <div className="helm-form-2">
          <Field label="Cuándo">
            <Input type="datetime-local" value={f.starts_at} onChange={e => set('starts_at', e.target.value)} />
          </Field>
          <Field label="Enlace de videollamada">
            <Input value={f.meet_url} onChange={e => set('meet_url', e.target.value)} placeholder="https://meet.google.com/…" />
          </Field>
        </div>
        <Field label="Estado"><EstadoBotones value={f.status} onChange={v => set('status', v)} /></Field>
        <Field label="Contacto del CRM">
          <SearchSelect
            value={f.contact}
            onChange={o => set('contact', o)}
            options={contacts.map(c => ({ id: c.id, label: c.name, sub: c.email || c.company || '' }))}
            placeholder="Buscar contacto…"
            allowFree={false}
          />
        </Field>
        {equipo.length > 0 && (
          <Field label="Quién la lleva">
            <Select value={f.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
              <option value="">— Sin asignar —</option>
              {equipo.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Notas (opcional)">
          <Textarea rows={4} value={f.outcome} onChange={e => set('outcome', e.target.value)} />
        </Field>
        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy}>
            <PhoneCall size={15} /> {busy ? 'Guardando…' : 'Agendar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
