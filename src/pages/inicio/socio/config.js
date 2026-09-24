// Lo que se cambia sin tocar la página, junto y arriba.
//
// Todo lo que depende de la realidad (plazas ocupadas, calendario) sale de
// variables de entorno y NO tiene valor por defecto inventado: si falta, la
// página no lo enseña. Un "3/5" puesto a mano que nadie actualiza es exactamente
// la urgencia falsa que esta página promete no usar.
//
// Recuerda: Vite incrusta las VITE_* al hacer `npm run build`. Cambiar el .env
// sin reconstruir no cambia nada.
const env = import.meta.env

const numero = (v) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const PLAZAS_TOTALES = 5
// null = no configurado → el contador no sale.
export const PLAZAS_OCUPADAS = numero(env.VITE_PLAZAS_OCUPADAS)

// El calendario de la auditoría (Cal.com). Ejemplo: https://cal.com/alexsilvestre/auditoria
// Vacío → el paso del calendario enseña un aviso en vez de un iframe roto.
export const CAL_URL = String(env.VITE_CAL_URL || '').trim()
// Para cambiar la hora desde /gracias. Cal.com manda además un enlace propio de
// cada reserva en el correo de confirmación; este es el genérico.
export const CAL_REPROGRAMAR_URL = String(env.VITE_CAL_REPROGRAMAR_URL || '').trim()

// La foto del hero. [PENDIENTE: foto trabajando / grabando / con un cliente]
// Ruta dentro de public/ en WebP o AVIF, p. ej. /socio/alex-trabajando.webp
export const FOTO_HERO = String(env.VITE_FOTO_HERO || '').trim()

// El vídeo de antes de la llamada en /gracias. [PENDIENTE]
// URL de inserción (YouTube /embed/…, Vimeo player…).
export const VIDEO_GRACIAS = String(env.VITE_VIDEO_GRACIAS || '').trim()

export const HANDLE = 'silvesttre.ia'
export const INSTAGRAM = `https://www.instagram.com/${HANDLE}`

// Titulares del hero. El primero es el que sale por defecto; los otros se
// prueban con ?t=b / ?t=c en el enlace (test A/B), y la variante viaja con
// cada evento y con cada envío del formulario.
export const TITULARES = {
  a: ['Tú pones el producto.', 'Yo monto y llevo todo lo que lo vende.'],
  b: ['Monto con IA el sistema que vende tu formación.', 'Y lo llevo yo.'],
  c: ['Tu producto ya funciona.', 'Te falta el sistema que lo vende sin ti.'],
}

export function varianteTitular() {
  try {
    const t = new URLSearchParams(window.location.search).get('t')
    return t && TITULARES[t] ? t : 'a'
  } catch {
    return 'a'
  }
}

// Dónde guarda el formulario la ficha para /gracias (que marca la llamada en el CRM).
export const LLAVE_SESION = 's4sf.socio'
