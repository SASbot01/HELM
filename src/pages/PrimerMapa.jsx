// Diagnóstico operativo — página pública en /primermap.
//
// Lead magnet: el visitante deja nombre, email y teléfono ANTES de empezar, y
// desde ese momento ya es un contacto del CRM. Si abandona a la tercera
// pregunta, el lead se queda igual — que es la mitad del valor de una pieza
// como esta.
//
// El diseño no es el de HELM a propósito: es una página de captación con su
// propia identidad. Todo va bajo .dg-root en primermapa.css.
import { useEffect, useMemo, useRef, useState } from 'react'
import { SECTIONS, visibles, textoDe } from './primermapa/preguntas'
import { compute, calificar, señales, eur, DIMENSIONES } from './primermapa/calculo'
import { getClientId, crearLead, guardarDiagnostico } from './primermapa/guardar'
import './primermapa/primermapa.css'

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
// Teléfono español o internacional: 9 dígitos mínimo, admite +34 y separadores.
const RE_TEL = /^\+?[0-9][0-9\s().-]{7,19}$/

export default function PrimerMapa() {
  const [fase, setFase] = useState('puerta')   // puerta | test | fin
  const [A, setA] = useState({})
  const [cursor, setCursor] = useState(0)
  const [historia, setHistoria] = useState([])
  const [lead, setLead] = useState(null)       // { clientId, contactId, nombre, email }

  const vis = useMemo(() => visibles(A), [A])
  const q = vis[cursor]

  // El título de la pestaña acompaña: si alguien deja la pestaña abierta a
  // medias, al volver sabe dónde estaba.
  useEffect(() => {
    document.title = fase === 'test'
      ? `${cursor + 1}/${vis.length} · Diagnóstico operativo`
      : 'Diagnóstico operativo · ¿Dónde se te escapa el dinero?'
  }, [fase, cursor, vis.length])

  const responder = (id, valor) => setA(a => ({ ...a, [id]: valor }))
  const avanzar = () => { setHistoria(h => [...h, cursor]); setCursor(c => c + 1) }
  const atras = () => setCursor(historia.at(-1) ?? 0) || setHistoria(h => h.slice(0, -1))

  const seccionActual = fase === 'test' && q ? q.sec : SECTIONS.length

  return (
    <div className="dg-root">
      <div className="dg-shell">
        <aside className="dg-rail">
          <div className="dg-brand">
            Diagnóstico operativo
            <b>¿Dónde se te<br />escapa el dinero?</b>
          </div>
          <ul className="dg-spine">
            {SECTIONS.map((s, i) => (
              <li key={s} className={i === seccionActual ? 'on' : i < seccionActual ? 'done' : ''}>
                {String(i + 1).padStart(2, '0')} · {s}
              </li>
            ))}
          </ul>
          <div className="dg-signals">
            Señales detectadas
            <b>{señales(A)}</b>
          </div>
        </aside>

        <main className="dg-main">
          <div className="dg-bar" style={{ width: fase === 'puerta' ? 0 : fase === 'fin' ? '100%' : `${cursor / vis.length * 100}%` }} />

          {fase === 'puerta' && (
            <Puerta onEntrar={(datos) => { setLead(datos); setFase('test') }} />
          )}

          {fase === 'test' && q && (
            <Pregunta
              key={q.id}
              q={q} A={A} indice={cursor} total={vis.length}
              onResponder={responder}
              onAvanzar={avanzar}
              onAtras={historia.length ? atras : null}
            />
          )}

          {fase === 'test' && !q && (
            <Resultados A={A} lead={lead} onEnviado={() => setFase('fin')} />
          )}

          {fase === 'fin' && <Gracias />}
        </main>
      </div>
    </div>
  )
}

// ── La puerta ───────────────────────────────────────────────────────────────
// Pedir los datos ANTES y no después es la decisión que define esta pieza: al
// final solo deja el contacto quien ya ha visto su resultado, y quien abandona
// a mitad se pierde entero. Aquí se captura a todo el que empieza.
function Puerta({ onEntrar }) {
  const [f, setF] = useState({ nombre: '', email: '', telefono: '' })
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const errores = {}
  if (f.nombre.trim().length < 2) errores.nombre = 'Dinos cómo te llamas'
  if (!RE_EMAIL.test(f.email.trim())) errores.email = 'Necesitamos un email válido para mandarte el informe'
  if (!RE_TEL.test(f.telefono.trim())) errores.telefono = 'Teléfono no válido (mínimo 9 dígitos, se admite +34)'
  const ok = Object.keys(errores).length === 0
  const e = tocado ? errores : {}

  async function entrar(ev) {
    ev.preventDefault()
    setTocado(true)
    setError(null)
    if (!ok) return
    setEnviando(true)
    try {
      const clientId = await getClientId()
      if (!clientId) throw new Error('No se pudo conectar. Inténtalo en un momento.')
      const contactId = await crearLead(clientId, f)
      onEntrar({ clientId, contactId, ...f })
    } catch (err) {
      setError(err.message || 'No se pudo continuar. Inténtalo de nuevo.')
      setEnviando(false)
    }
  }

  return (
    <div className="dg-screen dg-intro">
      <h1>Averigua cuánto<br />te cuesta <em>hacerlo<br />a mano</em>.</h1>
      <p>
        Responde unas preguntas sobre cómo funciona tu negocio por dentro. Las siguientes
        cambian según lo que contestes, así que no te preguntaremos por stock si vendes servicios.
      </p>
      <p>
        Al terminar verás dónde se te está escapando el dinero, cuánto es al mes y qué
        haría falta para taparlo.
      </p>

      <div className="dg-meta">
        <div>Duración<b>7 min</b></div>
        <div>Preguntas<b>~32</b></div>
        <div>Sin escribir<b>90 %</b></div>
      </div>

      <form className="dg-gate" onSubmit={entrar} noValidate>
        <div className="campo">
          <label htmlFor="dgN">Tu nombre</label>
          <input id="dgN" className={'dg-field' + (e.nombre ? ' bad' : '')} value={f.nombre}
            onChange={ev => set('nombre', ev.target.value)} autoComplete="name" placeholder="Cómo te llamas" />
          {e.nombre && <div className="dg-err">{e.nombre}</div>}
        </div>
        <div className="campo">
          <label htmlFor="dgE">Tu email</label>
          <input id="dgE" className={'dg-field' + (e.email ? ' bad' : '')} value={f.email}
            onChange={ev => set('email', ev.target.value)} autoComplete="email" inputMode="email"
            spellCheck={false} placeholder="donde te mandamos el informe" />
          {e.email && <div className="dg-err">{e.email}</div>}
        </div>
        <div className="campo">
          <label htmlFor="dgT">Tu teléfono</label>
          <input id="dgT" className={'dg-field' + (e.telefono ? ' bad' : '')} value={f.telefono}
            onChange={ev => set('telefono', ev.target.value)} autoComplete="tel" type="tel"
            inputMode="tel" placeholder="+34 600 00 00 00" />
          {e.telefono && <div className="dg-err">{e.telefono}</div>}
        </div>

        {error && <div className="dg-err" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="dg-nav" style={{ marginTop: 8 }}>
          <button className="dg-cta" type="submit" disabled={enviando}>
            {enviando ? 'Un segundo…' : 'Empezar el diagnóstico'}
          </button>
          <span className="dg-hint">7 minutos</span>
        </div>
      </form>
    </div>
  )
}

// ── Una pregunta ────────────────────────────────────────────────────────────
function Pregunta({ q, A, indice, total, onResponder, onAvanzar, onAtras }) {
  const necesitaBoton = q.type === 'multi' || q.type === 'text'
  const [texto, setTexto] = useState(A[q.id] || '')

  // Las de opción única avanzan solas tras un instante, para que se vea la
  // selección antes de cambiar de pantalla.
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const elegirUnica = (valor) => {
    onResponder(q.id, valor)
    timer.current = setTimeout(onAvanzar, 190)
  }

  const seleccion = q.type === 'multi' ? (A[q.id] || []) : [A[q.id]]

  return (
    <div className="dg-screen">
      <div className="dg-eyebrow">{SECTIONS[q.sec]} · pregunta {indice + 1} de {total}</div>
      <h2 className="dg-q">{textoDe(q, A)}</h2>
      {q.help && <p className="dg-help">{q.help}</p>}

      {q.type === 'scale' ? (
        <>
          <div className="dg-scale">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} className={A[q.id] === n ? 'sel' : ''} onClick={() => elegirUnica(n)}>{n}</button>
            ))}
          </div>
          <div className="dg-ends"><span>{q.ends[0]}</span><span>{q.ends[1]}</span></div>
        </>
      ) : q.type === 'text' ? (
        <textarea className="dg-field" value={texto} placeholder={q.placeholder || ''}
          onChange={e => setTexto(e.target.value)} autoFocus />
      ) : (
        <div className="dg-opts">
          {q.options.map((o, i) => (
            <button
              key={o.value}
              className={'dg-opt' + (seleccion.includes(o.value) ? ' sel' : '')}
              onClick={() => {
                if (q.type === 'multi') {
                  const cur = A[q.id] || []
                  onResponder(q.id, cur.includes(o.value) ? cur.filter(x => x !== o.value) : [...cur, o.value])
                } else {
                  elegirUnica(o.value)
                }
              }}
            >
              <span className="k">{q.type === 'multi' ? (seleccion.includes(o.value) ? '✓' : '') : String.fromCharCode(65 + i)}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="dg-nav">
        {necesitaBoton && (
          <button className="dg-cta" onClick={() => {
            if (q.type === 'text') onResponder(q.id, texto)
            onAvanzar()
          }}>Continuar</button>
        )}
        {onAtras && <button className="dg-back" onClick={onAtras}>← Atrás</button>}
        <span className="dg-hint">{q.type === 'multi' ? 'Puedes marcar varias' : q.type === 'text' ? 'Escribe y continúa' : 'Pulsa para responder'}</span>
      </div>
    </div>
  )
}

// Icono de descarga en SVG suelto: esta página es pública y autónoma, y no
// merece la pena arrastrarle una librería de iconos por una flecha.
function Descarga() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// ── Resultados ──────────────────────────────────────────────────────────────
function Resultados({ A, lead, onEnviado }) {
  const R = useMemo(() => compute(A), [A])
  const calif = useMemo(() => calificar(A, R), [A, R])
  const [web, setWeb] = useState('')
  const [rgpd, setRgpd] = useState(false)
  const [revision, setRevision] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [contador, setContador] = useState(0)
  const [anchos, setAnchos] = useState(false)

  // Cuenta atrás de la cifra y barras que se llenan. Se respeta la
  // preferencia de movimiento reducido del sistema.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setAnchos(true), 120)
    // Sin animación se salta directamente al final, pero en el siguiente
    // fotograma: llamar a setState dentro del cuerpo del efecto encadena
    // renders y el compilador de React lo marca.
    if (reduce) {
      const fin = requestAnimationFrame(() => setContador(R.total.max))
      return () => { clearTimeout(t); cancelAnimationFrame(fin) }
    }
    let raf, t0 = null
    const paso = (ts) => {
      if (!t0) t0 = ts
      const k = Math.min((ts - t0) / 1100, 1)
      setContador(R.total.max * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [R.total.max])

  const col = (v) => (v >= 67 ? 'var(--mint)' : v >= 40 ? 'var(--amber)' : 'var(--clay)')
  const terminado = contador >= R.total.max
  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  // El navegador genera el PDF con su propio «Guardar como PDF». El título del
  // documento es el nombre que propone al guardar, así que se cambia mientras
  // dura la impresión y se deja como estaba al terminar.
  function descargarPdf() {
    const previo = document.title
    const limpio = (lead?.nombre || 'informe').trim().replace(/\s+/g, '-').toLowerCase()
    document.title = `diagnostico-operativo-${limpio}`
    const restaurar = () => { document.title = previo; window.removeEventListener('afterprint', restaurar) }
    window.addEventListener('afterprint', restaurar)
    window.print()
  }

  async function enviar() {
    if (!rgpd) { setError('Necesitamos tu permiso para mandarte el informe.'); return }
    setEnviando(true); setError(null)
    try {
      await guardarDiagnostico(lead.clientId, lead.contactId, {
        A, R, calif, extra: { web, quiereRevision: revision },
      })
      onEnviado()
    } catch {
      // El lead ya está en el CRM desde la puerta: aunque esto falle, no se ha
      // perdido. Se le deja seguir en vez de bloquearle con un error técnico.
      onEnviado()
    }
  }

  return (
    <div className="dg-res">
      {/* Solo aparece en el PDF: sin esto, el informe impreso no dice de quién
          es ni de cuándo. */}
      <div className="dg-print-head">
        <h1>Diagnóstico operativo</h1>
        <div className="quien">
          <b>{lead?.nombre}</b> · {lead?.email} · {lead?.telefono}<br />
          {hoy}
        </div>
      </div>

      <div className="dg-eyebrow">Diagnóstico completado</div>

      <div className="dg-gauge">
        <div className="dg-money">
          <span>{terminado ? `${eur(R.total.min)} – ${eur(R.total.max)}` : eur(contador)}</span>
          <small>se escapan cada mes por procesos que se hacen a mano o no se hacen</small>
        </div>
        <div className="dg-year">
          Al año: <b>{eur(R.total.min * 12)} – {eur(R.total.max * 12)}</b>
          &nbsp;·&nbsp; rango estimado a partir de tus respuestas
        </div>
      </div>

      <div className="dg-idx">
        <div className="dg-card">
          <div className="dg-score" style={{ color: R.perfil.color }}>{R.idx}</div>
          <div className="dg-eyebrow" style={{ margin: '6px 0 0' }}>Índice de escalabilidad · sobre 100</div>
          <div className="dg-profile">{R.perfil.name}</div>
          <p style={{ fontSize: 13.5, color: 'var(--ivory-dim)', margin: 0 }}>{R.perfil.txt}</p>
        </div>
        <div className="dg-card">
          <div className="dg-dims">
            {Object.keys(DIMENSIONES).map(k => (
              <div className="dg-dim" key={k}>
                <span>{DIMENSIONES[k]}</span>
                <span className="dg-track">
                  <span className="dg-fill" style={{ width: anchos ? `${R.dims[k]}%` : 0, background: col(R.dims[k]) }} />
                </span>
                <span style={{ color: col(R.dims[k]), textAlign: 'right' }}>{R.dims[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="dg-h2">Dónde está la fuga</h3>
      <p className="dg-sub">Ordenadas por lo que cuestan. Cada una lleva lo que costaría taparla y en cuánto tiempo.</p>

      {R.leaks.length ? R.leaks.map((l, i) => (
        <div className={'dg-leak' + (i >= 5 ? ' extra' : '')} key={i}>
          <div className="dg-leak-area">{l.area}</div>
          <div className="dg-leak-top">
            <span className="dg-leak-name">{l.name}</span>
            <span className="dg-leak-eur">{eur(l.min)} – {eur(l.max)}/mes</span>
          </div>
          <p>{l.why}</p>
          <p className="fix"><b>Cómo se arregla.</b> {l.fix}</p>
          <div className="dg-tags">
            <span className="dg-tag">Esfuerzo {l.esf}</span>
            <span className="dg-tag">{l.plazo}</span>
          </div>
        </div>
      )) : (
        <div className="dg-leak dg-ok">
          <div className="dg-leak-top"><span className="dg-leak-name">No hemos encontrado fugas grandes</span></div>
          <p>Tu operativa está por encima de la media. El siguiente paso no es automatizar tareas sueltas, es construir capa de decisión sobre los datos que ya tienes ordenados.</p>
        </div>
      )}

      <div className="dg-note">
        <b>Cómo hemos calculado esto.</b> Partimos de tus propios números: ticket medio, volumen,
        margen y coste por hora. Aplicamos el extremo bajo de cada rango publicado y descontamos
        un 22 % en todo lo que mide tiempo, porque las mismas horas aparecen en varias fugas y no
        queremos contarlas dos veces. Es una estimación conservadora hecha con datos aproximados:
        sirve para decidir por dónde empezar, no para meterla en el presupuesto.
      </div>

      <button className="dg-pdf" onClick={descargarPdf}>
        <Descarga /> Descargar el informe en PDF
      </button>

      <div className="dg-print-foot">
        Informe generado automáticamente a partir de las respuestas de {lead?.nombre} el {hoy}.
        Las cifras son estimaciones por tramos, no una medición contable.
      </div>

      <div className="dg-capture">
        <h3 className="dg-h2" style={{ marginTop: 0 }}>Te mandamos el informe completo</h3>
        <p className="dg-sub" style={{ marginBottom: 16 }}>
          A <b>{lead?.email}</b>. Incluye el desglose de cada fuga, el orden de implantación
          recomendado y el punto en el que cada cosa se paga sola.
        </p>
        <input className="dg-field" value={web} onChange={e => setWeb(e.target.value)}
          placeholder="Web de tu negocio (opcional)" spellCheck={false} />
        <label className="dg-check">
          <input type="checkbox" checked={rgpd} onChange={e => setRgpd(e.target.checked)} />
          <span>Acepto que tratéis mis datos para enviarme el informe y contactarme sobre él.</span>
        </label>
        <label className="dg-check">
          <input type="checkbox" checked={revision} onChange={e => setRevision(e.target.checked)} />
          <span>Quiero además que reviséis mis respuestas y me digáis por cuál de las fugas empezaríais vosotros.</span>
        </label>
        {error && <div className="dg-err">{error}</div>}
        <button className="dg-cta" style={{ marginTop: 8 }} onClick={enviar} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar mi informe'}
        </button>
      </div>
    </div>
  )
}

function Gracias() {
  return (
    <div className="dg-screen dg-done">
      <div className="dg-eyebrow">Enviado</div>
      <h2 className="dg-q">Informe en camino.</h2>
      <p className="dg-help" style={{ margin: '0 auto' }}>
        Te llega al correo en unos minutos.
      </p>
    </div>
  )
}
