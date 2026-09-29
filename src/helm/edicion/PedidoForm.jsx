// Edición → alta y ficha de un pedido.
import { useMemo, useState } from 'react'
import { FolderOpen, ScrollText, Sparkles, Trash2, Pencil, Check } from 'lucide-react'
import { Modal, Drawer, Field, Input, Textarea, Select, MoneyInput, CountInput, FormNote } from '../ui'
import {
  edicionApi, ESTADOS, FORMATOS, FASES, TIPOS, eur, fechaCorta, cuandoLabel, hoyISO, formatoCorto,
} from './comun'

const VACIO = {
  titulo: '', cliente_id: '', guion_id: '', formato: 'short', estado: 'guion',
  entrega: '', clips: '1', precio: '', notas_estilo: '', drive_url: '',
}

export function PedidoForm({ clientId, datos, clientePor, pedidoPorGuion, inicial, onClose, onGuardado }) {
  const [f, setF] = useState(() => ({
    ...VACIO, ...inicial,
    clips: String(inicial.clips ?? 1), precio: inicial.precio != null ? String(inicial.precio) : '',
    cliente_id: inicial.cliente_id || '', guion_id: inicial.guion_id || '',
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
      })
      onGuardado(r.pedido)
    } catch (err) { setError(err.message); setGuardando(false) }
  }

  return (
    <Modal title={inicial.id ? 'Editar pedido' : 'Nuevo pedido'} onClose={onClose} wide>
      <form className="helm-grid" style={{ gap: 12 }} onSubmit={guardar}>
        <Field label="Guion" hint="Enlázalo y el Agente Montador lo seguirá en Drive y podrá escribir su hoja de montaje.">
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
        <Field label="Estado">
          <Select value={f.estado} onChange={e => set('estado', e.target.value)}>
            {ESTADOS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="Notas de estilo" hint="Ritmo, tipografía, música, referencias… El Montador las usa en la hoja.">
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
  const [hojaEstado, setHojaEstado] = useState(null)   // null | 'generando' | error
  const [verGuion, setVerGuion] = useState(false)
  const guion = pedido.guion_id ? datos.guiones.find(g => g.id === pedido.guion_id) : null
  const cliente = clientePor.get(pedido.cliente_id)
  const cobros = datos.cobros.filter(c => c.pedido_id === pedido.id)

  async function pedirHoja() {
    setHojaEstado('generando')
    try {
      const r = await edicionApi.hoja(clientId, pedido.id)
      pon('pedidos', r.pedido); setHojaEstado(null)
    } catch (e) { setHojaEstado(e.message) }
  }

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
      footer={(
        <div className="ed-form-acc">
          <button className="helm-btn" onClick={borrar}><Trash2 size={14} /> Borrar</button>
          <button className="helm-btn" onClick={() => { onClose(); nuevoPedido(pedido) }}><Pencil size={14} /> Editar</button>
        </div>
      )}
    >
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

      <dl className="ed-datos">
        <div><dt>Clips</dt><dd>{pedido.clips}</dd></div>
        <div><dt>Precio</dt><dd>{eur(pedido.precio)}</dd></div>
        <div><dt>Cobro</dt><dd>{cobros.length ? cobros.map(c => (c.estado === 'cobrado' ? 'Cobrado' : 'Pendiente')).join(', ') : 'Se abre al entregar'}</dd></div>
      </dl>

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

      <section className="ed-bloque ed-hoja">
        <h4>
          <Sparkles size={14} /> Hoja de montaje
          {pedido.hoja_at && <small>{new Date(pedido.hoja_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small>}
        </h4>
        {pedido.hoja ? <div className="ed-pre ed-hoja-txt">{pedido.hoja}</div> : (
          <p className="ed-suave">
            El Agente Montador la escribe a partir {guion ? 'del guion' : 'de las notas de estilo'}: formato, gancho,
            cortes, música, subtítulos y checklist de exportación.
          </p>
        )}
        {typeof hojaEstado === 'string' && hojaEstado !== 'generando' && <FormNote>{hojaEstado}</FormNote>}
        <button className="helm-btn primary" onClick={pedirHoja} disabled={hojaEstado === 'generando'}>
          <Sparkles size={14} /> {hojaEstado === 'generando' ? 'Escribiendo la hoja…' : pedido.hoja ? 'Rehacer la hoja' : 'Pedir la hoja de montaje'}
        </button>
      </section>
    </Drawer>
  )
}
