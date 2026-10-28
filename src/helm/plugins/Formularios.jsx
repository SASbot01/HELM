// HELM plugin — Formularios: constructor + respuestas pegadas al cliente.
//
// La idea del informe: un mismo cliente pasa por varios formularios a lo largo
// del servicio (onboarding, satisfacción mes 1, mes 2, cierre) y todas las
// respuestas quedan adjuntas a su ficha para siempre. Aquí se construyen y se
// consultan; la respuesta se puede registrar a mano o desde el enlace público.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Copy, Check, ClipboardList, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react'
import {
  fetchRowsOrError, fetchRows, insertRow, updateRow, deleteRow,
  slugify, fmtDate, MISSING_TABLE,
} from '../lib'
import { Panel, Empty, Modal, Field, Input, Textarea, Select, Kpi, FormNote, SearchSelect } from '../ui'
import MigracionPendiente from '../MigracionPendiente'
import { CamposRespuesta } from '../formularios/campos'
import { TIPOS, tipoOf, validarRespuestas } from '../formularios/tipos'
import { loadPipelines } from '../crm/pipeline'


// Plantillas de arranque: los cuatro momentos que nombra el informe.
const PLANTILLAS = [
  {
    title: 'Onboarding · análisis inicial',
    fields: [
      { label: '¿Cuál es tu objetivo con este servicio?', type: 'long', required: true },
      { label: '¿Dónde estás ahora mismo?', type: 'long', required: true },
      { label: '¿Qué has probado que no ha funcionado?', type: 'long' },
      { label: '¿Cuánto tiempo semanal puedes dedicarle?', type: 'text' },
    ],
  },
  {
    title: 'Satisfacción · mes 1',
    fields: [
      { label: '¿Cómo valoras el acompañamiento este mes?', type: 'scale', required: true },
      { label: '¿Qué te está funcionando mejor?', type: 'long' },
      { label: '¿Qué cambiarías?', type: 'long' },
    ],
  },
  {
    title: 'Finalización del servicio',
    fields: [
      { label: '¿Has conseguido el objetivo que te marcaste?', type: 'select', options: ['Sí', 'Parcialmente', 'No'], required: true },
      { label: '¿Recomendarías el servicio? (1-10)', type: 'scale', required: true },
      { label: '¿Qué te llevas?', type: 'long' },
    ],
  },
]

const EMPTY_FORM = { title: '', slug: '', description: '', fields: [], active: true, pipeline_id: '', stage_key: '' }
const nuevoCampo = () => ({ key: 'c' + Math.random().toString(36).slice(2, 8), label: '', type: 'text', required: false, options: [] })

export default function Formularios({ clientId }) {
  const [forms, setForms] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [responses, setResponses] = useState([])
  const [contacts, setContacts] = useState([])
  const [edit, setEdit] = useState(null)
  const [responder, setResponder] = useState(null)   // formulario que se está rellenando
  const [viendo, setViendo] = useState(null)         // respuesta abierta
  const [error, setError] = useState(null)

  const load = () => fetchRowsOrError('helm_forms', clientId, { order: 'created_at', asc: true })
    .then(({ rows, error: e }) => { setForms(rows); setFatal(e) })

  useEffect(() => {
    load()
    fetchRowsOrError('helm_form_responses', clientId, { order: 'submitted_at' }).then(({ rows }) => setResponses(rows))
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const nombreDe = (id) => contacts.find(c => c.id === id)?.name || 'Sin cliente'
  const respuestasDe = (formId) => responses.filter(r => r.form_id === formId)

  const stats = useMemo(() => ({
    forms: (forms || []).filter(f => f.active !== false).length,
    responses: responses.length,
    clientes: new Set(responses.map(r => r.contact_id).filter(Boolean)).size,
  }), [forms, responses])

  async function save(form) {
    const row = {
      client_id: clientId,
      title: form.title.trim(),
      slug: form.slug || slugify(form.title),
      description: form.description.trim(),
      fields: form.fields.filter(f => f.label.trim()),
      active: form.active,
      // '' desde el <select> significa "el por defecto": a la base va null.
      pipeline_id: form.pipeline_id || null,
      stage_key: form.stage_key || null,
      updated_at: new Date().toISOString(),
    }
    if (form.id) {
      const saved = await updateRow('helm_forms', form.id, row)
      setForms(fs => fs.map(f => f.id === form.id ? saved : f))
    } else {
      const saved = await insertRow('helm_forms', row)
      setForms(fs => [...(fs || []), saved])
    }
    setEdit(null)
  }

  async function guardarRespuesta({ form, contact, respondent, answers }) {
    const row = await insertRow('helm_form_responses', {
      client_id: clientId, form_id: form.id, contact_id: contact.id,
      respondent: respondent.trim(), answers,
    })
    setResponses(rs => [row, ...rs])
    setResponder(null)
  }

  async function remove(f) {
    const n = respuestasDe(f.id).length
    if (!window.confirm(
      n > 0
        ? `"${f.title}" tiene ${n} respuesta${n === 1 ? '' : 's'}. Al borrarlo se borran también. ¿Seguir?`
        : `¿Eliminar el formulario "${f.title}"?`,
    )) return
    setError(null)
    try {
      await deleteRow('helm_forms', f.id)
      setForms(fs => fs.filter(x => x.id !== f.id))
      setResponses(rs => rs.filter(r => r.form_id !== f.id))
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  async function crearDePlantilla(p) {
    const saved = await insertRow('helm_forms', {
      client_id: clientId, title: p.title, slug: slugify(p.title),
      description: '', active: true,
      fields: p.fields.map(f => ({ ...nuevoCampo(), ...f, options: f.options || [] })),
    })
    setForms(fs => [...(fs || []), saved])
  }

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Formularios" archivo="migrations/helm_operativa.sql" />
  if (fatal) return <FormNote>{fatal}</FormNote>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Formularios" value={stats.forms} />
        <Kpi label="Respuestas" value={stats.responses} accent />
        <Kpi label="Clientes que han respondido" value={stats.clientes} />
      </div>

      {error && <FormNote>{error}</FormNote>}

      <Panel
        title="Formularios"
        action={<button className="helm-btn primary" onClick={() => setEdit({ ...EMPTY_FORM, fields: [nuevoCampo()] })}><Plus size={15} />Nuevo formulario</button>}
      >
        {forms == null ? <Empty>Cargando…</Empty> : forms.length === 0 ? (
          <div style={{ padding: '18px' }}>
            <p className="helm-settings-lead">
              Aún no hay formularios. Empieza por una plantilla de los momentos habituales
              de un servicio, o créalo desde cero.
            </p>
            <div className="helm-pickers">
              {PLANTILLAS.map(p => (
                <button key={p.title} type="button" className="helm-pick" onClick={() => crearDePlantilla(p)}>
                  {p.title}<small>{p.fields.length} preguntas</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="helm-svc-grid">
            {forms.map(f => {
              const rs = respuestasDe(f.id)
              return (
                <div key={f.id} className={'helm-svc' + (f.active === false ? ' off' : '')}>
                  <div className="helm-svc-head">
                    <div className="helm-svc-ico"><ClipboardList size={17} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{f.title}</b>
                      <small>{(f.fields || []).length} preguntas · {rs.length} respuesta{rs.length === 1 ? '' : 's'}</small>
                    </div>
                  </div>
                  {f.description && <p className="helm-svc-desc">{f.description}</p>}

                  <EnlacePublico form={f} />

                  {rs.length > 0 && (
                    <div className="helm-svc-links">
                      {rs.slice(0, 4).map(r => (
                        <button key={r.id} className="helm-btn sm" onClick={() => setViendo({ r, form: f })}>
                          {nombreDe(r.contact_id)} · {fmtDate(r.submitted_at)}
                        </button>
                      ))}
                      {rs.length > 4 && <span className="helm-tag">+{rs.length - 4} más</span>}
                    </div>
                  )}

                  <div className="helm-svc-foot">
                    <button className="helm-btn sm" onClick={() => setResponder(f)}>
                      <Plus size={13} />Registrar respuesta
                    </button>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Pencil size={15} className="helm-x" title="Editar" onClick={() => setEdit(toFormState(f))} />
                      <Trash2 size={15} className="helm-x" title="Eliminar" onClick={() => remove(f)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {edit && <ConstructorModal clientId={clientId} inicial={edit} onClose={() => setEdit(null)} onSave={save} />}
      {responder && (
        <ResponderModal
          form={responder} contacts={contacts}
          onClose={() => setResponder(null)} onSave={guardarRespuesta}
        />
      )}
      {viendo && (
        <RespuestaModal
          respuesta={viendo.r} form={viendo.form} nombre={nombreDe(viendo.r.contact_id)}
          onClose={() => setViendo(null)}
        />
      )}
    </div>
  )
}

const toFormState = (f) => ({
  id: f.id, title: f.title || '', slug: f.slug || '', description: f.description || '',
  fields: (f.fields || []).map(x => ({ ...nuevoCampo(), ...x, options: x.options || [] })),
  active: f.active !== false,
  pipeline_id: f.pipeline_id || '',
  stage_key: f.stage_key || '',
})

// El enlace que se manda al cliente. Va por ID y no por slug: el slug solo es
// único dentro de un perfil, y esta URL es pública para todos.
function EnlacePublico({ form }) {
  const [copiado, setCopiado] = useState(false)
  const url = `${window.location.origin}/f/${form.id}`
  return (
    <div className="helm-copyrow">
      <code>/f/{form.slug}</code>
      <button
        className="helm-btn sm"
        onClick={() => { navigator.clipboard?.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1600) }}
      >
        {copiado ? <Check size={13} /> : <Copy size={13} />}{copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

// ── Constructor ────────────────────────────────────────────────────────────
// ── A qué embudo entra el lead ─────────────────────────────────────────────
// Solo aplica a los leads que ENTRAN por este formulario desde fuera (una
// landing que llama a api/formularios.js). A quien ya está en el CRM no se le
// mueve: si lleva semanas en "propuesta" y vuelve a rellenar algo, devolverlo a
// la casilla de salida borraría el trabajo del comercial.
function Destino({ clientId, f, set }) {
  const [pipelines, setPipelines] = useState(null)

  useEffect(() => { loadPipelines(clientId).then(setPipelines).catch(() => setPipelines([])) }, [clientId])

  const elegido = (pipelines || []).find(p => p.id === f.pipeline_id)
  const etapas = elegido?.stages || []

  return (
    <>
      <div className="helm-drawer-section">A qué embudo entra el lead</div>
      <p className="helm-settings-note" style={{ marginTop: -4 }}>
        Cuando alguien de fuera rellena este formulario y todavía no está en el CRM, su ficha
        se crea aquí. Si no eliges nada, va al embudo por defecto.
      </p>

      <div className="helm-form-2">
        <Field label="Pipeline" hint={pipelines === null ? 'Cargando…' : undefined}>
          <Select
            value={f.pipeline_id || ''}
            onChange={e => { set('pipeline_id', e.target.value); set('stage_key', '') }}
          >
            <option value="">El que esté por defecto</option>
            {(pipelines || []).filter(p => p.id).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Etapa de entrada" hint={!f.pipeline_id ? 'Elige antes un pipeline' : undefined}>
          <Select
            value={f.stage_key || ''}
            disabled={!f.pipeline_id}
            onChange={e => set('stage_key', e.target.value)}
          >
            <option value="">La primera</option>
            {etapas.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
      </div>

      {/* El pipeline virtual (id null) es el que se enseña cuando el perfil no
          ha creado ninguno todavía: no se puede elegir porque no existe en la
          base, así que se dice dónde crearlo en vez de ofrecer una opción muerta. */}
      {pipelines !== null && pipelines.filter(p => p.id).length === 0 && (
        <p className="helm-settings-note">
          Este perfil todavía no tiene pipelines propios. Créalos en <b>CRM → Editar etapas</b> y
          aparecerán aquí.
        </p>
      )}
    </>
  )
}

function ConstructorModal({ clientId, inicial, onClose, onSave }) {
  const [f, setF] = useState(inicial)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const setCampo = (i, patch) => set('fields', f.fields.map((c, j) => j === i ? { ...c, ...patch } : c))
  const mover = (i, d) => {
    const j = i + d
    if (j < 0 || j >= f.fields.length) return
    const next = [...f.fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    set('fields', next)
  }

  const errores = {}
  if (!f.title.trim()) errores.title = 'Ponle un título'
  if (!f.fields.some(c => c.label.trim())) errores.fields = 'Añade al menos una pregunta'
  const ok = Object.keys(errores).length === 0
  const shown = touched ? errores : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setBusy(true)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={f.id ? 'Editar formulario' : 'Nuevo formulario'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <Field label="Título *" error={shown.title}>
          <Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus placeholder="Satisfacción · mes 1" />
        </Field>
        <Field label="Descripción" hint="Se muestra arriba del formulario">
          <Textarea value={f.description} onChange={e => set('description', e.target.value)} rows={2} />
        </Field>

        <div className="helm-drawer-section">Preguntas</div>
        {shown.fields && <FormNote>{shown.fields}</FormNote>}

        {f.fields.map((c, i) => {
          const t = tipoOf(c.type)
          return (
            <div key={c.key} className="helm-stage-edit">
              <div className="helm-stage-edit-row">
                <Input value={c.label} onChange={e => setCampo(i, { label: e.target.value })} placeholder={`Pregunta ${i + 1}`} />
                <select className="helm-input" style={{ maxWidth: 140 }} value={c.type}
                  onChange={e => setCampo(i, { type: e.target.value })}>
                  {TIPOS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <button type="button" className="helm-btn" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp size={14} /></button>
                <button type="button" className="helm-btn" onClick={() => mover(i, 1)} disabled={i === f.fields.length - 1}><ArrowDown size={14} /></button>
                <button type="button" className="helm-btn" onClick={() => set('fields', f.fields.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
              <div className="helm-stage-subs">
                <label className="helm-switch">
                  <input type="checkbox" checked={Boolean(c.required)} onChange={e => setCampo(i, { required: e.target.checked })} />
                  <span>Obligatoria</span>
                </label>
                {t.options && (
                  <Input
                    value={(c.options || []).join(', ')}
                    onChange={e => setCampo(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="Opciones separadas por comas"
                    style={{ maxWidth: 320 }}
                  />
                )}
              </div>
            </div>
          )
        })}

        <button type="button" className="helm-btn" onClick={() => set('fields', [...f.fields, nuevoCampo()])}>
          <Plus size={14} />Añadir pregunta
        </button>

        <Destino clientId={clientId} f={f} set={set} />

        <label className="helm-checkline" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} />
          Activo (acepta respuestas)
        </label>

        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy}>
            {busy ? 'Guardando…' : f.id ? 'Guardar cambios' : 'Crear formulario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Registrar una respuesta a mano ─────────────────────────────────────────
function ResponderModal({ form, contacts, onClose, onSave }) {
  const [contact, setContact] = useState({ id: null, label: '' })
  const [respondent, setRespondent] = useState('')
  const [answers, setAnswers] = useState({})
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setAnswers(a => ({ ...a, [k]: v }))

  const errores = validarRespuestas(form.fields, answers)
  if (!contact.id) errores.__contact = 'Elige a qué cliente pertenece esta respuesta'
  const ok = Object.keys(errores).length === 0
  const shown = touched ? errores : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setBusy(true)
    try { await onSave({ form, contact, respondent, answers }) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={form.title} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        {form.description && <p className="helm-settings-lead">{form.description}</p>}

        <Field label="Cliente *" error={shown.__contact} hint="La respuesta queda adjunta a su ficha para siempre">
          <SearchSelect
            value={contact} onChange={setContact} allowFree={false}
            placeholder="Buscar en el CRM…" emptyText="Nadie con ese nombre"
            options={contacts.map(c => ({
              id: c.id, label: c.name, sub: [c.company, c.email].filter(Boolean).join(' · '),
            }))}
          />
        </Field>
        <Field label="Quién responde" hint="Si no es el propio cliente">
          <Input value={respondent} onChange={e => setRespondent(e.target.value)} />
        </Field>

        <div className="helm-drawer-section">Respuestas</div>
        <CamposRespuesta fields={form.fields || []} answers={answers} set={set} errors={shown} />

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Faltan respuestas obligatorias.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar respuesta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RespuestaModal({ respuesta, form, nombre, onClose }) {
  const fields = form.fields || []
  return (
    <Modal title={`${form.title} · ${nombre}`} onClose={onClose} wide>
      <p className="helm-settings-lead">
        Respondido el {fmtDate(respuesta.submitted_at)}
        {respuesta.respondent ? ` por ${respuesta.respondent}` : ''}.
      </p>
      {fields.map(c => {
        const v = respuesta.answers?.[c.key]
        const texto = Array.isArray(v) ? v.join(', ') : (v === '' || v == null ? '—' : String(v))
        return (
          <div key={c.key} className="helm-kv" style={{ marginBottom: 14 }}>
            <div>{c.label}</div>
            <div>{texto}</div>
          </div>
        )
      })}
      <div className="helm-modal-actions">
        <a className="helm-btn" href={`${window.location.origin}/f/${form.id}`} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />Ver formulario
        </a>
        <button className="helm-btn primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
