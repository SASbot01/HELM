// HELM — Trial reels. La ventana del agente de variantes dentro de Agentes.
//
// Tus reels ya publicados y, en cada uno, «Crear variantes»: HELM monta 2–3
// versiones editadas del mismo reel (otro arranque, otro gancho, otro
// encuadre) para volver a probar la idea como «Reel de prueba» de Instagram.
// El gancho se compone aquí, en el navegador, con el kit de Portadas; el
// montaje lo hace el servidor con ffmpeg (api/trial-reels.js) y aquí se
// espera, se ve cómo va y se descarga.
//
// El vídeo de partida sale SOLO de la cuenta de Instagram conectada del perfil.
// HELM no publica (la app no tiene permiso): se sube en la app de Instagram.
// Solo gasta créditos «Proponer ganchos».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Sparkles, Download, Loader2, FlaskConical, Trash2, AlertTriangle, Check, Clock, FlipHorizontal2, Info,
} from 'lucide-react'
import { supabase } from '../utils/supabase'
import { portadasApi, trialReelsApi } from '../helm/lib'
import { MARCA_POR_DEFECTO, normalizaMarca, LETRAS } from './portadas/reglas'
import {
  ajustesDeVariante, tramos, esReel, palabrasDe, RANGOS, ARRANQUES, COLORES, ESTILOS_GANCHO, MAX_VARIANTES, LIENZO,
} from './trialreels/reglas'
import { lienzoGancho, pintaVistaPrevia } from './trialreels/gancho'
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

/** Las variantes del perfil, y mientras haya alguna en marcha, cada 3 s. */
function useTrabajos(clientId) {
  const [trabajos, setTrabajos] = useState(null)
  const [error, setError] = useState('')
  const recargar = useCallback(
    () => trialReelsApi.lista(clientId).then(d => { setTrabajos(d.trabajos || []); setError('') }).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { recargar() }, [recargar])
  const enMarcha = (trabajos || []).some(t => t.estado === 'en_cola' || t.estado === 'procesando')
  useEffect(() => {
    if (!enMarcha) return undefined
    const reloj = setInterval(recargar, 3000)
    return () => clearInterval(reloj)
  }, [enMarcha, recargar])
  return { trabajos, error, recargar }
}

export default function TrialReels({ clientId, client, onVolver }) {
  const [reels, setReels] = useState(null)
  const [error, setError] = useState('')
  const [marca, setMarca] = useState(MARCA_POR_DEFECTO)
  const [elegido, setElegido] = useState(null)
  const { trabajos, error: errorTrabajos, recargar } = useTrabajos(clientId)

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

  if (elegido) {
    return (
      <Taller
        clientId={clientId} reel={elegido} marca={marca}
        trabajos={(trabajos || []).filter(t => t.mediaId === elegido.media_id)}
        recargar={recargar} onVolver={() => setElegido(null)}
      />
    )
  }

  const porReel = new Map((reels || []).map(r => [r.media_id, r]))
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

      {(trabajos || []).length > 0 && (
        <section className="tr-bloque">
          <h3>Tus variantes</h3>
          <ListaTrabajos clientId={clientId} trabajos={trabajos} recargar={recargar} reelDe={(id) => porReel.get(id)} />
        </section>
      )}

      <h3 className="tr-titulo">Elige un reel</h3>
      {reels == null ? <p className="tr-ayuda"><Loader2 size={14} className="tr-gira" /> Cargando tus reels…</p>
        : !reels.length ? (
          <p className="tr-ayuda">
            Aún no hay reels de este perfil. Conecta Instagram en <b>Ajustes → Instagram</b> y, cuando sincronice, aquí salen
            todos. Solo se trabaja con reels de tu propia cuenta.
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
            de Instagram como reel nuevo; al compartir, activa la opción <b>«Reel de prueba»</b>. Solo se usan tus propios reels, bajados
            de tu cuenta conectada. Las variantes se guardan 7 días.
          </p>
        </div>
      )}
    </section>
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

function ListaTrabajos({ clientId, trabajos, recargar, reelDe }) {
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
          const reel = reelDe?.(t.mediaId)
          const a = t.ajustes || {}
          return (
            <li key={t.id} className={`tr-trabajo ${t.estado}`}>
              <span className="tr-estado"><e.Icono size={14} className={t.estado === 'procesando' ? 'tr-gira' : ''} /> {e.txt}</span>
              <div className="tr-trabajo-txt">
                <b>Variante {t.variante}{a.ganchoTexto ? ` · «${a.ganchoTexto}»` : ''}</b>
                <small>
                  {reel ? `${String(reel.caption || '').split('\n')[0].slice(0, 60) || 'Reel'} · ` : ''}
                  {fecha(t.creado)}
                  {t.estado === 'listo' && ` · ${seg(t.duracion)} · ${mb(t.bytes)}`}
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

function Taller({ clientId, reel, marca, trabajos, recargar, onVolver }) {
  const lienzo = useRef(null)
  const oculto = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [duracion, setDuracion] = useState(0)
  const [cargando, setCargando] = useState('Descargando el vídeo…')
  const [error, setError] = useState('')
  const [variantes, setVariantes] = useState(() =>
    Array.from({ length: MAX_VARIANTES }, (_, i) => ({ incluida: true, ajustes: ajustesDeVariante(reel.media_id, i) })))
  const [activa, setActiva] = useState(0)
  const [fotograma, setFotograma] = useState(null)
  const [opciones, setOpciones] = useState(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState('')

  const a = variantes[activa].ajustes
  const plan = useMemo(() => tramos(a, duracion), [a, duracion])
  const cambia = (k, v) => setVariantes(vs => vs.map((x, i) => (i === activa ? { ...x, ajustes: { ...x.ajustes, [k]: v } } : x)))
  const incluye = (i, si) => setVariantes(vs => vs.map((x, j) => (j === i ? { ...x, incluida: si } : x)))

  // El vídeo se baja una vez al entrar, por HELM (el CDN de Meta no deja
  // leerlo desde el navegador), y se suelta al salir.
  useEffect(() => {
    let vivo = true
    portadasApi.video(clientId, reel.media_id)
      .then(b => { if (vivo) setVideoUrl(URL.createObjectURL(b)) })
      .catch(e => { if (vivo) setError(`${e.message}. Sin el vídeo no se ve la vista previa, pero las variantes se pueden crear igual.`) })
      .finally(() => { if (vivo) setCargando('') })
    return () => { vivo = false }
  }, [clientId, reel])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  // El primer fotograma de la variante activa: el del avance o el del recorte.
  const instante = plan.avance ? plan.avance.desde : plan.principal.desde
  useEffect(() => {
    const v = oculto.current
    if (!v || !duracion) return
    v.currentTime = Math.min(Math.max(0, duracion - 0.05), instante + 0.04)
  }, [instante, duracion])
  const capturar = useCallback(() => {
    const v = oculto.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    setFotograma(c)
  }, [])

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
      const d = await trialReelsApi.ganchos(clientId, reel.media_id)
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
      await trialReelsApi.crear(clientId, reel.media_id, cuerpo)
      setAviso(`${cuerpo.length === 1 ? 'La variante está' : `Las ${cuerpo.length} variantes están`} en marcha. Tarda un par de minutos; puedes salir y volver.`)
      await recargar()
    } catch (e) { setError(e.message) }
    setCreando(false)
  }

  const palabras = palabrasDe(a.ganchoTexto)
  const elegidas = variantes.filter(v => v.incluida).length
  const enMarcha = trabajos.some(t => t.estado === 'en_cola' || t.estado === 'procesando')

  return (
    <div className="ag embebido tr-root">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}><ArrowLeft size={14} strokeWidth={2.2} /> Trial reels</button>
          <h1>Crear variantes</h1>
          <p>{String(reel.caption || '').split('\n')[0].slice(0, 140) || 'Reel sin caption'}</p>
        </div>
      </header>

      {error && <p className="ag-error">{error}</p>}

      <div className="tr-taller">
        <div className="tr-col-previa">
          <canvas ref={lienzo} width={LIENZO.ancho} height={LIENZO.alto} className="tr-lienzo" aria-label={`Así empieza la variante ${activa + 1}`} />
          <small className="tr-ayuda">
            Así empieza la variante {activa + 1}{plan.salida != null ? ` · durará ${seg(plan.salida)}` : ''}. El color es aproximado.
          </small>
          {cargando && <p className="tr-ayuda"><Loader2 size={14} className="tr-gira" /> {cargando}</p>}
          {videoUrl && (
            <>
              <video
                ref={oculto} src={videoUrl} muted playsInline preload="auto" className="tr-oculto"
                onLoadedMetadata={e => setDuracion(e.currentTarget.duration || 0)} onSeeked={capturar}
              />
              <details className="tr-original">
                <summary>Ver el original</summary>
                <video src={videoUrl} controls playsInline preload="metadata" />
              </details>
            </>
          )}
          <button type="button" className="ag-btn primario tr-crear" onClick={crear} disabled={creando || !elegidas}>
            {creando ? <><Loader2 size={14} className="tr-gira" /> Preparando…</> : <><FlaskConical size={14} /> Crear {elegidas === 1 ? 'la variante' : `${elegidas} variantes`}</>}
          </button>
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
            <button type="button" className="ag-btn sm" onClick={proponer} disabled={pidiendo}>
              {pidiendo ? <><Loader2 size={13} className="tr-gira" /> Pensando…</> : <><Sparkles size={13} /> Proponer ganchos</>}
            </button>
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
              <h3>Variantes de este reel{enMarcha ? ' · montando…' : ''}</h3>
              <ListaTrabajos clientId={clientId} trabajos={trabajos} recargar={recargar} />
              <small className="tr-ayuda">Súbelas desde la app de Instagram y, al compartir, activa «Reel de prueba».</small>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
