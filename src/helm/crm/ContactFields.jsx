// HELM — CRM · los campos del contacto, en un solo sitio.
//
// Componente puro: recibe el formulario y un `set`, y no sabe si lo está
// pintando el alta manual o la ficha. Las reglas (limpieza, validación,
// etapas) están en ./contact.js.
import { Field, Input, Textarea, Select, MoneyInput } from '../ui'
import { SOURCES } from './contact'

// `stages` viene del pipeline configurado del perfil; `services`, del catálogo.
// Ambas listas son opcionales: sin ellas el formulario sigue siendo usable.
export function ContactFields({ form, errors = {}, set, showStage = true, stages = [], services = [] }) {
  const f = (k) => ({
    value: form[k],
    onChange: e => set(k, e.target.value),
  })

  return (
    <>
      <div className="helm-form-2">
        <Field label="Nombre *" error={errors.name}>
          <Input {...f('name')} autoComplete="name" placeholder="Pepito Pérez" autoFocus />
        </Field>
        <Field label="Empresa">
          <Input {...f('company')} autoComplete="organization" placeholder="Acme S.L." />
        </Field>
      </div>

      <div className="helm-form-2">
        <Field label="Cargo">
          <Input {...f('position')} autoComplete="organization-title" placeholder="CEO, Director de marketing…" />
        </Field>
        <Field label="Responsable" hint="Quién lleva este lead">
          <Input {...f('assigned_to')} placeholder="Juan (closer)" />
        </Field>
      </div>

      <div className="helm-drawer-section">Contacto</div>

      <div className="helm-form-2">
        <Field label="Email" error={errors.email}>
          {/* type="text": con type="email" el navegador enseña su propio globo
              de error en un idioma distinto y tapa el nuestro. Validamos aquí. */}
          <Input {...f('email')} type="text" inputMode="email" autoComplete="email"
            spellCheck={false} placeholder="pepito@acme.com" />
        </Field>
        <Field label="Teléfono" error={errors.phone}>
          <Input {...f('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+34 600 11 22 33" />
        </Field>
      </div>

      <div className="helm-form-2">
        <Field label="WhatsApp" error={errors.whatsapp} hint="Si es el mismo que el teléfono, déjalo vacío">
          <Input {...f('whatsapp')} type="tel" inputMode="tel" placeholder="+34 600 11 22 33" />
        </Field>
        <Field label="Instagram" hint="Con o sin @, o pega la URL">
          <Input {...f('instagram')} spellCheck={false} placeholder="@pepitoperez" />
        </Field>
      </div>

      <div className="helm-form-2">
        <Field label="LinkedIn">
          <Input {...f('linkedin')} spellCheck={false} placeholder="linkedin.com/in/pepitoperez" />
        </Field>
        <Field label="Web">
          <Input {...f('website')} spellCheck={false} placeholder="acme.com" />
        </Field>
      </div>

      <div className="helm-form-2">
        <Field label="País">
          <Input {...f('country')} autoComplete="country-name" placeholder="España" />
        </Field>
        <Field label="Dirección">
          <Input {...f('address')} autoComplete="street-address" placeholder="Calle Mayor 1, Madrid" />
        </Field>
      </div>

      <div className="helm-drawer-section">Oportunidad</div>

      <div className="helm-form-2">
        {showStage ? (
          <Field label="Etapa">
            <Select {...f('status')}>
              {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Origen" hint="De dónde salió el lead">
            <Input {...f('source')} list="helm-crm-sources" placeholder="Instagram, referido, web…" />
          </Field>
        )}
        <Field label="Valor potencial (€)" error={errors.deal_value}>
          <MoneyInput value={form.deal_value} onChange={v => set('deal_value', v)} placeholder="0" />
        </Field>
      </div>

      {showStage && (
        <Field label="Origen" hint="De dónde salió el lead">
          <Input {...f('source')} list="helm-crm-sources" placeholder="Instagram, referido, web…" />
        </Field>
      )}

      <datalist id="helm-crm-sources">
        {SOURCES.map(s => <option key={s} value={s} />)}
      </datalist>

      {services.length > 0 && (
        <Field label="Servicio contratado" hint="Permite filtrar el pipeline por servicio">
          <Select {...f('service_id')}>
            <option value="">— Ninguno —</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Etiquetas" hint="Separadas por comas: vip, madrid, b2b">
        <Input {...f('tags')} placeholder="vip, madrid, b2b" />
      </Field>

      <Field label="Notas">
        <Textarea {...f('notes')} rows={3} placeholder="Contexto, qué necesita, de qué habéis hablado…" />
      </Field>
    </>
  )
}
