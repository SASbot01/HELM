// HELM — CRM · gestionar los pipelines de un perfil y las etapas de cada uno.
//
// Dos niveles en la misma ventana porque son la misma tarea mental ("cómo está
// organizado mi CRM"): a la izquierda la lista de pipelines, a la derecha las
// etapas y subetapas del que esté seleccionado.
//
// Renombrar una etapa NO mueve a nadie: los contactos guardan la clave, no la
// etiqueta. Lo único que afecta a los datos es borrar una etapa o un pipeline
// entero, y por eso ambas cosas avisan con el número de contactos implicados.
import { useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, Star, Pencil, Check, X } from 'lucide-react'
import { Modal, Input, FormNote } from '../ui'
import {
  savePipeline, createPipeline, renamePipeline, deletePipeline, setDefaultPipeline,
  loadPipelines, stageKeyFrom, TONES, normalizeStage, pipelineDe,
} from './pipeline'

const TONE_LABEL = {
  '': 'Gris', cyan: 'Acento', violet: 'Violeta', amber: 'Ámbar', green: 'Verde', red: 'Rojo',
}

export default function EditorEtapas({
  clientId, pipelines, activeId, contacts = [], onClose, onSaved, onContactsChanged,
}) {
  // Se trabaja sobre una copia: hasta que no se pulsa Guardar, la vista de
  // detrás no cambia. Las operaciones sobre la LISTA (crear, renombrar, borrar,
  // marcar por defecto) sí son inmediatas: son acciones sueltas, no un
  // formulario, y encadenarlas a un "guardar" global confundiría más.
  const [sel, setSel] = useState(activeId)
  const inicial = pipelines.find(p => p.id === sel) || pipelines[0]
  const [stages, setStages] = useState(inicial.stages)
  const [substages, setSubstages] = useState(inicial.substages)
  const [nombre, setNombre] = useState(inicial.name)
  const [sucio, setSucio] = useState(false)

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)
  // `undefined` y no `null`: el pipeline virtual tiene id null, y con null
  // como "nada seleccionado" la comparación `renombrando === p.id` era cierta
  // desde el primer render y lo abría en modo renombrar solo.
  const [renombrando, setRenombrando] = useState(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [aBorrar, setABorrar] = useState(null) // { p, destino } mientras se decide

  const actual = pipelines.find(p => p.id === sel) || pipelines[0]

  // Cuántos contactos hay en cada pipeline y en cada etapa: nadie debería
  // borrar una columna llena sin saber a cuánta gente afecta.
  const delPipeline = (p) => contacts.filter(c => pipelineDe(c, pipelines).id === p.id)
  const enEtapa = (key) => delPipeline(actual).filter(c => normalizeStage(c.status, stages) === key).length

  function cambiarSeleccion(p) {
    if (sucio && !window.confirm('Tienes cambios sin guardar en las etapas. ¿Descartarlos?')) return
    setSel(p.id)
    setStages(p.stages)
    setSubstages(p.substages)
    setNombre(p.name)
    setSucio(false)
    setError(null)
  }

  const setStage = (i, patch) => {
    setStages(ss => ss.map((s, j) => j === i ? { ...s, ...patch } : s))
    setSucio(true)
  }

  function mover(i, delta) {
    const j = i + delta
    if (j < 0 || j >= stages.length) return
    setStages(ss => {
      const next = [...ss]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setSucio(true)
  }

  function addStage() {
    const key = stageKeyFrom('Nueva etapa', stages.map(s => s.key))
    setStages(ss => [...ss, { key, label: 'Nueva etapa', tone: '' }])
    setSucio(true)
  }

  function removeStage(i) {
    const s = stages[i]
    if (stages.length <= 2) return setError('El pipeline necesita al menos dos etapas')
    const n = enEtapa(s.key)
    if (n > 0 && !window.confirm(
      `"${s.label}" tiene ${n} contacto${n === 1 ? '' : 's'}. Al borrarla pasarán a "${stages[0].label}". ¿Seguir?`,
    )) return
    setStages(ss => ss.filter((_, j) => j !== i))
    setSubstages(m => { const next = { ...m }; delete next[s.key]; return next })
    setSucio(true)
  }

  const subsDe = (key) => substages[key] || []
  const setSubs = (key, list) => { setSubstages(m => ({ ...m, [key]: list })); setSucio(true) }

  function addSub(stageKey) {
    const taken = subsDe(stageKey).map(s => s.key)
    setSubs(stageKey, [...subsDe(stageKey), { key: stageKeyFrom('sub', taken), label: '' }])
  }

  // ── Acciones sobre la lista de pipelines ─────────────────────────────────

  async function crear(e) {
    e.preventDefault()
    setError(null)
    try {
      const p = await createPipeline(clientId, nuevoNombre)
      setNuevoNombre('')
      setCreando(false)
      // Se recarga en vez de añadir a mano: crear el primero puede haber
      // materializado también el pipeline virtual, y esa fila nueva hay que
      // traerla de la base con su id de verdad.
      const lista = await loadPipelines(clientId)
      onSaved(lista, p.id)
      cambiarSeleccion(lista.find(x => x.id === p.id) || p)
    } catch (err) { setError(err.message) }
  }

  async function renombrar(p, valor) {
    setError(null)
    try {
      await renamePipeline(p.id, valor)
      onSaved(pipelines.map(x => x.id === p.id ? { ...x, name: valor.trim() } : x), sel)
      if (p.id === sel) setNombre(valor.trim())
    } catch (err) { setError(err.message) }
    setRenombrando(undefined)
  }

  // Con contactos dentro, borrar abre una caja que pregunta qué hacer con
  // ellos (moverlos o borrarlos). Sin contactos, basta confirmar.
  function borrar(p) {
    const otros = pipelines.filter(x => x.id && x.id !== p.id)
    if (!otros.length) return setError('Tiene que quedar al menos un pipeline')
    if (delPipeline(p).length) return setABorrar({ p, destino: (otros.find(x => x.isDefault) || otros[0]).id })
    if (window.confirm(`¿Eliminar el pipeline "${p.name}"?`)) ejecutaBorrado(p, null)
  }

  async function ejecutaBorrado(p, destino) {
    setError(null)
    try {
      await deletePipeline(p.id, { contactos: delPipeline(p).map(c => c.id), destino })
      setABorrar(null)
      onContactsChanged?.()
      const quedan = pipelines.filter(x => x.id !== p.id)
      onSaved(quedan, quedan[0]?.id ?? null)
      cambiarSeleccion(quedan[0])
    } catch (err) { setError(err.message) }
  }

  async function marcarDefecto(p) {
    setError(null)
    try {
      await setDefaultPipeline(clientId, p.id)
      onSaved(pipelines.map(x => ({ ...x, isDefault: x.id === p.id })), sel)
    } catch (err) { setError(err.message) }
  }

  // ── Guardar las etapas del pipeline seleccionado ─────────────────────────

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (stages.some(s => !s.label.trim())) return setError('Todas las etapas necesitan un nombre')
    setSaving(true)
    try {
      // Las subetapas sin nombre se descartan en silencio: son filas que el
      // usuario añadió y no llegó a rellenar.
      const limpias = Object.fromEntries(
        Object.entries(substages).map(([k, list]) => [k, (list || []).filter(s => s.label.trim())]),
      )
      const id = await savePipeline(clientId, { id: sel, name: nombre, stages, substages: limpias })
      const guardado = { id, name: nombre, isDefault: actual.isDefault, stages, substages: limpias }
      const lista = pipelines.some(p => p.id === id)
        ? pipelines.map(p => p.id === id ? guardado : p)
        : [guardado, ...pipelines.filter(p => p.id)]
      onSaved(lista, id, { cerrar: true })
    } catch (err) {
      setError(err.message || 'No se pudo guardar el pipeline')
      setSaving(false)
    }
  }

  return (
    <Modal title="Pipelines y etapas" onClose={onClose} wide>
      <div className="helm-pipe-layout">
        {/* ── Lista de pipelines ───────────────────────────────────────── */}
        <aside className="helm-pipe-list">
          <div className="helm-drawer-section" style={{ margin: '0 0 10px' }}>Pipelines</div>

          {pipelines.map(p => (
            <div key={p.id ?? 'virtual'} className={'helm-pipe-item' + (p.id === sel ? ' on' : '')}>
              {p.id && renombrando === p.id ? (
                <RenameInline
                  valor={p.name}
                  onCancel={() => setRenombrando(undefined)}
                  onOk={(v) => renombrar(p, v)}
                />
              ) : (
                <>
                  <button type="button" className="helm-pipe-name" onClick={() => cambiarSeleccion(p)}>
                    {p.isDefault && <Star size={12} className="helm-pipe-star" />}
                    <span>{p.name}</span>
                    <small>{delPipeline(p).length}</small>
                  </button>
                  {/* Un pipeline aún sin guardar (virtual) no se puede
                      renombrar ni borrar: todavía no existe en la base. */}
                  {p.id && (
                    <div className="helm-pipe-acts">
                      {!p.isDefault && (
                        <Star size={13} className="helm-x" title="Marcar como principal" onClick={() => marcarDefecto(p)} />
                      )}
                      <Pencil size={13} className="helm-x" title="Renombrar" onClick={() => setRenombrando(p.id)} />
                      <Trash2 size={13} className="helm-x" title="Eliminar" onClick={() => borrar(p)} />
                    </div>
                  )}
                  {aBorrar?.p.id === p.id && (() => {
                    const n = delPipeline(p).length
                    const otros = pipelines.filter(x => x.id && x.id !== p.id)
                    return (
                      <div className="helm-pipe-borrar">
                        <b>¿Qué hago con sus {n} contacto{n === 1 ? '' : 's'}?</b>
                        <label>
                          Moverlos a
                          <select value={aBorrar.destino} onChange={e => setABorrar(a => ({ ...a, destino: e.target.value }))}>
                            {otros.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </label>
                        <button type="button" className="helm-btn" onClick={() => ejecutaBorrado(p, aBorrar.destino)}>
                          Mover y borrar el pipeline
                        </button>
                        <button type="button" className="helm-btn danger" onClick={() => {
                          if (window.confirm(`Se borrarán ${n} contacto${n === 1 ? '' : 's'} con su historial. No se puede deshacer. ¿Seguro?`)) ejecutaBorrado(p, null)
                        }}>
                          Borrar también los {n} contactos
                        </button>
                        <button type="button" className="helm-btn ghost" onClick={() => setABorrar(null)}>Cancelar</button>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          ))}

          {creando ? (
            <form onSubmit={crear} className="helm-pipe-new">
              <Input
                value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                placeholder="Partnerships, Soporte…" autoFocus
              />
              <button type="submit" className="helm-btn sm" disabled={!nuevoNombre.trim()}><Check size={13} /></button>
              <button type="button" className="helm-btn sm" onClick={() => { setCreando(false); setNuevoNombre('') }}><X size={13} /></button>
            </form>
          ) : (
            <button type="button" className="helm-btn sm" style={{ marginTop: 8 }} onClick={() => setCreando(true)}>
              <Plus size={13} />Nuevo pipeline
            </button>
          )}

          <p className="helm-field-hint" style={{ marginTop: 12 }}>
            El pipeline con estrella es el principal: ahí van los contactos que no
            tienen otro asignado.
          </p>
        </aside>

        {/* ── Etapas del pipeline seleccionado ─────────────────────────── */}
        <form onSubmit={submit} noValidate className="helm-pipe-detail">
          <div className="helm-form-2" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
            <div className="helm-field" style={{ marginBottom: 0 }}>
              <label>Nombre del pipeline</label>
              <Input value={nombre} onChange={e => { setNombre(e.target.value); setSucio(true) }} />
            </div>
            <button type="button" className="helm-btn" onClick={addStage}><Plus size={14} />Etapa</button>
          </div>

          <div className="helm-drawer-section">Etapas</div>

          {stages.map((s, i) => (
            <div key={s.key} className="helm-stage-edit">
              <div className="helm-stage-edit-row">
                <span className={'helm-dot ' + s.tone} />
                <Input
                  value={s.label}
                  onChange={e => setStage(i, { label: e.target.value })}
                  placeholder="Nombre de la etapa"
                />
                <select className="helm-input" style={{ maxWidth: 110 }} value={s.tone}
                  onChange={e => setStage(i, { tone: e.target.value })}>
                  {TONES.map(t => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}
                </select>
                <button type="button" className="helm-btn" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir"><ArrowUp size={14} /></button>
                <button type="button" className="helm-btn" onClick={() => mover(i, 1)} disabled={i === stages.length - 1} title="Bajar"><ArrowDown size={14} /></button>
                <button type="button" className="helm-btn" onClick={() => removeStage(i)} title="Eliminar etapa"><Trash2 size={14} /></button>
              </div>

              <div className="helm-stage-subs">
                {subsDe(s.key).map((sub, j) => (
                  <div key={sub.key} className="helm-stage-sub">
                    <Input
                      value={sub.label}
                      onChange={e => setSubs(s.key, subsDe(s.key).map((x, k) => k === j ? { ...x, label: e.target.value } : x))}
                      placeholder="Subetapa (ej. 3 meses)"
                    />
                    <button type="button" className="helm-btn" onClick={() => setSubs(s.key, subsDe(s.key).filter((_, k) => k !== j))}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" className="helm-btn sm" onClick={() => addSub(s.key)}>
                  <Plus size={13} />Subetapa
                </button>
                {enEtapa(s.key) > 0 && (
                  <small className="helm-field-hint">{enEtapa(s.key)} contactos aquí</small>
                )}
              </div>
            </div>
          ))}

          <FormNote>{error}</FormNote>

          <div className="helm-modal-actions">
            <button type="button" className="helm-btn" onClick={onClose}>Cerrar</button>
            <button type="submit" className="helm-btn primary" disabled={saving || !sucio}>
              {saving ? 'Guardando…' : sucio ? 'Guardar etapas' : 'Sin cambios'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

// Renombrado en línea. Enter confirma, Escape cancela — sin sacar otro modal
// encima del que ya está abierto.
function RenameInline({ valor, onOk, onCancel }) {
  const [v, setV] = useState(valor)
  return (
    <div className="helm-pipe-new">
      <Input
        value={v} onChange={e => setV(e.target.value)} autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (v.trim()) onOk(v) }
          // El Escape se para aquí: si no, el Modal lo recoge y cierra toda la
          // ventana en vez de solo cancelar el renombrado.
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
        }}
      />
      <button type="button" className="helm-btn sm" onClick={() => v.trim() && onOk(v)}><Check size={13} /></button>
      <button type="button" className="helm-btn sm" onClick={onCancel}><X size={13} /></button>
    </div>
  )
}
