// HELM — los roles de las personas del negocio.
//
// Un solo listado por producto para todo el sistema: el Diario decide qué
// métricas pide con él, Finanzas filtra las comisiones por él, Ventas asigna
// quién cerró y Actividad escribe "el closer Juan añadió una nota". Si un rol
// se añade aquí, aparece en las cinco secciones a la vez.
//
// HELM (infoproducto) y Consultoria (despacho) son negocios distintos con
// puestos distintos — un despacho no tiene "closers" ni "setters", tiene
// asesores, contables y gestores laborales. En vez de un vocabulario
// genérico a la fuerza, cada producto trae el suyo (ver producto.js).
import { productoActual } from '../producto'

const ROLES_HELM = [
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

// El Diario no existe en consultoria (no está en `secciones` de producto.js),
// así que ninguno de estos roles necesita reportar nada ahí: `diario: []`.
const ROLES_CONSULTORIA = [
  {
    key: 'dueno',
    label: 'Dueño',
    short: 'dueño',
    desc: 'Ve y edita todo el despacho.',
    diario: [],
  },
  {
    key: 'asesor_fiscal',
    label: 'Asesor fiscal',
    short: 'asesor',
    desc: 'Lleva cartera de clientes: plazos, modelos y avisos.',
    diario: [],
  },
  {
    key: 'contable',
    label: 'Contable',
    short: 'contable',
    desc: 'Contabilidad, gastos y conciliación.',
    diario: [],
  },
  {
    key: 'gestor_laboral',
    label: 'Gestor laboral',
    short: 'gestor',
    desc: 'Nóminas, seguros sociales y contratos.',
    diario: [],
  },
  {
    key: 'administrativo',
    label: 'Administrativo',
    short: 'administrativo',
    desc: 'Papeleo, archivo y atención al cliente.',
    diario: [],
  },
  {
    key: 'otro',
    label: 'Otro',
    short: '',
    desc: 'Cualquier otro perfil del despacho.',
    diario: [],
  },
]

/** La lista de roles del producto que se está sirviendo ahora mismo. */
export function rolesDelProducto() {
  return productoActual().key === 'consultoria' ? ROLES_CONSULTORIA : ROLES_HELM
}

/** El mismo listado, indexado por key, para lookups sueltos (roleLabel, withRole...). */
export function roleMapDelProducto() {
  return Object.fromEntries(rolesDelProducto().map(r => [r.key, r]))
}

export const roleLabel = (key) => roleMapDelProducto()[key]?.label || key || '—'

// "el closer Juan", "Ana" si el rol no aporta nada. Se usa en Actividad.
export function withRole(name, roleKey) {
  const short = roleMapDelProducto()[roleKey]?.short
  if (!name) return '—'
  return short ? `el ${short} ${name}` : name
}
