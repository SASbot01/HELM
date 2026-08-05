// HELM — Marketing: qué campaña trae leads y cuál trae ventas.
//
// Las UTM ya se capturan en la puerta (cada formulario público las lee de la
// URL y las guarda en crm_contacts y en sales al cerrar). Esto es la otra
// mitad: verlas juntas. Sin esta pantalla, la UTM es un dato que vive en cada
// ficha y nadie mira dos veces.
//
// Se cruza por utm_source + utm_medium + utm_campaign, nunca por uno solo:
// "instagram" sin la campaña no dice qué pieza funcionó, y dos campañas
// distintas del mismo canal no deben mezclarse en una fila.
import { useEffect, useMemo, useState } from 'react'
import { supabase, money } from '../lib'
import { Panel, Empty, Kpi, Select } from '../ui'
import { activeSales } from '../lib'

const RANGOS = [
  { key: '30', label: '30 días' }, { key: '90', label: '90 días' },
  { key: '365', label: 'Este año' }, { key: 'todo', label: 'Todo' },
]

const clave = (r) => [r.utm_source, r.utm_medium, r.utm_campaign].map(x => x || '—').join(' / ')
const desde = (dias) => {
  if (dias === 'todo') return null
  const d = new Date(); d.setDate(d.getDate() - Number(dias))
  return d.toISOString()
}

export default function Marketing({ clientId }) {
  const [contactos, setContactos] = useState(null)
  const [ventas, setVentas] = useState([])
  const [rango, setRango] = useState('90')

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('crm_contacts')
        .select('id, utm_source, utm_medium, utm_campaign, utm_content, status, created_at')
        .eq('client_id', clientId).limit(5000),
      supabase.from('sales')
        .select('id, contact_id, revenue, utm_source, utm_medium, utm_campaign, date, status')
        .eq('client_id', clientId).limit(5000),
    ]).then(([c, s]) => {
      if (!vivo) return
      setContactos(c.data || [])
      setVentas(activeSales(s.data || []))
    })
    return () => { vivo = false }
  }, [clientId])

  const filas = useMemo(() => {
    if (!contactos) return []
    const limite = desde(rango)
    const leads = contactos.filter(c => c.utm_source && (!limite || c.created_at >= limite))
    const ventasEnRango = ventas.filter(v => v.utm_source && (!limite || v.date >= limite))

    const map = new Map()
    const fila = (r) => {
      const k = clave(r)
      if (!map.has(k)) {
        map.set(k, {
          key: k, source: r.utm_source, medium: r.utm_medium, campaign: r.utm_campaign,
          leads: 0, ganados: 0, ventas: 0, ingresos: 0,
        })
      }
      return map.get(k)
    }
    for (const c of leads) {
      const f = fila(c)
      f.leads++
      // 'ganado' es la clave española; el CRM también admite 'won' de datos
      // antiguos o pipelines en inglés — contar solo una forma dejaría fuera
      // leads reales.
      if (['ganado', 'won', 'cerrado', 'cliente'].includes(String(c.status || '').toLowerCase())) f.ganados++
    }
    for (const v of ventasEnRango) {
      const f = fila(v)
      f.ventas++
      f.ingresos += Number(v.revenue) || 0
    }

    return [...map.values()].sort((a, b) => b.ingresos - a.ingresos || b.leads - a.leads)
  }, [contactos, ventas, rango])

  const totales = useMemo(() => filas.reduce((a, f) => ({
    leads: a.leads + f.leads, ganados: a.ganados + f.ganados,
    ventas: a.ventas + f.ventas, ingresos: a.ingresos + f.ingresos,
  }), { leads: 0, ganados: 0, ventas: 0, ingresos: 0 }), [filas])

  const sinUtm = useMemo(() => {
    if (!contactos) return 0
    const limite = desde(rango)
    return contactos.filter(c => !c.utm_source && (!limite || c.created_at >= limite)).length
  }, [contactos, rango])

  if (contactos === null) return <Panel title="Marketing"><Empty>Cargando…</Empty></Panel>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Leads con campaña" value={totales.leads} accent />
        <Kpi label="Ventas atribuidas" value={totales.ventas} />
        <Kpi label="Ingresos atribuidos" value={money(totales.ingresos)} />
        <Kpi
          label="Tasa de cierre" accent={totales.leads > 0}
          value={totales.leads ? `${Math.round((totales.ganados / totales.leads) * 100)}%` : '—'}
          sub="leads → ganados"
        />
      </div>

      <Panel
        title="Por campaña"
        action={
          <Select value={rango} onChange={e => setRango(e.target.value)}>
            {RANGOS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        }
      >
        <p className="helm-settings-lead">
          De dónde vienen los leads y qué campaña trae dinero de verdad, no solo tráfico. Cruzado
          por origen, medio y campaña — la misma UTM que se capturó al entrar por el formulario.
        </p>

        {filas.length === 0 ? (
          <Empty>
            {sinUtm > 0
              ? `Sin leads con campaña en este periodo. Hay ${sinUtm} sin UTM — llegaron sin parámetros en el enlace.`
              : 'Todavía no ha entrado ningún lead con UTM en este periodo.'}
          </Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Origen</th><th>Medio</th><th>Campaña</th>
                  <th>Leads</th><th>Ganados</th><th>Ventas</th><th>Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.key}>
                    <td>{f.source}</td>
                    <td>{f.medium || '—'}</td>
                    <td>{f.campaign || '—'}</td>
                    <td className="helm-num">{f.leads}</td>
                    <td className="helm-num">{f.ganados}</td>
                    <td className="helm-num">{f.ventas}</td>
                    <td className="helm-num">{f.ingresos ? money(f.ingresos) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sinUtm > 0 && filas.length > 0 && (
          <p className="helm-settings-note" style={{ marginTop: 10 }}>
            Además, {sinUtm} lead{sinUtm === 1 ? '' : 's'} en este periodo sin ningún parámetro de
            campaña (orgánico, directo, o un enlace sin UTM).
          </p>
        )}
      </Panel>
    </div>
  )
}
