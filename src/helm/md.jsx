// HELM — render de markdown mínimo (encabezados, listas, negrita/cursiva/código).
// Suficiente para lo que devuelve el modelo local, sin meter una dependencia.

function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

export function Markdown({ text }) {
  const out = []
  let list = null
  const flush = () => { if (list) { out.push(<ul key={'u' + out.length}>{list}</ul>); list = null } }
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '')
    if (/^#{1,6}\s/.test(line)) {
      flush()
      const level = line.match(/^#+/)[0].length
      const txt = line.replace(/^#+\s/, '')
      const Tag = level <= 1 ? 'h2' : level === 2 ? 'h3' : 'h4'
      out.push(<Tag key={i}>{inline(txt)}</Tag>)
    } else if (/^[-*]\s/.test(line)) {
      if (!list) list = []
      list.push(<li key={i}>{inline(line.replace(/^[-*]\s/, ''))}</li>)
    } else if (!line.trim()) {
      flush()
    } else {
      flush()
      out.push(<p key={i}>{inline(line)}</p>)
    }
  })
  flush()
  return <div className="helm-md">{out}</div>
}
