// HELM — los campos de los formularios de onboarding, uno por tipo (text,
// long, scale, axis, multi, table; ver schema.js).
//
// Los usan el formulario del panel (views/Onboarding.jsx) y la página pública
// del alta (pages/AltaHelm.jsx), así que aquí no hay datos ni guardado: cada
// campo recibe su valor y avisa con onChange.
//
// `limites` e `id` son opcionales. `limites` lo pasan los dos que escriben el
// alta (la página pública y el alta en el panel): el servidor rechaza lo que
// llega por el enlace por encima de esos topes, y es mejor que no se pueda
// escribir de más a que salte un error al guardar. El panel también los pone
// en el alta porque escribe en la misma fila: un texto largo metido desde aquí
// dejaría al cliente sin poder guardar nada desde su enlace. `id` solo lo usa
// la página pública. En contenido y operativo no se pasa nada y todo queda igual.
import { Check, Plus, Trash2 } from 'lucide-react'

export function ScaleInput({ field, value, onChange }) {
  return (
    <div className="helm-onb-scale">
      <div className="helm-onb-scale-row">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n} type="button"
            className={'helm-onb-scale-n' + (Number(value) === n ? ' on' : '')}
            aria-pressed={Number(value) === n}
            onClick={() => onChange(Number(value) === n ? '' : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="helm-onb-scale-ends">
        <span>{field.minLabel || '1'}</span>
        <span>{field.maxLabel || '10'}</span>
      </div>
    </div>
  )
}

export function OptionRow({ options, value, onChange, single, max }) {
  const selected = single ? (value ? [value] : []) : (value || [])
  function toggle(opt) {
    if (single) return onChange(value === opt ? '' : opt)
    const has = selected.includes(opt)
    if (has) return onChange(selected.filter(x => x !== opt))
    if (max && selected.length >= max) return
    onChange([...selected, opt])
  }
  return (
    <div className="helm-onb-opts">
      {options.map(opt => (
        <button
          key={opt} type="button"
          className={'helm-onb-opt' + (selected.includes(opt) ? ' on' : '')}
          aria-pressed={selected.includes(opt)}
          onClick={() => toggle(opt)}
        >
          {selected.includes(opt) && <Check size={13} />}
          {opt}
        </button>
      ))}
    </div>
  )
}

export function TableInput({ field, value, onChange, limites }) {
  const rows = value && value.length ? value : [{}]
  const set = (i, colKey, v) => onChange(rows.map((r, ri) => (ri === i ? { ...r, [colKey]: v } : r)))
  const addRow = () => onChange([...rows, {}])
  const delRow = (i) => { const next = rows.filter((_, ri) => ri !== i); onChange(next.length ? next : [{}]) }
  const llena = Boolean(limites?.filas) && rows.length >= limites.filas
  return (
    <div className="helm-onb-table">
      {rows.map((row, i) => (
        <div key={i} className="helm-onb-trow">
          <div className="helm-onb-tcells">
            {field.columns.map(col => (
              <input
                key={col.key} className="helm-input" placeholder={col.label}
                aria-label={limites ? `${col.label} (fila ${i + 1})` : undefined}
                maxLength={limites?.text}
                value={row[col.key] || ''} onChange={e => set(i, col.key, e.target.value)}
              />
            ))}
          </div>
          {rows.length > 1 && (
            <button type="button" className="helm-onb-trow-del" onClick={() => delRow(i)} title="Quitar fila" aria-label="Quitar fila">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {!llena && (
        <button type="button" className="helm-btn helm-onb-addrow" onClick={addRow}>
          <Plus size={14} /> {field.addLabel || 'Añadir fila'}
        </button>
      )}
    </div>
  )
}

// `id` va al input o al área de texto, para que la etiqueta de la pregunta
// (htmlFor) apunte a él. En los de botones no hay un único control: ahí lo
// pone quien pinta la pregunta, en el grupo.
export function FieldInput({ field, value, onChange, limites, id }) {
  switch (field.type) {
    case 'text':
      return <input id={id} className="helm-input" maxLength={limites?.text} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'scale':
      return <ScaleInput field={field} value={value} onChange={onChange} />
    case 'axis':
      return <OptionRow options={field.options} value={value} onChange={onChange} single />
    case 'multi':
      return <OptionRow options={field.options} value={value} onChange={onChange} max={field.max} />
    case 'table':
      return <TableInput field={field} value={value} onChange={onChange} limites={limites} />
    default:
      return <textarea id={id} className="helm-input helm-onb-area" rows={field.rows || 4} maxLength={limites?.long} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}
