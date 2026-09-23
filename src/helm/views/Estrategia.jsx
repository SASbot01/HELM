// HELM — Estrategia: toda la estrategia de la cuenta en una sección propia.
//
// Dos pestañas. Evergreen es lo que se hace cada semana pase lo que pase (la
// Ronda de Stories y la Ronda de Reels); Lanzamientos es lo que se hace una
// vez, con fecha y con números que cuadrar. Hasta ahora lo evergreen vivía
// escondido como pestaña dentro de Contenido, al lado del calendario, y la
// gente no lo encontraba: la estrategia no es una vista más del calendario,
// es lo que decide qué entra en él.
//
// El componente de Evergreen es el mismo que había en Guiones (antes
// "Contenido"), sin tocar:
// aquí solo se le da la puerta que le faltaba.
import { useState } from 'react'
import { Repeat, Rocket } from 'lucide-react'
import Estrategias from './contenido/Estrategias'
import Lanzamientos from './estrategia/Lanzamientos'
import './estrategia/estrategia.css'

export default function Estrategia({ clientId, client }) {
  const [vista, setVista] = useState('evergreen') // 'evergreen' | 'lanzamientos'
  return (
    <div className="helm-estrategia">
      <div className="helm-tabs helm-estrategia-modos">
        <button className={'helm-tab' + (vista === 'evergreen' ? ' active' : '')} onClick={() => setVista('evergreen')}>
          <Repeat size={15} /> Evergreen
        </button>
        <button className={'helm-tab' + (vista === 'lanzamientos' ? ' active' : '')} onClick={() => setVista('lanzamientos')}>
          <Rocket size={15} /> Lanzamientos
        </button>
      </div>

      {vista === 'evergreen'
        ? <Estrategias />
        : <Lanzamientos clientId={clientId} client={client} />}
    </div>
  )
}
