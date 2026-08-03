// HELM — el formulario que rellena el cliente, sin entrar al panel.
//
// Página pública: se llega por el enlace que se copia desde el plugin de
// Formularios. Lee el formulario por su id (único de forma global; el slug solo
// lo es dentro de un perfil, así que no serviría en una URL abierta) y guarda
// la respuesta en helm_form_responses.
//
// Si el enlace trae ?c=<contact_id>, la respuesta queda pegada a esa ficha del
// CRM. Sin ese parámetro se guarda igual, identificada por nombre y email, y en
// el panel se puede asignar después: es preferible a perder la respuesta.
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { CamposRespuesta } from '../helm/formularios/campos'
import { validarRespuestas } from '../helm/formularios/tipos'
import { Field, Input, FormNote } from '../helm/ui'
import { useHelmTheme } from '../helm/theme'
import { useMarcaEnLaPestana, Marca } from '../helm/marcaPestana'
import '../helm/theme.css'

export default function FormularioPublico() {
  const { formId } = useParams()
  const [params] = useSearchParams()
  const [theme] = useHelmTheme()

  const [form, setForm] = useState(null)     // null = cargando, false = no existe
  const [answers, setAnswers] = useState({})
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
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
    supabase.from('helm_forms')
      .select('id, client_id, title, description, fields, active')
      .eq('id', formId).maybeSingle()
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e || !data) { setForm(false); return }
        setForm(data)
        // La marca va en una segunda consulta y no en un join: si el perfil no
        // se pudiera leer, el formulario tiene que salir igual — sin logo, pero
        // funcionando.
        supabase.from('clients')
          .select('name, brand_name, brand_subtitle, logo_url')
          .eq('id', data.client_id).maybeSingle()
          .then(({ data: c }) => {
            if (!vivo || !c) return
            setMarca({
              nombre: c.brand_name || c.name,
              subtitulo: c.brand_subtitle || null,
              logo: c.logo_url || null,
            })
          })
      })
    return () => { vivo = false }
  }, [formId])

  const set = (k, v) => setAnswers(a => ({ ...a, [k]: v }))

  const errores = useMemo(() => {
    if (!form) return {}
    const errs = validarRespuestas(form.fields, answers)
    if (!nombre.trim()) errs.__nombre = 'Dinos quién eres'
    return errs
  }, [form, answers, nombre])

  const ok = Object.keys(errores).length === 0
  const shown = touched ? errores : {}

  async function enviar(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setEnviando(true)
    const { error: err } = await supabase.from('helm_form_responses').insert({
      client_id: form.client_id,
      form_id: form.id,
      contact_id: contactId || null,
      respondent: [nombre.trim(), email.trim()].filter(Boolean).join(' · '),
      answers,
    })
    if (err) { setError('No se pudo enviar: ' + err.message); setEnviando(false); return }
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

            <FormNote>{error}</FormNote>
            {touched && !ok && <FormNote>Faltan respuestas obligatorias.</FormNote>}

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
