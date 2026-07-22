// HELM — Plugins: catálogo. Activar un plugin disponible lo añade al menú lateral.
// El estado on/off vive en HelmApp (que también pinta el menú), así que el
// toggle aquí se refleja al instante en la navegación.
import { Sparkles } from 'lucide-react'
import { PLUGINS } from '../plugins/registry'

export default function Plugins({ enabled, onToggle }) {
  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="helm-plugin-ico"><Sparkles size={20} /></div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Amplía HELM con plugins</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>
            Activa un módulo y aparecerá en el menú lateral de este perfil. Los marcados como
            «próximamente» llegarán pronto.
          </div>
        </div>
      </div>

      <div className="helm-plugins">
        {PLUGINS.map(p => {
          const Icon = p.icon
          const on = !!enabled[p.key]
          return (
            <div className="helm-plugin" key={p.key}>
              <div className="helm-plugin-ico"><Icon size={20} /></div>
              <h4>{p.name}</h4>
              <p>{p.desc}</p>
              <div className="helm-toggle">
                <span className={'helm-chip' + (p.available ? ' green' : '')}>
                  {p.available ? (on ? 'activo' : 'disponible') : 'próximamente'}
                </span>
                {p.available ? (
                  <div
                    className={'helm-switch' + (on ? ' on' : '')}
                    onClick={() => onToggle(p.key)}
                    role="switch" aria-checked={on}
                  />
                ) : (
                  <div className="helm-switch" style={{ opacity: 0.4, cursor: 'not-allowed' }} aria-disabled />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
