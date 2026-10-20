// AI para todo — las webs de referencia: s4sf.net/aiparatodo/webs.
//
//   /aiparatodo/webs                    el panel: la portada de cada web a la
//   /aiparatodo/webs/<sector>           vista, filtrable por sector
//   /aiparatodo/webs/<sector>/<slug>    la ficha: las dos capturas, su estilo,
//                                       qué copiar y el prompt
//
// Las portadas se ven sin dejar nada, para elegir por el estilo. Copiar el
// prompt y entrar en la web pasan por la puerta de la comunidad (nombre,
// correo y a qué te dedicas, gratis y una sola vez), igual que leer un hilo.
// Los datos están en ./webs.js; el motor (Comunidad.jsx) pinta esto porque la
// configuración lo pide en `vistas`.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, ExternalLink, X } from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { useComunidad } from '../comunidad/datos.js'
import Puerta from '../comunidad/Puerta.jsx'
import {
  WEBS, SECTORES, NIVELES, webPorSlug, websDe, sectorDe, numeroDe, promptDe, imagenDe, anfitrion, FUENTES, CAPTURAS_FECHA,
} from './webs.js'
import './webs.css'

// ── Copiar al portapapeles ──────────────────────────────────────────────────
// Mucha gente llega desde la bio de Instagram, y su navegador interno no
// siempre deja usar navigator.clipboard: entonces, el método de siempre.
function copiaTexto(texto) {
  const aMano = () => {
    const t = document.createElement('textarea')
    t.value = texto
    t.setAttribute('readonly', '')
    t.style.position = 'fixed'; t.style.top = '-1000px'; t.style.opacity = '0'
    document.body.appendChild(t)
    t.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    t.remove()
    return ok
  }
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto).then(() => true, aMano)
  } catch { /* sigue abajo */ }
  return Promise.resolve(aMano())
}

function useCopiar() {
  const [estado, setEstado] = useState(null)   // null · 'ok' · 'mal'
  const reloj = useRef(null)
  useEffect(() => () => clearTimeout(reloj.current), [])
  const copiar = (texto) => copiaTexto(texto).then(ok => {
    setEstado(ok ? 'ok' : 'mal')
    clearTimeout(reloj.current)
    reloj.current = setTimeout(() => setEstado(null), 2200)
    return ok
  })
  return [estado, copiar]
}

// ── Piezas ─────────────────────────────────────────────────────────────────
// Una web con un solo pie solo tiene una captura que valga (Forge: la puerta).
const unaCaptura = (w) => w.pies?.length === 1

function Insignias({ w }) {
  return (
    <span className="aipw-insignias">
      {w.mejor && <span className="aipw-mejor">La mejor del sector</span>}
      {w.insignias.map(([nivel, texto]) => <span key={texto} className={`aipw-insignia ${nivel}`}>{texto}</span>)}
    </span>
  )
}

function Escalera() {
  return (
    <div className="aipw-escalera" aria-label="Niveles de premio, de menor a mayor">
      <span className="aipw-escalera-tit">Nivel del premio</span>
      {['hm', 'sotd', 'sotm', 'soty'].map((k, i) => (
        <span key={k} className="aipw-escalon">
          {i > 0 && <span className="aipw-flecha" aria-hidden="true">→</span>}
          <span className={`aipw-insignia ${k}`}>{NIVELES[k].corto}</span> {NIVELES[k].nombre}
        </span>
      ))}
    </div>
  )
}

// El bloque del prompt: el texto entero, a la vista, con su botón.
function BloquePrompt({ w }) {
  const cfg = useComunidad()
  const [estado, copiar] = useCopiar()
  const texto = promptDe(w)
  return (
    <div className="aipw-prompt">
      <div className="aipw-prompt-cab">
        <b>El prompt para tu IA</b>
        <button
          type="button" className="aip-btn pequeno"
          onClick={() => { copiar(texto); track('clic_cta', { donde: `${cfg.cta}-web-prompt`, web: w.slug }) }}
        >
          {estado === 'ok' ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar prompt</>}
        </button>
      </div>
      <pre>{texto}</pre>
      {estado === 'mal' && <p className="aipw-aviso" role="status">Tu navegador no deja copiar solo: mantén pulsado el texto y cópialo a mano.</p>}
      <p className="aipw-prompt-pie">Cambia lo que va entre corchetes. Pásaselo a Claude, ChatGPT o la IA con la que hagas tu web, junto con una captura de la referencia.</p>
    </div>
  )
}

function BotonVisitar({ w, pequeno = false }) {
  const cfg = useComunidad()
  return (
    <a
      className={`aip-btn sec${pequeno ? ' pequeno' : ''}`} href={w.url} target="_blank" rel="noopener noreferrer"
      onClick={() => track('clic_cta', { donde: `${cfg.cta}-web-visitar`, web: w.slug })}
    >
      Ver la web <ExternalLink size={14} />
    </a>
  )
}

// La ventana de la puerta: se abre al pulsar «Copiar prompt» o «Ver la web»
// sin acceso. Cuando se deja los datos, en la misma ventana sale lo pedido.
function Ventana({ w, accion, acceso, setAcceso, cerrar }) {
  const cfg = useComunidad()
  const caja = useRef(null)
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [cerrar])
  // Al abrirse: el foco dentro y la página de detrás quieta.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    caja.current?.querySelector('input:not([tabindex="-1"]), button')?.focus()
    return () => { document.body.style.overflow = antes }
  }, [])
  return (
    <div className="aipw-velo" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="aipw-ventana" role="dialog" aria-modal="true" aria-label={`${w.nombre}: ${accion === 'prompt' ? 'el prompt' : 'la web'}`} ref={caja}>
        <button type="button" className="aipw-cerrar" onClick={cerrar} aria-label="Cerrar"><X size={18} /></button>
        {!acceso ? (
          <Puerta
            setAcceso={setAcceso} pipeline={cfg.crm.embudoComunidad} nota={`entró por webs/${w.slug}`}
            titulo={accion === 'prompt' ? `El prompt de ${w.nombre}, gratis` : `Entra a ver ${w.nombre}`}
            texto={`Tu nombre y tu correo, una sola vez, y se abren las ${WEBS.length} webs con su prompt, los hilos de skills, la guía de Claude y el diario.`}
          />
        ) : (
          <div className="aipw-ventana-listo">
            <p className="aip-kicker"><Check size={13} /> Ya tienes acceso a todo</p>
            <h2>{w.nombre}</h2>
            {accion === 'prompt' ? <BloquePrompt w={w} /> : <p>Ábrela en otra pestaña y vuelve aquí a por su prompt cuando quieras.</p>}
            <div className="aipw-acciones">
              <BotonVisitar w={w} />
              <Link className="aip-btn sec" to={`${cfg.ruta}/webs/${w.sector}/${w.slug}`} onClick={cerrar}>Ver la ficha <ArrowRight size={14} /></Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TarjetaWeb({ w, acceso, pide }) {
  const cfg = useComunidad()
  const [estado, copiar] = useCopiar()
  const ficha = `${cfg.ruta}/webs/${w.sector}/${w.slug}`
  return (
    <article className={'aipw-tarjeta' + (w.mejor ? ' mejor' : '') + (w.nivel === 'eleccion' ? ' eleccion' : '')}>
      <Link className="aipw-captura" to={ficha} aria-label={`Ver la ficha de ${w.nombre}`}>
        <img src={imagenDe(w, 'p')} alt={`Portada de la web de ${w.nombre}`} width="960" height="600" loading="lazy" decoding="async" />
        {unaCaptura(w) ? null : <img className="aipw-captura-2" src={imagenDe(w, 2)} alt="" width="1440" height="900" loading="lazy" decoding="async" aria-hidden="true" />}
        <span className="aipw-num">{String(numeroDe(w)).padStart(2, '0')}</span>
        {unaCaptura(w) && <span className="aipw-entrada">Pantalla de entrada</span>}
      </Link>
      <div className="aipw-tarjeta-txt">
        <Insignias w={w} />
        <h3><Link to={ficha}>{w.nombre}</Link></h3>
        <p className="aipw-meta">{w.meta}</p>
        <p className="aipw-porque">{w.porque}</p>
        <div className="aipw-acciones">
          <button
            type="button" className="aip-btn pequeno"
            onClick={() => {
              if (!acceso) return pide(w, 'prompt')
              copiar(promptDe(w))
              track('clic_cta', { donde: `${cfg.cta}-web-prompt`, web: w.slug })
            }}
          >
            {estado === 'ok' ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar prompt</>}
          </button>
          {acceso
            ? <BotonVisitar w={w} pequeno />
            : <button type="button" className="aip-btn sec pequeno" onClick={() => pide(w, 'web')}>Ver la web <ExternalLink size={14} /></button>}
        </div>
        {estado === 'mal' && <p className="aipw-aviso" role="status">No se ha podido copiar aquí: ábrelo en la ficha.</p>}
      </div>
    </article>
  )
}

// ── El panel ───────────────────────────────────────────────────────────────
export function PanelWebs({ acceso, setAcceso }) {
  const cfg = useComunidad()
  const { tema } = useParams()
  const sector = tema ? sectorDe(tema) : null
  const [pedido, setPedido] = useState(null)   // { w, accion } mientras la ventana está abierta
  const cerrar = useCallback(() => setPedido(null), [])
  useEffect(() => { track('vista_pagina', { pagina: `${cfg.clave}-webs`, tema }) }, [cfg.clave, tema])
  if (tema && !sector) return <Navigate to={`${cfg.ruta}/webs`} replace />
  const pide = (w, accion) => { setPedido({ w, accion }); track('clic_cta', { donde: `${cfg.cta}-web-puerta`, web: w.slug, accion }) }
  const grupos = sector ? [sector] : SECTORES

  return (
    <main className="aip-main aipw">
      <nav className="aip-migas">
        <Link to={cfg.ruta}>Inicio</Link><ChevronRight size={14} />
        {sector ? <><Link to={`${cfg.ruta}/webs`}>Webs de referencia</Link><ChevronRight size={14} /><span>{sector.nombre}</span></> : <span>Webs de referencia</span>}
      </nav>

      <header className="aipw-cab">
        <p className="aip-kicker"><span className="aip-punto" /> {WEBS.length} webs · con su prompt · gratis</p>
        <h1 className="aip-h1">{sector ? sector.nombre : <>Webs premiadas para darle a <em>tu IA</em></>}</h1>
        <p className="aip-sub">
          {sector ? sector.desc : (
            <>La IA sola te devuelve la web media de internet. Dale una de estas como referencia y cambia el resultado.
              Mira su portada, entra a verla y copia el prompt para que tu IA te haga la tuya con su estilo.</>
          )}
        </p>
        <Escalera />
      </header>

      <nav className="aipw-filtros" aria-label="Filtrar por sector">
        <Link className={!sector ? 'on' : ''} to={`${cfg.ruta}/webs`}>Todas <span>{WEBS.length}</span></Link>
        {SECTORES.map(s => (
          <Link key={s.key} className={sector?.key === s.key ? 'on' : ''} to={`${cfg.ruta}/webs/${s.key}`}>{s.nombre} <span>{websDe(s.key).length}</span></Link>
        ))}
      </nav>

      {grupos.map(s => (
        <section key={s.key} className="aipw-grupo" aria-labelledby={`aipw-${s.key}`}>
          {!sector && (
            <div className="aipw-grupo-cab">
              <h2 id={`aipw-${s.key}`}>{s.nombre}</h2>
              <p>{s.desc}</p>
            </div>
          )}
          {sector && <h2 id={`aipw-${s.key}`} className="aipw-oculto">{s.nombre}</h2>}
          <div className="aipw-rejilla">
            {websDe(s.key).map(w => <TarjetaWeb key={w.slug} w={w} acceso={acceso} pide={pide} />)}
          </div>
        </section>
      ))}

      <Pie />

      {pedido && (
        <Ventana
          w={pedido.w} accion={pedido.accion} acceso={acceso} setAcceso={setAcceso} cerrar={cerrar}
        />
      )}
    </main>
  )
}

function Pie() {
  return (
    <section className="aipw-pie">
      <p className="aipw-regla"><b>Referencia no es copia.</b> Se toma el estilo y la forma de mover las cosas. Los textos, fotos y logos de estas webs tienen dueño.</p>
      <p>
        Solo entran webs con un premio verificado en Awwwards o CSS Design Awards, con fecha y estudio, salvo la de GTA VI, que es
        una elección propia y va marcada así. Las capturas son de las webs originales, hechas
        el {CAPTURAS_FECHA}; pueden haber cambiado desde entonces.
      </p>
      <p className="aipw-fuentes">
        Fuentes: {FUENTES.map((f, i) => <span key={f.url}>{i > 0 && ' · '}<a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a></span>)}
      </p>
    </section>
  )
}

// ── La ficha de una web ────────────────────────────────────────────────────
export function FichaWeb({ acceso, setAcceso }) {
  const cfg = useComunidad()
  const { tema, slug } = useParams()
  const w = webPorSlug(slug)
  useEffect(() => { if (w) track('vista_pagina', { pagina: `${cfg.clave}-web`, web: w.slug, miembro: Boolean(acceso) }) }, [w, acceso, cfg.clave])
  if (!w) return <Navigate to={`${cfg.ruta}/webs`} replace />
  if (w.sector !== tema) return <Navigate to={`${cfg.ruta}/webs/${w.sector}/${w.slug}`} replace />
  const sector = sectorDe(w.sector)
  const i = WEBS.indexOf(w)
  const antes = WEBS[i - 1]
  const despues = WEBS[i + 1]

  return (
    <main className="aip-main aipw aipw-ficha">
      <nav className="aip-migas">
        <Link to={cfg.ruta}>Inicio</Link><ChevronRight size={14} />
        <Link to={`${cfg.ruta}/webs`}>Webs de referencia</Link><ChevronRight size={14} />
        <Link to={`${cfg.ruta}/webs/${sector.key}`}>{sector.nombre}</Link><ChevronRight size={14} />
        <span>{w.nombre}</span>
      </nav>

      <header className="aipw-ficha-cab">
        <p className="aip-kicker"><span className="aip-punto" /> {String(numeroDe(w)).padStart(2, '0')} · {sector.nombre} · {anfitrion(w.url)}</p>
        <h1 className="aip-h1">{w.nombre}</h1>
        <Insignias w={w} />
        <p className="aipw-premio">{w.premio}</p>
        <p className="aipw-meta">{w.meta}</p>
      </header>

      <div className={'aipw-capturas' + (unaCaptura(w) ? ' una' : '')}>
        <figure>
          <img src={imagenDe(w, 1)} alt={`La portada de ${w.nombre}`} width="1440" height="900" decoding="async" />
          <figcaption>{w.pies?.[0] || 'Al entrar'}</figcaption>
        </figure>
        {!unaCaptura(w) && (
          <figure>
            <img src={imagenDe(w, 2)} alt={`${w.nombre}, un poco más abajo`} width="1440" height="900" loading="lazy" decoding="async" />
            <figcaption>{w.pies?.[1] || 'Un poco más abajo'}</figcaption>
          </figure>
        )}
      </div>

      <section className="aip-card aipw-estilo">
        <h2>Su estilo</h2>
        <p>{w.estilo}</p>
        <div className="aipw-paleta" aria-label="Colores de la web">
          {w.paleta.map(c => <span key={c} className="aipw-color"><i style={{ background: c }} />{c}</span>)}
        </div>
        <p className="aipw-letra"><b>Letra:</b> {w.tipografia}</p>
        <h3>Qué copiar</h3>
        <ul>{w.copiar.map(x => <li key={x}><Check size={15} /><span>{x}</span></li>)}</ul>
        <p className="aipw-porque"><b>Para qué te sirve:</b> {w.porque}</p>
      </section>

      {acceso ? (
        <>
          <BloquePrompt w={w} />
          <div className="aipw-acciones grande">
            <BotonVisitar w={w} />
            {w.prueba && <a className="aipw-prueba" href={w.prueba} target="_blank" rel="noopener noreferrer">Ver el premio <ExternalLink size={13} /></a>}
          </div>
        </>
      ) : (
        <Puerta
          setAcceso={setAcceso} pipeline={cfg.crm.embudoComunidad} nota={`entró por webs/${w.slug}`}
          titulo={`El prompt de ${w.nombre}, gratis`}
          texto={`Tu nombre y tu correo, una sola vez, y se abren las ${WEBS.length} webs con su prompt, los hilos de skills, la guía de Claude y el diario.`}
        />
      )}

      <nav className="aipw-vecinas" aria-label="Otras webs">
        {antes ? <Link to={`${cfg.ruta}/webs/${antes.sector}/${antes.slug}`}><ArrowLeft size={16} /><span><small>Anterior</small><b>{antes.nombre}</b></span></Link> : <span />}
        {despues && <Link className="sig" to={`${cfg.ruta}/webs/${despues.sector}/${despues.slug}`}><span><small>Siguiente</small><b>{despues.nombre}</b></span><ArrowRight size={16} /></Link>}
      </nav>

      <Link className="aip-volver" to={`${cfg.ruta}/webs`}><ArrowLeft size={16} /> Volver a las webs</Link>
    </main>
  )
}

// ── En la portada de AI para todo: una muestra que lleva al panel ──────────
export function VitrinaWebs() {
  const cfg = useComunidad()
  const muestra = ['gta-vi', 'lando-norris', 'era-residence', 'odyssee', 'aventura-dental-arts', 'zentry'].map(webPorSlug).filter(Boolean)
  return (
    <Link className="aipw-vitrina" to={`${cfg.ruta}/webs`} onClick={() => track('clic_cta', { donde: `${cfg.cta}-vitrina-webs` })}>
      <div className="aipw-vitrina-txt">
        <p className="aip-kicker">Nuevo · gratis</p>
        <h3>{WEBS.length} webs de referencia para tu IA</h3>
        <p>Premiadas en Awwwards y CSS Design Awards, más la de GTA VI. Ve su portada antes de entrar y copia el prompt de cada una.</p>
        <span className="aip-btn pequeno">Ver las webs <ArrowRight size={14} /></span>
      </div>
      <div className="aipw-vitrina-fotos" aria-hidden="true">
        {muestra.map(w => <img key={w.slug} src={imagenDe(w, 'p')} alt="" width="960" height="600" loading="lazy" decoding="async" />)}
      </div>
    </Link>
  )
}
