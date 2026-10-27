// HELM — Portadas con IA: la vista previa, hecha con CSS, de un estilo que no
// tiene imagen de ejemplo (los de la investigación de miniaturas). Pinta el
// degradado de fondo, la silueta de la persona (una forma neutra, nunca una
// cara: la de verdad sale de tu fotograma), el adorno del estilo y un titular
// de ejemplo con su palabra resaltada. Todo sale de vistaDe (./estilosIa.js);
// las clases, en ../portadas.css (.por-vista…).
import { vistaDe } from './estilosIa'

// El contorno del titular con sombras (text-stroke se come la letra por dentro).
const contornoDe = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
  .map(([x, y]) => `${x * 0.055}em ${y * 0.055}em 0 ${c}`).join(', ')

export default function VistaEstilo({ estilo, marca = null }) {
  const v = vistaDe(estilo, marca)
  if (!v) return null
  const titular = {
    color: v.tinta,
    fontFamily: v.familia,
    fontWeight: v.peso,
    fontSize: `${v.tam}cqw`,
    ...(v.contorno ? { textShadow: contornoDe(v.contorno) } : {}),
  }
  const personas = v.persona === 'ninguna' ? [] : v.persona === 'dos' ? ['dos-a', 'dos-b'] : [v.persona]
  return (
    <span
      className={`por-vista por-vista-${v.sitio}`} style={{ background: v.degradado, '--resalte': v.resalte, '--tinta': v.tinta, '--silueta': v.silueta }}
      data-estilo={estilo.clave} aria-hidden="true"
    >
      {v.adorno && <Adorno tipo={v.adorno} />}
      {personas.map(p => <span key={p} className={`por-vista-persona ${p}`} />)}
      <span className="por-vista-titular" style={titular}>
        {v.adorno === 'comillas' && <span className="por-vista-comillas">«</span>}
        <span className={`por-vista-linea${v.caja ? ' caja' : ''}`} style={v.caja ? { background: v.caja } : undefined}>
          {v.palabras.map((p, i) => (
            <span key={i} className={p.resaltada ? `res${v.adorno === 'cifra' ? ' grande' : ''}` : undefined}>
              {p.texto}{i < v.palabras.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

// Lo que distingue a cada estilo, en pequeño: flechas, una pantalla, un
// esquema, la portada partida en dos…
function Adorno({ tipo }) {
  if (tipo === 'flechas') return <span className="por-vista-adorno flechas"><i>➜</i><b /></span>
  if (tipo === 'pantalla') return <span className="por-vista-adorno pantalla"><i /><i /><i /></span>
  if (tipo === 'pizarra') return <span className="por-vista-adorno pizarra"><i /></span>
  if (tipo === 'antes-despues') return <span className="por-vista-adorno antes-despues"><small>ANTES</small><i>➜</i><small>DESPUÉS</small></span>
  return <span className={`por-vista-adorno ${tipo}`} />
}
