// AI PARA TODO — s4sf.net/aiparatodo
//
// La comunidad gratuita de Alex: sustituye a la «Charla gratis» de la bio.
//
//   /aiparatodo                      portada: qué es, fundador, llamada y la
//                                    puerta (nombre y correo para entrar)
//   /aiparatodo/comunidad            pantalla 1: las casillas (Skills, News,
//                                    Guía completa de Claude)
//   /aiparatodo/skills               el foro de skills, por temas
//   /aiparatodo/skills/<post>        un post, con cada skill, su instalación
//                                    y prompts de ejemplo para copiar
//
// Todo lo de dentro pide haber dejado el correo (se guarda en el navegador,
// como la bio). El alta entra en el CRM del perfil silvestre, pipeline
// «Página de inicio», con la nota de dónde vino.
import { useEffect, useState } from 'react'
import { Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, Lock, Instagram, Youtube, PhoneCall, Library, Users, Sparkles,
  Newspaper, BookOpen, Copy, Check, Github, Terminal, ChevronRight, Palette, MessageSquare,
} from 'lucide-react'
import { useCabeceraPublica } from '../inicio/cabecera.js'
import { altaLead } from '../inicio/crm.js'
import { track } from '../inicio/socio/track.js'
import mascara from '../inicio/mascara.txt?raw'
import aiArte from '../inicio/ai.txt?raw'
import { FUNDADOR, LLAMADA, ZONAS, TEMAS, POSTS, postPorSlug } from './contenido.js'
import './aip.css'

const LLAVE = 's4sf.aiparatodo'
const EVENTO = 'Entró en AI para todo (comunidad)'

function accesoGuardado() {
  try { return JSON.parse(localStorage.getItem(LLAVE) || 'null') } catch { return null }
}

export default function AIParaTodo() {
  const [acceso, setAcceso] = useState(accesoGuardado)
  useCabeceraPublica({
    titulo: 'AI para todo — la comunidad de IA de Alex Silvestre',
    descripcion: 'Skills, guías y novedades de IA en español, gratis. Deja tu correo y entra.',
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  })
  useEffect(() => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
    document.head.appendChild(l)
    return () => l.remove()
  }, [])

  const dentro = (el) => (acceso ? el : <Navigate to="/aiparatodo#entrar" replace />)

  return (
    <div className="aip">
      <Fondo />
      <Cabecera acceso={acceso} />
      <Routes>
        <Route index element={<Portada acceso={acceso} setAcceso={setAcceso} />} />
        <Route path="comunidad" element={dentro(<Comunidad acceso={acceso} />)} />
        <Route path="skills" element={dentro(<Foro />)} />
        <Route path="skills/:tema" element={dentro(<Foro />)} />
        <Route path="skills/:tema/:slug" element={dentro(<Post />)} />
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

function Cabecera({ acceso }) {
  return (
    <header className="aip-cab">
      <Link to="/aiparatodo" className="aip-logo">
        <span className="aip-logo-marca">AI</span>
        <span>para todo</span>
      </Link>
      <nav className="aip-nav">
        <Link to={acceso ? '/aiparatodo/comunidad' : '/aiparatodo#entrar'}><Users size={15} /> Comunidad</Link>
        <Link to={acceso ? '/aiparatodo/skills' : '/aiparatodo#entrar'}><Library size={15} /> Bóveda</Link>
        <a href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={15} /> Fundador</a>
        <a className="aip-nav-cta" href={LLAMADA} onClick={() => track('clic_cta', { donde: 'aip-nav-llamada' })}><PhoneCall size={15} /> Agenda llamada</a>
      </nav>
    </header>
  )
}

// ── Portada ─────────────────────────────────────────────────────────────────
function Portada({ acceso, setAcceso }) {
  const navigate = useNavigate()
  useEffect(() => { track('vista_pagina', { pagina: 'aiparatodo' }) }, [])
  useEffect(() => {
    if (window.location.hash === '#entrar') setTimeout(() => document.getElementById('entrar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }, [])

  return (
    <main className="aip-main">
      <section className="aip-hero">
        <p className="aip-kicker"><span className="aip-punto" /> root@s4sf:~$ ./aiparatodo --gratis</p>
        <h1>Toda la IA que te sirve.<br /><em>En español y gratis.</em></h1>
        <p className="aip-sub">
          Skills para Claude, guías y novedades explicadas sin humo, para que la IA trabaje en tu negocio
          y no solo en tus conversaciones. Deja tu correo y entras.
        </p>
        <div className="aip-hero-acc">
          {acceso
            ? <button className="aip-btn" onClick={() => navigate('/aiparatodo/comunidad')}>Entrar en la comunidad <ArrowRight size={18} /></button>
            : <a className="aip-btn" href="#entrar" onClick={(e) => { e.preventDefault(); document.getElementById('entrar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Quiero entrar <ArrowRight size={18} /></a>}
          <a className="aip-btn sec" href={LLAMADA}><PhoneCall size={17} /> Agenda una llamada</a>
        </div>
      </section>

      <section className="aip-sec">
        <h2 className="aip-h2"><span>01</span> Qué hay dentro</h2>
        <div className="aip-zonas">
          {ZONAS.map(z => <Zona key={z.key} z={z} bloqueada={!acceso} />)}
        </div>
      </section>

      <section className="aip-sec aip-dos">
        <article className="aip-card aip-fundador">
          <img src={FUNDADOR.foto} alt={FUNDADOR.nombre} loading="lazy" width="1100" height="1338" />
          <div>
            <h2 className="aip-h2 sin"><span>02</span> Sigue a nuestro fundador</h2>
            <p><b>{FUNDADOR.nombre}</b> monta sistemas con IA para negocios digitales y enseña cómo, paso a paso y con datos.</p>
            <div className="aip-fila">
              <a className="aip-btn sec" href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={16} /> {FUNDADOR.handle}</a>
              <a className="aip-btn sec" href={FUNDADOR.youtube} target="_blank" rel="noopener noreferrer"><Youtube size={16} /> YouTube</a>
            </div>
          </div>
        </article>
        <article className="aip-card aip-llamada">
          <h2 className="aip-h2 sin"><span>03</span> Agenda una llamada</h2>
          <p>¿Tienes un negocio y quieres que la IA trabaje en él? En 30 minutos miramos dónde se te escapa el tiempo y el dinero.</p>
          <a className="aip-btn" href={LLAMADA} onClick={() => track('clic_cta', { donde: 'aip-llamada' })}>Reservar mi llamada <ArrowRight size={18} /></a>
        </article>
      </section>

      <section className="aip-sec">
        <article className="aip-card aip-boveda">
          <Library size={22} />
          <div>
            <h2 className="aip-h2 sin"><span>04</span> La bóveda</h2>
            <p>Todo lo que publicamos queda aquí, ordenado por temas como un foro: cada skill con qué hace, cómo se instala y prompts listos para copiar.</p>
          </div>
        </article>
      </section>

      {!acceso && <Puerta setAcceso={setAcceso} />}
    </main>
  )
}

function Zona({ z, bloqueada }) {
  const Icono = { skills: Sparkles, news: Newspaper, guia: BookOpen }[z.key] || Sparkles
  const cuerpo = (
    <>
      <span className="aip-zona-ico"><Icono size={22} /></span>
      <h3>{z.titulo}</h3>
      <p>{z.desc}</p>
      <span className="aip-zona-pie">
        {!z.activa ? <span className="aip-pronto">Próximamente</span>
          : bloqueada ? <><Lock size={13} /> Deja tu correo</> : <>Entrar <ArrowRight size={14} /></>}
      </span>
    </>
  )
  if (!z.activa) return <div className="aip-zona off">{cuerpo}</div>
  return <Link className="aip-zona" to={bloqueada ? '/aiparatodo#entrar' : z.ruta}>{cuerpo}</Link>
}

// ── La puerta: nombre y correo ──────────────────────────────────────────────
function Puerta({ setAcceso }) {
  const [f, setF] = useState({ nombre: '', email: '' })
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function entrar(e) {
    e.preventDefault()
    setEstado('enviando'); setError(null)
    try {
      const lead = await altaLead({ nombre: f.nombre.trim(), email: f.email.trim(), evento: EVENTO })
      const acceso = { id: lead?.id || null, nombre: f.nombre.trim(), at: new Date().toISOString() }
      try { localStorage.setItem(LLAVE, JSON.stringify(acceso)) } catch { /* modo incógnito */ }
      track('lead', { donde: 'aiparatodo' })
      setAcceso(acceso)
      navigate('/aiparatodo/comunidad')
    } catch (err) {
      setError(err.message); setEstado(null)
    }
  }

  return (
    <section className="aip-sec" id="entrar">
      <form className="aip-card aip-puerta" onSubmit={entrar}>
        <p className="aip-kicker"><Lock size={13} /> acceso restringido</p>
        <h2>Deja tu correo y <em>entra</em></h2>
        <p>Nombre y correo, nada más. Te avisamos cuando haya skills y guías nuevas.</p>
        <div className="aip-campos">
          <input placeholder="Tu nombre" value={f.nombre} maxLength={80} autoComplete="given-name" onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} />
          <input type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={e => setF(s => ({ ...s, email: e.target.value }))} />
          <button className="aip-btn" disabled={estado === 'enviando' || !f.email.trim()}>
            {estado === 'enviando' ? 'Abriendo…' : <>Entrar <ArrowRight size={18} /></>}
          </button>
        </div>
        {error && <p className="aip-error">{error}</p>}
      </form>
    </section>
  )
}

// ── Pantalla 1: las casillas ────────────────────────────────────────────────
function Comunidad({ acceso }) {
  useEffect(() => { track('vista_pagina', { pagina: 'aiparatodo-comunidad' }) }, [])
  return (
    <main className="aip-main">
      <section className="aip-sec">
        <p className="aip-kicker"><span className="aip-punto" /> acceso concedido{acceso?.nombre ? ` · ${acceso.nombre}` : ''}</p>
        <h1 className="aip-h1">Bienvenido a <em>AI para todo</em></h1>
        <p className="aip-sub">Elige por dónde empezar. Vamos abriendo zonas nuevas cada pocas semanas.</p>
        <div className="aip-zonas grandes">
          {ZONAS.map(z => <Zona key={z.key} z={z} bloqueada={false} />)}
        </div>
      </section>
    </main>
  )
}

// ── El foro de skills ───────────────────────────────────────────────────────
function Foro() {
  const { tema: temaUrl } = useParams()
  const tema = temaUrl || 'todos'
  const posts = POSTS.filter(p => tema === 'todos' || p.tema === tema)
  const nombreTema = (k) => TEMAS.find(t => t.key === k)?.nombre || k

  return (
    <main className="aip-main">
      <nav className="aip-migas">
        <Link to="/aiparatodo/comunidad">Comunidad</Link><ChevronRight size={14} /><span>Skills</span>
      </nav>
      <section className="aip-sec">
        <h1 className="aip-h1">Skills</h1>
        <p className="aip-sub">Habilidades que se le instalan a Claude para que haga un trabajo concreto, y bien. Por temas.</p>

        <div className="aip-foro">
          <aside className="aip-temas">
            <Link className={'aip-tema' + (tema === 'todos' ? ' on' : '')} to="/aiparatodo/skills"><MessageSquare size={15} /> Todos los temas</Link>
            {TEMAS.map(t => (
              t.activo
                ? <Link key={t.key} className={'aip-tema' + (tema === t.key ? ' on' : '')} to={`/aiparatodo/skills/${t.key}`}>
                    <Palette size={15} /> {t.nombre} <b>{POSTS.filter(p => p.tema === t.key).length}</b>
                  </Link>
                : <span key={t.key} className="aip-tema off" title={t.desc}><Palette size={15} /> {t.nombre} <i>pronto</i></span>
            ))}
          </aside>

          <div className="aip-hilos">
            <div className="aip-hilos-cab"><span>Tema</span><span>Hilo</span><span>Skills</span></div>
            {posts.map(p => (
              <Link key={p.slug} className="aip-hilo" to={`/aiparatodo/skills/${p.tema}/${p.slug}`}>
                <span className="aip-etiqueta">{nombreTema(p.tema)}</span>
                <div>
                  <b>{p.titulo}</b>
                  <small>{p.resumen}</small>
                  <small className="aip-meta">{FUNDADOR.nombre} · {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {p.lectura}</small>
                </div>
                <span className="aip-num">{p.skills.length}</span>
              </Link>
            ))}
            {TEMAS.filter(t => !t.activo && (tema === 'todos')).map(t => (
              <div key={t.key} className="aip-hilo off">
                <span className="aip-etiqueta">{t.nombre}</span>
                <div><b>{t.desc}</b><small>Estamos preparando este tema.</small></div>
                <span className="aip-pronto">pronto</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

// ── Un post ─────────────────────────────────────────────────────────────────
function Post() {
  const { slug } = useParams()
  const p = postPorSlug(slug)
  useEffect(() => { if (p) track('vista_pagina', { pagina: 'aiparatodo-post', slug }) }, [p, slug])
  if (!p) return <Navigate to="/aiparatodo/skills" replace />

  return (
    <main className="aip-main aip-post">
      <nav className="aip-migas">
        <Link to="/aiparatodo/comunidad">Comunidad</Link><ChevronRight size={14} />
        <Link to="/aiparatodo/skills">Skills</Link><ChevronRight size={14} />
        <span>{p.titulo}</span>
      </nav>

      <header className="aip-post-cab">
        <p className="aip-kicker"><span className="aip-punto" /> {TEMAS.find(t => t.key === p.tema)?.nombre} · {p.skills.length} skills · {p.lectura}</p>
        <h1 className="aip-h1">{p.gancho}</h1>
        <p className="aip-sub">{p.resumen}</p>
      </header>

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

      <Link className="aip-volver" to="/aiparatodo/skills"><ArrowLeft size={16} /> Volver al foro</Link>
    </main>
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
