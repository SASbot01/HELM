// Edición → Guiones: el calendario de guiones del perfil, visto desde la mesa
// de edición. Los escribe la estrategia (Claude con el conector de HELM o el
// Agent OS); aquí se ve en qué fase está cada uno en Drive y de cada guion sale
// su pedido de edición.
import { useMemo, useState } from 'react'
import { FolderOpen, Plus, ArrowRight, ScrollText, Send } from 'lucide-react'
import { Panel, Empty } from '../ui'
import { FASES, TIPOS, fechaCorta, estadoLabel, hoyISO } from './comun'

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'por_grabar', label: 'Por grabar' },
  { key: 'sin_editar', label: 'Sin editar' },
  { key: 'editado', label: 'Editados' },
  { key: 'publicado', label: 'Publicados' },
]

export default function Guiones({ datos, pedidoPorGuion, abrirPedido, nuevoPedido }) {
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null)
  const hoy = hoyISO()

  const lista = useMemo(() => datos.guiones
    .filter(g => filtro === 'todos' || g.fase === filtro)
    .sort((a, b) => a.fecha.localeCompare(b.fecha)), [datos.guiones, filtro])

  const cuenta = (k) => datos.guiones.filter(g => g.fase === k).length

  return (
    <Panel
      title="Guiones"
      action={datos.drive?.conectado
        ? <a className="helm-btn" href={datos.drive.url} target="_blank" rel="noopener noreferrer"><FolderOpen size={14} /> Carpeta de Drive</a>
        : null}
    >
      <div className="ed-filtros">
        {FILTROS.map(x => (
          <button key={x.key} className={'helm-stagepill' + (filtro === x.key ? ' on cyan' : '')} onClick={() => setFiltro(x.key)}>
            {x.label}{x.key !== 'todos' && <b>{cuenta(x.key)}</b>}
          </button>
        ))}
      </div>

      {!datos.drive?.conectado && (
        <p className="ed-suave ed-aviso">Este perfil no tiene carpeta en «HELM Contenido»: la fase sale solo de si el guion está marcado como grabado.</p>
      )}

      {lista.length === 0 ? (
        <Empty>No hay guiones {filtro === 'todos' ? 'en el calendario' : `en «${FASES[filtro]}»`}. Se escriben con Claude y el conector de HELM, y aparecen aquí.</Empty>
      ) : (
        <ul className="ed-guiones">
          {lista.map(g => {
            const p = pedidoPorGuion.get(g.id)
            const abiertoEste = abierto === g.id
            return (
              <li key={g.id} className={g.fecha < hoy && g.fase === 'por_grabar' ? 'atrasado' : ''}>
                <div className="ed-guion-fila" onClick={() => setAbierto(abiertoEste ? null : g.id)}>
                  <span className="ed-guion-fecha">{fechaCorta(g.fecha)}</span>
                  <div className="ed-guion-txt">
                    <b><ScrollText size={13} /> {g.titulo}</b>
                    <small>
                      <span className={'ed-fase f-' + g.fase}>{FASES[g.fase]}</span>
                      {g.tipo && <span className="ed-tipo">{TIPOS[g.tipo]}</span>}
                    </small>
                  </div>
                  {p ? (
                    <button className="helm-btn" onClick={(e) => { e.stopPropagation(); abrirPedido(p) }}>
                      {p.editor_client_id && <span className="ed-enviado"><Send size={12} /> {datos.editores?.find(x => x.id === p.editor_client_id)?.nombre || 'Editor'}</span>}
                      <span className={'ed-estado e-' + p.estado}>{estadoLabel(p.estado)}</span> <ArrowRight size={13} />
                    </button>
                  ) : (
                    <div className="ed-acciones" onClick={e => e.stopPropagation()}>
                      {/* Con editor compartido, lo normal es mandárselo: va primero. */}
                      {datos.editores?.map(ed => (
                        <button
                          key={ed.id} className="helm-btn primary"
                          onClick={() => nuevoPedido({ guion_id: g.id, titulo: g.titulo, entrega: g.fecha >= hoy ? g.fecha : '', editor_client_id: ed.id })}
                        >
                          <Send size={14} /> Enviar a {ed.nombre}
                        </button>
                      ))}
                      <button
                        className={'helm-btn' + (datos.editores?.length ? '' : ' primary')}
                        onClick={() => nuevoPedido({ guion_id: g.id, titulo: g.titulo, entrega: g.fecha >= hoy ? g.fecha : '' })}
                      >
                        <Plus size={14} /> Pedido
                      </button>
                    </div>
                  )}
                </div>
                {abiertoEste && <p className="ed-pre ed-guion-cuerpo">{g.guion || 'Sin texto.'}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
