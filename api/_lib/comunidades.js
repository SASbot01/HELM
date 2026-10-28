// HELM — las comunidades públicas (AI para todo, Filmmaking para todo…).
//
// Cada comunidad lee y escribe en UN perfil de HELM, y ese perfil sale SOLO
// de esta lista: el navegador dice de qué comunidad viene (?c=… o
// `comunidad` en el cuerpo) y el servidor busca aquí cuál es su perfil. Nunca
// se acepta un perfil que venga de fuera: convertiría estas puertas públicas en
// una entrada a cualquier CRM de HELM. Añadir una comunidad es añadir una
// entrada aquí, a mano.
//
//   perfil      el slug del perfil de HELM (su CRM, sus noticias, su diario)
//   nombre      cómo firma (notas del CRM, el diario, los avisos)
//   web         dónde vive la comunidad (los enlaces de los avisos)
//   ingresos    los tramos que se aceptan en la puerta de datos
//   profesiones las que se aceptan, si la puerta da opciones; null = texto libre
//   notas       las líneas fijas que el navegador puede pedir para la ficha
//
// Las mismas listas están en la configuración de cada comunidad en el
// navegador (src/pages/<comunidad>/config.jsx); un test comprueba que cuadran.

export const COMUNIDADES = {
  aiparatodo: {
    perfil: 'silvestre',
    nombre: 'AI para todo',
    web: 'https://s4sf.net/aiparatodo',
    ingresos: {
      menos_1000: 'Menos de 1.000 €/mes',
      mas_1000: 'Más de 1.000 €/mes',
    },
    profesiones: null,
    notas: [
      'AI para todo · descargó la guía Mis 8 no negociables (PDF)',
      'AI para todo · descargó la guía Los Mods de Claude (PDF)',
    ],
  },
  // La comunidad de Detrás de Cámara (Abel Casal Díaz). El slug del perfil
  // lleva la errata de cuando se creó («camra»): es el real, no se cambia.
  filmmakingparatodo: {
    perfil: 'detras-de-camra',
    nombre: 'Filmmaking para todo',
    web: 'https://s4sf.net/filmmakingparatodo',
    // TODO-ABEL: tramos propuestos; confirmar con Abel.
    ingresos: {
      menos_500: 'Menos de 500 €/mes',
      de_500_a_1500: 'De 500 a 1.500 €/mes',
      de_1500_a_3000: 'De 1.500 a 3.000 €/mes',
      mas_3000: 'Más de 3.000 €/mes',
    },
    profesiones: {
      freelance: 'Filmmaker freelance',
      bodas: 'Videógrafo de bodas',
      productora: 'En una productora',
      empezando: 'Estoy empezando',
      otra: 'Otra cosa',
    },
    notas: [],
  },
}

/** La comunidad con esa clave, o null. Solo claves propias de la lista: ni
 *  `__proto__`, ni `constructor`, ni nada heredado. */
export function comunidadPorClave(clave) {
  const k = String(clave ?? '')
  return Object.hasOwn(COMUNIDADES, k) ? { clave: k, ...COMUNIDADES[k] } : null
}
