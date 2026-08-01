// HELM — shell principal. Marca propia (no APEX). Limpio, claro, simple.
// Se monta en /admin. Gestiona un perfil (cliente) a la vez, con selector arriba.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutDashboard, Users, TrendingUp, ClipboardList, Wallet, MessageSquare, Link2, Blocks, Settings, Plus, Rocket, CalendarDays, Menu, X, Package, UserCog, PhoneCall, MessagesSquare, GraduationCap, FolderOpen, Layers } from 'lucide-react'
import { listClients, createProfile, slugify, usersApi, brandOf } from './lib'
import { Modal, Field, Input } from './ui'
import Guia from './Guia'
import Informe from './views/Informe'
import Onboarding from './views/Onboarding'
import Contenido from './views/Contenido'
import Llamadas from './views/Llamadas'
import Comunidad from './views/Comunidad'
import Interna from './views/Interna'
import Crm from './views/Crm'
import Servicios from './views/Servicios'
import Equipo from './views/Equipo'
import Ventas from './views/Ventas'
import Diario from './views/Diario'
import Finanzas from './views/Finanzas'
import Chat from './views/Chat'
import Enlaces from './views/Enlaces'
import Archivos from './views/Archivos'
import Plugins from './views/Plugins'
import Secciones from './views/Secciones'
import Ajustes from './views/Ajustes'
import { PLUGINS, PLUGIN_MAP, loadEnabled, saveEnabled } from './plugins/registry'
import { loadPermisos, puedeVer, accesoTotal, DEFAULT_VISIBLE, loadSecciones, saveSecciones, seccionEncendida } from './permisos'
import { useHelmTheme } from './theme'
import './theme.css'

const NAV = [
  { key: 'informe', label: 'Informe', icon: LayoutDashboard, title: 'Informe', sub: 'Resumen del negocio', C: Informe },
  { key: 'onboarding', label: 'Onboarding', icon: Rocket, title: 'Onboarding', sub: 'Alimenta a tu IA y trae tu sistema', C: Onboarding },
  { key: 'crm', label: 'CRM', icon: Users, title: 'CRM', sub: 'Tus contactos y pipeline', C: Crm },
  { key: 'servicios', label: 'Servicios', icon: Package, title: 'Servicios', sub: 'El catálogo que lo conecta todo', C: Servicios },
  { key: 'equipo', label: 'Equipo', icon: UserCog, title: 'Equipo y perfiles', sub: 'Quién es quién, cómo se le paga y su contrato', C: Equipo },
  { key: 'ventas', label: 'Ventas', icon: TrendingUp, title: 'Ventas', sub: 'Reporte de ventas', C: Ventas },
  { key: 'diario', label: 'Diario', icon: ClipboardList, title: 'Diario', sub: 'Reportes de closer y setter', C: Diario },
  { key: 'finanzas', label: 'Finanzas', icon: Wallet, title: 'Finanzas', sub: 'Ingresos, gastos y balance', C: Finanzas },
  { key: 'chat', label: 'Chat', icon: MessageSquare, title: 'Chat', sub: 'Tu copywriter con la memoria de este perfil', C: Chat },
  { key: 'contenido', label: 'Contenido', icon: CalendarDays, title: 'Contenido', sub: 'Tu calendario de contenido', C: Contenido },
  { key: 'llamadas', label: 'Llamadas', icon: PhoneCall, title: 'Llamadas', sub: 'Tu agenda de Google, con lo que pasó en cada una', C: Llamadas },
  { key: 'comunidad', label: 'Comunidad', icon: MessagesSquare, title: 'Comunidad', sub: 'El hilo común de todos los negocios de HELM', C: Comunidad },
  { key: 'interna', label: 'Comunidad interna', icon: GraduationCap, title: 'Comunidad interna', sub: 'Tu comunidad y tu formación, con sus miembros', C: Interna },
  { key: 'enlaces', label: 'Enlaces', icon: Link2, title: 'Enlaces', sub: 'Las URLs del negocio, a mano', C: Enlaces },
  { key: 'archivos', label: 'Archivos', icon: FolderOpen, title: 'Archivos', sub: 'Lo que subes, lo que escribe la IA y las Biblias', C: Archivos },
  { key: 'plugins', label: 'Plugins', icon: Blocks, title: 'Plugins', sub: 'Amplía tu HELM', C: Plugins },
  { key: 'secciones', label: 'Secciones', icon: Layers, title: 'Secciones', sub: 'Qué partes del panel usa este negocio', C: Secciones },
  { key: 'ajustes', label: 'Ajustes', icon: Settings, title: 'Ajustes', sub: 'Integraciones y IA de este perfil', C: Ajustes },
]

const LAST_CLIENT_KEY = 'helm_last_client'

// El isotipo hereda el acento del tema: en verde es esmeralda, en negro pasa a
// blanco→gris y en blanco a verde oscuro. Antes tenía el azul/violeta antiguo
// cosido a mano y era lo único que no cambiaba con el resto de la marca.
function Mark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-label="HELM">
      <defs>
        <linearGradient id="helmg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--cyan)" /><stop offset="1" stopColor="var(--violet)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#helmg)" />
      <path d="M10 22V10M22 22V10M10 16h12" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" />
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
  // Secciones apagadas en este negocio. {} = todo encendido, que es como se
  // comportaba HELM antes de que esto existiera.
  const [secciones, setSecciones] = useState({})
  const [guardandoSecciones, setGuardandoSecciones] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)   // menú lateral en móvil
  const [theme] = useHelmTheme()                    // verde | blanco | negro

  // Cambiar de vista cierra el menú móvil.
  const go = (key) => { setView(key); setMenuOpen(false) }

  // Sesión de cliente: entra solo a su perfil. Sin selector, sin crear perfiles.
  const clientSession = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('bw_client') || 'null') } catch { return null }
  }, [])
  const isClient = Boolean(clientSession && !localStorage.getItem('bw_superadmin'))
  // Guía de bienvenida: salta en el primer login de un cliente que no la ha visto.
  // Se puede minimizar; mientras no se complete (paso 15) queda un botón flotante
  // "!" abajo a la derecha para volver a abrirla y terminarla.
  // Pendiente si es un cliente y la guía no está marcada como vista (cubre
  // también sesiones antiguas sin el flag, que quedaban como undefined).
  // Solo a quien lleva el negocio. Un closer al que su jefe acaba de dar acceso
  // no tiene por qué pasar por 15 pantallas sobre onboarding, Biblia y
  // finanzas: ni le corresponde ni podría hacer nada de lo que le cuentan.
  // Las sesiones antiguas no guardan nivel ni rol, y esas sí la ven (era el
  // comportamiento de antes).
  const mandaEnTodo = accesoTotal(clientSession?.level) || !clientSession?.teamRole
  const pendingGuide = isClient && Boolean(clientSession) && clientSession.guideSeen !== true && mandaEnTodo
  const [guideDone, setGuideDone] = useState(() => !pendingGuide)
  const [showGuide, setShowGuide] = useState(() => pendingGuide)

  function finishGuide() {
    usersApi.guideDone().catch(() => {})
    try {
      const c = JSON.parse(localStorage.getItem('bw_client') || 'null')
      if (c) { c.guideSeen = true; localStorage.setItem('bw_client', JSON.stringify(c)) }
    } catch { /* sesión corrupta: da igual, se marca en servidor */ }
    setGuideDone(true)
    setShowGuide(false)
    setView('onboarding')
  }
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

  // Perfil activo completo (no solo su id): de aquí sale la marca blanca con la
  // que se pinta la barra lateral.
  const client = useMemo(() => clients.find(c => c.id === clientId) || null, [clients, clientId])
  const marca = brandOf(client)

  // Guardar la marca en Ajustes tiene que verse arriba a la izquierda al
  // instante, sin recargar ni volver a pedir la lista de perfiles.
  function onClientUpdate(row) {
    setClients(cs => cs.map(c => (c.id === row.id ? { ...c, ...row } : c)))
  }

  // La pestaña del navegador también es marca: con varios perfiles abiertos es
  // lo único que los distingue.
  useEffect(() => { document.title = client ? marca.name : 'HELM' }, [client, marca.name])

  // Volver del consentimiento de Google aterriza en el perfil con ?google=ok;
  // la tarjeta de Ajustes es la que cuenta cómo ha ido, así que abrimos esa.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('google')) setView('ajustes')
  }, [])

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

  // ── Permisos de visibilidad ──────────────────────────────────────────────
  // Un closer o un setter con cuenta propia no ve el panel entero: solo las
  // secciones que su perfil le marque en Ajustes → Permisos. Mientras cargan
  // se usan los valores por defecto, así el menú no parpadea.
  const [visible, setVisible] = useState(DEFAULT_VISIBLE)
  useEffect(() => {
    if (!clientId) return
    loadPermisos(clientId).then(({ visible: v }) => setVisible(v)).catch(() => {})
    loadSecciones(clientId).then(setSecciones).catch(() => setSecciones({}))
  }, [clientId])

  // Apagar una sección es del negocio; el permiso es del rol. Se aplican los
  // dos, y lo apagado manda: si el negocio no usa Diario, no le sale a nadie
  // por mucho permiso que tenga.
  const puede = useCallback(
    (key) => seccionEncendida(secciones, key)
      && puedeVer(visible, clientSession?.teamRole, key, clientSession?.level),
    [secciones, visible, clientSession],
  )

  async function toggleSeccion(key) {
    const siguiente = { ...secciones }
    if (siguiente[key] === false) delete siguiente[key]   // encender = quitarla del objeto
    else siguiente[key] = false
    setSecciones(siguiente)                               // optimista: el menú responde ya
    setGuardandoSecciones(true)
    try { await saveSecciones(clientId, siguiente) } catch { setSecciones(secciones) }
    setGuardandoSecciones(false)
  }

  // Plugins activos y disponibles → entradas de menú extra, filtradas igual.
  const pluginNav = useMemo(
    () => PLUGINS.filter(p => p.available && enabled[p.key] && puede(p.key)),
    [enabled, puede],
  )

  // Menú del núcleo ya filtrado. Si no le queda ninguna sección (un rol al que
  // se lo han quitado todo) se le deja el Informe: mejor una pantalla vacía que
  // un panel sin menú del que no se puede salir.
  const coreNav = useMemo(() => {
    const permitidas = NAV.filter(n => puede(n.key))
    return permitidas.length ? permitidas : [NAV[0]]
  }, [puede])

  // La vista activa puede ser del núcleo o de un plugin. Una sección que no le
  // corresponde no se abre ni escribiendo la URL: cae en la primera que sí.
  const coreCurrent = coreNav.find(n => n.key === view)
  const pluginCurrent = !coreCurrent ? PLUGIN_MAP[view] : null
  const current = coreCurrent || (pluginCurrent && pluginNav.includes(pluginCurrent) ? pluginCurrent : null) || coreNav[0]
  const isPlugin = !NAV.includes(current)
  const View = isPlugin ? current.View : current.C
  const title = isPlugin ? current.name : current.title
  const sub = isPlugin ? current.desc : current.sub

  return (
    <div className="helm" data-theme={theme}>
      <div className="helm-shell">
        {menuOpen && <div className="helm-side-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={'helm-side' + (menuOpen ? ' open' : '')}>
          <div className="helm-brand">
            {marca.logo ? <img src={marca.logo} alt={marca.name} /> : <Mark />}
            <div><b>{marca.name}</b><span>{marca.subtitle}</span></div>
            <button className="helm-side-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
          </div>
          <div className="helm-navlabel">NEGOCIO</div>
          {coreNav.map(n => {
            const Icon = n.icon
            return (
              <div key={n.key} className={'helm-nav' + (view === n.key ? ' active' : '')} onClick={() => go(n.key)}>
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
                  <div key={p.key} className={'helm-nav' + (view === p.key ? ' active' : '')} onClick={() => go(p.key)}>
                    <Icon /> {p.name}
                  </div>
                )
              })}
            </>
          )}
          <div className="helm-side-foot">
            {!isClient && (
              <div className="helm-nav" onClick={() => navigate('/usersadmin')}>
                <Users /> Usuarios
              </div>
            )}
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
            <div className="helm-top-left">
              <button className="helm-burger" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
              <div>
                <h1>{title}</h1>
                <p>{sub}</p>
              </div>
            </div>
            <div className="helm-top-actions">
              {isClient ? (
                <span className="helm-badge">{marca.name}</span>
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
            ) : current.key === 'secciones' ? (
              <Secciones
                key={clientId} secciones={secciones} catalogo={NAV}
                onToggle={toggleSeccion} guardando={guardandoSecciones} />
            ) : (
              <View
                key={clientId + view}
                clientId={clientId}
                client={client}
                onClientUpdate={onClientUpdate}
                onNavigate={setView}
              />
            )}
          </div>
        </main>
      </div>

      {showNew && <NewProfileModal onClose={() => setShowNew(false)} onCreated={onCreated} />}
      {showGuide && <Guia onFinish={finishGuide} onClose={() => setShowGuide(false)} />}
      {isClient && !guideDone && !showGuide && (
        <button className="helm-guide-fab" onClick={() => setShowGuide(true)} aria-label="Completar la guía de bienvenida">
          !
        </button>
      )}
    </div>
  )
}
