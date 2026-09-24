// Agent OS — el corpus de reels: la gráfica y el guion etiquetado.
//
// Una sola gráfica con todos los reels, colocados por cuándo se publicaron y
// cómo funcionaron, con un color por tipo de gancho. Se pincha uno y se abre su
// guion frase a frase.
//
// Por qué dispersión y no barras: la pregunta no es "cuánto hizo cada reel"
// (eso sería un ranking) sino "qué tipo de gancho funciona". Eso se ve cuando
// los puntos de un color se agrupan arriba, y eso solo lo enseña una nube.
//
// Los reels sin números NO se dibujan: un punto en cero parece un fracaso
// medido cuando en realidad es un dato que falta. Se cuentan aparte, arriba.
import { useEffect, useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip,
} from 'recharts'
import { agentsApi } from './api'
import { GANCHOS, SIN_ETIQUETAR, gancho, ROLES, rol } from './ganchos'

const nf = new Intl.NumberFormat('es-ES')
const fecha = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'

const ESTADOS = {
  pendiente:      { txt: 'En cola',      tono: 'espera' },
  descargando:    { txt: 'Descargando',  tono: 'espera' },
  transcribiendo: { txt: 'Transcribiendo', tono: 'espera' },
  transcrito:     { txt: 'Transcrito',   tono: 'espera' },
  etiquetado:     { txt: 'Listo',        tono: 'ok' },
  error:          { txt: 'Error',        tono: 'mal' },
}

export default function Corpus({ identidades }) {
  const [reels, setReels] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtroIdent, setFiltroIdent] = useState('')
  const [ocultos, setOcultos] = useState(() => new Set())
  const [abierto, setAbierto] = useState(null)
  const [tabla, setTabla] = useState(false)
  const [pegar, setPegar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = async () => {
    try {
      setError('')
      const { reels } = await agentsApi.reels(filtroIdent)
      setReels(reels)
    } catch (e) { setError(e.message) } finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [filtroIdent])   // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras haya algo en marcha, se refresca solo: el worker tarda minutos y
  // nadie debería estar dándole a recargar.
  const enMarcha = reels.some(r => ['pendiente', 'descargando', 'transcribiendo', 'transcrito'].includes(r.estado))
  useEffect(() => {
    if (!enMarcha) return
    const t = setInterval(cargar, 8000)
    return () => clearInterval(t)
  }, [enMarcha, filtroIdent])   // eslint-disable-line react-hooks/exhaustive-deps

  async function añadir(e) {
    e.preventDefault()
    const urls = pegar.split('\n').map(s => s.trim()).filter(Boolean)
    if (!urls.length) return
    setGuardando(true); setAviso('')
    try {
      const r = await agentsApi.añadirReels({ urls, identityId: filtroIdent || null })
      setPegar('')
      setAviso(r.repetidos
        ? `${r.nuevos} en cola · ${r.repetidos} ya estaban`
        : `${r.nuevos} en cola`)
      cargar()
    } catch (e) { setAviso(e.message) } finally { setGuardando(false) }
  }

  const visibles = useMemo(
    () => reels.filter(r => !ocultos.has(gancho(r.etiquetas?.tipo_gancho).key)),
    [reels, ocultos],
  )

  // Solo entran en la nube los que tienen vistas de verdad.
  const puntos = useMemo(() => visibles
    .filter(r => Number.isFinite(Number(r.metricas?.vistas)) && Number(r.metricas.vistas) > 0)
    .map(r => ({
      id: r.id,
      x: r.publicado_en ? new Date(r.publicado_en).getTime() : new Date(r.created_at).getTime(),
      y: Number(r.metricas.vistas),
      g: gancho(r.etiquetas?.tipo_gancho),
      reel: r,
    })), [visibles])

  const sinNumeros = visibles.length - puntos.length

  // Qué ganchos aparecen de verdad: la leyenda no enseña categorías vacías.
  const presentes = useMemo(() => {
    const vistos = new Set(reels.map(r => gancho(r.etiquetas?.tipo_gancho).key))
    const lista = GANCHOS.filter(g => vistos.has(g.key))
    if (vistos.has(SIN_ETIQUETAR.key)) lista.push(SIN_ETIQUETAR)
    return lista
  }, [reels])

  const alterna = (k) => setOcultos(prev => {
    const s = new Set(prev)
    s.has(k) ? s.delete(k) : s.add(k)
    return s
  })

  return (
    <div className="ag-corpus">
      {/* ── Pegar enlaces ────────────────────────────────────────────── */}
      <form className="ag-card ag-pegar" onSubmit={añadir}>
        <label htmlFor="ag-urls">
          <b>Pega los enlaces</b>
          <span>Uno por línea. El agente descarga el audio, lo transcribe y lo etiqueta.</span>
        </label>
        <textarea
          id="ag-urls" rows={3} value={pegar} onChange={e => setPegar(e.target.value)}
          placeholder={'https://www.instagram.com/reel/…\nhttps://www.instagram.com/reel/…'}
        />
        <div className="ag-pegar-pie">
          {aviso && <span className="ag-aviso">{aviso}</span>}
          <button className="ag-btn primario" disabled={guardando || !pegar.trim()}>
            {guardando ? 'Encolando…' : 'Añadir al corpus'}
          </button>
        </div>
      </form>

      {/* ── Filtros ──────────────────────────────────────────────────── */}
      <div className="ag-filtros">
        <select value={filtroIdent} onChange={e => setFiltroIdent(e.target.value)} aria-label="Identidad">
          <option value="">Todas las identidades</option>
          {identidades.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
        </select>
        <span className="ag-cuenta">
          {reels.length} {reels.length === 1 ? 'reel' : 'reels'}
          {sinNumeros > 0 && <> · <b>{sinNumeros} sin números todavía</b></>}
        </span>
        <button type="button" className="ag-btn" onClick={() => setTabla(t => !t)}>
          {tabla ? 'Ver la gráfica' : 'Ver la tabla'}
        </button>
      </div>

      {error && <p className="ag-error">{error}</p>}

      {/* ── Leyenda ──────────────────────────────────────────────────── */}
      {presentes.length > 0 && (
        <div className="ag-leyenda">
          {presentes.map(g => (
            <button
              key={g.key || 'sin'} type="button"
              className={`ag-leyenda-it${ocultos.has(g.key) ? ' apagado' : ''}`}
              onClick={() => alterna(g.key)}
              aria-pressed={!ocultos.has(g.key)}
            >
              <span className="ag-punto" style={{ background: g.color }} />
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* ── La gráfica ───────────────────────────────────────────────── */}
      {!tabla && (
        <div className="ag-card ag-grafica">
          {cargando ? <p className="ag-vacio">Cargando…</p>
            : puntos.length === 0 ? (
              <p className="ag-vacio">
                Todavía no hay ningún reel con números. Pega enlaces arriba y, cuando
                el agente acabe, escribe sus vistas en la tabla.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <ScatterChart margin={{ top: 12, right: 20, bottom: 28, left: 12 }}>
                  <CartesianGrid stroke="rgba(28,29,25,0.08)" strokeDasharray="0" vertical={false} />
                  <XAxis
                    type="number" dataKey="x" domain={['dataMin - 86400000', 'dataMax + 86400000']}
                    tickFormatter={fecha} name="Publicado"
                    tick={{ fill: '#82857B', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(28,29,25,0.14)' }} tickLine={false}
                  />
                  <YAxis
                    type="number" dataKey="y" name="Vistas"
                    tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v}
                    tick={{ fill: '#82857B', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={48}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(28,29,25,0.18)', strokeWidth: 1 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload
                      return (
                        <div className="ag-tooltip">
                          <span className="ag-punto" style={{ background: p.g.color }} />
                          <b>{p.g.label}</b>
                          {p.reel.etiquetas?.tema && <span>{p.reel.etiquetas.tema}</span>}
                          <em>{nf.format(p.y)} vistas · {fecha(p.x)}</em>
                          {p.reel.caption && <span className="rec">{p.reel.caption.slice(0, 80)}</span>}
                        </div>
                      )
                    }}
                  />
                  <Scatter
                    data={puntos}
                    shape={(p) => (
                      <circle
                        cx={p.cx} cy={p.cy} r={7}
                        fill={p.payload.g.color}
                        stroke="#FFFFFF" strokeWidth={2}
                        style={{ cursor: 'pointer' }}
                      />
                    )}
                    onClick={(p) => setAbierto(p?.payload?.reel?.id || null)}
                  >
                    {puntos.map(p => <Cell key={p.id} fill={p.g.color} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          {puntos.length > 0 && (
            <p className="ag-pie-grafica">
              Cada punto es un reel: a la derecha los más recientes, arriba los más vistos.
              Pincha uno para leer su guion.
            </p>
          )}
        </div>
      )}

      {/* ── La tabla (la misma información, legible sin color) ───────── */}
      {tabla && (
        <div className="ag-card ag-tabla-caja">
          <table className="ag-tabla">
            <thead>
              <tr>
                <th>Reel</th><th>Gancho</th><th>Tema</th>
                <th className="num">Vistas</th><th>Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {visibles.map(r => {
                const g = gancho(r.etiquetas?.tipo_gancho)
                const e = ESTADOS[r.estado] || { txt: r.estado, tono: 'espera' }
                return (
                  <tr key={r.id}>
                    <td>
                      <button type="button" className="ag-link" onClick={() => setAbierto(r.id)}>
                        {r.caption?.slice(0, 54) || r.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 54)}
                      </button>
                      <small>{fecha(r.publicado_en || r.created_at)}</small>
                    </td>
                    <td><span className="ag-punto" style={{ background: g.color }} /> {g.label}</td>
                    <td>{r.etiquetas?.tema || '—'}</td>
                    <td className="num">{Number.isFinite(Number(r.metricas?.vistas)) ? nf.format(r.metricas.vistas) : '—'}</td>
                    <td><span className={`ag-estado ${e.tono}`}>{e.txt}</span></td>
                    <td>
                      {r.estado === 'error' && (
                        <button type="button" className="ag-btn sm" onClick={async () => { await agentsApi.reintentar(r.id); cargar() }}>
                          Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {abierto && (
        <Detalle id={abierto} identidades={identidades} onCerrar={() => setAbierto(null)} onCambio={cargar} />
      )}
    </div>
  )
}

// ── El guion etiquetado ─────────────────────────────────────────────────────

function Detalle({ id, identidades, onCerrar, onCambio }) {
  const [reel, setReel] = useState(null)
  const [error, setError] = useState('')
  const [m, setM] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    agentsApi.reel(id)
      .then(({ reel }) => { if (!vivo) return; setReel(reel); setM(reel.metricas || {}) })
      .catch(e => vivo && setError(e.message))
    return () => { vivo = false }
  }, [id])

  async function guardaMetricas() {
    setGuardando(true)
    try { await agentsApi.metricas({ id, ...m }); onCambio() }
    catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const g = reel ? gancho(reel.etiquetas?.tipo_gancho) : SIN_ETIQUETAR

  return (
    <div className="ag-panel-fondo" onClick={onCerrar} role="presentation">
      <aside className="ag-panel" onClick={e => e.stopPropagation()} aria-label="Guion del reel">
        <header>
          <div>
            <span className="ag-punto grande" style={{ background: g.color }} />
            <b>{g.label}</b>
            {reel?.etiquetas?.tema && <span className="ag-tema">{reel.etiquetas.tema}</span>}
          </div>
          <button type="button" className="ag-btn sm" onClick={onCerrar}>Cerrar</button>
        </header>

        {error && <p className="ag-error">{error}</p>}
        {!reel ? <p className="ag-vacio">Cargando…</p> : (
          <div className="ag-panel-cuerpo">
            <a className="ag-url" href={reel.url} target="_blank" rel="noreferrer">{reel.url}</a>

            {/* De quién es este reel. Los que se pegan sin filtro entran sin
                identidad, y sin ella el agente lo analiza en abstracto. */}
            <label className="ag-asigna">
              <span>Identidad</span>
              <select
                value={reel.identity_id || ''}
                onChange={async (e) => {
                  const identityId = e.target.value || null
                  setReel(r => ({ ...r, identity_id: identityId }))
                  try { await agentsApi.etiquetas({ id, identityId }); onCambio() }
                  catch (err) { setError(err.message) }
                }}
              >
                <option value="">Sin asignar</option>
                {identidades.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </label>

            {reel.estado !== 'etiquetado' && (
              <p className="ag-nota">
                {reel.estado === 'error'
                  ? <>El agente no pudo con este: {reel.error}</>
                  : <>El agente está en ello ({ESTADOS[reel.estado]?.txt.toLowerCase()}). El guion aparece cuando acabe.</>}
              </p>
            )}

            {/* Los números, a mano mientras no haya importación automática. */}
            <div className="ag-metricas">
              {[['vistas', 'Vistas'], ['likes', 'Likes'], ['comentarios', 'Comentarios'], ['compartidos', 'Compartidos'], ['guardados', 'Guardados']].map(([k, lb]) => (
                <label key={k}>
                  <span>{lb}</span>
                  <input
                    type="number" min="0" inputMode="numeric"
                    value={m[k] ?? ''} onChange={e => setM(v => ({ ...v, [k]: e.target.value }))}
                  />
                </label>
              ))}
              <button type="button" className="ag-btn primario" onClick={guardaMetricas} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar números'}
              </button>
            </div>

            {reel.etiquetas?.cta && (
              <p className="ag-cta"><b>Pide al final:</b> {reel.etiquetas.cta}</p>
            )}

            {/* El guion, frase a frase, con su papel al margen. */}
            {reel.frases?.length > 0 && (
              <>
                <div className="ag-roles">
                  {ROLES.map(r => (
                    <span key={r.key}><i style={{ background: r.color }} />{r.label}</span>
                  ))}
                </div>
                <ol className="ag-guion">
                  {reel.frases.map((f, i) => {
                    const r = rol(f.rol)
                    return (
                      <li key={i} className={`rol-${r.key}`}>
                        <span className="ag-rol" style={{ background: r.color }} aria-label={r.label} />
                        <span className="ag-frase">{f.texto}</span>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}

            {!reel.frases?.length && reel.transcripcion && (
              <p className="ag-transcripcion">{reel.transcripcion}</p>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
