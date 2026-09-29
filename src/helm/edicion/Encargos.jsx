// Edición → Encargos: la bandeja del editor compartido.
//
// Solo sale en un perfil dado de alta como mesa de edición. Aquí llega lo que
// le envían los demás perfiles desde su Edición, agrupado por quién lo manda,
// con lo nuevo arriba y marcado. Al abrir un encargo deja de ser nuevo, y el
// perfil que lo envió ve que ya lo tiene.
import { useMemo } from 'react'
import { Inbox, ScrollText, FolderOpen, Timer } from 'lucide-react'
import { Panel, Empty } from '../ui'
import { estadoLabel, formatoCorto, fechaCorta, cuandoLabel, diasHasta, FASES } from './comun'

export default function Encargos({ datos, abrirPedido }) {
  const grupos = useMemo(() => {
    const acc = new Map()
    for (const p of datos.pedidos.filter(x => x.recibido)) {
      const k = p.origen?.id || 'otro'
      if (!acc.has(k)) acc.set(k, { origen: p.origen, pedidos: [] })
      acc.get(k).pedidos.push(p)
    }
    // Dentro de cada perfil: lo nuevo primero, luego lo que vence antes, y lo
    // entregado al final.
    const orden = (p) => [p.estado === 'entregado' ? 1 : 0, p.visto_at ? 1 : 0, p.entrega || '9999']
    for (const g of acc.values()) {
      g.pedidos.sort((a, b) => {
        const [x, y] = [orden(a), orden(b)]
        return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2]))
      })
    }
    return [...acc.values()].sort((a, b) => a.origen?.nombre.localeCompare(b.origen?.nombre))
  }, [datos.pedidos])

  if (!grupos.length) {
    return (
      <Panel title="Encargos">
        <Empty>
          <Inbox size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.6 }} />
          Aún no te han enviado nada. Cuando un perfil te mande un guion desde su sección Edición, aparecerá aquí.
        </Empty>
      </Panel>
    )
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      {grupos.map(g => {
        const nuevos = g.pedidos.filter(p => !p.visto_at).length
        const abiertos = g.pedidos.filter(p => p.estado !== 'entregado').length
        return (
          <Panel
            key={g.origen?.id}
            title={<span className="ed-origen-titulo">{g.origen?.nombre} {nuevos > 0 && <b className="ed-nuevos">{nuevos} nuevo{nuevos === 1 ? '' : 's'}</b>}</span>}
            action={<span className="ed-suave">{abiertos} en marcha · {g.pedidos.length} en total</span>}
          >
            <ul className="ed-encargos">
              {g.pedidos.map(p => {
                const n = diasHasta(p.entrega)
                const g2 = p.guion_info
                return (
                  <li key={p.id} className={(p.visto_at ? '' : 'nuevo ') + (p.estado === 'entregado' ? 'hecho' : '')} onClick={() => abrirPedido(p)}>
                    {!p.visto_at && <span className="ed-punto" aria-label="Nuevo" />}
                    <div className="ed-encargo-txt">
                      <b>{p.titulo}</b>
                      <small>
                        {formatoCorto(p.formato)}
                        {p.clips > 1 && ` · ${p.clips} clips`}
                        {g2 && <> · <ScrollText size={11} /> guion {FASES[g2.fase]?.toLowerCase()}</>}
                        {p.enviado_at && ` · enviado ${fechaCorta(p.enviado_at.slice(0, 10))}`}
                      </small>
                    </div>
                    {p.drive_url && (
                      <a className="helm-btn" href={p.drive_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Material en Drive">
                        <FolderOpen size={14} />
                      </a>
                    )}
                    {p.entrega && p.estado !== 'entregado'
                      ? <span className={'ed-cuenta' + (n < 0 ? ' vencido' : n <= 1 ? ' ya' : '')}><Timer size={12} /> {cuandoLabel(p.entrega)}</span>
                      : <span className="ed-suave">{p.entrega ? fechaCorta(p.entrega) : 'Sin fecha'}</span>}
                    <span className={'ed-estado e-' + p.estado}>{estadoLabel(p.estado)}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}
