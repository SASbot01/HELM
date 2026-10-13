// Las comunidades — lo que no es un componente: el contexto con la
// configuración, fechas, anclas y lo que se pide a la API.
//
// Cada comunidad (AI para todo, Filmmaking para todo…) es una configuración
// que se le pasa a Comunidad.jsx. Las páginas la leen con useComunidad().
import { createContext, useContext, useEffect, useState } from 'react'

export const ComunidadCtx = createContext(null)
export const useComunidad = () => useContext(ComunidadCtx)

export const seccionPorClave = (cfg, k) => cfg.secciones.find(s => s.key === k)
export const temaNombre = (cfg, k) => seccionPorClave(cfg, 'news')?.temas.find(t => t.key === k)?.nombre || k

export const fechaCorta = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
export const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
export const recorta = (t, n) => (String(t).length > n ? `${String(t).slice(0, n).replace(/\s+\S*$/, '')}…` : t)
export const ancla = (texto, i) => `s-${i}-${String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`
export const sinComillas = (t) => String(t || '').trim().replace(/^[«"“'‘]+|[»"”'’]+$/g, '')

// Las breves llevan de slug «fecha-puesto»; los artículos, «fecha-titular».
export const esBreve = (slug) => /^\d{4}-\d{2}-\d{2}-\d$/.test(String(slug))

export const EDICION = { manana: 'Edición de mañana', mediodia: 'Edición de mediodía', tarde: 'Edición de tarde' }
export const ahoraMadrid = () => {
  const f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  return f.charAt(0).toUpperCase() + f.slice(1)
}
/** La edición que toca a esta hora de Madrid: la última que ya ha empezado
 *  (`ediciones` en orden, con la hora a la que empieza cada una). */
export const edicionAhora = (ediciones) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const e = [...ediciones].reverse().find(x => h >= x.desde) || ediciones[0]
  return EDICION[e.clave]
}

export function accesoGuardado(llave) {
  try { return JSON.parse(localStorage.getItem(llave) || 'null') } catch { return null }
}

// ── La API de la comunidad ──────────────────────────────────────────────────
// AI para todo sigue en /api/aiparatodo; las demás van por
// /api/comunidad?c=<clave>, que solo conoce las comunidades de su lista.
const url = (api, accion, slug) =>
  `${api}${api.includes('?') ? '&' : '?'}action=${accion}${slug != null ? `&slug=${encodeURIComponent(slug)}` : ''}`

// Una sola petición por visita: la lista y el hilo leen de la misma promesa.
// 'error' y no []: «no hay» y «no se ha podido cargar» no son lo mismo, y un
// enlace compartido no debe redirigir por un fallo de red.
const enCurso = new Map()
function pide(clave, direccion, saca) {
  if (!enCurso.has(clave)) {
    enCurso.set(clave, fetch(direccion)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(saca)
      .catch(() => { enCurso.delete(clave); return 'error' }))
  }
  return enCurso.get(clave)
}

/** Las breves de la mañana del agente de noticias de HELM. */
export const pideNoticias = (api) => pide(`noticias ${api}`, url(api, 'noticias'), d =>
  (Array.isArray(d?.noticias) ? d.noticias : []).map(n => ({
    ...n, seccion: 'news', slug: `${n.fecha}-${n.puesto}`, titulo: n.titular,
  })))

/** El diario: los artículos de la redacción, sin el cuerpo. */
export const pideArticulos = (api) => pide(`articulos ${api}`, url(api, 'articulos'), d =>
  (Array.isArray(d?.articulos) ? d.articulos : []))

export function useNoticias(api, activo = true) {
  const [lista, setLista] = useState(null)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    pideNoticias(api).then(l => { if (vivo) setLista(l) })
    return () => { vivo = false }
  }, [api, activo])
  return lista
}

export function useArticulos(api) {
  const [lista, setLista] = useState(null)
  useEffect(() => {
    let vivo = true
    pideArticulos(api).then(l => { if (vivo) setLista(l) })
    return () => { vivo = false }
  }, [api])
  return lista
}

/** null mientras carga · el artículo · 'no' si no existe · 'error' si falla la red. */
export function useArticulo(api, slug) {
  // Se guarda con su slug: al pasar a otra pieza, la anterior no se pinta ni
  // un instante mientras llega la nueva.
  const [r, setR] = useState({ slug: null, valor: null })
  useEffect(() => {
    let vivo = true
    fetch(url(api, 'articulo', slug))
      .then(x => (x.status === 404 || x.status === 400 ? 'no' : x.ok ? x.json().then(d => d.articulo || 'no') : 'error'))
      .catch(() => 'error')
      .then(valor => { if (vivo) setR({ slug, valor }) })
    return () => { vivo = false }
  }, [api, slug])
  return r.slug === slug ? r.valor : null
}
