// Edición → Pedidos: el mes en calendario y el flujo en tablero.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Columns3, ScrollText } from 'lucide-react'
import { Panel } from '../ui'
import { ESTADOS, eur, fechaCorta, cuandoLabel, diasHasta, formatoCorto, hoyISO, FASES } from './comun'

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export default function Pedidos(props) {
  const [vista, setVista] = useState('calendario')
  return (
    <Panel
      title="Pedidos"
      action={(
        <div className="ed-acciones">
          <div className="helm-vista-tabs">
            <button className={'helm-vista-tab' + (vista === 'calendario' ? ' active' : '')} onClick={() => setVista('calendario')}><CalendarDays size={14} /> Calendario</button>
            <button className={'helm-vista-tab' + (vista === 'tablero' ? ' active' : '')} onClick={() => setVista('tablero')}><Columns3 size={14} /> Flujo</button>
          </div>
          <button className="helm-btn primary" onClick={() => props.nuevoPedido({})}><Plus size={15} /> Nuevo pedido</button>
        </div>
      )}
    >
      {vista === 'calendario' ? <Calendario {...props} /> : <Tablero {...props} />}
    </Panel>
  )
}

// ── El mes ──────────────────────────────────────────────────────────────────
// Los pedidos por su fecha límite, con su formato en color, y los guiones que
// aún no tienen pedido en tenue: así se ve lo que viene antes de que llegue.
function Calendario({ datos, pedidoPorGuion, abrirPedido, nuevoPedido }) {
  const [ref, setRef] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const hoy = hoyISO()

  const celdas = useMemo(() => {
    const primero = new Date(ref.y, ref.m, 1)
    const hueco = (primero.getDay() + 6) % 7   // lunes primero
    const n = new Date(ref.y, ref.m + 1, 0).getDate()
    return [...Array(hueco).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)]
  }, [ref])

  const porDia = useMemo(() => {
    const acc = {}
    for (const p of datos.pedidos) if (p.entrega) (acc[p.entrega] ||= { pedidos: [], guiones: [] }).pedidos.push(p)
    for (const g of datos.guiones) {
      if (!pedidoPorGuion.has(g.id)) (acc[g.fecha] ||= { pedidos: [], guiones: [] }).guiones.push(g)
    }
    return acc
  }, [datos, pedidoPorGuion])

  const mueve = (d) => setRef(r => { const x = new Date(r.y, r.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() } })
  const mes = new Date(ref.y, ref.m, 1).toLocaleDateString('es-ES', { month: 'long' })
  const titulo = `${mes[0].toUpperCase()}${mes.slice(1)} ${ref.y}`

  return (
    <div className="ed-cal">
      <div className="ed-cal-cab">
        <button className="helm-btn" onClick={() => mueve(-1)} aria-label="Mes anterior"><ChevronLeft size={15} /></button>
        <b>{titulo}</b>
        <button className="helm-btn" onClick={() => mueve(1)} aria-label="Mes siguiente"><ChevronRight size={15} /></button>
        <div className="ed-leyenda">
          <span><i className="f-short" /> Short / TikTok</span>
          <span><i className="f-largo" /> YouTube horizontal</span>
          <span><i className="f-revision" /> Revisión</span>
          <span><i className="f-guion" /> Guion sin pedido</span>
        </div>
      </div>
      <div className="ed-cal-rejilla">
        {DIAS.map(d => <div key={d} className="ed-cal-dow">{d}</div>)}
        {celdas.map((d, i) => {
          if (!d) return <div key={'v' + i} className="ed-cal-dia vacio" />
          const k = iso(ref.y, ref.m, d)
          const hay = porDia[k]
          return (
            <div
              key={k}
              className={'ed-cal-dia' + (k === hoy ? ' hoy' : '') + (k < hoy ? ' pasado' : '')}
              onDoubleClick={() => nuevoPedido({ entrega: k })}
              title="Doble clic para un pedido con esta fecha"
            >
              <span className="ed-cal-n">{d}</span>
              {hay?.pedidos.map(p => (
                <button
                  key={p.id} type="button"
                  className={`ed-chip f-${p.formato} e-${p.estado}`}
                  onClick={() => abrirPedido(p)}
                  title={`${p.titulo} · ${ESTADOS.find(e => e.key === p.estado)?.label}`}
                >
                  {p.titulo}
                </button>
              ))}
              {hay?.guiones.map(g => (
                <button
                  key={g.id} type="button" className="ed-chip f-guion"
                  onClick={() => nuevoPedido({ guion_id: g.id, titulo: g.titulo, entrega: g.fecha >= hoy ? g.fecha : '' })}
                  title={`Guion · ${FASES[g.fase]} — clic para abrir su pedido`}
                >
                  <ScrollText size={10} /> {g.titulo}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── El flujo ────────────────────────────────────────────────────────────────
function Tablero({ datos, clientePor, abrirPedido, cambiarEstado }) {
  const [sobre, setSobre] = useState(null)
  const porEstado = useMemo(() => {
    const acc = Object.fromEntries(ESTADOS.map(e => [e.key, []]))
    for (const p of datos.pedidos) (acc[p.estado] || acc.guion).push(p)
    for (const k of Object.keys(acc)) acc[k].sort((a, b) => String(a.entrega || '9').localeCompare(String(b.entrega || '9')))
    return acc
  }, [datos.pedidos])

  return (
    <div className="ed-flujo">
      {ESTADOS.map(e => (
        <div
          key={e.key}
          className={'ed-col' + (sobre === e.key ? ' sobre' : '')}
          onDragOver={ev => { ev.preventDefault(); setSobre(e.key) }}
          onDragLeave={() => setSobre(null)}
          onDrop={ev => {
            ev.preventDefault(); setSobre(null)
            const p = datos.pedidos.find(x => x.id === ev.dataTransfer.getData('text/plain'))
            if (p && p.estado !== e.key) cambiarEstado(p, e.key)
          }}
        >
          <div className="ed-col-cab">
            <span className={'ed-estado e-' + e.key}>{e.label}</span>
            <small>{porEstado[e.key].length}</small>
          </div>
          {porEstado[e.key].map(p => {
            const n = diasHasta(p.entrega)
            return (
              <article
                key={p.id} className={`ed-tarjeta f-${p.formato}`} draggable
                onDragStart={ev => ev.dataTransfer.setData('text/plain', p.id)}
                onClick={() => abrirPedido(p)}
              >
                <b>{p.titulo}</b>
                <small>{[clientePor.get(p.cliente_id)?.nombre, formatoCorto(p.formato), p.clips > 1 && `${p.clips} clips`].filter(Boolean).join(' · ')}</small>
                <div className="ed-tarjeta-pie">
                  {p.entrega
                    ? <span className={'ed-cuenta' + (e.key !== 'entregado' && n < 0 ? ' vencido' : e.key !== 'entregado' && n <= 1 ? ' ya' : '')}>{e.key === 'entregado' ? fechaCorta(p.entrega) : cuandoLabel(p.entrega)}</span>
                    : <span className="ed-suave">Sin fecha</span>}
                  {Number(p.precio) > 0 && <span className="ed-precio">{eur(p.precio)}</span>}
                </div>
                {p.guion_id && <span className="ed-marca-guion" title="Enlazado a un guion"><ScrollText size={11} /></span>}
              </article>
            )
          })}
          {porEstado[e.key].length === 0 && <div className="ed-col-vacia">Arrastra aquí</div>}
        </div>
      ))}
    </div>
  )
}
