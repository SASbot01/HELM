// HELM — Archivos: el cajón de documentos del perfil.
//
// Aquí acaba todo lo que no pertenece a una ficha concreta:
//   · lo que subes a mano (contratos, plantillas, lo que sea),
//   · lo que le pides al chat («guárdame esto como archivo»), que lo escribe la
//     propia IA con la acción `guardar_archivo`,
//   · las Biblias que salen del onboarding, que se archivan solas al generarse.
//
// El fichero vive en el bucket `helm` de Storage; esta tabla es la ficha, que
// es lo que permite buscarlo y saber de dónde salió.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, Trash2, ExternalLink, Copy, Check, FileText, Image as ImageIcon,
  Film, File, Search, Sparkles, Rocket, Hand,
} from 'lucide-react'
import {
  fetchRowsOrError, insertRow, deleteRow, uploadFile, deleteFile, publicUrl,
  humanSize, fmtDate, MAX_UPLOAD_MB, MISSING_TABLE,
} from '../lib'
import { Panel, Empty, Input, FormNote, Kpi } from '../ui'
import MigracionPendiente from '../MigracionPendiente'

// De dónde salió cada archivo. El icono importa más que la palabra: de un
// vistazo se ve qué ha hecho la IA y qué has puesto tú.
const ORIGENES = [
  { key: 'manual', label: 'Subidos', icon: Hand },
  { key: 'chat', label: 'Del chat', icon: Sparkles },
  { key: 'onboarding', label: 'Del onboarding', icon: Rocket },
]
const origenDe = (k) => ORIGENES.find(o => o.key === k) || ORIGENES[0]

const iconFor = (type = '', name = '') => {
  const t = String(type).toLowerCase()
  if (t.startsWith('image/')) return ImageIcon
  if (t.startsWith('video/')) return Film
  if (t.includes('pdf') || /\.(pdf|md|txt|docx?)$/i.test(name)) return FileText
  return File
}

export default function Archivos({ clientId }) {
  const [rows, setRows] = useState(null)
  const [faltaTabla, setFaltaTabla] = useState(false)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('all')
  const [carpeta, setCarpeta] = useState('General')
  const [subiendo, setSubiendo] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const load = () => fetchRowsOrError('helm_files', clientId, { order: 'created_at' })
    .then(({ rows: r, error: e }) => {
      setFaltaTabla(e === MISSING_TABLE)
      setRows(r || [])
      if (e && e !== MISSING_TABLE) setError(e)
    })

  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Las carpetas que ya existen, para el datalist. Sin inventario fijo: cada
  // negocio ordena sus cosas como quiere.
  const carpetas = useMemo(
    () => [...new Set(['General', ...(rows || []).map(r => r.folder || 'General')])].sort(),
    [rows],
  )

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows || []).filter(r => {
      if (filtro !== 'all' && (r.source || 'manual') !== filtro) return false
      if (!t) return true
      return `${r.name} ${r.note} ${r.folder}`.toLowerCase().includes(t)
    })
  }, [rows, q, filtro])

  const grupos = useMemo(() => {
    const g = {}
    for (const r of visibles) (g[r.folder || 'General'] = g[r.folder || 'General'] || []).push(r)
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]))
  }, [visibles])

  const cuenta = useMemo(() => {
    const c = { manual: 0, chat: 0, onboarding: 0 }
    for (const r of rows || []) c[r.source || 'manual'] = (c[r.source || 'manual'] || 0) + 1
    return c
  }, [rows])

  async function subir(e) {
    const files = [...(e.target.files || [])]
    // El input se limpia ya: si no, elegir el mismo archivo dos veces seguidas
    // no dispara el change y parece que se ha quedado colgado.
    e.target.value = ''
    if (!files.length) return
    setError(null)
    const nuevos = []
    for (const file of files) {
      setSubiendo(file.name)
      try {
        const subido = await uploadFile(clientId, 'archivos', file)
        nuevos.push(await insertRow('helm_files', {
          client_id: clientId,
          name: subido.name, path: subido.path, url: subido.url,
          type: subido.type, size: subido.size,
          folder: carpeta.trim() || 'General',
          source: 'manual',
        }))
      } catch (err) {
        setError(`${file.name}: ${err.message}`)
        break
      }
    }
    setSubiendo(null)
    if (nuevos.length) setRows(r => [...nuevos.reverse(), ...(r || [])])
  }

  async function borrar(f) {
    if (!confirm(`¿Borrar "${f.name}"? No se puede deshacer.`)) return
    setRows(r => r.filter(x => x.id !== f.id))
    try {
      await deleteRow('helm_files', f.id)
      // Borrar del almacén es best-effort: lo importante es que desaparezca de
      // la lista; un huérfano en el bucket no rompe nada.
      deleteFile(f.path)
    } catch (err) { setError('No se pudo borrar: ' + err.message); load() }
  }

  // Siempre desde la ruta: la `url` guardada puede venir del servidor, donde
  // Supabase se ve a sí mismo en 127.0.0.1 y ese enlace no abre desde fuera.
  const enlaceDe = (f) => publicUrl(f.path) || f.url

  function copiar(f) {
    navigator.clipboard?.writeText(enlaceDe(f))
    setCopiado(f.id)
    setTimeout(() => setCopiado(c => (c === f.id ? null : c)), 1600)
  }

  if (faltaTabla) return <MigracionPendiente seccion="Archivos" archivo="migrations/helm_archivos.sql" />

  return (
    <Panel
      title="Archivos del negocio"
      action={
        <div className="helm-arch-bar">
          <Input
            value={carpeta} onChange={e => setCarpeta(e.target.value)}
            placeholder="Carpeta" list="helm-carpetas" style={{ maxWidth: 150 }}
          />
          <datalist id="helm-carpetas">
            {carpetas.map(c => <option key={c} value={c} />)}
          </datalist>
          <input ref={inputRef} type="file" multiple hidden onChange={subir} />
          <button className="helm-btn primary" disabled={Boolean(subiendo)} onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> {subiendo ? `Subiendo ${subiendo}…` : 'Subir archivo'}
          </button>
        </div>
      }
    >
      <p className="helm-settings-lead">
        Lo que subes a mano, lo que le pides al chat y las Biblias del onboarding,
        todo en el mismo sitio. Hasta {MAX_UPLOAD_MB} MB por archivo.
      </p>

      <div className="helm-kpis">
        <Kpi label="Archivos" value={(rows || []).length} />
        <Kpi label="Subidos a mano" value={cuenta.manual} />
        <Kpi label="Generados por la IA" value={cuenta.chat + cuenta.onboarding} accent />
      </div>

      <div className="helm-crm-bar">
        <div className="helm-chips">
          <button className={'helm-chip' + (filtro === 'all' ? ' active' : '')} onClick={() => setFiltro('all')}>
            Todos
          </button>
          {ORIGENES.map(o => (
            <button key={o.key} className={'helm-chip' + (filtro === o.key ? ' active' : '')}
              onClick={() => setFiltro(o.key)}>
              <o.icon size={12} /> {o.label}
            </button>
          ))}
        </div>
        <div className="helm-crm-actions">
          <div className="helm-search">
            <Search size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o nota…" />
          </div>
        </div>
      </div>

      <FormNote>{error}</FormNote>

      {rows === null ? (
        <Empty>Cargando…</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          Todavía no hay archivos. Sube el primero, o pídele algo al chat:
          «guárdame este guion como archivo».
        </Empty>
      ) : visibles.length === 0 ? (
        <Empty>Ningún archivo coincide con eso.</Empty>
      ) : (
        grupos.map(([nombre, files]) => (
          <div key={nombre} className="helm-arch-grupo">
            <div className="helm-drawer-section">{nombre} · {files.length}</div>
            {files.map(f => {
              const Icon = iconFor(f.type, f.name)
              const org = origenDe(f.source)
              return (
                <div key={f.id} className="helm-arch-item">
                  <Icon size={16} />
                  <div className="helm-arch-main">
                    <a href={enlaceDe(f)} target="_blank" rel="noreferrer">
                      {f.name} <ExternalLink size={12} />
                    </a>
                    <small>
                      <span className={'helm-arch-src ' + org.key}><org.icon size={10} /> {org.label}</span>
                      {f.size ? ` · ${humanSize(f.size)}` : ''}
                      {` · ${fmtDate(f.created_at)}`}
                      {f.note ? ` · ${f.note}` : ''}
                    </small>
                  </div>
                  <div className="helm-arch-actions">
                    <button className="helm-btn" title="Copiar enlace" onClick={() => copiar(f)}>
                      {copiado === f.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <Trash2 size={15} className="helm-x" onClick={() => borrar(f)} />
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </Panel>
  )
}
