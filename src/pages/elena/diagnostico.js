// Autodiagnóstico de Elena Fontecha (/elenafontecha/valor): preguntas,
// ramas y clasificación del avatar.
//
// Fuente única: la página pinta estas preguntas y
// scripts/gen-form-valor-elena.mjs genera desde aquí los dos formularios de
// helm_forms. Si cambias una clave o una opción, vuelve a lanzar el script y
// aplica su salida: el endpoint descarta toda clave que el formulario no
// declare.
//
// La puerta separa dos ramas, cada una con su formulario y su embudo:
//   · «Para mí»                    → form 'valor'         → «Captación (leads)»
//   · «Para mi equipo o empresa»   → form 'valor-empresa' → «Empresas y equipos»
//
// Dentro de cada rama, las preguntas aparecen o no según lo ya contestado
// (`si`) y cambian su enunciado (`label` como función). Al final se calcula el
// perfil: los avatares de Elena —Rodri (el líder en primera línea), Laura (la
// persona en revisión, en momento silencioso o de impacto)— más la alta
// dirección y los perfiles de empresa. El perfil va al CRM; quien responde ve
// una lectura en lenguaje normal, nunca el nombre del avatar.
//
// Una condición `si` solo puede mirar respuestas ANTERIORES de su rama: así
// avanzar nunca cambia las preguntas que ya quedaron atrás.

import { ESTACIONES } from './contenido.js'

export const TIPO_PERSONA = 'Para mí'
export const TIPO_EMPRESA = 'Para mi equipo o mi empresa'

export const PUERTA = {
  key: 'tipo',
  label: 'Antes de empezar: ¿para quién buscas acompañamiento?',
  sub: 'Según lo que elijas, las preguntas serán otras.',
  tipo: 'uno',
  options: [
    { v: TIPO_PERSONA, d: 'Tu vida, tu rumbo o tu manera de dirigir.' },
    { v: TIPO_EMPRESA, d: 'Un equipo directivo, mandos o una persona clave de tu organización.' },
  ],
}

// ── Rama persona ────────────────────────────────────────────────────────────

export const ROL = {
  ceo: 'CEO, director/a general o consejero/a',
  comite: 'Miembro de un comité de dirección',
  area: 'Dirijo un área o un equipo',
  nuevo: 'Acabo de asumir más responsabilidad',
  negocio: 'Tengo un negocio o un proyecto propio',
  sinEquipo: 'Trabajo sin equipo a cargo',
  entre: 'Estoy entre etapas (salida, cambio o pausa)',
}
const DIRIGE = [ROL.ceo, ROL.comite, ROL.area, ROL.nuevo]
const ALTA = [ROL.ceo, ROL.comite]
const CON_EQUIPO = [...DIRIGE, ROL.negocio]
const SIN_PERSONAS = 'Ninguna, por ahora'

export const REVISAR = {
  vida: 'Mi vida y mi rumbo',
  liderazgo: 'Mi manera de dirigir y de liderar',
  ambas: 'Las dos cosas, a la vez',
}

// Cada momento abre una estación del recorrido (índice en ESTACIONES).
export const MOMENTOS = [
  ['Quiero mirar con verdad dónde estoy', 0],
  ['No tengo claro qué quiero, ni para qué', 1],
  ['Me pesa mi lugar en mis relaciones (equipo, socios, familia)', 2],
  ['Sé lo que quiero, pero no cómo darle un lugar real', 3],
  ['Tengo una decisión delante y necesito tomarla', 4],
  ['Quiero revisar decisiones que ya tomé y ver si siguen teniendo sentido', 5],
]

const VIDA_ETAPA = 'Una etapa que se acaba y otra que no sé empezar'
const ENERGIA = {
  bien: 'Bien; quiero afinar',
  altibajos: 'Con altibajos',
  limite: 'Al límite, sosteniendo',
  paro: 'He tenido que parar en algún momento',
}

export const PREGUNTAS_PERSONA = [
  {
    key: 'rol',
    label: '¿Cuál es tu situación profesional hoy?',
    tipo: 'uno',
    options: Object.values(ROL),
  },
  {
    key: 'equipo',
    label: '¿Cuántas personas dependen de ti?',
    sub: (r) => (r.rol === ROL.negocio ? 'Contando a quien trabaja contigo de forma estable.' : 'Directa o indirectamente.'),
    tipo: 'uno',
    options: [SIN_PERSONAS, 'De 1 a 5', 'De 6 a 20', 'De 21 a 100', 'Más de 100'],
    si: (r) => CON_EQUIPO.includes(r.rol),
    depende: ['rol'],
    visible: (r, op) => op !== SIN_PERSONAS || r.rol === ROL.negocio,
  },
  {
    key: 'revisar',
    label: '¿Qué quieres revisar ahora?',
    sub: (r) => (DIRIGE.includes(r.rol)
      ? 'Muchas veces son la misma conversación.'
      : 'Dirigir también es cómo te diriges a ti.'),
    tipo: 'uno',
    options: Object.values(REVISAR),
  },
  {
    key: 'momento',
    label: '¿En qué punto te reconoces?',
    sub: 'Elige la que más se parezca a tu momento, aunque no sea exacta.',
    tipo: 'uno',
    options: MOMENTOS.map(([m]) => m),
  },
  {
    key: 'retos_liderazgo',
    labelCrm: 'Lo que más le cuesta al dirigir',
    label: (r) => (ALTA.includes(r.rol)
      ? 'Desde tu posición, ¿qué te está costando más?'
      : DIRIGE.includes(r.rol) || r.rol === ROL.negocio
        ? '¿Qué te está costando más al dirigir?'
        : 'Cuando te toca liderar algo, ¿qué te cuesta más?'),
    sub: 'Elige hasta dos.',
    tipo: 'varios',
    max: 2,
    options: [
      'Delegar decisiones, no solo tareas',
      'Las conversaciones difíciles y el feedback',
      'Decir que no y negociar plazos',
      'Que todo pase por mí',
      'Moverme con pares, superiores o el consejo',
      'Sostener resultados sin que lo pague mi salud o el equipo',
    ],
    si: (r) => r.revisar && r.revisar !== REVISAR.vida,
    depende: ['revisar'],
  },
  {
    key: 'peso_vida',
    labelCrm: 'Lo que más pesa en su vida',
    label: (r) => (r.revisar === REVISAR.ambas ? 'Y en tu vida, ¿qué pesa más ahora?' : 'En tu vida, ¿qué pesa más ahora?'),
    sub: 'Elige hasta dos.',
    tipo: 'varios',
    max: 2,
    options: [
      'No me da la vida: el tiempo y la energía',
      'Lo mío siempre queda para después',
      'He perdido la ilusión por lo que hago',
      'Mis relaciones (pareja, familia, amistades)',
      VIDA_ETAPA,
      'Una decisión importante que tengo delante',
    ],
    si: (r) => r.revisar && r.revisar !== REVISAR.liderazgo,
    depende: ['revisar'],
  },
  {
    key: 'dimension',
    label: '¿Qué parte sientes más desatendida?',
    sub: 'Son las cuatro dimensiones del recorrido. Elige la que más te pide atención.',
    tipo: 'uno',
    options: [
      'Lo físico (energía, cuerpo, descanso)',
      'Lo mental (claridad, foco, criterio)',
      'Lo emocional (cómo vivo lo que me pasa)',
      'Lo espiritual (sentido, valores, lo que importa)',
    ],
  },
  {
    key: 'energia',
    label: '¿Cómo ha estado tu energía en los últimos meses?',
    tipo: 'uno',
    options: Object.values(ENERGIA),
  },
  {
    key: 'inicio',
    label: '¿Cuándo te gustaría empezar?',
    tipo: 'uno',
    options: ['Ahora mismo', 'En las próximas semanas', 'En unos meses', 'Solo estoy explorando'],
  },
  {
    key: 'financia',
    label: 'Si decides hacerlo, ¿quién lo financiaría?',
    sub: 'Muchas empresas cubren este tipo de acompañamiento a sus directivos.',
    tipo: 'uno',
    options: ['Yo', 'Mi empresa', 'Una parte cada uno', 'Aún no lo sé'],
    si: (r) => DIRIGE.includes(r.rol),
    depende: ['rol'],
  },
  {
    key: 'motivo',
    label: 'En una frase, ¿qué te ha traído hoy aquí?',
    sub: 'Opcional. Con tus palabras: es lo que más ayuda a preparar la conversación.',
    tipo: 'texto',
    opcional: true,
    placeholder: 'Escríbelo como se lo contarías a alguien de confianza.',
  },
]

// ── Rama empresa ────────────────────────────────────────────────────────────

const UNA_PERSONA = 'A una persona concreta (CEO, directivo/a)'
const LCP_NECESIDAD = 'Conocer su estilo de liderazgo (evaluación LCP)'
const LCP_FORMATO = 'Evaluación de liderazgo (LCP) con sesiones de devolución'
const soloUnaPersona = (r) => Array.isArray(r.a_quien) && r.a_quien.length === 1 && r.a_quien[0] === UNA_PERSONA

export const PREGUNTAS_EMPRESA = [
  {
    key: 'cargo',
    label: '¿Cuál es tu papel en la empresa?',
    tipo: 'uno',
    options: [
      'CEO o director/a general',
      'Dirección de Personas o RR. HH.',
      'Dirección de un área',
      'Propiedad, socio/a o consejero/a',
      'Otro',
    ],
  },
  {
    key: 'sector',
    label: '¿En qué sector trabajáis?',
    tipo: 'uno',
    options: [
      'Turismo, ocio y hostelería',
      'Inmobiliario y construcción',
      'Servicios profesionales (legal, consultoría, finanzas)',
      'Industria y distribución',
      'Tecnología',
      'Salud y bienestar',
      'Educación',
      'Sector público o tercer sector',
      'Otro',
    ],
  },
  {
    key: 'tamano',
    label: '¿Cuántas personas sois en la empresa?',
    tipo: 'uno',
    options: ['Menos de 10', 'De 10 a 50', 'De 51 a 250', 'De 251 a 1.000', 'Más de 1.000'],
  },
  {
    key: 'tipo_empresa',
    label: '¿Cómo describirías la empresa?',
    tipo: 'uno',
    options: [
      'Empresa familiar',
      'Startup o scale-up',
      'Pyme consolidada',
      'Grupo o multinacional',
      'Institución u organización sin ánimo de lucro',
    ],
  },
  {
    key: 'momento_empresa',
    label: '¿En qué momento está la empresa?',
    tipo: 'uno',
    options: [
      'Creciendo más rápido que su organización',
      'Relevo generacional o sucesión',
      'Fusión, venta o reestructuración',
      'Cambio en el equipo de dirección',
      'Estable: queremos profesionalizar el liderazgo',
    ],
  },
  {
    key: 'a_quien',
    label: '¿A quién iría dirigido?',
    sub: 'Marca todo lo que aplique.',
    tipo: 'varios',
    options: [
      'Al comité de dirección',
      'A mandos intermedios',
      'A personas que estrenan responsabilidad',
      UNA_PERSONA,
      'A un equipo concreto',
    ],
  },
  {
    key: 'participantes',
    label: '¿Cuántas personas participarían?',
    tipo: 'uno',
    options: ['De 2 a 5', 'De 6 a 15', 'De 16 a 40', 'Más de 40'],
    si: (r) => Array.isArray(r.a_quien) && r.a_quien.length > 0 && !soloUnaPersona(r),
    depende: ['a_quien'],
  },
  {
    key: 'necesidades',
    labelCrm: 'Qué necesitan trabajar',
    label: (r) => (soloUnaPersona(r) ? '¿Qué necesita trabajar esa persona?' : '¿Qué necesitan aprender o trabajar?'),
    sub: 'Elige hasta tres.',
    tipo: 'varios',
    max: 3,
    options: [
      'Delegar y dar autonomía',
      'Conversaciones difíciles y feedback',
      'Cohesión del equipo directivo',
      'Decidir juntos y con claridad de roles',
      'Gestionar la presión sin quemarse',
      'Liderar un cambio',
      LCP_NECESIDAD,
      'Relación con el consejo y gobierno corporativo',
    ],
  },
  {
    key: 'sintoma',
    label: '¿Qué está pasando ahora que os hace buscar esto?',
    sub: 'Elige hasta dos.',
    tipo: 'varios',
    max: 2,
    options: [
      'Desgaste o rotación de personas clave',
      'Decisiones que se atascan o se repiten',
      'Tensiones en el equipo directivo',
      'Todo depende de pocas personas',
      'Una nueva etapa que exige otra forma de dirigir',
      'Nada urgente: queremos prevenir',
    ],
  },
  {
    key: 'formato',
    label: '¿Qué formato os encaja más?',
    tipo: 'uno',
    options: [
      LCP_FORMATO,
      'Programa para el equipo directivo',
      'Mentoría a una persona clave',
      'Un taller o una jornada',
      'Aún no lo sabemos; queremos orientación',
    ],
  },
  {
    key: 'plazo',
    label: '¿Para cuándo lo necesitáis?',
    tipo: 'uno',
    options: ['Este trimestre', 'El próximo trimestre', 'Este año', 'Sin fecha todavía'],
  },
  {
    key: 'presupuesto',
    label: '¿Hay presupuesto para esto?',
    tipo: 'uno',
    options: ['Sí, aprobado', 'Se está definiendo', 'Todavía no'],
  },
  {
    key: 'decide',
    label: '¿Quién toma la decisión?',
    tipo: 'uno',
    options: ['Yo', 'Yo, junto con dirección', 'Personas o RR. HH.', 'El consejo o la propiedad'],
  },
  {
    key: 'tambien_yo',
    label: 'Y tú, ¿te gustaría trabajar también lo tuyo?',
    sub: 'Quien impulsa estos procesos suele necesitar su propio espacio.',
    tipo: 'uno',
    options: ['Sí, también lo mío', 'Por ahora, solo el equipo'],
  },
  {
    key: 'motivo',
    label: 'Si quieres, cuéntanos la situación en una frase.',
    sub: 'Opcional. Es lo que más ayuda a preparar la conversación.',
    tipo: 'texto',
    opcional: true,
    placeholder: 'Qué está pasando y qué os gustaría que cambiara.',
  },
]

// Campos que no se preguntan: se calculan al enviar y van a la ficha del CRM.
export const CALCULADOS = {
  persona: [
    { key: 'perfil', label: 'Perfil (calculado)' },
    { key: 'punto_entrada', label: 'Estación de entrada (calculada)' },
  ],
  empresa: [
    { key: 'perfil', label: 'Perfil (calculado)' },
    { key: 'recomendacion', label: 'Por dónde empezar (calculado)' },
  ],
}

export const RAMAS = {
  persona: { tipo: TIPO_PERSONA, form: 'valor', preguntas: PREGUNTAS_PERSONA },
  empresa: { tipo: TIPO_EMPRESA, form: 'valor-empresa', preguntas: PREGUNTAS_EMPRESA },
}

export const ramaDe = (r) => (r.tipo === TIPO_PERSONA ? 'persona' : r.tipo === TIPO_EMPRESA ? 'empresa' : null)

// Preguntas que tocan con las respuestas actuales (la puerta incluida).
export function preguntasVisibles(r) {
  const rama = ramaDe(r)
  if (!rama) return [PUERTA]
  return [PUERTA, ...RAMAS[rama].preguntas.filter((q) => !q.si || q.si(r))]
}

// Cuántas preguntas tendrá la rama, contando como posibles las que dependen
// de algo aún sin responder. Así el contador solo baja, nunca sube.
const sinResponder = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)
export function totalEstimado(r) {
  const rama = ramaDe(r)
  if (!rama) return 0
  return RAMAS[rama].preguntas.filter((q) => {
    if (!q.si) return true
    if ((q.depende || []).some((k) => sinResponder(r[k]))) return true
    return Boolean(q.si(r))
  }).length
}

export const texto = (v, r) => (typeof v === 'function' ? v(r) : v)
export const valorDe = (op) => (typeof op === 'string' ? op : op.v)

// ── Clasificación ───────────────────────────────────────────────────────────

const LECTURAS = {
  alta: {
    titulo: 'Una conversación de par a par',
    texto: 'Desde la alta dirección se decide a menudo en soledad y con poco tiempo para mirarse. Elena ha estado en un comité de dirección y en un consejo: la conversación parte de ahí.',
  },
  lider: {
    titulo: 'Tu manera de dirigir y tu vida, en la misma conversación',
    texto: 'En tu situación es habitual seguir respondiendo a todo mientras algo se resiente. La primera conversación sirve para identificar el patrón y llevarlo a una situación real de tu equipo.',
  },
  nuevo: {
    titulo: 'Una responsabilidad nueva pide otra forma de dirigir',
    texto: 'Lo que te trajo hasta aquí no siempre es lo que te sostiene en el puesto nuevo. La primera conversación sirve para ver qué conservar y qué cambiar antes de que se convierta en costumbre.',
  },
  fundador: {
    titulo: 'Cuando el proyecto es tuyo, todo va junto',
    texto: 'En un negocio propio tu vida y tu manera de dirigir son difíciles de separar. La primera conversación sirve para ver dónde se cruzan y por dónde empezar.',
  },
  silencioso: {
    titulo: 'Cuando algo no encaja y aún no tiene nombre',
    texto: 'Funcionas, cumples y, aun así, algo pide revisión. El primer paso es mirarlo con calma: sin dramatizarlo y sin aplazarlo otra vez.',
  },
  impacto: {
    titulo: 'Cuando una situación impide seguir igual',
    texto: 'Conviene no decidir con prisa ni quedarse quieto. La primera conversación sirve para ordenar qué está pasando y qué va primero.',
  },
}

export function diagnosticoPersona(r) {
  const dirige = DIRIGE.includes(r.rol)
  const conEquipo = r.rol === ROL.negocio && r.equipo && r.equipo !== SIN_PERSONAS
  const liderazgo = r.revisar && r.revisar !== REVISAR.vida
  const alLimite = r.energia === ENERGIA.limite || r.energia === ENERGIA.paro
  const impacto = alLimite || r.rol === ROL.entre || (r.peso_vida || []).includes(VIDA_ETAPA)

  let clave
  let perfil
  if (dirige && liderazgo && ALTA.includes(r.rol)) { clave = 'alta'; perfil = 'Alta dirección · De par a par' }
  else if (dirige && liderazgo && r.rol === ROL.nuevo) { clave = 'nuevo'; perfil = 'Rodri · Recién promocionado/a' }
  else if (dirige && liderazgo) { clave = 'lider'; perfil = 'Rodri · Líder en primera línea' }
  else if (conEquipo && liderazgo) { clave = 'fundador'; perfil = 'Rodri · Fundador/a con equipo' }
  else if (impacto) { clave = 'impacto'; perfil = 'Laura · Revisión (momento de impacto)' }
  else { clave = 'silencioso'; perfil = 'Laura · Revisión (momento silencioso)' }

  if (r.revisar === REVISAR.ambas && clave !== 'impacto' && clave !== 'silencioso') perfil += ' · vida y liderazgo'
  if (alLimite && clave !== 'impacto') perfil += ' · energía al límite'
  // Laura también puede ser un directivo mirando su dimensión personal.
  if ((clave === 'impacto' || clave === 'silencioso') && dirige) perfil += ' · con cargo directivo'

  const idx = (MOMENTOS.find(([m]) => m === r.momento) || MOMENTOS[0])[1]
  const est = ESTACIONES[idx]
  return {
    perfil,
    lectura: LECTURAS[clave],
    estacion: { n: idx + 1, ...est },
    punto_entrada: `Estación ${idx + 1} · ${est.nombre}`,
    conLiderazgo: Boolean(liderazgo),
    dimension: r.dimension ? r.dimension.replace(/\s*\(.*\)$/, '') : '',
    alLimite,
  }
}

const RECOMENDACIONES = {
  lcp: {
    titulo: 'Evaluación de liderazgo con el Leadership Circle Profile®',
    texto: 'Una medición del estilo de liderazgo basada en métricas, con devolución estructurada y sesiones de trabajo sobre los resultados.',
  },
  equipo: {
    titulo: 'Trabajo con el equipo directivo',
    texto: 'Cohesión, claridad de roles y decisiones compartidas, sobre situaciones reales del equipo y no en abstracto.',
  },
  mentoria: {
    titulo: 'Mentoría a la persona clave',
    texto: 'Acompañamiento individual con la experiencia de Elena en dirección general, consejos de administración y gestión del cambio.',
  },
  gobierno: {
    titulo: 'Gobierno y relevo',
    texto: 'Ordenar el paso de la empresa familiar a una organización con un gobierno claro, desde la experiencia de Elena como secretaria de consejo.',
  },
  mandos: {
    titulo: 'Desarrollo de mandos',
    texto: 'Delegar, dar feedback y sostener la presión: lo que más cuesta a quien estrena responsabilidad o dirige equipos en primera línea.',
  },
  inicial: {
    titulo: 'Un diagnóstico inicial con dirección',
    texto: 'Una conversación para entender la situación y definir el alcance antes de proponer nada.',
  },
}

export function diagnosticoEmpresa(r) {
  const a = r.a_quien || []
  const nec = r.necesidades || []
  const una = soloUnaPersona(r)
  const familiar = r.tipo_empresa === 'Empresa familiar' || r.momento_empresa === 'Relevo generacional o sucesión'
  const comite = a.includes('Al comité de dirección')
  const mandos = a.includes('A mandos intermedios') || a.includes('A personas que estrenan responsabilidad')

  let perfil
  if (una) perfil = 'Empresa · Persona clave'
  else if (familiar) perfil = 'Empresa · Familiar en transición'
  else if (comite) perfil = 'Empresa · Equipo directivo'
  else if (mandos) perfil = 'Empresa · Desarrollo de mandos'
  else perfil = 'Empresa · Talento directivo'

  const recs = []
  const poner = (k, cond) => { if (k && cond && !recs.includes(k)) recs.push(k) }
  // Si la empresa ha elegido un formato concreto, ese va primero.
  const POR_FORMATO = {
    [LCP_FORMATO]: 'lcp',
    'Programa para el equipo directivo': 'equipo',
    'Mentoría a una persona clave': 'mentoria',
  }
  poner(POR_FORMATO[r.formato], true)
  poner('lcp', nec.includes(LCP_NECESIDAD))
  poner('mentoria', una)
  poner('gobierno', familiar || nec.includes('Relación con el consejo y gobierno corporativo'))
  poner('equipo', comite || nec.includes('Cohesión del equipo directivo') || nec.includes('Decidir juntos y con claridad de roles'))
  poner('mandos', mandos)
  if (!recs.length) recs.push('inicial')
  const elegidas = recs.slice(0, 3).map((k) => RECOMENDACIONES[k])

  return {
    perfil,
    recomendaciones: elegidas,
    recomendacion: elegidas.map((x) => x.titulo).join(' + '),
  }
}
