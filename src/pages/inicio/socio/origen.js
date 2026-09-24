// De dónde vino la persona: UTM y la palabra clave del Reel (?k=mecanismo).
//
// Se guarda en sessionStorage la PRIMERA vez que entra, porque la URL con los
// parámetros solo existe en la primera página: si luego pasa por /clase o
// recarga, el origen tiene que seguir siendo el Reel y no "directo".
const LLAVE = 's4sf.origen'
const CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'k']

let cache = null

export function origen() {
  if (cache) return cache
  let guardado = null
  try { guardado = JSON.parse(sessionStorage.getItem(LLAVE) || 'null') } catch { /* incógnito */ }

  const p = new URLSearchParams(window.location.search)
  const deLaUrl = {}
  for (const c of CAMPOS) {
    const v = p.get(c)
    if (v) deLaUrl[c] = v.slice(0, 120)
  }

  // Si la URL trae algo, manda la URL (es una visita nueva desde otro enlace).
  cache = Object.keys(deLaUrl).length ? deLaUrl : (guardado || {})
  try { sessionStorage.setItem(LLAVE, JSON.stringify(cache)) } catch { /* da igual */ }
  return cache
}
