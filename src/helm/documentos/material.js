// HELM — material comercial: los PDF de venta que viven en la Biblioteca.
//
// No hay tabla ni bucket nuevos. Un documento de `helm_library` es material
// comercial cuando lleva la etiqueta `comercial` (la columna `tags`, que ya
// existía) y el archivo es un PDF. El perfil es `client_id`: la Biblioteca
// no tiene `profile_id`, y cada consulta filtra por el perfil abierto.

export const TAG_COMERCIAL = 'comercial'

// `tags` llega como array (jsonb). También se acepta el texto del formulario
// de la Biblioteca («ventas, onboarding») y un array serializado.
export function etiquetas(docOTags) {
  const tags = docOTags && typeof docOTags === 'object' && !Array.isArray(docOTags)
    ? docOTags.tags
    : docOTags
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean)
  if (typeof tags === 'string') {
    const s = tags.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s)
        if (Array.isArray(p)) return p.map(t => String(t).trim()).filter(Boolean)
      } catch { /* texto suelto, se parte por comas */ }
    }
    return s.split(',').map(t => t.trim()).filter(Boolean)
  }
  return []
}

const esTagComercial = (t) => String(t).trim().toLowerCase() === TAG_COMERCIAL

export function esComercial(doc) {
  return etiquetas(doc).some(esTagComercial)
}

function acabaEnPdf(nombre) {
  const base = String(nombre || '').split('?')[0].split('#')[0].split('/').pop()
  return /\.pdf$/i.test(base)
}

export function esPdf(doc) {
  return acabaEnPdf(doc?.file_name) || acabaEnPdf(doc?.file_url)
}

// Hace falta enlace: sin archivo no hay nada que abrir, aunque lleve la etiqueta.
export function esMaterialComercial(doc) {
  return Boolean(String(doc?.file_url || '').trim()) && esComercial(doc) && esPdf(doc)
}

// Añade o quita la etiqueta sin duplicarla y sin tocar el resto.
export function conEtiqueta(tags, tag, on) {
  const canon = String(tag).trim()
  const sin = etiquetas(tags).filter(t => t.toLowerCase() !== canon.toLowerCase())
  return on ? [...sin, canon] : sin
}

/**
 * El enlace que se puede abrir.
 *
 * Un archivo del bucket `helm` lleva el perfil en la ruta
 * (`/helm/<client_id>/…`). Si apunta a otro perfil, no se devuelve: cada
 * negocio solo abre su material. Un enlace externo (Drive, por ejemplo) no
 * lleva esa ruta y se respeta, que es lo que ya hace la Biblioteca con
 * `file_url`.
 */
export function enlaceDelPerfil(doc, clientId) {
  const url = String(doc?.file_url || '').trim()
  if (!url || !clientId) return ''
  const marca = '/helm/'
  const i = url.indexOf(marca)
  if (i === -1) return url
  let perfil = url.slice(i + marca.length).split('/')[0] || ''
  try { perfil = decodeURIComponent(perfil) } catch { /* se compara tal cual */ }
  if (perfil && perfil.toLowerCase() !== String(clientId).toLowerCase()) return ''
  return url
}

// Las pestañas de Documentos. Sin facturación solo queda el material: setter
// y closer no deben ni ver las otras.
export function pestañasDeDocumentos(veFacturacion) {
  const material = { key: 'material', label: 'Material comercial' }
  if (!veFacturacion) return [material]
  return [
    { key: 'factura', label: 'Facturas' },
    { key: 'presupuesto', label: 'Presupuestos' },
    material,
  ]
}
