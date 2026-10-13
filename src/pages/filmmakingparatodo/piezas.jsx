// Filmmaking para todo — las piezas que son solo suyas: el fondo, el enlace
// a la clase gratuita y HELM en su sección. El resto lo pinta el motor de las
// comunidades (src/pages/comunidad/Comunidad.jsx) con ./config.jsx.
import { ArrowRight, ExternalLink, PlayCircle, Workflow } from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { FUNDADOR } from './contenido.js'
import { HELM_REGISTRO, HELM_WEB } from './contenidoHelm.js'

// El fondo: lenguaje de cine, sobrio. Grano de película, las esquinas del
// visor, las guías de 2.39:1 con su cruz al centro y la marca de grabación.
// Todo en CSS (ddc.css), sin imágenes. El ASCII de AI para todo es de Alex:
// aquí no va.
export function Fondo() {
  return (
    <div className="ddc-fondo" aria-hidden="true">
      <div className="ddc-grano" />
      <div className="ddc-guias" />
      <div className="ddc-visor"><i /><i /><i /><i /></div>
      <span className="ddc-rec"><b /> REC</span>
    </div>
  )
}

// El enlace secundario de la portada: la clase gratuita de Abel.
export function ClaseGratis() {
  return (
    <a
      className="ddc-clase" href={FUNDADOR.clase} target="_blank" rel="noopener noreferrer"
      onClick={() => track('clic_cta', { donde: 'fmpt-clase' })}
    >
      <PlayCircle size={16} /> O mira gratis la clase de Abel
    </a>
  )
}

// HELM, el sistema con el que Detrás de Cámara crea su contenido: crear
// cuenta o verlo. Solo en su sección (Contenido con HELM), al pie del hilo.
export function TrasHilo({ sk, slug }) {
  if (sk !== 'contenido') return null
  return (
    <aside className="aip-helm">
      <p className="aip-kicker"><Workflow size={13} /> HELM · el sistema de contenido de Detrás de Cámara</p>
      <h3>Crea tu contenido con HELM</h3>
      <p>
        Referencias, guiones, calendario y Drive en un solo panel, con agentes que trabajan solos. Para tu marca y
        para la de cada cliente. Sin suscripción: pagas por uso, con créditos de regalo al empezar.
      </p>
      <div className="aip-helm-btns">
        <a className="aip-btn pequeno" href={HELM_REGISTRO} onClick={() => track('clic_cta', { donde: `fmpt-helm-registro-${slug}` })}>
          Crea tu cuenta <ArrowRight size={14} />
        </a>
        <a className="aip-btn sec pequeno" href={HELM_WEB} target="_blank" rel="noopener noreferrer" onClick={() => track('clic_cta', { donde: `fmpt-helm-web-${slug}` })}>
          Ver HELM <ExternalLink size={14} />
        </a>
      </div>
    </aside>
  )
}
