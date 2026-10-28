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
//
// Con `publica` es helm.s4sf.net/alta, sin token: para el negocio que todavía
// no tiene perfil. Primero deja sus datos («Tus datos»), el servidor le abre un
// alta y le da una llave que se guarda en este navegador (ver altaPublica.js);
// con ella, las mismas 40 preguntas por action=alta-publica. Le llega a la
// agencia de ?a=<slug> (sin él, a la de la casa), que la ve en Perfiles →
// Altas y desde ahí le crea el perfil con las respuestas ya dentro.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle, Send, CheckCircle2, RotateCw, Inbox } from 'lucide-react'
import { ONBOARDING_ALTA } from '../helm/onboarding/alta'
import { isAnswered, seVe } from '../helm/onboarding/schema'
import { FieldInput } from '../helm/onboarding/Campos'
import { useHelmTheme } from '../helm/theme'
import {
  agenciaDeLaUrl, leerAlta, recordarAlta, olvidarAlta, validarDatos, origenDeLaVisita, estaEnviada,
  textoPrivacidad, DATOS_VACIOS, CAMPOS_DATOS,
} from './altaPublica'
import './alta.css'

const RUTA = '/api/onboarding?action=alta'
const RUTA_PUBLICA = '/api/onboarding?action=alta-publica'
const RUTA_NUEVA = '/api/onboarding?action=alta-publica-nueva'
const RUTA_AGENCIA = '/api/onboarding?action=alta-publica-agencia'
const RUTA_BORRAR = '/api/onboarding?action=alta-publica-borrar'
// Lo que se espera desde la última tecla antes de guardar.
const ESPERA_MS = 1500
// Lo mismo que recorta el servidor (api/onboarding.js, action=alta): mejor que
// no se pueda escribir de más a que salte un error al guardar. El alta del
// panel (views/Onboarding.jsx) pone los mismos.
const LIMITES = { text: 300, long: 5000, filas: 20 }
const NO_VALE = 'Este enlace ha caducado o no es válido. Pide uno nuevo a quien te lo envió.'
const SIN_RED = 'No hay conexión. Comprueba tu internet y vuelve a intentarlo.'
// En /alta no hay enlace que pedir: lo que caduca es el alta guardada en este
// navegador (30 días), y lo que queda es empezar otra.
const CADUCADA = 'Han pasado más de 30 días desde que la empezaste, o ya no está disponible. Puedes empezar otra: son tus datos y las preguntas.'
// Lo que contesta el servidor (409) cuando la agencia ya ha convertido el alta
// en perfil o la ha descartado: desde aquí ya no se toca.
const RECOGIDA = 'Esta alta ya la ha recogido el equipo.'
// keepalive (el guardado al cerrar la pestaña) no admite cuerpos de más de 64 KB,
// contados en bytes: una tilde o un emoji ocupan más de uno.
const MAX_KEEPALIVE = 60_000
const bytes = (s) => new TextEncoder().encode(s).length
// Las claves de las 40 preguntas. Lo guardado con otras (de una versión
// anterior del formulario) no se reenvía: el servidor lo rechazaría y el
// cliente ya no podría guardar nada.
const CLAVES = new Set(ONBOARDING_ALTA.sections.flatMap(s => s.fields.map(f => f.key)))

const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || ''

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

export default function AltaHelm({ publica = false }) {
  const { token } = useParams()
  useHelmTheme()

  // En /alta la llave no viene en la URL: es la que se guardó en este
  // navegador al dejar los datos, o ninguna (y se empieza por «Tus datos»).
  const [inicio] = useState(() => {
    if (!publica) return { agencia: null, guardada: null }
    const agencia = agenciaDeLaUrl(window.location.search)
    return { agencia, guardada: leerAlta(agencia) }
  })
  const [llave, setLlave] = useState(inicio.guardada?.t || null)
  const t = publica ? llave : token
  const ruta = publica ? RUTA_PUBLICA : RUTA

  // En /alta sin llave también se empieza cargando: antes de pedir los datos
  // hay que saber a qué agencia van a llegar (`receptora`).
  const [fase, setFase] = useState(t || publica ? 'cargando' : 'datos')  // datos | cargando | caducado | recogida | borrada | fallo | form | gracias
  const [perfil, setPerfil] = useState(null)
  const [agencia, setAgencia] = useState(null)     // { nombre }: a quién le llega el alta abierta (solo /alta)
  // La agencia que recibirá un alta NUEVA desde esta visita (solo /alta):
  // { nombre, slug, encontrada }. La casilla de privacidad la nombra, y si el
  // ?a= no es de ninguna agencia, se dice antes de pedir nada.
  const [receptora, setReceptora] = useState(null)
  const [borrando, setBorrando] = useState(false)
  const [contacto, setContacto] = useState(null)   // { nombre, email, telefono } (solo /alta)
  const [recordada, setRecordada] = useState(Boolean(inicio.guardada))  // si se podrá volver desde este navegador
  const [datos, setDatos] = useState(DATOS_VACIOS)
  const [erroresDatos, setErroresDatos] = useState({})
  const [creando, setCreando] = useState(false)
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
  // La llave en uso. En /alta cambia al empezar de nuevo: lo que conteste el
  // servidor sobre la anterior ya no se pinta.
  const vigente = useRef(t)

  useEffect(() => {
    document.title = perfil?.nombre ? `Alta de ${perfil.nombre} en HELM` : 'Alta en HELM'
  }, [perfil])

  const cargar = useCallback(async () => {
    if (!t) return
    const sigue = () => vigente.current === t
    try {
      const r = await fetch(`${ruta}&t=${encodeURIComponent(t)}`)
      const d = await r.json().catch(() => ({}))
      if (!sigue()) return
      if (r.status === 401) { setError({ msg: publica ? CADUCADA : d.error || NO_VALE }); setFase('caducado'); return }
      if (r.status === 409) { setError({ msg: d.error || RECOGIDA }); setFase('recogida'); return }
      if (!r.ok) throw new Error(d.error || `El servidor no responde ahora mismo (error ${r.status}). Inténtalo de nuevo en un momento.`)
      // Convertida o descartada: ya no se ofrece seguir escribiendo algo que
      // no se va a guardar.
      if (publica && d.recogida) {
        setAgencia(d.agencia || null)
        setError({ msg: RECOGIDA })
        setFase('recogida')
        return
      }
      const crudas = d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers) ? d.answers : {}
      const a = Object.fromEntries(Object.entries(crudas).filter(([k]) => CLAVES.has(k)))
      const enviado = estaEnviada(d) ? 'enviado' : 'borrador'
      ultimas.current = a
      setAnswers(a)
      setPerfil(d.perfil || null)
      if (publica) {
        setAgencia(d.agencia || null)
        setContacto(c => d.contacto || c)
      }
      setEstado(enviado)
      setEnviadoAt(d.enviado_at || null)
      setPaso(pasoInicial(resumen(ONBOARDING_ALTA, a), enviado))
      setError(null)
      setFase('form')
    } catch (e) {
      if (!sigue()) return
      // Sin red, fetch falla con un TypeError cuyo texto cambia con el
      // navegador (Chrome: «Failed to fetch»; Safari: «Load failed»): en inglés
      // y sin pistas para el cliente.
      setError({ msg: e instanceof TypeError ? SIN_RED : e.message })
      setFase('fallo')
    }
  }, [t, ruta, publica])

  useEffect(() => { cargar() }, [cargar])

  // Solo /alta, para un alta nueva: a qué agencia le va a llegar (la de ?a=,
  // o la de siempre si ese ?a= no existe).
  const cargarReceptora = useCallback(async () => {
    setFase('cargando')
    try {
      const r = await fetch(inicio.agencia ? `${RUTA_AGENCIA}&a=${encodeURIComponent(inicio.agencia)}` : RUTA_AGENCIA)
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.agencia?.nombre) {
        throw new Error(d.error || `El servidor no responde ahora mismo (error ${r.status}). Inténtalo de nuevo en un momento.`)
      }
      setReceptora({ nombre: d.agencia.nombre, slug: d.agencia.slug, encontrada: d.encontrada !== false })
      setError(null)
      setFase('datos')
    } catch (e) {
      setError({ msg: e instanceof TypeError ? SIN_RED : e.message })
      setFase('fallo')
    }
  }, [inicio.agencia])

  useEffect(() => {
    if (publica && !inicio.guardada) cargarReceptora()
  }, [publica, inicio.guardada, cargarReceptora])

  // Manda lo último escrito (y, con enviar, lo da por enviado). Devuelve
  // { ok, campo }: campo es la pregunta que el servidor ha rechazado, si la hay.
  const guardar = useCallback(({ enviar = false, keepalive = false } = {}) => {
    clearTimeout(temporizador.current)
    const v = version.current
    mandada.current = Math.max(mandada.current, v)
    const cuerpo = JSON.stringify({ t, answers: ultimas.current, enviar })
    // Si entretanto se ha empezado otra alta (/alta), esto sale igual —es de
    // la anterior, y es lo último que se escribió en ella—, pero la respuesta
    // ya no se pinta.
    const sigue = () => vigente.current === t

    const p = cola.current.then(async () => {
      if (!enviar && sigue()) setGuardado('guardando')
      let r, d
      try {
        r = await fetch(ruta, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: cuerpo,
          keepalive: keepalive && bytes(cuerpo) < MAX_KEEPALIVE,
        })
        d = await r.json().catch(() => ({}))
      } catch {
        if (!sigue()) return { ok: false }
        // Sin red: se queda pendiente y sale con el próximo cambio, al cambiar
        // de sección o cuando vuelva la conexión.
        mandada.current = guardada.current
        setGuardado('error')
        setError({ msg: enviar
          ? 'No hay conexión y no se ha podido enviar. Vuelve a intentarlo en cuanto vuelva.'
          : 'No hay conexión: lo que escribes se guardará en cuanto vuelva.' })
        return { ok: false }
      }
      if (!sigue()) return { ok: false }

      if (r.status === 401) {
        setError({ msg: publica ? CADUCADA : d.error || NO_VALE }); setFase('caducado')
        return { ok: false }
      }
      // La agencia ya la ha recogido: lo de ahora no se ha guardado, y se dice.
      if (r.status === 409) {
        setError({ msg: d.error || RECOGIDA, alGuardar: true }); setFase('recogida')
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
      if (d.estado || d.enviado_at) setEstado(estaEnviada(d) ? 'enviado' : 'borrador')
      if ('enviado_at' in d) setEnviadoAt(d.enviado_at || null)
      setGuardado(version.current === v ? 'guardado' : 'pendiente')
      setError(null)
      return { ok: true }
    })
    cola.current = p.catch(() => {})
    return p
  }, [t, ruta, publica])

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

  // ── Solo /alta: los datos del primer paso y empezar de nuevo ──────────────
  function cambiarDato(campo, valor) {
    setDatos(d => ({ ...d, [campo]: valor }))
    if (erroresDatos[campo]) setErroresDatos(({ [campo]: _QUITADO, ...resto }) => resto)
  }

  // Deja la página como recién abierta, sin llave: lo de la anterior ya no
  // se pinta (ver `vigente`).
  function soltarLlave(nueva) {
    clearTimeout(temporizador.current)
    vigente.current = nueva
    ultimas.current = {}
    version.current = 0
    mandada.current = 0
    guardada.current = 0
    setLlave(nueva)
    setAnswers({}); setPaso(0); setEstado('borrador'); setEnviadoAt(null)
    setGuardado(null); setError(null); setAgencia(null)
  }

  async function empezar(e) {
    e?.preventDefault()
    if (creando) return
    const v = validarDatos(datos)
    if (v.errores) {
      setErroresDatos(v.errores)
      // Al primero que falla, para que se vea (y se oiga) qué hay que tocar.
      const primero = CAMPOS_DATOS.find(c => v.errores[c])
      document.getElementById(primero === 'acepta' ? 'alta-acepta' : `alta-dato-${primero}`)?.focus()
      return
    }
    setCreando(true); setErroresDatos({}); setError(null)
    let r, d
    try {
      r = await fetch(RUTA_NUEVA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...v.limpio, acepta: true, website: datos.website,
          // La que se ha nombrado en la casilla, no la de la URL: si ?a= no
          // existía, la que la página ha dicho que lo recibiría.
          agencia: receptora?.slug || inicio.agencia || undefined,
          origen: origenDeLaVisita(window.location.search, document.referrer),
        }),
      })
      d = await r.json().catch(() => ({}))
    } catch {
      setCreando(false)
      setError({ msg: SIN_RED })
      return
    }
    setCreando(false)
    if (!r.ok || typeof d.t !== 'string' || !d.t) {
      // Un dato que el servidor rechaza va junto a su campo; lo demás, abajo.
      if (r.status === 400 && CAMPOS_DATOS.includes(d.campo)) setErroresDatos({ [d.campo]: d.error || 'Revisa este dato.' })
      else if (r.status === 429) setError({ msg: d.error || 'Se han empezado demasiadas altas seguidas desde esta conexión. Espera un rato y vuelve a intentarlo.' })
      else setError({ msg: d.error || `No se ha podido empezar (error ${r.status}). Inténtalo de nuevo en un momento.` })
      return
    }
    setRecordada(recordarAlta({ t: d.t, caduca: d.caduca || null, agencia: inicio.agencia }))
    soltarLlave(d.t)
    if (d.agencia?.nombre) setAgencia({ nombre: d.agencia.nombre })
    setContacto(v.limpio)
    setDatos(DATOS_VACIOS)
    setFase('cargando')
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  function empezarDeNuevo() {
    // Lo escrito no se pierde (está en el servidor), pero desde este navegador
    // ya no se podrá volver a ello: que no salga de un toque sin querer.
    const algo = fase === 'form' && Object.keys(ultimas.current).length > 0
    if (algo && !window.confirm('¿Empezar un alta nueva? Lo que llevas escrito se queda guardado, pero desde aquí ya no podrás volver a ello.')) return
    // Lo que aún no había salido, que salga a la que era suya.
    if (algo && version.current > mandada.current) guardar()
    olvidarAlta()
    soltarLlave(null)
    setRecordada(false)
    setContacto(null)
    setDatos(DATOS_VACIOS); setErroresDatos({})
    // Si se llegó con un alta guardada, aún no se sabe a quién iría una nueva.
    if (receptora) setFase('datos')
    else cargarReceptora()
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  // Quien la rellenó la borra entera (sus datos y sus respuestas) mientras no
  // tenga perfil. Lo que quedara por guardar ya no hace falta.
  async function borrarMisDatos() {
    if (borrando || !t) return
    if (!window.confirm('¿Borrar tus datos y tus respuestas? Se borran del todo y no se puede deshacer.')) return
    setBorrando(true)
    clearTimeout(temporizador.current)
    version.current = mandada.current
    await cola.current
    let r, d
    try {
      r = await fetch(RUTA_BORRAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t }),
      })
      d = await r.json().catch(() => ({}))
    } catch {
      setBorrando(false)
      setError({ msg: SIN_RED })
      return
    }
    setBorrando(false)
    if (r.ok) {
      olvidarAlta()
      soltarLlave(null)
      setRecordada(false)
      setContacto(null)
      setFase('borrada')
    } else if (r.status === 401) {
      setError({ msg: CADUCADA }); setFase('caducado')
    } else if (r.status === 409) {
      setError({ msg: d.error || RECOGIDA }); setFase('recogida')
    } else {
      setError({ msg: d.error || `No se ha podido borrar (error ${r.status}). Inténtalo de nuevo en un momento.` })
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  return (
    <VistaAlta
      publica={publica} fase={fase} perfil={perfil} agencia={agencia} contacto={contacto} recordada={recordada}
      receptora={receptora} conAlta={Boolean(t)} borrando={borrando}
      datos={datos} erroresDatos={erroresDatos} creando={creando}
      answers={answers} paso={paso}
      estado={estado} enviadoAt={enviadoAt} guardado={guardado} error={error} enviando={enviando}
      onCambio={cambiar} onPaso={irA} onEnviar={enviar}
      onDato={cambiarDato} onEmpezar={empezar} onNueva={empezarDeNuevo} onBorrar={borrarMisDatos}
      onRevisar={() => { setPaso(0); setFase('form'); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }}
      onReintentar={() => { if (t) { setFase('cargando'); cargar() } else cargarReceptora() }}
    />
  )
}

// ── Lo que se ve ────────────────────────────────────────────────────────────
// Sin estado ni red: todo llega por props, así se puede comprobar sin navegador.
export function VistaAlta({
  publica = false, fase, perfil, agencia = null, contacto = null, recordada = true,
  receptora = null, conAlta = true, borrando = false,
  datos = DATOS_VACIOS, erroresDatos = {}, creando = false,
  answers = {}, paso = 0, estado = 'borrador', enviadoAt = null,
  guardado = null, error = null, enviando = false,
  onCambio, onPaso, onEnviar, onDato, onEmpezar, onNueva, onBorrar, onRevisar, onReintentar,
}) {
  const secciones = useMemo(() => resumen(ONBOARDING_ALTA, answers), [answers])
  const nombre = perfil?.nombre || 'tu negocio'
  // A quién le llega lo que escribe, ya con su «a» (que con «el equipo» es «al
  // equipo»): en /alta, la agencia; con enlace, quien se lo mandó.
  const destino = !publica ? 'a quien te mandó el enlace' : agencia?.nombre ? `a ${agencia.nombre}` : 'al equipo'

  let cuerpo
  if (fase === 'datos') {
    cuerpo = (
      <DatosContacto
        datos={datos} errores={erroresDatos} creando={creando} error={error} receptora={receptora}
        onDato={onDato} onEmpezar={onEmpezar}
      />
    )
  } else if (fase === 'cargando') {
    cuerpo = (
      <div className="alta-centro" role="status">
        <Loader2 size={24} className="helm-spin" />
        <p>{conAlta ? 'Abriendo tu alta…' : 'Abriendo el formulario…'}</p>
      </div>
    )
  } else if (fase === 'caducado') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello mal"><AlertTriangle size={24} /></div>
        <h1>{publica ? 'Tu alta ya no está disponible' : 'Este enlace ya no vale'}</h1>
        <p>{error?.msg || (publica ? CADUCADA : NO_VALE)}</p>
        {publica && (
          <button type="button" className="helm-btn primary alta-btn" onClick={onNueva}>
            Empezar una nueva <ArrowRight size={16} />
          </button>
        )}
      </div>
    )
  } else if (fase === 'recogida') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello ok"><Inbox size={24} /></div>
        <h1>Ya está en manos del equipo</h1>
        <p>{error?.msg || RECOGIDA}</p>
        <p>
          {/* Solo si venía de guardar: al abrirla, no había nada a medias. */}
          {error?.alGuardar && 'Lo último que hayas escrito ya no se ha guardado aquí. '}
          Si quieres añadir o cambiar algo, cuéntaselo directamente {destino}.
        </p>
        {publica && (
          <button type="button" className="helm-btn alta-btn" onClick={onNueva}>Empezar el alta de otro negocio</button>
        )}
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
        {/* En /alta, por si lo guardado en este navegador no es de quien lo abre. */}
        {publica && conAlta && <button type="button" className="alta-enlace" onClick={onNueva}>¿No eres tú? Empezar de nuevo</button>}
      </div>
    )
  } else if (fase === 'borrada') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello ok"><CheckCircle2 size={26} /></div>
        <h1>Hemos borrado tus datos</h1>
        <p>Tu nombre, tu email, tu WhatsApp y tus respuestas ya no están en HELM.</p>
        <button type="button" className="helm-btn alta-btn" onClick={onNueva}>Empezar otra alta</button>
      </div>
    )
  } else if (fase === 'gracias') {
    cuerpo = (
      <div className="alta-centro">
        <div className="alta-sello ok"><CheckCircle2 size={26} /></div>
        <h1>¡Recibido!</h1>
        {publica ? (
          <>
            <p>
              Gracias{contacto?.nombre ? `, ${primerNombre(contacto.nombre)}` : ''}.
              {` Tus respuestas ya le han llegado ${destino}: te escribirá por email o WhatsApp para el siguiente paso.`}
            </p>
            <p>
              {recordada
                ? '¿Se te ha olvidado algo? Vuelve a helm.s4sf.net/alta desde este mismo navegador: puedes cambiar lo que sea y enviarlo otra vez.'
                : '¿Se te ha olvidado algo? Puedes cambiarlo y enviarlo otra vez mientras no cierres esta página.'}
            </p>
          </>
        ) : (
          <>
            <p>
              Gracias. Las respuestas de {nombre} ya le han llegado a quien te mandó el enlace:
              con ellas se empieza a trabajar desde el primer día.
            </p>
            <p>
              ¿Se te ha olvidado algo? Vuelve a este mismo enlace cuando quieras: puedes cambiar
              lo que sea y enviarlo otra vez.
            </p>
          </>
        )}
        <button type="button" className="helm-btn alta-btn" onClick={onRevisar}>Revisar mis respuestas</button>
      </div>
    )
  } else {
    cuerpo = (
      <Formulario
        secciones={secciones} answers={answers} paso={Math.min(paso, secciones.length - 1)}
        nombre={nombre} estado={estado} enviadoAt={enviadoAt} guardado={guardado}
        error={error} enviando={enviando}
        publica={publica} contacto={contacto} destino={destino} recordada={recordada}
        agencia={agencia} borrando={borrando}
        onCambio={onCambio} onPaso={onPaso} onEnviar={onEnviar} onNueva={onNueva} onBorrar={onBorrar}
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

// ── «Tus datos»: el primer paso de /alta ────────────────────────────────────
// Lo justo para guardarle lo que escriba y saber a quién contestar. La casilla
// dice quién recibe los datos (la agencia, por su nombre), para qué y cómo
// borrarlos; sin marcarla no se empieza. Si el ?a= del enlace no es de ninguna
// agencia, se avisa antes: los datos irían a otra, y eso no puede pasar sin
// que se vea.
function DatosContacto({ datos, errores, creando, error, receptora, onDato, onEmpezar }) {
  return (
    <form className="alta-datos" onSubmit={onEmpezar} noValidate>
      <header className="alta-cab">
        <h1>Alta en HELM</h1>
        <p className="alta-intro">
          Cuéntanos tu negocio en 40 preguntas, unos 15 minutos, y empezamos a trabajar con lo
          que nos digas. Antes, dinos quién eres: así guardamos lo que escribas y sabemos a quién contestar.
        </p>
      </header>

      {receptora && !receptora.encontrada && (
        <div className="alta-aviso alta-aviso-mal" role="note">
          <AlertTriangle size={18} />
          <p>
            El enlace que te han pasado no es de ninguna agencia de HELM (quizá está mal copiado).
            Si sigues, tus datos y tus respuestas los recibirá <b>{receptora.nombre}</b>. Si esperabas
            otra, pide el enlace bueno a quien te lo pasó.
          </p>
        </div>
      )}

      <section className="alta-seccion" aria-labelledby="alta-datos-titulo">
        <div className="alta-seccion-cab">
          <span className="alta-kicker">Antes de empezar</span>
          <h2 id="alta-datos-titulo">Tus datos</h2>
        </div>
        <Dato
          campo="nombre" label="Nombre y apellidos" valor={datos.nombre} error={errores.nombre} onDato={onDato}
          autoComplete="name" maxLength={120}
        />
        <Dato
          campo="email" label="Email" valor={datos.email} error={errores.email} onDato={onDato}
          type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={200}
        />
        <Dato
          campo="telefono" label="WhatsApp" pista="Con el prefijo si no es un número de España."
          valor={datos.telefono} error={errores.telefono} onDato={onDato}
          type="tel" inputMode="tel" autoComplete="tel" maxLength={30}
        />

        {/* La trampa: fuera de la vista, del tabulador y del lector de
            pantalla; solo la rellena un bot (el servidor le contesta como si
            nada, sin crear el alta). */}
        <div className="alta-trampa" aria-hidden="true">
          <label htmlFor="alta-website">Web</label>
          <input
            id="alta-website" name="website" tabIndex={-1} autoComplete="off"
            value={datos.website} onChange={e => onDato('website', e.target.value)}
          />
        </div>

        <div className={'alta-check' + (errores.acepta ? ' mal' : '')}>
          <input
            id="alta-acepta" type="checkbox" checked={datos.acepta}
            aria-invalid={errores.acepta ? true : undefined}
            aria-describedby={errores.acepta ? 'alta-acepta-error' : undefined}
            onChange={e => onDato('acepta', e.target.checked)}
          />
          <label htmlFor="alta-acepta">{textoPrivacidad(receptora?.nombre)}</label>
        </div>
        {errores.acepta && <p className="alta-q-error" id="alta-acepta-error" role="alert">{errores.acepta}</p>}
      </section>

      {error && <div className="helm-formerror alta-error" role="alert">{error.msg}</div>}

      <nav className="alta-nav" aria-label="Empezar">
        <button type="submit" className="helm-btn primary alta-btn" disabled={creando}>
          {creando ? <><Loader2 size={16} className="helm-spin" /> Un momento…</> : <>Empezar <ArrowRight size={16} /></>}
        </button>
      </nav>
      <p className="alta-pie">
        Se guarda solo mientras escribes: puedes dejarlo a medias y volver desde este mismo navegador durante 30 días.
      </p>
    </form>
  )
}

function Dato({ campo, label, pista, valor, error, onDato, ...input }) {
  const id = `alta-dato-${campo}`
  return (
    <div className={'alta-q' + (error ? ' mal' : '')}>
      <label htmlFor={id}>{label}</label>
      {pista && <p className="alta-pista" id={`${id}-pista`}>{pista}</p>}
      <input
        id={id} name={campo} className="helm-input" value={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={[pista && `${id}-pista`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}
        onChange={e => onDato(campo, e.target.value)}
        {...input}
      />
      {error && <p className="alta-q-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  )
}

function Formulario({
  secciones, answers, paso, nombre, estado, enviadoAt, guardado, error, enviando,
  publica, contacto, destino, recordada, agencia, borrando,
  onCambio, onPaso, onEnviar, onNueva, onBorrar,
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
        {/* En /alta la llave es de este navegador: si lo usa otra persona,
            que pueda empezar la suya. */}
        {publica && (
          <p className="alta-quien">
            {contacto?.nombre && <span>Hola, {primerNombre(contacto.nombre)}.</span>}
            <button type="button" className="alta-enlace" onClick={onNueva}>¿No eres tú? Empezar de nuevo</button>
          </p>
        )}
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

      {ultimo && (
        <Cierre
          secciones={secciones} hechas={hechas} total={total} estado={estado} onPaso={onPaso}
          publica={publica} destino={destino} recordada={recordada}
        />
      )}

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

      {/* En /alta los datos son de quien la rellena: a quién le llegan y cómo
          borrarlos, en cada paso (lo que promete la casilla del principio). */}
      {publica && (
        <p className="alta-pie alta-borrar">
          {agencia?.nombre ? `Tus datos y tus respuestas los recibe ${agencia.nombre}, a través de HELM. ` : ''}
          <button type="button" className="alta-enlace" onClick={onBorrar} disabled={borrando}>
            {borrando ? 'Borrando…' : 'Borrar mis datos'}
          </button>
        </p>
      )}
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
function Cierre({ secciones, hechas, total, estado, onPaso, publica, destino, recordada }) {
  const faltan = secciones
    .map((s, i) => ({ s, i, n: s.campos.length - s.hechas }))
    .filter(x => x.n > 0)
  // Por dónde se vuelve: con enlace, el mismo enlace; en /alta, este navegador.
  const volver = !publica ? 'Podrás volver a este mismo enlace para cambiar lo que quieras.'
    : recordada ? 'Podrás volver desde este mismo navegador para cambiar lo que quieras.'
    : 'Podrás cambiar lo que quieras mientras no cierres esta página.'
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
          ? `Lo que cambies se guarda solo y le llega al momento ${destino}.`
          : `Al enviarlo, avisamos ${destino}. ${volver}`}
      </p>
    </div>
  )
}
