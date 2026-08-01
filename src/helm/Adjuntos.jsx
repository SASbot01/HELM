// HELM — adjuntar archivos a cualquier cosa.
//
// Sube al bucket 'helm' de Supabase Storage y devuelve la lista de adjuntos
// para guardarla en la fila que corresponda (una pieza de contenido, un
// documento de la biblioteca…). Sube de uno en uno y en serie: con varios a la
// vez, un fallo dejaba a medias los que ya habían entrado sin poder decir
// cuáles.
import { useRef, useState } from 'react'
import { Paperclip, X, FileText, Image as ImageIcon, Film, File, Link2 } from 'lucide-react'
import { uploadFile, deleteFile, humanSize, MAX_UPLOAD_MB } from './lib'
import { FormNote } from './ui'

const iconFor = (type = '', name = '') => {
  const t = type.toLowerCase()
  if (t.startsWith('image/')) return ImageIcon
  if (t.startsWith('video/')) return Film
  if (t.includes('pdf') || /\.pdf$/i.test(name)) return FileText
  return File
}

// Un enlace es un adjunto más (misma lista, mismo jsonb): lleva `kind: 'link'`
// y no tiene `path`, así que nunca se intenta borrar del bucket.
const esEnlace = (a) => a?.kind === 'link'

// Sin http:// delante, el navegador trataría "drive.google.com/…" como una ruta
// interna de la app y el enlace no llevaría a ninguna parte.
const normalizaUrl = (u) => {
  const s = String(u || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

// Para no obligar a escribir un nombre: si no lo ponen, se usa el dominio.
const nombreDeUrl = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u }
}

export default function Adjuntos({ clientId, carpeta, value = [], onChange, accept, enlaces = false }) {
  const [subiendo, setSubiendo] = useState(null)   // nombre del archivo en curso
  const [error, setError] = useState(null)
  const [nuevoEnlace, setNuevoEnlace] = useState(null)   // { url, name } mientras se escribe
  const inputRef = useRef(null)

  async function añadir(e) {
    const files = [...(e.target.files || [])]
    // El input se limpia ya: si no, elegir el mismo archivo dos veces seguidas
    // no dispara el change y parece que la app se ha quedado colgada.
    e.target.value = ''
    if (!files.length) return
    setError(null)

    const nuevos = []
    for (const file of files) {
      setSubiendo(file.name)
      try {
        nuevos.push(await uploadFile(clientId, carpeta, file))
      } catch (err) {
        setError(`${file.name}: ${err.message}`)
        break
      }
    }
    setSubiendo(null)
    if (nuevos.length) onChange([...(value || []), ...nuevos])
  }

  async function quitar(i) {
    const a = value[i]
    onChange(value.filter((_, j) => j !== i))
    // Borrar del almacén es best-effort: lo importante es que desaparezca de la
    // ficha; un huérfano en el bucket no rompe nada.
    deleteFile(a?.path)
  }

  function añadirEnlace() {
    const url = normalizaUrl(nuevoEnlace?.url)
    if (!url) return setError('Pega la dirección del enlace')
    setError(null)
    onChange([...(value || []), { kind: 'link', url, name: nuevoEnlace.name.trim() || nombreDeUrl(url) }])
    setNuevoEnlace(null)
  }

  return (
    <div className="helm-adj">
      <div className="helm-adj-list">
        {(value || []).map((a, i) => {
          const Icon = esEnlace(a) ? Link2 : iconFor(a.type, a.name)
          return (
            <div key={a.path || a.url || i} className="helm-adj-item">
              <Icon size={14} />
              <a href={a.url} target="_blank" rel="noreferrer" title={esEnlace(a) ? a.url : a.name}>{a.name}</a>
              {a.size ? <small>{humanSize(a.size)}</small> : null}
              <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${a.name}`}><X size={13} /></button>
            </div>
          )
        })}
      </div>

      {nuevoEnlace && (
        <div className="helm-adj-link-form">
          <input
            className="helm-input" autoFocus value={nuevoEnlace.url}
            placeholder="https://drive.google.com/…"
            onChange={e => setNuevoEnlace(s => ({ ...s, url: e.target.value }))}
            // Enter dentro del formulario de la ficha guardaría la ficha entera:
            // aquí solo tiene que añadir el enlace.
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); añadirEnlace() } }}
          />
          <input
            className="helm-input" value={nuevoEnlace.name}
            placeholder="Cómo se llama (opcional)"
            onChange={e => setNuevoEnlace(s => ({ ...s, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); añadirEnlace() } }}
          />
          <button type="button" className="helm-btn sm primary" onClick={añadirEnlace}>Añadir</button>
          <button type="button" className="helm-btn sm" onClick={() => { setNuevoEnlace(null); setError(null) }}>Cancelar</button>
        </div>
      )}

      <input ref={inputRef} type="file" multiple accept={accept} hidden onChange={añadir} />
      <button type="button" className="helm-btn sm" disabled={Boolean(subiendo)} onClick={() => inputRef.current?.click()}>
        <Paperclip size={13} />
        {subiendo ? `Subiendo ${subiendo}…` : 'Adjuntar archivo'}
      </button>
      {enlaces && !nuevoEnlace && (
        <button type="button" className="helm-btn sm" onClick={() => setNuevoEnlace({ url: '', name: '' })}>
          <Link2 size={13} /> Añadir enlace
        </button>
      )}
      <small className="helm-field-hint">
        Imágenes, vídeo o PDF · hasta {MAX_UPLOAD_MB} MB
        {enlaces ? ' · o un enlace a Drive, Notion, Figma…' : ''}
      </small>

      <FormNote>{error}</FormNote>
    </div>
  )
}
