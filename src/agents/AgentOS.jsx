// Agent OS — /agents. El taller del operador.
//
// Cuatro pestañas y nada más: el corpus (donde se estudia qué funciona), las
// identidades (estilos de creador con todo su contexto), la memoria a largo
// plazo y el estado del agente que corre por detrás.
//
// Solo superadmin. El guardia de verdad está en el servidor (api/agents.js va
// con `wrap(..., { superadmin: true })`); esto de aquí solo evita enseñar una
// pantalla que luego daría 403 en cada llamada.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentsApi } from './api'
import Corpus from './Corpus'
import './agentos.css'

const PESTAÑAS = [
  { key: 'corpus',      label: 'Corpus' },
  { key: 'identidades', label: 'Identidades' },
  { key: 'memoria',     label: 'Memoria' },
  { key: 'estado',      label: 'Agente' },
]

export default function AgentOS() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('corpus')
  const [identidades, setIdentidades] = useState([])
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  useEffect(() => {
    // Sin sesión de superadmin no se entra. El servidor lo comprueba igual.
    if (!localStorage.getItem('bw_admin_jwt')) { navigate('/login', { replace: true }); return }
    agentsApi.identidades()
      .then(({ identidades }) => setIdentidades(identidades))
      .catch(e => setError(e.message))
      .finally(() => setListo(true))
  }, [navigate])

  const recargaIdentidades = () =>
    agentsApi.identidades().then(({ identidades }) => setIdentidades(identidades)).catch(() => {})

  return (
    <div className="ag">
      <header className="ag-top">
        <div>
          <h1>Agent OS</h1>
          <p>Tus identidades, tu corpus y lo que el agente aprende de ellos.</p>
        </div>
        <a className="ag-btn" href="/admin">Volver a HELM</a>
      </header>

      <nav className="ag-tabs" role="tablist">
        {PESTAÑAS.map(p => (
          <button
            key={p.key} role="tab" aria-selected={tab === p.key}
            className={`ag-tab${tab === p.key ? ' activa' : ''}`}
            onClick={() => setTab(p.key)}
          >{p.label}</button>
        ))}
      </nav>

      {error && <p className="ag-error">{error}</p>}
      {!listo ? <p className="ag-vacio">Cargando…</p> : (
        <>
          {tab === 'corpus' && <Corpus identidades={identidades} />}
          {tab === 'identidades' && <Identidades lista={identidades} onCambio={recargaIdentidades} />}
          {tab === 'memoria' && <Memoria identidades={identidades} />}
          {tab === 'estado' && <Estado />}
        </>
      )}
    </div>
  )
}

// ── Identidades ─────────────────────────────────────────────────────────────
// Un estilo de creador estudiado a fondo. `contexto` es el documento largo: es
// lo que se le inyecta al modelo para que escriba como esa persona, y lo que
// alimentará a la fábrica de guiones de HELM.

const VACIA = { nombre: '', descripcion: '', contexto: '', reglas_si: '', reglas_no: '' }

function Identidades({ lista, onCambio }) {
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const abrir = (i) => setForm(i ? {
    ...i,
    reglas_si: (i.reglas?.siempre || []).join('\n'),
    reglas_no: (i.reglas?.nunca || []).join('\n'),
  } : { ...VACIA })

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true); setError('')
    const lineas = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)
    try {
      await agentsApi.guardarIdentidad({
        id: form.id, nombre: form.nombre, descripcion: form.descripcion, contexto: form.contexto,
        reglas: { siempre: lineas(form.reglas_si), nunca: lineas(form.reglas_no) },
      })
      setForm(null); onCambio()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  async function borrar(i) {
    if (!confirm(`¿Borrar la identidad "${i.nombre}"? Los reels que tenga asociados se quedan, sin identidad.`)) return
    try { await agentsApi.borrarIdentidad(i.id); onCambio() } catch (e) { setError(e.message) }
  }

  if (form) {
    return (
      <form className="ag-card ag-form" onSubmit={guardar}>
        <h2>{form.id ? 'Editar identidad' : 'Nueva identidad'}</h2>
        {error && <p className="ag-error">{error}</p>}
        <label><span>Nombre</span>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Alex Hormozi" autoFocus required />
        </label>
        <label><span>En una línea</span>
          <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Directo, sin adornos, todo en números concretos" />
        </label>
        <label><span>Contexto</span>
          <small>Cómo hace los vídeos: estructura, ritmo, qué ganchos usa, cómo cierra. Cuanto más concreto, mejor escribe el modelo a su estilo.</small>
          <textarea rows={14} value={form.contexto} onChange={e => set('contexto', e.target.value)} />
        </label>
        <div className="ag-dos">
          <label><span>Siempre</span>
            <small>Una regla por línea.</small>
            <textarea rows={5} value={form.reglas_si} onChange={e => set('reglas_si', e.target.value)} placeholder={'Abre con una cifra\nFrases de menos de 12 palabras'} />
          </label>
          <label><span>Nunca</span>
            <small>Una regla por línea.</small>
            <textarea rows={5} value={form.reglas_no} onChange={e => set('reglas_no', e.target.value)} placeholder={'Metáforas largas\nPedir que sigan la cuenta'} />
          </label>
        </div>
        <div className="ag-form-pie">
          <button type="button" className="ag-btn" onClick={() => setForm(null)}>Cancelar</button>
          <button className="ag-btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    )
  }

  return (
    <div className="ag-lista">
      <div className="ag-lista-top">
        <p>Cada identidad guarda cómo trabaja un creador. El agente la usa para analizar sus reels, y la fábrica de guiones para escribir a su estilo.</p>
        <button className="ag-btn primario" onClick={() => abrir(null)}>Nueva identidad</button>
      </div>
      {error && <p className="ag-error">{error}</p>}
      {lista.length === 0 ? (
        <p className="ag-vacio">Todavía no hay ninguna. Empieza por la que más te interese estudiar.</p>
      ) : lista.map(i => (
        <article key={i.id} className="ag-card ag-ident">
          <div>
            <h3>{i.nombre}</h3>
            <p>{i.descripcion || <em>Sin descripción</em>}</p>
            <small>{i.contexto ? `${i.contexto.length} caracteres de contexto` : 'Sin contexto todavía'}</small>
          </div>
          <div className="ag-ident-acc">
            <button className="ag-btn sm" onClick={() => abrir(i)}>Editar</button>
            <button className="ag-btn sm peligro" onClick={() => borrar(i)}>Borrar</button>
          </div>
        </article>
      ))}
    </div>
  )
}

// ── Memoria ─────────────────────────────────────────────────────────────────

function Memoria({ identidades }) {
  const [notas, setNotas] = useState([])
  const [q, setQ] = useState('')
  const [nueva, setNueva] = useState('')
  const [ident, setIdent] = useState('')
  const [error, setError] = useState('')

  const cargar = () => agentsApi.memoria(q).then(({ memoria }) => setNotas(memoria)).catch(e => setError(e.message))
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar(e) {
    e.preventDefault()
    if (!nueva.trim()) return
    try {
      await agentsApi.guardarNota({ contenido: nueva, identityId: ident || null })
      setNueva(''); cargar()
    } catch (e) { setError(e.message) }
  }

  const nombreDe = (id) => identidades.find(i => i.id === id)?.nombre

  return (
    <div className="ag-lista">
      <form className="ag-card ag-form" onSubmit={guardar}>
        <label><span>Recordar algo</span>
          <small>Lo que el agente debe tener presente entre sesiones: una conclusión, una regla que funciona, algo que no repetir.</small>
          <textarea rows={3} value={nueva} onChange={e => setNueva(e.target.value)} />
        </label>
        <div className="ag-form-pie">
          <select value={ident} onChange={e => setIdent(e.target.value)} aria-label="Identidad">
            <option value="">Memoria general</option>
            {identidades.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <button className="ag-btn primario" disabled={!nueva.trim()}>Guardar</button>
        </div>
      </form>

      <input className="ag-buscar" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en la memoria…" />
      {error && <p className="ag-error">{error}</p>}
      {notas.length === 0 ? <p className="ag-vacio">Nada guardado todavía.</p> : notas.map(n => (
        <article key={n.id} className="ag-card ag-nota-it">
          <div>
            {n.identity_id && <span className="ag-tema">{nombreDe(n.identity_id) || 'Identidad borrada'}</span>}
            <p>{n.contenido}</p>
            <small>{new Date(n.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</small>
          </div>
          <button className="ag-btn sm peligro" onClick={async () => { await agentsApi.borrarNota(n.id); cargar() }}>Borrar</button>
        </article>
      ))}
    </div>
  )
}

// ── Estado del agente ───────────────────────────────────────────────────────

function Estado() {
  const [e, setE] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const tira = () => agentsApi.estado().then(setE).catch(x => setError(x.message))
    tira()
    const t = setInterval(tira, 5000)
    return () => clearInterval(t)
  }, [])

  if (error) return <p className="ag-error">{error}</p>
  if (!e) return <p className="ag-vacio">Cargando…</p>

  const corriendo = e.jobs.filter(j => j.estado === 'corriendo').length
  const enCola = e.jobs.filter(j => j.estado === 'pendiente').length
  const fallidos = e.jobs.filter(j => j.estado === 'error').length

  return (
    <div className="ag-lista">
      <div className="ag-kpis">
        {[['En el corpus', e.total], ['Listos', e.reels.etiquetado || 0],
          ['En cola', enCola], ['Trabajando', corriendo], ['Con error', fallidos]].map(([lb, v]) => (
          <div key={lb} className="ag-card ag-kpi"><span>{lb}</span><b>{v}</b></div>
        ))}
      </div>

      <div className="ag-card ag-tabla-caja">
        <h3>Últimos trabajos</h3>
        {e.jobs.length === 0 ? <p className="ag-vacio">El agente no ha tenido nada que hacer todavía.</p> : (
          <table className="ag-tabla">
            <thead><tr><th>Paso</th><th>Estado</th><th className="num">Intentos</th><th>Detalle</th></tr></thead>
            <tbody>
              {e.jobs.slice(0, 20).map(j => (
                <tr key={j.id}>
                  <td>{j.tipo}</td>
                  <td><span className={`ag-estado ${j.estado === 'hecho' ? 'ok' : j.estado === 'error' ? 'mal' : 'espera'}`}>{j.estado}</span></td>
                  <td className="num">{j.intentos}</td>
                  <td className="ag-detalle">{j.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
