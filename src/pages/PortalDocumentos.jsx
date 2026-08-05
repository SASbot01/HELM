// HELM — el portal donde el cliente de una asesoría sube su documentación.
//
// Se llega por /d/<token>, el enlace personal que le pasa su asesoría. Ve qué
// le falta por entregar y lo sube. Nada más: ni sesión, ni contraseña, ni
// registro — cada paso que le pongas delante es una factura que no llega.
//
// Va con la marca del despacho, no con la de HELM: para el cliente, esto es la
// web de su asesoría.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, Check, FileText, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useHelmTheme } from '../helm/theme'
import { useMarcaEnLaPestana } from '../helm/marcaPestana'
import { Marca } from '../helm/marcaPestana.jsx'
import '../helm/theme.css'

const TIPOS = [
  { key: 'factura_emitida', label: 'Facturas emitidas' },
  { key: 'factura_recibida', label: 'Facturas recibidas' },
  { key: 'extracto', label: 'Extractos bancarios' },
  { key: 'nomina', label: 'Nóminas' },
  { key: 'contrato', label: 'Contratos' },
  { key: 'otro', label: 'Otro' },
]

const MB = 25

export default function PortalDocumentos() {
  const { token } = useParams()
  const [theme] = useHelmTheme()
  const [estado, setEstado] = useState(null)      // null = cargando
  const [error, setError] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [tipo, setTipo] = useState('factura_recibida')
  const [obligacion, setObligacion] = useState('')
  const [hechos, setHechos] = useState([])

  useMarcaEnLaPestana(estado?.marca)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/documentos?action=estado&t=${encodeURIComponent(token)}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar')
      setEstado(d)
      if (d.pendientes?.length) setObligacion(d.pendientes[0].id)
    } catch (e) { setError(e.message); setEstado(false) }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  async function subir(ev) {
    const ficheros = [...(ev.target.files || [])]
    ev.target.value = ''
    if (!ficheros.length) return
    setSubiendo(true); setError(null)

    for (const f of ficheros) {
      try {
        if (f.size > MB * 1024 * 1024) throw new Error(`${f.name} pesa más de ${MB} MB`)
        // El fichero va del navegador al bucket directamente. La ruta lleva el
        // id del contacto para que el servidor pueda comprobar que nadie sube
        // a la carpeta de otro.
        const limpio = f.name.replace(/[^\w.\-() ]+/g, '_').slice(-120)
        const destino = `fiscal/${estado.ids.client}/${estado.ids.contacto}/${Date.now()}-${limpio}`
        const { error: errUp } = await supabase.storage.from('helm').upload(destino, f, {
          cacheControl: '3600', upsert: false,
        })
        if (errUp) throw new Error(errUp.message)

        const r = await fetch('/api/documentos?action=subir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            t: token, nombre: f.name, ruta: destino, tipo,
            obligacionId: obligacion || null,
          }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'No se pudo registrar')
        setHechos(h => [...h, f.name])
      } catch (e) {
        setError(e.message)
      }
    }
    setSubiendo(false)
    cargar()
  }

  if (estado === null) {
    return (
      <div className="helm helm-portal" data-theme={theme}>
        <div className="helm-portal-box"><Loader2 size={20} className="helm-spin" /></div>
      </div>
    )
  }

  if (estado === false) {
    return (
      <div className="helm helm-portal" data-theme={theme}>
        <div className="helm-portal-box">
          <AlertTriangle size={22} />
          <h1>No hemos podido abrir tu carpeta</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="helm" data-theme={theme}>
      <div className="helm-public">
        <Marca marca={estado.marca} />

        <div className="helm-panel" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 22, marginTop: 0 }}>
            Hola{estado.cliente?.nombre ? `, ${estado.cliente.nombre.split(' ')[0]}` : ''}
          </h1>
          <p className="helm-settings-lead">
            Sube aquí tus facturas y extractos. En cuanto los tengamos, nos ponemos con ello —
            no hace falta que nos escribas.
          </p>

          {estado.pendientes.length > 0 && (
            <>
              <div className="helm-drawer-section">Lo que nos falta</div>
              <div className="helm-leccion-list">
                {estado.pendientes.map(o => (
                  <label
                    key={o.id}
                    className={'helm-leccion-main' + (obligacion === o.id ? ' sel' : '')}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="radio" name="obl" value={o.id}
                      checked={obligacion === o.id}
                      onChange={() => setObligacion(o.id)}
                      style={{ marginRight: 10 }}
                    />
                    <span>
                      <b>Modelo {o.modelo} · {o.periodo}</b>
                      <small>
                        Vence el {new Date(`${o.fecha_limite}T00:00:00`).toLocaleDateString('es-ES')}
                        {o.estado === 'en_proceso' ? ' · ya nos has mandado algo' : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="helm-drawer-section">Subir documentos</div>
          <div className="helm-form-2">
            <label>
              <span className="helm-settings-note">Qué es lo que subes</span>
              <select className="helm-input" value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
          </div>

          <label className="helm-btn primary" style={{ marginTop: 12, cursor: 'pointer' }}>
            {subiendo ? <Loader2 size={15} className="helm-spin" /> : <Upload size={15} />}
            {subiendo ? 'Subiendo…' : 'Elegir archivos'}
            <input type="file" multiple hidden onChange={subir} disabled={subiendo} />
          </label>
          <p className="helm-settings-note">
            Puedes elegir varios a la vez. Hasta {MB} MB cada uno. Vale PDF, foto o Excel.
          </p>

          {error && <div className="helm-formerror" style={{ marginTop: 10 }}>{error}</div>}

          {hechos.length > 0 && (
            <div className="helm-settings-ok" style={{ marginTop: 12 }}>
              <Check size={15} /> Recibido: {hechos.join(', ')}
            </div>
          )}

          {estado.subidos.length > 0 && (
            <>
              <div className="helm-drawer-section">Lo que ya nos has mandado</div>
              <div className="helm-leccion-list">
                {estado.subidos.map(d => (
                  <div key={d.id} className="helm-leccion-main" style={{ cursor: 'default' }}>
                    <FileText size={15} />
                    <span>
                      <b>{d.nombre}</b>
                      <small>{new Date(d.subido_at).toLocaleDateString('es-ES')}</small>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
