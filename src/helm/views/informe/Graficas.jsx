// HELM — las gráficas del Informe.
//
// Dos, y cada una responde a una pregunta distinta:
//   Evolución    ¿vamos a más o a menos, y cuánto de lo facturado se cobra?
//   Por programa ¿de dónde sale el dinero?
//
// Sobre los colores: NO son el verde de la marca. El salvia de HELM tiene un
// croma de 0.052 y el mínimo para que un color de dato no se lea como gris es
// 0.1 — comprobado con el validador, no a ojo. Sirve para la interfaz, no para
// una serie. Estos dos son los mismos que usa el Agent OS y pasan los cinco
// checks: banda de luminosidad, croma, separación con daltonismo (ΔE 9.5),
// contraste contra la tarjeta y separación con visión normal (ΔE 27.5).
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

export const COLOR_FACTURADO = '#04996A'
export const COLOR_COBRADO = '#C2410C'

const EJE = { fill: '#82857B', fontSize: 11 }
const REJILLA = 'rgba(28,29,25,0.08)'

// Los nombres de programa que escribe la gente son larguísimos ("Asesoría
// semestral Enformaconhugo 🏋 Fraccionado 3 plazos."). En el eje se recortan:
// sin esto se parten en cuatro líneas y se montan sobre la barra de al lado.
// El nombre entero sigue estando en el globo del ratón y en la tabla de abajo.
const recorta = (t, max = 24) => {
  const v = String(t || '')
  return v.length > max ? v.slice(0, max - 1).trimEnd() + '…' : v
}

// La etiqueta del eje de programas, dibujada a mano.
//
// Recharts parte el texto de una etiqueta de categoría en varias líneas y, si
// no le cabe, lo reduce a «P…». Con nombres como "Asesoría semestral
// Enformaconhugo 🏋 Fraccionado 3 plazos." el eje quedaba ilegible. Una sola
// línea de SVG, recortada por nosotros, y el nombre entero en el globo.
function EtiquetaPrograma({ x, y, payload }) {
  return (
    <text
      x={x} y={y} dy={4} textAnchor="end"
      fill="#82857B" fontSize={11}
    >
      {recorta(payload.value, 22)}
    </text>
  )
}

const eur = (n) => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(Number(n) || 0)

// En el eje no caben importes completos: 12.400 € ocupa más que la barra.
const corto = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v))
}

function Caja({ titulo, sub, children, pie }) {
  return (
    <section className="helm-card helm-graf">
      <header>
        <h3>{titulo}</h3>
        {sub && <p>{sub}</p>}
      </header>
      {children}
      {pie && <p className="helm-graf-pie">{pie}</p>}
    </section>
  )
}

function Globo({ active, payload, label, filas }) {
  if (!active || !payload?.length) return null
  return (
    <div className="helm-graf-globo">
      <b>{label}</b>
      {(filas || payload).map(p => (
        <span key={p.dataKey || p.name}>
          <i style={{ background: p.color || p.fill }} />
          {p.name}: <em>{eur(p.value)}</em>
        </span>
      ))}
    </div>
  )
}

/**
 * Evolución mes a mes. Lo facturado como área y lo cobrado como línea encima:
 * el hueco entre las dos ES la información — lo que se ha vendido pero todavía
 * no ha entrado.
 */
export function Evolucion({ serie }) {
  const hay = serie.some(m => m.facturado > 0 || m.cobrado > 0)
  return (
    <Caja
      titulo="Evolución"
      sub="Lo facturado y lo que de verdad ha entrado, mes a mes"
      pie={hay ? 'El hueco entre las dos líneas es lo vendido que aún está por cobrar.' : null}
    >
      {/* Leyenda siempre, porque son dos series: el color solo no puede ser
          lo único que distinga una de otra. */}
      <div className="helm-graf-leyenda">
        <span><i style={{ background: COLOR_FACTURADO }} />Facturado</span>
        <span><i style={{ background: COLOR_COBRADO }} />Cobrado</span>
      </div>

      {!hay ? (
        <p className="helm-graf-vacio">Todavía no hay ventas en este periodo.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={serie} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="helm-g-fact" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_FACTURADO} stopOpacity={0.22} />
                <stop offset="100%" stopColor={COLOR_FACTURADO} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={REJILLA} vertical={false} />
            <XAxis dataKey="mes" tick={EJE} axisLine={{ stroke: 'rgba(28,29,25,0.14)' }} tickLine={false} />
            <YAxis tickFormatter={corto} tick={EJE} axisLine={false} tickLine={false} width={46} />
            <Tooltip content={<Globo />} cursor={{ stroke: 'rgba(28,29,25,0.18)' }} />
            <Area
              type="monotone" dataKey="facturado" name="Facturado"
              stroke={COLOR_FACTURADO} strokeWidth={2} fill="url(#helm-g-fact)"
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
            />
            {/* Discontinua a propósito: cuando todo lo facturado está
                cobrado las dos líneas coinciden, y con las dos continuas la
                de abajo desaparecía y parecía que solo había una serie. */}
            <Area
              type="monotone" dataKey="cobrado" name="Cobrado"
              stroke={COLOR_COBRADO} strokeWidth={2} strokeDasharray="5 4" fill="none"
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Caja>
  )
}

/**
 * De dónde sale el dinero. Barras horizontales porque los nombres de programa
 * son largos: en vertical se giran o se cortan, y un eje ilegible no informa.
 */
export function PorPrograma({ tabla }) {
  const datos = tabla.slice(0, 7)
  return (
    <Caja titulo="Por programa" sub="Facturado en el periodo">
      {datos.length === 0 ? (
        <p className="helm-graf-vacio">Nada que repartir todavía.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 42)}>
          <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={REJILLA} horizontal={false} />
            <XAxis type="number" tickFormatter={corto} tick={EJE} axisLine={false} tickLine={false} />
            <YAxis
              type="category" dataKey="name" width={150}
              tick={<EtiquetaPrograma />}
              axisLine={false} tickLine={false} interval={0}
            />
            <Tooltip
              cursor={{ fill: 'rgba(28,29,25,0.04)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const f = payload[0].payload
                return (
                  <div className="helm-graf-globo">
                    <b>{label}</b>
                    <span><i style={{ background: COLOR_FACTURADO }} />Facturado: <em>{eur(f.facturado)}</em></span>
                    <span><i style={{ background: COLOR_COBRADO }} />Cobrado: <em>{eur(f.cobrado)}</em></span>
                    <span className="sec">{f.unidades} {f.unidades === 1 ? 'venta' : 'ventas'} · {f.cuota.toFixed(0)}% del total</span>
                  </div>
                )
              }}
            />
            {/* Una sola serie: no lleva leyenda, el título ya la nombra. El
                extremo redondeado va solo en la punta, no en la base. */}
            <Bar dataKey="facturado" name="Facturado" radius={[0, 4, 4, 0]} barSize={18}>
              {datos.map((d, i) => <Cell key={d.name} fill={COLOR_FACTURADO} fillOpacity={i === 0 ? 1 : 0.78} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Caja>
  )
}
