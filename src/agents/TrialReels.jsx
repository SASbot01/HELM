// HELM — Trial reels. La ventana del agente de variantes dentro de Agentes.
//
// Tus reels ya publicados y, en cada uno, «Crear variantes»: HELM monta 2–3
// versiones editadas del mismo reel (otro arranque, otro gancho, otro
// encuadre) para volver a probar la idea como «Reel de prueba» de Instagram.
// El gancho se compone aquí, en el navegador, con el kit de Portadas; el
// montaje lo hace el servidor con ffmpeg (api/trial-reels.js) y aquí se
// espera, se ve cómo va y se descarga.
//
// El vídeo de partida sale de la cuenta de Instagram conectada del perfil o,
// desde el 27-oct, de un MP4/MOV que subes tú («Subir un vídeo»): se sube por
// trozos (src/helm/subida.js) y se queda 7 días en el servidor para sacar
// variantes. Sin caption, los ganchos se escriben a mano (o se proponen si
// cuentas de qué va el vídeo).
//
// HELM no publica (la app no tiene permiso): se sube en la app de Instagram.
// Cada variante cuesta 30 créditos, a precio fijo, y solo se cobra si sale
// bien; el precio se ve en el botón antes de crear (en la agencia de la casa es
// gratis). «Proponer ganchos» gasta créditos por lo que use la IA.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Sparkles, Download, Loader2, FlaskConical, Trash2, AlertTriangle, Check, Clock, FlipHorizontal2, Info, Upload, Film, X,
} from 'lucide-react'
import { supabase } from '../utils/supabase'
import { portadasApi, trialReelsApi, creditosApi } from '../helm/lib'
import { aCreditos } from '../helm/precios'
import { subePorTrozos } from '../helm/subida'
import { MARCA_POR_DEFECTO, normalizaMarca, LETRAS } from './portadas/reglas'
import {
  ajustesDeVariante, tramos, esReel, palabrasDe, RANGOS, ARRANQUES, COLORES, ESTILOS_GANCHO, MAX_VARIANTES, LIENZO,
} from './trialreels/reglas'
import { lienzoGancho, pintaVistaPrevia } from './trialreels/gancho'
import { capturador } from './portadas/fotograma'
import '../fonts/barlow-condensed.css'
import '../fonts/inter-tight.css'
import './trialreels.css'

const fecha = (t) => { try { return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) } catch { return '' } }
const miles = (n) => (Number(n) || 0).toLocaleString('es-ES')
const seg = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`)
const mb = (b) => (b ? `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB` : '')
const ESTADOS = {
  en_cola: { txt: 'En cola', Icono: Clock },
  procesando: { txt: 'Montando…', Icono: Loader2 },
  listo: { txt: 'Lista', Icono: Check },
  error: { txt: 'Error', Icono: AlertTriangle },
}
// El PNG del gancho que se manda con cada variante (el servidor corta en 4 MB).
const MAX_PNG_DATAURL = 5_400_000
// Los topes de un vídeo subido: los mismos que api/_lib/variantes.js
// (MAX_VIDEO, MAX_DURACION_FUENTE). Aquí solo para avisar antes de subir: el
// que manda es el servidor, que lo vuelve a mirar con ffprobe.
const MAX_MB_SUBIDA = 200
const MAX_SEGUNDOS_SUBIDA = 300
const TIPOS_PROPIOS = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp']
const VIDEO_PROPIO = /\.(mp4|mov|m4v|3gp)$/i
// Lo que el servidor contesta cuando repetir no arregla nada: la subida falló
// del todo (410), pesa demasiado (413), no es un vídeo (415) o no se puede leer
// (422). Lo demás (la red, el servidor ocupado, sin saldo…) se puede reintentar.
const SIN_ARREGLO = new Set([410, 413, 415, 422])

/**
 * Lo que va en el botón de crear: «· 90 créditos», «· gratis» o nada mientras
 * no se sabe. «Gratis» a secas: no pagan ni la agencia de la casa ni un perfil
 * sin agencia, y creditosApi.precios no dice cuál de los dos es.
 */
function etiquetaPrecio(precios, n) {
  if (!precios || !n) return ''
  if (!precios.paga) return ' · gratis'
  const euros = precios.precios?.['trial-reel']
  return euros > 0 ? ` · ${aCreditos(euros * n).toLocaleString('es-ES')} créditos` : ''
}

/** Por qué no vale este archivo, o '' si vale (tipo y peso; la duración se mira al abrirlo). */
function falloDeArchivo(f) {
  if (!f) return 'Elige un vídeo'
  const tipo = String(f.type || '').toLowerCase()
  if (!TIPOS_PROPIOS.includes(tipo) && !(tipo === '' && VIDEO_PROPIO.test(f.name || ''))) {
    return 'Sube un vídeo MP4 o MOV (lo que graba el móvil). Si es de otro tipo, expórtalo como MP4.'
  }
  if (f.size > MAX_MB_SUBIDA * 1024 * 1024) return `El vídeo pesa más de ${MAX_MB_SUBIDA} MB.`
  if (!f.size) return 'El vídeo está vacío.'
  return ''
}

/** Lo que dura un vídeo local, leído por el navegador (null si no lo sabe leer). */
function duracionDe(url) {
  return new Promise((ok) => {
    const v = document.createElement('video')
    let hecho = false
    const fin = (d) => { if (hecho) return; hecho = true; clearTimeout(reloj); v.removeAttribute('src'); ok(d) }
    const reloj = setTimeout(() => fin(null), 10_000)
    v.preload = 'metadata'
    v.muted = true
    v.onloadedmetadata = () => fin(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null)
    v.onerror = () => fin(null)
    v.src = url
  })
}

/** Las variantes y los vídeos subidos del perfil, y mientras haya algo en marcha, cada 3 s. */
function useTrabajos(clientId) {
  const [trabajos, setTrabajos] = useState(null)
  const [fuentes, setFuentes] = useState([])
  const [error, setError] = useState('')
  const recargar = useCallback(
    () => trialReelsApi.lista(clientId)
      .then(d => { setTrabajos(d.trabajos || []); setFuentes(d.fuentes || []); setError('') })
      .catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { recargar() }, [recargar])
  const enMarcha = (trabajos || []).some(t => t.estado === 'en_cola' || t.estado === 'procesando')
  useEffect(() => {
    if (!enMarcha) return undefined
    const reloj = setInterval(recargar, 3000)
    return () => clearInterval(reloj)
  }, [enMarcha, recargar])
  return { trabajos, fuentes, error, recargar }
}

/**
 * La subida de un vídeo propio. Vive en la ventana del agente (no en el
 * taller) para que siga aunque vuelvas a la lista; se corta si sales del
 * agente. Se lanza desde el clic, no desde un efecto (en desarrollo React
 * monta dos veces y se crearían dos subidas).
 *   subida = { archivo, url (para verlo aquí), fuente, fraccion, estado, error, reintentable }
 *   estado: preparando · subiendo · lista · error
 * «Reintentar» sigue la MISMA subida (el mismo fuenteId) desde lo que ya tiene
 * el servidor: un vídeo de 200 MB cortado al 90 % no vuelve a empezar. Cancelar,
 * elegir otro vídeo o salir del agente quitan del servidor lo que no llegó
 * entero (si no, se quedaría «subiendo» y taparía el hueco de otra subida).
 */
function useSubida(clientId, recargar) {
  const [subida, setSubida] = useState(null)
  const control = useRef(null)
  // La subida de ahora, para soltarla al salir: { fuenteId, completa }.
  const actual = useRef(null)
  useEffect(() => () => { if (subida?.url) URL.revokeObjectURL(subida.url) }, [subida?.url])

  // Corta la subida en curso y, si no llegó entera, la quita del servidor.
  const soltar = useCallback(() => {
    control.current?.abort()
    control.current = null
    const a = actual.current
    actual.current = null
    if (a?.fuenteId && !a.completa) trialReelsApi.borrarFuente(clientId, a.fuenteId).catch(() => {})
  }, [clientId])
  useEffect(() => () => soltar(), [soltar])

  // Sube `archivo`. Con `previa` (un reintento), sigue esa subida desde lo que
  // tiene el servidor; si ya no está o falló allí, empieza otra.
  const subir = useCallback(async (archivo, url, previa = null) => {
    control.current?.abort()
    const c = new AbortController()
    control.current = c
    const pon = (cambios) => { if (control.current === c) setSubida(s => (s ? { ...s, ...cambios } : s)) }
    let fuente = previa
    try {
      let desde = 0
      if (fuente) {
        pon({ estado: 'subiendo', error: '' })
        try {
          const r = await trialReelsApi.recibidos(clientId, fuente.id)
          if (r?.estado === 'subiendo' || r?.estado === 'lista') desde = Number(r.recibidos) || 0
          else throw new Error('falló en el servidor')
        } catch {
          // Ya no está, o falló allí: se empieza otra (y la de antes, fuera).
          trialReelsApi.borrarFuente(clientId, fuente.id).catch(() => {})
          fuente = null
        }
        if (c.signal.aborted) return
      }
      if (!fuente) {
        pon({ estado: 'preparando', error: '' })
        const duracion = await duracionDe(url)
        if (duracion != null && duracion > MAX_SEGUNDOS_SUBIDA + 0.5) {
          throw Object.assign(new Error(`El vídeo dura más de ${MAX_SEGUNDOS_SUBIDA / 60} minutos.`), { status: 413 })
        }
        const d = await trialReelsApi.fuente(clientId, { nombre: archivo.name, bytes: archivo.size, tipo: archivo.type, duracion })
        fuente = d.fuente || { id: d.fuenteId, nombre: archivo.name, estado: 'subiendo', disponible: false }
        // Cancelada mientras se apuntaba: no se queda colgada en el servidor.
        if (c.signal.aborted) { trialReelsApi.borrarFuente(clientId, fuente.id).catch(() => {}); return }
      }
      actual.current = { fuenteId: fuente.id, completa: false }
      pon({ fuente, estado: 'subiendo' })
      const r = await subePorTrozos({
        url: trialReelsApi.urlTrozo(clientId, fuente.id), archivo, senal: c.signal, desde,
        alProgreso: (fraccion) => pon({ fraccion }),
      })
      if (actual.current?.fuenteId === fuente.id) actual.current.completa = true
      pon({ fuente: r?.fuente || { ...fuente, estado: 'lista', disponible: true }, fraccion: 1, estado: 'lista' })
      recargar()
    } catch (e) {
      if (e?.cancelada || c.signal.aborted) return
      pon({ estado: 'error', error: e.message, fuente, reintentable: !SIN_ARREGLO.has(e?.status) })
    }
  }, [clientId, recargar])

  const empezar = useCallback((archivo) => {
    soltar()
    const url = URL.createObjectURL(archivo)
    setSubida({ archivo, url, fuente: null, fraccion: 0, estado: 'preparando', error: '', reintentable: false })
    return subir(archivo, url)
  }, [soltar, subir])

  const reintentar = useCallback(() => {
    if (!subida?.archivo) return undefined
    return subir(subida.archivo, subida.url, subida.fuente?.id ? subida.fuente : null)
  }, [subida, subir])

  const cancelar = useCallback(() => { soltar(); setSubida(null) }, [soltar])
  return { subida, empezar, reintentar, cancelar }
}

export default function TrialReels({ clientId, client, onVolver }) {
  const [reels, setReels] = useState(null)
  const [error, setError] = useState('')
  const [marca, setMarca] = useState(MARCA_POR_DEFECTO)
  // null: la lista · { reel } · { subida: true } (el vídeo que se está subiendo) · { fuente } (uno subido antes)
  const [elegido, setElegido] = useState(null)
  const { trabajos, fuentes, error: errorTrabajos, recargar } = useTrabajos(clientId)
  const { subida, empezar, reintentar, cancelar } = useSubida(clientId, recargar)

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

  function abrirArchivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const fallo = falloDeArchivo(f)
    if (fallo) { setError(fallo); return }
    setError('')
    empezar(f)
    setElegido({ subida: true })
  }

  if (elegido) {
    const fuente = elegido.subida ? subida?.fuente : elegido.fuente
    return (
      <Taller
        key={elegido.reel?.media_id || elegido.fuente?.id || 'subida'}
        clientId={clientId} reel={elegido.reel || null} fuente={fuente || null} subida={elegido.subida ? subida : null}
        marca={marca}
        trabajos={(trabajos || []).filter(t => (elegido.reel ? t.mediaId === elegido.reel.media_id : Boolean(fuente?.id) && t.fuenteId === fuente.id))}
        recargar={recargar} onVolver={() => setElegido(null)}
        onReintentar={reintentar}
        onCancelar={() => { cancelar(); setElegido(null) }}
      />
    )
  }

  const porReel = new Map((reels || []).map(r => [r.media_id, r]))
  const porFuente = new Map((fuentes || []).map(f => [f.id, f]))
  return (
    <div className="ag embebido tr-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Agentes</button>
          <h1>Trial reels</h1>
          <p>
            Vuelve a probar los reels de {client?.name || 'este perfil'} como «Reel de prueba»: HELM monta 2 o 3 versiones del mismo
            vídeo con otro arranque, otro gancho y otro encuadre, y tú las subes desde la app.
          </p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}
      {errorTrabajos && <p className="ag-error">{errorTrabajos}</p>}
      <ComoFunciona />

      <div className="tr-acciones">
        <label className="ag-btn tr-subir">
          <Upload size={14} /> Subir un vídeo
          <input type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/3gpp,.mp4,.mov,.m4v,.3gp" onChange={abrirArchivo} />
        </label>
        <small className="tr-ayuda">Un MP4 o MOV tuyo, del ordenador o del móvil (hasta {MAX_MB_SUBIDA} MB y {MAX_SEGUNDOS_SUBIDA / 60} minutos). No hace falta tener Instagram conectado.</small>
      </div>

      {subida && (
        <div className={`tr-subida ${subida.estado}`}>
          <Film size={14} />
          <span className="tr-subida-txt">
            <b>{subida.archivo?.name}</b>
            <small>{textoSubida(subida)}</small>
          </span>
          <button type="button" className="ag-btn sm" onClick={() => setElegido({ subida: true })}>Abrir</button>
        </div>
      )}

      {(trabajos || []).length > 0 && (
        <section className="tr-bloque">
          <h3>Tus variantes</h3>
          <ListaTrabajos clientId={clientId} trabajos={trabajos} recargar={recargar} reelDe={(id) => porReel.get(id)} fuenteDe={(id) => porFuente.get(id)} />
        </section>
      )}

      {(fuentes || []).length > 0 && (
        <section className="tr-bloque">
          <h3>Tus vídeos subidos</h3>
          <ListaFuentes
            clientId={clientId} fuentes={fuentes} recargar={recargar} onUsar={(f) => setElegido({ fuente: f })}
            sesion={subida?.fuente?.id ? { id: subida.fuente.id, estado: subida.estado } : null} onCancelarEnCurso={cancelar}
          />
        </section>
      )}

      <h3 className="tr-titulo">Elige un reel</h3>
      {reels == null ? <p className="tr-ayuda"><Loader2 size={14} className="tr-gira" /> Cargando tus reels…</p>
        : !reels.length ? (
          <p className="tr-ayuda">
            Aún no hay reels de este perfil. Conecta Instagram en <b>Ajustes → Instagram</b> y, cuando sincronice, aquí salen
            todos. Mientras, puedes subir un vídeo tuyo con «Subir un vídeo».
          </p>
        ) : (
          <ul className="tr-reels">
            {reels.map(r => (
              <li key={r.media_id} className="tr-reel">
                <Miniatura reel={r} />
                <div className="tr-reel-txt">
                  <small>{fecha(r.publicado_en)} · {miles(r.visitas)} visualizaciones</small>
                  <p>{String(r.caption || '').split('\n')[0].slice(0, 110) || 'Sin caption'}</p>
                </div>
                <button type="button" className="ag-btn primario sm" onClick={() => setElegido(r)}><FlaskConical size={13} /> Crear variantes</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

function ComoFunciona() {
  const [abierto, setAbierto] = useState(false)
  return (
    <section className="tr-explica">
      <button type="button" className="tr-explica-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
        <Info size={16} /> <b>Cómo funciona</b> <span>{abierto ? 'Cerrar' : 'Leer'}</span>
      </button>
      {abierto && (
        <div className="tr-explica-txt">
          <p>
            Un <b>Reel de prueba</b> de Instagram se enseña primero solo a gente que no te sigue. Sirve para volver a probar una idea
            sin llenar tu perfil de repetidos: si funciona, la compartes con tus seguidores.
          </p>
          <p>
            Instagram reconoce un vídeo que ya está publicado comparando su huella de imagen y de sonido, y subir el mismo tal cual
            no prueba nada nuevo. Por eso cada variante cambia lo que de verdad decide un reel: <b>cómo arranca</b>, <b>el gancho</b> de
            los primeros segundos y <b>el encuadre</b> (y, de propina, un poco el color y la velocidad). Eso es justo lo que merece la
            pena probar.
          </p>
          <p>
            <b>HELM no las publica</b>: la app no tiene permiso para publicar en tu cuenta. Descarga la variante y súbela desde la app
            de Instagram como reel nuevo; al compartir, activa la opción <b>«Reel de prueba»</b>. Solo se usan tus propios vídeos: los
            reels de tu cuenta conectada o los que subas tú. Las variantes y los vídeos subidos se guardan 7 días.
          </p>
        </div>
      )}
    </section>
  )
}

/** Cómo va la subida, en una línea. */
function textoSubida(s) {
  if (!s) return ''
  if (s.estado === 'preparando') return 'Preparando la subida…'
  if (s.estado === 'subiendo') return `Subiendo… ${Math.round((s.fraccion || 0) * 100)} %`
  if (s.estado === 'lista') return 'Subido. Ya puedes crear las variantes.'
  return `No se pudo subir: ${s.error || 'error'}`
}

/**
 * Cómo se enseña un vídeo subido en la lista. El de la subida de esta pestaña
 * (`sesion` = { id, estado }) manda lo que dice ella: subiendo mientras sube, y
 * «Cortada» si se cortó aquí. Los demás, lo que dice el servidor (que da por
 * «cortada» la que no se mueve desde hace un rato).
 */
function estadoFuente(f, sesion = null) {
  const mia = Boolean(sesion?.id) && sesion.id === f.id
  if (mia && (sesion.estado === 'preparando' || sesion.estado === 'subiendo')) return 'subiendo'
  if (mia && sesion.estado === 'error' && f.estado === 'subiendo') return 'cortada'
  if (f.estado === 'lista') return f.disponible ? 'lista' : 'caducada'
  return ['subiendo', 'cortada'].includes(f.estado) ? f.estado : 'error'
}
const ETIQUETA_FUENTE = { lista: 'Lista', subiendo: 'Subiendo', cortada: 'Cortada', caducada: 'Caducado', error: 'Error' }

// Los vídeos que el perfil ha subido (se guardan 7 días): de cada uno se
// pueden sacar más variantes, o quitarlo. Quitar el que se está subiendo aquí
// es cancelar su subida.
function ListaFuentes({ clientId, fuentes, recargar, onUsar, sesion = null, onCancelarEnCurso }) {
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  async function borrar(f) {
    if (!window.confirm(`¿Quitar el vídeo «${f.nombre}»? Las variantes que ya hiciste se quedan.`)) return
    setOcupado(f.id); setError('')
    try {
      // La que se está subiendo aquí: se cancela (y cancelar la quita del servidor).
      if (sesion?.id === f.id && sesion.estado !== 'lista') onCancelarEnCurso?.()
      else {
        await trialReelsApi.borrarFuente(clientId, f.id)
        if (sesion?.id === f.id) onCancelarEnCurso?.()
      }
      await recargar()
    } catch (e) { setError(e.message) }
    setOcupado('')
  }
  return (
    <>
      {error && <p className="ag-error">{error}</p>}
      <ul className="tr-trabajos">
        {fuentes.map(f => {
          const estado = estadoFuente(f, sesion)
          const usable = estado === 'lista'
          return (
            <li key={f.id} className={`tr-trabajo ${usable ? 'listo' : estado === 'subiendo' ? 'procesando' : 'error'}`}>
              <span className="tr-estado"><Film size={14} /> {ETIQUETA_FUENTE[estado]}</span>
              <div className="tr-trabajo-txt">
                <b>{f.nombre}</b>
                <small>{fecha(f.creado)}{f.duracion ? ` · ${seg(f.duracion)}` : ''}{f.bytes ? ` · ${mb(f.bytes)}` : ''}</small>
                {estado === 'error' && f.error && <small className="tr-mal">{f.error}</small>}
                {estado === 'cortada' && (
                  <small className="tr-mal">
                    {sesion?.id === f.id ? 'La subida se cortó: reintenta desde el taller («Abrir») o quítala.' : (f.error || 'La subida se cortó a medias. Quítala y vuelve a subir el vídeo.')}
                  </small>
                )}
                {f.estado === 'lista' && !f.disponible && <small className="tr-mal">Ya no está: se guardan 7 días.</small>}
              </div>
              <div className="tr-trabajo-acc">
                {usable && <button type="button" className="ag-btn primario sm" onClick={() => onUsar(f)}><FlaskConical size={13} /> Crear variantes</button>}
                <button type="button" className="ag-btn sm peligro" onClick={() => borrar(f)} disabled={ocupado === f.id} aria-label={`Quitar el vídeo ${f.nombre}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Miniatura({ reel }) {
  const [rota, setRota] = useState(false)
  return (
    <div className="tr-mini">
      {reel?.thumb_url && !rota
        ? <img src={reel.thumb_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} />
        : <span>Portada no disponible ahora</span>}
    </div>
  )
}

function ListaTrabajos({ clientId, trabajos, recargar, reelDe, fuenteDe }) {
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  async function descargar(t) {
    setOcupado(t.id); setError('')
    try {
      const b = await trialReelsApi.descarga(clientId, t.id)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `trial-reel-${String(t.creado || '').slice(0, 10)}-v${t.variante}.mp4`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (e) { setError(e.message) }
    setOcupado('')
  }
  async function borrar(t) {
    setOcupado(t.id); setError('')
    try { await trialReelsApi.borrar(clientId, t.id); await recargar() } catch (e) { setError(e.message) }
    setOcupado('')
  }

  return (
    <>
      {error && <p className="ag-error">{error}</p>}
      <ul className="tr-trabajos">
        {trabajos.map(t => {
          const e = ESTADOS[t.estado] || ESTADOS.error
          const reel = t.mediaId ? reelDe?.(t.mediaId) : null
          const subido = t.fuenteId ? fuenteDe?.(t.fuenteId) : null
          const a = t.ajustes || {}
          return (
            <li key={t.id} className={`tr-trabajo ${t.estado}`}>
              <span className="tr-estado"><e.Icono size={14} className={t.estado === 'procesando' ? 'tr-gira' : ''} /> {e.txt}</span>
              <div className="tr-trabajo-txt">
                <b>Variante {t.variante}{a.ganchoTexto ? ` · «${a.ganchoTexto}»` : ''}</b>
                <small>
                  {reel ? `${String(reel.caption || '').split('\n')[0].slice(0, 60) || 'Reel'} · ` : ''}
                  {subido ? `${subido.nombre} · ` : ''}
                  {fecha(t.creado)}
                  {t.estado === 'listo' && ` · ${seg(t.duracion)} · ${mb(t.bytes)}`}
                  {t.cobrado > 0 && ` · ${aCreditos(t.cobrado)} créditos`}
                </small>
                {t.estado === 'error' && t.error && <small className="tr-mal">{t.error}</small>}
                {t.estado === 'listo' && !t.disponible && <small className="tr-mal">Ya no está: se guardan 7 días.</small>}
              </div>
              <div className="tr-trabajo-acc">
                {t.estado === 'listo' && t.disponible && (
                  <button type="button" className="ag-btn primario sm" onClick={() => descargar(t)} disabled={ocupado === t.id}>
                    {ocupado === t.id ? <Loader2 size={13} className="tr-gira" /> : <Download size={13} />} MP4
                  </button>
                )}
                <button type="button" className="ag-btn sm peligro" onClick={() => borrar(t)} disabled={ocupado === t.id} aria-label={`Borrar la variante ${t.variante}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// El taller de variantes. El vídeo de partida es un reel de Instagram (`reel`)
// o uno subido: el que se está subiendo ahora (`subida`, que se ve desde el
// archivo local mientras sube) o uno de antes (`fuente`, que se pide al
// servidor para la vista previa).
function Taller({ clientId, reel, fuente, subida, marca, trabajos, recargar, onVolver, onReintentar, onCancelar }) {
  const lienzo = useRef(null)
  const oculto = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [duracion, setDuracion] = useState(0)
  const [cargando, setCargando] = useState(subida ? '' : 'Descargando el vídeo…')
  const [error, setError] = useState('')
  // La semilla de los ajustes de partida: la misma para el mismo vídeo.
  const [semilla] = useState(() => reel?.media_id || fuente?.id || `subido:${subida?.archivo?.name}:${subida?.archivo?.size}`)
  const [variantes, setVariantes] = useState(() =>
    Array.from({ length: MAX_VARIANTES }, (_, i) => ({ incluida: true, ajustes: ajustesDeVariante(semilla, i) })))
  const [activa, setActiva] = useState(0)
  const [fotograma, setFotograma] = useState(null)
  const [opciones, setOpciones] = useState(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState('')
  // El navegador no sabe enseñar el vídeo (un MOV HEVC en Chrome, un 3GP…): el servidor sí lo lee.
  const [sinVista, setSinVista] = useState(false)
  // Un vídeo subido no tiene caption: lo que cuentes de él sirve para proponer ganchos.
  const [tema, setTema] = useState('')
  // Lo que cuesta cada variante y si este perfil paga (creditosApi.precios).
  const [precios, setPrecios] = useState(null)
  useEffect(() => {
    let vivo = true
    creditosApi.precios(clientId).then(d => { if (vivo) setPrecios(d) }).catch(() => {})
    return () => { vivo = false }
  }, [clientId])

  const a = variantes[activa].ajustes
  const plan = useMemo(() => tramos(a, duracion), [a, duracion])
  const cambia = (k, v) => setVariantes(vs => vs.map((x, i) => (i === activa ? { ...x, ajustes: { ...x.ajustes, [k]: v } } : x)))
  const incluye = (i, si) => setVariantes(vs => vs.map((x, j) => (j === i ? { ...x, incluida: si } : x)))

  // El vídeo se baja una vez al entrar, por HELM (el CDN de Meta no deja
  // leerlo desde el navegador; el subido, del servidor), y se suelta al salir.
  // El que se está subiendo se ve desde el archivo local (lo suelta la subida).
  const idFuente = subida ? null : fuente?.id
  useEffect(() => {
    if (!reel && !idFuente) return undefined
    let vivo = true
    let url = ''
    const pide = reel ? portadasApi.video(clientId, reel.media_id) : trialReelsApi.videoFuente(clientId, idFuente)
    pide
      .then(b => { url = URL.createObjectURL(b); if (vivo) setVideoUrl(url); else URL.revokeObjectURL(url) })
      .catch(e => { if (vivo) setError(`${e.message}. Sin el vídeo no se ve la vista previa, pero las variantes se pueden crear igual.`) })
      .finally(() => { if (vivo) setCargando('') })
    return () => { vivo = false; if (url) URL.revokeObjectURL(url) }
  }, [clientId, reel, idFuente])

  // El primer fotograma de la variante activa: el del avance o el del recorte.
  const instante = plan.avance ? plan.avance.desde : plan.principal.desde
  useEffect(() => {
    const v = oculto.current
    if (!v || !duracion) return
    v.currentTime = Math.min(Math.max(0, duracion - 0.05), instante + 0.04)
  }, [instante, duracion])
  // Reducido y con dos lienzos que se turnan (un 4K del móvil agotaba la
  // memoria de canvas en iOS): portadas/fotograma.js. Sin lienzo, el de antes.
  const [captura] = useState(() => capturador())
  const capturar = useCallback(() => {
    const c = captura(oculto.current)
    if (c) setFotograma(c)
  }, [captura])

  // La vista previa: cada cambio vuelve a pintarla entera (es un instante).
  useEffect(() => {
    let vivo = true
    lienzoGancho({ texto: a.ganchoTexto, resaltada: a.ganchoResaltada, estilo: a.ganchoEstilo, marca }).then(gancho => {
      const c = lienzo.current
      if (!vivo || !c) return
      pintaVistaPrevia(c.getContext('2d'), { fotograma, ajustes: a, gancho })
    })
    return () => { vivo = false }
  }, [fotograma, a, marca])

  async function proponer() {
    setPidiendo(true); setError('')
    try {
      const d = await trialReelsApi.ganchos(clientId, reel ? reel.media_id : null, reel ? undefined : tema.trim())
      setOpciones(d.opciones)
      // Si las variantes aún no tienen gancho, uno distinto a cada una.
      setVariantes(vs => vs.map((x, i) => (x.ajustes.ganchoTexto || !d.opciones[i] ? x
        : { ...x, ajustes: { ...x.ajustes, ganchoTexto: d.opciones[i].texto, ganchoResaltada: d.opciones[i].resaltada } })))
    } catch (e) { setError(e.message) }
    setPidiendo(false)
  }

  async function crear() {
    setCreando(true); setError(''); setAviso('')
    try {
      const cuerpo = []
      for (const [i, v] of variantes.entries()) {
        if (!v.incluida) continue
        const g = await lienzoGancho({ texto: v.ajustes.ganchoTexto, resaltada: v.ajustes.ganchoResaltada, estilo: v.ajustes.ganchoEstilo, marca })
        const png = g ? g.toDataURL('image/png') : null
        if (png && png.length > MAX_PNG_DATAURL) throw new Error(`El gancho de la variante ${i + 1} pesa demasiado`)
        cuerpo.push({ ajustes: v.ajustes, ganchoPng: png })
      }
      if (!cuerpo.length) throw new Error('Marca al menos una variante')
      await trialReelsApi.crear(clientId, reel ? reel.media_id : { fuenteId: fuente.id }, cuerpo)
      setAviso(`${cuerpo.length === 1 ? 'La variante está' : `Las ${cuerpo.length} variantes están`} en marcha. Tarda un par de minutos; puedes salir y volver.`)
      await recargar()
    } catch (e) { setError(e.message) }
    setCreando(false)
  }

  const palabras = palabrasDe(a.ganchoTexto)
  const elegidas = variantes.filter(v => v.incluida).length
  const enMarcha = trabajos.some(t => t.estado === 'en_cola' || t.estado === 'procesando')
  // El que se está subiendo se ve desde el archivo local; los demás, desde lo bajado.
  const urlVideo = subida?.url || videoUrl
  // Con un vídeo subido, se crea cuando ha llegado entero.
  const listo = Boolean(reel) || (fuente?.estado === 'lista' && (!subida || subida.estado === 'lista'))
  const titulo = reel
    ? String(reel.caption || '').split('\n')[0].slice(0, 140) || 'Reel sin caption'
    : `Tu vídeo: ${subida?.archivo?.name || fuente?.nombre || 'vídeo subido'}`

  return (
    <div className="ag embebido tr-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Trial reels</button>
          <h1>Crear variantes</h1>
          <p>{titulo}</p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}
      {subida && (
        <div className={`tr-subida ${subida.estado}`} role="status">
          <Film size={14} />
          <span className="tr-subida-txt">
            <b>{textoSubida(subida)}</b>
            {(subida.estado === 'preparando' || subida.estado === 'subiendo') && (
              <>
                <span className="tr-barra"><i style={{ width: `${Math.round((subida.fraccion || 0) * 100)}%` }} /></span>
                <small>Puedes ir preparando las variantes mientras sube. Si sales de Trial reels, la subida se corta y no se guarda nada.</small>
              </>
            )}
          </span>
          {subida.estado === 'error' && subida.reintentable && <button type="button" className="ag-btn sm" onClick={onReintentar}>Reintentar</button>}
          {subida.estado !== 'lista' && (
            <button type="button" className="ag-btn sm" onClick={onCancelar} aria-label="Cancelar la subida"><X size={13} /></button>
          )}
        </div>
      )}

      <div className="tr-taller">
        <div className="tr-col-previa">
          <canvas ref={lienzo} width={LIENZO.ancho} height={LIENZO.alto} className="tr-lienzo" aria-label={`Así empieza la variante ${activa + 1}`} />
          <small className="tr-ayuda">
            Así empieza la variante {activa + 1}{plan.salida != null ? ` · durará ${seg(plan.salida)}` : ''}. El color es aproximado.
          </small>
          {cargando && <p className="tr-ayuda"><Loader2 size={14} className="tr-gira" /> {cargando}</p>}
          {urlVideo && (
            <>
              <video
                ref={oculto} src={urlVideo} muted playsInline preload="auto" className="tr-oculto"
                onLoadedMetadata={e => { setSinVista(false); setDuracion(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0) }} onSeeked={capturar}
                onError={() => setSinVista(true)}
              />
              {sinVista ? (
                <p className="tr-mal" role="status">
                  Tu navegador no puede enseñar este vídeo, así que no hay vista previa. Las variantes se pueden crear igual: el servidor sí lo lee.
                </p>
              ) : (
                <details className="tr-original">
                  <summary>Ver el original</summary>
                  <video src={urlVideo} controls playsInline preload="metadata" onError={() => setSinVista(true)} />
                </details>
              )}
            </>
          )}
          <button type="button" className="ag-btn primario tr-crear" onClick={crear} disabled={creando || !elegidas || !listo}>
            {creando
              ? <><Loader2 size={14} className="tr-gira" /> Preparando…</>
              : <><FlaskConical size={14} /> Crear {elegidas === 1 ? 'la variante' : `${elegidas} variantes`}<span className="tr-precio">{etiquetaPrecio(precios, elegidas)}</span></>}
          </button>
          {precios?.paga && <small className="tr-ayuda">Cada variante se cobra solo si sale bien; si falla, no cuesta nada.</small>}
          {!listo && subida && <small className="tr-ayuda">Se puede crear cuando el vídeo haya terminado de subir.</small>}
          {aviso && <p className="tr-ok">{aviso}</p>}
        </div>

        <div className="tr-controles">
          <div className="tr-tarjetas" role="tablist">
            {variantes.map((v, i) => (
              <div key={i} className={`tr-tarjeta${i === activa ? ' on' : ''}${v.incluida ? '' : ' fuera'}`}>
                <button type="button" role="tab" aria-selected={i === activa} className="tr-tarjeta-cab" onClick={() => setActiva(i)}>
                  <b>Variante {i + 1}</b>
                  <span className="tr-chips">
                    <span>{v.ajustes.arranque === 'avance' ? 'Avance' : v.ajustes.recorte > 0 ? `Empieza en ${seg(v.ajustes.recorte)}` : 'Normal'}</span>
                    <span>{COLORES.find(c => c.id === v.ajustes.color)?.nombre}</span>
                    <span>×{v.ajustes.zoom.toFixed(2)}</span>
                    {v.ajustes.velocidad > 1 && <span>{Math.round((v.ajustes.velocidad - 1) * 100)} % más rápida</span>}
                    {v.ajustes.espejo && <span>Espejo</span>}
                  </span>
                  <small>{v.ajustes.ganchoTexto ? `«${v.ajustes.ganchoTexto}»` : 'Sin gancho'}</small>
                </button>
                <label className="tr-check"><input type="checkbox" checked={v.incluida} onChange={e => incluye(i, e.target.checked)} /> Crearla</label>
              </div>
            ))}
          </div>

          <section>
            <h3>1 · Arranque</h3>
            <div className="tr-pildoras">
              {ARRANQUES.map(o => (
                <button key={o.id} type="button" className={a.arranque === o.id ? 'on' : ''} onClick={() => cambia('arranque', o.id)} title={o.desc}>{o.nombre}</button>
              ))}
            </div>
            <small className="tr-ayuda">{ARRANQUES.find(o => o.id === a.arranque)?.desc}</small>
            {a.arranque === 'avance' && (
              duracion && !plan.avance
                ? <small className="tr-mal">El vídeo es demasiado corto para un avance de {seg(a.avanceDur)}.</small>
                : (
                  <>
                    <label>Momento del avance: {seg(plan.avance?.desde ?? a.avanceEn)}
                      <input type="range" min="0" max={Math.max(0.1, duracion - a.avanceDur)} step={RANGOS.avanceEn.paso}
                        value={plan.avance?.desde ?? a.avanceEn ?? 0} disabled={!duracion}
                        onChange={e => cambia('avanceEn', Number(e.target.value))} />
                    </label>
                    <label>Duración del avance: {seg(a.avanceDur)}
                      <input type="range" min={RANGOS.avanceDur.min} max={RANGOS.avanceDur.max} step={RANGOS.avanceDur.paso}
                        value={a.avanceDur} onChange={e => cambia('avanceDur', Number(e.target.value))} />
                    </label>
                    <small className="tr-ayuda">Elige el momento más fuerte: un resultado, una frase que sorprende, el «antes y después».</small>
                  </>
                )
            )}
            <label>Recortar el principio: {seg(a.recorte)}
              <input type="range" min={RANGOS.recorte.min} max={RANGOS.recorte.max} step={RANGOS.recorte.paso}
                value={a.recorte} onChange={e => cambia('recorte', Number(e.target.value))} />
            </label>
          </section>

          <section>
            <h3>2 · Gancho</h3>
            {!reel && (
              <label>De qué va el vídeo (para proponer ganchos)
                <textarea rows={2} value={tema} maxLength={600} placeholder="p. ej. 3 errores al grabar reels con el móvil y cómo evitarlos"
                  onChange={e => setTema(e.target.value)} />
              </label>
            )}
            <button type="button" className="ag-btn sm" onClick={proponer} disabled={pidiendo || (!reel && !tema.trim())}>
              {pidiendo ? <><Loader2 size={13} className="tr-gira" /> Pensando…</> : <><Sparkles size={13} /> Proponer ganchos</>}
            </button>
            {!reel && !tema.trim() && <small className="tr-ayuda">Escribe tú el gancho, o cuenta de qué va el vídeo y la IA te propone tres.</small>}
            {opciones && (
              <ul className="tr-opciones">
                {opciones.map((o, i) => (
                  <li key={i}>
                    <button type="button" className={a.ganchoTexto === o.texto ? 'on' : ''}
                      onClick={() => { cambia('ganchoTexto', o.texto); cambia('ganchoResaltada', o.resaltada) }}>
                      <small>{o.angulo}</small>
                      <b>{o.texto}</b>
                      {o.porque && <span>{o.porque}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label>Texto del gancho <input value={a.ganchoTexto} maxLength={60} placeholder="2–7 palabras (vacío: sin gancho)" onChange={e => cambia('ganchoTexto', e.target.value)} /></label>
            <label>Palabra resaltada
              <select value={a.ganchoResaltada} onChange={e => cambia('ganchoResaltada', e.target.value)}>
                <option value="">Ninguna</option>
                {palabras.map((p, i) => <option key={p + i} value={p}>{p}</option>)}
              </select>
            </label>
            <div className="tr-pildoras">
              {ESTILOS_GANCHO.map(o => (
                <button key={o.id} type="button" className={a.ganchoEstilo === o.id ? 'on' : ''} onClick={() => cambia('ganchoEstilo', o.id)}>{o.nombre}</button>
              ))}
            </div>
            <label>Se ve durante: {seg(a.ganchoDur)}
              <input type="range" min={RANGOS.ganchoDur.min} max={RANGOS.ganchoDur.max} step={RANGOS.ganchoDur.paso}
                value={a.ganchoDur} onChange={e => cambia('ganchoDur', Number(e.target.value))} />
            </label>
            <small className="tr-ayuda">Con la letra ({LETRAS[marca.letra]?.nombre}) y los colores de tu kit de Portadas, arriba y lejos de los botones de Instagram.</small>
          </section>

          <section>
            <h3>3 · Encuadre</h3>
            <label>Zoom: ×{a.zoom.toFixed(2)}
              <input type="range" min={RANGOS.zoom.min} max={RANGOS.zoom.max} step={RANGOS.zoom.paso}
                value={a.zoom} onChange={e => cambia('zoom', Number(e.target.value))} />
            </label>
            <label>Hacia los lados
              <input type="range" min={RANGOS.desplX.min} max={RANGOS.desplX.max} step={RANGOS.desplX.paso}
                value={a.desplX} onChange={e => cambia('desplX', Number(e.target.value))} />
            </label>
            <label>Hacia arriba o abajo
              <input type="range" min={RANGOS.desplY.min} max={RANGOS.desplY.max} step={RANGOS.desplY.paso}
                value={a.desplY} onChange={e => cambia('desplY', Number(e.target.value))} />
            </label>
          </section>

          <section>
            <h3>4 · Color y velocidad</h3>
            <div className="tr-pildoras">
              {COLORES.map(o => (
                <button key={o.id} type="button" className={a.color === o.id ? 'on' : ''} onClick={() => cambia('color', o.id)}>{o.nombre}</button>
              ))}
            </div>
            <label>Velocidad: ×{a.velocidad.toFixed(2)}
              <input type="range" min={RANGOS.velocidad.min} max={RANGOS.velocidad.max} step={RANGOS.velocidad.paso}
                value={a.velocidad} onChange={e => cambia('velocidad', Number(e.target.value))} />
            </label>
            <small className="tr-ayuda">Un pelo más rápida se nota en el ritmo, no en la voz: el tono no cambia.</small>
            <label className="tr-check">
              <input type="checkbox" checked={a.espejo} onChange={e => cambia('espejo', e.target.checked)} />
              <FlipHorizontal2 size={14} /> Espejo
            </label>
            {a.espejo && <small className="tr-mal">Da la vuelta a todo: también a los textos, rótulos y logos que salgan en el vídeo.</small>}
          </section>

          {trabajos.length > 0 && (
            <section>
              <h3>Variantes de este {reel ? 'reel' : 'vídeo'}{enMarcha ? ' · montando…' : ''}</h3>
              <ListaTrabajos clientId={clientId} trabajos={trabajos} recargar={recargar} />
              <small className="tr-ayuda">Súbelas desde la app de Instagram y, al compartir, activa «Reel de prueba».</small>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
