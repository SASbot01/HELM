// HELM — registro de plugins. Cada entrada describe un módulo instalable.
// available:true → funcional, con vista propia; se puede activar y aparece en el menú.
// available:false → en el catálogo como "próximamente".
import { CheckSquare, Activity, MessageSquare, Mail, FileText, BookOpen, ClipboardList, Hash } from 'lucide-react'
import Tareas from './Tareas'
import Actividad from './Actividad'
import Biblioteca from './Biblioteca'
import Formularios from './Formularios'

export const PLUGINS = [
  { key: 'tareas', name: 'Tareas', icon: CheckSquare, available: true, View: Tareas,
    desc: 'Tareas del equipo por perfil, con cliente adjunto, prioridad y vencimiento.' },
  { key: 'actividad', name: 'Actividad', icon: Activity, available: true, View: Actividad,
    desc: 'Timeline global de llamadas, emails y reuniones, con quién hizo cada cosa.' },
  { key: 'biblioteca', name: 'Biblioteca', icon: BookOpen, available: true, View: Biblioteca,
    desc: 'Documentos y transcripciones que amplían el contexto de la IA del chat.' },
  { key: 'formularios', name: 'Formularios', icon: ClipboardList, available: true, View: Formularios,
    desc: 'Formularios de onboarding y satisfacción, con las respuestas pegadas al cliente.' },
  // ── Pendientes de decidir proveedor ──────────────────────────────────────
  // No se marcan como disponibles porque no funcionarían: los cuatro necesitan
  // una cuenta y unas credenciales externas que todavía no existen. Ver el
  // informe de proveedores.
  { key: 'contratos', name: 'Contratos', icon: FileText, available: false,
    desc: 'Genera y envía contratos para firma digital con solo el email del cliente.' },
  { key: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, available: false,
    desc: 'Conecta conversaciones de WhatsApp al CRM y responde desde HELM.' },
  { key: 'email', name: 'Email Marketing', icon: Mail, available: false,
    desc: 'Campañas y secuencias de email para tu lista de contactos.' },
  { key: 'discord', name: 'Discord', icon: Hash, available: false,
    desc: 'Discord como canal de comunicación con clientes y equipo, dentro de HELM.' },
]

export const PLUGIN_MAP = Object.fromEntries(PLUGINS.map(p => [p.key, p]))

// El estado de activación ya NO vive aquí. Antes se guardaba en localStorage y
// eso significaba que quien encendía un módulo en su portátil no lo veía en el
// móvil, y a su equipo no le aparecía nunca. Ahora es una sección más, en
// helm_permissions.sections, y se enciende desde Secciones (ver permisos.js →
// SECCIONES_MODULO).

