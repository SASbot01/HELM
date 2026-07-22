// Toast global — sin dependencias externas.
// Uso:
//   import { toast } from '@/utils/toast'   // helper global
//   toast.success('Guardado')
//   toast.error('Error: ' + err.message)
//   toast.info('Cargando...')
//
// Montar una sola vez en el raíz:
//   <ToastProvider />
//
// Pensado para reemplazar `alert()` en todo el SaaS sin cambiar los call sites
// que ya usan la API legacy (el shim `alert` se puede sobrescribir después).

import { useEffect, useState } from 'react'

let externalPush = null
let nextId = 1

export function pushToast(kind, message, opts = {}) {
  if (!externalPush) {
    // Fallback antes de que el Provider monte: log al menos
    console[kind === 'error' ? 'error' : 'log'](`[toast:${kind}]`, message)
    return
  }
  externalPush({
    id: nextId++,
    kind,
    message: String(message ?? ''),
    ttl: opts.ttl ?? (kind === 'error' ? 6000 : 3500),
  })
}

export function ToastProvider() {
  const [items, setItems] = useState([])

  useEffect(() => {
    externalPush = (t) => {
      setItems(list => [...list, t])
      if (t.ttl > 0) setTimeout(() => setItems(list => list.filter(i => i.id !== t.id)), t.ttl)
    }
    return () => { externalPush = null }
  }, [])

  const dismiss = (id) => setItems(list => list.filter(i => i.id !== id))

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 99999,
        display: 'flex', flexDirection: 'column', gap: 10,
        maxWidth: 'calc(100vw - 40px)',
        pointerEvents: 'none',
      }}
    >
      {items.map(t => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          onClick={() => dismiss(t.id)}
          style={{
            pointerEvents: 'auto',
            cursor: 'pointer',
            minWidth: 280, maxWidth: 420,
            padding: '12px 16px',
            borderRadius: 10,
            background: kindBg(t.kind),
            color: kindFg(t.kind),
            border: `1px solid ${kindBorder(t.kind)}`,
            boxShadow: 'var(--shadow-lg)',
            fontFamily: "'Montserrat', -apple-system, sans-serif",
            fontSize: 14, lineHeight: 1.45,
            display: 'flex', alignItems: 'flex-start', gap: 10,
            animation: 'toastIn 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{kindIcon(t.kind)}</span>
          <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{t.message}</span>
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(12px) scale(0.98)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}

function kindBg(kind) {
  if (kind === 'error') return 'var(--toast-bg-error)'
  if (kind === 'success') return 'var(--toast-bg-success)'
  if (kind === 'warning') return 'var(--toast-bg-warning)'
  return 'var(--toast-bg-info)'
}
function kindFg(kind) {
  if (kind === 'error') return 'var(--toast-text-error)'
  if (kind === 'success') return 'var(--toast-text-success)'
  if (kind === 'warning') return 'var(--toast-text-warning)'
  return 'var(--toast-text-info)'
}
function kindBorder(kind) {
  if (kind === 'error') return 'var(--toast-border-error)'
  if (kind === 'success') return 'var(--toast-border-success)'
  if (kind === 'warning') return 'var(--toast-border-warning)'
  return 'var(--toast-border-info)'
}
function kindIcon(kind) {
  if (kind === 'error') return '⛔'
  if (kind === 'success') return '✅'
  if (kind === 'warning') return '⚠️'
  return 'ℹ️'
}
