// HELM — Ventas: reporte de ventas.
//
// Una venta es el nudo del sistema: enlaza el SERVICIO del catálogo, el
// CONTACTO del pipeline y a las tres personas del EQUIPO que intervienen
// (setter, closer y CSM). Guardar esos vínculos —y no solo texto suelto— es lo
// que permite después filtrar el CRM por servicio y pagar comisiones por
// persona en Finanzas.
//
// Cancelar ≠ borrar: una venta cancelada deja de contar en los totales, en el
// Informe y en Finanzas, pero se queda en su histórico. Ver lib.js.
//
// «Próximos cobros» enseña lo que va a entrar y cuándo, calculado de los
// planes fraccionados y las mensualidades (../cobrosPrevistos.js).
import { Fragment, useEffect, useState, useMemo } from 'react'
import { Plus, Ban, Undo2, Trash2, CalendarClock } from 'lucide-react'
import {
  fetchRows, fetchRowsOrError, insertRow, deleteRow, money, fmtDate, todayISO,
  isSaleCancelled, cancelSale, restoreSale, cuotasPendientes,
} from '../lib'
import {
  Panel, Empty, Modal, Field, Input, Select, Kpi, MoneyInput, CountInput, FormNote, SearchSelect,
} from '../ui'
import { cobrosPrevistos, porMes } from '../cobrosPrevistos'

const MESES_PREVISTOS = 6
const nombreMes = (aaaamm) => {
  const t = new Date(`${aaaamm}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const PAY_METHODS = ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'Bizum', 'Efectivo', 'Financiación']

const EMPTY = {
  date: todayISO(),
  contact: { id: null, label: '' },     // cliente del pipeline (o texto libre)
  service_id: '', product: '',
  revenue: '', cash_collected: '',
  closer: '', setter: '', csm: '',
  payment_method: 'Transferencia',
  plan: 'unico',                        // unico | fraccionado
  installments_total: '', installments_paid: '', installment_amount: '',
  plan_start: '', plan_end: '',
  service_start: '', service_end: '',
}

export default function Ventas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [contacts, setContacts] = useState([])
  const [services, setServices] = useState([])
  const [people, setPeople] = useState([])
  const [open, setOpen] = useState(false)
  const [verCanceladas, setVerCanceladas] = useState(false)
  const [error, setError] = useState(null)

  const load = () => fetchRows('sales', clientId, { order: 'date' }).then(setRows)

  useEffect(() => {
    load()
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
    // Catálogo y equipo son opcionales: si la migración aún no está aplicada,
    // el alta sigue funcionando con los campos de texto libre de siempre.
    fetchRowsOrError('helm_services', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setServices(r))
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activas = useMemo(() => (rows || []).filter(r => !isSaleCancelled(r)), [rows])
  const canceladas = useMemo(() => (rows || []).filter(isSaleCancelled), [rows])

  // Los totales solo miran las activas: ese era el fallo, una venta cancelada
  // seguía sumando en el informe como si fuese buena.
  const totals = useMemo(() => {
    const revenue = activas.reduce((a, x) => a + (Number(x.revenue) || 0), 0)
    const cash = activas.reduce((a, x) => a + (Number(x.cash_collected) || 0), 0)
    return { revenue, cash, pendiente: revenue - cash, count: activas.length }
  }, [activas])
  const previstos = useMemo(
    () => porMes(cobrosPrevistos(rows || [], { hoy: todayISO(), meses: MESES_PREVISTOS, esCancelada: isSaleCancelled })),
    [rows],
  )

  async function save(row) {
    const saved = await insertRow('sales', { client_id: clientId, ...row })
    setRows(rs => [saved, ...(rs || [])])
    setOpen(false)
  }

  const patchLocal = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))

  async function cancelar(r) {
    if (!window.confirm(`¿Cancelar la venta de ${r.client_name || 'este cliente'}? Dejará de contar en el informe.`)) return
    setError(null)
    patchLocal(r.id, { status: 'cancelada' })
    try { await cancelSale(r.id) } catch (e) { setError('No se pudo cancelar: ' + e.message); load() }
  }

  async function restaurar(r) {
    setError(null)
    patchLocal(r.id, { status: 'won' })
    try { await restoreSale(r.id) } catch (e) { setError('No se pudo restaurar: ' + e.message); load() }
  }

  async function borrarDefinitivo(r) {
    if (!window.confirm(`¿Eliminar definitivamente la venta de ${r.client_name || 'este cliente'}? No se puede deshacer.`)) return
    setError(null)
    try {
      await deleteRow('sales', r.id)
      setRows(rs => rs.filter(x => x.id !== r.id))
    } catch (e) {
      setError('No se pudo eliminar: ' + e.message + '. Se queda como cancelada.')
    }
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Facturado total" value={money(totals.revenue)} accent sub="sin las canceladas" />
        <Kpi label="Cobrado" value={money(totals.cash)} />
        <Kpi label="Pendiente de cobro" value={money(totals.pendiente)} sub="facturado − cobrado" />
        <Kpi label="Nº ventas" value={totals.count} sub={canceladas.length ? `${canceladas.length} canceladas aparte` : undefined} />
      </div>

      {error && <FormNote>{error}</FormNote>}

      {previstos.length > 0 && (
        <Panel
          title="Próximos cobros"
          action={<small style={{ color: 'var(--text-mut)' }}>De los planes de pago y las mensualidades · {MESES_PREVISTOS} meses</small>}
        >
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Cómo llega</th><th>Importe</th></tr>
              </thead>
              <tbody>
                {previstos.map(m => (
                  <Fragment key={m.mes}>
                    <tr style={{ background: 'var(--hover)' }}>
                      <td colSpan={4}><b>{nombreMes(m.mes)}</b></td>
                      <td className="helm-num"><b>{money(m.total)}</b></td>
                    </tr>
                    {m.cobros.map(c => (
                      <tr key={`${c.ventaId}-${c.fecha}`}>
                        <td>
                          {fmtDate(c.fecha)}
                          {c.vencido && <span className="helm-chip red" style={{ marginLeft: 6 }}>vencido</span>}
                        </td>
                        <td>{c.cliente}</td>
                        <td>
                          {c.concepto}
                          <small style={{ color: 'var(--text-mut)' }}>{c.tipo === 'cuota' ? ` · cuota ${c.n}/${c.de}` : ' · mensualidad'}</small>
                        </td>
                        <td><small style={{ color: 'var(--text-mut)' }}>{c.como}</small></td>
                        <td className="helm-num">{money(c.importe)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Ventas" action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Registrar venta</button>}>
        {rows == null ? <Empty>Cargando…</Empty> : activas.length === 0 ? (
          <Empty>Sin ventas registradas.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Cliente</th><th>Servicio</th><th>Equipo</th>
                  <th>Cobro</th><th>Facturado</th><th>Cobrado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {activas.map(r => {
                  const pend = cuotasPendientes(r)
                  return (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.client_name || '—'}</td>
                      <td>{r.product || '—'}</td>
                      <td>
                        <small style={{ color: 'var(--text-mut)' }}>
                          {[r.setter, r.closer, r.csm].filter(Boolean).join(' · ') || '—'}
                        </small>
                      </td>
                      <td>
                        {pend == null ? <span className="helm-chip">Pago único</span> : (
                          <span className={'helm-chip ' + (pend === 0 ? 'green' : 'amber')}>
                            <CalendarClock size={11} />
                            {r.installments_paid || 0}/{r.installments_total}
                            {pend > 0 ? ` · faltan ${pend}` : ' · cobrado'}
                          </span>
                        )}
                      </td>
                      <td className="helm-num">{money(r.revenue)}</td>
                      <td className="helm-num">{money(r.cash_collected)}</td>
                      <td><Ban size={15} className="helm-x" title="Cancelar venta" onClick={() => cancelar(r)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canceladas.length > 0 && (
        <Panel
          title={`Canceladas (${canceladas.length})`}
          action={
            <button className="helm-btn" onClick={() => setVerCanceladas(v => !v)}>
              {verCanceladas ? 'Ocultar' : 'Ver histórico'}
            </button>
          }
        >
          {verCanceladas ? (
            <div className="helm-tablewrap">
              <table className="helm-table">
                <thead><tr><th>Fecha</th><th>Cliente</th><th>Servicio</th><th>Facturado</th><th></th></tr></thead>
                <tbody>
                  {canceladas.map(r => (
                    <tr key={r.id} className="helm-row-void">
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.client_name || '—'}</td>
                      <td>{r.product || '—'}</td>
                      <td className="helm-num">{money(r.revenue)}</td>
                      <td style={{ display: 'flex', gap: 12 }}>
                        <Undo2 size={15} className="helm-x" title="Restaurar" onClick={() => restaurar(r)} />
                        <Trash2 size={15} className="helm-x" title="Eliminar definitivamente" onClick={() => borrarDefinitivo(r)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="helm-empty">
              {canceladas.length} venta{canceladas.length > 1 ? 's' : ''} cancelada{canceladas.length > 1 ? 's' : ''}.
              No cuentan en ningún total.
            </div>
          )}
        </Panel>
      )}

      {open && (
        <NuevaVentaModal
          contacts={contacts} services={services} people={people}
          onClose={() => setOpen(false)} onSave={save}
        />
      )}
    </div>
  )
}

// Suma días a una fecha ISO. Se usa para proponer el fin del servicio a partir
// de la duración que tenga definida el servicio en el catálogo.
function sumaDias(iso, dias) {
  if (!iso || !dias) return ''
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + Number(dias))
  return d.toISOString().slice(0, 10)
}

// ── Cómo se cobra a plazos ───────────────────────────────────────────────────
// Fraccionar no es «que el cliente te vaya haciendo transferencias»: eso acabas
// persiguiéndolo tú cada mes. Lo que sostiene un ticket alto es la tarjeta
// domiciliada — primer cobro al comprar y el resto automáticos. La ayuda vive
// aquí, y no en Ajustes, porque este es el momento en que alguien marca
// «Fraccionado» y se pregunta cómo se cobra eso de verdad.
function ComoCobrarAPlazos() {
  return (
    <div className="helm-settings-block">
      <label>Cómo se cobra a plazos</label>
      <p>Con tarjeta de crédito o débito, en tres pasos:</p>
      <ol className="helm-pasos">
        <li>El cliente introduce su tarjeta en el momento de la compra.</li>
        <li>Se hace el primer cobro en ese momento.</li>
        <li>Los siguientes salen automáticamente cada mes de la misma tarjeta.</li>
      </ol>
      <p>
        Para ofrecerlo en tu web, envía la solicitud desde{' '}
        <a href="https://www.sequra.com/es/contacto" target="_blank" rel="noopener noreferrer">
          sequra.com/es/contacto
        </a>{' '}
        y elige la opción <b>Empresas</b>.
      </p>
      <FormNote tone="warn">
        Usa un email corporativo: con Gmail o Hotmail no tramitan la solicitud.
      </FormNote>
      <p className="helm-settings-note">
        Es lo que hace vendible un ticket alto: 3.000 € de golpe frenan la compra;
        esos mismos 3.000 € repartidos en mensualidades, no.
      </p>
    </div>
  )
}

function NuevaVentaModal({ contacts, services, people, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [comoCobrar, setComoCobrar] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const activos = services.filter(s => s.active !== false)
  const gente = (rol) => people.filter(p => p.active !== false && p.role === rol)
  const fraccionado = form.plan === 'fraccionado'

  // Elegir servicio autocompleta precio, nombre y —si el servicio tiene
  // duración— la fecha de fin. Todo sigue siendo editable a mano después.
  function elegirServicio(id) {
    const s = activos.find(x => x.id === id)
    setForm(f => ({
      ...f,
      service_id: id,
      product: s ? s.name : f.product,
      revenue: s && !f.revenue ? String(s.price || '') : f.revenue,
      service_end: s?.duration_days && f.service_start ? sumaDias(f.service_start, s.duration_days) : f.service_end,
    }))
  }

  function elegirInicio(v) {
    const s = activos.find(x => x.id === form.service_id)
    setForm(f => ({
      ...f,
      service_start: v,
      service_end: s?.duration_days ? sumaDias(v, s.duration_days) : f.service_end,
    }))
  }

  // Al fijar el nº de cuotas, se propone el importe de cada una.
  function elegirCuotas(v) {
    const n = Number(v) || 0
    const rev = Number(form.revenue) || 0
    setForm(f => ({
      ...f,
      installments_total: v,
      installment_amount: n > 0 && rev > 0 ? String(Math.round((rev / n) * 100) / 100) : f.installment_amount,
    }))
  }

  const errors = {}
  if (!form.contact.label.trim()) errors.contact = 'El cliente es obligatorio'
  if (!form.date) errors.date = 'La fecha es obligatoria'
  if (form.revenue !== '' && Number(form.revenue) < 0) errors.revenue = 'No puede ser negativo'
  if (form.cash_collected !== '' && Number(form.cash_collected) > Number(form.revenue || 0)) {
    errors.cash_collected = 'El cobrado no puede superar al facturado'
  }
  if (form.service_end && form.service_start && form.service_end < form.service_start) {
    errors.service_end = 'El fin no puede ser anterior al inicio'
  }
  if (fraccionado) {
    const n = Number(form.installments_total)
    if (!n || n < 2) errors.installments_total = 'Un plan fraccionado tiene 2 cuotas o más'
    const pagadas = Number(form.installments_paid) || 0
    if (pagadas > n) errors.installments_paid = 'No puede haber más cuotas cobradas que totales'
    if (form.plan_end && form.plan_start && form.plan_end < form.plan_start) {
      errors.plan_end = 'El fin no puede ser anterior al inicio'
    }
  }
  const ok = Object.keys(errors).length === 0
  const shown = touched ? errors : {}

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setSaving(true)
    try {
      await onSave({
        date: form.date,
        client_name: form.contact.label.trim(),
        contact_id: form.contact.id,
        service_id: form.service_id || null,
        product: form.product.trim() || null,
        revenue: Number(form.revenue) || 0,
        cash_collected: Number(form.cash_collected) || 0,
        closer: form.closer.trim() || null,
        setter: form.setter.trim() || null,
        csm: form.csm.trim() || null,
        payment_method: form.payment_method,
        payment_type: fraccionado ? 'Fraccionado' : 'Pago único',
        installments_total: fraccionado ? Number(form.installments_total) : null,
        installments_paid: fraccionado ? (Number(form.installments_paid) || 0) : 0,
        installment_amount: fraccionado ? (Number(form.installment_amount) || null) : null,
        plan_start: fraccionado ? (form.plan_start || null) : null,
        plan_end: fraccionado ? (form.plan_end || null) : null,
        service_start: form.service_start || null,
        service_end: form.service_end || null,
        status: 'won',
      })
    } catch (err) { setError(err.message); setSaving(false) }
  }

  // Cada persona del equipo se guarda por NOMBRE, no por id: así la venta sigue
  // diciendo quién la cerró aunque esa persona se dé de baja del equipo.
  const personaField = (rolKey, campo, label) => {
    const lista = gente(rolKey)
    return (
      <Field label={label}>
        {lista.length > 0 ? (
          <Select value={form[campo]} onChange={e => set(campo, e.target.value)}>
            <option value="">—</option>
            {lista.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </Select>
        ) : (
          <Input value={form[campo]} onChange={e => set(campo, e.target.value)} placeholder="Nombre" />
        )}
      </Field>
    )
  }

  return (
    <Modal title="Registrar venta" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="helm-form-2">
          <Field label="Fecha de la venta *" error={shown.date}>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} max={todayISO()} />
          </Field>
          <Field label="Cliente *" error={shown.contact} hint={form.contact.id ? 'Enlazado a su ficha del CRM' : 'Escribe o elige del pipeline'}>
            <SearchSelect
              value={form.contact}
              onChange={c => set('contact', c)}
              placeholder="Buscar en el CRM…"
              emptyText="Nadie con ese nombre. Se guardará como texto."
              options={contacts.map(c => ({
                id: c.id,
                label: c.name,
                sub: [c.company, c.email].filter(Boolean).join(' · '),
              }))}
            />
          </Field>
        </div>

        <div className="helm-form-2">
          <Field label="Servicio" hint={activos.length ? 'Autocompleta el precio' : 'Da de alta tu catálogo en Servicios'}>
            {activos.length > 0 ? (
              <Select value={form.service_id} onChange={e => elegirServicio(e.target.value)}>
                <option value="">— Sin servicio del catálogo —</option>
                {activos.map(s => <option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}
              </Select>
            ) : (
              <Input value={form.product} onChange={e => set('product', e.target.value)} placeholder="Nombre del servicio" />
            )}
          </Field>
          <Field label="Método de pago">
            <Select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
              {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        </div>

        <div className="helm-drawer-section">Importes</div>
        <div className="helm-form-2">
          <Field label="Facturado (€)" error={shown.revenue} hint="Lo facturado en total">
            <MoneyInput value={form.revenue} onChange={v => set('revenue', v)} />
          </Field>
          <Field label="Cobrado (€)" error={shown.cash_collected} hint="Lo cobrado ya">
            <MoneyInput value={form.cash_collected} onChange={v => set('cash_collected', v)} />
          </Field>
        </div>

        <Field label="Formato de cobro">
          <div className="helm-segmented">
            <button type="button" className={form.plan === 'unico' ? 'on' : ''} onClick={() => set('plan', 'unico')}>Pago único</button>
            <button type="button" className={fraccionado ? 'on' : ''} onClick={() => set('plan', 'fraccionado')}>Fraccionado</button>
          </div>
        </Field>

        {fraccionado && (
          <>
            <p className="helm-settings-lead">
              El cliente mete la tarjeta al comprar y las cuotas siguientes se cobran solas.{' '}
              <button type="button" className="helm-linkbtn" onClick={() => setComoCobrar(v => !v)}>
                {comoCobrar ? 'Ocultar' : 'Cómo se cobra a plazos'}
              </button>
            </p>
            {comoCobrar && <ComoCobrarAPlazos />}
            <div className="helm-form-3">
              <Field label="Nº de cuotas *" error={shown.installments_total}>
                <CountInput value={form.installments_total} onChange={elegirCuotas} placeholder="3" />
              </Field>
              <Field label="Importe por cuota (€)">
                <MoneyInput value={form.installment_amount} onChange={v => set('installment_amount', v)} />
              </Field>
              <Field label="Cuotas ya cobradas" error={shown.installments_paid}>
                <CountInput value={form.installments_paid} onChange={v => set('installments_paid', v)} placeholder="0" />
              </Field>
            </div>
            <div className="helm-form-2">
              <Field label="Inicio del plan de pago">
                <Input type="date" value={form.plan_start} onChange={e => set('plan_start', e.target.value)} />
              </Field>
              <Field label="Fin del plan de pago" error={shown.plan_end}>
                <Input type="date" value={form.plan_end} onChange={e => set('plan_end', e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <div className="helm-drawer-section">Servicio</div>
        <div className="helm-form-2">
          <Field label="Inicio del servicio">
            <Input type="date" value={form.service_start} onChange={e => elegirInicio(e.target.value)} />
          </Field>
          <Field label="Fin del servicio" error={shown.service_end} hint="Se propone solo si el servicio tiene duración">
            <Input type="date" value={form.service_end} onChange={e => set('service_end', e.target.value)} />
          </Field>
        </div>

        <div className="helm-drawer-section">Quién ha intervenido</div>
        <div className="helm-form-3">
          {personaField('setter', 'setter', 'Setter')}
          {personaField('closer', 'closer', 'Closer')}
          {personaField('csm', 'csm', 'CSM')}
        </div>
        {people.length === 0 && (
          <p className="helm-settings-lead">
            Da de alta a tu gente en <b>Equipo y perfiles</b> y aquí saldrán como desplegables,
            listos para calcular comisiones en Finanzas.
          </p>
        )}

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar venta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
