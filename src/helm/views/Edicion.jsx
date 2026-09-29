// HELM — Edición: el puesto del editor de vídeo.
//
// Cinco pestañas sobre los mismos datos, que se cargan una vez:
//   Panel     KPIs, ingresos por mes, entregas urgentes y el Agente Montador
//   Pedidos   calendario del mes y tablero por estado (guion → entregado)
//   Guiones   el calendario de guiones del perfil, con su fase en Drive; de
//             cada guion sale su pedido
//   Clientes  canales y marcas: contrato, tarifa, enlaces y balance
//   Cobros    pendiente, cobrado y atrasado; marcar pagado y recordar
//
// Lo usa el rol «editor» (ver permisos.js) y cualquiera que lleve el perfil.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LayoutDashboard, CalendarDays, ScrollText, Users, Wallet, Inbox } from 'lucide-react'
import { Tabs, FormNote, Empty } from '../ui'
import { edicionApi } from '../edicion/comun'
import PanelEdicion from '../edicion/PanelEdicion'
import Pedidos from '../edicion/Pedidos'
import Guiones from '../edicion/Guiones'
import Clientes from '../edicion/Clientes'
import Cobros from '../edicion/Cobros'
import Encargos from '../edicion/Encargos'
import { PedidoForm, PedidoDrawer } from '../edicion/PedidoForm'
import '../edicion/edicion.css'

const PESTANAS = [
  { key: 'panel', label: 'Panel', icon: <LayoutDashboard size={14} /> },
  { key: 'pedidos', label: 'Pedidos', icon: <CalendarDays size={14} /> },
  { key: 'guiones', label: 'Guiones', icon: <ScrollText size={14} /> },
  { key: 'clientes', label: 'Clientes', icon: <Users size={14} /> },
  { key: 'cobros', label: 'Cobros', icon: <Wallet size={14} /> },
]

export default function Edicion({ clientId }) {
  const [tab, setTab] = useState(null)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  // El pedido que se está creando (objeto con valores iniciales) o abierto.
  const [nuevo, setNuevo] = useState(null)
  const [abierto, setAbierto] = useState(null)

  // En la mesa de un editor, lo que le envían los demás perfiles entra en sus
  // pedidos (con `recibido` y su `origen`): es su carga de trabajo real.
  const cargar = useCallback(() => edicionApi.resumen(clientId)
    .then(d => { setDatos({ ...d, pedidos: [...d.pedidos, ...(d.recibidos || [])] }); setError(null) })
    .catch(e => setError(e.message)), [clientId])
  useEffect(() => { setDatos(null); cargar() }, [cargar])

  // Cambios locales sin recargar todo: la pantalla responde al momento.
  const pon = useCallback((lista, fila) => setDatos(d => {
    if (!d) return d
    const hay = d[lista].some(x => x.id === fila.id)
    // Se mezcla con lo que había: la API no devuelve los campos calculados de
    // un encargo recibido (origen, guion), y no deben perderse.
    return { ...d, [lista]: hay ? d[lista].map(x => (x.id === fila.id ? { ...x, ...fila } : x)) : [...d[lista], fila] }
  }), [])
  const quita = useCallback((lista, id) => setDatos(d => (d ? { ...d, [lista]: d[lista].filter(x => x.id !== id) } : d)), [])

  const clientePor = useMemo(() => new Map((datos?.clientes || []).map(c => [c.id, c])), [datos])
  const pedidoPorGuion = useMemo(
    () => new Map((datos?.pedidos || []).filter(p => p.guion_id).map(p => [p.guion_id, p])), [datos])

  async function cambiarEstado(pedido, estado) {
    pon('pedidos', { ...pedido, estado })
    try {
      const r = await edicionApi.estado(clientId, pedido.id, estado)
      pon('pedidos', r.pedido)
      if (r.cobro) pon('cobros', r.cobro)
      if (abierto?.id === pedido.id) setAbierto(r.pedido)
    } catch (e) { setError(e.message); cargar() }
  }

  // El editor entra directo a sus encargos; el resto, al panel.
  useEffect(() => { if (datos && !tab) setTab(datos.soyMesa ? 'encargos' : 'panel') }, [datos, tab])

  if (error && !datos) return <FormNote>{error}</FormNote>
  if (!datos) return <Empty>Cargando el puesto de edición…</Empty>

  const pestanas = datos.soyMesa
    ? [{ key: 'encargos', label: 'Encargos', icon: <Inbox size={14} /> }, ...PESTANAS]
    : PESTANAS
  const nuevos = datos.pedidos.filter(p => p.recibido && !p.visto_at).length

  const comun = {
    clientId, datos, clientePor, pedidoPorGuion, pon, quita, recargar: cargar,
    abrirPedido: setAbierto, nuevoPedido: (inicial = {}) => setNuevo(inicial), cambiarEstado,
    irA: setTab,
  }

  return (
    <div className="ed">
      <div className="ed-barra">
        <Tabs
          tabs={pestanas.map(t => (t.key === 'encargos' && nuevos ? { ...t, label: <>Encargos <b className="ed-nuevos">{nuevos}</b></> } : t))}
          value={tab} onChange={setTab}
        />
      </div>
      {error && <FormNote>{error}</FormNote>}

      {tab === 'encargos' && <Encargos {...comun} />}
      {tab === 'panel' && <PanelEdicion {...comun} />}
      {tab === 'pedidos' && <Pedidos {...comun} />}
      {tab === 'guiones' && <Guiones {...comun} />}
      {tab === 'clientes' && <Clientes {...comun} />}
      {tab === 'cobros' && <Cobros {...comun} />}

      {nuevo && (
        <PedidoForm
          {...comun} inicial={nuevo}
          onClose={() => setNuevo(null)}
          onGuardado={(p) => { pon('pedidos', p); setNuevo(null) }}
        />
      )}
      {abierto && (
        <PedidoDrawer
          {...comun} pedido={datos.pedidos.find(p => p.id === abierto.id) || abierto}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  )
}
