// HELM — Noticias: las tres noticias del día del perfil (IA y ciberseguridad,
// o los temas propios del perfil: ver api/_lib/noticias-perfiles.js).
//
// Las deja cada mañana, antes de las 6:00, el agente de noticias
// (api/_lib/noticias.js). Arriba las de hoy, enteras; debajo las de los días
// anteriores, plegadas. El botón pide una pasada ahora, por si ha salido algo
// gordo a media tarde.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, RotateCcw } from 'lucide-react'
import { noticiasApi } from '../lib'
import { Empty, FormNote } from '../ui'
import './noticias.css'

const TEMA = {
  ia: 'IA', ciberseguridad: 'Ciberseguridad',
  sony: 'Sony', equipo: 'Equipo', filmmaking: 'Filmmaking', postproduccion: 'Posproducción',
}
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

function Noticia({ n, entera }) {
  return (
    <li className="noti">
      <span className="noti-n">{n.puesto}</span>
      <div>
        <small>{TEMA[n.tema] || n.tema} · {n.fuente}</small>
        <h3><a href={n.url} target="_blank" rel="noopener noreferrer">{n.titular}</a></h3>
        {entera && <p>{n.resumen}</p>}
        {entera && n.por_que && <p className="noti-porque"><b>Por qué te importa.</b> {n.por_que}</p>}
        {entera && (
          <a className="noti-leer" href={n.url} target="_blank" rel="noopener noreferrer">
            Leer en {n.fuente} <ArrowUpRight size={13} />
          </a>
        )}
      </div>
    </li>
  )
}

export default function Noticias({ clientId }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(
    () => noticiasApi.lista(clientId).then(d => { setDatos(d); setError(null) }).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])
  // Mientras el agente está leyendo, se vuelve a mirar cada pocos segundos.
  useEffect(() => {
    if (!datos?.buscando) return
    const t = setTimeout(cargar, 5000)
    return () => clearTimeout(t)
  }, [datos, cargar])

  async function ahora() {
    setError(null)
    try {
      await noticiasApi.ahora(clientId)
      setDatos(d => ({ ...d, buscando: true, fallo: '' }))
    } catch (e) { setError(e.message) }
  }

  const { deHoy, anteriores } = useMemo(() => {
    const porDia = new Map()
    for (const n of datos?.noticias || []) {
      if (!porDia.has(n.fecha)) porDia.set(n.fecha, [])
      porDia.get(n.fecha).push(n)
    }
    const deHoy = porDia.get(datos?.hoy) || []
    porDia.delete(datos?.hoy)
    return { deHoy, anteriores: [...porDia.entries()] }
  }, [datos])

  if (error && !datos) return <FormNote>{error}</FormNote>
  if (!datos) return <Empty>Cargando las noticias…</Empty>

  return (
    <div className="noticias">
      <header className="noticias-cab">
        <h2>{fechaLarga(datos.hoy)}</h2>
        <button type="button" className="helm-btn" onClick={ahora} disabled={datos.buscando}>
          <RotateCcw size={14} /> {datos.buscando ? 'Leyendo las fuentes…' : 'Buscar ahora'}
        </button>
      </header>
      <FormNote>{error || (datos.fallo && !datos.buscando && !deHoy.length ? `La última pasada falló: ${datos.fallo}` : null)}</FormNote>

      {deHoy.length ? (
        <ol className="noticias-hoy helm-panel">
          {deHoy.map(n => <Noticia key={n.id} n={n} entera />)}
        </ol>
      ) : (
        <Empty>
          {datos.buscando
            ? 'El agente está leyendo las fuentes. Tarda alrededor de un minuto.'
            : 'Todavía no hay noticias de hoy. Llegan cada mañana antes de las 6:00; si no quieres esperar, pulsa «Buscar ahora».'}
        </Empty>
      )}

      {anteriores.length > 0 && (
        <section className="noticias-antes">
          <h2>Días anteriores</h2>
          {anteriores.map(([fecha, lista]) => (
            <details key={fecha}>
              <summary><b>{fechaLarga(fecha)}</b><span>{lista.map(n => TEMA[n.tema]).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</span></summary>
              <ol>{lista.map(n => <Noticia key={n.id} n={n} entera />)}</ol>
            </details>
          ))}
        </section>
      )}
    </div>
  )
}
