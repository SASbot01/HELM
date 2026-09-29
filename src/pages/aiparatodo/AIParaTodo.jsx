// AI PARA TODO — s4sf.net/aiparatodo
//
// La comunidad gratuita de Alex, desde el botón principal de la bio.
//
//   /aiparatodo                              portada: título, sigue al creador,
//                                            qué hay dentro y las 4 secciones
//   /aiparatodo/<seccion>                    el foro de la sección: temas e hilos
//   /aiparatodo/<seccion>/<tema>             un tema
//   /aiparatodo/<seccion>/<tema>/<hilo>      un hilo
//
// Todo se recorre sin dejar nada hasta la lista de hilos, como un foro abierto.
// LEER un hilo pide nombre y correo (una vez; se recuerda en el navegador). El
// alta entra en el CRM del perfil silvestre, pipeline «Página de inicio».
import { useEffect, useState } from 'react'
import { Routes, Route, Link, Navigate, useParams } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, Lock, Instagram, Sparkles, Newspaper, BookOpen, Users,
  Copy, Check, Github, Terminal, ChevronRight, MessageSquare, Hash,
} from 'lucide-react'
import { useCabeceraPublica } from '../inicio/cabecera.js'
import { altaLead } from '../inicio/crm.js'
import { track } from '../inicio/socio/track.js'
import mascara from '../inicio/mascara.txt?raw'
import aiArte from '../inicio/ai.txt?raw'
import { FUNDADOR, SECCIONES, seccionPorClave, postPorSlug, hilosDe, CAPITULOS } from './contenido.js'
import './aip.css'

const LLAVE = 's4sf.aiparatodo'
const EVENTO = 'Entró en AI para todo (comunidad)'
const ICONOS = { skills: Sparkles, news: Newspaper, comunidad: Users, guia: BookOpen }

function accesoGuardado() {
  try { return JSON.parse(localStorage.getItem(LLAVE) || 'null') } catch { return null }
}

export default function AIParaTodo() {
  const [acceso, setAcceso] = useState(accesoGuardado)
  useCabeceraPublica({
    titulo: 'AI para todo — la comunidad de IA de Alex Silvestre',
    descripcion: 'Skills para Claude, noticias, comunidad y la guía completa de Claude. En español y gratis.',
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  })
  useEffect(() => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
    document.head.appendChild(l)
    return () => l.remove()
  }, [])

  return (
    <div className="aip">
      <Fondo />
      <Cabecera />
      <Routes>
        <Route index element={<Portada />} />
        <Route path=":seccion" element={<Foro />} />
        <Route path=":seccion/:tema" element={<Foro />} />
        <Route path=":seccion/:tema/:slug" element={<Hilo acceso={acceso} setAcceso={setAcceso} />} />
        <Route path="*" element={<Navigate to="/aiparatodo" replace />} />
      </Routes>
      <Pie />
    </div>
  )
}

// ── El fondo: la máscara y el «AI» en ASCII, como la bio ───────────────────
const TROZOS = mascara.split(/(@+)/)
function Fondo() {
  return (
    <div className="aip-fondo" aria-hidden="true">
      <pre className="aip-ascii ai">{aiArte}</pre>
      <pre className="aip-ascii mascara">
        {TROZOS.map((t, i) => (t.startsWith('@') ? <span key={i} className="aip-ojo">{'█'.repeat(t.length)}</span> : t))}
      </pre>
      <div className="aip-lineas" />
    </div>
  )
}

function Cabecera() {
  return (
    <header className="aip-cab">
      <Link to="/aiparatodo" className="aip-logo">
        <span className="aip-logo-marca">AI</span>
        <span>para todo</span>
      </Link>
      <nav className="aip-nav">
        {SECCIONES.map(s => {
          const Icono = ICONOS[s.key]
          return <Link key={s.key} to={`/aiparatodo/${s.key}`}><Icono size={15} /> {s.key === 'guia' ? 'Guía' : s.titulo}</Link>
        })}
        <a className="aip-nav-cta" href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={15} /> Sigue al creador</a>
      </nav>
    </header>
  )
}

// ── Portada: una frase, el creador, qué hay y las cuatro puertas ───────────
function Portada() {
  useEffect(() => { track('vista_pagina', { pagina: 'aiparatodo' }) }, [])
  return (
    <main className="aip-main aip-portada">
      <h1>IA sin humo.</h1>
      <a
        className="aip-btn" href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer"
        onClick={() => track('clic_cta', { donde: 'aip-creador' })}
      >
        <Instagram size={18} /> Sigue a nuestro creador
      </a>
      <p className="aip-sub">
        Skills para Claude, las novedades que importan, una comunidad para preguntar y enseñar lo que
        montas, y la guía completa de Claude. En español y gratis. Entra donde quieras: para leer un
        hilo solo te pedimos el correo.
      </p>
      <div className="aip-zonas">
        {SECCIONES.map(s => {
          const Icono = ICONOS[s.key]
          const n = hilosDe(s.key).length
          return (
            <Link key={s.key} className="aip-zona" to={`/aiparatodo/${s.key}`}>
              <span className="aip-zona-ico"><Icono size={22} /></span>
              <h3>{s.titulo}</h3>
              <p>{s.desc}</p>
              <span className="aip-zona-pie">{s.temas.length} tema{s.temas.length === 1 ? '' : 's'} · {n} hilo{n === 1 ? '' : 's'} <ArrowRight size={14} /></span>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

// ── El foro de una sección ──────────────────────────────────────────────────
function Foro() {
  const { seccion: sk, tema } = useParams()
  const s = seccionPorClave(sk)
  useEffect(() => { if (s) track('vista_pagina', { pagina: 'aiparatodo-foro', seccion: sk, tema }) }, [s, sk, tema])
  if (!s) return <Navigate to="/aiparatodo" replace />
  const t = tema ? s.temas.find(x => x.key === tema) : null
  if (tema && !t) return <Navigate to={`/aiparatodo/${sk}`} replace />
  const hilos = hilosDe(sk, tema)

  return (
    <main className="aip-main">
      <nav className="aip-migas">
        <Link to="/aiparatodo">Inicio</Link><ChevronRight size={14} />
        {t ? <><Link to={`/aiparatodo/${sk}`}>{s.titulo}</Link><ChevronRight size={14} /><span>{t.nombre}</span></> : <span>{s.titulo}</span>}
      </nav>
      <section className="aip-sec">
        <h1 className="aip-h1">{t ? t.nombre : s.titulo}</h1>
        <p className="aip-sub">{t ? t.desc : s.desc}</p>

        <div className={'aip-foro' + (s.temas.length > 1 ? '' : ' sin-temas')}>
          {s.temas.length > 1 && (
            <aside className="aip-temas">
              <Link className={'aip-tema' + (!tema ? ' on' : '')} to={`/aiparatodo/${sk}`}><MessageSquare size={15} /> Todos</Link>
              {s.temas.map(x => (
                <Link key={x.key} className={'aip-tema' + (tema === x.key ? ' on' : '')} to={`/aiparatodo/${sk}/${x.key}`}>
                  <Hash size={15} /> {x.nombre} <b>{hilosDe(sk, x.key).length}</b>
                </Link>
              ))}
            </aside>
          )}

          <div className="aip-hilos">
            <div className="aip-hilos-cab"><span>Tema</span><span>Hilo</span><span /></div>
            {hilos.map(h => (
              <Link key={h.slug} className="aip-hilo" to={`/aiparatodo/${sk}/${h.tema}/${h.slug}`}>
                <span className="aip-etiqueta">{s.temas.find(x => x.key === h.tema)?.nombre}</span>
                <div>
                  <b>{h.n ? `${h.n} · ` : ''}{h.titulo}</b>
                  {h.resumen && <small>{h.resumen}</small>}
                  <small className="aip-meta">{FUNDADOR.nombre}{h.fecha ? ` · ${new Date(h.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}{h.lectura ? ` · ${h.lectura}` : ''}</small>
                </div>
                <span className="aip-candado">{h.pronto ? <span className="aip-pronto">pronto</span> : <Lock size={15} />}</span>
              </Link>
            ))}
            {hilos.length === 0 && (
              <div className="aip-hilo vacio">
                <span className="aip-etiqueta">{t ? t.nombre : s.titulo}</span>
                <div><b>Los primeros hilos están en camino</b><small>Sigue a nuestro creador para enterarte cuando se abran.</small></div>
                <span />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

// ── Un hilo: detrás del correo ──────────────────────────────────────────────
function Hilo({ acceso, setAcceso }) {
  const { seccion: sk, tema, slug } = useParams()
  const s = seccionPorClave(sk)
  const h = hilosDe(sk, tema).find(x => x.slug === slug)
  const p = postPorSlug(slug)
  useEffect(() => { if (h && acceso) track('vista_pagina', { pagina: 'aiparatodo-hilo', slug }) }, [h, acceso, slug])
  if (!s || !h) return <Navigate to={`/aiparatodo/${sk || ''}`} replace />
  const t = s.temas.find(x => x.key === tema)

  return (
    <main className="aip-main aip-post">
      <nav className="aip-migas">
        <Link to="/aiparatodo">Inicio</Link><ChevronRight size={14} />
        <Link to={`/aiparatodo/${sk}`}>{s.titulo}</Link><ChevronRight size={14} />
        {s.temas.length > 1 && <><Link to={`/aiparatodo/${sk}/${tema}`}>{t?.nombre}</Link><ChevronRight size={14} /></>}
        <span>{h.titulo}</span>
      </nav>

      <header className="aip-post-cab">
        <p className="aip-kicker"><span className="aip-punto" /> {t?.nombre}{p ? ` · ${p.skills.length} skills · ${p.lectura}` : ''}</p>
        <h1 className="aip-h1">{p ? p.gancho : h.titulo}</h1>
        {p && <p className="aip-sub">{p.resumen}</p>}
      </header>

      {!acceso ? <Puerta setAcceso={setAcceso} />
        : p ? <CuerpoPost p={p} />
          : (
            <section className="aip-card aip-pronto-card">
              <p>Este {sk === 'guia' ? 'capítulo' : 'hilo'} se publica pronto. Te avisamos al correo que dejaste.</p>
              {sk === 'guia' && (
                <ol>{CAPITULOS.map(c => <li key={c.slug} className={c.slug === slug ? 'on' : ''}><span>{c.n}</span> {c.titulo}</li>)}</ol>
              )}
            </section>
          )}

      <Link className="aip-volver" to={`/aiparatodo/${sk}`}><ArrowLeft size={16} /> Volver a {s.titulo}</Link>
    </main>
  )
}

// ── La puerta: nombre y correo para leer ────────────────────────────────────
function Puerta({ setAcceso }) {
  const [f, setF] = useState({ nombre: '', email: '' })
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)

  async function entrar(e) {
    e.preventDefault()
    setEstado('enviando'); setError(null)
    try {
      const lead = await altaLead({ nombre: f.nombre.trim(), email: f.email.trim(), evento: EVENTO })
      const acceso = { id: lead?.id || null, nombre: f.nombre.trim(), at: new Date().toISOString() }
      try { localStorage.setItem(LLAVE, JSON.stringify(acceso)) } catch { /* modo incógnito */ }
      track('lead', { donde: 'aiparatodo' })
      setAcceso(acceso)
    } catch (err) {
      setError(err.message); setEstado(null)
    }
  }

  return (
    <form className="aip-card aip-puerta" onSubmit={entrar}>
      <p className="aip-kicker"><Lock size={13} /> contenido para miembros</p>
      <h2>Deja tu correo para leerlo</h2>
      <p>Una sola vez: con tu nombre y tu correo se abren todos los hilos. Te avisamos cuando haya nuevos.</p>
      <div className="aip-campos">
        <input placeholder="Tu nombre" value={f.nombre} maxLength={80} autoComplete="given-name" onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} />
        <input type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={e => setF(s => ({ ...s, email: e.target.value }))} />
        <button className="aip-btn" disabled={estado === 'enviando' || !f.email.trim()}>
          {estado === 'enviando' ? 'Abriendo…' : <>Leer <ArrowRight size={18} /></>}
        </button>
      </div>
      {error && <p className="aip-error">{error}</p>}
    </form>
  )
}

// ── El cuerpo de un post de skills ──────────────────────────────────────────────────────────────
function CuerpoPost({ p }) {
  return (
    <>

      <section className="aip-card aip-indice">
        <h2>Qué vas a encontrar</h2>
        <ol>
          {p.skills.map(s => (
            <li key={s.clave}><a href={`#${s.clave}`}><span>{s.n}</span><b>{s.nombre}</b> — {s.corto}</a></li>
          ))}
        </ol>
        <p className="aip-nota">Las {p.skills.length} son gratis, oficiales de Anthropic y de código abierto. Solo necesitas Claude Code.</p>
      </section>

      {p.skills.map(s => (
        <section key={s.clave} id={s.clave} className="aip-skill">
          <p className="aip-skill-n"><span>{s.n}</span> {s.clave}</p>
          <h2>{s.titular}</h2>
          <p className="aip-historia">{s.historia}</p>
          <h3>Qué puedes hacer</h3>
          <ul className="aip-puedes">{s.puedes.map(x => <li key={x}>{x}</li>)}</ul>

          <div className="aip-repo">
            <Github size={16} />
            <div><code>anthropics/skills · {s.clave}</code><small>Skill oficial de Anthropic · código abierto</small></div>
            <a className="aip-btn sec pequeno" href={s.github} target="_blank" rel="noopener noreferrer">Ver en GitHub <ArrowRight size={14} /></a>
          </div>

          <Codigo titulo="Instalar solo esta skill" nota="En tu terminal. La copia a ~/.claude/skills y Claude Code la usa sola cuando toca." texto={s.suelta} />

          <div className="aip-ejemplos">
            {s.ejemplos.map(e => <Prompt key={e.titulo} {...e} />)}
          </div>
        </section>
      ))}

      <section className="aip-skill aip-bonus">
        <p className="aip-skill-n"><span>+</span> bonus</p>
        <h2>Las cinco de una vez</h2>
        <p className="aip-historia">{p.instalarTodo.explica}</p>
        <Codigo titulo="Instalar las 5 en Claude Code" texto={p.instalarTodo.comando} />
      </section>

      <section className="aip-card aip-resumen">
        <h2>Resumen rápido</h2>
        <table>
          <thead><tr><th>#</th><th>Skill</th><th>Para qué</th></tr></thead>
          <tbody>
            {p.skills.map(s => <tr key={s.clave}><td>{s.n}</td><td><a href={s.github} target="_blank" rel="noopener noreferrer">{s.nombre}</a></td><td>{s.corto}</td></tr>)}
          </tbody>
        </table>
      </section>

    </>
  )
}

function useCopiar() {
  const [copiado, setCopiado] = useState(false)
  const copiar = (t) => {
    navigator.clipboard?.writeText(t).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }).catch(() => {})
  }
  return [copiado, copiar]
}

function Codigo({ titulo, nota, texto }) {
  const [copiado, copiar] = useCopiar()
  return (
    <div className="aip-codigo">
      <div className="aip-codigo-cab">
        <span><Terminal size={14} /> {titulo}</span>
        <button type="button" onClick={() => copiar(texto)}>{copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
      </div>
      <pre>{texto}</pre>
      {nota && <small>{nota}</small>}
    </div>
  )
}

function Prompt({ titulo, texto }) {
  const [copiado, copiar] = useCopiar()
  return (
    <div className="aip-prompt">
      <div className="aip-prompt-cab">
        <b>{titulo}</b>
        <button type="button" onClick={() => copiar(texto)}>{copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar prompt</>}</button>
      </div>
      <p>{texto}</p>
    </div>
  )
}

function Pie() {
  return (
    <footer className="aip-pie">
      <span>© {new Date().getFullYear()} AI para todo · {FUNDADOR.nombre}</span>
      <span className="aip-pie-links">
        <a href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href={FUNDADOR.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>
        <a href="/privacidad">Privacidad</a>
      </span>
    </footer>
  )
}
