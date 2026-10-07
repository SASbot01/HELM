// Edición → Cobros: lo que se ha cobrado, lo que falta y lo que se retrasa.
//
// HELM no envía correos: «Recordar» apunta la fecha del recordatorio y deja el
// mensaje escrito para mandarlo por WhatsApp o por correo desde aquí mismo.
import { useMemo, useState } from 'react'
import { Plus, Check, Undo2, BellRing, Link2, Copy, MessageCircle, Mail, Trash2 } from 'lucide-react'
import { Panel, Empty, Modal, Field, Input, Select, MoneyInput, FormNote, Kpi } from '../ui'
import { edicionApi, METODOS, eur, estadoCobro, fechaCorta, cuandoLabel, mismoMes, hoyISO } from './comun'

const ETIQUETA = { cobrado: 'Cobrado', pendiente: 'Pendiente', atrasado: 'Atrasado' }
const VACIO = { concepto: '', importe: '', vence: '', cliente_id: '', pedido_id: '', metodo: 'transferencia', enlace: '' }

export default function Cobros({ clientId, datos, clientePor, pon, quita }) {
  const [filtro, setFiltro] = useState('abiertos')
  const [editando, setEditando] = useState(null)
  const [recordatorio, setRecordatorio] = useState(null)
  const [error, setError] = useState(null)

  const t = useMemo(() => {
    const suma = (xs) => xs.reduce((a, c) => a + Number(c.importe), 0)
    return {
      pendiente: suma(datos.cobros.filter(c => estadoCobro(c) === 'pendiente')),
      atrasado: suma(datos.cobros.filter(c => estadoCobro(c) === 'atrasado')),
      cobradoMes: suma(datos.cobros.filter(c => c.estado === 'cobrado' && mismoMes(c.cobrado_at))),
      acumulado: suma(datos.cobros.filter(c => c.estado === 'cobrado' && new Date(c.cobrado_at).getFullYear() === new Date().getFullYear())),
    }
  }, [datos.cobros])

  const lista = useMemo(() => datos.cobros
    .filter(c => filtro === 'todos' || (filtro === 'abiertos' ? c.estado !== 'cobrado' : estadoCobro(c) === filtro))
    .sort((a, b) => String(a.vence || '9').localeCompare(String(b.vence || '9'))), [datos.cobros, filtro])

  async function alternar(c) {
    setError(null)
    try { pon('cobros', (await edicionApi.cobrado(clientId, c.id, c.estado === 'cobrado')).cobro) } catch (e) { setError(e.message) }
  }
  async function recordar(c) {
    setError(null)
    try {
      const r = await edicionApi.recordar(clientId, c.id)
      pon('cobros', r.cobro); setRecordatorio({ cobro: r.cobro, mensaje: r.mensaje })
    } catch (e) { setError(e.message) }
  }
  async function borrar(c) {
    if (!window.confirm(`¿Borrar el cobro «${c.concepto}»?`)) return
    await edicionApi.borrar(clientId, 'cobro', c.id); quita('cobros', c.id)
  }

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-grid helm-kpis">
        <div className="helm-card helm-kpi"><div className="lbl">Pendiente</div><div className="val ed-oro">{eur(t.pendiente)}</div><div className="sub">dentro de plazo</div></div>
        <div className="helm-card helm-kpi"><div className="lbl">Atrasado</div><div className={'val' + (t.atrasado ? ' ed-rojo' : '')}>{eur(t.atrasado)}</div><div className="sub">con el vencimiento pasado</div></div>
        <Kpi label="Cobrado este mes" value={eur(t.cobradoMes)} accent />
        <Kpi label="Acumulado del año" value={eur(t.acumulado)} />
      </div>

      <Panel
        title="Cobros"
        action={<button className="helm-btn primary" onClick={() => setEditando(VACIO)}><Plus size={15} /> Nuevo cobro</button>}
      >
        <div className="ed-filtros">
          {[['abiertos', 'Por cobrar'], ['atrasado', 'Atrasados'], ['cobrado', 'Cobrados'], ['todos', 'Todos']].map(([k, l]) => (
            <button key={k} className={'helm-stagepill' + (filtro === k ? ' on cyan' : '')} onClick={() => setFiltro(k)}>{l}</button>
          ))}
        </div>
        {error && <FormNote>{error}</FormNote>}
        {lista.length === 0 ? (
          <Empty>{datos.cobros.length ? 'Nada en este filtro.' : 'Cada pedido entregado con precio abre su cobro solo. También puedes crearlos a mano.'}</Empty>
        ) : (
          <div className="ed-tabla-envoltura">
            <table className="helm-table ed-tabla">
              <thead>
                <tr><th>Concepto</th><th>Cliente</th><th>Vence</th><th>Método</th><th className="num">Importe</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {lista.map(c => {
                  const e = estadoCobro(c)
                  return (
                    <tr key={c.id} className={'r-' + e}>
                      <td><b>{c.concepto}</b>{c.recordado_at && <small className="ed-suave"> · recordado {fechaCorta(c.recordado_at.slice(0, 10))}</small>}</td>
                      <td>{clientePor.get(c.cliente_id)?.nombre || '—'}</td>
                      <td>{c.vence ? <>{fechaCorta(c.vence)} <small className="ed-suave">{c.estado !== 'cobrado' ? cuandoLabel(c.vence) : ''}</small></> : '—'}</td>
                      <td>{METODOS.find(m => m.key === c.metodo)?.label}</td>
                      <td className="num helm-money">{eur(c.importe)}</td>
                      <td><span className={'ed-cobro c-' + e}>{ETIQUETA[e]}</span></td>
                      <td className="ed-acc-fila">
                        <button className="helm-btn" title={c.estado === 'cobrado' ? 'Deshacer' : 'Marcar como pagado'} onClick={() => alternar(c)}>
                          {c.estado === 'cobrado' ? <Undo2 size={14} /> : <><Check size={14} /> Pagado</>}
                        </button>
                        {c.estado !== 'cobrado' && <button className="helm-btn" title="Recordatorio de cobro" onClick={() => recordar(c)}><BellRing size={14} /></button>}
                        {c.enlace && <button className="helm-btn" title="Copiar enlace de cobro" onClick={() => navigator.clipboard?.writeText(c.enlace)}><Link2 size={14} /></button>}
                        <button className="helm-btn" title="Editar" onClick={() => setEditando({ ...c, importe: String(c.importe) })}>Editar</button>
                        <button className="helm-btn" title="Borrar" onClick={() => borrar(c)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editando && (
        <CobroForm
          clientId={clientId} datos={datos} inicial={editando}
          onClose={() => setEditando(null)} onGuardado={(c) => { pon('cobros', c); setEditando(null) }}
        />
      )}
      {recordatorio && <Recordatorio {...recordatorio} onClose={() => setRecordatorio(null)} />}
    </div>
  )
}

function CobroForm({ clientId, datos, inicial, onClose, onGuardado }) {
  const [f, setF] = useState({ ...VACIO, ...inicial, cliente_id: inicial.cliente_id || '', pedido_id: inicial.pedido_id || '', vence: inicial.vence || '' })
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  function eligePedido(id) {
    const p = datos.pedidos.find(x => x.id === id)
    setF(s => ({ ...s, pedido_id: id, concepto: s.concepto || p?.titulo || '', importe: s.importe || (p?.precio ? String(p.precio) : ''), cliente_id: s.cliente_id || p?.cliente_id || '' }))
  }

  async function guardar(e) {
    e.preventDefault(); setError(null)
    try {
      const r = await edicionApi.cobro(clientId, { ...f, importe: Number(f.importe) || 0, cliente_id: f.cliente_id || null, pedido_id: f.pedido_id || null })
      onGuardado(r.cobro)
    } catch (err) { setError(err.message) }
  }

  return (
    <Modal title={inicial.id ? 'Editar cobro' : 'Nuevo cobro'} onClose={onClose}>
      <form className="helm-grid" style={{ gap: 12 }} onSubmit={guardar}>
        <Field label="Pedido">
          <Select value={f.pedido_id} onChange={e => eligePedido(e.target.value)}>
            <option value="">Sin pedido (retainer, pack…)</option>
            {datos.pedidos.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </Select>
        </Field>
        <Field label="Concepto *"><Input value={f.concepto} onChange={e => set('concepto', e.target.value)} required placeholder="Retainer octubre" /></Field>
        <div className="ed-form-2">
          <Field label="Importe"><MoneyInput value={f.importe} onChange={v => set('importe', v)} placeholder="0" /></Field>
          <Field label="Vence"><Input type="date" value={f.vence} min={inicial.id ? undefined : hoyISO()} onChange={e => set('vence', e.target.value)} /></Field>
        </div>
        <div className="ed-form-2">
          <Field label="Cliente">
            <Select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
              <option value="">Sin cliente</option>
              {datos.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Método">
            <Select value={f.metodo} onChange={e => set('metodo', e.target.value)}>
              {METODOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Enlace de cobro" hint="El de Stripe, el IBAN o el número de Bizum: va en el recordatorio.">
          <Input value={f.enlace} onChange={e => set('enlace', e.target.value)} placeholder="https://buy.stripe.com/… · ES00 0000 … · Bizum 600 000 000" />
        </Field>
        {error && <FormNote>{error}</FormNote>}
        <div className="ed-form-acc">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={!f.concepto.trim()}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

function Recordatorio({ mensaje, onClose }) {
  const [copiado, setCopiado] = useState(false)
  const txt = encodeURIComponent(mensaje)
  return (
    <Modal title="Recordatorio de cobro" onClose={onClose}>
      <p className="ed-suave">Apuntado. Mándalo por donde hables con el cliente:</p>
      <p className="ed-pre ed-mensaje">{mensaje}</p>
      <div className="ed-form-acc">
        <button className="helm-btn" onClick={() => { navigator.clipboard?.writeText(mensaje); setCopiado(true) }}>
          {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <a className="helm-btn" href={`mailto:?subject=${encodeURIComponent('Recordatorio de pago')}&body=${txt}`}><Mail size={14} /> Correo</a>
        <a className="helm-btn primary" href={`https://wa.me/?text=${txt}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>
      </div>
    </Modal>
  )
}
