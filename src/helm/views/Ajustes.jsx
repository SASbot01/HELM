// HELM — Ajustes del perfil activo. De momento: integraciones (Stripe) y el
// estado del modelo de IA local que corre en este servidor.
import { useEffect, useState } from 'react'
import { Check, Copy, Link2, RefreshCw, Unlink, Cpu, AlertTriangle } from 'lucide-react'
import { stripeApi, chatApi } from '../lib'
import { Panel, Field, Input } from '../ui'

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

function StripeCard({ clientId }) {
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
      setMsg('Stripe enlazado.')
      await load()
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
      const r = await stripeApi.sync(clientId, 30)
      setMsg(`Últimos ${r.days} días: ${r.imported} ventas nuevas, ${r.duplicated} ya estaban, ${r.skipped} sin pagar.`)
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
                  <RefreshCw size={15} /> Importar 30 días
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

        {msg && <div className="helm-settings-ok">{msg}</div>}
        {error && <div className="helm-formerror">{error}</div>}
      </div>
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

export default function Ajustes({ clientId }) {
  return (
    <div className="helm-settings">
      <StripeCard clientId={clientId} />
      <IaCard />
    </div>
  )
}
