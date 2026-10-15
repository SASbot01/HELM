// HELM — el bot de Telegram de la agencia.
//
// Un solo bot para la agencia de la casa y todos sus perfiles: se le escribe
// normal desde el móvil y él reconoce de qué perfil se habla («DCC», «Hugo»…).
// Lo que solo lee lo contesta al momento; lo que escribe o gasta créditos lo
// propone antes con botones de Aprobar y Rechazar. Ver api/telegram-agencia.js.
//
// Aquí cada superadmin vincula SU Telegram con un código de un solo uso, y la
// cuenta de plataforma registra el webhook. El token del bot no llega nunca al
// navegador: solo @usuario y cómo está el webhook (sin su URL).
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, ExternalLink, Link2, Power, RefreshCw, Send, ShieldCheck, Unlink } from 'lucide-react'
import { telegramAgenciaApi } from './lib'
import { FormNote } from './ui'
import './perfiles.css'

const EJEMPLOS = [
  '¿Cuánto ha cobrado DCC este mes?',
  'Apunta en Hugo un gasto de 30 € de IA',
  'Lanza el guionista en Detrás de Cámaras',
  '¿Qué leads nuevos han entrado esta semana en En Forma con Hugo?',
]

// Lo que dura un código si el servidor no dice cuánto (MINUTOS_VINCULO en api/_lib/telegram.js).
const MINUTOS_CODIGO = 15
// Un fallo de entrega más viejo que esto, sin mensajes esperando, ya pasó.
const FALLO_RECIENTE_MS = 15 * 60_000

const fechaLarga = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function hace(ms) {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

// Cuánto hace del último fallo de entrega, con el reloj del servidor si lo da
// (`ahora`) o con el momento en que llegó el estado.
function edadDelFallo(estado, leido) {
  const t = Date.parse(estado?.webhook?.ultimoErrorFecha)
  const ref = Date.parse(estado?.ahora) || leido
  return Number.isFinite(t) && Number.isFinite(ref) ? Math.max(0, ref - t) : null
}

// Si Telegram le entrega a HELM los mensajes del bot. La URL del webhook no se
// enseña: si se la quedó el bot de un perfil, lleva su secreto en la query.
// Telegram recuerda el último fallo aunque luego todo vaya bien (basta un
// reinicio de la API en un despliegue): solo cuenta si es reciente o si hay
// mensajes esperando, que es cuando sigue reintentando.
function webhookDe(estado, leido) {
  if (!estado?.bot) return estado?.configurado === false ? 'sin-token' : 'sin-bot'
  const w = estado.webhook
  if (!w) return 'desconocido'
  if (!w.url && !w.propio) return 'sin-registrar'
  const propio = typeof w.propio === 'boolean' ? w.propio : String(w.url).includes('/api/telegram-agencia')
  if (!propio) return 'en-otro-sitio'
  if (!w.ultimoError) return 'activo'
  const edad = edadDelFallo(estado, leido)
  return Number(w.pendientes) > 0 || (edad != null && edad < FALLO_RECIENTE_MS) ? 'con-error' : 'activo'
}

const INSIGNIA = {
  'sin-token': ['red', 'Sin configurar'],
  'sin-bot': ['red', 'Sin conexión'],
  'sin-registrar': ['amber', 'Sin activar'],
  'en-otro-sitio': ['amber', 'Sin activar'],
  'con-error': ['amber', 'Con fallos'],
  activo: ['green', 'Activo'],
}

// El final del código en el reloj de este navegador, a partir de lo que le
// queda según el servidor: si el ordenador va adelantado o atrasado, la
// cuenta atrás no se entera.
function finDelCodigo(c, recibido) {
  const segundos = Number(c?.segundos)
  if (Number.isFinite(segundos) && segundos > 0) return recibido + segundos * 1000
  const dura = Date.parse(c?.caduca) - Date.parse(c?.ahora)
  if (Number.isFinite(dura) && dura > 0) return recibido + dura
  return recibido + MINUTOS_CODIGO * 60_000
}

export default function TelegramAgencia() {
  const [estado, setEstado] = useState(null)
  const [leido, setLeido] = useState(null)          // cuándo llegó el estado (reloj del navegador)
  const [fallo, setFallo] = useState(null)          // no se pudo leer el estado
  const [codigo, setCodigo] = useState(null)        // { codigo, enlace, caduca, fin }
  const [restante, setRestante] = useState(null)    // segundos que le quedan al código
  const [qr, setQr] = useState(null)                // { enlace, src }
  const [ocupado, setOcupado] = useState(null)      // 'activar' | 'codigo' | 'desvincular'
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const mirando = useRef(false)

  const cargar = () => telegramAgenciaApi.estado()
    .then(e => { setEstado(e); setLeido(Date.now()); setFallo(null) })
    .catch(e => setFallo(e.message))
  useEffect(() => { cargar() }, [])

  // Cuenta atrás del código, como en la tarjeta de Telegram de Ajustes: el
  // intervalo solo repinta y el primer valor llega en un cuarto de segundo.
  const fin = codigo?.fin
  useEffect(() => {
    if (!fin) return undefined
    const id = setInterval(() => setRestante(Math.max(0, Math.round((fin - Date.now()) / 1000))), 250)
    return () => clearInterval(id)
  }, [fin])
  const agotado = restante === 0

  // Mientras el código vive se pregunta cada pocos segundos si ya llegó por
  // Telegram, y en el acto al volver a esta pestaña (desde el móvil se sale a
  // Telegram y se vuelve): en cuanto hay vínculo, se enseña. Nunca dos
  // preguntas a la vez, aunque el servidor tarde.
  const vivo = Boolean(codigo) && !agotado
  useEffect(() => {
    if (!vivo) return undefined
    const mira = () => {
      if (mirando.current) return
      mirando.current = true
      telegramAgenciaApi.vinculo().then(e => {
        if (!e?.vinculado) return
        setEstado(antes => ({ ...antes, ...e })); setCodigo(null); setRestante(null)
        const quien = e.vinculado.tg_nombre
        setAviso(quien
          ? `Listo: vinculado con ${quien}. Si no eres tú, desvincúlalo ahora.`
          : 'Listo: tu Telegram ya está vinculado. Escríbele al bot cuando quieras.')
      }).catch(() => {}).finally(() => { mirando.current = false })
    }
    const id = setInterval(mira, 4000)
    const alVolver = () => { if (document.visibilityState === 'visible') mira() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [vivo])

  // Al caducar se mira una última vez: pudo vincularse en el último segundo.
  useEffect(() => { if (agotado) cargar() }, [agotado])

  // El QR del mismo enlace, para cuando el panel está abierto en el ordenador.
  const enlace = codigo?.enlace
  useEffect(() => {
    if (!enlace) return
    QRCode.toDataURL(enlace, { margin: 1, width: 296 }).then(src => setQr({ enlace, src })).catch(() => {})
  }, [enlace])

  async function activar() {
    // Registrar el webhook tira lo que Telegram tenga sin entregar, también
    // pulsaciones de Aprobar o Rechazar que aún iba a reintentar.
    const n = Number(estado?.webhook?.pendientes) || 0
    if (n > 0 && !window.confirm(`Telegram tiene ${n} ${n === 1 ? 'mensaje' : 'mensajes'} sin entregar. Al activar el bot se descartan, también los Aprobar o Rechazar que haya en ellos. ¿Activarlo igualmente?`)) return
    setOcupado('activar'); setError(null); setAviso(null)
    try {
      await telegramAgenciaApi.registrar()
      await cargar()
      setAviso('Bot activado: Telegram ya le entrega los mensajes a HELM.')
    } catch (e) { setError(e.message) }
    setOcupado(null)
  }

  async function vincular() {
    setOcupado('codigo'); setError(null); setAviso(null)
    try {
      const c = await telegramAgenciaApi.codigo()
      setRestante(null)
      setCodigo({ ...c, fin: finDelCodigo(c, Date.now()) })
    } catch (e) { setError(e.message) }
    setOcupado(null)
  }

  async function desvincular() {
    const quien = estado?.vinculado?.tg_nombre
    if (!window.confirm(`¿Desvincular ${quien ? `a ${quien}` : 'tu Telegram'}? El bot dejará de contestarte hasta que vuelvas a vincularte.`)) return
    setOcupado('desvincular'); setError(null); setAviso(null)
    try {
      await telegramAgenciaApi.desvincular()
      setCodigo(null); setRestante(null)
      await cargar()
      setAviso('Desvinculado. El bot ya no te contesta.')
    } catch (e) { setError(e.message) }
    setOcupado(null)
  }

  return (
    <VistaTelegram
      estado={estado} leido={leido} fallo={fallo} codigo={codigo} restante={restante}
      qr={qr && qr.enlace === enlace ? qr.src : null}
      ocupado={ocupado} error={error} aviso={aviso}
      onActivar={activar} onVincular={vincular} onDesvincular={desvincular} onReintentar={cargar}
    />
  )
}

/** Lo que se ve, según el estado del servidor y el código vivo (sin efectos). */
export function VistaTelegram({
  estado, leido, fallo, codigo, restante, qr, ocupado, error, aviso,
  onActivar, onVincular, onDesvincular, onReintentar,
}) {
  if (!estado) {
    if (!fallo) return <p className="helm-settings-lead">Cargando…</p>
    return (
      <div className="helm-tg">
        <FormNote>No se ha podido leer el estado del bot: {fallo}</FormNote>
        <div><button type="button" className="helm-btn" onClick={onReintentar}><RefreshCw size={15} /> Reintentar</button></div>
      </div>
    )
  }

  const { bot, vinculado, permitido, plataforma } = estado
  const webhook = webhookDe(estado, leido)
  // Sin webhook registrado Telegram no entrega nada, ni el código de vincular.
  const entrega = !['sin-token', 'sin-bot', 'sin-registrar', 'en-otro-sitio'].includes(webhook)
  const [tono, etiqueta] = INSIGNIA[webhook] || []
  const usuario = bot?.username ? `@${bot.username}` : 'el bot'
  const chat = bot?.username ? `https://t.me/${encodeURIComponent(bot.username)}` : null
  const enlace = typeof codigo?.enlace === 'string' && codigo.enlace.startsWith('https://t.me/') ? codigo.enlace : null
  const caducado = Boolean(codigo) && restante === 0
  const pendientes = Number(estado.webhook?.pendientes) || 0
  const ultimoError = estado.webhook?.ultimoError
  const edad = edadDelFallo(estado, leido)
  // La plataforma tiene que (re)activar el bot: ese es entonces el botón de oro.
  const activable = plataforma && bot && webhook !== 'activo'

  let sinBot = null
  if (!bot) {
    if (webhook === 'sin-token') {
      sinBot = plataforma
        ? 'Falta el token del bot en el servidor: HELM_TELEGRAM_TOKEN (y HELM_TELEGRAM_SECRETO) en el entorno de la API. Ponlos y reinicia la API.'
        : 'Todavía no está configurado en el servidor. Avisa a quien administra HELM.'
    } else if (!plataforma) {
      sinBot = 'Ahora mismo no se puede hablar con el bot. Si sigue así, avisa a quien administra HELM.'
    } else if (estado.configurado === true) {
      sinBot = 'El token está puesto, pero Telegram no lo acepta o no contesta. Si lo revocaste en BotFather, pon el nuevo en HELM_TELEGRAM_TOKEN y reinicia la API; si no, vuelve a mirar en un rato.'
    } else {
      sinBot = 'No se puede hablar con el bot: falta HELM_TELEGRAM_TOKEN en el entorno de la API, el token ya no vale (revocado en BotFather) o Telegram no contesta.'
    }
  }

  return (
    <div className="helm-tg">
      {permitido ? (
        <p className="helm-settings-lead">
          Un bot para toda la agencia: le escribes desde el móvil como a una persona, le dices de qué perfil hablas
          («DCC», «Hugo», «Detrás de Cámaras»…) y trabaja con todo HELM por ti.
        </p>
      ) : (
        <p className="helm-settings-lead">
          El bot de Telegram de HELM no está disponible para tu agencia. Puedes trabajar con tus perfiles desde
          Claude, con el conector de la agencia (en Créditos).
        </p>
      )}

      {(permitido || plataforma) && (
        <div className="helm-settings-row helm-tg-bot">
          <div>
            <b><Send size={14} /> {bot ? usuario : webhook === 'sin-token' ? 'Bot sin configurar' : 'Bot sin conexión'}</b>
            <small>{bot ? bot.nombre || 'Bot de Telegram de HELM' : sinBot}</small>
          </div>
          <div className="helm-settings-actions">
            {etiqueta && <span className={'helm-badge ' + tono}>{etiqueta}</span>}
            {!bot && <button type="button" className="helm-btn sm" onClick={onReintentar}><RefreshCw size={13} /> Volver a mirar</button>}
          </div>
        </div>
      )}
      {plataforma && webhook === 'activo' && ultimoError && (
        <p className="helm-tg-nota">
          Último fallo de entrega{edad != null && ` (${hace(edad)})`}: «{ultimoError}». No hay mensajes esperando: desde entonces llegan bien.
        </p>
      )}

      <FormNote tone="ok">{aviso}</FormNote>
      <FormNote>{error}</FormNote>

      {activable && (
        <div className="helm-settings-block">
          <label>Activar el bot</label>
          <p>
            {webhook === 'sin-registrar' && 'Telegram aún no sabe a dónde mandar los mensajes del bot. Al activarlo se los entrega a HELM y se publican sus comandos.'}
            {webhook === 'en-otro-sitio' && 'El bot está mandando sus mensajes a otro sitio, no a este HELM. Actívalo de nuevo para que lleguen aquí.'}
            {webhook === 'con-error' && <>
              Telegram no consigue entregarle los mensajes a HELM: «{ultimoError}»{edad != null && ` (${hace(edad)})`}
              {pendientes > 0 && <> ({pendientes} {pendientes === 1 ? 'mensaje esperando' : 'mensajes esperando'})</>}.
              Comprueba que HELM_PUBLIC_URL apunta a este servidor y vuelve a activarlo
              {pendientes > 0 ? ': al hacerlo se descartan los que esperan.' : '.'}
            </>}
            {webhook === 'desconocido' && 'No se ha podido preguntar a Telegram cómo está el bot. Si no contesta, vuelve a activarlo.'}
          </p>
          <button type="button" className="helm-btn primary" onClick={onActivar} disabled={ocupado === 'activar'}>
            <Power size={15} /> {ocupado === 'activar' ? 'Activando…' : 'Activar el bot'}
          </button>
        </div>
      )}
      {!plataforma && permitido && bot && !entrega && (
        <FormNote tone="warn">El bot todavía no está activado. Lo activa la cuenta de plataforma de HELM; en cuanto lo esté podrás vincular tu Telegram.</FormNote>
      )}
      {!plataforma && permitido && webhook === 'con-error' && (
        <FormNote tone="warn">Telegram está teniendo problemas para entregarle los mensajes a HELM. Si el bot no te contesta, avisa a la plataforma.</FormNote>
      )}

      {vinculado ? (
        <div className="helm-settings-block">
          <label>Tu Telegram</label>
          <div className="helm-settings-row">
            <div>
              <b><Check size={14} /> Vinculado con {vinculado.tg_nombre || 'tu cuenta'}</b>
              {vinculado.vinculado_at && <small>desde el {fechaLarga(vinculado.vinculado_at)}</small>}
            </div>
            <div className="helm-settings-actions">
              {chat && permitido && (
                <a className="helm-btn" href={chat} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir</a>
              )}
              <button type="button" className="helm-btn" onClick={onDesvincular} disabled={ocupado === 'desvincular'}>
                <Unlink size={15} /> {ocupado === 'desvincular' ? 'Desvinculando…' : 'Desvincular'}
              </button>
            </div>
          </div>
        </div>
      ) : permitido && bot && entrega && (
        <div className="helm-settings-block">
          <label>Tu Telegram</label>
          {codigo && !caducado ? (
            <div className="helm-tg-codigo">
              <div className="helm-tg-pasos">
                {enlace && (
                  <a className="helm-btn primary helm-tg-abrir" href={enlace} target="_blank" rel="noreferrer">
                    <Send size={17} /> Abrir Telegram y vincular
                  </a>
                )}
                <p>
                  Púlsalo desde el móvil y dale a <b>Iniciar</b> en el chat de {usuario}.
                  {restante != null && <> El código caduca en <b className="helm-tg-cuenta">{mmss(restante)}</b>.</>}
                </p>
                <p>Si no se abre, búscalo en Telegram y escríbele esto:</p>
                <Copiable valor={`/vincular ${codigo.codigo}`} />
              </div>
              {qr && enlace && (
                <figure className="helm-tg-qr">
                  <img src={qr} alt="Código QR del enlace para vincular" width={148} height={148} />
                  <figcaption>O escanéalo con la cámara del móvil</figcaption>
                </figure>
              )}
            </div>
          ) : (
            <>
              <p>
                {caducado
                  ? <>
                    El código ha caducado sin usarse. Pide otro: cada uno sirve una sola vez y caduca a los pocos minutos.
                    Si el bot te contestó que ese Telegram ya estaba vinculado, lo está con otra cuenta de HELM: escríbele
                    /desvincular y vuelve a intentarlo.
                  </>
                  : 'Vincúlate una vez desde el móvil y el bot ya sabe que eres tú. Solo contesta a cuentas vinculadas.'}
              </p>
              <button type="button" className={'helm-btn' + (activable ? '' : ' primary')} onClick={onVincular} disabled={ocupado === 'codigo'}>
                <Link2 size={15} /> {ocupado === 'codigo' ? 'Generando…' : caducado ? 'Pedir otro código' : 'Vincular mi Telegram'}
              </button>
            </>
          )}
        </div>
      )}

      {permitido && (
        <div className="helm-settings-block">
          <label>Qué puedes pedirle</label>
          <ul className="helm-tg-ejemplos">
            {EJEMPLOS.map(t => <li key={t}>«{t}»</li>)}
          </ul>
          <p className="helm-tg-aprobar">
            <ShieldCheck size={14} />
            <span>
              Lo que solo consulta te lo contesta en el momento. Lo que escribe algo o gasta créditos te lo propone
              antes con dos botones, <b>Aprobar</b> y <b>Rechazar</b>, y no lo hace hasta que apruebas. Cada mensaje lo
              contesta la IA de HELM y gasta créditos de la agencia, como en el panel.
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

function Copiable({ valor }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="helm-copyrow">
      <code>{valor}</code>
      <button
        type="button" className="helm-btn"
        onClick={() => {
          // Fuera de HTTPS no hay portapapeles, y el navegador puede negarlo:
          // entonces no se dice «Copiado».
          navigator.clipboard?.writeText(valor).then(() => {
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1800)
          }).catch(() => {})
        }}
      >
        {copiado ? <Check size={15} /> : <Copy size={15} />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}
