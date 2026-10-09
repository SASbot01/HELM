// HELM — «Estudio de Instagram»: los scorers deterministas, para el panel.
//
//   POST  { action: 'gancho',  texto }                 → puntúa el gancho (5 propiedades + fórmula)
//   POST  { action: 'caption', texto, keywords:[] }    → linta la caption (ventana de 125, hashtags…)
//   POST  { action: 'humano',  texto }                 → humaniza (quita el olor a IA) + detecta
//   POST  { action: 'beats',   texto, objetivo }       → cronometra el guion por beats
//   POST  { action: 'rubrica' }                        → la rúbrica de perfil (12 ítems /100)
//
// Son funciones PURAS (api/_lib/ig-calidad.js): solo procesan el texto que se
// envía, no leen datos del negocio, ni la base de datos, ni ninguna clave. Por
// eso no exige sesión; va con límite de peticiones por IP, como /api/aiparatodo.
import { applyCors, rateLimit, getClientIp } from './_lib/auth.js'
import {
  puntuarGancho, clasificaGancho, lintarCaption, humanizar, detectar,
  cronometrar, RUBRICA_PERFIL,
} from './_lib/ig-calidad.js'

const MAX = 20_000 // un guion o una caption larga caben de sobra

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' })

  const gate = rateLimit({ key: `ig-calidad:${getClientIp(req)}`, max: 120, windowMs: 60_000 })
  if (!gate.ok) return res.status(429).json({ error: 'Demasiadas peticiones. Espera un minuto.' })

  try {
    const body = req.body || {}
    const action = String(body.action || '')
    const texto = String(body.texto || '').slice(0, MAX)
    const keywords = Array.isArray(body.keywords) ? body.keywords.map(k => String(k).slice(0, 60)).slice(0, 10) : []

    if (action === 'rubrica') return res.status(200).json({ rubrica: RUBRICA_PERFIL })

    if (!texto.trim()) return res.status(400).json({ error: 'Falta el texto.' })

    switch (action) {
      case 'gancho': {
        const r = puntuarGancho(texto)
        return res.status(200).json({ ...r, formula: clasificaGancho(texto) })
      }
      case 'caption':
        return res.status(200).json(lintarCaption(texto, { keywords }))
      case 'humano': {
        const limpio = humanizar(texto)
        // La nota del antes y del después, para enseñar la mejora.
        const deteccion = detectar(texto, limpio.limpio)
        const antes = detectar(texto)
        return res.status(200).json({ ...limpio, deteccion, antes: { score: antes.score, veredicto: antes.veredicto } })
      }
      case 'beats': {
        const objetivo = Math.min(Math.max(Number(body.objetivo) || 30, 5), 180)
        return res.status(200).json(cronometrar(texto, objetivo))
      }
      default:
        return res.status(400).json({ error: `Acción desconocida: ${action}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
