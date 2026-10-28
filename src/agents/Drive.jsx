// Agent OS — la Ingesta de Drive de un perfil: su calendario de guiones, por
// fases, y lo que ha ido cayendo en "0 · Entrada".
//
// La fase de cada guion sale de dónde está su carpeta en Drive (Sin editar,
// Editados, Publicados): lo que el editor mueve en Drive se ve aquí solo. La
// usan /agents (el operador, todos los perfiles) y la sección Agentes de HELM
// (un perfil, en solo lectura).
import { useEffect, useState } from 'react'
import { ExternalLink, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { fecha } from './ganchos'

const FASES = [
  { key: 'por_grabar', label: 'Por grabar' },
  { key: 'sin_editar', label: 'Sin editar' },
  { key: 'editado', label: 'Editado' },
  { key: 'publicado', label: 'Publicado' },
]
const TIPOS = { viralidad: 'Viralidad', conversion: 'Conversión', autoridad: 'Autoridad', venta: 'Venta' }
const ESTADO_VIDEO = {
  pendiente: { txt: 'En cola', tono: 'espera' },
  transcrito: { txt: 'Transcrito', tono: 'espera' },
  ordenado: { txt: 'Ordenado', tono: 'ok' },
  sin_guion: { txt: 'Sin guion: sigue en Entrada', tono: 'mal' },
  error: { txt: 'Error', tono: 'mal' },
}

export default function PanelDrive({ cargar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [vistaCal, setVistaCal] = useState('mes')

  useEffect(() => {
    let vivo = true
    const trae = () => cargar().then(d => vivo && setDatos(d)).catch(e => vivo && setError(e.message))
    trae()
    // Lo que entra en Drive llega solo: se refresca cada minuto.
    const t = setInterval(trae, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [cargar])

  if (error) return <p className="ag-error">{error}</p>
  if (!datos) return <p className="ag-vacio">Cargando…</p>
  if (!datos.conectado) {
    return <p className="ag-vacio">Este perfil todavía no tiene carpeta en HELM Contenido.</p>
  }

  return (
    <div className="ag-lista">
      <div className="ag-card ag-drive-cab">
        <div>
          <b>Carpeta: {datos.carpeta.nombre}</b>
          <small>Cada 5 minutos se mira <b>0 · Entrada</b>. Lo que se reconoce va solo a su guion, en <b>1 · Sin editar</b>.</small>
        </div>
        <div className="ag-drive-acc">
          <a className="ag-btn sm" href={datos.carpeta.entrada} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Entrada</a>
          <a className="ag-btn sm" href={datos.carpeta.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Carpeta</a>
        </div>
      </div>

      <nav className="ag-pestanas">
        <button type="button" className={vistaCal === 'mes' ? 'active' : ''} onClick={() => setVistaCal('mes')}>Calendario</button>
        <button type="button" className={vistaCal === 'fases' ? 'active' : ''} onClick={() => setVistaCal('fases')}>Por fases</button>
      </nav>

      {vistaCal === 'mes' && <Calendario guiones={datos.guiones} />}

      {vistaCal === 'fases' && <div className="ag-fases">
        {FASES.map(f => {
          const lista = datos.guiones.filter(g => g.fase === f.key)
          return (
            <section key={f.key} className="ag-card ag-fase">
              <h3>{f.label} <span>{lista.length}</span></h3>
              {lista.length ? lista.map(g => (
                <button key={g.id} type="button" className={`ag-guion-it${abierto === g.id ? ' on' : ''}`}
                  onClick={() => setAbierto(abierto === g.id ? null : g.id)}>
                  <span className="ag-guion-cab">
                    <small>{fecha(g.fecha)}</small>
                    {g.tipo && <span className={`ag-tipo t-${g.tipo}`}>{TIPOS[g.tipo]}</span>}
                  </span>
                  <b>{g.titulo}</b>
                  {abierto === g.id && g.guion && <span className="ag-guion-txt">{g.guion}</span>}
                </button>
              )) : <p className="ag-aviso">Nada.</p>}
            </section>
          )
        })}
      </div>}

      <section className="ag-card ag-tabla-caja">
        <h3>Lo que ha entrado por Drive</h3>
        {datos.videos.length ? (
          <table className="ag-tabla">
            <thead><tr><th>Vídeo</th><th>Qué ha pasado</th><th>Dónde está</th></tr></thead>
            <tbody>
              {datos.videos.map(v => {
                const e = ESTADO_VIDEO[v.estado] || { txt: v.estado, tono: 'espera' }
                return (
                  <tr key={v.drive_id}>
                    <td>{v.nombre}<small>{fecha(v.created_at)}</small></td>
                    <td><span className={`ag-estado ${e.tono}`}>{e.txt}</span>{v.error && <small>{v.error}</small>}</td>
                    <td>{v.destino || (v.estado === 'sin_guion' ? 'Pídele a Claude que lo ordene' : '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="ag-aviso">Aún no ha entrado nada. Sube un vídeo a 0 · Entrada y aparecerá aquí en unos minutos.</p>}
      </section>
    </div>
  )
}

// ── El calendario del mes ───────────────────────────────────────────────────
// Como el de la antigua sección Guiones: cada guion en su día, con el color de
// su tipo y un punto con su fase. Pinchar uno abre su texto.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function Calendario({ guiones }) {
  const hoy = new Date()
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [abierto, setAbierto] = useState(null)

  const porDia = {}
  for (const g of guiones) (porDia[g.fecha] ||= []).push(g)

  // Semanas de lunes a domingo que cubren el mes.
  const inicio = new Date(mes)
  inicio.setDate(1 - ((mes.getDay() + 6) % 7))
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  const semanas = dias[35].getMonth() === mes.getMonth() ? 6 : 5
  const mueve = (n) => setMes(m => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const g = abierto && guiones.find(x => x.id === abierto)

  return (
    <section className="ag-card ag-cal">
      <header className="ag-cal-cab">
        <button type="button" className="ag-btn sm" onClick={() => mueve(-1)} aria-label="Mes anterior"><ChevronLeft size={15} /></button>
        <b>{MESES[mes.getMonth()]} {mes.getFullYear()}</b>
        <button type="button" className="ag-btn sm" onClick={() => mueve(1)} aria-label="Mes siguiente"><ChevronRight size={15} /></button>
        <span className="ag-cal-leyenda">
          {Object.entries(TIPOS).map(([k, l]) => <span key={k} className={`ag-tipo t-${k}`}>{l}</span>)}
        </span>
      </header>
      <div className="ag-cal-rejilla">
        {DIAS.map(d => <span key={d} className="ag-cal-dia-nombre">{d}</span>)}
        {dias.slice(0, semanas * 7).map(d => {
          const clave = iso(d)
          const fuera = d.getMonth() !== mes.getMonth()
          return (
            <div key={clave} className={`ag-cal-dia${fuera ? ' fuera' : ''}${clave === iso(hoy) ? ' hoy' : ''}`}>
              <small>{d.getDate()}</small>
              {(porDia[clave] || []).map(x => (
                <button key={x.id} type="button" className={`ag-cal-guion t-${x.tipo || 'ninguno'}`}
                  onClick={() => setAbierto(x.id)} title={`${x.titulo} · ${FASES.find(f => f.key === x.fase)?.label}`}>
                  <i className={`ag-fase-punto f-${x.fase}`} />{x.titulo}
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <p className="ag-cal-pie">
        {FASES.map(f => <span key={f.key}><i className={`ag-fase-punto f-${f.key}`} />{f.label}</span>)}
      </p>

      {g && (
        <div className="ag-panel-fondo" onClick={() => setAbierto(null)} role="presentation">
          <aside className="ag-panel" onClick={e => e.stopPropagation()} aria-label="Guion">
            <header>
              <div>
                {g.tipo && <span className={`ag-tipo t-${g.tipo}`}>{TIPOS[g.tipo]}</span>}
                <span className="ag-tema">{FASES.find(f => f.key === g.fase)?.label}</span>
              </div>
              <button type="button" className="ag-btn sm" onClick={() => setAbierto(null)} aria-label="Cerrar"><X size={14} /></button>
            </header>
            <div className="ag-panel-cuerpo">
              <small className="ag-aviso">{fecha(g.fecha)}</small>
              <h2 className="ag-cal-titulo">{g.titulo}</h2>
              <p className="ag-guion-txt">{g.guion || 'Sin texto.'}</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}

