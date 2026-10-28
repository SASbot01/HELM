// HELM — Informe de contenido: qué pasó con lo publicado en Instagram.
//
// Tres preguntas, en este orden: cómo va la cuenta (las cifras), qué tienen las
// piezas que funcionan (el estudio) y qué grabar la semana que viene. El
// estudio lo calcula el servidor (informeIg, en api/_lib/instagram.js) con las
// métricas ya guardadas, así que abrir la sección no gasta cuota de Meta;
// «Sincronizar» sí va a Instagram a por lo último.
//
// La sección sale en todos los perfiles, tengan Instagram o no. Sin él no hay
// cifras, pero sí se enseña lo que trae y cómo pedir que se conecte.
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw, Hourglass, MessageCircle, BarChart3, Sparkles, Clapperboard } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { instagramApi } from '../lib'
import { Kpi, Tabs, Empty, FormNote } from '../ui'
import { sesionHelm } from '../permisos'
import { INSTAGRAM_CONTACTO, enlaceInstagram } from '../contacto'
import EstudioContenido from './EstudioContenido.jsx'
import './metricas.css'

// Una sola serie por gráfica: el oro del acento, el mismo de las del Informe.
const COLOR = '#d9b66b'
const EJE = { fill: '#8d8d95', fontSize: 11 }
const REJILLA = 'rgba(255,255,255,0.06)'

const PERIODOS = [
  { key: '15', label: '15 días' },
  { key: '30', label: '30 días' },
  { key: '', label: 'Todo' },
]

// `always`: en español 7308 sale sin punto por defecto.
const num = (v) => (v == null ? '—' : Math.round(v).toLocaleString('es-ES', { useGrouping: 'always' }))
const dec = (v) => (v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const seg = (v) => (v == null ? '—' : `${dec(v)} s`)
const corto = (v) => (Math.abs(v) >= 1000 ? `${dec(v / 1000)}k` : String(Math.round(v)))
const dia = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—')
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1)

function Caja({ titulo, sub, children }) {
  return (
    <section className="helm-card helm-graf">
      <header>
        <h3>{titulo}</h3>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </section>
  )
}

// Cada barra es una pieza, en el orden en que se publicó. La línea de la
// mediana es la referencia: lo que queda por encima es lo que hay que mirar.
function VisitasPorPieza({ piezas, mediana }) {
  const datos = [...piezas].reverse().map((p, i) => ({ ...p, i }))
  return (
    <Caja titulo="Visitas por publicación" sub={`De la más antigua a la más reciente. La línea es la mediana: ${num(mediana)} visitas.`}>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={REJILLA} vertical={false} />
          <XAxis
            dataKey="i" tick={EJE} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickFormatter={(i) => dia(datos[i]?.fecha)} interval="preserveStartEnd" minTickGap={48}
          />
          <YAxis tickFormatter={corto} tick={EJE} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return (
                <div className="helm-graf-globo met-globo">
                  <b>{p.titulo}</b>
                  <span><i style={{ background: COLOR }} />Visitas: <em>{num(p.visitas)}</em></span>
                  <span className="sec">{dia(p.fecha)}, {p.formato}. Retención {seg(p.retencion_media_s)}, {dec(p.guardados_por_mil)} guardados por mil.</span>
                </div>
              )
            }}
          />
          <ReferenceLine y={mediana} stroke="#a3a3ad" strokeDasharray="5 4" />
          <Bar dataKey="visitas" radius={[3, 3, 0, 0]} maxBarSize={22}>
            {datos.map(p => <Cell key={p.url} fill={COLOR} fillOpacity={p.visitas >= mediana ? 1 : 0.5} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Caja>
  )
}

// Con pocas piezas en un día la mediana baila: el número de piezas va escrito
// al lado de cada barra, que es lo que dice cuánto fiarse.
function PorDia({ dias }) {
  const max = Math.max(...dias.map(d => d.mediana_visitas || 0), 1)
  return (
    <Caja titulo="Por día de la semana" sub="Mediana de visitas según el día en que se publicó">
      <ul className="met-dias">
        {dias.map(d => (
          <li key={d.dia}>
            <span>{mayus(d.dia)}</span>
            <div className="met-barra" title={`${num(d.mediana_visitas)} visitas de mediana`}>
              <i style={{ width: `${((d.mediana_visitas || 0) / max) * 100}%` }} />
            </div>
            <b>{num(d.mediana_visitas)}</b>
            <small>{d.publicaciones} {d.publicaciones === 1 ? 'pieza' : 'piezas'}</small>
          </li>
        ))}
      </ul>
    </Caja>
  )
}

function Lista({ titulo, sub, frases }) {
  return (
    <section className="helm-card met-lista">
      <h3>{titulo}</h3>
      {sub && <p className="met-lista-sub">{sub}</p>}
      <ul>{frases.map(f => <li key={f}>{f}</li>)}</ul>
    </section>
  )
}

const COLUMNAS = [
  { key: 'visitas', label: 'Visitas', fmt: num },
  { key: 'retencion_media_s', label: 'Retención', fmt: seg },
  { key: 'guardados_por_mil', label: 'Guardados por mil', fmt: dec },
  { key: 'compartidos_por_mil', label: 'Compartidos por mil', fmt: dec },
  { key: 'interacciones_por_mil', label: 'Interacciones por mil', fmt: dec },
]

function Tabla({ piezas }) {
  const [orden, setOrden] = useState('visitas')
  const [todas, setTodas] = useState(false)
  const ordenadas = [...piezas].sort((a, b) => (b[orden] ?? -1) - (a[orden] ?? -1))
  const visibles = todas ? ordenadas : ordenadas.slice(0, 10)
  return (
    <div className="helm-panel">
      <div className="helm-panel-head">
        <h2>Las publicaciones</h2>
        {piezas.length > 10 && (
          <button type="button" className="helm-linkbtn" onClick={() => setTodas(t => !t)}>
            {todas ? 'Ver solo las 10 primeras' : `Ver las ${piezas.length}`}
          </button>
        )}
      </div>
      <div className="helm-tablewrap">
        <table className="helm-table met-tabla">
          <thead>
            <tr>
              <th>Publicación</th>
              <th>Fecha</th>
              {COLUMNAS.map(c => (
                <th key={c.key} className="n" aria-sort={orden === c.key ? 'descending' : 'none'}>
                  <button type="button" className={orden === c.key ? 'on' : ''} onClick={() => setOrden(c.key)}>{c.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(p => (
              <tr key={p.url}>
                <td className="met-pieza">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">{p.titulo} <ArrowUpRight size={12} /></a>
                </td>
                <td>{dia(p.fecha)}</td>
                {COLUMNAS.map(c => <td key={c.key} className="n">{c.fmt(p[c.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Las formas de la vista previa. Son dibujo, no datos: ni una cifra, para que
// nadie las lea como si fueran de su cuenta.
const BARRAS = [34, 52, 28, 61, 40, 88, 47, 36, 72, 44, 58, 31, 95, 50]
const MEDIANA_PREVIA = 48
const DIAS_PREVIA = [['L', 46], ['M', 62], ['X', 38], ['J', 84], ['V', 55], ['S', 30], ['D', 41]]

// Sin Instagram conectado. Antes era una línea que mandaba a Ajustes, y casi
// ningún cliente puede conectarlo solo: hay que pasar por la app de Meta, y eso
// lo hacemos nosotros. Ahora se cuenta qué trae el informe (lo que dirá, no lo
// que dice) y a quién pedírselo. El atajo a Ajustes queda para quien manda en
// todo el perfil: a un closer le llevaría a una pantalla que no puede abrir.
export function SinInstagram({ onNavigate }) {
  const { mandaEnTodo } = sesionHelm()
  const usuario = `@${INSTAGRAM_CONTACTO}`
  const enlace = enlaceInstagram()
  return (
    <div className="metricas">
      <section className="helm-card met-pend">
        <span className="met-pend-etq"><Hourglass size={13} /> Todavía no disponible</span>
        <h2>Tu informe de contenido se enciende al conectar tu Instagram</h2>
        <p className="met-pend-txt">
          Con la cuenta conectada, HELM lee lo que publicas varias veces al día y te dice qué ha funcionado,
          qué tienen en común las piezas que mejor van y qué grabar la semana que viene.
        </p>
        <div className="met-pend-aviso">
          <MessageCircle size={18} />
          <p>Para conectarlo, escríbenos por Instagram a <a href={enlace} target="_blank" rel="noopener noreferrer">{usuario}</a>.</p>
        </div>
        <div className="met-pend-acciones">
          <a className="helm-btn primary" href={enlace} target="_blank" rel="noopener noreferrer">
            Escribir a {usuario} <ArrowUpRight size={14} />
          </a>
          {mandaEnTodo && onNavigate && (
            <button type="button" className="helm-linkbtn" onClick={() => onNavigate('ajustes')}>
              Conectarlo yo en Ajustes → Integraciones
            </button>
          )}
        </div>
      </section>

      <section className="met-pre" aria-labelledby="met-pre-tit">
        <h3 id="met-pre-tit" className="met-pre-tit">Lo que vas a ver aquí</h3>
        <div className="met-pre-rejilla">
          <article className="helm-card met-pre-caja">
            <BarChart3 size={18} />
            <h4>Las cifras de la cuenta</h4>
            <p>Publicaciones, visitas, retención y guardados por cada mil visitas, con la mediana como vara de medir.</p>
            <div className="met-pre-barras" aria-hidden="true">
              {BARRAS.map((h, i) => <i key={i} className={h >= MEDIANA_PREVIA ? 'alta' : ''} style={{ height: `${h}%` }} />)}
              <span style={{ bottom: `${MEDIANA_PREVIA}%` }} />
            </div>
          </article>
          <article className="helm-card met-pre-caja">
            <Sparkles size={18} />
            <h4>Qué dicen los números</h4>
            <p>Cuánto se aleja tu mejor pieza de una normal, qué día de publicación te funciona y si las más vistas retienen más.</p>
            <ul className="met-pre-lineas" aria-hidden="true">
              <li style={{ width: '94%' }} /><li style={{ width: '78%' }} /><li style={{ width: '86%' }} /><li style={{ width: '58%' }} />
            </ul>
          </article>
          <article className="helm-card met-pre-caja">
            <Clapperboard size={18} />
            <h4>Qué grabar la semana que viene</h4>
            <p>Los temas a los que volver, los días en que guardar las piezas fuertes y el tipo de pieza que más se guarda.</p>
            <ul className="met-pre-dias" aria-hidden="true">
              {DIAS_PREVIA.map(([d, h]) => (
                <li key={d}><span>{d}</span><i><b style={{ width: `${h}%` }} /></i></li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </div>
  )
}

export default function Metricas({ clientId, onNavigate }) {
  const [periodo, setPeriodo] = useState('')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  // Cuando ya hay un estudio de contenido generado, el resumen rápido de abajo
  // («Qué dicen los números» / «Para la próxima semana») sobra: lo dice mejor el
  // propio estudio. Hasta entonces, se queda como estaba. Lo avisa el estudio.
  const [hayEstudio, setHayEstudio] = useState(false)

  const cargar = useCallback(
    () => instagramApi.informe(clientId, periodo).then(d => { setDatos(d); setError(null) }).catch(e => setError(e.message)),
    [clientId, periodo],
  )
  useEffect(() => { cargar() }, [cargar])

  async function sincronizar() {
    setSincronizando(true); setError(null); setAviso(null)
    try {
      const r = await instagramApi.sync(clientId)
      setAviso(`${r.sincronizadas} publicaciones sincronizadas.`)
      await cargar()
    } catch (e) { setError(e.message) }
    setSincronizando(false)
  }

  if (error && !datos) return <FormNote>{error}</FormNote>
  if (!datos) return <Empty>Cargando las métricas…</Empty>

  if (!datos.conectado) return <SinInstagram onNavigate={onNavigate} />

  const { cuenta, resumen, estudio, publicaciones } = datos
  const sincronizado = cuenta.sincronizado
    ? `Datos del ${new Date(cuenta.sincronizado).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
    : 'Sin sincronizar todavía'

  return (
    <div className="metricas">
      <header className="met-cab">
        <div>
          <h2>@{cuenta.usuario || 'cuenta'}</h2>
          <p>{cuenta.seguidores != null ? `${num(cuenta.seguidores)} seguidores. ` : ''}{sincronizado}.</p>
        </div>
        <div className="met-cab-acciones">
          <Tabs tabs={PERIODOS} value={periodo} onChange={setPeriodo} />
          <button type="button" className="helm-btn" onClick={sincronizar} disabled={sincronizando}>
            <RefreshCw size={14} /> {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </header>
      {error && <FormNote>{error}</FormNote>}
      {aviso && <FormNote tone="ok">{aviso}</FormNote>}

      {!publicaciones.length ? (
        <Empty>
          {periodo
            ? `No hay publicaciones en los últimos ${periodo} días. Prueba con un periodo más largo o sincroniza.`
            : 'Todavía no hay publicaciones guardadas. Pulsa Sincronizar para traerlas de Instagram.'}
        </Empty>
      ) : (
        <>
          <div className="helm-grid helm-kpis">
            <Kpi label="Publicaciones" value={num(resumen.publicaciones)} sub={`Del ${dia(resumen.desde)} al ${dia(resumen.hasta)}`} />
            <Kpi label="Visitas" value={num(resumen.visitas_totales)} sub="Sumando todas las piezas" />
            <Kpi label="Mediana de visitas" value={num(resumen.mediana_visitas)} sub="Lo que hace una pieza normal" accent />
            <Kpi label="Retención" value={seg(resumen.mediana_retencion_s)} sub="Mediana de visionado en reels" />
            <Kpi label="Guardados por mil" value={dec(resumen.mediana_guardados_por_mil)} sub="Mediana por cada mil visitas" />
          </div>

          <VisitasPorPieza piezas={publicaciones} mediana={resumen.mediana_visitas} />

          {!hayEstudio && (estudio.conclusiones.length > 0 || estudio.proxima_semana.length > 0) && (
            <div className="met-dos">
              {estudio.conclusiones.length > 0 && (
                <Lista titulo="Qué dicen los números" frases={estudio.conclusiones} />
              )}
              {estudio.proxima_semana.length > 0 && (
                <Lista
                  titulo="Para la próxima semana"
                  sub="Sale de comparar las piezas entre sí; no sabe de qué va cada vídeo más allá de su texto."
                  frases={estudio.proxima_semana}
                />
              )}
            </div>
          )}

          <PorDia dias={estudio.por_dia_semana} />
          <Tabla piezas={publicaciones} />
        </>
      )}

      {/* El estudio de verdad: diagnóstico, objetivos por etapas, plan, avatar
          de contenido y lo aprendido. Trae su propia cabecera y su botón; avisa
          a Metricas si ya hay uno para esconder el resumen. Va fuera del
          ternario de `publicaciones` a propósito: el estudio usa TODAS las
          piezas, no depende del periodo elegido, así que no debe desmontarse al
          cambiar de «15 días» a «Todo» (perdería el estudio abierto del
          historial y volvería a cargar). */}
      <EstudioContenido clientId={clientId} onHayEstudio={setHayEstudio} />
    </div>
  )
}
