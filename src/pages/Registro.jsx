// HELM — alta de agencia. Sin aprobación manual: POST /api/register crea la
// agencia y su cuenta y contesta como el login (`{ success, user, token }`),
// así que se guarda la misma sesión que guarda SuperAdminLogin y se entra
// directo al panel. El logo y la marca se ponen luego en Ajustes.
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import PasswordInput from '../components/PasswordInput'

const ERRORES = {
  409: 'Ya existe una cuenta con ese email',
  429: 'Demasiados intentos. Espera un poco y vuelve a probar',
}

export default function Registro() {
  const [form, setForm] = useState({ agencia: '', name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.agencia.trim() || !form.name.trim() || !form.email.trim() || !form.password) {
      return setError('Completa todos los campos')
    }
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    setLoading(true)
    try {
      const r = await fetch('/api/register?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencia: form.agencia.trim(), name: form.name.trim(),
          email: form.email.trim(), password: form.password,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.user) throw new Error(data.error || ERRORES[r.status] || `Error ${r.status}`)
      entrar(data.user, data.token || null)
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta')
      setLoading(false)
    }
  }

  // Lo mismo que hace SuperAdminLogin tras un login correcto.
  function entrar(user, token) {
    if (user.role === 'client') {
      localStorage.setItem('bw_client', JSON.stringify({
        email: user.email, name: user.name,
        clientId: user.clientId, clientName: user.clientName,
        clientSlug: user.clientSlug, guideSeen: user.guideSeen === true,
        teamRole: user.teamRole || null, level: user.level || null,
        helmTeamId: user.helmTeamId || null,
      }))
      localStorage.removeItem('bw_superadmin')
      if (token) localStorage.setItem('bw_admin_jwt', token)
      navigate('/' + user.clientSlug)
      return
    }
    localStorage.setItem('bw_superadmin', user.email)
    localStorage.removeItem('bw_client')
    if (token) localStorage.setItem('bw_admin_jwt', token)
    else localStorage.removeItem('bw_admin_jwt')
    navigate('/admin')
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-glow" />
      <div className="admin-login-card">
        <img src="/assets/logos/helm-mark.svg" alt="HELM" className="admin-login-logo" />
        <h1 className="admin-login-title" style={{ letterSpacing: '4px' }}>HELM</h1>
        <p className="admin-login-subtitle">Crea tu agencia y opera a tus clientes</p>
        <form onSubmit={submit} className="admin-login-form">
          <div className="admin-input-group">
            <label>Nombre de la agencia</label>
            <input value={form.agencia} onChange={e => set('agencia', e.target.value)} placeholder="Acme Growth" autoComplete="organization" autoFocus />
          </div>
          <div className="admin-input-group">
            <label>Tu nombre</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="María García" autoComplete="name" />
          </div>
          <div className="admin-input-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="maria@acme.com" autoComplete="email" />
          </div>
          <div className="admin-input-group">
            <label>Contraseña</label>
            <PasswordInput value={form.password} onChange={e => set('password', e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          {error && <div className="admin-login-error">{error}</div>}
          <button type="submit" className="admin-login-btn" disabled={loading}>
            {loading ? 'Creando…' : 'Crear cuenta'}
          </button>
        </form>
        <p className="admin-login-alt">¿Ya tienes cuenta? <Link to="/login">Entrar</Link></p>
      </div>
    </div>
  )
}
