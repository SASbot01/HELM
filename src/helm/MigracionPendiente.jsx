// HELM — aviso para las secciones cuya tabla llega en una migración aparte.
//
// Sin esto, entrar en Servicios o Equipo antes de aplicar el SQL mostraba una
// sección vacía indistinguible de "aún no has creado nada", y el motivo real
// solo aparecía en la consola del navegador.
import { Database } from 'lucide-react'

export default function MigracionPendiente({ seccion, archivo = 'migrations/helm_columna_vertebral.sql' }) {
  return (
    <div className="helm-empty-cta">
      <div className="helm-onb-banner-ico" style={{ margin: '0 auto 16px' }}><Database size={20} /></div>
      <h2>Falta aplicar una migración</h2>
      <p>
        La sección <b>{seccion}</b> necesita tablas que todavía no existen en tu Supabase.
        Abre el SQL Editor de tu proyecto, pega el contenido de <code>{archivo}</code> y ejecútalo.
        Se puede lanzar más de una vez sin riesgo.
      </p>
    </div>
  )
}
