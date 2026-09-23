// HELM — Contenido: qué pasó con lo que publicaste.
//
// La otra mitad de Guiones. Allí se planifica y se escribe lo que se va a
// grabar; aquí se ve el resultado: las visitas de cada vídeo, cuáles son los
// que funcionan y —lo que de verdad sirve— qué tienen en común los ganadores,
// que es lo único de esta pantalla que cambia lo que se graba mañana.
//
// Los datos NO se piden a Instagram al abrir la sección: se sincronizan a
// helm_ig_media (ver api/instagram.js, que explica por qué) y aquí se lee de
// Supabase como en el resto del panel. Por eso hay un botón "Actualizar": lo
// que se ve es la foto de la última sincronización, con su fecha a la vista
// para que nadie tome una decisión creyendo que mira el minuto actual.
import { useEffect, useMemo, useState } from 'react'
import {
  Instagram, RefreshCw, Link2Off, ExternalLink, Trophy, Eye, Heart,
  MessageCircle, Bookmark, Send, Clock, Play, Image as ImageIcon,
} from 'lucide-react'
import { fetchRowsOrError, MISSING_TABLE, instagramApi, fmtDate } from '../lib'
import { Panel, Empty, Field, Input, Drawer, FormNote, Kpi } from '../ui'
import './contenidoSocial.css'

const TABLA = 'helm_ig_media'

const nf = new Intl.NumberFormat('es-ES')
const miles = (n) => nf.format(Math.round(Number(n) || 0))
// Los números grandes de redes se leen mejor cortos: 12.400 visitas es "12,4 K".
const corto = (n) => {
  const v = Number(n) || 0
  if (v < 1000) return String(v)
  if (v < 1_000_000) return (v / 1000).toFixed(v < 10_000 ? 1 : 0).replace('.', ',') + 'K'
  return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M'
}
const pct = (parte, total) => (total ? `${((parte / total) * 100).toFixed(1).replace('.', ',')}%` : '—')
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

const esVideo = (r) => String(r.producto).toUpperCase() === 'REELS' || String(r.tipo).toUpperCase() === 'VIDEO'

const RANGOS = [
  { key: '30', label: '30 días', dias: 30 },
  { key: '90', label: '90 días', dias: 90 },
  { key: '365', label: '1 año', dias: 365 },
  { key: 'todo', label: 'Todo', dias: null },
]
const TIPOS = [
  { key: 'todo', label: 'Todo' },
  { key: 'video', label: 'Reels y vídeos' },
  { key: 'foto', label: 'Fotos y carruseles' },
]
const ORDENES = [
  { key: 'visitas', label: 'Visitas', campo: r => r.visitas },
  { key: 'alcance', label: 'Alcance', campo: r => r.alcance },
  { key: 'guardados', label: 'Guardados', campo: r => r.guardados },
  { key: 'compartidos', label: 'Compartidos', campo: r => r.compartidos },
  { key: 'interaccion', label: 'Interacción', campo: r => (r.visitas ? r.interacciones / r.visitas : 0) },
  { key: 'fecha', label: 'Más reciente', campo: r => (r.publicado_en ? new Date(r.publicado_en).getTime() : 0) },
]

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const FRANJAS = [
  { key: 'madrugada', label: 'Madrugada (00–06)', test: h => h < 6 },
  { key: 'manana', label: 'Mañana (06–12)', test: h => h >= 6 && h < 12 },
  { key: 'mediodia', label: 'Mediodía (12–16)', test: h => h >= 12 && h < 16 },
  { key: 'tarde', label: 'Tarde (16–20)', test: h => h >= 16 && h < 20 },
  { key: 'noche', label: 'Noche (20–24)', test: h => h >= 20 },
]

// Palabras que se repiten en cualquier texto en español y no dicen nada del
// gancho. Sin esta lista, el "qué tienen en común tus ganadores" contesta
// siempre lo mismo: "que", "para", "como".
const VACIAS = new Set([
  'que', 'para', 'como', 'pero', 'esto', 'esta', 'este', 'esos', 'esas', 'con', 'sin', 'por', 'los', 'las',
  'del', 'una', 'uno', 'unos', 'unas', 'más', 'mas', 'muy', 'todo', 'toda', 'todos', 'todas', 'cuando',
  'porque', 'donde', 'quien', 'sobre', 'entre', 'hasta', 'desde', 'tiene', 'tienes', 'tengo', 'hacer',
  'haces', 'hace', 'ser', 'está', 'estas', 'estoy', 'eres', 'soy', 'and', 'the', 'you', 'your',
])

// El gancho de una pieza son sus primeras palabras: es lo que se lee antes de
// decidir si sigues viendo. El resto del pie no compite por la atención.
const gancho = (caption, palabras = 12) =>
  String(caption || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, palabras).join(' ')

function palabrasClave(filas, cuantas = 8) {
  const cuenta = new Map()
  for (const r of filas) {
    const vistas = new Set()
    for (const w of gancho(r.caption, 14).toLowerCase().split(/[^a-záéíóúüñ0-9]+/i)) {
      if (w.length < 4 || VACIAS.has(w) || vistas.has(w)) continue
      vistas.add(w)
      cuenta.set(w, (cuenta.get(w) || 0) + 1)
    }
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, cuantas)
}

// Media de visitas por grupo, ordenada de mejor a peor. Los grupos con una sola
// pieza se marcan: una media de un dato no es una media, y presentarla como tal
// es la forma más rápida de que alguien cambie su calendario por casualidad.
function porGrupo(filas, clave) {
  const g = new Map()
  for (const r of filas) {
    const k = clave(r)
    if (k == null) continue
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(Number(r.visitas) || 0)
  }
  return [...g.entries()]
    .map(([k, xs]) => ({ clave: k, piezas: xs.length, media: media(xs) }))
    .sort((a, b) => b.media - a.media)
}

function Barra({ label, valor, max, nota }) {
  return (
    <div className="helm-ig-barra">
      <div className="helm-ig-barra-lbl">{label}{nota && <small>{nota}</small>}</div>
      <div className="helm-ig-barra-riel">
        <div className="helm-ig-barra-fill" style={{ width: `${max ? Math.max(4, (valor / max) * 100) : 0}%` }} />
      </div>
      <b>{corto(valor)}</b>
    </div>
  )
}

function Miniatura({ fila, size = 'sm' }) {
  return (
    <div className={'helm-ig-thumb ' + size}>
      {fila.thumb_url
        ? <img src={fila.thumb_url} alt="" loading="lazy" />
        : <div className="helm-ig-thumb-ph">{esVideo(fila) ? <Play size={16} /> : <ImageIcon size={16} />}</div>}
      {esVideo(fila) && <span className="helm-ig-thumb-play"><Play size={11} /></span>}
    </div>
  )
}

// ── Conectar la cuenta ─────────────────────────────────────────────────────
// Dos caminos al mismo sitio: el botón de Instagram (si el servidor tiene la
// app de Meta configurada) y pegar un token de larga duración, que es lo que
// permite usar la sección mientras la app está en revisión.
function Conectar({ clientId, status, onHecho }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function conectar() {
    setBusy(true); setError(null)
    try {
      const { url } = await instagramApi.authUrl(clientId)
      window.location.href = url
    } catch (err) { setError(err.message); setBusy(false) }
  }

  async function pegar(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await instagramApi.link(clientId, token.trim()); setToken(''); await onHecho() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <Panel title="Conecta tu Instagram">
      <div className="helm-ig-conectar">
        <p>
          Con la cuenta conectada, HELM trae cada publicación con sus visitas, su alcance y
          sus guardados, y estudia cuáles son las que funcionan. Necesita una cuenta
          <b> profesional</b> (empresa o creador): las personales no dan métricas ni por la API
          ni en la propia app de Instagram.
        </p>
        {status?.oauth ? (
          <button className="helm-btn primary" onClick={conectar} disabled={busy}>
            <Instagram size={16} /> {busy ? 'Abriendo Instagram…' : 'Conectar con Instagram'}
          </button>
        ) : (
          <FormNote tone="warn">
            El servidor todavía no tiene la app de Meta configurada (IG_APP_ID e IG_APP_SECRET),
            así que el botón de "Conectar con Instagram" no está disponible. Mientras tanto,
            puedes pegar un token de larga duración y la sección funciona igual.
          </FormNote>
        )}

        <form onSubmit={pegar} className="helm-ig-token">
          <Field
            label="…o pega un token de larga duración"
            hint="Se genera en developers.facebook.com, en tu app de Instagram. Se guarda en el servidor y nunca vuelve al navegador."
          >
            <Input value={token} onChange={e => setToken(e.target.value)} placeholder="IGAA…" spellCheck={false} />
          </Field>
          <button className="helm-btn" disabled={busy || token.trim().length < 20}>
            {busy ? 'Comprobando…' : 'Usar este token'}
          </button>
        </form>
        {error && <FormNote>{error}</FormNote>}
      </div>
    </Panel>
  )
}

export default function ContenidoSocial({ clientId }) {
  const [status, setStatus] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [filas, setFilas] = useState([])
  const [errorTabla, setErrorTabla] = useState(null)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [tab, setTab] = useState('ganadores')
  const [rango, setRango] = useState('90')
  const [tipo, setTipo] = useState('todo')
  const [orden, setOrden] = useState('visitas')
  const [sel, setSel] = useState(null)
  // El "hoy" desde el que se cuentan los rangos se fija al abrir la sección y
  // no se recalcula en cada render: si no, los últimos 90 días cambian de
  // frontera mientras alguien mira la tabla y las medias bailan solas.
  const [ahora] = useState(() => Date.now())

  // Igual que en Ajustes: funciones sueltas y un efecto que solo depende del
  // perfil. Envolverlas en useCallback no aporta nada (la vista se remonta
  // entera al cambiar de perfil, ver el key= de HelmApp).
  const cargarStatus = () =>
    instagramApi.status(clientId)
      .then(st => { setStatus(st); return st })
      .catch(err => { setError(err.message); setStatus(null); return null })

  const cargarFilas = () =>
    fetchRowsOrError(TABLA, clientId, { order: 'publicado_en', asc: false, limit: 500 })
      .then(({ rows, error: err }) => { setFilas(rows); setErrorTabla(err) })

  // Sin setCargando(true) al entrar: el estado ya nace en true.
  useEffect(() => {
    Promise.all([cargarStatus(), cargarFilas()]).then(() => setCargando(false))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Vuelta del permiso de Instagram: el callback redirige aquí con
  // ?instagram=ok|error. Se lee al montar y se limpia la URL después, que si no
  // el mensaje reaparece en cada recarga.
  const [vuelta] = useState(() => {
    const q = new URLSearchParams(window.location.search)
    const r = q.get('instagram')
    if (!r) return null
    return r === 'ok'
      ? { ok: 'Cuenta de Instagram conectada. Dale a Actualizar para traer tus métricas.' }
      : { error: q.get('msg') || 'No se pudo conectar con Instagram.' }
  })
  useEffect(() => {
    if (!vuelta) return
    const q = new URLSearchParams(window.location.search)
    q.delete('instagram'); q.delete('msg'); q.delete('view')
    const resto = q.toString()
    window.history.replaceState({}, '', window.location.pathname + (resto ? '?' + resto : ''))
  }, [vuelta])

  async function sincronizar() {
    setSincronizando(true); setError(null); setMsg(null)
    try {
      const r = await instagramApi.sync(clientId)
      await Promise.all([cargarStatus(), cargarFilas()])
      setMsg(`${r.sincronizadas} publicaciones actualizadas.`)
    } catch (err) { setError(err.message) }
    setSincronizando(false)
  }

  async function desconectar() {
    if (!confirm('¿Desconectar Instagram de este perfil? Las métricas ya traídas se quedan.')) return
    setError(null); setMsg(null)
    try { await instagramApi.unlink(clientId); await cargarStatus(); setMsg('Instagram desconectado.') }
    catch (err) { setError(err.message) }
  }

  // ── Lo que se está mirando ───────────────────────────────────────────────
  const enRango = useMemo(() => {
    const dias = RANGOS.find(r => r.key === rango)?.dias
    const desde = dias ? ahora - dias * 86_400_000 : null
    return filas.filter(r => {
      if (desde && (!r.publicado_en || new Date(r.publicado_en).getTime() < desde)) return false
      if (tipo === 'video') return esVideo(r)
      if (tipo === 'foto') return !esVideo(r)
      return true
    })
  }, [filas, rango, tipo, ahora])

  const ordenadas = useMemo(() => {
    const campo = ORDENES.find(o => o.key === orden)?.campo || (r => r.visitas)
    return [...enRango].sort((a, b) => campo(b) - campo(a))
  }, [enRango, orden])

  const resumen = useMemo(() => {
    const visitas = enRango.map(r => Number(r.visitas) || 0)
    const total = visitas.reduce((a, b) => a + b, 0)
    const interacciones = enRango.reduce((a, r) => a + (Number(r.interacciones) || 0), 0)
    const mejor = enRango.reduce((m, r) => (!m || r.visitas > m.visitas ? r : m), null)
    return { piezas: enRango.length, total, mediaVisitas: media(visitas), interacciones, mejor }
  }, [enRango])

  // ── El estudio de los ganadores ──────────────────────────────────────────
  // Cinco piezas es el mínimo para que "esto es lo que funciona" signifique
  // algo. Con menos, cualquier patrón es la casualidad de un día bueno, así que
  // se dice en vez de dibujar gráficos que no sostienen nada.
  const estudio = useMemo(() => {
    if (enRango.length < 5) return null
    const cuantos = Math.max(3, Math.round(enRango.length * 0.2))
    const porVisitas = [...enRango].sort((a, b) => (b.visitas || 0) - (a.visitas || 0))
    const ganadores = porVisitas.slice(0, cuantos)
    const resto = porVisitas.slice(cuantos)
    const mediaGan = media(ganadores.map(r => Number(r.visitas) || 0))
    const mediaResto = media(resto.map(r => Number(r.visitas) || 0))

    const conFecha = enRango.filter(r => r.publicado_en)
    return {
      ganadores,
      cuantos,
      mediaGan,
      mediaResto,
      multiplicador: mediaResto ? mediaGan / mediaResto : null,
      dias: porGrupo(conFecha, r => DIAS[new Date(r.publicado_en).getDay()]),
      franjas: porGrupo(conFecha, r => {
        const h = new Date(r.publicado_en).getHours()
        return FRANJAS.find(f => f.test(h))?.label || null
      }),
      formatos: porGrupo(enRango, r => (esVideo(r) ? 'Reels y vídeos' : 'Fotos y carruseles')),
      palabras: palabrasClave(ganadores),
      largoGan: media(ganadores.map(r => String(r.caption || '').length)),
      largoResto: media(resto.map(r => String(r.caption || '').length)),
      guardadosGan: media(ganadores.map(r => Number(r.guardados) || 0)),
      guardadosResto: media(resto.map(r => Number(r.guardados) || 0)),
    }
  }, [enRango])

  if (cargando) return <Panel title="Contenido"><Empty>Cargando…</Empty></Panel>

  if (!status?.linked) {
    return (
      <div className="helm-grid">
        {vuelta?.error && <FormNote>{vuelta.error}</FormNote>}
        {error && <FormNote>{error}</FormNote>}
        <Conectar clientId={clientId} status={status} onHecho={cargarStatus} />
        {filas.length > 0 && (
          <Panel title="Lo que ya se trajo">
            <Empty>
              La cuenta está desconectada, pero las {filas.length} publicaciones que se
              sincronizaron siguen aquí. Vuelve a conectarla para actualizarlas.
            </Empty>
          </Panel>
        )}
      </div>
    )
  }

  const maxDia = estudio?.dias?.[0]?.media || 0
  const maxFranja = estudio?.franjas?.[0]?.media || 0
  const maxFormato = estudio?.formatos?.[0]?.media || 0

  return (
    <div className="helm-grid">
      {vuelta?.ok && <FormNote tone="ok">{vuelta.ok}</FormNote>}
      {vuelta?.error && <FormNote>{vuelta.error}</FormNote>}
      {error && <FormNote>{error}</FormNote>}
      {msg && <FormNote tone="ok">{msg}</FormNote>}
      {errorTabla === MISSING_TABLE && (
        <FormNote tone="warn">Falta aplicar <b>migrations/helm_instagram.sql</b> en Supabase: sin esa tabla no hay dónde guardar las métricas.</FormNote>
      )}

      {/* La cuenta, y cuándo se miró por última vez. La fecha de la última
          sincronización va arriba a propósito: todo lo que hay debajo es esa
          foto, no el minuto actual. */}
      <Panel>
        <div className="helm-ig-cuenta">
          <div className="helm-ig-avatar">
            {status.picture ? <img src={status.picture} alt="" /> : <Instagram size={20} />}
          </div>
          <div className="helm-ig-cuenta-txt">
            <b>@{status.username || 'cuenta conectada'}</b>
            <span>
              {status.followers != null && `${miles(status.followers)} seguidores · `}
              {status.mediaCount != null && `${miles(status.mediaCount)} publicaciones · `}
              {status.lastSyncAt
                ? `actualizado ${new Date(status.lastSyncAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'sin sincronizar todavía'}
            </span>
          </div>
          <div className="helm-ig-cuenta-acts">
            <button className="helm-btn primary" onClick={sincronizar} disabled={sincronizando}>
              <RefreshCw size={15} className={sincronizando ? 'helm-ig-girando' : undefined} />
              {sincronizando ? 'Trayendo métricas…' : 'Actualizar'}
            </button>
            <button className="helm-btn sm" onClick={desconectar}><Link2Off size={14} /> Desconectar</button>
          </div>
        </div>
      </Panel>

      {filas.length === 0 ? (
        <Panel title="Todavía no hay métricas">
          <Empty>Dale a <b>Actualizar</b> para traer tus publicaciones con sus visitas. Tarda unos segundos.</Empty>
        </Panel>
      ) : (
        <>
          <div className="helm-grid helm-kpis">
            <Kpi label="Visitas" value={miles(resumen.total)} accent sub={`${resumen.piezas} publicaciones`} />
            <Kpi label="Media por pieza" value={miles(resumen.mediaVisitas)} sub="visitas" />
            <Kpi label="Interacción" value={pct(resumen.interacciones, resumen.total)} sub="likes, comentarios, guardados y envíos sobre visitas" />
            <Kpi
              label="Mejor pieza"
              value={corto(resumen.mejor?.visitas || 0)}
              sub={resumen.mejor?.publicado_en ? fmtDate(resumen.mejor.publicado_en) : '—'}
            />
          </div>

          <div className="helm-ig-filtros">
            <div className="helm-segmented">
              {[{ key: 'ganadores', label: 'Ganadores' }, { key: 'videos', label: 'Todas las piezas' }].map(t => (
                <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>
            <div className="helm-segmented">
              {RANGOS.map(r => (
                <button key={r.key} type="button" className={rango === r.key ? 'on' : ''} onClick={() => setRango(r.key)}>{r.label}</button>
              ))}
            </div>
            <select className="helm-select" value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {tab === 'videos' && (
              <select className="helm-select" value={orden} onChange={e => setOrden(e.target.value)}>
                {ORDENES.map(o => <option key={o.key} value={o.key}>Ordenar por {o.label.toLowerCase()}</option>)}
              </select>
            )}
          </div>

          {enRango.length === 0 ? (
            <Panel><Empty>No hay publicaciones en este rango. Prueba a ampliarlo.</Empty></Panel>
          ) : tab === 'videos' ? (
            <Panel title={`${enRango.length} publicaciones`}>
              <div className="helm-tablewrap">
                <table className="helm-table helm-ig-tabla">
                  <thead>
                    <tr>
                      <th></th><th>Publicación</th><th>Fecha</th><th>Visitas</th><th>Alcance</th>
                      <th>Likes</th><th>Coment.</th><th>Guard.</th><th>Compart.</th><th>Retención</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenadas.map(r => (
                      <tr key={r.id} onClick={() => setSel(r)} className="helm-ig-fila">
                        <td><Miniatura fila={r} /></td>
                        <td className="helm-ig-caption">{gancho(r.caption, 10) || <i>Sin pie</i>}</td>
                        <td>{r.publicado_en ? fmtDate(r.publicado_en) : '—'}</td>
                        <td><b>{miles(r.visitas)}</b></td>
                        <td>{miles(r.alcance)}</td>
                        <td>{miles(r.likes)}</td>
                        <td>{miles(r.comentarios)}</td>
                        <td>{miles(r.guardados)}</td>
                        <td>{miles(r.compartidos)}</td>
                        <td>{r.retencion_media ? `${Number(r.retencion_media).toFixed(1).replace('.', ',')} s` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : !estudio ? (
            <Panel title="Estudio de ganadores">
              <Empty>
                Con menos de cinco publicaciones en el rango no se puede decir qué funciona:
                cualquier patrón sería la casualidad de un día bueno. Amplía el rango o
                publica un poco más.
              </Empty>
            </Panel>
          ) : (
            <>
              <Panel title={`Tus ${estudio.cuantos} piezas ganadoras`} action={
                estudio.multiplicador
                  ? <span className="helm-chip cyan">×{estudio.multiplicador.toFixed(1).replace('.', ',')} sobre el resto</span>
                  : null
              }>
                <div className="helm-ig-top">
                  {estudio.ganadores.map((r, i) => (
                    <div key={r.id} className="helm-ig-top-card" onClick={() => setSel(r)}>
                      <div className="helm-ig-top-pos">{i === 0 ? <Trophy size={14} /> : i + 1}</div>
                      <Miniatura fila={r} size="md" />
                      <div className="helm-ig-top-txt">
                        <b>{corto(r.visitas)} visitas</b>
                        <span>{gancho(r.caption, 9) || 'Sin pie'}</span>
                        <small>{r.publicado_en ? fmtDate(r.publicado_en) : '—'} · {miles(r.guardados)} guardados · {miles(r.compartidos)} compartidos</small>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Qué tienen en común">
                <div className="helm-ig-patrones">
                  <div className="helm-ig-patron">
                    <h4>Día de publicación</h4>
                    {estudio.dias.slice(0, 4).map(d => (
                      <Barra key={d.clave} label={d.clave} valor={d.media} max={maxDia}
                        nota={d.piezas === 1 ? ' · 1 pieza' : ` · ${d.piezas} piezas`} />
                    ))}
                  </div>
                  <div className="helm-ig-patron">
                    <h4>Hora</h4>
                    {estudio.franjas.slice(0, 4).map(f => (
                      <Barra key={f.clave} label={f.clave} valor={f.media} max={maxFranja}
                        nota={f.piezas === 1 ? ' · 1 pieza' : ` · ${f.piezas} piezas`} />
                    ))}
                  </div>
                  <div className="helm-ig-patron">
                    <h4>Formato</h4>
                    {estudio.formatos.map(f => (
                      <Barra key={f.clave} label={f.clave} valor={f.media} max={maxFormato}
                        nota={` · ${f.piezas} piezas`} />
                    ))}
                  </div>
                </div>

                <div className="helm-ig-lecturas">
                  {estudio.palabras.length > 0 && (
                    <div>
                      <h4>Palabras que se repiten en sus ganchos</h4>
                      <div className="helm-chips">
                        {estudio.palabras.map(([w, n]) => (
                          <span key={w} className="helm-chip">{w}<b>{n}</b></span>
                        ))}
                      </div>
                    </div>
                  )}
                  <ul className="helm-ig-notas">
                    <li>
                      Los ganadores hacen <b>{miles(estudio.mediaGan)}</b> visitas de media
                      frente a <b>{miles(estudio.mediaResto)}</b> del resto.
                    </li>
                    <li>
                      Se guardan <b>{miles(estudio.guardadosGan)}</b> veces de media
                      ({miles(estudio.guardadosResto)} el resto): guardar es la señal de que
                      la pieza sirve para algo, no solo de que gustó.
                    </li>
                    <li>
                      Sus pies tienen <b>{Math.round(estudio.largoGan)}</b> caracteres de media,
                      frente a {Math.round(estudio.largoResto)} del resto.
                    </li>
                  </ul>
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {sel && (
        <Drawer
          title={gancho(sel.caption, 7) || 'Publicación'}
          sub={sel.publicado_en ? new Date(sel.publicado_en).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'Sin fecha'}
          onClose={() => setSel(null)}
          footer={sel.permalink
            ? <a className="helm-btn" href={sel.permalink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ver en Instagram</a>
            : null}
        >
          <div className="helm-ig-detalle">
            <Miniatura fila={sel} size="lg" />
            <div className="helm-ig-metricas">
              <div><Eye size={14} /><b>{miles(sel.visitas)}</b><span>visitas</span></div>
              <div><Instagram size={14} /><b>{miles(sel.alcance)}</b><span>alcance</span></div>
              <div><Heart size={14} /><b>{miles(sel.likes)}</b><span>likes</span></div>
              <div><MessageCircle size={14} /><b>{miles(sel.comentarios)}</b><span>comentarios</span></div>
              <div><Bookmark size={14} /><b>{miles(sel.guardados)}</b><span>guardados</span></div>
              <div><Send size={14} /><b>{miles(sel.compartidos)}</b><span>compartidos</span></div>
              {sel.retencion_media != null && (
                <div><Clock size={14} /><b>{Number(sel.retencion_media).toFixed(1).replace('.', ',')} s</b><span>retención media</span></div>
              )}
              {sel.visitas_perfil > 0 && (
                <div><Instagram size={14} /><b>{miles(sel.visitas_perfil)}</b><span>visitas al perfil</span></div>
              )}
              {sel.seguidores_ganados > 0 && (
                <div><Instagram size={14} /><b>{miles(sel.seguidores_ganados)}</b><span>seguidores nuevos</span></div>
              )}
            </div>
            {sel.caption && <div className="helm-ig-pie">{sel.caption}</div>}
          </div>
        </Drawer>
      )}
    </div>
  )
}
