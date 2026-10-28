// HELM — Equipo de Contenido: los agentes que convierten el onboarding y la
// estrategia de historias/reels en el plan de grabación de cada día.
import { useEffect, useState } from 'react'
import {
  Fingerprint, Compass, ImagePlus, RefreshCw, Sparkles, Pencil, Eye, History, Instagram, Film,
} from 'lucide-react'
import { agentesApi } from '../../lib'
import { Markdown } from '../../md'
import { Drawer, Modal, Empty, FormNote, Textarea } from '../../ui'

const CARRIL_LABEL = { dar: 'Dar', conectar: 'Conectar', vender: 'Vender' }
const CARRIL_DOT = { dar: 'green', conectar: 'amber', vender: 'violet' }
const hoyISO = () => new Date().toISOString().slice(0, 10)
function fmtFecha(iso) {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function ContenidoTeam({ clientId }) {
  const [base, setBase] = useState(undefined)      // undefined = cargando, null = no existe
  const [ideas, setIdeas] = useState(undefined)
  const [fecha, setFecha] = useState(hoyISO())
  const [historial, setHistorial] = useState([])
  const [verBase, setVerBase] = useState(false)
  const [generandoBase, setGenerandoBase] = useState(false)
  const [generandoIdeas, setGenerandoIdeas] = useState(false)
  const [error, setError] = useState(null)
  const [detalle, setDetalle] = useState(null)

  const cargarBase = () => agentesApi.base(clientId).then(r => setBase(r.base)).catch(() => setBase(null))
  const cargarIdeas = (f) => agentesApi.ideas(clientId, f).then(r => setIdeas(r.ideas)).catch(() => setIdeas(null))
  const cargarHistorial = () => agentesApi.historial(clientId).then(r => setHistorial(r.historial || [])).catch(() => {})

  useEffect(() => { cargarBase(); cargarIdeas(fecha); cargarHistorial() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generarBase() {
    setGenerandoBase(true); setError(null)
    try { const r = await agentesApi.generarBase(clientId); setBase(r.base) }
    catch (e) { setError(e.message) } finally { setGenerandoBase(false) }
  }

  async function investigar(f) {
    setGenerandoIdeas(true); setError(null)
    try {
      const r = await agentesApi.investigar(clientId, f)
      setIdeas(r.ideas); setFecha(f); cargarHistorial()
    } catch (e) { setError(e.message) } finally { setGenerandoIdeas(false) }
  }

  function verDia(f) {
    setFecha(f)
    cargarIdeas(f)
  }

  const abrirIdea = (bloque, it) => setDetalle({ bloque, it })

  return (
    <div className="helm-eq-team">
      <div className="helm-eq-team-head">
        <h2>Equipo de Contenido</h2>
        <p>Tres agentes encadenados: el primero funde tu onboarding con la estrategia de historias y reels; el
          segundo te dice cada día qué grabar; el tercero (próximamente) lo produce.</p>
      </div>

      {error && <FormNote>{error}</FormNote>}

      {/* Agente Persona ----------------------------------------------------- */}
      <div className="helm-agente">
        <div className="helm-agente-head">
          <div className="helm-agente-ico persona"><Fingerprint size={18} /></div>
          <div className="helm-agente-title">
            <b>Agente Persona</b>
            <small>Recopila las Biblias de este perfil y las funde con la Ronda de Stories / Ronda de Reels en una base única.</small>
          </div>
          <span className={'helm-chip' + (base ? ' active' : '')}>
            {base === undefined ? 'Cargando…' : base ? (base.status === 'edited' ? 'Editada a mano' : 'Generada') : 'Sin generar'}
          </span>
        </div>
        <div className="helm-agente-actions">
          {base ? <button className="helm-btn" onClick={() => setVerBase(true)}><Eye size={14} /> Ver base</button> : null}
          <button className="helm-btn primary" onClick={generarBase} disabled={generandoBase}>
            <RefreshCw size={14} className={generandoBase ? 'helm-spin' : ''} />
            {generandoBase ? 'Generando…' : base ? 'Regenerar base' : 'Generar base'}
          </button>
        </div>
      </div>

      {/* Agente 1 · Investigación -------------------------------------------- */}
      <div className="helm-agente">
        <div className="helm-agente-head">
          <div className="helm-agente-ico investigacion"><Compass size={18} /></div>
          <div className="helm-agente-title">
            <b>Agente 1 · Investigación</b>
            <small>Cada día, tres ideas de ronda de historias y tres de reel listas para grabar, basadas en la base de arriba.</small>
          </div>
        </div>
        <div className="helm-agente-actions">
          <button className="helm-btn primary" onClick={() => investigar(hoyISO())} disabled={generandoIdeas}>
            <Sparkles size={14} className={generandoIdeas ? 'helm-spin' : ''} />
            {generandoIdeas ? 'Investigando…' : ideas && fecha === hoyISO() ? 'Regenerar plan de hoy' : 'Generar plan de hoy'}
          </button>
          {!base && <small className="helm-eq-hint">Sin base generada todavía: usará las Biblias directamente. Mejor genera la base primero.</small>}
        </div>

        <div className="helm-eq-plan">
          <div className="helm-eq-plan-head">
            <b>{fmtFecha(fecha)}</b>
            {historial.length > 0 && (
              <div className="helm-eq-historial">
                <History size={12} />
                {historial.map(h => (
                  <button key={h.fecha} className={'helm-chip' + (h.fecha === fecha ? ' active' : '')} onClick={() => verDia(h.fecha)}>
                    {new Date(h.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </button>
                ))}
              </div>
            )}
          </div>

          {ideas === undefined ? null : ideas === null ? (
            <Empty>Todavía no hay plan para este día. Pulsa «Generar plan de hoy».</Empty>
          ) : (
            <>
              <div className="helm-eq-bloque">
                <div className="helm-eq-bloque-t"><Instagram size={13} /> Historias de hoy</div>
                <div className="helm-eq-ideas">
                  {ideas.historias.map((it, i) => <IdeaCard key={i} it={it} onClick={() => abrirIdea('Historia', it)} />)}
                </div>
              </div>
              <div className="helm-eq-bloque">
                <div className="helm-eq-bloque-t"><Film size={13} /> Reels de hoy</div>
                <div className="helm-eq-ideas">
                  {ideas.reels.map((it, i) => <IdeaCard key={i} it={it} onClick={() => abrirIdea('Reel', it)} />)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agente 2 · Creador de historias --------------------------------------- */}
      <div className="helm-agente soon">
        <div className="helm-agente-head">
          <div className="helm-agente-ico creador"><ImagePlus size={18} /></div>
          <div className="helm-agente-title">
            <b>Agente 2 · Creador de historias</b>
            <small>Le subes una foto, se conecta a una herramienta de diseño y monta las historias una por una a partir de las ideas de arriba.</small>
          </div>
          <span className="helm-chip">Próximamente</span>
        </div>
      </div>

      {verBase && base && (
        <BaseDrawer clientId={clientId} base={base} onClose={() => setVerBase(false)} onSaved={(b) => { setBase(b); setVerBase(false) }} />
      )}

      {detalle && (
        <Modal title={detalle.it.titulo || detalle.bloque} onClose={() => setDetalle(null)} wide>
          <div className="helm-est-modal-sub">
            {detalle.bloque} · Plantilla {detalle.it.plantilla} · {CARRIL_LABEL[detalle.it.carril] || detalle.it.carril}
          </div>
          <div className="helm-est-modal-body">
            {detalle.it.gancho && <p className="helm-est-ejemplo">«{detalle.it.gancho}»</p>}
            {detalle.it.resumen && <p>{detalle.it.resumen}</p>}
            {detalle.it.cta && <p><b>CTA</b> — {detalle.it.cta}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

function IdeaCard({ it, onClick }) {
  return (
    <button type="button" className={'helm-eq-idea ' + (CARRIL_DOT[it.carril] || '')} onClick={onClick}>
      <div className="helm-eq-idea-tag">
        <span className={'helm-est-dot ' + (CARRIL_DOT[it.carril] || '')} /> {it.plantilla} · {CARRIL_LABEL[it.carril] || it.carril}
      </div>
      <b>{it.titulo}</b>
      {it.gancho && <p>«{it.gancho}»</p>}
    </button>
  )
}

function BaseDrawer({ clientId, base, onClose, onSaved }) {
  const [editar, setEditar] = useState(false)
  const [texto, setTexto] = useState(base.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function guardar() {
    setBusy(true); setError(null)
    try { const r = await agentesApi.saveBase(clientId, texto); onSaved(r.base) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Drawer
      title="Base de contenido"
      sub={base.status === 'edited' ? 'Editada a mano' : 'Generada por el Agente Persona'}
      onClose={onClose}
      footer={
        <div className="helm-drawer-foot-row">
          <button className="helm-btn" onClick={() => setEditar(e => !e)}>
            {editar ? <><Eye size={14} /> Ver</> : <><Pencil size={14} /> Editar</>}
          </button>
          {editar && <button className="helm-btn primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>}
        </div>
      }
    >
      {editar ? (
        <Textarea rows={20} value={texto} onChange={e => setTexto(e.target.value)} />
      ) : (
        <div className="helm-biblia-doc"><Markdown text={base.content} /></div>
      )}
      <FormNote>{error}</FormNote>
    </Drawer>
  )
}
