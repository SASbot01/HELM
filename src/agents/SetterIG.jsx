// HELM — Setter de Instagram: el agente que contesta los DM del perfil,
// cualifica al lead y lo lleva a la llamada (motor en api/_lib/setter-ig.js).
//
// Tres pestañas:
//   · Bandeja        → los hilos de Instagram; aprobar o corregir lo que
//                      propone el setter, escribir como persona, tomar o
//                      devolver el control.
//   · Configuración  → encenderlo, modo (borrador / automático), a dónde lleva
//                      al lead y lo que tiene que saber.
//   · Probar         → un simulador: escribes como si fueras el lead y ves qué
//                      contestaría, sin Instagram. Gasta créditos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Inbox, Settings2, FlaskConical, Send, Check, X, Hand, Bot, Loader2, AlertTriangle, Link2, RotateCcw, Instagram,
} from 'lucide-react'
import { setterIgApi } from '../helm/lib'
import './setterig.css'

const hora = (t) => {
  if (!t) return ''
  const d = new Date(t)
  const hoy = new Date().toDateString() === d.toDateString()
  return hoy ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
const nombreDe = (c) => (c.usuario ? `@${c.usuario}` : c.nombre || 'Lead de Instagram')
const ESTADOS = { ia: 'Lo lleva el setter', humano: 'Lo lleva una persona', cerrada: 'Cerrada' }
const FASES = {
  saludo: 'Saludo', descubrimiento: 'Conociéndolo', cualificado: 'Cualificado', enlace_enviado: 'Enlace enviado',
  agendado: 'Agendado', no_encaja: 'No encaja', humano: 'Pasa a persona',
}

export default function SetterIG({ clientId, client, onVolver }) {
  const [pestana, setPestana] = useState('bandeja')
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    setterIgApi.estado(clientId).then(setEstado).catch(e => setError(e.message))
  }, [clientId])
  useEffect(() => { cargar() }, [cargar])

  const cfg = estado?.config
  return (
    <div className="ag embebido sig-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Agentes</button>
          <h1>Setter de Instagram</h1>
          <p>
            Contesta los mensajes directos de {client?.name || 'este perfil'}, entiende qué busca cada persona y la lleva a la
            llamada. Cada lead entra en el CRM con su ficha y su conversación. Puedes revisar cada respuesta antes de que salga
            o dejar que conteste solo.
          </p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}
      {estado && <Estado estado={estado} />}

      <div className="sig-pestanas" role="tablist">
        {[['bandeja', 'Bandeja', Inbox], ['config', 'Configuración', Settings2], ['probar', 'Probar', FlaskConical]].map(([k, t, I]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} className={pestana === k ? 'on' : ''} onClick={() => setPestana(k)}>
            <I size={14} /> {t}
          </button>
        ))}
      </div>

      {!estado ? <p className="sig-ayuda"><Loader2 size={14} className="sig-gira" /> Cargando…</p>
        : pestana === 'bandeja' ? <Bandeja clientId={clientId} activo={cfg.activo} modo={cfg.modo} />
          : pestana === 'config' ? <Config clientId={clientId} estado={estado} onGuardada={cargar} />
            : <Probar clientId={clientId} config={cfg} />}
    </div>
  )
}

// ── Estado: qué falta para que funcione ─────────────────────────────────────
function Estado({ estado }) {
  const { cuenta, servidor, config } = estado
  const pasos = [
    { ok: servidor.oauth && servidor.webhook, texto: servidor.webhook ? 'Webhook de Instagram configurado en el servidor' : 'Falta configurar el webhook de Instagram en el servidor' },
    { ok: cuenta.conectada && cuenta.mensajes, texto: cuenta.mensajes ? `Mensajes de @${cuenta.usuario} conectados` : cuenta.conectada ? `@${cuenta.usuario} conectada solo para métricas: falta el permiso de mensajes` : 'Instagram sin conectar' },
    { ok: config.activo, texto: config.activo ? `Setter encendido · ${config.modo === 'auto' ? 'contesta solo' : 'deja borradores para aprobar'}` : 'Setter apagado: no contesta nada' },
  ]
  return (
    <ul className="sig-estado">
      {pasos.map((p, i) => (
        <li key={i} className={p.ok ? 'ok' : 'falta'}>{p.ok ? <Check size={13} /> : <AlertTriangle size={13} />} {p.texto}</li>
      ))}
      {cuenta.mensajesError && <li className="falta"><AlertTriangle size={13} /> Instagram dijo: {cuenta.mensajesError}</li>}
    </ul>
  )
}

// ── Bandeja ─────────────────────────────────────────────────────────────────
function Bandeja({ clientId, activo, modo }) {
  const [hilos, setHilos] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    setterIgApi.conversaciones(clientId).then(d => setHilos(d.conversaciones)).catch(e => setError(e.message))
  }, [clientId])
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 10_000)
    return () => clearInterval(t)
  }, [cargar])

  if (abierto) return <Hilo clientId={clientId} id={abierto} onVolver={() => { setAbierto(null); cargar() }} />

  return (
    <section>
      {error && <p className="ag-error">{error}</p>}
      {hilos == null ? <p className="sig-ayuda"><Loader2 size={14} className="sig-gira" /> Cargando conversaciones…</p>
        : !hilos.length ? (
          <p className="sig-ayuda">
            Aún no ha escrito nadie. Cuando alguien mande un DM a la cuenta, aparece aquí{activo ? (modo === 'auto' ? ' y el setter le contesta.' : ' con la respuesta del setter para que la apruebes.') : '. Enciende el setter en Configuración para que conteste.'}
          </p>
        ) : (
          <ul className="sig-hilos">
            {hilos.map(h => (
              <li key={h.id}>
                <button type="button" onClick={() => setAbierto(h.id)} className={h.borradores ? 'pendiente' : ''}>
                  <span className="sig-avatar">{nombreDe(h).replace('@', '').slice(0, 1).toUpperCase()}</span>
                  <span className="sig-hilo-txt">
                    <b>{nombreDe(h)}</b>
                    <small>{h.ultimo ? `${h.ultimo.autor === 'lead' ? '' : 'Tú: '}${h.ultimo.texto || '(adjunto)'}` : ''}</small>
                  </span>
                  <span className="sig-hilo-meta">
                    <small>{hora(h.ultimo_mensaje_at)}</small>
                    {h.borradores > 0 && <em className="sig-chip rojo">Por aprobar</em>}
                    {h.estado !== 'ia' && <em className="sig-chip">{h.estado === 'humano' ? 'Persona' : 'Cerrada'}</em>}
                    {h.fase && h.estado === 'ia' && <em className="sig-chip suave">{FASES[h.fase] || h.fase}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

function Hilo({ clientId, id, onVolver }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [textos, setTextos] = useState({})
  const [nuevo, setNuevo] = useState('')
  const [ocupado, setOcupado] = useState('')
  const fin = useRef(null)

  const cargar = useCallback(() => {
    setterIgApi.hilo(clientId, id).then(setD).catch(e => setError(e.message))
  }, [clientId, id])
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 8_000)
    return () => clearInterval(t)
  }, [cargar])
  const cuantos = d?.mensajes?.length || 0
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [cuantos])

  async function hacer(nombre, fn) {
    setOcupado(nombre); setError('')
    try { await fn(); cargar() } catch (e) { setError(e.message) }
    setOcupado('')
  }

  if (!d) return <p className="sig-ayuda">{error || <><Loader2 size={14} className="sig-gira" /> Abriendo la conversación…</>}</p>
  const c = d.conversacion
  const borradores = d.mensajes.filter(m => m.estado === 'borrador')
  const enviados = d.mensajes.filter(m => m.estado !== 'borrador')
  const datos = Object.entries(c.datos || {}).filter(([, v]) => v)

  return (
    <section className="sig-hilo">
      <div className="sig-hilo-cab">
        <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} /> Bandeja</button>
        <h2>{nombreDe(c)}</h2>
        <span className={`sig-chip ${c.estado === 'ia' ? 'suave' : ''}`}>{ESTADOS[c.estado]}</span>
        {!c.abierta && <span className="sig-chip rojo">Más de 24 h: Instagram no deja contestar</span>}
      </div>
      {c.estado === 'humano' && c.motivo_humano && <p className="sig-aviso"><Hand size={14} /> {c.motivo_humano}</p>}
      {error && <p className="ag-error">{error}</p>}

      <div className="sig-chat">
        {enviados.map(m => (
          <div key={m.id} className={`sig-msj ${m.autor} ${m.estado === 'error' ? 'fallo' : ''}`}>
            <p>{m.texto || (m.adjuntos?.length ? `(${m.adjuntos.map(a => a.tipo).join(', ')})` : '')}</p>
            <small>
              {m.autor === 'ia' ? 'Setter' : m.autor === 'humano' ? 'Persona (desde HELM)' : m.autor === 'instagram' ? 'Desde la app de Instagram' : ''} {hora(m.created_at)}
              {m.estado === 'error' && ` · No enviado: ${m.error || 'error'}`}
            </small>
          </div>
        ))}
        <div ref={fin} />
      </div>

      {borradores.length > 0 && (
        <div className="sig-borradores">
          <h3><Bot size={15} /> El setter propone</h3>
          {borradores.map(b => (
            <textarea key={b.id} value={textos[b.id] ?? b.texto ?? ''} rows={Math.min(5, Math.ceil(((textos[b.id] ?? b.texto) || '').length / 60) + 1)}
              onChange={e => setTextos(t => ({ ...t, [b.id]: e.target.value }))} />
          ))}
          <div className="sig-fila">
            <button type="button" className="ag-btn primario" disabled={!!ocupado || !c.abierta}
              onClick={() => hacer('aprobar', () => setterIgApi.aprobar(clientId, c.id, borradores.map(b => ({ id: b.id, texto: textos[b.id] ?? b.texto }))).then(() => setTextos({})))}>
              {ocupado === 'aprobar' ? <Loader2 size={14} className="sig-gira" /> : <Send size={14} />} Aprobar y enviar
            </button>
            <button type="button" className="ag-btn" disabled={!!ocupado} onClick={() => hacer('descartar', () => setterIgApi.descartar(clientId, c.id))}><X size={14} /> Descartar</button>
          </div>
        </div>
      )}

      <div className="sig-escribir">
        <textarea value={nuevo} rows={2} placeholder={c.abierta ? 'Escribe como persona del equipo (el setter deja de contestar en este hilo)' : 'Han pasado más de 24 h: contesta desde la app de Instagram'}
          disabled={!c.abierta} onChange={e => setNuevo(e.target.value)} />
        <button type="button" className="ag-btn primario" disabled={!nuevo.trim() || !!ocupado || !c.abierta}
          onClick={() => hacer('enviar', () => setterIgApi.enviar(clientId, c.id, nuevo).then(() => setNuevo('')))}>
          {ocupado === 'enviar' ? <Loader2 size={14} className="sig-gira" /> : <Send size={14} />} Enviar
        </button>
      </div>

      <div className="sig-fila">
        {c.estado !== 'ia'
          ? <button type="button" className="ag-btn" disabled={!!ocupado} onClick={() => hacer('control', () => setterIgApi.control(clientId, c.id, 'ia'))}><Bot size={14} /> Devolver al setter</button>
          : <button type="button" className="ag-btn" disabled={!!ocupado} onClick={() => hacer('control', () => setterIgApi.control(clientId, c.id, 'humano'))}><Hand size={14} /> Tomar el control</button>}
        {c.estado === 'ia' && c.abierta && (
          <button type="button" className="ag-btn" disabled={!!ocupado} onClick={() => hacer('responder', () => setterIgApi.responder(clientId, c.id))}>
            {ocupado === 'responder' ? <Loader2 size={14} className="sig-gira" /> : <RotateCcw size={14} />} Que conteste ya
          </button>
        )}
        {c.estado !== 'cerrada' && <button type="button" className="ag-btn" disabled={!!ocupado} onClick={() => hacer('control', () => setterIgApi.control(clientId, c.id, 'cerrada'))}><X size={14} /> Cerrar</button>}
      </div>

      {(c.resumen || datos.length > 0) && (
        <div className="sig-ficha">
          <h3>Lo que sabe el setter</h3>
          {c.fase && <p><b>Fase:</b> {FASES[c.fase] || c.fase}</p>}
          {c.resumen && <p>{c.resumen}</p>}
          {datos.length > 0 && <dl>{datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          {c.contact_id && <small className="sig-ayuda">Todo esto también está en su ficha del CRM.</small>}
        </div>
      )}
    </section>
  )
}

// ── Configuración ───────────────────────────────────────────────────────────
function Config({ clientId, estado, onGuardada }) {
  const [c, setC] = useState(estado.config)
  const [guardando, setGuardando] = useState(false)
  const [msj, setMsj] = useState('')
  useEffect(() => { setC(estado.config) }, [estado.config])
  const cambia = (k, v) => setC(x => ({ ...x, [k]: v }))
  const formsReserva = estado.formularios.filter(f => f.activo)

  async function guardar() {
    setGuardando(true); setMsj('')
    try { await setterIgApi.guardar(clientId, c); setMsj('Guardado'); onGuardada() } catch (e) { setMsj(e.message) }
    setGuardando(false)
  }
  async function conectar() {
    try { const { url } = await setterIgApi.conectar(clientId); window.location.href = url } catch (e) { setMsj(e.message) }
  }

  return (
    <section className="sig-config">
      {!estado.cuenta.mensajes && (
        <div className="sig-caja">
          <p><Instagram size={15} /> Para leer y contestar DM, Instagram tiene que dar a HELM el permiso de mensajes de la cuenta.</p>
          <button type="button" className="ag-btn primario" onClick={conectar} disabled={!estado.servidor.oauth}>Conectar mensajes de Instagram</button>
          <small className="sig-ayuda">
            Mientras Meta no apruebe ese permiso para la app de HELM, solo funciona con cuentas añadidas como probadoras en la app.
            Puedes preparar y probar el setter igualmente en la pestaña Probar.
          </small>
        </div>
      )}

      <label className="sig-interruptor">
        <input type="checkbox" checked={c.activo} onChange={e => cambia('activo', e.target.checked)} />
        <span><b>Setter encendido</b><small>Apagado no contesta a nadie; los mensajes se siguen guardando.</small></span>
      </label>

      <fieldset>
        <legend>Cómo contesta</legend>
        <label className="sig-opcion"><input type="radio" name="modo" checked={c.modo === 'borrador'} onChange={() => cambia('modo', 'borrador')} />
          <span><b>Borrador</b><small>Escribe la respuesta y espera a que alguien la apruebe o la corrija. Recomendado para empezar.</small></span></label>
        <label className="sig-opcion"><input type="radio" name="modo" checked={c.modo === 'auto'} onChange={() => cambia('modo', 'auto')} />
          <span><b>Automático</b><small>La manda sola. Si alguien del equipo escribe en el hilo, deja de contestar ahí.</small></span></label>
      </fieldset>

      <fieldset>
        <legend>A dónde lleva al lead</legend>
        <label className="sig-opcion"><input type="radio" name="obj" checked={c.objetivo === 'agendar'} onChange={() => cambia('objetivo', 'agendar')} />
          <span><b>Reservar llamada</b><small>Cuando el lead encaja, le pasa el formulario de reserva de HELM, ya enlazado a su ficha.</small></span></label>
        {c.objetivo === 'agendar' && (
          <select value={c.form_id || ''} onChange={e => cambia('form_id', e.target.value || null)}>
            <option value="">Sin formulario: pide día y hora y pasa a una persona</option>
            {formsReserva.map(f => <option key={f.id} value={f.id}>{f.titulo}{f.reserva ? ' · reserva llamada' : ''}</option>)}
          </select>
        )}
        <label className="sig-opcion"><input type="radio" name="obj" checked={c.objetivo === 'enlace'} onChange={() => cambia('objetivo', 'enlace')} />
          <span><b>Un enlace propio</b><small>Calendly, una landing, el pago… El que tú pongas.</small></span></label>
        {c.objetivo === 'enlace' && <input value={c.enlace || ''} placeholder="https://…" onChange={e => cambia('enlace', e.target.value)} />}
        <label className="sig-opcion"><input type="radio" name="obj" checked={c.objetivo === 'cualificar'} onChange={() => cambia('objetivo', 'cualificar')} />
          <span><b>Solo cualificar</b><small>Averigua qué busca y pasa el hilo a una persona del equipo.</small></span></label>
      </fieldset>

      <label>Lo que tiene que saber (oferta, para quién es, precios que se pueden decir, qué no prometer)
        <textarea rows={7} value={c.instrucciones || ''} onChange={e => cambia('instrucciones', e.target.value)}
          placeholder="Ej.: Vendemos un programa de 3 meses para dueños de clínicas dentales. No digas precios: se ven en la llamada. Si es estudiante, no encaja." />
      </label>
      <label>Preguntas para cualificar (en orden)
        <textarea rows={4} value={c.preguntas || ''} onChange={e => cambia('preguntas', e.target.value)}
          placeholder={'¿A qué te dedicas?\n¿Qué te gustaría conseguir en los próximos 3 meses?\n¿Qué has probado hasta ahora?'} />
      </label>
      <label>Primer mensaje: aviso de que es un asistente
        <textarea rows={2} value={c.aviso_ia || ''} placeholder={estado.avisoPorDefecto} onChange={e => cambia('aviso_ia', e.target.value)} />
        <small className="sig-ayuda">La ley obliga a decir que es una IA. Si lo dejas vacío, usa el de ejemplo.</small>
      </label>
      <label>Espera antes de contestar: {c.retraso_s} s
        <input type="range" min="5" max="180" step="5" value={c.retraso_s} onChange={e => cambia('retraso_s', Number(e.target.value))} />
        <small className="sig-ayuda">Junta los mensajes que llegan seguidos y no contesta como un robot a los dos segundos.</small>
      </label>

      <p className="sig-ayuda">Usa también la Biblia del perfil para el tono y lo que vende.</p>
      <div className="sig-fila">
        <button type="button" className="ag-btn primario" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="sig-gira" /> : <Check size={14} />} Guardar</button>
        {msj && <span className={msj === 'Guardado' ? 'sig-ok' : 'ag-error'}>{msj}</span>}
      </div>
    </section>
  )
}

// ── Simulador ───────────────────────────────────────────────────────────────
function Probar({ clientId, config }) {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [ultimo, setUltimo] = useState(null)
  const [error, setError] = useState('')
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [mensajes.length])

  async function mandar() {
    const t = texto.trim()
    if (!t) return
    const lista = [...mensajes, { autor: 'lead', texto: t }]
    setMensajes(lista); setTexto(''); setPensando(true); setError('')
    try {
      const r = await setterIgApi.probar(clientId, lista, config)
      setMensajes([...lista, ...[r.aviso, ...r.mensajes].filter(Boolean).map(x => ({ autor: 'ia', texto: x }))])
      setUltimo(r)
    } catch (e) { setError(e.message) }
    setPensando(false)
  }
  const datos = useMemo(() => Object.entries(ultimo?.datos || {}).filter(([, v]) => v), [ultimo])

  return (
    <section className="sig-probar">
      <p className="sig-ayuda">Escribe como si fueras alguien que manda un DM. Contesta con la configuración guardada, sin Instagram. Cada respuesta gasta créditos.</p>
      <div className="sig-chat">
        {mensajes.map((m, i) => <div key={i} className={`sig-msj ${m.autor}`}><p>{m.texto}</p></div>)}
        {pensando && <div className="sig-msj ia"><p><Loader2 size={14} className="sig-gira" /> Escribiendo…</p></div>}
        <div ref={fin} />
      </div>
      {error && <p className="ag-error">{error}</p>}
      {ultimo && (
        <div className="sig-ficha">
          <p><b>Fase:</b> {FASES[ultimo.fase] || ultimo.fase} · <b>Acción:</b> {ultimo.accion === 'seguir' ? 'seguir' : ultimo.accion === 'cerrar' ? 'cerrar' : 'pasar a una persona'}{ultimo.motivo ? ` (${ultimo.motivo})` : ''}</p>
          {ultimo.enlace && <p><Link2 size={13} /> Enlace que usaría: {ultimo.enlace}</p>}
          {datos.length > 0 && <dl>{datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        </div>
      )}
      <div className="sig-escribir">
        <textarea rows={2} value={texto} placeholder="Hola! Vi tu reel y me interesa…" onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar() } }} />
        <button type="button" className="ag-btn primario" onClick={mandar} disabled={pensando || !texto.trim()}><Send size={14} /> Enviar</button>
      </div>
      <button type="button" className="ag-btn sm" onClick={() => { setMensajes([]); setUltimo(null) }}><RotateCcw size={13} /> Empezar de nuevo</button>
    </section>
  )
}
