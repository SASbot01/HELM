// HELM — registro de plugins. Cada entrada describe un módulo instalable.
// available:true → funcional, con vista propia; se puede activar y aparece en el menú.
// available:false → en el catálogo como "próximamente".
import { CheckSquare, Activity, MessageSquare, Mail, FileText } from 'lucide-react'
import Tareas from './Tareas'
import Actividad from './Actividad'

export const PLUGINS = [
  { key: 'tareas', name: 'Tareas', icon: CheckSquare, available: true, View: Tareas,
    desc: 'Gestiona tareas del equipo por perfil, con prioridad y vencimiento.' },
  { key: 'actividad', name: 'Actividad', icon: Activity, available: true, View: Actividad,
    desc: 'Timeline global de llamadas, emails y reuniones registradas en el CRM.' },
  { key: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, available: false,
    desc: 'Conecta conversaciones de WhatsApp al CRM y responde desde HELM.' },
  { key: 'email', name: 'Email Marketing', icon: Mail, available: false,
    desc: 'Campañas y secuencias de email para tu lista de contactos.' },
  { key: 'billing', name: 'Facturación', icon: FileText, available: false,
    desc: 'Emite y controla facturas conectadas a tus finanzas.' },
]

export const PLUGIN_MAP = Object.fromEntries(PLUGINS.map(p => [p.key, p]))

// Estado activado por cliente (persistido en localStorage).
const lsKey = (clientId) => `helm_plugins_${clientId}`
export function loadEnabled(clientId) {
  try { return JSON.parse(localStorage.getItem(lsKey(clientId)) || '{}') } catch { return {} }
}
export function saveEnabled(clientId, map) {
  localStorage.setItem(lsKey(clientId), JSON.stringify(map))
}
