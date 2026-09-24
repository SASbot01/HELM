// Agent OS — /agents. El taller del operador.
//
// La portada es un lanzador: una casilla por agente, se entra en uno y se
// trabaja dentro. Antes esto eran cuatro pestañas y parecía un solo agente
// disfrazado; el catálogo deja claro que son cosas distintas y que vendrán más.
//
// Solo superadmin. El guardia de verdad está en el servidor (api/agents.js va
// con `wrap(..., { superadmin: true })`); esto solo evita enseñar una pantalla
// que luego daría 403 en cada llamada.
import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom'
import {
  ScatterChart, PenLine, FolderSync, FileBarChart, UserSquare, Brain,
  ArrowLeft, ArrowRight,
} from 'lucide-react'
import { agentsApi } from './api'
import { AGENTES, RECURSOS, ESTADOS } from './agentes'
import { Identidades, Memoria } from './Recursos'
import Corpus from './Corpus'
import './agentos.css'

const ICONOS = {
  grafica: ScatterChart, pluma: PenLine, carpeta: FolderSync,
  informe: FileBarChart, persona: UserSquare, memoria: Brain,
}

export default function AgentOS() {
  const navigate = useNavigate()
  const [identidades, setIdentidades] = useState([])
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  const cargaIdentidades = useCallback(
    () => agentsApi.identidades().then(({ identidades }) => setIdentidades(identidades)).catch(() => {}),
    [],
  )

  useEffect(() => {
    if (!localStorage.getItem('bw_admin_jwt')) { navigate('/login', { replace: true }); return }
    Promise.all([
      agentsApi.identidades().then(({ identidades }) => setIdentidades(identidades)),
      agentsApi.estado().then(setEstado),
    ]).catch(e => setError(e.message)).finally(() => setListo(true))
  }, [navigate])

  // El pulso del taller: mientras haya algo en la cola se refresca solo.
  useEffect(() => {
    const t = setInterval(() => agentsApi.estado().then(setEstado).catch(() => {}), 10000)
    return () => clearInterval(t)
  }, [])

  if (!listo) return <div className="ag"><p className="ag-vacio">Cargando…</p></div>

  return (
    <div className="ag">
      {error && <p className="ag-error">{error}</p>}
      <Routes>
        <Route index element={<Lanzador estado={estado} identidades={identidades} />} />
        <Route path="reels" element={
          <Dentro titulo="Analista de reels" sub="Pega enlaces y mira qué gancho funciona">
            <Corpus identidades={identidades} />
          </Dentro>
        } />
        <Route path="identidades" element={
          <Dentro titulo="Identidades" sub="Estilos de creador, con todo su contexto">
            <Identidades lista={identidades} onCambio={cargaIdentidades} />
          </Dentro>
        } />
        <Route path="memoria" element={
          <Dentro titulo="Memoria" sub="Lo que no hay que volver a descubrir">
            <Memoria identidades={identidades} />
          </Dentro>
        } />
        <Route path=":otro" element={<NoExiste />} />
      </Routes>
    </div>
  )
}

// ── La portada ──────────────────────────────────────────────────────────────

function Lanzador({ estado, identidades }) {
  const enCola = estado?.jobs.filter(j => j.estado === 'pendiente').length || 0
  const trabajando = estado?.jobs.filter(j => j.estado === 'corriendo').length || 0
  const fallidos = estado?.jobs.filter(j => j.estado === 'error').length || 0
  const activos = AGENTES.filter(a => a.estado === 'activo').length

  // El número que enseña cada casilla. Si no hay dato, no se enseña un cero:
  // un cero inventado se lee como "no funciona".
  const metricaDe = (a) => {
    if (a.metrica === 'corpus' && estado) return { n: estado.total, lb: estado.total === 1 ? 'reel' : 'reels' }
    return null
  }

  return (
    <>
      <header className="ag-top">
        <div>
          <h1>Agent OS</h1>
          <p>Tus agentes, el material del que comen y lo que van aprendiendo.</p>
        </div>
        <a className="ag-btn" href="/admin">Volver a HELM</a>
      </header>

      {/* El pulso: si algo va mal, se ve antes de entrar a ningún sitio. */}
      <div className="ag-pulso">
        <Pulso n={activos} lb="agentes activos" />
        <Pulso n={estado?.total ?? '—'} lb="en el corpus" />
        <Pulso n={identidades.length} lb={identidades.length === 1 ? 'identidad' : 'identidades'} />
        <Pulso n={trabajando} lb="trabajando" vivo={trabajando > 0} />
        <Pulso n={enCola} lb="en cola" />
        <Pulso n={fallidos} lb="con error" mal={fallidos > 0} />
      </div>

      <h2 className="ag-seccion">Agentes</h2>
      <div className="ag-rejilla">
        {AGENTES.map(a => <Casilla key={a.key} a={a} metrica={metricaDe(a)} />)}
      </div>

      <h2 className="ag-seccion">Material</h2>
      <div className="ag-rejilla recursos">
        {RECURSOS.map(r => <Casilla key={r.key} a={{ ...r, estado: 'activo' }} recurso />)}
      </div>
    </>
  )
}

function Pulso({ n, lb, vivo, mal }) {
  return (
    <div className={`ag-pulso-it${mal ? ' mal' : ''}${vivo ? ' vivo' : ''}`}>
      <b>{n}</b><span>{lb}</span>
    </div>
  )
}

function Casilla({ a, metrica, recurso }) {
  const Icono = ICONOS[a.icono] || ScatterChart
  const est = ESTADOS[a.estado] || ESTADOS.construido
  const entrable = Boolean(a.ruta)

  // Todas las casillas tienen la misma anatomía y en el mismo orden: icono,
  // nombre, resumen, detalle y pie. Si a una le falta una pieza, su pie queda
  // a distinta altura que el de al lado y la fila entera se ve mal hecha.
  const cuerpo = (
    <>
      <span className="ag-cas-ico"><Icono size={20} strokeWidth={1.8} aria-hidden="true" /></span>
      <h3>{a.nombre}</h3>
      <p>{a.resumen}</p>
      {a.detalle && <p className="ag-cas-detalle">{a.detalle}</p>}
      <footer>
        {metrica
          ? <span className="ag-cas-num"><b>{metrica.n}</b> {metrica.lb}</span>
          : <span className={`ag-estado ${est.tono}`}>{recurso ? 'Listo' : est.label}</span>}
        {entrable && <ArrowRight size={15} strokeWidth={2} className="ag-cas-flecha" aria-hidden="true" />}
      </footer>
    </>
  )

  if (!entrable) return <article className="ag-casilla pendiente" aria-disabled="true">{cuerpo}</article>
  return <Link className="ag-casilla" to={a.ruta}>{cuerpo}</Link>
}

// ── Dentro de un agente ─────────────────────────────────────────────────────

function Dentro({ titulo, sub, children }) {
  return (
    <>
      <header className="ag-top dentro">
        <div>
          <Link className="ag-volver" to="/agents"><ArrowLeft size={14} strokeWidth={2.2} /> Agent OS</Link>
          <h1>{titulo}</h1>
          <p>{sub}</p>
        </div>
      </header>
      {children}
    </>
  )
}

function NoExiste() {
  const { otro } = useParams()
  return (
    <>
      <header className="ag-top dentro">
        <div>
          <Link className="ag-volver" to="/agents"><ArrowLeft size={14} strokeWidth={2.2} /> Agent OS</Link>
          <h1>Ese agente no existe</h1>
          <p>No hay ningún agente en «{otro}». Puede que esté por construir.</p>
        </div>
      </header>
    </>
  )
}
