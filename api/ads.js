// HELM — Ads (anuncios) con test de 5 días por conversiones UTM. El estudio que
// decide si un ad funciona vive en api/_lib/ads.js y lo cierra el worker.
//
// Acciones:
//   GET    ?action=list     &clientId=                → los ads del perfil (con el progreso del test en curso)
//   POST   ?action=create   { clientId, nombre, … }   → crea un ad en borrador (genera su UTM)
//   POST   ?action=publicar { clientId, id }          → lo marca publicado y arranca el test de 5 días
//   POST   ?action=estado   { clientId, id, estado }  → pausar / reactivar / volver a borrador
//   DELETE ?action=borrar   &clientId=&id=
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { generarUtm, conversionesDe, encolaEstudioAd } from './_lib/ads.js'

const DIAS_TEST = 5
const hoyISO = () => new Date().toISOString().slice(0, 10)
const sumarDia = (dia, n) => { const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diasDesde = (dia) => Math.round((Date.now() - Date.parse(`${dia}T00:00:00Z`)) / 86_400_000)

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const clientId = req.query.clientId || req.body?.clientId || null
  // Un solo perfil por petición: el que se comprueba es el que se usa. Si
  // vienen los dos (URL y cuerpo) y no coinciden, no se adivina cuál vale.
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  try {
    await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  try {
    // GET list — los ads, y para los que están en test el progreso en vivo.
    if (req.method === 'GET' && (action === 'list' || !action)) {
      const { data, error } = await supabase.from('helm_ads').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
      if (error) throw error
      const ads = await Promise.all((data || []).map(async (ad) => {
        if (ad.estado !== 'en_test' || !ad.publicado_en) return ad
        const hasta = sumarDia(ad.publicado_en, DIAS_TEST)
        const c = await conversionesDe(clientId, ad.utm, ad.publicado_en, hasta)
        const dia = Math.min(Math.max(diasDesde(ad.publicado_en) + 1, 1), DIAS_TEST)
        return { ...ad, progreso: { dia, de: DIAS_TEST, leads: c.leads, ventas: c.ventas, ingresos: c.ingresos } }
      }))
      return res.status(200).json({ ads })
    }

    // POST create — un ad nuevo en borrador, con su UTM.
    if (req.method === 'POST' && action === 'create') {
      const { nombre, plataforma, objetivo, presupuesto, gasto, utm } = req.body || {}
      if (!nombre?.trim()) return res.status(400).json({ error: 'El ad necesita un nombre' })
      const fila = {
        client_id: clientId,
        nombre: nombre.trim().slice(0, 200),
        plataforma: plataforma || null,
        objetivo: objetivo ? String(objetivo).slice(0, 500) : null,
        presupuesto: presupuesto != null && presupuesto !== '' ? Number(presupuesto) : null,
        gasto: gasto != null && gasto !== '' ? Number(gasto) : null,
        utm: (String(utm || '').trim() || generarUtm(nombre)).slice(0, 80),
        estado: 'borrador',
      }
      const { data, error } = await supabase.from('helm_ads').insert(fila).select('*').single()
      if (error) throw error
      return res.status(200).json({ ad: data })
    }

    // POST gasto — apunta (o borra) el gasto real del anuncio. Es lo que el
    // agente de anuncios usa para el coste por lead y por venta cobrada.
    if (req.method === 'POST' && action === 'gasto') {
      const { id, gasto } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const valor = gasto != null && gasto !== '' ? Number(gasto) : null
      if (valor != null && (!Number.isFinite(valor) || valor < 0)) return res.status(400).json({ error: 'gasto inválido' })
      const { data, error } = await supabase.from('helm_ads')
        .update({ gasto: valor, updated_at: new Date().toISOString() })
        .eq('id', id).eq('client_id', clientId).select('*').single()
      if (error) throw error
      return res.status(200).json({ ad: data })
    }

    // POST publicar — marca el ad publicado hoy y encola el cierre del test a 5 días.
    if (req.method === 'POST' && action === 'publicar') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const { data, error } = await supabase.from('helm_ads')
        .update({ publicado_en: hoyISO(), estado: 'en_test', veredicto: null, estudio: null, updated_at: new Date().toISOString() })
        .eq('id', id).eq('client_id', clientId).select('*').single()
      if (error) throw error
      await encolaEstudioAd(id, clientId, new Date(Date.now() + DIAS_TEST * 86_400_000).toISOString())
      return res.status(200).json({ ad: data })
    }

    // POST estado — pausar, reactivar o devolver a borrador.
    if (req.method === 'POST' && action === 'estado') {
      const { id, estado } = req.body || {}
      if (!id || !['pausado', 'en_test', 'borrador'].includes(estado)) return res.status(400).json({ error: 'estado inválido' })
      const { data, error } = await supabase.from('helm_ads').update({ estado, updated_at: new Date().toISOString() }).eq('id', id).eq('client_id', clientId).select('*').single()
      if (error) throw error
      return res.status(200).json({ ad: data })
    }

    // DELETE borrar
    if (req.method === 'DELETE' && action === 'borrar') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const { error } = await supabase.from('helm_ads').delete().eq('id', id).eq('client_id', clientId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Acción no reconocida' })
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}
