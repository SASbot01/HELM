// HELM plugin — Equipos IA. Cada "equipo" es un pipeline de agentes que hace
// un trabajo del negocio de punta a punta. El primero es el de Contenido:
// Agente Persona (funde onboarding + estrategia) → Agente 1 Investigación
// (plan diario de historias y reels) → Agente 2 Creador (siguiente fase).
import { useState } from 'react'
import { ArrowLeft, Sparkles, TrendingUp, Headset } from 'lucide-react'
import ContenidoTeam from './ContenidoTeam'

const EQUIPOS = [
  { key: 'contenido', nombre: 'Contenido', icon: Sparkles, disponible: true,
    desc: 'Agente Persona funde tu onboarding con la estrategia de historias y reels; el Agente de Investigación te dice cada día qué grabar.' },
  { key: 'ventas', nombre: 'Ventas', icon: TrendingUp, disponible: false,
    desc: 'Próximamente: agentes que cualifican leads y preparan la llamada.' },
  { key: 'soporte', nombre: 'Soporte', icon: Headset, disponible: false,
    desc: 'Próximamente: agentes que responden dudas frecuentes de clientes.' },
]

export default function EquiposIA({ clientId }) {
  const [equipo, setEquipo] = useState(null)

  if (equipo === 'contenido') {
    return (
      <div className="helm-eq">
        <button className="helm-btn helm-eq-back" onClick={() => setEquipo(null)}>
          <ArrowLeft size={15} /> Equipos IA
        </button>
        <ContenidoTeam clientId={clientId} />
      </div>
    )
  }

  return (
    <div className="helm-eq">
      <p className="helm-eq-intro">Cada equipo es una cadena de agentes que hace un trabajo completo, de punta a
        punta, sobre este perfil. Elige uno para entrar.</p>
      <div className="helm-eq-grid">
        {EQUIPOS.map(e => {
          const Icon = e.icon
          return (
            <button
              key={e.key}
              className={'helm-card helm-eq-team' + (e.disponible ? '' : ' soon')}
              disabled={!e.disponible}
              onClick={() => e.disponible && setEquipo(e.key)}
            >
              <div className="helm-eq-team-ico"><Icon size={20} /></div>
              <b>{e.nombre}</b>
              {!e.disponible && <span className="helm-chip">Próximamente</span>}
              <p>{e.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
