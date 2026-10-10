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
// LEER un hilo pide cuatro datos —nombre, correo, profesión e ingresos— una
// vez; se recuerda en el navegador. El alta entra en el CRM del perfil
// silvestre (ver crm.js): la guía en PDF de los no negociables va al embudo
// «Lead magnet» y el resto a «Página de inicio».
//
// News no es contenido fijo: son las noticias que deja cada mañana el agente de
// noticias de HELM en el perfil silvestre, leídas de /api/aiparatodo.
import { useEffect, useState } from 'react'
import { Routes, Route, Link, Navigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, Lock, Instagram, Sparkles, Newspaper, BookOpen, Users,
  Copy, Check, Github, Terminal, ChevronRight, MessageSquare, Hash, Download,
  Lightbulb, AlertTriangle, Info, ExternalLink, FileText, BrainCircuit, Cpu, ShieldAlert, Blocks,
} from 'lucide-react'
import { useCabeceraPublica } from '../inicio/cabecera.js'
import { track } from '../inicio/socio/track.js'
import { origen } from '../inicio/socio/origen.js'
import mascara from '../inicio/mascara.txt?raw'
import aiArte from '../inicio/ai.txt?raw'
import {
  FUNDADOR, SECCIONES, seccionPorClave, postPorSlug, hilosDe, CAPITULOS, capituloPorSlug,
  NN_HILO, NN_RUTA,
} from './contenido.js'
import { NN_PDF, NN_PORTADA_3D, NN_INTRO, NN_PUNTOS, NN_ORDEN } from './noNegociables.js'
import {
  MODOS_HILO, MODOS_RUTA, MODOS_PDF, MODOS_PORTADA_3D, MODOS_GANCHO, MODOS_INTRO,
  MODOS_INDICE, MODOS_BLOQUES, MODOS_CLAVES, MODOS_ORDEN, MODOS_FUENTES,
} from './guiaModos.js'
import { altaMiembro, anota, INGRESOS, PIPELINE_COMUNIDAD, PIPELINE_LEAD_MAGNET } from './crm.js'
import '../../fonts/inter-tight.css'
import '../../fonts/jetbrains-mono.css'
import './aip.css'

// v2: desde octubre de 2026 la puerta pide cuatro datos. Quien entró antes
// solo con el correo los deja una vez más.
const LLAVE = 's4sf.aiparatodo.v2'
const ICONOS = { skills: Sparkles, news: Newspaper, comunidad: Users, guia: BookOpen }
const fechaCorta = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

function accesoGuardado() {
  try { return JSON.parse(localStorage.getItem(LLAVE) || 'null') } catch { return null }
}

export default function AIParaTodo() {
  // Las UTM se guardan al aterrizar, mientras siguen en la URL: los enlaces de
  // dentro las quitan, y el alta las necesita para saber de qué Reel vino.
  useState(() => origen())
  const [acceso, setAcceso] = useState(accesoGuardado)
  useCabeceraPublica({
    titulo: 'AI para todo — la comunidad de IA de Alex Silvestre',
    descripcion: 'Skills para Claude, noticias de cada día, comunidad y la guía completa de Claude. En español y gratis.',
    imagen: '/inicio/og.jpg', colorBarra: '#050203',
  })
  return (
    <div className="aip">
      <Fondo />
      <Cabecera />
      <Routes>
        <Route index element={<Portada />} />
        <Route path=":seccion" element={<Seccion />} />
        <Route path=":seccion/:tema" element={<Seccion />} />
        <Route path=":seccion/:tema/:slug" element={<HiloRuta acceso={acceso} setAcceso={setAcceso} />} />
        <Route path="*" element={<Navigate to="/aiparatodo" replace />} />
      </Routes>
      <Pie />
    </div>
  )
}

// ── Las noticias del día, de HELM ──────────────────────────────────────────
// Una sola petición por visita: la lista y el hilo leen de la misma promesa.
let noticiasEnCurso = null
function pideNoticias() {
  if (!noticiasEnCurso) {
    noticiasEnCurso = fetch('/api/aiparatodo?action=noticias')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => (Array.isArray(d?.noticias) ? d.noticias : []).map(n => ({
        ...n, seccion: 'news', slug: `${n.fecha}-${n.puesto}`, titulo: n.titular,
      })))
      // 'error' y no []: «no hay noticias» y «no se han podido cargar» no son
      // lo mismo, y un enlace compartido no debe redirigir por un fallo de red.
      .catch(() => { noticiasEnCurso = null; return 'error' })
  }
  return noticiasEnCurso
}
function useNoticias(activo = true) {
  const [lista, setLista] = useState(null)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    pideNoticias().then(l => { if (vivo) setLista(l) })
    return () => { vivo = false }
  }, [activo])
  return lista
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
      {/* Lo primero que se ve: la guía principal gratuita en PDF. */}
      <BannerModos donde="portada" />
      <a
        className="aip-btn" href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer"
        onClick={() => track('clic_cta', { donde: 'aip-creador' })}
      >
        <Instagram size={18} /> Sigue a nuestro creador
      </a>
      <p className="aip-sub">
        Skills para Claude, las noticias del día que importan, una comunidad para preguntar y enseñar lo que
        montas, y la guía completa de Claude. En español y gratis. Entra donde quieras: para leer un
        hilo solo te pedimos cuatro datos, una vez.
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
              <span className="aip-zona-pie">
                {s.key === 'news' ? 'Tres piezas al día · y las breves' : `${s.temas.length} tema${s.temas.length === 1 ? '' : 's'} · ${n} hilo${n === 1 ? '' : 's'}`}
                <ArrowRight size={14} />
              </span>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

// La guía en PDF, anunciada donde se lee de Claude.
function BannerNoNegociables({ donde }) {
  return (
    <Link className="aip-nn-banner" to={NN_RUTA} onClick={() => track('clic_cta', { donde: `aip-nn-${donde}` })}>
      <img src={NN_PORTADA_3D} alt="" width="900" height="900" loading="lazy" />
      <div>
        <p className="aip-kicker"><FileText size={13} /> Guía gratuita en PDF</p>
        <h3>Mis 8 <em>no negociables</em> con Claude</h3>
        <p>Cómo trabajo para que la IA haga el trabajo de verdad, y no solo te dé conversación. Composio, Skills, Loops, Modo plan, Subagentes, Hooks, el modelo correcto y Todo a GitHub.</p>
        <span className="aip-btn pequeno">Descárgala <ArrowRight size={14} /></span>
      </div>
    </Link>
  )
}

// La guía principal en PDF: los Mods de Claude (el lead magnet del último Reel).
function BannerModos({ donde }) {
  return (
    <Link className="aip-nn-banner" to={MODOS_RUTA} onClick={() => track('clic_cta', { donde: `aip-modos-${donde}` })}>
      <img src={MODOS_PORTADA_3D} alt="" width="900" height="900" loading="lazy" />
      <div>
        <p className="aip-kicker"><FileText size={13} /> Guía gratuita en PDF</p>
        <h3>Los <em>Mods</em> de Claude</h3>
        <p>3 usos de los que nadie habla, los prompts para que Claude te los construya solo, y cómo no meterte un troyano. Todo comprobado contra la documentación oficial.</p>
        <span className="aip-btn pequeno">Descárgala <ArrowRight size={14} /></span>
      </div>
    </Link>
  )
}

// ── El foro de una sección ──────────────────────────────────────────────────
function Foro() {
  const { seccion: sk, tema } = useParams()
  const s = seccionPorClave(sk)
  const esNews = sk === 'news'
  const recibidas = useNoticias(esNews)
  const fallo = recibidas === 'error'
  const noticias = fallo ? [] : recibidas
  useEffect(() => { if (s) track('vista_pagina', { pagina: 'aiparatodo-foro', seccion: sk, tema }) }, [s, sk, tema])
  if (!s) return <Navigate to="/aiparatodo" replace />
  const t = tema ? s.temas.find(x => x.key === tema) : null
  if (tema && !t) return <Navigate to={`/aiparatodo/${sk}`} replace />
  const hilos = esNews ? (noticias || []).filter(n => !tema || n.tema === tema) : hilosDe(sk, tema)
  const cuenta = (k) => (esNews ? (noticias || []).filter(n => n.tema === k).length : hilosDe(sk, k).length)

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
              {s.temas.filter(x => cuenta(x.key) > 0 || tema === x.key).map(x => (
                <Link key={x.key} className={'aip-tema' + (tema === x.key ? ' on' : '')} to={`/aiparatodo/${sk}/${x.key}`}>
                  <Hash size={15} /> {x.nombre} <b>{cuenta(x.key)}</b>
                </Link>
              ))}
            </aside>
          )}

          <div className="aip-tarjetas">
            {hilos.map(h => <TarjetaHilo key={`${h.tema}-${h.slug}`} h={h} sk={sk} tema={s.temas.find(x => x.key === h.tema)} />)}
            {hilos.length === 0 && (
              <div className="aip-card aip-tarjetas-vacio">
                <b>Los primeros hilos están en camino</b>
                <p>Sigue a nuestro creador para enterarte cuando se abran.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

// Una tarjeta de hilo, al estilo del banner de los no negociables: portada,
// tema, título y un botón. La portada es el render 3D en los no negociables, y
// un icono sobre degradado en el resto (capítulos, skills, MCP).
const PORTADA_HILO = { skills: Sparkles, mcp: Blocks, guia: BookOpen, comunidad: Users }
function TarjetaHilo({ h, sk, tema }) {
  const esNN = h.slug === NN_HILO.slug
  const esModos = h.slug === MODOS_HILO.slug
  const esPdf = esNN || esModos
  const cover3d = h.portada || (esNN ? NN_PORTADA_3D : esModos ? MODOS_PORTADA_3D : null)
  const Icono = h.tipo === 'mcp' ? Blocks : PORTADA_HILO[sk] || Sparkles
  const claseTema = sk === 'guia' ? (esPdf ? 'nn' : 'cap') : (h.tema || sk)
  return (
    <Link className={'aip-tarjeta' + (h.pronto ? ' pronto' : '') + (esModos ? ' principal' : '')} to={`/aiparatodo/${sk}/${h.tema}/${h.slug}`}>
      <div className={`aip-tarjeta-cover ${claseTema}`}>
        {cover3d
          ? <img src={cover3d} alt="" width="900" height="900" loading="lazy" />
          : <Icono size={44} />}
        {h.n && <span className="aip-tarjeta-n">{h.n}</span>}
      </div>
      <div className="aip-tarjeta-txt">
        <p className="aip-kicker">{esPdf ? <><FileText size={13} /> Guía en PDF{esModos ? ' · principal' : ''}</> : <>{tema?.nombre || ''}</>}</p>
        <h3>{h.titulo}</h3>
        {h.resumen && <p>{recorta(h.resumen, 150)}</p>}
        <span className="aip-tarjeta-pie">
          {h.pronto ? <span className="aip-pronto">pronto</span>
            : <><span className="aip-btn pequeno">{esPdf ? 'Descárgala' : 'Leer'} <ArrowRight size={14} /></span>{h.lectura && <small>{h.lectura}</small>}</>}
        </span>
      </div>
    </Link>
  )
}

const recorta = (t, n) => (String(t).length > n ? `${String(t).slice(0, n).replace(/\s+\S*$/, '')}…` : t)

// ── Un hilo: detrás de la puerta ────────────────────────────────────────────
function Hilo({ acceso, setAcceso }) {
  const { seccion: sk, tema, slug } = useParams()
  const s = seccionPorClave(sk)
  const esNews = sk === 'news'
  const recibidas = useNoticias(esNews)
  const noticias = recibidas === 'error' ? [] : recibidas
  const { hash } = useLocation()
  const esNN = sk === 'guia' && tema === NN_HILO.tema && slug === NN_HILO.slug
  const esModos = sk === 'guia' && tema === MODOS_HILO.tema && slug === MODOS_HILO.slug
  const capitulo = sk === 'guia' && tema === 'capitulos' ? capituloPorSlug(slug) : null
  const post = sk === 'skills' ? postPorSlug(slug) : null
  const noticia = esNews ? (noticias || []).find(n => n.slug === slug && n.tema === tema) : null
  const h = esNews ? noticia : hilosDe(sk, tema).find(x => x.slug === slug)

  useEffect(() => { if (h && acceso) track('vista_pagina', { pagina: 'aiparatodo-hilo', seccion: sk, slug }) }, [h, acceso, sk, slug])
  // Un enlace con #apartado abierto en frío: cuando se monta el hilo (la página
  // va en su propio archivo), ScrollToTop ya buscó el ancla y no la encontró.
  // Las anclas son ASCII (ver ancla()), así que no hace falta decodificar.
  useEffect(() => { if (acceso && hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [acceso, slug, hash])
  if (esNews && recibidas === null) return <main className="aip-main aip-post"><p className="aip-sub">Cargando…</p></main>
  if (esNews && recibidas === 'error') return <main className="aip-main aip-post"><p className="aip-sub">No se ha podido cargar la noticia. Prueba a recargar la página en un momento.</p></main>
  if (!s || !h) return <Navigate to={`/aiparatodo/${sk || ''}`} replace />
  const t = s.temas.find(x => x.key === tema)

  // La puerta: en las guías en PDF entra al embudo «Lead magnet».
  const puerta = esModos
    ? <Puerta setAcceso={setAcceso} pipeline={PIPELINE_LEAD_MAGNET} nota="pidió la guía Los Mods de Claude (PDF)"
      titulo="Descárgate la guía" texto="Cuatro datos y es tuya, con todos los prompts, junto con todos los hilos de AI para todo." boton="Descargar" />
    : esNN
      ? <Puerta setAcceso={setAcceso} pipeline={PIPELINE_LEAD_MAGNET} nota="pidió la guía Mis 8 no negociables (PDF)"
        titulo="Descárgate la guía" texto="Cuatro datos y es tuya, junto con todos los hilos de AI para todo." boton="Descargar" />
      : <Puerta setAcceso={setAcceso} pipeline={PIPELINE_COMUNIDAD} nota={`entró por ${sk}/${slug}`} />

  let kicker = t?.nombre
  if (post) kicker += ` · ${post.skills.length} ${post.tipo === 'repo' ? 'apartados' : 'skills'} · ${post.lectura}`
  if (capitulo) kicker = `Capítulo ${capitulo.n}${capitulo.lectura ? ` · ${capitulo.lectura}` : ''}`
  if (noticia) kicker = `${t?.nombre} · ${noticia.fuente} · ${fechaLarga(noticia.fecha)}`
  if (esNN) kicker = `Guía en PDF · ${NN_PUNTOS.length} puntos`
  if (esModos) kicker = `Guía en PDF · guía principal · ${MODOS_INDICE.length} puntos`

  const titular = post ? post.gancho : capitulo?.texto ? capitulo.texto.gancho : esNN ? 'Mis 8 no negociables con Claude' : esModos ? MODOS_GANCHO : h.titulo
  const sub = post ? post.resumen : capitulo ? capitulo.resumen : esNN ? NN_HILO.resumen : esModos ? MODOS_HILO.resumen : null

  return (
    <main className="aip-main aip-post">
      <nav className="aip-migas">
        <Link to="/aiparatodo">Inicio</Link><ChevronRight size={14} />
        <Link to={`/aiparatodo/${sk}`}>{s.titulo}</Link><ChevronRight size={14} />
        {s.temas.length > 1 && <><Link to={`/aiparatodo/${sk}/${tema}`}>{t?.nombre}</Link><ChevronRight size={14} /></>}
        <span>{capitulo ? `${capitulo.n} · ${capitulo.titulo}` : h.titulo}</span>
      </nav>

      <header className={'aip-post-cab' + (esNN || esModos ? ' aip-nn-cab' : '')}>
        <div>
          <p className="aip-kicker"><span className="aip-punto" /> {kicker}</p>
          <h1 className="aip-h1">{titular}</h1>
          {sub && <p className="aip-sub">{sub}</p>}
        </div>
        {esNN && <img className="aip-nn-3d" src={NN_PORTADA_3D} alt="La guía «Mis 8 no negociables con Claude»" width="900" height="900" />}
        {esModos && <img className="aip-nn-3d" src={MODOS_PORTADA_3D} alt="La guía «Los Mods de Claude»" width="900" height="900" />}
      </header>

      {/* Lo que se ve antes de dejar los datos: el índice, para saber qué hay dentro. */}
      {!acceso && capitulo?.texto && <IndiceCapitulo c={capitulo.texto} />}
      {!acceso && esNN && <IndiceNN />}
      {!acceso && esModos && <IndiceModos />}

      {!acceso ? puerta
        : post ? <CuerpoPost p={post} />
          : capitulo?.texto ? <CuerpoCapitulo c={capitulo.texto} />
            : noticia ? <CuerpoNoticia n={noticia} />
              : esModos ? <CuerpoGuiaModos acceso={acceso} />
              : esNN ? <CuerpoNoNegociables acceso={acceso} />
                : (
                  <section className="aip-card aip-pronto-card">
                    <p>Este {sk === 'guia' ? 'capítulo' : 'hilo'} se publica pronto. Te avisamos al correo que dejaste.</p>
                    {sk === 'guia' && (
                      <ol>{CAPITULOS.map(c => <li key={c.slug} className={c.slug === slug ? 'on' : ''}><span>{c.n}</span> {c.titulo}</li>)}</ol>
                    )}
                  </section>
                )}

      {acceso && capitulo && <SiguienteCapitulo actual={capitulo} />}
      {acceso && (capitulo || post) && <BannerNoNegociables donde={capitulo ? 'capitulo' : 'skills'} />}

      <Link className="aip-volver" to={`/aiparatodo/${sk}`}><ArrowLeft size={16} /> Volver a {s.titulo}</Link>
    </main>
  )
}

// ── La puerta: cuatro datos para leer ───────────────────────────────────────
function Puerta({
  setAcceso, pipeline, nota,
  titulo = 'Deja tus datos para leerlo',
  texto = 'Una sola vez: con estos cuatro datos se abren todos los hilos, los capítulos de la guía y las noticias. Te avisamos cuando haya nuevos.',
  boton = 'Leer',
}) {
  const [f, setF] = useState({ nombre: '', email: '', profesion: '', ingresos: '' })
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const pon = (campo) => (e) => setF(s => ({ ...s, [campo]: e.target.value }))
  const completo = f.nombre.trim() && f.email.trim() && f.profesion.trim() && f.ingresos

  async function entrar(e) {
    e.preventDefault()
    if (!completo) return
    setEstado('enviando'); setError(null)
    try {
      const lead = await altaMiembro({ ...f, nombre: f.nombre.trim(), email: f.email.trim(), pipeline, nota })
      const acceso = {
        id: lead?.id || null, nombre: f.nombre.trim(), profesion: f.profesion.trim(),
        ingresos: f.ingresos, at: new Date().toISOString(),
      }
      try { localStorage.setItem(LLAVE, JSON.stringify(acceso)) } catch { /* modo incógnito */ }
      track('lead', { donde: 'aiparatodo', embudo: pipeline, ingresos: f.ingresos })
      setAcceso(acceso)
    } catch (err) {
      setError(err.message); setEstado(null)
    }
  }

  return (
    <form className="aip-card aip-puerta" onSubmit={entrar}>
      <p className="aip-kicker"><Lock size={13} /> contenido para miembros</p>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      <div className="aip-campos cuatro">
        <input aria-label="Nombre" placeholder="Tu nombre" required value={f.nombre} maxLength={80} autoComplete="given-name" onChange={pon('nombre')} />
        <input aria-label="Correo" type="email" placeholder="Tu correo" required value={f.email} maxLength={160} autoComplete="email" inputMode="email" onChange={pon('email')} />
        <input className="ancho" aria-label="Profesión" placeholder="Tu profesión (ej. editor de vídeo, nutricionista, abogada)" required value={f.profesion} maxLength={120} autoComplete="organization-title" onChange={pon('profesion')} />
        <fieldset className="aip-ingresos">
          <legend>Tus ingresos al mes</legend>
          {Object.entries(INGRESOS).map(([valor, etiqueta]) => (
            <label key={valor} className={f.ingresos === valor ? 'on' : ''}>
              <input type="radio" name="ingresos" value={valor} aria-label={etiqueta} required checked={f.ingresos === valor} onChange={pon('ingresos')} />
              <span>{etiqueta.replace('/mes', '')}</span>
            </label>
          ))}
        </fieldset>
        <button className="aip-btn" disabled={estado === 'enviando' || !completo}>
          {estado === 'enviando' ? 'Abriendo…' : <>{boton} <ArrowRight size={18} /></>}
        </button>
      </div>
      {error && <p className="aip-error" role="alert">{error}</p>}
      <p className="aip-legal">Usamos tus datos solo para enviarte contenido de AI para todo. Puedes darte de baja cuando quieras. <a href="/privacidad">Privacidad</a></p>
    </form>
  )
}

// ── Texto con **negrita** y `código` ────────────────────────────────────────
function Rico({ texto }) {
  const partes = String(texto ?? '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
    return p
  })
}

const ancla = (texto, i) => `s-${i}-${String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`

// ── Un capítulo de la guía ──────────────────────────────────────────────────
function IndiceCapitulo({ c, enlaces = false }) {
  const apartados = c.bloques.map((b, i) => ({ b, i })).filter(({ b }) => b.tipo === 'h2')
  if (!apartados.length) return null
  return (
    <section className="aip-card aip-indice">
      <h2>{enlaces ? 'En este capítulo' : 'Qué vas a aprender'}</h2>
      <ol>
        {apartados.map(({ b, i }, k) => (
          <li key={i}>
            {enlaces
              ? <a href={`#${ancla(b.texto, i)}`}><span>{String(k + 1).padStart(2, '0')}</span><b><Rico texto={b.texto} /></b></a>
              : <span className="aip-indice-item"><span>{String(k + 1).padStart(2, '0')}</span><b><Rico texto={b.texto} /></b></span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

const AVISOS = { truco: Lightbulb, ojo: AlertTriangle, dato: Info }

function Bloque({ b, i }) {
  switch (b.tipo) {
    case 'h2': return <h2 id={ancla(b.texto, i)} className="aip-cap-h2"><Rico texto={b.texto} /></h2>
    case 'h3': return <h3 className="aip-cap-h3"><Rico texto={b.texto} /></h3>
    case 'p': return <p className="aip-cap-p"><Rico texto={b.texto} /></p>
    case 'lista': return <ul className="aip-cap-lista">{(b.items || []).map((x, k) => <li key={k}><Rico texto={x} /></li>)}</ul>
    case 'pasos': return (
      <ol className="aip-cap-pasos">
        {(b.items || []).map((x, k) => (
          <li key={k}><span>{k + 1}</span><div><b><Rico texto={x.titulo} /></b>{x.texto && <p><Rico texto={x.texto} /></p>}</div></li>
        ))}
      </ol>
    )
    case 'aviso': {
      const Icono = AVISOS[b.variante] || Info
      return (
        <aside className={`aip-aviso ${b.variante || 'dato'}`}>
          <Icono size={18} />
          <div>{b.titulo && <b><Rico texto={b.titulo} /></b>}<p><Rico texto={b.texto} /></p></div>
        </aside>
      )
    }
    case 'prompt': return <Prompt titulo={b.titulo} texto={b.texto} />
    case 'codigo': return <Codigo titulo={b.titulo || 'Terminal'} nota={b.nota} texto={b.texto} />
    case 'tabla': return (
      <div className="aip-cap-tabla">
        <table>
          <thead><tr>{(b.cabecera || []).map((c, k) => <th key={k}><Rico texto={c} /></th>)}</tr></thead>
          <tbody>{(b.filas || []).map((f, k) => <tr key={k}>{f.map((c, j) => <td key={j}><Rico texto={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    )
    default: return null
  }
}

function CuerpoCapitulo({ c }) {
  return (
    <>
      <IndiceCapitulo c={c} enlaces />
      <article className="aip-capitulo">
        {c.bloques.map((b, i) => <Bloque key={i} b={b} i={i} />)}
      </article>
      {c.claves?.length > 0 && (
        <section className="aip-card aip-claves">
          <h2>Lo que te llevas</h2>
          <ul>{c.claves.map((x, k) => <li key={k}><Check size={16} /><span><Rico texto={x} /></span></li>)}</ul>
        </section>
      )}
      {c.fuentes?.length > 0 && (
        <section className="aip-fuentes">
          <h3>Fuentes oficiales</h3>
          <ul>
            {c.fuentes.map(f => (
              <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.texto} <ExternalLink size={12} /></a></li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function SiguienteCapitulo({ actual }) {
  const i = CAPITULOS.findIndex(c => c.slug === actual.slug)
  const sig = CAPITULOS[i + 1]
  if (!sig) return null
  return (
    <Link className="aip-siguiente" to={`/aiparatodo/guia/capitulos/${sig.slug}`}>
      <small>Siguiente capítulo</small>
      <b>{sig.n} · {sig.titulo}</b>
      <ArrowRight size={18} />
    </Link>
  )
}

// ── Una noticia del día ─────────────────────────────────────────────────────
function CuerpoNoticia({ n }) {
  return (
    <section className="aip-card aip-noticia">
      <p className="aip-noticia-resumen">{n.resumen}</p>
      <a className="aip-btn sec" href={n.url} target="_blank" rel="noopener noreferrer" onClick={() => track('clic_cta', { donde: 'aip-noticia-fuente' })}>
        Leer la noticia en {n.fuente} <ExternalLink size={15} />
      </a>
    </section>
  )
}

// ── La guía en PDF: los no negociables ──────────────────────────────────────
function IndiceNN() {
  return (
    <section className="aip-card aip-indice">
      <h2>Qué hay dentro</h2>
      <ol className="aip-nn-indice">
        {NN_PUNTOS.map(p => <li key={p.n}><span className="aip-indice-item"><span>{p.n}</span><b>{p.nombre}</b></span></li>)}
      </ol>
    </section>
  )
}

function Descarga({ acceso, donde }) {
  return (
    <a
      className="aip-btn aip-descarga" href={NN_PDF} download
      onClick={() => { track('descarga', { recurso: 'no-negociables', donde }); anota(acceso?.id, 'AI para todo · descargó la guía Mis 8 no negociables (PDF)') }}
    >
      <Download size={18} /> Descargar el PDF
    </a>
  )
}

function CuerpoNoNegociables({ acceso }) {
  return (
    <>
      <section className="aip-card aip-nn-listo">
        <p className="aip-kicker"><Check size={13} /> Lista para descargar</p>
        <h2>Toda tuya{acceso?.nombre ? <>, <em>{acceso.nombre}</em></> : null}</h2>
        <p>{NN_INTRO}</p>
        <Descarga acceso={acceso} donde="arriba" />
      </section>

      {NN_PUNTOS.map(p => (
        <section key={p.n} className="aip-skill aip-nn-punto">
          <p className="aip-skill-n"><span>{p.n}</span> {p.nombre}</p>
          <h2>{p.titulo}</h2>
          <p className="aip-historia aip-nn-frase">{p.frase}</p>
          <h3>Qué es</h3>
          <p className="aip-historia"><Rico texto={p.que} /></p>
          <h3>Ejemplo</h3>
          <p className="aip-nn-ejemplo"><Rico texto={p.ejemplo} /></p>
          <h3>Cómo empezar</h3>
          <ol className="aip-cap-pasos">
            {p.pasos.map((x, k) => <li key={k}><span>{k + 1}</span><div><p><Rico texto={x} /></p></div></li>)}
          </ol>
          <aside className="aip-aviso ojo"><AlertTriangle size={18} /><div><b>Ojo</b><p>{p.ojo}</p></div></aside>
          <p className="aip-nn-donde">Dónde: {p.donde}</p>
        </section>
      ))}

      <section className="aip-card aip-resumen">
        <h2>Si estás empezando, en este orden</h2>
        <table>
          <tbody>{NN_ORDEN.map(o => <tr key={o.cuando}><td>{o.cuando}</td><td>{o.que}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="aip-card aip-nn-final">
        <h2>Llévatela en PDF</h2>
        <p>Los 8 puntos en siete páginas, para tenerlos a mano mientras trabajas. Y la guía completa de Claude, capítulo a capítulo, en esta misma sección.</p>
        <div className="aip-fila">
          <Descarga acceso={acceso} donde="abajo" />
          <Link className="aip-btn sec" to="/aiparatodo/guia/capitulos">Ir a la guía completa <ArrowRight size={16} /></Link>
        </div>
      </section>
    </>
  )
}

// ── La guía principal en PDF: los Mods de Claude ────────────────────────────
function IndiceModos() {
  return (
    <section className="aip-card aip-indice">
      <h2>Qué hay dentro</h2>
      <ol className="aip-nn-indice">
        {MODOS_INDICE.map(p => <li key={p.n}><span className="aip-indice-item"><span>{p.n}</span><b>{p.nombre}</b></span></li>)}
      </ol>
    </section>
  )
}

function DescargaModos({ acceso, donde }) {
  return (
    <a
      className="aip-btn aip-descarga" href={MODOS_PDF} download
      onClick={() => { track('descarga', { recurso: 'modos-de-claude', donde }); anota(acceso?.id, 'AI para todo · descargó la guía Los Mods de Claude (PDF)') }}
    >
      <Download size={18} /> Descargar el PDF
    </a>
  )
}

function CuerpoGuiaModos({ acceso }) {
  return (
    <>
      <section className="aip-card aip-nn-listo">
        <p className="aip-kicker"><Check size={13} /> Lista para descargar</p>
        <h2>Toda tuya{acceso?.nombre ? <>, <em>{acceso.nombre}</em></> : null}</h2>
        <p>{MODOS_INTRO}</p>
        <DescargaModos acceso={acceso} donde="arriba" />
      </section>

      <IndiceCapitulo c={{ bloques: MODOS_BLOQUES }} enlaces />
      <article className="aip-capitulo">
        {MODOS_BLOQUES.map((b, i) => <Bloque key={i} b={b} i={i} />)}
      </article>

      <section className="aip-card aip-claves">
        <h2>Lo que te llevas</h2>
        <ul>{MODOS_CLAVES.map((x, k) => <li key={k}><Check size={16} /><span><Rico texto={x} /></span></li>)}</ul>
      </section>

      <section className="aip-card aip-resumen">
        <h2>Por dónde empezar</h2>
        <table>
          <tbody>{MODOS_ORDEN.map(o => <tr key={o.cuando}><td>{o.cuando}</td><td>{o.que}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="aip-fuentes">
        <h3>Fuentes oficiales</h3>
        <ul>
          {MODOS_FUENTES.map(f => (
            <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.texto} <ExternalLink size={12} /></a></li>
          ))}
        </ul>
      </section>

      <section className="aip-card aip-nn-final">
        <h2>Llévatela en PDF</h2>
        <p>Toda la guía en limpio, con los prompts, para tenerla a mano mientras montas tus Mods.</p>
        <div className="aip-fila">
          <DescargaModos acceso={acceso} donde="abajo" />
          <Link className="aip-btn sec" to={NN_RUTA}>Y mis 8 no negociables <ArrowRight size={16} /></Link>
        </div>
      </section>
    </>
  )
}

// ── El cuerpo de un post de skills ──────────────────────────────────────────
function CuerpoPost({ p }) {
  const n = p.skills.length
  return (
    <>
      <section className="aip-card aip-indice">
        <h2>Qué vas a encontrar</h2>
        <ol>
          {p.skills.map(s => (
            <li key={s.clave}><a href={`#${s.clave}`}><span>{s.n}</span><b>{s.nombre}</b> — {s.corto}</a></li>
          ))}
        </ol>
        <p className="aip-nota">{p.nota || `Las ${n} son gratis. Solo necesitas Claude Code.`}</p>
      </section>

      {p.skills.map(s => (
        <section key={s.clave} id={s.clave} className="aip-skill">
          <p className="aip-skill-n"><span>{s.n}</span> {s.clave}</p>
          <h2>{s.titular}</h2>
          <p className="aip-historia">{s.historia}</p>
          <h3>Qué puedes hacer</h3>
          <ul className="aip-puedes">{s.puedes.map(x => <li key={x}>{x}</li>)}</ul>

          {s.github && (
            <div className="aip-repo">
              <Github size={16} />
              <div>
                <code>{s.repo || 'anthropics/skills'} · {s.clave}</code>
                <small>{s.oficial === false ? `De la comunidad · ${s.autor}` : 'Skill oficial de Anthropic'}{s.licencia ? ` · ${s.licencia}` : ''}</small>
              </div>
              <a className="aip-btn sec pequeno" href={s.github} target="_blank" rel="noopener noreferrer">Ver en GitHub <ArrowRight size={14} /></a>
            </div>
          )}

          {s.suelta && (
            <Codigo
              titulo={s.sueltaTitulo || 'Instalar solo esta skill'}
              nota={s.sueltaNota || 'En tu terminal. La copia a ~/.claude/skills y Claude Code la usa sola cuando toca (si lo tenías abierto, reinícialo).'}
              texto={s.suelta}
            />
          )}

          <div className="aip-ejemplos">
            {s.ejemplos.map(e => <Prompt key={e.titulo} {...e} />)}
          </div>
        </section>
      ))}

      {p.instalarTodo && (
        <section className="aip-skill aip-bonus">
          <p className="aip-skill-n"><span>+</span> {p.tipo === 'mcp' ? 'conectar' : 'bonus'}</p>
          <h2>{p.tipo === 'mcp' ? 'Cómo se conecta' : 'Todas de una vez'}</h2>
          <p className="aip-historia">{p.instalarTodo.explica}</p>
          <Codigo titulo={p.instalarTodo.titulo || (p.tipo === 'mcp' ? 'La URL del conector' : 'Instalar en Claude Code')} texto={p.instalarTodo.comando} />
        </section>
      )}

      <section className="aip-card aip-resumen">
        <h2>Resumen rápido</h2>
        <table>
          <thead><tr><th>#</th><th>{p.tipo === 'mcp' ? 'Qué' : p.tipo === 'repo' ? 'Apartado' : 'Skill'}</th><th>Para qué</th></tr></thead>
          <tbody>
            {p.skills.map(s => <tr key={s.clave}><td>{s.n}</td><td>{s.github ? <a href={s.github} target="_blank" rel="noopener noreferrer">{s.nombre}</a> : s.nombre}</td><td>{s.corto}</td></tr>)}
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

// ── News: el diario ─────────────────────────────────────────────────────────
// La sección News es un periódico: tres piezas al día que escribe y verifica la
// redacción automática (api/_lib/redaccion.js), con su foto, y debajo las
// breves de la mañana del agente de noticias. Las piezas tienen su página;
// las breves, la de siempre (Hilo).

// Las breves llevan de slug «fecha-puesto»; los artículos, «fecha-titular».
const esBreve = (slug) => /^\d{4}-\d{2}-\d{2}-\d$/.test(String(slug))

/** La sección: el diario en News, el foro en las demás. */
function Seccion() {
  const { seccion } = useParams()
  return seccion === 'news' ? <Diario /> : <Foro />
}

/** Un hilo: en News, el artículo; si es una breve o de otra sección, Hilo. */
function HiloRuta(props) {
  const { seccion, slug } = useParams()
  return seccion === 'news' && !esBreve(slug) ? <Articulo {...props} /> : <Hilo {...props} />
}

const EDICION = { manana: 'Edición de mañana', mediodia: 'Edición de mediodía', tarde: 'Edición de tarde' }
const ICONO_TEMA = { ia: BrainCircuit, tecnologia: Cpu, ciberseguridad: ShieldAlert }
const temaNombre = (k) => seccionPorClave('news').temas.find(t => t.key === k)?.nombre || k
const ahoraMadrid = () => {
  const f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  return f.charAt(0).toUpperCase() + f.slice(1)
}
const edicionAhora = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h >= 20 ? EDICION.tarde : h >= 14 ? EDICION.mediodia : EDICION.manana
}

let articulosEnCurso = null
function pideArticulos() {
  if (!articulosEnCurso) {
    articulosEnCurso = fetch('/api/aiparatodo?action=articulos')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => (Array.isArray(d?.articulos) ? d.articulos : []))
      .catch(() => { articulosEnCurso = null; return 'error' })
  }
  return articulosEnCurso
}
function useArticulos() {
  const [lista, setLista] = useState(null)
  useEffect(() => {
    let vivo = true
    pideArticulos().then(l => { if (vivo) setLista(l) })
    return () => { vivo = false }
  }, [])
  return lista
}
/** null mientras carga · el artículo · 'no' si no existe · 'error' si falla la red. */
function useArticulo(slug) {
  // Se guarda con su slug: al pasar a otra pieza, la anterior no se pinta ni
  // un instante mientras llega la nueva.
  const [r, setR] = useState({ slug: null, valor: null })
  useEffect(() => {
    let vivo = true
    fetch(`/api/aiparatodo?action=articulo&slug=${encodeURIComponent(slug)}`)
      .then(x => (x.status === 404 || x.status === 400 ? 'no' : x.ok ? x.json().then(d => d.articulo || 'no') : 'error'))
      .catch(() => 'error')
      .then(valor => { if (vivo) setR({ slug, valor }) })
    return () => { vivo = false }
  }, [slug])
  return r.slug === slug ? r.valor : null
}

// La foto de la noticia original. Si no hay, o la web de origen no la deja
// cargar, una portada propia con el tema: nunca un hueco roto.
function Foto({ a, grande = false, pie = null }) {
  // La URL que falló, no un sí/no: al pasar a otra pieza con otra foto, se
  // vuelve a intentar.
  const [rotaUrl, setRotaUrl] = useState(null)
  if (!a.imagen_url || rotaUrl === a.imagen_url) {
    const Icono = ICONO_TEMA[a.tema] || Newspaper
    return (
      <div className={`aip-foto aip-foto-propia ${a.tema}`} role="img" aria-label={temaNombre(a.tema)}>
        <Icono size={grande ? 64 : 38} />
        <span>AI para todo · {temaNombre(a.tema)}</span>
      </div>
    )
  }
  return (
    <>
      <img
        className="aip-foto" src={a.imagen_url} alt={a.imagen_alt || ''}
        loading={grande ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setRotaUrl(a.imagen_url)}
      />
      {/* El crédito, solo cuando la foto del medio se ve de verdad. */}
      {pie}
    </>
  )
}

function Kicker({ a }) {
  return (
    <p className="aip-art-kicker">
      <span className={`aip-tema-chip ${a.tema}`}>{temaNombre(a.tema)}</span>
      <span>{EDICION[a.edicion]} · {fechaCorta(a.fecha)} · {a.lectura_min} min</span>
    </p>
  )
}

function ArticuloPortada({ a }) {
  return (
    <Link className="aip-art-portada" to={`/aiparatodo/news/${a.tema}/${a.slug}`}>
      <div className="aip-art-portada-foto"><Foto a={a} grande /></div>
      <div className="aip-art-portada-txt">
        <Kicker a={a} />
        <h2>{a.titular}</h2>
        <p>{a.subtitulo}</p>
        <span className="aip-art-leer">Leer la pieza <ArrowRight size={15} /></span>
      </div>
    </Link>
  )
}

function ArticuloTarjeta({ a }) {
  return (
    <Link className="aip-art-tarjeta" to={`/aiparatodo/news/${a.tema}/${a.slug}`}>
      <div className="aip-art-tarjeta-foto"><Foto a={a} /></div>
      <Kicker a={a} />
      <h3>{a.titular}</h3>
      <p>{recorta(a.subtitulo, 150)}</p>
    </Link>
  )
}

function Diario() {
  const { tema } = useParams()
  const s = seccionPorClave('news')
  const t = tema ? s.temas.find(x => x.key === tema) : null
  const recibidos = useArticulos()
  const breves = useNoticias(true)
  useEffect(() => { track('vista_pagina', { pagina: 'aiparatodo-diario', tema }) }, [tema])
  if (tema && !t) return <Navigate to="/aiparatodo/news" replace />

  const lista = Array.isArray(recibidos) ? recibidos.filter(a => !tema || a.tema === tema) : []
  const brevesLista = Array.isArray(breves) ? breves.filter(b => !tema || b.tema === tema).slice(0, 6) : []
  const [primero, ...resto] = lista

  return (
    <main className="aip-main aip-diario">
      <nav className="aip-migas">
        <Link to="/aiparatodo">Inicio</Link><ChevronRight size={14} />
        {t ? <><Link to="/aiparatodo/news">News</Link><ChevronRight size={14} /><span>{t.nombre}</span></> : <span>News</span>}
      </nav>

      <header className="aip-diario-cab">
        <p className="aip-diario-fecha"><span className="aip-punto" /> {ahoraMadrid()} · {edicionAhora()}</p>
        <h1 className="aip-diario-nombre">{t ? t.nombre : 'El diario de AI para todo'}</h1>
        <p className="aip-sub">{t ? t.desc : 'IA, tecnología y ciberseguridad. Tres piezas al día, a las 8:00, las 14:00 y las 20:00, investigadas en las fuentes originales y revisadas dato a dato.'}</p>
        <nav className="aip-diario-temas">
          <Link className={!tema ? 'on' : ''} to="/aiparatodo/news">Portada</Link>
          {s.temas.map(x => <Link key={x.key} className={tema === x.key ? 'on' : ''} to={`/aiparatodo/news/${x.key}`}>{x.nombre}</Link>)}
        </nav>
      </header>

      {recibidos === null && <p className="aip-sub">Cargando el diario…</p>}
      {recibidos === 'error' && <p className="aip-sub">No se ha podido cargar el diario. Prueba a recargar la página en un momento.</p>}
      {primero && <ArticuloPortada a={primero} />}
      {resto.length > 0 && <div className="aip-diario-grid">{resto.map(a => <ArticuloTarjeta key={a.slug} a={a} />)}</div>}
      {Array.isArray(recibidos) && !lista.length && (
        <div className="aip-card aip-diario-vacio">
          <b>{tema ? `Todavía no hay piezas de ${t.nombre}` : 'La primera edición está en la imprenta'}</b>
          <p>Cada día salen tres: a las 8:00, las 14:00 y las 20:00. Mientras tanto, las breves de la mañana, aquí abajo.</p>
        </div>
      )}

      {brevesLista.length > 0 && (
        <section className="aip-breves">
          <h2>En breve</h2>
          <ul>
            {brevesLista.map(b => (
              <li key={`${b.tema}-${b.slug}`}>
                <Link to={`/aiparatodo/news/${b.tema}/${b.slug}`}>
                  <span>{temaNombre(b.tema)} · {b.fuente} · {fechaCorta(b.fecha)}</span>
                  <b>{b.titulo}</b>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

const sinComillas = (t) => String(t || '').trim().replace(/^[«"“'‘]+|[»"”'’]+$/g, '')

function BloqueArticulo({ b }) {
  switch (b.tipo) {
    case 'h2': return <h2>{b.texto}</h2>
    case 'cita': return (
      <blockquote>
        <p>«{sinComillas(b.texto)}»</p>
        {b.autor && <cite>{b.autor}</cite>}
      </blockquote>
    )
    case 'lista': return (
      <>
        {b.texto && <p>{b.texto}</p>}
        <ul>{(b.items || []).map((x, k) => <li key={k}>{x}</li>)}</ul>
      </>
    )
    default: return <p>{b.texto}</p>
  }
}

function Articulo({ acceso, setAcceso }) {
  const { tema, slug } = useParams()
  const a = useArticulo(slug)
  const todos = useArticulos()
  const listo = a && typeof a === 'object'
  useEffect(() => { if (listo) track('vista_pagina', { pagina: 'aiparatodo-articulo', slug, miembro: Boolean(acceso) }) }, [listo, slug, acceso])

  if (a === null) return <main className="aip-main aip-articulo"><p className="aip-sub">Cargando…</p></main>
  if (a === 'error') return <main className="aip-main aip-articulo"><p className="aip-sub">No se ha podido cargar la pieza. Prueba a recargar la página en un momento.</p></main>
  if (a === 'no') return <Navigate to="/aiparatodo/news" replace />
  if (a.tema !== tema) return <Navigate to={`/aiparatodo/news/${a.tema}/${a.slug}`} replace />

  // Sin datos, el arranque de la pieza hasta el segundo párrafo (como el muro
  // de un periódico), con el ladillo que haya entre medias.
  let parrafos = 0
  const corte = a.cuerpo.findIndex(b => b.tipo === 'p' && ++parrafos === 2)
  const visibles = acceso ? a.cuerpo : a.cuerpo.slice(0, corte === -1 ? a.cuerpo.length : corte + 1)
  const mas = Array.isArray(todos) ? todos.filter(x => x.slug !== a.slug).slice(0, 3) : []

  return (
    <main className="aip-main aip-articulo">
      <nav className="aip-migas">
        <Link to="/aiparatodo">Inicio</Link><ChevronRight size={14} />
        <Link to="/aiparatodo/news">News</Link><ChevronRight size={14} />
        <Link to={`/aiparatodo/news/${a.tema}`}>{temaNombre(a.tema)}</Link>
      </nav>

      <header className="aip-articulo-cab">
        <Kicker a={a} />
        <h1>{a.titular}</h1>
        <p className="aip-articulo-entradilla">{a.subtitulo}</p>
        <p className="aip-articulo-firma">Por la redacción de AI para todo · {fechaLarga(a.fecha)}</p>
      </header>

      <figure className="aip-articulo-foto">
        <Foto
          a={a} grande
          pie={(a.imagen_credito || a.imagen_origen) && (
            <figcaption>
              {a.imagen_credito}
              {a.imagen_origen && <> · <a href={a.imagen_origen} target="_blank" rel="noopener noreferrer">noticia original</a></>}
            </figcaption>
          )}
        />
      </figure>

      <div className={'aip-articulo-cuerpo' + (acceso ? '' : ' cortado')}>
        {visibles.map((b, i) => <BloqueArticulo key={i} b={b} />)}
      </div>

      {!acceso ? (
        <Puerta
          setAcceso={setAcceso} pipeline={PIPELINE_COMUNIDAD} nota={`leyó news/${a.slug}`}
          titulo="Sigue leyendo"
          texto="Cuatro datos, una sola vez, y se abren el diario entero, los hilos de skills y la guía completa de Claude."
        />
      ) : (
        <>
          {a.claves?.length > 0 && (
            <section className="aip-card aip-claves">
              <h2>Las claves</h2>
              <ul>{a.claves.map((x, k) => <li key={k}><Check size={16} /><span>{x}</span></li>)}</ul>
            </section>
          )}
          {a.que_significa && (
            <section className="aip-articulo-ati">
              <h2>Qué significa para ti</h2>
              <p>{a.que_significa}</p>
            </section>
          )}
          {a.fuentes?.length > 0 && (
            <section className="aip-fuentes">
              <h3>Fuentes</h3>
              <ul>
                {a.fuentes.map(f => (
                  <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre} <ExternalLink size={12} /></a></li>
                ))}
              </ul>
            </section>
          )}
          <p className="aip-articulo-nota">
            Esta pieza la ha investigado y redactado la redacción automática de AI para todo a partir de las fuentes
            citadas, y la ha revisado un segundo agente que comprueba cada dato contra ellas. Si ves un error,
            escríbenos por <a href={FUNDADOR.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>.
          </p>
        </>
      )}

      {mas.length > 0 && (
        <section className="aip-diario-mas">
          <h2>Más del diario</h2>
          <div className="aip-diario-grid">{mas.map(x => <ArticuloTarjeta key={x.slug} a={x} />)}</div>
        </section>
      )}

      <Link className="aip-volver" to="/aiparatodo/news"><ArrowLeft size={16} /> Volver al diario</Link>
    </main>
  )
}
