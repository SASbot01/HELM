// HELM — la puerta del administrador: todos los perfiles en un tablero de
// recuadros, y él decide en cuál entra. Un cliente nunca llega aquí: entra
// directo al suyo (ver HelmApp).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, ArrowUpRight, LogOut, Users, MoreHorizontal, EyeOff, Trash2, RotateCcw } from 'lucide-react'
import { brandOf, notificacionesApi, perfilesApi } from './lib'
import { Modal, Field, Input, FormNote } from './ui'
import './perfiles.css'

export default function Perfiles({ clients, loading, lastId, email, producto, onPick, onNew, onUsers, onLogout, onChanged }) {
  const [q, setQ] = useState('')
  const [avisos, setAvisos] = useState({})          // id de perfil → { sinLeer, errores }
  const [inactivos, setInactivos] = useState([])
  const [menu, setMenu] = useState(null)            // id del perfil con el menú abierto
  const [borrando, setBorrando] = useState(null)    // perfil en el modal de borrado
  const [error, setError] = useState(null)
  const caja = useRef(null)

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return clients
    return clients.filter(c => (c.name + ' ' + (c.brand_name || '') + ' ' + c.slug).toLowerCase().includes(t))
  }, [clients, q])

  const cargarInactivos = () => perfilesApi.inactivos().then(r => setInactivos(r.perfiles)).catch(() => {})
  useEffect(() => {
    if (!localStorage.getItem('bw_admin_jwt')) return
    notificacionesApi.resumen().then(r => setAvisos(r.porPerfil || {})).catch(() => {})
    cargarInactivos()
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
          <h1>Perfiles de {producto}</h1>
          <p>{loading ? 'Cargando perfiles…' : clients.length ? 'Elige en cuál quieres entrar.' : 'Todavía no hay ninguno.'}</p>
        </div>
        <div className="helm-perfiles-acc">
          {clients.length > 6 && (
            <label className="helm-search">
              <Search size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar perfil" autoFocus />
            </label>
          )}
          <button type="button" className="helm-btn" onClick={onUsers}><Users size={15} /> Usuarios</button>
          <button type="button" className="helm-btn" onClick={onLogout} title={email}><LogOut size={15} /> Salir</button>
        </div>
      </header>

      <FormNote>{error}</FormNote>

      {!loading && (
        <div className="helm-perfiles-grid">
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
              <small>{clients.length ? 'Añadir otro negocio' : 'Crea el primero para empezar'}</small>
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
