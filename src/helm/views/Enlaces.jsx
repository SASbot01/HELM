// HELM — Enlaces: el cajón de URLs del negocio, agrupadas por categoría.
// Landing, checkout, panel de Stripe, Drive, calendario, grupo de WhatsApp…
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ExternalLink, Copy, Check } from 'lucide-react'
import { fetchRows, insertRow, deleteRow } from '../lib'
import { Panel, Empty, Modal, Field, Input } from '../ui'

const CATEGORIAS = ['General', 'Ventas', 'Marketing', 'Contenido', 'Herramientas', 'Clientes']

const EMPTY = { title: '', url: '', category: 'General', notes: '' }

// Acepta que peguen "midominio.com" sin protocolo.
function normalizaUrl(raw) {
  const u = String(raw || '').trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function dominio(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function LinkRow({ link, onDelete }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="helm-link">
      <div className="helm-link-main">
        <a href={link.url} target="_blank" rel="noreferrer">
          {link.title} <ExternalLink size={13} />
        </a>
        <small>{dominio(link.url)}{link.notes ? ` · ${link.notes}` : ''}</small>
      </div>
      <div className="helm-link-actions">
        <button
          className="helm-btn"
          title="Copiar enlace"
          onClick={() => {
            navigator.clipboard?.writeText(link.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <Trash2 size={15} className="helm-x" onClick={() => onDelete(link.id)} />
      </div>
    </div>
  )
}

export default function Enlaces({ clientId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)

  const load = () => fetchRows('helm_links', clientId, { order: 'created_at' }).then(setRows)
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = useMemo(() => {
    const g = {}
    for (const r of rows || []) {
      const k = r.category || 'General'
      ;(g[k] = g[k] || []).push(r)
    }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  async function save(e) {
    e.preventDefault()
    setError(null)
    const url = normalizaUrl(form.url)
    if (!form.title.trim() || !url) return setError('Hacen falta un nombre y una URL')
    try { new URL(url) } catch { return setError('Esa URL no es válida') }

    await insertRow('helm_links', {
      client_id: clientId,
      title: form.title.trim(),
      url,
      category: form.category,
      notes: form.notes.trim() || null,
    })
    setForm(EMPTY); setOpen(false); load()
  }

  async function remove(id) {
    if (!confirm('¿Borrar este enlace?')) return
    await deleteRow('helm_links', id)
    load()
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <Panel
        title="Enlaces del negocio"
        action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo enlace</button>}
      >
        {rows == null ? (
          <Empty>Cargando…</Empty>
        ) : rows.length === 0 ? (
          <Empty>
            Sin enlaces todavía. Guarda aquí lo que abres cada día: la landing, el
            checkout, el panel de Stripe, la carpeta de Drive…
          </Empty>
        ) : (
          <div className="helm-links">
            {grupos.map(([cat, links]) => (
              <div key={cat} className="helm-link-group">
                <div className="helm-link-cat">{cat}</div>
                {links.map(l => <LinkRow key={l.id} link={l} onDelete={remove} />)}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {open && (
        <Modal title="Nuevo enlace" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Field label="Nombre">
              <Input value={form.title} autoFocus placeholder="Checkout asesoría anual"
                onChange={e => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="URL">
              <Input value={form.url} placeholder="buy.stripe.com/…"
                onChange={e => setForm({ ...form, url: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select className="helm-input" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Nota (opcional)">
              <Input value={form.notes} placeholder="Para qué sirve o cuándo se usa"
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
            {error && <div className="helm-formerror">{error}</div>}
            <button type="submit" className="helm-btn primary" style={{ width: '100%', justifyContent: 'center' }}>
              Guardar enlace
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
