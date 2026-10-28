// HELM — Formularios · los campos de una respuesta.
//
// Vive aparte porque lo usan DOS sitios que no comparten nada más: el registro
// a mano dentro del panel y el formulario público que rellena el cliente desde
// su enlace. Si se duplicara, un tipo de pregunta nuevo funcionaría en un sitio
// y no en el otro.
import { Field, Input, Textarea, Select } from '../ui'

export function CamposRespuesta({ fields, answers, set, errors = {} }) {
  return fields.map(c => {
    const v = answers[c.key] ?? ''
    const label = c.label + (c.required ? ' *' : '')
    if (c.type === 'long') {
      return (
        <Field key={c.key} label={label} error={errors[c.key]}>
          <Textarea value={v} onChange={e => set(c.key, e.target.value)} rows={3} />
        </Field>
      )
    }
    if (c.type === 'select') {
      return (
        <Field key={c.key} label={label} error={errors[c.key]}>
          <Select value={v} onChange={e => set(c.key, e.target.value)}>
            <option value="">—</option>
            {(c.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
      )
    }
    if (c.type === 'multi') {
      const sel = Array.isArray(v) ? v : []
      return (
        <Field key={c.key} label={label} error={errors[c.key]}>
          <div className="helm-pickers" style={{ marginBottom: 0 }}>
            {(c.options || []).map(o => (
              <button
                key={o} type="button"
                className={'helm-pick' + (sel.includes(o) ? ' on' : '')}
                onClick={() => set(c.key, sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o])}
              >{o}</button>
            ))}
          </div>
        </Field>
      )
    }
    if (c.type === 'scale') {
      return (
        <Field key={c.key} label={label} error={errors[c.key]}>
          <div className="helm-pickers" style={{ marginBottom: 0 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n} type="button"
                className={'helm-pick' + (Number(v) === n ? ' on' : '')}
                onClick={() => set(c.key, n)}
              >{n}</button>
            ))}
          </div>
        </Field>
      )
    }
    return (
      <Field key={c.key} label={label} error={errors[c.key]}>
        <Input
          type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
          value={v} onChange={e => set(c.key, e.target.value)}
        />
      </Field>
    )
  })
}

