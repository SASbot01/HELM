// HELM — la web pública del producto: helm.s4sf.net/web (y la raíz del
// dominio del panel para quien entra sin sesión; con sesión, Raiz en main.jsx
// le manda a /admin).
//
// Cuatro preguntas, en este orden: qué es y para quién, cómo funciona, qué
// cuesta y por dónde se entra. Todo lo que nombra existe en el panel (ver
// src/helm/permisos.js → SECCIONES) y las capturas son de la app de verdad:
// aquí no se promete nada que no esté hecho, ni hay testimonios ni cifras de
// clientes.
//
// Los packs los decide el servidor (GET /api/creditos?action=packs). Si no
// contesta, la sección de precios explica el modelo igual, sin las cifras.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, ClipboardList, Bot, CalendarRange, ChartColumn, Wallet, FileText, UserCog, ScanSearch, Plug, ArrowRight,
} from 'lucide-react'
import './web.css'

const PASOS = [
  {
    titulo: 'Crea tu agencia',
    texto: 'Te registras con el nombre de tu agencia y entras directo al panel, con créditos de bienvenida para probar la IA.',
  },
  {
    titulo: 'Un perfil por cliente',
    texto: 'Cada cliente tiene su CRM, su onboarding y su equipo. Invitas a closers, setters o editores y cada uno ve solo lo suyo.',
  },
  {
    titulo: 'El contenido se mueve solo',
    texto: 'Los agentes escriben los guiones a partir de creadores de referencia y los colocan en el roadmap. Tú grabas; el vídeo entra por Drive y HELM lo ordena.',
  },
  {
    titulo: 'Mide y ajusta',
    texto: 'El informe trae las métricas de Instagram y estudia qué tienen las piezas que funcionan, para decidir qué grabar la semana siguiente.',
  },
]

// Secciones reales del panel, con su nombre del menú.
const SECCIONES = [
  [Users, 'CRM', 'Pipeline por etapas, ficha de contacto y actividad. Los formularios meten los leads solos.'],
  [ClipboardList, 'Onboarding', 'Las respuestas del cliente y su Biblia: el contexto que leen los agentes.'],
  [Bot, 'Agentes', 'El equipo de IA de cada perfil y sus creadores de referencia.'],
  [CalendarRange, 'Roadmap', 'El plan a seis meses, semana a semana, con el guion de cada día.'],
  [ChartColumn, 'Informe', 'Métricas de Instagram y el estudio de qué funciona.'],
  [Wallet, 'Ventas y finanzas', 'Ventas, ingresos, gastos y comisiones.'],
  [FileText, 'Documentos', 'Presupuestos y facturas.'],
  [UserCog, 'Equipo', 'Personas, pagos y permisos por rol.'],
  [ScanSearch, 'Scraper', 'Leads de cinco fuentes, directos al embudo.'],
  [Plug, 'Conector de Claude', 'Un enlace para tu agencia entera.'],
]

// Las herramientas que el conector le da a Claude (api/mcp/[token].js → DEL_CLIENTE).
const HERRAMIENTAS = ['perfiles', 'calendario', 'programar_guiones', 'corpus', 'identidades', 'metricas', 'ordenar_video', 'guardar_memoria']

const num = (v) => Number(v).toLocaleString('es-ES', { useGrouping: 'always' })

function Movil({ src, alt, className = '' }) {
  return (
    <figure className={'hw-movil ' + className}>
      <img src={src} alt={alt} width="786" height="1550" decoding="async" />
    </figure>
  )
}

export default function Web() {
  const [precios, setPrecios] = useState(null)

  useEffect(() => {
    document.title = 'HELM · El sistema para operar a tus clientes'
    let vivo = true
    fetch('/api/creditos?action=packs')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && Array.isArray(d?.packs)) setPrecios(d) })
      .catch(() => { /* sin cifras: la sección se pinta igual */ })
    return () => { vivo = false }
  }, [])

  return (
    <div className="hw">
      <header className="hw-cab">
        <div className="hw-cab-in">
          <Link to="/web" className="hw-marca" aria-label="HELM">
            <img src="/assets/logos/helm-mark.svg" alt="" />
            <span>HELM</span>
          </Link>
          <nav className="hw-nav" aria-label="Secciones">
            <a href="#como">Cómo funciona</a>
            <a href="#claude">Claude</a>
            <a href="#precios">Precios</a>
          </nav>
          <div className="hw-cab-acc">
            <Link to="/login" className="hw-btn hw-btn--sec">Entrar</Link>
            <Link to="/registro" className="hw-btn">Crear cuenta</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hw-hero">
          <div className="hw-hero-txt">
            <p className="hw-eti">Para agencias que llevan clientes</p>
            <h1>El sistema con el que operamos a nuestros clientes. <span>Ahora, para los tuyos.</span></h1>
            <p className="hw-lead">
              HELM junta en un panel el CRM, el contenido y las ventas de cada cliente, con agentes de IA
              que escriben los guiones y los programan. En Silvestre AI lo usamos cada día: crea tu agencia
              y úsalo con tus clientes.
            </p>
            <div className="hw-ctas">
              <Link to="/registro" className="hw-btn hw-btn--xl">Crear cuenta <ArrowRight size={17} /></Link>
              <a href="#como" className="hw-btn hw-btn--xl hw-btn--sec">Ver cómo funciona</a>
            </div>
            <p className="hw-nota">Sin cuota mensual. Pagas lo que gasta la IA.</p>
          </div>
          <div className="hw-hero-vis" aria-label="Capturas del panel de HELM">
            <Movil src="/socio/sistema/menu.jpg" alt="El menú de un perfil en HELM, con todas sus secciones" className="hw-movil--a" />
            <Movil src="/socio/sistema/informe.jpg" alt="El informe de HELM: facturado, cobrado, ventas y balance" className="hw-movil--b" />
            <Movil src="/socio/sistema/agentes.jpg" alt="El equipo de agentes de IA de un perfil" className="hw-movil--c" />
          </div>
        </section>

        <section className="hw-bloque" id="como">
          <p className="hw-eti">Cómo funciona</p>
          <h2>De la cuenta al primer guion grabado.</h2>
          <ol className="hw-pasos">
            {PASOS.map((p, i) => (
              <li key={p.titulo}>
                <span className="hw-nodo" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="hw-bloque">
          <p className="hw-eti">Lo que hay dentro</p>
          <h2>Las mismas secciones que usamos a diario, en cada uno de tus clientes.</h2>
          <ul className="hw-secciones">
            {SECCIONES.map(([Icono, t, d]) => (
              <li key={t}>
                <Icono size={18} strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="hw-bloque hw-claude" id="claude">
          <div>
            <p className="hw-eti">Conector de Claude</p>
            <h2>Tu agencia, dentro de Claude.</h2>
            <p className="hw-sub">
              Pegas un enlace en Claude y trabaja con todos tus clientes desde el chat: consulta el
              calendario y las métricas, escribe con la voz de cada perfil, programa guiones y coloca
              los vídeos en su carpeta.
            </p>
          </div>
          <div className="hw-pieza hw-terminal" aria-label="Herramientas que el conector le da a Claude">
            <div className="hw-terminal-cab"><i /><i /><i /><span>helm · conector</span></div>
            <ul>
              {HERRAMIENTAS.map(h => <li key={h}><code>{h}</code></li>)}
            </ul>
          </div>
        </section>

        <section className="hw-bloque" id="precios">
          <p className="hw-eti">Precios</p>
          <h2>Pago por uso. Sin cuota ni permanencia.</h2>
          <p className="hw-sub">
            Compras créditos por adelantado y se gastan solo cuando trabaja la IA de HELM.
            Usar el panel no gasta nada.
          </p>
          <div className="hw-precio">
            <div className="hw-pieza hw-precio-reglas">
              <dl>
                <div><dt>1 €</dt><dd>100 créditos</dd></div>
                <div>
                  <dt>{precios?.bienvenida ? num(precios.bienvenida) : 'Regalo'}</dt>
                  <dd>créditos de bienvenida al registrarte</dd>
                </div>
              </dl>
              <div className="hw-gasta">
                <div>
                  <b>Gasta créditos</b>
                  <span>Los agentes que escriben guiones, el contenido automático y el asistente del panel.</span>
                </div>
                <div>
                  <b>No gasta</b>
                  <span>El CRM, el roadmap, los documentos y lo que Claude haga con tu propia cuenta a través del conector.</span>
                </div>
              </div>
            </div>
            {precios?.packs?.length > 0 && (
              <ul className="hw-packs" aria-label="Packs de créditos">
                {precios.packs.map(p => (
                  <li key={p.id} className="hw-pieza">
                    <span className="hw-pack-eur">{num(p.euros)} €</span>
                    <span className="hw-pack-cr">{num(p.creditos)} créditos</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="hw-final hw-pieza">
          <img src="/assets/logos/helm-mark.svg" alt="" className="hw-final-logo" />
          <h2>Empieza con tu primer cliente.</h2>
          <p>Crea la cuenta, da de alta a un cliente y prueba el sistema con los créditos de bienvenida.</p>
          <div className="hw-ctas">
            <Link to="/registro" className="hw-btn hw-btn--xl">Crear cuenta <ArrowRight size={17} /></Link>
            <Link to="/login" className="hw-btn hw-btn--xl hw-btn--sec">Ya tengo cuenta</Link>
          </div>
          <p className="hw-puente">
            ¿Prefieres que lo montemos y lo llevemos contigo? <a href="https://s4sf.net/empresas">Mira cómo trabajamos</a>.
          </p>
        </section>
      </main>

      <footer className="hw-pie">
        <span className="hw-marca hw-marca--pie"><img src="/assets/logos/helm-mark.svg" alt="" /><span>HELM</span></span>
        <span>Hecho por Silvestre AI</span>
        <nav>
          <Link to="/login">Entrar</Link>
          <Link to="/registro">Crear cuenta</Link>
          <a href="https://s4sf.net">s4sf.net</a>
        </nav>
      </footer>
    </div>
  )
}
