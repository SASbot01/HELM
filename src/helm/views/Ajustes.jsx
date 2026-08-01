// HELM — Ajustes del perfil activo, organizado en pestañas: Integraciones
// (Stripe y futuras conexiones) e IA local. Se irán añadiendo más pestañas.
import { useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Link2, RefreshCw, Unlink, Cpu, AlertTriangle, Palette, ShieldCheck,
  ShoppingCart, CalendarDays, Folder, FileText, ChevronRight, Search,
  Download, Sparkles, Image as ImageIcon, Trash2, Eye, Pencil,
} from 'lucide-react'
import { stripeApi, wooApi, chatApi, googleApi, brandOf, saveBrand, uploadLogo, MAX_LOGO_MB, DEFAULT_SUBTITLE } from '../lib'
import { Panel, Field, Input, Select, Tabs, Empty } from '../ui'
import { THEMES, useHelmTheme } from '../theme'
import {
  AREAS, SECCIONES, DEFAULT_MATRIX, DEFAULT_VISIBLE, OWNER_ROLE, loadPermisos, savePermisos,
} from '../permisos'
import { ROLES } from '../equipo/roles'

function Badge({ tone, children }) {
  return <span className={'helm-badge ' + (tone || '')}>{children}</span>
}

function CopyRow({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="helm-copyrow">
      <code>{value}</code>
      <button
        className="helm-btn"
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

export function StripeCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  const load = () => stripeApi.status(clientId)
    .then(setStatus)
    .catch(err => { setError(err.message); setStatus({ linked: false, failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function link(e) {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try {
      await stripeApi.link(clientId, apiKey.trim(), secret.trim() || undefined)
      setApiKey(''); setSecret('')
      setMsg('Stripe enlazado. Importando los últimos 60 días…')
      await load()
      // Nada más enlazar, se reconstruye el histórico reciente y la IA lo analiza.
      await sync()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function unlink() {
    if (!confirm('¿Desenlazar Stripe de este perfil? Las ventas ya importadas se quedan.')) return
    setBusy(true); setError(null); setMsg(null)
    try { await stripeApi.unlink(clientId); await load(); setMsg('Stripe desenlazado.') }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function sync() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await stripeApi.sync(clientId, 60)
      setMsg([
        `Últimos ${r.days} días:`,
        `· ${r.ventas.nuevas} ventas nuevas (${r.ventas.yaEstaban} ya estaban)`,
        `· ${r.finanzas.apuntes} apuntes de ingreso en Finanzas`,
        `· ${r.leads.nuevos} leads nuevos en el CRM (${r.leads.yaEstaban} ya existían)`,
        `· ${r.productos.nuevos} productos nuevos, ${r.productos.actualizados} actualizados`,
        r.analysis ? '· Análisis de la IA guardado en el Chat de este perfil' : null,
        ...(r.errores || []).map(e => `· ⚠ ${e}`),
      ].filter(Boolean).join('\n'))
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!status) return <Panel title="Stripe"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="Stripe" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Stripe"
      action={status.linked
        ? <Badge tone={status.livemode ? 'green' : 'amber'}>{status.livemode ? 'Modo live' : 'Modo test'}</Badge>
        : <Badge>Sin enlazar</Badge>}
    >
      <div className="helm-settings-body">
        {status.serverKeyOk === false && (
          <div className="helm-settings-warn">
            <AlertTriangle size={15} />
            El servidor no tiene la clave de servicio de Supabase
            ({status.serverKeyKind === 'missing' ? 'no hay ninguna' : `es de tipo "${status.serverKeyKind}"`}).
            Sin ella no se puede leer ni guardar la configuración de Stripe, y esta tarjeta
            aparecerá siempre como "sin enlazar" aunque no lo esté. Arréglalo en
            <code> .env.server</code> → <code>SUPABASE_SERVICE_KEY</code>.
          </div>
        )}
        {status.linked ? (
          <>
            <div className="helm-settings-row">
              <div>
                <b>{status.accountName}</b>
                <small>{status.accountId} · clave {status.key?.masked}</small>
              </div>
              <div className="helm-settings-actions">
                <button className="helm-btn" onClick={sync} disabled={busy}>
                  <RefreshCw size={15} /> {busy ? 'Importando…' : 'Importar y analizar 60 días'}
                </button>
                <button className="helm-btn" onClick={unlink} disabled={busy}>
                  <Unlink size={15} /> Desenlazar
                </button>
              </div>
            </div>

            <div className="helm-settings-block">
              <label>URL del webhook para esta cuenta</label>
              <p>
                Pégala en Stripe → Developers → Webhooks, con los eventos
                <code> checkout.session.completed</code> e <code>invoice.paid</code>.
                Cada perfil tiene la suya, así los pagos nunca caen en la cuenta equivocada.
              </p>
              <CopyRow value={status.webhookUrl} />
            </div>

            {!status.hasWebhookSecret && (
              <div className="helm-settings-warn">
                <AlertTriangle size={15} />
                Falta el secreto de firma. Sin él, HELM rechaza los eventos que envíe Stripe.
                Créalo en Stripe al dar de alta el webhook y guárdalo aquí abajo.
              </div>
            )}

            <form className="helm-settings-form" onSubmit={link}>
              <Field label="Actualizar clave secreta (opcional)">
                <Input type="password" value={apiKey} autoComplete="off"
                  onChange={e => setApiKey(e.target.value)} placeholder="sk_live_… o rk_live_…" />
              </Field>
              <Field label="Secreto de firma del webhook">
                <Input type="password" value={secret} autoComplete="off"
                  onChange={e => setSecret(e.target.value)} placeholder="whsec_…" />
              </Field>
              <button className="helm-btn primary" disabled={busy || (!apiKey.trim() && !secret.trim())}>
                Guardar
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Enlaza la cuenta de Stripe de <b>este perfil</b>. Cada pago entrará solo:
              se registra la venta, se crea o actualiza el contacto en el CRM con su
              fuente y se apunta la actividad en su timeline.
            </p>
            <form className="helm-settings-form" onSubmit={link}>
              <Field label="Clave secreta de Stripe">
                <Input type="password" value={apiKey} autoComplete="off" required
                  onChange={e => setApiKey(e.target.value)} placeholder="sk_live_… o rk_live_…" />
              </Field>
              <Field label="Secreto de firma del webhook (recomendado)">
                <Input type="password" value={secret} autoComplete="off"
                  onChange={e => setSecret(e.target.value)} placeholder="whsec_…" />
              </Field>
              <button className="helm-btn primary" disabled={busy || !apiKey.trim()}>
                <Link2 size={15} /> {busy ? 'Comprobando…' : 'Enlazar cuenta'}
              </button>
            </form>
            <small className="helm-settings-note">
              La clave se valida contra Stripe antes de guardarse y se queda en el servidor:
              el navegador solo ve los últimos 4 caracteres.
            </small>
          </>
        )}

        {msg && <div className="helm-settings-ok" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}


// WooCommerce. Misma estructura que StripeCard a propósito: son la misma tarea
// (enlazar una pasarela, pegar la URL del webhook, importar histórico) y que se
// parezcan hace que se entiendan sin releerlas.
function WooCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ storeUrl: '', consumerKey: '', consumerSecret: '', webhookSecret: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = () => wooApi.status(clientId)
    .then(setStatus)
    .catch(err => { setError(err.message); setStatus({ linked: false, failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function link(e) {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try {
      await wooApi.link(clientId, {
        storeUrl: form.storeUrl.trim(),
        consumerKey: form.consumerKey.trim(),
        consumerSecret: form.consumerSecret.trim(),
        webhookSecret: form.webhookSecret.trim() || undefined,
      })
      setForm({ storeUrl: '', consumerKey: '', consumerSecret: '', webhookSecret: '' })
      setMsg('Tienda enlazada. Importando los últimos 60 días…')
      await load()
      await sync()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function unlink() {
    if (!confirm('¿Desenlazar WooCommerce de este perfil? Las ventas ya importadas se quedan.')) return
    setBusy(true); setError(null); setMsg(null)
    try { await wooApi.unlink(clientId); await load(); setMsg('WooCommerce desenlazado.') }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function sync() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await wooApi.sync(clientId, 60)
      setMsg([
        `Últimos ${r.days} días · ${r.pedidos.revisados} pedidos revisados:`,
        `· ${r.pedidos.nuevos} ventas nuevas (${r.pedidos.yaEstaban} ya estaban)`,
        r.pedidos.descartados ? `· ${r.pedidos.descartados} descartados por no estar pagados` : null,
        r.facturado ? `· ${r.facturado.toFixed(2)} € importados` : null,
        ...(r.errores || []).map(e => `· ⚠ ${e}`),
      ].filter(Boolean).join('\n'))
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!status) return <Panel title="WooCommerce"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="WooCommerce" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  return (
    <Panel
      title="WooCommerce"
      action={status.linked ? <Badge tone="green">Enlazada</Badge> : <Badge>Sin enlazar</Badge>}
    >
      <div className="helm-settings-body">
        {status.linked ? (
          <>
            <div className="helm-settings-row">
              <div>
                <b><ShoppingCart size={14} /> {status.storeName}</b>
                <small>
                  {status.storeUrl}
                  {status.wooVersion ? ` · Woo ${status.wooVersion}` : ''}
                  {status.currency ? ` · ${status.currency}` : ''}
                  {status.key ? ` · clave ${status.key.masked}` : ''}
                </small>
              </div>
              <div className="helm-settings-actions">
                <button className="helm-btn" onClick={sync} disabled={busy}>
                  <RefreshCw size={15} /> {busy ? 'Importando…' : 'Importar 60 días'}
                </button>
                <button className="helm-btn" onClick={unlink} disabled={busy}>
                  <Unlink size={15} /> Desenlazar
                </button>
              </div>
            </div>

            <div className="helm-settings-block">
              <label>URL del webhook para esta tienda</label>
              <p>
                Pégala en WooCommerce → Ajustes → Avanzado → Webhooks. Crea <b>dos</b>:
                uno con el tema <code>Pedido creado</code> y otro con <code>Pedido actualizado</code>.
                Hacen falta los dos: un pedido nace sin pagar y solo al confirmarse
                el cobro llega el <i>actualizado</i>; con uno solo, las ventas por
                transferencia o Bizum no se registrarían nunca.
              </p>
              <CopyRow value={status.webhookUrl} />
            </div>

            {!status.hasWebhookSecret && (
              <div className="helm-settings-warn">
                <AlertTriangle size={15} />
                Falta el secreto de firma. Sin él, HELM rechaza todo lo que envíe la tienda.
                Es el campo «Secreto» del webhook en WooCommerce: cópialo aquí abajo tal cual.
              </div>
            )}

            <div className="helm-settings-warn">
              <AlertTriangle size={15} />
              WooCommerce <b>no reintenta</b> los webhooks que fallan, al contrario que Stripe.
              Si tu WordPress se cae o está detrás de un caché agresivo, esos pedidos se
              pierden: usa «Importar 60 días» de vez en cuando como red de seguridad.
            </div>

            <form className="helm-settings-form" onSubmit={link}>
              <Field label="Actualizar credenciales (opcional)">
                <Input value={form.storeUrl} onChange={e => set('storeUrl', e.target.value)}
                  placeholder={status.storeUrl} autoComplete="off" />
              </Field>
              <div className="helm-form-2">
                <Field label="Consumer key">
                  <Input type="password" value={form.consumerKey} autoComplete="off"
                    onChange={e => set('consumerKey', e.target.value)} placeholder="ck_…" />
                </Field>
                <Field label="Consumer secret">
                  <Input type="password" value={form.consumerSecret} autoComplete="off"
                    onChange={e => set('consumerSecret', e.target.value)} placeholder="cs_…" />
                </Field>
              </div>
              <Field label="Secreto de firma del webhook">
                <Input type="password" value={form.webhookSecret} autoComplete="off"
                  onChange={e => set('webhookSecret', e.target.value)} placeholder="El «Secreto» del webhook en Woo" />
              </Field>
              {/* Se puede guardar si se cambian LAS DOS claves a la vez (Woo no
                  acepta una sin la otra) o solo el secreto del webhook. */}
              <button
                className="helm-btn primary"
                disabled={busy || !(
                  (form.consumerKey.trim() && form.consumerSecret.trim()) || form.webhookSecret.trim()
                )}
              >
                Guardar
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Enlaza la tienda WooCommerce de <b>este perfil</b>. Cada pedido pagado entrará solo:
              se registra la venta, se crea o actualiza el contacto en el CRM con sus UTMs
              y se apunta la actividad en su timeline. Solo cuentan los pedidos en estado
              <b> completado</b> o <b>procesando</b>: un carrito pendiente no es una venta.
            </p>
            <p className="helm-settings-lead">
              Las claves se generan en WooCommerce → Ajustes → Avanzado → REST API,
              con permiso de <b>lectura</b>. No hace falta escritura: HELM nunca modifica tu tienda.
            </p>
            <form className="helm-settings-form" onSubmit={link}>
              <Field label="URL de la tienda">
                <Input value={form.storeUrl} onChange={e => set('storeUrl', e.target.value)}
                  placeholder="https://mitienda.com" autoComplete="off" required spellCheck={false} />
              </Field>
              <div className="helm-form-2">
                <Field label="Consumer key">
                  <Input type="password" value={form.consumerKey} autoComplete="off" required
                    onChange={e => set('consumerKey', e.target.value)} placeholder="ck_…" />
                </Field>
                <Field label="Consumer secret">
                  <Input type="password" value={form.consumerSecret} autoComplete="off" required
                    onChange={e => set('consumerSecret', e.target.value)} placeholder="cs_…" />
                </Field>
              </div>
              <Field label="Secreto de firma del webhook (recomendado)">
                <Input type="password" value={form.webhookSecret} autoComplete="off"
                  onChange={e => set('webhookSecret', e.target.value)} placeholder="whsec…" />
              </Field>
              <button className="helm-btn primary" disabled={busy || !form.storeUrl.trim() || !form.consumerKey.trim() || !form.consumerSecret.trim()}>
                <Link2 size={15} /> {busy ? 'Comprobando…' : 'Enlazar tienda'}
              </button>
            </form>
            <small className="helm-settings-note">
              Las claves se validan contra la tienda antes de guardarse y se quedan en el
              servidor: el navegador solo ve los últimos 4 caracteres. La tienda debe usar
              HTTPS — por HTTP las credenciales viajarían en claro.
            </small>
          </>
        )}

        {msg && <div className="helm-settings-ok" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}

// ── Google (Calendar + Drive) ──────────────────────────────────────────────
// A diferencia de Stripe y Woo, aquí no se pega ninguna clave: se va a Google,
// se acepta y se vuelve. Lo que queda guardado en el servidor es un permiso
// revocable, no una credencial que el usuario tenga que custodiar.

const FILTROS = [
  { key: 'videollamada', label: 'Con enlace de videollamada o invitados', desc: 'Lo normal: lo que tiene con quién hablar es una llamada.' },
  { key: 'invitados', label: 'Solo eventos con invitados', desc: 'Ignora las videollamadas contigo mismo.' },
  { key: 'palabra', label: 'Los que contengan una palabra', desc: 'Para agendas donde las llamadas se titulan igual.' },
  { key: 'todos', label: 'Todos los eventos', desc: 'Trae la agenda entera, sin filtrar.' },
]

function GoogleCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  const load = () => googleApi.status(clientId)
    .then(st => {
      setStatus(st)
      setForm({
        calendarId: st.calendarId || 'primary', filtro: st.filtro || 'videollamada',
        palabra: st.palabra || '', diasAtras: st.diasAtras, diasAdelante: st.diasAdelante,
      })
      return st
    })
    .catch(err => { setError(err.message); setStatus({ linked: false, failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Vuelta del consentimiento de Google: el callback redirige aquí con
  // ?google=ok|error. El resultado se lee al montar (no en un efecto: sería un
  // render en cascada) y la URL se limpia después, que si no se queda pegada y
  // el mensaje reaparece en cada recarga.
  const [vuelta] = useState(() => {
    const q = new URLSearchParams(window.location.search)
    const r = q.get('google')
    if (!r) return null
    return r === 'ok'
      ? { ok: 'Cuenta de Google conectada. Ya puedes sincronizar tus llamadas.' }
      : { error: q.get('msg') || 'No se pudo conectar con Google.' }
  })
  useEffect(() => {
    if (!vuelta) return
    const q = new URLSearchParams(window.location.search)
    q.delete('google'); q.delete('msg')
    const rest = q.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''))
  }, [vuelta])

  // La lista de calendarios solo se pide cuando hace falta: es una llamada a
  // Google, y en una cuenta con veinte agendas no es gratis.
  useEffect(() => {
    if (!status?.linked) return
    googleApi.calendars(clientId).then(r => setCalendars(r.calendars || [])).catch(() => {})
  }, [status?.linked, clientId])

  async function conectar() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const { url } = await googleApi.authUrl(clientId)
      window.location.href = url
    } catch (err) { setError(err.message); setBusy(false) }
  }

  async function desconectar() {
    if (!confirm('¿Desconectar Google de este perfil? Las llamadas ya importadas se quedan.')) return
    setBusy(true); setError(null); setMsg(null)
    try { await googleApi.unlink(clientId); await load(); setMsg('Google desconectado.') }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function guardar(e) {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try { await googleApi.config(clientId, form); await load(); setMsg('Preferencias guardadas.') }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function sincronizar() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await googleApi.syncCalls(clientId)
      setMsg([
        `${r.revisados} eventos revisados (${r.ventana.diasAtras} días atrás, ${r.ventana.diasAdelante} adelante):`,
        `· ${r.nuevas} llamadas nuevas, ${r.actualizadas} actualizadas`,
        r.canceladas ? `· ${r.canceladas} marcadas como canceladas` : null,
        r.descartados ? `· ${r.descartados} eventos descartados por no parecer llamadas` : null,
        ...(r.errores || []).map(x => `· ⚠ ${x}`),
      ].filter(Boolean).join('\n'))
      await load()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!status) return <Panel title="Google Calendar y Drive"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="Google Calendar y Drive" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Panel
      title="Google Calendar y Drive"
      action={status.linked ? <Badge tone="green">Conectado</Badge> : <Badge>Sin conectar</Badge>}
    >
      <div className="helm-settings-body">
        {!status.appConfigured && (
          <div className="helm-settings-warn">
            <AlertTriangle size={15} />
            <span>
              El servidor todavía no tiene la aplicación de Google configurada
              (<code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code>). Se crea una vez
              para todo HELM siguiendo <code>docs/google-app.md</code>; la URL de redirección que hay
              que registrar allí es la de abajo.
            </span>
          </div>
        )}
        {!status.appConfigured && <CopyRow value={status.redirectUri} />}

        {status.linked ? (
          <>
            <div className="helm-settings-row">
              <div>
                <b>{status.picture
                  ? <img src={status.picture} alt="" className="helm-goog-pic" />
                  : <CalendarDays size={14} />} {status.email}</b>
                <small>
                  {status.name ? status.name + ' · ' : ''}
                  {status.lastSyncAt
                    ? `última sincronización ${new Date(status.lastSyncAt).toLocaleString('es-ES')}`
                    : 'sin sincronizar todavía'}
                </small>
              </div>
              <div className="helm-settings-actions">
                <button className="helm-btn" onClick={sincronizar} disabled={busy}>
                  <RefreshCw size={15} /> {busy ? 'Trabajando…' : 'Sincronizar llamadas'}
                </button>
                <button className="helm-btn" onClick={desconectar} disabled={busy}>
                  <Unlink size={15} /> Desconectar
                </button>
              </div>
            </div>

            <form className="helm-settings-form" onSubmit={guardar} style={{ maxWidth: 560 }}>
              <Field label="Calendario que se mira">
                <Select value={form.calendarId} onChange={e => set('calendarId', e.target.value)}>
                  {calendars.length === 0 && <option value={form.calendarId}>Principal</option>}
                  {calendars.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.primary ? ' (principal)' : ''}</option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Qué cuenta como llamada"
                hint={FILTROS.find(f => f.key === form.filtro)?.desc}
              >
                <Select value={form.filtro} onChange={e => set('filtro', e.target.value)}>
                  {FILTROS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
              </Field>

              {form.filtro === 'palabra' && (
                <Field label="Palabras (separadas por comas)" hint="Se busca en el título y en la descripción del evento.">
                  <Input value={form.palabra} onChange={e => set('palabra', e.target.value)}
                    placeholder="llamada, sesión, discovery, cierre" />
                </Field>
              )}

              <div className="helm-form-2">
                <Field label="Días hacia atrás">
                  <Input type="number" min="1" max="365" value={form.diasAtras}
                    onChange={e => set('diasAtras', e.target.value)} />
                </Field>
                <Field label="Días hacia adelante">
                  <Input type="number" min="1" max="365" value={form.diasAdelante}
                    onChange={e => set('diasAdelante', e.target.value)} />
                </Field>
              </div>

              <button className="helm-btn primary" disabled={busy}>Guardar preferencias</button>
            </form>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Conecta la cuenta de Google de <b>este perfil</b>. Con ella HELM hace dos cosas:
              las reuniones de tu <b>Calendar</b> aparecen solas en la sección <b>Llamadas</b>, con
              su enlace, sus invitados y el contacto del CRM al que pertenecen; y desde <b>Drive</b>
              {' '}puedes traer documentos a la Biblioteca para que la IA del chat los conozca.
            </p>
            <p className="helm-settings-lead">
              El permiso es de <b>solo lectura</b>: HELM no crea, cambia ni borra nada en tu agenda
              ni en tu Drive. Puedes retirarlo cuando quieras, desde aquí o desde tu cuenta de Google.
            </p>
            <button className="helm-btn primary" onClick={conectar} disabled={busy || !status.appConfigured}>
              <Link2 size={15} /> {busy ? 'Abriendo Google…' : 'Conectar con Google'}
            </button>
          </>
        )}

        {(msg || vuelta?.ok) && (
          <div className="helm-settings-ok" style={{ whiteSpace: 'pre-line' }}>{msg || vuelta.ok}</div>
        )}
        {(error || vuelta?.error) && <div className="helm-formerror">{error || vuelta.error}</div>}
      </div>
    </Panel>
  )
}

// Explorador de Drive. No es un gestor de archivos: es la puerta para meter
// documentos del negocio en la Biblioteca, que es lo que lee la IA del chat.
function DriveCard({ clientId }) {
  const [linked, setLinked] = useState(null)
  const [ruta, setRuta] = useState([])          // migas: [{id, name}]
  const [pagina, setPagina] = useState(null)    // { clave, files, error }
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [importando, setImportando] = useState(null)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    googleApi.status(clientId).then(st => setLinked(Boolean(st.linked))).catch(() => setLinked(false))
  }, [clientId])

  const carpeta = ruta.length ? ruta[ruta.length - 1].id : null
  // Lo que se está mirando ahora mismo: una búsqueda o una carpeta. El
  // resultado se guarda junto a su clave, así "cargando" es simplemente que lo
  // que hay en memoria todavía no es de esta clave — sin vaciar la lista a mano
  // en cada cambio.
  const clave = busca ? `q:${busca}` : `f:${carpeta || 'root'}`

  useEffect(() => {
    if (!linked) return
    googleApi.drive(clientId, { q: busca || undefined, folderId: busca ? undefined : carpeta })
      .then(r => setPagina({ clave, files: r.files || [] }))
      .catch(err => setPagina({ clave, files: [], error: err.message }))
  }, [linked, clientId, carpeta, busca, clave])

  const files = pagina?.clave === clave ? pagina.files : null
  const errorDrive = pagina?.clave === clave ? pagina.error : null

  async function importar(f) {
    setImportando(f.id); setError(null); setMsg(null)
    try {
      const r = await googleApi.driveImport(clientId, f.id)
      setMsg(`"${f.name}" está en la Biblioteca (${r.chars.toLocaleString('es-ES')} caracteres). La IA del chat ya lo tiene en contexto.`)
    } catch (err) { setError(err.message) }
    setImportando(null)
  }

  if (linked === null) return <Panel title="Drive"><div className="helm-empty">Cargando…</div></Panel>
  if (!linked) return null

  return (
    <Panel title="Drive" action={<Badge tone="green">Conectado</Badge>}>
      <div className="helm-settings-body">
        <p className="helm-settings-lead">
          Trae documentos de tu Drive a la <b>Biblioteca</b>. Se importa el <b>texto</b>:
          Documentos, Hojas de cálculo, Presentaciones y archivos de texto plano. Un PDF o un
          .docx no se puede leer desde aquí — conviértelo a Documento de Google primero.
        </p>

        <form
          className="helm-drive-search"
          onSubmit={e => { e.preventDefault(); setBusca(q.trim()); setRuta([]) }}
        >
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en todo el Drive…" />
          <button className="helm-btn" type="submit"><Search size={15} /> Buscar</button>
          {busca && (
            <button className="helm-btn" type="button" onClick={() => { setQ(''); setBusca('') }}>Ver mi unidad</button>
          )}
        </form>

        {!busca && (
          <div className="helm-drive-crumbs">
            <button className="helm-linkbtn" onClick={() => setRuta([])}>Mi unidad</button>
            {ruta.map((c, i) => (
              <span key={c.id}>
                <ChevronRight size={13} />
                <button className="helm-linkbtn" onClick={() => setRuta(r => r.slice(0, i + 1))}>{c.name}</button>
              </span>
            ))}
          </div>
        )}

        {files === null ? <Empty>Cargando Drive…</Empty>
          : files.length === 0 ? <Empty>{busca ? 'Ningún archivo con ese nombre.' : 'Esta carpeta está vacía.'}</Empty>
            : (
              <div className="helm-drive-list">
                {files.map(f => (
                  <div key={f.id} className="helm-drive-row">
                    {f.isFolder ? <Folder size={15} /> : <FileText size={15} />}
                    {f.isFolder ? (
                      <button className="helm-linkbtn grow" onClick={() => { setBusca(''); setQ(''); setRuta(r => [...r, { id: f.id, name: f.name }]) }}>
                        {f.name}
                      </button>
                    ) : (
                      <a className="grow" href={f.link || '#'} target="_blank" rel="noreferrer">{f.name}</a>
                    )}
                    {!f.isFolder && (
                      f.readable ? (
                        <button className="helm-btn sm" disabled={importando === f.id} onClick={() => importar(f)}>
                          <Download size={13} /> {importando === f.id ? 'Importando…' : 'A la Biblioteca'}
                        </button>
                      ) : <small className="helm-settings-note">no legible</small>
                    )}
                  </div>
                ))}
              </div>
            )}

        {msg && <div className="helm-settings-ok"><Sparkles size={14} /> {msg}</div>}
        {(error || errorDrive) && <div className="helm-formerror">{error || errorDrive}</div>}
      </div>
    </Panel>
  )
}

// ── Marca blanca ───────────────────────────────────────────────────────────
// Lo que hace que el panel deje de parecer HELM y pase a parecer el software
// del negocio: su logo, su nombre y su subtítulo en la barra lateral.
function MarcaCard({ clientId, client, onClientUpdate }) {
  const inicial = brandOf(client)
  const [form, setForm] = useState({
    brand_name: client?.brand_name || '',
    brand_subtitle: client?.brand_subtitle ?? '',
    logo_url: client?.logo_url || '',
  })
  const [busy, setBusy] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const set = (k, v) => { setSaved(false); setForm(f => ({ ...f, [k]: v })) }

  const previo = {
    name: form.brand_name.trim() || client?.name || 'HELM',
    subtitle: form.brand_subtitle.trim() || DEFAULT_SUBTITLE,
    logo: form.logo_url,
  }

  async function elegirLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSubiendo(true); setError(null)
    try { set('logo_url', await uploadLogo(file, clientId)) }
    catch (err) { setError(err.message) }
    setSubiendo(false)
  }

  async function guardar(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const fila = await saveBrand(clientId, form)
      onClientUpdate?.(fila)
      setSaved(true)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <Panel title="Tu marca">
      <form className="helm-settings-body" onSubmit={guardar}>
        <p className="helm-settings-lead">
          Pon tu logo y tu nombre y el panel pasa a ser tuyo: es lo que verá tu equipo y
          tus clientes cuando entren. Afecta a <b>este perfil</b>, no a los demás.
        </p>

        <div className="helm-marca">
          <div className="helm-marca-logo">
            {form.logo_url
              ? <img src={form.logo_url} alt="Logo" />
              : <div className="helm-marca-ph"><ImageIcon size={20} /></div>}
            <div className="helm-marca-logo-acts">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={elegirLogo} />
              <button type="button" className="helm-btn sm" disabled={subiendo} onClick={() => fileRef.current?.click()}>
                {subiendo ? 'Subiendo…' : form.logo_url ? 'Cambiar logo' : 'Subir logo'}
              </button>
              {form.logo_url && (
                <button type="button" className="helm-btn sm" onClick={() => set('logo_url', '')}>
                  <Trash2 size={13} /> Quitar
                </button>
              )}
              <small className="helm-settings-note">PNG, JPG o SVG · hasta {MAX_LOGO_MB} MB · cuadrado se ve mejor</small>
            </div>
          </div>

          {/* La misma pieza que la barra lateral, para ver el resultado antes
              de guardar y no a base de recargar. */}
          <div className="helm-marca-preview">
            <span className="helm-marca-preview-lbl">Así se verá</span>
            <div className="helm-brand" style={{ padding: 0 }}>
              {previo.logo
                ? <img src={previo.logo} alt="" />
                : <div className="helm-marca-ph sm"><ImageIcon size={14} /></div>}
              <div><b>{previo.name}</b><span>{previo.subtitle}</span></div>
            </div>
          </div>
        </div>

        <Field label="Nombre de la marca" hint={`Si lo dejas vacío se usa el nombre del perfil (${client?.name || '—'}).`}>
          <Input value={form.brand_name} onChange={e => set('brand_name', e.target.value)}
            placeholder={client?.name || 'Acme Growth'} maxLength={40} />
        </Field>
        <Field label="Subtítulo" hint={`La línea pequeña de debajo. Vacío = "${DEFAULT_SUBTITLE}".`}>
          <Input value={form.brand_subtitle} onChange={e => set('brand_subtitle', e.target.value)}
            placeholder={DEFAULT_SUBTITLE} maxLength={40} />
        </Field>

        {error && <div className="helm-formerror">{error}</div>}
        <button className="helm-btn primary" disabled={busy || subiendo} style={{ justifySelf: 'start' }}>
          {busy ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar marca'}
        </button>
        {inicial.name !== previo.name && !saved && (
          <small className="helm-settings-note">Los cambios se aplican en cuanto guardas.</small>
        )}
      </form>
    </Panel>
  )
}

function IaCard() {
  const [health, setHealth] = useState(null)
  useEffect(() => { chatApi.health().then(setHealth).catch(err => setHealth({ ok: false, error: err.message })) }, [])

  return (
    <Panel
      title="IA local"
      action={health ? <Badge tone={health.ok ? 'green' : 'red'}>{health.ok ? 'Operativa' : 'No disponible'}</Badge> : null}
    >
      <div className="helm-settings-body">
        <div className="helm-settings-row">
          <div>
            <b><Cpu size={14} /> {health?.model || '…'}</b>
            <small>
              Corre en este servidor vía Ollama ({health?.url || '—'}) · contexto {health?.ctx || '—'} tokens
            </small>
          </div>
        </div>
        <p className="helm-settings-lead">
          El chat no usa ninguna IA externa: ni tokens, ni facturas, ni datos saliendo de aquí.
        </p>
        {health && !health.ok && <div className="helm-formerror">{health.error}</div>}
        {health?.models?.length > 1 && (
          <small className="helm-settings-note">
            Modelos descargados: {health.models.join(', ')}
          </small>
        )}
      </div>
    </Panel>
  )
}

// Apariencia: el tema es del navegador, no del perfil, así que esta tarjeta no
// necesita clientId ni escribe en Supabase.
function AparienciaCard() {
  const [theme, setTheme] = useHelmTheme()

  return (
    <Panel title="Tema">
      <div className="helm-settings-body">
        <p className="helm-settings-lead">
          Cómo se ve HELM en <b>este dispositivo</b>. No afecta a lo que ven los demás.
        </p>
        <div className="helm-theme-grid">
          {THEMES.map(t => (
            <button
              key={t.key}
              type="button"
              className={'helm-theme-opt' + (theme === t.key ? ' on' : '')}
              onClick={() => setTheme(t.key)}
              aria-pressed={theme === t.key}
            >
              {/* Miniatura del tema: se pinta con las variables del propio tema,
                  así la muestra siempre coincide con lo que vas a ver. */}
              <span className="helm-swatch" data-theme={t.key}>
                <span className="s-side" />
                <span className="s-main">
                  <span className="s-bar" />
                  <span className="s-card" />
                </span>
              </span>
              <span className="helm-theme-meta">
                <b>{t.label}{theme === t.key && <Check size={14} />}</b>
                <small>{t.desc}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  )
}

// Permisos: dos matrices por rol. Ver ../permisos.js.
//   Visibilidad → qué secciones le aparecen en el menú. Es la que importa
//                 ahora que closers y setters entran con su propia cuenta.
//   Edición     → de lo que ve, qué puede modificar.
//
// Se muestran de una en una: son 19 secciones por 5 roles, y las dos tablas a
// la vez convierten la pantalla en una hoja de cálculo ilegible.
function PermisosCard({ clientId }) {
  const [vista, setVista] = useState('visible')
  const [visible, setVisible] = useState(null)
  const [matrix, setMatrix] = useState(null)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadPermisos(clientId).then(({ matrix: m, visible: v, missing: mi }) => {
      setMatrix(m); setVisible(v); setMissing(mi)
    })
  }, [clientId])

  // Los roles configurables son todos menos el dueño, que siempre puede todo.
  const roles = ROLES.filter(r => r.key !== OWNER_ROLE)

  const esVisibilidad = vista === 'visible'
  const filas = esVisibilidad ? SECCIONES : AREAS
  const datos = esVisibilidad ? visible : matrix
  const porDefecto = esVisibilidad ? DEFAULT_VISIBLE : DEFAULT_MATRIX
  const setDatos = esVisibilidad ? setVisible : setMatrix

  const toggle = (rol, clave) => {
    setSaved(false)
    setDatos(d => {
      const lista = d[rol] ?? porDefecto[rol] ?? []
      return { ...d, [rol]: lista.includes(clave) ? lista.filter(x => x !== clave) : [...lista, clave] }
    })
  }

  // Marcar o desmarcar un rol entero: con 19 filas, hacerlo a mano es un
  // castigo, y el caso real ("este rol solo ve CRM y Diario") empieza vaciando.
  const todoRol = (rol, on) => {
    setSaved(false)
    setDatos(d => ({ ...d, [rol]: on ? filas.map(f => f.key) : [] }))
  }

  async function guardar() {
    setSaving(true); setError(null)
    try { await savePermisos(clientId, matrix, visible); setSaved(true) }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!datos) return <Panel title="Permisos"><div className="helm-empty">Cargando…</div></Panel>

  return (
    <Panel
      title="Permisos por rol"
      action={
        <button className="helm-btn primary" onClick={guardar} disabled={saving || missing}>
          {saving ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar permisos'}
        </button>
      }
    >
      <div className="helm-settings-body">
        <div className="helm-segmented">
          <button type="button" className={esVisibilidad ? 'on' : ''} onClick={() => setVista('visible')}>
            <Eye size={14} /> Qué ve cada rol
          </button>
          <button type="button" className={!esVisibilidad ? 'on' : ''} onClick={() => setVista('editar')}>
            <Pencil size={14} /> Qué puede editar
          </button>
        </div>

        <p className="helm-settings-lead">
          {esVisibilidad ? (
            <>
              Las secciones marcadas son las que le <b>aparecen en el menú</b> a quien entra con
              ese rol. Lo que no está marcado no existe para esa persona: tampoco escribiendo
              la URL a mano. Un <b>closer</b> con solo CRM y Diario verá dos entradas y nada más.
            </>
          ) : (
            <>
              De lo que sí ve, aquí se marca <b>qué puede modificar</b>. Sin permiso lo tiene
              en modo lectura: ve los datos pero no puede guardar cambios.
            </>
          )}
          {' '}El <b>dueño</b> y quien tenga nivel de acceso <b>propietario o administrador</b> siempre
          pueden todo, y por eso no aparecen aquí.
        </p>

        {missing && (
          <div className="helm-settings-warn">
            <AlertTriangle size={15} />
            Faltan migraciones (<code>helm_operativa.sql</code> y <code>helm_permisos_ver.sql</code>):
            hasta aplicarlas se usan los permisos por defecto y los cambios no se pueden guardar.
          </div>
        )}

        <div className="helm-tablewrap">
          <table className="helm-table helm-perm">
            <thead>
              <tr>
                <th>{esVisibilidad ? 'Ve la sección…' : 'Puede editar…'}</th>
                {roles.map(r => (
                  <th key={r.key} style={{ textAlign: 'center' }}>
                    {r.label}
                    <small style={{ display: 'block', fontWeight: 400 }}>
                      <button type="button" className="helm-linkbtn" onClick={() => todoRol(r.key, true)}>todo</button>
                      {' · '}
                      <button type="button" className="helm-linkbtn" onClick={() => todoRol(r.key, false)}>nada</button>
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(a => (
                <tr key={a.key}>
                  <td>
                    {a.label}
                    <small style={{ display: 'block', color: 'var(--text-mut)' }}>{a.desc}</small>
                  </td>
                  {roles.map(r => {
                    const on = (datos[r.key] ?? porDefecto[r.key] ?? []).includes(a.key)
                    return (
                      <td key={r.key} style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={'helm-check' + (on ? ' on' : '')}
                          style={{ margin: '0 auto' }}
                          aria-label={`${r.label}: ${a.label}`}
                          aria-pressed={on}
                          onClick={() => toggle(r.key, a.key)}
                        >
                          {on && <Check size={12} />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}

const AJUSTES_TABS = [
  { key: 'integraciones', label: 'Integraciones', icon: <Link2 size={15} /> },
  { key: 'marca', label: 'Marca', icon: <ImageIcon size={15} /> },
  { key: 'permisos', label: 'Permisos', icon: <ShieldCheck size={15} /> },
  { key: 'apariencia', label: 'Apariencia', icon: <Palette size={15} /> },
  { key: 'ia', label: 'IA local', icon: <Cpu size={15} /> },
]

export default function Ajustes({ clientId, client, onClientUpdate }) {
  // Volver del consentimiento de Google aterriza en Ajustes → Integraciones,
  // que es donde está la tarjeta que cuenta cómo ha ido.
  const [tab, setTab] = useState('integraciones')
  return (
    <div className="helm-settings">
      <Tabs tabs={AJUSTES_TABS} value={tab} onChange={setTab} />
      {tab === 'integraciones' ? (
        <div className="helm-grid" style={{ gap: 20 }}>
          <GoogleCard clientId={clientId} />
          <DriveCard clientId={clientId} />
          <StripeCard clientId={clientId} />
          <WooCard clientId={clientId} />
        </div>
      )
        : tab === 'marca' ? <MarcaCard clientId={clientId} client={client} onClientUpdate={onClientUpdate} />
        : tab === 'permisos' ? <PermisosCard clientId={clientId} />
        : tab === 'apariencia' ? <AparienciaCard />
        : <IaCard />}
    </div>
  )
}
