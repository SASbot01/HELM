// HELM — Equipo y perfiles: las personas del negocio.
//
// Información estructural que hasta ahora no vivía en ningún sitio: quién es
// cada uno, cómo se le paga y qué contrato tiene firmado. Su `role` es lo que
// conecta con el resto del sistema — el Diario pide unas métricas u otras según
// el rol, Finanzas filtra las comisiones por persona, Ventas asigna setter,
// closer y CSM, y Actividad puede escribir "el closer Juan añadió una nota".
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Mail, Phone, FileText, Wallet, KeyRound, ShieldCheck } from 'lucide-react'
import {
  fetchRowsOrError, insertRow, updateRow, deleteRow, money, fmtDate, MISSING_TABLE,
  equipoApi, NIVELES_ACCESO,
} from '../lib'
import { Panel, Empty, Modal, Field, Input, Textarea, Select, Kpi, MoneyInput, FormNote } from '../ui'
import { ROLES, roleLabel } from '../equipo/roles'
import MigracionPendiente from '../MigracionPendiente'

const PAY_METHODS = ['Transferencia', 'Bizum', 'PayPal', 'Wise', 'Revolut', 'Stripe', 'Cripto']

const EMPTY = {
  name: '', role: 'closer', email: '', phone: '', whatsapp: '', country: '',
  pay_method: '', pay_account: '', pay_terms: '', commission_pct: '', fixed_fee: '',
  contract_url: '', contract_note: '', started_on: '', notes: '', active: true,
  // Acceso al panel. No se guarda en helm_team: viaja aparte a /api/equipo,
  // que es quien hashea la contraseña.
  conAcceso: false, accessEmail: '', accessPassword: '', accessLevel: 'miembro',
}

const toForm = (r) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, r[k] ?? EMPTY[k]])),
  id: r.id,
  conAcceso: Boolean(r.login_id),
  accessEmail: r.email || '',
  accessPassword: '',            // nunca se precarga: no la tenemos ni debemos
  accessLevel: r.accessLevel || 'miembro',
  commission_pct: r.commission_pct ? String(r.commission_pct) : '',
  fixed_fee: r.fixed_fee ? String(r.fixed_fee) : '',
  started_on: r.started_on || '',
})

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export default function Equipo({ clientId }) {
  const [rows, setRows] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState(null)
  const [rolFiltro, setRolFiltro] = useState('__all__')

  const load = () => fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true })
    .then(({ rows: r, error: e }) => { setRows(r); setFatal(e) })
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(
    () => (rows || []).filter(p => rolFiltro === '__all__' || p.role === rolFiltro),
    [rows, rolFiltro],
  )

  const stats = useMemo(() => {
    const activos = (rows || []).filter(p => p.active !== false)
    return {
      total: activos.length,
      conAcceso: activos.filter(p => p.login_id).length,
      fijos: activos.reduce((a, p) => a + (Number(p.fixed_fee) || 0), 0),
      porRol: ROLES.map(r => ({ ...r, n: activos.filter(p => p.role === r.key).length })).filter(r => r.n > 0),
    }
  }, [rows])

  async function save(form) {
    const row = {
      client_id: clientId,
      name: form.name.trim(), role: form.role,
      email: form.email.trim().toLowerCase(), phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(), country: form.country.trim(),
      pay_method: form.pay_method.trim(), pay_account: form.pay_account.trim(),
      pay_terms: form.pay_terms.trim(),
      commission_pct: Number(form.commission_pct) || 0,
      fixed_fee: Number(form.fixed_fee) || 0,
      contract_url: form.contract_url.trim(), contract_note: form.contract_note.trim(),
      started_on: form.started_on || null,
      notes: form.notes.trim(), active: form.active,
      updated_at: new Date().toISOString(),
    }
    let persona
    if (form.id) {
      persona = await updateRow('helm_team', form.id, row)
    } else {
      persona = await insertRow('helm_team', row)
    }

    // El acceso se gestiona DESPUÉS y por separado: la persona ya está
    // guardada, así que si crear la credencial falla no se pierde el alta —
    // solo se avisa de que falta el acceso.
    if (form.conAcceso) {
      await equipoApi.grant(clientId, persona.id, {
        email: form.accessEmail.trim(),
        password: form.accessPassword || undefined,
        level: form.accessLevel,
      })
      persona = { ...persona, login_id: 'pendiente', accessLevel: form.accessLevel }
    } else if (form.id && form.conAcceso === false && rows.find(r => r.id === form.id)?.login_id) {
      await equipoApi.revoke(clientId, persona.id)
      persona = { ...persona, login_id: null }
    }

    setRows(rs => form.id
      ? rs.map(r => r.id === persona.id ? persona : r)
      : [...(rs || []), persona])
    setEdit(null)
  }

  async function remove(p) {
    if (!window.confirm(`¿Eliminar a ${p.name} del equipo? Los movimientos de Finanzas ya registrados a su nombre se conservan.`)) return
    setError(null)
    try {
      await deleteRow('helm_team', p.id)
      setRows(rs => rs.filter(r => r.id !== p.id))
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Equipo y perfiles" />
  if (fatal) return <FormNote>{fatal}</FormNote>

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Personas activas" value={stats.total} />
        <Kpi label="Con acceso al panel" value={stats.conAcceso} sub="pueden entrar" />
        <Kpi label="Coste fijo mensual" value={money(stats.fijos)} accent sub="sin comisiones" />
        {stats.porRol.slice(0, 3).map(r => <Kpi key={r.key} label={r.label + 's'} value={r.n} />)}
      </div>

      {error && <FormNote>{error}</FormNote>}

      <Panel
        title="Equipo"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="helm-select" value={rolFiltro} onChange={e => setRolFiltro(e.target.value)}>
              <option value="__all__">Todos los roles</option>
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <button className="helm-btn primary" onClick={() => setEdit(EMPTY)}><Plus size={15} />Nueva persona</button>
          </div>
        }
      >
        {rows == null ? <Empty>Cargando…</Empty> : visibles.length === 0 ? (
          <Empty>
            {rows.length === 0
              ? 'Aún no hay nadie. Da de alta a tu equipo para poder asignar ventas, comisiones y tareas.'
              : 'Nadie con ese rol.'}
          </Empty>
        ) : (
          <div className="helm-svc-grid">
            {visibles.map(p => (
              <div key={p.id} className={'helm-svc' + (p.active === false ? ' off' : '')}>
                <div className="helm-svc-head">
                  <div className="helm-avatar lg">{(p.name || '?')[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.name}</b>
                    <small>{roleLabel(p.role)}{p.country ? ` · ${p.country}` : ''}</small>
                  </div>
                  {p.login_id && (
                    <span className="helm-chip cyan" title="Puede entrar al panel"><KeyRound size={11} />Acceso</span>
                  )}
                  {p.active === false && <span className="helm-chip">Inactivo</span>}
                </div>

                <div className="helm-svc-links">
                  {p.email && <a className="helm-btn sm" href={`mailto:${p.email}`}><Mail size={13} />{p.email}</a>}
                  {p.phone && <a className="helm-btn sm" href={`tel:${p.phone}`}><Phone size={13} />{p.phone}</a>}
                </div>

                <div className="helm-kv">
                  <div><Wallet size={13} /> Cómo se le paga</div>
                  <div>
                    {[p.pay_method, p.pay_terms].filter(Boolean).join(' · ') || 'Sin definir'}
                    {p.pay_account && <small>{p.pay_account}</small>}
                  </div>
                </div>

                <div className="helm-svc-meta">
                  {Number(p.commission_pct) > 0 && <span>{p.commission_pct}% comisión</span>}
                  {Number(p.fixed_fee) > 0 && <span>{money(p.fixed_fee)} fijo</span>}
                  {p.started_on && <span>desde {fmtDate(p.started_on)}</span>}
                </div>

                {(p.contract_url || p.contract_note) && (
                  <div className="helm-svc-links">
                    {p.contract_url
                      ? <a className="helm-btn sm" href={p.contract_url} target="_blank" rel="noreferrer"><FileText size={13} />Contrato</a>
                      : <span className="helm-tag">{p.contract_note}</span>}
                  </div>
                )}

                <div className="helm-svc-foot">
                  <small style={{ color: 'var(--text-mut)' }}>{p.notes ? p.notes.slice(0, 60) : ''}</small>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Pencil size={15} className="helm-x" title="Editar" onClick={() => setEdit(toForm(p))} />
                    <Trash2 size={15} className="helm-x" title="Eliminar" onClick={() => remove(p)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {edit && <PersonaModal inicial={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  )
}

function PersonaModal({ inicial, onClose, onSave }) {
  const [form, setForm] = useState(inicial)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const errors = {}
  if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
  if (form.email.trim() && !RE_EMAIL.test(form.email.trim())) errors.email = 'Email no válido'
  const pct = Number(form.commission_pct)
  if (form.commission_pct !== '' && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
    errors.commission_pct = 'Tiene que estar entre 0 y 100'
  }
  if (form.conAcceso) {
    if (!RE_EMAIL.test(form.accessEmail.trim())) errors.accessEmail = 'Hace falta un email válido para entrar'
    // Al editar alguien que ya tiene acceso, dejar la contraseña vacía
    // significa "no la cambies"; al crearlo es obligatoria.
    const yaTenia = Boolean(inicial.id) && inicial.conAcceso
    if (!yaTenia && form.accessPassword.length < 8) {
      errors.accessPassword = 'Mínimo 8 caracteres'
    } else if (form.accessPassword && form.accessPassword.length < 8) {
      errors.accessPassword = 'Mínimo 8 caracteres'
    }
  }
  const ok = Object.keys(errors).length === 0
  const shown = touched ? errors : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setSaving(true)
    try { await onSave(form) } catch (err) { setError(err.message); setSaving(false) }
  }

  const rol = ROLES.find(r => r.key === form.role)

  return (
    <Modal title={form.id ? 'Editar persona' : 'Nueva persona'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="helm-form-2">
          <Field label="Nombre *" error={shown.name}>
            <Input value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" autoFocus />
          </Field>
          <Field label="Rol" hint={rol?.desc}>
            <Select value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="helm-drawer-section">Contacto</div>
        <div className="helm-form-2">
          <Field label="Email" error={shown.email}>
            <Input value={form.email} onChange={e => set('email', e.target.value)} type="text" inputMode="email" spellCheck={false} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" inputMode="tel" />
          </Field>
        </div>
        <div className="helm-form-2">
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} type="tel" inputMode="tel" />
          </Field>
          <Field label="País">
            <Input value={form.country} onChange={e => set('country', e.target.value)} />
          </Field>
        </div>

        <div className="helm-drawer-section">Información de pago</div>
        <div className="helm-form-2">
          <Field label="Método">
            <Input value={form.pay_method} onChange={e => set('pay_method', e.target.value)} list="helm-pay-methods" placeholder="Transferencia" />
            <datalist id="helm-pay-methods">{PAY_METHODS.map(m => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Cuenta / destino" hint="IBAN, correo de PayPal, wallet…">
            <Input value={form.pay_account} onChange={e => set('pay_account', e.target.value)} spellCheck={false} />
          </Field>
        </div>
        <Field label="Condiciones" hint="Cuándo y cómo se le paga">
          <Input value={form.pay_terms} onChange={e => set('pay_terms', e.target.value)} placeholder="Mensual el día 1 · comisión al cobrar la venta" />
        </Field>
        <div className="helm-form-2">
          <Field label="Comisión (%)" error={shown.commission_pct}>
            <Input type="number" className="helm-input" min="0" max="100" step="0.1"
              value={form.commission_pct} onChange={e => set('commission_pct', e.target.value)}
              onWheel={e => e.currentTarget.blur()} />
          </Field>
          <Field label="Fijo mensual (€)">
            <MoneyInput value={form.fixed_fee} onChange={v => set('fixed_fee', v)} />
          </Field>
        </div>

        <div className="helm-drawer-section">Contrato</div>
        <div className="helm-form-2">
          <Field label="Enlace al contrato" hint="Drive, Dropbox, Notion…">
            <Input value={form.contract_url} onChange={e => set('contract_url', e.target.value)} spellCheck={false} />
          </Field>
          <Field label="En vigor desde">
            <Input type="date" value={form.started_on} onChange={e => set('started_on', e.target.value)} />
          </Field>
        </div>
        <Field label="Nota del contrato">
          <Input value={form.contract_note} onChange={e => set('contract_note', e.target.value)} placeholder="Mercantil, 3 meses de prueba…" />
        </Field>

        <Field label="Notas">
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        </Field>

        <div className="helm-drawer-section">Acceso al panel</div>
        <p className="helm-settings-lead">
          Solo si esta persona necesita entrar a HELM. Su <b>rol</b> ({rol?.label}) decide
          qué puede editar según la matriz de <b>Ajustes → Permisos</b>; el <b>nivel</b> de
          aquí abajo decide si esa matriz le afecta o si manda sobre todo.
        </p>

        <label className="helm-checkline">
          <input type="checkbox" checked={form.conAcceso} onChange={e => set('conAcceso', e.target.checked)} />
          <KeyRound size={14} /> Crear acceso con email y contraseña
        </label>

        {form.conAcceso && (
          <>
            <div className="helm-form-2">
              <Field label="Email de acceso *" error={shown.accessEmail}>
                <Input value={form.accessEmail} onChange={e => set('accessEmail', e.target.value)}
                  type="text" inputMode="email" autoComplete="off" spellCheck={false} />
              </Field>
              <Field
                label={inicial.conAcceso ? 'Nueva contraseña' : 'Contraseña *'}
                error={shown.accessPassword}
                hint={inicial.conAcceso ? 'Déjala vacía para no cambiarla' : 'Mínimo 8 caracteres'}
              >
                <Input type="password" value={form.accessPassword} autoComplete="new-password"
                  onChange={e => set('accessPassword', e.target.value)} />
              </Field>
            </div>

            <Field label="Nivel de acceso">
              <div className="helm-niveles">
                {NIVELES_ACCESO.map(n => (
                  <button
                    key={n.key} type="button"
                    className={'helm-nivel' + (form.accessLevel === n.key ? ' on' : '')}
                    onClick={() => set('accessLevel', n.key)}
                  >
                    <b><ShieldCheck size={13} />{n.label}</b>
                    <small>{n.desc}</small>
                  </button>
                ))}
              </div>
            </Field>

            <FormNote tone="warn">
              La contraseña se cifra en el servidor y no vuelve a mostrarse nunca.
              Pásasela a {form.name.trim() || 'esta persona'} por un canal seguro y que la cambie al entrar.
            </FormNote>
          </>
        )}

        {inicial.conAcceso && !form.conAcceso && (
          <FormNote tone="warn">
            Al guardar se le retirará el acceso al panel. No se borra nada: su ficha,
            sus ventas y su histórico se quedan como están.
          </FormNote>
        )}

        <label className="helm-checkline">
          <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
          Activo en el equipo
        </label>

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Añadir al equipo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
