// Silvestre IA — formulario de valor, página pública en /silvestreai/valor.
//
// Misma decisión que el diagnóstico de /primermap: los datos de contacto se
// piden ANTES del cuestionario. Quien abandona en la pregunta 4 se queda
// igualmente como lead en el CRM, que es la mitad del valor de una pieza así.
//
// El formulario tiene cuatro caras: la P6 elige rama y a partir de ahí solo se
// ven las 16 preguntas de ESA rama. Nadie contesta 64.
//
// Con ?lm=1 el cierre es el del lead magnet ("tienes el acceso listo") en vez
// del normal. Es el mismo formulario servido desde dos sitios distintos, no
// dos formularios.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { visibles, textoDe, ramaCorta } from './silvestreai/preguntas'
import { PAISES, PAIS_DEFECTO, telefonoValido } from './silvestreai/paises'
import { crearLead, guardarRespuestas, origenDeLaUrl } from './silvestreai/guardar'
import './silvestreai/valor.css'

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export default function SilvestreValor() {
  const [params] = useSearchParams()
  const leadMagnet = params.get('lm') === '1'

  const [fase, setFase] = useState('intro')    // intro | puerta | test | fin
  const [A, setA] = useState({})
  const [cursor, setCursor] = useState(0)
  const [historia, setHistoria] = useState([])
  const [lead, setLead] = useState(null)       // { contactId, ...datos } — contactId es la ficha firmada del servidor
  const [error, setError] = useState(null)

  const vis = useMemo(() => visibles(A), [A])
  const q = vis[cursor]

  // Marca propia en la pestaña: esto no es HELM para quien lo abre, y el
  // índice de la pregunta ayuda a quien deja la pestaña a medias.
  useEffect(() => {
    document.title = fase === 'test' && q
      ? `${cursor + 1}/${vis.length} · Silvestre IA`
      : 'Silvestre IA — Cuéntanos cómo funciona tu negocio'
  }, [fase, cursor, vis.length, q])

  const responder = (id, valor) => setA(a => ({ ...a, [id]: valor }))
  const avanzar = () => { setHistoria(h => [...h, cursor]); setCursor(c => c + 1) }
  const atras = () => { setCursor(historia.at(-1) ?? 0); setHistoria(h => h.slice(0, -1)) }

  // Al contestar la última pregunta se guarda todo y se pasa al cierre. Si el
  // guardado falla se avisa y se deja reintentar: no se le enseña el "gracias"
  // a alguien cuyo formulario no ha llegado.
  const terminado = fase === 'test' && !q && vis.length > 1
  const guardando = useRef(false)
  useEffect(() => {
    if (!terminado || !lead || guardando.current) return
    guardando.current = true
    guardarRespuestas(lead.contactId, { A, datos: { ...lead, leadMagnet } })
      .then(() => setFase('fin'))
      .catch(() => {
        guardando.current = false
        setError('No hemos podido enviar tus respuestas. Comprueba la conexión y vuelve a intentarlo.')
      })
  }, [terminado, lead, A, leadMagnet])

  const progreso = fase === 'puerta' ? 0 : fase === 'fin' ? 100 : (cursor / Math.max(vis.length, 1)) * 100

  return (
    <div className="sv-root">
      <div className="sv-shell">
        <aside className="sv-rail">
          <div className="sv-brand">
            Silvestre IA
            <b>Cuéntanos cómo<br />funciona tu negocio</b>
          </div>
          {/* El raíl cuenta preguntas, no bloques: la rama elegida decide
              cuántas quedan y eso sí es siempre cierto. */}
          <div className="sv-cuenta">
            {fase === 'test' && q ? (
              <>
                <b>{String(cursor + 1).padStart(2, '0')}</b>
                <span>de {String(vis.length).padStart(2, '0')}</span>
              </>
            ) : (
              <>
                <b>22</b>
                <span>preguntas</span>
              </>
            )}
          </div>
          {A.tipo && <div className="sv-rama">{ramaCorta(A.tipo)}</div>}
          <div className="sv-rail-foot">Tus datos no se comparten con nadie</div>
        </aside>

        <main className="sv-main">
          <div className="sv-bar" style={{ width: `${progreso}%` }} />

          {fase === 'intro' && <Intro onEmpezar={() => setFase('puerta')} />}

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

          {terminado && (
            <div className="sv-screen">
              <div className="sv-eyebrow">Enviando</div>
              <h2 className="sv-q">{error ? 'No ha salido' : 'Guardando tus respuestas…'}</h2>
              {error && (
                <>
                  <p className="sv-lead">{error}</p>
                  <div className="sv-nav">
                    <button className="sv-cta" onClick={() => { guardando.current = false; setError(null) }}>
                      Reintentar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {fase === 'fin' && <Cierre leadMagnet={leadMagnet} />}
        </main>
      </div>
    </div>
  )
}

// ── La entrada ──────────────────────────────────────────────────────────────
// Antes de pedir nada se explica qué es esto, cómo se trabaja y en qué se
// ayuda. Quien llega de un anuncio o de un enlace suelto no tiene por qué saber
// nada de Silvestre: pedirle el teléfono en la primera pantalla es pedirle un
// acto de fe.
//
// El texto es un primer borrador — está aquí suelto y a la vista justamente
// para que se reescriba sin tocar la lógica.
const PASOS = [
  {
    n: '01', t: 'Rellenas esto',
    d: 'Veintidós preguntas, tres minutos. Solo las que aplican a tu tipo de empresa: eliges el tuyo y el resto del formulario se adapta.',
  },
  {
    n: '02', t: 'Preparamos tu caso',
    d: 'Antes de hablar contigo miramos qué nos has contado y dónde se pierde tiempo o dinero en un negocio como el tuyo. La llamada no se va en ponernos al día.',
  },
  {
    n: '03', t: 'Te llamamos en 48 h',
    d: 'Una llamada para contarte qué haríamos, con qué orden y qué esperar. Sin compromiso: si no vemos encaje, te lo decimos.',
  },
]

function Intro({ onEmpezar }) {
  return (
    <div className="sv-screen">
      <div className="sv-eyebrow">Silvestre IA</div>
      <h1 className="sv-h1">Antes de hablar, queremos entender tu negocio</h1>
      <p className="sv-lead">
        Ayudamos a empresas como la tuya a quitarse de encima el trabajo repetitivo: automatizar
        procesos, conectar las herramientas que ya usas y analizar tus datos para poder
        entenderlos y mejorarlos. Este formulario es el primer paso.
      </p>

      <ol className="sv-pasos">
        {PASOS.map(p => (
          <li key={p.n}>
            <span className="sv-paso-n">{p.n}</span>
            <div>
              <b>{p.t}</b>
              <p>{p.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="sv-nav">
        <button className="sv-cta" onClick={onEmpezar}>Empezar formulario</button>
        <span className="sv-hint">22 preguntas · 3 minutos</span>
      </div>
    </div>
  )
}

// ── Bloque 1 · los datos, antes del cuestionario ────────────────────────────
function Puerta({ onEntrar }) {
  const [f, setF] = useState({ nombre: '', empresa: '', email: '', pais: PAIS_DEFECTO.code, tel: '', web: '' })
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const errores = {}
  if (f.nombre.trim().length < 2) errores.nombre = 'Dinos cómo te llamas'
  if (f.empresa.trim().length < 2) errores.empresa = 'El nombre de tu empresa'
  if (!RE_EMAIL.test(f.email.trim())) errores.email = 'Necesitamos un email válido para contactarte'
  if (!telefonoValido(f.tel)) errores.tel = 'Número no válido'
  const ok = Object.keys(errores).length === 0
  const e = tocado ? errores : {}

  const pais = PAISES.find(p => p.code === f.pais) || PAIS_DEFECTO

  async function entrar(ev) {
    ev.preventDefault()
    setTocado(true)
    setError(null)
    if (!ok) return
    setEnviando(true)
    try {
      const datos = {
        nombre: f.nombre,
        empresa: f.empresa,
        email: f.email,
        telefono: `${pais.dial} ${f.tel.trim()}`,
        web: f.web,
        pais: pais.code,
        // De qué anuncio o enlace viene. Se lee ahora y se arrastra: al
        // terminar, la URL ya no tiene por qué conservar los parámetros.
        origen: origenDeLaUrl(),
      }
      const contactId = await crearLead(datos)
      onEntrar({ contactId, ...datos })
    } catch (err) {
      setError(err.message || 'No se pudo enviar. Inténtalo de nuevo.')
      setEnviando(false)
    }
  }

  return (
    <div className="sv-screen">
      <div className="sv-eyebrow">Silvestre IA · 3 minutos</div>
      <h1 className="sv-h1">Cuéntanos cómo funciona tu negocio</h1>
      <p className="sv-lead">
        Veintidós preguntas para entender dónde estás y qué se puede automatizar. Con lo que
        respondas preparamos tu caso antes de hablar contigo, así la llamada no se va en
        ponernos al día.
      </p>

      <form className="sv-form" onSubmit={entrar} noValidate>
        <div className="sv-campo">
          <label htmlFor="svN">Nombre completo</label>
          <input id="svN" className={'sv-field' + (e.nombre ? ' bad' : '')} value={f.nombre}
            onChange={ev => set('nombre', ev.target.value)} autoComplete="name" placeholder="Cómo te llamas" />
          {e.nombre && <div className="sv-err">{e.nombre}</div>}
        </div>

        <div className="sv-campo">
          <label htmlFor="svC">Nombre de tu empresa</label>
          <input id="svC" className={'sv-field' + (e.empresa ? ' bad' : '')} value={f.empresa}
            onChange={ev => set('empresa', ev.target.value)} autoComplete="organization" placeholder="Cómo se llama" />
          {e.empresa && <div className="sv-err">{e.empresa}</div>}
        </div>

        <div className="sv-campo">
          <label htmlFor="svE">Email</label>
          <input id="svE" className={'sv-field' + (e.email ? ' bad' : '')} value={f.email}
            onChange={ev => set('email', ev.target.value)} autoComplete="email" inputMode="email"
            spellCheck={false} placeholder="donde te escribimos" />
          {e.email && <div className="sv-err">{e.email}</div>}
        </div>

        <div className="sv-campo">
          <label htmlFor="svT">Teléfono</label>
          <div className="sv-tel">
            <select value={f.pais} onChange={ev => set('pais', ev.target.value)} aria-label="Prefijo del país">
              {PAISES.map(p => (
                <option key={p.code} value={p.code}>{p.flag} {p.dial} {p.label}</option>
              ))}
            </select>
            <input id="svT" className={'sv-field' + (e.tel ? ' bad' : '')} value={f.tel}
              onChange={ev => set('tel', ev.target.value)} autoComplete="tel-national" type="tel"
              inputMode="tel" placeholder="600 00 00 00" />
          </div>
          {e.tel && <div className="sv-err">{e.tel}</div>}
        </div>

        <div className="sv-campo">
          <label htmlFor="svW">Instagram o web de tu empresa</label>
          <input id="svW" className="sv-field" value={f.web}
            onChange={ev => set('web', ev.target.value)} spellCheck={false}
            placeholder="@tuempresa o tuempresa.com" />
        </div>

        {error && <div className="sv-err">{error}</div>}

        <div className="sv-nav" style={{ marginTop: 8 }}>
          <button className="sv-cta" type="submit" disabled={enviando}>
            {enviando ? 'Un segundo…' : 'Empezar'}
          </button>
          <span className="sv-hint">22 preguntas · 3 minutos</span>
        </div>
      </form>
    </div>
  )
}

// ── Una pregunta ────────────────────────────────────────────────────────────
function Pregunta({ q, A, indice, total, onResponder, onAvanzar, onAtras }) {
  // Las de opción única avanzan solas tras un instante: se ve la selección
  // antes de cambiar de pantalla y no hace falta pulsar "siguiente" veintidós
  // veces. Las de texto libre necesitan su botón, claro.
  const timer = useRef(null)
  const [texto, setTexto] = useState(A[q.id] || '')
  useEffect(() => () => clearTimeout(timer.current), [])

  const elegir = (valor) => {
    onResponder(q.id, valor)
    timer.current = setTimeout(onAvanzar, 190)
  }

  return (
    <div className="sv-screen">
      <div className="sv-eyebrow">Pregunta {indice + 1} de {total}</div>
      <h2 className="sv-q">{textoDe(q, A)}</h2>
      {q.help && <p className="sv-help">{q.help}</p>}

      {q.type === 'text' ? (
        <textarea
          className="sv-field sv-textarea" rows={4} value={texto} autoFocus
          placeholder={q.placeholder || ''} maxLength={600}
          onChange={e => setTexto(e.target.value)} />
      ) : (
        <div className="sv-opts">
          {q.options.map((o, i) => (
            <button
              key={o.value}
              className={'sv-opt' + (A[q.id] === o.value ? ' sel' : '')}
              onClick={() => elegir(o.value)}
            >
              <span className="k">{String.fromCharCode(65 + i)}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sv-nav">
        {q.type === 'text' && (
          <button
            className="sv-cta" disabled={!texto.trim()}
            onClick={() => { onResponder(q.id, texto.trim()); onAvanzar() }}
          >
            Continuar
          </button>
        )}
        {onAtras && <button className="sv-back" onClick={onAtras}>← Atrás</button>}
        <span className="sv-hint">{q.type === 'text' ? 'Escribe y continúa' : 'Pulsa para responder'}</span>
      </div>
    </div>
  )
}

// ── El cierre ───────────────────────────────────────────────────────────────
// Dos textos, los del guion. El del lead magnet da por hecho que ya tiene el
// acceso; el normal, que la llamada está por agendar.
function Cierre({ leadMagnet }) {
  return (
    <div className="sv-fin">
      <div className="sv-tick" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="sv-h1">Gracias por completar el formulario.</h1>
      <p>
        {leadMagnet
          ? 'Tienes el acceso listo. En las próximas 48 horas nos pondremos en contacto contigo para ver si podemos ayudarte a ir más rápido.'
          : 'Hemos recibido tu información y en las próximas 48 horas nos pondremos en contacto contigo para agendar una llamada y analizar tu caso. Sin compromiso.'}
      </p>
      <div className="sv-plazo">Respuesta en menos de 48 h</div>
    </div>
  )
}
