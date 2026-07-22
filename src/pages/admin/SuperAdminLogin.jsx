import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordInput from '../../components/PasswordInput'

// Login del superadmin: pasa por POST /api/admin?action=login para que se
// verifique server-side (scrypt + fallback plain) y obtengamos el JWT firmado.
// Esto cierra CLEANUP-002 — antes el frontend iba directo a Supabase y
// nunca recogía el token que el backend ya emitía.
async function loginSuperAdmin(email, password) {
  try {
    const r = await fetch('/api/admin?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || `Error ${r.status}` }
    return { ok: true, user: data.user, token: data.token || null }
  } catch (err) {
    return { ok: false, error: err?.message || 'Error de red' }
  }
}

export default function SuperAdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (localStorage.getItem('bw_superadmin') || localStorage.getItem('bw_client')) navigate('/admin')
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Completa todos los campos')
      return
    }
    setLoading(true)
    const sa = await loginSuperAdmin(email, password)
    if (sa.ok) {
      // Dos tipos de sesión: superadmin (ve todos los perfiles) y acceso de
      // cliente (entra solo al suyo, sin selector ni creación de perfiles).
      if (sa.user.role === 'client') {
        localStorage.setItem('bw_client', JSON.stringify({
          email: sa.user.email, name: sa.user.name,
          clientId: sa.user.clientId, clientName: sa.user.clientName,
        }))
        localStorage.removeItem('bw_superadmin')
      } else {
        localStorage.setItem('bw_superadmin', sa.user.email)
        localStorage.removeItem('bw_client')
      }
      if (sa.token) {
        localStorage.setItem('bw_admin_jwt', sa.token)
      } else {
        // El backend no firmó token (probablemente falta JWT_SECRET).
        // Limpiamos cualquier token viejo para evitar usar uno expirado.
        localStorage.removeItem('bw_admin_jwt')
      }
      navigate('/admin')
      return
    }
    setError(sa.error && sa.error !== 'Invalid credentials' ? sa.error : 'Credenciales incorrectas')
    setLoading(false)
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-glow" />
      <div className="admin-login-card">
        <img src="/assets/logos/apex-mark-platinum.svg" alt="HELM" className="admin-login-logo" />
        <h1 className="admin-login-title" style={{ letterSpacing: '4px' }}>HELM</h1>
        <p className="admin-login-subtitle">El puesto de mando de tu negocio</p>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-input-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@blackwolfsec.io"
              autoComplete="email"
            />
          </div>
          <div className="admin-input-group">
            <label>Contraseña</label>
            <PasswordInput
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="admin-login-error">{error}</div>}
          <button type="submit" className="admin-login-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Acceder'}
          </button>
        </form>
      </div>
    </div>
  )
}
