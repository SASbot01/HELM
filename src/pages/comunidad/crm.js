// Las comunidades — el alta del miembro en el CRM.
//
// La puerta de datos (Puerta.jsx) pide nombre, correo y profesión, y los
// ingresos al mes en las comunidades que los quieren (cfg.puerta.datos.ingresos).
// Entran en HELM como un contacto del perfil de la
// comunidad; cuál es ese perfil lo decide el servidor con su lista cerrada
// (api/_lib/comunidades.js): aquí solo se dice de qué comunidad viene.
//
//   · quien entra por una guía en PDF → su embudo «Lead magnet»
//   · quien entra por cualquier otro hilo → «Página de inicio»
//
// La escritura la hace el servidor (api/leads.js · miembro).
import { pideLead } from '../leads.js'
import { origen } from '../inicio/socio/origen.js'

/**
 * Da de alta (o actualiza) a quien deja sus datos en la comunidad `cfg`. Si
 * el correo ya existe en el perfil, el servidor lo actualiza sin cambiarle de
 * embudo ni de etapa.
 */
export async function altaMiembro(cfg, { nombre, email, profesion, ingresos, pipeline, nota, website = '' }) {
  const correo = String(email || '').trim().toLowerCase()
  if (!correo) throw new Error('Falta el correo')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Revisa el correo')
  const tramos = cfg.puerta.datos.ingresos
  if (tramos && !Object.hasOwn(tramos, String(ingresos))) throw new Error('Elige tus ingresos')
  return pideLead('miembro', {
    comunidad: cfg.clave, nombre, email: correo, profesion, ...(tramos ? { ingresos } : {}), pipeline, nota, website, origen: origen(),
  }, cfg.apiBase)
}

/**
 * Deja una línea en las notas del contacto (p. ej. «descargó la guía en PDF»).
 * Solo las que el servidor tiene en su lista (api/leads.js · NOTAS). Nunca
 * lanza: la descarga ya está en marcha y una nota no puede pararla.
 */
export async function anota(cfg, id, texto) {
  if (!id || !texto) return
  try {
    await pideLead('nota', { comunidad: cfg.clave, id, texto }, cfg.apiBase)
  } catch {
    // A propósito en silencio.
  }
}
