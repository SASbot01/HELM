// HELM — quién VE qué y quién puede EDITAR qué.
//
// Dos matrices, y la diferencia importa:
//
//   visible → qué secciones le aparecen en el menú. Lo que no está, no existe
//             para esa persona: ni en el menú ni entrando por la URL.
//   matrix  → de lo que ve, qué puede modificar. El resto lo ve en lectura.
//
// Al principio solo había la segunda, porque el panel lo usaba el dueño y su
// mano derecha. Con closers y setters entrando con su cuenta hace falta la
// primera: un closer no tiene por qué ver las finanzas del negocio, ni el
// equipo, ni lo que cobra cada compañero.
//
// El dueño siempre puede todo y no aparece en las matrices: un sistema donde el
// dueño puede quedarse sin acceso a su propio negocio es un sistema roto.
import { supabase } from './lib'

// Las áreas editables. La clave coincide con la de la vista en HelmApp para
// que la comprobación sea directa.
export const AREAS = [
  { key: 'crm', label: 'CRM', desc: 'Contactos, etapas y actividad' },
  { key: 'servicios', label: 'Servicios', desc: 'El catálogo' },
  { key: 'documentos', label: 'Documentos', desc: 'Presupuestos y facturas' },
  { key: 'gastos', label: 'Gastos', desc: 'Facturas de compra' },
  { key: 'equipo', label: 'Equipo', desc: 'Personas, pagos y contratos' },
  { key: 'ventas', label: 'Ventas', desc: 'Registrar y cancelar ventas' },
  { key: 'diario', label: 'Diario', desc: 'Reportes diarios' },
  { key: 'finanzas', label: 'Finanzas', desc: 'Movimientos y comisiones' },
  { key: 'contenido', label: 'Agentes', desc: 'Agentes y creadores de referencia' },
  { key: 'onboarding', label: 'Onboarding', desc: 'Respuestas y Biblia' },
  { key: 'enlaces', label: 'Enlaces', desc: 'URLs del negocio' },
  { key: 'ajustes', label: 'Ajustes', desc: 'Integraciones y permisos' },
  { key: 'tareas', label: 'Tareas', desc: 'Plugin de tareas' },
  { key: 'biblioteca', label: 'Biblioteca', desc: 'Documentos de la IA' },
  { key: 'formularios', label: 'Formularios', desc: 'Constructor y respuestas' },
  { key: 'prospeccion', label: 'Scraper', desc: 'Plugin de captación de leads' },
]

// Punto de partida razonable: cada rol edita lo suyo. Es lo que se aplica
// mientras nadie haya tocado la matriz.
export const DEFAULT_MATRIX = {
  closer: ['crm', 'ventas', 'diario', 'tareas'],
  setter: ['crm', 'diario', 'tareas'],
  csm: ['crm', 'diario', 'tareas', 'formularios', 'biblioteca'],
  editor: ['contenido', 'tareas'],
  otro: [],
}

// ── Visibilidad ────────────────────────────────────────────────────────────
// Las secciones del menú. La clave es la del NAV de HelmApp, para que la
// comprobación sea directa. Ajustes NO está en la lista a propósito: es donde se
// configuran los permisos, así que solo entra quien tiene nivel de acceso total.
export const SECCIONES = [
  { key: 'informe', label: 'Informe', desc: 'Resumen y KPIs del negocio' },
  { key: 'onboarding', label: 'Onboarding', desc: 'Formularios y Biblia' },
  { key: 'crm', label: 'CRM', desc: 'Contactos y pipeline' },
  { key: 'avatar', label: 'Avatar', desc: 'Estudio del cliente tipo a partir del CRM' },
  { key: 'radar', label: 'Radar', desc: 'Tecnología e ideas nuevas para investigar (privado)' },
  { key: 'servicios', label: 'Servicios', desc: 'Catálogo de servicios' },
  { key: 'documentos', label: 'Documentos', desc: 'Presupuestos y facturas' },
  { key: 'gastos', label: 'Gastos', desc: 'Facturas de compra' },
  { key: 'equipo', label: 'Equipo', desc: 'Personas, pagos y contratos' },
  { key: 'ventas', label: 'Ventas', desc: 'Reporte de ventas' },
  { key: 'diario', label: 'Diario', desc: 'Reportes diarios' },
  { key: 'finanzas', label: 'Finanzas', desc: 'Ingresos, gastos y comisiones' },
  { key: 'dia', label: 'Mi día', desc: 'Rituales diarios con la IA' },
  { key: 'noticias', label: 'Noticias', desc: 'Las tres noticias del día de IA y ciberseguridad, cada mañana a las 6:00' },
  { key: 'contenido', label: 'Agentes', desc: 'Agentes de IA y creadores de referencia' },
  { key: 'roadmap', label: 'Roadmap', desc: 'Plan del negocio a seis meses, mes a mes y semana a semana' },
  { key: 'ads', label: 'Ads', desc: 'Anuncios y su test de 5 días por conversiones' },
  { key: 'llamadas', label: 'Llamadas', desc: 'Agenda de llamadas' },
  { key: 'enlaces', label: 'Enlaces', desc: 'URLs del negocio' },
  { key: 'plugins', label: 'Plugins', desc: 'Catálogo de módulos' },
  { key: 'tareas', label: 'Tareas', desc: 'Plugin de tareas' },
  { key: 'biblioteca', label: 'Biblioteca', desc: 'Documentos de la IA' },
  { key: 'formularios', label: 'Formularios', desc: 'Constructor y respuestas' },
  { key: 'prospeccion', label: 'Scraper', desc: 'Leads de cinco fuentes al embudo' },
  { key: 'equipos-ia', label: 'Equipos IA', desc: 'Agentes: de onboarding a plan de grabación' },
  { key: 'actividad', label: 'Actividad', desc: 'Timeline del equipo' },
  { key: 'fiscal', label: 'Fiscal', desc: 'Plazos y modelos de una asesoría' },
  { key: 'copiloto', label: 'Copiloto Fiscal', desc: 'IA con los plazos y clientes del despacho' },
]

// Lo que ve cada rol si nadie ha tocado nada. Un closer entra a hacer su
// trabajo: sus contactos y su reporte. Nada de finanzas ni de nóminas ajenas.
export const DEFAULT_VISIBLE = {
  closer: ['crm', 'diario', 'tareas'],
  setter: ['crm', 'diario', 'tareas'],
  csm: ['crm', 'diario', 'tareas', 'formularios', 'biblioteca'],
  // El editor ve la estrategia que ejecuta: sin ella graba a ciegas.
  editor: ['contenido', 'tareas', 'biblioteca', 'equipos-ia'],
  otro: ['tareas'],
}

export const OWNER_ROLE = 'dueno'

// Niveles de acceso que mandan sobre todo el perfil, pase lo que pase en la
// matriz. Vienen de `team.role` (ver api/equipo.js → NIVELES).
const NIVELES_TOTALES = ['admin,ceo,director', 'admin']

// ¿Este acceso manda sobre todo el perfil? Lo usan las pantallas que solo tienen
// sentido para quien lleva el negocio (la guía de bienvenida, Ajustes…).
export const accesoTotal = (nivel) => NIVELES_TOTALES.includes(nivel)

/**
 * Quién está mirando el panel ahora mismo.
 *
 * Tres respuestas posibles y las tres importan:
 *   - superadmin → entra a todos los perfiles y lo ve todo.
 *   - acceso total (dueño o admin del negocio) → ve todo lo de SU perfil.
 *   - miembro del equipo → ve lo suyo, y `helmTeamId` dice quién es.
 *
 * `helmTeamId` viene vacío en las sesiones abiertas antes de que el login
 * empezara a guardarlo, así que quien lo use tiene que contar con que puede no
 * haber persona identificada — y no esconderle entonces media pantalla.
 */
export function sesionHelm() {
  const vacia = { esSuperadmin: false, mandaEnTodo: false, helmTeamId: null, email: null, nombre: null }
  if (typeof localStorage === 'undefined') return vacia

  const superadmin = localStorage.getItem('bw_superadmin')
  if (superadmin) {
    return { esSuperadmin: true, mandaEnTodo: true, helmTeamId: null, email: superadmin, nombre: 'Equipo HELM' }
  }

  let s = null
  try { s = JSON.parse(localStorage.getItem('bw_client') || 'null') } catch { return vacia }
  if (!s) return vacia

  return {
    esSuperadmin: false,
    // Sin rol de oficio es quien montó el negocio (y también las sesiones
    // antiguas, que no guardaban nivel). Es el mismo criterio que usa HelmApp
    // para la guía de bienvenida.
    mandaEnTodo: accesoTotal(s.level) || !s.teamRole,
    helmTeamId: s.helmTeamId || null,
    email: s.email || null,
    nombre: s.name || s.email || null,
  }
}

// El dueño no se puede limitar: se contesta antes de mirar la matriz. Un
// sistema donde el propietario puede quedarse sin acceso a su propio negocio
// está roto, y esa es una puerta que nunca conviene dejar abierta.
export function puedeEditar(matrix, role, area, nivelAcceso = null) {
  if (nivelAcceso && NIVELES_TOTALES.includes(nivelAcceso)) return true
  if (!role || role === OWNER_ROLE) return true
  const lista = matrix?.[role] ?? DEFAULT_MATRIX[role] ?? []
  return lista.includes(area)
}

/**
 * ¿Le aparece esta sección a esta persona?
 *
 * Igual que puedeEditar, con la misma escalera: nivel de acceso total → dueño →
 * matriz → defaults. Y sin rol (el acceso "suelto" de un perfil, o una sesión
 * antigua sin rol guardado) se ve todo: quitar secciones a quien no sabemos
 * quién es sería dejar fuera al propio dueño.
 */
export function puedeVer(visible, role, seccion, nivelAcceso = null) {
  if (nivelAcceso && NIVELES_TOTALES.includes(nivelAcceso)) return true
  if (!role || role === OWNER_ROLE) return true
  const lista = visible?.[role] ?? DEFAULT_VISIBLE[role] ?? []
  return lista.includes(seccion)
}

export async function loadPermisos(clientId) {
  const { data, error } = await supabase
    .from('helm_permissions').select('matrix, visible').eq('client_id', clientId).maybeSingle()
  if (error) {
    console.warn('[helm] loadPermisos', error.message)
    // Puede faltar la tabla entera (helm_operativa.sql) o solo la columna
    // `visible` (helm_permisos_ver.sql). En los dos casos se trabaja con los
    // valores por defecto y la vista avisa de qué migración falta.
    const falta = /does not exist|schema cache|column/i.test(error.message)
    return { matrix: DEFAULT_MATRIX, visible: DEFAULT_VISIBLE, missing: falta }
  }
  const lleno = (o) => o && Object.keys(o).length > 0
  return {
    matrix: lleno(data?.matrix) ? data.matrix : DEFAULT_MATRIX,
    visible: lleno(data?.visible) ? data.visible : DEFAULT_VISIBLE,
    missing: false,
  }
}

export async function savePermisos(clientId, matrix, visible) {
  const fila = { client_id: clientId, matrix, updated_at: new Date().toISOString() }
  if (visible) fila.visible = visible
  const { error } = await supabase.from('helm_permissions')
    .upsert(fila, { onConflict: 'client_id' })
  if (error) throw error
}

// ── Secciones encendidas y apagadas ────────────────────────────────────────
// Distinto de `visible`, aunque se parezcan: `visible` es por ROL (a un closer
// no le enseñamos Finanzas), y esto es por NEGOCIO (este negocio no usa Diario,
// así que no le sale a nadie). Se aplican los dos: una sección tiene que estar
// encendida en el negocio Y permitida para tu rol.
//
// Solo se guardan las apagadas. Lo que no está en el objeto, está encendido:
// así una sección nueva de HELM sale sola en todos los perfiles.

// Las que no se pueden apagar. Sin Ajustes no hay forma de volver a entrar a la
// configuración, y sin Secciones no hay forma de volver a encender nada.
export const SECCIONES_FIJAS = ['ajustes', 'secciones']

// Secciones que nacen APAGADAS, al revés que las demás. Dos familias:
//
//   · de SECTOR — una asesoría quiere el control de plazos fiscales; un
//     infoproducto vería una sección con modelos del 303 que no abrirá jamás.
//     Las noticias de IA y ciberseguridad son de quien hace contenido de eso,
//     y encenderlas pone además a trabajar a su agente cada mañana.
//   · MÓDULOS — lo que antes era el catálogo de "Plugins". Se fusionó aquí
//     porque tener dos pantallas para lo mismo (qué usa este negocio) confundía,
//     y porque los plugins se guardaban en el localStorage del navegador: quien
//     los activaba en su portátil no los veía en el móvil, y a su equipo no le
//     aparecían. Ahora van en la base, como el resto.
//
// Las normales se apagan si molestan; estas se encienden si hacen falta.
export const SECCIONES_SECTOR = ['fiscal', 'noticias']
export const SECCIONES_MODULO = ['tareas', 'actividad', 'biblioteca', 'formularios', 'prospeccion', 'equipos-ia']
const OPT_IN = new Set([...SECCIONES_SECTOR, ...SECCIONES_MODULO])

/** ¿Esta sección nace apagada? Lo necesita el interruptor, que va al revés. */
export const esOptIn = (key) => OPT_IN.has(key)

export const seccionEncendida = (sections, key) => {
  if (SECCIONES_FIJAS.includes(key)) return true
  if (OPT_IN.has(key)) return sections?.[key] === true
  return sections?.[key] !== false
}

export async function loadSecciones(clientId) {
  const { data, error } = await supabase
    .from('helm_permissions').select('sections').eq('client_id', clientId).maybeSingle()
  if (error) {
    // Sin la columna (falta helm_secciones.sql) se trabaja con todo encendido,
    // que es exactamente como se comportaba HELM antes de que esto existiera.
    console.warn('[helm] loadSecciones', error.message)
    return {}
  }
  return data?.sections || {}
}

export async function saveSecciones(clientId, sections) {
  const { error } = await supabase.from('helm_permissions').upsert(
    { client_id: clientId, sections, updated_at: new Date().toISOString() },
    { onConflict: 'client_id' },
  )
  if (error) throw error
}
