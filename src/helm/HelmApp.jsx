// HELM — shell principal. Marca propia (no APEX). Limpio, claro, simple.
// Se monta en /admin. Gestiona un perfil (cliente) a la vez, con selector arriba.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutDashboard, Users, TrendingUp, ClipboardList, Wallet, MessageSquare, Link2, Blocks, Settings, Plus } from 'lucide-react'
import { listClients, createProfile, slugify } from './lib'
import { Modal, Field, Input } from './ui'
import Informe from './views/Informe'
import Crm from './views/Crm'
import Ventas from './views/Ventas'
import Diario from './views/Diario'
import Finanzas from './views/Finanzas'
import Chat from './views/Chat'
import Enlaces from './views/Enlaces'
import Plugins from './views/Plugins'
import Ajustes from './views/Ajustes'
import { PLUGINS, PLUGIN_MAP, loadEnabled, saveEnabled } from './plugins/registry'
import './theme.css'

const NAV = [
  { key: 'informe', label: 'Informe', icon: LayoutDashboard, title: 'Informe', sub: 'Resumen del negocio', C: Informe },
  { key: 'crm', label: 'CRM', icon: Users, title: 'CRM', sub: 'Tus contactos y pipeline', C: Crm },
  { key: 'ventas', label: 'Ventas', icon: TrendingUp, title: 'Ventas', sub: 'Reporte de ventas', C: Ventas },
  { key: 'diario', label: 'Diario', icon: ClipboardList, title: 'Diario', sub: 'Reportes de closer y setter', C: Diario },
  { key: 'finanzas', label: 'Finanzas', icon: Wallet, title: 'Finanzas', sub: 'Ingresos, gastos y balance', C: Finanzas },
  { key: 'chat', label: 'Chat', icon: MessageSquare, title: 'Chat', sub: 'Tu copywriter con la memoria de este perfil', C: Chat },
  { key: 'enlaces', label: 'Enlaces', icon: Link2, title: 'Enlaces', sub: 'Las URLs del negocio, a mano', C: Enlaces },
  { key: 'plugins', label: 'Plugins', icon: Blocks, title: 'Plugins', sub: 'Amplía tu HELM', C: Plugins },
  { key: 'ajustes', label: 'Ajustes', icon: Settings, title: 'Ajustes', sub: 'Integraciones y IA de este perfil', C: Ajustes },
]

const LAST_CLIENT_KEY = 'helm_last_client'

function Mark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-label="HELM">
      <defs>
        <linearGradient id="helmg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00D4FF" /><stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#helmg)" />
      <path d="M10 22V10M22 22V10M10 16h12" stroke="#06060B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

const EMPTY_FORM = { name: '', slug: '', slugTouched: false, client_type: 'growth', withAccess: false, admin_email: '', admin_password: '' }

// Modal de creación de perfil (cliente + pipeline + acceso opcional).
function NewProfileModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const effSlug = form.slugTouched ? form.slug : slugify(form.name)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('El nombre del perfil es obligatorio')
    if (effSlug.length < 3) return setError('La URL debe tener al menos 3 caracteres')
    if (form.withAccess) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email)) return setError('Email de acceso inválido')
      if (form.admin_password.length < 6) return setError('La contraseña de acceso debe tener al menos 6 caracteres')
    }
    setSaving(true)
    try {
      const client = await createProfile({
        name: form.name.trim(),
        slug: effSlug,
        client_type: form.client_type,
        admin: form.withAccess ? { email: form.admin_email, password: form.admin_password } : undefined,
      })
      onCreated(client)
    } catch (err) {
      setError(err.message || 'No se pudo crear el perfil')
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo perfil de negocio" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre del negocio">
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Growth" autoFocus />
        </Field>
        <Field label="URL del perfil">
          <Input value={effSlug} onChange={e => { set('slug', slugify(e.target.value)); set('slugTouched', true) }} placeholder="acme-growth" />
        </Field>
        <label className="helm-checkline">
          <input type="checkbox" checked={form.withAccess} onChange={e => set('withAccess', e.target.checked)} />
          Crear un acceso (login) para este cliente
        </label>
        {form.withAccess && (
          <>
            <Field label="Email de acceso">
              <Input type="email" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="cliente@empresa.com" />
            </Field>
            <Field label="Contraseña">
              <Input type="password" value={form.admin_password} onChange={e => set('admin_password', e.target.value)} placeholder="Mínimo 6 caracteres" />
            </Field>
          </>
        )}

        {error && <div className="helm-formerror">{error}</div>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Creando…' : 'Crear perfil'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function HelmApp() {
  const navigate = useNavigate()
  // La URL manda: /<slug> abre ese perfil. /admin entra sin slug y redirige
  // al último usado, para que la barra de direcciones siempre diga dónde estás.
  const { slug: urlSlug } = useParams()
  const [view, setView] = useState('informe')
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState(null)
  const [loadingClients, setLoadingClients] = useState(true)
  const [enabled, setEnabled] = useState({})
  const [showNew, setShowNew] = useState(false)

  // Sesión de cliente: entra solo a su perfil. Sin selector, sin crear perfiles.
  const clientSession = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('bw_client') || 'null') } catch { return null }
  }, [])
  const isClient = Boolean(clientSession && !localStorage.getItem('bw_superadmin'))
  const email = (typeof localStorage !== 'undefined' && localStorage.getItem('bw_superadmin'))
    || clientSession?.email || 'silvestreIA'

  // Selecciona un perfil: fija el id, persiste y carga sus plugins activos.
  function selectClient(id) {
    setClientId(id)
    if (id) {
      localStorage.setItem(LAST_CLIENT_KEY, id)
      setEnabled(loadEnabled(id))
    }
  }

  // Cambiar de perfil desde el selector = cambiar de URL.
  function goToClient(id) {
    const c = clients.find(x => x.id === id)
    if (c) navigate('/' + c.slug)
    else selectClient(id)
  }

  // Carga la lista de perfiles y restaura el último seleccionado.
  async function refreshClients(preferId) {
    const all = await listClients()
    // El cliente solo ve el suyo, pase lo que pase.
    const cs = isClient ? all.filter(c => c.id === clientSession.clientId) : all
    setClients(cs)
    setLoadingClients(false)

    // Un cliente que se cuele en el slug de otro perfil vuelve al suyo.
    if (isClient && urlSlug && cs[0] && urlSlug !== cs[0].slug) {
      navigate('/' + cs[0].slug, { replace: true })
      selectClient(cs[0].id)
      return cs
    }

    const bySlug = urlSlug ? cs.find(c => c.slug === urlSlug) : null
    const saved = preferId || localStorage.getItem(LAST_CLIENT_KEY)
    const pick = bySlug || (isClient ? cs[0] : (cs.find(c => c.id === saved) || cs[0]))
    selectClient(pick ? pick.id : null)
    // Sin slug en la URL (o con uno que no existe): la fijamos al perfil elegido.
    if (pick && urlSlug !== pick.slug) navigate('/' + pick.slug, { replace: true })
    return cs
  }

  // Carga inicial de perfiles al montar (guard de auth + fetch). Solo debe
  // correr una vez; refreshClients es estable en la práctica.
  useEffect(() => {
    if (!localStorage.getItem('bw_superadmin') && !localStorage.getItem('bw_client')) { navigate('/login'); return }
    refreshClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, urlSlug])

  function togglePlugin(key) {
    setEnabled(prev => {
      const next = { ...prev, [key]: !prev[key] }
      saveEnabled(clientId, next)
      return next
    })
  }

  function logout() {
    localStorage.removeItem('bw_superadmin')
    localStorage.removeItem('bw_client')
    localStorage.removeItem('bw_admin_jwt')
    navigate('/login')
  }

  function onCreated(client) {
    setShowNew(false)
    setView('informe')
    navigate('/' + client.slug)
  }

  // Plugins activos y disponibles → entradas de menú extra.
  const pluginNav = useMemo(
    () => PLUGINS.filter(p => p.available && enabled[p.key]),
    [enabled],
  )

  // La vista activa puede ser del núcleo o de un plugin.
  const coreCurrent = NAV.find(n => n.key === view)
  const pluginCurrent = !coreCurrent ? PLUGIN_MAP[view] : null
  const current = coreCurrent || (pluginCurrent && pluginNav.includes(pluginCurrent) ? pluginCurrent : null) || NAV[0]
  const isPlugin = !NAV.includes(current)
  const View = isPlugin ? current.View : current.C
  const title = isPlugin ? current.name : current.title
  const sub = isPlugin ? current.desc : current.sub

  return (
    <div className="helm">
      <div className="helm-shell">
        <aside className="helm-side">
          <div className="helm-brand">
            <Mark />
            <div><b>HELM</b><span>OPERATING LAYER</span></div>
          </div>
          <div className="helm-navlabel">NEGOCIO</div>
          {NAV.map(n => {
            const Icon = n.icon
            return (
              <div key={n.key} className={'helm-nav' + (view === n.key ? ' active' : '')} onClick={() => setView(n.key)}>
                <Icon /> {n.label}
              </div>
            )
          })}
          {pluginNav.length > 0 && (
            <>
              <div className="helm-navlabel">PLUGINS</div>
              {pluginNav.map(p => {
                const Icon = p.icon
                return (
                  <div key={p.key} className={'helm-nav' + (view === p.key ? ' active' : '')} onClick={() => setView(p.key)}>
                    <Icon /> {p.name}
                  </div>
                )
              })}
            </>
          )}
          <div className="helm-side-foot">
            <div className="helm-user">
              <div className="helm-avatar">{email[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.split('@')[0]}</div>
                <small>{isClient ? 'Cliente' : 'Administrador'}</small>
              </div>
            </div>
            <div className="helm-logout" onClick={logout}>Cerrar sesión</div>
          </div>
        </aside>

        <main className="helm-main">
          <header className="helm-top">
            <div>
              <h1>{title}</h1>
              <p>{sub}</p>
            </div>
            <div className="helm-top-actions">
              {isClient ? (
                <span className="helm-badge">{clientSession.clientName}</span>
              ) : (
                <>
                  {clients.length > 0 && (
                    <select className="helm-select" value={clientId || ''} onChange={e => goToClient(e.target.value)}>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <button className="helm-btn" onClick={() => setShowNew(true)}>
                    <Plus size={16} /> Nuevo perfil
                  </button>
                </>
              )}
            </div>
          </header>
          <div className="helm-body">
            {loadingClients ? (
              <div className="helm-empty">Cargando perfiles…</div>
            ) : !clientId ? (
              <div className="helm-empty-cta">
                <h2>{isClient ? 'Tu perfil ya no está disponible' : 'Aún no tienes ningún perfil de negocio'}</h2>
                <p>Crea el primero para empezar a gestionar su CRM, ventas y finanzas.</p>
                <button className="helm-btn primary" onClick={() => setShowNew(true)}>
                  <Plus size={16} /> Crear tu primer perfil
                </button>
              </div>
            ) : current.key === 'plugins' ? (
              <Plugins key={clientId} enabled={enabled} onToggle={togglePlugin} />
            ) : (
              <View key={clientId + view} clientId={clientId} />
            )}
          </div>
        </main>
      </div>

      {showNew && <NewProfileModal onClose={() => setShowNew(false)} onCreated={onCreated} />}
    </div>
  )
}
