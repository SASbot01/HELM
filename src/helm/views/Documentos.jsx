// HELM — Documentos: presupuestos y facturas del despacho a sus clientes.
//
// El módulo que le faltaba a HELM frente a un Sage/A3: crear un presupuesto,
// convertirlo en factura con un clic, documento con el logo del despacho,
// enviarlo por email. Copiado del primer bloque de Sage Active, con lo que de
// verdad hace falta en una asesoría y sin lo que no.
//
// Cada factura, al emitirse (salir de "Borrador"), queda encadenada por hash
// a la anterior — ver documentos/verifactu.js. Eso es integridad verificable,
// NO conformidad VeriFactu: falta la firma electrónica (certificado digital
// del despacho) y el envío a la AEAT, que no se pueden fabricar aquí. La hoja
// impresa lo dice tal cual, para que nadie lo confunda con lo oficial.
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FileText, Plus, Check, Trash2, ArrowRight, Printer, Mail, Download, ShieldCheck } from 'lucide-react'
import { supabase, fetchRows, insertRow, updateRow, deleteRow, fmtDate, money, brandOf, exportCSV } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Textarea, Kpi, Tabs, FormNote } from '../ui'
import {
  siguienteNumero, lineaVacia, importeLinea, calcularTotales, IVA_DEFECTO, ESTADOS, estadoLabel,
} from '../documentos/calculo'
import { emitirConHash, datosQR } from '../documentos/verifactu'

const TABS = [
  { key: 'factura', label: 'Facturas', icon: <FileText size={15} /> },
  { key: 'presupuesto', label: 'Presupuestos', icon: <FileText size={15} /> },
]

export default function Documentos({ clientId, client }) {
  const [tipo, setTipo] = useState('factura')
  const [docs, setDocs] = useState(null)
  const [contactos, setContactos] = useState([])
  const [edit, setEdit] = useState(null)     // documento en el editor ({} = nuevo)
  const [ver, setVer] = useState(null)       // documento en la vista de impresión
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([
      supabase.from('helm_documentos_venta').select('*').eq('client_id', clientId).order('fecha', { ascending: false }),
      fetchRows('crm_contacts', clientId, { limit: 2000 }),
    ])
    setDocs(d.data || [])
    setContactos(c || [])
  }, [clientId])

  useEffect(() => { load() }, [load])

  const marca = brandOf(client)
  const delTipo = useMemo(() => (docs || []).filter(d => d.tipo === tipo), [docs, tipo])

  const kpis = useMemo(() => {
    const facturas = (docs || []).filter(d => d.tipo === 'factura' && d.estado !== 'anulado')
    return {
      facturado: facturas.reduce((a, d) => a + Number(d.total), 0),
      pendiente: facturas.filter(d => d.estado === 'enviado' || d.estado === 'vencido').reduce((a, d) => a + Number(d.total), 0),
      vencidas: facturas.filter(d => d.estado === 'vencido').length,
    }
  }, [docs])

  // Facturación por mes de los últimos 6 meses, para el gráfico. Solo
  // facturas (un presupuesto no es facturación todavía) y sin anular.
  const porMes = useMemo(() => {
    const meses = []
    const hoy = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, mes: d.toLocaleDateString('es-ES', { month: 'short' }), total: 0 })
    }
    for (const d of docs || []) {
      if (d.tipo !== 'factura' || d.estado === 'anulado') continue
      const k = String(d.fecha).slice(0, 7)
      const m = meses.find(x => x.key === k)
      if (m) m.total += Number(d.total)
    }
    return meses
  }, [docs])

  function exportar() {
    exportCSV(`${tipo === 'factura' ? 'facturas' : 'presupuestos'}.csv`, [
      { label: 'Número', value: 'numero' },
      { label: 'Cliente', value: 'cliente_nombre' },
      { label: 'NIF', value: 'cliente_nif' },
      { label: 'Fecha', value: 'fecha' },
      { label: 'Subtotal', value: r => Number(r.subtotal).toFixed(2) },
      { label: 'IVA %', value: 'iva_pct' },
      { label: 'IVA', value: r => Number(r.iva).toFixed(2) },
      { label: 'Total', value: r => Number(r.total).toFixed(2) },
      { label: 'Estado', value: r => estadoLabel(r.tipo, r.estado) },
    ], delTipo)
  }

  async function guardar(form) {
    const { subtotal, iva, total } = calcularTotales(form.lineas, form.iva_pct)
    const fila = {
      client_id: clientId, contact_id: form.contact_id || null, tipo: form.tipo,
      cliente_nombre: form.cliente_nombre.trim(), cliente_nif: form.cliente_nif.trim(),
      cliente_direccion: form.cliente_direccion.trim(), cliente_email: form.cliente_email.trim(),
      fecha: form.fecha, lineas: form.lineas.filter(l => l.concepto.trim()),
      subtotal, iva_pct: form.iva_pct, iva, total,
      estado: form.estado, notas: form.notas,
      presupuesto_origen_id: form.presupuesto_origen_id || null,
      updated_at: new Date().toISOString(),
    }
    try {
      if (form.id) {
        await updateRow('helm_documentos_venta', form.id, fila)
      } else {
        await insertRow('helm_documentos_venta', {
          ...fila, numero: siguienteNumero(docs || [], form.tipo),
          created_at: new Date().toISOString(),
        })
      }
      setEdit(null); load()
    } catch (e) { setError('No se pudo guardar: ' + e.message) }
  }

  async function cambiarEstado(d, estado) {
    try {
      const patch = {
        estado,
        pagado_at: estado === 'pagado' ? new Date().toISOString() : d.pagado_at,
        enviado_at: estado === 'enviado' ? new Date().toISOString() : d.enviado_at,
        updated_at: new Date().toISOString(),
      }
      // Una factura se encadena UNA vez, al salir de "Borrador" por primera
      // vez: es el momento en que deja de ser un borrador editable y pasa a
      // ser un registro. Reemitir no debe generar un segundo hash.
      if (d.tipo === 'factura' && d.estado === 'borrador' && estado !== 'borrador' && !d.hash) {
        const ultimo = (docs || [])
          .filter(x => x.tipo === 'factura' && x.hash && x.id !== d.id)
          .sort((a, b) => new Date(b.emitido_at || b.fecha) - new Date(a.emitido_at || a.fecha))[0]
        Object.assign(patch, await emitirConHash(d, ultimo?.hash || ''), { emitido_at: new Date().toISOString() })
      }
      await updateRow('helm_documentos_venta', d.id, patch)
      load()
    } catch (e) { setError('No se pudo cambiar: ' + e.message) }
  }

  // Convertir un presupuesto en factura: copia las líneas y el cliente, saca
  // el numero de la serie de facturas y deja constancia de de dónde viene.
  async function convertirEnFactura(p) {
    const { subtotal, iva, total } = calcularTotales(p.lineas, p.iva_pct)
    try {
      await insertRow('helm_documentos_venta', {
        client_id: clientId, contact_id: p.contact_id, tipo: 'factura',
        numero: siguienteNumero(docs || [], 'factura'),
        cliente_nombre: p.cliente_nombre, cliente_nif: p.cliente_nif,
        cliente_direccion: p.cliente_direccion, cliente_email: p.cliente_email,
        fecha: new Date().toISOString().slice(0, 10),
        lineas: p.lineas, subtotal, iva_pct: p.iva_pct, iva, total,
        estado: 'borrador', notas: p.notas, presupuesto_origen_id: p.id,
      })
      await updateRow('helm_documentos_venta', p.id, { estado: 'pagado', updated_at: new Date().toISOString() })
      load()
      setTipo('factura')
    } catch (e) { setError('No se pudo convertir: ' + e.message) }
  }

  async function borrar(d) {
    if (!confirm(`¿Eliminar ${d.numero}? No se puede deshacer.`)) return
    try { await deleteRow('helm_documentos_venta', d.id); load() }
    catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      {tipo === 'factura' && (
        <div className="helm-grid helm-kpis">
          <Kpi label="Facturado" value={money(kpis.facturado)} accent />
          <Kpi label="Pendiente de cobro" value={money(kpis.pendiente)} />
          <Kpi label="Vencidas" value={kpis.vencidas} sub={kpis.vencidas ? 'requiere atención' : undefined} />
        </div>
      )}

      {error && <FormNote>{error}</FormNote>}

      {tipo === 'factura' && docs && docs.some(d => d.tipo === 'factura') && (
        <Panel title="Facturación mensual">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--text-mut)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-mut)" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={v => money(v)} />
              <Tooltip
                formatter={v => money(v)}
                contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
              <Bar dataKey="total" fill="var(--cyan)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Tabs tabs={TABS} value={tipo} onChange={setTipo} />

      <Panel
        title={tipo === 'factura' ? 'Facturas' : 'Presupuestos'}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="helm-btn" onClick={exportar} disabled={!delTipo.length}>
              <Download size={15} /> Exportar CSV
            </button>
            <button className="helm-btn primary" onClick={() => setEdit(nuevoDoc(tipo))}>
              <Plus size={15} /> {tipo === 'factura' ? 'Nueva factura' : 'Nuevo presupuesto'}
            </button>
          </div>
        }
      >
        {docs === null ? <Empty>Cargando…</Empty>
          : delTipo.length === 0 ? <Empty>Nada todavía. Crea el primero.</Empty>
            : (
              <div className="helm-tablewrap">
                <table className="helm-table">
                  <thead>
                    <tr>
                      <th>Número</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {delTipo.map(d => {
                      const est = ESTADOS[d.tipo].find(e => e.key === d.estado)
                      return (
                        <tr key={d.id}>
                          <td><b>{d.numero}</b></td>
                          <td>{d.cliente_nombre}</td>
                          <td>{fmtDate(d.fecha)}</td>
                          <td className="helm-num">{money(d.total)}</td>
                          <td>
                            <select
                              className="helm-select" value={d.estado}
                              onChange={e => cambiarEstado(d, e.target.value)}
                            >
                              {ESTADOS[d.tipo].map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                            </select>
                          </td>
                          <td>
                            <div className="helm-curso-acts">
                              <button className="helm-btn sm" title="Ver e imprimir" onClick={() => setVer(d)}>
                                <Printer size={13} />
                              </button>
                              {d.tipo === 'presupuesto' && d.estado !== 'anulado' && (
                                <button className="helm-btn sm" title="Convertir en factura" onClick={() => convertirEnFactura(d)}>
                                  <ArrowRight size={13} /> Facturar
                                </button>
                              )}
                              <button className="helm-btn sm" title="Editar" onClick={() => setEdit(d)}>Editar</button>
                              <button className="helm-btn sm" title="Eliminar" onClick={() => borrar(d)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </Panel>

      {edit && (
        <EditorModal
          doc={edit} contactos={contactos}
          onClose={() => setEdit(null)} onSave={guardar}
        />
      )}
      {ver && <VistaImpresion doc={ver} marca={marca} onClose={() => setVer(null)} />}
    </div>
  )
}

function nuevoDoc(tipo) {
  return {
    tipo, cliente_nombre: '', cliente_nif: '', cliente_direccion: '', cliente_email: '',
    fecha: new Date().toISOString().slice(0, 10), lineas: [lineaVacia()],
    iva_pct: IVA_DEFECTO, estado: 'borrador', notas: '', contact_id: '',
  }
}

// ── El editor ────────────────────────────────────────────────────────────
function EditorModal({ doc, contactos, onClose, onSave }) {
  const [f, setF] = useState(doc)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  function elegirContacto(id) {
    const c = contactos.find(x => x.id === id)
    setF(s => ({
      ...s, contact_id: id,
      cliente_nombre: c ? (c.company || c.name) : s.cliente_nombre,
      cliente_email: c?.email || s.cliente_email,
    }))
  }

  function setLinea(i, patch) {
    setF(s => ({ ...s, lineas: s.lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  }
  const añadirLinea = () => setF(s => ({ ...s, lineas: [...s.lineas, lineaVacia()] }))
  const quitarLinea = (i) => setF(s => ({ ...s, lineas: s.lineas.filter((_, j) => j !== i) }))

  const totales = calcularTotales(f.lineas, f.iva_pct)

  async function submit(e) {
    e.preventDefault()
    if (!f.cliente_nombre.trim()) return setError('Falta el nombre del cliente')
    if (!f.lineas.some(l => l.concepto.trim())) return setError('Añade al menos una línea')
    setBusy(true); setError(null)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={f.id ? `Editar ${f.numero}` : (f.tipo === 'factura' ? 'Nueva factura' : 'Nuevo presupuesto')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="helm-form-2">
          <Field label="Cliente del CRM (opcional)">
            <Select value={f.contact_id} onChange={e => elegirContacto(e.target.value)}>
              <option value="">— Escribir a mano —</option>
              {contactos.map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></Field>
        </div>
        <div className="helm-form-2">
          <Field label="Nombre / razón social *"><Input value={f.cliente_nombre} onChange={e => set('cliente_nombre', e.target.value)} /></Field>
          <Field label="NIF/CIF"><Input value={f.cliente_nif} onChange={e => set('cliente_nif', e.target.value)} /></Field>
        </div>
        <div className="helm-form-2">
          <Field label="Dirección"><Input value={f.cliente_direccion} onChange={e => set('cliente_direccion', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.cliente_email} onChange={e => set('cliente_email', e.target.value)} /></Field>
        </div>

        <div className="helm-drawer-section">Líneas</div>
        <div className="helm-doc-lineas">
          <div className="helm-doc-lineas-head">
            <span>Concepto</span><span>Cant.</span><span>Precio</span><span>Dto. %</span><span>Importe</span><span />
          </div>
          {f.lineas.map((l, i) => (
            <div className="helm-doc-linea" key={i}>
              <input className="helm-input" value={l.concepto} placeholder="Cuota mensual, alta, servicio…"
                onChange={e => setLinea(i, { concepto: e.target.value })} />
              <input className="helm-input" type="number" min="0" step="1" value={l.cantidad}
                onChange={e => setLinea(i, { cantidad: e.target.value })} />
              <input className="helm-input" type="number" min="0" step="0.01" value={l.precio}
                onChange={e => setLinea(i, { precio: e.target.value })} />
              <input className="helm-input" type="number" min="0" max="100" step="1" value={l.descuento_pct}
                onChange={e => setLinea(i, { descuento_pct: e.target.value })} />
              <span className="helm-doc-importe">{money(importeLinea(l))}</span>
              <button type="button" className="helm-btn sm" onClick={() => quitarLinea(i)} disabled={f.lineas.length === 1}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="helm-btn sm" onClick={añadirLinea} style={{ marginTop: 8 }}>
          <Plus size={13} /> Añadir línea
        </button>

        <div className="helm-doc-totales">
          <div>
            <label>IVA %</label>
            <input className="helm-input" type="number" min="0" max="100" step="1" value={f.iva_pct}
              onChange={e => set('iva_pct', e.target.value)} style={{ width: 80 }} />
          </div>
          <div className="helm-doc-totales-cifras">
            <span>Subtotal <b>{money(totales.subtotal)}</b></span>
            <span>IVA <b>{money(totales.iva)}</b></span>
            <span className="helm-doc-total-final">Total <b>{money(totales.total)}</b></span>
          </div>
        </div>

        <Field label="Notas"><Textarea rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} /></Field>

        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={busy}>
            {busy ? 'Guardando…' : <><Check size={15} /> Guardar</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Vista de impresión / PDF ────────────────────────────────────────────
// Sin librería de PDF: el navegador ya sabe imprimir a PDF, y es exactamente
// lo que usa el diagnóstico de Silvestre para su informe. Cero dependencias
// nuevas por un botón que el sistema operativo ya resuelve mejor que nosotros.
function VistaImpresion({ doc, marca, onClose }) {
  const [qr, setQr] = useState(null)
  useEffect(() => {
    if (!doc.hash) return
    QRCode.toDataURL(datosQR(doc), { margin: 0, width: 108 }).then(setQr).catch(() => {})
  }, [doc])

  function imprimir() {
    const antes = document.title
    document.title = `${doc.numero} · ${doc.cliente_nombre}`
    const restaurar = () => { document.title = antes; window.removeEventListener('afterprint', restaurar) }
    window.addEventListener('afterprint', restaurar)
    window.print()
  }
  function mailto() {
    if (!doc.cliente_email) return
    const asunto = `${doc.tipo === 'factura' ? 'Factura' : 'Presupuesto'} ${doc.numero}`
    const cuerpo = `Hola,\n\nAdjunto ${asunto.toLowerCase()} por importe de ${money(doc.total)}.\n\nUn saludo.`
    window.location.href = `mailto:${doc.cliente_email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
  }

  return (
    <div className="helm-doc-print-overlay">
      <div className="helm-doc-print-bar">
        <button className="helm-btn" onClick={onClose}>Cerrar</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="helm-btn" onClick={mailto} disabled={!doc.cliente_email} title={!doc.cliente_email ? 'Este documento no tiene email' : ''}>
            <Mail size={15} /> Enviar por email
          </button>
          <button className="helm-btn primary" onClick={imprimir}><Printer size={15} /> Imprimir / Guardar PDF</button>
        </div>
      </div>

      <div className="helm-doc-hoja">
        <div className="helm-doc-cab">
          {marca?.logo
            ? <img src={marca.logo} alt="" className="helm-doc-logo" />
            : <div className="helm-doc-logo-ini">{(marca?.name || 'H')[0].toUpperCase()}</div>}
          <div className="helm-doc-cab-marca">
            <b>{marca?.name}</b>
            {marca?.subtitle && <span>{marca.subtitle}</span>}
          </div>
          <div className="helm-doc-cab-num">
            <b>{doc.tipo === 'factura' ? 'FACTURA' : 'PRESUPUESTO'}</b>
            <span>{doc.numero}</span>
            <span>{fmtDate(doc.fecha)}</span>
          </div>
        </div>

        <div className="helm-doc-cliente">
          <b>{doc.cliente_nombre}</b>
          {doc.cliente_nif && <span>{doc.cliente_nif}</span>}
          {doc.cliente_direccion && <span>{doc.cliente_direccion}</span>}
          {doc.cliente_email && <span>{doc.cliente_email}</span>}
        </div>

        <table className="helm-doc-tabla">
          <thead>
            <tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Dto.</th><th>Importe</th></tr>
          </thead>
          <tbody>
            {doc.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.concepto}</td>
                <td>{l.cantidad}</td>
                <td>{money(l.precio)}</td>
                <td>{l.descuento_pct ? `${l.descuento_pct}%` : '—'}</td>
                <td>{money(importeLinea(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="helm-doc-totales-final">
          <span>Subtotal <b>{money(doc.subtotal)}</b></span>
          <span>IVA ({doc.iva_pct}%) <b>{money(doc.iva)}</b></span>
          <span className="helm-doc-total-final">TOTAL <b>{money(doc.total)}</b></span>
        </div>

        {doc.notas && <p className="helm-doc-notas">{doc.notas}</p>}

        {doc.hash && (
          <div className="helm-doc-verifactu">
            {qr && <img src={qr} alt="" width={72} height={72} />}
            <div>
              <b><ShieldCheck size={13} /> Registro íntegro, hash encadenado</b>
              <span>{doc.hash.slice(0, 24)}…</span>
              <small>No es una factura VeriFactu conforme: falta la firma electrónica del despacho y el envío a la AEAT.</small>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
