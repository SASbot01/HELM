// HELM — la guía de bienvenida. Salta en el primer login de un usuario nuevo y
// se puede volver a abrir cuando se quiera desde «Guía», abajo en el menú: un
// equipo de 25 personas no la lee una vez, la consulta cada vez que entra
// alguien nuevo.
//
// Cada producto tiene la suya. La de HELM habla de guiones, Biblia y calendario
// de contenido; la del vertical de asesorías, de fichas fiscales, plazos y
// avisos. Enseñar la equivocada seria peor que no enseñar ninguna.
import { useState } from 'react'
import { productoActual } from './producto'
import { PAGES_CONSULTORIA } from './guia/consultoria'
import { Rocket, LayoutDashboard, Sparkles, BookOpen, CalendarDays, CalendarRange, Bot, Users, TrendingUp, Wallet, CheckSquare, Plug, Flag, ArrowRight, ArrowLeft, X } from 'lucide-react'

const PAGES_HELM = [
  { icon: Rocket, title: 'Bienvenido a HELM', lead: 'Este es el puesto de mando de tu negocio: contenido, clientes, ventas y finanzas en un solo sitio, con una IA que trabaja contigo.',
    bullets: ['En los próximos pasos te enseño cómo funciona.', 'Son unas pantallas rápidas. Al final te llevo a tu onboarding para arrancar.'] },
  { icon: LayoutDashboard, title: 'Cómo está organizado', lead: 'Todo se maneja desde el menú de la izquierda. Cada sección es una parte de tu negocio.',
    bullets: ['Arriba, el núcleo: Informe, Onboarding, CRM, Ventas, Finanzas y Agentes.', 'Abajo, los plugins que actives (como Tareas).', 'Puedes cambiar de sección cuando quieras sin perder nada.'] },
  { icon: LayoutDashboard, title: 'El Informe', lead: 'Es tu pantalla de inicio: la foto de cómo va el negocio.',
    bullets: ['Facturado, cobrado, ventas y balance, filtrable por periodo.', 'Desde aquí lanzas tu onboarding con un botón.'] },
  { icon: Sparkles, title: 'Onboarding de contenido', lead: 'Un formulario donde le cuentas a la IA quién eres: tu marca, tu tono, tu oferta, tu cliente y tu mina de contenido.',
    bullets: ['Se guarda solo mientras escribes.', 'Cuanto más honesto y concreto, mejor escribirá la IA por ti.'] },
  { icon: BookOpen, title: 'La Biblia', lead: 'Al terminar el onboarding, la IA sintetiza tus respuestas en dos documentos: tu Biblia de Empresa y tu Biblia de Contenido.',
    bullets: ['Son tu fuente de verdad: identidad, tono, oferta, avatar y pilares.', 'Puedes leerlas, editarlas y regenerarlas.', 'Es lo que la IA usa para sonar como tú.'] },
  { icon: Bot, title: 'Agentes', lead: 'Tu equipo de IA para el contenido, en una oficina donde cada agente tiene su trabajo. Cada mañana a las 6:00 el director planifica el día y reparte; los guiones llegan como borrador para que tú los apruebes.',
    bullets: ['Pincha un agente en la oficina para ver sus normas, sus tareas y lo que hace ahora mismo; a la derecha, el registro en vivo.', 'El guionista escribe inspirándose en tus creadores de referencia; los lunes, Virales rastrea los reels que despegan y el Programador prepara la semana por tipo.', 'Nada se publica ni se aprueba sin ti. Para lanzar algo a mano, por el MCP.'] },
  { icon: CalendarRange, title: 'Roadmap', lead: 'Tu plan de contenido a seis meses —mes a mes y semana a semana— con los guiones que el equipo ya tiene programados en su día.',
    bullets: ['Pincha un guion para verlo entero y descargarlo, o baja el PDF de toda la semana.', 'Cuando lo grabes, pulsa «marcar grabado»: HELM busca el vídeo en tu Drive, lo archiva en su sitio y te lo deja enlazado, para no perder ninguno.', '«Iniciar estudio y creación» prepara los guiones que falten del periodo, en tus mejores días.'] },
  { icon: Users, title: 'CRM', lead: 'Tus contactos y tu pipeline de ventas, estilo tablero.',
    bullets: ['Arrastra los contactos entre etapas.', 'Cada contacto guarda su historial de actividad.'] },
  { icon: TrendingUp, title: 'Ventas y Diario', lead: 'Registra tus ventas y el trabajo diario del equipo.',
    bullets: ['Ventas alimenta el Informe automáticamente.', 'El Diario recoge los reportes de closer y setter.'] },
  { icon: Wallet, title: 'Finanzas', lead: 'Ingresos, gastos y balance de tu negocio, tipificados.',
    bullets: ['Si conectas Stripe, los cobros entran solos.', 'El balance se refleja en el Informe.'] },
  { icon: CheckSquare, title: 'Tareas', lead: 'Un tablero kanban para organizar el trabajo.',
    bullets: ['Columnas por estado, con arrastrar y soltar.', 'Asigna tareas a tu equipo y añade subtareas.', 'Filtra por prioridad o responsable.'] },
  { icon: Plug, title: 'Conexiones', lead: 'Enlaza tus herramientas para que HELM trabaje solo.',
    bullets: ['Instagram: cada día a las 6:00 se resincronizan las métricas de tus reels.', 'Stripe: cada pago se registra como venta, lead y apunte.', 'Drive: las piezas grabadas se archivan y enlazan solas. Iremos añadiendo más.'] },
  { icon: Flag, title: '¡Listo! Empieza por aquí', lead: 'Ya conoces HELM. El primer paso es tu onboarding: cuéntale a la IA quién eres para que empiece a crear tu contenido.',
    bullets: ['Al pulsar el botón te llevo directo a tu Onboarding.', 'Puedes volver a cualquier sección desde el menú cuando quieras.'] },
]

export default function Guia({ onFinish, onClose }) {
  const [i, setI] = useState(0)
  // Las del producto por el que se ha entrado. Sin fallback silencioso: si
  // algún día hay un producto sin guía, se ve al momento.
  const PAGES = productoActual().key === 'consultoria' ? PAGES_CONSULTORIA : PAGES_HELM
  const page = PAGES[i]
  const Icon = page.icon
  const last = i === PAGES.length - 1

  return (
    <div className="helm-guia-overlay">
      <div className="helm-guia">
        {onClose && (
          <button className="helm-guia-close" onClick={onClose} aria-label="Seguir luego">
            <X size={18} />
          </button>
        )}
        <div className="helm-guia-progress"><span style={{ '--p': (i + 1) / PAGES.length }} /></div>

        <div className="helm-guia-body">
          <div className="helm-guia-ico"><Icon size={26} /></div>
          <div className="helm-guia-step">Página {i + 1} de {PAGES.length}</div>
          <h2>{page.title}</h2>
          <p className="helm-guia-lead">{page.lead}</p>
          <ul className="helm-guia-list">
            {page.bullets.map((b, k) => <li key={k}>{b}</li>)}
          </ul>
        </div>

        <div className="helm-guia-foot">
          <button className="helm-btn" onClick={() => setI(n => Math.max(0, n - 1))} disabled={i === 0}>
            <ArrowLeft size={15} /> Atrás
          </button>
          <div className="helm-guia-dots">
            {PAGES.map((_, k) => <span key={k} className={'helm-guia-dot' + (k === i ? ' on' : '') + (k < i ? ' done' : '')} />)}
          </div>
          {last ? (
            <button className="helm-btn primary" onClick={onFinish}><Rocket size={15} /> Ir a mi onboarding</button>
          ) : (
            <button className="helm-btn primary" onClick={() => setI(n => Math.min(PAGES.length - 1, n + 1))}>
              Siguiente <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
