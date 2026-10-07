// Agent OS — la ficha de un creador: todo lo recopilado de él en un sitio.
//
// Quién es y cómo trabaja, en qué perfiles de HELM se usa, lo aprendido
// (memoria) y sus reels de más a menos vistas. Un reel se abre ahí mismo con
// su guion frase a frase. La usan /agents (con `admin`: se puede editar cada
// reel) y la sección Agentes de un perfil (solo lectura).
import { Fragment, useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ExternalLink } from 'lucide-react'
import { gancho, ESTADOS, fecha, nf, compacto } from './ganchos'
import { Guion } from './Piezas'

const TIPOS = { viralidad: 'Viralidad', conversion: 'Conversión', autoridad: 'Autoridad', venta: 'Venta' }
import { Detalle } from './Corpus'
import { agentsApi } from './api'

export default function Ficha({ cargar, onVolver, volverLabel, admin, identidades }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [editando, setEditando] = useState(null)

  const recarga = () => cargar().then(setDatos).catch(e => setError(e.message))
  useEffect(() => { recarga() }, [cargar]) // eslint-disable-line react-hooks/exhaustive-deps

  const volver = (
    <button type="button" className="ag-volver" onClick={onVolver}>
      <ArrowLeft size={14} strokeWidth={2.2} /> {volverLabel}
    </button>
  )
  if (error) return <header className="ag-top dentro"><div>{volver}<h1>No se ha podido abrir</h1><p>{error}</p></div></header>
  if (!datos) return <p className="ag-vacio">Cargando…</p>

  const { identidad: i, reels, memoria, perfiles } = datos
  const listos = reels.filter(r => r.estado === 'etiquetado')
  // El gancho que más repite, entre los reels ya analizados.
  const cuenta = {}
  for (const r of listos) { const g = r.etiquetas?.tipo_gancho; if (g) cuenta[g] = (cuenta[g] || 0) + 1 }
  const [top] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])
  const maxVistas = Math.max(0, ...reels.map(r => Number(r.metricas?.vistas) || 0))
  const siempre = i.reglas?.siempre || []
  const nunca = i.reglas?.nunca || []

  return (
    <>
      <header className="ag-top dentro">
        <div className="ag-ficha-cab">
          {volver}
          <div className="ag-ficha-quien">
            <span className="ag-avatar grande" aria-hidden="true">{i.nombre.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase()}</span>
            <div>
              <h1>{i.nombre}</h1>
              <p>{i.descripcion || 'Sin descripción'}</p>
              <div className="ag-chips">
                {i.categoria && <span className="ag-tema">{i.categoria}</span>}
                {perfiles.map(p => <span key={p.slug} className="ag-tema">{p.name}</span>)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="ag-lista">
        {admin && <PerfilesDelCreador identityId={i.id} onCambio={recarga} />}

        <div className="ag-kpis">
          <div className="ag-card ag-kpi"><span>Reels</span><b>{reels.length}</b></div>
          <div className="ag-card ag-kpi"><span>Analizados</span><b>{listos.length}</b></div>
          <div className="ag-card ag-kpi"><span>El más visto</span><b>{maxVistas ? compacto(maxVistas) : '—'}</b></div>
          <div className="ag-card ag-kpi"><span>Gancho más usado</span><b className="txt">{top ? gancho(top[0]).label : '—'}</b></div>
        </div>

        <section className="ag-card ag-tabla-caja">
          <h3>Reels, de más a menos vistas</h3>
          {reels.length ? (
            <table className="ag-tabla ag-tabla-reels">
              <thead>
                <tr><th>Reel</th><th>Tipo</th><th>Gancho</th><th>Tema</th><th className="num">Vistas</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {reels.map(r => {
                  const g = gancho(r.etiquetas?.tipo_gancho)
                  const e = ESTADOS[r.estado] || { txt: r.estado, tono: 'espera' }
                  const abiertoEste = abierto === r.id
                  return (
                    <Fragment key={r.id}>
                      <tr className={abiertoEste ? 'abierta' : ''} onClick={() => setAbierto(abiertoEste ? null : r.id)}>
                        <td>
                          <span className="ag-reel-tit">
                            <ChevronDown size={14} className="ag-flecha" aria-hidden="true" />
                            {r.caption?.split('\n')[0].slice(0, 60) || 'Reel sin texto'}
                          </span>
                          <small>{fecha(r.publicado_en || r.created_at)}</small>
                        </td>
                        <td>{r.etiquetas?.tipo ? <span className={`ag-tipo t-${r.etiquetas.tipo}`}>{TIPOS[r.etiquetas.tipo]}</span> : '—'}</td>
                        <td>
                          {r.etiquetas?.formato === 'b-roll + frase en pantalla'
                            ? <span className="ag-aviso">Frase en pantalla</span>
                            : <><span className="ag-punto" style={{ background: g.color }} /> {g.label}</>}
                        </td>
                        <td>{r.etiquetas?.tema || '—'}</td>
                        <td className="num">{Number.isFinite(Number(r.metricas?.vistas)) ? nf.format(r.metricas.vistas) : '—'}</td>
                        <td><span className={`ag-estado ${e.tono}`}>{e.txt}</span></td>
                        <td className="num" onClick={ev => ev.stopPropagation()}>
                          <a className="ag-btn sm" href={r.url} target="_blank" rel="noreferrer" title="Ver en Instagram">
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                      {abiertoEste && (
                        <tr className="ag-reel-guion">
                          <td colSpan={7}>
                            <div>
                              {r.etiquetas?.estructura && <p className="ag-cta"><b>Estructura:</b> {r.etiquetas.estructura}</p>}
                              {r.etiquetas?.cta && <p className="ag-cta"><b>Pide al final:</b> {r.etiquetas.cta}</p>}
                              <Guion reel={r} />
                              {!r.frases?.length && !r.transcripcion && (
                                <p className="ag-nota">{r.estado === 'error' ? `No se pudo analizar: ${r.error}` : 'Aún se está analizando.'}</p>
                              )}
                              {admin && (
                                <button type="button" className="ag-btn sm" onClick={() => setEditando(r.id)}>
                                  Editar reel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          ) : <p className="ag-vacio">Todavía no hay reels de {i.nombre}.</p>}
        </section>

        <div className="ag-dos ag-ficha-info">
          <section className="ag-card ag-ficha-bloque">
            <h2>Quién es y cómo trabaja</h2>
            {i.contexto
              ? <p className="ag-ficha-texto">{i.contexto}</p>
              : <p className="ag-aviso">Sin contexto todavía.</p>}
            {siempre.length > 0 && <><h3>Siempre</h3><ul>{siempre.map(x => <li key={x}>{x}</li>)}</ul></>}
            {nunca.length > 0 && <><h3>Nunca</h3><ul>{nunca.map(x => <li key={x}>{x}</li>)}</ul></>}
          </section>

          <section className="ag-card ag-ficha-bloque">
            <h2>Lo aprendido</h2>
            {memoria.length ? memoria.map(n => (
              <div key={n.id} className="ag-nota-it">
                <p>{n.contenido}</p>
                <small>{fecha(n.updated_at)}</small>
              </div>
            )) : <p className="ag-aviso">Aún nada. Claude guarda aquí lo que aprende al analizar a {i.nombre}.</p>}
          </section>
        </div>
      </div>

      {editando && (
        <Detalle id={editando} identidades={identidades} onCerrar={() => setEditando(null)} onCambio={recarga} />
      )}
    </>
  )
}

// En qué perfiles de HELM está este creador, para marcarlos aquí mismo. Solo
// en /agents: api/agents.js exige superadmin. Se guarda al marcar.
function PerfilesDelCreador({ identityId, onCambio }) {
  const [perfiles, setPerfiles] = useState(null)
  const [marcados, setMarcados] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    agentsApi.identidadPerfiles(identityId)
      .then(r => { setPerfiles(r.perfiles); setMarcados(r.clientIds) })
      .catch(e => setError(e.message))
  }, [identityId])

  async function alterna(id) {
    const nuevos = marcados.includes(id) ? marcados.filter(x => x !== id) : [...marcados, id]
    setBusy(true); setError('')
    try { setMarcados((await agentsApi.guardarIdentidadPerfiles(identityId, nuevos)).clientIds); onCambio() }
    catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <section className="ag-card ag-elegir">
      <header>
        <b>Perfiles de HELM que usan este creador</b>
        <small className="ag-aviso">Marca un perfil y Claude lo tendrá en cuenta al escribir para él.</small>
      </header>
      {error && <p className="ag-error">{error}</p>}
      {!perfiles ? <p className="ag-aviso">Cargando…</p> : (
        <div className="ag-elegir-lista">
          {perfiles.map(p => (
            <label key={p.id} className={marcados.includes(p.id) ? 'on' : ''}>
              <input type="checkbox" checked={marcados.includes(p.id)} disabled={busy} onChange={() => alterna(p.id)} />
              <span><b>{p.name}</b><small>/{p.slug}</small></span>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

