// HELM — Documentos: presupuestos y facturas, y el material comercial.
//
// Las facturas viven en helm_documentos_venta. El material comercial son los
// PDF de la Biblioteca (helm_library) con la etiqueta `comercial`: mismo
// archivo y mismo enlace que ya se abre desde allí. Setter y closer entran
// a esta sección solo por ese material; sin derecho a la facturación no se
// cargan facturas ni presupuestos.
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
import { supabase, fetchRows, insertRow, updateRow, deleteRow, fmtDate, money, brandOf } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Textarea, Kpi, Tabs, FormNote } from '../ui'
import {
  siguienteNumero, lineaVacia, importeLinea, calcularTotales, IVA_DEFECTO, ESTADOS, estadoLabel,
} from '../documentos/calculo'
import { emitirConHash, datosQR } from '../documentos/verifactu'
import { enlaceDelPerfil, esMaterialComercial, pestañasDeDocumentos } from '../documentos/material'
import { sesionHelm } from '../permisos'

export default function Documentos({ clientId, client, veFacturacion = true }) {
  // null = todavía no ha elegido: con facturación se abre Facturas; sin ella,
  // el material. No hace falta un efecto para forzarlo.
  const [tipoPedido, setTipoPedido] = useState(null)
  const tipo = !veFacturacion ? 'material' : (tipoPedido || 'factura')
  const [docs, setDocs] = useState(null)
  const [contactos, setContactos] = useState([])
  const [edit, setEdit] = useState(null)     // documento en el editor ({} = nuevo)
  const [ver, setVer] = useState(null)       // documento en la vista de impresión
  const [verLista, setVerLista] = useState(false) // listado completo para imprimir
  const [error, setError] = useState(null)

  // El enlace de pago (Stripe) de quien está en la sesión. Va impreso en SUS
  // facturas y presupuestos para que el cliente pague ahí. Se guarda por
  // persona en helm_team.payment_link; cada comercial pone el suyo.
  const [miLink, setMiLink] = useState('')
  useEffect(() => {
    const s = sesionHelm()
    if (!s.helmTeamId) { setMiLink(''); return }
    supabase.from('helm_team').select('payment_link').eq('id', s.helmTeamId).maybeSingle()
      .then(({ data }) => setMiLink((data?.payment_link || '').trim()))
  }, [clientId])

  const pestañas = useMemo(
    () => pestañasDeDocumentos(veFacturacion).map(t => ({ ...t, icon: <FileText size={15} /> })),
    [veFacturacion],
  )

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([
      supabase.from('helm_documentos_venta').select('*').eq('client_id', clientId).order('fecha', { ascending: false }),
      fetchRows('crm_contacts', clientId, { limit: 2000 }),
    ])
    setDocs(d.data || [])
    setContactos(c || [])
  }, [clientId])

  // Sin derecho a facturar no se pide helm_documentos_venta: un setter no
  // debe ni cargar las facturas del perfil. El material sale de helm_library
  // y solo cuando se abre esa pestaña.
  useEffect(() => {
    if (!veFacturacion) return
    load()
  }, [load, veFacturacion])

  function cambiarTipo(key) {
    if (!veFacturacion && key !== 'material') return
    setTipoPedido(key)
  }

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
      setTipoPedido('factura')
    } catch (e) { setError('No se pudo convertir: ' + e.message) }
  }

  async function borrar(d) {
    if (!confirm(`¿Eliminar ${d.numero}? No se puede deshacer.`)) return
    try { await deleteRow('helm_documentos_venta', d.id); load() }
    catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      {veFacturacion && tipo === 'factura' && (
        <div className="helm-grid helm-kpis">
          <Kpi label="Facturado" value={money(kpis.facturado)} accent />
          <Kpi label="Pendiente de cobro" value={money(kpis.pendiente)} />
          <Kpi label="Vencidas" value={kpis.vencidas} sub={kpis.vencidas ? 'requiere atención' : undefined} />
        </div>
      )}

      {error && <FormNote>{error}</FormNote>}

      {veFacturacion && tipo === 'factura' && docs && docs.some(d => d.tipo === 'factura') && (
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

      <Tabs tabs={pestañas} value={tipo} onChange={cambiarTipo} />

      {tipo === 'material' ? (
        <MaterialComercial key={clientId} clientId={clientId} />
      ) : (
      <Panel
        title={tipo === 'factura' ? 'Facturas' : 'Presupuestos'}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="helm-btn" onClick={() => setVerLista(true)} disabled={!delTipo.length}>
              <Printer size={15} /> Exportar PDF
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
      )}

      {veFacturacion && edit && (
        <EditorModal
          doc={edit} contactos={contactos}
          onClose={() => setEdit(null)} onSave={guardar}
        />
      )}
      {veFacturacion && ver && <VistaImpresion doc={ver} marca={marca} pagoLink={miLink} onClose={() => setVer(null)} />}
      {veFacturacion && verLista && <VistaImpresionLista docs={delTipo} tipo={tipo} marca={marca} onClose={() => setVerLista(false)} />}
    </div>
  )
}

// PDF de helm_library con la etiqueta `comercial`. El enlace es el mismo
// file_url que ya enseña la Biblioteca (el bucket público, servido por la
// pasarela). La consulta va por client_id: en HELM el perfil es esa columna.
function MaterialComercial({ clientId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    // No se filtra la etiqueta en el servidor: `tags` es jsonb y
    // `.contains('tags', [...])` manda un literal de array de Postgres
    // (`cs.{comercial}`), que jsonb rechaza con «invalid input syntax for
    // type json». Además la Biblioteca guarda `tags` en varios formatos
    // (array jsonb, texto «ventas, comercial», array serializado). Por eso
    // se trae el material del perfil y filtra `esMaterialComercial`, que ya
    // entiende todos esos formatos y además exige PDF + enlace abrible.
    supabase.from('helm_library')
      .select('id, client_id, title, file_name, file_url, tags')
      .eq('client_id', clientId)
      .order('title', { ascending: true })
      .limit(500)
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) {
          setError(e.message)
          setRows([])
          return
        }
        const lista = (data || [])
          .filter(d => d.client_id === clientId && esMaterialComercial(d))
          .map(d => ({ ...d, href: enlaceDelPerfil(d, clientId) }))
          .filter(d => d.href)
        setRows(lista)
      })
    return () => { vivo = false }
  }, [clientId])

  return (
    <Panel title="Material comercial">
      {error && <FormNote>{error}</FormNote>}
      {rows === null ? <Empty>Cargando…</Empty>
        : rows.length === 0 ? (
          <Empty>
            Todavía no hay PDF de venta. En la Biblioteca, quien lleva el negocio marca un PDF como material comercial y aparece aquí.
          </Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr><th>Título</th><th>Archivo</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id}>
                    <td><b>{d.title}</b></td>
                    <td>{d.file_name || 'PDF'}</td>
                    <td>
                      <div className="helm-curso-acts">
                        <a className="helm-btn sm" href={d.href} target="_blank" rel="noreferrer">
                          <FileText size={13} /> Abrir
                        </a>
                        <a className="helm-btn sm" href={d.href} download={d.file_name || 'material.pdf'} rel="noreferrer">
                          <Download size={13} /> Descargar
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Panel>
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
function VistaImpresion({ doc, marca, pagoLink, onClose }) {
  const [qr, setQr] = useState(null)
  const [pagoQr, setPagoQr] = useState(null)
  useEffect(() => {
    if (!doc.hash) return
    QRCode.toDataURL(datosQR(doc), { margin: 0, width: 108 }).then(setQr).catch(() => {})
  }, [doc])
  useEffect(() => {
    if (!pagoLink) { setPagoQr(null); return }
    QRCode.toDataURL(pagoLink, { margin: 0, width: 108 }).then(setPagoQr).catch(() => setPagoQr(null))
  }, [pagoLink])

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

        {pagoLink && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 18, padding: '12px 14px', border: '1px solid var(--border, #e7dccb)', borderRadius: 10 }}>
            {pagoQr && <img src={pagoQr} alt="" width={84} height={84} style={{ flex: '0 0 auto' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <b>Pagar {doc.tipo === 'factura' ? 'esta factura' : 'este presupuesto'}</b>
              <span style={{ fontSize: 12, color: 'var(--text-mut, #6b6b6b)' }}>Escanea el QR o entra en el enlace y pon el importe:</span>
              <a href={pagoLink} style={{ wordBreak: 'break-all', fontSize: 12 }}>{pagoLink}</a>
            </div>
          </div>
        )}

        {doc.notas && <p className="helm-doc-notas">{doc.notas}</p>}

        {doc.hash && (
          <div className="helm-doc-verifactu">
            {qr && <img src={qr} alt="" width={72} height={72} />}
            <div>
              <b><ShieldCheck size={13} /> Registro íntegro, hash encadenado</b>
              <span>{doc.hash.slice(0, 24)}…</span>
              <small>No es una factura VeriFactu conforme: falta la firma electrónica del despacho y el envío a la AEAT. La obligación real entra el 1 ene 2027 (Sociedades) / 1 jul 2027 (autónomos).</small>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Listado completo a PDF ─────────────────────────────────────────────────
// Reemplaza el viejo "Exportar CSV": misma hoja branded que una factura, pero
// con la tabla de todos los documentos del tipo. Imprime igual, con el
// window.print() del navegador (cero dependencias nuevas).
function VistaImpresionLista({ docs, tipo, marca, onClose }) {
  function imprimir() {
    const antes = document.title
    document.title = `${tipo === 'factura' ? 'Facturas' : 'Presupuestos'} · ${marca?.name || ''}`
    const restaurar = () => { document.title = antes; window.removeEventListener('afterprint', restaurar) }
    window.addEventListener('afterprint', restaurar)
    window.print()
  }
  const total = (docs || []).reduce((a, d) => a + Number(d.total || 0), 0)

  return (
    <div className="helm-doc-print-overlay">
      <div className="helm-doc-print-bar">
        <button className="helm-btn" onClick={onClose}>Cerrar</button>
        <button className="helm-btn primary" onClick={imprimir}><Printer size={15} /> Imprimir / Guardar PDF</button>
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
            <b>{tipo === 'factura' ? 'FACTURAS' : 'PRESUPUESTOS'}</b>
            <span>{fmtDate(new Date().toISOString().slice(0, 10))}</span>
            <span>{(docs || []).length} documento{(docs || []).length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <table className="helm-doc-tabla">
          <thead>
            <tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Total</th></tr>
          </thead>
          <tbody>
            {(docs || []).map(d => (
              <tr key={d.id}>
                <td>{d.numero}</td>
                <td>{d.cliente_nombre}</td>
                <td>{fmtDate(d.fecha)}</td>
                <td>{estadoLabel(d.tipo, d.estado)}</td>
                <td>{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="helm-doc-totales-final">
          <span className="helm-doc-total-final">TOTAL {tipo === 'factura' ? 'facturado' : 'presupuestado'} <b>{money(total)}</b></span>
        </div>
      </div>
    </div>
  )
}
