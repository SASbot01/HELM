// LAS COMUNIDADES — el motor de AI para todo, Filmmaking para todo y las que
// vengan. Cada una es una configuración (ver src/pages/aiparatodo/config.jsx):
// marca, textos, fundador, secciones, fondo, guías en PDF, puerta, cobro, API
// y nombres de las métricas. Este archivo no sabe de ninguna en concreto.
//
//   <ruta>                              portada: título, sigue al creador y
//                                       las secciones
//   <ruta>/<seccion>                    el foro de la sección: temas e hilos
//   <ruta>/<seccion>/<tema>             un tema
//   <ruta>/<seccion>/<tema>/<hilo>      un hilo
//
// Todo se recorre sin dejar nada hasta la lista de hilos, como un foro abierto.
// LEER un hilo pasa por la puerta de la comunidad (Puerta.jsx): datos, pago o
// las dos cosas. Lo que se abre se recuerda en el navegador, por comunidad.
//
// News no es contenido fijo: es el diario que escribe la redacción automática
// de HELM y las breves del agente de noticias en el perfil de la comunidad,
// leídos de su API (cfg.api).
import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Link, Navigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, Instagram, Sparkles, Newspaper, ChevronRight, MessageSquare, Hash,
  ExternalLink, FileText, Check,
} from 'lucide-react'
import { useCabeceraPublica } from '../inicio/cabecera.js'
import { track } from '../inicio/socio/track.js'
import { origen } from '../inicio/socio/origen.js'
import {
  ComunidadCtx, useComunidad, seccionPorClave, temaNombre, accesoGuardado, useNoticias, useArticulos,
  useArticulo, fechaCorta, fechaLarga, recorta, esBreve, sinComillas, ahoraMadrid, edicionAhora, EDICION,
} from './datos.js'
import { IndiceCapitulo, CuerpoCapitulo } from './bloques.jsx'
import Puerta from './Puerta.jsx'
import '../../fonts/inter-tight.css'
import '../../fonts/jetbrains-mono.css'
import './comunidad.css'

export default function Comunidad({ config: cfg }) {
  // Las UTM se guardan al aterrizar, mientras siguen en la URL: los enlaces de
  // dentro las quitan, y el alta las necesita para saber de qué Reel vino.
  useState(() => origen())
  // Vuelta del pago de Stripe (?pago=ok), solo en las comunidades de pago:
  // abre el acceso; guardarlo y limpiar la URL se hace después de pintar.
  const [pagoOk] = useState(() => Boolean(cfg.cobro) && new URLSearchParams(window.location.search).get('pago') === 'ok')
  const [acceso, setAcceso] = useState(() => (pagoOk ? { id: null, pago: true, at: new Date().toISOString() } : accesoGuardado(cfg.llave)))
  const pagoAtendido = useRef(false)
  useEffect(() => {
    if (!pagoOk || pagoAtendido.current) return
    pagoAtendido.current = true
    try { localStorage.setItem(cfg.llave, JSON.stringify(acceso)) } catch { /* incógnito */ }
    track('pago', { donde: cfg.clave })
    try { window.history.replaceState({}, '', window.location.pathname) } catch { /* noop */ }
  }, [pagoOk, acceso, cfg.llave, cfg.clave])
  useCabeceraPublica(cfg.cabecera)
  const { Fondo } = cfg
  return (
    <ComunidadCtx.Provider value={cfg}>
      <div className={cfg.clase ? `aip ${cfg.clase}` : 'aip'}>
        <Fondo />
        <Cabecera />
        <Routes>
          <Route index element={<Portada />} />
          <Route path=":seccion" element={<Seccion />} />
          <Route path=":seccion/:tema" element={<Seccion />} />
          <Route path=":seccion/:tema/:slug" element={<HiloRuta acceso={acceso} setAcceso={setAcceso} />} />
          <Route path="*" element={<Navigate to={cfg.ruta} replace />} />
        </Routes>
        <Pie />
      </div>
    </ComunidadCtx.Provider>
  )
}

function Cabecera() {
  const cfg = useComunidad()
  return (
    <header className="aip-cab">
      <Link to={cfg.ruta} className="aip-logo">{cfg.logo}</Link>
      <nav className="aip-nav">
        {cfg.secciones.map(s => {
          const Icono = cfg.iconos[s.key]
          return <Link key={s.key} to={`${cfg.ruta}/${s.key}`}><Icono size={15} /> {s.key === 'guia' ? 'Guía' : s.titulo}</Link>
        })}
        <a className="aip-nav-cta" href={cfg.fundador.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={15} />{` ${cfg.textos.navCta}`}</a>
      </nav>
    </header>
  )
}

// ── Portada: una frase, el creador, qué hay y las puertas ──────────────────
function Portada() {
  const cfg = useComunidad()
  const p = cfg.portada
  useEffect(() => { track('vista_pagina', { pagina: cfg.clave }) }, [cfg.clave])
  return (
    <main className="aip-main aip-portada">
      <h1>{p.titulo}</h1>
      {p.antes}
      <a
        className="aip-btn" href={cfg.fundador.instagram} target="_blank" rel="noopener noreferrer"
        onClick={() => track('clic_cta', { donde: `${cfg.cta}-creador` })}
      >
        <Instagram size={18} />{` ${p.boton}`}
      </a>
      {p.secundario}
      <p className="aip-sub">{p.sub}</p>
      {p.despues}
      <div className="aip-zonas">
        {cfg.secciones.map(s => {
          const Icono = cfg.iconos[s.key]
          const n = cfg.hilosDe(s.key).length
          return (
            <Link key={s.key} className={`aip-zona ${s.key}`} to={`${cfg.ruta}/${s.key}`}>
              <span className="aip-zona-ico"><Icono size={22} /></span>
              <h3>{s.titulo}</h3>
              <p>{s.desc}</p>
              <span className="aip-zona-pie">
                {s.key === 'news' ? cfg.textos.zonaNews : `${s.temas.length} tema${s.temas.length === 1 ? '' : 's'} · ${n} hilo${n === 1 ? '' : 's'}`}
                <ArrowRight size={14} />
              </span>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

// ── El foro de una sección ──────────────────────────────────────────────────
function Foro() {
  const cfg = useComunidad()
  const { seccion: sk, tema } = useParams()
  const s = seccionPorClave(cfg, sk)
  const esNews = sk === 'news'
  const recibidas = useNoticias(cfg.api, esNews)
  const fallo = recibidas === 'error'
  const noticias = fallo ? [] : recibidas
  useEffect(() => { if (s) track('vista_pagina', { pagina: `${cfg.clave}-foro`, seccion: sk, tema }) }, [s, sk, tema, cfg.clave])
  if (!s) return <Navigate to={cfg.ruta} replace />
  const t = tema ? s.temas.find(x => x.key === tema) : null
  if (tema && !t) return <Navigate to={`${cfg.ruta}/${sk}`} replace />
  const hilos = esNews ? (noticias || []).filter(n => !tema || n.tema === tema) : cfg.hilosDe(sk, tema)
  const cuenta = (k) => (esNews ? (noticias || []).filter(n => n.tema === k).length : cfg.hilosDe(sk, k).length)

  return (
    <main className="aip-main">
      <nav className="aip-migas">
        <Link to={cfg.ruta}>Inicio</Link><ChevronRight size={14} />
        {t ? <><Link to={`${cfg.ruta}/${sk}`}>{s.titulo}</Link><ChevronRight size={14} /><span>{t.nombre}</span></> : <span>{s.titulo}</span>}
      </nav>
      <section className="aip-sec">
        <h1 className="aip-h1">{t ? t.nombre : s.titulo}</h1>
        <p className="aip-sub">{t ? t.desc : s.desc}</p>

        <div className={'aip-foro' + (s.temas.length > 1 ? '' : ' sin-temas')}>
          {s.temas.length > 1 && (
            <aside className="aip-temas">
              <Link className={'aip-tema' + (!tema ? ' on' : '')} to={`${cfg.ruta}/${sk}`}><MessageSquare size={15} /> Todos</Link>
              {s.temas.filter(x => cuenta(x.key) > 0 || tema === x.key).map(x => (
                <Link key={x.key} className={'aip-tema' + (tema === x.key ? ' on' : '')} to={`${cfg.ruta}/${sk}/${x.key}`}>
                  <Hash size={15} /> {x.nombre} <b>{cuenta(x.key)}</b>
                </Link>
              ))}
            </aside>
          )}

          <div className="aip-tarjetas">
            {hilos.map(h => <TarjetaHilo key={`${h.tema}-${h.slug}`} h={h} sk={sk} tema={s.temas.find(x => x.key === h.tema)} />)}
            {hilos.length === 0 && (
              <div className="aip-card aip-tarjetas-vacio">
                <b>{cfg.textos.foroVacio.titulo}</b>
                <p>{cfg.textos.foroVacio.texto}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

const pdfDe = (cfg, slug) => cfg.pdfs.find(p => p.hilo.slug === slug) || null

// Una tarjeta de hilo, al estilo del banner de las guías en PDF: portada,
// tema, título y un botón. La portada es el render 3D en las guías en PDF, y
// un icono sobre degradado en el resto.
function TarjetaHilo({ h, sk, tema }) {
  const cfg = useComunidad()
  const pdf = pdfDe(cfg, h.slug)
  const esPdf = Boolean(pdf)
  const cover3d = h.portada || pdf?.portada3d || null
  const Icono = cfg.iconosTipo?.[h.tipo] || cfg.portadasHilo[sk] || Sparkles
  const claseTema = sk === 'guia' ? (esPdf ? 'nn' : 'cap') : (h.tema || sk)
  return (
    <Link className={'aip-tarjeta' + (h.pronto ? ' pronto' : '') + (pdf?.principal ? ' principal' : '')} to={`${cfg.ruta}/${sk}/${h.tema}/${h.slug}`}>
      <div className={`aip-tarjeta-cover ${claseTema}${h.portada ? ' llena' : ''}`}>
        {cover3d
          ? <img src={cover3d} alt="" width="900" height="900" loading="lazy" />
          : <Icono size={44} />}
        {h.n && <span className="aip-tarjeta-n">{h.n}</span>}
      </div>
      <div className="aip-tarjeta-txt">
        <p className="aip-kicker">{esPdf ? <><FileText size={13} /> Guía en PDF{pdf.principal ? ' · principal' : ''}</> : <>{tema?.nombre || ''}</>}</p>
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

// ── Un hilo: detrás de la puerta ────────────────────────────────────────────
function Hilo({ acceso, setAcceso }) {
  const cfg = useComunidad()
  const { seccion: sk, tema, slug } = useParams()
  const s = seccionPorClave(cfg, sk)
  const esNews = sk === 'news'
  const recibidas = useNoticias(cfg.api, esNews)
  const noticias = recibidas === 'error' ? [] : recibidas
  const { hash } = useLocation()
  const pdf = cfg.pdfs.find(p => sk === p.hilo.seccion && tema === p.hilo.tema && slug === p.hilo.slug) || null
  const capitulo = sk === 'guia' && tema === 'capitulos' ? cfg.capituloPorSlug(slug) : null
  const post = cfg.posts && sk === cfg.posts.seccion ? cfg.posts.porSlug(slug) : null
  const noticia = esNews ? (noticias || []).find(n => n.slug === slug && n.tema === tema) : null
  const h = esNews ? noticia : cfg.hilosDe(sk, tema).find(x => x.slug === slug)
  // Un hilo con bloques (Operaciones, Recursos) se lee igual que un capítulo.
  const texto = capitulo?.texto || (!esNews && h?.bloques ? h : null)

  useEffect(() => { if (h && acceso) track('vista_pagina', { pagina: `${cfg.clave}-hilo`, seccion: sk, slug }) }, [h, acceso, sk, slug, cfg.clave])
  // Un enlace con #apartado abierto en frío: cuando se monta el hilo (la página
  // va en su propio archivo), ScrollToTop ya buscó el ancla y no la encontró.
  // Las anclas son ASCII (ver ancla()), así que no hace falta decodificar.
  useEffect(() => { if (acceso && hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [acceso, slug, hash])
  if (esNews && recibidas === null) return <main className="aip-main aip-post"><p className="aip-sub">Cargando…</p></main>
  if (esNews && recibidas === 'error') return <main className="aip-main aip-post"><p className="aip-sub">No se ha podido cargar la noticia. Prueba a recargar la página en un momento.</p></main>
  if (!s || !h) return <Navigate to={`${cfg.ruta}/${sk || ''}`} replace />
  const t = s.temas.find(x => x.key === tema)

  // La puerta: en las guías en PDF, la suya (su embudo, su texto).
  const puerta = pdf
    ? <Puerta setAcceso={setAcceso} {...pdf.puerta} />
    : <Puerta setAcceso={setAcceso} pipeline={cfg.crm.embudoComunidad} nota={`entró por ${sk}/${slug}`} />

  let kicker = t?.nombre
  if (post) kicker += cfg.posts.kicker(post)
  if (capitulo) kicker = `Capítulo ${capitulo.n}${capitulo.lectura ? ` · ${capitulo.lectura}` : ''}`
  else if (texto?.lectura) kicker += ` · ${texto.lectura}`
  if (noticia) kicker = `${t?.nombre} · ${noticia.fuente} · ${fechaLarga(noticia.fecha)}`
  if (pdf) kicker = pdf.kicker

  const titular = post ? post.gancho : texto ? texto.gancho : pdf ? pdf.gancho : h.titulo
  const sub = post ? post.resumen : capitulo ? capitulo.resumen : texto ? texto.resumen : pdf ? pdf.hilo.resumen : null
  const CuerpoPost = cfg.posts?.Cuerpo
  const PdfIndice = pdf?.Indice
  const PdfCuerpo = pdf?.Cuerpo
  const { TrasHilo } = cfg

  return (
    <main className="aip-main aip-post">
      <nav className="aip-migas">
        <Link to={cfg.ruta}>Inicio</Link><ChevronRight size={14} />
        <Link to={`${cfg.ruta}/${sk}`}>{s.titulo}</Link><ChevronRight size={14} />
        {s.temas.length > 1 && <><Link to={`${cfg.ruta}/${sk}/${tema}`}>{t?.nombre}</Link><ChevronRight size={14} /></>}
        <span>{capitulo ? `${capitulo.n} · ${capitulo.titulo}` : h.titulo}</span>
      </nav>

      <header className={'aip-post-cab' + (pdf ? ' aip-nn-cab' : '')}>
        <div>
          <p className="aip-kicker"><span className="aip-punto" /> {kicker}</p>
          <h1 className="aip-h1">{titular}</h1>
          {sub && <p className="aip-sub">{sub}</p>}
        </div>
        {pdf && <img className="aip-nn-3d" src={pdf.portada3d} alt={pdf.alt} width="900" height="900" />}
      </header>

      {/* Lo que se ve antes de entrar: el índice, para saber qué hay dentro. */}
      {!acceso && texto && <IndiceCapitulo c={texto} />}
      {!acceso && PdfIndice && <PdfIndice />}

      {!acceso ? puerta
        : post ? <CuerpoPost p={post} />
          : texto ? <CuerpoCapitulo c={texto} />
            : noticia ? <CuerpoNoticia n={noticia} />
              : PdfCuerpo ? <PdfCuerpo acceso={acceso} />
                : (
                  <section className="aip-card aip-pronto-card">
                    <p>Este {sk === 'guia' ? 'capítulo' : 'hilo'} se publica pronto. Te avisamos al correo que dejaste.</p>
                    {sk === 'guia' && (
                      <ol>{cfg.capitulos.map(c => <li key={c.slug} className={c.slug === slug ? 'on' : ''}><span>{c.n}</span> {c.titulo}</li>)}</ol>
                    )}
                  </section>
                )}

      {acceso && capitulo && <SiguienteCapitulo actual={capitulo} />}
      {TrasHilo && <TrasHilo sk={sk} slug={slug} acceso={acceso} capitulo={capitulo} post={post} />}

      <Link className="aip-volver" to={`${cfg.ruta}/${sk}`}><ArrowLeft size={16} /> Volver a {s.titulo}</Link>
    </main>
  )
}

function SiguienteCapitulo({ actual }) {
  const cfg = useComunidad()
  const i = cfg.capitulos.findIndex(c => c.slug === actual.slug)
  const sig = cfg.capitulos[i + 1]
  if (!sig) return null
  return (
    <Link className="aip-siguiente" to={`${cfg.ruta}/guia/capitulos/${sig.slug}`}>
      <small>Siguiente capítulo</small>
      <b>{sig.n} · {sig.titulo}</b>
      <ArrowRight size={18} />
    </Link>
  )
}

// ── Una noticia del día ─────────────────────────────────────────────────────
function CuerpoNoticia({ n }) {
  const cfg = useComunidad()
  return (
    <section className="aip-card aip-noticia">
      <p className="aip-noticia-resumen">{n.resumen}</p>
      <a className="aip-btn sec" href={n.url} target="_blank" rel="noopener noreferrer" onClick={() => track('clic_cta', { donde: `${cfg.cta}-noticia-fuente` })}>
        Leer la noticia en {n.fuente} <ExternalLink size={15} />
      </a>
    </section>
  )
}

function Pie() {
  const cfg = useComunidad()
  return (
    <footer className="aip-pie">
      <span>© {new Date().getFullYear()}{` ${cfg.pie.marca} · `}{cfg.pie.autor}</span>
      <span className="aip-pie-links">
        {cfg.pie.enlaces.map(e => (
          e.fuera
            ? <a key={e.texto} href={e.href} target="_blank" rel="noopener noreferrer">{e.texto}</a>
            : <a key={e.texto} href={e.href}>{e.texto}</a>
        ))}
      </span>
    </footer>
  )
}

// ── News: el diario ─────────────────────────────────────────────────────────
// La sección News es un periódico: las piezas que escribe y verifica la
// redacción automática (api/_lib/redaccion.js), con su foto, y debajo las
// breves de la mañana del agente de noticias. Las piezas tienen su página;
// las breves, la de siempre (Hilo).

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

// La foto de la noticia original. Si no hay, o la web de origen no la deja
// cargar, una portada propia con el tema: nunca un hueco roto.
function Foto({ a, grande = false, pie = null }) {
  const cfg = useComunidad()
  // La URL que falló, no un sí/no: al pasar a otra pieza con otra foto, se
  // vuelve a intentar.
  const [rotaUrl, setRotaUrl] = useState(null)
  if (!a.imagen_url || rotaUrl === a.imagen_url) {
    const Icono = cfg.news.iconos[a.tema] || Newspaper
    return (
      <div className={`aip-foto aip-foto-propia ${a.tema}`} role="img" aria-label={temaNombre(cfg, a.tema)}>
        <Icono size={grande ? 64 : 38} />
        <span>{`${cfg.nombre} · `}{temaNombre(cfg, a.tema)}</span>
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
  const cfg = useComunidad()
  return (
    <p className="aip-art-kicker">
      <span className={`aip-tema-chip ${a.tema}`}>{temaNombre(cfg, a.tema)}</span>
      <span>{EDICION[a.edicion]} · {fechaCorta(a.fecha)} · {a.lectura_min} min</span>
    </p>
  )
}

function ArticuloPortada({ a }) {
  const cfg = useComunidad()
  return (
    <Link className="aip-art-portada" to={`${cfg.ruta}/news/${a.tema}/${a.slug}`}>
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
  const cfg = useComunidad()
  return (
    <Link className="aip-art-tarjeta" to={`${cfg.ruta}/news/${a.tema}/${a.slug}`}>
      <div className="aip-art-tarjeta-foto"><Foto a={a} /></div>
      <Kicker a={a} />
      <h3>{a.titular}</h3>
      <p>{recorta(a.subtitulo, 150)}</p>
    </Link>
  )
}

function Diario() {
  const cfg = useComunidad()
  const { tema } = useParams()
  const s = seccionPorClave(cfg, 'news')
  const t = tema ? s.temas.find(x => x.key === tema) : null
  const recibidos = useArticulos(cfg.api)
  const breves = useNoticias(cfg.api, true)
  useEffect(() => { track('vista_pagina', { pagina: `${cfg.clave}-diario`, tema }) }, [tema, cfg.clave])
  if (tema && !t) return <Navigate to={`${cfg.ruta}/news`} replace />

  const lista = Array.isArray(recibidos) ? recibidos.filter(a => !tema || a.tema === tema) : []
  const brevesLista = Array.isArray(breves) ? breves.filter(b => !tema || b.tema === tema).slice(0, 6) : []
  const [primero, ...resto] = lista

  return (
    <main className="aip-main aip-diario">
      <nav className="aip-migas">
        <Link to={cfg.ruta}>Inicio</Link><ChevronRight size={14} />
        {t ? <><Link to={`${cfg.ruta}/news`}>News</Link><ChevronRight size={14} /><span>{t.nombre}</span></> : <span>News</span>}
      </nav>

      <header className="aip-diario-cab">
        <p className="aip-diario-fecha"><span className="aip-punto" /> {ahoraMadrid()} · {edicionAhora(cfg.news.ediciones)}</p>
        <h1 className="aip-diario-nombre">{t ? t.nombre : cfg.news.nombre}</h1>
        <p className="aip-sub">{t ? t.desc : cfg.news.sub}</p>
        <nav className="aip-diario-temas">
          <Link className={!tema ? 'on' : ''} to={`${cfg.ruta}/news`}>Portada</Link>
          {s.temas.map(x => <Link key={x.key} className={tema === x.key ? 'on' : ''} to={`${cfg.ruta}/news/${x.key}`}>{x.nombre}</Link>)}
        </nav>
      </header>

      {recibidos === null && <p className="aip-sub">Cargando el diario…</p>}
      {recibidos === 'error' && <p className="aip-sub">No se ha podido cargar el diario. Prueba a recargar la página en un momento.</p>}
      {primero && <ArticuloPortada a={primero} />}
      {resto.length > 0 && <div className="aip-diario-grid">{resto.map(a => <ArticuloTarjeta key={a.slug} a={a} />)}</div>}
      {Array.isArray(recibidos) && !lista.length && (
        <div className="aip-card aip-diario-vacio">
          <b>{tema ? `Todavía no hay piezas de ${t.nombre}` : cfg.news.vacio.titulo}</b>
          <p>{cfg.news.vacio.texto}</p>
        </div>
      )}

      {brevesLista.length > 0 && (
        <section className="aip-breves">
          <h2>En breve</h2>
          <ul>
            {brevesLista.map(b => (
              <li key={`${b.tema}-${b.slug}`}>
                <Link to={`${cfg.ruta}/news/${b.tema}/${b.slug}`}>
                  <span>{temaNombre(cfg, b.tema)} · {b.fuente} · {fechaCorta(b.fecha)}</span>
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
  const cfg = useComunidad()
  const { tema, slug } = useParams()
  const a = useArticulo(cfg.api, slug)
  const todos = useArticulos(cfg.api)
  const listo = a && typeof a === 'object'
  useEffect(() => { if (listo) track('vista_pagina', { pagina: `${cfg.clave}-articulo`, slug, miembro: Boolean(acceso) }) }, [listo, slug, acceso, cfg.clave])

  if (a === null) return <main className="aip-main aip-articulo"><p className="aip-sub">Cargando…</p></main>
  if (a === 'error') return <main className="aip-main aip-articulo"><p className="aip-sub">No se ha podido cargar la pieza. Prueba a recargar la página en un momento.</p></main>
  if (a === 'no') return <Navigate to={`${cfg.ruta}/news`} replace />
  if (a.tema !== tema) return <Navigate to={`${cfg.ruta}/news/${a.tema}/${a.slug}`} replace />

  // Sin acceso, el arranque de la pieza hasta el segundo párrafo (como el muro
  // de un periódico), con el ladillo que haya entre medias.
  let parrafos = 0
  const corte = a.cuerpo.findIndex(b => b.tipo === 'p' && ++parrafos === 2)
  const visibles = acceso ? a.cuerpo : a.cuerpo.slice(0, corte === -1 ? a.cuerpo.length : corte + 1)
  const mas = Array.isArray(todos) ? todos.filter(x => x.slug !== a.slug).slice(0, 3) : []

  return (
    <main className="aip-main aip-articulo">
      <nav className="aip-migas">
        <Link to={cfg.ruta}>Inicio</Link><ChevronRight size={14} />
        <Link to={`${cfg.ruta}/news`}>News</Link><ChevronRight size={14} />
        <Link to={`${cfg.ruta}/news/${a.tema}`}>{temaNombre(cfg, a.tema)}</Link>
      </nav>

      <header className="aip-articulo-cab">
        <Kicker a={a} />
        <h1>{a.titular}</h1>
        <p className="aip-articulo-entradilla">{a.subtitulo}</p>
        <p className="aip-articulo-firma">{`Por la redacción de ${cfg.nombre} · `}{fechaLarga(a.fecha)}</p>
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
          setAcceso={setAcceso} pipeline={cfg.crm.embudoComunidad} nota={`leyó news/${a.slug}`}
          titulo="Sigue leyendo"
          texto={cfg.textos.puertaArticulo}
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
            {`Esta pieza la ha investigado y redactado la redacción automática de ${cfg.nombre} a partir de las fuentes citadas, y la ha revisado un segundo agente que comprueba cada dato contra ellas. Si ves un error, escríbenos por `}
            <a href={cfg.fundador.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>.
          </p>
        </>
      )}

      {mas.length > 0 && (
        <section className="aip-diario-mas">
          <h2>Más del diario</h2>
          <div className="aip-diario-grid">{mas.map(x => <ArticuloTarjeta key={x.slug} a={x} />)}</div>
        </section>
      )}

      <Link className="aip-volver" to={`${cfg.ruta}/news`}><ArrowLeft size={16} /> Volver al diario</Link>
    </main>
  )
}
