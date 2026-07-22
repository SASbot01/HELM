// HELM plugin — Actividad. Timeline global de interacciones (crm_activities) del cliente.
import { useEffect, useState } from 'react'
import { Phone, Mail, Users, MessageSquare, StickyNote } from 'lucide-react'
import { fetchRows, fmtDate } from '../lib'
import { Panel, Empty } from '../ui'

const ICON = { call: Phone, email: Mail, meeting: Users, whatsapp: MessageSquare, note: StickyNote }
const LABEL = { call: 'Llamada', email: 'Email', meeting: 'Reunión', whatsapp: 'WhatsApp', note: 'Nota' }

export default function Actividad({ clientId }) {
  const [acts, setActs] = useState(null)
  const [names, setNames] = useState({})

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchRows('crm_activities', clientId, { order: 'performed_at', asc: false, limit: 200 }),
      fetchRows('crm_contacts', clientId, { limit: 1000 }),
    ]).then(([a, c]) => {
      if (!alive) return
      setNames(Object.fromEntries(c.map(x => [x.id, x.name])))
      setActs(a)
    })
    return () => { alive = false }
  }, [clientId])

  return (
    <Panel title={acts ? `Actividad reciente · ${acts.length}` : 'Actividad reciente'}>
      {acts == null ? <Empty>Cargando…</Empty> : acts.length === 0 ? (
        <Empty>Sin actividad. Registra interacciones desde la ficha de cada contacto en el CRM.</Empty>
      ) : (
        <div className="helm-timeline" style={{ padding: '8px 18px 18px' }}>
          {acts.map(a => {
            const Icon = ICON[a.type] || StickyNote
            return (
              <div key={a.id} className="helm-tl-item">
                <span className="helm-tl-ico"><Icon size={14} /></span>
                <div className="helm-tl-body">
                  <div><b>{names[a.contact_id] || 'Contacto'}</b> · {LABEL[a.type] || a.type}</div>
                  {(a.description || a.title) && <div style={{ color: 'var(--text-dim)' }}>{a.description || a.title}</div>}
                  <small>{fmtDate(a.performed_at)}</small>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
