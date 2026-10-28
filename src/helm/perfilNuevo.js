// HELM — cómo nace un perfil, en un solo sitio.
//
// Un perfil se crea por dos caminos: desde el panel («Nuevo perfil»,
// createProfile en lib.js, que escribe por la pasarela) y desde el servidor
// (crearPerfil en api/perfiles.js, al convertir un alta pública en
// api/onboarding.js). Los dos sacan de aquí la URL, la fila de `clients` y el
// pipeline con el que arranca, para que no haya dos copias que se separen.
//
// Módulo puro, sin Supabase ni nada del navegador: lo importa también el
// servidor.

// La URL de un perfil: minúsculas, cifras y guiones, de 3 a 40.
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

// Las rutas de la web que van antes de /:slug (src/main.jsx y los rewrites de
// vercel.json): un perfil con una de estas URLs no se abriría nunca.
export const RUTAS_DE_LA_WEB = new Set([
  'api', 'assets', 'admin', 'login', 'registro', 'web', 'plataforma', 'usersadmin', 'primermap',
  'f', 'd', 'c', 'alta', 'silvestreai', 'paginainicio', 'clase', 'empresas', 'socio', 'aiparatodo',
  'filmmakingparatodo', 'filmakingparatodo', 'detrasdecamara', 'nonegociables', 'gracias',
  'privacidad', 'aviso-legal', 'agents',
])

// El pipeline con el que arranca un perfil que no ha tocado nada. El CRM
// (crm/pipeline.js) lo reexporta y lo enseña como pipeline virtual mientras el
// perfil no tenga ninguna fila en crm_pipelines.
export const DEFAULT_STAGES = [
  { key: 'lead', label: 'Lead', tone: '' },
  { key: 'contactado', label: 'Contactado', tone: 'cyan' },
  { key: 'cita', label: 'Cita agendada', tone: 'amber' },
  { key: 'propuesta', label: 'Propuesta', tone: 'violet' },
  { key: 'seguimiento', label: 'Seguimiento futuro', tone: 'amber' },
  { key: 'ganado', label: 'Ganado', tone: 'green' },
  { key: 'perdido', label: 'Perdido', tone: 'red' },
]

// Subetapas por defecto. Solo la de seguimiento trae contenido: es el caso que
// pedía el informe (saber a cuánto vista es cada seguimiento).
export const DEFAULT_SUBSTAGES = {
  seguimiento: [
    { key: '1m', label: '1 mes' },
    { key: '3m', label: '3 meses' },
    { key: '6m', label: '+6 meses' },
  ],
}

/** La fila de `clients` de un perfil nuevo (sin la agencia: la pone quien lo crea). */
export function filaPerfilNuevo({ slug, name, clientType = 'growth', primaryColor = null }) {
  const fila = { slug, name, client_type: clientType, active: true, is_demo: false }
  if (primaryColor) fila.primary_color = primaryColor
  return fila
}

/** La fila de crm_pipelines con la que arranca ese perfil. */
export const pipelineInicial = (clientId) => ({
  client_id: clientId, name: 'Pipeline', is_default: true,
  stages: DEFAULT_STAGES, substages: DEFAULT_SUBSTAGES,
})
