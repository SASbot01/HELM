// La máscara en ASCII de la bio (../mascara.txt), aquí como remate del cierre
// de /empresas: el mismo aire pantera en las dos páginas. Decoración pura; la
// `@` del fichero marca los ojos, que se pintan como bloques y brillan.
import arte from '../mascara.txt?raw'

const TROZOS = arte.split(/(@+)/)

export default function Capucha() {
  return (
    <pre className="so-capucha" aria-hidden="true">
      {TROZOS.map((t, i) => (t.startsWith('@') ? <span key={i} className="so-ojo">{'█'.repeat(t.length)}</span> : t))}
    </pre>
  )
}
