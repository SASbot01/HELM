// HELM en la página de /empresas: qué es el sistema que se monta.
//
// Todo lo que se nombra aquí existe hoy en el código de HELM (src/helm, api/).
// Lo que está a medias o solo en el catálogo —WhatsApp, email masivo,
// contratos con firma, Meta Ads— NO sale, aunque quede bonito: esta página
// vende a porcentaje y una promesa que no se cumple la paga Alex.
import {
  LayoutDashboard, Users, CalendarCheck, ClipboardList, Search, CreditCard,
  Repeat, FileText, Wallet, ScanLine, ListChecks, Activity, BookOpen,
  Sparkles, Clapperboard, Bot, Send, Lock, Percent, ArrowRight,
} from 'lucide-react'

// Cuatro trabajos, no quince pantallas: quien lee esto no quiere un catálogo,
// quiere saber qué deja de hacer a mano.
const GRUPOS = [
  {
    t: 'Vender',
    d: 'Que nadie se quede sin respuesta.',
    mods: [
      { i: Users, t: 'CRM con pipelines', d: 'Cada contacto en su etapa, con su historial. Varios embudos por negocio.' },
      { i: CalendarCheck, t: 'Agenda de llamadas', d: 'Tu enlace para reservar, sincronizado con Google Calendar.' },
      { i: ClipboardList, t: 'Formularios', d: 'Cualifican antes de la llamada y dejan las respuestas en la ficha.' },
      { i: Search, t: 'Buscador de leads', d: 'Negocios de Google Maps, el Registro Mercantil y tu propia lista.' },
    ],
  },
  {
    t: 'Cobrar',
    d: 'Que cada euro quede apuntado solo.',
    mods: [
      { i: CreditCard, t: 'Stripe y WooCommerce', d: 'Cada pago crea la venta y pasa el contacto a «Ganado».' },
      { i: Percent, t: 'Comisiones', d: 'Cada venta con su setter, closer y CSM: sabes a quién pagar y por qué.' },
      { i: Repeat, t: 'Cuotas y renovaciones', d: 'Lo que falta por cobrar de cada pago fraccionado, al día.' },
      { i: FileText, t: 'Presupuestos y facturas', d: 'Del presupuesto a la factura en PDF con un clic, con tu logo.' },
    ],
  },
  {
    t: 'Controlar',
    d: 'Saber cómo va sin preguntar a nadie.',
    mods: [
      { i: LayoutDashboard, t: 'Informe', d: 'Facturado, cobrado, ticket medio y balance, por mes o por año.' },
      { i: Wallet, t: 'Finanzas', d: 'Ingresos y gastos por categoría, y cuánto le pagaste a cada persona.' },
      { i: ScanLine, t: 'Gastos', d: 'Subes la foto de la factura y se rellena sola. Tú solo la revisas.' },
      { i: ListChecks, t: 'Diario del equipo', d: 'Cada setter y closer reporta su día: agendas, asistencias, cierres.' },
    ],
  },
  {
    t: 'Crear',
    d: 'Contenido con tu voz, sin página en blanco.',
    mods: [
      { i: BookOpen, t: 'Biblias de marca', d: 'Tu tono, tu oferta y tu cliente ideal, escritos una vez y para siempre.' },
      { i: Clapperboard, t: 'Creadores de referencia', d: 'Los reels más vistos de tu nicho, transcritos frase a frase.' },
      { i: Sparkles, t: 'Ideas cada día', d: 'Propuestas de reels y stories con tu tono, listas para grabar.' },
      { i: Activity, t: 'Actividad', d: 'Quién hizo qué y cuándo, sin perseguir a nadie.' },
    ],
  },
]

const INTEGRACIONES = ['Stripe', 'WooCommerce', 'Google Calendar', 'Google Drive', 'Calendly', 'Instagram', 'Telegram']

// Lo de hoy frente a lo de después. Frases que cualquier infoproductor ha
// pensado alguna vez, no métricas.
const ANTES_DESPUES = [
  ['Excel, notas y seis pestañas abiertas', 'Un panel con todo el negocio'],
  ['«¿Cuánto hemos cobrado este mes?» Ni idea', 'Facturado y cobrado, al día'],
  ['Comisiones calculadas a mano cada mes', 'Cada venta sabe de quién es'],
  ['Leads que se enfrían en los mensajes', 'Cada contacto en su etapa del embudo'],
  ['«¿Qué publico hoy?»', 'Ideas diarias con tu tono'],
]

export function SeccionHelm({ Eyebrow }) {
  return (
    <section className="so-sec ancho so-helm-sec">
      <div data-reveal>
        <Eyebrow n="03">El sistema</Eyebrow>
        <h2>Tu negocio entero, <em>en un panel.</em></h2>
        <p className="so-intro">
          Se llama <b>HELM</b> y es donde monto y llevo tu sistema. No es otra herramienta
          que aprender: te la dejo configurada con tu oferta, tus datos y tu equipo.
        </p>
      </div>

      <div data-reveal><PanelHelm /></div>

      <div className="so-helm-grupos">
        {GRUPOS.map((g, gi) => (
          <div className="so-helm-grupo" key={g.t} data-reveal style={{ '--i': gi }}>
            <header>
              <h3>{g.t}</h3>
              <p>{g.d}</p>
            </header>
            <ul>
              {g.mods.map(({ i: Icono, t, d }) => (
                <li key={t}>
                  <span className="so-helm-ico" aria-hidden="true"><Icono size={18} /></span>
                  <span><b>{t}</b>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="so-helm-ia" data-reveal>
        <div>
          <span className="so-helm-ico grande" aria-hidden="true"><Bot size={22} /></span>
          <h3>Una IA que conoce tu negocio</h3>
          <p>
            Lee tus Biblias, tu CRM y tu biblioteca antes de contestar. Escribe guiones,
            correos y reportes de venta con tu voz.
          </p>
        </div>
        <ul>
          <li><Lock size={16} aria-hidden="true" /> <span><b>Privada si quieres:</b> un modelo propio en el servidor, sin que tus datos salgan de ahí.</span></li>
          <li><Sparkles size={16} aria-hidden="true" /> <span><b>O Claude</b>, con tu propia clave y el modelo que elijas.</span></li>
          <li><Send size={16} aria-hidden="true" /> <span><b>Desde el móvil:</b> le escribes por Telegram y te contesta con los datos del panel.</span></li>
        </ul>
      </div>

      <div className="so-helm-integ" data-reveal>
        <small>Se conecta con lo que ya usas</small>
        <ul>{INTEGRACIONES.map(n => <li key={n}>{n}</li>)}</ul>
      </div>

      <div className="so-antes" data-reveal>
        <div className="so-antes-cab">
          <span>Hoy</span>
          <span>Con HELM</span>
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

// ── El panel, de muestra ────────────────────────────────────────────────────
// Una ventana con la forma real de HELM: menú a la izquierda, el Informe
// arriba y el CRM debajo, con una ficha que va sola de «Lead» a «Ganado».
// Sin cifras: las barras enseñan la forma, no un resultado de nadie.
const MENU = ['Informe', 'CRM', 'Llamadas', 'Ventas', 'Finanzas', 'Contenido']
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
