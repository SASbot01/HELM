// HELM — Radar: tecnología e ideas nuevas para investigar. Privado de silvestre.
//
// Un agente (api/_lib/radar.js) rastrea la red —Hacker News, arXiv, Reddit,
// Product Hunt, blogs de IA— una vez al día y a petición, elige lo emergente y
// lo convierte en ideas concretas para investigar, probar o contar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Radar as RadarIcon, RefreshCw, Sparkles, ExternalLink, Lightbulb, FlaskConical, Wrench, Cpu, TrendingUp, Zap } from 'lucide-react'
import { radarApi } from '../lib'
import { Empty } from '../ui'
import './radar.css'

const ICONO = { modelo: Cpu, herramienta: Wrench, investigacion: FlaskConical, tecnica: Zap, tendencia: TrendingUp }
const TEMA = { modelo: 'Modelo', herramienta: 'Herramienta', investigacion: 'Investigación', tecnica: 'Técnica', tendencia: 'Tendencia' }
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

export default function Radar({ clientId }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(
    () => radarApi.lista(clientId).then(d => { setDatos(d); setError(null) }).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    if (!datos?.corriendo) return
    const t = setTimeout(cargar, 5000)
    return () => clearTimeout(t)
  }, [datos, cargar])

  async function buscar() {
    setError(null)
    try {
      await radarApi.ahora(clientId)
      setDatos(d => ({ ...(d || {}), corriendo: true, fallo: '' }))
    } catch (e) { setError(e.message) }
  }

  const porDia = useMemo(() => {
    const m = new Map()
    for (const x of datos?.ideas || []) { if (!m.has(x.fecha)) m.set(x.fecha, []); m.get(x.fecha).push(x) }
    return [...m.entries()]
  }, [datos])

  if (error && !datos) return <Empty>{error}</Empty>
  if (!datos) return <Empty>Cargando el radar…</Empty>

  return (
    <div className="helm-radar">
      <header className="rd-cab">
        <p className="rd-cab-sub">Rastreo de IA, modelos y herramientas en Hacker News, arXiv, Reddit, Product Hunt y blogs. Una pasada al día, a las 7:00.</p>
        <button className="rd-btn" onClick={buscar} disabled={datos.corriendo}>
          {datos.corriendo ? <><RefreshCw size={16} className="rd-gira" /> Rastreando…</> : <><RadarIcon size={16} /> Buscar ahora</>}
        </button>
      </header>

      {error && <div className="rd-error">{error}</div>}
      {datos.fallo && !datos.corriendo && <div className="rd-error">El último intento falló: {datos.fallo}</div>}
      {datos.corriendo && (
        <div className="rd-corriendo"><Sparkles size={20} /><div><b>Rastreando la red…</b><span>Lee lo que se mueve y lo convierte en ideas. Un minuto; puedes salir y volver.</span></div></div>
      )}

      {!datos.ideas.length && !datos.corriendo && (
        <div className="rd-vacio">
          <RadarIcon size={40} />
          <h2>Pon el radar a buscar</h2>
          <p>Rastrea dónde asoma lo nuevo antes que en la prensa y te deja tecnología, modelos e ideas para investigar o para contar. Cada mañana a las 7:00, y cuando lo pidas.</p>
          <button className="rd-btn grande" onClick={buscar}><RadarIcon size={18} /> Buscar ahora</button>
        </div>
      )}

      {porDia.map(([fecha, ideas]) => (
        <section className="rd-dia" key={fecha}>
          <h3 className="rd-dia-tit">{fechaLarga(fecha)}</h3>
          <div className="rd-grid">
            {ideas.map(x => {
              const I = ICONO[x.tema] || TrendingUp
              return (
                <article className="rd-card" key={x.id}>
                  <div className="rd-card-cab">
                    <span className={`rd-chip ${x.tema}`}><I size={13} /> {TEMA[x.tema] || x.tema}</span>
                    {x.senal && <span className="rd-senal">{x.senal}</span>}
                  </div>
                  <h4>{x.titulo}</h4>
                  {x.que_es && <p className="rd-que">{x.que_es}</p>}
                  {x.por_que && <p className="rd-por"><b>Por qué.</b> {x.por_que}</p>}
                  {x.idea && <p className="rd-idea"><Lightbulb size={14} /> {x.idea}</p>}
                  <a className="rd-fuente" href={x.url} target="_blank" rel="noopener noreferrer">{x.fuente} <ExternalLink size={13} /></a>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
