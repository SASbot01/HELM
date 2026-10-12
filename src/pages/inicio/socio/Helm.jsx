// /empresas: el equipo y el sitio donde trabaja.
//
// El equipo son agentes, uno por cada parte del proceso de un infoproductor,
// presentados como lo que son para el cliente: empleados con un trabajo
// concreto, no «una IA». Algunos ya trabajan en HELM (Estratega, Investigador,
// Guionista, Productor, Analista) y otros se están montando; la página los
// enseña todos porque es el equipo que se contrata.
//
// Debajo, HELM: solo lo que le sirve a quien vende formación o mentorías.
// Fuera el buscador de leads, los gastos, los presupuestos y WooCommerce.
import {
  Compass, Radar, PenLine, Clapperboard, MessageCircle, ClipboardCheck, RotateCcw,
  CreditCard, GraduationCap, LineChart, Users, CalendarCheck, ClipboardList,
  Percent, Repeat, LayoutDashboard, Wallet, ListChecks, Lock, Send, ArrowRight,
} from 'lucide-react'

// Por fases del proceso, en el mismo orden que el esquema del hero.
export const DEPARTAMENTOS = [
  {
    fase: 'Contenido',
    dejas: 'pensar cada día qué publicar.',
    gente: [
      { i: Compass, id: 'estratega', rol: 'Estratega', d: 'Escribe la Biblia de tu marca: tu tono, tu oferta y tu cliente ideal. Es lo primero que lee el resto del equipo.' },
      { i: Radar, id: 'investigador', rol: 'Investigador', d: 'Estudia los reels que más venden en tu nicho, frase a frase, y te trae qué ganchos y qué temas funcionan.' },
      { i: PenLine, id: 'guionista', rol: 'Guionista', d: 'Te deja los guiones escritos con tu voz y puestos en tu calendario. Tú solo grabas.' },
      { i: Clapperboard, id: 'productor', rol: 'Productor', d: 'Recoge lo que grabas, lo ordena por fases —sin editar, editado, publicado— y te dice qué falta.' },
    ],
  },
  {
    fase: 'Captación y filtro',
    dejas: 'contestar mensajes uno a uno.',
    gente: [
      { i: MessageCircle, id: 'setter', rol: 'Setter', d: 'Contesta a quien te escribe, hace las preguntas que separan a quien compra de quien mira y le da hora para la llamada.' },
    ],
  },
  {
    fase: 'Venta',
    dejas: 'perseguir a los que dijeron «me lo pienso».',
    gente: [
      { i: ClipboardCheck, id: 'preparador', rol: 'Preparador de llamadas', d: 'Antes de cada llamada te deja la ficha: qué respondió, de qué reel viene y qué objeción esperar.' },
      { i: RotateCcw, id: 'seguimiento', rol: 'Seguimiento', d: 'Vuelve a por los que se quedaron a medias, en el momento justo y con el mensaje justo.' },
    ],
  },
  {
    fase: 'Entrega y operaciones',
    dejas: 'hacer a mano lo que se repite con cada cliente.',
    gente: [
      { i: CreditCard, id: 'administracion', rol: 'Administración', d: 'Apunta cada pago, vigila las cuotas y avisa antes de que alguien se retrase.' },
      { i: GraduationCap, id: 'atencion', rol: 'Atención al alumno', d: 'Da la bienvenida, entrega los accesos y pregunta cómo va en el mes 1 y en el mes 2.' },
    ],
  },
  {
    fase: 'Dirección',
    dejas: 'adivinar qué funciona.',
    gente: [
      { i: LineChart, id: 'analista', rol: 'Analista', d: 'Cada semana te dice qué entró, qué se cobró, qué reel trajo ventas y dónde se te escapa la gente.' },
    ],
  },
]

const TOTAL = DEPARTAMENTOS.reduce((n, d) => n + d.gente.length, 0)

export function SeccionEquipo({ Eyebrow }) {
  return (
    <section className="so-sec ancho so-equipo-sec">
      <div data-reveal>
        <Eyebrow n="03">Tu equipo</Eyebrow>
        <h2>{TOTAL} empleados. <em>Uno para cada parte.</em></h2>
        <p className="so-intro">
          Cada fase de tu negocio tiene a alguien encargado. Trabajan todos en el mismo
          sitio, con tu información, y los superviso yo. Tú pones la cara y el producto.
        </p>
      </div>

      <ol className="so-equipo">
        {DEPARTAMENTOS.map((dep, di) => (
          <li className="so-dep" key={dep.fase} data-reveal style={{ '--i': di }}>
            <header className="so-dep-cab">
              <span className="so-dep-n" aria-hidden="true">{di + 1}</span>
              <div>
                <h3>{dep.fase}</h3>
                <p><small>Dejas de</small>{dep.dejas}</p>
              </div>
            </header>
            <ul className="so-dep-gente">
              {dep.gente.map(({ i: Icono, id, rol, d }) => (
                <li className="so-agente" key={id}>
                  <div className="so-agente-cab">
                    <span className="so-agente-ico" aria-hidden="true"><Icono size={18} /></span>
                    <code>equipo/{id}</code>
                    <span className="so-agente-estado"><i aria-hidden="true" />en turno</span>
                  </div>
                  <b>{rol}</b>
                  <p>{d}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── Donde trabajan: HELM ────────────────────────────────────────────────────
const MODULOS = [
  { i: Users, t: 'CRM con embudos', d: 'Cada persona en su etapa, con su historial y de qué reel vino.' },
  { i: CalendarCheck, t: 'Agenda de llamadas', d: 'Tu enlace para reservar, sincronizado con Google Calendar.' },
  { i: ClipboardList, t: 'Formularios', d: 'Cualifican antes de la llamada y dejan las respuestas en la ficha.' },
  { i: CreditCard, t: 'Cobros con Stripe', d: 'Cada pago crea la venta y pasa a la persona a «Ganado».' },
  { i: Percent, t: 'Comisiones', d: 'Cada venta con su setter y su closer: sabes a quién pagar y por qué.' },
  { i: Repeat, t: 'Cuotas', d: 'Lo que falta por cobrar de cada pago fraccionado, al día.' },
  { i: LayoutDashboard, t: 'Informe', d: 'Facturado, cobrado, ticket medio y balance, por mes o por año.' },
  { i: ListChecks, t: 'Diario de ventas', d: 'Agendas, asistencias y cierres de cada día, por persona.' },
  { i: Wallet, t: 'Finanzas', d: 'Lo que entra, lo que sale y cuánto le pagaste a cada uno.' },
]

const INTEGRACIONES = ['Stripe', 'Google Calendar', 'Google Drive', 'Calendly', 'Instagram', 'Telegram']

const ANTES_DESPUES = [
  ['Excel, notas y seis pestañas abiertas', 'Un panel con todo el negocio'],
  ['«¿Cuánto hemos cobrado este mes?» Ni idea', 'Facturado y cobrado, al día'],
  ['Comisiones calculadas a mano cada mes', 'Cada venta sabe de quién es'],
  ['Leads que se enfrían en los mensajes', 'Alguien encargado de cada uno'],
  ['«¿Qué publico hoy?»', 'El guion de hoy, ya escrito'],
]

export function SeccionHelm({ Eyebrow }) {
  return (
    <section className="so-sec ancho so-helm-sec">
      <div data-reveal>
        <Eyebrow n="02">La solución</Eyebrow>
        <h2>Tu negocio entero, <em>en un panel: HELM.</em></h2>
        <p className="so-intro">
          Se llama <b>HELM</b>. Ahí trabaja el equipo y ahí lo ves todo tú, cuando quieras:
          nada de pedir informes ni de preguntar cómo va.
        </p>
      </div>

      <div data-reveal><PanelHelm /></div>

      <ul className="so-helm-mods">
        {MODULOS.map(({ i: Icono, t, d }, n) => (
          <li key={t} data-reveal style={{ '--i': n % 3 }}>
            <span className="so-helm-ico" aria-hidden="true"><Icono size={18} /></span>
            <span><b>{t}</b>{d}</span>
          </li>
        ))}
      </ul>

      <div className="so-helm-ia" data-reveal>
        <div>
          <span className="so-helm-ico grande" aria-hidden="true"><Lock size={22} /></span>
          <h3>Tus datos, bajo llave</h3>
          <p>El equipo trabaja con tu información, y tu información no sale de tu panel.</p>
        </div>
        <ul>
          <li><Lock size={16} aria-hidden="true" /> <span><b>Servidor propio:</b> si quieres, todo corre dentro, sin mandar nada a terceros.</span></li>
          <li><Send size={16} aria-hidden="true" /> <span><b>Desde el móvil:</b> pregunta por Telegram cómo va la semana y te contesta con los datos del panel.</span></li>
        </ul>
      </div>

      <div className="so-helm-integ" data-reveal>
        <small>Se conecta con lo que ya usas</small>
        <ul>{INTEGRACIONES.map(n => <li key={n}>{n}</li>)}</ul>
      </div>

      <div className="so-antes" data-reveal>
        <div className="so-antes-cab">
          <span>Hoy</span>
          <span>Con tu equipo</span>
        </div>
        {ANTES_DESPUES.map(([a, b]) => (
          <div className="so-antes-fila" key={a}>
            <span className="antes">{a}</span>
            <ArrowRight size={16} aria-hidden="true" />
            <span className="despues">{b}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// El panel, de muestra: menú, Informe y CRM con una ficha que va sola de
// «Lead» a «Ganado». Sin cifras: las barras enseñan la forma, no un resultado.
const MENU = ['Informe', 'CRM', 'Llamadas', 'Ventas', 'Finanzas', 'Equipo']
const KPIS = [
  { t: 'Facturado', w: 82 },
  { t: 'Cobrado', w: 64 },
  { t: 'Cuotas', w: 30 },
]
const COLUMNAS = ['Lead', 'Llamada', 'Propuesta', 'Ganado']

function PanelHelm() {
  return (
    <figure className="so-panel" aria-label="Vista de ejemplo del panel de HELM: informe, CRM y menú">
      <div className="so-panel-barra" aria-hidden="true">
        <i /><i /><i />
        <span>helm · tu negocio</span>
      </div>
      <div className="so-panel-cuerpo" aria-hidden="true">
        <nav className="so-panel-menu">
          <b>HELM</b>
          {MENU.map((m, i) => <span key={m} className={i === 0 ? 'on' : ''}>{m}</span>)}
        </nav>
        <div className="so-panel-main">
          <div className="so-panel-kpis">
            {KPIS.map(k => (
              <div key={k.t}>
                <small>{k.t}</small>
                <span className="so-panel-bar"><i style={{ width: `${k.w}%` }} /></span>
              </div>
            ))}
          </div>
          <div className="so-panel-kanban">
            {COLUMNAS.map((c, i) => (
              <div key={c} className={i === COLUMNAS.length - 1 ? 'fin' : ''}>
                <small>{c}</small>
                <span className="so-panel-ficha" />
                {i < 2 && <span className="so-panel-ficha" />}
              </div>
            ))}
            <span className="so-panel-viaja" />
          </div>
        </div>
      </div>
      <figcaption>Vista de ejemplo</figcaption>
    </figure>
  )
}
