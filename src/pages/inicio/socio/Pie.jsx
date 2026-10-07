import { Instagram } from 'lucide-react'
import { INSTAGRAM, HANDLE } from './config.js'

// Pie mínimo: nada aquí debe competir con el botón de la auditoría. Instagram
// va como un icono pequeño y gris, no como un botón.
export default function Pie() {
  return (
    <footer className="so-pie">
      <span>© {new Date().getFullYear()} Alex Silvestre</span>
      <a href="/privacidad">Política de privacidad</a>
      <a href="/aviso-legal">Aviso legal</a>
      <a className="so-pie-ig" href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label={`Instagram @${HANDLE}`}>
        <Instagram size={16} />
      </a>
    </footer>
  )
}
