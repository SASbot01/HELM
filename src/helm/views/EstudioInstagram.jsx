// HELM — Estudio de Instagram. Los scorers deterministas del Agent OS, a mano,
// para cualquier perfil (el tuyo o el de un cliente). Sin IA y sin red por
// fuera: /api/ig-calidad solo procesa el texto que le mandas.
//
//   · Gancho   — puntúa la primera línea del reel (5 propiedades) y la rankea.
//   · Caption  — la ventana real de 125 caracteres + checklist + tope de 5 hashtags.
//   · Humanizar— le quita el olor a IA (invisibles, tipografía, relleno) y lo puntúa.
//   · Perfil   — la rúbrica de 12 partes sobre 100, con reescritura en orden.
import { useEffect, useState } from 'react'
import { ArrowLeft, Sparkles, Hash, Wand2, UserSquare, Copy, Check, AlertTriangle, Target } from 'lucide-react'
import './estudioIg.css'

async function calidad(action, body = {}) {
  const r = await fetch('/api/ig-calidad', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

const TABS = [
  { key: 'gancho', label: 'Gancho', icon: Sparkles },
  { key: 'caption', label: 'Caption', icon: Hash },
  { key: 'humano', label: 'Humanizar', icon: Wand2 },
  { key: 'perfil', label: 'Perfil', icon: UserSquare },
]

export default function EstudioInstagram({ client, onVolver }) {
  const [tab, setTab] = useState('gancho')
  return (
    <div className="ag embebido">
      <header className="ag-top dentro">
        <div>
          <button type="button" className="ag-volver" onClick={onVolver}>
            <ArrowLeft size={14} strokeWidth={2.2} /> Agentes
          </button>
          <h1>Estudio de Instagram</h1>
          <p>
            Las herramientas que miden el contenido de {client?.name || 'este perfil'} antes de publicar: el gancho,
            la caption, el olor a IA y el perfil. Corren en tu máquina, sobre el texto que pegues. No publican nada.
          </p>
        </div>
      </header>

      <nav className="eig-tabs">
        {TABS.map(t => {
          const I = t.icon
          return (
            <button key={t.key} type="button" className={'eig-tab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
              <I size={15} /> {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'gancho' && <Gancho />}
      {tab === 'caption' && <Caption />}
      {tab === 'humano' && <Humanizar />}
      {tab === 'perfil' && <Perfil />}
    </div>
  )
}

// ── Utilidades de UI ────────────────────────────────────────────────────────
const tono = (s) => (s >= 70 ? 'bien' : s >= 45 ? 'medio' : 'mal')
function Barra({ score }) {
  return (
    <div className="eig-barra"><span className={`eig-barra-fill ${tono(score)}`} style={{ width: `${Math.max(2, score)}%` }} /></div>
  )
}
function Copiar({ texto }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="ag-btn sm" onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1800) }).catch(() => {}) }}>
      {ok ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
    </button>
  )
}

function useCalidad() {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => { setError(''); setCargando(true); try { return await fn() } catch (e) { setError(e.message); return null } finally { setCargando(false) } }
  return { cargando, error, run }
}

// ── Gancho ──────────────────────────────────────────────────────────────────
const PROP = {
  LENGTH: { es: 'Longitud', baja: 'Acórtalo: 5–12 palabras, que se diga en 2–3 segundos.' },
  SPECIFICITY: { es: 'Concreción', baja: 'Mete un número o un nombre concreto; nada de abstracto.' },
  STAKES: { es: 'Tensión', baja: 'Pon algo en juego: una pérdida, un error, un «nunca».' },
  FRONTLOAD: { es: 'Lo bueno, delante', baja: 'Lo interesante en las primeras palabras; quita el relleno del arranque.' },
  ADDRESS: { es: 'A quién le habla', baja: 'Háblale a una persona: usa «tú», «te».' },
}
const VEREDICTO = { STRONG: 'Fuerte', OK: 'Aceptable', WEAK: 'Flojo' }

function Gancho() {
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState(null)
  const { cargando, error, run } = useCalidad()

  async function puntuar() {
    const lineas = texto.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8)
    if (!lineas.length) return
    const out = await run(async () => Promise.all(lineas.map(l => calidad('gancho', { texto: l }).then(r => ({ linea: l, ...r })))))
    if (out) setRes(out.sort((a, b) => b.score - a.score))
  }

  const top = res?.[0]
  return (
    <div className="eig-panel">
      <p className="eig-ayuda">Pega uno o varios ganchos (uno por línea). Te los puntúa y te dice cuál grabar. Un gancho es la <b>primera frase</b> del reel, lo que se dice en los 3 primeros segundos.</p>
      <textarea className="eig-area" rows={4} value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Perdí 18.000 € por no leer una cláusula\nNadie te cuenta esto de tus primeros reels\nDeja de hacer cardio en ayunas'} />
      <div className="eig-acciones">
        <button type="button" className="ag-btn primario" onClick={puntuar} disabled={cargando || !texto.trim()}>{cargando ? 'Puntuando…' : 'Puntuar el gancho'}</button>
      </div>
      {error && <p className="ag-error">{error}</p>}

      {res && (
        <>
          {res.length > 1 && (
            <div className="eig-ranking">
              {res.map((r, i) => (
                <div key={i} className={'eig-rank-fila' + (i === 0 ? ' top' : '')}>
                  <span className={`eig-nota ${tono(r.score)}`}>{r.score}</span>
                  <span className="eig-rank-verd">{VEREDICTO[r.verdict]}</span>
                  <span className="eig-rank-linea">{r.linea}</span>
                </div>
              ))}
              <p className="eig-ayuda eig-ranking-pie">Graba el de arriba. Si el mejor no llega a 50, ninguno es el gancho.</p>
            </div>
          )}

          {top && (
            <div className="eig-card">
              <div className="eig-cabeza">
                <div>
                  <span className={`eig-nota grande ${tono(top.score)}`}>{top.score}</span>
                  <span className="eig-sub">/100 · {VEREDICTO[top.verdict]}</span>
                </div>
                {top.formula && <span className="eig-chip"><Target size={12} /> {top.formula.nombre}</span>}
              </div>
              <div className="eig-props">
                {Object.entries(top.checks).map(([k, v]) => (
                  <div key={k} className="eig-prop">
                    <div className="eig-prop-top"><b>{PROP[k]?.es || k}</b><span className={tono(v.score)}>{Math.round(v.score)}</span></div>
                    <Barra score={v.score} />
                    {v.score < 60 && <small className="eig-prop-tip">{PROP[k]?.baja}</small>}
                  </div>
                ))}
              </div>
              {top.flags?.length > 0 && (
                <div className="eig-flags">
                  {top.flags.map((f, i) => <p key={i}><AlertTriangle size={14} /> {f}</p>)}
                </div>
              )}
              {top.verdict !== 'STRONG' && <p className="eig-ayuda">Lo más flojo: <b>{PROP[top.weakest]?.es || top.weakest}</b>. Arréglalo y vuelve a puntuar.</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Caption ─────────────────────────────────────────────────────────────────
const CHECK_ES = {
  LENGTH: 'Longitud total', 'FIRST LINE': 'Primera línea', 'HOOK IS CONCRETE': 'Gancho concreto',
  HASHTAGS: 'Hashtags', 'TAG PLACEMENT': 'Dónde van los hashtags', LINKS: 'Enlaces',
  'ONE ASK': 'Una sola llamada a la acción', EMOJI: 'Emojis', 'SEARCH TERMS': 'Términos de búsqueda',
}
const BADGE = { PASS: 'ok', WARN: 'medio', FAIL: 'mal' }

function Caption() {
  const [texto, setTexto] = useState('')
  const [keywords, setKeywords] = useState('')
  const [res, setRes] = useState(null)
  const { cargando, error, run } = useCalidad()

  async function lintar() {
    const kw = keywords.split(',').map(s => s.trim()).filter(Boolean)
    const out = await run(() => calidad('caption', { texto, keywords: kw }))
    if (out) setRes(out)
  }

  return (
    <div className="eig-panel">
      <p className="eig-ayuda">La caption, con los <b>125 caracteres que de verdad se ven</b> en el feed antes del «… más». Casi toda caption que falla, falla ahí.</p>
      <textarea className="eig-area" rows={5} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pega aquí la caption entera, con sus hashtags…" />
      <input className="eig-input" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Palabras clave de búsqueda, separadas por comas (ej. contratos freelance, precios)" />
      <div className="eig-acciones">
        <button type="button" className="ag-btn primario" onClick={lintar} disabled={cargando || !texto.trim()}>{cargando ? 'Analizando…' : 'Lintar la caption'}</button>
      </div>
      {error && <p className="ag-error">{error}</p>}

      {res && (
        <div className="eig-card">
          <p className="eig-ventana-tit">Lo que se ve en el feed</p>
          <div className="eig-ventana">{res.ventana}{res.truncated ? <span className="eig-corte"> … más</span> : null}</div>
          <div className="eig-checks">
            {res.checks.map((c, i) => (
              <div key={i} className="eig-check">
                <span className={`eig-badge ${BADGE[c.estado]}`}>{c.estado}</span>
                <span className="eig-check-nom">{CHECK_ES[c.nombre] || c.nombre}</span>
                <span className="eig-check-det">{c.detalle}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Humanizar ───────────────────────────────────────────────────────────────
const EJE_ES = { BURSTINESS: 'Ritmo', SPECIFICITY: 'Concreción', SLOP: 'Relleno', FINGERPRINT: 'Huella', VOICE: 'Voz' }
const VER_HUM = { PASS: 'Pasa', REVIEW: 'Revisa', FLAGGED: 'Suena a IA' }

function Humanizar() {
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState(null)
  const { cargando, error, run } = useCalidad()

  async function limpiar() {
    const out = await run(() => calidad('humano', { texto }))
    if (out) setRes(out)
  }

  return (
    <div className="eig-panel">
      <p className="eig-ayuda">Le quita el <b>olor a IA</b>: los caracteres invisibles, los guiones largos, las comillas raras y el vocabulario de relleno. Lo que necesita mano, lo marca para que lo reescribas tú.</p>
      <textarea className="eig-area" rows={5} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pega el borrador (caption, guion, lo que sea)…" />
      <div className="eig-acciones">
        <button type="button" className="ag-btn primario" onClick={limpiar} disabled={cargando || !texto.trim()}>{cargando ? 'Limpiando…' : 'Humanizar'}</button>
      </div>
      {error && <p className="ag-error">{error}</p>}

      {res && (
        <div className="eig-card">
          <div className="eig-cabeza">
            <div>
              <span className={`eig-nota grande ${tono(res.deteccion.score)}`}>{res.deteccion.score}</span>
              <span className="eig-sub">/100 · {VER_HUM[res.deteccion.veredicto] || res.deteccion.veredicto}
                {res.antes ? <> · antes {res.antes.score}</> : null}</span>
            </div>
          </div>
          <div className="eig-props eig-ejes">
            {Object.entries(res.deteccion.ejes).map(([k, v]) => {
              const s = typeof v === 'object' ? v.score : v
              return (
                <div key={k} className="eig-prop">
                  <div className="eig-prop-top"><b>{EJE_ES[k] || k}</b><span className={tono(s)}>{Math.round(s)}</span></div>
                  <Barra score={s} />
                </div>
              )
            })}
          </div>

          <div className="eig-limpio-cab"><b>Texto limpio</b><Copiar texto={res.limpio} /></div>
          <pre className="eig-limpio">{res.limpio}</pre>

          {res.cambios?.length > 0 && (
            <details className="eig-det"><summary>{res.cambios.length} cambios hechos</summary>
              <ul>{res.cambios.map((c, i) => <li key={i}>{c.detalle || c.tipo || JSON.stringify(c)}</li>)}</ul>
            </details>
          )}
          {res.marcados?.length > 0 && (
            <div className="eig-marcados">
              <p className="eig-marcados-tit"><AlertTriangle size={14} /> Para reescribir a mano ({res.marcados.length})</p>
              <ul>{res.marcados.map((m, i) => <li key={i}><b>{m.nombre || m.tipo}</b>{m.fix || m.detalle ? ` — ${m.fix || m.detalle}` : ''}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Perfil ──────────────────────────────────────────────────────────────────
const RUB_ES = {
  name_field: { t: 'Campo de nombre', d: 'El nombre en negrita (30 car.): tu nombre + lo que haces en palabras que la gente busca. Es lo que indexa la búsqueda.' },
  bio_first_line: { t: 'Primera línea de la bio', d: 'Para quién es y qué le cambia, en sus palabras. No un cargo ni tres emojis con barras.' },
  bio_body: { t: 'Resto de la bio', d: 'Una prueba o una oferta concreta, en frases, no una lista con barras.' },
  pinned_three: { t: 'Los 3 fijados', d: '3 posts fijados con 3 trabajos: la mejor prueba, la oferta más clara y la mejor intro a ti.' },
  link: { t: 'El enlace', d: 'Un destino que cumpla lo que promete la bio. Más de dos links es un menú, y convierte peor.' },
  highlights: { t: 'Destacados', d: 'Portadas y orden que guían: oferta, prueba, quién eres.' },
  grid_legibility: { t: 'Cuadrícula legible', d: 'Las primeras 9 se leen y se entiende de qué vas en 3 segundos.' },
  photo: { t: 'Foto de perfil', d: 'Se reconoce en miniatura: tu cara o tu logo, con contraste.' },
  handle: { t: 'El @ (usuario)', d: 'Corto, fácil de decir y de buscar.' },
  category_contact: { t: 'Categoría y contacto', d: 'Categoría puesta y los botones de contacto o acción activos.' },
  recent_activity: { t: 'Actividad reciente', d: 'Has publicado hace poco: el perfil está vivo.' },
  story_presence: { t: 'Stories activas', d: 'Tienes stories, no solo cuadrícula.' },
}
const NIVELES = [{ k: 'falla', et: 'Falla', f: 0 }, { k: 'medias', et: 'A medias', f: 0.5 }, { k: 'bien', et: 'Bien', f: 1 }]

function Perfil() {
  const [rubrica, setRubrica] = useState(null)
  const [notas, setNotas] = useState({})
  const [error, setError] = useState('')

  useEffect(() => { calidad('rubrica').then(d => setRubrica(d.rubrica)).catch(e => setError(e.message)) }, [])

  if (error) return <div className="eig-panel"><p className="ag-error">{error}</p></div>
  if (!rubrica) return <div className="eig-panel"><p className="eig-ayuda">Cargando la rúbrica…</p></div>

  const total = rubrica.items.reduce((s, it) => s + (notas[it.id] ?? 0) * it.points, 0)
  const nota = Math.round(total)
  const faltan = rubrica.items
    .map(it => ({ it, pierde: (1 - (notas[it.id] ?? 0)) * it.points }))
    .filter(x => x.pierde > 0).sort((a, b) => b.pierde - a.pierde)

  return (
    <div className="eig-panel">
      <p className="eig-ayuda">Puntúa tu perfil (o el de un cliente) sobre 100. Tu perfil es una pantalla de decisión de 3 segundos. Sé honesto: la mayoría cae en 30–40 a la primera.</p>
      <div className="eig-perfil-nota">
        <span className={`eig-nota muy-grande ${tono(nota)}`}>{nota}</span>
        <span className="eig-sub">/100 {Object.keys(notas).length < rubrica.items.length ? '· valora los 12 ítems' : ''}</span>
      </div>

      <div className="eig-rubrica">
        {rubrica.items.map(it => {
          const es = RUB_ES[it.id] || { t: it.id, d: it.full_marks }
          return (
            <div key={it.id} className="eig-rub-item">
              <div className="eig-rub-cab"><b>{es.t}</b><span className="eig-rub-pts">{it.points} pts</span></div>
              <p className="eig-rub-desc">{es.d}</p>
              <div className="eig-niveles">
                {NIVELES.map(n => (
                  <button key={n.k} type="button"
                    className={'eig-nivel' + ((notas[it.id] ?? -1) === n.f ? ` on ${tono(n.f * 100)}` : '')}
                    onClick={() => setNotas(s => ({ ...s, [it.id]: n.f }))}>{n.et}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {faltan.length > 0 && (
        <div className="eig-card eig-arreglar">
          <p className="eig-marcados-tit"><Target size={14} /> Arregla primero lo que más puntos te quita</p>
          <ol>{faltan.slice(0, 5).map(({ it, pierde }) => <li key={it.id}><b>{(RUB_ES[it.id] || {}).t || it.id}</b> <span className="eig-pierde">−{Math.round(pierde)}</span></li>)}</ol>
        </div>
      )}
    </div>
  )
}
