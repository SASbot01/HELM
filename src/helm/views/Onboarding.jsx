// HELM — Onboarding. Un solo formulario, el alta, y la carpeta "Biblia".
//
//   Alta        → las 40 preguntas de entrada (onboarding/alta.js). Las puede
//                 rellenar el propio cliente desde un enlace sin cuenta
//                 (/alta/<token> y /alta, pages/AltaHelm.jsx). Al completarla,
//                 la IA sintetiza las respuestas en dos Biblias (empresa +
//                 contenido).
//   Conexiones  → Stripe y lo que venga; no es un formulario.
//
// Los formularios de contenido (F1 + F2) y operativo ya no se ofrecen: el
// usuario dejó el alta como único onboarding (2026-10-15). Sus respuestas
// siguen en helm_onboarding y, si un perfil las tiene, la Biblia se regenera
// con ellas además de con el alta (ver BibliaFolder).
//
// Las Biblias son lo que el chat inyecta en su system prompt. Las respuestas
// crudas se quedan como fuente de verdad en helm_onboarding (autoguardado).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, ArrowLeft, Check, Loader2,
  CheckCircle2, Lock, BookOpen, RefreshCw, Pencil, Copy, Building2, PenLine, Plug,
  UserPlus, Link2, MessageCircle,
} from 'lucide-react'
import { supabase, getOnboarding, saveOnboardingDraft, onboardingApi, enlaceAltaPublicaDelPerfil } from '../lib'
import { ONBOARDING_CONTENIDO, countAnswered, isAnswered, seVe } from '../onboarding/schema'
import { ONBOARDING_ALTA } from '../onboarding/alta'
import { buildDossier } from '../onboarding/knowledge'
import { FieldInput } from '../onboarding/Campos'
import { StripeCard } from './Ajustes'
import { Markdown } from '../md'
import { Tabs, Empty } from '../ui'

// Marca un formulario como completado. El de contenido lo marcaba el servidor
// al generar la Biblia (markCompleted en api/onboarding.js); el alta se marca
// aquí, después de generarla. Devuelve el updated_at que ha escrito. En el
// alta no se pone completed_at:
// ahí es la fecha en que la ENVIÓ el cliente desde su enlace (su página la
// enseña como «Ya lo enviaste el…» y el servidor avisa a la agencia solo si no
// la había), y darla por completada desde aquí no es que él la haya enviado.
async function marcarCompletado(clientId, form) {
  const now = new Date().toISOString()
  const cambios = { status: 'completed', updated_at: now }
  if (form !== 'alta') cambios.completed_at = now
  const { error } = await supabase.from('helm_onboarding')
    .update(cambios)
    .eq('client_id', clientId).eq('form', form)
  if (error) throw error
  return now
}

// Cuándo se guardó por última vez un formulario (null si aún no existe). Lo
// usa el alta antes de guardar: es el único formulario que se escribe desde
// dos sitios (aquí y el enlace del cliente).
async function ultimoGuardado(clientId, form) {
  const { data, error } = await supabase.from('helm_onboarding').select('updated_at')
    .eq('client_id', clientId).eq('form', form).maybeSingle()
  if (error) throw error
  return data?.updated_at || null
}

const PISADO = 'Mientras tenías esto abierto se han guardado cambios en esta alta desde otro sitio (el enlace del cliente u otra pestaña). Para no pisarlos, lo de esta pantalla ya no se guarda: vuelve y ábrela otra vez para ver lo último.'

// El dossier con todo lo respondido: el alta y, en los perfiles que lo
// rellenaron antes, el formulario de contenido. De aquí salen las Biblias,
// tanto al completar el alta como al regenerar desde la carpeta: solo con el
// alta, una Biblia hecha con las 79 preguntas de contenido se cambiaría por
// otra más pobre.
function dossierDeTodo({ alta = {}, contenido = {} } = {}) {
  return [
    countAnswered(ONBOARDING_ALTA, alta).done ? buildDossier(ONBOARDING_ALTA, alta) : '',
    countAnswered(ONBOARDING_CONTENIDO, contenido).done ? buildDossier(ONBOARDING_CONTENIDO, contenido) : '',
  ].filter(Boolean).join('\n\n')
}

// ── Formulario del alta ─────────────────────────────────────────────────────
// Las preguntas del alta y, al final, «Completar y generar la Biblia». `antes`
// se pinta encima de las preguntas; `limites` va a los campos (ver Campos.jsx).
//
// `compartido`: el cliente la rellena a la vez desde su enlace. Cada guardado
// manda el documento entero, así que guardar una copia vieja borraría lo que
// él ha escrito después. Antes de cada guardado se mira si la fila ha cambiado
// desde la última vez que la vimos y, si es así, se deja de guardar y se avisa.

function ContentForm({
  clientId, schema, formKey, initial, onBack, onGenerated, antes = null, limites, compartido = false,
}) {
  const [answers, setAnswers] = useState(initial?.answers || {})
  const [savedAt, setSavedAt] = useState(initial ? 'idle' : null)
  const [gen, setGen] = useState(null)          // null | 'empresa' | 'contenido'
  const [error, setError] = useState(null)
  const [pisado, setPisado] = useState(false)
  const saveTimer = useRef(null)
  const latest = useRef(answers)
  // Hay un cambio esperando al temporizador. Va en una ref y no en el estado
  // porque lo lee la limpieza del desmontaje, que solo ve el primer render.
  const pendiente = useRef(false)
  // Solo con `compartido`: el updated_at de la última versión que conocemos
  // (la que se abrió o la última que guardamos aquí), si alguien más ha
  // guardado encima, y la fila de guardados (uno detrás de otro, para que el
  // nuestro no se confunda con el de otro).
  const conocida = useRef(initial?.updated_at || null)
  const otroGuardo = useRef(false)
  const cola = useRef(Promise.resolve())

  const progress = useMemo(() => countAnswered(schema, answers), [schema, answers])
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  function guardarBorrador(next) {
    if (!compartido) return saveOnboardingDraft(clientId, next, formKey)
    const p = cola.current.then(async () => {
      if (otroGuardo.current || await ultimoGuardado(clientId, formKey) !== conocida.current) {
        otroGuardo.current = true
        setPisado(true)
        throw new Error(PISADO)
      }
      // Sin tocar el estado, como el enlace: si el cliente ya la envió, un
      // retoque del equipo no la devuelve a borrador.
      const fila = await saveOnboardingDraft(clientId, next, formKey, { conservarEstado: true })
      conocida.current = fila?.updated_at || null
    })
    cola.current = p.catch(() => {})
    return p
  }

  function scheduleSave(next) {
    latest.current = next
    if (otroGuardo.current) return
    pendiente.current = true
    setSavedAt('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      pendiente.current = false
      try { await guardarBorrador(latest.current); setSavedAt('saved') }
      catch { setSavedAt('idle') }
    }, 1200)
  }

  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    if (pendiente.current) guardarBorrador(latest.current).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key, val) {
    setAnswers(a => { const next = { ...a, [key]: val }; scheduleSave(next); return next })
  }

  async function submit() {
    setError(null)
    clearTimeout(saveTimer.current)
    pendiente.current = false
    try {
      await guardarBorrador(answers)     // asegura el último trazo
      const contenido = await getOnboarding(clientId, 'contenido').catch(() => null)
      const dossier = dossierDeTodo({ alta: answers, contenido: contenido?.answers || {} })
      if (!dossier.trim()) throw new Error('Responde al menos una pregunta antes de generar la Biblia.')

      // Una Biblia retocada a mano no se sustituye sin preguntar (y el
      // servidor archiva en Archivos la versión editada antes de pisarla).
      const { biblia } = await onboardingApi.biblia(clientId)
      const editadas = Object.values(biblia || {}).filter(b => b?.status === 'edited').map(b => b.title || b.kind)
      if (editadas.length && !window.confirm(
        `${editadas.join(' y ')} ${editadas.length > 1 ? 'están editadas' : 'está editada'} a mano. ` +
        'Si sigues, la IA la vuelve a escribir con estas respuestas; la versión editada queda guardada en Archivos. ¿Seguir?',
      )) return

      setGen('empresa'); await onboardingApi.generate(clientId, 'empresa', dossier, { form: formKey })
      setGen('contenido'); await onboardingApi.generate(clientId, 'contenido', dossier, { form: formKey })
      // Completado solo cuando ya hay Biblia: si la IA falla (sin saldo, caída)
      // el alta sigue abierta y se puede reintentar desde aquí. Lo que escribe
      // pasa a ser la versión conocida; si no, el siguiente guardado creería
      // que la ha cambiado otro y se bloquearía.
      const escrito = await marcarCompletado(clientId, formKey)
      if (compartido) conocida.current = await ultimoGuardado(clientId, formKey).catch(() => escrito)
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
          {savedAt === 'idle' && !pisado && <span>Se guarda solo mientras escribes</span>}
          {pisado && <span>Sin guardar</span>}
        </div>
      </div>

      {pisado && <div className="helm-formerror" role="alert">{PISADO}</div>}

      {antes}

      <div className="helm-onb-progress">
        <div className="helm-onb-progress-bar"><span style={{ '--p': pct / 100 }} /></div>
        <div className="helm-onb-progress-txt">{progress.done}/{progress.total} respondidas · {pct}%</div>
      </div>

      <div className="helm-onb-intro-card">
        <Sparkles size={18} />
        <p>{schema.intro}</p>
      </div>

      {/* Las secciones y campos que no aplican a este negocio no se pintan:
          es la ramificación de los formularios que la tengan. */}
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
              <FieldInput field={field} value={answers[field.key]} onChange={v => setField(field.key, v)} limites={limites} />
            </div>
          ))}
        </section>
      ))}

      {(pisado || error) && <div className="helm-formerror">{pisado ? PISADO : error}</div>}

      <div className="helm-onb-submit">
        <div>
          <b>¿Listo?</b>
          <p>Al completar, la IA sintetiza tus respuestas en tu Biblia de Empresa y tu Biblia de Contenido, y las usará en cada guion, email y respuesta. Podrás editarlas y regenerarlas.</p>
        </div>
        <button className="helm-btn primary" onClick={submit} disabled={!!gen || pisado}>
          {gen ? <><Loader2 size={15} className="helm-spin" /> Generando…</>
            : <><Sparkles size={15} /> Completar y generar la Biblia</>}
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

  // El alta es el onboarding de ahora; el de contenido, el de los perfiles que
  // lo rellenaron antes. Si hay de los dos, la Biblia sale de los dos juntos:
  // regenerar solo con uno tiraría lo que dice el otro.
  useEffect(() => {
    Promise.all([
      onboardingApi.biblia(clientId),
      getOnboarding(clientId, 'alta'),
      getOnboarding(clientId, 'contenido'),
    ])
      .then(([b, alta, contenido]) => {
        setBibs(b.biblia || {})
        setAnswers({ alta: alta?.answers || {}, contenido: contenido?.answers || {} })
      })
      .catch(err => { setBibs({}); setError(err.message) })
  }, [clientId])

  const doc = bibs?.[tab]

  async function regenerate() {
    if (!answers) return
    setBusy('regen'); setError(null)
    try {
      const dossier = dossierDeTodo(answers)
      if (!dossier.trim()) throw new Error('El alta está vacía: no hay nada que sintetizar.')
      const { biblia } = await onboardingApi.generate(clientId, tab, dossier, { form: 'biblia' })
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

// ── Enlace del alta para el cliente ─────────────────────────────────────────
// El alta la puede rellenar el propio cliente sin cuenta: el servidor firma un
// enlace /alta/<token> que vale 30 días (api/onboarding.js, action=enlace). No
// se guarda en ningún sitio: cada vez que se pide uno se firma otro, y los
// anteriores siguen valiendo hasta que caducan.
const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

// Lo que le llega al cliente por WhatsApp: qué es, cuánto lleva y que no hace
// falta hacerlo de una sentada.
const mensajeWhatsApp = (url) =>
  '¡Hola! Para empezar a trabajar en tu negocio necesitamos conocerlo bien. ' +
  'Son 40 preguntas, unos 15 minutos, y se guardan solas: puedes dejarlo a medias ' +
  `y seguir luego con el mismo enlace. ${url}`

function EnlaceCliente({ clientId }) {
  const [enlace, setEnlace] = useState(null)     // { url, caduca }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const campo = useRef(null)
  // El enlace público de la agencia (helm.s4sf.net/alta?a=…), para el negocio
  // que aún no tiene perfil. Solo lo ve la agencia: a un cliente dentro de su
  // propio perfil no le dice nada. Si no se sabe la agencia, no sale: sin su
  // slug, el alta le llegaría a otra.
  const [publica, setPublica] = useState(null)
  const [copiadoPublica, setCopiadoPublica] = useState(false)
  const campoPublica = useRef(null)

  useEffect(() => {
    if (!localStorage.getItem('bw_superadmin')) return
    let vivo = true
    enlaceAltaPublicaDelPerfil(clientId).then(url => { if (vivo) setPublica(url) }).catch(() => {})
    return () => { vivo = false }
  }, [clientId])

  async function crear() {
    setBusy(true); setError(null)
    try { setEnlace(await onboardingApi.enlaceAlta(clientId)) }
    catch (err) { setError(err.message || 'No se pudo crear el enlace') }
    setBusy(false)
  }

  function copiar() {
    // Sin portapapeles (http, navegador antiguo) se deja seleccionado para
    // copiarlo a mano.
    const aMano = () => campo.current?.select()
    if (!navigator.clipboard) return aMano()
    navigator.clipboard.writeText(enlace.url)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })
      .catch(aMano)
  }

  function copiarPublica() {
    // Sin portapapeles, como arriba: queda seleccionado para copiarlo a mano.
    const aMano = () => { if (campoPublica.current) window.getSelection()?.selectAllChildren(campoPublica.current) }
    if (!navigator.clipboard) return aMano()
    navigator.clipboard.writeText(publica)
      .then(() => { setCopiadoPublica(true); setTimeout(() => setCopiadoPublica(false), 1500) })
      .catch(aMano)
  }

  return (
    <VistaEnlaceAlta
      enlace={enlace} busy={busy} error={error} copiado={copiado}
      campo={campo} onCrear={crear} onCopiar={copiar}
      publica={publica} copiadoPublica={copiadoPublica} campoPublica={campoPublica} onCopiarPublica={copiarPublica}
    />
  )
}

// La parte que se ve, sin estado: así se puede comprobar sin navegador.
export function VistaEnlaceAlta({
  enlace, busy, error, copiado, campo, onCrear, onCopiar,
  publica = null, copiadoPublica = false, campoPublica, onCopiarPublica,
}) {
  return (
    <div className="helm-onb-intro-card">
      <Link2 size={18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 14 }}>Enlace para tu cliente</b>
        <p style={{ marginTop: 4 }}>
          Mándaselo y lo rellena él mismo desde el móvil, sin cuenta ni contraseña. Lo que
          escribe se guarda en esta misma alta (vuelve a abrirla para ver lo último), y te
          avisamos cuando la envíe.
        </p>

        {enlace ? (
          <>
            <input
              ref={campo} className="helm-input" readOnly value={enlace.url}
              aria-label="Enlace del alta" onFocus={e => e.target.select()}
              style={{ marginTop: 12 }}
            />
            <div className="helm-drawer-links" style={{ margin: '10px 0 0' }}>
              <button type="button" className="helm-btn sm" onClick={onCopiar}>
                {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
              <a
                className="helm-btn sm" target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp(enlace.url))}`}
              >
                <MessageCircle size={13} /> Enviar por WhatsApp
              </a>
            </div>
            {enlace.caduca && (
              <p className="helm-settings-note" style={{ marginTop: 8 }}>
                Caduca el {fechaLarga(enlace.caduca)}; si se le pasa, crea otro aquí mismo.
              </p>
            )}
          </>
        ) : (
          <button type="button" className="helm-btn primary" style={{ marginTop: 12 }} onClick={onCrear} disabled={busy}>
            {busy ? <Loader2 size={15} className="helm-spin" /> : <Link2 size={15} />} Crear enlace
          </button>
        )}

        {error && <div className="helm-formerror" style={{ margin: '10px 0 0' }}>{error}</div>}

        {/* El negocio que todavía no tiene perfil rellena la misma alta en el
            enlace público; le llega a la agencia en Perfiles → Altas. */}
        {publica && (
          <p className="helm-settings-note" style={{ margin: '14px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px' }}>
            <span>¿Aún no tiene perfil? Mándale <b ref={campoPublica} style={{ overflowWrap: 'anywhere' }}>{publica.replace(/^https?:\/\//, '')}</b></span>
            <button type="button" className="helm-btn sm" onClick={onCopiarPublica}>
              {copiadoPublica ? <Check size={13} /> : <Copy size={13} />} {copiadoPublica ? 'Copiado' : 'Copiar'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

// Los topes del alta, los mismos que la página pública (pages/AltaHelm.jsx) y
// que valida el servidor. Aquí también, porque se escribe en la misma fila: un
// texto más largo metido desde el panel dejaría al cliente sin poder guardar
// nada desde su enlace hasta que lo recortara.
const LIMITES_ALTA = { text: 300, long: 5000, filas: 20 }


// ── Hub ─────────────────────────────────────────────────────────────────────
const CARDS = [
  {
    key: 'alta', icon: UserPlus,
    title: 'Alta en HELM', tagline: ONBOARDING_ALTA.tagline,
    desc: 'El onboarding del negocio: 40 preguntas sobre el negocio, el cliente ideal, la oferta, los números, las redes y los referentes. Lo puede rellenar el propio cliente desde un enlace, sin cuenta. Con las respuestas dentro, «Completar y generar la Biblia» hace que la IA escriba tu Biblia, la que usa en cada guion, email y respuesta.',
  },
  {
    key: 'conexiones', icon: Plug,
    title: 'Conexiones', tagline: 'Enlaza tus herramientas',
    desc: 'Conecta Stripe (y pronto Meta Ads, Calendar, WhatsApp…) para que los pagos, leads y métricas entren solos en HELM.',
  },
]

export default function Onboarding({ clientId }) {
  const [active, setActive] = useState(null)     // null (hub) | 'alta' | 'biblia' | 'conexiones'
  const [docAlta, setDocAlta] = useState(undefined)  // alta en HELM
  const [hayBiblia, setHayBiblia] = useState(null)   // null mientras se mira
  const [justDone, setJustDone] = useState(false)

  // La Biblia se enseña si existe, venga del alta o del contenido de antes.
  const load = () => {
    getOnboarding(clientId, 'alta').then(setDocAlta).catch(() => setDocAlta(null))
    onboardingApi.biblia(clientId)
      .then(b => setHayBiblia(Object.keys(b?.biblia || {}).length > 0))
      .catch(() => setHayBiblia(false))
  }
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // El alta la rellena también el cliente desde su enlace: se relee justo al
  // abrirla, para enseñar lo último que ha escrito y no partir de una copia
  // vieja del hub (ContentForm, con `compartido`, no guarda encima de ella).
  function abrir(key) {
    if (key !== 'alta') return setActive(key)
    getOnboarding(clientId, 'alta').then(setDocAlta, () => {}).finally(() => setActive('alta'))
  }

  if (active === 'alta') {
    return (
      <ContentForm
        clientId={clientId}
        schema={ONBOARDING_ALTA}
        formKey="alta"
        initial={docAlta || null}
        antes={<EnlaceCliente clientId={clientId} />}
        limites={LIMITES_ALTA}
        compartido
        onBack={() => { setActive(null); load() }}
        onGenerated={() => { setJustDone(true); load(); setActive('biblia') }}
      />
    )
  }
  if (active === 'biblia') {
    return <BibliaFolder clientId={clientId} onBack={() => { setActive(null); load() }} />
  }
  if (active === 'conexiones') {
    return <ConexionesFolder clientId={clientId} onBack={() => setActive(null)} />
  }

  // Solo el alta tiene estado; Conexiones, ninguno.
  const estadoDe = (key) => (key === 'alta' ? docAlta?.status : null)
  // La etiqueta del pie. El alta dice si el cliente ya la envió desde su
  // enlace (completed_at, ver marcarCompletado), si la dio por completada el
  // equipo desde aquí y, si no, cuántas lleva: es lo que hace falta saber para
  // decidir si darle un toque.
  const chipDe = (key) => {
    const st = estadoDe(key)
    if (!st) return null
    if (key === 'alta') {
      if (docAlta.completed_at) return { tono: 'green', txt: `Enviado · ${fechaCorta(docAlta.completed_at)}` }
      if (st === 'completed') return { tono: 'green', txt: 'Completado' }
      const { done, total } = countAnswered(ONBOARDING_ALTA, docAlta.answers || {})
      return { tono: 'amber', txt: `${done}/${total} respondidas` }
    }
    return st === 'completed' ? { tono: 'green', txt: 'Completado' } : { tono: 'amber', txt: 'Borrador' }
  }
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

      {hayBiblia && (
        <div className="helm-onb-biblia-cta" onClick={() => setActive('biblia')}>
          <div className="helm-onb-banner-ico"><BookOpen size={20} /></div>
          <div className="helm-onb-banner-txt">
            <b>Biblia de la empresa</b>
            <span>Tu marca y tu contenido sintetizados por la IA. Ábrela para leer, editar o regenerar.</span>
          </div>
          <button className="helm-btn primary">Abrir Biblia</button>
        </div>
      )}

      {/* Un alta que el cliente envió desde su enlace (o que llegó por la
          bandeja de altas) está respondida pero no ha pasado por la IA: sin
          esto nada dice que el chat y los agentes siguen sin Biblia. */}
      {hayBiblia === false && docAlta?.status === 'completed' && (
        <div className="helm-onb-biblia-cta" onClick={() => abrir('alta')}>
          <div className="helm-onb-banner-ico"><Sparkles size={20} /></div>
          <div className="helm-onb-banner-txt">
            <b>Falta generar la Biblia</b>
            <span>El alta ya está respondida. Ábrela, repásala y pulsa «Completar y generar la Biblia» para que la IA escriba con tu marca.</span>
          </div>
          <button className="helm-btn primary">Generar la Biblia</button>
        </div>
      )}

      <div className="helm-onb-cards">
        {CARDS.map(card => {
          const Icon = card.icon
          const chip = chipDe(card.key)
          return (
            <div key={card.key} className="helm-onb-card">
              <div className="helm-onb-card-ico"><Icon size={20} /></div>
              <div className="helm-onb-card-tag">{card.tagline}</div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <div className="helm-onb-card-foot">
                {chip && <span className={'helm-chip ' + chip.tono}>{chip.txt}</span>}
                <button className="helm-btn primary" onClick={() => abrir(card.key)}>
                  {ctaDe(card.key)}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
