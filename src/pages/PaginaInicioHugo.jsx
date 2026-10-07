// PÁGINA INICIO — la cara pública de En Forma con Hugo.
//
//   enformaconhugo.com  ·  /paginainicio-hugo
//
// Misma pieza que la de Alex (PaginaInicio.jsx) y a propósito: comparten hoja
// de estilos y hook de <head>, y lo único que cambia es la marca, la foto y a
// dónde llevan los dos botones. Si hay que tocar la maqueta se toca una vez y
// sirve para las dos.
//
// Lo que cambia de fondo es el destino. En la de Alex el botón fuerte es
// YouTube, porque su marca deriva a donde enseña. Aquí el botón fuerte es la
// web del Método Acción Fit: ahí está la llamada gratuita, que es lo que
// convierte. YouTube queda de apoyo. Para invertirlo basta con mover la clase
// `on` de un <a> al otro.
//
// El texto no está inventado: sale de su propia web (el titular, las tres
// negaciones y las +200 transformaciones), para que quien llegue desde
// Instagram lea lo mismo que se va a encontrar al pulsar.
import { Youtube, Dumbbell, ArrowUpRight } from 'lucide-react'
import { useCabeceraPublica } from './inicio/cabecera.js'
import './inicio/inicio.css'

// Los enlaces, juntos y arriba: son lo que se cambia cada dos por tres y no
// tiene gracia buscarlos entre el maquetado.
const WEB = 'https://web.enformaconhugo.com/'
const YOUTUBE = 'https://www.youtube.com/@enformaconhugo'

const TITULO = 'En Forma con Hugo — Pierde 4–10 kg en 8 semanas'
const DESCRIPCION = 'Método Acción Fit: sin pasar hambre, sin entrenar dos horas al día y sin depender de la motivación. +200 transformaciones reales.'

export default function PaginaInicioHugo() {
  useCabeceraPublica({
    titulo: TITULO, descripcion: DESCRIPCION,
    imagen: '/inicio/hugo-og.jpg', colorBarra: '#08090A',
  })

  return (
    <div className="ini ini--hugo">
      <main className="ini-card">
        <img
          className="ini-foto"
          src="/inicio/hugo.jpg"
          alt="Hugo, entrenador de En Forma con Hugo"
          width="1100" height="1467"
          // La foto es lo primero que se ve y ocupa media pantalla: cargarla
          // perezosa sería dejar un hueco gris justo donde mira todo el mundo.
          fetchPriority="high"
        />

        <div className="ini-nombre">
          <b>Hugo</b>
          <span>Entrenador · Método Acción Fit</span>
        </div>

        <h1>No es tu cuerpo.<br />Es tu <em>método</em></h1>

        <p className="ini-lead">
          Sin pasar hambre. Sin entrenar dos horas al día. Sin depender de la
          motivación. Un plan hecho para tu vida real, no para la de otro.
        </p>

        <div className="ini-dato">
          <b>+200 transformaciones</b> reales
        </div>

        <div className="ini-sep">Empieza aquí</div>

        <div className="ini-botones">
          {/* El primario. Aquí está la llamada 1-a-1 gratuita: es el único
              sitio de toda la marca donde alguien se convierte en cliente. */}
          <a className="ini-btn on" href={WEB} target="_blank" rel="noopener noreferrer">
            <Dumbbell size={22} />
            <span>
              Ver el Método Acción Fit
              <small>Reserva tu llamada gratis · cupos limitados</small>
            </span>
            <ArrowUpRight className="ini-flecha" size={17} />
          </a>

          <a className="ini-btn" href={YOUTUBE} target="_blank" rel="noopener noreferrer">
            <Youtube size={22} />
            <span>
              Mírame en YouTube
              <small>Entrenos, comidas y casos reales</small>
            </span>
            <ArrowUpRight className="ini-flecha" size={17} />
          </a>
        </div>

        <p className="ini-pie">
          En Forma con Hugo · Entrenamiento y nutrición para gente ocupada
        </p>
      </main>
    </div>
  )
}
