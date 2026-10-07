// AI para todo — lo que la comunidad pública lee de HELM.
//
//   GET ?action=noticias   → las noticias que el agente de noticias
//                            (api/_lib/noticias.js) deja cada mañana en el
//                            perfil silvestre, las de los últimos 30 días
//   GET ?action=articulos  → el diario: los artículos publicados por la
//                            redacción (api/_lib/redaccion.js), sin el cuerpo
//   GET ?action=articulo&slug=  → un artículo entero
//
// Sin sesión: lo llama cualquiera desde s4sf.net/aiparatodo/news. Por eso no
// se abre la tabla a la clave pública (helm_noticias sigue siendo solo de la
// clave de servicio): aquí se lee UN perfil fijo y se devuelven SOLO los campos
// que se publican. Lo demás del perfil no sale nunca por esta puerta.
//
// Para que haya noticias, el perfil silvestre tiene que tener encendida la
// sección «Noticias» en HELM (Secciones): sin eso el worker no las genera.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import { diaMadrid } from './_lib/noticias.js'

const PERFIL = 'silvestre'
const DIAS = 30
const CAMPOS_LISTA = 'slug, fecha, edicion, tema, titular, subtitulo, imagen_url, imagen_alt, imagen_credito, lectura_min, publicado_en'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' })

  const gate = rateLimit({ key: `aiparatodo:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
  if (!gate.ok) return res.status(429).json({ error: 'Demasiadas peticiones. Espera un minuto.' })

  try {
    const accion = String(req.query?.action || '')
    if (!['noticias', 'articulos', 'articulo'].includes(accion)) return res.status(400).json({ error: `Acción desconocida: ${accion}` })

    const { data: perfil, error: ePerfil } = await supabase
      .from('clients').select('id').eq('slug', PERFIL).maybeSingle()
    if (ePerfil) throw ePerfil
    if (!perfil) return res.status(accion === 'articulo' ? 404 : 200).json({ hoy: diaMadrid(), noticias: [], articulos: [] })

    // El diario. Solo lo publicado: lo que el verificador retuvo no sale.
    if (accion === 'articulos') {
      const { data, error } = await supabase.from('aip_articulos')
        .select(CAMPOS_LISTA).eq('client_id', perfil.id).eq('estado', 'publicado')
        // Por día y edición ('tarde' > 'manana'): si la de tarde sale antes
        // que la de mañana (un reintento), la portada sigue en su orden.
        .order('fecha', { ascending: false }).order('edicion', { ascending: false })
        .order('publicado_en', { ascending: false }).limit(60)
      if (error) throw error
      res.setHeader('Cache-Control', 'public, max-age=120')
      return res.status(200).json({ hoy: diaMadrid(), articulos: data || [] })
    }
    if (accion === 'articulo') {
      const slug = String(req.query?.slug || '').slice(0, 120)
      if (!/^[a-z0-9-]+$/.test(slug)) return res.status(404).json({ error: 'Ese artículo no existe' })
      const { data, error } = await supabase.from('aip_articulos')
        .select(`${CAMPOS_LISTA}, cuerpo, claves, que_significa, fuentes, imagen_origen`)
        .eq('client_id', perfil.id).eq('estado', 'publicado').eq('slug', slug).maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Ese artículo no existe' })
      res.setHeader('Cache-Control', 'public, max-age=300')
      return res.status(200).json({ articulo: data })
    }

    const desde = diaMadrid(new Date(Date.now() - DIAS * 86_400_000))
    const { data, error } = await supabase.from('helm_noticias')
      // Sin `por_que`: esa nota se escribe PARA el creador («qué vídeo saldría de
      // aquí») con la biblia privada del perfil delante. No es para el público.
      .select('fecha, puesto, tema, titular, resumen, url, fuente, publicado_en')
      .eq('client_id', perfil.id).gte('fecha', desde)
      .order('fecha', { ascending: false }).order('puesto')
    if (error) throw error

    // Cinco minutos en la caché del navegador y del túnel: salen una vez al día.
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({ hoy: diaMadrid(), noticias: data || [] })
  } catch (e) {
    console.error('[aiparatodo]', e?.message || e)
    return res.status(500).json({ error: 'No se han podido cargar las noticias' })
  }
}
