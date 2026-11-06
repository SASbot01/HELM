// Detrás de Cámara — lead magnet "Chuleta de parámetros", página pública en /pdf.
//
// Es el mismo formulario que /silvestreai/valor (mismas preguntas, mismo estilo,
// misma mecánica de dos pasos), servido para Detrás de Cámara: el lead entra en
// el CRM del perfil detras-de-camra (embudo "Lead magnet") y, al terminar, se
// le da la Chuleta en PDF y el acceso a Skool.
import { useEffect, useMemo, useRef, useState } from 'react'
import { visibles, textoDe, ramaCorta } from './silvestreai/preguntas'
import { PAISES, PAIS_DEFECTO, telefonoValido } from './silvestreai/paises'
import { crearLead, guardarRespuestas, origenDeLaUrl } from './detras/guardar'
import './silvestreai/valor.css'

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

// El PDF que se entrega (Archivos del perfil detras-de-camra) y el acceso a la
// comunidad. Se dejan a la vista para cambiarlos sin tocar la lógica.
const CHULETA_URL = 'https://helm.s4sf.net/sb/storage/v1/object/public/helm/60d453ec-b88b-4ac4-8778-1e6048bf3e66/archivos/6u260z-chuleta-parametros.pdf'
const SKOOL_URL = 'https://www.skool.com/detrasdecamara-6780/about?ref=2f98f1e80d3543908dc2d2bfe1bc7b1a'

export default function DetrasPdf() {
  const [fase, setFase] = useState('intro')    // intro | puerta | test | fin
  const [A, setA] = useState({})
  const [cursor, setCursor] = useState(0)
  const [historia, setHistoria] = useState([])
  const [lead, setLead] = useState(null)
  const [error, setError] = useState(null)

  const vis = useMemo(() => visibles(A), [A])
  const q = vis[cursor]

  useEffect(() => {
    document.title = fase === 'test' && q
      ? `${cursor + 1}/${vis.length} · Detrás de Cámara`
      : 'Detrás de Cámara — Tu Chuleta de parámetros'
  }, [fase, cursor, vis.length, q])

  const responder = (id, valor) => setA(a => ({ ...a, [id]: valor }))
  const avanzar = () => { setHistoria(h => [...h, cursor]); setCursor(c => c + 1) }
  const atras = () => { setCursor(historia.at(-1) ?? 0); setHistoria(h => h.slice(0, -1)) }

  const terminado = fase === 'test' && !q && vis.length > 1
  const guardando = useRef(false)
  useEffect(() => {
    if (!terminado || !lead || guardando.current) return
    guardando.current = true
    guardarRespuestas(lead.contactId, { A, datos: { ...lead, leadMagnet: true } })
      .then(() => setFase('fin'))
      .catch(() => {
        guardando.current = false
        setError('No hemos podido enviar tus respuestas. Comprueba la conexión y vuelve a intentarlo.')
      })
  }, [terminado, lead, A])

  const progreso = fase === 'puerta' ? 0 : fase === 'fin' ? 100 : (cursor / Math.max(vis.length, 1)) * 100

  return (
    <div className="sv-root">
      <div className="sv-shell">
        <aside className="sv-rail">
          <div className="sv-brand">
            Detrás de Cámara
            <b>Chuleta de<br />parámetros</b>
          </div>
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

          {fase === 'fin' && <Cierre />}
        </main>
      </div>
    </div>
  )
}

const PASOS = [
  {
    n: '01', t: 'Rellenas esto',
    d: 'Unas preguntas rápidas para conocerte. Eliges tu tipo de negocio y el formulario se adapta: solo contestas lo tuyo.',
  },
  {
    n: '02', t: 'Te llevas la Chuleta',
    d: 'Al terminar te descargas la Chuleta de parámetros en PDF: qué diafragma, velocidad e ISO poner en cada situación.',
  },
  {
    n: '03', t: 'Entras a Skool',
    d: 'Y te damos el acceso a la comunidad de Detrás de Cámara, con las clases gratis para aprender de verdad.',
  },
]

function Intro({ onEmpezar }) {
  return (
    <div className="sv-screen">
      <div className="sv-eyebrow">Detrás de Cámara</div>
      <h1 className="sv-h1">Tu Chuleta de parámetros, gratis</h1>
      <p className="sv-lead">
        La guía rápida para saber qué ajustes poner en cada situación: retrato, paisaje, deporte,
        noche, barrido… Déjanos tus datos, cuéntanos un poco de ti y te la llevas, más el acceso a
        la comunidad en Skool.
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
        <button className="sv-cta" onClick={onEmpezar}>Quiero mi Chuleta</button>
        <span className="sv-hint">2 minutos · PDF + acceso a Skool</span>
      </div>
    </div>
  )
}

function Puerta({ onEntrar }) {
  const [f, setF] = useState({ nombre: '', empresa: '', email: '', pais: PAIS_DEFECTO.code, tel: '', web: '' })
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const errores = {}
  if (f.nombre.trim().length < 2) errores.nombre = 'Dinos cómo te llamas'
  if (f.empresa.trim().length < 2) errores.empresa = 'Tu proyecto, marca o empresa'
  if (!RE_EMAIL.test(f.email.trim())) errores.email = 'Necesitamos un email válido para enviarte la Chuleta'
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
      <div className="sv-eyebrow">Detrás de Cámara · 2 minutos</div>
      <h1 className="sv-h1">¿A dónde te mandamos la Chuleta?</h1>
      <p className="sv-lead">
        Déjanos tus datos para enviarte la Chuleta de parámetros y darte el acceso a la comunidad.
        Con lo que respondas después conocemos mejor a quién ayudamos.
      </p>

      <form className="sv-form" onSubmit={entrar} noValidate>
        <div className="sv-campo">
          <label htmlFor="svN">Nombre completo</label>
          <input id="svN" className={'sv-field' + (e.nombre ? ' bad' : '')} value={f.nombre}
            onChange={ev => set('nombre', ev.target.value)} autoComplete="name" placeholder="Cómo te llamas" />
          {e.nombre && <div className="sv-err">{e.nombre}</div>}
        </div>

        <div className="sv-campo">
          <label htmlFor="svC">Tu proyecto, marca o empresa</label>
          <input id="svC" className={'sv-field' + (e.empresa ? ' bad' : '')} value={f.empresa}
            onChange={ev => set('empresa', ev.target.value)} autoComplete="organization" placeholder="Cómo se llama" />
          {e.empresa && <div className="sv-err">{e.empresa}</div>}
        </div>

        <div className="sv-campo">
          <label htmlFor="svE">Email</label>
          <input id="svE" className={'sv-field' + (e.email ? ' bad' : '')} value={f.email}
            onChange={ev => set('email', ev.target.value)} autoComplete="email" inputMode="email"
            spellCheck={false} placeholder="donde te enviamos la Chuleta" />
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
          <label htmlFor="svW">Instagram o web</label>
          <input id="svW" className="sv-field" value={f.web}
            onChange={ev => set('web', ev.target.value)} spellCheck={false}
            placeholder="@tuperfil o tuweb.com" />
        </div>

        {error && <div className="sv-err">{error}</div>}

        <div className="sv-nav" style={{ marginTop: 8 }}>
          <button className="sv-cta" type="submit" disabled={enviando}>
            {enviando ? 'Un segundo…' : 'Empezar'}
          </button>
          <span className="sv-hint">Después, unas preguntas rápidas</span>
        </div>
      </form>
    </div>
  )
}

function Pregunta({ q, A, indice, total, onResponder, onAvanzar, onAtras }) {
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

// El cierre del lead magnet: la Chuleta en PDF y el acceso a Skool.
function Cierre() {
  return (
    <div className="sv-fin">
      <div className="sv-tick" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="sv-h1">¡Listo! Tu Chuleta ya es tuya.</h1>
      <p>
        Descárgala, guárdala en el móvil y tenla a mano en cada disparo. Y para aprender de verdad,
        entra a la comunidad de Detrás de Cámara en Skool: clases gratis y dudas resueltas.
      </p>
      <div className="sv-nav" style={{ gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
        <a className="sv-cta" href={CHULETA_URL} target="_blank" rel="noopener" download>
          ⤓ Descargar la Chuleta (PDF)
        </a>
        <a className="sv-cta" href={SKOOL_URL} target="_blank" rel="noopener"
          style={{ background: 'transparent', border: '1.5px solid currentColor' }}>
          Entrar a Skool →
        </a>
      </div>
      <div className="sv-plazo">Acceso inmediato · PDF + comunidad</div>
    </div>
  )
}
