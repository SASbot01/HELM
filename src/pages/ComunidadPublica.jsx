// HELM — el portal público de la comunidad de un perfil: /c/<slug>
//
// Esto es lo que ve la gente de fuera. No es el panel y no da acceso a nada del
// negocio: solo al muro y a la formación de esa comunidad, y solo si el dueño le
// ha dado acceso. Se registra cualquiera con el enlace; entrar es otra cosa.
//
// Va con la marca del perfil (logo y nombre), no con la de HELM: para el alumno
// esto es la plataforma de su formador.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  GraduationCap, MessageSquare, Send, LogOut, Clock, Play, FileText, Link2, ChevronLeft, Loader2,
} from 'lucide-react'
import { miembroApi, tokenMiembro, guardarTokenMiembro } from '../helm/lib'
import { Markdown } from '../helm/md'
import { useHelmTheme } from '../helm/theme'
import { useMarcaEnLaPestana } from '../helm/marcaPestana'
import { Marca } from '../helm/marcaPestana.jsx'
import '../helm/theme.css'

// El vídeo de una lección puede ser de YouTube, de Vimeo o un archivo subido al
// bucket. Cada uno se muestra distinto, y una URL rara no puede romper la página.
function Video({ url }) {
  const embed = useMemo(() => {
    const u = String(url || '').trim()
    if (!u) return null
    const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)
    if (yt) return { tipo: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` }
    const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vimeo) return { tipo: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` }
    if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return { tipo: 'video', src: u }
    return { tipo: 'enlace', src: u }
  }, [url])

  if (!embed) return null
  if (embed.tipo === 'iframe') {
    return (
      <div className="helm-video">
        <iframe src={embed.src} title="Vídeo de la lección" allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" />
      </div>
    )
  }
  if (embed.tipo === 'video') {
    return <video className="helm-video-file" src={embed.src} controls preload="metadata" />
  }
  return (
    <a className="helm-btn primary" href={embed.src} target="_blank" rel="noreferrer">
      <Play size={15} /> Ver el vídeo
    </a>
  )
}

export default function ComunidadPublica() {
  const { slug } = useParams()
  const [theme] = useHelmTheme()
  const [portal, setPortal] = useState(null)      // { enabled, marca }
  const [sesion, setSesion] = useState(null)      // { miembro, marca }
  const [cargando, setCargando] = useState(true)

  useMarcaEnLaPestana(sesion?.marca || portal?.marca)

  // Al abrir: se pregunta por la comunidad y, si ya había sesión guardada, se
  // valida contra el servidor. Un token viejo de alguien a quien le han quitado
  // el acceso tiene que caducar aquí, no dejarle ver la formación.
  const arrancar = useCallback(async () => {
    try {
      const p = await miembroApi.portal(slug)
      setPortal(p)
      if (p.enabled && tokenMiembro(slug)) {
        try { setSesion(await miembroApi.me(slug)) }
        catch { guardarTokenMiembro(slug, null); setSesion(null) }
      }
    } catch (err) {
      setPortal({ error: err.message })
    }
    setCargando(false)
  }, [slug])

  // Igual que en el panel: los setState de arrancar() son posteriores al await
  // contra la API, así que no hay cascada. La regla no distingue el await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { arrancar() }, [arrancar])

  function salir() {
    guardarTokenMiembro(slug, null)
    setSesion(null)
  }

  if (cargando) {
    return (
      <div className="helm helm-portal" data-theme={theme}>
        <div className="helm-portal-box"><Loader2 size={20} className="helm-spin" /></div>
      </div>
    )
  }

  if (portal?.error || !portal) {
    return (
      <div className="helm helm-portal" data-theme={theme}>
        <div className="helm-portal-box">
          <h1>No hemos encontrado esta comunidad</h1>
          <p>{portal?.error || 'Comprueba el enlace con quien te lo haya dado.'}</p>
        </div>
      </div>
    )
  }

  if (!portal.enabled) {
    return (
      <div className="helm helm-portal" data-theme={theme}>
        <div className="helm-portal-box">
          <Marca marca={portal.marca} />
          <h1>Todavía no está abierta</h1>
          <p>Esta comunidad no acepta entradas ahora mismo. Vuelve a intentarlo más adelante.</p>
        </div>
      </div>
    )
  }

  if (!sesion) {
    return (
      <div className="helm helm-portal" data-theme={theme}>
        <Entrada slug={slug} marca={portal.marca} onDentro={setSesion} />
      </div>
    )
  }

  return <Dentro slug={slug} sesion={sesion} theme={theme} onSalir={salir} />
}


// ── Entrar o registrarse ───────────────────────────────────────────────────
function Entrada({ slug, marca, onDentro }) {
  const [modo, setModo] = useState('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pendiente, setPendiente] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (modo === 'login') {
        const r = await miembroApi.login(slug, { email: f.email, password: f.password })
        guardarTokenMiembro(slug, r.token)
        onDentro(await miembroApi.me(slug))
      } else {
        const r = await miembroApi.registro(slug, f)
        if (r.status === 'activo' && r.token) {
          guardarTokenMiembro(slug, r.token)
          onDentro(await miembroApi.me(slug))
        } else {
          // Sin aprobación automática, registrarse no es entrar: se dice claro
          // en vez de dejarle en una pantalla de login que va a fallar.
          setPendiente(true)
        }
      }
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  if (pendiente) {
    return (
      <div className="helm-portal-box">
        <Marca marca={marca} />
        <div className="helm-settings-ok" style={{ textAlign: 'left' }}>
          <Clock size={15} /> <b>Cuenta creada.</b> Tu acceso está pendiente de aprobación.
          En cuanto te den el visto bueno podrás entrar con tu email y tu contraseña.
        </div>
        <button className="helm-btn" onClick={() => { setPendiente(false); setModo('login') }}>
          Volver a la entrada
        </button>
      </div>
    )
  }

  return (
    <div className="helm-portal-box">
      <Marca marca={marca} />
      {marca?.bienvenida && <p className="helm-portal-bienvenida">{marca.bienvenida}</p>}

      <div className="helm-segmented" style={{ alignSelf: 'stretch' }}>
        <button type="button" className={modo === 'login' ? 'on' : ''} onClick={() => { setModo('login'); setError(null) }}>
          Ya tengo cuenta
        </button>
        <button type="button" className={modo === 'registro' ? 'on' : ''} onClick={() => { setModo('registro'); setError(null) }}>
          Crear cuenta
        </button>
      </div>

      <form className="helm-portal-form" onSubmit={submit}>
        {modo === 'registro' && (
          <label>
            Tu nombre
            <input className="helm-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="María García" required />
          </label>
        )}
        <label>
          Email
          <input className="helm-input" type="email" value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input
            className="helm-input" type="password" value={f.password}
            onChange={e => set('password', e.target.value)}
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
            placeholder={modo === 'registro' ? 'Mínimo 8 caracteres' : ''} required />
        </label>
        {error && <div className="helm-formerror">{error}</div>}
        <button className="helm-btn primary" disabled={busy}>
          {busy ? 'Un momento…' : modo === 'login' ? 'Entrar' : 'Crear mi cuenta'}
        </button>
      </form>
    </div>
  )
}

function Clases({ lecciones, onAbrir }) {
  return (
    <div className="helm-leccion-list">
      {lecciones.map((l, i) => (
        <button key={l.id} className="helm-leccion-main" onClick={() => onAbrir(l)}>
          <span className="helm-leccion-n">{i + 1}</span>
          <span>
            <b>{l.title}</b>
            <small>{l.video_url ? 'vídeo' : 'lectura'}{l.attachments?.length ? ` · ${l.attachments.length} archivo(s)` : ''}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Dentro: formación y muro ───────────────────────────────────────────────
function Dentro({ slug, sesion, theme, onSalir }) {
  const [tab, setTab] = useState('formacion')
  const [cursos, setCursos] = useState(null)
  const [leccion, setLeccion] = useState(null)
  const [mensajes, setMensajes] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    miembroApi.contenido(slug).then(r => setCursos(r.cursos)).catch(e => { setError(e.message); setCursos([]) })
  }, [slug])

  const cargarMuro = useCallback(() => miembroApi.muro(slug)
    .then(r => setMensajes(r.mensajes))
    .catch(e => { setError(e.message); setMensajes([]) }), [slug])

  useEffect(() => { if (tab === 'muro' && mensajes === null) cargarMuro() }, [tab, mensajes, cargarMuro])

  async function escribir(e) {
    e.preventDefault()
    const body = texto.trim()
    if (!body) return
    setEnviando(true); setError(null)
    try {
      const r = await miembroApi.escribir(slug, body)
      setMensajes(ms => [...(ms || []), r.mensaje])
      setTexto('')
    } catch (err) { setError(err.message) }
    setEnviando(false)
  }

  return (
    <div className="helm helm-portal-app" data-theme={theme}>
      <header className="helm-portal-top">
        <Marca marca={sesion.marca} />
        <div className="helm-portal-top-acts">
          <span className="helm-badge">{sesion.miembro.name}</span>
          <button className="helm-btn" onClick={onSalir}><LogOut size={15} /> Salir</button>
        </div>
      </header>

      <div className="helm-portal-tabs">
        <button className={'helm-tab' + (tab === 'formacion' ? ' active' : '')} onClick={() => { setTab('formacion'); setLeccion(null) }}>
          <GraduationCap size={15} /> Formación
        </button>
        <button className={'helm-tab' + (tab === 'muro' ? ' active' : '')} onClick={() => setTab('muro')}>
          <MessageSquare size={15} /> Muro
        </button>
      </div>

      <main className="helm-portal-main">
        {error && <div className="helm-formerror">{error}</div>}

        {tab === 'formacion' && (
          leccion ? (
            <article className="helm-leccion-ver">
              <button className="helm-linkbtn" onClick={() => setLeccion(null)}>
                <ChevronLeft size={13} /> Volver a la formación
              </button>
              <h1>{leccion.title}</h1>
              <Video url={leccion.video_url} />
              {leccion.body && <div className="helm-biblia-doc"><Markdown text={leccion.body} /></div>}
              {(leccion.attachments?.length || 0) > 0 && (
                <div className="helm-leccion-files">
                  <b>Material de esta lección</b>
                  {leccion.attachments.map((a, i) => (
                    <a key={a.url || i} className="helm-btn" href={a.url} target="_blank" rel="noreferrer">
                      {a.kind === 'link' ? <Link2 size={15} /> : <FileText size={15} />} {a.name}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ) : cursos === null ? (
            <div className="helm-empty">Cargando la formación…</div>
          ) : cursos.length === 0 ? (
            <div className="helm-empty">Todavía no hay formación publicada.</div>
          ) : (
            <div className="helm-portal-cursos">
              {cursos.map(c => {
                const modulos = c.modulos || []
                const sueltas = c.lecciones || []
                const vacio = modulos.every(m => m.lecciones.length === 0) && sueltas.length === 0
                return (
                  <section key={c.id} className="helm-panel">
                    <div className="helm-panel-head"><h2>{c.title}</h2></div>
                    <div className="helm-settings-body">
                      {c.description && <p className="helm-settings-lead">{c.description}</p>}
                      {vacio ? (
                        <div className="helm-empty">Sin clases todavía.</div>
                      ) : (
                        <>
                          {modulos.filter(m => m.lecciones.length > 0).map(m => (
                            <div key={m.id} className="helm-modulo">
                              <div className="helm-modulo-head">
                                <span className="helm-modulo-tit"><b>{m.title}</b></span>
                              </div>
                              {m.description && <p className="helm-curso-desc">{m.description}</p>}
                              <Clases lecciones={m.lecciones} onAbrir={setLeccion} />
                            </div>
                          ))}
                          {sueltas.length > 0 && <Clases lecciones={sueltas} onAbrir={setLeccion} />}
                        </>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )
        )}

        {tab === 'muro' && (
          <div className="helm-panel">
            <div className="helm-settings-body">
              {mensajes === null ? <div className="helm-empty">Cargando…</div>
                : mensajes.length === 0 ? <div className="helm-empty">Nadie ha escrito todavía. Rompe el hielo.</div>
                  : (
                    <div className="helm-muro">
                      {mensajes.map(m => (
                        <div key={m.id} className={'helm-com-msg' + (m.from_owner ? ' admin' : '')}>
                          <div className="helm-com-avatar ini">{(m.author_name || '?')[0].toUpperCase()}</div>
                          <div className="helm-com-body">
                            <div className="helm-com-head">
                              <b>{m.author_name}</b>
                              {m.from_owner && <span className="helm-badge green">Equipo</span>}
                              <small>{new Date(m.created_at).toLocaleString('es-ES')}</small>
                            </div>
                            <div className="helm-com-text">
                              {String(m.body).split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

              <form className="helm-chat-form" onSubmit={escribir} style={{ border: 'none', padding: '12px 0 0' }}>
                <textarea
                  className="helm-chat-input" rows={2} value={texto} maxLength={4000}
                  placeholder="Escribe al muro…" onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); escribir(e) } }}
                />
                <button className="helm-btn primary" disabled={enviando || !texto.trim()}><Send size={15} /></button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
