// HELM — el puesto de la plataforma (helm.s4sf.net/plataforma): las agencias
// que se han dado de alta, qué hacen y cuánto gastan. Se entra con la misma
// cuenta de siempre; si no es de la plataforma, el servidor dice que no y se
// vuelve a /admin.
//
// Aquí se mira y se corrige a mano: sumar o quitar saldo (api/creditos.js),
// desactivar o reactivar a un administrador (api/users.js) y borrar una
// agencia entera (api/plataforma.js, con copia previa en el servidor).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCw, Search, ArrowUpRight, Trash2 } from 'lucide-react'
import { plataformaApi, creditosApi, usersApi } from './lib'
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

const ORIGEN = { panel: 'Panel', auto: 'Contenido automático', mcp: 'Conector de Claude', telegram: 'Telegram', registro: 'Registro', stripe: 'Stripe', manual: 'A mano' }
const TIPO = { consumo: 'Consumo', recarga: 'Recarga', ajuste: 'Ajuste', regalo: 'Regalo' }

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
            <Kpi label="Consumo 30 días" value={`${num(t.mes.consumo)} cr`} sub={`Nos cuesta ${eur(t.mes.costeEuros)}`} accent />
            <Kpi label="Recargas 30 días" value={eur(t.mes.recargasEuros)} sub={`${num(t.saldoPendiente)} cr por gastar`} />
            <Kpi label="Sin saldo" value={num(t.sinSaldo)} sub="No pueden usar la IA" tono={t.sinSaldo ? 'danger' : undefined} />
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
                <span role="columnheader" className="pl-num">Consumo 7 d</span>
                <span role="columnheader" className="pl-num">Consumo 30 d</span>
                <span role="columnheader" className="pl-num">Saldo</span>
              </div>
              {lista.map(a => (
                <button key={a.id} type="button" role="row" className="pl-fila" onClick={() => setAbierta(a.id)}>
                  <span className="pl-agencia" role="cell">
                    <b>{a.nombre}</b>
                    <small>{a.admin || 'sin administrador'}</small>
                    <span className="pl-marcas">
                      {a.casa && <i className="pl-marca">La casa</i>}
                      {a.sinCobro && !a.casa && <i className="pl-marca">No paga</i>}
                      {!a.sinCobro && a.creditos <= 0 && <i className="pl-marca pl-marca--mal">Sin saldo</i>}
                      {a.fallos7d > 0 && <i className="pl-marca pl-marca--mal" title="Trabajos de sus agentes que fallaron en los últimos 7 días">{a.fallos7d} fallos</i>}
                      {a.adminsActivos === 0 && a.admins > 0 && <i className="pl-marca pl-marca--mal">Desactivada</i>}
                    </span>
                  </span>
                  <span role="cell" data-l="Alta">{fecha(a.alta)}</span>
                  <span role="cell" data-l="Perfiles" className="pl-num">{num(a.perfiles)}</span>
                  <span role="cell" data-l="Último acceso">{hace(a.ultimoAcceso)}</span>
                  <span role="cell" data-l="Consumo 7 d" className="pl-num">{num(a.semana.consumo)}</span>
                  <span role="cell" data-l="Consumo 30 d" className="pl-num">{num(a.mes.consumo)}</span>
                  <span role="cell" data-l="Saldo" className={'pl-num' + (a.creditos < 0 ? ' pl-resta' : '')}>
                    {a.sinCobro ? '—' : `${num(a.creditos)} cr`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <p className="pl-nota">
          El consumo y el coste salen de los movimientos de saldo, así que la agencia de la casa no tiene: lo suyo no se apunta.
          1 € = 100 créditos.
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
  const [ajuste, setAjuste] = useState({ euros: '', nota: '' })
  const [guardando, setGuardando] = useState(false)

  const cargar = () => plataformaApi.agencia(fila.id).then(setD).catch(e => setError(e.message))
  useEffect(() => { cargar() }, [fila.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function ajustar(e) {
    e.preventDefault(); setError(null); setGuardando(true)
    try {
      await creditosApi.ajuste(fila.id, Number(ajuste.euros), ajuste.nota)
      setAjuste({ euros: '', nota: '' })
      await Promise.all([cargar(), onCambio()])
    } catch (err) { setError(err.message) } finally { setGuardando(false) }
  }

  async function activar(admin) {
    setError(null)
    try {
      await usersApi.setActive('superadmin', admin.id, !admin.activo)
      await Promise.all([cargar(), onCambio()])
    } catch (err) { setError(err.message) }
  }

  const max = (filas) => Math.max(1, ...filas.map(f => f.consumo))

  return (
    <Drawer
      title={fila.nombre}
      sub={`${fila.admin || 'sin administrador'} · alta el ${fecha(fila.alta)}`}
      onClose={onClose}
      footer={!fila.casa && (
        <form onSubmit={ajustar} className="pl-ajuste">
          <Field label="Sumar o quitar (€)">
            <Input type="number" step="0.01" value={ajuste.euros} onChange={e => setAjuste({ ...ajuste, euros: e.target.value })} placeholder="10 o -10" required />
          </Field>
          <Field label="Motivo">
            <Input value={ajuste.nota} onChange={e => setAjuste({ ...ajuste, nota: e.target.value })} placeholder="Por qué" />
          </Field>
          <button type="submit" className="helm-btn primary" disabled={guardando}>{guardando ? 'Aplicando…' : 'Aplicar'}</button>
          <small className="pl-ajuste-nota">1 € = 100 créditos. En negativo, se quita.</small>
        </form>
      )}
    >
      <FormNote>{error}</FormNote>

      <div className="pl-cifras">
        <div><span>Saldo</span><b className={fila.creditos < 0 ? 'pl-resta' : ''}>{fila.sinCobro ? 'No paga' : `${num(fila.creditos)} cr`}</b></div>
        <div><span>Consumo 30 d</span><b>{num(fila.mes.consumo)} cr</b></div>
        <div><span>Nos cuesta</span><b>{eur(fila.mes.costeEuros)}</b></div>
        <div><span>Recargas 30 d</span><b>{eur(fila.mes.recargasEuros)}</b></div>
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

          {d.porOrigen.length > 0 && (
            <>
              <h4 className="pl-h">En qué gasta <small>30 días</small></h4>
              <div className="pl-barras">
                {d.porOrigen.map(o => (
                  <div key={o.clave}>
                    <span>{ORIGEN[o.clave] || o.clave}</span>
                    <i style={{ '--w': `${(o.consumo / max(d.porOrigen)) * 100}%` }} />
                    <b>{num(o.consumo)} cr</b>
                  </div>
                ))}
              </div>
              <div className="pl-barras pl-barras--fino">
                {d.porModelo.map(o => (
                  <div key={o.clave}>
                    <span>{o.clave}</span>
                    <i style={{ '--w': `${(o.consumo / max(d.porModelo)) * 100}%` }} />
                    <b>{num(o.consumo)} cr</b>
                  </div>
                ))}
              </div>
            </>
          )}

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

          <h4 className="pl-h">Movimientos</h4>
          {d.movimientos.length ? (
            <ul className="helm-creditos-movs">
              {d.movimientos.map(m => (
                <li key={m.id}>
                  <span>{TIPO[m.tipo] || m.tipo}{m.origen ? ` · ${ORIGEN[m.origen] || m.origen}` : ''}{m.perfil ? ` · ${m.perfil}` : ''}</span>
                  <small>
                    {new Date(m.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    {m.modelo ? ` · ${m.modelo}` : ''}{m.tokens ? ` · ${num(m.tokens)} tokens` : ''}
                    {m.costeEuros != null ? ` · nos cuesta ${eur(m.costeEuros)}` : ''}
                  </small>
                  <b className={m.creditos < 0 ? 'resta' : ''}>{m.creditos > 0 ? '+' : ''}{num(m.creditos)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="pl-vacio">Sin movimientos todavía.</p>}

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
        administradores, su saldo y sus movimientos. Antes se guarda una copia en el servidor. No se puede deshacer.
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
