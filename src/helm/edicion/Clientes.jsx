// Edición → Clientes: los canales y marcas para los que se edita.
import { useMemo, useState } from 'react'
import { Plus, Search, FolderOpen, ScrollText, Crown, Pencil, Trash2 } from 'lucide-react'
import { Panel, Empty, Modal, Drawer, Field, Input, Textarea, Select, MoneyInput, FormNote } from '../ui'
import {
  edicionApi, CONTRATOS, contratoLabel, eur, estadoCobro, estadoLabel, fechaCorta, formatoCorto,
} from './comun'

const ESTADOS_CLIENTE = [
  { key: 'activo', label: 'Activo' }, { key: 'pausa', label: 'En pausa' }, { key: 'fin', label: 'Terminado' },
]
const VACIO = { nombre: '', canal: '', contrato: 'por_video', tarifa: '', estado: 'activo', vip: false, drive_url: '', brief_url: '', notas: '' }

export default function Clientes({ clientId, datos, pon, quita, abrirPedido }) {
  const [q, setQ] = useState('')
  const [contrato, setContrato] = useState('')
  const [estado, setEstado] = useState('activo')
  const [editando, setEditando] = useState(null)
  const [ficha, setFicha] = useState(null)

  // El balance de cada cliente sale de sus cobros; el volumen, de sus pedidos.
  const balance = useMemo(() => {
    const acc = {}
    for (const c of datos.cobros) {
      if (!c.cliente_id) continue
      const b = (acc[c.cliente_id] ||= { cobrado: 0, pendiente: 0, atrasado: 0, pedidos: 0 })
      const e = estadoCobro(c)
      b[e === 'cobrado' ? 'cobrado' : 'pendiente'] += Number(c.importe)
      if (e === 'atrasado') b.atrasado += Number(c.importe)
    }
    for (const p of datos.pedidos) if (p.cliente_id) (acc[p.cliente_id] ||= { cobrado: 0, pendiente: 0, atrasado: 0, pedidos: 0 }).pedidos++
    return acc
  }, [datos])

  const lista = useMemo(() => datos.clientes.filter(c =>
    (!estado || c.estado === estado) && (!contrato || c.contrato === contrato)
    && (!q || `${c.nombre} ${c.canal}`.toLowerCase().includes(q.toLowerCase()))), [datos.clientes, q, contrato, estado])

  return (
    <Panel
      title="Clientes"
      action={<button className="helm-btn primary" onClick={() => setEditando(VACIO)}><Plus size={15} /> Nuevo cliente</button>}
    >
      <div className="ed-filtros">
        <label className="helm-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, canal o marca" /></label>
        <select className="helm-input ed-select" value={contrato} onChange={e => setContrato(e.target.value)}>
          <option value="">Todos los contratos</option>
          {CONTRATOS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className="helm-input ed-select" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos</option>
          {ESTADOS_CLIENTE.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <Empty>{datos.clientes.length ? 'Ningún cliente con estos filtros.' : 'Da de alta a tus clientes: su contrato y su tarifa rellenan solos cada pedido.'}</Empty>
      ) : (
        <div className="ed-clientes">
          {lista.map(c => {
            const b = balance[c.id] || { cobrado: 0, pendiente: 0, atrasado: 0, pedidos: 0 }
            return (
              <article key={c.id} className={'ed-cliente' + (c.vip ? ' vip' : '')} onClick={() => setFicha(c)}>
                <header>
                  <div className="ed-avatar">{c.nombre.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <b>{c.nombre} {c.vip && <span className="ed-vip"><Crown size={11} /> VIP</span>}</b>
                    <small>{c.canal || 'Sin canal'}</small>
                  </div>
                </header>
                <div className="ed-cliente-contrato">
                  <span>{contratoLabel(c.contrato)}</span>
                  <b>{eur(c.tarifa)}<small>{c.contrato === 'retainer' ? '/mes' : c.contrato === 'pack' ? '/pack' : '/vídeo'}</small></b>
                </div>
                <div className="ed-cliente-balance">
                  <div><small>Cobrado</small><b>{eur(b.cobrado)}</b></div>
                  <div><small>Pendiente</small><b className={b.atrasado ? 'ed-rojo' : b.pendiente ? 'ed-oro' : ''}>{eur(b.pendiente)}</b></div>
                  <div><small>Pedidos</small><b>{b.pedidos}</b></div>
                </div>
                <footer onClick={e => e.stopPropagation()}>
                  {c.drive_url && <a href={c.drive_url} target="_blank" rel="noopener noreferrer"><FolderOpen size={13} /> Drive</a>}
                  {c.brief_url && <a href={c.brief_url} target="_blank" rel="noopener noreferrer"><ScrollText size={13} /> Brief</a>}
                  <span className={'ed-cliente-estado s-' + c.estado}>{ESTADOS_CLIENTE.find(x => x.key === c.estado)?.label}</span>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {editando && (
        <ClienteForm
          clientId={clientId} inicial={editando}
          onClose={() => setEditando(null)}
          onGuardado={(c) => { pon('clientes', c); setEditando(null); if (ficha?.id === c.id) setFicha(c) }}
        />
      )}
      {ficha && (
        <FichaCliente
          cliente={datos.clientes.find(x => x.id === ficha.id) || ficha} datos={datos}
          onClose={() => setFicha(null)} abrirPedido={(p) => { setFicha(null); abrirPedido(p) }}
          onEditar={() => setEditando(ficha)}
          onBorrar={async () => {
            if (!window.confirm(`¿Borrar a ${ficha.nombre}? Sus pedidos y cobros se quedan, sin cliente.`)) return
            await edicionApi.borrar(clientId, 'cliente', ficha.id)
            quita('clientes', ficha.id); setFicha(null)
          }}
        />
      )}
    </Panel>
  )
}

function ClienteForm({ clientId, inicial, onClose, onGuardado }) {
  const [f, setF] = useState({ ...VACIO, ...inicial, tarifa: inicial.tarifa != null ? String(inicial.tarifa) : '' })
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  async function guardar(e) {
    e.preventDefault(); setError(null)
    try {
      const r = await edicionApi.cliente(clientId, { ...f, tarifa: Number(f.tarifa) || 0 })
      onGuardado(r.cliente)
    } catch (err) { setError(err.message) }
  }

  return (
    <Modal title={inicial.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <form className="helm-grid" style={{ gap: 12 }} onSubmit={guardar}>
        <Field label="Nombre *"><Input value={f.nombre} onChange={e => set('nombre', e.target.value)} required placeholder="Laura Méndez" /></Field>
        <Field label="Canal o marca"><Input value={f.canal} onChange={e => set('canal', e.target.value)} placeholder="@lauramendez · YouTube" /></Field>
        <div className="ed-form-2">
          <Field label="Contrato">
            <Select value={f.contrato} onChange={e => set('contrato', e.target.value)}>
              {CONTRATOS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Tarifa pactada"><MoneyInput value={f.tarifa} onChange={v => set('tarifa', v)} placeholder="0" /></Field>
        </div>
        <div className="ed-form-2">
          <Field label="Estado">
            <Select value={f.estado} onChange={e => set('estado', e.target.value)}>
              {ESTADOS_CLIENTE.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Cliente VIP">
            <label className="ed-check"><input type="checkbox" checked={f.vip} onChange={e => set('vip', e.target.checked)} /> Prioridad y trato VIP</label>
          </Field>
        </div>
        <Field label="Carpeta de Drive / Dropbox"><Input value={f.drive_url} onChange={e => set('drive_url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Brief"><Input value={f.brief_url} onChange={e => set('brief_url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Notas"><Textarea value={f.notas} onChange={e => set('notas', e.target.value)} /></Field>
        {error && <FormNote>{error}</FormNote>}
        <div className="ed-form-acc">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={!f.nombre.trim()}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

function FichaCliente({ cliente, datos, onClose, abrirPedido, onEditar, onBorrar }) {
  const pedidos = datos.pedidos.filter(p => p.cliente_id === cliente.id)
    .sort((a, b) => String(b.entrega || '').localeCompare(String(a.entrega || '')))
  const cobros = datos.cobros.filter(c => c.cliente_id === cliente.id)
  const cobrado = cobros.filter(c => c.estado === 'cobrado').reduce((a, c) => a + Number(c.importe), 0)
  const pendiente = cobros.filter(c => c.estado !== 'cobrado').reduce((a, c) => a + Number(c.importe), 0)

  return (
    <Drawer
      title={cliente.nombre}
      sub={[cliente.canal, contratoLabel(cliente.contrato), `${eur(cliente.tarifa)}`].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={(
        <div className="ed-form-acc">
          <button className="helm-btn" onClick={onBorrar}><Trash2 size={14} /> Borrar</button>
          <button className="helm-btn primary" onClick={onEditar}><Pencil size={14} /> Editar</button>
        </div>
      )}
    >
      <dl className="ed-datos">
        <div><dt>Cobrado</dt><dd>{eur(cobrado)}</dd></div>
        <div><dt>Pendiente</dt><dd className={pendiente ? 'ed-oro' : ''}>{eur(pendiente)}</dd></div>
        <div><dt>Pedidos</dt><dd>{pedidos.length}</dd></div>
      </dl>
      {cliente.notas && <section className="ed-bloque"><h4>Notas</h4><p className="ed-pre">{cliente.notas}</p></section>}
      <section className="ed-bloque">
        <h4>Historial de pedidos</h4>
        {pedidos.length === 0 ? <p className="ed-suave">Aún sin pedidos.</p> : (
          <ul className="ed-historial">
            {pedidos.map(p => (
              <li key={p.id} onClick={() => abrirPedido(p)}>
                <span>{fechaCorta(p.entrega)}</span>
                <b>{p.titulo}</b>
                <small>{formatoCorto(p.formato)}</small>
                <span className={'ed-estado e-' + p.estado}>{estadoLabel(p.estado)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Drawer>
  )
}
