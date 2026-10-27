// HELM — Finanzas: ingresos y gastos, balance del negocio.
//
// Un movimiento ya no es solo "concepto + importe": puede llevar ROL y PERSONA
// del equipo y los CLIENTES que lo generan. Eso es lo que convierte
// "Comisión · Juan · 900 €" en una pregunta contestable: cuánto le he pagado a
// Juan este mes y por qué clientes. Antes todo eso vivía suelto en la
// descripción y no se podía filtrar ni sumar.
//
// Si el perfil se lleva una parte de lo que cobra otro (Silvestre AI: el 35 %
// de Detrás de Cámara y el 50 % de web-seller), cada pago de cada cliente entra
// como un ingreso más, en su fecha (src/helm/participaciones.js). No se guarda:
// sale de las ventas reales del otro perfil, así que no lleva papelera.
import { useEffect, useState, useMemo } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import {
  fetchRows, fetchRowsOrError, insertRow, deleteRow,
  money, fmtDate, todayISO, activeSales, isSaleCancelled, participacionesApi,
} from '../lib'
import { partesDe, movimientosDe } from '../participaciones'
import { Panel, Empty, Modal, Field, Input, Select, Kpi, MoneyInput, FormNote } from '../ui'
import { rolesDelProducto, roleLabel } from '../equipo/roles'
import { productoActual } from '../producto'

// Cómo se clasifica cada movimiento. `sign` decide si suma o resta, y
// `recurring` marca los que se repiten mes a mes (los fijos).
const TIPOS = [
  { key: 'ingreso',  label: 'Ingreso',        category: 'Ingreso',        sign: 1,  recurring: false },
  { key: 'fijo',     label: 'Gasto fijo',     category: 'Gasto fijo',     sign: -1, recurring: true },
  { key: 'puntual',  label: 'Gasto puntual',  category: 'Gasto puntual',  sign: -1, recurring: false },
  { key: 'comision', label: 'Comisión',       category: 'Comisión',       sign: -1, recurring: false },
]
const TIPO_POR_CATEGORIA = Object.fromEntries(TIPOS.map(t => [t.category, t]))

// Movimientos antiguos (o importados) que no traen una de nuestras categorías:
// se clasifican por el signo del importe.
function tipoDe(row) {
  const t = TIPO_POR_CATEGORIA[row.category]
  if (t) return t
  return Number(row.amount) >= 0 ? TIPOS[0] : TIPOS[2]
}

const mesDe = (iso) => (iso || '').slice(0, 7)
const nombreMes = (ym) => {
  if (!ym) return '—'
  const [a, m] = ym.split('-')
  return new Date(Number(a), Number(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

const EMPTY = {
  date: todayISO(), kind: 'ingreso', category: '', description: '', amount: '',
  person_id: '', person_role: '', contact_ids: [],
}

export default function Finanzas({ clientId }) {
  const [rows, setRows] = useState(null)
  const [deOtros, setDeOtros] = useState([])   // los ingresos de participaciones
  const [products, setProducts] = useState(null)
  const [sales, setSales] = useState(null)
  const [people, setPeople] = useState([])
  const [contacts, setContacts] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)

  // Filtros de la tabla de movimientos.
  const [fRol, setFRol] = useState('__all__')
  const [fPersona, setFPersona] = useState('__all__')
  const [fMes, setFMes] = useState('__all__')

  const load = () => fetchRows('ceo_finance_entries', clientId, { order: 'date' }).then(setRows)

  // Las ventas canceladas no entran: si no, el catálogo seguiría diciendo que
  // un producto facturó lo que se anuló.
  const loadCatalog = () => Promise.all([
    fetchRows('products', clientId, { order: 'created_at' }),
    fetchRows('sales', clientId, { order: 'date' }),
  ]).then(([p, v]) => { setProducts(p); setSales(activeSales(v)) })

  useEffect(() => {
    load(); loadCatalog()
    fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }).then(({ rows: r }) => setPeople(r))
    fetchRows('crm_contacts', clientId, { limit: 1000 }).then(setContacts)
    participacionesApi.de(clientId)
      .then(p => setDeOtros(movimientosDe(partesDe(p?.participaciones, { esCancelada: isSaleCancelled }).cobros)))
      .catch(() => setDeOtros([]))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Los movimientos guardados y los de participaciones, juntos y por fecha.
  const todos = useMemo(() => (rows == null ? null : [...rows, ...deOtros]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))), [rows, deOtros])

  // Qué se está vendiendo de verdad: catálogo activo cruzado con las ventas.
  const catalogo = useMemo(() => {
    if (!products || !sales) return null
    const vendido = {}
    for (const v of sales) {
      const k = (v.product || '').trim()
      if (!k) continue
      vendido[k] = vendido[k] || { unidades: 0, importe: 0 }
      vendido[k].unidades++
      vendido[k].importe += Number(v.revenue) || 0
    }
    const filas = products.filter(p => p.active !== false).map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      currency: p.currency || 'EUR',
      interval: p.billing_interval,
      fromStripe: Boolean(p.stripe_product_id),
      ...(vendido[p.name] || { unidades: 0, importe: 0 }),
    }))
    // Productos vendidos que no están en el catálogo (venta suelta o manual).
    for (const [name, d] of Object.entries(vendido)) {
      if (!filas.some(f => f.name === name)) {
        filas.push({ id: 'x-' + name, name, price: 0, currency: 'EUR', interval: null, fromStripe: false, ...d })
      }
    }
    return filas.sort((a, b) => b.importe - a.importe)
  }, [products, sales])

  // Meses con movimientos, para el filtro. Del más reciente al más antiguo.
  const meses = useMemo(
    () => [...new Set((todos || []).map(r => mesDe(r.date)).filter(Boolean))].sort().reverse(),
    [todos],
  )

  // Personas que aparecen en algún movimiento, aunque ya no estén en el equipo.
  const personasConMovimientos = useMemo(() => {
    const m = new Map()
    for (const r of (rows || [])) {
      if (!r.person_name) continue
      const key = r.person_id || r.person_name
      if (!m.has(key)) m.set(key, { key, name: r.person_name, role: r.person_role })
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filtrados = useMemo(() => (todos || []).filter(r => {
    if (fRol !== '__all__' && (r.person_role || '') !== fRol) return false
    if (fPersona !== '__all__' && (r.person_id || r.person_name || '') !== fPersona) return false
    if (fMes !== '__all__' && mesDe(r.date) !== fMes) return false
    return true
  }), [todos, fRol, fPersona, fMes])

  const hayFiltro = fRol !== '__all__' || fPersona !== '__all__' || fMes !== '__all__'

  // Los KPI de arriba miran SIEMPRE el total del negocio; el resumen del filtro
  // se enseña aparte para que no se confunda una cosa con la otra.
  const t = useMemo(() => {
    const r = todos || []
    const sum = (f) => r.filter(f).reduce((a, x) => a + Number(x.amount), 0)
    const income = sum(x => Number(x.amount) > 0)
    const participaciones = sum(x => x.participacion)
    const expense = sum(x => Number(x.amount) < 0)
    return {
      income, expense, balance: income + expense, participaciones,
      fijos: sum(x => tipoDe(x).key === 'fijo'),
      puntuales: sum(x => tipoDe(x).key === 'puntual'),
      comisiones: sum(x => tipoDe(x).key === 'comision'),
    }
  }, [todos])

  const totalFiltro = useMemo(
    () => filtrados.reduce((a, x) => a + Number(x.amount), 0),
    [filtrados],
  )

  async function save(form) {
    const tipo = TIPOS.find(x => x.key === form.kind) || TIPOS[0]
    const persona = people.find(p => p.id === form.person_id)
    const row = await insertRow('ceo_finance_entries', {
      client_id: clientId, date: form.date,
      // La categoría marca el tipo; si escriben una propia se guarda como
      // detalle dentro de la descripción, para no romper la clasificación.
      category: tipo.category,
      description: [form.category.trim(), form.description.trim()].filter(Boolean).join(' · ') || '',
      amount: Math.abs(Number(form.amount) || 0) * tipo.sign,
      recurring: tipo.recurring,
      person_id: persona?.id || null,
      // El nombre y el rol se copian: si la persona se da de baja, el histórico
      // de lo que se le pagó tiene que seguir siendo legible.
      person_name: persona?.name || '',
      person_role: persona?.role || form.person_role || '',
      contact_ids: form.contact_ids,
    })
    setRows(rs => [row, ...(rs || [])])
    setOpen(false)
  }

  async function remove(id) {
    setError(null)
    try {
      await deleteRow('ceo_finance_entries', id)
      setRows(rs => rs.filter(r => r.id !== id))
    } catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  const nombreContacto = (id) => contacts.find(c => c.id === id)?.name || 'cliente'

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Balance" value={money(t.balance)} accent sub="ingresos − gastos" />
        <Kpi label="Ingresos" value={money(t.income)}
          sub={t.participaciones ? `${money(t.participaciones)} de tu parte de otros perfiles` : undefined} />
        <Kpi label="Gastos" value={money(t.expense)} sub="todos los tipos" />
        <Kpi label="Gastos fijos" value={money(t.fijos)} sub="se repiten cada mes" />
        <Kpi label="Gastos puntuales" value={money(t.puntuales)} sub="una sola vez" />
        <Kpi label="Comisiones" value={money(t.comisiones)}
          sub={productoActual().key === 'consultoria' ? 'a asesores y colaboradores' : 'closers, setters, afiliados'} />
      </div>

      {error && <FormNote>{error}</FormNote>}

      <Panel title="Productos activos">
        {catalogo == null ? <Empty>Cargando…</Empty> : catalogo.length === 0 ? (
          <Empty>Sin productos. Se dan de alta solos al importar Stripe o al registrar una venta.</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr><th>Producto</th><th>Precio</th><th>Vendidos</th><th>Facturado</th><th>Origen</th></tr>
              </thead>
              <tbody>
                {catalogo.map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.price ? money(p.price) : '—'}{p.interval ? ` / ${p.interval}` : ''}</td>
                    <td>{p.unidades || '—'}</td>
                    <td>{p.importe ? money(p.importe) : '—'}</td>
                    <td><span className="helm-badge">{p.fromStripe ? 'Stripe' : 'Manual'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Movimientos"
        action={<button className="helm-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Nuevo movimiento</button>}
      >
        <div className="helm-filters" style={{ padding: '14px 18px 0' }}>
          <div className="helm-filter-row">
            <select className="helm-select" value={fRol} onChange={e => { setFRol(e.target.value); setFPersona('__all__') }}>
              <option value="__all__">Todos los roles</option>
              {rolesDelProducto().map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <select className="helm-select" value={fPersona} onChange={e => setFPersona(e.target.value)}>
              <option value="__all__">Todas las personas</option>
              {personasConMovimientos
                .filter(p => fRol === '__all__' || p.role === fRol)
                .map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <select className="helm-select" value={fMes} onChange={e => setFMes(e.target.value)}>
              <option value="__all__">Todos los meses</option>
              {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
            {hayFiltro && (
              <button className="helm-btn" onClick={() => { setFRol('__all__'); setFPersona('__all__'); setFMes('__all__') }}>
                Limpiar
              </button>
            )}
          </div>
          {hayFiltro && (
            <div className="helm-filter-total">
              {filtrados.length} movimiento{filtrados.length === 1 ? '' : 's'} ·
              <b style={{ color: totalFiltro >= 0 ? 'var(--green)' : 'var(--red)' }}> {money(totalFiltro)}</b>
            </div>
          )}
        </div>

        {todos == null ? <Empty>Cargando…</Empty> : filtrados.length === 0 ? (
          <Empty>{hayFiltro ? 'Ningún movimiento con estos filtros.' : 'Sin movimientos registrados.'}</Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Persona</th><th>Clientes</th><th>Importe</th><th></th></tr>
              </thead>
              <tbody>
                {filtrados.map(r => {
                  const pos = Number(r.amount) >= 0
                  const tipo = tipoDe(r)
                  const cids = Array.isArray(r.contact_ids) ? r.contact_ids : []
                  return (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td>
                        <span className={'helm-badge tipo-' + tipo.key}>{tipo.label}</span>
                        {r.participacion && <small style={{ display: 'block', color: 'var(--text-mut)' }}>Participación · automático</small>}
                      </td>
                      <td>{r.description || '—'}</td>
                      <td>
                        {r.person_name
                          ? <>{r.person_name}<small style={{ display: 'block', color: 'var(--text-mut)' }}>{roleLabel(r.person_role)}</small></>
                          : '—'}
                      </td>
                      <td>
                        {cids.length === 0 ? '—' : (
                          <span className="helm-chip" title={cids.map(nombreContacto).join(', ')}>
                            <Users size={11} />{cids.length}
                          </span>
                        )}
                      </td>
                      <td className="helm-num" style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>{pos ? '+' : ''}{money(r.amount)}</td>
                      <td>{!r.participacion && <Trash2 size={15} className="helm-x" onClick={() => remove(r.id)} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <MovimientoModal
          people={people} contacts={contacts}
          onClose={() => setOpen(false)} onSave={save}
        />
      )}
    </div>
  )
}

function MovimientoModal({ people, contacts, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const esComision = form.kind === 'comision'
  const activos = people.filter(p => p.active !== false)
  const delRol = form.person_role ? activos.filter(p => p.role === form.person_role) : activos

  const errors = {}
  if (!form.amount || Math.abs(Number(form.amount)) === 0) errors.amount = 'El importe es obligatorio'
  if (!form.date) errors.date = 'La fecha es obligatoria'
  // Una comisión sin destinatario es exactamente el problema que había antes.
  if (esComision && !form.person_id && activos.length > 0) errors.person_id = 'Di a quién se le paga'
  const ok = Object.keys(errors).length === 0
  const shown = touched ? errors : {}

  const coincidencias = buscaCliente.trim()
    ? contacts.filter(c => (c.name || '').toLowerCase().includes(buscaCliente.trim().toLowerCase())).slice(0, 8)
    : []

  const toggleCliente = (id) => set('contact_ids',
    form.contact_ids.includes(id) ? form.contact_ids.filter(x => x !== id) : [...form.contact_ids, id])

  async function submit(e) {
    e.preventDefault()
    setTouched(true); setError(null)
    if (!ok) return
    setSaving(true)
    try { await onSave(form) } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title="Nuevo movimiento" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="helm-form-2">
          <Field label="Tipo">
            <Select value={form.kind} onChange={e => set('kind', e.target.value)}>
              {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Fecha *" error={shown.date}>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </Field>
        </div>

        <div className="helm-form-2">
          <Field label="Concepto">
            <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="nómina, software, comisión de julio…" />
          </Field>
          <Field label="Importe (€) *" error={shown.amount} hint="Siempre en positivo: el tipo decide si suma o resta">
            <MoneyInput value={form.amount} onChange={v => set('amount', v)} autoFocus />
          </Field>
        </div>

        <Field label="Descripción">
          <Input value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>

        <div className="helm-drawer-section">
          Rol y persona {esComision ? '' : '(opcional)'}
        </div>
        {activos.length === 0 ? (
          <p className="helm-settings-lead">
            Da de alta a tu equipo en <b>Equipo y perfiles</b> para poder asignar comisiones
            por persona y filtrar cuánto le has pagado a cada uno.
          </p>
        ) : (
          <div className="helm-form-2">
            <Field label="Rol">
              <Select
                value={form.person_role}
                onChange={e => setForm(f => ({ ...f, person_role: e.target.value, person_id: '' }))}
              >
                <option value="">Todos</option>
                {rolesDelProducto().map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label={esComision ? 'Persona *' : 'Persona'} error={shown.person_id}>
              <Select value={form.person_id} onChange={e => set('person_id', e.target.value)}>
                <option value="">—</option>
                {delRol.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
              </Select>
            </Field>
          </div>
        )}

        <div className="helm-drawer-section">Clientes que generan el movimiento</div>
        <Field label="" hint="Busca y pulsa para adjuntar. Por ejemplo, los clientes por los que se paga esta comisión.">
          <Input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} placeholder="Buscar contacto del CRM…" />
        </Field>
        {coincidencias.length > 0 && (
          <div className="helm-pickers">
            {coincidencias.map(c => (
              <button
                key={c.id} type="button"
                className={'helm-pick' + (form.contact_ids.includes(c.id) ? ' on' : '')}
                onClick={() => toggleCliente(c.id)}
              >
                {c.name}{c.company && <small>{c.company}</small>}
              </button>
            ))}
          </div>
        )}
        {form.contact_ids.length > 0 && (
          <div className="helm-pickers">
            {form.contact_ids.map(id => {
              const c = contacts.find(x => x.id === id)
              return (
                <button key={id} type="button" className="helm-pick on" onClick={() => toggleCliente(id)}>
                  {c?.name || 'Contacto'}<small>quitar</small>
                </button>
              )
            })}
          </div>
        )}

        <FormNote>{error}</FormNote>
        {touched && !ok && <FormNote>Revisa los campos marcados en rojo.</FormNote>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
