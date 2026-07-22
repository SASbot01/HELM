// HELM — Informe: resumen ejecutivo del negocio (mes en curso).
import { useEffect, useState } from 'react'
import { supabase, money, monthStartISO, fmtDate } from '../lib'
import { Kpi, Panel, Empty } from '../ui'

export default function Informe({ clientId }) {
  const [d, setD] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const mStart = monthStartISO()
      const [sales, reports, contacts, finance] = await Promise.all([
        supabase.from('sales').select('revenue, cash_collected, date, client_name, product').eq('client_id', clientId).gte('date', mStart),
        supabase.from('reports').select('calls_made, appointments_booked, closes, date').eq('client_id', clientId).gte('date', mStart),
        supabase.from('crm_contacts').select('id').eq('client_id', clientId),
        supabase.from('ceo_finance_entries').select('amount, category').eq('client_id', clientId).gte('date', mStart),
      ])
      if (!alive) return
      const s = sales.data || []
      const revenue = s.reduce((a, r) => a + (Number(r.revenue) || 0), 0)
      const cash = s.reduce((a, r) => a + (Number(r.cash_collected) || 0), 0)
      const rep = reports.data || []
      const calls = rep.reduce((a, r) => a + (Number(r.calls_made) || 0), 0)
      const appts = rep.reduce((a, r) => a + (Number(r.appointments_booked) || 0), 0)
      const fin = finance.data || []
      const income = fin.filter(e => Number(e.amount) > 0).reduce((a, e) => a + Number(e.amount), 0)
      const expense = fin.filter(e => Number(e.amount) < 0).reduce((a, e) => a + Number(e.amount), 0)
      setD({
        revenue, cash, salesCount: s.length, contacts: (contacts.data || []).length,
        calls, appts, balance: income + expense,
        recent: [...s].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6),
      })
    }
    load()
    return () => { alive = false }
  }, [clientId])

  if (!d) return <Empty>Cargando…</Empty>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Revenue · mes" value={money(d.revenue)} accent sub={`${d.salesCount} ventas`} />
        <Kpi label="Cash collected" value={money(d.cash)} sub="cobrado este mes" />
        <Kpi label="Balance finanzas" value={money(d.balance)} sub="ingresos − gastos" />
        <Kpi label="Contactos CRM" value={d.contacts} sub="en pipeline" />
        <Kpi label="Llamadas · mes" value={d.calls} sub={`${d.appts} citas agendadas`} />
      </div>

      <Panel title="Últimas ventas">
        <div className="helm-tablewrap">
          <table className="helm-table">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Revenue</th><th>Cash</th></tr></thead>
            <tbody>
              {d.recent.length === 0 && <tr><td colSpan={5}><div className="helm-empty">Sin ventas este mes todavía.</div></td></tr>}
              {d.recent.map((r, i) => (
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
