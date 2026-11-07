import { useEffect, useState } from 'react'
import './elena/elena.css'

// Landing VSL de Elena Fontecha · ruta /elenafontecha/valor
//
// Arriba: su pregunta central de gancho + el hueco del vídeo (lo pega Alex
// luego: basta con poner VIDEO_EMBED). Debajo: un autodiagnóstico de 5
// preguntas que capta el lead y le da un siguiente paso. Al enviar hace POST
// a /api/formularios con {slug:'elenafontecha', form:'valor', ...}; el endpoint
// busca el formulario por su slug en helm_forms, lee su pipeline_id y mete el
// contacto en el CRM de Elena, etapa "Lead (autodiagnóstico)".
//
// Marca: burdeos #4F1828, Montserrat, fondo blanco, tono editorial. Sin
// palabras de autoayuda.

// ── Para rellenar luego ──────────────────────────────────────────────────
// Embed del vídeo (YouTube/Vimeo/… con /embed/). Vacío = sale el hueco.
const VIDEO_EMBED = ''
// Siguiente paso tras enviar (p. ej. un Calendly). Vacío = solo el mensaje.
const SIGUIENTE_PASO_URL = ''
const SIGUIENTE_PASO_TXT = 'Reservar una conversación'
// ───────────────────────────────────────────────────────────────────────────

const PREGUNTA_GANCHO = '¿Sigo queriendo la vida que estoy construyendo con mi manera de vivir y de actuar?'

// Las claves (key) son las mismas que declara el formulario en helm_forms; el
// endpoint descarta cualquier respuesta cuya clave no esté declarada allí.
const PREGUNTAS = [
  {
    key: 'revisar',
    label: '¿Qué quieres revisar ahora?',
    options: [
      'Mi vida y mi rumbo',
      'Mi manera de dirigir y de liderar',
      'Las dos cosas, a la vez',
    ],
  },
  {
    key: 'momento',
    label: '¿En qué punto te reconoces?',
    options: [
      'Quiero mirar con verdad dónde estoy',
      'Sé lo que quiero, pero no cómo darle un lugar real',
      'Tengo una decisión delante y necesito tomarla',
      'Quiero revisar decisiones que ya tomé y ver si siguen teniendo sentido',
    ],
  },
  {
    key: 'dimension',
    label: '¿Qué parte sientes más desatendida?',
    options: [
      'Lo físico (energía, cuerpo, descanso)',
      'Lo mental (claridad, foco, criterio)',
      'Lo emocional (cómo vivo lo que me pasa)',
      'Lo espiritual (sentido, valores, lo que importa)',
    ],
  },
  {
    key: 'responsabilidad',
    label: '¿Desde dónde ejerces tu liderazgo?',
    options: [
      'Dirección general o consejo',
      'Dirección de un área o un equipo',
      'Un proyecto o un negocio propio',
      'Otra situación',
    ],
  },
]

function utmDeLaUrl() {
  try {
    const p = new URLSearchParams(window.location.search)
    const out = {}
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = p.get(k)
      if (v) out[k] = v
    }
    return out
  } catch { return {} }
}

const TEXTO_CONSENT = 'Acepto que Elena Fontecha trate mis datos para ponerse en contacto conmigo sobre este autodiagnóstico, conforme a la política de privacidad.'

export default function ElenaValor() {
  const [resp, setResp] = useState({})
  const [motivo, setMotivo] = useState('')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [consent, setConsent] = useState(false)
  const [estado, setEstado] = useState('form') // form | enviando | ok | error
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Elena Fontecha · Autodiagnóstico de rumbo'
  }, [])

  const elegir = (key, valor) => setResp((r) => ({ ...r, [key]: valor }))

  const faltanPreguntas = PREGUNTAS.some((q) => !resp[q.key])
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const puedeEnviar = nombre.trim() && emailValido && !faltanPreguntas && consent

  async function enviar(e) {
    e.preventDefault()
    if (!puedeEnviar || estado === 'enviando') return
    setEstado('enviando')
    setError('')
    try {
      const r = await fetch('/api/formularios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'elenafontecha',
          form: 'valor',
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          respuestas: { ...resp, motivo: motivo.trim() },
          meta: {
            origen: 'Landing VSL · /elenafontecha/valor',
            url: window.location.href,
            referrer: document.referrer || '',
            consentimiento: { aceptado: true, texto: TEXTO_CONSENT, fecha: new Date().toISOString() },
            ...utmDeLaUrl(),
          },
          ...utmDeLaUrl(),
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setEstado('ok')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setEstado('error')
      setError('No hemos podido enviar tus respuestas. Revisa tu conexión e inténtalo de nuevo.')
    }
  }

  return (
    <div className="ef-root">
      <header className="ef-header">
        <div className="ef-header__in">
          <span className="ef-wordmark">Elena Fontecha</span>
          <span className="ef-header__tag">Desarrollo personal y liderazgo</span>
        </div>
      </header>

      {/* Hero: la pregunta central de gancho */}
      <section className="ef-hero">
        <div className="ef-wrap">
          <p className="ef-eyebrow">Desarrollo personal y liderazgo</p>
          <h1>«<em>{PREGUNTA_GANCHO}</em>»</h1>
          <p className="ef-standfirst">
            Se puede construir una trayectoria sólida y una vida llena de compromisos sin
            detenerse a comprobar si seguimos queriendo lo que construimos. Este es un sitio
            para pararse a mirarlo con calma.
          </p>
        </div>
      </section>

      {/* Hueco del vídeo (VSL) */}
      <section className="ef-video">
        <div className="ef-wrap">
          <div className="ef-video__frame">
            {VIDEO_EMBED ? (
              <iframe
                src={VIDEO_EMBED}
                title="Elena Fontecha"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="ef-video__ph">
                <span className="ef-video__play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
                <span>El vídeo estará disponible aquí</span>
              </div>
            )}
          </div>
          <p className="ef-video__cap">Dos minutos: de qué va esto y para quién es.</p>
        </div>
      </section>

      {/* Autodiagnóstico */}
      <section className="ef-section ef-section--alt" id="diagnostico">
        <div className="ef-wrap ef-narrow">
          {estado === 'ok' ? (
            <div className="ef-done">
              <span className="ef-done__mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <h2>Gracias. Lo tenemos.</h2>
              <p>
                Hemos recibido tus respuestas. Elena las lee personalmente y en breve
                recibirás un correo con el siguiente paso.
              </p>
              {SIGUIENTE_PASO_URL ? (
                <a className="ef-cta" href={SIGUIENTE_PASO_URL} target="_blank" rel="noopener noreferrer">{SIGUIENTE_PASO_TXT}</a>
              ) : null}
            </div>
          ) : (
            <>
              <div className="ef-form__head">
                <p className="ef-eyebrow" style={{ textAlign: 'center' }}>Autodiagnóstico</p>
                <h2>Cinco preguntas para situar dónde estás</h2>
                <p>
                  No hay respuestas correctas. Sirven para empezar la conversación en el punto
                  donde estás, no donde se supone que deberías estar.
                </p>
              </div>

              <form onSubmit={enviar} noValidate>
                {PREGUNTAS.map((q, i) => (
                  <fieldset className="ef-q" key={q.key}>
                    <legend className="ef-q__label">
                      <span className="ef-num">{String(i + 1).padStart(2, '0')}</span>{q.label}
                    </legend>
                    <div className="ef-options">
                      {q.options.map((op) => (
                        <label className="ef-opt" key={op}>
                          <input
                            type="radio"
                            name={q.key}
                            value={op}
                            checked={resp[q.key] === op}
                            onChange={() => elegir(q.key, op)}
                          />
                          <span className="ef-opt__dot" aria-hidden="true" />
                          <span>{op}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}

                <div className="ef-q">
                  <label className="ef-q__label" htmlFor="ef-motivo">
                    <span className="ef-num">05</span>En una frase, ¿qué te ha traído hoy aquí?
                    <span className="ef-opt-lbl"> (opcional)</span>
                  </label>
                  <textarea
                    id="ef-motivo"
                    className="ef-textarea"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={600}
                    placeholder="Escríbelo con tus palabras."
                  />
                </div>

                <div className="ef-fields">
                  <div className="ef-field">
                    <label htmlFor="ef-nombre">Nombre</label>
                    <input id="ef-nombre" className="ef-input" type="text" autoComplete="name"
                      value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                  </div>
                  <div className="ef-grid-2">
                    <div className="ef-field">
                      <label htmlFor="ef-email">Correo</label>
                      <input id="ef-email" className="ef-input" type="email" autoComplete="email"
                        value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="ef-field">
                      <label htmlFor="ef-tel">Teléfono <span className="ef-opt-lbl">(opcional)</span></label>
                      <input id="ef-tel" className="ef-input" type="tel" autoComplete="tel"
                        value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                    </div>
                  </div>
                </div>

                <label className="ef-consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    Acepto que Elena Fontecha trate mis datos para ponerse en contacto conmigo
                    sobre este autodiagnóstico, conforme a la{' '}
                    <a href="/privacidad" target="_blank" rel="noopener noreferrer">política de privacidad</a>.
                  </span>
                </label>

                <button className="ef-submit" type="submit" disabled={!puedeEnviar || estado === 'enviando'}>
                  {estado === 'enviando' ? 'Enviando…' : 'Enviar mi autodiagnóstico'}
                </button>
                {error ? <p className="ef-error">{error}</p> : null}
                <p className="ef-privacy-note">Tus respuestas las lee Elena. No se comparten con terceros.</p>
              </form>
            </>
          )}
        </div>
      </section>

      {/* El método: el recorrido de seis estaciones */}
      <section className="ef-section">
        <div className="ef-wrap">
          <div className="ef-method__head">
            <p className="ef-eyebrow">El método</p>
            <h2>Un recorrido de seis estaciones</h2>
            <p>
              Lo personal y el liderazgo, juntos desde el principio. Un recorrido circular que
              puede retomarse a lo largo de la vida, con cuatro dimensiones —física, mental,
              emocional y espiritual— y lo social atravesándolas todas.
            </p>
          </div>
          <ol className="ef-stations">
            {[
              ['Mirarme con verdad', '¿Qué necesito reconocer de mí y de mi situación, aunque resulte incómodo?'],
              ['Comprender qué quiero y para qué', '¿Qué quiero realmente y para qué es importante en mi vida?'],
              ['Comprender mi lugar y mis relaciones', '¿Cómo quiero estar en mis relaciones y qué necesito revisar, pedir o acordar?'],
              ['Dar forma a mi plan de vida', '¿Cómo puede tener lugar lo que quiero sin perder de vista el conjunto de mi vida?'],
              ['Decidir y actuar', '¿Qué movimiento concreto tiene sentido ahora y qué necesito para hacerlo posible?'],
              ['Revisar y evolucionar', '¿Sigo queriendo esto y qué necesito mantener, cambiar o dejar?'],
            ].map(([t, q], i) => (
              <li className="ef-station" key={t}>
                <span className="ef-station__n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <p className="ef-station__t">{t}</p>
                  <p className="ef-station__q">{q}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="ef-dims">
            En cada estación, lo personal y el liderazgo se trabajan a la vez: <strong>la manera de dirigir es la puerta, no el techo.</strong>
          </p>
        </div>
      </section>

      {/* Autoridad */}
      <section className="ef-section ef-section--alt">
        <div className="ef-wrap">
          <div className="ef-author">
            <p className="ef-eyebrow">Quién acompaña</p>
            <h2>Elena Fontecha</h2>
            <p>
              Más de 25 años en alta dirección. Ex Directora General Adjunta y Secretaria del
              Consejo de PortAventura. PDG por el IESE. Practitioner del Leadership Circle
              Profile. Acompaña desde la acción —y desde haber tocado sus propios límites.
            </p>
          </div>
        </div>
      </section>

      <footer className="ef-footer">
        <div className="ef-wrap ef-footer__in">
          <span>© {new Date().getFullYear()} Elena Fontecha</span>
          <a href="/privacidad" target="_blank" rel="noopener noreferrer">Política de privacidad</a>
        </div>
      </footer>
    </div>
  )
}
