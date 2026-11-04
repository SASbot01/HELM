// HELM — La Fábrica: los procesos internos que la plataforma lleva sobre este
// perfil. No es el CRM del cliente (eso son sus leads): es el tablero de trabajo
// de Alex sobre el negocio, invisible para el cliente y su equipo. Solo lo ve la
// plataforma (el recuadro se gatea en HelmApp y el endpoint con requirePlataforma).
//
// Carriles = agentes-función (pestañas). Columnas = estados. Las tarjetas se
// arrastran de una columna a otra para cambiar de estado; al pulsarlas se abre
// el detalle con sus notas de avance.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Factory, Plus, Trash2, StickyNote } from 'lucide-react'
import { fabricaApi } from '../lib'
import { Empty, Modal } from '../ui'
import './fabrica.css'

const AGENTES = ['Estrategia', 'Marketing y contenido', 'Comercial y ventas', 'Seguridad y legal', 'Operaciones y entrega']
const ESTADOS = [
  { key: 'backlog', label: 'Por hacer', tono: '' },
  { key: 'curso', label: 'En curso', tono: 'cyan' },
  { key: 'revision', label: 'En revisión · comité', tono: 'amber' },
  { key: 'bloqueada', label: 'Bloqueada', tono: 'red' },
  { key: 'hecho', label: 'Hecho', tono: 'green' },
]

export default function Fabrica({ clientId, client }) {
  const [tareas, setTareas] = useState(null)
  const [error, setError] = useState(null)
  const [agente, setAgente] = useState(AGENTES[0])
  const [sel, setSel] = useState(null)          // tarea abierta en el detalle
  const [arrastrando, setArrastrando] = useState(null)
  const [nueva, setNueva] = useState('')        // título de la tarea que se crea
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(
    () => fabricaApi.lista(clientId).then(d => { setTareas(d.tareas || []); setError(null) }).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])

  const reemplaza = (t) => setTareas(ts => (ts || []).map(x => x.id === t.id ? t : x))
  const quita = (id) => setTareas(ts => (ts || []).filter(x => x.id !== id))

  const delAgente = useMemo(() => (tareas || []).filter(t => t.agente === agente), [tareas, agente])
  const cuenta = useMemo(() => {
    const m = {}; for (const t of tareas || []) m[t.agente] = (m[t.agente] || 0) + 1; return m
  }, [tareas])

  async function mover(t, estado) {
    if (t.estado === estado) return
    setTareas(ts => ts.map(x => x.id === t.id ? { ...x, estado } : x))   // optimista
    try { reemplaza(await fabricaApi.mover(clientId, t.id, { estado }).then(r => r.tarea)) }
    catch (e) { setError(e.message); cargar() }
  }

  async function crear() {
    const titulo = nueva.trim()
    if (!titulo) return
    setGuardando(true)
    try {
      const { tarea } = await fabricaApi.crear(clientId, { titulo, agente, estado: 'backlog' })
      setTareas(ts => [...(ts || []), tarea]); setNueva('')
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  if (error && !tareas) return <Empty>{error}</Empty>
  if (!tareas) return <Empty>Cargando la fábrica…</Empty>

  return (
    <div className="fab">
      <header className="fab-cab">
        <p className="fab-sub"><Factory size={15} /> Los procesos internos sobre <b>{client?.name || 'este perfil'}</b>. Privado de la plataforma: el cliente no lo ve.</p>
        <div className="fab-nueva">
          <input value={nueva} onChange={e => setNueva(e.target.value)} placeholder={`Nueva tarea en ${agente}…`}
            onKeyDown={e => { if (e.key === 'Enter') crear() }} />
          <button className="fab-add" onClick={crear} disabled={guardando || !nueva.trim()}><Plus size={15} /> Añadir</button>
        </div>
      </header>

      <div className="fab-tabs">
        {AGENTES.map(a => (
          <button key={a} className={'fab-tab' + (a === agente ? ' on' : '')} onClick={() => setAgente(a)}>
            {a} <span className="fab-pill">{cuenta[a] || 0}</span>
          </button>
        ))}
      </div>

      {error && <div className="fab-error">{error}</div>}

      <div className="fab-board">
        {ESTADOS.map(col => {
          const items = delAgente.filter(t => t.estado === col.key)
          return (
            <div key={col.key} className="fab-col" data-tono={col.tono}
              onDragOver={e => { e.preventDefault() }}
              onDrop={() => { if (arrastrando) { mover(arrastrando, col.key); setArrastrando(null) } }}>
              <div className="fab-col-cab"><span className="fab-dot" />{col.label}<span className="fab-n">{items.length}</span></div>
              <div className="fab-col-body">
                {items.map(t => (
                  <article key={t.id} className="fab-card" draggable
                    onDragStart={() => setArrastrando(t)} onDragEnd={() => setArrastrando(null)}
                    onClick={() => setSel(t)}>
                    <div className="fab-card-top">
                      {t.fase && <span className="fab-fase">Fase {t.fase}</span>}
                      {Array.isArray(t.notas) && t.notas.length > 0 && <span className="fab-notas"><StickyNote size={12} />{t.notas.length}</span>}
                    </div>
                    <p className="fab-card-tit">{t.titulo}</p>
                    {t.detalle && <p className="fab-card-det">{t.detalle}</p>}
                  </article>
                ))}
                {!items.length && <div className="fab-vacio">—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {sel && (
        <Detalle
          key={sel.id} clientId={clientId} tarea={tareas.find(t => t.id === sel.id) || sel}
          onClose={() => setSel(null)} onChange={reemplaza} onDelete={id => { quita(id); setSel(null) }}
          onError={setError}
        />
      )}
    </div>
  )
}

function Detalle({ clientId, tarea, onClose, onChange, onDelete, onError }) {
  const [nota, setNota] = useState('')
  const [detalle, setDetalle] = useState(tarea.detalle || '')
  const [ocupado, setOcupado] = useState(false)

  const hacer = async (fn) => { setOcupado(true); try { onChange(await fn()); onError(null) } catch (e) { onError(e.message) } finally { setOcupado(false) } }

  const cambiarAgente = (a) => hacer(() => fabricaApi.editar(clientId, tarea.id, { agente: a }).then(r => r.tarea))
  const mover = (estado) => hacer(() => fabricaApi.mover(clientId, tarea.id, { estado }).then(r => r.tarea))
  const guardarDetalle = () => hacer(() => fabricaApi.editar(clientId, tarea.id, { detalle }).then(r => r.tarea))
  const anotar = async () => { const texto = nota.trim(); if (!texto) return; await hacer(() => fabricaApi.anotar(clientId, tarea.id, texto).then(r => r.tarea)); setNota('') }

  async function borrar() {
    if (!confirm(`¿Borrar la tarea «${tarea.titulo}»?`)) return
    setOcupado(true)
    try { await fabricaApi.borrar(clientId, tarea.id); onDelete(tarea.id) } catch (e) { onError(e.message); setOcupado(false) }
  }

  return (
    <Modal title={tarea.titulo} onClose={onClose} wide>
      <div className="fab-det">
        <label className="fab-lab">Agente</label>
        <select className="fab-select" value={tarea.agente} disabled={ocupado} onChange={e => cambiarAgente(e.target.value)}>
          {AGENTES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <label className="fab-lab">Estado</label>
        <div className="fab-estados">
          {ESTADOS.map(e => (
            <button key={e.key} className={'fab-est' + (tarea.estado === e.key ? ' on' : '')} data-tono={e.tono}
              disabled={ocupado} onClick={() => mover(e.key)}>{e.label}</button>
          ))}
        </div>

        <label className="fab-lab">Detalle</label>
        <textarea className="fab-textarea" rows={3} value={detalle} disabled={ocupado}
          onChange={e => setDetalle(e.target.value)} onBlur={guardarDetalle} placeholder="En qué consiste esta tarea…" />

        <label className="fab-lab">Notas de avance</label>
        <div className="fab-historial">
          {(tarea.notas || []).length === 0 && <p className="fab-vacio2">Sin notas todavía.</p>}
          {(tarea.notas || []).slice().reverse().map((n, i) => (
            <div key={i} className="fab-nota"><span className="fab-nota-f">{n.fecha}</span>{n.texto}</div>
          ))}
        </div>
        <div className="fab-nueva">
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Añadir nota de avance…"
            disabled={ocupado} onKeyDown={e => { if (e.key === 'Enter') anotar() }} />
          <button className="fab-add" onClick={anotar} disabled={ocupado || !nota.trim()}><Plus size={15} /> Nota</button>
        </div>

        <footer className="fab-det-pie">
          <button className="fab-borrar" onClick={borrar} disabled={ocupado}><Trash2 size={15} /> Borrar tarea</button>
        </footer>
      </div>
    </Modal>
  )
}
