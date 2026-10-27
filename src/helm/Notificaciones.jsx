// HELM — la campana: lo que ha pasado en el perfil mientras no mirabas.
//
// Las escribe el servidor (api/_lib/notificar.js): una reserva, un lead, un
// fallo del embudo. Aquí se leen cada minuto y se marcan al abrir el panel.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CalendarCheck, UserPlus, AlertTriangle, Sparkles } from 'lucide-react'
import { notificacionesApi } from './lib'
import './notificaciones.css'

const ICONOS = { reserva: CalendarCheck, lead: UserPlus, embudo: AlertTriangle, calendario: AlertTriangle, estudio: Sparkles }

// Secciones que se han movido o que cambiaron de clave. Las notificaciones
// guardadas llevan el destino de cuando se escribieron: «Tu avatar está listo»
// de antes apunta a 'avatar', que ya no tiene entrada en el menú porque vive en
// una pestaña del Informe; y los avisos de los agentes (guiones, informe
// semanal) se guardaron con destino 'agentes', pero la vista de Agentes tiene la
// clave 'contenido' en el NAV (era Guiones). Se traducen a la sección de hoy.
const DESTINOS_MOVIDOS = { avatar: 'informe', agentes: 'contenido' }

/** A qué sección lleva hoy un destino guardado. */
const destinoActual = (destino) => DESTINOS_MOVIDOS[destino] || destino

function hace(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export default function Notificaciones({ clientId, onNavigate }) {
  const [items, setItems] = useState([])
  const [sinLeer, setSinLeer] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  const previas = useRef(null)

  const cargar = useCallback(() => {
    if (!clientId || !localStorage.getItem('bw_admin_jwt')) return
    notificacionesApi.lista(clientId)
      .then(r => {
        setItems(r.notificaciones); setSinLeer(r.sinLeer)
        // Si han llegado nuevas desde la última vez que se miró, el lienzo
        // suelta una onda desde la campana. La primera carga no cuenta.
        if (previas.current != null && r.sinLeer > previas.current && caja.current) {
          const c = caja.current.getBoundingClientRect()
          window.dispatchEvent(new CustomEvent('helm:pulso', { detail: { x: c.left + c.width / 2, y: c.top + c.height / 2 } }))
        }
        previas.current = r.sinLeer
      })
      .catch(() => {})   // la campana nunca estorba: si falla, se queda como estaba
  }, [clientId])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 60_000)
    return () => clearInterval(t)
  }, [cargar])

  // Cerrar al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  function abrir() {
    const va = !abierto
    setAbierto(va)
    // Abrir el panel es haberlas visto. Se quedan resaltadas hasta cerrarlo.
    if (va && sinLeer > 0) {
      setSinLeer(0)
      notificacionesApi.leer(clientId).catch(() => {})
    }
    if (!va) setItems(xs => xs.map(n => (n.leida_at ? n : { ...n, leida_at: new Date().toISOString() })))
  }

  function ir(n) {
    setAbierto(false)
    if (!n.destino) return
    if (/^https?:\/\//.test(n.destino)) window.open(n.destino, '_blank', 'noopener')
    else onNavigate(destinoActual(n.destino))
  }

  const hayError = items.some(n => !n.leida_at && n.nivel === 'error')

  return (
    <div className="helm-noti" ref={caja}>
      <button
        type="button" className={'helm-noti-btn' + (abierto ? ' abierta' : '')} onClick={abrir}
        aria-label={sinLeer ? `Notificaciones: ${sinLeer} sin leer` : 'Notificaciones'} aria-expanded={abierto}
      >
        <Bell size={17} />
        {sinLeer > 0 && <span className={'helm-noti-n' + (hayError ? ' error' : '')}>{sinLeer > 9 ? '9+' : sinLeer}</span>}
      </button>
      {abierto && (
        <div className="helm-noti-panel" role="dialog" aria-label="Notificaciones">
          <div className="helm-noti-cab">Notificaciones</div>
          {items.length === 0 ? (
            <p className="helm-noti-vacio">Nada todavía. Aquí verás cada reserva, cada lead nuevo y cualquier fallo del embudo.</p>
          ) : (
            <ul>
              {items.map(n => {
                const Icono = ICONOS[n.tipo] || Bell
                return (
                  <li key={n.id}>
                    <button type="button" className={'helm-noti-item ' + n.nivel + (n.leida_at ? '' : ' nueva')} onClick={() => ir(n)}>
                      <Icono size={16} />
                      <span>
                        <b>{n.titulo}</b>
                        {n.cuerpo && <small>{n.cuerpo}</small>}
                        <time>{hace(n.created_at)}</time>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
