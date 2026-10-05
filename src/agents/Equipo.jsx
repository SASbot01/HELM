// Agent OS — el equipo de agentes de un perfil, trabajando a la vista.
//
// Arriba, el flujo de izquierda a derecha: el director planifica, los
// especialistas miran y avisan, el guionista escribe y lo que sale de ahí
// espera a que el dueño decida. Todos leen y escriben en la memoria compartida.
// Cada nodo dice en qué anda ahora mismo. Debajo, el recorrido de las piezas
// (de borrador a publicado) y tres pestañas: el registro (cada ejecución, paso
// a paso y con sus tokens), lo que espera aprobación y la memoria.
//
// Se usa en /agents/equipo (con selector de perfil) y en la sección Agentes de
// un perfil (con `clientId` fijo). Solo superadmin: tira de api/agents.js.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play, ChevronRight, Check, X, Trash2, ArrowRight } from 'lucide-react'
import { agentsApi } from './api'
import { nf } from './ganchos'

const AGENTES = {
  director:     { nombre: 'Director',     hace: 'A las 6:00 mira el calendario, la agenda, las tareas y la memoria, deja el plan del día y reparte el trabajo.' },
  investigador: { nombre: 'Investigador', hace: 'Estudia los reels de los creadores de referencia y apunta los ganchos y temas que se repiten.' },
  analista:     { nombre: 'Analista',     hace: 'Compara las métricas de los reels publicados y guarda conclusiones con cifras.' },
  productor:    { nombre: 'Productor',    hace: 'Sigue cada pieza de guion a publicado y avisa de lo que se atasca: sin grabar, sin editar, sin publicar.' },
  comercial:    { nombre: 'Comercial',    hace: 'Repasa leads, llamadas y cobros y avisa de lo que se enfría. No escribe a nadie.' },
  informe:      { nombre: 'Informe',      hace: 'Los lunes cruza el contenido con los leads y las ventas de la semana.' },
  guionista:    { nombre: 'Guionista',    hace: 'Escribe los guiones del día y los deja en el calendario como borrador.' },
}
// Las columnas del flujo, en el orden en que pasa el trabajo.
const MIRAN = ['investigador', 'analista', 'productor', 'comercial', 'informe']
const ETAPAS = [
  { k: 'borrador',   nombre: 'Borrador',   sub: 'espera tu visto bueno' },
  { k: 'por_grabar', nombre: 'Por grabar' },
  { k: 'sin_editar', nombre: 'Sin editar' },
  { k: 'editado',    nombre: 'Editado',    sub: 'listo para publicar' },
  { k: 'publicado',  nombre: 'Publicado' },
]
const PRIORIDAD = { high: 'Prioridad alta', medium: '', low: 'Prioridad baja' }
const ORIGEN = { horario: 'Horario de las 6:00', director: 'Encargo del director', manual: 'Lanzado a mano' }
const ESTADO = {
  corriendo: { label: 'Trabajando', tono: 'vivo' },
  hecho:     { label: 'Hecho',      tono: 'ok' },
  error:     { label: 'Error',      tono: 'mal' },
  saltado:   { label: 'No corrió',  tono: 'espera' },
}
const TIPOS = { viralidad: 'Viralidad', conversion: 'Conversión', autoridad: 'Autoridad', venta: 'Venta' }

const hora = (t, seg) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', ...(seg ? { second: '2-digit' } : {}) })
const diaLargo = (t) => new Date(t).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const diaCorto = (t) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const fechaGuion = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

function hace(t, ahora) {
  const s = Math.max(0, (ahora - Date.parse(t)) / 1000)
  if (s < 90) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  return `el ${diaCorto(t)}`
}
function dura(a, b) {
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

export default function Equipo({ clientId: fijo }) {
  const [elegido, setElegido] = useState(fijo || '')
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState('registro')
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(
    () => agentsApi.equipo(elegido).then(r => {
      setD(r); setError('')
      if (!elegido && r.perfiles[0]) setElegido(r.perfiles[0].id)
    }).catch(e => setError(e.message)),
    [elegido],
  )
  useEffect(() => { cargar() }, [cargar])

  // Mientras alguien trabaja o espera en cola se mira cada 3 s, para ver los
  // pasos según se escriben. En reposo, cada 20.
  const activo = d?.agentes?.some(a => a.estado !== 'parado')
  useEffect(() => {
    const t = setInterval(() => { setAhora(Date.now()); cargar() }, activo ? 3000 : 20000)
    return () => clearInterval(t)
  }, [activo, cargar])

  async function accion(fn) {
    setError('')
    try { await fn(); await cargar() } catch (e) { setError(e.message) }
  }

  if (!d) return error ? <p className="ag-error">{error}</p> : <p className="ag-vacio">Cargando…</p>

  // Dentro de un perfil que aún no tiene equipo: se da de alta con un botón.
  if (!d.perfil) {
    if (!fijo) return <p className="ag-vacio">Ningún perfil tiene equipo de agentes todavía. Se activa desde la sección Agentes de cada perfil.</p>
    return (
      <div className="ag-card eq-alta">
        <p>Este perfil todavía no tiene equipo de agentes. Al activarlo, el director planificará cada mañana a las 6:00 y los guiones llegarán como borrador.</p>
        <button type="button" className="ag-btn primario" onClick={() => accion(() => agentsApi.equipoConfig({ clientId: fijo, activo: true }))}>
          Activar el equipo en este perfil
        </button>
        {error && <p className="ag-error">{error}</p>}
      </div>
    )
  }

  const { perfil, agentes, ejecuciones, memoria, borradores, tareas = [], piezas, fuentes, tokensHoy } = d
  const de = (k) => agentes.find(a => a.agente === k)
  const plan = memoria.find(n => n.tipo === 'plan')
  const propuestas = memoria.filter(n => n.tipo === 'propuesta' && n.estado === 'pendiente').length
  const avisos = memoria.filter(n => n.tipo === 'aviso').length
  const porAprobar = borradores.length + tareas.length
  const vivo = (lista) => lista.some(k => de(k)?.estado !== 'parado')
  const lanzar = (agente) => accion(() => agentsApi.equipoLanzar({ clientId: perfil.id, agente }))

  return (
    <div className="eq">
      {!fijo && d.perfiles.length > 1 && (
        <nav className="ag-pestanas">
          {d.perfiles.map(p => (
            <button key={p.id} type="button" className={p.id === perfil.id ? 'active' : ''} onClick={() => { setD(null); setElegido(p.id) }}>
              {p.nombre}
            </button>
          ))}
        </nav>
      )}
      {error && <p className="ag-error">{error}</p>}

      <div className="eq-mando">
        <button
          type="button" role="switch" aria-checked={perfil.activo}
          className={`eq-interruptor${perfil.activo ? ' on' : ''}`}
          onClick={() => accion(() => agentsApi.equipoConfig({ clientId: perfil.id, activo: !perfil.activo }))}
        >
          <i aria-hidden="true" />
          <span>
            <b>{perfil.activo ? 'Agentes activos' : 'Agentes en pausa'}</b>
            {perfil.activo ? 'El director arranca cada día a las 6:00' : 'No corre nada hasta que lo actives'}
          </span>
        </button>
        <dl className="eq-cifras">
          <div><dt>Tokens hoy</dt><dd>{nf.format(tokensHoy)} <span>de {nf.format(perfil.tope_tokens_dia)}</span></dd></div>
          <div><dt>Guiones al día</dt><dd>{perfil.guiones_dia}</dd></div>
          <div><dt>Esperan tu aprobación</dt><dd>{porAprobar + propuestas}</dd></div>
        </dl>
      </div>

      <Avisos fuentes={fuentes} />

      {/* ── El flujo ───────────────────────────────────────────────────── */}
      <section className="eq-flujo" aria-label="Cómo trabaja el equipo">
        <div className="eq-cols">
          <div className="eq-col">
            <h4><span>1</span>Planifica</h4>
            <Nodo k="director" a={de('director')} ahora={ahora} onLanzar={lanzar} />
          </div>
          <div className={`eq-col ancha${vivo(MIRAN) ? ' viva' : ''}`}>
            <h4><span>2</span>Miran y avisan</h4>
            <div className="eq-col-rejilla">
              {MIRAN.map(k => <Nodo key={k} k={k} a={de(k)} ahora={ahora} onLanzar={lanzar} />)}
            </div>
          </div>
          <div className={`eq-col${vivo(['guionista']) ? ' viva' : ''}`}>
            <h4><span>3</span>Escribe</h4>
            <Nodo k="guionista" a={de('guionista')} ahora={ahora} onLanzar={lanzar} />
          </div>
          <div className="eq-col">
            <h4><span>4</span>Decides tú</h4>
            <div className="eq-nodo eq-decides">
              <Pendiente n={borradores.length} uno="guion en borrador" varios="guiones en borrador" onClick={() => setPestana('aprobar')} />
              <Pendiente n={tareas.length} uno="tarea propuesta" varios="tareas propuestas" onClick={() => setPestana('aprobar')} />
              <Pendiente n={propuestas} uno="cambio de estrategia" varios="cambios de estrategia" onClick={() => setPestana('memoria')} />
              <Pendiente n={avisos} uno="aviso de hoy" varios="avisos de hoy" onClick={() => setPestana('memoria')} />
              <p>Nada se publica, se aprueba ni se envía sin ti.</p>
            </div>
          </div>
        </div>
        <button type="button" className="eq-memoria" onClick={() => setPestana('memoria')}>
          <header>
            <b>Memoria compartida</b>
            <span>Todos la leen antes de actuar y escriben al terminar · {memoria.length} {memoria.length === 1 ? 'nota' : 'notas'}</span>
          </header>
          {plan
            ? <p><em>Plan del {diaCorto(plan.updated_at)}</em>{plan.contenido}</p>
            : <p className="vacia">Todavía no hay plan del día. Lo escribe el director cuando corre.</p>}
        </button>
      </section>

      <Recorrido piezas={piezas} />

      {/* ── Registro, borradores, memoria ──────────────────────────────── */}
      <nav className="ag-pestanas eq-pestanas">
        <button type="button" className={pestana === 'registro' ? 'active' : ''} onClick={() => setPestana('registro')}>Registro</button>
        <button type="button" className={pestana === 'aprobar' ? 'active' : ''} onClick={() => setPestana('aprobar')}>
          Por aprobar{porAprobar > 0 && <span className="eq-cuenta">{porAprobar}</span>}
        </button>
        <button type="button" className={pestana === 'memoria' ? 'active' : ''} onClick={() => setPestana('memoria')}>
          Memoria{propuestas > 0 && <span className="eq-cuenta">{propuestas}</span>}
        </button>
      </nav>

      {pestana === 'registro' && <Registro ejecuciones={ejecuciones} ahora={ahora} />}
      {pestana === 'aprobar' && (
        <>
          <Tareas lista={tareas} onAccion={(id, a) => accion(() => agentsApi.equipoTarea({ id, accion: a }))} />
          <Borradores
            lista={borradores} hayTareas={tareas.length > 0}
            onAccion={(id, a) => accion(() => agentsApi.equipoGuion({ id, accion: a }))}
          />
        </>
      )}
      {pestana === 'memoria' && (
        <Memoria notas={memoria} onNota={(body) => accion(() => agentsApi.equipoNota({ clientId: perfil.id, ...body }))} />
      )}
    </div>
  )
}

// Lo que le falta al equipo para trabajar entero. Se dice una vez, arriba, y
// con qué hay que hacer: un agente que no hace nada sin explicar por qué
// parece roto.
function Avisos({ fuentes }) {
  const avisos = [
    !fuentes.claude && 'Falta la clave de Claude (AGENTS_ANTHROPIC_KEY): ningún agente puede correr.',
    !fuentes.instagram && 'Instagram no está conectado: el analista no tiene las métricas de los reels propios. Se conecta en Ajustes → Instagram.',
    !fuentes.creadores && 'Este perfil no tiene creadores de referencia asignados.',
  ].filter(Boolean)
  if (!avisos.length) return null
  return <ul className="eq-avisos">{avisos.map(a => <li key={a}>{a}</li>)}</ul>
}

// Una línea de la columna «Decides tú»: lo que hay esperando, y lleva a ello.
function Pendiente({ n, uno, varios, onClick }) {
  return (
    <button type="button" className={`eq-pendiente${n ? '' : ' cero'}`} onClick={onClick}>
      <b>{n}</b>{n === 1 ? uno : varios}
    </button>
  )
}

// Por dónde va cada pieza de contenido, de borrador a publicado.
function Recorrido({ piezas }) {
  if (!piezas) return <p className="eq-avisos">No he podido leer el recorrido de las piezas (el calendario o Drive no contestan).</p>
  if (!piezas.length) return null
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  return (
    <section className="eq-recorrido" aria-label="Recorrido de las piezas">
      <h3>Recorrido de las piezas<span>los guiones de las últimas seis semanas y las tres próximas</span></h3>
      <ol>
        {ETAPAS.map((e, i) => {
          const suyas = piezas.filter(p => p.etapa === e.k)
          // Lo publicado, lo último primero; lo demás, lo más antiguo primero:
          // es lo que lleva más tiempo esperando.
          const orden = e.k === 'publicado' ? [...suyas].reverse() : suyas
          return (
            <li key={e.k}>
              <header>
                <b>{suyas.length}</b>
                <span>{e.nombre}</span>
                {i < ETAPAS.length - 1 && <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />}
              </header>
              {e.sub && <p className="eq-etapa-sub">{e.sub}</p>}
              <ul>
                {orden.slice(0, 3).map(p => (
                  <li key={p.id} className={e.k === 'por_grabar' && p.date < hoy ? 'tarde' : ''}>
                    <time>{fechaGuion(p.date)}</time>{p.title}
                  </li>
                ))}
                {orden.length > 3 && <li className="mas">y {orden.length - 3} más</li>}
              </ul>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Nodo({ k, a, ahora, onLanzar }) {
  const info = AGENTES[k]
  const vivo = a?.estado === 'corriendo'
  const ultimoPaso = a?.enCurso?.pasos?.at(-1)?.texto
  return (
    <article className={`eq-nodo ${a?.estado || 'parado'}`}>
      <header>
        <i className="eq-luz" aria-hidden="true" />
        <h3>{info.nombre}</h3>
        <button
          type="button" className="eq-lanzar" disabled={a?.estado !== 'parado'}
          onClick={() => onLanzar(k)} title={`Lanzar al ${info.nombre.toLowerCase()} ahora`}
        >
          <Play size={12} strokeWidth={2.4} aria-hidden="true" /> Lanzar
        </button>
      </header>
      <p className="eq-hace">{info.hace}</p>
      <div className="eq-ahora" aria-live="polite">
        {vivo ? (
          <>
            <b>Trabajando · {dura(a.enCurso.empezado_en, new Date(ahora).toISOString())}</b>
            <span>{ultimoPaso || 'Empezando…'}</span>
          </>
        ) : a?.estado === 'en_cola' ? (
          <><b>En cola</b><span>Espera su turno en el worker.</span></>
        ) : a?.ultima ? (
          <>
            <b className={ESTADO[a.ultima.estado]?.tono}>{ESTADO[a.ultima.estado]?.label} {hace(a.ultima.empezado_en, ahora)}</b>
            <span>{a.ultima.resumen || a.ultima.error}</span>
          </>
        ) : (
          <><b>Sin estrenar</b><span>Todavía no ha corrido ninguna vez.</span></>
        )}
      </div>
    </article>
  )
}

// ── Registro ────────────────────────────────────────────────────────────────

function Registro({ ejecuciones, ahora }) {
  const [filtro, setFiltro] = useState('')
  const [abierta, setAbierta] = useState(null)
  const lista = filtro ? ejecuciones.filter(e => e.agente === filtro) : ejecuciones

  // Por días, con lo gastado en cada uno.
  const dias = useMemo(() => {
    const m = new Map()
    for (const e of lista) {
      const k = new Date(e.empezado_en).toDateString()
      if (!m.has(k)) m.set(k, { t: e.empezado_en, filas: [], tokens: 0 })
      const g = m.get(k)
      g.filas.push(e)
      g.tokens += e.tokens_in + e.tokens_out
    }
    return [...m.values()]
  }, [lista])

  return (
    <section className="eq-registro">
      <div className="eq-filtro" role="group" aria-label="Filtrar por agente">
        <button type="button" className={!filtro ? 'active' : ''} onClick={() => setFiltro('')}>Todos</button>
        {Object.entries(AGENTES).map(([k, v]) => (
          <button key={k} type="button" className={filtro === k ? 'active' : ''} onClick={() => setFiltro(k)}>{v.nombre}</button>
        ))}
      </div>

      {!lista.length && (
        <p className="ag-vacio">
          {filtro ? `El ${AGENTES[filtro].nombre.toLowerCase()} no ha corrido todavía.` : 'Aquí quedará cada vez que corra un agente: qué hizo, paso a paso, y cuántos tokens gastó.'}
        </p>
      )}

      {dias.map(g => (
        <div key={g.t} className="eq-dia">
          <h4>{diaLargo(g.t)}<span>{g.filas.length} {g.filas.length === 1 ? 'ejecución' : 'ejecuciones'} · {nf.format(g.tokens)} tokens</span></h4>
          <ol>
            {g.filas.map(e => {
              const est = ESTADO[e.estado] || ESTADO.hecho
              const abierto = abierta === e.id
              return (
                <li key={e.id} className={`eq-run ${est.tono}${abierto ? ' abierto' : ''}`}>
                  <button type="button" className="eq-run-cab" aria-expanded={abierto} onClick={() => setAbierta(abierto ? null : e.id)}>
                    <time>{hora(e.empezado_en)}</time>
                    <b>{AGENTES[e.agente]?.nombre || e.agente}</b>
                    <span className={`eq-estado ${est.tono}`}>{est.label}</span>
                    <span className="eq-run-resumen">{e.estado === 'corriendo' ? (e.pasos.at(-1)?.texto || 'Empezando…') : (e.resumen || e.error)}</span>
                    <span className="eq-run-num">
                      {e.acabado_en ? dura(e.empezado_en, e.acabado_en) : dura(e.empezado_en, new Date(ahora).toISOString())}
                      {' · '}{nf.format(e.tokens_in + e.tokens_out)} tokens
                    </span>
                    <ChevronRight size={15} strokeWidth={2} className="eq-run-flecha" aria-hidden="true" />
                  </button>
                  {abierto && (
                    <div className="eq-run-detalle">
                      <dl>
                        <div><dt>Origen</dt><dd>{ORIGEN[e.origen] || e.origen}</dd></div>
                        <div><dt>Modelo</dt><dd>{e.tokens_in + e.tokens_out > 0 ? e.modelo : 'No se llamó al modelo'}</dd></div>
                        <div><dt>Tokens</dt><dd>{nf.format(e.tokens_in)} de entrada · {nf.format(e.tokens_out)} de salida</dd></div>
                      </dl>
                      {e.encargo && <p className="eq-encargo"><em>Encargo</em>{e.encargo}</p>}
                      {e.pasos.length > 0 && (
                        <ol className="eq-pasos">
                          {e.pasos.map((p, i) => <li key={i}><time>{hora(p.t, true)}</time><span>{p.texto}</span></li>)}
                        </ol>
                      )}
                      {e.resumen && <p className="eq-resultado"><em>Resultado</em>{e.resumen}</p>}
                      {e.error && <p className="eq-resultado mal"><em>Error</em>{e.error}</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}

// ── Borradores ──────────────────────────────────────────────────────────────

// Tareas que proponen los agentes. Aceptada, entra en las Tareas de HELM.
function Tareas({ lista, onAccion }) {
  if (!lista.length) return null
  return (
    <section className="eq-tareas">
      <h4 className="eq-sub">Tareas propuestas<span>Al aceptarlas entran en tus Tareas de HELM</span></h4>
      <ul>
        {lista.map(t => (
          <li key={t.id}>
            <div>
              <b>{t.titulo}</b>
              {t.detalle && <p>{t.detalle}</p>}
              <span>
                {AGENTES[t.agente]?.nombre || t.agente}
                {t.vence && ` · para el ${fechaGuion(t.vence)}`}
                {PRIORIDAD[t.prioridad] && ` · ${PRIORIDAD[t.prioridad]}`}
              </span>
            </div>
            <div className="eq-borrador-acc">
              <button type="button" className="ag-btn sm primario" onClick={() => onAccion(t.id, 'aceptar')}>
                <Check size={14} strokeWidth={2.4} aria-hidden="true" /> Aceptar
              </button>
              <button type="button" className="ag-btn sm" onClick={() => onAccion(t.id, 'descartar')}>
                <X size={14} strokeWidth={2.4} aria-hidden="true" /> Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Borradores({ lista, hayTareas, onAccion }) {
  const [abierto, setAbierto] = useState(null)
  if (!lista.length) {
    if (hayTareas) return null
    return <p className="ag-vacio">No hay nada por aprobar. Los guiones que escriba el guionista y las tareas que propongan los agentes aparecerán aquí.</p>
  }
  return (
    <section className="eq-borradores">
      {hayTareas && <h4 className="eq-sub">Guiones en borrador</h4>}
      {lista.map(g => (
        <article key={g.id} className="ag-card eq-borrador">
          <header>
            <div>
              <span className="eq-borrador-meta">{fechaGuion(g.date)}{g.tipo && ` · ${TIPOS[g.tipo]}`}</span>
              <h4>{g.title}</h4>
            </div>
            <div className="eq-borrador-acc">
              <button type="button" className="ag-btn sm primario" onClick={() => onAccion(g.id, 'aprobar')}>
                <Check size={14} strokeWidth={2.4} aria-hidden="true" /> Aprobar
              </button>
              <button type="button" className="ag-btn sm peligro" onClick={() => { if (window.confirm(`¿Descartar «${g.title}»? Se borra del calendario.`)) onAccion(g.id, 'descartar') }}>
                <X size={14} strokeWidth={2.4} aria-hidden="true" /> Descartar
              </button>
            </div>
          </header>
          <p className={`eq-borrador-txt${abierto === g.id ? ' entero' : ''}`}>{g.body}</p>
          <button type="button" className="ag-link eq-vermas" onClick={() => setAbierto(abierto === g.id ? null : g.id)}>
            {abierto === g.id ? 'Recoger' : 'Leer el guion entero'}
          </button>
        </article>
      ))}
    </section>
  )
}

// ── Memoria ─────────────────────────────────────────────────────────────────

const GRUPOS = [
  { tipo: 'aviso', titulo: 'Avisos de hoy', sub: 'Lo que se atasca, vence o se enfría. Se rehacen cada vez que corre el agente.' },
  { tipo: 'regla', titulo: 'Tus reglas', sub: 'Las escribes tú y los agentes las obedecen.' },
  { tipo: 'propuesta', titulo: 'Propuestas de estrategia', sub: 'Cambios que sugieren los agentes. No cuentan hasta que los aceptas.' },
  { tipo: 'plan', titulo: 'Plan del día' },
  { tipo: 'informe', titulo: 'Informe semanal' },
  { tipo: 'aprendido', titulo: 'Lo aprendido' },
  { tipo: 'para', titulo: 'Recados entre agentes' },
  { tipo: 'hecho', titulo: 'Lo último que hizo cada uno' },
]

function Memoria({ notas, onNota }) {
  const [regla, setRegla] = useState('')
  return (
    <section className="eq-mem">
      {GRUPOS.map(g => {
        const suyas = notas.filter(n => n.tipo === g.tipo)
        if (!suyas.length && g.tipo !== 'regla') return null
        return (
          <div key={g.tipo} className="eq-mem-grupo">
            <h4>{g.titulo}<span>{suyas.length}</span></h4>
            {g.sub && <p className="eq-mem-sub">{g.sub}</p>}
            {g.tipo === 'regla' && (
              <form className="eq-regla" onSubmit={(ev) => { ev.preventDefault(); if (regla.trim()) { onNota({ accion: 'crear', contenido: regla }); setRegla('') } }}>
                <textarea
                  value={regla} onChange={ev => setRegla(ev.target.value)} rows={2}
                  placeholder="Por ejemplo: nunca más de 45 segundos; el CTA siempre es «Comenta RASTRO»."
                  aria-label="Regla nueva"
                />
                <button type="submit" className="ag-btn sm" disabled={!regla.trim()}>Añadir regla</button>
              </form>
            )}
            <ul>
              {suyas.map(n => (
                <li key={n.id} className={`eq-nota${n.estado ? ` ${n.estado}` : ''}`}>
                  <p>{n.contenido}</p>
                  <footer>
                    <span>
                      {n.agente}{n.tipo === 'para' && ` → ${n.para_agente}`} · {diaCorto(n.updated_at)}
                      {n.estado === 'aceptada' && ' · aceptada'}{n.estado === 'descartada' && ' · descartada'}
                    </span>
                    <span className="eq-nota-acc">
                      {n.tipo === 'propuesta' && n.estado === 'pendiente' && (
                        <>
                          <button type="button" className="ag-btn sm" onClick={() => onNota({ id: n.id, accion: 'aceptar' })}>Aceptar</button>
                          <button type="button" className="ag-btn sm" onClick={() => onNota({ id: n.id, accion: 'descartar' })}>Descartar</button>
                        </>
                      )}
                      <button
                        type="button" className="eq-borrar" aria-label="Borrar la nota"
                        onClick={() => { if (window.confirm('¿Borrar esta nota de la memoria?')) onNota({ id: n.id, accion: 'borrar' }) }}
                      >
                        <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </span>
                  </footer>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
