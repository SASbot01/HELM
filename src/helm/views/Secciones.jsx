// HELM — Secciones: qué partes del panel usa ESTE negocio.
//
// El catálogo de Plugins sirve para añadir módulos; esto es lo contrario, y
// hacía falta: un negocio que no vende por llamada no quiere Diario ni Llamadas
// en el menú para siempre, y un infoproducto sin comunidad ve dos secciones que
// no va a abrir nunca.
//
// No se confunde con los permisos de Ajustes: allí se decide qué ve cada ROL
// (a un closer no le enseñamos Finanzas); aquí, qué usa el NEGOCIO. Se aplican
// los dos, y apagar aquí manda sobre todo.
import { Layers, Lock } from 'lucide-react'
import { SECCIONES_FIJAS, seccionEncendida } from '../permisos'

export default function Secciones({ secciones, catalogo, onToggle, guardando }) {
  const apagadas = catalogo.filter(n => !seccionEncendida(secciones, n.key)).length

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      <div className="helm-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="helm-plugin-ico"><Layers size={20} /></div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Las secciones de tu negocio</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>
            Apaga lo que no uses y desaparece del menú, para todo el equipo y en todos
            los dispositivos. Los datos no se borran: si la vuelves a encender, está todo.
            {apagadas > 0 && ` Ahora mismo tienes ${apagadas} apagada${apagadas === 1 ? '' : 's'}.`}
          </div>
        </div>
      </div>

      <div className="helm-plugins">
        {catalogo.map(n => {
          const Icon = n.icon
          const fija = SECCIONES_FIJAS.includes(n.key)
          const on = seccionEncendida(secciones, n.key)
          return (
            <div className="helm-plugin" key={n.key}>
              <div className="helm-plugin-ico"><Icon size={20} /></div>
              <h4>{n.title || n.label}</h4>
              <p>{n.sub}</p>
              <div className="helm-toggle">
                <span className={'helm-chip' + (on ? ' green' : '')}>
                  {fija ? 'siempre activa' : on ? 'activa' : 'apagada'}
                </span>
                {fija ? (
                  // Sin Ajustes no se vuelve a la configuración, y sin Secciones no
                  // hay forma de volver a encender nada. No se pueden apagar.
                  <div className="helm-switch on" style={{ opacity: 0.45, cursor: 'not-allowed' }}
                    title="Esta sección no se puede apagar" aria-disabled>
                    <Lock size={11} style={{ display: 'none' }} />
                  </div>
                ) : (
                  <div
                    className={'helm-switch' + (on ? ' on' : '') + (guardando ? ' guardando' : '')}
                    onClick={() => onToggle(n.key)}
                    role="switch" aria-checked={on} aria-label={n.title || n.label}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
