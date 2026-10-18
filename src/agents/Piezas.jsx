// Agent OS — las piezas que comparten /agents (el taller del operador) y la
// sección Agentes de cada perfil de HELM. Mismo aspecto en los dos sitios:
// cambia quién puede editar, no cómo se lee.
import { Link } from 'react-router-dom'
import {
  ScatterChart, PenLine, FolderSync, FileBarChart, UserSquare, Brain, Clapperboard, Workflow, ArrowRight, Scissors, Image as ImagenIcono,
  MessagesSquare, Shuffle } from 'lucide-react'
import { ESTADOS as ESTADOS_AGENTE } from './agentes'
import { ROLES, rol, compacto } from './ganchos'

const ICONOS = {
  grafica: ScatterChart, pluma: PenLine, carpeta: FolderSync, informe: FileBarChart,
  persona: UserSquare, memoria: Brain, contenido: Clapperboard, equipo: Workflow, editor: Scissors, portadas: ImagenIcono,
  setter: MessagesSquare, trial: Shuffle,
}

// ── El menú de agentes: una casilla por agente ──────────────────────────────
// `ruta` navega (en /agents); `onAbrir` es para donde no hay rutas propias
// (dentro de HELM). Los que están por construir se ven, pero no se entra.
export function MenuAgentes({ agentes, metricaDe = () => null, onAbrir }) {
  return (
    <div className="ag-rejilla">
      {agentes.map(a => <Casilla key={a.key} a={a} metrica={metricaDe(a)} onAbrir={onAbrir} />)}
    </div>
  )
}

function Casilla({ a, metrica, onAbrir }) {
  const Icono = ICONOS[a.icono] || ScatterChart
  const est = ESTADOS_AGENTE[a.estado] || ESTADOS_AGENTE.construido
  // `abrible` deja abrir una casilla aún «en construcción» para ver su proceso,
  // sin enseñarla como activa: lo usa el editor de reels (el render aún no está).
  const entrable = a.estado === 'activo' || a.abrible

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
          : <span className={`ag-estado ${est.tono}`}>{est.label}</span>}
        {entrable && <ArrowRight size={15} strokeWidth={2} className="ag-cas-flecha" aria-hidden="true" />}
      </footer>
    </>
  )

  if (!entrable) return <article className="ag-casilla pendiente" aria-disabled="true">{cuerpo}</article>
  if (onAbrir) return <button type="button" className="ag-casilla" onClick={() => onAbrir(a.key)}>{cuerpo}</button>
  return <Link className="ag-casilla" to={a.ruta}>{cuerpo}</Link>
}

// ── Los creadores, agrupados por tipo de contenido ──────────────────────────
// Cada tarjeta dice quién es, de qué va y cuánto material hay de él.
// `acciones(i)` añade botones (Editar, Borrar) donde se puede editar.
export function CreadoresGrid({ creadores, onAbrir, acciones }) {
  const grupos = new Map()
  for (const i of creadores) {
    const k = i.categoria || ''
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(i)
  }
  const orden = [...grupos].sort(([a], [b]) => (!a) - (!b) || a.localeCompare(b))

  return orden.map(([cat, grupo]) => (
    <section key={cat || '-'} className="ag-grupo">
      <h2 className="ag-seccion">{cat || 'Sin tipo de contenido'} <span>{grupo.length}</span></h2>
      <div className="ag-creadores">
        {grupo.map(i => (
          <article key={i.id} className="ag-creador">
            <button type="button" className="ag-creador-abrir" onClick={() => onAbrir(i.slug)}>
              <span className="ag-avatar" aria-hidden="true">{i.nombre.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase()}</span>
              <span className="ag-creador-txt">
                <b>{i.nombre}</b>
                <span>{i.descripcion || 'Sin descripción todavía'}</span>
              </span>
            </button>
            <footer>
              <span><b>{i.reels ?? 0}</b> reels</span>
              <span><b>{i.analizados ?? 0}</b> analizados</span>
              {i.max_vistas ? <span><b>{compacto(i.max_vistas)}</b> el más visto</span> : null}
              {acciones && <span className="ag-creador-acc">{acciones(i)}</span>}
            </footer>
          </article>
        ))}
      </div>
    </section>
  ))
}

// ── El guion de un reel, frase a frase con su papel ─────────────────────────
export function Guion({ reel }) {
  if (reel.frases?.length) {
    const etiquetado = reel.estado === 'etiquetado'
    return (
      <>
        {etiquetado && (
          <div className="ag-roles">
            {ROLES.map(r => <span key={r.key}><i style={{ background: r.color }} />{r.label}</span>)}
          </div>
        )}
        <ol className="ag-guion">
          {reel.frases.map((f, i) => {
            // Sin etiquetar, los papeles no significan nada: se pinta neutro.
            const r = etiquetado ? rol(f.rol) : null
            return (
              <li key={i} className={r ? `rol-${r.key}` : ''}>
                <span className="ag-rol" style={{ background: r?.color || 'var(--border)' }} aria-label={r?.label} />
                <span className="ag-frase">{f.texto}</span>
              </li>
            )
          })}
        </ol>
      </>
    )
  }
  if (reel.transcripcion) return <p className="ag-transcripcion">{reel.transcripcion}</p>
  return null
}
