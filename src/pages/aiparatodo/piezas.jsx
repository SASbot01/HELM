// AI para todo — las piezas que son solo suyas: el fondo ASCII de la bio, el
// bloque de HELM, las dos guías en PDF (los Mods y los no negociables) y el
// cuerpo de un post de skills. El resto lo pinta el motor de las comunidades
// (src/pages/comunidad/Comunidad.jsx) con la configuración de ./config.jsx.
import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, Download, ExternalLink, FileText, Github, Workflow, AlertTriangle,
} from 'lucide-react'
import { track } from '../inicio/socio/track.js'
import { Rico, Bloque, IndiceCapitulo, Codigo, Prompt } from '../comunidad/bloques.jsx'
import mascara from '../inicio/mascara.txt?raw'
import aiArte from '../inicio/ai.txt?raw'
import { NN_RUTA } from './contenido.js'
// HELM: su web (qué es y cómo funciona) y el registro.
const HELM_WEB = 'https://helm.s4sf.net/web'
const HELM_REGISTRO = 'https://helm.s4sf.net/registro'
import { NN_PDF, NN_PORTADA_3D, NN_INTRO, NN_PUNTOS, NN_ORDEN } from './noNegociables.js'
import {
  MODOS_RUTA, MODOS_PDF, MODOS_PORTADA_3D, MODOS_INTRO, MODOS_INDICE, MODOS_BLOQUES, MODOS_CLAVES,
  MODOS_ORDEN, MODOS_FUENTES,
} from './guiaModos.js'
import { anota } from './crm.js'

// ── El fondo: la máscara y el «AI» en ASCII, como la bio ───────────────────
const TROZOS = mascara.split(/(@+)/)
export function Fondo() {
  return (
    <div className="aip-fondo" aria-hidden="true">
      <pre className="aip-ascii ai">{aiArte}</pre>
      <pre className="aip-ascii mascara">
        {TROZOS.map((t, i) => (t.startsWith('@') ? <span key={i} className="aip-ojo">{'█'.repeat(t.length)}</span> : t))}
      </pre>
      <div className="aip-lineas" />
    </div>
  )
}

// HELM, el sistema con el que operamos: crear cuenta o verlo. Sin muro: es
// gratis registrarse, y es justo lo que queremos que haga quien lee.
export function BloqueHelm({ donde }) {
  return (
    <aside className="aip-helm">
      <p className="aip-kicker"><Workflow size={13} /> HELM · el sistema de Silvestre AI</p>
      <h3>Opera a tus clientes con HELM</h3>
      <p>
        Redes, contenido y ventas de cada cliente en un solo panel, con agentes que trabajan solos y conectado a
        Claude. Sin suscripción: pagas por uso, con créditos de regalo al empezar.
      </p>
      <div className="aip-helm-btns">
        <a className="aip-btn pequeno" href={HELM_WEB} target="_blank" rel="noopener noreferrer" onClick={() => track('clic_cta', { donde: `aip-helm-web-${donde}` })}>
          Ver HELM <ExternalLink size={14} />
        </a>
        <a className="aip-btn sec pequeno" href={HELM_REGISTRO} target="_blank" rel="noopener noreferrer" onClick={() => track('clic_cta', { donde: `aip-helm-registro-${donde}` })}>
          Crea tu cuenta <ArrowRight size={14} />
        </a>
      </div>
    </aside>
  )
}

// La guía en PDF, anunciada donde se lee de Claude.
export function BannerNoNegociables({ donde }) {
  return (
    <Link className="aip-nn-banner" to={NN_RUTA} onClick={() => track('clic_cta', { donde: `aip-nn-${donde}` })}>
      <img src={NN_PORTADA_3D} alt="" width="900" height="900" loading="lazy" />
      <div>
        <p className="aip-kicker"><FileText size={13} /> Guía en PDF · miembros</p>
        <h3>Mis 8 <em>no negociables</em> con Claude</h3>
        <p>Cómo trabajo para que la IA haga el trabajo de verdad, y no solo te dé conversación. Composio, Skills, Loops, Modo plan, Subagentes, Hooks, el modelo correcto y Todo a GitHub.</p>
        <span className="aip-btn pequeno">Descárgala <ArrowRight size={14} /></span>
      </div>
    </Link>
  )
}

/** Lo que va al pie de un hilo, antes de «Volver»: la guía de los no
 *  negociables donde se lee de Claude (capítulos y skills). */
export function TrasHilo({ acceso, capitulo, post }) {
  return acceso && (capitulo || post) ? <BannerNoNegociables donde={capitulo ? 'capitulo' : 'skills'} /> : null
}

// ── La guía en PDF: los no negociables ──────────────────────────────────────
export function IndiceNN() {
  return (
    <section className="aip-card aip-indice">
      <h2>Qué hay dentro</h2>
      <ol className="aip-nn-indice">
        {NN_PUNTOS.map(p => <li key={p.n}><span className="aip-indice-item"><span>{p.n}</span><b>{p.nombre}</b></span></li>)}
      </ol>
    </section>
  )
}

function Descarga({ acceso, donde }) {
  return (
    <a
      className="aip-btn aip-descarga" href={NN_PDF} download
      onClick={() => { track('descarga', { recurso: 'no-negociables', donde }); anota(acceso?.id, 'AI para todo · descargó la guía Mis 8 no negociables (PDF)') }}
    >
      <Download size={18} /> Descargar el PDF
    </a>
  )
}

export function CuerpoNoNegociables({ acceso }) {
  return (
    <>
      <section className="aip-card aip-nn-listo">
        <p className="aip-kicker"><Check size={13} /> Lista para descargar</p>
        <h2>Toda tuya{acceso?.nombre ? <>, <em>{acceso.nombre}</em></> : null}</h2>
        <p>{NN_INTRO}</p>
        <Descarga acceso={acceso} donde="arriba" />
      </section>

      {NN_PUNTOS.map(p => (
        <section key={p.n} className="aip-skill aip-nn-punto">
          <p className="aip-skill-n"><span>{p.n}</span> {p.nombre}</p>
          <h2>{p.titulo}</h2>
          <p className="aip-historia aip-nn-frase">{p.frase}</p>
          <h3>Qué es</h3>
          <p className="aip-historia"><Rico texto={p.que} /></p>
          <h3>Ejemplo</h3>
          <p className="aip-nn-ejemplo"><Rico texto={p.ejemplo} /></p>
          <h3>Cómo empezar</h3>
          <ol className="aip-cap-pasos">
            {p.pasos.map((x, k) => <li key={k}><span>{k + 1}</span><div><p><Rico texto={x} /></p></div></li>)}
          </ol>
          <aside className="aip-aviso ojo"><AlertTriangle size={18} /><div><b>Ojo</b><p>{p.ojo}</p></div></aside>
          <p className="aip-nn-donde">Dónde: {p.donde}</p>
        </section>
      ))}

      <section className="aip-card aip-resumen">
        <h2>Si estás empezando, en este orden</h2>
        <table>
          <tbody>{NN_ORDEN.map(o => <tr key={o.cuando}><td>{o.cuando}</td><td>{o.que}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="aip-card aip-nn-final">
        <h2>Llévatela en PDF</h2>
        <p>Los 8 puntos en siete páginas, para tenerlos a mano mientras trabajas. Y la guía completa de Claude, capítulo a capítulo, en esta misma sección.</p>
        <div className="aip-fila">
          <Descarga acceso={acceso} donde="abajo" />
          <Link className="aip-btn sec" to="/aiparatodo/guia/capitulos">Ir a la guía completa <ArrowRight size={16} /></Link>
        </div>
      </section>
    </>
  )
}

// ── La guía principal en PDF: los Mods de Claude ────────────────────────────
export function IndiceModos() {
  return (
    <section className="aip-card aip-indice">
      <h2>Qué hay dentro</h2>
      <ol className="aip-nn-indice">
        {MODOS_INDICE.map(p => <li key={p.n}><span className="aip-indice-item"><span>{p.n}</span><b>{p.nombre}</b></span></li>)}
      </ol>
    </section>
  )
}

function DescargaModos({ acceso, donde }) {
  return (
    <a
      className="aip-btn aip-descarga" href={MODOS_PDF} download
      onClick={() => { track('descarga', { recurso: 'modos-de-claude', donde }); anota(acceso?.id, 'AI para todo · descargó la guía Los Mods de Claude (PDF)') }}
    >
      <Download size={18} /> Descargar el PDF
    </a>
  )
}

export function CuerpoGuiaModos({ acceso }) {
  return (
    <>
      <section className="aip-card aip-nn-listo">
        <p className="aip-kicker"><Check size={13} /> Lista para descargar</p>
        <h2>Toda tuya{acceso?.nombre ? <>, <em>{acceso.nombre}</em></> : null}</h2>
        <p>{MODOS_INTRO}</p>
        <DescargaModos acceso={acceso} donde="arriba" />
      </section>

      <IndiceCapitulo c={{ bloques: MODOS_BLOQUES }} enlaces />
      <article className="aip-capitulo">
        {MODOS_BLOQUES.map((b, i) => <Bloque key={i} b={b} i={i} />)}
      </article>

      <section className="aip-card aip-claves">
        <h2>Lo que te llevas</h2>
        <ul>{MODOS_CLAVES.map((x, k) => <li key={k}><Check size={16} /><span><Rico texto={x} /></span></li>)}</ul>
      </section>

      <section className="aip-card aip-resumen">
        <h2>Por dónde empezar</h2>
        <table>
          <tbody>{MODOS_ORDEN.map(o => <tr key={o.cuando}><td>{o.cuando}</td><td>{o.que}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="aip-fuentes">
        <h3>Fuentes oficiales</h3>
        <ul>
          {MODOS_FUENTES.map(f => (
            <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.texto} <ExternalLink size={12} /></a></li>
          ))}
        </ul>
      </section>

      <section className="aip-card aip-nn-final">
        <h2>Llévatela en PDF</h2>
        <p>Toda la guía en limpio, con los prompts, para tenerla a mano mientras montas tus Mods.</p>
        <div className="aip-fila">
          <DescargaModos acceso={acceso} donde="abajo" />
          <Link className="aip-btn sec" to={NN_RUTA}>Y mis 8 no negociables <ArrowRight size={16} /></Link>
        </div>
      </section>
    </>
  )
}

// ── El cuerpo de un post de skills ──────────────────────────────────────────
export function CuerpoPost({ p }) {
  const n = p.skills.length
  return (
    <>
      <section className="aip-card aip-indice">
        <h2>Qué vas a encontrar</h2>
        <ol>
          {p.skills.map(s => (
            <li key={s.clave}><a href={`#${s.clave}`}><span>{s.n}</span><b>{s.nombre}</b> — {s.corto}</a></li>
          ))}
        </ol>
        <p className="aip-nota">{p.nota || `Las ${n} son gratis. Solo necesitas Claude Code.`}</p>
      </section>

      {p.skills.map(s => (
        <section key={s.clave} id={s.clave} className="aip-skill">
          <p className="aip-skill-n"><span>{s.n}</span> {s.clave}</p>
          <h2>{s.titular}</h2>
          <p className="aip-historia">{s.historia}</p>
          <h3>Qué puedes hacer</h3>
          <ul className="aip-puedes">{s.puedes.map(x => <li key={x}>{x}</li>)}</ul>

          {s.github && (
            <div className="aip-repo">
              <Github size={16} />
              <div>
                <code>{s.repo || 'anthropics/skills'} · {s.clave}</code>
                <small>{s.oficial === false ? `De la comunidad · ${s.autor}` : 'Skill oficial de Anthropic'}{s.licencia ? ` · ${s.licencia}` : ''}</small>
              </div>
              <a className="aip-btn sec pequeno" href={s.github} target="_blank" rel="noopener noreferrer">Ver en GitHub <ArrowRight size={14} /></a>
            </div>
          )}

          {s.suelta && (
            <Codigo
              titulo={s.sueltaTitulo || 'Instalar solo esta skill'}
              nota={s.sueltaNota || 'En tu terminal. La copia a ~/.claude/skills y Claude Code la usa sola cuando toca (si lo tenías abierto, reinícialo).'}
              texto={s.suelta}
            />
          )}

          <div className="aip-ejemplos">
            {s.ejemplos.map(e => <Prompt key={e.titulo} {...e} />)}
          </div>
        </section>
      ))}

      {p.instalarTodo && (
        <section className="aip-skill aip-bonus">
          <p className="aip-skill-n"><span>+</span> {p.tipo === 'mcp' ? 'conectar' : 'bonus'}</p>
          <h2>{p.tipo === 'mcp' ? 'Cómo se conecta' : 'Todas de una vez'}</h2>
          <p className="aip-historia">{p.instalarTodo.explica}</p>
          <Codigo titulo={p.instalarTodo.titulo || (p.tipo === 'mcp' ? 'La URL del conector' : 'Instalar en Claude Code')} texto={p.instalarTodo.comando} />
        </section>
      )}

      <section className="aip-card aip-resumen">
        <h2>Resumen rápido</h2>
        <table>
          <thead><tr><th>#</th><th>{p.tipo === 'mcp' ? 'Qué' : p.tipo === 'repo' ? 'Apartado' : 'Skill'}</th><th>Para qué</th></tr></thead>
          <tbody>
            {p.skills.map(s => <tr key={s.clave}><td>{s.n}</td><td>{s.github ? <a href={s.github} target="_blank" rel="noopener noreferrer">{s.nombre}</a> : s.nombre}</td><td>{s.corto}</td></tr>)}
          </tbody>
        </table>
      </section>
    </>
  )
}
