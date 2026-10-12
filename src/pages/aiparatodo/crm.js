// AI para todo — el alta del miembro en el CRM.
//
// Para leer cualquier hilo (skills, noticias, capítulos de la guía o la guía
// en PDF de los no negociables) se piden cuatro datos: nombre, correo,
// profesión e ingresos al mes. Entran en HELM como un contacto del perfil
// silvestre, igual que el resto de páginas públicas:
//
//   · quien entra por la guía en PDF («No negociables») → embudo «Lead magnet»
//   · quien entra por cualquier otro hilo               → embudo «Página de inicio»
//
// La profesión y los ingresos van en custom_fields.aiparatodo y en las notas,
// para que se vean en la ficha sin abrir nada.
//
// La escritura la hace el servidor (api/leads.js · miembro).
import { pideLead } from '../leads.js'
import { origen } from '../inicio/socio/origen.js'

export const PIPELINE_COMUNIDAD = 'Página de inicio'
// Lo crea migrations/092_silvestre_lead_magnet_pipeline.sql.
export const PIPELINE_LEAD_MAGNET = 'Lead magnet'

export const INGRESOS = {
  menos_1000: 'Menos de 1.000 €/mes',
  mas_1000: 'Más de 1.000 €/mes',
}

/**
 * Da de alta (o actualiza) a quien deja sus datos.
 *
 *   · Si el correo ya existe en el perfil, se actualiza en vez de duplicar, y
 *     NUNCA se le cambia de embudo ni de etapa: un contacto sin embudo ya está
 *     en el de ventas por defecto, y leer un hilo no devuelve a nadie a la
 *     casilla de salida.
 *   · Si el embudo todavía no existe, el contacto entra igual, sin embudo.
 */
export async function altaMiembro({ nombre, email, profesion, ingresos, pipeline, nota }) {
  const correo = String(email || '').trim().toLowerCase()
  if (!correo) throw new Error('Falta el correo')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Revisa el correo')
  if (!INGRESOS[ingresos]) throw new Error('Elige tus ingresos')
  return pideLead('miembro', { nombre, email: correo, profesion, ingresos, pipeline, nota, origen: origen() })
}

/**
 * Deja una línea en las notas del contacto (p. ej. «descargó la guía en PDF»).
 * Solo las que el servidor tiene en su lista (api/leads.js · NOTAS).
 * Nunca lanza: la descarga ya está en marcha y una nota no puede pararla.
 */
export async function anota(id, texto) {
  if (!id || !texto) return
  try {
    await pideLead('nota', { id, texto })
  } catch {
    // A propósito en silencio.
  }
}
