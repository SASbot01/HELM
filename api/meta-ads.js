// HELM — Meta Ads (el Media buyer) para el panel. Solo la API: la pantalla va después.
//
//   GET  ?action=estado      &clientId=                 → la conexión (token enmascarado), las cuentas con sus topes,
//                                                         lo último del vigilante y lo que hay parado
//   GET  ?action=disponibles &clientId=                 → las cuentas publicitarias que ve el token (admin)
//   GET  ?action=parte       &clientId=                 → ayer y los 7 días por cuenta (de la última sincronización),
//                                                         y las propuestas del agente que esperan
//   GET  ?action=registro    &clientId=[&cuenta=&limite=] → el registro de acciones (lo último primero)
//   POST ?action=conectar    &clientId=  { token }      → comprueba el token con Meta y lo guarda (admin)
//   POST ?action=desconectar &clientId=                 → quita el token y apaga las cuentas (admin)
//   POST ?action=cuentas     &clientId=  { cuentas: ['act_…'] } → qué cuentas lleva el agente (admin)
//   POST ?action=topes       &clientId=  { cuenta, tope_diario, tope_duro?, tope_mensual, objetivo_cpl?, objetivo_cpa?,
//                                          fase?, nivel?, subida_max_pct?, horas_entre_subidas?, dias_min?, gasto_min_factor? } (admin)
//   POST ?action=parar       &clientId=  { cuenta? }    → «Parar los anuncios»: pausa lo activo YA (sin cola) y guarda la
//                                                         lista para reanudar exactamente eso (admin)
//   POST ?action=reanudar    &clientId=  { cuenta, parada? } → reactiva lo de la última parada si cabe en los topes (admin)
//   POST ?action=deshacer    &clientId=  { accion, resumen? } → sin resumen, enseña qué haría; con el resumen que
//                                                         se enseñó, lo hace (si sale lo mismo). Pasa por los topes (admin)
//
// Ver: quien puede usar los agentes del perfil (puedeUsarAgentes). Todo lo que
// cambia algo (y ver las cuentas del token): solo quien administra la agencia
// del perfil, o la plataforma (puedeVerSaldo). Es su dinero.
// El cliente de Meta, los topes y el registro: api/_lib/meta-ads.js.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess, puedeUsarAgentes, puedeVerSaldo } from './_lib/access.js'
import {
  VERSION, PERMISOS, SUBIDA_MAX_PCT, HORAS_ENTRE_SUBIDAS, FACTOR_TOPE_DURO, CUENTAS, ACCIONES,
  maskToken, getMetaConfig, saveMetaConfig, tokenDe, yo, cuentasDelToken, normalizaCuenta, topeDuro,
  leerRegistro, pararTodo, reanudarTodo, paradaPendiente, planPresupuesto, planPausa, planActivar, diaEn, masDias,
} from './_lib/meta-ads.js'
import { agrupaPorAnuncio, textoParte } from './_lib/departamentos/media-buyer.js'

const fuera = (code, error) => Object.assign(new Error(error), { statusCode: code })
const FASES = ['captacion', 'carrito', 'cierre']
const quienEs = (auth) => auth.name || auth.email || 'el panel'

// Lo que se enseña de una cuenta (todo menos nada secreto: aquí no hay tokens).
const CAMPOS_CUENTA = 'id, cuenta_id, nombre, moneda, zona, activa, nivel, tope_diario, tope_duro, tope_mensual, subida_max_pct, horas_entre_subidas, dias_min, gasto_min_factor, objetivo_cpl, objetivo_cpa, fase, topes_por, topes_en, vigilante, updated_at'

/** Un número de un campo de topes: null si viene vacío; error claro si no vale. */
function numero(v, campo, { min = 0, minIncluido = false, max = 10_000_000, entero = false } = {}) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) throw fuera(400, `${campo}: tiene que ser un número.`)
  if (minIncluido ? n < min : n <= min) throw fuera(400, `${campo}: tiene que ser ${minIncluido ? 'como poco' : 'mayor que'} ${min}.`)
  if (n > max) throw fuera(400, `${campo}: como mucho ${max}.`)
  if (entero && !Number.isInteger(n)) throw fuera(400, `${campo}: tiene que ser un número entero.`)
  return Math.round(n * 100) / 100
}

async function cuentasDe(clientId) {
  const { data, error } = await supabase.from(CUENTAS).select(CAMPOS_CUENTA).eq('client_id', clientId).order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

async function cuentaDe(clientId, cuenta) {
  const id = normalizaCuenta(cuenta)
  if (!id) throw fuera(400, 'Falta la cuenta publicitaria (act_…).')
  const { data, error } = await supabase.from(CUENTAS).select('*').eq('client_id', clientId).eq('cuenta_id', id).maybeSingle()
  if (error) throw error
  if (!data) throw fuera(404, `La cuenta ${id} no está conectada a este perfil.`)
  return data
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    if (req.body?.clientId && String(req.body.clientId) !== clientId) {
      return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
    }
    const auth = await requireProfileAccess(req, clientId)
    if (!(await puedeUsarAgentes(auth, clientId))) throw fuera(403, 'Tu rol no puede usar los agentes de este perfil.')
    const accion = String(req.query?.action || '')
    const admin = await puedeVerSaldo(auth, clientId)
    const soloAdmin = () => { if (!admin) throw fuera(403, 'Esto solo lo puede hacer quien administra la agencia.') }

    // ── Lecturas ────────────────────────────────────────────────────────────
    if (req.method === 'GET' && (accion === 'estado' || !accion)) {
      const fila = await getMetaConfig(supabase, clientId)
      const cfg = fila?.enabled === false ? {} : fila?.config || {}
      const cuentas = await cuentasDe(clientId)
      const conParada = await Promise.all(cuentas.map(async c => {
        const p = c.activa ? await paradaPendiente(clientId, c.cuenta_id) : null
        return { ...c, tope_duro_efectivo: topeDuro(c), parada: p ? { id: p.id, creada_en: p.creada_en, quien: p.quien, origen: p.origen, campanas: (p.objetos || []).length } : null }
      }))
      return res.status(200).json({
        conectado: Boolean(cfg.token),
        token: cfg.token && admin ? maskToken(cfg.token) : null,
        usuario: cfg.usuario || null,
        conectado_en: cfg.conectado_en || null,
        cuentas: conParada,
        reglas: { version: VERSION, permisos: PERMISOS, subida_max_pct: SUBIDA_MAX_PCT, horas_entre_subidas: HORAS_ENTRE_SUBIDAS, factor_tope_duro: FACTOR_TOPE_DURO },
        puedeCambiar: admin,
      })
    }

    if (req.method === 'GET' && accion === 'disponibles') {
      soloAdmin()
      const { token } = await tokenDe(clientId)
      const ya = new Map((await cuentasDe(clientId)).map(c => [c.cuenta_id, c]))
      const lista = await cuentasDelToken(token)
      return res.status(200).json({
        cuentas: lista.map(c => ({
          cuenta_id: normalizaCuenta(c.id || c.account_id), nombre: c.name || null, moneda: c.currency || null,
          zona: c.timezone_name || null, estado: c.account_status ?? null, conectada: Boolean(ya.get(normalizaCuenta(c.id || c.account_id))?.activa),
        })),
      })
    }

    if (req.method === 'GET' && accion === 'parte') {
      const cuentas = (await cuentasDe(clientId)).filter(c => c.activa)
      const { data: perfil } = await supabase.from('clients').select('name, slug').eq('id', clientId).maybeSingle()
      const partes = []
      for (const c of cuentas) {
        const hoy = diaEn(c.zona)
        const { data: filas, error } = await supabase.from('helm_ads_metricas').select('*')
          .eq('cuenta_id', c.cuenta_id).eq('client_id', clientId).gte('dia', masDias(hoy, -14)).lt('dia', hoy)
        if (error) throw error
        const porAnuncio = agrupaPorAnuncio(filas || [], hoy)
        const anuncios = [...porAnuncio.entries()].map(([ad_id, x]) => ({ ad_id, nombre: x.nombre, adset_id: x.adset_id, campaign_id: x.campaign_id, ayer: x.ayer, siete_dias: x.actual }))
          .sort((a, b) => b.siete_dias.gasto - a.siete_dias.gasto)
        partes.push({
          cuenta: c.cuenta_id, nombre: c.nombre, hoy, vigilante: c.vigilante || {},
          actualizado: (filas || []).reduce((m, f) => (f.actualizado_en > m ? f.actualizado_en : m), '') || null,
          anuncios,
          texto: textoParte({ perfil: perfil?.name || perfil?.slug || 'Perfil', cuenta: c, hoy, porAnuncio, creadas: [], notas: [] }),
        })
      }
      const { data: pendientes, error: eP } = await supabase.from('helm_propuestas')
        .select('id, titulo, porque, resumen, datos, caduca, creada_en').eq('client_id', clientId).eq('agente', 'media-buyer')
        .eq('estado', 'pendiente').gt('caduca', new Date().toISOString()).order('creada_en', { ascending: false }).limit(50)
      if (eP) throw eP
      return res.status(200).json({ partes, propuestas: pendientes || [] })
    }

    if (req.method === 'GET' && accion === 'registro') {
      const cuenta = req.query?.cuenta ? normalizaCuenta(req.query.cuenta) : null
      if (req.query?.cuenta && !cuenta) throw fuera(400, 'Esa no es una cuenta publicitaria (act_…).')
      const limite = Math.min(Math.max(Number(req.query?.limite) || 100, 1), 500)
      return res.status(200).json({ acciones: await leerRegistro(clientId, { cuenta, limite }) })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
    soloAdmin()
    const b = req.body || {}
    const quien = quienEs(auth)

    // ── La conexión ─────────────────────────────────────────────────────────
    if (accion === 'conectar') {
      const token = String(b.token || '').trim()
      if (token.length < 20 || /\s/.test(token)) throw fuera(400, 'Pega el token del usuario del sistema de Meta (Business Manager → Usuarios del sistema → Generar token).')
      // Antes de guardarlo, que Meta diga quién es y qué cuentas ve.
      const usuario = await yo(token)
      const disponibles = await cuentasDelToken(token)
      await saveMetaConfig(supabase, clientId, {
        token, usuario: { id: usuario?.id || null, name: usuario?.name || null },
        conectado_en: new Date().toISOString(), conectado_por: quien,
      })
      return res.status(200).json({
        ok: true, token: maskToken(token), usuario: { id: usuario?.id || null, name: usuario?.name || null },
        disponibles: disponibles.map(c => ({ cuenta_id: normalizaCuenta(c.id || c.account_id), nombre: c.name || null, moneda: c.currency || null })),
      })
    }

    if (accion === 'desconectar') {
      const fila = await getMetaConfig(supabase, clientId)
      if (fila) await saveMetaConfig(supabase, clientId, { desconectado_en: new Date().toISOString(), desconectado_por: quien }, false)
      const { error } = await supabase.from(CUENTAS).update({ activa: false, updated_at: new Date().toISOString() }).eq('client_id', clientId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    if (accion === 'cuentas') {
      const pedidas = Array.isArray(b.cuentas) ? b.cuentas.map(normalizaCuenta) : null
      if (!pedidas || pedidas.some(c => !c)) throw fuera(400, 'cuentas: una lista de cuentas publicitarias (act_…).')
      const { token } = await tokenDe(clientId)
      const delToken = new Map((await cuentasDelToken(token)).map(c => [normalizaCuenta(c.id || c.account_id), c]))
      const ajenas = pedidas.filter(c => !delToken.has(c))
      if (ajenas.length) throw fuera(400, `El token no ve ${ajenas.join(', ')}: asígnalas al usuario del sistema en Business Manager.`)
      const unicas = [...new Set(pedidas)]
      if (unicas.length) {
        const { data: deOtro, error: eO } = await supabase.from(CUENTAS).select('cuenta_id, client_id').in('cuenta_id', unicas)
        if (eO) throw eO
        const otras = (deOtro || []).filter(c => c.client_id !== clientId).map(c => c.cuenta_id)
        if (otras.length) throw fuera(409, `${otras.join(', ')} ya está conectada a otro perfil de HELM: cada cuenta, en un solo perfil (si no, tendría dos juegos de topes).`)
      }
      const ahora = new Date().toISOString()
      for (const id of unicas) {
        const m = delToken.get(id)
        const { error } = await supabase.from(CUENTAS).upsert({
          client_id: clientId, cuenta_id: id, nombre: m.name || null, moneda: m.currency || 'EUR',
          zona: m.timezone_name || 'Europe/Madrid', activa: true, updated_at: ahora,
        }, { onConflict: 'cuenta_id' })
        if (error) throw error
      }
      // Las que ya no están en la lista dejan de llevarse (se guardan los topes).
      const apagar = (await cuentasDe(clientId)).filter(c => c.activa && !unicas.includes(c.cuenta_id)).map(c => c.cuenta_id)
      if (apagar.length) {
        const { error } = await supabase.from(CUENTAS).update({ activa: false, updated_at: ahora }).eq('client_id', clientId).in('cuenta_id', apagar)
        if (error) throw error
      }
      return res.status(200).json({ ok: true, cuentas: await cuentasDe(clientId) })
    }

    // ── Los topes (solo el dueño de la agencia) ─────────────────────────────
    if (accion === 'topes') {
      const c = await cuentaDe(clientId, b.cuenta)
      const cambio = {}
      const pon = (campo, valor) => { if (Object.hasOwn(b, campo)) cambio[campo] = valor() }
      pon('tope_diario', () => numero(b.tope_diario, 'tope_diario'))
      pon('tope_duro', () => numero(b.tope_duro, 'tope_duro'))
      pon('tope_mensual', () => numero(b.tope_mensual, 'tope_mensual'))
      pon('objetivo_cpl', () => numero(b.objetivo_cpl, 'objetivo_cpl'))
      pon('objetivo_cpa', () => numero(b.objetivo_cpa, 'objetivo_cpa'))
      pon('subida_max_pct', () => numero(b.subida_max_pct, 'subida_max_pct', { max: SUBIDA_MAX_PCT }) ?? SUBIDA_MAX_PCT)
      pon('horas_entre_subidas', () => numero(b.horas_entre_subidas, 'horas_entre_subidas', { min: HORAS_ENTRE_SUBIDAS, minIncluido: true, entero: true, max: 24 * 60 }) ?? HORAS_ENTRE_SUBIDAS)
      pon('dias_min', () => numero(b.dias_min, 'dias_min', { min: 3, minIncluido: true, entero: true, max: 60 }) ?? 3)
      pon('gasto_min_factor', () => numero(b.gasto_min_factor, 'gasto_min_factor', { min: 1, minIncluido: true, max: 20 }) ?? 1.5)
      pon('fase', () => {
        if (!FASES.includes(b.fase)) throw fuera(400, `fase: ${FASES.join(', ')}.`)
        return b.fase
      })
      pon('nivel', () => {
        const n = Number(b.nivel)
        if (n !== 0 && n !== 1) throw fuera(400, 'nivel: 0 (solo mira) o 1 (propone y tú apruebas). Más autonomía, todavía no.')
        return n
      })
      if (!Object.keys(cambio).length) throw fuera(400, 'No hay nada que cambiar.')
      const nuevo = { ...c, ...cambio }
      const n = (k) => (nuevo[k] == null ? null : Number(nuevo[k]))
      if (n('tope_duro') != null && n('tope_diario') != null && n('tope_duro') < n('tope_diario')) throw fuera(400, 'El tope duro del día no puede ser menor que el presupuesto diario máximo.')
      if (n('tope_mensual') != null && n('tope_diario') != null && n('tope_mensual') < n('tope_diario')) throw fuera(400, 'El tope mensual no puede ser menor que el presupuesto diario máximo.')
      const antes = Object.fromEntries(Object.keys(cambio).map(k => [k, c[k] ?? null]))
      const ahora = new Date().toISOString()
      // Primero el registro (solo se añade); si no se puede apuntar, no se cambia.
      const { error: eR } = await supabase.from(ACCIONES).insert({
        client_id: clientId, cuenta_id: c.cuenta_id, objeto_tipo: 'cuenta', objeto_id: c.cuenta_id, objeto_nombre: c.nombre || null,
        accion: 'topes', antes, despues: cambio, porque: b.motivo ? String(b.motivo).slice(0, 500) : null,
        quien, origen: 'panel', estado: 'hecho',
      })
      if (eR) throw fuera(500, `No se ha podido apuntar el cambio en el registro, así que no se ha hecho. (${eR.message})`)
      const { error } = await supabase.from(CUENTAS).update({ ...cambio, topes_por: quien, topes_en: ahora, updated_at: ahora }).eq('id', c.id).eq('client_id', clientId)
      if (error) throw error
      return res.status(200).json({ ok: true, cuenta: { ...nuevo, topes_por: quien, topes_en: ahora, tope_duro_efectivo: topeDuro(nuevo) } })
    }

    // ── Parar los anuncios y reanudarlos ────────────────────────────────────
    if (accion === 'parar') {
      const cuentas = b.cuenta ? [await cuentaDe(clientId, b.cuenta)] : (await cuentasDe(clientId)).filter(c => c.activa)
      if (!cuentas.length) throw fuera(400, 'Este perfil no tiene cuentas de Meta conectadas.')
      const resultado = []
      for (const c of cuentas) {
        try {
          const r = await pararTodo({ clientId, cuenta: c.cuenta_id, quien, origen: 'panel', motivo: b.motivo ? String(b.motivo).slice(0, 500) : 'Parar los anuncios (panel)' })
          resultado.push({ cuenta: c.cuenta_id, ok: !r.fallidas.length, ...r })
        } catch (e) {
          resultado.push({ cuenta: c.cuenta_id, ok: false, error: e?.message || String(e) })
        }
      }
      const ok = resultado.every(r => r.ok)
      return res.status(ok ? 200 : 207).json({ ok, resultado })
    }

    if (accion === 'reanudar') {
      const c = await cuentaDe(clientId, b.cuenta)
      const r = await reanudarTodo({ clientId, cuenta: c.cuenta_id, parada: b.parada || null, quien, origen: 'panel' })
      return res.status(r.fallidas.length ? 207 : 200).json({ ok: !r.fallidas.length, ...r })
    }

    // ── Deshacer una acción (la contraria, por los mismos topes) ────────────
    if (accion === 'deshacer') {
      const id = String(b.accion || '')
      const { data: fila, error } = await supabase.from(ACCIONES).select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
      if (error) throw error
      if (!fila) throw fuera(404, 'Esa acción no existe en el registro de este perfil.')
      const intentoId = fila.intento_id || fila.id
      const { data: hecha, error: eH } = await supabase.from(ACCIONES).select('id, estado').eq('intento_id', intentoId).in('estado', ['hecho', 'sin_confirmar']).limit(1)
      if (eH) throw eH
      const { data: intento, error: eI } = await supabase.from(ACCIONES).select('*').eq('id', intentoId).eq('client_id', clientId).maybeSingle()
      if (eI) throw eI
      if (!intento || !hecha?.length) throw fuera(400, 'Esa acción no llegó a hacerse: no hay nada que deshacer.')
      const { data: perfil } = await supabase.from('clients').select('name, slug').eq('id', clientId).maybeSingle()
      const comun = {
        clientId, perfil: perfil?.name || perfil?.slug || 'el perfil', cuenta: intento.cuenta_id, tipo: intento.objeto_tipo,
        objeto: intento.objeto_id, motivo: `Deshacer la acción del ${String(intento.creada_en).slice(0, 16).replace('T', ' ')}`,
        quien, origen: 'panel', deshace: intento.id,
      }
      let plan
      if (intento.accion === 'presupuesto') plan = await planPresupuesto({ ...comun, antes: intento.despues?.valor, despues: intento.antes?.valor })
      else if (intento.accion === 'pausar') plan = await planActivar(comun)
      else if (intento.accion === 'activar') plan = await planPausa(comun)
      else if (intento.accion === 'parar_todo') throw fuera(400, 'Para deshacer una parada, usa «Reanudar».')
      else throw fuera(400, 'Esa acción no se deshace desde aquí.')
      if (plan.ya) return res.status(200).json({ ok: true, ya: true, texto: plan.ya.hecho, resumen: plan.resumen })
      if (typeof b.resumen !== 'string') return res.status(200).json({ ok: true, previa: true, resumen: plan.resumen })
      if (b.resumen.trim() !== plan.resumen.trim()) return res.status(409).json({ ok: false, error: 'Ha cambiado algo desde que lo viste: no lo he hecho.', resumen: plan.resumen })
      const r = await plan.aplicar()
      return res.status(200).json({ ok: true, texto: r.hecho, accion: r.accion })
    }

    return res.status(400).json({ error: 'Acción no válida' })
  } catch (err) {
    const code = err.statusCode || 500
    if (code >= 500) console.error('[meta-ads]', err?.message || err)
    return res.status(code).json({ error: code >= 500 && !err.statusCode ? 'Error interno' : err.message })
  }
}
