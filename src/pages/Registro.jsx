// HELM — registro público. Crea el negocio y su acceso en estado PENDIENTE;
// un superadmin los aprueba desde /usersadmin antes de poder entrar.
import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import PasswordInput from '../components/PasswordInput'
import { registerAccount, uploadLogo, MAX_LOGO_MB, DEFAULT_SUBTITLE } from '../helm/lib'

export default function Registro() {
  const [form, setForm] = useState({
    businessName: '', name: '', email: '', password: '',
    brandName: '', brandSubtitle: '', logoUrl: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // El logo sube antes de crear la cuenta: todavía no hay perfil al que
  // colgarlo, así que aterriza en la carpeta `registro/` del mismo bucket y lo
  // que viaja al servidor es solo su URL.
  async function elegirLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSubiendo(true); setError('')
    try { set('logoUrl', await uploadLogo(file)) }
    catch (err) { setError(err.message) }
    setSubiendo(false)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.businessName.trim() || !form.name.trim() || !form.email.trim() || !form.password) {
      return setError('Completa los campos obligatorios')
    }
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres')
    setLoading(true)
    try {
      await registerAccount(form)
      setDone(true)
    } catch (err) {
      setError(err.message || 'No se pudo completar el registro')
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-glow" />
      <div className="admin-login-card">
        <img src="/assets/logos/helm-mark.svg" alt="HELM" className="admin-login-logo" />
        <h1 className="admin-login-title" style={{ letterSpacing: '4px' }}>HELM</h1>

        {done ? (
          <>
            <p className="admin-login-subtitle">¡Cuenta creada!</p>
            <div className="admin-login-ok">
              Tu cuenta está <b>pendiente de aprobación</b>. En cuanto un administrador la
              active, podrás entrar con tu email y contraseña — y te recibiremos con una guía
              rápida para arrancar.
            </div>
            <button className="admin-login-btn" onClick={() => navigate('/login')}>Ir al login</button>
          </>
        ) : (
          <>
            <p className="admin-login-subtitle">Crea tu cuenta y empieza a construir</p>
            <form onSubmit={submit} className="admin-login-form">
              <div className="admin-input-group">
                <label>Nombre de tu negocio</label>
                <input value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Acme Growth" autoFocus />
              </div>
              <div className="admin-input-group">
                <label>Tu nombre</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="María García" />
              </div>
              <div className="admin-input-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="maria@acme.com" autoComplete="email" />
              </div>
              <div className="admin-input-group">
                <label>Contraseña</label>
                <PasswordInput value={form.password} onChange={e => set('password', e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
              </div>

              {/* Marca blanca: el panel se verá con esto, no con la marca HELM.
                  Todo opcional — quien no lo rellene entra con el nombre de su
                  negocio y podrá ponerlo luego desde Ajustes → Marca. */}
              <div className="registro-marca">
                <div className="registro-marca-head">
                  <b>Tu marca</b>
                  <small>Opcional · el panel se verá con tu logo y tu nombre. Se puede cambiar luego en Ajustes.</small>
                </div>

                <div className="registro-logo">
                  {form.logoUrl
                    ? <img src={form.logoUrl} alt="Tu logo" />
                    : <span className="registro-logo-ph">Logo</span>}
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={elegirLogo} />
                    <button type="button" className="registro-logo-btn" disabled={subiendo} onClick={() => fileRef.current?.click()}>
                      {subiendo ? 'Subiendo…' : form.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                    </button>
                    {form.logoUrl && (
                      <button type="button" className="registro-logo-btn" onClick={() => set('logoUrl', '')}>Quitar</button>
                    )}
                    <small>PNG, JPG o SVG · hasta {MAX_LOGO_MB} MB</small>
                  </div>
                </div>

                <div className="admin-input-group">
                  <label>Nombre de marca</label>
                  <input value={form.brandName} onChange={e => set('brandName', e.target.value)}
                    placeholder={form.businessName || 'Acme'} maxLength={40} />
                </div>
                <div className="admin-input-group">
                  <label>Subtítulo</label>
                  <input value={form.brandSubtitle} onChange={e => set('brandSubtitle', e.target.value)}
                    placeholder={DEFAULT_SUBTITLE} maxLength={40} />
                </div>
              </div>

              {error && <div className="admin-login-error">{error}</div>}
              <button type="submit" className="admin-login-btn" disabled={loading || subiendo}>
                {loading ? 'Creando…' : 'Crear cuenta'}
              </button>
            </form>
            <p className="admin-login-alt">¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></p>
          </>
        )}
      </div>
    </div>
  )
}
