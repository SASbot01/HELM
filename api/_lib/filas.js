// PostgREST corta cada respuesta en 1000 filas (max_rows en
// supabase/config.toml) y sin avisar. Lo que tiene que verlo TODO para decidir
// (quién puede ver qué, a qué perfil se refiere un nombre) lee por páginas.
const PASO = 1000

/** Todas las filas de una consulta. `hacer` crea la consulta de cero en cada
 *  página (un builder de Supabase no se puede reutilizar) y debe ordenar por
 *  algo único (el id): con un orden con empates, entre páginas una fila podría
 *  salir dos veces o ninguna. */
export async function todasLasFilas(hacer) {
  const filas = []
  for (let desde = 0; ; desde += PASO) {
    const { data, error } = await hacer().range(desde, desde + PASO - 1)
    if (error) throw error
    filas.push(...(data || []))
    if ((data || []).length < PASO) return filas
  }
}
