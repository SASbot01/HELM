// HELM — CRM estilo GHL: pipeline kanban con drag&drop + lista + ficha de contacto.
//
// Tres piezas separadas a propósito:
//   ../crm/contact.js       qué campos tiene un contacto y cómo se validan
//   ../crm/pipeline.js      qué etapas y subetapas tiene ESTE perfil (editables)
//   ../crm/ContactFields    cómo se pintan esos campos (alta y ficha comparten)
import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, LayoutGrid, List, Search, Phone, Mail, Building2, Send,
  Instagram, Globe, SlidersHorizontal, Package, MapPin,
} from 'lucide-react'
import {
  supabase, fetchRows, fetchRowsOrError, insertRow, updateRow, deleteRow, fetchActivities,
  money, fmtDate, isSaleCancelled,
} from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Tabs, Kpi, Drawer, FormNote } from '../ui'
import { EMPTY_CONTACT, validate, toRow, toForm } from '../crm/contact'
import { ContactFields } from '../crm/ContactFields'
import {
  loadPipelines, normalizeStage, stageOf, pipelineDe, WON_KEYS, LOST_KEYS,
} from '../crm/pipeline'
import EditorEtapas from '../crm/EditorEtapas'
import { withRole } from '../equipo/roles'

const ACT_TYPES = [
  { key: 'note', label: 'Nota' },
  { key: 'call', label: 'Llamada' },
  { key: 'email', label: 'Email' },
  { key: 'meeting', label: 'Reunión' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

// La ficha de Google Maps del negocio, si el contacto vino del Scraper (o de un
// lote de prospección). Solo enlaces de Google: custom_fields lo puede tocar
// cualquiera con acceso al CRM, y esto acaba en un href.
const mapsDe = (c) => {
  const u = String(c?.custom_fields?.maps_url || '')
  return /^https:\/\/(www\.|maps\.)?(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)\//i.test(u) ? u : ''
}

export default function Crm({ clientId }) {
  const [rows, setRows] = useState(null)
  const [pipelines, setPipelines] = useState(null)  // todos los del perfil
  const [pipelineId, setPipelineId] = useState(undefined)
  const [services, setServices] = useState([])
  const [people, setPeople] = useState([])
  const [sales, setSales] = useState([])
  const [tab, setTab] = useState('pipeline')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editEtapas, setEditEtapas] = useState(false)
  const [active, setActive] = useState(null)   // contacto abierto en el drawer
  const [dragKey, setDragKey] = useState(null) // etapa sobre la que se arrastra
  const [toast, setToast] = useState(null)

  // Filtros del pipeline.
  const [fServicio, setFServicio] = useState('__all__')
  const [fResponsable, setFResponsable] = useState('__all__')
  const [fSubetapa, setFSubetapa] = useState('__all__')

  const load = () => fetchRows('crm_contacts', clientId).then(setRows)

  useEffect(() => {
    load()
    // Se recuerda el último pipeline abierto por perfil: quien trabaja a diario
    // en "Partnerships" no quiere volver a "Ventas" en cada recarga.
    loadPipelines(clientId).then(ps => {
      setPipelines(ps)
      const guardado = localStorage.getItem(`helm_pipeline_${clientId}`)
      const existe = ps.some(p => String(p.id) === guardado)
      setPipelineId(existe ? (guardado === 'null' ? null : guardado) : (ps.find(p => p.isDefault) || ps[0]).id)
    })
    fetchRowsOrError('helm_services', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setServices(r))
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
    // Las ventas alimentan la facturación por cliente que se ve en su ficha.
    fetchRows('sales', clientId, { limit: 2000 }).then(v => setSales(v.filter(s => !isSaleCancelled(s))))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const pipeline = useMemo(
    () => (pipelines || []).find(p => p.id === pipelineId) || (pipelines || [])[0] || null,
    [pipelines, pipelineId],
  )
  // Memoizados: si no, cada render crea un array/objeto nuevo y todos los
  // useMemo que dependen de ellos se recalculan siempre.
  const stages = useMemo(() => pipeline?.stages || [], [pipeline])
  const substages = useMemo(() => pipeline?.substages || {}, [pipeline])

  function elegirPipeline(id) {
    setPipelineId(id)
    localStorage.setItem(`helm_pipeline_${clientId}`, String(id))
    // Los filtros son de la vista anterior: arrastrarlos a otro pipeline deja
    // el tablero vacío sin que se entienda por qué.
    setFSubetapa('__all__')
  }

  // Responsables que aparecen en algún contacto, para el filtro por perfil.
  const responsables = useMemo(
    () => [...new Set((rows || []).map(r => (r.assigned_to || '').trim()).filter(Boolean))].sort(),
    [rows],
  )

  // Todas las subetapas definidas, aplanadas, para el desplegable de filtro.
  const todasSubetapas = useMemo(() => {
    const out = []
    for (const [stageKey, list] of Object.entries(substages)) {
      const st = stages.find(s => s.key === stageKey)
      for (const sub of (list || [])) out.push({ ...sub, stageKey, stageLabel: st?.label || stageKey })
    }
    return out
  }, [substages, stages])

  const filtered = useMemo(() => {
    if (!rows) return null
    const q = query.toLowerCase().trim()
    return rows.filter(r => {
      if (pipeline && pipelineDe(r, pipelines).id !== pipeline.id) return false
      if (fServicio !== '__all__' && (r.service_id || '') !== fServicio) return false
      if (fResponsable !== '__all__' && (r.assigned_to || '').trim() !== fResponsable) return false
      if (fSubetapa !== '__all__' && !(Array.isArray(r.substages) && r.substages.includes(fSubetapa))) return false
      if (!q) return true
      return [r.name, r.company, r.email, r.phone, r.instagram, r.source, r.assigned_to]
        .some(v => (v || '').toLowerCase().includes(q))
        || (Array.isArray(r.tags) && r.tags.some(t => String(t).toLowerCase().includes(q)))
    })
  }, [rows, query, fServicio, fResponsable, fSubetapa, pipeline, pipelines])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(stages.map(s => [s.key, []]))
    for (const r of (filtered || [])) {
      const k = normalizeStage(r.status, stages)
      ;(map[k] = map[k] || []).push(r)
    }
    return map
  }, [filtered, stages])

  const stats = useMemo(() => {
    const all = (rows || []).filter(r => !pipeline || pipelineDe(r, pipelines).id === pipeline.id)
    const key = (r) => normalizeStage(r.status, stages)
    const won = all.filter(r => WON_KEYS.has(key(r)))
    const lost = all.filter(r => LOST_KEYS.has(key(r)))
    const abiertos = all.filter(r => !WON_KEYS.has(key(r)) && !LOST_KEYS.has(key(r)))
    const sum = (a) => a.reduce((t, r) => t + (Number(r.deal_value) || 0), 0)
    const closed = won.length + lost.length
    return {
      total: all.length,
      openValue: sum(abiertos),
      wonValue: sum(won),
      closed,
      winRate: closed ? Math.round((won.length / closed) * 100) : 0,
    }
  }, [rows, stages, pipeline, pipelines])

  const hayFiltro = fServicio !== '__all__' || fResponsable !== '__all__' || fSubetapa !== '__all__'

  async function createContact(form) {
    const row = await insertRow('crm_contacts', {
      client_id: clientId, pipeline_id: pipeline?.id || null, ...toRow(form, stages),
    })
    setRows(rs => [row, ...(rs || [])])
    setOpen(false)
  }

  async function remove(id) {
    const c = (rows || []).find(r => r.id === id)
    if (!window.confirm(`¿Eliminar a ${c?.name || 'este contacto'}? No se puede deshacer.`)) return
    try {
      await deleteRow('crm_contacts', id)
      setRows(rs => (rs || []).filter(r => r.id !== id))
      setActive(a => (a && a.id === id ? null : a))
    } catch (err) {
      setToast('No se pudo eliminar: ' + (err?.message || 'error desconocido'))
    }
  }

  // Mover un contacto a OTRO pipeline. Su etapa se traduce a la equivalente del
  // destino (normalizeStage ya sabe hacerlo) en vez de dejarlo con una clave que
  // allí no existe, y las subetapas se limpian porque pertenecían al de origen.
  async function moverDePipeline(contact, destinoId) {
    const destino = pipelines.find(p => p.id === destinoId)
    if (!destino) return
    const patch = {
      pipeline_id: destino.id,
      status: normalizeStage(contact.status, destino.stages),
      substages: [],
      updated_at: new Date().toISOString(),
    }
    const before = {
      pipeline_id: contact.pipeline_id, status: contact.status, substages: contact.substages,
    }
    setRows(rs => rs.map(r => r.id === contact.id ? { ...r, ...patch } : r))
    setActive(null)   // el contacto ya no vive en el tablero que se está viendo
    try {
      await updateRow('crm_contacts', contact.id, patch)
      setToast(`${contact.name} movido a "${destino.name}"`)
    } catch (err) {
      setRows(rs => rs.map(r => r.id === contact.id ? { ...r, ...before } : r))
      setToast('No se pudo mover de pipeline: ' + (err?.message || 'error desconocido'))
    }
  }

  // Mover de etapa (optimista). Al cambiar de columna se limpian las subetapas:
  // pertenecen a la etapa de la que sale, no a la nueva.
  async function moveTo(contact, stageKey) {
    if (normalizeStage(contact.status, stages) === stageKey) return
    const before = { status: contact.status, substages: contact.substages }
    const patch = { status: stageKey, substages: [], updated_at: new Date().toISOString() }
    setRows(rs => rs.map(r => r.id === contact.id ? { ...r, ...patch } : r))
    setActive(a => (a && a.id === contact.id ? { ...a, ...patch } : a))
    try {
      await updateRow('crm_contacts', contact.id, patch)
    } catch (err) {
      setRows(rs => rs.map(r => r.id === contact.id ? { ...r, ...before } : r))
      setActive(a => (a && a.id === contact.id ? { ...a, ...before } : a))
      setToast('No se pudo mover de etapa: ' + (err?.message || 'error desconocido'))
    }
  }

  if (pipelines == null || pipeline == null) return <Empty>Cargando…</Empty>

  return (
    <>
      <div className="helm-grid helm-kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Contactos" value={stats.total} />
        <Kpi label="Pipeline abierto" value={money(stats.openValue)} accent />
        <Kpi label="Ganado" value={money(stats.wonValue)} />
        {/* Con 0 cierres el % da 0 correctamente, pero un 0% al lado de "Ganado
            0€" se lee como "no se ha cerrado nada" cuando en realidad es
            "todavía no hay datos" — son dos mensajes distintos. Y con 1-2
            cierres, un 100%/0% es matemáticamente cierto pero engañoso sin la
            muestra al lado: el sub lo deja claro en vez de esconderlo. */}
        <Kpi
          label="Tasa de cierre"
          value={stats.closed ? stats.winRate + '%' : '—'}
          sub={stats.closed ? `de ${stats.closed} cerrado${stats.closed === 1 ? '' : 's'}` : 'sin cierres aún'}
        />
      </div>

      {/* Con un solo pipeline el selector sobra y solo añade ruido; aparece
          en cuanto hay más de uno. */}
      {pipelines.length > 1 && (
        <div className="helm-pipe-tabs">
          {pipelines.map(p => (
            <button
              key={p.id ?? 'virtual'}
              className={'helm-pipe-tab' + (p.id === pipeline.id ? ' on' : '')}
              onClick={() => elegirPipeline(p.id)}
            >
              {p.name}
              <span>{(rows || []).filter(r => pipelineDe(r, pipelines).id === p.id).length}</span>
            </button>
          ))}
        </div>
      )}

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
            <input placeholder="Buscar por nombre, empresa, email, etiqueta…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <button className="helm-btn" onClick={() => setEditEtapas(true)} title="Pipelines, etapas y subetapas">
            <SlidersHorizontal size={15} />Pipelines
          </button>
          <button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo contacto</button>
        </div>
      </div>

      <div className="helm-filter-row" style={{ marginBottom: 16 }}>
        {services.length > 0 && (
          <select className="helm-select" value={fServicio} onChange={e => setFServicio(e.target.value)}>
            <option value="__all__">Todos los servicios</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {responsables.length > 0 && (
          <select className="helm-select" value={fResponsable} onChange={e => setFResponsable(e.target.value)}>
            <option value="__all__">Todos los responsables</option>
            {responsables.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {todasSubetapas.length > 0 && (
          <select className="helm-select" value={fSubetapa} onChange={e => setFSubetapa(e.target.value)}>
            <option value="__all__">Todas las subetapas</option>
            {todasSubetapas.map(s => (
              <option key={s.stageKey + ':' + s.key} value={s.key}>{s.stageLabel} · {s.label}</option>
            ))}
          </select>
        )}
        {hayFiltro && (
          <button className="helm-btn" onClick={() => { setFServicio('__all__'); setFResponsable('__all__'); setFSubetapa('__all__') }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {toast && <div className="helm-formnote error" style={{ marginBottom: 14 }}>{toast}</div>}

      {filtered == null ? (
        <Empty>Cargando…</Empty>
      ) : tab === 'pipeline' ? (
        <div className="helm-kanban">
          {stages.map(stage => {
            const cards = byStage[stage.key] || []
            const total = cards.reduce((t, r) => t + (Number(r.deal_value) || 0), 0)
            const subs = substages[stage.key] || []
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
                        {mapsDe(r) && (
                          <a href={mapsDe(r)} target="_blank" rel="noopener noreferrer"
                            draggable={false} onClick={e => e.stopPropagation()}>
                            <MapPin size={11} />Google Maps
                          </a>
                        )}
                      </div>
                      {/* Las subetapas se ven en la propia tarjeta: ese era el
                          objetivo — saber a cuánto vista es cada seguimiento
                          sin abrir lead por lead. */}
                      {subs.length > 0 && Array.isArray(r.substages) && r.substages.length > 0 && (
                        <div className="helm-kcard-tags">
                          {r.substages.map(k => (
                            <span key={k} className={'helm-chip ' + stage.tone}>
                              {subs.find(s => s.key === k)?.label || k}
                            </span>
                          ))}
                        </div>
                      )}
                      {Array.isArray(r.tags) && r.tags.length > 0 && (
                        <div className="helm-kcard-tags">
                          {r.tags.slice(0, 3).map(t => <span key={t} className="helm-tag">{t}</span>)}
                        </div>
                      )}
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
              <thead>
                <tr>
                  <th>Nombre</th><th>Empresa</th><th>Email</th><th>Teléfono</th>
                  <th>Servicio</th><th>Responsable</th><th>Etapa</th><th>Valor</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const st = stageOf(r.status, stages)
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setActive(r)}>
                      <td>{r.name}</td>
                      <td>{r.company || '—'}</td>
                      <td>{r.email || '—'}</td>
                      <td>{r.phone || '—'}</td>
                      <td>{services.find(s => s.id === r.service_id)?.name || '—'}</td>
                      <td>{r.assigned_to || '—'}</td>
                      <td><span className={'helm-chip ' + (st?.tone || '')}>{st?.label}</span></td>
                      <td className="helm-num">{Number(r.deal_value) > 0 ? money(r.deal_value) : '—'}</td>
                      <td><Trash2 size={15} className="helm-x" onClick={e => { e.stopPropagation(); remove(r.id) }} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {open && (
        <NewContactModal
          rows={rows || []} stages={stages} services={services}
          onClose={() => setOpen(false)} onCreate={createContact}
        />
      )}

      {editEtapas && (
        <EditorEtapas
          clientId={clientId}
          pipelines={pipelines}
          activeId={pipeline.id}
          contacts={rows || []}
          onContactsChanged={load}
          onClose={() => setEditEtapas(false)}
          onSaved={(lista, id, opts) => {
            setPipelines(lista)
            if (id !== undefined) elegirPipeline(id)
            if (opts?.cerrar) setEditEtapas(false)
          }}
        />
      )}

      {active && (
        <ContactDrawer
          key={active.id}
          contact={active}
          rows={rows || []}
          stages={stages}
          substages={substages}
          pipelines={pipelines}
          onMovePipeline={moverDePipeline}
          services={services}
          people={people}
          sales={sales}
          onClose={() => setActive(null)}
          onMove={moveTo}
          onSaved={(patch) => { setRows(rs => rs.map(r => r.id === active.id ? { ...r, ...patch } : r)); setActive(a => ({ ...a, ...patch })) }}
          onDelete={() => remove(active.id)}
        />
      )}
    </>
  )
}

// ── Alta manual ────────────────────────────────────────────────────────────
function NewContactModal({ rows, stages, services, onClose, onCreate }) {
  const [form, setForm] = useState({ ...EMPTY_CONTACT, status: stages[0]?.key || 'lead' })
  const [touched, setTouched] = useState(false)   // no gritar antes del primer intento
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const { errors, dup, ok } = validate(form, { rows })
  const shown = touched ? errors : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!ok) return
    if (dup && !window.confirm(
      `Ya existe "${dup.name}" con ese email o teléfono. ¿Crear igualmente un contacto nuevo?`,
    )) return
    setSaving(true)
    try {
      await onCreate(form)
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el contacto')
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo contacto" onClose={onClose} wide>
      {/* noValidate: la validación es nuestra, no la del navegador. */}
      <form onSubmit={submit} noValidate>
        <ContactFields form={form} errors={shown} set={set} stages={stages} services={services} />

        {dup && (
          <FormNote tone="warn">
            Posible duplicado: <b>{dup.name}</b>
            {dup.company ? ` (${dup.company})` : ''} ya tiene ese email o teléfono.
          </FormNote>
        )}
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}
        <FormNote>{error}</FormNote>

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar contacto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Ficha ──────────────────────────────────────────────────────────────────
function ContactDrawer({
  contact, rows, stages, substages, services, people, sales, pipelines,
  onClose, onMove, onMovePipeline, onSaved, onDelete,
}) {
  const [form, setForm] = useState(() => toForm(contact, stages))
  const [touched, setTouched] = useState(false)
  const [acts, setActs] = useState(null)
  const [actType, setActType] = useState('note')
  const [actText, setActText] = useState('')
  // Quién registra la interacción. Se recuerda entre actividades: normalmente
  // es la misma persona apuntando varias cosas seguidas.
  const [actWho, setActWho] = useState(() => localStorage.getItem('helm_last_actor') || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  // Formularios que ha rellenado este contacto. Cada uno abre su propia
  // pestaña con las respuestas: el equipo lee la ficha y el cuestionario en el
  // mismo sitio, sin salir del CRM.
  const [respuestas, setRespuestas] = useState([])
  const [dtab, setDtab] = useState('ficha')

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false) }
  const { errors, ok } = validate(form, { rows, ignoreId: contact.id })
  const shown = touched ? errors : {}

  useEffect(() => { fetchActivities(contact.id).then(setActs) }, [contact.id])

  useEffect(() => {
    let vivo = true
    setRespuestas([]); setDtab('ficha')
    supabase.from('helm_form_responses')
      .select('id, answers, meta, submitted_at, helm_forms(title, fields)')
      .eq('contact_id', contact.id)
      .order('submitted_at', { ascending: true })
      .then(({ data, error: e }) => {
        // Sin la migración de formularios la tabla no existe: la ficha tiene
        // que seguir abriéndose igual, solo que sin pestañas.
        if (!vivo || e) return
        setRespuestas(data || [])
      })
    return () => { vivo = false }
  }, [contact.id])

  const stageKey = normalizeStage(contact.status, stages)
  const subs = substages[stageKey] || []
  const servicio = services.find(s => s.id === contact.service_id)

  // Lo que ha facturado este cliente. Se cruza por contact_id (ventas nuevas) y,
  // si no lo tienen, por el nombre — así las ventas antiguas también cuentan.
  const facturacion = useMemo(() => {
    const nombre = (contact.name || '').trim().toLowerCase()
    const suyas = sales.filter(v =>
      (v.contact_id && v.contact_id === contact.id)
      || (!v.contact_id && nombre && (v.client_name || '').trim().toLowerCase() === nombre))
    return {
      n: suyas.length,
      facturado: suyas.reduce((a, v) => a + (Number(v.revenue) || 0), 0),
      cobrado: suyas.reduce((a, v) => a + (Number(v.cash_collected) || 0), 0),
      ultima: suyas[0]?.date,
    }
  }, [sales, contact.id, contact.name])

  const toggleSub = (key) => {
    const list = Array.isArray(form.substages) ? form.substages : []
    set('substages', list.includes(key) ? list.filter(k => k !== key) : [...list, key])
  }

  // La etapa se cambia con las píldoras de arriba (efecto inmediato), así que
  // el formulario de abajo no la incluye: si no, habría dos mandos para lo mismo.
  async function saveFields() {
    setTouched(true)
    setError(null)
    if (!ok) return
    setSaving(true)
    try {
      const patch = { ...toRow(form, stages), updated_at: new Date().toISOString() }
      delete patch.status
      await updateRow('crm_contacts', contact.id, patch)
      onSaved(patch)
      setSaved(true)
    } catch (err) {
      setError(err?.message || 'No se pudieron guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  async function addActivity(e) {
    e.preventDefault()
    const text = actText.trim()
    if (!text) return
    const autor = people.find(p => p.id === actWho)
    try {
      const row = await insertRow('crm_activities', {
        client_id: contact.client_id, contact_id: contact.id, type: actType,
        description: text, performed_at: new Date().toISOString(),
        // Nombre y rol se copian junto al id: el timeline tiene que seguir
        // diciendo quién hizo qué aunque esa persona se dé de baja.
        performed_by_id: autor?.id || null,
        performed_by: autor?.name || '',
        performed_by_role: autor?.role || '',
      })
      setActs(a => [row, ...(a || [])]); setActText('')
      if (autor) localStorage.setItem('helm_last_actor', autor.id)
      onSaved({ last_activity_at: row.performed_at })
      updateRow('crm_contacts', contact.id, { last_activity_at: row.performed_at }).catch(() => {})
    } catch (err) {
      setError('No se pudo registrar la actividad: ' + (err?.message || 'error'))
    }
  }

  const dirty = JSON.stringify(toRow(form, stages)) !== JSON.stringify(toRow(toForm(contact, stages), stages))

  // Una pestaña por respuesta. Si el mismo formulario se ha rellenado varias
  // veces se numeran, que si no salen dos pestañas idénticas.
  const tabsFormularios = useMemo(() => {
    const vistos = {}
    const total = {}
    for (const r of respuestas) {
      const t = r.helm_forms?.title || 'Formulario'
      total[t] = (total[t] || 0) + 1
    }
    return respuestas.map(r => {
      const t = r.helm_forms?.title || 'Formulario'
      vistos[t] = (vistos[t] || 0) + 1
      return { key: r.id, label: total[t] > 1 ? `${t} · ${vistos[t]}` : t }
    })
  }, [respuestas])

  const respuestaActiva = respuestas.find(r => r.id === dtab) || null

  return (
    <Drawer
      title={contact.name}
      sub={[contact.position, contact.company].filter(Boolean).join(' · ') || 'Contacto'}
      onClose={onClose}
      footer={
        dtab !== 'ficha' ? null : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="helm-btn primary" onClick={saveFields} disabled={saving || (!dirty && !touched)} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Guardando…' : saved && !dirty ? 'Guardado ✓' : 'Guardar cambios'}
            </button>
            <button className="helm-btn" onClick={onDelete} title="Eliminar contacto"><Trash2 size={15} /></button>
          </div>
        )
      }
    >
      {tabsFormularios.length > 0 && (
        <Tabs
          value={dtab} onChange={setDtab}
          tabs={[{ key: 'ficha', label: 'Ficha' }, ...tabsFormularios]}
        />
      )}

      {respuestaActiva ? <RespuestaFormulario resp={respuestaActiva} /> : <>
      <div className="helm-drawer-stage">
        {stages.map(s => (
          <button
            key={s.key}
            className={'helm-stagepill ' + s.tone + (stageKey === s.key ? ' on' : '')}
            onClick={() => onMove(contact, s.key)}
          >{s.label}</button>
        ))}
      </div>

      {/* Cambiar de pipeline es raro pero necesario: un lead de ventas que
          acaba siendo una colaboración. Va aquí arriba, junto a la etapa,
          porque son la misma idea: dónde está este contacto. */}
      {pipelines.length > 1 && (
        <Field label="Pipeline">
          <Select
            value={contact.pipeline_id || (pipelines.find(p => p.isDefault) || pipelines[0]).id || ''}
            onChange={e => {
              const destino = e.target.value || null
              if (window.confirm('Mover el contacto a otro pipeline. Su etapa se ajustará a la equivalente. ¿Seguir?')) {
                onMovePipeline(contact, destino)
              }
            }}
          >
            {pipelines.map(p => <option key={p.id ?? 'virtual'} value={p.id ?? ''}>{p.name}</option>)}
          </Select>
        </Field>
      )}

      {/* Subetapas de la etapa en la que está ahora mismo. Selección múltiple. */}
      {subs.length > 0 && (
        <div className="helm-substages">
          <small>Subetapa</small>
          <div className="helm-pickers" style={{ marginBottom: 0 }}>
            {subs.map(s => (
              <button
                key={s.key} type="button"
                className={'helm-pick' + ((form.substages || []).includes(s.key) ? ' on' : '')}
                onClick={() => toggleSub(s.key)}
              >{s.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Resumen comercial: qué tiene contratado y cuánto ha dejado. Es lo que
          pedía el informe al abrir un lead. */}
      <div className="helm-lead-summary">
        <div>
          <small>Servicio activo</small>
          <b>{servicio?.name || '—'}</b>
          {servicio?.duration_days ? <span>{servicio.duration_days} días</span> : null}
        </div>
        <div>
          <small>Facturado</small>
          <b>{money(facturacion.facturado)}</b>
          <span>{facturacion.n} venta{facturacion.n === 1 ? '' : 's'}</span>
        </div>
        <div>
          <small>Cobrado</small>
          <b>{money(facturacion.cobrado)}</b>
          {facturacion.ultima && <span>última: {fmtDate(facturacion.ultima)}</span>}
        </div>
      </div>

      {/* Accesos directos: lo que más se usa desde una ficha es llamar o escribir. */}
      <div className="helm-drawer-links">
        {contact.phone && <a className="helm-btn sm" href={`tel:${contact.phone}`}><Phone size={13} />Llamar</a>}
        {(contact.whatsapp || contact.phone) && (
          <a className="helm-btn sm" target="_blank" rel="noreferrer"
            href={`https://wa.me/${String(contact.whatsapp || contact.phone).replace(/\D/g, '')}`}>
            <Send size={13} />WhatsApp
          </a>
        )}
        {contact.email && <a className="helm-btn sm" href={`mailto:${contact.email}`}><Mail size={13} />Email</a>}
        {contact.instagram && (
          <a className="helm-btn sm" target="_blank" rel="noreferrer" href={`https://instagram.com/${contact.instagram}`}>
            <Instagram size={13} />Instagram
          </a>
        )}
        {contact.website && <a className="helm-btn sm" target="_blank" rel="noreferrer" href={contact.website}><Globe size={13} />Web</a>}
        {mapsDe(contact) && (
          <a className="helm-btn sm" target="_blank" rel="noopener noreferrer" href={mapsDe(contact)}>
            <MapPin size={13} />Google Maps
          </a>
        )}
        {servicio?.recursos?.map((r, i) => (
          <a key={i} className="helm-btn sm" target="_blank" rel="noreferrer" href={r.url}>
            <Package size={13} />{r.label || 'Recurso'}
          </a>
        ))}
      </div>

      <ContactFields form={form} errors={shown} set={set} showStage={false} stages={stages} services={services} />

      {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}
      <FormNote>{error}</FormNote>

      <div className="helm-drawer-section">Actividad</div>
      <form onSubmit={addActivity} className="helm-act-form">
        <Select value={actType} onChange={e => setActType(e.target.value)} style={{ maxWidth: 130 }}>
          {ACT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
        {people.length > 0 && (
          <Select value={actWho} onChange={e => setActWho(e.target.value)} style={{ maxWidth: 140 }} title="Quién lo hace">
            <option value="">¿Quién?</option>
            {people.filter(p => p.active !== false).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        )}
        <Input value={actText} onChange={e => setActText(e.target.value)} placeholder="Registrar interacción…" />
        <button type="submit" className="helm-btn primary" disabled={!actText.trim()}><Send size={14} /></button>
      </form>

      <div className="helm-timeline">
        {acts == null ? <div className="helm-col-empty">Cargando…</div>
          : acts.length === 0 ? <div className="helm-col-empty">Sin actividad todavía.</div>
          : acts.map(a => (
            <div key={a.id} className="helm-tl-item">
              <span className="helm-chip">{ACT_TYPES.find(t => t.key === a.type)?.label || a.type}</span>
              <div className="helm-tl-body">
                <div>{a.description || a.title || '—'}</div>
                <small>
                  {fmtDate(a.performed_at)}
                  {a.performed_by ? ` · ${withRole(a.performed_by, a.performed_by_role)}` : ''}
                </small>
              </div>
            </div>
          ))}
      </div>
      </>}
    </Drawer>
  )
}

// Las respuestas de un formulario, en solo lectura. El orden lo manda la
// plantilla (form.fields), no el objeto de respuestas: así el cuestionario se
// lee en el mismo orden en que lo rellenó el lead.
function RespuestaFormulario({ resp }) {
  const fields = resp.helm_forms?.fields || []
  const answers = resp.answers || {}
  const meta = resp.meta || {}

  const valor = (v) => {
    if (v == null || v === '') return '—'
    if (Array.isArray(v)) return v.length ? v.join(' · ') : '—'
    return String(v)
  }

  // De dónde llegó el lead. Solo se pinta lo que venga con contenido: en un
  // envío directo casi todo esto está vacío y no aporta nada verlo.
  const origen = [
    ['Campaña', meta.utm_campaign], ['Fuente', meta.utm_source], ['Medio', meta.utm_medium],
    ['Anuncio', meta.utm_content], ['Referrer', meta.referrer],
  ].filter(([, v]) => v)

  return (
    <>
      <div className="helm-form-resp-head">
        <div>
          <small>Recibido</small>
          <b>{fmtDate(resp.submitted_at)}</b>
        </div>
        {/* Cuando el formulario además reserva una llamada (la VSL de Hugo),
            la hora es lo primero que hay que ver al abrir la ficha. */}
        {meta.slot_start && (
          <div>
            <small>Llamada reservada</small>
            <b>{fmtDate(meta.slot_start)} · {new Date(meta.slot_start)
              .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</b>
          </div>
        )}
        {meta.lead_tier && (
          <div>
            <small>Calidad del lead</small>
            <b>
              <span className={'helm-chip ' + (meta.lead_tier === 'A' ? 'green' : meta.lead_tier === 'B' ? 'amber' : '')}>
                {meta.lead_tier}
              </span>
              {Number.isFinite(Number(meta.lead_score)) ? ` ${Number(meta.lead_score)}/100` : ''}
            </b>
          </div>
        )}
      </div>

      <div className="helm-drawer-section">Respuestas</div>
      <div className="helm-form-resp">
        {fields.length === 0 ? (
          <div className="helm-col-empty">Este formulario ya no tiene preguntas definidas.</div>
        ) : fields.map(f => (
          <div key={f.key} className="helm-form-resp-item">
            <small>{f.label}</small>
            <div>{valor(answers[f.key])}</div>
          </div>
        ))}
      </div>

      {origen.length > 0 && (
        <>
          <div className="helm-drawer-section">De dónde vino</div>
          <div className="helm-form-resp">
            {origen.map(([k, v]) => (
              <div key={k} className="helm-form-resp-item">
                <small>{k}</small>
                <div className="helm-form-resp-mono">{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
