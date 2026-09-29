// El fondo de la página de la bio de Alex: la máscara de Mr. Robot bajo la
// capucha, en ASCII, con los ojos en rojo, sobre negro y granate. Sacada de
// una foto de la máscara (mascara.txt), a petición de Alex; si algún día hay
// que quitarla por ser de la serie, la capucha propia está en el historial de
// git (capucha.txt, commit d6b5b42).
//
// Es decoración pura: aria-hidden, sin eventos y detrás de todo. En mascara.txt
// la `@` marca los ojos: se pintan aparte, como bloques sólidos, para que
// brillen.
import arte from './mascara.txt?raw'

const TROZOS = arte.split(/(@+)/)

export default function FondoHacker() {
  return (
    <div className="ini-hacker" aria-hidden="true">
      <pre className="ini-ascii">
        {TROZOS.map((t, i) => (t.startsWith('@') ? <span key={i} className="ini-ojo">{'█'.repeat(t.length)}</span> : t))}
      </pre>
      <p className="ini-term arriba">[ acceso: concedido ]</p>
      <p className="ini-term abajo">
        root@s4sf:~$ ./dirigir_ia --sin-humo<span className="ini-cursor">_</span>
      </p>
    </div>
  )
}
