// HELM — Ads: test de 5 días por conversiones UTM.
//
// Un ad se publica y HELM mide durante 5 días los leads (crm_contacts) y ventas
// (sales) atribuidos a su UTM. Al cerrar el test, el equipo deja un veredicto:
// funciona / ajustar / no_funciona. El estudio es un cálculo sobre los datos que
// HELM ya tiene (no llama a Meta Ads): se cuenta por utm_content y por fecha.
import { supabase } from '../lib/supabase.js'
import { notificar } from './notificar.js'

const DIAS_TEST = 5

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
const rand = () => Math.random().toString(16).slice(2, 6)

// Un UTM legible y único para el ad; el dueño lo pega en el enlace del anuncio.
export const generarUtm = (nombre) => `ad-${slug(nombre) || 'anuncio'}-${rand()}`

const diaISO = (d) => d.toISOString().slice(0, 10)
const sumar = (dia, n) => { const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return diaISO(d) }
// Lo cobrado de verdad; si aún no consta, el importe de la venta. (Antes
// leía installments_total, que es el NÚMERO de cuotas, e importe/amount, que
// no existen: la consulta fallaba y el test daba 0 ventas siempre.)
export const importeDe = (v) => {
  const cobrado = Number(v?.cash_collected)
  return (Number.isFinite(cobrado) && cobrado > 0 ? cobrado : Number(v?.revenue)) || 0
}

/**
 * Leads y ventas atribuidos a un UTM dentro de una ventana [desde, hasta).
 * Fechas en AAAA-MM-DD. Nunca lanza por una tabla vacía.
 */
export async function conversionesDe(clientId, utm, desde, hasta) {
  const d0 = `${desde}T00:00:00Z`, d1 = `${hasta}T00:00:00Z`
  const [lc, vc] = await Promise.all([
    supabase.from('crm_contacts').select('created_at').eq('client_id', clientId).eq('utm_content', utm).gte('created_at', d0).lt('created_at', d1),
    supabase.from('sales').select('created_at, revenue, cash_collected').eq('client_id', clientId).eq('utm_content', utm).gte('created_at', d0).lt('created_at', d1),
  ])
  if (lc.error) console.warn('[ads] leads del test:', lc.error.message)
  if (vc.error) console.warn('[ads] ventas del test:', vc.error.message)
  const leadsRows = lc.data || [], ventasRows = vc.data || []
  const ingresos = ventasRows.reduce((t, v) => t + importeDe(v), 0)
  // Reparto por día del test, para ver la tendencia.
  const porDia = []
  for (let i = 0; i < DIAS_TEST; i++) {
    const dia = sumar(desde, i)
    const enDia = (rows) => rows.filter(r => String(r.created_at).slice(0, 10) === dia).length
    porDia.push({ dia, leads: enDia(leadsRows), ventas: enDia(ventasRows) })
  }
  return { leads: leadsRows.length, ventas: ventasRows.length, ingresos: Math.round(ingresos), por_dia: porDia }
}

function veredictoDe({ leads, ventas }) {
  if (ventas >= 1) return 'funciona'
  if (leads >= 3) return 'ajustar'
  return 'no_funciona'
}
const eur = (n) => Math.round(n).toLocaleString('es-ES', { useGrouping: 'always' })
function conclusionDe(ad, c, veredicto) {
  const roas = ad.presupuesto > 0 && c.ingresos > 0 ? ` ROAS ${(c.ingresos / ad.presupuesto).toFixed(1).replace('.', ',')}×.` : ''
  const cab = `En ${DIAS_TEST} días: ${c.leads} ${c.leads === 1 ? 'lead' : 'leads'} y ${c.ventas} ${c.ventas === 1 ? 'venta' : 'ventas'}${c.ingresos ? ` (${eur(c.ingresos)} €)` : ''}${ad.presupuesto ? ` con ${eur(ad.presupuesto)} € invertidos.` : '.'}${roas}`
  const fin = veredicto === 'funciona'
    ? ' Está funcionando: convierte. Mantenlo y, si el ROAS aguanta, sube presupuesto.'
    : veredicto === 'ajustar'
      ? ' Genera interés pero aún no vende: ajusta la oferta, el público o la landing antes de meter más dinero.'
      : ' No está funcionando: apenas trae leads. Cámbialo o párala.'
  return cab + fin
}

/** Deja encolado el estudio del ad para cuando acaben los 5 días. */
export async function encolaEstudioAd(adId, clientId, correrTras) {
  const { error } = await supabase.from('agent_jobs').upsert({
    tipo: 'ad-estudio', payload: { clientId, adId }, clave: `ad-estudio:${adId}`,
    estado: 'pendiente', max_intentos: 2, correr_tras: correrTras,
  }, { onConflict: 'clave', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo encolar el estudio del ad: ${error.message}`)
}

/**
 * El trabajo del worker: cierra el test de un ad. Cuenta las conversiones de sus
 * 5 días, deja el veredicto y el estudio, y avisa al dueño. Si el ad ya no está
 * en test (lo pausaron o borraron), no hace nada.
 */
export async function estudiaAd(job) {
  const { clientId, adId } = job?.payload || {}
  if (!adId) throw new Error('ad-estudio: falta adId')
  const { data: ad } = await supabase.from('helm_ads').select('*').eq('id', adId).maybeSingle()
  if (!ad || ad.estado !== 'en_test' || !ad.publicado_en) return { saltado: true }

  const hasta = sumar(ad.publicado_en, DIAS_TEST)
  const c = await conversionesDe(clientId || ad.client_id, ad.utm, ad.publicado_en, hasta)
  const veredicto = veredictoDe(c)
  const estudio = { ...c, conclusion: conclusionDe(ad, c, veredicto), al_dia: new Date().toISOString() }
  await supabase.from('helm_ads').update({ estado: 'evaluado', veredicto, estudio, updated_at: new Date().toISOString() }).eq('id', adId)

  const ICO = { funciona: '✅', ajustar: '🟡', no_funciona: '🔴' }
  await notificar(supabase, ad.client_id, {
    tipo: 'agentes',
    titulo: `${ICO[veredicto] || ''} Ad «${ad.nombre}»: ${veredicto === 'no_funciona' ? 'no funciona' : veredicto}`,
    cuerpo: estudio.conclusion,
    destino: 'roadmap',
  }).catch(() => {})
  return { veredicto, ...c }
}
