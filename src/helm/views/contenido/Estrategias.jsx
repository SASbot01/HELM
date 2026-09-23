// HELM — Guiones / Estrategias: la Ronda de Stories y la Ronda de Reels
// convertidas en un panel navegable, sección a sección. Es la guía operativa
// de cómo se hacen las historias y los reels en esta cuenta — no un documento,
// una herramienta.
//
// Jerarquía: la definición va fuera, el ejemplo dentro. Todo lo que dice qué
// hace un elemento se ve sin clic (la misión del frame, el porqué de la regla,
// los pasos de la plantilla, el modo de fallo del gancho). El pop-up se queda
// solo con el ejemplo largo del frame, la lectura de cada referente y el
// desarrollo de los diez guiones.
import { useState } from 'react'
import {
  Layers, GitBranch, ShieldCheck, LayoutTemplate, Zap, Send, Gauge, CalendarRange,
  FileText, TrendingDown, AlertTriangle, Instagram, Film,
} from 'lucide-react'
import { Modal } from '../../ui'
import { ESTRATEGIAS, CARRIL_LABEL } from './estrategiasData'

const CARRIL_DOT = { dar: 'green', conectar: 'amber', vender: 'violet' }
const OBJETIVO_CLASS = { Alcance: 'alcance', Autoridad: 'autoridad', Venta: 'venta' }

function CarrilBadge({ carril }) {
  return <span className={'helm-est-dot ' + CARRIL_DOT[carril]} />
}

// Las etiquetas de objetivo de los guiones («Alcance → Autoridad») se pintan
// con el mismo color que la línea correspondiente de Fundamentos, para que se
// vea de un vistazo qué mide cada pieza.
function ObjetivoTags({ valor }) {
  const partes = valor.split(/\s*([+→])\s*/)
  return (
    <span className="helm-est-objetivo-tags">
      {partes.map((p, i) => (
        OBJETIVO_CLASS[p]
          ? <span key={i} className={'helm-est-objetivo-tag ' + OBJETIVO_CLASS[p]}>{p}</span>
          : <span key={i} className="helm-est-objetivo-sep">{p}</span>
      ))}
    </span>
  )
}

// Toda pieza clicable pasa por aquí: un título, un subtítulo (carril /
// contexto) y un cuerpo libre. Una sola pieza de estado en EstrategiaView
// controla qué pop-up está abierto.
function Clicable({ onClick, className, children }) {
  return (
    <button type="button" className={'helm-est-click ' + (className || '')} onClick={onClick}>
      {children}
    </button>
  )
}

const SECTION_ICONS = {
  fundamentos: Layers, ronda: GitBranch, reglas: ShieldCheck, plantillas: LayoutTemplate,
  ganchos: Zap, cierre: Send, metricas: Gauge, ritmo: CalendarRange,
  guiones: FileText, retencion: TrendingDown, mitos: AlertTriangle, datos: Gauge,
}

export default function Estrategias() {
  const [modo, setModo] = useState('historias')
  const data = ESTRATEGIAS[modo]
  return (
    <div className="helm-est">
      <div className="helm-est-modos">
        <button className={'helm-tab' + (modo === 'historias' ? ' active' : '')} onClick={() => setModo('historias')}>
          <Instagram size={15} /> Historias
        </button>
        <button className={'helm-tab' + (modo === 'reels' ? ' active' : '')} onClick={() => setModo('reels')}>
          <Film size={15} /> Reels
        </button>
      </div>
      <EstrategiaView key={modo} data={data} />
    </div>
  )
}

function EstrategiaView({ data }) {
  const sections = [
    { key: 'fundamentos', label: 'Fundamentos' },
    { key: 'ronda', label: 'La Ronda' },
    { key: 'reglas', label: 'Reglas' },
    { key: 'plantillas', label: 'Plantillas' },
    { key: 'ganchos', label: 'Ganchos' },
    { key: 'cierre', label: data.cta ? 'CTA' : 'Cierre' },
    { key: 'metricas', label: 'Métricas' },
    { key: 'ritmo', label: 'Ritmo semanal' },
    data.guiones && { key: 'guiones', label: '10 guiones' },
    data.senalizar && { key: 'retencion', label: 'Retención' },
    data.mitos && { key: 'mitos', label: 'Mitos' },
    { key: 'datos', label: 'Los datos' },
  ].filter(Boolean)

  const [seccion, setSeccion] = useState('fundamentos')
  const [detalle, setDetalle] = useState(null)
  const abrir = (title, sub, body) => setDetalle({ title, sub, body })

  return (
    <div className="helm-est-body">
      <div className="helm-chips helm-est-nav">
        {sections.map(s => {
          const Icon = SECTION_ICONS[s.key] || Layers
          return (
            <button key={s.key} className={'helm-chip' + (seccion === s.key ? ' active' : '')} onClick={() => setSeccion(s.key)}>
              <Icon size={12} /> {s.label}
            </button>
          )
        })}
      </div>

      {seccion === 'fundamentos' && <Fundamentos data={data} abrir={abrir} />}
      {seccion === 'ronda' && <Ronda data={data} abrir={abrir} />}
      {seccion === 'reglas' && <Reglas data={data} />}
      {seccion === 'plantillas' && <Plantillas data={data} />}
      {seccion === 'ganchos' && <Ganchos data={data} />}
      {seccion === 'cierre' && <Cierre data={data} />}
      {seccion === 'metricas' && <Metricas data={data} />}
      {seccion === 'ritmo' && <Ritmo data={data} />}
      {seccion === 'guiones' && data.guiones && <Guiones data={data} abrir={abrir} />}
      {seccion === 'retencion' && data.senalizar && <Retencion data={data} />}
      {seccion === 'mitos' && data.mitos && <Mitos data={data} />}
      {seccion === 'datos' && <Datos data={data} />}

      {detalle && (
        <Modal title={detalle.title} onClose={() => setDetalle(null)} wide>
          {detalle.sub && <div className="helm-est-modal-sub">{detalle.sub}</div>}
          <div className="helm-est-modal-body">{detalle.body}</div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Fundamentos({ data, abrir }) {
  return (
    <div className="helm-est-section">
      <div className="helm-est-hero">
        <div className="helm-est-kicker">{data.kicker}</div>
        <h2>{data.titulo}</h2>
        <p>{data.subtitulo}</p>
        <div className="helm-est-tags">{data.chips.map(c => <span key={c} className="helm-chip">{c}</span>)}</div>
      </div>

      <p className="helm-est-lead">{data.unidad}</p>

      {data.statsTop && (
        <div className="helm-est-stats-row">
          {data.statsTop.map(s => (
            <div key={s.label} className="helm-card helm-kpi">
              <div className="lbl">{s.label}</div>
              <div className="val accent">{s.valor}</div>
              <div className="sub">{s.detalle}</div>
            </div>
          ))}
        </div>
      )}

      <h3 className="helm-est-h3">Los tres carriles</h3>
      <div className="helm-est-carril-bar">
        {data.carriles.map(c => (
          <div key={c.key} className={'helm-est-carril-seg ' + CARRIL_DOT[c.key]} style={{ flexGrow: parseFloat(c.pct) || 1 }}>
            <b>{c.titulo}</b><span>{c.pct}</span>
          </div>
        ))}
      </div>
      <div className="helm-est-carriles">
        {data.carriles.map(c => (
          <div key={c.key} className="helm-card helm-est-carril">
            <div className="helm-est-carril-head"><CarrilBadge carril={c.key} /><b>{c.titulo}</b><span>{c.pct}</span></div>
            <p>{c.desc}</p>
            {c.noEs && <p className="helm-est-noes">{c.noEs}</p>}
            {c.test && <p className="helm-est-test"><span>Test</span>{c.test}</p>}
          </div>
        ))}
      </div>
      {data.carrilesNota && <p className="helm-est-note">{data.carrilesNota}</p>}

      {data.objetivos && (
        <>
          <h3 className="helm-est-h3">Para qué sirve cada pieza</h3>
          <div className="helm-est-objetivos">
            {data.objetivos.map(o => (
              <p key={o.key} className={'helm-est-objetivo ' + OBJETIVO_CLASS[o.key]}>
                <b>{o.key}</b> — {o.desc}
              </p>
            ))}
          </div>
        </>
      )}

      {data.referentes && (
        <>
          <h3 className="helm-est-h3">Lectura de referentes</h3>
          <p className="helm-est-note">Qué hacen los tres, y qué es replicable — no es una auditoría de lo que publicaron ayer, es una lectura de su método público.</p>
          <div className="helm-est-referentes">
            {data.referentes.map(r => (
              <Clicable key={r.nombre} className="helm-card" onClick={() => abrir(r.nombre, r.handle, (
                <>
                  <p className="helm-est-cita">«{r.cita}»</p>
                  <p><b>El activo</b> — {r.activo}</p>
                  <p><b>Qué no copiar</b> — {r.noCopiar}</p>
                </>
              ))}>
                <b>{r.nombre}</b>
                <small>{r.handle}</small>
                <p className="helm-est-cita">«{r.cita}»</p>
                <p className="helm-est-roba"><span>Roba:</span> {r.robar}</p>
              </Clicable>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Ronda({ data, abrir }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">La Ronda — {data.frames.length} {data.key === 'reels' ? 'tiempos' : 'frames'} que forman una unidad</h3>
      <p className="helm-est-note">{data.unidad}</p>
      <div className="helm-est-frames">
        {data.frames.map(f => (
          <Clicable key={f.n} className={'helm-est-frame ' + CARRIL_DOT[f.carril]}
            onClick={() => abrir(`${f.n} · ${f.titulo}`, CARRIL_LABEL[f.carril] + (f.tiempo ? ' · ' + f.tiempo : ''), (
              <>
                <p>{f.mision}</p>
                {f.ejemplo && <p className="helm-est-ejemplo">«{f.ejemplo}»</p>}
              </>
            ))}>
            <div className="helm-est-frame-n">{f.n}</div>
            <div className="helm-est-frame-t">{f.titulo}</div>
            {f.tiempo && <div className="helm-est-frame-tiempo">{f.tiempo}</div>}
            {f.micro && <div className="helm-est-frame-micro">{f.micro}</div>}
            <div className="helm-est-frame-pie">
              <span className="helm-est-frame-carril">{CARRIL_LABEL[f.carril]}</span>
              {f.salida && <span className="helm-est-frame-salida">{f.salida}</span>}
            </div>
          </Clicable>
        ))}
      </div>
      {data.frameNota && <p className="helm-est-note callout">{data.frameNota}</p>}
    </div>
  )
}

function Reglas({ data }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Lo que no se negocia</h3>
      <p className="helm-est-note">Cada regla lleva su dato al lado. Una regla sin porqué es una opinión.</p>
      <div className="helm-est-reglas">
        {data.reglas.map((r, i) => (
          <div key={i} className="helm-est-regla">
            <span className="helm-est-regla-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="helm-est-regla-txt">
              <span className="helm-est-regla-t">{r.regla}</span>
              <span className="helm-est-regla-porque">{r.porque}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Plantillas({ data }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Cuatro secuencias listas para rellenar</h3>
      <p className="helm-est-note">La Ronda es la base; estas cuatro son sus variantes según lo que toque ese día.</p>
      <div className="helm-est-plantillas">
        {data.plantillas.map(p => (
          <div key={p.key} className="helm-card helm-est-plantilla">
            <div className="helm-est-plantilla-head">
              <span className="helm-est-plantilla-key">{p.key}</span>
              <b>{p.titulo}</b>
              <span className="helm-chip">{p.badge}</span>
            </div>
            <small>{p.cadencia}</small>
            {p.cuando && <p className="helm-est-cuando"><span>Cuándo:</span> {p.cuando}</p>}
            <ol className="helm-est-pasos compacta">{p.pasos.map((s, i) => <li key={i}>{s}</li>)}</ol>
            {p.rompe && <p className="helm-est-rompe"><span>La rompe:</span> {p.rompe}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Ganchos({ data }) {
  const bajada = data.key === 'reels'
    ? 'Casi ningún gancho falla por ser de la familia equivocada. Falla por ejecutarse por su lado débil. Lee primero el modo de fallo, después los ejemplos.'
    : 'Un titular describe de qué va la historia. Un gancho abre un hueco que solo se cierra viendo el frame siguiente. Si después de leerlo no hay una pregunta concreta en la cabeza de quien mira, no es un gancho.'
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Banco de ganchos</h3>
      <p className="helm-est-note">{bajada}</p>
      <div className="helm-est-ganchos">
        {data.ganchos.map(g => (
          <div key={g.categoria} className="helm-card helm-est-gancho">
            <b>{g.categoria}</b>
            {g.falla && <p className="helm-est-falla">{g.falla}</p>}
            <ul className="helm-est-ejemplos compacta">{g.ejemplos.map((e, i) => <li key={i}>«{e}»</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function Cierre({ data }) {
  const lista = data.cta || data.cierre
  const esCta = !!data.cta
  const nota = data.ctaNota || data.cierreNota
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">{esCta ? 'Jerarquía de CTA — cómo pedir, por orden de conversión' : 'Mecánicas de cierre — cómo pedir, por orden de conversión'}</h3>
      <div className="helm-est-ranked">
        {lista.map(c => (
          <div key={c.n} className="helm-est-rank-row">
            <span className="helm-est-rank-n">{c.n}</span>
            <span className="helm-est-rank-txt">
              <span className="helm-est-rank-head">
                <span className="helm-est-rank-nombre">{c.nombre}</span>
                {c.badge && <span className={'helm-est-rank-badge' + (c.badgeTono === 'alerta' ? ' alerta' : '')}>{c.badge}</span>}
                {c.ejemplo && <span className="helm-est-rank-ej">{c.ejemplo}</span>}
              </span>
              <span className="helm-est-rank-detalle">{c.detalle}</span>
            </span>
          </div>
        ))}
      </div>
      {nota && <p className="helm-est-note callout">{nota}</p>}
    </div>
  )
}

function Metricas({ data }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Cuatro números, medidos por {data.key === 'reels' ? 'ciclo' : 'ronda'}</h3>
      <div className="helm-est-stats-row">
        {data.metricas.map(m => (
          <div key={m.label} className="helm-card helm-kpi">
            <div className="lbl">{m.label}</div>
            <div className="val accent">{m.valor}</div>
            <div className="sub">{m.detalle}</div>
          </div>
        ))}
      </div>
      {data.metricasCadena && (
        <>
          <h3 className="helm-est-h3">Se leen en este orden, no sueltos</h3>
          <ol className="helm-est-cadena">
            {data.metricasCadena.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        </>
      )}
      {data.metricasNota && <p className="helm-est-note">{data.metricasNota}</p>}
    </div>
  )
}

function Ritmo({ data }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Semana tipo</h3>
      <div className="helm-est-table-wrap">
        <table className="helm-est-table">
          <thead><tr><th>Día</th><th>Plantilla</th><th>Carril</th><th>Qué sale de aquí</th></tr></thead>
          <tbody>
            {data.ritmo.map(r => (
              <tr key={r.dia}>
                <td><b>{r.dia}</b></td>
                <td>{r.plantilla}</td>
                <td><CarrilBadge carril={r.carril} /> {CARRIL_LABEL[r.carril]}</td>
                <td>{r.sale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.ritmoNota && <p className="helm-est-note">{data.ritmoNota}</p>}
    </div>
  )
}

function Guiones({ data, abrir }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Diez guiones para rellenar</h3>
      <p className="helm-est-note">Escritos sobre el tramo medido de mejor rendimiento (30–60 s). Texto en pantalla desde el primer fotograma; el 35 % inferior del encuadre queda libre.</p>
      <div className="helm-est-guiones">
        {data.guiones.map(g => (
          <Clicable key={g.n} className="helm-card" onClick={() => abrir(`${g.n} · ${g.titulo}`, `${g.duracion} · ${g.objetivo}`, (
            <>
              <table className="helm-est-timeline">
                <tbody>
                  {g.pasos.map(([t, texto], i) => <tr key={i}><td>{t}</td><td>{texto}</td></tr>)}
                </tbody>
              </table>
              <p className="helm-est-note">{g.nota}</p>
            </>
          ))}>
            <div className="helm-est-guion-head">
              <span className="helm-est-plantilla-key">{g.n}</span>
              <b>{g.titulo}</b>
            </div>
            <div className="helm-est-guion-pie">
              <small>{g.duracion}</small>
              <ObjetivoTags valor={g.objetivo} />
            </div>
          </Clicable>
        ))}
      </div>
      {data.guionesNota && <p className="helm-est-note callout">{data.guionesNota}</p>}
    </div>
  )
}

function Retencion({ data }) {
  const s = data.senalizar
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">{s.titulo}</h3>
      <p className="helm-est-note">{s.intro}</p>
      <div className="helm-est-table-wrap">
        <table className="helm-est-table">
          <thead><tr><th></th><th>Recapitular — mata</th><th>Señalizar — sostiene</th></tr></thead>
          <tbody>
            {s.filas.map(f => <tr key={f.aspecto}><td><b>{f.aspecto}</b></td><td>{f.mata}</td><td>{f.sostiene}</td></tr>)}
          </tbody>
        </table>
      </div>
      {s.accion && <p className="helm-est-note callout">{s.accion}</p>}
      <p className="helm-est-note callout">{s.dato}</p>
      <p className="helm-est-note">{s.pivotes}</p>
      <p className="helm-est-note">{s.mito}</p>
    </div>
  )
}

function Mitos({ data }) {
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Lo que ya no funciona</h3>
      <p className="helm-est-note">Consejos que siguen circulando y que los datos desmienten.</p>
      <div className="helm-est-mitos">
        {data.mitos.map((m, i) => (
          <div key={i} className="helm-card helm-est-mito">
            <div className="helm-est-mito-falso">«{m.falso}»</div>
            <p>{m.real}</p>
          </div>
        ))}
      </div>
      {data.mitosNota && <p className="helm-est-note callout">{data.mitosNota}</p>}
    </div>
  )
}

function Datos({ data }) {
  const d = data.datos
  if (data.key === 'historias') {
    return (
      <div className="helm-est-section">
        <p className="helm-est-note">{d.intro}</p>

        <h3 className="helm-est-h3">{d.salidas.titulo}</h3>
        <div className="helm-est-table-wrap">
          <table className="helm-est-table">
            <thead><tr><th>Frame</th><th>Salidas</th><th>Qué implica</th></tr></thead>
            <tbody>
              {d.salidas.filas.map(f => (
                <tr key={f.frame}>
                  <td><b>{f.frame}</b></td><td>{f.salidas}</td><td>{f.implica}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="helm-est-note">{d.salidas.fuente}</p>
        <p className="helm-est-note callout">{d.salidas.lectura}</p>

        <h3 className="helm-est-h3">Tap-forward</h3>
        <p className="helm-est-note">{d.tapForward}</p>

        <h3 className="helm-est-h3">{d.ventanaDM.titulo}</h3>
        <ul className="helm-est-ejemplos">{d.ventanaDM.puntos.map((p, i) => <li key={i}>{p}</li>)}</ul>
        <p className="helm-est-note callout">{d.ventanaDM.nota}</p>

        <h3 className="helm-est-h3">{d.dmConversion.titulo}</h3>
        <div className="helm-est-table-wrap">
          <table className="helm-est-table">
            <thead><tr><th>Mensajes intercambiados</th><th>Tasa de llamada agendada</th></tr></thead>
            <tbody>
              {d.dmConversion.filas.map(f => <tr key={f.mensajes}><td>{f.mensajes}</td><td><b>{f.tasa}</b></td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="helm-est-note">{d.dmConversion.fuente}</p>
        <p className="helm-est-note">{d.dmConversion.lectura}</p>

        <h3 className="helm-est-h3">Línea roja de cumplimiento</h3>
        <p className="helm-est-note callout">{d.lineaRoja}</p>
      </div>
    )
  }
  return (
    <div className="helm-est-section">
      <p className="helm-est-note">{d.intro}</p>
      <h3 className="helm-est-h3">{d.duracion.titulo}</h3>
      <ul className="helm-est-ejemplos">{d.duracion.puntos.map((p, i) => <li key={i}>{p}</li>)}</ul>
      <h3 className="helm-est-h3">Un cambio de política que te afecta directamente</h3>
      <p className="helm-est-note callout">{d.politica}</p>
    </div>
  )
}
