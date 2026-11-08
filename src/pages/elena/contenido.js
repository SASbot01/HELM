// Contenido de la landing VSL de Elena Fontecha (/elenafontecha/valor).
//
// Todo sale de material suyo: su propuesta de método (las 6 estaciones, la
// pregunta central, la integración vida + liderazgo), su web elenafontecha.com
// (trayectoria y credenciales), su Instagram @elenafontechaoficial (la
// primera conversación gratis) y su bio de marca. Sin testimonios: aún no hay
// permiso para usar nombres ni frases de clientes.
//
// Palabras que su marca prohíbe y que aquí NO aparecen: transformación,
// empoderamiento, potencial, reinvención, mejor versión, despertar, difuso,
// «por inercia», «ha dejado de elegir», «herramientas» como etiqueta.

// ── Para rellenar ────────────────────────────────────────────────────────
// Embed del vídeo (YouTube/Vimeo con /embed/…). Vacío = póster con «Muy pronto».
export const VIDEO_EMBED = ''
// Su Calendly de primera conversación (el de su web). Se abre con nombre y
// correo ya rellenos.
export const CALENDLY = 'https://calendly.com/elena-fontecha/quieres-informacion'
export const WHATSAPP = 'https://wa.me/34608665343'
// ───────────────────────────────────────────────────────────────────────────

export const REDES = [
  { nombre: 'Instagram', url: 'https://www.instagram.com/elenafontechaoficial/' },
  { nombre: 'LinkedIn', url: 'https://www.linkedin.com/in/elenafontecha-coach-mentora-senioradvisor-juridico-ocio-inmobiliario/' },
  { nombre: 'TikTok', url: 'https://www.tiktok.com/@elenafontechaoficial' },
  { nombre: 'elenafontecha.com', url: 'https://elenafontecha.com' },
]
export const PRIVACIDAD = 'https://elenafontecha.com/legales/politica-privacidad'

export const PREGUNTA_GANCHO = '¿Sigo queriendo la vida que estoy construyendo con mi manera de vivir y de actuar?'

// Las preguntas del autodiagnóstico (con sus ramas) viven en ./diagnostico.js.

export const PARA_TI = [
  'Tienes una trayectoria consolidada y responsabilidades de liderazgo.',
  'Te van bien las cosas y, aun así, quieres revisar qué significa el éxito para ti en esta etapa.',
  'Cada decisión tiene sentido por separado, pero el conjunto ya no responde del todo a tus prioridades.',
  'Quieres mirar a la vez tu vida y tu manera de dirigir, sin separar una de otra.',
]

export const NO_ES_PARA_TI = [
  'Buscas que alguien confirme una decisión que ya has tomado.',
  'Esperas que «arreglen» a tu equipo sin revisar tu parte.',
  'Quieres resultados sin implicarte en el proceso.',
]

// Las seis estaciones, cada una con su plano personal y su plano de liderazgo
// (de la propuesta de método de Elena).
export const ESTACIONES = [
  {
    nombre: 'Mirarme con verdad',
    vida: 'Comprender quién soy hoy y desde dónde actúo. Reconocer capacidades, necesidades y contradicciones; distinguir hechos de interpretaciones.',
    pregunta: '¿Qué necesito reconocer de mí y de mi situación, aunque resulte incómodo?',
    liderazgo: 'Autoconocimiento y manera de dirigir',
    liderazgoTxt: 'Observar cómo tus fortalezas, miedos y necesidades aparecen al escuchar, delegar, exigir o afrontar desacuerdos. Contrastar lo que pretendes con lo que otras personas experimentan.',
  },
  {
    nombre: 'Comprender qué quiero y para qué',
    vida: 'Dar sentido a la dirección deseada y definir qué significa el éxito en esta etapa: qué conservar, recuperar, ampliar, explorar, reducir o dejar.',
    pregunta: '¿Qué quiero realmente y para qué es importante en mi vida?',
    liderazgo: 'Dirección personal y contribución profesional',
    liderazgoTxt: 'Precisar qué quieres aportar, qué resultados consideras valiosos y qué clase de líder quieres ser. Examinar las tensiones entre tus prioridades y las de la organización.',
  },
  {
    nombre: 'Comprender mi lugar y mis relaciones',
    vida: 'Explorar los sistemas de los que formo parte, mis papeles, los compromisos que asumo y las expectativas que intervienen.',
    pregunta: '¿Cómo quiero estar en mis relaciones y qué necesito revisar, pedir o acordar?',
    liderazgo: 'Pertenencia y responsabilidad',
    liderazgoTxt: 'Revisar tu papel, tu autoridad, tu influencia y tus compromisos. Reconocer las necesidades de otros y las condiciones que facilitan o dificultan la colaboración.',
  },
  {
    nombre: 'Dar forma a mi plan de vida',
    vida: 'Conectar lo que quiero con prioridades, metas, recursos y circunstancias. Examinar alternativas, costes y efectos sobre las demás áreas.',
    pregunta: '¿Cómo puede tener lugar lo que quiero sin perder de vista el conjunto de mi vida?',
    liderazgo: 'Plan de vida y prioridades profesionales',
    liderazgoTxt: 'Relacionar las metas profesionales con el tiempo, la energía y los recursos disponibles. Considerar lo que tus prioridades, plazos y compromisos suponen para el equipo.',
  },
  {
    nombre: 'Decidir y actuar',
    vida: 'Preparar decisiones, conversaciones, pruebas y hábitos que permitan avanzar y aprender.',
    pregunta: '¿Qué movimiento concreto tiene sentido ahora y qué necesito para hacerlo posible?',
    liderazgo: 'Acción personal y prácticas de liderazgo',
    liderazgoTxt: 'Traducir la reflexión en conversaciones, acuerdos, delegación y cambios observables. Distinguir qué puedes hacer tú, qué requiere negociación y qué exige una actuación colectiva.',
  },
  {
    nombre: 'Revisar y evolucionar',
    vida: 'Valorar resultados, costes y aprendizajes; comprobar si las metas siguen teniendo sentido y ajustar el rumbo.',
    pregunta: '¿Sigo queriendo esto y qué necesito mantener, cambiar o dejar?',
    liderazgo: 'Revisión personal y efectos colectivos',
    liderazgoTxt: 'Valorar qué resultados se logran, cómo se producen y qué efectos tienen sobre las personas. Incorporar la mirada de otros y revisar las prácticas que se han vuelto automáticas.',
  },
]

export const DIMENSIONES = ['Física', 'Mental', 'Emocional', 'Espiritual']

export const CIFRAS = [
  { n: '+25', t: 'años en alta dirección y en consejos' },
  { n: '60', t: 'personas en los equipos que formó y dirigió' },
  { n: '3', t: 'grandes compañías: PortAventura, Servihabitat y Haya Real Estate' },
]

export const CREDENCIALES = [
  ['IESE', 'Programa de Dirección General (PDG) · Trained Mentor'],
  ['IESE · Spencer Stuart', 'Mujeres en Consejos · Programa de consejeros'],
  ['Leadership Circle Profile®', 'Practitioner certificada'],
  ['Universidad Francisco de Vitoria', 'Coach dialógico'],
  ['CEU San Pablo', 'Licenciada en Derecho'],
]

export const TRAYECTORIA = ['PortAventura', 'Servihabitat', 'Haya Real Estate', 'Elara Asociados', 'Fundación Mare Terra']

export const PASOS = [
  ['Respondes el autodiagnóstico', 'Unas preguntas que se adaptan a ti o a tu empresa. Unos cinco minutos.'],
  ['Elena lo lee personalmente', 'No es un algoritmo ni un equipo: lo lee ella, antes de hablar contigo.'],
  ['Una primera conversación, gratuita', 'Para entender tu momento y decidir si tiene sentido seguir, y si ella es la persona adecuada.'],
]

export const FAQ = [
  ['¿Tengo que estar en crisis para hacerlo?', 'No. Este recorrido no presupone insatisfacción ni crisis. Sirve tanto para confirmar lo que quieres conservar como para abrir cambios pequeños o profundos.'],
  ['¿Es terapia?', 'No. Es un acompañamiento de desarrollo personal y liderazgo, orientado a decisiones, conversaciones y acciones concretas en tu vida y en tu trabajo.'],
  ['¿Qué pasa con mis respuestas?', 'Las lee Elena personalmente para preparar la conversación contigo. No se comparten con terceros.'],
  ['¿Cuánto cuesta la primera conversación?', 'Nada. Es gratuita y sin compromiso: sirve para entender tu momento y ver si tiene sentido trabajar juntas o juntos.'],
  ['¿Trabajas también con equipos y empresas?', 'Sí: con equipos de dirección y con empresas que quieren desarrollar su talento directivo, incluida la evaluación de liderazgo con el Leadership Circle Profile®.'],
]
