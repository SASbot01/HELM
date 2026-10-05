// Edición → Panel: cómo va el mes de un vistazo.
import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Timer, ArrowRight, Inbox } from 'lucide-react'
import { Kpi, Panel, Empty } from '../ui'
import {
  edicionApi, eur, estadoCobro, mismoMes, diasHasta, cuandoLabel, fechaCorta,
  estadoLabel, formatoCorto,
} from './comun'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export default function PanelEdicion({ clientId, datos, clientePor, recargar, abrirPedido, irA }) {
  const { pedidos, cobros } = datos

  const k = useMemo(() => {
    const activos = pedidos.filter(p => p.estado !== 'entregado')
    const facturadoMes = cobros.filter(c => mismoMes(c.created_at)).reduce((a, c) => a + Number(c.importe), 0)
    const cobradoMes = cobros.filter(c => c.estado === 'cobrado' && mismoMes(c.cobrado_at)).reduce((a, c) => a + Number(c.importe), 0)
    const pendiente = cobros.filter(c => c.estado !== 'cobrado').reduce((a, c) => a + Number(c.importe), 0)
    const atrasado = cobros.filter(c => estadoCobro(c) === 'atrasado').reduce((a, c) => a + Number(c.importe), 0)
    const cobradoTotal = cobros.filter(c => c.estado === 'cobrado').reduce((a, c) => a + Number(c.importe), 0)
    const proxima = activos.filter(p => p.entrega && diasHasta(p.entrega) >= 0)
      .sort((a, b) => a.entrega.localeCompare(b.entrega))[0]
    return {
      facturadoMes, cobradoMes, pendiente, atrasado,
      ratio: cobradoTotal + pendiente > 0 ? Math.round((cobradoTotal / (cobradoTotal + pendiente)) * 100) : null,
      activos: activos.length,
      shorts: activos.filter(p => p.formato === 'short').length,
      largos: activos.filter(p => p.formato === 'largo').length,
      revisiones: activos.filter(p => p.formato === 'revision').length,
      proxima,
    }
  }, [pedidos, cobros])

  // Seis meses: lo facturado (cobros emitidos) frente a lo cobrado, y las
  // piezas entregadas cada mes.
  const serie = useMemo(() => {
    const hoy = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const ref = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1)
      return {
        mes: MESES[ref.getMonth()],
        Facturado: cobros.filter(c => mismoMes(c.created_at, ref)).reduce((a, c) => a + Number(c.importe), 0),
        Cobrado: cobros.filter(c => c.estado === 'cobrado' && mismoMes(c.cobrado_at, ref)).reduce((a, c) => a + Number(c.importe), 0),
        Entregas: pedidos.filter(p => mismoMes(p.entregado_at, ref)).length,
      }
    })
  }, [pedidos, cobros])

  const urgentes = useMemo(() => pedidos
    .filter(p => p.estado !== 'entregado' && p.entrega && diasHasta(p.entrega) <= 7)
    .sort((a, b) => a.entrega.localeCompare(b.entrega)), [pedidos])

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis ed-kpis">
        <Kpi label="Ingresos del mes" value={eur(k.facturadoMes)} accent sub={`${eur(k.cobradoMes)} cobrado`} />
        <div className="helm-card helm-kpi">
          <div className="lbl">Pendiente de cobro</div>
          <div className="val ed-oro">{eur(k.pendiente)}</div>
          <div className="sub">{k.atrasado > 0 ? <span className="ed-rojo">{eur(k.atrasado)} atrasado</span> : 'nada atrasado'}</div>
        </div>
        <Kpi
          label="Proyectos activos" value={k.activos}
          sub={[k.shorts && `${k.shorts} short`, k.largos && `${k.largos} largo`, k.revisiones && `${k.revisiones} revisión`].filter(Boolean).join(' · ') || 'ninguno en marcha'}
        />
        <Kpi
          label="Próxima entrega"
          value={k.proxima ? cuandoLabel(k.proxima.entrega) : '—'}
          sub={k.proxima ? k.proxima.titulo : 'sin entregas programadas'}
        />
        <Kpi label="Ratio de cobro" value={k.ratio == null ? '—' : `${k.ratio} %`} sub="cobrado sobre facturado" />
      </div>

      <div className="ed-dos">
        <Panel title="Ingresos por mes">
          <div className="ed-grafica">
            {serie.every(s => !s.Facturado && !s.Cobrado) ? (
              <Empty>Cuando haya cobros, aquí verás lo facturado frente a lo cobrado de cada mes.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={serie} barGap={4} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ background: '#141416', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, color: '#fff' }}
                    formatter={(v, n) => (n === 'Entregas' ? v : eur(v))}
                  />
                  <Bar dataKey="Facturado" fill="#e6b84a" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="Cobrado" fill="#00d2ff" fillOpacity={0.45} radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel
          title="Entregas urgentes de la semana"
          action={<button className="helm-btn" onClick={() => irA('pedidos')}>Ver todo <ArrowRight size={14} /></button>}
        >
          {urgentes.length === 0 ? <Empty>Nada vence esta semana.</Empty> : (
            <ul className="ed-urgentes">
              {urgentes.map(p => {
                const n = diasHasta(p.entrega)
                return (
                  <li key={p.id} onClick={() => abrirPedido(p)}>
                    <span className={'ed-cuenta' + (n < 0 ? ' vencido' : n <= 1 ? ' ya' : '')}><Timer size={12} /> {cuandoLabel(p.entrega)}</span>
                    <div>
                      <b>{p.titulo}</b>
                      <small>{[clientePor.get(p.cliente_id)?.nombre, formatoCorto(p.formato), fechaCorta(p.entrega)].filter(Boolean).join(' · ')}</small>
                    </div>
                    <span className={'ed-estado e-' + p.estado}>{estadoLabel(p.estado)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {datos.esSuperadmin && !datos.soyMesa && <HacerMesa clientId={clientId} recargar={recargar} />}
    </div>
  )
}

// Solo para el administrador de HELM: convertir este perfil en la mesa de un
// editor compartido. Desde ese momento, los demás perfiles pueden enviarle
// pedidos y aquí aparece la bandeja de Encargos.
function HacerMesa({ clientId, recargar }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  async function hacer() {
    if (!window.confirm('¿Este perfil es el de un editor? Los demás perfiles podrán enviarle pedidos desde su Edición.')) return
    setEnviando(true)
    try { await edicionApi.mesa(clientId, true); recargar() } catch (e) { setError(e.message); setEnviando(false) }
  }
  return (
    <div className="ed-mesa">
      <Inbox size={18} />
      <p><b>¿Es el perfil de un editor?</b> Hazlo mesa de edición: los demás perfiles podrán enviarle sus guiones y él los recibirá en «Encargos».</p>
      {error && <span className="ed-rojo">{error}</span>}
      <button className="helm-btn" onClick={hacer} disabled={enviando}>{enviando ? 'Un momento…' : 'Hacer mesa de edición'}</button>
    </div>
  )
}
