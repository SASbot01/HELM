// HELM — Editor de reels. La ventana del agente editor dentro de Agentes.
//
// El motor de render está en construcción; lo que esta pantalla hace HOY es
// enseñar el proceso en vivo: pulsas «Probar el proceso» (o entra un vídeo por
// el conector de Claude o por Drive) y se ven los pasos que sigue el agente,
// paso a paso, tal como quedan en el registro de ejecuciones.
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Play, RefreshCw, ChevronRight, Plug, FolderSync } from 'lucide-react'
import { agentsApi } from './api'
import './editorReel.css'

const ESTADO = {
  pendiente: { lb: 'En cola', t: 'espera' }, corriendo: { lb: 'Corriendo', t: 'vivo' },
  hecho: { lb: 'Hecho', t: 'ok' }, error: { lb: 'Error', t: 'mal' }, saltado: { lb: 'Saltado', t: 'espera' },
}
const activo = (e) => ['corriendo', 'pendiente'].includes(e.estado)
const fecha = (t) => { try { return new Date(t).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const hhmmss = (t) => { try { return new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return '' } }

export default function EditorReel({ clientId, client, onVolver }) {
  const [runs, setRuns] = useState(null)
  const [error, setError] = useState('')
  const [lanzando, setLanzando] = useState(false)
  const [abierta, setAbierta] = useState(null)

  const cargar = useCallback(
    () => agentsApi.equipo(clientId)
      .then(d => setRuns((d.ejecuciones || []).filter(e => e.agente === 'editor')
        .sort((a, b) => new Date(b.empezado_en) - new Date(a.empezado_en))))
      .catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])
  // Refresco en vivo mientras algo corre.
  useEffect(() => {
    if (!runs?.some(activo)) return
    const t = setInterval(cargar, 1500)
    return () => clearInterval(t)
  }, [runs, cargar])

  async function probar() {
    setLanzando(true); setError('')
    try { await agentsApi.equipoLanzar({ clientId, agente: 'editor' }); setAbierta('_top'); setTimeout(cargar, 700) }
    catch (e) { setError(e.message) }
    setLanzando(false)
  }

  const corriendo = runs?.some(activo)

  return (
    <div className="ag embebido">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Agentes</button>
          <h1>Editor de reels <span className="ed-badge">En construcción</span></h1>
          <p>
            Cuando entra un vídeo de {client?.name || 'este perfil'} —por el conector de Claude o por la carpeta de
            Drive— el editor sigue tu manual paso a paso. Aquí se ve el proceso en vivo. El motor de render (ffmpeg y
            composición) está en construcción.
          </p>
        </div>
      </header>

      <section className="ed-vias">
        <div className="ed-via"><Plug size={16} /><div><b>Por el conector (MCP)</b><small>Lo edita Claude con tu suscripción, usando el manual guardado en la memoria de HELM.</small></div></div>
        <div className="ed-via"><FolderSync size={16} /><div><b>Por la carpeta de Drive</b><small>Lo hace HELM solo, como equipo de agentes.</small></div></div>
      </section>

      <div className="ed-acciones">
        <button type="button" className="ag-btn primario" onClick={probar} disabled={lanzando || corriendo}>
          <Play size={15} /> {lanzando ? 'Lanzando…' : corriendo ? 'En marcha…' : 'Probar el proceso'}
        </button>
        <button type="button" className="ag-btn sm" onClick={cargar}><RefreshCw size={14} /> Actualizar</button>
      </div>
      {error && <p className="ag-error">{error}</p>}

      {runs === null ? <p className="ag-vacio">Cargando…</p>
        : !runs.length ? <p className="ag-vacio">Todavía no ha corrido. Pulsa «Probar el proceso» y verás los pasos en vivo.</p>
          : (
            <ol className="ed-runs">
              {runs.map((e, idx) => {
                const est = ESTADO[e.estado] || ESTADO.hecho
                const abierto = abierta === e.id || (abierta === '_top' && idx === 0)
                return (
                  <li key={e.id} className={`ed-run ${est.t}${abierto ? ' abierto' : ''}`}>
                    <button type="button" className="ed-run-cab" onClick={() => setAbierta(abierto ? null : e.id)}>
                      <ChevronRight size={15} className="ed-chevron" />
                      <span className={`ed-estado ${est.t}`}>{est.lb}</span>
                      <span className="ed-run-res">{e.estado === 'corriendo' ? (e.pasos?.at(-1)?.texto || 'Empezando…') : (e.resumen || e.error || '')}</span>
                      <small>{fecha(e.empezado_en)}</small>
                    </button>
                    {abierto && (
                      <ol className="ed-pasos">
                        {(e.pasos || []).map((p, i) => <li key={i}><span className="ed-paso-t">{hhmmss(p.t)}</span><span>{p.texto}</span></li>)}
                        {e.estado === 'corriendo' && <li className="ed-paso-vivo"><span className="ed-paso-t" /><span>…</span></li>}
                        {!e.pasos?.length && e.estado !== 'corriendo' && <li className="ed-paso-vacio"><span /><span>Sin pasos registrados.</span></li>}
                      </ol>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
    </div>
  )
}
