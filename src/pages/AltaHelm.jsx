// HELM — el alta de un cliente nuevo, desde el enlace que le manda su agencia.
//
// Se llega por /alta/<token>. El token (un JWT de 30 días que firma
// api/onboarding.js con action=enlace) es lo que autentica: ni cuenta, ni
// contraseña, ni registro. Son las 40 preguntas de ONBOARDING_ALTA, una sección
// cada vez, y lo escrito se guarda solo según se escribe: en el móvil se cambia
// de app a mitad de frase, y eso no puede costar las respuestas.
//
// La página no toca la base: lee y guarda por /api/onboarding?action=alta, que
// valida cada respuesta contra el mismo esquema. Al enviarlo, la agencia recibe
// un aviso; con el mismo enlace se puede volver, corregir y reenviar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle, Send, CheckCircle2, RotateCw } from 'lucide-react'
import { ONBOARDING_ALTA } from '../helm/onboarding/alta'
import { isAnswered, seVe } from '../helm/onboarding/schema'
import { FieldInput } from '../helm/onboarding/Campos'
import { useHelmTheme } from '../helm/theme'
import './alta.css'

const RUTA = '/api/onboarding?action=alta'
// Lo que se espera desde la última tecla antes de guardar.
const ESPERA_MS = 1500
// Lo mismo que recorta el servidor (api/onboarding.js, action=alta): mejor que
// no se pueda escribir de más a que salte un error al guardar. El alta del
// panel (views/Onboarding.jsx) pone los mismos.
const LIMITES = { text: 300, long: 5000, filas: 20 }
const NO_VALE = 'Este enlace ha caducado o no es válido. Pide uno nuevo a quien te lo envió.'
const SIN_RED = 'No hay conexión. Comprueba tu internet y vuelve a intentarlo.'
// keepalive (el guardado al cerrar la pestaña) no admite cuerpos de más de 64 KB,
// contados en bytes: una tilde o un emoji ocupan más de uno.
const MAX_KEEPALIVE = 60_000
const bytes = (s) => new TextEncoder().encode(s).length
// Las claves de las 40 preguntas. Lo guardado con otras (de una versión
// anterior del formulario) no se reenvía: el servidor lo rechazaría y el
// cliente ya no podría guardar nada.
const CLAVES = new Set(ONBOARDING_ALTA.sections.flatMap(s => s.fields.map(f => f.key)))

const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

// Las secciones que se ven, cada una con sus preguntas visibles y cuántas
// lleva respondidas. El alta no tiene ramas, pero si un día las tiene (como el
// operativo), seVe ya las respeta.
function resumen(schema, answers) {
  return schema.sections.filter(s => seVe(s, answers)).map(s => {
    const campos = s.fields.filter(f => seVe(f, answers))
    return { ...s, campos, hechas: campos.filter(f => isAnswered(f, answers[f.key])).length }
  })
}

// Dónde se abre. Quien vuelve a un alta a medias entra por la primera sección
// que le falta; si no ha empezado o ya la envió, por el principio.
function pasoInicial(secciones, estado) {
  if (estado === 'enviado' || !secciones.some(s => s.hechas)) return 0
  const i = secciones.findIndex(s => s.hechas < s.campos.length)
  return i === -1 ? secciones.length - 1 : i
}

export default function AltaHelm() {
  const { token } = useParams()
  useHelmTheme()

  const [fase, setFase] = useState('cargando')    // cargando | caducado | fallo | form | gracias
  const [perfil, setPerfil] = useState(null)
  const [answers, setAnswers] = useState({})
  const [estado, setEstado] = useState('borrador') // borrador | enviado
  const [enviadoAt, setEnviadoAt] = useState(null)
  const [paso, setPaso] = useState(0)
  const [guardado, setGuardado] = useState(null)   // null | pendiente | guardando | guardado | error
  const [error, setError] = useState(null)         // { msg, campo? }
  const [enviando, setEnviando] = useState(false)

  // Lo último escrito y su versión. Cada cambio sube la versión; `mandada` es
  // la última que salió hacia el servidor y `guardada`, la última que volvió
  // bien. Mientras version > mandada, hay algo que todavía no ha salido.
  const ultimas = useRef({})
  const version = useRef(0)
  const mandada = useRef(0)
  const guardada = useRef(0)
  const temporizador = useRef(null)
  // Las peticiones van en fila: si salieran a la vez, una vieja podría llegar
  // después que una nueva y pisarla.
  const cola = useRef(Promise.resolve())

  useEffect(() => {
    document.title = perfil?.nombre ? `Alta de ${perfil.nombre} en HELM` : 'Alta en HELM'
  }, [perfil])

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${RUTA}&t=${encodeURIComponent(token)}`)
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { setError({ msg: d.error || NO_VALE }); setFase('caducado'); return }
      if (!r.ok) throw new Error(d.error || `El servidor no responde ahora mismo (error ${r.status}). Inténtalo de nuevo en un momento.`)
      const crudas = d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers) ? d.answers : {}
      const a = Object.fromEntries(Object.entries(crudas).filter(([k]) => CLAVES.has(k)))
      ultimas.current = a
      setAnswers(a)
      setPerfil(d.perfil || null)
      setEstado(d.estado === 'enviado' ? 'enviado' : 'borrador')
      setEnviadoAt(d.enviado_at || null)
      setPaso(pasoInicial(resumen(ONBOARDING_ALTA, a), d.estado))
      setError(null)
      setFase('form')
    } catch (e) {
      // Sin red, fetch falla con un TypeError cuyo texto cambia con el
      // navegador (Chrome: «Failed to fetch»; Safari: «Load failed»): en inglés
      // y sin pistas para el cliente.
      setError({ msg: e instanceof TypeError ? SIN_RED : e.message })
      setFase('fallo')
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  // Manda lo último escrito (y, con enviar, lo da por enviado). Devuelve
  // { ok, campo }: campo es la pregunta que el servidor ha rechazado, si la hay.
  const guardar = useCallback(({ enviar = false, keepalive = false } = {}) => {
    clearTimeout(temporizador.current)
    const v = version.current
    mandada.current = Math.max(mandada.current, v)
    const cuerpo = JSON.stringify({ t: token, answers: ultimas.current, enviar })

    const p = cola.current.then(async () => {
      if (!enviar) setGuardado('guardando')
      let r, d
      try {
        r = await fetch(RUTA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: cuerpo,
          keepalive: keepalive && bytes(cuerpo) < MAX_KEEPALIVE,
        })
        d = await r.json().catch(() => ({}))
      } catch {
        // Sin red: se queda pendiente y sale con el próximo cambio, al cambiar
        // de sección o cuando vuelva la conexión.
        mandada.current = guardada.current
        setGuardado('error')
        setError({ msg: enviar
          ? 'No hay conexión y no se ha podido enviar. Vuelve a intentarlo en cuanto vuelva.'
          : 'No hay conexión: lo que escribes se guardará en cuanto vuelva.' })
        return { ok: false }
      }

      if (r.status === 401) {
        setError({ msg: d.error || NO_VALE }); setFase('caducado')
        return { ok: false }
      }
      if (!r.ok) {
        mandada.current = guardada.current
        setGuardado('error')
        setError({ msg: d.error || 'No se ha podido guardar. Inténtalo de nuevo en un momento.', campo: d.campo || null })
        // Demasiadas seguidas: se reintenta solo cuando el servidor dice.
        if (r.status === 429 && !enviar) {
          temporizador.current = setTimeout(() => guardar(), (Number(d.retryAfter) || 30) * 1000)
        }
        return { ok: false, campo: d.campo || null }
      }

      guardada.current = Math.max(guardada.current, v)
      if (d.estado) setEstado(d.estado === 'enviado' ? 'enviado' : 'borrador')
      if ('enviado_at' in d) setEnviadoAt(d.enviado_at || null)
      setGuardado(version.current === v ? 'guardado' : 'pendiente')
      setError(null)
      return { ok: true }
    })
    cola.current = p.catch(() => {})
    return p
  }, [token])

  // Al irse (otra app, cerrar la pestaña) se manda lo que quede, con keepalive
  // para que la petición sobreviva a la página. Y si se fue la red, al volver.
  useEffect(() => {
    const pendiente = () => version.current > mandada.current
    const alOcultar = () => { if (document.visibilityState === 'hidden' && pendiente()) guardar({ keepalive: true }) }
    const alSalir = () => { if (pendiente()) guardar({ keepalive: true }) }
    const alVolverLaRed = () => { if (version.current > guardada.current) guardar() }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', alSalir)
    window.addEventListener('online', alVolverLaRed)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', alSalir)
      window.removeEventListener('online', alVolverLaRed)
      clearTimeout(temporizador.current)
    }
  }, [guardar])

  function cambiar(key, valor) {
    const next = { ...ultimas.current, [key]: valor }
    ultimas.current = next
    version.current += 1
    setAnswers(next)
    setGuardado('pendiente')
    if (error?.campo === key) setError(null)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => guardar(), ESPERA_MS)
  }

  function irA(i) {
    if (version.current > mandada.current) guardar()
    setPaso(i)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  async function enviar() {
    setEnviando(true); setError(null)
    const res = await guardar({ enviar: true })
    setEnviando(false)
    if (res.ok) { setFase('gracias'); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); return }
    // Si el servidor dice qué pregunta falla, se lleva al cliente a ella.
    if (res.campo) {
      const i = resumen(ONBOARDING_ALTA, ultimas.current).findIndex(s => s.campos.some(f => f.key === res.campo))
      if (i >= 0 && i !== paso) { setPaso(i); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }
    }
  }

  return (
    <VistaAlta
      fase={fase} perfil={perfil} answers={answers} paso={paso}
      estado={estado} enviadoAt={enviadoAt} guardado={guardado} error={error} enviando={enviando}
      onCambio={cambiar} onPaso={irA} onEnviar={enviar}
      onRevisar={() => { setPaso(0); setFase('form'); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }}
      onReintentar={() => { setFase('cargando'); cargar() }}
    />
  )
}

// ── Lo que se ve ────────────────────────────────────────────────────────────
// Sin estado ni red: todo llega por props, así se puede comprobar sin navegador.
export function VistaAlta({
  fase, perfil, answers = {}, paso = 0, estado = 'borrador', enviadoAt = null,
  guardado = null, error = null, enviando = false,
  onCambio, onPaso, onEnviar, onRevisar, onReintentar,
}) {
  const secciones = useMemo(() => resumen(ONBOARDING_ALTA, answers), [answers])
  const nombre = perfil?.nombre || 'tu negocio'

  let cuerpo
  if (fase === 'cargando') {
    cuerpo = (
      <div className="alta-centro" role="status">
        <Loader2 size={24} className="helm-spin" />
        <p>Abriendo tu alta…</p>
      </div>
    )
  } else if (fase === 'caducado') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello mal"><AlertTriangle size={24} /></div>
        <h1>Este enlace ya no vale</h1>
        <p>{error?.msg || NO_VALE}</p>
      </div>
    )
  } else if (fase === 'fallo') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello mal"><AlertTriangle size={24} /></div>
        <h1>No hemos podido abrir el formulario</h1>
        {error?.msg && <p>{error.msg}</p>}
        <button type="button" className="helm-btn primary alta-btn" onClick={onReintentar}>
          <RotateCw size={16} /> Reintentar
        </button>
      </div>
    )
  } else if (fase === 'gracias') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello ok"><CheckCircle2 size={26} /></div>
        <h1>¡Recibido!</h1>
        <p>
          Gracias. Las respuestas de {nombre} ya le han llegado a quien te mandó el enlace:
          con ellas se empieza a trabajar desde el primer día.
        </p>
        <p>
          ¿Se te ha olvidado algo? Vuelve a este mismo enlace cuando quieras: puedes cambiar
          lo que sea y enviarlo otra vez.
        </p>
        <button type="button" className="helm-btn alta-btn" onClick={onRevisar}>Revisar mis respuestas</button>
      </div>
    )
  } else {
    cuerpo = (
      <Formulario
        secciones={secciones} answers={answers} paso={Math.min(paso, secciones.length - 1)}
        nombre={nombre} estado={estado} enviadoAt={enviadoAt} guardado={guardado}
        error={error} enviando={enviando}
        onCambio={onCambio} onPaso={onPaso} onEnviar={onEnviar}
      />
    )
  }

  return (
    <div className="helm alta" data-tono="oro">
      <div className="alta-pagina">
        <div className="alta-marca">
          <img src="/assets/logos/helm-mark.svg" alt="" width="32" height="32" />
          <b>HELM</b>
        </div>
        {cuerpo}
      </div>
    </div>
  )
}

function Formulario({
  secciones, answers, paso, nombre, estado, enviadoAt, guardado, error, enviando,
  onCambio, onPaso, onEnviar,
}) {
  const sec = secciones[paso]
  const ultimo = paso === secciones.length - 1
  const total = secciones.reduce((n, s) => n + s.campos.length, 0)
  const hechas = secciones.reduce((n, s) => n + s.hechas, 0)
  // El error de una pregunta concreta se pinta en ella; el resto, abajo.
  const errorCampo = error?.campo && sec.campos.some(f => f.key === error.campo) ? error : null
  const errorSuelto = error && !errorCampo ? error : null

  return (
    <>
      <header className="alta-cab">
        <h1>Alta de {nombre} en HELM</h1>
        {paso === 0 && <p className="alta-intro">{ONBOARDING_ALTA.intro}</p>}
      </header>

      {estado === 'enviado' && (
        <div className="alta-aviso">
          <CheckCircle2 size={18} />
          <p>
            Ya lo enviaste{enviadoAt ? ` el ${fechaLarga(enviadoAt)}` : ''}. Puedes repasarlo y
            cambiar lo que quieras: se guarda solo según escribes.
          </p>
        </div>
      )}

      <div className="alta-barra">
        <div className="alta-pasos" style={{ '--n': secciones.length }}>
          {secciones.map((s, i) => (
            <button
              key={s.key} type="button"
              className={'alta-paso' + (i === paso ? ' actual' : '')}
              aria-label={`${i + 1}. ${s.title}: ${s.hechas} de ${s.campos.length} respondidas`}
              aria-current={i === paso ? 'step' : undefined}
              onClick={() => onPaso(i)}
            >
              <span style={{ '--p': s.campos.length ? s.hechas / s.campos.length : 0 }} />
            </button>
          ))}
        </div>
        <div className="alta-barra-txt">
          <span>{hechas} de {total} respondidas</span>
          <EstadoGuardado guardado={guardado} />
        </div>
      </div>

      <section className="alta-seccion" aria-labelledby="alta-seccion-titulo">
        <div className="alta-seccion-cab">
          <span className="alta-kicker">Paso {paso + 1} de {secciones.length}</span>
          <h2 id="alta-seccion-titulo">{sec.title}</h2>
          {sec.desc && <p>{sec.desc}</p>}
        </div>
        {sec.campos.map(field => (
          <Pregunta
            key={field.key} field={field} value={answers[field.key]}
            error={errorCampo?.campo === field.key ? errorCampo.msg : null}
            onCambio={onCambio}
          />
        ))}
      </section>

      {ultimo && <Cierre secciones={secciones} hechas={hechas} total={total} estado={estado} onPaso={onPaso} />}

      {errorSuelto && <div className="helm-formerror alta-error" role="alert">{errorSuelto.msg}</div>}

      <nav className="alta-nav" aria-label="Secciones">
        {paso > 0 && (
          <button type="button" className="helm-btn alta-btn" onClick={() => onPaso(paso - 1)}>
            <ArrowLeft size={16} /> Anterior
          </button>
        )}
        {!ultimo ? (
          <button type="button" className="helm-btn primary alta-btn" onClick={() => onPaso(paso + 1)}>
            Siguiente <ArrowRight size={16} />
          </button>
        ) : (
          <button type="button" className="helm-btn primary alta-btn" onClick={onEnviar} disabled={enviando || !hechas}>
            {enviando ? <><Loader2 size={16} className="helm-spin" /> Enviando…</>
              : <><Send size={16} /> {estado === 'enviado' ? 'Volver a enviar' : 'Enviar'}</>}
          </button>
        )}
      </nav>
    </>
  )
}

// Las de botones (escala, opciones, tablas) no tienen un único control al que
// apuntar con la etiqueta: van en un grupo con su nombre.
const DE_BOTONES = new Set(['scale', 'axis', 'multi', 'table'])

function Pregunta({ field, value, error, onCambio }) {
  const id = `alta-${field.key}`
  const grupo = DE_BOTONES.has(field.type)
  const pista = field.type === 'multi'
    ? (field.max && field.max < field.options.length ? `Elige hasta ${field.max}.` : 'Puedes elegir varias.')
    : field.hint
  return (
    <div
      className={'alta-q' + (isAnswered(field, value) ? ' done' : '') + (error ? ' mal' : '')}
      {...(grupo ? { role: 'group', 'aria-labelledby': `${id}-l` } : {})}
    >
      <label id={`${id}-l`} htmlFor={grupo ? undefined : id}>{field.label}</label>
      {pista && <p className="alta-pista">{pista}</p>}
      <FieldInput field={field} value={value} onChange={v => onCambio(field.key, v)} limites={LIMITES} id={id} />
      {error && <p className="alta-q-error" role="alert">{error}</p>}
    </div>
  )
}

function EstadoGuardado({ guardado }) {
  return (
    <span className={'alta-guardado' + (guardado === 'guardado' ? ' ok' : guardado === 'error' ? ' mal' : '')} aria-live="polite">
      {guardado === 'guardando' && <><Loader2 size={13} className="helm-spin" /> Guardando…</>}
      {guardado === 'guardado' && <><Check size={13} /> Guardado</>}
      {guardado === 'error' && 'Sin guardar'}
    </span>
  )
}

// El final de la última sección: cuánto lleva y qué le falta, con un atajo a
// cada sección incompleta. Se puede enviar sin tenerlo todo.
function Cierre({ secciones, hechas, total, estado, onPaso }) {
  const faltan = secciones
    .map((s, i) => ({ s, i, n: s.campos.length - s.hechas }))
    .filter(x => x.n > 0)
  return (
    <div className="alta-cierre">
      <h2>{estado === 'enviado' ? '¿Lo vuelves a enviar?' : '¿Listo para enviarlo?'}</h2>
      {!hechas ? (
        <p>Responde al menos una pregunta para poder enviarlo.</p>
      ) : faltan.length ? (
        <p>Has respondido {hechas} de {total}. Puedes enviarlo así o completar lo que falta:</p>
      ) : (
        <p>Has respondido las {total}. Repasa lo que quieras y envíalo.</p>
      )}
      {hechas > 0 && faltan.length > 0 && (
        <div className="alta-faltan">
          {faltan.map(({ s, i, n }) => (
            <button key={s.key} type="button" className="alta-falta" onClick={() => onPaso(i)}>
              {s.title} · {n === 1 ? 'falta 1' : `faltan ${n}`}
            </button>
          ))}
        </div>
      )}
      {/* El aviso a la agencia solo sale con el primer envío (api/onboarding.js). */}
      <p className="alta-nota">
        {estado === 'enviado'
          ? 'Lo que cambies se guarda solo y le llega al momento a quien te mandó el enlace.'
          : 'Al enviarlo, avisamos a quien te mandó el enlace. Podrás volver a este mismo enlace para cambiar lo que quieras.'}
      </p>
    </div>
  )
}
