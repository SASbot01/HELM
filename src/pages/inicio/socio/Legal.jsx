// /privacidad y /aviso-legal — lo mínimo para que el formulario pueda pedir
// datos. Los datos del titular NO se inventan: van con <Pendiente siempre>,
// que se ve también en producción (una página legal sin titular es peor que
// una que dice claramente que falta). [REVISAR] el texto entero con quien
// lleve lo legal.
import Pendiente from './Pendiente.jsx'
import Pie from './Pie.jsx'
import { useFuentesSocio } from './fuentes.js'
import { useCabeceraPublica } from '../cabecera.js'
import './socio.css'

const P = ({ children }) => <Pendiente siempre>{children}</Pendiente>

function Privacidad() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <h2>Quién trata tus datos</h2>
      <p>Alex Silvestre · NIF <P>NIF</P> · <P>domicilio</P> · <P>correo de contacto</P>.</p>
      <h2>Qué datos y para qué</h2>
      <p>
        Los que escribes en los formularios de esta web: nombre, correo, Instagram y
        tus respuestas sobre tu negocio. Los uso para valorar si encajas en Socio IA,
        contactarte sobre la auditoría y, si pides la clase gratis, enviártela y
        avisarte de las siguientes.
      </p>
      <p>
        También guardo de qué enlace llegaste (parámetros de campaña) para saber qué
        publicaciones funcionan.
      </p>
      <h2>Base legal</h2>
      <p>Tu consentimiento, que das al marcar la casilla del formulario.</p>
      <h2>Cuánto tiempo</h2>
      <p>Hasta que pidas que los borre o dejen de ser necesarios para lo anterior.</p>
      <h2>Con quién se comparten</h2>
      <p>
        Con nadie para fines comerciales. Se guardan en mi herramienta de gestión de
        clientes y, si reservas llamada, en el calendario de reservas. <P>proveedores y ubicación de los servidores</P>
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes pedir ver, corregir, borrar o llevarte tus datos, u oponerte a su uso,
        escribiendo a <P>correo de contacto</P>. Si crees que no se ha respetado tu
        derecho, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
      </p>
    </>
  )
}

function AvisoLegal() {
  return (
    <>
      <h1>Aviso legal</h1>
      <p>
        Esta web (s4sf.net) es de Alex Silvestre · NIF <P>NIF</P> · <P>domicilio</P> ·
        contacto: <P>correo de contacto</P>.
      </p>
      <h2>Condiciones de uso</h2>
      <p>
        Los contenidos de esta web son informativos. Las condiciones de Socio IA se
        cierran por escrito con cada negocio antes de empezar.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>Los textos, imágenes y vídeos de esta web son de su titular salvo que se indique lo contrario.</p>
    </>
  )
}

export default function Legal({ pagina }) {
  useFuentesSocio()
  const titulo = pagina === 'privacidad' ? 'Política de privacidad — Alex Silvestre' : 'Aviso legal — Alex Silvestre'
  useCabeceraPublica({ titulo, descripcion: titulo, imagen: '/socio/og.jpg', colorBarra: '#0a0a0c' })
  return (
    <div className="so">
      <main className="so-legal">
        <a className="so-volver" href="/">← Volver</a>
        {pagina === 'privacidad' ? <Privacidad /> : <AvisoLegal />}
      </main>
      <Pie />
    </div>
  )
}
