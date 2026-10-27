// HELM — Estudio de contenido: la parte «de verdad» del Informe.
//
// El informe de siempre (Metricas.jsx) dice qué pasó con las cifras. Esto va un
// paso más allá: diagnostica la cuenta con sus datos, pone objetivos por etapas
// (1.000 → 10.000 → 100.000 seguidores…), traza un plan de cuatro semanas, saca
// el avatar de contenido —a quién hablarle, que no es el avatar de ventas— y
// aprende de una semana a la siguiente. Y, de paso, enseña cómo funcionan el
// algoritmo y las métricas de Instagram, con su fuente, para que el usuario no
// dependa de nosotros para entenderlo.
//
// Los NÚMEROS los calcula el servidor (api/estudio-contenido.js, con las piezas
// ya guardadas: no gasta cuota de Meta); el TEXTO lo escribe la IA con una
// herramienta de salida estructurada. Aquí solo se pinta lo que llega: ni una
// cifra se inventa en el navegador. `datos` = lo medido; `estudio` = lo dicho.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles, RefreshCw, Target, TrendingUp, FlaskConical, Users, Lightbulb,
  AlertTriangle, ChevronDown, CircleCheck, CircleX, Clock, BookOpen, ArrowUpRight,
  Gauge, Flag, ListChecks, Compass,
} from 'lucide-react'
import { estudioContenidoApi } from '../lib'
import { Select, Empty } from '../ui'

// Mismos formateadores que el informe, para que las cifras se lean igual en las
// dos secciones. `always`: en español 7308 sale sin punto por defecto.
const num = (v) => (v == null ? '—' : Math.round(v).toLocaleString('es-ES', { useGrouping: 'always' }))
const dec = (v) => (v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const seg = (v) => (v == null ? '—' : `${dec(v)} s`)
// Las fechas de solo día (fecha_estimada, vence, desde/hasta) llegan como
// '2027-03-01' y new Date() las lee a medianoche UTC: en husos negativos
// (Latinoamérica) saldría el día anterior. Con T12:00:00 cae el mismo día en
// todos lados. Los sellos con hora (generado_en) ya traen su zona.
const aFecha = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(`${f}T12:00:00`) : new Date(f))
const fechaCorta = (f) => (f ? aFecha(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fechaHora = (f) => (f ? aFecha(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—')
const aLista = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])

// El coste del estudio para la agencia, en CRÉDITOS: es lo que ve en su saldo
// (1 € = 100 créditos, como CREDITOS_POR_EURO en api/_lib/creditos.js; aquí no
// se importa, es del servidor). El servidor lo manda en euros. Si no paga
// (coste 0), es gratis: nunca «cuesta unos 0 créditos» (contrato F).
const CREDITOS_POR_EURO = 100
const enCreditos = (eur) => `unos ${num(Math.max(1, Math.round(Number(eur) * CREDITOS_POR_EURO)))} créditos`
const esGratis = (eur) => Number(eur) === 0
const costeTexto = (eur) => (eur == null ? null : esGratis(eur) ? 'Gratis en tu agencia' : `Cuesta ${enCreditos(eur)}`)

// Cada métrica se lee con sus decimales y su unidad: la retención en segundos,
// las tasas «por mil» por cada 1.000 visitas, la frecuencia en piezas/semana y
// las cuentas (visitas, alcance, seguidores) en enteros con miles. Sin esto, un
// objetivo de retención 7,8 → 8,6 s saldría «8 → 9» y perdería el sentido.
function fmtMetrica(valor, metrica = '') {
  if (valor == null) return '—'
  const m = String(metrica).toLowerCase()
  if (m.includes('retencion')) return seg(valor)
  if (m.includes('por_mil')) return `${dec(valor)} por mil`
  if (m.includes('frecuencia') || m.includes('semana')) return `${dec(valor)}/semana`
  if (m.includes('visita') || m.includes('alcance') || m.includes('seguidor') || m.includes('pieza')) return num(valor)
  return dec(valor)
}
const NOMBRE_METRICA = {
  visitas: 'visitas', alcance: 'alcance', seguidores: 'seguidores',
  retencion_s: 'retención', guardados_por_mil: 'guardados por mil',
  compartidos_por_mil: 'compartidos por mil', likes_por_mil: 'likes por mil',
  interacciones_por_mil: 'interacciones por mil', frecuencia: 'frecuencia',
}
const nombreMetrica = (m) => NOMBRE_METRICA[m] || (m ? String(m).replace(/_/g, ' ') : null)

// Qué significan las tres etiquetas de confianza, para que nadie confunda lo que
// dice Instagram con un estudio de terceros o una regla del oficio.
const ETIQUETAS = {
  OFICIAL: 'Lo dice Instagram o Meta: su web, su ayuda, su documentación o declaraciones de Mosseri recogidas por la prensa.',
  DATOS: 'Sale de estudios de terceros con muchas cuentas (Metricool, Socialinsider, Buffer…), no de Instagram.',
  'HEURÍSTICA': 'Práctica habitual del sector o criterio de HELM, sin un dato que lo demuestre. Úsalo como pista, no como ley.',
}
// La etiqueta es un botón: al pulsarla (ratón o teclado) despliega su
// explicación, así también vale en móvil y con lector de pantalla. Mantiene el
// `title` y un aria-label para quien use el ratón o un lector.
function Etiqueta({ valor }) {
  const [abierto, setAbierto] = useState(false)
  if (!valor) return null
  const clave = ETIQUETAS[valor] ? valor : 'HEURÍSTICA'
  const texto = ETIQUETAS[clave]
  const slug = clave.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return (
    <span className="ec-etq-wrap">
      <button
        type="button" className={`ec-etq ec-etq-${slug}`} title={texto}
        aria-expanded={abierto} aria-label={`${valor}: ${texto}`}
        onClick={() => setAbierto(v => !v)}
      >
        {valor}
      </button>
      {abierto && <span className="ec-etq-pop" role="note">{texto}</span>}
    </span>
  )
}

// La traducción del fallo de `ahora` a algo que el usuario entienda. Nos fiamos
// del `codigo` del servidor (o del status que apiFetch deja en el error), no de
// adivinar por el texto: «un estudio en curso desde hoy» no es un 429.
function mensajeDeFallo(e) {
  const codigo = e?.codigo
  const status = e?.status
  if (codigo === 'sin_saldo' || status === 402) return 'Sin saldo: recarga créditos para generar el estudio.'
  if (codigo === 'tope_diario' || status === 429) return 'Ya has pedido 3 estudios hoy. Prueba de nuevo mañana.'
  if (codigo === 'en_curso' || status === 409) return 'Ya hay un estudio en marcha. Espera a que termine.'
  if (codigo === 'sin_instagram' || status === 400) return 'Conecta tu Instagram para poder generar el estudio.'
  return (typeof e?.message === 'string' && e.message) || 'No se ha podido generar el estudio.'
}
// Un 409 no es un error: ya hay uno en curso (el cron del lunes, otra pestaña…).
// En vez de avisar, nos enganchamos a su progreso.
const esEnCurso = (e) => e?.codigo === 'en_curso' || e?.status === 409

function Bloque({ icono, titulo, sub, children, className = '' }) {
  return (
    <section className={`ec-bloque ${className}`}>
      <header className="ec-bloque-cab">
        <h3>{icono} {titulo}</h3>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </section>
  )
}

// 1) Etapa — la barra hacia el siguiente hito, el ritmo y qué cambia aquí.
function Etapa({ datos, estudio }) {
  const c = datos?.cuenta || {}
  const et = datos?.etapa || {}
  const texto = estudio?.etapa || {}
  const prog = Math.max(0, Math.min(1, et.progreso ?? 0))
  const ritmo = et.ritmo_dia
  const sinHistorial = ritmo == null
  const noCrece = ritmo != null && ritmo <= 0
  return (
    <Bloque icono={<Flag size={16} />} titulo={texto.nombre || 'Tu etapa ahora'} className="ec-etapa">
      <div className="ec-progreso">
        <div className="ec-progreso-cifras">
          <b>{num(c.seguidores)}</b>
          <span>de {num(et.siguiente_hito)} seguidores</span>
        </div>
        <div className="ec-progreso-barra" role="progressbar" aria-valuenow={Math.round(prog * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${prog * 100}%` }} />
        </div>
        <div className="ec-progreso-pies">
          <span>{num(et.hito_anterior)}</span>
          <span>{num(et.siguiente_hito)}</span>
        </div>
      </div>
      <div className="ec-etapa-ritmo">
        <div>
          <span className="ec-dato-lbl"><TrendingUp size={13} /> Ritmo</span>
          <b>{sinHistorial ? 'Sin histórico aún' : noCrece ? 'La cuenta no está creciendo' : `${dec(ritmo)} seguidores/día`}</b>
          <small>
            {sinHistorial
              ? `Vuelve en unos días: con ${num(et.dias_historial)} días de histórico todavía no se puede medir el ritmo.`
              : noCrece
                ? 'Ahora mismo no gana seguidores netos: toca recuperar el crecimiento antes de ponerle fecha al siguiente hito.'
                : (et.fecha_estimada
                  ? `A este paso llegas sobre el ${fechaCorta(et.fecha_estimada)}.`
                  : 'A este paso, el siguiente hito queda a más de diez años: hace falta acelerar.')}
          </small>
        </div>
        {et.ritmo_necesario_90d != null && (
          <div>
            <span className="ec-dato-lbl"><Target size={13} /> Para 90 días</span>
            <b>{dec(et.ritmo_necesario_90d)} al día</b>
            <small>Lo que tendrías que ganar cada día para alcanzar el hito en tres meses.</small>
          </div>
        )}
      </div>
      {texto.que_cambia && <p className="ec-etapa-cambia">{texto.que_cambia}</p>}
    </Bloque>
  )
}

// Estado de un objetivo del estudio anterior (contrato A). Si el servidor no
// manda `estado`, lo deducimos del `cumplido` para no romper con datos viejos.
function estadoObjetivo(o) {
  if (o.estado === 'cumplido' || o.estado === 'no_cumplido' || o.estado === 'en_curso') return o.estado
  if (o.cumplido === true) return 'cumplido'
  if (o.cumplido === false) return 'no_cumplido'
  return 'en_curso'
}
const ESTADO_OBJ = {
  cumplido: { label: 'Cumplido', icono: <CircleCheck size={16} />, cls: 'ok' },
  no_cumplido: { label: 'No cumplido', icono: <CircleX size={16} />, cls: 'no' },
  en_curso: { label: 'En curso', icono: <Clock size={16} />, cls: 'curso' },
}

// 2) Objetivos — tarjetas con actual → objetivo, y, si hay estudio anterior, el
// repaso de qué se cumplió, no se cumplió o sigue en curso (con su avance y la
// fecha en que vence).
function Objetivos({ estudio, datos }) {
  const objetivos = aLista(estudio?.objetivos)
  const anterior = datos?.desde_anterior
  const anterioresLista = aLista(anterior?.objetivos)
  if (!objetivos.length && !anterioresLista.length) return null
  return (
    <Bloque icono={<Target size={16} />} titulo="Objetivos" sub="A dónde apuntar y por qué. Pocos y medibles.">
      {anterioresLista.length > 0 && (
        <div className="ec-anterior">
          <p className="ec-anterior-tit">Desde el estudio del {fechaCorta(anterior.generado_en)}</p>
          <ul className="ec-anterior-lista">
            {anterioresLista.map((o, i) => {
              const est = ESTADO_OBJ[estadoObjetivo(o)]
              const avance = est.cls === 'curso' && o.avance != null ? Math.max(0, Math.min(1, o.avance)) : null
              return (
                <li key={i} className={est.cls}>
                  <span className="ec-anterior-estado">{est.icono} {est.label}</span>
                  <span className="ec-anterior-nombre">{o.nombre}</span>
                  <span className="ec-anterior-cifra">
                    {fmtMetrica(o.antes, o.metrica)} → <b>{fmtMetrica(o.ahora, o.metrica)}</b> <small>(meta {fmtMetrica(o.objetivo, o.metrica)})</small>
                  </span>
                  {avance != null && (
                    <span className="ec-anterior-avance" title={`${Math.round(avance * 100)} % del camino`}>
                      <i style={{ width: `${avance * 100}%` }} />
                    </span>
                  )}
                  {est.cls === 'curso' && o.vence && <span className="ec-anterior-vence">vence el {fechaCorta(o.vence)}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {objetivos.length > 0 && (
        <div className="ec-obj-rejilla">
          {objetivos.map((o, i) => (
            <article key={i} className="ec-obj">
              <h4>{o.nombre}</h4>
              {nombreMetrica(o.metrica) && <span className="ec-obj-metrica">{nombreMetrica(o.metrica)}</span>}
              <div className="ec-obj-salto">
                <span className="act">{fmtMetrica(o.actual, o.metrica)}</span>
                <ArrowUpRight size={15} />
                <span className="obj">{fmtMetrica(o.objetivo, o.metrica)}</span>
              </div>
              <span className="ec-obj-plazo"><Clock size={12} /> {o.plazo_dias != null ? `en ${num(o.plazo_dias)} días` : 'sin plazo'}</span>
              {o.por_que && <p>{o.por_que}</p>}
            </article>
          ))}
        </div>
      )}
    </Bloque>
  )
}

// 3) Diagnóstico — dos columnas: lo que funciona y lo que no, con la evidencia
// en números al lado de cada hallazgo.
function ColumnaDiagnostico({ titulo, items, tono }) {
  const lista = aLista(items)
  if (!lista.length) return null
  return (
    <div className={`ec-diag-col ${tono}`}>
      <h4>{titulo}</h4>
      <ul>
        {lista.map((d, i) => (
          <li key={i}>
            <b>{d.hallazgo}</b>
            {d.evidencia && <span className="ec-diag-evi">{d.evidencia}</span>}
            {d.por_que && <small>{d.por_que}</small>}
          </li>
        ))}
      </ul>
    </div>
  )
}
function Diagnostico({ estudio }) {
  const d = estudio?.diagnostico || {}
  if (!aLista(d.funciona).length && !aLista(d.no_funciona).length) return null
  return (
    <Bloque icono={<Gauge size={16} />} titulo="Diagnóstico" sub="Qué está tirando de la cuenta y qué la frena, según sus propias cifras.">
      <div className="ec-diag">
        <ColumnaDiagnostico titulo="Lo que funciona" items={d.funciona} tono="ok" />
        <ColumnaDiagnostico titulo="Lo que no funciona" items={d.no_funciona} tono="no" />
      </div>
    </Bloque>
  )
}

// 4) Plan de 4 semanas — acordeón. La primera abierta; dentro, foco, acciones y
// las piezas a grabar (tema, ángulo, formato y gancho).
function SemanaPlan({ s, abierta, onToggle }) {
  const piezas = aLista(s.piezas)
  const acciones = aLista(s.acciones)
  return (
    <div className={`ec-semana ${abierta ? 'abierta' : ''}`}>
      <button type="button" className="ec-semana-cab" onClick={onToggle} aria-expanded={abierta}>
        <span className="ec-semana-n">Semana {s.semana}</span>
        <span className="ec-semana-foco">{s.foco}</span>
        <ChevronDown size={18} className="ec-chevron" />
      </button>
      {abierta && (
        <div className="ec-semana-cuerpo">
          {acciones.length > 0 && (
            <ul className="ec-acciones">
              {acciones.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
          {piezas.length > 0 && (
            <div className="ec-piezas">
              {piezas.map((p, i) => (
                <article key={i} className="ec-pieza">
                  <div className="ec-pieza-cab">
                    <b>{p.tema}</b>
                    {p.formato && <span className="ec-chip">{p.formato}</span>}
                  </div>
                  {p.angulo && <p className="ec-pieza-angulo">{p.angulo}</p>}
                  {p.gancho && <p className="ec-pieza-gancho">“{p.gancho}”</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
function Plan({ estudio }) {
  const plan = aLista(estudio?.plan).slice().sort((a, b) => (a.semana || 0) - (b.semana || 0))
  const [abierta, setAbierta] = useState(plan[0]?.semana ?? 1)
  if (!plan.length) return null
  return (
    <Bloque icono={<ListChecks size={16} />} titulo="Plan de 4 semanas" sub="El trabajo repartido. Abre cada semana para ver el foco y las piezas.">
      <div className="ec-plan">
        {plan.map((s) => (
          <SemanaPlan key={s.semana} s={s} abierta={abierta === s.semana} onToggle={() => setAbierta(a => (a === s.semana ? null : s.semana))} />
        ))}
      </div>
    </Bloque>
  )
}

// 5) Experimentos — una hipótesis por tarjeta, con qué se cambia, cómo se mide y
// cuándo se da por ganada.
function Experimentos({ estudio }) {
  const exps = aLista(estudio?.experimentos)
  if (!exps.length) return null
  return (
    <Bloque icono={<FlaskConical size={16} />} titulo="Experimentos" sub="Pruebas con una sola variable: así se sabe qué mover de verdad.">
      <div className="ec-exp-rejilla">
        {exps.map((x, i) => (
          <article key={i} className="ec-exp">
            <h4>{x.hipotesis}</h4>
            <dl>
              {x.variable && <><dt>Variable</dt><dd>{x.variable}</dd></>}
              {x.como && <><dt>Cómo</dt><dd>{x.como}</dd></>}
              {x.metrica && <><dt>Métrica</dt><dd>{x.metrica}</dd></>}
              {x.criterio_exito && <><dt>Gana si</dt><dd>{x.criterio_exito}</dd></>}
              {x.duracion && <><dt>Dura</dt><dd>{x.duracion}</dd></>}
            </dl>
          </article>
        ))}
      </div>
    </Bloque>
  )
}

// 6) Avatar de contenido — a quién hablarle en el contenido. Es OTRO avatar que
// el de ventas (ese sale del CRM, en Avatar.jsx): este dice a quién enganchar.
function ListaChips({ titulo, items }) {
  const lista = aLista(items)
  if (!lista.length) return null
  return (
    <div className="ec-av-chips">
      <span className="ec-dato-lbl">{titulo}</span>
      <div>{lista.map((v, i) => <span key={i} className="ec-chip">{v}</span>)}</div>
    </div>
  )
}
function ListaPuntos({ titulo, items, tono }) {
  const lista = aLista(items)
  if (!lista.length) return null
  return (
    <div className={`ec-av-lista ${tono || ''}`}>
      <span className="ec-dato-lbl">{titulo}</span>
      <ul>{lista.map((v, i) => <li key={i}>{v}</li>)}</ul>
    </div>
  )
}
function AvatarContenido({ estudio }) {
  const a = estudio?.avatar_contenido
  if (!a) return null
  return (
    <Bloque icono={<Compass size={16} />} titulo="Avatar de contenido" sub="A quién le hablas en los vídeos. No es tu avatar de ventas (ese sale del CRM); este es a quién enganchar.">
      {a.a_quien_hablar && (
        <div className="ec-av-retrato">
          <Users size={22} />
          <div>
            <p className="ec-av-descripcion">{a.a_quien_hablar}</p>
            {a.nivel_consciencia && <span className="ec-chip ec-chip-fuerte">Nivel de consciencia: {a.nivel_consciencia}</span>}
          </div>
        </div>
      )}
      <div className="ec-av-cols">
        <ListaPuntos titulo="Qué le duele" items={a.dolores} tono="no" />
        <ListaPuntos titulo="Qué desea" items={a.deseos} tono="ok" />
        <ListaPuntos titulo="Qué le frena (objeciones)" items={a.objeciones} />
      </div>
      <div className="ec-av-cols">
        <ListaPuntos titulo="Temas que enganchan" items={a.temas_que_enganchan} tono="ok" />
        <ListaPuntos titulo="Temas que no" items={a.temas_que_no} tono="no" />
      </div>
      <ListaChips titulo="Su vocabulario" items={a.vocabulario} />
      {a.a_quien_no && <p className="ec-av-nota"><b>A quién no:</b> {a.a_quien_no}</p>}
      {a.diferencia_con_ventas && <p className="ec-av-nota"><b>Frente al avatar de ventas:</b> {a.diferencia_con_ventas}</p>}
    </Bloque>
  )
}

// 7) Lo aprendido — las reglas que van saliendo semana a semana, con su estado.
// en prueba = hipótesis con 1-4 pares; confirmada = 5 o más en la misma
// dirección; una confirmada que falla dos veces vuelve a prueba.
const ESTADO_APRENDIDO = {
  confirmada: { label: 'Confirmada', icono: <CircleCheck size={15} /> },
  descartada: { label: 'Descartada', icono: <CircleX size={15} /> },
  en_prueba: { label: 'En prueba', icono: <Clock size={15} /> },
}
function Aprendido({ estudio }) {
  const reglas = aLista(estudio?.aprendido)
  if (!reglas.length) return null
  return (
    <Bloque icono={<Lightbulb size={16} />} titulo="Lo aprendido" sub="Lo que la cuenta ya ha demostrado (o descartado). Las reglas se vuelven a probar de vez en cuando: los modelos de Instagram cambian.">
      <ul className="ec-aprendido">
        {reglas.map((r, i) => {
          const est = ESTADO_APRENDIDO[r.estado] || ESTADO_APRENDIDO.en_prueba
          return (
            <li key={i} className={`est-${r.estado || 'en_prueba'}`}>
              <span className="ec-aprendido-est">{est.icono} {est.label}</span>
              <b>{r.regla}</b>
              {r.evidencia && <small>{r.evidencia}</small>}
            </li>
          )
        })}
      </ul>
    </Bloque>
  )
}

// 8) Métricas a vigilar — cada una con su umbral y su etiqueta de confianza.
function MetricasVigilar({ estudio }) {
  const metricas = aLista(estudio?.metricas_a_vigilar)
  if (!metricas.length) return null
  return (
    <Bloque icono={<Gauge size={16} />} titulo="Métricas a vigilar" sub="Las pocas cifras que importan de verdad, y a partir de qué número preocuparse. Toca cada etiqueta para ver de dónde sale el dato.">
      <ul className="ec-vigilar">
        {metricas.map((m, i) => (
          <li key={i}>
            <div className="ec-vigilar-cab">
              <b>{m.metrica}</b>
              <Etiqueta valor={m.etiqueta} />
            </div>
            {m.umbral && <span className="ec-vigilar-umbral">{m.umbral}</span>}
            {m.por_que && <small>{m.por_que}</small>}
          </li>
        ))}
      </ul>
    </Bloque>
  )
}

// 9) Cómo funciona el algoritmo — desplegable. No sale del estudio del perfil,
// sino de la base de conocimiento (la misma para todos): está para aprender.
function Algoritmo({ algoritmo }) {
  const puntos = aLista(algoritmo)
  const [abierto, setAbierto] = useState(false)
  if (!puntos.length) return null
  return (
    <section className="ec-bloque ec-algoritmo">
      <button type="button" className="ec-algoritmo-cab" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}>
        <span><BookOpen size={16} /> Cómo funciona el algoritmo de Instagram</span>
        <ChevronDown size={18} className={`ec-chevron ${abierto ? 'abierto' : ''}`} />
      </button>
      {abierto && (
        <div className="ec-algoritmo-cuerpo">
          {puntos.map((p, i) => (
            <article key={i} className="ec-algo-punto">
              <div className="ec-algo-cab">
                <b>{p.titulo}</b>
                <Etiqueta valor={p.etiqueta} />
              </div>
              <p>{p.texto}</p>
              {p.fuente && (
                /^https?:\/\//.test(p.fuente)
                  ? <a href={p.fuente} target="_blank" rel="noopener noreferrer">Fuente <ArrowUpRight size={12} /></a>
                  : <span className="ec-algo-fuente">{p.fuente}</span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function Avisos({ avisos }) {
  const lista = aLista(avisos)
  if (!lista.length) return null
  return (
    <div className="ec-avisos">
      <AlertTriangle size={15} />
      <ul>{lista.map((a, i) => <li key={i}>{a}</li>)}</ul>
    </div>
  )
}

// Las cifras que dan pie al estudio, en pequeño, para que el texto de la IA no
// quede en el aire. Salen de `datos` (lo medido). Las tasas «por mil» van por
// cada 1.000 visitas, y las piezas de menos de 72 h aún no cuentan en las
// medianas (siguen cogiendo visitas) — contrato B.
function Resumen({ datos }) {
  const m = datos?.medianas || {}
  const c = datos?.cuenta || {}
  const recientes = c.piezas_recientes
  return (
    <div className="ec-resumen">
      <div className="ec-resumen-tiles">
        <div className="ec-tile"><span>Piezas</span><b>{num(c.piezas)}</b></div>
        <div className="ec-tile"><span>Visitas (mediana)</span><b>{num(m.visitas)}</b></div>
        <div className="ec-tile"><span>Retención (mediana)</span><b>{seg(m.retencion_s)}</b></div>
        <div className="ec-tile"><span>Guardados por mil</span><b>{dec(m.guardados_por_mil)}</b></div>
        <div className="ec-tile"><span>Compartidos por mil</span><b>{dec(m.compartidos_por_mil)}</b></div>
      </div>
      <p className="ec-resumen-nota">
        Las tasas «por mil» van por cada 1.000 visitas.{' '}
        {recientes
          ? `${num(recientes)} ${recientes === 1 ? 'pieza tiene' : 'piezas tienen'} menos de 72 h y todavía no ${recientes === 1 ? 'cuenta' : 'cuentan'} en las medianas.`
          : 'Las piezas de menos de 72 h todavía no cuentan en las medianas: siguen cogiendo visitas.'}
      </p>
    </div>
  )
}

export default function EstudioContenido({ clientId, onHayEstudio }) {
  const [base, setBase] = useState(null)   // respuesta de de(): estudio + historial + algoritmo…
  const [activo, setActivo] = useState(null) // el estudio que se está mirando (el último o uno del historial)
  const [error, setError] = useState(null) // fallo al cargar/ver (GET)
  const [fallo, setFallo] = useState(null) // fallo al pedir uno nuevo (402/429/400)
  const [pidiendo, setPidiendo] = useState(false)
  const [reintento, setReintento] = useState(0) // sube en cada fallo del sondeo para reprogramarlo
  // Avisar al Informe de si ya hay un estudio LISTO (para esconder el resumen
  // rápido) sin meter `onHayEstudio` en las dependencias de `cargar`: el padre
  // podría pasar una función nueva en cada render y recargaríamos sin parar.
  const avisarRef = useRef(onHayEstudio)
  useEffect(() => { avisarRef.current = onHayEstudio }, [onHayEstudio])
  // El id que el usuario eligió del historial (null = seguir el último). Así el
  // sondeo no le pisa la elección cada 10 s. `elegidoEnCursoRef` dice si lo
  // eligió mientras estaba en curso.
  const elegidoRef = useRef(null)
  const elegidoEnCursoRef = useRef(false)

  const cargar = useCallback(
    () => estudioContenidoApi.de(clientId)
      .then(d => {
        setBase(d)
        setError(null)
        // Solo un estudio LISTO cuenta: ni un 'error' ni uno 'en_curso' esconden
        // el resumen rápido del Informe.
        avisarRef.current?.(d?.estudio?.estado === 'listo')
        // La elección se suelta si ya es la última lista, o si se eligió en
        // curso y ya ha terminado (bien o mal): si no, la pantalla se quedaría
        // en «Estudiando…» para siempre, con el sondeo ya parado.
        const elegido = elegidoRef.current
        if (elegido) {
          const fila = aLista(d?.historial).find(h => h.id === elegido)
          if (elegido === d?.estudio?.id || (elegidoEnCursoRef.current && fila?.estado !== 'en_curso')) {
            elegidoRef.current = null
            elegidoEnCursoRef.current = false
          }
        }
        if (!elegidoRef.current) setActivo(d?.estudio || null)
      })
      .catch(e => { setError(e.message); setReintento(n => n + 1) }),
    [clientId],
  )
  useEffect(() => { cargar() }, [cargar])

  // Mientras hay uno en curso, se vuelve a preguntar cada 10 s hasta que el
  // servidor lo dé por terminado (o fallado). `reintento` entra en las
  // dependencias para que, si un `de()` falla (corte de red, despliegue), el
  // sondeo se reprograme en vez de pararse para siempre.
  useEffect(() => {
    if (!base?.en_curso) return
    const t = setTimeout(cargar, 10000)
    return () => clearTimeout(t)
  }, [base, cargar, reintento])

  async function generar() {
    setFallo(null); setPidiendo(true)
    elegidoRef.current = null  // al generar uno nuevo, volvemos a seguir el último
    try {
      await estudioContenidoApi.ahora(clientId)
      // Encolado: lo marcamos en curso al vuelo y dejamos que el sondeo lo siga.
      setBase(b => ({ ...(b || {}), en_curso: true }))
    } catch (e) {
      if (esEnCurso(e)) setBase(b => ({ ...(b || {}), en_curso: true }))
      else setFallo(mensajeDeFallo(e))
    }
    setPidiendo(false)
  }

  async function verDelHistorial(id) {
    setError(null)
    // El último ya lo tenemos en memoria: no hace falta ir al servidor.
    if (!id || id === (base?.estudio?.id || '')) {
      elegidoRef.current = null
      elegidoEnCursoRef.current = false
      setActivo(base?.estudio || null)
      return
    }
    elegidoRef.current = id
    elegidoEnCursoRef.current = false
    try {
      const d = await estudioContenidoApi.ver(clientId, id)
      // ?action=ver devuelve { estudio: fila } con la fila entera (id, estado,
      // datos, estudio, modelo). La fila tiene su PROPIO campo `estudio` (el
      // texto de la IA), así que solo desenvolvemos si `d.estudio` tiene forma
      // de fila; si no, es que ya llega la fila suelta.
      const e = d?.estudio
      const fila = e && typeof e === 'object' && ('estado' in e || 'datos' in e) ? e : d
      elegidoEnCursoRef.current = fila?.estado === 'en_curso'
      setActivo(fila)
    } catch (e) { setError(e.message) }
  }

  if (error && !base) return <Empty>{error}</Empty>
  if (!base) return <Empty>Cargando el estudio de contenido…</Empty>
  // Sin Instagram no hay nada que estudiar: Metricas ya enseña el panel de
  // contacto (SinInstagram), así que aquí no pintamos ni el botón.
  if (!base.conectado) return null

  const enCurso = base.en_curso || activo?.estado === 'en_curso'
  const hayEstudio = activo?.estado === 'listo'
  const historial = aLista(base.historial)
  const viendoViejo = hayEstudio && base.estudio?.id && activo?.id && activo.id !== base.estudio.id
  // El último pedido falló (lo cuenta el servidor), salvo que haya otro fallo
  // más inmediato (el de pedir) o uno nuevo en marcha.
  const ultimoError = base.ultimo_error && !enCurso && !fallo ? base.ultimo_error : null
  // Un estudio fallido elegido del historial: si es ese mismo último fallo, ya
  // lo cuenta el aviso de ultimo_error (con lo que se cobró) y no se repite.
  const falloElegido = activo?.estado === 'error' && !enCurso && activo.generado_en !== ultimoError?.generado_en
  const coste = costeTexto(base.coste_aprox_eur)

  return (
    <div className="ec">
      <header className="ec-cab">
        <div className="ec-cab-tit">
          <h2><Sparkles size={18} /> Estudio de contenido</h2>
          <p>
            {hayEstudio
              ? `${viendoViejo ? 'Estudio del' : 'Último estudio:'} ${fechaHora(activo.generado_en)}${activo.modelo ? ` · ${activo.modelo}` : ''}`
              : 'Un análisis a fondo de tu cuenta, con objetivos, plan y avatar de contenido.'}
            {coste && <> · {esGratis(base.coste_aprox_eur) ? 'gratis en tu agencia' : `cada estudio, ${enCreditos(base.coste_aprox_eur)}`}</>}
          </p>
        </div>
        <div className="ec-cab-acciones">
          {historial.length > 1 && (
            <Select value={activo?.id || ''} onChange={e => verDelHistorial(e.target.value)} aria-label="Elegir un estudio del historial">
              {historial.map(h => (
                <option key={h.id} value={h.id}>
                  {fechaHora(h.generado_en)}{h.estado === 'en_curso' ? ' (en curso)' : h.estado === 'error' ? ' (falló)' : ''}
                </option>
              ))}
            </Select>
          )}
          <button type="button" className="ec-btn" onClick={generar} disabled={enCurso || pidiendo}>
            {enCurso
              ? <><RefreshCw size={15} className="ec-gira" /> Estudiando…</>
              : <><Sparkles size={15} /> {hayEstudio ? 'Actualizar estudio' : 'Generar estudio'}</>}
          </button>
        </div>
      </header>

      {fallo && <div className="ec-fallo"><AlertTriangle size={15} /> {fallo}</div>}
      {/* Un fallo al cargar/sondear o al abrir uno del historial, cuando ya hay base. */}
      {error && base && <div className="ec-fallo"><AlertTriangle size={15} /> {error}</div>}
      {/* El último pedido falló (lo cuenta el servidor): mensaje para el usuario, nunca el error interno, y un botón para reintentar. */}
      {ultimoError && (
        <div className="ec-fallo ec-fallo-reintento">
          <AlertTriangle size={15} />
          <div className="ec-fallo-cuerpo">
            <span>{ultimoError.mensaje}</span>
            <button type="button" className="ec-reintentar" onClick={generar} disabled={pidiendo}>
              <RefreshCw size={14} /> Reintentar
            </button>
          </div>
        </div>
      )}
      {/* Un estudio del historial que quedó en error: texto neutro, sin el
          fallo interno. Sobre el cobro no se afirma nada que la pantalla no
          sabe: el worker cobra lo que la IA llegó a gastar antes de fallar. */}
      {falloElegido && (
        <div className="ec-fallo">
          <AlertTriangle size={15} /> No se pudo terminar el estudio del {fechaCorta(activo.generado_en)}. Si llegó a usar la IA, solo se cobró lo que usó. Prueba a generarlo otra vez.
        </div>
      )}

      {enCurso && (
        <div className="ec-corriendo">
          <Sparkles size={22} />
          <div>
            <b>Estudiando tu cuenta a fondo…</b>
            <span>Mide tus piezas, te pone objetivos y traza el plan. Puede tardar un par de minutos; puedes salir y volver.</span>
          </div>
        </div>
      )}

      {!hayEstudio && !enCurso && (
        <div className="ec-vacio">
          <Sparkles size={38} />
          <h3>Convierte tus cifras en un plan</h3>
          <p>
            La IA lee tus piezas y te devuelve un estudio de verdad: en qué etapa estás y qué hacer para subir de nivel,
            qué está funcionando y qué no, un plan de cuatro semanas con las piezas a grabar, tu avatar de contenido y las
            métricas que vigilar. Y aprende de lo que ya has probado.
          </p>
          <button type="button" className="ec-btn grande" onClick={generar} disabled={pidiendo}>
            <Sparkles size={17} /> Generar estudio
          </button>
          {coste && <p className="ec-coste-boton">{coste}</p>}
          {base.algoritmo && <p className="ec-vacio-nota">Mientras tanto, abajo tienes cómo funciona el algoritmo de Instagram, con sus fuentes.</p>}
          <Algoritmo algoritmo={base.algoritmo} />
        </div>
      )}

      {hayEstudio && (
        <>
          {activo.estudio?.resumen && <p className="ec-cabecera-resumen">{activo.estudio.resumen}</p>}
          <Resumen datos={activo.datos} />
          <Avisos avisos={[...aLista(activo.datos?.avisos), ...aLista(activo.estudio?.avisos)]} />
          <Etapa datos={activo.datos} estudio={activo.estudio} />
          <Objetivos estudio={activo.estudio} datos={activo.datos} />
          <Diagnostico estudio={activo.estudio} />
          <Plan estudio={activo.estudio} />
          <Experimentos estudio={activo.estudio} />
          <AvatarContenido estudio={activo.estudio} />
          <Aprendido estudio={activo.estudio} />
          <MetricasVigilar estudio={activo.estudio} />
          <Algoritmo algoritmo={base.algoritmo} />
        </>
      )}
    </div>
  )
}
