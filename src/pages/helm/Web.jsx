// HELM — la web pública del producto: lo que ve quien entra en helm.s4sf.net
// sin sesión (con sesión, Raiz en main.jsx le manda a /admin).
//
// Una sola página y cuatro preguntas, en este orden: qué es y para quién, cómo
// funciona, qué cuesta y por dónde se entra. Todo lo que nombra existe en el
// panel (ver src/helm/permisos.js → SECCIONES): aquí no se promete nada que no
// esté hecho, ni hay testimonios ni cifras de clientes.
//
// Los packs los decide el servidor (GET /api/creditos?action=packs). Si no
// contesta, la sección de precios explica el modelo igual, sin las cifras.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './web.css'

const PASOS = [
  {
    titulo: 'Crea tu agencia',
    texto: 'Te registras con el nombre de tu agencia y entras directo al panel, con créditos de bienvenida para probar la IA desde el primer día.',
  },
  {
    titulo: 'Da de alta a cada cliente',
    texto: 'Cada cliente es un perfil con su CRM, su onboarding y su equipo. Invitas a closers, setters o editores y cada uno ve solo las secciones que le tocan.',
  },
  {
    titulo: 'El contenido se mueve solo',
    texto: 'Los agentes escriben guiones a partir de creadores de referencia y los programan en el calendario. El vídeo grabado se sube a la carpeta de entrada de Drive y HELM lo ordena en su sitio.',
  },
  {
    titulo: 'Mide y ajusta',
    texto: 'El informe de contenido trae las métricas de Instagram del perfil y estudia qué tienen las piezas que funcionan, para decidir qué grabar la semana siguiente.',
  },
]

// Secciones reales del panel, con su nombre del menú.
const SECCIONES = [
  ['CRM', 'Pipeline por etapas, ficha de contacto y actividad. Los formularios públicos meten los leads directamente.'],
  ['Onboarding', 'Las respuestas del cliente y su Biblia: el contexto que leen los agentes.'],
  ['Agentes', 'Agentes de IA y creadores de referencia de cada perfil.'],
  ['Roadmap', 'El plan a seis meses, mes a mes y semana a semana, con los guiones de cada día.'],
  ['Informe de contenido', 'Métricas de Instagram y el estudio de qué funciona.'],
  ['Ventas y finanzas', 'Reporte de ventas, ingresos, gastos y comisiones.'],
  ['Documentos', 'Presupuestos y facturas.'],
  ['Equipo', 'Personas, pagos y permisos por rol.'],
  ['Scraper', 'Leads de cinco fuentes al embudo.'],
  ['Conector de Claude', 'Un enlace para tu agencia: trabaja con todos tus clientes desde Claude.'],
]

const num = (v) => Number(v).toLocaleString('es-ES', { useGrouping: 'always' })

export default function Web() {
  const [precios, setPrecios] = useState(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/creditos?action=packs')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && Array.isArray(d?.packs)) setPrecios(d) })
      .catch(() => { /* sin cifras: la sección se pinta igual */ })
    return () => { vivo = false }
  }, [])

  return (
    <div className="hw">
      <header className="hw-cab">
        <Link to="/" className="hw-marca">
          <img src="/assets/logos/helm-mark.svg" alt="" />
          <span>HELM</span>
        </Link>
        <nav className="hw-cab-acc">
          <Link to="/login" className="hw-btn hw-btn--sec">Entrar</Link>
          <Link to="/registro" className="hw-btn">Crear cuenta</Link>
        </nav>
      </header>

      <main>
        <section className="hw-hero">
          <p className="hw-eti">Para agencias y freelancers</p>
          <h1>Así operamos a nuestros clientes. Usa el mismo sistema para operar a los tuyos.</h1>
          <p className="hw-lead">
            HELM es el panel con el que en Silvestre AI llevamos las redes, las ventas y el
            contenido de nuestros clientes: CRM, guiones y calendario automáticos, métricas de
            Instagram y agentes de IA. Ahora puedes crear tu agencia y gestionar a tus clientes con él.
          </p>
          <div className="hw-ctas">
            <Link to="/registro" className="hw-btn hw-btn--xl">Crear cuenta</Link>
            <Link to="/login" className="hw-btn hw-btn--xl hw-btn--sec">Entrar</Link>
          </div>
          <p className="hw-nota">Sin suscripción. Pagas solo lo que usa la IA.</p>
        </section>

        <section className="hw-bloque">
          <h2>Cómo funciona</h2>
          <ol className="hw-pasos">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="hw-card">
                <span className="hw-num">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="hw-bloque">
          <h2>Lo que hay dentro</h2>
          <p className="hw-sub">Las mismas secciones que usamos a diario, para cada uno de tus clientes.</p>
          <dl className="hw-secciones">
            {SECCIONES.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="hw-bloque" id="precios">
          <h2>Pago por uso, con créditos</h2>
          <p className="hw-sub">
            No hay cuota mensual. Compras créditos por adelantado y se gastan cuando la IA de HELM
            trabaja: en el panel, en el contenido automático o cuando el conector de Claude le pide
            a HELM que use su IA. Lo que Claude haga con tu propia cuenta no gasta créditos.
          </p>
          <ul className="hw-claves">
            <li><b>1 €</b> = 100 créditos</li>
            <li>
              {precios?.bienvenida
                ? <><b>{num(precios.bienvenida)}</b> créditos de regalo al registrarte</>
                : <>Créditos de regalo al registrarte</>}
            </li>
            <li>Sin cuota ni permanencia</li>
          </ul>
          {precios?.packs?.length > 0 && (
            <div className="hw-packs">
              {precios.packs.map(p => (
                <div key={p.id} className="hw-card hw-pack">
                  <span className="hw-pack-eur">{num(p.euros)} €</span>
                  <span className="hw-pack-cr">{num(p.creditos)} créditos</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="hw-final hw-card">
          <h2>Empieza con tu primer cliente</h2>
          <p>Crea la cuenta, da de alta a un cliente y prueba el sistema con los créditos de bienvenida.</p>
          <div className="hw-ctas">
            <Link to="/registro" className="hw-btn hw-btn--xl">Crear cuenta</Link>
            <Link to="/login" className="hw-btn hw-btn--xl hw-btn--sec">Ya tengo cuenta</Link>
          </div>
        </section>
      </main>

      <footer className="hw-pie">HELM · hecho por Silvestre AI</footer>
    </div>
  )
}
