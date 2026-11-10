// HELM — Diario: el reporte del día, por EVENTOS.
//
// Antes el reporte se tecleaba a mano (un modal con contadores por rol). Ahora
// se arma solo: cada vez que un lead se mueve a «contactado», «interesado» o a
// una etapa de venta, ese evento se apunta en el reporte del día de quien es
// dueño de ese pipeline. Lo hace un trigger en la base (migración 130,
// helm_report_crm_event), así que cuenta mueva quien mueva el lead —el panel,
// un webhook, Stripe/Woo— y vale para TODOS los perfiles, también el operador
// que trabaja solo.
//
// Las filas antiguas (source != 'evento') son el histórico de cuando se
// reportaba a mano: se siguen viendo abajo, no se pierde nada.
//
// Lo único que se sigue marcando a mano es lo que el CRM no puede saber: las
// llamadas que hace un caller, las conversaciones de un setter… Cada persona
// tiene arriba su «parte de hoy» con los contadores de su rol, y eso alimenta
// el progreso de nivel del Ranking. Las ventas NO van ahí: se cuentan solas al
// mover el lead. El parte de hoy se guarda en una fila `source='manual'`.
import { useEffect, useMemo, useState } from 'react'
import { fetchRows, fetchRowsOrError, fmtDate, insertRow, updateRow, todayISO } from '../lib'
import { Panel, Empty, Kpi, FormNote, Field, CountInput } from '../ui'
import { roleLabel, roleMapDelProducto } from '../equipo/roles'
import { sesionHelm } from '../permisos'

// Tipo de evento → cómo se pinta.
const TIPOS = {
  contactado: { label: 'Contactado', tone: 'cyan' },
  interesado: { label: 'Interesado', tone: 'violet' },
  venta: { label: 'Venta', tone: 'green' },
}

const money = (n) => {
  const v = Number(n) || 0
  return v ? v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : ''
}

const horaDe = (at) => {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// Cuenta los eventos de una fila por tipo.
function resumen(events = []) {
  const r = { contactado: 0, interesado: 0, venta: 0, importe: 0 }
  for (const e of events) {
    if (r[e.tipo] != null) r[e.tipo] += 1
    if (e.tipo === 'venta') r.importe += Number(e.amount) || 0
  }
  return r
}

export default function Diario({ clientId }) {
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState([])

  useEffect(() => {
    fetchRows('reports', clientId, { order: 'date' }).then(setRows)
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true })
      .then(({ rows: r }) => setPeople(r || []))
  }, [clientId])

  // ── «Mi parte de hoy» ────────────────────────────────────────────────────
  // Quién soy en este perfil (por el id de equipo de la sesión) y qué campos
  // reporto a mano: los de mi rol MENOS 'closes', porque las ventas ya las
  // cuenta el CRM por eventos (si no, se apuntarían dos veces).
  const sesion = useMemo(() => sesionHelm(), [])
  const hoyISO = todayISO()
  const yo = useMemo(
    () => (people || []).find(p => p.id === sesion.helmTeamId) || null,
    [people, sesion],
  )
  const misCampos = useMemo(() => {
    const def = yo ? roleMapDelProducto()[yo.role] : null
    return (def?.diario || []).filter(c => c.field !== 'closes')
  }, [yo])
  // Mi fila manual de hoy, si ya guardé algo (para rellenar y poder editarla).
  const miParte = useMemo(
    () => (rows || []).find(r => r.source !== 'evento' && r.person_id === yo?.id && r.date === hoyISO) || null,
    [rows, yo, hoyISO],
  )
  const [parte, setParte] = useState({})
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    const init = {}
    for (const c of misCampos) init[c.field] = miParte?.[c.field] ?? ''
    setParte(init)
  }, [miParte, misCampos])

  async function guardarParte() {
    if (!yo || !misCampos.length) return
    setGuardando(true)
    const valores = {}
    for (const c of misCampos) valores[c.field] = Number(parte[c.field]) || 0
    try {
      if (miParte) {
        await updateRow('reports', miParte.id, { ...valores, updated_at: new Date().toISOString() })
      } else {
        await insertRow('reports', {
          client_id: clientId, date: hoyISO, source: 'manual',
          person_id: yo.id, name: yo.name, role: yo.role, ...valores,
        })
      }
      setRows(await fetchRows('reports', clientId, { order: 'date' }))
    } finally {
      setGuardando(false)
    }
  }

  // Nombre de rol: primero el que trae la fila; si no, el de la ficha de equipo.
  const rolDe = (r) => {
    if (r.role) return roleLabel(r.role)
    const p = people.find(p => p.id === r.person_id)
    return p ? roleLabel(p.role) : ''
  }

  const eventos = useMemo(
    () => (rows || []).filter(r => r.source === 'evento' && Array.isArray(r.events) && r.events.length),
    [rows],
  )
  const historico = useMemo(
    () => (rows || []).filter(r => r.source !== 'evento'),
    [rows],
  )

  // Agrupado por día (desc) → filas (personas) de ese día.
  const porDia = useMemo(() => {
    const map = new Map()
    for (const r of eventos) {
      if (!map.has(r.date)) map.set(r.date, [])
      map.get(r.date).push(r)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [eventos])

  // KPIs: totales de HOY (la primera fecha del grupo, que es la más reciente).
  const hoy = porDia[0]
  const totHoy = useMemo(() => {
    const t = { contactado: 0, interesado: 0, venta: 0 }
    for (const r of (hoy?.[1] || [])) {
      const s = resumen(r.events)
      t.contactado += s.contactado; t.interesado += s.interesado; t.venta += s.venta
    }
    return t
  }, [hoy])

  if (rows == null) return <Empty>Cargando…</Empty>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Contactados hoy" value={totHoy.contactado} />
        <Kpi label="Interesados hoy" value={totHoy.interesado} />
        <Kpi label="Ventas hoy" value={totHoy.venta} accent />
      </div>

      <FormNote>
        El reporte se arma solo con los movimientos del CRM: cada lead que pasa a
        contactado, interesado o venta queda apuntado aquí, en el día que ocurrió y a
        nombre de quien lleva ese pipeline.
      </FormNote>

      {yo && misCampos.length > 0 && (
        <Panel title="Mi parte de hoy">
          <div className="helm-grid helm-kpis" style={{ gap: 12 }}>
            {misCampos.map(c => (
              <Field key={c.field} label={c.label}>
                <CountInput
                  value={parte[c.field] ?? ''}
                  onChange={(v) => setParte(p => ({ ...p, [c.field]: v }))}
                />
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="helm-btn" onClick={guardarParte} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar mi parte'}
            </button>
            <small style={{ opacity: .7 }}>
              Tus llamadas de hoy cuentan para tu progreso de nivel. Las ventas se apuntan solas al mover el lead en el CRM.
            </small>
          </div>
        </Panel>
      )}

      <Panel title="Actividad del día">
        {porDia.length === 0 ? (
          <Empty>Aún no hay movimientos. En cuanto muevas un lead a contactado, interesado o venta, aparecerá aquí.</Empty>
        ) : (
          <div className="helm-grid" style={{ gap: 18 }}>
            {porDia.map(([date, filas]) => (
              <div key={date}>
                <div className="helm-drawer-section" style={{ marginTop: 0 }}>{fmtDate(date)}</div>
                <div className="helm-svc-grid">
                  {filas.map(r => {
                    const s = resumen(r.events)
                    return (
                      <div key={r.id} className="helm-svc">
                        <div className="helm-svc-head">
                          <div className="helm-avatar lg">{(r.name || '?')[0].toUpperCase()}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b>{r.name || 'Perfil'}</b>
                            <small>{rolDe(r)}</small>
                          </div>
                        </div>
                        <div className="helm-svc-meta">
                          {s.contactado > 0 && <span>{s.contactado} contactado{s.contactado === 1 ? '' : 's'}</span>}
                          {s.interesado > 0 && <span>{s.interesado} interesado{s.interesado === 1 ? '' : 's'}</span>}
                          {s.venta > 0 && <span>{s.venta} venta{s.venta === 1 ? '' : 's'}{s.importe ? ` · ${money(s.importe)}` : ''}</span>}
                        </div>
                        <div className="helm-timeline">
                          {[...r.events].reverse().map((e, i) => {
                            const t = TIPOS[e.tipo] || { label: e.tipo, tone: '' }
                            return (
                              <div key={i} className="helm-tl-item">
                                <span className={'helm-chip ' + t.tone}>{t.label}</span>
                                <div className="helm-tl-body">
                                  <div>{e.contact_name || '—'}{e.tipo === 'venta' && Number(e.amount) ? ` · ${money(e.amount)}` : ''}</div>
                                  <small>{horaDe(e.at)}</small>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {historico.length > 0 && (
        <Panel title="Histórico (reportes antiguos)">
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Persona</th><th>Rol</th>
                  <th>Llamadas</th><th>Conversaciones</th><th>Cierres</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.name || '—'}</td>
                    <td>{rolDe(r) || '—'}</td>
                    <td className="helm-num">{r.calls_made ?? 0}</td>
                    <td className="helm-num">{r.conversations_opened ?? 0}</td>
                    <td className="helm-num">{r.closes ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
