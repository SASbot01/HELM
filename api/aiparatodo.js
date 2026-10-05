// AI para todo — lo que la comunidad pública lee de HELM.
//
//   GET ?action=noticias   → las noticias que el agente de noticias
//                            (api/_lib/noticias.js) deja cada mañana en el
//                            perfil silvestre, las de los últimos 30 días
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

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' })

  const gate = rateLimit({ key: `aiparatodo:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
  if (!gate.ok) return res.status(429).json({ error: 'Demasiadas peticiones. Espera un minuto.' })

  try {
    const accion = String(req.query?.action || '')
    if (accion !== 'noticias') return res.status(400).json({ error: `Acción desconocida: ${accion}` })

    const { data: perfil, error: ePerfil } = await supabase
      .from('clients').select('id').eq('slug', PERFIL).maybeSingle()
    if (ePerfil) throw ePerfil
    if (!perfil) return res.status(200).json({ hoy: diaMadrid(), noticias: [] })

    const desde = diaMadrid(new Date(Date.now() - DIAS * 86_400_000))
    const { data, error } = await supabase.from('helm_noticias')
      .select('fecha, puesto, tema, titular, resumen, por_que, url, fuente, publicado_en')
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
