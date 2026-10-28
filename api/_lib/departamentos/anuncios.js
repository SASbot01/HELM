// HELM — Anuncios (departamento Contenido).
//
// El test de 5 días (api/_lib/ads.js) ya cuenta leads y ventas por UTM y deja un
// veredicto. Este agente lo lleva al dinero: para cada anuncio calcula el COSTE
// POR LEAD y el COSTE POR VENTA COBRADA con el gasto apuntado, y al cerrarse el
// test propone un veredicto razonado —«apagar», «subir» o «probar otro gancho»—
// como propuesta informativa (sin herramienta: aprobarla es darla por vista).
//
// Además, si hay reels ORGÁNICOS que venden mucho (por la misma atribución UTM
// que usa el guionista de ventas) y aún no se están anunciando, propone
// convertir el mejor en anuncio.
//
// El gasto, si el perfil tiene Metricool, es el de esos anuncios en la ventana
// del test (api/_lib/metricool.js). Si no casa ninguno, sale de helm_ads.gasto
// (el que apunta el panel); si no está, se cae a `presupuesto` como estimación
// y se avisa de que hay que apuntar el real. No llama a la IA ni escribe en
// helm_ads: solo lee y propone.
import { atribuyeReels, cobradoDe, shortcodeDe } from './guionista-ventas.js'
import { configDe, sincronizaPerfil, filasGuardadas, gastoDeAnuncio } from '../metricool.js'

const DIAS_TEST = 5
const VENTANA_REELS_DIAS = 180
// Mínimo de ventas cobradas atribuidas para proponer un reel orgánico como ad.
const UMBRAL_REEL = 2

const diaISO = (d) => new Date(d).toISOString().slice(0, 10)
const haceDias = (hoy, n) => { const d = new Date(hoy); d.setUTCDate(d.getUTCDate() - n); return diaISO(d) }
const sumarDia = (dia, n) => { const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const norm = (s) => String(s ?? '').trim().toLowerCase()
const eur = (n) => Math.round(Number(n) || 0).toLocaleString('es-ES')
const dec = (n) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Lo invertido en un anuncio. Metricool, si hay filas de ese anuncio en la
// ventana, manda. Si no, el gasto real apuntado; si no, el presupuesto.
// Devuelve { valor, real } o { valor: null }.
function gastoDe(ad, metricool) {
  if (metricool != null) return { valor: metricool, real: true, fuente: 'metricool' }
  if (ad.gasto != null && ad.gasto !== '') return { valor: Number(ad.gasto) || 0, real: true }
  if (ad.presupuesto != null && ad.presupuesto !== '') return { valor: Number(ad.presupuesto) || 0, real: false }
  return { valor: null, real: false }
}

// Conversiones de un anuncio en su ventana de test, contando sobre lo ya leído.
function conversionesAd(ad, ventas, contactos) {
  const hasta = sumarDia(ad.publicado_en, DIAS_TEST)
  const dentro = (fecha) => fecha && fecha >= ad.publicado_en && fecha < hasta
  const u = norm(ad.utm)
  const cobradas = ventas.filter(v => norm(v.utm_content) === u && cobradoDe(v) > 0 && dentro(String(v.date).slice(0, 10)))
  const leads = contactos.filter(c => norm(c.utm_content) === u && dentro(String(c.created_at).slice(0, 10)))
  return {
    leads: leads.length,
    ventas: cobradas.length,
    ingresos: Math.round(cobradas.reduce((t, v) => t + cobradoDe(v), 0)),
  }
}

// El veredicto razonado al dinero. Devuelve { clave, etiqueta, razon }.
function veredictoDe({ ventas, leads, ingresos }, gasto) {
  const roas = gasto.valor > 0 && ingresos > 0 ? ingresos / gasto.valor : null
  if (ventas >= 1 && (roas == null || roas >= 1)) {
    return { clave: 'subir', etiqueta: 'subir', razon: 'Convierte y sale a cuenta: sube el presupuesto poco a poco mientras el coste por venta aguante.' }
  }
  if (ventas >= 1) {
    return { clave: 'probar', etiqueta: 'probar otro gancho', razon: 'Vende, pero cada venta cuesta más de lo que deja: prueba otro gancho o ajusta la oferta antes de meter más dinero.' }
  }
  if (leads >= 3) {
    return { clave: 'probar', etiqueta: 'probar otro gancho', razon: 'Trae interés pero no cierra ninguna venta: prueba otro gancho o revisa la oferta y la landing.' }
  }
  return { clave: 'apagar', etiqueta: 'apagar', razon: 'Apenas trae leads y no vende: apágalo y prueba otra cosa.' }
}

// La línea de coste por lead / por venta para el porqué de la propuesta.
function lineaCoste(c, gasto) {
  if (gasto.valor == null) return 'No has apuntado el gasto: apúntalo en el anuncio para ver el coste por lead y por venta.'
  const cpl = c.leads > 0 ? `${dec(gasto.valor / c.leads)} €/lead` : 'sin leads'
  const cpv = c.ventas > 0 ? `${dec(gasto.valor / c.ventas)} €/venta cobrada` : 'sin ventas cobradas'
  const roas = gasto.valor > 0 && c.ingresos > 0 ? `, ROAS ${(c.ingresos / gasto.valor).toFixed(1).replace('.', ',')}×` : ''
  const deDonde = gasto.fuente === 'metricool' ? ' (Metricool)' : (gasto.real ? '' : ' (presupuesto, apunta el real)')
  return `Gasto ${eur(gasto.valor)} €${deDonde} → ${cpl}, ${cpv}${roas}.`
}

export default {
  key: 'anuncios',
  departamento: 'contenido',
  async corre(ctx) {
    const { supabase, clientId, hoy } = ctx
    const { data: ads, error: eAds } = await supabase.from('helm_ads')
      .select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(200)
    if (eAds) throw new Error(eAds.message)

    const conTest = (ads || []).filter(a => (a.estado === 'evaluado' || a.estado === 'en_test') && a.publicado_en)
    if (!conTest.length) {
      await ctx.log('Este perfil no tiene anuncios en test ni evaluados: nada que medir.')
      return { propuestas: 0, resumen: 'Sin anuncios en test ni evaluados.' }
    }

    // Se lee desde el test más antiguo (o 180 días) para cubrir sus ventanas y,
    // de paso, la atribución de los reels orgánicos.
    const masViejo = conTest.map(a => a.publicado_en).sort()[0]
    const desde = [haceDias(hoy, VENTANA_REELS_DIAS), masViejo].sort()[0]
    const hastaHoy = diaISO(hoy)
    const filasMcP = (async () => {
      try {
        const cfg = await configDe(supabase, clientId, { slug: ctx.perfil?.slug })
        if (!cfg) return []
        const desdeSync = [desde, haceDias(hoy, 31)].sort().at(-1)
        try {
          await sincronizaPerfil({ db: supabase, clientId, desde: desdeSync, hasta: hastaHoy, cfg })
        } catch (e) {
          await ctx.log(`Metricool no se ha podido sincronizar (${e?.message || e}). Sigo con lo guardado y, si no hay, con el gasto apuntado.`)
        }
        return await filasGuardadas(supabase, clientId, { desde, hasta: hastaHoy })
      } catch (e) {
        await ctx.log(`Metricool: ${e?.message || e}`)
        return []
      }
    })()
    const [media, ventas, leads, filasMc] = await Promise.all([
      supabase.from('helm_ig_media')
        .select('media_id, caption, permalink, visitas, publicado_en, producto')
        .eq('client_id', clientId).order('publicado_en', { ascending: false }).limit(200),
      supabase.from('sales')
        .select('utm_content, utm_campaign, revenue, cash_collected, product, date, status')
        .eq('client_id', clientId).gte('date', desde).limit(2000),
      supabase.from('crm_contacts')
        .select('utm_content, utm_campaign, created_at, status')
        .eq('client_id', clientId).gte('created_at', `${desde}T00:00:00Z`).limit(2000),
      filasMcP,
    ])
    for (const r of [media, ventas, leads]) if (r.error) throw new Error(r.error.message)
    const ventasRows = ventas.data || []
    const leadsRows = leads.data || []

    let propuestas = 0
    let sinGasto = 0
    const evaluados = conTest.filter(a => a.estado === 'evaluado')
    for (const ad of conTest) {
      const c = conversionesAd(ad, ventasRows, leadsRows)
      const gasto = gastoDe(ad, gastoDeAnuncio(ad, filasMc))
      if (gasto.valor == null) sinGasto += 1
      const cpl = gasto.valor != null && c.leads > 0 ? ` · ${dec(gasto.valor / c.leads)} €/lead` : ''
      const cpv = gasto.valor != null && c.ventas > 0 ? ` · ${dec(gasto.valor / c.ventas)} €/venta` : ''
      await ctx.log(`«${ad.nombre}» (${ad.estado}): ${c.leads} leads, ${c.ventas} ventas cobradas, ${eur(c.ingresos)} €${cpl}${cpv}.`)

      // El veredicto razonado solo al cerrarse el test (evaluado). Una propuesta
      // por test cerrado: la clave lleva la fecha de publicación.
      if (ad.estado !== 'evaluado') continue
      const v = veredictoDe(c, gasto)
      const porque = `En ${DIAS_TEST} días: ${c.leads} ${c.leads === 1 ? 'lead' : 'leads'} y ${c.ventas} ${c.ventas === 1 ? 'venta cobrada' : 'ventas cobradas'}${c.ingresos ? ` (${eur(c.ingresos)} €)` : ''}. ${lineaCoste(c, gasto)} ${v.razon}`
      const hecha = await ctx.proponer({
        clave: `anuncios:veredicto:${ad.id}:${ad.publicado_en}`,
        titulo: `Anuncio «${ad.nombre}»: ${v.etiqueta}`,
        porque,
      })
      if (hecha) propuestas += 1
    }

    // Reels orgánicos que venden mucho y aún no se anuncian → propón el mejor.
    const reels = (media.data || []).filter(r => r.producto === 'REELS' || !r.producto)
    const utmsAds = (ads || []).map(a => norm(a.utm)).filter(Boolean)
    const yaAnunciado = (reel) => {
      const sc = shortcodeDe(reel.permalink), mid = norm(reel.media_id)
      return utmsAds.some(u => (sc && u.includes(sc)) || (mid && u.includes(mid)))
    }
    const candidatos = atribuyeReels({ reels, ventas: ventasRows, contactos: leadsRows })
      .filter(f => f.ventas >= UMBRAL_REEL && !yaAnunciado(f.reel))
      .sort((a, b) => b.ingresos - a.ingresos || b.ventas - a.ventas)
    if (candidatos.length) {
      const m = candidatos[0]
      const titulo = String(m.reel.caption || '').split('\n').map(s => s.trim()).find(Boolean)?.slice(0, 60) || 'tu reel que más vende'
      const hecha = await ctx.proponer({
        clave: `anuncios:reel-a-anuncio:${m.reel.media_id}`,
        titulo: 'Convierte en anuncio tu reel que más vende',
        porque: `El reel «${titulo}» ha traído ${m.ventas} ventas cobradas (${eur(m.ingresos)} €) y ${m.leads} leads de forma orgánica${m.visitas ? ` con ${eur(m.visitas)} visitas` : ''}, y no lo estás anunciando. Es el mejor candidato para meterle presupuesto: crea un anuncio con su enlace (${m.reel.permalink || 'su permalink'}) y arranca el test de 5 días.`,
      })
      if (hecha) propuestas += 1
    }

    const partes = [`${conTest.length} ${conTest.length === 1 ? 'anuncio' : 'anuncios'} con test (${evaluados.length} evaluados)`]
    if (propuestas) partes.push(`${propuestas} ${propuestas === 1 ? 'propuesta' : 'propuestas'}`)
    if (candidatos.length) partes.push('1 reel orgánico propuesto como anuncio')
    if (sinGasto) partes.push(`${sinGasto} sin gasto apuntado (coste por venta estimado con el presupuesto)`)
    return { propuestas, resumen: `${partes.join('; ')}.` }
  },
}
