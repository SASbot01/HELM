// HELM — la web pública del producto: helm.s4sf.net/web (y la raíz del
// dominio del panel para quien entra sin sesión; con sesión, Raiz en main.jsx
// le manda a /admin).
//
// Una historia guiada por el scroll: la palabra HELM se abre sobre una escena
// 3D (escena.js, cargada aparte) y siete capítulos cuentan qué es y cómo
// funciona mientras la cámara recorre el «puesto de mando». Debajo, lo de
// siempre: pasos, secciones del panel, el conector de Claude y los precios.
//
// Todo lo que nombra existe en el panel (ver src/helm/permisos.js → SECCIONES)
// y aquí no se promete nada que no esté hecho, ni hay testimonios ni cifras de
// clientes (las del informe de la escena van marcadas como ejemplo).
// Textos en español, inglés y alemán: textos.js.
//
// Los packs los decide el servidor (GET /api/creditos?action=packs). Si no
// contesta, la sección de precios explica el modelo igual, sin las cifras.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, ClipboardList, Bot, CalendarRange, ChartColumn, Wallet, FileText, UserCog, ScanSearch, Plug, ArrowRight,
} from 'lucide-react'
import { crearHistoria } from './historia.js'
import { IDIOMAS, traductor, idiomaInicial } from './textos.js'
import '../../fonts/barlow-condensed.css'
import './web.css'

// Secciones reales del panel, con su nombre del menú.
const SECCIONES = [
  [Users, 'crm'], [ClipboardList, 'onb'], [Bot, 'age'], [CalendarRange, 'road'], [ChartColumn, 'inf'],
  [Wallet, 'fin'], [FileText, 'doc'], [UserCog, 'eq'], [ScanSearch, 'scr'], [Plug, 'con'],
]

// Las herramientas que el conector le da a Claude (api/mcp/[token].js → DEL_CLIENTE).
const HERRAMIENTAS = ['perfiles', 'calendario', 'programar_guiones', 'corpus', 'identidades', 'metricas', 'ordenar_video', 'guardar_memoria']

const LOCALE = { es: 'es-ES', en: 'en-GB', de: 'de-DE' }

function Marca({ clase = '' }) {
  return (
    <span className={'hx-marca ' + clase}>
      <img src="/assets/logos/helm-mark.svg" alt="" />
      <span>HELM</span>
    </span>
  )
}

export default function Web() {
  const [lang, setLang] = useState(idiomaInicial)
  const T = useMemo(() => traductor(lang), [lang])
  const TRef = useRef(T)
  TRef.current = T
  const [precios, setPrecios] = useState(null)
  const [menu, setMenu] = useState(false)
  const escenaRef = useRef(null)
  const ref = {
    raiz: useRef(null), cabecera: useRef(null), historia: useRef(null), escenario: useRef(null),
    mascara: useRef(null), palabra: useRef(null), texto: useRef(null), intro: useRef(null),
    capitulos: useRef(null), canvas: useRef(null), etiquetas: useRef(null),
  }
  const num = (v) => Number(v).toLocaleString(LOCALE[lang], { useGrouping: 'always' })

  // Idioma: título, <html lang> y la escena.
  useEffect(() => {
    document.title = T('meta.titulo')
    document.documentElement.lang = lang
    escenaRef.current?.idioma(() => TRef.current)
  }, [lang, T])
  useEffect(() => () => { document.documentElement.lang = 'es' }, [])

  function cambiaIdioma(l) {
    setLang(l)
    try { localStorage.setItem('helm-web-lang', l) } catch { /* sin almacenamiento */ }
    const u = new URL(window.location.href)
    u.searchParams.set('lang', l)
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash)
  }

  useEffect(() => {
    let vivo = true
    fetch('/api/creditos?action=packs')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && Array.isArray(d?.packs)) setPrecios(d) })
      .catch(() => { /* sin cifras: la sección se pinta igual */ })
    return () => { vivo = false }
  }, [])

  // La historia y la escena 3D. Van por estilos y clases, fuera de React.
  useEffect(() => {
    const raiz = ref.raiz.current
    const historia = crearHistoria({
      raiz,
      cabecera: ref.cabecera.current,
      historia: ref.historia.current,
      escenario: ref.escenario.current,
      mascara: ref.mascara.current,
      palabra: ref.palabra.current,
      texto: ref.texto.current,
      intro: ref.intro.current,
      capitulos: ref.capitulos.current,
      tarjetas: Array.from(ref.escenario.current.querySelectorAll('[data-tarjeta]')),
    })
    window.__helmWeb = historia
    let cancelado = false
    let escena = null
    import('./escena.js')
      .then(({ hayWebGL, montarEscena }) => {
        if (cancelado) return
        if (!hayWebGL()) { raiz.classList.add('sin-3d'); return }
        escena = montarEscena({ canvas: ref.canvas.current, etiquetas: ref.etiquetas.current, getT: () => TRef.current })
        escenaRef.current = escena
        historia.onFrame((t, dt, fuera) => { if (!fuera) escena.render(t, dt) })
      })
      .catch((e) => { console.warn('[helm web] sin escena 3D', e); raiz.classList.add('sin-3d') })

    // Un ancla en la URL (#precios…): el alto de la historia ya está fijado.
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1))
      if (el) setTimeout(() => el.scrollIntoView(), 0)
    }
    return () => {
      cancelado = true
      historia.dispose()
      escena?.dispose()
      escenaRef.current = null
      if (window.__helmWeb === historia) delete window.__helmWeb
    }
    // Las refs no cambian: el efecto se monta una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Idiomas = ({ clase = '' }) => (
    <div className={'hx-idioma ' + clase} role="group" aria-label={T('nav.idioma')}>
      {IDIOMAS.map(l => (
        <button key={l} type="button" lang={l} aria-pressed={l === lang} onClick={() => cambiaIdioma(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  )
  const enlaces = [['#como', 'nav.como'], ['#dentro', 'nav.dentro'], ['#claude', 'nav.claude'], ['#precios', 'nav.precios']]

  return (
    // className fijo: historia.js y la escena le ponen clases (is-fuera, sin-3d)
    // que React borraría al re-renderizar; el menú va por data-menu.
    <div className="hx" data-menu={menu ? 'abierto' : undefined} ref={ref.raiz}>
      <div className="hx-cielo" aria-hidden="true" />
      <canvas className="hx-escena" ref={ref.canvas} aria-hidden="true" />
      <div className="hx-etiquetas" ref={ref.etiquetas} aria-hidden="true" />
      <div className="hx-grano" aria-hidden="true" />

      <header className="hx-cab" ref={ref.cabecera}>
        <Link to="/web" className="hx-cab-marca" aria-label="HELM"><Marca /></Link>
        <nav className="hx-nav" aria-label="HELM">
          {enlaces.map(([h, k]) => <a key={h} href={h}>{T(k)}</a>)}
        </nav>
        <div className="hx-cab-der">
          <Idiomas />
          <Link to="/login" className="hx-btn hx-btn--sec hx-btn--sm hx-solo-ancho">{T('nav.entrar')}</Link>
          <Link to="/registro" className="hx-btn hx-btn--sm hx-solo-ancho">{T('nav.crear')}</Link>
          <button type="button" className="hx-hamb" aria-expanded={menu} aria-controls="hx-menu" onClick={() => setMenu(m => !m)}>
            <span /><span /><span className="hx-sr">{T('nav.menu')}</span>
          </button>
        </div>
      </header>

      <div className="hx-menu" id="hx-menu" onClick={(e) => { if (e.target.closest('a')) setMenu(false) }}>
        <nav aria-label="HELM">
          {enlaces.map(([h, k]) => <a key={h} href={h}>{T(k)}</a>)}
        </nav>
        <div className="hx-ctas">
          <Link to="/registro" className="hx-btn">{T('nav.crear')}</Link>
          <Link to="/login" className="hx-btn hx-btn--sec">{T('nav.entrar')}</Link>
        </div>
      </div>

      <main>
        {/* ══ Historia: escena fija; las tarjetas cambian con el scroll ══ */}
        <div className="hx-historia" ref={ref.historia}>
          <span className="hx-ancla" id="inicio" data-at="0" />
          <span className="hx-ancla" id="como" data-at="2.45" />

          <div className="hx-escenario" ref={ref.escenario}>
            <svg className="hx-mascara" ref={ref.mascara} aria-hidden="true" focusable="false">
              <defs>
                <mask id="hx-mascara" maskUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
                  <g ref={ref.palabra}><text ref={ref.texto} x="0" y="0" textAnchor="middle" fill="#000">HELM</text></g>
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="#050508" mask="url(#hx-mascara)" />
            </svg>

            <div className="hx-intro" ref={ref.intro}>
              <p>{T('hero.tag')}</p>
              <span className="hx-cue"><span>{T('hero.desliza')}</span><i /></span>
            </div>

            <div className="hx-tarjetas">
              <section className="hx-tarjeta hx-tarjeta--hero" data-tarjeta="0">
                <p className="hx-badge">{T('hero.badge')}</p>
                <h1 className="hx-display">
                  <span>{T('hero.l1')}</span>
                  <span className="hx-oro">{T('hero.l2')}</span>
                  <span>{T('hero.l3')}</span>
                </h1>
                <p className="hx-lead">{T('hero.lead')}</p>
                <div className="hx-ctas">
                  <Link to="/registro" className="hx-btn hx-btn--xl">{T('hero.cta1')} <ArrowRight size={17} /></Link>
                  <a href="#como" className="hx-btn hx-btn--xl hx-btn--sec">{T('hero.cta2')}</a>
                </div>
                <p className="hx-nota">{T('hero.nota')}</p>
              </section>

              {[1, 2, 3, 4, 5, 6, 7].map(i => {
                const pills = ['x1', 'x2', 'x3', 'x4'].map(x => `c${i}.${x}`).filter(k => T(k) !== k)
                return (
                  <section className="hx-tarjeta" data-tarjeta={i} key={i}>
                    <p className="hx-kicker">{T(`c${i}.k`)}</p>
                    <h2 className="hx-display-2">{T(`c${i}.t`)}</h2>
                    <p>{T(`c${i}.p`)}</p>
                    {pills.length > 0 && <ul className="hx-pills">{pills.map(k => <li key={k}>{T(k)}</li>)}</ul>}
                  </section>
                )
              })}

              <section className="hx-tarjeta hx-tarjeta--fin" data-tarjeta="8">
                <h2 className="hx-display">
                  <span>{T('fin.t1')}</span>
                  <span className="hx-oro">{T('fin.t2')}</span>
                </h2>
                <p>{T('fin.p')}</p>
                <div className="hx-ctas">
                  <Link to="/registro" className="hx-btn hx-btn--xl">{T('fin.cta1')} <ArrowRight size={17} /></Link>
                  <a href="#precios" className="hx-btn hx-btn--xl hx-btn--sec">{T('fin.cta2')}</a>
                </div>
              </section>
            </div>

            <ol className="hx-capitulos" ref={ref.capitulos} aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7].map(i => <li key={i}>{String(i).padStart(2, '0')}</li>)}
            </ol>
          </div>
        </div>

        {/* ══ Cómo funciona ══ */}
        <section className="hx-sec hx-sec--brillo" id="pasos">
          <div className="hx-envuelve">
            <div className="hx-cabeza">
              <p className="hx-kicker">{T('pasos.k')}</p>
              <h2>{T('pasos.t')}</h2>
            </div>
            <ol className="hx-pasos">
              {[1, 2, 3, 4].map(i => (
                <li key={i} className="hx-pieza">
                  <span className="hx-paso-n hx-oro">{String(i).padStart(2, '0')}</span>
                  <h3>{T(`pasos.${i}.t`)}</h3>
                  <p>{T(`pasos.${i}.p`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ══ Lo que hay dentro ══ */}
        <section className="hx-sec" id="dentro">
          <div className="hx-envuelve">
            <div className="hx-cabeza">
              <p className="hx-kicker">{T('dentro.k')}</p>
              <h2>{T('dentro.t')}</h2>
            </div>
            <ul className="hx-secciones">
              {SECCIONES.map(([Icono, k]) => (
                <li key={k} className="hx-pieza">
                  <span className="hx-icono"><Icono size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                  <b>{T(`sec.${k}.t`)}</b>
                  <span>{T(`sec.${k}.p`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ══ Conector de Claude ══ */}
        <section className="hx-sec hx-sec--brillo" id="claude">
          <div className="hx-envuelve hx-claude">
            <div className="hx-cabeza">
              <p className="hx-kicker">{T('claude.k')}</p>
              <h2>{T('claude.t')}</h2>
              <p>{T('claude.p')}</p>
            </div>
            <div className="hx-pieza hx-terminal" aria-label={T('claude.herr')}>
              <div className="hx-terminal-cab"><i /><i /><i /><span>helm · mcp</span></div>
              <ul>{HERRAMIENTAS.map(h => <li key={h}><code>{h}</code></li>)}</ul>
            </div>
          </div>
        </section>

        {/* ══ Precios ══ */}
        <section className="hx-sec" id="precios">
          <div className="hx-envuelve">
            <div className="hx-cabeza hx-cabeza--centro">
              <p className="hx-kicker">{T('precios.k')}</p>
              <h2>{T('precios.t')}</h2>
              <p>{T('precios.p')}</p>
            </div>
            <div className="hx-precio">
              <div className="hx-pieza hx-precio-reglas">
                <dl>
                  <div><dt>1 €</dt><dd>{T('precios.cien')}</dd></div>
                  <div>
                    <dt>{precios?.bienvenida ? num(precios.bienvenida) : T('precios.regalo')}</dt>
                    <dd>{T('precios.bienvenida')}</dd>
                  </div>
                </dl>
                <div className="hx-gasta">
                  <div><b>{T('precios.gasta.t')}</b><span>{T('precios.gasta.p')}</span></div>
                  <div><b>{T('precios.nogasta.t')}</b><span>{T('precios.nogasta.p')}</span></div>
                </div>
              </div>
              {precios?.packs?.length > 0 && (
                <ul className="hx-packs" aria-label={T('precios.packs')}>
                  {precios.packs.map(p => (
                    <li key={p.id} className="hx-pieza">
                      <span className="hx-pack-eur">{num(p.euros)} €</span>
                      <span className="hx-pack-cr">{num(p.creditos)} {T('precios.creditos')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* ══ Cierre ══ */}
        <section className="hx-sec hx-sec--final">
          <div className="hx-envuelve">
            <div className="hx-final hx-pieza">
              <img src="/assets/logos/helm-mark.svg" alt="" className="hx-final-logo" />
              <h2>{T('fin.t1')} <span className="hx-oro">{T('fin.t2')}</span></h2>
              <p>{T('fin.p')}</p>
              <div className="hx-ctas">
                <Link to="/registro" className="hx-btn hx-btn--xl">{T('fin.cta1')} <ArrowRight size={17} /></Link>
                <Link to="/login" className="hx-btn hx-btn--xl hx-btn--sec">{T('puente.ya')}</Link>
              </div>
              <p className="hx-puente">
                <b>{T('puente.t')}</b> {T('puente.p')} <a href="https://s4sf.net/empresas">{T('puente.cta')} →</a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="hx-pie">
        <div className="hx-envuelve hx-pie-in">
          <Marca clase="hx-marca--pie" />
          <span>{T('pie.hecho')}</span>
          <nav>
            <Link to="/login">{T('nav.entrar')}</Link>
            <Link to="/registro">{T('nav.crear')}</Link>
            <Link to="/privacidad">{T('pie.privacidad')}</Link>
            <Link to="/aviso-legal">{T('pie.legal')}</Link>
            <a href="https://s4sf.net">s4sf.net</a>
          </nav>
          <Idiomas clase="hx-idioma--pie" />
        </div>
      </footer>
    </div>
  )
}
