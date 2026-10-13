// AI PARA TODO — s4sf.net/aiparatodo
//
// La comunidad de Alex, desde el botón principal de la bio. La pinta el motor
// de las comunidades (src/pages/comunidad/Comunidad.jsx) con su configuración
// (./config.jsx); su contenido está en los archivos de esta carpeta.
import Comunidad from '../comunidad/Comunidad.jsx'
import AIPT from './config.jsx'

export default function AIParaTodo() {
  return <Comunidad config={AIPT} />
}
