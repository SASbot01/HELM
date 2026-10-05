// HELM — la vuelta del permiso de Instagram, en su propia ruta.
//
// Existe por una diferencia tonta pero bloqueante entre Google y Meta: Google
// acepta como redirect una URL con parámetros (`/api/google?action=callback`),
// y Meta no. En el panel de la app, el campo de "URI de redireccionamiento
// válidos" rechaza cualquier cosa con `?`, así que la vuelta necesita una ruta
// limpia.
//
// Aquí no hay lógica: se le pone la acción a la petición y se la pasa al
// handler de siempre, que es donde vive todo (api/instagram.js). Duplicar el
// intercambio del código en dos sitios sería la forma más rápida de que un día
// arreglemos uno y no el otro.
import handler from '../instagram.js'

export default async function callback(req, res) {
  req.query = { ...(req.query || {}), action: 'callback' }
  return handler(req, res)
}
