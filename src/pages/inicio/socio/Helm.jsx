// /empresas: el equipo.
//
// El equipo son agentes, uno por cada parte del proceso de un infoproductor,
// presentados como lo que son para el cliente: empleados con un trabajo
// concreto, no «una IA». Algunos ya trabajan en HELM (Estratega, Investigador,
// Guionista, Productor, Analista) y otros se están montando; la página los
// enseña todos porque es el equipo que se contrata.
import {
  Compass, Radar, PenLine, Clapperboard, MessageCircle, ClipboardCheck, RotateCcw,
  CreditCard, GraduationCap, LineChart,
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

