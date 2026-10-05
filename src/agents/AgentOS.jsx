// Agent OS — /agents. El taller del operador.
//
// La portada es un menú: una casilla por agente, se pincha y se entra. El de
// contenido lleva dentro sus creadores, sus reels y su memoria, en pestañas.
//
// Solo superadmin. El guardia de verdad está en el servidor (api/agents.js va
// con `wrap(..., { superadmin: true })`); esto solo evita enseñar una pantalla
// que luego daría 403 en cada llamada. Los perfiles ven lo suyo, en solo
// lectura, en la sección Agentes de HELM.
import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { agentsApi } from './api'
import { AGENTES, PARTES_CONTENIDO } from './agentes'
import { Identidades, Memoria } from './Recursos'
import { MenuAgentes } from './Piezas'
import Ficha from './Ficha'
import Corpus from './Corpus'
import PanelDrive from './Drive'
import Equipo from './Equipo'
import './agentos.css'

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

  // El pulso del taller: se refresca solo, y más a menudo mientras algún
  // agente trabaja, para que se le vea avanzar de paso en paso.
  const hayTrabajo = (estado?.ahora?.length || 0) > 0
  useEffect(() => {
    const t = setInterval(() => agentsApi.estado().then(setEstado).catch(() => {}), hayTrabajo ? 3000 : 10000)
    return () => clearInterval(t)
  }, [hayTrabajo])

  if (!listo) return <div className="ag"><p className="ag-vacio">Cargando…</p></div>

  return (
    <div className="ag">
      {error && <p className="ag-error">{error}</p>}
      <Routes>
        <Route index element={<Lanzador estado={estado} identidades={identidades} />} />
        <Route path="contenido/*" element={
          <AgenteContenido identidades={identidades} onCambio={cargaIdentidades} />
        } />
        <Route path="drive" element={<AgenteDrive />} />
        <Route path="equipo" element={
          <Dentro titulo="Equipo de agentes" sub="El flujo entero: qué hace cada agente, por dónde va cada pieza, el registro de cada ejecución y lo que espera tu aprobación">
            <Equipo />
          </Dentro>
        } />
        {/* Las rutas de antes, para los enlaces que ya hubiera guardados. */}
        <Route path="reels" element={<Navigate to="/agents/contenido/reels" replace />} />
        <Route path="identidades" element={<Navigate to="/agents/contenido" replace />} />
        <Route path="identidades/:slug" element={<RedirigeFicha />} />
        <Route path="memoria" element={<Navigate to="/agents/contenido/memoria" replace />} />
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
          <p>Elige un agente para entrar.</p>
        </div>
        <a className="ag-btn" href="/admin">Volver a HELM</a>
      </header>

      {/* El pulso: si algo va mal, se ve antes de entrar a ningún sitio. */}
      <div className="ag-pulso">
        <Pulso n={activos} lb="agentes activos" />
        <Pulso n={estado?.total ?? "—"} lb="reels" />
        <Pulso n={identidades.length} lb={identidades.length === 1 ? "creador" : "creadores"} />
        <Pulso n={trabajando} lb="trabajando" vivo={trabajando > 0} />
        <Pulso n={enCola} lb="en cola" />
        <Pulso n={fallidos} lb="con error" mal={fallidos > 0} />
      </div>

      <h2 className="ag-seccion">Agentes</h2>
      <MenuAgentes agentes={AGENTES.filter(a => !a.soloPerfil)} metricaDe={metricaDe} />
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

// ── El agente de contenido ───────────────────────────────────────────────────

function AgenteContenido({ identidades, onCambio }) {
  const navigate = useNavigate()
  const abrirFicha = (slug) => navigate(`/agents/contenido/creadores/${slug}`)
  return (
    <Routes>
      <Route path="creadores/:slug" element={<FichaRuta identidades={identidades} />} />
      <Route path="*" element={
        <Dentro titulo="Agente de contenido" sub="Creadores de referencia, sus reels analizados y lo aprendido">
          <nav className="ag-pestanas">
            {PARTES_CONTENIDO.map(p => (
              <NavLink key={p.key} end to={`/agents/contenido${p.ruta ? `/${p.ruta}` : ''}`}>{p.nombre}</NavLink>
            ))}
          </nav>
          <Routes>
            <Route index element={<Identidades lista={identidades} onCambio={onCambio} onAbrir={abrirFicha} />} />
            <Route path="reels" element={<Corpus identidades={identidades} />} />
            <Route path="memoria" element={<Memoria identidades={identidades} />} />
          </Routes>
        </Dentro>
      } />
    </Routes>
  )
}

function FichaRuta({ identidades }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const cargar = useCallback(() => agentsApi.ficha(slug), [slug])
  return (
    <Ficha
      cargar={cargar} admin identidades={identidades}
      onVolver={() => navigate('/agents/contenido')} volverLabel="Creadores"
    />
  )
}

// ── La ingesta de Drive: un perfil cada vez ─────────────────────────────────

function AgenteDrive() {
  const [perfiles, setPerfiles] = useState(null)
  const [elegido, setElegido] = useState('')
  useEffect(() => {
    agentsApi.drivePerfiles().then(({ perfiles }) => {
      setPerfiles(perfiles)
      setElegido(p => p || perfiles[0]?.id || '')
    }).catch(() => setPerfiles([]))
  }, [])
  const cargar = useCallback(() => agentsApi.drive(elegido), [elegido])

  return (
    <Dentro titulo="Calendario de guiones" sub="Los guiones de cada perfil día a día, y lo que va entrando en su Drive">
      {!perfiles ? <p className="ag-vacio">Cargando…</p> : !perfiles.length
        ? <p className="ag-vacio">Ningún perfil tiene carpeta en HELM Contenido.</p>
        : (
          <>
            <nav className="ag-pestanas">
              {perfiles.map(p => (
                <button key={p.id} type="button" className={elegido === p.id ? 'active' : ''} onClick={() => setElegido(p.id)}>
                  {p.nombre}
                </button>
              ))}
            </nav>
            {elegido && <PanelDrive key={elegido} cargar={cargar} />}
          </>
        )}
    </Dentro>
  )
}

function RedirigeFicha() {
  const { slug } = useParams()
  return <Navigate to={`/agents/contenido/creadores/${slug}`} replace />
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
