// Marcador de un dato que falta: [PENDIENTE: …].
//
// Se ve en local (localhost) y con ?pendientes=1 en cualquier sitio, para
// poder revisar la página en el servidor antes de publicarla. En producción,
// sin el parámetro, NO se pinta: un "[PENDIENTE]" delante de un cliente es peor
// que un hueco. `siempre` fuerza a enseñarlo (páginas legales: ahí el hueco
// tampoco vale, y es mejor que se vea que falta).
//
// Cómo encontrarlos todos:  grep -rn "PENDIENTE\|REVISAR" src/
function mostrarPendientes() {
  try {
    const { hostname, search } = window.location
    if (new URLSearchParams(search).has('pendientes')) {
      sessionStorage.setItem('s4sf.pendientes', '1')
      return true
    }
    return hostname === 'localhost' || hostname === '127.0.0.1'
      || sessionStorage.getItem('s4sf.pendientes') === '1'
  } catch {
    return false
  }
}

const hayPendientesVisibles = mostrarPendientes()

export default function Pendiente({ children, bloque = false, siempre = false }) {
  if (!siempre && !hayPendientesVisibles) return null
  const Tag = bloque ? 'div' : 'span'
  return <Tag className={`so-pendiente${bloque ? ' bloque' : ''}`}>[PENDIENTE: {children}]</Tag>
}
