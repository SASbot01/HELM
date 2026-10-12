// SOCIO IA — s4sf.net/empresas, detrás del botón «¿Eres una empresa o negocio?»
// de la página de la bio. Vende el sistema montado sobre HELM y llevado por Alex.
//
// Un solo objetivo: que un negocio que encaja reserve la auditoría de 30 min.
// Todo lo que hay en pantalla empuja hacia el formulario (#auditoria); no hay
// más salidas que compitan con él (YouTube e Instagram se quitaron a propósito;
// la clase gratis vive en la bio y solo se ofrece aquí a quien no encaja).
//
// Embudo: Reel → comenta MECANISMO → DM con enlace (?k=mecanismo&utm_…) → aquí
//   → formulario de 5 preguntas → encaja → calendario → /gracias
//                               → no encaja → /clase
//
// Textos: español de España, tuteo, frases cortas. Nada de cifras que no estén
// en el brief: lo que falta va con <Pendiente>, lo que hay que validar lleva
// [REVISAR] en un comentario encima.
import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, Check, X, Clock, ShieldCheck } from 'lucide-react'
import { PLAZAS_OCUPADAS, PLAZAS_TOTALES, FOTO_HERO, TITULARES, varianteTitular } from './config.js'
import { track } from './track.js'
import Formulario from './Formulario.jsx'
import Pendiente from './Pendiente.jsx'
import Pie from './Pie.jsx'
import { SistemaVivo, ChatVisto, GraficoCobro } from './Visuales.jsx'
import { SeccionEquipo, SeccionHelm } from './Helm.jsx'
import Capucha from './Capucha.jsx'
import { useReveal, useBotonFijo } from './reveal.js'
import { useCabeceraPublica } from '../cabecera.js'
import { useFuentesSocio } from './fuentes.js'
import './socio.css'

// Los pasos desde que rellenas el formulario. Salen de la oferta del brief.
const PROCESO = [
  { t: 'Auditoría', d: '30 minutos. Miramos tu producto y dónde se te escapa la gente.', dato: 'Gratis' },
  { t: 'Te digo si encajamos', d: 'Si no, te lo digo en la llamada y te llevas la auditoría igual.', dato: 'Sin compromiso' },
  { t: 'Montaje', d: 'Pongo a tu equipo a trabajar con tu oferta, tus datos y tus cuentas: del contenido a la entrega.', dato: '30 días · 1.000 €' },
  { t: 'Lo superviso yo', d: 'Dirijo al equipo y lo mejoro mirando los números del panel contigo. Cobro solo sobre lo que crezcas.', dato: '12 meses · %' },
]

// [REVISAR] Todas las respuestas: cortas, para que las valide Alex.
const PREGUNTAS = [
  {
    q: '¿Qué es HELM?',
    a: 'El panel donde trabaja tu equipo: CRM, agenda de llamadas, cobros y comisiones, cuotas, finanzas y el contenido. Tú lo tienes abierto para ver cómo va tu negocio cuando quieras.',
  },
  {
    q: '¿Por qué cobras porcentaje?',
    a: 'Porque así solo gano si tú ganas. Los 1.000 € cubren el montaje; el resto depende de que tu facturación suba. Y como cada venta queda registrada en HELM, los dos vemos el mismo número.',
  },
  {
    q: '¿Qué pasa si no crece mi facturación?',
    a: 'Que no me llevo porcentaje. Solo cobro sobre lo que supere lo que facturas hoy. Los 1.000 € del montaje no dependen del resultado.',
  },
  {
    q: '¿Tengo que dejar las herramientas que ya uso?',
    a: 'No. HELM se conecta a Stripe, WooCommerce, Google Calendar, Google Drive, Calendly, Instagram y Telegram. Lo que cambia es que todo acaba en un mismo sitio.',
  },
  {
    q: '¿Tengo que grabar yo el contenido?',
    a: 'Sí: la cara y el producto son tuyos, porque la gente compra a personas. El equipo te deja los guiones escritos, basados en lo que ya funciona en tu nicho, para que te lleve el mínimo tiempo.',
  },
  {
    q: '¿Los empleados son personas?',
    a: 'Son agentes: cada uno hace un trabajo concreto con tu información, siempre igual y a cualquier hora. Detrás estoy yo, que los superviso y respondo por lo que hacen. Tú hablas conmigo, no con una máquina.',
  },
  {
    q: '¿Y mis datos?',
    a: 'Se quedan en tu panel. Si lo prefieres, todo corre en un servidor propio sin mandar nada a terceros.',
  },
  {
    q: '¿Qué pasa en la llamada de auditoría?',
    a: 'Son 30 minutos. Miramos tu producto, cómo vendes hoy y dónde se te escapa la gente. Si no encajamos, te lo digo ahí mismo y te llevas el diagnóstico igual.',
  },
  {
    q: '¿Por qué solo 5 plazas?',
    a: 'Porque cada equipo lo superviso yo. Con más de 5 negocios a la vez no podría hacerlo bien.',
  },
]

function alFormulario(donde) {
  track('clic_cta', { donde })
  document.getElementById('auditoria')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function BotonAuditoria({ donde, className = '' }) {
  return (
    <a
      className={`so-btn ${className}`}
      href="#auditoria"
      onClick={(e) => { e.preventDefault(); alFormulario(donde) }}
    >
      <span>Quiero mi auditoría gratis <span className="so-nw">(30&nbsp;min)</span></span>
      <ArrowRight size={20} aria-hidden="true" />
    </a>
  )
}

function Eyebrow({ n, children }) {
  return <p className="so-eyebrow"><span>{n}</span>{children}</p>
}

export default function SocioIA() {
  const t = varianteTitular()
  const [linea1, linea2] = TITULARES[t]
  const [botonFijo, setBotonFijo] = useState(false)

  // En HELM el <head> es el del panel: título, OG y tipografías se ponen aquí
  // al entrar y se quitan al salir.
  useCabeceraPublica({
    titulo: 'Tu equipo digital — Alex Silvestre',
    descripcion: 'Un equipo para cada parte de tu negocio digital —estratega, guionista, setter, seguimiento, administración, analista…— trabajando en HELM y supervisado por mí. 1.000 € por el montaje y después porcentaje solo sobre lo que crezcas. 5 plazas.',
    imagen: '/socio/og.jpg',
    colorBarra: '#050203',
  })
  useFuentesSocio()
  useReveal()
  useBotonFijo(setBotonFijo)
  useEffect(() => { track('vista_pagina', { pagina: 'socio-ia' }) }, [])

  return (
    <div className="so">
      <div className="so-grano" aria-hidden="true" />
      <div className="so-lineas" aria-hidden="true" />

      {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
      <header className="so-hero" id="so-hero">
        <div className="so-hero-glow" aria-hidden="true" />
        <div className="so-hero-txt">
          <img src="/assets/logos/helm-mark.svg" alt="HELM" className="so-logo" width="46" height="46" />
          <p className="so-tag"><span className="so-hex" aria-hidden="true" /> EL PUESTO DE MANDO DE TU NEGOCIO</p>
          <h1>{linea1} <em>{linea2}</em></h1>
          <p className="so-sub">
            <b>HELM</b> reúne tu contenido, tus clientes, tus ventas y tus finanzas en un solo panel,
            con un <b>equipo de IA trabajando dentro</b>. Y te lo monto y lo llevo yo:{' '}
            <b className="oro">1.000&nbsp;€</b> por ponerlo en marcha y después, porcentaje de lo que crezcas.
          </p>
          <BotonAuditoria donde="hero" />
          <p className="so-nota">Para negocios digitales con productos de 1.000&nbsp;€ o más. {PLAZAS_TOTALES} plazas.</p>
          {PLAZAS_OCUPADAS != null && (
            <Plazas ocupadas={Math.min(PLAZAS_OCUPADAS, PLAZAS_TOTALES)} total={PLAZAS_TOTALES} />
          )}
          {PLAZAS_OCUPADAS == null && <Pendiente bloque>plazas ocupadas (VITE_PLAZAS_OCUPADAS en .env)</Pendiente>}
        </div>
        <div className="so-hero-visual">
          <FotoHero />
          <SistemaVivo actividad />
          <p className="so-prueba">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Diez empleados, un solo panel: <b>HELM</b>. Y los superviso yo</span>
          </p>
        </div>
      </header>

      <main>
        {/* ── 2. El problema ───────────────────────────────────────────── */}
        <section className="so-sec so-problema">
          <div data-reveal>
            <Eyebrow n="01">El problema</Eyebrow>
            <h2>Te escriben. <em>Pero no compran.</em></h2>
          </div>
          <div className="so-problema-grid">
            <ChatVisto />
            <ul className="so-dolores">
              <li data-reveal><span className="so-x" aria-hidden="true"><X size={16} /></span>Publicas, pero los que te escriben no compran.</li>
              <li data-reveal><span className="so-x" aria-hidden="true"><X size={16} /></span>Tu lanzamiento depende de que tú estés encima de todo.</li>
              <li data-reveal><span className="so-x" aria-hidden="true"><X size={16} /></span>Tienes contactos guardados a los que nadie hace seguimiento.</li>
              <li data-reveal><span className="so-x" aria-hidden="true"><X size={16} /></span>Para saber cuánto has cobrado este mes tienes que abrir cinco sitios.</li>
            </ul>
          </div>
          <p className="so-remate" data-reveal>
            No te falta producto.<br /><em>Te falta un sistema que lo venda sin ti.</em>
          </p>
        </section>

        {/* ── El sistema: HELM, el puesto de mando que resuelve lo de arriba ── */}
        <SeccionHelm Eyebrow={Eyebrow} />

        {/* ── Y un equipo de IA que trabaja dentro de HELM ─────────────── */}
        <SeccionEquipo Eyebrow={Eyebrow} />

        {/* ── 5. Cómo trabajamos ──────────────────────────────────────── */}
        <section className="so-sec ancho">
          <div data-reveal>
            <Eyebrow n="04">Cómo trabajamos</Eyebrow>
            <h2>Si tú no ganas, <em>yo tampoco.</em></h2>
          </div>
          <div className="so-oferta">
            <div className="so-oferta-card" data-reveal>
              <div className="so-oferta-fila">
                <span>Montaje</span>
                <b className="oro">1.000&nbsp;€</b>
                <small>El sistema funcionando en 30 días.</small>
              </div>
              <div className="so-oferta-fila">
                <span>Después</span>
                <div className="so-oferta-pct">
                  <div><b className="oro">35&nbsp;%</b><small>si empiezas de cero</small></div>
                  <div><b className="oro">15&nbsp;%</b><small>si ya facturas</small></div>
                </div>
                <small>Solo sobre lo que supere tu facturación actual.</small>
              </div>
              <div className="so-oferta-dos">
                <div className="so-oferta-fila"><span>Duración</span><b className="oro">12 meses</b></div>
                <div className="so-oferta-fila"><span>Plazas</span><b className="oro">5</b><small>negocios a la vez</small></div>
              </div>
            </div>
            <div data-reveal>
              <GraficoCobro />
            </div>
          </div>
          <blockquote className="so-garantia" data-reveal>
            <p>«Cobro 1.000&nbsp;€ por montarlo y a partir de ahí voy a porcentaje: <em>si tú no ganas, yo tampoco.</em>»</p>
            <cite>— Alex Silvestre</cite>
          </blockquote>
        </section>

        {/* ── 6. Proceso ───────────────────────────────────────────────── */}
        <section className="so-sec ancho">
          <div data-reveal>
            <Eyebrow n="05">El proceso</Eyebrow>
            <h2>De la llamada <em>al sistema.</em></h2>
          </div>
          <ol className="so-proceso">
            {PROCESO.map((p, i) => (
              <li key={p.t} data-reveal style={{ '--i': i }}>
                <span className="so-proceso-n">0{i + 1}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
                <small className="oro">{p.dato}</small>
              </li>
            ))}
          </ol>
        </section>

        {/* ── 7. Es para ti / no es para ti ────────────────────────────── */}
        <section className="so-sec ancho">
          <div data-reveal>
            <Eyebrow n="06">Filtro</Eyebrow>
            <h2>¿Es para ti?</h2>
          </div>
          <div className="so-encaje">
            <div className="si" data-reveal>
              <h3>Sí, si…</h3>
              <ul>
                <li><Check size={18} aria-hidden="true" /> Tienes un producto o servicio ya hecho.</li>
                <li><Check size={18} aria-hidden="true" /> Cuesta 1.000&nbsp;€ o más.</li>
                <li><Check size={18} aria-hidden="true" /> Tienes resultados de clientes.</li>
                <li><Check size={18} aria-hidden="true" /> Quieres crecer sin llevarlo todo tú.</li>
              </ul>
            </div>
            <div className="no" data-reveal>
              <h3>No, si…</h3>
              <ul>
                <li><X size={18} aria-hidden="true" /> Aún no tienes producto.</li>
                <li><X size={18} aria-hidden="true" /> Buscas un curso para aprender IA.</li>
                <li><X size={18} aria-hidden="true" /> Quieres resultados sin enseñar la cara ni el producto.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 8. Preguntas frecuentes ──────────────────────────────────── */}
        <section className="so-sec">
          <div data-reveal>
            <Eyebrow n="07">Dudas</Eyebrow>
            <h2>Preguntas frecuentes</h2>
          </div>
          <div className="so-faq" data-reveal>
            {PREGUNTAS.map(p => (
              <details key={p.q}>
                <summary>{p.q}<ChevronDown size={20} aria-hidden="true" /></summary>
                <p>{p.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── 9. Formulario ────────────────────────────────────────────── */}
        <section className="so-sec so-form-sec" id="auditoria">
          <div className="so-form-glow" aria-hidden="true" />
          <Eyebrow n="08">Tu auditoría</Eyebrow>
          <h2>Pide tu auditoría <em>gratis.</em></h2>
          <ul className="so-form-promesa">
            <li><Clock size={16} aria-hidden="true" /> 5 preguntas, menos de un minuto</li>
            <li><Check size={16} aria-hidden="true" /> Si encajas, eliges hora al momento</li>
          </ul>
          <Formulario />
        </section>

        {/* ── 10. Cierre ───────────────────────────────────────────────── */}
        <section className="so-sec so-cierre" id="so-cierre">
          <Capucha />
          <p className="so-term">root@s4sf:~$ ./equipo --empezar<span className="so-cursor">_</span></p>
          <h2>Tú pones el producto. <em>¿Lo vemos?</em></h2>
          <BotonAuditoria donde="cierre" />
          <p className="so-nota">Si no encajamos, te lo digo en la llamada y te llevas la auditoría igual.</p>
        </section>
      </main>

      <Pie />

      {/* Botón fijo del móvil: la misma y única acción, a mano del pulgar. */}
      <div className={`so-fijo${botonFijo ? ' on' : ''}`} aria-hidden={!botonFijo}>
        <BotonAuditoria donde="fijo" />
      </div>
    </div>
  )
}

function Plazas({ ocupadas, total }) {
  return (
    <div className="so-plazas" aria-label={`Plazas ocupadas: ${ocupadas} de ${total}`}>
      <span>Plazas ocupadas: <b className="oro">{ocupadas}/{total}</b></span>
      <span className="so-plazas-hex" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < ocupadas ? 'on' : ''} />)}
      </span>
    </div>
  )
}

// La foto del hero. La del deportivo se quitó (vendía "gurú", no "socio").
// [PENDIENTE: foto trabajando / grabando / con un cliente] → VITE_FOTO_HERO,
// en WebP o AVIF. Sin foto, el esquema del sistema ocupa su sitio.
function FotoHero() {
  if (!FOTO_HERO) return <Pendiente bloque>foto trabajando / grabando / con un cliente</Pendiente>
  return (
    <div className="so-foto">
      <img src={FOTO_HERO} alt="Alex Silvestre trabajando" width="900" height="1100" fetchPriority="high" decoding="async" />
    </div>
  )
}
