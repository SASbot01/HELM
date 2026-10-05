// Edición → alta y ficha de un pedido.
import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, ScrollText, Trash2, Pencil, Check, Send, Inbox, Eye, EyeOff } from 'lucide-react'
import { Modal, Drawer, Field, Input, Textarea, Select, MoneyInput, CountInput, FormNote } from '../ui'
import {
  edicionApi, ESTADOS, FORMATOS, FASES, TIPOS, eur, fechaCorta, cuandoLabel, hoyISO, formatoCorto,
} from './comun'

const VACIO = {
  titulo: '', cliente_id: '', guion_id: '', formato: 'short', estado: 'guion',
  entrega: '', clips: '1', precio: '', notas_estilo: '', drive_url: '', editor_client_id: '',
}

export function PedidoForm({ clientId, datos, clientePor, pedidoPorGuion, inicial, onClose, onGuardado }) {
  const [f, setF] = useState(() => ({
    ...VACIO, ...inicial,
    clips: String(inicial.clips ?? 1), precio: inicial.precio != null ? String(inicial.precio) : '',
    cliente_id: inicial.cliente_id || '', guion_id: inicial.guion_id || '',
    editor_client_id: inicial.editor_client_id || '',
  }))
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  // Los guiones libres (sin pedido) y, si se edita, el propio.
  const guionesLibres = useMemo(() => datos.guiones.filter(g => !pedidoPorGuion.has(g.id) || g.id === inicial.guion_id), [datos, pedidoPorGuion, inicial])

  function eligeGuion(id) {
    const g = datos.guiones.find(x => x.id === id)
    setF(s => ({
      ...s, guion_id: id,
      titulo: s.titulo || g?.titulo || '',
      entrega: s.entrega || (g?.fecha && g.fecha >= hoyISO() ? g.fecha : ''),
    }))
  }
  // La tarifa del cliente rellena el precio si está vacío: por vídeo, tal
  // cual; en retainer o pack el precio va en el contrato, no en cada pieza.
  function eligeCliente(id) {
    const c = clientePor.get(id)
    setF(s => ({ ...s, cliente_id: id, precio: s.precio || (c?.contrato === 'por_video' && c.tarifa ? String(c.tarifa) : '') }))
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true); setError(null)
    try {
      const r = await edicionApi.pedido(clientId, {
        ...f, id: inicial.id, clips: Number(f.clips) || 1, precio: Number(f.precio) || 0,
        cliente_id: f.cliente_id || null, guion_id: f.guion_id || null,
        editor_client_id: f.editor_client_id || null,
      })
      onGuardado(r.pedido)
    } catch (err) { setError(err.message); setGuardando(false) }
  }

  return (
    <Modal title={inicial.id ? 'Editar pedido' : 'Nuevo pedido'} onClose={onClose} wide>
      <form className="helm-grid" style={{ gap: 12 }} onSubmit={guardar}>
        <Field label="Guion">
          <Select value={f.guion_id} onChange={e => eligeGuion(e.target.value)}>
            <option value="">Sin guion (encargo externo)</option>
            {guionesLibres.map(g => (
              <option key={g.id} value={g.id}>{fechaCorta(g.fecha)} · {g.titulo} — {FASES[g.fase] || g.fase}</option>
            ))}
          </Select>
        </Field>
        <Field label="Título *">
          <Input value={f.titulo} onChange={e => set('titulo', e.target.value)} required maxLength={200} placeholder="Reel lanzamiento — gancho con dato" />
        </Field>
        <div className="ed-form-2">
          <Field label="Cliente">
            <Select value={f.cliente_id} onChange={e => eligeCliente(e.target.value)}>
              <option value="">Sin cliente</option>
              {datos.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.canal ? ` · ${c.canal}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Formato">
            <Select value={f.formato} onChange={e => set('formato', e.target.value)}>
              {FORMATOS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="ed-form-3">
          <Field label="Fecha límite"><Input type="date" value={f.entrega} onChange={e => set('entrega', e.target.value)} /></Field>
          <Field label="Clips"><CountInput value={f.clips} onChange={v => set('clips', v)} /></Field>
          <Field label="Precio acordado"><MoneyInput value={f.precio} onChange={v => set('precio', v)} placeholder="0" /></Field>
        </div>
        {datos.editores?.length > 0 && (
          <Field label="Enviar al editor" hint="Le llega a su sección Edición con el guion, las notas y el Drive. Tú ves cómo avanza.">
            <Select value={f.editor_client_id} onChange={e => set('editor_client_id', e.target.value)}>
              <option value="">No enviar (lo edita este perfil)</option>
              {datos.editores.map(ed => <option key={ed.id} value={ed.id}>{ed.nombre}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Estado">
          <Select value={f.estado} onChange={e => set('estado', e.target.value)}>
            {ESTADOS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="Notas de estilo" hint="Ritmo, tipografía, música, referencias…">
          <Textarea value={f.notas_estilo} onChange={e => set('notas_estilo', e.target.value)} rows={3} />
        </Field>
        <Field label="Carpeta de Drive / Dropbox">
          <Input value={f.drive_url} onChange={e => set('drive_url', e.target.value)} placeholder="https://drive.google.com/…" />
        </Field>
        {error && <FormNote>{error}</FormNote>}
        <div className="ed-form-acc">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={guardando || !f.titulo.trim()}>{guardando ? 'Guardando…' : 'Guardar pedido'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function PedidoDrawer({ clientId, datos, clientePor, pedido, pon, quita, cambiarEstado, nuevoPedido, onClose }) {
  const [verGuion, setVerGuion] = useState(false)
  // Un encargo recibido trae su guion (es de otro perfil); uno propio lo
  // busca en el calendario de este.
  const guion = pedido.guion_info || (pedido.guion_id ? datos.guiones.find(g => g.id === pedido.guion_id) : null)
  const editor = pedido.editor_client_id ? datos.editores?.find(e => e.id === pedido.editor_client_id) : null

  // Abrirlo es haberlo visto: el perfil que lo envió deja de verlo como nuevo.
  useEffect(() => {
    if (pedido.recibido && !pedido.visto_at) {
      edicionApi.visto(clientId, [pedido.id]).then(() => pon('pedidos', { id: pedido.id, visto_at: new Date().toISOString() })).catch(() => {})
    }
  }, [pedido.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const cliente = clientePor.get(pedido.cliente_id)
  const cobros = datos.cobros.filter(c => c.pedido_id === pedido.id)

  async function borrar() {
    if (!window.confirm(`¿Borrar el pedido «${pedido.titulo}»? Sus cobros se quedan, sin pedido.`)) return
    await edicionApi.borrar(clientId, 'pedido', pedido.id)
    quita('pedidos', pedido.id); onClose()
  }

  const paso = ESTADOS.findIndex(e => e.key === pedido.estado)

  return (
    <Drawer
      title={pedido.titulo}
      sub={[cliente?.nombre, formatoCorto(pedido.formato), pedido.entrega && `${fechaCorta(pedido.entrega)} · ${cuandoLabel(pedido.entrega)}`].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={pedido.recibido ? null : (
        <div className="ed-form-acc">
          <button className="helm-btn" onClick={borrar}><Trash2 size={14} /> Borrar</button>
          <button className="helm-btn" onClick={() => { onClose(); nuevoPedido(pedido) }}><Pencil size={14} /> Editar</button>
        </div>
      )}
    >
      {pedido.recibido && (
        <p className="ed-banda"><Inbox size={14} /> Encargo de <b>{pedido.origen?.nombre}</b>{pedido.enviado_at && ` · enviado el ${fechaCorta(pedido.enviado_at.slice(0, 10))}`}</p>
      )}
      {!pedido.recibido && pedido.editor_client_id && (
        <p className="ed-banda">
          <Send size={14} /> Enviado a <b>{editor?.nombre || 'el editor'}</b>
          <span className="ed-visto">{pedido.visto_at ? <><Eye size={13} /> lo ha visto</> : <><EyeOff size={13} /> aún no lo ha abierto</>}</span>
        </p>
      )}
      <div className="ed-pasos" role="list">
        {ESTADOS.map((e, i) => (
          <button
            key={e.key} type="button" role="listitem"
            className={'ed-paso' + (i < paso ? ' hecho' : '') + (i === paso ? ' actual' : '')}
            onClick={() => cambiarEstado(pedido, e.key)}
          >
            <i>{i < paso ? <Check size={11} /> : i + 1}</i>{e.label}
          </button>
        ))}
      </div>

      {/* Precio y cobro son del perfil que encarga: al editor no le tocan. */}
      <dl className="ed-datos">
        <div><dt>Clips</dt><dd>{pedido.clips}</dd></div>
        <div><dt>Entrega</dt><dd>{pedido.entrega ? fechaCorta(pedido.entrega) : '—'}</dd></div>
        {pedido.recibido
          ? <div><dt>Formato</dt><dd>{formatoCorto(pedido.formato)}</dd></div>
          : <div><dt>Precio</dt><dd>{eur(pedido.precio)}</dd></div>}
      </dl>
      {!pedido.recibido && Number(pedido.precio) > 0 && (
        <p className="ed-suave" style={{ margin: '-6px 0 14px' }}>
          Cobro: {cobros.length ? cobros.map(c => (c.estado === 'cobrado' ? 'cobrado' : 'pendiente')).join(', ') : 'se abre solo al entregar'}.
        </p>
      )}

      <div className="ed-enlaces">
        {pedido.drive_url && <a className="helm-btn" href={pedido.drive_url} target="_blank" rel="noopener noreferrer"><FolderOpen size={14} /> Material</a>}
        {cliente?.brief_url && <a className="helm-btn" href={cliente.brief_url} target="_blank" rel="noopener noreferrer"><ScrollText size={14} /> Brief</a>}
        {cliente?.drive_url && <a className="helm-btn" href={cliente.drive_url} target="_blank" rel="noopener noreferrer"><FolderOpen size={14} /> Drive del cliente</a>}
      </div>

      {pedido.notas_estilo && (
        <section className="ed-bloque">
          <h4>Notas de estilo</h4>
          <p className="ed-pre">{pedido.notas_estilo}</p>
        </section>
      )}

      {guion && (
        <section className="ed-bloque">
          <h4>
            Guion <span className="ed-fase">{FASES[guion.fase]}</span>
            {guion.tipo && <span className="ed-tipo">{TIPOS[guion.tipo]}</span>}
          </h4>
          <p className={'ed-pre' + (verGuion ? '' : ' corto')}>{guion.guion || 'Sin texto.'}</p>
          {guion.guion && <button type="button" className="ed-mas" onClick={() => setVerGuion(v => !v)}>{verGuion ? 'Ver menos' : 'Ver guion entero'}</button>}
        </section>
      )}

    </Drawer>
  )
}
