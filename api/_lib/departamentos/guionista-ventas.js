// HELM — Guionista de ventas (departamento Contenido).
//
// El guionista del Equipo escribe hoy eligiendo los temas por VISITAS. Este
// agente de departamento le prepara lo que de verdad importa: qué temas han
// traído VENTAS COBRADAS, no solo vistas. Para eso une cada reel con los leads
// (crm_contacts) y las ventas (sales) que llegaron con SU atribución:
//
//   · por el utm_content / utm_campaign que lleva el shortcode o el media_id
//     del reel (el que se pega en el enlace del anuncio o de la bio), o
//   · por la palabra del «comenta PALABRA» del caption, si algún lead o venta
//     llega con esa palabra en un UTM.
//
// Por cercanía temporal NO se atribuye: que un reel se publique el día que entra
// una venta no prueba que la trajera. Si no hay UTM que case con ningún reel, no
// hay atribución posible y se dice qué falta (poner utm_content en los enlaces).
//
// La conclusión se guarda en la memoria del perfil como nota del 'guionista'
// (tipo 'aprendido', clave 'ventas/temas'), que es la que lee el guionista del
// Equipo (api/_lib/equipo.js, memoriaTexto → «Lo aprendido»). No llama a la IA:
// es un cálculo sobre lo que HELM ya tiene.

// Cuánto hacia atrás se miran ventas y leads.
const VENTANA_DIAS = 180
// Cuántos temas entran en la conclusión.
const TOP_TEMAS = 5

const diaISO = (d) => new Date(d).toISOString().slice(0, 10)
const haceDias = (hoy, n) => { const d = new Date(hoy); d.setUTCDate(d.getUTCDate() - n); return diaISO(d) }
const norm = (s) => String(s ?? '').trim().toLowerCase()

/** El shortcode de un permalink de Instagram (/reel/XXXX, /p/XXXX, /tv/XXXX). */
export function shortcodeDe(permalink) {
  const m = String(permalink || '').match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i)
  return m ? m[1].toLowerCase() : ''
}

/** La palabra del «comenta PALABRA» de un caption, en minúsculas, o ''. */
export function palabraComenta(caption) {
  const m = String(caption || '').match(/comenta\s*[:«"“']?\s*([\p{L}\p{N}]{2,30})/iu)
  return m ? m[1].toLowerCase() : ''
}

// Las "claves" por las que un reel puede aparecer en un UTM: las fuertes
// (shortcode, media_id) casan exactas o como subcadena; la palabra, solo exacta.
function clavesDeReel(reel) {
  const fuertes = [shortcodeDe(reel.permalink), norm(reel.media_id)].filter(k => k.length >= 5)
  return { fuertes: [...new Set(fuertes)], palabra: palabraComenta(reel.caption) }
}

function utmCasaReel(utms, claves) {
  const vals = utms.map(norm).filter(Boolean)
  if (!vals.length) return false
  if (claves.palabra && vals.includes(claves.palabra)) return true
  return claves.fuertes.some(k => vals.some(v => v === k || v.includes(k)))
}

// Cuánto se ha COBRADO de una venta. `cash_collected` manda; si no está, solo
// cuenta el importe cuando la venta figura como cobrada/completada.
export function cobradoDe(venta) {
  if (venta.cash_collected != null && venta.cash_collected !== '') return Number(venta.cash_collected) || 0
  return /complet|cobrad|won|pagad/i.test(String(venta.status || '')) ? (Number(venta.revenue) || 0) : 0
}

// El tema de un reel, para agrupar: la primera línea del caption, recortada.
function temaDe(caption) {
  const linea = String(caption || '').split('\n').map(s => s.trim()).find(Boolean) || ''
  return linea.replace(/\s+/g, ' ').slice(0, 70) || '(sin título)'
}

/**
 * Une cada reel con sus leads y ventas cobradas por atribución UTM. Puro: no
 * toca la base. → [{ reel, tieneClave, leads, ventas, ingresos, visitas }]
 * Lo comparte el agente de anuncios para buscar el mejor reel orgánico.
 */
export function atribuyeReels({ reels = [], ventas = [], contactos = [] } = {}) {
  return reels.map(reel => {
    const claves = clavesDeReel(reel)
    const cobradas = ventas.filter(v => cobradoDe(v) > 0 && utmCasaReel([v.utm_content, v.utm_campaign], claves))
    const leads = contactos.filter(c => utmCasaReel([c.utm_content, c.utm_campaign], claves))
    return {
      reel,
      tieneClave: claves.fuertes.length > 0 || Boolean(claves.palabra),
      leads: leads.length,
      ventas: cobradas.length,
      ingresos: Math.round(cobradas.reduce((t, v) => t + cobradoDe(v), 0)),
      visitas: Number(reel.visitas) || 0,
    }
  })
}

// El ranking de temas por ventas cobradas (y, en empate, por leads).
function rankingTemas(filas) {
  const porTema = new Map()
  for (const f of filas) {
    if (!f.ventas && !f.leads) continue
    const t = temaDe(f.reel.caption)
    const g = porTema.get(t) || { tema: t, reels: 0, leads: 0, ventas: 0, ingresos: 0 }
    g.reels += 1; g.leads += f.leads; g.ventas += f.ventas; g.ingresos += f.ingresos
    porTema.set(t, g)
  }
  return [...porTema.values()].sort((a, b) => b.ingresos - a.ingresos || b.ventas - a.ventas || b.leads - a.leads)
}

const eur = (n) => Math.round(Number(n) || 0).toLocaleString('es-ES')

// Upsert de la conclusión en la memoria del perfil, como nota del 'guionista'.
async function guardaConclusion(supabase, clientId, contenido) {
  const fila = {
    ambito: 'perfil', client_id: clientId, agente: 'guionista', tipo: 'aprendido',
    clave: 'ventas/temas', contenido: String(contenido).slice(0, 1500), updated_at: new Date().toISOString(),
  }
  const { data: ya, error: eSel } = await supabase.from('agent_memory')
    .select('id').eq('client_id', clientId).eq('clave', 'ventas/temas').maybeSingle()
  if (eSel) throw new Error(eSel.message)
  if (ya) {
    const { error } = await supabase.from('agent_memory').update(fila).eq('id', ya.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('agent_memory').insert(fila)
    if (error) throw new Error(error.message)
  }
}

export default {
  key: 'guionista-ventas',
  departamento: 'contenido',
  async corre(ctx) {
    const { supabase, clientId, hoy } = ctx
    const desde = haceDias(hoy, VENTANA_DIAS)
    const [media, ventas, leads] = await Promise.all([
      supabase.from('helm_ig_media')
        .select('media_id, caption, permalink, visitas, publicado_en, producto')
        .eq('client_id', clientId).order('publicado_en', { ascending: false }).limit(200),
      supabase.from('sales')
        .select('utm_content, utm_campaign, revenue, cash_collected, product, date, status')
        .eq('client_id', clientId).gte('date', desde).limit(2000),
      supabase.from('crm_contacts')
        .select('utm_content, utm_campaign, created_at, status')
        .eq('client_id', clientId).gte('created_at', `${desde}T00:00:00Z`).limit(2000),
    ])
    for (const r of [media, ventas, leads]) if (r.error) throw new Error(r.error.message)

    const reels = (media.data || []).filter(r => r.producto === 'REELS' || !r.producto)
    if (!reels.length) {
      await ctx.log('Este perfil no tiene reels propios: no hay nada que atribuir.')
      return { propuestas: 0, resumen: 'Sin reels propios: nada que atribuir.' }
    }

    const ventasRows = ventas.data || []
    const leadsRows = leads.data || []
    const filas = atribuyeReels({ reels, ventas: ventasRows, contactos: leadsRows })
    const conClave = filas.filter(f => f.tieneClave).length
    const totLeads = filas.reduce((t, f) => t + f.leads, 0)
    const totVentas = filas.reduce((t, f) => t + f.ventas, 0)
    const totIngresos = filas.reduce((t, f) => t + f.ingresos, 0)
    await ctx.log(`Reels: ${reels.length} (${conClave} con shortcode/palabra reconocible). Ventas de ${VENTANA_DIAS} días: ${ventasRows.length}; leads: ${leadsRows.length}. Atribuidos: ${totVentas} ventas cobradas (${eur(totIngresos)} €) y ${totLeads} leads.`)

    // Sin una sola venta ni lead que case con ningún reel: no se puede atribuir.
    // No se inventa por cercanía de fechas; se dice qué falta.
    if (!totVentas && !totLeads) {
      const falta = 'No puedo decir qué tema VENDE: ningún lead ni venta llega con un utm_content/utm_campaign que case con el shortcode o el media_id de un reel, ni con la palabra de un «comenta …». Para medirlo, pon en los enlaces de la bio/CTA un utm_content con el shortcode del reel (o la palabra del «comenta …»). Mientras tanto solo se puede ordenar por visitas, que no es lo mismo que vender.'
      await ctx.log('Sin atribución posible: hace falta utm_content en los enlaces de los reels.')
      return { propuestas: 0, resumen: falta }
    }

    const ranking = rankingTemas(filas)
    const conVentas = ranking.filter(r => r.ventas > 0)
    const base = conVentas.length ? conVentas : ranking
    const top = base.slice(0, TOP_TEMAS)
    const lineas = top.map((r, i) => `${i + 1}. «${r.tema}» — ${r.ventas} ${r.ventas === 1 ? 'venta cobrada' : 'ventas cobradas'}${r.ingresos ? ` (${eur(r.ingresos)} €)` : ''}, ${r.leads} ${r.leads === 1 ? 'lead' : 'leads'}`).join('\n')

    const contenido = conVentas.length
      ? `Temas que MÁS VENDEN (ventas cobradas por atribución UTM, no por visitas). Escribe más sobre estos:\n${lineas}`
      : `Todavía no hay ventas cobradas atribuidas a ningún reel, pero estos temas son los que MÁS LEADS traen (por UTM). Mira cuál acaba cerrando antes de doblar la apuesta:\n${lineas}`
    await guardaConclusion(supabase, clientId, contenido)
    await ctx.log(`Conclusión guardada en la memoria (ventas/temas): ${top.length} ${top.length === 1 ? 'tema' : 'temas'}.`)

    const resumen = conVentas.length
      ? `Lo que vende, no lo que más se ve: ${conVentas.length} ${conVentas.length === 1 ? 'tema' : 'temas'} con ventas cobradas. Líder: «${top[0].tema}» (${top[0].ventas} ventas, ${eur(top[0].ingresos)} €). Guardado para el guionista.`
      : `Sin ventas cobradas atribuidas aún; sí ${totLeads} leads por UTM. Líder en leads: «${top[0].tema}» (${top[0].leads}). Guardado para el guionista.`
    return { propuestas: 0, resumen }
  },
}
