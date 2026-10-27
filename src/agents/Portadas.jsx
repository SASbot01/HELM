// HELM — Portadas de reels. La ventana del agente de portadas dentro de Agentes.
//
// Tus reels de Instagram con su portada y, en cada uno, «Crear portada»: eliges
// el fotograma del vídeo (o la portada actual, o una foto), el agente propone
// tres textos y la portada se compone aquí, en el navegador, en 1080×1920 con
// el kit de la serie. Antes de descargarla se ve cómo queda en la cuadrícula
// del perfil y pasa las comprobaciones del estudio (src/agents/portadas/).
//
// También sin Instagram: «Portada desde una foto» y «Portada desde un vídeo»
// (desde el 27-oct). El vídeo se abre AQUÍ, en el navegador
// (URL.createObjectURL), con el mismo selector de instante que el del reel:
// no se sube a ningún sitio; a la IA solo va el fotograma elegido.
//
// Instagram no deja cambiar la portada por API una vez publicado: se descarga
// y se pone en la app (Editar → Portada). Gastan créditos «Proponer textos» y
// «Sugerir estilo» (por lo que use la IA) y cada imagen generada con IA (la
// portada entera o el fondo): 40 créditos, a precio fijo, que se enseñan en el
// botón antes de pulsar (src/helm/precios.js). Si la generación falla, no se
// cobra; en la agencia de la casa es gratis.
//
// Dos modos (desde el 2026-10-22):
//   · Con IA: eliges el fotograma, un estilo (con su portada de ejemplo, o uno
//     de los ejemplos que el perfil ha subido a mano) y el titular, y la IA
//     genera la portada entera conservando a la persona del fotograma
//     (src/agents/portadas/estilosIa.js, api/portadas.js · portada-ia).
//   · Plantilla de la serie: lo de siempre, compuesta aquí con el kit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Sparkles, Download, Upload, Film, Image as ImagenIcono, Check, AlertTriangle, Loader2, Palette, Plus, X, ExternalLink } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { portadasApi, creditosApi } from '../helm/lib'
import { aCreditos, creditosQueQuedan } from '../helm/precios'
import { PLANTILLAS, LETRAS, MARCA_POR_DEFECTO, normalizaMarca, comprobar, LIENZO, ZONA_CUADRICULA } from './portadas/reglas'
import { maquetar, pintar } from './portadas/componer'
import { ESTILOS_IA, ejemploDe, MAX_TITULO_IA, MAX_DETALLE_IA, MAX_NOMBRE_EJEMPLO } from './portadas/estilosIa'
import VistaEstilo from './portadas/VistaEstilo'
import { capturador } from './portadas/fotograma'
import '../fonts/barlow-condensed.css'
import '../fonts/inter-tight.css'
import './portadas.css'

const fecha = (t) => { try { return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) } catch { return '' } }
const miles = (n) => (Number(n) || 0).toLocaleString('es-ES')
const slug = (s) => String(s || 'portada').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'portada'
const esReel = (r) => String(r.producto || '').toUpperCase() === 'REELS' || String(r.tipo || '').toUpperCase() === 'VIDEO'

// Una imagen (canvas, <img> o <video> copiado) en 9:16 rellenando el lienzo.
function pintaCubriendo(ctx, img, ancho, alto) {
  const w = img.videoWidth || img.naturalWidth || img.width
  const h = img.videoHeight || img.naturalHeight || img.height
  if (!w || !h) return
  const esc = Math.max(ancho / w, alto / h)
  ctx.drawImage(img, (ancho - w * esc) / 2, (alto - h * esc) / 2, w * esc, h * esc)
}

// El fotograma que se manda a la IA: 9:16, 720×1280 y en JPG (pesa poco y
// basta para que conserve a la persona).
function fotogramaParaIa(img) {
  const c = document.createElement('canvas')
  c.width = 720; c.height = 1280
  pintaCubriendo(c.getContext('2d'), img, 720, 1280)
  return c.toDataURL('image/jpeg', 0.88)
}

// Un ejemplo subido a mano, reducido para que no pase del tope de la API.
function ejemploParaSubir(img) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const esc = Math.min(1, 1920 / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * esc); c.height = Math.round(h * esc)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.9)
}

/**
 * Lo que se enseña en el botón de generar: «· 40 créditos», «· gratis» o nada
 * mientras no se sabe. `precios` es lo de creditosApi.precios. «Gratis» a
 * secas: no pagan ni la agencia de la casa ni un perfil sin agencia, y
 * creditosApi.precios no dice cuál de los dos es.
 */
function etiquetaPrecio(precios, concepto = 'portada-ia') {
  if (!precios) return ''
  if (!precios.paga) return ' · gratis'
  const euros = precios.precios?.[concepto]
  return euros > 0 ? ` · ${aCreditos(euros).toLocaleString('es-ES')} créditos` : ''
}

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
  // undefined: la lista · { reel, inicio }: el taller, con un reel o sin él
  // (desde una foto o desde un vídeo tuyo).
  const [elegido, setElegido] = useState(undefined)

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
        clientId={clientId} reel={elegido.reel} inicio={elegido.inicio} marca={marca}
        vecinos={(reels || []).filter(r => r !== elegido.reel).slice(0, 5)}
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
        <button type="button" className="ag-btn" onClick={() => setElegido({ reel: null, inicio: 'foto' })}><Upload size={14} /> Portada desde una foto</button>
        <button type="button" className="ag-btn" onClick={() => setElegido({ reel: null, inicio: 'mivideo' })}><Film size={14} /> Portada desde un vídeo</button>
      </div>

      {reels == null ? <p className="por-ayuda"><Loader2 size={14} className="por-gira" /> Cargando tus reels…</p>
        : !reels.length ? (
          <p className="por-ayuda">
            Aún no hay reels de este perfil. Conecta Instagram en <b>Ajustes → Instagram</b> y, cuando sincronice, aquí salen
            todos con su portada. Mientras, puedes hacer una portada desde una foto o desde un vídeo tuyo.
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
                <button type="button" className="ag-btn primario sm" onClick={() => setElegido({ reel: r, inicio: 'video' })}><Sparkles size={13} /> Crear portada</button>
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

// El selector de instante: el vídeo (el del reel o el tuyo, abierto aquí) y
// una barra para elegir el fotograma. Cada vez que el vídeo termina de saltar a
// un instante, ese fotograma pasa a ser el fondo (copiado a un canvas: el
// <video> sigue moviéndose; reducido y con dos lienzos que se turnan, para que
// un 4K del móvil no agote la memoria: portadas/fotograma.js). Al volver a la
// pestaña, vuelve al instante que tenía (`tiempo` lo guarda el taller).
function Fotogramas({ src, tiempo, onTiempo, onCaptura, onFallo }) {
  const ref = useRef(null)
  const [duracion, setDuracion] = useState(0)
  const [captura] = useState(() => capturador())
  const capturar = () => {
    // Sin lienzo (el navegador se quedó sin memoria), se queda el de antes.
    const c = captura(ref.current)
    if (c) onCaptura(c)
  }
  return (
    <div className="por-video">
      <video
        ref={ref} src={src} muted playsInline preload="auto"
        onLoadedMetadata={e => {
          const d = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0
          const t = tiempo == null ? Math.min(1, d / 2) : Math.min(tiempo, Math.max(0, d - 0.05))
          setDuracion(d); onTiempo(t)
          // A 0 justo no siempre salta (ya está ahí) y no llegaría el fotograma.
          e.currentTarget.currentTime = Math.max(0.01, t)
        }}
        onSeeked={capturar}
        onError={() => onFallo?.()}
      />
      <label>Instante: {(tiempo ?? 0).toFixed(1)} s
        <input type="range" min="0" max={Math.max(0.1, duracion)} step="0.1" value={tiempo ?? 0}
          onChange={e => { const t = Number(e.target.value); onTiempo(t); if (ref.current) ref.current.currentTime = t }} />
      </label>
      <small className="por-ayuda">Busca uno con los ojos abiertos, nítido y sin el subtítulo quemado.</small>
    </div>
  )
}

function Taller({ clientId, reel, inicio = 'foto', marca, vecinos, onVolver }) {
  const lienzo = useRef(null)
  // Si el usuario ya eligió modo a mano, capacidad() no debe pisárselo al llegar.
  const tocoModo = useRef(false)
  const [fuente, setFuente] = useState(reel ? 'video' : inicio)
  const [imagen, setImagen] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  // El vídeo propio: abierto aquí con URL.createObjectURL, nunca se sube.
  const [miVideo, setMiVideo] = useState(null)   // { url, nombre }
  // El instante elegido en cada vídeo (null: aún no se ha abierto).
  const [tiempos, setTiempos] = useState({ video: null, mivideo: null })
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
  // Fondo con IA (Ideogram): solo si el server tiene la clave de imagen.
  const [hayIa, setHayIa] = useState(false)
  const [promptIa, setPromptIa] = useState('')
  const [temaIa, setTemaIa] = useState('')
  const [pidiendoPrompt, setPidiendoPrompt] = useState(false)
  const [generandoIa, setGenerandoIa] = useState(false)
  const [fondoEsIa, setFondoEsIa] = useState(false)
  // Portada entera con IA: el modo, el estilo, los ejemplos del perfil y las
  // versiones generadas en esta sesión (la elegida es la que se ve y se baja).
  const [modo, setModo] = useState('serie')
  const [hayPortadaIa, setHayPortadaIa] = useState(false)
  const [estiloIa, setEstiloIa] = useState('oro')
  const [detalle, setDetalle] = useState('')
  const [ejemplos, setEjemplos] = useState([])
  const [versiones, setVersiones] = useState([])
  const [elegida, setElegida] = useState(-1)
  const [generandoPortada, setGenerandoPortada] = useState(false)
  // Lo que cuesta cada imagen con IA y si este perfil paga (creditosApi.precios).
  const [precios, setPrecios] = useState(null)

  useEffect(() => {
    let vivo = true
    portadasApi.capacidad(clientId).then(d => {
      if (!vivo) return
      setHayIa(Boolean(d.fondoIa))
      setHayPortadaIa(Boolean(d.portadaIa))
      if (d.portadaIa && !tocoModo.current) setModo('ia')
    }).catch(() => {})
    portadasApi.ejemplos(clientId).then(d => { if (vivo) setEjemplos(d.ejemplos || []) }).catch(() => {})
    creditosApi.precios(clientId).then(d => { if (vivo) setPrecios(d) }).catch(() => {})
    return () => { vivo = false }
  }, [clientId])
  // Tras cobrar, el saldo que devuelve la API (para enseñar lo que queda), solo
  // si ya se enseñaba: el saldo es de la agencia y solo lo ve quien la
  // administra (creditosApi.precios lo da null al resto).
  const apuntaSaldo = (d) => { if (d?.saldo != null) setPrecios(p => (p && p.saldo != null ? { ...p, saldo: Number(d.saldo) } : p)) }

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
  useEffect(() => () => { if (miVideo?.url) URL.revokeObjectURL(miVideo.url) }, [miVideo])

  // Al cambiar de pestaña de vídeo, el selector se vuelve a montar y saca solo
  // el fotograma del instante que tenía.
  function elegirFuente(f) {
    setFuente(f)
    if (f !== 'ia') setFondoEsIa(false)
    if (f === 'actual') traerActual()
  }
  const ponTiempo = (cual) => (t) => setTiempos(ts => (ts[cual] === t ? ts : { ...ts, [cual]: t }))

  function subirFoto(e) {
    const f = e.target.files?.[0]
    if (!f) return
    cargaImagen(URL.createObjectURL(f)).then(setImagen).catch(err => setError(err.message))
  }

  // Un vídeo tuyo, del ordenador o del móvil: se abre aquí y no sale de tu
  // navegador; solo el fotograma que elijas va a la IA (como el del reel).
  function abrirVideo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type && !f.type.startsWith('video/')) { setError('Eso no es un vídeo. Elige un MP4 o MOV.'); return }
    setError('')
    setTiempos(ts => ({ ...ts, mivideo: null }))
    setMiVideo({ url: URL.createObjectURL(f), nombre: f.name || 'tu vídeo' })
    setFuente('mivideo')
  }

  async function proponer() {
    if (!reel) return
    setPidiendo(true); setError('')
    try { const d = await portadasApi.textos(clientId, reel.media_id); setOpciones(d.opciones) }
    catch (e) { setError(e.message) }
    setPidiendo(false)
  }
  const usar = (o) => { setTexto(o.texto); setResaltada(o.resaltada); setSecundario(o.secundario || ''); setPlantilla(o.plantilla) }

  async function sugerirPrompt() {
    setPidiendoPrompt(true); setError('')
    try { const d = await portadasApi.fondoPrompt(clientId, reel?.media_id, temaIa); setPromptIa(d.prompt) }
    catch (e) { setError(e.message) }
    setPidiendoPrompt(false)
  }

  async function generarFondoIa() {
    const p = promptIa.trim()
    if (!p) { setError('Escribe o sugiere primero la descripción del fondo'); return }
    setGenerandoIa(true); setError('')
    try {
      const d = await portadasApi.fondoIa(clientId, p)
      apuntaSaldo(d)
      const img = await cargaImagen(d.imagen)
      setImagen(img); setEncuadre(0.5); setZoom(1); setFondoEsIa(true)
    } catch (e) { setError(e.message) }
    setGenerandoIa(false)
  }

  async function generarPortada() {
    if (!imagen) { setError('Elige primero el fotograma (o sube una foto)'); return }
    if (!texto.trim()) { setError('Escribe el titular'); return }
    if (estiloIa === 'libre' && !detalle.trim()) { setError('Describe el estilo que quieres'); return }
    setGenerandoPortada(true); setError('')
    try {
      const d = await portadasApi.portadaIa(clientId, {
        fotograma: fotogramaParaIa(imagen), titulo: texto.trim(), estilo: estiloIa, detalle: detalle.trim(), mediaId: reel?.media_id,
      })
      apuntaSaldo(d)
      const img = await cargaImagen(d.imagen)
      setVersiones(v => { const n = [...v, { img, estilo: estiloIa }]; setElegida(n.length - 1); return n })
    } catch (e) { setError(e.message) }
    setGenerandoPortada(false)
  }

  async function subirEjemplo(archivo, nombre) {
    setError('')
    const url = URL.createObjectURL(archivo)
    try {
      const img = await cargaImagen(url)
      const d = await portadasApi.subirEjemplo(clientId, nombre, ejemploParaSubir(img))
      setEjemplos(d.ejemplos || [])
      if (d.ejemplo) setEstiloIa(`ej:${d.ejemplo.id}`)
    } finally { URL.revokeObjectURL(url) }
  }

  async function borrarEjemplo(e) {
    if (!window.confirm(`¿Quitar el ejemplo «${e.nombre}»?`)) return
    setError('')
    try {
      const d = await portadasApi.borrarEjemplo(clientId, e.id)
      setEjemplos(d.ejemplos || [])
      if (estiloIa === `ej:${e.id}`) setEstiloIa('oro')
    } catch (err) { setError(err.message) }
  }

  const portadaIa = modo === 'ia' && elegida >= 0 ? versiones[elegida]?.img : null

  // Componer: cada cambio vuelve a pintar el lienzo entero (es un instante).
  // En modo IA se pinta la versión elegida (o el fotograma, mientras no hay).
  useEffect(() => {
    if (modo !== 'ia') return undefined
    let vivo = true
    const c = lienzo.current
    if (!c) return undefined
    document.fonts.load('600 46px "Inter Tight"').catch(() => {}).then(() => {
      if (!vivo) return
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, LIENZO.ancho, LIENZO.alto)
      const base = portadaIa || imagen
      if (base) pintaCubriendo(ctx, base, LIENZO.ancho, LIENZO.alto)
      if (!portadaIa) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, LIENZO.alto / 2 - 90, LIENZO.ancho, 180)
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '600 46px "Inter Tight", system-ui, sans-serif'
        ctx.fillText(base ? 'Elige estilo y pulsa Generar' : 'Elige el fotograma', LIENZO.ancho / 2, LIENZO.alto / 2 + 16)
      }
      const mini = document.createElement('canvas')
      mini.width = 270; mini.height = 360
      mini.getContext('2d').drawImage(c, 0, ZONA_CUADRICULA.y0, LIENZO.ancho, LIENZO.alto - 2 * ZONA_CUADRICULA.y0, 0, 0, 270, 360)
      setPrevia(mini.toDataURL('image/jpeg', 0.8))
    })
    return () => { vivo = false }
  }, [modo, portadaIa, imagen])

  useEffect(() => {
    if (modo === 'ia') return undefined
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
  }, [modo, imagen, encuadre, zoom, texto, resaltada, secundario, plantilla, marca])

  function descargar(tipo) {
    const c = lienzo.current
    if (!c) return
    c.toBlob(b => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `portada-${slug(texto)}${modo === 'ia' ? '-ia' : ''}.${tipo === 'image/png' ? 'png' : 'jpg'}`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }, tipo, 0.92)
  }

  // Las comprobaciones del estudio miden la composición de la plantilla: en
  // una portada con IA no aplican (ahí se avisa de revisar texto y cara).
  const fallos = modo === 'serie' ? checks.filter(c => !c.ok).length : 0
  const palabras = useMemo(() => texto.split(/\s+/).filter(Boolean), [texto])

  return (
    <div className="ag embebido por-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Portadas</button>
          <h1>Crear portada</h1>
          <p>{reel ? String(reel.caption || '').split('\n')[0].slice(0, 140) : inicio === 'mivideo' ? 'Desde un vídeo tuyo' : 'Desde una foto tuya'}</p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}

      <div className="por-taller">
        <div className="por-lienzo-col">
          <canvas ref={lienzo} width={LIENZO.ancho} height={LIENZO.alto} className="por-lienzo" aria-label="Vista previa de la portada" />
          <div className="por-descargas">
            <button type="button" className="ag-btn primario" onClick={() => descargar('image/jpeg')} disabled={modo === 'ia' ? !portadaIa : (!imagen || !texto)}><Download size={14} /> JPG</button>
            <button type="button" className="ag-btn" onClick={() => descargar('image/png')} disabled={modo === 'ia' ? !portadaIa : (!imagen || !texto)}><Download size={14} /> PNG</button>
          </div>
          {portadaIa && <p className="por-ia-badge"><Sparkles size={12} /> Portada generada con IA</p>}
          <small className="por-ayuda">1080×1920. Ponla en la app: el reel → Editar → Portada.</small>
        </div>

        <div className="por-controles">
          <div className="por-modo" role="tablist" aria-label="Cómo hacer la portada">
            <button type="button" role="tab" aria-selected={modo === 'ia'} className={modo === 'ia' ? 'on' : ''} onClick={() => { tocoModo.current = true; setTexto(t => t.slice(0, MAX_TITULO_IA)); setModo('ia') }}><Sparkles size={14} /> Con IA</button>
            <button type="button" role="tab" aria-selected={modo === 'serie'} className={modo === 'serie' ? 'on' : ''} onClick={() => { tocoModo.current = true; setModo('serie') }}><Palette size={14} /> Plantilla de la serie</button>
          </div>

          {modo === 'ia' && !hayPortadaIa && (
            <p className="por-ayuda por-ia-falta">
              <AlertTriangle size={14} /> Para generar portadas con IA hace falta la clave de imagen en el servidor
              (<code>REPLICATE_API_TOKEN</code> en <code>.env.server</code>).
            </p>
          )}

          <section>
            <h3>1 · {modo === 'ia' ? 'Fotograma' : 'Fondo'}</h3>
            <div className="por-pestanas" role="tablist">
              {reel && <button type="button" role="tab" aria-selected={fuente === 'video'} className={fuente === 'video' ? 'on' : ''} onClick={() => elegirFuente('video')}><Film size={14} /> Fotograma</button>}
              {reel && <button type="button" role="tab" aria-selected={fuente === 'actual'} className={fuente === 'actual' ? 'on' : ''} onClick={() => elegirFuente('actual')}><ImagenIcono size={14} /> Portada actual</button>}
              <button type="button" role="tab" aria-selected={fuente === 'mivideo'} className={fuente === 'mivideo' ? 'on' : ''} onClick={() => elegirFuente('mivideo')}><Film size={14} /> Tu vídeo</button>
              <button type="button" role="tab" aria-selected={fuente === 'foto'} className={fuente === 'foto' ? 'on' : ''} onClick={() => elegirFuente('foto')}><Upload size={14} /> Foto</button>
              {modo === 'serie' && <button type="button" role="tab" aria-selected={fuente === 'ia'} className={fuente === 'ia' ? 'on' : ''} onClick={() => elegirFuente('ia')}><Sparkles size={14} /> Fondo IA</button>}
            </div>
            {cargando && <p className="por-ayuda"><Loader2 size={14} className="por-gira" /> {cargando}</p>}
            {fuente === 'video' && videoUrl && (
              <Fotogramas src={videoUrl} tiempo={tiempos.video} onTiempo={ponTiempo('video')} onCaptura={setImagen} />
            )}
            {fuente === 'mivideo' && (
              <>
                <div className="por-video-propio">
                  <label className="por-subir"><Film size={14} /> {miVideo ? 'Cambiar de vídeo' : 'Elegir vídeo'} <input type="file" accept="video/*" onChange={abrirVideo} /></label>
                  {miVideo && <small className="por-ayuda">{miVideo.nombre}</small>}
                  <small className="por-ayuda">Del ordenador o del móvil. El vídeo no se sube: el fotograma se saca aquí, en tu navegador.</small>
                </div>
                {miVideo && (
                  <Fotogramas
                    key={miVideo.url} src={miVideo.url} tiempo={tiempos.mivideo} onTiempo={ponTiempo('mivideo')} onCaptura={setImagen}
                    onFallo={() => setError('Tu navegador no puede abrir este vídeo. Prueba con un MP4, o haz una captura y súbela como foto.')}
                  />
                )}
              </>
            )}
            {fuente === 'foto' && <label className="por-subir"><Upload size={14} /> Elegir foto <input type="file" accept="image/*" onChange={subirFoto} /></label>}
            {modo === 'serie' && fuente === 'ia' && (
              !hayIa ? (
                <p className="por-ayuda por-ia-falta">
                  <AlertTriangle size={14} /> Para generar el fondo con IA hace falta la clave de imagen en el servidor
                  (<code>REPLICATE_API_TOKEN</code> en <code>.env.server</code>). Cuando esté, aparece aquí.
                </p>
              ) : (
                <div className="por-ia">
                  <input
                    type="text" className="por-ia-tema" value={temaIa} maxLength={120}
                    placeholder="Tema del fondo (p. ej. gimnasio al amanecer)"
                    onChange={e => setTemaIa(e.target.value)}
                  />
                  <button type="button" className="ag-btn sm" onClick={sugerirPrompt} disabled={pidiendoPrompt || generandoIa}>
                    {pidiendoPrompt ? <><Loader2 size={13} className="por-gira" /> Pensando…</> : <><Sparkles size={13} /> Sugerir estilo</>}
                  </button>
                  <textarea
                    className="por-ia-prompt" value={promptIa} rows={3} maxLength={1500}
                    placeholder="Describe el fondo (en inglés funciona mejor). Sin texto ni caras."
                    onChange={e => setPromptIa(e.target.value)}
                  />
                  <button type="button" className="ag-btn primario sm" onClick={generarFondoIa} disabled={generandoIa || !promptIa.trim()}>
                    {generandoIa ? <><Loader2 size={13} className="por-gira" /> Generando el fondo…</> : <><Sparkles size={13} /> Generar fondo<span className="por-precio">{etiquetaPrecio(precios)}</span></>}
                  </button>
                  <small className="por-ayuda">El titular lo pone HELM encima, nítido. El fondo es IA: márcalo como tal al publicar.</small>
                </div>
              )
            )}
            {fondoEsIa && <p className="por-ia-badge"><Sparkles size={12} /> Fondo generado con IA</p>}
            {modo === 'serie' && <label>Encuadre vertical <input type="range" min="0" max="1" step="0.01" value={encuadre} onChange={e => setEncuadre(Number(e.target.value))} /></label>}
            {modo === 'serie' && <label>Zoom <input type="range" min="1" max="1.8" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>}
            {modo === 'ia' && <small className="por-ayuda">La IA conserva a la persona de este fotograma: elige uno en el que se te vea bien la cara.</small>}
          </section>

          {modo === 'ia' && (
            <section>
              <h3>2 · Estilo</h3>
              <EstilosIa
                elegido={estiloIa} onElegir={setEstiloIa} ejemplos={ejemplos} marca={marca}
                onSubir={subirEjemplo} onBorrar={borrarEjemplo}
              />
            </section>
          )}

          <section>
            <h3>{modo === 'ia' ? '3' : '2'} · Texto</h3>
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
            <label>Titular <input value={texto} maxLength={modo === 'ia' ? MAX_TITULO_IA : 80} placeholder="2–6 palabras" onChange={e => setTexto(e.target.value)} /></label>
            {modo === 'serie' && (
              <>
                <label>Palabra resaltada
                  <select value={resaltada} onChange={e => setResaltada(e.target.value)}>
                    <option value="">Ninguna</option>
                    {palabras.map((p, i) => <option key={p + i} value={p}>{p}</option>)}
                  </select>
                </label>
                <label>Línea secundaria (opcional) <input value={secundario} maxLength={40} onChange={e => setSecundario(e.target.value)} /></label>
              </>
            )}
            {modo === 'ia' && (
              <label>{estiloIa === 'libre' ? 'Describe el estilo' : 'Detalles (opcional)'}
                <textarea
                  className="por-ia-prompt" rows={3} value={detalle} maxLength={MAX_DETALLE_IA}
                  placeholder={estiloIa === 'libre'
                    ? 'p. ej. fondo negro, título enorme en rojo con brillo, una flecha señalando un portátil'
                    : 'p. ej. las apps que salen, el texto de la notificación, un color…'}
                  onChange={e => setDetalle(e.target.value)}
                />
              </label>
            )}
          </section>

          {modo === 'serie' && (
            <section>
              <h3>3 · Plantilla</h3>
              <div className="por-plantillas">
                {PLANTILLAS.map(p => (
                  <button key={p.id} type="button" className={plantilla === p.id ? 'on' : ''} onClick={() => setPlantilla(p.id)} title={p.desc}>{p.nombre}</button>
                ))}
              </div>
            </section>
          )}

          {modo === 'ia' && (
            <section>
              <h3>4 · Generar</h3>
              <button type="button" className="ag-btn primario" onClick={generarPortada} disabled={generandoPortada || !hayPortadaIa || !imagen || !texto.trim() || texto.trim().length > MAX_TITULO_IA}>
                {generandoPortada
                  ? <><Loader2 size={14} className="por-gira" /> Generando (unos 30 s)…</>
                  : <><Sparkles size={14} /> {versiones.length ? 'Otra versión' : 'Generar portada'}<span className="por-precio">{etiquetaPrecio(precios)}</span></>}
              </button>
              {precios?.paga && (
                <small className="por-ayuda por-saldo">
                  Cada imagen se cobra solo si sale bien.
                  {creditosQueQuedan(precios.saldo) != null && ` Te quedan ${creditosQueQuedan(precios.saldo).toLocaleString('es-ES')} créditos.`}
                </small>
              )}
              {versiones.length > 0 && (
                <div className="por-versiones" aria-label="Versiones generadas">
                  {versiones.map((v, i) => (
                    <button key={i} type="button" className={i === elegida ? 'on' : ''} onClick={() => setElegida(i)} aria-label={`Versión ${i + 1}`}>
                      <img src={v.img.src} alt="" />
                    </button>
                  ))}
                </div>
              )}
              <small className="por-ayuda">
                Revisa que el titular esté bien escrito y que la cara sea la tuya antes de publicarla. Es una imagen hecha con IA:
                márcala como tal si Instagram te lo pide.
              </small>
            </section>
          )}

          <section>
            <h3>{modo === 'ia' ? '5' : '4'} · Así se ve en tu perfil</h3>
            <div className="por-cuadricula" aria-label="La portada en la cuadrícula del perfil">
              {previa && <img src={previa} alt="Tu portada nueva" className="nueva" />}
              {vecinos.map(v => (v.thumb_url ? <img key={v.media_id} src={v.thumb_url} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.visibility = 'hidden' }} /> : <span key={v.media_id} />))}
            </div>
            <ul className="por-checks">
              {modo === 'serie' && checks.map((c, i) => (
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

// Los estilos de la portada con IA: los de serie (con su portada de ejemplo y
// de quién sale) y los ejemplos que el perfil sube a mano, que quedan
// guardados como un estilo más.
function EstilosIa({ elegido, onElegir, ejemplos, marca, onSubir, onBorrar }) {
  const [archivo, setArchivo] = useState(null)
  const [nombre, setNombre] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [fallo, setFallo] = useState('')
  async function subir() {
    if (!archivo || !nombre.trim()) return
    setSubiendo(true); setFallo('')
    try { await onSubir(archivo, nombre.trim()); setArchivo(null); setNombre('') }
    catch (e) { setFallo(e.message) }
    setSubiendo(false)
  }
  return (
    <>
      <ul className="por-estilos">
        {ESTILOS_IA.map(e => {
          // La imagen de ejemplo si la tiene; si no, la vista previa con CSS.
          const img = ejemploDe(e)
          return (
            <li key={e.clave}>
              <button type="button" className={'por-estilo' + (elegido === e.clave ? ' on' : '')} onClick={() => onElegir(e.clave)} title={e.desc}>
                {e.clave === 'libre'
                  ? <span className="por-estilo-libre"><Sparkles size={22} /></span>
                  : img ? <img src={img} alt="" loading="lazy" /> : <VistaEstilo estilo={e} marca={marca} />}
                <b>{e.nombre}</b>
                <small>
                  {e.origen ? `@${e.origen.perfil}`
                    : e.para?.length ? `Como ${e.para.slice(0, 2).map(p => p.nombre).join(' o ')}`
                      : e.clave === 'libre' ? 'Lo describes tú' : 'Estilo de la casa'}
                </small>
              </button>
            </li>
          )
        })}
        {ejemplos.map(e => (
          <li key={e.id}>
            <button type="button" className={'por-estilo' + (elegido === `ej:${e.id}` ? ' on' : '')} onClick={() => onElegir(`ej:${e.id}`)} title="Tu ejemplo">
              <img src={e.url} alt="" loading="lazy" />
              <b>{e.nombre}</b>
              <small>Tu ejemplo</small>
            </button>
            <button type="button" className="por-estilo-quitar" onClick={() => onBorrar(e)} aria-label={`Quitar el ejemplo ${e.nombre}`}><X size={12} /></button>
          </li>
        ))}
        <li>
          <label className="por-estilo por-estilo-subir">
            <span className="por-estilo-libre"><Plus size={22} /></span>
            <b>Subir ejemplo</b>
            <small>Una portada que te guste</small>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={ev => { setArchivo(ev.target.files?.[0] || null); setFallo(''); ev.target.value = '' }} />
          </label>
        </li>
      </ul>
      {archivo && (
        <div className="por-subir-ejemplo">
          <small>{archivo.name}</small>
          <input value={nombre} maxLength={MAX_NOMBRE_EJEMPLO} placeholder="Nombre del estilo (p. ej. Dorado Mercury)" onChange={ev => setNombre(ev.target.value)} />
          <button type="button" className="ag-btn primario sm" onClick={subir} disabled={subiendo || !nombre.trim()}>
            {subiendo ? <><Loader2 size={13} className="por-gira" /> Subiendo…</> : 'Guardar ejemplo'}
          </button>
          <button type="button" className="ag-btn sm" onClick={() => { setArchivo(null); setNombre('') }}>Cancelar</button>
        </div>
      )}
      {fallo && <p className="ag-error">{fallo}</p>}
      {(() => {
        const e = ESTILOS_IA.find(x => x.clave === elegido)
        return e ? (
          <p className="por-ayuda">
            {e.desc}
            {e.consejo && <> {e.consejo}</>}
            {e.origen && <> · <a href={e.origen.reel} target="_blank" rel="noopener noreferrer">ver el reel de @{e.origen.perfil} <ExternalLink size={11} /></a></>}
            {e.para?.length > 0 && (
              <small className="por-estilo-para">
                Lo usan, como referencia:{' '}
                {e.para.map((p, i) => (
                  <span key={p.enlace}>{i ? ', ' : ''}<a href={p.enlace} target="_blank" rel="noopener noreferrer">{p.nombre}</a></span>
                ))}
                {e.aproximado ? ' (aproximado: sacado de sus perfiles públicos)' : ''}.
                {e.ejemploReel && <> La portada de ejemplo es de un <a href={e.ejemploReel.url} target="_blank" rel="noopener noreferrer">reel de {e.ejemploReel.de}</a>.</>}
                {' '}Solo se copia cómo montan la portada: nunca su cara, su logo ni su marca.
              </small>
            )}
          </p>
        ) : null
      })()}
    </>
  )
}

