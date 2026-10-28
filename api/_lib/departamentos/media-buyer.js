// HELM — el Media buyer: lleva las campañas de Meta Ads de un perfil. NIVEL 1:
// propone y el dueño aprueba (28-oct-2026).
//
// Cada mañana, por cada cuenta publicitaria del perfil (helm_ads_cuentas):
//   1. Sincroniza con Meta ayer y los 14 días de antes (7 para juzgar y 7 para
//      comparar el CTR) por anuncio y día, y lo cruza con el CRM: un lead es de
//      un anuncio si su utm_content es el id del anuncio ({{ad.id}} en la URL),
//      y sus ventas cobradas cuentan el día EN QUE ENTRÓ EL LEAD (cohorte), para
//      no matar un anuncio de hace 4 días al que aún le pueden llegar ventas.
//      Queda en helm_ads_metricas.
//   2. Decide con REGLAS, sin IA (la clave de Claude no tiene saldo y esto no
//      necesita un modelo): antes de juzgar, días y gasto mínimos; luego coste
//      por lead (captación) o por venta cobrada (carrito) frente al objetivo
//      del dueño, y fatiga por frecuencia y caída del CTR. En «cierre» no toca
//      presupuestos: solo vigila.
//   3. PROPONE (ctx.proponer → la bandeja y el Telegram de la agencia) subir
//      como mucho +20 % (solo fuera del aprendizaje, una vez cada 72 h por
//      conjunto y si cabe en los topes), bajar, pausar o pedir creatividades,
//      cada una con su porqué en cifras. Las de dinero llevan la escritura
//      meta_presupuesto o meta_pausar, que al aprobar vuelve a leer Meta y a
//      comprobar los topes (api/_lib/meta-ads.js). Caducan a las 19:00.
//   4. Manda el parte del día (ctx.avisar).
//
// Y el VIGILANTE (vigilante(), sin IA ni créditos, para llamarlo cada hora):
// mira lo gastado hoy y en el mes; si pasa del tope duro del día o del
// mensual, pausa todo lo activo (pararTodo, que guarda la lista para reanudar)
// y avisa. Al 80 % del presupuesto diario máximo, solo avisa. NUNCA sube nada.
import { supabase } from '../../lib/supabase.js'
import { notificar } from '../notificar.js'
import { todasLasFilas } from '../filas.js'
import {
  CUENTAS, ACCIONES, HORAS_ENTRE_SUBIDAS, SUBIDA_MAX_PCT, MINIMO_DIARIO,
  tokenDe, insightsPorAnuncioDia, insightsPorAnuncio, campanas, conjuntos, anuncios, gastoDe,
  unidadesDePresupuesto, sumaDiaria, topeDuro, pararTodo, puedeGastar,
  diaEn, masDias, diasQuedanMes, dinero, porcentaje, redondea, TEXTO_APRENDIZAJE,
} from '../meta-ads.js'

const AGENTE = 'media-buyer'
// Sin la migración 117 aún aplicada, la tabla no existe: no es un fallo del agente.
const sinTabla = (e) => ['42P01', 'PGRST205'].includes(e?.code) || /does not exist|schema cache/i.test(String(e?.message || ''))

/** Las reglas. Números, no texto de un prompt: los topes de dinero están en helm_ads_cuentas. */
export const REGLAS = {
  dias: 7,
  // Pausar: sin resultados, o el coste a 2 veces el objetivo.
  pausaFactor: 2,
  // Bajar un 20 %: el coste entre 1,3 y 2 veces el objetivo.
  bajadaFactor: 1.3,
  bajadaPct: 20,
  // Subir: el coste a 0,8 veces el objetivo o menos, con 3 resultados o más y
  // gastando al menos el 70 % de su presupuesto (si no lo gasta, subir no sirve).
  subidaFactor: 0.8,
  minResultadosSubida: 3,
  usoMinimoSubida: 0.7,
  // Para decir que algo «no vende» cuando la venta pasa por una llamada.
  diasVentaPorLlamada: 7,
  // Si HELM ve menos del 30 % de los leads que cuenta Meta, la atribución está
  // rota y no se juzga con el CRM.
  atribucionMin: 0.3,
  // Fatiga: frecuencia de 7 días por encima de 3 y el CTR un 30 % por debajo de la semana anterior.
  fatigaFrecuencia: 3,
  fatigaCaidaCtr: 0.3,
  fatigaImpresionesMin: 1000,
}

// ── El cruce con el CRM ─────────────────────────────────────────────────────

const ANULADA = /cancel|reembols|refund|devuel|anulad/i
const trozos = (lista, n = 150) => {
  const out = []
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n))
  return out
}

/**
 * Leads y ventas cobradas por anuncio y día de entrada del lead.
 * → Map('<ad_id>|<dia>' → { leads, ventas, cobrado })
 */
export async function crmPorAnuncio(clientId, adIds, { desde, hasta, zona = 'Europe/Madrid' }) {
  const salida = new Map()
  const ids = [...new Set((adIds || []).map(String))]
  if (!ids.length) return salida
  const suma = (ad, dia, campo, n = 1) => {
    if (dia < desde || dia > hasta) return
    const k = `${ad}|${dia}`
    const v = salida.get(k) || { leads: 0, ventas: 0, cobrado: 0 }
    v[campo] = redondea(v[campo] + n)
    salida.set(k, v)
  }
  const d0 = `${masDias(desde, -1)}T00:00:00Z`
  const d1 = `${masDias(hasta, 2)}T00:00:00Z`

  // Por páginas: PostgREST corta en 1000 filas y un anuncio que funciona puede
  // pasar de 1000 leads en la ventana (con menos, el coste por lead saldría
  // inflado y propondría pausar lo que va bien).
  const contactos = []
  for (const t of trozos(ids)) {
    contactos.push(...await todasLasFilas(() => supabase.from('crm_contacts').select('id, created_at, utm_content')
      .eq('client_id', clientId).in('utm_content', t).gte('created_at', d0).lt('created_at', d1).order('id')))
  }
  const cohorte = new Map()
  for (const c of contactos) {
    const dia = diaEn(zona, new Date(c.created_at))
    cohorte.set(c.id, { ad: String(c.utm_content), dia })
    suma(String(c.utm_content), dia, 'leads')
  }

  const ventas = new Map()
  for (const t of trozos([...cohorte.keys()])) {
    const filas = await todasLasFilas(() => supabase.from('sales').select('id, contact_id, utm_content, cash_collected, status, date, created_at')
      .eq('client_id', clientId).in('contact_id', t).order('id'))
    for (const v of filas) ventas.set(v.id, v)
  }
  // Las que llevan el UTM pero no tienen ficha (o es de otro anuncio): por su fecha.
  for (const t of trozos(ids)) {
    const filas = await todasLasFilas(() => supabase.from('sales').select('id, contact_id, utm_content, cash_collected, status, date, created_at')
      .eq('client_id', clientId).in('utm_content', t).gte('created_at', d0).lt('created_at', d1).order('id'))
    for (const v of filas) if (!ventas.has(v.id)) ventas.set(v.id, v)
  }
  for (const v of ventas.values()) {
    const cobrado = Number(v.cash_collected) || 0
    if (ANULADA.test(String(v.status || '')) || cobrado <= 0) continue
    const lead = v.contact_id ? cohorte.get(v.contact_id) : null
    const ad = lead?.ad || (v.utm_content ? String(v.utm_content) : null)
    const dia = lead?.dia || (/^\d{4}-\d{2}-\d{2}$/.test(String(v.date || '')) ? v.date : diaEn(zona, new Date(v.created_at)))
    if (!ad || !ids.includes(ad)) continue
    suma(ad, dia, 'ventas')
    suma(ad, dia, 'cobrado', cobrado)
  }
  return salida
}

// ── La sincronización ───────────────────────────────────────────────────────

/**
 * Trae de Meta los 14 días hasta ayer por anuncio y día, los cruza con el CRM y
 * los guarda en helm_ads_metricas. → las filas (con el CRM).
 */
export async function sincronizaCuenta({ clientId, cuenta, token, ahora = new Date() }) {
  const hoy = diaEn(cuenta.zona, ahora)
  const desde = masDias(hoy, -2 * REGLAS.dias)
  const hasta = masDias(hoy, -1)
  const deMeta = await insightsPorAnuncioDia(token, cuenta.cuenta_id, { desde, hasta })
  const crm = await crmPorAnuncio(clientId, deMeta.map(f => f.ad_id), { desde, hasta, zona: cuenta.zona })
  const porClave = new Map(deMeta.map(f => [`${f.ad_id}|${f.dia}`, f]))
  // Un lead de un día en que el anuncio no gastó (llega tarde) también cuenta.
  const nombres = new Map(deMeta.map(f => [f.ad_id, f]))
  for (const k of crm.keys()) {
    if (porClave.has(k)) continue
    const [ad, dia] = k.split('|')
    const ref = nombres.get(ad) || {}
    porClave.set(k, {
      dia, ad_id: ad, ad_nombre: ref.ad_nombre || null, adset_id: ref.adset_id || null, adset_nombre: ref.adset_nombre || null,
      campaign_id: ref.campaign_id || null, campaign_nombre: ref.campaign_nombre || null,
      gasto: 0, impresiones: 0, alcance: 0, frecuencia: null, clics: 0, clics_enlace: 0, ctr: null, leads_meta: 0, compras_meta: 0,
    })
  }
  const en = new Date().toISOString()
  const filas = [...porClave.entries()].map(([k, f]) => {
    const c = crm.get(k) || { leads: 0, ventas: 0, cobrado: 0 }
    return { ...f, client_id: clientId, cuenta_id: cuenta.cuenta_id, leads_crm: c.leads, ventas_crm: c.ventas, cobrado_crm: c.cobrado, actualizado_en: en }
  })
  for (const t of trozos(filas, 500)) {
    const { error } = await supabase.from('helm_ads_metricas').upsert(t, { onConflict: 'cuenta_id,ad_id,dia' })
    if (error) console.warn('[media-buyer] no se pudo guardar la foto de métricas:', error.message)
  }
  return filas
}

const VACIO = () => ({ gasto: 0, impresiones: 0, clics_enlace: 0, leads_meta: 0, compras_meta: 0, leads_crm: 0, ventas_crm: 0, cobrado_crm: 0 })
function acumula(a, f) {
  for (const k of Object.keys(a)) a[k] = redondea(a[k] + (Number(f[k]) || 0))
  return a
}

/** Las filas por día → por anuncio: { actual (7 días hasta ayer), previo (los 7 de antes), ayer }. */
export function agrupaPorAnuncio(filas, hoy, dias = REGLAS.dias) {
  const ayer = masDias(hoy, -1)
  const ini = masDias(hoy, -dias)
  const iniPrevio = masDias(hoy, -2 * dias)
  const salida = new Map()
  for (const f of filas || []) {
    const k = String(f.ad_id)
    if (!salida.has(k)) salida.set(k, { actual: VACIO(), previo: VACIO(), ayer: VACIO(), nombre: f.ad_nombre, adset_id: f.adset_id, campaign_id: f.campaign_id })
    const a = salida.get(k)
    if (f.dia >= ini && f.dia <= ayer) acumula(a.actual, f)
    else if (f.dia >= iniPrevio && f.dia < ini) acumula(a.previo, f)
    if (f.dia === ayer) acumula(a.ayer, f)
  }
  return salida
}

// ── Las reglas ──────────────────────────────────────────────────────────────

const horasDesde = (iso, ahora) => (iso ? (ahora.getTime() - new Date(iso).getTime()) / 3_600_000 : 0)
const veces = (x) => `${String(Math.round(x * 10) / 10).replace('.', ',')} veces`
// Un presupuesto que se lee bien: euros enteros a partir de 10, céntimos por debajo.
const bonito = (x) => (x >= 10 ? Math.floor(x) : Math.floor(x * 100) / 100)

/**
 * Lo que propone el agente para una cuenta, sin tocar nada ni llamar a nadie.
 * @param {object} o
 * @param {object} o.cuenta          la fila de helm_ads_cuentas (topes, objetivo, fase)
 * @param {Array}  o.unidades        unidadesDePresupuesto (lo que hay en Meta ahora)
 * @param {Array}  o.anuncios        los anuncios de Meta (id, name, status, effective_status, adset_id, campaign_id, created_time)
 * @param {Map}    o.porAnuncio      agrupaPorAnuncio
 * @param {Map}    [o.frecuencias]   ad_id → frecuencia de los 7 días
 * @param {Set}    [o.subidasRecientes] ids con una subida en las últimas 72 h
 * @param {number} [o.gastadoMes]
 * @param {string} o.hoy             AAAA-MM-DD en la zona de la cuenta
 * @param {Date}   o.ahora
 * @returns {{ propuestas: Array, notas: string[] }}
 */
export function decide({ cuenta, unidades = [], anuncios: ads = [], porAnuncio = new Map(), frecuencias = new Map(), subidasRecientes = new Set(), gastadoMes = 0, hoy, ahora = new Date(), reglas = REGLAS }) {
  const propuestas = []
  const notas = []
  const moneda = cuenta.moneda || 'EUR'
  const $ = (n) => dinero(n, moneda)
  if (cuenta.fase === 'cierre') {
    notas.push('Cierre del lanzamiento: los presupuestos se quedan como están; solo vigila.')
    return { propuestas, notas }
  }
  const porVenta = cuenta.fase === 'carrito'
  const objetivo = Number(porVenta ? cuenta.objetivo_cpa : cuenta.objetivo_cpl) || 0
  const que = porVenta ? 'venta' : 'lead'
  const ques = porVenta ? 'ventas cobradas' : 'leads'
  if (!(objetivo > 0)) {
    notas.push(`Sin coste objetivo por ${que}: ponlo en HELM → Ads para que pueda juzgar.`)
    return { propuestas, notas }
  }
  const resultadosDe = (a) => (porVenta ? a.ventas_crm : a.leads_crm)
  const minHoras = Math.max(3, Number(cuenta.dias_min) || 3) * 24
  const gastoMin = (Number(cuenta.gasto_min_factor) || 1.5) * objetivo
  const dias = reglas.dias

  // ¿Se puede juzgar ya, y qué dice? → { juzgable, res, coste, malo, motivoPronto }
  const juzga = (agg, horas) => {
    const res = resultadosDe(agg)
    const coste = res > 0 ? agg.gasto / res : null
    if (horas < minHoras) return { juzgable: false, res, coste, pronto: `lleva ${Math.floor(horas / 24)} días (mínimo ${minHoras / 24})` }
    if (agg.gasto < gastoMin) return { juzgable: false, res, coste, pronto: `ha gastado ${$(agg.gasto)} (mínimo ${$(gastoMin)} para juzgar)` }
    // Si Meta cuenta leads y HELM casi no los ve, la atribución está rota (el
    // enlace sin utm_content={{ad.id}}, o formularios instantáneos de Meta que
    // no llegan al CRM): juzgar con el CRM pausaría lo que funciona.
    const metaLeads = Number(agg.leads_meta) || 0
    const crmLeads = Number(agg.leads_crm) || 0
    if (metaLeads >= 3 && crmLeads < metaLeads * reglas.atribucionMin) {
      return { juzgable: false, res, coste, pronto: `Meta cuenta ${metaLeads} leads y HELM solo ve ${crmLeads}: la atribución está rota (falta utm_content={{ad.id}} en el enlace del anuncio, o son formularios de Meta), así que no lo juzgo` }
    }
    // Sin ventas solo es «no vende» si ha pasado el tiempo de la llamada.
    const sinResultadoCuenta = res === 0 && (!porVenta || horas >= reglas.diasVentaPorLlamada * 24)
    const malo = sinResultadoCuenta || (coste != null && coste >= reglas.pausaFactor * objetivo)
    return { juzgable: true, res, coste, malo }
  }
  const cifras = (agg, j, extra = '') => {
    const coste = j.coste != null ? `${$(j.coste)}/${que}, ${veces(j.coste / objetivo)} tu objetivo de ${$(objetivo)}` : (porVenta ? 'ninguna venta' : 'ningún lead')
    const meta = porVenta ? '' : ` Meta cuenta ${agg.leads_meta} leads.`
    const ventas = !porVenta && agg.ventas_crm ? ` ${agg.ventas_crm} ${agg.ventas_crm === 1 ? 'venta cobrada' : 'ventas cobradas'} (${$(agg.cobrado_crm)}).` : ''
    return `En ${dias} días: ${$(agg.gasto)} gastados y ${j.res} ${ques} según HELM (${coste}).${meta}${ventas}${extra}`
  }

  const unidadDeAnuncio = (ad) => unidades.find(u => (u.tipo === 'campaign' ? u.id === String(ad.campaign_id) : u.id === String(ad.adset_id)))
  const deUnidad = (u) => ads.filter(ad => unidadDeAnuncio(ad) === u)
  const pausadas = new Set()

  // Margen para subir: lo que queda hasta el tope diario y hasta el mensual.
  const tope = Number(cuenta.tope_diario) || 0
  const mensual = Number(cuenta.tope_mensual) || 0
  let suma = sumaDiaria(unidades)
  const quedan = diasQuedanMes(hoy)
  const maxPct = Math.min(SUBIDA_MAX_PCT, Number(cuenta.subida_max_pct) || SUBIDA_MAX_PCT)

  // 1. Cada presupuesto (conjunto o campaña con presupuesto de campaña).
  for (const u of unidades.filter(x => x.enciende)) {
    const suyos = deUnidad(u)
    const agg = suyos.reduce((a, ad) => acumula(a, porAnuncio.get(String(ad.id))?.actual || {}), VACIO())
    const nacio = [u.creada, ...suyos.map(a => a.created_time)].filter(Boolean).sort()[0]
    const horas = horasDesde(nacio, ahora)
    const j = juzga(agg, horas)
    const nombre = `«${u.nombre}»`
    if (!j.juzgable) {
      notas.push(`${nombre}: aún no se juzga, ${j.pronto}.`)
      continue
    }
    const datos = { gasto: agg.gasto, resultados: j.res, coste: j.coste != null ? redondea(j.coste) : null, objetivo, leads_meta: agg.leads_meta, cobrado: agg.cobrado_crm, presupuesto: u.presupuesto }
    if (j.malo) {
      pausadas.add(u.id)
      propuestas.push({
        tipo: 'pausar', objeto: { tipo: u.tipo, id: u.id, nombre: u.nombre },
        titulo: `Pausar ${u.tipo === 'campaign' ? 'la campaña' : 'el conjunto'} ${nombre}`,
        porque: cifras(agg, j, ` Lleva ${Math.floor(horas / 24)} días.`), datos,
      })
      continue
    }
    if (j.coste == null) {
      notas.push(`${nombre}: aún sin ${ques}; para decir que no vende se esperan ${reglas.diasVentaPorLlamada} días.`)
      continue
    }
    // Una bajada propuesta no libera margen para subir otra cosa: aún no está aprobada.
    if (j.coste >= reglas.bajadaFactor * objetivo) {
      const despues = Math.max(MINIMO_DIARIO, bonito(u.presupuesto * (1 - reglas.bajadaPct / 100)))
      if (despues < u.presupuesto) {
        propuestas.push({
          tipo: 'bajar', objeto: { tipo: u.tipo, id: u.id, nombre: u.nombre }, antes: u.presupuesto, despues,
          titulo: `Bajar ${nombre} de ${$(u.presupuesto)} a ${$(despues)}/día (−${porcentaje((1 - despues / u.presupuesto) * 100)})`,
          porque: `${cifras(agg, j)} Se baja un ${reglas.bajadaPct} % para gastar menos mientras se ve si mejora.`, datos,
        })
      }
      continue
    }
    if (j.coste <= reglas.subidaFactor * objetivo && j.res >= reglas.minResultadosSubida) {
      const uso = agg.gasto / (u.presupuesto * dias)
      if (u.aprendizaje !== 'SUCCESS') { notas.push(`${nombre} va bien (${$(j.coste)}/${que}) pero ${TEXTO_APRENDIZAJE[u.aprendizaje] || 'Meta no dice si ha salido del aprendizaje'}: no se sube.`); continue }
      if (subidasRecientes.has(u.id)) { notas.push(`${nombre} va bien, pero ya se le subió el presupuesto hace menos de ${HORAS_ENTRE_SUBIDAS} h.`); continue }
      if (uso < reglas.usoMinimoSubida) { notas.push(`${nombre} va bien, pero solo gasta el ${porcentaje(uso * 100)} de su presupuesto: subirlo no serviría.`); continue }
      if (!(tope > 0) || !(mensual > 0)) { notas.push(`${nombre} va bien, pero la cuenta no tiene topes: sin topes no propongo subidas.`); continue }
      const porTope = tope - (suma - u.presupuesto)
      const porMes = (mensual - gastadoMes) / quedan - (suma - u.presupuesto)
      const despues = bonito(Math.min(u.presupuesto * (1 + maxPct / 100), porTope, porMes))
      if (despues < u.presupuesto + 1 || despues < u.presupuesto * 1.05) {
        notas.push(`${nombre} va bien, pero una subida no cabe en los topes (${$(tope)}/día, ${$(mensual)} al mes).`)
        continue
      }
      suma = redondea(suma + despues - u.presupuesto)
      propuestas.push({
        tipo: 'subir', objeto: { tipo: u.tipo, id: u.id, nombre: u.nombre }, antes: u.presupuesto, despues,
        titulo: `Subir ${nombre} de ${$(u.presupuesto)} a ${$(despues)}/día (+${porcentaje((despues / u.presupuesto - 1) * 100)})`,
        porque: `${cifras(agg, j)} Gasta el ${porcentaje(Math.min(uso, 1) * 100)} de su presupuesto y ha salido del aprendizaje.`,
        datos: { ...datos, uso: redondea(uso) },
      })
    }
  }

  // 2. Cada anuncio activo de lo que no se pausa entero.
  for (const ad of ads.filter(a => a.status === 'ACTIVE' && puedeGastar(a))) {
    const u = unidadDeAnuncio(ad)
    if (u && pausadas.has(u.id)) continue
    const datosAd = porAnuncio.get(String(ad.id))
    if (!datosAd) continue
    const agg = datosAd.actual
    const horas = horasDesde(ad.created_time, ahora)
    const j = juzga(agg, horas)
    const nombre = `«${ad.name}»`
    // El único anuncio vivo de su presupuesto ya se ha juzgado arriba, con él.
    const soloEl = u ? deUnidad(u).filter(a => a.status === 'ACTIVE' && puedeGastar(a)).length <= 1 : false
    if (j.juzgable && j.malo && !soloEl) {
      propuestas.push({
        tipo: 'pausar', objeto: { tipo: 'ad', id: String(ad.id), nombre: ad.name },
        titulo: `Pausar el anuncio ${nombre}`,
        porque: cifras(agg, j, ` Lleva ${Math.floor(horas / 24)} días publicado.`),
        datos: { gasto: agg.gasto, resultados: j.res, coste: j.coste != null ? redondea(j.coste) : null, objetivo },
      })
      continue
    }
    // Fatiga: frecuencia alta y el CTR cayendo frente a la semana anterior.
    const frec = Number(frecuencias.get(String(ad.id))) || 0
    const ctr = agg.impresiones ? agg.clics_enlace / agg.impresiones : 0
    const previo = datosAd.previo
    const ctrPrevio = previo.impresiones >= reglas.fatigaImpresionesMin ? previo.clics_enlace / previo.impresiones : 0
    if (frec > reglas.fatigaFrecuencia && ctrPrevio > 0 && (ctr - ctrPrevio) / ctrPrevio <= -reglas.fatigaCaidaCtr) {
      const caida = (1 - ctr / ctrPrevio) * 100
      propuestas.push({
        tipo: 'creatividades', objeto: { tipo: 'ad', id: String(ad.id), nombre: ad.name },
        titulo: `${nombre} se está cansando: hacen falta creatividades nuevas`,
        porque: `Frecuencia ${String(Math.round(frec * 10) / 10).replace('.', ',')} en ${dias} días y el CTR ha caído un ${porcentaje(caida)} (de ${porcentaje(ctrPrevio * 100)} a ${porcentaje(ctr * 100)}). Encarga 2 variantes al Editor o a Portadas a partir de tus reels que mejor funcionan; se suben a Meta en pausa. Aprobar esto es darlo por encargado.`,
        datos: { frecuencia: frec, ctr: redondea(ctr * 100), ctr_previo: redondea(ctrPrevio * 100) },
      })
    }
  }
  return { propuestas, notas }
}

// ── La pasada diaria ────────────────────────────────────────────────────────

const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** Las horas que faltan hasta las 19:00 de Madrid (la de las 7:00 no vale a las 23:00). */
export function horasHasta19(ahora = new Date()) {
  const [h, m] = fmtHora.format(ahora).split(':').map(Number)
  const faltan = 19 - (h + m / 60)
  return faltan >= 1 ? faltan : 12
}

/** Los conjuntos (y campañas) con una subida de presupuesto en las últimas 72 h. */
async function subidasRecientes(cuenta, ahora) {
  const horas = Math.max(HORAS_ENTRE_SUBIDAS, Number(cuenta.horas_entre_subidas) || 0)
  const { data, error } = await supabase.from(ACCIONES).select('objeto_id, antes, despues')
    .eq('cuenta_id', cuenta.cuenta_id).eq('accion', 'presupuesto').in('estado', ['hecho', 'sin_confirmar'])
    .gte('creada_en', new Date(ahora.getTime() - horas * 3_600_000).toISOString())
  if (error) throw error
  return new Set((data || []).filter(a => Number(a.despues?.valor) > Number(a.antes?.valor)).map(a => String(a.objeto_id)))
}

// El lunes de la semana de `hoy`: lo de las creatividades se pide una vez por semana.
const lunesDe = (hoy) => masDias(hoy, -((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7))

/** Una propuesta del agente → lo que recibe ctx.proponer. */
export function aPropuesta(p, cuenta, hoy, ahora = new Date()) {
  const base = {
    clave: `${AGENTE}:${p.tipo === 'creatividades' ? lunesDe(hoy) : hoy}:${p.tipo}:${p.objeto.id}`,
    titulo: p.titulo,
    porque: p.porque.slice(0, 1500),
    datos: { cuenta: cuenta.cuenta_id, objeto: p.objeto, ...(p.datos || {}) },
    caducaHoras: horasHasta19(ahora),
  }
  if (p.tipo === 'subir' || p.tipo === 'bajar') {
    return { ...base, herramienta: 'meta_presupuesto', input: { cuenta: cuenta.cuenta_id, tipo: p.objeto.tipo, objeto: p.objeto.id, antes: p.antes, despues: p.despues, motivo: base.porque } }
  }
  if (p.tipo === 'pausar') {
    return { ...base, herramienta: 'meta_pausar', input: { cuenta: cuenta.cuenta_id, tipo: p.objeto.tipo, objeto: p.objeto.id, motivo: base.porque } }
  }
  return base
}

const fmtFecha = (hoy) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${hoy}T12:00:00Z`))
const FASE = { captacion: 'captación', carrito: 'carrito abierto', cierre: 'cierre' }

/** El parte del día de una cuenta, en texto plano. */
export function textoParte({ perfil, cuenta, hoy, porAnuncio, creadas, notas }) {
  const $ = (n) => dinero(n, cuenta.moneda)
  const total = (campo) => [...porAnuncio.values()].reduce((a, x) => acumula(a, x[campo]), VACIO())
  const ayer = total('ayer')
  const semana = total('actual')
  const coste = (g, n) => (n ? `${$(g / n)}` : '—')
  const lineas = [
    `📣 ${perfil} · «${cuenta.nombre || cuenta.cuenta_id}» · ${fmtFecha(hoy)} · ${FASE[cuenta.fase] || cuenta.fase}`,
    `Ayer: ${$(ayer.gasto)} gastados${cuenta.tope_diario ? ` (tope ${$(cuenta.tope_diario)}/día)` : ''}. ${ayer.leads_crm} leads a ${coste(ayer.gasto, ayer.leads_crm)} según HELM; Meta cuenta ${ayer.leads_meta}${ayer.leads_meta > ayer.leads_crm ? ` (${ayer.leads_meta - ayer.leads_crm} que no están en el CRM)` : ''}.${ayer.ventas_crm ? ` ${ayer.ventas_crm} ${ayer.ventas_crm === 1 ? 'venta cobrada' : 'ventas cobradas'} (${$(ayer.cobrado_crm)}).` : ''}`,
    `7 días: ${$(semana.gasto)} · ${semana.leads_crm} leads (${coste(semana.gasto, semana.leads_crm)}/lead) · ${semana.ventas_crm} ${semana.ventas_crm === 1 ? 'venta cobrada' : 'ventas cobradas'} (${$(semana.cobrado_crm)}).`,
  ]
  if (creadas.length) {
    const cuenta2 = creadas.reduce((m, p) => ({ ...m, [p.tipo]: (m[p.tipo] || 0) + 1 }), {})
    const NOMBRES = { subir: 'subir', bajar: 'bajar', pausar: 'pausar', creatividades: 'creatividades' }
    lineas.push(`En la bandeja: ${creadas.length} ${creadas.length === 1 ? 'propuesta' : 'propuestas'} (${Object.entries(cuenta2).map(([k, n]) => `${n} ${NOMBRES[k] || k}`).join(', ')}). Si no contestas, a las 19:00 caducan y no se hace nada.`)
    for (const p of creadas) lineas.push(`• ${p.titulo}`)
  } else {
    lineas.push('Hoy no propongo cambios.')
  }
  if (notas.length) lineas.push(...notas.slice(0, 8).map(n => `· ${n}`))
  return lineas.join('\n')
}

/** Una cuenta: sincroniza, decide y propone. → { propuestas, parte } */
async function pasaCuenta(ctx, cuenta, token) {
  const ahora = ctx.hoy instanceof Date ? ctx.hoy : new Date()
  const hoy = diaEn(cuenta.zona, ahora)
  const filas = await sincronizaCuenta({ clientId: ctx.clientId, cuenta, token, ahora })
  const [cs, as, ads, frec, gastadoMes, recientes] = await Promise.all([
    campanas(token, cuenta.cuenta_id), conjuntos(token, cuenta.cuenta_id), anuncios(token, cuenta.cuenta_id),
    insightsPorAnuncio(token, cuenta.cuenta_id, { desde: masDias(hoy, -REGLAS.dias), hasta: masDias(hoy, -1) }),
    gastoDe(token, cuenta.cuenta_id, 'this_month'), subidasRecientes(cuenta, ahora),
  ])
  const unidades = unidadesDePresupuesto({ campanas: cs, conjuntos: as, moneda: cuenta.moneda })
  const porAnuncio = agrupaPorAnuncio(filas, hoy)
  const frecuencias = new Map(frec.map(f => [f.ad_id, f.frecuencia]))
  const { propuestas, notas } = decide({ cuenta, unidades, anuncios: ads, porAnuncio, frecuencias, subidasRecientes: recientes, gastadoMes, hoy, ahora })
  const creadas = []
  if (Number(cuenta.nivel) >= 1) {
    for (const p of propuestas) {
      try {
        const r = await ctx.proponer(aPropuesta(p, cuenta, hoy, ahora))
        if (r?.id) creadas.push(p)
        else if (r?.creada === false) notas.push(`No propongo «${p.titulo}»: ${r.motivo}`)
      } catch (e) {
        notas.push(`No he podido proponer «${p.titulo}»: ${e?.message || e}`)
      }
    }
  } else if (propuestas.length) {
    notas.unshift(`Nivel 0 (solo mira): habría propuesto ${propuestas.length} ${propuestas.length === 1 ? 'cambio' : 'cambios'}.`)
  }
  const parte = textoParte({ perfil: ctx.perfil?.name || ctx.perfil?.slug || 'Perfil', cuenta, hoy, porAnuncio, creadas, notas })
  return { propuestas: creadas.length, parte }
}

export default {
  key: AGENTE,
  departamento: 'contenido',
  async corre(ctx) {
    const { data: cuentas, error } = await supabase.from(CUENTAS).select('*').eq('client_id', ctx.clientId).eq('activa', true)
    if (error && sinTabla(error)) return { propuestas: 0, resumen: 'Falta aplicar la migración 117 (Meta Ads).' }
    if (error) throw error
    if (!cuentas?.length) return { propuestas: 0, resumen: 'Sin cuentas de Meta Ads conectadas.' }
    let token
    try {
      ({ token } = await tokenDe(ctx.clientId))
    } catch (e) {
      return { propuestas: 0, resumen: e?.message || String(e) }
    }
    let n = 0
    const partes = []
    for (const c of cuentas) {
      try {
        const r = await pasaCuenta(ctx, c, token)
        n += r.propuestas
        partes.push(r.parte)
      } catch (e) {
        ctx.log?.(`${c.cuenta_id}:`, e?.message || e)
        partes.push(`⚠️ ${ctx.perfil?.name || 'Perfil'} · «${c.nombre || c.cuenta_id}»: no he podido leer Meta. ${e?.message || e}`)
      }
    }
    if (partes.length) await ctx.avisar?.(partes.join('\n\n'))
    return { propuestas: n, resumen: `${cuentas.length} ${cuentas.length === 1 ? 'cuenta' : 'cuentas'} de Meta, ${n} ${n === 1 ? 'propuesta' : 'propuestas'}.` }
  },
}

// ── El vigilante (cada hora, sin IA) ────────────────────────────────────────

const VIGILANTE = 'Vigilante de HELM'

async function guardaVigilante(cuenta, estado) {
  const { error } = await supabase.from(CUENTAS).update({ vigilante: estado }).eq('id', cuenta.id)
  if (error) console.warn('[media-buyer] vigilante: no se pudo guardar lo visto:', error.message)
}

const avisa = (cuenta, { nivel = 'aviso', titulo, cuerpo, clave }) => notificar(supabase, cuenta.client_id, {
  tipo: 'agentes', nivel, titulo, cuerpo, destino: 'ads', clave: `meta-ads:${cuenta.cuenta_id}:${clave}`, cadaHoras: 20,
})

/**
 * Una cuenta: lo gastado hoy y en el mes frente a los topes. Si pasa del tope
 * duro del día o del mensual, pausa todo (nivel ≥ 1) o solo avisa (nivel 0).
 * Al 80 % del presupuesto diario máximo, avisa. No sube nada, nunca.
 * → { cuenta, accion: 'nada' | 'aviso' | 'parada' | 'error', gasto?, mes? }
 */
export async function vigilaCuenta(cuenta, ahora = new Date()) {
  const previo = cuenta.vigilante || {}
  const dia = diaEn(cuenta.zona, ahora)
  const $ = (n) => dinero(n, cuenta.moneda)
  let hoy
  let mes
  try {
    const { token } = await tokenDe(cuenta.client_id)
    hoy = await gastoDe(token, cuenta.cuenta_id, 'today')
    mes = await gastoDe(token, cuenta.cuenta_id, 'this_month')
  } catch (e) {
    // Tras 3 errores seguidos (o si el token ya no vale), avisa.
    const errores = (Number(previo.errores) || 0) + 1
    await guardaVigilante(cuenta, { ...previo, errores, ultimo_error: String(e?.message || e).slice(0, 300), en: ahora.toISOString() })
    if (errores >= 3 || e?.caducado) {
      await avisa(cuenta, { nivel: 'error', clave: 'conexion', titulo: `Meta Ads: el vigilante no puede leer «${cuenta.nombre || cuenta.cuenta_id}»`, cuerpo: `${e?.message || e} Mientras tanto no puede frenar el gasto: el límite de gasto de la cuenta en Meta es la red.` })
    }
    return { cuenta: cuenta.cuenta_id, accion: 'error', error: String(e?.message || e) }
  }
  const avisos = previo.dia === dia ? { ...(previo.avisos || {}) } : {}
  const estado = { dia, gasto: hoy, mes, en: ahora.toISOString(), errores: 0, avisos }
  let accion = 'nada'
  const duro = topeDuro(cuenta)
  const tMes = Number(cuenta.tope_mensual) || 0
  const pasaDuro = duro != null && hoy > duro
  const pasaMes = tMes > 0 && mes >= tMes
  if (pasaDuro || pasaMes) {
    const motivo = pasaDuro
      ? `Hoy van ${$(hoy)} gastados y el tope duro del día es ${$(duro)}.`
      : `En el mes van ${$(mes)} y el tope mensual es ${$(tMes)}.`
    if (Number(cuenta.nivel) >= 1) {
      const r = await pararTodo({ clientId: cuenta.client_id, cuenta: cuenta.cuenta_id, quien: VIGILANTE, origen: 'vigilante', motivo })
      if (r.pausadas.length || r.fallidas.length) {
        accion = 'parada'
        await avisa(cuenta, {
          nivel: 'error', clave: `parada:${dia}:${r.paradaId || ''}`,
          titulo: `Meta Ads: anuncios parados en «${cuenta.nombre || cuenta.cuenta_id}»`,
          cuerpo: `${motivo} He pausado ${r.pausadas.length} ${r.pausadas.length === 1 ? 'campaña' : 'campañas'}${r.fallidas.length ? ` y ${r.fallidas.length} no se han podido pausar (míralas en Ads Manager)` : ''}. Para reanudar exactamente esas: HELM → Ads → Reanudar.`,
        })
      }
    } else if (!avisos.duro) {
      avisos.duro = true
      accion = 'aviso'
      await avisa(cuenta, { nivel: 'error', clave: `duro:${dia}`, titulo: `Meta Ads: «${cuenta.nombre || cuenta.cuenta_id}» pasa del tope`, cuerpo: `${motivo} La cuenta está en nivel 0 (solo mira): no he parado nada.` })
    }
  } else if (Number(cuenta.tope_diario) > 0 && hoy >= 0.8 * Number(cuenta.tope_diario) && !avisos.p80) {
    avisos.p80 = true
    accion = 'aviso'
    await avisa(cuenta, { clave: `p80:${dia}`, titulo: `Meta Ads: «${cuenta.nombre || cuenta.cuenta_id}» va por el ${porcentaje((hoy / Number(cuenta.tope_diario)) * 100)} del tope de hoy`, cuerpo: `Hoy van ${$(hoy)} de ${$(cuenta.tope_diario)}/día. Si pasa de ${$(duro)}, el vigilante lo para.` })
  }
  await guardaVigilante(cuenta, estado)
  return { cuenta: cuenta.cuenta_id, accion, gasto: hoy, mes }
}

/** El vigilante: todas las cuentas activas (o las de un perfil). Una que falle no para a las demás. */
export async function vigilante({ ahora = new Date(), clientId = null } = {}) {
  let q = supabase.from(CUENTAS).select('*').eq('activa', true)
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  if (error && sinTabla(error)) return []
  if (error) throw error
  const salida = []
  for (const c of data || []) {
    try {
      salida.push(await vigilaCuenta(c, ahora))
    } catch (e) {
      console.warn(`[media-buyer] vigilante ${c.cuenta_id}:`, e?.message || e)
      salida.push({ cuenta: c.cuenta_id, accion: 'error', error: String(e?.message || e) })
    }
  }
  return salida
}
