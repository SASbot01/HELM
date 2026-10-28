import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
    if (localStorage.getItem('bw_superadmin')) { navigate('/admin'); return }
    try {
      const c = JSON.parse(localStorage.getItem('bw_client') || 'null')
      if (c?.clientSlug) navigate('/' + c.clientSlug)
    } catch { /* sesión corrupta: se queda en el login */ }
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
          clientSlug: sa.user.clientSlug, guideSeen: sa.user.guideSeen === true,
          // Oficio y nivel de acceso: de aquí sale qué secciones ve en el menú.
          teamRole: sa.user.teamRole || null, level: sa.user.level || null,
          // Quién es en el directorio del perfil: de aquí sale qué tareas
          // privadas son suyas.
          helmTeamId: sa.user.helmTeamId || null,
        }))
        localStorage.removeItem('bw_superadmin')
        if (sa.token) localStorage.setItem('bw_admin_jwt', sa.token)
        navigate('/' + sa.user.clientSlug)
        return
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
        <p className="admin-login-alt">¿No tienes cuenta? <Link to="/registro">Crea una</Link></p>
      </div>
    </div>
  )
}
