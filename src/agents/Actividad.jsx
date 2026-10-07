// Agent OS — los agentes, trabajando a la vista.
//
// Dos piezas en la portada: "Ahora", lo que el worker tiene entre manos en
// este momento, paso a paso y con su cronómetro; y la gráfica de las últimas
// 24 horas, lo que se ha acabado cada hora y en qué paso.
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { GANCHOS, nf } from './ganchos'

// Los pasos del worker. Los colores son los cuatro primeros de GANCHOS en su
// mismo orden: esa paleta está validada por pares adyacentes, y en una barra
// apilada los adyacentes son justo estos. No se reordenan.
export const PASOS = {
  descargar:       { label: 'Descargar',   agente: 'contenido', color: GANCHOS[0].color },
  transcribir:     { label: 'Transcribir', agente: 'contenido', color: GANCHOS[1].color },
  etiquetar:       { label: 'Etiquetar',   agente: 'contenido', color: GANCHOS[2].color },
  'drive-ingesta': { label: 'Ordenar vídeo', agente: 'drive', color: GANCHOS[3].color },
  equipo:          { label: 'Equipo', agente: 'equipo', color: GANCHOS[4].color },
}
const ORDEN = Object.keys(PASOS)
export const paso = (tipo) => PASOS[tipo] || { label: tipo, agente: '', color: '#5C7284' }

// El recorrido de cada agente, para dibujar en qué punto va.
const RECORRIDO = {
  contenido: ['descargar', 'transcribir', 'etiquetar'],
  drive: ['drive-ingesta'],
}

// 75 → "1 min 15 s". Para un cronómetro que se lee, no para medir.
export function dura(s) {
  if (s == null || !isFinite(s)) return '—'
  s = Math.max(0, Math.round(s))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

// ── Ahora ───────────────────────────────────────────────────────────────────

export function EnVivo({ ahora = [], enCola = 0, agentes, media = {} }) {
  const [reloj, setReloj] = useState(Date.now())
  useEffect(() => {
    if (!ahora.length) return
    const t = setInterval(() => setReloj(Date.now()), 1000)
    return () => clearInterval(t)
  }, [ahora.length])

  if (!ahora.length) {
    return (
      <div className="ag-card ag-envivo-vacio">
        <span className="ag-latido parado" aria-hidden="true" />
        <span>
          Ningún agente trabajando ahora mismo.
          {enCola > 0 && <> Hay <b>{enCola}</b> {enCola === 1 ? 'trabajo' : 'trabajos'} en cola esperando al worker.</>}
        </span>
      </div>
    )
  }

  const nombre = (key) => agentes.find(a => a.key === key)?.nombre || 'Agente'
  return (
    <div className="ag-envivo">
      {ahora.map(j => {
        const p = paso(j.tipo)
        const recorrido = RECORRIDO[p.agente] || [j.tipo]
        const i = recorrido.indexOf(j.tipo)
        const lleva = (reloj - Date.parse(j.empezado_en)) / 1000
        const esperado = media[j.tipo]
        // La barra es una estimación con la media del paso. Nunca llega al
        // final por su cuenta: se queda en 95 % hasta que el paso acaba.
        const pct = esperado ? Math.min(95, (lleva / esperado) * 100) : null
        return (
          <article key={j.id} className="ag-card ag-vivo">
            <header>
              <span className="ag-latido" aria-hidden="true" />
              <b>{nombre(p.agente)}</b>
              <span className="ag-vivo-reloj">{dura(lleva)}</span>
            </header>
            <ol className="ag-recorrido" aria-label="Recorrido del trabajo">
              {recorrido.map((k, n) => (
                <li key={k} className={n < i ? 'hecho' : n === i ? 'actual' : ''}
                  style={{ '--c': paso(k).color }} aria-current={n === i ? 'step' : undefined}>
                  <i aria-hidden="true" />{paso(k).label}
                </li>
              ))}
            </ol>
            {j.que && <p className="ag-vivo-que" title={j.que}>{j.que}</p>}
            <div className="ag-vivo-barra" style={{ '--c': p.color }}>
              {pct == null ? <span className="indeterminada" /> : <span style={{ width: `${pct}%` }} />}
            </div>
            <footer>
              <span>{esperado ? `Suele tardar ${dura(esperado)}` : 'Sin media todavía'}</span>
              {j.intentos > 1 && <span className="ag-vivo-intento">Intento {j.intentos} de {j.max_intentos}</span>}
            </footer>
          </article>
        )
      })}
    </div>
  )
}

// ── Últimas 24 horas ────────────────────────────────────────────────────────

const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

export function Ritmo({ actividad }) {
  if (!actividad) return null
  const datos = actividad.horas.map(h => ({ t: h.t, errores: h.errores, ...h.porTipo }))
  const presentes = ORDEN.filter(k => datos.some(d => d[k]))
  const total = datos.reduce((s, d) => s + presentes.reduce((a, k) => a + (d[k] || 0), 0), 0)
  const errores = datos.reduce((s, d) => s + d.errores, 0)

  return (
    <div className="ag-card ag-ritmo">
      <header>
        <div>
          <h3>Pasos completados por hora</h3>
          <p><b>{nf.format(total)}</b> en las últimas 24 horas
            {errores > 0 && <span className="ag-ritmo-err"><AlertTriangle size={13} strokeWidth={2.2} aria-hidden="true" /> {errores} con error</span>}
          </p>
        </div>
        {presentes.length > 1 && (
          <div className="ag-roles" aria-label="Leyenda">
            {presentes.map(k => (
              <span key={k}><i style={{ background: PASOS[k].color }} />{PASOS[k].label}</span>
            ))}
          </div>
        )}
      </header>

      {total === 0 && errores === 0 ? (
        <p className="ag-vacio">Nada acabado en las últimas 24 horas. Cuando el worker trabaje, aquí se verá su ritmo.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={datos} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke="rgba(96,186,214,0.10)" vertical={false} />
            <XAxis
              dataKey="t" tickFormatter={hora} interval={3}
              tick={{ fill: '#5C7284', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(96,186,214,0.18)' }} tickLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fill: '#5C7284', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              cursor={{ fill: 'rgba(96,186,214,0.08)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                const suma = presentes.reduce((a, k) => a + (d[k] || 0), 0)
                return (
                  <div className="ag-tooltip">
                    <b>{hora(d.t)} – {hora(d.t + 3600e3)}</b>
                    {suma === 0 && !d.errores && <em>Sin actividad</em>}
                    {presentes.filter(k => d[k]).map(k => (
                      <span key={k} className="ag-tooltip-fila">
                        <span className="ag-punto" style={{ background: PASOS[k].color }} />
                        {PASOS[k].label}<em>{d[k]}</em>
                      </span>
                    ))}
                    {d.errores > 0 && <span className="rec">{d.errores} con error</span>}
                  </div>
                )
              }}
            />
            {presentes.map((k, n) => (
              <Bar
                key={k} dataKey={k} stackId="a" fill={PASOS[k].color}
                stroke="#101820" strokeWidth={1}
                radius={n === presentes.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {Object.keys(actividad.media).length > 0 && (
        <p className="ag-pie-grafica">
          Tiempo medio por paso: {ORDEN.filter(k => actividad.media[k] != null)
            .map(k => `${PASOS[k].label.toLowerCase()} ${dura(actividad.media[k])}`).join(' · ')}.
        </p>
      )}
    </div>
  )
}
