// HELM — lo que queda de los créditos.
//
// Desde el 7-nov-2026 HELM no cobra por el uso: cada agencia paga una licencia
// anual (./licencia.js) y pone su propia clave de Claude. Ningún trabajo se
// cobra ya, y ninguno se para por falta de saldo.
//
// Los agentes que cobraban a precio fijo (Editor de reels, Portadas con IA,
// Trial reels) siguen llamando a estas funciones: aquí contestan lo mismo que
// contestaban para la agencia de la casa, que nunca pagó («este perfil no
// paga»), así que su camino es el de siempre, ya probado. Cuando se limpien
// esos agentes, este archivo se puede borrar entero (y con él el saldo de
// agencias y agencia_movimientos, que quedan solo como histórico).
//
// Lo único que hace algo de verdad es conCerrojoAgencia: además de cobrar,
// pone en fila lo que se lanza a la vez en una agencia (los topes de «dos a la
// vez por perfil» del Editor van dentro).
import { PRECIOS_FIJOS, precioEditor } from '../../src/helm/precios.js'

export { PRECIOS_FIJOS, precioEditor }

/** Nadie paga: null («este perfil no paga»). */
export async function quienPagaPerfil() {
  return null
}

/** Ningún trabajo necesita saldo: nunca lanza. */
export async function exigirImporte() {
  return { paga: false, saldo: null }
}

/** Lo que ve la pantalla de un agente: no paga, sin saldo. */
export async function preciosDelPerfil() {
  return { paga: false, saldo: null, precios: PRECIOS_FIJOS }
}

/** No se cobra: null («no se ha cobrado ahora», y quienPagaPerfil dice que nadie paga). */
export async function cobrarFijo() {
  return null
}

/** Nada se ha cobrado con ninguna referencia. */
export async function cobradoYa() {
  return null
}

/** Nada queda apartado. */
export async function apartadoDeAgencia() {
  return 0
}

/** Nada que apartar: devuelve un liberar() que no hace nada. */
export function reservaTemporal() {
  return () => {}
}

// Un cerrojo por agencia, el MISMO para todos los agentes de este proceso.
const cerrojos = new Map() // clave -> la cola de turnos

/**
 * Ejecuta `fn` de uno en uno por agencia: comprobar el saldo (exigirImporte) y
 * dejar el trabajo apartado (la fila en marcha, o reservaTemporal) van dentro,
 * juntos, para que dos peticiones casi a la vez (del mismo agente o de dos
 * distintos) no pasen las dos con el saldo de una. Devuelve lo que devuelva
 * `fn` (y lanza lo que lance; el turno se suelta igual).
 *
 * Sin agencia no espera (nadie paga); quien quiera serializar igualmente un
 * perfil sin agencia puede pasar su clientId. No se anida con la misma clave:
 * esperaría a sí mismo. Y dentro no va lo largo (subir, generar, montar): solo
 * comprobar y apartar.
 *
 * Uso:
 *   const agenciaId = await agenciaDe(clientId)   // de ./access.js
 *   await conCerrojoAgencia(agenciaId, async () => {
 *     await exigirImporte(clientId, precio, { detalle: verSaldo })
 *     await supabase.from(TABLA).insert({ …, estado: 'en_cola', precio_eur: precio })
 *   })
 */
export async function conCerrojoAgencia(agenciaId, fn) {
  if (!agenciaId) return fn()
  const clave = String(agenciaId)
  const antes = cerrojos.get(clave) || Promise.resolve()
  let suelta
  const mio = new Promise(ok => { suelta = ok })
  const cola = antes.then(() => mio)
  cerrojos.set(clave, cola)
  await antes
  try {
    return await fn()
  } finally {
    suelta()
    if (cerrojos.get(clave) === cola) cerrojos.delete(clave)
  }
}

