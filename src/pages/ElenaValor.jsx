import { useEffect, useRef, useState } from 'react'
import './elena/elena.css'
import {
  VIDEO_EMBED, CALENDLY, WHATSAPP, REDES, PRIVACIDAD, PREGUNTA_GANCHO, PREGUNTAS,
  PARA_TI, NO_ES_PARA_TI, ESTACIONES, DIMENSIONES, CIFRAS, CREDENCIALES, TRAYECTORIA, PASOS, FAQ,
} from './elena/contenido'

// Landing VSL de Elena Fontecha · /elenafontecha/valor
//
// Arriba, su pregunta central de gancho con su retrato; luego el vídeo (VSL),
// para quién es, la idea de vida + liderazgo integrados, el recorrido de seis
// estaciones (interactivo), quién es Elena y el autodiagnóstico, que capta el
// lead y le da el siguiente paso: reservar la primera conversación gratuita en
// su Calendly, con nombre y correo ya rellenos.
//
// El envío hace POST a /api/formularios {slug:'elenafontecha', form:'valor'} y
// el lead entra a su CRM: pipeline «Captación (leads)», etapa «Lead
// (autodiagnóstico)». El contenido editable vive en ./elena/contenido.js.
//
// Fotos: sesión de su web elenafontecha.com, recortadas en public/elena/.

const IMG = '/elena'
const dos = (n) => String(n).padStart(2, '0')
const ANIO = new Date().getFullYear()

const TEXTO_CONSENT = 'Acepto que Elena Fontecha trate mis datos para ponerse en contacto conmigo sobre este autodiagnóstico, conforme a su política de privacidad.'

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

function ir(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Aparición suave de los bloques marcados con data-ap al entrar en pantalla.
function useAparecer(ref) {
  useEffect(() => {
    const raiz = ref.current
    if (!raiz) return undefined
    const els = raiz.querySelectorAll('[data-ap]')
    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!('IntersectionObserver' in window) || sinMovimiento) {
      els.forEach((el) => el.classList.add('is-in'))
      return undefined
    }
    raiz.classList.add('ef-anima')
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
      })
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ref])
}

const IcoPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
)
const IcoCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
)
const IcoFlecha = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)

function Video() {
  const [play, setPlay] = useState(false)
  const src = VIDEO_EMBED ? `${VIDEO_EMBED}${VIDEO_EMBED.includes('?') ? '&' : '?'}autoplay=1&rel=0` : ''
  return (
    <div className="ef-video">
      {play && src ? (
        <iframe
          src={src}
          title="Elena Fontecha"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className={`ef-video__poster${VIDEO_EMBED ? '' : ' is-pronto'}`}
          onClick={() => VIDEO_EMBED && setPlay(true)}
          aria-label={VIDEO_EMBED ? 'Reproducir el vídeo de Elena Fontecha' : 'El vídeo de Elena Fontecha estará disponible muy pronto'}
        >
          <img src={`${IMG}/arco-16x9.webp`} alt="" loading="lazy" width="1600" height="900" />
          <span className="ef-video__velo" />
          <span className="ef-video__play"><IcoPlay /></span>
          <span className="ef-video__rotulo">
            <span className="ef-tag">{VIDEO_EMBED ? 'Dale al play' : 'El vídeo, muy pronto'}</span>
          </span>
        </button>
      )}
    </div>
  )
}

// La rueda de las seis estaciones: un recorrido circular con la persona en el
// centro. Cada nodo se puede pulsar y abre su estación en la lista de al lado.
function Rueda({ activa, setActiva }) {
  const C = 200
  const R = 152
  const ang = (i, d = 0) => ((-90 + i * 60 + d) * Math.PI) / 180
  const pt = (a, r = R) => [C + r * Math.cos(a), C + r * Math.sin(a)]
  const arco = (i) => {
    const [x0, y0] = pt(ang(i, 13))
    const [x1, y1] = pt(ang(i + 1, -15))
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  const tecla = (i) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiva(i) }
  }
  return (
    <svg viewBox="0 0 400 400" className="ef-rueda" role="group" aria-label="Las seis estaciones del recorrido">
      <defs>
        <marker id="ef-punta" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1 L8 5 L1 9" className="ef-rueda__punta" />
        </marker>
      </defs>
      {ESTACIONES.map((_, i) => (
        <path key={i} d={arco(i)} className="ef-rueda__arco" markerEnd="url(#ef-punta)" />
      ))}
      <circle cx={C} cy={C} r="100" className="ef-rueda__centro" />
      <circle cx={C} cy={C} r="88" className="ef-rueda__anillo" />
      <text x={C} y={C - 34} textAnchor="middle" className="ef-rueda__eyebrow">LA PERSONA</text>
      <text x={C} y={C - 4} textAnchor="middle" className="ef-rueda__dim">{DIMENSIONES[0]} · {DIMENSIONES[1]}</text>
      <text x={C} y={C + 20} textAnchor="middle" className="ef-rueda__dim">{DIMENSIONES[2]} · {DIMENSIONES[3]}</text>
      <text x={C} y={C + 48} textAnchor="middle" className="ef-rueda__social">+ lo social, en todas</text>
      {ESTACIONES.map((e, i) => {
        const [x, y] = pt(ang(i))
        const on = i === activa
        return (
          <g
            key={e.nombre}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            className={`ef-rueda__nodo${on ? ' is-on' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`Estación ${i + 1}: ${e.nombre}`}
            onClick={() => setActiva(i)}
            onKeyDown={tecla(i)}
          >
            <circle r="27" />
            <text textAnchor="middle" dy="5">{dos(i + 1)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function ElenaValor() {
  const raiz = useRef(null)
  const [resp, setResp] = useState({})
  const [motivo, setMotivo] = useState('')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [consent, setConsent] = useState(false)
  const [estado, setEstado] = useState('form') // form | enviando | ok | error
  const [error, setError] = useState('')
  const [activa, setActiva] = useState(0)
  const [conSombra, setConSombra] = useState(false)
  const [pasadoHero, setPasadoHero] = useState(false)
  const [formEnPantalla, setFormEnPantalla] = useState(false)

  useAparecer(raiz)

  useEffect(() => {
    const tituloAntes = document.title
    document.title = 'Elena Fontecha · ¿Sigo queriendo la vida que estoy construyendo?'
    const meta = document.querySelector('meta[name="description"]')
    const descAntes = meta?.getAttribute('content')
    meta?.setAttribute('content', 'Desarrollo personal y liderazgo, integrados. Un autodiagnóstico de cinco preguntas y una primera conversación gratuita con Elena Fontecha.')
    return () => {
      document.title = tituloAntes
      if (meta && descAntes != null) meta.setAttribute('content', descAntes)
    }
  }, [])

  useEffect(() => {
    const alScroll = () => {
      setConSombra(window.scrollY > 8)
      // La barra fija de móvil no duplica el botón del hero: sale al pasarlo.
      setPasadoHero(window.scrollY > window.innerHeight * 0.85)
    }
    alScroll()
    window.addEventListener('scroll', alScroll, { passive: true })
    return () => window.removeEventListener('scroll', alScroll)
  }, [])

  // La barra fija de móvil se esconde cuando el formulario ya está a la vista.
  useEffect(() => {
    const el = document.getElementById('diagnostico')
    if (!el || !('IntersectionObserver' in window)) return undefined
    const io = new IntersectionObserver(([e]) => setFormEnPantalla(e.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const elegir = (key, valor) => setResp((r) => ({ ...r, [key]: valor }))

  const respondidas = PREGUNTAS.filter((q) => resp[q.key]).length
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const hechos = respondidas + (nombre.trim() ? 1 : 0) + (emailValido ? 1 : 0)
  const total = PREGUNTAS.length + 2
  const pct = Math.round((hechos / total) * 100)
  const puedeEnviar = hechos === total && consent

  const primerNombre = nombre.trim().split(/\s+/)[0] || ''
  const calendlyUrl = `${CALENDLY}?name=${encodeURIComponent(nombre.trim())}&email=${encodeURIComponent(email.trim())}`

  async function enviar(e) {
    e.preventDefault()
    if (!puedeEnviar || estado === 'enviando') return
    setEstado('enviando')
    setError('')
    const utm = utmDeLaUrl()
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
            ...utm,
          },
          ...utm,
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setEstado('ok')
      requestAnimationFrame(() => ir('diagnostico-tarjeta'))
    } catch {
      setEstado('error')
      setError('No hemos podido enviar tus respuestas. Revisa tu conexión e inténtalo de nuevo.')
    }
  }

  const e = ESTACIONES[activa]

  return (
    <div className="ef-root" ref={raiz}>
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <header className={`ef-header${conSombra ? ' is-sombra' : ''}`}>
        <div className="ef-wrap ef-header__in">
          <button type="button" className="ef-wordmark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Elena Fontecha
          </button>
          <nav className="ef-nav" aria-label="Secciones">
            <button type="button" onClick={() => ir('video')}>El vídeo</button>
            <button type="button" onClick={() => ir('metodo')}>El recorrido</button>
            <button type="button" onClick={() => ir('elena')}>Quién es Elena</button>
            <button type="button" onClick={() => ir('preguntas')}>Preguntas</button>
          </nav>
          <button type="button" className="ef-btn ef-btn--sm" onClick={() => ir('diagnostico')}>Autodiagnóstico</button>
        </div>
      </header>

      {/* ── Hero: la pregunta central ────────────────────────────────── */}
      <section className="ef-hero">
        <div className="ef-wrap ef-hero__grid">
          <div className="ef-hero__txt">
            <p className="ef-eyebrow">Desarrollo personal y liderazgo, integrados</p>
            <h1 className="ef-h1">
              ¿Sigo queriendo la vida que estoy construyendo <em>con mi manera de vivir y de actuar?</em>
            </h1>
            <p className="ef-lead">
              Se puede construir una trayectoria sólida y una vida llena de compromisos sin
              detenerse a comprobar si seguimos queriendo lo que construimos. Una decisión puede
              tener sentido por separado y, sin embargo, sumar a un conjunto que ya no responde a
              nuestras prioridades.
            </p>
            <div className="ef-hero__ctas">
              <button type="button" className="ef-btn" onClick={() => ir('diagnostico')}>
                Hacer el autodiagnóstico <IcoFlecha />
              </button>
              <button type="button" className="ef-btn ef-btn--ghost" onClick={() => ir('video')}>
                <IcoPlay /> Ver el vídeo
              </button>
            </div>
            <p className="ef-hero__cred">
              <strong>+25 años en alta dirección.</strong> Ex Directora General Adjunta Ejecutiva y
              Secretaria del Consejo de Administración de PortAventura.
            </p>
          </div>
          <figure className="ef-hero__foto">
            <span className="ef-hero__bloque" aria-hidden="true" />
            <img src={`${IMG}/retrato.webp`} alt="Elena Fontecha" width="640" height="800" fetchPriority="high" />
            <figcaption className="ef-hero__tag">
              <span className="ef-tag">No hay desarrollo profesional sin desarrollo personal.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Trayectoria (franja) ─────────────────────────────────────── */}
      <div className="ef-franja" aria-label="Trayectoria">
        <div className="ef-wrap ef-franja__in">
          <span className="ef-franja__k">Trayectoria</span>
          {TRAYECTORIA.map((t) => <span key={t} className="ef-franja__v">{t}</span>)}
        </div>
      </div>

      {/* ── El vídeo (VSL) ───────────────────────────────────────────── */}
      <section className="ef-oscuro" id="video">
        <div className="ef-wrap">
          <div className="ef-centro ef-oscuro__head" data-ap>
            <p className="ef-eyebrow ef-eyebrow--claro">El vídeo</p>
            <h2 className="ef-h2 ef-h2--claro">Antes de responder, <em>escúchala.</em></h2>
            <p className="ef-p ef-p--claro">
              En unos minutos, Elena cuenta para quién es este trabajo y cómo lo plantea.
            </p>
          </div>
          <div className="ef-oscuro__video" data-ap><Video /></div>
          <div className="ef-centro">
            <button type="button" className="ef-btn ef-btn--claro" onClick={() => ir('diagnostico')}>
              Ir al autodiagnóstico <IcoFlecha />
            </button>
          </div>
        </div>
      </section>

      {/* ── Para quién ───────────────────────────────────────────────── */}
      <section className="ef-section" id="para-quien">
        <div className="ef-wrap ef-split">
          <div className="ef-split__a" data-ap>
            <p className="ef-eyebrow">Para quién es</p>
            <h2 className="ef-h2">Para quien funciona bien y, aun así, <em>quiere revisar el rumbo.</em></h2>
            <p className="ef-p">
              No hace falta estar en crisis. Este trabajo sirve tanto para confirmar lo que quieres
              conservar como para abrir cambios pequeños o profundos.
            </p>
          </div>
          <div className="ef-split__b" data-ap>
            <ul className="ef-check">
              {PARA_TI.map((t) => (
                <li key={t}><span className="ef-check__i"><IcoCheck /></span><span>{t}</span></li>
              ))}
            </ul>
            <div className="ef-nop">
              <p className="ef-mini">No es para ti si…</p>
              <ul>{NO_ES_PARA_TI.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── La idea: una vida integrada ──────────────────────────────── */}
      <section className="ef-section ef-section--rosa">
        <div className="ef-wrap">
          <div className="ef-centro ef-estrecho" data-ap>
            <p className="ef-eyebrow">La idea</p>
            <h2 className="ef-h2">Una persona, <em>una vida integrada.</em></h2>
            <p className="ef-p">
              La manera de comprendernos, relacionarnos y afrontar lo que nos pasa interviene en
              cómo dirigimos. Y las condiciones de trabajo, los equipos y las organizaciones
              influyen en nuestra forma de vivir. Por eso aquí se trabajan juntos, desde el
              principio.
            </p>
          </div>
          <div className="ef-caso" data-ap>
            <div className="ef-caso__sit">
              <p className="ef-mini">Un caso para entenderlo</p>
              <p className="ef-caso__txt">
                Quieres recuperar tiempo y autonomía, pero concentras decisiones porque sientes que
                debes estar disponible para todo.
              </p>
            </div>
            <div className="ef-caso__planos">
              <div className="ef-caso__plano">
                <p className="ef-caso__k"><span>01</span>El trabajo personal</p>
                <p>Examina qué sostiene esa respuesta y qué quieres cambiar.</p>
              </div>
              <div className="ef-caso__plano">
                <p className="ef-caso__k"><span>02</span>El trabajo de liderazgo</p>
                <p>Revisa la delegación, los acuerdos, las capacidades del equipo y los incentivos que mantienen la dependencia.</p>
              </div>
            </div>
            <p className="ef-caso__fin"><span className="ef-tag">Las acciones atienden a los dos planos.</span></p>
          </div>
        </div>
      </section>

      {/* ── Banda: el camino ─────────────────────────────────────────── */}
      <section className="ef-camino" aria-label="El recorrido">
        <img src={`${IMG}/camino.webp`} alt="" loading="lazy" width="1920" height="900" />
        <span className="ef-camino__velo" aria-hidden="true" />
        <blockquote className="ef-camino__q" data-ap>
          <p>Las estaciones organizan una conversación que puede retomarse <em>a lo largo de la vida.</em></p>
        </blockquote>
      </section>

      {/* ── El recorrido: seis estaciones ────────────────────────────── */}
      <section className="ef-section" id="metodo">
        <div className="ef-wrap">
          <div className="ef-metodo__head" data-ap>
            <p className="ef-eyebrow">El recorrido</p>
            <h2 className="ef-h2">Seis estaciones. <em>Cada una mira a tu vida y a tu manera de dirigir.</em></h2>
            <p className="ef-p">
              Un recorrido circular: su orden ayuda a comprender, pero admite retornos y distintos
              puntos de entrada. En el centro, la persona en su realidad actual, con cuatro
              dimensiones y lo social atravesándolas todas.
            </p>
          </div>
          <div className="ef-metodo__grid">
            <div className="ef-metodo__rueda" data-ap>
              <Rueda activa={activa} setActiva={setActiva} />
              <p className="ef-metodo__hint">Pulsa una estación</p>
            </div>
            <ol className="ef-est" data-ap>
              {ESTACIONES.map((est, i) => {
                const on = i === activa
                return (
                  <li key={est.nombre} className={`ef-est__item${on ? ' is-on' : ''}`}>
                    <button type="button" className="ef-est__btn" onClick={() => setActiva(i)} aria-expanded={on}>
                      <span className="ef-est__n">{dos(i + 1)}</span>
                      <span className="ef-est__t">{est.nombre}</span>
                      <span className="ef-est__mas" aria-hidden="true" />
                    </button>
                    {on ? (
                      <div className="ef-est__body">
                        <p className="ef-est__q">«{e.pregunta}»</p>
                        <div className="ef-est__planos">
                          <div>
                            <p className="ef-mini">En tu vida</p>
                            <p>{e.vida}</p>
                          </div>
                          <div>
                            <p className="ef-mini">En tu liderazgo · {e.liderazgo}</p>
                            <p>{e.liderazgoTxt}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Quién es Elena ───────────────────────────────────────────── */}
      <section className="ef-section ef-section--crema" id="elena">
        <div className="ef-wrap ef-autor">
          <figure className="ef-autor__foto" data-ap>
            <img src={`${IMG}/de-pie-4x5.webp`} alt="Elena Fontecha" loading="lazy" width="720" height="900" />
            <figcaption className="ef-autor__pie"><span className="ef-tag">Coach, mentora y senior advisor</span></figcaption>
          </figure>
          <div className="ef-autor__txt" data-ap>
            <p className="ef-eyebrow">Quién acompaña</p>
            <h2 className="ef-h2">Elena <em>Fontecha</em></h2>
            <p className="ef-p">
              Durante más de 25 años he dirigido equipos y liderado cambios. Fui Directora General
              Adjunta Ejecutiva y Secretaria del Consejo de Administración de PortAventura, diseñé el
              área de Gestión Patrimonial de Servihabitat y de Haya Real Estate, y fundé Elara
              Asociados.
            </p>
            <p className="ef-p">
              También pasé por un burnout que me enseñó, desde dentro, cómo las fortalezas de un
              directivo pueden acabar jugando en su contra. Hoy acompaño a líderes y a personas que
              funcionan, pero quieren revisar su rumbo, mirando a la vez a la persona, al equipo y al
              negocio.
            </p>
            <blockquote className="ef-quote">«En la vida corporativa no hace falta sufrir tanto.»</blockquote>
            <div className="ef-cifras">
              {CIFRAS.map((c) => (
                <div key={c.t} className="ef-cifra">
                  <span className="ef-cifra__n">{c.n}</span>
                  <span className="ef-cifra__t">{c.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="ef-wrap">
          <div className="ef-creds" data-ap>
            <div>
              <p className="ef-mini">Formación y acreditaciones</p>
              <dl className="ef-creds__list">
                {CREDENCIALES.map(([a, b]) => (
                  <div key={a + b}><dt>{a}</dt><dd>{b}</dd></div>
                ))}
              </dl>
            </div>
            <div>
              <p className="ef-mini">Hoy</p>
              <p className="ef-creds__hoy">
                Acompañamiento individual de desarrollo personal y de liderazgo, mentoría,
                evaluación con el Leadership Circle Profile® y trabajo con equipos de dirección.
                Patrona de la Fundación Mare Terra.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Cómo empieza + autodiagnóstico ───────────────────────────── */}
      <section className="ef-section" id="diagnostico">
        <div className="ef-wrap">
          <div className="ef-centro" data-ap>
            <p className="ef-eyebrow">Cómo empieza</p>
            <h2 className="ef-h2">Tres pasos. <em>El primero, ahora.</em></h2>
          </div>
          <ol className="ef-pasos" data-ap>
            {PASOS.map(([t, d], i) => (
              <li key={t}>
                <span className="ef-pasos__n">{dos(i + 1)}</span>
                <p className="ef-pasos__t">{t}</p>
                <p className="ef-pasos__d">{d}</p>
              </li>
            ))}
          </ol>

          <div className="ef-form-grid">
            <aside className="ef-form-aside" data-ap>
              <img src={`${IMG}/arco-4x5.webp`} alt="Elena Fontecha" loading="lazy" width="720" height="900" />
              <p className="ef-form-aside__tag"><span className="ef-tag">Esto es una foto, no una sentencia.</span></p>
            </aside>

            <div className="ef-card" id="diagnostico-tarjeta">
              {estado === 'ok' ? (
                <div className="ef-gracias">
                  <span className="ef-gracias__marca"><IcoCheck /></span>
                  <p className="ef-eyebrow">Recibido</p>
                  <h3 className="ef-h3">Gracias{primerNombre ? `, ${primerNombre}` : ''}. <em>Elena leerá tus respuestas.</em></h3>
                  <p className="ef-p">
                    El siguiente paso es una primera conversación, gratuita y sin compromiso, para
                    entender tu momento. Puedes reservarla ahora mismo:
                  </p>
                  <a className="ef-btn ef-btn--full" href={calendlyUrl} target="_blank" rel="noopener noreferrer">
                    Reservar mi conversación gratuita <IcoFlecha />
                  </a>
                  <p className="ef-gracias__alt">
                    ¿Prefieres escribirle? <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    {' · '}
                    <a href={REDES[0].url} target="_blank" rel="noopener noreferrer">Instagram</a>
                  </p>
                </div>
              ) : (
                <>
                  <div className="ef-card__head">
                    <p className="ef-eyebrow">Autodiagnóstico</p>
                    <h3 className="ef-h3">Cinco preguntas para situar <em>dónde estás.</em></h3>
                    <p className="ef-p ef-p--sm">
                      No hay respuestas correctas. Sirven para empezar la conversación en el punto
                      donde estás, no donde se supone que deberías estar.
                    </p>
                    <div className="ef-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progreso">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <form onSubmit={enviar} noValidate>
                    {PREGUNTAS.map((q, i) => (
                      <fieldset className="ef-q" key={q.key}>
                        <legend className="ef-q__label">
                          <span className="ef-q__n">{dos(i + 1)}</span>{q.label}
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
                        <span className="ef-q__n">05</span>En una frase, ¿qué te ha traído hoy aquí?
                        <span className="ef-opc"> (opcional)</span>
                      </label>
                      <textarea
                        id="ef-motivo"
                        className="ef-input ef-textarea"
                        value={motivo}
                        onChange={(ev) => setMotivo(ev.target.value)}
                        maxLength={600}
                        placeholder="Escríbelo con tus palabras."
                      />
                    </div>

                    <div className="ef-datos">
                      <p className="ef-mini">Para enviarte el siguiente paso</p>
                      <div className="ef-field">
                        <label htmlFor="ef-nombre">Nombre</label>
                        <input id="ef-nombre" className="ef-input" type="text" autoComplete="name"
                          value={nombre} onChange={(ev) => setNombre(ev.target.value)} required />
                      </div>
                      <div className="ef-grid-2">
                        <div className="ef-field">
                          <label htmlFor="ef-email">Correo</label>
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
                        Acepto que Elena Fontecha trate mis datos para ponerse en contacto conmigo sobre
                        este autodiagnóstico, conforme a su{' '}
                        <a href={PRIVACIDAD} target="_blank" rel="noopener noreferrer">política de privacidad</a>.
                      </span>
                    </label>

                    <button className="ef-btn ef-btn--full" type="submit" disabled={!puedeEnviar || estado === 'enviando'}>
                      {estado === 'enviando' ? 'Enviando…' : <>Enviar mi autodiagnóstico <IcoFlecha /></>}
                    </button>
                    {!puedeEnviar && estado !== 'enviando' ? (
                      <p className="ef-falta">
                        {hechos < total
                          ? `Te ${total - hechos === 1 ? 'falta 1 dato' : `faltan ${total - hechos} datos`} para enviarlo.`
                          : 'Acepta la política de privacidad para enviarlo.'}
                      </p>
                    ) : null}
                    {error ? <p className="ef-error" role="alert">{error}</p> : null}
                    <p className="ef-nota">Tus respuestas las lee Elena. No se comparten con terceros.</p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Preguntas frecuentes ─────────────────────────────────────── */}
      <section className="ef-section ef-section--rosa" id="preguntas">
        <div className="ef-wrap ef-estrecho">
          <div className="ef-centro" data-ap>
            <p className="ef-eyebrow">Preguntas</p>
            <h2 className="ef-h2">Lo que suele preguntarse <em>antes de empezar.</em></h2>
          </div>
          <div className="ef-faq" data-ap>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}<span className="ef-faq__i" aria-hidden="true" /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cierre ───────────────────────────────────────────────────── */}
      <section className="ef-final">
        <div className="ef-wrap ef-centro" data-ap>
          <p className="ef-eyebrow ef-eyebrow--claro">La pregunta sigue ahí</p>
          <p className="ef-final__q">«{PREGUNTA_GANCHO}»</p>
          <p className="ef-p ef-p--claro">Si te ha hecho pararte, empieza por aquí.</p>
          <button type="button" className="ef-btn ef-btn--claro" onClick={() => ir('diagnostico')}>
            Hacer el autodiagnóstico <IcoFlecha />
          </button>
        </div>
      </section>

      <footer className="ef-footer">
        <div className="ef-wrap ef-footer__in">
          <div>
            <span className="ef-wordmark ef-wordmark--pie">Elena Fontecha</span>
            <p className="ef-footer__tag">Desarrollo personal y liderazgo</p>
          </div>
          <nav className="ef-footer__redes" aria-label="Redes">
            {REDES.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer">{r.nombre}</a>
            ))}
          </nav>
        </div>
        <div className="ef-wrap ef-footer__legal">
          <span>© {ANIO} Elena Fontecha</span>
          <a href={PRIVACIDAD} target="_blank" rel="noopener noreferrer">Política de privacidad</a>
        </div>
      </footer>

      {/* Barra fija en móvil: entre el hero y el formulario */}
      <div className={`ef-fija${!pasadoHero || formEnPantalla || estado === 'ok' ? ' is-oculta' : ''}`}>
        <button type="button" className="ef-btn ef-btn--full" onClick={() => ir('diagnostico')}>
          Hacer el autodiagnóstico <IcoFlecha />
        </button>
      </div>
    </div>
  )
}
