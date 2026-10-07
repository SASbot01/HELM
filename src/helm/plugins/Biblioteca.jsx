// HELM plugin — Biblioteca: el contexto extra de la IA.
//
// Documentos de la empresa y transcripciones de llamadas. Lo que está marcado
// "en contexto" se inyecta en el system prompt del chat (ver api/chat.js →
// getLibrary), así que la IA puede contestar con hechos del negocio en vez de
// suponer.
//
// Colgar una transcripción de un contacto es lo que permite el uso que pedía el
// informe: preguntarle al chat "¿qué pasó con este cliente?" y que lo sepa.
//
// El texto es lo que ve la IA; el archivo original es solo para consultarlo a
// mano. Un PDF subido no se lee solo: hay que pegar su contenido, y la interfaz
// lo dice en vez de dejar creer que sí.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, FileText, Mic, StickyNote, Search, Eye, EyeOff, Pencil } from 'lucide-react'
import {
  fetchRowsOrError, fetchRows, insertRow, updateRow, deleteRow,
  fmtDate, MISSING_TABLE,
} from '../lib'
import { Panel, Empty, Modal, Field, Input, Textarea, Select, Kpi, FormNote, SearchSelect } from '../ui'
import Adjuntos from '../Adjuntos'
import MigracionPendiente from '../MigracionPendiente'

const KINDS = [
  { key: 'documento', label: 'Documento', icon: FileText, desc: 'Un manual, una oferta, el proceso de onboarding…' },
  { key: 'transcripcion', label: 'Transcripción', icon: Mic, desc: 'Una llamada transcrita, normalmente de un cliente.' },
  { key: 'nota', label: 'Nota', icon: StickyNote, desc: 'Cualquier apunte suelto que dé contexto.' },
]
const kindOf = (k) => KINDS.find(x => x.key === k) || KINDS[0]

const EMPTY = {
  kind: 'documento', title: '', content: '', occurred_on: '',
  contact: { id: null, label: '' }, tags: '', in_context: true, files: [],
}

// Referencia grosera de cuánto contexto ocupa un documento. Cuatro caracteres
// por token es la aproximación habitual y sirve para avisar de un archivo
// desproporcionado antes de que se coma la ventana del modelo.
const tokensAprox = (txt) => Math.round((txt || '').length / 4)

export default function Biblioteca({ clientId }) {
  const [rows, setRows] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [contacts, setContacts] = useState([])
  const [edit, setEdit] = useState(null)
  const [query, setQuery] = useState('')
  const [fKind, setFKind] = useState('__all__')
  const [error, setError] = useState(null)

  const load = () => fetchRowsOrError('helm_library', clientId, { order: 'created_at' })
    .then(({ rows: r, error: e }) => { setRows(r); setFatal(e) })

  useEffect(() => {
    load()
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const nombreDe = (id) => contacts.find(c => c.id === id)?.name || null

  const visibles = useMemo(() => {
    const q = query.toLowerCase().trim()
    // El nombre del contacto se resuelve aquí dentro y no con el helper de
    // fuera: si el memo llama a una función del cuerpo del componente, React
    // no puede memoizarlo y recalcularía en cada tecla.
    const nombre = (id) => contacts.find(c => c.id === id)?.name || ''
    return (rows || []).filter(d => {
      if (fKind !== '__all__' && d.kind !== fKind) return false
      if (!q) return true
      return [d.title, d.content, nombre(d.contact_id)].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [rows, query, fKind, contacts])

  const stats = useMemo(() => {
    const enContexto = (rows || []).filter(d => d.in_context)
    return {
      total: (rows || []).length,
      enContexto: enContexto.length,
      tokens: enContexto.reduce((a, d) => a + tokensAprox(d.content), 0),
    }
  }, [rows])

  async function save(form) {
    const row = {
      client_id: clientId,
      kind: form.kind, title: form.title.trim(), content: form.content.trim(),
      contact_id: form.contact.id,
      occurred_on: form.occurred_on || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      in_context: form.in_context,
      file_url: form.files[0]?.url || '',
      file_name: form.files[0]?.name || '',
      updated_at: new Date().toISOString(),
    }
    if (form.id) {
      const saved = await updateRow('helm_library', form.id, row)
      setRows(rs => rs.map(r => r.id === form.id ? saved : r))
    } else {
      const saved = await insertRow('helm_library', row)
      setRows(rs => [saved, ...(rs || [])])
    }
    setEdit(null)
  }

  async function toggleContexto(d) {
    const next = !d.in_context
    setRows(rs => rs.map(r => r.id === d.id ? { ...r, in_context: next } : r))
    try { await updateRow('helm_library', d.id, { in_context: next }) } catch { load() }
  }

  async function remove(d) {
    if (!window.confirm(`¿Eliminar "${d.title}" de la biblioteca?`)) return
    setError(null)
    try {
      await deleteRow('helm_library', d.id)
      setRows(rs => rs.filter(r => r.id !== d.id))
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Biblioteca" archivo="migrations/helm_operativa.sql" />
  if (fatal) return <FormNote>{fatal}</FormNote>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Documentos" value={stats.total} />
        <Kpi label="En contexto" value={stats.enContexto} accent sub="los que ve el chat" />
        <Kpi label="Tamaño del contexto" value={`~${stats.tokens.toLocaleString('es-ES')}`} sub="tokens aproximados" />
      </div>

      {error && <FormNote>{error}</FormNote>}
      {stats.tokens > 40000 && (
        <FormNote tone="warn">
          La biblioteca en contexto es muy grande (~{stats.tokens.toLocaleString('es-ES')} tokens).
          Quita del contexto lo que no haga falta a diario: si no cabe todo, el modelo
          empieza a ignorar lo del final —incluida la Biblia.
        </FormNote>
      )}

      <Panel
        title="Biblioteca"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="helm-search">
              <Search size={15} />
              <input placeholder="Buscar…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <select className="helm-select" value={fKind} onChange={e => setFKind(e.target.value)}>
              <option value="__all__">Todo</option>
              {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}s</option>)}
            </select>
            <button className="helm-btn primary" onClick={() => setEdit(EMPTY)}><Plus size={15} />Añadir</button>
          </div>
        }
      >
        {rows == null ? <Empty>Cargando…</Empty> : visibles.length === 0 ? (
          <Empty>
            {rows.length === 0
              ? 'Vacía. Pega aquí tus documentos y transcripciones para que el chat conozca tu negocio de verdad.'
              : 'Nada que coincida.'}
          </Empty>
        ) : (
          <div className="helm-svc-grid">
            {visibles.map(d => {
              const k = kindOf(d.kind)
              const Icon = k.icon
              const cliente = nombreDe(d.contact_id)
              return (
                <div key={d.id} className={'helm-svc' + (d.in_context ? '' : ' off')}>
                  <div className="helm-svc-head">
                    <div className="helm-svc-ico"><Icon size={17} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{d.title}</b>
                      <small>
                        {k.label}
                        {cliente ? ` · ${cliente}` : ''}
                        {d.occurred_on ? ` · ${fmtDate(d.occurred_on)}` : ''}
                      </small>
                    </div>
                  </div>

                  <p className="helm-svc-desc">
                    {(d.content || '').slice(0, 180) || 'Sin texto: la IA no puede leer este documento.'}
                    {(d.content || '').length > 180 ? '…' : ''}
                  </p>

                  <div className="helm-svc-meta">
                    <span>~{tokensAprox(d.content).toLocaleString('es-ES')} tokens</span>
                    {Array.isArray(d.tags) && d.tags.map(t => <span key={t} className="helm-tag">{t}</span>)}
                  </div>

                  {d.file_url && (
                    <div className="helm-svc-links">
                      <a className="helm-btn sm" href={d.file_url} target="_blank" rel="noreferrer">
                        <FileText size={13} />{d.file_name || 'Archivo'}
                      </a>
                    </div>
                  )}

                  <div className="helm-svc-foot">
                    <button className="helm-btn sm" onClick={() => toggleContexto(d)}>
                      {d.in_context ? <><Eye size={13} />En contexto</> : <><EyeOff size={13} />Fuera</>}
                    </button>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Pencil size={15} className="helm-x" title="Editar" onClick={() => setEdit(toForm(d))} />
                      <Trash2 size={15} className="helm-x" title="Eliminar" onClick={() => remove(d)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {edit && (
        <DocModal
          inicial={edit} clientId={clientId} contacts={contacts}
          onClose={() => setEdit(null)} onSave={save}
        />
      )}
    </div>
  )
}

const toForm = (d) => ({
  ...EMPTY,
  id: d.id, kind: d.kind, title: d.title || '', content: d.content || '',
  occurred_on: d.occurred_on || '',
  contact: { id: d.contact_id || null, label: '' },
  tags: Array.isArray(d.tags) ? d.tags.join(', ') : '',
  in_context: d.in_context !== false,
  files: d.file_url ? [{ name: d.file_name || 'Archivo', url: d.file_url }] : [],
})

function DocModal({ inicial, clientId, contacts, onClose, onSave }) {
  const [f, setF] = useState(() => {
    // Al editar, el nombre del contacto se resuelve aquí: en la tarjeta no hace
    // falta y cargarlo antes obligaría a esperar a los contactos.
    if (!inicial.contact.id) return inicial
    const c = contacts.find(x => x.id === inicial.contact.id)
    return { ...inicial, contact: { id: inicial.contact.id, label: c?.name || '' } }
  })
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const errores = {}
  if (!f.title.trim()) errores.title = 'Ponle un título'
  if (f.in_context && !f.content.trim()) errores.content = 'Sin texto no hay nada que darle a la IA'
  const ok = Object.keys(errores).length === 0
  const shown = touched ? errores : {}

  const k = kindOf(f.kind)

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setBusy(true)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={f.id ? 'Editar documento' : 'Añadir a la biblioteca'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="helm-form-2">
          <Field label="Tipo" hint={k.desc}>
            <Select value={f.kind} onChange={e => set('kind', e.target.value)}>
              {KINDS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
          <Field label="Título *" error={shown.title}>
            <Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus
              placeholder={f.kind === 'transcripcion' ? 'Llamada de seguimiento — Pepito' : 'Proceso de onboarding'} />
          </Field>
        </div>

        <div className="helm-form-2">
          <Field label="Cliente" hint="Cuélgalo de un contacto para poder preguntarle a la IA por él">
            <SearchSelect
              value={f.contact}
              onChange={c => set('contact', c)}
              placeholder="Buscar en el CRM…"
              allowFree={false}
              emptyText="Nadie con ese nombre"
              options={contacts.map(c => ({
                id: c.id, label: c.name, sub: [c.company, c.email].filter(Boolean).join(' · '),
              }))}
            />
          </Field>
          <Field label="Fecha" hint="Cuándo fue la llamada o se escribió el documento">
            <Input type="date" value={f.occurred_on} onChange={e => set('occurred_on', e.target.value)} />
          </Field>
        </div>

        <Field
          label="Texto *"
          error={shown.content}
          hint="Esto es exactamente lo que leerá la IA. Pega aquí la transcripción o el contenido del documento."
        >
          <Textarea value={f.content} onChange={e => set('content', e.target.value)} rows={10} />
        </Field>
        {f.content.trim() && (
          <div className="helm-field-hint" style={{ marginTop: -8, marginBottom: 14 }}>
            ~{tokensAprox(f.content).toLocaleString('es-ES')} tokens de contexto.
          </div>
        )}

        <Field
          label="Archivo original (opcional)"
          hint="Se guarda para consultarlo a mano. La IA NO lo lee: para eso está el texto de arriba."
        >
          <Adjuntos clientId={clientId} carpeta="biblioteca" value={f.files} onChange={v => set('files', v)} />
        </Field>

        <Field label="Etiquetas" hint="Separadas por comas">
          <Input value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="ventas, objeciones, onboarding" />
        </Field>

        <label className="helm-checkline">
          <input type="checkbox" checked={f.in_context} onChange={e => set('in_context', e.target.checked)} />
          Darle este documento al chat (ocupa contexto)
        </label>

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy}>
            {busy ? 'Guardando…' : f.id ? 'Guardar cambios' : 'Añadir'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
