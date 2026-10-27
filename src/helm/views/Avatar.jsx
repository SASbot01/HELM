// HELM — Avatar de ventas: a quién le vende de verdad el negocio, sacado del CRM.
//
// Una IA repasa los contactos del perfil uno a uno (api/_lib/avatar.js) y, con
// lo que hay en su ficha, dibuja el cliente tipo: género, edad, dónde vive, qué
// factura, qué le duele y dónde encontrar a más gente como él. No inventa: lo
// que no se deduce queda como «desconocido» y sale en los huecos.
//
// Ya no tiene entrada en el menú: es la pestaña «Avatar de ventas» del Informe.
// La raíz se llama `av-estudio` y no `helm-avatar` porque esa es la clase del
// circulito de 30 px con la inicial del usuario, y el tema la pisaba: la
// sección entera acababa metida en un círculo.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserSearch, RefreshCw, Sparkles, MapPin, Wallet, Users, CalendarRange, Lightbulb, Target, AlertTriangle, ChevronDown } from 'lucide-react'
import { avatarApi } from '../lib'
import { Empty } from '../ui'
import './avatar.css'

const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '')

export default function Avatar({ clientId }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(
    () => avatarApi.lista(clientId).then(d => { setDatos(d); setError(null) }).catch(e => setError(e.message)),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])
  // Mientras el estudio corre, se vuelve a mirar cada pocos segundos.
  useEffect(() => {
    if (!datos?.corriendo) return
    const t = setTimeout(cargar, 4000)
    return () => clearTimeout(t)
  }, [datos, cargar])

  async function estudiar() {
    setError(null)
    try {
      await avatarApi.ahora(clientId)
      setDatos(d => ({ ...(d || {}), corriendo: true, fallo: '' }))
    } catch (e) { setError(e.message) }
  }

  const est = datos?.estudio
  const r = est?.resumen
  const a = reparaAvatar(r?.avatar)
  const rep = r?.reparto

  const genero = useMemo(() => {
    const g = rep?.genero || {}
    const tot = (g.hombre || 0) + (g.mujer || 0) + (g.desconocido || 0)
    const pct = (n) => (tot ? Math.round((n / tot) * 100) : 0)
    return { tot, h: g.hombre || 0, m: g.mujer || 0, d: g.desconocido || 0, ph: pct(g.hombre || 0), pm: pct(g.mujer || 0), pd: pct(g.desconocido || 0) }
  }, [rep])

  if (error && !datos) return <Empty>{error}</Empty>
  if (!datos) return <Empty>Cargando el estudio…</Empty>

  return (
    <div className="av-estudio">
      <header className="av-cab">
        <div>
          <p className="av-cab-sub">
            {est
              ? <>Sacado de {est.n_analizados} de {est.n_contactos} contactos del CRM · {fecha(est.generado_en)}</>
              : 'Aún no has sacado tu avatar de ventas.'}
          </p>
        </div>
        <button className="av-btn" onClick={estudiar} disabled={datos.corriendo}>
          {datos.corriendo ? <><RefreshCw size={16} className="av-gira" /> Analizando…</> : <><UserSearch size={16} /> {est ? 'Actualizar el avatar' : 'Sacar mi avatar de ventas'}</>}
        </button>
      </header>

      {error && <div className="av-error">{error}</div>}
      {datos.fallo && !datos.corriendo && <div className="av-error">El último intento falló: {datos.fallo}</div>}

      {datos.corriendo && (
        <div className="av-corriendo">
          <Sparkles size={22} />
          <div><b>Analizando tus clientes, uno a uno…</b><span>Lee cada ficha del CRM y arma tu avatar de ventas. Puede tardar un par de minutos; puedes salir y volver.</span></div>
        </div>
      )}

      {!est && !datos.corriendo && (
        <div className="av-vacio">
          <UserSearch size={40} />
          <h2>¿A quién le vendes de verdad?</h2>
          <p>La IA repasa los contactos de tu CRM uno a uno y dibuja tu avatar de ventas: género, edad, dónde vive, qué factura, qué le duele y dónde hay más gente como él. Solo con lo que ya tienes en las fichas.</p>
          <button className="av-btn grande" onClick={estudiar}><UserSearch size={18} /> Sacar mi avatar de ventas</button>
        </div>
      )}

      {est && a && (
        <>
          <section className="av-retrato">
            <div className="av-retrato-ico"><Target size={26} /></div>
            <div>
              <p className="av-kicker">Tu avatar de ventas</p>
              <p className="av-descripcion">{a.descripcion}</p>
            </div>
          </section>

          <div className="av-tiles">
            <Tile icon={<Users size={16} />} label="Género dominante" valor={a.genero_dominante} />
            <Tile icon={<CalendarRange size={16} />} label="Edad típica" valor={a.edad_tipica} />
            <Tile icon={<MapPin size={16} />} label="Dónde vive" valor={a.ubicacion_tipica} />
            <Tile icon={<Wallet size={16} />} label="Factura / gasta" valor={a.facturacion_tipica} />
          </div>

          <div className="av-cols">
            <Lista icon={<AlertTriangle size={15} />} titulo="Qué le duele" items={a.dolores} tono="rojo" />
            <Lista icon={<Lightbulb size={15} />} titulo="Qué le mueve" items={a.motivaciones} tono="oro" />
          </div>

          <Lista icon={<Target size={15} />} titulo="Dónde encontrar a más gente así" items={a.donde_encontrarlos} ancho />

          {genero.tot > 0 && (
            <section className="av-panel">
              <h3>El reparto, en números</h3>
              <div className="av-genero">
                <div className="av-barra">
                  {genero.ph > 0 && <span className="h" style={{ width: `${genero.ph}%` }} />}
                  {genero.pm > 0 && <span className="m" style={{ width: `${genero.pm}%` }} />}
                  {genero.pd > 0 && <span className="d" style={{ width: `${genero.pd}%` }} />}
                </div>
                <div className="av-leyenda">
                  <span><i className="h" /> Hombres {genero.ph}%</span>
                  <span><i className="m" /> Mujeres {genero.pm}%</span>
                  {genero.pd > 0 && <span><i className="d" /> Sin dato {genero.pd}%</span>}
                </div>
              </div>
              <div className="av-rep-cols">
                <Top titulo="De dónde son" datos={rep?.ubicaciones} />
                <Top titulo="Por dónde entraron" datos={rep?.origenes} />
              </div>
            </section>
          )}

          {a.huecos?.length > 0 && (
            <section className="av-huecos">
              <h3><AlertTriangle size={15} /> Para afinar el avatar, te faltan datos</h3>
              <ul>{a.huecos.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </section>
          )}

          <section className="av-fichas">
            <button className="av-fichas-cab" onClick={() => setAbierto(v => !v)}>
              <span>Ver los {datos.fichas.length} clientes, uno a uno</span>
              <ChevronDown size={18} className={abierto ? 'abierto' : ''} />
            </button>
            {abierto && (
              <div className="av-tabla-wrap">
                <table className="av-tabla">
                  <thead><tr><th>Cliente</th><th>Género</th><th>Edad</th><th>Dónde</th><th>Factura</th><th>Perfil</th></tr></thead>
                  <tbody>
                    {datos.fichas.map((f, i) => (
                      <tr key={i}>
                        <td>{f.nombre || '—'}</td>
                        <td className={`av-g ${f.genero}`}>{f.genero === 'desconocido' ? '—' : f.genero}{f.genero !== 'desconocido' && f.genero_conf === 'baja' ? ' ?' : ''}</td>
                        <td>{f.edad_rango === 'desconocido' ? '—' : f.edad_rango}</td>
                        <td>{f.ubicacion === 'desconocido' ? '—' : f.ubicacion}</td>
                        <td>{f.facturacion === 'desconocido' ? '—' : f.facturacion}</td>
                        <td className="av-perfil">{f.perfil}{f.interes ? ` · ${f.interes}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Tile({ icon, label, valor }) {
  return (
    <div className="av-tile">
      <span className="av-tile-lbl">{icon} {label}</span>
      <b>{valor || '—'}</b>
    </div>
  )
}

// Algunos estudios guardados traen una lista como texto con «<item>…</item>» y
// las listas siguientes coladas dentro («</dolores><motivaciones>…»): el modelo
// a veces escribe así los parámetros. Antes eso tumbaba el panel entero. Se
// arregla al pintar (y api/_lib/anthropic.js ya lo repara al guardar).
const LISTAS_AVATAR = ['dolores', 'motivaciones', 'donde_encontrarlos', 'huecos']
const aLista = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v !== 'string') return []
  const items = [...v.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1].trim()).filter(Boolean)
  return items.length ? items : v.split(/\n+/).map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean)
}
function reparaAvatar(av) {
  if (!av || typeof av !== 'object') return av
  const out = { ...av }
  const textos = Object.values(av).filter(v => typeof v === 'string')
  for (const k of LISTAS_AVATAR) {
    if (out[k] == null || (Array.isArray(out[k]) && !out[k].length)) {
      for (const s of textos) { const m = s.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`)); if (m) { out[k] = m[1]; break } }
    }
    if (typeof out[k] === 'string') out[k] = out[k].split(new RegExp(`</${k}>|<\\/?(?:${LISTAS_AVATAR.join('|')})>`))[0]
    out[k] = aLista(out[k])
  }
  return out
}

function Lista({ icon, titulo, items, tono, ancho }) {
  items = aLista(items)
  if (!items.length) return null
  return (
    <section className={'av-lista' + (ancho ? ' ancho' : '') + (tono ? ` ${tono}` : '')}>
      <h3>{icon} {titulo}</h3>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </section>
  )
}

function Top({ titulo, datos }) {
  const lista = (datos || []).slice(0, 6)
  if (!lista.length) return null
  const max = Math.max(...lista.map(x => x.n), 1)
  return (
    <div className="av-top">
      <h4>{titulo}</h4>
      {lista.map((x, i) => (
        <div className="av-top-fila" key={i}>
          <span className="av-top-nombre">{x.nombre}</span>
          <span className="av-top-barra"><i style={{ width: `${Math.round((x.n / max) * 100)}%` }} /></span>
          <b>{x.n}</b>
        </div>
      ))}
    </div>
  )
}
