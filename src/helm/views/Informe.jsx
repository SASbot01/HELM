// HELM — Informe: qué se ha facturado, filtrable por periodo y por programa.
import { useEffect, useMemo, useState } from 'react'
import { Rocket, ArrowRight, X } from 'lucide-react'
import { Evolucion, PorPrograma } from './informe/Graficas'
import { supabase, money, fmtDate, getOnboarding, onboardingApi, isSaleCancelled, cuotasPendientes } from '../lib'
import { Kpi, Panel, Empty } from '../ui'
import { seccionDelProducto } from '../producto'

// Banner de arranque: empuja al onboarding (el alta; o el de contenido en los
// perfiles que lo hicieron antes) mientras no esté hecho.
//
// Una vez completado desaparece. Antes se quedaba fijo arriba diciendo
// "Onboarding de contenido completado" para siempre, robando la primera franja
// del informe sin aportar nada: para revisar las respuestas ya está la entrada
// "Onboarding" del menú. Un banner es un aviso, y un aviso que no se puede
// cerrar ni caduca deja de ser un aviso.
//
// También se puede cerrar a mano mientras está pendiente (la X), y en ese caso
// no vuelve a salir en toda la sesión.
function OnboardingBanner({ clientId, onNavigate }) {
  const [status, setStatus] = useState('loading') // 'loading' | undefined | 'draft' | 'sin_biblia' | 'completed'
  const [cerrado, setCerrado] = useState(false)

  // No hace falta reiniciar `cerrado` al cambiar de perfil: el shell remonta la
  // vista entera con key={clientId + view}, así que este estado ya nace limpio.
  useEffect(() => {
    let alive = true
    // Hecho = hay Biblia, que es lo que de verdad usan el chat y los agentes.
    // Un alta enviada por el cliente desde su enlace está completada pero aún
    // no ha pasado por la IA: ahí el aviso sigue, y dice qué falta. El estado
    // del formulario de contenido ya no cuenta (no se ofrece): un perfil que lo
    // hizo tiene Biblia y por eso no ve el aviso.
    Promise.all([getOnboarding(clientId, 'alta'), onboardingApi.biblia(clientId)])
      .then(([alta, b]) => {
        if (!alive) return
        const hayBiblia = Object.keys(b?.biblia || {}).length > 0
        setStatus(hayBiblia ? 'completed' : alta?.status === 'completed' ? 'sin_biblia' : alta?.status)
      })
      .catch(() => alive && setStatus(undefined))
    return () => { alive = false }
  }, [clientId])

  // El onboarding es el de un infoproductor: "para que la IA aprenda cómo
  // hablas y escriba tu contenido". En un despacho ni existe la sección, así
  // que el banner que lleva a ella sobra.
  if (!seccionDelProducto('onboarding')) return null
  if (status === 'loading' || status === 'completed' || cerrado || !onNavigate) return null

  return (
    <div className="helm-onb-banner" onClick={() => onNavigate('onboarding')}>
      <div className="helm-onb-banner-ico"><Rocket size={20} /></div>
      <div className="helm-onb-banner-txt">
        <b>{status === 'sin_biblia' ? 'Falta generar tu Biblia' : status === 'draft' ? 'Termina tu onboarding' : 'Inicia tu onboarding'}</b>
        <span>
          {status === 'sin_biblia'
            ? 'El alta ya está respondida. Ábrela y pulsa «Completar y generar la Biblia» para que la IA escriba con tu marca.'
            : status === 'draft'
              ? 'Tienes el alta a medias. Termínala para que la IA aprenda tu marca y escriba tu contenido.'
              : 'Rellena el Alta en HELM (40 preguntas) para que la IA aprenda cómo es tu negocio y escriba tu contenido como tú.'}
        </span>
      </div>
      <button className="helm-btn primary">
        {status === 'sin_biblia' ? 'Generar' : status === 'draft' ? 'Continuar' : 'Empezar'} <ArrowRight size={15} />
      </button>
      <button
        className="helm-onb-banner-x"
        aria-label="Ocultar aviso"
        onClick={e => { e.stopPropagation(); setCerrado(true) }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

// Periodos preajustados. `days: null` = todo el histórico.
const PERIODOS = [
  { key: 'mes', label: 'Este mes' },
  { key: '30', label: '30 días', days: 30 },
  { key: '60', label: '60 días', days: 60 },
  { key: '90', label: '90 días', days: 90 },
  { key: 'ano', label: 'Este año' },
  { key: 'todo', label: 'Todo', days: null },
]

function desdeISO(periodo) {
  const now = new Date()
  if (periodo.key === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  if (periodo.key === 'ano') return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  if (periodo.days == null) return null
  return new Date(now.getTime() - periodo.days * 86400000).toISOString().slice(0, 10)
}

export default function Informe({ clientId, onNavigate }) {
  const [sales, setSales] = useState(null)
  const [finance, setFinance] = useState([])
  const [contacts, setContacts] = useState(0)
  const [periodoKey, setPeriodoKey] = useState('mes')
  const [programa, setPrograma] = useState('__all__')

  const periodo = PERIODOS.find(p => p.key === periodoKey) || PERIODOS[0]

  // Traemos el histórico una vez y filtramos en cliente: así cambiar de periodo
  // o de programa es instantáneo, sin ir a la base en cada clic.
  useEffect(() => {
    let alive = true
    Promise.all([
      // `status` entra en el select para poder descartar las canceladas: una
      // venta anulada no puede seguir contando como facturación.
      supabase.from('sales')
        .select('revenue, cash_collected, date, client_name, product, status, ' +
          'installments_total, installments_paid, installment_amount, plan_start, plan_end')
        .eq('client_id', clientId).order('date', { ascending: false }).limit(2000),
      supabase.from('ceo_finance_entries')
        .select('amount, category, date').eq('client_id', clientId).limit(2000),
      supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    ]).then(([s, f, c]) => {
      if (!alive) return
      setSales((s.data || []).filter(r => !isSaleCancelled(r)))
      setFinance(f.data || [])
      setContacts(c.count || 0)
    })
    return () => { alive = false }
  }, [clientId])

  const programas = useMemo(() => {
    const set = new Set((sales || []).map(s => (s.product || '').trim()).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [sales])

  // Sin `if (!sales) return null` dentro del useMemo: el compilador de React no
  // puede preservar la memoización con una salida temprana. El estado "cargando"
  // se resuelve fuera, mirando `sales`.
  const d = useMemo(() => {
    // `desdeISO` mira el reloj, así que se calcula aquí dentro: si viviera en el
    // cuerpo del render, el compilador no podría memoizar nada.
    const desde = desdeISO(periodo)
    const todas = sales || []
    const enRango = (fecha) => !desde || (fecha || '') >= desde
    const filtradas = todas
      .filter(s => enRango(s.date))
      .filter(s => programa === '__all__' || (s.product || '').trim() === programa)

    const revenue = filtradas.reduce((a, r) => a + (Number(r.revenue) || 0), 0)
    const cash = filtradas.reduce((a, r) => a + (Number(r.cash_collected) || 0), 0)

    // Desglose por programa (siempre sobre el periodo, ignorando el filtro de
    // programa: si no, la tabla tendría una sola fila y no compararías nada).
    const delPeriodo = todas.filter(s => enRango(s.date))
    const porPrograma = {}
    for (const s of delPeriodo) {
      const k = (s.product || '').trim() || 'Sin programa'
      porPrograma[k] = porPrograma[k] || { unidades: 0, facturado: 0, cobrado: 0 }
      porPrograma[k].unidades++
      porPrograma[k].facturado += Number(s.revenue) || 0
      porPrograma[k].cobrado += Number(s.cash_collected) || 0
    }
    const totalPeriodo = Object.values(porPrograma).reduce((a, p) => a + p.facturado, 0)
    const tabla = Object.entries(porPrograma)
      .map(([name, p]) => ({ name, ...p, cuota: totalPeriodo ? (p.facturado / totalPeriodo) * 100 : 0 }))
      .sort((a, b) => b.facturado - a.facturado)

    // Pagos fraccionados vivos: los que aún tienen cuotas por cobrar. Sin esto
    // el informe daba por buena toda la facturación aunque estuviera a medias.
    const planes = filtradas
      .map(s => ({ ...s, pendientes: cuotasPendientes(s) }))
      .filter(s => s.pendientes != null)
      .sort((a, b) => b.pendientes - a.pendientes)
    const porCobrar = planes.reduce(
      (a, s) => a + (s.pendientes * (Number(s.installment_amount) || 0)), 0)

    const fin = finance.filter(e => enRango(e.date))
    const ingresos = fin.filter(e => Number(e.amount) > 0).reduce((a, e) => a + Number(e.amount), 0)
    const gastos = fin.filter(e => Number(e.amount) < 0).reduce((a, e) => a + Number(e.amount), 0)

    // Serie mes a mes para la gráfica de evolución. Se construye desde los
    // meses que EXISTEN entre la primera y la última venta del rango, no solo
    // desde los que tienen ventas: sin los meses vacíos la línea miente, porque
    // une agosto con octubre como si septiembre no hubiera pasado.
    const porMes = {}
    for (const v of filtradas) {
      const k = (v.date || '').slice(0, 7)
      if (!k) continue
      porMes[k] = porMes[k] || { facturado: 0, cobrado: 0 }
      porMes[k].facturado += Number(v.revenue) || 0
      porMes[k].cobrado += Number(v.cash_collected) || 0
    }
    const claves = Object.keys(porMes).sort()
    const serie = []
    if (claves.length) {
      const [ay, am] = claves[0].split('-').map(Number)
      const [zy, zm] = claves[claves.length - 1].split('-').map(Number)
      const cursor = new Date(Date.UTC(ay, am - 1, 1))
      const fin = new Date(Date.UTC(zy, zm - 1, 1))
      while (cursor <= fin && serie.length < 36) {
        const k = cursor.toISOString().slice(0, 7)
        serie.push({
          mes: cursor.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }),
          ...(porMes[k] || { facturado: 0, cobrado: 0 }),
        })
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      }
    }

    return {
      revenue, cash, ventas: filtradas.length, serie,
      ticket: filtradas.length ? revenue / filtradas.length : 0,
      balance: ingresos + gastos,
      planes, porCobrar,
      tabla,
      recientes: filtradas.slice(0, 8),
    }
  }, [sales, finance, periodo, programa])

  if (sales == null) return <Empty>Cargando…</Empty>

  const sufijo = programa === '__all__' ? periodo.label.toLowerCase() : programa

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <OnboardingBanner clientId={clientId} onNavigate={onNavigate} />

      <div className="helm-filters">
        <div className="helm-chips">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              className={'helm-chip' + (p.key === periodoKey ? ' active' : '')}
              onClick={() => setPeriodoKey(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select className="helm-select" value={programa} onChange={e => setPrograma(e.target.value)}>
          <option value="__all__">Todos los programas</option>
          {programas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="helm-grid helm-kpis">
        <Kpi label="Facturado" value={money(d.revenue)} accent sub={sufijo} />
        <Kpi label="Cobrado" value={money(d.cash)} />
        <Kpi label="Ventas" value={d.ventas} sub={`ticket medio ${money(d.ticket)}`} />
        <Kpi label="Balance finanzas" value={money(d.balance)} sub="ingresos − gastos" />
        <Kpi label="Contactos CRM" value={contacts} sub="en pipeline" />
        {d.planes.length > 0 && (
          <Kpi label="Pendiente en cuotas" value={money(d.porCobrar)} sub={`${d.planes.length} plan${d.planes.length === 1 ? '' : 'es'} de pago`} />
        )}
      </div>

      {/* Las gráficas van justo detrás de las cifras y delante de las tablas:
          primero el titular, luego la forma, y el detalle al final. */}
      <div className="helm-grafs">
        <Evolucion serie={d.serie} />
        <PorPrograma tabla={d.tabla} />
      </div>

      {d.planes.length > 0 && (
        <Panel title="Pagos fraccionados">
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Cliente</th><th>Programa</th><th>Cuotas</th><th>Pendientes</th>
                  <th>Importe/cuota</th><th>Inicio del plan</th><th>Fin del plan</th>
                </tr>
              </thead>
              <tbody>
                {d.planes.map((s, i) => (
                  <tr key={i} className={s.pendientes === 0 ? '' : 'pending'}>
                    <td>{s.client_name || '—'}</td>
                    <td>{s.product || '—'}</td>
                    <td className="helm-num">{s.installments_paid || 0}/{s.installments_total}</td>
                    <td>
                      <span className={'helm-chip ' + (s.pendientes === 0 ? 'green' : 'amber')}>
                        {s.pendientes === 0 ? 'Cobrado' : `Faltan ${s.pendientes}`}
                      </span>
                    </td>
                    <td className="helm-num">{s.installment_amount ? money(s.installment_amount) : '—'}</td>
                    <td>{s.plan_start ? fmtDate(s.plan_start) : '—'}</td>
                    <td>{s.plan_end ? fmtDate(s.plan_end) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title={`Facturación por programa · ${periodo.label.toLowerCase()}`}>
        {d.tabla.length === 0 ? (
          <Empty>Sin ventas en este periodo.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr><th>Programa</th><th>Ventas</th><th>Facturado</th><th>Cobrado</th><th>% del total</th></tr>
              </thead>
              <tbody>
                {d.tabla.map(p => (
                  <tr key={p.name}
                    className={programa === p.name ? 'active' : ''}
                    onClick={() => setPrograma(programa === p.name ? '__all__' : p.name)}
                    style={{ cursor: 'pointer' }}>
                    <td>{p.name}</td>
                    <td>{p.unidades}</td>
                    <td className="helm-num">{money(p.facturado)}</td>
                    <td className="helm-num">{money(p.cobrado)}</td>
                    <td>
                      <div className="helm-bar"><span style={{ width: `${p.cuota.toFixed(1)}%` }} /></div>
                      <small>{p.cuota.toFixed(1)}%</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Últimas ventas">
        <div className="helm-tablewrap">
          <table className="helm-table">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Programa</th><th>Facturado</th><th>Cobrado</th></tr></thead>
            <tbody>
              {d.recientes.length === 0 && (
                <tr><td colSpan={5}><div className="helm-empty">Sin ventas con estos filtros.</div></td></tr>
              )}
              {d.recientes.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.client_name || '—'}</td>
                  <td>{r.product || '—'}</td>
                  <td className="helm-num">{money(r.revenue)}</td>
                  <td className="helm-num">{money(r.cash_collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
