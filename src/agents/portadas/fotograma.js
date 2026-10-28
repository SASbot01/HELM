// HELM — copiar el fotograma de un <video> a un canvas, para Portadas (el
// selector de instante) y Trial reels (la vista previa del taller).
//
// Con un vídeo propio entra de todo, también el 4K del móvil: un canvas a su
// tamaño son unos 33 MB, y al mover la barra salen muchos seguidos. En iOS
// Safari, pasado el tope de memoria de canvas, getContext('2d') da null y el
// fotograma se quedaba quieto sin avisar. Por eso:
//   · se copia al tamaño más pequeño que siga CUBRIENDO 1080×1920 (lo que pinta
//     la composición; fotogramaParaIa lo baja después a 720×1280), nunca más
//     grande que el propio vídeo;
//   · dos lienzos que se turnan, siempre los mismos: quien lo recibe guarda el
//     último en su estado y cada captura es un objeto distinto del anterior
//     (React ve el cambio), pero no se crea uno nuevo cada vez;
//   · sin contexto 2D, null: quien llama se queda con el fotograma de antes.

export const MAX_FOTOGRAMA = Object.freeze({ ancho: 1080, alto: 1920 })

/** El tamaño al que se copia un vídeo de w×h (ver arriba), o null si no tiene. PURA. */
export function tamanoFotograma(w, h, max = MAX_FOTOGRAMA) {
  const ancho = Number(w)
  const alto = Number(h)
  if (!(ancho > 0 && alto > 0)) return null
  const esc = Math.min(1, Math.max(max.ancho / ancho, max.alto / alto))
  return { ancho: Math.max(1, Math.round(ancho * esc)), alto: Math.max(1, Math.round(alto * esc)) }
}

/**
 * Un capturador: captura(video) → el canvas con su fotograma, o null (sin
 * imagen todavía o sin contexto 2D). `crea` hace cada lienzo (por defecto, del
 * documento).
 */
export function capturador(crea = () => document.createElement('canvas')) {
  const lienzos = [null, null]
  let turno = 0
  return (video) => {
    const t = tamanoFotograma(video?.videoWidth, video?.videoHeight)
    if (!t) return null
    turno = 1 - turno
    const c = lienzos[turno] || (lienzos[turno] = crea())
    if (c.width !== t.ancho) c.width = t.ancho
    if (c.height !== t.alto) c.height = t.alto
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, t.ancho, t.alto)
    return c
  }
}
