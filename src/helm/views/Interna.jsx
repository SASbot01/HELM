// HELM — Comunidad interna: la comunidad y la formación DE ESTE perfil.
//
// Cuatro pestañas y una idea: esto es tu Discord y tu Skool, dentro de HELM.
//   Muro      → lo que ven tus miembros al entrar; publicas como la marca.
//   Formación → cursos con sus lecciones (vídeo, texto y archivos).
//   Miembros  → quién se ha registrado por el enlace público y a quién dejas entrar.
//   Ajustes   → el enlace que le pasas a la gente y cómo se comporta.
//
// No confundir con la sección "Comunidad", que es el hilo común de todos los
// negocios de HELM. Esta es tuya y de tus alumnos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users, GraduationCap, MessageSquare, Settings, Plus, Trash2, Check, X, Ban,
  Copy, ChevronRight, ChevronDown, Video, Link2, Send, AlertTriangle, Eye, EyeOff,
} from 'lucide-react'
import {
  supabase, internaApi, fetchRowsOrError, insertRow, updateRow, deleteRow,
  fmtDate, MISSING_TABLE, brandOf,
} from '../lib'
import { Panel, Empty, Field, Input, Textarea, Select, Tabs, Modal, FormNote } from '../ui'
import { Markdown } from '../md'
import Adjuntos from '../Adjuntos'
import MigracionPendiente from '../MigracionPendiente'

const TABS = [
  { key: 'muro', label: 'Muro', icon: <MessageSquare size={15} /> },
  { key: 'formacion', label: 'Formación', icon: <GraduationCap size={15} /> },
  { key: 'miembros', label: 'Miembros', icon: <Users size={15} /> },
  { key: 'config', label: 'Ajustes', icon: <Settings size={15} /> },
]

const ESTADO_LABEL = { pendiente: 'Pendiente', activo: 'Con acceso', bloqueado: 'Bloqueado' }
const ESTADO_TONO = { pendiente: 'amber', activo: 'green', bloqueado: 'red' }

export default function Interna({ clientId, client }) {
  const [tab, setTab] = useState('muro')
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)

  const cargarConfig = useCallback(() => internaApi.config(clientId)
    .then(setConfig)
    .catch(e => setError(e.message)), [clientId])

  useEffect(() => { cargarConfig() }, [cargarConfig])

  return (
    <div className="helm-settings">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {config && !config.config.enabled && tab !== 'config' && (
        <div className="helm-settings-warn" style={{ marginBottom: 16 }}>
          <AlertTriangle size={15} />
          <span>
            La comunidad está <b>desactivada</b>: el enlace público no funciona todavía y nadie
            puede registrarse. Actívala en la pestaña <b>Ajustes</b>.
          </span>
        </div>
      )}
      {error && <div className="helm-formerror">{error}</div>}

      {tab === 'muro' ? <Muro clientId={clientId} client={client} />
        : tab === 'formacion' ? <Formacion clientId={clientId} />
          : tab === 'miembros' ? <Miembros clientId={clientId} onCambio={cargarConfig} />
            : <ConfigCard clientId={clientId} config={config} onGuardado={cargarConfig} />}
    </div>
  )
}

// ── Muro ───────────────────────────────────────────────────────────────────
function Muro({ clientId, client }) {
  const [mensajes, setMensajes] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const marca = brandOf(client)

  const load = useCallback(() => supabase.from('helm_community_wall')
    .select('*').eq('client_id', clientId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(200)
    .then(({ data, error: e }) => {
      if (e) { setError(e.message); setMensajes([]); return }
      setMensajes((data || []).reverse())
    }), [clientId])

  useEffect(() => { load() }, [load])

  async function publicar(e) {
    e.preventDefault()
    const body = texto.trim()
    if (!body) return
    setEnviando(true); setError(null)
    try {
      await internaApi.publicar(clientId, body)
      setTexto('')
      await load()
    } catch (err) { setError(err.message) }
    setEnviando(false)
  }

  async function borrar(m) {
    if (!confirm('¿Borrar este mensaje del muro?')) return
    setMensajes(ms => ms.filter(x => x.id !== m.id))
    // Borrado blando, igual que en la comunidad de HELM: si el mensaje tenía
    // respuestas, quitarlo del todo dejaría huérfano el hilo.
    await supabase.from('helm_community_wall')
      .update({ deleted_at: new Date().toISOString() }).eq('id', m.id)
  }

  return (
    <Panel title="Muro de la comunidad">
      <div className="helm-settings-body">
        <p className="helm-settings-lead">
          Lo que publiques aquí lo verán todos tus miembros al entrar, y ellos pueden
          responder. Publicas como <b>{marca.name}</b>.
        </p>

        <form className="helm-chat-form" onSubmit={publicar} style={{ border: 'none', padding: 0 }}>
          <textarea
            className="helm-chat-input" rows={2} value={texto} maxLength={4000}
            placeholder="Escribe un anuncio, una pregunta o el enlace de la sesión de esta semana…"
            onChange={e => setTexto(e.target.value)}
          />
          <button className="helm-btn primary" disabled={enviando || !texto.trim()}>
            <Send size={15} />
          </button>
        </form>

        {error && <div className="helm-formerror">{error}</div>}

        {mensajes === null ? <Empty>Cargando…</Empty>
          : mensajes.length === 0 ? <Empty>El muro está vacío. Escribe lo primero.</Empty>
            : (
              <div className="helm-muro">
                {mensajes.map(m => (
                  <div key={m.id} className={'helm-com-msg' + (m.from_owner ? ' admin' : '')}>
                    <div className="helm-com-avatar ini">{(m.author_name || '?')[0].toUpperCase()}</div>
                    <div className="helm-com-body">
                      <div className="helm-com-head">
                        <b>{m.author_name}</b>
                        {m.from_owner && <span className="helm-badge green">Tú</span>}
                        <small>{new Date(m.created_at).toLocaleString('es-ES')}</small>
                        <button className="helm-com-del" onClick={() => borrar(m)} aria-label="Borrar">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="helm-com-text">
                        {String(m.body).split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </div>
    </Panel>
  )
}

// ── Formación ──────────────────────────────────────────────────────────────
function Formacion({ clientId }) {
  const [cursos, setCursos] = useState(null)
  const [lecciones, setLecciones] = useState([])
  const [fatal, setFatal] = useState(null)
  const [abierto, setAbierto] = useState(null)     // curso desplegado
  const [nuevoCurso, setNuevoCurso] = useState(false)
  const [edit, setEdit] = useState(null)           // lección en edición
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    // Las dos consultas a la vez: los cursos y sus lecciones se pintan juntos,
    // así que esperar una detrás de la otra solo suma latencia.
    const [{ rows, error: e }, { data }] = await Promise.all([
      fetchRowsOrError('helm_courses', clientId, { order: 'position', asc: true }),
      supabase.from('helm_lessons').select('*')
        .eq('client_id', clientId).order('position').order('created_at'),
    ])
    if (e) { setFatal(e); setCursos([]); return }
    setCursos(rows)
    setLecciones(data || [])
  }, [clientId])

  // El linter marca esto como "setState dentro del efecto", pero los setState de
  // load() ocurren DESPUÉS de await: no hay render en cascada. La regla no sabe
  // seguir el await, y cargar datos al montar es exactamente para lo que existe
  // un efecto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const porCurso = useMemo(() => {
    const map = {}
    for (const l of lecciones) (map[l.course_id] = map[l.course_id] || []).push(l)
    return map
  }, [lecciones])

  async function crearCurso(form) {
    await insertRow('helm_courses', {
      client_id: clientId, title: form.title.trim(),
      description: form.description || '', position: (cursos?.length || 0),
    })
    setNuevoCurso(false); load()
  }

  async function borrarCurso(c) {
    if (!confirm(`¿Borrar el curso "${c.title}" y todas sus lecciones? No se puede deshacer.`)) return
    setError(null)
    try { await deleteRow('helm_courses', c.id); load() }
    catch (e) { setError(e.message) }
  }

  async function togglePublicado(tabla, fila) {
    const next = !fila.published
    try {
      await updateRow(tabla, fila.id, { published: next, updated_at: new Date().toISOString() })
      load()
    } catch (e) { setError(e.message) }
  }

  async function guardarLeccion(form) {
    const fila = {
      client_id: clientId, course_id: form.course_id,
      title: form.title.trim(), body: form.body || '',
      video_url: form.video_url.trim(), attachments: form.attachments,
      updated_at: new Date().toISOString(),
    }
    if (form.id) await updateRow('helm_lessons', form.id, fila)
    else await insertRow('helm_lessons', { ...fila, position: (porCurso[form.course_id]?.length || 0) })
    setEdit(null); load()
  }

  async function borrarLeccion(l) {
    if (!confirm(`¿Borrar la lección "${l.title}"?`)) return
    await deleteRow('helm_lessons', l.id); load()
  }

  if (fatal === MISSING_TABLE) {
    return <MigracionPendiente seccion="Formación" archivo="migrations/helm_comunidad_interna.sql" />
  }

  return (
    <Panel
      title="Formación"
      action={<button className="helm-btn primary" onClick={() => setNuevoCurso(true)}><Plus size={15} /> Nuevo curso</button>}
    >
      <div className="helm-settings-body">
        <p className="helm-settings-lead">
          Tu formación, por cursos y lecciones. Cada lección puede llevar un vídeo, texto y
          archivos descargables. Lo que esté <b>sin publicar</b> no lo ven los miembros.
        </p>

        {error && <div className="helm-formerror">{error}</div>}

        {cursos === null ? <Empty>Cargando…</Empty>
          : cursos.length === 0 ? <Empty>Todavía no hay ningún curso. Crea el primero.</Empty>
            : cursos.map(c => {
              const abiertoEste = abierto === c.id
              const suyas = porCurso[c.id] || []
              return (
                <div key={c.id} className="helm-curso">
                  <div className="helm-curso-head">
                    <button className="helm-curso-toggle" onClick={() => setAbierto(abiertoEste ? null : c.id)}>
                      {abiertoEste ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <b>{c.title}</b>
                      <small>{suyas.length === 1 ? '1 lección' : `${suyas.length} lecciones`}</small>
                    </button>
                    <div className="helm-curso-acts">
                      <button className="helm-btn sm" onClick={() => togglePublicado('helm_courses', c)}>
                        {c.published ? <><Eye size={13} /> Publicado</> : <><EyeOff size={13} /> Oculto</>}
                      </button>
                      <button className="helm-btn sm" onClick={() => setEdit({ course_id: c.id, title: '', body: '', video_url: '', attachments: [] })}>
                        <Plus size={13} /> Lección
                      </button>
                      <button className="helm-btn sm" onClick={() => borrarCurso(c)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {c.description && <p className="helm-curso-desc">{c.description}</p>}

                  {abiertoEste && (
                    suyas.length === 0
                      ? <Empty>Este curso no tiene lecciones.</Empty>
                      : (
                        <div className="helm-leccion-list">
                          {suyas.map((l, i) => (
                            <div key={l.id} className="helm-leccion">
                              <button className="helm-leccion-main" onClick={() => setEdit({ ...l, attachments: Array.isArray(l.attachments) ? l.attachments : [] })}>
                                <span className="helm-leccion-n">{i + 1}</span>
                                <span>
                                  <b>{l.title}</b>
                                  <small>
                                    {l.video_url ? <><Video size={11} /> vídeo</> : 'sin vídeo'}
                                    {l.body ? ' · con texto' : ''}
                                    {(l.attachments?.length || 0) > 0 ? ` · ${l.attachments.length} archivo(s)` : ''}
                                  </small>
                                </span>
                              </button>
                              <div className="helm-curso-acts">
                                <button className="helm-btn sm" onClick={() => togglePublicado('helm_lessons', l)}>
                                  {l.published ? <Eye size={13} /> : <EyeOff size={13} />}
                                </button>
                                <button className="helm-btn sm" onClick={() => borrarLeccion(l)}><Trash2 size={13} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                  )}
                </div>
              )
            })}
      </div>

      {nuevoCurso && <CursoModal onClose={() => setNuevoCurso(false)} onSave={crearCurso} />}
      {edit && (
        <LeccionModal
          clientId={clientId} leccion={edit}
          onClose={() => setEdit(null)} onSave={guardarLeccion} />
      )}
    </Panel>
  )
}

function CursoModal({ onClose, onSave }) {
  const [f, setF] = useState({ title: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!f.title.trim()) return setError('Ponle un título')
    setBusy(true); setError(null)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Nuevo curso" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Título *"><Input value={f.title} autoFocus onChange={e => setF({ ...f, title: e.target.value })} placeholder="Fundamentos de entrenamiento" /></Field>
        <Field label="Descripción" hint="Una o dos líneas de qué se aprende aquí.">
          <Textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        </Field>
        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={busy}>{busy ? 'Creando…' : 'Crear curso'}</button>
        </div>
      </form>
    </Modal>
  )
}

function LeccionModal({ clientId, leccion, onClose, onSave }) {
  const [f, setF] = useState(leccion)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!f.title.trim()) return setError('Ponle un título a la lección')
    setBusy(true); setError(null)
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={f.id ? 'Editar lección' : 'Nueva lección'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label="Título *"><Input value={f.title} autoFocus onChange={e => set('title', e.target.value)} /></Field>
        <Field
          label="Vídeo"
          hint="Pega el enlace de YouTube o Vimeo. También vale un MP4 subido más abajo."
        >
          <Input value={f.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>
        <Field label="Contenido" hint="Se puede usar markdown: **negrita**, listas, títulos.">
          <Textarea rows={10} value={f.body} onChange={e => set('body', e.target.value)} />
        </Field>
        <Field
          label="Archivos y enlaces"
          hint="PDFs, plantillas, hojas de cálculo… o un enlace a una carpeta de Drive, un Notion o un Figma."
        >
          <Adjuntos
            clientId={clientId} carpeta="formacion" enlaces
            value={f.attachments} onChange={v => set('attachments', v)} />
        </Field>
        <FormNote>{error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar lección'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Miembros ───────────────────────────────────────────────────────────────
function Miembros({ clientId, onCambio }) {
  const [miembros, setMiembros] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => internaApi.miembros(clientId)
    .then(r => setMiembros(r.miembros))
    .catch(e => { setError(e.message); setMiembros([]) }), [clientId])

  useEffect(() => { load() }, [load])

  const visibles = useMemo(
    () => (miembros || []).filter(m => filtro === 'todos' || m.status === filtro),
    [miembros, filtro],
  )
  const cuenta = useMemo(() => {
    const c = { pendiente: 0, activo: 0, bloqueado: 0 }
    for (const m of miembros || []) c[m.status]++
    return c
  }, [miembros])

  async function cambiar(m, status) {
    setBusy(m.id); setError(null)
    try {
      await internaApi.estado(clientId, m.id, status)
      setMiembros(ms => ms.map(x => x.id === m.id ? { ...x, status } : x))
      onCambio?.()
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  async function borrar(m) {
    if (!confirm(`¿Borrar a ${m.name} de la comunidad? Tendría que registrarse otra vez.`)) return
    setBusy(m.id); setError(null)
    try {
      await internaApi.borrarMiembro(clientId, m.id)
      setMiembros(ms => ms.filter(x => x.id !== m.id))
      onCambio?.()
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  async function aprobarTodos() {
    if (!confirm(`¿Dar acceso a los ${cuenta.pendiente} pendientes?`)) return
    setError(null)
    try { await internaApi.aprobarTodos(clientId); await load(); onCambio?.() }
    catch (e) { setError(e.message) }
  }

  return (
    <Panel
      title="Miembros"
      action={cuenta.pendiente > 0 && (
        <button className="helm-btn primary" onClick={aprobarTodos}>
          <Check size={15} /> Aprobar los {cuenta.pendiente} pendientes
        </button>
      )}
    >
      <div className="helm-settings-body">
        <p className="helm-settings-lead">
          Quien entra por tu enlace público aparece aquí. Mientras esté <b>pendiente</b> no puede
          entrar; al darle acceso, ve el muro y toda la formación publicada.
        </p>

        <div className="helm-chips">
          {[['todos', 'Todos', (miembros || []).length], ['pendiente', 'Pendientes', cuenta.pendiente],
            ['activo', 'Con acceso', cuenta.activo], ['bloqueado', 'Bloqueados', cuenta.bloqueado]].map(([k, l, n]) => (
              <button key={k} className={'helm-chip' + (filtro === k ? ' active' : '')} onClick={() => setFiltro(k)}>
                {l} <b>{n}</b>
              </button>
            ))}
        </div>

        {error && <div className="helm-formerror">{error}</div>}

        {miembros === null ? <Empty>Cargando…</Empty>
          : visibles.length === 0 ? <Empty>Nadie por aquí todavía.</Empty>
            : (
              <div className="helm-tablewrap">
                <table className="helm-table">
                  <thead>
                    <tr>
                      <th>Miembro</th><th>Estado</th><th>Registro</th><th>Última entrada</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(m => (
                      <tr key={m.id}>
                        <td>
                          <b>{m.name}</b>
                          <small style={{ display: 'block', color: 'var(--text-mut)' }}>{m.email}</small>
                        </td>
                        <td><span className={'helm-chip ' + ESTADO_TONO[m.status]}>{ESTADO_LABEL[m.status]}</span></td>
                        <td>{fmtDate(m.created_at)}</td>
                        <td>{m.last_login_at ? fmtDate(m.last_login_at) : '—'}</td>
                        <td>
                          <div className="helm-curso-acts">
                            {m.status !== 'activo' && (
                              <button className="helm-btn sm" disabled={busy === m.id} onClick={() => cambiar(m, 'activo')}>
                                <Check size={13} /> Dar acceso
                              </button>
                            )}
                            {m.status === 'activo' && (
                              <button className="helm-btn sm" disabled={busy === m.id} onClick={() => cambiar(m, 'bloqueado')}>
                                <Ban size={13} /> Quitar acceso
                              </button>
                            )}
                            {m.status === 'pendiente' && (
                              <button className="helm-btn sm" disabled={busy === m.id} onClick={() => cambiar(m, 'bloqueado')}>
                                <X size={13} /> Rechazar
                              </button>
                            )}
                            <button className="helm-btn sm" disabled={busy === m.id} onClick={() => borrar(m)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </Panel>
  )
}

// ── Ajustes de la comunidad ────────────────────────────────────────────────
function ConfigCard({ clientId, config, onGuardado }) {
  const [f, setF] = useState(null)
  const [origen, setOrigen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState(null)

  // La config llega del servidor después del primer render. Se copia al
  // formulario aquí, durante el render, y no en un efecto: así no hay un
  // fotograma con los campos vacíos.
  if (config && config.config !== origen) {
    setOrigen(config.config)
    setF({ ...config.config })
  }

  if (!config || !f) return <Panel title="Ajustes"><div className="helm-empty">Cargando…</div></Panel>
  const set = (k, v) => { setSaved(false); setF(s => ({ ...s, [k]: v })) }

  async function guardar(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await internaApi.guardarConfig(clientId, f); setSaved(true); onGuardado?.() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <Panel title="Ajustes de la comunidad" action={f.enabled ? <span className="helm-badge green">Activa</span> : <span className="helm-badge">Desactivada</span>}>
      <form className="helm-settings-body" onSubmit={guardar}>
        <div className="helm-settings-block" style={{ borderTop: 'none', paddingTop: 0 }}>
          <label>El enlace que le pasas a tu gente</label>
          <p>
            Con este enlace se registran ellos mismos. No hace falta que crees cuentas a mano:
            se apuntan, te aparecen en <b>Miembros</b> y tú decides quién entra.
          </p>
          <div className="helm-copyrow">
            <code>{config.url}</code>
            <button
              type="button" className="helm-btn"
              onClick={() => { navigator.clipboard?.writeText(config.url); setCopiado(true); setTimeout(() => setCopiado(false), 1800) }}
            >
              {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <small className="helm-settings-note">
            <Link2 size={12} /> Mientras la comunidad esté desactivada, ese enlace enseña un aviso
            y no deja registrarse.
          </small>
        </div>

        <label className="helm-checkline">
          <input type="checkbox" checked={f.enabled} onChange={e => set('enabled', e.target.checked)} />
          Comunidad activa (el enlace funciona y se puede entrar)
        </label>

        <label className="helm-checkline">
          <input type="checkbox" checked={f.auto_approve} onChange={e => set('auto_approve', e.target.checked)} />
          Dar acceso automáticamente a todo el que se registre
        </label>
        <small className="helm-settings-note" style={{ marginTop: -8 }}>
          Sin marcar (lo recomendable si vendes la formación), cada registro espera tu aprobación
          en <b>Miembros</b>. Marcado, entra cualquiera con el enlace.
        </small>

        <Field label="Nombre de la comunidad" hint="Si lo dejas vacío se usa el nombre de tu marca.">
          <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="La comunidad de…" maxLength={80} />
        </Field>
        <Field label="Bienvenida" hint="Lo primero que se lee al abrir el enlace.">
          <Textarea rows={4} value={f.welcome} onChange={e => set('welcome', e.target.value)}
            placeholder="Aquí dentro tienes la formación completa, el muro para preguntar y las sesiones en directo." />
        </Field>

        {error && <div className="helm-formerror">{error}</div>}
        <button className="helm-btn primary" disabled={busy} style={{ justifySelf: 'start' }}>
          {busy ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </form>
    </Panel>
  )
}
