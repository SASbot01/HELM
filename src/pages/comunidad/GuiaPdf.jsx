// Las comunidades — una guía en PDF sin piezas a medida: su índice antes de
// la puerta y, dentro, la descarga, la introducción y (si los tiene) los
// mismos bloques que un capítulo. Una comunidad la usa poniendo en `pdfs` de
// su configuración una entrada sin `Indice` ni `Cuerpo` propios:
//
//   { hilo, portada3d, alt, gancho, kicker, puerta,
//     archivo: '/<ruta>/<guia>.pdf', intro, indice: [{ n, nombre }],
//     bloques?: [...], recurso: '<nombre-en-las-métricas>', nota: '<línea del CRM>' }
//
// `nota` tiene que estar en las notas de la comunidad en el servidor
// (api/_lib/comunidades.js); si no, el servidor la ignora.
import { Check, Download } from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { useComunidad } from './datos.js'
import { anota } from './crm.js'
import { Bloque, IndiceCapitulo } from './bloques.jsx'

export function IndicePdf({ pdf }) {
  if (!pdf.indice?.length) return null
  return (
    <section className="aip-card aip-indice">
      <h2>Qué hay dentro</h2>
      <ol className="aip-nn-indice">
        {pdf.indice.map(p => <li key={p.n}><span className="aip-indice-item"><span>{p.n}</span><b>{p.nombre}</b></span></li>)}
      </ol>
    </section>
  )
}

function Descarga({ pdf, acceso, donde }) {
  const cfg = useComunidad()
  return (
    <a
      className="aip-btn aip-descarga" href={pdf.archivo} download
      onClick={() => { track('descarga', { recurso: pdf.recurso, donde }); anota(cfg, acceso?.id, pdf.nota) }}
    >
      <Download size={18} /> Descargar el PDF
    </a>
  )
}

export function CuerpoPdf({ pdf, acceso }) {
  return (
    <>
      <section className="aip-card aip-nn-listo">
        <p className="aip-kicker"><Check size={13} /> Lista para descargar</p>
        <h2>Toda tuya{acceso?.nombre ? <>, <em>{acceso.nombre}</em></> : null}</h2>
        {pdf.intro && <p>{pdf.intro}</p>}
        <Descarga pdf={pdf} acceso={acceso} donde="arriba" />
      </section>

      {pdf.bloques?.length > 0 && (
        <>
          <IndiceCapitulo c={{ bloques: pdf.bloques }} enlaces />
          <article className="aip-capitulo">
            {pdf.bloques.map((b, i) => <Bloque key={i} b={b} i={i} />)}
          </article>
        </>
      )}

      <section className="aip-card aip-nn-final">
        <h2>Llévatela en PDF</h2>
        <div className="aip-fila">
          <Descarga pdf={pdf} acceso={acceso} donde="abajo" />
        </div>
      </section>
    </>
  )
}
