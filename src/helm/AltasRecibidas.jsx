// HELM — las altas que llegan por el enlace público (helm.s4sf.net/alta).
//
// Un negocio que aún no tiene perfil rellena ahí las 40 preguntas del alta
// (pages/AltaHelm.jsx). Al enviarla aparece aquí, en el tablero de Perfiles: se
// lee entera, sin tocarla, y con «Crear perfil» se convierte en un perfil de la
// agencia con las respuestas ya dentro (Onboarding → Alta en HELM). «Descartar»
// la quita de la bandeja y borra sus datos y sus respuestas. Lo hace el
// servidor (api/onboarding.js: altas, alta-convertir y alta-descartar); aquí
// solo se pinta y se pide.
//
// Las que están a medias (han dejado sus datos, pero no la han enviado) no se
// enseñan de primeras, solo cuántas son: se pueden abrir por si conviene
// escribirles. Las que nadie envía se borran solas a los 30 días.
import { useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, Inbox, Loader2, Mail, MessageCircle, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { altasApi } from './lib'
import { ONBOARDING_ALTA } from './onboarding/alta'
import { countAnswered, isAnswered } from './onboarding/schema'
import { Drawer, FormNote } from './ui'
import './perfiles.css'

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const reciente = (campo) => (a, b) => String(b[campo] || '').localeCompare(String(a[campo] || ''))

// Por qué nombre se la reconoce: el del negocio (la pregunta 1, que el
// servidor copia a `negocio` al enviarla) y, si no lo puso, el de quien la rellena.
function nombreDe(alta) {
  const delForm = typeof alta.answers?.nombre === 'string' ? alta.answers.nombre.trim() : ''
  return (alta.negocio || '').trim() || delForm || (alta.nombre || '').trim() || 'Sin nombre'
}

const respondidas = (alta) => countAnswered(ONBOARDING_ALTA, alta.answers || {})

// El WhatsApp para wa.me: solo cifras, y con el 34 delante si es un móvil
// español escrito sin prefijo (que es como lo escribe casi todo el mundo).
function whatsappDe(tel) {
  let d = String(tel || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && /^[67]/.test(d)) d = '34' + d
  return d.length >= 8 ? `https://wa.me/${d}` : null
}

// Una respuesta a texto, según el tipo de la pregunta. null si está sin responder.
function textoDe(field, v) {
  if (!isAnswered(field, v)) return null
  if (field.type === 'scale') return `${v} / 10`
  if (field.type === 'multi') return v.join(' · ')
  if (field.type === 'table') {
    return v
      .filter(fila => Object.values(fila || {}).some(x => String(x ?? '').trim()))
      .map(fila => field.columns
        .map(c => (String(fila[c.key] ?? '').trim() ? `${c.label}: ${String(fila[c.key]).trim()}` : null))
        .filter(Boolean).join(' · '))
      .join('\n')
  }
  return String(v)
}

// ── La bandeja (dentro del modal del tablero) ───────────────────────────────
export default function AltasRecibidas({ altas, fallo, enlace, varias, onAbrir, onReintentar }) {
  const [copiado, setCopiado] = useState(false)
  const [verMedias, setVerMedias] = useState(false)
  const campo = useRef(null)

  function copiar() {
    // Sin portapapeles (http, navegador antiguo) se deja seleccionado para
    // copiarlo a mano.
    const aMano = () => campo.current?.select()
    if (!navigator.clipboard) return aMano()
    navigator.clipboard.writeText(enlace)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })
      .catch(aMano)
  }

  return (
    <VistaAltas
      altas={altas} fallo={fallo} enlace={enlace} varias={varias}
      copiado={copiado} campo={campo} verMedias={verMedias}
      onVerMedias={() => setVerMedias(v => !v)} onCopiar={copiar}
      onAbrir={onAbrir} onReintentar={onReintentar}
    />
  )
}

// La parte que se ve, sin estado: así se puede comprobar sin navegador.
export function VistaAltas({
  altas, fallo, enlace, varias = false, copiado = false, campo, verMedias = false,
  onVerMedias, onCopiar, onAbrir, onReintentar,
}) {
  if (altas == null && !fallo) return <p className="helm-settings-lead">Cargando…</p>
  const lista = altas || []
  const enviadas = lista.filter(a => a.estado === 'enviada').sort(reciente('enviado_at'))
  const medias = lista.filter(a => a.estado === 'borrador').sort(reciente('created_at'))
  const corto = enlace ? enlace.replace(/^https?:\/\//, '') : null

  return (
    <div className="helm-altas">
      <p className="helm-settings-lead">
        Los negocios que aún no tienen perfil pueden rellenar el alta por su cuenta. Cuando la envían,
        llega aquí: la lees entera y con «Crear perfil» se convierte en un perfil con sus respuestas ya dentro.
      </p>

      {fallo && (
        <div className="helm-altas-fallo">
          <FormNote>{fallo}</FormNote>
          <div><button type="button" className="helm-btn sm" onClick={onReintentar}><RefreshCw size={13} /> Reintentar</button></div>
        </div>
      )}

      {enviadas.length > 0 ? (
        <ul className="helm-altas-lista" aria-label="Altas enviadas">
          {enviadas.map(a => <FilaAlta key={a.id} alta={a} varias={varias} onAbrir={onAbrir} />)}
        </ul>
      ) : !fallo && (
        <div className="helm-altas-vacio">
          <Inbox size={22} />
          <b>Todavía no ha llegado ninguna</b>
          <p>
            Cualquier negocio puede rellenar el alta antes de tener perfil{corto ? <> en <b>{corto}</b></> : ''}.
            Pásale el enlace (o ponlo en tu web o en tu bio) y, cuando la envíe, aparecerá aquí con sus
            respuestas para crearle el perfil.
          </p>
        </div>
      )}

      {medias.length > 0 && (
        <div className="helm-altas-medias">
          <button type="button" className="helm-altas-toggle" aria-expanded={verMedias} onClick={onVerMedias}>
            {medias.length === 1
              ? 'Hay 1 a medias: ha dejado sus datos, pero aún no la ha enviado. '
              : `Hay ${medias.length} a medias: han dejado sus datos, pero aún no las han enviado. `}
            <b>{verMedias ? 'Ocultar' : 'Ver'}</b>
          </button>
          {verMedias && (
            <>
              <ul className="helm-altas-lista" aria-label="Altas a medias">
                {medias.map(a => <FilaAlta key={a.id} alta={a} varias={varias} onAbrir={onAbrir} />)}
              </ul>
              <p className="helm-altas-nota">Las que no se envían se borran solas a los 30 días de empezarlas.</p>
            </>
          )}
        </div>
      )}

      {enlace && (
        <div className="helm-settings-block">
          <label htmlFor="helm-altas-enlace">El enlace público de tu agencia</label>
          <div className="helm-altas-enlace">
            <input
              id="helm-altas-enlace" ref={campo} className="helm-input" readOnly value={enlace}
              onFocus={e => e.target.select()}
            />
            <button type="button" className="helm-btn" onClick={onCopiar}>
              {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaAlta({ alta, varias, onAbrir }) {
  const enviada = alta.estado === 'enviada'
  const { done, total } = respondidas(alta)
  const titulo = nombreDe(alta)
  // Si no hay nombre de negocio, el título ya es el de quien la rellena: no se repite debajo.
  const quien = [alta.nombre !== titulo && alta.nombre, varias && alta.agencia?.nombre].filter(Boolean).join(' · ')
  return (
    <li>
      <button type="button" className={'helm-alta-fila' + (enviada ? '' : ' medias')} onClick={() => onAbrir(alta)}>
        <span className="helm-alta-fila-txt">
          <b>{titulo}</b>
          {quien && <small>{quien}</small>}
        </span>
        <span className="helm-alta-fila-meta">
          {done}/{total}<br />{fecha(enviada ? alta.enviado_at : alta.created_at)}
        </span>
        <ArrowUpRight size={15} />
      </button>
    </li>
  )
}

// ── El cajón de un alta ─────────────────────────────────────────────────────
// Solo lectura: las 40 preguntas en el orden del formulario y los datos de
// contacto. Abajo, crear el perfil o descartarla.
export function DetalleAlta({ alta, varias, onCerrar, onCambio, onAbrirPerfil }) {
  const [ocupado, setOcupado] = useState(null)     // null | 'crear' | 'descartar'
  const [error, setError] = useState(null)
  const [creado, setCreado] = useState(null)       // { clientId, slug }
  const [confirmar, setConfirmar] = useState(false)

  async function crear() {
    setOcupado('crear'); setError(null)
    try {
      const r = await altasApi.convertir(alta.id)
      setCreado(r)
      onCambio?.()
    } catch (e) { setError(e.message || 'No se ha podido crear el perfil.') }
    setOcupado(null)
  }

  async function descartar() {
    setOcupado('descartar'); setError(null)
    try {
      await altasApi.descartar(alta.id)
      onCambio?.()
      onCerrar()
    } catch (e) {
      setError(e.message || 'No se ha podido descartar.')
      setOcupado(null)
    }
  }

  return (
    <VistaDetalleAlta
      alta={alta} varias={varias} ocupado={ocupado} error={error} creado={creado} confirmar={confirmar}
      onCrear={crear} onDescartar={descartar}
      onConfirmar={() => { setConfirmar(true); setError(null) }} onCancelar={() => setConfirmar(false)}
      onAbrirPerfil={() => onAbrirPerfil({ id: creado.clientId, slug: creado.slug })}
      onCerrar={onCerrar}
    />
  )
}

export function VistaDetalleAlta({
  alta, varias = false, ocupado = null, error = null, creado = null, confirmar = false,
  onCrear, onDescartar, onConfirmar, onCancelar, onAbrirPerfil, onCerrar,
}) {
  const answers = alta.answers || {}
  const enviada = alta.estado === 'enviada'
  const { done, total } = respondidas(alta)
  const nombre = nombreDe(alta)
  const wa = whatsappDe(alta.telefono)
  const sub = [
    enviada ? `Enviada el ${fecha(alta.enviado_at)}` : `A medias: aún no la ha enviado (empezada el ${fecha(alta.created_at)})`,
    `${done} de ${total} respondidas`,
    varias && alta.agencia?.nombre,
  ].filter(Boolean).join(' · ')

  let pie
  if (creado) {
    pie = (
      <div className="helm-alta-pie">
        <p className="helm-alta-ok"><Check size={15} /> Perfil creado: /{creado.slug}. Sus respuestas ya están en Onboarding → Alta en HELM.</p>
        <div className="helm-alta-botones">
          <button type="button" className="helm-btn" onClick={onCerrar}>Seguir con las altas</button>
          <button type="button" className="helm-btn primary" onClick={onAbrirPerfil}>Abrir el perfil <ArrowUpRight size={15} /></button>
        </div>
      </div>
    )
  } else if (confirmar) {
    pie = (
      <div className="helm-alta-pie">
        <FormNote>{error}</FormNote>
        <p>¿Descartarla? Se borran sus datos de contacto y sus respuestas, y no se crea ningún perfil. No se puede deshacer.</p>
        <div className="helm-alta-botones">
          <button type="button" className="helm-btn" onClick={onCancelar} disabled={ocupado === 'descartar'}>Cancelar</button>
          <button type="button" className="helm-btn danger" onClick={onDescartar} disabled={ocupado === 'descartar'}>
            {ocupado === 'descartar' ? <><Loader2 size={15} className="helm-spin" /> Descartando…</> : <><Trash2 size={15} /> Sí, descartar</>}
          </button>
        </div>
      </div>
    )
  } else {
    pie = (
      <div className="helm-alta-pie">
        <FormNote>{error}</FormNote>
        <p>
          «Crear perfil» crea el perfil «{nombre}»{varias && alta.agencia?.nombre ? ` en ${alta.agencia.nombre}` : ''} con
          estas respuestas ya en Onboarding → Alta en HELM.
        </p>
        <div className="helm-alta-botones">
          <button type="button" className="helm-btn" onClick={onConfirmar} disabled={Boolean(ocupado)}><Trash2 size={15} /> Descartar</button>
          <button type="button" className="helm-btn primary" onClick={onCrear} disabled={Boolean(ocupado)}>
            {ocupado === 'crear' ? <><Loader2 size={15} className="helm-spin" /> Creando…</> : <><UserPlus size={15} /> Crear perfil</>}
          </button>
        </div>
      </div>
    )
  }

  return (
    <Drawer title={nombre} sub={sub} onClose={onCerrar} footer={pie}>
      <div className="helm-form-resp-head">
        <div>
          <small>Quién la rellena</small>
          <b>{alta.nombre || '—'}</b>
        </div>
        <div>
          <small>{enviada ? 'Enviada' : 'Empezada'}</small>
          <b>{fecha(enviada ? alta.enviado_at : alta.created_at) || '—'}</b>
        </div>
      </div>
      {(alta.email || wa) && (
        <div className="helm-drawer-links helm-alta-contacto">
          {alta.email && (
            <a className="helm-btn sm" href={`mailto:${alta.email}`}><Mail size={13} /> {alta.email}</a>
          )}
          {wa && (
            <a className="helm-btn sm" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> {alta.telefono}</a>
          )}
        </div>
      )}

      {ONBOARDING_ALTA.sections.map(s => (
        <section key={s.key} aria-label={s.title}>
          <div className="helm-drawer-section">{s.title}</div>
          <div className="helm-form-resp">
            {s.fields.map(f => {
              const txt = textoDe(f, answers[f.key])
              return (
                <div key={f.key} className="helm-form-resp-item">
                  <small>{f.label}</small>
                  <div className={txt == null ? 'helm-alta-sin' : undefined}>{txt ?? 'Sin responder'}</div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </Drawer>
  )
}
