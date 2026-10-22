// HELM — la puerta del administrador: todos los perfiles en un tablero de
// recuadros, y él decide en cuál entra. Un cliente nunca llega aquí: entra
// directo al suyo (ver HelmApp).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, ArrowUpRight, LogOut, Users, MoreHorizontal, EyeOff, Trash2, RotateCcw, Building2, Send, Inbox, KeyRound } from 'lucide-react'
import { brandOf, notificacionesApi, perfilesApi, creditosApi, telegramAgenciaApi, altasApi, accesosApi, enlaceAltaPublica } from './lib'
import Creditos, { BotonCreditos, Bienvenida } from './Creditos'
import TelegramAgencia from './TelegramAgencia'
import AltasRecibidas, { DetalleAlta } from './AltasRecibidas'
import AccesosRecibidos from './AccesosRecibidos'
import { Modal, Field, Input, FormNote } from './ui'
import './perfiles.css'

export default function Perfiles({ clients, loading, lastId, email, producto, onPick, onNew, onUsers, onLogout, onChanged }) {
  const [q, setQ] = useState('')
  const [avisos, setAvisos] = useState({})          // id de perfil → { sinLeer, errores }
  const [inactivos, setInactivos] = useState([])
  const [menu, setMenu] = useState(null)            // id del perfil con el menú abierto
  const [borrando, setBorrando] = useState(null)    // perfil en el modal de borrado
  const [error, setError] = useState(null)
  const [agencia, setAgencia] = useState(null)      // { id, nombre, slug, plataforma }
  const [verCreditos, setVerCreditos] = useState(false)
  const [verTelegram, setVerTelegram] = useState(false)
  const [conTelegram, setConTelegram] = useState(false)  // el botón del bot: solo si la agencia lo tiene
  const [bienvenida, setBienvenida] = useState(null)  // { saldo, pagado }: la oferta de la agencia nueva
  const [recarga, setRecarga] = useState(0)         // para que el botón relea el saldo
  // Las altas del enlace público (helm.s4sf.net/alta): la bandeja y la que está abierta.
  const [altas, setAltas] = useState(null)
  const [falloAltas, setFalloAltas] = useState(null)
  const [verAltas, setVerAltas] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(null)
  // Las solicitudes de acceso a AI para todo (puerta con aprobación).
  const [accesos, setAccesos] = useState(null)
  const [falloAccesos, setFalloAccesos] = useState(null)
  const [verAccesos, setVerAccesos] = useState(false)
  const caja = useRef(null)
  const navigate = useNavigate()

  // La plataforma ve los perfiles de todas las agencias, pero en su tablero
  // solo salen los de su agencia: los demás se abren desde /plataforma.
  const propios = useMemo(() => (
    agencia?.plataforma && agencia.id ? clients.filter(c => !c.agencia_id || c.agencia_id === agencia.id) : clients
  ), [clients, agencia])
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return propios
    return propios.filter(c => (c.name + ' ' + (c.brand_name || '') + ' ' + c.slug).toLowerCase().includes(t))
  }, [propios, q])

  const cargarInactivos = () => perfilesApi.inactivos().then(r => setInactivos(r.perfiles)).catch(() => {})
  const cargarAltas = () => altasApi.lista()
    .then(r => { setAltas(r.altas || []); setFalloAltas(null) })
    .catch(e => setFalloAltas(e.message || 'No se han podido cargar las altas.'))
  const cargarAccesos = () => accesosApi.pendientes()
    .then(r => { setAccesos(r.accesos || []); setFalloAccesos(null) })
    .catch(e => setFalloAccesos(e.message || 'No se han podido cargar los accesos.'))
  const accesosPendientes = (accesos || []).length
  // Las que esperan a que alguien las mire: el número del botón.
  const nuevas = useMemo(() => (altas || []).filter(a => a.estado === 'enviada').length, [altas])
  // La plataforma ve las de todas las agencias: entonces cada una dice de cuál es.
  const variasAgencias = useMemo(() => new Set((altas || []).map(a => a.agencia?.id).filter(Boolean)).size > 1, [altas])
  useEffect(() => {
    if (!localStorage.getItem('bw_admin_jwt')) return
    notificacionesApi.resumen().then(r => setAvisos(r.porPerfil || {})).catch(() => {})
    cargarInactivos()
    cargarAltas()
    cargarAccesos()
    // Vuelta de pagar en Stripe: se confirma el pago (el servidor se lo
    // pregunta a Stripe) antes de leer el saldo, para enseñar el nuevo.
    const p = new URLSearchParams(window.location.search)
    const sesion = p.get('session_id')
    if (p.get('creditos')) window.history.replaceState(null, '', window.location.pathname)
    const pago = sesion
      ? creditosApi.confirmar(sesion).then(() => true).catch(e => { setError(e.message); return false })
      : Promise.resolve(false)
    pago.then(pagado => creditosApi.saldo().then(r => {
      setAgencia({ id: r.agencia?.id, nombre: r.agencia?.nombre, slug: r.agencia?.slug, plataforma: r.plataforma })
      // El bot de Telegram solo lo tienen las agencias de HELM_TELEGRAM_AGENCIAS
      // (y la plataforma, que lo activa). Quien quedó vinculado de antes lo
      // sigue viendo para poder desvincularse.
      if (r.plataforma) setConTelegram(true)
      else telegramAgenciaApi.vinculo().then(e => setConTelegram(Boolean(e?.permitido || e?.vinculado))).catch(() => {})
      // Agencia recién llegada: primero la oferta de compra (o, si viene de
      // pagar, directamente el regalo de bienvenida).
      if (r.bienvenida?.pendiente) setBienvenida({ saldo: r, pagado })
      else if (pagado) { setRecarga(n => n + 1); setVerCreditos(true) }
    })).catch(() => {})
  }, [])

  useEffect(() => {
    if (!menu) return
    const fuera = (e) => { if (!e.target.closest?.('.helm-perfil-menu, .helm-perfil-mas')) setMenu(null) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [menu])

  async function activar(c, activo) {
    setMenu(null); setError(null)
    try {
      await perfilesApi.activar(c.id, activo)
      await Promise.all([onChanged(), cargarInactivos()])
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="helm-perfiles" ref={caja}>
      <header className="helm-perfiles-cab">
        <div>
          <h1>Perfiles de {agencia?.nombre || producto}</h1>
          <p>{loading ? 'Cargando perfiles…' : propios.length ? 'Elige en cuál quieres entrar.' : 'Todavía no hay ninguno.'}</p>
        </div>
        <div className="helm-perfiles-acc">
          {propios.length > 6 && (
            <label className="helm-search">
              <Search size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar perfil" autoFocus />
            </label>
          )}
          <BotonCreditos onAbrir={() => setVerCreditos(true)} recarga={recarga} />
          <button
            type="button" className="helm-btn" onClick={() => { setVerAltas(true); cargarAltas() }}
            title={nuevas ? `${nuevas} ${nuevas === 1 ? 'alta nueva' : 'altas nuevas'} del enlace público` : 'Las altas del enlace público'}
          >
            <Inbox size={15} /> Altas{nuevas > 0 && <span className="helm-altas-num">{nuevas}</span>}
          </button>
          <button
            type="button" className="helm-btn" onClick={() => { setVerAccesos(true); cargarAccesos() }}
            title={accesosPendientes ? `${accesosPendientes} ${accesosPendientes === 1 ? 'solicitud' : 'solicitudes'} de acceso a AI para todo` : 'Solicitudes de acceso a AI para todo'}
          >
            <KeyRound size={15} /> Accesos{accesosPendientes > 0 && <span className="helm-altas-num">{accesosPendientes}</span>}
          </button>
          {conTelegram && (
            <button type="button" className="helm-btn" onClick={() => setVerTelegram(true)} title="El bot de Telegram de la agencia">
              <Send size={15} /> Telegram
            </button>
          )}
          {agencia?.plataforma && (
            <button type="button" className="helm-btn" onClick={() => navigate('/plataforma')}><Building2 size={15} /> Agencias</button>
          )}
          <button type="button" className="helm-btn" onClick={onUsers}><Users size={15} /> Usuarios</button>
          <button type="button" className="helm-btn" onClick={onLogout} title={email}><LogOut size={15} /> Salir</button>
        </div>
      </header>

      <FormNote>{error}</FormNote>
      {verCreditos && <Creditos onClose={() => { setVerCreditos(false); setRecarga(n => n + 1) }} />}
      {verTelegram && (
        <Modal title="Bot de Telegram" onClose={() => setVerTelegram(false)} wide>
          <TelegramAgencia />
        </Modal>
      )}
      {/* La bandeja y, encima, el cajón del alta que se abre: mientras está
          el cajón, el modal se quita (Escape cierra solo el cajón y se vuelve a la lista). */}
      {verAltas && !altaAbierta && (
        <Modal title="Altas recibidas" onClose={() => setVerAltas(false)} wide>
          <AltasRecibidas
            altas={altas} fallo={falloAltas} varias={variasAgencias}
            enlace={agencia?.slug ? enlaceAltaPublica(agencia.slug) : null}
            onAbrir={setAltaAbierta} onReintentar={cargarAltas}
          />
        </Modal>
      )}
      {verAccesos && (
        <Modal title="Accesos a AI para todo" onClose={() => setVerAccesos(false)} wide>
          <AccesosRecibidos accesos={accesos} fallo={falloAccesos} onCambio={cargarAccesos} />
        </Modal>
      )}
      {altaAbierta && (
        <DetalleAlta
          key={altaAbierta.id} alta={altaAbierta} varias={variasAgencias}
          onCerrar={() => setAltaAbierta(null)}
          onCambio={() => { cargarAltas(); onChanged() }}
          onAbrirPerfil={p => { setAltaAbierta(null); setVerAltas(false); onPick(p) }}
        />
      )}
      {bienvenida && (
        <Bienvenida
          saldo={bienvenida.saldo} pagado={bienvenida.pagado}
          onFin={() => { setBienvenida(null); setRecarga(n => n + 1) }}
        />
      )}

      {!loading && (
        <div className="helm-perfiles-grid">
          {agencia?.plataforma && !q && (
            <button type="button" className="helm-perfil helm-perfil--plataforma" onClick={() => navigate('/plataforma')}>
              <span className="helm-perfil-logo"><img src="/assets/logos/helm-mark.svg" alt="" /></span>
              <span className="helm-perfil-txt">
                <b>Plataforma</b>
                <small>Las agencias de HELM</small>
              </span>
              <ArrowUpRight className="helm-perfil-ir" size={16} />
            </button>
          )}
          {lista.map(c => {
            const m = brandOf(c)
            const av = avisos[c.id]
            return (
              <div key={c.id} className={'helm-perfil' + (menu === c.id ? ' con-menu' : '')}>
                <button type="button" className="helm-perfil-abrir" onClick={() => onPick(c)} aria-label={`Entrar en ${m.name}`} />
                <span className="helm-perfil-logo">
                  {m.logo ? <img src={m.logo} alt="" /> : m.name[0]?.toUpperCase()}
                </span>
                <span className="helm-perfil-txt">
                  <b>{m.name}</b>
                  <small>
                    {av?.sinLeer
                      ? <span className={'helm-perfil-avisos' + (av.errores ? ' error' : '')}>{av.errores ? `${av.errores} ${av.errores === 1 ? 'fallo' : 'fallos'} sin revisar` : `${av.sinLeer} ${av.sinLeer === 1 ? 'novedad' : 'novedades'}`}</span>
                      : c.id === lastId ? 'Último abierto' : `/${c.slug}`}
                  </small>
                </span>
                <button
                  type="button" className="helm-perfil-mas" aria-label={`Opciones de ${m.name}`}
                  aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}
                ><MoreHorizontal size={16} /></button>
                <ArrowUpRight className="helm-perfil-ir" size={16} />
                {menu === c.id && (
                  <div className="helm-perfil-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => activar(c, false)}><EyeOff size={14} /> Desactivar</button>
                    <button type="button" role="menuitem" className="peligro" onClick={() => { setMenu(null); setBorrando(c) }}><Trash2 size={14} /> Borrar del todo</button>
                  </div>
                )}
              </div>
            )
          })}
          <button type="button" className="helm-perfil nuevo" onClick={onNew}>
            <span className="helm-perfil-logo"><Plus size={18} /></span>
            <span className="helm-perfil-txt">
              <b>Nuevo perfil</b>
              <small>{propios.length ? 'Añadir otro negocio' : 'Crea el primero para empezar'}</small>
            </span>
          </button>
        </div>
      )}
      {!loading && q && lista.length === 0 && <div className="helm-empty">Ningún perfil coincide con «{q}».</div>}

      {inactivos.length > 0 && (
        <section className="helm-perfiles-inactivos">
          <h2>Desactivados</h2>
          <p>No salen en el tablero ni se puede entrar en ellos. Sus datos siguen intactos.</p>
          <ul>
            {inactivos.map(c => (
              <li key={c.id}>
                <span><b>{brandOf(c).name}</b><small>/{c.slug}</small></span>
                <button type="button" className="helm-btn" onClick={() => activar(c, true)}><RotateCcw size={14} /> Reactivar</button>
                <button type="button" className="helm-btn" onClick={() => setBorrando(c)}><Trash2 size={14} /> Borrar</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {borrando && (
        <BorrarModal
          perfil={borrando} onClose={() => setBorrando(null)}
          onBorrado={async () => { setBorrando(null); await Promise.all([onChanged(), cargarInactivos()]) }}
        />
      )}
    </div>
  )
}

// Borrar pide escribir la URL del perfil: no puede salir de un clic despistado.
function BorrarModal({ perfil, onClose, onBorrado }) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState(null)   // null | 'borrando' | { error } | { hecho }
  const coincide = texto.trim() === perfil.slug

  async function borrar(e) {
    e.preventDefault()
    if (!coincide) return
    setEstado('borrando')
    try { setEstado({ hecho: await perfilesApi.borrar(perfil.id, texto.trim()) }) }
    catch (err) { setEstado({ error: err.message }) }
  }

  if (estado?.hecho) {
    const filas = Object.values(estado.hecho.filas || {}).reduce((a, n) => a + n, 0)
    return (
      <Modal title="Perfil borrado" onClose={onBorrado}>
        <p className="helm-settings-lead">
          «{perfil.name}» ya no existe: {filas} registros y {estado.hecho.archivos} archivos borrados.
          Antes se guardó una copia completa en el servidor:
        </p>
        <p className="helm-perfil-ruta">{estado.hecho.copia}</p>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn primary" onClick={onBorrado}>Entendido</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Borrar «${perfil.name}»`} onClose={onClose}>
      <form onSubmit={borrar}>
        <p className="helm-settings-lead">
          Se borran el perfil y todo lo que cuelga de él: contactos, formularios y respuestas, ventas, equipo,
          accesos, integraciones y archivos. No se puede deshacer desde el panel. Antes se guarda una copia
          completa en el servidor. Si solo quieres que deje de aparecer, desactívalo.
        </p>
        <Field label={`Escribe ${perfil.slug} para confirmar`}>
          <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder={perfil.slug} autoFocus autoComplete="off" />
        </Field>
        <FormNote>{estado?.error}</FormNote>
        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn danger" disabled={!coincide || estado === 'borrando'}>
            {estado === 'borrando' ? 'Copiando y borrando…' : 'Borrar perfil'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
