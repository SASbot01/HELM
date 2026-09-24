// Agent OS — el material compartido: identidades y memoria.
//
// No son agentes. Son de lo que comen los agentes: la identidad da el estilo
// con el que se escribe, y la memoria lo que no hay que volver a descubrir.
import { useEffect, useState } from 'react'
import { agentsApi } from './api'

// ── Identidades ─────────────────────────────────────────────────────────────

const VACIA = { nombre: '', descripcion: '', contexto: '', reglas_si: '', reglas_no: '' }

export function Identidades({ lista, onCambio }) {
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
          <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Directo, sin adornos, todo en cifras concretas" />
        </label>
        <label><span>Contexto</span>
          <small>Cómo hace los vídeos: estructura, ritmo, qué ganchos usa, cómo cierra. Cuanto más concreto, mejor escribe el modelo a su estilo.</small>
          <textarea rows={14} value={form.contexto} onChange={e => set('contexto', e.target.value)} />
        </label>
        <div className="ag-dos">
          <label><span>Siempre</span>
            <small>Una regla por línea.</small>
            <textarea rows={5} value={form.reglas_si} onChange={e => set('reglas_si', e.target.value)} placeholder={'Abrir con una cifra\nFrases de menos de 12 palabras'} />
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
        <p>Cada identidad guarda cómo trabaja un creador. El analista la usa para leer sus reels con sus ojos, y el escritor de guiones para escribir a su estilo.</p>
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

export function Memoria({ identidades }) {
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
