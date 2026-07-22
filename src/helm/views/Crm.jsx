// HELM — CRM estilo GHL: pipeline kanban con drag&drop + lista + ficha de contacto.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, LayoutGrid, List, Search, Phone, Mail, Building2, Send } from 'lucide-react'
import { fetchRows, insertRow, updateRow, deleteRow, fetchActivities, money, fmtDate } from '../lib'
import { Panel, Empty, Modal, Field, Input, Textarea, Select, Tabs, Kpi, Drawer } from '../ui'

// Etapas del pipeline (estilo GHL). El status libre de la BD se normaliza a estas.
const STAGES = [
  { key: 'lead', label: 'Lead', tone: '' },
  { key: 'contactado', label: 'Contactado', tone: 'cyan' },
  { key: 'cita', label: 'Cita agendada', tone: 'amber' },
  { key: 'propuesta', label: 'Propuesta', tone: 'violet' },
  { key: 'ganado', label: 'Ganado', tone: 'green' },
  { key: 'perdido', label: 'Perdido', tone: 'red' },
]
const STAGE_KEYS = new Set(STAGES.map(s => s.key))
const ALIAS = {
  nuevo: 'lead', new: 'lead', abierto: 'lead',
  qualified: 'contactado', calificado: 'contactado', contacto: 'contactado',
  cita_agendada: 'cita', reunion: 'cita', agendado: 'cita', booked: 'cita',
  proposal: 'propuesta', propuesta_enviada: 'propuesta',
  won: 'ganado', cerrado: 'ganado', cliente: 'ganado',
  lost: 'perdido', descartado: 'perdido',
}
const normalize = (s) => {
  const v = (s || '').toLowerCase().trim()
  if (STAGE_KEYS.has(v)) return v
  return ALIAS[v] || 'lead'
}
const toneOf = (stageKey) => STAGES.find(s => s.key === stageKey)?.tone || ''
const chipClass = (s) => toneOf(normalize(s))

const ACT_TYPES = [
  { key: 'note', label: 'Nota' },
  { key: 'call', label: 'Llamada' },
  { key: 'email', label: 'Email' },
  { key: 'meeting', label: 'Reunión' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

const EMPTY_FORM = { name: '', email: '', phone: '', company: '', position: '', source: '', status: 'lead', deal_value: '', notes: '' }

export default function Crm({ clientId }) {
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('pipeline')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [active, setActive] = useState(null)   // contacto abierto en el drawer
  const [dragKey, setDragKey] = useState(null) // etapa sobre la que se arrastra

  const load = () => fetchRows('crm_contacts', clientId).then(setRows)
  useEffect(() => { load() }, [clientId])

  const filtered = useMemo(() => {
    if (!rows) return null
    const q = query.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      [r.name, r.company, r.email, r.phone].some(v => (v || '').toLowerCase().includes(q))
    )
  }, [rows, query])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map(s => [s.key, []]))
    for (const r of (filtered || [])) map[normalize(r.status)].push(r)
    return map
  }, [filtered])

  const stats = useMemo(() => {
    const all = rows || []
    const open = all.filter(r => !['ganado', 'perdido'].includes(normalize(r.status)))
    const won = all.filter(r => normalize(r.status) === 'ganado')
    const lost = all.filter(r => normalize(r.status) === 'perdido')
    const sum = (a) => a.reduce((t, r) => t + (Number(r.deal_value) || 0), 0)
    const closed = won.length + lost.length
    return {
      total: all.length,
      openValue: sum(open),
      wonValue: sum(won),
      winRate: closed ? Math.round((won.length / closed) * 100) : 0,
    }
  }, [rows])

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    await insertRow('crm_contacts', {
      client_id: clientId, name: form.name.trim(), email: form.email.trim(),
      phone: form.phone.trim(), company: form.company.trim(), position: form.position.trim(),
      source: form.source.trim(), status: form.status, notes: form.notes.trim(),
      deal_value: form.deal_value ? Number(form.deal_value) : 0,
    })
    setForm(EMPTY_FORM); setOpen(false); load()
  }

  async function remove(id) {
    await deleteRow('crm_contacts', id)
    setActive(a => (a && a.id === id ? null : a))
    load()
  }

  // Mover un contacto de etapa (optimista) — usado por drag&drop y por el drawer.
  async function moveTo(contact, stageKey) {
    if (normalize(contact.status) === stageKey) return
    setRows(rs => rs.map(r => r.id === contact.id ? { ...r, status: stageKey } : r))
    try { await updateRow('crm_contacts', contact.id, { status: stageKey, updated_at: new Date().toISOString() }) }
    catch { load() }
  }

  return (
    <>
      <div className="helm-grid helm-kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Contactos" value={stats.total} />
        <Kpi label="Pipeline abierto" value={money(stats.openValue)} accent />
        <Kpi label="Ganado" value={money(stats.wonValue)} />
        <Kpi label="Tasa de cierre" value={stats.winRate + '%'} />
      </div>

      <div className="helm-crm-bar">
        <Tabs
          value={tab} onChange={setTab}
          tabs={[
            { key: 'pipeline', label: 'Pipeline', icon: <LayoutGrid size={15} /> },
            { key: 'lista', label: 'Lista', icon: <List size={15} /> },
          ]}
        />
        <div className="helm-crm-actions">
          <div className="helm-search">
            <Search size={15} />
            <input placeholder="Buscar contacto…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo contacto</button>
        </div>
      </div>

      {filtered == null ? (
        <Empty>Cargando…</Empty>
      ) : tab === 'pipeline' ? (
        <div className="helm-kanban">
          {STAGES.map(stage => {
            const cards = byStage[stage.key]
            const total = cards.reduce((t, r) => t + (Number(r.deal_value) || 0), 0)
            return (
              <div
                key={stage.key}
                className={'helm-col' + (dragKey === stage.key ? ' over' : '')}
                onDragOver={e => { e.preventDefault(); if (dragKey !== stage.key) setDragKey(stage.key) }}
                onDragLeave={() => setDragKey(k => (k === stage.key ? null : k))}
                onDrop={e => {
                  e.preventDefault(); setDragKey(null)
                  const id = e.dataTransfer.getData('text/plain')
                  const c = rows.find(r => r.id === id)
                  if (c) moveTo(c, stage.key)
                }}
              >
                <div className="helm-col-head">
                  <span className={'helm-dot ' + stage.tone} />
                  <b>{stage.label}</b>
                  <span className="helm-col-count">{cards.length}</span>
                  <span className="helm-col-sum">{total ? money(total) : ''}</span>
                </div>
                <div className="helm-col-body">
                  {cards.map(r => (
                    <div
                      key={r.id}
                      className="helm-kcard"
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', r.id)}
                      onClick={() => setActive(r)}
                    >
                      <div className="helm-kcard-top">
                        <b>{r.name}</b>
                        {Number(r.deal_value) > 0 && <span className="helm-kcard-val">{money(r.deal_value)}</span>}
                      </div>
                      {r.company && <div className="helm-kcard-sub"><Building2 size={12} />{r.company}</div>}
                      <div className="helm-kcard-meta">
                        {r.phone && <span><Phone size={11} />{r.phone}</span>}
                        {r.email && <span><Mail size={11} />{r.email}</span>}
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && <div className="helm-col-empty">Suelta aquí</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : filtered.length === 0 ? (
        <Panel title="Contactos"><Empty>Sin contactos que coincidan.</Empty></Panel>
      ) : (
        <Panel title={`Contactos (${filtered.length})`}>
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead><tr><th>Nombre</th><th>Empresa</th><th>Email</th><th>Teléfono</th><th>Etapa</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setActive(r)}>
                    <td>{r.name}</td>
                    <td>{r.company || '—'}</td>
                    <td>{r.email || '—'}</td>
                    <td>{r.phone || '—'}</td>
                    <td><span className={'helm-chip ' + chipClass(r.status)}>{STAGES.find(s => s.key === normalize(r.status))?.label}</span></td>
                    <td className="helm-num">{Number(r.deal_value) > 0 ? money(r.deal_value) : '—'}</td>
                    <td><Trash2 size={15} className="helm-x" onClick={e => { e.stopPropagation(); remove(r.id) }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {open && (
        <Modal title="Nuevo contacto" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Field label="Nombre *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <div className="helm-form-2">
              <Field label="Empresa"><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></Field>
              <Field label="Cargo"><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></Field>
            </div>
            <div className="helm-form-2">
              <Field label="Email"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Teléfono"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <div className="helm-form-2">
              <Field label="Etapa">
                <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </Select>
              </Field>
              <Field label="Valor potencial (€)"><Input type="number" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} /></Field>
            </div>
            <Field label="Origen"><Input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Instagram, referido, web…" /></Field>
            <Field label="Notas"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Guardar contacto</button>
          </form>
        </Modal>
      )}

      {active && (
        <ContactDrawer
          key={active.id}
          contact={active}
          onClose={() => setActive(null)}
          onMove={moveTo}
          onSaved={(patch) => { setRows(rs => rs.map(r => r.id === active.id ? { ...r, ...patch } : r)); setActive(a => ({ ...a, ...patch })) }}
          onDelete={() => remove(active.id)}
        />
      )}
    </>
  )
}

function ContactDrawer({ contact, onClose, onMove, onSaved, onDelete }) {
  const [edit, setEdit] = useState({
    name: contact.name || '', email: contact.email || '', phone: contact.phone || '',
    company: contact.company || '', position: contact.position || '',
    deal_value: contact.deal_value || '', notes: contact.notes || '',
  })
  const [acts, setActs] = useState(null)
  const [actType, setActType] = useState('note')
  const [actText, setActText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchActivities(contact.id).then(setActs) }, [contact.id])

  async function saveFields() {
    setSaving(true)
    const patch = {
      name: edit.name.trim(), email: edit.email.trim(), phone: edit.phone.trim(),
      company: edit.company.trim(), position: edit.position.trim(), notes: edit.notes.trim(),
      deal_value: edit.deal_value ? Number(edit.deal_value) : 0, updated_at: new Date().toISOString(),
    }
    try { await updateRow('crm_contacts', contact.id, patch); onSaved(patch) } finally { setSaving(false) }
  }

  async function addActivity(e) {
    e.preventDefault()
    if (!actText.trim()) return
    const row = await insertRow('crm_activities', {
      client_id: contact.client_id, contact_id: contact.id, type: actType,
      description: actText.trim(), performed_at: new Date().toISOString(),
    })
    setActs(a => [row, ...(a || [])]); setActText('')
    onSaved({ last_activity_at: row.performed_at })
    updateRow('crm_contacts', contact.id, { last_activity_at: row.performed_at }).catch(() => {})
  }

  const stageKey = normalize(contact.status)

  return (
    <Drawer
      title={contact.name}
      sub={[contact.position, contact.company].filter(Boolean).join(' · ') || 'Contacto'}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="helm-btn primary" onClick={saveFields} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button className="helm-btn" onClick={onDelete} title="Eliminar contacto"><Trash2 size={15} /></button>
        </div>
      }
    >
      <div className="helm-drawer-stage">
        {STAGES.map(s => (
          <button
            key={s.key}
            className={'helm-stagepill ' + s.tone + (stageKey === s.key ? ' on' : '')}
            onClick={() => onMove(contact, s.key)}
          >{s.label}</button>
        ))}
      </div>

      <div className="helm-form-2">
        <Field label="Nombre"><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Valor (€)"><Input type="number" value={edit.deal_value} onChange={e => setEdit({ ...edit, deal_value: e.target.value })} /></Field>
      </div>
      <div className="helm-form-2">
        <Field label="Empresa"><Input value={edit.company} onChange={e => setEdit({ ...edit, company: e.target.value })} /></Field>
        <Field label="Cargo"><Input value={edit.position} onChange={e => setEdit({ ...edit, position: e.target.value })} /></Field>
      </div>
      <div className="helm-form-2">
        <Field label="Email"><Input value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
      </div>
      <Field label="Notas"><Textarea value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field>

      <div className="helm-drawer-section">Actividad</div>
      <form onSubmit={addActivity} className="helm-act-form">
        <Select value={actType} onChange={e => setActType(e.target.value)} style={{ maxWidth: 130 }}>
          {ACT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
        <Input value={actText} onChange={e => setActText(e.target.value)} placeholder="Registrar interacción…" />
        <button type="submit" className="helm-btn primary"><Send size={14} /></button>
      </form>

      <div className="helm-timeline">
        {acts == null ? <div className="helm-col-empty">Cargando…</div>
          : acts.length === 0 ? <div className="helm-col-empty">Sin actividad todavía.</div>
          : acts.map(a => (
            <div key={a.id} className="helm-tl-item">
              <span className="helm-chip">{ACT_TYPES.find(t => t.key === a.type)?.label || a.type}</span>
              <div className="helm-tl-body">
                <div>{a.description || a.title || '—'}</div>
                <small>{fmtDate(a.performed_at)}</small>
              </div>
            </div>
          ))}
      </div>
    </Drawer>
  )
}
