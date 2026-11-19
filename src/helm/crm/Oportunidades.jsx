// HELM — «Oportunidades de venta» en la ficha de un lead de WebSeller.
//
// Sin que el cold caller escriba nada: el sector sale del lead y el análisis
// (problemas habituales, qué venderle, qué preguntar, cómo enfocar la llamada)
// viene de api/oportunidades.js, que lo genera una vez por sector y lo guarda.
// Arriba va lo que tiene que ver antes de marcar: lo propio de este lead, las
// 3 mejores oportunidades y la guía de la llamada. El resto, plegado.
import { useEffect, useState } from 'react'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { oportunidadesApi } from '../lib'
import './oportunidades.css'

const AREAS = [['alta', 'Prioridad alta'], ['media', 'Prioridad media'], ['adicionales', 'Si necesita algo más']]

export default function Oportunidades({ clientId, contactId, puedeRehacer = false }) {
  const [estado, setEstado] = useState({ cargando: true })

  // El drawer se monta con key=contacto, así que el estado inicial ya es «cargando».
  // El primer lead de un sector puede tardar más de lo que aguanta el túnel
  // (corta a los 100 s). El servidor sigue generando y lo guarda, así que se
  // vuelve a pedir: la segunda petición se engancha a la que ya está en marcha.
  const pedir = (rehacer, intento = 0) =>
    (rehacer && intento === 0 ? oportunidadesApi.regenerar(clientId, contactId) : oportunidadesApi.lead(clientId, contactId))
      .then(d => setEstado({ cargando: false, ...d }))
      .catch(e => {
        const reintentable = !e.status || e.status === 502 || e.status === 504 || e.status === 524
        if (reintentable && intento < 3) return new Promise(r => setTimeout(r, 8000)).then(() => pedir(false, intento + 1))
        setEstado({ cargando: false, error: e.message })
      })
  const cargar = (rehacer) => { setEstado(e => ({ ...e, cargando: true, error: null })); pedir(rehacer) }
  useEffect(() => { pedir(false) }, [clientId, contactId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { cargando, error, sector, senales = [], analisis } = estado
  const a = analisis?.analisis

  return (
    <div className="helm-oport">
      <div className="helm-drawer-section helm-oport-head">
        <span><Lightbulb size={13} /> Oportunidades de venta{sector ? ` · ${sector.nombre}` : ''}</span>
        {puedeRehacer && a && !cargando && (
          <button type="button" className="helm-btn sm" onClick={() => cargar(true)} title="Rehacer el análisis de este sector">
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {senales.length > 0 && (
        <ul className="helm-oport-senales">{senales.map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}

      {cargando && <p className="helm-settings-note">{analisis ? 'Rehaciendo el análisis…' : 'Preparando el análisis del sector… (solo tarda la primera vez)'}</p>}
      {error && <p className="helm-oport-error">{error}</p>}
      {!cargando && !error && !sector && (
        <p className="helm-settings-note">Este lead no tiene sector (etiqueta o categoría). Pon el tipo de negocio en sus etiquetas para ver sus oportunidades.</p>
      )}

      {a && !cargando && (
        <>
          {Array.isArray(a.top3) && a.top3.length > 0 && (
            <ol className="helm-oport-top">
              {a.top3.map((t, i) => <li key={i}><b>{t.titulo}</b><span>{t.porque}</span></li>)}
            </ol>
          )}

          {a.llamada && (
            <div className="helm-oport-llamada">
              <Linea k="Gancho" v={a.llamada.gancho} />
              <Linea k="Ejemplo" v={a.llamada.ejemplo} />
              <Linea k="Pregunta clave" v={a.llamada.pregunta_principal} fuerte />
              <Linea k="Conexión" v={a.llamada.conexion} />
              <Linea k="Demo" v={a.llamada.demo} />
            </div>
          )}

          <details className="helm-oport-bloque">
            <summary>Problemas y soluciones ({a.oportunidades?.length || 0})</summary>
            {(a.oportunidades || []).map((o, i) => (
              <div key={i} className="helm-oport-card">
                <b>{o.problema}</b>
                {o.como_se_nota && <p className="helm-oport-dim">{o.como_se_nota}</p>}
                <Linea k="Le cuesta" v={o.consecuencia} />
                <Linea k="Solución" v={o.solucion + (o.servicio ? ` (${o.servicio})` : '')} />
                <Linea k="Beneficio" v={o.beneficio} />
                <Linea k="Pregunta" v={o.pregunta} fuerte />
                <Linea k="Cómo sacarlo" v={o.enfoque} />
              </div>
            ))}
          </details>

          {Array.isArray(a.preguntas) && a.preguntas.length > 0 && (
            <details className="helm-oport-bloque">
              <summary>Preguntas para detectar necesidades</summary>
              {a.preguntas.map((g, i) => (
                <div key={i} className="helm-oport-preg">
                  <small>{g.area}</small>
                  <ul>{(g.preguntas || []).map((p, j) => <li key={j}>{p}</li>)}</ul>
                </div>
              ))}
            </details>
          )}

          {a.soluciones && (
            <details className="helm-oport-bloque">
              <summary>Qué podemos venderle</summary>
              {AREAS.map(([k, label]) => (a.soluciones[k] || []).length > 0 && (
                <div key={k} className="helm-oport-preg">
                  <small>{label}</small>
                  {a.soluciones[k].map((s, i) => (
                    <div key={i} className="helm-oport-card">
                      <b>{s.nombre}</b>
                      <p className="helm-oport-dim">{s.que_es}</p>
                      <Linea k="Resuelve" v={s.resuelve} />
                      <Linea k="Beneficio" v={s.beneficio} />
                      <Linea k="Servicio" v={s.servicio} />
                      {s.validacion && <Linea k="Ojo" v={s.validacion} aviso />}
                      {s.rango_precio && <Linea k="Precio orientativo" v={s.rango_precio} />}
                    </div>
                  ))}
                </div>
              ))}
            </details>
          )}

          {a.perfil && (
            <details className="helm-oport-bloque">
              <summary>Cómo funciona este negocio</summary>
              <p>{a.perfil.funcionamiento}</p>
              {a.perfil.areas_mejora?.length > 0 && <ul>{a.perfil.areas_mejora.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </details>
          )}
          <p className="helm-oport-pie">Son hipótesis del sector: confírmalas preguntando. Precios siempre orientativos hasta cerrar el alcance.</p>
        </>
      )}
    </div>
  )
}

function Linea({ k, v, fuerte, aviso }) {
  if (!v) return null
  return (
    <div className={'helm-oport-linea' + (aviso ? ' aviso' : '')}>
      <small>{k}</small>
      <span>{fuerte ? <b>{v}</b> : v}</span>
    </div>
  )
}
