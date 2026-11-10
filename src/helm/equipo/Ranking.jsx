// HELM — Equipo · Ranking y niveles.
//
// Un cuadro junto a «Equipo» que ordena a los miembros por lo que producen
// (ventas y puntos) y enseña su nivel. Se alimenta del reporte por eventos del
// CRM (tabla reports, source='evento') y de los contadores del histórico.
//
// Niveles de WebSeller (los pidió Alex):
//   L1  33% de comisión en todas las ventas.
//   L2  33% + 200 €/mes fijo. Se llega cumpliendo la facturación mínima diaria
//       (1 venta/día Y 50 llamadas) durante 3 meses sin fallar —los findes no
//       cuentan—, acumulando puntos.
//   L3–L6  existen pero están BLOQUEADOS (candado, sin información).
//
// ⚠️ SUPUESTOS A CONFIRMAR CON ALEX (marcados abajo con FLAG):
//   · La FÓRMULA de puntos (PUNTOS_POR).
//   · De dónde salen las «50 llamadas/día»: hoy se leen de reports.calls_made
//     (el contador del histórico); el reporte por eventos no cuenta llamadas,
//     así que hasta que se defina la fuente, los días válidos saldrán a 0.
//   · El objetivo de días válidos para L2 (DIAS_PARA_L2 ≈ 13 semanas × 5).
import { useEffect, useMemo, useState } from 'react'
import { Trophy, Lock } from 'lucide-react'
import { fetchRows } from '../lib'
import { Panel, Empty } from '../ui'
import { roleLabel } from './roles'

const WEBSELLER_ID = 'eac2511a-3dda-47a5-88d4-a5550596b53f'

// FLAG (fórmula de puntos): venta pesa 10, interesado 2, contactado 1.
const PUNTOS_POR = { venta: 10, interesado: 2, contactado: 1 }

// FLAG (umbrales de L2).
const VENTAS_MIN_DIA = 1
const LLAMADAS_MIN_DIA = 50
const DIAS_PARA_L2 = 65   // ≈ 3 meses de días laborables (13 × 5)

// Los 6 niveles de WebSeller. Los dos primeros tienen detalle; el resto, candado.
const NIVELES_WS = [
  { key: 'L1', label: 'L1', desc: '33% de comisión en todas las ventas.' },
  { key: 'L2', label: 'L2', desc: '33% + 200 €/mes fijo. 1 venta/día y 50 llamadas, 3 meses sin fallar.' },
  { key: 'L3', label: 'L3', locked: true },
  { key: 'L4', label: 'L4', locked: true },
  { key: 'L5', label: 'L5', locked: true },
  { key: 'L6', label: 'L6', locked: true },
]

const money = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function Ranking({ clientId, people }) {
  const [reports, setReports] = useState(null)
  const esWebSeller = clientId === WEBSELLER_ID

  useEffect(() => {
    fetchRows('reports', clientId, { order: 'date', limit: 5000 }).then(setReports)
  }, [clientId])

  // Puntuación por persona: ventas, interesados, contactados, llamadas y los
  // «días válidos» (día con ≥1 venta Y ≥50 llamadas) para el progreso a L2.
  const ranking = useMemo(() => {
    if (!reports) return null
    const activos = (people || []).filter(p => p.active !== false)
    // Acumuladores por persona.
    const base = () => ({ venta: 0, interesado: 0, contactado: 0, llamadas: 0, importe: 0, dias: {} })
    const porPersona = new Map(activos.map(p => [p.id, base()]))
    const diaDe = (acc, fecha) => (acc.dias[fecha] = acc.dias[fecha] || { ventas: 0, llamadas: 0 })

    for (const r of reports) {
      const acc = porPersona.get(r.person_id)
      if (!acc) continue
      if (r.source === 'evento' && Array.isArray(r.events)) {
        for (const e of r.events) {
          if (acc[e.tipo] != null) acc[e.tipo] += 1
          if (e.tipo === 'venta') { acc.importe += Number(e.amount) || 0; diaDe(acc, r.date).ventas += 1 }
        }
      }
      // Las llamadas sólo existen hoy en el contador del histórico (FLAG).
      const llamadas = Number(r.calls_made) || 0
      if (llamadas) { acc.llamadas += llamadas; diaDe(acc, r.date).llamadas += llamadas }
    }

    return activos.map(p => {
      const a = porPersona.get(p.id)
      const puntos = a.venta * PUNTOS_POR.venta + a.interesado * PUNTOS_POR.interesado + a.contactado * PUNTOS_POR.contactado
      const diasValidos = Object.values(a.dias).filter(d => d.ventas >= VENTAS_MIN_DIA && d.llamadas >= LLAMADAS_MIN_DIA).length
      const nivel = esWebSeller && diasValidos >= DIAS_PARA_L2 ? 'L2' : 'L1'
      const progreso = Math.min(100, Math.round((diasValidos / DIAS_PARA_L2) * 100))
      return { ...p, puntos, ventas: a.venta, interesados: a.interesado, contactados: a.contactado, importe: a.importe, llamadas: a.llamadas, diasValidos, nivel, progreso }
    }).sort((x, y) => y.puntos - x.puntos || y.ventas - x.ventas)
  }, [reports, people, esWebSeller])

  return (
    <Panel title={<><Trophy size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Ranking</>}>
      {esWebSeller && (
        <div className="helm-niveles" style={{ marginBottom: 14 }}>
          {NIVELES_WS.map(n => (
            <div key={n.key} className={'helm-nivel' + (n.locked ? ' off' : '')} style={{ cursor: 'default' }}>
              <b>{n.locked ? <Lock size={13} /> : <Trophy size={13} />}{n.label}</b>
              <small>{n.locked ? 'Bloqueado' : n.desc}</small>
            </div>
          ))}
        </div>
      )}

      {ranking == null ? <Empty>Cargando…</Empty> : ranking.length === 0 ? (
        <Empty>Aún no hay miembros con actividad para puntuar.</Empty>
      ) : (
        <div className="helm-tablewrap">
          <table className="helm-table">
            <thead>
              <tr>
                <th>#</th><th>Persona</th><th>Rol</th>
                {esWebSeller && <th>Nivel</th>}
                <th>Puntos</th><th>Ventas</th><th>Facturado</th>
                {esWebSeller && <th>Progreso a L2</th>}
              </tr>
            </thead>
            <tbody>
              {ranking.map((p, i) => (
                <tr key={p.id}>
                  <td className="helm-num">{i + 1}</td>
                  <td><b>{p.name}</b></td>
                  <td>{roleLabel(p.role)}</td>
                  {esWebSeller && <td><span className={'helm-chip ' + (p.nivel === 'L2' ? 'green' : 'cyan')}>{p.nivel}</span></td>}
                  <td className="helm-num">{p.puntos}</td>
                  <td className="helm-num">{p.ventas}</td>
                  <td className="helm-num">{p.importe ? money(p.importe) : '—'}</td>
                  {esWebSeller && (
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--surface-2, rgba(128,128,128,.2))', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${p.progreso}%`, height: '100%', background: 'var(--accent, #15A34A)' }} />
                        </div>
                        <small style={{ whiteSpace: 'nowrap' }}>{p.diasValidos}/{DIAS_PARA_L2} días</small>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
