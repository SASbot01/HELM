// HELM — Roadmap semestral: el plan del negocio a seis meses, mes → semana → día.
//
// La metodología (meses → semanas → cadencia por día) va embebida como plantilla
// compartida, igual para todos los perfiles. Sobre ella se pintan los datos
// REALES del perfil: al abrir un día se ven los guiones que el equipo ya tiene
// programados para esa fecha (de helm_content_calendar), su plan de reels y el
// contexto de ads del mes. Los meses, las semanas y ahora también los días son
// desplegables.
import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, Megaphone, Target, Zap, FileText, Check } from 'lucide-react'
import { supabase } from '../../utils/supabase'
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

// Panel con lo que hay para un día: los guiones ya programados (reales) y el
// plan de la metodología para ese día de la semana, con el contexto de ads.
function DetalleDia({ fecha, guiones, mes, onCerrar }) {
  const plan = PLANTILLA.semana[lunes0Iso(fecha)]
  return (
    <section className="rm-detalle">
      <header className="rm-detalle-cab">
        <h4>{fechaLarga(fecha)}</h4>
        <button type="button" className="rm-detalle-x" onClick={onCerrar} aria-label="Cerrar">×</button>
      </header>
      <div className="rm-detalle-cols">
        <div className="rm-detalle-bloque">
          <h5><FileText size={14} /> Guiones programados</h5>
          {guiones.length ? (
            <ul className="rm-guiones">
              {guiones.map(g => (
                <li key={g.id} className="rm-guion">
                  <span className="rm-guion-tit">{g.title || '(sin título)'}</span>
                  <span className="rm-guion-meta">
                    {g.tipo && <span className="rm-tag">{g.tipo}</span>}
                    {g.format && g.format !== 'reel' && <span className="rm-tag tenue">{g.format}</span>}
                    <span className={'rm-tag ' + (g.revision === 'aprobado' ? 'ok' : 'bor')}>{g.revision === 'aprobado' ? 'aprobado' : 'borrador'}</span>
                    {g.grabado && <span className="rm-tag ok"><Check size={11} /> grabado</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rm-detalle-vacio">Ningún guion programado todavía. Los que proponga el equipo caerán aquí, en su mejor día; cuando los apruebes se quedan fijados.</p>
          )}
        </div>
        <div className="rm-detalle-bloque">
          <h5><Target size={14} /> Plan del día</h5>
          <div className="rm-dia-reels">
            {plan.reels.map((r, j) => <span className="rm-reel" key={j} style={{ '--c': FORMATO[r].color }}>{FORMATO[r].nombre}</span>)}
          </div>
          <p className="rm-detalle-nota">Historias a diario{plan.cta ? ' · hoy toca CTA' : ''} · {plan.reels.length} reels.</p>
          <div className="rm-detalle-ads">
            <Megaphone size={13} /> Ads de {mesCorto(mes.fecha)}: {mes.ads.presupuesto.toLocaleString('es-ES')} € · {mes.ads.campanas.join(', ')}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Roadmap({ client, clientId }) {
  const hoy = useMemo(() => new Date(), [])
  const [offset, setOffset] = useState(0)          // meses que se desplaza el inicio del semestre
  const [mesSel, setMesSel] = useState(0)
  const [semanaSel, setSemanaSel] = useState(null) // null → semana actual (o la 1ª)
  const [diaSel, setDiaSel] = useState(null)       // 'AAAA-MM-DD' del día abierto, o null

  // Los guiones reales del perfil, para colgarlos de su día. RLS abierta en la
  // tabla, así que se leen directo como en el resto de vistas.
  const [guiones, setGuiones] = useState([])
  useEffect(() => {
    if (!clientId) { setGuiones([]); return }
    let vivo = true
    supabase.from('helm_content_calendar')
      .select('id, date, title, format, tipo, revision, grabado, status')
      .eq('client_id', clientId)
      .order('date', { ascending: true })
      .limit(500)
      .then(({ data, error }) => { if (vivo && !error) setGuiones(data || []) })
    return () => { vivo = false }
  }, [clientId])
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

  const elegirMes = (i) => { setMesSel(i); setSemanaSel(null); setDiaSel(null) }
  // Desplazar el semestre también resetea la semana (como al elegir mes).
  const desplazar = (n) => { setOffset(o => o + n); setSemanaSel(null); setDiaSel(null) }
  const elegirSemana = (k) => { setSemanaSel(k); setDiaSel(null) }
  const abrirDia = (f) => setDiaSel(s => (s === f ? null : f))

  return (
    <div className="helm-roadmap">
      <header className="rm-cab">
        <div>
          <p className="rm-cab-sub">
            El sistema compartido a seis meses para llegar a <b>{PLANTILLA.objetivo}</b>, igual para todos los perfiles. Abre un día para ver los guiones de {client?.name ? <b>{client.name}</b> : 'este perfil'} y su plan.
          </p>
        </div>
        <div className="rm-inicio">
          <button className="rm-flecha" onClick={() => desplazar(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <span><CalendarRange size={15} /> {mesLargo(base)}</span>
          <button className="rm-flecha" onClick={() => desplazar(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
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
          Semana {semIdx + 1} · del {dd(semana.inicio)} al {dd(semana.fin)}
          {semIdx === semActualIdx && <span className="rm-ahora">en curso</span>}
        </h3>

        <div className="rm-dias">
          {semana.dias.map((d, k) => {
            const plan = PLANTILLA.semana[lunes0(d)]
            const fuera = !mismoMes(d, mes.fecha)
            const esHoy = mismoDia(d, hoy) && !fuera
            const f = iso(d)
            const gs = guionesPorDia[f] || []
            const sel = diaSel === f
            return (
              <article key={k}
                className={'rm-dia' + (fuera ? ' fuera' : '') + (esHoy ? ' hoy' : '') + (sel ? ' sel' : '') + (gs.length ? ' tiene' : '')}
                role="button" tabIndex={0} aria-pressed={sel}
                onClick={() => abrirDia(f)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDia(f) } }}>
                <div className="rm-dia-cab">
                  <span className="rm-dia-nom">{DIAS[k]} {d.getDate()}</span>
                  {plan.cta && <span className="rm-cta">CTA</span>}
                </div>
                <div className="rm-dia-reels">
                  {plan.reels.map((r, j) => (
                    <span className="rm-reel" key={j} style={{ '--c': FORMATO[r].color }}>{FORMATO[r].nombre}</span>
                  ))}
                </div>
                <div className="rm-dia-pie">
                  {gs.length
                    ? <span className="rm-dia-guiones"><FileText size={12} /> {gs.length} {gs.length === 1 ? 'guion' : 'guiones'}</span>
                    : <span className="rm-hist">Historias</span>}
                  <span className="rm-reels-n">{plan.reels.length} reels</span>
                </div>
              </article>
            )
          })}
        </div>

        {diaSel && (
          <DetalleDia fecha={diaSel} guiones={guionesPorDia[diaSel] || []} mes={mes} onCerrar={() => setDiaSel(null)} />
        )}

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
    </div>
  )
}
