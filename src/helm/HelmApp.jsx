// HELM — shell principal. Marca propia (no APEX). Limpio, claro, simple.
// Se monta en /admin. Gestiona un perfil (cliente) a la vez, con selector arriba.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutDashboard, Users, TrendingUp, ClipboardList, Wallet, Link2, Settings, Plus, Rocket, Menu, X, Package, UserCog, PhoneCall, Layers, CalendarClock, BookOpen, FileText, Receipt, ShieldCheck, Bot, Sunrise, Newspaper, LayoutGrid, LogOut } from 'lucide-react'
import { listClients, createProfile, slugify, usersApi, brandOf } from './lib'
import { productoActual, seccionDelProducto, seccionSiempre } from './producto'
import { Modal, Field, Input } from './ui'
import Guia from './Guia'
import Perfiles from './Perfiles'
import Notificaciones from './Notificaciones'
import Informe from './views/Informe'
import Onboarding from './views/Onboarding'
import Agentes from './views/Agentes'
import MiDia from './views/MiDia'
import Noticias from './views/Noticias'
import Lienzo from './Lienzo'
import Llamadas from './views/Llamadas'
import Crm from './views/Crm'
import Servicios from './views/Servicios'
import Documentos from './views/Documentos'
import Gastos from './views/Gastos'
import Equipo from './views/Equipo'
import Ventas from './views/Ventas'
import Diario from './views/Diario'
import Finanzas from './views/Finanzas'
import Enlaces from './views/Enlaces'
import Secciones from './views/Secciones'
import Fiscal from './views/Fiscal'
import Copiloto from './views/Copiloto'
import Ajustes from './views/Ajustes'
import { PLUGINS, PLUGIN_MAP } from './plugins/registry'
import { loadPermisos, puedeVer, accesoTotal, DEFAULT_VISIBLE, loadSecciones, saveSecciones, seccionEncendida, esOptIn } from './permisos'
import { useHelmTheme, acentoDe } from './theme'
import './theme.css'

const NAV = [
  { key: 'informe', tono: 'oro', label: 'Informe', icon: LayoutDashboard, title: 'Informe', sub: 'Resumen del negocio', C: Informe },
  { key: 'onboarding', tono: 'azul', label: 'Onboarding', icon: Rocket, title: 'Onboarding', sub: 'Alimenta a tu IA y trae tu sistema', C: Onboarding },
  { key: 'crm', tono: 'azul', label: 'CRM', icon: Users, title: 'CRM', sub: 'Tus contactos y pipeline', C: Crm },
  { key: 'servicios', tono: 'oro', label: 'Servicios', icon: Package, title: 'Servicios', sub: 'El catálogo que lo conecta todo', C: Servicios },
  { key: 'documentos', tono: 'oro', label: 'Documentos', icon: FileText, title: 'Presupuestos y facturas', sub: 'Del presupuesto a la factura, con tu marca', C: Documentos },
  { key: 'gastos', tono: 'oro', label: 'Gastos', icon: Receipt, title: 'Gastos', sub: 'Facturas de compra, con captura por IA', C: Gastos },
  { key: 'equipo', tono: 'azul', label: 'Equipo', icon: UserCog, title: 'Equipo y perfiles', sub: 'Quién es quién, cómo se le paga y su contrato', C: Equipo },
  { key: 'ventas', tono: 'oro', label: 'Ventas', icon: TrendingUp, title: 'Ventas', sub: 'Reporte de ventas', C: Ventas },
  { key: 'diario', tono: 'azul', label: 'Diario', icon: ClipboardList, title: 'Diario', sub: 'Reportes de closer y setter', C: Diario },
  { key: 'finanzas', tono: 'oro', label: 'Finanzas', icon: Wallet, title: 'Finanzas', sub: 'Ingresos, gastos y balance', C: Finanzas },
  // El Chat se retiró: los guiones y el copy se piden a Claude por el conector
  // (api/mcp). api/chat.js sigue vivo porque lo usan Telegram, el Copiloto
  // Fiscal y la Biblioteca.
  // Agentes ocupa el sitio de Guiones, que se retiró: los guiones los escribe
  // ahora Claude con los creadores de referencia del perfil. La CLAVE sigue
  // siendo 'contenido' a propósito: es la que está guardada en los permisos y
  // las secciones activas de cada perfil, así que quien veía Guiones ve Agentes.
  // Edición (el puesto del editor de vídeo) se retiró del panel.
  // Mi día: los rituales diarios con la IA (priorizar, preparar reuniones,
  // cerrar el día). Va el primero de su rama: es lo que se abre cada mañana.
  { key: 'dia', tono: 'rojo', label: 'Mi día', icon: Sunrise, title: 'Mi día', sub: 'Tus rituales diarios con la IA', C: MiDia },
  // Noticias: las tres del día de IA y ciberseguridad, que deja un agente antes
  // de las 6:00. Nace apagada: solo la quiere quien hace contenido de eso.
  { key: 'noticias', tono: 'rojo', label: 'Noticias', icon: Newspaper, title: 'Noticias', sub: 'Las tres del día de IA y ciberseguridad', C: Noticias },
  { key: 'contenido', tono: 'rojo', label: 'Agentes', icon: Bot, title: 'Agentes', sub: 'Tus agentes de IA y los creadores que estudian', C: Agentes },
  { key: 'llamadas', tono: 'azul', label: 'Llamadas', icon: PhoneCall, title: 'Llamadas', sub: 'Tu agenda de Google, con lo que pasó en cada una', C: Llamadas },
  { key: 'enlaces', tono: 'rojo', label: 'Enlaces', icon: Link2, title: 'Enlaces', sub: 'Las URLs del negocio, a mano', C: Enlaces },
  // Archivos se retiró: los archivos del negocio se llevan en Drive.
  { key: 'fiscal', tono: 'oro', label: 'Fiscal', icon: CalendarClock, title: 'Fiscal', sub: 'Plazos y modelos de tus clientes', C: Fiscal },
  { key: 'copiloto', tono: 'oro', label: 'Copiloto Fiscal', icon: ShieldCheck, title: 'Copiloto Fiscal', sub: 'Pregúntale por plazos, clientes y avisos', C: Copiloto },
  { key: 'secciones', tono: 'plata', label: 'Secciones', icon: Layers, title: 'Secciones', sub: 'Qué partes del panel usa este negocio', C: Secciones },
  { key: 'ajustes', tono: 'plata', label: 'Ajustes', icon: Settings, title: 'Ajustes', sub: 'Integraciones y IA de este perfil', C: Ajustes },
]

// El menú no es una lista: es un esquema de tres ramas, y cada rama tiene su
// color de borde. Ese mismo color tiñe la cabecera y los paneles de la sección
// abierta, así que se sabe en qué parte del negocio se está sin leer el título.
// El ORDEN de NAV no cambia (de él sale la sección a la que aterriza cada rol);
// esto solo decide dónde se pinta cada recuadro.
const GRUPOS = [
  { tono: 'oro', label: 'Dinero' },
  { tono: 'azul', label: 'Clientes y equipo' },
  { tono: 'rojo', label: 'Contenido e IA' },
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
      if (form.admin_password.length < 8) return setError('La contraseña de acceso debe tener al menos 8 caracteres')
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
  // Cada producto entra por su puerta: HELM por el Informe, el dominio del
  // Scraper por el Scraper. Caer en una sección que ese producto ni siquiera
  // tiene y rebotar a otra es un parpadeo feo en la primera pantalla.
  const [view, setView] = useState(() => productoActual().vistaInicial || 'informe')
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState(null)
  const [loadingClients, setLoadingClients] = useState(true)
  // Secciones apagadas en este negocio. {} = todo encendido, que es como se
  // comportaba HELM antes de que esto existiera.
  const [secciones, setSecciones] = useState({})
  const [guardandoSecciones, setGuardandoSecciones] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)   // menú lateral en móvil
  const [theme] = useHelmTheme()                    // negro (base) | verde | azul | rojo | blanco

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
    // Al terminar, cada producto lleva a su primer paso real: en HELM es el
    // onboarding de marca; en un despacho, el CRM — porque sin clientes dados
    // de alta no hay ficha fiscal, y sin ficha no hay plazos.
    setView(seccionDelProducto('onboarding') ? 'onboarding' : 'crm')
  }
  const email = (typeof localStorage !== 'undefined' && localStorage.getItem('bw_superadmin'))
    || clientSession?.email || 'silvestreIA'

  // Selecciona un perfil: fija el id, persiste y carga sus plugins activos.
  function selectClient(id) {
    setClientId(id)
    if (id) {
      localStorage.setItem(LAST_CLIENT_KEY, id)
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

    // El administrador que entra sin slug (/admin) no cae en ningún perfil:
    // ve el tablero con todos y elige él.
    if (!isClient && !urlSlug) { setClientId(null); return cs }

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
  // Sin perfil elegido, la pestaña lleva el nombre del PRODUCTO, no el de HELM:
  // en consultoria.s4sf.net se está vendiendo otra cosa.
  const producto = productoActual()
  useEffect(() => {
    document.title = client ? marca.name : producto.nombre
  }, [client, marca.name, producto.nombre])

  // Volver del consentimiento de Google aterriza en el perfil con ?google=ok;
  // la tarjeta de Ajustes es la que cuenta cómo ha ido, así que abrimos esa.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('google') || q.get('instagram')) setView('ajustes')
  }, [])

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

  // Tres filtros, y en este orden: qué secciones EXISTEN en este producto (el
  // calendario de contenido no pinta nada en un despacho, ni encendiéndolo),
  // qué usa este negocio, y qué puede ver este rol. El primero manda sobre los
  // otros dos.
  const puede = useCallback(
    (key) => seccionDelProducto(key)
      // `seccionSiempre` es para lo que ES el producto (el Scraper en
      // scraper.s4sf.net): apagarlo dejaría el dominio en una pantalla vacía.
      && (seccionSiempre(key) || seccionEncendida(secciones, key))
      && puedeVer(visible, clientSession?.teamRole, key, clientSession?.level),
    [secciones, visible, clientSession],
  )

  async function toggleSeccion(key) {
    const siguiente = { ...secciones }
    // Dos familias con lógica invertida. Las del núcleo nacen ENCENDIDAS, así
    // que apagarlas es escribir `false` y encenderlas es quitar la clave. Las
    // de sector y los módulos nacen APAGADOS: encenderlos es escribir `true`.
    // Con una sola regla, pulsar un módulo le ponía `false` — que ya lo estaba
    // — y el interruptor no hacía nada.
    if (esOptIn(key)) {
      if (siguiente[key] === true) delete siguiente[key]
      else siguiente[key] = true
    } else if (siguiente[key] === false) {
      delete siguiente[key]
    } else {
      siguiente[key] = false
    }
    setSecciones(siguiente)                               // optimista: el menú responde ya
    setGuardandoSecciones(true)
    try { await saveSecciones(clientId, siguiente) } catch { setSecciones(secciones) }
    setGuardandoSecciones(false)
  }

  // Los módulos (lo que antes eran los "plugins") son secciones como las demás:
  // se encienden en Secciones y se guardan en la base. Aquí solo se pintan los
  // que estén encendidos y el rol pueda ver.
  const pluginNav = useMemo(
    () => PLUGINS.filter(p => p.available && puede(p.key)),
    [puede],
  )

  // Menú del núcleo ya filtrado. Si no le queda ninguna sección (un rol al que
  // se lo han quitado todo) se le deja el Informe: mejor una pantalla vacía que
  // un panel sin menú del que no se puede salir.
  const coreNav = useMemo(() => {
    const permitidas = NAV.filter(n => puede(n.key))
    return permitidas.length ? permitidas : [NAV[0]]
  }, [puede])

  // Ajustes se pinta abajo, junto a la cuenta, pero sigue estando en `coreNav`
  // para que la vista se resuelva igual: sacarlo de ahí haría que entrar por
  // /ajustes cayera en el Informe.
  const navPie = useMemo(() => coreNav.filter(n => n.tono === 'plata'), [coreNav])
  const navNegocio = useMemo(() => coreNav.filter(n => n.tono !== 'plata'), [coreNav])

  // La vista activa puede ser del núcleo o de un plugin. Una sección que no le
  // corresponde no se abre ni escribiendo la URL: cae en la primera que sí.
  const coreCurrent = coreNav.find(n => n.key === view)
  const pluginCurrent = !coreCurrent ? PLUGIN_MAP[view] : null
  const current = coreCurrent || (pluginCurrent && pluginNav.includes(pluginCurrent) ? pluginCurrent : null) || coreNav[0]
  const isPlugin = !NAV.includes(current)
  const View = isPlugin ? current.View : current.C
  const title = isPlugin ? current.name : current.title
  const sub = isPlugin ? current.desc : current.sub
  const tono = current.tono || 'plata'
  // /admin sin slug: el tablero de perfiles, sin menú ni cabecera.
  const eligiendo = !isClient && !urlSlug

  const recuadro = (key, Icon, label, onClick, extra) => (
    <button
      type="button" key={key}
      className={'helm-tile' + (view === key ? ' activa' : '')}
      aria-current={view === key ? 'page' : undefined}
      onClick={onClick || (() => go(key))}
    >
      <Icon /><span>{label}{extra && <small>{extra}</small>}</span>
    </button>
  )

  return (
    // El color de marca del perfil pisa el acento del tema. Va como estilo en
    // línea y no como clase porque es un dato del negocio, no una variante
    // prevista: cada perfil trae el suyo.
    <div className="helm" data-theme={theme} data-tono={eligiendo ? 'oro' : tono} style={acentoDe(marca.color) || undefined}>
      <Lienzo vista={view} />
      {eligiendo ? (
        <Perfiles
          clients={clients} loading={loadingClients}
          lastId={localStorage.getItem(LAST_CLIENT_KEY)}
          email={email} producto={producto.nombre}
          onPick={c => navigate('/' + c.slug)}
          onNew={() => setShowNew(true)}
          onUsers={() => navigate('/usersadmin')}
          onLogout={logout}
          onChanged={refreshClients}
        />
      ) : (
      <div className="helm-shell">
        {menuOpen && <div className="helm-side-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={'helm-side' + (menuOpen ? ' open' : '')}>
          <div className="helm-brand">
            {marca.logo ? <img src={marca.logo} alt={marca.name} /> : <Mark />}
            <div><b>{marca.name}</b><span>{marca.subtitle}</span></div>
            <button className="helm-side-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
          </div>
          {GRUPOS.map(g => {
            const items = navNegocio.filter(n => n.tono === g.tono)
            if (!items.length) return null
            return (
              <div key={g.tono} className="helm-grupo" data-tono={g.tono}>
                <div className="helm-grupo-cab">{g.label}</div>
                <div className="helm-grupo-grid">
                  {items.map(n => recuadro(n.key, n.icon, n.label))}
                </div>
              </div>
            )
          })}
          {pluginNav.length > 0 && (
            <div className="helm-grupo" data-tono="plata">
              <div className="helm-grupo-cab">Módulos</div>
              <div className="helm-grupo-grid">
                {pluginNav.map(p => recuadro(p.key, p.icon, p.name))}
              </div>
            </div>
          )}
          <div className="helm-side-foot">
            {/* Lo de la cuenta y no del negocio: se toca de uvas a peras y
                estorbaba en medio de las secciones. */}
            <div className="helm-grupo" data-tono="plata">
              <div className="helm-grupo-cab">Cuenta</div>
              <div className="helm-grupo-grid">
                {navPie.map(n => recuadro(n.key, n.icon, n.label))}
                {/* Solo un superadmin (ver isClient arriba), y lo que abre es la
                    lista de TODA la plataforma, no el equipo de este negocio:
                    de ahí el aviso en el propio recuadro. */}
                {!isClient && recuadro('_usuarios', Users, 'Usuarios', () => navigate('/usersadmin'), 'toda la plataforma')}
                {/* Siempre a mano, no solo el primer día: en un equipo entra gente
                    nueva cada mes y la guía es lo que le enseña por dónde empezar. */}
                {recuadro('_guia', BookOpen, 'Guía', () => setShowGuide(true))}
              </div>
            </div>
            <div className="helm-user">
              <div className="helm-avatar">{email[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.split('@')[0]}</div>
                <small>{isClient ? 'Cliente' : 'Administrador'}</small>
              </div>
              <button type="button" className="helm-logout" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16} /></button>
            </div>
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
              {clientId && <Notificaciones key={clientId} clientId={clientId} onNavigate={go} />}
              {isClient ? (
                <span className="helm-badge">{marca.name}</span>
              ) : (
                <>
                  <button className="helm-btn" onClick={() => navigate('/admin')} title="Ver todos los perfiles">
                    <LayoutGrid size={16} /> Perfiles
                  </button>
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
              // Ruta vieja: quien la tenga en un marcador cae en Secciones, que
              // es donde vive ahora todo.
              <Secciones
                key={clientId} secciones={secciones}
                catalogo={NAV.filter(n => seccionDelProducto(n.key))}
                modulos={PLUGINS.filter(p => p.available && seccionDelProducto(p.key))}
                onToggle={toggleSeccion} guardando={guardandoSecciones}
              />
            ) : current.key === 'secciones' ? (
              <Secciones
                key={clientId} secciones={secciones}
                catalogo={NAV.filter(n => seccionDelProducto(n.key))}
                modulos={PLUGINS.filter(p => p.available && seccionDelProducto(p.key))}
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
      )}

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
