// HELM — piezas UI reutilizables. Minimalistas.
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

// Escape cierra la capa flotante y, mientras está abierta, el fondo no scrollea.
// Lo usan Modal y Drawer: si no, con un formulario largo el ratón acaba
// moviendo la página de detrás en vez del propio formulario.
function useOverlay(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
}

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
  useOverlay(onClose)
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

export function Modal({ title, onClose, children, wide }) {
  useOverlay(onClose)
  return (
    <div className="helm-overlay" onClick={onClose}>
      <div className={'helm-modal' + (wide ? ' wide' : '')} onClick={e => e.stopPropagation()}>
        <div className="helm-modal-head">
          <h3>{title}</h3>
          <X size={18} className="helm-x" onClick={onClose} />
        </div>
        <div className="helm-modal-body">{children}</div>
      </div>
    </div>
  )
}

// `error` pinta el campo en rojo y escribe el motivo debajo; `hint` es la
// ayuda gris que solo se ve cuando no hay error (si no, compiten por el sitio).
export function Field({ label, children, error, hint }) {
  return (
    <div className={'helm-field' + (error ? ' invalid' : '')}>
      {label && <label>{label}</label>}
      {children}
      {error ? <small className="helm-field-err">{error}</small>
        : hint ? <small className="helm-field-hint">{hint}</small> : null}
    </div>
  )
}

export function Input(props) {
  return <input className="helm-input" {...props} />
}

// Importe en euros. Los `type="number"` nativos aceptan "e", "+" y "-" y dejan
// meter negativos con la rueda del ratón; aquí se bloquean y se fija el paso.
export function MoneyInput({ value, onChange, ...props }) {
  return (
    <input
      className="helm-input" type="number" inputMode="decimal" min="0" step="0.01"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
      onWheel={e => e.currentTarget.blur()}
      {...props}
    />
  )
}

// Contador entero (llamadas, citas, cierres…). Mismas protecciones, sin decimales.
export function CountInput({ value, onChange, ...props }) {
  return (
    <input
      className="helm-input" type="number" inputMode="numeric" min="0" step="1"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault() }}
      onWheel={e => e.currentTarget.blur()}
      {...props}
    />
  )
}

// Buscador con desplegable. Lo usan el enlace venta↔contacto del pipeline y la
// selección de personas del equipo.
//
// Un <select> no sirve cuando la lista puede tener cientos de contactos, y un
// <datalist> tampoco: no deja distinguir dos personas con el mismo nombre ni
// enseñar una segunda línea (empresa, rol). Aquí cada opción lleva su id, así
// lo que se guarda es la relación y no una cadena de texto.
//
// `allowFree` permite escribir algo que no está en la lista (una venta a
// alguien que aún no está en el CRM) sin bloquear el formulario.
export function SearchSelect({
  value, onChange, options, placeholder, allowFree = true, emptyText = 'Sin resultados',
}) {
  const label = value?.label || ''
  const [q, setQ] = useState(label)
  const [prevLabel, setPrevLabel] = useState(label)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  // El texto se resincroniza cuando la selección cambia desde fuera (p. ej. al
  // elegir un servicio que rellena el cliente). Se ajusta durante el render y
  // no en un efecto: así no hay un fotograma con el texto viejo.
  if (label !== prevLabel) {
    setPrevLabel(label)
    setQ(label)
  }

  // Un clic fuera cierra la lista. Con onBlur se cerraría antes de que el clic
  // en una opción llegase a registrarse.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const needle = q.trim().toLowerCase()
  const matches = needle
    ? options.filter(o => (o.label + ' ' + (o.sub || '')).toLowerCase().includes(needle))
    : options

  function pick(o) {
    onChange(o)
    setQ(o.label)
    setOpen(false)
  }

  return (
    <div className="helm-combo" ref={boxRef}>
      <input
        className="helm-input"
        value={q}
        placeholder={placeholder}
        onChange={e => {
          setQ(e.target.value)
          setOpen(true)
          // Escribir a mano rompe el vínculo con la ficha: pasa a ser texto
          // libre hasta que se elija una opción de la lista.
          if (allowFree) onChange({ id: null, label: e.target.value })
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="helm-combo-list">
          {matches.length === 0 ? (
            <div className="helm-combo-empty">{emptyText}</div>
          ) : matches.slice(0, 50).map(o => (
            <button key={o.id} type="button" className="helm-combo-opt" onClick={() => pick(o)}>
              <b>{o.label}</b>
              {o.sub && <small>{o.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Aviso dentro de un formulario. `tone`: 'error' (rojo) o 'warn' (ámbar).
export function FormNote({ tone = 'error', children }) {
  if (!children) return null
  return <div className={'helm-formnote ' + tone}>{children}</div>
}
