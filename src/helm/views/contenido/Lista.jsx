// HELM — Guiones / Lista: las piezas del mes en líneas, como una base de
// datos, con la casilla de «grabado» a mano. El calendario responde a «qué toca
// cada día»; esto responde a «qué me queda por grabar y en qué punto está cada
// cosa», que es la pregunta del que tiene quince piezas y dos semanas.
//
// Es un componente de presentación: recibe las piezas ya cargadas y el
// vocabulario (estados, formatos) de Guiones.jsx, que sigue siendo el dueño
// de la tabla y de las escrituras. Aquí solo hay filtros, orden y selección.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ArrowUp, ArrowDown, ArrowUpDown, Search, Paperclip, FileText, Plus, Video } from 'lucide-react'
import { Empty } from '../../ui'
import './lista.css'

const pad = n => String(n).padStart(2, '0')
const HOY = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })()

// Buscar «grabacion» tiene que encontrar «Grabación»: se quitan tildes y
// mayúsculas antes de comparar.
const plano = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const diaSemana = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
const fechaCorta = (ts) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')

// Por debajo de este ancho la tabla se vuelve tarjetas. Se decide con
// matchMedia y no con CSS sobre <tr> porque una tabla «rota» a bloques con
// botones y selects dentro nunca queda bien: mejor pintar otra cosa.
const ANCHO_TARJETAS = 720
function useEstrecho() {
  const [estrecho, setEstrecho] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${ANCHO_TARJETAS}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${ANCHO_TARJETAS}px)`)
    const f = (e) => setEstrecho(e.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return estrecho
}

// La casilla de «grabado». Es un botón, no un checkbox nativo, para que sea
// grande y cómoda de pulsar y se anime al marcar. Se usa en la tabla, en las
// tarjetas y (vía GrabadoLinea) en la ficha y el panel del día.
export function GrabadoCheck({ on, onChange, label, disabled }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={!!on} aria-label={label}
      title={on ? 'Grabada · pulsa para desmarcar' : 'Marcar como grabada'}
      className={'helm-lista-check' + (on ? ' on' : '')}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
    >
      <Check strokeWidth={3} />
    </button>
  )
}

// Casilla + texto + fecha, para la ficha y el alta. Va junto al estado y se
// guarda igual que él: al pulsar, sin pasar por «Guardar».
export function GrabadoLinea({ on, at, onChange, disabled }) {
  return (
    <label className={'helm-lista-grabado-linea' + (on ? ' on' : '')}>
      <GrabadoCheck on={on} onChange={onChange} label="Grabado" disabled={disabled} />
      <span>{on ? 'Grabada' : 'Sin grabar'}</span>
      {on && at && <small>el {fechaCorta(at)}</small>}
    </label>
  )
}

function Responsable({ persona }) {
  if (!persona) return <span className="helm-lista-mut">—</span>
  return (
    <span className="helm-lista-resp" title={persona.name}>
      <i>{(persona.name || '?').trim().charAt(0).toUpperCase()}</i>
      <span>{persona.name}</span>
    </span>
  )
}

function EstadoSelect({ pieza, estados, estadoDe, onEstado }) {
  const v = estadoDe(pieza.status)
  return (
    <select
      className={'helm-lista-estado ' + v} value={v} aria-label={`Estado de ${pieza.title}`}
      onClick={e => e.stopPropagation()}
      onChange={e => onEstado(pieza, e.target.value)}
    >
      {estados.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
    </select>
  )
}

// Cabecera de columna ordenable. Vive en el módulo y no dentro de Lista: un
// componente definido durante el render es un tipo nuevo en cada pasada, y
// React desmonta y vuelve a montar el botón cada vez que se teclea en el
// buscador — con el foco perdiéndose por el camino.
function Orden({ k, orden, onOrdenar, children }) {
  const activo = orden.key === k
  return (
    <button
      type="button" className={'helm-lista-th-btn' + (activo ? ' on' : '')} onClick={() => onOrdenar(k)}
      aria-sort={activo ? (orden.dir === 1 ? 'ascending' : 'descending') : undefined}
    >
      {children}
      {activo ? (orden.dir === 1 ? <ArrowUp /> : <ArrowDown />) : <ArrowUpDown />}
    </button>
  )
}

export default function Lista({
  items, people, estados, formatos, estadoDe,
  onAbrir, onEstado, onGrabado, onEstadoLote, onGrabadoLote, onAñadir,
}) {
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('__all__')
  const [fFormato, setFFormato] = useState('__all__')
  const [fResp, setFResp] = useState('__all__')
  const [soloSinGrabar, setSoloSinGrabar] = useState(false)
  const [orden, setOrden] = useState({ key: 'dia', dir: 1 }) // dir: 1 asc, -1 desc
  const [sel, setSel] = useState(() => new Set())
  const estrecho = useEstrecho()
  const selTodos = useRef(null)

  const fmtLabel = (f) => formatos.find(x => x.key === f)?.label || f
  const personaDe = (id) => people.find(p => p.id === id)

  // Solo salen en el filtro de responsable quienes tienen alguna pieza este
  // mes: un desplegable con todo el equipo para un mes de dos piezas sobra.
  const responsables = useMemo(() => {
    const ids = new Set(items.map(i => i.assignee_id).filter(Boolean))
    return people.filter(p => ids.has(p.id))
  }, [items, people])
  const haySinAsignar = useMemo(() => items.some(i => !i.assignee_id), [items])

  const cuentaEstado = useMemo(() => {
    const acc = Object.fromEntries(estados.map(e => [e.key, 0]))
    for (const it of items) acc[estadoDe(it.status)]++
    return acc
  }, [items, estados, estadoDe])

  const grabadas = items.filter(i => i.grabado).length
  const pct = items.length ? Math.round(grabadas / items.length * 100) : 0

  const visibles = useMemo(() => {
    const idx = (st) => Math.max(0, estados.findIndex(e => e.key === estadoDe(st)))
    const qq = plano(q.trim())
    const lista = items.filter(it => {
      if (qq && !plano(it.title).includes(qq)) return false
      if (fEstado !== '__all__' && estadoDe(it.status) !== fEstado) return false
      if (fFormato !== '__all__' && it.format !== fFormato) return false
      if (fResp === '__none__' ? it.assignee_id : (fResp !== '__all__' && it.assignee_id !== fResp)) return false
      if (soloSinGrabar && it.grabado) return false
      return true
    })
    const cmp = {
      dia:     (a, b) => a.date.localeCompare(b.date) || (a.created_at || '').localeCompare(b.created_at || ''),
      titulo:  (a, b) => (a.title || '').localeCompare(b.title || '', 'es'),
      estado:  (a, b) => idx(a.status) - idx(b.status) || a.date.localeCompare(b.date),
      grabado: (a, b) => Number(!!a.grabado) - Number(!!b.grabado) || a.date.localeCompare(b.date),
    }[orden.key]
    return lista.sort((a, b) => cmp(a, b) * orden.dir)
  }, [items, q, fEstado, fFormato, fResp, soloSinGrabar, orden, estados, estadoDe])

  const idsVisibles = visibles.map(i => i.id)
  const todosSel = idsVisibles.length > 0 && idsVisibles.every(id => sel.has(id))
  const algunoSel = idsVisibles.some(id => sel.has(id))
  useEffect(() => { if (selTodos.current) selTodos.current.indeterminate = algunoSel && !todosSel }, [algunoSel, todosSel])

  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleTodos = () => setSel(s => {
    const n = new Set(s)
    if (todosSel) idsVisibles.forEach(id => n.delete(id)); else idsVisibles.forEach(id => n.add(id))
    return n
  })
  const ordenar = (key) => setOrden(o => o.key === key ? { key, dir: -o.dir } : { key, dir: 1 })

  // Una pieza seleccionada puede haber desaparecido (se borró, cambió de mes).
  // Se descarta aquí, al usar la selección, en vez de limpiarla en un efecto:
  // el resultado es el mismo y no cuesta un render extra.
  const idsSel = useMemo(() => {
    const ids = new Set(items.map(i => i.id))
    return [...sel].filter(id => ids.has(id))
  }, [items, sel])
  const loteGrabado = (v) => { onGrabadoLote(idsSel, v); setSel(new Set()) }
  const loteEstado = (e) => { if (!e.target.value) return; onEstadoLote(idsSel, e.target.value); setSel(new Set()); e.target.value = '' }

  const hayFiltros = q || fEstado !== '__all__' || fFormato !== '__all__' || fResp !== '__all__' || soloSinGrabar

  return (
    <div className="helm-lista">
      <div className={'helm-lista-progreso' + (items.length && grabadas === items.length ? ' completo' : '')}>
        <b>{grabadas} de {items.length} grabadas</b>
        <div className="helm-lista-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ '--p': pct / 100 }} />
        </div>
        <small>{pct}%{hayFiltros && ` · ${visibles.length} en la vista`}</small>
      </div>

      <div className="helm-lista-filtros">
        <div className="helm-lista-buscar">
          <Search size={14} />
          <input className="helm-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título" aria-label="Buscar por título" />
        </div>
        <div className="helm-lista-sep" />
        <div className="helm-chips" aria-label="Estado">
          <button className={'helm-chip' + (fEstado === '__all__' ? ' active' : '')} onClick={() => setFEstado('__all__')}>Todas</button>
          {estados.map(e => (
            <button key={e.key} className={'helm-chip' + (fEstado === e.key ? ' active' : '')} onClick={() => setFEstado(e.key)}>
              {e.label} <b>{cuentaEstado[e.key] || 0}</b>
            </button>
          ))}
        </div>
        <div className="helm-lista-sep" />
        <div className="helm-chips" aria-label="Formato">
          {formatos.map(x => (
            <button key={x.key} className={'helm-chip' + (fFormato === x.key ? ' active' : '')}
              onClick={() => setFFormato(f => f === x.key ? '__all__' : x.key)}>{x.label}</button>
          ))}
        </div>
        {(responsables.length > 0 || haySinAsignar) && (
          <select className="helm-select" value={fResp} onChange={e => setFResp(e.target.value)} aria-label="Responsable">
            <option value="__all__">Cualquier responsable</option>
            {responsables.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {haySinAsignar && <option value="__none__">Sin asignar</option>}
          </select>
        )}
        <div className="helm-lista-sep" />
        <button className={'helm-chip helm-lista-pendientes' + (soloSinGrabar ? ' active' : '')} aria-pressed={soloSinGrabar}
          onClick={() => setSoloSinGrabar(v => !v)}>
          <Video /> Solo sin grabar
        </button>
      </div>

      {/* Barra de lote: solo cuando hay algo seleccionado. Es lo que convierte
          la tabla en herramienta cuando hay quince piezas que grabar. */}
      {sel.size > 0 && (
        <div className="helm-lista-lote" role="toolbar" aria-label="Acciones sobre la selección">
          <b><em>{sel.size}</em> {sel.size === 1 ? 'seleccionada' : 'seleccionadas'}</b>
          <button className="helm-btn sm" onClick={() => loteGrabado(true)}><Check /> Marcar como grabadas</button>
          <button className="helm-btn sm" onClick={() => loteGrabado(false)}>Desmarcar</button>
          <select className="helm-select" defaultValue="" onChange={loteEstado} aria-label="Cambiar estado a">
            <option value="" disabled>Cambiar estado a…</option>
            {estados.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
          <button className="helm-btn sm helm-lista-quitar" onClick={() => setSel(new Set())}>Quitar selección</button>
        </div>
      )}

      {items.length === 0 ? (
        <Empty>
          <div>Nada programado este mes.</div>
          <button className="helm-btn helm-lista-vacio-cta" onClick={onAñadir}><Plus /> Nueva pieza</button>
        </Empty>
      ) : visibles.length === 0 ? (
        <Empty>Ninguna pieza coincide con los filtros.</Empty>
      ) : estrecho ? (
        <div className="helm-lista-cards">
          {visibles.map(it => {
            const adj = Array.isArray(it.attachments) ? it.attachments.length : 0
            return (
              <div key={it.id} className={'helm-lista-card' + (it.grabado ? ' grabada' : '') + (sel.has(it.id) ? ' sel' : '')}>
                <GrabadoCheck on={it.grabado} onChange={(v) => onGrabado(it, v)} label={`Grabada: ${it.title}`} />
                <button className="helm-lista-titulo" onClick={() => onAbrir(it)}>{it.title}</button>
                <input type="checkbox" className="helm-lista-selbox" checked={sel.has(it.id)} onChange={() => toggleSel(it.id)} aria-label={`Seleccionar ${it.title}`} />
                <div className="helm-lista-card-meta">
                  <span className={'helm-lista-c-dia' + (it.date === HOY ? ' hoy' : '')}><b>{it.date.slice(8, 10)}</b><small>{diaSemana(it.date)}</small></span>
                  <span className="helm-lista-fmt">{fmtLabel(it.format)}</span>
                  <Responsable persona={personaDe(it.assignee_id)} />
                  <span className={'helm-lista-si' + (it.body ? '' : ' no')}><FileText /> {it.body ? 'guion' : 'sin guion'}</span>
                  {adj > 0 && <span className="helm-lista-si"><Paperclip /> {adj}</span>}
                </div>
                <div className="helm-lista-card-foot">
                  <EstadoSelect pieza={it} estados={estados} estadoDe={estadoDe} onEstado={onEstado} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="helm-lista-wrap">
          <table className="helm-lista-tabla">
            <thead>
              <tr>
                <th className="helm-lista-c-sel">
                  <input ref={selTodos} type="checkbox" className="helm-lista-selbox" checked={todosSel} onChange={toggleTodos}
                    aria-label={todosSel ? 'Quitar la selección de todas' : 'Seleccionar todas las visibles'} />
                </th>
                <th className="helm-lista-c-grab"><Orden k="grabado" orden={orden} onOrdenar={ordenar}><Check /></Orden></th>
                <th className="helm-lista-c-dia"><Orden k="dia" orden={orden} onOrdenar={ordenar}>Día</Orden></th>
                <th className="helm-lista-c-tit"><Orden k="titulo" orden={orden} onOrdenar={ordenar}>Título</Orden></th>
                <th className="helm-lista-c-fmt">Formato</th>
                <th className="helm-lista-c-est"><Orden k="estado" orden={orden} onOrdenar={ordenar}>Estado</Orden></th>
                <th className="helm-lista-c-resp">Responsable</th>
                <th className="helm-lista-c-guion">Guion</th>
                <th className="helm-lista-c-adj">Adjuntos</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(it => {
                const adj = Array.isArray(it.attachments) ? it.attachments.length : 0
                return (
                  <tr key={it.id} className={(it.grabado ? 'grabada' : '') + (sel.has(it.id) ? ' sel' : '')}>
                    <td className="helm-lista-c-sel">
                      <input type="checkbox" className="helm-lista-selbox" checked={sel.has(it.id)} onChange={() => toggleSel(it.id)} aria-label={`Seleccionar ${it.title}`} />
                    </td>
                    <td className="helm-lista-c-grab">
                      <GrabadoCheck on={it.grabado} onChange={(v) => onGrabado(it, v)} label={`Grabada: ${it.title}`} />
                    </td>
                    <td className={'helm-lista-c-dia' + (it.date === HOY ? ' hoy' : '')}>
                      <b>{it.date.slice(8, 10)}</b><small>{diaSemana(it.date)}</small>
                    </td>
                    <td className="helm-lista-c-tit">
                      <button className="helm-lista-titulo" onClick={() => onAbrir(it)} title={it.title}>{it.title}</button>
                    </td>
                    <td className="helm-lista-c-fmt"><span className="helm-lista-fmt">{fmtLabel(it.format)}</span></td>
                    <td className="helm-lista-c-est">
                      <EstadoSelect pieza={it} estados={estados} estadoDe={estadoDe} onEstado={onEstado} />
                    </td>
                    <td className="helm-lista-c-resp"><Responsable persona={personaDe(it.assignee_id)} /></td>
                    <td className="helm-lista-c-guion">
                      <span className={'helm-lista-si' + (it.body ? '' : ' no')} title={it.body ? `Guion de ${it.body.length} caracteres` : 'Sin guion'}>
                        <FileText /> {it.body ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="helm-lista-c-adj">
                      {adj > 0
                        ? <span className="helm-lista-si"><Paperclip /> {adj}</span>
                        : <span className="helm-lista-mut">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
