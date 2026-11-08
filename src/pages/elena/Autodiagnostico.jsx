import { useEffect, useRef, useState } from 'react'
import { CALENDLY, WHATSAPP, REDES, PRIVACIDAD } from './contenido.js'
import {
  PUERTA, RAMAS, ramaDe, preguntasVisibles, totalEstimado, texto, valorDe, diagnosticoPersona, diagnosticoEmpresa,
} from './diagnostico.js'
import { dos, utmDeLaUrl, IcoCheck, IcoFlecha, IcoAtras } from './comun.jsx'

// El autodiagnóstico de Elena como asistente: una pregunta por pantalla.
//
// La primera (la puerta) decide la rama —persona o empresa— y cada rama trae
// sus propias preguntas, que aparecen o cambian según lo ya respondido (todo
// definido en diagnostico.js). Las de una opción avanzan solas al elegir; las
// de varias y el texto libre, con «Continuar». El último paso pide el
// contacto. Al enviar se calcula el perfil (avatar) para el CRM y se enseña
// una lectura personalizada con el siguiente paso: su Calendly, con nombre y
// correo ya rellenos.

const TEXTO_CONSENT = 'Acepto que Elena Fontecha trate mis datos para ponerse en contacto conmigo sobre este autodiagnóstico, conforme a su política de privacidad.'
const CONTACTO = { key: '__contacto', tipo: 'contacto' }
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const vacio = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

export default function Autodiagnostico({ onEstado }) {
  const [r, setR] = useState({})
  const [i, setI] = useState(0)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [consent, setConsent] = useState(false)
  const [estado, setEstado] = useState('form') // form | enviando | ok | error
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)
  const tarjeta = useRef(null)
  const titulo = useRef(null)
  const tocado = useRef(false)
  const avanzando = useRef(false)

  const rama = ramaDe(r)
  const preguntas = preguntasVisibles(r)
  const pasos = rama ? [...preguntas, CONTACTO] : preguntas
  const actual = pasos[Math.min(i, pasos.length - 1)]
  // El total cuenta como posibles las preguntas que aún dependen de algo sin
  // responder: así el contador solo baja (nunca «01 / 08 → 04 / 12»).
  const total = totalEstimado(r)
  const enContacto = actual.tipo === 'contacto'
  const pct = !rama ? 4 : enContacto ? 100 : Math.round((i / (total + 1)) * 100)

  // Al cambiar de paso: el foco va a la pregunta (sin saltos) y, si la tarjeta
  // se ha quedado por encima de la pantalla, se vuelve a ella. No en la carga.
  useEffect(() => {
    if (!tocado.current) return
    titulo.current?.focus({ preventScroll: true })
    const top = tarjeta.current?.getBoundingClientRect().top ?? 0
    if (top < 60) tarjeta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [i, estado])

  const siguiente = () => { tocado.current = true; setI((x) => x + 1) }
  const atras = () => { tocado.current = true; setI((x) => Math.max(0, x - 1)) }

  function elegirUno(q, v) {
    if (avanzando.current) return
    avanzando.current = true
    setR((prev) => ({ ...prev, [q.key]: v }))
    setTimeout(() => { avanzando.current = false; siguiente() }, 230)
  }

  function alternar(q, v) {
    setR((prev) => {
      const ya = Array.isArray(prev[q.key]) ? prev[q.key] : []
      if (ya.includes(v)) return { ...prev, [q.key]: ya.filter((x) => x !== v) }
      if (q.max && ya.length >= q.max) return prev
      return { ...prev, [q.key]: [...ya, v] }
    })
  }

  const emailOk = RE_EMAIL.test(email.trim())
  const contactoOk = nombre.trim() && emailOk && (rama !== 'empresa' || empresa.trim()) && consent

  async function enviar(e) {
    e.preventDefault()
    if (!contactoOk || estado === 'enviando') return
    setEstado('enviando')
    setError('')

    // Solo las respuestas de las preguntas que han tocado en esta rama.
    const respuestas = {}
    for (const q of preguntasVisibles(r)) {
      const v = r[q.key]
      if (vacio(v)) continue
      respuestas[q.key] = typeof v === 'string' ? v.trim() : v
    }
    const diag = rama === 'empresa' ? diagnosticoEmpresa(r) : diagnosticoPersona(r)
    respuestas.perfil = diag.perfil
    if (rama === 'empresa') respuestas.recomendacion = diag.recomendacion
    else respuestas.punto_entrada = diag.punto_entrada

    const utm = utmDeLaUrl()
    try {
      const res = await fetch('/api/formularios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'elenafontecha',
          form: RAMAS[rama].form,
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          ...(rama === 'empresa' ? { empresa: empresa.trim() } : {}),
          origen: rama === 'empresa' ? 'Landing VSL · empresa' : 'Landing VSL · persona',
          respuestas,
          meta: {
            origen: `Landing VSL · /elenafontecha/valor · ${rama}`,
            perfil: diag.perfil,
            url: window.location.href,
            referrer: document.referrer || '',
            consentimiento: { aceptado: true, texto: TEXTO_CONSENT, fecha: new Date().toISOString() },
            ...utm,
          },
          ...utm,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      tocado.current = true
      setResultado({ rama, ...diag })
      setEstado('ok')
      onEstado?.('ok')
    } catch {
      setEstado('error')
      setError('No hemos podido enviar tus respuestas. Revisa tu conexión e inténtalo de nuevo.')
    }
  }

  const primerNombre = nombre.trim().split(/\s+/)[0] || ''
  const calendlyUrl = `${CALENDLY}?name=${encodeURIComponent(nombre.trim())}&email=${encodeURIComponent(email.trim())}`

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (estado === 'ok' && resultado) {
    return (
      <div className="ef-card ef-res" ref={tarjeta}>
        <span className="ef-res__marca"><IcoCheck /></span>
        <p className="ef-eyebrow ef-res__hola">Gracias{primerNombre ? `, ${primerNombre}` : ''}</p>

        {resultado.rama === 'persona' ? (
          <>
            <h3 className="ef-h3" ref={titulo} tabIndex={-1}>{resultado.lectura.titulo}</h3>
            <p className="ef-p">{resultado.lectura.texto}</p>
            <div className="ef-res__est">
              <p className="ef-mini">Tu punto de partida en el recorrido</p>
              <p className="ef-res__n">Estación {dos(resultado.estacion.n)}</p>
              <p className="ef-res__t">{resultado.estacion.nombre}</p>
              <p className="ef-res__q">«{resultado.estacion.pregunta}»</p>
              {resultado.conLiderazgo ? (
                <p className="ef-res__lid"><span>En tu liderazgo</span>{resultado.estacion.liderazgo}</p>
              ) : null}
            </div>
            {resultado.dimension ? (
              <p className="ef-res__dim">La dimensión que más pide atención: <strong>{resultado.dimension.toLowerCase()}</strong>.</p>
            ) : null}
            {resultado.alLimite ? (
              <p className="ef-res__aviso">Has dicho que tu energía está al límite. Elena lo tendrá en cuenta antes que nada.</p>
            ) : null}
          </>
        ) : (
          <>
            <h3 className="ef-h3" ref={titulo} tabIndex={-1}>
              Por dónde empezaría Elena{empresa.trim() ? <> con <em>{empresa.trim()}</em></> : null}
            </h3>
            <ol className="ef-res__recs">
              {resultado.recomendaciones.map((x, k) => (
                <li key={x.titulo}>
                  <span className="ef-res__rn">{dos(k + 1)}</span>
                  <div><p className="ef-res__rt">{x.titulo}</p><p className="ef-res__rx">{x.texto}</p></div>
                </li>
              ))}
            </ol>
            <p className="ef-p ef-p--sm">Es una orientación: la propuesta se define en la conversación, con la situación real delante.</p>
          </>
        )}

        <a className="ef-btn ef-btn--full ef-res__cta" href={calendlyUrl} target="_blank" rel="noopener noreferrer">
          {resultado.rama === 'empresa' ? 'Reservar una conversación con Elena' : 'Reservar mi conversación gratuita'} <IcoFlecha />
        </a>
        <p className="ef-res__alt">
          ¿Prefieres escribirle? <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          {' · '}
          <a href={REDES[0].url} target="_blank" rel="noopener noreferrer">Instagram</a>
        </p>
      </div>
    )
  }

  // ── Asistente ──────────────────────────────────────────────────────────────
  const etiqueta = actual.key === PUERTA.key
    ? 'Empezamos'
    : actual.tipo === 'contacto' ? 'Último paso' : `${dos(i)} / ${dos(total)}`

  return (
    <div className="ef-card ef-wiz" ref={tarjeta}>
      <div className="ef-wiz__top">
        <p className="ef-eyebrow ef-wiz__eyebrow">{rama === 'empresa' ? 'Autodiagnóstico · Empresa' : rama === 'persona' ? 'Autodiagnóstico · Para ti' : 'Autodiagnóstico'}</p>
        <span className="ef-wiz__cuenta" aria-live="polite">{etiqueta}</span>
      </div>
      <div className="ef-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progreso">
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="ef-wiz__paso" key={actual.key}>
        {actual.tipo === 'contacto' ? (
          <form onSubmit={enviar} noValidate>
            <h3 className="ef-wiz__q" ref={titulo} tabIndex={-1}>
              {rama === 'empresa' ? '¿A quién enviamos la orientación?' : '¿Dónde te enviamos el siguiente paso?'}
            </h3>
            <p className="ef-wiz__sub">Al enviarlo verás tu lectura y podrás reservar la conversación.</p>
            <div className="ef-datos">
              <div className="ef-field">
                <label htmlFor="ef-nombre">Nombre</label>
                <input id="ef-nombre" className="ef-input" type="text" autoComplete="name"
                  value={nombre} onChange={(ev) => setNombre(ev.target.value)} required />
              </div>
              {rama === 'empresa' ? (
                <div className="ef-field">
                  <label htmlFor="ef-empresa">Empresa</label>
                  <input id="ef-empresa" className="ef-input" type="text" autoComplete="organization"
                    value={empresa} onChange={(ev) => setEmpresa(ev.target.value)} required />
                </div>
              ) : null}
              <div className="ef-grid-2">
                <div className="ef-field">
                  <label htmlFor="ef-email">{rama === 'empresa' ? 'Correo de trabajo' : 'Correo'}</label>
                  <input id="ef-email" className="ef-input" type="email" autoComplete="email" inputMode="email"
                    value={email} onChange={(ev) => setEmail(ev.target.value)} required />
                </div>
                <div className="ef-field">
                  <label htmlFor="ef-tel">Teléfono <span className="ef-opc">(opcional)</span></label>
                  <input id="ef-tel" className="ef-input" type="tel" autoComplete="tel" inputMode="tel"
                    value={telefono} onChange={(ev) => setTelefono(ev.target.value)} />
                </div>
              </div>
            </div>
            <label className="ef-consent">
              <input type="checkbox" checked={consent} onChange={(ev) => setConsent(ev.target.checked)} />
              <span>
                Acepto que Elena Fontecha trate mis datos para ponerse en contacto conmigo sobre este
                autodiagnóstico, conforme a su{' '}
                <a href={PRIVACIDAD} target="_blank" rel="noopener noreferrer">política de privacidad</a>.
              </span>
            </label>
            <button className="ef-btn ef-btn--full" type="submit" disabled={!contactoOk || estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : <>Ver mi lectura <IcoFlecha /></>}
            </button>
            {error ? <p className="ef-error" role="alert">{error}</p> : null}
            <p className="ef-nota">Tus respuestas las lee Elena. No se comparten con terceros.</p>
          </form>
        ) : (
          <>
            <h3 className="ef-wiz__q" ref={titulo} tabIndex={-1}>{texto(actual.label, r)}</h3>
            {actual.sub ? <p className="ef-wiz__sub">{texto(actual.sub, r)}</p> : null}

            {actual.tipo === 'texto' ? (
              <textarea
                className="ef-input ef-textarea"
                value={r[actual.key] || ''}
                onChange={(ev) => setR((prev) => ({ ...prev, [actual.key]: ev.target.value }))}
                maxLength={800}
                placeholder={actual.placeholder}
                aria-label={texto(actual.label, r)}
              />
            ) : (
              <div className={`ef-options${actual.options.length > 6 ? ' ef-options--2' : ''}${actual.key === 'tipo' ? ' ef-options--puerta' : ''}`}>
                {actual.options
                  .filter((op) => !actual.visible || actual.visible(r, valorDe(op)))
                  .map((op) => {
                    const v = valorDe(op)
                    const multi = actual.tipo === 'varios'
                    const sel = multi ? (r[actual.key] || []).includes(v) : r[actual.key] === v
                    const lleno = multi && actual.max && (r[actual.key] || []).length >= actual.max && !sel
                    return (
                      <button
                        type="button"
                        key={v}
                        className={`ef-opt${sel ? ' is-sel' : ''}${multi ? ' ef-opt--multi' : ''}`}
                        aria-pressed={sel}
                        disabled={lleno}
                        onClick={() => (multi ? alternar(actual, v) : elegirUno(actual, v))}
                      >
                        <span className="ef-opt__dot" aria-hidden="true">{multi && sel ? <IcoCheck /> : null}</span>
                        <span className="ef-opt__txt">
                          <span className="ef-opt__v">{v}</span>
                          {typeof op === 'object' && op.d ? <span className="ef-opt__d">{op.d}</span> : null}
                        </span>
                      </button>
                    )
                  })}
              </div>
            )}

            <div className="ef-wiz__nav">
              {i > 0 ? (
                <button type="button" className="ef-wiz__atras" onClick={atras}><IcoAtras /> Atrás</button>
              ) : <span />}
              {actual.tipo === 'varios' ? (
                <button type="button" className="ef-btn" onClick={siguiente} disabled={vacio(r[actual.key])}>
                  Continuar <IcoFlecha />
                </button>
              ) : actual.tipo === 'texto' ? (
                <button type="button" className="ef-btn" onClick={siguiente}>
                  {vacio((r[actual.key] || '').trim()) ? 'Saltar' : 'Continuar'} <IcoFlecha />
                </button>
              ) : !vacio(r[actual.key]) ? (
                <button type="button" className="ef-btn ef-btn--ghost" onClick={siguiente}>
                  Continuar <IcoFlecha />
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
