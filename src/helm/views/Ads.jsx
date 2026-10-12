// HELM — Ads: los anuncios del perfil y su test de 5 días por conversiones UTM.
//
// Creas un anuncio (en borrador, con su UTM). Cuando lo lanzas de verdad, pulsas
// «Publicar» y empieza el test: durante 5 días HELM cuenta los leads y ventas que
// llegan con su UTM (atribución nativa del CRM, no Meta) y, al cerrarse, el equipo
// deja un veredicto: funciona · ajustar · no funciona. Backend en api/ads.js.
import { useCallback, useEffect, useState } from 'react'
import { Plus, Play, Pause, RotateCcw, Trash2, Check, AlertTriangle, X, Copy } from 'lucide-react'
import { adsApi } from '../lib'
import './ads.css'

const ESTADO = {
  borrador: { label: 'Borrador', c: '#8d8d95' },
  en_test: { label: 'En test', c: '#7aa5f8' },
  evaluado: { label: 'Evaluado', c: '#4ade80' },
  pausado: { label: 'Pausado', c: '#d9b66b' },
}
const VEREDICTO = {
  funciona: { label: 'Funciona', c: '#4ade80', Icon: Check },
  ajustar: { label: 'Ajustar', c: '#d9b66b', Icon: AlertTriangle },
  no_funciona: { label: 'No funciona', c: '#e4362b', Icon: X },
}
const PLATAFORMAS = ['Meta', 'Instagram', 'TikTok', 'YouTube', 'Google']
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES') + ' €'

export default function Ads({ clientId }) {
  const [ads, setAds] = useState(null)
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(() => {
    if (!clientId) return
    adsApi.list(clientId).then(r => { setAds(r.ads || []); setError('') }).catch(e => setError(e.message))
  }, [clientId])
  useEffect(() => { cargar() }, [cargar])
  // Mientras haya algún ad en test, se refresca en vivo: las conversiones entran solas.
  useEffect(() => {
    if (!ads?.some(a => a.estado === 'en_test')) return undefined
    const t = setInterval(cargar, 30000)
    return () => clearInterval(t)
  }, [ads, cargar])

  const accion = async (fn) => { try { await fn(); cargar() } catch (e) { setError(e.message) } }

  if (!clientId) return <p className="ads-vacio">Elige un perfil.</p>
  if (ads === null) return <p className="ads-vacio">Cargando…</p>

  return (
    <div className="ads">
      <header className="ads-cab">
        <p className="ads-sub">
          Tus anuncios y su <b>test de 5 días</b>. Cuando marcas uno «publicado», HELM cuenta sus conversiones
          por UTM —los leads y ventas que de verdad trae— y al 5.º día el equipo dictamina si funciona.
        </p>
        <button className="helm-btn" onClick={() => setCreando(true)}><Plus size={15} /> Nuevo anuncio</button>
      </header>
      {error && <p className="ads-error">{error}</p>}
      {creando && <FormAd clientId={clientId} onHecho={() => setCreando(false)} onCerrar={() => setCreando(false)} recarga={cargar} />}

      {!ads.length ? (
        <p className="ads-vacio">Todavía no hay anuncios. Crea el primero y, cuando lo publiques, mide si vende de verdad.</p>
      ) : (
        <div className="ads-grid">
          {ads.map(ad => <AdCard key={ad.id} ad={ad} onAccion={accion} />)}
        </div>
      )}
    </div>
  )
}

function AdCard({ ad, onAccion }) {
  const e = ESTADO[ad.estado] || ESTADO.borrador
  const v = ad.veredicto ? VEREDICTO[ad.veredicto] : null
  const p = ad.progreso
  const conclusion = ad.estudio?.conclusion || ad.estudio?.resumen || ad.estudio?.texto || null
  return (
    <article className="ad-card" style={{ '--c': e.c }}>
      <header className="ad-card-cab">
        <div>
          <h3>{ad.nombre}</h3>
          <p className="ad-meta">
            {ad.plataforma || 'Sin plataforma'}{ad.presupuesto ? ` · ${eur(ad.presupuesto)}` : ''}
          </p>
        </div>
        <span className="ad-estado" style={{ '--c': e.c }}>{e.label}</span>
      </header>

      {ad.objetivo && <p className="ad-objetivo">{ad.objetivo}</p>}
      <p className="ad-utm"><span>UTM</span> <code>{ad.utm}</code>
        <button type="button" title="Copiar" onClick={() => navigator.clipboard?.writeText(ad.utm)}><Copy size={12} /></button>
      </p>

      {ad.estado === 'en_test' && p && (
        <div className="ad-test">
          <div className="ad-test-cab"><b>Test</b> · día {p.dia} de {p.de}</div>
          <div className="ad-barra"><span style={{ width: `${(p.dia / p.de) * 100}%` }} /></div>
          <dl className="ad-cifras">
            <div><dt>Leads</dt><dd>{p.leads}</dd></div>
            <div><dt>Ventas</dt><dd>{p.ventas}</dd></div>
            <div><dt>Ingresos</dt><dd>{eur(p.ingresos)}</dd></div>
          </dl>
        </div>
      )}

      {ad.estado === 'evaluado' && v && (
        <div className="ad-veredicto" style={{ '--c': v.c }}>
          <span className="ad-veredicto-badge"><v.Icon size={14} /> {v.label}</span>
          {conclusion && <p>{conclusion}</p>}
        </div>
      )}

      <footer className="ad-acc">
        {ad.estado === 'borrador' && (
          <button className="helm-btn" onClick={() => onAccion(() => adsApi.publicar(ad.client_id, ad.id))}>
            <Play size={14} /> Publicar · empezar test
          </button>
        )}
        {ad.estado === 'en_test' && (
          <button className="helm-btn sec" onClick={() => onAccion(() => adsApi.estado(ad.client_id, ad.id, 'pausado'))}>
            <Pause size={14} /> Pausar
          </button>
        )}
        {(ad.estado === 'pausado' || ad.estado === 'evaluado') && (
          <button className="helm-btn sec" onClick={() => onAccion(() => adsApi.estado(ad.client_id, ad.id, 'borrador'))}>
            <RotateCcw size={14} /> Volver a borrador
          </button>
        )}
        <button className="ad-borrar" title="Borrar"
          onClick={() => { if (window.confirm(`¿Borrar el anuncio «${ad.nombre}»?`)) onAccion(() => adsApi.borrar(ad.client_id, ad.id)) }}>
          <Trash2 size={14} />
        </button>
      </footer>
    </article>
  )
}

function FormAd({ clientId, onHecho, onCerrar, recarga }) {
  const [f, setF] = useState({ nombre: '', plataforma: 'Meta', objetivo: '', presupuesto: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  async function crear(e) {
    e.preventDefault()
    if (!f.nombre.trim()) return setError('Ponle un nombre')
    setGuardando(true); setError('')
    try { await adsApi.create(clientId, f); recarga(); onHecho() }
    catch (err) { setError(err.message); setGuardando(false) }
  }

  return (
    <div className="ads-modal-fondo" onClick={onCerrar}>
      <form className="ads-modal" onClick={e => e.stopPropagation()} onSubmit={crear}>
        <header><h3>Nuevo anuncio</h3><button type="button" className="ads-x" onClick={onCerrar}>×</button></header>
        <label>Nombre<input className="helm-input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej.: Reel testimonio · octubre" autoFocus /></label>
        <label>Plataforma
          <select className="helm-input" value={f.plataforma} onChange={e => set('plataforma', e.target.value)}>
            {PLATAFORMAS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Objetivo<input className="helm-input" value={f.objetivo} onChange={e => set('objetivo', e.target.value)} placeholder="Qué quieres que haga quien lo ve" /></label>
        <label>Presupuesto (€)<input className="helm-input" type="number" min="0" value={f.presupuesto} onChange={e => set('presupuesto', e.target.value)} placeholder="Opcional" /></label>
        {error && <p className="ads-error">{error}</p>}
        <div className="ads-modal-pie">
          <button type="button" className="helm-btn sec" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="helm-btn" disabled={guardando}>{guardando ? 'Creando…' : 'Crear anuncio'}</button>
        </div>
        <p className="ads-nota">Se crea en borrador con su UTM. Cuando lo lances de verdad, pulsa «Publicar» para empezar el test.</p>
      </form>
    </div>
  )
}
