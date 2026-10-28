// HELM — Ajustes del perfil activo, organizado en pestañas: Integraciones
// (Stripe y futuras conexiones) e IA (modelo local o Claude, por perfil). Se
// irán añadiendo más pestañas.
import { useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Link2, RefreshCw, Unlink, Cpu, AlertTriangle, Palette, ShieldCheck,
  ShoppingCart, CalendarDays, Folder, FileText, ChevronRight, Search,
  Download, Sparkles, Image as ImageIcon, Trash2, Eye, Pencil, Send,
} from 'lucide-react'
import { stripeApi, wooApi, iaApi, MODELO_CLAUDE_DEFECTO, googleApi, instagramApi, calendlyApi, telegramApi, brandOf, saveBrand, uploadLogo, MAX_LOGO_MB, DEFAULT_SUBTITLE } from '../lib'
import { Panel, Field, Input, Select, Tabs, Empty } from '../ui'
import { normalizaHex } from '../theme'
import {
  AREAS, SECCIONES, DEFAULT_MATRIX, DEFAULT_VISIBLE, OWNER_ROLE, loadPermisos, savePermisos,
} from '../permisos'
import { rolesDelProducto } from '../equipo/roles'
import { agentsApi } from '../../agents/api'

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

// ── Calendly ────────────────────────────────────────────────────────────────
// Un enlace, no una pasarela: no hay claves ni webhooks que pegar, solo el
// Token de Acceso Personal que Calendly da en Integrations → API & Webhooks.
// Sirve igual en HELM (agendar la llamada de venta) que en consultoria
// (agendar la reunión con el cliente del despacho).
// Instagram: las métricas de lo que publica el perfil. De aquí leen los agentes
// (el alcance y las visitas de cada pieza) para saber dónde falla el embudo.
// Dos formas de conectar: con el botón, si el servidor tiene la app de Meta
// configurada, o pegando un token de larga duración generado en el panel de Meta.
function InstagramCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  // Vuelta del consentimiento de Meta: ?instagram=ok o ?instagram=error&msg=…
  const vuelta = () => new URLSearchParams(window.location.search)
  const [msg, setMsg] = useState(() => (vuelta().get('instagram') === 'ok' ? 'Instagram conectado.' : null))
  const [error, setError] = useState(() => (vuelta().get('instagram') === 'error' ? vuelta().get('msg') || 'No se pudo conectar Instagram.' : null))

  const load = () => instagramApi.status(clientId)
    .then(setStatus)
    .catch(err => { setError(err.message); setStatus({ linked: false, failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function hacer(fn, ok) {
    setBusy(true); setError(null); setMsg(null)
    try { const r = await fn(); if (ok) setMsg(ok(r)); await load() } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const conectar = () => hacer(async () => { window.location.href = (await instagramApi.authUrl(clientId)).url })
  const pegar = (e) => { e.preventDefault(); return hacer(async () => { await instagramApi.link(clientId, token.trim()); setToken('') }, () => 'Instagram conectado.') }
  const sincronizar = () => hacer(() => instagramApi.sync(clientId), r => `${r.sincronizadas} publicaciones sincronizadas.`)
  const desconectar = () => {
    if (!confirm('¿Desconectar Instagram de este perfil? Las métricas ya guardadas se quedan.')) return
    hacer(() => instagramApi.unlink(clientId), () => 'Instagram desconectado.')
  }

  if (!status) return <Panel title="Instagram"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="Instagram" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  return (
    <Panel title="Instagram" action={status.linked ? <Badge tone="green">Conectado</Badge> : <Badge>Sin conectar</Badge>}>
      <div className="helm-settings-body">
        {status.linked ? (
          <>
            <div className="helm-settings-row">
              <div>
                <b>@{status.username || 'cuenta'}</b>
                <small>
                  {[status.followers != null ? `${status.followers} seguidores` : '', status.mediaCount != null ? `${status.mediaCount} publicaciones` : '',
                    status.lastSyncAt ? `sincronizado el ${new Date(status.lastSyncAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'sin sincronizar todavía'].filter(Boolean).join(', ')}
                </small>
              </div>
              <div className="helm-settings-actions">
                <button className="helm-btn" onClick={sincronizar} disabled={busy}>
                  <RefreshCw size={15} /> {busy ? 'Un momento…' : 'Sincronizar métricas'}
                </button>
                <button className="helm-btn" onClick={desconectar} disabled={busy}>
                  <Unlink size={15} /> Desconectar
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Trae el alcance y las visitas de cada publicación del perfil. Hace falta una cuenta de Instagram
              profesional (empresa o creador); una personal no da métricas.
            </p>
            {status.oauth && (
              <div>
                <button className="helm-btn primary" onClick={conectar} disabled={busy}>Conectar con Instagram</button>
              </div>
            )}
            <form onSubmit={pegar}>
              <Field
                label={status.oauth ? 'O pega un token de larga duración' : 'Token de larga duración'}
                hint="Se genera en developers.facebook.com, en tu app, dentro de Instagram → Configuración de la API con inicio de sesión de Instagram → Generar token."
              >
                <Input value={token} onChange={e => setToken(e.target.value)} placeholder="IGAA…" autoComplete="off" />
              </Field>
              <button type="submit" className="helm-btn" disabled={busy || token.trim().length < 20}>Conectar con el token</button>
            </form>
          </>
        )}
        {msg && <div className="helm-settings-ok">{msg}</div>}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}

function CalendlyCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [eventos, setEventos] = useState(null)

  const load = () => calendlyApi.status(clientId)
    .then(st => {
      setStatus(st)
      if (st.linked) calendlyApi.eventos(clientId).then(r => setEventos(r.eventos || [])).catch(() => setEventos([]))
    })
    .catch(err => { setError(err.message); setStatus({ linked: false, failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function link(e) {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try {
      await calendlyApi.link(clientId, token.trim())
      setToken('')
      setMsg('Calendly enlazado.')
      await load()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function unlink() {
    if (!confirm('¿Desenlazar Calendly de este perfil?')) return
    setBusy(true); setError(null); setMsg(null)
    try { await calendlyApi.unlink(clientId); await load(); setMsg('Calendly desenlazado.') }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!status) return <Panel title="Calendly"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="Calendly" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  return (
    <Panel title="Calendly" action={status.linked ? <Badge tone="green">Enlazado</Badge> : <Badge>Sin enlazar</Badge>}>
      <div className="helm-settings-body">
        {status.linked ? (
          <>
            <div className="helm-settings-row">
              <div>
                <b>{status.name}</b>
                <small>{status.email}</small>
              </div>
              <div className="helm-settings-actions">
                <button className="helm-btn" onClick={unlink} disabled={busy}>
                  <Unlink size={15} /> Desenlazar
                </button>
              </div>
            </div>

            {status.schedulingUrl && (
              <div className="helm-settings-block">
                <label>Tu enlace para agendar</label>
                <p>Compártelo con un lead o un cliente para que reserve un hueco directamente en tu calendario.</p>
                <CopyRow value={status.schedulingUrl} />
              </div>
            )}

            <div className="helm-settings-block">
              <label>Próximas reuniones</label>
              {eventos === null ? (
                <p>Cargando…</p>
              ) : eventos.length === 0 ? (
                <p>Nada agendado por ahora.</p>
              ) : (
                <div className="helm-settings-list">
                  {eventos.map(e => (
                    <div key={e.uri} className="helm-settings-row">
                      <div>
                        <b>{e.name}</b>
                        <small>
                          {new Date(e.start).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                          {e.location ? ` · ${e.location}` : ''}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Enlaza tu cuenta de Calendly para agendar llamadas o reuniones sin salir de HELM.
              Es una alternativa a Google Calendar: usa la que ya tengas montada, o las dos.
            </p>
            <form className="helm-settings-form" onSubmit={link}>
              <Field label="Token de Acceso Personal de Calendly">
                <Input type="password" value={token} autoComplete="off" required
                  onChange={e => setToken(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiJ9…" />
              </Field>
              <button className="helm-btn primary" disabled={busy || !token.trim()}>
                <Link2 size={15} /> {busy ? 'Comprobando…' : 'Enlazar cuenta'}
              </button>
            </form>
            <small className="helm-settings-note">
              Sácalo de Calendly → Configuración → Integrations → API & Webhooks → Generate New Token.
              Se valida contra Calendly antes de guardarse y se queda en el servidor: el navegador no lo ve.
            </small>
          </>
        )}

        {msg && <div className="helm-settings-ok" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}

// ── Telegram ───────────────────────────────────────────────────────────────
// La IA del perfil, desde el móvil. El token del bot se valida y se queda en
// el servidor; aquí solo se ve @usuario y los cuatro últimos caracteres. El
// bot solo contesta a los chats que se autorizan con un código de /vincular.
function TelegramCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [restante, setRestante] = useState(null)

  const load = () => telegramApi.status(clientId)
    .then(setStatus)
    .catch(err => { setError(err.message); setStatus({ linked: false, failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuenta atrás del código vivo. Los segundos se calculan al vuelo en el
  // render y el intervalo solo fuerza el repintado: guardarlos en estado desde
  // dentro del efecto encadena un render por segundo sin ganar nada.
  const caduca = status?.vinculo?.caduca
  useEffect(() => {
    if (!caduca) return undefined
    const quedan = () => Math.max(0, Math.round((new Date(caduca).getTime() - Date.now()) / 1000))
    // El primer valor llega en un cuarto de segundo en vez de calcularlo aquí
    // mismo: leer el reloj durante el render, o escribir estado nada más entrar
    // en el efecto, es lo que encadena renders de más.
    const id = setInterval(() => setRestante(quedan()), 250)
    return () => clearInterval(id)
  }, [caduca])

  // Al agotarse el código se recarga el estado: si mientras tanto alguien
  // escribió /vincular en Telegram, el chat aparece ya en la lista.
  const agotado = restante === 0
  useEffect(() => { if (agotado) load() }, [agotado]) // eslint-disable-line react-hooks/exhaustive-deps

  async function link(e) {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try {
      await telegramApi.link(clientId, token.trim())
      setToken('')
      setMsg('Bot enlazado. Ahora genera un código y vincula tu chat.')
      await load()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function unlink() {
    if (!confirm('¿Desenlazar el bot de Telegram de este perfil? Los chats autorizados se olvidan.')) return
    setBusy(true); setError(null); setMsg(null)
    try { await telegramApi.unlink(clientId); await load(); setMsg('Telegram desenlazado.') }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function generarCodigo() {
    setBusy(true); setError(null); setMsg(null)
    try { await telegramApi.codigo(clientId); await load() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function quitarChat(chat) {
    if (!confirm(`¿Quitar a ${chat.nombre}? Ese chat dejará de hablar con la IA.`)) return
    setBusy(true); setError(null); setMsg(null)
    try { await telegramApi.quitarChat(clientId, chat.id); await load() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!status) return <Panel title="Telegram"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="Telegram" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  const chats = status.chats || []
  const mmss = restante == null ? '' : `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}`

  return (
    <Panel title="Telegram" action={status.linked ? <Badge tone="green">Enlazado</Badge> : <Badge>Sin enlazar</Badge>}>
      <div className="helm-settings-body">
        {status.linked ? (
          <>
            <div className="helm-settings-row">
              <div>
                <b><Send size={14} /> @{status.username}</b>
                <small>{status.botName} · token …{status.last4}</small>
              </div>
              <div className="helm-settings-actions">
                <button className="helm-btn" onClick={load} disabled={busy} title="Actualizar">
                  <RefreshCw size={15} />
                </button>
                <button className="helm-btn" onClick={unlink} disabled={busy}>
                  <Unlink size={15} /> Desenlazar
                </button>
              </div>
            </div>

            {status.webhook?.ultimoError && (
              <div className="helm-settings-warn">
                <AlertTriangle size={15} />
                Telegram no consigue entregar los mensajes: {status.webhook.ultimoError}
                {status.webhook.ultimoErrorFecha ? ` (${new Date(status.webhook.ultimoErrorFecha).toLocaleString('es-ES')})` : ''}.
                Comprueba que HELM_PUBLIC_URL apunta a este servidor y vuelve a enlazar.
              </div>
            )}

            <div className="helm-settings-block">
              <label>Chats autorizados</label>
              <p>Solo estos chats hablan con la IA de este perfil. Cualquier otro que escriba al bot no recibe respuesta.</p>
              {chats.length === 0 ? (
                <p>Todavía nadie. Genera un código aquí abajo y vincula tu chat.</p>
              ) : (
                <div className="helm-settings-list">
                  {chats.map(c => (
                    <div key={c.id} className="helm-settings-row">
                      <div>
                        <b>{c.nombre}</b>
                        <small>desde {new Date(c.desde).toLocaleDateString('es-ES', { dateStyle: 'medium' })} · chat {c.id}</small>
                      </div>
                      <div className="helm-settings-actions">
                        <button className="helm-btn" onClick={() => quitarChat(c)} disabled={busy}>
                          <Trash2 size={15} /> Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="helm-settings-block">
              <label>Vincular un chat</label>
              {status.vinculo ? (
                <>
                  <p>
                    Abre <b>@{status.username}</b> en Telegram y escríbele esto. El código caduca en <b>{mmss}</b>.
                  </p>
                  <CopyRow value={`/vincular ${status.vinculo.codigo}`} />
                </>
              ) : (
                <>
                  <p>Genera un código, escríbeselo al bot desde el chat que quieras autorizar y listo. Caduca a los 15 minutos.</p>
                  <button className="helm-btn primary" onClick={generarCodigo} disabled={busy}>
                    <Link2 size={15} /> {busy ? 'Generando…' : 'Generar código'}
                  </button>
                </>
              )}
            </div>

            <small className="helm-settings-note">
              Lo que hables por Telegram es la misma conversación que el chat de aquí: mismos comandos
              (/help los lista), misma memoria, mismo historial. /estado te dice qué modelo está contestando.
            </small>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Habla con la IA de este perfil desde Telegram: pídele guiones, emails o estrategia desde el
              móvil, con la misma memoria y la misma Biblia que aquí.
            </p>
            {!status.publicUrl && (
              <div className="helm-settings-warn">
                <AlertTriangle size={15} />
                El servidor no tiene definida HELM_PUBLIC_URL. Sin ella Telegram no sabe a dónde mandar los
                mensajes y no se puede enlazar el bot. Ponla en el entorno de la API y reinicia.
              </div>
            )}
            <form className="helm-settings-form" onSubmit={link}>
              <Field label="Token del bot">
                <Input type="password" value={token} autoComplete="off" required
                  onChange={e => setToken(e.target.value)} placeholder="123456789:AAH…" />
              </Field>
              <button className="helm-btn primary" disabled={busy || !token.trim() || !status.publicUrl}>
                <Link2 size={15} /> {busy ? 'Comprobando…' : 'Enlazar bot'}
              </button>
            </form>
            <small className="helm-settings-note">
              Crea el bot en Telegram hablando con @BotFather (/newbot), ponle nombre y copia el token que te da.
              Se valida contra Telegram antes de guardarse y se queda en el servidor: el navegador no lo ve.
            </small>
          </>
        )}

        {msg && <div className="helm-settings-ok">{msg}</div>}
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
              De tu <b>agenda</b>, el permiso es de solo lectura: HELM no crea, cambia ni borra
              nada en ella. De tu <b>Drive</b> solo lee lo que le enseñes: el resto le sigue
              siendo invisible. Puedes retirar el permiso cuando
              quieras, desde aquí o desde tu cuenta de Google.
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
    primary_color: client?.primary_color || '',
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

  // El acento que se aplicará. Null mientras el hex esté a medio escribir: así
  // la vista previa no parpadea con cada tecla.
  const acento = normalizaHex(form.primary_color)

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
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={elegirLogo} />
              <button type="button" className="helm-btn sm" disabled={subiendo} onClick={() => fileRef.current?.click()}>
                {subiendo ? 'Subiendo…' : form.logo_url ? 'Cambiar logo' : 'Subir logo'}
              </button>
              {form.logo_url && (
                <button type="button" className="helm-btn sm" onClick={() => set('logo_url', '')}>
                  <Trash2 size={13} /> Quitar
                </button>
              )}
              <small className="helm-settings-note">PNG, JPG o WebP (SVG no) · hasta {MAX_LOGO_MB} MB · cuadrado se ve mejor</small>
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

        {/* El color ya no repinta el panel (el tema es uno, ver theme.js): se
            usa donde representa al negocio hacia fuera. */}
        <Field
          label="Color de marca"
          hint="Se usa en la tarjeta que sale al compartir el enlace del perfil y en el icono de la pestaña. No cambia los colores del panel."
        >
          <div className="helm-color-row">
            <input
              type="color" className="helm-color-pick"
              value={acento || '#d9b66b'}
              onChange={e => set('primary_color', e.target.value)}
              aria-label="Elegir color de marca"
            />
            <Input
              value={form.primary_color}
              onChange={e => set('primary_color', e.target.value)}
              placeholder="#D9B66B" maxLength={7}
            />
            {form.primary_color && (
              <button type="button" className="helm-btn sm" onClick={() => set('primary_color', '')}>
                <Trash2 size={13} /> Quitar
              </button>
            )}
          </div>
        </Field>
        {form.primary_color && !acento && (
          <small className="helm-settings-note">
            Eso no es un color válido. Escríbelo en hex, como <code>#D9B66B</code>.
          </small>
        )}

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

// ── IA del perfil ──────────────────────────────────────────────────────────
// Cada perfil corre su IA por su cuenta: o el modelo local del servidor (gratis
// y sin que salga un dato) o Claude con SU clave y SU modelo. HELM y
// consultoría son perfiles distintos, así que uno puede estar en Claude Opus y
// el otro en el local sin que se toquen — ni la clave, ni el modelo, ni la
// factura.
//
// La clave se manda una vez y no vuelve: aquí solo se ven los 4 últimos.
function IaCard({ clientId }) {
  const [status, setStatus] = useState(null)
  const [health, setHealth] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(MODELO_CLAUDE_DEFECTO)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  const load = () => iaApi.status(clientId)
    .then(st => {
      setStatus(st)
      setModel(st.proveedor === 'claude' ? st.model : MODELO_CLAUDE_DEFECTO)
      setHealth(null)
      iaApi.test(clientId).then(setHealth).catch(err => setHealth({ ok: false, error: err.message }))
    })
    .catch(err => { setError(err.message); setStatus({ failed: true }) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enlazar(e) {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try {
      await iaApi.link(clientId, apiKey.trim(), model)
      setApiKey('')
      setMsg('Claude enlazado. A partir de ahora la IA de este perfil corre con tu clave.')
      await load()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function cambiarModelo(nuevo) {
    setModel(nuevo)
    if (status?.proveedor !== 'claude') return
    setBusy(true); setError(null); setMsg(null)
    try { await iaApi.modelo(clientId, nuevo); setMsg('Modelo cambiado.'); await load() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function desenlazar() {
    if (!confirm('¿Quitar la clave de Claude? Este perfil volverá al modelo local del servidor.')) return
    setBusy(true); setError(null); setMsg(null)
    try { await iaApi.unlink(clientId); setMsg('Clave borrada. Vuelves al modelo local.'); await load() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!status) return <Panel title="IA"><div className="helm-empty">Cargando…</div></Panel>
  if (status.failed) {
    return (
      <Panel title="IA" action={<Badge tone="red">Sin conexión</Badge>}>
        <div className="helm-settings-body"><div className="helm-formerror">{error}</div></div>
      </Panel>
    )
  }

  const enClaude = status.proveedor === 'claude'
  const modelos = status.modelos || []
  const etiqueta = modelos.find(m => m.id === status.model)?.label || status.model

  return (
    <Panel
      title="IA"
      action={
        health
          ? <Badge tone={health.ok ? 'green' : 'red'}>{health.ok ? 'Operativa' : 'No disponible'}</Badge>
          : <Badge>Comprobando…</Badge>
      }
    >
      <div className="helm-settings-body">
        <div className="helm-settings-row">
          <div>
            <b>{enClaude ? <Sparkles size={14} /> : <Cpu size={14} />} {enClaude ? etiqueta : status.model}</b>
            <small>
              {enClaude
                ? `Claude, con la clave de este perfil (…${status.last4 || '????'}) · se factura a tu cuenta de Anthropic`
                : `Modelo local en este servidor vía Ollama (${status.local?.url || '—'}) · contexto ${status.local?.ctx || '—'} tokens`}
            </small>
          </div>
          {enClaude && (
            <div className="helm-settings-actions">
              <button className="helm-btn" onClick={desenlazar} disabled={busy}>
                <Unlink size={15} /> Quitar clave
              </button>
            </div>
          )}
        </div>

        {enClaude ? (
          <>
            <div className="helm-settings-block">
              <Field label="Modelo">
                <Select value={model} onChange={e => cambiarModelo(e.target.value)} disabled={busy}>
                  {modelos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </Field>
              <p>{modelos.find(m => m.id === model)?.desc}</p>
            </div>
            <small className="helm-settings-note">
              El chat, las Biblias y la lectura de facturas de <b>este perfil</b> van contra Claude con esta
              clave. Los demás perfiles siguen con lo suyo. Si quitas la clave, todo vuelve al modelo local
              sin perder nada.
            </small>
          </>
        ) : (
          <>
            <p className="helm-settings-lead">
              Ahora mismo la IA de este perfil corre en el servidor: ni tokens, ni facturas, ni datos saliendo
              de aquí. Si quieres respuestas mejores, mete tu clave de Anthropic y este perfil pasará a
              Claude — pagando tú, y solo tú.
            </p>
            <form className="helm-settings-form" onSubmit={enlazar}>
              <Field label="API key de Anthropic">
                <Input type="password" value={apiKey} autoComplete="off" required
                  onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-…" />
              </Field>
              <Field label="Modelo">
                <Select value={model} onChange={e => setModel(e.target.value)}>
                  {modelos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </Field>
              <button className="helm-btn primary" disabled={busy || !apiKey.trim()}>
                <Link2 size={15} /> {busy ? 'Comprobando…' : 'Usar Claude en este perfil'}
              </button>
            </form>
            <small className="helm-settings-note">
              Sácala de console.anthropic.com → API keys. Se valida contra Anthropic antes de guardarse y se
              queda en el servidor: el navegador solo ve los cuatro últimos caracteres.
            </small>
          </>
        )}

        {health && !health.ok && <div className="helm-formerror">{health.error}</div>}
        {health?.models?.length > 1 && (
          <small className="helm-settings-note">Modelos descargados: {health.models.join(', ')}</small>
        )}
        {msg && <div className="helm-settings-ok">{msg}</div>}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}

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
  const roles = rolesDelProducto().filter(r => r.key !== OWNER_ROLE)

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

// ── Conector de Claude (MCP) ─────────────────────────────────────────────────
// El enlace con el que Claude (claude.ai, Claude Code…) se conecta a ESTE
// perfil: solo ve sus creadores, su historial y su calendario. Se enseña una
// sola vez (es una contraseña) y generar otro deja de valer el anterior. Solo
// el superadmin lo genera (api/agents.js lo exige).
function ConectorClaudeCard({ clientId, nombre }) {
  const [estado, setEstado] = useState(null)
  // El enlace recién generado va atado a su perfil: al cambiar de perfil no se
  // enseña el del anterior.
  const [nuevo, setNuevo] = useState({ clientId: null, url: '' })
  const url = nuevo.clientId === clientId ? nuevo.url : ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    agentsApi.mcpEnlace(clientId).then(setEstado).catch(err => { setError(err.message); setEstado({ failed: true }) })
  }, [clientId])

  async function generar() {
    if (estado?.existe && !window.confirm(`El enlace actual de ${nombre || 'este perfil'} dejará de funcionar. ¿Generar uno nuevo?`)) return
    setBusy(true); setError(null)
    try { setNuevo({ clientId, url: (await agentsApi.generarMcpEnlace(clientId)).url }); setEstado({ existe: true }) }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (!estado) return <Panel title="Conector de Claude"><div className="helm-empty">Cargando…</div></Panel>
  return (
    <Panel title="Conector de Claude" action={estado.existe ? <Badge tone="green">Con enlace</Badge> : <Badge>Sin enlace</Badge>}>
      <div className="helm-settings-body">
        <p className="helm-settings-lead">
          El enlace con el que Claude se conecta a {nombre || 'este perfil'}: con él solo ve sus creadores de referencia,
          su historial y su calendario, nada de otros perfiles.
        </p>
        {url ? (
          <div className="helm-settings-block">
            <CopyRow value={url} />
            <small className="helm-settings-note">
              Cópialo ahora: no se vuelve a enseñar. Es una contraseña: dáselo solo a {nombre || 'este cliente'}.
            </small>
          </div>
        ) : (
          <small className="helm-settings-note">
            {estado.existe
              ? `Ya tiene enlace${estado.ultimo_uso ? ` (usado por última vez el ${new Date(estado.ultimo_uso).toLocaleDateString('es-ES')})` : ' (aún sin usar)'}.`
              : 'Aún no tiene enlace.'}
          </small>
        )}
        {!estado.failed && (
          <div className="helm-settings-actions">
            <button className="helm-btn primary" onClick={generar} disabled={busy}>
              <Link2 size={15} /> {busy ? 'Generando…' : estado.existe ? 'Generar otro' : 'Generar enlace'}
            </button>
          </div>
        )}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
    </Panel>
  )
}

const AJUSTES_TABS = [
  { key: 'integraciones', label: 'Integraciones', icon: <Link2 size={15} /> },
  { key: 'marca', label: 'Marca', icon: <ImageIcon size={15} /> },
  { key: 'permisos', label: 'Permisos', icon: <ShieldCheck size={15} /> },
  { key: 'ia', label: 'IA', icon: <Cpu size={15} /> },
]

const esSuperadmin = () => { try { return Boolean(localStorage.getItem('bw_superadmin')) } catch { return false } }

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
          <InstagramCard clientId={clientId} />
          <CalendlyCard clientId={clientId} />
          <TelegramCard clientId={clientId} />
          <DriveCard clientId={clientId} />
          <StripeCard clientId={clientId} />
          <WooCard clientId={clientId} />
        </div>
      )
        : tab === 'marca' ? <MarcaCard clientId={clientId} client={client} onClientUpdate={onClientUpdate} />
        : tab === 'permisos' ? <PermisosCard clientId={clientId} />
        : (
          <div className="helm-grid" style={{ gap: 20 }}>
            <IaCard clientId={clientId} />
            {esSuperadmin() && <ConectorClaudeCard clientId={clientId} nombre={client?.name} />}
          </div>
        )}
    </div>
  )
}
