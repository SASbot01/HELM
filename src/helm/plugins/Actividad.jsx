// HELM plugin — Actividad. Timeline global de interacciones (crm_activities).
//
// Cada línea dice QUIÉN lo hizo y con qué rol: "el closer Juan añadió una nota
// en Pepito Pérez". Antes solo se veía el qué, así que en un equipo de tres
// personas el timeline no servía para pedir cuentas ni para saber a quién
// preguntarle por un lead.
import { useEffect, useMemo, useState } from 'react'
import { Phone, Mail, Users, MessageSquare, StickyNote } from 'lucide-react'
import { fetchRows, fetchRowsOrError, fmtDate } from '../lib'
import { Panel, Empty } from '../ui'
import { ROLES, withRole } from '../equipo/roles'

const ICON = { call: Phone, email: Mail, meeting: Users, whatsapp: MessageSquare, note: StickyNote }
// El verbo de cada tipo, para que la frase se lea entera.
const VERBO = {
  call: 'registró una llamada',
  email: 'envió un email',
  meeting: 'tuvo una reunión',
  whatsapp: 'habló por WhatsApp',
  note: 'añadió una nota',
}

export default function Actividad({ clientId }) {
  const [acts, setActs] = useState(null)
  const [names, setNames] = useState({})
  const [people, setPeople] = useState([])
  const [fPersona, setFPersona] = useState('__all__')
  const [fRol, setFRol] = useState('__all__')

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchRows('crm_activities', clientId, { order: 'performed_at', asc: false, limit: 200 }),
      fetchRows('crm_contacts', clientId, { limit: 1000 }),
      fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }),
    ]).then(([a, c, t]) => {
      if (!alive) return
      setNames(Object.fromEntries(c.map(x => [x.id, x.name])))
      setPeople(t.rows)
      setActs(a)
    })
    return () => { alive = false }
  }, [clientId])

  // Quienes aparecen firmando algo, aunque ya no estén en el equipo.
  const autores = useMemo(() => {
    const m = new Map()
    for (const a of (acts || [])) {
      if (!a.performed_by) continue
      const key = a.performed_by_id || a.performed_by
      if (!m.has(key)) m.set(key, { key, name: a.performed_by, role: a.performed_by_role })
    }
    return [...m.values()].sort((x, y) => x.name.localeCompare(y.name))
  }, [acts])

  const visibles = useMemo(() => (acts || []).filter(a => {
    if (fRol !== '__all__' && (a.performed_by_role || '') !== fRol) return false
    if (fPersona !== '__all__' && (a.performed_by_id || a.performed_by || '') !== fPersona) return false
    return true
  }), [acts, fRol, fPersona])

  const hayFiltro = fRol !== '__all__' || fPersona !== '__all__'
  const sinAutor = useMemo(() => (acts || []).filter(a => !a.performed_by).length, [acts])

  return (
    <Panel
      title={acts ? `Actividad reciente · ${visibles.length}` : 'Actividad reciente'}
      action={autores.length > 0 ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="helm-select" value={fRol} onChange={e => { setFRol(e.target.value); setFPersona('__all__') }}>
            <option value="__all__">Todos los roles</option>
            {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select className="helm-select" value={fPersona} onChange={e => setFPersona(e.target.value)}>
            <option value="__all__">Todo el equipo</option>
            {autores.filter(a => fRol === '__all__' || a.role === fRol)
              .map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
          {hayFiltro && (
            <button className="helm-btn" onClick={() => { setFRol('__all__'); setFPersona('__all__') }}>Limpiar</button>
          )}
        </div>
      ) : null}
    >
      {acts == null ? <Empty>Cargando…</Empty> : visibles.length === 0 ? (
        <Empty>
          {hayFiltro
            ? 'Nada con estos filtros.'
            : 'Sin actividad. Registra interacciones desde la ficha de cada contacto en el CRM.'}
        </Empty>
      ) : (
        <>
          {/* Aviso honesto: lo anterior a este cambio no tiene firma y no se
              puede inventar a posteriori. */}
          {sinAutor > 0 && !hayFiltro && people.length > 0 && (
            <div className="helm-field-hint" style={{ padding: '10px 18px 0' }}>
              {sinAutor} interaccion{sinAutor === 1 ? '' : 'es'} sin firmar: se registraron antes de
              que se pudiera indicar quién las hacía.
            </div>
          )}
          <div className="helm-timeline" style={{ padding: '8px 18px 18px' }}>
            {visibles.map(a => {
              const Icon = ICON[a.type] || StickyNote
              const quien = a.performed_by ? withRole(a.performed_by, a.performed_by_role) : 'Alguien'
              return (
                <div key={a.id} className="helm-tl-item">
                  <span className="helm-tl-ico"><Icon size={14} /></span>
                  <div className="helm-tl-body">
                    <div>
                      <b style={{ textTransform: 'capitalize' }}>{quien}</b>
                      {' '}{VERBO[a.type] || a.type} en{' '}
                      <b>{names[a.contact_id] || 'un contacto'}</b>
                    </div>
                    {(a.description || a.title) && (
                      <div style={{ color: 'var(--text-dim)' }}>{a.description || a.title}</div>
                    )}
                    <small>{fmtDate(a.performed_at)}</small>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
