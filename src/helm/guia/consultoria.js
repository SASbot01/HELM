// La guía del vertical de asesorías.
//
// No es la de HELM con las palabras cambiadas: el orden es el del trabajo real
// de un despacho — primero la ficha fiscal, porque de ella sale todo lo demás;
// después los plazos; después a quién avisar; y al final los números que mira
// el director.
//
// Se abre sola la primera vez y se puede volver a abrir cuando se quiera desde
// «Guía», abajo en el menú: un despacho de 25 personas no la lee una vez, la
// consulta cada vez que entra alguien nuevo.
import {
  Scale, Users, FileSpreadsheet, CalendarClock, Send, FolderOpen,
  LayoutDashboard, CheckSquare, Wallet, Flag,
} from 'lucide-react'

export const PAGES_CONSULTORIA = [
  {
    icon: Scale,
    title: 'Bienvenido',
    lead: 'El puesto de mando de tu despacho: clientes, plazos fiscales, documentación y facturación en un solo sitio.',
    bullets: [
      'Son 10 pantallas rápidas. En cinco minutos sabes moverte.',
      'Puedes volver a abrirlas cuando quieras desde «Guía», abajo en el menú.',
    ],
  },
  {
    icon: LayoutDashboard,
    title: 'Cómo está organizado',
    lead: 'Todo se maneja desde el menú de la izquierda. Cada sección es una parte del despacho.',
    bullets: [
      'Fiscal es el corazón: plazos, avisos y la vista de dirección.',
      'CRM son tus clientes; Archivos, su documentación.',
      'Ventas y Finanzas, lo que factura y cobra el despacho.',
    ],
  },
  {
    icon: Users,
    title: 'Primero, los clientes',
    lead: 'En CRM das de alta a cada cliente del despacho, con su empresa y sus datos de contacto.',
    bullets: [
      'El pipeline va de Lead a Cliente activo: verás en qué punto está cada uno.',
      'Todo lo demás —plazos, documentos, avisos— cuelga de esta ficha.',
    ],
  },
  {
    icon: FileSpreadsheet,
    title: 'Después, su ficha fiscal',
    lead: 'En Fiscal → Clientes le dices al sistema qué presenta cada uno: IVA trimestral o mensual, IRPF en directa o módulos, si tiene nóminas o alquileres.',
    bullets: [
      'Este es el paso que no se puede saltar: de aquí salen los plazos.',
      'Mientras rellenas, te enseña qué modelos se le van a generar.',
      'Sin ficha, ese cliente no aparece en el calendario de nadie.',
    ],
  },
  {
    icon: CalendarClock,
    title: 'El calendario de plazos',
    lead: 'Pulsas «Generar» y salen todos los vencimientos del ejercicio, cliente por cliente y modelo por modelo.',
    bullets: [
      'Cada uno con su estado: pendiente de docs, en proceso, presentado o fuera de plazo.',
      'Lo vencido se marca solo, en rojo, sin que nadie tenga que tocarlo.',
      'Puedes volver a generar cuando añadas clientes: no duplica nada.',
    ],
  },
  {
    icon: Send,
    title: 'A quién avisar hoy',
    lead: 'Fiscal → Avisos de hoy. Abres por la mañana y ves exactamente a quién hay que escribir, con el mensaje ya redactado.',
    bullets: [
      'Recordatorios el día 1, 7, 14 y 18 del trimestre para pedir documentación.',
      'Y avisos 7 días, 3 días y el mismo día del vencimiento.',
      'Un clic manda por WhatsApp o email. Cada aviso sale una sola vez.',
    ],
  },
  {
    icon: FolderOpen,
    title: 'El cliente sube sus papeles',
    lead: 'Cada cliente tiene un enlace personal donde ve qué le falta y sube sus facturas y extractos. Sin contraseña ni registro.',
    bullets: [
      'El enlace va dentro de los mensajes de aviso, ya puesto.',
      'Cuando sube algo, su plazo pasa solo a «en proceso».',
      'Se acabó el «¿me lo has mandado ya?».',
    ],
  },
  {
    icon: LayoutDashboard,
    title: 'La vista del director',
    lead: 'Fiscal → Dirección. Lo que hasta ahora se sabía por intuición: carga de cada asesor y cumplimiento del despacho.',
    bullets: [
      'Cuántos clientes y cuántos plazos abiertos lleva cada uno.',
      'La tasa de cumplimiento: el porcentaje presentado a tiempo.',
      'Clientes en riesgo: los que acumulan vencidos sin presentar.',
    ],
  },
  {
    icon: CheckSquare,
    title: 'El trabajo del equipo',
    lead: 'En Plugins activas Tareas, Formularios y Biblioteca según lo que necesites.',
    bullets: [
      'Tareas: tablero del equipo, con responsable y vencimiento.',
      'Formularios: cuestionarios para clientes, con las respuestas pegadas a su ficha.',
      'Biblioteca: documentos que amplían el contexto del sistema.',
    ],
  },
  {
    icon: Wallet,
    title: 'Lo que factura el despacho',
    lead: 'Servicios es tu catálogo de cuotas; Ventas, lo facturado; Finanzas, lo cobrado y lo pendiente.',
    bullets: [
      'Cobros y morosos en una sola pantalla.',
      'Si conectas Stripe, los cobros entran solos.',
    ],
  },
  {
    icon: Flag,
    title: 'Por dónde empezar',
    lead: 'El orden importa: clientes → ficha fiscal → generar plazos. Con eso ya tienes el calendario del despacho funcionando.',
    bullets: [
      'Empieza por diez clientes, no por todos: verás el sistema entero en marcha en una tarde.',
      'La guía se queda ahí abajo, en «Guía», para cuando entre alguien nuevo.',
    ],
  },
]
