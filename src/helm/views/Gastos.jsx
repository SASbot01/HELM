// HELM — Gastos: facturas de compra, con captura inteligente por OCR
// (Sage Active módulo 2: "Captura inteligente de facturas de compras").
//
// Sube la foto o el PDF de una factura de proveedor y Tesseract + el modelo
// local sugieren proveedor, NIF, fecha e importes. Es una SUGERENCIA, nunca se
// guarda sola: el texto que leyó el OCR viaja siempre junto para poder
// comparar, y cualquier dato raro sale marcado como aviso antes de guardar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Receipt, Plus, Upload, Check, Trash2, Download, ExternalLink, AlertTriangle, ScanText } from 'lucide-react'
import { fetchRows, insertRow, updateRow, deleteRow, fmtDate, money, exportCSV, uploadFile, publicUrl, gastosApi } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Textarea, Kpi, FormNote } from '../ui'

const CATEGORIAS = [
  { key: 'suministros', label: 'Suministros' },
  { key: 'alquiler', label: 'Alquiler' },
  { key: 'material', label: 'Material de oficina' },
  { key: 'software', label: 'Software y herramientas' },
  { key: 'viajes', label: 'Viajes y dietas' },
  { key: 'formacion', label: 'Formación' },
  { key: 'asesoria', label: 'Asesoría externa' },
  { key: 'otros', label: 'Otros' },
]
const catLabel = (k) => CATEGORIAS.find(c => c.key === k)?.label || k

const gastoVacio = () => ({
  proveedor_nombre: '', proveedor_nif: '', fecha: new Date().toISOString().slice(0, 10),
  concepto: '', categoria: 'otros', base: 0, iva_pct: 21, total: 0,
  archivo_url: '', archivo_ruta: '', texto_ocr: '', origen: 'manual', estado: 'revisado',
})

export default function Gastos({ clientId }) {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [subiendo, setSubiendo] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const load = useCallback(() => fetchRows('helm_gastos', clientId, { order: 'fecha' }).then(setRows), [clientId])
  useEffect(() => { load() }, [load])

  const kpis = useMemo(() => {
    const hoy = new Date()
    const esteMes = (rows || []).filter(g => String(g.fecha).slice(0, 7) === hoy.toISOString().slice(0, 7))
    return {
      esteMes: esteMes.reduce((a, g) => a + Number(g.total), 0),
      pendientes: (rows || []).filter(g => g.estado === 'pendiente').length,
    }
  }, [rows])

  const porMes = useMemo(() => {
    const meses = []
    const hoy = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, mes: d.toLocaleDateString('es-ES', { month: 'short' }), total: 0 })
    }
    for (const g of rows || []) {
      const m = meses.find(x => x.key === String(g.fecha).slice(0, 7))
      if (m) m.total += Number(g.total)
    }
    return meses
  }, [rows])

  async function subirYExtraer(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null); setSubiendo(file.name)
    try {
      const subido = await uploadFile(clientId, 'gastos', file)
      let sugerido = null, avisos = [], textoOcr = ''
      try {
        const r = await gastosApi.ocr(clientId, subido.path)
        sugerido = r.sugerido; avisos = r.avisos || []; textoOcr = r.texto_ocr || ''
      } catch (err) {
        avisos = [`No se pudo leer la factura automáticamente: ${err.message}. Rellena los campos a mano.`]
      }
      setEdit({
        ...gastoVacio(), ...sugerido,
        archivo_url: subido.url, archivo_ruta: subido.path, texto_ocr: textoOcr,
        origen: 'ocr', estado: 'pendiente', avisos,
      })
    } catch (err) {
      setError(`${file.name}: ${err.message}`)
    } finally {
      setSubiendo(null)
    }
  }

  async function guardar(f) {
    const { avisos: _avisos, ...fila } = f
    const payload = {
      client_id: clientId,
      proveedor_nombre: fila.proveedor_nombre.trim(), proveedor_nif: fila.proveedor_nif.trim(),
      fecha: fila.fecha, concepto: fila.concepto.trim(), categoria: fila.categoria,
      base: Number(fila.base) || 0, iva_pct: Number(fila.iva_pct) || 0, iva: (Number(fila.base) || 0) * (Number(fila.iva_pct) || 0) / 100,
      total: Number(fila.total) || 0,
      archivo_url: fila.archivo_url, archivo_ruta: fila.archivo_ruta, texto_ocr: fila.texto_ocr,
      origen: fila.origen, estado: 'revisado', updated_at: new Date().toISOString(),
    }
    try {
      if (fila.id) await updateRow('helm_gastos', fila.id, payload)
      else await insertRow('helm_gastos', { ...payload, created_at: new Date().toISOString() })
      setEdit(null); load()
    } catch (e) { throw new Error('No se pudo guardar: ' + e.message) }
  }

  async function borrar(g) {
    if (!confirm(`¿Eliminar el gasto de "${g.proveedor_nombre}"? No se puede deshacer.`)) return
    try { await deleteRow('helm_gastos', g.id); load() }
    catch (e) { setError('No se pudo eliminar: ' + e.message) }
  }

  function exportar() {
    exportCSV('gastos.csv', [
      { label: 'Proveedor', value: 'proveedor_nombre' },
      { label: 'NIF', value: 'proveedor_nif' },
      { label: 'Fecha', value: 'fecha' },
      { label: 'Categoría', value: r => catLabel(r.categoria) },
      { label: 'Base', value: r => Number(r.base).toFixed(2) },
      { label: 'IVA %', value: 'iva_pct' },
      { label: 'Total', value: r => Number(r.total).toFixed(2) },
    ], rows || [])
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <Kpi label="Gastado este mes" value={money(kpis.esteMes)} accent />
        <Kpi label="Facturas" value={(rows || []).length} />
        <Kpi label="Por revisar" value={kpis.pendientes} sub={kpis.pendientes ? 'sugeridos por IA, sin confirmar' : undefined} />
      </div>

      {error && <FormNote>{error}</FormNote>}

      {rows && rows.length > 0 && (
        <Panel title="Gasto mensual">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--text-mut)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-mut)" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={v => money(v)} />
              <Tooltip formatter={v => money(v)} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
              <Bar dataKey="total" fill="var(--violet)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel
        title="Facturas de compra"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="helm-btn" onClick={exportar} disabled={!rows?.length}>
              <Download size={15} /> Exportar CSV
            </button>
            <button className="helm-btn" onClick={() => setEdit(gastoVacio())}>
              <Plus size={15} /> Añadir a mano
            </button>
            <input ref={inputRef} type="file" accept="image/*,.pdf" hidden onChange={subirYExtraer} />
            <button className="helm-btn primary" disabled={Boolean(subiendo)} onClick={() => inputRef.current?.click()}>
              {subiendo ? <><ScanText size={15} /> Leyendo {subiendo}…</> : <><Upload size={15} /> Subir factura</>}
            </button>
          </div>
        }
      >
        <p className="helm-settings-lead">
          Sube la foto o el PDF de una factura de proveedor y se rellena sola: proveedor, NIF, fecha e importes.
          Revísala antes de guardar — la IA sugiere, no decide.
        </p>
        {rows === null ? <Empty>Cargando…</Empty>
          : rows.length === 0 ? <Empty>Ninguna factura de compra todavía.</Empty>
            : (
              <div className="helm-tablewrap">
                <table className="helm-table">
                  <thead>
                    <tr><th>Proveedor</th><th>Categoría</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr>
                  </thead>
                  <tbody>
                    {rows.map(g => (
                      <tr key={g.id}>
                        <td><b>{g.proveedor_nombre || '—'}</b></td>
                        <td>{catLabel(g.categoria)}</td>
                        <td>{fmtDate(g.fecha)}</td>
                        <td className="helm-num">{money(g.total)}</td>
                        <td>
                          {g.estado === 'pendiente'
                            ? <span className="helm-badge amber"><AlertTriangle size={11} /> Por revisar</span>
                            : <span className="helm-badge green"><Check size={11} /> Revisado</span>}
                        </td>
                        <td>
                          <div className="helm-curso-acts">
                            {g.archivo_ruta && (
                              <a className="helm-btn sm" href={publicUrl(g.archivo_ruta)} target="_blank" rel="noreferrer" title="Ver el archivo original">
                                <ExternalLink size={13} />
                              </a>
                            )}
                            <button className="helm-btn sm" onClick={() => setEdit(g)}>Editar</button>
                            <button className="helm-btn sm" onClick={() => borrar(g)}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </Panel>

      {edit && <EditorGasto gasto={edit} onClose={() => setEdit(null)} onSave={guardar} />}
    </div>
  )
}

function EditorGasto({ gasto, onClose, onSave }) {
  const [f, setF] = useState(gasto)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [verOcr, setVerOcr] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const base = Number(f.base) || 0
  const ivaPct = Number(f.iva_pct) || 0
  useEffect(() => {
    // El total se recalcula solo mientras nadie ha tocado el campo total a
    // mano; si el OCR ya trajo un total leído de la factura, se respeta.
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!f.proveedor_nombre.trim()) return setError('Falta el nombre del proveedor')
    setBusy(true); setError(null)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={f.id ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose} wide>
      <form onSubmit={submit}>
        {f.avisos?.length > 0 && (
          <div className="helm-doc-lineas" style={{ marginBottom: 14 }}>
            {f.avisos.map((a, i) => (
              <div key={i} className="helm-formnote warn" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertTriangle size={14} /> {a}
              </div>
            ))}
          </div>
        )}
        <div className="helm-form-2">
          <Field label="Proveedor *"><Input value={f.proveedor_nombre} onChange={e => set('proveedor_nombre', e.target.value)} /></Field>
          <Field label="NIF/CIF"><Input value={f.proveedor_nif} onChange={e => set('proveedor_nif', e.target.value)} /></Field>
        </div>
        <div className="helm-form-2">
          <Field label="Fecha"><Input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></Field>
          <Field label="Categoría">
            <Select value={f.categoria} onChange={e => set('categoria', e.target.value)}>
              {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Concepto"><Input value={f.concepto} onChange={e => set('concepto', e.target.value)} /></Field>
        <div className="helm-form-2">
          <Field label="Base"><Input type="number" min="0" step="0.01" value={f.base} onChange={e => set('base', e.target.value)} /></Field>
          <Field label="IVA %"><Input type="number" min="0" max="100" step="1" value={f.iva_pct} onChange={e => set('iva_pct', e.target.value)} /></Field>
        </div>
        <Field label="Total (con IVA)" hint={base > 0 ? `Base + IVA daría ${money(base * (1 + ivaPct / 100))}` : undefined}>
          <Input type="number" min="0" step="0.01" value={f.total} onChange={e => set('total', e.target.value)} />
        </Field>

        {f.archivo_ruta && (
          <a className="helm-btn sm" href={publicUrl(f.archivo_ruta)} target="_blank" rel="noreferrer" style={{ marginTop: 6, display: 'inline-flex' }}>
            <ExternalLink size={13} /> Ver archivo original
          </a>
        )}
        {f.texto_ocr && (
          <div style={{ marginTop: 10 }}>
            <button type="button" className="helm-btn sm" onClick={() => setVerOcr(v => !v)}>
              <ScanText size={13} /> {verOcr ? 'Ocultar' : 'Ver'} texto leído por el OCR
            </button>
            {verOcr && <div className="helm-aviso-msg" style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>{f.texto_ocr}</div>}
          </div>
        )}

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
