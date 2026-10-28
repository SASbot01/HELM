// HELM — el formulario que rellena el cliente, sin entrar al panel.
//
// Página pública: se llega por el enlace que se copia desde el plugin de
// Formularios. Pide el formulario por su id (único de forma global; el slug solo
// lo es dentro de un perfil, así que no serviría en una URL abierta) y manda la
// respuesta a api/formularios.js, el mismo sitio al que mandan las landings de
// fuera: ahí se busca o se crea la ficha y se guarda todo. La página no toca la
// base.
//
// Si el enlace trae ?c=<contact_id>, la respuesta queda pegada a esa ficha del
// CRM. Sin ese parámetro se busca la ficha por el email (o se crea); y sin
// email se guarda igual, con el nombre, y en el panel se puede asignar después:
// es preferible a perder la respuesta.
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { CamposRespuesta } from '../helm/formularios/campos'
import { validarRespuestas } from '../helm/formularios/tipos'
import { Field, Input, FormNote } from '../helm/ui'
import { useHelmTheme } from '../helm/theme'
import { useMarcaEnLaPestana } from '../helm/marcaPestana'
import { Marca } from '../helm/marcaPestana.jsx'
import '../helm/theme.css'

export default function FormularioPublico() {
  const { formId } = useParams()
  const [params] = useSearchParams()
  const [theme] = useHelmTheme()

  const [form, setForm] = useState(null)     // null = cargando, false = no existe
  const [answers, setAnswers] = useState({})
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [touched, setTouched] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState(null)
  const [marca, setMarca] = useState(null)

  const contactId = params.get('c')

  // Para quien rellena esto, la página es de la marca que se lo ha mandado, no
  // de HELM. La pestaña, el icono y la cabecera van con su logo y su nombre.
  useMarcaEnLaPestana(marca)

  useEffect(() => {
    let vivo = true
    fetch(`/api/formularios?id=${encodeURIComponent(formId)}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(d => {
        if (!vivo) return
        if (!d?.form) { setForm(false); return }
        setForm(d.form)
        setMarca(d.marca || null)
      })
    return () => { vivo = false }
  }, [formId])

  const set = (k, v) => setAnswers(a => ({ ...a, [k]: v }))

  const errores = useMemo(() => {
    if (!form) return {}
    const errs = validarRespuestas(form.fields, answers)
    if (!nombre.trim()) errs.__nombre = 'Dinos quién eres'
    if (!acepta) errs.__acepta = 'Marca la casilla para poder enviar'
    return errs
  }, [form, answers, nombre, acepta])

  // Lo que la persona acepta al enviar, con el nombre de quien le manda el
  // formulario. El mismo texto que ve es el que se guarda como prueba.
  const textoConsentimiento = `Acepto que ${marca?.nombre || 'quien me envía este formulario'} trate los datos que escribo aquí para atender mi solicitud.`

  const ok = Object.keys(errores).length === 0
  const shown = touched ? errores : {}

  async function enviar(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setEnviando(true)
    try {
      const r = await fetch('/api/formularios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: form.id,
          contactId: contactId || null,
          nombre: nombre.trim(),
          email: email.trim(),
          respuestas: answers,
          origen: 'Formulario HELM',
          // La prueba del consentimiento: qué casilla marcó y con qué texto. La
          // fecha la pone el servidor.
          consentimiento: { aceptado: true, texto: textoConsentimiento },
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Error')
    } catch (err) {
      setError('No se pudo enviar: ' + err.message); setEnviando(false); return
    }
    setEnviado(true)
  }

  return (
    <div className="helm" data-theme={theme}>
      <div className="helm-public">
        <Marca marca={marca} />
        {form === null ? (
          <div className="helm-empty">Cargando…</div>
        ) : form === false ? (
          <div className="helm-empty-cta">
            <h2>Este formulario no existe</h2>
            <p>Puede que el enlace esté mal copiado o que se haya eliminado.</p>
          </div>
        ) : form.active === false ? (
          <div className="helm-empty-cta">
            <h2>{form.title}</h2>
            <p>Este formulario ya no admite respuestas.</p>
          </div>
        ) : enviado ? (
          <div className="helm-empty-cta">
            <div className="helm-onb-banner-ico" style={{ margin: '0 auto 16px' }}><Check size={22} /></div>
            <h2>¡Gracias!</h2>
            <p>Tu respuesta se ha guardado. Puedes cerrar esta página.</p>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate className="helm-panel" style={{ padding: 24 }}>
            <h1 style={{ fontSize: 22, marginTop: 0 }}>{form.title}</h1>
            {form.description && <p className="helm-settings-lead" style={{ marginBottom: 20 }}>{form.description}</p>}

            <div className="helm-form-2">
              <Field label="Tu nombre *" error={shown.__nombre}>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" autoFocus />
              </Field>
              <Field label="Tu email">
                <Input value={email} onChange={e => setEmail(e.target.value)} type="text" inputMode="email" autoComplete="email" />
              </Field>
            </div>

            <div className="helm-drawer-section">Preguntas</div>
            <CamposRespuesta fields={form.fields || []} answers={answers} set={set} errors={shown} />

            <label className="helm-checkline" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} style={{ flexShrink: 0 }} />
              <span>{textoConsentimiento}</span>
            </label>
            <FormNote>{shown.__acepta}</FormNote>

            <FormNote>{error}</FormNote>
            {touched && Object.keys(errores).some(k => k !== '__acepta') && <FormNote>Faltan respuestas obligatorias.</FormNote>}

            <button type="submit" className="helm-btn primary" disabled={enviando}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              {enviando ? 'Enviando…' : 'Enviar respuestas'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
