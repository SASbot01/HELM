// HELM — Email marketing: campañas de correo a los contactos del CRM, que
// salen por la cuenta de Resend del propio negocio (api/email-marketing.js).
//
// Tres pestañas:
//   · Campañas → la lista y, al abrir una, su editor (si es un borrador y
//                mandas en el perfil) o su ficha con las cuentas. Lo lanzado
//                no se edita: se duplica.
//   · Bajas    → quién no quiere más correos (y los rebotes y quejas que avisa
//                Resend). Quitar una solo si la persona lo ha pedido.
//   · Ajustes  → la clave de Resend (se manda una vez y no vuelve: aquí solo
//                se ven sus cuatro últimos), el remitente y el pie legal.
//
// Quien ve la sección y no manda en el perfil lo ve todo y no toca nada: el
// servidor lo comprueba igual (mandaEnPerfil), esto solo esconde los botones.
import { useCallback, useEffect, useState } from 'react'
import { Mail, Plus, ArrowLeft, Send, Rocket, Pause, Play, Copy, Trash2, Users, Save, KeyRound, Check, AlertTriangle } from 'lucide-react'
import { emailMarketingApi } from '../lib'
import { Panel, Field, Input, Select, Textarea, Tabs, Empty, Modal, FormNote } from '../ui'
import './emailMarketing.css'

const TABS = [
  { key: 'campanas', label: 'Campañas' },
  { key: 'bajas', label: 'Bajas' },
  { key: 'ajustes', label: 'Ajustes' },
]

const num = (n) => Number(n || 0).toLocaleString('es-ES')
const fecha = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const HORAS = Array.from({ length: 25 }, (_, h) => h)

function estadoVisible(c) {
  if (c.estado === 'activa') return c.programada ? { texto: 'Programada', tono: 'amber' } : { texto: 'Enviando', tono: 'green' }
  return {
    borrador: { texto: 'Borrador', tono: '' },
    preparando: { texto: 'Preparando', tono: 'amber' },
    pausada: { texto: 'Pausada', tono: 'red' },
    terminada: { texto: 'Terminada', tono: '' },
  }[c.estado] || { texto: c.estado, tono: '' }
}

function Badge({ tono, children }) {
  return <span className={'helm-badge ' + (tono || '')}>{children}</span>
}

// ── Campañas ────────────────────────────────────────────────────────────────

const MENSAJE_VACIO = { asunto: '', cuerpo: '', esperaDias: 2 }

function formularioDe(detalle, pipelines) {
  if (!detalle) {
    const p = pipelines.find(x => x.porDefecto) || pipelines[0]
    return {
      id: null, nombre: '', pipelineId: p?.id || null, etapas: [],
      mensajes: [{ ...MENSAJE_VACIO, esperaDias: 0 }],
      programar: false, inicio: '', conVentana: false, desde: 9, hasta: 20,
    }
  }
  const c = detalle.campana
  return {
    id: c.id, nombre: c.nombre, pipelineId: c.audiencia.pipelineId, etapas: c.audiencia.etapas,
    mensajes: detalle.mensajes.map(m => ({ asunto: m.asunto, cuerpo: m.cuerpo, esperaDias: m.esperaDias })),
    programar: Boolean(c.inicio), inicio: c.inicio || '',
    conVentana: Boolean(c.ventana), desde: c.ventana?.desde ?? 9, hasta: c.ventana?.hasta ?? 20,
  }
}

const cuerpoDe = (f) => ({
  id: f.id || undefined,
  nombre: f.nombre,
  audiencia: { pipelineId: f.pipelineId, etapas: f.etapas },
  mensajes: f.mensajes.map((m, i) => ({ asunto: m.asunto, cuerpo: m.cuerpo, esperaDias: i === 0 ? 0 : Number(m.esperaDias) || 0 })),
  inicio: f.programar ? f.inicio : null,
  ventana: f.conVentana ? { desde: Number(f.desde), hasta: Number(f.hasta) } : null,
})

function Audiencia({ clientId, form, set, pipelines, disabled }) {
  const [vista, setVista] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const pipeline = pipelines.find(p => (p.id || null) === (form.pipelineId || null)) || pipelines[0]

  async function calcular() {
    setCargando(true); setError(null)
    try { setVista(await emailMarketingApi.audiencia(clientId, { pipelineId: form.pipelineId, etapas: form.etapas })) }
    catch (e) { setError(e.message) }
    setCargando(false)
  }
  const etapa = (key) => {
    set('etapas', form.etapas.includes(key) ? form.etapas.filter(k => k !== key) : [...form.etapas, key])
    setVista(null)
  }

  return (
    <div className="em-bloque">
      <h3><Users size={15} /> Audiencia</h3>
      <Field label="Pipeline del CRM">
        <Select value={form.pipelineId || ''} disabled={disabled}
          onChange={e => { set('pipelineId', e.target.value || null); set('etapas', []); setVista(null) }}>
          {pipelines.map(p => <option key={p.id || 'defecto'} value={p.id || ''}>{p.nombre}</option>)}
        </Select>
      </Field>
      {pipeline && (
        <fieldset className="em-etapas" disabled={disabled}>
          <legend>Etapas <small>(ninguna marcada = todas)</small></legend>
          {pipeline.etapas.map(s => (
            <label key={s.key} className="em-check">
              <input type="checkbox" checked={form.etapas.includes(s.key)} onChange={() => etapa(s.key)} />
              {s.label}
            </label>
          ))}
        </fieldset>
      )}
      {!disabled && (
        <button type="button" className="helm-btn" onClick={calcular} disabled={cargando}>
          <Users size={15} /> {cargando ? 'Contando…' : 'Ver a quién le llega'}
        </button>
      )}
      {error && <div className="helm-formerror">{error}</div>}
      {vista && (
        <div className="em-audiencia">
          <p><b>{num(vista.total)}</b> {vista.total === 1 ? 'persona' : 'personas'} con un correo válido.</p>
          {vista.excedido && <FormNote tone="warn">Pasa del tope de {num(vista.tope)} por campaña: acota con etapas o divídela en dos.</FormNote>}
          {(vista.deBaja + vista.duplicados + vista.sinEmail + vista.invalidos) > 0 && (
            <small>Se quedan fuera: {num(vista.deBaja)} de baja · {num(vista.duplicados)} correos repetidos · {num(vista.sinEmail)} sin correo · {num(vista.invalidos)} con el correo mal escrito.</small>
          )}
          {vista.muestra?.length > 0 && (
            <ul className="em-muestra">
              {vista.muestra.map(p => <li key={p.email}><b>{p.nombre || 'Sin nombre'}</b><span>{p.email}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Mensajes({ form, set, disabled, limites }) {
  const cambia = (i, k, v) => set('mensajes', form.mensajes.map((m, j) => (j === i ? { ...m, [k]: v } : m)))
  const quita = (i) => set('mensajes', form.mensajes.filter((_, j) => j !== i))
  const mueve = (i, d) => {
    const l = [...form.mensajes]
    const [m] = l.splice(i, 1)
    l.splice(i + d, 0, m)
    set('mensajes', l)
  }
  return (
    <div className="em-bloque">
      <h3><Mail size={15} /> Correos de la secuencia</h3>
      <p className="em-ayuda">
        Formato: <code>**negrita**</code> · <code>*cursiva*</code> · <code>[texto](https://enlace)</code> · líneas con «- » para listas · una línea en blanco entre párrafos.
        Variables: <code>{'{{nombre}}'}</code>, <code>{'{{primer_nombre}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{empresa}}'}</code>; con valor por si falta el dato: <code>{'{{primer_nombre|hola}}'}</code>.
        El pie con tu empresa, tu dirección y el enlace de baja se añade solo.
      </p>
      {form.mensajes.map((m, i) => (
        <div key={i} className="em-mensaje">
          <div className="em-mensaje-cab">
            <b>Correo {i + 1}</b>
            {!disabled && (
              <span className="em-botones">
                {i > 0 && <button type="button" className="helm-btn sm" onClick={() => mueve(i, -1)} aria-label={`Subir el correo ${i + 1}`}>↑</button>}
                {i < form.mensajes.length - 1 && <button type="button" className="helm-btn sm" onClick={() => mueve(i, 1)} aria-label={`Bajar el correo ${i + 1}`}>↓</button>}
                {form.mensajes.length > 1 && <button type="button" className="helm-btn sm" onClick={() => quita(i)}><Trash2 size={13} /> Quitar</button>}
              </span>
            )}
          </div>
          {i > 0 && (
            <Field label="Días después del anterior">
              <Input type="number" min="0" max="365" step="1" inputMode="numeric" value={m.esperaDias} disabled={disabled}
                onChange={e => cambia(i, 'esperaDias', e.target.value)} />
            </Field>
          )}
          <Field label="Asunto">
            <Input value={m.asunto} maxLength={limites?.asunto || 200} disabled={disabled} onChange={e => cambia(i, 'asunto', e.target.value)}
              placeholder={i === 0 ? '{{primer_nombre|Hola}}, esto te interesa' : 'Asunto del correo'} />
          </Field>
          <Field label="Texto">
            <Textarea rows={8} value={m.cuerpo} maxLength={limites?.cuerpo || 20000} disabled={disabled} onChange={e => cambia(i, 'cuerpo', e.target.value)}
              placeholder={'Hola {{primer_nombre|}},\n\nTe escribo porque…'} />
          </Field>
        </div>
      ))}
      {!disabled && form.mensajes.length < (limites?.mensajes || 10) && (
        <button type="button" className="helm-btn" onClick={() => set('mensajes', [...form.mensajes, { ...MENSAJE_VACIO }])}>
          <Plus size={15} /> Añadir otro correo
        </button>
      )}
    </div>
  )
}

function Cuando({ form, set, disabled }) {
  return (
    <div className="em-bloque">
      <h3><Rocket size={15} /> Cuándo sale</h3>
      <label className="em-check">
        <input type="radio" name="em-cuando" checked={!form.programar} disabled={disabled} onChange={() => set('programar', false)} />
        El primer correo, al lanzar
      </label>
      <label className="em-check">
        <input type="radio" name="em-cuando" checked={form.programar} disabled={disabled} onChange={() => set('programar', true)} />
        Programado (hora de Madrid)
      </label>
      {form.programar && (
        <Field label="Fecha y hora del primero">
          <Input type="datetime-local" value={form.inicio} disabled={disabled} onChange={e => set('inicio', e.target.value)} />
        </Field>
      )}
      <label className="em-check">
        <input type="checkbox" checked={form.conVentana} disabled={disabled} onChange={e => set('conVentana', e.target.checked)} />
        Mandar solo en una franja horaria
      </label>
      {form.conVentana && (
        <div className="em-franja">
          <Field label="Desde">
            <Select value={form.desde} disabled={disabled} onChange={e => set('desde', Number(e.target.value))}>
              {HORAS.slice(0, 24).map(h => <option key={h} value={h}>{h}:00</option>)}
            </Select>
          </Field>
          <Field label="Hasta">
            <Select value={form.hasta} disabled={disabled} onChange={e => set('hasta', Number(e.target.value))}>
              {HORAS.slice(1).map(h => <option key={h} value={h}>{h}:00</option>)}
            </Select>
          </Field>
        </div>
      )}
      <small className="em-nota">Cada correo sale los días indicados después del anterior, a la misma hora. Lo que caiga fuera de la franja espera a que se abra.</small>
    </div>
  )
}

function Lanzar({ clientId, campana, onCerrar, onLanzada }) {
  const [vista, setVista] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    emailMarketingApi.audiencia(clientId, campana.audiencia)
      .then(setVista).catch(e => setError(e.message))
  }, [clientId, campana])

  async function lanzar() {
    setEnviando(true); setError(null)
    try {
      onLanzada(await emailMarketingApi.lanzar(clientId, campana.id, vista.total))
    } catch (e) {
      // Si el CRM ha cambiado desde que se contó, se enseña el número nuevo y se vuelve a pedir.
      if (e.codigo === 'confirmar' && Number.isFinite(e.datos?.total)) setVista(v => ({ ...v, total: e.datos.total }))
      setError(e.message)
    }
    setEnviando(false)
  }

  return (
    <Modal title="Lanzar la campaña" onClose={onCerrar}>
      {!vista && !error && <p>Contando a quién le llega…</p>}
      {vista && (
        <div className="em-confirmar">
          <p className="em-confirmar-n"><b>{num(vista.total)}</b> {vista.total === 1 ? 'persona recibirá' : 'personas recibirán'} «{campana.nombre}».</p>
          <p>{campana.audienciaTexto}. {campana.inicio ? `Empieza el ${fecha(campana.inicioEn)} (hora de Madrid).` : 'El primer correo sale en el próximo minuto.'}</p>
          <p>Una vez lanzada no se puede editar: se puede pausar o duplicar.</p>
          {vista.excedido && <FormNote tone="warn">Pasa del tope de {num(vista.tope)} por campaña.</FormNote>}
        </div>
      )}
      {error && <div className="helm-formerror">{error}</div>}
      <div className="helm-modal-actions">
        <button type="button" className="helm-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="helm-btn primary" onClick={lanzar} disabled={!vista || !vista.total || vista.excedido || enviando}>
          <Rocket size={15} /> {enviando ? 'Lanzando…' : vista ? `Sí, mandar a ${num(vista.total)}` : 'Lanzar'}
        </button>
      </div>
    </Modal>
  )
}

function Cifras({ c }) {
  const items = [
    ['Enviados', c.enviados], ['Entregados', c.entregados], ['Fallidos', c.fallidos],
    ['Bajas', c.bajas], ['Rebotes', c.rebotados], ['En curso', c.activos],
  ]
  return (
    <div className="em-cifras">
      {items.map(([t, n]) => <div key={t}><b>{num(n)}</b><small>{t}</small></div>)}
    </div>
  )
}

function Campana({ clientId, id, estado, onVolver, onCambio }) {
  const admin = estado.puedeAdministrar === true
  const [detalle, setDetalle] = useState(id ? null : undefined)
  const [form, setForm] = useState(() => (id ? null : formularioDe(null, estado.pipelines)))
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [lanzando, setLanzando] = useState(false)

  const cargar = useCallback((cual) => emailMarketingApi.campana(clientId, cual)
    .then(d => { setDetalle(d); setForm(formularioDe(d, estado.pipelines)) })
    .catch(e => setError(e.message)), [clientId, estado.pipelines])
  useEffect(() => { if (id) cargar(id) }, [id, cargar])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const editable = admin && (!detalle || detalle.editable)

  async function hacer(fn, ok) {
    setOcupado(true); setError(null); setAviso(null)
    try {
      const r = await fn()
      if (r?.campana) { setDetalle(r); setForm(formularioDe(r, estado.pipelines)) }
      if (ok) setAviso(typeof ok === 'function' ? ok(r) : ok)
      onCambio()
      return r
    } catch (e) { setError(e.message); return null }
    finally { setOcupado(false) }
  }
  const guardar = () => emailMarketingApi.guardar(clientId, cuerpoDe(form))
  // Probar y lanzar trabajan con lo guardado: se guarda antes, para que lo que
  // llega a tu correo (y a la audiencia) sea lo que estás viendo.
  const guardarYProbar = () => hacer(async () => {
    const d = editable ? await guardar() : detalle
    if (editable) { setDetalle(d); setForm(formularioDe(d, estado.pipelines)) }
    const r = await emailMarketingApi.prueba(clientId, d.campana.id)
    return { ...d, prueba: r }
  }, r => `Prueba enviada a ${r.prueba.para} (${r.prueba.enviados} ${r.prueba.enviados === 1 ? 'correo' : 'correos'}).`)
  const guardarYLanzar = async () => {
    const d = await hacer(guardar)
    if (d) setLanzando(true)
  }

  if (error && !detalle && id) return <div className="em"><button type="button" className="helm-btn" onClick={onVolver}><ArrowLeft size={15} /> Campañas</button><div className="helm-formerror">{error}</div></div>
  if (!form) return <Empty>Cargando…</Empty>
  const c = detalle?.campana
  const ev = c ? estadoVisible(c) : { texto: 'Nueva', tono: '' }

  return (
    <div className="em-campana">
      <div className="em-cab">
        <button type="button" className="helm-btn" onClick={onVolver}><ArrowLeft size={15} /> Campañas</button>
        <Badge tono={ev.tono}>{ev.texto}</Badge>
      </div>
      {aviso && <div className="helm-settings-ok" role="status">{aviso}</div>}
      {error && <div className="helm-formerror">{error}</div>}
      {c?.error && <FormNote tone="warn">{c.error}</FormNote>}

      {c && c.estado !== 'borrador' && (
        <Panel title={c.nombre}>
          <div className="helm-settings-body">
            <Cifras c={c} />
            <p className="em-meta">
              {c.audienciaTexto} · {num(c.total)} personas
              {c.remitente?.email ? ` · desde ${c.remitente.nombre ? `${c.remitente.nombre} <${c.remitente.email}>` : c.remitente.email}` : ''}
              {c.ventana ? ` · de ${c.ventana.desde}:00 a ${c.ventana.hasta}:00` : ''}
            </p>
            <p className="em-meta">Lanzada {fecha(c.lanzadaEn)}{c.lanzadaPor ? ` por ${c.lanzadaPor}` : ''}{c.inicioEn ? ` · empieza ${fecha(c.inicioEn)}` : ''}{c.terminadaEn ? ` · terminada ${fecha(c.terminadaEn)}` : ''}</p>
            {admin && (
              <div className="em-botones">
                {c.estado === 'activa' && <button type="button" className="helm-btn" disabled={ocupado} onClick={() => hacer(() => emailMarketingApi.pausar(clientId, c.id), 'Campaña pausada: no sale nada más hasta que la reanudes.')}><Pause size={15} /> Pausar</button>}
                {c.estado === 'pausada' && <button type="button" className="helm-btn primary" disabled={ocupado} onClick={() => hacer(() => emailMarketingApi.reanudar(clientId, c.id), 'Campaña reanudada.')}><Play size={15} /> Reanudar</button>}
                <button type="button" className="helm-btn" disabled={ocupado} onClick={guardarYProbar}><Send size={15} /> Enviar prueba a mi correo</button>
                <button type="button" className="helm-btn" disabled={ocupado} onClick={() => hacer(() => emailMarketingApi.duplicar(clientId, c.id), 'Copia creada como borrador: ya puedes editarla.')}><Copy size={15} /> Duplicar</button>
              </div>
            )}
          </div>
        </Panel>
      )}

      {(!c || c.estado === 'borrador') && (
        <Panel title={c ? c.nombre : 'Nueva campaña'}>
          <form className="helm-settings-body" onSubmit={e => { e.preventDefault(); hacer(guardar, 'Borrador guardado.') }}>
            <Field label="Nombre de la campaña (no lo ve nadie más que tú)">
              <Input value={form.nombre} maxLength={120} disabled={!editable} onChange={e => set('nombre', e.target.value)} placeholder="Bienvenida a los leads de octubre" required />
            </Field>
            <Audiencia clientId={clientId} form={form} set={set} pipelines={estado.pipelines} disabled={!editable} />
            <Mensajes form={form} set={set} disabled={!editable} limites={estado.limites} />
            <Cuando form={form} set={set} disabled={!editable} />
            {editable && (
              <div className="em-botones">
                <button type="submit" className="helm-btn" disabled={ocupado}><Save size={15} /> Guardar borrador</button>
                <button type="button" className="helm-btn" disabled={ocupado} onClick={guardarYProbar}><Send size={15} /> Enviar prueba a mi correo</button>
                <button type="button" className="helm-btn primary" disabled={ocupado || estado.faltan.length > 0} onClick={guardarYLanzar}
                  title={estado.faltan.length ? `Falta ${estado.faltan.join(', ')}` : undefined}>
                  <Rocket size={15} /> Lanzar…
                </button>
                {c && (
                  <button type="button" className="helm-btn" disabled={ocupado} onClick={async () => {
                    if (!confirm('¿Borrar este borrador?')) return
                    if (await hacer(() => emailMarketingApi.borrar(clientId, c.id))) onVolver()
                  }}><Trash2 size={15} /> Borrar</button>
                )}
              </div>
            )}
          </form>
        </Panel>
      )}

      {c && c.estado !== 'borrador' && detalle.mensajes.map(m => (
        <Panel key={m.id} title={`Correo ${m.orden}${m.orden > 1 ? ` · ${m.esperaDias} ${m.esperaDias === 1 ? 'día' : 'días'} después` : ''}`}>
          <div className="helm-settings-body">
            <p className="em-asunto"><b>{m.asunto}</b></p>
            <p className="em-meta">{num(m.enviados)} enviados · {num(m.entregados)} entregados · {num(m.fallidos)} fallidos{m.pendientes ? ` · ${num(m.pendientes)} saliendo` : ''}</p>
            <pre className="em-cuerpo">{m.cuerpo}</pre>
          </div>
        </Panel>
      ))}

      {lanzando && detalle && (
        <Lanzar clientId={clientId} campana={detalle.campana} onCerrar={() => setLanzando(false)}
          onLanzada={(r) => { setLanzando(false); setDetalle(r); setForm(formularioDe(r, estado.pipelines)); setAviso(`Lanzada: ${num(r.total)} personas.`); onCambio() }} />
      )}
    </div>
  )
}

function Campanas({ clientId, estado }) {
  const [lista, setLista] = useState(null)
  const [abierta, setAbierta] = useState(null)   // id, 'nueva' o null
  const [error, setError] = useState(null)
  const cargar = useCallback(() => emailMarketingApi.campanas(clientId)
    .then(r => { setLista(r.campanas || []); setError(null) })
    .catch(e => setError(e.message)), [clientId])
  useEffect(() => { cargar() }, [cargar])

  if (abierta) {
    return <Campana key={abierta} clientId={clientId} id={abierta === 'nueva' ? null : abierta} estado={estado}
      onVolver={() => { setAbierta(null); cargar() }} onCambio={cargar} />
  }
  return (
    <div className="em-lista">
      <div className="em-cab">
        <span className="em-cuenta">{lista ? `${lista.length} ${lista.length === 1 ? 'campaña' : 'campañas'}` : ''}</span>
        {estado.puedeAdministrar && (
          <button type="button" className="helm-btn primary" onClick={() => setAbierta('nueva')}><Plus size={15} /> Nueva campaña</button>
        )}
      </div>
      {error && <div className="helm-formerror">{error}</div>}
      {!lista ? <Empty>Cargando…</Empty> : !lista.length ? (
        <Empty>Aún no hay campañas. {estado.puedeAdministrar ? 'Crea la primera: eliges a quién del CRM, escribes los correos y decides cuándo salen.' : ''}</Empty>
      ) : (
        <ul className="em-tarjetas">
          {lista.map(c => {
            const ev = estadoVisible(c)
            return (
              <li key={c.id}>
                <button type="button" className="em-tarjeta" onClick={() => setAbierta(c.id)}>
                  <span className="em-tarjeta-cab"><b>{c.nombre}</b><Badge tono={ev.tono}>{ev.texto}</Badge></span>
                  <small>{c.audienciaTexto} · {c.mensajes} {c.mensajes === 1 ? 'correo' : 'correos'}</small>
                  {c.estado === 'borrador'
                    ? <small>Creada {fecha(c.creadaEn)}</small>
                    : <small>{num(c.enviados)} enviados · {num(c.fallidos)} fallidos · {num(c.bajas)} bajas{c.programada ? ` · empieza ${fecha(c.inicioEn)}` : ''}</small>}
                  {c.error && <small className="em-error"><AlertTriangle size={12} /> {c.error}</small>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Bajas ───────────────────────────────────────────────────────────────────

const MOTIVO = { baja: 'Se dio de baja', rebote: 'Rebote', queja: 'Lo marcó como spam', manual: 'Apuntada a mano' }

function QuitarBaja({ clientId, baja, onCerrar, onHecho }) {
  const [pedido, setPedido] = useState(false)
  const [nota, setNota] = useState('')
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  async function quitar() {
    setOcupado(true); setError(null)
    try { await emailMarketingApi.quitarBaja(clientId, baja.email, nota.trim()); onHecho() }
    catch (e) { setError(e.message); setOcupado(false) }
  }
  return (
    <Modal title="Quitar una baja" onClose={onCerrar}>
      <p className="em-legal">Solo si <b>{baja.email}</b> te ha pedido volver a recibir tus correos. Quitarla sin que lo pida es escribir a quien dijo que no. Volverá a entrar en las campañas que lances a partir de ahora.</p>
      <label className="em-check">
        <input type="checkbox" checked={pedido} onChange={e => setPedido(e.target.checked)} />
        Esta persona me ha pedido volver a recibir correos
      </label>
      <Field label="Cómo lo pidió (queda apuntado)">
        <Input value={nota} maxLength={300} onChange={e => setNota(e.target.value)} placeholder="Me escribió por WhatsApp el 3 de noviembre" />
      </Field>
      {error && <div className="helm-formerror">{error}</div>}
      <div className="helm-modal-actions">
        <button type="button" className="helm-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="helm-btn primary" disabled={!pedido || ocupado} onClick={quitar}>Quitar la baja</button>
      </div>
    </Modal>
  )
}

function Bajas({ clientId, admin }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [nueva, setNueva] = useState('')
  const [aviso, setAviso] = useState(null)
  const [quitando, setQuitando] = useState(null)
  const cargar = useCallback(() => emailMarketingApi.bajas(clientId)
    .then(d => { setDatos(d); setError(null) }).catch(e => setError(e.message)), [clientId])
  useEffect(() => { cargar() }, [cargar])

  async function apuntar(e) {
    e.preventDefault()
    setError(null); setAviso(null)
    try {
      const r = await emailMarketingApi.apuntarBaja(clientId, nueva.trim())
      setAviso(r.nueva ? `${nueva.trim()} no recibirá más correos.` : 'Ese correo ya estaba de baja.')
      setNueva('')
      cargar()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="em-bajas">
      <p className="em-ayuda">Aquí está quien no quiere más correos de este negocio: los que pulsaron «darme de baja», y los que Resend avisa que rebotan o los marcaron como spam. A ninguno se le manda nada, en ninguna campaña.</p>
      {admin && (
        <form className="em-apuntar" onSubmit={apuntar}>
          <Input type="email" value={nueva} onChange={e => setNueva(e.target.value)} placeholder="correo@ejemplo.com" aria-label="Correo que no quiere recibir más" required />
          <button type="submit" className="helm-btn">Apuntar baja</button>
        </form>
      )}
      {aviso && <div className="helm-settings-ok" role="status">{aviso}</div>}
      {error && <div className="helm-formerror">{error}</div>}
      {!datos ? <Empty>Cargando…</Empty> : !datos.bajas.length ? <Empty>Nadie se ha dado de baja todavía.</Empty> : (
        <ul className="em-filas">
          {datos.bajas.map(b => (
            <li key={b.email}>
              <div>
                <b>{b.email}</b>
                <small>{MOTIVO[b.motivo] || b.motivo} · {fecha(b.creadaEn)}{b.campana ? ` · ${b.campana}` : ''}{b.detalle ? ` · ${b.detalle}` : ''}</small>
              </div>
              {admin && <button type="button" className="helm-btn sm" onClick={() => setQuitando(b)}>Quitar</button>}
            </li>
          ))}
        </ul>
      )}
      {datos?.hayMas && <small className="em-nota">Se enseñan las 1.000 más recientes.</small>}
      {quitando && <QuitarBaja clientId={clientId} baja={quitando} onCerrar={() => setQuitando(null)}
        onHecho={() => { setAviso(`${quitando.email} puede volver a recibir correos.`); setQuitando(null); cargar() }} />}
    </div>
  )
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

function AjustesEmail({ clientId, estado, onCambio }) {
  const admin = estado.puedeAdministrar === true
  const a = estado.ajustes
  const [f, setF] = useState({ remitenteNombre: a.remitenteNombre, remitenteEmail: a.remitenteEmail, responderA: a.responderA, empresa: a.empresa, direccion: a.direccion })
  const [apiKey, setApiKey] = useState('')
  const [secreto, setSecreto] = useState('')
  const [avisos, setAvisos] = useState([])
  const [ok, setOk] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const cambia = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))

  async function guardar(e, extra = {}) {
    e?.preventDefault()
    setOcupado(true); setError(null); setOk(null); setAvisos([])
    try {
      const r = await emailMarketingApi.ajustes(clientId, { ...f, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(secreto.trim() ? { webhookSecret: secreto.trim() } : {}), ...extra })
      setApiKey(''); setSecreto('')
      setAvisos(r.avisos || [])
      setOk('Guardado.')
      onCambio(r)
    } catch (err) { setError(err.message) }
    setOcupado(false)
  }
  async function quitarClave() {
    if (!confirm('¿Quitar la clave de Resend? Las campañas en marcha se pausan hasta que pongas otra.')) return
    setOcupado(true); setError(null); setOk(null)
    try { onCambio(await emailMarketingApi.quitarClave(clientId)); setOk('Clave quitada.') }
    catch (err) { setError(err.message) }
    setOcupado(false)
  }
  const dominio = (f.remitenteEmail.split('@')[1] || '').toLowerCase()
  const estadoDominio = a.dominios.find(d => d.nombre === dominio)?.estado

  return (
    <form className="em-ajustes" onSubmit={guardar}>
      {!admin && <FormNote tone="warn">Solo quien administra el perfil puede cambiar esto.</FormNote>}
      <Panel title="Cuenta de Resend" action={estado.clave.conectada ? <Badge tono="green">Conectada · …{estado.clave.last4}</Badge> : <Badge>Sin clave</Badge>}>
        <div className="helm-settings-body">
          <p className="helm-settings-lead">Los correos salen por tu cuenta de Resend, con tu dominio. Crea una clave en resend.com → API Keys (con «Full access» se comprueba también tu dominio) y pégala aquí. Se comprueba antes de guardarla y se queda en el servidor: aquí solo verás sus cuatro últimos caracteres.</p>
          {admin && (
            <Field label={estado.clave.conectada ? 'Cambiar la clave' : 'Clave de la API de Resend'}>
              <Input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="re_…" />
            </Field>
          )}
          {admin && estado.clave.conectada && (
            <div><button type="button" className="helm-btn" disabled={ocupado} onClick={quitarClave}><KeyRound size={15} /> Quitar clave</button></div>
          )}
        </div>
      </Panel>

      <Panel title="Remitente y pie legal">
        <div className="helm-settings-body">
          <div className="em-campos">
            <Field label="Nombre del remitente"><Input value={f.remitenteNombre} maxLength={120} disabled={!admin} onChange={cambia('remitenteNombre')} placeholder="Ana de Tu Negocio" /></Field>
            <Field label="Correo del remitente" hint={dominio && estadoDominio ? `Dominio ${dominio} en Resend: ${estadoDominio === 'verified' ? 'verificado' : estadoDominio}` : undefined}>
              <Input type="email" value={f.remitenteEmail} maxLength={254} disabled={!admin} onChange={cambia('remitenteEmail')} placeholder="hola@tunegocio.com" />
            </Field>
            <Field label="Responder a (opcional)"><Input type="email" value={f.responderA} maxLength={254} disabled={!admin} onChange={cambia('responderA')} placeholder="ana@tunegocio.com" /></Field>
            <Field label="Empresa (sale en el pie)"><Input value={f.empresa} maxLength={200} disabled={!admin} onChange={cambia('empresa')} placeholder="Tu Negocio S.L." /></Field>
          </div>
          <Field label="Dirección postal (sale en el pie)">
            <Textarea rows={2} value={f.direccion} maxLength={400} disabled={!admin} onChange={cambia('direccion')} placeholder="Calle Mayor 1, 30800 Lorca (Murcia)" />
          </Field>
          <small className="helm-settings-note">La ley (LSSI) pide que cada correo diga quién lo manda y cómo darse de baja. El pie con tu empresa, tu dirección y el enlace de baja va en todos, también en las pruebas.</small>
        </div>
      </Panel>

      <Panel title="Avisos de Resend (opcional)" action={estado.webhook.conectado ? <Badge tono="green">Conectado · …{estado.webhook.last4}</Badge> : <Badge>Sin conectar</Badge>}>
        <div className="helm-settings-body">
          <p className="helm-settings-lead">Para saber qué correos se entregan y apartar solo a quien rebota o te marca como spam: en Resend → Webhooks → Add endpoint, pega esta dirección con los eventos email.delivered, email.bounced y email.complained, y copia aquí su «Signing secret».</p>
          <div className="helm-copyrow">
            <code>{estado.webhook.url}</code>
            <button type="button" className="helm-btn" onClick={() => { navigator.clipboard?.writeText(estado.webhook.url); setCopiado(true); setTimeout(() => setCopiado(false), 1800) }}>
              {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {admin && (
            <Field label={estado.webhook.conectado ? 'Cambiar el secreto de firma' : 'Secreto de firma (whsec_…)'}>
              <Input type="password" autoComplete="off" value={secreto} onChange={e => setSecreto(e.target.value)} placeholder="whsec_…" />
            </Field>
          )}
          {admin && estado.webhook.conectado && (
            <div><button type="button" className="helm-btn" disabled={ocupado} onClick={() => guardar(null, { quitarWebhook: true })}>Quitar el secreto</button></div>
          )}
        </div>
      </Panel>

      {avisos.map(t => <FormNote key={t} tone="warn">{t}</FormNote>)}
      {ok && <div className="helm-settings-ok" role="status">{ok}</div>}
      {error && <div className="helm-formerror">{error}</div>}
      {admin && <div><button type="submit" className="helm-btn primary" disabled={ocupado}><Save size={15} /> {ocupado ? 'Comprobando…' : 'Guardar'}</button></div>}
    </form>
  )
}

// ── La sección ──────────────────────────────────────────────────────────────

export default function EmailMarketing({ clientId }) {
  const [tab, setTab] = useState('campanas')
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const cargar = useCallback(() => emailMarketingApi.estado(clientId)
    .then(e => { setEstado(e); setError(null) }).catch(e => setError(e.message)), [clientId])
  useEffect(() => { cargar() }, [cargar])

  if (error && !estado) return <div className="em"><div className="helm-formerror">{error}</div></div>
  if (!estado) return <Empty>Cargando…</Empty>
  const admin = estado.puedeAdministrar === true

  return (
    <div className="em">
      <p className="em-legal">
        Solo puedes escribir a quien te ha dado su consentimiento o ya es cliente tuyo (art. 21 de la LSSI).
        Cada correo lleva tu empresa, tu dirección y un enlace para darse de baja, y a quien se da de baja no le llega nada más.
      </p>
      {estado.faltan.length > 0 && (
        <FormNote tone="warn">Para poder mandar falta {estado.faltan.join(', ')}. {admin ? 'Complétalo en Ajustes.' : 'Pídeselo a quien administra el perfil.'}</FormNote>
      )}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'campanas' && <Campanas clientId={clientId} estado={estado} />}
      {tab === 'bajas' && <Bajas clientId={clientId} admin={admin} />}
      {tab === 'ajustes' && <AjustesEmail clientId={clientId} estado={estado} onCambio={(r) => (r?.ajustes ? setEstado(r) : cargar())} />}
    </div>
  )
}
