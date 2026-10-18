// HELM — Web Creator: las webs de los clientes que están «En fabricación».
//
// Mover un contacto a esa etapa del CRM lo trae aquí: HELM reúne lo que sabe
// de él, estudia las webs mejor posicionadas de su sector y deja el prompt
// listo para pegárselo a Claude Code, que construye la web, crea el
// repositorio en GitHub y la publica en Vercel (protocolo al final del prompt).
// Motor: api/_lib/webcreator.js · API: api/web-creator.js.
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Copy, Check, Loader2, RotateCcw, Globe, Github, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react'
import { webCreatorApi } from '../helm/lib'
import './webcreator.css'

const ESTADOS = { pendiente: 'En cola', estudiando: 'Estudiando…', listo: 'Prompt listo', error: 'Error' }
const FASES = { por_construir: 'Por construir', construyendo: 'Construyendo', publicada: 'Publicada', entregada: 'Entregada' }
const fecha = (t) => { try { return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) } catch { return '' } }
const SENALES = {
  reserva_online: 'Reserva online', whatsapp: 'WhatsApp', telefono_visible: 'Teléfono', precios: 'Precios', opiniones: 'Opiniones',
  mapa: 'Mapa', formulario: 'Formulario', instagram: 'Instagram', blog: 'Blog', galeria: 'Galería', faq: 'FAQ',
}

export default function WebCreator({ clientId, client, onVolver }) {
  const [webs, setWebs] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    webCreatorApi.lista(clientId).then(d => setWebs(d.webs)).catch(e => setError(e.message))
  }, [clientId])
  useEffect(() => { cargar() }, [cargar])
  // Mientras haya alguna estudiándose, se refresca sola.
  const enMarcha = (webs || []).some(w => w.estado === 'pendiente' || w.estado === 'estudiando')
  useEffect(() => {
    if (!enMarcha) return undefined
    const t = setInterval(cargar, 6000)
    return () => clearInterval(t)
  }, [enMarcha, cargar])

  if (abierta) return <Ficha clientId={clientId} id={abierta} onVolver={() => { setAbierta(null); cargar() }} />

  return (
    <div className="ag embebido wc-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Agentes</button>
          <h1>Web Creator</h1>
          <p>
            Las webs de los clientes de {client?.name || 'este perfil'} que están en fabricación. Al pasar un contacto a la etapa
            «En fabricación» del CRM, HELM reúne todo lo que sabe de él, estudia las webs mejor posicionadas de su sector y te deja
            el prompt listo para construirla y publicarla.
          </p>
        </div>
      </header>
      {error && <p className="ag-error">{error}</p>}
      {webs == null ? <p className="wc-ayuda"><Loader2 size={14} className="wc-gira" /> Cargando…</p>
        : !webs.length ? (
          <p className="wc-ayuda">Todavía no hay ninguna. Mueve un contacto a «En fabricación» en el CRM y aparece aquí en un momento con su estudio.</p>
        ) : (
          <ul className="wc-lista">
            {webs.map(w => (
              <li key={w.id}>
                <button type="button" onClick={() => setAbierta(w.id)}>
                  <span className="wc-icono"><Globe size={18} /></span>
                  <span className="wc-txt">
                    <b>{w.nombre}</b>
                    <small>{[w.sector, w.ciudad, w.persona && w.persona !== w.nombre ? w.persona : null].filter(Boolean).join(' · ') || 'Sin sector todavía'}</small>
                  </span>
                  <span className="wc-meta">
                    <em className={`wc-chip ${w.estado}`}>{(w.estado === 'pendiente' || w.estado === 'estudiando') && <Loader2 size={11} className="wc-gira" />} {ESTADOS[w.estado]}</em>
                    <em className="wc-chip suave">{FASES[w.fase]}</em>
                    {!w.en_etapa && <em className="wc-chip suave">Ya no está en la etapa</em>}
                    <small>{fecha(w.created_at)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

function Ficha({ clientId, id, onVolver }) {
  const [w, setW] = useState(null)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [pub, setPub] = useState(null)
  const [guardando, setGuardando] = useState('')

  const cargar = useCallback(() => {
    webCreatorApi.ficha(clientId, id).then(d => {
      setW(d.web)
      setPub(p => p || { fase: d.web.fase, repo_url: d.web.repo_url || '', web_url: d.web.web_url || '', notas: d.web.notas || '' })
    }).catch(e => setError(e.message))
  }, [clientId, id])
  useEffect(() => { cargar() }, [cargar])
  const enMarcha = w && (w.estado === 'pendiente' || w.estado === 'estudiando')
  useEffect(() => {
    if (!enMarcha) return undefined
    const t = setInterval(cargar, 5000)
    return () => clearInterval(t)
  }, [enMarcha, cargar])

  async function copiar() {
    try { await navigator.clipboard.writeText(w.prompt); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }
    catch { setError('No se ha podido copiar: selecciona el texto y cópialo a mano') }
  }
  async function reestudiar() {
    setGuardando('estudio'); setError('')
    try { await webCreatorApi.estudiar(clientId, id); cargar() } catch (e) { setError(e.message) }
    setGuardando('')
  }
  async function guardarPub() {
    setGuardando('pub'); setError('')
    try { await webCreatorApi.publicacion(clientId, id, pub); cargar(); setGuardando('ok'); setTimeout(() => setGuardando(''), 1500); return } catch (e) { setError(e.message) }
    setGuardando('')
  }

  if (!w) return <div className="ag embebido wc-root"><p className="wc-ayuda">{error || <><Loader2 size={14} className="wc-gira" /> Abriendo…</>}</p></div>
  const d = w.datos || {}
  const e = w.estudio || {}
  const competidores = e.competidores || []

  return (
    <div className="ag embebido wc-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Web Creator</button>
          <h1>{d.nombre || w.contacto?.company || w.contacto?.name || 'Web'}</h1>
          <p>{[w.sector, w.ciudad].filter(Boolean).join(' · ')}{w.estudiado_en ? ` · estudiada el ${fecha(w.estudiado_en)}` : ''}</p>
        </div>
      </header>
      {error && <p className="ag-error">{error}</p>}

      <div className="wc-fila">
        <em className={`wc-chip ${w.estado}`}>{enMarcha && <Loader2 size={11} className="wc-gira" />} {ESTADOS[w.estado]}</em>
        {w.prompt_con_ia && <em className="wc-chip suave"><Sparkles size={11} /> Con dirección creativa de IA</em>}
        <button type="button" className="ag-btn sm" onClick={reestudiar} disabled={enMarcha || guardando === 'estudio'}><RotateCcw size={13} /> Volver a estudiar</button>
      </div>
      {w.estado === 'error' && <p className="ag-error"><AlertTriangle size={13} /> {w.error}</p>}
      {enMarcha && <p className="wc-ayuda">Reuniendo los datos del cliente y leyendo las webs de su sector. Tarda uno o dos minutos.</p>}

      {w.prompt && (
        <section className="wc-caja">
          <div className="wc-cab">
            <h3>Prompt para Claude Code</h3>
            <button type="button" className="ag-btn primario sm" onClick={copiar}>{copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar prompt</>}</button>
          </div>
          <p className="wc-ayuda">Pégalo en Claude Code: construye la web, crea el repositorio en GitHub, la publica en Vercel y la apunta aquí.</p>
          <pre className="wc-prompt">{w.prompt}</pre>
        </section>
      )}

      <section className="wc-caja">
        <h3>Publicación</h3>
        <div className="wc-pub">
          <label>Fase
            <select value={pub?.fase || 'por_construir'} onChange={ev => setPub(p => ({ ...p, fase: ev.target.value }))}>
              {Object.entries(FASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Repositorio <input value={pub?.repo_url || ''} placeholder="https://github.com/…" onChange={ev => setPub(p => ({ ...p, repo_url: ev.target.value }))} /></label>
          <label>Web publicada <input value={pub?.web_url || ''} placeholder="https://….vercel.app" onChange={ev => setPub(p => ({ ...p, web_url: ev.target.value }))} /></label>
          <label className="ancha">Notas <textarea rows={3} value={pub?.notas || ''} onChange={ev => setPub(p => ({ ...p, notas: ev.target.value }))} /></label>
        </div>
        <div className="wc-fila">
          <button type="button" className="ag-btn primario sm" onClick={guardarPub} disabled={guardando === 'pub'}>{guardando === 'ok' ? <><Check size={13} /> Guardado</> : 'Guardar'}</button>
          {w.repo_url && <a className="ag-btn sm" href={w.repo_url} target="_blank" rel="noreferrer"><Github size={13} /> Repositorio</a>}
          {w.web_url && <a className="ag-btn sm" href={w.web_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver la web</a>}
        </div>
      </section>

      {competidores.length > 0 && (
        <section className="wc-caja">
          <h3>Webs de referencia ({competidores.length})</h3>
          {e.ia?.resumen && <p className="wc-ia"><Sparkles size={13} /> {e.ia.resumen}</p>}
          <ul className="wc-comp">
            {competidores.map(c => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noreferrer"><b>{c.nombre || c.analisis?.dominio}</b> <ExternalLink size={11} /></a>
                <small>
                  {[c.posicion_google ? `${c.posicion_google}º en Google («${c.consulta}»)` : null,
                    c.rating ? `${String(c.rating).replace('.', ',')}★ · ${c.resenas || 0} reseñas en Maps (${c.zona})` : null].filter(Boolean).join(' · ')}
                </small>
                <span className="wc-senales">
                  {Object.entries(c.analisis?.senales || {}).filter(([, v]) => v).map(([k]) => <em key={k} className="wc-chip suave">{SENALES[k] || k}</em>)}
                </span>
              </li>
            ))}
          </ul>
          {e.patrones?.comunes?.length > 0 && <p className="wc-ayuda"><b>Lo que tienen casi todas:</b> {e.patrones.comunes.map(x => `${x.nombre} (${x.n}/${e.patrones.leidas})`).join(', ')}</p>}
          {e.patrones?.raros?.length > 0 && <p className="wc-ayuda"><b>Lo que casi nadie hace:</b> {e.patrones.raros.map(x => x.nombre).join(', ')}</p>}
        </section>
      )}
      {(e.avisos?.length > 0 || e.ia_error) && (
        <section className="wc-caja wc-avisos">
          <h3>Avisos del estudio</h3>
          <ul>
            {(e.avisos || []).map((a, i) => <li key={i}>{a}</li>)}
            {e.ia_error && <li>Dirección creativa sin IA: {e.ia_error}</li>}
          </ul>
        </section>
      )}

      <section className="wc-caja">
        <h3>Lo que sabemos del cliente</h3>
        <dl className="wc-datos">
          {[['Contacto', d.persona], ['Teléfono', d.telefono], ['WhatsApp', d.whatsapp], ['Email', d.email], ['Dirección', d.direccion],
            ['Web actual', d.web], ['Instagram', d.instagram], ['Facebook', d.facebook], ['Horario', d.horario],
            ['Google', d.rating ? `${String(d.rating).replace('.', ',')}★ · ${d.resenas || 0} reseñas` : null], ['Titular', [d.titular, d.cif].filter(Boolean).join(' · ')]]
            .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {d.contexto && <pre className="wc-contexto">{d.contexto}</pre>}
        {e.faltan?.length > 0 && <p className="wc-ayuda"><b>Falta:</b> {e.faltan.join(', ')}. Se marcará como [PENDIENTE] en la web.</p>}
      </section>
    </div>
  )
}
