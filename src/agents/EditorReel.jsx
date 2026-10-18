// HELM — Editor de reels. La ventana del agente editor dentro de Agentes.
//
// Subes el vídeo en bruto tal cual sale del móvil (vertical, hablando a
// cámara) y HELM te devuelve el MP4 editado: sin las tomas repetidas (se queda
// con la última), sin muletillas sueltas ni silencios largos, a 1080×1920 con
// un zoom que salta cada pocos segundos, subtítulos palabra a palabra y la voz
// a un volumen parejo. La subida va en crudo (editorApi.subir, con su barra de
// progreso); el montaje lo hace el worker del servidor (api/editor.js →
// trabajo `editor-render`) y aquí se ve cómo va, en vivo, y se descarga.
//
// El panel «Estilo» cambia el estilo de ESTE perfil: lo que ya está subido se
// queda con el estilo con el que se subió. HELM no publica nada.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Upload, Download, Trash2, Loader2, Check, AlertTriangle, Clock, Info, Palette, ChevronRight, X, RotateCcw, Scissors,
} from 'lucide-react'
import { editorApi } from '../helm/lib'
import {
  ESTILO_POR_DEFECTO, RANGOS_ESTILO, normalizaEstilo, ESTADOS_EDICION, EN_MARCHA, MAX_MB_SUBIDA, DIAS_GUARDADO,
} from './editor/estilo'
import './editorReel.css'

const fecha = (t) => { try { return new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const mmss = (s) => {
  if (s == null) return '—'
  const t = Math.round(Number(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
const mb = (b) => `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: b > 100 * 1048576 ? 0 : 1 })} MB`
const caducado = (e) => e.estado === 'listo' && Date.now() - new Date(e.created_at).getTime() > DIAS_GUARDADO * 86_400_000
const ICONO = { subiendo: Upload, en_cola: Clock, transcribiendo: Loader2, montando: Loader2, listo: Check, error: AlertTriangle }
const EXT_VIDEO = /\.(mp4|mov|m4v|webm|mkv|3gp|avi|mpg)$/i
const MAX_A_LA_VEZ = 3

/** Las ediciones del perfil y, mientras alguna esté en marcha, cada 3 s. */
function useEdiciones(clientId) {
  const [ediciones, setEdiciones] = useState(null)
  const [error, setError] = useState('')
  const recargar = useCallback(
    () => editorApi.lista(clientId).then(d => { setEdiciones(d.ediciones || []); setError('') }).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { recargar() }, [recargar])
  const enMarcha = (ediciones || []).some(e => EN_MARCHA.includes(e.estado))
  useEffect(() => {
    if (!enMarcha) return undefined
    const reloj = setInterval(recargar, 3000)
    return () => clearInterval(reloj)
  }, [enMarcha, recargar])
  return { ediciones, error, recargar }
}

export default function EditorReel({ clientId, client, onVolver }) {
  const { ediciones, error, recargar } = useEdiciones(clientId)
  const enMarcha = (ediciones || []).filter(e => EN_MARCHA.includes(e.estado)).length

  return (
    <div className="ag embebido ed-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Agentes</button>
          <h1>Editor de reels</h1>
          <p>
            Sube el vídeo de {client?.name || 'este perfil'} tal cual lo grabaste con el móvil. HELM quita las tomas repetidas, las
            muletillas y los silencios, lo deja a 1080×1920 con subtítulos palabra a palabra y te devuelve el MP4 listo para subir.
          </p>
        </div>
      </header>

      <ComoFunciona />
      <Subida clientId={clientId} enMarcha={enMarcha} alSubir={recargar} />
      <PanelEstilo clientId={clientId} />

      {error && <p className="ag-error">{error}</p>}
      <h3 className="ed-titulo">Tus vídeos</h3>
      {ediciones == null ? <p className="ed-ayuda"><Loader2 size={14} className="ed-gira" /> Cargando…</p>
        : !ediciones.length ? <p className="ed-ayuda">Todavía no has subido ninguno. Cuando subas uno, aquí verás cómo va y lo podrás descargar.</p>
          : <ListaEdiciones clientId={clientId} ediciones={ediciones} recargar={recargar} />}
    </div>
  )
}

function ComoFunciona() {
  const [abierto, setAbierto] = useState(false)
  return (
    <section className="ed-caja">
      <button type="button" className="ed-caja-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
        <Info size={16} /> <b>Qué hace con tu vídeo</b> <span>{abierto ? 'Cerrar' : 'Leer'}</span>
      </button>
      {abierto && (
        <div className="ed-explica-txt">
          <p>
            <b>Escucha el vídeo palabra a palabra</b> y decide qué se queda: si dijiste una frase, te equivocaste y la volviste a
            empezar, se queda con <b>la última toma</b> y quita las de antes. Quita también las <b>muletillas sueltas</b> («eh», «mmm»,
            «a ver», «vale vale») y deja los <b>silencios largos</b> en un respiro corto.
          </p>
          <p>
            Después lo <b>encuadra a 1080×1920</b> (lo que pide Instagram), con un <b>zoom suave</b> que salta cada pocos segundos para
            que no se haga largo, quema los <b>subtítulos</b> en la parte de abajo (por encima del texto de Instagram, con la palabra
            que suena resaltada) y pone la voz a un <b>volumen parejo</b>.
          </p>
          <p>
            Tarda unos minutos: primero transcribe y luego monta. Puedes cerrar esta pantalla; el vídeo se queda aquí {DIAS_GUARDADO} días.
            {' '}<b>HELM no publica nada</b>: lo descargas y lo subes tú desde la app.
          </p>
        </div>
      )}
    </section>
  )
}

// ── La subida ───────────────────────────────────────────────────────────────

function Subida({ clientId, enMarcha, alSubir }) {
  const [arrastrando, setArrastrando] = useState(false)
  const [subida, setSubida] = useState(null) // { nombre, fraccion, cargado, total }
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const input = useRef(null)
  const corte = useRef(null)
  const lleno = enMarcha >= MAX_A_LA_VEZ

  async function sube(archivo) {
    setError(''); setHecho('')
    if (!archivo) return
    const pareceVideo = String(archivo.type || '').startsWith('video/') || (!archivo.type && EXT_VIDEO.test(archivo.name || ''))
    if (!pareceVideo) { setError('Eso no es un vídeo. Sube el archivo tal cual sale del móvil (MP4 o MOV).'); return }
    if (!archivo.size) { setError('Ese archivo está vacío.'); return }
    if (archivo.size > MAX_MB_SUBIDA * 1048576) { setError(`El vídeo pesa ${mb(archivo.size)}: el máximo son ${MAX_MB_SUBIDA} MB.`); return }
    if (lleno) { setError(`Ya hay ${MAX_A_LA_VEZ} vídeos editándose. Espera a que acabe alguno.`); return }
    corte.current = new AbortController()
    setSubida({ nombre: archivo.name, fraccion: 0, cargado: 0, total: archivo.size })
    try {
      await editorApi.subir(clientId, archivo, {
        senal: corte.current.signal,
        alProgreso: (fraccion, { cargado, total }) => setSubida(s => (s ? { ...s, fraccion, cargado, total } : s)),
      })
      setHecho(`«${archivo.name}» subido. Ya está en cola: aquí abajo ves cómo va.`)
      alSubir()
    } catch (e) {
      if (!e.cancelada) setError(e.message)
    }
    setSubida(null)
    corte.current = null
  }

  function alSoltar(ev) {
    ev.preventDefault()
    setArrastrando(false)
    if (subida) return
    sube(ev.dataTransfer?.files?.[0])
  }

  return (
    <section
      className={`ed-subida${arrastrando ? ' arrastrando' : ''}${subida ? ' subiendo' : ''}`}
      onDragOver={(ev) => { ev.preventDefault(); if (!subida) setArrastrando(true) }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={alSoltar}
    >
      <input
        ref={input} type="file" accept="video/*" hidden
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; sube(f) }}
      />
      {subida ? (
        <div className="ed-subida-progreso">
          <div className="ed-subida-fila">
            <b title={subida.nombre}>{subida.nombre}</b>
            <button type="button" className="ag-btn sm" onClick={() => corte.current?.abort()}><X size={13} /> Cancelar</button>
          </div>
          <div className="ed-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(subida.fraccion * 100)}>
            <span style={{ width: `${Math.round(subida.fraccion * 100)}%` }} />
          </div>
          <small>
            {subida.fraccion >= 1 ? 'Subido. Comprobando el vídeo…'
              : `Subiendo ${Math.round(subida.fraccion * 100)} % · ${mb(subida.cargado)} de ${mb(subida.total)}. No cierres esta pestaña.`}
          </small>
        </div>
      ) : (
        <div className="ed-subida-vacia">
          <Upload size={26} />
          <b>Arrastra aquí tu vídeo</b>
          <small>Vertical, tal cual sale del móvil (MP4 o MOV). Hasta {MAX_MB_SUBIDA} MB y 10 minutos.</small>
          <button type="button" className="ag-btn primario" onClick={() => input.current?.click()} disabled={lleno}>
            <Upload size={15} /> Elegir vídeo
          </button>
          {lleno && <small className="ed-mal">Ya hay {MAX_A_LA_VEZ} vídeos editándose: espera a que acabe alguno.</small>}
        </div>
      )}
      {error && <p className="ed-mal">{error}</p>}
      {hecho && <p className="ed-ok">{hecho}</p>}
    </section>
  )
}

// ── El estilo ───────────────────────────────────────────────────────────────

const ETIQUETAS = {
  palabrasPorBloque: 'Palabras por bloque',
  tamano: 'Tamaño de letra',
  borde: 'Borde',
  posicion: 'Altura (% desde arriba)',
  zoomCada: 'Zoom cada (s)',
  zoomFactor: 'Cuánto zoom',
  silencioMax: 'Silencio que se corta (s)',
  silencioDeja: 'Respiro que se deja (s)',
  similitudTomas: 'Parecido entre tomas',
}
const FORMATO = {
  zoomFactor: (v) => `×${v.toFixed(2)}`,
  similitudTomas: (v) => `${Math.round(v * 100)} %`,
  posicion: (v) => `${v} %`,
  tamano: (v) => `${v} px`,
}

function PanelEstilo({ clientId }) {
  const [abierto, setAbierto] = useState(false)
  const [guardado, setGuardado] = useState(null) // el porDefecto del servidor
  const [base, setBase] = useState(null) // el global, para «El de HELM»
  const [e, setE] = useState(null)
  const [estado, setEstado] = useState('') // '' | 'guardando' | 'ok'
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto || guardado) return undefined
    let vivo = true
    editorApi.estilos(clientId).then(d => {
      if (!vivo) return
      const def = d.porDefecto || { params: ESTILO_POR_DEFECTO, global: true, nombre: 'Estilo HELM' }
      setGuardado(def)
      setBase((d.estilos || []).find(x => x.global)?.params || ESTILO_POR_DEFECTO)
      setE(normalizaEstilo(def.params))
    }).catch(err => vivo && setError(err.message))
    return () => { vivo = false }
  }, [abierto, guardado, clientId])

  const cambia = (k, v) => { setEstado(''); setE(x => normalizaEstilo({ ...x, [k]: v })) }
  const cambiado = e && guardado && JSON.stringify(e) !== JSON.stringify(normalizaEstilo(guardado.params))

  async function guarda() {
    setEstado('guardando'); setError('')
    try {
      const d = await editorApi.guardarEstilo(clientId, e)
      setGuardado(d.porDefecto)
      setE(normalizaEstilo(d.porDefecto.params))
      setEstado('ok')
    } catch (err) { setError(err.message); setEstado('') }
  }

  const deslizador = (k, d = 2) => {
    const r = RANGOS_ESTILO[k]
    return (
      <label key={k}>
        <span className="ed-etq">{ETIQUETAS[k]} <b>{FORMATO[k] ? FORMATO[k](e[k]) : Number(e[k]).toLocaleString('es-ES', { maximumFractionDigits: d })}</b></span>
        <input type="range" min={r.min} max={r.max} step={r.paso} value={e[k]} onChange={(ev) => cambia(k, Number(ev.target.value))} />
      </label>
    )
  }
  const casilla = (k, texto) => (
    <label className="ed-check" key={k}>
      <input type="checkbox" checked={Boolean(e[k])} onChange={(ev) => cambia(k, ev.target.checked)} /> {texto}
    </label>
  )
  const color = (k, texto) => (
    <label className="ed-color" key={k}>
      <input type="color" value={e[k]} onChange={(ev) => cambia(k, ev.target.value.toUpperCase())} /> {texto}
    </label>
  )

  return (
    <section className="ed-caja">
      <button type="button" className="ed-caja-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
        <Palette size={16} /> <b>Estilo de edición</b>
        {guardado && <small>{guardado.global ? 'el de HELM' : 'el de este perfil'}</small>}
        <span>{abierto ? 'Cerrar' : 'Cambiar'}</span>
      </button>
      {abierto && (
        !e ? <p className="ed-ayuda ed-dentro">{error || <><Loader2 size={14} className="ed-gira" /> Cargando…</>}</p> : (
          <div className="ed-estilo">
            <VistaPrevia estilo={e} />
            <div className="ed-estilo-campos">
              <fieldset>
                <legend>Subtítulos</legend>
                {casilla('subtitulos', 'Subtítulos palabra a palabra')}
                {e.subtitulos && (
                  <>
                    {deslizador('palabrasPorBloque', 0)}
                    {deslizador('tamano', 0)}
                    {deslizador('posicion', 0)}
                    {deslizador('borde', 0)}
                    {casilla('mayusculas', 'En mayúsculas')}
                    <div className="ed-colores">
                      {color('colorTexto', 'Texto')}
                      {color('colorResalte', 'Palabra que suena')}
                      {color('colorBorde', 'Borde')}
                    </div>
                  </>
                )}
              </fieldset>
              <fieldset>
                <legend>Zoom</legend>
                {casilla('zoom', 'Zoom que salta (punch-in)')}
                {e.zoom && deslizador('zoomCada', 1)}
                {e.zoom && deslizador('zoomFactor')}
              </fieldset>
              <fieldset>
                <legend>Cortes</legend>
                {deslizador('silencioMax')}
                {deslizador('silencioDeja')}
                {casilla('quitarTomas', 'Quitar las tomas repetidas (se queda la última)')}
                {e.quitarTomas && deslizador('similitudTomas')}
                {casilla('quitarMuletillas', 'Quitar muletillas sueltas («eh», «mmm», «a ver»)')}
                <p className="ed-ayuda">
                  Un silencio más largo que «Silencio que se corta» se queda en «Respiro que se deja». Con más «Parecido entre
                  tomas», solo se quitan las que empiezan casi igual.
                </p>
              </fieldset>
              <div className="ed-estilo-acc">
                <button type="button" className="ag-btn primario" onClick={guarda} disabled={!cambiado || estado === 'guardando'}>
                  {estado === 'guardando' ? <><Loader2 size={14} className="ed-gira" /> Guardando…</> : 'Guardar estilo'}
                </button>
                <button type="button" className="ag-btn sm" onClick={() => { setEstado(''); setE(normalizaEstilo(base || ESTILO_POR_DEFECTO)) }}>
                  <RotateCcw size={13} /> El de HELM
                </button>
                {estado === 'ok' && <span className="ed-ok"><Check size={13} /> Guardado: los próximos vídeos saldrán así.</span>}
                {error && <span className="ed-mal">{error}</span>}
              </div>
            </div>
          </div>
        )
      )}
    </section>
  )
}

/** Un móvil en miniatura con un bloque de subtítulos de ejemplo, a escala. */
function VistaPrevia({ estilo }) {
  const ANCHO = 200
  const k = ANCHO / 1080
  const palabras = ['Esta', 'IA', 'hace', 'que', 'tu'].slice(0, estilo.palabrasPorBloque)
  const borde = Math.max(0, estilo.borde * k * 2)
  return (
    <div className="ed-previa" style={{ width: ANCHO }} aria-label="Vista previa de los subtítulos">
      <div className="ed-previa-cara" />
      <div className="ed-previa-sub" hidden={!estilo.subtitulos} style={{ top: `${estilo.posicion}%`, fontSize: Math.max(7, estilo.tamano * k) }}>
        {palabras.map((p, i) => (
          <span
            key={p}
            style={{
              color: i === Math.min(1, palabras.length - 1) ? estilo.colorResalte : estilo.colorTexto,
              WebkitTextStroke: borde ? `${borde}px ${estilo.colorBorde}` : undefined,
            }}
          >
            {estilo.mayusculas ? p.toLocaleUpperCase('es-ES') : p}{i < palabras.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
      <div className="ed-previa-ig" aria-hidden="true" />
    </div>
  )
}

// ── La lista ────────────────────────────────────────────────────────────────

function ListaEdiciones({ clientId, ediciones, recargar }) {
  const [ocupado, setOcupado] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [error, setError] = useState('')

  async function descargar(e) {
    setOcupado(e.id); setError('')
    try {
      const b = await editorApi.descarga(clientId, e.id)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `${String(e.nombre_original || 'reel').replace(/\.[a-z0-9]{2,4}$/i, '')}-editado.mp4`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch (err) { setError(err.message) }
    setOcupado('')
  }
  async function borrar(e) {
    if (!window.confirm(`¿Borrar «${e.nombre_original || 'este vídeo'}»? Se borran el original y el editado.`)) return
    setOcupado(e.id); setError('')
    try { await editorApi.borrar(clientId, e.id); await recargar() } catch (err) { setError(err.message) }
    setOcupado('')
  }

  return (
    <>
      {error && <p className="ag-error">{error}</p>}
      <ul className="ed-lista">
        {ediciones.map(e => {
          const Icono = ICONO[e.estado] || Clock
          const vivo = EN_MARCHA.includes(e.estado)
          const viejo = caducado(e)
          return (
            <li key={e.id} className={`ed-item ${e.estado}`}>
              <div className="ed-item-cab">
                <span className="ed-estado"><Icono size={14} className={vivo && e.estado !== 'en_cola' ? 'ed-gira' : ''} /> {ESTADOS_EDICION[e.estado] || e.estado}</span>
                <div className="ed-item-txt">
                  <b title={e.nombre_original}>{e.nombre_original || 'Vídeo'}</b>
                  <small>
                    {fecha(e.created_at)}
                    {e.duracion_original != null && <> · {mmss(e.duracion_original)}{e.duracion_final != null && <> → <b>{mmss(e.duracion_final)}</b></>}</>}
                    {viejo && ` · ya no está (se guardan ${DIAS_GUARDADO} días)`}
                  </small>
                </div>
                <div className="ed-item-acc">
                  {e.estado === 'listo' && !viejo && (
                    <button type="button" className="ag-btn primario sm" onClick={() => descargar(e)} disabled={ocupado === e.id}>
                      {ocupado === e.id ? <Loader2 size={13} className="ed-gira" /> : <Download size={13} />} Descargar
                    </button>
                  )}
                  {e.estado === 'listo' && (
                    <button type="button" className="ag-btn sm" onClick={() => setAbierta(abierta === e.id ? null : e.id)} aria-expanded={abierta === e.id}>
                      <Scissors size={13} /> Qué ha quitado <ChevronRight size={13} className={`ed-chevron${abierta === e.id ? ' abierto' : ''}`} />
                    </button>
                  )}
                  <button type="button" className="ag-btn sm peligro" onClick={() => borrar(e)} disabled={ocupado === e.id} aria-label="Borrar" title="Borrar">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {vivo && (
                <div className="ed-item-progreso">
                  <div className="ed-barra"><span style={{ width: `${Math.max(3, e.progreso)}%` }} /></div>
                  <small>{e.paso || ESTADOS_EDICION[e.estado]} · {e.progreso} %</small>
                </div>
              )}
              {e.estado === 'error' && e.error && <p className="ed-mal ed-item-error">{e.error}</p>}
              {abierta === e.id && <Detalle clientId={clientId} id={e.id} />}
            </li>
          )
        })}
      </ul>
    </>
  )
}

const MOTIVO = { toma: 'Toma repetida', muletilla: 'Muletilla' }

function Detalle({ clientId, id }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    editorApi.estado(clientId, id).then(r => vivo && setD(r.edicion)).catch(e => vivo && setError(e.message))
    return () => { vivo = false }
  }, [clientId, id])
  if (error) return <p className="ed-mal ed-detalle">{error}</p>
  if (!d) return <p className="ed-ayuda ed-detalle"><Loader2 size={14} className="ed-gira" /> Cargando…</p>
  const p = d.plan
  const r = p?.resumen
  if (!r) return <p className="ed-ayuda ed-detalle">Sin detalle de este vídeo.</p>
  const frases = p.quitado || []
  return (
    <div className="ed-detalle">
      <p>
        {r.sinVoz ? 'No se oía voz: el vídeo ha salido entero, solo encuadrado.' : (
          <>
            De {mmss(r.duracionOriginal)} a <b>{mmss(r.duracionFinal)}</b>: {r.tomas} {r.tomas === 1 ? 'toma repetida' : 'tomas repetidas'},{' '}
            {r.muletillas} {r.muletillas === 1 ? 'muletilla' : 'muletillas'} y {r.silencios} {r.silencios === 1 ? 'silencio recortado' : 'silencios recortados'}.
            {' '}{p.cortes} {p.cortes === 1 ? 'corte' : 'cortes'}, {p.bloques} bloques de subtítulos y {p.zooms} {p.zooms === 1 ? 'zoom' : 'zooms'}.
          </>
        )}
      </p>
      {frases.length > 0 && (
        <ul className="ed-quitado">
          {frases.map((f, i) => (
            <li key={i}><span className={`ed-motivo ${f.motivo}`}>{MOTIVO[f.motivo] || f.motivo}</span> <span>«{f.texto}»</span> <small>{mmss(f.a)}</small></li>
          ))}
        </ul>
      )}
    </div>
  )
}
