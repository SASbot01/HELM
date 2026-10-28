// HELM — Fiscal: el control de plazos de una asesoría.
//
// Con cientos de clientes, saber quién tiene el 303 sin presentar a tres días
// del 20 no cabe en un Excel. Esto es esa pantalla: qué vence, de quién, en qué
// estado y quién lo lleva.
//
// Dos pestañas y un orden que importa:
//   Plazos   → lo que vence, ordenado por urgencia. Es la vista del día a día.
//   Clientes → la ficha fiscal de cada uno. De aquí salen los plazos, así que
//              sin ficha no hay calendario.
//
// Sección de sector: nace apagada y se enciende en Secciones (ver permisos.js).
// Un infoproducto no tiene por qué ver modelos del 347.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as ChartTooltip } from 'recharts'
import { CalendarClock, Plus, RefreshCw, Check, Users, Send, LayoutDashboard, MessageSquare, Mail, Copy, Download } from 'lucide-react'
import { supabase, fetchRows, fetchRowsOrError, insertRow, updateRow, fmtDate, MISSING_TABLE, docsApi, exportCSV } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Textarea, Kpi, Tabs, FormNote } from '../ui'
import MigracionPendiente from '../MigracionPendiente'
import {
  MODELOS, FORMAS, IVA_OPCIONES, IRPF_OPCIONES, ESTADOS, ESTADO_MAP,
  obligacionesDe, urgencia, diasPara,
} from '../fiscal/modelos'
import { avisosDeHoy, mensajeDe, enlaceWhatsApp, enlaceEmail } from '../fiscal/avisos'

// El enlace de subida caduca (ver DIAS en api/documentos.js) pero eso vivía
// invisible dentro del JWT. Un JWT no está cifrado, solo firmado: se puede
// leer el "exp" sin verificar la firma, que es justo lo único que hace falta
// para enseñarlo — la verificación de verdad la hace el servidor al usarlo.
function caducaDelEnlace(url) {
  try {
    const token = String(url || '').split('/').pop()
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp) return null
    return new Date(payload.exp * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return null }
}

const TABS = [
  { key: 'plazos', label: 'Plazos', icon: <CalendarClock size={15} /> },
  { key: 'avisos', label: 'Avisos de hoy', icon: <Send size={15} /> },
  { key: 'direccion', label: 'Dirección', icon: <LayoutDashboard size={15} /> },
  { key: 'clientes', label: 'Clientes', icon: <Users size={15} /> },
]

export default function Fiscal({ clientId }) {
  const [tab, setTab] = useState('plazos')
  const [perfiles, setPerfiles] = useState(null)
  const [obligaciones, setObligaciones] = useState([])
  const [contactos, setContactos] = useState([])
  const [equipo, setEquipo] = useState([])
  const [fatal, setFatal] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [p, o, c, e] = await Promise.all([
      fetchRowsOrError('helm_fiscal_perfil', clientId, { order: 'created_at', asc: true }),
      supabase.from('helm_fiscal_obligaciones').select('*')
        .eq('client_id', clientId).order('fecha_limite'),
      fetchRows('crm_contacts', clientId, { limit: 2000 }),
      fetchRowsOrError('helm_team', clientId, { order: 'created_at', asc: true }),
    ])
    if (p.error) { setFatal(p.error); setPerfiles([]); return }
    setPerfiles(p.rows)
    setObligaciones(o.data || [])
    setContactos(c || [])
    setEquipo(e.rows || [])
  }, [clientId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const nombreDe = useCallback(
    (contactId) => contactos.find(c => c.id === contactId)?.name || 'Cliente borrado',
    [contactos],
  )

  if (fatal === MISSING_TABLE) return <MigracionPendiente seccion="Fiscal" archivo="migrations/helm_fiscal.sql" />

  return (
    <div className="helm-grid" style={{ gap: 20 }}>
      {error && <FormNote>{error}</FormNote>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'plazos' ? (
        <Plazos
          obligaciones={obligaciones} nombreDe={nombreDe}
          perfiles={perfiles || []} clientId={clientId}
          onCambio={load} onError={setError}
        />
      ) : tab === 'avisos' ? (
        <Avisos
          obligaciones={obligaciones} contactos={contactos} clientId={clientId}
          onError={setError}
        />
      ) : tab === 'direccion' ? (
        <Direccion
          obligaciones={obligaciones} perfiles={perfiles || []} equipo={equipo}
          nombreDe={nombreDe}
        />
      ) : (
        <Clientes
          perfiles={perfiles} contactos={contactos} equipo={equipo}
          clientId={clientId} onCambio={load} onError={setError}
        />
      )}
    </div>
  )
}

// ── Plazos ─────────────────────────────────────────────────────────────────
function Plazos({ obligaciones, nombreDe, perfiles, clientId, onCambio, onError }) {
  const [filtro, setFiltro] = useState('abiertos')
  const [generando, setGenerando] = useState(false)

  // Lo vencido sin presentar se marca solo al mirarlo: si hubiera que esperar a
  // que alguien lo tocara, el recuento del director mentiría justo el día que
  // más importa.
  const conEstado = useMemo(() => obligaciones.map(o => (
    o.estado !== 'presentado' && diasPara(o.fecha_limite) < 0
      ? { ...o, estado: 'fuera_plazo' }
      : o
  )), [obligaciones])

  const kpis = useMemo(() => ({
    semana: conEstado.filter(o => o.estado !== 'presentado' && diasPara(o.fecha_limite) >= 0 && diasPara(o.fecha_limite) <= 7).length,
    pendientes: conEstado.filter(o => o.estado === 'pendiente_docs').length,
    fuera: conEstado.filter(o => o.estado === 'fuera_plazo').length,
    presentados: conEstado.filter(o => o.estado === 'presentado').length,
  }), [conEstado])

  const visibles = useMemo(() => {
    const l = filtro === 'todos' ? conEstado
      : filtro === 'abiertos' ? conEstado.filter(o => o.estado !== 'presentado')
        : conEstado.filter(o => o.estado === filtro)
    return [...l].sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
  }, [conEstado, filtro])

  async function cambiarEstado(o, estado) {
    try {
      await updateRow('helm_fiscal_obligaciones', o.id, {
        estado,
        presentado_at: estado === 'presentado' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      onCambio()
    } catch (e) { onError('No se pudo cambiar: ' + e.message) }
  }

  // Genera el ejercicio entero a partir de las fichas. Se puede repetir sin
  // miedo: la clave única (cliente, modelo, periodo) descarta lo que ya existe,
  // así que añadir un cliente nuevo y volver a pulsar solo crea lo suyo.
  async function generar(año) {
    if (perfiles.length === 0) { onError('Primero rellena la ficha fiscal de algún cliente.'); return }
    setGenerando(true); onError(null)
    let creadas = 0
    try {
      for (const p of perfiles) {
        const filas = obligacionesDe(p, año).map(x => ({
          ...x, client_id: clientId, contact_id: p.contact_id,
        }))
        if (!filas.length) continue
        const { data, error } = await supabase
          .from('helm_fiscal_obligaciones')
          .upsert(filas, { onConflict: 'contact_id,modelo,periodo', ignoreDuplicates: true })
          .select('id')
        if (error) throw error
        creadas += data?.length || 0
      }
      onCambio()
      onError(creadas ? null : 'Ya estaban todos los plazos de ese ejercicio.')
    } catch (e) { onError('No se pudieron generar: ' + e.message) }
    setGenerando(false)
  }

  const año = new Date().getFullYear()

  function exportar() {
    exportCSV('plazos-fiscales.csv', [
      { label: 'Vence', value: 'fecha_limite' },
      { label: 'Cliente', value: o => nombreDe(o.contact_id) },
      { label: 'Modelo', value: 'modelo' },
      { label: 'Nombre del modelo', value: o => MODELOS[o.modelo]?.nombre || '' },
      { label: 'Periodo', value: 'periodo' },
      { label: 'Estado', value: o => ESTADO_MAP[o.estado]?.label || o.estado },
    ], visibles)
  }

  return (
    <>
      <div className="helm-grid helm-kpis">
        <Kpi label="Vencen esta semana" value={kpis.semana} accent={kpis.semana > 0} />
        <Kpi label="Pendientes de docs" value={kpis.pendientes} />
        <Kpi label="Fuera de plazo" value={kpis.fuera} tono={kpis.fuera > 0 ? 'danger' : undefined}
          sub={kpis.fuera > 0 ? 'requiere atención' : undefined} />
        <Kpi label="Presentados" value={kpis.presentados} />
      </div>

      <Panel
        title="Plazos fiscales"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="helm-select" value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="abiertos">Sin presentar</option>
              <option value="todos">Todos</option>
              {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
            <button className="helm-btn" onClick={exportar} disabled={!visibles.length}>
              <Download size={15} /> Exportar CSV
            </button>
            <button className="helm-btn primary" disabled={generando} onClick={() => generar(año)}>
              {generando ? <RefreshCw size={15} className="helm-spin" /> : <Plus size={15} />}
              {generando ? 'Generando…' : `Generar ${año}`}
            </button>
          </div>
        }
      >
        {visibles.length === 0 ? (
          <Empty>
            {obligaciones.length === 0
              ? `Sin plazos todavía. Rellena las fichas fiscales en «Clientes» y pulsa «Generar ${año}».`
              : 'Nada con ese filtro.'}
          </Empty>
        ) : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr>
                  <th>Vence</th><th>Cliente</th><th>Modelo</th><th>Periodo</th>
                  <th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(o => {
                  const u = urgencia(o)
                  const est = ESTADO_MAP[o.estado]
                  return (
                    <tr key={o.id}>
                      <td>
                        {fmtDate(o.fecha_limite)}
                        {u && <div className={'helm-chip ' + u.tono} style={{ marginTop: 4 }}>{u.texto}</div>}
                      </td>
                      <td>{nombreDe(o.contact_id)}</td>
                      <td>
                        <b>{o.modelo}</b>
                        <small style={{ display: 'block', color: 'var(--text-mut)' }}>
                          {MODELOS[o.modelo]?.nombre || ''}
                        </small>
                      </td>
                      <td>{o.periodo}</td>
                      <td><span className={'helm-badge ' + (est?.tono || '')}>{est?.label || o.estado}</span></td>
                      <td>
                        <select
                          className="helm-select" value={o.estado}
                          onChange={e => cambiarEstado(o, e.target.value)}
                        >
                          {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}


// ── Avisos de hoy ──────────────────────────────────────────────────────────
// La pantalla que sustituye a "alguien tiene que acordarse". El despacho la
// abre por la mañana y ve exactamente a quién escribir, con el mensaje hecho y
// su enlace de subida dentro. Un clic y sale por WhatsApp.
//
// No se manda solo todavía porque HELM no tiene proveedor de correo ni la API
// de WhatsApp Business. Pero la parte difícil de un aviso nunca fue el envío:
// era saber A QUIÉN. Cuando haya canal, esto no cambia — solo deja de pulsarlo
// una persona.
function Avisos({ obligaciones, contactos, clientId, onError }) {
  const [enviados, setEnviados] = useState(null)
  const [enlaces, setEnlaces] = useState({})
  const [copiado, setCopiado] = useState(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('helm_fiscal_avisos')
      .select('obligacion_id, tipo').eq('client_id', clientId)
    setEnviados(new Set((data || []).map(a => `${a.obligacion_id}:${a.tipo}`)))
  }, [clientId])

  // Los setState de cargar() van después del await contra Supabase: no hay
  // render en cascada, la regla solo no sabe seguir el await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const lista = useMemo(
    () => (enviados ? avisosDeHoy(obligaciones, enviados) : []),
    [obligaciones, enviados],
  )

  // Los enlaces de subida se piden de una vez para toda la lista, no uno por
  // clic: si se esperara al clic, el mensaje saldría sin enlace, que es lo único
  // que se le pide al cliente. Cada contacto se pide una sola vez aunque tenga
  // varios avisos.
  const faltan = useMemo(
    () => [...new Set(lista.map(a => a.obligacion.contact_id))].filter(id => !enlaces[id]),
    [lista, enlaces],
  )

  useEffect(() => {
    if (!faltan.length) return
    let vivo = true
    Promise.all(faltan.map(async id => {
      try {
        const { token } = await docsApi.enlace(clientId, id)
        return [id, `${window.location.origin}/d/${token}`]
      } catch { return null }
    })).then(pares => {
      if (!vivo) return
      const nuevos = Object.fromEntries(pares.filter(Boolean))
      if (Object.keys(nuevos).length) setEnlaces(e => ({ ...e, ...nuevos }))
    })
    return () => { vivo = false }
  }, [faltan, clientId])

  async function marcar(aviso, canal) {
    try {
      await insertRow('helm_fiscal_avisos', {
        client_id: clientId,
        obligacion_id: aviso.obligacion.id,
        tipo: aviso.tipo,
        canal,
      })
      cargar()
    } catch (e) { onError('No se pudo anotar el aviso: ' + e.message) }
  }

  if (enviados === null) return <Panel title="Avisos de hoy"><Empty>Cargando…</Empty></Panel>

  return (
    <Panel
      title="Avisos de hoy"
      action={<span className="helm-badge">{lista.length} por mandar</span>}
    >
      <p className="helm-settings-lead">
        A quién hay que escribir hoy y qué decirle. El mensaje ya lleva dentro el enlace donde
        sube sus documentos. Cada aviso se manda una sola vez: lo que marques aquí no vuelve a
        aparecer.
      </p>

      {lista.length === 0 ? (
        <Empty>Hoy no hay que avisar a nadie. Vuelve mañana.</Empty>
      ) : (
        <div className="helm-grid" style={{ gap: 10 }}>
          {lista.map(a => {
            const c = contactos.find(x => x.id === a.obligacion.contact_id)
            const enlace = enlaces[a.obligacion.contact_id]
            const msg = mensajeDe({
              tipo: a.tipo, obligacion: a.obligacion,
              nombreCliente: c?.name, enlace,
            })
            const wa = enlaceWhatsApp(c?.whatsapp || c?.phone, msg)
            const mail = enlaceEmail(c?.email, `Modelo ${a.obligacion.modelo} · ${a.obligacion.periodo}`, msg)
            return (
              <div key={`${a.obligacion.id}:${a.tipo}`} className="helm-curso">
                <div className="helm-curso-head">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <b>{c?.name || 'Cliente'}</b>
                    <small style={{ display: 'block', color: 'var(--text-mut)' }}>
                      Modelo {a.obligacion.modelo} · {a.obligacion.periodo} · vence en {a.faltan} día{a.faltan === 1 ? '' : 's'}
                    </small>
                  </div>
                  <span className={'helm-badge ' + (a.tono || '')}>{a.label}</span>
                </div>

                <pre className="helm-aviso-msg">{msg}</pre>
                {enlace && caducaDelEnlace(enlace) && (
                  <small style={{ display: 'block', color: 'var(--text-mut)', marginTop: -4, marginBottom: 4 }}>
                    El enlace de subida caduca el {caducaDelEnlace(enlace)}.
                  </small>
                )}

                <div className="helm-curso-acts">
                  {wa && (
                    <a className="helm-btn primary" href={wa} target="_blank" rel="noreferrer"
                      onClick={() => marcar(a, 'whatsapp')}>
                      <MessageSquare size={14} /> WhatsApp
                    </a>
                  )}
                  {mail && (
                    <a className="helm-btn" href={mail} onClick={() => marcar(a, 'email')}>
                      <Mail size={14} /> Email
                    </a>
                  )}
                  <button className="helm-btn" onClick={() => {
                    navigator.clipboard?.writeText(msg)
                    setCopiado(`${a.obligacion.id}:${a.tipo}`)
                    setTimeout(() => setCopiado(null), 1600)
                  }}>
                    {copiado === `${a.obligacion.id}:${a.tipo}` ? <Check size={14} /> : <Copy size={14} />}
                    {copiado === `${a.obligacion.id}:${a.tipo}` ? 'Copiado' : 'Copiar'}
                  </button>
                  <button className="helm-btn sm" onClick={() => marcar(a, 'manual')}>
                    Ya le he avisado
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

// ── Dirección ──────────────────────────────────────────────────────────────
// Lo que el director no tiene hoy: cuánto lleva cada asesor y si el despacho
// está cumpliendo. La tasa de cumplimiento es además el número que se le enseña
// al cliente — "cero plazos perdidos" deja de ser una promesa y pasa a ser un
// dato medido.
function Direccion({ obligaciones, perfiles, equipo, nombreDe }) {
  const datos = useMemo(() => {
    const cerradas = obligaciones.filter(o => o.estado === 'presentado' || diasPara(o.fecha_limite) < 0)
    const aTiempo = obligaciones.filter(o => o.estado === 'presentado').length
    const fuera = obligaciones.filter(o => o.estado !== 'presentado' && diasPara(o.fecha_limite) < 0).length
    const cumplimiento = cerradas.length ? Math.round((aTiempo / cerradas.length) * 100) : null

    // Carga por asesor: cuántos clientes lleva y cuántos plazos abiertos tiene
    // encima. Es lo que hoy se sabe "por intuición".
    const porAsesor = new Map()
    for (const p of perfiles) {
      const k = p.asesor_id || 'sin'
      if (!porAsesor.has(k)) porAsesor.set(k, { clientes: 0, abiertos: 0, vencidos: 0 })
      const e = porAsesor.get(k)
      e.clientes++
      for (const o of obligaciones.filter(x => x.contact_id === p.contact_id)) {
        if (o.estado === 'presentado') continue
        e.abiertos++
        if (diasPara(o.fecha_limite) < 0) e.vencidos++
      }
    }

    // Clientes en riesgo: los que acumulan plazos vencidos sin presentar. Es la
    // señal temprana de que ese cliente se va — o de que nadie lo está mirando.
    const riesgo = perfiles.map(p => {
      const suyas = obligaciones.filter(x => x.contact_id === p.contact_id)
      const vencidos = suyas.filter(o => o.estado !== 'presentado' && diasPara(o.fecha_limite) < 0).length
      const sinDocs = suyas.filter(o => o.estado === 'pendiente_docs').length
      return { contact_id: p.contact_id, vencidos, sinDocs }
    }).filter(r => r.vencidos > 0).sort((a, b) => b.vencidos - a.vencidos)

    const porEstado = ESTADOS.map(e => ({
      key: e.key, label: e.label, tono: e.tono,
      valor: obligaciones.filter(o => o.estado === e.key).length,
    })).filter(e => e.valor > 0)

    return { cumplimiento, aTiempo, fuera, porAsesor, riesgo, porEstado, total: obligaciones.length }
  }, [obligaciones, perfiles])

  const nombreAsesor = (id) => (id === 'sin' ? 'Sin asignar' : equipo.find(e => e.id === id)?.name || 'Sin asignar')
  const colorTono = { '': 'var(--text-mut)', cyan: 'var(--cyan)', green: 'var(--green)', red: 'var(--red)' }

  return (
    <>
      <div className="helm-grid helm-kpis">
        <Kpi
          label="Cumplimiento" accent
          value={datos.cumplimiento == null ? '—' : `${datos.cumplimiento}%`}
          sub="presentados a tiempo"
        />
        <Kpi label="Plazos gestionados" value={datos.total} />
        <Kpi label="Presentados" value={datos.aTiempo} />
        <Kpi label="Fuera de plazo" value={datos.fuera} tono={datos.fuera ? 'danger' : undefined}
          sub={datos.fuera ? 'sanción al cliente' : undefined} />
      </div>

      {datos.porEstado.length > 0 && (
        <Panel title="Cómo está el despacho">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={datos.porEstado} dataKey="valor" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {datos.porEstado.map(e => <Cell key={e.key} fill={colorTono[e.tono]} />)}
              </Pie>
              <ChartTooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel title="Carga por asesor">
        {datos.porAsesor.size === 0 ? <Empty>Sin fichas fiscales todavía.</Empty> : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead>
                <tr><th>Asesor</th><th>Clientes</th><th>Plazos abiertos</th><th>Vencidos</th></tr>
              </thead>
              <tbody>
                {[...datos.porAsesor.entries()]
                  .sort((a, b) => b[1].abiertos - a[1].abiertos)
                  .map(([id, e]) => (
                    <tr key={id}>
                      <td>{nombreAsesor(id)}</td>
                      <td className="helm-num">{e.clientes}</td>
                      <td className="helm-num">{e.abiertos}</td>
                      <td className="helm-num">
                        {e.vencidos > 0 ? <span className="helm-chip red">{e.vencidos}</span> : 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Clientes en riesgo">
        <p className="helm-settings-lead">
          Los que acumulan plazos vencidos sin presentar. Es la señal temprana de que ese cliente
          se va — o de que nadie lo está mirando.
        </p>
        {datos.riesgo.length === 0 ? <Empty>Ninguno. Todo al día.</Empty> : (
          <div className="helm-tablewrap">
            <table className="helm-table">
              <thead><tr><th>Cliente</th><th>Vencidos</th><th>Sin documentación</th></tr></thead>
              <tbody>
                {datos.riesgo.map(r => (
                  <tr key={r.contact_id}>
                    <td>{nombreDe(r.contact_id)}</td>
                    <td className="helm-num"><span className="helm-chip red">{r.vencidos}</span></td>
                    <td className="helm-num">{r.sinDocs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

// ── Fichas fiscales ────────────────────────────────────────────────────────
function Clientes({ perfiles, contactos, equipo, clientId, onCambio, onError }) {
  const [edit, setEdit] = useState(null)

  const conFicha = new Set((perfiles || []).map(p => p.contact_id))
  const sinFicha = contactos.filter(c => !conFicha.has(c.id))

  async function guardar(f) {
    const fila = {
      client_id: clientId, contact_id: f.contact_id,
      nif: f.nif?.trim() || null, forma_juridica: f.forma_juridica || null,
      epigrafe: f.epigrafe?.trim() || null,
      iva: f.iva, irpf: f.irpf,
      retenciones: !!f.retenciones, alquileres: !!f.alquileres,
      sociedades: !!f.sociedades, intracomunitarias: !!f.intracomunitarias,
      asesor_id: f.asesor_id || null, notas: f.notas || '',
      updated_at: new Date().toISOString(),
    }
    try {
      if (f.existe) await updateRow('helm_fiscal_perfil', f.contact_id, fila)
      else await insertRow('helm_fiscal_perfil', fila)
      setEdit(null); onCambio()
    } catch (e) { onError('No se pudo guardar: ' + e.message) }
  }

  return (
    <>
      <Panel
        title="Fichas fiscales"
        action={
          sinFicha.length > 0 && (
            <select
              className="helm-select" value=""
              onChange={e => e.target.value && setEdit({
                contact_id: e.target.value, iva: 'trimestral', irpf: 'no', existe: false,
              })}
            >
              <option value="">+ Añadir cliente…</option>
              {sinFicha.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )
        }
      >
        <p className="helm-settings-lead">
          De aquí salen los plazos. Cada dato decide qué modelos le tocan: sin ficha, ese
          cliente no aparece en el calendario.
        </p>
        {perfiles === null ? <Empty>Cargando…</Empty>
          : perfiles.length === 0 ? <Empty>Ninguna ficha todavía. Añade el primer cliente arriba.</Empty>
            : (
              <div className="helm-tablewrap">
                <table className="helm-table">
                  <thead>
                    <tr><th>Cliente</th><th>NIF</th><th>Forma</th><th>Obligaciones</th><th></th></tr>
                  </thead>
                  <tbody>
                    {perfiles.map(p => {
                      const modelos = [...new Set(obligacionesDe(p, new Date().getFullYear()).map(o => o.modelo))]
                      return (
                        <tr key={p.contact_id}>
                          <td>{contactos.find(c => c.id === p.contact_id)?.name || '—'}</td>
                          <td>{p.nif || '—'}</td>
                          <td>{FORMAS.find(f => f.key === p.forma_juridica)?.label || '—'}</td>
                          <td>
                            {modelos.map(m => <span key={m} className="helm-chip" style={{ marginRight: 4 }}>{m}</span>)}
                          </td>
                          <td>
                            <button className="helm-btn sm" onClick={() => setEdit({ ...p, existe: true })}>Editar</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </Panel>

      {edit && (
        <FichaModal
          f={edit} equipo={equipo}
          nombre={contactos.find(c => c.id === edit.contact_id)?.name || ''}
          onClose={() => setEdit(null)} onSave={guardar}
        />
      )}
    </>
  )
}

function FichaModal({ f: inicial, equipo, nombre, onClose, onSave }) {
  const [f, setF] = useState(inicial)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const previsto = useMemo(
    () => [...new Set(obligacionesDe(f, new Date().getFullYear()).map(o => o.modelo))],
    [f],
  )

  async function submit(e) {
    e.preventDefault(); setBusy(true)
    try { await onSave(f) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Ficha fiscal · ${nombre}`} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="helm-form-2">
          <Field label="NIF / CIF"><Input value={f.nif || ''} onChange={e => set('nif', e.target.value)} placeholder="B12345678" /></Field>
          <Field label="Forma jurídica">
            <Select value={f.forma_juridica || ''} onChange={e => set('forma_juridica', e.target.value)}>
              <option value="">—</option>
              {FORMAS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="helm-drawer-section">Qué presenta</div>

        <Field label="IVA" hint={IVA_OPCIONES.find(x => x.key === f.iva)?.desc}>
          <Select value={f.iva} onChange={e => set('iva', e.target.value)}>
            {IVA_OPCIONES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>

        <Field label="IRPF del empresario" hint={IRPF_OPCIONES.find(x => x.key === f.irpf)?.desc}>
          <Select value={f.irpf} onChange={e => set('irpf', e.target.value)}>
            {IRPF_OPCIONES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>

        <label className="helm-checkline">
          <input type="checkbox" checked={!!f.retenciones} onChange={e => set('retenciones', e.target.checked)} />
          Practica retenciones de trabajo o profesionales (modelo 111)
        </label>
        <label className="helm-checkline">
          <input type="checkbox" checked={!!f.alquileres} onChange={e => set('alquileres', e.target.checked)} />
          Paga alquileres con retención (modelo 115)
        </label>
        <label className="helm-checkline">
          <input type="checkbox" checked={!!f.sociedades} onChange={e => set('sociedades', e.target.checked)} />
          Impuesto de Sociedades (modelos 200 y 202)
        </label>
        <label className="helm-checkline">
          <input type="checkbox" checked={!!f.intracomunitarias} onChange={e => set('intracomunitarias', e.target.checked)} />
          Operaciones intracomunitarias (modelo 349)
        </label>

        {/* Que se vea AL MOMENTO qué se le va a generar. Descubrir en enero que
            a un cliente le faltaba el 111 desde marzo es el fallo caro. */}
        <div className="helm-settings-note" style={{ marginTop: 12 }}>
          Con estos datos se le generarán: {previsto.length
            ? previsto.map(m => <span key={m} className="helm-chip" style={{ marginRight: 4 }}>{m}</span>)
            : 'ningún modelo'}
        </div>

        <div className="helm-drawer-section">Interno</div>
        <div className="helm-form-2">
          <Field label="Asesor responsable">
            <Select value={f.asesor_id || ''} onChange={e => set('asesor_id', e.target.value)}>
              <option value="">Sin asignar</option>
              {equipo.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Epígrafe IAE"><Input value={f.epigrafe || ''} onChange={e => set('epigrafe', e.target.value)} /></Field>
        </div>
        <Field label="Notas"><Textarea rows={3} value={f.notas || ''} onChange={e => set('notas', e.target.value)} /></Field>

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button className="helm-btn primary" disabled={busy}>
            {busy ? 'Guardando…' : <><Check size={15} /> Guardar ficha</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}
