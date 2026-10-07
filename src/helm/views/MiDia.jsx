// HELM — Mi día: los rituales diarios con la IA del perfil.
//
// A la izquierda, el día en su orden (mañana, mediodía, noche): cada momento
// lee los anteriores. A la derecha, lo que se usa cuando hace falta (una
// reunión, un correo, una idea). Abajo, la revisión de la semana y lo ya hecho.
//
// La IA no organiza a nadie: obliga a mirar lo que se hace. Por eso cada
// ritual pide primero que la persona cuente algo con sus palabras.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sunrise, Sun, Moon, Users, Mail, Lightbulb, Repeat, Check, Trash2, RotateCcw } from 'lucide-react'
import { diaApi } from '../lib'
import { Textarea, Select, Empty, FormNote } from '../ui'
import { Markdown } from '../md'
import './midia.css'

// El día, en orden. `desde` es la hora a partir de la cual «toca».
const MOMENTOS = [
  {
    tipo: 'manana', icon: Sunrise, desde: 0, cuando: 'Por la mañana',
    titulo: 'Qué mueve más el negocio hoy', boton: 'Priorizar el día', haciendo: 'Mirando tus tareas…',
    ayuda: 'Lee tus tareas abiertas y las llamadas de hoy. Añade lo que no esté apuntado.',
    placeholder: 'Opcional: lo que tienes en la cabeza y no está en Tareas.', opcional: true,
  },
  {
    tipo: 'mediodia', icon: Sun, desde: 13, cuando: 'A mediodía',
    titulo: 'Qué llevas hecho y qué sobra de la tarde', boton: 'Recortar la tarde', haciendo: 'Comparando con el plan…',
    ayuda: 'Lo compara con el plan de esta mañana y te dice qué se cae.',
    placeholder: 'Qué has hecho esta mañana, tal cual.',
  },
  {
    tipo: 'noche', icon: Moon, desde: 19, cuando: 'Por la noche',
    titulo: 'Qué ha salido bien, qué no, y el plan de mañana', boton: 'Planear mañana', haciendo: 'Cerrando el día…',
    ayuda: 'Lee el día entero y las llamadas de mañana, y te devuelve tres cosas en orden.',
    placeholder: 'Qué ha salido bien y qué no.',
  },
]

const HERRAMIENTAS = [
  {
    tipo: 'reunion', icon: Users, titulo: 'Preparar una reunión', boton: 'Dame tres preguntas', haciendo: 'Leyendo la ficha…',
    ayuda: 'Tres preguntas que no se te habrían ocurrido, con lo que HELM sabe de esa persona.',
    placeholder: 'Opcional: qué quieres sacar de la reunión.', opcional: true,
  },
  {
    tipo: 'correo', icon: Mail, titulo: 'Resumir un correo largo', boton: 'Resumir y qué contestar', haciendo: 'Leyendo el correo…',
    ayuda: 'El resumen en dos líneas y un borrador de respuesta.',
    placeholder: 'Pega aquí el correo.',
  },
  {
    tipo: 'idea', icon: Lightbulb, titulo: 'Poner a prueba una idea', boton: 'Dime por qué fallaría', haciendo: 'Buscándole las grietas…',
    ayuda: 'No la mejora: te dice por dónde se rompe y cómo comprobarlo barato.',
    placeholder: 'Cuenta la idea.',
  },
]

const SEMANA = {
  tipo: 'semana', icon: Repeat, titulo: 'En qué te estás repitiendo', boton: 'Releer la semana', haciendo: 'Releyendo la semana…',
  ayuda: 'Relee todo lo de los últimos siete días y señala lo que se repite.',
  placeholder: 'Opcional: algo que quieras que tenga en cuenta.', opcional: true,
}

const NOMBRE = {
  manana: 'Plan de la mañana', mediodia: 'Repaso de mediodía', noche: 'Cierre del día',
  reunion: 'Reunión', correo: 'Correo', idea: 'Idea', semana: 'Revisión semanal',
}

const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const diaLargo = (fecha) => new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

// Un ritual: cuenta algo, pulsa, lee lo que vuelve.
function Ritual({ def, clientId, hecho, llamadas, contexto, toca, onHecho }) {
  const [texto, setTexto] = useState('')
  const [callId, setCallId] = useState('')
  const [estado, setEstado] = useState(null)       // null | 'haciendo' | { error }
  const [rehacer, setRehacer] = useState(false)
  const Icono = def.icon
  const esReunion = def.tipo === 'reunion'
  const puede = def.opcional ? (!esReunion || callId || texto.trim()) : texto.trim().length > 0
  const mostrandoResultado = hecho && !rehacer

  async function hacer(e) {
    e.preventDefault()
    if (!puede) return
    setEstado('haciendo')
    try {
      const r = await diaApi.hacer(clientId, { tipo: def.tipo, entrada: texto, callId: callId || undefined })
      onHecho(r.entrada)
      setTexto(''); setCallId(''); setRehacer(false); setEstado(null)
    } catch (err) { setEstado({ error: err.message }) }
  }

  return (
    <section className={'helm-panel midia-ritual' + (toca ? ' toca' : '') + (mostrandoResultado ? ' hecho' : '')}>
      <header>
        <Icono size={18} />
        <div>
          {def.cuando && <small>{def.cuando}</small>}
          <h3>{def.titulo}</h3>
        </div>
        {mostrandoResultado && <span className="midia-ok"><Check size={13} /> {hora(hecho.created_at)}</span>}
      </header>

      {mostrandoResultado ? (
        <>
          {hecho.entrada && <p className="midia-dicho">{hecho.entrada}</p>}
          <Markdown text={hecho.salida} />
          <button type="button" className="midia-enlace" onClick={() => setRehacer(true)}>
            <RotateCcw size={13} /> {esReunion || def.tipo === 'correo' || def.tipo === 'idea' ? 'Otra' : 'Rehacer'}
          </button>
        </>
      ) : (
        <form onSubmit={hacer}>
          <p className="midia-ayuda">{def.ayuda}{contexto ? ` ${contexto}` : ''}</p>
          {esReunion && (
            <Select value={callId} onChange={e => setCallId(e.target.value)} aria-label="Llamada">
              <option value="">{llamadas.length ? 'Elige una llamada de hoy o mañana' : 'No hay llamadas hoy ni mañana: descríbela abajo'}</option>
              {llamadas.map(c => (
                <option key={c.id} value={c.id}>
                  {new Date(c.starts_at).toLocaleDateString('es-ES', { weekday: 'short' })} {hora(c.starts_at)} · {c.title}{c.conFicha ? '' : ' (sin ficha en el CRM)'}
                </option>
              ))}
            </Select>
          )}
          <Textarea
            value={texto} onChange={e => setTexto(e.target.value)} placeholder={def.placeholder}
            rows={def.tipo === 'correo' ? 6 : 3} aria-label={def.titulo}
          />
          <FormNote>{estado?.error}</FormNote>
          <div className="midia-pie">
            <button type="submit" className="helm-btn primary" disabled={!puede || estado === 'haciendo'}>
              {estado === 'haciendo' ? def.haciendo : def.boton}
            </button>
            {rehacer && <button type="button" className="helm-btn" onClick={() => setRehacer(false)}>Cancelar</button>}
          </div>
        </form>
      )}
    </section>
  )
}

export default function MiDia({ clientId }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(
    () => diaApi.resumen(clientId).then(setDatos).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])

  const onHecho = (fila) => setDatos(d => ({ ...d, entradas: [fila, ...d.entradas] }))
  async function borrar(id) {
    if (!window.confirm('¿Borrar esta entrada? La revisión semanal dejará de tenerla en cuenta.')) return
    await diaApi.borrar(clientId, id)
    setDatos(d => ({ ...d, entradas: d.entradas.filter(e => e.id !== id) }))
  }

  // La última entrada de hoy de cada tipo (vienen de más nueva a más vieja).
  const deHoy = useMemo(() => {
    const m = {}
    for (const e of datos?.entradas || []) if (e.fecha === datos.hoy && !m[e.tipo]) m[e.tipo] = e
    return m
  }, [datos])

  const anteriores = useMemo(() => {
    const porDia = new Map()
    for (const e of datos?.entradas || []) {
      if (e.fecha === datos.hoy && e.tipo !== 'correo' && e.tipo !== 'idea' && e.tipo !== 'reunion') continue
      if (e.fecha === datos.hoy && deHoy[e.tipo]?.id === e.id) continue
      if (!porDia.has(e.fecha)) porDia.set(e.fecha, [])
      porDia.get(e.fecha).push(e)
    }
    return [...porDia.entries()]
  }, [datos, deHoy])

  if (error && !datos) return <FormNote>{error}</FormNote>
  if (!datos) return <Empty>Cargando tu día…</Empty>

  // Qué momento «toca»: el último cuya hora ha llegado y que no está hecho.
  const h = new Date().getHours()
  const toca = [...MOMENTOS].reverse().find(m => h >= m.desde && !deHoy[m.tipo])?.tipo
  const nTareas = datos.tareas.length
  const hoyLlamadas = datos.llamadas.filter(c => new Date(c.starts_at).toDateString() === new Date().toDateString()).length
  const contextoManana = `Ahora mismo: ${nTareas} ${nTareas === 1 ? 'tarea abierta' : 'tareas abiertas'} y ${hoyLlamadas} ${hoyLlamadas === 1 ? 'llamada' : 'llamadas'} hoy.`

  return (
    <div className="midia">
      <div className="midia-cols">
        <div className="midia-dia">
          <h2>{diaLargo(datos.hoy)}</h2>
          {MOMENTOS.map(m => (
            <Ritual
              key={m.tipo} def={m} clientId={clientId} hecho={deHoy[m.tipo]} llamadas={datos.llamadas}
              contexto={m.tipo === 'manana' ? contextoManana : ''} toca={toca === m.tipo} onHecho={onHecho}
            />
          ))}
        </div>
        <div className="midia-lado">
          <h2>Cuando haga falta</h2>
          {HERRAMIENTAS.map(m => (
            <Ritual key={m.tipo} def={m} clientId={clientId} hecho={deHoy[m.tipo]} llamadas={datos.llamadas} onHecho={onHecho} />
          ))}
          <h2>Una vez a la semana</h2>
          <Ritual def={SEMANA} clientId={clientId} hecho={deHoy.semana} llamadas={[]} onHecho={onHecho} />
        </div>
      </div>

      {anteriores.length > 0 && (
        <section className="midia-antes">
          <h2>Lo anterior</h2>
          {anteriores.map(([fecha, filas]) => (
            <div key={fecha} className="midia-fecha">
              <h3>{fecha === datos.hoy ? 'Hoy' : diaLargo(fecha)}</h3>
              {filas.map(e => (
                <details key={e.id}>
                  <summary>
                    <b>{NOMBRE[e.tipo]}{e.meta?.titulo ? ` · ${e.meta.titulo}` : ''}</b>
                    <span>{hora(e.created_at)}</span>
                  </summary>
                  {e.entrada && <p className="midia-dicho">{e.entrada}</p>}
                  <Markdown text={e.salida} />
                  <button type="button" className="midia-enlace" onClick={() => borrar(e.id)}><Trash2 size={13} /> Borrar</button>
                </details>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
