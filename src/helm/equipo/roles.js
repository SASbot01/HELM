// HELM — los roles de las personas del negocio.
//
// Un solo listado para todo el sistema: el Diario decide qué métricas pide con
// él, Finanzas filtra las comisiones por él, Ventas asigna setter/closer/CSM y
// Actividad escribe "el closer Juan añadió una nota". Si un rol se añade aquí,
// aparece en las cinco secciones a la vez.

export const ROLES = [
  {
    key: 'dueno',
    label: 'Dueño',
    short: 'dueño',
    desc: 'Ve y edita todo el perfil.',
    // Qué reporta esta persona en el Diario. Cada métrica se guarda en la
    // columna de `reports` indicada en `field`.
    diario: [
      { field: 'calls_made', label: 'Llamadas del día' },
      { field: 'closes', label: 'Cierres' },
    ],
  },
  {
    key: 'closer',
    label: 'Closer',
    short: 'closer',
    desc: 'Cierra las llamadas de venta.',
    // El embudo del día de un closer, en el orden en que ocurre.
    diario: [
      { field: 'appointments_booked', label: 'Llamadas agendadas', hint: 'Las que había en agenda' },
      { field: 'calls_made', label: 'Asistieron', hint: 'De las agendadas, cuántas se presentaron' },
      { field: 'qualified', label: 'Cualificaron' },
      { field: 'closes', label: 'Convirtieron' },
      { field: 'follow_ups', label: 'En seguimiento' },
      { field: 'lost', label: 'Perdidos', hint: 'Sin interés' },
    ],
  },
  {
    key: 'setter',
    label: 'Setter',
    short: 'setter',
    desc: 'Abre conversaciones y agenda llamadas.',
    diario: [
      { field: 'conversations_opened', label: 'Conversaciones abiertas' },
      { field: 'effective_conversations', label: 'Conversaciones efectivas' },
      { field: 'appointments_booked', label: 'Agendamientos totales' },
    ],
  },
  {
    key: 'csm',
    label: 'CSM',
    short: 'CSM',
    desc: 'Onboarding, trato, calidad y acompañamiento del cliente.',
    diario: [
      { field: 'calls_made', label: 'Llamadas con clientes' },
      { field: 'doubts_solved', label: 'Dudas resueltas por chat' },
    ],
  },
  {
    key: 'editor',
    label: 'Editor',
    short: 'editor',
    desc: 'Produce el contenido.',
    diario: [],
  },
  {
    key: 'otro',
    label: 'Otro',
    short: '',
    desc: 'Cualquier otro perfil del equipo.',
    diario: [],
  },
]

export const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.key, r]))
export const roleLabel = (key) => ROLE_MAP[key]?.label || key || '—'

// "el closer Juan", "Ana" si el rol no aporta nada. Se usa en Actividad.
export function withRole(name, roleKey) {
  const short = ROLE_MAP[roleKey]?.short
  if (!name) return '—'
  return short ? `el ${short} ${name}` : name
}

// Roles que pueden cerrar o asistir una venta (setter / closer / CSM).
export const SALE_ROLES = ['setter', 'closer', 'csm']
