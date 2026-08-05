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
import { CalendarClock, Plus, RefreshCw, Check, Users } from 'lucide-react'
import { supabase, fetchRows, fetchRowsOrError, insertRow, updateRow, fmtDate, MISSING_TABLE } from '../lib'
import { Panel, Empty, Modal, Field, Input, Select, Textarea, Kpi, Tabs, FormNote } from '../ui'
import MigracionPendiente from '../MigracionPendiente'
import {
  MODELOS, FORMAS, IVA_OPCIONES, IRPF_OPCIONES, ESTADOS, ESTADO_MAP,
  obligacionesDe, urgencia, diasPara,
} from '../fiscal/modelos'

const TABS = [
  { key: 'plazos', label: 'Plazos', icon: <CalendarClock size={15} /> },
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

  return (
    <>
      <div className="helm-grid helm-kpis">
        <Kpi label="Vencen esta semana" value={kpis.semana} accent={kpis.semana > 0} />
        <Kpi label="Pendientes de docs" value={kpis.pendientes} />
        <Kpi label="Fuera de plazo" value={kpis.fuera} sub={kpis.fuera > 0 ? 'requiere atención' : undefined} />
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
