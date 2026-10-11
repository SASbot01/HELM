// HELM — Roadmap semestral: el plan del negocio a seis meses, mes → semana → día.
//
// La metodología (meses → semanas → cadencia por día) va embebida como plantilla
// compartida, igual para todos los perfiles. Sobre ella se pintan los datos
// REALES del perfil: al abrir un día se ven los guiones que el equipo ya tiene
// programados para esa fecha (de helm_content_calendar), su plan de reels y el
// contexto de ads del mes. Los meses, las semanas y ahora también los días son
// desplegables.
import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, Megaphone, Target, Zap, FileText, Download, Sparkles, ExternalLink, Check, Clapperboard, FolderOpen } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { agentsApi } from '../../agents/api'
import { contenidoApi } from '../lib'
import { descargarPDFGuiones } from './pdfGuiones'
import './roadmap.css'

// ── Plantilla compartida (metodología) ──────────────────────────────────────
const PLANTILLA = {
  objetivo: '50.000 €/mes',
  // Los cuatro formatos, para reels y para historias.
  formatos: [
    { id: 'viral', nombre: 'Viral', objetivo: 'Alcance', cta: false },
    { id: 'autoridad', nombre: 'Autoridad', objetivo: 'Confianza', cta: true },
    { id: 'valor', nombre: 'Valor', objetivo: 'Leads', cta: true },
    { id: 'testimonio', nombre: 'Testimonio', objetivo: 'Prueba social', cta: false },
  ],
  reels_semana: 18,
  reparto: { viral: 8, autoridad: 4, valor: 4, testimonio: 2 },
  cta_dias: ['mar', 'jue', 'vie'],
  // 18 reels/semana, historias a diario, CTA 3 días.
  semana: [
    { dia: 'lun', reels: ['viral', 'viral', 'autoridad'], cta: false },
    { dia: 'mar', reels: ['valor', 'autoridad', 'viral'], cta: true },
    { dia: 'mie', reels: ['viral', 'viral', 'valor'], cta: false },
    { dia: 'jue', reels: ['autoridad', 'valor', 'testimonio'], cta: true },
    { dia: 'vie', reels: ['testimonio', 'viral'], cta: true },
    { dia: 'sab', reels: ['viral', 'autoridad'], cta: false },
    { dia: 'dom', reels: ['valor', 'viral'], cta: false },
  ],
  // Las seis fases hacia los 50k. El presupuesto de ads escala con el ROAS.
  meses: [
    { enfoque: 'nutricion', titulo: 'Fundación y autoridad', objetivo: 'Pilares de contenido, perfil optimizado y primeros virales + autoridad.', ads: { presupuesto: 300, campanas: ['Reconocimiento (test de públicos)'] } },
    { enfoque: 'captacion', titulo: 'Tracción y lead magnet', objetivo: 'Valor con CTA, captar leads y primer testimonio.', ads: { presupuesto: 500, campanas: ['Reconocimiento', 'Retargeting'] } },
    { enfoque: 'lanzamiento', titulo: 'Escalado y oferta', objetivo: 'Subir frecuencia, definir la oferta estrella y ads de conversión.', ads: { presupuesto: 800, campanas: ['Conversión (lead magnet)', 'Retargeting'] } },
    { enfoque: 'venta', titulo: 'Temporada alta', objetivo: 'Campaña estacional fuerte, testimonios y subir presupuesto.', ads: { presupuesto: 1200, campanas: ['Conversión (oferta)', 'Retargeting', 'Reconocimiento'] } },
    { enfoque: 'fidelizacion', titulo: 'Optimización y recurrencia', objetivo: 'Doblar lo que funciona, upsell y comunidad.', ads: { presupuesto: 1800, campanas: ['Retargeting', 'Conversión (upsell)'] } },
    { enfoque: 'venta', titulo: 'Consolidación 50k', objetivo: 'Sistema de ventas afinado, ads a tope y testimonios en bucle.', ads: { presupuesto: 2500, campanas: ['Conversión', 'Retargeting', 'Reconocimiento'] } },
  ],
}

const ENFOQUES = {
  nutricion: { label: 'Nutrición / Autoridad', color: '#d9b66b' },
  captacion: { label: 'Captación', color: '#7aa5f8' },
  lanzamiento: { label: 'Lanzamiento', color: '#e0894a' },
  venta: { label: 'Venta', color: '#4ade80' },
  fidelizacion: { label: 'Fidelización', color: '#e86fa6' },
}
const FORMATO = {
  viral: { nombre: 'Viral', color: '#7aa5f8' },
  autoridad: { nombre: 'Autoridad', color: '#d9b66b' },
  valor: { nombre: 'Valor', color: '#4ade80' },
  testimonio: { nombre: 'Testimonio', color: '#e86fa6' },
}
// Lo que se aprovecha cada mes natural (0 = enero).
const TEMPORADA = ['Propósitos de año nuevo', 'San Valentín', '—', 'Semana Santa', '—', 'Rebajas de verano', 'Verano', 'Verano (flojo)', 'Vuelta al cole', 'Halloween', 'Black Friday', 'Navidad']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const pad2 = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const mismoMes = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
const mismoDia = (a, b) => mismoMes(a, b) && a.getDate() === b.getDate()
const lunes0 = (d) => (d.getDay() + 6) % 7 // 0 = lunes
const lunes0Iso = (f) => (new Date(`${f}T12:00:00`).getDay() + 6) % 7
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const mesLargo = (d) => capital(d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))
const mesCorto = (d) => capital(d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''))
const dd = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
const fechaLarga = (f) => capital(new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))

// Las semanas (lun–dom) que tocan un mes: la del día 1 y las siguientes hasta
// que el lunes se pasa del último día. Alguna puede empezar en el mes anterior.
function semanasDelMes(y, m) {
  const ultimo = new Date(y, m + 1, 0)
  const cur = new Date(y, m, 1)
  cur.setDate(cur.getDate() - lunes0(cur))
  const semanas = []
  while (cur <= ultimo) {
    const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(cur); d.setDate(cur.getDate() + i); return d })
    semanas.push({ inicio: new Date(cur), fin: dias[6], dias })
    cur.setDate(cur.getDate() + 7)
  }
  return semanas
}

// Los tipos de contenido del calendario, con etiqueta y color.
const TIPOS_LBL = { viralidad: 'Viral', autoridad: 'Autoridad', conversion: 'Valor', venta: 'Venta' }
const TIPO_COLOR = { viralidad: '#7aa5f8', autoridad: '#d9b66b', conversion: '#4ade80', venta: '#e4362b' }
const TIPOS_OPC = Object.keys(TIPOS_LBL)

// La fase de Drive de cada pieza (dónde está su carpeta): por_grabar → sin_editar
// → editado → publicado. Es lo que deja ver que un vídeo ya no se pierde.
const FASE_LBL = { por_grabar: 'Por grabar', sin_editar: 'Sin editar', editado: 'Editado', publicado: 'Publicado' }
const FASE_COLOR = { por_grabar: '#8d8d95', sin_editar: '#d9b66b', editado: '#4ade80', publicado: '#7aa5f8' }
const driveCarpetaUrl = (id) => `https://drive.google.com/drive/folders/${id}`

// El cuerpo del guion lleva el guion, la referencia y la nota de gancho,
// separados por "\n\n---\n" (ver el agente). Se parten para enseñarlos aparte.
function parseGuion(body) {
  const partes = String(body || '').split('\n\n---\n')
  let referencia = '', gancho = ''
  for (const p of partes.slice(1)) {
    const t = p.trim()
    if (/^inspirado en:/i.test(t)) referencia = t.replace(/^inspirado en:\s*/i, '')
    else if (/^gancho/i.test(t)) gancho = t
  }
  return { script: partes[0] || '', referencia, gancho }
}

// Convierte las URLs del texto en enlaces (los vídeos de referencia).
function Linkify({ text }) {
  const s = String(text || ''), out = []; const re = /(https?:\/\/[^\s)]+)/g
  let last = 0, m
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]} <ExternalLink size={11} /></a>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out.length ? out : s
}

function descargarGuion(g) {
  const { script, referencia } = parseGuion(g.body)
  const txt = `${g.title}\nTipo: ${TIPOS_LBL[g.tipo] || g.tipo || '—'} · ${g.date}\n\n${script}${referencia ? `\n\n— Vídeo de referencia: ${referencia}` : ''}\n`
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${g.date} · ${String(g.title || 'guion').replace(/[^\w\sáéíóúñ·-]/gi, '').slice(0, 70)}.txt`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Pop-up con el guion entero, su referencia de vídeo, el botón de descarga y el
// de «marcar grabado»: al pulsarlo el vídeo que esté en la Entrada de Drive se
// detecta, se archiva en la pieza del guion y queda enlazado — nada se pierde.
function GuionModal({ g, fase, entradaUrl, onGrabar, onCerrar }) {
  const { script, referencia, gancho } = parseGuion(g.body)
  const [grabado, setGrabado] = useState(!!g.grabado)
  const [driveUrl, setDriveUrl] = useState(g.drive_carpeta_id ? driveCarpetaUrl(g.drive_carpeta_id) : null)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState('')

  async function toggle() {
    setCargando(true); setAviso('')
    try {
      const r = await onGrabar(g, !grabado)
      setGrabado(r.grabado)
      if (r.driveUrl) setDriveUrl(r.driveUrl)
      if (r.grabado && !r.driveUrl) {
        setAviso(r.detectando > 0
          ? `Buscando tu vídeo en la Entrada de Drive (${r.detectando})… en cuanto lo reconozca lo archivo y lo enlazo aquí.`
          : 'Marcado como grabado. Deja el vídeo en la Entrada de Drive y lo archivo y enlazo solo.')
      }
    } catch (e) { setAviso(e.message || 'No se pudo guardar.') }
    setCargando(false)
  }

  const faseV = grabado && fase ? fase : (grabado ? 'sin_editar' : null)
  return (
    <div className="rm-modal-fondo" onClick={onCerrar}>
      <div className="rm-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Guion">
        <header className="rm-modal-cab">
          <div className="rm-modal-tags">
            <span className={'rm-tag ' + (g.revision === 'aprobado' ? 'ok' : 'bor')}>{g.revision === 'aprobado' ? 'aprobado' : 'borrador'}</span>
            {g.tipo && <span className="rm-tag" style={{ '--c': TIPO_COLOR[g.tipo] }}>{TIPOS_LBL[g.tipo] || g.tipo}</span>}
            {faseV && <span className="rm-tag" style={{ '--c': FASE_COLOR[faseV] }}>{FASE_LBL[faseV]}</span>}
            <span className="rm-modal-fecha">{fechaLarga(g.date)}</span>
          </div>
          <button type="button" className="rm-detalle-x" onClick={onCerrar} aria-label="Cerrar">×</button>
        </header>
        <h3 className="rm-modal-tit">{g.title}</h3>
        <pre className="rm-modal-guion">{script}</pre>
        <div className="rm-modal-ref">
          <b><FileText size={13} /> Vídeo de referencia:</b> {referencia ? <Linkify text={referencia} /> : <span className="rm-modal-ref-vacio">—</span>}
        </div>
        {gancho && <p className="rm-modal-gancho">{gancho}</p>}
        {aviso && <p className="rm-modal-aviso">{aviso}</p>}
        <div className="rm-modal-pie">
          <button type="button" className={'helm-btn' + (grabado ? ' sec' : '')} disabled={cargando} onClick={toggle}>
            {grabado ? <><Check size={15} /> Grabado</> : <><Clapperboard size={15} /> {cargando ? 'Guardando…' : 'Marcar grabado'}</>}
          </button>
          {driveUrl
            ? <a className="helm-btn sec" href={driveUrl} target="_blank" rel="noopener noreferrer"><FolderOpen size={15} /> Ver vídeo en Drive</a>
            : grabado && entradaUrl
              ? <a className="helm-btn sec" href={entradaUrl} target="_blank" rel="noopener noreferrer"><FolderOpen size={15} /> Abrir Entrada de Drive</a>
              : null}
          <button type="button" className="helm-btn sec" onClick={() => descargarGuion(g)}><Download size={15} /> Descargar guion</button>
        </div>
      </div>
    </div>
  )
}

// Diálogo del botón «Iniciar estudio y creación»: elige periodo y tipos y lanza
// el programador, que crea+programa lo que falte en los mejores días.
function ProgramarDialog({ clientId, mes, hoy, onCerrar }) {
  const [periodo, setPeriodo] = useState('quincena')
  const [tipos, setTipos] = useState(['viralidad', 'autoridad', 'conversion'])
  const [cargando, setCargando] = useState(false)
  const [estado, setEstado] = useState(null)
  const rango = () => {
    const man = new Date(hoy); man.setDate(hoy.getDate() + 1)
    const desde = iso(man)
    if (periodo === 'semana') return { desde, hasta: iso(new Date(man.getTime() + 6 * 864e5)) }
    if (periodo === 'mes') {
      const fin = new Date(mes.fecha.getFullYear(), mes.fecha.getMonth() + 1, 0)
      const ini = new Date(Math.max(man.getTime(), new Date(mes.fecha.getFullYear(), mes.fecha.getMonth(), 1).getTime()))
      return { desde: iso(ini), hasta: iso(fin) }
    }
    return { desde, hasta: iso(new Date(man.getTime() + 13 * 864e5)) }
  }
  async function lanzar() {
    if (!clientId || !tipos.length) return
    setCargando(true); setEstado(null)
    try { const { desde, hasta } = rango(); await agentsApi.equipoProgramar({ clientId, desde, hasta, tipos }); setEstado('ok') }
    catch (e) { setEstado(e.message || 'No se pudo lanzar') }
    setCargando(false)
  }
  return (
    <div className="rm-modal-fondo" onClick={onCerrar}>
      <div className="rm-modal rm-modal-prog" onClick={e => e.stopPropagation()} role="dialog" aria-label="Iniciar estudio y creación">
        <header className="rm-modal-cab">
          <h3 className="rm-modal-tit"><Sparkles size={16} /> Iniciar estudio y creación</h3>
          <button type="button" className="rm-detalle-x" onClick={onCerrar} aria-label="Cerrar">×</button>
        </header>
        <p className="rm-prog-sub">El equipo estudia tus referencias y propone los guiones que falten del periodo, programados en tu mejor día. No repite lo que ya tengas montado.</p>
        <div className="rm-prog-campo">
          <label>Periodo</label>
          <div className="rm-prog-ops">
            {[['semana', 'Próxima semana'], ['quincena', '2 próximas semanas'], ['mes', `Mes de ${mesCorto(mes.fecha)}`]].map(([k, l]) => (
              <button key={k} type="button" className={'rm-prog-op' + (periodo === k ? ' on' : '')} onClick={() => setPeriodo(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="rm-prog-campo">
          <label>Tipos de contenido</label>
          <div className="rm-prog-ops">
            {TIPOS_OPC.map(k => (
              <button key={k} type="button" className={'rm-prog-op' + (tipos.includes(k) ? ' on' : '')} style={{ '--c': TIPO_COLOR[k] }}
                onClick={() => setTipos(ts => ts.includes(k) ? ts.filter(x => x !== k) : [...ts, k])}>{TIPOS_LBL[k]}</button>
            ))}
          </div>
        </div>
        {estado === 'ok' ? <p className="rm-prog-ok">✓ En marcha. Los guiones irán cayendo en sus días; apruébalos en Agentes → Por aprobar.</p>
          : estado ? <p className="rm-prog-err">{estado}</p> : null}
        <div className="rm-modal-pie">
          {estado === 'ok'
            ? <button type="button" className="helm-btn" onClick={onCerrar}>Cerrar</button>
            : <button type="button" className="helm-btn" disabled={cargando || !tipos.length} onClick={lanzar}>{cargando ? 'Lanzando…' : 'Iniciar'}</button>}
        </div>
      </div>
    </div>
  )
}

export default function Roadmap({ client, clientId }) {
  const hoy = useMemo(() => new Date(), [])
  const [offset, setOffset] = useState(0)          // meses que se desplaza el inicio del semestre
  const [mesSel, setMesSel] = useState(0)
  const [semanaSel, setSemanaSel] = useState(null) // null → semana actual (o la 1ª)
  const [guionSel, setGuionSel] = useState(null)   // el guion abierto en el pop-up
  const [progAbierto, setProgAbierto] = useState(false) // diálogo «iniciar estudio y creación»

  // Los guiones reales del perfil, para colgarlos de su día. RLS abierta en la
  // tabla, así que se leen directo como en el resto de vistas.
  const [guiones, setGuiones] = useState([])
  useEffect(() => {
    if (!clientId) { setGuiones([]); return }
    let vivo = true
    supabase.from('helm_content_calendar')
      .select('id, date, title, body, format, tipo, revision, grabado, grabado_at, drive_carpeta_id, status')
      .eq('client_id', clientId)
      .order('date', { ascending: true })
      .limit(500)
      .then(({ data, error }) => { if (vivo && !error) setGuiones(data || []) })
    return () => { vivo = false }
  }, [clientId])

  // En qué fase de Drive está cada guion (dónde vive su carpeta) + la Entrada,
  // para que el pop-up pueda enlazar al vídeo. Se pide aparte y sin bloquear: si
  // Drive no está conectado, el roadmap va igual con el estado "grabado".
  const [fases, setFases] = useState({})
  const [entradaUrl, setEntradaUrl] = useState(null)
  const cargaFases = (cid) => contenidoApi.fases(cid)
    .then(r => { if (r?.conectado) { setFases(r.fases || {}); setEntradaUrl(r.carpeta?.entrada || null) } })
    .catch(() => {})
  useEffect(() => { if (!clientId) { setFases({}); return } let v = true; contenidoApi.fases(clientId).then(r => { if (v && r?.conectado) { setFases(r.fases || {}); setEntradaUrl(r.carpeta?.entrada || null) } }).catch(() => {}); return () => { v = false } }, [clientId])

  const patchGuion = (id, campos) => setGuiones(gs => gs.map(g => (g.id === id ? { ...g, ...campos } : g)))
  async function marcarGrabado(g, grabado) {
    const r = await contenidoApi.grabar(clientId, g.id, grabado)
    patchGuion(g.id, { grabado: r.grabado, grabado_at: r.grabado ? (g.grabado_at || new Date().toISOString()) : null })
    cargaFases(clientId) // la pieza puede haber cambiado de carpeta
    return r
  }
  const guionesPorDia = useMemo(() => {
    const m = {}
    for (const g of guiones) (m[g.date] ||= []).push(g)
    return m
  }, [guiones])

  const base = useMemo(() => new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1), [hoy, offset])
  const meses = useMemo(() => PLANTILLA.meses.map((p, i) => {
    const fecha = new Date(base.getFullYear(), base.getMonth() + i, 1)
    return { ...p, i, fecha, enf: ENFOQUES[p.enfoque], temporada: TEMPORADA[fecha.getMonth()] }
  }), [base])

  const mes = meses[mesSel]
  const semanas = useMemo(() => semanasDelMes(mes.fecha.getFullYear(), mes.fecha.getMonth()), [mes])
  // "Semana actual" solo cuenta si el mes mostrado ES el mes de hoy: si no, una
  // semana que invade el mes vecino marcaría por error "esta semana"/"en curso".
  const semActualIdx = useMemo(() => (mismoMes(mes.fecha, hoy) ? semanas.findIndex(s => s.dias.some(d => mismoDia(d, hoy))) : -1), [semanas, hoy, mes])
  const semIdx = semanaSel != null ? Math.min(semanaSel, semanas.length - 1) : (semActualIdx >= 0 ? semActualIdx : 0)
  const semana = semanas[semIdx]
  const guionesSemana = useMemo(() => semana.dias.flatMap(d => guionesPorDia[iso(d)] || []), [semana, guionesPorDia])

  const elegirMes = (i) => { setMesSel(i); setSemanaSel(null) }
  // Desplazar el semestre también resetea la semana (como al elegir mes).
  const desplazar = (n) => { setOffset(o => o + n); setSemanaSel(null) }
  const elegirSemana = (k) => setSemanaSel(k)

  return (
    <div className="helm-roadmap">
      <header className="rm-cab">
        <div>
          <p className="rm-cab-sub">
            El plan de contenido de {client?.name ? <b>{client.name}</b> : 'este perfil'} a seis meses, para llegar a <b>{PLANTILLA.objetivo}</b>. Pincha un guion para verlo entero y descargarlo.
          </p>
        </div>
        <div className="rm-cab-acc">
          <button type="button" className="helm-btn rm-prog-btn" onClick={() => setProgAbierto(true)} disabled={!clientId}>
            <Sparkles size={15} /> Iniciar estudio y creación
          </button>
          <div className="rm-inicio">
            <button className="rm-flecha" onClick={() => desplazar(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
            <span><CalendarRange size={15} /> {mesLargo(base)}</span>
            <button className="rm-flecha" onClick={() => desplazar(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
        </div>
      </header>

      {/* Línea temporal: los seis meses */}
      <div className="rm-linea">
        {meses.map((m) => {
          const actual = mismoMes(m.fecha, hoy)
          return (
            <button key={m.i} className={'rm-mes' + (m.i === mesSel ? ' sel' : '') + (actual ? ' hoy' : '')}
              onClick={() => elegirMes(m.i)} aria-pressed={m.i === mesSel} aria-current={actual ? 'date' : undefined} style={{ '--enf': m.enf.color }}>
              <span className="rm-mes-bola"><b>{m.i + 1}</b></span>
              <span className="rm-mes-nom">{mesCorto(m.fecha)}</span>
              <span className="rm-mes-enf">{m.enf.label}</span>
              {actual && <span className="rm-mes-hoy">Mes actual</span>}
            </button>
          )
        })}
      </div>

      {/* Panel del mes */}
      <section className="rm-panel" style={{ '--enf': mes.enf.color }}>
        <div className="rm-panel-cab">
          <span className="rm-enf"><Target size={14} /> {mes.enf.label}</span>
          <h2>Mes {mes.i + 1} · {mes.titulo}</h2>
          <p className="rm-obj">{mes.objetivo}</p>
        </div>

        <div className="rm-ads">
          <div className="rm-ads-tit"><Megaphone size={15} /> Ads de {mesCorto(mes.fecha)}</div>
          <div className="rm-ads-cifra">{mes.ads.presupuesto.toLocaleString('es-ES')} €<small>presupuesto</small></div>
          {mes.temporada && mes.temporada !== '—' && <div className="rm-ads-temp"><Zap size={13} /> {mes.temporada}</div>}
          <div className="rm-ads-camps">{mes.ads.campanas.map((c, k) => <span className="rm-camp" key={k}>{c}</span>)}</div>
        </div>
      </section>

      {/* Sub-línea: las semanas del mes */}
      <div className="rm-semanas">
        {semanas.map((s, k) => {
          const actual = k === semActualIdx
          return (
            <button key={k} className={'rm-sem' + (k === semIdx ? ' sel' : '') + (actual ? ' hoy' : '')} onClick={() => elegirSemana(k)} aria-pressed={k === semIdx} aria-current={actual ? 'date' : undefined}>
              <span className="rm-sem-bola" />
              <span className="rm-sem-lbl">Sem {k + 1}</span>
              {actual && <span className="rm-sem-hoy">Esta semana</span>}
            </button>
          )
        })}
      </div>

      {/* Panel de la semana: los días */}
      <section className="rm-semana">
        <h3 className="rm-semana-cab">
          <span>Semana {semIdx + 1} · del {dd(semana.inicio)} al {dd(semana.fin)}
          {semIdx === semActualIdx && <span className="rm-ahora">en curso</span>}</span>
          <button type="button" className="helm-btn sec rm-pdf-btn" disabled={!guionesSemana.length}
            onClick={() => descargarPDFGuiones(guionesSemana, { perfil: client?.name, desde: iso(semana.inicio), hasta: iso(semana.fin) })}>
            <Download size={14} /> PDF de la semana{guionesSemana.length ? ` (${guionesSemana.length})` : ''}
          </button>
        </h3>

        <div className="rm-dias">
          {semana.dias.map((d, k) => {
            const plan = PLANTILLA.semana[lunes0(d)]
            const fuera = !mismoMes(d, mes.fecha)
            const esHoy = mismoDia(d, hoy) && !fuera
            const f = iso(d)
            const gs = guionesPorDia[f] || []
            return (
              <article key={k} className={'rm-dia' + (fuera ? ' fuera' : '') + (esHoy ? ' hoy' : '') + (gs.length ? ' tiene' : '')}>
                <div className="rm-dia-cab">
                  <span className="rm-dia-nom">{DIAS[k]} {d.getDate()}</span>
                  {plan.cta && <span className="rm-cta">CTA</span>}
                </div>
                {gs.length > 0 && (
                  <div className="rm-dia-guiones-lista">
                    {gs.map(g => (
                      <button key={g.id} type="button" title={g.grabado ? `${g.title} · grabado` : g.title}
                        className={'rm-guion-chip' + (g.revision === 'aprobado' ? ' ok' : '') + (g.grabado ? ' grabado' : '')}
                        style={{ '--c': TIPO_COLOR[g.tipo] || '#8d8d95' }} onClick={() => setGuionSel(g)}>
                        {g.grabado && <Check size={11} strokeWidth={3} className="rm-chip-ok" />}
                        {g.title}
                      </button>
                    ))}
                  </div>
                )}
                <div className="rm-dia-reels">
                  {plan.reels.map((r, j) => (
                    <span className="rm-reel plan" key={j} style={{ '--c': FORMATO[r].color }}>{FORMATO[r].nombre}</span>
                  ))}
                </div>
                <div className="rm-dia-pie">
                  <span className="rm-hist">Historias</span>
                  <span className="rm-reels-n">{plan.reels.length} reels</span>
                </div>
              </article>
            )
          })}
        </div>

        {/* Leyenda + resumen de la cadencia */}
        <div className="rm-leyenda">
          <div className="rm-ley-formatos">
            {PLANTILLA.formatos.map(f => (
              <span className="rm-ley" key={f.id} style={{ '--c': FORMATO[f.id].color }}>
                <i /> {f.nombre} <small>· {f.objetivo}{f.cta ? ' · CTA' : ''}</small>
              </span>
            ))}
          </div>
          <p className="rm-resumen">
            <b>{PLANTILLA.reels_semana} reels/semana</b> ({PLANTILLA.reparto.viral} virales · {PLANTILLA.reparto.autoridad} autoridad · {PLANTILLA.reparto.valor} valor · {PLANTILLA.reparto.testimonio} testimonios) · historias a diario · CTA {PLANTILLA.cta_dias.join('/')}
          </p>
        </div>
      </section>

      {guionSel && <GuionModal g={guionSel} fase={fases[guionSel.id]} entradaUrl={entradaUrl} onGrabar={marcarGrabado} onCerrar={() => setGuionSel(null)} />}
      {progAbierto && <ProgramarDialog clientId={clientId} mes={mes} hoy={hoy} onCerrar={() => setProgAbierto(false)} />}
    </div>
  )
}
