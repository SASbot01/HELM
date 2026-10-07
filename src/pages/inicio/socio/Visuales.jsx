// Las piezas visuales de Socio IA. Todo es SVG y CSS en línea: sin imágenes ni
// librerías, así que no pesa y se ve nítido en cualquier pantalla.
//
// Ninguna lleva cifras: son esquemas de CÓMO funciona, no resultados.

const HEX = 'M0,-26 L22.5,-13 L22.5,13 L0,26 L-22.5,13 L-22.5,-13 Z'

// ── El sistema, vivo ─────────────────────────────────────────────────────────
// Cinco fases en fila. Entran muchos puntos (gente que te ve), el filtro deja
// pasar menos, y por la venta salen en dorado. Es el mecanismo en un vistazo.
const NODOS = [
  { x: 40, t: 'Contenido' },
  { x: 130, t: 'Captación' },
  { x: 220, t: 'Filtro' },
  { x: 310, t: 'Venta' },
  { x: 400, t: 'Entrega' },
]
const RUTA = 'M40,70 L400,70'

// Puntos: [retardo, llega hasta x, dorado]
const PUNTOS = [
  [0, 220, false], [0.5, 220, false], [0.9, 400, true], [1.3, 220, false],
  [1.8, 130, false], [2.2, 400, true], [2.6, 220, false], [3.1, 130, false],
]

export function SistemaVivo({ actividad = false }) {
  return (
    <figure className="so-vivo" aria-label="Esquema del sistema: contenido, captación, filtro, venta y entrega">
      <div className="so-vivo-cab">
        <span className="so-vivo-luz" aria-hidden="true" /> Sistema funcionando
      </div>
      <svg viewBox="0 36 440 100" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="so-linea" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="400" y2="0">
            <stop offset="0" stopColor="#A62B46" stopOpacity=".9" />
            <stop offset="1" stopColor="#e8b93a" stopOpacity=".9" />
          </linearGradient>
          <filter id="so-brillo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={RUTA} stroke="url(#so-linea)" strokeWidth="2" strokeDasharray="4 6" fill="none" className="so-vivo-ruta" />
        {PUNTOS.map(([d, hasta, oro], i) => (
          <circle key={i} cy="70" r={oro ? 4.5 : 3.2} fill={oro ? '#e8b93a' : '#f2f2f4'} filter="url(#so-brillo)" opacity="0">
            <animate attributeName="cx" from="10" to={hasta} dur={`${(hasta / 400) * 3.6}s`} begin={`${d}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur={`${(hasta / 400) * 3.6}s`} begin={`${d}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {NODOS.map((n, i) => (
          <g key={n.t} transform={`translate(${n.x},70)`}>
            <path d={HEX} className={`so-vivo-hex${i === 2 ? ' filtro' : ''}${i === 3 ? ' venta' : ''}`} />
            <text y="5" textAnchor="middle" className="so-vivo-n">{i + 1}</text>
            <text y="48" textAnchor="middle" className="so-vivo-t">{n.t}</text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span><i className="blanco" /> Gente que te ve</span>
        <span><i className="oro" /> Ventas</span>
      </figcaption>
      {actividad && (
        <ul className="so-vivo-log" aria-label="Ejemplo de lo que hace el sistema solo">
          {ACTIVIDAD.map((a, i) => (
            <li key={a.t} style={{ '--i': i }}>
              <span className={`so-vivo-tag ${a.c}`}>{a.f}</span>
              <span>{a.t}</span>
            </li>
          ))}
          <li className="so-vivo-nota">Ejemplo de lo que pasa sin que tú estés</li>
        </ul>
      )}
    </figure>
  )
}

// Lo que hace el sistema solo, fase a fase. Es ilustrativo: sin nombres ni
// cifras, porque no es el registro de ningún cliente.
const ACTIVIDAD = [
  { f: 'Captación', c: '', t: 'Formulario rellenado desde un Reel → contacto nuevo en el CRM, con su UTM' },
  { f: 'Filtro', c: 'rojo', t: 'Encaja → reserva llamada → evento creado en Google Calendar' },
  { f: 'Venta', c: 'oro', t: 'Pago en Stripe → venta registrada y contacto en «Ganado»' },
  { f: 'Entrega', c: '', t: 'Cuota del mes pendiente → aparece en Finanzas' },
  { f: 'Contenido', c: '', t: '3 ideas de reels para hoy, con el tono de tu marca' },
]

// ── El espejo: la conversación que se muere ─────────────────────────────────
// Un hilo de mensajes directos tal y como le llegan a cualquier infoproductor.
// Es ilustrativo (no es un cliente real) y así se dice.
export function ChatVisto() {
  return (
    <figure className="so-chat" aria-label="Ejemplo de conversación por mensaje directo que no acaba en venta">
      <div className="so-chat-cab">
        <span className="so-chat-avatar" aria-hidden="true" />
        <div><b>nuevo_seguidor</b><small>Te ha escrito por tu Reel</small></div>
      </div>
      <p className="ellos">Info 🙏</p>
      <p className="tu">¡Hola! Te cuento: es un programa de 8 semanas donde…</p>
      <p className="ellos">¿Y cuánto cuesta?</p>
      <p className="tu">Son 1.500 €, y tienes…</p>
      <p className="ellos">Vale, me lo pienso y te digo 👍</p>
      <p className="visto">Visto · hace 12 días</p>
      <figcaption>Ejemplo ilustrativo</figcaption>
    </figure>
  )
}

// ── Cómo cobro: solo sobre lo que crece ─────────────────────────────────────
// Dos barras sin números: la de hoy y la de después. La parte de abajo (lo que
// ya facturas) es tuya entera; el porcentaje solo se aplica a lo de encima.
export function GraficoCobro() {
  return (
    <figure className="so-cobro" aria-label="Solo cobro porcentaje sobre lo que supere tu facturación actual">
      <div className="so-cobro-barras">
        <div className="so-cobro-col">
          <div className="so-cobro-barra">
            <span className="base" style={{ height: '100%' }}>Lo que ya facturas</span>
          </div>
          <small>Hoy</small>
        </div>
        <div className="so-cobro-col">
          <div className="so-cobro-barra alta">
            <span className="crece">Lo que creces<b>Aquí cobro 15–35 %</b></span>
            <span className="base">Lo que ya facturas<b>0 % para mí</b></span>
          </div>
          <small>Con el sistema</small>
        </div>
      </div>
    </figure>
  )
}
