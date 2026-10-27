// HELM — Agentes. La ventana de un perfil al Agent OS.
//
// Primero los departamentos (contenido, ventas…), como oficinas; dentro de
// cada uno, sus agentes en casillas. El Equipo de agentes, para el
// administrador, va aparte arriba. El de contenido enseña los creadores
// de referencia de ESTE perfil, y cada uno abre su ficha con sus reels y su
// guion frase a frase. Es lo que Claude lee cuando le pides estrategia o
// guiones para el perfil.
//
// Todo en solo lectura. Solo el superadmin elige qué creadores lleva el perfil
// y tiene a mano el taller global (/agents), que es donde se editan.
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Settings2, Link2, Copy, Check } from 'lucide-react'
import { creadoresApi } from '../lib'
import { agentsApi } from '../../agents/api'
import { AGENTES, DEPARTAMENTOS } from '../../agents/agentes'
import { MenuAgentes, MenuDepartamentos, CreadoresGrid } from '../../agents/Piezas'
import Ficha from '../../agents/Ficha'
import Equipo from '../../agents/Equipo'
import Oficina from '../../agents/Oficina'
import EstudioInstagram from './EstudioInstagram'
import EditorReel from '../../agents/EditorReel'
import Portadas from '../../agents/Portadas'
import SetterIG from '../../agents/SetterIG'
import TrialReels from '../../agents/TrialReels'
import WebCreator from '../../agents/WebCreator'
import '../../agents/agentos.css'
import './estudioIg.css'

const esAdmin = () => Boolean(localStorage.getItem('bw_superadmin'))

export default function Agentes({ clientId, client }) {
  // 'menu' → un departamento (dep:) → la oficina de un agente (of:) → su panel
  // ('contenido' → el slug de un creador, 'editor', 'portadas'…). Sin rutas
  // propias: la sección vive dentro de /<perfil> y HELM ya lleva la suya.
  const [vista, setVista] = useState('menu')
  // El departamento por el que se entró: al salir de un agente se vuelve a él.
  const [dep, setDep] = useState(null)
  const [creadores, setCreadores] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(
    () => creadoresApi.lista(clientId).then(r => setCreadores(r.creadores)).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])

  const cargarFicha = useCallback(() => creadoresApi.ficha(clientId, vista), [clientId, vista])

  const visibles = AGENTES.filter(a => (!a.soloAdmin || esAdmin()) && (!a.soloPerfiles || a.soloPerfiles.includes(client?.slug)))
  const departamentos = DEPARTAMENTOS
    .map(d => ({ ...d, agentes: visibles.filter(a => a.departamento === d.key) }))
    .filter(d => d.agentes.length)
  const metricaDe = (a) => (a.key === 'contenido' && creadores
    ? { n: creadores.length, lb: creadores.length === 1 ? 'creador' : 'creadores' }
    : null)
  const volver = () => setVista(dep ? `dep:${dep}` : 'menu')
  // Al pulsar un agente se entra en su oficina (of:<key>), no directo al panel.
  const aLaOficina = (k) => `of:${k}`

  if (vista === 'menu') {
    const sueltos = visibles.filter(a => !a.departamento)
    return (
      <div className="ag embebido">
        {sueltos.length > 0 && <MenuAgentes agentes={sueltos} onAbrir={(k) => { setDep(null); setVista(aLaOficina(k)) }} metricaDe={metricaDe} />}
        <h2 className="ag-seccion ag-deps-titulo">Departamentos</h2>
        <MenuDepartamentos departamentos={departamentos} onAbrir={(k) => { setDep(k); setVista(`dep:${k}`) }} />
      </div>
    )
  }

  if (vista.startsWith('of:')) {
    const a = visibles.find(x => `of:${x.key}` === vista)
    if (!a) return (
      <div className="ag embebido">
        <p className="ag-vacio">Ese agente no está en este perfil.</p>
        <button type="button" className="ag-btn" onClick={volver}>Volver</button>
      </div>
    )
    return <Oficina clientId={clientId} agente={a} onVolver={volver} onAbrir={(k) => setVista(k)} />
  }

  if (vista.startsWith('dep:')) {
    const d = departamentos.find(x => `dep:${x.key}` === vista)
    if (!d) {
      return (
        <div className="ag embebido">
          <p className="ag-vacio">Ese departamento no está en este perfil.</p>
          <button type="button" className="ag-btn" onClick={() => { setDep(null); setVista('menu') }}>Volver a Agentes</button>
        </div>
      )
    }
    return (
      <div className="ag embebido">
        <header className="ag-top dentro">
          <div>
            <button type="button" className="ag-volver" onClick={() => { setDep(null); setVista('menu') }}>
              <ArrowLeft size={14} strokeWidth={2.2} /> Agentes
            </button>
            <h1>{d.nombre}</h1>
            <p>{d.resumen}</p>
          </div>
        </header>
        <MenuAgentes agentes={d.agentes} onAbrir={(k) => setVista(aLaOficina(k))} metricaDe={metricaDe} />
      </div>
    )
  }

  if (vista === 'estudio') {
    return <EstudioInstagram clientId={clientId} client={client} onVolver={() => setVista('of:estudio')} />
  }

  if (vista === 'editor') {
    return <EditorReel clientId={clientId} client={client} onVolver={() => setVista('of:editor')} />
  }

  if (vista === 'portadas') {
    return <Portadas clientId={clientId} client={client} onVolver={() => setVista('of:portadas')} />
  }

  if (vista === 'setter-ig') {
    return <SetterIG clientId={clientId} client={client} onVolver={() => setVista('of:setter-ig')} />
  }

  if (vista === 'trial-reels') {
    return <TrialReels clientId={clientId} client={client} onVolver={() => setVista('of:trial-reels')} />
  }

  if (vista === 'web-creator') {
    return <WebCreator clientId={clientId} client={client} onVolver={() => setVista('of:web-creator')} />
  }

  if (vista === 'equipo') {
    return (
      <div className="ag embebido">
        <header className="ag-top dentro">
          <div>
            <button type="button" className="ag-volver" onClick={() => setVista('of:equipo')}>
              <ArrowLeft size={14} strokeWidth={2.2} /> Agentes
            </button>
            <h1>Equipo de agentes</h1>
            <p>El flujo entero de {client?.name || 'este perfil'}: qué hace cada agente, por dónde va cada pieza, el registro de cada ejecución y lo que espera tu aprobación.</p>
          </div>
        </header>
        <Equipo clientId={clientId} />
      </div>
    )
  }

  if (vista !== 'contenido') {
    return (
      <div className="ag embebido">
        <Ficha
          cargar={cargarFicha} admin={false}
          onVolver={() => setVista('contenido')} volverLabel="Agente de contenido"
        />
      </div>
    )
  }

  return (
    <div className="ag embebido">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={() => setVista('of:contenido')}>
            <ArrowLeft size={14} strokeWidth={2.2} /> Agentes
          </button>
          <h1>Agente de contenido</h1>
          <p>
            Los creadores de referencia de {client?.name || 'este perfil'}. Cuando pides a Claude estrategia o
            guiones para este perfil, lee sus reels y lo aprendido de ellos.
          </p>
        </div>
        {esAdmin() && <a className="ag-btn" href="/agents/contenido">Abrir Agent OS</a>}
      </header>

      {error && <p className="ag-error">{error}</p>}
      {esAdmin() && (
        <div className="ag-admin-fila">
          <ElegirCreadores clientId={clientId} onCambio={cargar} />
          <EnlaceClaude clientId={clientId} nombre={client?.name} />
        </div>
      )}

      {!creadores ? <p className="ag-vacio">Cargando…</p>
        : creadores.length === 0
          ? (
            <p className="ag-vacio">
              Este perfil todavía no tiene creadores de referencia.
              {esAdmin() ? ' Elígelos arriba.' : ' Pídeselo a tu administrador.'}
            </p>
          )
          : <CreadoresGrid creadores={creadores} onAbrir={setVista} />}
    </div>
  )
}

// Qué creadores del Agent OS lleva este perfil. Solo superadmin: el corpus es
// suyo y api/agents.js lo exige. Se guarda al marcar.
function ElegirCreadores({ clientId, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [todos, setTodos] = useState(null)
  const [asignados, setAsignados] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto || todos) return
    Promise.all([agentsApi.identidades(), agentsApi.perfilCreadores(clientId)])
      .then(([i, p]) => { setTodos(i.identidades); setAsignados(p.identityIds) })
      .catch(e => setError(e.message))
  }, [abierto, todos, clientId])

  async function alterna(id) {
    const nuevos = asignados.includes(id) ? asignados.filter(x => x !== id) : [...asignados, id]
    setBusy(true); setError('')
    try { setAsignados((await agentsApi.guardarPerfilCreadores(clientId, nuevos)).identityIds); onCambio() }
    catch (e) { setError(e.message) }
    setBusy(false)
  }

  if (!abierto) {
    return (
      <button type="button" className="ag-btn primario ag-elegir-btn" onClick={() => setAbierto(true)}>
        <Settings2 size={15} /> Elegir los creadores de este perfil
      </button>
    )
  }

  return (
    <section className="ag-card ag-elegir">
      <header>
        <b>Creadores de este perfil</b>
        <button type="button" className="ag-btn sm" onClick={() => setAbierto(false)}>Hecho</button>
      </header>
      {error && <p className="ag-error">{error}</p>}
      {!todos ? <p className="ag-aviso">Cargando…</p> : (
        <div className="ag-elegir-lista">
          {todos.map(i => (
            <label key={i.id} className={asignados.includes(i.id) ? 'on' : ''}>
              <input type="checkbox" checked={asignados.includes(i.id)} disabled={busy} onChange={() => alterna(i.id)} />
              <span><b>{i.nombre}</b><small>{i.categoria || 'Sin tipo'} · {i.reels} reels</small></span>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

// El enlace del conector de Claude para ESTE perfil: con él, Claude solo ve sus
// creadores, su historial y su calendario. Se enseña una sola vez; generar
// otro deja de valer el anterior.
function EnlaceClaude({ clientId, nombre }) {
  const [estado, setEstado] = useState(null)
  const [url, setUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { agentsApi.mcpEnlace(clientId).then(setEstado).catch(e => setError(e.message)) }, [clientId])

  async function generar() {
    if (estado?.existe && !window.confirm(`El enlace actual de ${nombre || 'este perfil'} dejará de funcionar. ¿Generar uno nuevo?`)) return
    setError('')
    try { setUrl((await agentsApi.generarMcpEnlace(clientId)).url); setEstado({ existe: true }) }
    catch (e) { setError(e.message) }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ }
  }

  return (
    <section className="ag-card ag-enlace">
      <header>
        <b><Link2 size={14} /> Conector de Claude de este perfil</b>
        <button type="button" className="ag-btn sm" onClick={generar}>{estado?.existe ? 'Generar otro' : 'Generar enlace'}</button>
      </header>
      {url ? (
        <>
          <div className="ag-enlace-url">
            <code>{url}</code>
            <button type="button" className="ag-btn sm" onClick={copiar}>{copiado ? <Check size={13} /> : <Copy size={13} />}</button>
          </div>
          <small className="ag-aviso">Cópialo ahora: no se vuelve a enseñar. Es una contraseña: dáselo solo a {nombre || 'este cliente'}.</small>
        </>
      ) : (
        <small className="ag-aviso">
          {estado?.existe
            ? `Ya tiene enlace${estado.ultimo_uso ? ` (usado por última vez el ${new Date(estado.ultimo_uso).toLocaleDateString('es-ES')})` : ' (aún sin usar)'}. Solo ve este perfil.`
            : 'Aún no tiene. Con su enlace, Claude solo ve los creadores, el historial y el calendario de este perfil.'}
        </small>
      )}
      {error && <p className="ag-error">{error}</p>}
    </section>
  )
}

