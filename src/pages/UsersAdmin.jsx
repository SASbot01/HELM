// HELM — panel de usuarios (/usersadmin). Solo superadmins. Lista todos los
// accesos (superadmins + accesos de cliente) y permite aprobar los pendientes
// y activar/desactivar cuentas.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ShieldCheck, Building2, Clock, Ban } from 'lucide-react'
import { usersApi } from '../helm/lib'
import '../helm/theme.css'

export default function UsersAdmin() {
  const navigate = useNavigate()
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = () => usersApi.list().then(r => { setUsers(r.users || []); setError(null) }).catch(e => setError(e.message))

  useEffect(() => {
    if (!localStorage.getItem('bw_superadmin')) { navigate('/login'); return }
    load()
  }, [navigate])

  async function setActive(u, active) {
    setBusy(u.id)
    // Optimista
    setUsers(list => list.map(x => (x.id === u.id ? { ...x, active } : x)))
    try { await usersApi.setActive(u.type, u.id, active) }
    catch (e) { setError(e.message); load() }
    setBusy(null)
  }

  const pending = (users || []).filter(u => u.type === 'team' && !u.active)
  const rest = (users || []).filter(u => !(u.type === 'team' && !u.active))

  const Row = (u) => (
    <tr key={u.type + u.id} className={!u.active ? 'pending' : ''}>
      <td>
        <div className="helm-ua-user">
          <span className="helm-avatar sm">{(u.name || u.email)[0]?.toUpperCase()}</span>
          <div><b>{u.name || '—'}</b><small>{u.email}</small></div>
        </div>
      </td>
      <td>{u.type === 'superadmin' ? <span className="helm-chip cyan"><ShieldCheck size={12} /> Superadmin</span> : <span className="helm-chip"><Building2 size={12} /> Cliente</span>}</td>
      <td>{u.business ? u.business.name : '—'}</td>
      <td>
        {u.active
          ? <span className="helm-chip green"><Check size={12} /> Activo</span>
          : <span className="helm-chip amber"><Clock size={12} /> Pendiente</span>}
      </td>
      <td className="helm-ua-actions">
        {!u.active ? (
          <button className="helm-btn primary" onClick={() => setActive(u, true)} disabled={busy === u.id}>
            <Check size={14} /> {u.type === 'team' ? 'Aprobar' : 'Activar'}
          </button>
        ) : (
          <button className="helm-btn" onClick={() => setActive(u, false)} disabled={busy === u.id}>
            <Ban size={14} /> Desactivar
          </button>
        )}
      </td>
    </tr>
  )

  return (
    <div className="helm">
      <div className="helm-ua">
        <header className="helm-ua-head">
          <div>
            <button className="helm-btn" onClick={() => navigate('/admin')}><ArrowLeft size={15} /> Volver a HELM</button>
            <h1>Usuarios de toda la plataforma</h1>
            <p>
              Vista de operador: superadmins y accesos de <b>todos los negocios</b>, no solo el que
              tenías abierto. Aprueba los registros pendientes y gestiona los accesos.
            </p>
          </div>
        </header>

        {error && <div className="helm-formerror">{error}</div>}

        {users === null ? (
          <div className="helm-empty">Cargando…</div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="helm-panel" style={{ marginBottom: 18 }}>
                <div className="helm-panel-head"><h2>Pendientes de aprobación · {pending.length}</h2></div>
                <div className="helm-tablewrap">
                  <table className="helm-table">
                    <thead><tr><th>Usuario</th><th>Tipo</th><th>Negocio</th><th>Estado</th><th></th></tr></thead>
                    <tbody>{pending.map(Row)}</tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="helm-panel">
              <div className="helm-panel-head"><h2>Todos los usuarios · {rest.length}</h2></div>
              <div className="helm-tablewrap">
                <table className="helm-table">
                  <thead><tr><th>Usuario</th><th>Tipo</th><th>Negocio</th><th>Estado</th><th></th></tr></thead>
                  <tbody>{rest.map(Row)}</tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
