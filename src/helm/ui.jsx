// HELM — piezas UI reutilizables. Minimalistas.
import { X } from 'lucide-react'

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="helm-tabs">
      {tabs.map(t => (
        <button
          key={t.key}
          className={'helm-tab' + (value === t.key ? ' active' : '')}
          onClick={() => onChange(t.key)}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

export function Drawer({ title, sub, onClose, children, footer }) {
  return (
    <div className="helm-overlay right" onClick={onClose}>
      <div className="helm-drawer" onClick={e => e.stopPropagation()}>
        <div className="helm-modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="helm-drawer-sub">{sub}</div>}
          </div>
          <X size={18} className="helm-x" onClick={onClose} />
        </div>
        <div className="helm-drawer-body">{children}</div>
        {footer && <div className="helm-drawer-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Textarea(props) {
  return <textarea className="helm-input" rows={3} {...props} />
}

export function Select({ children, ...props }) {
  return <select className="helm-input" {...props}>{children}</select>
}

export function Kpi({ label, value, sub, accent }) {
  return (
    <div className="helm-card helm-kpi">
      <div className="lbl">{label}</div>
      <div className={'val' + (accent ? ' accent' : '')}>{value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Panel({ title, action, children }) {
  return (
    <div className="helm-panel">
      {(title || action) && (
        <div className="helm-panel-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="helm-empty">{children}</div>
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="helm-overlay" onClick={onClose}>
      <div className="helm-modal" onClick={e => e.stopPropagation()}>
        <div className="helm-modal-head">
          <h3>{title}</h3>
          <X size={18} className="helm-x" onClick={onClose} />
        </div>
        <div className="helm-modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div className="helm-field">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Input(props) {
  return <input className="helm-input" {...props} />
}
