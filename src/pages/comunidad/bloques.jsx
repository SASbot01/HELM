// Las comunidades — los bloques con los que se escribe un capítulo, un hilo
// de bloques (Operaciones, Recursos…) o una guía: h2/h3/p/lista/pasos/aviso/
// prompt/codigo/tabla/descarga. Cada comunidad los usa tal cual.
import { useState } from 'react'
import {
  Check, Copy, Download, ExternalLink, Info, Lightbulb, AlertTriangle, Terminal,
} from 'lucide-react'
import { ancla } from './datos.js'

// ── Texto con **negrita** y `código` ────────────────────────────────────────
export function Rico({ texto }) {
  const partes = String(texto ?? '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
    return p
  })
}

export function IndiceCapitulo({ c, enlaces = false }) {
  const apartados = c.bloques.map((b, i) => ({ b, i })).filter(({ b }) => b.tipo === 'h2')
  if (!apartados.length) return null
  return (
    <section className="aip-card aip-indice">
      <h2>{enlaces ? 'En este capítulo' : 'Qué vas a aprender'}</h2>
      <ol>
        {apartados.map(({ b, i }, k) => (
          <li key={i}>
            {enlaces
              ? <a href={`#${ancla(b.texto, i)}`}><span>{String(k + 1).padStart(2, '0')}</span><b><Rico texto={b.texto} /></b></a>
              : <span className="aip-indice-item"><span>{String(k + 1).padStart(2, '0')}</span><b><Rico texto={b.texto} /></b></span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

const AVISOS = { truco: Lightbulb, ojo: AlertTriangle, dato: Info }

export function Bloque({ b, i }) {
  switch (b.tipo) {
    case 'h2': return <h2 id={ancla(b.texto, i)} className="aip-cap-h2"><Rico texto={b.texto} /></h2>
    case 'h3': return <h3 className="aip-cap-h3"><Rico texto={b.texto} /></h3>
    case 'p': return <p className="aip-cap-p"><Rico texto={b.texto} /></p>
    case 'lista': return <ul className="aip-cap-lista">{(b.items || []).map((x, k) => <li key={k}><Rico texto={x} /></li>)}</ul>
    case 'pasos': return (
      <ol className="aip-cap-pasos">
        {(b.items || []).map((x, k) => (
          <li key={k}><span>{k + 1}</span><div><b><Rico texto={x.titulo} /></b>{x.texto && <p><Rico texto={x.texto} /></p>}</div></li>
        ))}
      </ol>
    )
    case 'aviso': {
      const Icono = AVISOS[b.variante] || Info
      return (
        <aside className={`aip-aviso ${b.variante || 'dato'}`}>
          <Icono size={18} />
          <div>{b.titulo && <b><Rico texto={b.titulo} /></b>}<p><Rico texto={b.texto} /></p></div>
        </aside>
      )
    }
    case 'prompt': return <Prompt titulo={b.titulo} texto={b.texto} />
    case 'codigo': return <Codigo titulo={b.titulo || 'Terminal'} nota={b.nota} texto={b.texto} />
    case 'tabla': return (
      <div className="aip-cap-tabla">
        <table>
          <thead><tr>{(b.cabecera || []).map((c, k) => <th key={k}><Rico texto={c} /></th>)}</tr></thead>
          <tbody>{(b.filas || []).map((f, k) => <tr key={k}>{f.map((c, j) => <td key={j}><Rico texto={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    )
    // Un archivo para descargar (una plantilla, un LUT, un checklist). Sin
    // `url`, el archivo todavía no está: se dice «pronto» en vez de un enlace roto.
    case 'descarga': return (
      <aside className="aip-descarga-bloque">
        <Download size={20} />
        <div>
          <b><Rico texto={b.titulo} /></b>
          {b.texto && <p><Rico texto={b.texto} /></p>}
        </div>
        {b.url
          ? <a className="aip-btn pequeno" href={b.url} download>{b.boton || 'Descargar'} <Download size={14} /></a>
          : <span className="aip-pronto">pronto</span>}
      </aside>
    )
    default: return null
  }
}

export function CuerpoCapitulo({ c }) {
  return (
    <>
      <IndiceCapitulo c={c} enlaces />
      <article className="aip-capitulo">
        {c.bloques.map((b, i) => <Bloque key={i} b={b} i={i} />)}
      </article>
      {c.claves?.length > 0 && (
        <section className="aip-card aip-claves">
          <h2>Lo que te llevas</h2>
          <ul>{c.claves.map((x, k) => <li key={k}><Check size={16} /><span><Rico texto={x} /></span></li>)}</ul>
        </section>
      )}
      {c.fuentes?.length > 0 && (
        <section className="aip-fuentes">
          <h3>Fuentes oficiales</h3>
          <ul>
            {c.fuentes.map(f => (
              <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.texto} <ExternalLink size={12} /></a></li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function useCopiar() {
  const [copiado, setCopiado] = useState(false)
  const copiar = (t) => {
    navigator.clipboard?.writeText(t).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }).catch(() => {})
  }
  return [copiado, copiar]
}

export function Codigo({ titulo, nota, texto }) {
  const [copiado, copiar] = useCopiar()
  return (
    <div className="aip-codigo">
      <div className="aip-codigo-cab">
        <span><Terminal size={14} /> {titulo}</span>
        <button type="button" onClick={() => copiar(texto)}>{copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
      </div>
      <pre>{texto}</pre>
      {nota && <small>{nota}</small>}
    </div>
  )
}

export function Prompt({ titulo, texto }) {
  const [copiado, copiar] = useCopiar()
  return (
    <div className="aip-prompt">
      <div className="aip-prompt-cab">
        <b>{titulo}</b>
        <button type="button" onClick={() => copiar(texto)}>{copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar prompt</>}</button>
      </div>
      <p>{texto}</p>
    </div>
  )
}
