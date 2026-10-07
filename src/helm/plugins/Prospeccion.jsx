// HELM plugin — Scraper. Leads de cinco fuentes al CRM, por la misma bandeja.
//
// El trabajo que sustituye: abrir Maps, buscar "peluquerías en Valencia", ir
// abriendo fichas y copiar nombre y teléfono a mano. Media mañana para
// cincuenta contactos y sin saber a cuáles ya habías escrito.
//
// Tres pasos y en este orden a propósito:
//   1. Buscas, en la fuente que quieras. Los resultados NO entran al CRM, se
//      quedan en una bandeja aparte.
//   2. Los miras y eliges. Lo que no interesa se descarta y no vuelve a salir.
//   3. Lo elegido pasa al embudo que tú digas.
//
// El paso 2 es el que hace que esto sirva. Volcar 200 negocios sin mirar en el
// pipeline de alguien es la forma más rápida de inutilizarle el CRM.
//
// LAS CINCO FUENTES, y por qué son cinco y no una:
//
//   Google Maps  ficha completa y teléfono casi siempre — pero clave con
//                tarjeta y factura por búsqueda.
//   BORME        el Registro Mercantil. Lo único que da NOMBRE Y APELLIDOS de
//                quien manda, y sociedades el día que se constituyen.
//   OpenStreetMap lo mismo que Maps, gratis y con el email que Places no da.
//   Buscador     para quien no está en ningún mapa: se busca por huella
//                (`site:`, comillas, operadores) y se enriquece lo que salga.
//   Mi lista     lo que ya tienes en un CSV o en una nota. Sin red y sin clave.
//
// Ninguna raspa HTML de terceros: Places y Brave son APIs oficiales, el BORME y
// OSM publican sus datos abiertos, y la lista la trae el usuario. Raspar habría
// sido más rápido de escribir y se rompe el día que alguien cambie un div.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, MapPin, Phone, Globe, Star, Download, Trash2, Mail, Instagram,
  KeyRound, ExternalLink, History, AlertTriangle, Sparkles, UserRound, Scale,
  MapPinned, Map, ClipboardPaste, Building2, Check,
} from 'lucide-react'
import { prospeccionApi, fetchRows, fmtDate } from '../lib'
import { Empty, Panel, Field, Input, Select, Textarea, Modal, FormNote } from '../ui'

const ESTADOS = [
  { key: 'nuevo', label: 'Sin revisar' },
  { key: 'importado', label: 'En el CRM' },
  { key: 'descartado', label: 'Descartados' },
  { key: 'todos', label: 'Todos' },
]

const dominio = (url) => String(url || '')
  .replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '')

// ── El catálogo, tal y como se enseña ──────────────────────────────────────
// El de verdad vive en el servidor (api/_lib/fuentes/index.js); aquí está lo
// que hay que pintar. `claim` es la frase que decide por cuál empezar, así que
// dice lo que la fuente DA y lo que cuesta, no lo que promete.
const FUENTES = [
  {
    key: 'maps',
    nombre: 'Google Maps',
    icon: MapPinned,
    claim: 'Ficha completa y teléfono. Clave de Google y coste por búsqueda.',
    inicial: { tipo: '', zona: '', limite: 20 },
    limites: [10, 20, 40, 60],
  },
  {
    key: 'borme',
    nombre: 'Registro Mercantil',
    icon: Scale,
    claim: 'Sociedades nuevas y quién las administra. Gratis, con nombre y apellidos.',
    inicial: { provincia: '', acto: 'constitucion', dias: 3, limite: 60 },
    limites: [30, 60, 120, 300],
  },
  {
    key: 'osm',
    nombre: 'OpenStreetMap',
    icon: Map,
    claim: 'Como Maps pero gratis, y a veces con el email del negocio.',
    inicial: { tipo: '', zona: '', limite: 60 },
    limites: [20, 60, 120, 200],
  },
  {
    key: 'buscador',
    nombre: 'Buscador',
    icon: Search,
    claim: 'Huella web: site:, comillas y operadores. Para quien no está en el mapa.',
    inicial: { consulta: '', limite: 20 },
    limites: [20, 40, 60, 100],
  },
  {
    key: 'lista',
    nombre: 'Mi lista',
    icon: ClipboardPaste,
    claim: 'Pega un CSV, URLs, emails o teléfonos. Sin clave y sin cuota.',
    inicial: { texto: '' },
    limites: null,
  },
]

const FUENTE_MAP = Object.fromEntries(FUENTES.map(f => [f.key, f]))

// Cómo se llama en la ficha el enlace al origen. No es cosmético: "Maps" en un
// resultado del BOE haría pensar que el dato viene de Google.
const ORIGEN = { maps: 'Maps', borme: 'BORME', osm: 'OSM', buscador: 'Web', lista: 'Web' }

export default function Prospeccion({ clientId }) {
  const [estado, setEstado] = useState(null)          // { fuentes: { maps: {...} } }
  const [prospects, setProspects] = useState(null)
  const [pipelines, setPipelines] = useState([])
  const [filtro, setFiltro] = useState('nuevo')
  const [sel, setSel] = useState(() => new Set())
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [verClave, setVerClave] = useState(null)      // null | key de fuente
  const [verHistorial, setVerHistorial] = useState(false)
  const [importando, setImportando] = useState(false)
  const [enriqueciendo, setEnriqueciendo] = useState(null)   // null | { hechos, total }

  const [fuente, setFuente] = useState('maps')
  // Un formulario por fuente, no uno compartido: cambiar de pestaña para ver
  // qué pide el BORME y volver con la búsqueda de Maps borrada es la clase de
  // detalle que hace que una pantalla se sienta rota.
  const [forms, setForms] = useState(() => Object.fromEntries(FUENTES.map(f => [f.key, { ...f.inicial }])))
  const f = forms[fuente]
  const set = (k, v) => setForms(s => ({ ...s, [fuente]: { ...s[fuente], [k]: v } }))

  const actual = FUENTE_MAP[fuente]
  const estadoFuente = estado?.fuentes?.[fuente]

  const cargarEstado = useCallback(
    () => prospeccionApi.status(clientId).then(setEstado).catch(e => setError(e.message)),
    [clientId],
  )

  const cargarLista = useCallback(
    () => prospeccionApi.lista(clientId, filtro)
      .then(r => { setProspects(r.prospects); setSel(new Set()) })
      .catch(e => { setError(e.message); setProspects([]) }),
    [clientId, filtro],
  )

  useEffect(() => { cargarEstado() }, [cargarEstado])
  useEffect(() => { cargarLista() }, [cargarLista])
  useEffect(() => {
    fetchRows('crm_pipelines', clientId, { order: 'created_at', asc: true }).then(setPipelines)
  }, [clientId])

  // Cuántos de la bandeja son de cada fuente. Es el contador que dice si una
  // fuente está aportando algo o solo hace bulto.
  const porFuente = useMemo(() => {
    const c = {}
    for (const p of prospects || []) c[p.fuente || 'maps'] = (c[p.fuente || 'maps'] || 0) + 1
    return c
  }, [prospects])

  // Si la fuente pide clave y no la hay, no se deja buscar: mejor decirlo antes
  // que traducir un 403 de un tercero.
  const listaParaBuscar = !estadoFuente || estadoFuente.configurada
  const hayQueBuscar = fuente === 'lista'
    ? Boolean(f.texto?.trim())
    : fuente === 'buscador'
      ? Boolean(f.consulta?.trim())
      : fuente === 'borme'
        ? true                                   // sin provincia = toda España
        : Boolean(f.tipo?.trim() || f.zona?.trim())

  async function buscar(e) {
    e.preventDefault()
    setBuscando(true); setError(null); setAviso(null)
    try {
      const r = await prospeccionApi.buscar(clientId, { fuente, ...f })
      setAviso(
        r.encontrados === 0
          ? `${actual.nombre} no ha devuelto nada para «${r.consulta}». Prueba con otra zona o escrito de otra forma.`
          : `${r.encontrados} resultados para «${r.consulta}» · ${r.nuevos} sin revisar${
            r.encontrados - r.nuevos > 0 ? `, ${r.encontrados - r.nuevos} ya los tenías` : ''}`,
      )
      setFiltro('nuevo')
      await cargarLista()
    } catch (err) { setError(err.message) }
    setBuscando(false)
  }

  const visibles = prospects || []
  const todosMarcados = visibles.length > 0 && sel.size === visibles.length

  const marcar = (id) => setSel(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const marcarTodos = () => setSel(todosMarcados ? new Set() : new Set(visibles.map(p => p.id)))

  // El servidor mira 10 por llamada: son webs de terceros y se leen de una en
  // una. Aquí se trocea la selección y se va enseñando por dónde va, que con 40
  // negocios es medio minuto y sin aviso parece que se ha colgado.
  async function enriquecer() {
    const ids = [...sel]
    if (!ids.length) return
    setError(null); setAviso(null)
    setEnriqueciendo({ hechos: 0, total: ids.length })
    let conDatos = 0
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const tanda = ids.slice(i, i + 10)
        const r = await prospeccionApi.enriquecer(clientId, tanda)
        conDatos += r.conDatos
        setEnriqueciendo({ hechos: Math.min(i + 10, ids.length), total: ids.length })
      }
      setAviso(`${conDatos} de ${ids.length} webs han soltado algo (email, redes o titular).`)
      await cargarLista()
    } catch (err) { setError(err.message) }
    setEnriqueciendo(null)
  }

  async function descartar() {
    if (!sel.size) return
    setError(null)
    try {
      await prospeccionApi.descartar(clientId, [...sel])
      await cargarLista()
    } catch (err) { setError(err.message) }
  }

  return (
    <>
      <div className="helm-crm-bar">
        <div className="helm-chips">
          {ESTADOS.map(e => (
            <button
              key={e.key}
              className={'helm-chip' + (filtro === e.key ? ' active' : '')}
              onClick={() => setFiltro(e.key)}
            >{e.label}</button>
          ))}
        </div>
        <div className="helm-crm-actions">
          <button className="helm-btn" onClick={() => setVerHistorial(true)}>
            <History size={15} /> Búsquedas
          </button>
        </div>
      </div>

      {/* ── Las cinco fuentes ──────────────────────────────────────────────
          En tarjetas y no en un desplegable a propósito: la pregunta de esta
          pantalla no es "rellena el formulario", es "¿de dónde saco leads hoy?",
          y eso se decide comparando lo que da cada una. */}
      <div className="helm-fuentes">
        {FUENTES.map(x => {
          const Icon = x.icon
          const st = estado?.fuentes?.[x.key]
          const falta = st?.necesitaClave && !st?.configurada
          return (
            <button
              key={x.key}
              className={'helm-fuente' + (fuente === x.key ? ' on' : '') + (falta ? ' falta' : '')}
              onClick={() => { setFuente(x.key); setAviso(null); setError(null) }}
            >
              <div className="helm-fuente-top">
                <Icon size={16} />
                <b>{x.nombre}</b>
                {porFuente[x.key] > 0 && <span className="helm-fuente-n">{porFuente[x.key]}</span>}
              </div>
              <span className="helm-fuente-claim">{x.claim}</span>
              <span className={'helm-fuente-estado' + (falta ? ' warn' : '')}>
                {!st ? '…' : falta
                  ? <><KeyRound size={11} /> Falta la clave</>
                  : st.necesitaClave
                    ? <><Check size={11} /> Conectada</>
                    : <><Check size={11} /> Sin clave, lista</>}
              </span>
            </button>
          )
        })}
      </div>

      {estadoFuente?.necesitaClave && !estadoFuente.configurada && (
        <FormNote tone="warn">
          {fuente === 'maps'
            ? <>Para buscar en Maps hace falta una clave de la <b>Places API</b> de Google. Es tuya y las búsquedas se facturan a tu cuenta, no a HELM.</>
            : <>Para buscar por huella hace falta una clave de la <b>Brave Search API</b>. Tiene plan gratuito de 2.000 consultas al mes.</>}
          {' '}
          <button className="helm-linkbtn" onClick={() => setVerClave(fuente)}>Conectar ahora</button>
        </FormNote>
      )}

      <Panel
        title={`Buscar en ${actual.nombre}`}
        action={estadoFuente?.necesitaClave && (
          <button className="helm-btn" onClick={() => setVerClave(fuente)}>
            <KeyRound size={15} /> {estadoFuente.configurada ? 'Clave' : 'Conectar'}
          </button>
        )}
      >
        <form className={'helm-prosp-form' + (fuente === 'lista' ? ' ancho' : '')} onSubmit={buscar}>
          <Formulario fuente={fuente} f={f} set={set} meta={estadoFuente?.meta} limites={actual.limites} />
          <button className="helm-btn primary" disabled={buscando || !listaParaBuscar || !hayQueBuscar}>
            <Search size={15} /> {buscando ? 'Buscando…' : fuente === 'lista' ? 'Procesar lista' : 'Buscar'}
          </button>
        </form>
        <Explicacion fuente={fuente} />
        {aviso && <FormNote tone="warn">{aviso}</FormNote>}
        {error && <FormNote>{error}</FormNote>}
      </Panel>

      {sel.size > 0 && (
        <BarraSeleccion
          n={sel.size} pipelines={pipelines} importando={importando}
          enriqueciendo={enriqueciendo}
          onEnriquecer={enriquecer}
          onDescartar={descartar}
          onImportar={async ({ pipelineId, stageKey }) => {
            setImportando(true); setError(null)
            try {
              const r = await prospeccionApi.importar(clientId, { ids: [...sel], pipelineId, stageKey })
              setAviso(
                `${r.creados} contactos nuevos en el CRM`
                + (r.yaEstaban ? ` · ${r.yaEstaban} ya los tenías y se han enlazado, no duplicado` : ''),
              )
              await cargarLista()
            } catch (err) { setError(err.message) }
            setImportando(false)
          }}
        />
      )}

      {prospects === null ? (
        <Empty>Cargando…</Empty>
      ) : visibles.length === 0 ? (
        <Empty>
          {filtro === 'nuevo'
            ? 'Nada sin revisar. Elige una fuente ahí arriba y busca.'
            : 'Nada por aquí.'}
        </Empty>
      ) : (
        <div className="helm-prosp-lista">
          <div className="helm-prosp-head">
            <label className="helm-checkline" style={{ margin: 0 }}>
              <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} />
              {todosMarcados ? 'Quitar todos' : `Marcar los ${visibles.length}`}
            </label>
          </div>

          {visibles.map(p => (
            <div
              key={p.id}
              className={'helm-prosp' + (sel.has(p.id) ? ' on' : '') + (p.estado !== 'nuevo' ? ' usado' : '')}
              onClick={() => p.estado === 'nuevo' && marcar(p.id)}
            >
              {p.estado === 'nuevo' ? (
                <input
                  type="checkbox" checked={sel.has(p.id)}
                  onChange={() => marcar(p.id)} onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={'helm-badge ' + (p.estado === 'importado' ? 'green' : '')}>
                  {p.estado === 'importado' ? 'En el CRM' : 'Descartado'}
                </span>
              )}

              <div className="helm-prosp-main">
                <b>{p.nombre}</b>
                <div className="helm-prosp-meta">
                  {/* De qué fuente salió, siempre. Con cinco mezcladas en la
                      misma bandeja, es lo que explica por qué a este no le
                      falta teléfono y a aquel sí. */}
                  <span className={'helm-prosp-fuente ' + (p.fuente || 'maps')}>
                    {FUENTE_MAP[p.fuente]?.nombre || 'Google Maps'}
                  </span>
                  {p.extra?.acto && <span className="helm-prosp-acto">{p.extra.acto}</span>}
                  {p.categoria && <span>{p.categoria}</span>}
                  {p.rating != null && (
                    <span><Star size={11} /> {p.rating} {p.resenas ? `(${p.resenas})` : ''}</span>
                  )}
                  {p.direccion && <span><MapPin size={11} /> {p.direccion}</span>}
                </div>
                <div className="helm-prosp-meta">
                  {/* El teléfono es el dato por el que se hace todo esto: si no
                      lo hay, se dice, porque cambia a quién merece la pena llamar. */}
                  {p.telefono
                    ? <span className="helm-prosp-tel"><Phone size={11} /> {p.telefono}</span>
                    : <span className="helm-prosp-sin"><Phone size={11} /> sin teléfono</span>}
                  {p.web && (
                    <a href={p.web} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                      <Globe size={11} /> {dominio(p.web)}
                    </a>
                  )}
                  {p.maps_url && (
                    <a href={p.maps_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                      <ExternalLink size={11} /> {ORIGEN[p.fuente] || 'Maps'}
                    </a>
                  )}
                </div>

                <Enriquecido p={p} />
              </div>
            </div>
          ))}
        </div>
      )}

      {verClave && (
        <ModalClave
          clientId={clientId} fuente={verClave} estado={estado?.fuentes?.[verClave]}
          onClose={() => setVerClave(null)}
          onGuardado={() => { setVerClave(null); cargarEstado() }}
        />
      )}

      {verHistorial && (
        <ModalHistorial clientId={clientId} onClose={() => setVerHistorial(false)} />
      )}
    </>
  )
}

// ── El formulario de cada fuente ────────────────────────────────────────────
// Cinco formularios y no uno con todos los campos: la mitad de los campos no
// aplican a la mitad de las fuentes, y un formulario lleno de casillas apagadas
// no lo entiende nadie.
function Formulario({ fuente, f, set, meta, limites }) {
  const cuantos = limites && (
    <Field label="Cuántos" hint={fuente === 'maps' ? 'Cada 20 es una consulta facturable' : 'Tope de resultados'}>
      <Select value={f.limite} onChange={e => set('limite', Number(e.target.value))}>
        {limites.map(n => <option key={n} value={n}>{n}</option>)}
      </Select>
    </Field>
  )

  if (fuente === 'maps' || fuente === 'osm') {
    return (
      <>
        <Field label="Tipo de negocio" hint={fuente === 'osm' ? 'Categoría, o una etiqueta OSM (shop=bakery)' : 'Como lo buscarías en Maps'}>
          <Input
            value={f.tipo} onChange={e => set('tipo', e.target.value)}
            placeholder="peluquería, clínica dental, gimnasio…" maxLength={80}
          />
        </Field>
        <Field label="Zona" hint={fuente === 'osm' ? 'Obligatoria: OSM busca dentro de un mapa' : 'Ciudad, barrio o provincia'}>
          <Input
            value={f.zona} onChange={e => set('zona', e.target.value)}
            placeholder="Valencia, Chamberí Madrid, Alicante…" maxLength={120}
          />
        </Field>
        {cuantos}
      </>
    )
  }

  if (fuente === 'borme') {
    return (
      <>
        <Field label="Provincia" hint="Vacío = toda España (más lento)">
          <Select value={f.provincia} onChange={e => set('provincia', e.target.value)}>
            <option value="">Toda España</option>
            {(meta?.provincias || []).map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Qué buscar" hint="El acto inscrito en el registro">
          <Select value={f.acto} onChange={e => set('acto', e.target.value)}>
            {(meta?.actos || []).map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Días atrás" hint="El BORME sale de lunes a viernes">
          <Select value={f.dias} onChange={e => set('dias', Number(e.target.value))}>
            {[1, 2, 3, 5, 7, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        {cuantos}
      </>
    )
  }

  if (fuente === 'buscador') {
    return (
      <>
        <Field
          label="Consulta"
          hint="Acepta operadores: site:, comillas, -excluir, inurl:"
        >
          <Input
            value={f.consulta} onChange={e => set('consulta', e.target.value)}
            placeholder={'site:instagram.com "entrenador personal" Valencia'}
            maxLength={400}
          />
        </Field>
        {cuantos}
      </>
    )
  }

  // Lista
  return (
    <Field label="Pega aquí tu lista" hint="Una línea por negocio. Vale CSV, URLs, emails o teléfonos sueltos.">
      <Textarea
        rows={8}
        value={f.texto} onChange={e => set('texto', e.target.value)}
        placeholder={'Bar Pepe;963112233;barpepe.es\nhttps://clinicadentalruiz.com\ninfo@gimnasiofuerte.es, Gimnasio Fuerte\nhttps://instagram.com/entrenador.valencia'}
      />
    </Field>
  )
}

// ── Qué esperar de cada fuente ─────────────────────────────────────────────
// Va debajo del formulario y no en un tooltip porque es lo que evita la
// decepción: quien busca en el BORME tiene que saber ANTES de darle al botón
// que ahí no hay teléfonos.
function Explicacion({ fuente }) {
  const t = {
    maps: 'Ficha de Google: nombre, dirección, teléfono, web y reseñas. Va por la Places API oficial, no raspando Maps. Cada 20 resultados es una consulta que se factura a tu cuenta de Google.',
    borme: 'Actos inscritos en el Registro Mercantil, publicados por el BOE en datos abiertos. Trae la sociedad, su domicilio, su objeto social y el nombre del administrador nombrado. NO trae teléfono ni email: eso no está en el registro.',
    osm: 'El mapa libre. Gratis y sin clave, y a menudo con el email del negocio, que Places no da nunca. A cambio, la ficha es la que haya subido la comunidad: en el centro de una capital está casi todo; en un polígono, puede no haber nada.',
    buscador: 'Búsqueda web por la API de Brave. Devuelve webs y perfiles, no fichas de negocio: el teléfono y el email salen después, con «Buscar más datos», que entra en cada web y lee su contacto y su aviso legal.',
    lista: 'No sale a internet: lee lo que pegues. Reconoce webs, emails y teléfonos estén en el orden que estén, quita los repetidos y deja todo listo para enriquecer y pasar al CRM.',
  }[fuente]
  return <p className="helm-settings-note">{t}</p>
}

// ── Lo que se sabe de más de este negocio ───────────────────────────────────
// Dos orígenes que se pintan igual: lo que publica el registro (BORME) y lo que
// se ha sacado de su web. Si se miró la web y no había nada, se dice — un hueco
// en blanco hace que alguien lo vuelva a intentar.
function Enriquecido({ p }) {
  const personas = p.extra?.personas || []
  const buscado = Boolean(p.enriquecido_en)
  const algo = p.email || p.titular || p.cif || personas.length || p.linkedin || p.facebook || p.extra?.objeto

  if (!buscado && !algo) return null
  if (buscado && !algo) {
    return (
      <div className="helm-prosp-enr vacio">
        Se miró su web y no soltó nada{p.extra?.motivo ? ` (${p.extra.motivo})` : ''}.
        <EnlacesOsint p={p} />
      </div>
    )
  }

  return (
    <div className="helm-prosp-enr">
      <div className="helm-prosp-meta">
        {p.email && (
          <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()}>
            <Mail size={11} /> {p.email}
          </a>
        )}
        {p.instagram && (
          <a href={p.instagram} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            <Instagram size={11} /> Instagram
          </a>
        )}
        {p.linkedin && (
          <a href={p.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            <ExternalLink size={11} /> LinkedIn
          </a>
        )}
        {p.extra?.capital && <span><Building2 size={11} /> Capital: {p.extra.capital}</span>}
      </div>

      {/* El titular del aviso legal no es "el CEO" y no se llama así: en un
          autónomo es el dueño, en una SL es la sociedad. */}
      {(p.titular || p.cif) && (
        <div className="helm-prosp-meta">
          <span title="Quien figura como responsable en su aviso legal">
            <Scale size={11} /> {p.titular}{p.cif ? ` · ${p.cif}` : ''}
          </span>
        </div>
      )}

      {personas.length > 0 && (
        <div className="helm-prosp-personas">
          {personas.map((x, i) => (
            <span
              key={i} className="helm-prosp-persona"
              title={x.fuente === 'BORME'
                ? 'Publicado en el Registro Mercantil (BORME)'
                : `Publicado en su web (${x.fuente})`}
            >
              <UserRound size={11} /> <b>{x.nombre}</b> · {x.cargo}
            </span>
          ))}
        </div>
      )}

      <EnlacesOsint p={p} />
    </div>
  )
}

// ── A dónde ir a mirar a mano ───────────────────────────────────────────────
// Lo que queda después de la web y del registro ya no se consulta por API
// abierta. En vez de fingir que está automatizado, se deja la búsqueda escrita a
// un clic. Es la diferencia entre una herramienta honesta y una que promete un
// dato que no puede dar.
function EnlacesOsint({ p }) {
  const q = encodeURIComponent(p.titular || p.nombre || '')
  if (!q) return null
  return (
    <div className="helm-prosp-osint">
      <span>Buscar a mano:</span>
      <a
        href={`https://www.boe.es/diario_borme/buscar.php?campo%5B0%5D=TIT&dato%5B0%5D=${q}`}
        target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        title="BORME: histórico completo de esta sociedad, más allá de los días que traiga la búsqueda."
      >BORME</a>
      <a
        href={`https://www.google.com/search?q=${q}+administrador+OR+fundador+OR+CEO`}
        target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      >Google</a>
      <a
        href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(p.nombre || '')}`}
        target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        title="Se abre para que lo mires tú: LinkedIn no permite leerlo de forma automática."
      >LinkedIn</a>
    </div>
  )
}

// ── Barra de acciones sobre lo marcado ──────────────────────────────────────
// Aparece solo con algo marcado: una barra permanente con "importar 0" es ruido.
function BarraSeleccion({ n, pipelines, importando, enriqueciendo, onImportar, onEnriquecer, onDescartar }) {
  const [pipelineId, setPipelineId] = useState('')
  const pipeline = pipelines.find(p => p.id === pipelineId)
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : []
  const [stageKey, setStageKey] = useState('')

  // Al cambiar de embudo, la etapa anterior puede no existir en el nuevo.
  const stageValida = stages.some(s => s.key === stageKey) ? stageKey : (stages[0]?.key || '')

  return (
    <div className="helm-prosp-barra">
      <b>{n} marcado{n === 1 ? '' : 's'}</b>

      <Select value={pipelineId} onChange={e => { setPipelineId(e.target.value); setStageKey('') }}>
        <option value="">Embudo por defecto</option>
        {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>

      {stages.length > 0 && (
        <Select value={stageValida} onChange={e => setStageKey(e.target.value)}>
          {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      )}

      <button className="helm-btn" onClick={onEnriquecer} disabled={importando || Boolean(enriqueciendo)}>
        <Sparkles size={15} />
        {enriqueciendo ? `Buscando… ${enriqueciendo.hechos}/${enriqueciendo.total}` : 'Buscar más datos'}
      </button>
      <button
        className="helm-btn primary" disabled={importando || Boolean(enriqueciendo)}
        onClick={() => onImportar({ pipelineId: pipelineId || null, stageKey: stageValida || null })}
      >
        <Download size={15} /> {importando ? 'Importando…' : 'Pasar al CRM'}
      </button>
      <button className="helm-btn" onClick={onDescartar} disabled={importando || Boolean(enriqueciendo)}>
        <Trash2 size={15} /> Descartar
      </button>
    </div>
  )
}

// ── Las claves ──────────────────────────────────────────────────────────────
// Dos fuentes piden clave y las dos por el mismo motivo: las búsquedas se le
// facturan a su dueño. Un solo modal con las instrucciones de cada una.
const AYUDA = {
  maps: {
    titulo: 'Conectar con Google',
    lead: <>La búsqueda va por la <b>Places API</b> oficial de Google, no raspando Maps: es lo único que no se rompe cada vez que Google cambia la página.</>,
    pasos: [
      <>Entra en <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> y crea un proyecto (o usa el que tengas).</>,
      <>En <b>APIs y servicios → Biblioteca</b>, busca <b>Places API (New)</b> y actívala.</>,
      <>En <b>Credenciales</b>, crea una <b>Clave de API</b> y pégala aquí abajo.</>,
      <>Google pide una tarjeta en el proyecto, pero da crédito mensual gratuito que cubre de sobra un uso normal.</>,
    ],
    nota: <>Las búsquedas se facturan a <b>tu</b> cuenta de Google. Cada 20 resultados es una consulta. Por eso el buscador te deja elegir cuántos traer.</>,
    placeholder: 'AIza…',
  },
  buscador: {
    titulo: 'Conectar con Brave Search',
    lead: <>La búsqueda por huella va por la <b>API de Brave</b>, que vende acceso a su índice justo para esto. Raspar los resultados de Google va contra sus términos y te bloquea con un captcha a la tercera página.</>,
    pasos: [
      <>Entra en <a href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer">brave.com/search/api</a> y crea una cuenta.</>,
      <>Elige el plan <b>Free</b>: 2.000 consultas al mes y una por segundo.</>,
      <>En el panel, <b>API Keys</b> → crea una clave y pégala aquí abajo.</>,
      <>Pide tarjeta para verificar la cuenta aunque el plan gratuito no cobre.</>,
    ],
    nota: <>Cada búsqueda tuya son entre 1 y 5 consultas del plan, según cuántos resultados pidas.</>,
    placeholder: 'BSA…',
  },
}

function ModalClave({ clientId, fuente, estado, onClose, onGuardado }) {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ayuda = AYUDA[fuente] || AYUDA.maps

  async function guardar(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await prospeccionApi.guardarClave(clientId, apiKey.trim(), fuente); onGuardado() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function borrar() {
    if (!confirm('¿Quitar la clave? Dejarás de poder buscar en esta fuente hasta que pongas otra.')) return
    setBusy(true); setError(null)
    try { await prospeccionApi.borrarClave(clientId, fuente); onGuardado() }
    catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <Modal title={ayuda.titulo} onClose={onClose} wide>
      <form onSubmit={guardar}>
        <p className="helm-settings-lead">{ayuda.lead}</p>

        <div className="helm-settings-block" style={{ borderTop: 'none', paddingTop: 0 }}>
          <label>Cómo se saca la clave</label>
          <ol className="helm-pasos">
            {ayuda.pasos.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
          <FormNote tone="warn">{ayuda.nota}</FormNote>
        </div>

        {estado?.configurada ? (
          <>
            <Field label="Clave guardada">
              <Input value={estado.pista || '········'} disabled />
            </Field>
            <p className="helm-settings-note">
              Solo se enseñan los últimos caracteres: que la guardaras tú no es motivo
              para poder leerla entera desde el navegador.
            </p>
          </>
        ) : null}

        <Field label={estado?.configurada ? 'Cambiar la clave' : 'Clave de API'}>
          <Input
            value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={ayuda.placeholder} autoComplete="off" spellCheck={false}
          />
        </Field>

        {error && <FormNote>{error}</FormNote>}

        <div className="helm-modal-actions">
          {estado?.configurada && (
            <button type="button" className="helm-btn" onClick={borrar} disabled={busy}>
              <Trash2 size={15} /> Quitar
            </button>
          )}
          <button type="button" className="helm-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="helm-btn primary" disabled={busy || !apiKey.trim()}>
            {busy ? 'Comprobando…' : 'Guardar'}
          </button>
        </div>
        <p className="helm-settings-note">
          Se prueba contra el proveedor antes de guardarla: si no vale, te lo digo ahora y
          no en mitad de la primera búsqueda.
        </p>
      </form>
    </Modal>
  )
}

// ── Por dónde se ha pasado ya ───────────────────────────────────────────────
function ModalHistorial({ clientId, onClose }) {
  const [busquedas, setBusquedas] = useState(null)

  useEffect(() => {
    prospeccionApi.busquedas(clientId).then(r => setBusquedas(r.busquedas)).catch(() => setBusquedas([]))
  }, [clientId])

  return (
    <Modal title="Búsquedas hechas" onClose={onClose} wide>
      {busquedas === null ? <Empty>Cargando…</Empty>
        : busquedas.length === 0 ? <Empty>Todavía no has buscado nada.</Empty>
          : (
            <div className="helm-prosp-hist">
              {busquedas.map(b => (
                <div key={b.id} className="helm-prosp-histrow">
                  <div>
                    <b>{b.consulta || `${b.tipo} en ${b.zona}`}</b>
                    <small>{fmtDate(b.created_at)}{b.lanzada_por ? ` · ${b.lanzada_por}` : ''}</small>
                  </div>
                  <span className={'helm-prosp-fuente ' + (b.fuente || 'maps')}>
                    {FUENTE_MAP[b.fuente]?.nombre || 'Google Maps'}
                  </span>
                  <span className="helm-chip">{b.encontrados} encontrados</span>
                  <span className={'helm-chip' + (b.nuevos ? ' green' : '')}>{b.nuevos} nuevos</span>
                </div>
              ))}
            </div>
          )}
      <p className="helm-settings-note">
        <AlertTriangle size={12} /> Sirve para no repetir trabajo: si ya buscaste
        «peluquerías en Valencia» la semana pasada, aquí lo ves — y en Maps, además,
        para no pagar dos veces la misma zona.
      </p>
    </Modal>
  )
}
