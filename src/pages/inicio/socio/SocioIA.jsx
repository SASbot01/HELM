// SOCIO IA — la página principal de s4sf.net.
//
// Un solo objetivo: que un negocio que encaja reserve la auditoría de 30 min.
// Todo lo que hay en pantalla empuja hacia el formulario (#auditoria); no hay
// más salidas que compitan con él (YouTube e Instagram se quitaron a propósito;
// la clase gratis vive en /clase y solo se ofrece a quien no encaja).
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
import { useReveal, useBotonFijo } from './reveal.js'
import { useCabeceraPublica } from '../cabecera.js'
import { useFuentesSocio } from './fuentes.js'
import './socio.css'

// [REVISAR] Qué se monta y qué deja de hacer el cliente en cada fase.
const FASES = [
  {
    n: 'Contenido',
    monto: 'Guiones y calendario de publicación a partir de lo que ya sabes.',
    dejas: 'pensar cada día qué publicar.',
  },
  {
    n: 'Captación',
    monto: 'Respuestas automáticas a comentarios y mensajes, y la página donde te dejan sus datos.',
    dejas: 'contestar mensajes uno a uno.',
  },
  {
    n: 'Filtro de contactos',
    monto: 'Preguntas que separan a quien puede comprar de quien solo mira, y seguimiento a los que se quedan a medias.',
    dejas: 'hablar con gente que no va a comprar.',
  },
  {
    n: 'Venta',
    monto: 'El paso que cierra: webinar, llamada o página de pago, con su guion y su seguimiento.',
    dejas: 'perseguir a los que dijeron «me lo pienso».',
  },
  {
    n: 'Entrega y operaciones',
    monto: 'Altas, accesos, avisos y cada venta registrada en tu CRM.',
    dejas: 'hacer a mano lo que se repite con cada cliente.',
  },
]

// Los pasos desde que rellenas el formulario. Salen de la oferta del brief.
const PROCESO = [
  { t: 'Auditoría', d: '30 minutos. Miramos tu producto y dónde se te escapa la gente.', dato: 'Gratis' },
  { t: 'Te digo si encajamos', d: 'Si no, te lo digo en la llamada y te llevas la auditoría igual.', dato: 'Sin compromiso' },
  { t: 'Montaje', d: 'Monto el sistema completo: de tu contenido a la entrega.', dato: '30 días · 1.000 €' },
  { t: 'Lo llevo yo', d: 'Lo mantengo y lo mejoro. Cobro solo sobre lo que crezcas.', dato: '12 meses · %' },
]

// [REVISAR] Todas las respuestas: cortas, para que las valide Alex.
const PREGUNTAS = [
  {
    q: '¿Por qué cobras porcentaje?',
    a: 'Porque así solo gano si tú ganas. Los 1.000 € cubren el montaje; el resto depende de que tu facturación suba.',
  },
  {
    q: '¿Qué pasa si no crece mi facturación?',
    a: 'Que no me llevo porcentaje. Solo cobro sobre lo que supere lo que facturas hoy. Los 1.000 € del montaje no dependen del resultado.',
  },
  {
    q: '¿Tengo que grabar yo el contenido?',
    a: 'Sí: la cara y el producto son tuyos, porque la gente compra a personas. Yo te preparo qué grabar y cómo, para que te lleve el mínimo tiempo.',
  },
  {
    q: '¿Qué herramientas de IA usáis?',
    a: 'Claude y otras, según la fase. Lo importante no es la herramienta: es que el sistema funcione aunque mañana cambiemos de herramienta.',
  },
  {
    q: '¿Qué pasa en la llamada de auditoría?',
    a: 'Son 30 minutos. Miramos tu producto, cómo vendes hoy y dónde se te escapa la gente. Si no encajamos, te lo digo ahí mismo y te llevas el diagnóstico igual.',
  },
  {
    q: '¿Por qué solo 5 plazas?',
    a: 'Porque cada sistema lo llevo yo. Con más de 5 negocios a la vez no podría llevarlos bien.',
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
    titulo: 'Socio IA — Alex Silvestre',
    descripcion: 'Monto con IA el sistema que vende tu producto y lo llevo yo. 1.000 € por el montaje y después porcentaje solo sobre lo que crezcas. 5 plazas.',
    imagen: '/socio/og.jpg',
    colorBarra: '#0a0a0c',
  })
  useFuentesSocio()
  useReveal()
  useBotonFijo(setBotonFijo)
  useEffect(() => { track('vista_pagina', { pagina: 'socio-ia' }) }, [])

  return (
    <div className="so">
      <div className="so-grano" aria-hidden="true" />

      {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
      <header className="so-hero" id="so-hero">
        <div className="so-hero-glow" aria-hidden="true" />
        <div className="so-hero-txt">
          <p className="so-tag"><span className="so-hex" aria-hidden="true" /> SOCIO IA · {PLAZAS_TOTALES} plazas</p>
          <h1>{linea1} <em>{linea2}</em></h1>
          <p className="so-sub">
            Contenido, captación, filtro, venta y entrega <b>funcionando en 30 días</b>.
            Cobro <b className="oro">1.000&nbsp;€</b> por montarlo y después voy a porcentaje de lo que crezcas.
          </p>
          <BotonAuditoria donde="hero" />
          <p className="so-nota">Solo para negocios online con productos de 1.000&nbsp;€ o más.</p>
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
            <span>Montado en <b>Detrás de Cámara</b>: tanda de <b className="oro">17 plazas</b> a <b className="oro">1.900&nbsp;€</b></span>
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
            </ul>
          </div>
          <p className="so-remate" data-reveal>
            No te falta producto.<br /><em>Te falta un sistema que lo venda sin ti.</em>
          </p>
        </section>

        {/* ── 3. El mecanismo: las 5 fases ─────────────────────────────── */}
        <section className="so-sec ancho">
          <div data-reveal>
            <Eyebrow n="02">El mecanismo</Eyebrow>
            <h2>Un sistema. <em>5 fases.</em></h2>
            <p className="so-intro">La IA es la herramienta. Lo que te llevas es el sistema funcionando.</p>
          </div>
          <ol className="so-fases">
            {FASES.map((f, i) => (
              <li key={f.n} data-reveal style={{ '--i': i }}>
                <span className="so-fase-n" aria-hidden="true">{i + 1}</span>
                <h3>{f.n}</h3>
                <p className="so-fase-monto"><small>Monto</small>{f.monto}</p>
                <p className="so-fase-dejas"><small>Dejas de</small>{f.dejas}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── 4. Caso real ─────────────────────────────────────────────── */}
        <section className="so-sec ancho so-caso-sec">
          <div data-reveal>
            <Eyebrow n="03">Caso real</Eyebrow>
            <h2>Detrás de Cámara</h2>
            <p className="so-intro">Formación de filmmaking de Abel.</p>
          </div>
          <div className="so-caso" data-reveal>
            <div className="so-caso-cifras">
              <div><b className="oro">17</b><span>plazas en la tanda de septiembre de 2026</span></div>
              <div><b className="oro">1.900&nbsp;€</b><span>por plaza</span></div>
              <div><b className="oro">1&nbsp;€</b><span>reserva para entrar al webinar</span></div>
            </div>
            <div className="so-caso-embudo">
              <h3>El embudo que montamos</h3>
              <ol>
                <li><span>1</span>Captación</li>
                <li><span>2</span>Reserva de 1&nbsp;€</li>
                <li><span>3</span>Webinar</li>
                <li><span>4</span>Llamada</li>
                <li className="fin"><span>5</span>Venta</li>
              </ol>
            </div>
            <Pendiente bloque>punto de partida de Detrás de Cámara antes de Socio IA</Pendiente>
            <Pendiente bloque>resultado: plazas vendidas / facturación de la tanda</Pendiente>
            <Pendiente bloque>cita o vídeo de Abel</Pendiente>
          </div>
        </section>

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
