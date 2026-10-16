// HELM — Portadas de reels. La ventana del agente de portadas dentro de Agentes.
//
// Tus reels de Instagram con su portada y, en cada uno, «Crear portada»: eliges
// el fotograma del vídeo (o la portada actual, o una foto), el agente propone
// tres textos y la portada se compone aquí, en el navegador, en 1080×1920 con
// el kit de la serie. Antes de descargarla se ve cómo queda en la cuadrícula
// del perfil y pasa las comprobaciones del estudio (src/agents/portadas/).
//
// Instagram no deja cambiar la portada por API una vez publicado: se descarga
// y se pone en la app (Editar → Portada). Solo gasta créditos «Proponer textos».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Sparkles, Download, Upload, Film, Image as ImagenIcono, Check, AlertTriangle, Loader2, Palette } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { portadasApi } from '../helm/lib'
import { PLANTILLAS, LETRAS, MARCA_POR_DEFECTO, normalizaMarca, comprobar, LIENZO, ZONA_CUADRICULA } from './portadas/reglas'
import { maquetar, pintar } from './portadas/componer'
import '../fonts/barlow-condensed.css'
import '../fonts/inter-tight.css'
import './portadas.css'

const fecha = (t) => { try { return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) } catch { return '' } }
const miles = (n) => (Number(n) || 0).toLocaleString('es-ES')
const slug = (s) => String(s || 'portada').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'portada'
const esReel = (r) => String(r.producto || '').toUpperCase() === 'REELS' || String(r.tipo || '').toUpperCase() === 'VIDEO'

function cargaImagen(src) {
  return new Promise((ok, mal) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => mal(new Error('No se pudo abrir la imagen'))
    img.src = src
  })
}

export default function Portadas({ clientId, client, onVolver }) {
  const [reels, setReels] = useState(null)
  const [error, setError] = useState('')
  const [marca, setMarca] = useState(MARCA_POR_DEFECTO)
  const [elegido, setElegido] = useState(undefined)   // undefined: lista · null: desde una foto · reel

  useEffect(() => {
    let vivo = true
    supabase.from('helm_ig_media')
      .select('media_id, caption, permalink, publicado_en, visitas, thumb_url, tipo, producto')
      .eq('client_id', clientId).order('publicado_en', { ascending: false }).limit(60)
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) { setError(e.message); setReels([]); return }
        setReels((data || []).filter(esReel))
      })
    portadasApi.marca(clientId).then(d => vivo && setMarca(normalizaMarca(d.marca))).catch(() => {})
    return () => { vivo = false }
  }, [clientId])

  if (elegido !== undefined) {
    return (
      <Taller
        clientId={clientId} reel={elegido} marca={marca} vecinos={(reels || []).filter(r => r !== elegido).slice(0, 5)}
        onVolver={() => setElegido(undefined)}
      />
    )
  }

  return (
    <div className="ag embebido por-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Agentes</button>
          <h1>Portadas</h1>
          <p>
            Las portadas de los reels de {client?.name || 'este perfil'}. La portada no te da alcance: convierte en tu perfil, que es
            donde alguien decide si seguirte y qué otro vídeo ver. Por eso aquí se cuida que se lea en pequeño y que toda la
            cuadrícula parezca una serie.
          </p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}
      <KitMarca clientId={clientId} marca={marca} onGuardada={setMarca} />

      <div className="por-acciones">
        <button type="button" className="ag-btn" onClick={() => setElegido(null)}><Upload size={14} /> Portada desde una foto</button>
      </div>

      {reels == null ? <p className="por-ayuda"><Loader2 size={14} className="por-gira" /> Cargando tus reels…</p>
        : !reels.length ? (
          <p className="por-ayuda">
            Aún no hay reels de este perfil. Conecta Instagram en <b>Ajustes → Instagram</b> y, cuando sincronice, aquí salen
            todos con su portada. Mientras, puedes hacer una portada desde una foto.
          </p>
        ) : (
          <ul className="por-reels">
            {reels.map(r => (
              <li key={r.media_id} className="por-reel">
                <Miniatura reel={r} />
                <div className="por-reel-txt">
                  <small>{fecha(r.publicado_en)} · {miles(r.visitas)} visualizaciones</small>
                  <p>{String(r.caption || '').split('\n')[0].slice(0, 110) || 'Sin caption'}</p>
                </div>
                <button type="button" className="ag-btn primario sm" onClick={() => setElegido(r)}><Sparkles size={13} /> Crear portada</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

// La portada guardada en la sincronización. Su dirección caduca a los pocos
// días: si ya no abre, se dice en vez de enseñar un hueco roto.
function Miniatura({ reel }) {
  const [rota, setRota] = useState(false)
  return (
    <div className="por-mini">
      {reel.thumb_url && !rota
        ? <img src={reel.thumb_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} />
        : <span>Portada no disponible ahora</span>}
    </div>
  )
}

function KitMarca({ clientId, marca, onGuardada }) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState(marca)
  const [estado, setEstado] = useState('')
  useEffect(() => { setBorrador(marca) }, [marca])
  const cambia = (k, v) => setBorrador(b => ({ ...b, [k]: v }))
  async function guardar() {
    setEstado('guardando')
    try { const d = await portadasApi.guardarMarca(clientId, borrador); onGuardada(normalizaMarca(d.marca)); setEstado('guardado'); setAbierto(false) }
    catch (e) { setEstado(e.message) }
  }
  return (
    <section className="por-kit">
      <button type="button" className="por-kit-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
        <Palette size={16} />
        <b>Kit de la serie</b>
        <span className="por-muestra" style={{ background: marca.colorPrincipal }} />
        <span className="por-muestra" style={{ background: marca.colorResalte }} />
        <small>{LETRAS[marca.letra]?.nombre} · {PLANTILLAS.find(p => p.id === marca.plantilla)?.nombre}{marca.etiqueta ? ` · «${marca.etiqueta}»` : ''}</small>
        <span className="por-kit-mas">{abierto ? 'Cerrar' : 'Cambiar'}</span>
      </button>
      {abierto && (
        <div className="por-kit-form">
          <p className="por-ayuda">Una o dos plantillas, dos colores y la misma letra en todas: así tu cuadrícula parece un canal y no un álbum.</p>
          <label>Color principal <input type="color" value={borrador.colorPrincipal} onChange={e => cambia('colorPrincipal', e.target.value)} /></label>
          <label>Color de resalte <input type="color" value={borrador.colorResalte} onChange={e => cambia('colorResalte', e.target.value)} /></label>
          <label>Letra
            <select value={borrador.letra} onChange={e => cambia('letra', e.target.value)}>
              {Object.entries(LETRAS).map(([k, l]) => <option key={k} value={k}>{l.nombre}</option>)}
            </select>
          </label>
          <label>Plantilla de la serie
            <select value={borrador.plantilla} onChange={e => cambia('plantilla', e.target.value)}>
              {PLANTILLAS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label>Etiqueta de la serie <input value={borrador.etiqueta} maxLength={24} placeholder="p. ej. IA" onChange={e => cambia('etiqueta', e.target.value)} /></label>
          <label className="por-check"><input type="checkbox" checked={borrador.mayusculas} onChange={e => cambia('mayusculas', e.target.checked)} /> Todo en mayúsculas (con tildes)</label>
          <div className="por-kit-pie">
            <button type="button" className="ag-btn primario sm" onClick={guardar} disabled={estado === 'guardando'}>Guardar el kit</button>
            {estado && estado !== 'guardando' && estado !== 'guardado' && <span className="ag-error">{estado}</span>}
          </div>
        </div>
      )}
    </section>
  )
}

function Taller({ clientId, reel, marca, vecinos, onVolver }) {
  const lienzo = useRef(null)
  const video = useRef(null)
  const [fuente, setFuente] = useState(reel ? 'video' : 'foto')
  const [imagen, setImagen] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [duracion, setDuracion] = useState(0)
  const [tiempo, setTiempo] = useState(1)
  const [cargando, setCargando] = useState(reel ? 'Descargando el vídeo…' : '')
  const [error, setError] = useState('')
  const [encuadre, setEncuadre] = useState(0.5)
  const [zoom, setZoom] = useState(1)
  const [texto, setTexto] = useState('')
  const [resaltada, setResaltada] = useState('')
  const [secundario, setSecundario] = useState('')
  const [plantilla, setPlantilla] = useState(marca.plantilla)
  const [opciones, setOpciones] = useState(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [checks, setChecks] = useState([])
  const [previa, setPrevia] = useState('')

  // La portada que tiene ahora el reel, por si se prefiere de fondo (o si el
  // vídeo no se puede descargar).
  const traerActual = useCallback(() => {
    setCargando('Trayendo la portada actual…'); setError('')
    portadasApi.imagen(clientId, reel.media_id)
      .then(b => cargaImagen(URL.createObjectURL(b)))
      .then(setImagen)
      .catch(e => setError(e.message))
      .finally(() => setCargando(''))
  }, [clientId, reel])

  // El vídeo se descarga una vez al entrar (por HELM: el CDN de Meta no deja
  // leerlo desde el navegador) y se suelta al salir.
  useEffect(() => {
    if (!reel) return undefined
    let vivo = true
    portadasApi.video(clientId, reel.media_id)
      .then(b => { if (vivo) setVideoUrl(URL.createObjectURL(b)) })
      .catch(e => { if (vivo) { setError(`${e.message}. Uso la portada actual.`); setFuente('actual'); traerActual() } })
      .finally(() => { if (vivo) setCargando('') })
    return () => { vivo = false }
  }, [clientId, reel, traerActual])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  function elegirFuente(f) {
    setFuente(f)
    if (f === 'actual') traerActual()
    if (f === 'video') capturar()
  }

  // Cada vez que el vídeo termina de saltar a un instante, ese fotograma pasa
  // a ser el fondo (copiado a un canvas: el <video> sigue moviéndose).
  const capturar = useCallback(() => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    setImagen(c)
  }, [])

  function subirFoto(e) {
    const f = e.target.files?.[0]
    if (!f) return
    cargaImagen(URL.createObjectURL(f)).then(setImagen).catch(err => setError(err.message))
  }

  async function proponer() {
    if (!reel) return
    setPidiendo(true); setError('')
    try { const d = await portadasApi.textos(clientId, reel.media_id); setOpciones(d.opciones) }
    catch (e) { setError(e.message) }
    setPidiendo(false)
  }
  const usar = (o) => { setTexto(o.texto); setResaltada(o.resaltada); setSecundario(o.secundario || ''); setPlantilla(o.plantilla) }

  // Componer: cada cambio vuelve a pintar el lienzo entero (es un instante).
  useEffect(() => {
    let vivo = true
    const c = lienzo.current
    if (!c) return
    const letra = LETRAS[marca.letra] || LETRAS.barlow
    document.fonts.load(`${letra.peso} 100px "${letra.familia}"`).catch(() => {}).then(() => {
      if (!vivo) return
      const ctx = c.getContext('2d', { willReadFrequently: true })
      const medir = (t, tam) => { ctx.font = `${letra.peso} ${tam}px "${letra.familia}"`; return ctx.measureText(t).width }
      const plan = maquetar({ texto: texto || 'Escribe aquí tu titular', resaltada, secundario, plantilla, marca, medir })
      const { contrastes } = pintar(ctx, { imagen: imagen || c.ownerDocument.createElement('canvas'), encuadre, zoom, plan, marca })
      setChecks(comprobar({ texto, cajas: plan.cajas, contrastes, tamano: plan.tam }))
      // La vista de la cuadrícula: el recorte 3:4 en pequeño.
      const mini = document.createElement('canvas')
      mini.width = 270; mini.height = 360
      mini.getContext('2d').drawImage(c, 0, ZONA_CUADRICULA.y0, LIENZO.ancho, LIENZO.alto - 2 * ZONA_CUADRICULA.y0, 0, 0, 270, 360)
      setPrevia(mini.toDataURL('image/jpeg', 0.8))
    })
    return () => { vivo = false }
  }, [imagen, encuadre, zoom, texto, resaltada, secundario, plantilla, marca])

  function descargar(tipo) {
    const c = lienzo.current
    if (!c) return
    c.toBlob(b => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `portada-${slug(texto)}.${tipo === 'image/png' ? 'png' : 'jpg'}`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }, tipo, 0.92)
  }

  const fallos = checks.filter(c => !c.ok).length
  const palabras = useMemo(() => texto.split(/\s+/).filter(Boolean), [texto])

  return (
    <div className="ag embebido por-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Portadas</button>
          <h1>Crear portada</h1>
          <p>{reel ? String(reel.caption || '').split('\n')[0].slice(0, 140) : 'Desde una foto tuya'}</p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}

      <div className="por-taller">
        <div className="por-lienzo-col">
          <canvas ref={lienzo} width={LIENZO.ancho} height={LIENZO.alto} className="por-lienzo" aria-label="Vista previa de la portada" />
          <div className="por-descargas">
            <button type="button" className="ag-btn primario" onClick={() => descargar('image/jpeg')} disabled={!imagen || !texto}><Download size={14} /> JPG</button>
            <button type="button" className="ag-btn" onClick={() => descargar('image/png')} disabled={!imagen || !texto}><Download size={14} /> PNG</button>
          </div>
          <small className="por-ayuda">1080×1920. Ponla en la app: el reel → Editar → Portada.</small>
        </div>

        <div className="por-controles">
          <section>
            <h3>1 · Fondo</h3>
            <div className="por-pestanas" role="tablist">
              {reel && <button type="button" role="tab" aria-selected={fuente === 'video'} className={fuente === 'video' ? 'on' : ''} onClick={() => elegirFuente('video')}><Film size={14} /> Fotograma</button>}
              {reel && <button type="button" role="tab" aria-selected={fuente === 'actual'} className={fuente === 'actual' ? 'on' : ''} onClick={() => elegirFuente('actual')}><ImagenIcono size={14} /> Portada actual</button>}
              <button type="button" role="tab" aria-selected={fuente === 'foto'} className={fuente === 'foto' ? 'on' : ''} onClick={() => elegirFuente('foto')}><Upload size={14} /> Foto</button>
            </div>
            {cargando && <p className="por-ayuda"><Loader2 size={14} className="por-gira" /> {cargando}</p>}
            {fuente === 'video' && videoUrl && (
              <div className="por-video">
                <video
                  ref={video} src={videoUrl} muted playsInline preload="auto"
                  onLoadedMetadata={e => {
                    const d = e.currentTarget.duration || 0
                    const t = Math.min(1, d / 2)
                    setDuracion(d); setTiempo(t); e.currentTarget.currentTime = t
                  }}
                  onSeeked={capturar}
                />
                <label>Instante: {tiempo.toFixed(1)} s
                  <input type="range" min="0" max={Math.max(0.1, duracion)} step="0.1" value={tiempo}
                    onChange={e => { const t = Number(e.target.value); setTiempo(t); if (video.current) video.current.currentTime = t }} />
                </label>
                <small className="por-ayuda">Busca uno con los ojos abiertos, nítido y sin el subtítulo quemado.</small>
              </div>
            )}
            {fuente === 'foto' && <label className="por-subir"><Upload size={14} /> Elegir foto <input type="file" accept="image/*" onChange={subirFoto} /></label>}
            <label>Encuadre vertical <input type="range" min="0" max="1" step="0.01" value={encuadre} onChange={e => setEncuadre(Number(e.target.value))} /></label>
            <label>Zoom <input type="range" min="1" max="1.8" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
          </section>

          <section>
            <h3>2 · Texto</h3>
            {reel && (
              <button type="button" className="ag-btn sm" onClick={proponer} disabled={pidiendo}>
                {pidiendo ? <><Loader2 size={13} className="por-gira" /> Pensando…</> : <><Sparkles size={13} /> Proponer textos</>}
              </button>
            )}
            {opciones && (
              <ul className="por-opciones">
                {opciones.map((o, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => usar(o)} className={texto === o.texto ? 'on' : ''}>
                      <small>{o.angulo}</small>
                      <b>{o.texto}</b>
                      {o.porque && <span>{o.porque}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label>Titular <input value={texto} maxLength={80} placeholder="2–6 palabras" onChange={e => setTexto(e.target.value)} /></label>
            <label>Palabra resaltada
              <select value={resaltada} onChange={e => setResaltada(e.target.value)}>
                <option value="">Ninguna</option>
                {palabras.map((p, i) => <option key={p + i} value={p}>{p}</option>)}
              </select>
            </label>
            <label>Línea secundaria (opcional) <input value={secundario} maxLength={40} onChange={e => setSecundario(e.target.value)} /></label>
          </section>

          <section>
            <h3>3 · Plantilla</h3>
            <div className="por-plantillas">
              {PLANTILLAS.map(p => (
                <button key={p.id} type="button" className={plantilla === p.id ? 'on' : ''} onClick={() => setPlantilla(p.id)} title={p.desc}>{p.nombre}</button>
              ))}
            </div>
          </section>

          <section>
            <h3>4 · Así se ve en tu perfil</h3>
            <div className="por-cuadricula" aria-label="La portada en la cuadrícula del perfil">
              {previa && <img src={previa} alt="Tu portada nueva" className="nueva" />}
              {vecinos.map(v => (v.thumb_url ? <img key={v.media_id} src={v.thumb_url} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.visibility = 'hidden' }} /> : <span key={v.media_id} />))}
            </div>
            <ul className="por-checks">
              {checks.map((c, i) => (
                <li key={i} className={c.ok ? 'ok' : 'mal'}>{c.ok ? <Check size={13} /> : <AlertTriangle size={13} />} {c.texto}</li>
              ))}
            </ul>
            {fallos > 0 && <small className="por-ayuda">Puedes descargarla igual, pero cada aviso le quita fuerza en el móvil.</small>}
          </section>
        </div>
      </div>
    </div>
  )
}
