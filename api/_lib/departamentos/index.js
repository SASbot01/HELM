// HELM — los agentes de departamento: quién hay y cómo se pasan por un perfil.
//
// Cada agente es un archivo de esta carpeta (cobrador.js, seguimiento.js…)
// que exporta por defecto:
//
//   {
//     departamento: 'finanzas',
//     // Qué hace en una pasada por el perfil. Lee con ctx.supabase SOLO lo de
//     // ctx.clientId y devuelve lo que ha visto. No escribe nada hacia fuera:
//     // lo que haya que hacer con un cliente o con dinero, lo propone con
//     // ctx.proponer (va a la bandeja con «Aprobar»). Lo interno y reversible
//     // (una tarea suya) lo puede hacer si ctx.autonomia === 'interno'.
//     async corre(ctx) { return { resumen: 'texto corto' } },
//   }
//
// Su clave es SIEMPRE el nombre del archivo (la de CLAVES): con ella se guardan
// sus propuestas y sus ajustes, aunque el módulo traiga otra `key`.
//
// ctx = { supabase, clientId, perfil: { id, slug, name }, agenciaId, hoy (Date),
//         config (helm_agente_ajustes.config), autonomia, proponer(p), avisar(texto), log(...) }
//   · proponer(p) = propuestas.proponer con clientId y agente puestos (los que
//     traiga p no cuentan): p lleva clave (única por perfil: lo mismo no se
//     propone dos veces), titulo, porque, y herramienta+input (escritura del
//     bot) o mensaje+telefono. Las fechas del input, en AAAA-MM-DD: «mañana»
//     cambiaría de día entre que se propone y se aprueba, y entonces no se hace.
//     Devuelve la fila (con id) si la ha creado. Las que se crean se cuentan
//     solas (salida.propuestas).
//   · avisar(texto) = un mensaje suelto, en texto plano, al Telegram de la agencia (el parte).
//
// Los agentes que aún no tienen archivo simplemente no corren: el registro se
// carga con import dinámico y salta lo que falta (se van añadiendo por tandas).
// Uno que existe pero no carga se avisa en el log.
import { existsSync } from 'node:fs'
import { supabase } from '../../lib/supabase.js'
import { agenciaDe, SECCION_AGENTES } from '../access.js'
import { proponer, avisarAgencia, caducarPropuestas } from '../propuestas.js'

// En el orden en que corren: primero lo que alimenta a los demás (limpieza,
// cobros), el parte del director el último (resume lo que han propuesto).
export const CLAVES = [
  'limpieza-crm', 'cobrador', 'conciliacion', 'caja', 'comisiones',
  'seguimiento', 'llamadas', 'prospector',
  'bienvenida', 'documentacion', 'postventa', 'resenas',
  'guionista-ventas', 'anuncios', 'media-buyer',
  'director',
]

// Lo más que puede tardar un agente en una pasada: uno colgado no para a los demás.
export const MAX_MS_AGENTE = 5 * 60_000

let cargados = null
/** Los agentes que tienen archivo, en el orden de CLAVES. */
export async function agentesDepartamento() {
  if (cargados) return cargados
  const lista = []
  for (const k of CLAVES) {
    const url = new URL(`./${k}.js`, import.meta.url)
    if (!existsSync(url)) continue
    try {
      const m = await import(url.href)
      if (typeof m?.default?.corre === 'function') lista.push({ ...m.default, key: k })
      else console.warn(`[departamentos] ${k} no exporta corre(ctx)`)
    } catch (e) {
      console.warn(`[departamentos] ${k} no carga:`, e?.message || e)
    }
  }
  cargados = lista
  return lista
}

/** Los ajustes de cada agente en un perfil (sin fila: encendido y «proponer»). */
export async function ajustesDe(clientId) {
  const { data, error } = await supabase.from('helm_agente_ajustes').select('agente, activo, autonomia, config').eq('client_id', clientId)
  if (error) throw error
  return new Map((data || []).map(a => [a.agente, a]))
}

// ¿Ha apagado el negocio la sección de los agentes (Secciones)? Entonces nadie
// la ve en el panel (puedeUsarAgentes): tampoco corren ni mandan tarjetas.
async function agentesApagados(clientId) {
  const { data, error } = await supabase.from('helm_permissions').select('sections').eq('client_id', clientId).maybeSingle()
  if (error) return false
  return data?.sections?.[SECCION_AGENTES] === false
}

function conTope(promesa, ms, key) {
  let reloj
  const tope = new Promise((_, ko) => { reloj = setTimeout(() => ko(new Error(`${key} tardó más de ${Math.round(ms / 1000)} s`)), ms) })
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj))
}

/**
 * Pasa los agentes de departamento por un perfil. `solo` limita a unos
 * cuantos (para lanzar uno a mano). Cada agente falla por su cuenta: uno roto
 * (o colgado) no para a los demás. Un perfil apagado, sin agencia o con la
 * sección de agentes apagada no se pasa. `agentes` es para las pruebas.
 * → [{ key, ok, propuestas, resumen | error }]
 */
export async function correDepartamentos({ clientId, hoy = new Date(), solo = null, agentes = null, maxMs = MAX_MS_AGENTE } = {}) {
  if (!clientId) return []
  const { data: perfil, error } = await supabase.from('clients').select('id, slug, name, active').eq('id', clientId).maybeSingle()
  if (error) throw error
  if (!perfil || perfil.active === false) return []
  const agenciaId = await agenciaDe(clientId)
  if (!agenciaId) return []
  if (await agentesApagados(clientId)) return []
  const soloEstos = Array.isArray(solo) ? solo.filter(k => typeof k === 'string') : null
  const ajustes = await ajustesDe(clientId)
  const salida = []
  for (const a of agentes || await agentesDepartamento()) {
    if (soloEstos && !soloEstos.includes(a.key)) continue
    const aj = ajustes.get(a.key)
    if (aj && aj.activo === false) continue
    let creadas = 0
    const ctx = {
      supabase, clientId, perfil: { id: perfil.id, slug: perfil.slug, name: perfil.name }, agenciaId, hoy,
      config: aj?.config && typeof aj.config === 'object' ? aj.config : {}, autonomia: aj?.autonomia || 'proponer',
      proponer: async (p) => {
        const r = await proponer({ ...(p || {}), clientId, agente: a.key })
        if (r?.id) creadas++
        return r
      },
      avisar: (texto) => avisarAgencia(agenciaId, texto),
      log: (...x) => console.log(`[departamentos] ${perfil.slug} · ${a.key}:`, ...x),
    }
    try {
      const r = (await conTope(Promise.resolve().then(() => a.corre(ctx)), maxMs, a.key)) || {}
      salida.push({ key: a.key, ok: true, propuestas: creadas, resumen: String(r.resumen || '').slice(0, 500) })
    } catch (e) {
      console.warn(`[departamentos] ${perfil.slug} · ${a.key} falló:`, e?.message || e)
      salida.push({ key: a.key, ok: false, propuestas: creadas, error: String(e?.message || e).slice(0, 300) })
    }
  }
  return salida
}

// ── El trabajo del worker ───────────────────────────────────────────────────

export const TIPO = 'departamentos'
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** El trabajo: una pasada por el perfil del payload. */
export async function trabajoDepartamentos(job) {
  const { clientId, solo = null } = job?.payload || {}
  if (!clientId) throw new Error('departamentos: falta clientId')
  const r = await correDepartamentos({ clientId, solo })
  const hechas = r.filter(x => x.ok).map(x => `${x.key}${x.propuestas ? ` (${x.propuestas})` : ''}`).join(', ')
  const rotos = r.filter(x => !x.ok).map(x => x.key).join(', ')
  return `departamentos: ${hechas || 'nada'}${rotos ? ` · fallaron: ${rotos}` : ''}`
}

// El worker llama cada minuto: caducar, cada 10 minutos; encolar, como mucho
// cada hora (la clave del trabajo lleva el día, así que un perfil pasa una vez
// al día; mirar otra vez solo recoge los perfiles nuevos).
const CADA_CADUCAR_MS = 10 * 60_000
const CADA_ENCOLAR_MS = 60 * 60_000
const reloj = { caducado: 0, encolado: 0, dia: '' }

/** Olvida cuándo se miró por última vez (para las pruebas). */
export function olvidaReloj() {
  reloj.caducado = 0
  reloj.encolado = 0
  reloj.dia = ''
}

/** ¿Se puede encolar a esta hora de Madrid? Desde las 6:45 y fuera de la edición del diario (7:55-8:40). */
export function horaDeEncolar(ahora = new Date()) {
  const hora = fmtHora.format(ahora)
  return hora >= '06:45' && !(hora >= '07:55' && hora <= '08:40')
}

/**
 * El reloj: cada mañana desde las 6:45 (Madrid) encola una pasada por cada
 * perfil activo con agencia, una vez al día (la clave lleva la fecha), para
 * que el parte llegue antes de empezar el día; durante la edición del diario
 * (7:55-8:40) no encola. A cualquier hora caduca las propuestas pasadas de fecha.
 * → cuántos perfiles ha mirado para encolar (0 si no tocaba).
 */
export async function miraDepartamentos(ahora = new Date()) {
  const t = new Date(ahora).getTime()
  if (t - reloj.caducado >= CADA_CADUCAR_MS || t < reloj.caducado) {
    reloj.caducado = t
    await caducarPropuestas(ahora).catch(e => console.warn('[departamentos] caducar:', e?.message || e))
  }
  if (!horaDeEncolar(ahora)) return 0
  const dia = fmtDia.format(ahora)
  if (reloj.dia === dia && t - reloj.encolado < CADA_ENCOLAR_MS && t >= reloj.encolado) return 0
  const { data: perfiles, error } = await supabase.from('clients').select('id, agencia_id').eq('active', true).not('agencia_id', 'is', null)
  if (error) throw error
  const filas = (perfiles || []).filter(p => p.id && p.agencia_id).map(p => ({
    tipo: TIPO, estado: 'pendiente', payload: { clientId: p.id },
    clave: `${TIPO}:${p.id}:${dia}`, correr_tras: new Date(ahora).toISOString(), max_intentos: 1,
  }))
  if (filas.length) {
    const { error: e2 } = await supabase.from('agent_jobs').upsert(filas, { onConflict: 'clave', ignoreDuplicates: true })
    if (e2) throw e2
  }
  reloj.dia = dia
  reloj.encolado = t
  return filas.length
}
