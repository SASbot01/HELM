// HELM — el puesto de la plataforma (helm.s4sf.net/plataforma): las agencias
// que se han dado de alta, qué hacen y cuánto gastan. Se entra con la misma
// cuenta de siempre; si no es de la plataforma, el servidor dice que no y se
// vuelve a /admin.
//
// Aquí se mira y se corrige a mano: dar o anular licencia (api/plataforma.js),
// desactivar o reactivar a un administrador (api/users.js) y borrar una
// agencia entera (api/plataforma.js, con copia previa en el servidor).
//
// Desde el 7-nov-2026 cada agencia paga una licencia anual (97 €) y pone su
// propia clave de Claude: aquí ya no hay saldo ni consumo.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCw, Search, ArrowUpRight, Trash2 } from 'lucide-react'
import { plataformaApi, usersApi } from './lib'
import { useHelmTheme } from './theme'
import { Kpi, Panel, Drawer, Field, Input, FormNote, Empty } from './ui'
import './plataforma.css'

const num = (v) => Number(v || 0).toLocaleString('es-ES', { useGrouping: 'always' })
const eur = (v) => Number(v || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

// «hace 3 h», «hace 2 días»: para el último acceso se lee mejor que una fecha.
function hace(iso) {
  if (!iso) return 'nunca'
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (min < 2) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

// La licencia en la tabla: casa (no la necesita), activa, caducada o sin.
function textoLicencia(l) {
  if (!l || l.estado === 'casa') return '—'
  if (l.estado === 'sin') return 'Sin licencia'
  if (l.estado === 'caducada') return `Caducó el ${fecha(l.venceAt)}`
  return `Hasta el ${fecha(l.venceAt)}`
}

export default function Plataforma() {
  const navigate = useNavigate()
  const [theme] = useHelmTheme()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(null)   // id de la agencia en el cajón
  const [cargando, setCargando] = useState(false)

  async function cargar() {
    setCargando(true); setError(null)
    try { setDatos(await plataformaApi.resumen()) }
    catch (e) {
      // Una cuenta que no es de la plataforma no tiene nada que ver aquí.
      if (/plataforma/i.test(e.message)) return navigate('/admin', { replace: true })
      setError(e.message)
    } finally { setCargando(false) }
  }

  useEffect(() => {
    if (!localStorage.getItem('bw_admin_jwt')) { navigate('/login', { replace: true }); return }
    document.title = 'Plataforma · HELM'
    cargar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    const todas = datos?.agencias || []
    if (!t) return todas
    return todas.filter(a => `${a.nombre} ${a.slug} ${a.admin || ''}`.toLowerCase().includes(t))
  }, [datos, q])

  const t = datos?.totales
  const fila = abierta && datos?.agencias.find(a => a.id === abierta)

  return (
    <div className="helm" data-theme={theme} data-tono="oro">
      <div className="pl">
        <header className="pl-cab">
          <div className="pl-titulo">
            <img src="/assets/logos/helm-mark.svg" alt="" className="pl-logo" />
            <div>
              <h1>Plataforma</h1>
              <p>Las agencias que trabajan con HELM.</p>
            </div>
          </div>
          <div className="pl-acc">
            <button type="button" className="helm-btn" onClick={cargar} disabled={cargando} title="Actualizar">
              <RotateCw size={15} className={cargando ? 'pl-gira' : ''} /> Actualizar
            </button>
            <button type="button" className="helm-btn" onClick={() => navigate('/admin')}>
              <ArrowLeft size={15} /> Mis perfiles
            </button>
          </div>
        </header>

        <FormNote>{error}</FormNote>

        {t && (
          <div className="helm-grid helm-kpis pl-kpis">
            <Kpi label="Agencias" value={num(t.agencias)} sub={t.nuevas7d ? `+${num(t.nuevas7d)} esta semana` : 'Ninguna nueva esta semana'} />
            <Kpi label="Activas 7 días" value={num(t.activas7d)} sub="Han entrado al panel" />
            <Kpi label="Perfiles" value={num(t.perfiles)} sub="Clientes de las agencias" />
            <Kpi label="Con licencia" value={num(t.conLicencia)} sub={t.caducan30d ? `${num(t.caducan30d)} caducan en 30 días` : 'Ninguna caduca este mes'} accent />
            <Kpi label="Ingresos 30 días" value={eur(t.ingresos30d)} sub={`${eur(t.ingresos365d)} en el último año`} />
            <Kpi label="Sin licencia" value={num(t.sinLicencia)} sub="No pueden entrar" tono={t.sinLicencia ? 'danger' : undefined} />
          </div>
        )}

        <Panel
          title="Agencias"
          action={(
            <label className="helm-search pl-buscar">
              <Search size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar agencia o email" />
            </label>
          )}
        >
          {!datos && !error && <Empty>Cargando agencias…</Empty>}
          {datos && !lista.length && <Empty>{q ? 'Ninguna agencia coincide.' : 'Todavía no se ha registrado ninguna.'}</Empty>}
          {lista.length > 0 && (
            <div className="pl-tabla" role="table">
              <div className="pl-fila pl-fila--cab" role="row">
                <span role="columnheader">Agencia</span>
                <span role="columnheader">Alta</span>
                <span role="columnheader" className="pl-num">Perfiles</span>
                <span role="columnheader">Último acceso</span>
                <span role="columnheader">Licencia</span>
              </div>
              {lista.map(a => (
                <button key={a.id} type="button" role="row" className="pl-fila" onClick={() => setAbierta(a.id)}>
                  <span className="pl-agencia" role="cell">
                    <b>{a.nombre}</b>
                    <small>{a.admin || 'sin administrador'}</small>
                    <span className="pl-marcas">
                      {a.casa && <i className="pl-marca">La casa</i>}
                      {a.sinCobro && !a.casa && <i className="pl-marca">No paga</i>}
                      {['sin', 'caducada'].includes(a.licencia?.estado) && <i className="pl-marca pl-marca--mal">{a.licencia.estado === 'sin' ? 'Sin licencia' : 'Caducada'}</i>}
                      {a.licencia?.estado === 'activa' && a.licencia.dias <= 30 && <i className="pl-marca">Caduca en {a.licencia.dias} d</i>}
                      {a.fallos7d > 0 && <i className="pl-marca pl-marca--mal" title="Trabajos de sus agentes que fallaron en los últimos 7 días">{a.fallos7d} fallos</i>}
                      {a.adminsActivos === 0 && a.admins > 0 && <i className="pl-marca pl-marca--mal">Desactivada</i>}
                    </span>
                  </span>
                  <span role="cell" data-l="Alta">{fecha(a.alta)}</span>
                  <span role="cell" data-l="Perfiles" className="pl-num">{num(a.perfiles)}</span>
                  <span role="cell" data-l="Último acceso">{hace(a.ultimoAcceso)}</span>
                  <span role="cell" data-l="Licencia" className={a.licencia?.estado === 'activa' || a.licencia?.estado === 'casa' ? '' : 'pl-resta'}>
                    {textoLicencia(a.licencia)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <p className="pl-nota">
          Cada agencia paga 97 € al año y usa su propia clave de Claude: HELM no cobra por uso. La de la casa no necesita licencia.
        </p>
      </div>

      {fila && <Agencia fila={fila} onClose={() => setAbierta(null)} onCambio={cargar} />}
    </div>
  )
}

function Agencia({ fila, onClose, onCambio }) {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [regalo, setRegalo] = useState({ meses: '12', nota: '' })
  const [guardando, setGuardando] = useState(false)

  const cargar = () => plataformaApi.agencia(fila.id).then(setD).catch(e => setError(e.message))
  useEffect(() => { cargar() }, [fila.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function darLicencia(e) {
    e.preventDefault(); setError(null); setGuardando(true)
    try {
      await plataformaApi.darLicencia(fila.id, Number(regalo.meses), regalo.nota)
      setRegalo({ meses: '12', nota: '' })
      await Promise.all([cargar(), onCambio()])
    } catch (err) { setError(err.message) } finally { setGuardando(false) }
  }

  async function anular(l) {
    if (!window.confirm(`¿Anular la licencia del ${fecha(l.empieza)} al ${fecha(l.vence)}? Deja de contar para entrar.`)) return
    setError(null)
    try {
      await plataformaApi.anularLicencia(fila.id, l.id)
      await Promise.all([cargar(), onCambio()])
    } catch (err) { setError(err.message) }
  }

  async function activar(admin) {
    setError(null)
    try {
      await usersApi.setActive('superadmin', admin.id, !admin.activo)
      await Promise.all([cargar(), onCambio()])
    } catch (err) { setError(err.message) }
  }

  return (
    <Drawer
      title={fila.nombre}
      sub={`${fila.admin || 'sin administrador'} · alta el ${fecha(fila.alta)}`}
      onClose={onClose}
      footer={!fila.casa && !fila.sinCobro && (
        <form onSubmit={darLicencia} className="pl-ajuste">
          <Field label="Dar licencia (meses)">
            <Input type="number" min="1" max="36" step="1" value={regalo.meses} onChange={e => setRegalo({ ...regalo, meses: e.target.value })} required />
          </Field>
          <Field label="Motivo">
            <Input value={regalo.nota} onChange={e => setRegalo({ ...regalo, nota: e.target.value })} placeholder="Por qué, sin cobro" />
          </Field>
          <button type="submit" className="helm-btn primary" disabled={guardando}>{guardando ? 'Dando…' : 'Dar'}</button>
          <small className="pl-ajuste-nota">Sin cobro. Empieza hoy o, si aún tiene licencia, cuando acabe la que tiene.</small>
        </form>
      )}
    >
      <FormNote>{error}</FormNote>

      <div className="pl-cifras">
        <div><span>Licencia</span><b className={['sin', 'caducada'].includes(fila.licencia?.estado) ? 'pl-resta' : ''}>{fila.licencia?.estado === 'casa' ? 'No la necesita' : textoLicencia(fila.licencia)}</b></div>
        <div><span>Perfiles</span><b>{num(fila.perfiles)}</b></div>
        <div><span>Último acceso</span><b>{hace(fila.ultimoAcceso)}</b></div>
      </div>

      {!d && !error && <Empty>Cargando…</Empty>}
      {d && (
        <>
          <h4 className="pl-h">Administradores</h4>
          <ul className="pl-lista">
            {d.admins.map(s => (
              <li key={s.id}>
                <span>
                  <b>{s.email}</b>
                  <small>{s.plataforma ? 'Plataforma · ' : ''}{s.activo ? 'Activo' : 'Desactivado'} · último acceso {hace(s.ultimoAcceso)}</small>
                </span>
                {!s.plataforma && (
                  <button type="button" className={'helm-btn' + (s.activo ? ' danger' : '')} onClick={() => activar(s)}>
                    {s.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          <h4 className="pl-h">Perfiles <small>{d.perfiles.length}</small></h4>
          {d.perfiles.length ? (
            <ul className="pl-lista">
              {d.perfiles.map(p => (
                <li key={p.id}>
                  <span className="pl-perfil">
                    <i className="pl-perfil-logo">{p.logo ? <img src={p.logo} alt="" /> : (p.nombre || '?')[0].toUpperCase()}</i>
                    <span>
                      <b>{p.nombre}</b>
                      <small>/{p.slug} · equipo {p.equipo}{p.activo ? '' : ' · desactivado'} · {fecha(p.alta)}</small>
                    </span>
                  </span>
                  <button type="button" className="helm-btn" onClick={() => navigate(`/${p.slug}`)}>
                    Entrar <ArrowUpRight size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="pl-vacio">Aún no ha creado ningún perfil.</p>}

          {d.fallos.length > 0 && (
            <>
              <h4 className="pl-h">Fallos de los agentes <small>7 días</small></h4>
              <ul className="pl-lista pl-lista--fallos">
                {d.fallos.map((f, i) => (
                  <li key={i}>
                    <span>
                      <b>{f.agente || f.tipo}{f.perfil ? ` · ${f.perfil}` : ''}</b>
                      <small>{hace(f.fecha)} · {f.error || 'sin detalle'}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="pl-h">Licencias</h4>
          {d.licencias.length ? (
            <ul className="pl-lista">
              {d.licencias.map(l => (
                <li key={l.id}>
                  <span>
                    <b>{fecha(l.empieza)} → {fecha(l.vence)}{l.estado === 'anulada' ? ' · anulada' : ''}</b>
                    <small>
                      {l.origen === 'manual' ? `Dada a mano${l.nota ? ` · ${l.nota}` : ''}` : `Pagada el ${fecha(l.pagada)} · ${eur(l.importe)}`}
                    </small>
                  </span>
                  {l.estado === 'activa' && (
                    <button type="button" className="helm-btn" onClick={() => anular(l)}>Anular</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="pl-vacio">{fila.casa || fila.sinCobro ? 'La agencia de la casa no necesita licencia.' : 'Nunca ha tenido licencia.'}</p>}

          {!fila.casa && <BorrarAgencia fila={fila} onBorrada={() => { onClose(); onCambio() }} />}
        </>
      )}
    </Drawer>
  )
}

// Borrar una agencia entera. El servidor guarda antes una copia, se niega con
// la de la plataforma y con las que han pagado, y exige el slug escrito.
function BorrarAgencia({ fila, onBorrada }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState(null)

  async function borrar(e) {
    e.preventDefault(); setError(null); setBorrando(true)
    try { await plataformaApi.borrar(fila.id, texto.trim()); onBorrada() }
    catch (err) { setError(err.message); setBorrando(false) }
  }

  return (
    <div className="pl-peligro">
      <h4 className="pl-h">Borrar la agencia</h4>
      <p className="pl-vacio">
        Se borran {fila.perfiles === 1 ? 'su perfil' : `sus ${fila.perfiles} perfiles`} con todos sus datos, sus
        administradores y su clave de Claude. Si ha pagado alguna licencia, no se deja borrar. Antes se guarda una
        copia en el servidor. No se puede deshacer.
      </p>
      {!abierto ? (
        <button type="button" className="helm-btn danger" onClick={() => setAbierto(true)}><Trash2 size={14} /> Borrar agencia</button>
      ) : (
        <form onSubmit={borrar} className="pl-borrar">
          <Field label={`Escribe ${fila.slug} para confirmar`}>
            <Input value={texto} onChange={e => setTexto(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
          </Field>
          <FormNote>{error}</FormNote>
          <div className="pl-borrar-acc">
            <button type="button" className="helm-btn" onClick={() => { setAbierto(false); setTexto(''); setError(null) }}>Cancelar</button>
            <button type="submit" className="helm-btn danger" disabled={borrando || texto.trim() !== fila.slug}>
              {borrando ? 'Borrando…' : 'Borrar para siempre'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
