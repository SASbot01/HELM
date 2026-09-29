// El fondo de la página de la bio de Alex: una figura encapuchada en ASCII,
// sin cara y con dos ojos rojos, sobre negro y granate. El aire es de hacker /
// pantera; la figura es propia (generada de una silueta, ver capucha.txt), no
// la máscara de ninguna serie.
//
// Es decoración pura: aria-hidden, sin eventos y detrás de todo. En capucha.txt
// la `@` marca los ojos: se pintan aparte, como bloques sólidos, para que
// brillen.
import arte from './capucha.txt?raw'

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
