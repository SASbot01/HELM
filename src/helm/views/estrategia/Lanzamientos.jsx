// HELM — Estrategia / Lanzamientos: el playbook de cada lanzamiento como una
// herramienta, no como un documento. Selector de playbook arriba, navegación
// por secciones y, en el centro, los quince guiones: cinco anuncios y diez
// orgánicos, con su intención a la vista y el desarrollo entero a un clic.
//
// Los datos estáticos (lanzamientoData.js) son la BASE. Lo que el perfil
// cambia —un título, otra fecha, otro gancho, la tabla de tiempos— se guarda
// en helm_estrategia_overrides como un parche por guion y se aplica encima al
// cargar: `{...base, ...patch}`. Así el playbook puede mejorar en código sin
// pisar lo que el cliente ya había ajustado, y "Volver al original" es borrar
// la fila.
//
// Misma jerarquía que Estrategias.jsx (la pieza hermana, el evergreen): la
// definición fuera, el ejemplo dentro. Todo lo que dice qué es una pieza se ve
// sin clic; el pop-up se queda con los ganchos, los tiempos y el texto largo.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Layers, FileText, CalendarRange, Gauge, MessagesSquare, Megaphone, Instagram, Video,
  AlertTriangle, Pencil, CalendarPlus, RotateCcw, Check, Circle, Plus, Trash2, Loader2,
} from 'lucide-react'
import { supabase } from '../../lib'
import { Modal, Drawer, Field, Input, Textarea, FormNote } from '../../ui'
// Import de espacio de nombres a propósito: si al módulo le falta una
// exportación, llega como undefined en vez de romper el build. El fichero lo
// escribe otro proceso y este componente tiene que aguantar que venga a medias.
import * as datos from './lanzamientoData'

// ── Datos base, con red ────────────────────────────────────────────────────
const arr = (x) => (Array.isArray(x) ? x : [])
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})

const CARRIL_LABEL = obj(datos.CARRIL_LABEL).dar ? datos.CARRIL_LABEL : { dar: 'Dar', conectar: 'Conectar', vender: 'Vender' }
const LISTA = (arr(datos.LANZAMIENTO_LISTA).length ? arr(datos.LANZAMIENTO_LISTA) : Object.values(obj(datos.LANZAMIENTOS)))
  .filter(p => p && p.key)
const CARRIL_DOT = { dar: 'green', conectar: 'amber', vender: 'violet' }

// Campos de un guion que se pueden editar desde el cajón. Solo estos entran
// en el parche: el resto (familia, carril, formato…) es estructura del playbook.
const CAMPOS_EDITABLES = ['titulo', 'intencion', 'cta', 'fecha', 'ganchos', 'elegido', 'textoAnuncio', 'titular', 'boton', 'nota', 'tabla']

// Con qué `source` se marcan las piezas que salen de aquí. Contenido enseña
// "del chat" o "manual" según el valor; este es un tercer origen.
const SOURCE_CALENDARIO = 'estrategia'

const SECCIONES = [
  { key: 'resumen', label: 'Resumen', icon: Layers },
  { key: 'guiones', label: 'Los 15 guiones', icon: FileText },
  { key: 'calendario', label: 'Calendario', icon: CalendarRange },
  { key: 'numeros', label: 'Los números', icon: Gauge },
  { key: 'leads', label: 'Leads y DM', icon: MessagesSquare },
  { key: 'anuncios', label: 'Anuncios', icon: Megaphone },
  { key: 'stories', label: 'Stories', icon: Instagram },
  { key: 'webinar', label: 'Webinar', icon: Video },
  { key: 'riesgos', label: 'Riesgos', icon: AlertTriangle },
]

// ── Utilidades ─────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const pad = (n) => String(n).padStart(2, '0')
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const HOY = isoLocal(new Date())
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// '2026-09-15' → 'mar 15 sep'. Si no es una fecha ISO se devuelve tal cual:
// hay playbooks que dicen "Día 3" y eso también es una fecha para quien lo lee.
function fmtFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return iso || ''
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
}

// El playbook con el que se abre. Si el nombre del perfil casa con el de un
// playbook (por perfil o por nombre, sin tildes ni mayúsculas) se empieza en
// ese; si no, en el primero de la lista. Abrir "En Forma con Hugo" y ver el
// lanzamiento de otro cliente sería una pantalla equivocada.
function playbookInicial(client) {
  const n = norm(client?.name)
  if (n) {
    const hit = LISTA.find(p => {
      const candidatos = [p.perfil, p.nombre].map(norm).filter(Boolean)
      return candidatos.some(c => n.includes(c) || c.includes(n))
    })
    if (hit) return hit.key
  }
  return LISTA[0]?.key || null
}

// Lee un rango tipo "15–21 sep", "15 sep – 3 oct", "del 22 al 28 de
// septiembre" o con fechas ISO, y devuelve {desde, hasta} como Date. Si no
// encuentra ningún mes en el texto devuelve null: mejor no marcar nada que
// marcar la fase equivocada.
function parseRango(rango, anio) {
  const txt = String(rango || '')
  if (!txt) return null
  const fechas = []
  const isos = [...txt.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)]
  if (isos.length) {
    isos.forEach(m => fechas.push(new Date(+m[1], +m[2] - 1, +m[3])))
  } else {
    const tokens = [...txt.matchAll(/(\d{1,2})(?!\d)(?:\s*(?:de\s+)?([a-záéíóúñ]+))?/gi)]
      .map(m => {
        const palabra = norm(m[2])
        const mes = palabra ? MESES.findIndex(mm => palabra.startsWith(mm)) : -1
        return { dia: +m[1], mes, tieneMes: mes >= 0, palabra }
      })
      // "2 semanas" no es una fecha: un número seguido de una palabra que no es
      // un mes se descarta. Un número suelto sí vale ("15–21 sep").
      .filter(t => t.tieneMes || !t.palabra)
    if (!tokens.some(t => t.tieneMes)) return null
    // Un día sin mes hereda el mes del siguiente que sí lo tenga.
    for (let i = tokens.length - 1, mes = -1; i >= 0; i--) {
      if (tokens[i].tieneMes) mes = tokens[i].mes
      else tokens[i].mes = mes
    }
    tokens.filter(t => t.mes >= 0).forEach(t => fechas.push(new Date(anio, t.mes, t.dia)))
  }
  if (!fechas.length) return null
  const desde = fechas[0]
  let hasta = fechas[fechas.length - 1]
  if (hasta < desde) hasta = new Date(hasta.getFullYear() + 1, hasta.getMonth(), hasta.getDate())
  return { desde, hasta }
}

// 'pasada' | 'actual' | 'futura' | null (no se pudo leer el rango).
function estadoFase(fase, anio) {
  const r = parseRango(fase?.rango, anio)
  if (!r) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  if (hoy < r.desde) return 'futura'
  if (hoy > r.hasta) return 'pasada'
  return 'actual'
}

const ESTADO_FASE_LABEL = { pasada: 'Hecha', actual: 'Ahora', futura: 'Próxima' }

// Título con el que la pieza entra en el calendario. Es también la clave con
// la que se comprueba si ya estaba: el id delante evita que dos guiones con
// el mismo título se pisen.
const tituloPieza = (g) => `${g.id} · ${g.titulo || 'Sin título'}`

// El guion en Markdown, para el `body` de la pieza del calendario. Lleva lo
// que necesita quien graba: gancho, tiempos y nota. El texto del anuncio va
// al final porque solo lo usa quien monta la campaña.
function guionMarkdown(g) {
  const ganchos = arr(g.ganchos)
  const elegido = ganchos[g.elegido ?? 0] || ganchos[0]
  const L = []
  L.push(`# ${g.id} · ${g.titulo || ''}`)
  L.push('')
  const meta = [g.formato, g.duracion, g.carril && CARRIL_LABEL[g.carril], g.publica].filter(Boolean).join(' · ')
  if (meta) L.push(`_${meta}_`)
  if (g.intencion) L.push('', `**Intención:** ${g.intencion}`)
  if (g.cta) L.push(`**CTA:** ${g.cta}`)
  if (ganchos.length) {
    L.push('', '## Gancho')
    if (elegido) L.push(`«${elegido.texto}»${elegido.familia ? ` — ${elegido.familia}` : ''}`)
    const otros = ganchos.filter(x => x !== elegido)
    if (otros.length) {
      L.push('', 'Alternativas:')
      otros.forEach(x => L.push(`- «${x.texto}»${x.familia ? ` — ${x.familia}` : ''}`))
    }
    if (g.porQue) L.push('', `_${g.porQue}_`)
  }
  if (arr(g.tabla).length) {
    L.push('', '## Tiempos')
    arr(g.tabla).forEach(f => L.push(`- **${f.paso || ''}** — ${f.t || ''}: ${f.dice || ''}${f.ve ? ` / _${f.ve}_` : ''}`))
  }
  if (g.tipo === 'anuncio' && (g.textoAnuncio || g.titular || g.boton)) {
    L.push('', '## Anuncio')
    if (g.textoAnuncio) L.push(g.textoAnuncio, '')
    if (g.titular) L.push(`**Titular:** ${g.titular}`)
    if (g.boton) L.push(`**Botón:** ${g.boton}`)
  }
  if (g.nota) L.push('', `> ${g.nota}`)
  return L.join('\n')
}

// Solo lo que cambia respecto a la base entra en el parche. Comparar por JSON
// es suficiente: los valores son texto, números y listas pequeñas.
function diffGuion(base, editado) {
  const patch = {}
  CAMPOS_EDITABLES.forEach(k => {
    if (JSON.stringify(editado[k] ?? null) !== JSON.stringify(base[k] ?? null)) patch[k] = editado[k]
  })
  return patch
}

// ── Piezas pequeñas ────────────────────────────────────────────────────────
function CarrilBadge({ carril }) {
  return <span className={'helm-est-dot ' + (CARRIL_DOT[carril] || '')} />
}

// Tabla genérica con scroll propio: cols = [{ key, label, mono?, bold?, render? }].
function Tabla({ cols, rows, className, minWidth }) {
  const filas = arr(rows)
  if (!filas.length) return null
  return (
    <div className="helm-est-table-wrap">
      <table className={'helm-est-table helm-lanz-table ' + (className || '')} style={minWidth ? { minWidth } : undefined}>
        <thead><tr>{cols.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {filas.map((r, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c.key} className={(c.mono ? 'mono ' : '') + (c.bold ? 'bold' : '')}>
                  {c.render ? c.render(r) : r?.[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Vacio({ children }) {
  return <p className="helm-est-note helm-lanz-vacio">{children || 'Este playbook aún no tiene esta sección.'}</p>
}

// ── Vista ──────────────────────────────────────────────────────────────────
export default function Lanzamientos({ clientId, client }) {
  const [pbKey, setPbKey] = useState(() => playbookInicial(client))
  const base = useMemo(() => LISTA.find(p => p.key === pbKey) || LISTA[0] || null, [pbKey])

  const [seccion, setSeccion] = useState('resumen')
  const [overrides, setOverrides] = useState({})     // item_id → patch
  const [faltaTabla, setFaltaTabla] = useState(false) // helm_estrategia_overrides.sql sin aplicar
  const [piezas, setPiezas] = useState([])           // lo que ya está en el calendario, salido de aquí
  const [aviso, setAviso] = useState(null)           // { tone, texto }
  const [ocupado, setOcupado] = useState(false)
  const [detalle, setDetalle] = useState(null)       // id del guion abierto en el pop-up
  const [editando, setEditando] = useState(null)     // id del guion abierto en el cajón

  const cargarOverrides = useCallback(async () => {
    if (!clientId || !base) return
    const { data, error } = await supabase.from('helm_estrategia_overrides')
      .select('item_id, patch').eq('client_id', clientId).eq('playbook', base.key)
    if (error) {
      // Sin la tabla se enseña la base tal cual, y se avisa de qué falta.
      setFaltaTabla(/does not exist|schema cache/i.test(error.message))
      setOverrides({})
      return
    }
    setFaltaTabla(false)
    setOverrides(Object.fromEntries((data || []).map(r => [r.item_id, obj(r.patch)])))
  }, [clientId, base])

  const cargarPiezas = useCallback(async () => {
    if (!clientId) return
    const { data } = await supabase.from('helm_content_calendar')
      .select('id, title, date, status').eq('client_id', clientId).eq('source', SOURCE_CALENDARIO)
    setPiezas(data || [])
  }, [clientId])

  useEffect(() => { cargarOverrides() }, [cargarOverrides])
  useEffect(() => { cargarPiezas() }, [cargarPiezas])

  // Base + parches. Las secciones enteras (si algún día se guardan) se funden
  // igual que los guiones; hoy solo se editan guiones desde la interfaz.
  const data = useMemo(() => {
    if (!base) return null
    const d = { ...base }
    Object.entries(overrides).forEach(([k, patch]) => {
      if (k in base && typeof base[k] === 'object' && !Array.isArray(base[k])) d[k] = { ...base[k], ...patch }
    })
    return d
  }, [base, overrides])

  const guiones = useMemo(() => arr(base?.guiones).filter(g => g && g.id).map(g => {
    const patch = overrides[g.id]
    // `grabado` no es parte del guion: es un estado de producción que también
    // vive en el parche, así que no cuenta como "editado".
    const { grabado, ...resto } = patch || {}
    return { ...g, ...resto, _grabado: Boolean(grabado), _editado: Object.keys(resto).length > 0 }
  }), [base, overrides])

  const enCalendario = useMemo(() => new Set(piezas.map(p => p.title + '|' + p.date)), [piezas])
  const estaEnCalendario = (g) => enCalendario.has(tituloPieza(g) + '|' + g.fecha)

  // Año de referencia para leer los rangos de las fases ("15–21 sep" no dice
  // el año): el de la primera fecha de guion que haya.
  const anio = useMemo(() => {
    const f = guiones.map(g => g.fecha).find(x => /^\d{4}-/.test(String(x || '')))
    return f ? +f.slice(0, 4) : new Date().getFullYear()
  }, [guiones])

  // ── Guardar / borrar parches ──────────────────────────────────────────────
  async function guardarPatch(itemId, patch) {
    if (!clientId || !base) return
    setOcupado(true)
    try {
      if (!patch || !Object.keys(patch).length) {
        const { error } = await supabase.from('helm_estrategia_overrides').delete()
          .eq('client_id', clientId).eq('playbook', base.key).eq('item_id', itemId)
        if (error) throw error
        setOverrides(o => { const n = { ...o }; delete n[itemId]; return n })
      } else {
        const { error } = await supabase.from('helm_estrategia_overrides').upsert(
          { client_id: clientId, playbook: base.key, item_id: itemId, patch, updated_at: new Date().toISOString() },
          { onConflict: 'client_id,playbook,item_id' },
        )
        if (error) throw error
        setOverrides(o => ({ ...o, [itemId]: patch }))
      }
    } catch (e) {
      const falta = /does not exist|schema cache/i.test(e.message || '')
      setFaltaTabla(falta)
      setAviso({ tone: 'error', texto: falta ? 'Falta aplicar migrations/helm_estrategia_overrides.sql para poder guardar cambios.' : (e.message || 'No se pudo guardar') })
    } finally {
      setOcupado(false)
    }
  }

  async function toggleGrabado(g) {
    const actual = { ...(overrides[g.id] || {}) }
    if (actual.grabado) delete actual.grabado
    else actual.grabado = true
    await guardarPatch(g.id, actual)
  }

  // ── Volcar al calendario ──────────────────────────────────────────────────
  // Antes de insertar se mira qué hay ya con ese título y esa fecha en el
  // perfil (venga de donde venga), y solo entran las que faltan.
  async function volcar(lista) {
    if (!clientId) return
    const conFecha = lista.filter(g => /^\d{4}-\d{2}-\d{2}$/.test(String(g.fecha || '')))
    const sinFecha = lista.length - conFecha.length
    if (!conFecha.length) { setAviso({ tone: 'warn', texto: 'Ninguno de estos guiones tiene fecha: ponle una desde «Editar» antes de volcarlo.' }); return }
    setOcupado(true)
    try {
      const titulos = conFecha.map(tituloPieza)
      const { data: existentes, error: e1 } = await supabase.from('helm_content_calendar')
        .select('id, title, date').eq('client_id', clientId).in('title', titulos)
      if (e1) throw e1
      const ya = new Set((existentes || []).map(x => x.title + '|' + x.date))
      const nuevas = conFecha.filter(g => !ya.has(tituloPieza(g) + '|' + g.fecha)).map(g => ({
        client_id: clientId, title: tituloPieza(g), date: g.fecha, format: 'reel',
        body: guionMarkdown(g), status: 'todo', source: SOURCE_CALENDARIO,
      }))
      if (nuevas.length) {
        const { error: e2 } = await supabase.from('helm_content_calendar').insert(nuevas)
        if (e2) throw e2
      }
      const partes = [`${nuevas.length} ${nuevas.length === 1 ? 'pieza creada' : 'piezas creadas'}`]
      const yaEstaban = conFecha.length - nuevas.length
      if (yaEstaban) partes.push(`${yaEstaban} ya ${yaEstaban === 1 ? 'estaba' : 'estaban'}`)
      if (sinFecha) partes.push(`${sinFecha} sin fecha (no se ${sinFecha === 1 ? 'ha volcado' : 'han volcado'})`)
      setAviso({ tone: nuevas.length ? 'ok' : 'warn', texto: partes.join(' · ') })
      cargarPiezas()
    } catch (e) {
      setAviso({ tone: 'error', texto: e.message || 'No se pudo volcar al calendario' })
    } finally {
      setOcupado(false)
    }
  }

  if (!LISTA.length || !data) {
    return (
      <div className="helm-lanz">
        <Vacio>Aún no hay ningún playbook de lanzamiento cargado. Cuando exista <code>lanzamientoData.js</code> aparecerá aquí.</Vacio>
      </div>
    )
  }

  const guionDetalle = detalle ? guiones.find(g => g.id === detalle) : null
  const guionEditando = editando ? guiones.find(g => g.id === editando) : null
  const baseEditando = editando ? arr(base.guiones).find(g => g?.id === editando) : null

  return (
    <div className="helm-lanz">
      {/* Selector de playbook: uno por lanzamiento. Cambiarlo recarga los parches. */}
      <div className="helm-lanz-top">
        <div className="helm-lanz-pbs">
          {LISTA.map(p => (
            <button key={p.key} type="button" className={'helm-lanz-pb' + (p.key === base.key ? ' active' : '')}
              onClick={() => { setPbKey(p.key); setDetalle(null); setEditando(null); setAviso(null) }}>
              <b>{p.nombre || p.key}</b>
              {p.perfil && <span>{p.perfil}</span>}
            </button>
          ))}
        </div>
        {ocupado && <span className="helm-lanz-busy"><Loader2 size={13} className="helm-lanz-spin" /> Guardando…</span>}
      </div>

      {faltaTabla && (
        <FormNote tone="warn">
          Falta aplicar <code>migrations/helm_estrategia_overrides.sql</code>: se enseña el playbook original y no se pueden guardar cambios.
        </FormNote>
      )}
      {aviso && (
        <div className={'helm-lanz-aviso ' + aviso.tone} role="status">
          <span>{aviso.texto}</span>
          <button type="button" className="helm-lanz-aviso-x" onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <div className="helm-chips helm-est-nav">
        {SECCIONES.map(s => {
          const Icon = s.icon
          return (
            <button key={s.key} className={'helm-chip' + (seccion === s.key ? ' active' : '')} onClick={() => setSeccion(s.key)}>
              <Icon size={12} /> {s.label}
            </button>
          )
        })}
      </div>

      {seccion === 'resumen' && <Resumen data={data} />}
      {seccion === 'guiones' && (
        <Guiones
          guiones={guiones} nota={data.guionesNota} ocupado={ocupado}
          estaEnCalendario={estaEnCalendario}
          onAbrir={setDetalle} onEditar={setEditando} onVolcar={volcar} onGrabado={toggleGrabado}
        />
      )}
      {seccion === 'calendario' && <Calendario data={data} anio={anio} />}
      {seccion === 'numeros' && <Numeros data={data} />}
      {seccion === 'leads' && <Leads data={data} />}
      {seccion === 'anuncios' && <Anuncios data={data} />}
      {seccion === 'stories' && <Stories data={data} />}
      {seccion === 'webinar' && <Webinar data={data} />}
      {seccion === 'riesgos' && <Riesgos data={data} />}

      {guionDetalle && (
        <Modal title={`${guionDetalle.id} · ${guionDetalle.titulo || ''}`} onClose={() => setDetalle(null)} wide>
          <DetalleGuion
            g={guionDetalle} enCalendario={estaEnCalendario(guionDetalle)} ocupado={ocupado}
            onEditar={() => { setDetalle(null); setEditando(guionDetalle.id) }}
            onVolcar={() => volcar([guionDetalle])}
          />
        </Modal>
      )}

      {guionEditando && baseEditando && (
        <EditorGuion
          key={guionEditando.id}
          base={baseEditando} actual={guionEditando} ocupado={ocupado} soloLectura={faltaTabla}
          onClose={() => setEditando(null)}
          onSave={async (editado) => {
            const patch = diffGuion(baseEditando, editado)
            if (overrides[guionEditando.id]?.grabado) patch.grabado = true
            await guardarPatch(guionEditando.id, patch)
            setEditando(null)
          }}
          onReset={async () => {
            // Volver al original conserva "grabado": es estado de producción,
            // no un cambio de texto.
            const grabado = overrides[guionEditando.id]?.grabado
            await guardarPatch(guionEditando.id, grabado ? { grabado: true } : {})
            setEditando(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resumen: hero, reglas, ficha, cambios y la comparativa de modelos.
function Resumen({ data }) {
  const reglas = arr(data.reglas)
  const ficha = arr(data.ficha)
  const cambios = arr(data.cambios)
  const modelos = arr(data.modelos)
  return (
    <div className="helm-est-section">
      <div className="helm-lanz-hero">
        <div className="helm-est-hero">
          {data.kicker && <div className="helm-est-kicker">{data.kicker}</div>}
          <h2>{data.titulo || data.nombre}</h2>
          {data.subtitulo && <p>{data.subtitulo}</p>}
          {arr(data.chips).length > 0 && (
            <div className="helm-est-tags">{arr(data.chips).map((c, i) => <span key={i} className="helm-chip">{c}</span>)}</div>
          )}
        </div>
        {ficha.length > 0 && (
          <div className="helm-card helm-lanz-ficha">
            <div className="helm-lanz-ficha-t">Ficha</div>
            <table>
              <tbody>
                {ficha.map((f, i) => <tr key={i}><th>{f.dato}</th><td>{f.valor}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reglas.length > 0 && (
        <>
          <h3 className="helm-est-h3">Lo que no se negocia</h3>
          <p className="helm-est-note">Cada regla lleva su porqué al lado. Una regla sin porqué es una opinión.</p>
          <div className="helm-est-reglas">
            {reglas.map((r, i) => (
              <div key={i} className="helm-est-regla">
                <span className="helm-est-regla-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="helm-est-regla-txt">
                  <span className="helm-est-regla-t helm-lanz-regla-t">{r.regla}</span>
                  <span className="helm-est-regla-porque">{r.porque}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {cambios.length > 0 && (
        <>
          <h3 className="helm-est-h3">Lo que cambia respecto al lanzamiento anterior</h3>
          <div className="helm-lanz-cambios">
            {cambios.map((c, i) => (
              <div key={i} className="helm-card helm-lanz-cambio">
                <span className="helm-lanz-cambio-n">{i + 1}</span>
                <b>{c.titulo}</b>
                <p>{c.texto}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {modelos.length > 0 && (
        <>
          <h3 className="helm-est-h3">Los modelos sobre la mesa — y el elegido</h3>
          <div className="helm-lanz-modelos">
            {modelos.map((m, i) => (
              <div key={i} className={'helm-card helm-lanz-modelo' + (m.elegido ? ' elegido' : '')}>
                {m.elegido && <span className="helm-lanz-modelo-flag"><Check size={11} /> Elegido</span>}
                <b>{m.modelo}</b>
                <p className="helm-lanz-modelo-como">{m.como}</p>
                <dl>
                  {m.exige && <><dt>Exige</dt><dd>{m.exige}</dd></>}
                  {m.da && <><dt>Da</dt><dd>{m.da}</dd></>}
                  {m.encaja && <><dt>Encaja</dt><dd>{m.encaja}</dd></>}
                </dl>
              </div>
            ))}
          </div>
          {data.modelosNota && <p className="helm-est-note callout">{data.modelosNota}</p>}
        </>
      )}

      {!reglas.length && !ficha.length && !cambios.length && !modelos.length && <Vacio />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Los 15 guiones: la sección principal.
function Guiones({ guiones, nota, ocupado, estaEnCalendario, onAbrir, onEditar, onVolcar, onGrabado }) {
  const [fTipo, setFTipo] = useState('todos')
  const [fCarril, setFCarril] = useState('todos')
  const [soloPendientes, setSoloPendientes] = useState(false)

  const visibles = guiones.filter(g =>
    (fTipo === 'todos' || g.tipo === fTipo)
    && (fCarril === 'todos' || g.carril === fCarril)
    && (!soloPendientes || !g._grabado),
  )
  const anuncios = visibles.filter(g => g.tipo === 'anuncio')
  const organicos = visibles.filter(g => g.tipo !== 'anuncio')
  const pendientes = guiones.filter(g => !g._grabado).length

  if (!guiones.length) return <div className="helm-est-section"><Vacio>Este playbook aún no tiene guiones.</Vacio></div>

  return (
    <div className="helm-est-section">
      <div className="helm-lanz-filtros">
        <div className="helm-segmented">
          {[['todos', 'Todos'], ['anuncio', 'Anuncios'], ['organico', 'Orgánicos']].map(([k, l]) => (
            <button key={k} type="button" className={fTipo === k ? 'on' : ''} onClick={() => setFTipo(k)}>{l}</button>
          ))}
        </div>
        <div className="helm-segmented">
          <button type="button" className={fCarril === 'todos' ? 'on' : ''} onClick={() => setFCarril('todos')}>Todo carril</button>
          {Object.keys(CARRIL_LABEL).map(k => (
            <button key={k} type="button" className={fCarril === k ? 'on' : ''} onClick={() => setFCarril(k)}>
              <CarrilBadge carril={k} /> {CARRIL_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="helm-lanz-check">
          <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
          Pendientes de grabar <span className="helm-lanz-count">{pendientes}</span>
        </label>
        <button type="button" className="helm-btn sm helm-lanz-volcar-todo" disabled={ocupado || !visibles.length} onClick={() => onVolcar(visibles)}>
          <CalendarPlus /> Volcar {visibles.length === guiones.length ? 'los 15' : `estos ${visibles.length}`} al calendario
        </button>
      </div>

      {[{ key: 'anuncio', titulo: `${anuncios.length} ${anuncios.length === 1 ? 'anuncio' : 'anuncios'}`, sub: 'Pagados. Se graban primero: son los que traen registros.', lista: anuncios },
        { key: 'organico', titulo: `${organicos.length} ${organicos.length === 1 ? 'orgánico' : 'orgánicos'}`, sub: 'Los que sostienen la cuenta mientras dura el lanzamiento.', lista: organicos }]
        .filter(b => b.lista.length)
        .map(b => (
          <div key={b.key} className="helm-lanz-bloque">
            <div className="helm-lanz-bloque-head">
              <div>
                <h3 className="helm-est-h3">{b.titulo}</h3>
                <p className="helm-est-note">{b.sub}</p>
              </div>
              <button type="button" className="helm-btn sm" disabled={ocupado} onClick={() => onVolcar(b.lista)}>
                <CalendarPlus /> Volcar este bloque
              </button>
            </div>
            <div className="helm-lanz-guiones">
              {b.lista.map(g => (
                <TarjetaGuion
                  key={g.id} g={g} enCalendario={estaEnCalendario(g)} ocupado={ocupado}
                  onAbrir={() => onAbrir(g.id)} onEditar={() => onEditar(g.id)}
                  onVolcar={() => onVolcar([g])} onGrabado={() => onGrabado(g)}
                />
              ))}
            </div>
          </div>
        ))}

      {!visibles.length && <Vacio>Ningún guion cumple estos filtros.</Vacio>}
      {nota && <p className="helm-est-note callout">{nota}</p>}
    </div>
  )
}

// Todo lo que define la pieza se ve aquí sin clic: id, título, formato,
// duración, cuándo sale, CTA e intención. El clic abre el desarrollo.
function TarjetaGuion({ g, enCalendario, ocupado, onAbrir, onEditar, onVolcar, onGrabado }) {
  return (
    <div className={'helm-card helm-lanz-guion ' + (CARRIL_DOT[g.carril] || '') + (g._editado ? ' editada' : '') + (g._grabado ? ' grabada' : '')}>
      <button type="button" className="helm-lanz-guion-open" onClick={onAbrir}>
        <div className="helm-lanz-guion-head">
          <span className="helm-lanz-id">{g.id}</span>
          <span className={'helm-lanz-tipo ' + (g.tipo === 'anuncio' ? 'anuncio' : 'organico')}>{g.tipo === 'anuncio' ? 'Anuncio' : 'Orgánico'}</span>
          <span className="helm-lanz-flags">
            {g._editado && <span className="helm-lanz-flag editado">editado</span>}
            {enCalendario && <span className="helm-lanz-flag cal">en calendario</span>}
            {g._grabado && <span className="helm-lanz-flag ok">grabado</span>}
          </span>
        </div>
        <div className="helm-lanz-guion-t">{g.titulo || 'Sin título'}</div>
        <div className="helm-lanz-guion-meta">
          {g.formato && <span>{g.formato}</span>}
          {g.duracion && <span className="mono">{g.duracion}</span>}
          {(g.fecha || g.publica) && <span>{[fmtFecha(g.fecha), g.publica].filter(Boolean).join(' · ')}</span>}
        </div>
        {g.intencion && <p className="helm-lanz-guion-int">{g.intencion}</p>}
        {g.cta && <div className="helm-lanz-guion-cta"><span>CTA</span>{g.cta}</div>}
        <div className="helm-lanz-guion-pie">
          <CarrilBadge carril={g.carril} />
          <span>{CARRIL_LABEL[g.carril] || g.carril}</span>
          {g.familia && <span className="sep">·</span>}
          {g.familia && <span>{g.familia}</span>}
          {g.audiencia && <span className="aud">{g.audiencia}</span>}
        </div>
      </button>
      <div className="helm-lanz-guion-acts">
        <button type="button" className="helm-btn sm" onClick={onEditar}><Pencil /> Editar</button>
        <button type="button" className="helm-btn sm" disabled={ocupado} onClick={onVolcar} title={enCalendario ? 'Ya está en el calendario' : 'Crear la pieza en Guiones'}>
          <CalendarPlus /> Al calendario
        </button>
        <button type="button" className={'helm-btn sm helm-lanz-grabado' + (g._grabado ? ' on' : '')} disabled={ocupado} onClick={onGrabado}>
          {g._grabado ? <Check /> : <Circle />} {g._grabado ? 'Grabado' : 'Marcar grabado'}
        </button>
      </div>
    </div>
  )
}

// El desarrollo: ganchos con el elegido marcado, porqué, tiempos, y en los
// anuncios el texto de la campaña.
function DetalleGuion({ g, enCalendario, ocupado, onEditar, onVolcar }) {
  const ganchos = arr(g.ganchos)
  const elegido = g.elegido ?? 0
  const tabla = arr(g.tabla)
  return (
    <div className="helm-lanz-detalle">
      <div className="helm-est-modal-sub">
        {[g.tipo === 'anuncio' ? 'Anuncio' : 'Orgánico', g.formato, g.duracion, CARRIL_LABEL[g.carril], fmtFecha(g.fecha), g.publica].filter(Boolean).join(' · ')}
      </div>
      <div className="helm-est-modal-body">
        {(g._editado || enCalendario || g._grabado) && (
          <div className="helm-lanz-flags">
            {g._editado && <span className="helm-lanz-flag editado">editado</span>}
            {enCalendario && <span className="helm-lanz-flag cal">en calendario</span>}
            {g._grabado && <span className="helm-lanz-flag ok">grabado</span>}
          </div>
        )}
        {g.intencion && <p><b>Intención</b> — {g.intencion}</p>}
        <div className="helm-lanz-detalle-meta">
          {g.familia && <span><small>Familia</small>{g.familia}</span>}
          {g.audiencia && <span><small>Audiencia</small>{g.audiencia}</span>}
          {g.cta && <span><small>CTA</small>{g.cta}</span>}
          {arr(g.etiquetas).length > 0 && <span><small>Etiquetas</small>{arr(g.etiquetas).join(', ')}</span>}
        </div>

        {ganchos.length > 0 && (
          <>
            <h4 className="helm-lanz-h4">Los tres ganchos</h4>
            <div className="helm-lanz-ganchos">
              {ganchos.map((h, i) => (
                <div key={i} className={'helm-lanz-gancho' + (i === elegido ? ' elegido' : '')}>
                  <span className="helm-lanz-gancho-n">{i === elegido ? <Check size={12} /> : i + 1}</span>
                  <span className="helm-lanz-gancho-txt">
                    <span className="helm-lanz-gancho-t">«{h.texto}»</span>
                    {h.familia && <span className="helm-lanz-gancho-f">{h.familia}</span>}
                  </span>
                </div>
              ))}
            </div>
            {g.porQue && <p className="helm-est-note callout">{g.porQue}</p>}
          </>
        )}

        {tabla.length > 0 && (
          <>
            <h4 className="helm-lanz-h4">Tiempos</h4>
            <Tabla
              className="helm-lanz-tiempos" minWidth={520}
              cols={[
                { key: 'paso', label: 'Paso', bold: true },
                { key: 't', label: 't', mono: true },
                { key: 'dice', label: 'Dice' },
                { key: 've', label: 'Se ve' },
              ]}
              rows={tabla}
            />
          </>
        )}

        {g.tipo === 'anuncio' && (g.textoAnuncio || g.titular || g.boton) && (
          <>
            <h4 className="helm-lanz-h4">El anuncio</h4>
            <div className="helm-lanz-anuncio">
              {g.textoAnuncio && <p className="helm-lanz-anuncio-txt">{g.textoAnuncio}</p>}
              {(g.titular || g.boton) && (
                <div className="helm-lanz-anuncio-pie">
                  {g.titular && <span><small>Titular</small><b>{g.titular}</b></span>}
                  {g.boton && <span><small>Botón</small><span className="helm-lanz-boton">{g.boton}</span></span>}
                </div>
              )}
            </div>
          </>
        )}

        {g.nota && <p className="helm-est-note">{g.nota}</p>}

        <div className="helm-modal-actions">
          <button type="button" className="helm-btn" onClick={onEditar}><Pencil /> Editar</button>
          <button type="button" className="helm-btn primary" disabled={ocupado} onClick={onVolcar}>
            <CalendarPlus /> {enCalendario ? 'Ya está en el calendario' : 'Volcar al calendario'}
          </button>
        </div>
      </div>
    </div>
  )
}

// El cajón de edición. Trabaja sobre una copia; al guardar, el padre calcula
// el parche respecto a la base y solo guarda lo que cambia.
function EditorGuion({ base, actual, ocupado, soloLectura, onClose, onSave, onReset }) {
  const [f, setF] = useState(() => ({
    titulo: actual.titulo || '',
    intencion: actual.intencion || '',
    cta: actual.cta || '',
    fecha: actual.fecha || '',
    ganchos: arr(actual.ganchos).map(h => ({ familia: h?.familia || '', texto: h?.texto || '' })),
    elegido: actual.elegido ?? 0,
    textoAnuncio: actual.textoAnuncio || '',
    titular: actual.titular || '',
    boton: actual.boton || '',
    nota: actual.nota || '',
    tabla: arr(actual.tabla).map(r => ({ paso: r?.paso || '', t: r?.t || '', dice: r?.dice || '', ve: r?.ve || '' })),
  }))
  const [error, setError] = useState(null)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const setGancho = (i, k, v) => setF(s => ({ ...s, ganchos: s.ganchos.map((h, j) => (j === i ? { ...h, [k]: v } : h)) }))
  const setFila = (i, k, v) => setF(s => ({ ...s, tabla: s.tabla.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }))
  const addFila = () => setF(s => ({ ...s, tabla: [...s.tabla, { paso: '', t: '', dice: '', ve: '' }] }))
  const delFila = (i) => setF(s => ({ ...s, tabla: s.tabla.filter((_, j) => j !== i) }))

  async function submit(e) {
    e.preventDefault()
    if (!f.titulo.trim()) return setError('El título es obligatorio')
    if (f.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return setError('La fecha tiene que ser AAAA-MM-DD')
    setError(null)
    // Se guardan los campos como están en la base cuando el usuario los deja
    // vacíos, para que "borrar el texto" no deje un parche con cadenas vacías.
    const editado = {
      ...f,
      titulo: f.titulo.trim(),
      ganchos: f.ganchos.length ? f.ganchos : base.ganchos,
      tabla: f.tabla.filter(r => r.paso || r.t || r.dice || r.ve),
      elegido: Number(f.elegido) || 0,
    }
    await onSave(editado)
  }

  return (
    <Drawer
      title={`Editar ${actual.id}`}
      sub={[actual.tipo === 'anuncio' ? 'Anuncio' : 'Orgánico', actual.formato, CARRIL_LABEL[actual.carril]].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={(
        <div className="helm-drawer-foot-row">
          <button type="button" className="helm-btn sm" disabled={ocupado || !actual._editado} onClick={onReset} title="Borra tus cambios y vuelve al guion del playbook">
            <RotateCcw /> Volver al original
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
            <button type="submit" form="helm-lanz-editor" className="helm-btn primary" disabled={ocupado || soloLectura}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    >
      <form id="helm-lanz-editor" onSubmit={submit} noValidate className="helm-lanz-editor">
        {soloLectura && <FormNote tone="warn">Sin la migración aplicada no se puede guardar. Puedes mirar, no cambiar.</FormNote>}
        <Field label="Título *"><Input value={f.titulo} onChange={e => set('titulo', e.target.value)} autoFocus /></Field>
        <Field label="Intención" hint="Qué tiene que pasar en la cabeza de quien lo ve.">
          <Textarea rows={2} value={f.intencion} onChange={e => set('intencion', e.target.value)} />
        </Field>
        <div className="helm-form-2">
          <Field label="CTA"><Input value={f.cta} onChange={e => set('cta', e.target.value)} /></Field>
          <Field label="Fecha de publicación"><Input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></Field>
        </div>

        {f.ganchos.length > 0 && (
          <>
            <div className="helm-drawer-section">Ganchos — marca el elegido</div>
            <div className="helm-lanz-edit-ganchos">
              {f.ganchos.map((h, i) => (
                <div key={i} className={'helm-lanz-edit-gancho' + (Number(f.elegido) === i ? ' elegido' : '')}>
                  <label className="helm-lanz-edit-gancho-radio">
                    <input type="radio" name="elegido" checked={Number(f.elegido) === i} onChange={() => set('elegido', i)} />
                    <span>{h.familia || `Gancho ${i + 1}`}</span>
                  </label>
                  <Textarea rows={2} value={h.texto} onChange={e => setGancho(i, 'texto', e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="helm-drawer-section">Tabla de tiempos</div>
        <div className="helm-lanz-edit-tabla">
          {f.tabla.map((r, i) => (
            <div key={i} className="helm-lanz-edit-fila">
              <div className="helm-lanz-edit-fila-head">
                <Input value={r.paso} onChange={e => setFila(i, 'paso', e.target.value)} placeholder="Paso" />
                <Input className="helm-input mono" value={r.t} onChange={e => setFila(i, 't', e.target.value)} placeholder="0–3 s" />
                <button type="button" className="helm-btn sm" onClick={() => delFila(i)} aria-label="Quitar fila"><Trash2 /></button>
              </div>
              <Textarea rows={2} value={r.dice} onChange={e => setFila(i, 'dice', e.target.value)} placeholder="Qué dice" />
              <Textarea rows={1} value={r.ve} onChange={e => setFila(i, 've', e.target.value)} placeholder="Qué se ve" />
            </div>
          ))}
          <button type="button" className="helm-btn sm" onClick={addFila}><Plus /> Añadir bloque</button>
        </div>

        {actual.tipo === 'anuncio' && (
          <>
            <div className="helm-drawer-section">El anuncio</div>
            <Field label="Texto principal"><Textarea rows={5} value={f.textoAnuncio} onChange={e => set('textoAnuncio', e.target.value)} /></Field>
            <div className="helm-form-2">
              <Field label="Titular"><Input value={f.titular} onChange={e => set('titular', e.target.value)} /></Field>
              <Field label="Botón"><Input value={f.boton} onChange={e => set('boton', e.target.value)} /></Field>
            </div>
          </>
        )}

        <div className="helm-drawer-section">Nota</div>
        <Field><Textarea rows={2} value={f.nota} onChange={e => set('nota', e.target.value)} /></Field>

        {error && <FormNote>{error}</FormNote>}
      </form>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// Calendario: las fases, con la de hoy marcada.
function Calendario({ data, anio }) {
  const fases = arr(data.fases)
  if (!fases.length) return <div className="helm-est-section"><Vacio /></div>
  const estados = fases.map(f => estadoFase(f, anio))
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">Las fases, de un vistazo</h3>
      <div className="helm-lanz-timeline">
        {fases.map((f, i) => (
          <div key={f.key || i} className={'helm-lanz-tl-seg ' + (estados[i] || '')}>
            <span className="helm-lanz-tl-dot" />
            <b>{f.titulo}</b>
            <span className="helm-lanz-tl-rango">{f.rango}</span>
            {estados[i] === 'actual' && <span className="helm-lanz-tl-hoy">Hoy</span>}
          </div>
        ))}
      </div>

      {fases.map((f, i) => (
        <div key={f.key || i} className={'helm-card helm-lanz-fase ' + (estados[i] || '')}>
          <div className="helm-lanz-fase-head">
            <span className="helm-lanz-fase-n">{i + 1}</span>
            <div className="helm-lanz-fase-tit">
              <b>{f.titulo}</b>
              {f.rango && <span className="mono">{f.rango}</span>}
            </div>
            {estados[i] && <span className={'helm-lanz-fase-estado ' + estados[i]}>{ESTADO_FASE_LABEL[estados[i]]}</span>}
          </div>
          {f.resumen && <p className="helm-lanz-fase-resumen">{f.resumen}</p>}
          <Tabla
            minWidth={560}
            cols={[
              { key: 'dia', label: 'Día', bold: true },
              { key: 'pieza', label: 'Pieza' },
              { key: 'carril', label: 'Carril', render: r => (r.carril ? <><CarrilBadge carril={r.carril} /> {CARRIL_LABEL[r.carril] || r.carril}</> : '') },
              { key: 'trabajo', label: 'Trabajo' },
            ]}
            rows={f.filas}
          />
          {f.nota && <p className="helm-est-note">{f.nota}</p>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Numeros({ data }) {
  const n = obj(data.numeros)
  const o = obj(n.objetivo)
  const hayObjetivo = Object.keys(o).length > 0
  if (!hayObjetivo && !arr(n.cierre).length && !arr(n.fuentes).length && !arr(n.registros).length) return <div className="helm-est-section"><Vacio /></div>
  return (
    <div className="helm-est-section">
      {hayObjetivo && (
        <>
          <h3 className="helm-est-h3">El objetivo</h3>
          <div className="helm-est-stats-row">
            {o.plazas != null && <div className="helm-card helm-kpi"><div className="lbl">Plazas</div><div className="val accent">{o.plazas}</div></div>}
            {o.precio != null && <div className="helm-card helm-kpi"><div className="lbl">Precio</div><div className="val accent">{o.precio}</div></div>}
            {o.total != null && <div className="helm-card helm-kpi"><div className="lbl">Total</div><div className="val accent">{o.total}</div></div>}
            {o.mira && <div className="helm-card helm-kpi"><div className="lbl">La mira</div><div className="val helm-lanz-kpi-txt">{o.mira}</div></div>}
          </div>
        </>
      )}

      {arr(n.cierre).length > 0 && (
        <>
          <h3 className="helm-est-h3">Cuántas llamadas hacen falta, según la tasa de cierre</h3>
          <Tabla cols={[{ key: 'tasa', label: 'Tasa', mono: true, bold: true }, { key: 'llamadas', label: 'Llamadas', mono: true }, { key: 'lectura', label: 'Lectura' }]} rows={n.cierre} />
          {n.cierreNota && <p className="helm-est-note">{n.cierreNota}</p>}
        </>
      )}

      {arr(n.fuentes).length > 0 && (
        <>
          <h3 className="helm-est-h3">De dónde salen las llamadas</h3>
          <Tabla cols={[{ key: 'fuente', label: 'Fuente', bold: true }, { key: 'llamadas', label: 'Llamadas', mono: true }, { key: 'hace', label: 'Qué hace', }, { key: 'cuando', label: 'Cuándo' }]} rows={n.fuentes} />
        </>
      )}

      {arr(n.gratuito).length > 0 && (
        <>
          <h3 className="helm-est-h3">Con reserva o gratis</h3>
          <Tabla cols={[{ key: 'aspecto', label: '', bold: true }, { key: 'reserva', label: 'Con reserva' }, { key: 'gratis', label: 'Gratis' }]} rows={n.gratuito} />
          {n.gratuitoNota && <p className="helm-est-note callout">{n.gratuitoNota}</p>}
        </>
      )}

      {arr(n.registros).length > 0 && (
        <>
          <h3 className="helm-est-h3">Registros por fuente</h3>
          <Tabla cols={[{ key: 'fuente', label: 'Fuente', bold: true }, { key: 'registros', label: 'Registros', mono: true }, { key: 'como', label: 'Cómo' }]} rows={n.registros} />
        </>
      )}

      {n.alarma && (n.alarma.titulo || n.alarma.texto) && (
        <div className="helm-lanz-alarma">
          <AlertTriangle size={16} />
          <div>
            {n.alarma.titulo && <b>{n.alarma.titulo}</b>}
            {n.alarma.texto && <p>{n.alarma.texto}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Leads({ data }) {
  const l = obj(data.leads)
  if (!arr(l.grupos).length && !arr(l.secuencia).length && !l.reparto) return <div className="helm-est-section"><Vacio /></div>
  return (
    <div className="helm-est-section">
      {arr(l.grupos).length > 0 && (
        <>
          <h3 className="helm-est-h3">Los grupos de leads</h3>
          <div className="helm-lanz-grupos">
            {arr(l.grupos).map((g, i) => (
              <div key={i} className="helm-card helm-lanz-grupo">
                <b>{g.grupo}</b>
                {g.quien && <p className="helm-lanz-grupo-quien">{g.quien}</p>}
                {g.como && <p className="helm-lanz-grupo-como"><span>Cómo:</span> {g.como}</p>}
              </div>
            ))}
          </div>
        </>
      )}
      {arr(l.secuencia).length > 0 && (
        <>
          <h3 className="helm-est-h3">La secuencia de DM</h3>
          <Tabla minWidth={520} cols={[{ key: 'dia', label: 'Día', bold: true, mono: true }, { key: 'manda', label: 'Qué se manda' }, { key: 'pregunta', label: 'La pregunta' }]} rows={l.secuencia} />
        </>
      )}
      {l.reparto && <p className="helm-est-note callout">{l.reparto}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Anuncios({ data }) {
  const a = obj(data.anuncios)
  if (!a.vende && !arr(a.campana).length && !arr(a.presupuesto).length) return <div className="helm-est-section"><Vacio /></div>
  return (
    <div className="helm-est-section">
      {a.vende && <p className="helm-est-lead">{a.vende}</p>}
      {arr(a.campana).length > 0 && (
        <>
          <h3 className="helm-est-h3">La campaña</h3>
          <Tabla cols={[{ key: 'campo', label: 'Campo', bold: true }, { key: 'valor', label: 'Valor' }]} rows={a.campana} minWidth={360} />
        </>
      )}
      {arr(a.presupuesto).length > 0 && (
        <>
          <h3 className="helm-est-h3">Presupuesto</h3>
          <Tabla cols={[{ key: 'dia', label: 'Por día', mono: true, bold: true }, { key: 'dias', label: 'Días', mono: true }, { key: 'total', label: 'Total', mono: true }, { key: 'registros', label: 'Registros esperados', mono: true }]} rows={a.presupuesto} />
          {a.presupuestoNota && <p className="helm-est-note">{a.presupuestoNota}</p>}
        </>
      )}
      <div className="helm-lanz-dos">
        {arr(a.test).length > 0 && (
          <div className="helm-card helm-lanz-lista">
            <b>Qué se testea</b>
            <ul className="helm-est-ejemplos">{arr(a.test).map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        {arr(a.preparar).length > 0 && (
          <div className="helm-card helm-lanz-lista">
            <b>Qué hay que preparar</b>
            <ul className="helm-lanz-checklist">{arr(a.preparar).map((t, i) => <li key={i}><Circle size={11} /> {t}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Stories({ data }) {
  const s = obj(data.stories)
  if (!s.intro && !arr(s.frames).length) return <div className="helm-est-section"><Vacio /></div>
  return (
    <div className="helm-est-section">
      <h3 className="helm-est-h3">La Ronda durante el lanzamiento</h3>
      {s.intro && <p className="helm-est-lead">{s.intro}</p>}
      {arr(s.frames).length > 0 && (
        <Tabla cols={[{ key: 'frame', label: 'Frame', bold: true }, { key: 'cambia', label: 'Qué cambia' }]} rows={s.frames} minWidth={420} />
      )}
      {s.rondas && <p className="helm-est-note callout">{s.rondas}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Webinar({ data }) {
  const w = obj(data.webinar)
  if (!w.cuando && !w.mision && !arr(w.bloques).length) return <div className="helm-est-section"><Vacio /></div>
  return (
    <div className="helm-est-section">
      <div className="helm-lanz-dos">
        {w.cuando && <div className="helm-card helm-lanz-lista"><small>Cuándo</small><b>{w.cuando}</b></div>}
        {w.mision && <div className="helm-card helm-lanz-lista"><small>La misión</small><p>{w.mision}</p></div>}
      </div>
      {arr(w.bloques).length > 0 && (
        <>
          <h3 className="helm-est-h3">Minuto a minuto</h3>
          <Tabla className="helm-lanz-tiempos" minWidth={480} cols={[{ key: 'min', label: 'Min', mono: true }, { key: 'bloque', label: 'Bloque', bold: true }, { key: 'hace', label: 'Qué hace' }]} rows={w.bloques} />
        </>
      )}
      <div className="helm-lanz-dos">
        {arr(w.notas).length > 0 && (
          <div className="helm-card helm-lanz-lista">
            <b>Notas</b>
            <ul className="helm-est-ejemplos">{arr(w.notas).map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        {arr(w.despues).length > 0 && (
          <div className="helm-card helm-lanz-lista">
            <b>Después</b>
            <ul className="helm-lanz-checklist">{arr(w.despues).map((t, i) => <li key={i}><Circle size={11} /> {t}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Riesgos({ data }) {
  const decisiones = arr(data.decisiones)
  const riesgos = arr(data.riesgos)
  const panel = obj(data.panel)
  const necesito = arr(data.necesito)
  if (!decisiones.length && !riesgos.length && !panel.titulo && !necesito.length) return <div className="helm-est-section"><Vacio /></div>
  return (
    <div className="helm-est-section">
      {riesgos.length > 0 && (
        <>
          <h3 className="helm-est-h3">Si pasa esto, se hace esto</h3>
          <div className="helm-lanz-riesgos">
            {riesgos.map((r, i) => (
              <div key={i} className="helm-card helm-lanz-riesgo">
                <div className="helm-lanz-riesgo-si"><small>Si</small>{r.si}</div>
                <div className="helm-lanz-riesgo-ent"><small>Entonces</small>{r.entonces}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {decisiones.length > 0 && (
        <>
          <h3 className="helm-est-h3">Quién decide qué</h3>
          <Tabla cols={[{ key: 'que', label: 'Qué', bold: true }, { key: 'quien', label: 'Quién' }, { key: 'limite', label: 'Límite' }]} rows={decisiones} />
        </>
      )}
      {(panel.titulo || arr(panel.cifras).length > 0) && (
        <>
          <h3 className="helm-est-h3">{panel.titulo || 'El panel'}</h3>
          <div className="helm-lanz-cifras">
            {arr(panel.cifras).map((c, i) => <span key={i} className="helm-lanz-cifra">{c}</span>)}
          </div>
          {panel.nota && <p className="helm-est-note">{panel.nota}</p>}
        </>
      )}
      {necesito.length > 0 && (
        <>
          <h3 className="helm-est-h3">Lo que necesito</h3>
          <div className="helm-lanz-necesito">
            {necesito.map((b, i) => (
              <div key={i} className="helm-card helm-lanz-lista">
                <b>{b.bloque}</b>
                <ul className="helm-lanz-checklist">{arr(b.items).map((t, j) => <li key={j}><Circle size={11} /> {t}</li>)}</ul>
              </div>
            ))}
          </div>
          {data.necesitoNota && <p className="helm-est-note callout">{data.necesitoNota}</p>}
        </>
      )}
    </div>
  )
}
