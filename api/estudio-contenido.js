// HELM — Estudio de contenido: el estudio de verdad del Informe de contenido.
//
//   GET                &clientId=        → el último estudio listo, el historial,
//                                          si hay uno en marcha, lo que cuesta,
//                                          si hay Instagram, la base del algoritmo
//                                          y, si lo último pedido falló, por qué
//   GET  ?action=ver   &clientId=&id=    → { estudio }: uno del historial, con la
//                                          misma forma que el del GET
//   POST ?action=ahora &clientId=        → abre la fila 'en_curso' y encola el trabajo
//
// Lo escribe el worker (api/_lib/estudio-contenido/generar.js). Aquí solo se
// lee y se pide. Las tres acciones piden, además de entrar al perfil, poder ver
// el Informe de contenido (puedeVerMetricas, abajo).
//
// Los errores van como { error, codigo }: 'sin_instagram' (400), 'en_curso'
// (409), 'tope_diario' (429) y 'sin_saldo' (402). Un fallo interno no se
// enseña: el detalle va al log y al usuario le llega un mensaje genérico.
import { supabase } from './lib/supabase.js'
import { applyCors } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import { exigirSaldo, pagaConCreditos, precioEuros, costeUsd } from './_lib/creditos.js'
import { getIgConfig } from './_lib/instagram.js'
import { encolaEstudio, modeloEstudio, TIPO } from './_lib/estudio-contenido/generar.js'
import { ALGORITMO_RESUMEN } from './_lib/estudio-contenido/conocimiento.js'

const TABLA = 'helm_estudio_contenido'
const MAX_AL_DIA = 3
const HISTORIAL = 20
// Una fila «en curso» que lleva más que esto TRABAJÁNDOSE (desde empezado_en,
// que pone el worker al cogerla) se quedó colgada: el worker se cayó a mitad.
// Pasa a error y deja pedir otro. La espera en la cola no cuenta: por la
// mañana el worker va cargado y un pedido puede esperar más de 30 min sin que
// le pase nada; solo uno que lleva 6 h sin empezar se da por perdido. El
// worker hace lo mismo antes de abrir el de los lunes (generar.js), con los
// mismos mensajes.
const COLGADO_MS = 30 * 60_000
const SIN_EMPEZAR_MS = 6 * 3_600_000
const MENSAJE_COLGADO = 'El estudio se quedó a medias y se ha dado por perdido. Vuelve a pedirlo; si llegó a usar la IA, solo se ha cobrado lo que usó.'
const MENSAJE_SIN_EMPEZAR = 'El estudio no llegó a empezar (la cola iba muy cargada) y se ha dado por perdido. Vuelve a pedirlo. No se ha cobrado nada.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Lo que se devuelve de un estudio, en el GET y en `ver`: la misma forma.
const CAMPOS_ESTUDIO = 'id, generado_en, estado, datos, estudio, modelo'

// Copia de NIVELES_TOTALES y DEFAULT_VISIBLE de src/helm/permisos.js. Se
// duplica a propósito: aquel archivo tira del cliente de Supabase del
// navegador y api/ no lo importa (lo mismo hace api/avatar.js).
const NIVELES_TOTALES = ['admin,ceo,director', 'admin']
const DEFAULT_VISIBLE = {
  closer: ['crm', 'diario', 'tareas'],
  setter: ['crm', 'diario', 'tareas'],
  csm: ['crm', 'diario', 'tareas', 'formularios', 'biblioteca'],
  editor: ['contenido', 'tareas', 'biblioteca', 'equipos-ia', 'metricas'],
  otro: ['tareas'],
}

/**
 * ¿Puede esta sesión ver (y pedir) el estudio de contenido de este perfil?
 *
 * La misma escalera que sigue el panel para enseñar el Informe de contenido
 * (HelmApp → puede('metricas'), con seccionEncendida y puedeVer de
 * src/helm/permisos.js): que el negocio no lo haya apagado en Secciones y,
 * encima, mandar en todo el perfil o tener 'metricas' visible para tu rol (el
 * editor lo trae de serie). El endpoint se puede llamar a mano, y cada estudio
 * gasta créditos de la agencia.
 */
export async function puedeVerMetricas(auth, clientId) {
  // Sin la tabla o sin la columna, como el panel: todo encendido y los
  // permisos de serie.
  const { data, error } = await supabase.from('helm_permissions')
    .select('sections, visible').eq('client_id', clientId).maybeSingle()
  const permisos = error ? {} : (data || {})
  if (permisos.sections?.metricas === false) return false

  if (auth.plataforma || auth.superadmin || auth.role === 'superadmin') return true
  if (NIVELES_TOTALES.includes(auth.nivel)) return true

  // El oficio (closer, editor…) no va en el token: se mira en su ficha de este perfil.
  const { data: persona, error: eRol } = await supabase.from('helm_team')
    .select('role').eq('login_id', auth.userId).eq('client_id', clientId).maybeSingle()
  if (eRol) throw eRol
  // Sin oficio es quien montó el negocio (o un acceso de antes de los roles), y
  // el dueño no se limita: los dos lo ven todo, también en el panel.
  const rol = persona?.role
  if (!rol || rol === 'dueno') return true
  // Como loadPermisos: si el perfil guardó permisos, mandan los suyos; el rol
  // que no aparezca en ellos se queda con los de serie.
  const guardados = permisos.visible && typeof permisos.visible === 'object' && Object.keys(permisos.visible).length
    ? permisos.visible : DEFAULT_VISIBLE
  const lista = guardados[rol] ?? DEFAULT_VISIBLE[rol] ?? []
  return Array.isArray(lista) && lista.includes('metricas')
}

const conectado = async (clientId) => {
  const fila = await getIgConfig(supabase, clientId)
  return Boolean(fila && fila.enabled !== false && fila.config?.token)
}

/**
 * Las filas «en curso» perdidas pasan a error: las que llevan más de 30 min
 * trabajándose y las que llevan 6 h en la cola sin que nadie las coja.
 */
async function cierraColgados(clientId) {
  const ahora = Date.now()
  const { error } = await supabase.from(TABLA).update({ estado: 'error', error: MENSAJE_COLGADO })
    .eq('client_id', clientId).eq('estado', 'en_curso')
    .lt('empezado_en', new Date(ahora - COLGADO_MS).toISOString())
  if (error) throw error
  const { error: eCola } = await supabase.from(TABLA).update({ estado: 'error', error: MENSAJE_SIN_EMPEZAR })
    .eq('client_id', clientId).eq('estado', 'en_curso').is('empezado_en', null)
    .lt('generado_en', new Date(ahora - SIN_EMPEZAR_MS).toISOString())
  if (eCola) throw eCola
}

/**
 * ¿Hay un estudio en marcha? Una fila «en curso» (la abre el POST, o el
 * worker en el de los lunes) o un estudio de los lunes aún en la cola, que
 * todavía no tiene fila. Antes, las colgadas se cierran.
 */
async function enCurso(clientId) {
  await cierraColgados(clientId)
  const [filas, cola] = await Promise.all([
    supabase.from(TABLA).select('id').eq('client_id', clientId).eq('estado', 'en_curso').limit(1),
    supabase.from('agent_jobs').select('id, payload').eq('tipo', TIPO).eq('payload->>clientId', clientId)
      .in('estado', ['pendiente', 'corriendo']).limit(20),
  ])
  if (filas.error) throw filas.error
  if (cola.error) throw cola.error
  if (filas.data?.length) return true
  // Los pedidos del panel ya tienen su fila: si se dio por perdida, su trabajo
  // en la cola no la va a resucitar (generar.js no repite lo que no está en curso).
  return (cola.data || []).some(j => j.payload?.origen === 'auto')
}

// La medianoche de hoy en Madrid, en UTC: el tope es «3 al día» del día de
// aquí, no de las últimas 24 horas.
const fmtPartes = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export function inicioDiaMadrid(d = new Date()) {
  const p = Object.fromEntries(fmtPartes.formatToParts(d).map(x => [x.type, x.value]))
  const pared = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  const desfase = pared - Math.floor(d.getTime() / 60_000) * 60_000
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - desfase).toISOString()
}

/** Estudios pedidos hoy para el perfil. El de los lunes ('auto') no cuenta: no lo pidió nadie. */
async function pedidosHoy(clientId) {
  const { data, error } = await supabase.from('agent_jobs').select('id, payload')
    .eq('tipo', TIPO).eq('payload->>clientId', clientId).gte('created_at', inicioDiaMadrid()).limit(50)
  if (error) throw error
  return (data || []).filter(j => j.payload?.origen !== 'auto').length
}

// Lo que suele gastar un estudio (unos 20.000 tokens de entrada, con la
// doctrina, y 8.000 de salida con el pensamiento), al precio de los créditos.
const costeAprox = () =>
  Math.round(precioEuros(costeUsd(modeloEstudio(), { input_tokens: 20_000, output_tokens: 8_000 })) * 100) / 100

const fuera = (status, message, codigo) => Object.assign(new Error(message), { statusCode: status, ...(codigo ? { codigo } : {}) })
const GENERICO = 'No se ha podido completar ahora mismo. Vuelve a intentarlo en un rato.'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const clientId = String(req.query?.clientId || '')
    if (!clientId) return res.status(400).json({ error: 'Falta el perfil' })
    const auth = await requireProfileAccess(req, clientId)
    if (!(await puedeVerMetricas(auth, clientId))) {
      throw fuera(403, 'El estudio de contenido no está disponible para tu acceso. Pídeselo a quien lleva el negocio.')
    }
    const accion = String(req.query?.action || '')

    if (!accion && req.method === 'GET') {
      // Primero si hay uno en marcha: de paso cierra los colgados, que así
      // salen ya como error en el historial.
      const marcha = await enCurso(clientId)
      const [listo, historial, ig, paga] = await Promise.all([
        supabase.from(TABLA).select(CAMPOS_ESTUDIO)
          .eq('client_id', clientId).eq('estado', 'listo').order('generado_en', { ascending: false }).limit(1),
        supabase.from(TABLA).select('id, generado_en, estado, error')
          .eq('client_id', clientId).order('generado_en', { ascending: false }).limit(HISTORIAL),
        conectado(clientId),
        pagaConCreditos(clientId),
      ])
      if (listo.error) throw listo.error
      if (historial.error) throw historial.error
      const estudio = listo.data?.[0] || null
      // Si lo último que se pidió falló (después del último bueno, y sin otro
      // en marcha detrás), se dice por qué. En `error` el worker deja un
      // mensaje para el usuario, nunca el fallo interno (ese va al log).
      const ultimo = historial.data?.[0]
      return res.status(200).json({
        estudio,
        historial: (historial.data || []).map(({ id, generado_en, estado }) => ({ id, generado_en, estado })),
        en_curso: marcha,
        // A una agencia que no paga (la de la casa) no le cuesta nada.
        coste_aprox_eur: paga ? costeAprox() : 0,
        conectado: ig,
        algoritmo: ALGORITMO_RESUMEN,
        ultimo_error: ultimo?.estado === 'error'
          ? { generado_en: ultimo.generado_en, mensaje: String(ultimo.error || 'El estudio no se ha podido hacer. Vuelve a pedirlo.').slice(0, 400) }
          : null,
      })
    }

    if (accion === 'ver' && req.method === 'GET') {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el estudio' })
      // Siempre dentro del perfil comprobado: un id de otro perfil (o que ni
      // siquiera es un id) no existe aquí.
      if (!UUID.test(id)) return res.status(404).json({ error: 'Ese estudio no existe' })
      const { data, error } = await supabase.from(TABLA).select(CAMPOS_ESTUDIO)
        .eq('client_id', clientId).eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Ese estudio no existe' })
      return res.status(200).json({ estudio: data })
    }

    if (accion === 'ahora' && req.method === 'POST') {
      if (!(await conectado(clientId))) {
        throw fuera(400, 'Conecta el Instagram del perfil para poder hacer el estudio.', 'sin_instagram')
      }
      const yaHay = () => fuera(409, 'Ya hay un estudio en marcha. Estará listo en unos minutos.', 'en_curso')
      if (await enCurso(clientId)) throw yaHay()
      if ((await pedidosHoy(clientId)) >= MAX_AL_DIA) {
        throw fuera(429, `Ya se han pedido ${MAX_AL_DIA} estudios hoy para este perfil. Mañana puedes pedir otro.`, 'tope_diario')
      }
      // Sin saldo no se encola: el worker no llegaría a llamar a Claude y el
      // estudio saldría en error. La agencia de la casa (sin_cobro) no paga.
      if (await pagaConCreditos(clientId)) await exigirSaldo()

      // La fila se abre AQUÍ y el worker rellena esa. Con dos clics seguidos,
      // los dos pasan las comprobaciones de arriba, pero el índice único de
      // la migración 113 (una fila 'en_curso' por perfil) deja entrar solo a
      // uno: el otro se lleva un 409 y no se encola ni se cobra.
      const { data: fila, error: eFila } = await supabase.from(TABLA)
        .insert({ client_id: clientId, estado: 'en_curso', modelo: modeloEstudio() }).select('id').single()
      if (eFila?.code === '23505') throw yaHay()
      if (eFila) throw eFila
      try {
        await encolaEstudio(clientId, { origen: 'panel', estudioId: fila.id })
      } catch (e) {
        // Sin trabajo en la cola, esa fila no la va a rellenar nadie.
        await supabase.from(TABLA).update({ estado: 'error', error: 'No se ha podido poner en marcha el estudio. Vuelve a pedirlo. No se ha cobrado nada.' }).eq('id', fila.id)
        throw e
      }
      return res.status(200).json({ encolado: true, id: fila.id })
    }

    return res.status(400).json({ error: `Acción desconocida: ${accion || '(ninguna)'}` })
  } catch (e) {
    const code = e.statusCode || (/unauthori/i.test(e.message) ? 401 : 500)
    if (code >= 500) {
      console.error('[estudio-contenido]', e?.message || e)
      return res.status(500).json({ error: GENERICO })
    }
    // El 402 lo lanza exigirSaldo (creditos.js), que no sabe de códigos.
    const codigo = e.codigo || (code === 402 ? 'sin_saldo' : null)
    return res.status(code).json({ error: e.message, ...(codigo ? { codigo } : {}) })
  }
}
