// HELM — de quién es la petición que se está atendiendo.
//
// El cobro de créditos ocurre muy abajo (en la llamada a Claude), y la sesión
// se valida muy arriba (en cada endpoint). En vez de pasar la agencia y el
// perfil de mano en mano por decenas de funciones, cada petición lleva su
// propia cajita: la rellenan validateAuth y requireProfileAccess, y la lee
// quien cobra. AsyncLocalStorage la mantiene separada aunque haya muchas
// peticiones a la vez.
//
// Fuera de una petición (el worker, un script) no hay cajita salvo que se abra
// con `enContexto`.
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage()

/** Ejecuta `fn` con su propio contexto ({ agenciaId, clientId, origen }). */
export function enContexto(inicial, fn) {
  return als.run({ ...inicial }, fn)
}

/** El contexto de la petición en curso, o null si no hay. */
export function contexto() {
  return als.getStore() || null
}

/** Apunta datos en el contexto en curso (si lo hay). */
export function anotar(datos) {
  const c = als.getStore()
  if (!c) return
  for (const [k, v] of Object.entries(datos)) if (v != null) c[k] = v
}
