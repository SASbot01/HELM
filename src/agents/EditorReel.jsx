// HELM — Editor de reels. La ventana del agente editor dentro de Agentes.
//
// Una sola pantalla, de arriba abajo:
//   1. La GALERÍA de estilos de edición (./editor/estilos-referencia.js),
//      cada uno con el nombre del perfil de donde sale, filtrable por idioma y
//      tema. «Crear» abre el taller con ese estilo; «Copiar prompt», para que
//      Claude lo monte por el conector. Los que no traen reels de ejemplo
//      enseñan una vista previa 9:16 hecha con CSS: cómo quedan sus subtítulos.
//   2. El TALLER (al pulsar «Crear»): eliges el vídeo en bruto (su duración se
//      lee aquí, en el navegador), ves el PRECIO antes de nada, añades recursos
//      si quieres (imágenes y clips de apoyo con su «cuando diga…», el logo y
//      la música), ajustas el estilo y «Editar vídeo»:
//         crear → el vídeo por trozos (con barra, cancelar y seguir si se
//         corta) → los recursos → lanzar.
//      El montaje lo hace el worker (trabajo `editor-render`) y se cobra solo
//      si sale bien, una vez (api/editor.js, api/_lib/creditos.js).
//   3. TUS VÍDEOS: cómo va cada uno (cada 3 s mientras alguno está en la cola
//      o editándose), lo que ha costado, descargar y borrar. Una subida que se
//      quedó a medias (se cerró la pestaña) se sigue eligiendo otra vez el
//      mismo archivo; una que llegó entera y no se lanzó (faltaba saldo), se
//      lanza desde su fila sin el archivo.
//   Si «lanzar» falla, el taller mira el código (trasFallo): sigue subiendo si
//   al vídeo le falta un trozo, se queda para repetir si es la red o el saldo,
//   y si la edición ya no tiene arreglo (410, 422) solo deja descartar o cerrar.
//
// HELM no publica nada: el MP4 se descarga y se sube a mano. Y de los estilos
// solo se copia cómo se edita, nunca la cara, el logo ni la marca de nadie.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Upload, Download, Trash2, Loader2, Check, AlertTriangle, Clock, Info, Palette, ChevronRight, X, RotateCcw,
  Scissors, Copy, Wand2, ExternalLink, Coins, Gift, Film, Image as ImagenIcono, Music, Stamp, Plus, Save,
} from 'lucide-react'
import { editorApi, creditosApi } from '../helm/lib'
import { subePorTrozos, mandaTrozo, reintentable, espera, esperaDe } from '../helm/subida'
import { precioEditor, aCreditos, PRECIOS_FIJOS, creditosQueQuedan } from '../helm/precios'
import { tipoDeVideo } from './editor/subida'
import { leeDuracion } from './editor/duracion'
import {
  ESTILO_POR_DEFECTO, RANGOS_ESTILO, normalizaEstilo, ESTADOS_EDICION, EN_MARCHA, MAX_MB_SUBIDA, DIAS_GUARDADO,
  MODOS_RECURSOS, POSICIONES_LOGO,
} from './editor/estilo'
import { ESTILOS_REFERENCIA, TEMAS, IDIOMAS, buscaReferencia } from './editor/estilos-referencia'
import './editorReel.css'

const MB = 1048576
// Lo que acepta el servidor (api/editor.js lo vuelve a comprobar). Cuántos
// vídeos puede haber a la vez lo decide solo él (un 429 con su mensaje).
const MAX_SEGUNDOS = 600

const fecha = (t) => { try { return new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const mmss = (s) => {
  if (s == null) return '—'
  const t = Math.round(Number(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
const mb = (b) => (b < MB
  ? `${Math.max(1, Math.round(b / 1024)).toLocaleString('es-ES')} KB`
  : `${(b / MB).toLocaleString('es-ES', { maximumFractionDigits: b > 100 * MB ? 0 : 1 })} MB`)
const num = (n) => Number(n || 0).toLocaleString('es-ES')
const creditos = (euros) => num(aCreditos(euros))
// Lo que QUEDA va hacia abajo, como lo cuenta el servidor (exigirImporte): el
// saldo lleva cuatro decimales y con 1,4987 € quedan 149 créditos, no 150
// (creditosQueQuedan). Y no llega si le falta más de una diezmilésima, igual
// que allí.
const quedan = (euros) => num(creditosQueQuedan(euros))
const noAlcanza = (saldo, euros) => Number(saldo) + 1e-4 < Number(euros)
/**
 * ¿No le llega a la agencia para `euros`? Con el saldo a la vista (quien
 * administra la agencia), la cuenta exacta. Sin él (el resto: el saldo es de la
 * agencia y no se le enseña), lo que diga el servidor en `alcanza`, que va por
 * el precio de un bloque de 3 minutos: si no llega ni para uno, no llega para
 * ningún vídeo. Si no se sabe, que sí: el servidor lo vuelve a mirar al lanzar.
 */
function noLlegaPara(precios, euros) {
  if (!precios || precios.error || !precios.paga) return false
  if (precios.saldo != null) return noAlcanza(precios.saldo, euros)
  return precios.alcanza?.['editor-reels'] === false
}
const miles = num
const caducado = (e) => e.estado === 'listo' && Date.now() - new Date(e.created_at).getTime() > DIAS_GUARDADO * 86_400_000
const portadaDe = (reel) => `/agentes/editor-estilos/${reel.shortcode}.jpg`
const ICONO = { subiendo: Upload, en_cola: Clock, transcribiendo: Loader2, montando: Loader2, listo: Check, error: AlertTriangle }
// Solo lo que admite el servidor (MP4/MOV y familia: se comprueba por los bytes).
const EXT_VIDEO = /\.(mp4|mov|m4v|3gp)$/i
const TIPOS_VIDEO = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp']
// Los que se sabe que no son MP4/MOV, aunque el archivo se llame .mp4 (como el servidor).
const NO_MOV = /^video\/(webm|x-matroska|matroska|x-msvideo|avi|mpeg|mp2t|ogg|x-flv|x-ms-wmv)$/
const EN_IDIOMA = { es: 'en español', en: 'en inglés', pt: 'en portugués' }

// Sin saldo, el panel abre la recarga (AvisoSinSaldo, en Creditos.jsx): con un
// 402 ya lo hace editorApi; esto es para el botón. La compra solo la ve quien
// administra (bw_superadmin, como allí); al resto le dice a quién avisar, y el
// botón lo dice igual.
const recargarCreditos = (detalle) => window.dispatchEvent(new CustomEvent('helm:sin-saldo', { detail: detalle || null }))
const puedeRecargar = () => { try { return Boolean(localStorage.getItem('bw_superadmin')) } catch { return false } }
const SIN_SALDO = /saldo suficiente|créditos suficientes|sin créditos|recarga en créditos/i
// Lo que dice fetch (Chrome, Firefox, Safari) cuando no llega ni a salir.
const SIN_RED = /failed to fetch|networkerror|load failed|network request failed/i

/** El error, para enseñarlo: { texto, sinSaldo? }. Los de editorApi llevan `status`. */
function explica(e) {
  const texto = e?.message || 'Algo ha fallado. Vuelve a probar.'
  if (e?.status === 402 || SIN_SALDO.test(texto)) return { texto, sinSaldo: true }
  if (/too many requests|demasiadas peticiones/i.test(texto)) return { texto: 'Demasiadas peticiones seguidas: espera un minuto y vuelve a probar.' }
  if (SIN_RED.test(texto)) return { texto: 'No hay conexión con HELM: comprueba la red y vuelve a probar.' }
  return { texto }
}

// De dónde es el enlace de un perfil, para decirlo en la tarjeta.
const PLATAFORMAS = [[/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'], [/(^|\.)(x|twitter)\.com$/, 'X'], [/(^|\.)tiktok\.com$/, 'TikTok']]
function enlaceDe(url) {
  let host = ''
  try { host = new URL(url).hostname.toLowerCase() } catch { return 'Ver perfil' }
  const p = PLATAFORMAS.find(([re]) => re.test(host))
  return p ? `Ver en ${p[1]}` : 'Ver su web'
}

// Copiar con el método de siempre si el navegador no deja usar el portapapeles.
function copiaTexto(texto) {
  const aMano = () => {
    const t = document.createElement('textarea')
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.top = '-1000px'
    document.body.appendChild(t); t.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    t.remove()
    return ok
  }
  try { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto).then(() => true, aMano) } catch { /* abajo */ }
  return Promise.resolve(aMano())
}

const urlLocal = (archivo) => { try { return URL.createObjectURL(archivo) } catch { return null } }
const sueltaUrl = (url) => { try { if (url) URL.revokeObjectURL(url) } catch { /* nada */ } }

// ── Los recursos: qué se puede subir (el servidor mira los bytes) ──────────
const CLASES = {
  imagen: { mimes: ['image/jpeg', 'image/png', 'image/webp'], exts: ['jpg', 'jpeg', 'png', 'webp'], maxMb: 15, texto: 'una imagen' },
  clip: { mimes: ['video/mp4', 'video/quicktime'], exts: ['mp4', 'mov'], maxMb: 90, texto: 'un clip' },
  logo: { mimes: ['image/png', 'image/webp'], exts: ['png', 'webp'], maxMb: 5, texto: 'el logo' },
  audio: {
    mimes: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
    exts: ['mp3', 'm4a', 'wav'], maxMb: 30, texto: 'la música',
  },
}
const RECURSOS = {
  broll: { max: 12, acepta: 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov' },
  logo: { max: 1, acepta: 'image/png,image/webp,.png,.webp' },
  musica: { max: 1, acepta: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a,.wav' },
}
const REINTENTOS_RECURSO = 2
const extDe = (nombre) => (String(nombre || '').toLowerCase().match(/\.([a-z0-9]{2,4})$/) || [])[1] || ''
const esDe = (clase, archivo) => CLASES[clase].mimes.includes(String(archivo.type || '').toLowerCase()) || CLASES[clase].exts.includes(extDe(archivo.name))

/** ¿Vale este archivo como recurso de `tipo`? → { clase } o { error }. */
function revisaRecurso(tipo, archivo) {
  const n = archivo?.name || 'archivo'
  if (!archivo?.size) return { error: `«${n}» está vacío.` }
  const clase = tipo === 'broll' ? (esDe('imagen', archivo) ? 'imagen' : esDe('clip', archivo) ? 'clip' : null)
    : tipo === 'logo' ? (esDe('logo', archivo) ? 'logo' : null)
      : (esDe('audio', archivo) ? 'audio' : null)
  if (!clase) {
    return {
      error: tipo === 'broll' ? `«${n}» no vale como imagen o clip: sube JPG, PNG, WebP, MP4 o MOV.`
        : tipo === 'logo' ? 'El logo tiene que ser PNG o WebP (mejor con el fondo transparente).'
          : 'La música tiene que ser MP3, M4A o WAV.',
    }
  }
  const { maxMb, texto } = CLASES[clase]
  if (archivo.size > maxMb * MB) return { error: `«${n}» pesa ${mb(archivo.size)}: ${texto} puede pesar hasta ${maxMb} MB.` }
  return { clase }
}

/** Sube un recurso en una sola petición (en crudo), con un par de reintentos. */
async function subeRecurso(clientId, edicionId, r, { alProgreso, senal }) {
  const url = editorApi.urlRecurso(clientId, edicionId, r.tipo, r.nombre)
  for (let intento = 0; ; intento++) {
    try {
      const d = await mandaTrozo({ url, cuerpo: r.archivo, senal, alAvanzar: (n) => alProgreso(Math.min(1, n / (r.archivo.size || 1))) })
      if (!d?.recurso?.id) throw new Error('El servidor no ha guardado el recurso.')
      return d.recurso
    } catch (e) {
      if (e?.cancelada || senal?.aborted) throw e
      if (reintentable(e) && intento < REINTENTOS_RECURSO) { await espera(esperaDe(1000, intento), senal); continue }
      throw e
    }
  }
}

// ── Lo que se carga del servidor ────────────────────────────────────────────

// Lo que se sondea: lo que ya está en manos del worker. Una edición «subiendo»
// no cambia sola: la que sube el taller se ve arriba (y al lanzarla se recarga
// la lista), y una subida que se quedó a medias puede pasar así horas
// (HORAS_SUBIDA): preguntar por ella cada 3 s solo gasta el límite de
// peticiones, que es el mismo que el de los trozos.
const SE_SONDEA = EN_MARCHA.filter(e => e !== 'subiendo')

/** Las ediciones del perfil y, mientras alguna esté en la cola o editándose, cada 3 s. */
function useEdiciones(clientId) {
  const [ediciones, setEdiciones] = useState(null)
  const [error, setError] = useState('')
  const recargar = useCallback(
    () => editorApi.lista(clientId).then(d => { setEdiciones(d.ediciones || []); setError('') }).catch(e => setError(explica(e).texto)),
    [clientId],
  )
  useEffect(() => { recargar() }, [recargar])
  const enMarcha = (ediciones || []).some(e => SE_SONDEA.includes(e.estado))
  useEffect(() => {
    if (!enMarcha) return undefined
    const reloj = setInterval(recargar, 3000)
    return () => clearInterval(reloj)
  }, [enMarcha, recargar])
  return { ediciones, error, recargar }
}

/**
 * Si este perfil paga y cuánto le queda: { paga, saldo, alcanza, precios } (o
 * { error }). `saldo` llega null si no administras la agencia: entonces solo
 * se enseña el precio, y `alcanza` dice si llega.
 */
function usePrecios(clientId) {
  const [precios, setPrecios] = useState(null)
  const cargar = useCallback(
    () => creditosApi.precios(clientId).then(setPrecios, () => setPrecios(p => p || { error: true })),
    [clientId],
  )
  useEffect(() => {
    cargar()
    // Al volver de recargar (otra pestaña, Stripe), el saldo es otro.
    window.addEventListener('focus', cargar)
    return () => window.removeEventListener('focus', cargar)
  }, [cargar])
  return [precios, cargar]
}

export default function EditorReel({ clientId, client, onVolver }) {
  const { ediciones, error, recargar } = useEdiciones(clientId)
  const [precios, recargarPrecios] = usePrecios(clientId)
  const [taller, setTaller] = useState(null) // { referencia, retomar, vez }
  const [activa, setActiva] = useState(null) // la edición que sube el taller
  // El taller está subiendo o lanzando: salir (o abrir otro taller desde la
  // lista) cortaría su subida sin avisar.
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const arriba = useRef(null)
  const veces = useRef(0)
  // Un vídeo que acaba bien ya está cobrado: el saldo ha cambiado.
  const listos = (ediciones || []).filter(e => e.estado === 'listo').length
  const listosAntes = useRef(null)
  useEffect(() => {
    if (listosAntes.current != null && listos > listosAntes.current) recargarPrecios()
    listosAntes.current = listos
  }, [listos, recargarPrecios])

  function abre(referencia, retomar = null) {
    veces.current += 1
    setAviso('')
    setTaller({ referencia, retomar, vez: veces.current })
    setActiva(retomar?.fila?.id || null)
    arriba.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  function cierra() { setTaller(null); setActiva(null); setOcupado(false) }
  function lanzada(edicion, nombre) {
    cierra()
    setAviso(`«${nombre}» ya está en cola. Aquí abajo ves cómo va: tarda unos minutos y puedes cerrar esta pantalla.`)
    recargar()
    recargarPrecios()
  }

  return (
    <div className="ag embebido ed-root" ref={arriba}>
      <header className="ag-top dentro">
        <div>
          <button
            type="button" className="ag-volver" onClick={onVolver} disabled={ocupado}
            title={ocupado ? 'Espera a que acabe la subida o cancélala' : undefined}
          >
            <ArrowLeft size={14} strokeWidth={2.2} /> Agentes
          </button>
          <h1>Editor de reels</h1>
          <p>
            Elige un estilo y sube el vídeo de {client?.name || 'este perfil'} tal cual lo grabaste con el móvil. HELM quita las tomas
            repetidas, las muletillas y los silencios, mete tus imágenes, clips, logo y música si los subes, lo deja a 1080×1920 con
            subtítulos palabra a palabra y te devuelve el MP4 listo para subir.
          </p>
        </div>
      </header>

      {aviso && <p className="ed-ok ed-aviso-ok" role="status"><Check size={15} /> {aviso}</p>}

      {taller ? (
        <Taller
          key={taller.vez}
          clientId={clientId}
          referencia={taller.referencia}
          retomar={taller.retomar}
          precios={precios}
          onCerrar={cierra}
          onCreada={(ed) => { setActiva(ed.id); recargar() }}
          onLanzada={lanzada}
          onCambio={recargar}
          onTrabajando={setOcupado}
        />
      ) : (
        <>
          <ComoFunciona />
          <Galeria onCrear={(e) => abre(e)} onMiEstilo={() => abre(null)} />
        </>
      )}

      {error && (
        <p className="ag-error">
          {error}{' '}<button type="button" className="ed-enlace" onClick={recargar}>Volver a probar</button>
        </p>
      )}
      <h3 className="ed-titulo">Tus vídeos</h3>
      {ediciones == null ? (!error && <p className="ed-ayuda"><Loader2 size={14} className="ed-gira" /> Cargando…</p>)
        : !ediciones.length ? <p className="ed-ayuda">Todavía no has subido ninguno. Cuando subas uno, aquí verás cómo va y lo podrás descargar.</p>
          : (
            <ListaEdiciones
              clientId={clientId} ediciones={ediciones} recargar={recargar} activa={activa} bloqueada={ocupado}
              paga={precios && !precios.error ? precios.paga : null}
              onRetomar={(fila, archivo) => abre(buscaReferencia(fila.estilo_ref), { fila, archivo, subido: !archivo })}
            />
          )}
    </div>
  )
}

function ComoFunciona() {
  const [abierto, setAbierto] = useState(false)
  const bloque = aCreditos(PRECIOS_FIJOS['editor-reels'])
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
            Después lo <b>encuadra a 1080×1920</b>, con el <b>zoom</b> y los <b>subtítulos</b> del estilo que elijas (por encima del
            texto de Instagram, con la palabra que suena resaltada) y la voz a un <b>volumen parejo</b>. Si subes <b>imágenes o
            clips</b>, entran cuando dices la palabra que les pongas; el <b>logo</b> va encima todo el vídeo y la <b>música</b>, debajo
            de tu voz, bajando cuando hablas.
          </p>
          <p>
            Cuesta <b>{bloque} créditos por cada 3 minutos</b> de vídeo en bruto (hasta 10 minutos), lo ves antes de empezar y
            <b> solo se cobra si sale bien</b>. Tarda unos minutos; puedes cerrar esta pantalla y el vídeo se queda aquí {DIAS_GUARDADO} días.
            {' '}<b>HELM no publica nada</b>: lo descargas y lo subes tú desde la app.
          </p>
        </div>
      )}
    </section>
  )
}

// ── La galería de estilos ───────────────────────────────────────────────────

const IDIOMAS_CON_ESTILOS = Object.entries(IDIOMAS).filter(([k]) => ESTILOS_REFERENCIA.some(e => e.idioma === k))
const TEMAS_CON_ESTILOS = Object.entries(TEMAS).filter(([k]) => ESTILOS_REFERENCIA.some(e => e.tema === k))

function Galeria({ onCrear, onMiEstilo }) {
  const [idioma, setIdioma] = useState('')
  const [tema, setTema] = useState('')
  const lista = ESTILOS_REFERENCIA.filter(e => (!idioma || e.idioma === idioma) && (!tema || e.tema === tema))
  return (
    <section className="ed-galeria" aria-labelledby="ed-galeria-titulo">
      <div className="ed-galeria-cab">
        <div>
          <h2 id="ed-galeria-titulo">Elige un estilo de edición</h2>
          <p className="ed-galeria-ayuda">
            Cada estilo lleva el nombre del perfil de donde sale. «Crear» abre el taller con ese estilo: subes tu vídeo y lo monta
            HELM. «Copiar prompt», para que Claude lo haga por el conector. De cada uno solo se copia cómo edita: nunca su cara, su
            logo ni su marca.
          </p>
        </div>
        <button type="button" className="ag-btn" onClick={onMiEstilo}><Wand2 size={14} /> Editar con mi estilo</button>
      </div>

      <div className="ed-filtros">
        <div className="ed-pills" role="group" aria-label="Idioma">
          <button type="button" className={`ed-pill${!idioma ? ' on' : ''}`} aria-pressed={!idioma} onClick={() => setIdioma('')}>Todos</button>
          {IDIOMAS_CON_ESTILOS.map(([k, t]) => (
            <button key={k} type="button" className={`ed-pill${idioma === k ? ' on' : ''}`} aria-pressed={idioma === k} onClick={() => setIdioma(idioma === k ? '' : k)}>
              {t}
            </button>
          ))}
        </div>
        <select className="ed-tema" value={tema} onChange={(ev) => setTema(ev.target.value)} aria-label="Tema">
          <option value="">Todos los temas</option>
          {TEMAS_CON_ESTILOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <span className="ed-cuenta">{lista.length} {lista.length === 1 ? 'estilo' : 'estilos'}</span>
      </div>

      {lista.length ? (
        <ul className="ed-refs">
          {lista.map(e => <TarjetaEstilo key={e.clave} e={e} onCrear={() => onCrear(e)} />)}
        </ul>
      ) : (
        <p className="ed-ayuda">
          Ningún estilo con ese filtro.{' '}
          <button type="button" className="ed-enlace" onClick={() => { setIdioma(''); setTema('') }}>Ver todos</button>
        </p>
      )}
    </section>
  )
}

function TarjetaEstilo({ e, onCrear }) {
  const [copiado, setCopiado] = useState(null)
  const reloj = useRef(null)
  useEffect(() => () => clearTimeout(reloj.current), [])
  const [principal, ...otros] = e.reels || []
  function copia() {
    copiaTexto(e.prompt).then(ok => {
      setCopiado(ok ? 'ok' : 'mal')
      clearTimeout(reloj.current)
      reloj.current = setTimeout(() => setCopiado(null), 2000)
    })
  }
  return (
    <li className="ed-ref">
      {principal ? (
        <a className="ed-ref-portada" href={principal.url} target="_blank" rel="noopener noreferrer" title="Ver el reel de ejemplo en Instagram">
          <img src={portadaDe(principal)} alt={`Reel de ejemplo de @${e.nombre}`} loading="lazy" />
          {otros.length > 0 && (
            <span className="ed-ref-mas">
              {otros.map(r => <img key={r.shortcode} src={portadaDe(r)} alt="" loading="lazy" />)}
            </span>
          )}
        </a>
      ) : (
        <div className="ed-ref-portada">
          <VistaPrevia estilo={normalizaEstilo(e.estilo || {})} etiqueta={`Vista previa de los subtítulos del estilo de @${e.nombre}`} />
        </div>
      )}
      <div className="ed-ref-txt">
        <b>@{e.nombre}</b>
        <small>{e.persona ? `${e.persona} · ` : ''}{e.nicho} · {EN_IDIOMA[e.idioma] || e.idioma}</small>
        <div className="ed-ref-enlaces">
          {e.reels?.length
            ? e.reels.map(r => (
              <a key={r.shortcode} href={r.url} target="_blank" rel="noopener noreferrer">{miles(r.likes)} ♥ <ExternalLink size={11} /></a>
            ))
            : e.enlace && <a href={e.enlace} target="_blank" rel="noopener noreferrer">{enlaceDe(e.enlace)} <ExternalLink size={11} /></a>}
          {e.confianza === 'baja' && (
            <span className="ed-ref-aprox" title="Su forma de editar no está bien documentada: el estilo es una aproximación.">aprox.</span>
          )}
        </div>
      </div>
      <div className="ed-ref-btns">
        <button type="button" className="ag-btn primario sm" onClick={onCrear} aria-label={`Crear con el estilo de @${e.nombre}`}>
          <Wand2 size={13} /> Crear
        </button>
        <button type="button" className="ag-btn sm" onClick={copia}>
          {copiado === 'ok' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar prompt</>}
        </button>
      </div>
      {copiado === 'mal' && <small className="ag-error">Tu navegador no deja copiar: selecciónalo a mano.</small>}
    </li>
  )
}

const MUESTRA = ['Esto', 'te', 'ahorra', 'diez', 'horas']

/**
 * Un móvil en miniatura con un bloque de subtítulos de ejemplo, a escala (el
 * tamaño sale del ancho de la caja: 1080 px del vídeo = el 100 %). En modo
 * «arriba», el recurso en la mitad de arriba y la persona en la de abajo.
 */
function VistaPrevia({ estilo, etiqueta = 'Vista previa de los subtítulos', logo = null }) {
  const palabras = MUESTRA.slice(0, estilo.palabrasPorBloque)
  const suena = Math.min(1, palabras.length - 1)
  const arriba = estilo.recursosModo === 'arriba'
  return (
    <div
      className={`ed-previa${arriba ? ' arriba' : ''}`} role="img" aria-label={etiqueta}
      style={{ '--tam': estilo.tamano, '--grosor': estilo.borde, '--c-borde': estilo.colorBorde }}
    >
      {arriba && <div className="ed-previa-recurso" aria-hidden="true"><ImagenIcono size={18} /></div>}
      <div className="ed-previa-cara" aria-hidden="true" />
      {logo && estilo.logoPosicion !== 'ninguna' && <img className={`ed-previa-logo ${estilo.logoPosicion}`} src={logo} alt="" />}
      {estilo.subtitulos && (
        <div className="ed-previa-sub" style={{ top: `${estilo.posicion}%` }} aria-hidden="true">
          {palabras.map((p, i) => (
            <span key={p} style={{ color: i === suena ? estilo.colorResalte : estilo.colorTexto }}>
              {estilo.mayusculas ? p.toLocaleUpperCase('es-ES') : p}{i < palabras.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>
      )}
      {!estilo.subtitulos && <span className="ed-previa-nota" aria-hidden="true">sin subtítulos</span>}
      <div className="ed-previa-ig" aria-hidden="true" />
    </div>
  )
}

// ── El taller: vídeo, precio, recursos, estilo y «Editar vídeo» ────────────

const TRABAJANDO = ['creando', 'subiendo', 'recursos', 'lanzando']
// La clase de un recurso ya subido: la dice el servidor ('video' es un clip).
const claseGuardada = (r) => (r.tipo === 'musica' ? 'audio' : r.tipo === 'logo' ? 'logo'
  : r.clase === 'video' || (!r.clase && /\.(mp4|mov)$/i.test(r.nombre || '')) ? 'clip' : 'imagen')
// Lo que deja el servidor en `paso` cuando el vídeo ha llegado entero
// (api/editor.js, trozo): a esa subida ya solo le falta lanzarla.
const PASO_SUBIDO = 'Vídeo subido'
const subidaEntera = (e) => e.estado === 'subiendo' && e.paso === PASO_SUBIDO

/**
 * Adónde vuelve el taller cuando «Editar vídeo» falla con la edición ya
 * creada (`total`: lo que pesa el archivo que hay aquí; 0 si no hay) →
 * { fase, texto?, suave?, recibidos? }:
 *   · 409 con `recibidos`: al vídeo le falta un trozo → a seguir subiendo. Si
 *     este archivo ya no tiene más que mandar, es que no es el mismo;
 *   · 404, 409 sin más, 410 o 422: esta edición ya no tiene arreglo (se perdió
 *     la subida, el vídeo no se puede leer o dura más de 10 minutos, la cerró
 *     otra pestaña) → solo queda descartarla o cerrar;
 *   · lo demás (la red, el saldo, un 5xx): se queda donde iba, para repetir.
 */
function trasFallo(e, { subido, total }) {
  const recibidos = Number(e?.datos?.recibidos)
  if (e?.status === 409 && e?.datos?.recibidos != null && Number.isFinite(recibidos)) {
    if (!total) return { fase: 'fallida', texto: 'Al vídeo le falta un trozo por llegar: cierra y, en «Tus vídeos», elige otra vez el mismo archivo para seguir subiéndolo.' }
    if (recibidos < total) return { fase: 'cortada', recibidos, texto: 'Al vídeo le falta un trozo por llegar: sigue subiendo desde donde va.', suave: true }
    return { fase: 'fallida', texto: 'Lo que tiene HELM no cuadra con este archivo: ¿es el mismo que empezaste a subir? Descarta esta subida y vuelve a empezar.' }
  }
  if ([404, 409, 410, 422].includes(e?.status)) return { fase: 'fallida' }
  return { fase: subido ? 'subido' : 'cortada' }
}

function Taller({ clientId, referencia, retomar, precios, onCerrar, onCreada, onLanzada, onCambio, onTrabajando }) {
  const fila = retomar?.fila || null
  // Retomar con `subido` es lanzar una subida que ya llegó entera: sin archivo.
  const yaSubido = Boolean(fila && retomar.subido)
  const [video, setVideo] = useState(() => (fila ? {
    archivo: retomar.archivo || null,
    nombre: retomar.archivo?.name || fila.nombre_original || 'Vídeo',
    bytes: retomar.archivo?.size || null,
    duracion: fila.duracion_original ?? null,
  } : null))
  const [leyendo, setLeyendo] = useState(false)
  const [errorVideo, setErrorVideo] = useState('')
  const [estilo, setEstilo] = useState(() => (referencia ? normalizaEstilo(referencia.estilo || {}) : null))
  const [inicial, setInicial] = useState(() => (referencia ? normalizaEstilo(referencia.estilo || {}) : null))
  const [recursos, setRecursos] = useState(() => (fila?.recursos || []).map(r => ({
    clave: `s-${r.id}`, id: r.id, tipo: r.tipo, nombre: r.nombre || r.tipo, bytes: Number(r.bytes) || 0, clase: claseGuardada(r),
    archivo: null, palabra: r.palabra || '', estado: 'listo', fraccion: 1, error: '', vista: null,
  })))
  const [errorRecurso, setErrorRecurso] = useState('')
  const [edicion, setEdicion] = useState(() => (fila ? { id: fila.id, precio_eur: fila.precio_eur ?? null } : null))
  const [completo, setCompleto] = useState(yaSubido)
  const [fase, setFase] = useState(!fila ? 'preparado' : yaSubido ? 'subido' : 'cortada')
  const [subida, setSubida] = useState(null) // { fraccion, cargado, total }
  const [error, setError] = useState(() => (!fila ? null : yaSubido
    ? { texto: 'El vídeo ya llegó entero: revisa los recursos y lánzalo.', suave: true }
    : { texto: 'Esta subida se quedó a medias: sigue desde donde iba.', suave: true }))
  const corte = useRef(null)
  const contador = useRef(0)
  const recursosRef = useRef(recursos)
  useEffect(() => { recursosRef.current = recursos }, [recursos])
  // Puede haber en el servidor recursos que la pantalla no tiene (ver limpiaHuerfanos).
  const dudosos = useRef(false)
  const montado = useRef(true)

  const trabajando = TRABAJANDO.includes(fase)
  // El estilo va en `crear`: a partir de ahí es el de este vídeo.
  const bloqueado = Boolean(edicion)
  // El de una subida retomada no se ve desde aquí (la lista no lo trae): no se
  // enseñan unos ajustes que puede que no sean los suyos.
  const estiloGuardado = Boolean(fila && edicion?.id === fila.id)

  useEffect(() => { onTrabajando?.(trabajando) }, [trabajando, onTrabajando])
  useEffect(() => () => onTrabajando?.(false), [onTrabajando])

  // Sin estilo de referencia, el del perfil (o el de HELM).
  useEffect(() => {
    if (referencia) return undefined
    let vivo = true
    const pon = (params) => { if (!vivo) return; const p = normalizaEstilo(params || ESTILO_POR_DEFECTO); setInicial(p); setEstilo(e => e || p) }
    editorApi.estilos(clientId).then(d => pon(d?.porDefecto?.params), () => pon(null))
    return () => { vivo = false }
  }, [clientId, referencia])

  // Al salir: se corta lo que esté subiendo (se sigue luego desde la lista) y
  // se sueltan las miniaturas. Lo que llegue después (un `crear` que estaba en
  // camino) ya no toca la pantalla de fuera.
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      corte.current?.abort()
      recursosRef.current.forEach(r => sueltaUrl(r.vista))
    }
  }, [])

  useEffect(() => {
    if (!trabajando) return undefined
    const avisa = (ev) => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', avisa)
    return () => window.removeEventListener('beforeunload', avisa)
  }, [trabajando])

  async function eligeVideo(archivo) {
    setErrorVideo('')
    if (!archivo) return
    const tipo = String(archivo.type || '')
    const pareceVideo = tipo.startsWith('video/') || (!tipo && EXT_VIDEO.test(archivo.name || ''))
    if (!pareceVideo) { setErrorVideo('Eso no es un vídeo. Sube el archivo tal cual sale del móvil (MP4 o MOV).'); return }
    if (tipo && !TIPOS_VIDEO.includes(tipo) && (NO_MOV.test(tipo) || !EXT_VIDEO.test(archivo.name || ''))) { setErrorVideo('Ese formato de vídeo no vale: exporta a MP4 y vuelve a subirlo.'); return }
    if (!archivo.size) { setErrorVideo('Ese archivo está vacío.'); return }
    if (archivo.size > MAX_MB_SUBIDA * MB) { setErrorVideo(`El vídeo pesa ${mb(archivo.size)}: el máximo son ${MAX_MB_SUBIDA} MB.`); return }
    setLeyendo(true)
    const duracion = await leeDuracion(archivo)
    setLeyendo(false)
    if (duracion != null && duracion > MAX_SEGUNDOS) {
      setErrorVideo(`Ese vídeo dura ${mmss(duracion)}: el máximo son 10 minutos. Recórtalo y vuelve a probar.`)
      return
    }
    setVideo({ archivo, nombre: archivo.name, bytes: archivo.size, duracion })
  }

  const cambiaRecurso = (clave, cambios) => setRecursos(rs => rs.map(r => (r.clave === clave ? { ...r, ...cambios } : r)))

  async function quita(r) {
    setRecursos(rs => rs.filter(x => x.clave !== r.clave))
    sueltaUrl(r.vista)
    if (r.id && edicion) {
      try {
        await editorApi.quitarRecurso(clientId, edicion.id, r.id)
      } catch (e) {
        if (e?.status === 404) return
        // Se queda en el servidor: se vuelve a quitar antes de lanzar.
        dudosos.current = true
        setErrorRecurso(`No he podido quitar «${r.nombre}» todavía (${explica(e).texto}): lo vuelvo a probar antes de lanzar.`)
      }
    }
  }

  function agrega(tipo, lista) {
    setErrorRecurso('')
    const { max } = RECURSOS[tipo]
    const errores = []
    const nuevos = []
    let hay = max > 1 ? recursos.filter(r => r.tipo === tipo).length : 0
    for (const a of Array.from(lista || [])) {
      const revisado = revisaRecurso(tipo, a)
      if (revisado.error) { errores.push(revisado.error); continue }
      if (hay >= max) { if (max > 1) errores.push(`Como mucho ${max} imágenes o clips: «${a.name}» no entra.`); continue }
      hay += 1
      contador.current += 1
      nuevos.push({
        clave: `l-${contador.current}`, id: null, tipo, clase: revisado.clase, archivo: a, nombre: a.name, bytes: a.size,
        palabra: '', estado: 'pendiente', fraccion: 0, error: '',
        vista: revisado.clase === 'imagen' || revisado.clase === 'logo' ? urlLocal(a) : null,
      })
    }
    if (nuevos.length) {
      // Logo y música van de uno en uno: el nuevo sustituye al que hubiera.
      if (max === 1) { const viejo = recursos.find(r => r.tipo === tipo); if (viejo) quita(viejo) }
      setRecursos(rs => [...rs, ...nuevos])
      if (tipo === 'logo' && !bloqueado) setEstilo(e => (e && e.logoPosicion === 'ninguna' ? { ...e, logoPosicion: 'arriba-der' } : e))
    }
    if (errores.length) setErrorRecurso(errores.join(' '))
  }

  /**
   * Quita del servidor los recursos de esta edición que la pantalla no tiene
   * (`nuestros`: los ids que sí): los que llegaron sin que la pantalla se
   * enterase (un reintento tras cortarse la respuesta, «Cancelar» con el
   * archivo ya dentro) o un «quitar» que falló. Al lanzar, el servidor mete
   * también los que no se le nombran: saldrían repetidos en el vídeo que se
   * cobra, y ocupan sitio de los 12.
   */
  async function limpiaHuerfanos(id, nuestros) {
    const d = await editorApi.estado(clientId, id)
    for (const r of d?.edicion?.recursos || []) {
      if (!r?.id || nuestros.has(r.id)) continue
      try { await editorApi.quitarRecurso(clientId, id, r.id) } catch (e) { if (e?.status !== 404) throw e }
    }
  }
  const idsNuestros = (hechos) => new Set([...recursosRef.current.filter(r => r.id).map(r => r.id), ...hechos.values()])

  /** crear → el vídeo por trozos → los recursos → lanzar. Se puede repetir: salta lo hecho. */
  async function edita({ seguir = false } = {}) {
    setError(null)
    const control = new AbortController()
    corte.current = control
    const senal = control.signal
    let ed = edicion
    let subido = completo
    try {
      if (!ed) {
        setFase('creando')
        const r = await editorApi.crear(clientId, {
          nombre: video.archivo.name,
          bytes: video.archivo.size,
          tipo: tipoDeVideo(video.archivo),
          duracion: video.duracion ?? undefined,
          estilo_ref: referencia?.clave || undefined,
          params: estilo,
        })
        ed = r.edicion
        setEdicion(ed)
        // Si el taller ya se cerró, esta edición es una subida a medias más de
        // la lista, no «la de arriba».
        if (montado.current) onCreada(ed); else onCambio()
      }
      if (!subido) {
        if (!video.archivo) throw Object.assign(new Error('Para seguir subiendo el vídeo, elige otra vez el archivo en «Tus vídeos».'), { status: 409 })
        setFase('subiendo')
        const total = video.archivo.size
        const desde = seguir ? Math.min(total, Number((await editorApi.recibidos(clientId, ed.id))?.recibidos) || 0) : 0
        setSubida({ fraccion: desde / total, cargado: desde, total })
        await subePorTrozos({
          url: editorApi.urlTrozo(clientId, ed.id),
          archivo: video.archivo,
          desde,
          senal,
          alProgreso: (fraccion, { cargado, total: t }) => setSubida({ fraccion, cargado, total: t }),
        })
        subido = true
        setCompleto(true)
      }
      const hechos = new Map()
      const pendientes = recursosRef.current.filter(r => r.estado !== 'listo' && r.archivo)
      if (pendientes.length) {
        setFase('recursos')
        // Lo de un intento anterior, fuera antes de volver a subir.
        if (dudosos.current) await limpiaHuerfanos(ed.id, idsNuestros(hechos))
        dudosos.current = true
        let fallos = 0
        for (const r of pendientes) {
          cambiaRecurso(r.clave, { estado: 'subiendo', fraccion: 0, error: '' })
          try {
            const rec = await subeRecurso(clientId, ed.id, r, { senal, alProgreso: (f) => cambiaRecurso(r.clave, { fraccion: f }) })
            hechos.set(r.clave, rec.id)
            cambiaRecurso(r.clave, { estado: 'listo', id: rec.id, fraccion: 1 })
          } catch (e) {
            if (e?.cancelada || senal.aborted) { cambiaRecurso(r.clave, { estado: 'pendiente', fraccion: 0 }); throw e }
            fallos += 1
            cambiaRecurso(r.clave, { estado: 'error', error: explica(e).texto })
          }
        }
        if (fallos) {
          throw new Error(fallos === 1
            ? 'Un recurso no se ha podido subir (lo ves arriba): quítalo o vuelve a probar.'
            : `${fallos} recursos no se han podido subir (los ves arriba): quítalos o vuelve a probar.`)
        }
      }
      setFase('lanzando')
      if (dudosos.current) await limpiaHuerfanos(ed.id, idsNuestros(hechos))
      const listos = recursosRef.current
        .map(r => (hechos.has(r.clave) ? { ...r, id: hechos.get(r.clave), estado: 'listo' } : r))
        .filter(r => r.estado === 'listo' && r.id)
        .map(r => (r.tipo === 'broll' && r.palabra.trim() ? { id: r.id, palabra: r.palabra.trim() } : { id: r.id }))
      const r = await editorApi.lanzar(clientId, ed.id, listos)
      const lanzada = r?.edicion || ed
      // Un «lanzar» repetido de una edición que ya falló (el vídeo no se podía
      // leer, se borraron sus archivos) contesta 200 con ella tal cual: no está en cola.
      if (lanzada.estado === 'error') throw Object.assign(new Error(lanzada.error || 'Este vídeo no se ha podido editar.'), { status: 422 })
      onLanzada(lanzada, video.nombre)
    } catch (e) {
      if (e?.cancelada || senal.aborted) {
        setFase(!ed ? 'preparado' : subido ? 'subido' : 'cortada')
        setError({ texto: subido ? 'Parado. El vídeo ya está subido: lánzalo cuando quieras.' : 'Subida parada. Puedes seguir desde donde iba.', suave: true })
      } else if (!ed) {
        setFase('preparado')
        setError(explica(e))
      } else {
        const total = video.archivo?.size || 0
        const t = trasFallo(e, { subido, total })
        if (t.fase === 'cortada' && subido) setCompleto(false)
        if (t.recibidos != null) setSubida({ fraccion: t.recibidos / total, cargado: t.recibidos, total })
        setFase(t.fase)
        setError(t.texto ? { texto: t.texto, suave: Boolean(t.suave) } : explica(e))
        if (t.fase === 'fallida') onCambio()
      }
    } finally {
      if (corte.current === control) corte.current = null
    }
  }

  async function descarta() {
    if (!edicion) return
    if (!window.confirm('¿Descartar este vídeo? Se borra lo que se haya subido.')) return
    try {
      await editorApi.borrar(clientId, edicion.id)
    } catch (e) {
      // 404: ya no estaba.
      if (e?.status !== 404) { setError(explica(e)); return }
    }
    setEdicion(null); setCompleto(false); setSubida(null); setFase('preparado'); setError(null)
    dudosos.current = false
    // Sin el archivo aquí (se lanzaba una subida ya entera), hay que elegirlo.
    setVideo(v => (v?.archivo ? v : null))
    setRecursos(rs => rs.filter(r => r.archivo).map(r => ({ ...r, id: null, estado: 'pendiente', fraccion: 0, error: '' })))
    onCambio()
  }

  const euros = edicion?.precio_eur != null ? Number(edicion.precio_eur) : precioEditor(video?.duracion)
  const noLlega = Boolean(!edicion && video && noLlegaPara(precios, euros))
  const logo = recursos.find(r => r.tipo === 'logo')
  const datosVideo = video && [
    video.bytes ? mb(video.bytes) : null,
    video.duracion != null ? mmss(video.duracion) : (edicion ? null : 'la duración se mide al subirlo'),
    !video.archivo ? 'ya subido' : null,
  ].filter(Boolean).join(' · ')

  return (
    <section className="ed-taller" aria-labelledby="ed-taller-titulo">
      <div className="ed-taller-cab">
        <button
          type="button" className="ag-volver" onClick={onCerrar} disabled={trabajando}
          title={trabajando ? 'Espera a que acabe la subida o cancélala' : undefined}
        >
          <ArrowLeft size={14} strokeWidth={2.2} /> Estilos
        </button>
        <h2 id="ed-taller-titulo">{referencia ? `Editar con el estilo de @${referencia.nombre}` : 'Editar con tu estilo'}</h2>
        {referencia && <small>{referencia.persona ? `${referencia.persona} · ` : ''}{referencia.nicho}</small>}
      </div>

      <ol className="ed-taller-pasos">
        <li className="ed-paso">
          <h3><span className="ed-paso-num">1</span> Tu vídeo en bruto</h3>
          {video ? (
            <div className="ed-video">
              <Film size={20} aria-hidden="true" />
              <div className="ed-video-txt">
                <b title={video.nombre}>{video.nombre}</b>
                {datosVideo && <small>{datosVideo}</small>}
              </div>
              {!edicion && !trabajando && (
                <button type="button" className="ag-btn sm" onClick={() => { setVideo(null); setErrorVideo('') }}>Cambiar</button>
              )}
            </div>
          ) : (
            <ZonaVideo onElige={eligeVideo} leyendo={leyendo} />
          )}
          {errorVideo && <p className="ed-mal">{errorVideo}</p>}
          <Precio precios={precios} euros={euros} duracion={video?.duracion ?? null} conVideo={Boolean(video)} cerrado={Boolean(edicion)} />
        </li>

        <li className="ed-paso">
          <h3><span className="ed-paso-num">2</span> Recursos <small>opcional</small></h3>
          <Recursos
            recursos={recursos} estilo={estiloGuardado ? null : estilo} bloqueado={bloqueado} trabajando={trabajando} error={errorRecurso}
            onAgrega={agrega} onQuita={quita}
            onPalabra={(clave, palabra) => cambiaRecurso(clave, { palabra })}
            onEstilo={(k, v) => setEstilo(e => normalizaEstilo({ ...e, [k]: v }))}
          />
        </li>

        <li className="ed-paso">
          <h3><span className="ed-paso-num">3</span> El estilo</h3>
          {estiloGuardado ? (
            <p className="ed-ayuda">
              Se edita con el estilo que elegiste al empezar a subirlo{referencia ? ` (el de @${referencia.nombre}, con tus ajustes)` : ''}:
              ya va guardado con el vídeo, también cómo entran los recursos, el sitio del logo y el volumen de la música.
            </p>
          ) : (
            <AjustesEstilo
              clientId={clientId} estilo={estilo} inicial={inicial} referencia={referencia} bloqueado={bloqueado}
              logo={logo?.vista || null} onCambia={setEstilo}
            />
          )}
        </li>
      </ol>

      <div className="ed-accion">
        {subida && (fase === 'subiendo' || fase === 'cortada') && (
          <div className="ed-subida-progreso">
            <div className="ed-barra" role="progressbar" aria-label="Subida del vídeo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(subida.fraccion * 100)}>
              <span style={{ width: `${Math.round(subida.fraccion * 100)}%` }} />
            </div>
            <small>
              {subida.fraccion >= 1 ? 'Vídeo subido.'
                : `${fase === 'subiendo' ? 'Subiendo' : 'Subido'} ${Math.round(subida.fraccion * 100)} % · ${mb(subida.cargado)} de ${mb(subida.total)}.${fase === 'subiendo' ? ' No cierres esta pestaña.' : ''}`}
            </small>
          </div>
        )}
        {fase === 'creando' && <p className="ed-ayuda"><Loader2 size={14} className="ed-gira" /> Preparando la edición…</p>}
        {fase === 'recursos' && <p className="ed-ayuda"><Loader2 size={14} className="ed-gira" /> Subiendo los recursos…</p>}
        {fase === 'lanzando' && <p className="ed-ayuda"><Loader2 size={14} className="ed-gira" /> Mandándolo a editar…</p>}

        <Aviso error={error} />

        <div className="ed-accion-btns">
          {fase === 'preparado' && (
            <button
              type="button" className="ag-btn primario ed-cta" onClick={() => edita()}
              disabled={!video || !estilo || leyendo || noLlega}
            >
              <Scissors size={15} /> Editar vídeo
            </button>
          )}
          {(fase === 'subiendo' || fase === 'recursos') && (
            <button type="button" className="ag-btn" onClick={() => corte.current?.abort()}><X size={14} /> Cancelar</button>
          )}
          {fase === 'cortada' && video?.archivo && (
            <button type="button" className="ag-btn primario ed-cta" onClick={() => edita({ seguir: true })}>
              <RotateCcw size={15} /> Seguir subiendo
            </button>
          )}
          {fase === 'subido' && (
            <button type="button" className="ag-btn primario ed-cta" onClick={() => edita()}>
              <Scissors size={15} /> Lanzar la edición
            </button>
          )}
          {['cortada', 'subido', 'fallida'].includes(fase) && (
            <button type="button" className="ag-btn peligro" onClick={descarta}><Trash2 size={14} /> Descartar</button>
          )}
          {fase === 'fallida' && <button type="button" className="ag-btn" onClick={onCerrar}><X size={14} /> Cerrar</button>}
        </div>
        {fase === 'preparado' && !video && <small className="ed-ayuda">Elige primero el vídeo.</small>}
      </div>
    </section>
  )
}

function Aviso({ error }) {
  if (!error) return null
  return (
    <div className={`ed-aviso${error.suave ? ' suave' : ''}`} role="alert">
      {error.suave ? <Info size={15} /> : <AlertTriangle size={15} />}
      <span>{error.texto}</span>
      {error.sinSaldo && <BotonRecarga detalle={error.texto} />}
    </div>
  )
}

function BotonRecarga({ detalle = null }) {
  return (
    <button type="button" className="ag-btn sm primario" onClick={() => recargarCreditos(detalle)}>
      <Coins size={13} /> {puedeRecargar() ? 'Recargar créditos' : 'Cómo recargar'}
    </button>
  )
}

function ZonaVideo({ onElige, leyendo }) {
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef(null)
  return (
    <div
      className={`ed-subida${arrastrando ? ' arrastrando' : ''}`}
      onDragOver={(ev) => { ev.preventDefault(); setArrastrando(true) }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(ev) => { ev.preventDefault(); setArrastrando(false); onElige(ev.dataTransfer?.files?.[0]) }}
    >
      <input
        ref={input} type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/3gpp,.mp4,.mov,.m4v,.3gp" hidden aria-label="Elegir el vídeo"
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; onElige(f) }}
      />
      <div className="ed-subida-vacia">
        {leyendo ? <Loader2 size={26} className="ed-gira" /> : <Upload size={26} />}
        <b>{leyendo ? 'Mirando cuánto dura…' : 'Arrastra aquí tu vídeo'}</b>
        <small>Vertical, tal cual sale del móvil (MP4 o MOV). Hasta {MAX_MB_SUBIDA} MB y 10 minutos.</small>
        <button type="button" className="ag-btn primario" onClick={() => input.current?.click()} disabled={leyendo}>
          <Upload size={15} /> Elegir vídeo
        </button>
      </div>
    </div>
  )
}

function Precio({ precios, euros, duracion, conVideo, cerrado }) {
  const bloque = aCreditos(PRECIOS_FIJOS['editor-reels'])
  if (precios && !precios.error && !precios.paga) {
    return (
      <div className="ed-precio gratis">
        <Gift size={16} aria-hidden="true" />
        <div><span className="ed-precio-linea"><b>Gratis en tu agencia</b></span><small>Este perfil no paga créditos por editar.</small></div>
      </div>
    )
  }
  if (!conVideo) {
    return (
      <p className="ed-precio-info">
        <Coins size={14} aria-hidden="true" /> Cuesta {bloque} créditos por cada 3 minutos de vídeo en bruto (hasta 10 minutos). Lo ves
        exacto al elegir el vídeo, y solo se cobra si sale bien.
      </p>
    )
  }
  // El saldo, solo si se ve (quien administra la agencia); si no, solo el precio.
  const saldo = precios && !precios.error && precios.saldo != null ? Number(precios.saldo) : null
  const noLlega = !cerrado && noLlegaPara(precios, euros)
  const bloques = Math.max(1, Math.round(euros / PRECIOS_FIJOS['editor-reels']))
  return (
    <div className={`ed-precio${noLlega ? ' mal' : ''}`}>
      <Coins size={16} aria-hidden="true" />
      <div>
        <span className="ed-precio-linea"><b>Esto cuesta {creditos(euros)} créditos</b>{saldo != null && ` · te quedan ${quedan(saldo)}`}</span>
        <small>
          {duracion != null
            ? `${mmss(duracion)} de vídeo: ${bloques} × ${bloque} créditos (por cada 3 minutos empezados). Solo se cobra si sale bien.`
            : cerrado
              ? `Es el precio de cuando empezaste a subirlo (${bloque} créditos por cada 3 minutos): al lanzarlo se confirma con lo que dura de verdad. Solo se cobra si sale bien.`
              : `No he podido leer cuánto dura: el precio exacto sale al subirlo (${bloque} créditos por cada 3 minutos).`}
        </small>
        {noLlega && (
          <div className="ed-precio-recarga">
            <small className="ed-mal">{saldo != null ? 'No te llega el saldo para este vídeo.' : 'La agencia no tiene créditos suficientes para este vídeo.'}</small>
            <BotonRecarga />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Los recursos ────────────────────────────────────────────────────────────

/** Un botón que abre el selector de archivos (el input va escondido). */
function BotonArchivo({ acepta, multiple = false, disabled, etiqueta, children, onElige, className = 'ag-btn sm' }) {
  const input = useRef(null)
  return (
    <>
      <input
        ref={input} type="file" accept={acepta} multiple={multiple} hidden aria-label={etiqueta}
        onChange={(ev) => { const fs = Array.from(ev.target.files || []); ev.target.value = ''; if (fs.length) onElige(fs) }}
      />
      <button type="button" className={className} onClick={() => input.current?.click()} disabled={disabled}>{children}</button>
    </>
  )
}

const ICONO_CLASE = { imagen: ImagenIcono, clip: Film, logo: Stamp, audio: Music }
const ESTADO_RECURSO = { pendiente: 'se sube al editar', subiendo: 'subiendo…', listo: 'subido', error: 'no se ha podido subir' }

function ItemRecurso({ r, conPalabra, trabajando, onQuita, onPalabra }) {
  const Icono = ICONO_CLASE[r.clase] || ImagenIcono
  return (
    <li className={`ed-rec ${r.estado}`}>
      <span className="ed-rec-mini">{r.vista ? <img src={r.vista} alt="" /> : <Icono size={18} aria-hidden="true" />}</span>
      <div className="ed-rec-txt">
        <b title={r.nombre}>{r.nombre}</b>
        <small>{r.bytes ? `${mb(r.bytes)} · ` : ''}{ESTADO_RECURSO[r.estado] || r.estado}</small>
        {r.estado === 'subiendo' && (
          <div className="ed-barra fina" role="progressbar" aria-label={`Subida de ${r.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.fraccion * 100)}>
            <span style={{ width: `${Math.round(r.fraccion * 100)}%` }} />
          </div>
        )}
        {r.error && <small className="ed-mal">{r.error}</small>}
      </div>
      {conPalabra && (
        <label className="ed-rec-palabra">
          <span>Cuando diga…</span>
          <input
            type="text" value={r.palabra} maxLength={40} placeholder="p. ej. factura" aria-label={`Cuando diga… (${r.nombre})`}
            onChange={(ev) => onPalabra(r.clave, ev.target.value)}
          />
        </label>
      )}
      <button type="button" className="ag-btn sm peligro ed-rec-quitar" onClick={() => onQuita(r)} disabled={trabajando} aria-label={`Quitar ${r.nombre}`} title="Quitar">
        <X size={13} />
      </button>
    </li>
  )
}

function Recursos({ recursos, estilo, bloqueado, trabajando, error, onAgrega, onQuita, onPalabra, onEstilo }) {
  const broll = recursos.filter(r => r.tipo === 'broll')
  const logo = recursos.filter(r => r.tipo === 'logo')
  const musica = recursos.filter(r => r.tipo === 'musica')
  const item = (r, conPalabra = false) => (
    <ItemRecurso key={r.clave} r={r} conPalabra={conPalabra} trabajando={trabajando} onQuita={onQuita} onPalabra={onPalabra} />
  )
  return (
    <div className="ed-recursos">
      <p className="ed-ayuda">
        Las imágenes y clips de apoyo entran cuando dices la palabra que les pongas en «Cuando diga…» (sin palabra, HELM los reparte
        en los huecos). El logo va encima todo el vídeo y la música, debajo de tu voz. Los subtítulos siempre quedan por encima.
      </p>

      <div className="ed-rec-grupo">
        <div className="ed-rec-cab">
          <ImagenIcono size={16} aria-hidden="true" />
          <div><b>Imágenes y clips</b><small>{broll.length} de {RECURSOS.broll.max} · JPG, PNG o WebP hasta 15 MB · MP4 o MOV hasta 90 MB</small></div>
          <BotonArchivo
            acepta={RECURSOS.broll.acepta} multiple etiqueta="Añadir imágenes o clips"
            disabled={trabajando || broll.length >= RECURSOS.broll.max} onElige={(fs) => onAgrega('broll', fs)}
          >
            <Plus size={13} /> Añadir
          </BotonArchivo>
        </div>
        {broll.length > 0 && <ul className="ed-rec-lista">{broll.map(r => item(r, true))}</ul>}
        {broll.length > 0 && estilo && (
          <div className="ed-rec-ajustes">
            <div className="ed-rec-modo">
              <span>Cómo entran</span>
              <div className="ed-segmento" role="radiogroup" aria-label="Cómo entran">
                {Object.entries(MODOS_RECURSOS).map(([k, t]) => (
                  <label key={k} className={estilo.recursosModo === k ? 'on' : ''}>
                    <input type="radio" name="ed-modo" value={k} checked={estilo.recursosModo === k} disabled={bloqueado} onChange={() => onEstilo('recursosModo', k)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
            <Deslizador k="recursoDuracion" estilo={estilo} disabled={bloqueado} onCambia={onEstilo} />
          </div>
        )}
      </div>

      <div className="ed-rec-grupo">
        <div className="ed-rec-cab">
          <Stamp size={16} aria-hidden="true" />
          <div><b>Logo</b><small>PNG o WebP hasta 5 MB, mejor con el fondo transparente</small></div>
          <BotonArchivo acepta={RECURSOS.logo.acepta} etiqueta="Elegir logo" disabled={trabajando} onElige={(fs) => onAgrega('logo', fs)}>
            <Plus size={13} /> {logo.length ? 'Cambiar' : 'Añadir'}
          </BotonArchivo>
        </div>
        {logo.length > 0 && <ul className="ed-rec-lista">{logo.map(r => item(r))}</ul>}
        {logo.length > 0 && estilo && (
          <label className="ed-rec-select">
            <span>Dónde va</span>
            <select value={estilo.logoPosicion} disabled={bloqueado} onChange={(ev) => onEstilo('logoPosicion', ev.target.value)} aria-label="Dónde va el logo">
              {Object.entries(POSICIONES_LOGO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="ed-rec-grupo">
        <div className="ed-rec-cab">
          <Music size={16} aria-hidden="true" />
          <div><b>Música</b><small>MP3, M4A o WAV hasta 30 MB; va en bucle y baja cuando hablas</small></div>
          <BotonArchivo acepta={RECURSOS.musica.acepta} etiqueta="Elegir música" disabled={trabajando} onElige={(fs) => onAgrega('musica', fs)}>
            <Plus size={13} /> {musica.length ? 'Cambiar' : 'Añadir'}
          </BotonArchivo>
        </div>
        {musica.length > 0 && <ul className="ed-rec-lista">{musica.map(r => item(r))}</ul>}
        {musica.length > 0 && estilo && (
          <div className="ed-rec-ajustes">
            <Deslizador k="musicaVolumen" estilo={estilo} disabled={bloqueado} onCambia={onEstilo} />
          </div>
        )}
      </div>

      {bloqueado && recursos.length > 0 && <small className="ed-ayuda">Cómo entran, el sitio del logo y el volumen ya se guardaron con el vídeo.</small>}
      {error && <p className="ed-mal">{error}</p>}
    </div>
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
  recursoDuracion: 'Cuánto dura cada uno (s)',
  musicaVolumen: 'Volumen de la música',
}
const FORMATO = {
  zoomFactor: (v) => `×${v.toFixed(2)}`,
  similitudTomas: (v) => `${Math.round(v * 100)} %`,
  posicion: (v) => `${v} %`,
  tamano: (v) => `${v} px`,
  musicaVolumen: (v) => `${Math.round(v * 100)} %`,
}

function Deslizador({ k, estilo, disabled = false, onCambia, d = 2 }) {
  const r = RANGOS_ESTILO[k]
  return (
    <label className="ed-desliza">
      <span className="ed-etq">{ETIQUETAS[k]} <b>{FORMATO[k] ? FORMATO[k](estilo[k]) : Number(estilo[k]).toLocaleString('es-ES', { maximumFractionDigits: d })}</b></span>
      <input type="range" min={r.min} max={r.max} step={r.paso} value={estilo[k]} disabled={disabled} aria-label={ETIQUETAS[k]} onChange={(ev) => onCambia(k, Number(ev.target.value))} />
    </label>
  )
}

const resumenEstilo = (e) => (!e ? '' : [
  e.subtitulos ? `${e.palabrasPorBloque} ${e.palabrasPorBloque === 1 ? 'palabra' : 'palabras'}${e.mayusculas ? ' en mayúsculas' : ''}` : 'sin subtítulos',
  e.zoom ? `zoom cada ${String(e.zoomCada).replace('.', ',')} s` : 'sin zoom',
  e.recursosModo === 'arriba' ? 'recursos arriba' : null,
].filter(Boolean).join(' · '))

function AjustesEstilo({ clientId, estilo, inicial, referencia, bloqueado, logo, onCambia }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState('') // '' | 'guardando' | 'ok'
  const [error, setError] = useState('')
  const cambia = (k, v) => { setEstado(''); onCambia(x => normalizaEstilo({ ...x, [k]: v })) }

  async function guarda() {
    setEstado('guardando'); setError('')
    try {
      await editorApi.guardarEstilo(clientId, estilo)
      setEstado('ok')
    } catch (err) { setError(explica(err).texto); setEstado('') }
  }

  const deslizador = (k, d = 2) => <Deslizador key={k} k={k} estilo={estilo} d={d} onCambia={cambia} />
  const casilla = (k, texto) => (
    <label className="ed-check" key={k}>
      <input type="checkbox" checked={Boolean(estilo[k])} onChange={(ev) => cambia(k, ev.target.checked)} /> {texto}
    </label>
  )
  const color = (k, texto) => (
    <label className="ed-color" key={k}>
      <input type="color" value={estilo[k]} onChange={(ev) => cambia(k, ev.target.value.toUpperCase())} /> {texto}
    </label>
  )
  const cambiado = estilo && inicial && JSON.stringify(estilo) !== JSON.stringify(inicial)

  return (
    <div className="ed-caja ed-caja-estilo">
      <button type="button" className="ed-caja-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
        <Palette size={16} /> <b>Ajustar el estilo</b> <small>{resumenEstilo(estilo)}</small>
        <span>{abierto ? 'Cerrar' : 'Ajustar'}</span>
      </button>
      {abierto && (
        !estilo ? <p className="ed-ayuda ed-dentro"><Loader2 size={14} className="ed-gira" /> Cargando…</p> : (
          <div className="ed-estilo">
            <VistaPrevia estilo={estilo} logo={logo} />
            <div className="ed-estilo-campos">
              {bloqueado && <p className="ed-ayuda">El estilo se guardó con el vídeo al empezar a subirlo: ya no se puede cambiar.</p>}
              <fieldset className="ed-estilo-grupos" disabled={bloqueado}>
                <fieldset>
                  <legend>Subtítulos</legend>
                  {casilla('subtitulos', 'Subtítulos palabra a palabra')}
                  {estilo.subtitulos && (
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
                  {estilo.zoom && deslizador('zoomCada', 1)}
                  {estilo.zoom && deslizador('zoomFactor')}
                </fieldset>
                <fieldset>
                  <legend>Cortes</legend>
                  {deslizador('silencioMax')}
                  {deslizador('silencioDeja')}
                  {casilla('quitarTomas', 'Quitar las tomas repetidas (se queda la última)')}
                  {estilo.quitarTomas && deslizador('similitudTomas')}
                  {casilla('quitarMuletillas', 'Quitar muletillas sueltas («eh», «mmm», «a ver»)')}
                  <p className="ed-ayuda">
                    Un silencio más largo que «Silencio que se corta» se queda en «Respiro que se deja». Con más «Parecido entre
                    tomas», solo se quitan las que empiezan casi igual.
                  </p>
                </fieldset>
              </fieldset>
              <div className="ed-estilo-acc">
                <button type="button" className="ag-btn sm" onClick={guarda} disabled={estado === 'guardando'}>
                  {estado === 'guardando' ? <><Loader2 size={13} className="ed-gira" /> Guardando…</> : <><Save size={13} /> Guardar como estilo del perfil</>}
                </button>
                {!bloqueado && (
                  <button type="button" className="ag-btn sm" onClick={() => { setEstado(''); onCambia(inicial) }} disabled={!cambiado}>
                    <RotateCcw size={13} /> {referencia ? `Volver al de @${referencia.nombre}` : 'Deshacer cambios'}
                  </button>
                )}
                {estado === 'ok' && <span className="ed-ok"><Check size={13} /> Guardado: «Editar con mi estilo» empezará así.</span>}
                {error && <span className="ed-mal">{error}</span>}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ── La lista ────────────────────────────────────────────────────────────────

/** Lo que ha costado (o costará) una edición, en créditos; '' si no hay nada que decir. */
function cobroDe(e, paga) {
  const cobrado = e.cobrado_eur == null ? null : Number(e.cobrado_eur)
  if (cobrado > 0) return `${creditos(cobrado)} créditos`
  if (paga === false) return e.estado === 'listo' ? 'gratis' : ''
  const precio = e.precio_eur == null ? null : Number(e.precio_eur)
  if (precio == null) return ''
  if (EN_MARCHA.includes(e.estado)) return `costará ${creditos(precio)} créditos`
  if (e.estado === 'error') return 'sin cobrar'
  if (e.estado === 'listo' && cobrado === 0) return 'gratis'
  return ''
}

function ListaEdiciones({ clientId, ediciones, recargar, activa, bloqueada, paga, onRetomar }) {
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
    } catch (err) { setError(explica(err).texto) }
    setOcupado('')
  }
  async function borrar(e) {
    if (!window.confirm(`¿Borrar «${e.nombre_original || 'este vídeo'}»? Se borran el original y el editado.`)) return
    setOcupado(e.id); setError('')
    try { await editorApi.borrar(clientId, e.id); await recargar() } catch (err) { setError(explica(err).texto) }
    setOcupado('')
  }
  function sigue(e, archivo) {
    setError('')
    if (e.nombre_original && archivo.name !== e.nombre_original) { setError(`Ese no es el mismo vídeo: para seguir, elige «${e.nombre_original}».`); return }
    if (e.bytes && archivo.size !== Number(e.bytes)) { setError(`«${archivo.name}» no pesa lo mismo que el que empezaste a subir: elige el mismo archivo.`); return }
    onRetomar(e, archivo)
  }

  return (
    <>
      {error && <p className="ag-error">{error}</p>}
      <ul className="ed-lista">
        {ediciones.map(e => {
          const aqui = e.estado === 'subiendo' && activa === e.id
          const aMedias = e.estado === 'subiendo' && !aqui
          // Llegó entera pero no se lanzó (p. ej. faltaba saldo): ya no hace falta el archivo.
          const entera = aMedias && subidaEntera(e)
          const Icono = ICONO[e.estado] || Clock
          const vivo = EN_MARCHA.includes(e.estado) && !aMedias
          const viejo = caducado(e)
          const ref = buscaReferencia(e.estilo_ref)
          const cobro = cobroDe(e, paga)
          const nRecursos = Array.isArray(e.recursos) ? e.recursos.length : 0
          return (
            <li key={e.id} className={`ed-item ${e.estado}${aMedias ? ' a-medias' : ''}`}>
              <div className="ed-item-cab">
                <span className="ed-estado">
                  <Icono size={14} className={vivo && !['en_cola', 'subiendo'].includes(e.estado) ? 'ed-gira' : ''} />
                  {' '}{entera ? 'Falta lanzarlo' : aMedias ? 'Subida a medias' : ESTADOS_EDICION[e.estado] || e.estado}
                </span>
                <div className="ed-item-txt">
                  <b title={e.nombre_original}>{e.nombre_original || 'Vídeo'}</b>
                  <small>
                    {fecha(e.created_at)}
                    {e.duracion_original != null && <> · {mmss(e.duracion_original)}{e.duracion_final != null && <> → <b>{mmss(e.duracion_final)}</b></>}</>}
                    {ref && ` · estilo @${ref.nombre}`}
                    {nRecursos > 0 && ` · ${nRecursos} ${nRecursos === 1 ? 'recurso' : 'recursos'}`}
                    {cobro && <> · <span className="ed-cobro">{cobro}</span></>}
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
                  {entera && (
                    <button
                      type="button" className="ag-btn primario sm" onClick={() => onRetomar(e, null)} disabled={bloqueada}
                      title={bloqueada ? 'Espera a que acabe la subida de arriba o cancélala' : undefined}
                      aria-label={`Lanzar la edición de ${e.nombre_original || 'el vídeo'}`}
                    >
                      <Scissors size={13} /> Lanzar la edición
                    </button>
                  )}
                  {aMedias && !entera && (
                    <BotonArchivo
                      acepta="video/*" etiqueta={`Seguir subiendo ${e.nombre_original || 'el vídeo'}`} onElige={(fs) => sigue(e, fs[0])}
                      className="ag-btn primario sm" disabled={bloqueada}
                    >
                      <RotateCcw size={13} /> Seguir subiendo
                    </BotonArchivo>
                  )}
                  {!aqui && (
                    <button type="button" className="ag-btn sm peligro" onClick={() => borrar(e)} disabled={ocupado === e.id} aria-label="Borrar" title="Borrar">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {aqui && <small className="ed-item-nota">Lo tienes abierto en el taller de arriba.</small>}
              {entera && <small className="ed-item-nota">El vídeo llegó entero pero no se lanzó (¿faltaba saldo?): lánzalo desde aquí, sin volver a subirlo.</small>}
              {aMedias && !entera && <small className="ed-item-nota">Se cortó antes de terminar: elige otra vez el mismo archivo y sigue desde donde iba.</small>}
              {aMedias && bloqueada && <small className="ed-item-nota">Para seguir con este, espera a que acabe la subida de arriba o cancélala.</small>}
              {vivo && !aqui && (
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
    editorApi.estado(clientId, id).then(r => vivo && setD(r.edicion)).catch(e => vivo && setError(explica(e).texto))
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
