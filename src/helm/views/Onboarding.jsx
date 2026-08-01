// HELM — Onboarding. Hub con los onboardings del perfil, el formulario de
// contenido y la carpeta "Biblia".
//
//   1) Contenido  → formulario largo (F1 + F2). Al completarlo, la IA sintetiza
//                   las respuestas en dos Biblias (empresa + contenido).
//   2) Migración  → preparado, aún no disponible.
//   3) Tercero    → futuro.
//
// Las Biblias son lo que el chat inyecta en su system prompt. Las respuestas
// crudas se quedan como fuente de verdad en helm_onboarding (autoguardado).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, Database, Rocket, ArrowLeft, Check, Loader2, Plus, Trash2,
  CheckCircle2, Lock, BookOpen, RefreshCw, Pencil, Copy, Building2, PenLine, Plug,
  ClipboardList,
} from 'lucide-react'
import { getOnboarding, saveOnboardingDraft, onboardingApi } from '../lib'
import { ONBOARDING_CONTENIDO, countAnswered, isAnswered, seVe } from '../onboarding/schema'
import { ONBOARDING_OPERATIVO } from '../onboarding/operativo'
import { buildDossier } from '../onboarding/knowledge'
import { StripeCard } from './Ajustes'
import { Markdown } from '../md'
import { Tabs, Empty } from '../ui'

// ── Inputs por tipo de campo ────────────────────────────────────────────────
function ScaleInput({ field, value, onChange }) {
  return (
    <div className="helm-onb-scale">
      <div className="helm-onb-scale-row">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n} type="button"
            className={'helm-onb-scale-n' + (Number(value) === n ? ' on' : '')}
            onClick={() => onChange(Number(value) === n ? '' : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="helm-onb-scale-ends">
        <span>{field.minLabel || '1'}</span>
        <span>{field.maxLabel || '10'}</span>
      </div>
    </div>
  )
}

function OptionRow({ options, value, onChange, single, max }) {
  const selected = single ? (value ? [value] : []) : (value || [])
  function toggle(opt) {
    if (single) return onChange(value === opt ? '' : opt)
    const has = selected.includes(opt)
    if (has) return onChange(selected.filter(x => x !== opt))
    if (max && selected.length >= max) return
    onChange([...selected, opt])
  }
  return (
    <div className="helm-onb-opts">
      {options.map(opt => (
        <button
          key={opt} type="button"
          className={'helm-onb-opt' + (selected.includes(opt) ? ' on' : '')}
          onClick={() => toggle(opt)}
        >
          {selected.includes(opt) && <Check size={13} />}
          {opt}
        </button>
      ))}
    </div>
  )
}

function TableInput({ field, value, onChange }) {
  const rows = value && value.length ? value : [{}]
  const set = (i, colKey, v) => onChange(rows.map((r, ri) => (ri === i ? { ...r, [colKey]: v } : r)))
  const addRow = () => onChange([...rows, {}])
  const delRow = (i) => { const next = rows.filter((_, ri) => ri !== i); onChange(next.length ? next : [{}]) }
  return (
    <div className="helm-onb-table">
      {rows.map((row, i) => (
        <div key={i} className="helm-onb-trow">
          <div className="helm-onb-tcells">
            {field.columns.map(col => (
              <input
                key={col.key} className="helm-input" placeholder={col.label}
                value={row[col.key] || ''} onChange={e => set(i, col.key, e.target.value)}
              />
            ))}
          </div>
          {rows.length > 1 && (
            <button type="button" className="helm-onb-trow-del" onClick={() => delRow(i)} title="Quitar fila">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="helm-btn helm-onb-addrow" onClick={addRow}>
        <Plus size={14} /> {field.addLabel || 'Añadir fila'}
      </button>
    </div>
  )
}

function FieldInput({ field, value, onChange }) {
  switch (field.type) {
    case 'text':
      return <input className="helm-input" value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'scale':
      return <ScaleInput field={field} value={value} onChange={onChange} />
    case 'axis':
      return <OptionRow options={field.options} value={value} onChange={onChange} single />
    case 'multi':
      return <OptionRow options={field.options} value={value} onChange={onChange} max={field.max} />
    case 'table':
      return <TableInput field={field} value={value} onChange={onChange} />
    default:
      return <textarea className="helm-input helm-onb-area" rows={field.rows || 4} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}

// ── Formulario de contenido ─────────────────────────────────────────────────
// Formulario genérico de onboarding. Sirve para cualquier esquema: el de
// contenido (que al terminar genera la Biblia) y el operativo (que no genera
// nada, solo guarda). Lo que cambia lo dicen `schema` y `genera`.
function ContentForm({ clientId, schema = ONBOARDING_CONTENIDO, formKey = 'contenido', genera = true, initial, onBack, onGenerated }) {
  const [answers, setAnswers] = useState(initial?.answers || {})
  const [savedAt, setSavedAt] = useState(initial ? 'idle' : null)
  const [gen, setGen] = useState(null)          // null | 'empresa' | 'contenido'
  const [error, setError] = useState(null)
  const saveTimer = useRef(null)
  const latest = useRef(answers)

  const progress = useMemo(() => countAnswered(schema, answers), [schema, answers])
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  function scheduleSave(next) {
    latest.current = next
    setSavedAt('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try { await saveOnboardingDraft(clientId, latest.current, formKey); setSavedAt('saved') }
      catch { setSavedAt('idle') }
    }, 1200)
  }

  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    if (savedAt === 'saving') saveOnboardingDraft(clientId, latest.current, formKey).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key, val) {
    setAnswers(a => { const next = { ...a, [key]: val }; scheduleSave(next); return next })
  }

  async function submit() {
    setError(null)
    clearTimeout(saveTimer.current)
    try {
      await saveOnboardingDraft(clientId, answers, formKey)     // asegura el último trazo
      // El operativo no genera Biblia: es material de auditoría, no la voz de
      // la marca. Se guarda y se acabó.
      if (!genera) return onGenerated()
      const dossier = buildDossier(schema, answers)
      setGen('empresa'); await onboardingApi.generate(clientId, 'empresa', dossier)
      setGen('contenido'); await onboardingApi.generate(clientId, 'contenido', dossier)
      onGenerated()
    } catch (err) {
      setError(err.message || 'No se pudo generar la Biblia')
      setGen(null)
    }
  }

  return (
    <div className="helm-onb-form">
      {gen && (
        <div className="helm-onb-gen">
          <div className="helm-onb-gen-card">
            <Loader2 size={26} className="helm-spin" />
            <b>Generando la Biblia de {gen === 'empresa' ? 'Empresa' : 'Contenido'}…</b>
            <p>La IA está sintetizando tus respuestas. Puede tardar hasta un minuto por documento — no cierres esta pantalla.</p>
          </div>
        </div>
      )}

      <div className="helm-onb-formhead">
        <button className="helm-btn" onClick={onBack}><ArrowLeft size={15} /> Volver</button>
        <div className="helm-onb-save">
          {savedAt === 'saving' && <><Loader2 size={13} className="helm-spin" /> Guardando…</>}
          {savedAt === 'saved' && <><Check size={13} /> Guardado</>}
          {savedAt === 'idle' && <span>Se guarda solo mientras escribes</span>}
        </div>
      </div>

      <div className="helm-onb-progress">
        <div className="helm-onb-progress-bar"><span style={{ width: pct + '%' }} /></div>
        <div className="helm-onb-progress-txt">{progress.done}/{progress.total} respondidas · {pct}%</div>
      </div>

      <div className="helm-onb-intro-card">
        <Sparkles size={18} />
        <p>{schema.intro}</p>
      </div>

      {/* Las secciones y campos que no aplican a este negocio no se pintan:
          es la ramificación del formulario operativo. */}
      {schema.sections.filter(sec => seVe(sec, answers)).map(section => (
        <section key={section.key} className="helm-onb-section">
          <div className="helm-onb-section-head">
            <span className="helm-onb-part">{section.part}</span>
            <h3>{section.title}</h3>
            {section.desc && <p>{section.desc}</p>}
          </div>
          {section.fields.filter(f => seVe(f, answers)).map(field => (
            <div key={field.key} className={'helm-onb-q' + (isAnswered(field, answers[field.key]) ? ' done' : '')}>
              <label>
                {field.label}
                {/* Las que ya se respondieron en el diagnóstico web solo hay
                    que confirmarlas: decirlo evita la sensación de repetir. */}
                {field.web && <span className="helm-onb-web">ya respondida</span>}
              </label>
              {field.hint && <p className="helm-onb-hint">{field.hint}</p>}
              <FieldInput field={field} value={answers[field.key]} onChange={v => setField(field.key, v)} />
            </div>
          ))}
        </section>
      ))}

      {error && <div className="helm-formerror">{error}</div>}

      <div className="helm-onb-submit">
        <div>
          <b>¿Listo?</b>
          <p>{genera
            ? 'Al completar, la IA sintetiza tus respuestas en tu Biblia de Empresa y tu Biblia de Contenido, y las usará en cada guion, email y respuesta. Podrás editarlas y regenerarlas.'
            : 'Se guarda tal cual. Estas respuestas son el material de la auditoría: con ellas se decide qué eliminar, qué rediseñar, qué automatizar y qué delegar.'}</p>
        </div>
        <button className="helm-btn primary" onClick={submit} disabled={!!gen}>
          {gen ? <><Loader2 size={15} className="helm-spin" /> Generando…</>
            : genera ? <><Sparkles size={15} /> Completar y generar la Biblia</>
            : <><Check size={15} /> Marcar como completado</>}
        </button>
      </div>
    </div>
  )
}

// ── Carpeta Biblia (lector + editor + regenerar) ─────────────────────────────
const BIBLIA_TABS = [
  { key: 'empresa', label: 'Empresa', icon: <Building2 size={15} /> },
  { key: 'contenido', label: 'Contenido', icon: <PenLine size={15} /> },
]

function BibliaFolder({ clientId, onBack }) {
  const [bibs, setBibs] = useState(null)     // { empresa?, contenido? }
  const [answers, setAnswers] = useState(null)
  const [tab, setTab] = useState('empresa')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(null)     // null | 'regen' | 'save'
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all([onboardingApi.biblia(clientId), getOnboarding(clientId, 'contenido')])
      .then(([b, o]) => { setBibs(b.biblia || {}); setAnswers(o?.answers || {}) })
      .catch(err => { setBibs({}); setError(err.message) })
  }, [clientId])

  const doc = bibs?.[tab]

  async function regenerate() {
    if (!answers) return
    setBusy('regen'); setError(null)
    try {
      const dossier = buildDossier(ONBOARDING_CONTENIDO, answers)
      const { biblia } = await onboardingApi.generate(clientId, tab, dossier)
      setBibs(b => ({ ...b, [tab]: biblia })); setEditing(false)
    } catch (err) { setError(err.message) }
    setBusy(null)
  }

  async function save() {
    setBusy('save'); setError(null)
    try {
      const { biblia } = await onboardingApi.saveBiblia(clientId, tab, draft)
      setBibs(b => ({ ...b, [tab]: biblia })); setEditing(false)
    } catch (err) { setError(err.message) }
    setBusy(null)
  }

  function copy() {
    if (!doc) return
    navigator.clipboard?.writeText(doc.content).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="helm-biblia">
      <div className="helm-onb-formhead">
        <button className="helm-btn" onClick={onBack}><ArrowLeft size={15} /> Volver</button>
        <Tabs tabs={BIBLIA_TABS} value={tab} onChange={k => { setTab(k); setEditing(false) }} />
      </div>

      {bibs === null ? (
        <Empty>Cargando la Biblia…</Empty>
      ) : !doc ? (
        <div className="helm-onb-intro-card">
          <BookOpen size={18} />
          <div>
            <p>Esta Biblia aún no está generada.</p>
            <button className="helm-btn primary" style={{ marginTop: 10 }} onClick={regenerate} disabled={busy === 'regen' || !answers}>
              {busy === 'regen' ? <><Loader2 size={15} className="helm-spin" /> Generando…</> : <><Sparkles size={15} /> Generar ahora</>}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="helm-biblia-bar">
            <span className={'helm-chip ' + (doc.status === 'edited' ? 'cyan' : 'green')}>
              {doc.status === 'edited' ? 'Editada a mano' : 'Generada por IA'}
            </span>
            <div className="helm-biblia-actions">
              <button className="helm-btn" onClick={copy}><Copy size={14} /> {copied ? 'Copiado' : 'Copiar'}</button>
              {editing ? (
                <>
                  <button className="helm-btn" onClick={() => setEditing(false)}>Cancelar</button>
                  <button className="helm-btn primary" onClick={save} disabled={busy === 'save'}>
                    {busy === 'save' ? <Loader2 size={14} className="helm-spin" /> : <Check size={14} />} Guardar
                  </button>
                </>
              ) : (
                <>
                  <button className="helm-btn" onClick={() => { setDraft(doc.content); setEditing(true) }}><Pencil size={14} /> Editar</button>
                  <button className="helm-btn" onClick={regenerate} disabled={busy === 'regen'}>
                    {busy === 'regen' ? <Loader2 size={14} className="helm-spin" /> : <RefreshCw size={14} />} Regenerar
                  </button>
                </>
              )}
            </div>
          </div>

          {error && <div className="helm-formerror">{error}</div>}

          {editing ? (
            <textarea className="helm-input helm-biblia-editor" value={draft} onChange={e => setDraft(e.target.value)} />
          ) : (
            <div className="helm-biblia-doc"><Markdown text={doc.content} /></div>
          )}
        </>
      )}
    </div>
  )
}

// ── Conexiones (guía para enlazar Stripe y futuras integraciones) ────────────
const FUTURE_CONNECTIONS = [
  { name: 'Meta Ads', desc: 'Gasto y resultados de tus campañas, directos al Informe.' },
  { name: 'Google Calendar', desc: 'Sincroniza llamadas y reuniones con el CRM.' },
  { name: 'WhatsApp', desc: 'Conecta conversaciones al CRM y responde desde HELM.' },
  { name: 'Google Sheets', desc: 'Importa y exporta datos a tus hojas de cálculo.' },
]

function ConexionesFolder({ clientId, onBack }) {
  return (
    <div className="helm-biblia">
      <div className="helm-onb-formhead">
        <button className="helm-btn" onClick={onBack}><ArrowLeft size={15} /> Volver</button>
      </div>

      <div className="helm-onb-intro-card">
        <Plug size={18} />
        <p>
          Conecta tus herramientas para que HELM trabaje solo: cada pago, lead y métrica entra
          sin que muevas un dedo. Empezamos por Stripe — iremos añadiendo el resto.
        </p>
      </div>

      <StripeCard clientId={clientId} />

      <div className="helm-onb-section">
        <div className="helm-onb-section-head">
          <span className="helm-onb-part">Próximas conexiones</span>
          <h3>Más integraciones en camino</h3>
          <p>Las iremos activando aquí mismo según las vayamos añadiendo.</p>
        </div>
        {FUTURE_CONNECTIONS.map(c => (
          <div key={c.name} className="helm-conx-row">
            <div className="helm-conx-info">
              <b>{c.name}</b>
              <span>{c.desc}</span>
            </div>
            <span className="helm-onb-soon"><Lock size={13} /> Próximamente</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hub ─────────────────────────────────────────────────────────────────────
const CARDS = [
  {
    key: 'contenido', icon: Sparkles, available: true,
    title: 'Contenido', tagline: ONBOARDING_CONTENIDO.tagline,
    desc: 'El formulario de marca y negocio. Cuéntale a la IA quién eres, tu tono, tu oferta, tu cliente y tu mina de contenido. Al terminar, sintetiza tu Biblia.',
  },
  {
    key: 'operativo', icon: ClipboardList, available: true,
    title: 'Operativo profundo', tagline: ONBOARDING_OPERATIVO.tagline,
    desc: 'La radiografía de tu operativa: captación, venta, entrega, cobros, soporte, datos y equipo. Unas 100 preguntas — el resto se descartan solas según lo que vendas. Es el material con el que se decide qué automatizar.',
  },
  {
    key: 'conexiones', icon: Plug, available: true,
    title: 'Conexiones', tagline: 'Enlaza tus herramientas',
    desc: 'Conecta Stripe (y pronto Meta Ads, Calendar, WhatsApp…) para que los pagos, leads y métricas entren solos en HELM.',
  },
  {
    key: 'migracion', icon: Database, available: false,
    title: 'Migración de tu sistema', tagline: 'Trae tu sistema antiguo',
    desc: 'Importa tus bases de datos al CRM, tus informes y tu facturación, para empezar con todo tu histórico dentro de HELM. (Próximamente.)',
  },
  {
    key: 'tercero', icon: Rocket, available: false,
    title: 'Próximo onboarding', tagline: 'En camino',
    desc: 'Un tercer onboarding que añadiremos más adelante.',
  },
]

export default function Onboarding({ clientId }) {
  const [active, setActive] = useState(null)     // null (hub) | 'contenido' | 'operativo' | 'biblia'
  const [doc, setDoc] = useState(undefined)      // onboarding de contenido
  const [docOp, setDocOp] = useState(undefined)  // onboarding operativo
  const [justDone, setJustDone] = useState(false)

  const load = () => {
    getOnboarding(clientId, 'contenido').then(setDoc).catch(() => setDoc(null))
    getOnboarding(clientId, 'operativo').then(setDocOp).catch(() => setDocOp(null))
  }
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (active === 'contenido') {
    return (
      <ContentForm
        clientId={clientId}
        initial={doc || null}
        onBack={() => { setActive(null); load() }}
        onGenerated={() => { setJustDone(true); load(); setActive('biblia') }}
      />
    )
  }
  if (active === 'operativo') {
    return (
      <ContentForm
        clientId={clientId}
        schema={ONBOARDING_OPERATIVO}
        formKey="operativo"
        genera={false}
        initial={docOp || null}
        onBack={() => { setActive(null); load() }}
        onGenerated={() => { setActive(null); load() }}
      />
    )
  }
  if (active === 'biblia') {
    return <BibliaFolder clientId={clientId} onBack={() => { setActive(null); load() }} />
  }
  if (active === 'conexiones') {
    return <ConexionesFolder clientId={clientId} onBack={() => setActive(null)} />
  }

  const status = doc?.status
  const completed = status === 'completed'
  // Cada tarjeta con formulario enseña su propio estado; las demás, ninguno.
  const estadoDe = (key) => (key === 'contenido' ? status : key === 'operativo' ? docOp?.status : null)
  const ctaDe = (key) => {
    const st = estadoDe(key)
    if (st === 'completed') return 'Revisar / editar'
    if (st === 'draft') return 'Continuar'
    return key === 'conexiones' ? 'Conectar' : 'Empezar'
  }

  return (
    <div className="helm-onb-hub">
      {justDone && (
        <div className="helm-onb-toast">
          <CheckCircle2 size={18} />
          <div><b>Biblia generada.</b> El chat ya escribe con tu marca. Puedes leerla y editarla abajo.</div>
        </div>
      )}

      {completed && (
        <div className="helm-onb-biblia-cta" onClick={() => setActive('biblia')}>
          <div className="helm-onb-banner-ico"><BookOpen size={20} /></div>
          <div className="helm-onb-banner-txt">
            <b>Biblia de la empresa</b>
            <span>Tu marca y tu contenido sintetizados por la IA. Ábrela para leer, editar o regenerar.</span>
          </div>
          <button className="helm-btn primary">Abrir Biblia</button>
        </div>
      )}

      <div className="helm-onb-cards">
        {CARDS.map(card => {
          const Icon = card.icon
          return (
            <div key={card.key} className={'helm-onb-card' + (card.available ? '' : ' soon')}>
              <div className="helm-onb-card-ico"><Icon size={20} /></div>
              <div className="helm-onb-card-tag">{card.tagline}</div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <div className="helm-onb-card-foot">
                {estadoDe(card.key) && (
                  <span className={'helm-chip ' + (estadoDe(card.key) === 'completed' ? 'green' : 'amber')}>
                    {estadoDe(card.key) === 'completed' ? 'Completado' : 'Borrador'}
                  </span>
                )}
                {card.available ? (
                  <button className="helm-btn primary" onClick={() => setActive(card.key)}>
                    {ctaDe(card.key)}
                  </button>
                ) : (
                  <span className="helm-onb-soon"><Lock size={13} /> Próximamente</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
